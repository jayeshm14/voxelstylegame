/**
 * Procedural texture atlas — FR-038, research R8, gate G9.
 *
 * *"All art, sound, interface text and code MUST be original to this product;
 * no third-party game's names, textures, sounds, interface or code may be
 * used."* The only way to guarantee that provably is to never ship an image in
 * the first place: every pixel here is computed at startup from `mulberry32`
 * (Constitution I), and `tests/` contains no `.png`, `.jpg` or `.wav` for a
 * reviewer to have to trace. `SC-012`'s audit is then a search for files that
 * cannot exist.
 *
 * **Layout** (prompt §6, *"Atlas: 16×16 tiles of 16 px"*): a square grid of
 * {@link ATLAS_TILES} × {@link ATLAS_TILES} tiles, each {@link TILE_PX} on a
 * side, so the whole atlas is {@link ATLAS_PX}² = 256² pixels — one 256 KB
 * image, uploaded once, giving one material and one bind for the entire world.
 * Per-block textures were rejected in R8 precisely because they would multiply
 * draw calls and put `SC-003`'s frame budget at risk.
 *
 * **Slot map.** A slot is `row * 16 + column`; UVs are derived from it by
 * {@link tileUv}. Three ranges are reserved:
 *
 * | Slots | Contents |
 * |---|---|
 * | 0–14 | one tile per block, `slot === block id` — R8's *"index tiles by block ID"* |
 * | 16–17 | face variants: grass side, log end |
 * | 100–115 | item icons (T059), keyed by item id, leaving 18–99 spare |
 *
 * Keeping `slot === id` for blocks means the mesher needs no lookup table: a
 * face's tile is the block id unless {@link tileSlotFor} says otherwise.
 *
 * **Two halves, deliberately separated.** The UV arithmetic is pure and runs
 * under Node, where `environment: 'node'` means there is no `document` at all —
 * so `buildRegionMesh` can compute UVs in `tests/mesher.test.ts`. Only the
 * drawing entry points touch the DOM, and they do so lazily inside a function
 * body, never at module load.
 *
 * Constitution test areas: *original assets* is not one of the twelve; the
 * provenance claim it supports is checked by `SC-012`'s content review (T120).
 */

import * as THREE from 'three'
import { deriveStream, type PrngStream } from '../utils/Prng'
import { SALT } from '../utils/Hash'
import { BLOCK } from '../world/BlockRegistry'

/** Edge of one tile in pixels (prompt §6). */
export const TILE_PX = 16

/** The atlas is a 16 × 16 grid, i.e. 256 slots. */
export const ATLAS_TILES = 16

/** Atlas edge in pixels: 16 tiles × 16 px. */
export const ATLAS_PX = TILE_PX * ATLAS_TILES

/** Total slots. Slots with no paint stay fully transparent. */
export const ATLAS_SLOT_COUNT = ATLAS_TILES * ATLAS_TILES

/** Which of a cube's three visible orientations is asking for a tile. */
export type Face = 'top' | 'side' | 'bottom'

/**
 * Slots for the two blocks whose faces differ. Slot 1 (GRASS) already holds the
 * *top*, because `slot === block id` is the identity everyone expects from a
 * block's own tile; only the side needs a second slot. The log is the opposite:
 * bark is its dominant face, so slot 5 is bark and the cut end lives here.
 */
const SLOT_GRASS_SIDE = 16
const SLOT_LOG_END = 17

/**
 * Tile for one face of one block.
 *
 * Everything except the two special cases resolves to `id`, which is what keeps
 * the mesher honest: adding a block adds a tile for free, and only a block that
 * genuinely looks different on two faces costs an extra slot.
 *
 * @param id   block id from the closed catalogue
 * @param face which orientation of the cube is being meshed
 */
export function tileSlotFor(id: number, face: Face): number {
  if (id === BLOCK.GRASS) {
    if (face === 'top') return id // slot 1 — the green top
    if (face === 'bottom') return BLOCK.DIRT
    return SLOT_GRASS_SIDE
  }
  if (id === BLOCK.WOOD && face !== 'side') return SLOT_LOG_END
  return id
}

/** UV rectangle of one slot, in the `[0, 1]` range three.js expects. */
export interface TileUv {
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
}

/**
 * Half-texel safety margin, in texels.
 *
 * Nearest-neighbour sampling at exactly `u = (col+1) * 16 / 256` can round up
 * into the neighbouring tile and put a one-pixel stripe of the wrong texture
 * down the edge of every face. Pulling each rectangle in by a quarter of a
 * texel keeps all sixteen texels addressable — the endpoints land at
 * `col*16 + 0.25` and `(col+1)*16 − 0.25`, whose floors are still the first and
 * last texel of the tile — while making the out-of-range sample unreachable.
 */
const UV_INSET_TEXELS = 0.25

/**
 * UVs for a slot.
 *
 * Row order is flipped: a canvas' row 0 is the *top* of the image while UV
 * `v = 0` is the *bottom* of the texture, so a slot in atlas row `r` occupies
 * `v ∈ [1 − (r+1)/16, 1 − r/16]`.
 */
