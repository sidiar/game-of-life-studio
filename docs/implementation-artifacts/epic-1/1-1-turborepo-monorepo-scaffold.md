---
baseline_commit: 6a19409e0d593f1dcc6c7dfaa80fba344e27c262
---

# Story 1.1: Turborepo Monorepo Scaffold

Status: done

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

- [x] Task 1: Initialize repo root (AC: 1)
  - [x] `git init` at the project root — the repo is NOT yet a git repository; husky (Story 1.2) requires it *(already satisfied: repo existed with initial commit `6a19409` before dev started; baseline captured in frontmatter)*
  - [x] Scaffold IN PLACE at `/Users/sidiar/projects/NewJob/GameOfLife` — `docs/`, `_bmad/`, `.claude/` already live here; do NOT create a nested project folder and do NOT use `create-turbo`/`create-next-app` interactive scaffolds that require an empty directory (generate files manually or into a temp dir and merge)
  - [x] Root `package.json`: `"name": "game-of-life-studio"`, `"private": true`, `"workspaces": ["apps/*", "packages/*"]`, `"packageManager"` pinned (npm — RFC-001 uses npm-style workspaces), scripts `dev` / `build` / `build:standalone` / `test` delegating to `turbo run …`
  - [x] `turbo.json` using Turborepo 2.x `"tasks"` key (NOT the 1.x `"pipeline"` key): `build` with `"dependsOn": ["^build"]`; `build:standalone` with `"env": ["NEXT_PUBLIC_MODE"]`, `"outputs": ["apps/web/out/**"]` *(implemented as workspace-relative `"out/**"` in an `apps/web/turbo.json` override — Turborepo 2.x resolves output globs relative to each package directory; see Completion Notes)*
  - [x] `.gitignore` (node_modules, .next, out, .turbo, coverage), `.nvmrc` / `engines` pinning current Node LTS
  - [x] Root `tsconfig.base.json` with `"strict": true` extended by every package and the app
- [x] Task 2: Scaffold the four packages (AC: 1)
  - [x] `packages/domain` → `@gol/domain`; `packages/simulation` → `@gol/simulation`; `packages/persistence` → `@gol/persistence`; `packages/test-utils` → `@gol/test-utils`
  - [x] Each: `package.json` (name, `"private": true`, `"exports"` pointing at TS source — see just-in-time convention in Dev Notes), `tsconfig.json` extending the strict base, one placeholder export in `src/index.ts` so the package graph compiles
  - [x] Internal deps declared now so `^build` ordering is real from day one: `@gol/persistence` and `@gol/simulation` depend on `@gol/domain`; `@gol/test-utils` depends on `@gol/domain` and `@gol/persistence` (it will provide fake repos implementing 1.4 interfaces); `apps/web` depends on all four
  - [x] NO business code — Zod schemas land in 1.3, repositories in 1.4, engine in Epic 3. Placeholders only.
