require "digest"

module Telemetry
  class CachedViewportQuery
    include Callable

    CACHE_TTL = 3.seconds

    def initialize(h3_cells:, resolution:)
      @h3_cells = h3_cells
      @resolution = resolution
    end

    def call
      cache_key = build_cache_key

      cached = Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) do
        result = ViewportQuery.call(h3_cells: @h3_cells, resolution: @resolution)
        return result if result.failure?

        result.value
      end

      Result.success(cached)
    end

    private

    def build_cache_key
      sorted = Array(@h3_cells).map(&:to_s).sort.join(",")
      hash = Digest::SHA256.hexdigest(sorted)[0..15]
      "vp:#{@resolution}:#{hash}"
    end
  end
end
