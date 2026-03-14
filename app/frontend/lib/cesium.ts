import {
  Ion,
  Viewer,
  Cartesian3,
  createWorldTerrainAsync,
  type Viewer as ViewerType,
} from 'cesium'

export interface CesiumViewerOptions {
  container: string | HTMLElement
  cesiumIonToken: string
}

/**
 * Initialize CesiumJS viewer with Cesium Ion terrain and imagery.
 * All default UI widgets are disabled — we render our own React controls.
 */
export async function createViewer({
  container,
  cesiumIonToken,
}: CesiumViewerOptions): Promise<ViewerType> {
  Ion.defaultAccessToken = cesiumIonToken

  const viewer = new Viewer(container, {
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    terrainProvider: await createWorldTerrainAsync(),
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
  })

  // Set initial camera view
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(-35, 40, 10_000_000),
  })

  return viewer
}
