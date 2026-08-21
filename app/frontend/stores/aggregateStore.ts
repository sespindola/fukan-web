import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { TelemetryAggregateCell } from '~/types/telemetry'

interface AggregateState {
  cells: TelemetryAggregateCell[]
  resolution: number | null
  setCells: (cells: TelemetryAggregateCell[], resolution: number) => void
  clear: () => void
}

export const useAggregateStore = create<AggregateState>()(
  subscribeWithSelector((set) => ({
    cells: [],
    resolution: null,
    setCells: (cells, resolution) => set({ cells, resolution }),
    clear: () => set({ cells: [], resolution: null }),
  })),
)
