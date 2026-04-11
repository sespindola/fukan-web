import { useEffect } from 'react'
import type { Viewer } from 'cesium'
import { useGlobeStore } from '~/stores/globeStore'
import { h3ResolutionForHeight, viewportToH3Cells } from '~/lib/h3'

/**
 * Subscribe to CesiumJS camera moveEnd events and update globeStore with
 * current camera state and viewport H3 cells. moveEnd fires once when the
 * camera comes to rest after user input, so no debounce timer is needed.
 */
export function useViewport(viewer: Viewer | null): void {
  useEffect(() => {
    if (!viewer) return

    const handler = () => {
      const camera = viewer.camera
      const carto = camera.positionCartographic

      useGlobeStore.getState().setCamera({
        longitude: carto.longitude,
        latitude: carto.latitude,
        height: carto.height,
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll,
      })

      const rect = camera.computeViewRectangle()
      if (!rect) return

      const resolution = h3ResolutionForHeight(carto.height)
      const cells = viewportToH3Cells(
        {
          west: rect.west,
          south: rect.south,
          east: rect.east,
          north: rect.north,
        },
        resolution,
      )
      useGlobeStore.getState().setH3Cells(cells, resolution)
    }

    viewer.camera.moveEnd.addEventListener(handler)
    // Fire once on mount so the initial viewport is registered
    handler()

    return () => {
      // The Viewer may already be destroyed if a downstream component crashed
      // and React unmounted the GlobeView ancestor first. Touching a destroyed
      // viewer's `camera` getter throws, so guard with isDestroyed().
      if (!viewer.isDestroyed()) {
        viewer.camera.moveEnd.removeEventListener(handler)
      }
    }
  }, [viewer])
}
