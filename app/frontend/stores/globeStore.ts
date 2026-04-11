import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

interface GlobeState {
  longitude: number
  latitude: number
  height: number
  heading: number
  pitch: number
  roll: number
  viewportH3Cells: string[]
  viewportResolution: number
  // Stable signature of (resolution, sorted cells). Used to short-circuit
  // setH3Cells when the visible cell set hasn't actually changed.
  _cellsSig: string
  setCamera: (v: Partial<Pick<GlobeState, 'longitude' | 'latitude' | 'height' | 'heading' | 'pitch' | 'roll'>>) => void
  setH3Cells: (cells: string[], resolution: number) => void
}

export const useGlobeStore = create<GlobeState>()(
  persist(
    subscribeWithSelector((set, get) => ({
      longitude: 0,
      latitude: 0.349, // ~20 degrees in radians
      height: 20_000_000,
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
      viewportH3Cells: [],
      viewportResolution: 2,
      _cellsSig: '',
      setCamera: (v) => set((state) => ({ ...state, ...v })),
      setH3Cells: (cells, resolution) => {
        const sig = `${resolution}:${cells.length}:${[...cells].sort().join(',')}`
        if (get()._cellsSig === sig) return
        set({ viewportH3Cells: cells, viewportResolution: resolution, _cellsSig: sig })
      },
    })),
    {
      name: 'fukan-globe-camera',
      partialize: ({ longitude, latitude, height, heading, pitch, roll }) => ({
        longitude, latitude, height, heading, pitch, roll,
      }),
    },
  ),
)
