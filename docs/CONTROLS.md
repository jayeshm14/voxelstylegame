# Controls — Voxel Realms

Normative shipping document. Per `spec.md` §*Normative shipping documents*, the
**default control bindings** table below is reproduced **verbatim** from the
specification and is authoritative for the implementation.

Every binding is remappable at runtime (FR-041) through `src/ui/ControlsPanel.ts`,
which also restores defaults and persists remappings across sessions. The
shipped defaults cannot drift from this table (FR-037).

## Default control bindings

FR-037 — every entry is remappable under FR-041:

| Binding | Default |
|---|---|
| Move forward / back / left / right | W / S / A / D |
| Jump | Space |
| Sprint | Left Shift |
| Hotbar slots 1–9 | Digit 1 – Digit 9 |
| Cycle hotbar | Mouse wheel |
| Break block | Left mouse, held |
| Place block | Right mouse |
| Inventory | E |
| Pause | Escape |
| Debug overlay | F3 |

## Capture and pause behaviour

The game requires pointer capture to play. All three of these events behave
**identically** — pause, show the pause overlay, stop advancing the simulation —
and resume only on an explicit player action (FR-009):

1. pointer capture **refused**
2. pointer capture **lost**
3. the game surface losing **visibility or focus**

The refusal case additionally shows a message naming the cause together with an
affordance to retry, and the game stays paused — it never runs without pointer
capture (FR-037 clause (b)). The refusal message **is** that same pause overlay
carrying refusal-specific text plus the retry control, not a second screen.

## Screen keys

| Key | Action |
|---|---|
| Escape or E | Close the inventory and return to play |
| Escape (while playing) | Open the pause menu |
| Escape (while the pause menu is open) | Resume |

Paused screens are mutually exclusive — the pause menu and the inventory never
stack (FR-032).

## Accessibility

Every screen is operable from the keyboard alone, with a visible focus indicator
on the selected control. Target outline and health are distinguishable without
relying on colour (FR-041).
