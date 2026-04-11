import { useEffect, useState } from 'react'
import { useSelectionStore } from '~/stores/selectionStore'
import { useStreamStore } from '~/stores/streamStore'
import { decodeLat, decodeLon } from '~/lib/coords'
import type { AircraftMeta, FukanEvent } from '~/types/telemetry'
import { createConsumer } from '@rails/actioncable'

const cable = createConsumer()

export function AircraftDetailPanel() {
  const selectedId = useSelectionStore((s) => s.selectedAssetId)
  const selectedType = useSelectionStore((s) => s.selectedAssetType)
  const deselect = useSelectionStore((s) => s.deselect)

  const [meta, setMeta] = useState<AircraftMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [telemetry, setTelemetry] = useState<FukanEvent | null>(null)

  // Fetch metadata from API when an aircraft is selected
  useEffect(() => {
    if (!selectedId || selectedType !== 'aircraft') {
      setMeta(null)
      setTelemetry(null)
      return
    }

    setLoading(true)
    fetch(`/api/aircraft/${selectedId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMeta(data as AircraftMeta)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Read current telemetry from stream store
    const event = useStreamStore.getState().aircraft.get(selectedId)
    if (event) setTelemetry(event)

    // Subscribe to stream store for live telemetry updates
    const unsub = useStreamStore.subscribe(
      (state) => state.aircraft.get(selectedId),
      (event) => { if (event) setTelemetry(event) },
    )

    return unsub
  }, [selectedId, selectedType])

  // Subscribe to ActionCable for image updates
  useEffect(() => {
    if (!selectedId || selectedType !== 'aircraft') return

    const subscription = cable.subscriptions.create(
      { channel: 'AircraftDetailChannel', icao24: selectedId },
      {
        received(data: { type: string; image_url: string; image_attribution: string }) {
          if (data.type === 'image_update') {
            setMeta((prev) =>
              prev ? { ...prev, image_url: data.image_url, image_attribution: data.image_attribution } : prev,
            )
          }
        },
      },
    )

    return () => subscription.unsubscribe()
  }, [selectedId, selectedType])

  if (!selectedId || selectedType !== 'aircraft') return null

  return (
    <div className="absolute right-4 top-4 z-50 w-80 overflow-hidden rounded-lg border border-white/10 bg-gray-950/95 text-white shadow-xl backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold">
            {meta?.registration || selectedId}
          </h2>
          {meta?.operator && (
            <p className="truncate text-xs text-white/60">
              {meta.operator}
              {meta.operator_iata && ` (${meta.operator_iata})`}
            </p>
          )}
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

      {/* Image */}
      {meta?.image_url ? (
        <div className="relative">
          <img
            src={meta.image_url}
            alt={`${meta.registration} ${meta.operator}`}
            className="h-40 w-full object-cover"
          />
          {meta.image_attribution && (
            <p className="absolute bottom-1 right-2 text-[10px] text-white/60 drop-shadow">
              &copy; {meta.image_attribution}
            </p>
          )}
        </div>
      ) : loading ? (
        <div className="flex h-32 items-center justify-center text-xs text-white/30">
          Loading...
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center text-xs text-white/30">
          Fetching image...
        </div>
      )}

      {/* Aircraft Info */}
      {meta && (
        <div className="space-y-2 border-t border-white/10 px-4 py-3">
          <InfoRow label="Aircraft" value={[meta.manufacturer_name, meta.model].filter(Boolean).join(' ')} />
          <InfoRow label="Type" value={[meta.typecode, meta.icao_aircraft_type].filter(Boolean).join(' / ')} />
          {meta.owner && meta.owner !== meta.operator && <InfoRow label="Owner" value={meta.owner} />}
          {meta.built && <InfoRow label="Built" value={meta.built} />}
          {meta.category_desc && <InfoRow label="Category" value={meta.category_desc} />}
        </div>
      )}

      {/* Live Telemetry */}
      {telemetry && (
        <div className="space-y-2 border-t border-white/10 px-4 py-3">
          <InfoRow label="Callsign" value={telemetry.callsign} />
          <InfoRow label="Origin" value={telemetry.origin} />
          <InfoRow label="Class" value={telemetry.cat} />
          <InfoRow label="Altitude" value={formatAltitude(num(telemetry.alt), num(telemetry.vr))} />
          <InfoRow label="Speed" value={`${num(telemetry.spd).toFixed(0)} kts`} />
          <InfoRow label="Heading" value={`${num(telemetry.hdg).toFixed(0)}\u00B0`} />
          <InfoRow
            label="Position"
            value={`${decodeLat(num(telemetry.lat)).toFixed(4)}\u00B0, ${decodeLon(num(telemetry.lon)).toFixed(4)}\u00B0`}
          />
          {telemetry.meta && <SquawkRow meta={telemetry.meta} />}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/40">{label}</span>
      <span className="text-right text-white/80">{value}</span>
    </div>
  )
}

// Defensive coercion: bootstrap rows can arrive from the Rails ClickHouse
// driver as strings for some numeric column types; live broadcasts arrive
// as JSON numbers from Go. num() normalizes both paths.
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatAltitude(alt: number, vr: number): string {
  const base = `${Math.round(alt).toLocaleString()} m`
  if (!vr) return base
  const arrow = vr > 0 ? '\u2191' : '\u2193'
  return `${base} (${arrow} ${Math.abs(vr).toFixed(1)} m/s)`
}

function SquawkRow({ meta }: { meta: string }) {
  try {
    const parsed = JSON.parse(meta)
    if (!parsed.squawk) return null
    return <InfoRow label="Squawk" value={parsed.squawk} />
  } catch {
    return null
  }
}
