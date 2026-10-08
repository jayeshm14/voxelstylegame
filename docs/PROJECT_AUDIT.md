# Project Audit — Voxel Realms

**Feature**: `specs/001-voxel-realms-game` · **Phase**: 1 (Audit + setup + build verification)
**Recorded**: 2026-10-06 at task T001, before any project file was created.

This document records the state the repository was found in, so that "the
toolchain builds and tests" can be demonstrated as a change rather than assumed.

## Environment

| Tool | Version found | Plan target | Notes |
|---|---|---|---|
| Node | v24.11.0 | Node 20 LTS | Present on the machine; recorded as an open choice in `TECHNICAL_DECISIONS.md` |
| npm | 11.6.1 | — | Used for `npm ci` / lockfile generation |
| Git | available | — | Repo initialised, branch `001-voxel-realms-game` tracks `origin` |
| OS | Windows (win32) | — | `core.autocrlf=true`; LF→CRLF notices on add are expected |

## Repository state at audit time

**Tracked top-level paths**: `.codegraph/`, `.gitignore`, `.opencode/`,
`.specify/`, `specs/`, `VOXEL_REALMS_DETERMINISTIC_PROMPT.md`

**Working tree**: clean, at commit `f90c4ba` — *docs(spec): complete planning
artifacts and resolve analyze findings*.

**Absent** — every one of these was confirmed missing, which is what makes the
Phase 1 gate meaningful:

| Path | State |
|---|---|
| `package.json` | absent |
| `package-lock.json` | absent |
| `tsconfig.json` | absent |
| `vite.config.ts` | absent |
| `index.html` | absent |
| `src/` | absent |
| `tests/` | absent |
| `docs/` | absent |
| `node_modules/` | absent |

## Design artifacts present

| Artifact | State |
|---|---|
| `.specify/memory/constitution.md` | ratified, v1.0.0 — 11 gates |
| `specs/001-voxel-realms-game/spec.md` | 45 FRs, 14 SCs, 7 stories, 26 edge cases |
| `specs/001-voxel-realms-game/plan.md` | 11/11 constitution gates PASS |
| `specs/001-voxel-realms-game/research.md` | R1–R18 resolved |
| `specs/001-voxel-realms-game/data-model.md` | 11 sections |
| `specs/001-voxel-realms-game/contracts/` | 5 contracts |
| `specs/001-voxel-realms-game/tasks.md` | 132 tasks, T001–T132 |
| `specs/001-voxel-realms-game/quickstart.md` | 10-step walkthrough, 14-row SC matrix |
| `specs/001-voxel-realms-game/checklists/` | `requirements.md` 16/16, `spec-quality.md` 40/40 |

## Baseline findings

1. **No source code exists.** Nothing to regress, so a green `typecheck`/`test`/
   `build` after Phase 1 proves the toolchain, not the game — that is exactly
   what this phase is for (source §12 phase 1 checkpoint: *install, typecheck,
   test and build all run on an empty project*).
2. **No dependency graph exists.** `package-lock.json` is created from scratch
   and committed in this phase, so `npm ci` has a lockfile to verify against
   from the first acceptance run onward (Constitution IV, gate G6).
3. **Node version differs from the plan.** The plan states Node 20 LTS; the
   machine has v24.11.0. The build targets ES2022 in the browser, so no source
   feature depends on the host Node version. Recorded as an open choice.
4. **`.gitignore` already covers the required patterns** — `node_modules/`,
   `dist/`, `build/`, `*.log`, `.env*`, `coverage/`, `*.tsbuildinfo`. No other
   ignore file is warranted: there is no Dockerfile, ESLint, Prettier, Terraform
   or Helm configuration in the repository or in the plan's tech stack.
5. **No test runner exists yet**, so `npm test` at the end of this phase reports
   zero test files rather than a pass. `passWithNoTests` is set in
   `vite.config.ts` for this reason and is recorded as an open choice in
   `TECHNICAL_DECISIONS.md`; it stops being load-bearing the moment
   `tests/coordinate.test.ts` lands in Phase 2b.
