/**
 * The remappable binding map — FR-037, FR-041,
 * `contracts/input-bindings.md`.
 *
 * The contract's action catalogue is closed: every action it names is present
 * below, in catalogue order, and no action may be added or removed without
 * changing the contract first. The action id is the stable half — it never
 * moves — and only the input assigned to it can.
 *
 * Four rules from the contract's remap table are structural here rather than
 * conventional, because each one is a mistake a later call site could otherwise
 * make silently:
 *
 * - **Swap on collision.** Assigning an input another action already holds
 *   moves that action onto the input being given up, so no key is ever bound
 *   twice and no action is ever left unbound (invariants 1 and 2).
 * - **`Escape` is reserved.** It cannot leave `ui.pause` — it is the guaranteed
 *   way out of pointer capture, so an unbindable pause key would strand the
 *   player inside the game.
 * - **Nothing binds to nothing.** An empty input is refused rather than applied,
 *   so there is no state in which a keypress reaches nowhere.
 * - **Restore is whole.** One call returns the entire table, not the actions
 *   that happened to be touched since.
 *
 * The class holds no clock, no storage and no DOM: settings persistence is the
 * settings module's job, which reads {@link Bindings.toJSON} and writes
 * {@link Bindings.fromJSON}. That keeps this file usable from a test without a
 * `localStorage`.
 *
 * Constitution test area: bindings are covered by the settings round trip, not
 * by one of the twelve required suites; see `contracts/input-bindings.md` § Test
 * mapping.
 */

/** Every action the contract catalogue defines. */
export type ActionId =
  | 'move.forward'
  | 'move.back'
  | 'move.left'
  | 'move.right'
  | 'move.jump'
  | 'move.sprint'
  | 'slot.select.1'
  | 'slot.select.2'
  | 'slot.select.3'
  | 'slot.select.4'
  | 'slot.select.5'
  | 'slot.select.6'
  | 'slot.select.7'
  | 'slot.select.8'
  | 'slot.select.9'
  | 'slot.cycle'
  | 'world.break'
  | 'world.place'
  | 'ui.inventory'
  | 'ui.pause'
  | 'ui.debug'
  | 'ui.confirm'

/**
 * How an action consumes its input.
 *
 * - `hold` — active for as long as the input is down (movement, break).
 * - `press` — fires once on the transition from up to down.
 * - `delta` — consumes the signed magnitude of a wheel turn.
 *
 * Camera look is deliberately absent: the contract states it is pointer-capture
 * movement, not a binding, always scaled by `mouseSensitivity`.
 */
export type TriggerKind = 'hold' | 'press' | 'delta'

/** One catalogue row: the action, how it triggers, and its default input. */
export interface ActionSpec {
  readonly id: ActionId
  readonly kind: TriggerKind
  /** `KeyboardEvent.code`, `mouse0`/`mouse2`, or `wheel`. */
  readonly defaultInput: string
}

/**
 * The contract's default binding table, in catalogue order.
 *
 * Order matters: {@link Bindings.restoreDefaults} rebuilds from this array, so
 * the table's sequence is the single source of "what the defaults are" — the
 * same list `docs/CONTROLS.md` documents (FR-037).
 */
export const ACTIONS: readonly ActionSpec[] = Object.freeze([
  Object.freeze({ id: 'move.forward', kind: 'hold', defaultInput: 'KeyW' }),
  Object.freeze({ id: 'move.back', kind: 'hold', defaultInput: 'KeyS' }),
  Object.freeze({ id: 'move.left', kind: 'hold', defaultInput: 'KeyA' }),
  Object.freeze({ id: 'move.right', kind: 'hold', defaultInput: 'KeyD' }),
  Object.freeze({ id: 'move.jump', kind: 'hold', defaultInput: 'Space' }),
  Object.freeze({ id: 'move.sprint', kind: 'hold', defaultInput: 'ShiftLeft' }),
  Object.freeze({ id: 'slot.select.1', kind: 'press', defaultInput: 'Digit1' }),
  Object.freeze({ id: 'slot.select.2', kind: 'press', defaultInput: 'Digit2' }),
  Object.freeze({ id: 'slot.select.3', kind: 'press', defaultInput: 'Digit3' }),
  Object.freeze({ id: 'slot.select.4', kind: 'press', defaultInput: 'Digit4' }),
  Object.freeze({ id: 'slot.select.5', kind: 'press', defaultInput: 'Digit5' }),
  Object.freeze({ id: 'slot.select.6', kind: 'press', defaultInput: 'Digit6' }),
  Object.freeze({ id: 'slot.select.7', kind: 'press', defaultInput: 'Digit7' }),
  Object.freeze({ id: 'slot.select.8', kind: 'press', defaultInput: 'Digit8' }),
  Object.freeze({ id: 'slot.select.9', kind: 'press', defaultInput: 'Digit9' }),
  Object.freeze({ id: 'slot.cycle', kind: 'delta', defaultInput: 'wheel' }),
  Object.freeze({ id: 'world.break', kind: 'hold', defaultInput: 'mouse0' }),
  Object.freeze({ id: 'world.place', kind: 'press', defaultInput: 'mouse2' }),
  Object.freeze({ id: 'ui.inventory', kind: 'press', defaultInput: 'KeyE' }),
  Object.freeze({ id: 'ui.pause', kind: 'press', defaultInput: 'Escape' }),
  Object.freeze({ id: 'ui.debug', kind: 'press', defaultInput: 'F3' }),
  Object.freeze({ id: 'ui.confirm', kind: 'press', defaultInput: 'Enter' }),
])

