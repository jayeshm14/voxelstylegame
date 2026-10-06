# Contract: Input Bindings

**Feature**: `specs/001-voxel-realms-game`
**Implements**: FR-009, FR-016, FR-037, FR-041, US7 scenarios 4–5
**Consumers**: `input/Bindings.ts`, `input/InputManager.ts`, `ui/ControlsPanel.ts`, `docs/CONTROLS.md`

---

## Action catalogue

Bindings map a stable **action id** to an input. The action id never changes;
only the key assigned to it can.

| Action id | Default | Kind | Description |
|---|---|---|---|
| `move.forward` | `KeyW` | hold | Walk forward |
| `move.back` | `KeyS` | hold | Walk backward |
| `move.left` | `KeyA` | hold | Strafe left |
| `move.right` | `KeyD` | hold | Strafe right |
| `move.jump` | `Space` | hold | Jump / swim up |
| `move.sprint` | `ShiftLeft` | hold | Sprint |
| `slot.select.1` … `slot.select.9` | `Digit1` … `Digit9` | press | Select hotbar slot |
| `slot.cycle` | wheel | delta | Cycle hotbar selection |
| `world.break` | mouse button 0 (LMB) | hold | Break targeted block |
| `world.place` | mouse button 2 (RMB) | press | Place selected block |
| `ui.inventory` | `KeyE` | press | Toggle inventory |
| `ui.pause` | `Escape` | press | Pause / resume |
| `ui.debug` | `F3` | press | Toggle debug overlay |
| `ui.confirm` | `Enter` | press | Confirm in menus |

Camera look is **not** a binding: it is pointer-capture movement, always mapped
to mouse delta scaled by `mouseSensitivity`.

---

## Default binding table

```text
KeyW forward      KeyS back       KeyA left      KeyD right
Space jump        ShiftLeft sprint
Digit1..Digit9    hotbar slots 1..9
mouse0 break      mouse2 place    wheel slot.cycle
KeyE inventory    Escape pause    F3 debug       Enter confirm
```

These defaults are also written to `docs/CONTROLS.md` so the documented bindings
and the shipped bindings cannot drift (FR-037).

---

## Remap contract (FR-041)

| Rule | Requirement |
|---|---|
| Scope | **Every** action in the catalogue is remappable, including the nine slot selectors |
| Persistence | Remappings persist across sessions (stored in `bindings` within [settings-schema.md](./settings-schema.md)) |
| Restore | A single "Restore defaults" action returns **all** actions to the table above |
| Collision | Assigning a key already used by another action swaps the two; a key is never bound to two actions |
| Reserved | `Escape` cannot be unbound from `ui.pause` — it is the guaranteed way out of pointer capture |
| Empty state | A binding may not be cleared to nothing; every action always has an input |
| Apply | Changes take effect immediately, without restart (SC-009) |

---

## Capture and pause behaviour (FR-009, FR-037)

```text
canvas click ──► request Pointer Lock
   ├─ granted  ──► state = playing, input live
   └─ refused  ──► state = paused, same pause overlay + refusal text + retry affordance
                   (FR-009's single pause path; never silently playing)

pointerlockchange → lock lost     ──► state = paused, overlay shown
visibilitychange  → hidden        ──► state = paused, overlay shown + save (FR-022)
open inventory (E)                ──► state = paused, inventory shown + save (FR-032)
close inventory                   ──► state = playing

paused ──(player action)──► playing     (resume requires explicit input)
```

- Input is read **only** while `state === playing`; the pause overlay consumes
  its own key events so a menu keypress cannot leak into the world.
- **The inventory is a `paused` state, not a third mode** (clarification session
  2). Opening it releases pointer capture, which under FR-009 pauses the
  simulation and under FR-022 triggers a save; closing it is the player action
  that resumes play. Managing items can therefore never be interrupted by a
  creature or a moving sky.
- Auto-pause fires on lock loss, visibility loss **and** inventory open — one
  transition, not divergent paths.
- Pause does not advance `timeOfDay` (only `playing` ticks advance simulation).
- Consequence for SC-013: because every inventory open writes, a failed write is
  surfaced on a very common action rather than only on a rare manual save.

---

## Accessibility requirements (FR-041, US7 scenarios 4–5)

| Requirement | Verification |
|---|---|
| Target-selection outline distinguishable without colour | Render in greyscale; outline remains separable from terrain (US7 scenario 5) |
| Health indicator readable without colour | Same greyscale pass (US7 scenario 5) |
| Remapping survives restart | Remap → restart → binding still applied (US7 scenario 4) |
| Restore defaults returns every action | Restore → compare against the default table (US7 scenario 4) |
| Focus visible on every remap control | Keyboard traversal reaches all controls with a visible focus ring |

Colour-independence is achieved with outline thickness and a corner-mark pattern
in addition to hue, so hue is never the sole carrier of meaning.

---

## Invariants

1. Every action id in the catalogue has exactly one input at all times.
2. No input is bound to two actions simultaneously.
3. Defaults are a single source of truth — `docs/CONTROLS.md` and the
   "Restore defaults" action both read it.
4. Settings changes never alter generated terrain, simulation outcomes or save
   contents (Constitution Principle I) — bindings change only how input is read.
5. Key events never reach the world while paused.

## Test mapping

| Contract clause | Test |
|---|---|
| Default table round-trips through persistence | `settings.test.ts` |
| Remap → restart → still applied (US7 s4) | `settings.test.ts` |
| Restore defaults returns the full table | `settings.test.ts` |
| Collision swap leaves no action unbound | `settings.test.ts` |
| Slot selection by number key and wheel (FR-016) | `input.test.ts` |
| Auto-pause on lock loss and visibility loss (FR-009) | `input.test.ts` |
