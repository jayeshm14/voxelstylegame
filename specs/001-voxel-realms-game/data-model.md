# Phase 1 — Data Model: Voxel Realms

**Feature**: `specs/001-voxel-realms-game` | **Branch**: `001-voxel-realms-game`
**Date**: 2026-10-04
**Sources**: [spec.md](./spec.md) Key Entities + Functional Requirements;
[research.md](./research.md) for storage and lock decisions

Runtime entities live in memory for the session; persisted entities are those
written by [contracts/save-schema.md](./contracts/save-schema.md) and
[contracts/settings-schema.md](./contracts/settings-schema.md). Validation rules
cite the FR that produced them.

---

## 1. World

A named, seeded instance of the landscape. Primary key: **name**.

| Field | Type | Constraints | Source |
|---|---|---|---|
| `name` | string | 1–32 characters after trimming surrounding space; printable only; never blank; unique ignoring case | FR-001 |
| `seed` | integer (int32) | Documented default when seed field left blank; malformed/out-of-range rejected at entry | FR-001, spec Edge Cases |
| `tick` | integer ≥ 0 | Monotonic; sole source of `timeOfDay` | FR-027, FR-029 |
| `modified` | map `(cx, cz) → { index → blockId }` | Player edits layered over generated terrain; survives region unload | FR-021, R12 |
| `creatures` | list of Creature | Count derived from seed at generation | FR-028 |
| `sessionLock` | transient | Web Lock `voxel-realms:<name>`; not persisted | FR-023, R11 |

**Uniqueness rule**: before creation or load, the name is compared against every
stored world with case folding and space trimming; a match requires explicit
overwrite confirmation.

**Lifecycle**: `new` → `active` ⇄ `paused` → `saved` → (`loaded` | `deleted`).
A world cannot enter `active` while another session holds `sessionLock`.

---

## 2. Player

| Field | Type | Constraints | Source |
|---|---|---|---|
| `x`, `y`, `z` | number | `y` clamped to `[0, CHUNK_HEIGHT)`; outside reads AIR, writes rejected | spec §4 |
| `yaw`, `pitch` | number (radians) | `pitch` clamped to ±(π/2 − ε) | FR-006 |
| `health` | integer | Fixed at max in v1; persisted for forward compatibility | spec §3, Assumption |
| `hotbarIndex` | integer 0–8 | Bounds-checked on load | FR-015 |
| `inventory` | array of 36 Inventory Slot \| null | Fixed length; order significant | FR-015 |

**Spawn rule**: `(0, surfaceHeight(0,0) + 2, 0)`, found by scanning columns
outward in a fixed spiral until a non-water surface is found — spiral order is
fixed so spawn is deterministic.

---

## 3. Inventory Slot

| Field | Type | Constraints | Source |
|---|---|---|---|
| `id` | integer | 1–13 for blocks, ≥100 for items | spec §5, §7 |
| `count` | integer | 1 ≤ `count` ≤ `MAX_STACK` (64) | FR-015 |
| `durability` | integer, optional | Present only for tools; 0 < value ≤ tier maximum | FR-019 |

**Stacking rule**: a merge that would exceed 64 fills the current slot to 64 and
spills the remainder into the next free slot; a drop with no free slot is
discarded, never duplicated (spec Edge Cases).

**Consumption rule**: crafting consumes ingredients in ascending slot order, so a
recipe spanning several stacks resolves identically every time.

**Validation on load**: `id` must be a known block or item; `count` within
1–64; `durability` within the tier's maximum. Any violation invalidates the
record and takes the corruption path (FR-024).

---

## 4. Block Type (fixed catalogue)

| Field | Type | Constraints | Source |
|---|---|---|---|
| `id` | integer 0–14 | Immutable; AIR = 0, WATER = 7, SNOW = 13, TORCH = 14 | spec §5, FR-044 |
| `name` | string | Unique | spec §5 |
| `hardness` | number ≥ 0 | WATER is unbreakable | spec §5 |
| `solid` | boolean | Drives collision | FR-006 |
| `transparent` | boolean | Drives face culling | FR-014 |
| `toolClass` | `shovel` \| `axe` \| `pickaxe` \| none | Determines multiplier eligibility | spec §5 |
| `minTier` | integer 0–2 | Lower tier ⇒ no drop | FR-018 |
| `drops` | item id \| none | May legitimately be nothing | FR-013 |

