import {
  Cartesian3,
  Color,
  NearFarScalar,
  PointPrimitiveCollection,
  type Viewer,
} from 'cesium'
import { cellToLatLng } from 'h3-js'
import type { TelemetryAggregateCell } from '~/types/telemetry'

const COLORS = {
  aircraft: Color.fromCssColorString('#22d3ee'),
  vessel: Color.fromCssColorString('#60a5fa'),
  satellite: Color.fromCssColorString('#a78bfa'),
} as const

export class TelemetryDensityLayer {
  private viewer: Viewer
  private points: PointPrimitiveCollection

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.points = viewer.scene.primitives.add(new PointPrimitiveCollection())
  }

  update(cells: TelemetryAggregateCell[]): void {
    this.points.removeAll()
    for (const cell of cells) {
      const [lat, lon] = cellToLatLng(cell.h3)
      this.points.add({
        id: `aggregate:${cell.type}:${cell.h3}`,
        position: Cartesian3.fromDegrees(lon, lat, 0),
        pixelSize: Math.min(24, 4 + Math.log2(cell.count + 1) * 2),
        color: COLORS[cell.type].withAlpha(0.75),
        outlineColor: COLORS[cell.type].withAlpha(0.95),
        outlineWidth: 1,
        scaleByDistance: new NearFarScalar(1e5, 1.2, 2e7, 0.7),
      })
    }
    this.viewer.scene.requestRender()
  }

  setVisible(visible: boolean): void {
    this.points.show = visible
  }

  destroy(): void {
    this.viewer.scene.primitives.remove(this.points)
  }
}
