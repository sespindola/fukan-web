import { polygonToCells } from 'h3-js'
import { H3_RESOLUTION_BANDS } from '~/types/globe'
import type { ViewportRect } from '~/types/globe'

/**
 * Determine H3 resolution based on camera height in meters.
 */
export function h3ResolutionForHeight(heightMeters: number): number {
  for (const band of H3_RESOLUTION_BANDS) {
    if (heightMeters >= band.minHeight && heightMeters < band.maxHeight) {
      return band.resolution
    }
  }
  return 7 // default to finest
}

/**
 * Convert a viewport rectangle (in radians) to H3 cell set.
 */
export function viewportToH3Cells(
  rect: ViewportRect,
  resolution: number,
): string[] {
  const toDeg = (rad: number) => (rad * 180) / Math.PI

  const west = toDeg(rect.west)
  const south = toDeg(rect.south)
  const east = toDeg(rect.east)
  const north = toDeg(rect.north)

  // Build polygon ring in h3-js native [lat, lng] order (isGeoJson=false).
  // Passing isGeoJson=true would interpret the pairs as [lng, lat] and flip the
  // viewport across lat=lng, producing cells in the wrong hemisphere.
  const polygon: [number, number][] = [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
    [south, west],
  ]

  return polygonToCells(polygon, resolution, false)
}
