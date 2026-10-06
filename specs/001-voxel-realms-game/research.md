# Phase 0 — Research: Voxel Realms

**Feature**: `specs/001-voxel-realms-game` | **Branch**: `001-voxel-realms-game`
**Date**: 2026-10-04

Purpose: resolve every `NEEDS CLARIFICATION` raised in
[plan.md](./plan.md) Technical Context, plus the dependency and integration
patterns the plan depends on. Each entry records the decision actually adopted.

## Resolution of Technical Context unknowns

| # | Technical Context unknown | Resolved in |
|---|---|---|
| NC-1 | IndexedDB does not exist in the Node test environment; persistence test strategy unresolved | R1 |
| NC-2 | Headless browser availability for spec §14 "Game Launch" acceptance unknown | R2 |
| NC-3 | Supported browser/OS matrix and minimum window size unspecified | R3 |

All three are resolved below. No `NEEDS CLARIFICATION` remains in the plan.

---

## R1 — Testing persistence without a real IndexedDB

**Decision**: Put all IndexedDB access behind `src/persistence/SaveService.ts`
exposing five operations — `saveWorld`, `loadWorld`, `hasSave`, `deleteSave`,
`listWorlds`. Tests target a synchronous in-memory double implementing that same
surface, and the canonical record is serialised/deserialised by pure functions in
`Integrity.ts` that are tested directly against real byte fixtures.

**Rationale**: Resolves NC-1. Vitest runs in a Node environment where
`indexedDB` is undefined, so any test that reached for it would fail for
environmental rather than behavioural reasons. Splitting *record shape*
(pure, fully testable) from *storage transport* (thin, environment-bound) keeps
the 11th required test suite — serialize → deserialize equals input, corrupt data
handled without throwing — genuinely runnable.

**Alternatives considered**:
- *`fake-indexeddb` polyfill as a dev dependency* — rejected: Constitution IV
  pins dev dependencies to exactly `typescript`, `vite`, `vitest`,
  `@types/three`; adding one would violate Principle IV.
- *Skip persistence testing* — rejected: spec §13 test 11 is mandatory and
  SC-007 requires 100% exact restore.
- *Replace IndexedDB with `localStorage`* — rejected: world records include
  nested block-modification maps that exceed practical `localStorage` quota.

## R2 — How spec §14 "Game Launch" gets verified

**Decision**: Implement acceptance in three tiers, each recorded verbatim in
`docs/IMPLEMENTATION_STATUS.md`:
1. `npm ci`, `npm run typecheck`, `npm run test`, `npm run build` — always run,
   output pasted.
2. `npm run preview` opened manually in a browser — the scripted menu → New World
   → move → break → place → craft → save → reload → load walkthrough with console
   output pasted.
3. If no headless browser is available in the environment, tier 2 is performed
   manually and the checklist entry is written as `UNVERIFIED` where it cannot be
   observed, never as `PASS`.