**Break time**: `hardness / toolMultiplier`, where the multiplier applies only
when the equipped tool class matches and tier ≥ `minTier`; hand = 1,
wood = 2, stone = 4, iron = 6.

---

## 5. Tool

| Field | Type | Constraints | Source |
|---|---|---|---|
| `id` | integer 110–115 | Fixed | spec §7 |
| `tier` | integer 1–3 | WOOD 1, STONE 2, IRON 3 | spec §7 |
| `multiplier` | integer | 2 / 4 / 6 | spec §7 |
| `durability` | integer | 60 / 132 / 250; decrements by 1 per block broken | FR-019 |

**State transition**: `intact` → (per block broken, `durability − 1`) →
`consumed` at 0. A `consumed` tool is removed from its slot immediately; it is
never left in the inventory at zero.

---

## 6. Recipe

| Field | Type | Constraints | Source |
|---|---|---|---|
| `key` | string | Unique, stable (`recipe.wooden_pickaxe`, …) | spec §7 |
| `ingredients` | multiset of `{ id, count }` | Shapeless — order irrelevant, counts exact | FR-017 |
| `output` | `{ id, count }` | Exact produce count | FR-017 |

**Craft transition**: evaluated atomically — all ingredients present ⇒ consume
exact counts then produce output; any shortage ⇒ rejected with the inventory
byte-identical to before the attempt.

**Known ambiguity resolved**: pickaxe and axe share ingredient *items* but differ
in counts (2 stone + 2 stick vs 3 stone + 2 stick), so the multiset itself
disambiguates; no positional shape exists to collide.

---

## 7. Creature — `Forest Wanderer`

| Field | Type | Constraints | Source |
|---|---|---|---|
| `id` | integer | Unique; update order = ascending numeric id | FR-029 |
| `kind` | integer | 1 | spec §9 |
| `x`, `y`, `z` | number | Same AABB collision as the player | spec §9 |
| `health` | integer | 10; not player-damageable in v1 | Assumption |
| `state` | `IDLE` \| `WALK` | See transitions | spec §9 |
| `stateTimer` | seconds | IDLE 2–4 s, WALK 1–3 s, drawn from its own seeded stream | spec §9 |

**State transitions**:
```
IDLE ──(stateTimer elapses)──► WALK ──(stateTimer elapses)──► IDLE
                                 │
                                 └── refuses any step down > 1 block ⇒ stays IDLE
```
Transitions occur only inside a tick, in ascending `id` order.

**Spawn**: in forest regions only, `count = hash32(seed, cx, cz, ENTITY_SPAWN) % 3`,
positions hashed from the same seed — so a seed reproduces creatures exactly.

**Persistence**: creatures are **never written to the save record** (FR-021). They
are re-derived whenever a region loads and whenever the world reopens, at the
state implied by the current tick (FR-028) — which requires `tick` to be restored
before materialisation. Only creatures in regions inside the retained view
distance are simulated, so the live population stays bounded even though the
world is horizontally unbounded.

---

## 8. Chunk / Region (runtime)

| Field | Type | Constraints | Source |
|---|---|---|---|
| `cx`, `cz` | integer | `chunkX = floor(wx / W)`; local `= ((w % W) + W) % W` | spec §4 |
| `blocks` | `Uint8Array` length `W*H*D` | index = `(y*D + z)*W + x` | spec §4 |
| `light` | `Uint8Array` length `W*H*D` | Light level 0–15 per cell; **derived**, recomputed whenever `dirty` is set, discarded on unload, never serialised | FR-044, R17 |
| `dirty` | boolean | Set by any block change inside, plus neighbour on border | FR-014 |

**Pure generation contract**: `generateChunk(seed, cx, cz) → Uint8Array` reads no
other chunk and no module-level state — see
[contracts/world-generation.md](./contracts/world-generation.md).

**Derived-state contract**: `light` is a pure function of `blocks` alone
(skylight flood + block-light flood, `max` of the two, accepting a level only
when it is strictly greater than the one recorded — see [research.md](./research.md)
R17). It therefore carries **no independent state**: it is rebuilt from blocks
after every load and never appears in the save record, so it cannot drift and
cannot grow the record (FR-044, G7).
| `modified` | map `index → blockId` | Retained after unload | FR-021, R12 |
| `state` | `queued` \| `generated` \| `meshed` \| `unloaded` | GPU resources only exist while `meshed` | FR-039 |

