/**
 * Culling mesher and FR-044 illumination — `plan.md` Project Structure.
 *
 * Two jobs the specification deliberately binds together: *"Any block change
 * MUST recompute lighting for the changed region and for any region whose light
 * crosses its boundary, **through the same remesh path as FR-014**, so that a
 * light change appears within one frame refresh alongside the block change
 * (SC-011)."* Both live here so a caller cannot remesh without relighting or
 * relight without remeshing. `plan.md`'s structure has no separate `Light.ts`,
 * and inventing one would have split exactly the path FR-044 says must stay
 * whole (TD-025).
 *
 * ## Culling (`contracts/registries.md`)
 *
 * > a face is emitted iff the neighbour is AIR, **or** the neighbour is
 * > transparent **and** the neighbour id differs from this id.
 *
 * Water beside water therefore culls its shared face, while stone beside water
 * keeps its own — both branches are pinned in `tests/mesher.test.ts`.
 *
 * ## Lighting (`research.md` R17)
 *
 * Two monotone flood fills over a 0–15 scale, combined by `max`:
 *
 * 1. **Skylight** — seeded at `LIGHT.SKYLIGHT_SOURCE` on every non-opaque cell
 *    with no opaque cell above it, then spread through non-opaque cells losing
 *    exactly `LIGHT.FALLOFF_PER_BLOCK` per cell.
 * 2. **Block light** — seeded at each emitter (`lightEmission`, torch = 14),
 *    spread identically.
 *
 * A level is accepted only when **strictly greater** than the one recorded.
 * Because buckets are drained in strictly non-increasing level order, a cell is
 * first written at its maximum and never revisited: the result is the maximum
 * over all paths, hence independent of visit order, hence reproducible under
 * FR-005 and Principle I without needing to be an exception to them.
 *
 * ## Why the fill spans a 3 × 3 block of regions
 *
 * Light travels at most 15 cells, a region is 16 wide, so a cell in the target
 * region can be lit from anywhere in the eight neighbouring regions and no
 * further — the ring's *outermost* column is exactly 16 away and therefore one
 * level beyond reach. Filling that whole domain from `blocks` alone, and never
 * reading a neighbour's `light`, is what makes
 * `computeLight(world, cx, cz)` independent of which region is computed first:
 * every call is a pure function of the same block data. Reading neighbour light
 * instead would make the result depend on evaluation order — the divergence
 * risk 26 in `tasks.md` exists to catch.
 *
 * The fill also writes every *resident* region in that domain, which is
 * FR-044's *"the changed region and any region whose light crosses its
 * boundary"* stated literally.
 *
 * ## Scratch state
 *
 * The domain is 9 × 32 768 = 294 912 cells, so the light buffer and its queue
 * are allocated once at module scope rather than per call (1.5 MB, versus ~30
 * MB/s of garbage if every dirty region reallocated them at 20 ticks a second).
 * Both are **fully overwritten before use** — `light.fill(0)` and a `tail`
 * cursor that never reads past what the current call wrote — so no value from a
 * previous call is observable. This is a rendering module, not one of the eight
 * generation sources the contract's load-order-independence rule applies to; the
 * *result* remains a pure function of `(world, cx, cz)`.
 *
 * Constitution test areas: *mesher* (`tests/mesher.test.ts`, source §13 test 12).
 */

import { LIGHT } from '../core/GameConfig'
import { BLOCK, isTransparent, lightEmission } from '../world/BlockRegistry'
import {
  Chunk,
  REGION_BLOCK_COUNT,
  REGION_DEPTH,
  REGION_HEIGHT,
  REGION_WIDTH,
  blockIndex,
} from '../world/Chunk'
import { World } from '../world/World'
import { tileSlotFor, tileUv, type Face, type TileUv } from './TextureAtlas'

// ─────────────────────────────────────────────────────────────────────────────
// Domain fill
// ─────────────────────────────────────────────────────────────────────────────

/** Target region plus its eight neighbours: a 3 × 3 grid of regions. */
const DOMAIN_REGIONS = 9

const DOMAIN_CELL_COUNT = DOMAIN_REGIONS * REGION_BLOCK_COUNT

let domainLight = new Uint8Array(0)
let domainQueue = new Int32Array(0)

