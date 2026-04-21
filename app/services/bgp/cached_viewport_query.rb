require "digest"

module Bgp
  class CachedViewportQuery
    include Callable

    CACHE_TTL = 3.seconds

    def initialize(h3_cells:)
      @h3_cells = h3_cells
    end

    def call
      cache_key = build_cache_key

      cached = Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) do
        result = ViewportQuery.call(h3_cells: @h3_cells)
        return result if result.failure?

        result.value
      end

      Result.success(cached)
    end

    private

    # Cache key versioning: bump the prefix whenever ViewportQuery's
    # SELECT shape changes so old in-flight caches don't serve payloads
    # missing new fields. v2 adds prefix_as + prefix_org.
    def build_cache_key
      sorted = Array(@h3_cells).map(&:to_s).sort.join(",")
      hash = Digest::SHA256.hexdigest(sorted)[0..15]
      "bgp:v2:#{hash}"
    end
  end
end
