import { useEffect, useRef } from 'react'
import { createConsumer, type Subscription } from '@rails/actioncable'
import { useStreamStore } from '~/stores/streamStore'
import { useGlobeStore } from '~/stores/globeStore'
import type { FukanEvent } from '~/types/telemetry'

const consumer = createConsumer()

/**
 * Manage AnyCable WebSocket connection for live telemetry.
 * Subscribes to telemetry channel filtered by current viewport H3 cells.
 */
export function useAnyCable(): void {
  const subscriptionRef = useRef<Subscription | null>(null)

  useEffect(() => {
    const unsubscribe = useGlobeStore.subscribe(
      (state) => state.viewportH3Cells,
      (cells: bigint[]) => {
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe()
        }

        const h3Strings = cells.map(String)

        subscriptionRef.current = consumer.subscriptions.create(
          {
            channel: 'TelemetryChannel',
            h3_cells: h3Strings,
          },
          {
            received(data: unknown) {
              if (Array.isArray(data)) {
                useStreamStore.getState().upsertBatch(data as FukanEvent[])
              } else {
                useStreamStore.getState().upsert(data as FukanEvent)
              }
            },
          },
        )
      },
    )

    return () => {
      unsubscribe()
      subscriptionRef.current?.unsubscribe()
    }
  }, [])
}