**Pure generation contract**: `generateChunk(seed, cx, cz) → Uint8Array` reads no
other chunk and no module-level state — see
[contracts/world-generation.md](./contracts/world-generation.md).

**Ordering invariant**: the streaming queue is always sorted by
`(distance², cx, cz)`; meshing always picks nearest dirty first.

---

## 9. Save Record

The persisted projection of World + Player. Carries `version`
(`SAVE_SCHEMA_VERSION`, currently 1), is written in a **fixed key order**, and
uses integers wherever the value permits. Full field list, key order, types and
ranges: [contracts/save-schema.md](./contracts/save-schema.md).

**Creatures are deliberately not part of this projection.** FR-021 excludes them:
they are rebuilt from `seed` + `tick` (FR-028, FR-029), which keeps the record
bounded to what the player authored in an otherwise unbounded world. Load order
is therefore load-bearing — restore `tick` *first*, then materialise creatures.

**Validation on load** (FR-024) — every field is checked for type, range and
schema version before anything is applied. Failure modes and their handling:

| Condition | Outcome |
|---|---|
| Truncated / unparseable | Corruption path — non-fatal message, offer delete |
| `version` ≠ supported | Corruption path — never a silent partial load |
| Any field out of range | Corruption path |
| World name held by another session | Refused at entry, not a corruption (FR-023) |
| Write fails (quota/abort/permission) | Failure flagged, persistent notice, no success reported (FR-022, SC-013) |

---

## 10. Settings

Persisted independently of any world under `localStorage`
`voxelrealms.settings.v1`; deleting a world never discards it (FR-025).

| Field | Type | Range / default |
|---|---|---|
| `viewDistance` | integer | 2–12, default 6 |
| `fov` | number | default 75 |
| `particles` | boolean | default on |
| `mouseSensitivity` | number | default 0.002 rad/px |
| `masterVolume`, `effectsVolume`, `musicVolume` | number | 0–1 |
| `bindings` | map action → key | Defaults from [contracts/input-bindings.md](./contracts/input-bindings.md) |

Settings changes apply immediately and persist across restart (SC-009).

---

## 11. Session game state

```
menu ──(New World, lock acquired)──────────► playing
menu ──(Load World, lock acquired)─────────► playing
playing ──(Esc)────────────────────────────► paused[pause]
playing ──(E, open inventory)──────────────► paused[inventory]  [FR-032 — also saves]
playing ──(pointer lock lost, page hidden)─► paused[pause]
paused[pause] ──(Resume)───────────────────► playing
paused[inventory] ──(Esc or E)─────────────► playing            [one press in, one press out]
paused[pause] ──(Save, then Main Menu)─────► menu               [lock released]
menu ──(world name already locked)────────► menu               [refusal, no transition]
```

All transitions happen inside a tick; `timeOfDay` advances only in `playing`.
`paused` has exactly two screens and they are **mutually exclusive — never
stacked**: the pause menu and the inventory screen. Escape means "dismiss the
top screen": from `playing` it opens the pause menu, and from `paused[inventory]`
it closes the inventory and returns straight to `playing`, so the pause menu is
only ever reachable from `playing` (FR-032, one press in, one press out).

There is no direct `playing → menu` path — Main Menu sits behind the pause menu
(FR-033), so leaving a world always passes through `paused` and therefore always
saves first (FR-022).

---

## 12. Entity relationship summary

```
World 1──* Creature
World 1──1 Player
World 1──* (cx,cz) modified-map entries
Player 1──1 Inventory
Inventory 1──* Inventory Slot
Inventory Slot *──1 Block Type | Tool | Item
Recipe *──* Inventory Slot      (via ingredient multiset)
World 1──1 Save Record          (persistence projection)
Settings *──0..1 World          (never cascades on world delete)
```

**Indexing / iteration order** (Constitution Principle II):
- chunks → `(distance², cx, cz)`
- creatures → ascending numeric `id`
- registries → ascending numeric id
- inventory consumption → ascending slot index