/**
 * The nine regions, `index = dz * 3 + dx`, refreshed on every fill.
 *
 * `null` means "not resident": `World.getBlock` reports AIR for such a region,
 * so the fill treats it the same way — an unloaded region has no terrain to
 * occlude or to emit from. The frontier this creates at view distance is
 * self-correcting rather than a seam left behind: `World.put` marks every
 * neighbour dirty when a region arrives, so a border meshed against empty space
 * is rebuilt once there is something to build it against.
 */
const domainChunks: Array<Chunk | null> = new Array<Chunk | null>(DOMAIN_REGIONS).fill(null)

function ensureScratch(): void {
  if (domainLight.length < DOMAIN_CELL_COUNT) {
    domainLight = new Uint8Array(DOMAIN_CELL_COUNT)
    domainQueue = new Int32Array(DOMAIN_CELL_COUNT)
  }
}

/**
 * Recompute illumination for the 3 × 3 domain around `(cx, cz)` from `blocks`
 * alone and return the domain buffer.
 *
 * @see the module header for why the domain is this wide and no wider
 */
function fillDomainLight(world: World, cx: number, cz: number): Uint8Array {
  ensureScratch()
  const light = domainLight
  const queue = domainQueue
  light.fill(0)

  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      domainChunks[j * 3 + i] = world.getChunk(cx - 1 + i, cz - 1 + j) ?? null
    }
  }

  let tail = 0

  // Pass 1 — skylight. Walking each column top-down with a running "is anything
  // opaque above me" flag is what makes "open to the sky" cost one pass over the
  // domain instead of a 128-step scan per cell.
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const base = (j * 3 + i) * REGION_BLOCK_COUNT
      const chunk = domainChunks[j * 3 + i] ?? null
      for (let z = 0; z < REGION_DEPTH; z++) {
        for (let x = 0; x < REGION_WIDTH; x++) {
          let open = true
          for (let y = REGION_HEIGHT - 1; y >= 0; y--) {
            const id =
              chunk === null ? BLOCK.AIR : (chunk.blocks[blockIndex(x, y, z)] as number)
            if (!isTransparent(id)) {
              open = false
              continue
            }
            if (!open) continue
            const idx = base + blockIndex(x, y, z)
            light[idx] = LIGHT.SKYLIGHT_SOURCE
            queue[tail++] = idx
          }
        }
      }
    }
  }

  // Pass 2 — emitters, enqueued strictly after every skylight seed so the queue
  // stays in non-increasing level order. `LIGHT.TORCH_LEVEL` (14) is below
  // `LIGHT.SKYLIGHT_SOURCE` (15), and `LIGHT.MAX` is 15, so that ordering holds
  // for any configuration the contract permits.
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const base = (j * 3 + i) * REGION_BLOCK_COUNT
      const chunk = domainChunks[j * 3 + i] ?? null
      for (let z = 0; z < REGION_DEPTH; z++) {
        for (let x = 0; x < REGION_WIDTH; x++) {
          for (let y = 0; y < REGION_HEIGHT; y++) {
            const idx = base + blockIndex(x, y, z)
            const id =
              chunk === null ? BLOCK.AIR : (chunk.blocks[blockIndex(x, y, z)] as number)
            const emitted = lightEmission(id)
            if (emitted > 0 && emitted > (light[idx] as number)) {
              light[idx] = emitted
              queue[tail++] = idx
            }
          }
        }
      }
    }
  }

  // Propagation. FIFO is enough because the queue is ordered by non-increasing
  // level: everything still queued when a level-L cell is dequeued is level L
  // or lower, so a cell can never be improved after its first write.
  let head = 0
  const floor = LIGHT.FALLOFF_PER_BLOCK
  while (head < tail) {
    const idx = queue[head++] as number
    const next = (light[idx] as number) - floor
    if (next <= 0) continue

    const regionIdx = Math.floor(idx / REGION_BLOCK_COUNT)
    const within = idx - regionIdx * REGION_BLOCK_COUNT
    const x = within % REGION_WIDTH
    const row = Math.floor(within / REGION_WIDTH)
    const z = row % REGION_DEPTH
    const y = Math.floor(row / REGION_DEPTH)
    const i = regionIdx % 3
    const j = Math.floor(regionIdx / 3)

    for (let d = 0; d < 6; d++) {
      const dir = DIRS[d] as readonly [number, number, number]
      const ny = y + dir[1]
      if (ny < 0 || ny >= REGION_HEIGHT) continue
      let ni = i
      let nj = j
      let nx = x + dir[0]
      let nz = z + dir[2]
      if (nx < 0) {
        ni = i - 1
        nx = REGION_WIDTH - 1
      } else if (nx >= REGION_WIDTH) {
        ni = i + 1
        nx = 0
      }
      if (nz < 0) {
        nj = j - 1
        nz = REGION_DEPTH - 1
      } else if (nz >= REGION_DEPTH) {
        nj = j + 1
        nz = 0
      }
      if (ni < 0 || ni > 2 || nj < 0 || nj > 2) continue

      const neighbour = domainChunks[nj * 3 + ni] ?? null
      const neighbourId =
        neighbour === null ? BLOCK.AIR : (neighbour.blocks[blockIndex(nx, ny, nz)] as number)
      // Light enters non-opaque cells only — an opaque cell keeps the 0 it was
      // never given, which is what seals a cave.
      if (!isTransparent(neighbourId)) continue

      const nIdx = (nj * 3 + ni) * REGION_BLOCK_COUNT + blockIndex(nx, ny, nz)
      if (next > (light[nIdx] as number)) {
        light[nIdx] = next
        queue[tail++] = nIdx
      }
    }
  }

  return light
}

