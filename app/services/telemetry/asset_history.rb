module Telemetry
  class AssetHistory
    include Callable

    LIMIT = 10_000

    def initialize(asset_id:, asset_type:, since: 24.hours.ago)
      @asset_id = asset_id
      @asset_type = asset_type
      @since = since
    end

    def call
      rows = Clickhouse.connection.exec_query(<<~SQL).to_a
        SELECT
          event_time,
          lat,
          lon,
          alt,
          speed,
          heading
        FROM fukan.telemetry_raw
        WHERE asset_type = '#{Clickhouse.connection.quote_string(@asset_type)}'
          AND asset_id = '#{Clickhouse.connection.quote_string(@asset_id)}'
          AND event_time > '#{@since.utc.strftime('%Y-%m-%d %H:%M:%S')}'
        ORDER BY event_time ASC
        LIMIT #{LIMIT}
      SQL
      Result.success(rows)
    rescue => e
      Result.failure(e.message)
    end
  end
end
