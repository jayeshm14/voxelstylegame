/**
 * The fixed block catalogue — ids 0–14, FR-013, FR-044, `data-model.md` §4 and
 * the block-registry table in `contracts/world-generation.md`'s companion
 * contract [`contracts/registries.md`](../../specs/001-voxel-realms-game/contracts/registries.md).
 *
 * The table is **closed and immutable**: ids are referenced by generated chunk
 * data, by the save record's modification map and by the mesher, so a block can
 * never be inserted, removed or renumbered without invalidating every world
 * already written. `AIR = 0`, `WATER = 7` and `SNOW = 13` are pinned by the
 * specification and asserted below rather than left to convention.
 *
 * **`TORCH = 14` is the one id this module adds beyond the fourteen the source
 * document enumerates.** FR-044 states that block light *"is emitted by a
 * placed light-emitting block"* and that *"light is a pure function of `blocks`
 * alone"* (`data-model.md` §8) — so the torch has to live in `blocks`, and the
 * catalogue has to hold it. The id is **appended**, never renumbered, and
 * nothing is shipped yet: no world exists whose bytes could be invalidated.
 * The torch's *item* stays at its pre-existing id 103, registered as the
 * "placeable block proxy" precisely because it had no block to point at until
 * now. See TD-023 in `docs/TECHNICAL_DECISIONS.md`.
 *
 * Pure data and pure predicates: no clock, no `Math.random()`, no mutation. The
 * array is indexed *by block id*, so `BLOCKS[id]` is the catalogue entry and a
 * lookup costs one dereference rather than a map probe.
 *
 * Two field shapes deserve a note:
 *
 * - **`hardness` for WATER is `Infinity`.** Break time is
 *   `hardness / toolMultiplier` (`data-model.md` §4), and the contract marks
 *   WATER "unbreakable". Infinite hardness is the exact encoding of that: the
 *   division yields `Infinity`, so holding the button never completes a break
 *   and no separate "can this be broken" flag has to be kept in step. It
 *   satisfies the stated `number ≥ 0` constraint.
 * - **`minTier` is `0 | 1 | 2` for all fifteen ids**, including AIR and WATER
 *   where the contract table shows "—". T019 and `data-model.md` §4 both
 *   constrain the field to 0–2, and those two ids are never broken in the first
 *   place, so a concrete in-range value costs nothing and keeps the type simple
 *   for every consumer.
 *
 * Constitution test area: *tool rules* (break time and drop gating) is covered
 * by `tests/tools.test.ts` in source phase 7; this module carries the data it
 * reads.
 */

import { LIGHT } from '../core/GameConfig'

/** Which tool speeds a block up. `null` means no tool class does. */
export type ToolClass = 'shovel' | 'axe' | 'pickaxe'

/** Minimum tool tier at which a block drops anything (`data-model.md` §4). */
export type ToolTier = 0 | 1 | 2

export interface BlockType {
  /** Immutable catalogue key, 0–14. Also the item id for placeable blocks. */
  readonly id: number
  /** Unique display name. */
  readonly name: string
  /** Seconds to break by hand at multiplier 1; `Infinity` if unbreakable. */
  readonly hardness: number
  /** Drives collision (FR-006). */
  readonly solid: boolean
  /** Drives face culling (FR-014). */
  readonly transparent: boolean
  /** Tool class that speeds this block up; `null` when none does. */
  readonly toolClass: ToolClass | null
  /** Below this tier the block drops nothing (FR-018). */
  readonly minTier: ToolTier
  /** Item id granted on a qualifying break, or `null` for nothing. */
  readonly drops: number | null
}

/**
 * Named block ids. The three named by the specification — `AIR = 0`,
 * `WATER = 7`, `SNOW = 13` — are compile-time constants here so call sites read
 * as intent rather than as magic numbers, as is `TORCH = 14`, which FR-044
 * names in prose ("the torch is the only source this version ships") without
 * assigning a number.
 */
export const BLOCK = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,
  LEAVES: 6,
  WATER: 7,
  COAL_ORE: 8,
  IRON_ORE: 9,
  GLASS: 10,
  PLANK: 11,
  BRICK: 12,
  SNOW: 13,
  TORCH: 14,
} as const)

/**
 * Item ids dropped by ore blocks; non-block items start at 100.
 *
 * `ITEM_TORCH` is the contract's "placeable block proxy" (`registries.md` §Item
 * registry): the torch's inventory identity is 103 while its block id is 14, so
 * breaking one yields 103 and placing 103 writes `BLOCK.TORCH`. Every other
 * block item reuses its block id; this is the single documented exception.
 */
const ITEM_COAL = 101
const ITEM_IRON = 102
const ITEM_TORCH = 103

/**
 * The catalogue, indexed by block id. Ordered so that `BLOCKS[BLOCK.X].id ===
 * BLOCK.X` for every entry — an off-by-one here would silently mislabel every
 * generated region, so the invariant is asserted in tests rather than assumed.
 */
