/**
 * The fixed-timestep accumulator — Constitution Principle II and research R14.
 *
 * Simulation advances at exactly 20 ticks/s. This class owns *when* a tick runs,
 * never what a tick does: elapsed time arrives through {@link GameLoop.advance},
 * is banked, and is drained in exact `TICK_DT` steps. Rendering is handed the
 * leftover fraction as an interpolation alpha so it can draw a state that lies
 * strictly between the previous and the current tick.
 *
 * Nothing here reads a clock. `performance.now()`, `Date.now()` and
 * `Math.random()` are forbidden by Principle I — the composition root measures
 * wall-clock time and passes the difference in. That is what makes the loop
 * drivable from a test with synthetic elapsed times and **no real timers**.
 *
 * The accumulator is capped at `TIME.MAX_ACCUMULATED_SECONDS` so a tab resumed
 * after minutes in the background cannot schedule an unbounded catch-up burst
 * (R14): the excess is dropped rather than banked, which costs at most
 * `MAX_ACCUMULATED_SECONDS` of game time after a stall and never a freeze.
 *
 * Constitution test area: *fixed timestep*.
 */

import { TIME } from './GameConfig'

/** Called exactly once per tick, in ascending tick order, with no gaps. */
export type TickHandler = (tick: number, dt: number) => void

/**
 * Called after every `advance`, including frames that ran zero ticks.
 *
 * @param alpha  elapsed fraction of the current tick, in `[0, 1)` — the
 *               interpolation weight between the previous tick's state and this
 *               one's. Never fed back into the simulation.
 * @param tick   the tick whose state is current once the ticks have drained.
 */
export type RenderHandler = (alpha: number, tick: number) => void

export interface GameLoopHooks {
  readonly onTick: TickHandler
  readonly onRender: RenderHandler
}

export class GameLoop {
  readonly #hooks: GameLoopHooks

  /** Banked time not yet enough for a whole tick. Always in `[0, TICK_DT)`. */
  #accumulator = 0
  /** Monotonic tick counter; starts at 0 and only ever increases. */
  #tick = 0

  constructor(hooks: GameLoopHooks) {
    if (typeof hooks.onTick !== 'function' || typeof hooks.onRender !== 'function') {
      throw new TypeError('GameLoop requires onTick and onRender handlers')
    }
    this.#hooks = hooks
  }

  /** The simulation tick most recently completed. */
  get tick(): number {
    return this.#tick
  }

  /**
   * Interpolation alpha of the pending partial tick, in `[0, 1)`.
   * Presentation only — no simulation value may be derived from it.
   */
  get alpha(): number {
    return this.#accumulator / TIME.TICK_DT_SECONDS
  }

  /**
   * Bank `elapsedSeconds` of wall time and drain whole ticks from it.
   *
   * @param elapsedSeconds  time since the previous call, measured by the caller
   * @returns how many ticks were run — 0 on an ordinary frame
   * @throws RangeError if `elapsedSeconds` is not a finite number; a `NaN` would
   *         poison the accumulator permanently and silently stop the simulation
   */
  advance(elapsedSeconds: number): number {
    if (!Number.isFinite(elapsedSeconds)) {
      throw new RangeError(
        `GameLoop.advance expects a finite number of seconds, received ${String(elapsedSeconds)}`,
      )
    }

    // A backwards clock must not rewind the simulation; clamp to zero.
    this.#accumulator += Math.max(0, elapsedSeconds)

    // R14 stall cap: drop the excess rather than bank it.
    if (this.#accumulator > TIME.MAX_ACCUMULATED_SECONDS) {
      this.#accumulator = TIME.MAX_ACCUMULATED_SECONDS
    }

    const dt = TIME.TICK_DT_SECONDS
    let steps = 0
    while (this.#accumulator >= dt) {
      this.#accumulator -= dt
      this.#tick += 1
      this.#hooks.onTick(this.#tick, dt)
      steps += 1
    }

    // Rendering gets the leftover fraction; it never writes back.
    this.#hooks.onRender(this.#accumulator / dt, this.#tick)
    return steps
  }

  /** Drop banked time without running it. Used when leaving a world. */
  flush(): void {
    this.#accumulator = 0
  }
}