**Rationale**: Resolves NC-2. The spec itself mandates this fallback ("If a
headless browser is unavailable, verify by running type checks, tests and build,
and mark 'Game Launch' as UNVERIFIED instead of PASS"), and Constitution
Development Workflow requires PASS only for executed, observed commands. Tiering
makes the rule operational rather than aspirational.

**Alternatives considered**:
- *Add Playwright/Puppeteer* — rejected: violates Constitution IV dependency
  pinning, and the spec already defines the fallback.
- *Mark the launch check PASS by reasoning* — rejected: explicit constitutional
  violation (G11).

## R3 — Browser and operating-system support matrix

**Decision**: Target current stable desktop browsers on Windows, macOS and Linux
— Chromium-based (Chrome, Edge), Firefox, and WebKit (Safari) — at a minimum
window of **1280×720**, with settings scaling down to 1024×768. Mouse + keyboard
only. Any feature relying on an API missing from one of those engines is either
feature-detected or removed.

**Rationale**: Resolves NC-3. The spec requires pointer capture, Pointer Lock,
visibility handling, IndexedDB and WebAudio — all broadly available in those
three engines. Spec Assumptions already exclude touch and gamepad, and SC-003's
frame-rate floor is measured on the reference machine defined during
clarification, so a wide matrix does not multiply test cost.

**Alternatives considered**:
- *Chromium only* — rejected: the spec never limits the platform, and Firefox
  and Safari hold meaningful desktop share; a single-engine target would make
  SC-003 unrepresentative.
- *Mobile/tablet* — rejected: spec Assumption "Desktop play only."
- *IE or legacy Edge* — rejected: no `Uint8Array`-era feature parity, no
  Pointer Lock, no IndexedDB guarantees.

## R4 — Cross-engine floating-point determinism

**Decision**: Restrict generated-terrain maths to operations whose result
ECMAScript pins exactly: IEEE-754 binary64 `+ - * /`, `Math.imul`, bit shifts,
comparisons, and `Math.floor` on values in safe range. Keep the whole terrain
path inside `generateChunk` on integer/fixed constants. Permit `Math.sin` /
`Math.cos` **only** for sky angle and creature idle bob — rendering and
cosmetic motion, never for a value that reaches block data. Express day-night
lighting by linear interpolation between explicit keyframe numbers rather than
by trigonometric curves.

**Rationale**: SC-002 demands byte-identical terrain across runs and restarts.
ECMAScript does not constrain the last bit of `Math.sin`/`Math.pow` across
engines, so leaving trigonometry inside the generation path would make the golden
hash engine-dependent. Restricting it makes determinism structural rather than
something we hope holds.

**Alternatives considered**:
- *Fixed-point / integer-only maths throughout* — rejected: simplex noise is
  conventionally float-based and rewriting it in fixed point adds risk for no
  additional guarantee, since float `+ - *` are already exactly specified.
- *Trust that engines agree* — rejected: this is precisely the class of bug the
  golden-hash test exists to catch, and it would fail late and confusingly.

## R5 — Worker threads: adopt or not

**Decision**: Do **not** adopt workers in the initial 16 phases. Keep generation
and meshing on the main thread and rely on the mandated budgets — at most 2
chunk generations per tick and 2 chunk meshes per frame. If SC-003 fails on the
reference machine during the optimisation phase, introduce workers as a
contained change under `src/world/ChunkManager.ts` with results applied in queue
order.

**Rationale**: The source marks workers optional and forbids reordering applied
results; the spec's SC-003 can be measured before any worker exists. Deferring
keeps determinism easy to reason about — a single call stack is far simpler to
keep order-independent than a message pipeline.

**Alternatives considered**:
- *Workers from phase 1* — rejected: speculative complexity before measurement;
  a determinism regression would be far harder to isolate.
- *Async generation with out-of-order application* — rejected: violates the
  source's queue-order rule and would break SC-002/SC-011.

## R6 — Golden-hash algorithm and constant workflow

**Decision**: Hash the 32,768-byte block array of `generateChunk(123456789, 0, 0)`
with the same FNV-1a `hash32` used everywhere else, accumulated over 32-bit
words in defined order, producing one unsigned 32-bit constant. Generate it once
after generation is correct, commit it as `tests/fixtures/golden-hash.ts`, and
let the test fail on any drift.

**Rationale**: Spec §13 test 3 requires "a constant committed to the repo (generate
once, commit, and fail the test if the algorithm changes without updating it)".
Reusing `hash32` means one hash implementation to trust instead of two, and the
constant is small enough to review by eye in a diff.

**Alternatives considered**:
- *SHA-256 via WebCrypto* — rejected: async, unavailable synchronously in the
  Node test path without extra dependencies (Constitution IV).
- *Store the full byte array as fixture* — rejected: 32 KB of opaque fixture
  gives worse diff signal than one number.
- *Regenerate the constant automatically on test run* — rejected: would make the
  test incapable of failing, defeating its purpose.

## R7 — Pointer capture, focus loss and pausing

**Decision**: `InputManager` requests Pointer Lock on canvas click, listens for
`pointerlockchange` and `visibilitychange`, and on either loss sets game state
to `paused`, shows the pause overlay, and requires an explicit player action to
resume. Lock refusal is caught and surfaced as a message with a retry affordance.

**Rationale**: FR-009 and FR-037 require auto-pause on refusal or focus loss and
resume only on player action; US7 scenario 3 is the acceptance path. Handling
both events through one state transition avoids two divergent pause paths.

**Alternatives considered**:
- *Pause only on `visibilitychange`* — rejected: leaves an unfocused-but-visible
  window running unseen.
- *Silently re-request lock on click without messaging* — rejected: FR-037
  requires documented behaviour on refusal.

## R8 — Procedural texture atlas

**Decision**: At startup, draw every 16×16 tile onto a single offscreen 2D
canvas using only seeded `mulberry32` streams (salt `TEXTURE`), upload it once
as a texture, and index tiles by block ID. No image files are ever fetched.

**Rationale**: FR-020 (item icons) and FR-036 (audio) share this constraint, and
Constitution Technical Constraints require original, runtime-generated assets.
A single atlas means one material and one bind for the whole world.

