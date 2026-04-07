import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BasemapType = 'map' | 'satellite'
export type LightingMode = 'auto' | 'day' | 'night'

interface BasemapState {
  basemap: BasemapType
  setBasemap: (type: BasemapType) => void
  lighting: LightingMode
  setLighting: (mode: LightingMode) => void
}

export const useBasemapStore = create<BasemapState>()(
  persist(
    (set) => ({
      basemap: 'map',
      setBasemap: (type) => set({ basemap: type }),
      lighting: 'auto',
      setLighting: (mode) => set({ lighting: mode }),
    }),
    {
      name: 'fukan-basemap',
      partialize: ({ basemap, lighting }) => ({ basemap, lighting }),
    },
  ),
)
