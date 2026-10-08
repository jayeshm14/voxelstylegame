/**
 * **US4 / FR-005 / SC-002** — seed reproducibility.
 *
 * Source §13 test 2's seed-determinism clause, promoted to a full verification:
 * the same seed must yield the same world *every time, everywhere*. The three
 * failure modes it defends against are different, so they get different tests:
 *
 * 1. **Repeated calls** — a generator that consumed shared mutable state would
 *    drift after the first call. Ten consecutive runs, whole-array comparison.
 * 2. **Generation order** — regions loaded in a different sequence must not
 *    differ, because a player's load order is not under anyone's control.
 * 3. **Restart** — state retained in a module between sessions (a cached
 *    permutation, an unseeded accumulator) survives a call loop but not a page
 *    reload. `vi.resetModules()` drops the module registry, so the re-imported
 *    factory is a genuinely different function object from the one above it —
 *    asserted below, so the test cannot quietly pass by comparing a value with
 *    itself.
 *
 * Comparison is **region by region over whole block arrays**, not by digest:
 * a hash would hide *which* block moved, and "the seed reproduces" is only
 * useful if a mismatch can be located. The digest manifest at the end is for
 * the cross-process half of SC-002 — see `specs/001-voxel-realms-game/quickstart.md` §5.
 *
 * No timers, no polling, no fixtures on disk: everything here is synchronous
 * and deterministic, per the Development Workflow's test rules.
 */

import { describe, expect, it, vi } from 'vitest'
import { generateChunk } from '../src/world/generateChunk'
import { hashBytes } from '../src/utils/Hash'

const SEED = 123456789

/**
 * Six regions chosen to cover the awkward cases: the origin, its right-hand
 * neighbour (the FR-005 straddling-trees case), the forward z-neighbour, a
 * doubly-negative region, and two more with no symmetry to either axis —
 * including a negative x with a positive z, which exercises the mixed-sign
 * path through `chunkCoordOf`.
 */
const REGIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, -1],
  [3, -7],
  [-5, 2],
]

/**
 * Captured digests, one per entry of `REGIONS`.
 *
 * These make the *restart* half of SC-002 checkable by the test itself rather
 * than by eye: whichever process runs this file, these six numbers must come
 * back unchanged. They also double as a second, wider golden-hash — six
 * regions instead of one, so a regression that happened to leave `(0, 0)` alone
 * is still caught.
 */
const MANIFEST: ReadonlyArray<number> = [
  1460204569, // ( 0,  0)
  1260073459, // ( 1,  0)
  460910421, // ( 0,  1)
  4284780635, // (-1, -1)
  2298690866, // ( 3, -7)
  2718511272, // (-5,  2)
]

/** Generate every region in `order`, placing each result at its own index. */
function generateAll(order: ReadonlyArray<number>): Uint8Array[] {
  const out: Uint8Array[] = new Array<Uint8Array>(REGIONS.length)
  for (const i of order) {
    const region = REGIONS[i] as readonly [number, number]
    out[i] = generateChunk(SEED, region[0], region[1])
  }
  return out
}

const IN_ORDER: ReadonlyArray<number> = REGIONS.map((_, i) => i)

/** A different, but still deterministic, visiting order — no PRNG in a test. */
function rotatedOrder(run: number): number[] {
  const shift = run % REGIONS.length
  return IN_ORDER.map((_, i) => (i + shift) % REGIONS.length)
}

describe('seed reproducibility (FR-005)', () => {
  it('regenerates every region byte-for-byte over 10 consecutive runs', () => {
    const baseline = generateAll(IN_ORDER)

    for (let run = 2; run <= 10; run++) {
      const again = generateAll(rotatedOrder(run))
      for (let i = 0; i < REGIONS.length; i++) {
        const region = REGIONS[i] as readonly [number, number]
        const label = `run ${run}, region (${region[0]}, ${region[1]})`
        const expected = baseline[i] as Uint8Array
        const actual = again[i] as Uint8Array
        expect(actual.length, label).toBe(expected.length)
        expect(Array.from(actual), label).toEqual(Array.from(expected))
      }
    }
  })

  it('regenerates identically across a restart — fresh module instance', async () => {
    const before = generateAll(IN_ORDER)

    // Drop the module registry so the import below builds a new graph. Without
    // this the test would just be calling the same factory twice.
    vi.resetModules()
    const reloaded = await import('../src/world/generateChunk')
    expect(reloaded.generateChunk, 'module registry did not reset').not.toBe(generateChunk)

    const after = REGIONS.map(([cx, cz]) => reloaded.generateChunk(SEED, cx, cz))

    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[i] as readonly [number, number]
      const label = `restarted process, region (${region[0]}, ${region[1]})`
      expect(Array.from(after[i] as Uint8Array), label).toEqual(Array.from(before[i] as Uint8Array))
    }
  })

  it('matches the captured per-region manifest — SC-002 cross-process evidence', () => {
    const observed = REGIONS.map(([cx, cz]) => hashBytes(generateChunk(SEED, cx, cz)))

    // Printed so two runs in separate processes can be diffed mechanically;
    // the assertions below are what actually decide pass or fail.
    const manifest = REGIONS.map(
      ([cx, cz], i) => `  region (${String(cx).padStart(2)}, ${String(cz).padStart(2)}) -> ${observed[i]}`,
    ).join('\n')
    console.log(`SEED ${SEED} MANIFEST\n${manifest}`)

    expect(observed).toEqual([...MANIFEST])
    for (const value of observed) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBe(value >>> 0)
    }
  })

  it('produces a different world for a different seed', () => {
    // Reproducibility is only meaningful if the seed is actually load-bearing;
    // an all-zeros generator would satisfy every assertion above.
    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[i] as readonly [number, number]
      const other = generateChunk(SEED + 1, region[0], region[1])
      expect(
        Array.from(other),
        `seed ${SEED + 1} coincidentally matched seed ${SEED} at (${region[0]}, ${region[1]})`,
      ).not.toEqual(Array.from(generateChunk(SEED, region[0], region[1])))
    }
  })
})
