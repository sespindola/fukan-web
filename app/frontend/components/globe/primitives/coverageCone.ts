import {
  Cartesian3,
  Color,
  PolylineCollection,
  Material,
} from 'cesium'
import { decodeLat, decodeLon, toRadians } from '~/lib/coords'
import { coverageRadiusMeters, SENSOR_HALF_ANGLES } from '~/lib/orbitMath'

const CONE_SEGMENTS = 16

/**
 * Build visual cone outline polylines from satellite position to footprint circle edge.
 * Returns positions arrays for each spoke of the cone.
 */
export function buildConeSpokes(
  satLonDeg: number,
  satLatDeg: number,
  satAltMeters: number,
  halfAngleRad: number = SENSOR_HALF_ANGLES.imaging_leo,
): Cartesian3[][] {
  const radiusMeters = coverageRadiusMeters(satAltMeters, halfAngleRad)
  const satPosition = Cartesian3.fromDegrees(satLonDeg, satLatDeg, satAltMeters)

  const spokes: Cartesian3[][] = []
  const centerLatRad = toRadians(satLatDeg)
  const centerLonRad = toRadians(satLonDeg)
  const angularRadius = radiusMeters / 6_371_000 // radians on Earth surface

  for (let i = 0; i < CONE_SEGMENTS; i++) {
    const bearing = (2 * Math.PI * i) / CONE_SEGMENTS

    // Compute point on footprint circle (great-circle math)
    const footprintLat = Math.asin(
      Math.sin(centerLatRad) * Math.cos(angularRadius) +
        Math.cos(centerLatRad) * Math.sin(angularRadius) * Math.cos(bearing),
    )
    const footprintLon =
      centerLonRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(centerLatRad),
        Math.cos(angularRadius) - Math.sin(centerLatRad) * Math.sin(footprintLat),
      )

    const footprintPosition = Cartesian3.fromRadians(
      footprintLon,
      footprintLat,
      0,
    )

    spokes.push([satPosition, footprintPosition])
  }

  return spokes
}

/**
 * Add cone spoke polylines to a PolylineCollection.
 */
export function addConeToCollection(
  collection: PolylineCollection,
  spokes: Cartesian3[][],
  color: Color = Color.CYAN.withAlpha(0.3),
): void {
  for (const positions of spokes) {
    collection.add({
      positions,
      width: 1,
      material: Material.fromType('Color', { color }),
    })
  }
}
