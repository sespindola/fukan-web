require "digest"

module Telemetry
  class CachedViewportQuery
    include Callable

    CACHE_TTL = 3.seconds

    def initialize(h3_cells:, resolution:, asset_types: ViewportQuery::ALLOWED_ASSET_TYPES)
      @h3_cells = h3_cells
      @resolution = resolution
      @asset_types = Array(asset_types).map(&:to_s).sort
    end

    def call
      cache_key = build_cache_key

      cached = Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) do
        result = ViewportQuery.call(
          h3_cells: @h3_cells,
          resolution: @resolution,
          asset_types: @asset_types
        )
        return result if result.failure?

        result.value
      end

      Result.success(cached)
    end

    private

    # Bump the cache-key prefix to `vp:v2:` so stale entries from the
    # pre-asset_types rollout can't leak back through — payload shape has
    # effectively changed (rows now filtered by type) and staleness would
    # serve inconsistent bootstraps.
    def build_cache_key
      sorted = Array(@h3_cells).map(&:to_s).sort.join(",")
      hash = Digest::SHA256.hexdigest(sorted)[0..15]
      types = @asset_types.join(",")
      "vp:v2:#{@resolution}:#{types}:#{hash}"
    end
  end
end
