import { useEffect, useState } from 'react'
import { useSelectionStore } from '~/stores/selectionStore'
import { useBgpEventStore } from '~/stores/bgpEventStore'
import type { BgpEvent } from '~/types/telemetry'

const EVENT_BADGE: Record<string, string> = {
  announcement: 'bg-emerald-500/20 text-emerald-300',
  withdrawal: 'bg-yellow-500/20 text-yellow-300',
  hijack: 'bg-red-500/20 text-red-300',
  leak: 'bg-orange-500/20 text-orange-300',
}

export function BgpDetailPanel() {
  const selectedId = useSelectionStore((s) => s.selectedAssetId)
  const selectedType = useSelectionStore((s) => s.selectedAssetType)
  const deselect = useSelectionStore((s) => s.deselect)

  const [event, setEvent] = useState<BgpEvent | null>(null)

  useEffect(() => {
    if (!selectedId || selectedType !== 'bgp_node') {
      setEvent(null)
      return
    }

    const current = useBgpEventStore.getState().events.get(selectedId)
    if (current) setEvent(current)

    const unsub = useBgpEventStore.subscribe(
      (state) => state.events.get(selectedId),
      (e) => { if (e) setEvent(e) },
    )
    return unsub
  }, [selectedId, selectedType])

  if (!selectedId || selectedType !== 'bgp_node' || !event) return null

  const eventType = event.cat || 'unknown'
  const badgeClass = EVENT_BADGE[eventType] ?? 'bg-white/10 text-white/70'
  const ts = new Date(event.ts).toISOString().replace('T', ' ').replace('.000Z', ' UTC')

  // Divergence: MMDB says the prefix is registered to one AS, but RIS Live
  // reports a different AS currently announcing it. For hijacks and leaks,
  // this gap IS the signal and deserves visual emphasis.
  const holderKnown = event.prefix_as > 0
  const announcerKnown = event.origin_as > 0
  const divergent =
    holderKnown && announcerKnown && event.prefix_as !== event.origin_as &&
    (eventType === 'hijack' || eventType === 'leak')

  const holderLabel = holderKnown
    ? (event.prefix_org ? `${event.prefix_org} (AS${event.prefix_as})` : `AS${event.prefix_as}`)
    : undefined
  const announcerLabel = announcerKnown ? `AS${event.origin_as}` : undefined

  return (
    <div className="absolute right-4 top-4 z-50 w-80 overflow-hidden rounded-lg border border-white/10 bg-gray-950/95 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeClass}`}>
              {eventType}
            </span>
            <h2 className="truncate text-sm font-bold">{event.prefix || '—'}</h2>
          </div>
          <p className="truncate text-xs text-white/60">
            {event.prefix_org || announcerLabel || 'unknown origin'}
            {event.collector && ` \u2014 ${event.collector}`}
          </p>
        </div>
        <button
          onClick={deselect}
          className="ml-2 shrink-0 rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {divergent && (
        <div className="flex items-start gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-[11px] text-red-200">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5l7 13H1l7-13zm0 4v4m0 2v0.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
          <span>
            Announcer AS{event.origin_as} differs from registered holder AS{event.prefix_as}
            {event.prefix_org ? ` (${event.prefix_org})` : ''}.
          </span>
        </div>
      )}

      <div className="space-y-2 border-b border-white/10 px-4 py-3">
        <InfoRow label="Prefix" value={event.prefix} mono />
        <InfoRow label="Holder" value={holderLabel} />
        <InfoRow label="Announced by" value={announcerLabel} />
        <InfoRow label="Collector" value={event.collector} />
        <InfoRow label="Observed" value={ts} mono />
      </div>

      {event.as_path && event.as_path.length > 0 && (
        <div className="space-y-1 px-4 py-3">
          <div className="text-xs text-white/40">AS Path</div>
          <div className="font-mono text-[11px] leading-relaxed text-white/80 break-words">
            {event.as_path.map((asn) => `AS${asn}`).join(' \u2192 ')}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="shrink-0 text-white/40">{label}</span>
      <span className={`text-right text-white/80 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  )
}
