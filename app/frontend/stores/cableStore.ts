import { create } from 'zustand'
import type { CableSegment } from '~/types/telemetry'

type CableStatus = 'idle' | 'loading' | 'ready' | 'error'

interface CableState {
  segments: CableSegment[]
  status: CableStatus
  error: string | null
  setLoading: () => void
  setSegments: (segments: CableSegment[]) => void
  setError: (message: string) => void
}

export const useCableStore = create<CableState>()((set) => ({
  segments: [],
  status: 'idle',
  error: null,
  setLoading: () => set({ status: 'loading', error: null }),
  setSegments: (segments) => set({ segments, status: 'ready', error: null }),
  setError: (message) => set({ status: 'error', error: message }),
}))
