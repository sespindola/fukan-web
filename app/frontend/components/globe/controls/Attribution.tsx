import { useBasemapStore } from '~/stores/basemapStore'
import { useLayerStore } from '~/stores/layerStore'

const ATTRIBUTIONS = {
  map: '© MapTiler © OpenStreetMap contributors',
  satellite:
    'Sentinel-2 cloudless by EOX · Contains modified Copernicus Sentinel data · NASA Earth Observatory',
} as const

export function Attribution() {
  const basemap = useBasemapStore((s) => s.basemap)
  const cablesVisible = useLayerStore((s) => s.layers.cables.visible)

  return (
    <div className="rounded-lg bg-gray-900/80 px-3 py-1.5 text-[10px] text-white/50 backdrop-blur">
      {ATTRIBUTIONS[basemap]}
      {cablesVisible && ' · Cable data © OpenStreetMap contributors'}
    </div>
  )
}
