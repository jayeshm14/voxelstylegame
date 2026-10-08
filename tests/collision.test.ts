/**
 * Constitution test area: **collision** — source §13 test 9.
 *
 * Four fixtures are required by T039 and three more cover what T043/T044 add:
 *
 * 1. **Floor** — a fall onto flat ground stops *exactly* at the floor's top
 *    surface, not one float-epsilon through it and not one short of it.
 * 2. **Wall** — walking into solid terrain stops dead at the face; the player
 *    never overlaps the block and never tunnels through it.
 * 3. **Corner slide** — moving into a wall obliquely keeps the component that
 *    runs along the wall and discards only the one that runs into it. This is
 *    what FR-007's "slides along walls" means, and it is the behaviour a naive
 *    "if blocked, stop" resolver loses.
 * 4. **Jump apex** — the height reached is **exactly** the value the Documented
 *    Values *Jump integration* scheme produces, asserted with **no tolerance**
 *    and derived here from that scheme (semi-implicit Euler, velocity from
 *    gravity first then position from the updated velocity, once per tick,
 *    gravity 32 b/s², jump velocity 10 b/s) rather than read back from the
 *    implementation under test. `GameConfig.PHYSICS` deliberately carries no
 *    apex constant, so the number below cannot be a copy of a result.
 * 5. **Step-up** — a one-block ledge is climbed without jumping (FR-007).
 * 6. **Swim** — movement in water is 40% of movement on land (FR-008).
 * 7. **Terminal velocity** — a long fall never exceeds the configured cap.
 *
 * Written **before** `src/player/` exists: importing `Player`, `Collision` and
 * `Physics` is the expected red, and T040–T045 are what turn it green (T046).
 *
 * No timers, no fixtures on disk — every value comes from `GameConfig`.
 */

import { describe, expect, it } from 'vitest'
import { World } from '../src/world/World'
import { Chunk, blockIndex } from '../src/world/Chunk'
import { BLOCK } from '../src/world/BlockRegistry'
import { PHYSICS, PLAYER, TIME } from '../src/core/GameConfig'
import { Player } from '../src/player/Player'
import { moveBy } from '../src/player/Collision'
import { type MoveIntent, stepPhysics } from '../src/player/Physics'

const SEED = 123456789

/** Stone fills y 0…4, so the walkable surface is exactly this many blocks up. */
const FLOOR_TOP = 5
/** The wall fills z 0…7, so its +z face is exactly this. */
const WALL_FACE_Z = 8
/** The ledge is one block thick at y = 5 for x ≥ 8, so its top is y = 6. */
const LEDGE_X = 8
const LEDGE_TOP = 6

/** Water fills y 5…12, which is where the player's body sits while standing. */
const WATER_TOP = 13

/** One start position serves every fixture: clear of the wall and on the floor. */
const START_X = 4
const START_Z = 14

/** Idle input — no direction, no jump, no sprint. */
const IDLE: MoveIntent = Object.freeze({ forward: 0, strafe: 0, jump: false, sprint: false })
const FORWARD: MoveIntent = Object.freeze({ forward: 1, strafe: 0, jump: false, sprint: false })
const JUMP: MoveIntent = Object.freeze({ forward: 0, strafe: 0, jump: true, sprint: false })

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — every cell is placed explicitly, so a failure cannot be blamed on
// terrain generation.
// ─────────────────────────────────────────────────────────────────────────────

/** Inclusive local box fill on the resident region (0, 0). */
function fill(
  chunk: Chunk,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  id: number,
): void {
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        chunk.blocks[blockIndex(x, y, z)] = id
      }
    }
  }
}

/** A stone floor over the whole region: cells y 0…4, surface at y = 5. */
function floorWorld(): World {
  const world = new World(SEED)
  const chunk = new Chunk(0, 0)
  fill(chunk, 0, 0, 0, 15, FLOOR_TOP - 1, 15, BLOCK.STONE)
  world.put(chunk)
  return world
}

/** Floor plus a full-height wall across z 0…7 — its face is at z = 8. */
function wallWorld(): World {
  const world = floorWorld()
  const chunk = world.getChunk(0, 0) as Chunk
  fill(chunk, 0, FLOOR_TOP, 0, 15, 20, WALL_FACE_Z - 1, BLOCK.STONE)
  return world
}

