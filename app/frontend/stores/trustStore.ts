import { create } from 'zustand'
import { useBgpEventStore } from '~/stores/bgpEventStore'
import { useGlobeStore } from '~/stores/globeStore'
import { useLayerStore } from '~/stores/layerStore'
import { useStreamStore } from '~/stores/streamStore'
import type { AssetType, BgpEvent, FukanEvent } from '~/types/telemetry'

export type TrustState = 'disabled' | 'loading' | 'live' | 'recent' | 'stale' | 'sampled' | 'empty'

export interface BootstrapMeta {
  stream: 'telemetry' | 'bgp'
  row_count: number
  limit: number
  sampled: boolean
  generated_at: number
  cell_count: number
  resolution: number
  asset_types: AssetType[]
}

export interface LayerTrust {
  type: AssetType
  label: string
  visible: boolean
  count: number
  latestTs: number | null
  ageMs: number | null
  sampled: boolean
  state: TrustState
}

interface TrustSnapshot {
  layers: Record<AssetType, LayerTrust>
  connectionStatus: 'connected' | 'connecting' | 'disconnected'
  viewportResolution: number
  cellCount: number
  latestAgeMs: number | null
  sampled: boolean
  state: TrustState
}

interface TrustStoreState {
  telemetryBootstrap: BootstrapMeta | null
  bgpBootstrap: BootstrapMeta | null
  snapshot: TrustSnapshot
  setTelemetryBootstrap: (meta: BootstrapMeta) => void
  setBgpBootstrap: (meta: BootstrapMeta) => void
  refreshSnapshot: () => void
}

const LABELS: Record<AssetType, string> = {
  aircraft: 'Aircraft',
  vessel: 'Vessels',
  satellite: 'Satellites',
  bgp_node: 'BGP',
}

const ASSET_TYPES: readonly AssetType[] = ['aircraft', 'vessel', 'satellite', 'bgp_node']
const LIVE_MS = 10_000
const RECENT_MS = 60_000

function latestTimestamp<T extends { ts: number }>(events: Iterable<T>): number | null {
  let latest: number | null = null
  for (const event of events) {
    if (latest === null || event.ts > latest) latest = event.ts
  }
  return latest
}

function stateFor(visible: boolean, count: number, ageMs: number | null, sampled: boolean): TrustState {
  if (!visible) return 'disabled'
  if (sampled) return 'sampled'
  if (count === 0) return 'empty'
  if (ageMs === null) return 'loading'
  if (ageMs <= LIVE_MS) return 'live'
  if (ageMs <= RECENT_MS) return 'recent'
  return 'stale'
}

function makeLayer(
  type: AssetType,
  visible: boolean,
  count: number,
  latestTs: number | null,
  sampled: boolean,
  now: number,
): LayerTrust {
  const ageMs = latestTs === null ? null : Math.max(0, now - latestTs)
  return {
    type,
    label: LABELS[type],
    visible,
    count,
    latestTs,
    ageMs,
    sampled,
    state: stateFor(visible, count, ageMs, sampled),
  }
}

function buildSnapshot(
  telemetryBootstrap: BootstrapMeta | null,
  bgpBootstrap: BootstrapMeta | null,
): TrustSnapshot {
  const now = Date.now()
  const stream = useStreamStore.getState()
  const bgp = useBgpEventStore.getState()
  const globe = useGlobeStore.getState()
  const layerState = useLayerStore.getState().layers

  const telemetrySampled = (type: AssetType) =>
    Boolean(telemetryBootstrap?.sampled && telemetryBootstrap.asset_types.includes(type))

  const layers: Record<AssetType, LayerTrust> = {
    aircraft: makeLayer(
      'aircraft',
      layerState.aircraft.visible,
      stream.aircraft.size,
      latestTimestamp<FukanEvent>(stream.aircraft.values()),
      telemetrySampled('aircraft'),
      now,
    ),
    vessel: makeLayer(
      'vessel',
      layerState.vessel.visible,
      stream.vessels.size,
      latestTimestamp<FukanEvent>(stream.vessels.values()),
      telemetrySampled('vessel'),
      now,
    ),
    satellite: makeLayer(
      'satellite',
      layerState.satellite.visible,
      stream.satellites.size,
      latestTimestamp<FukanEvent>(stream.satellites.values()),
      telemetrySampled('satellite'),
      now,
    ),
    bgp_node: makeLayer(
      'bgp_node',
      layerState.bgp_node.visible,
      bgp.events.size,
      latestTimestamp<BgpEvent>(bgp.events.values()),
      Boolean(bgpBootstrap?.sampled),
      now,
    ),
  }

  const visibleLayers = ASSET_TYPES.map((type) => layers[type]).filter((layer) => layer.visible)
  const latestTs = latestTimestamp(visibleLayers.flatMap((layer) => (layer.latestTs ? [{ ts: layer.latestTs }] : [])))
  const latestAgeMs = latestTs === null ? null : Math.max(0, now - latestTs)
  const sampled = visibleLayers.some((layer) => layer.sampled)
  const state = overallState(visibleLayers, stream.connectionStatus)

  return {
    layers,
    connectionStatus: stream.connectionStatus,
    viewportResolution: globe.viewportResolution,
    cellCount: globe.viewportH3Cells.length,
    latestAgeMs,
    sampled,
    state,
  }
}

function overallState(
  visibleLayers: LayerTrust[],
  connectionStatus: TrustSnapshot['connectionStatus'],
): TrustState {
  if (visibleLayers.length === 0) return 'disabled'
  if (visibleLayers.some((layer) => layer.sampled)) return 'sampled'
  if (connectionStatus === 'connecting' && visibleLayers.every((layer) => layer.count === 0)) return 'loading'
  if (visibleLayers.some((layer) => layer.state === 'stale')) return 'stale'
  if (visibleLayers.some((layer) => layer.state === 'live' || layer.state === 'recent')) return 'live'
  return 'empty'
}

const initialSnapshot = buildSnapshot(null, null)

export const useTrustStore = create<TrustStoreState>()((set, get) => ({
  telemetryBootstrap: null,
  bgpBootstrap: null,
  snapshot: initialSnapshot,
  setTelemetryBootstrap: (meta) =>
    set((state) => ({
      telemetryBootstrap: meta,
      snapshot: buildSnapshot(meta, state.bgpBootstrap),
    })),
  setBgpBootstrap: (meta) =>
    set((state) => ({
      bgpBootstrap: meta,
      snapshot: buildSnapshot(state.telemetryBootstrap, meta),
    })),
  refreshSnapshot: () => {
    const { telemetryBootstrap, bgpBootstrap } = get()
    set({ snapshot: buildSnapshot(telemetryBootstrap, bgpBootstrap) })
  },
}))
