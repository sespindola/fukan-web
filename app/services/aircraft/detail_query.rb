module Aircraft
  class DetailQuery
    include Callable

    def initialize(icao24:)
      @icao24 = icao24.upcase
    end

    def call
      row = Clickhouse.connection.exec_query(<<~SQL).first
        SELECT
          icao24,
          registration,
          manufacturer_name,
          model,
          typecode,
          icao_aircraft_type,
          operator,
          operator_callsign,
          operator_icao,
          operator_iata,
          owner,
          built,
          status,
          category_desc,
          image_url,
          image_attribution
        FROM fukan.aircraft_meta
        FINAL
        WHERE icao24 = '#{Clickhouse.connection.quote_string(@icao24)}'
        LIMIT 1
      SQL

      return Result.failure("aircraft not found") unless row

      Result.success(row.to_h)
    rescue => e
      Result.failure(e.message)
    end
  end
end
