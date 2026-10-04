# OPENCODE MASTER PROMPT (DETERMINISTIC EDITION)
# PROJECT: Voxel Realms
# MODE: AUTONOMOUS, SPEC-DRIVEN, REPRODUCIBLE

You are an implementation agent. Follow this spec literally. Where this spec gives a
value, algorithm, name, path or command, use it EXACTLY. Where it gives none, choose the
simplest option, record it in `docs/TECHNICAL_DECISIONS.md`, and continue. Never ask
questions. Never stop at a plan.

## 0. DETERMINISM PRINCIPLES (apply to everything)

D1. Same input => same output. No `Math.random()`, `Date.now()` or `performance.now()` in
    any world, gameplay-logic or test code. Time enters only via the game loop's `dt`.
D2. All randomness comes from one PRNG: **mulberry32** (spec in section 4). Every random
    consumer derives its own stream with `hash32(seed, a, b, c, salt)`; never share a
    mutable global stream.
D3. Fixed-timestep simulation: **20 ticks/second (TICK_DT = 0.05 s)**. Rendering
    interpolates. Physics, entities and day/night advance only in ticks.
D4. Iteration order is always defined: chunks sorted by (distance², then x, then z);
    entities by ascending numeric id; registries by ascending numeric id.
D5. All tunable values live in `src/core/GameConfig.ts`. No magic numbers elsewhere.
D6. Dependencies are pinned to exact versions (no `^`/`~`). Commit the lockfile.
D7. Serialization is canonical: keys in fixed order, numbers as integers where possible,
    versioned schema.
D8. Do not vary architecture, file names or the phase order between runs.

## 1. TOOLCHAIN (fixed)

