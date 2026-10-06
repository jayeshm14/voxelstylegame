# Contract: Settings Schema (localStorage)

**Feature**: `specs/001-voxel-realms-game`
**Implements**: FR-025, FR-034, FR-041, SC-009
**Consumers**: `persistence/SettingsService.ts`, `ui/SettingsPanel.ts`, `ui/ControlsPanel.ts`, `input/Bindings.ts`

---

## Storage binding

| Property | Value |
|---|---|
| Key | `voxelrealms.settings.v1` |
| Format | single JSON object |
| Version | embedded as `version: 1` inside the object |

The `.v1` suffix and the embedded `version` both exist so a future shape change
can be detected and migrated rather than misread.

---

## Record shape — canonical key order

```text
SettingsRecord
├── version           integer              1
├── viewDistance      integer              2–12, default 6
├── fov               number               default 75
├── particles         boolean              default true
├── mouseSensitivity  number               default 0.002
├── masterVolume      number               0–1, default 1
├── effectsVolume     number               0–1, default 1
├── musicVolume       number               0–1, default 1
└── bindings          object               action → key, see input-bindings.md
```

Missing keys are filled from defaults rather than treated as corruption — settings
must never be able to make the game unstartable.

---

## Validation

| Field | Rule | On violation |
|---|---|---|
| `version` | must equal 1 | fall back to full defaults; do not attempt migration |
| `viewDistance` | integer, clamped to `[2, 12]` | clamp (spec Edge Case) |
| `fov`, `mouseSensitivity`, volumes | finite number, clamped to range | fall back to default |
| `particles` | boolean | fall back to default |
| `bindings` | each action known, each key non-empty and unmapped | offending entries reset to default |

**Unparseable key** ⇒ discard and write defaults; never throw to the player.

---

## Behaviour guarantees

1. **Independence** — settings live outside the `worlds` store, so deleting a
   world cannot discard them (FR-025).
2. **Immediate effect** — every change takes effect without restarting (FR-034,
   SC-009).
3. **Persistence** — every change survives a full restart (SC-009): 100% of
   settings changes remain in effect after restart.
4. **Separation of concerns** — a corrupt world save must not reset settings, and
   corrupt settings must not block loading a world.
5. **No gameplay effect** — settings may change what is rendered and how input is
   read, but must never change generated terrain, simulation outcomes or save
   contents (Constitution Principle I).

## Test mapping

| Contract clause | Test |
|---|---|
| Defaults, clamping, unparseable-key recovery | `settings.test.ts` |
| Round trip across a simulated restart | `settings.test.ts` |
| Settings never alter generation output | `determinism.test.ts` |