**Alternatives considered**:
- *Base64-embedded PNG assets* — rejected: they are binary assets shipped with
  the product, and provenance would be unverifiable against SC-012.
- *Per-block textures* — rejected: multiplies draw calls and breaks SC-003.

## R9 — Interface technology

**Decision**: Build every screen as plain TypeScript manipulating DOM nodes
created from `index.html` templates, styled by hand-written CSS. No UI framework.
The canvas for the 3D view is separate from the DOM overlay layers.

**Rationale**: Constitution IV forbids additional runtime dependencies, and the
spec mandates "plain TS + DOM/CSS". Menus are few, state is simple, and a
framework would add bundle weight against SC-001's 30-second cold-start budget.

**Alternatives considered**:
- *React/Preact/Svelte* — rejected by Constitution IV and the spec.
- *Canvas-drawn 2D UI* — rejected: loses free accessibility affordances that
  FR-041 depends on (focus, keyboard remapping, scalable text).

## R10 — Detecting a failed save write (FR-022, SC-013)

**Decision**: Every write is awaited and its completion checked; `QuotaExceededError`,
`AbortError` and `UnknownError` are treated as failures. On failure the service
sets an observable `lastWriteFailed` flag, the HUD shows a persistent notice, and
the flag clears only when a later write completes. No success toast is emitted
unless the write settled successfully.

**Rationale**: The clarification session fixed exactly this behaviour, and
SC-013 requires 100% of failed writes to be surfaced as failures with the notice
clearing within one successful save. Awaiting the request is the only way to
know the outcome.

**Alternatives considered**:
- *Fire-and-forget writes* — rejected: makes SC-013 unobservable.
- *Only handle quota errors* — rejected: permission and abort failures produce
  the same silent-progress-loss outcome the spec calls the worst failure mode.

## R11 — Concurrent-open guard (FR-023)

**Decision**: Before entering play, acquire a Web Lock named
`voxel-realms:<world-name>` via the Web Locks API with `ifAvailable: true`. If
the lock cannot be acquired, refuse entry with "This world is already open in
another session" and return to the main menu. Release it on pause-to-menu,
save-and-exit, and `pagehide`.

**Rationale**: The clarification answer requires blocking the second open rather
than last-write-wins or merging. A lock held for the session's lifetime gives an
exact, cheap match for "already open elsewhere" and cannot silently expire the
way a timestamp lease would.

**Alternatives considered**:
- *Timestamp lease in the save record* — rejected: a crashed session would leave
  a stale lease that locks the player out of their own world.
- *Last-write-wins* — explicitly rejected by the clarification answer.
- *Merge on save* — explicitly rejected by the clarification answer.

## R12 — Chunk streaming, dirty marking and disposal

**Decision**: Each tick: compute the desired set for the configured view
distance, enqueue missing regions sorted by `(distance², cx, cz)`, generate at
most `MAX_CHUNK_GENS_PER_TICK`, mesh at most `MAX_CHUNK_MESHES_PER_FRAME`
nearest-dirty-first, then unload anything beyond view distance + 2 — disposing
GPU buffers while retaining the region's `modified` map so player edits survive
re-entry. A block edit at local x or z equal to 0 or 15 also dirties the
neighbouring region.

**Rationale**: Directly implements FR-014, FR-039 and SC-011, and Constitution
Principle II requires defined iteration order plus bounded per-step work.
Retaining `modified` separately from the generated array is what makes edits
persist across unload without storing whole regions.

**Alternatives considered**:
- *Unload without disposal* — rejected: GPU memory growth would break SC-003.
- *Re-run generation to restore an unloaded region* — rejected: would discard
  player edits.
- *Process the whole queue per tick* — rejected: unbounded work contradicts
  Principle II and risks freezes over 250 ms.

## R13 — Audio synthesis

**Decision**: Generate short percussive and tonal buffers with `AudioContext` at
runtime — filtered noise bursts for break/place, a short decaying sine for craft
and pick-up — routed through master, effects and music gain nodes driven by the
three volume settings.

**Rationale**: FR-036 forbids loading audio files; Constitution Technical
Constraints require original content. Gain-node routing is what makes the three
independent volume controls in FR-034 real rather than cosmetic.

**Alternatives considered**:
- *Shipping sample files* — rejected by FR-036 and SC-012.
- *System notification sounds* — rejected: not original, not controllable.

