const EARTH_RADIUS_KM = 6371

/** Default sensor half-angles by satellite type (radians) */
export const SENSOR_HALF_ANGLES: Record<string, number> = {
  imaging_leo: (1.5 * Math.PI) / 180,
  communications_geo: (8.7 * Math.PI) / 180,
  weather_leo: (55 * Math.PI) / 180,
}

/**
 * Compute coverage footprint radius on the Earth's surface.
 *
 * θ = arcsin((R + h) * sin(α) / R) - α
 *
 * @param altitudeKm - Satellite altitude in kilometers
 * @param halfAngleRad - Sensor half-angle in radians
 * @returns Coverage radius in kilometers
 */
export function coverageRadiusKm(
  altitudeKm: number,
  halfAngleRad: number,
): number {
  const R = EARTH_RADIUS_KM
  const h = altitudeKm
  const alpha = halfAngleRad

  const sinTheta = ((R + h) * Math.sin(alpha)) / R
  if (sinTheta >= 1) {
    // Entire visible hemisphere
    return (Math.PI / 2) * R
  }

  const theta = Math.asin(sinTheta) - alpha
  return theta * R
}

/**
 * Compute coverage footprint radius in meters (for CesiumJS EllipseGeometry).
 */
export function coverageRadiusMeters(
  altitudeMeters: number,
  halfAngleRad: number,
): number {
  return coverageRadiusKm(altitudeMeters / 1000, halfAngleRad) * 1000
}
