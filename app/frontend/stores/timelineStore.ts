import { create } from 'zustand'

interface TimelineState {
  timestamp: number
  playing: boolean
  speed: number
  mode: 'live' | 'replay'
  setTimestamp: (ts: number) => void
  togglePlay: () => void
  setSpeed: (s: number) => void
  goLive: () => void
}

export const useTimelineStore = create<TimelineState>((set) => ({
  timestamp: Date.now(),
  playing: false,
  speed: 1,
  mode: 'live',
  setTimestamp: (ts) => set({ timestamp: ts }),
  togglePlay: () => set((state) => ({ playing: !state.playing })),
  setSpeed: (speed) => set({ speed }),
  goLive: () => set({ mode: 'live', timestamp: Date.now(), playing: false }),
}))
