import type { LayerMap } from './globe'

export interface SharedProps {
  user: {
    id: number
    email: string
    name: string
  }
  organization: {
    id: number
    name: string
  }
  flash: {
    notice?: string
    alert?: string
  }
}

export interface DashboardProps extends SharedProps {
  savedViews: SavedViewProps[]
  layerDefaults: LayerMap
}

export interface SavedViewProps {
  id: number
  name: string
  center: [number, number]
  zoom: number
  layers: LayerMap
  timeline: { mode: 'live' } | { mode: 'replay'; ts: number }
}
