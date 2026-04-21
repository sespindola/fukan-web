import { useEffect } from 'react'
import type { Viewer } from 'cesium'
import { useStreamStore } from '~/stores/streamStore'
import { useBgpEventStore } from '~/stores/bgpEventStore'
import { useLayerStore } from '~/stores/layerStore'
import { useSelectionStore } from '~/stores/selectionStore'
import type { AircraftLayer } from '~/components/globe/layers/AircraftLayer'
import type { VesselLayer } from '~/components/globe/layers/VesselLayer'
import type { SatelliteLayer } from '~/components/globe/layers/SatelliteLayer'
import type { BgpLayer } from '~/components/globe/layers/BgpLayer'
import type { NewsLayer } from '~/components/globe/layers/NewsLayer'
import type { BgpEvent, FukanEvent } from '~/types/telemetry'

export interface LayerManagers {
  aircraft: AircraftLayer
  vessels: VesselLayer
  satellites: SatelliteLayer
  bgp: BgpLayer
  news: NewsLayer
}

/**
 * Wire up streamStore subscriptions to imperative CesiumJS layer managers.
 * Also subscribes to layerStore to toggle visibility of each layer.
 * Updates happen outside React render cycle.
 */
export function useTelemetry(
  viewer: Viewer | null,
  layers: LayerManagers | null,
): void {
  useEffect(() => {
    if (!viewer || !layers) return

    const unsubs = [
      // Data subscriptions
      useStreamStore.subscribe(
        (state) => state.aircraft,
        (data: Map<string, FukanEvent>) => {
          layers.aircraft.update(data)
          viewer.scene.requestRender()
        },
      ),
      useStreamStore.subscribe(
        (state) => state.vessels,
        (data: Map<string, FukanEvent>) => {
          layers.vessels.update(data)
          viewer.scene.requestRender()
        },
      ),
      useStreamStore.subscribe(
        (state) => state.satellites,
        (data: Map<string, FukanEvent>) => {
          layers.satellites.update(data)
          viewer.scene.requestRender()
        },
      ),
      useBgpEventStore.subscribe(
        (state) => state.events,
        (data: Map<string, BgpEvent>) => {
          layers.bgp.update(data)
          viewer.scene.requestRender()
        },
      ),

      // Visibility subscriptions
      useLayerStore.subscribe((state) => {
        layers.aircraft.setVisible(state.layers.aircraft.visible)
        layers.vessels.setVisible(state.layers.vessel.visible)
        layers.satellites.setVisible(state.layers.satellite.visible)
        layers.bgp.setVisible(state.layers.bgp_node.visible)
        layers.news.setVisible(state.layers.news.visible)
        viewer.scene.requestRender()
      }),

      // Selection-driven overlays: satellites get an orbit+footprint draw,
      // BGP events get an AS-path polyline. Both clear on deselect or on
      // selection of a different asset type.
      useSelectionStore.subscribe((state) => {
        if (state.selectedAssetType === 'satellite') {
          layers.satellites.showDetails(state.selectedAssetId)
          layers.bgp.clearDetails()
        } else if (state.selectedAssetType === 'bgp_node') {
          layers.bgp.showDetails(state.selectedAssetId)
          layers.satellites.showDetails(null)
        } else {
          layers.satellites.showDetails(null)
          layers.bgp.clearDetails()
        }
        viewer.scene.requestRender()
      }),
    ]

    // Apply initial visibility from persisted store
    const { layers: initial } = useLayerStore.getState()
    layers.aircraft.setVisible(initial.aircraft.visible)
    layers.vessels.setVisible(initial.vessel.visible)
    layers.satellites.setVisible(initial.satellite.visible)
    layers.bgp.setVisible(initial.bgp_node.visible)
    layers.news.setVisible(initial.news.visible)

    return () => {
      unsubs.forEach((fn) => fn())
    }
  }, [viewer, layers])
}
