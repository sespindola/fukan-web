import { useEffect, useRef } from 'react'
import type { Viewer } from 'cesium'
import { useGlobeStore } from '~/stores/globeStore'
import { h3ResolutionForHeight, viewportToH3Cells } from '~/lib/h3'

const DEBOUNCE_MS = 300

/**
 * Subscribe to CesiumJS camera changes and update globeStore with
 * current camera state and viewport H3 cells.
 */
export function useViewport(viewer: Viewer | null): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!viewer) return

    const handler = () => {
      if (timerRef.current) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
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
        if (rect) {
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
          useGlobeStore.getState().setH3Cells(cells.map((c) => BigInt(`0x${c}`)), resolution)
        }
      }, DEBOUNCE_MS)
    }

    viewer.camera.changed.addEventListener(handler)
    // Fire once on mount
    handler()

    return () => {
      viewer.camera.changed.removeEventListener(handler)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [viewer])
}
