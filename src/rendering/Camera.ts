/**
 * First-person camera: yaw and pitch only, in radians.
 *
 * There is no roll and no position of its own beyond the eye point handed to it
 * each frame — a voxel sandbox has no flight and nothing that would introduce a
 * third orientation axis, so the state is two numbers and the invariant from
 * `data-model.md` §2: **`pitch` clamps to ±(π/2 − ε)**, which keeps the view
 * vector short of the poles where the basis degenerates.
 *
 * `yaw` is deliberately unbounded: wrapping it to `[0, 2π)` would make "turn
 * around" a discontinuous operation for no benefit.
 *
 * This module does no input handling and applies no sensitivity — it receives
 * radians already scaled by the caller, so the mouse path owns FR-034's
 * sensitivity setting and the camera owns only the clamp.
 */

import * as THREE from 'three'
import { CAMERA, SETTINGS } from '../core/GameConfig'

export class Camera {
  readonly camera: THREE.PerspectiveCamera

  #yaw = 0
  #pitch = 0

  constructor(aspect: number = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(
      SETTINGS.FOV_DEFAULT,
      aspect,
      CAMERA.NEAR,
      CAMERA.FAR,
    )
  }

  /** Unbounded heading in radians, 0 facing −Z. */
  get yaw(): number {
    return this.#yaw
  }

  /** Elevation in radians, clamped to ±(π/2 − ε). */
  get pitch(): number {
    return this.#pitch
  }

  /**
   * Set the orientation directly.
   *
   * The pitch clamp is applied to the value as given rather than to a delta, so
   * clamping is idempotent: feeding back a `pitch` already at the limit cannot
   * walk it past it.
   */
  setOrientation(yaw: number, pitch: number): void {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) {
      throw new RangeError(
        `Camera orientation must be finite, got yaw=${String(yaw)} pitch=${String(pitch)}`,
      )
    }
    this.#yaw = yaw
    this.#pitch = Camera.clampPitch(pitch)
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.#pitch, this.#yaw, 0, 'YXZ'))
  }

  /** Apply an orientation change already multiplied by mouse sensitivity. */
  rotate(deltaYaw: number, deltaPitch: number): void {
    this.setOrientation(this.#yaw + deltaYaw, this.#pitch + deltaPitch)
  }

  /**
   * Clamp an elevation to ±(π/2 − ε).
   *
   * A non-finite input is rejected rather than coerced: `NaN` would otherwise
   * compare `false` against both limits and slip through every guard.
   */
  static clampPitch(pitch: number): number {
    if (!Number.isFinite(pitch)) {
      throw new RangeError(`Camera pitch must be finite, got ${String(pitch)}`)
    }
    if (pitch > CAMERA.PITCH_LIMIT) return CAMERA.PITCH_LIMIT
    if (pitch < -CAMERA.PITCH_LIMIT) return -CAMERA.PITCH_LIMIT
    return pitch
  }

  /** Place the eye. The camera carries no position between calls. */
  setPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z)
    this.camera.updateMatrixWorld(true)
  }

  /**
   * FR-034 field of view, in degrees, clamped to `FOV_MIN … FOV_MAX`.
   * Called by the settings panel whenever the player changes it.
   */
  setFov(degrees: number): void {
    if (!Number.isFinite(degrees)) {
      throw new RangeError(`Camera fov must be finite, got ${String(degrees)}`)
    }
    const min = SETTINGS.FOV_MIN
    const max = SETTINGS.FOV_MAX
    const clamped = degrees < min ? min : degrees > max ? max : degrees
    this.camera.fov = clamped
    this.camera.updateProjectionMatrix()
  }

  setAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) {
      throw new RangeError(`Camera aspect must be a positive number, got ${String(aspect)}`)
    }
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.camera.clear()
  }
}
