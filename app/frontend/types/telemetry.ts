export type AssetType = 'aircraft' | 'vessel' | 'satellite' | 'bgp_node'

export interface FukanEvent {
  ts: number // Unix epoch milliseconds
  id: string // ICAO, MMSI, NORAD, ASN
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
  imo?: number // IMO number (vessel only)
  ship_type?: string // vessel type classification
  destination?: string // reported destination port (vessel only)
  draught?: number // vessel draught in meters
  rot?: number // rate of turn, degrees/minute (vessel only)
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
