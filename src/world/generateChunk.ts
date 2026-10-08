/**
 * Pure terrain generation — `(seed, cx, cz) → Uint8Array`.
 *
 * Implements FR-002, FR-003, FR-004, FR-005 and SC-002 under the purity clause
 * in [`contracts/world-generation.md`](../../specs/001-voxel-realms-game/contracts/world-generation.md).
 *
 * ## Purity (Constitution Principle I)
 *
 * The function reads **only its three arguments**. Every noise instance is
 * constructed inside the call from `seed`, every other input is a global column
 * coordinate derived arithmetically from `cx`/`cz`, and there is no module-level
 * `let` or `var` anywhere in this file. `tests/chunk-purity.test.ts` asserts both
 * of those facts by reading this source, because a purity rule that relies on
 * someone remembering it is not a rule.
 *
 * That is also what makes load order irrelevant: two regions generated in
 * either order, with anything in between, cannot differ, because neither can
 * see the other.
 *
 * ## Import boundary
 *
 * Only the seven modules `contracts/world-generation.md` permits — `./Noise`,
 * `./Biome`, `./BlockRegistry`, `../utils/Prng`, `../utils/Hash`,
 * `../utils/Mathx` and `../core/GameConfig`. In particular **not** `./Chunk` or
 * `./World`: the generator produces raw bytes, and adopting them into a `Chunk`
 * is the caller's job. That keeps generation free of runtime bookkeeping such as
 * `dirty` and `modified`, which have no meaning before a region exists.
 *
 * ## Order (contract clause D6)
 *
 * ```text
 * biome → height → layers → water → caves → ores → trees
 * ```
 *
 * The passes below appear in exactly that order and are commented as such, so
 * the sequence is checkable by eye. It matters: caves cut *after* water, so an
 * underwater pocket ends up as air rather than as more water; ores are laid
 * *after* caves, so an ore never appears inside a cell that was just carved.
 *
 * Trigonometry and `Math.sqrt` are absent (research R4, contract D4) — skew and
 * normalisation constants are literals inside `Noise.ts`.
 *
 * Constitution test areas: *purity*, *seed determinism*, *cross-chunk trees*.
 */

import { SimplexNoise } from './Noise'
import { BIOME_ID, classifyBiome, type BiomeId } from './Biome'
import { BLOCK } from './BlockRegistry'
import { deriveStream } from '../utils/Prng'
import { SALT } from '../utils/Hash'
import { BIOME, TERRAIN, WORLD } from '../core/GameConfig'

const WIDTH = WORLD.REGION_SIZE_X
const DEPTH = WORLD.REGION_SIZE_Z
const HEIGHT = WORLD.HEIGHT
/** Re-exported by `WORLD` rather than as a top-level binding — see GameConfig. */
const SEA_LEVEL = WORLD.SEA_LEVEL
const REGION_SIZE = WIDTH * HEIGHT * DEPTH

/**
 * Flat index of `(x, y, z)` — the contract's `(y * CHUNK_DEPTH + z) * CHUNK_WIDTH + x`.
 * Defined here rather than imported so the generator stays inside its import
 * boundary; `tests/chunk-purity.test.ts` pins both formulae to the same shape.
 */
function blockIndex(x: number, y: number, z: number): number {
  return (y * DEPTH + z) * WIDTH + x
}

/**
 * A column's sampled climate and the two values derived from it.
 *
 * Returned rather than recomputed: the main pass and the tree pass both need
 * the height at a column, and the tree pass reaches two columns outside the
 * region, so it is worth structuring the generator around an explicit
 * per-column sample even though nothing is cached between calls.
 */
interface Column {
  height: number
  biome: BiomeId
}

/**
 * Generate the 32 768 bytes of region `(cx, cz)`.
 *
 * @param seed int32 world seed
 * @param cx   region x; region 0 spans world x `0…15`, region −1 spans `−16…−1`
 * @param cz   region z
 * @returns a fresh `Uint8Array` of length `WIDTH * HEIGHT * DEPTH`. The caller
 *          owns it; this function never retains it.
 * @throws RangeError if `seed`, `cx` or `cz` is not an integer — a fractional
 *         region coordinate would silently generate a column belonging to
 *         somewhere else while reporting success
 */
