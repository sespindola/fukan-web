import { useEffect, useState } from 'react'
import { useSelectionStore } from '~/stores/selectionStore'
import { useStreamStore } from '~/stores/streamStore'
import { decodeLat, decodeLon } from '~/lib/coords'
import {
  coverageRadiusKm,
  getHalfAngle,
  COVERAGE_ELEVATION_MASK_DEG,
} from '~/lib/orbitMath'
import type { FukanEvent, SatelliteMeta } from '~/types/telemetry'

export function SatelliteDetailPanel() {
  const selectedId = useSelectionStore((s) => s.selectedAssetId)
  const selectedType = useSelectionStore((s) => s.selectedAssetType)
  const deselect = useSelectionStore((s) => s.deselect)

  const [meta, setMeta] = useState<SatelliteMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [telemetry, setTelemetry] = useState<FukanEvent | null>(null)

  // Fetch metadata when a satellite is selected
  useEffect(() => {
    if (!selectedId || selectedType !== 'satellite') {
      setMeta(null)
      setTelemetry(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/api/satellites/${selectedId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SatelliteMeta | null) => {
        if (cancelled) return
        setLoading(false)
        setMeta(data)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    // Seed + subscribe to live telemetry for this satellite
    const current = useStreamStore.getState().satellites.get(selectedId)
    if (current) setTelemetry(current)

    const unsub = useStreamStore.subscribe(
      (state) => state.satellites.get(selectedId),
      (event) => { if (event) setTelemetry(event) },
    )

    return () => {
      cancelled = true
      unsub()
    }
  }, [selectedId, selectedType])

  if (!selectedId || selectedType !== 'satellite') return null

  // Header title prefers catalog name, then the live-telemetry callsign
  // (which the TLE worker populates from CelesTrak OBJECT_NAME), then
  // falls back to the bare NORAD id if neither is available.
  const title = meta?.name || telemetry?.callsign || selectedId

  // Coverage estimate — only meaningful once we have a live position.
  const coverage = telemetry
    ? (() => {
        const { halfAngleDeg, label, confidence } = getHalfAngle(meta, telemetry)
        const radiusKm = coverageRadiusKm(telemetry.alt / 1000, halfAngleDeg)
        return { halfAngleDeg, label, confidence, radiusKm }
      })()
    : null

  return (
    <div className="absolute right-4 top-4 z-50 w-80 overflow-hidden rounded-lg border border-white/10 bg-gray-950/95 text-white shadow-xl backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold">{title}</h2>
          <p className="truncate text-xs text-white/60">NORAD {selectedId}</p>
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

      {/* Catalog info */}
      {meta ? (
        <div className="space-y-2 border-b border-white/10 px-4 py-3">
          <InfoRow label="Object Type" value={meta.object_type} />
          <InfoRow label="Status" value={meta.status} />
          <InfoRow label="Operator" value={meta.operator} />
          <InfoRow label="Country" value={meta.country} />
          <InfoRow label="Launched" value={meta.launch_date} />
          <InfoRow
            label="Mass"
            value={meta.mass_kg ? `${num(meta.mass_kg).toLocaleString()} kg` : undefined}
          />
        </div>
      ) : loading ? (
        <div className="flex h-16 items-center justify-center text-xs text-white/30">
          Loading catalog…
        </div>
      ) : null}

      {/* Orbital parameters (from GCAT — no full Keplerian elements available) */}
      {meta && (meta.apogee_km || meta.perigee_km || meta.inclination_deg) && (
        <div className="space-y-2 border-b border-white/10 px-4 py-3">
          <InfoRow
            label="Apogee"
            value={meta.apogee_km ? `${num(meta.apogee_km).toLocaleString()} km` : undefined}
          />
          <InfoRow
            label="Perigee"
            value={meta.perigee_km ? `${num(meta.perigee_km).toLocaleString()} km` : undefined}
          />
          <InfoRow
            label="Inclination"
            value={meta.inclination_deg ? `${num(meta.inclination_deg).toFixed(2)}\u00B0` : undefined}
          />
        </div>
      )}

      {/* Estimated coverage — name-pattern half-angle, elevation-masked at 10° */}
      {coverage && (
        <div className="space-y-2 border-b border-white/10 px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40">Coverage</span>
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300/90">
              Estimate
            </span>
          </div>
          <InfoRow label="Class" value={coverage.label} />
          <InfoRow
            label="Sensor FOV"
            value={`\u00B1${coverage.halfAngleDeg.toFixed(1)}\u00B0`}
          />
          <InfoRow
            label="Footprint radius"
            value={`~${Math.round(coverage.radiusKm).toLocaleString()} km`}
          />
          <p className="pt-1 text-[10px] leading-snug text-white/30">
            Sensor half-angle estimated from satellite class. Coverage shown
            for users above {COVERAGE_ELEVATION_MASK_DEG}° elevation — actual
            payload footprints may use spot beams or steered sensors.
          </p>
        </div>
      )}

      {/* Live telemetry */}
      {telemetry && (
        <div className="space-y-2 px-4 py-3">
          <InfoRow
            label="Altitude"
            value={`${(num(telemetry.alt) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`}
          />
          <InfoRow
            label="Position"
            value={`${decodeLat(num(telemetry.lat)).toFixed(4)}\u00B0, ${decodeLon(num(telemetry.lon)).toFixed(4)}\u00B0`}
          />
          {telemetry.cat && <InfoRow label="Regime" value={telemetry.cat} />}
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

// Defensive coercion: bootstrap rows from the Rails ClickHouse driver can
// arrive as strings for some numeric column types; live broadcasts arrive
// as JSON numbers from Go. num() normalizes both paths.
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
