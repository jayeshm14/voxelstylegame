/**
 * Constitution test area: **coordinate conversion**.
 *
 * Source §13 test 1. World coordinates cross zero constantly and JavaScript's
 * `/` and `%` truncate toward zero, which would file block −1 under region 0
 * local 15 instead of region −1 local 15. Every conversion therefore has to go
 * through `Mathx.floorDiv` / `floorMod`, and these fixtures pin the exact
 * boundary behaviour at −17, −16, −1, 0, 15 and 16 — the six values where the
 * two implementations diverge or a region edge is crossed.
 *
 * The seed-determinism block (source §13 test 2, Constitution area *seed
 * determinism*) is appended below at T024, immediately before `generateChunk`
 * exists — see `docs/TECHNICAL_DECISIONS.md` TD-014 for why it could not be
 * written at T018 without breaking T023's green gate. Every assertion in it is
 * still confirmed failing before the function it covers is written.
 */

import { describe, expect, it } from 'vitest'
import { chunkCoordOf, localCoordOf } from '../src/world/World'
import { generateChunk } from '../src/world/generateChunk'

const SEED = 123456789

/** `[world block coordinate, region coordinate, coordinate within the region]` */
const FIXTURES: ReadonlyArray<readonly [value: number, chunk: number, local: number]> = [
  [-1, -1, 15],
  [0, 0, 0],
  [15, 0, 15],
  [16, 1, 0],
  [-16, -1, 0],
  [-17, -2, 15],
]

describe('coordinate conversion', () => {
  for (const [value, chunk, local] of FIXTURES) {
    it(`maps ${value} to region ${chunk}, local ${local}`, () => {
      expect(chunkCoordOf(value)).toBe(chunk)
      expect(localCoordOf(value)).toBe(local)
    })
  }

  it('satisfies chunk * 16 + local === value for every fixture', () => {
    for (const [value] of FIXTURES) {
      expect(chunkCoordOf(value) * 16 + localCoordOf(value)).toBe(value)
    }
  })

  it('never returns a local coordinate outside 0…15', () => {
    for (const [value] of FIXTURES) {
      const local = localCoordOf(value)
      expect(local).toBeGreaterThanOrEqual(0)
      expect(local).toBeLessThanOrEqual(15)
    }
  })

  it('round-trips a continuous position to the block it lies in', () => {
    // `Mathx` floors first, so −1.5 lies in block −2 — region −1, local 14 —
    // not in block −1 (local 15), which is where truncation would have filed it.
    expect(chunkCoordOf(-1.5)).toBe(-1)
    expect(localCoordOf(-1.5)).toBe(14)
    expect(chunkCoordOf(-1.5) * 16 + localCoordOf(-1.5)).toBe(Math.floor(-1.5))

    expect(chunkCoordOf(15.9)).toBe(0)
    expect(localCoordOf(15.9)).toBe(15)
    expect(chunkCoordOf(15.9) * 16 + localCoordOf(15.9)).toBe(Math.floor(15.9))
  })
})

/**
 * Constitution test area: **seed determinism** — source §13 test 2.
 *
 * Appended at T024 alongside the other source-phase-4 suites rather than at
 * T018, because `generateChunk` does not exist until T029 and an unresolvable
 * import would have kept this whole file red through T023's green gate. Every
 * assertion here is still written and confirmed failing before the function it
 * covers exists — see `docs/TECHNICAL_DECISIONS.md` TD-014.
 *
 * `chunk-purity.test.ts` carries the same three properties in their contractual
 * home; this block is the copy T018 names.
 */
describe('seed determinism', () => {
  it('generateChunk(123456789, 0, 0) called twice is byte-equal', () => {
    const first = generateChunk(SEED, 0, 0)
    const second = generateChunk(SEED, 0, 0)
    expect(Array.from(second)).toEqual(Array.from(first))
  })

  it('generateChunk(123456789, -3, 7) called twice is byte-equal', () => {
    const first = generateChunk(SEED, -3, 7)
    const second = generateChunk(SEED, -3, 7)
    expect(Array.from(second)).toEqual(Array.from(first))
  })

  it('a different seed differs', () => {
    const a = generateChunk(SEED, 0, 0)
    const b = generateChunk(SEED + 1, 0, 0)
    expect(Array.from(b)).not.toEqual(Array.from(a))
  })
})
