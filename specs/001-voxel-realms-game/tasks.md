---

description: "Task list for Voxel Realms"
---

# Tasks: Voxel Realms

**Input**: Design documents from `specs/001-voxel-realms-game/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `.specify/memory/constitution.md`

**Tests**: **REQUIRED, not optional.** The constitution's *Development Workflow & Quality Gates*
mandates test-first development and names twelve test areas that MUST exist and pass
without real timers. Every test task below is written and confirmed **failing**
before its implementation task.

**Organization**: Tasks follow **source §12's sixteen phases in their exact order**.

> **Why not one phase per user story?** `/speckit.tasks`'s default layout sequences
> stories by priority P1→P7, which would invert source phases (save/load = phase 12
> would run before day/night + entities = phases 10–11) and pull UI (phase 13)
> forward. The constitution forbids that — *"The sixteen phases run in their stated
> order and MUST NOT be skipped or reordered"* — and `plan.md` gate **G8** records
> "phase order fixed by source §12". The source phases are therefore the spine and
> each task carries the user story `[USn]` it serves. Deviation from the default
> layout confirmed with the user before generation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task serves — `US1`…`US7`
- Every task names its exact file path
- Setup, Foundational and cross-cutting tasks carry **no** story label; story-specific
  verification tasks keep their label even when they sit inside a Foundational or
  Polish section

## Path Conventions

Single project at the repository root — `src/`, `tests/`, `docs/`, `index.html`
per `plan.md` Project Structure. No `backend/`/`frontend/` split.

---

## Phase 1: Setup — source §12 phase 1 (Audit + setup + build verification)

**Purpose**: A pinned, locked, scriptable toolchain that builds and tests before any game code exists.

- [X] T001 Audit the repository baseline and record the starting state in `docs/PROJECT_AUDIT.md`
- [X] T002 Create `package.json` with **exact** pins — `typescript` 5.5.4, `vite` 5.4.8, `three` 0.169.0, `@types/three` 0.169.0, `vitest` 2.1.2 — no ranges, and commit `package-lock.json` (Constitution IV, gate G6)
- [X] T003 [P] Create `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `target: ES2022`
- [X] T004 [P] Add the five fixed npm scripts to `package.json`: `dev`, `build`, `test`, `typecheck`, `preview` (Constitution IV)
- [X] T005 [P] Create `index.html`, `vite.config.ts`, and the twelve `src/` module directories exactly as named in `plan.md` Project Structure (Constitution V, gate G8)
- [X] T006 [P] Create the fixed documentation set: `README.md`, `docs/PROJECT_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, `docs/CONTROLS.md`, `docs/TECHNICAL_DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`
- [X] T007 [P] Initialise `docs/IMPLEMENTATION_STATUS.md` with the fixed line format `PHASE n: DONE | typecheck PASS | tests PASS (N passed) | build PASS` (source §12)
- [X] T008 Create `src/core/GameConfig.ts` holding **every** tunable from spec *Documented Values* — tick rate 20/s, `TICK_DT` 0.05, world height 128, sea level y=40, region 16×16, view distance 2–12 default 6, reach 5.0, step-up 1, day length 600 s, `MAX_STACK` 64, health max 10, auto-save 60 s, generation bound 2 regions/tick, meshing bound 2 regions/frame, load budget 10 s, gravity 32 b/s², jump velocity 10 b/s, skylight 15, torch light 14 with falloff 1/cell, field of view 60–110 default 75, mouse sensitivity 0.0005–0.006 default 0.002, master/effects/music volume 0–1 default 1, particles on/off, and `research.md` R18's 256-particle cap — with no duplicated literals at any use site (Constitution III, gates G3/G5; the last group added by clarification session 3)
- [X] T009 [P] Create `src/utils/Mathx.ts` with floor-division and non-negative modulo (coordinate conversion, mod-16 tiling)
- [X] T010 [P] Create `src/core/Logger.ts` as the only sanctioned diagnostic sink; no bare `console.*` elsewhere
- [X] T011 Run `npm ci` then `npm run typecheck`, `npm test`, `npm run build` in order and paste real output into `specs/001-voxel-realms-game/quickstart.md` §9 — record `UNVERIFIED` for anything not actually observed (Constitution G10/G11)
- [X] T012 Close source phase 1: re-run the three commands in order, record any open choice in `docs/TECHNICAL_DECISIONS.md`, and append the status line for `PHASE 1` to `docs/IMPLEMENTATION_STATUS.md`

**Checkpoint**: Toolchain verified — install, typecheck, test and build all run on an empty project.

---

## Phase 2: Foundational — source §12 phases 2–5

**Purpose**: Everything that blocks *all* user stories: the fixed-timestep loop, the pure generator, and the streaming/meshing pipeline. No story labels here — these are shared prerequisites.

> **Heading count:** this file has **13 section headings but covers all 16 source
> phases** — this one bundles source phases 2–5 (sub-headings 2a–2d). Phases 1 and
> 6–16 each keep their own heading. The mapping is one-to-one; no source phase is
> skipped, split across headings, or reordered (see the mapping table under
> *Dependencies & Execution Order*).

### Phase 2a — Renderer, camera, lighting, game loop (source phase 2)

- [X] T013 [P] Create `src/core/GameLoop.ts`: fixed-timestep accumulator at exactly 20 ticks/s, `dt` as the sole time input, rendering interpolating between ticks (research R14, FR-029)
- [X] T014 [P] Create `src/rendering/Renderer.ts`: scene, ambient + directional lights, render target, resize handling, plus the FR-045 particle pass — a fixed **256-slot ring buffer** (cap in `src/core/GameConfig.ts`, `research.md` R18) of block-break debris and water splash, each particle's origin, velocity and lifetime derived only from the triggering event and the simulation tick — lifetimes counted in simulation ticks, never seconds — and gated by the particles setting (FR-045)
- [X] T015 [P] Create `src/rendering/Camera.ts`: first-person, yaw/pitch only, `pitch` clamped to ±(π/2 − ε) (`data-model.md` §2)
- [X] T016 [P] Create `src/core/GameState.ts`: mode `menu | playing | paused`, with `paused` carrying two mutually exclusive screens — pause menu and inventory — inventory opening `paused`, Escape from `paused[inventory]` returning to `playing` rather than the pause menu, and no stacked-overlay state reachable (FR-009, FR-032, `data-model.md` §11)
- [X] T017 Close source phase 2: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 2` status line to `docs/IMPLEMENTATION_STATUS.md`

### Phase 2b — Block registry, chunk data, coordinate math (source phase 3)

