import { Ion, Cartesian3, Math as CesiumMath, HeadingPitchRoll, createWorldTerrainAsync, type Viewer } from 'cesium'
import { useGlobeStore } from '~/stores/globeStore'

export interface ViewerConfig {
  cesiumIonToken: string
}

/**
 * Configure Cesium Ion and return viewer constructor options.
 * Call this before creating the Viewer instance.
 */
export function configureCesiumIon(token: string): void {
  Ion.defaultAccessToken = token
}

/**
 * Apply post-creation configuration to the viewer.
 */
export function configureViewer(viewer: Viewer): void {
  // Restore persisted camera position or use defaults
  const { longitude, latitude, height, heading, pitch, roll } = useGlobeStore.getState()
  viewer.camera.setView({
    destination: Cartesian3.fromRadians(longitude, latitude, height),
    orientation: new HeadingPitchRoll(heading, pitch, roll),
  })

  // Enable camera change events for viewport tracking
  viewer.camera.percentageChanged = 0.01
}
