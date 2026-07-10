import { useEffect } from 'react'
import type { Viewer } from 'cesium'
import { subscribeDelta } from '~/stores/streamStore'
import { useBgpEventStore } from '~/stores/bgpEventStore'
import { useLayerStore } from '~/stores/layerStore'
import { useSelectionStore } from '~/stores/selectionStore'
import { perfTime } from '~/lib/perf'
import type { AircraftLayer } from '~/components/globe/layers/AircraftLayer'
import type { VesselLayer } from '~/components/globe/layers/VesselLayer'
import type { SatelliteLayer } from '~/components/globe/layers/SatelliteLayer'
import type { BgpLayer } from '~/components/globe/layers/BgpLayer'
import type { NewsLayer } from '~/components/globe/layers/NewsLayer'
import type { CableLayer } from '~/components/globe/layers/CableLayer'
import type { BgpEvent } from '~/types/telemetry'

export interface LayerManagers {
  aircraft: AircraftLayer
  vessels: VesselLayer
  satellites: SatelliteLayer
  bgp: BgpLayer
  news: NewsLayer
  cables: CableLayer
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
      // Moving-asset layers consume per-frame deltas from streamStore —
      // see subscribeDelta(). Layer work scales with events that moved
      // this frame, not with total session history.
      subscribeDelta('aircraft', (delta) => {
        perfTime(
          'layer.aircraft.applyDelta',
          () => layers.aircraft.applyDelta(delta),
          { changed: delta.changed.size, removed: delta.removed.size },
        )
        viewer.scene.requestRender()
      }),
      subscribeDelta('vessels', (delta) => {
        perfTime(
          'layer.vessels.applyDelta',
          () => layers.vessels.applyDelta(delta),
          { changed: delta.changed.size, removed: delta.removed.size },
        )
        viewer.scene.requestRender()
      }),
      subscribeDelta('satellites', (delta) => {
        perfTime(
          'layer.satellites.applyDelta',
          () => layers.satellites.applyDelta(delta),
          { changed: delta.changed.size, removed: delta.removed.size },
        )
        viewer.scene.requestRender()
      }),
      // BGP retains the whole-map subscribe pattern: bgpEventStore is
      // bounded (3000 hard cap, 15-min age sweep) so iteration stays cheap,
      // and BGP events are one-time happenings where "changed" vs "removed"
      // maps awkwardly onto the underlying semantics.
      useBgpEventStore.subscribe(
        (state) => state.events,
        (data: Map<string, BgpEvent>) => {
          perfTime('layer.bgp.update', () => layers.bgp.update(data), { size: data.size })
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
