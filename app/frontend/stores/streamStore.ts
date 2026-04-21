import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { FukanEvent } from '~/types/telemetry'

/**
 * WARNING: Updated at high frequency.
 * NEVER bind React components directly to this store.
 * Use zustand.subscribe() outside the render cycle for imperative CesiumJS updates.
 *
 * BGP events do NOT live here — they have their own store (bgpEventStore)
 * because they are event-stream data with different retention semantics
 * than moving-asset state.
 */
type ConnectionStatus = 'connected' | 'disconnected' | 'connecting'

interface StreamState {
  aircraft: Map<string, FukanEvent>
  vessels: Map<string, FukanEvent>
  satellites: Map<string, FukanEvent>
  connectionStatus: ConnectionStatus
  setConnectionStatus: (status: ConnectionStatus) => void
  upsert: (event: FukanEvent) => void
  upsertBatch: (events: FukanEvent[]) => void
}

type MapKey = 'aircraft' | 'vessels' | 'satellites'

function mapKeyForType(type: string): MapKey | undefined {
  switch (type) {
    case 'aircraft': return 'aircraft'
    case 'vessel': return 'vessels'
    case 'satellite': return 'satellites'
    default: return undefined
  }
}

export const useStreamStore = create<StreamState>()(
  subscribeWithSelector((set) => ({
    aircraft: new Map(),
    vessels: new Map(),
    satellites: new Map(),
    connectionStatus: 'connecting',
    setConnectionStatus: (status) => set({ connectionStatus: status }),

    upsert: (event) =>
      set((state) => {
        const key = mapKeyForType(event.type)
        if (!key) return state
        const next = new Map(state[key])
        next.set(event.id, event)
        return { ...state, [key]: next }
      }),

    upsertBatch: (events) =>
      set((state) => {
        const cloned: Partial<Record<MapKey, Map<string, FukanEvent>>> = {}

        for (const event of events) {
          const key = mapKeyForType(event.type)
          if (!key) continue

          if (!cloned[key]) {
            cloned[key] = new Map(state[key])
          }
          cloned[key]!.set(event.id, event)
        }

        return { ...state, ...cloned }
      }),
  })),
)
