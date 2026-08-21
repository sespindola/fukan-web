require "digest"

module Telemetry
  # Read model for the browser's viewport bootstrap. Coarse viewports receive
  # fresh per-H3 counts; close viewports receive individual latest positions.
  class ViewportSnapshot
    include Callable

    AGGREGATE_MAX_RESOLUTION = 4
    CACHE_TTL = 1.second

    def initialize(h3_cells:, resolution:, asset_types: ViewportQuery::ALLOWED_ASSET_TYPES, mode: nil)
      @h3_cells = Array(h3_cells).first(ViewportQuery::MAX_CELLS).map(&:to_s)
      @resolution = Integer(resolution).clamp(ViewportQuery::RESOLUTION_RANGE)
      @asset_types = Array(asset_types).map(&:to_s) & ViewportQuery::ALLOWED_ASSET_TYPES
      @asset_types = ViewportQuery::ALLOWED_ASSET_TYPES.dup if @asset_types.empty?
      @mode = mode.to_s if %w[aggregate detail].include?(mode.to_s)
    end

    def call
      return Result.success(empty_payload) if @h3_cells.empty?

      cached = Rails.cache.read(cache_key)
      return Result.success(cached) if cached

      payload = aggregate? ? aggregate_payload : detail_payload
      return payload if payload.is_a?(Result)

      Rails.cache.write(cache_key, payload, expires_in: CACHE_TTL)
      Result.success(payload)
    rescue ArgumentError, TypeError
      Result.failure("invalid viewport")
    rescue => e
      Result.failure(e.message)
    end

    private

    def aggregate?
      return @mode == "aggregate" if @mode

      @resolution <= AGGREGATE_MAX_RESOLUTION
    end

    def empty_payload
      aggregate? ? aggregate_response([]) : detail_response([])
    end

    def detail_payload
      result = ViewportQuery.call(
        h3_cells: @h3_cells,
        resolution: @resolution,
        asset_types: @asset_types
      )
      return result if result.failure?

      detail_response(result.value)
    end

    def aggregate_payload
      cells = cells_as_uint64
      return aggregate_response([]) if cells.empty?

      types = @asset_types.map { |type| "'#{type}'" }.join(", ")
      rows = Clickhouse.connection.exec_query(<<~SQL).to_a
        SELECT
          h3ToParent(h3_cell, #{@resolution}) AS parent_h3,
          asset_type AS type,
          count() AS count,
          toUnixTimestamp64Milli(max(event_time)) AS latest_ts
        FROM fukan.telemetry_latest_flat
        WHERE h3ToParent(h3_cell, #{@resolution}) IN (#{cells.join(', ')})
          AND asset_type IN (#{types})
          AND (
            (asset_type = 'aircraft' AND event_time >= now() - INTERVAL 2 MINUTE) OR
            (asset_type = 'vessel' AND event_time >= now() - INTERVAL 15 MINUTE) OR
            (asset_type = 'satellite' AND event_time >= now() - INTERVAL 5 MINUTE)
          )
        GROUP BY parent_h3, asset_type
      SQL

      rows.each do |row|
        row["h3"] = row.delete("parent_h3").to_i.to_s(16)
        row["count"] = row["count"].to_i
        row["latest_ts"] = row["latest_ts"].to_i
      end
      aggregate_response(rows)
    end

    def detail_response(events)
      limit = ViewportQuery.detail_limit_for(@resolution)
      {
        mode: "detail",
        resolution: @resolution,
        generated_at: (Time.current.to_f * 1000).round,
        limit: limit,
        sampled: events.size >= limit,
        events: events
      }
    end

    def aggregate_response(cells)
      {
        mode: "aggregate",
        resolution: @resolution,
        generated_at: (Time.current.to_f * 1000).round,
        cells: cells
      }
    end

    def cells_as_uint64
      @h3_cells.map { |cell| cell.to_i(16) }.reject(&:zero?)
    end

    def cache_key
      cells = @h3_cells.sort.join(",")
      digest = Digest::SHA256.hexdigest(cells)[0, 16]
      "viewport-snapshot:v1:#{aggregate? ? 'aggregate' : 'detail'}:#{@resolution}:#{@asset_types.sort.join(',')}:#{digest}"
    end
  end
end
