# Story 1.1: Turborepo Monorepo Scaffold

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a Turborepo monorepo with the Next.js app and domain packages scaffolded,
So that every subsequent story has a consistent, buildable home with enforced boundaries.

## Acceptance Criteria

1. **Given** a fresh clone, **When** dependencies are installed and the workspace build runs, **Then** Turborepo builds `apps/web` plus `@gol/domain`, `@gol/simulation`, `@gol/persistence`, and `@gol/test-utils` via the `turbo.json` task graph (AR-1)
2. **Given** `apps/web`, **When** it is built, **Then** Next.js App Router compiles under TypeScript `strict` and `output: 'export'` produces a fully static export (AR-2)
3. **And** the exported site serves a placeholder home route with zero backend calls (NFR-6.1)
4. **And** `NEXT_PUBLIC_MODE` is plumbed as the build-time mode flag consumed by the repository factory in Story 1.4 (AR-2)

## Tasks / Subtasks

- [ ] Task 1: Initialize repo root (AC: 1)
  - [ ] `git init` at the project root — the repo is NOT yet a git repository; husky (Story 1.2) requires it
  - [ ] Scaffold IN PLACE at `/Users/sidiar/projects/NewJob/GameOfLife` — `docs/`, `_bmad/`, `.claude/` already live here; do NOT create a nested project folder and do NOT use `create-turbo`/`create-next-app` interactive scaffolds that require an empty directory (generate files manually or into a temp dir and merge)
  - [ ] Root `package.json`: `"name": "game-of-life-studio"`, `"private": true`, `"workspaces": ["apps/*", "packages/*"]`, `"packageManager"` pinned (npm — RFC-001 uses npm-style workspaces), scripts `dev` / `build` / `build:standalone` / `test` delegating to `turbo run …`
  - [ ] `turbo.json` using Turborepo 2.x `"tasks"` key (NOT the 1.x `"pipeline"` key): `build` with `"dependsOn": ["^build"]`; `build:standalone` with `"env": ["NEXT_PUBLIC_MODE"]`, `"outputs": ["apps/web/out/**"]`
  - [ ] `.gitignore` (node_modules, .next, out, .turbo, coverage), `.nvmrc` / `engines` pinning current Node LTS
  - [ ] Root `tsconfig.base.json` with `"strict": true` extended by every package and the app
- [ ] Task 2: Scaffold the four packages (AC: 1)
  - [ ] `packages/domain` → `@gol/domain`; `packages/simulation` → `@gol/simulation`; `packages/persistence` → `@gol/persistence`; `packages/test-utils` → `@gol/test-utils`
  - [ ] Each: `package.json` (name, `"private": true`, `"exports"` pointing at TS source — see just-in-time convention in Dev Notes), `tsconfig.json` extending the strict base, one placeholder export in `src/index.ts` so the package graph compiles
  - [ ] Internal deps declared now so `^build` ordering is real from day one: `@gol/persistence` and `@gol/simulation` depend on `@gol/domain`; `@gol/test-utils` depends on `@gol/domain` and `@gol/persistence` (it will provide fake repos implementing 1.4 interfaces); `apps/web` depends on all four
  - [ ] NO business code — Zod schemas land in 1.3, repositories in 1.4, engine in Epic 3. Placeholders only.
