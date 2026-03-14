import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

interface GlobeState {
  longitude: number
  latitude: number
  height: number
  heading: number
  pitch: number
  roll: number
  viewportH3Cells: bigint[]
  setCamera: (v: Partial<Pick<GlobeState, 'longitude' | 'latitude' | 'height' | 'heading' | 'pitch' | 'roll'>>) => void
  setH3Cells: (cells: bigint[]) => void
}

export const useGlobeStore = create<GlobeState>()(
  subscribeWithSelector((set) => ({
    longitude: 0,
    latitude: 0.349, // ~20 degrees in radians
    height: 20_000_000,
    heading: 0,
    pitch: -Math.PI / 2,
    roll: 0,
    viewportH3Cells: [],
    setCamera: (v) => set((state) => ({ ...state, ...v })),
    setH3Cells: (cells) => set({ viewportH3Cells: cells }),
  })),
)