**Extended by clarification session 3.** The audible set is now **closed at six
effects** — block broken, block placed, item crafted, hotbar slot changed, menu
selection, failed save reported (FR-022) — plus **one looping ambient track**.
The six effects are exactly the short buffers described above. The music loop is
a slowly evolving pad rendered once into a seamless buffer at startup and then
looped through the music gain node, so once playing it is schedule-only: it
reads no clock, allocates nothing per frame, and cannot feed wall-clock time
into anything the simulation observes (Principle I).

## R14 — Fixed-timestep accumulator

**Decision**: `GameLoop` accumulates real elapsed time, drains it in exact
`TICK_DT = 0.05` steps, caps accumulated time after a long stall so the game
never attempts an unbounded catch-up burst, and passes the leftover fraction to
rendering purely as an interpolation alpha. Nothing downstream reads wall-clock
time.

**Rationale**: Constitution Principle II mandates 20 ticks/s with rendering
interpolating; Principle I forbids wall-clock reads in gameplay code. The stall
cap is what prevents a backgrounded tab from triggering thousands of ticks on
resume, which would otherwise blow the per-tick budget and freeze input.

**Alternatives considered**:
- *Variable timestep tied to frame rate* — rejected: would make physics and
  SC-002's reproducibility frame-rate-dependent.
- *Uncapped accumulator* — rejected: a resumed tab would stall for seconds.
- *Timestep clamped to a single tick maximum* — rejected: slows the game
  permanently on a struggling machine instead of recovering once.

## R15 — Source contradiction: wooden pickaxe vs wooden axe ingredients

**Decision**: `recipe.wooden_pickaxe` = **2 PLANK + 2 STICK**;
`recipe.wooden_axe` = **3 PLANK + 2 STICK**.

**Rationale**: The source document lists both wooden tools as `3 PLANK + 2 STICK`
while simultaneously instructing that pickaxe and axe be "disambiguated by
distinct ingredient counts." Shapeless matching keys on the ingredient multiset
alone, so two recipes sharing a multiset would both match at once and the
crafting panel could not show a single unambiguous output — the source's stated
intent would be unachievable.

The source is also internally inconsistent: stone and iron pickaxes use **2**
heads while their axes use 3, but the wooden pickaxe is printed as 3. Adopting
2 planks for the wooden pickaxe satisfies the distinct-count rule, makes all
three tiers follow one pattern (pickaxe = 2, axe = 3), and is the majority
reading of the source.

Recorded here rather than escalated because the contradiction has a dominant
resolution; it is surfaced explicitly so it can be reviewed at
`/speckit.tasks` rather than discovered mid-implementation.

**Alternatives considered**:
- *Follow the literal `3 PLANK` for both* — rejected: makes pickaxe and axe
  indistinguishable, breaking shapeless matching entirely.
- *Give the axe 2 planks instead* — rejected: contradicts stone and iron, where
  the axe is consistently the 3-head recipe.
- *Introduce positional/shapeless-hybrid crafting to disambiguate* — rejected:
  adds a second matching mode for one collision, and the source specifies
  shapeless.
- *Escalate as a spec clarification blocker* — rejected: a clear majority reading
  exists and the plan can proceed; noted for review instead.

## R16 — Saving when the page becomes hidden (FR-022)

**Decision**: Listen for `visibilitychange` and issue a save the moment
`document.visibilityState` becomes `hidden`, awaiting the write inside the
handler. Issue a second, best-effort save from `pagehide`. Do **not** rely on
`beforeunload`, which cannot delay or guarantee an asynchronous IndexedDB
transaction. The 60-second interval and save-on-pause remain the backstops.

**Rationale**: Resolves the reliability gap opened by clarification Q2 — the
answer was "nothing is lost." `visibilitychange → hidden` fires on tab switch,
window minimise and OS-level app switch, and browsers give async work started in
that handler a real chance to commit; `pagehide` is a last gasp and cannot be
made reliable on its own. R7 already pauses on this same event, so the save and
the pause ride one handler rather than two competing ones.

**Alternatives considered**:
- *Only a `beforeunload` save* — rejected: it cannot await an IndexedDB
  transaction, so it could report success for a write that never committed —
  precisely the failure SC-013 forbids.
- *Rely on the 60-second interval alone* — rejected: up to 60 s of building lost,
  contradicting the clarification answer.
- *Tighten the interval to 10 s as the primary mechanism* — rejected: it adds
  write traffic during play to compensate for a case it still cannot cover
  (immediate close), and it does nothing for tab switches.
- *`navigator.sendBeacon`* — rejected: there is no server; worlds are local by
  the single-player assumption.

---

## R17 — Deterministic block lighting (FR-044)

