import {
  PointPrimitiveCollection,
  PolylineCollection,
  Cartesian3,
  Color,
  Material,
  NearFarScalar,
  type Viewer,
} from 'cesium'
import type { BgpEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'
import { useBgpEventStore } from '~/stores/bgpEventStore'

const EVENT_COLORS: Record<string, Color> = {
  announcement: Color.GREEN,
  withdrawal: Color.YELLOW,
  hijack: Color.RED,
  leak: Color.ORANGE,
}

/**
 * Imperative layer manager for BGP events.
 *
 * - PointPrimitiveCollection: one ground-clamped point per event, colored
 *   by event category (announcement/withdrawal/hijack/leak).
 * - PolylineCollection: AS-path arc drawn for the selected event, hopping
 *   through whichever AS locations the server-side Geo cache resolved.
 *   Unknown hops are already dropped upstream.
 */
export class BgpLayer {
  private viewer: Viewer
  private points: PointPrimitiveCollection
  private pathLines: PolylineCollection
  private pointMap = new Map<string, number>()

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.points = viewer.scene.primitives.add(new PointPrimitiveCollection())
    this.pathLines = viewer.scene.primitives.add(new PolylineCollection())
  }

  update(bgpEvents: Map<string, BgpEvent>): void {
    const activeIds = new Set<string>()

    for (const [id, event] of bgpEvents) {
      activeIds.add(id)
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        0,
      )

      const color = EVENT_COLORS[event.cat] ?? Color.WHITE

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
          id,
        })
        this.pointMap.set(id, this.points.length - 1)
      }
    }

    if (activeIds.size < this.pointMap.size) {
      this.rebuild(bgpEvents)
    }
  }

  private rebuild(bgpEvents: Map<string, BgpEvent>): void {
    this.points.removeAll()
    this.pointMap.clear()

    for (const [id, event] of bgpEvents) {
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        0,
      )
      const color = EVENT_COLORS[event.cat] ?? Color.WHITE

      this.points.add({
        position,
        pixelSize: 6,
        color,
        scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.3),
        id,
      })
      this.pointMap.set(id, this.points.length - 1)
    }
  }

  /** Returns the BGP event id for a picked point, or null. */
  getPickedId(picked: unknown): string | null {
    if (!picked || typeof picked !== 'object') return null
    const obj = picked as { id?: string; collection?: unknown }
    if (obj.collection === this.points && typeof obj.id === 'string') {
      return obj.id
    }
    return null
  }

  /**
   * Draw (or clear) the AS-path polyline for the given id. Positions come
   * from `path_coords` — alternating scaled-Int32 lat/lon pairs, one
   * per resolved hop, computed server-side by the Go worker's Geo cache.
   * Unknown hops are already dropped upstream.
   */
  showDetails(id: string | null): void {
    this.pathLines.removeAll()

    if (!id) {
      this.viewer.scene.requestRender()
      return
    }

    const event = useBgpEventStore.getState().events.get(id)
    if (!event) {
      this.viewer.scene.requestRender()
      return
    }

    const positions = buildPathPositions(event)
    if (positions.length >= 2) {
      const color = EVENT_COLORS[event.cat] ?? Color.WHITE
      this.pathLines.add({
        positions,
        width: 2,
        material: Material.fromType('Color', {
          color: color.withAlpha(0.8),
        }),
      })
    }
    this.viewer.scene.requestRender()
  }

  clearDetails(): void {
    this.showDetails(null)
  }

  setVisible(visible: boolean): void {
    this.points.show = visible
    this.pathLines.show = visible
  }

  destroy(): void {
    this.viewer.scene.primitives.remove(this.points)
    this.viewer.scene.primitives.remove(this.pathLines)
  }
}

// buildPathPositions decodes path_coords (alternating scaled lat/lon,
// one pair per resolved hop) into Cartesian3 positions. Falls back to the
// event's own origin point if path_coords is missing or malformed.
function buildPathPositions(event: BgpEvent): Cartesian3[] {
  const coords = event.path_coords
  if (coords && coords.length >= 2 && coords.length % 2 === 0) {
    const positions: Cartesian3[] = []
    for (let i = 0; i < coords.length; i += 2) {
      positions.push(
        Cartesian3.fromDegrees(decodeLon(coords[i + 1]), decodeLat(coords[i]), 0),
      )
    }
    return positions
  }

  // Degenerate fallback: no resolved hops from upstream. Draw just the
  // origin point; showDetails() won't render a polyline with <2 positions,
  // but returning a non-empty array keeps the contract uniform.
  return [
    Cartesian3.fromDegrees(decodeLon(event.lon), decodeLat(event.lat), 0),
  ]
}
