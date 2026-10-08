# Technical Decisions — Voxel Realms

Open choices: decisions the specification, plan and constitution left
undecided, or where the environment forced a call. Each is recorded **when it is
made**, with its rationale and its blast radius. Constitution: *Development
Workflow* — "record any open choice in `docs/TECHNICAL_DECISIONS.md`", done in
every phase-closing task (T012, T017, T023, T032, T038, T047, T056, T063, T071,
T076, T080, T090, T105, T110, T117, T132).

No entry here may contradict `spec.md`, `plan.md` or `.specify/memory/constitution.md`;
where they conflict, those win and this file is corrected.

---

## Phase 1 — 2026-10-06

### TD-001 · Host Node version differs from the plan

**Context.** `plan.md` Technical Context states "toolchain on Node 20 LTS". The
machine has **Node v24.11.0** with **npm 11.6.1**.

**Decision.** Set `"engines": { "node": ">=20" }` in `package.json` — the plan's
version as a *minimum* rather than an exact pin — and do not attempt to install
a different runtime.

**Rationale.** The build target is ES2022 **in the browser**; no source file
depends on a host Node feature beyond 20. npm's version is irrelevant to the
artifact. Installing a second runtime would add an unpinned, undocumented
dependency on a version manager for no behavioural gain.

**Blast radius.** `package.json` only. If CI later runs Node 20, `npm ci`,
`typecheck`, `test` and `build` are unaffected.

**Revisit if:** a dependency requires a newer Node API, or CI is pinned to a
version that fails the `engines` floor.

### TD-002 · `passWithNoTests` on the vitest run

**Context.** The constitution requires `typecheck → test → build` after *every*
phase, and the Phase 1 checkpoint is "install, typecheck, test and build all run
on an empty project". At Phase 1 the project has zero test files, and vitest
exits non-zero when it finds none.

**Decision.** `passWithNoTests: true` in `vite.config.ts` under `test`. The
`test` script stays the canonical `vitest run`.

**Rationale.** The flag makes the mandated command succeed on an empty project
without inventing a placeholder test (constitution: *no placeholders*). It does
**not** mask a real failure: it only applies when **zero** files match
`tests/**/*.test.ts`, and from Phase 2b onward `tests/coordinate.test.ts`
always matches. A deleted `tests/` directory would silently pass — which is why
it is recorded here rather than left implicit.

**Blast radius.** `vite.config.ts`. Every later phase runs real suites, so the
flag is load-bearing for Phase 1 only.

**Revisit if:** `quickstart.md` §7's "12 suites" check ever needs to prove the
suite *count*, at which point delete the flag and assert the count instead.

### TD-003 · No task creates the application entry point

**Context.** `plan.md` Project Structure lists `index.html` and the twelve `src/`
domain directories, and T005 creates them — but **no task in `tasks.md` creates a
composition root** (`src/main.ts` or equivalent), and no task adds a
`<script type="module">` to `index.html`. Grepping the plan, tasks, research and
contracts for `main.ts`, `Game.ts`, `App.ts`, `entry`, `bootstrap` and `mount`
returns nothing.

**Decision.** Ship `index.html` at Phase 1 **without** a module script, so that
`vite build` succeeds against an empty project exactly as the phase checkpoint
requires, and record the gap here rather than silently inventing a task.

**Rationale.** Two alternatives were rejected:

- *Point `index.html` at a stub entry* — creates a placeholder file, which the
  constitution forbids, and would still need a task to fill it in.
- *Add a `T133` for the composition root* — task IDs are frozen; appending an
  ID would also require re-validating the dependency, parallel and coverage
  tables in `tasks.md`. **Taken on 2026-10-08 after all** (see *Resolved* below):
  a brand-new ID is not a renumbering, and the dependency, phase, US1-coverage
  and MVP-scope tables were re-validated as part of adding it.

The gap belongs to the task list, not to the code, so it is escalated rather
than absorbed.

**Resolved 2026-10-08 — `/speckit.clarify` session 3.** The escalation this
entry made was accepted: **FR-046** now requires that the game be runnable from
the delivered page through exactly one entry point, and **T133–T134** carry the
work — `src/main.ts` plus the `<script type="module" src="/src/main.ts">` in
`index.html`, and the region draw path in `src/rendering/Renderer.ts`. Both sit
in **source phase 6**, not the Phase 10 this entry predicted: every subsystem the
root must connect already exists after source phase 5, and landing it there makes
phases 6–12 observable in a browser rather than test-only. IDs were allocated
*after* T132 precisely because they are frozen — no existing Task ID moved, which
is why the new IDs are out of sequence with their position in `tasks.md`.

**Blast radius.** `index.html`, `src/main.ts`, `src/rendering/Renderer.ts`,
`plan.md` Project Structure (both files now listed), and `tasks.md` (US1 coverage
and MVP-scope rows now cite T133–T134). Until T134 lands, `npm run preview`
serves a shell with no game.

**Revisit if:** the task list is regenerated rather than appended to — then
T133–T134 must be re-checked against FR-046 rather than assumed to have
survived.

### TD-004 · `build` does not re-run the type checker

**Context.** Constitution *Development Workflow* mandates the order
`typecheck → test → build`. Vite's `build` does not type-check by default.

**Decision.** Keep the five scripts independent: `build` is `vite build` alone,
`typecheck` is `tsc --noEmit`.

**Rationale.** The mandated sequence already runs `tsc` first, so folding it
into `build` would run the compiler twice on every phase gate and would let a
type error be attributed to the wrong step in the gate log. Keeping the commands
disjoint makes `PHASE n: DONE | typecheck PASS | tests PASS (N passed) | build
PASS` in `IMPLEMENTATION_STATUS.md` a record of three genuinely separate
outcomes.

**Blast radius.** `package.json` scripts. Anyone running `npm run build` alone
gets an un-type-checked bundle — the gate sequence, not the single command, is
the safety net.

**Revisit if:** a CI pipeline is added that runs only `build`.

### TD-005 · Development-toolchain advisories vs the exact version pins

**Context.** `npm ci` reports **5 vulnerabilities — 2 moderate, 1 high, 2
critical**. They resolve to `vite` (high), `vitest` (critical), `tinypool`
(critical), `esbuild` (moderate) and `@vitest/mocker` (moderate). `npm audit`
offers `vite → 5.4.21` and `vitest → 2.1.9`, both **non-major**.

**Decision.** Keep the pinned versions — `vite 5.4.8`, `vitest 2.1.2` — and do
not run `npm audit fix`.

**Rationale.**

1. Constitution IV fixes the stack exactly: *"Vite 5.4.8 … vitest 2.1.2"*, and
   T002 requires exact pins with no ranges. Deviating would be a CRITICAL
   constitution conflict, which `/speckit.analyze` treats as automatically
   critical.
2. Every advisory is in the **development toolchain**. The only runtime
   dependency, `three 0.169.0`, reports clean, and no advisory package is
   emitted into `dist/` — the artifact players run contains none of them.
3. The exposure is local: `vite dev`/`vite build` serve and bundle code already
   on this machine, with no network-facing surface.

**Trade-off accepted:** a known-critical advisory remains in `node_modules`
until the constitution's pins are amended through the proper process.

**Blast radius.** `package.json`, `package-lock.json`. No shipped bytes change.

**Revisit if:** (a) a preview server is exposed beyond localhost; (b) the
constitution's pinned versions are deliberately moved — in which case pin
`vite 5.4.21` and `vitest 2.1.9`, re-run the four Phase 1 commands and refresh
`package-lock.json`; or (c) `npm audit` is added to CI as a gate.

**Escalation:** this is a constitution-level question, so it is surfaced here
rather than resolved unilaterally in code.

---

## Phase 1 review — 2026-10-06

Corrections from a review of the uncommitted Phase 1 work. TD-001…TD-005 stand;
the two entries below are the choices the review forced.

### TD-006 · Shape of the retained-region set (FR-039)

