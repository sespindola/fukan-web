import {
  CustomDataSource,
  Cartesian3,
  Color,
  HeightReference,
  EntityCluster,
  type Viewer,
} from 'cesium'
import type { FukanEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'

/**
 * Imperative layer manager for news events.
 * Uses CustomDataSource with built-in EntityCluster for clustering.
 * Lower frequency than other layers — Entity API is acceptable here.
 */
export class NewsLayer {
  private viewer: Viewer
  private dataSource: CustomDataSource

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.dataSource = new CustomDataSource('news')

    this.dataSource.clustering = new EntityCluster({
      enabled: true,
      pixelRange: 45,
      minimumClusterSize: 3,
    })

    viewer.dataSources.add(this.dataSource)
  }

  update(newsEvents: Map<string, FukanEvent>): void {
    const existingIds = new Set(
      this.dataSource.entities.values.map((e) => e.id),
    )
    const incomingIds = new Set(newsEvents.keys())

    // Remove stale
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        this.dataSource.entities.removeById(id)
      }
    }

    // Upsert
    for (const [id, event] of newsEvents) {
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        0,
      )

      const existing = this.dataSource.entities.getById(id)
      if (existing) {
        existing.position = position as unknown as import('cesium').PositionProperty
      } else {
        this.dataSource.entities.add({
          id,
          position,
          point: {
            pixelSize: 8,
            color: Color.HOTPINK.withAlpha(0.8),
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        })
      }
    }

    this.viewer.scene.requestRender()
  }

  destroy(): void {
    this.viewer.dataSources.remove(this.dataSource, true)
  }
}
