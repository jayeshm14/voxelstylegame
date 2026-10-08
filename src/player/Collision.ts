/**
 * Axis-separated AABB collision — source prompt §8, FR-006, FR-007,
 * `plan.md` Project Structure (`Collision.ts`, order **Y → X → Z**).
 *
 * ## Why the order is Y, then X, then Z
 *
 * Resolving **Y first** is what lets a player land before anything horizontal
 * is considered: a fall and a stride in the same tick settle onto the ground,
 * then the stride is applied against a body that is already standing rather
 * than against one still moving downward. X before Z is the order the source
 * prompt fixes; it only matters where both are blocked in the same tick, and
 * fixing it makes the outcome reproducible rather than dependent on the order a
 * caller happened to list its axes in.
 *
 * ## Two rules that look like detail and are not
 *
 * - **Touching is not overlapping.** Contact tests are strict: a box whose
 *   lower face sits exactly at `y = 5` does *not* overlap the cell `[4, 5)`.
 *   That single choice is what makes "stops at `y = floor`" an exact equality
 *   instead of an epsilon, and it is why the jump-apex assertion in
 *   `tests/collision.test.ts` can be written with **no tolerance**.
 * - **An unobstructed displacement is applied whole.** When nothing lies in the
 *   swept range, the position moves by one addition. Subdividing a clear move
 *   would accumulate the same distance through a different sequence of
 *   floating-point additions and diverge from the documented integration scheme
 *   in the last bits — which the no-tolerance apex assertion would then, quite
 *   correctly, fail. Where contact *does* have to be found, the sweep is walked
 *   in substeps of at most `PHYSICS.MAX_SUBSTEP`, so a fall at terminal
 *   velocity cannot pass through a one-block wall between two contact tests.
 *
 * The consequence of that second rule is the reason this module and the jump
 * test can agree bit-for-bit: clearance is decided once over the whole swept
 * union, and only a range that is *not* clear is subdivided. See TD-032.
 *
 * ## Step-up (FR-007)
 *
 * Attempted only when a horizontal axis is blocked and the feet are already on
 * the ground, and **committed only if the body fits after the lift** — a lift
 * that cannot complete must leave the player exactly where they were, or a
 * failed attempt would hoist them a block into the air. At most one step is
 * taken per tick, so a single stride can never climb two blocks.
 */

import { PHYSICS, PLAYER } from '../core/GameConfig'
import { isSolid } from '../world/BlockRegistry'
import { World } from '../world/World'
import { Player } from './Player'

type Axis = 'x' | 'y' | 'z'

