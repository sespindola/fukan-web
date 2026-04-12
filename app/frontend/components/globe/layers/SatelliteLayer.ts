import {
  BillboardCollection,
  Cartesian3,
  Color,
  Material,
  NearFarScalar,
  PolylineCollection,
  type Viewer,
  EllipseGeometry,
  GeometryInstance,
  GroundPrimitive,
  ColorGeometryInstanceAttribute,
} from 'cesium'
import type { FukanEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'
import {
  computeOrbitPath,
  coverageRadiusMeters,
  getHalfAngle,
} from '~/lib/orbitMath'
import { useStreamStore } from '~/stores/streamStore'

/** Satellite layer tint — distinct from aircraft/vessel white billboards. */
const SAT_COLOR = Color.CYAN

/**
 * Imperative layer manager for satellite positions, orbit paths, and
 * coverage footprints. Satellites are rendered at true orbital altitude.
 *
 * - Billboards: satellite position at orbital height (pickable)
 * - PolylineCollection: inclined great-circle orbit approximation for the
 *   selected satellite. Not SGP4-accurate — see computeOrbitPath() in
 *   ~/lib/orbitMath for the model and its caveats.
 * - GroundPrimitive: estimated coverage footprint draped on terrain
 *
 * Orbit + coverage are only drawn for the selected satellite. Both
 * redraw automatically when the selected satellite's position updates
 * so the orbit stays anchored to the live billboard.
 */
export class SatelliteLayer {
  private viewer: Viewer
  private billboards: BillboardCollection
  private orbitLines: PolylineCollection
  private billboardMap = new Map<string, number>()
  private coveragePrimitive: GroundPrimitive | null = null
  private selectedId: string | null = null

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.billboards = viewer.scene.primitives.add(new BillboardCollection({
      scene: viewer.scene,
    }))
    this.orbitLines = viewer.scene.primitives.add(new PolylineCollection())
  }

  update(satellites: Map<string, FukanEvent>): void {
    const activeIds = new Set<string>()

    for (const [id, event] of satellites) {
      activeIds.add(id)
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        event.alt, // true orbital altitude in meters
      )

      const existingIndex = this.billboardMap.get(id)
      if (existingIndex !== undefined) {
        const billboard = this.billboards.get(existingIndex)
        billboard.position = position
      } else {
        this.billboards.add({
          position,
          image: '/icons/satellite.svg',
          scale: 0.6,
          color: SAT_COLOR,
          scaleByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.3),
          translucencyByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.5),
          id,
        })
        this.billboardMap.set(id, this.billboards.length - 1)
      }
    }

    if (activeIds.size < this.billboardMap.size) {
      this.rebuild(satellites)
    }

    // Refresh the orbit/coverage for the selected satellite if it just
    // received a new position. computeOrbitPath is cheap (~180 trig ops),
    // and this keeps the drawn orbit line anchored to the billboard even
    // as the satellite propagates around.
    if (this.selectedId && activeIds.has(this.selectedId)) {
      this.drawDetails(this.selectedId)
    }
  }

  /** Returns the NORAD id for a picked billboard, or null. */
  getPickedId(picked: unknown): string | null {
    if (!picked || typeof picked !== 'object') return null
    const obj = picked as { id?: string; collection?: unknown }
    if (obj.collection === this.billboards && typeof obj.id === 'string') {
      return obj.id
    }
    return null
  }

  /**
   * Mark a satellite as selected (or deselect). Draws the inclined
   * great-circle orbit approximation + estimated coverage footprint.
   * Both are ESTIMATES — see computeOrbitPath() and getHalfAngle().
   */
  showDetails(id: string | null): void {
    this.selectedId = id
    this.drawDetails(id)
  }

  /** Draw (or clear) orbit + cone for the given id. */
  private drawDetails(id: string | null): void {
    this.orbitLines.removeAll()
    if (this.coveragePrimitive) {
      this.viewer.scene.primitives.remove(this.coveragePrimitive)
      this.coveragePrimitive = null
    }

    if (!id) {
      this.viewer.scene.requestRender()
      return
    }

    const event = this.findEvent(id)
    if (!event) {
      this.viewer.scene.requestRender()
      return
    }

    // Orbit line — inclined great circle through current sub-satellite
    // point. Requires the satellite event to carry inclination (populated
    // by the Go TLE worker on every propagation).
    const orbitPositions = computeOrbitPath(event)
    if (orbitPositions && orbitPositions.length > 1) {
      this.orbitLines.add({
        positions: orbitPositions,
        width: 1.5,
        material: Material.fromType('Color', {
          color: SAT_COLOR.withAlpha(0.7),
        }),
      })
    }

    // Coverage footprint — classifier-estimated sensor half-angle +
    // 10° elevation mask (see coverageRadiusMeters / getHalfAngle).
    const { halfAngleDeg } = getHalfAngle(null, event)
    const radius = coverageRadiusMeters(event.alt, halfAngleDeg)
    if (radius > 0) {
      const center = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
      )
      const instance = new GeometryInstance({
        geometry: new EllipseGeometry({
          center,
          semiMajorAxis: radius,
          semiMinorAxis: radius,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(
            SAT_COLOR.withAlpha(0.15),
          ),
        },
      })
      this.coveragePrimitive = this.viewer.scene.primitives.add(
        new GroundPrimitive({ geometryInstances: instance }),
      )
    }

    this.viewer.scene.requestRender()
  }

  private findEvent(id: string): FukanEvent | undefined {
    // Read current telemetry directly from the stream store — this class
    // is driven imperatively, outside the React render cycle.
    return useStreamStore.getState().satellites.get(id)
  }

  private rebuild(satellites: Map<string, FukanEvent>): void {
    this.billboards.removeAll()
    this.billboardMap.clear()

    for (const [id, event] of satellites) {
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        event.alt,
      )
      this.billboards.add({
        position,
        image: '/icons/satellite.svg',
        scale: 0.6,
        color: Color.WHITE,
        scaleByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.3),
        translucencyByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.5),
        id,
      })
      this.billboardMap.set(id, this.billboards.length - 1)
    }
  }

  setVisible(visible: boolean): void {
    this.billboards.show = visible
    this.orbitLines.show = visible
    if (this.coveragePrimitive) {
      this.coveragePrimitive.show = visible
    }
  }

  destroy(): void {
    this.viewer.scene.primitives.remove(this.billboards)
    this.viewer.scene.primitives.remove(this.orbitLines)
    if (this.coveragePrimitive) {
      this.viewer.scene.primitives.remove(this.coveragePrimitive)
    }
  }
}