**Context.** FR-039 requires the system to "retain no more regions than those
intersecting the current view distance plus the stated retention margin", but
neither FR-004, `plan.md` nor research R12 states whether that set is a disk or
a square. R12's `distance²` orders the streaming queue — a *priority*, not a
membership predicate. `MAX_RETAINED_REGIONS` had been written as
`(12 + 1)² = 169`, the area of a 13×13 square anchored at the origin, which
matches neither candidate: a Euclidean disk of radius 13 contains **529** lattice
points, a Chebyshev square centred on the player **729**.

**Decision.** Compute the **Chebyshev square**: `(2·(VIEW_DISTANCE_MAX +
RETENTION_MARGIN_REGIONS) + 1)² = 729`, and document it on the constant as the
worst case rather than as *the* answer.

**Rationale.** FR-039 is a *no-more-than* bound whose purpose SC-003 states — "a
session of an hour or more does not accumulate regions or buffers without bound".
A ceiling is therefore the right shape of answer, and the square is the larger of
the two candidates: a square-based implementation is allowed its full 729 and a
disk-based one retains strictly fewer, so neither is falsely failed, while an
unbounded leak is still caught. Picking 529 would have failed a legitimate square
implementation on every frame.

**Blast radius.** `src/core/GameConfig.ts`. No consumer until T108 (source phase
15), which is where the FR-039 budgets are enforced end to end.

**Revisit if:** FR-039 is ever clarified to name a shape — then recompute to that
shape and the value becomes exact instead of a ceiling.

### TD-007 · `Mathx` accepts fractional values

**Context.** `floorDiv`/`floorMod` rejected any non-integer operand, but the
call sites that need them hold continuous positions: the player's eye, a ray
origin and the camera are all `number` (fractional) per `data-model.md` §2. The
natural expression of "which region is the player in" — `floorDiv(player.x, 16)`
— therefore threw `RangeError` at runtime. T036 (`ChunkManager`, sorting by
`distance²` from the player) and T106 (`DebugOverlay`, player and region
coordinates) both need exactly that conversion.

**Decision.** `value` may be any **finite** real and is floored toward −∞ first.
`divisor` must be a finite, non-zero integer. `NaN` and `±Infinity` still throw.

**Rationale.** Flooring is the correct cell lookup for a continuous position —
block −1 must land in region −1 either way. Integer inputs are unchanged (`floor`
of an integer is itself), so the documented tables and the T018 fixtures
`(-1 → -1, 15)`, `(-16 → -1, 0)`, `(-17 → -2, 15)` hold exactly. The stated
poison concern — "a silent `NaN` would poison a coordinate" — is retained by the
finite check, which is what that guard was really for. A separate
position→region helper was rejected: it duplicates the same primitive and leaves
the throwing version in place for the first caller to trip over.

**Also fixed in the same pass** (a defect, not a choice): `floorMod(-16, 16)`
returned **`-0`**, because `-16 % 16` is `-0` and `-0 < 0` is `false`, so the
`remainder < 0` guard passed it through. `Object.is(-0, 0)` is `false`, so the
documented result `0` and the T018 fixture `(-16 → -1, 0)` would have failed a
`toBe(0)` assertion. Both functions now normalise a zero result to `+0`.

**Blast radius.** `src/utils/Mathx.ts`. No consumer until T021 (`World.ts`).

**Revisit if:** a test needs to prove that a coordinate helper *rejects*
fractional input — in that case restore the integer guard and add the float
entry point separately.

---

## Source phase 2 — 2026-10-06 (T013–T017)

### TD-008 · `utils/Hash.ts` is created in source phase 2, its salt enum at T026

