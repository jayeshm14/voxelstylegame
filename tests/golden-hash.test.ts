/**
 * Constitution test area: **golden hash** — source §13 test 3.
 *
 * "a constant committed to the repo (generate once, commit, and fail the test if
 * the algorithm changes without updating it)".
 *
 * The constants below were generated exactly once, at T030, from the generator
 * as it then stood — and never written by anything that runs. A golden hash
 * that recomputes itself cannot fail: the point is that any change to
 * `generateChunk` (a threshold, a noise salt, the pass order, the tree
 * geometry) produces a different number and stops here until someone reads the
 * diff and *decides* the new output is correct. Regenerating is therefore a
 * deliberate act, and the reason belongs in `docs/TECHNICAL_DECISIONS.md`.
 *
 * Input and algorithm are fixed by `contracts/world-generation.md`: the 32 768
 * bytes of `generateChunk(123456789, 0, 0)`, hashed with the same FNV-1a
 * `hash32` used everywhere else, accumulated over 32-bit words in defined order.
 *
 * The two comparison hashes were captured at the same moment to show the first
 * is not a fixed point — a one-region shift and a one-unit seed change both
 * move it, so a regression that silently pinned the output is caught too:
 *
 * | input                        | hash        |
 * | ---------------------------- | ----------- |
 * | seed 123456789, region (0,0) | 1460204569  |
 * | seed 123456789, region (1,0) | 1260073459  |
 * | seed 123456790, region (0,0) | 3767158694  |
 */

import { describe, expect, it } from 'vitest'
import { generateChunk } from '../src/world/generateChunk'
import { hash32, hashBytes } from '../src/utils/Hash'

/** FNV-1a over the 8 192 little-endian words of `generateChunk(SEED, CX, CZ)`. */
const GOLDEN_HASH = 1460204569

/** The seed the constant was captured with — `DEFAULT_SEED` in `GameConfig`. */
const GOLDEN_SEED = 123456789

const GOLDEN_CX = 0
const GOLDEN_CZ = 0

describe('golden hash', () => {
  it('hashes generateChunk(123456789, 0, 0) to the committed constant', () => {
    const blocks = generateChunk(GOLDEN_SEED, GOLDEN_CX, GOLDEN_CZ)
    expect(blocks.length).toBe(32_768)
    expect(hashBytes(blocks)).toBe(GOLDEN_HASH)
  })

  it('recomputes to the same value on a second pass', () => {
    const first = hashBytes(generateChunk(GOLDEN_SEED, GOLDEN_CX, GOLDEN_CZ))
    const second = hashBytes(generateChunk(GOLDEN_SEED, GOLDEN_CX, GOLDEN_CZ))
    expect(second).toBe(first)
    expect(first).toBe(GOLDEN_HASH)
  })

  it('is an unsigned 32-bit constant, as the contract requires', () => {
    expect(Number.isInteger(GOLDEN_HASH)).toBe(true)
    expect(GOLDEN_HASH).toBe(GOLDEN_HASH >>> 0)
    expect(GOLDEN_HASH).toBeGreaterThanOrEqual(0)
    expect(GOLDEN_HASH).toBeLessThanOrEqual(0xffffffff)
  })

  it('pins region (0, 0) specifically — a neighbouring region differs', () => {
    const neighbour = hashBytes(generateChunk(GOLDEN_SEED, 1, 0))
    expect(neighbour).not.toBe(GOLDEN_HASH)
    expect(neighbour).toBe(1260073459)
  })

  it('is not a fixed point for the seed either', () => {
    // The third row of the capture table: if the constant were somehow
    // insensitive to the input, "region is pinned" would be no test at all.
    const otherSeed = hashBytes(generateChunk(GOLDEN_SEED + 1, GOLDEN_CX, GOLDEN_CZ))
    expect(otherSeed).not.toBe(GOLDEN_HASH)
    expect(otherSeed).toBe(3767158694)
  })

  it('agrees with hash32 applied over the same 32-bit words', () => {
    // Research R6's rationale for reusing `hash32`: one hash implementation to
    // trust. If `hashBytes` ever diverged from the variadic path, this is what
    // would notice.
    const blocks = generateChunk(GOLDEN_SEED, GOLDEN_CX, GOLDEN_CZ)
    const words: number[] = []
    for (let i = 0; i + 3 < blocks.length; i += 4) {
      words.push(
        ((blocks[i] as number) |
          ((blocks[i + 1] as number) << 8) |
          ((blocks[i + 2] as number) << 16) |
          ((blocks[i + 3] as number) << 24)) |
          0,
      )
    }
    expect(words.length).toBe(8_192)
    expect(hash32(...words)).toBe(hashBytes(blocks))
  })
})
