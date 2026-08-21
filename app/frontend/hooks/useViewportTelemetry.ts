import { useEffect } from 'react'
import { useAggregateStore } from '~/stores/aggregateStore'
import { useGlobeStore } from '~/stores/globeStore'
import { useLayerStore } from '~/stores/layerStore'
import { useStreamStore } from '~/stores/streamStore'
import { useTrustStore } from '~/stores/trustStore'
import { useSelectionStore } from '~/stores/selectionStore'
import type { AssetType, TelemetryViewportSnapshot } from '~/types/telemetry'
import { aggregateModeForResolution } from '~/lib/telemetryMode'
import { perfMark } from '~/lib/perf'

const AGGREGATE_REFRESH_MS = 2_000
const MOVING_TYPES: readonly AssetType[] = ['aircraft', 'vessel', 'satellite']

function enabledTypes(): AssetType[] {
  const layers = useLayerStore.getState().layers
  return MOVING_TYPES.filter((type) => layers[type].visible)
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''
}

/** Load a timestamp-safe viewport snapshot independently from AnyCable. */
export function useViewportTelemetry(): void {
  useEffect(() => {
    let abort: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let mode: 'aggregate' | 'detail' | null = null
    let detailWaitStarted = 0

    const load = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      abort?.abort()

      const { viewportH3Cells: cells, viewportResolution: resolution } = useGlobeStore.getState()
      const assetTypes = enabledTypes()
      if (cells.length === 0 || assetTypes.length === 0) {
        useAggregateStore.getState().clear()
        useStreamStore.getState().clearAll()
        return
      }

      const nextMode = aggregateModeForResolution(resolution) ? 'aggregate' : 'detail'
      if (nextMode !== mode) {
        if (nextMode === 'aggregate') {
          useSelectionStore.getState().deselect()
          useStreamStore.getState().clearAll()
        } else {
          useAggregateStore.getState().clear()
        }
        mode = nextMode
        detailWaitStarted = 0
      }

      // Prefer registering live streams before reading the bootstrap so no
      // event can fall between the ClickHouse snapshot and WebSocket setup.
      // Fall back after 500 ms so a temporarily unavailable socket does not
      // prevent the source-of-truth snapshot from rendering.
      if (nextMode === 'detail' && useStreamStore.getState().connectionStatus !== 'connected') {
        detailWaitStarted ||= Date.now()
        if (Date.now() - detailWaitStarted < 500) {
          timer = setTimeout(load, 50)
          return
        }
      }

      abort = new AbortController()
      const requestedAt = performance.now()
      fetch('/api/telemetry', {
        method: 'POST',
        signal: abort.signal,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken(),
        },
        body: JSON.stringify({ cells, resolution, asset_types: assetTypes, mode: nextMode }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`viewport request failed: ${response.status}`)
          return response.json() as Promise<TelemetryViewportSnapshot>
        })
        .then((snapshot) => {
          perfMark('telemetry.viewport.received', {
            request_ms: performance.now() - requestedAt,
            rows: snapshot.mode === 'aggregate' ? snapshot.cells.length : snapshot.events.length,
          })
          if (snapshot.mode === 'aggregate') {
            useAggregateStore.getState().setCells(snapshot.cells, snapshot.resolution)
            timer = setTimeout(load, AGGREGATE_REFRESH_MS)
            return
          }

          useTrustStore.getState().setTelemetryBootstrap({
            stream: 'telemetry',
            row_count: snapshot.events.length,
            limit: snapshot.limit,
            sampled: snapshot.sampled,
            generated_at: snapshot.generated_at,
            cell_count: cells.length,
            resolution: snapshot.resolution,
            asset_types: assetTypes,
          })
          useStreamStore.getState().upsertBatch(snapshot.events)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          // Keep the existing snapshot during transient failures; the live
          // subscription remains authoritative in detail mode.
          if (import.meta.env.DEV && import.meta.env.VITE_PERF_LOGS === 'true') {
            console.warn('[telemetry] viewport load failed', error)
          }
          if (mode === 'aggregate') timer = setTimeout(load, AGGREGATE_REFRESH_MS)
        })
    }

    const reload = () => {
      detailWaitStarted = 0
      load()
    }

    const offGlobe = useGlobeStore.subscribe((state) => state._cellsSig, reload)
    const offLayers = useLayerStore.subscribe(
      (state) => MOVING_TYPES.map((type) => state.layers[type].visible).join(','),
      reload,
    )
    reload()

    return () => {
      abort?.abort()
      if (timer) clearTimeout(timer)
      offGlobe()
      offLayers()
    }
  }, [])
}
