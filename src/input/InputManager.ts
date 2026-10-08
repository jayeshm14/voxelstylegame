/**
 * Key and mouse state, pointer capture, and FR-009's **one** pause path —
 * `contracts/input-bindings.md` § Capture and pause behaviour, research R7.
 *
 * Three events must behave identically (FR-009): pointer capture refused,
 * pointer capture lost, and the game surface losing visibility or focus. Each
 * one pauses, shows the overlay and stops the simulation. They are kept
 * identical here by construction rather than by convention — all three reach
 * the single `onPause` callback passed to the constructor, and there is no
 * second route out of this class into a pause. The *cause* travels with the
 * call so FR-037(b) can render refusal-specific copy on the one case that
 * differs; the transition itself is `GameState`'s and is not duplicated.
 *
 * **Input is read only while not paused.** Key and mouse state is cleared the
 * moment a pause lands, and the listeners ignore events while paused — the
 * pause overlay consumes its own key presses, so a menu keypress cannot be
 * recorded here and leak into the world when play resumes (contract invariant
 * 5). Resume is therefore only ever reachable through an explicit action.
 *
 * Browser-only: this module reads `window`, `document` and DOM events, so it is
 * exercised through `npm run preview` rather than by the node-environment test
 * suites. Its pure half — turning held inputs into movement axes — is
 * {@link InputManager.axes}, which needs no event at all.
 */

import { SETTINGS } from '../core/GameConfig'
import type { PauseCause } from '../core/GameState'
import { type ActionId, type Bindings, type TriggerKind } from './Bindings'

/** What the player is asking for this tick, in binding space. */
export interface InputCallbacks {
  /**
   * FR-009's single pause path. Refusal, lock loss and visibility loss all
   * arrive here and nowhere else.
   */
  readonly onPause: (cause: PauseCause) => void
  /** An action's input went down. */
  readonly onActionDown?: (action: ActionId, kind: TriggerKind) => void
  /** An action's input came back up. */
  readonly onActionUp?: (action: ActionId, kind: TriggerKind) => void
  /** Pointer capture was granted; play may begin. */
  readonly onLocked?: () => void
}

/** The elements and callbacks `InputManager` needs; supplied by the composition root. */
export interface InputOptions {
  readonly canvas: HTMLCanvasElement
  readonly bindings: Bindings
  readonly callbacks: InputCallbacks
}

