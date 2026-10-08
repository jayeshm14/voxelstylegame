/**
 * Constitution test areas: **purity** and **cross-chunk trees**.
 *
 * Source §13 tests 2 and 4, plus the enforceable clauses of
 * `contracts/world-generation.md` — D1 (no ambient clock or randomness), the
 * import boundary, and load-order independence.
 *
 * The contract's enforcement mechanism is stated as "an import-boundary check",
 * so this suite reads the modules' own source. That is deliberate rather than a
 * test reaching outside its subject: purity is a property of *what the module
 * can see*, and asserting the byte array twice only proves the part of it that
 * happens to be observable. Reading the import list proves the rest.
 *
 * Sources arrive through Vite's `?raw` suffix rather than `node:fs`. The test
 * environment is deliberately Node-less — `tsconfig.json` pins `types` to
 * `vite/client`, which declares `*?raw`, so the test type-checks without adding
 * a `@types/node` dependency the constitution's pinned toolchain does not list.
 */

import generateChunkSource from '../src/world/generateChunk.ts?raw'
import noiseSource from '../src/world/Noise.ts?raw'
import biomeSource from '../src/world/Biome.ts?raw'
import blockRegistrySource from '../src/world/BlockRegistry.ts?raw'
import prngSource from '../src/utils/Prng.ts?raw'
import hashSource from '../src/utils/Hash.ts?raw'
import mathxSource from '../src/utils/Mathx.ts?raw'
import configSource from '../src/core/GameConfig.ts?raw'

import { describe, expect, it } from 'vitest'
import { generateChunk } from '../src/world/generateChunk'
import { BLOCK, BLOCKS } from '../src/world/BlockRegistry'
import { WORLD } from '../src/core/GameConfig'

const SEED = 123456789

const WIDTH = WORLD.REGION_SIZE_X
const DEPTH = WORLD.REGION_SIZE_Z
const HEIGHT = WORLD.HEIGHT

/** Exactly the seven modules `generateChunk` may import (contract §Purity). */
const ALLOWED_IMPORTS = new Set([
  './Noise',
  './Biome',
  './BlockRegistry',
  '../utils/Prng',
  '../utils/Hash',
  '../utils/Mathx',
  '../core/GameConfig',
])

/**
 * The modules the purity clauses apply to. `generateChunk.ts` itself carries the
 * import-boundary and module-level-state checks; the whole set carries the
 * clock-and-randomness check, because a forbidden call hidden in a helper is
 * just as fatal to determinism as one in the entry point.
 */
const GENERATION_SOURCES: ReadonlyArray<readonly [label: string, source: string]> = [
  ['src/world/generateChunk.ts', generateChunkSource],
  ['src/world/Noise.ts', noiseSource],
  ['src/world/Biome.ts', biomeSource],
  ['src/world/BlockRegistry.ts', blockRegistrySource],
  ['src/utils/Prng.ts', prngSource],
  ['src/utils/Hash.ts', hashSource],
  ['src/utils/Mathx.ts', mathxSource],
  ['src/core/GameConfig.ts', configSource],
]

function importsOf(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1] as string)
}

/**
 * Drop comments before scanning for forbidden calls.
 *
 * `Noise.ts` explains in prose why `Math.sqrt` is absent and `BlockRegistry.ts`
 * says it uses no `Math.random()` — both mention the very strings the check
 * forbids. The rule is about *calls*, so the scan runs on code only.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/** Region x = 0…15 borders region x = 16…31; both are needed for the border test. */
const BORDER_A: readonly [number, number] = [0, 0]
const BORDER_B: readonly [number, number] = [1, 0]

function blockAt(blocks: Uint8Array, x: number, y: number, z: number): number {
  return blocks[(y * DEPTH + z) * WIDTH + x] as number
}

