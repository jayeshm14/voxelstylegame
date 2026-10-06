# Contract: World Generation (pure function)

**Feature**: `specs/001-voxel-realms-game`
**Implements**: FR-002, FR-003, FR-005, SC-002; Constitution Principles I and II
**Consumers**: `world/generateChunk.ts`, `world/Noise.ts`, `world/Biome.ts`, `ChunkManager`, test suites `chunk-purity`, `golden-hash`, `determinism`

---

## Signature

```text
generateChunk(seed: int32, cx: int32, cz: int32) -> Uint8Array
```

- Length `CHUNK_WIDTH * CHUNK_HEIGHT * CHUNK_DEPTH` (= 32 768)
- Element index = `(y * CHUNK_DEPTH + z) * CHUNK_WIDTH + x`
- `y` is not chunked: `0 ≤ y < CHUNK_HEIGHT`

## Purity clause (Constitution Principle I)

`generateChunk` MUST NOT read or write:

- any other chunk or region — no neighbour lookup, no border stitching pass
- any module-level mutable variable
- any clock, counter, cache, or random source outside its arguments
- anything from rendering, persistence, UI, audio or input

The same `(seed, cx, cz)` triple MUST return byte-identical output within a
process, across processes, and across load orders.

**Enforced by**: an import-boundary check — `world/generateChunk.ts` may import
only from `world/Noise.ts`, `world/Biome.ts`, `world/BlockRegistry.ts`,
`utils/Prng.ts`, `utils/Hash.ts`, `utils/Mathx.ts` and `core/GameConfig.ts`.

---

## Determinism clauses

| # | Clause | Test |
|---|---|---|
| D1 | No `Math.random()`, `Date.now()` or `performance.now()` anywhere in this module | `determinism.test.ts` |
| D2 | All randomness from `mulberry32` via `hash32(seed, ...salt)`; each consumer derives its own stream; no shared mutable stream | `determinism.test.ts` |
| D3 | Salts are a closed enum, never reused: `NOISE=1, BIOME_TEMP=2, BIOME_HUMID=3, TERRAIN=4, CAVE=5, ORE_COAL=6, ORE_IRON=7, TREE=8, ENTITY_SPAWN=9, TEXTURE=10` | `determinism.test.ts` |
| D4 | Terrain maths restricted to exactly-specified IEEE-754 operations (`+ - * /`, `Math.imul`, shifts, comparisons, `Math.floor`). Trigonometry is forbidden inside this module — it is permitted only in sky and creature-bob code | `determinism.test.ts` |
| D5 | Coordinate maths is floor-division plus non-negative modulo: `chunk = floor(w / W)`, `local = ((w % W) + W) % W` | `coordinate.test.ts` |
| D6 | Generation order per column is fixed: biome → height → layers → water → caves → ores → trees | `chunk-purity.test.ts` |

---

## Cross-region feature clause

A tree rooted outside the region being generated must still appear correctly in
neighbouring regions. The rule is:

- A region considers tree origins up to **2 columns beyond** its own bounds.
- Each tree is written by whichever region generates it, using **only the tree
  origin's hash** — never a hash of the region being written.

Because the decision depends on the origin alone, two regions straddling a border
agree regardless of which is produced first.

**Test**: chunks `(0,0)` and `(1,0)` compared across both generation orders must
agree block-for-block along the shared border.

---

## Accepted inputs / outputs

| Input | Behaviour |
|---|---|
| Valid `seed`, `cx`, `cz` | Deterministic block array |
| Any int32 seed | Valid output; different seeds MUST differ |
| `y` outside `[0, CHUNK_HEIGHT)` on read | Returns `AIR` |
| Write outside `y` range | Rejected |

---

## Fixed algorithm commitments

These are part of the contract; changing any of them is a breaking change that
**must** update the committed golden hash:

- **PRNG**: `mulberry32(a)` exactly as specified by the source document.
- **Hash**: `hash32(...ints)` = FNV-1a over little-endian bytes of each int32 → uint32.
- **Noise**: simplex 2D/3D from a 256-entry permutation produced by Fisher–Yates
  driven by `mulberry32(hash32(seed, SALT_NOISE))`; fBm with lacunarity 2.0,
  gain 0.5; output in `[-1, 1]`.
- **Biome precedence** (first match wins): `SNOW` (temp < −0.45) →
  `DESERT` (temp > 0.40 and humid < 0) → `MOUNTAIN` (mountain mask > 0.35) →
  `FOREST` (humid > 0.15) → `PLAINS`.
- **Sea level**: `SEA_LEVEL = 40`; anything at or below it is filled with water.
- **Default seed**: `DEFAULT_SEED = 123456789`.

---

## Golden hash

| Property | Value |
|---|---|
| Input | the 32 768 bytes of `generateChunk(123456789, 0, 0)` |
| Algorithm | the same FNV-1a `hash32` used elsewhere, accumulated over 32-bit words in defined order |
| Output | one unsigned 32-bit constant |
| Fixture | `tests/fixtures/golden-hash.ts`, generated once and committed |
| Failure meaning | the generation algorithm changed — update the constant only after deliberately reviewing the diff |

The test MUST NOT regenerate the constant as part of running; a self-healing
golden hash cannot fail.

## Test mapping

| Clause | Test |
|---|---|
| Purity, D1–D6, load-order independence | `chunk-purity.test.ts`, `determinism.test.ts` |
| Same seed twice byte-equal; different seed differs | `chunk-purity.test.ts` |
| Golden hash | `golden-hash.test.ts` |
| Cross-region trees | `chunk-purity.test.ts` |
| Coordinate conversion fixtures | `coordinate.test.ts` |
