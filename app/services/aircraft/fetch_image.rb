module Aircraft
  class FetchImage
    include Callable

    PLANESPOTTERS_URL = "https://api.planespotters.net/pub/photos/hex"
    LOCK_TTL = 5.minutes
    NEGATIVE_CACHE_TTL = 7.days

    def initialize(icao24:)
      @icao24 = icao24.upcase
    end

    def self.available?
      Rails.configuration.x.r2_bucket.present?
    end

    def call
      unless self.class.available?
        Rails.logger.info("[Aircraft::FetchImage] #{@icao24}: R2 not configured, skipping")
        return Result.success(nil)
      end

      return Result.success(nil) if Rails.cache.exist?(negative_cache_key)

      lock_acquired = Rails.cache.write(lock_key, true, expires_in: LOCK_TTL, unless_exist: true)
      return Result.success(nil) unless lock_acquired

      begin
        if r2_object_exists?
          r2_url = r2_public_url
          write_to_clickhouse(r2_url, "")
          return Result.success(image_url: r2_url, image_attribution: "")
        end

        response = fetch_from_planespotters
        case response
        when :no_photo
          Rails.cache.write(negative_cache_key, true, expires_in: NEGATIVE_CACHE_TTL)
          return Result.success(nil)
        when :error
          return Result.success(nil)
        end

        image_data = download_image(response[:image_url])
        return Result.success(nil) unless image_data

        r2_url = upload_to_r2(image_data, response[:content_type])
        write_to_clickhouse(r2_url, response[:attribution])

        Result.success(
          image_url: r2_url,
          image_attribution: response[:attribution]
        )
      rescue => e
        Rails.logger.error("[Aircraft::FetchImage] #{@icao24}: #{e.message}")
        Result.failure(e.message)
      ensure
        Rails.cache.delete(lock_key)
      end
    end

    private

    def lock_key
      "aircraft_img_lock:#{@icao24}"
    end

    def negative_cache_key
      "aircraft_img_404:#{@icao24}"
    end

    def r2_object
      Rails.configuration.x.r2_bucket.object("aircraft/#{@icao24}.jpg")
    end

    def r2_object_exists?
      r2_object.exists?
    rescue => e
      Rails.logger.warn("[Aircraft::FetchImage] #{@icao24}: r2 head failed: #{e.message}")
      false
    end

    def r2_public_url
      "#{Rails.configuration.x.r2_public_url}/aircraft/#{@icao24}.jpg"
    end

    def fetch_from_planespotters
      uri = URI("#{PLANESPOTTERS_URL}/#{@icao24}")
      response = Net::HTTP.get_response(uri)

      case response
      when Net::HTTPNotFound
        return :no_photo
      when Net::HTTPSuccess
        # fall through to body parsing
      else
        Rails.logger.warn("[Aircraft::FetchImage] #{@icao24}: planespotters HTTP #{response.code}")
        return :error
      end

      data = JSON.parse(response.body)
      photo = data.dig("photos", 0)
      return :no_photo unless photo

      image_url = photo.dig("thumbnail_large", "src")
      return :no_photo if image_url.blank?

      attribution = photo["photographer"]
      { image_url:, attribution: attribution || "Unknown" }
    rescue JSON::ParserError, Net::OpenTimeout, Net::ReadTimeout, SocketError, Errno::ECONNREFUSED => e
      Rails.logger.warn("[Aircraft::FetchImage] #{@icao24}: planespotters #{e.class}: #{e.message}")
      :error
    end

    def download_image(url)
      uri = URI(url)
      response = Net::HTTP.get_response(uri)
      return nil unless response.is_a?(Net::HTTPSuccess)

      { body: response.body, content_type: response.content_type || "image/jpeg" }
    end

    def upload_to_r2(image_data, content_type)
      key = "aircraft/#{@icao24}.jpg"
      bucket = Rails.configuration.x.r2_bucket

      bucket.object(key).put(
        body: image_data[:body],
        content_type:,
        cache_control: "public, max-age=31536000"
      )

      "#{Rails.configuration.x.r2_public_url}/#{key}"
    end

    def write_to_clickhouse(image_url, attribution)
      escaped_url = Clickhouse.connection.quote_string(image_url)
      escaped_attr = Clickhouse.connection.quote_string(attribution)

      Clickhouse.connection.execute(<<~SQL)
        INSERT INTO fukan.aircraft_meta (icao24, image_url, image_attribution)
        VALUES ('#{Clickhouse.connection.quote_string(@icao24)}', '#{escaped_url}', '#{escaped_attr}')
      SQL
    end
  end
end
