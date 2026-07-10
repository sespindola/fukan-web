import { useGlobeStore } from '~/stores/globeStore'
import { useTrustStore, type TrustState } from '~/stores/trustStore'

const STATE_LABEL: Record<TrustState, string> = {
  disabled: 'Paused',
  loading: 'Loading',
  live: 'Live',
  recent: 'Recent',
  stale: 'Stale',
  sampled: 'Sampled',
  empty: 'No data',
}

const STATE_STYLE: Record<TrustState, string> = {
  disabled: 'bg-white/10 text-white/50',
  loading: 'bg-amber-500/15 text-amber-200',
  live: 'bg-emerald-500/15 text-emerald-200',
  recent: 'bg-cyan-500/15 text-cyan-200',
  stale: 'bg-red-500/15 text-red-200',
  sampled: 'bg-amber-500/15 text-amber-200',
  empty: 'bg-white/10 text-white/60',
}

export function ViewportInfo() {
  const height = useGlobeStore((s) => s.height)
  const snapshot = useTrustStore((s) => s.snapshot)

  const formatHeight = (h: number): string => {
    if (h >= 1_000_000) return `${(h / 1_000_000).toFixed(1)}k km`
    if (h >= 1_000) return `${(h / 1_000).toFixed(0)} km`
    return `${h.toFixed(0)} m`
  }

  return (
    <div className="max-w-sm rounded-lg border border-white/10 bg-gray-950/90 px-3 py-2 text-xs text-white/70 shadow-lg backdrop-blur">
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATE_STYLE[snapshot.state]}`}>
          {STATE_LABEL[snapshot.state]}
        </span>
        <span className="tabular-nums">{formatAge(snapshot.latestAgeMs)}</span>
        {snapshot.sampled && (
          <span className="text-amber-200/80">latest sample, not exhaustive</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
        <span>Alt {formatHeight(height)}</span>
        <span>H3 res {snapshot.viewportResolution}</span>
        <span>{snapshot.cellCount.toLocaleString()} cells</span>
        <span>{visibleCount(snapshot).toLocaleString()} visible</span>
      </div>
    </div>
  )
}

function formatAge(ageMs: number | null): string {
  if (ageMs === null) return 'waiting for events'
  if (ageMs < 1_000) return 'fresh now'
  if (ageMs < 60_000) return `${Math.round(ageMs / 1_000)}s old`
  return `${Math.round(ageMs / 60_000)}m old`
}

function visibleCount(snapshot: ReturnType<typeof useTrustStore.getState>['snapshot']): number {
  return Object.values(snapshot.layers)
    .filter((layer) => layer.visible)
    .reduce((sum, layer) => sum + layer.count, 0)
}