**Context.** T014 asks for the FR-045 particle pass, and research R18 fixes how a
particle is derived: *"from `hash32(eventKind, tick, index)` — no `Math.random()`,
no `Date.now()`"*. `hash32` lives in `src/utils/Hash.ts`, whose creation task is
**T026 — source phase 4**. Implementing T014 without it would have meant a second,
locally-invented mixing function, which research R6 explicitly rejects ("one hash
implementation to trust instead of two").

**Decision.** Create `src/utils/Hash.ts` during T014 carrying `hash32` and
`hashBytes` only. The **closed salt enum** (D3's `NOISE=1 … TEXTURE=10`) is added
to that file at T026, alongside `Prng.ts`, where it is first needed.

**Rationale.** Salts exist solely for PRNG stream derivation; the particle pass
passes `eventKind` as an ordinary first argument and uses no salt, so it does not
touch the closed enum. Splitting the file this way keeps T014 free of a placeholder
and keeps T026 a real task rather than a re-statement of work already done.

**Blast radius.** `src/utils/Hash.ts`. T026 still creates `Prng.ts` and still
lands the salt enum; `contracts/world-generation.md` D2/D3 are unchanged.

**Revisit if:** T026's closure cannot be evidenced, or if a second early consumer
of `hash32` appears and the split starts reading as accidental.

### TD-009 · Fixed-timestep stall cap

**Context.** Research R14 requires capping accumulated time after a long stall so
"a backgrounded tab cannot trigger thousands of ticks on resume", but neither
`spec.md` nor `research.md` states the cap. It is a tunable, so Constitution III
forbids leaving it as a literal in `GameLoop.ts`.

**Decision.** `TIME.MAX_ACCUMULATED_SECONDS = 0.25` — five ticks. Elapsed time
banked above it is **dropped**, not deferred.

**Rationale.** 0.25 s absorbs an ordinary dropped frame (a single hitch at 60 fps
is ~0.016 s) and a modest GC pause, while capping a resume-after-minutes burst at
five ticks of catch-up instead of thousands. Dropping rather than deferring means
the game loses wall time it can never simulate anyway, and recovers in one bounded
step — which is what R14's rejected "clamp to a single tick maximum" alternative
fails to do, since that one slows the game permanently.

**Blast radius.** `src/core/GameConfig.ts`, `src/core/GameLoop.ts`. A larger value
trades a longer catch-up burst for less lost time; a smaller one drops more time
after a hitch.

**Revisit if:** SC-003's frame floor is missed during optimisation and the burst
turns out to be the cause, or if a measured hitch profile on the reference machine
suggests a different ceiling.

### TD-010 · Camera pitch epsilon and clipping planes

**Context.** `data-model.md` §2 clamps pitch to `±(π/2 − ε)` but never defines `ε`,
and nothing states the camera's near/far planes. Both are tunables.

**Decision.** `CAMERA.PITCH_EPSILON = 0.0001` radians (≈0.0057°), yielding a
pitch limit of `π/2 − 0.0001`; `CAMERA.NEAR = 0.1`, `CAMERA.FAR = 512`.

**Rationale.** `ε` only has to keep the view vector off the poles where the
`YXZ` basis degenerates; at 0.0001 rad the residual horizontal component of the
forward vector is ~10⁻⁴, far below any pixel-level effect, while the clamp stays
visibly distinct from `π/2`. `FAR = 512` clears the worst case on screen: the
player at a world corner looking across 12 regions (192 blocks) plus the 128-block
height — the space diagonal of the whole world is ~308 blocks — with margin for
the sky. `NEAR = 0.1` is close enough to avoid z-fighting between adjacent blocks
and far enough to keep depth precision across that 512-block range.

**Blast radius.** `src/core/GameConfig.ts`, `src/rendering/Camera.ts`. Both are
consumed only by rendering, so neither can affect determinism.

**Revisit if:** z-fighting appears on block faces at long range (raise `NEAR` or
lower `FAR`), or if the view-distance range is ever extended past 12 regions.

### TD-011 · FR-045 particle magnitudes

**Context.** FR-045 and research R18 fix *how* a particle derives — from
`hash32(eventKind, tick, index)`, with lifetimes in simulation ticks — and R18 caps
the ring at 256. Neither states how many particles an event emits, how fast they
travel, how long they live, or whether they fall. These are tunables and belong in
`GameConfig.ts` (Constitution III).

**Decision.** `BREAK_COUNT = 12`, `SPLASH_COUNT = 16`, `LIFETIME_TICKS = 20` (1 s),
`SPEED_MIN = 1.0` / `SPEED_MAX = 4.0` blocks/s, `GRAVITY = 20` blocks/s².

**Rationale.** 12 debris per break stays inside the 256-slot ring across a burst of
consecutive breaks (12 × 21 slots before earlier debris expires), and 16 splashes
reads as a surface disturbance rather than a mist. 20 ticks is one second — long
enough to see the debris land, short enough that the ring recycles within two
seconds of sustained breaking. Speed is derived per particle from the same hash so
scatter costs no extra hash call, and a dedicated particle gravity of 20 rather
than the gameplay 32 keeps cosmetic debris feeling lighter without implying a
physics rule the player could exploit.

**Blast radius.** `src/core/GameConfig.ts`, `src/rendering/Renderer.ts`. Nothing in
`world/` or `entities/` reads particles (FR-045's presentation-only clause), so
these values cannot affect FR-005 determinism.

**Revisit if:** SC-003's frame floor is missed with particles on, or a playtest
reads the debris as too sparse or too dense.

### TD-012 · Escape while the pause menu itself is open

**Context.** `data-model.md` §11 says "Escape means *dismiss the top screen*: from
`playing` it opens the pause menu, and from `paused[inventory]` it closes the
inventory". FR-032 as amended 2026-10-05 fixes the inventory case ("one press in,
one press out") but is silent on what Escape does while the **pause menu** is the
top screen. FR-033 lists the menu's actions as Resume, Settings, Save and
Save-and-return-to-Main-Menu — none of them Escape.

**Decision.** Escape from `paused[pause]` also returns to `playing`.

**Rationale.** This is the literal reading of "dismiss the top screen" applied
consistently: the rule is defined by which screen is on top, not by which key
opened it, so the inventory and the pause menu behave the same way under Escape.
It also keeps "one press in, one press out" symmetric — Escape can never move
laterally between the two paused screens, which is the property FR-032 is actually
protecting. `GameState.escape()` implements it in the `paused → playing` branch
shared with the inventory, so no third path exists to drift.

**Blast radius.** `src/core/GameState.ts`. T045 (source phase 6) wires Escape into
this method; the pause menu's four buttons are unaffected.

**Revisit if:** FR-033 is later amended to make Escape a no-op on the pause menu,
in which case the `paused` branch of `escape()` splits on `screen`.

### TD-013 · What `Renderer.ts`'s "render target" is

**Context.** `plan.md` Project Structure lists "Scene, lights, render target,
resize" for `src/rendering/Renderer.ts` without saying whether that means an
offscreen `THREE.WebGLRenderTarget` for post-processing, or the drawing buffer
itself. No requirement mentions post-processing, and a target nothing renders into
would be dead configuration.

**Decision.** The drawing buffer: `Renderer.setSize()` owns `setPixelRatio` /
`setSize`, and `render()` draws straight to the canvas. No offscreen target is
created.

**Rationale.** Every requirement the renderer touches — FR-027 sky colour,
FR-044 illumination, FR-045 particles, FR-010 target outline — composes directly
into the scene graph. Post-processing would add a full-screen pass against SC-003's
frame floor on an integrated-graphics reference machine, for no stated requirement.

**Blast radius.** `src/rendering/Renderer.ts`. If a later phase needs an offscreen
target it is added there, with this entry updated.

**Revisit if:** a requirement introduces a post-processed effect, or SC-003 fails
and down-scaling the buffer is chosen as the fix.

---

## Source phase 3 — 2026-10-06 (T018–T023)

### TD-014 · `tests/coordinate.test.ts` splits across T018 and T024

**Context.** T018 says to write the file with **both** the six coordinate
fixtures **and** three `generateChunk` assertions (called twice byte-equal, also
for `(-3, 7)`, and a different seed differs), then confirm it fails. T023 then
requires `npm test` to exit 0 so the `PHASE 3` line can honestly read
`tests PASS`. `generateChunk` is not created until **T029**, so a file importing
it at T018 fails to *resolve* — not merely to assert — and every test in the file,
coordinate fixtures included, is unreachable. T018's literal text and T023's gate
cannot both be satisfied.

**Decision.** T018 writes the six coordinate fixtures plus two derived properties
and confirms the file fails. The seed-determinism assertions T018 also names are
appended to **the same file at T024**, the phase-4 test-first task that already
introduces `chunk-purity.test.ts` and `golden-hash.test.ts`, and are confirmed
failing there. All three go green together at T030.

**Rationale.** Every assertion T018 lists ends up in `tests/coordinate.test.ts`,
and each is written and observed failing before `generateChunk` exists, so the
constitution's test-first clause holds without exception. Grouping them at T024
also matches the pattern this very phase already establishes — T024 and T025 both
write suites that stay red until T030 — rather than introducing a second,
inconsistent shape. The alternative, letting the file stay red through T023, was
rejected because the phase gate would have to be recorded as `tests FAIL`, which
the constitution forbids recording as DONE.

**Blast radius.** `tests/coordinate.test.ts`, `tasks.md`'s T018/T024 closure
notes. The twelve required test areas are unaffected — *coordinate conversion* and
*seed determinism* both remain covered, and the latter by the file T018 names.

**Revisit if:** `/speckit.tasks` is regenerated and T018 is reworded to defer its
own seed-determinism clause, or if T030 cannot make the file fully green.

### TD-015 · Encoding WATER's hardness and AIR/WATER's `minTier`

**Context.** `contracts/registries.md` shows `hardness = — (unbreakable)` for
WATER and `min tier = —` for AIR and WATER, while `data-model.md` §4 types
`hardness` as `number ≥ 0` and `minTier` as `integer 0–2`. T019 repeats the
0–2 constraint. The two documents disagree about what those three cells contain.

**Decision.** WATER's `hardness` is `Infinity`; `minTier` is a concrete `0` for
all fourteen ids including AIR and WATER.

**Rationale.** Break time is `hardness / toolMultiplier` (`data-model.md` §4), so
infinite hardness *is* the unbreakable rule — the division yields `Infinity`,
holding the button never completes a break, and no parallel "can this be broken"
flag has to be kept in step with the number. `Infinity ≥ 0` satisfies the field's
stated constraint exactly. For `minTier`, both the data model and T019 bound the
field to 0–2, and neither AIR nor WATER is ever broken in the first place, so a
concrete in-range value costs nothing and keeps every consumer's type simple
instead of forcing `number | null` through the tool and crafting code.

**Blast radius.** `src/world/BlockRegistry.ts`. Consumers must not assume
`Number.isFinite(hardness)` — `tests/tools.test.ts` (source phase 7) asserts the
break time of WATER is `Infinity` rather than testing `hardness` alone. The
registry is never serialised, so `Infinity` cannot reach the save record.

**Revisit if:** a UI needs to print a hardness value, or `tests/tools.test.ts`
finds the `Infinity` encoding awkward — in which case add an explicit
`unbreakable` boolean derived from `hardness === Infinity` rather than duplicating
the source of truth.

### TD-016 · Which regions a boundary write marks dirty

**Context.** FR-014 says a change marks "the region … including adjacent regions
when the change is on a boundary". *Adjacent* is not defined: the 8 cells around
a corner, or only the 4 that share an edge? Getting it wrong in the permissive
direction leaves a stale mesh; in the strict direction it costs a redundant
remesh.

**Decision.** Mark the changed region, plus — only when the cell touches a region
edge — every region offset by `(dx, dz)` where `dx` is `±1` if `localX` is on the
x edge else `0`, and `dz` likewise: one region for an edge cell, **three** (both
edges and the diagonal) for a corner cell, **zero** for an interior cell.

**Rationale.** Two different effects set the requirement, and both are bounded by
the region width. *Faces* are axis-adjacent only, so an edge cell reaches exactly
one neighbouring region and a corner cell reaches two — never the diagonal.
*Light* is the exception: R17's fill loses exactly 1 per cell from a maximum of
15, so a torch at a corner reaches the cell two steps diagonally away at level 12,
which sits in the diagonal region — its illumination, and hence its mesh,
genuinely changes. Nothing can reach further: 15 < 16, so no write can ever alter
a region two away, which is what makes "mark adjacent" a complete rule rather
than an approximation.

**Blast radius.** `src/world/World.ts` `#markBorderNeighboursDirty`. The mesher
and `ChunkManager` consume `dirty` and never compute the offset themselves.

**Revisit if:** R17's propagation is ever changed to 8-connectivity in the
horizontal plane (then every edge cell also reaches its diagonal neighbours), or
if a light source brighter than 15 is introduced.

### TD-017 · Reading a block from a region that is not resident

**Context.** `getBlock(wx, wy, wz)` has three possible answers for "there is
nothing here": the cell holds AIR, the `y` is outside the world, or the region
has scrolled out of the retained view distance. Throwing for the third would be
the most informative, and raycasts probe far outside the loaded set every frame.

**Decision.** Return `AIR` for all three, and expose `hasBlockAt(wx, wy, wz)` for
callers that need to distinguish "air" from "not there". A write is different: it
returns `'refused-unloaded'` rather than inventing storage.

**Rationale.** A read has a correct default — FR-004 already says out-of-world
cells read AIR, so "unknown" behaving like "empty" is the same rule one step
wider — and the raycast path is on the hot path for every frame of FR-010's
targeting. A throw there would turn a routine probe into a crash. A *write* has
no such default: silently creating a region would defeat streaming's bounded
resident set (FR-039), and clamping would move the block, so refusal is the only
honest outcome. `hasBlockAt` returning `false` for out-of-world `y` keeps those
cells unreadable as well as unwritable.

**Blast radius.** `src/world/World.ts`. Any consumer that must know whether a
region is present calls `isLoaded` or `hasBlockAt` first; physics and raycast
callers intentionally do not.

**Revisit if:** a consumer reports "air" where "not loaded" matters — for example
a debug overlay, or chunk-boundary light validation — in which case that caller
switches to `hasBlockAt` rather than changing the default.

---

## Source phase 4 — 2026-10-06 (T024–T032)

### TD-018 · Noise output scales (`SCALE_2D`, `SCALE_3D`)

**Context.** `contracts/world-generation.md` commits to simplex + fBm with
"output in `[-1, 1]`", but never states the factor that lands the raw sums
there. The textbook `70` / `32` pair belongs to Stam's gradient table, which
uses *non-unit* gradients — and this implementation cannot, because research R4
and contract D4 forbid `Math.sqrt`, so the gradients are unit vectors written
out as literals. Changing the gradients changes the raw range, which means the
classic constants no longer mean what they meant.

**Decision.** `SCALE_2D = 90` and `SCALE_3D = 40`, declared in `src/world/Noise.ts`
next to the gradient tables they depend on, and **not** placed in `GameConfig`.
`clampUnit` still clamps every return to `[-1, 1]`, so the contract holds for any
peak; the scales only decide how often the bound is approached.

**Rationale.** The values come from measurement, not from taste: across seeds
123456789, 1 and −987654321 the raw extrema were **0.010080** (2D) and
**0.021625** (3D) — *identical* each time, because the bound is set by lattice
geometry and the gradient set, not by the permutation. Multiplying gives
observed peaks of **0.907** and **0.865**, i.e. roughly 10% headroom inside the
interval for a peak the sampling grid missed. They are deliberately outside
`GameConfig` for the same reason lacunarity and gain's sibling constants would
be: the fBm *knobs* are tunables and live in the config (Constitution III),
whereas a scale is part of the algorithm — changing one changes every generated
byte and invalidates the committed golden hash, which is a different class of
act from turning hills up.

**Blast radius.** `src/world/Noise.ts` only. Every consumer inherits the change
through `noise2D` / `noise3D`; nothing else names these constants.

**Revisit if:** the gradient tables are ever replaced (a wider table changes the
raw bound), or the golden hash is deliberately regenerated for an unrelated
reason and the noise range is reviewed at the same time.

### TD-019 · Noise and terrain tunables

**Context.** The contract fixes the *shape* of generation — simplex + fBm,
lacunarity 2.0, gain 0.5, sea level 40 — and fixes none of its *magnitudes*: not
the octave count, not a single period, amplitude, threshold or density.
Constitution III requires every tunable to have exactly one home, so all of them
were unspecified until they were written down.

**Decision.** `NOISE.OCTAVES = 4` joins the existing `NOISE` group; everything
else goes into a new **`TERRAIN`** group in `src/core/GameConfig.ts`:

| group | values |
|---|---|
| landform | `BASE_HEIGHT` 46 · `AMPLITUDE` 14 · `HILL_AMPLITUDE` 6 · `MOUNTAIN_GAIN` 130 |
| surface | `SURFACE_DEPTH` 4 · `BEACH_BAND` 3 · `SNOW_LINE` 88 |
| periods (world blocks) | continental 220 · hills 46 · mountains 180 · temperature 420 · moisture 300 · caves 22 · ores 14 |
| decorrelation | `LANDFORM_OFFSET` 100000 |
| caves | `CAVE_THRESHOLD` 0.68 · `CAVE_MIN_Y` 6 |
| ores | `ORE_COAL_THRESHOLD` 0.78 · `ORE_IRON_THRESHOLD` 0.84 · `ORE_IRON_MAX_Y` 32 |
| trees | forest density 0.05 · plains density 0.01 · trunk `4 + nextInt(3)` · canopy radius 2 |

**Rationale.** The numbers were set by measurement rather than assertion, and
the measurements are recorded here because they are the reason the values are
what they are:

- **Biome mix** sampled over a 6000 × 6000-block grid — many wavelengths of the
  slowest (420-block) field, so the result is not a local accident: Plains
  **48.9%**, Forest **26.7%**, Mountain **12.5%**, Desert **5.3%**, Snow **6.6%**.
  Plains leads because FR-002's rule 5 is literally "otherwise", and the four
  named rules are meant to be the exceptions.
- **Height range** `[31, 114]`, ocean **9.0%** of columns, snow-capped peaks
  **0.43%**. Nothing reaches the 127 ceiling, so no plateau is being produced by
  clamping.
- **Cave carving** 2.96% of solid cells and **ore** 0.70% — measured by counting
  air below each column's own surface, so sky is excluded from the cave figure.
  At `CAVE_THRESHOLD` 0.68 the cave network is present but open, not sponge.

Four octaves were chosen because the contract fixes lacunarity and gain but not
the count, and four resolves detail from the base frequency down to roughly
eight blocks — the smallest feature a 16×16 region can show, so a fifth octave
would spend work on texture smaller than a block.

**Blast radius.** `src/core/GameConfig.ts` (new `TERRAIN` group),
`src/world/generateChunk.ts`, and by extension the golden hash: every value in
the table above is baked into `GOLDEN_HASH`.

**Revisit if:** a designer wants a visibly different world — the table is the
whole surface area of that change, and regenerating the golden hash is the
deliberate cost (see TD-018 for why the noise *scales* are not part of it).

### TD-020 · The mountain mask is the raw ridge sample, not a `[0,1]` remap

**Context.** FR-002 rule 3 reads "mountain mask above 0.35" and specifies no
range for the mask. Two readings are available: take the ridge noise as it comes
out (mean 0, σ ≈ 0.30, range ≈ ±0.83), or normalise it into `[0,1]` with the
usual `(r + 1) / 2`. They are not close to equivalent.

**Decision.** Use the raw sample. `mountainMask` in `sampleColumn` is the ridge
fBm value unchanged, so `mountainMask > 0.35` selects its upper tail.

**Rationale.** The remap would centre the mask on **0.5**, which puts the 0.35
threshold *below the mean* — and since Mountain is evaluated **before** Forest
and Plains in FR-002's precedence, roughly 84% of columns would classify as
mountain and the spec's own "otherwise" rule would almost never fire. Measured
against the alternative, the raw sample selects about the upper 12%, and the
observed global mix came out at **12.5% mountain** with Plains leading, which is
the shape FR-002's ordering implies. The specification states no range, so the
reading under which its precedence table behaves as documented is the one used.

The arithmetic follows from the same choice: with the mask topping out near
0.83, lift is `0.48 × 130 ≈ 62` blocks, and the tallest non-mountain column is
about `46 + 14 + 6 = 66`, so peaks land near **y = 125** against a 128-block
ceiling — measured maximum 114. `MOUNTAIN_GAIN` is 130 rather than higher for
exactly that reason: it is the largest value that uses the headroom without
manufacturing a flat region at the ceiling.

**Blast radius.** `sampleColumn` in `src/world/generateChunk.ts`,
`BIOME.MOUNTAIN_MASK`'s meaning, `TERRAIN.MOUNTAIN_GAIN`, and the biome mix in
TD-019 — the three are one decision and must move together.

**Revisit if:** `/speckit.analyze` or a later clarification defines the mask's
range explicitly, or the world needs materially more (or less) mountain than
12.5%, in which case the threshold's *interpretation* is the lever rather than
the gain.

### TD-021 · Per-subsystem noise salts

**Context.** Contract D2 says each consumer derives its own stream and D3 closes
the salt enum, but neither says how one `SimplexNoise` class serves seven
different fields. Constructing a single instance and sampling it at seven
offsets would leave every field reading the *same* permutation — correlated in
practice, since one noise surface sampled twice nearby is one surface.

**Decision.** The constructor takes the salt, `new SimplexNoise(seed, salt =
SALT.NOISE)`, so the default construction is verbatim the permutation the
contract commits to: `mulberry32(hash32(seed, SALT_NOISE))`. `generateChunk`
builds one instance per subsystem:

| field | stream |
|---|---|
| continental landform | `SALT.NOISE` (the default constructor) |
| hills | `SALT.TERRAIN` |
| mountain ridges | `SALT.TERRAIN` **+ `LANDFORM_OFFSET`** |
| temperature | `SALT.BIOME_TEMP` |
| moisture | `SALT.BIOME_HUMID` |
| caves (3D) | `SALT.CAVE` |
| coal (3D) | `SALT.ORE_COAL` |
| iron (3D) | `SALT.ORE_IRON` |
| tree origins | `SALT.TREE`, via `deriveStream(seed, SALT.TREE, wx, wz)` |

**Rationale.** Seven fields, eight generation-relevant salts, so exactly one
pair shares — hills and ridges both take `SALT.TERRAIN` — and they are
decorrelated by `LANDFORM_OFFSET`, a 100 000-block shift applied before scaling
against periods of 46 and 180 blocks. An offset that many orders of magnitude
larger than both periods is not "nearby sampling"; the two evaluations land in
unrelated parts of the same surface. Every other field gets a permutation of its
own, which is what lets one be retuned without the others drifting: correlated
fields move as a group, and a world where temperature and moisture share a
surface would show biomes tracking terrain relief instead of climate.

**Blast radius.** `src/world/Noise.ts` (constructor), `src/world/generateChunk.ts`
(the seven instances), `src/utils/Hash.ts` (the `SALT` enum and `Salt` type).

**Revisit if:** an eighth field needs its own permutation — the enum is closed
by D3, so that is a contract change rather than an edit, and the existing
`LANDFORM_OFFSET` pattern is the template if a pair has to share again.

### TD-022 · The import-boundary test reads sources with Vite `?raw`, not `node:fs`

**Context.** The contract asks for an import-boundary check on `generateChunk`,
and `tests/chunk-purity.test.ts` additionally asserts that no generation module
calls a clock, `Math.random`, or trigonometry — which means the test has to read
source files. The obvious route is `node:fs`, but the repository has no
`@types/node`: `tsconfig.json` pins `types` to `["vite/client"]` and the only
`@types/*` packages are three and the ones vitest pulls in transitively.
`import { readFileSync } from 'node:fs'` therefore fails `npm run typecheck`,
and the gate runs typecheck before tests.

**Decision.** Import each source as text through Vite's raw suffix —
`import generateChunkSource from '../src/world/generateChunk.ts?raw'` — which
`vite/client` already declares as `string`, so it type-checks as-is. The same
suite scans *comments stripped* before matching forbidden calls, because
`Noise.ts` explains in prose why `Math.sqrt` is absent and `BlockRegistry.ts`
says it uses no `Math.random()` — both mention the very strings they forbid.

**Rationale.** Adding `@types/node` would have worked, but Constitution IV pins
the toolchain and names four packages plus their exact versions; a fifth
devDependency introduced to make one test convenient is exactly the kind of
drift that rule exists to stop, and it would have needed its own decision
anyway. `?raw` needs no dependency, no path resolution and no `process.cwd()` —
the test's whole static-check section becomes eight imports and two regexes,
and it runs identically in any environment Vite can already build in.

**Blast radius.** `tests/chunk-purity.test.ts` only. No production source refers
to `?raw`, and no other suite reads a file.

**Revisit if:** a test ever needs file *writes* or directory listings, which
`?raw` cannot do — at that point the toolchain question is real and belongs back
here as its own decision rather than being solved quietly inside a suite.

## Source phase 5 — 2026-10-08 (T033–T038)

### TD-023 · The torch is block id 14; item 103 stays an item

**Context.** FR-044 requires a *placed* light-emitting block, and `data-model.md`
§8 makes `light` "a pure function of `blocks` alone" — so the emitter has to be a
row in the block catalogue, not an entry in a slot. Two free id ranges were
available and neither was unproblematic: the block catalogue was frozen at 0–13
with the next id free at 14, while §3's slot rule (`integer | 1–13 for blocks,
≥100 for items`) and the item table row `| 103 | TORCH | placeable block proxy |`
are normative shipping text that must be reproduced verbatim.

**Decision.** Block id **14 = TORCH**. Item id **103 is unchanged** and keeps the
name and kind it has. The two are joined by a single rule, now stated in
`contracts/registries.md`: *breaking block 14 drops item 103; placing item 103
writes block 14*, and no other item at or above 100 maps to a block.
`lightEmission(id)` returns `LIGHT.TORCH_LEVEL` for id 14 and 0 for every other
id — there is no `emits` column and no change to the region byte layout.

**Rationale.** Three readings were on the table:

- *Keep the torch item-only and give it a "placed" representation.* Rejected:
  §8 then cannot hold, because a torch in the world would have to be inferred
  from inventory state, which is neither in `blocks` nor stable across a save
  round-trip.
- *Move TORCH's item id down into the block range so `slot === id`.* Rejected:
  1–13 are all taken by existing blocks, so it would mean renumbering §3 from
  `1–13` to `1–14` and editing the item table — two normative edits to save one
  exception.
- *New block id 14, item 103 untouched.* Taken. §4 alone widens to `0–14`; §3
  stays literally true because no item now carries id 14 (`AIR` has no item, and
  blocks 1–13 still reuse their own id as the item id), and the item table is
  byte-identical.

The chosen reading is also the one FR-044's own wording supports: it says
"light-emitting block", not "light-emitting item".

**Blast radius.** `src/world/BlockRegistry.ts` (`BLOCK.TORCH`, `ITEM_TORCH`,
`lightEmission`), `src/core/GameConfig.ts` (`LIGHT.TORCH_LEVEL`),
`contracts/registries.md` (row 14 + exception paragraph + self-check),
`data-model.md` §4, `docs/GAME_DESIGN.md`, `plan.md` Scale/Scope, and the test
name in `tests/chunk-purity.test.ts`. **The save schema is unchanged** — a save
stores `blocks` bytes, and byte 14 was previously unused. **The golden hash is
unchanged** — `generateChunk` never emits TORCH; verified by the full suite
running green with 37 tests immediately after the catalogue widened.

**Revisit if:** a second placeable block is added, in which case the exception in
`registries.md` becomes a list rather than a single case and the pattern is
already fixed: blocks continue from 15, items continue from 116.

### TD-024 · Per-face shading multipliers are `GameConfig.LIGHT` values

**Context.** The meshing prompt fixes three constants — up 1.0, side 0.6, down
0.5 — but does not say where they live. Inlining them in `ChunkMesher.ts` would
make them literals in gameplay code, which Constitution III forbids outright;
putting them in their own group would invent a group for three numbers.

**Decision.** `LIGHT.FACE_UP`, `LIGHT.FACE_SIDE` and `LIGHT.FACE_DOWN` join the
existing `LIGHT` group in `src/core/GameConfig.ts`. A vertex's value is
`illumination / LIGHT.MAX × FACE_*`, so a fully lit top face lands on 1.0, a
fully lit side on 0.6 and a fully lit underside on 0.5.

**Rationale.** They are genuine tunables — a "flatter"/"starkier" lighting look
is exactly one edit, and the change propagates to every region because nothing
bakes the result — so they belong in the single source of configuration. Placing
them in `LIGHT` rather than in `TERRAIN` or a new group keeps the whole lighting
model (scale, source levels, falloff, face weighting) in one object, which is
where a reader will look for it.

**Blast radius.** `src/core/GameConfig.ts` and the one multiplication site in
`src/rendering/ChunkMesher.ts`.

**Revisit if:** the renderer moves to a model that derives orientation from the
`normal` attribute rather than from the face table (TD-026) — at that point
these become shader-side constants and the question of which is authoritative
has to be reopened rather than silently duplicated.

### TD-025 · Illumination is computed inside `ChunkMesher`, over a 3 × 3 region domain

**Context.** FR-044 is explicit that a light change must travel *"through the
same remesh path as FR-014"*, and `plan.md`'s Project Structure lists
`ChunkMesher.ts` and **no** `Light.ts`. Two implementations honour that: a
separate light module that the mesher calls, or the fill living beside the
mesher. Separating them would leave FR-044's coupling as a convention two call
sites have to remember rather than a property of the code.

**Decision.** `computeLight(world, cx, cz)` and `buildRegionMesh(world, cx, cz)`
are both exported from `src/rendering/ChunkMesher.ts`, and one
`buildRegionMesh` call refreshes light *and* produces the mesh. The fill:

- reads **`blocks` only** — never a neighbour's `light` array;
- spans the **3 × 3 block of regions** centred on the target;
- writes `chunk.light` for **every resident region in that domain**, not just the
  target.

**Rationale.**

*Why 3 × 3.* Light travels at most `LIGHT.MAX` = 15 cells and a region is 16
wide, so a cell in the target can be lit from anywhere in the eight neighbouring
regions and nowhere farther. A domain exactly one ring wide is therefore the
smallest one that is never wrong; a 5 × 5 ring would read regions light cannot
reach.

*Why blocks only.* It makes the result a pure function of world block data, so
it inherits Principle I wholesale. `tests/mesher.test.ts` pins this directly: the
same torch placed across a region border is built in two different orders and
both regions' `light` bytes come out identical. Had the fill read a neighbour's
already-computed `light`, the second build would be seeded by the first and
order would leak in.

*Why every resident region, not just the target.* FR-044 says *"the changed
region **and** for any region whose light crosses its boundary"*. Filling only
the target would satisfy the letter for the region being remeshed and leave its
neighbours holding light computed before the change — visible as a border that
lights up a frame late, or never, if the neighbour is not itself dirty. Writing
all nine in the same pass is what makes the "one path" claim structural.

*Why non-resident regions read as AIR + skylight 15.* At view distance the
frontier is genuinely open — there is no terrain there yet — and treating it as
opaque would make every frontier face black. The frontier self-corrects rather
than becoming a seam: see TD-030.

**Blast radius.** `src/rendering/ChunkMesher.ts`, `src/world/Chunk.ts` (the
`light` array it writes), and `tests/mesher.test.ts`. Nothing outside the mesher
writes or reads `chunk.light`.

**Revisit if:** light is ever needed without a mesh (an entity query, an
inventory preview) — then `computeLight` is already the right seam to lift out,
and the decision becomes one of *exporting* rather than of *relocating*.

### TD-026 · `normal` joins the vertex format

**Context.** The prompt's §6 fixes the geometry as `position(3), uv(2),
light(1)`, and that statement has been treated as normative. The material
decision points the other way: `MeshLambertMaterial` is the only built-in
material that combines vertex colour with scene lights, and it reads a `normal`
attribute — without one it takes the geometry's single computed face normal, so
all six faces of a cube shade identically and `LIGHT.FACE_SIDE`/`FACE_DOWN` end
up doing by hand what the lighting model should be doing.

**Decision.** Add a `normals` attribute — 3 floats per vertex, the face's axis
unit vector — written from the same `FACES` table that writes positions.
`position(3), uv(2), light(1)` is unchanged as the data this project *authors*:
`normal` carries no new per-vertex information beyond which of the six culled
faces produced the vertex, which the mesher already knows.

**Rationale.** The rejected alternative was `MeshBasicMaterial` with
`vertexColors` and no normals at all — it satisfies §6 literally. It was rejected
because FR-027's `LIGHTING_KEYFRAMES` drive *scene* ambient and directional
intensity over the day cycle, and a basic material ignores scene lights
entirely; time of day would then have to be multiplied into every vertex, i.e. a
full remesh per tick to change the time, against FR-039's mesh budget. With a
normal and a lit material the same keyframe is a uniform, and torch brightness
scaling down at midnight falls out of the combination for free.

**Blast radius.** `src/rendering/ChunkMesher.ts` (`MeshData.normals`, the
`FACES` table, `MeshBuilder`). The three.js `BufferGeometry` that consumes it
does not exist yet — it arrives with the renderer's mesh upload path.

**Revisit if:** the material choice changes away from a lit material, at which
point `normal` is dead weight and should be removed rather than left as an
unexplained fourth channel.

### TD-027 · Vertex `light` stays one float and widens to `vec3 color` at upload

**Context.** three.js's `vertexColors` consumes a `vec3` (or `vec4`) `color`
attribute; there is no single-float variant. The obvious fix — store RGB in
`MeshData` — would triple a buffer for a channel that is greyscale by
definition, since `LIGHT.MODE` is `'greater-of-two-sources'` of a scalar level
and every face's colour comes from the atlas albedo plus scene lights.

**Decision.** `MeshData.light: Float32Array` keeps **one value per vertex** —
the shaded illumination in `[0, 1]`, `illumination / LIGHT.MAX × FACE_*`. The
expansion to three happens at the single boundary that knows about three.js:
the uploaded `color` attribute is `light[i]` written to `r`, `g` and `b`.

**Rationale.** The one-to-three widening is a detail of *this* renderer, not of
the world's geometry, and keeping it at upload leaves `MeshData` render-agnostic
— which is what lets `tests/mesher.test.ts` assert on `mesh.opaque.light` as
one number per vertex under `environment: 'node'`, with no three.js involved. It
also matches the prompt's stated format exactly, so a reviewer checking §6
against `MeshData` finds agreement rather than an argument.

**Blast radius.** `src/rendering/ChunkMesher.ts` (documented on `MeshData`);
the upload site when it is written.

**Revisit if:** coloured light is ever specified — a torch that tints its room
orange needs a hue, at which point `light` becomes 4 floats (level + rgb) or
`MeshData` gains a separate `tint`, and §6's format statement is the text that
has to move first.

### TD-028 · Atlas layout — 256² px, `slot === block id`, two face variants

**Context.** FR-038 and research R8 settle *that* there is one procedurally
generated atlas; they do not settle what a slot means, nor how a block whose two
faces differ is represented without a lookup table on the hot path.

**Decision.** A square grid of `ATLAS_TILES` × `ATLAS_TILES` = 16 × 16 slots of
`TILE_PX` = 16 px, so `ATLAS_PX` = 256 and the whole atlas is one 256 KB image.
A slot is `row * 16 + column`, and `tileSlotFor(id, face)` resolves a face's tile
against three reserved ranges:

| Slots | Contents |
|---|---|
| 0–14 | one tile per block, **`slot === block id`** |
| 16–17 | face variants: grass side, log end |
| 100–115 | item icons (T059), keyed by item id; 18–99 spare |

UVs are derived from the slot by `tileUv`, pulled in by
`UV_INSET_TEXELS = 0.25` and sampled with `NearestFilter`, no mipmaps,
`SRGBColorSpace`.

**Rationale.** `slot === block id` means the mesher needs no lookup table: a
face's tile *is* the block id unless `tileSlotFor` says otherwise, so adding a
block adds a tile for free and only a genuinely two-faced block costs an extra
slot. Grass and log are exactly that case and no more — grass's *top* keeps the
identity because slot 1 being grass is what everyone expects, so only the side
moves to 16; bark is the log's dominant face, so slot 5 stays bark and the cut
end moves to 17. The quarter-texel inset exists because `NearestFilter` at
exactly `u = (col+1) * 16 / 256` can round up into the neighbouring tile and put
a one-pixel stripe of the wrong texture down every face edge; pulling in a
quarter texel keeps all sixteen texels addressable while making the
out-of-range sample unreachable. Splitting the module into pure UV arithmetic and
lazy DOM drawing is what lets `buildRegionMesh` compute UVs in the test
environment, where `document` does not exist at all (TD-022's constraint, one
layer further along).

**Blast radius.** `src/rendering/TextureAtlas.ts` and the mesher's UV call site.
Slots 15 and 18–99 are deliberately blank, which is safe because undrawn slots
stay fully transparent.

**Revisit if:** a third block needs two faces, or item icons overflow 116 — both
are additive within the existing ranges, and neither touches `slot === id`.

### TD-029 · The atlas palette lives in `TextureAtlas.ts`, not `GameConfig`

**Context.** Constitution III requires every tunable to be declared exactly once
in `GameConfig`, and sixteen block colours are plainly values someone might want
to retune — so on the face of it the `Rgb` literals belong there.

**Decision.** The palette, the tile *kinds* and the per-slot seed derivation stay
private to `src/rendering/TextureAtlas.ts`, exported only through the functions
that consume them. `GameConfig` gains no colour entries.

**Rationale.** The distinction drawn by TD-018 applies unchanged: `GameConfig`
holds values whose retuning is a **gameplay** act — a designer turning hills up
does not invalidate a single generated byte's meaning. The palette is **content**
in the same sense the simplex gradient tables are: changing one changes what the
world *looks like*, not what it *is*, and it already has exactly one home (one
object, one file, one import path), which is what Constitution III is actually
for. `SC-012`'s original-assets audit additionally benefits from the colours
sitting next to the code that generates every pixel from them — a reviewer can
prove the pixels are computed rather than shipped in one file.

**Blast radius.** None outside `src/rendering/TextureAtlas.ts`.

**Revisit if:** a settings screen ever exposes colour controls, or `GameConfig`
is asked to enumerate everything a designer may tune — at that point the split is
a real inconsistency rather than a category distinction and should be closed in
one direction or the other.

### TD-030 · Registering a region invalidates all eight neighbours; `World.values()`

**Context.** `World.setBlock` already marks neighbouring regions dirty when a
block change crosses a border. `World.put` did nothing of the kind, and the
consequence only appears once streaming exists: a region meshed *before* its
neighbour is generated sampled that neighbour as absent, i.e. `AIR` with
skylight 15. When the neighbour later arrives with terrain, the older region's
border keeps the stale faces — mostly hidden behind the new blocks, so not
harmless but not obvious — and, visibly, the stale *light*: a sunlit strip where
a mountain now stands.

**Decision.** Two additions to `src/world/World.ts`:

1. `put(chunk)` marks **all eight** neighbours dirty after registering.
2. `values(): IterableIterator<Chunk>` exposes every resident region in
   insertion order.

**Rationale.** *Why in `put` and not in `ChunkManager`* — `put` is also how a
loaded save registers its regions, so doing it there makes the invariant a
property of registration rather than of one caller, and it is the same move
`setBlock` already makes for a single cell. *Why eight and not four* — faces only
change for the four axis neighbours, but light is computed over the 3 × 3 domain
(TD-025), so a diagonal neighbour's illumination can change too; over-marking
costs one bounded remesh, under-marking leaves a border permanently wrong. *Why
the dirty flag keeps this cheap* — it is a boolean, so generating a whole view
distance collapses to one remesh per region rather than one per arrival, well
inside `STREAMING.MAX_MESHES_PER_FRAME`.

`values()` exists because neither of the streaming layer's two questions — "what
is dirty?" and "what has drifted outside retention?" — can be answered from
outside the registry without it, and both are `ChunkManager`'s job (TD-031). It
returns the map's own iterator rather than a copy so the order is insertion
order, which is a *defined* order under Principle II; callers that mutate while
iterating snapshot first, as `ChunkManager.unload` does.

**Blast radius.** `src/world/World.ts` only. `tests/mesher.test.ts` builds
regions through `put`, so its regions become dirty on arrival — it asserts on
mesh and light bytes rather than on the flag, and stayed green.

**Revisit if:** a bulk loader wants to register a batch without per-neighbour
marking for performance reasons — then the right shape is a `putAll` that marks
once per boundary, not a weakening of `put`.

### TD-031 · `ChunkManager` exposes four phases, clamps view distance, and unloads on a square

**Context.** FR-039 states its two bounds as *"two separately stated and
separately verifiable limits"*, R12 describes one ordered tick's worth of work,
and the two descriptions have to be implemented by something a later test (T108)
can measure.

**Decision.** `src/world/ChunkManager.ts` is a class with four independent
methods rather than one entry point:

| method | cadence | bound |
|---|---|---|
| `plan(cx, cz)` | per tick | rebuilds the queue, sorted by `(distance², cx, cz)` |
| `generate()` | per tick | `STREAMING.MAX_GENERATIONS_PER_TICK` |
| `mesh()` | per frame | `STREAMING.MAX_MESHES_PER_FRAME`, nearest dirty first |
| `unload()` | per tick | evicts outside `view distance + RETENTION_MARGIN_REGIONS` |

plus three smaller rules: `setViewDistance` **clamps** into FR-034's 2–12 range
(non-finite input falls back to `VIEW_DISTANCE_DEFAULT`) rather than rejecting;
retention is **square** in region coordinates; and `unload()` is a **no-op until
`plan()` has run**.

**Rationale.** *Why four and not one `step()`* — because FR-039's whole point is
that generation is bounded *per tick* and meshing *per frame*, and a single
method called from the fixed step would make it impossible to say which of the
two bounds a given count of operations exercised. Keeping them separate lets the
game loop call `generate()` from the timestep accumulator and `mesh()` once per
rendered frame, which is also what stops the mesh budget becoming frame-rate
dependent (Principle II — no real timers, no frame-derived simulation).

*Why clamp* — the value arrives from a settings slider whose own bounds are
2–12, and a manager that refused the number the slider showed would leave the UI
reporting a view distance the world is not honouring.

*Why a square* — view distance is measured in regions in every direction, the
desired set `plan()` computes is square, and `MAX_RETAINED_REGIONS` = 729
(TD-006) is `(2 × (12 + 1) + 1)²`, the *area* of that square. A circular test
would disagree with the bound it is meant to satisfy. Note that with the
playable extent being only 16 × 16 = 256 regions, retention never binds at view
distance 12 (729 > 256); it starts firing at lower distances, e.g. view distance
6 → radius 7 → 225 cells, so an edge-adjacent focus evicts.

*Why no-op before `plan()`* — until the first `plan()` the focus is `(0, 0)` by
construction rather than by observation, and unloading against a placeholder
would evict the entire world the moment a manager was constructed.

**Blast radius.** `src/world/ChunkManager.ts` (new), consumed by `GameLoop` in a
later phase and exercised end to end by T108. It reads `World.values()` and
`World.put` from TD-030 and `buildRegionMesh` from TD-025.

**Revisit if:** the world extent ever stops being 16 × 16 — the square-retention
arithmetic and the "retention never binds at maximum view distance" observation
both depend on it, and T108's enforcement test would need to change with them.

---

### TD-032 · Physics constants: the prompt where the spec is silent, the spec where it speaks; a clear move applied whole

**Context.** Source prompt §3 fixes a column of constants and §8 fixes the
collision algorithm; `spec.md`'s *Documented Values* fixes its own set. The two
mostly agree, but not always, and a game that reads two conflicting values for
the same quantity has no reproducible behaviour to assert.

**Decision.** Where `spec.md` is silent, the prompt's value is adopted verbatim
into `src/core/GameConfig.ts`:

| constant | value | why this source |
|---|---|---|
| `PLAYER.WIDTH` / `HALF_WIDTH` | 0.6 / 0.3 | prompt §3; spec never sizes the body |
| `PLAYER.HEIGHT` / `EYE_HEIGHT` | 1.8 / 1.62 | prompt §3; FR-010 needs an eye height |
| `PLAYER.WALK_SPEED` / `SPRINT_SPEED` | 4.3 / 5.6 | prompt §3; spec gives 40% swim *ratio*, not absolute speeds |
| `PHYSICS.TERMINAL_VELOCITY` | 78 | prompt §3; spec sets no fall cap |
| `PHYSICS.MAX_SUBSTEP` | 0.25 | prompt §8's per-substep displacement cap |
| `PHYSICS.CONTACT_EPSILON` | 1e-4 | prompt §8's grounding probe distance |

Where the two **disagree**, the spec wins — the same precedence that already put
jump velocity at 10 rather than the prompt's 9 and max health at 10 rather than
20:

| constant | spec | prompt | taken |
|---|---|---|---|
| `PHYSICS.STEP_UP_HEIGHT` | **1 block** | 0.6 (`STEP_HEIGHT`) | **1** |

One block is what *Documented Values*, `GameConfig` and T043 all say, and it is
the value the "small ledges need no jump" claim in FR-007 depends on; 0.6 would
have made full blocks unsteppable.

**Three consequent choices.**

1. **No acceleration or friction model.** The prompt's `GROUND_ACCEL`,
   `AIR_ACCEL` and `GROUND_FRICTION` are deliberately *not* adopted. `spec.md`
   describes walking, sprinting and swimming as speeds and never mentions a rate
   of change, so an added ramp would be an invented rule rather than a
   documented one. It would also make every positional assertion in
   `tests/collision.test.ts` an approximation: the jump-apex test is written
   with **no tolerance** and derives its expectation from the documented
   integration scheme, which only stays exact if horizontal velocity is what the
   intent says it is.

2. **An unobstructed displacement is applied as one addition; substeps are used
   only where contact has to be located.** Clearance is tested once over the
   swept **union** of the start and end boxes. If that whole range is clear, the
   position moves by a single addition — bit-identical to the documented Euler
   sequence, which is exactly what the no-tolerance apex assertion requires.
   Subdividing a clear move would reach the same distance through a different
   sequence of floating-point additions and diverge in the last bits. Where the
   union *is* obstructed, the sweep is walked in steps of at most `MAX_SUBSTEP`,
   so a fall at terminal velocity (78 b/s × 0.05 s = 3.9 blocks per tick) cannot
   step over a one-block wall between two contact tests, and the blocking cell's
   face is then solved for exactly rather than approximated. Touching is not
   overlapping — every contact test is strict — which is what makes
   "stops at `y = floor`" an exact equality instead of an epsilon.

3. **Swim-up composes from the two documented numbers.** In water, holding the
   jump binding sets `vy = JUMP_VELOCITY × SWIM_SPEED_FACTOR` and horizontal
   speed is scaled by the same `0.4`. Space is bound to "Jump / swim up" in
   `contracts/input-bindings.md`, there is no ground to push off underwater, and
   the spec states no separate swim-up velocity — so deriving it from the two
   values the spec *does* state keeps it out of the realm of invented numbers.

**Rationale.** The whole point of a *deterministic* sandbox is that one tick over
one world always produces the same position. Every choice above is a refusal to
add a rule the specification did not state, or a refusal to compute a documented
rule in a way that loses exactness.

**Blast radius.** `src/core/GameConfig.ts` (`PLAYER`, `PHYSICS`),
`src/player/Collision.ts`, `src/player/Physics.ts`, and every assertion in
`tests/collision.test.ts`.

**Revisit if:** a later phase introduces acceleration — the horizontal path in
`applyHorizontal` is the single place velocity is written from intent, and the
apex test would need its no-tolerance assertion re-examined only if the *vertical*
scheme changed, not if a ramp is added horizontally.

---

### TD-033 · Composition-root wiring: noon at boot, spawn facing the world, look on the tick, `ui.*` past the pause gate

**Context.** Four decisions fell to `src/main.ts` and `src/input/InputManager.ts`
because no specification text covers them, and each has a wrong answer that
compiles cleanly.

**Decision.**

1. **Boot lighting is the noon row of `LIGHTING_KEYFRAMES`.** FR-027's
   *interpolation* is a later phase (`rendering/Sky.ts`), but the keyframes
   themselves already exist in `GameConfig`, and `Renderer.applyLighting` was
   already written to take them. Calling it once with the `noon` row at boot
   means the game opens in daylight instead of against the clear colour's default
   black — which reads as a renderer that failed rather than a sky cycle that has
   not arrived. Reading the row rather than a literal keeps one source of
   configuration (Constitution III), and the handover is clean: `Sky.ts` calls
   the same method per tick with interpolated values in place of this one fixed
   call.

2. **Spawn faces the world's centre.** `data-model.md` §2 fixes the spawn
   *position* — column `(0, 0)` — and says nothing about heading. Because the
   playable extent is a finite 16 × 16-region grid, `(0, 0)` is a **corner**, and
   `Player`'s default yaw 0 faces −Z: off the edge of the map. The first frame
   would contain only sky. The heading is computed with one `atan2` toward the
   centre rather than hardcoded, because the spiral spawn rule of T094 can walk
   outward from `(0, 0)` before it finds a non-water surface, and the direction
   that counts as "inward" moves with it.

3. **Mouse look is consumed on the tick, not on the frame.** `player.yaw` and
   `player.pitch` are aim state: the FR-010 raycast reads them to decide which
   cell a break or place targets. Sampling look at frame rate would make block
   targeting depend on frame timing, so Principle II keeps it in `onTick` —
   events accumulate between ticks and are applied once, which is also why the
   camera's view updates at 20 Hz like everything else the simulation owns.

4. **`ui.*` actions pass the pause gate; gameplay actions do not.** The input
   contract's invariant 5 says key events never reach *the world* while paused,
   and `InputManager` enforces that — but a blanket return on `#paused` also
   swallowed Escape, so the press that opened the pause screen could never
   dismiss it (FR-032's `paused[pause]` → `playing`). Dropping gameplay actions
   wholesale while letting the `ui.` prefix through satisfies the invariant
   literally and leaves the pause screen reachable. Held gameplay inputs are
   still cleared by `markPaused()`, so nothing leaks into the world on resume.

**Rationale.** Each of these is invisible in review and obvious in use: a black
first frame, a camera facing nothing, aim that varies with frame rate, or a
player permanently stuck behind a pause overlay that does not exist yet.

**Blast radius.** `src/main.ts`, `src/input/InputManager.ts`. Items 1 and 2 are
superseded in place — item 1 by `Sky.ts` and item 2 by T094's spiral spawn rule
— without either later task needing to undo them.

**Revisit if:** spawn ever starts at a column where "toward the centre" is a
degenerate direction, or if a later phase decides aim must be frame-accurate for
responsiveness (which would require re-deriving the raycast so it does not feed
frame timing back into the simulation).
