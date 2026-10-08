/**
 * Streaming — the queue, FR-039's two budgets, and unload + dispose.
 *
 * `plan.md` Project Structure places this file beside `World` under `src/world/`,
 * and the name is load-bearing: `plan.md` says file and class names are part of
 * the contract (`ChunkManager`, `ChunkMesher`, `chunk-purity.test.ts`), so there
 * is no latitude to relocate it.
 *
 * ## The loop it implements (`research.md` R12)
 *
 * Per **tick**: compute the desired set for the current view distance, enqueue
 * everything missing sorted by `(distance², cx, cz)`, generate at most
 * `STREAMING.MAX_GENERATIONS_PER_TICK`, then unload anything outside
 * `view distance + STREAMING.RETENTION_MARGIN_REGIONS`.
 *
 * Per **frame**: mesh at most `STREAMING.MAX_MESHES_PER_FRAME`, nearest dirty
 * first.
 *
 * The two budgets are deliberately reachable only through separate methods,
 * because FR-039 states them as *"two separately stated and separately
 * verifiable limits"* — one `step()` that did both would make it impossible to
 * say which bound a given number of operations exercised. `GameLoop` will call
 * `generate()` from its fixed-step accumulator and `mesh()` once per rendered
 * frame; nothing here runs on a timer of its own (Constitution Principle II:
 * fixed timestep, no real timers).
 *
 * ## Ordering
 *
 * Every list this class produces is sorted before it is consumed, by
 * `(distance², cx, cz)` against the focus region, with `distance²` being the
 * squared Euclidean distance between region coordinates. The sort is total —
 * `(cx, cz)` pair uniquely identifies a region — so two runs from the same world
 * state generate and mesh in exactly the same order. That is what makes the
 * bounded work per step *reproducible* rather than merely bounded: a queue
 * drained in hash order would respect the same count and still be a different
 * frame (Principle II).
 *
 * ## What "dispose" means here
 *
 * `mesh()` hands the built {@link RegionMesh} to its caller and keeps a
 * reference; `unload()` hands the same object back and drops it, so the CPU-side
 * vertex buffers become garbage and the renderer — which owns the GPU objects
 * keyed by the same coordinates — can release them. FR-039 requires *"release
 * the rendering resources of any region outside the retained view distance"*;
 * the release is split because neither half can do the other's job: this class
 * knows which regions left, the renderer knows what to free.
 *
 * ## What survives an unload
 *
 * `chunk.modified` — the player's edits — is *retained* rather than dropped and
 * re-applied the next time that region is generated (R12). Without it, walking
 * away from a build and coming back would silently regenerate the terrain
 * underneath it, which `FR-021` and `SC-007` forbid in the save path and R12
 * forbids in the streaming path.
 *
 * Constitution test areas: budgets are enforced end to end by `T108`; the
 * determinism this file rests on is `tests/seed-reproducibility.test.ts`.
 */

import { STREAMING, WORLD } from '../core/GameConfig'
import { buildRegionMesh, type RegionMesh } from '../rendering/ChunkMesher'
import { Chunk } from './Chunk'
import { World } from './World'
import { generateChunk } from './generateChunk'

/** A region waiting to be generated, and how far from the focus it sits. */
export interface QueuedRegion {
  readonly cx: number
  readonly cz: number
  /** Squared Euclidean distance from the focus region — never a root, never a float. */
  readonly dist2: number
}

/** A region whose mesh was built this frame. */
export interface MeshedRegion {
  readonly cx: number
  readonly cz: number
  readonly mesh: RegionMesh
}

/** A region that left the retained view distance; its resources are now the caller's to free. */
export interface UnloadedRegion {
  readonly cx: number
  readonly cz: number
  /** The mesh that must be released, or `undefined` if it was never built. */
  readonly mesh: RegionMesh | undefined
}

