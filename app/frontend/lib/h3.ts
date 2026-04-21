import { cellToChildren, cellToParent, getResolution, polygonToCells } from 'h3-js'
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

/**
 * Map a set of H3 cells onto their coverage at the target resolution.
 * Used by BGP subscription logic — the publisher broadcasts at res 3 only,
 * but the viewport can be at any resolution (2–7 from H3_RESOLUTION_BANDS).
 *
 *   cell.res > target → cellToParent  (subscribe to the coarser covering cell)
 *   cell.res = target → cell itself   (pass-through)
 *   cell.res < target → cellToChildren (fan out: one res-2 cell → 7 res-3 children)
 *
 * The third case matters at maximum zoom-out (res 2 band), where calling
 * cellToParent with a finer target throws "Cell arguments had incompatible
 * resolutions". Don't remove this without re-reading h3-js's contract.
 */
export function cellsToParents(cells: string[], targetResolution: number): string[] {
  const out = new Set<string>()
  for (const cell of cells) {
    const res = getResolution(cell)
    if (res >= targetResolution) {
      out.add(cellToParent(cell, targetResolution))
    } else {
      for (const child of cellToChildren(cell, targetResolution)) {
        out.add(child)
      }
    }
  }
  return [...out]
}

