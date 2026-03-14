import { create } from 'zustand'
import type { AssetType, AssetDetail } from '~/types/telemetry'

interface SelectionState {
  selectedAssetId: string | null
  selectedAssetType: AssetType | null
  detailData: AssetDetail | null
  select: (id: string, type: AssetType) => void
  deselect: () => void
  setDetailData: (data: AssetDetail | null) => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedAssetId: null,
  selectedAssetType: null,
  detailData: null,
  select: (id, type) =>
    set({ selectedAssetId: id, selectedAssetType: type, detailData: null }),
  deselect: () =>
    set({ selectedAssetId: null, selectedAssetType: null, detailData: null }),
  setDetailData: (data) => set({ detailData: data }),
}))
