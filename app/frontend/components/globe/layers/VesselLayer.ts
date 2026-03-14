import {
  BillboardCollection,
  Cartesian3,
  Math as CesiumMath,
  NearFarScalar,
  HeightReference,
  type Viewer,
} from 'cesium'
import type { FukanEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'

/**
 * Imperative layer manager for vessel positions.
 * Uses BillboardCollection, clamped to ground surface.
 */
export class VesselLayer {
  private viewer: Viewer
  private billboards: BillboardCollection
  private billboardMap = new Map<string, number>()

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.billboards = viewer.scene.primitives.add(new BillboardCollection({
      scene: viewer.scene,
    }))
  }

  update(vessels: Map<string, FukanEvent>): void {
    const activeIds = new Set<string>()

    for (const [id, event] of vessels) {
      activeIds.add(id)
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        0,
      )

      const existingIndex = this.billboardMap.get(id)
      if (existingIndex !== undefined) {
        const billboard = this.billboards.get(existingIndex)
        billboard.position = position
        billboard.rotation = CesiumMath.toRadians(-event.hdg)
      } else {
        this.billboards.add({
          position,
          image: '/icons/vessel.png',
          rotation: CesiumMath.toRadians(-event.hdg),
          scale: 0.4,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.2),
          translucencyByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.4),
        })
        this.billboardMap.set(id, this.billboards.length - 1)
      }
    }

    if (activeIds.size < this.billboardMap.size) {
      this.rebuild(vessels)
    }
  }

  private rebuild(vessels: Map<string, FukanEvent>): void {
    this.billboards.removeAll()
    this.billboardMap.clear()

    for (const [id, event] of vessels) {
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        0,
      )
      this.billboards.add({
        position,
        image: '/icons/vessel.png',
        rotation: CesiumMath.toRadians(-event.hdg),
        scale: 0.4,
        heightReference: HeightReference.CLAMP_TO_GROUND,
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