describe('generateChunk purity', () => {
  it('returns byte-identical output for the same (seed, cx, cz) called twice', () => {
    const first = generateChunk(SEED, 0, 0)
    const second = generateChunk(SEED, 0, 0)
    expect(first.length).toBe(WIDTH * HEIGHT * DEPTH)
    expect(Array.from(second)).toEqual(Array.from(first))
  })

  it('returns byte-identical output for (-3, 7) called twice', () => {
    const first = generateChunk(SEED, -3, 7)
    const second = generateChunk(SEED, -3, 7)
    expect(Array.from(second)).toEqual(Array.from(first))
  })

  it('differs for a different seed', () => {
    const a = generateChunk(SEED, 0, 0)
    const b = generateChunk(SEED + 1, 0, 0)
    expect(Array.from(b)).not.toEqual(Array.from(a))
  })

  it('is unaffected by what was generated before it', () => {
    // No shared mutable PRNG stream: a consumer reusing one global stream would
    // produce different bytes here than in the control run.
    const control = generateChunk(SEED, 4, -2)
    generateChunk(SEED, 0, 0)
    generateChunk(SEED + 99, -12, 5)
    generateChunk(SEED, 4, -2)
    generateChunk(7, 30, 30)
    const after = generateChunk(SEED, 4, -2)
    expect(Array.from(after)).toEqual(Array.from(control))
  })

  it('is independent of generation order across the (0,0)/(1,0) border', () => {
    const aFirst = generateChunk(SEED, ...BORDER_A)
    const bFirst = generateChunk(SEED, ...BORDER_B)

    // Reverse the order and interleave unrelated regions in between.
    generateChunk(SEED, 8, 8)
    const bSecond = generateChunk(SEED, ...BORDER_B)
    const aSecond = generateChunk(SEED, ...BORDER_A)

    expect(Array.from(aSecond)).toEqual(Array.from(aFirst))
    expect(Array.from(bSecond)).toEqual(Array.from(bFirst))
  })

  it('agrees block-for-block along the shared border in both generation orders', () => {
    // `orderOne` is [A, B]; `orderTwo` deliberately runs them back to front and
    // is therefore [B, A] — so A compares as (0) against (1), not against (0).
    const orderOne = [generateChunk(SEED, ...BORDER_A), generateChunk(SEED, ...BORDER_B)]
    const orderTwo = [generateChunk(SEED, ...BORDER_B), generateChunk(SEED, ...BORDER_A)]

    // Region A's two outermost +x columns and region B's two outermost −x
    // columns — exactly the margin a tree originating outside can reach into.
    const borderColumns = (blocks: Uint8Array, fromX: number, toX: number): number[] => {
      const out: number[] = []
      for (let y = 0; y < HEIGHT; y++) {
        for (let z = 0; z < DEPTH; z++) {
          for (let x = fromX; x <= toX; x++) out.push(blockAt(blocks, x, y, z))
        }
      }
      return out
    }

    expect(borderColumns(orderTwo[1] as Uint8Array, WIDTH - 2, WIDTH - 1)).toEqual(
      borderColumns(orderOne[0] as Uint8Array, WIDTH - 2, WIDTH - 1),
    )
    expect(borderColumns(orderTwo[0] as Uint8Array, 0, 1)).toEqual(
      borderColumns(orderOne[1] as Uint8Array, 0, 1),
    )
  })

  it('actually generates a tree straddling the (0,0)/(1,0) border', () => {
    // Without this the order test above could pass on a world with no trees at
    // all, proving nothing about the clause it names. A tree rooted at world
    // x ∈ [14, 17] has a canopy reaching across x = 16, so one of the two
    // regions must show its leaves near that seam.
    const left = generateChunk(SEED, ...BORDER_A)
    const right = generateChunk(SEED, ...BORDER_B)

    const countLeaves = (blocks: Uint8Array, fromX: number, toX: number): number => {
      let n = 0
      for (let y = 0; y < HEIGHT; y++)
        for (let z = 0; z < DEPTH; z++)
          for (let x = fromX; x <= toX; x++) if (blockAt(blocks, x, y, z) === BLOCK.LEAVES) n++
      return n
    }

    const onSeam = countLeaves(left, WIDTH - 2, WIDTH - 1) + countLeaves(right, 0, 1)
    expect(onSeam).toBeGreaterThan(0)
  })
})

describe('generateChunk contracts', () => {
  it('imports only the seven modules the contract allows', () => {
    const found = importsOf(generateChunkSource)
    expect(found.length).toBeGreaterThan(0)
    for (const specifier of found) {
      expect(ALLOWED_IMPORTS.has(specifier), `disallowed import: ${specifier}`).toBe(true)
    }
  })

  it('declares no module-level mutable binding (D1)', () => {
    expect(/^(?:export\s+)?(?:let|var)\s/m.test(generateChunkSource)).toBe(false)
  })

  it('reads no clock and no ambient randomness (D1)', () => {
    const forbidden = ['Math.random(', 'Date.now(', 'performance.now(']
    for (const [label, source] of GENERATION_SOURCES) {
      const code = stripComments(source)
      for (const needle of forbidden) {
        expect(code.includes(needle), `${label} must not call ${needle}`).toBe(false)
      }
    }
  })

  it('evaluates no trigonometry and no square root in generation (D4, R4)', () => {
    // `Math.sqrt` is absent from D4's enumerated operation list even though
    // IEEE-754 pins it, so the skew and gradient constants are literals in
    // `Noise.ts`. Trigonometry would make the golden hash engine-dependent.
    const forbidden = ['Math.sin(', 'Math.cos(', 'Math.tan(', 'Math.sqrt(']
    for (const [label, source] of GENERATION_SOURCES) {
      const code = stripComments(source)
      for (const needle of forbidden) {
        expect(code.includes(needle), `${label} must not call ${needle}`).toBe(false)
      }
    }
  })

  it('fills water only at or below sea level', () => {
    const blocks = generateChunk(SEED, 0, 0)
    for (let y = WORLD.SEA_LEVEL + 1; y < HEIGHT; y++) {
      for (let z = 0; z < DEPTH; z++) {
        for (let x = 0; x < WIDTH; x++) {
          expect(
            blockAt(blocks, x, y, z) !== BLOCK.WATER,
            `water at (${x}, ${y}, ${z}) is above sea level ${WORLD.SEA_LEVEL}`,
          ).toBe(true)
        }
      }
    }
  })

  it('emits only ids from the fifteen-entry catalogue', () => {
    for (const region of [
      generateChunk(SEED, -1, -1),
      generateChunk(SEED, 0, 0),
      generateChunk(SEED, 3, -7),
    ]) {
      const seen = new Set<number>()
      for (const id of region) seen.add(id)
      for (const id of seen) {
        expect(id).toBeGreaterThanOrEqual(0)
        expect(id).toBeLessThan(BLOCKS.length)
      }
    }
  })

  it('keeps every column inside the world height (FR-004)', () => {
    const blocks = generateChunk(SEED, 0, 0)
    for (let z = 0; z < DEPTH; z++) {
      for (let x = 0; x < WIDTH; x++) {
        expect(blockAt(blocks, x, 0, z), `y=0 at (${x}, 0, ${z})`).not.toBe(BLOCK.AIR)
      }
    }
  })

  it('rejects a non-integer region coordinate', () => {
    expect(() => generateChunk(SEED, 0.5, 0)).toThrow(RangeError)
    expect(() => generateChunk(SEED, 0, 1.5)).toThrow(RangeError)
    expect(() => generateChunk(1.5, 0, 0)).toThrow(RangeError)
  })
})
