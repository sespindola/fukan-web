module Aircraft
  class FetchImage
    include Callable

    PLANESPOTTERS_URL = "https://api.planespotters.net/pub/photos/hex"

    def initialize(icao24:)
      @icao24 = icao24.upcase
    end

    def call
      response = fetch_from_planespotters
      return Result.success(nil) unless response

      image_data = download_image(response[:image_url])
      return Result.success(nil) unless image_data

      r2_url = upload_to_r2(image_data, response[:content_type])
      write_to_clickhouse(r2_url, response[:attribution])

      Result.success({
        image_url: r2_url,
        image_attribution: response[:attribution]
      })
    rescue => e
      Rails.logger.error("[Aircraft::FetchImage] #{@icao24}: #{e.message}")
      Result.failure(e.message)
    end

    private

    def fetch_from_planespotters
      uri = URI("#{PLANESPOTTERS_URL}/#{@icao24}")
      response = Net::HTTP.get_response(uri)
      return nil unless response.is_a?(Net::HTTPSuccess)

      data = JSON.parse(response.body)
      photo = data.dig("photos", 0)
      return nil unless photo

      image_url = photo.dig("thumbnail_large", "src")
      attribution = photo["photographer"]
      return nil unless image_url.present?

      { image_url:, attribution: attribution || "Unknown" }
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
