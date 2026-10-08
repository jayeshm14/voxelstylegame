/**
 * Session game state — `data-model.md` §11, FR-009, FR-032, FR-033.
 *
 * Three modes and, inside `paused`, exactly **two mutually exclusive screens**.
 * The invariants are structural rather than conventional: `screen` is non-null
 * if and only if `mode === 'paused'`, and every transition is an explicit method
 * that refuses an illegal move instead of silently ignoring it. There is no
 * stacked-overlay representation to reach in the first place, so "the inventory
 * and the pause menu are never shown together" (FR-032) cannot be violated by a
 * later call site.
 *
 * The rules this encodes, all from FR-032 as amended 2026-10-05:
 *
 * - `playing` + Escape → `paused[pause]`
 * - `playing` + E      → `paused[inventory]` (which also saves, FR-032)
 * - `paused[inventory]` + Escape **or** E → `playing` — *not* to the pause menu
 * - the pause menu is therefore reachable only by pressing Escape again once
 *   play has resumed: one press in, one press out
 * - `paused[pause]` + Escape → `playing` (dismiss the top screen)
 * - leaving a world passes through `paused[pause]` — there is **no**
 *   `playing → menu` path, so FR-022's save-on-exit always happens first
 *
 * Pure state: no I/O, no clock, no listeners. Callers act on the boolean each
 * transition returns, which is what keeps the save path and the pause overlay
 * wired by their own tasks rather than reaching in from here.
 */

export type GameMode = 'menu' | 'playing' | 'paused'

/** The two screens `paused` may hold — never both at once (FR-032). */
export type PausedScreen = 'pause' | 'inventory'

/** What an Escape press did, so the caller can route audio, overlay and save. */
export type EscapeOutcome =
  /** `playing` → `paused[pause]`: the pause overlay must appear. */
  | 'opened-pause'
  /** A paused screen was dismissed back to `playing`. */
  | 'closed-to-playing'
  /** No legal transition applied; nothing to do. */
  | 'ignored'

/** Result of any attempted transition: did the mode actually change? */
export type TransitionOutcome = 'changed' | 'ignored'

export class GameState {
  #mode: GameMode = 'menu'
  #screen: PausedScreen | null = null

  get mode(): GameMode {
    return this.#mode
  }

  /** The open paused screen, or `null` whenever the mode is not `paused`. */
  get screen(): PausedScreen | null {
    return this.#screen
  }

  get isMenu(): boolean {
    return this.#mode === 'menu'
  }

  get isPlaying(): boolean {
    return this.#mode === 'playing'
  }

  get isPaused(): boolean {
    return this.#mode === 'paused'
  }

  /** `paused[pause]` — the pause overlay is showing. */
  get isPauseMenuOpen(): boolean {
    return this.#mode === 'paused' && this.#screen === 'pause'
  }

  /** `paused[inventory]` — the inventory overlay is showing. */
  get isInventoryOpen(): boolean {
    return this.#mode === 'paused' && this.#screen === 'inventory'
  }

  /**
   * Enter a world from the main menu. The caller must already hold the session
   * lock (FR-023); a refused lock never reaches this method, which is why a
   * refusal is reported as no transition at all rather than as an error.
   */
  startWorld(): TransitionOutcome {
    if (this.#mode !== 'menu') return 'ignored'
    this.#to('playing', null)
    return 'changed'
  }

  /**
   * Open the pause menu. Only reachable from `playing` — FR-032's "the pause
   * menu is reachable only by pressing Escape again once play has resumed".
   */
  openPauseMenu(): TransitionOutcome {
    if (this.#mode !== 'playing') return 'ignored'
    this.#to('paused', 'pause')
    return 'changed'
  }

  /**
   * FR-009's single pause path: pointer refused, pointer lost and surface hidden
   * all arrive here. Always shows the pause screen, never the inventory.
   */
  autoPause(): TransitionOutcome {
    return this.openPauseMenu()
  }

  /** Open the inventory from play (FR-032). */
  openInventory(): TransitionOutcome {
    if (this.#mode !== 'playing') return 'ignored'
    this.#to('paused', 'inventory')
    return 'changed'
  }

  /** Close the inventory back to play. E and Escape both land here. */
  closeInventory(): TransitionOutcome {
    if (this.#mode !== 'paused' || this.#screen !== 'inventory') return 'ignored'
    this.#to('playing', null)
    return 'changed'
  }

  /** Dismiss whatever is on top: resume from the pause menu, or close inventory. */
  resume(): TransitionOutcome {
    if (this.#mode !== 'paused') return 'ignored'
    this.#to('playing', null)
    return 'changed'
  }

  /**
   * One press in, one press out.
   *
   * From `playing` Escape opens the pause menu; from `paused[inventory]` it
   * closes the inventory and returns straight to `playing`, **never** to the
   * pause menu; from `paused[pause]` it dismisses that screen. The two paused
   * screens are never exchanged directly, so they cannot stack.
   */
  escape(): EscapeOutcome {
    if (this.#mode === 'playing') {
      this.#to('paused', 'pause')
      return 'opened-pause'
    }
    if (this.#mode === 'paused') {
      this.#to('playing', null)
      return 'closed-to-playing'
    }
    return 'ignored'
  }

  /**
   * Save-and-return to the main menu (FR-033's "Save and return to Main Menu").
   *
   * Only from `paused[pause]`: there is deliberately no `playing → menu` path,
   * so leaving a world can never bypass the save that FR-022 requires.
   */
  returnToMenu(): TransitionOutcome {
    if (this.#mode !== 'paused' || this.#screen !== 'pause') return 'ignored'
    this.#to('menu', null)
    return 'changed'
  }

  #to(mode: GameMode, screen: PausedScreen | null): void {
    this.#mode = mode
    this.#screen = mode === 'paused' ? screen : null
  }
}
