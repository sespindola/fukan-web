import { useEffect, useRef } from 'react'
import { createConsumer, type Subscription } from '@rails/actioncable'
import { useStreamStore } from '~/stores/streamStore'
import { useGlobeStore } from '~/stores/globeStore'
import type { FukanEvent } from '~/types/telemetry'

const consumer = createConsumer()

interface BootstrapMessage {
  type: 'bootstrap'
  resolution: number
  data: FukanEvent[]
}

function isBootstrap(data: unknown): data is BootstrapMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as BootstrapMessage).type === 'bootstrap'
  )
}

/**
 * Manage AnyCable WebSocket connection for live telemetry.
 * Subscribes to telemetry channel filtered by current viewport H3 cells.
 * Handles bootstrap data (initial positions) and real-time streaming updates.
 */
export function useAnyCable(): void {
  const subscriptionRef = useRef<Subscription | null>(null)

  useEffect(() => {
    const unsubscribe = useGlobeStore.subscribe(
      (state) => ({ cells: state.viewportH3Cells, resolution: state.viewportResolution }),
      ({ cells, resolution }) => {
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe()
        }

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

        subscriptionRef.current = consumer.subscriptions.create(
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
              if (isBootstrap(data)) {
                useStreamStore.getState().upsertBatch(data.data)
              } else if (Array.isArray(data)) {
                useStreamStore.getState().upsertBatch(data as FukanEvent[])
              } else {
                useStreamStore.getState().upsert(data as FukanEvent)
              }
            },
          },
        )
      },
      { equalityFn: (a, b) => a.cells === b.cells && a.resolution === b.resolution },
    )

    return () => {
      unsubscribe()
      subscriptionRef.current?.unsubscribe()
    }
  }, [])
}