export function generateChunk(seed: number, cx: number, cz: number): Uint8Array {
  if (!Number.isInteger(seed) || !Number.isInteger(cx) || !Number.isInteger(cz)) {
    throw new RangeError(
      `generateChunk expects integer (seed, cx, cz), received (${String(seed)}, ${String(cx)}, ${String(cz)})`,
    )
  }

  const blocks = new Uint8Array(REGION_SIZE)

  // One independent permutation per subsystem (Principle I, clause D2). The
  // default constructor is the contract's `mulberry32(hash32(seed, SALT_NOISE))`.
  const baseNoise = new SimplexNoise(seed)
  const landNoise = new SimplexNoise(seed, SALT.TERRAIN)
  const temperatureNoise = new SimplexNoise(seed, SALT.BIOME_TEMP)
  const moistureNoise = new SimplexNoise(seed, SALT.BIOME_HUMID)
  const caveNoise = new SimplexNoise(seed, SALT.CAVE)
  const coalNoise = new SimplexNoise(seed, SALT.ORE_COAL)
  const ironNoise = new SimplexNoise(seed, SALT.ORE_IRON)

  const minX = cx * WIDTH
  const minZ = cz * DEPTH

  /**
   * Step 1 and 2 — **biome → height**.
   *
   * Five noise fields, each from its own permutation so no two correlate:
   * continental landform, hills, mountain ridges, temperature, moisture. The
   * mountain mask feeds *both* the biome rule and the height, which is what
   * makes mountains appear where the mask says mountain rather than wherever
   * the arithmetic happens to be tall.
   */
  const sampleColumn = (wx: number, wz: number): Column => {
    const continental = baseNoise.fbm2D(wx / TERRAIN.CONTINENTAL_PERIOD, wz / TERRAIN.CONTINENTAL_PERIOD)
    const hills = landNoise.fbm2D(wx / TERRAIN.HILL_PERIOD, wz / TERRAIN.HILL_PERIOD)
    const ridges = landNoise.fbm2D(
      (wx + TERRAIN.LANDFORM_OFFSET) / TERRAIN.MOUNTAIN_PERIOD,
      (wz + TERRAIN.LANDFORM_OFFSET) / TERRAIN.MOUNTAIN_PERIOD,
    )
    /**
     * The mountain mask **is** the ridge sample, in its raw form.
     *
     * FR-002's threshold is 0.35, and this field is centred on 0 with σ ≈ 0.30,
     * so the threshold selects roughly the upper 12% — which is what makes
     * Mountain the exception and Plains the "otherwise" it is documented as.
     * Remapping to `[0,1]` with `(r + 1) / 2` would centre the mask on 0.5, put
     * 0.35 *below* the mean, and classify about 84% of columns as mountain.
     * The specification states no range for the mask, so the reading that keeps
     * FR-002's own precedence sensible is the one used here (TD-020).
     */
    const mountainMask = ridges
    const temperature = temperatureNoise.fbm2D(
      wx / TERRAIN.TEMPERATURE_PERIOD,
      wz / TERRAIN.TEMPERATURE_PERIOD,
    )
    const moisture = moistureNoise.fbm2D(
      wx / TERRAIN.MOISTURE_PERIOD,
      wz / TERRAIN.MOISTURE_PERIOD,
    )

    const biome = classifyBiome(temperature, moisture, mountainMask)

    let raw = TERRAIN.BASE_HEIGHT
    raw += continental * TERRAIN.AMPLITUDE
    raw += hills * TERRAIN.HILL_AMPLITUDE
    if (mountainMask > BIOME.MOUNTAIN_MASK) {
      raw += (mountainMask - BIOME.MOUNTAIN_MASK) * TERRAIN.MOUNTAIN_GAIN
    }

    let height = Math.floor(raw)
    // Comparisons, not `Math.min`/`Math.max`: contract D4 enumerates the
    // operations generation may use, and a bound that keeps a tuned value inside
    // the world is cheaper to defend than one that relies on the tunables
    // happening to be sane today.
    if (height < 0) height = 0
    if (height > HEIGHT - 1) height = HEIGHT - 1
    return { height, biome }
  }

  /** The two blocks a column is built from: what you walk on, and what is under it. */
  const surfaceAndSoil = (biome: BiomeId, height: number): readonly [number, number] => {
    // A beach is a band of sand just above the waterline, before any biome rule
    // — FR-003 says beaches form *above* sea level, so it outranks climate.
    if (height >= SEA_LEVEL && height <= SEA_LEVEL + TERRAIN.BEACH_BAND) {
      return [BLOCK.SAND, BLOCK.DIRT]
    }
    switch (biome) {
      case BIOME_ID.DESERT:
        return [BLOCK.SAND, BLOCK.SAND]
      case BIOME_ID.SNOW:
        return [BLOCK.SNOW, BLOCK.DIRT]
      case BIOME_ID.MOUNTAIN:
        return [BLOCK.STONE, BLOCK.STONE]
      default:
        return [BLOCK.GRASS, BLOCK.DIRT]
    }
  }

  // ── Steps 3 and 4 — layers → water, column by column ──────────────────────
  for (let x = 0; x < WIDTH; x++) {
    for (let z = 0; z < DEPTH; z++) {
      const column = sampleColumn(minX + x, minZ + z)
      const height = column.height
      const [surface, soil] = surfaceAndSoil(column.biome, height)

      // Step 3 — layers, top down: surface, then soil, then stone.
      for (let y = 0; y <= height; y++) {
        const depth = height - y
        let id: number
        if (depth === 0) id = surface
        else if (depth < TERRAIN.SURFACE_DEPTH) id = soil
        else id = BLOCK.STONE
        blocks[blockIndex(x, y, z)] = id
      }

      // Snow caps every biome at the snow line, including plains and forest
      // that would otherwise be unable to reach it.
      if (height >= TERRAIN.SNOW_LINE) {
        blocks[blockIndex(x, height, z)] = BLOCK.SNOW
      }

      // Step 4 — water fills everything from just above the ground up to the
      // sea level. Nothing above sea level is ever water, which is the
      // invariant `chunk-purity.test.ts` checks across a whole region.
      if (height < SEA_LEVEL) {
        for (let y = height + 1; y <= SEA_LEVEL; y++) {
          blocks[blockIndex(x, y, z)] = BLOCK.WATER
        }
      }
    }
  }

  // ── Step 5 — caves ────────────────────────────────────────────────────────
  // Runs after water (D6), but only carves solid cells: carving water would
  // leave a hole in the sea with nothing to fall into it, since there is no
  // fluid simulation (Non-Goals).
  for (let y = TERRAIN.CAVE_MIN_Y; y < HEIGHT; y++) {
    for (let z = 0; z < DEPTH; z++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = blockIndex(x, y, z)
        const id = blocks[i] as number
        if (id === BLOCK.AIR || id === BLOCK.WATER) continue
        const sample = caveNoise.noise3D(
          (minX + x) / TERRAIN.CAVE_PERIOD,
          y / TERRAIN.CAVE_PERIOD,
          (minZ + z) / TERRAIN.CAVE_PERIOD,
        )
        if (sample > TERRAIN.CAVE_THRESHOLD) blocks[i] = BLOCK.AIR
      }
    }
  }

  // ── Step 6 — ores ─────────────────────────────────────────────────────────
  // Placed after caves, so a vein is never written into open air; restricted to
  // stone, so an ore can never replace dirt, sand, water or another vein.
  for (let y = TERRAIN.CAVE_MIN_Y; y < HEIGHT; y++) {
    for (let z = 0; z < DEPTH; z++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = blockIndex(x, y, z)
        if ((blocks[i] as number) !== BLOCK.STONE) continue
        const wx = minX + x
        const wz = minZ + z

        const coal = coalNoise.noise3D(
          wx / TERRAIN.ORE_PERIOD,
          y / TERRAIN.ORE_PERIOD,
          wz / TERRAIN.ORE_PERIOD,
        )
        if (coal > TERRAIN.ORE_COAL_THRESHOLD) {
          blocks[i] = BLOCK.COAL_ORE
          continue
        }

        if (y > TERRAIN.ORE_IRON_MAX_Y) continue
        const iron = ironNoise.noise3D(
          wx / TERRAIN.ORE_PERIOD,
          y / TERRAIN.ORE_PERIOD,
          wz / TERRAIN.ORE_PERIOD,
        )
        if (iron > TERRAIN.ORE_IRON_THRESHOLD) blocks[i] = BLOCK.IRON_ORE
      }
    }
  }

  // ── Step 7 — trees ────────────────────────────────────────────────────────
  //
  // The loop starts at −2 and runs 2 past the far edge, so this region
  // considers tree origins it does not own. Each candidate is decided purely
  // from `(seed, SALT.TREE, worldX, worldZ)` — the *origin's* hash — and then
  // only the cells falling inside this region are written. A neighbour running
  // the same loop reaches the identical verdict about the same origin and
  // writes its own share, which is why a tree crossing a border looks whole
  // whichever side generated first (FR-005, contract §Cross-region trees).
  //
  // The margin equals the canopy radius by construction: a trunk two columns
  // outside has leaves reaching two columns back in.
  const margin = TERRAIN.TREE_CANOPY_RADIUS

  for (let ox = -margin; ox < WIDTH + margin; ox++) {
    for (let oz = -margin; oz < DEPTH + margin; oz++) {
      const wx = minX + ox
      const wz = minZ + oz

      const column = sampleColumn(wx, wz)
      const density = densityFor(column.biome)
      if (density === 0) continue
      // No trees under water: the trunk would start inside the sea.
      if (column.height <= SEA_LEVEL) continue

      const stream = deriveStream(seed, SALT.TREE, wx, wz)
      if (stream.next() >= density) continue

      const trunkHeight =
        TERRAIN.TREE_HEIGHT_MIN + stream.nextInt(TERRAIN.TREE_HEIGHT_SPAN)
      writeTree(blocks, ox, oz, column.height, trunkHeight)
    }
  }

  return blocks

  /** Trees grow in forest and plains only; the other three biomes are barren. */
  function densityFor(biome: BiomeId): number {
    if (biome === BIOME_ID.FOREST) return TERRAIN.TREE_DENSITY_FOREST
    if (biome === BIOME_ID.PLAINS) return TERRAIN.TREE_DENSITY_PLAINS
    return 0
  }

  /**
   * Write one tree rooted at local `(ox, oz)` on top of `groundY`, keeping only
   * the cells that fall inside this region.
   *
   * Both trunk and leaves are written **into air only**. That is what lets two
   * trees overlap without either erasing the other's trunk, and what stops a
   * canopy that runs into a hillside from carving the hill away.
   */
  function writeTree(
    target: Uint8Array,
    ox: number,
    oz: number,
    groundY: number,
    trunkHeight: number,
  ): void {
    const top = groundY + trunkHeight

    for (let y = groundY + 1; y <= top; y++) {
      if (ox < 0 || ox >= WIDTH || oz < 0 || oz >= DEPTH) continue
      if (y < 0 || y >= HEIGHT) continue
      const i = blockIndex(ox, y, oz)
      if ((target[i] as number) === BLOCK.AIR) target[i] = BLOCK.WOOD
    }

    for (let dy = -2; dy <= 1; dy++) {
      const y = top + dy
      if (y < 0 || y >= HEIGHT) continue
      const radius = dy === -1 || dy === 0 ? 2 : 1
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Rounded corners: a square canopy reads as a cube, not a tree.
          if (dx * dx + dz * dz > radius * radius + 1) continue
          // Leave the trunk column open wherever the trunk still is, so the
          // wood shows through instead of being buried in leaves.
          if (dx === 0 && dz === 0 && dy <= 0) continue
          const lx = ox + dx
          const lz = oz + dz
          if (lx < 0 || lx >= WIDTH || lz < 0 || lz >= DEPTH) continue
          const i = blockIndex(lx, y, lz)
          if ((target[i] as number) === BLOCK.AIR) target[i] = BLOCK.LEAVES
        }
      }
    }
  }
}