- [X] T018 [P] Write `tests/coordinate.test.ts` **FIRST** and confirm it fails: fixtures `(-1 → chunk -1, local 15)`, `(0 → 0,0)`, `(15 → 0,15)`, `(16 → 1,0)`, `(-16 → -1,0)`, `(-17 → -2,15)`, plus `generateChunk(123456789, 0, 0)` called twice is byte-equal, also for `(-3, 7)`, and a different seed differs (source §13 tests 1–2; Constitution test areas *coordinate conversion* + *seed determinism*) — **closed:** fixtures written and observed failing (`World.ts` unresolved); the seed-determinism half is appended at T024 per TD-014
- [X] T019 [P] Create `src/world/BlockRegistry.ts`: fixed ids 0–13 (AIR = 0, WATER = 7, SNOW = 13) each with `hardness ≥ 0`, `solid`, `transparent`, `toolClass`, `minTier` 0–2, `drops` (FR-013, `data-model.md` §4)
- [X] T020 [P] Create `src/world/Chunk.ts`: `{ cx, cz, blocks: Uint8Array, dirty, modified }`, `index = (y*D + z)*W + x`, length `W*H*D` (32,768 blocks per region) (`data-model.md` §8)
- [X] T021 Create `src/world/World.ts`: read/write API plus block↔chunk↔local conversion using `Mathx.ts`; a change on a boundary marks the neighbouring chunk dirty (FR-014, `data-model.md` §8 ordering invariant)
- [X] T022 Make `tests/coordinate.test.ts` pass by implementing the conversion in `src/world/World.ts`
- [X] T023 Close source phase 3: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 3` status line to `docs/IMPLEMENTATION_STATUS.md`

### Phase 2c — Noise, biomes, terrain/caves/ores/trees (source phase 4) — underpins US1, US4

- [X] T024 [P] Write `tests/chunk-purity.test.ts` **FIRST** and confirm it fails: `generateChunk` reads no other chunk and no module-level state, and tree blocks along the border of chunks `(0,0)` and `(1,0)` are consistent regardless of generation order (source §13 tests 2, 4; Constitution test areas *purity* + *cross-chunk trees*) - **closed:** `chunk-purity.test.ts` written FIRST and observed failing; 15 assertions green at T030 (the red run also exposed two harness bugs of my own: a border comparison indexing `orderTwo` as [A,B] when it is [B,A], and forbidden-call strings matched inside comments)
- [X] T025 [P] Write `tests/golden-hash.test.ts` **FIRST** and confirm it fails: FNV hash of `generateChunk(123456789, 0, 0)` equals a constant committed to the repo (source §13 test 3; Constitution test area *golden hash*) - **closed:** `golden-hash.test.ts` written FIRST and observed failing on the absent constant; 7 assertions green at T030
- [X] T026 [P] Create `src/utils/Prng.ts` (mulberry32) and `src/utils/Hash.ts` (`hash32`, FNV-1a over little-endian int32 bytes) — one PRNG, every consumer deriving its own stream, salt enum closed (Constitution I, gate G2) - **closed:** `Prng.ts` + `Hash.ts` created; `SALT` enum closed at 10 entries (TD-008)
- [X] T027 [P] Create `src/world/Noise.ts`: simplex 2D/3D + fBm over a seeded permutation, with **generation maths restricted to exactly-specified float operations and trigonometry forbidden** (research R4, gate G1) - **closed:** `Noise.ts` created; skew constants and gradient tables are literals, so no `Math.sqrt` or trigonometry appears anywhere in generation (TD-018), asserted by `chunk-purity.test.ts`
- [X] T028 [P] Create `src/world/Biome.ts`: fixed documented precedence over temperature/moisture — plains, forest, desert, snow, mountain (FR-002, `spec.md` Documented Values → Biome precedence) - **closed:** `Biome.ts` created; FR-002's five rules evaluated in order with strict inequalities, no reordering
- [X] T029 Create `src/world/generateChunk.ts` as a **pure** `(seed, cx, cz) → Uint8Array` producing terrain height, sea level at y = 40, beaches, caves, coal and iron deposits, and biome-density trees; imports limited to the seven modules named in `contracts/world-generation.md` (FR-003, FR-004, gates G1/G3) - **closed:** `generateChunk.ts` created, 7-import allowlist honoured, D6 pass order, `TERRAIN` group added to `GameConfig.ts` (TD-019, TD-020, TD-021); measured Plains 48.9 / Forest 26.7 / Mountain 12.5 / Desert 5.3 / Snow 6.6, heights [31, 114], ocean 9.0%, caves 2.96% of solid, ore 0.70%
- [X] T030 Generate the golden hash once, commit the constant to `tests/golden-hash.test.ts`, and make `tests/chunk-purity.test.ts` and `tests/golden-hash.test.ts` pass — regenerating the constant only if a change is deliberate (research R6, `quickstart.md` §8) - **closed:** `GOLDEN_HASH = 1460204569` captured once and committed to `tests/golden-hash.test.ts`; `chunk-purity` and `golden-hash` both green (33 passed)
- [X] T031 [US4] Verify seed reproducibility (FR-005): run the same seed 10 consecutive times plus across a restart, comparing region by region as whole block arrays with an automated comparison - record evidence for SC-002 in `specs/001-voxel-realms-game/quickstart.md` §5 - **closed:** `seed-reproducibility.test.ts` - 10 consecutive runs compared region by region over whole block arrays, fresh-module restart, committed 6-region manifest; two separate processes printed identical manifests. SC-002 evidence recorded in `quickstart.md` §5
- [X] T032 Close source phase 4: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 4` status line to `docs/IMPLEMENTATION_STATUS.md` - **closed:** gate typecheck PASS / tests PASS (37 passed) / build PASS; TD-018 through TD-022 recorded; `PHASE 4` status line appended

### Phase 2d — Meshing, streaming (source phase 5) — underpins US1

