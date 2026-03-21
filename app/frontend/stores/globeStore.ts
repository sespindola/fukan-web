import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

interface GlobeState {
  longitude: number
  latitude: number
  height: number
  heading: number
  pitch: number
  roll: number
  viewportH3Cells: bigint[]
  viewportResolution: number
  setCamera: (v: Partial<Pick<GlobeState, 'longitude' | 'latitude' | 'height' | 'heading' | 'pitch' | 'roll'>>) => void
  setH3Cells: (cells: bigint[], resolution: number) => void
}

export const useGlobeStore = create<GlobeState>()(
  persist(
    subscribeWithSelector((set) => ({
      longitude: 0,
      latitude: 0.349, // ~20 degrees in radians
      height: 20_000_000,
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
      viewportH3Cells: [],
      viewportResolution: 2,
      setCamera: (v) => set((state) => ({ ...state, ...v })),
      setH3Cells: (cells, resolution) => set({ viewportH3Cells: cells, viewportResolution: resolution }),
    })),
    {
      name: 'fukan-globe-camera',
      partialize: ({ longitude, latitude, height, heading, pitch, roll }) => ({
        longitude, latitude, height, heading, pitch, roll,
      }),
    },
  ),
)