export function tileUv(slot: number): TileUv {
  const col = slot % ATLAS_TILES
  const row = Math.floor(slot / ATLAS_TILES)
  const span = TILE_PX / ATLAS_PX
  const origin = 1 / ATLAS_PX
  const inset = UV_INSET_TEXELS * origin
  const u0 = col * span + inset
  const v1 = 1 - row * span - inset
  return { u0, v0: v1 - span + 2 * inset, u1: u0 + span - 2 * inset, v1 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Palette — content data, like the block catalogue, not a gameplay tunable.
// ─────────────────────────────────────────────────────────────────────────────

type Rgb = readonly [number, number, number]

const DIRT: Rgb = [134, 96, 67]
const STONE: Rgb = [126, 126, 130]
const GRASS: Rgb = [95, 159, 63]
const SAND: Rgb = [219, 207, 163]
const BARK: Rgb = [103, 80, 49]
const LOG_END: Rgb = [166, 132, 82]
const LEAVES: Rgb = [56, 122, 47]
const WATER: Rgb = [58, 110, 186]
const PLANK: Rgb = [178, 142, 90]
const BRICK: Rgb = [154, 76, 63]
const MORTAR: Rgb = [196, 186, 176]
const SNOW: Rgb = [242, 246, 250]
const GLASS: Rgb = [214, 236, 244]
const COAL: Rgb = [38, 38, 42]
const IRON: Rgb = [206, 165, 130]
const TORCH_BODY: Rgb = [124, 88, 44]
const TORCH_FLAME: Rgb = [255, 196, 84]
const TORCH_DARK: Rgb = [46, 40, 34]

/**
 * How a slot's pixels are produced. Most blocks are a flat colour plus
 * per-pixel jitter; the named kinds add the structure that would otherwise make
 * stone, planks and bricks read as the same grey card at a distance.
 */
type Pattern =
  | 'speckle'
  | 'grassSide'
  | 'bark'
  | 'rings'
  | 'planks'
  | 'brick'
  | 'ore'
  | 'glass'
  | 'torch'

interface TilePaint {
  /** Dominant colour. */
  readonly base: Rgb
  /** Second colour — grass strip, ore flecks, flame. */
  readonly accent?: Rgb
  /** `0–255`; omitted means opaque. Only water and glass are translucent. */
  readonly alpha?: number
  readonly pattern: Pattern
}

/**
 * Slot → paint. Absent slots are never drawn and stay fully transparent, which
 * is what makes the reserved ranges above safe to leave empty.
 */
const PAINT: Readonly<Record<number, TilePaint>> = Object.freeze({
  // slot 0 is AIR and is deliberately absent: an unmeshed block needs no tile.
  1: { base: GRASS, pattern: 'speckle' }, // GRASS top
  2: { base: DIRT, pattern: 'speckle' },
  3: { base: STONE, pattern: 'speckle' },
  4: { base: SAND, pattern: 'speckle' },
  5: { base: BARK, pattern: 'bark' }, // WOOD side
  6: { base: LEAVES, pattern: 'speckle' },
  7: { base: WATER, alpha: 186, pattern: 'speckle' },
  8: { base: STONE, accent: COAL, pattern: 'ore' },
  9: { base: STONE, accent: IRON, pattern: 'ore' },
  10: { base: GLASS, alpha: 74, pattern: 'glass' },
  11: { base: PLANK, pattern: 'planks' },
  12: { base: BRICK, accent: MORTAR, pattern: 'brick' },
  13: { base: SNOW, pattern: 'speckle' },
  14: { base: TORCH_DARK, accent: TORCH_FLAME, pattern: 'torch' },
  [SLOT_GRASS_SIDE]: { base: DIRT, accent: GRASS, pattern: 'grassSide' },
  [SLOT_LOG_END]: { base: LOG_END, pattern: 'rings' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Drawing
// ─────────────────────────────────────────────────────────────────────────────

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/** Multiply an RGB triple by `f`, clamped into byte range. */
function shade(c: Rgb, f: number): Rgb {
  return [clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f)]
}

/**
 * Write one tile's 256 pixels.
 *
 * Every pixel draws from the tile's own stream, and the loop order is fixed
 * (row-major), so the same `(seed, slot)` always yields the same 256 bytes —
 * the property that makes the atlas reproducible without shipping it.
 */
function drawTile(
  image: ImageData,
  paint: TilePaint,
  stream: PrngStream,
): void {
  const data = image.data
  const base = paint.base
  const accent = paint.accent ?? base
  const alpha = paint.alpha ?? 255
  const pattern = paint.pattern

  // Ore blobs are chosen per 4×4 macro-cell, so they read as chunky flecks
  // rather than per-pixel salt. Decided once, before the pixel loop.
  const oreCell = new Uint8Array((TILE_PX / 4) * (TILE_PX / 4))
  if (pattern === 'ore') {
    for (let i = 0; i < oreCell.length; i++) oreCell[i] = stream.next() < 0.3 ? 1 : 0
  }

  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const jitter = stream.next()
      // Every pattern assigns, but TypeScript cannot prove an exhaustive switch
      // does, so the base colour seeds it rather than casting through `never`.
      let colour: Rgb = base
      let a = alpha

      switch (pattern) {
        case 'speckle': {
          colour = shade(base, 0.9 + jitter * 0.2)
          break
        }
        case 'grassSide': {
          // Ragged boundary: a fixed per-column offset, so the green strip has
          // an irregular lip instead of a ruled line.
          const lip = 3 + ((x * 5 + 1) % 4)
          colour = shade(y < lip ? accent : base, 0.9 + jitter * 0.2)
          break
        }
        case 'bark': {
          // Vertical grain: shading varies with x, jitter with the pixel.
          colour = shade(base, (0.84 + ((x * 3) % 5) * 0.06) * (0.95 + jitter * 0.12))
          break
        }
        case 'rings': {
          const dx = x - 7.5
          const dy = y - 7.5
          const ring = Math.floor(Math.sqrt(dx * dx + dy * dy)) % 2
          colour = shade(base, (ring === 0 ? 1.0 : 0.86) * (0.95 + jitter * 0.1))
          break
        }
        case 'planks': {
          // A dark seam every fourth row: 16 px / 4 = four 4-px boards.
          const seam = y % 4 === 3
          colour = seam ? shade(base, 0.6) : shade(base, 0.94 + jitter * 0.12)
          break
        }
        case 'brick': {
          const row = Math.floor(y / 4)
          const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7
          colour = mortar
            ? shade(accent, 0.96 + jitter * 0.08)
            : shade(base, 0.9 + jitter * 0.2)
          break
        }
        case 'ore': {
          const cell = oreCell[(Math.floor(y / 4) * 4 + Math.floor(x / 4)) as number]
          colour = shade(cell === 1 ? accent : base, 0.9 + jitter * 0.2)
          break
        }
        case 'glass': {
          const border = x === 0 || y === 0 || x === TILE_PX - 1 || y === TILE_PX - 1
          const gleam = x === y || x + y === TILE_PX - 1
          // A nearly invisible pane with a visible frame — enough to read as
          // glass while still letting the player see through it.
          a = border ? 224 : gleam ? 132 : alpha
          colour = shade(base, border ? 0.94 + jitter * 0.1 : 1)
          break
        }
        case 'torch': {
          const stick = x >= 6 && x <= 9 && y >= 5
          const flame = x >= 6 && x <= 9 && y >= 1 && y <= 4
          if (flame) colour = shade(accent, 0.92 + jitter * 0.12)
          else if (stick) colour = shade(TORCH_BODY, 0.9 + jitter * 0.14)
          else colour = shade(base, 0.88 + jitter * 0.24)
          break
        }
      }

      const p = (y * TILE_PX + x) * 4
      data[p] = colour[0]
      data[p + 1] = colour[1]
      data[p + 2] = colour[2]
      data[p + 3] = a
    }
  }
}

/**
 * Paint every slot that has a spec onto an existing 2D context.
 *
 * Exported separately from {@link createAtlasCanvas} so a test or a headless
 * caller can supply its own surface; the atlas is pixel data, not a canvas.
 *
 * @param ctx  surface at least {@link ATLAS_PX}² in size
 * @param seed world seed — one independent `mulberry32` stream per slot,
 *         derived with `SALT.TEXTURE` (Constitution I, R8)
 */
export function drawAtlas(ctx: CanvasRenderingContext2D, seed: number): void {
  ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX)
  for (let slot = 0; slot < ATLAS_SLOT_COUNT; slot++) {
    const paint = PAINT[slot]
    if (paint === undefined) continue
    const image = ctx.createImageData(TILE_PX, TILE_PX)
    drawTile(image, paint, deriveStream(seed, SALT.TEXTURE, slot))
    ctx.putImageData(image, (slot % ATLAS_TILES) * TILE_PX, Math.floor(slot / ATLAS_TILES) * TILE_PX)
  }
}

/**
 * Build the atlas on a fresh offscreen canvas.
 *
 * Nothing is fetched: `document.createElement('canvas')` is the only DOM call
 * in the module and it happens here, inside a function, so importing this file
 * from a Node test is safe.
 *
 * @throws Error if the environment has no 2D canvas — a headless runner without
 *         a canvas should fail loudly rather than draw nothing and ship a
 *         magenta world
 */
export function createAtlasCanvas(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_PX
  canvas.height = ATLAS_PX
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('TextureAtlas needs a 2D canvas context, none available')
  drawAtlas(ctx, seed)
  return canvas
}

/**
 * The atlas as a three.js texture, ready to bind.
 *
 * `NearestFilter` with mipmaps off is the pixel-art contract: it keeps every
 * texel crisp and, together with the quarter-texel inset in {@link tileUv},
 * means a face never samples the tile beside it. `SRGBColorSpace` matches the
 * renderer's default output transform, so the palette above is the colour that
 * reaches the screen.
 */
export function createAtlasTexture(seed: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(createAtlasCanvas(seed))
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}
