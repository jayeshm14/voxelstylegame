/**
 * The single source of configuration — Constitution Principle III.
 *
 * Every tunable value in the game is declared here, exactly once, and
 * referenced by name everywhere else. Hard-coded numeric literals in gameplay
 * code are forbidden: a value that can diverge between call sites cannot be
 * reasoned about, tuned or tested as a single unit.
 *
 * Sources, in order of authority:
 *   1. `specs/001-voxel-realms-game/spec.md` § Documented Values (normative)
 *   2. `specs/001-voxel-realms-game/plan.md` (storage names, toolchain)
 *   3. `specs/001-voxel-realms-game/research.md` (particle ring, light fill)
 *
 * Every derived value below is *computed* from its normative input rather than
 * restated as a second literal, so changing an input cannot leave a stale copy
 * behind. This module imports nothing — it is a leaf, and it must stay one.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Normative primaries — edit these, never a derived value
//
// Every value in this file is either a normative primary or is *computed* from
// one; there is no third kind. Primitives shared by more than one group are
// declared in this block, and primitives belonging to exactly one group are
// declared beside that group (`SEED`, `WORLD_NAME`, `HEALTH`, `LIGHT`, `BIOME`,
// `LIGHTING_KEYFRAMES`) so the line nearest a reader is the one that explains
// it. Either way the rule holds: edit the primary, never a derived copy.
// ─────────────────────────────────────────────────────────────────────────────

/** Simulation rate: 20 ticks per second (FR-029). */
const TICKS_PER_SECOND = 20
/** Auto-save every 60 seconds of game time (FR-022). */
const AUTO_SAVE_SECONDS = 60
/** Day length: 600 seconds from one sunrise to the next (FR-027). */
const DAY_LENGTH_SECONDS = 600

/** 128 blocks, y from 0 to 127; reads outside are AIR, writes are refused (FR-004). */
const WORLD_HEIGHT = 128
/** 16 × 16 blocks horizontally across the full height (FR-004). */
const REGION_SIZE_X = 16
const REGION_SIZE_Z = 16
/** 16 × 16 regions — the fixed playable extent. */
const REGION_COUNT_X = 16
const REGION_COUNT_Z = 16
/** Terrain at or below this is water; beaches form above it (FR-003). */
const SEA_LEVEL = 40

/** Substituted when the seed field is left blank (FR-001). */
const DEFAULT_SEED = 123456789

/** Blocks per second squared, applied once per simulation tick (FR-006). */
const GRAVITY = 32
/** Blocks per second upward, applied once when jump is pressed while grounded. */
const JUMP_VELOCITY = 10
/** Swimming moves at 40% of normal speed (FR-008). */
const SWIM_SPEED_FACTOR = 0.4
/** Ledges no taller than one block are stepped onto without jumping (FR-007). */
const STEP_UP_HEIGHT = 1
/** Blocks, measured from the player's eye (FR-010, FR-012). */
const REACH = 5.0

/** Fixed slot count — the hotbar being the first 9 (data-model §3). */
const INVENTORY_SLOT_COUNT = 36
const HOTBAR_SLOT_COUNT = 9
/** Items per inventory slot (FR-015). */
const MAX_STACK = 64

/** 2–12 regions, default 6 (FR-004, FR-034). */
const VIEW_DISTANCE_MIN = 2
const VIEW_DISTANCE_MAX = 12
const VIEW_DISTANCE_DEFAULT = 6
/** Retain one region beyond the view distance (FR-039). */
const RETENTION_MARGIN_REGIONS = 1
/** At most 2 regions generated per tick (FR-039). */
const MAX_GENERATIONS_PER_TICK = 2
/** At most 2 regions meshed per frame (FR-039). */
const MAX_MESHES_PER_FRAME = 2
/** SC-014: a saved world must reach a playable restored state inside this budget. */
const LOAD_BUDGET_SECONDS = 10

