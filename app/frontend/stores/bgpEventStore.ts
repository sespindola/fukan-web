import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { BgpEvent } from '~/types/telemetry'

/**
 * Bounded store for BGP routing events.
 *
 * BGP events are event-stream data (announcements / withdrawals / hijacks /
 * leaks). Each event is a one-time happening with a unique id, so the store
 * grows unboundedly unless evicted. We cap it two ways:
 *
 *   1. Time-window sweep: entries older than MAX_AGE_MS are dropped on
 *      every upsert. This matches the BgpEventsChannel bootstrap window
 *      (15 min) so the live view stays consistent with what a fresh
 *      page load would show.
 *
 *   2. Hard count cap: after the sweep, if the map still has more than
 *      MAX_BGP_EVENTS entries (hijack-storm burst outpacing the age sweep),
 *      the oldest-ts entries are dropped until under the cap. 3000 is a
 *      comfortable render budget for a PointPrimitiveCollection.
 *
 * Updated at high frequency during live streaming — NEVER bind React
 * components to this store directly. Use zustand.subscribe() outside the
 * render cycle for imperative CesiumJS updates (see BgpLayer).
 */

const MAX_BGP_EVENTS = 3_000
const MAX_AGE_MS = 15 * 60_000

interface BgpEventState {
  events: Map<string, BgpEvent>
  upsert: (event: BgpEvent) => void
  upsertBatch: (events: BgpEvent[]) => void
  clear: () => void
}

function prune(source: Map<string, BgpEvent>): Map<string, BgpEvent> {
  const cutoff = Date.now() - MAX_AGE_MS
  const next = new Map<string, BgpEvent>()
  for (const [id, e] of source) {
    if (e.ts >= cutoff) next.set(id, e)
  }
  if (next.size <= MAX_BGP_EVENTS) return next

  // Still over cap — drop oldest-by-ts until we're under it. Uncommon
  // under normal RIS traffic; kicks in during hijack-storm bursts.
  const sorted = [...next.entries()].sort((a, b) => a[1].ts - b[1].ts)
  const drop = sorted.length - MAX_BGP_EVENTS
  for (let i = 0; i < drop; i++) {
    next.delete(sorted[i][0])
  }
  return next
}

export const useBgpEventStore = create<BgpEventState>()(
  subscribeWithSelector((set) => ({
    events: new Map(),
    upsert: (event) =>
      set((state) => {
        const next = new Map(state.events)
        next.set(event.id, event)
        return { events: prune(next) }
      }),
    upsertBatch: (events) =>
      set((state) => {
        if (events.length === 0) return state
        const next = new Map(state.events)
        for (const e of events) next.set(e.id, e)
        return { events: prune(next) }
      }),
    clear: () => set({ events: new Map() }),
  })),
)
