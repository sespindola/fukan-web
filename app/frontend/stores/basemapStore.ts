import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BasemapType = 'map' | 'satellite'

interface BasemapState {
  basemap: BasemapType
  setBasemap: (type: BasemapType) => void
}

export const useBasemapStore = create<BasemapState>()(
  persist(
    (set) => ({
      basemap: 'map',
      setBasemap: (type) => set({ basemap: type }),
    }),
    {
      name: 'fukan-basemap',
      partialize: ({ basemap }) => ({ basemap }),
    },
  ),
)
