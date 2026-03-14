import { useLayerStore } from '~/stores/layerStore'
import type { AssetType } from '~/types/telemetry'

const LAYER_LABELS: Record<AssetType, string> = {
  aircraft: 'Aircraft',
  vessel: 'Vessels',
  satellite: 'Satellites',
  bgp_node: 'BGP',
}

export function LayerToggle() {
  const layers = useLayerStore((s) => s.layers)
  const toggleLayer = useLayerStore((s) => s.toggleLayer)

  return (
    <div className="rounded-lg bg-gray-900/80 p-3 text-sm text-white backdrop-blur">
      {(Object.keys(LAYER_LABELS) as AssetType[]).map((type) => (
        <label key={type} className="flex items-center gap-2 py-1">
          <input
            type="checkbox"
            checked={layers[type].visible}
            onChange={() => toggleLayer(type)}
            className="accent-cyan-400"
          />
          {LAYER_LABELS[type]}
        </label>
      ))}
    </div>
  )
}
