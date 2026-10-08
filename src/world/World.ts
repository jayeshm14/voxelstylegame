/**
 * World read/write API and the block↔region↔local conversion — `data-model.md`
 * §8, FR-004, FR-014.
 *
 * Conversion is the reason `Mathx.ts` exists. JavaScript truncates `/` and `%`
 * toward zero, so the naive formulas file block −1 under region 0 local 15
 * instead of region −1 local 15. Every conversion below goes through
 * `floorDiv` / `floorMod`, which floor toward −∞, so
 *
 * ```text
 * chunkCoordOf(v) * 16 + localCoordOf(v) === Math.floor(v)
 * ```
 *
 * holds for every finite `v`, positive or negative, whole or not. `v` may be
 * fractional because the positions it is applied to are: a player's eye, a ray
 * origin and a camera position are all continuous, and a continuous position
 * still lies in exactly one block. `tests/coordinate.test.ts` pins the six
 * values where the two implementations diverge.
 *
 * `World` itself holds regions and nothing else. It has no clock, no PRNG and
 * no rendering, so it can be constructed and driven from a test directly.
 */

import { WORLD } from '../core/GameConfig'
import { isBlockId } from './BlockRegistry'
import { Chunk, REGION_DEPTH, REGION_WIDTH, blockIndex } from './Chunk'
import { floorDiv, floorMod } from '../utils/Mathx'

/** Region coordinate of a world coordinate on **x**. */
export function chunkCoordOf(block: number): number {
  return floorDiv(block, REGION_WIDTH)
}

/** Coordinate of a world coordinate within its region, `0 … 15`, on **x**. */
export function localCoordOf(block: number): number {
  return floorMod(block, REGION_WIDTH)
}

/**
 * Region coordinate of a world coordinate on **z**.
 *
 * Split out from {@link chunkCoordOf} so the two axes never silently share one
 * divisor: the region is square today (`REGION_WIDTH === REGION_DEPTH === 16`,
 * Documented Values), but the flat index formula in `Chunk.ts` already handles a
 * non-square region, so the conversions here must not be the thing that doesn't.
 */
function chunkCoordOfZ(block: number): number {
  return floorDiv(block, REGION_DEPTH)
}

/** Coordinate within the region on **z**. See {@link chunkCoordOfZ}. */
function localCoordOfZ(block: number): number {
  return floorMod(block, REGION_DEPTH)
}

/** Why a write did or did not land (FR-004 refuses out-of-world writes). */
export type SetBlockResult =
  /** The block changed and `modified` recorded it. */
  | 'written'
  /** `y` below 0 or at/above 128 — refused, exactly as FR-004 requires. */
  | 'refused-out-of-world'
  /** The containing region is not loaded, so there is nowhere to write. */
  | 'refused-unloaded'

export class World {
  /** The one seed every region is generated from (FR-005). */
  readonly seed: number

  readonly #chunks = new Map<string, Chunk>()