/** Illumination per cell runs 0–15 (FR-044). */
const LIGHT_MIN = 0
const LIGHT_MAX = 15
/** Sky is unoccluded only in a cell open to the sky above the top layer. */
const SKYLIGHT_SOURCE = 15
/** Level at the emitting cell; reaches 0 after 14 blocks of propagation. */
const TORCH_LEVEL = 14
/** Decreases by exactly this per block propagated, through non-opaque cells. */
const LIGHT_FALLOFF_PER_BLOCK = 1
/**
 * Per-face shading baked into the vertex `light` term (source prompt §6:
 * *"light(1 float: 0.6 sides, 1.0 top, 0.5 bottom)"*).
 *
 * These multiply the FR-044 illumination rather than replacing it: `light`
 * carries `illumination / LIGHT.MAX × FACE_*`, so a cell's light level still
 * means exactly what `Documented Values` says while a cube's three
 * orientations read as three different brightnesses. Without them the only
 * face separation comes from the FR-027 directional light, which leaves side
 * and bottom faces identical whenever it points straight down.
 */
const FACE_UP = 1.0
const FACE_SIDE = 0.6
const FACE_DOWN = 0.5

/** Degrees (FR-034). */
const FOV_MIN = 60
const FOV_MAX = 110
const FOV_DEFAULT = 75
/** Radians per pixel (FR-034). */
const SENSITIVITY_MIN = 0.0005
const SENSITIVITY_MAX = 0.006
const SENSITIVITY_DEFAULT = 0.002
/** Master, effects and music each run 0–1, default 1; shown as 0–100%. */
const VOLUME_MIN = 0.0
const VOLUME_MAX = 1.0
const VOLUME_DEFAULT = 1.0

/** Fixed ring-buffer capacity for block-break and water-splash debris (FR-045, R18). */
const PARTICLE_CAPACITY = 256
/** Debris emitted by one block break (FR-045). */
const PARTICLE_BREAK_COUNT = 12
/** Debris emitted when the player enters water (FR-045). */
const PARTICLE_SPLASH_COUNT = 16
/** Lifetimes are counted in simulation ticks, never seconds (FR-045, R18). */
const PARTICLE_LIFETIME_TICKS = 20
/** Initial speed range, blocks per second, drawn from the event's hash. */
const PARTICLE_SPEED_MIN = 1.0
const PARTICLE_SPEED_MAX = 4.0
/** Debris falls under its own gravity, blocks per second squared (FR-045). */
const PARTICLE_GRAVITY = 20

/**
 * R14 stall cap: elapsed time beyond this is dropped rather than accumulated, so
 * a tab resumed after minutes in the background cannot schedule an unbounded
 * catch-up burst of ticks.
 */
const MAX_ACCUMULATED_SECONDS = 0.25

/** `data-model.md` §2 — pitch clamps to ±(π/2 − ε), ε keeping the camera short of gimbal. */
const PITCH_EPSILON = 0.0001

// ─────────────────────────────────────────────────────────────────────────────
// Time — the only time source is simulation ticks
// ─────────────────────────────────────────────────────────────────────────────

export const TIME = Object.freeze({
  TICKS_PER_SECOND,
  /** One tick = 0.05 s of game time. Derived so it can never disagree. */
  TICK_DT_SECONDS: 1 / TICKS_PER_SECOND,
  AUTO_SAVE_INTERVAL_SECONDS: AUTO_SAVE_SECONDS,
  AUTO_SAVE_INTERVAL_TICKS: AUTO_SAVE_SECONDS * TICKS_PER_SECOND,
  DAY_LENGTH_SECONDS,
  DAY_LENGTH_TICKS: DAY_LENGTH_SECONDS * TICKS_PER_SECOND,
  /** R14 — elapsed time above this in one `advance` call is dropped, not banked. */
  MAX_ACCUMULATED_SECONDS,
})

// ─────────────────────────────────────────────────────────────────────────────
// World geometry (FR-003, FR-004)
// ─────────────────────────────────────────────────────────────────────────────

export const WORLD = Object.freeze({
  HEIGHT: WORLD_HEIGHT,
  Y_MIN: 0,
  Y_MAX: WORLD_HEIGHT - 1,
  REGION_SIZE_X,
  REGION_SIZE_Z,
  REGION_SIZE_Y: WORLD_HEIGHT,
  /** 16 × 16 × 128 = 32,768 blocks per region. */
  REGION_BLOCK_COUNT: REGION_SIZE_X * WORLD_HEIGHT * REGION_SIZE_Z,
  REGION_COUNT_X,
  REGION_COUNT_Z,
  SEA_LEVEL,
})

// ─────────────────────────────────────────────────────────────────────────────
// Seed and naming (FR-001)
// ─────────────────────────────────────────────────────────────────────────────

export const SEED = Object.freeze({
  DEFAULT: DEFAULT_SEED,
  /** Whole numbers only; decimals, text and out-of-range are rejected at entry. */
  MIN: -2147483648,
  MAX: 2147483647,
})

