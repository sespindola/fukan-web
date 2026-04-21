// `bgp_node` stays in AssetType because it's used throughout the UI as a
// category: layer toggle (layerStore.layers.bgp_node), selection
// (selectionStore.selectedAssetType), and the globe click handler in
// GlobeView.tsx. It does NOT appear as FukanEvent.type — BGP data
// flows through BgpEvent, the bgp_events ClickHouse table, the
// fukan.bgp.events NATS subject, and the BgpEventsChannel AnyCable
// stream. See stores/bgpEventStore.ts.
export type AssetType = 'aircraft' | 'vessel' | 'satellite' | 'bgp_node'

export interface FukanEvent {
  ts: number // Unix epoch milliseconds
  id: string // ICAO, MMSI, NORAD
  type: AssetType
  callsign: string // flight callsign / vessel name / satellite designator
  origin: string // origin country, city, airport, port
  cat: string // wake class / vessel type / satellite regime
  lat: number // Int32 (latitude * 10_000_000) — decode before display
  lon: number // Int32 (longitude * 10_000_000) — decode before display
  alt: number // meters
  spd: number // speed (knots or km/h depending on type)
  hdg: number // heading in degrees
  vr: number // vertical rate, m/s, positive = climbing
  h3: string // H3 cell as hex string (BigInt in store)
  src: string // provider identifier
  squawk: string // transponder squawk code (aircraft only)
  nav_status?: string // vessel navigation status (under_way, at_anchor, moored, etc.)
  imo_number?: number // IMO number (vessel only)
  ship_type?: string // vessel type classification
  destination?: string // reported destination port (vessel only)
  draught?: number // vessel draught in meters
  rate_of_turn?: number // degrees/minute (vessel only)

  // Satellite-specific — populated by the TLE worker, carried on every
  // broadcast so the frontend can render orbit + coverage geometry
  // without waiting for a separate metadata fetch.
  inclination?: number // degrees
  orbit_regime?: string // 'leo' | 'meo' | 'geo' | 'heo'
  period_minutes?: number
  apogee_km?: number
  perigee_km?: number
  tle_epoch?: number // Unix epoch milliseconds of the TLE used to propagate
  confidence?: string // 'official' | 'community_derived' | 'stale'
  sat_status?: string // 'maneuvering' | 'decaying' | ''
}

/**
 * BGP routing event: a discrete announcement, withdrawal, hijack, or
 * route leak observed on the RIPE RIS Live stream. Unlike FukanEvent,
 * each BgpEvent is a one-time happening — there is no "latest BGP event
 * per ASN". See stores/bgpEventStore.ts for the bounded time-windowed
 * client store.
 *
 * SCHEMA DRIFT HAZARD: these field names MUST match the Go model.BgpEvent
 * struct `json:"..."` tags (fukan-ingest/internal/model/bgp_event.go)
 * AND the column aliases in Bgp::ViewportQuery
 * (app/services/bgp/viewport_query.rb). Drift means bootstrap and live
 * broadcast disagree on field names and BgpDetailPanel / BgpLayer
 * silently read undefined.
 */
export interface BgpEvent {
  ts: number // Unix epoch milliseconds
  id: string // fnv64 hash of (ts|prefix|category|originAS)
  cat: string // 'announcement' | 'withdrawal' | 'hijack' | 'leak'
  prefix: string // CIDR, e.g. '8.8.8.0/24'
  origin_as: number // AS currently announcing the prefix (from RIS Live)
  prefix_as: number // registered holder AS (GeoLite2-ASN prefix lookup); may differ from origin_as on hijacks
  prefix_org: string // registered holder org name; empty when MMDB has no record
  as_path: number[] // full AS-path hops
  path_coords: number[] // alternating scaled-Int32 lat/lon pairs, one per resolved hop
  collector: string // RIS collector ID, e.g. 'rrc00'
  lat: number // Int32 (latitude * 10_000_000)
  lon: number // Int32 (longitude * 10_000_000)
  h3: string // H3 cell as hex string (publisher-side res 7; broadcast at res 3)
  src: string // provider identifier, e.g. 'ris-live'
}

export interface AssetDetail {
  id: string
  type: AssetType
  history: FukanEvent[]
}

export interface AircraftMeta {
  icao24: string
  registration: string
  manufacturer_name: string
  model: string
  typecode: string
  icao_aircraft_type: string
  operator: string
  operator_callsign: string
  operator_icao: string
  operator_iata: string
  owner: string
  built: string
  status: string
  category_desc: string
  image_url: string
  image_attribution: string
}

/**
 * Satellite metadata sourced from fukan.satellite_meta (ClickHouse).
 *
 * These are the fields GCAT (Jonathan McDowell's satcat.tsv) actually
 * provides — identity, country/operator, launch, physical parameters,
 * apogee/perigee/inclination. Full Keplerian orientation (eccentricity,
 * RAAN, arg of perigee, mean anomaly) is NOT in GCAT and would require
 * a separate TLE-sourced table to enable precise orbit-ellipse rendering.
 */
export interface SatelliteMeta {
  norad_id: string
  name: string
  object_type: string // 'payload' | 'rocket body' | 'debris' | ...
  status: string // 'active' | 'decayed' | ...
  country: string
  operator: string
  launch_date: string
  mass_kg: number
  inclination_deg: number
  apogee_km: number
  perigee_km: number
}
