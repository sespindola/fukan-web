import {
  Viewer,
  Cartesian3,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
  type Viewer as ViewerType,
} from 'cesium'
import type { BasemapType, LightingMode } from '~/stores/basemapStore'

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

  // Cap zoom: 10 km min (regional analytics focus), 50,000 km max (above GEO orbit)
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 10_000
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 50_000_000

  // Set initial camera view
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(-35, 40, 10_000_000),
  })

  return viewer
}

export function setBasemapImagery(
  viewer: ViewerType,
  type: BasemapType,
  lighting: LightingMode = 'auto',
): void {
  viewer.imageryLayers.removeAll()

  if (type === 'map') {
    const maptilerKey = import.meta.env.VITE_MAPTILER_KEY

    // Day: MapTiler Streets v2 (light, English labels, @2x retina)
    const lightLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}@2x.png?key=${maptilerKey}&language=en`,
        credit: '© MapTiler © OpenStreetMap contributors',
        maximumLevel: 19,
        tileWidth: 512,
        tileHeight: 512,
      }),
    )

    // Night: MapTiler Dark (English labels, @2x retina)
    const darkLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: `https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}@2x.png?key=${maptilerKey}&language=en`,
        credit: '',
        maximumLevel: 19,
        tileWidth: 512,
        tileHeight: 512,
      }),
    )

    if (lighting === 'auto') {
      lightLayer.show = true
      lightLayer.dayAlpha = 1.0
      lightLayer.nightAlpha = 0.0
      darkLayer.show = true
      darkLayer.dayAlpha = 0.0
      darkLayer.nightAlpha = 1.0
      viewer.scene.globe.enableLighting = true
    } else if (lighting === 'day') {
      lightLayer.show = true
      darkLayer.show = false
      viewer.scene.globe.enableLighting = false
    } else {
      // night — lower brightness to match the shading enableLighting applies in auto mode
      lightLayer.show = false
      darkLayer.show = true
      darkLayer.brightness = 0.2
      viewer.scene.globe.enableLighting = false
    }
  } else {
    const baseLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
        maximumLevel: 15,
        credit: 'Sentinel-2 cloudless by EOX – Contains modified Copernicus Sentinel data',
      }),
    )

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

    if (lighting === 'auto') {
      baseLayer.show = true
      baseLayer.dayAlpha = 1.0
      baseLayer.nightAlpha = 0.3
      nightLayer.show = true
      nightLayer.dayAlpha = 0.0
      nightLayer.nightAlpha = 1.0
      viewer.scene.globe.enableLighting = true
    } else if (lighting === 'day') {
      baseLayer.show = true
      nightLayer.show = false
      viewer.scene.globe.enableLighting = false
    } else {
      // night — lower brightness to match the shading enableLighting applies in auto mode
      baseLayer.show = false
      nightLayer.show = true
      nightLayer.brightness = 0.2
      viewer.scene.globe.enableLighting = false
    }
  }

  viewer.scene.requestRender()
}