/**
 * A value that can be awaited — the promise form of `requestPointerLock`.
 *
 * TypeScript's DOM library and the browser disagree about that method's return
 * type across versions (`void` in some, `Promise<void>` in others), so the
 * result is held as `unknown` and narrowed structurally instead of cast: a cast
 * would compile equally well against a value that was never thenable.
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

export class InputManager {
  readonly #canvas: HTMLCanvasElement
  readonly #bindings: Bindings
  readonly #callbacks: InputCallbacks

  /** Inputs currently held, keyed by their `KeyboardEvent.code` / mouse token. */
  readonly #held = new Set<string>()

  #locked = false
  #paused = false
  // Widened to `number`: `GameConfig` freezes the default as a literal, but the
  // FR-034 setter above accepts any positive finite value, so the field's type
  // has to be the range rather than the one sample of it.
  #sensitivity: number = SETTINGS.SENSITIVITY_DEFAULT
  /** Accumulated mouse delta awaiting the next frame; consumed by {@link consumeLook}. */
  #lookX = 0
  #lookY = 0

  #attached = false

  constructor(options: InputOptions) {
    this.#canvas = options.canvas
    this.#bindings = options.bindings
    this.#callbacks = options.callbacks
  }

  /** Whether pointer capture is currently held. */
  get locked(): boolean {
    return this.#locked
  }

  /** Whether the world should be reading input at all right now. */
  get paused(): boolean {
    return this.#paused
  }

  /** Current mouse sensitivity in radians per pixel (FR-034). */
  get sensitivity(): number {
    return this.#sensitivity
  }

  set sensitivity(value: number) {
    if (!Number.isFinite(value) || value <= 0) return
    this.#sensitivity = value
  }

  /** True when `action`'s input is down *and* the world is reading input. */
  isDown(action: ActionId): boolean {
    if (this.#paused) return false
    return this.#held.has(this.#bindings.inputFor(action))
  }

  /**
   * Turn held inputs into movement axes, each in `−1 … 1`.
   *
   * Opposing keys cancel rather than sum to ±2, and the result is read here so
   * no call site re-derives WASD semantics from raw codes.
   */
  axes(): { forward: number; strafe: number; jump: boolean; sprint: boolean } {
    if (this.#paused) return { forward: 0, strafe: 0, jump: false, sprint: false }
    return {
      forward: Number(this.isDown('move.forward')) - Number(this.isDown('move.back')),
      strafe: Number(this.isDown('move.right')) - Number(this.isDown('move.left')),
      jump: this.isDown('move.jump'),
      sprint: this.isDown('move.sprint'),
    }
  }

  /**
   * Accumulated look delta since the last call, in radians, already scaled by
   * `mouseSensitivity`. Yaw turns right for a positive x delta; pitch is clamped
   * by `Player.setOrientation`, not here.
   */
  consumeLook(): { deltaYaw: number; deltaPitch: number } {
    const deltaYaw = -this.#lookX * this.#sensitivity
    const deltaPitch = -this.#lookY * this.#sensitivity
    this.#lookX = 0
    this.#lookY = 0
    return { deltaYaw, deltaPitch }
  }

  /**
   * Ask the browser for pointer capture (FR-037, contract § Capture).
   *
   * A refusal is not an error to swallow: it is routed to the same pause path
   * as a lost lock, carrying `pointer-refused` so the overlay can name it and
   * offer the retry affordance. Browsers disagree about the return value — the
   * promise form and the void form are both in use — so both are handled and
   * neither is assumed.
   */
  requestLock(): void {
    if (this.#locked) return
    const element = this.#canvas as HTMLCanvasElement & {
      requestPointerLock?: () => void | Promise<void>
    }
    try {
      const result: unknown = element.requestPointerLock?.()
      if (isThenable(result)) {
        result.then(
          () => undefined,
          () => this.#pauseAs('pointer-refused'),
        )
      }
    } catch {
      // Synchronous refusal (an insecure context, a detached element).
      this.#pauseAs('pointer-refused')
    }
  }

  /** Wire the DOM listeners. Safe to call twice; the second call is a no-op. */
  attach(): void {
    if (this.#attached) return
    this.#attached = true
    window.addEventListener('keydown', this.#onKeyDown)
    window.addEventListener('keyup', this.#onKeyUp)
    window.addEventListener('mousemove', this.#onMouseMove)
    this.#canvas.addEventListener('mousedown', this.#onMouseDown)
    this.#canvas.addEventListener('mouseup', this.#onMouseUp)
    this.#canvas.addEventListener('click', this.#onCanvasClick)
    this.#canvas.addEventListener('contextmenu', this.#onContextMenu)
    document.addEventListener('pointerlockchange', this.#onLockChange)
    document.addEventListener('pointerlockerror', this.#onLockError)
    document.addEventListener('visibilitychange', this.#onVisibilityChange)
  }

  /** Remove every listener and drop all held input. Idempotent. */
  detach(): void {
    if (!this.#attached) return
    this.#attached = false
    window.removeEventListener('keydown', this.#onKeyDown)
    window.removeEventListener('keyup', this.#onKeyUp)
    window.removeEventListener('mousemove', this.#onMouseMove)
    this.#canvas.removeEventListener('mousedown', this.#onMouseDown)
    this.#canvas.removeEventListener('mouseup', this.#onMouseUp)
    this.#canvas.removeEventListener('click', this.#onCanvasClick)
    this.#canvas.removeEventListener('contextmenu', this.#onContextMenu)
    document.removeEventListener('pointerlockchange', this.#onLockChange)
    document.removeEventListener('pointerlockerror', this.#onLockError)
    document.removeEventListener('visibilitychange', this.#onVisibilityChange)
    this.#held.clear()
    this.#locked = false
  }

  /**
   * Enter the paused state: input stops being read and everything held is
   * dropped, so a key still physically down when play resumes must be pressed
   * again before it acts.
   */
  markPaused(): void {
    this.#paused = true
    this.#held.clear()
    this.#lookX = 0
    this.#lookY = 0
  }

  /** Leave the paused state. The caller — never this class — decides when. */
  markResumed(): void {
    this.#paused = false
  }

  #pauseAs(cause: PauseCause): void {
    if (this.#paused) return
    this.markPaused()
    this.#callbacks.onPause(cause)
  }

  // ── listeners ──────────────────────────────────────────────────────────────

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return
    const action = this.#bindings.actionFor(event.code)
    if (action === undefined) return
    // Contract invariant 5: *key events never reach the world while paused* —
    // so a gameplay action is dropped wholesale. The pause screen itself still
    // has to hear something, though: `ui.*` is the one prefix that passes
    // through, which is what lets the Escape that opened a screen dismiss it
    // again (FR-032) rather than stranding the player behind an overlay.
    const ui = action.startsWith('ui.')
    if (this.#paused && !ui) return
    // Movement and break are held; the browser must not also scroll or open
    // its own menu on a key the game owns.
    if (action === 'move.jump' || action === 'world.break') event.preventDefault()
    this.#held.add(event.code)
    this.#callbacks.onActionDown?.(action, this.#bindings.kindOf(action))
  }

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    const action = this.#bindings.actionFor(event.code)
    if (action === undefined) return
    if (!this.#held.delete(event.code)) return
    if (this.#paused && !action.startsWith('ui.')) return
    this.#callbacks.onActionUp?.(action, this.#bindings.kindOf(action))
  }

  readonly #onMouseDown = (event: MouseEvent): void => {
    if (this.#paused) return
    const token = mouseToken(event.button)
    const action = this.#bindings.actionFor(token)
    if (action === undefined) return
    this.#held.add(token)
    this.#callbacks.onActionDown?.(action, this.#bindings.kindOf(action))
  }

  readonly #onMouseUp = (event: MouseEvent): void => {
    const token = mouseToken(event.button)
    const action = this.#bindings.actionFor(token)
    if (action === undefined) return
    if (!this.#held.delete(token)) return
    if (this.#paused) return
    this.#callbacks.onActionUp?.(action, this.#bindings.kindOf(action))
  }

  readonly #onMouseMove = (event: MouseEvent): void => {
    if (this.#paused || !this.#locked) return
    this.#lookX += event.movementX
    this.#lookY += event.movementY
  }

  readonly #onCanvasClick = (): void => {
    if (!this.#locked && !this.#paused) this.requestLock()
  }

  /** The browser's right-click menu is not this game's place button. */
  readonly #onContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  readonly #onLockChange = (): void => {
    const locked = document.pointerLockElement === this.#canvas
    this.#locked = locked
    if (locked) {
      this.markResumed()
      this.#callbacks.onLocked?.()
      return
    }
    // Only a loss matters: refusing to lock never sets `pointerLockElement`,
    // so this fires solely for capture that was held and then went away.
    this.#pauseAs('pointer-lost')
  }

  readonly #onLockError = (): void => {
    this.#pauseAs('pointer-refused')
  }

  readonly #onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.#pauseAs('surface-hidden')
  }
}

/** The token `Bindings` uses for a mouse button: `mouse0`, `mouse2`, … */
function mouseToken(button: number): string {
  return `mouse${String(button)}`
}
