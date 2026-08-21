import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { cellToParent, getResolution, latLngToCell } from 'h3-js'
import { perfTime } from '~/lib/perf'
import type { FukanEvent } from '~/types/telemetry'

/**
 * WARNING: Updated at high frequency.
 * NEVER bind React components directly to this store.
 *
 * Imperative CesiumJS layers consume updates via subscribeDelta() (below).
 * They receive only the {changed, removed} delta between frames, so layer
 * update work scales with what actually moved, not with session history.
 *
 * Live events from AnyCable are coalesced into one delta per animation
 * frame — a single tick with 50 aircraft upserts produces exactly one layer
 * update, bounded to 60/s regardless of WS burst rate.
 *
 * BGP events do NOT live here — they have their own store (bgpEventStore)
 * because they are event-stream data with different retention semantics.
 */

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting'

interface StreamState {
  aircraft: Map<string, FukanEvent>
  vessels: Map<string, FukanEvent>
  satellites: Map<string, FukanEvent>
  connectionStatus: ConnectionStatus
  versions: Record<MapKey, number>
  setConnectionStatus: (status: ConnectionStatus) => void
  upsert: (event: FukanEvent) => void
  upsertBatch: (events: FukanEvent[]) => void
  // Drop any asset whose H3 cell (coarsened to `resolution`) is not in the
  // `cells` allowlist. Call on resubscribe so maps stay bounded by the
  // current viewport rather than growing across every pan. Flushes any
  // pending upserts first so the eviction sees the final steady state.
  evictOutsideCells: (cells: readonly string[], resolution: number) => void
  clearAll: () => void
}

type MapKey = 'aircraft' | 'vessels' | 'satellites'
const MAP_KEYS: readonly MapKey[] = ['aircraft', 'vessels', 'satellites']

function mapKeyForType(type: string): MapKey | undefined {
  switch (type) {
    case 'aircraft': return 'aircraft'
    case 'vessel': return 'vessels'
    case 'satellite': return 'satellites'
    default: return undefined
  }
}

function normalizeEvent(event: FukanEvent): FukanEvent {
  if (typeof event.h3 === 'string') return event
  return {
    ...event,
    h3: latLngToCell(event.lat / 10_000_000, event.lon / 10_000_000, 7),
  }
}

function queueLatest(event: FukanEvent): boolean {
  const normalized = normalizeEvent(event)
  const key = mapKeyForType(normalized.type)
  if (!key) return false
  const queued = pending[key].adds.get(normalized.id)
  const stored = useStreamStore.getState()[key].get(normalized.id)
  const previous = queued && (!stored || queued.ts >= stored.ts) ? queued : stored
  if (previous && previous.ts > normalized.ts) return false
  pending[key].adds.set(normalized.id, normalized)
  pending[key].removes.delete(normalized.id)
  return true
}

// ---------- Delta emission ----------

export interface StreamDelta {
  changed: Map<string, FukanEvent>
  removed: Set<string>
}

type DeltaListener = (delta: StreamDelta) => void

const deltaListeners: Record<MapKey, Set<DeltaListener>> = {
  aircraft: new Set(),
  vessels: new Set(),
  satellites: new Set(),
}

/**
 * Subscribe to per-type event deltas. Listeners are invoked once per animation
 * frame, with a combined delta of everything that changed since the last
 * frame. Returns an unsubscribe function.
 */
export function subscribeDelta(key: MapKey, listener: DeltaListener): () => void {
  deltaListeners[key].add(listener)
  return () => {
    deltaListeners[key].delete(listener)
  }
}

function emitDelta(key: MapKey, delta: StreamDelta): void {
  if (delta.changed.size === 0 && delta.removed.size === 0) return
  for (const listener of deltaListeners[key]) listener(delta)
}

// ---------- Pending buffer + rAF flush ----------

type PendingBuffers = Record<MapKey, { adds: Map<string, FukanEvent>; removes: Set<string> }>

