/**
 * Coverage geometry + sensor classification for satellite footprints.
 *
 * Two constraints bound a real-world footprint, and the visible coverage
 * is the *smaller* of the two (whichever bites first):
 *
 *   1. Sensor FOV — how far off-nadir the sensor can look, parameterized
 *      by the sensor half-angle α. Narrow-FOV sensors (imaging optics)
 *      are limited here first.
 *
 *   2. User elevation mask — even with an unlimited-FOV sensor, signals
 *      grazing the horizon are atmospherically useless. A realistic
 *      "useful coverage" radius excludes anywhere the satellite is
 *      below ~10° elevation from the ground observer. Wide-FOV payloads
 *      (GEO comms, LEO constellations) are limited here first.
 *
 * Since we don't have per-satellite sensor specs, α is estimated from
 * a coarse classifier that keys off satellite name patterns + altitude.
 * Results should be surfaced as ESTIMATES in the UI.
 */

import { Cartesian3 } from 'cesium'
import type { FukanEvent, SatelliteMeta } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'

const EARTH_RADIUS_KM = 6371
const DEG2RAD = Math.PI / 180

/** User elevation mask in degrees — comms become unreliable below this. */
export const COVERAGE_ELEVATION_MASK_DEG = 10

/**
 * Compute coverage footprint radius on Earth's surface, accounting for
 * both sensor half-angle and the user elevation mask.
 *
 * Sensor-limited geocentric angle:
 *   θ_sensor = asin((R + h) × sin(α) / R) − α
 *
 * Elevation-masked geocentric angle (user must see sat above ε):
 *   θ_elevation = acos(R × cos(ε) / (R + h)) − ε
 *
 * Visible coverage takes min(θ_sensor, θ_elevation).
 */
export function coverageRadiusKm(
  altitudeKm: number,
  halfAngleDeg: number,
  elevationMaskDeg: number = COVERAGE_ELEVATION_MASK_DEG,
): number {
  const R = EARTH_RADIUS_KM
  const h = altitudeKm
  const alpha = halfAngleDeg * DEG2RAD
  const epsilon = elevationMaskDeg * DEG2RAD

  // Sensor-limited (wraps the asin if the sensor can see past the horizon)
  const sinArg = ((R + h) * Math.sin(alpha)) / R
  const thetaSensor = sinArg >= 1
    ? Math.PI / 2 // sensor can see full visible hemisphere
    : Math.asin(sinArg) - alpha

  // Elevation-masked — always well-defined for h > 0
  const thetaElevation = Math.acos((R * Math.cos(epsilon)) / (R + h)) - epsilon

  const theta = Math.max(0, Math.min(thetaSensor, thetaElevation))
  return theta * R
}

/** Same, in meters — convenient for CesiumJS EllipseGeometry. */
export function coverageRadiusMeters(
  altitudeMeters: number,
  halfAngleDeg: number,
  elevationMaskDeg: number = COVERAGE_ELEVATION_MASK_DEG,
): number {
  return coverageRadiusKm(altitudeMeters / 1000, halfAngleDeg, elevationMaskDeg) * 1000
}

