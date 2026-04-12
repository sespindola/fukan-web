import { useEffect, useRef, useState } from 'react'
import { Cartesian2, Cartographic, ScreenSpaceEventHandler, ScreenSpaceEventType, type Viewer } from 'cesium'
import { configureViewer } from './CesiumSetup'
import { createViewer, setBasemapImagery } from '~/lib/cesium'
import { useViewport } from '~/hooks/useViewport'
import { useAnyCable } from '~/hooks/useAnyCable'
import { useTelemetry, type LayerManagers } from '~/hooks/useTelemetry'
import { useBasemapStore } from '~/stores/basemapStore'
import { useSelectionStore } from '~/stores/selectionStore'
import { AircraftLayer } from './layers/AircraftLayer'
import { VesselLayer } from './layers/VesselLayer'
import { SatelliteLayer } from './layers/SatelliteLayer'
import { BgpLayer } from './layers/BgpLayer'
import { NewsLayer } from './layers/NewsLayer'
import { ViewportInfo } from './controls/ViewportInfo'
import { Attribution } from './controls/Attribution'
import { AircraftDetailPanel } from './controls/AircraftDetailPanel'
import { VesselDetailPanel } from './controls/VesselDetailPanel'
import { SatelliteDetailPanel } from './controls/SatelliteDetailPanel'

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [layers, setLayers] = useState<LayerManagers | null>(null)
  const [loading, setLoading] = useState(true)
  const basemap = useBasemapStore((s) => s.basemap)
  const lighting = useBasemapStore((s) => s.lighting)

  useEffect(() => {
    if (!containerRef.current) return

    let mounted = true
    let viewerInstance: Viewer | null = null

    function init() {
      const v = createViewer({
        container: containerRef.current!,
      })

      if (!mounted) {
        v.destroy()
        return
      }

      configureViewer(v)
      setBasemapImagery(v, useBasemapStore.getState().basemap, useBasemapStore.getState().lighting)
      viewerInstance = v
      setViewer(v)

      // Initialize imperative layers
      const aircraft = new AircraftLayer(v)
      const vessels = new VesselLayer(v)
      const satellites = new SatelliteLayer(v)
      const bgp = new BgpLayer(v)
      const news = new NewsLayer(v)

      setLayers({ aircraft, vessels, satellites, bgp, news })

      // Input handlers
      const handler = new ScreenSpaceEventHandler(v.scene.canvas)

      // Click: asset selection
      handler.setInputAction((click: { position: Cartesian2 }) => {
        const picked = v.scene.pick(click.position)
        if (!picked?.primitive) {
          useSelectionStore.getState().deselect()
          return
        }
        const icao24 = aircraft.getPickedId(picked)
        if (icao24) {
          useSelectionStore.getState().select(icao24, 'aircraft')
          return
        }
        const mmsi = vessels.getPickedId(picked)
        if (mmsi) {
          useSelectionStore.getState().select(mmsi, 'vessel')
          return
        }
        const norad = satellites.getPickedId(picked)
        if (norad) {
          useSelectionStore.getState().select(norad, 'satellite')
          return
        }
        useSelectionStore.getState().deselect()
      }, ScreenSpaceEventType.LEFT_CLICK)

      // Double-click: fly to position
      handler.setInputAction((click: { position: Cartesian2 }) => {
        const cartesian = v.scene.pickPosition(click.position)
        if (!cartesian) return
        const carto = Cartographic.fromCartesian(cartesian)
        v.camera.flyTo({
          destination: Cartographic.toCartesian(
            new Cartographic(carto.longitude, carto.latitude, v.camera.positionCartographic.height)
          ),
          duration: 1.0,
        })
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

      // Hover: pointer cursor over pickable assets
      handler.setInputAction((move: { endPosition: Cartesian2 }) => {
        const picked = v.scene.pick(move.endPosition)
        ;(v.container as HTMLElement).style.cursor = picked?.primitive ? 'pointer' : ''
      }, ScreenSpaceEventType.MOUSE_MOVE)

      ;(v as unknown as Record<string, unknown>).__clickHandler = handler
      setLoading(false)
    }

    init()

    return () => {
      mounted = false
      if (viewerInstance && !viewerInstance.isDestroyed()) {
        const h = (viewerInstance as unknown as Record<string, unknown>).__clickHandler
        if (h instanceof ScreenSpaceEventHandler) h.destroy()
        viewerInstance.destroy()
      }
    }
  }, [])

  // Switch basemap imagery when toggle changes
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    setBasemapImagery(viewer, basemap, lighting)
  }, [viewer, basemap, lighting])

  // Periodically re-render so the day/night terminator updates
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    const id = setInterval(() => {
      if (!viewer.isDestroyed()) viewer.scene.requestRender()
    }, 60_000)
    return () => clearInterval(id)
  }, [viewer, basemap])

  // Wire up viewport tracking, telemetry subscriptions, and AnyCable
  useViewport(viewer)
  useTelemetry(viewer, layers)
  useAnyCable()

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />
            <span className="text-sm text-white/60">Loading globe…</span>
          </div>
        </div>
      )}
      <AircraftDetailPanel />
      <VesselDetailPanel />
      <SatelliteDetailPanel />
      <div className="absolute bottom-4 left-4">
        <ViewportInfo />
      </div>
      <div className="absolute bottom-4 right-4">
        <Attribution />
      </div>
    </div>
  )
}
