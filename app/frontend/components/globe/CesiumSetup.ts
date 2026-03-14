import { Ion, Cartesian3, createWorldTerrainAsync, type Viewer } from 'cesium'

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
  // Set initial camera
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(0, 20, 20_000_000),
  })

  // Enable camera change events for viewport tracking
  viewer.camera.percentageChanged = 0.01
}