/** Floor plus a one-block ledge occupying y = 5 for x ≥ 8 — top at y = 6. */
function ledgeWorld(): World {
  const world = floorWorld()
  const chunk = world.getChunk(0, 0) as Chunk
  fill(chunk, LEDGE_X, FLOOR_TOP, 0, 15, FLOOR_TOP, 15, BLOCK.STONE)
  return world
}

/** Floor with water standing from the surface to y = 12. */
function waterWorld(): World {
  const world = floorWorld()
  const chunk = world.getChunk(0, 0) as Chunk
  fill(chunk, 0, FLOOR_TOP, 0, 15, WATER_TOP - 1, 15, BLOCK.WATER)
  return world
}

function standing(world: World, x: number = START_X, z: number = START_Z): Player {
  return new Player(x, FLOOR_TOP, z)
}

/**
 * Run `ticks` simulation steps with a fixed input, returning the tallest `y`
 * reached — the apex, measured from the implementation rather than inferred.
 */
function apexOf(
  world: World,
  player: Player,
  intentFor: (tick: number) => MoveIntent,
  ticks: number,
): number {
  let apex = player.y
  for (let tick = 0; tick < ticks; tick++) {
    stepPhysics(world, player, intentFor(tick), TIME.TICK_DT_SECONDS)
    if (player.y > apex) apex = player.y
  }
  return apex
}

// ─────────────────────────────────────────────────────────────────────────────
// 1–2. Floor and wall
// ─────────────────────────────────────────────────────────────────────────────