/** Copy the computed domain into every resident region it covers (FR-044). */
function storeDomain(light: Uint8Array): void {
  for (let k = 0; k < DOMAIN_REGIONS; k++) {
    const chunk = domainChunks[k] ?? null
    if (chunk === null) continue
    chunk.light.set(light.subarray(k * REGION_BLOCK_COUNT, (k + 1) * REGION_BLOCK_COUNT))
  }
}

/**
 * Recompute illumination for `(cx, cz)` and every resident region it borders.
 *
 * Reads `blocks` only — never another region's `light` — so calling it twice in
 * either order produces byte-identical arrays.
 *
 * @throws RangeError if the region is not resident; there is nothing to store
 *         the result in, and silently returning would leave a caller believing
 *         a dark array was real data
 */
export function computeLight(world: World, cx: number, cz: number): void {
  if (!world.hasChunk(cx, cz)) {
    throw new RangeError(`region (${String(cx)}, ${String(cz)}) is not resident`)
  }
  storeDomain(fillDomainLight(world, cx, cz))
}

// ─────────────────────────────────────────────────────────────────────────────
// Faces
// ─────────────────────────────────────────────────────────────────────────────

/** Cell offsets of the six faces; also each face's outward normal. */
const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

interface FaceSpec {
  readonly dir: readonly [number, number, number]
  /** Outward normal, shared by all four corners. */
  readonly normal: readonly [number, number, number]
  /** Which of a block's three orientations this is, for {@link tileSlotFor}. */
  readonly orientation: Face
  /**
   * Four corners in winding order: `0,1` are the tile's bottom edge, `2,3` the
   * top, and `(1−0) × (3−0)` points along `normal` so three.js sees the face as
   * front-facing from outside the cube.
   */
  readonly corners: ReadonlyArray<readonly [number, number, number]>
  /** `LIGHT.FACE_*` for this orientation, resolved once. */
  readonly shade: number
}

function faceShade(orientation: Face): number {
  if (orientation === 'top') return LIGHT.FACE_UP
  if (orientation === 'bottom') return LIGHT.FACE_DOWN
  return LIGHT.FACE_SIDE
}

function faceSpec(
  dir: readonly [number, number, number],
  orientation: Face,
  corners: ReadonlyArray<readonly [number, number, number]>,
): FaceSpec {
  return { dir, normal: dir, orientation, corners, shade: faceShade(orientation) }
}

