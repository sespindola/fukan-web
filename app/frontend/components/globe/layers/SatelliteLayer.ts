import {
  BillboardCollection,
  BoundingSphere,
  Cartesian3,
  Color,
  HeadingPitchRange,
  Material,
  NearFarScalar,
  PolylineCollection,
  type Viewer,
  EllipseGeometry,
  GeometryInstance,
  GroundPrimitive,
  ColorGeometryInstanceAttribute,
} from 'cesium'
import type { FukanEvent } from '~/types/telemetry'
import { decodeLat, decodeLon } from '~/lib/coords'
import {
  computeOrbitPath,
  coverageRadiusMeters,
  getHalfAngle,
} from '~/lib/orbitMath'
import { useStreamStore } from '~/stores/streamStore'

/**
 * Satellite layer tint — distinct from aircraft/vessel white billboards.
 * Matches the `bg-violet-400` swatch in Sidebar's layer legend so the
 * globe and the control panel agree on what "satellite" looks like.
 */
const SAT_COLOR = Color.fromCssColorString('#a78bfa')

/**
 * Imperative layer manager for satellite positions, orbit paths, and
 * coverage footprints. Satellites are rendered at true orbital altitude.
 *
 * - Billboards: satellite position at orbital height (pickable)
 * - PolylineCollection: inclined great-circle orbit approximation for the
 *   selected satellite. Not SGP4-accurate — see computeOrbitPath() in
 *   ~/lib/orbitMath for the model and its caveats.
 * - GroundPrimitive: estimated coverage footprint draped on terrain
 *
 * Orbit + coverage are only drawn for the selected satellite. Both
 * redraw automatically when the selected satellite's position updates
 * so the orbit stays anchored to the live billboard.
 */
// Pitch threshold (radians from horizon) below which we consider the
// camera to be in a "roughly top-down" view and therefore safe to
// auto-tilt on selection. -π/3 = -60°; anything more tilted than this
// is left alone so we don't fight a user who's already positioned
// their own cinematic angle.
const TOPDOWN_PITCH_THRESHOLD = -Math.PI / 3

// Selection-tilt target pitch — 45° from horizon gives orbit arcs and
// altitude spread a clear 3D read without disorienting the user.
const SELECTION_PITCH = -Math.PI / 4

const SELECTION_FLY_DURATION = 1.0

export class SatelliteLayer {
  private viewer: Viewer
  private billboards: BillboardCollection
  private orbitLines: PolylineCollection
  private billboardMap = new Map<string, number>()
  private coveragePrimitive: GroundPrimitive | null = null
  private selectedId: string | null = null

