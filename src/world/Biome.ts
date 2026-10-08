/**
 * Biome classification — FR-002 and `spec.md` §*Documented Values → Biome
 * precedence*.
 *
 * The precedence is **fixed and total**: five rules evaluated in order, first
 * match wins. Order is not cosmetic — desert and snow overlap (a very cold, very
 * dry column satisfies both the snow test and the desert test), and the table
 * resolves that by putting snow first. Reordering the rules would silently
 * re-map existing worlds, so the sequence below mirrors the specification's row
 * for row.
 *
 * Every threshold comes from `GameConfig.BIOME`, where each carries a comment
 * naming its operator. All four are **strict** inequalities — "below −0.45",
 * "above 0.40", "below 0", "above 0.35", "above 0.15" — because the
 * specification writes them that way. Using `<=` anywhere would move every
 * column sitting exactly on a boundary into a different biome, and a world
 * generated before the change would not match one generated after it (FR-005).
 *
 * Classification reads only its three arguments: no noise, no seed, no state.
 * That is what lets a column's biome be recomputed at any time, from anywhere,
 * and always agree with what generation decided.
 *
 * Constitution test areas: *purity* and *seed determinism*.
 */

import { BIOME } from '../core/GameConfig'

/** The five biomes, as stable ids for switching and for the debug overlay. */
export const BIOME_ID = Object.freeze({
  PLAINS: 0,
  FOREST: 1,
  DESERT: 2,
  SNOW: 3,
  MOUNTAIN: 4,
} as const)

export type BiomeId = (typeof BIOME_ID)[keyof typeof BIOME_ID]

/** Display names, indexed by {@link BiomeId}. */
export const BIOME_NAMES: Readonly<Record<BiomeId, string>> = Object.freeze({
  [BIOME_ID.PLAINS]: 'Plains',
  [BIOME_ID.FOREST]: 'Forest',
  [BIOME_ID.DESERT]: 'Desert',
  [BIOME_ID.SNOW]: 'Snow',
  [BIOME_ID.MOUNTAIN]: 'Mountain',
})

/**
 * Classify a column from its climate samples.
 *
 * @param temperature  local temperature sample, nominally in `[-1, 1]`
 * @param moisture     local moisture sample, nominally in `[-1, 1]`
 * @param mountainMask mountain contribution, nominally in `[0, 1]`
 * @returns the first matching biome, or {@link BIOME_ID.PLAINS} if none do
 *
 * The arguments are deliberately not clamped: they are outputs of noise, which
 * already carries the contract's `[-1, 1]` bound, and clamping here would hide a
 * caller passing something out of range rather than classifying what it actually
 * asked about.
 */
export function classifyBiome(
  temperature: number,
  moisture: number,
  mountainMask: number,
): BiomeId {
  // Order and operators are FR-002's, row for row.
  if (temperature < BIOME.SNOW_TEMPERATURE) return BIOME_ID.SNOW
  if (temperature > BIOME.DESERT_TEMPERATURE && moisture < BIOME.DESERT_MOISTURE) {
    return BIOME_ID.DESERT
  }
  if (mountainMask > BIOME.MOUNTAIN_MASK) return BIOME_ID.MOUNTAIN
  if (moisture > BIOME.FOREST_MOISTURE) return BIOME_ID.FOREST
  return BIOME_ID.PLAINS
}

/** True when `id` is one of the five biomes. */
export function isBiomeId(id: number): boolean {
  return (
    id === BIOME_ID.PLAINS ||
    id === BIOME_ID.FOREST ||
    id === BIOME_ID.DESERT ||
    id === BIOME_ID.SNOW ||
    id === BIOME_ID.MOUNTAIN
  )
}