function makePendingBuffers(): PendingBuffers {
  return {
    aircraft: { adds: new Map(), removes: new Set() },
    vessels: { adds: new Map(), removes: new Set() },
    satellites: { adds: new Map(), removes: new Set() },
  }
}

let pending: PendingBuffers = makePendingBuffers()
let rafId = 0

function scheduleFlush(): void {
  if (rafId !== 0) return
  rafId = requestAnimationFrame(flushPending)
}

function flushPending(): void {
  if (rafId !== 0) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }

  const buffered = pending
  pending = makePendingBuffers()

  // Nothing to do — don't pay for a setState.
  let hasWork = false
  for (const key of MAP_KEYS) {
    if (buffered[key].adds.size > 0 || buffered[key].removes.size > 0) {
      hasWork = true
      break
    }
  }
  if (!hasWork) return

  perfTime('streamStore.flush', () => {
    useStreamStore.setState((state) => {
      const versions = { ...state.versions }
      for (const key of MAP_KEYS) {
        const { adds, removes } = buffered[key]
        if (adds.size === 0 && removes.size === 0) continue
        const m = state[key]
        for (const id of removes) m.delete(id)
        for (const [id, e] of adds) {
          const current = m.get(id)
          if (!current || e.ts >= current.ts) m.set(id, e)
        }
        versions[key]++
      }
      return { versions }
    })

    for (const key of MAP_KEYS) {
      emitDelta(key, { changed: buffered[key].adds, removed: buffered[key].removes })
    }
  })
}

// ---------- Store ----------

export const useStreamStore = create<StreamState>()(
  subscribeWithSelector((set) => ({
    aircraft: new Map(),
    vessels: new Map(),
    satellites: new Map(),
    versions: { aircraft: 0, vessels: 0, satellites: 0 },
    connectionStatus: 'connecting',
    setConnectionStatus: (status) => set({ connectionStatus: status }),

    upsert: (event) => {
      if (queueLatest(event)) scheduleFlush()
    },

    upsertBatch: (events) => {
      let wrote = false
      for (const event of events) {
        if (queueLatest(event)) wrote = true
      }
      if (wrote) scheduleFlush()
    },

    evictOutsideCells: (cells, resolution) =>
      perfTime(
        'streamStore.evictOutsideCells',
        () => {
          // Flush pending adds first so we don't miss assets that arrived
          // this tick and would have fallen inside the new viewport.
          flushPending()

          const allowed = new Set(cells)
          const removedByType: Record<MapKey, Set<string>> = {
            aircraft: new Set(),
            vessels: new Set(),
            satellites: new Set(),
          }

          set((state) => {
            for (const key of MAP_KEYS) {
              const src = state[key]
              for (const [id, event] of [...src]) {
                const eventRes = getResolution(event.h3)
                const coarsened =
                  resolution <= eventRes ? cellToParent(event.h3, resolution) : event.h3
                if (!allowed.has(coarsened)) {
                  src.delete(id)
                  removedByType[key].add(id)
                }
              }
            }
            return {
              versions: {
                aircraft: state.versions.aircraft + 1,
                vessels: state.versions.vessels + 1,
                satellites: state.versions.satellites + 1,
              },
            }
          })

          for (const key of MAP_KEYS) {
            emitDelta(key, { changed: new Map(), removed: removedByType[key] })
          }
        },
        { cells: cells.length, resolution },
      ),
    clearAll: () => {
      flushPending()
      const removedByType: Record<MapKey, Set<string>> = {
        aircraft: new Set(),
        vessels: new Set(),
        satellites: new Set(),
      }
      set((state) => {
        for (const key of MAP_KEYS) {
          for (const id of state[key].keys()) removedByType[key].add(id)
          state[key].clear()
        }
        return {
          versions: {
            aircraft: state.versions.aircraft + 1,
            vessels: state.versions.vessels + 1,
            satellites: state.versions.satellites + 1,
          },
        }
      })
      for (const key of MAP_KEYS) {
        emitDelta(key, { changed: new Map(), removed: removedByType[key] })
      }
    },
  })),
)
