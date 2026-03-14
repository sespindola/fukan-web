export type AssetType = 'aircraft' | 'vessel' | 'satellite' | 'bgp_node'

export interface FukanEvent {
  ts: number // Unix epoch milliseconds
  id: string // ICAO, MMSI, NORAD, ASN
  type: AssetType
  lat: number // Int32 (latitude * 10_000_000) — decode before display
  lon: number // Int32 (longitude * 10_000_000) — decode before display
  alt: number // meters
  spd: number // speed (knots or km/h depending on type)
  hdg: number // heading in degrees
  h3: string // H3 cell as hex string (BigInt in store)
  src: string // provider identifier
  meta: string // JSON blob, type-specific
}

export interface AssetDetail {
  id: string
  type: AssetType
  history: FukanEvent[]
  metadata: Record<string, unknown>
}