/** The action whose input may never be reassigned (contract § Remap). */
export const RESERVED_ACTION: ActionId = 'ui.pause'

/** The input `RESERVED_ACTION` must always hold. */
export const RESERVED_INPUT = 'Escape'

/** Index from action id to catalogue row, built once. */
const SPECS: ReadonlyMap<ActionId, ActionSpec> = new Map(
  ACTIONS.map((spec) => [spec.id, spec]),
)

/** True when `id` is one of the catalogue's actions. */
export function isActionId(id: string): id is ActionId {
  return SPECS.has(id as ActionId)
}

/** How a remap attempt resolved. */
export type RemapOutcome =
  /** The input now belongs to the action; nothing else held it. */
  | 'applied'
  /** Another action held the input and received the one being given up. */
  | 'swapped'
  /** The action already held this input; nothing changed. */
  | 'unchanged'
  /** Unknown action, empty input, or an attempt to move `Escape` off pause. */
  | 'rejected'

export class Bindings {
  /** Action → input. Insertion order follows the catalogue. */
  readonly #actionToInput = new Map<ActionId, string>()
  /** Input → action. Kept in step with the map above, never populated alone. */
  readonly #inputToAction = new Map<string, ActionId>()

  /**
   * @param entries an override table; unlisted actions take their default.
   *        Entries naming an unknown action or an empty input are dropped
   *        rather than applied, so a corrupt settings record cannot put the
   *        map in a state the class itself would refuse to create.
   */
  constructor(entries: Readonly<Record<string, string>> = {}) {
    for (const spec of ACTIONS) {
      this.#actionToInput.set(spec.id, spec.defaultInput)
      this.#inputToAction.set(spec.defaultInput, spec.id)
    }
    for (const [action, input] of Object.entries(entries)) {
      if (action === RESERVED_ACTION) continue // defaults already hold `Escape`
      if (!isActionId(action) || typeof input !== 'string' || input.length === 0) continue
      if (this.#inputToAction.has(input)) continue // would steal; defaults are already unique
      this.#actionToInput.set(action, input)
      this.#inputToAction.delete(spec(action).defaultInput)
      this.#inputToAction.set(input, action)
    }
  }

  /** The input currently assigned to `action`. */
  inputFor(action: ActionId): string {
    return this.#actionToInput.get(action) as string
  }

  /** The action owning `input`, or `undefined` when nothing does. */
  actionFor(input: string): ActionId | undefined {
    return this.#inputToAction.get(input)
  }

  /** How `action` triggers — a property of the action, never of the binding. */
  kindOf(action: ActionId): TriggerKind {
    return spec(action).kind
  }

  /**
   * Reassign `action` to `input`.
   *
   * @returns what happened — `'rejected'` for an unknown action, an empty
   *          input, an input already held by `action`, or an attempt to move
   *          `Escape` off `ui.pause`
   */
  rebind(action: ActionId, input: string): RemapOutcome {
    if (!isActionId(action)) return 'rejected'
    if (input.length === 0) return 'rejected'
    if (action === RESERVED_ACTION && input !== RESERVED_INPUT) return 'rejected'

    const current = this.#actionToInput.get(action) as string
    if (current === input) return 'unchanged'

    const holder = this.#inputToAction.get(input)
    if (holder === undefined) {
      this.#detach(action, current)
      this.#attach(action, input)
      return 'applied'
    }
    if (holder === action) return 'unchanged'

    // Swap: the holder takes what `action` is giving up, so neither side is
    // ever left unbound and no input ends up on two actions.
    this.#detach(action, current)
    this.#detach(holder, input)
    this.#attach(action, input)
    this.#attach(holder, current)
    return 'swapped'
  }

  /** Return every action to the contract's default table (FR-041). */
  restoreDefaults(): void {
    this.#actionToInput.clear()
    this.#inputToAction.clear()
    for (const s of ACTIONS) {
      this.#actionToInput.set(s.id, s.defaultInput)
      this.#inputToAction.set(s.defaultInput, s.id)
    }
  }

  /**
   * The remappings, as the `bindings` object `settings-schema.md` stores.
   *
   * Actions still on their default are written out too, so the record is
   * self-describing: a reader that has lost the catalogue can still reconstruct
   * a complete table without knowing what the defaults were.
   */
  toJSON(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const s of ACTIONS) out[s.id] = this.#actionToInput.get(s.id) as string
    return out
  }

  /** Rebuild from a stored table, falling back to defaults on anything invalid. */
  static fromJSON(value: unknown): Bindings {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return new Bindings()
    }
    return new Bindings(value as Record<string, string>)
  }

  #attach(action: ActionId, input: string): void {
    this.#actionToInput.set(action, input)
    this.#inputToAction.set(input, action)
  }

  #detach(action: ActionId, input: string): void {
    this.#actionToInput.delete(action)
    this.#inputToAction.delete(input)
  }
}

function spec(action: ActionId): ActionSpec {
  const found = SPECS.get(action)
  if (found === undefined) throw new RangeError(`unknown action ${action}`)
  return found
}
