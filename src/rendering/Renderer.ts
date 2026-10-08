/**
 * Three.js scene, lights and the FR-045 particle pass.
 *
 * Owns four things and nothing else: the {@link Renderer.scene}, the ambient and
 * directional lights that FR-027's keyframes drive, the drawing buffer (the
 * "render target" of `plan.md` — sized here, never allocated per frame), and the
 * fixed **256-slot particle ring buffer** required by FR-045.
 *
 * Determinism (Constitution Principle I): this module reads no clock and calls
 * no `Math.random()`. Every particle is a pure function of
 * `hash32(eventKind, tick, index)` plus the origin the event supplied (research
 * R18), and lifetimes are counted in **simulation ticks**, so a particle can
 * neither outlive nor outpace the simulation it decorates. Nothing in `world/`
 * or `entities/` reads this module, which is what keeps FR-045's "presentation
 * only" clause true.
 *
 * Browser-only at construction: `THREE.WebGLRenderer` needs a real canvas, so
 * tests exercise {@link ParticleRing} and {@link deriveParticle} rather than this
 * class.
 */

import * as THREE from 'three'
import { PARTICLES, SEED, TIME, WORLD } from '../core/GameConfig'
import { hash32 } from '../utils/Hash'
import { type MeshData, type RegionMesh } from './ChunkMesher'
import { createAtlasTexture } from './TextureAtlas'

// ─────────────────────────────────────────────────────────────────────────────
// Particle derivation — pure, hash-driven, no clock
// ─────────────────────────────────────────────────────────────────────────────

export type ParticleKind = (typeof PARTICLES.KINDS)[number]

/** Closed set of trigger events; the first argument fed to `hash32`. */
export const PARTICLE_KIND_ID: Readonly<Record<ParticleKind, number>> = Object.freeze({
  'block-break': 0,
  'water-splash': 1,
})

/** One derived particle: everything needed to place it at any simulation tick. */
export interface ParticleSpec {
  /** Offset in blocks from the event origin, already inside the trigger cell. */
  readonly ox: number
  readonly oy: number
  readonly oz: number
  /** Initial velocity in blocks per second. */
  readonly vx: number
  readonly vy: number
  readonly vz: number
  /** Lifetime in simulation ticks — never seconds (FR-045, R18). */
  readonly lifeTicks: number
}

/**
 * Derive particle `index` of the event that fired at `tick`.
 *
 * One 32-bit hash supplies all four bytes, which are split across the three
 * direction components, the speed and the lifetime jitter. Calling `hash32` once
 * per particle keeps the derivation exactly as research R18 specifies it —
 * `hash32(eventKind, tick, index)` — without introducing a salt beyond the
 * closed enum in `utils/Hash.ts`.
 *
 * Trigonometry-free: direction comes from hashing three bytes and normalising,
 * since research R4 confines `Math.sin`/`Math.cos` to sky angle and creature bob.
 *
 * @param kind   which trigger fired; part of the hash input
 * @param tick   simulation tick the event fired on; part of the hash input
 * @param index  particle index within the event, `0 … count-1`
 * @param origin world position the event reported, in blocks
 */
export function deriveParticle(
  kind: ParticleKind,
  tick: number,
  index: number,
  origin: Readonly<{ x: number; y: number; z: number }>,
): ParticleSpec {
  const base = hash32(PARTICLE_KIND_ID[kind], tick, index)
  const bx = base & 0xff
  const by = (base >>> 8) & 0xff
  const bz = (base >>> 16) & 0xff
  const bs = (base >>> 24) & 0xff

  // Unit direction: three bytes mapped to [-1, 1], thrown up and away for both
  // kinds — debris leaves the broken cell, a splash leaves the surface.
  let dx = bx / 127.5 - 1
  let dy = by / 127.5 - 1
  let dz = bz / 127.5 - 1
  if (dy < 0) dy = -dy
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (length > 0) {
    dx /= length
    dy /= length
    dz /= length
  } else {
    dx = 0
    dy = 1
    dz = 0
  }

  const speed = PARTICLES.SPEED_MIN + (bs / 255) * (PARTICLES.SPEED_MAX - PARTICLES.SPEED_MIN)
  // Jitter inside the trigger cell so two breaks of adjacent blocks never line up.
  const jx = bx / 255 - 0.5
  const jy = by / 255 - 0.5
  const jz = bz / 255 - 0.5

  return {
    ox: origin.x + jx,
    oy: origin.y + jy,
    oz: origin.z + jz,
    vx: dx * speed,
    vy: dy * speed,
    vz: dz * speed,
    lifeTicks: PARTICLES.LIFETIME_TICKS - ((bx + by + bz + bs) & 7),
  }
}

