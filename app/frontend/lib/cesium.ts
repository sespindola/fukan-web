import {
  Ion,
  Viewer,
  Cartesian3,
  createWorldTerrainAsync,
  UrlTemplateImageryProvider,
  IonImageryProvider,
  type Viewer as ViewerType,
} from 'cesium'
import type { BasemapType } from '~/stores/basemapStore'

export interface CesiumViewerOptions {
  container: string | HTMLElement
  cesiumIonToken: string
}

/**
 * Initialize CesiumJS viewer with Cesium Ion terrain.
 * Default imagery is disabled — call setBasemapImagery after creation.
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
    baseLayer: false,
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

export async function setBasemapImagery(
  viewer: ViewerType,
  type: BasemapType,
): Promise<void> {
  viewer.imageryLayers.removeAll()

  if (type === 'map') {
    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: '© CARTO © OpenStreetMap contributors',
        maximumLevel: 19,
      }),
    )
  } else {
    viewer.imageryLayers.addImageryProvider(
      await IonImageryProvider.fromAssetId(2),
    )
  }

  viewer.scene.requestRender()
}