export interface HalfAngleResult {
  /** Sensor half-angle in degrees. */
  halfAngleDeg: number
  /** Human-readable class label — surfaced in the UI. */
  label: string
  /**
   * How confident we are this classification is reasonable for the satellite.
   * `high`   — rule matches strongly (GEO altitude, known nav constellation)
   * `medium` — name pattern hit, typical values
   * `low`    — default fallback, no signal
   */
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Coarse sensor-half-angle classifier based on satellite name patterns and
 * altitude. These numbers are typical-case estimates, not ground truth —
 * real sensors vary, many payloads use spot beams rather than a single
 * cone, and classified missions are guesses. The UI must label outputs
 * as estimates.
 */
export function getHalfAngle(
  meta: SatelliteMeta | null,
  telemetry: FukanEvent,
): HalfAngleResult {
  const name = (meta?.name ?? telemetry.callsign ?? '').toUpperCase()
  const altKm = telemetry.alt / 1000

  // GEO altitude band — Earth-disc antennas, α matches geometric limb
  if (altKm > 30_000) {
    return { halfAngleDeg: 8.7, label: 'Comms GEO (Earth disc)', confidence: 'high' }
  }

  // Navigation constellations — Earth-coverage antennas from MEO
  if (/^(GPS|NAVSTAR|GALILEO|GSAT|GLONASS|KOSMOS|BEIDOU|COMPASS|QZSS)/.test(name)) {
    return { halfAngleDeg: 13.8, label: 'Navigation MEO', confidence: 'high' }
  }

  // Weather — wide-swath imagers
  if (/NOAA|GOES|METOP|HIMAWARI|FENGYUN|FY-?\d|DMSP|METEOSAT/.test(name)) {
    return { halfAngleDeg: 55, label: 'Weather LEO', confidence: 'medium' }
  }

  // Optical / SAR imaging — narrow FOV
  if (/LANDSAT|SENTINEL|WORLDVIEW|GEOEYE|QUICKBIRD|PLEIADES|SKYSAT|PLANET|ICEYE|TERRASAR|COSMO-?SKYMED|CAPELLA|RADARSAT/.test(name)) {
    return { halfAngleDeg: 3, label: 'Imaging LEO', confidence: 'medium' }
  }

  // Large LEO comms constellations — wide multi-beam payloads
  if (/STARLINK|ONEWEB|IRIDIUM|GLOBALSTAR|KUIPER|ORBCOMM|SWARM/.test(name)) {
    return { halfAngleDeg: 55, label: 'Comms LEO', confidence: 'medium' }
  }

  // ISS / crewed platforms — no useful sensor cone, use geometric horizon
  if (/^(ISS|ZARYA|TIANHE|MIR)/.test(name)) {
    return { halfAngleDeg: 90, label: 'Crewed station (horizon)', confidence: 'low' }
  }

  // Default LEO fallback
  return { halfAngleDeg: 45, label: 'LEO (estimated)', confidence: 'low' }
}

/**
 * Inclined great-circle approximation of a satellite's orbital plane.
 *
 * Given the current sub-satellite point (from live telemetry) and the
 * orbit's inclination (from TLE propagation), this builds a closed circle
 * in ECEF that:
 *   — passes exactly through the satellite's current position
 *   — has the correct tilt (inclination) relative to the equator
 *   — sits at a constant radius equal to |P|
 *
 * It is NOT a ground track and NOT an SGP4-accurate propagation. Earth
 * rotation, orbital eccentricity, and J2 perturbations are ignored. The
 * drawn path represents the *instantaneous orbital plane* — which matches
 * the mental model "the satellite orbits around Earth in this plane."
 * For highly elliptical orbits (Molniya, GTO) the circle diverges from
 * the true path as θ moves away from the satellite's current position.
 *
 * Precise orbit rendering would require a new TLE-sourced ClickHouse
 * table with full Keplerian elements (eccentricity, RAAN, arg of perigee,
 * mean anomaly) — see PLAN.md Path B.
 *
 * Math:
 *   Let P be the satellite ECEF position, U = P/|P|. Any unit vector N
 *   perpendicular to U can be written N = cos(ψ)·E + sin(ψ)·L where
 *   E = local east at the sub-satellite point and L = local north.
 *   We want the plane normal N to have angle i from Z-axis:
 *       N·Z = cos(i)   ⇒   sin(ψ)·cos(geocentric_lat) = cos(i)
 *       ⇒   sin(ψ) = cos(i) / cos(geocentric_lat)
 *   Feasible iff |cos(i)| ≤ cos(geocentric_lat), i.e. the satellite is
 *   below its inclination latitude. Two solutions for ψ correspond to
 *   the two orbits through P at inclination i (ascending/descending
 *   configurations); we pick the positive-cosine branch consistently.
 *   The orbit is then parameterized by θ ∈ [0, 2π] as |P|·(cos θ·U + sin θ·V)
 *   where V = N × U completes the orthonormal in-plane basis.
 *
 * @returns 181 Cartesian3 points (closed loop), or null if the inclination
 *   cannot reach the current latitude (bad data) or the satellite is
 *   essentially over a pole (degenerate basis).
 */
export function computeOrbitPath(
  event: FukanEvent,
  samples: number = 180,
): Cartesian3[] | null {
  // Explicit undefined check — inclination === 0 is a valid equatorial
  // (GEO) orbit and must not trigger the null return.
  if (event.inclination === undefined || event.inclination === null) return null

  const latDeg = decodeLat(event.lat)
  const lonDeg = decodeLon(event.lon)
  const iRad = event.inclination * DEG2RAD

  // Satellite position in ECEF — Cesium honors the WGS84 spheroid, so
  // this is exactly where the billboard is drawn.
  const P = Cartesian3.fromDegrees(lonDeg, latDeg, event.alt)
  const r = Cartesian3.magnitude(P)
  if (r === 0) return null

  // U = P̂ (unit vector from Earth center toward the satellite)
  const invR = 1 / r
  const Ux = P.x * invR
  const Uy = P.y * invR
  const Uz = P.z * invR

  // cos(geocentric latitude) = horizontal component magnitude of U
  const m = Math.sqrt(Ux * Ux + Uy * Uy)
  if (m < 1e-9) return null // degenerate: over the pole

  // Inclination feasibility — satellite can't be at a higher lat than
  // its orbit's inclination (mod equator). |cos(i)| ≤ cos(geocentric lat).
  const sinPsi = Math.cos(iRad) / m
  if (Math.abs(sinPsi) > 1) return null
  const cosPsi = Math.sqrt(1 - sinPsi * sinPsi)

  // Local east (E = Z × U / |Z × U|) — horizontal, z = 0
  const Ex = -Uy / m
  const Ey = Ux / m

  // Local north (L = U × E), z-component equals m
  const Lx = (-Uz * Ux) / m
  const Ly = (-Uz * Uy) / m
  const Lz = m

  // Plane normal N = cosψ·E + sinψ·L
  const Nx = cosPsi * Ex + sinPsi * Lx
  const Ny = cosPsi * Ey + sinPsi * Ly
  const Nz = sinPsi * Lz // E_z = 0

  // V = N × U, second orthonormal in-plane basis vector
  const Vx = Ny * Uz - Nz * Uy
  const Vy = Nz * Ux - Nx * Uz
  const Vz = Nx * Uy - Ny * Ux

  const positions: Cartesian3[] = new Array(samples + 1)
  for (let k = 0; k <= samples; k++) {
    const theta = (2 * Math.PI * k) / samples
    const ct = Math.cos(theta)
    const st = Math.sin(theta)
    positions[k] = new Cartesian3(
      r * (ct * Ux + st * Vx),
      r * (ct * Uy + st * Vy),
      r * (ct * Uz + st * Vz),
    )
  }
  return positions
}
