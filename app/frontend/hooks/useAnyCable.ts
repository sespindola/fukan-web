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

        const h3Strings = cells.map(String)

        subscriptionRef.current = consumer.subscriptions.create(
          {
            channel: 'TelemetryChannel',
            h3_cells: h3Strings,
            resolution,
          },
          {
            received(data: unknown) {
              if (isBootstrap(data)) {
                useStreamStore.getState().replaceBatch(data.data)
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
