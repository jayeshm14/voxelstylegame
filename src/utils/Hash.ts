/**
 * `hash32` — FNV-1a over the little-endian bytes of int32 values.
 *
 * Constitution *Technical Constraints*: "Hash: `hash32(...ints)` = FNV-1a over
 * little-endian bytes of each int32 → uint32." One implementation, used by every
 * consumer — PRNG stream derivation, the golden hash, particle scatter and spawn
 * rules all go through this function rather than a local equivalent, so there is
 * a single hash to trust (research R6).
 *
 * Pure: no clock, no `Math.random()`, no allocation on the variadic path.
 *
 * Created during source phase 2 because the FR-045 particle pass derives every
 * particle from `hash32(eventKind, tick, index)` (research R18) and would
 * otherwise have had to invent a second mixing function. The **closed salt
 * enum** that T026 pairs with `Prng.ts` is added to this file at T026 — salts
 * belong to PRNG stream derivation, and nothing here needs one yet.
 */

/** FNV-1a 32-bit offset basis. */
const FNV_OFFSET_BASIS = 0x811c9dc5
/** FNV-1a 32-bit prime. */
const FNV_PRIME = 0x01000193

/** One FNV-1a byte step. Shared by every entry point below. */
function step(hash: number, byte: number): number {
  return Math.imul(hash ^ byte, FNV_PRIME)
}

/**
 * Hash a sequence of numbers, each narrowed to int32 first and then fed as its
 * four little-endian bytes.
 *
 * @param values any count of numbers; fractional parts are discarded by the
 *        int32 narrowing so callers never have to pre-round
 * @returns an unsigned 32-bit integer
 */
export function hash32(...values: readonly number[]): number {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < values.length; i++) {
    const v = (values[i] as number) | 0
    hash = step(hash, v & 0xff)
    hash = step(hash, (v >>> 8) & 0xff)
    hash = step(hash, (v >>> 16) & 0xff)
    hash = step(hash, (v >>> 24) & 0xff)
  }
  return hash >>> 0
}

/**
 * Hash a byte array, read as 32-bit words in index order.
 *
 * For a length that is a multiple of 4 this is byte-for-byte identical to
 * hashing the little-endian expansion of those words, which is what
 * `contracts/world-generation.md` means by "accumulated over 32-bit words in
 * defined order" — so the golden hash and `hash32` agree by construction. The
 * remainder of a non-multiple-of-4 tail is fed byte-wise rather than padded.
 *
 * @returns an unsigned 32-bit integer
 */
export function hashBytes(bytes: Uint8Array): number {
  let hash = FNV_OFFSET_BASIS
  let i = 0
  for (; i + 3 < bytes.length; i += 4) {
    const word =
      (bytes[i] as number) |
      ((bytes[i + 1] as number) << 8) |
      ((bytes[i + 2] as number) << 16) |
      ((bytes[i + 3] as number) << 24)
    hash = step(hash, word & 0xff)
    hash = step(hash, (word >>> 8) & 0xff)
    hash = step(hash, (word >>> 16) & 0xff)
    hash = step(hash, (word >>> 24) & 0xff)
  }
  for (; i < bytes.length; i++) {
    hash = step(hash, bytes[i] as number)
  }
  return hash >>> 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Closed salt enum — Constitution Principle I, contract clause D3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The closed set of PRNG stream salts: `NOISE=1 … TEXTURE=10`.
 *
 * Principle I: *"Salts are a closed enum and MUST NOT be reused for a second
 * purpose."* Two things make that real rather than advisory. The literal
 * `as const` union means {@link Salt} is these ten numbers and no others, so a
 * typo is a compile error and an eleventh salt cannot be introduced without
 * editing this list and therefore appearing in review. And because every
 * consumer reaches its salt through this object rather than through a bare
 * number, a duplicated value is visible as `SALT.TERRAIN` used where
 * `SALT.CAVE` belongs instead of as two identical integers.
 *
 * A salt names **which subsystem** is asking, never where in that subsystem it
 * is asking: position within a subsystem is passed as an ordinary discriminator
 * after the salt (`deriveStream(seed, SALT.TERRAIN, cx, cz, x, z)`), so two
 * columns of the same subsystem get different streams without needing two salts.
 *
 * Added here at T026 rather than with `hash32` at T014 — see
 * `docs/TECHNICAL_DECISIONS.md` TD-008.
 */
export const SALT = Object.freeze({
  NOISE: 1,
  BIOME_TEMP: 2,
  BIOME_HUMID: 3,
  TERRAIN: 4,
  CAVE: 5,
  ORE_COAL: 6,
  ORE_IRON: 7,
  TREE: 8,
  ENTITY_SPAWN: 9,
  TEXTURE: 10,
} as const)

/** One of the ten salts; no other number type-checks as a salt. */
export type Salt = (typeof SALT)[keyof typeof SALT]
