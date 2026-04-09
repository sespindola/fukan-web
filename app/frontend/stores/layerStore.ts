import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import type { AssetType } from '~/types/telemetry'

export type LayerType = AssetType | 'news'

interface LayerConfig {
  visible: boolean
  opacity: number
}

interface LayerState {
  layers: Record<LayerType, LayerConfig>
  toggleLayer: (type: LayerType) => void
  setOpacity: (type: LayerType, opacity: number) => void
}

const defaultLayers: Record<LayerType, LayerConfig> = {
  aircraft: { visible: true, opacity: 1 },
  vessel: { visible: true, opacity: 1 },
  satellite: { visible: true, opacity: 1 },
  bgp_node: { visible: true, opacity: 1 },
  news: { visible: true, opacity: 1 },
}

export const useLayerStore = create<LayerState>()(
  subscribeWithSelector(persist(
    (set) => ({
      layers: defaultLayers,
      toggleLayer: (type) =>
        set((state) => ({
          layers: {
            ...state.layers,
            [type]: {
              ...state.layers[type],
              visible: !state.layers[type].visible,
            },
          },
        })),
      setOpacity: (type, opacity) =>
        set((state) => ({
          layers: {
            ...state.layers,
            [type]: { ...state.layers[type], opacity },
          },
        })),
    }),
    {
      name: 'fukan-layers',
      partialize: ({ layers }) => ({ layers }),
    },
  )),
)
