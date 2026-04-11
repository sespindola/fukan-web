module Telemetry
  class ViewportQuery
    include Callable

    MAX_CELLS = 2_000
    RESOLUTION_RANGE = (2..7)
    DETAIL_MIN_RESOLUTION = 3

    def initialize(h3_cells:, resolution:)
      @h3_cells = Array(h3_cells).first(MAX_CELLS)
      @resolution = resolution.clamp(RESOLUTION_RANGE)
    end

    def call
      return Result.success([]) if @h3_cells.empty?

      rows = @resolution >= DETAIL_MIN_RESOLUTION ? query_detail : query_aggregate
      Result.success(rows)
    rescue => e
      Result.failure(e.message)
    end

    private

    # H3 cells arrive as h3-js hex strings (matching h3-go Cell.String() on the
    # publisher side). ClickHouse stores h3_cell as UInt64, so each cell is
    # converted to its uint64 decimal representation before interpolation.
    # String#to_i(16) returns 0 for any non-hex input, which is safely filtered.
    def cells_as_uint64
      @cells_as_uint64 ||= @h3_cells
        .map { |c| c.to_s.to_i(16) }
        .reject(&:zero?)
    end

    # Returns rows in the FukanEvent JSON shape (see fukan-ingest model/event.go
    # and fukan-web/app/frontend/types/telemetry.ts) so bootstrap payloads
    # match the live-event shape that `streamStore.upsert` expects. Column
    # aliases map the ClickHouse column names to the Go struct's `json:` tags;
    # h3_cell is converted to the h3-js canonical lowercase hex string in Ruby
    # because ClickHouse's hex() pads UInt64 to 16 chars with a leading zero,
    # which does not match h3-go's Cell.String() 15-char output.
    def query_detail
      cells = cells_as_uint64
      return [] if cells.empty?

      cells_list = cells.join(", ")

      # Float32 columns (speed/heading/vertical_rate) are cast to Float64 in
      # SQL because clickhouse-activerecord has no native Float32 mapping and
      # returns those columns as Strings, which then break `toFixed` etc. on
      # the frontend. Int32 lat/lon/alt are cast to Int64 for the same reason.
      rows = Clickhouse.connection.exec_query(<<~SQL).to_a
        SELECT
          asset_id                             AS id,
          asset_type                           AS type,
          toUnixTimestamp64Milli(event_time)   AS ts,
          callsign,
          origin,
          category                             AS cat,
          toInt64(lat)                         AS lat,
          toInt64(lon)                         AS lon,
          toInt64(alt)                         AS alt,
          toFloat64(speed)                     AS spd,
          toFloat64(heading)                   AS hdg,
          toFloat64(vertical_rate)             AS vr,
          h3_cell,
          source                               AS src
        FROM fukan.telemetry_latest_flat
        WHERE h3ToParent(h3_cell, #{@resolution.to_i}) IN (#{cells_list})
      SQL

      rows.each do |row|
        row["h3"] = row.delete("h3_cell").to_i.to_s(16)
        row["meta"] = ""
      end
      rows
    end

    def query_aggregate
      cells = cells_as_uint64
      return [] if cells.empty?

      cells_list = cells.join(", ")

      Clickhouse.connection.exec_query(<<~SQL).to_a
        SELECT
          h3ToParent(h3_cell, #{@resolution.to_i}) AS cell,
          asset_type,
          sum(cnt) AS count
        FROM fukan.telemetry_h3_agg
        WHERE h3ToParent(h3_cell, #{@resolution.to_i}) IN (#{cells_list})
          AND time_bucket >= now() - INTERVAL 5 MINUTE
        GROUP BY cell, asset_type
      SQL
    end
  end
end