export const BLOCKS: readonly BlockType[] = Object.freeze([
  Object.freeze({
    id: BLOCK.AIR,
    name: 'AIR',
    hardness: 0,
    solid: false,
    transparent: true,
    toolClass: null,
    minTier: 0,
    drops: null,
  }),
  Object.freeze({
    id: BLOCK.GRASS,
    name: 'GRASS',
    hardness: 0.6,
    solid: true,
    transparent: false,
    toolClass: 'shovel',
    minTier: 0,
    drops: BLOCK.DIRT,
  }),
  Object.freeze({
    id: BLOCK.DIRT,
    name: 'DIRT',
    hardness: 0.5,
    solid: true,
    transparent: false,
    toolClass: null,
    minTier: 0,
    drops: BLOCK.DIRT,
  }),
  Object.freeze({
    id: BLOCK.STONE,
    name: 'STONE',
    hardness: 1.5,
    solid: true,
    transparent: false,
    toolClass: 'pickaxe',
    minTier: 1,
    drops: BLOCK.STONE,
  }),
  Object.freeze({
    id: BLOCK.SAND,
    name: 'SAND',
    hardness: 0.5,
    solid: true,
    transparent: false,
    toolClass: null,
    minTier: 0,
    drops: BLOCK.SAND,
  }),
  Object.freeze({
    id: BLOCK.WOOD,
    name: 'WOOD',
    hardness: 2.0,
    solid: true,
    transparent: false,
    toolClass: 'axe',
    minTier: 0,
    drops: BLOCK.WOOD,
  }),
  Object.freeze({
    id: BLOCK.LEAVES,
    name: 'LEAVES',
    hardness: 0.2,
    solid: true,
    transparent: true,
    toolClass: null,
    minTier: 0,
    drops: null,
  }),
  Object.freeze({
    id: BLOCK.WATER,
    name: 'WATER',
    hardness: Infinity,
    solid: false,
    transparent: true,
    toolClass: null,
    minTier: 0,
    drops: null,
  }),
  Object.freeze({
    id: BLOCK.COAL_ORE,
    name: 'COAL_ORE',
    hardness: 3.0,
    solid: true,
    transparent: false,
    toolClass: 'pickaxe',
    minTier: 1,
    drops: ITEM_COAL,
  }),
  Object.freeze({
    id: BLOCK.IRON_ORE,
    name: 'IRON_ORE',
    hardness: 3.0,
    solid: true,
    transparent: false,
    toolClass: 'pickaxe',
    minTier: 2,
    drops: ITEM_IRON,
  }),
  Object.freeze({
    id: BLOCK.GLASS,
    name: 'GLASS',
    hardness: 0.3,
    solid: true,
    transparent: true,
    toolClass: null,
    minTier: 0,
    drops: null,
  }),
  Object.freeze({
    id: BLOCK.PLANK,
    name: 'PLANK',
    hardness: 2.0,
    solid: true,
    transparent: false,
    toolClass: 'axe',
    minTier: 0,
    drops: BLOCK.PLANK,
  }),
  Object.freeze({
    id: BLOCK.BRICK,
    name: 'BRICK',
    hardness: 2.0,
    solid: true,
    transparent: false,
    toolClass: 'pickaxe',
    minTier: 1,
    drops: BLOCK.BRICK,
  }),
  Object.freeze({
    id: BLOCK.SNOW,
    name: 'SNOW',
    hardness: 0.2,
    solid: true,
    transparent: false,
    toolClass: null,
    minTier: 0,
    drops: BLOCK.SNOW,
  }),
  Object.freeze({
    // FR-044's light source. `solid: false` so a player can walk through the
    // cell it occupies and `transparent: true` so it neither occludes skylight
    // in its own column nor blocks the light it is emitting from passing on.
    // Hardness is not contract-pinned for this row; 0.1 puts it a step below
    // the two softest existing blocks (LEAVES, SNOW at 0.2), so a torch breaks
    // essentially on contact.
    id: BLOCK.TORCH,
    name: 'TORCH',
    hardness: 0.1,
    solid: false,
    transparent: true,
    toolClass: null,
    minTier: 0,
    drops: ITEM_TORCH,
  }),
])

/** Number of block ids in the closed catalogue. */
export const BLOCK_COUNT = BLOCKS.length

/** True when `id` is one of the fifteen catalogue entries. */
export function isBlockId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < BLOCK_COUNT
}

/**
 * Look up a catalogue entry.
 *
 * @throws RangeError if `id` is not one of the fifteen — an unknown id in
 *         generated data is a bug worth surfacing, not a value to default away
 */
export function blockById(id: number): BlockType {
  if (!isBlockId(id)) {
    throw new RangeError(`unknown block id ${String(id)}; expected 0…${BLOCK_COUNT - 1}`)
  }
  return BLOCKS[id] as BlockType
}

/** Drives collision (FR-006). Out-of-range ids are treated as non-solid. */
export function isSolid(id: number): boolean {
  if (!isBlockId(id)) return false
  return (BLOCKS[id] as BlockType).solid
}

/** Drives face culling (FR-014). Out-of-range ids are treated as transparent. */
export function isTransparent(id: number): boolean {
  if (!isBlockId(id)) return true
  return (BLOCKS[id] as BlockType).transparent
}

/** Item id a qualifying break grants, or `null` for no drop (FR-013). */
export function dropsFor(id: number): number | null {
  if (!isBlockId(id)) return null
  return (BLOCKS[id] as BlockType).drops
}

/**
 * Block-light level a cell emits (FR-044).
 *
 * FR-044 pins the *identity* of the source — *"the torch is the only source
 * this version ships"* — so the branch below is specification, not policy. The
 * *level* it emits is a tunable and therefore lives in `GameConfig`
 * (`LIGHT.TORCH_LEVEL`, Constitution III): this function deliberately contains
 * no numeric literal of its own, so raising torch brightness is a one-line
 * config change with no call site left to update.
 *
 * Every other cell, including an out-of-range id, emits nothing.
 */
export function lightEmission(id: number): number {
  if (id !== BLOCK.TORCH) return 0
  return LIGHT.TORCH_LEVEL
}