- [ ] Task 3: Scaffold `apps/web` (AC: 2, 3)
  - [ ] Next.js (current stable 16.2.x LTS as of 2026-07) + React, App Router: `app/layout.tsx` + `app/page.tsx` placeholder home route (static text — real Gallery arrives in 1.10; theming/shell in 1.9 — do NOT install MUI now)
  - [ ] `tsconfig.json` extends the strict base; build must pass `tsc` strict
  - [ ] `next.config.mjs`: `output: process.env.NEXT_PUBLIC_MODE === 'standalone' ? 'export' : undefined` — static export is configured HERE; the removed `next export` CLI command must NOT appear in any script (RFC-001 §5)
  - [ ] App scripts: `dev:standalone` = `NEXT_PUBLIC_MODE=standalone next dev`, `build:standalone` = `NEXT_PUBLIC_MODE=standalone next build` (use `cross-env` only if Windows support is wanted; macOS/CI don't need it)
  - [ ] Placeholder page makes zero fetch/API calls and imports nothing that would break static export
- [ ] Task 4: Plumb `NEXT_PUBLIC_MODE` (AC: 4)
  - [ ] Add `apps/web/lib/mode.ts` (or equivalent): `export const APP_MODE = process.env.NEXT_PUBLIC_MODE ?? 'standalone'` — the single read-point the Story 1.4 repository factory will consume; nothing else reads the env var directly
  - [ ] PITFALL: `NEXT_PUBLIC_*` vars are string-inlined at build time — only direct `process.env.NEXT_PUBLIC_MODE` property access is replaced; dynamic access (`process.env[name]`, destructuring) yields `undefined` in the browser bundle
  - [ ] `NEXT_PUBLIC_MODE` is declared in `turbo.json` `env` for the standalone build task so Turborepo cache keys include it
- [ ] Task 5: Verify end-to-end (AC: 1–3)
  - [ ] Fresh `npm install` + `npm run build:standalone` from the root builds all 4 packages + web via the turbo graph
  - [ ] `apps/web/out/` contains the static export; serve it with any static file server (`npx serve apps/web/out`) and confirm the home route renders with zero network calls to any backend (check devtools/network — only static assets)
  - [ ] `npx tsc --noEmit` passes strict in every workspace
  - [ ] Commit the scaffold as the initial commit

## Dev Notes

### Constraints the developer MUST follow

- **No external starter template.** The scaffold is defined by RFC-001; the readiness report (2026-07-16) confirms Story 1.1 IS the scaffold story. Don't pull in a turbo starter with extra apps/config.
- **`apps/api` is post-MVP (AR-1).** Do NOT scaffold it. The `deploy/` folder in RFC-001's tree is CI/deploy concern — Story 1.2 territory; skip it here.
- **Turborepo 2.x syntax.** Top-level key is `tasks`; `pipeline` is the retired 1.x name (RFC-001 explicitly flags this; most pre-2024 tutorials show the old key). Current stable is Turborepo 2.9 (2026-03).
- **Next.js static export** = `output: 'export'` in `next.config.mjs`, conditional on `NEXT_PUBLIC_MODE === 'standalone'`. Standalone emits to `apps/web/out/`. Next 16.2.x LTS is current stable (2026-07); App Router only — no `pages/` directory.
- **TypeScript strict everywhere** — one shared `tsconfig.base.json`, every workspace extends it. `tsc --noEmit` becomes a CI gate in 1.2; make it pass now.
- **Package names are `@gol/*`** exactly: `@gol/domain`, `@gol/simulation`, `@gol/persistence`, `@gol/test-utils` (epics AC, AR-5). The web app is `apps/web` (not `@gol/web` — RFC-001 tree shows plain `web`; any name works for a private app, but keep imports of packages as `@gol/*`).
- **Scope discipline:** this story is scaffold ONLY. No ESLint/Prettier/husky (1.2), no AR-46 lint rule (1.2), no Vitest config (1.2), no Zod (1.3), no MUI (1.9), no repositories (1.4). Placeholder `src/index.ts` files keep packages compiling; that's it. If a `test` turbo task is registered now, make it a no-op that passes (or omit it until 1.2) — CI must not be pre-broken.

### Package dependency graph (enforced boundaries, AR-1)

```
@gol/domain          ← no internal deps (entities, schemas, rules-engine later)
@gol/simulation      ← @gol/domain
@gol/persistence     ← @gol/domain
@gol/test-utils      ← @gol/domain, @gol/persistence
apps/web             ← all four
```

Declaring these now (even between placeholder packages) makes `turbo run build` exercise real `^build` ordering from the first commit, and mechanically prevents e.g. `@gol/domain` importing from `@gol/persistence` later.

**Package build convention (decided): just-in-time packages.** Each `@gol/*` package exports TS source directly (`"exports": { ".": "./src/index.ts" }`); `apps/web` lists all four in `next.config.mjs` `transpilePackages`; each package's `build` script is `tsc --noEmit` (typecheck-as-build — no `dist/`, no d.ts plumbing). This is the standard Turborepo internal-package pattern for a single consuming app, keeps Vitest (1.2) consuming source directly, and still gives `turbo run build` a real per-package task to order and cache. Revisit only if `apps/api` (post-MVP) ever needs compiled output.

### Project Structure Notes

Target tree (RFC-001 §5, minus post-MVP `api/` and `deploy/`):

```
GameOfLife/                  ← existing root (docs/, _bmad/, .claude/ already present — keep them)
├── apps/web/                Next.js app: app/layout.tsx, app/page.tsx, next.config.mjs, lib/mode.ts
├── packages/domain/         src/index.ts placeholder
├── packages/simulation/     src/index.ts placeholder
├── packages/persistence/    src/index.ts placeholder
├── packages/test-utils/     src/index.ts placeholder
├── package.json             workspaces + turbo scripts
├── turbo.json               2.x "tasks" key
├── tsconfig.base.json       strict
└── .gitignore / .nvmrc
```

Routes will eventually be exactly three (`/`, `/battle/[id]`, `/settings` — AR-28); this story ships only `/`.

### Testing requirements (this story)

No test framework lands yet (Vitest + gates are Story 1.2 / coverage flip is 3.7). "Tested" for 1.1 = the Task 5 verification checklist: clean install → turbo builds all 5 workspaces → static export serves the placeholder with zero backend calls → strict typecheck passes. Record the verification commands + output summary in the Dev Agent Record.

### Latest tech notes (verified 2026-07-16)

- **Next.js 16.2.x LTS** — current stable line; React 19 peer. `output: 'export'` is the only static-export mechanism (`next export` CLI removed back in Next 14 — RFC-001 repeats this warning).
- **Turborepo 2.9** — `tasks` key; `--affected`, stable `turbo query`; nothing in 2.9 changes the RFC-001 config shape.
- Pin exact-ish versions in package.json (caret on current stable is fine); the point is a reproducible fresh-clone build, not chasing latest.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.1] — story statement + ACs
- [Source: docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md#5] — repo structure, workspace config, turbo.json shape, next.config static-export snippet, build scripts
- [Source: docs/planning-artifacts/architecture.md#Repository / Package Structure] — canonical package list (AR-1)
- [Source: docs/planning-artifacts/architecture.md#Tech Stack] — Next.js App Router static export, TypeScript strict (AR-2)
- [Source: docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md#Decision 9] — what Story 1.2 will bolt onto this scaffold (don't pre-build it, don't block it)
- [Source: docs/planning-artifacts/implementation-readiness-report-2026-07-16.md] — "no external starter; Story 1.1 is the scaffold story"

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
