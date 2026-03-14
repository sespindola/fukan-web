import {
  PointPrimitiveCollection,
  PolylineCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  Material,
  HeightReference,
  type Viewer,
} from 'cesium'
import type { FukanEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'

const EVENT_COLORS: Record<string, Color> = {
  announcement: Color.GREEN,
  withdrawal: Color.YELLOW,
  hijack: Color.RED,
  leak: Color.ORANGE,
}

/**
 * Imperative layer manager for BGP events.
 * Uses PointPrimitiveCollection clamped to ground, with color by event type.
 */
export class BgpLayer {
  private viewer: Viewer
  private points: PointPrimitiveCollection
  private pointMap = new Map<string, number>()

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.points = viewer.scene.primitives.add(new PointPrimitiveCollection())
  }

  update(bgpEvents: Map<string, FukanEvent>): void {
    const activeIds = new Set<string>()

    for (const [id, event] of bgpEvents) {
      activeIds.add(id)
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        0,
      )

      const eventType = this.parseEventType(event.meta)
      const color = EVENT_COLORS[eventType] ?? Color.WHITE

      const existingIndex = this.pointMap.get(id)
      if (existingIndex !== undefined) {
        const point = this.points.get(existingIndex)
        point.position = position
        point.color = color
      } else {
        this.points.add({
          position,
          pixelSize: 6,
          color,
          scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.3),
        })
        this.pointMap.set(id, this.points.length - 1)
      }
    }

    if (activeIds.size < this.pointMap.size) {
      this.rebuild(bgpEvents)
    }
  }

  private parseEventType(meta: string): string {
    try {
      const parsed = JSON.parse(meta)
      return parsed.event_type ?? 'announcement'
    } catch {
      return 'announcement'
    }
  }

  private rebuild(bgpEvents: Map<string, FukanEvent>): void {
    this.points.removeAll()
    this.pointMap.clear()

    for (const [id, event] of bgpEvents) {
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        0,
      )
      const eventType = this.parseEventType(event.meta)
      const color = EVENT_COLORS[eventType] ?? Color.WHITE

      this.points.add({
        position,
        pixelSize: 6,
        color,
        scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.3),
      })
      this.pointMap.set(id, this.points.length - 1)
    }
  }

  destroy(): void {
    this.viewer.scene.primitives.remove(this.points)
  }
}
