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

export const H3_RESOLUTION_BANDS: H3ResolutionBand[] = [
  { minHeight: 10_000_000, maxHeight: Infinity, resolution: 2 },
  { minHeight: 5_000_000, maxHeight: 10_000_000, resolution: 3 },
  { minHeight: 2_000_000, maxHeight: 5_000_000, resolution: 4 },
  { minHeight: 500_000, maxHeight: 2_000_000, resolution: 5 },
  { minHeight: 100_000, maxHeight: 500_000, resolution: 6 },
  { minHeight: 0, maxHeight: 100_000, resolution: 7 },
]