export const WORLD_NAME = Object.freeze({
  /** Printable characters after trimming surrounding space. */
  MIN_LENGTH: 1,
  MAX_LENGTH: 32,
})

// ─────────────────────────────────────────────────────────────────────────────
// Physics (FR-006, FR-007, FR-008, FR-010)
// ─────────────────────────────────────────────────────────────────────────────

export const PHYSICS = Object.freeze({
  GRAVITY,
  JUMP_VELOCITY,
  /**
   * Jump integration is semi-implicit (symplectic) Euler at the tick rate:
   * velocity is updated from gravity first, then position from the *updated*
   * velocity, exactly once per tick. The jump trajectory and its apex are
   * therefore a single reproducible value asserted with NO tolerance — the
   * expected value is derived from this scheme, never read back from the
   * implementation (spec Documented Values → Jump integration; clarify 2026-10-05 Q5).
   */
  JUMP_INTEGRATION: 'semi-implicit-euler',
  SWIM_SPEED_FACTOR,
  STEP_UP_HEIGHT,
  REACH,
  // Deliberately NO jump-apex constant here: the collision test must derive the
  // expected apex from the scheme above (v² / 2g), not read it back from the
  // implementation — clarify 2026-10-05 Q5.
})

export const HEALTH = Object.freeze({
  MAX: 10,
})

// ─────────────────────────────────────────────────────────────────────────────
// Inventory (FR-015, FR-017)
// ─────────────────────────────────────────────────────────────────────────────

export const INVENTORY = Object.freeze({
  SLOT_COUNT: INVENTORY_SLOT_COUNT,
  HOTBAR_SLOT_COUNT,
  MAX_STACK,
  /**
   * Ingredient consumption order: ascending inventory slot index, slot 0 first,
   * so a craft spanning several partial stacks always resolves identically.
   */
  CONSUME_ORDER: 'ascending-slot-index',
})

// ─────────────────────────────────────────────────────────────────────────────
// Streaming budgets (FR-039, research R12)
// ─────────────────────────────────────────────────────────────────────────────

export const STREAMING = Object.freeze({
  VIEW_DISTANCE_MIN,
  VIEW_DISTANCE_MAX,
  VIEW_DISTANCE_DEFAULT,
  RETENTION_MARGIN_REGIONS,
  MAX_GENERATIONS_PER_TICK,
  MAX_MESHES_PER_FRAME,
  LOAD_BUDGET_SECONDS,
})

// ─────────────────────────────────────────────────────────────────────────────
// Lighting (FR-044, research R17)
// ─────────────────────────────────────────────────────────────────────────────

export const LIGHT = Object.freeze({
  MIN: LIGHT_MIN,
  MAX: LIGHT_MAX,
  SKYLIGHT_SOURCE,
  TORCH_LEVEL,
  FALLOFF_PER_BLOCK: LIGHT_FALLOFF_PER_BLOCK,
  /** A cell's illumination = the greater of its skylight and block-light level. */
  MODE: 'greater-of-two-sources',
  /** Vertex `light` multipliers per face orientation (prompt §6, TD-024). */
  FACE_UP,
  FACE_SIDE,
  FACE_DOWN,
})

/**
 * FR-027 — sky colour, ambient and directional intensity, interpolated linearly
 * between adjacent rows and repeating from midnight back to sunrise.
 */
export const LIGHTING_KEYFRAMES = Object.freeze([
  Object.freeze({ name: 'sunrise', fraction: 0.0, sky: 0xf2a65a, ambient: 0.45, directional: 0.55 }),
  Object.freeze({ name: 'noon', fraction: 0.25, sky: 0x87ceeb, ambient: 0.85, directional: 1.0 }),
  Object.freeze({ name: 'sunset', fraction: 0.5, sky: 0xe0663f, ambient: 0.4, directional: 0.5 }),
  Object.freeze({ name: 'midnight', fraction: 0.75, sky: 0x0b1026, ambient: 0.15, directional: 0.0 }),
])

// ─────────────────────────────────────────────────────────────────────────────
// Biome precedence (FR-002) — evaluated in order, first match wins
// ─────────────────────────────────────────────────────────────────────────────
//
// Every threshold in FR-002 is a STRICT inequality ("below −0.45", "above
// 0.40", "above 0.35", "above 0.15"). The names below therefore carry no `_MIN`
// or `_MAX` suffix — such a suffix reads as `<=` / `>=` and would invite exactly
// the off-by-one comparison the spec rules out. The operator is stated on each
// line instead, so the call site and FR-002 cannot drift apart.