/**
 * Position of a particle `ageTicks` after it spawned — closed form, so the same
 * inputs always give the same position and nothing has to be integrated forward
 * from the last frame.
 */
export function positionAt(spec: ParticleSpec, ageTicks: number): {
  x: number
  y: number
  z: number
} {
  const t = ageTicks * TIME.TICK_DT_SECONDS
  return {
    x: spec.ox + spec.vx * t,
    y: spec.oy + spec.vy * t - 0.5 * PARTICLES.GRAVITY * t * t,
    z: spec.oz + spec.vz * t,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ring buffer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixed-capacity ring of live particles — capacity `PARTICLES.CAPACITY` (256),
 * never grown, so the pass has a hard upper bound on per-frame work
 * (Constitution Principle II).
 *
 * Spawning at `capacity` wraps and reuses the oldest slot; there is no
 * allocation after construction.
 */
export class ParticleRing {
  readonly capacity: number

  #ox: Float32Array
  #oy: Float32Array
  #oz: Float32Array
  #vx: Float32Array
  #vy: Float32Array
  #vz: Float32Array
  #spawnTick: Uint32Array
  #lifeTicks: Uint16Array
  #kind: Uint8Array
  #active: Uint8Array

  #cursor = 0
  #live = 0

  constructor(capacity: number = PARTICLES.CAPACITY) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`ParticleRing capacity must be a positive integer, got ${String(capacity)}`)
    }
    this.capacity = capacity
    this.#ox = new Float32Array(capacity)
    this.#oy = new Float32Array(capacity)
    this.#oz = new Float32Array(capacity)
    this.#vx = new Float32Array(capacity)
    this.#vy = new Float32Array(capacity)
    this.#vz = new Float32Array(capacity)
    this.#spawnTick = new Uint32Array(capacity)
    this.#lifeTicks = new Uint16Array(capacity)
    this.#kind = new Uint8Array(capacity)
    this.#active = new Uint8Array(capacity)
  }

  /** Number of particles not yet expired. */
  get live(): number {
    return this.#live
  }

  /**
   * Record `count` particles for one event, derived from `(kind, tick, index)`
   * and the supplied origin.
   *
   * @returns the ring slot of the last particle written, for tests
   */
  spawn(kind: ParticleKind, tick: number, origin: Readonly<{ x: number; y: number; z: number }>): number {
    const count = kind === 'block-break' ? PARTICLES.BREAK_COUNT : PARTICLES.SPLASH_COUNT
    const kindId = PARTICLE_KIND_ID[kind]
    let slot = this.#cursor
    for (let i = 0; i < count; i++) {
      const spec = deriveParticle(kind, tick, i, origin)
      const s = this.#cursor
      this.#ox[s] = spec.ox
      this.#oy[s] = spec.oy
      this.#oz[s] = spec.oz
      this.#vx[s] = spec.vx
      this.#vy[s] = spec.vy
      this.#vz[s] = spec.vz
      this.#spawnTick[s] = tick
      this.#lifeTicks[s] = spec.lifeTicks
      this.#kind[s] = kindId
      if (this.#active[s] === 0) this.#live++
      this.#active[s] = 1
      this.#cursor = (this.#cursor + 1) % this.capacity
      slot = s
    }
    return slot
  }

  /** Mark every particle that has reached its lifetime as inactive. */
  expire(currentTick: number): void {
    for (let s = 0; s < this.capacity; s++) {
      if (this.#active[s] === 0) continue
      if (currentTick - (this.#spawnTick[s] as number) >= (this.#lifeTicks[s] as number)) {
        this.#active[s] = 0
        this.#live--
      }
    }
  }

  /** Read-only view of slot activity, for tests and the render pass. */
  isActive(slot: number): boolean {
    this.#check(slot)
    return this.#active[slot] === 1
  }

  kindAt(slot: number): ParticleKind {
    this.#check(slot)
    return (this.#kind[slot] === 0 ? 'block-break' : 'water-splash') as ParticleKind
  }

  /** World position of a slot at `currentTick`, or `null` if inactive. */
  positionOf(slot: number, currentTick: number): { x: number; y: number; z: number } | null {
    this.#check(slot)
    if (this.#active[slot] === 0) return null
    const age = currentTick - (this.#spawnTick[slot] as number)
    const t = age * TIME.TICK_DT_SECONDS
    return {
      x: (this.#ox[slot] as number) + (this.#vx[slot] as number) * t,
      y:
        (this.#oy[slot] as number) +
        (this.#vy[slot] as number) * t -
        0.5 * PARTICLES.GRAVITY * t * t,
      z: (this.#oz[slot] as number) + (this.#vz[slot] as number) * t,
    }
  }

  /** Drop everything — used when leaving a world, never during play. */
  clear(): void {
    this.#active.fill(0)
    this.#live = 0
    this.#cursor = 0
  }

  #check(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.capacity) {
      throw new RangeError(`particle slot ${String(slot)} outside 0…${this.capacity - 1}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────

const KIND_COLOR: Readonly<Record<ParticleKind, number>> = Object.freeze({
  'block-break': 0xbfa06a,
  'water-splash': 0x6fb6e8,
})

/**
 * The two objects one region contributes to the scene: an opaque mesh and a
 * transparent one, as `plan.md` requires (*"Separate geometry per chunk into
 * two meshes"*).
 */
interface RegionObjects {
  readonly opaque: THREE.Mesh
  readonly transparent: THREE.Mesh
}

/**
 * Map key for a region. The map is private to `Renderer`, so this needs only to
 * be unique per `(cx, cz)` and not to match `World.key`'s encoding.
 */
function regionKey(cx: number, cz: number): string {
  return `${String(cx)},${String(cz)}`
}

/**
 * TD-027: `MeshData.light` carries **one** float per vertex — the shaded
 * illumination — while three.js's `vertexColors` reads a `vec3`. Widening at
 * this boundary keeps the authored buffer at a third of the size for a channel
 * that is greyscale by definition, and confines knowledge of three.js's
 * attribute layout to the one place that uploads it.
 */
function widenLightToColor(light: Float32Array): Float32Array {
  const color = new Float32Array(light.length * 3)
  for (let i = 0; i < light.length; i++) {
    const value = light[i] as number
    const o = i * 3
    color[o] = value
    color[o + 1] = value
    color[o + 2] = value
  }
  return color
}

/**
 * Turn one half of a `RegionMesh` into drawable geometry.
 *
 * Positions are region-local (`0…16` in x and z), so the owning object carries
 * the world offset — which is what lets a region be released by dropping an
 * object rather than by rewriting its vertices.
 */
function geometryFrom(data: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2))
  geometry.setAttribute('color', new THREE.BufferAttribute(widenLightToColor(data.light), 3))
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
  return geometry
}

/**
 * Owns the WebGL drawing buffer. `plan.md` calls this the render target: it is
 * sized once per resize, never re-allocated per frame.
 */
export class Renderer {
  readonly scene: THREE.Scene
  readonly ambient: THREE.AmbientLight
  readonly directional: THREE.DirectionalLight
  readonly gl: THREE.WebGLRenderer
  readonly particles: ParticleRing

  readonly #mesh: THREE.InstancedMesh
  readonly #matrix = new THREE.Matrix4()
  readonly #quaternion = new THREE.Quaternion()
  readonly #position = new THREE.Vector3()
  readonly #scale = new THREE.Vector3(1, 1, 1)
  readonly #color = new THREE.Color()
  #particlesEnabled = true

  /** Shared across every region — a material per region would defeat batching. */
  readonly #atlas: THREE.Texture
  readonly #opaqueMaterial: THREE.MeshLambertMaterial
  readonly #transparentMaterial: THREE.MeshLambertMaterial
  /** Region key → its objects, so a release can find and dispose them. */
  readonly #regions = new Map<string, RegionObjects>()

  /**
   * @param canvas the surface to draw into
   * @param seed   world seed the atlas is generated from — `TextureAtlas` derives
   *               one independent PRNG stream per slot from it, so the same
   *               world always looks the same
   */
  constructor(canvas: HTMLCanvasElement, seed: number = SEED.DEFAULT) {
    this.scene = new THREE.Scene()
    this.ambient = new THREE.AmbientLight(0xffffff, 1)
    this.directional = new THREE.DirectionalLight(0xffffff, 1)
    this.scene.add(this.ambient, this.directional)

    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.gl.setClearColor(0x000000, 1)

    this.particles = new ParticleRing()

    this.#atlas = createAtlasTexture(seed)
    // TD-026: Lambert is the only built-in that multiplies vertex colour by the
    // scene lights, and it reads `normal` — which is why the mesher emits one.
    this.#opaqueMaterial = new THREE.MeshLambertMaterial({
      map: this.#atlas,
      vertexColors: true,
    })
    this.#transparentMaterial = new THREE.MeshLambertMaterial({
      map: this.#atlas,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    })

    const geometry = new THREE.PlaneGeometry(0.12, 0.12)
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    this.#mesh = new THREE.InstancedMesh(geometry, material, this.particles.capacity)
    this.#mesh.frustumCulled = false
    this.#mesh.count = 0
    this.scene.add(this.#mesh)
  }

  // ── FR-046 / FR-039: the region draw path ──────────────────────────────────

  /** Regions currently represented in the scene. */
  get regionCount(): number {
    return this.#regions.size
  }

  /**
   * Build or rebuild the draw state for one region.
   *
   * Rebuilding an already-drawn region **replaces** rather than accumulates:
   * `ChunkManager.mesh()` remeshes whenever a block changes, so a path that
   * simply added meshes would leak a geometry on every block placed (FR-039
   * bounds *retained* regions, not meshes per region).
   *
   * The object sits at `(cx × 16, 0, cz × 16)` because the mesher writes
   * positions in region-local coordinates.
   */
  upsertRegion(cx: number, cz: number, mesh: RegionMesh): void {
    const key = regionKey(cx, cz)
    this.releaseRegion(cx, cz)

    const opaque = new THREE.Mesh(geometryFrom(mesh.opaque), this.#opaqueMaterial)
    const transparent = new THREE.Mesh(geometryFrom(mesh.transparent), this.#transparentMaterial)
    const offsetX = cx * WORLD.REGION_SIZE_X
    const offsetZ = cz * WORLD.REGION_SIZE_Z
    opaque.position.set(offsetX, 0, offsetZ)
    transparent.position.set(offsetX, 0, offsetZ)

    this.scene.add(opaque, transparent)
    this.#regions.set(key, { opaque, transparent })
  }

  /**
   * Dispose one region's geometry and drop it from the scene — FR-039's
   * "disposes their rendering resources" half, called for every region
   * `ChunkManager.unload()` evicts.
   *
   * Materials and the atlas are shared, so they are deliberately *not* disposed
   * here: doing so would blank every other region on screen.
   */
  releaseRegion(cx: number, cz: number): void {
    const key = regionKey(cx, cz)
    const objects = this.#regions.get(key)
    if (objects === undefined) return

    objects.opaque.geometry.dispose()
    objects.transparent.geometry.dispose()
    objects.opaque.removeFromParent()
    objects.transparent.removeFromParent()
    this.#regions.delete(key)
  }

  /** Release every region — used when leaving a world, never during play. */
  releaseAllRegions(): void {
    for (const key of [...this.#regions.keys()]) {
      const objects = this.#regions.get(key) as RegionObjects
      objects.opaque.geometry.dispose()
      objects.transparent.geometry.dispose()
      objects.opaque.removeFromParent()
      objects.transparent.removeFromParent()
      this.#regions.delete(key)
    }
  }

  /** Size the drawing buffer; call on construction and on `resize`. */
  setSize(width: number, height: number, pixelRatio: number = 1): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError(`Renderer.setSize needs a positive size, got ${width}×${height}`)
    }
    this.gl.setPixelRatio(pixelRatio)
    this.gl.setSize(width, height, false)
  }

  /**
   * Apply FR-027 lighting for the current point in the day. Interpolation
   * between keyframes belongs to `rendering/Sky.ts`; this only stores the result.
   */
  applyLighting(skyColor: number, ambientIntensity: number, directionalIntensity: number): void {
    this.ambient.intensity = ambientIntensity
    this.directional.intensity = directionalIntensity
    this.gl.setClearColor(skyColor, 1)
  }

  /** FR-034 particles setting — off means nothing is spawned or drawn. */
  setParticlesEnabled(enabled: boolean): void {
    this.#particlesEnabled = enabled
    if (!enabled) this.particles.clear()
  }

  get particlesEnabled(): boolean {
    return this.#particlesEnabled
  }

  /** Spawn one event's worth of particles. A no-op while particles are off. */
  spawn(kind: ParticleKind, tick: number, origin: Readonly<{ x: number; y: number; z: number }>): void {
    if (!this.#particlesEnabled) return
    this.particles.spawn(kind, tick, origin)
  }

  /**
   * Expire against `currentTick`, rebuild the instance buffer and draw.
   *
   * Only active slots are written and `#mesh.count` is set to the live total, so
   * a mostly-empty ring costs `capacity` matrix writes at worst — 256 — rather
   * than a per-frame reallocation.
   */
  render(camera: THREE.Camera, currentTick: number): void {
    this.particles.expire(currentTick)

    let n = 0
    for (let slot = 0; slot < this.particles.capacity; slot++) {
      const pos = this.particles.positionOf(slot, currentTick)
      if (pos === null) continue
      this.#position.set(pos.x, pos.y, pos.z)
      this.#quaternion.copy(camera.quaternion)
      this.#matrix.compose(this.#position, this.#quaternion, this.#scale)
      this.#mesh.setMatrixAt(n, this.#matrix)
      this.#color.setHex(KIND_COLOR[this.particles.kindAt(slot)])
      this.#mesh.setColorAt(n, this.#color)
      n++
    }
    this.#mesh.count = n
    this.#mesh.instanceMatrix.needsUpdate = true
    if (this.#mesh.instanceColor !== null) this.#mesh.instanceColor.needsUpdate = true

    this.gl.render(this.scene, camera)
  }

  /** Release GPU resources, regions first so nothing outlives its material. Safe to call more than once. */
  dispose(): void {
    this.releaseAllRegions()
    this.#opaqueMaterial.dispose()
    this.#transparentMaterial.dispose()
    this.#atlas.dispose()
    this.#mesh.geometry.dispose()
    if (Array.isArray(this.#mesh.material)) {
      for (const m of this.#mesh.material) m.dispose()
    } else {
      this.#mesh.material.dispose()
    }
    this.#mesh.removeFromParent()
    this.gl.dispose()
  }
}
