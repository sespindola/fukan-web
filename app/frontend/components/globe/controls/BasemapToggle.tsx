import {
  useBasemapStore,
  type BasemapType,
  type LightingMode,
} from '~/stores/basemapStore'

const BASEMAP_OPTIONS: { value: BasemapType; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'satellite', label: 'Satellite' },
]

const LIGHTING_OPTIONS: { value: LightingMode; label: string }[] = [
  { value: 'auto', label: 'Day / Night' },
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
]

export function BasemapToggle() {
  const basemap = useBasemapStore((s) => s.basemap)
  const setBasemap = useBasemapStore((s) => s.setBasemap)
  const lighting = useBasemapStore((s) => s.lighting)
  const setLighting = useBasemapStore((s) => s.setLighting)

  return (
    <div className="space-y-2">
      <div className="flex w-full rounded-lg bg-white/5 p-1 text-sm">
        {BASEMAP_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setBasemap(value)}
            className={`flex-1 rounded-md px-3 py-1 transition-colors ${
              basemap === value
                ? 'bg-cyan-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <select
        value={lighting}
        onChange={(e) => setLighting(e.target.value as LightingMode)}
        className="w-full rounded-lg bg-white/5 px-3 py-1.5 text-sm text-gray-400 outline-none"
      >
        {LIGHTING_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}
