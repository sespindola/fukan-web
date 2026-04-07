import { useEffect, useRef, useState } from 'react'
import { Cartesian2, ScreenSpaceEventHandler, ScreenSpaceEventType, type Viewer } from 'cesium'
import { configureViewer } from './CesiumSetup'
import { createViewer, setBasemapImagery } from '~/lib/cesium'
import { useViewport } from '~/hooks/useViewport'
import { useAnyCable } from '~/hooks/useAnyCable'
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

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
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

      // Store layer refs for cleanup (managed internally)
      ;(v as unknown as Record<string, unknown>).__layers = {
        aircraft,
        vessels,
        satellites,
        bgp,
        news,
      }

      // Click handler for asset selection
      const handler = new ScreenSpaceEventHandler(v.scene.canvas)
      handler.setInputAction((click: { position: Cartesian2 }) => {
        const picked = v.scene.pick(click.position)
        if (!picked?.primitive) {
          useSelectionStore.getState().deselect()
          return
        }
        const icao24 = aircraft.getPickedId(picked.primitive)
        if (icao24) {
          useSelectionStore.getState().select(icao24, 'aircraft')
        } else {
          useSelectionStore.getState().deselect()
        }
      }, ScreenSpaceEventType.LEFT_CLICK)
      ;(v as unknown as Record<string, unknown>).__clickHandler = handler
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

  // Wire up viewport tracking and AnyCable
  useViewport(viewer)
  useAnyCable()

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <AircraftDetailPanel />
      <div className="absolute bottom-4 left-4">
        <ViewportInfo />
      </div>
      <div className="absolute bottom-4 right-4">
        <Attribution />
      </div>
    </div>
  )
}
