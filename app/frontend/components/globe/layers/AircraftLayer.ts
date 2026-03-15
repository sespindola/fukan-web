import {
  BillboardCollection,
  Cartesian3,
  Color,
  Math as CesiumMath,
  NearFarScalar,
  type Viewer,
} from 'cesium'
import type { FukanEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'

/**
 * Imperative layer manager for aircraft positions.
 * Uses BillboardCollection (Primitive API) — NOT Entity API.
 */
export class AircraftLayer {
  private viewer: Viewer
  private billboards: BillboardCollection
  private billboardMap = new Map<string, number>()

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.billboards = viewer.scene.primitives.add(new BillboardCollection({
      scene: viewer.scene,
    }))
  }

  update(aircraft: Map<string, FukanEvent>): void {
    // Track which IDs are still present
    const activeIds = new Set<string>()

    for (const [id, event] of aircraft) {
      activeIds.add(id)
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        event.alt,
      )

      const existingIndex = this.billboardMap.get(id)
      if (existingIndex !== undefined) {
        const billboard = this.billboards.get(existingIndex)
        billboard.position = position
        billboard.rotation = CesiumMath.toRadians(-event.hdg)
      } else {
        const billboard = this.billboards.add({
          position,
          image: '/icons/aircraft.png',
          rotation: CesiumMath.toRadians(-event.hdg),
          scale: 0.5,
          color: Color.WHITE,
          scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.2),
          translucencyByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.4),
        })
        this.billboardMap.set(id, this.billboards.length - 1)
      }
    }

    // Remove stale billboards by rebuilding if needed
    if (activeIds.size < this.billboardMap.size) {
      this.rebuild(aircraft)
    }
  }

  private rebuild(aircraft: Map<string, FukanEvent>): void {
    this.billboards.removeAll()
    this.billboardMap.clear()

    for (const [id, event] of aircraft) {
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        event.alt,
      )
      this.billboards.add({
        position,
        image: '/icons/aircraft.png',
        rotation: CesiumMath.toRadians(-event.hdg),
        scale: 0.5,
        color: Color.WHITE,
        scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.2),
        translucencyByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.4),
      })
      this.billboardMap.set(id, this.billboards.length - 1)
    }
  }

  destroy(): void {
    this.viewer.scene.primitives.remove(this.billboards)
  }
}
