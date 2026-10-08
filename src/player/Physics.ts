/**
 * Gravity, jumping, walking and swimming — source prompt §8, FR-006, FR-007,
 * FR-008, and spec *Documented Values* → *Jump integration*.
 *
 * One tick of movement, in this order:
 *
 * 1. **Read the ground and the medium.** Whether the feet rest on solid terrain
 *    and whether the body overlaps water are both *observations of the world*,
 *    taken before anything moves — so a jump pressed on the tick after landing
 *    is decided by where the player actually is, not by where a previous call
 *    happened to leave a flag.
 * 2. **Horizontal.** The intent is rotated into world space by `yaw`, scaled to
 *    the current medium's speed, and written straight to velocity. There is no
 *    acceleration curve: `spec.md` describes walking, sprinting and swimming as
 *    *speeds*, not as a rate of change, and an added ramp would make every
 *    positional assertion in the collision suite an approximation instead of an
 *    equality. See TD-032.
 * 3. **Vertical — the documented integration.** Jump sets the velocity, gravity
 *    is applied to it, then position advances from that *updated* velocity,
 *    exactly once per tick. This is semi-implicit (symplectic) Euler, and the
 *    ordering is load-bearing: reversing it would change the jump apex, which
 *    `tests/collision.test.ts` asserts with no tolerance.
 * 4. **Resolve** through {@link moveBy} in Y → X → Z, then zero any velocity
 *    component the terrain stopped — otherwise a player leaning on a wall would
 *    accumulate inward velocity that is released the moment they step clear.
 *
 * `Math.random`, `Date.now` and `performance.now` are forbidden here
 * (Constitution Principle I): every input arrives as an argument, so the same
 * tick over the same world always produces the same position.
 */

import { PHYSICS, PLAYER } from '../core/GameConfig'
import { BLOCK } from '../world/BlockRegistry'
import { World } from '../world/World'
import { isGrounded, moveBy } from './Collision'
import { Player } from './Player'

/**
 * What the player asked for this tick, already reduced from raw input.
 *
 * `forward` and `strafe` are each in `−1 … 1`. A diagonal is normalised rather
 * than scaled component-wise, so strafing while walking is not faster than
 * walking — a defect that a straight-line test never shows and a player
 * notices on the first sidestep.
 */
export interface MoveIntent {
  readonly forward: number
  readonly strafe: number
  readonly jump: boolean
  readonly sprint: boolean
}

/** Nothing held: no direction, no jump, no sprint. */
export const IDLE_INTENT: MoveIntent = Object.freeze({
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
})

/**
 * True when any cell the body box spans holds water — FR-008's swim state.
 *
 * Water is not solid, so this can never block motion; it only selects the speed
 * and the swim-up rule. Sampling the whole box rather than a single point is
 * what makes wading into water that reaches the waist behave like swimming: the
 * decision follows the body, not one arbitrary cell inside it.
 */
export function playerInWater(world: World, player: Player): boolean {
  const x0 = Math.floor(player.x - PLAYER.HALF_WIDTH)
  const x1 = Math.floor(player.x + PLAYER.HALF_WIDTH)
  const y0 = Math.floor(player.y)
  const y1 = Math.floor(player.y + PLAYER.HEIGHT)
  const z0 = Math.floor(player.z - PLAYER.HALF_WIDTH)
  const z1 = Math.floor(player.z + PLAYER.HALF_WIDTH)

  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (world.getBlock(x, y, z) === BLOCK.WATER) return true
      }
    }
  }
  return false
}

/**
 * Advance `player` by one simulation tick against `world`.
 *
 * @param dt elapsed time for this tick, in seconds — handed over by the game
 *           loop as `TIME.TICK_DT_SECONDS`, never measured here (Principle I)
 */
export function stepPhysics(
  world: World,
  player: Player,
  intent: MoveIntent,
  dt: number,
): void {
  if (!Number.isFinite(dt) || dt <= 0) return

  // Re-read before anything moves: the jump decision in `applyVertical` reads
  // this field, and a value left over from the end of the previous tick would
  // be one tick stale.
  player.onGround = isGrounded(world, player)
  const swimming = playerInWater(world, player)

  applyHorizontal(player, intent, swimming)
  applyVertical(player, intent, swimming, dt)

  const moved = moveBy(world, player, player.vx * dt, player.vy * dt, player.vz * dt)
  if (moved.blockedX) player.vx = 0
  if (moved.blockedY) player.vy = 0
  if (moved.blockedZ) player.vz = 0
}

// ─────────────────────────────────────────────────────────────────────────────
// The two halves of a tick
// ─────────────────────────────────────────────────────────────────────────────

function applyHorizontal(player: Player, intent: MoveIntent, swimming: boolean): void {
  // `yaw` 0 faces −z (see `rendering/Camera.ts`), so forward is (−sin, −cos) and
  // right is (cos, −sin): the same basis the camera's view matrix uses.
  const sin = Math.sin(player.yaw)
  const cos = Math.cos(player.yaw)

  let mx = -sin * intent.forward + cos * intent.strafe
  let mz = -cos * intent.forward - sin * intent.strafe

  const length = Math.sqrt(mx * mx + mz * mz)
  if (length > 1) {
    mx /= length
    mz /= length
  }

  let speed = intent.sprint ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED
  if (swimming) speed *= PHYSICS.SWIM_SPEED_FACTOR

  player.vx = mx * speed
  player.vz = mz * speed
}

function applyVertical(
  player: Player,
  intent: MoveIntent,
  swimming: boolean,
  dt: number,
): void {
  // Swim up: Space is bound to "Jump / swim up" (`contracts/input-bindings.md`),
  // and there is no ground to push off underwater, so holding it supplies the
  // lift — at the documented swim speed, which is what stops this becoming a
  // second, undocumented jump velocity.
  if (swimming && intent.jump) {
    player.vy = PHYSICS.JUMP_VELOCITY * PHYSICS.SWIM_SPEED_FACTOR
    return
  }

  // The impulse is injected *before* the integration step, so the first tick of
  // a jump integrates from the documented jump velocity rather than from rest.
  if (intent.jump && player.onGround) {
    player.vy = PHYSICS.JUMP_VELOCITY
  }

  player.vy = player.vy - PHYSICS.GRAVITY * dt

  // Terminal velocity caps only the descent. A jump never approaches it, so
  // this cannot touch the apex the collision suite asserts without tolerance.
  if (player.vy < -PHYSICS.TERMINAL_VELOCITY) {
    player.vy = -PHYSICS.TERMINAL_VELOCITY
  }
}
