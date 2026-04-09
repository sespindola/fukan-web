import { useEffect } from 'react'
import type { Viewer } from 'cesium'
import { useStreamStore } from '~/stores/streamStore'
import { useLayerStore } from '~/stores/layerStore'
import type { AircraftLayer } from '~/components/globe/layers/AircraftLayer'
import type { VesselLayer } from '~/components/globe/layers/VesselLayer'
import type { SatelliteLayer } from '~/components/globe/layers/SatelliteLayer'
import type { BgpLayer } from '~/components/globe/layers/BgpLayer'
import type { NewsLayer } from '~/components/globe/layers/NewsLayer'
import type { FukanEvent } from '~/types/telemetry'

export interface LayerManagers {
  aircraft: AircraftLayer
  vessels: VesselLayer
  satellites: SatelliteLayer
  bgp: BgpLayer
  news: NewsLayer
}

/**
 * Wire up streamStore subscriptions to imperative CesiumJS layer managers.
 * Updates happen outside React render cycle.
 */
export function useTelemetry(
  viewer: Viewer | null,
  layers: LayerManagers | null,
): void {
  useEffect(() => {
    if (!viewer || !layers) return

    const unsubs = [
      // Stream data → layer updates
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
      useStreamStore.subscribe(
        (state) => state.bgp,
        (data: Map<string, FukanEvent>) => {
          layers.bgp.update(data)
          viewer.scene.requestRender()
        },
      ),

      // Layer visibility toggles
      useLayerStore.subscribe(
        (state) => state.layers.aircraft.visible,
        (visible: boolean) => {
          layers.aircraft.setVisible(visible)
          viewer.scene.requestRender()
        },
      ),
      useLayerStore.subscribe(
        (state) => state.layers.vessel.visible,
        (visible: boolean) => {
          layers.vessels.setVisible(visible)
          viewer.scene.requestRender()
        },
      ),
      useLayerStore.subscribe(
        (state) => state.layers.satellite.visible,
        (visible: boolean) => {
          layers.satellites.setVisible(visible)
          viewer.scene.requestRender()
        },
      ),
      useLayerStore.subscribe(
        (state) => state.layers.bgp_node.visible,
        (visible: boolean) => {
          layers.bgp.setVisible(visible)
          viewer.scene.requestRender()
        },
      ),
    ]

    return () => {
      unsubs.forEach((fn) => fn())
    }
  }, [viewer, layers])
}