- Node 20 LTS, npm
- TypeScript 5.5.4 (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`)
- Vite 5.4.8
- three 0.169.0 (+ @types/three 0.169.0)
- vitest 2.1.2
- No React. No other runtime dependencies. Dev deps only: typescript, vite, vitest, @types/three.
- If the repo already has a 3D engine, KEEP it and record this in PROJECT_AUDIT.md;
  otherwise initialise the stack above.

npm scripts (exact names):
```
"dev":       "vite",
"build":     "tsc --noEmit && vite build",
"test":      "vitest run",
"typecheck": "tsc --noEmit",
"preview":   "vite preview"
```

## 2. EXECUTION RULES

1. Inspect the repo first. Write `docs/PROJECT_AUDIT.md` (stack, build/run/test commands,
   existing functionality, gaps, risks). Then implement immediately.
2. No placeholders, TODOs or pseudocode for core features. Every feature works end to end.
3. After EVERY phase run, in order: `npm run typecheck` -> `npm test` -> `npm run build`.
   Fix root causes (read the full error). Do not advance with a failing step.
4. Update `docs/IMPLEMENTATION_STATUS.md` after every phase using the checklist format in section 12.
5. Reuse correct existing code. Do not rewrite working functionality.
6. Never claim PASS for anything not actually executed and observed.
7. Original assets only: no Minecraft names, textures, sounds, UI, code. Textures are
   procedurally generated from the PRNG at startup (16x16 per tile, one atlas).

## 3. FIXED CONFIGURATION (GameConfig.ts defaults)

```
CHUNK_WIDTH = 16, CHUNK_HEIGHT = 128, CHUNK_DEPTH = 16
SEA_LEVEL = 40
DEFAULT_SEED = 123456789
RENDER_DISTANCE_CHUNKS = 6          (settable 2..12)
MAX_CHUNK_GENS_PER_TICK = 2
MAX_CHUNK_MESHES_PER_FRAME = 2
TICK_RATE = 20
DAY_LENGTH_SECONDS = 600            (0.0 = sunrise start, 0.25 noon, 0.5 sunset, 0.75 midnight)
PLAYER_WIDTH = 0.6, PLAYER_HEIGHT = 1.8, EYE_HEIGHT = 1.62
WALK_SPEED = 4.3, SPRINT_SPEED = 5.6 (blocks/s)
GRAVITY = 32 (blocks/s²), JUMP_VELOCITY = 9.0, TERMINAL_VELOCITY = 78
GROUND_ACCEL = 60, AIR_ACCEL = 20, GROUND_FRICTION = 10
STEP_HEIGHT = 0.6
REACH_DISTANCE = 5
FOV_DEFAULT = 75, MOUSE_SENSITIVITY = 0.002 (rad/px)
PLAYER_MAX_HEALTH = 20
INVENTORY_SLOTS = 36, HOTBAR_SLOTS = 9, MAX_STACK = 64
SAVE_SCHEMA_VERSION = 1
```

## 4. FIXED ALGORITHMS

**PRNG (mulberry32)**
```
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
```
**Hash:** `hash32(...ints)` = FNV-1a over the little-endian bytes of each int32; result is a uint32 seed for mulberry32.

**Noise:** 2D/3D simplex noise built from a 256-entry permutation table produced by a
Fisher-Yates shuffle driven by `mulberry32(hash32(seed, SALT_NOISE))`. Fractal (fBm) helper:
octaves, lacunarity = 2.0, gain = 0.5. All noise returns values in [-1, 1].

**Salts (constants enum, never reuse):** NOISE=1, BIOME_TEMP=2, BIOME_HUMID=3, TERRAIN=4,
CAVE=5, ORE_COAL=6, ORE_IRON=7, TREE=8, ENTITY_SPAWN=9, TEXTURE=10.

**Coordinate math (exact):**
```
chunkX = Math.floor(wx / CHUNK_WIDTH); localX = ((wx % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH
```
(same for z; y is not chunked: 0 <= y < CHUNK_HEIGHT; out-of-range y reads as AIR, writes rejected).

**Terrain generation (per column, order fixed):**
1. `temp = fbm2(x*0.004, z*0.004, salt BIOME_TEMP, 3 oct)`, `humid = fbm2(x*0.004, z*0.004, salt BIOME_HUMID, 3 oct)`.
2. Biome by first matching rule in this order:
   - temp < -0.45 -> SNOW
   - temp > 0.40 and humid < 0 -> DESERT
   - mountainMask = fbm2(x*0.002, z*0.002, salt TERRAIN+100, 2 oct) > 0.35 -> MOUNTAIN
   - humid > 0.15 -> FOREST
   - else PLAINS
3. Base height = `SEA_LEVEL + 4 + fbm2(x*0.01, z*0.01, salt TERRAIN, 4 oct) * A` where
   A = PLAINS 6, FOREST 8, DESERT 5, SNOW 8, MOUNTAIN 28 (add +10 to the base for MOUNTAIN).
   Blend heights across biome borders by averaging a 5x5 neighbourhood of biome amplitudes.
   Round with `Math.floor`.
4. Layers (top-down): surface block by biome (PLAINS/FOREST GRASS, DESERT SAND, SNOW SNOW,
   MOUNTAIN STONE above y=70 else GRASS), 3 blocks of sub-surface (DIRT; SAND for DESERT),
   then STONE. Height <= SEA_LEVEL+1 surface becomes SAND (beach). Bedrock-equivalent: y=0 is STONE.
5. Water: fill AIR with WATER for y <= SEA_LEVEL.
6. Caves: remove STONE/DIRT where `|simplex3(x*0.05, y*0.07, z*0.05, salt CAVE)| < 0.06` and 5 < y < height-4.
7. Ores (STONE only, per-voxel `hash32` threshold): COAL y 5..80, prob 0.8%; IRON y 5..50, prob 0.4%.
8. Trees: per column, `hash32(seed,x,z,TREE)/2^32 < p` with p = FOREST 0.020, PLAINS 0.004,
   SNOW 0.003, MOUNTAIN 0.000, DESERT 0.000; only on GRASS/SNOW; trunk height 4 + (hash & 3);
   leaves: 5x5x2 layer pair at top-2 and top-1 (corners removed), 3x3 at top, plus 1 at top+1.
   Trees crossing a chunk border are written by whichever chunk generates them, using only
   the tree origin's hash (so neighbouring chunks agree regardless of load order).
   Generation of a chunk must consider tree origins within 2 columns outside the chunk.

**Generation must be a pure function** `generateChunk(seed, cx, cz) -> Uint8Array`
(length W*H*D, index = `(y*D + z)*W + x`). It must not read any other chunk or global state.

## 5. BLOCKS (BlockRegistry, fixed IDs)

| ID | Name | Hardness | Solid | Transparent | Tool | Drops |
|---|---|---|---|---|---|---|
| 0 | AIR | 0 | no | yes | - | none |
| 1 | GRASS | 0.6 | yes | no | shovel-none | DIRT |
| 2 | DIRT | 0.5 | yes | no | - | DIRT |
| 3 | STONE | 1.5 | yes | no | pickaxe(min tier 1) | STONE |
| 4 | SAND | 0.5 | yes | no | - | SAND |
| 5 | WOOD | 2.0 | yes | no | axe | WOOD |
| 6 | LEAVES | 0.2 | yes | yes | - | none |
| 7 | WATER | - | no | yes | unbreakable | none |
| 8 | COAL_ORE | 3.0 | yes | no | pickaxe(1) | COAL |
| 9 | IRON_ORE | 3.0 | yes | no | pickaxe(2) | IRON_ORE_ITEM (smelt-free: drops IRON) |
| 10 | GLASS | 0.3 | yes | yes | - | none |
| 11 | PLANK | 2.0 | yes | no | axe | PLANK |
| 12 | BRICK | 2.0 | yes | no | pickaxe(1) | BRICK |
| 13 | SNOW | 0.2 | yes | no | - | SNOW |

Break time = `hardness / toolMultiplier`; toolMultiplier = 1 (hand), WOOD tier 2, STONE tier 4,
IRON tier 6, applied only when the tool class matches the block's tool class. Blocks with a
minimum tier drop nothing if broken with a lower tier.
Item IDs: blocks use their block ID (1..13). Non-block items start at 100 (see section 7).

## 6. CHUNKS, MESHING, STREAMING

- `Chunk { cx, cz, blocks: Uint8Array, dirty: boolean, modified: Map<number, number> }`.
- Mesher: per-face culling. A face is emitted iff the neighbour is AIR, or (neighbour
  transparent AND neighbour id != this id). Separate geometry per chunk into **two meshes**:
  opaque and transparent (water/glass/leaves, with `depthWrite=false` for water).
  Vertex format: position(3 float), uv(2 float), light(1 float: 0.6 sides, 1.0 top, 0.5 bottom).
  Atlas: 16x16 tiles of 16 px.
- A block change marks its chunk dirty, plus the neighbour chunk when `localX|localZ` is 0 or 15.
- Streaming per tick: (1) compute desired set (square radius = RENDER_DISTANCE_CHUNKS), (2) queue
  missing chunks sorted by (dist², cx, cz), (3) generate at most MAX_CHUNK_GENS_PER_TICK, (4)
  mesh at most MAX_CHUNK_MESHES_PER_FRAME (nearest dirty first), (5) unload chunks beyond
  RENDER_DISTANCE+2, disposing GPU resources and retaining their `modified` map.
- Worker threads are OPTIONAL; if used, results must be applied in queue order.

## 7. ITEMS, TOOLS, RECIPES (data-driven)

Items 100+: STICK=100, COAL=101, IRON=102, TORCH=103, WOODEN_PICKAXE=110, WOODEN_AXE=111,
STONE_PICKAXE=112, STONE_AXE=113, IRON_PICKAXE=114, IRON_AXE=115.
Tool tiers: WOOD=1 (mult 2), STONE=2 (mult 4), IRON=3 (mult 6). Pickaxe tier gate: STONE/COAL_ORE
need tier>=1, IRON_ORE needs tier>=2. Durability: 60 / 132 / 250 uses, decremented per block broken.

Recipes (shapeless, ingredient multiset -> output; implemented in `RecipeRegistry`):
```
1 WOOD                         -> 4 PLANK
2 PLANK                        -> 4 STICK
3 PLANK + 2 STICK              -> 1 WOODEN_PICKAXE      (and WOODEN_AXE: 3 PLANK + 2 STICK -> 1)
2 STONE + 2 STICK              -> 1 STONE_PICKAXE       (STONE_AXE: 3 STONE + 2 STICK -> 1)
2 IRON  + 2 STICK              -> 1 IRON_PICKAXE        (IRON_AXE: 3 IRON + 2 STICK -> 1)
1 SAND                         -> 1 GLASS    (documented simplification: no furnace)
1 COAL  + 1 STICK              -> 4 TORCH
```
Disambiguate pickaxe vs axe by distinct ingredient counts as shown above (pickaxe: 1 head... use
exactly the counts listed; recipe ids are unique strings `recipe.wooden_pickaxe` etc).
The crafting UI lists all recipes, greys out those not craftable, and crafts from the
whole inventory (consuming in ascending slot order).

## 8. PLAYER, PHYSICS, INTERACTION

- AABB collision, axis-separated resolution in order **Y, X, Z**, sweeping per axis, with
  max displacement per substep 0.25 blocks (substep as required). Epsilon 1e-4.
- Step-up: if horizontally blocked and the player is grounded, try lifting by STEP_HEIGHT.
- Raycast: voxel DDA (Amanatides-Woo), max distance REACH_DISTANCE, returns block position
  and face normal; ignores AIR and WATER.
- Break: hold LMB, progress accumulates by `dt/breakTime`; target change resets progress.
- Place: RMB places the selected hotbar block at `hit + normal` if the block is placeable,
  the target is AIR or WATER, and the new block's AABB does not intersect the player AABB.
- Spawn: at (0, surfaceHeight(0,0)+2, 0) found by scanning columns outward in a fixed spiral
  until a non-water, non-snow-less surface is found.
- Controls exactly as: WASD, Space, Shift sprint, Esc pause, 1-9 hotbar, E inventory,
  LMB break, RMB place, F3 debug, mouse wheel cycles hotbar. Click to Play with Pointer Lock;
  handle lock rejection and tab visibility change (auto-pause).

## 9. DAY/NIGHT, WATER, ENTITIES

- `timeOfDay = (tickCount * TICK_DT / DAY_LENGTH_SECONDS) % 1`. Sun angle = `timeOfDay * 2π`.
  Sky colour/ambient/directional intensity are interpolated from a fixed keyframe table
  (sunrise 0.0, noon 0.25, sunset 0.5, midnight 0.75). Moon visible when sun is below horizon.
- Water: transparent material, no collision; swimming slows movement to 40%.
- Entity `Forest Wanderer` (id kind=1): box body with a 1 Hz sine idle bob; health 10; spawns
  in FOREST chunks at generation time, count per chunk = `hash32(seed,cx,cz,ENTITY_SPAWN) % 3`
  (positions also hashed); wander state machine: IDLE (2-4 s) <-> WALK (1-3 s, random heading
  from its own seeded stream), refuses to step off ledges > 1 block; uses the same AABB collision.
- Entity updates run in ascending id order inside the fixed tick.

## 10. SAVE / LOAD (IndexedDB)

Database `voxel-realms`, store `worlds`, key = world name. Record (canonical key order):
```
{ version, name, seed, tick, player:{x,y,z,yaw,pitch,health}, hotbarIndex,
  inventory:[{id,count,durability?}|null ×36], modified:[[cx,cz,[[index,id],...]],...],
  entities:[...] }
```
Settings are stored separately in `localStorage` key `voxelrealms.settings.v1`.
Validate every field on load (type, range, schema version). On corrupt data: log via `Logger`,
show a non-fatal message, and offer to delete the save. API: `saveWorld()`, `loadWorld()`,
`hasSave()`, `deleteSave()`. Autosave every 60 s of game time and on pause.

## 11. UI (plain TS + DOM/CSS)

Main menu (New World with seed field [blank -> DEFAULT_SEED], Load World, Settings, Controls),
HUD (crosshair, 9-slot hotbar, health bar, coordinates, break-progress bar), inventory
(36 slots, drag/drop, stack counts, procedurally drawn item icons on 2D canvases), crafting
panel, pause menu (Resume, Settings, Save, Main Menu), settings (render distance, FOV, shadows,
particles, sensitivity, master/effects/music volume; persisted), debug overlay on F3
(FPS, draw calls, triangles, player xyz, chunk xz, seed, loaded/visible chunks, selected block,
velocity, JS heap estimate if available). Audio: WebAudio synthesized blips (no sample files).
Target-block outline: wireframe cube; break particles: instanced small cubes, count from settings.

## 12. PHASES (execute in this exact order, no skipping)

1 Audit + setup + build verification
2 Renderer, camera, lighting, game loop (fixed tick)
3 Block registry, chunk data, coordinate math
4 Noise, biomes, terrain/caves/ores/trees (pure `generateChunk`)
5 Meshing, streaming
6 Input, player, physics, collision
7 Raycast, break, place
8 Inventory, hotbar, items
9 Crafting, tools
10 Day/night, water, vegetation polish
11 Entities
12 Save/load
13 UI, menus, settings, HUD
14 Optimisation, debug overlay
15 Tests, bug fixing
16 Final polish, docs

`docs/IMPLEMENTATION_STATUS.md` format after each phase:
`PHASE n: DONE | typecheck PASS | tests PASS (N passed) | build PASS`

## 13. REQUIRED TESTS (vitest, all deterministic, no timers)

1. Coordinate conversion: `(-1 -> chunk -1, local 15)`, `(0 -> 0,0)`, `(15 -> 0,15)`, `(16 -> 1,0)`, `(-16 -> -1,0)`, `(-17 -> -2,15)`.
2. Seed determinism: `generateChunk(123456789, 0, 0)` called twice is byte-equal; also for (-3, 7); different seed differs.
3. Golden hash: SHA-256-like FNV hash of `generateChunk(123456789,0,0)` equals a constant committed to the repo
   (generate once, commit, and fail the test if the algorithm changes without updating it).
4. Cross-chunk trees: tree blocks along the border of chunks (0,0) and (1,0) are consistent
   regardless of generation order.
5. Block place/remove (boundary cases incl. neighbour-dirty marking at local x=0 and 15).
6. Inventory: stacking to 64, overflow into next slot, removal, move, persistence round trip.
7. Recipes: each recipe validates; craft consumes and produces exact counts; insufficient ingredients rejected.
8. Tool rules: break time for every (tool, block) pair in a table; tier gate drops.
9. Collision: falling onto a flat floor stops at y=floor; walking into a wall stops; corner slide;
   jump apex height within 1e-2 of `JUMP_VELOCITY²/(2*GRAVITY)` (discrete-tick tolerance documented).
10. Raycast: hits expected block and normal for 6 axis-aligned and 3 diagonal fixtures.
11. Save/load: serialize -> deserialize equals input; corrupted/invalid JSON handled without throwing.
12. Mesher: a single block produces 6 faces; two adjacent blocks produce 10; water next to water culls shared face.

## 14. ACCEPTANCE (all must be literally verified; record command output)

- `npm ci` succeeds with the committed lockfile
- `npm run typecheck` -> 0 errors
- `npm test` -> all pass
- `npm run build` -> success
- `npm run preview` serves the game; browser console shows no errors on: menu -> New World -> move,
  break, place, craft, save, reload, load
- Every checklist item in section 8-11 behaves as specified

If a headless browser is unavailable, verify by running type checks, tests and build, and mark
"Game Launch" as UNVERIFIED instead of PASS.

## 15. DOCUMENTATION (create exactly these)

README.md, docs/PROJECT_AUDIT.md, docs/ARCHITECTURE.md, docs/GAME_DESIGN.md, docs/CONTROLS.md,
docs/TECHNICAL_DECISIONS.md, docs/IMPLEMENTATION_STATUS.md (final line `STATUS: COMPLETE` only if
section 14 passed).

## 16. DIRECTORY LAYOUT (fixed)

Use the layout: `src/{core,rendering,world,player,inventory,crafting,entities,ui,persistence,audio,input,utils}`
with the files named in the original spec, plus `src/world/generateChunk.ts` (pure),
`src/utils/Prng.ts`, `src/utils/Hash.ts`, `tests/*.test.ts`, `index.html`.

## 17. FINAL RESPONSE (exactly this, nothing else)

```
PROJECT STATUS
Build: PASS/FAIL
Tests: PASS/FAIL (N passed)
Game Launch: PASS/FAIL/UNVERIFIED

IMPLEMENTED
- ...
TECH STACK
- ...
RUN
npm run dev
BUILD
npm run build
TEST
npm test
KNOWN LIMITATIONS
- ...
```

START NOW.
