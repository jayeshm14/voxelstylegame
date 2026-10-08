/**
 * The composition root — FR-046, `plan.md` Project Structure (`src/main.ts`).
 *
 * This is the only module in `src/` that owns *when* the game runs: it
 * constructs every subsystem, wires them to each other, and drives
 * {@link GameLoop} from `requestAnimationFrame`. Nothing else starts a loop,
 * which is what makes FR-046's "exactly one entry point" checkable by reading
 * the import graph rather than by trusting a convention.
 *
 * ## What runs where
 *
 * | cadence | work | why there |
 * |---|---|---|
 * | **tick** (20/s) | `ChunkManager.plan` + `generate`, mouse look, `stepPhysics` | simulation — Principle II forbids any of it from reacting to frame rate |
 * | **frame** (display rate) | `ChunkManager.mesh` + `unload`, camera follow, `render` | presentation — remeshing and drawing are bounded per frame, not per tick (FR-039) |
 *
 * Pausing is enforced in exactly one place: `onTick` returns early unless
 * `gameState.isPlaying`. Rendering deliberately keeps running, so a paused
 * world stays on screen behind the overlay instead of freezing to whatever was
 * last drawn and going stale (FR-009: pause *stops the simulation*, not the
 * picture).
 *
 * ## The clock exemption
 *
 * Principle I forbids `performance.now()` in world and gameplay-logic code.
 * The composition root is neither: `GameLoop`'s own contract is that "the
 * composition root measures wall-clock time and passes the difference in", and
 * `loop.advance()` clamps, banks and drains that measurement so no gameplay
 * value is ever derived from it directly.
 */

import { LIGHTING_KEYFRAMES, SEED, WORLD } from './core/GameConfig'
import { GameLoop } from './core/GameLoop'
import { GameState } from './core/GameState'
import { Bindings } from './input/Bindings'
import { InputManager } from './input/InputManager'
import { Player } from './player/Player'
import { stepPhysics } from './player/Physics'
import { Camera } from './rendering/Camera'
import { Renderer } from './rendering/Renderer'
import { isSolid } from './world/BlockRegistry'
import { ChunkManager } from './world/ChunkManager'
import { World } from './world/World'

/**
 * The player's starting position, found by scanning column `(0, 0)` downward
 * for the first solid block and standing on top of it.
 *
 * **Superseded by T094.** `data-model.md` §2's rule scans outward in a fixed
 * spiral until it finds a *non-water* surface so spawn never lands on the sea
 * floor; that belongs in `src/player/Player.ts` and to source phase 9. Source
 * phase 6 needs somewhere to stand, and this is the smallest thing that is
 * genuinely correct rather than a magic y: the world's bottom layer is solid by
 * construction (FR-004), so a resident column always yields ground.
 */
function spawnPlayer(world: World): Player {
  const x = 0.5
  const z = 0.5
  let player: Player | null = null
  for (let y = WORLD.HEIGHT - 1; y >= 0; y--) {
    if (isSolid(world.getBlock(0, y, 0))) {
      player = new Player(x, y + 1, z)
      break
    }
  }
  if (player === null) {
    // Unreachable while the bottom layer is solid; kept so a future generation
    // change degrades to a fall rather than to `NaN`.
    player = new Player(x, WORLD.SEA_LEVEL + 2, z)
  }
  faceWorldCentre(player)
  return player
}

/**
 * Turn the player to face the middle of the world.
 *
 * Spawn sits at column `(0, 0)` — a **corner** of the finite 16 × 16-region
 * grid — and `Player`'s default heading is yaw 0, which faces −Z: straight off
 * the edge of the map. The first frame would then contain only sky, which reads
 * as a game that failed to draw rather than as one whose camera happens to be
 * pointed at nothing. `spec.md` fixes the spawn *position* (`data-model.md` §2)
 * and is silent on heading, so this is the composition root's choice: one
 * `atan2` toward the centre puts terrain in view from any spawn column.
 *
 * The heading is derived rather than hardcoded because the "into the world"
 * direction depends on which column the spawn rule lands on — a spiral that
 * finds no non-water surface at `(0, 0)` walks outward, and this function must
 * not care where it finally stops.
 */
function faceWorldCentre(player: Player): void {
  const centreX = (WORLD.REGION_COUNT_X * WORLD.REGION_SIZE_X) / 2
  const centreZ = (WORLD.REGION_COUNT_Z * WORLD.REGION_SIZE_Z) / 2
  const dx = centreX - player.x
  const dz = centreZ - player.z
  if (dx === 0 && dz === 0) return
  // `forward` is `(−sin yaw, −cos yaw)`, so yaw solves as `atan2(−dx, −dz)`.
  player.setOrientation(Math.atan2(-dx, -dz), 0)
}

