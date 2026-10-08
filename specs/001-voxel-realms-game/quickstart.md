# Quickstart — Voxel Realms validation guide

**Feature**: `specs/001-voxel-realms-game` | **Branch**: `001-voxel-realms-game`
**Date**: 2026-10-04

Run guide for proving the feature works end to end. It references
[contracts/](./contracts/) and [data-model.md](./data-model.md) rather than
restating them. Implementation detail belongs in `tasks.md` (Phase 2).

---

## 1. Prerequisites

| Requirement | Value |
|---|---|
| Node | 20 LTS |
| Package manager | npm (committed lockfile) |
| Browser | any current stable desktop browser — Chromium, Firefox or WebKit (research R3) |
| Minimum window | 1280×720 |
| Input | mouse + keyboard |
| Network | **not required** — the game makes no network calls |

No other tools are needed. Do not install anything beyond `package.json`:
Constitution Principle IV pins dependencies exactly.

---

## 2. Setup

```bash
npm ci          # clean install from the committed lockfile
```

`npm ci` **must** succeed with the committed lockfile — this is the first line of
spec §14 acceptance.

---

## 3. Commands

| Command | Purpose | Expected |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | exit 0, **0 errors** |
| `npm test` | `vitest run` | all 12 deterministic suites pass, 0 failures |
| `npm run build` | typecheck then bundle | succeeds, produces `dist/` |
| `npm run dev` | dev server | game reachable locally |
| `npm run preview` | serve the built bundle | game playable for acceptance |

### The mandatory gate sequence

Run these **in this exact order after every implementation phase**. A failing
step blocks advancement; diagnose by reading the full error rather than
suppressing it (Constitution, Development Workflow).

```bash
npm run typecheck   &&   npm test   &&   npm run build
```

Record the result in `docs/IMPLEMENTATION_STATUS.md` as:

```text
PHASE n: DONE | typecheck PASS | tests PASS (N passed) | build PASS
```

---

## 4. End-to-end validation scenario

Perform against `npm run preview`. Paste the browser console output as evidence.

**Given** a **first run**, **when** the game loads, **then** the FR-043 hint
overlay appears beside the crosshair naming the break and place controls;
**when** the player has broken and placed one block, **then** it disappears and
does not appear on any later run.

**Given** the game is loaded, **when** the following is executed in order:

1. Main menu → **New World** (seed left blank) → enter a name → play
2. Walk, sprint, jump, look around; confirm new terrain streams in
3. Aim at a block → hold break → collect the drop — debris flies from the
   broken cell (FR-045)
4. Select a block from the hotbar → place it against a surface
5. Dig down into an enclosed space → confirm it is dark, place a torch →
   confirm light spreads outward and stops after 14 blocks (FR-044)
6. Open inventory → craft planks → sticks → a pickaxe → equip it → mine stone
7. Settings → particles **off** → break a block → no debris, drop still
   collected; particles **on** → debris returns (FR-045)
8. Pause → **Save** → **Main Menu**
9. Reload the page → **Load World** → select the world
10. Confirm position, inventory, placed blocks and clock are unchanged

**Then** zero errors are shown to the player and the console is clean (FR-040,
SC-010).

> If no headless browser is available, perform step 1–10 manually and record the
> launch check as **UNVERIFIED** where it cannot be observed — never as PASS
> (research R2, Constitution G11).

---

## 5. Success-criteria validation matrix

| SC | How to verify | Expected |
|---|---|---|
| SC-001 | Timed: launch → standing in a new world, on the reference machine | < 30 s |
| SC-002 | `npm test` — seed determinism + golden hash, ≥10 consecutive runs and across restarts | byte-identical every time |
| SC-003 | 5-minute continuous sprint session at default settings on the reference machine; read frame rate from the F3 overlay | ≥30 fps for ≥95% of the session; no freeze >250 ms |
| SC-004 | Manual: aim → break → collect with an appropriate tool | ≤ 5 s |
| SC-005 | Unassisted first-time player: enter world, break a block, place a block | ≤ 2 min in ≥90% of attempts |
| SC-006 | Manual: from ingredients on hand, craft a pickaxe using only the in-game interface | ≤ 60 s |
| SC-007 | `npm test` — save/load round trip; plus manual save → reload → compare | zero discrepancies |
| SC-008 | `npm test` — corrupt/truncated fixtures | no termination; recoverable path < 3 s |
| SC-009 | Change every setting → full restart → re-inspect | all changes still applied |
| SC-010 | The §4 walkthrough above | zero player-visible errors |
| SC-011 | Manual: edit a block on a region boundary, watch the neighbour — including placing a torch on the boundary so light crosses it too | updates within one frame refresh |
| SC-012 | Review every shipped asset and all code for third-party provenance | zero third-party game content |
| SC-013 | Force a write failure (fill storage / revoke permission) | failure surfaced; never reported as saved; notice clears on next successful save |
| SC-014 | Timed: select a saved world from Load World → first frame in which the player can move, on the reference machine | < 10 s |

