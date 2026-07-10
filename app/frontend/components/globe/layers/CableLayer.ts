import {
  Cartesian3,
  Color,
  Material,
  PolylineCollection,
  type Viewer,
} from 'cesium'
import { decodeLat, decodeLon } from '~/lib/coords'
import type { CableSegment } from '~/types/telemetry'

// Solid cyan for every cable. Every CableSegment delivered by the backend
// has been validated (real OSM geometry, polyline-clears-land,
// landing-alignment) — there is no longer an "approximate" branch.
const CABLE_COLOR = Color.fromCssColorString('#55d6c2').withAlpha(0.55)

export class CableLayer {
  private viewer: Viewer
  private lines: PolylineCollection

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.lines = viewer.scene.primitives.add(new PolylineCollection())
  }

  update(segments: CableSegment[]): void {
    this.lines.removeAll()

    for (const segment of segments) {
      const positions = positionsFor(segment)
      if (positions.length < 2) continue

      this.lines.add({
        positions,
        width: 1.6,
        material: Material.fromType('Color', { color: CABLE_COLOR }),
        id: segment.id,
      })
    }

    this.viewer.scene.requestRender()
  }

  setVisible(visible: boolean): void {
    this.lines.show = visible
  }

  destroy(): void {
    this.viewer.scene.primitives.remove(this.lines)
  }
}

function positionsFor(segment: CableSegment): Cartesian3[] {
  const out: Cartesian3[] = []
  for (let i = 0; i + 1 < segment.coords.length; i += 2) {
    out.push(Cartesian3.fromDegrees(
      decodeLon(segment.coords[i + 1]),
      decodeLat(segment.coords[i]),
      0,
    ))
  }
  return out
}