export const BIOME = Object.freeze({
  /** Rule 1 — Snow: `temperature < SNOW_TEMPERATURE`. */
  SNOW_TEMPERATURE: -0.45,
  /** Rule 2 — Desert: `temperature > DESERT_TEMPERATURE`. */
  DESERT_TEMPERATURE: 0.4,
  /** Rule 2 — Desert, second clause: `moisture < DESERT_MOISTURE`. */
  DESERT_MOISTURE: 0.0,
  /** Rule 3 — Mountain: `mountainMask > MOUNTAIN_MASK`. */
  MOUNTAIN_MASK: 0.35,
  /** Rule 4 — Forest: `moisture > FOREST_MOISTURE`. */
  FOREST_MOISTURE: 0.15,
})

// ─────────────────────────────────────────────────────────────────────────────
// Noise / fBm — `contracts/world-generation.md` §Fixed algorithm commitments
// ─────────────────────────────────────────────────────────────────────────────
//
// LACUNARITY and GAIN are fixed by the contract at 2.0 and 0.5. They live here
// because Constitution III wants one configuration home, but they are **not
// tunable**: changing either regenerates every world and invalidates the
// committed golden hash, which is why the comment below marks them as such
// rather than presenting them as values to dial.

export const NOISE = Object.freeze({
  /** Contract-fixed — changing this invalidates the golden hash. */
  LACUNARITY: 2.0,
  /** Contract-fixed — changing this invalidates the golden hash. */
  GAIN: 0.5,
  /**
   * fBm octaves. The contract fixes lacunarity and gain but not the octave
   * count, so this is an open choice recorded in `docs/TECHNICAL_DECISIONS.md`
   * TD-019: four octaves resolve detail from 1 block (base frequency) down to
   * roughly 8 blocks (lacunarity¹·gain³ weighting), which is the range a
   * 16×16 region can actually show without spending work on detail smaller than
   * a block.
   */
  OCTAVES: 4,
})

// ─────────────────────────────────────────────────────────────────────────────
// Terrain generation — FR-002, FR-003, FR-004
// ─────────────────────────────────────────────────────────────────────────────
//
// Every value the generator reads lives here (Constitution III). None of it is
// specified by the requirements — the contract fixes the *algorithm* (simplex +
// fBm, lacunarity, gain) and the *sea level* (40), but not how tall the hills
// are, how deep the soil runs or how common iron is. Those are all open choices,
// recorded together in `docs/TECHNICAL_DECISIONS.md` TD-019.
//
// Changing any of these regenerates every world, so the committed golden hash in
// `tests/golden-hash.test.ts` must be regenerated deliberately alongside.

const TERRAIN_BASE_HEIGHT = 46
const TERRAIN_AMPLITUDE = 14
const TERRAIN_HILL_AMPLITUDE = 6
const TERRAIN_MOUNTAIN_GAIN = 130
const TERRAIN_SURFACE_DEPTH = 4
const TERRAIN_BEACH_BAND = 3
const TERRAIN_SNOW_LINE = 88

/** Noise periods, in world blocks — one full wave spans this many blocks. */
const CONTINENTAL_PERIOD = 220
const HILL_PERIOD = 46
const MOUNTAIN_PERIOD = 180
const TEMPERATURE_PERIOD = 420
const MOISTURE_PERIOD = 300
const CAVE_PERIOD = 22
const ORE_PERIOD = 14

/**
 * World-space offset applied to the mountain-ridge sample so it does not
 * correlate with the hill sample, which shares its noise instance.
 */
const LANDFORM_OFFSET = 100000

const CAVE_THRESHOLD = 0.68
const CAVE_MIN_Y = 6
const ORE_COAL_THRESHOLD = 0.78
const ORE_IRON_THRESHOLD = 0.84
const ORE_IRON_MAX_Y = 32

const TREE_DENSITY_FOREST = 0.05
const TREE_DENSITY_PLAINS = 0.01
const TREE_HEIGHT_MIN = 4
const TREE_HEIGHT_SPAN = 3
const TREE_CANOPY_RADIUS = 2

