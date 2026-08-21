import { useEffect } from 'react'
import { createConsumer, type Subscription } from '@rails/actioncable'
import { useStreamStore } from '~/stores/streamStore'
import { useBgpEventStore } from '~/stores/bgpEventStore'
import { useGlobeStore } from '~/stores/globeStore'
import { useLayerStore } from '~/stores/layerStore'
import { useTrustStore, type BootstrapMeta } from '~/stores/trustStore'
import { compactCells } from 'h3-js'
import { cellsToParents } from '~/lib/h3'
import { perfMark } from '~/lib/perf'
import type { AssetType, FukanEvent, BgpEvent } from '~/types/telemetry'
import { aggregateModeForResolution } from '~/lib/telemetryMode'

const consumer = createConsumer()

// Resolution BGP events are broadcast at by fukan-ingest
// (internal/redis/publisher.go). Must stay in sync.
const BGP_SUBSCRIBE_RESOLUTION = 3

interface TelemetryBootstrap {
  type: 'bootstrap'
  resolution: number
  data: FukanEvent[]
  meta?: BootstrapMeta
}

interface BgpBootstrap {
  type: 'bootstrap'
  data: BgpEvent[]
  meta?: BootstrapMeta
}

interface TelemetryDeltaBatch {
  type: 'delta_batch'
  v: number
  sent_at: number
  events: FukanEvent[]
}

function isTelemetryDeltaBatch(data: unknown): data is TelemetryDeltaBatch {
  return typeof data === 'object' && data !== null &&
    'type' in data && (data as TelemetryDeltaBatch).type === 'delta_batch' &&
    'events' in data && Array.isArray((data as TelemetryDeltaBatch).events)
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

// Defensive pre-compaction cap. Close viewports are compacted before their
// cells enter the ActionCable identifier, which keeps both subscribe frames
// and the identifier repeated on server messages comfortably bounded.
const MAX_SUBSCRIBE_CELLS = 2_000

const TELEMETRY_LAYER_TYPES: readonly AssetType[] = ['aircraft', 'vessel', 'satellite']

function enabledTelemetryTypes(): AssetType[] {
  const layers = useLayerStore.getState().layers
  return TELEMETRY_LAYER_TYPES.filter((t) => layers[t].visible)
}

function bgpEnabled(): boolean {
  return useLayerStore.getState().layers.bgp_node.visible
}

// Subscription state is module-scoped, not React-scoped. StrictMode's
// mount → cleanup → remount dance (and HMR, and any accidental double-mount)
// would otherwise reset per-component refs and let duplicate subscribe frames
// leak out before the matching unsubscribes reach anycable-go — which then
// warns "already subscribed to {...}" and drops the extras.
let telemetrySub: Subscription | null = null
let bgpSub: Subscription | null = null
let telemetryIdentifier = ''
let bgpIdentifier = ''
let storeListenersAttached = false
let offGlobe: (() => void) | null = null
let offLayers: (() => void) | null = null
let mountCount = 0

function applySubscriptions(): void {
  const { viewportH3Cells: cells, viewportResolution: resolution } = useGlobeStore.getState()
  const assetTypes = enabledTelemetryTypes()
  const cappedCells = cells.length > MAX_SUBSCRIBE_CELLS ? cells.slice(0, MAX_SUBSCRIBE_CELLS) : cells
  const detailMode = !aggregateModeForResolution(resolution)
  const streamCells = detailMode && cappedCells.length > 0 ? compactCells(cappedCells).sort() : []
  const bgpCells = bgpEnabled() ? cellsToParents(cappedCells, BGP_SUBSCRIBE_RESOLUTION) : []

  const desiredTelemetry = assetTypes.length > 0 && detailMode
    ? JSON.stringify({ channel: 'TelemetryChannel', streamCells, assetTypes })
    : ''
  const desiredBgp = bgpEnabled()
    ? JSON.stringify({ channel: 'BgpEventsChannel', cells: bgpCells })
    : ''

  const telemetryChanged = desiredTelemetry !== telemetryIdentifier
  const bgpChanged = desiredBgp !== bgpIdentifier
  if (!telemetryChanged && !bgpChanged) return

  if (telemetryChanged) {
    telemetrySub?.unsubscribe()
    telemetrySub = null
    telemetryIdentifier = desiredTelemetry
  }
  if (bgpChanged) {
    bgpSub?.unsubscribe()
    bgpSub = null
    bgpIdentifier = desiredBgp
  }

  // Drop assets from a previous viewport so layer update iterations stay
  // bounded by visible area, not session history. Runs BEFORE new
  // subscriptions kick off so the bootstrap + live stream repopulate
  // into a freshly pruned state.
  if (telemetryChanged) {
    if (detailMode) useStreamStore.getState().evictOutsideCells(cappedCells, resolution)
  }

  if (telemetryChanged) {
    if (assetTypes.length > 0 && detailMode) {
      useStreamStore.getState().setConnectionStatus('connecting')
      telemetrySub = consumer.subscriptions.create(
        {
          channel: 'TelemetryChannel',
          stream_cells: streamCells,
          asset_types: assetTypes,
          wire_version: 1,
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
            if (isTelemetryDeltaBatch(data)) {
              perfMark('telemetry.delta_batch.received', {
                events: data.events.length,
                age_ms: Math.max(0, Date.now() - data.sent_at),
              })
              useStreamStore.getState().upsertBatch(data.events)
            } else if (isTelemetryBootstrap(data)) {
              perfMark('telemetry.bootstrap.received', {
                rows: data.data.length,
                bytes: JSON.stringify(data).length,
              })
              if (data.meta) useTrustStore.getState().setTelemetryBootstrap(data.meta)
              useStreamStore.getState().upsertBatch(data.data)
            } else if (Array.isArray(data)) {
              useStreamStore.getState().upsertBatch(data as FukanEvent[])
            } else {
              useStreamStore.getState().upsert(data as FukanEvent)
            }
          },
        },
      )
    } else {
      // Coarse LOD and all-layers-off states use no individual live stream.
      useStreamStore.getState().setConnectionStatus('disconnected')
    }
  }

  if (bgpChanged && bgpEnabled()) {
    bgpSub = consumer.subscriptions.create(
      {
        channel: 'BgpEventsChannel',
        h3_cells: bgpCells,
      },
      {
        received(data: unknown) {
          if (isBgpBootstrap(data)) {
            perfMark('bgp.bootstrap.received', {
              rows: data.data.length,
              bytes: JSON.stringify(data).length,
            })
            if (data.meta) useTrustStore.getState().setBgpBootstrap(data.meta)
            useBgpEventStore.getState().upsertBatch(data.data)
          } else if (Array.isArray(data)) {
            useBgpEventStore.getState().upsertBatch(data as BgpEvent[])
          } else {
            useBgpEventStore.getState().upsert(data as BgpEvent)
          }
        },
      },
    )
  }
}