- [X] T033 [P] Write `tests/mesher.test.ts` **FIRST** and confirm it fails: a single block produces 6 faces, two adjacent blocks produce 10, water next to water culls the shared face; plus **lighting (FR-044)** — an enclosed cell reads skylight 0, a torch cell reads 14 and 13 one block away, and a torch straddling a region border lights both regions identically regardless of build order (source §13 test 12; Constitution test area *mesher*) - **closed:** `tests/mesher.test.ts` written first (5 culling + 5 lighting = 10 tests) and observed failing with `Failed to load url ../src/rendering/ChunkMesher`; includes the required 6-face, 10-face, water-culls-water, enclosed skylight 0, torch 14 / 13-one-away and cross-region order-independence cases
- [X] T034 [P] Create `src/rendering/TextureAtlas.ts`: 16×16 tiles of 16 px generated at startup from code — no sample files, no third-party art (FR-038, research R8) - **closed:** `src/rendering/TextureAtlas.ts` - 16 × 16 slots of 16 px (256² image), `slot === block id` for 0–14, slots 16/17 for the grass side and log end, 100–115 reserved for item icons; every pixel computed from `mulberry32` per slot under `SALT.TEXTURE`, DOM access lazy so the UV half runs under `environment: 'node'` (TD-028, TD-029)
- [X] T035 Create `src/rendering/ChunkMesher.ts`: per-face culling producing one opaque and one transparent mesh; bake the **FR-044** illumination (skylight occlusion plus torch block light) per face at mesh time and rebuild it from the same dirty signal, so a light change travels the FR-014 boundary path (FR-014, FR-044, `plan.md` Project Structure) - **closed:** `src/rendering/ChunkMesher.ts` - two-pass `buildRegionMesh` (count, then write) emitting separate opaque/transparent `MeshData` with `positions`/`normals`/`uvs`/`light`/`indices`, plus `computeLight` filling a 3 × 3 region domain from `blocks` alone and storing into every resident region; `computeLight` and `buildRegionMesh` are one call path so FR-044's "same remesh path as FR-014" is structural (TD-025, TD-026, TD-027)
- [X] T036 Create `src/world/ChunkManager.ts`: streaming queue always sorted by `(distance², cx, cz)`, ≤ 2 generations per tick and ≤ 2 meshes per frame, unload + dispose outside the retained view distance (FR-039, research R12) - **closed:** `src/world/ChunkManager.ts` - four separate phases (`plan`/`generate`/`mesh`/`unload`) so the per-tick and per-frame bounds stay separately verifiable, queue rebuilt and sorted by `(distance², cx, cz)` with `STREAMING.MAX_GENERATIONS_PER_TICK` (2) and `STREAMING.MAX_MESHES_PER_FRAME` (2) enforced, square retention at `view distance + RETENTION_MARGIN_REGIONS`, meshes handed back on unload and `chunk.modified` retained for re-application (TD-031); `World.put` now marks all eight neighbours dirty and `World.values()` exposes residents (TD-030)
- [X] T037 Make `tests/mesher.test.ts` pass - **closed:** all 10 tests green; full suite 47 passed across 5 files, golden hash unchanged at `1460204569`
- [X] T038 Close source phase 5: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 5` status line to `docs/IMPLEMENTATION_STATUS.md` - **closed:** gate typecheck PASS / tests PASS (47 passed) / build PASS; TD-023 through TD-031 recorded; `PHASE 5` status line appended

**Checkpoint**: Foundation complete — generation, meshing and the fixed tick are in place and every suite written so far is green. User story implementation can now begin.

---

## Phase 3: Source phase 6 — Input, player, physics, collision — **[US1]**

**Goal**: A player who can enter a world and move through it without passing through terrain.

**Independent Test**: `tests/collision.test.ts` passes on floor, wall, corner-slide and jump-apex fixtures; pressing forward moves in the camera's facing direction and stops at solid terrain.

- [ ] T039 [P] [US1] Write `tests/collision.test.ts` **FIRST** and confirm it fails: falling onto a flat floor stops at `y=floor`; walking into a wall stops; corner slide; jump apex **exactly equal** to the value the Documented Values *Jump integration* scheme yields — semi-implicit (symplectic) Euler, velocity updated from gravity first then position from the updated velocity, exactly once per tick, at gravity 32 b/s² and jump velocity 10 b/s — **asserted with no tolerance, and the expected value must be derived from that documented scheme rather than read back from the implementation under test** (source §13 test 9; Constitution test area *collision*; US1 Acceptance 3 as amended 2026-10-05)
- [ ] T040 [P] [US1] Create `src/input/Bindings.ts`: remappable binding map seeded from the documented defaults table (FR-037, `contracts/input-bindings.md`)
- [ ] T041 [P] [US1] Create `src/input/InputManager.ts`: key/mouse state, pointer-lock request, and `pointerlockchange` + `visibilitychange` routed into **one** pause path (FR-009, research R7)
- [ ] T042 [P] [US1] Create `src/player/Player.ts`: position, yaw/pitch, health initialised to max 10, eye height (`data-model.md` §2, FR-042)
- [ ] T043 [US1] Create `src/player/Collision.ts`: axis-separated AABB resolution in order **Y → X → Z**, step-up of 1 block so small ledges need no jump (FR-007)
- [ ] T044 [US1] Create `src/player/Physics.ts`: gravity and jump integrated by **semi-implicit (symplectic) Euler** — velocity updated from gravity first, then position from the updated velocity, exactly once per 0.05 s tick, with gravity 32 b/s² and jump velocity 10 b/s read from `src/core/GameConfig.ts` and never re-hardcoded — plus swim at **40%** of normal speed without being blocked by water (FR-006, FR-008, `spec.md` Documented Values *Jump integration*)
- [ ] T045 [US1] Wire the single pause path in `src/core/GameState.ts`: pointer refused, pointer lost and surface hidden each pause, show the overlay and stop the simulation; resume only on explicit player action (FR-009)
- [ ] T046 [US1] Make `tests/collision.test.ts` pass
- [ ] T047 [US1] Close source phase 6: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 6` status line to `docs/IMPLEMENTATION_STATUS.md`

**Checkpoint**: US1 movement slice testable — player walks, jumps, slides and collides deterministically.

---

## Phase 4: Source phase 7 — Raycast, break, place — **[US2]**

**Goal**: The defining sandbox interaction — target, break and place blocks.

**Independent Test**: `tests/raycast.test.ts` and `tests/block-place.test.ts` pass; break five blocks in a wall and place five to seal the hole; break or place a block **on a region boundary** and observe the neighbouring region repaint **within one frame refresh** (`spec.md` SC-011, render-layer half).

