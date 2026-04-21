import { useEffect, useRef } from 'react'
import { createConsumer, type Subscription } from '@rails/actioncable'
import { useStreamStore } from '~/stores/streamStore'
import { useBgpEventStore } from '~/stores/bgpEventStore'
import { useGlobeStore } from '~/stores/globeStore'
import { cellsToParents } from '~/lib/h3'
import type { FukanEvent, BgpEvent } from '~/types/telemetry'

const consumer = createConsumer()

// Resolution BGP events are broadcast at by fukan-ingest
// (internal/redis/publisher.go). Must stay in sync.
const BGP_SUBSCRIBE_RESOLUTION = 3

interface TelemetryBootstrap {
  type: 'bootstrap'
  resolution: number
  data: FukanEvent[]
}

interface BgpBootstrap {
  type: 'bootstrap'
  data: BgpEvent[]
}

function isTelemetryBootstrap(data: unknown): data is TelemetryBootstrap {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as TelemetryBootstrap).type === 'bootstrap'
  )
}

function isBgpBootstrap(data: unknown): data is BgpBootstrap {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as BgpBootstrap).type === 'bootstrap'
  )
}

/**
 * Manage AnyCable WebSocket subscriptions for live telemetry + BGP events.
 *
 * Two parallel channels:
 *   - TelemetryChannel streams aircraft/vessel/satellite events at the
 *     viewport's current H3 resolution band (2–7 depending on altitude).
 *   - BgpEventsChannel streams BGP events at a fixed coarse resolution
 *     (3) regardless of zoom, because BGP event coordinates are imprecise
 *     enough that zoom-band-precise subscriptions would be misleading.
 *
 * Both subscriptions recreate together on every viewport change so their
 * cell sets stay consistent during fast pans.
 */
export function useAnyCable(): void {
  const telemetryRef = useRef<Subscription | null>(null)
  const bgpRef = useRef<Subscription | null>(null)

  useEffect(() => {
    const unsubscribe = useGlobeStore.subscribe(
      (state) => ({ cells: state.viewportH3Cells, resolution: state.viewportResolution }),
      ({ cells, resolution }) => {
        telemetryRef.current?.unsubscribe()
        bgpRef.current?.unsubscribe()

        // Defensive cap so the ActionCable subscribe frame stays under
        // anycable-go's default 64 KB max_message_size. The H3 resolution
        // bands in types/globe.ts are tuned to keep polygonToCells under
        // ~1500 cells at any altitude, so this cap should almost never trip.
        // 2000 cells at ~20 bytes each ≈ 40 KB, comfortably under 64 KB.
        const MAX_SUBSCRIBE_CELLS = 2_000
        const cappedCells = cells.length > MAX_SUBSCRIBE_CELLS
          ? cells.slice(0, MAX_SUBSCRIBE_CELLS)
          : cells

        useStreamStore.getState().setConnectionStatus('connecting')

        telemetryRef.current = consumer.subscriptions.create(
          {
            channel: 'TelemetryChannel',
            h3_cells: cappedCells,
            resolution,
          },
          {
            connected() {
              useStreamStore.getState().setConnectionStatus('connected')
            },
            disconnected() {
              useStreamStore.getState().setConnectionStatus('disconnected')
            },
            rejected() {
              useStreamStore.getState().setConnectionStatus('disconnected')
            },
            received(data: unknown) {
              if (isTelemetryBootstrap(data)) {
                useStreamStore.getState().upsertBatch(data.data)
              } else if (Array.isArray(data)) {
                useStreamStore.getState().upsertBatch(data as FukanEvent[])
              } else {
                useStreamStore.getState().upsert(data as FukanEvent)
              }
            },
          },
        )

        // BGP: subscribe using res-3 parents of the current viewport. The
        // parent set is usually much smaller than the viewport at res 5+
        // and roughly matches at res 2–3.
        const bgpCells = cellsToParents(cappedCells, BGP_SUBSCRIBE_RESOLUTION)

        bgpRef.current = consumer.subscriptions.create(
          {
            channel: 'BgpEventsChannel',
            h3_cells: bgpCells,
          },
          {
            received(data: unknown) {
              if (isBgpBootstrap(data)) {
                useBgpEventStore.getState().upsertBatch(data.data)
              } else if (Array.isArray(data)) {
                useBgpEventStore.getState().upsertBatch(data as BgpEvent[])
              } else {
                useBgpEventStore.getState().upsert(data as BgpEvent)
              }
            },
          },
        )
      },
      { equalityFn: (a, b) => a.cells === b.cells && a.resolution === b.resolution },
    )

    return () => {
      unsubscribe()
      telemetryRef.current?.unsubscribe()
      bgpRef.current?.unsubscribe()
    }
  }, [])
}