function boot(): void {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  const host = document.getElementById('app') ?? document.body
  host.appendChild(canvas)

  const gameState = new GameState()
  const world = new World(SEED.DEFAULT)
  const chunks = new ChunkManager(world)
  const renderer = new Renderer(canvas, SEED.DEFAULT)
  const camera = new Camera()

  // FR-046: boot straight into a generated world — there is no menu branch.
  // Seeding region (0, 0) here rather than on the first tick is what lets the
  // spawn point be *found* instead of guessed; everything after it streams in
  // through the ordinary tick cadence.
  gameState.startWorld()
  chunks.plan(0, 0)
  chunks.generate()
  const player = spawnPlayer(world)

  const input = new InputManager({
    canvas,
    bindings: new Bindings(),
    callbacks: {
      // FR-009's three automatic events, all landing on the single pause path.
      onPause: (cause) => {
        gameState.autoPause(cause)
      },
      // Pointer capture granted: play may resume, but only from an explicit
      // grant — never on a timer, never on its own (FR-009).
      onLocked: () => {
        if (gameState.isPaused) gameState.resume()
        input.markResumed()
      },
      onActionDown: (action) => {
        if (action === 'ui.pause') {
          gameState.escape()
        } else if (action === 'ui.inventory') {
          if (gameState.isInventoryOpen) gameState.closeInventory()
          else gameState.openInventory()
        } else {
          return
        }
        // Whatever the transition did, the input layer follows it: the world
        // reads nothing while paused, and holds nothing to leak on the way out.
        if (gameState.isPlaying) input.markResumed()
        else input.markPaused()
      },
    },
  })

  const loop = new GameLoop({
    onTick: (_tick, dt) => {
      // The whole of FR-009's "stop advancing the simulation" is this guard.
      if (!gameState.isPlaying) return

      // Look is consumed here rather than per frame: `player.yaw` is aim state
      // that the raycast reads on the tick, so sampling it at frame rate would
      // make block targeting depend on frame timing (Principle II).
      const look = input.consumeLook()
      player.rotate(look.deltaYaw, look.deltaPitch)

      chunks.plan(
        Math.floor(player.x / WORLD.REGION_SIZE_X),
        Math.floor(player.z / WORLD.REGION_SIZE_Z),
      )
      chunks.generate()

      stepPhysics(world, player, input.axes(), dt)
    },
    onRender: (alpha, tick) => {
      // Meshing and eviction are per-frame work: each is bounded by
      // STREAMING.MAX_MESHES_PER_FRAME, and neither advances simulation state.
      for (const region of chunks.mesh()) {
        renderer.upsertRegion(region.cx, region.cz, region.mesh)
      }
      for (const region of chunks.unload()) {
        renderer.releaseRegion(region.cx, region.cz)
      }

      camera.setOrientation(player.yaw, player.pitch)
      camera.setPosition(player.x, player.eyeY, player.z)
      renderer.render(camera.camera, tick)
      void alpha // presentation only; the simulation never reads it back
    },
  })

  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight, window.devicePixelRatio)
    camera.setAspect(window.innerWidth / window.innerHeight)
  }
  resize()
  window.addEventListener('resize', resize)

  // FR-027's *interpolation* arrives with `rendering/Sky.ts` in source phase 10;
  // until then the scene takes its light from the noon row of the keyframes that
  // already live in `GameConfig`, so source phase 6 boots into daylight instead
  // of into the clear colour's default black. Reading the row rather than a
  // literal keeps the single source of configuration intact (Constitution III),
  // and hands over cleanly: `Sky.ts` will call this same method per tick with
  // interpolated values in place of this one fixed call.
  const noon = LIGHTING_KEYFRAMES.find((keyframe) => keyframe.name === 'noon')
  if (noon !== undefined) renderer.applyLighting(noon.sky, noon.ambient, noon.directional)

  input.attach()

  // The single clock entry point: measure, difference, hand over. `GameLoop`
  // does the clamping and banking, so a backgrounded tab resumes without a
  // catch-up burst (R14) and a paused game ticks nothing at all.
  let previous = performance.now()
  const frame = (now: number): void => {
    const elapsed = (now - previous) / 1000
    previous = now
    loop.advance(elapsed)
    window.requestAnimationFrame(frame)
  }
  window.requestAnimationFrame(frame)
}

boot()
