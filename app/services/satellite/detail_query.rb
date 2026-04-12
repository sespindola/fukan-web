module Satellite
  # Fetches catalog metadata for a single satellite from ClickHouse.
  #
  # The `fukan.satellite_meta` table is populated by fukan-ingest from the
  # GCAT satellite catalog (Jonathan McDowell's satcat.tsv). Rails is
  # read-only on this table; schema changes happen in the ingest repo.
  #
  # Note: full Keplerian elements (eccentricity, RAAN, argument of perigee,
  # mean anomaly) are *not* available from GCAT. The detail panel renders
  # catalog identity + physical parameters + an estimated coverage
  # footprint derived from current altitude + a name-pattern sensor
  # half-angle lookup. Precise orbit-ellipse rendering would require a
  # separate TLE-sourced orbital elements table — see PLAN.md Path B.
  class DetailQuery
    include Callable

    def initialize(norad_id:)
      @norad_id = norad_id.to_s.strip
    end

    def call
      return Result.failure("norad_id required") if @norad_id.empty?

      norad_int = Integer(@norad_id, 10)

      row = Clickhouse.connection.exec_query(<<~SQL).first
        SELECT
          toString(norad_cat_id)       AS norad_id,
          object_name                  AS name,
          object_type,
          status,
          owner                        AS operator,
          state                        AS country,
          toString(launch_date)        AS launch_date,
          toFloat64(mass_kg)           AS mass_kg,
          toFloat64(inclination)       AS inclination_deg,
          toFloat64(apogee_km)         AS apogee_km,
          toFloat64(perigee_km)        AS perigee_km
        FROM fukan.satellite_meta
        FINAL
        WHERE norad_cat_id = #{norad_int}
        LIMIT 1
      SQL

      return Result.failure("satellite not found") unless row

      Result.success(row.to_h)
    rescue ArgumentError
      Result.failure("norad_id must be numeric")
    rescue => e
      Result.failure(e.message)
    end
  end
end