const FACES: ReadonlyArray<FaceSpec> = [
  faceSpec([1, 0, 0], 'side', [
    [1, 0, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ]),
  faceSpec([-1, 0, 0], 'side', [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ]),
  faceSpec([0, 1, 0], 'top', [
    [0, 1, 0],
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
  ]),
  faceSpec([0, -1, 0], 'bottom', [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ]),
  faceSpec([0, 0, 1], 'side', [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ]),
  faceSpec([0, 0, -1], 'side', [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ]),
]

/**
 * The contract's culling rule, in one line. `neighbourId` is already resolved:
 * an out-of-world or unloaded neighbour reports AIR, which is the case the rule
 * sends to "emit".
 */
function faceVisible(id: number, neighbourId: number): boolean {
  if (neighbourId === BLOCK.AIR) return true
  return neighbourId !== id && isTransparent(neighbourId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Mesh output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One mesh's vertex data.
 *
 * `positions` (3), `uvs` (2) and `light` (1) are exactly the vertex format
 * `plan.md` fixes, per six floats a vertex the source prompt states. `normals`
 * is the one addition: `MeshLambertMaterial` reads a `normal` attribute and has
 * no per-vertex hook that does not, so without it the FR-027 directional light
 * cannot shade the terrain at all (TD-026). `light` stays one float here and is
 * expanded to three at upload, because three.js's `vertexColors` consumes a
 * `vec3 color` (TD-027).
 */
export interface MeshData {
  /** Number of quads — four vertices and six indices each. */
  readonly faceCount: number
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly uvs: Float32Array
  /** `illumination / LIGHT.MAX × LIGHT.FACE_*`, one value per vertex. */
  readonly light: Float32Array
  readonly indices: Uint32Array
}

/** `plan.md`: *"Separate geometry per chunk into two meshes."* */
export interface RegionMesh {
  readonly opaque: MeshData
  readonly transparent: MeshData
}

/**
 * Vertex storage sized up front from a counted face total.
 *
 * Counting first means each buffer is allocated once at its exact length — no
 * geometric array growth to copy, and no oversized tail to trim afterwards.
 */
class MeshBuilder {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly uvs: Float32Array
  readonly light: Float32Array
  readonly indices: Uint32Array
  #vertex = 0
  faceCount = 0

  constructor(faceCapacity: number) {
    this.positions = new Float32Array(faceCapacity * 12) // 4 verts × 3
    this.normals = new Float32Array(faceCapacity * 12)
    this.uvs = new Float32Array(faceCapacity * 8) // 4 verts × 2
    this.light = new Float32Array(faceCapacity * 4) // 4 verts × 1
    this.indices = new Uint32Array(faceCapacity * 6)
  }

  addFace(
    cellX: number,
    cellY: number,
    cellZ: number,
    face: FaceSpec,
    uv: TileUv,
    shade: number,
  ): void {
    const v = this.#vertex
    for (let k = 0; k < 4; k++) {
      const corner = face.corners[k] as readonly [number, number, number]
      const p = (v + k) * 3
      this.positions[p] = cellX + corner[0]
      this.positions[p + 1] = cellY + corner[1]
      this.positions[p + 2] = cellZ + corner[2]
      this.normals[p] = face.normal[0]
      this.normals[p + 1] = face.normal[1]
      this.normals[p + 2] = face.normal[2]
      const t = (v + k) * 2
      this.uvs[t] = k === 1 || k === 2 ? uv.u1 : uv.u0
      this.uvs[t + 1] = k >= 2 ? uv.v1 : uv.v0
      this.light[v + k] = shade
    }
    const b = this.faceCount * 6
    this.indices[b] = v
    this.indices[b + 1] = v + 1
    this.indices[b + 2] = v + 2
    this.indices[b + 3] = v
    this.indices[b + 4] = v + 2
    this.indices[b + 5] = v + 3
    this.#vertex += 4
    this.faceCount++
  }

  build(): MeshData {
    return {
      faceCount: this.faceCount,
      positions: this.positions.slice(0, this.#vertex * 3),
      normals: this.normals.slice(0, this.#vertex * 3),
      uvs: this.uvs.slice(0, this.#vertex * 2),
      light: this.light.slice(0, this.#vertex),
      indices: this.indices.slice(0, this.faceCount * 6),
    }
  }
}

/**
 * Block id at a cell expressed in **target-region local** coordinates, where
 * `x`/`z` may sit one cell outside `0…15`.
 *
 * Resolved through `domainChunks` rather than `World.getBlock`, because the
 * latter keys a `Map` with a rebuilt string — 196 608 string allocations per
 * region is exactly the sort of steady garbage that spends `SC-003`'s frame
 * budget.
 */
function readBlock(x: number, y: number, z: number): number {
  if (y < 0 || y >= REGION_HEIGHT) return BLOCK.AIR
  let i = 1
  let j = 1
  let lx = x
  let lz = z
  if (x < 0) {
    i = 0
    lx = x + REGION_WIDTH
  } else if (x >= REGION_WIDTH) {
    i = 2
    lx = x - REGION_WIDTH
  }
  if (z < 0) {
    j = 0
    lz = z + REGION_DEPTH
  } else if (z >= REGION_DEPTH) {
    j = 2
    lz = z - REGION_DEPTH
  }
  const chunk = domainChunks[j * 3 + i] ?? null
  if (chunk === null) return BLOCK.AIR
  return chunk.blocks[blockIndex(lx, y, lz)] as number
}

/**
 * Illumination of the cell a face looks into.
 *
 * A face samples its **neighbour**, never its own cell: `research.md` R17 only
 * spreads light through non-opaque cells, so the cell holding an opaque block
 * reads 0 by construction. Sampling the block itself would render every
 * sunlit surface — stone, dirt, sand — pure black.
 */
function readNeighbourLight(x: number, y: number, z: number): number {
  if (y >= REGION_HEIGHT) return LIGHT.SKYLIGHT_SOURCE // above the world: open sky
  if (y < 0) return LIGHT.MIN
  let i = 1
  let j = 1
  let lx = x
  let lz = z
  if (x < 0) {
    i = 0
    lx = x + REGION_WIDTH
  } else if (x >= REGION_WIDTH) {
    i = 2
    lx = x - REGION_WIDTH
  }
  if (z < 0) {
    j = 0
    lz = z + REGION_DEPTH
  } else if (z >= REGION_DEPTH) {
    j = 2
    lz = z - REGION_DEPTH
  }
  return domainLight[(j * 3 + i) * REGION_BLOCK_COUNT + blockIndex(lx, y, lz)] as number
}

type FaceVisitor = (face: FaceSpec, x: number, y: number, z: number, id: number) => void

/**
 * Visit every face the culling rule keeps, in a fixed order.
 *
 * Both the counting pass and the writing pass go through this, so the two can
 * never disagree on which faces exist — the failure mode that would otherwise
 * produce an index buffer pointing past the end of a position array.
 */
function forEachVisibleFace(target: Chunk, visit: FaceVisitor): void {
  for (let y = 0; y < REGION_HEIGHT; y++) {
    for (let z = 0; z < REGION_DEPTH; z++) {
      for (let x = 0; x < REGION_WIDTH; x++) {
        const id = target.blocks[blockIndex(x, y, z)] as number
        if (id === BLOCK.AIR) continue
        for (let f = 0; f < FACES.length; f++) {
          const face = FACES[f] as FaceSpec
          const neighbourId = readBlock(
            x + face.dir[0],
            y + face.dir[1],
            z + face.dir[2],
          )
          if (!faceVisible(id, neighbourId)) continue
          visit(face, x, y, z, id)
        }
      }
    }
  }
}

/** `[opaqueFaces, transparentFaces]` — the same traversal the write pass runs. */
function countFaces(target: Chunk): readonly [number, number] {
  let opaque = 0
  let transparent = 0
  forEachVisibleFace(target, (_face, _x, _y, _z, id) => {
    if (isTransparent(id)) transparent++
    else opaque++
  })
  return [opaque, transparent]
}

/**
 * Build a region's two meshes and refresh its lighting in one pass.
 *
 * Positions are **region-local** (`0…16` in x and z, `0…128` in y); the caller
 * places the object at `(cx × 16, 0, cz × 16)`. Keeping the floats small is why
 * a chunk mesh can be positioned without visible jitter at normal camera
 * distances.
 *
 * Two traversals, deliberately: counting first lets each of the five buffers be
 * allocated once at its exact size, and both passes run through
 * {@link forEachVisibleFace}, so they cannot disagree about which faces exist.
 *
 * @throws RangeError if the region is not resident
 */
export function buildRegionMesh(world: World, cx: number, cz: number): RegionMesh {
  const target = world.getChunk(cx, cz)
  if (target === undefined) {
    throw new RangeError(`region (${String(cx)}, ${String(cz)}) is not resident`)
  }

  // One fill serves both jobs: FR-044 requires the light change and the remesh
  // to travel together, so they share a single read of the block data.
  storeDomain(fillDomainLight(world, cx, cz))

  const [opaqueFaces, transparentFaces] = countFaces(target)
  const opaque = new MeshBuilder(opaqueFaces)
  const transparent = new MeshBuilder(transparentFaces)

  forEachVisibleFace(target, (face, x, y, z, id) => {
    const builder = isTransparent(id) ? transparent : opaque
    const level = readNeighbourLight(x + face.dir[0], y + face.dir[1], z + face.dir[2])
    builder.addFace(
      x,
      y,
      z,
      face,
      tileUv(tileSlotFor(id, face.orientation)),
      (level / LIGHT.MAX) * face.shade,
    )
  })

  return { opaque: opaque.build(), transparent: transparent.build() }
}
