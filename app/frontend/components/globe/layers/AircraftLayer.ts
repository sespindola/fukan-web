import {
  BillboardCollection,
  Cartesian3,
  Color,
  Math as CesiumMath,
  NearFarScalar,
  PolylineCollection,
  Material,
  type Viewer,
} from 'cesium'
import type { FukanEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'
import { createAircraftIcon } from '~/lib/icons'

const SQUAWK_EMERGENCY = new Set(['7700', '7500'])
const SQUAWK_COMMS = new Set(['7600'])

const COLOR_DEFAULT = Color.fromCssColorString('#00e5ff')
const COLOR_EMERGENCY = Color.fromCssColorString('#ff1744')
const COLOR_COMMS = Color.fromCssColorString('#ff9100')

function squawkColor(meta: string): Color {
  if (!meta) return COLOR_DEFAULT
  try {
    const parsed = JSON.parse(meta)
    const squawk = parsed.squawk as string | undefined
    if (!squawk) return COLOR_DEFAULT
    if (SQUAWK_EMERGENCY.has(squawk)) return COLOR_EMERGENCY
    if (SQUAWK_COMMS.has(squawk)) return COLOR_COMMS
  } catch {
    // invalid JSON — ignore
  }
  return COLOR_DEFAULT
}

/**
 * Imperative layer manager for aircraft positions.
 * Uses BillboardCollection (Primitive API) — NOT Entity API.
 */
export class AircraftLayer {
  private viewer: Viewer
  private billboards: BillboardCollection
  private billboardMap = new Map<string, number>()
  private icon: HTMLCanvasElement
  private trailPolylines: PolylineCollection | null = null

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.icon = createAircraftIcon()
    this.billboards = viewer.scene.primitives.add(new BillboardCollection({
      scene: viewer.scene,
    }))
  }

  update(aircraft: Map<string, FukanEvent>): void {
    const activeIds = new Set<string>()

    for (const [id, event] of aircraft) {
      activeIds.add(id)
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        event.alt,
      )
      const color = squawkColor(event.meta)

      const existingIndex = this.billboardMap.get(id)
      if (existingIndex !== undefined) {
        const billboard = this.billboards.get(existingIndex)
        billboard.position = position
        billboard.rotation = CesiumMath.toRadians(-event.hdg)
        billboard.color = color
      } else {
        this.billboards.add({
          position,
          image: this.icon,
          rotation: CesiumMath.toRadians(-event.hdg),
          scale: 0.5,
          color,
          scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.2),
          translucencyByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.4),
          id,
        })
        this.billboardMap.set(id, this.billboards.length - 1)
      }
    }

    if (activeIds.size < this.billboardMap.size) {
      this.rebuild(aircraft)
    }
  }

  setVisible(visible: boolean): void {
    this.billboards.show = visible
    if (this.trailPolylines) {
      this.trailPolylines.show = visible
    }
  }

  showTrail(positions: { lat: number; lon: number; alt: number }[]): void {
    this.clearTrail()

    if (positions.length < 2) return

    const cartesians = positions.map((p) =>
      Cartesian3.fromDegrees(decodeLon(p.lon), decodeLat(p.lat), p.alt),
    )

    this.trailPolylines = this.viewer.scene.primitives.add(
      new PolylineCollection(),
    ) as PolylineCollection
    this.trailPolylines.add({
      positions: cartesians,
      width: 2.0,
      material: Material.fromType('Color', {
        color: Color.fromCssColorString('#00e5ff').withAlpha(0.7),
      }),
    })
  }

  clearTrail(): void {
    if (this.trailPolylines) {
      this.viewer.scene.primitives.remove(this.trailPolylines)
      this.trailPolylines = null
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
        image: this.icon,
        rotation: CesiumMath.toRadians(-event.hdg),
        scale: 0.5,
        color: squawkColor(event.meta),
        scaleByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.2),
        translucencyByDistance: new NearFarScalar(1e4, 1.0, 1e7, 0.4),
        id,
      })
      this.billboardMap.set(id, this.billboards.length - 1)
    }
  }

  destroy(): void {
    this.clearTrail()
    this.viewer.scene.primitives.remove(this.billboards)
  }
}
