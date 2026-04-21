module Bgp
  # Queries the append-only fukan.bgp_events table for BGP events whose H3 cell
  # (at resolution 7) rolls up to one of the given res-3 parent cells. Returns
  # the most recent events only (15-minute window, LIMIT 1000) — BGP is an
  # event stream, not long-lived asset state, so bounded recency is the right
  # retention model for bootstrap.
  #
  # SCHEMA DRIFT HAZARD: the column aliases below MUST match the `json:`
  # tags on fukan-ingest's model.BgpEvent struct and the BgpEvent TS
  # interface in app/frontend/types/telemetry.ts. Drift means bootstrap
  # payloads and live broadcasts disagree on field names.
  class ViewportQuery
    include Callable

    MAX_CELLS = 2_000
    BROADCAST_RESOLUTION = 3
    RECENT_WINDOW = "15 MINUTE".freeze
    MAX_ROWS = 1_000

    def initialize(h3_cells:)
      @h3_cells = Array(h3_cells).first(MAX_CELLS)
    end

    def call
      return Result.success([]) if @h3_cells.empty?

      rows = query_events
      Result.success(rows)
    rescue => e
      Result.failure(e.message)
    end

    private

    # H3 cells arrive as h3-js canonical hex strings (matching h3-go
    # Cell.String() on the publisher side). ClickHouse stores h3_cell as
    # UInt64. String#to_i(16) returns 0 on non-hex input, filtered out.
    def cells_as_uint64
      @cells_as_uint64 ||= @h3_cells
        .map { |c| c.to_s.to_i(16) }
        .reject(&:zero?)
    end

    def query_events
      cells = cells_as_uint64
      return [] if cells.empty?

      cells_list = cells.join(", ")

      rows = Clickhouse.connection.exec_query(<<~SQL).to_a
        SELECT
          event_id                              AS id,
          toUnixTimestamp64Milli(event_time)    AS ts,
          category                              AS cat,
          prefix,
          toUInt32(origin_as)                   AS origin_as,
          toUInt32(prefix_as)                   AS prefix_as,
          prefix_org,
          as_path,
          path_coords,
          collector,
          toInt64(lat)                          AS lat,
          toInt64(lon)                          AS lon,
          h3_cell,
          source                                AS src
        FROM fukan.bgp_events
        WHERE h3ToParent(h3_cell, #{BROADCAST_RESOLUTION}) IN (#{cells_list})
          AND event_time >= now() - INTERVAL #{RECENT_WINDOW}
        ORDER BY event_time DESC
        LIMIT #{MAX_ROWS}
      SQL

      rows.each do |row|
        row["h3"] = row.delete("h3_cell").to_i.to_s(16)
      end
      rows
    end
  end
end
