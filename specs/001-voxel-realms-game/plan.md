# Implementation Plan: Voxel Realms

**Branch**: `001-voxel-realms-game` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-voxel-realms-game/spec.md`

## Summary

Build Voxel Realms: a deterministic, browser-playable first-person voxel sandbox
with procedurally generated biomes, break/place interaction, inventory and
crafting progression, a day-night cycle, one neutral creature, and named save
slots — all reproducible byte-for-byte from a seed.

**Technical approach**: a fixed-timestep simulation advancing at exactly 20
ticks/second with rendering interpolating between ticks; chunk generation as a
pure function of `(seed, cx, cz)` driven by one mulberry32 PRNG with per-consumer
derived streams; per-face-culled opaque and transparent meshes streamed under a
hard per-tick/per-frame budget; axis-separated AABB physics; IndexedDB
persistence written in a canonical key order with an explicit schema version; and
plain DOM/CSS interface with no UI framework. The single runtime dependency is
`three` for rendering. Verification is test-first with 12 deterministic suites,
including a committed golden hash that fails if generation drifts.

## Technical Context

**Language/Version**: TypeScript 5.5.4 with `strict`, `noUncheckedIndexedAccess`,
`noImplicitOverride`; target ES2022; toolchain on Node 20 LTS

**Primary Dependencies**: `three` 0.169.0 (+ `@types/three` 0.169.0) — the only
runtime dependency. Dev-only: `typescript` 5.5.4, `vite` 5.4.8, `vitest` 2.1.2,
`@types/three` 0.169.0. No React, no other runtime dependencies (Constitution IV)

**Storage**: IndexedDB database `voxel-realms`, store `worlds`, key = world name;
settings under `localStorage` key `voxelrealms.settings.v1`. Record shape and
transport are separated so records stay testable without a real IndexedDB —
resolved in [research.md](./research.md) R1

**Testing**: vitest 2.1.2 — 12 deterministic suites, no real timers — with
three-tier acceptance: automated commands, a manual `npm run preview` walkthrough,
and `UNVERIFIED` wherever an outcome cannot be observed — resolved in
[research.md](./research.md) R2

**Target Platform**: Current stable desktop browsers on Windows, macOS and Linux
— Chromium, Firefox and WebKit — minimum window 1280×720, mouse and keyboard
only — resolved in [research.md](./research.md) R3

**Project Type**: Single-page web application built by Vite into one `dist/`;
no backend, no network calls

**Performance Goals**: ≥30 fps for ≥95% of a 5-minute sprint session with no
freeze >250 ms (SC-003); 20 ticks/s fixed; ≤2 chunk generations per tick; ≤2
chunk meshes per frame

**Terminology bridge (region ≡ chunk)**: `spec.md` is normatively written in
**region** (the one contiguous 16 × 16 × 128 `Uint8Array` — 32 768 bytes, one
per `(cx, cz)` column, the unit that streams, generates, meshes and saves); this
plan and every source module name the same object a **chunk**. The two words are
interchangeable aliases for one thing, not two concepts, and every
spec-normative bound quoted in the plan — ≤2 generations per tick, ≤2 meshes per
frame, `CHUNK_SIZE_X/Z = 16` — is exactly the spec's region bound with a
different label. Where the two documents disagree on the *word*, `spec.md`'s
"region" wins for requirement wording and `plan.md`'s "chunk" wins for module,
file and class names (`ChunkManager`, `ChunkMesher`, `chunk-purity.test.ts`).

**Constraints**: Exact-pinned dependency versions with a committed lockfile and
no added runtime deps (Constitution IV); view distance 2–12, default 6; all
tunables in one configuration module (Constitution III); no `Math.random()`,
`Date.now()` or `performance.now()` in world, gameplay-logic or test code
(Constitution I)

**Scale/Scope**: 12 `src/` modules, 14 block ids (0–13), 10 item types,
10 recipes, 5 biomes, 1 creature kind, 16 implementation phases, 45 functional
requirements, 14 success criteria, 12 required test suites

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate (Constitution v1.0.0) | Status | Evidence |
|---|---|---|---|
| G1 | No `Math.random()` / `Date.now()` / `performance.now()` in world, gameplay-logic or test code; time enters only via `dt` and tick counter (Principle I) | PASS | Simulation reads a monotonic tick counter; tests drive synthetic `dt` |
| G2 | One PRNG (mulberry32); every consumer derives its own stream via `hash32`; shared mutable streams forbidden; salts a closed enum (Principle I) | PASS | Source §4 fixes the algorithm and the 10 salts |
| G3 | `generateChunk(seed, cx, cz)` is pure — reads no other chunk, module variable or ambient state (Principle I) | PASS | Purity is a Phase 1 contract in [contracts/world-generation.md](./contracts/world-generation.md) |
| G4 | 20 ticks/s (`TICK_DT` = 0.05); rendering interpolates; per-tick and per-frame work bounded; iteration order defined (Principle II) | PASS | Budgets in Technical Context; ordering rules in [data-model.md](./data-model.md) |
| G5 | Every tunable in one configuration module; no hard-coded numeric literals in gameplay code (Principle III) | PASS | Single `src/core/GameConfig.ts`; enforced by review gate in [quickstart.md](./quickstart.md) |
| G6 | Toolchain exact-pinned, lockfile committed, no extra runtime deps, fixed script names `dev`/`build`/`test`/`typecheck`/`preview` (Principle IV) | PASS | `package.json` pins all five to exact versions; no ranges |
| G7 | Serialization uses fixed key order, integers where possible, explicit schema version; every field validated on load (Principle V) | PASS | Canonical record defined in [contracts/save-schema.md](./contracts/save-schema.md) |
| G8 | Architecture, file names, directory layout and phase order do not vary between runs (Principle V) | PASS | Layout fixed under Project Structure; phase order fixed by source §12 |
| G9 | Original assets only — no third-party game names, textures, sounds, UI or code; all textures and audio generated at runtime (Technical Constraints) | PASS | FR-038 / SC-012; generation approach in [research.md](./research.md) |
| G10 | Test-first; the 12 required deterministic suites exist and pass with no real timers; `typecheck` → `test` → `build` run in order after every phase (Development Workflow) | PASS | Sequence encoded as the gate in [quickstart.md](./quickstart.md) |
| G11 | PASS recorded only when a command was actually executed and observed; otherwise UNVERIFIED (Development Workflow) | PASS | [quickstart.md](./quickstart.md) records the verification log format |

**Result: 11/11 gates PASS. No violations.** Complexity Tracking is therefore
left empty.

### Post-design re-check (after Phase 1)

The same 11 gates were re-evaluated against the Phase 0/Phase 1 artifacts rather
than against the plan alone. **Result: still 11/11 PASS — no new violations.**

| Gate | How Phase 1 strengthened the evidence |
|---|---|
| G1 | Trigonometry banned inside `generateChunk` and confined to sky/creature code — research **R4** closes the one place cross-engine float behaviour could have leaked into block data |
| G2 | Salt enum and `hash32` derivation are now an explicit numbered clause (D2/D3) in [contracts/world-generation.md](./contracts/world-generation.md) |
| G3 | Purity upgraded from intent to an **enforced import boundary** listing the only seven modules `generateChunk.ts` may import |
| G5 | A concrete review gate for stray tunables is now part of [quickstart.md](./quickstart.md) §6 rather than an aspiration |
| G7 | Canonical key order is enumerated field-by-field, with `modified` as an ordered array instead of a map so serialisation cannot reorder |
| G10 | Every one of the 12 required suites is mapped to the contract clause it proves |
| G11 | Evidence log format with `PASS\|FAIL\|UNVERIFIED` fixed in [quickstart.md](./quickstart.md) §9 |

**Two new risks surfaced and contained without violating any gate:**

1. **Cross-engine float determinism** (threatens G1 and SC-002) — contained by
   research R4's restriction of generation maths to exactly-specified operations.
2. **Source contradiction in wooden-tool recipes** (threatens G3-style integrity
   of the crafting contract, and would otherwise have forced a second, positional
   matching mode) — resolved in research **R15** as 2 planks for the pickaxe vs 3
   for the axe, preserving single-mode shapeless matching.

Because both were resolved inside the existing rules rather than by bending them,
Complexity Tracking remains empty.

### Post-clarify re-check (after `/speckit.clarify` session 2)

The spec grew from 41 to **43** FRs and 13 to **14** SCs during clarification.
All 11 gates were re-run against the amended spec: **still 11/11 PASS — no new
violations, Complexity Tracking still empty.**

| Gate | Effect of the clarifications |
|---|---|
| G1 — deterministic purity | **Strengthened.** FR-021 now excludes creatures from the save record, so nothing written to disk is simulation state that could drift; creatures rebuild purely from `seed` + `tick` |
| G3 — single source of configuration | New spec-owned constants (world height 128, region 16×16, sea level 40, tick rate 20/s, auto-save 60 s, generation/meshing bounds) must be mirrored **once** in `src/core/GameConfig.ts` and never re-hardcoded at their use sites |
| G5 — no wall-clock in gameplay code | Save-on-page-hidden (FR-022) is driven by a visibility **event**, not by a timestamp read, so no gameplay path needs `Date.now()` |
| G7 — canonical serialization | The record sheds one field (creatures); the fixed key order in [contracts/save-schema.md](./contracts/save-schema.md) was re-issued to match |
| G11 — PASS only when observed | Unaffected |

New deliverable **FR-043** (first-run hint) is UI-only and touches no gate.
Pausing when the inventory opens (FR-032) reduces, rather than increases, simulation
surface, since world input is only read while `playing`.

### Post-clarify re-check (after `/speckit.clarify` session 3)

The spec grew from 43 to **45** FRs — **FR-044** (block lighting) and **FR-045**
(particles) — and five decisions reshaped existing requirements (FR-032, FR-034,
FR-036 amended; shadows setting removed; view distance renamed consistently). All
11 gates were re-run against the amended spec: **still 11/11 PASS — no new
violations, Complexity Tracking still empty.**

| Gate | Effect of the session-3 clarifications |
|---|---|
| G1 — deterministic purity | **Strengthened.** Particles could have been the one place `Math.random()` slipped in; FR-045 forbids it and **R18** derives every particle from `hash32(eventKind, tick, index)`. Lighting is `max()`-monotone and order-independent (**R17**) |
| G3 / G5 — single configuration module | **New tunables to mirror once** into `src/core/GameConfig.ts`: gravity 32 b/s², jump velocity 10 b/s, sky light 15, torch light 14, light falloff 1/cell, FOV 60–110 (default 75), mouse sensitivity 0.0005–0.006 (default 0.002), volumes 0–1 (default 1). None may be re-hardcoded at its use site |
| G4 — bounded per-tick/per-frame work | Lighting runs only on regions already marked dirty by FR-014 (**R17**), so it adds no scheduling step; particles are a fixed 256-slot ring buffer (**R18**). The ≤2 meshes/frame bound is unchanged |
| G7 — canonical serialization | **Simpler, not larger.** Light and particles are both derived presentation state and are never written; the settings record sheds the `shadows` key ([contracts/settings-schema.md](./contracts/settings-schema.md)) |
| G9 — original assets only | **Strengthened.** The new ambient track is synthesised into a buffer at startup — no sample file ships, so FR-036 and SC-012 are satisfied by the same mechanism as the six effects (**R13**) |
| G10 — test-first, 12 suites | **Unchanged count.** FR-044's lighting assertions were added to the existing `mesher.test.ts` rather than opening a 13th suite, keeping the required suite count at 12 |
| G11 — PASS only when observed | New outcomes (cave darkness, torch falloff, particle gate) are observable in the `quickstart.md` §4 walkthrough and are recorded there |

Because every addition resolved inside the existing rules — and the one
temptation to add a rendering-side random source was closed by design rather than
tolerated — Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-voxel-realms-game/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── save-schema.md
│   ├── settings-schema.md
│   ├── world-generation.md
│   ├── registries.md
│   └── input-bindings.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
index.html

src/
├── core/
│   ├── GameConfig.ts        # Sole home for every tunable (Constitution III)
│   ├── GameLoop.ts          # Fixed 20 ticks/s accumulator; dt source of truth
│   ├── GameState.ts         # Mode: menu | playing | paused; paused holds pause-menu and inventory screens, mutually exclusive (FR-032)
│   └── Logger.ts            # Levelled logging; the only sanctioned diagnostic sink
├── rendering/
│   ├── Renderer.ts          # Scene, lights, render target, resize, 256-slot particle ring (FR-045)
│   ├── Camera.ts            # First-person camera; yaw/pitch only
│   ├── ChunkMesher.ts       # Per-face culling → opaque + transparent meshes, light baked per face (FR-044)
│   ├── TextureAtlas.ts      # 16×16 tiles of 16 px, generated at startup
│   └── Sky.ts               # Day-night keyframes, sun and moon
├── world/
│   ├── BlockRegistry.ts     # Fixed block IDs 0..13
│   ├── Chunk.ts             # { cx, cz, blocks, dirty, modified }
│   ├── ChunkManager.ts      # Streaming queue, budgets, unload + dispose
│   ├── generateChunk.ts     # PURE: (seed, cx, cz) → Uint8Array
│   ├── Noise.ts             # Simplex 2D/3D + fBm over a seeded permutation
│   ├── Biome.ts             # Fixed precedence rules
│   └── World.ts             # Read/write API; marks dirty across borders
├── player/
│   ├── Player.ts            # Position, yaw/pitch, health, eye height
│   ├── Physics.ts           # Gravity, jump, swim, step-up
│   ├── Collision.ts         # Axis-separated AABB resolution, order Y→X→Z
│   └── Raycast.ts           # Voxel DDA (Amanatides–Woo)
├── inventory/
│   ├── Inventory.ts         # 36 slots, stacking to 64, ordered consumption
│   ├── Hotbar.ts            # 9 slots; number-key and wheel selection
│   └── Items.ts             # Item IDs 100+, tool tiers, durability
├── crafting/
│   └── RecipeRegistry.ts    # Shapeless recipes, unique string keys
├── entities/
│   ├── EntityManager.ts     # Ascending-id update order
│   ├── ForestWanderer.ts    # IDLE ↔ WALK state machine
│   └── spawnRules.ts        # Seeded count and positions per region
├── ui/
│   ├── MainMenu.ts
│   ├── Hud.ts               # Crosshair, hotbar, health, coords, break bar
│   ├── InventoryScreen.ts   # Drag/drop + crafting panel
│   ├── FirstRunHint.ts      # First-run overlay; self-dismisses after break+place (FR-043)
│   ├── PauseMenu.ts
│   ├── SettingsPanel.ts
│   ├── ControlsPanel.ts     # Binding remap + restore defaults (FR-041)
│   └── DebugOverlay.ts      # F3 readouts (FR-035)
├── persistence/
│   ├── SaveService.ts       # IndexedDB worlds; canonical record; validation
│   ├── SettingsService.ts   # localStorage settings
│   └── Integrity.ts         # Field validation, schema version, corruption path
├── audio/
│   └── AudioSynth.ts        # WebAudio: closed six-effect set + looping ambient pad; no sample files (FR-036)
├── input/
│   ├── InputManager.ts      # Key/mouse state, pointer lock, visibility pause
│   └── Bindings.ts          # Remappable binding map with defaults
└── utils/
    ├── Prng.ts              # mulberry32
    ├── Hash.ts              # hash32 (FNV-1a over LE int32 bytes)
    └── Mathx.ts             # Floor-division and non-negative modulo

tests/
├── coordinate.test.ts       # 1  seed determinism            (req. test 2)
├── golden-hash.test.ts      # 3  committed golden hash
├── chunk-purity.test.ts     # 2  purity + cross-chunk trees  (req. tests 2, 4)
├── block-place.test.ts      # 5  place/remove + border dirty
├── inventory.test.ts        # 6  stacking, overflow, round trip
├── recipes.test.ts          # 7  craft consume/produce exactness
├── tools.test.ts            # 8  break-time table + tier gate
├── collision.test.ts        # 9  floor, wall, slide, jump apex
├── raycast.test.ts          # 10 axis and diagonal fixtures
├── save-load.test.ts        # 11 serialize/deserialize + corruption
├── mesher.test.ts           # 12 face counts and water culling
└── determinism.test.ts      # ordering stability across shuffled input

docs/
├── PROJECT_AUDIT.md
├── ARCHITECTURE.md
├── GAME_DESIGN.md
├── CONTROLS.md
├── TECHNICAL_DECISIONS.md
└── IMPLEMENTATION_STATUS.md
README.md
```

**Structure Decision**: A **single-project single-page web application** at the
repository root — `src/` split into the twelve domain modules named by source
§16, `tests/` beside it, and `docs/` for the seven required documents. No
backend, no `frontend/`/`backend/` split, no mobile target: the spec declares
single-player, offline, desktop-browser scope with zero network calls, so a
second deployable would be dead weight. Module boundaries follow the domain
(world / player / inventory / crafting / entities) rather than technical layers,
which keeps `generateChunk.ts` provably free of rendering and persistence
imports — the property Constitution Principle I depends on.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All 11 gates passed on first evaluation, so this table is
intentionally empty.
