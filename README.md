# Voxel Realms

A deterministic, browser-playable first-person voxel sandbox: procedurally
generated biomes, break/place interaction, inventory and crafting progression, a
day-night cycle, one neutral creature, and named save slots — every world
reproducible byte-for-byte from its seed.

**Single-player. Offline. Desktop browser only. No network calls.**

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20 or newer (`engines.node` is `>=20`; developed on v24.11.0) |
| npm | 11 or newer |

## Commands

```sh
npm ci            # install exactly what package-lock.json pins
npm run typecheck # tsc --noEmit — 0 errors
npm test          # vitest — 12 deterministic suites, no real timers
npm run build     # vite build -> dist/
npm run preview   # serve dist/ locally
```

The constitution requires `npm run typecheck && npm test && npm run build` to run
in that order after every source phase.

## Project layout

```text
index.html        application shell
src/              twelve domain modules (core, rendering, world, player,
                  inventory, crafting, entities, ui, persistence, audio,
                  input, utils)
tests/            the twelve required deterministic suites
docs/             architecture, design, controls, decisions, status, audit
specs/            the Spec Kit artifacts this implementation is built against
```

## Design artifacts

| Document | Purpose |
|---|---|
| `specs/001-voxel-realms-game/spec.md` | Requirements — 46 FRs, 14 SCs, 7 stories |
| `specs/001-voxel-realms-game/plan.md` | Implementation plan and constitution check |
| `specs/001-voxel-realms-game/quickstart.md` | 10-step manual walkthrough and acceptance evidence |
| `docs/ARCHITECTURE.md` | How the subsystems fit together |
| `docs/GAME_DESIGN.md` | Normative recipes and biomes |
| `docs/CONTROLS.md` | Normative default key bindings |
| `docs/TECHNICAL_DECISIONS.md` | Open choices the specification left undecided |
| `docs/IMPLEMENTATION_STATUS.md` | Per-phase verification record |

## Acceptance

Follow [`specs/001-voxel-realms-game/quickstart.md`](./specs/001-voxel-realms-game/quickstart.md).
Section §4 is the playable walkthrough; §5 holds the 14-row success-criteria
matrix; §7 states the required test outcome:

```text
12 suites | all passing | 0 failing | no real timers used
```
