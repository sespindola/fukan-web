module Cable
  class ViewportQuery
    include Callable

    DEFAULT_LIMIT = 1_000
    MAX_LIMIT = 5_000

    def initialize(west:, south:, east:, north:, limit: DEFAULT_LIMIT)
      @west = Float(west)
      @south = Float(south)
      @east = Float(east)
      @north = Float(north)
      @limit = [ Integer(limit || DEFAULT_LIMIT), MAX_LIMIT ].min
    end

    def call
      return Result.failure("invalid viewport") unless valid_viewport?

      Result.success(query_rows)
    rescue ArgumentError
      Result.failure("invalid viewport")
    rescue => e
      Result.failure(e.message)
    end

    private

    def valid_viewport?
      @south >= -90 && @south <= 90 &&
        @north >= -90 && @north <= 90 &&
        @west >= -180 && @west <= 180 &&
        @east >= -180 && @east <= 180 &&
        @south <= @north
    end

    # Shape must stay in sync with:
    #   fukan-ingest/internal/refresh/cables/types.go (CableRow)
    #   fukan-web/app/frontend/types/telemetry.ts (CableSegment)
    def query_rows
      south = scale(@south)
      north = scale(@north)
      west = scale(@west)
      east = scale(@east)

      lon_predicate = if west <= east
        "bbox_max_lon >= #{west} AND bbox_min_lon <= #{east}"
      else
        "(bbox_max_lon >= #{west} OR bbox_min_lon <= #{east})"
      end

      rows = Clickhouse.connection.exec_query(<<~SQL).to_a
        SELECT
          cable_id AS id,
          cable_id,
          name,
          slug,
          owners,
          status,
          rfs_year,
          length_km,
          medium,
          category,
          coords,
          provenance_source_urls,
          toString(updated_at) AS updated_at
        FROM fukan.cable_meta
        FINAL
        WHERE bbox_max_lat >= #{south}
          AND bbox_min_lat <= #{north}
          AND #{lon_predicate}
          AND length(coords) > 0
        ORDER BY cable_id
        LIMIT #{@limit}
      SQL

      rows.map do |row|
        h = row.to_h
        h["coords"] = normalize_coords(h["coords"])
        h["owners"] = normalize_string_array(h["owners"])
        h["provenance_source_urls"] = normalize_string_array(h["provenance_source_urls"])
        h["rfs_year"] = h["rfs_year"].to_i
        h["length_km"] = h["length_km"].to_i
        h
      end
    end

    def scale(value)
      (value * 10_000_000).round
    end

    def normalize_coords(value)
      return value if value.is_a?(Array)
      return [] if value.blank?

      value.to_s.scan(/-?\d+/).map(&:to_i)
    end

    def normalize_string_array(value)
      return value if value.is_a?(Array)
      return [] if value.blank?

      # ClickHouse Array(String) comes back as "['a','b','c']" via the HTTP
      # interface. Peel off the brackets and split on commas, stripping
      # surrounding quotes.
      value.to_s.sub(/\A\[/, "").sub(/\]\z/, "").scan(/'([^']*)'/).flatten
    end
  end
end
