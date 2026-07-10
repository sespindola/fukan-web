import { useEffect } from 'react'
import type { Viewer } from 'cesium'
import { useGlobeStore } from '~/stores/globeStore'
import { h3ResolutionForHeight, viewportToH3Cells } from '~/lib/h3'
import {
  isViewportSuspended,
  registerViewportCommitter,
} from '~/lib/viewportSuspension'

// Trailing debounce so fling-pans that emit several moveEnd events as Cesium's
// camera inertia settles produce exactly one viewport commit. Each distinct
// moveEnd today would resubscribe both AnyCable channels and trigger a
// rebootstrap; debouncing turns a 3–5-fire burst into one.
const MOVE_END_DEBOUNCE_MS = 200

/**
 * Subscribe to CesiumJS camera moveEnd events and update globeStore with
 * current camera state and viewport H3 cells. Debounced to collapse bursts
 * from camera inertia into a single viewport commit.
 */
export function useViewport(viewer: Viewer | null): void {
  useEffect(() => {
    if (!viewer) return

    let pending: ReturnType<typeof setTimeout> | null = null

    // Raw commit — always runs. Exposed via registerViewportCommitter so
    // callers exiting a suspended flow (see viewportSuspension) can force a
    // one-shot resync when the camera drifted during suspension.
    const doCommit = () => {
      if (viewer.isDestroyed()) return

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

    const commit = () => {
      pending = null
      // Checked at commit time (not schedule time) so a moveEnd that landed
      // mid-flow still gets filtered even if suspension was toggled between
      // schedule and fire.
      if (isViewportSuspended()) return
      doCommit()
    }

    const handler = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(commit, MOVE_END_DEBOUNCE_MS)
    }

    viewer.camera.moveEnd.addEventListener(handler)
    registerViewportCommitter(doCommit)
    // Fire once on mount so the initial viewport is registered immediately.
    commit()

    return () => {
      if (pending) clearTimeout(pending)
      registerViewportCommitter(null)
      // The Viewer may already be destroyed if a downstream component crashed
      // and React unmounted the GlobeView ancestor first. Touching a destroyed
      // viewer's `camera` getter throws, so guard with isDestroyed().
      if (!viewer.isDestroyed()) {
        viewer.camera.moveEnd.removeEventListener(handler)
      }
    }
  }, [viewer])
}