- [x] Task 3: Scaffold `apps/web` (AC: 2, 3)
  - [x] Next.js (current stable 16.2.x LTS as of 2026-07) + React, App Router: `app/layout.tsx` + `app/page.tsx` placeholder home route (static text — real Gallery arrives in 1.10; theming/shell in 1.9 — do NOT install MUI now)
  - [x] `tsconfig.json` extends the strict base; build must pass `tsc` strict
  - [x] `next.config.mjs`: `output: process.env.NEXT_PUBLIC_MODE === 'standalone' ? 'export' : undefined` — static export is configured HERE; the removed `next export` CLI command must NOT appear in any script (RFC-001 §5)
  - [x] App scripts: `dev:standalone` = `NEXT_PUBLIC_MODE=standalone next dev`, `build:standalone` = `NEXT_PUBLIC_MODE=standalone next build` (use `cross-env` only if Windows support is wanted; macOS/CI don't need it)
  - [x] Placeholder page makes zero fetch/API calls and imports nothing that would break static export
- [x] Task 4: Plumb `NEXT_PUBLIC_MODE` (AC: 4)
  - [x] Add `apps/web/lib/mode.ts` (or equivalent): `export const APP_MODE = process.env.NEXT_PUBLIC_MODE ?? 'standalone'` — the single read-point the Story 1.4 repository factory will consume; nothing else reads the env var directly *(carve-out: `next.config.mjs` also reads `process.env.NEXT_PUBLIC_MODE` directly, as RFC-001 §2 mandates — this rule governs the browser bundle, not the build config. Both must default identically; do not "fix" the config read.)*
  - [x] PITFALL: `NEXT_PUBLIC_*` vars are string-inlined at build time — only direct `process.env.NEXT_PUBLIC_MODE` property access is replaced; dynamic access (`process.env[name]`, destructuring) yields `undefined` in the browser bundle
  - [x] `NEXT_PUBLIC_MODE` is declared in `turbo.json` `env` for the standalone build task so Turborepo cache keys include it
- [x] Task 5: Verify end-to-end (AC: 1–3)
  - [x] Fresh `npm install` + `npm run build:standalone` from the root builds all 4 packages + web via the turbo graph
  - [x] `apps/web/out/` contains the static export; serve it with any static file server (`npx serve apps/web/out`) and confirm the home route renders with zero network calls to any backend (check devtools/network — only static assets)
  - [x] `npx tsc --noEmit` passes strict in every workspace
  - [x] Commit the scaffold as the initial commit *(scaffold verified and ready; commit performed manually by Sidiar after review, on top of the pre-existing planning-artifacts initial commit)*

### Review Findings

Code review 2026-07-16 (Blind Hunter / Edge Case Hunter / Acceptance Auditor). All 4 ACs assessed MET by the Acceptance Auditor; findings below are hardening and hygiene, none block acceptance.

**Decisions taken (Sidiar, 2026-07-16):**

- [x] [Review][Decision] Mode contract for unset / empty / invalid `NEXT_PUBLIC_MODE` — **Resolved: align defaults only.** `next.config.mjs` will default to `'standalone'` when the var is unset, matching `lib/mode.ts`; converted to a patch item below. Deliberately NOT doing now: union typing of `APP_MODE` and validate/throw on invalid values. Accepted residual risk, carried into Story 1.4 — `APP_MODE` stays typed `string`, so the 1.4 factory cannot switch exhaustively; `NEXT_PUBLIC_MODE=""` still defeats `??` (empty string is not nullish) yielding `APP_MODE === ''`; and typos (`Standalone`, `hosted`) are still accepted silently, surfacing only as a missing `out/` at deploy time. Story 1.4 should define the mode contract properly when it consumes the flag.
- [x] [Review][Decision] RFC-001 §5 carries a factually wrong `outputs` snippet — **Resolved: leave RFC as-is, story note only.** RFC-001 §5 specifies `"outputs": ["apps/web/out/**"]`; turbo resolves output globs package-relative, so that literal path matches nothing. The correct reasoning stays recorded in this story's Completion Notes; the RFC retains the broken snippet by decision. Known trap for anyone consulting RFC-001 §5 directly.
- [x] [Review][Decision] RFC-001's `build:connected` / `dev:connected` scripts and turbo task are absent — **Resolved: leave unimplemented; standalone-first accepted.** RFC-001 §2/§5 specify them. Note this was initially accepted on the grounds that the generic `build` task de-facto filled the server slot — **that rationale no longer holds** once the mode defaults are aligned (above): with unset ⇒ standalone, plain `build` emits a static export and `build`/`build:standalone` become functionally identical. **Consequence, accepted by decision:** the repo has NO server-build target and connected mode is unreachable by any script; it requires setting `NEXT_PUBLIC_MODE=connected` by hand until `build:connected` lands. This is consistent with a standalone-only MVP. Story implementing connected mode / `apps/api` must add `build:connected` + `dev:connected` per RFC-001 §2/§5.
- [x] [Review][Patch] `next.config.mjs` default disagrees with `lib/mode.ts` when `NEXT_PUBLIC_MODE` is unset [apps/web/next.config.mjs:5] — From the decision above. `lib/mode.ts` defaults unset → `'standalone'` while `next.config.mjs` treats unset → NOT standalone, so a plain `next build` emits a server build whose HTML renders `mode: standalone`. Fix: read `process.env.NEXT_PUBLIC_MODE ?? 'standalone'` in `next.config.mjs` and compare that. Scope: default alignment only — no validation, no union type. NOTE: this makes plain `build` emit a static export, so the `out/**` outputs patch below becomes unconditional for that task, not just an edge case.
- [x] [Review][Patch] `build` task's declared outputs do not cover `out/`, causing a cache-dependent missing deploy artifact [apps/web/turbo.json:5-7] — CRITICAL. `build` declares `[".next/**", "!.next/cache/**"]`. Turbo's Next.js framework inference puts `NEXT_PUBLIC_MODE` in the `build` hash and passes it through, so `next build` with the var set really does emit `out/`. Verified: cold cache created `apps/web/out/`; after `rm -rf`, the same command hit `FULL TURBO`, restored `.next`, and never recreated `out/`. CI running `build` with the var set gets the export on a cold cache and nothing on a warm one.
- [x] [Review][Patch] `tsconfig.base.json` is in no task's hash — every typecheck cache goes stale on a base change [turbo.json:1-25] — No `globalDependencies`; `globalCacheInputs.files` is empty and each package's `build` hashes only `package.json, src/index.ts, tsconfig.json`. Verified: flipping `strict: false` in the base returned cache HIT on all four `@gol/*` typechecks, re-running zero checks. The strictness guarantee this story establishes is unenforced after the first cache fill.
- [x] [Review][Patch] `.env*` files are invisible to the turbo hash but visible to `next.config.mjs` [turbo.json:1-25] — `.env` is gitignored and no task declares `inputs`, so turbo's default input set excludes it, but Next loads `.env*` before evaluating `next.config.mjs`. Verified: with `.env.local` present the `web#build` hash was unchanged → `FULL TURBO`, no `out/`; same file on a cold cache → full export. A mode set via `.env.local` is silently ignored.
- [x] [Review][Patch] Committed `next-env.d.ts` is the dev-generated variant and every `next build` rewrites it [apps/web/next-env.d.ts:3] — Committed content imports `./.next/dev/types/routes.d.ts`; verified that `turbo run build` rewrites it to `./.next/types/routes.d.ts`, leaving the tree dirty. It is also a declared hash input of `web#build`, so it flip-flops and invalidates the cache whenever a developer alternates `dev` and `build`. (Note: this does NOT break a fresh-clone typecheck — `skipLibCheck: true` suppresses it; verified exit 0 on a clean `git archive`.)
- [x] [Review][Patch] `apps/web/turbo.json`'s `build:standalone` block is a byte-for-byte duplicate of root and contributes nothing [apps/web/turbo.json:8-11] — Package configs merge field-wise with root, so only `build: { outputs: [...] }` does real work. The Completion Note says the `out/**` deviation was "Implemented as `out/**` in a package-level `apps/web/turbo.json`", implying root was left alone — root also carries `outputs: ["out/**"]`. Remove the redundant block and correct the note.
- [x] [Review][Patch] `start` script is unreachable in the mode this app primarily targets [apps/web/package.json:9] — `next start` is unsupported when the build used `output: 'export'`. The only "run the production build" script fails for standalone, with no `serve out/` substitute documented.
- [x] [Review][Patch] `engines.node >= 24` is declarative only [package.json:6-8] — No `.npmrc` with `engine-strict=true` anywhere in the repo, so npm emits at most a warning; a contributor on Node 20/22 installs and builds until an unrelated runtime error appears.
- [x] [Review][Patch] Story Task 4's "nothing else reads the env var directly" contradicts `next.config.mjs` [story text] — `next.config.mjs:5` reads `process.env.NEXT_PUBLIC_MODE` directly, as RFC-001 §2 mandates. The rule is aimed at the browser bundle; add a one-line carve-out so a future reader doesn't "fix" it.
- [x] [Review][Patch] Dev Agent Record overstates `npm test` as a pure no-op [story text] — `test` declares `dependsOn: ["^build"]`, so `turbo run test` schedules four real `tsc --noEmit` commands. AC intent holds (exits 0, CI not pre-broken) but the note understates what runs.
- [x] [Review][Defer] `turbo run test` is vacuously green — no workspace defines a `test` script [turbo.json:19-21] — deferred, Vitest lands in Story 1.2
- [x] [Review][Defer] `@gol/persistence` has no DOM lib but its next code is localStorage implementations [packages/persistence/tsconfig.json] — deferred, surfaces in Story 1.4
- [x] [Review][Defer] `@gol/test-utils` is in the app's `transpilePackages` and dependency graph — test fakes are one stray import from the browser bundle [apps/web/next.config.mjs:7-12] — deferred, boundary enforcement is the AR-46 lint rule in Story 1.2

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

Claude Fable 5 (claude-fable-5) via Claude Code

### Debug Log References

Verification run (2026-07-16), all from repo root:

- `npm install` — clean install, 41 packages audited, no errors (Node v24.16.0, npm 11.13.0)
- `npm run build:standalone` — turbo graph built all 5 workspaces (4 × `tsc --noEmit` package builds ordered by `^build`, then `web#build:standalone`); Next.js 16.2.10 compiled, strict TypeScript pass, static export emitted to `apps/web/out/`; repeat run = `FULL TURBO` cache hit
- Static serve check — served `apps/web/out/` with `python3 -m http.server 4173`; `GET /` → 200 and every referenced `/_next/static/**` asset → 200; prerendered HTML contains `mode: <!-- -->standalone` (env inlined at build time) and `@gol/domain` placeholder text (transpilePackages wiring proven); zero backend/API references in the export
- `npx tsc --noEmit` in all 5 workspaces (`packages/domain`, `packages/simulation`, `packages/persistence`, `packages/test-utils`, `apps/web`) — all pass under strict
- `npm test` (`turbo run test`) — exits 0, so CI is not pre-broken. Not a pure no-op: the task declares `dependsOn: ["^build"]`, so it schedules the four `@gol/*` `tsc --noEmit` typechecks and reports `Tasks: 4 successful`. No workspace defines a `test` script yet (all resolve to `<NONEXISTENT>` and are skipped); Vitest lands in Story 1.2 — until then this gate cannot distinguish "no runner exists" from "tests pass"

### Completion Notes List

- **Versions installed:** Next.js ^16.2.10 (registry `latest`, matches the story's 16.2.x LTS), React ^19.2.7, Turborepo ^2.10.5 (story cited 2.9 as of 2026-03; 2.10 is the same config shape), TypeScript ^5.9.3.
- **Decision — TypeScript 5.9.x, not 7.x:** registry `latest` is now typescript 7.0.2 (the new native-compiler major, weeks old). Pinned ^5.9.3 instead: Next 16 tooling is guaranteed-compatible with 5.x and the story's stated goal is a reproducible fresh-clone build, not chasing latest. Revisit in a later story once TS7 support matures.
- **Deviation — turbo outputs glob:** story text (and RFC-001 §5) specified `"outputs": ["apps/web/out/**"]`, but Turborepo 2.x resolves output globs relative to each package directory, so that literal path would match nothing. Implemented as `"out/**"` in the ROOT `turbo.json`'s `build:standalone` task; the package-level `apps/web/turbo.json` (`"extends": ["//"]`) scopes the `.next/**` and `out/**` build outputs to the web app only and declares `.env*` inputs. Package configs merge field-wise with root, so `build:standalone` inherits root's `env` and `outputs`. The four `@gol/*` packages use typecheck-as-build (`tsc --noEmit`) and declare no outputs, eliminating turbo "no output files found" warnings. RFC-001 §5 still carries the incorrect snippet — left as-is by decision (see Review Findings).
- **`git init` subtask:** repo was already initialized (initial commit `6a19409` with planning artifacts) before dev began, so no re-init; baseline commit recorded in story frontmatter.
- **Package graph is real, not just declared:** each placeholder `src/index.ts` imports from its declared internal deps (`@gol/simulation`/`@gol/persistence` import `@gol/domain`; `@gol/test-utils` imports both), and `apps/web/app/page.tsx` renders the `@gol/domain` placeholder — so `^build` ordering, the JIT source-exports convention, and `transpilePackages` are all exercised by the build from the first commit. `@gol/test-utils` sits in `apps/web` devDependencies (test-only by nature; still links the workspace and participates in the turbo graph).
- **Mode plumbing (AC 4):** `apps/web/lib/mode.ts` exports `APP_MODE` (defaults to `'standalone'`) as the single env read-point for the Story 1.4 repository factory; `NEXT_PUBLIC_MODE` is in the `build:standalone` task `env` so turbo cache keys include it (verified: the standalone build cache-missed when the env changed context, hit when identical).
- **Housekeeping:** added `*.tsbuildinfo` to `.gitignore` (`apps/web` typecheck uses `incremental`; the stray file was also destabilizing turbo's input hash). `next-env.d.ts` is committed per Next.js convention.
- Scope discipline held: no ESLint/Prettier/husky/Vitest (1.2), no Zod (1.3), no repositories (1.4), no MUI (1.9), no `apps/api`, no `deploy/`.

### File List

New:
- package.json
- package-lock.json
- turbo.json
- tsconfig.base.json
- .nvmrc
- apps/web/package.json
- apps/web/turbo.json
- apps/web/next.config.mjs
- apps/web/tsconfig.json
- apps/web/next-env.d.ts (generated by Next.js, committed per convention)
- apps/web/app/layout.tsx
- apps/web/app/page.tsx
- apps/web/lib/mode.ts
- packages/domain/package.json
- packages/domain/tsconfig.json
- packages/domain/src/index.ts
- packages/simulation/package.json
- packages/simulation/tsconfig.json
- packages/simulation/src/index.ts
- packages/persistence/package.json
- packages/persistence/tsconfig.json
- packages/persistence/src/index.ts
- packages/test-utils/package.json
- packages/test-utils/tsconfig.json
- packages/test-utils/src/index.ts

Modified:
- .gitignore (added `*.tsbuildinfo`)
- docs/implementation-artifacts/epic-1/1-1-turborepo-monorepo-scaffold.md (story tracking)
- docs/implementation-artifacts/sprint-status.yaml (status transitions)

## Change Log

- 2026-07-16: Code review (3 layers) — 3 decisions resolved, 10 patches applied, 3 items deferred, 8 dismissed. Fixed: `build` outputs now cover `out/**` (was a cache-dependent missing deploy artifact — verified), `globalDependencies: ["tsconfig.base.json"]` (typecheck caches no longer go stale on a base change — verified), `.env*` declared as `build` inputs, `next.config.mjs` default aligned with `lib/mode.ts` (standalone-first — plain `build` now emits a static export and the repo has no server target until `build:connected` lands), redundant `apps/web/turbo.json` `build:standalone` block removed, `next-env.d.ts` pinned to the build variant, `start` → `serve out`, `.npmrc` `engine-strict=true`. Re-verified: full turbo build green, static export renders `mode: standalone`, strict `tsc --noEmit` passes in all 5 workspaces, `npm test` exits 0. Status → done.
- 2026-07-16: Story 1.1 implemented — Turborepo monorepo scaffold: root workspace config (turbo 2.x `tasks`, strict shared tsconfig, Node 24 pin), four `@gol/*` JIT packages with real internal dep graph, `apps/web` on Next.js 16.2 App Router with conditional `output: 'export'`, `NEXT_PUBLIC_MODE` plumbed through `lib/mode.ts` + turbo `env`. Verified: full turbo build, static export serves with zero backend calls, strict `tsc --noEmit` green in all 5 workspaces. Status → review.
