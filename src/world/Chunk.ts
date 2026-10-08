/**
 * One region's block storage — `data-model.md` §8.
 *
 * A chunk is a 16 × 128 × 16 column of block ids in a flat `Uint8Array` of
 * 32 768 bytes, indexed by
 *
 * ```text
 * index = (y * D + z) * W + x     with W = D = 16, H = 128
 * ```
 *
 * `y` is **not** chunked: every chunk spans the full world height, so a block's
 * world y and its y inside the chunk are the same number. The flat array rather
 * than a nested structure is what makes `generateChunk`'s byte-identical
 * contract (FR-005) and the FNV golden hash both representable — the region *is*
 * 32 768 ordered bytes.
 *
 * `dirty` and `modified` are the two pieces of bookkeeping the streaming layer
 * needs (FR-014, FR-021):
 *
 * - **`dirty`** means "this region's mesh no longer matches its blocks". Any
 *   block change sets it, and a change on a border also sets it on the affected
 *   neighbours. It is cleared when the region is remeshed, never by anything
 *   else.
 * - **`modified`** is the player-authored delta over generated terrain —
 *   `index → blockId`, retained across unload (R12) so a region that scrolls out
 *   of the retained view distance and back does not lose what was built there.
 *
 * Bounds are enforced here rather than trusted from callers: an index computed
 * from an out-of-range coordinate would silently corrupt a *neighbouring* region
 * or wrap inside this one, both of which are far harder to diagnose than a
 * thrown `RangeError`.
 */

import { WORLD } from '../core/GameConfig'

/** Blocks along x. */
export const REGION_WIDTH = WORLD.REGION_SIZE_X
/** Blocks along z. */
export const REGION_DEPTH = WORLD.REGION_SIZE_Z
/** Blocks along y — the full world height; chunks are not vertically split. */
export const REGION_HEIGHT = WORLD.HEIGHT

/** Blocks per region: `W * H * D` = 32 768 (Documented Values, FR-004). */
export const REGION_BLOCK_COUNT = REGION_WIDTH * REGION_HEIGHT * REGION_DEPTH

/**
 * Flat index of the cell at local `(x, y, z)`.
 *
 * Pure and unchecked: the range is enforced by {@link Chunk.get} and
 * {@link Chunk.set}, which are the only paths that turn an index into a read or
 * a write. Exposed because streaming and the mesher need the same formula to
 * address a cell without going through a `Chunk`.
 */
export function blockIndex(x: number, y: number, z: number): number {
  return (y * REGION_DEPTH + z) * REGION_WIDTH + x
}

export class Chunk {
  /** Region coordinate on x. */
  readonly cx: number
  /** Region coordinate on z. */
  readonly cz: number
  /** `W * H * D` block ids; the region's whole byte-level content. */
  readonly blocks: Uint8Array
  /** Player-authored changes over generated terrain, retained after unload. */
  readonly modified: Map<number, number>

  /**
   * Illumination per cell, 0–15 — `data-model.md` §8 and FR-044.
   *
   * Derived from `blocks` alone (skylight flood ∨ block-light flood, taking the
   * greater of the two), recomputed whenever a region or a border-adjacent
   * region goes dirty, discarded on unload, and **never serialised**: storing
   * it would both bloat the record and let a stale level survive a load.
   *
   * The array exists from construction so the mesher can always index it; it
   * reads 0 until `computeLight` has run for a region containing this one.
   */
  readonly light: Uint8Array

  /**
   * True when the mesh no longer matches `blocks`. Cleared by the mesher only.
   * Publicly writable because `ChunkManager` clears it once a remesh lands.
   */
  dirty: boolean

  /**
   * @param cx     region x
   * @param cz     region z
   * @param blocks existing storage; must be exactly {@link REGION_BLOCK_COUNT}
   *        bytes, which is how a freshly generated region is adopted without a
   *        copy
   * @throws RangeError if `cx`/`cz` are not integers, or `blocks` has the wrong
   *         length — a short array would read `undefined` as `NaN` downstream
   */
  constructor(cx: number, cz: number, blocks?: Uint8Array) {
    if (!Number.isInteger(cx) || !Number.isInteger(cz)) {
      throw new RangeError(`chunk coordinates must be integers, got (${String(cx)}, ${String(cz)})`)
    }
    if (blocks !== undefined && blocks.length !== REGION_BLOCK_COUNT) {
      throw new RangeError(
        `chunk blocks must be ${REGION_BLOCK_COUNT} bytes, received ${blocks.length}`,
      )
    }
    this.cx = cx
    this.cz = cz
    this.blocks = blocks ?? new Uint8Array(REGION_BLOCK_COUNT)
    this.modified = new Map<number, number>()
    this.light = new Uint8Array(REGION_BLOCK_COUNT)
    // A region adopted from storage or from `generateChunk` starts clean; a
    // default-allocated one starts empty but consistent, so also clean.
    this.dirty = false
  }

  /** Block id at local `(x, y, z)`. */
  get(x: number, y: number, z: number): number {
    const i = this.#index(x, y, z)
    // `#index` has already proved `i` is inside the array, which
    // `noUncheckedIndexedAccess` cannot see from the type alone.
    return this.blocks[i] as number
  }

  /**
   * Write a block id at local `(x, y, z)` and mark the region dirty (FR-014).
   *
   * Does **not** record into `modified` and does **not** touch neighbouring
   * regions — that is `World.setBlock`'s job, because only it knows the world
   * coordinates and therefore which neighbours share the border. Writing here
   * directly is for construction and for applying a stored delta.
   */
  set(x: number, y: number, z: number, id: number): void {
    if (!Number.isInteger(id)) {
      throw new RangeError(`block id must be an integer, received ${String(id)}`)
    }
    this.blocks[this.#index(x, y, z)] = id
    this.dirty = true
  }

  /** Replace the whole storage — used when a region is generated or loaded. */
  adopt(blocks: Uint8Array): void {
    if (blocks.length !== REGION_BLOCK_COUNT) {
      throw new RangeError(
        `chunk blocks must be ${REGION_BLOCK_COUNT} bytes, received ${blocks.length}`,
      )
    }
    this.blocks.set(blocks)
    this.dirty = true
  }

  /** True when this chunk holds the region containing world `(wx, wz)`. */
  containsWorldXZ(wx: number, wz: number): boolean {
    const min = this.cx * REGION_WIDTH
    const minZ = this.cz * REGION_DEPTH
    return wx >= min && wx < min + REGION_WIDTH && wz >= minZ && wz < minZ + REGION_DEPTH
  }

  /** Clear the dirty flag once the region has been remeshed. */
  clearDirty(): void {
    this.dirty = false
  }

  /**
   * Validate a local coordinate and return its flat index.
   *
   * @throws RangeError naming the offending axis — `y` in particular is checked
   *         against the *world* height so an out-of-world write is refused at
   *         the same place the specification refuses it (FR-004)
   */
  #index(x: number, y: number, z: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      throw new RangeError(
        `local block coordinates must be integers, got (${String(x)}, ${String(y)}, ${String(z)})`,
      )
    }
    if (x < 0 || x >= REGION_WIDTH) {
      throw new RangeError(`local x ${x} outside 0…${REGION_WIDTH - 1}`)
    }
    if (z < 0 || z >= REGION_DEPTH) {
      throw new RangeError(`local z ${z} outside 0…${REGION_DEPTH - 1}`)
    }
    if (y < 0 || y >= REGION_HEIGHT) {
      throw new RangeError(`local y ${y} outside 0…${REGION_HEIGHT - 1}`)
    }
    return blockIndex(x, y, z)
  }
}