function squaredDistance(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

/** `(distance², cx, cz)` — total, so the order never falls back to map layout. */
function byDistanceThenCoord(a: QueuedRegion, b: QueuedRegion): number {
  if (a.dist2 !== b.dist2) return a.dist2 - b.dist2
  if (a.cx !== b.cx) return a.cx - b.cx
  return a.cz - b.cz
}

/**
 * FR-034 fixes view distance at 2–12 regions. A request outside that range is
 * **clamped**, not rejected: the value arrives from a settings slider whose own
 * bounds are 2–12, and a manager that refused the number the slider showed would
 * leave the UI reporting a distance the world is not honouring. A non-finite
 * request falls back to `VIEW_DISTANCE_DEFAULT` rather than poisoning every
 * subsequent radius comparison with `NaN`.
 */
function clampViewDistance(distance: number): number {
  if (!Number.isFinite(distance)) return STREAMING.VIEW_DISTANCE_DEFAULT
  const rounded = Math.round(distance)
  if (rounded < STREAMING.VIEW_DISTANCE_MIN) return STREAMING.VIEW_DISTANCE_MIN
  if (rounded > STREAMING.VIEW_DISTANCE_MAX) return STREAMING.VIEW_DISTANCE_MAX
  return rounded
}

/** Inside the fixed playable extent — 16 × 16 regions (FR-004). */
function inWorld(cx: number, cz: number): boolean {
  return (
    cx >= 0 && cx < WORLD.REGION_COUNT_X && cz >= 0 && cz < WORLD.REGION_COUNT_Z
  )
}

export class ChunkManager {
  /** The registry this manager streams into. */
  readonly world: World

  #viewDistance: number
  #focusCx = 0
  #focusCz = 0
  #queue: QueuedRegion[] = []

  /**
   * `plan()` has run at least once. Until it has, the focus is a placeholder
   * rather than a fact, and unloading against a placeholder would evict
   * everything the moment a manager is constructed.
   */
  #planned = false

  /** Meshes for resident regions, keyed by `World.key` — the set FR-039 bounds. */
  readonly #meshes = new Map<string, RegionMesh>()

  /** Edits belonging to regions that are *not* resident, waiting to be re-applied. */
  readonly #retained = new Map<string, Map<number, number>>()

  constructor(world: World, viewDistance: number = STREAMING.VIEW_DISTANCE_DEFAULT) {
    this.world = world
    this.#viewDistance = clampViewDistance(viewDistance)
  }

  /** Currently configured view distance in regions, always within FR-034's range. */
  get viewDistance(): number {
    return this.#viewDistance
  }

  /** Regions waiting to be generated. Empty after {@link plan} if the world is caught up. */
  get queued(): ReadonlyArray<QueuedRegion> {
    return this.#queue
  }

  /** Meshes currently held. Bounded by the retained region count (FR-039). */
  get meshCount(): number {
    return this.#meshes.size
  }

  /** Number of retained edit maps for regions that are away right now. */
  get retainedCount(): number {
    return this.#retained.size
  }

  /**
   * Rebuild the queue for a new focus.
   *
   * Rebuilding rather than patching is what keeps this correct when the view
   * distance *drops*: FR-039 explicitly requires releasing resources *"including
   * when the view distance setting is lowered"*, and a queue computed while the
   * distance was 12 would otherwise keep generating regions a distance of 5 no
   * longer wants. Regions outside `0 … 15` on either axis are skipped — the
   * playable extent is fixed, and generating beyond it would spend memory the
   * player cannot reach.
   *
   * @param cx focus region x (the player's region)
   * @param cz focus region z
   */
  plan(cx: number, cz: number): void {
    this.#focusCx = cx
    this.#focusCz = cz
    this.#planned = true

    const radius = this.#viewDistance
    const missing: QueuedRegion[] = []
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = cx + dx
        const tz = cz + dz
        if (!inWorld(tx, tz)) continue
        if (this.world.hasChunk(tx, tz)) continue
        missing.push({ cx: tx, cz: tz, dist2: dx * dx + dz * dz })
      }
    }
    missing.sort(byDistanceThenCoord)
    this.#queue = missing
  }

  /**
   * Generate the nearest queued regions, at most
   * `STREAMING.MAX_GENERATIONS_PER_TICK` of them (FR-039).
   *
   * Call once per simulation tick, from the fixed step — never from a frame
   * callback, or the budget would become frame-rate dependent and stop being the
   * per-tick bound FR-039 specifies.
   *
   * @returns how many regions were actually generated. Entries that turn out to
   *          be resident already are skipped without counting, so a stale queue
   *          can never let a real generation slip past the bound — nor can it
   *          spend the whole tick shuffling entries that are already done.
   */
  generate(): number {
    let produced = 0
    while (produced < STREAMING.MAX_GENERATIONS_PER_TICK && this.#queue.length > 0) {
      const next = this.#queue.shift() as QueuedRegion
      if (this.world.hasChunk(next.cx, next.cz)) continue
      this.#create(next.cx, next.cz)
      produced++
    }
    return produced
  }

  /**
   * Rebuild the nearest dirty regions, at most `STREAMING.MAX_MESHES_PER_FRAME`
   * of them (FR-039).
   *
   * Call once per rendered frame, not once per tick: meshing produces vertex
   * buffers a renderer consumes, and its budget is stated per frame.
   *
   * A dirty flag is cleared only after its mesh is stored, so a region that is
   * edited mid-frame stays dirty and is picked up by the next one.
   *
   * @returns the regions built this call, nearest first
   */
  mesh(): MeshedRegion[] {
    const dirty: Chunk[] = []
    for (const chunk of this.world.values()) {
      if (chunk.dirty) dirty.push(chunk)
    }
    // Nearest dirty first, with the same total order the generation queue uses.
    dirty.sort((a, b) => {
      const da = squaredDistance(a.cx, a.cz, this.#focusCx, this.#focusCz)
      const db = squaredDistance(b.cx, b.cz, this.#focusCx, this.#focusCz)
      if (da !== db) return da - db
      if (a.cx !== b.cx) return a.cx - b.cx
      return a.cz - b.cz
    })

    const built: MeshedRegion[] = []
    const limit = STREAMING.MAX_MESHES_PER_FRAME
    for (let i = 0; i < dirty.length && i < limit; i++) {
      const chunk = dirty[i] as Chunk
      const mesh = buildRegionMesh(this.world, chunk.cx, chunk.cz)
      this.#meshes.set(World.key(chunk.cx, chunk.cz), mesh)
      chunk.clearDirty()
      built.push({ cx: chunk.cx, cz: chunk.cz, mesh })
    }
    return built
  }

  /**
   * Evict every region outside `view distance + retention margin`, returning
   * what has to be released (FR-039, R12).
   *
   * The retained set is **square**, matching the square desired set
   * {@link plan} computes: view distance is measured in regions in every
   * direction, and `MAX_RETAINED_REGIONS` is the area of that square, so a
   * circular test here would disagree with the bound it is meant to satisfy.
   *
   * Does nothing until {@link plan} has run, because until then the focus is an
   * assumption rather than an observation.
   *
   * @returns the regions removed, with their meshes; `mesh` is `undefined` when
   *          the region was never meshed
   */
  unload(): UnloadedRegion[] {
    if (!this.#planned) return []

    const limit = this.#viewDistance + STREAMING.RETENTION_MARGIN_REGIONS
    const removed: UnloadedRegion[] = []

    // Snapshot: `removeChunk` mutates the map `values()` is walking.
    for (const chunk of [...this.world.values()]) {
      const dx = Math.abs(chunk.cx - this.#focusCx)
      const dz = Math.abs(chunk.cz - this.#focusCz)
      if (Math.max(dx, dz) <= limit) continue

      const key = World.key(chunk.cx, chunk.cz)
      this.world.removeChunk(chunk.cx, chunk.cz)
      const mesh = this.#meshes.get(key)
      this.#meshes.delete(key)

      // The edits leave with the region and come back with it — R12's whole
      // reason for keeping `modified` separate from the generated bytes.
      if (chunk.modified.size > 0) this.#retained.set(key, chunk.modified)

      removed.push({ cx: chunk.cx, cz: chunk.cz, mesh })
    }

    removed.sort((a, b) => {
      if (a.cx !== b.cx) return a.cx - b.cx
      return a.cz - b.cz
    })
    return removed
  }

  /** The mesh currently held for a region, if it has one. */
  meshAt(cx: number, cz: number): RegionMesh | undefined {
    return this.#meshes.get(World.key(cx, cz))
  }

  /** Build one region from `generateChunk` and restore any edits it has away. */
  #create(cx: number, cz: number): void {
    const key = World.key(cx, cz)
    const chunk = new Chunk(cx, cz, generateChunk(this.world.seed, cx, cz))
    // The constructor starts regions clean because a chunk adopted from a save
    // already matches its mesh; a freshly generated one has no mesh at all.
    chunk.dirty = true

    const away = this.#retained.get(key)
    if (away !== undefined) {
      for (const [index, id] of away) {
        chunk.blocks[index] = id
        chunk.modified.set(index, id)
      }
      this.#retained.delete(key)
    }

    // `put` marks all eight neighbours dirty, so the borders this region
    // replaced air against are rebuilt with it in place.
    this.world.put(chunk)
  }
}