export const TERRAIN = Object.freeze({
  /** Mid-point the continental term oscillates around (FR-003, sea level 40). */
  BASE_HEIGHT: TERRAIN_BASE_HEIGHT,
  /** Peak-to-mid amplitude of the continental landform. */
  AMPLITUDE: TERRAIN_AMPLITUDE,
  /** Peak-to-mid amplitude of the hill term. */
  HILL_AMPLITUDE: TERRAIN_HILL_AMPLITUDE,
  /**
   * Extra height granted where the mountain mask exceeds
   * `BIOME.MOUNTAIN_MASK`: lift = `(mask − 0.35) × MOUNTAIN_GAIN`.
   *
   * The mask is the raw ridge sample — mean 0, σ ≈ 0.30, range ≈ ±0.83 — not a
   * `[0,1]` remap. Remapping would put the 0.35 threshold *below* the field's
   * mean and make roughly 84% of columns mountain, leaving Plains (FR-002's
   * "otherwise" case) almost never selected. See TD-020.
   *
   * At the observed maximum the lift is `0.48 × 130 ≈ 62`, and the tallest
   * non-mountain column is about `46 + 14 + 6 = 66`, so peaks land near y = 125
   * — inside the 128-block ceiling with room to spare.
   */
  MOUNTAIN_GAIN: TERRAIN_MOUNTAIN_GAIN,
  /** Blocks of soil under the surface before stone begins. */
  SURFACE_DEPTH: TERRAIN_SURFACE_DEPTH,
  /** Columns from `SEA_LEVEL` up to and including this height form a beach. */
  BEACH_BAND: TERRAIN_BEACH_BAND,
  /** At or above this height the surface is snow regardless of biome. */
  SNOW_LINE: TERRAIN_SNOW_LINE,
  CONTINENTAL_PERIOD,
  HILL_PERIOD,
  MOUNTAIN_PERIOD,
  TEMPERATURE_PERIOD,
  MOISTURE_PERIOD,
  CAVE_PERIOD,
  ORE_PERIOD,
  LANDFORM_OFFSET,
  /** Above this noise level a solid cell is carved out (3D). */
  CAVE_THRESHOLD,
  /** No carving at or below this y, so bedrock stays intact. */
  CAVE_MIN_Y,
  /** Above this noise level stone becomes coal ore (3D). */
  ORE_COAL_THRESHOLD,
  /** Above this noise level stone becomes iron ore (3D). */
  ORE_IRON_THRESHOLD,
  /** Iron is a deep ore: never above this y. */
  ORE_IRON_MAX_Y,
  /** Fraction of eligible columns in a forest that receive a tree. */
  TREE_DENSITY_FOREST,
  /** Fraction of eligible columns in plains that receive a tree. */
  TREE_DENSITY_PLAINS,
  TREE_HEIGHT_MIN,
  /** Trunk height is `MIN + nextInt(SPAN)` — 4, 5 or 6 blocks. */
  TREE_HEIGHT_SPAN,
  /** Canopy half-width. This is why generation looks 2 columns past a border. */
  TREE_CANOPY_RADIUS,
})

// ─────────────────────────────────────────────────────────────────────────────
// Settings (FR-034) — applied immediately, persisted across sessions
// ─────────────────────────────────────────────────────────────────────────────

export const SETTINGS = Object.freeze({
  FOV_MIN,
  FOV_MAX,
  FOV_DEFAULT,
  SENSITIVITY_MIN,
  SENSITIVITY_MAX,
  SENSITIVITY_DEFAULT,
  VOLUME_MIN,
  VOLUME_MAX,
  VOLUME_DEFAULT,
  VOLUME_CHANNELS: Object.freeze(['master', 'effects', 'music'] as const),
  /** Presentation only, never state (FR-045). */
  PARTICLES_DEFAULT: true,
})

// ─────────────────────────────────────────────────────────────────────────────
// Particles (FR-045, research R18)
// ─────────────────────────────────────────────────────────────────────────────

export const PARTICLES = Object.freeze({
  /**
   * Fixed ring-buffer capacity. Each particle's origin, velocity and lifetime
   * derive only from the triggering event and the simulation tick; lifetimes
   * are counted in simulation ticks, never seconds.
   */
  CAPACITY: PARTICLE_CAPACITY,
  KINDS: Object.freeze(['block-break', 'water-splash'] as const),
  BREAK_COUNT: PARTICLE_BREAK_COUNT,
  SPLASH_COUNT: PARTICLE_SPLASH_COUNT,
  LIFETIME_TICKS: PARTICLE_LIFETIME_TICKS,
  SPEED_MIN: PARTICLE_SPEED_MIN,
  SPEED_MAX: PARTICLE_SPEED_MAX,
  GRAVITY: PARTICLE_GRAVITY,
})