  // Saved camera state from before the user entered satellite selection.
  // Populated on the first selection, restored on deselect, cleared if
  // the user manually moves the camera while a satellite is selected.
  private savedCameraPos: Cartesian3 | null = null
  private savedHeading = 0
  private savedPitch = -Math.PI / 2
  private userMoveHandler: (() => void) | null = null

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.billboards = viewer.scene.primitives.add(new BillboardCollection({
      scene: viewer.scene,
    }))
    this.orbitLines = viewer.scene.primitives.add(new PolylineCollection())
  }

  update(satellites: Map<string, FukanEvent>): void {
    const activeIds = new Set<string>()

    for (const [id, event] of satellites) {
      activeIds.add(id)
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        event.alt, // true orbital altitude in meters
      )

      const existingIndex = this.billboardMap.get(id)
      if (existingIndex !== undefined) {
        const billboard = this.billboards.get(existingIndex)
        billboard.position = position
      } else {
        this.billboards.add({
          position,
          image: '/icons/satellite.svg',
          scale: 0.6,
          color: SAT_COLOR,
          scaleByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.3),
          translucencyByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.5),
          id,
        })
        this.billboardMap.set(id, this.billboards.length - 1)
      }
    }

    if (activeIds.size < this.billboardMap.size) {
      this.rebuild(satellites)
    }

    // Refresh the orbit/coverage for the selected satellite if it just
    // received a new position. computeOrbitPath is cheap (~180 trig ops),
    // and this keeps the drawn orbit line anchored to the billboard even
    // as the satellite propagates around.
    if (this.selectedId && activeIds.has(this.selectedId)) {
      this.drawDetails(this.selectedId)
    }
  }

  /** Returns the NORAD id for a picked billboard, or null. */
  getPickedId(picked: unknown): string | null {
    if (!picked || typeof picked !== 'object') return null
    const obj = picked as { id?: string; collection?: unknown }
    if (obj.collection === this.billboards && typeof obj.id === 'string') {
      return obj.id
    }
    return null
  }

  /**
   * Mark a satellite as selected (or deselect). Draws the inclined
   * great-circle orbit approximation + estimated coverage footprint.
   * Both are ESTIMATES — see computeOrbitPath() and getHalfAngle().
   *
   * Selection also triggers a camera auto-tilt to ~45°, framed on the
   * satellite's position and altitude, so orbit inclination and LEO-vs-
   * GEO altitude spread are legible. Deselect flies back to the pre-
   * selection camera state. Skipped entirely if the user was already
   * tilted (don't override their chosen perspective).
   */
  showDetails(id: string | null): void {
    const prevId = this.selectedId
    this.selectedId = id
    this.drawDetails(id)

    if (id && id !== prevId) {
      // New selection — save state only if this is a fresh entry (prevId
      // null). Switching between satellites re-frames the camera but keeps
      // the original pre-selection state so deselect still goes home.
      this.flyToSatellite(id, /* save */ !prevId)
    } else if (!id && prevId) {
      this.flyBack()
    }
  }

  /** Fly the camera to a 45°-tilted view framed on the given satellite. */
  private flyToSatellite(id: string, save: boolean): void {
    this.viewer.camera.cancelFlight()
    this.disarmUserMoveDetector()

    const event = this.findEvent(id)
    if (!event) return

    if (save) {
      // Only save + fly if the user is currently in a roughly top-down
      // view; if they've already tilted manually, leave them alone.
      if (this.viewer.camera.pitch >= TOPDOWN_PITCH_THRESHOLD) {
        this.savedCameraPos = null
        return
      }
      this.savedCameraPos = this.viewer.camera.positionWC.clone()
      this.savedHeading = this.viewer.camera.heading
      this.savedPitch = this.viewer.camera.pitch
    }

    const target = Cartesian3.fromDegrees(
      decodeLon(event.lon),
      decodeLat(event.lat),
      event.alt,
    )

    // Range scales with altitude so both LEO (~400 km) and GEO (~36,000 km)
    // land in a legible frame. Floor at 500 km so very-low orbits don't get
    // a microscope view.
    const range = Math.max(event.alt * 2.5, 500_000)

    this.viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 0), {
      offset: new HeadingPitchRange(
        this.viewer.camera.heading,
        SELECTION_PITCH,
        range,
      ),
      duration: SELECTION_FLY_DURATION,
      complete: () => {
        // Arm the "user moved" detector now that the programmatic fly is
        // done — any subsequent moveStart is a real user interaction,
        // which invalidates the saved return state.
        this.armUserMoveDetector()
      },
    })
  }

  /** Return the camera to the pre-selection state, if we still have one. */
  private flyBack(): void {
    this.viewer.camera.cancelFlight()
    this.disarmUserMoveDetector()
    if (!this.savedCameraPos) return

    this.viewer.camera.flyTo({
      destination: this.savedCameraPos,
      orientation: {
        heading: this.savedHeading,
        pitch: this.savedPitch,
        roll: 0,
      },
      duration: SELECTION_FLY_DURATION,
    })
    this.savedCameraPos = null
  }

  private armUserMoveDetector(): void {
    this.disarmUserMoveDetector()
    const handler = () => {
      this.savedCameraPos = null
      this.disarmUserMoveDetector()
    }
    this.viewer.camera.moveStart.addEventListener(handler)
    this.userMoveHandler = handler
  }

  private disarmUserMoveDetector(): void {
    if (this.userMoveHandler) {
      this.viewer.camera.moveStart.removeEventListener(this.userMoveHandler)
      this.userMoveHandler = null
    }
  }

  /** Draw (or clear) orbit + cone for the given id. */
  private drawDetails(id: string | null): void {
    this.orbitLines.removeAll()
    if (this.coveragePrimitive) {
      this.viewer.scene.primitives.remove(this.coveragePrimitive)
      this.coveragePrimitive = null
    }

    if (!id) {
      this.viewer.scene.requestRender()
      return
    }

    const event = this.findEvent(id)
    if (!event) {
      this.viewer.scene.requestRender()
      return
    }

    // Orbit line — inclined great circle through current sub-satellite
    // point. Requires the satellite event to carry inclination (populated
    // by the Go TLE worker on every propagation).
    const orbitPositions = computeOrbitPath(event)
    if (orbitPositions && orbitPositions.length > 1) {
      this.orbitLines.add({
        positions: orbitPositions,
        width: 1.5,
        material: Material.fromType('Color', {
          color: SAT_COLOR.withAlpha(0.7),
        }),
      })
    }

    // Coverage footprint — classifier-estimated sensor half-angle +
    // 10° elevation mask (see coverageRadiusMeters / getHalfAngle).
    const { halfAngleDeg } = getHalfAngle(null, event)
    const radius = coverageRadiusMeters(event.alt, halfAngleDeg)
    if (radius > 0) {
      const center = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
      )
      const instance = new GeometryInstance({
        geometry: new EllipseGeometry({
          center,
          semiMajorAxis: radius,
          semiMinorAxis: radius,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(
            SAT_COLOR.withAlpha(0.15),
          ),
        },
      })
      this.coveragePrimitive = this.viewer.scene.primitives.add(
        new GroundPrimitive({ geometryInstances: instance }),
      )
    }

    this.viewer.scene.requestRender()
  }

  private findEvent(id: string): FukanEvent | undefined {
    // Read current telemetry directly from the stream store — this class
    // is driven imperatively, outside the React render cycle.
    return useStreamStore.getState().satellites.get(id)
  }

  private rebuild(satellites: Map<string, FukanEvent>): void {
    this.billboards.removeAll()
    this.billboardMap.clear()

    for (const [id, event] of satellites) {
      const position = Cartesian3.fromDegrees(
        decodeLon(event.lon),
        decodeLat(event.lat),
        event.alt,
      )
      this.billboards.add({
        position,
        image: '/icons/satellite.svg',
        scale: 0.6,
        color: SAT_COLOR,
        scaleByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.3),
        translucencyByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.5),
        id,
      })
      this.billboardMap.set(id, this.billboards.length - 1)
    }
  }

  setVisible(visible: boolean): void {
    this.billboards.show = visible
    this.orbitLines.show = visible
    if (this.coveragePrimitive) {
      this.coveragePrimitive.show = visible
    }
  }

  destroy(): void {
    this.disarmUserMoveDetector()
    this.viewer.scene.primitives.remove(this.billboards)
    this.viewer.scene.primitives.remove(this.orbitLines)
    if (this.coveragePrimitive) {
      this.viewer.scene.primitives.remove(this.coveragePrimitive)
    }
  }
}