**Decision**: store illumination as a per-region `Uint8Array` of light levels
(0–15) beside `blocks`, produced by **two monotone flood fills** run whenever the
region or a border-adjacent region is marked dirty under FR-014:

1. **Skylight** — seeded at 15 for every cell open to the sky above the top
   layer, then propagated down and sideways through non-opaque cells, losing
   exactly 1 per cell.
2. **Block light** — seeded at each emitter (torch = 14) and propagated the same
   way, losing exactly 1 per cell.

A cell's illumination is `max(sky, block)`. Propagation accepts a new level only
when it is **strictly greater** than the level already recorded.

**Rationale**: that strict-greater rule makes the result the well-defined
maximum over all paths, so it is **independent of visit order** — which is what
lets a flood fill satisfy FR-044's determinism clause and Principle I at the
same time, rather than being an exception to them. The fill is O(cells) over a
fixed 32 768-cell region and runs only on dirty regions, so it rides the
existing remesh path instead of adding a scheduling step (G4's per-frame bound).
Light levels are a pure function of block data only; the day-night intensity
multiplier is applied at render time from the tick (FR-027), so nothing
lighting-related is persisted and the save record is unchanged (G7).

**Alternatives considered**:
- *Voxel-cone tracing or ray-marched shadows* — rejected: overkill for one light
  source class and the most likely way to miss SC-003 on an integrated GPU.
- *Per-vertex ambient occlusion alone* — rejected: gives no cave darkness and no
  torch light, so it would not satisfy FR-044 at all.
- *Persisting the light array in the save record* — rejected: it is derived data
  (FR-044 makes it a pure function of blocks), and storing it would both bloat
  the record and let a stale light level survive a load.
- *Recalculating light for every region every frame* — rejected: unbounded work
  that directly threatens SC-003.

## R18 — Particles as pure presentation (FR-045)

**Decision**: a fixed-capacity ring buffer of instanced quads owned by
`Renderer.ts`, capped at 256 live particles. Each particle's spawn position,
initial velocity and lifetime are derived from `hash32(eventKind, tick, index)`
— no `Math.random()`, no `Date.now()` — and lifetimes are counted in simulation
ticks, not seconds.

**Rationale**: FR-045 requires particles to be a pure function of the triggering
event and the tick. Deriving them from the tick keeps Principle I satisfied even
though particle code lives in rendering, where the principle's letter would not
reach, and it makes "the same break produces the same debris" assertable in a
vitest suite instead of unverifiable by construction. Tick-counted lifetimes
also mean a particle cannot outlive or outpace the simulation it decorates, and
because particles are never read by world or creature code they cannot become a
source of divergence (FR-005).

**Alternatives considered**:
- *`Math.random()` for scatter* — rejected by FR-045's purity clause; it would
  also make any future replay or screenshot comparison meaningless.
- *GPU-side particle simulation* — rejected: untestable from vitest and invisible
  to the determinism argument.
- *Persisting particles in the save record* — rejected: FR-045 says presentation
  only, and they are exactly the kind of transient state FR-021 excludes.

---

## Summary

| Item | Outcome |
|---|---|
| `NEEDS CLARIFICATION` in plan Technical Context | **3 raised → 3 resolved** (NC-1 → R1, NC-2 → R2, NC-3 → R3) |
| Dependency best practices | three.js meshing/disposal (R8, R12), Vite single-page build (R9), vitest determinism (R1, R4) |
| Integration patterns | Pointer Lock + visibility pause (R7), save-on-hidden (R16), IndexedDB (R1), Web Locks (R11), WebAudio (R13), block-light flood fill (R17), tick-derived particles (R18) |
| Constitution risks found | Trigonometry inside generation would break Principle I / SC-002 → bounded by **R4**; extra test dependency would break Principle IV → avoided by **R1**; a `beforeunload` save could false-report success under SC-013 → avoided by **R16** |
| Clarification deltas (session 2) | Inventory pause → R7 state machine, FR-032 · save-on-hidden → **R16** · creature reconstruction → R12 unload model, record sheds a field · world geometry 16×16×128 → matches R6's 32,768-block region · first-run hint → FR-043, no research needed |
| Clarification deltas (session 3) | block lighting → **R17** (new FR-044) · particles → **R18** (new FR-045) · closed six-effect set + music loop → **R13** extended · shadows setting removed → scope cut, no research needed · inventory/Escape state edge → FR-032 + `data-model.md` §11, no research needed · view distance naming → terminology normalization, no research needed |
| Open items for implementation | None blocking. Worker adoption (R5) is explicitly deferred until SC-003 is measured. |