**Reference machine** for SC-001 and SC-003 is defined in
[spec.md](./spec.md) Assumptions: a laptop with integrated graphics and no
discrete GPU, no more than five years old at measurement time, at default
settings. Results from any other machine are informational only.

### SC-002 evidence — 2026-10-06 (source phase 4)

SC-002 reads *"byte-identical every time"*. That claim has three distinct ways
to fail, so `tests/seed-reproducibility.test.ts` tests them separately rather
than as one assertion:

| Half | Mechanism | Result |
|---|---|---|
| ≥10 consecutive runs | 10 calls over 6 regions, each run visiting the regions in a *different* order, comparing **whole block arrays** region by region against run 1 | PASS — 32,768 × 6 × 10 bytes compared, 0 differences |
| Across a restart | `vi.resetModules()` then a re-import, so the factory used afterwards is a different function object (asserted) — a module retaining state across a reload is exactly what this catches | PASS — `reloaded.generateChunk !== generateChunk` held; all 6 arrays equal |
| Across processes | the suite run twice by two separate `vitest` processes, manifests diffed mechanically | PASS — `Compare-Object` output empty |
| Seed is load-bearing | same 6 regions under `SEED + 1` must *not* match | PASS — no region coincided |

Cross-process manifest, captured from two independent runs — both processes
printed these six lines and the diff between them was empty:

```text
SEED 123456789 MANIFEST
  region ( 0,  0) -> 1460204569
  region ( 1,  0) -> 1260073459
  region ( 0,  1) -> 460910421
  region (-1, -1) -> 4284780635
  region ( 3, -7) -> 2298690866
  region (-5,  2) -> 2718511272
```

The six regions were chosen for coverage rather than convenience: the origin,
its right-hand neighbour (the FR-005 straddling-trees case), a z-only step, a
doubly-negative region, and two with mixed-sign coordinates that exercise the
negative-x path through `chunkCoordOf`. The same six digests are committed as
the test's own expected values, so a *third* process — CI, another machine, a
release build — is checked by the test itself rather than by comparing output
by eye.

The `(0, 0)` value is the same `GOLDEN_HASH` asserted in
`tests/golden-hash.test.ts`; the two suites overlap deliberately. The golden
hash asks *"did generation change?"*, this one asks *"does it change between
runs?"* — a single constant answers only the first.

---

## 6. Targeted verification of the constitution-critical properties

These are the checks that would catch a violation of a Principle I–V gate.

| Property | Check |
|---|---|
| Deterministic purity (I) | `npm test` — no `Math.random()`, `Date.now()` or `performance.now()` appears in world, gameplay-logic or test code; generation is pure; particles derive from `hash32(eventKind, tick, index)` and light uses the strictly-greater monotone rule so it is visit-order independent (R17, R18) |
| Golden hash (I) | `golden-hash.test.ts` fails if generation drifts |
| Cross-region trees (I) | chunks `(0,0)` and `(1,0)` agree in both generation orders |
| Fixed timestep (II) | physics and day/night advance only in ticks; rendering interpolates |
| Bounded work (II) | ≤2 generations per tick, ≤2 meshes per frame; no freeze >250 ms (SC-003) |
| Single config source (III) | no hard-coded tunable numeric literals outside `src/core/GameConfig.ts` — review gate |
| Pinned toolchain (IV) | every dependency in `package.json` exact; lockfile committed; `npm ci` succeeds |
| Canonical serialization (V) | save round trip is byte-stable; fixed key order in [contracts/save-schema.md](./contracts/save-schema.md) |
| Original assets (Constraints) | no image or audio files shipped; textures and audio generated at runtime |

---

## 7. Expected test outcome

```text
12 suites  |  all passing  |  0 failing  |  no real timers used
```

Suites: coordinate · seed determinism · golden hash · cross-chunk trees ·
block place/remove · inventory · recipes · tool rules · collision · raycast ·
save/load · mesher.

