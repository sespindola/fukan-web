module Telemetry
  class ViewportQuery
    include Callable

    MAX_CELLS = 500
    RESOLUTION_RANGE = (2..7)

    def initialize(h3_cells:, resolution:)
      @h3_cells = Array(h3_cells).first(MAX_CELLS)
      @resolution = resolution.clamp(RESOLUTION_RANGE)
    end

    def call
      return Result.success([]) if @h3_cells.empty?

      # v1: always return individual positions at all zoom levels (~6k aircraft is cheap).
      # Aggregate path (query_aggregate) deferred until H3 heatmap renderer is built.
      rows = query_detail
      Result.success(rows)
    rescue => e
      Result.failure(e.message)
    end

    private

    def query_detail
      cells_list = @h3_cells.map { |c| "toUInt64(#{c})" }.join(", ")

      Clickhouse.connection.exec_query(<<~SQL).to_a
        SELECT
          asset_id,
          asset_type,
          event_time,
          lat,
          lon,
          alt,
          speed,
          heading,
          h3_cell,
          source
        FROM fukan.telemetry_latest_flat
        WHERE h3ToParent(h3_cell, #{@resolution.to_i}) IN (#{cells_list})
      SQL
    end

    def query_aggregate
      cells_list = @h3_cells.map { |c| "toUInt64(#{c})" }.join(", ")

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
