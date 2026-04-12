import { useEffect, useState } from 'react'
import { useSelectionStore } from '~/stores/selectionStore'
import { useStreamStore } from '~/stores/streamStore'
import { decodeLat, decodeLon } from '~/lib/coords'
import type { FukanEvent } from '~/types/telemetry'

export function VesselDetailPanel() {
  const selectedId = useSelectionStore((s) => s.selectedAssetId)
  const selectedType = useSelectionStore((s) => s.selectedAssetType)
  const deselect = useSelectionStore((s) => s.deselect)

  const [telemetry, setTelemetry] = useState<FukanEvent | null>(null)

  useEffect(() => {
    if (!selectedId || selectedType !== 'vessel') {
      setTelemetry(null)
      return
    }

    const event = useStreamStore.getState().vessels.get(selectedId)
    if (event) setTelemetry(event)

    const unsub = useStreamStore.subscribe(
      (state) => state.vessels.get(selectedId),
      (event) => { if (event) setTelemetry(event) },
    )

    return unsub
  }, [selectedId, selectedType])

  if (!selectedId || selectedType !== 'vessel') return null

  return (
    <div className="absolute right-4 top-4 z-50 w-80 overflow-hidden rounded-lg border border-white/10 bg-gray-950/95 text-white shadow-xl backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold">
            {telemetry?.callsign || selectedId}
          </h2>
          <p className="truncate text-xs text-white/60">
            MMSI: {selectedId}
            {telemetry?.origin && ` \u2014 ${telemetry.origin}`}
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

      {/* Vessel Info */}
      {telemetry && (
        <div className="space-y-2 border-b border-white/10 px-4 py-3">
          <InfoRow label="Ship Type" value={telemetry.ship_type} />
          <InfoRow label="IMO" value={telemetry.imo ? String(telemetry.imo) : undefined} />
          <InfoRow label="Nav Status" value={formatNavStatus(telemetry.nav_status)} />
          <InfoRow label="Destination" value={telemetry.destination} />
          <InfoRow label="Draught" value={telemetry.draught ? `${num(telemetry.draught).toFixed(1)} m` : undefined} />
        </div>
      )}

      {/* Live Telemetry */}
      {telemetry && (
        <div className="space-y-2 px-4 py-3">
          <InfoRow label="Speed" value={`${num(telemetry.spd).toFixed(1)} kts`} />
          <InfoRow label="Heading" value={`${num(telemetry.hdg).toFixed(0)}\u00B0`} />
          <InfoRow
            label="Position"
            value={`${decodeLat(num(telemetry.lat)).toFixed(4)}\u00B0, ${decodeLon(num(telemetry.lon)).toFixed(4)}\u00B0`}
          />
          {telemetry.rot !== undefined && num(telemetry.rot) !== 0 && (
            <InfoRow label="Rate of Turn" value={`${num(telemetry.rot).toFixed(1)}\u00B0/min`} />
          )}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/40">{label}</span>
      <span className="text-right text-white/80">{value}</span>
    </div>
  )
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatNavStatus(status?: string): string | undefined {
  if (!status) return undefined
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
