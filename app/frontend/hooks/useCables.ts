import { useEffect } from 'react'
import type { Viewer } from 'cesium'
import { useCableStore } from '~/stores/cableStore'
import { useGlobeStore } from '~/stores/globeStore'
import { useLayerStore } from '~/stores/layerStore'
import { toDegrees } from '~/lib/coords'
import type { CableLayer } from '~/components/globe/layers/CableLayer'
import type { CableSegment } from '~/types/telemetry'

const CABLE_LIMIT = 2_000

export function useCables(viewer: Viewer | null, layer: CableLayer | null): void {
  useEffect(() => {
    if (!viewer || !layer) return

    let abort: AbortController | null = null

    const load = () => {
      const visible = useLayerStore.getState().layers.cables.visible
      layer.setVisible(visible)
      if (!visible) {
        viewer.scene.requestRender()
        return
      }

      const rect = viewer.camera.computeViewRectangle()
      if (!rect) return

      abort?.abort()
      abort = new AbortController()
      useCableStore.getState().setLoading()

      const params = new URLSearchParams({
        west: clampLon(toDegrees(rect.west)).toString(),
        south: clampLat(toDegrees(rect.south)).toString(),
        east: clampLon(toDegrees(rect.east)).toString(),
        north: clampLat(toDegrees(rect.north)).toString(),
        limit: CABLE_LIMIT.toString(),
      })

      fetch(`/api/cables?${params.toString()}`, { signal: abort.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`cables request failed: ${res.status}`)
          return res.json() as Promise<CableSegment[]>
        })
        .then((segments) => {
          useCableStore.getState().setSegments(segments)
          layer.update(segments)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          const message = err instanceof Error ? err.message : 'cables request failed'
          useCableStore.getState().setError(message)
        })
    }

    load()

    const offGlobe = useGlobeStore.subscribe(
      (state) => state._cellsSig,
      load,
    )
    const offLayers = useLayerStore.subscribe(
      (state) => state.layers.cables.visible,
      load,
    )

    return () => {
      abort?.abort()
      offGlobe()
      offLayers()
    }
  }, [viewer, layer])
}

function clampLat(value: number): number {
  return Math.max(-90, Math.min(90, value))
}

function clampLon(value: number): number {
  if (value > 180) return 180
  if (value < -180) return -180
  return value
}