describe('collision — solid terrain stops the player', () => {
  it('a fall onto a flat floor stops exactly at the floor surface', () => {
    const world = wallWorld()
    const player = new Player(START_X, 40, START_Z)

    // Falling from 40 reaches the terminal cap, so this exercises both the
    // substep sweep and the final snap rather than a gentle descent.
    for (let i = 0; i < 400; i++) {
      stepPhysics(world, player, IDLE, TIME.TICK_DT_SECONDS)
    }

    expect(player.y).toBe(FLOOR_TOP)
    expect(player.vy).toBe(0)
    expect(player.onGround).toBe(true)
  })

  it('walking into a wall stops dead at its face', () => {
    const world = wallWorld()
    const player = standing(world)
    player.yaw = 0 // yaw 0 faces −z (see `rendering/Camera.ts`), which is the wall

    for (let i = 0; i < 200; i++) {
      stepPhysics(world, player, FORWARD, TIME.TICK_DT_SECONDS)
    }

    // Derived from the geometry and the documented body width, never from the
    // implementation: the face is at z = 8 and the box is HALF_WIDTH deep.
    expect(player.z).toBe(WALL_FACE_Z + PLAYER.HALF_WIDTH)
    expect(player.y).toBe(FLOOR_TOP)
    // The player did travel — "stopped" must not be satisfied by never moving.
    expect(player.z).toBeLessThan(START_Z)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Corner slide — FR-007
// ─────────────────────────────────────────────────────────────────────────────

describe('collision — axis-separated resolution', () => {
  it('keeps the displacement along a wall while discarding the one into it', () => {
    const world = wallWorld()
    const player = standing(world)
    const dx = 0.4

    // Y → X → Z: x is free and applied whole, z runs into the wall and clamps.
    const result = moveBy(world, player, dx, 0, -10)

    expect(player.x).toBe(START_X + dx)
    expect(player.z).toBe(WALL_FACE_Z + PLAYER.HALF_WIDTH)
    expect(result.blockedX).toBe(false)
    expect(result.blockedZ).toBe(true)
    expect(result.blockedY).toBe(false)
  })

  it('resolves in Y first, so a downward move lands before x and z are applied', () => {
    const world = wallWorld()
    const player = new Player(START_X, 20, START_Z)

    const result = moveBy(world, player, 0, -100, -10)

    expect(player.y).toBe(FLOOR_TOP)
    expect(result.blockedY).toBe(true)
    // z still ran to the wall on this same call: Y being resolved first does
    // not suppress the other two axes.
    expect(player.z).toBe(WALL_FACE_Z + PLAYER.HALF_WIDTH)
  })

  it('steps up a one-block ledge without jumping (FR-007)', () => {
    const world = ledgeWorld()
    const player = standing(world)

    const result = moveBy(world, player, 6, 0, 0)

    expect(player.x).toBe(START_X + 6)
    expect(player.y).toBe(LEDGE_TOP)
    expect(result.steppedUp).toBe(true)
  })

  it('does not step up when the ledge is taller than one block', () => {
    const world = wallWorld() // the wall is sixteen blocks tall
    const player = standing(world)

    const result = moveBy(world, player, 0, 0, -10)

    expect(player.z).toBe(WALL_FACE_Z + PLAYER.HALF_WIDTH)
    expect(player.y).toBe(FLOOR_TOP)
    expect(result.steppedUp).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Jump apex — US1 Acceptance 3, no tolerance
// ─────────────────────────────────────────────────────────────────────────────

describe('collision — jump apex', () => {
  it('reaches exactly the apex the documented integration scheme produces', () => {
    const world = wallWorld()
    const player = standing(world)
    const dt = TIME.TICK_DT_SECONDS
    const ticks = 40

    // ── Expected half: written from spec.md Documented Values → "Jump
    //    integration" — semi-implicit (symplectic) Euler at 20 ticks/s, velocity
    //    updated from gravity first, then position from the *updated* velocity,
    //    exactly once per tick, gravity 32 b/s², jump velocity 10 b/s.
    //
    //    The jump is an impulse injected before the first integration step, so
    //    tick 1 integrates from v = 10 rather than from rest. Nothing below
    //    reads `src/player/*`: the constants are the documented ones and the
    //    recurrence is the documented scheme.
    let expectedY = FLOOR_TOP
    let expectedV = PHYSICS.JUMP_VELOCITY
    let expectedApex = expectedY
    for (let i = 0; i < ticks; i++) {
      expectedV = expectedV - PHYSICS.GRAVITY * dt
      expectedY = expectedY + expectedV * dt
      if (expectedY > expectedApex) expectedApex = expectedY
    }

    // ── Actual half: jump on the first tick only, then let it fly.
    const actualApex = apexOf(world, player, (tick) => (tick === 0 ? JUMP : IDLE), ticks)

    // No tolerance: the two must be the same double, not merely close.
    expect(actualApex).toBe(expectedApex)
  })

  it('lands back on the floor at the same height it left', () => {
    const world = wallWorld()
    const player = standing(world)

    for (let i = 0; i < 60; i++) {
      stepPhysics(world, player, i === 0 ? JUMP : IDLE, TIME.TICK_DT_SECONDS)
    }

    expect(player.y).toBe(FLOOR_TOP)
    expect(player.vy).toBe(0)
    expect(player.onGround).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Swim — FR-008
// ─────────────────────────────────────────────────────────────────────────────

describe('collision — swimming', () => {
  it('moves at 40% of land speed and is not blocked by water (FR-008)', () => {
    const dryWorld = floorWorld()
    const wetWorld = waterWorld()
    const dry = standing(dryWorld)
    const wet = standing(wetWorld)
    const ticks = 10

    for (let i = 0; i < ticks; i++) stepPhysics(dryWorld, dry, FORWARD, TIME.TICK_DT_SECONDS)
    for (let i = 0; i < ticks; i++) stepPhysics(wetWorld, wet, FORWARD, TIME.TICK_DT_SECONDS)

    const dryMoved = START_Z - dry.z
    const wetMoved = START_Z - wet.z

    expect(wetMoved).toBeGreaterThan(0)
    expect(wetMoved).toBeCloseTo(dryMoved * PHYSICS.SWIM_SPEED_FACTOR, 10)
    expect(wetMoved).toBeLessThan(dryMoved)
    expect(wet.y).toBe(FLOOR_TOP)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Terminal velocity
// ─────────────────────────────────────────────────────────────────────────────

describe('collision — terminal velocity', () => {
  it('never falls faster than the configured cap', () => {
    const world = floorWorld()
    const player = new Player(START_X, 120, START_Z)

    let fastest = 0
    for (let i = 0; i < 400; i++) {
      stepPhysics(world, player, IDLE, TIME.TICK_DT_SECONDS)
      if (player.vy < fastest) fastest = player.vy
    }

    expect(fastest).toBe(-PHYSICS.TERMINAL_VELOCITY)
    expect(player.y).toBe(FLOOR_TOP)
  })
})
