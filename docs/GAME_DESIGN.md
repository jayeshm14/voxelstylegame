# Game Design — Voxel Realms

Normative shipping document. Per `spec.md` §*Normative shipping documents*, the
**recipe** and **biome** tables below are reproduced **verbatim** from the
specification and are authoritative for the implementation. If this document and
the specification ever disagree, the specification is correct and this file must
be brought back into line.

## Recipes

FR-017 — a fixed list of 10 shapeless recipes, each identified by a stable
unique key; quantities are exact:

| Output | Ingredients |
|---|---|
| 4 Plank | 1 Wood |
| 4 Stick | 2 Plank |
| Wooden Pickaxe | 2 Plank + 2 Stick |
| Wooden Axe | 3 Plank + 2 Stick |
| Stone Pickaxe | 2 Stone + 2 Stick |
| Stone Axe | 3 Stone + 2 Stick |
| Iron Pickaxe | 2 Iron + 2 Stick |
| Iron Axe | 3 Iron + 2 Stick |
| 1 Glass | 1 Sand |
| 4 Torch | 1 Coal + 1 Stick |

Every recipe has a distinct ingredient multiset, because matching is by multiset
alone; this is what keeps the pickaxe and the axe of each tier unambiguous.

Shapeless means slot order never matters. Crafting consumes ingredients in
**ascending inventory slot index, slot 0 first**, so a craft spanning several
partial stacks always resolves identically.

## Biomes

FR-002 — evaluated in order, **first match wins**:

| Order | Biome | Condition |
|---|---|---|
| 1 | Snow | local temperature below −0.45 |
| 2 | Desert | temperature above 0.40 **and** moisture below 0 |
| 3 | Mountain | mountain mask above 0.35 |
| 4 | Forest | moisture above 0.15 |
| 5 | Plains | otherwise |

## Blocks

Fifteen block ids, 0–14. `AIR = 0`, `WATER = 7`, `SNOW = 13`, `TORCH = 14`.
Each block carries `hardness ≥ 0`, `solid`, `transparent`, `toolClass`,
`minTier` (0–2) and `drops`; the full table is the registry defined in
`data-model.md` §4 and implemented in `src/world/BlockRegistry.ts`. `TORCH` is
appended for FR-044 — it is the light-emitting block the spec refers to — and is
recorded in TD-023.

## Items and stacking

Ten item types. Every inventory slot holds at most **64** items
(`spec.md` Documented Values → *Stack maximum*).

## Tools

Three tiers — wooden, stone, iron. A block whose `minTier` exceeds the held
tool's tier does not drop. Break time is a function of `(tool, block)` and is
tabulated in `tests/tools.test.ts`.

## World

| Property | Value |
|---|---|
| World size | 16 × 16 regions, 128 blocks tall (y = 0…127) |
| Sea level | y = 40 — terrain at or below fills with water, beaches form above |
| Day length | 600 seconds of game time, sunrise to sunrise |
| Health maximum | 10 |
| Light | 0–15 per cell; a cell reads the greater of its skylight and block light |

### Lighting keyframes

FR-027, interpolated linearly between adjacent rows and repeating from midnight
back to sunrise:

| Keyframe | Fraction of day | Sky colour | Ambient | Directional |
|---|---|---|---|---|
| Sunrise | 0.00 | `#F2A65A` | 0.45 | 0.55 |
| Noon | 0.25 | `#87CEEB` | 0.85 | 1.00 |
| Sunset | 0.50 | `#E0663F` | 0.40 | 0.50 |
| Midnight | 0.75 | `#0B1026` | 0.15 | 0.00 |

## Creature

One neutral creature, id-assigned in ascending order and updated in that same
order. Its state is never written to a save record: it is regenerated from
`seed` + `tick` whenever a region loads or a world reopens.

## Out of scope

No multiplayer, no combat against other players, no modding, no audio-described
ambition beyond the documented effect set, no mobile or controller target, no
shadow mapping, no networking of any kind. See `spec.md` §Non-Goals.
