import { Cartesian3, HeadingPitchRoll, type Viewer } from 'cesium'
import { useGlobeStore } from '~/stores/globeStore'

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
