import { useEffect } from 'react'
import type { Viewer } from 'cesium'
import { subscribeDelta } from '~/stores/streamStore'
import { useBgpEventStore } from '~/stores/bgpEventStore'
import { useLayerStore } from '~/stores/layerStore'
import { useSelectionStore } from '~/stores/selectionStore'
import { useAggregateStore } from '~/stores/aggregateStore'
import { useGlobeStore } from '~/stores/globeStore'
import { perfTime } from '~/lib/perf'
import type { AircraftLayer } from '~/components/globe/layers/AircraftLayer'
import type { VesselLayer } from '~/components/globe/layers/VesselLayer'
import type { SatelliteLayer } from '~/components/globe/layers/SatelliteLayer'
import type { BgpLayer } from '~/components/globe/layers/BgpLayer'
import type { NewsLayer } from '~/components/globe/layers/NewsLayer'
import type { CableLayer } from '~/components/globe/layers/CableLayer'
import type { TelemetryDensityLayer } from '~/components/globe/layers/TelemetryDensityLayer'
import type { BgpEvent } from '~/types/telemetry'
import type { StreamDelta } from '~/stores/streamStore'
import { aggregateModeForResolution } from '~/lib/telemetryMode'

const MAX_LAYER_CHANGES_PER_CHUNK = 64
const LAYER_FRAME_BUDGET_MS = 6

function createDeltaScheduler(apply: (delta: StreamDelta) => void): {
  push: (delta: StreamDelta) => void
  destroy: () => void
} {
  const changed = new Map<string, import('~/types/telemetry').FukanEvent>()
  const removed = new Set<string>()
  let frame = 0

  const drain = () => {
    frame = 0
    const deadline = performance.now() + LAYER_FRAME_BUDGET_MS

    do {
      const chunk: StreamDelta = { changed: new Map(), removed: new Set() }
      let chunkBudget = MAX_LAYER_CHANGES_PER_CHUNK
      for (const id of removed) {
        chunk.removed.add(id)
        removed.delete(id)
        if (--chunkBudget === 0) break
      }
      if (chunkBudget > 0) {
        for (const [id, event] of changed) {
          chunk.changed.set(id, event)
          changed.delete(id)
          if (--chunkBudget === 0) break
        }
      }
      apply(chunk)
    } while ((changed.size > 0 || removed.size > 0) && performance.now() < deadline)

    if (changed.size > 0 || removed.size > 0) frame = requestAnimationFrame(drain)
  }

  return {
    push(delta) {
      for (const id of delta.removed) {
        changed.delete(id)
        removed.add(id)
      }
      for (const [id, event] of delta.changed) {
        removed.delete(id)
        const current = changed.get(id)
        if (!current || event.ts >= current.ts) changed.set(id, event)
      }
      if (frame === 0) frame = requestAnimationFrame(drain)
    },
    destroy() {
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      changed.clear()
      removed.clear()
    },
  }
}

export interface LayerManagers {
  aircraft: AircraftLayer
  vessels: VesselLayer
  satellites: SatelliteLayer
  bgp: BgpLayer
  news: NewsLayer
  cables: CableLayer
  density: TelemetryDensityLayer
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

    const aircraftScheduler = createDeltaScheduler((delta) => {
      perfTime('layer.aircraft.applyDelta', () => layers.aircraft.applyDelta(delta), {
        changed: delta.changed.size, removed: delta.removed.size,
      })
      viewer.scene.requestRender()
    })
    const vesselScheduler = createDeltaScheduler((delta) => {
      perfTime('layer.vessels.applyDelta', () => layers.vessels.applyDelta(delta), {
        changed: delta.changed.size, removed: delta.removed.size,
      })
      viewer.scene.requestRender()
    })
    const satelliteScheduler = createDeltaScheduler((delta) => {
      perfTime('layer.satellites.applyDelta', () => layers.satellites.applyDelta(delta), {
        changed: delta.changed.size, removed: delta.removed.size,
      })
      viewer.scene.requestRender()
    })

    const unsubs = [
      // Moving-asset layers consume per-frame deltas from streamStore —
      // see subscribeDelta(). Layer work scales with events that moved
      // this frame, not with total session history.
      subscribeDelta('aircraft', (delta) => {
        aircraftScheduler.push(delta)
      }),
      subscribeDelta('vessels', (delta) => {
        vesselScheduler.push(delta)
      }),
      subscribeDelta('satellites', (delta) => {
        satelliteScheduler.push(delta)
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
      useAggregateStore.subscribe(
        (state) => state.cells,
        (cells) => {
          const visibility = useLayerStore.getState().layers
          layers.density.update(cells.filter((cell) => visibility[cell.type].visible))
        },
      ),
      useGlobeStore.subscribe(
        (state) => state.viewportResolution,
        (resolution) => {
          const aggregateMode = aggregateModeForResolution(resolution)
          const visibility = useLayerStore.getState().layers
          layers.aircraft.setVisible(!aggregateMode && visibility.aircraft.visible)
          layers.vessels.setVisible(!aggregateMode && visibility.vessel.visible)
          layers.satellites.setVisible(!aggregateMode && visibility.satellite.visible)
          layers.density.setVisible(aggregateMode)
          viewer.scene.requestRender()
        },
      ),

      // Visibility subscriptions
      useLayerStore.subscribe((state) => {
        const aggregateMode = aggregateModeForResolution(useGlobeStore.getState().viewportResolution)
        layers.aircraft.setVisible(!aggregateMode && state.layers.aircraft.visible)
        layers.vessels.setVisible(!aggregateMode && state.layers.vessel.visible)
        layers.satellites.setVisible(!aggregateMode && state.layers.satellite.visible)
        layers.bgp.setVisible(state.layers.bgp_node.visible)
        layers.news.setVisible(state.layers.news.visible)
        layers.density.update(useAggregateStore.getState().cells.filter((cell) => state.layers[cell.type].visible))
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
    const initialAggregateMode = aggregateModeForResolution(useGlobeStore.getState().viewportResolution)
    layers.aircraft.setVisible(!initialAggregateMode && initial.aircraft.visible)
    layers.vessels.setVisible(!initialAggregateMode && initial.vessel.visible)
    layers.satellites.setVisible(!initialAggregateMode && initial.satellite.visible)
    layers.bgp.setVisible(initial.bgp_node.visible)
    layers.news.setVisible(initial.news.visible)
    layers.density.update(
      useAggregateStore.getState().cells.filter((cell) => initial[cell.type].visible),
    )
    layers.density.setVisible(initialAggregateMode)

    return () => {
      unsubs.forEach((fn) => fn())
      aircraftScheduler.destroy()
      vesselScheduler.destroy()
      satelliteScheduler.destroy()
    }
  }, [viewer, layers])
}
