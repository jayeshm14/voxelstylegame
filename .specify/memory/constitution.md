# Voxel Realms Constitution

## Core Principles

### I. Deterministic Purity (NON-NEGOTIABLE)

- `Math.random()`, `Date.now()` and `performance.now()` MUST NOT appear in world,
  gameplay-logic or test code. Time enters a system only through the game loop's
  `dt` and the monotonic tick counter.
- All randomness derives from exactly one algorithm, mulberry32. Every consumer
  MUST derive its own stream via `hash32(seed, a, b, c, salt)`; sharing a mutable
  global stream across consumers is forbidden.
- Salts are a closed enum and MUST NOT be reused for a second purpose.
- `generateChunk(seed, cx, cz)` MUST be a pure function of its arguments: it MUST
  NOT read another chunk, a module-level variable, or any ambient state.
- Rationale: same input must yield byte-identical output. Without this rule the
  golden-hash test, cross-chunk tree consistency and replay all become unstable.

### II. Fixed-Timestep Simulation & Defined Ordering

- Simulation advances at exactly 20 ticks per second (`TICK_DT` = 0.05 s).
  Physics, entities and day/night advance only in ticks; rendering interpolates
  between ticks and MUST NOT feed back into simulation state.
- Iteration order is always defined: chunks by distance-squared then x then z;
  entities by ascending numeric id; registries by ascending numeric id.
- Per-tick and per-frame work is bounded: at most `MAX_CHUNK_GENS_PER_TICK`
  generations per tick and `MAX_CHUNK_MESHES_PER_FRAME` meshes per frame, nearest
  dirty chunk first.
- Worker threads are optional; when used, results MUST be applied in queue order.
- Rationale: removes frame rate and thread scheduling as inputs to world state.

### III. Single Source of Configuration

- Every tunable value lives in `src/core/GameConfig.ts`. Hard-coded numeric
  literals in gameplay code are forbidden.
- World-defining constants - chunk dimensions, sea level, default seed, physics,
  reach, inventory sizes, `SAVE_SCHEMA_VERSION` - are declared there once and
  referenced by name everywhere else.
- Rationale: a value that can diverge between call sites cannot be reasoned
  about, tuned or tested as a single unit.

### IV. Reproducible, Pinned Toolchain

- The stack is fixed: Node 20 LTS, npm, TypeScript 5.5.4 with `strict`,
  `noUncheckedIndexedAccess` and `noImplicitOverride`, Vite 5.4.8,
  three 0.169.0 plus `@types/three` 0.169.0, and vitest 2.1.2.
- React MUST NOT be introduced. Runtime dependencies are limited to the above;
  dev dependencies are limited to `typescript`, `vite`, `vitest`, `@types/three`.
- Dependencies are pinned to exact versions with no caret or tilde ranges, and
  the lockfile MUST be committed.
- npm script names are fixed: `dev`, `build`, `test`, `typecheck`, `preview`.
- Rationale: a rebuild from a clean checkout must produce the same behaviour.

### V. Canonical Serialization & Stable Architecture

- Serialized records use a fixed key order, integers wherever a value permits,
  and a versioned schema. Every field is validated on load; corrupt or
  out-of-range data is rejected rather than coerced.
- Architecture, file names, directory layout and phase order MUST NOT vary
  between runs.
- Rationale: saves, golden hashes and review diffs all depend on byte-stable
  output and a stable shape.

## Technical Constraints

- Algorithms are fixed and MUST NOT be substituted: mulberry32 PRNG, FNV-1a
  `hash32` over little-endian int32 bytes, simplex noise built from a 256-entry
  Fisher-Yates permutation driven by `mulberry32(hash32(seed, SALT_NOISE))`, and
  fBm with lacunarity 2.0 and gain 0.5 returning values in -1..1.
- Coordinate math is exact: floor division for chunk indices and non-negative
  modulo for local indices. y is not chunked; out-of-range y reads as AIR and
  writes are rejected.
- Chunk generation runs a fixed per-column order: biome, height, layers, water,
  caves, ores, trees. A chunk MUST consider tree origins up to two columns
  outside its own bounds so borders agree regardless of load order.
- Meshing is per-face culling with a fixed vertex format (position, uv, light)
  and a 16x16 tile atlas of 16px tiles, split into one opaque and one
  transparent mesh per chunk.
- Original assets only: no Minecraft names, textures, sounds, UI or code. Every
  texture is generated procedurally from the PRNG at startup. This is a legal
  constraint, not a style preference.
- Directory layout is fixed: `src/` holding `core`, `rendering`, `world`,
  `player`, `inventory`, `crafting`, `entities`, `ui`, `persistence`, `audio`,
  `input`, `utils`, plus `index.html`, `tests/` and `docs/`.

## Development Workflow & Quality Gates

- The sixteen phases run in their stated order and MUST NOT be skipped or
  reordered. Each phase closes by appending a status line to
  `docs/IMPLEMENTATION_STATUS.md`.
- After every phase, run in order: `npm run typecheck`, then `npm test`, then
  `npm run build`. A failing step blocks advancement; the root cause MUST be
  diagnosed by reading the full error, not by suppressing the symptom.
- Test-first and deterministic: the twelve required test areas - coordinate
  conversion, seed determinism, golden hash, cross-chunk trees, block
  place/remove, inventory, recipes, tool rules, collision, raycast, save/load
  and mesher - MUST exist and pass. Tests MUST NOT use real timers.
- No placeholders, TODOs or pseudocode for core features. Every feature works
  end to end before it is called done.
- A result MAY be recorded as PASS only if the command was actually executed and
  observed. Anything that could not be run is recorded as UNVERIFIED, never as
  PASS.
- Existing correct code MUST be reused; working functionality MUST NOT be
  rewritten for stylistic reasons.
- The documentation set is fixed: `README.md`, `docs/PROJECT_AUDIT.md`,
  `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, `docs/CONTROLS.md`,
  `docs/TECHNICAL_DECISIONS.md` and `docs/IMPLEMENTATION_STATUS.md`. A choice
  the specification leaves open MUST be recorded in
  `docs/TECHNICAL_DECISIONS.md` before continuing.

## Governance

- This constitution supersedes every other practice in this repository. Where a
  spec, plan or task list conflicts with it, the constitution wins and the
  conflict MUST be raised before work continues.
- Amendments are made only through `/speckit.constitution`, which writes
  `.specify/memory/constitution.md`, produces a Sync Impact Report and bumps the
  version in a dedicated commit. Versioned template layers MUST NOT be edited to
  satisfy a project preference.
- Versioning follows semantic rules: MAJOR for backward-incompatible principle
  removals or redefinitions, MINOR for a new or materially expanded principle or
  section, PATCH for clarifications, wording and typo fixes.
- Compliance is reviewed at every gate: each spec, plan, task list and pull
  request MUST be checked against the Core Principles and the quality gates
  before acceptance. A failing gate blocks merge.
- Runtime guidance in `docs/TECHNICAL_DECISIONS.md` and
  `docs/ARCHITECTURE.md` MAY be more specific than this document but MUST NOT
  weaken any rule stated here.
- Deviation from the fixed toolchain, layout or phase order requires a recorded
  decision and, if the deviation is durable, a constitution amendment. Complexity
  MUST be justified rather than assumed.

**Version**: 1.0.0 | **Ratified**: 2026-10-04 | **Last Amended**: 2026-10-04
