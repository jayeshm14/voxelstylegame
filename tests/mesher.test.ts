/**
 * Constitution test area: **mesher** — source §13 test 12.
 *
 * Two halves, because the file covers two things the plan deliberately keeps
 * together (plan.md: FR-044's lighting assertions were added here rather than
 * opened as a thirteenth suite, so the required suite count stays at 12):
 *
 * 1. **Face culling** — the rule is quoted verbatim from
 *    `contracts/registries.md`: *a face is emitted iff the neighbour is AIR, or
 *    the neighbour is transparent and the neighbour id differs from this id.*
 *    The counts that follow are arithmetic consequences of that sentence, which
 *    is why they are worth pinning: 6 for an isolated block, 10 for a pair
 *    (12 minus the two shared faces), and the same 10 for two water blocks —
 *    water next to water is the case the contract calls out by name.
 *
 * 2. **Lighting (FR-044)** — skylight and torch light on the documented 0–15
 *    scale. Two properties are asserted that a naive implementation gets wrong:
 *    an *enclosed* cell reads 0 rather than inheriting the sky's 15, and light
 *    crossing a region border is byte-identical whichever region is computed
 *    first. The second matters because FR-044 requires illumination to be a pure
 *    function of block data — so a flood fill that consulted a neighbour's
 *    already-computed light would be order-dependent and therefore a new source
 *    of divergence under FR-005.
 *
 * Written **before** `src/rendering/ChunkMesher.ts` exists. It fails to resolve
 * both `../src/rendering/ChunkMesher` and `BLOCK.TORCH`, which is the expected
 * red: T034/T035 are what make it green (T037).
 *
 * No timers, no fixtures on disk — every value here comes from `GameConfig`.
 */

import { describe, expect, it } from 'vitest'
import { World } from '../src/world/World'
import { Chunk, blockIndex } from '../src/world/Chunk'
import { BLOCK } from '../src/world/BlockRegistry'
import { LIGHT } from '../src/core/GameConfig'
import { buildRegionMesh, computeLight } from '../src/rendering/ChunkMesher'

const SEED = 123456789

/** A world with `regions` allocated and resident, all cells AIR. */
function worldWith(...regions: ReadonlyArray<readonly [number, number]>): World {
  const world = new World(SEED)
  for (const [cx, cz] of regions) world.put(new Chunk(cx, cz))
  return world
}

function chunkOf(world: World, cx: number, cz: number): Chunk {
  const chunk = world.getChunk(cx, cz)
  if (chunk === undefined) throw new Error(`region (${String(cx)}, ${String(cz)}) is not resident`)
  return chunk
}

/** Fill a region wall to wall with one block id. */
function fill(world: World, cx: number, cz: number, id: number): void {
  chunkOf(world, cx, cz).blocks.fill(id)
}

/** Hollow out an inclusive local box, so the surrounding stone seals it. */
function carve(
  chunk: Chunk,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): void {
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) chunk.set(x, y, z, BLOCK.AIR)
    }
  }
}

function lightAt(world: World, cx: number, cz: number, x: number, y: number, z: number): number {
  return chunkOf(world, cx, cz).light[blockIndex(x, y, z)] as number
}

// ─────────────────────────────────────────────────────────────────────────────
// Face culling — contracts/registries.md "Culling rule (FR-014)"
// ─────────────────────────────────────────────────────────────────────────────

