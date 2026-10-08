# Implementation Status — Voxel Realms

Per-phase verification record for `specs/001-voxel-realms-game/tasks.md`.

**Format** (source §12) — appended after every phase, one line per phase, never
rewritten retroactively:

```text
PHASE n: DONE | typecheck PASS | tests PASS (N passed) | build PASS
```

`n` is the **source** phase number, 1–16. A phase may only be recorded as DONE
once `npm run typecheck && npm test && npm run build` have all been run in that
order and observed to pass; `N passed` is the real count from the vitest summary,
never a placeholder.

The final line is `STATUS: COMPLETE`, written only when every phase is DONE.

---

## Phase log

```text
PHASE 1: DONE | typecheck PASS | tests PASS (0 passed) | build PASS
```

Recorded 2026-10-06 by T012. `0 passed` is literal — the project has no test
files at Phase 1, and `passWithNoTests` lets the mandated command succeed on an
empty project (`docs/TECHNICAL_DECISIONS.md` TD-002). Real output for all four
commands is in `specs/001-voxel-realms-game/quickstart.md` §9.

```text
PHASE 2: DONE | typecheck PASS | tests PASS (0 passed) | build PASS
```

Recorded 2026-10-06 by T017 (source phase 2 — fixed-timestep loop, renderer,
camera, game state). Still `0 passed`: source phase 2 contains no test task, and
the first suite arrives with T018 in source phase 3. Open choices recorded by
this closure: TD-008 … TD-013.

```text
PHASE 3: DONE | typecheck PASS | tests PASS (9 passed) | build PASS
```

Recorded 2026-10-06 by T023 (source phase 3 — block registry, region storage,
coordinate math). `9 passed` is the real vitest count for the first suite,
`tests/coordinate.test.ts`. Open choices recorded by this closure: TD-014 …
TD-017.

```text
PHASE 4: DONE | typecheck PASS | tests PASS (37 passed) | build PASS
```

Recorded 2026-10-06 by T032 (source phase 4 — PRNG and hashing, simplex noise,
biome classification, pure `generateChunk`, golden hash). `37 passed` is the real
vitest count across the four suites now present: `coordinate` (12),
`chunk-purity` (15), `golden-hash` (6) and `seed-reproducibility` (4). Gate
executed in the constitution's order — `tsc --noEmit` exit 0 with no diagnostics,
`vitest run` exit 0, `vite build` exit 0 (`1 modules transformed`,
`dist/index.html 0.57 kB`, which remains TD-003's composition root and not a
regression).

Test-first order held: `chunk-purity` and `golden-hash` were written at T024/T025
and observed failing, and stayed red until `generateChunk` landed at T029 — the
three suites went green together at T030 when the constant was captured.
`seed-reproducibility` (T031) supplies the SC-002 evidence recorded in
`specs/001-voxel-realms-game/quickstart.md` §5, including two independent
processes printing identical per-region manifests.

Open choices recorded by this closure: **TD-018 … TD-022**.

```text
PHASE 5: DONE | typecheck PASS | tests PASS (47 passed) | build PASS
```

Recorded 2026-10-08 by T038 (source phase 5 — texture atlas, culling mesher,
FR-044 illumination, streaming). `47 passed` is the real vitest count across the
five suites now present: `coordinate` (12), `chunk-purity` (15), `golden-hash`
(6), `seed-reproducibility` (4) and `mesher` (10). Gate executed in the
constitution's order — `npm run typecheck` exit 0 with no diagnostics,
`npm test` exit 0, `npm run build` exit 0 (`1 modules transformed`,
`dist/index.html 0.57 kB`, still TD-003's composition root and not a
regression).

Test-first order held: `tests/mesher.test.ts` was written at T033 and observed
**failing** (`Failed to load url ../src/rendering/ChunkMesher`), and stayed red
until `ChunkMesher.ts` landed at T035 — all ten went green together. The
cross-region lighting case is the load-bearing one: the same torch scene is
built in two different orders and both regions' `light` bytes must match, which
is what pins FR-044's order-independence.

Two corrections to earlier records, made here rather than by rewriting them:

- The source phase 4 note above said `golden-hash (7)`; the suite has **6**
  tests (`12 + 15 + 6 + 4 = 37`), and its own status line, the observed total,
  was always right. Only the breakdown was wrong.
- Source phase 5's `mesher` suite contains **10** tests rather than the 9
  sketched in T033: the culling cases and the lighting cases were each split so
  a failure names one behaviour. No task text was changed.

Open choices recorded by this closure: **TD-023 … TD-031**.

## Fixes and notes

*(recorded by T115 for every failing suite diagnosed)*

## Final status

STATUS: IN PROGRESS
