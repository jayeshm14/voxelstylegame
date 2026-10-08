/**
 * mulberry32 — the project's one and only pseudorandom generator.
 *
 * Constitution Principle I: *\"All randomness derives from exactly one
 * algorithm, mulberry32. Every consumer MUST derive its own stream via
 * `hash32(seed, a, b, c, salt)`; sharing a mutable global stream across
 * consumers is forbidden.\"*
 *
 * Two halves enforce that. {@link mulberry32} is the algorithm itself, written
 * exactly as the source document specifies and nowhere else. {@link deriveStream}
 * is how a consumer reaches it: it hashes the seed together with a **closed
 * salt** and any number of discriminators, then seeds a brand-new generator from
 * the result. Because the state lives inside the closure returned per call, two
 * consumers cannot advance each other's stream even by accident, and a
 * `generateChunk` call leaves no trace on any other — which is what makes the
 * function pure (Principle I) and byte-reproducible across load orders (FR-005).
 *
 * Everything is confined to operations ECMAScript pins exactly: `+ | 0`,
 * `Math.imul`, `>>>`, `^` and a division by 2³², which is exact in binary64.
 * No `Math.random()`, no clock, no trigonometry (research R4, contract D4).
 *
 * Constitution test areas: *seed determinism* and *purity*.
 */

import { hash32, type Salt } from './Hash'

/**
 * Raw uint32 output of mulberry32's step, plus the float form derived from it.
 *
 * The float is `u / 2³²`: `u` is an integer below 2³², so the division is exact
 * in binary64 and the value lands in `[0, 1)`. Multiplying that by a small
 * integer to pick an array index stays exact too — the product needs at most 40
 * significant bits — which is why {@link PrngStream.nextInt} can use
 * `Math.floor` without introducing a rounding step that differs between engines
 * (research R4).
 */
export interface PrngStream {
  /** Next raw unsigned 32-bit value. */
  nextUint32(): number
  /** Next uniform value in `[0, 1)`. */
  next(): number
  /**
   * Next integer in `[0, maxExclusive)`, uniformly.
   *
   * @throws RangeError if `maxExclusive` is not a positive integer — a
   *         fractional or zero bound would make `Math.floor` return an index
   *         outside the array being selected from
   */
  nextInt(maxExclusive: number): number
}

/**
 * Create a generator from an initial state.
 *
 * mulberry32 exactly as specified by the source document:
 *
 * ```text
 * a += 0x6D2B79F5 (mod 2³²)
 * t = imul(a ^ a >>> 15, 1 | a)
 * t = t + imul(t ^ t >>> 7, 61 | t) ^ t
 * return t ^ t >>> 14
 * ```
 *
 * @param state any int32; fractional input is narrowed by `| 0`
 */
export function mulberry32(state: number): PrngStream {
  let a = state | 0

  function nextUint32(): number {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (t ^ (t >>> 14)) >>> 0
  }

  function next(): number {
    return nextUint32() / 4294967296
  }

  function nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(
        `nextInt expects a positive integer bound, received ${String(maxExclusive)}`,
      )
    }
    return Math.floor(next() * maxExclusive)
  }

  return { nextUint32, next, nextInt }
}

/**
 * Derive a fresh, independent stream for one consumer.
 *
 * The initial state is `hash32(seed, salt, ...discriminators)`, so:
 *
 * - two subsystems get different streams because their **salts** differ;
 * - two positions inside one subsystem get different streams because their
 *   **discriminators** differ;
 * - no consumer can observe any other's progress, because the generator's state
 *   lives in this call's closure and nowhere else.
 *
 * @param seed           the world seed, int32
 * @param salt           which subsystem is asking — the closed enum in `Hash.ts`
 * @param discriminators position within that subsystem: region, column, pass…
 * @throws RangeError from `hash32` if any discriminator is not finite
 */
export function deriveStream(
  seed: number,
  salt: Salt,
  ...discriminators: readonly number[]
): PrngStream {
  return mulberry32(hash32(seed, salt, ...discriminators))
}
