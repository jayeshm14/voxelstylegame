# Contract: Save Schema (IndexedDB)

**Feature**: `specs/001-voxel-realms-game` | **Version**: `SAVE_SCHEMA_VERSION = 1`
**Implements**: FR-021, FR-022, FR-023, FR-024, FR-026, SC-007, SC-008, SC-013
**Consumers**: `persistence/SaveService.ts`, `persistence/Integrity.ts`, test suite `save-load.test.ts`

---

## Storage binding

| Property | Value |
|---|---|
| Database | `voxel-realms` |
| Object store | `worlds` |
| Key path | `name` (the world name, primary key) |
| Access surface | `saveWorld(record)`, `loadWorld(name)`, `hasSave(name)`, `deleteSave(name)`, `listWorlds()` |

All five operations return a promise. Callers must await them; there is no
fire-and-forget path (R10).

---

## Record shape — canonical key order

Keys are written in **exactly this order**. Serialisation must never sort
dynamically or emit a differently-ordered object for the same data.

```text
SaveRecord
├── version            integer        schema version, currently 1
├── name               string         world name, 1–32 chars, trimmed, case-insensitive unique
├── seed               integer        int32
├── tick               integer        ≥ 0; monotonic simulation tick
├── player
│   ├── x              number
│   ├── y              number         0 ≤ y < CHUNK_HEIGHT
│   ├── z              number
│   ├── yaw            number
│   ├── pitch          number
│   ├── health         integer        ≥ 0
│   └── hotbarIndex    integer        0–8
├── hotbarIndex        integer        (mirrors player hotbar selection for fast HUD restore)
├── inventory          array[36] of InventorySlot | null
└── modified           array of [cx, cz, array of [index, blockId]]
```

`InventorySlot`: `{ id, count, durability? }`

**Creatures are deliberately absent from this record.** FR-021 excludes them:
they are reconstructed from `seed` and `tick` on load (spec FR-028, FR-029),
which keeps the record bounded to what the player actually authored even though
the world is horizontally unbounded. `tick` must therefore be restored *before*
any creature is materialised.

`modified` is an **array**, not a map: regions are emitted in ascending
`(cx, cz)` order, and each region's entries in ascending `index`. Maps do not
guarantee a stable serialisation order; arrays do (Constitution Principle V).

---

## Field validation (every field, before anything is applied)

| Field | Rule | On violation |
|---|---|---|
| `version` | must equal a supported version | corruption path |
| `name` | 1–32 printable chars, trimmed, non-blank | corruption path |
| `seed` | integer in int32 range | corruption path |
| `tick` | integer ≥ 0 | corruption path |
| `player.*` | numeric and finite; `y` in `[0, CHUNK_HEIGHT)`; `hotbarIndex` 0–8; `health` ≥ 0 | corruption path |
| `inventory` | length exactly 36; each slot `id` known, `count` 1–64, `durability` within tier max | corruption path |
| `modified` | each `blockId` a known block id; each `index` in `[0, W*H*D)` | corruption path |

**Partial load is forbidden.** Either every field validates and the record is
applied atomically, or none is applied and the corruption path runs.

---

## Failure behaviour

| Condition | Behaviour | Contract guarantee |
|---|---|---|
| Unparseable / truncated | Non-fatal message offering to delete the save; game stays usable | SC-008: never terminates the game; path presented in < 3 s |
| Unsupported `version` | Same corruption path — never a best-effort load | FR-024 |
| Any field out of range | Corruption path | FR-024 |
| Write rejected (`QuotaExceededError`, `AbortError`, `UnknownError`) | `lastWriteFailed = true`; persistent on-screen notice; **no success reported** | SC-013: notice clears only after one successful write |
| Name already open in another session | Entry refused with "This world is already open in another session"; no transition | FR-023, R11 |
| Load requested mid-save | Load waits for the in-flight save to settle | spec Edge Case |

---

## Invariants

1. **Round trip**: `deserialize(serialize(record))` deep-equals `record`.
2. **Byte stability**: serialising the same world twice produces identical bytes.
3. **Determinism preserved**: loading a record and re-saving without player input
   produces the identical bytes (no timestamps, no incidental key ordering).
4. **Independence**: settings are never written to this store, so deleting a
   world cannot discard settings (FR-025).
5. **Exactness**: 100% of save→load cycles restore with zero discrepancies
   (SC-007).

## Test mapping

| Contract clause | Test |
|---|---|
| Round trip, byte stability, invariants 1–3 | `save-load.test.ts` |
| Corruption paths, invariant 5 | `save-load.test.ts` (corrupt fixtures) |
| Write-failure signalling | `save-load.test.ts` (failing store double) |
| Ordering of `modified` | `save-load.test.ts` |