  /**
   * @param seed the world's seed; accepted as-is because validation of the
   *        seed range is the entry form's job (`Documented Values`, FR-001),
   *        not the simulation's
   */
  constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new RangeError(`world seed must be an integer, received ${String(seed)}`)
    }
    this.seed = seed
  }

  // ── region registry ────────────────────────────────────────────────────────

  /**
   * Register a region. Replacing an existing coordinate is allowed and drops it.
   *
   * Registering is not a neutral act, so it performs the same invalidation a
   * block edit does. Until now a neighbour's cells at the shared border read
   * this coordinate as AIR: the mesher emitted their outer faces, and — the part
   * that is actually visible — it lit them as though nothing stood there. The
   * moment terrain appears, both the faces and the illumination on all eight
   * neighbours can change, so all eight are marked dirty (FR-014, R12). Four
   * would cover the faces; eight are needed for light, because a neighbour one
   * step diagonally still has this region inside the 3 × 3 domain its
   * illumination is computed over.
   *
   * The dirty flag is a boolean, so generating a whole view distance collapses
   * to one remesh per region rather than one per arrival.
   */
  put(chunk: Chunk): void {
    this.#chunks.set(World.key(chunk.cx, chunk.cz), chunk)
    this.#markNeighboursDirty(chunk.cx, chunk.cz)
  }

  /**
   * Every resident region, in insertion order (Constitution Principle II: a
   * defined iteration order, never one that depends on hash layout).
   *
   * Streaming needs this twice over — to find what is dirty and to find what
   * has drifted outside the retained view distance — and neither question can be
   * answered from the outside without it. Returning the map's own iterator keeps
   * the order stable without copying; callers that mutate the registry while
   * iterating must snapshot first, as `ChunkManager.unload` does.
   */
  values(): IterableIterator<Chunk> {
    return this.#chunks.values()
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.#chunks.get(World.key(cx, cz))
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.#chunks.has(World.key(cx, cz))
  }

  /** Remove and return a region, so its GPU resources can be disposed. */
  removeChunk(cx: number, cz: number): Chunk | undefined {
    const removed = this.#chunks.get(World.key(cx, cz))
    this.#chunks.delete(World.key(cx, cz))
    return removed
  }

  /** Regions currently resident. Streamed load is bounded by this (FR-039). */
  get loadedCount(): number {
    return this.#chunks.size
  }

  /** Drop every region — used when leaving a world, never during play. */
  clear(): void {
    this.#chunks.clear()
  }

  /** Stable map key for a region coordinate. */
  static key(cx: number, cz: number): string {
    return `${cx},${cz}`
  }

  // ── read ───────────────────────────────────────────────────────────────────

  /** True when the region containing world `(wx, wz)` is resident. */
  isLoaded(wx: number, wz: number): boolean {
    return this.#chunks.has(World.key(chunkCoordOf(wx), chunkCoordOfZ(wz)))
  }

  /**
   * Block id at a world position.
   *
   * Returns `AIR` for both cases the specification says read as air: a `y`
   * outside `0 … 127` (FR-004), and a region that is not resident. Returning a
   * value rather than throwing keeps this safe on the hot path — raycasts probe
   * well outside the loaded set on every frame, and a throw there would turn a
   * routine probe into a crash.
   *
   * @see hasBlockAt for callers that need to tell "air" from "not there"
   */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD.HEIGHT) return 0 // AIR
    const chunk = this.#chunks.get(World.key(chunkCoordOf(wx), chunkCoordOfZ(wz)))
    if (chunk === undefined) return 0 // AIR
    return chunk.get(localCoordOf(wx), wy, localCoordOfZ(wz))
  }

  /**
   * Whether a world position can be read at all: in bounds *and* resident.
   * Out-of-world `y` is deliberately **not** "present" — FR-004 says those cells
   * read air, so treating them as present would make them writable.
   */
  hasBlockAt(wx: number, wy: number, wz: number): boolean {
    if (wy < 0 || wy >= WORLD.HEIGHT) return false
    const chunk = this.#chunks.get(World.key(chunkCoordOf(wx), chunkCoordOfZ(wz)))
    if (chunk === undefined) return false
    chunk.get(localCoordOf(wx), wy, localCoordOfZ(wz)) // validates the coordinates
    return true
  }

  // ── write ──────────────────────────────────────────────────────────────────

  /**
   * Write a block at a world position and maintain FR-014's dirty bookkeeping.
   *
   * Three things happen, in this order:
   *
   * 1. **Range refusal.** A `y` outside `0 … 127` is refused rather than
   *    clamped — silently redirecting a write to a different cell would invent
   *    a block the player never placed (FR-004).
   * 2. **The region is marked dirty** and the change is recorded in its
   *    `modified` map, which is what survives an unload (FR-021, R12).
   * 3. **Border neighbours are marked dirty.**
   *
   * Step 3 marks only the regions whose cells are *axis-adjacent* to the changed
   * cell, or whose **light** can change because of it:
   *
   * - on an edge (`localX` 0 or 15) the one region beyond that edge holds a
   *   face-adjacent cell;
   * - on a **corner** the diagonal region holds a cell two steps away, which a
   *   torch at level 14 still reaches at level 12, so its illumination — and
   *   therefore its mesh — changes too.
   *
   * A region exactly one wide is all that can be reached: light loses 1 per cell
   * and tops out at 15, and a region is 16 across, so no change can alter light
   * two regions away. Interior cells mark no neighbour at all.
   *
   * @returns what happened; `refused-*` leaves every region untouched
   * @throws RangeError if `id` is not one of the fifteen catalogue ids — an
   *         unknown id is a bug, not a gameplay outcome, so it must not be
   *         silently swallowed as a refusal
   */
  setBlock(wx: number, wy: number, wz: number, id: number): SetBlockResult {
    if (!isBlockId(id)) {
      throw new RangeError(`unknown block id ${String(id)}; refusing to write it`)
    }
    if (wy < 0 || wy >= WORLD.HEIGHT) return 'refused-out-of-world'

    const cx = chunkCoordOf(wx)
    const cz = chunkCoordOfZ(wz)
    const chunk = this.#chunks.get(World.key(cx, cz))
    if (chunk === undefined) return 'refused-unloaded'

    const localX = localCoordOf(wx)
    const localZ = localCoordOfZ(wz)

    chunk.set(localX, wy, localZ, id)
    chunk.modified.set(blockIndex(localX, wy, localZ), id)
    this.#markBorderNeighboursDirty(cx, cz, localX, localZ)
    return 'written'
  }

  /**
   * `+1` when the cell sits on the −x edge of its region, `−1` when it sits on
   * the +x edge, `0` when it is interior. Same for z.
   */
  #markBorderNeighboursDirty(cx: number, cz: number, localX: number, localZ: number): void {
    const dx = localX === 0 ? -1 : localX === REGION_WIDTH - 1 ? 1 : 0
    const dz = localZ === 0 ? -1 : localZ === REGION_DEPTH - 1 ? 1 : 0

    if (dx !== 0) this.#markDirty(cx + dx, cz)
    if (dz !== 0) this.#markDirty(cx, cz + dz)
    if (dx !== 0 && dz !== 0) this.#markDirty(cx + dx, cz + dz)
  }

  /**
   * All eight neighbours — the set a whole *region* invalidates, as opposed to
   * the axis-plus-corner set a single *cell* does. See {@link put}.
   */
  #markNeighboursDirty(cx: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue
        this.#markDirty(cx + dx, cz + dz)
      }
    }
  }

  /** Mark a region dirty if it happens to be resident. */
  #markDirty(cx: number, cz: number): void {
    const neighbour = this.#chunks.get(World.key(cx, cz))
    if (neighbour !== undefined) neighbour.dirty = true
  }
}
