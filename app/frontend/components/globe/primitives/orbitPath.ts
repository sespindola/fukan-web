import {
  Cartesian3,
  Color,
  Material,
  type PolylineCollection,
} from 'cesium'

/**
 * Add an orbit path polyline to a collection.
 *
 * @param collection - CesiumJS PolylineCollection to add to
 * @param positions - Array of [longitude, latitude, altitude] in degrees/meters
 * @param color - Polyline color
 * @param width - Polyline width in pixels
 */
export function addOrbitPath(
  collection: PolylineCollection,
  positions: [number, number, number][],
  color: Color = Color.CYAN.withAlpha(0.6),
  width: number = 1.5,
): void {
  if (positions.length < 2) return

  const cartesianPositions = positions.map(([lon, lat, alt]) =>
    Cartesian3.fromDegrees(lon, lat, alt),
  )

  collection.add({
    positions: cartesianPositions,
    width,
    material: Material.fromType('Color', { color }),
  })
}

/**
 * Reduce orbit path vertices for LOD at far zoom.
 * Keep every Nth point when camera is far from the orbit.
 */
export function lodReducePositions(
  positions: [number, number, number][],
  cameraHeight: number,
): [number, number, number][] {
  if (positions.length <= 10) return positions

  let step: number
  if (cameraHeight > 10_000_000) {
    step = 6 // keep every 6th point
  } else if (cameraHeight > 2_000_000) {
    step = 3
  } else {
    return positions // full resolution
  }

  const reduced: [number, number, number][] = []
  for (let i = 0; i < positions.length; i += step) {
    reduced.push(positions[i])
  }
  // Always include last point
  const last = positions[positions.length - 1]
  if (reduced[reduced.length - 1] !== last) {
    reduced.push(last)
  }
  return reduced
}