/** The player's collision box, in world coordinates. */
export interface Box {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

/** What one {@link moveBy} call did, axis by axis. */
export interface MoveResult {
  /** Displacement actually applied on each axis, after resolution. */
  readonly movedX: number
  readonly movedY: number
  readonly movedZ: number
  /** True when solid terrain stopped this axis short of its requested travel. */
  readonly blockedX: boolean
  readonly blockedY: boolean
  readonly blockedZ: boolean
  /** True when a horizontal block was cleared by lifting the player one step. */
  readonly steppedUp: boolean
}

/**
 * The body box at `player`'s current position: square in plan, centred on `x`
 * and `z`, standing on `y`.
 */
export function boxOf(player: Player): Box {
  return {
    minX: player.x - PLAYER.HALF_WIDTH,
    maxX: player.x + PLAYER.HALF_WIDTH,
    minY: player.y,
    maxY: player.y + PLAYER.HEIGHT,
    minZ: player.z - PLAYER.HALF_WIDTH,
    maxZ: player.z + PLAYER.HALF_WIDTH,
  }
}

/**
 * True when a probe of `PHYSICS.CONTACT_EPSILON` downward finds solid ground.
 *
 * The probe is what turns "resting on a face" into an observation rather than a
 * coincidence of arithmetic: a box flush against the floor does not *overlap*
 * it — see the strict-contact rule above — so a positive probe distance is the
 * only way to ask the question at all.
 */
export function isGrounded(world: World, player: Player): boolean {
  const box = boxOf(player)
  box.minY -= PHYSICS.CONTACT_EPSILON
  return overlapsSolid(world, box)
}

/**
 * Move `player` by `(dx, dy, dz)`, resolving Y → X → Z against `world`.
 *
 * @returns what happened on each axis; callers use the blocked flags to decide
 *          which velocity components to zero
 */
export function moveBy(
  world: World,
  player: Player,
  dx: number,
  dy: number,
  dz: number,
): MoveResult {
  const y = resolveAxis(world, player, dy, 'y', false)
  const x = resolveAxis(world, player, dx, 'x', true)
  // One step per tick: after X has taken one, Z must not take a second.
  const z = resolveAxis(world, player, dz, 'z', !x.steppedUp)

  // Recomputed at the end so a caller that only wanted collision still ends up
  // with a trustworthy `onGround`, including the step-up test, which reads it
  // after the lift rather than before.
  player.onGround = isGrounded(world, player)

  return {
    movedX: x.moved,
    movedY: y.moved,
    movedZ: z.moved,
    blockedX: x.blocked,
    blockedY: y.blocked,
    blockedZ: z.blocked,
    steppedUp: x.steppedUp || z.steppedUp,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Axis resolution
// ─────────────────────────────────────────────────────────────────────────────

interface AxisResult {
  readonly moved: number
  readonly blocked: boolean
  readonly steppedUp: boolean
}

function resolveAxis(
  world: World,
  player: Player,
  delta: number,
  axis: Axis,
  allowStep: boolean,
): AxisResult {
  if (delta === 0 || !Number.isFinite(delta)) {
    return { moved: 0, blocked: false, steppedUp: false }
  }

  const start = positionOf(player, axis)

  // Nothing anywhere in the swept *union* — start box and end box together, not
  // merely the end box, or a large enough displacement would jump the obstacle
  // and be applied as if the path were clear. If it really is clear, apply the
  // displacement whole so the realised trajectory stays bit-identical to the
  // documented integration scheme.
  const swept = sweepUnion(boxOf(player), delta, axis)
  if (!overlapsSolid(world, swept)) {
    setPosition(player, axis, start + delta)
    return { moved: delta, blocked: false, steppedUp: false }
  }

  if (allowStep) {
    const stepped = tryStepUp(world, player, delta, axis, start)
    if (stepped !== null) return stepped
  }

  // Contact exists, so locate it. Walking in capped substeps is what keeps a
  // fast fall from stepping over the blocking cell: each step is shorter than a
  // block, so the box cannot enter and leave a cell within one of them.
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / PHYSICS.MAX_SUBSTEP))
  const step = delta / steps
  let applied = 0

  for (let i = 0; i < steps; i++) {
    const next = applied + step
    const trial = boxOf(player)
    shiftBox(trial, axis, next)
    if (overlapsSolid(world, trial)) {
      const limit = firstClearLimit(world, player, axis, start + applied, start + next)
      if (limit === null) {
        setPosition(player, axis, start + applied)
        return { moved: applied, blocked: true, steppedUp: false }
      }
      setPosition(player, axis, limit)
      return { moved: limit - start, blocked: true, steppedUp: false }
    }
    applied = next
  }

  // Unreachable while the swept union really does overlap — the final substep's
  // box *is* part of that union — but returning the last clear position is the
  // only safe answer if it ever is reached.
  setPosition(player, axis, start + applied)
  return { moved: applied, blocked: false, steppedUp: false }
}

/**
 * FR-007's step-up: a blocked horizontal move is retried from one block higher,
 * and committed **only** when both the lifted body where it stands and the
 * lifted body where it was headed are clear.
 *
 * @returns the result if the step was taken, or `null` to fall through to the
 *          ordinary blocking path
 */
function tryStepUp(
  world: World,
  player: Player,
  delta: number,
  axis: Axis,
  start: number,
): AxisResult | null {
  if (!isGrounded(world, player)) return null

  const lifted = boxOf(player)
  shiftBox(lifted, 'y', PHYSICS.STEP_UP_HEIGHT)
  // Headroom where the player is standing.
  if (overlapsSolid(world, lifted)) return null

  // Headroom where the player is headed — a lift that lands the body inside
  // something is a collision with extra work, not a step.
  shiftBox(lifted, axis, delta)
  if (overlapsSolid(world, lifted)) return null

  player.y += PHYSICS.STEP_UP_HEIGHT
  setPosition(player, axis, start + delta)
  return { moved: delta, blocked: false, steppedUp: true }
}

/**
 * The player position at which this axis first meets solid terrain.
 *
 * Scans the cells the move would *newly* enter, in the direction of travel, so
 * the first solid found is the outermost one — the face the player would
 * actually touch. Each candidate is verified by placing the body flush against
 * it and re-testing, because touching a first wall does not by itself prove the
 * body fits.
 *
 * @param from the position along the axis this scan starts from
 * @param to   the position it was trying to reach
 * @returns the clamped position, or `null` if no clear position lies in range
 */
function firstClearLimit(
  world: World,
  player: Player,
  axis: Axis,
  from: number,
  to: number,
): number | null {
  const dir = to > from ? 1 : -1
  const here = positionOf(player, axis)

  // The box as it would be at `from`, used for the two axes that are not moving.
  const box = boxOf(player)
  shiftBox(box, axis, from - here)

  const leadNow = dir < 0 ? lowOf(box, axis) : highOf(box, axis)
  const leadEnd = leadNow + (to - from)
  const firstCell = Math.floor(leadNow)
  const lastCell = Math.floor(leadEnd)

  for (let cell = firstCell; dir < 0 ? cell >= lastCell : cell <= lastCell; cell += dir) {
    if (!cellSolidAcross(world, cell, axis, box)) continue

    const candidate = faceOf(axis, dir, cell)
    const probe = boxOf(player)
    shiftBox(probe, axis, candidate - here)
    if (!overlapsSolid(world, probe)) return candidate
  }
  return null
}

/** Where the player's position must come to rest against `cell`'s approached face. */
function faceOf(axis: Axis, dir: number, cell: number): number {
  if (axis === 'y') {
    // Falling: the feet stand on the cell's top. Rising: the head stops under it.
    return dir < 0 ? cell + 1 : cell - PLAYER.HEIGHT
  }
  // Falling here means moving negative: the near face is at `cell`, the far at
  // `cell + 1`; the box is centred, so HALF_WIDTH is added or subtracted.
  return dir < 0 ? cell + 1 + PLAYER.HALF_WIDTH : cell - PLAYER.HALF_WIDTH
}

// ─────────────────────────────────────────────────────────────────────────────
// Box helpers
// ─────────────────────────────────────────────────────────────────────────────

function positionOf(player: Player, axis: Axis): number {
  return axis === 'x' ? player.x : axis === 'y' ? player.y : player.z
}

function setPosition(player: Player, axis: Axis, value: number): void {
  if (axis === 'x') player.x = value
  else if (axis === 'y') player.y = value
  else player.z = value
}

function lowOf(box: Box, axis: Axis): number {
  if (axis === 'x') return box.minX
  if (axis === 'y') return box.minY
  return box.minZ
}

function highOf(box: Box, axis: Axis): number {
  if (axis === 'x') return box.maxX
  if (axis === 'y') return box.maxY
  return box.maxZ
}

function shiftBox(box: Box, axis: Axis, delta: number): void {
  if (axis === 'x') {
    box.minX += delta
    box.maxX += delta
  } else if (axis === 'y') {
    box.minY += delta
    box.maxY += delta
  } else {
    box.minZ += delta
    box.maxZ += delta
  }
}

/**
 * The volume a box passes through travelling `delta` along `axis` — the union
 * of where it starts and where it ends.
 *
 * Both endpoints matter: testing only the end box would let a displacement
 * longer than the distance to an obstacle read the cells *past* it, find them
 * empty, and be applied whole straight through the wall. The other two axes are
 * untouched by the move and carry through unchanged.
 */
function sweepUnion(from: Box, delta: number, axis: Axis): Box {
  const to: Box = { ...from }
  shiftBox(to, axis, delta)

  if (axis === 'x') {
    return {
      minX: Math.min(from.minX, to.minX),
      maxX: Math.max(from.maxX, to.maxX),
      minY: from.minY,
      maxY: from.maxY,
      minZ: from.minZ,
      maxZ: from.maxZ,
    }
  }
  if (axis === 'y') {
    return {
      minX: from.minX,
      maxX: from.maxX,
      minY: Math.min(from.minY, to.minY),
      maxY: Math.max(from.maxY, to.maxY),
      minZ: from.minZ,
      maxZ: from.maxZ,
    }
  }
  return {
    minX: from.minX,
    maxX: from.maxX,
    minY: from.minY,
    maxY: from.maxY,
    minZ: Math.min(from.minZ, to.minZ),
    maxZ: Math.max(from.maxZ, to.maxZ),
  }
}

/**
 * True when any cell `box` spans is solid.
 *
 * The cell range is `floor(min) … ceil(max) − 1`, which puts a face lying
 * exactly on a cell boundary in the cell *below* it and never in the one it
 * merely touches — the strict-contact rule, expressed as arithmetic.
 */
function overlapsSolid(world: World, box: Box): boolean {
  const x0 = Math.floor(box.minX)
  const x1 = Math.ceil(box.maxX) - 1
  const y0 = Math.floor(box.minY)
  const y1 = Math.ceil(box.maxY) - 1
  const z0 = Math.floor(box.minZ)
  const z1 = Math.ceil(box.maxZ) - 1

  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (isSolid(world.getBlock(x, y, z))) return true
      }
    }
  }
  return false
}

/**
 * Whether the single slab `cell` on `axis`, spanning the box's other two
 * extents, contains solid terrain.
 *
 * The slab is deliberately *not* intersected with the box's current extent on
 * `axis`: the cells being scanned are the ones the move would enter, which by
 * definition the box does not occupy yet.
 */
function cellSolidAcross(world: World, cell: number, axis: Axis, box: Box): boolean {
  const x0 = Math.floor(box.minX)
  const x1 = Math.ceil(box.maxX) - 1
  const y0 = Math.floor(box.minY)
  const y1 = Math.ceil(box.maxY) - 1
  const z0 = Math.floor(box.minZ)
  const z1 = Math.ceil(box.maxZ) - 1

  if (axis === 'y') {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (isSolid(world.getBlock(x, cell, z))) return true
      }
    }
    return false
  }

  for (let y = y0; y <= y1; y++) {
    if (axis === 'z') {
      for (let x = x0; x <= x1; x++) {
        if (isSolid(world.getBlock(x, y, cell))) return true
      }
    } else {
      for (let z = z0; z <= z1; z++) {
        if (isSolid(world.getBlock(cell, y, z))) return true
      }
    }
  }
  return false
}
