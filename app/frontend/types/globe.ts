import type { Viewer } from 'cesium'
import type { AssetType } from './telemetry'

export interface CameraState {
  longitude: number // radians
  latitude: number // radians
  height: number // meters
  heading: number // radians
  pitch: number // radians
  roll: number // radians
}

export interface ViewportRect {
  west: number
  south: number
  east: number
  north: number
}

export interface LayerConfig {
  visible: boolean
  opacity: number
}

export type LayerMap = Record<AssetType, LayerConfig>

export interface GlobeRef {
  viewer: Viewer | null
}

/** H3 resolution mapping based on camera height */
export interface H3ResolutionBand {
  minHeight: number // meters
  maxHeight: number // meters
  resolution: number
}

// Bands are tuned so polygonToCells returns at most ~1500 cells at any
// altitude for a continent-sized viewport, keeping the ActionCable subscribe
// frame under anycable-go's 64 KB max_message_size. Measured cell counts for
// an Iberia/Med viewport (34,-10 to 44,15): res 2 = 27, res 3 = 185,
// res 4 = 1296, res 5 = 9068 — res 5 is too many, so continental zoom uses
// res 3 and only drops to res 5+ when the viewport is narrow enough.
export const H3_RESOLUTION_BANDS: H3ResolutionBand[] = [
  { minHeight: 5_000_000, maxHeight: Infinity, resolution: 2 },
  { minHeight: 1_500_000, maxHeight: 5_000_000, resolution: 3 },
  { minHeight: 300_000, maxHeight: 1_500_000, resolution: 4 },
  { minHeight: 50_000, maxHeight: 300_000, resolution: 5 },
  { minHeight: 5_000, maxHeight: 50_000, resolution: 6 },
  { minHeight: 0, maxHeight: 5_000, resolution: 7 },
]
