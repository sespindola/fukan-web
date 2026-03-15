import { useBasemapStore, type BasemapType } from '~/stores/basemapStore'

const OPTIONS: { value: BasemapType; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'satellite', label: 'Satellite' },
]

export function BasemapToggle() {
  const basemap = useBasemapStore((s) => s.basemap)
  const setBasemap = useBasemapStore((s) => s.setBasemap)

  return (
    <div className="inline-flex rounded-lg bg-gray-900/80 p-1 text-sm backdrop-blur">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setBasemap(value)}
          className={`rounded-md px-3 py-1 transition-colors ${
            basemap === value
              ? 'bg-cyan-500 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
