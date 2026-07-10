module Telemetry
  class ViewportQuery
    include Callable

    MAX_CELLS = 2_000
    RESOLUTION_RANGE = (2..7)
    DETAIL_MIN_RESOLUTION = 2

    # Bootstrap row caps keyed on the requested resolution. Coarse zooms
    # (res 2 "continental") intentionally sample the most recent activity —
    # returning every asset in a busy viewport would mean megabytes of JSON
    # that blocks the main-thread parse for seconds before any billboard
    # renders. Live stream fills in the rest after bootstrap.
    DETAIL_LIMIT_BY_RESOLUTION = {
      2 => 500,
      3 => 2_000,
      4 => 5_000,
      5 => 5_000,
      6 => 10_000,
      7 => 10_000
    }.freeze

    ALLOWED_ASSET_TYPES = %w[aircraft vessel satellite].freeze

    def self.detail_limit_for(resolution)
      DETAIL_LIMIT_BY_RESOLUTION.fetch(resolution.to_i, 10_000)
    end

    def initialize(h3_cells:, resolution:, asset_types: ALLOWED_ASSET_TYPES)
      @h3_cells = Array(h3_cells).first(MAX_CELLS)
      @resolution = resolution.clamp(RESOLUTION_RANGE)
      @asset_types = Array(asset_types).map(&:to_s) & ALLOWED_ASSET_TYPES
      @asset_types = ALLOWED_ASSET_TYPES.dup if @asset_types.empty?
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
      # Column aliases MUST match the Go model.FukanEvent JSON tags
      # (see fukan-ingest internal/model/event.go). Any drift means the
      # bootstrap payload and the live-broadcast payload disagree on field
      # names, so frontend consumers like VesselDetailPanel /
      # SatelliteDetailPanel / computeOrbitPath silently read undefined.
      #
      # BGP events live in fukan.bgp_events with their own query service
      # (Bgp::ViewportQuery) and AnyCable channel (BgpEventsChannel) — they
      # do NOT flow through telemetry_latest_flat. The asset_type filter
      # below is defense in depth in case a bgp_node row ever leaks in.
      limit = self.class.detail_limit_for(@resolution)
      # @asset_types is allowlisted in initialize — interpolation is safe.
      types_list = @asset_types.map { |t| "'#{t}'" }.join(", ")

      # At the widest zoom (res 2, "continental"), filter on the materialized
      # h3_res2 column added by fukan-ingest migration 000009. That column is
      # keyed in telemetry_raw by a bloom_filter skipping index, which lets
      # ClickHouse prune granules — the plain h3ToParent predicate can't.
      # Other resolutions keep the existing predicate; adding one materialized
      # column per resolution would multiply insert-time work for little gain.
      #
      # Gated on FUKAN_USE_H3_RES2 because the h3_res2 column doesn't exist
      # until the ingest migration is applied AND telemetry_latest has had
      # a few minutes to re-populate the argMax state for every active asset.
      # Enable once both prerequisites are met.
      use_h3_res2 = ENV["FUKAN_USE_H3_RES2"] == "true"
      h3_predicate = if use_h3_res2 && @resolution.to_i == 2
        "h3_res2 IN (#{cells_list})"
      else
        "h3ToParent(h3_cell, #{@resolution.to_i}) IN (#{cells_list})"
      end

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
          source                               AS src,
          squawk,
          nav_status,
          toUInt32(imo_number)                  AS imo_number,
          ship_type,
          destination,
          toFloat64(draught)                    AS draught,
          toFloat64(rate_of_turn)               AS rate_of_turn,
          orbit_regime,
          toFloat64(inclination)               AS inclination,
          toFloat64(period_minutes)            AS period_minutes,
          toFloat64(apogee_km)                 AS apogee_km,
          toFloat64(perigee_km)                AS perigee_km,
          toUnixTimestamp64Milli(tle_epoch)    AS tle_epoch,
          confidence,
          sat_status
        FROM fukan.telemetry_latest_flat
        WHERE asset_type IN (#{types_list})
          AND #{h3_predicate}
        ORDER BY event_time DESC
        LIMIT #{limit.to_i}
      SQL

      rows.each do |row|
        row["h3"] = row.delete("h3_cell").to_i.to_s(16)
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