function attachStoreListeners(): void {
  if (storeListenersAttached) return
  storeListenersAttached = true

  offGlobe = useGlobeStore.subscribe(
    (state) => ({ cells: state.viewportH3Cells, resolution: state.viewportResolution }),
    applySubscriptions,
    { equalityFn: (a, b) => a.cells === b.cells && a.resolution === b.resolution },
  )

  // Layer visibility signature covers the four booleans we subscribe on.
  // Opacity changes (which we never do) would not re-subscribe.
  offLayers = useLayerStore.subscribe(
    (state) => [
      state.layers.aircraft.visible,
      state.layers.vessel.visible,
      state.layers.satellite.visible,
      state.layers.bgp_node.visible,
    ].join(','),
    applySubscriptions,
  )
}

function teardown(): void {
  offGlobe?.()
  offLayers?.()
  offGlobe = null
  offLayers = null
  storeListenersAttached = false
  telemetrySub?.unsubscribe()
  bgpSub?.unsubscribe()
  telemetrySub = null
  bgpSub = null
  telemetryIdentifier = ''
  bgpIdentifier = ''
}

/**
 * Manage AnyCable WebSocket subscriptions for live telemetry + BGP events.
 *
 * Two parallel channels:
 *   - TelemetryChannel streams aircraft/vessel/satellite events at the
 *     viewport's current H3 resolution band (2–7 depending on altitude),
 *     filtered by which layers the user has enabled.
 *   - BgpEventsChannel streams BGP events at a fixed coarse resolution
 *     (3) regardless of zoom, because BGP event coordinates are imprecise
 *     enough that zoom-band-precise subscriptions would be misleading.
 *
 * Subscriptions re-create whenever the viewport OR the set of enabled
 * telemetry layers changes, so Redis fan-out stays narrowed to exactly
 * what the user is looking at.
 *
 * Subscription state is held at module scope, not per-hook, so the live
 * subscriptions survive StrictMode's simulated unmount/remount and HMR
 * without emitting duplicate subscribe frames.
 */
export function useAnyCable(): void {
  useEffect(() => {
    mountCount++
    attachStoreListeners()
    applySubscriptions()
    return () => {
      mountCount--
      // StrictMode runs cleanup synchronously between mount 1 and mount 2
      // (count goes 1 → 0 → 1). Defer the teardown check to a microtask
      // so a synchronous remount has time to bump the count back up; only
      // a real unmount leaves count at 0 when the microtask runs.
      queueMicrotask(() => {
        if (mountCount === 0) teardown()
      })
    }
  }, [])
}
