import {
  BillboardCollection,
  PolylineCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  Material,
  type Viewer,
  EllipseGeometry,
  GeometryInstance,
  GroundPrimitive,
  ColorGeometryInstanceAttribute,
  Math as CesiumMath,
} from 'cesium'
import type { FukanEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'
import { coverageRadiusMeters, SENSOR_HALF_ANGLES } from '~/lib/orbitMath'

/**
 * Imperative layer manager for satellite positions, orbit paths, and coverage footprints.
 * Satellites are rendered at true orbital altitude.
 *
 * - Billboards: satellite position at orbital height
 * - PolylineCollection: orbit paths (server-computed positions)
 * - GroundPrimitive: coverage footprint (EllipseGeometry draped on terrain)
 *
 * Coverage cones and orbit paths are only shown for the selected satellite.
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
          image: '/icons/satellite.png',
          scale: 0.4,
          color: Color.WHITE,
          scaleByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.3),
          translucencyByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.5),
        })
        this.billboardMap.set(id, this.billboards.length - 1)
      }
    }

    if (activeIds.size < this.billboardMap.size) {
      this.rebuild(satellites)
    }
  }

  /**
   * Show orbit path and coverage cone for a selected satellite.
   * @param id - Satellite NORAD ID, or null to clear
   * @param orbitPositions - Array of [lon, lat, alt] for orbit path
   */
  showDetails(
    id: string | null,
    orbitPositions?: [number, number, number][],
  ): void {
    // Clear previous
    this.orbitLines.removeAll()
    if (this.coveragePrimitive) {
      this.viewer.scene.primitives.remove(this.coveragePrimitive)
      this.coveragePrimitive = null
    }

    this.selectedId = id
    if (!id) return

    // Draw orbit path if positions provided
    if (orbitPositions && orbitPositions.length > 1) {
      const positions = orbitPositions.map(([lon, lat, alt]) =>
        Cartesian3.fromDegrees(lon, lat, alt),
      )
      this.orbitLines.add({
        positions,
        width: 1.5,
        material: Material.fromType('Color', {
          color: Color.CYAN.withAlpha(0.6),
        }),
      })
    }

    // Draw coverage footprint
    const event = this.findEvent(id)
    if (event) {
      const halfAngle = SENSOR_HALF_ANGLES.imaging_leo // default
      const radius = coverageRadiusMeters(event.alt, halfAngle)
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
            Color.CYAN.withAlpha(0.15),
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
    // Access from streamStore directly (outside React)
    const { useStreamStore } = require('~/stores/streamStore')
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
        image: '/icons/satellite.png',
        scale: 0.4,
        color: Color.WHITE,
        scaleByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.3),
        translucencyByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.5),
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
