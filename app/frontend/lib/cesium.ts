import {
  Viewer,
  Cartesian3,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
  type Viewer as ViewerType,
} from 'cesium'
import type { BasemapType } from '~/stores/basemapStore'

export interface CesiumViewerOptions {
  container: string | HTMLElement
}

/**
 * Initialize CesiumJS viewer with WGS84 ellipsoid (no terrain).
 * Default imagery is disabled — call setBasemapImagery after creation.
 */
export function createViewer({
  container,
}: CesiumViewerOptions): ViewerType {
  const viewer = new Viewer(container, {
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    terrain: undefined,
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

export function setBasemapImagery(
  viewer: ViewerType,
  type: BasemapType,
): void {
  viewer.imageryLayers.removeAll()

  if (type === 'map') {
    // Day side: CartoDB light
    const lightLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: '© CARTO © OpenStreetMap contributors',
        maximumLevel: 19,
      }),
    )
    lightLayer.dayAlpha = 1.0
    lightLayer.nightAlpha = 0.0

    // Night side: CartoDB dark
    const darkLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: '',
        maximumLevel: 19,
      }),
    )
    darkLayer.dayAlpha = 0.0
    darkLayer.nightAlpha = 1.0

    // Labels on top (always visible)
    const labelLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: '',
        maximumLevel: 19,
      }),
    )
    labelLayer.brightness = 1.5

    viewer.scene.globe.enableLighting = true
  } else {
    const baseLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
        maximumLevel: 15,
        credit: 'Sentinel-2 cloudless by EOX – Contains modified Copernicus Sentinel data',
      }),
    )
    baseLayer.dayAlpha = 1.0
    baseLayer.nightAlpha = 0.3

    const nightLayer = viewer.imageryLayers.addImageryProvider(
      new WebMapTileServiceImageryProvider({
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi',
        layer: 'VIIRS_Black_Marble',
        style: 'default',
        tileMatrixSetID: 'GoogleMapsCompatible_Level8',
        format: 'image/png',
        tilingScheme: new WebMercatorTilingScheme(),
        credit: 'NASA Earth Observatory',
      }),
    )
    nightLayer.dayAlpha = 0.0
    nightLayer.nightAlpha = 1.0

    viewer.scene.globe.enableLighting = true
  }

  viewer.scene.requestRender()
}