// ─────────────────────────────────────────────────────────────────────────────
// Camera (`data-model.md` §2, FR-006)
// ─────────────────────────────────────────────────────────────────────────────

export const CAMERA = Object.freeze({
  /** Pitch clamps to ±(π/2 − this); `yaw` is unbounded. */
  PITCH_EPSILON,
  PITCH_LIMIT: Math.PI / 2 - PITCH_EPSILON,
  /** Clipping planes. The far plane clears the peak view distance with margin. */
  NEAR: 0.1,
  FAR: 512,
})

// ─────────────────────────────────────────────────────────────────────────────
// Audio (FR-036)
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIO = Object.freeze({
  /**
   * The closed, exhaustive effect set of FR-036 — exactly six, in spec order,
   * "so this requirement is checked item by item against the list rather than by
   * impression". Adding a seventh (`step`, `jump`, `splash`, …) or dropping one
   * violates the requirement outright: *no other sound may be produced*.
   */
  EFFECTS: Object.freeze([
    /** FR-036 #1 — a block breaking. */
    'block-break',
    /** FR-036 #2 — a block being placed. */
    'block-place',
    /** FR-036 #3 — an item being crafted. */
    'craft',
    /** FR-036 #4 — the selected hotbar slot changing. */
    'hotbar-change',
    /** FR-036 #5 — a menu selection being made. */
    'menu-select',
    /** FR-036 #6 — a failed save being reported (FR-022). */
    'save-failed',
  ] as const),
  /**
   * One procedurally synthesised ambient loop, playing on the main menu and
   * while a world is open, silenced only by the music volume control.
   */
  AMBIENT_LOOP: true,
})

// ─────────────────────────────────────────────────────────────────────────────
// Persistence (plan.md Technical Context, research R1, contracts/save-schema.md)
// ─────────────────────────────────────────────────────────────────────────────

export const SAVE = Object.freeze({
  /** Written as an explicit field; a mismatch routes to the corruption path. */
  SCHEMA_VERSION: 1,
  DATABASE_NAME: 'voxel-realms',
  STORE_NAME: 'worlds',
  /** Web Lock name = prefix + world name; a second session is refused entry. */
  LOCK_PREFIX: 'voxel-realms:',
})

export const SETTINGS_STORAGE = Object.freeze({
  /** Stored separately so deleting a world never discards settings. */
  KEY: 'voxelrealms.settings.v1',
})

// ─────────────────────────────────────────────────────────────────────────────
// Derived aggregates — convenience views over the groups above
// ─────────────────────────────────────────────────────────────────────────────

/** Whole world extent in regions. */
export const WORLD_REGION_COUNT = WORLD.REGION_COUNT_X * WORLD.REGION_COUNT_Z

/**
 * Regions kept in each direction at the peak setting: ±(view distance + margin).
 * FR-039's phrase is "the current view distance plus the stated retention margin".
 */
const RETAINED_RADIUS = STREAMING.VIEW_DISTANCE_MAX + STREAMING.RETENTION_MARGIN_REGIONS

/**
 * Worst-case number of regions inside the retained view distance, for the
 * assertion in T108 ("retain no more than view distance + margin", FR-039).
 *
 * FR-039 states a *no-more-than* bound — "retain no more regions than those
 * intersecting the current view distance plus the stated retention margin" — and
 * neither FR-004 nor research R12 fixes the **shape** of that set: R12's
 * `distance²` is a queue *priority* order, not a membership predicate, and the
 * spec never says disk or square.
 *
 * So this takes the larger of the two candidate shapes, the Chebyshev square:
 *
 *   square   (2·13 + 1)² = 729
 *   disk     radius 13   = 529 lattice points
 *
 * A square ceiling is the safe one for what the number is for — SC-003's
 * "does not accumulate regions or buffers without bound". A square-based
 * implementation is allowed up to 729 and a disk-based one retains strictly
 * fewer, so neither is falsely failed; an unbounded leak is still caught.
 */
export const MAX_RETAINED_REGIONS = (2 * RETAINED_RADIUS + 1) * (2 * RETAINED_RADIUS + 1)
