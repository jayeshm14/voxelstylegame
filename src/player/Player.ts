/**
 * The player — `data-model.md` §2, FR-006, FR-042.
 *
 * `data-model.md` §2 tabulates the fields a save carries: position, yaw, pitch,
 * health, hotbar index, inventory. This class holds those that exist at source
 * phase 6 plus two pieces of **transient** simulation state the table does not
 * list, and the difference is deliberate rather than an omission:
 *
 * - `vx/vy/vz` and `onGround` are movement state. They are never written to the
 *   save record (`contracts/save-schema.md` has no field for them), so leaving
 *   them out of §2's persistence-shaped table is correct — restoring a world
 *   drops the player somewhere safe and lets the next tick re-derive velocity
 *   from input and gravity.
 * - `hotbarIndex` and `inventory` arrive with the inventory slice (source phase
 *   9); they are not stubbed here, because a placeholder field with no owner is
 *   exactly what the constitution forbids.
 *
 * **Position is the feet.** `y` is the bottom of the body box, which is what
 * makes the spawn rule in §2 — `surfaceHeight + 2` — read as "two blocks of
 * headroom above the ground" and makes `eyeY` an addition rather than a
 * subtraction. The box is centred on `x` and `z`, so a player standing on a
 * block occupies `[x − HALF_WIDTH, x + HALF_WIDTH]` across it.
 *
 * No clock, no randomness, no I/O: the class is state and two derived views of
 * it, drivable from a test.
 */

import { CAMERA, HEALTH, PLAYER } from '../core/GameConfig'

/** Finite-or-refused — a `NaN` position would propagate through every collision test. */
function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`player ${label} must be finite, received ${String(value)}`)
  }
  return value
}

export class Player {
  /** World x of the body box's centre. */
  x: number
  /** World y of the body box's **bottom** — the feet. */
  y: number
  /** World z of the body box's centre. */
  z: number

  /** Heading in radians, 0 facing −z. Unbounded: turning around must not wrap. */
  yaw = 0
  /** Elevation in radians, clamped to ±(π/2 − ε). */
  pitch = 0

  /**
   * `data-model.md` §2 and FR-042: fixed at its maximum in v1, so health never
   * changes. Kept as a field rather than a constant because §2 persists it and
   * FR-042's assumption names the day it would have to be reopened.
   */
  health: number = HEALTH.MAX

  // ── transient simulation state — never persisted ───────────────────────────

  /** Horizontal and vertical velocity in blocks per second. */
  vx = 0
  vy = 0
  vz = 0

  /** True when the feet rest on solid ground this tick; gates jumping (FR-006). */
  onGround = false

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = requireFinite(x, 'x')
    this.y = requireFinite(y, 'y')
    this.z = requireFinite(z, 'z')
  }

  /** Feet-to-eye distance, from `GameConfig.PLAYER` rather than a second literal. */
  get eyeHeight(): number {
    return PLAYER.EYE_HEIGHT
  }

  /** World y of the eye — FR-010 measures reach "from the player's eye". */
  get eyeY(): number {
    return this.y + PLAYER.EYE_HEIGHT
  }

  /** The eye's world position, for the raycast origin (FR-010, FR-012). */
  eye(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.eyeY, z: this.z }
  }

  /**
   * Set heading and elevation directly, applying §2's pitch clamp to the value
   * as given so the clamp is idempotent — feeding a pitch already at the limit
   * back in cannot walk it past it.
   */
  setOrientation(yaw: number, pitch: number): void {
    this.yaw = requireFinite(yaw, 'yaw')
    const clamped = requireFinite(pitch, 'pitch')
    this.pitch =
      clamped > CAMERA.PITCH_LIMIT
        ? CAMERA.PITCH_LIMIT
        : clamped < -CAMERA.PITCH_LIMIT
          ? -CAMERA.PITCH_LIMIT
          : clamped
  }

  /** Apply an orientation change already scaled by `mouseSensitivity` (FR-034). */
  rotate(deltaYaw: number, deltaPitch: number): void {
    this.setOrientation(this.yaw + deltaYaw, this.pitch + deltaPitch)
  }
}