---

## 8. Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| `npm ci` fails | lockfile drift | Constitution IV — restore exact pins, never use ranges |
| Golden hash test fails | generation algorithm changed deliberately? | review the diff; regenerate the constant only if intended |
| Terrain differs between runs | a clock or global random source leaked into generation | research R4 — trigonometry is forbidden inside `generateChunk` |
| Frame rate collapses while exploring | per-tick/per-frame budget exceeded | FR-039 budgets; research R12 |
| World opens in two tabs at once | lock not acquired | research R11 — Web Lock `voxel-realms:<name>` |
| Save says success but state is missing | write not awaited | FR-022 / SC-013 — research R10 |
| Craft offers two outputs for one ingredient set | duplicate recipe multiset | research R15 registry self-check |
| First-run hint never appears, or never clears | first-run flag not persisted, or not cleared on break + place | FR-043 |
| Progress lost when switching tabs or closing | hidden-page save not issued, or issued but not awaited | FR-022, research R16 |
| Creatures missing or duplicated after a reload | `tick` restored *after* creatures were materialised | FR-028, data-model §7 / §9 |
| Opening the inventory lets the world keep running | inventory treated as a third mode instead of `paused` | FR-032, contracts/input-bindings.md |

---

## 9. Evidence log format

Append to `docs/IMPLEMENTATION_STATUS.md` after each phase. Only record PASS for
commands actually executed and observed.

```text
PHASE n: DONE | typecheck PASS | tests PASS (N passed) | build PASS
VERIFY: <SC or property> | <command or manual steps> | <observed output> | PASS|FAIL|UNVERIFIED
```

### Phase 1 evidence — 2026-10-06

Executed on the reference machine (Windows, Node v24.11.0, npm 11.6.1) in the
constitution's order: `typecheck → test → build`, preceded by `npm ci`. Exit
codes below are the real process exit codes.

`npm ci` — **exit 0**

```text
added 100 packages, and audited 101 packages in 11s

13 packages are looking for funding
  run `npm fund` for details

5 vulnerabilities (2 moderate, 1 high, 2 critical)
```

`npm run typecheck` — **exit 0**, no diagnostics emitted

```text
> voxel-realms@0.1.0 typecheck
> tsc --noEmit
```

`npm test` — **exit 0**

```text
> voxel-realms@0.1.0 test
> vitest run

 RUN  v2.1.2 G:/Projects/Minecraft clone

include: tests/**
No test files found, exiting with code 0
```

`npm run build` — **exit 0**

```text
> voxel-realms@0.1.0 build
> vite build

vite v5.4.8 building for production...
transforming...
✓ 1 modules transformed.
dist/index.html  0.57 kB │ gzip: 0.38 kB
✓ built in 224ms
```

**Notes**

- `tests PASS (0 passed)` at Phase 1 is literal and expected: the project has no
  test files yet, and `passWithNoTests: true` in `vite.config.ts` is what lets
  the mandated command succeed on an empty project. See `docs/TECHNICAL_DECISIONS.md`
  TD-002. The flag stops mattering the moment `tests/coordinate.test.ts` lands
  in Phase 2b.
- The build transformed **1 module** — `index.html` alone. No script entry
  exists yet; see TD-003.
- The 5 vulnerabilities are all in the **development toolchain** (`vite`,
  `vitest`, `esbuild`, `tinypool`, `@vitest/mocker`). The single runtime
  dependency, `three`, is clean, and nothing in the toolchain ships in `dist/`.
  Non-major fixes exist but are blocked by the constitution's exact pins; see
  TD-005.
- No result is recorded as PASS here beyond these four commands. The browser
  walkthrough and the 14 success criteria are **UNVERIFIED** at this phase.
- **Re-run 2026-10-06, after review fixes** to `src/core/GameConfig.ts`
  (`AUDIO.EFFECTS`, `MAX_RETAINED_REGIONS`, `BIOME`, header) and
  `src/utils/Mathx.ts` (`floorMod` negative zero, fractional input): all three
  commands again exit **0** with identical output — `tsc --noEmit` silent,
  `No test files found, exiting with code 0`, `1 modules transformed` /
  `dist/index.html 0.57 kB`. Only the build wall-clock differs (73 ms), which is
  not a result. Choices made in that pass: `docs/TECHNICAL_DECISIONS.md` TD-006
  and TD-007.