- [ ] T048 [P] [US2] Write `tests/raycast.test.ts` **FIRST** and confirm it fails: expected block and face normal for 6 axis-aligned and 3 diagonal fixtures (source §13 test 10; Constitution test area *raycast*)
- [ ] T049 [P] [US2] Write `tests/block-place.test.ts` **FIRST** and confirm it fails: place/remove including neighbour-dirty marking at local `x = 0` and `x = 15` (**SC-011**, data-layer half — assert the border block's own region *and* the adjacent region are both invalidated) (source §13 test 5; Constitution test area *block place/remove*)
- [ ] T050 [P] [US2] Create `src/player/Raycast.ts`: voxel DDA (Amanatides–Woo) cast from the player's eye, limited to reach **5.0** blocks (`spec.md` Documented Values, FR-010)
- [ ] T051 [US2] Target outline in `src/rendering/Renderer.ts`: highlight only the block under the crosshair within reach and no other, with a cue that survives greyscale (FR-010, FR-041)
- [ ] T052 [US2] Hold-to-break in `src/world/World.ts` driven by `src/input/InputManager.ts`: progress proportional to elapsed time against the block's break duration, **reset to zero when the target changes**, discarded on early release (FR-011)
- [ ] T053 [US2] Place the selected block on the aimed face in `src/world/World.ts`: destination must be empty or water, must not overlap the player's body, and must be refused silently otherwise (FR-012, `spec.md` Edge Cases)
- [ ] T054 [US2] Drop routing in `src/inventory/Inventory.ts`: a broken block's drop enters the inventory; a drop with a full or empty inventory is discarded, never duplicated (FR-013, `spec.md` Edge Cases)
- [ ] T055 [US2] Make `tests/raycast.test.ts` and `tests/block-place.test.ts` pass
- [ ] T056 [US2] Close source phase 7: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 7` status line to `docs/IMPLEMENTATION_STATUS.md`

**Checkpoint**: US2 independently testable — the landscape can be deliberately altered.

---

## Phase 5: Source phase 8 — Inventory, hotbar, items — **[US2, US3]**

**Goal**: A fixed-size inventory with stacking, splitting, merging and hotbar selection.

**Independent Test**: `tests/inventory.test.ts` passes stacking-to-64, overflow, removal, move and persistence round trip.

- [ ] T057 [P] [US3] Write `tests/inventory.test.ts` **FIRST** and confirm it fails: stacking to 64, overflow into the next slot, removal, move, and persistence round trip (source §13 test 6; Constitution test area *inventory*)
- [ ] T058 [P] [US3] Create `src/inventory/Items.ts`: item ids 100+ alongside block ids 1–13, tool tiers and durability (FR-020, `data-model.md` §5)
- [ ] T059 [P] [US3] Add procedural item icons to `src/rendering/TextureAtlas.ts` — no pre-made artwork (FR-020, gate G9)
- [ ] T060 [US3] Create `src/inventory/Inventory.ts`: 36 fixed slots, `MAX_STACK` 64, a merge over 64 fills the slot then spills the remainder to the next free slot, consumption in ascending slot order (FR-015, `data-model.md` §3)
- [ ] T061 [US3] Create `src/inventory/Hotbar.ts`: 9-slot subset selected by number key and by scroll wheel (FR-016)
- [ ] T062 [US3] Make `tests/inventory.test.ts` pass
- [ ] T063 [US3] Close source phase 8: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 8` status line to `docs/IMPLEMENTATION_STATUS.md`

---

## Phase 6: Source phase 9 — Crafting, tools — **[US3]**

**Goal**: A complete gather → craft → use loop where a crafted pickaxe mines stone far faster than bare hands.

**Independent Test**: `tests/recipes.test.ts` and `tests/tools.test.ts` pass; from a fresh world collect wood, craft planks, sticks and a wooden pickaxe, then mine stone.

- [ ] T064 [P] [US3] Write `tests/recipes.test.ts` **FIRST** and confirm it fails: each recipe validates; crafting consumes and produces exact documented counts; insufficient ingredients rejected with the inventory byte-identical to before (source §13 test 7; Constitution test area *recipes*)
- [ ] T065 [P] [US3] Write `tests/tools.test.ts` **FIRST** and confirm it fails: break time for every (tool, block) pair in a table, plus tier-gate drop behaviour (source §13 test 8; Constitution test area *tool rules*)
- [ ] T066 [P] [US3] Create `src/crafting/RecipeRegistry.ts`: 10 shapeless recipes keyed by unique stable strings, with a self-check that no two recipes share an ingredient multiset — **wooden pickaxe = 2 planks**, not the source's literal 3 (FR-017, research R15, `contracts/registries.md`)
- [ ] T067 [US3] Affordability display in `src/ui/InventoryScreen.ts`: unaffordable recipes visibly unavailable, affordable ones lit (**FR-017**, `spec.md` US3 Acceptance 2)
- [ ] T068 [US3] Enforce `minTier` on break in `src/world/World.ts`: equipped tier below the block's minimum ⇒ **no drop**; at or above ⇒ exactly the drop FR-013 declares (FR-018)
- [ ] T069 [US3] Tool durability in `src/inventory/Inventory.ts`: decrement by one per block broken, consume at zero — the break that depletes it still yields its drop, and only then is the tool removed (FR-019, `spec.md` Edge Cases)
- [ ] T070 [US3] Make `tests/recipes.test.ts` and `tests/tools.test.ts` pass
- [ ] T071 [US3] Close source phase 9: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 9` status line to `docs/IMPLEMENTATION_STATUS.md`

**Checkpoint**: US3 independently testable — a full progression loop with no other system required.

---

## Phase 7: Source phase 10 — Day/night, water, vegetation polish — **[US6]**

**Goal**: A world that visibly changes over time, with working water.

**Independent Test**: Sit still for one full day-length and observe the keyframes in order; wade into a lake and confirm 40% movement speed.

- [ ] T072 [P] [US6] Create `src/rendering/Sky.ts`: repeat through the documented keyframes **sunrise → noon → sunset → midnight**, linear interpolation between adjacent keyframes, `timeOfDay` derived **solely from the tick counter** and never from wall-clock time (FR-027, gate G1)
- [ ] T073 [P] [US6] Add sun and moon meshes in `src/rendering/Sky.ts`, with the moon visible while the sun is below the horizon (FR-027)
- [ ] T074 [US6] Water rendering in `src/rendering/ChunkMesher.ts`: translucent pass with shared-face culling so water does not render its own interior (FR-003, `spec.md` US6 Acceptance 3)
- [ ] T075 [P] [US6] Create `src/audio/AudioSynth.ts`: the closed six-effect set plus the one ambient music loop of FR-036 synthesised through WebAudio — no sample files — each effect firing only on its named event and routed as separate effects and music channels scaled by master volume (FR-034, FR-036, research R13, gate G9)
- [ ] T076 [US6] Close source phase 10: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 10` status line to `docs/IMPLEMENTATION_STATUS.md`

---

## Phase 8: Source phase 11 — Entities — **[US6]**

**Goal**: A neutral creature that is seeded, bounded and never persisted.

**Independent Test**: Watch a forest creature for one minute — it idles, wanders and refuses to step off a drop greater than one block.

- [ ] T077 [P] [US6] Create `src/entities/spawnRules.ts`: in forest regions only, `count = hash32(seed, cx, cz, ENTITY_SPAWN) % 3`, positions hashed from the same seed (FR-028, `data-model.md` §7)
- [ ] T078 [US6] Create `src/entities/ForestWanderer.ts`: `IDLE ⇄ WALK` state machine with `stateTimer` IDLE 2–4 s / WALK 1–3 s drawn from its own seeded stream; refuses any step down > 1 block (FR-028, `data-model.md` §7)
- [ ] T079 [US6] Create `src/entities/EntityManager.ts`: update in **ascending numeric id**, only regions inside the retained view distance are simulated, re-derived identically on region load and world reopen at the state implied by the current tick (FR-028, FR-029)
- [ ] T080 [US6] Close source phase 11: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 11` status line to `docs/IMPLEMENTATION_STATUS.md`

**Checkpoint**: US6 independently testable — lighting, water and a deterministic creature.

---

## Phase 9: Source phase 12 — Save/load — **[US5]**

**Goal**: Nothing is lost, and every failed write is reported as a failure.

**Independent Test**: `tests/save-load.test.ts` passes; play, save, quit, reload and diff the restored state against the saved state.

- [ ] T081 [P] [US5] Write `tests/save-load.test.ts` **FIRST** and confirm it fails: serialize → deserialize equals input; corrupted or invalid JSON handled **without throwing** (source §13 test 11; Constitution test area *save/load*; SC-007)
- [ ] T082 [P] [US5] Create `src/persistence/Integrity.ts`: validate every field for type and range, check `SAVE_SCHEMA_VERSION`, and route any violation to the non-fatal corruption path (FR-024, `data-model.md` §9)
- [ ] T083 [P] [US5] Create `src/persistence/SettingsService.ts`: `localStorage` key `voxelrealms.settings.v1`, stored separately so deleting a world never discards settings (FR-025, `contracts/settings-schema.md`)
- [ ] T084 [US5] Create `src/persistence/SaveService.ts`: IndexedDB database `voxel-realms`, store `worlds`, key = world name; write in the **fixed canonical key order** with integers wherever the value permits and an explicit `version` (FR-021, FR-026, gate G7, `contracts/save-schema.md`)
- [ ] T085 [US5] Enforce restore order in `src/persistence/SaveService.ts`: set `tick` **first**, then materialise creatures from `seed` + `tick`; creature state is never written to the record (FR-021, FR-028, `data-model.md` §7/§9)
- [ ] T086 [US5] Auto-save triggers in `src/persistence/SaveService.ts`: every **60 s of game time**, on **every** pause (FR-009 and the inventory pause of FR-032), and on `visibilitychange → hidden`; await the write, with `pagehide` as a best-effort second chance (FR-022, research R16)
- [ ] T087 [US5] Failure honesty in `src/persistence/SaveService.ts`: a write whose promise rejected or aborted is **never** reported as success; show a visible notice that persists until a later save succeeds, including when the failure happens in a background auto-save (FR-022, SC-013, research R10, `spec.md` Edge Cases)
- [ ] T088 [US5] Serialise concurrent save requests in `src/persistence/SaveService.ts` so no partial record is ever written; loading while a save of the same name is in progress waits for it; rapid save/load cycles create no duplicate records (FR-022, `spec.md` Edge Cases)
- [ ] T089 [US5] Acquire Web Lock `voxel-realms:<name>` in `src/persistence/SaveService.ts` on open and refuse a second session's open with a clear message until it closes (FR-023, research R11)
- [ ] T090 [US5] Close source phase 12: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 12` status line to `docs/IMPLEMENTATION_STATUS.md`

**Checkpoint**: US5's storage core is complete and proven; the screens that drive it follow in source phase 13.

---

## Phase 10: Source phase 13 — UI, menus, settings, HUD — **[US1, US3, US5, US7]**

**Goal**: The player-facing interface. **This is where US1 becomes a playable MVP**, because FR-030 main menu and FR-031 HUD live here in the constitution's phase order.

**Independent Test**: Launch → New World → move for two minutes with the HUD and first-run hint visible.

- [ ] T091 [P] [US1] Create `src/ui/MainMenu.ts` offering **New World, Load World, Settings, Controls**; with no saved worlds, Load World shows an empty state explaining none exist rather than an error (FR-030, `spec.md` Edge Cases)
- [ ] T092 [P] [US1] Create `src/ui/Hud.ts`: crosshair, hotbar with slot selection, health, current coordinates and break progress (FR-031)
- [ ] T093 [US1] New World form in `src/ui/MainMenu.ts`: name **1–32 printable characters after trimming**, blank rejected with a prompt and no world created; a name matching an existing world only by case or surrounding space requires explicit overwrite confirmation; blank seed → documented default seed, malformed or out-of-range seed rejected at entry (FR-001, `spec.md` Edge Cases)
- [ ] T094 [US1] Spawn placement in `src/player/Player.ts`: `(0, surfaceHeight(0,0) + 2, 0)` scanning outward in the **fixed spiral order** until a non-water surface is found, so spawn is deterministic (`data-model.md` §2, US1 Acceptance 1)
- [ ] T095 [US1] Create `src/ui/FirstRunHint.ts`: on a player's first run only, show a hint beside the crosshair naming the break and place controls; dismiss after the player has **both broken and placed** a block; clear the persisted first-run flag so it never appears again (FR-043, `quickstart.md` §8)
- [ ] T096 [US1] Health initialised to maximum in `src/player/Player.ts` on world creation and not modified by any action in this version (FR-042)
- [ ] T097 [US3] Create `src/ui/InventoryScreen.ts`: drag-and-drop slots, stack counts, procedural item icons, and an adjacent crafting panel (FR-032)
- [ ] T098 [US3] Opening `src/ui/InventoryScreen.ts` releases pointer capture ⇒ state becomes `paused` **and triggers a save**; closing it is the player action that resumes play (`contracts/input-bindings.md`, FR-032 + FR-022)
- [ ] T099 [US5] Create `src/ui/PauseMenu.ts`: **Resume, Settings, Save, Main Menu**; there is deliberately no direct `playing → menu` path, so leaving a world always passes through `paused` and therefore always saves first (FR-033, FR-022, `data-model.md` §11)
- [ ] T100 [US5] Load World flow in `src/ui/MainMenu.ts`: list, load and delete by name; the name comparison folds case and trims surrounding space; deletion and overwrite each require a confirmation that says it is irreversible (FR-023, FR-001)
- [ ] T101 [US5] Corruption path in `src/persistence/Integrity.ts`: a truncated, wrong-version or out-of-range save shows a clear non-transactional message offering to delete it, and the game remains usable — never a crash or silent partial load (FR-024, SC-008)
- [ ] T102 [P] [US7] Create `src/ui/SettingsPanel.ts`: view distance 2-12, field of view, particles, mouse sensitivity, master/effects/music volume — all applied immediately, persisted across sessions, and clamped to the supported range (FR-034, `data-model.md` §10)
- [ ] T103 [P] [US7] Create `src/ui/ControlsPanel.ts`: remap **every** binding in the controls table, restore all defaults, persist remappings across sessions (FR-041, `contracts/input-bindings.md`)
- [ ] T104 [US7] Keyboard-only operation across `src/ui/*.ts` (beginning with `src/ui/MainMenu.ts`): every screen operable from the keyboard with a visible focus indicator on the selected control; target outline and health distinguishable **without relying on colour alone** (FR-041, US7 Acceptance 5)
- [ ] T105 [US1] Close source phase 13: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 13` status line to `docs/IMPLEMENTATION_STATUS.md`

**Checkpoint**: **US1 is now an independent, playable MVP** — enter a world, move, look around, break, place, with the first-run hint.

---

## Phase 11: Source phase 14 — Optimisation, debug overlay — **[US7]**

**Goal**: Diagnosability and the performance envelope.

**Independent Test**: Change every setting and restart; press the debug key and confirm every listed value is present and changes during play.

- [ ] T106 [P] [US7] Create `src/ui/DebugOverlay.ts` reporting frame rate, draw calls, triangle count, player and region coordinates, seed, loaded and visible region counts, selected block, velocity and an available memory estimate (FR-035, US7 Acceptance 2)
- [ ] T107 [US7] Point the pointer-lock refusal path in `src/input/InputManager.ts` at a message naming the refusal plus an affordance to retry, leaving the game paused — never running without pointer capture (FR-037, `contracts/input-bindings.md`)
- [ ] T108 [US7] Enforce FR-039 budgets end to end in `src/world/ChunkManager.ts`: ≤ 2 region generations per tick, ≤ 2 region meshes per frame, retain no more than view distance + margin, and release rendering resources for regions leaving the view distance (FR-039, research R12)
- [ ] T109 [US7] Measure SC-003 and record the sample in `specs/001-voxel-realms-game/quickstart.md` §5: a 5-minute continuous sprint across freshly-revealed terrain at default settings, ≥ 30 fps for ≥ 95% of the session sampled once per second from `src/ui/DebugOverlay.ts`, with no visible freeze longer than 250 ms
- [ ] T110 [US7] Close source phase 14: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 14` status line to `docs/IMPLEMENTATION_STATUS.md`

---

## Phase 12: Source phase 15 — Tests, bug fixing — **[US4]**

**Goal**: Prove determinism and reach 12 green suites.

**Independent Test**: `npm test` reports `12 suites | all passing | 0 failing | no real timers used`.

- [ ] T111 [P] [US4] Write `tests/determinism.test.ts` **FIRST** and confirm it fails: ordering stability across shuffled input — regions sorted by `(distance², cx, cz)`, creatures by ascending id, registries by ascending id, inventory consumption by ascending slot index (FR-029, `data-model.md` §12)
- [ ] T112 [US4] Verify in `tests/coordinate.test.ts` and `tests/golden-hash.test.ts` that regeneration after a restart is **byte-level identical** for the same seed, and that seed A differs from seed B (US4 Acceptances 1–2, SC-002)
- [ ] T113 [US4] Verify in `tests/chunk-purity.test.ts` that features straddling a region boundary — trees rooted just outside the region being built — agree exactly regardless of the order regions were produced in (US4 Acceptance 3, `spec.md` Edge Cases)
- [ ] T114 [US4] Verify in `tests/determinism.test.ts` that the simulation is independent of render order, loading order and machine performance: the same inputs and tick number yield the same history (FR-029)
- [ ] T115 [US4] Diagnose every failing suite by reading the full error and fixing the root cause in the owning module — never suppress a symptom; record the fixes in `docs/IMPLEMENTATION_STATUS.md` (Constitution: Development Workflow)
- [ ] T116 [US4] Confirm the required outcome in `quickstart.md` §7 exactly: `12 suites | all passing | 0 failing | no real timers used`, covering coordinate conversion, seed determinism, golden hash, cross-chunk trees, block place/remove, inventory, recipes, tool rules, collision, raycast, save/load and mesher
- [ ] T117 [US4] Close source phase 15: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append the `PHASE 15` status line to `docs/IMPLEMENTATION_STATUS.md`

**Checkpoint**: **US4 independently verified** — seeds are shareable and trustworthy.

---

## Phase 13: Source phase 16 — Final polish & cross-cutting concerns

**Purpose**: Verification, documentation and evidence. No new behaviour. Story-specific verification tasks keep their `[USn]` label; the rest are cross-cutting and carry none.

- [ ] T118 [P] Finalise `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, `docs/CONTROLS.md`, `docs/TECHNICAL_DECISIONS.md` and `docs/IMPLEMENTATION_STATUS.md` to describe the code as actually shipped
- [ ] T119 [P] Finalise `README.md`: prerequisites, the five commands, and a pointer to `specs/001-voxel-realms-game/quickstart.md`
- [ ] T120 [P] Original-asset content review recorded in `specs/001-voxel-realms-game/quickstart.md` §9: confirm zero copyrighted or third-party game assets, names, textures, sounds, interface or code; all textures, audio and icons are generated at runtime (FR-038, SC-012)
- [ ] T121 [US7] Accessibility re-verification recorded in `specs/001-voxel-realms-game/quickstart.md` §5: every screen keyboard-operable with a visible focus indicator; target outline and health readable in greyscale (FR-041, US7 Acceptance 5)
- [ ] T122 Run the `quickstart.md` §4 end-to-end walkthrough against `npm run preview` — enter world, move, break, place, craft, save, reload, load — and paste the browser console output into `quickstart.md` §4 as evidence (FR-040, SC-010)
- [ ] T123 Measure SC-001 (< 30 s launch-to-world) and SC-014 (< 10 s load-to-playable) with a stopwatch on the reference machine and record the actual values in `quickstart.md` §5
- [ ] T124 Measure SC-004 (< 5 s target-to-collected with an appropriate tool) and SC-006 (< 60 s ingredients-to-pickaxe) and record the actual values in `quickstart.md` §5
- [ ] T125 Verify SC-013 by deliberately forcing a failed save (quota exceeded or permission denied) in `src/persistence/SaveService.ts`, confirming no failed write is ever reported or left on screen as successful and the notice clears within one successful save; record in `quickstart.md` §5
- [ ] T126 [US5] Verify FR-022's hidden-page save path in `src/persistence/SaveService.ts`: switch tab, minimise, then close the page mid-play; confirm reopening restores the world as it stood, and that a save still in flight is awaited rather than read half-written (`quickstart.md` §8, research R16)
- [ ] T127 [US5] Verify creature reconstruction after reload in `src/entities/EntityManager.ts`: `tick` restored before materialisation, so no creature is missing or duplicated (`quickstart.md` §8)
- [ ] T128 [US5] Verify the concurrent-open guard in `src/persistence/SaveService.ts`: opening the same world in a second session is refused until the first closes (FR-023, research R11, `quickstart.md` §8)
- [ ] T129 Run the `quickstart.md` §6 constitution-critical checks, including the stray-tunable review gate confirming no numeric literal outside `src/core/GameConfig.ts` (gates G3/G5)
- [ ] T130 Fill the `quickstart.md` §5 success-criteria matrix for SC-001…SC-014 with `PASS`, `FAIL` or `UNVERIFIED` — **PASS only where the command was actually executed and observed** (Constitution G11). Before recording, **run SC-009 in full**: change every setting in `src/ui/SettingsPanel.ts`, restart the game, and confirm each value persisted — no other task performs this check
- [ ] T131 Attempt SC-005 and record the outcome in `quickstart.md` §5: observe at least 10 attempts across at least 5 first-time players for "enter a world, break a block, place a block" within 2 minutes without consulting documentation; record `UNVERIFIED` if no study can be run (FR-043 exists to make this achievable)
- [ ] T132 Final gate: run `npm run typecheck && npm test && npm run build`, record any open choice in `docs/TECHNICAL_DECISIONS.md`, append `PHASE 16` to `docs/IMPLEMENTATION_STATUS.md`, and confirm no TODO, placeholder or pseudocode remains for a core feature (Constitution: Development Workflow)

---

## User Story Coverage

Tasks are **grouped by source phase**, so each story's work is deliberately spread across
phases. This table is the traceability index: story → FRs → tasks → independent test.

| Story | Priority | Functional Requirements | Tasks (non-contiguous) | Independent test |
|---|---|---|---|---|
| **US1** — Enter and explore a new world | P1 | FR-001, 002, 003, 004, 005, 006, 007, 030, 031, 039, 042, 043 | T008, T013–T016, T021, T039–T047, T091–T096, T105, T108 | Launch, create a world with a seed, travel in one direction for 2 minutes |
| **US2** — Reshape the terrain | P2 | FR-010, 011, 012, 013, 014, 016, 020 | T048–T056, T059 | Break 5 blocks in a wall, place 5 to seal the hole |
| **US3** — Gather, store and craft | P3 | FR-015, 017, 018, 019, 032 | T057–T063, T064–T071, T097, T098 | Fresh world → collect wood → craft planks, sticks, wooden pickaxe → mine stone |
| **US4** — Reproduce a world from its seed | P4 | FR-005, 029 (verification) | T024, T025, T030, T031, T111–T117 | Generate the same seed twice in separate sessions, compare a world-data snapshot |
| **US5** — Save, resume and manage worlds | P5 | FR-021, 022, 023, 024, 025, 026, 033 | T081–T090, T099–T101, T126–T128 | Play → save → quit → reload → diff restored state against saved state |
| **US6** — Live in a world that changes over time | P6 | FR-008, 027, 028, 036 | T044, T072–T080 | One full day-length of keyframes; watch a forest creature for one minute |
| **US7** — Tune, monitor and learn the game | P7 | FR-009, 034, 035, 037, 041 | T041, T045, T102–T110, T121 | Change every setting and restart; open the debug overlay and check every field |
| **Cross-cutting** | — | FR-038 (original assets), FR-040 (no errors on nominal path) | T120, T122, T130 | Content review + full-session walkthrough |

**Label vs. table**: a handful of tasks serve two stories — `T044` implements swim
(FR-008, US6's acceptance) inside US1's movement phase, `T041`/`T045` wire the pause path
(FR-009, US7's acceptance) inside US1's phase, `T059` draws item icons (FR-020, US2's
acceptance) inside US3's phase. The **label records the story whose phase the task sits
in**; the **table records every story the task serves**. Where they differ, both are correct.

**Note on US1**: FR-030 (main menu) and FR-031 (HUD) sit in source phase 13, so under
constitution ordering **US1's player-facing MVP completes at the end of Phase 10**.
Everything US1 needs before that — generation, meshing, movement, physics, collision —
is finished and independently proven by Phase 3; automated suites run green from Phase 2
onward. Only the entry UI lands late.

### Independent test criteria per story

| Story | Criteria |
|---|---|
| US1 | Self-contained once Phases 1, 2, 3 and 10 are done; no other story required |
| US2 | Self-contained once Phases 1–5 are done; US3 not required (drops land in an inventory that already exists) |
| US3 | Depends on US2's break loop for gathering; crafting itself needs only Phases 5–6 + 10 |
| US4 | Verification only — needs Phases 1–2 complete; no new gameplay |
| US5 | Needs the storage core (Phase 9) + its screens (Phase 10); earlier stories only affect *what* gets saved |
| US6 | Needs Phases 1–3 (loop, world, player) + 7–8; independent of US2/US3/US5 |
| US7 | Needs Phases 1–3 + 10–11; settings and overlay are independent of US2–US6 |

---

## Edge Case Traceability

Every bullet in `spec.md` §3 (Non-Functional Requirements → *Edge Cases*) maps to
at least one owning task. Eight tasks already cite the bullets inline; the table
below closes the remaining gaps and gives an audit trail for all 26.

| # | Edge case (`spec.md`) | Owning task(s) |
|---|---|---|
| 1 | Seed left blank → default used silently | T093 |
| 2 | Seed out of range / malformed → rejected at entry | T093 |
| 3 | World name blank, >32 chars, or trimmed to nothing → rejected | T093 |
| 4 | Name differing only by case/space → overwrite confirmation | T093, T100 |
| 5 | Place against the last block within reach → refused | T053 |
| 6 | Place into water or an occupied cell → water replaced, occupied refused | T053 |
| 7 | Break the block beneath the player → falls and lands; bottom layer solid | T044 |
| 8 | Inventory completely full → drop discarded, not duplicated | T054 |
| 9 | Craft with a partially consumable inventory → fixed slot order | T060, T064 |
| 10 | Save corrupt / truncated / wrong version / out of range → never throws | T082, T101 |
| 11 | Rapid save/load cycles → no duplicate world records | T088 |
| 12 | World opened in a second session → refused with clear message | T089 |
| 13 | Save write fails → reported as failed, persistent notice, play continues | T087 |
| 14 | Regions requested faster than produced → bounded per tick/frame | T036 |
| 15 | Feature straddling a region boundary → identical regardless of order | T113 |
| 16 | Pointer lock denied, or focus lost mid-play → auto-pause + resume prompt | T045 |
| 17 | Exceeding the supported render-distance range → clamped | T102 |
| 18 | Load while a save of the same name is in progress → waits | T088 |
| 19 | Automatic and manual save at the same moment → serialised, no partial record | T088 |
| 20 | First run — no worlds, no changed settings → defaults + empty state | T091 |
| 21 | Automatic save fails in the background → persistent notice | T087 |
| 22 | Tab switch / minimise / close mid-play → save on hidden, awaited by next load | T086 |
| 23 | Place at the world's vertical limits → above top refused, bottom solid | T053 |
| 24 | Tool durability reaches zero on the depleting break → break completes, then tool removed | T069 |
| 25 | Drop with an empty inventory → discarded, play continues | T054 |
| 26 | Light crossing a region boundary → neighbour recomputed, identical regardless of build order | T033, T035 |

Rows 9, 11, 15, 20, 21, 24 and 25 duplicate citations already present in the
task text; rows 1–8, 10, 12–14, 16–19, 22 and 23 are the additions that close
finding **U2**. Row 26 was added by the 2026-10-05 clarification that introduced
FR-044.

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Foundational)**: depends on Phase 1 — **blocks all user stories**
- **Phases 3–13**: must run in this exact order — Constitution Principle V, source §12, `plan.md` gate G8

### The sixteen source phases → tasks.md sections

| Source §12 phase | Appears in | Primary story |
|---|---|---|
| 1 Audit + setup + build verification | Phase 1 | — |
| 2 Renderer, camera, lighting, game loop | Phase 2a | US1 |
| 3 Block registry, chunk data, coordinate math | Phase 2b | US1, US4 |
| 4 Noise, biomes, terrain/caves/ores/trees | Phase 2c | US1, US4 |
| 5 Meshing, streaming | Phase 2d | US1 |
| 6 Input, player, physics, collision | Phase 3 | US1 |
| 7 Raycast, break, place | Phase 4 | US2 |
| 8 Inventory, hotbar, items | Phase 5 | US3 |
| 9 Crafting, tools | Phase 6 | US3 |
| 10 Day/night, water, vegetation polish | Phase 7 | US6 |
| 11 Entities | Phase 8 | US6 |
| 12 Save/load | Phase 9 | US5 |
| 13 UI, menus, settings, HUD | Phase 10 | US1, US3, US5, US7 |
| 14 Optimisation, debug overlay | Phase 11 | US7 |
| 15 Tests, bug fixing | Phase 12 | US4 |
| 16 Final polish, docs | Phase 13 | Cross-cutting |

### User story dependencies

- **US1 (P1)**: starts after Phase 2; completes at end of Phase 10 (menu + HUD)
- **US2 (P2)**: starts after Phase 3; independent of US3–US7
- **US3 (P3)**: uses US2's break loop for gathering; its own logic depends only on Phases 5–6
- **US4 (P4)**: verification over Phase 2 output; runnable from Phase 2 onward
- **US5 (P5)**: storage core at Phase 9, screens at Phase 10; independent of US6/US7
- **US6 (P6)**: independent of US2, US3, US5 — needs only Phases 1–3 + 7–8
- **US7 (P7)**: independent of US2–US6 — needs Phases 1–3 + 10–11

### Within each phase

- Test task **written and confirmed failing** → implementation → test green
- Registry/data before the service that reads it; service before the UI that drives it
- Append the status line to `docs/IMPLEMENTATION_STATUS.md` only after
  `npm run typecheck && npm test && npm run build` all pass in that order

---

## Parallel Execution Examples

```bash
# Phase 1 — T003…T010 are different files with no cross-dependencies:
Task: "T003 tsconfig.json"
Task: "T004 package.json scripts"
Task: "T005 index.html + vite.config.ts + src/ skeleton"
Task: "T006 docs/ set"
Task: "T007 docs/IMPLEMENTATION_STATUS.md"
Task: "T009 src/utils/Mathx.ts"
Task: "T010 src/core/Logger.ts"

# Phase 2c — both test files can be authored together (test-first):
Task: "T024 tests/chunk-purity.test.ts"
Task: "T025 tests/golden-hash.test.ts"

# Phase 4 — the two interaction suites:
Task: "T048 tests/raycast.test.ts"
Task: "T049 tests/block-place.test.ts"

# Phase 6 — the two progression suites:
Task: "T064 tests/recipes.test.ts"
Task: "T065 tests/tools.test.ts"

# Phase 10 — independent UI panels:
Task: "T091 src/ui/MainMenu.ts"
Task: "T092 src/ui/Hud.ts"
Task: "T102 src/ui/SettingsPanel.ts"
Task: "T103 src/ui/ControlsPanel.ts"
```

**Not parallelisable**: anything touching `src/core/GameConfig.ts`, `src/world/World.ts`,
`src/core/GameState.ts`, `src/rendering/TextureAtlas.ts` or `docs/IMPLEMENTATION_STATUS.md`
— those are shared files worked on by several tasks.

---

## Implementation Strategy

### Constitution-first ordering (chosen)

1. Phase 1: Setup → toolchain proven
2. Phase 2: Foundational → generator, mesher, fixed tick (blocks everything)
3. Phases 3 → 13 in **source §12 order** — no skipping, no reordering
4. Stop at any checkpoint and validate the stories completed so far

### Delivery checkpoints

| After | Delivered | Validate with |
|---|---|---|
| Phase 2 | Pure, hash-pinned world generation | `coordinate`, `chunk-purity`, `golden-hash`, `mesher` suites |
| Phase 3 | Movement and collision | `collision` suite + manual walk |
| Phase 4 | Break/place | `raycast`, `block-place` suites |
| Phase 6 | Full gather-craft-use loop | `inventory`, `recipes`, `tools` suites |
| Phase 8 | Atmosphere and a seeded creature | one day-length observation + one minute of creature behaviour |
| Phase 9 | Persistence proven | `save-load` suite + SC-007/SC-013 checks |
| **Phase 10** | **MVP — US1 playable end to end** | `quickstart.md` §4 walkthrough, steps 1–4 |
| Phase 11 | Tuning and diagnostics | `quickstart.md` §5 SC-003/SC-009 rows |
| Phase 12 | US4 verified, 12 green suites | `npm test` → `12 suites, 0 failing` |
| Phase 13 (source phase 16) | All evidence recorded | `quickstart.md` §5 matrix, §9 log |

### Incremental delivery

1. Phases 1–2 — foundation ready, all early suites green
2. Phases 3–6 — core interaction loop complete and independently testable
3. Phases 7–8 — atmosphere and life (US6)
4. Phase 9 — persistence (US5)
5. **Phase 10 — MVP milestone (US1 complete)**
6. Phase 11 — tuning and diagnostics (US7)
7. Phase 12 — determinism proven (US4)
8. Phase 13 (source phase 16) — polished, documented, evidenced

### MVP scope

**User Story 1 alone** — "Enter and explore a new world" (P1): T008, T013–T016, T021,
T039–T047, T091–T096, closing at T105 (end of Phase 10). The intervening Phases 3–9 are
required by the constitution's fixed phase order, not by US1 itself; their outputs sit
idle but proven until US2–US6 light them up.

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks. Shared files
  (`GameConfig.ts`, `World.ts`, `GameState.ts`, `TextureAtlas.ts`,
  `IMPLEMENTATION_STATUS.md`) are never marked `[P]`.
- `[USn]` marks the story whose acceptance a task serves. Setup, Foundational and
  cross-cutting tasks carry none; story-specific verification tasks keep their label
  even inside a Foundational or Polish section (T031, T120–T131).
- **Standing rule (Constitution)**: at the close of *every* source phase, run
  `npm run typecheck`, then `npm test`, then `npm run build` — in that order. A
  failing step blocks advancement; diagnose the root cause by reading the full
  error, never by suppressing the symptom. Then record any choice the
  specification left open in `docs/TECHNICAL_DECISIONS.md` **before advancing**
  (Constitution, *Development Workflow* — record the choice, rationale and date
  before moving to the next phase), and only then append the status line to
  `docs/IMPLEMENTATION_STATUS.md`. The per-phase `Close source phase n` tasks make
  all three steps explicit rather than assumed.
- **No real timers in tests.** Drive the loop with synthetic `dt` and a tick counter.
- **No `Math.random()`, `Date.now()` or `performance.now()`** in world, gameplay-logic
  or test code — time enters only through `dt` and the tick counter.
- **PASS only when observed.** Anything not actually executed is `UNVERIFIED`.
- Commit after each task or logical group; stop at any checkpoint to validate.
- Avoid vague tasks, same-file conflicts, and cross-story dependencies that break
  independent testability.