describe('mesher: face culling', () => {
  it('emits 6 faces for a single isolated block', () => {
    const world = worldWith([0, 0])
    chunkOf(world, 0, 0).set(8, 50, 8, BLOCK.STONE)

    const mesh = buildRegionMesh(world, 0, 0)
    expect(mesh.opaque.faceCount).toBe(6)
    expect(mesh.transparent.faceCount).toBe(0)
  })

  it('emits 10 faces for two adjacent blocks', () => {
    const world = worldWith([0, 0])
    const chunk = chunkOf(world, 0, 0)
    chunk.set(8, 50, 8, BLOCK.STONE)
    chunk.set(9, 50, 8, BLOCK.STONE)

    const mesh = buildRegionMesh(world, 0, 0)
    // 6 + 6, less the two faces that now face each other.
    expect(mesh.opaque.faceCount).toBe(10)
    expect(mesh.transparent.faceCount).toBe(0)
  })

  it('culls the shared face between two water blocks', () => {
    const world = worldWith([0, 0])
    const chunk = chunkOf(world, 0, 0)
    chunk.set(8, 50, 8, BLOCK.WATER)
    chunk.set(9, 50, 8, BLOCK.WATER)

    const mesh = buildRegionMesh(world, 0, 0)
    // The contract names this case explicitly: water beside water has no
    // internal face, so the answer is 10 and not 12.
    expect(mesh.transparent.faceCount).toBe(10)
    expect(mesh.opaque.faceCount).toBe(0)
  })

  it('emits the stone face against water, but not the water face against stone', () => {
    // The other branch of the same rule: the neighbour is transparent *and*
    // differs, so the opaque block keeps the face; the water block's neighbour
    // is opaque, so it loses it.
    const world = worldWith([0, 0])
    const chunk = chunkOf(world, 0, 0)
    chunk.set(8, 50, 8, BLOCK.STONE)
    chunk.set(9, 50, 8, BLOCK.WATER)

    const mesh = buildRegionMesh(world, 0, 0)
    expect(mesh.opaque.faceCount).toBe(6) // 5 against air + 1 against the water
    expect(mesh.transparent.faceCount).toBe(5) // the face against the stone is hidden
  })

  it('builds the opaque and transparent meshes separately', () => {
    const world = worldWith([0, 0])
    const chunk = chunkOf(world, 0, 0)
    chunk.set(8, 50, 8, BLOCK.STONE)
    chunk.set(9, 50, 8, BLOCK.WATER)

    const mesh = buildRegionMesh(world, 0, 0)
    expect(mesh.opaque.faceCount).toBeGreaterThan(0)
    expect(mesh.transparent.faceCount).toBeGreaterThan(0)
    expect(mesh.opaque).not.toBe(mesh.transparent)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Lighting — FR-044, Documented Values "Light scale" / "Skylight" / "Torch"
// ─────────────────────────────────────────────────────────────────────────────

describe('mesher: FR-044 lighting', () => {
  it('reads the documented source level in a cell open to the sky', () => {
    // Sanity check on the half of the model that is easy to stub: an empty
    // region has nothing between any cell and the top of the world.
    const world = worldWith([0, 0])
    computeLight(world, 0, 0)
    expect(lightAt(world, 0, 0, 8, 50, 8)).toBe(LIGHT.SKYLIGHT_SOURCE)
  })

  it('reads skylight 0 in an enclosed cell with no opening to the sky', () => {
    const world = worldWith([0, 0])
    fill(world, 0, 0, BLOCK.STONE)
    // A 5x3x3 air cavity sealed inside stone: every column above it carries
    // stone to the top of the world, and every side is walled.
    carve(chunkOf(world, 0, 0), 7, 58, 7, 11, 60, 9)

    computeLight(world, 0, 0)

    for (const [x, y, z] of [
      [8, 59, 8],
      [7, 58, 7],
      [11, 60, 9],
    ] as ReadonlyArray<readonly [number, number, number]>) {
      expect(lightAt(world, 0, 0, x, y, z), `cell (${String(x)}, ${String(y)}, ${String(z)})`).toBe(0)
    }
  })

  it('reads 14 at a torch and 13 one block away', () => {
    const world = worldWith([0, 0])
    fill(world, 0, 0, BLOCK.STONE)
    const chunk = chunkOf(world, 0, 0)
    carve(chunk, 7, 58, 7, 11, 60, 9)
    chunk.set(8, 59, 8, BLOCK.TORCH)

    computeLight(world, 0, 0)

    // Enclosed, so skylight contributes nothing and illumination *is* the
    // block-light level here — outdoors the max rule would report the sky's 15
    // and these two assertions would be testing nothing.
    expect(lightAt(world, 0, 0, 8, 59, 8)).toBe(LIGHT.TORCH_LEVEL)
    expect(lightAt(world, 0, 0, 9, 59, 8)).toBe(LIGHT.TORCH_LEVEL - LIGHT.FALLOFF_PER_BLOCK)
    // …and falloff continues at exactly one level per block (FR-044).
    expect(lightAt(world, 0, 0, 10, 59, 8)).toBe(LIGHT.TORCH_LEVEL - 2 * LIGHT.FALLOFF_PER_BLOCK)
    // Light does not enter the stone wall beyond the cavity.
    expect(lightAt(world, 0, 0, 12, 59, 8)).toBe(0)
  })

  it('does not let a torch block skylight in its own column', () => {
    // A torch is non-solid and transparent, so an outdoor torch must not shadow
    // the cell beneath it the way an opaque block would.
    const world = worldWith([0, 0])
    const chunk = chunkOf(world, 0, 0)
    chunk.set(8, 50, 8, BLOCK.TORCH)

    computeLight(world, 0, 0)
    expect(lightAt(world, 0, 0, 8, 49, 8)).toBe(LIGHT.SKYLIGHT_SOURCE)
  })

  it('lights both regions identically regardless of build order', () => {
    /** Seal two adjacent regions, open a cavity across the seam, torch at x=15. */
    const buildBorder = (): World => {
      const world = worldWith([0, 0], [1, 0])
      fill(world, 0, 0, BLOCK.STONE)
      fill(world, 1, 0, BLOCK.STONE)
      carve(chunkOf(world, 0, 0), 12, 58, 7, 15, 60, 9)
      carve(chunkOf(world, 1, 0), 0, 58, 7, 3, 60, 9)
      // World x = 15 is region (0,0)'s last column; its light has to cross
      // x = 16 to be visible at all in region (1,0).
      chunkOf(world, 0, 0).set(15, 59, 8, BLOCK.TORCH)
      return world
    }

    const forward = buildBorder()
    computeLight(forward, 0, 0)
    computeLight(forward, 1, 0)
    const forwardA = chunkOf(forward, 0, 0).light.slice()
    const forwardB = chunkOf(forward, 1, 0).light.slice()

    const reverse = buildBorder()
    computeLight(reverse, 1, 0)
    computeLight(reverse, 0, 0)
    const reverseA = chunkOf(reverse, 0, 0).light.slice()
    const reverseB = chunkOf(reverse, 1, 0).light.slice()

    expect(Array.from(reverseA)).toEqual(Array.from(forwardA))
    expect(Array.from(reverseB)).toEqual(Array.from(forwardB))

    // …and the light really did cross, rather than both runs agreeing on dark.
    expect(forwardA[blockIndex(15, 59, 8)]).toBe(LIGHT.TORCH_LEVEL)
    expect(forwardB[blockIndex(0, 59, 8)]).toBe(LIGHT.TORCH_LEVEL - LIGHT.FALLOFF_PER_BLOCK)
    expect(forwardB[blockIndex(1, 59, 8)]).toBe(LIGHT.TORCH_LEVEL - 2 * LIGHT.FALLOFF_PER_BLOCK)
  })
})
