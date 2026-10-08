# Architecture — Voxel Realms

How the subsystems fit together. Normative requirements live in
`specs/001-voxel-realms-game/spec.md`; this document describes the shape of the
code that satisfies them. It is finalised to describe the code **as actually
shipped** at Phase 16 (task T118).

## Shape

A single-project single-page web application at the repository root. One runtime
dependency (`three`), plain DOM/CSS for the interface, no UI framework, no
backend, no network. Twelve domain modules under `src/`, twelve deterministic
suites under `tests/`.

```text
            ┌─────────────────────────────────────────────┐
            │              src/core                       │
            │  GameLoop · GameState · GameConfig · Logger  │
            └───────┬──────────────────────────┬──────────┘
                    │ fixed 20 ticks/s         │ single config source
        ┌───────────▼───────────┐    ┌─────────▼──────────────────────┐
        │      simulation        │    │          rendering             │
        │  world  player         │    │  Renderer · Camera · lighting  │
        │  inventory crafting    │    │  interpolates between ticks    │
        │  entities              │    └────────────────────────────────┘
        └───────────┬───────────┘
                    │ canonical records
        ┌───────────▼───────────┐    ┌────────────────────────────────┐
        │     persistence        │    │        input · audio · ui       │
        │  IndexedDB · settings  │    │  menus, HUD, overlays, synth    │
        └────────────────────────┘    └────────────────────────────────┘
```

## Fixed-timestep simulation

`src/core/GameLoop.ts` runs an accumulator at **exactly 20 ticks per second**
(one tick = 0.05 s of game time). `dt` derived from the tick is the sole time
input to the simulation; rendering interpolates between the previous and current
tick so motion is smooth without the simulation ever reading wall-clock time.

Elapsed game time is counted **in simulation ticks**. Auto-save (60 s of game
time), the day-night cycle (600 s), creature lifetimes and particle lifetimes all
derive from that counter — never from `performance.now()`.

## Deterministic world generation

`generateChunk(seed, cx, cz)` is a **pure function**: no other chunk, no
module-level state, no clock, no randomness beyond the streams derived from the
seed. One mulberry32 PRNG is seeded from `hash32(seed, cx, cz)` with a separate
derived stream per consumer, so changing one feature cannot perturb another.

Regions are 16 × 16 blocks across the full 128-block height — 32,768 blocks per
region — indexed `(y * D + z) * W + x`.

## Streaming and budgets

Regions are generated and meshed under hard budgets so the frame rate holds:
**at most 2 region generations per tick** and **at most 2 region meshes per
frame**, retaining view distance plus one region of margin. Per-face culling
produces opaque and transparent meshes; light is a monotone flood fill that
gives the same answer regardless of the order cells are visited.

## Physics

Axis-separated AABB collision — resolve **Y, then X, then Z** — so the player
lands before anything horizontal is considered, then slides along walls and
steps up single-block ledges. Y first is what lets a fall and a stride in the
same tick settle onto the ground before the stride is applied; X before Z fixes
the tie-break when both are blocked together, so the outcome never depends on
the order a caller listed its axes in. Jumping uses semi-implicit (symplectic)
Euler stepped at the tick rate: velocity updated from gravity first, then
position from the updated velocity, exactly once per tick. That makes the jump
apex a single reproducible value asserted with no tolerance.

## Persistence

IndexedDB database `voxel-realms`, store `worlds`, keyed by world name, written
in a **fixed canonical key order** with integers wherever the value permits and
an explicit `version`. Creature state is never stored — it is regenerated from
`seed` + `tick` on load. Settings live separately in `localStorage` under
`voxelrealms.settings.v1` so deleting a world never discards them.

A write whose promise rejected is never reported as success.

## Interface

Plain DOM/CSS. `src/ui/*.ts` owns main menu, HUD, pause menu, inventory,
settings, controls, debug overlay and the first-run hint. Pointer capture is
required to play: if it is refused, the game shows the pause overlay naming the
refusal plus a retry affordance and stays paused — it never runs without
pointer capture.

## Module boundary rule

Module boundaries follow the **domain** (world / player / inventory / crafting /
entities) rather than technical layers. This keeps `generateChunk.ts` provably
free of rendering and persistence imports — the property Constitution Principle I
(Deterministic Purity) depends on.

## Single source of configuration

Every tunable — tick rate, world height, sea level, gravity, jump velocity,
light levels, view distance, FOV, sensitivity, volumes — lives **once** in
`src/core/GameConfig.ts`. No gameplay module hard-codes a numeric literal; the
Phase 16 review gate (quickstart §6) enforces it.
