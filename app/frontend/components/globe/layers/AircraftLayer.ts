import {
  Billboard,
  BillboardCollection,
  Cartesian3,
  Color,
  Math as CesiumMath,
  NearFarScalar,
  type Viewer,
} from 'cesium'
import { decodeLat, decodeLon } from '~/lib/coords'
import type { StreamDelta } from '~/stores/streamStore'

/**
 * Imperative layer manager for aircraft positions.
 * Uses BillboardCollection (Primitive API) — NOT Entity API.
 *
 * Consumes {changed, removed} deltas from streamStore per animation frame,
 * so layer work scales with what moved (typically dozens of events per
 * frame), not with total session history (which can reach tens of thousands).
 */
export class AircraftLayer {
  private viewer: Viewer
  private billboards: BillboardCollection
  private billboardMap = new Map<string, Billboard>()

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.billboards = viewer.scene.primitives.add(new BillboardCollection({
      scene: viewer.scene,
    }))
  }

  applyDelta(delta: StreamDelta): void {
    for (const id of delta.removed) {
      const existing = this.billboardMap.get(id)
      if (existing) {
        this.billboards.remove(existing)
        this.billboardMap.delete(id)
      }
    }

    for (const [id, event] of delta.changed) {
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        event.alt,
      )
      const rotation = CesiumMath.toRadians(-event.hdg)

      const existing = this.billboardMap.get(id)
      if (existing) {
        existing.position = position
        existing.rotation = rotation
      } else {
        const created = this.billboards.add({
          position,
          image: '/icons/aircraft.svg',
          rotation,
          scale: 1.0,
          color: Color.WHITE,
          scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.2),
          translucencyByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.4),
          id,
        })
        this.billboardMap.set(id, created)
      }
    }
  }

  /** Returns the icao24 id for a picked billboard, or null. */
  getPickedId(picked: unknown): string | null {
    if (!picked || typeof picked !== 'object') return null
    const obj = picked as { id?: string; collection?: unknown }
    if (obj.collection === this.billboards && typeof obj.id === 'string') {
      return obj.id
    }
    return null
  }

  setVisible(visible: boolean): void {
    this.billboards.show = visible
  }

  destroy(): void {
    this.viewer.scene.primitives.remove(this.billboards)
  }
}
