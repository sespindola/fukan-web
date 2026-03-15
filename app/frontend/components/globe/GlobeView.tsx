import { useEffect, useRef, useState } from 'react'
import type { Viewer } from 'cesium'
import { configureCesiumIon, configureViewer } from './CesiumSetup'
import { createViewer, setBasemapImagery } from '~/lib/cesium'
import { useViewport } from '~/hooks/useViewport'
import { useAnyCable } from '~/hooks/useAnyCable'
import { useBasemapStore } from '~/stores/basemapStore'
import { AircraftLayer } from './layers/AircraftLayer'
import { VesselLayer } from './layers/VesselLayer'
import { SatelliteLayer } from './layers/SatelliteLayer'
import { BgpLayer } from './layers/BgpLayer'
import { NewsLayer } from './layers/NewsLayer'
import { ViewportInfo } from './controls/ViewportInfo'
import { BasemapToggle } from './controls/BasemapToggle'

interface GlobeViewProps {
  cesiumIonToken: string
}

export function GlobeView({ cesiumIonToken }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const basemap = useBasemapStore((s) => s.basemap)

  useEffect(() => {
    if (!containerRef.current) return

    let mounted = true
    let viewerInstance: Viewer | null = null

    async function init() {
      configureCesiumIon(cesiumIonToken)
      const v = await createViewer({
        container: containerRef.current!,
        cesiumIonToken,
      })

      if (!mounted) {
        v.destroy()
        return
      }

      configureViewer(v)
      await setBasemapImagery(v, useBasemapStore.getState().basemap)
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
    }

    init()

    return () => {
      mounted = false
      if (viewerInstance && !viewerInstance.isDestroyed()) {
        viewerInstance.destroy()
      }
    }
  }, [cesiumIonToken])

  // Switch basemap imagery when toggle changes
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    setBasemapImagery(viewer, basemap)
  }, [viewer, basemap])

  // Wire up viewport tracking and AnyCable
  useViewport(viewer)
  useAnyCable()

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute bottom-4 left-4">
        <ViewportInfo />
      </div>
      <div className="absolute bottom-4 right-4">
        <BasemapToggle />
      </div>
    </div>
  )
}
