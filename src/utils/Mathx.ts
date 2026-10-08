/**
 * Integer maths for block coordinates.
 *
 * World coordinates run from −2147483648 to 2147483647 and cross zero
 * constantly, so plain `/` and `%` are wrong: JavaScript truncates toward zero,
 * which maps block −1 into region 0 and local 15 instead of region −1 and
 * local 15. Every coordinate conversion must go through the two functions
 * below.
 *
 * `value` may be fractional, because the positions it is applied to are: a
 * player's eye, a ray origin and a camera position are all continuous, and a
 * continuous position still lies in exactly one block. It is floored toward
 * −∞ before anything else, so both functions address the block that position
 * is in — `floorDiv` yields that block's region, `floorMod` its coordinate
 * within the region, and for a whole `divisor` the two always satisfy
 * `floorDiv(v, d) * d + floorMod(v, d) === Math.floor(v)`. `divisor` must be a
 * whole number — it is always a structural constant such as the region size,
 * so a fractional one is a mistake rather than a coordinate. Non-finite inputs
 * (`NaN`, `±Infinity`) are rejected outright: a silent `NaN` would poison a
 * coordinate.
 *
 * Both are pure and total over the inputs they accept — no allocation, no
 * state, no clock — which is what lets `tests/coordinate.test.ts` assert exact
 * values.
 *
 * Constitution test area: *coordinate conversion*.
 */

/**
 * Floor division: rounds toward −∞, never toward zero.
 *
 * | value | divisor | result |
 * |------:|--------:|-------:|
 * | −17 | 16 | −2 |
 * | −16 | 16 | −1 |
 * | −1  | 16 | −1 |
 * | 0   | 16 | 0  |
 * | 15  | 16 | 0  |
 * | 16  | 16 | 1  |
 *
 * @param value    real number, negative or positive; any fraction is floored
 * @param divisor  whole number, non-zero
 * @throws RangeError if `value` is not finite, if `divisor` is not a finite
 *         integer, or if `divisor` is 0 — a silent `NaN` here would poison a
 *         coordinate.
 */
export function floorDiv(value: number, divisor: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`floorDiv expects a finite value, received ${String(value)}`)
  }
  if (!Number.isInteger(divisor)) {
    throw new RangeError(`floorDiv expects an integer divisor, received ${String(divisor)}`)
  }
  if (divisor === 0) {
    throw new RangeError('floorDiv division by zero')
  }
  const quotient = Math.floor(value / divisor)
  // `Math.floor(-0)` is `-0`, and `Object.is(-0, 0)` is false, so the zero row
  // of the table above would otherwise come back as `-0` and fail an exact
  // `toBe(0)` assertion.
  return quotient === 0 ? 0 : quotient
}

/**
 * Non-negative modulo: the result always lies in `[0, |divisor|)`, matching
 * `floorDiv` so that `floorDiv(v, d) * d + floorMod(v, d)` always equals
 * `Math.floor(v)` — the two invert each other for every finite input.
 *
 * | value | divisor | `%` (JavaScript) | result |
 * |------:|--------:|-----------------:|-------:|
 * | −17 | 16 | −1 | 15 |
 * | −16 | 16 | −0 | 0  |
 * | −1  | 16 | −1 | 15 |
 * | 15  | 16 | 15 | 15 |
 * | 16  | 16 | 0  | 0  |
 *
 * The JavaScript column is why the negative-zero normalisation below exists:
 * `-16 % 16` is `-0`, and `-0 < 0` is **false**, so a naive guard would return
 * `-0` for a block that is genuinely at local coordinate `0`.
 *
 * @param value    real number, negative or positive; floored toward −∞ first
 * @param divisor  whole number, non-zero
 * @throws RangeError if `value` is not finite, if `divisor` is not a finite
 *         integer, or if `divisor` is 0.
 */
export function floorMod(value: number, divisor: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`floorMod expects a finite value, received ${String(value)}`)
  }
  if (!Number.isInteger(divisor)) {
    throw new RangeError(`floorMod expects an integer divisor, received ${String(divisor)}`)
  }
  if (divisor === 0) {
    throw new RangeError('floorMod division by zero')
  }
  const remainder = Math.floor(value) % divisor
  const result = remainder < 0 ? remainder + Math.abs(divisor) : remainder
  // Normalise `-0` to `0`: see the table above. `Object.is(-0, 0)` is false, so
  // an unnormalised result fails `toBe(0)` in `tests/coordinate.test.ts`.
  return result === 0 ? 0 : result
}
