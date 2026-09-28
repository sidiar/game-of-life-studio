---
baseline_commit: 9f3d28794491c7af8874527bc7b671993ec3c0e4
---

# Story 7.1: Preset Workspace Foundations

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want repo-bundled preset workspaces with a manifest and a CI lockstep gate,
so that presets can be authored, improved, and consumed over time without ever growing a second format.

## Acceptance Criteria

1. **Given** the deployed static export, **When** built, **Then** `apps/web/public/workspaces/` ships every preset as a full workspace export envelope (`WorkspaceExportSchema`, `kind: 'workspace'`) plus an `index.json` manifest listing each preset's stable id, name, description, and file, and designating the default preset (FR-9.1)
2. **And** a typed manifest contract module exists in `apps/web` for future consumers (no runtime consumer yet, by design)
3. **And** a test validates every bundled preset through the production import gate (`validateImportFile`) and keeps folder ↔ manifest in exact lockstep — orphans in either direction fail CI (FR-9.1)
4. **And** the first preset is generated through the real serializer (never handwritten), and the authoring path — build in app → Export Workspace → drop file + manifest entry — is documented at the contract module (FR-9.1)

## Tasks / Subtasks

- [x] **Task 1 — Manifest contract module** (AC: 1, 2, 4)
  - [x] 1.1 Create `apps/web/lib/workspaces/presetManifest.ts`. Start from the PoC's version (`git show origin/poc/preset-workspace-library:apps/web/lib/workspaces/presetManifest.ts`) — its head comment already carries the folder contract, the "no second format, no preset parser ever" rule, and the authoring path; keep all of that.
  - [x] 1.2 Add the **default designation** the PoC lacks (FD2): `PresetWorkspaceManifest` gains `defaultPresetId: string`. Document on the field that it must name an entry's `id`, and that 7.4 (first-visit auto-load) is its first reader.
  - [x] 1.3 Tighten the `id` doc to the slug contract (FD3) and export the pattern as a constant (`PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`) so the test and 7.6's URL parser share one definition.
  - [x] 1.4 Keep `PRESET_WORKSPACES_PATH = '/workspaces'` and `PRESET_MANIFEST_FILE = 'index.json'`. **Do not** import any JSON from `public/` into this module (FD5).
  - [x] 1.5 Update the head comment's forward references to the real story ids: Story 7.4 (first-visit auto-load), 7.5 (Settings loader), 7.6 (preset link), 7.2 (manifest description becomes a projection of the envelope's workspace description). Cite `FR-9.1` in the comment.
- [x] **Task 2 — Generate the first preset through the real serializer** (AC: 1, 4)
  - [x] 2.1 Produce `apps/web/public/workspaces/starter-workspace.json` by running the production export composition, never by writing or editing JSON (FD4). Either route is acceptable:
    - (a) **In-app** — `npm run dev` (dev build seeds the AR-45 fixtures into a fresh workspace), open `/settings`, **Export Workspace**, move the downloaded `game-of-life-workspace-YYYY-MM-DD.json` into the folder under the preset's file name; or
    - (b) **Throwaway script, not committed** — the same composition headless: `createFakeRepositories()` (`@gol/test-utils`) → `seedDefaultWorkspace(repos)` → `seedDevFixtures(repos)` → `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() }).exportWorkspace()` → `JSON.stringify(envelope, null, 2)` (exactly `downloadJsonFile`'s encoding) → write the file. Delete the script afterwards.
  - [x] 2.2 Then run `npx prettier --write apps/web/public/workspaces/` — `format:check` covers `public/**/*.json` (nothing in `.prettierignore` exempts it) and lint-staged would reformat it at commit anyway. Formatting is not authoring; **no other edit** — do not normalise `exportedAt`, rule UUIDs, or ids by hand.
  - [x] 2.3 Record the route taken and the command(s) in the Dev Agent Record.
- [x] **Task 3 — Manifest** (AC: 1)
  - [x] 3.1 Create `apps/web/public/workspaces/index.json`: one entry `{ id: 'starter-workspace', name: 'Starter Workspace', description: <PoC's sentence>, file: 'starter-workspace.json' }` and `"defaultPresetId": "starter-workspace"`. (The PoC's `index.json` is the template.) This preset is a placeholder for 7.3's showcase content — do not polish it.
- [x] **Task 4 — Lockstep gate** (AC: 3)
  - [x] 4.1 Create `apps/web/lib/workspaces/presetWorkspaces.test.ts` from the PoC's test and extend it:
    - manifest has ≥1 entry; every `id`/`name`/`description`/`file` non-blank (PoC)
    - no duplicate `id` or `file` (PoC)
    - every `id` matches `PRESET_ID_PATTERN` (new, FD3)
    - `defaultPresetId` equals exactly one entry's `id` (new, FD2)
    - every `file` ends in `.json`, is not `index.json`, and contains no `/`, `\` or `..` (new — the file name is later concatenated into a fetch URL)
    - **folder ↔ manifest lockstep:** the set of folder entries other than `index.json` — **any extension**, not only `.json` (FD6) — equals the set of manifest `file`s, compared sorted with `toEqual` (so the failure message names the orphan)
    - every preset passes `validateImportFile(text)` and yields `kind === 'workspace'` (PoC) — a static loop over `manifest.workspaces`, never `it.each` over the folder (the PoC comment explains why: an empty folder must fail, not be a green run over zero cases)
  - [x] 4.2 Parse the manifest in the test **structurally** (assert the shape before trusting it — `typeof`, `Array.isArray`), not by a bare `as PresetWorkspaceManifest` cast alone; a hand-edited manifest missing `defaultPresetId` must fail with a readable message, not a `TypeError`.
  - [x] 4.3 Resolve the folder path with the idiom that already works in this workspace: `dirname(fileURLToPath(import.meta.url))` (`apps/web/app/routes.test.ts:6-10` explains it) or `__dirname` (`apps/web/lib/themeTokens.test.ts:9`), then `join(…, '..', '..', 'public', 'workspaces')`. The PoC used `process.cwd()` and claims `fileURLToPath` throws under jsdom — `routes.test.ts` shows the `dirname(fileURLToPath(...))` form works; pick one, make it pass, and keep the comment truthful.
  - [x] 4.4 Negative proof (manual, not committed): temporarily add a stray file to the folder and remove a manifest entry — confirm each fails the gate with a message naming the file; revert. Record in the Dev Agent Record.
- [x] **Task 5 — Verify** (AC: 1–4)
  - [x] 5.1 `npm run build:standalone`, then confirm `apps/web/out/workspaces/index.json` and `apps/web/out/workspaces/starter-workspace.json` exist (Next copies `public/` verbatim into the static export). Record it; no test for this (FD7).
  - [x] 5.2 `npm run ci:dev` green (never four-browser `npm run ci` in the dev step). `bundle:check` must show **no route growth** — if any route grew, something imported preset JSON into app code (FD5).

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Land the PoC, don't redesign it.** `origin/poc/preset-workspace-library` @ `6707203` (never merges; read it with `git show` / `git diff origin/main...origin/poc/preset-workspace-library`, do not check it out or cherry-pick) holds the four files this story lands: `apps/web/lib/workspaces/presetManifest.ts`, `apps/web/lib/workspaces/presetWorkspaces.test.ts`, `apps/web/public/workspaces/index.json`, `apps/web/public/workspaces/starter-workspace.json`. Keep its locations, names and comment substance. What it lacks against the ACs is FD2 (default designation); what this story adds on top is FD3/FD6 and a regenerated envelope (FD4).
- **FD2 — Default designation = top-level `defaultPresetId`** (not a per-entry `default: true`). A per-entry boolean admits zero or two defaults and needs a test to forbid both; a single id admits only "names a listed entry or doesn't", which the gate checks. Manifest shape:
  ```json
  { "defaultPresetId": "starter-workspace", "workspaces": [ { "id": "…", "name": "…", "description": "…", "file": "….json" } ] }
  ```
  Keep the PoC's `workspaces` key name.
- **FD3 — Preset ids are lowercase kebab slugs**, `^[a-z0-9]+(?:-[a-z0-9]+)*$`, exported as `PRESET_ID_PATTERN`. 7.6 addresses a preset by id inside a URL; a slug needs no encoding and cannot smuggle a path. Ids are **stable forever** once shipped (a shared link names them) — say so in the doc comment.
- **FD4 — Regenerate the envelope; don't copy the PoC file.** The PoC file's `exportedAt` is `2026-09-28T00:00:00.000Z` — midnight to the millisecond, almost certainly hand-normalised — so its "never handwritten" provenance is not clean. The content is the AR-45 dev fixtures (`seedDefaultWorkspace` + `seedDevFixtures` — Conway's Classic, Aggressive Colonizer, Patient Defender, Chaotic Spreader; battles "Three-Way Skirmish" and "Grand Colony War"), and regenerating it through either Task 2.1 route reproduces the same content with honest provenance. Mock ids (`mock-aggressive-colonizer`, …) in a shipped file are accepted: 7.3 replaces this preset with showcase content (its AC: "replaces (or demotes from default) the dev-fixture starter preset").
- **FD5 — Presets are fetched at runtime, never imported.** No `import … from '@/public/workspaces/…'` / `import manifest from '…/index.json'` anywhere in app code: it would pull every preset into the JS bundle (AR-3 growth gate) and defeat the "drop a file to author" model. Only the **test** reads the folder, off disk with `node:fs`. The contract module holds types + constants only.
- **FD6 — Lockstep compares every folder entry, not just `*.json`.** The PoC filtered `f.endsWith('.json')`, so a stray `notes.txt` or a mis-extensioned `preset.JSON` would ship silently. Everything in `public/workspaces/` except `index.json` must be listed.
- **FD7 — No runtime parser/schema for the manifest in this story.** Zod parses at boundaries; the manifest's boundary is 7.4's runtime `fetch`, so 7.4 owns the runtime parse (and whether `apps/web` takes a direct `zod` dependency — it has none today; `package.json` lists only `@gol/*`, MUI, Next, React). Do not add `zod` to `apps/web` here. The test does its own structural assertions (Task 4.2).

### What exists: read these before writing a line

- `packages/persistence/src/workspaceImport.ts` — `validateImportFile(fileText)` = steps 1–4 of the atomic import (JSON.parse → `migrate(parsed, 'envelope')` → `WorkspaceExportSchema.safeParse` → unsafe-id guard → `assertReferentialClosure`). Pure, touches no storage; throws `ImportError` (codes incl. `not-json`, `corrupt`, `newer-version`). **Passing it == passing the production import minus the writes.** Exported from `@gol/persistence` (`index.ts`).
- `packages/persistence/src/workspaceSerializer.ts` — `createWorkspaceSerializer({ repos, appVersion, now })`; `exportWorkspace()` returns the wire envelope (battles + organisms, never settings — Decision F).
- `apps/web/lib/export/exportWorkspaceToFile.ts` + `downloadJsonFile.ts` — the in-app export: `JSON.stringify(value, null, 2)`, filename `game-of-life-workspace-YYYY-MM-DD.json`.
- `apps/web/lib/appVersion.ts` — `APP_VERSION` from `apps/web/package.json` (`0.0.0`); provenance only (Decision I.4).
- `packages/test-utils/src/seedDevFixtures.ts` + `mockWorkspace.ts` — the AR-45 fixtures (route (b) of Task 2.1). `@gol/test-utils` is banned from non-test app code by ESLint — a throwaway script is fine, never commit it under `apps/web/lib`.
- `apps/web/lib/gallery/useWorkspaceSeed.ts` — **not touched by this story.** Current shape (since Story 5.11): returns `{ status: 'seeding' | 'ready' | 'error', error }`; reads `isFreshWorkspace()` before `seedDefaultWorkspace()`; dev-only `seedDevFixtures` via dynamic import. 7.4 extends this call site; nothing here pre-wires it.
- `packages/domain/src/settingsSchema.ts` — `CURRENT_FORMAT_VERSION = 1`. No domain schema has changed since the PoC's base (`ef01179`), so the envelope shape is unchanged; the regenerated file will still be `formatVersion: 1`.
- `apps/web/vitest.config.mts` — jsdom, `include: ['**/*.test.{ts,tsx}']`, excludes `scripts/**`; so `lib/workspaces/*.test.ts` is picked up automatically. apps/web has **no coverage gate** — don't pad.
- Existing `node:fs`-reading tests in apps/web: `app/routes.test.ts`, `lib/themeTokens.test.ts` — follow their path idiom.

### Architecture compliance

- **No new format, no new parser, ever** (FR-9.1, epics Epic 7 intro, PRD changelog §2): a preset is an FR-8.3 envelope; every load goes through FR-8.4's pipeline. The contract module must say so (the PoC head comment does).
- **Static export, no server** (project-context Next.js rules): the folder must describe itself because nothing can enumerate a directory at runtime — that is why `index.json` exists. Nothing here may need server routing.
- **`formatVersion` is the only version anything branches on** (Decision I) — the gate goes through `migrate`, so a future format bump surfaces as a test failure here, never as a broken preset in production.
- **Naming:** non-component TS files camelCase (`presetManifest.ts`, `presetWorkspaces.test.ts`); JSON files kebab-case.
- **Comments explain WHY**, cite spec IDs exactly as spelled (`FR-9.1`, `AR-45`, `Decision I`) — `npm run spec:check` fails on an ID that resolves to nothing under `docs/`. `FR-9.1`…`FR-9.5` resolve (PRD §FR-9). Don't write `Story 7.4` style forward refs unless the ID exists in `docs/` — it does (`epics.md` Story 7.4), so they resolve.

### Library / framework notes

No new dependencies. Vitest 4, Node `node:fs`/`node:path`/`node:url`, `@gol/persistence` (already an `apps/web` dependency). No web research needed — nothing version-sensitive is introduced.

### Testing standards

- The lockstep test reads the **real** folder — no fixtures, no mocks (that is the gate's entire value).
- Assertion messages must name the offending entry/file (`expect(x, \`…${entry.file}…\`)`), so a CI failure is actionable without re-running locally.
- Don't write a test for Next copying `public/` (framework behaviour) — verify it once manually (Task 5.1).
- Local gate: `npm run ci:dev`. Don't pipe it through `tail` (swallows the exit code).

### Project Structure Notes

- New: `apps/web/lib/workspaces/presetManifest.ts`, `apps/web/lib/workspaces/presetWorkspaces.test.ts`, `apps/web/public/workspaces/index.json`, `apps/web/public/workspaces/starter-workspace.json`.
- Modified: none outside the story file / sprint status.
- `lib/workspaces/` mirrors `public/workspaces/`. Don't name it `lib/presets/` — "preset" already means grid-size presets in this codebase (`lib/battle/gridPresets.ts`, `EDITABLE_GRID_PRESETS`).
- Served URL: `/workspaces/index.json` and `/workspaces/<file>` (no `basePath` in `next.config.mjs`; custom domain via `public/CNAME`).

### What NOT to build

- No fetch, no loader, no hook, no UI — 7.4 (auto-load), 7.5 (Settings row), 7.6 (link) each own theirs.
- No `description` fields on schemas or the envelope — that is 7.2 (and 7.2 later turns the manifest description into a projection of the envelope's workspace description, asserted by this story's gate).
- No showcase content — 7.3.
- No committed generator script, no build step that writes presets. Authoring is through the app.

### Previous story intelligence

First story of Epic 7. Relevant carry-over from Epic 5 (archived in `docs/implementation-artifacts/epic-5/`): 5.3 built the serializer/envelope, 5.8 the atomic import and `validateImportFile` (exported separately precisely so a caller can validate without repositories — this gate is the second such caller after 5.9's file-pick), 5.9 the import UI, 5.11 reshaped `useWorkspaceSeed` → `{status, error}` and added `recoverWorkspace()` / `StorageFailureNotice` (untouched here; relevant to 7.4).

### Git intelligence

`main` @ `9f3d287` (Epic 5 closed, #96). The PoC branched from `ef01179` (#89, story 5.9); since then only `@gol/persistence` changed (5.10 `resetWorkspace`, 5.11 `recoverWorkspace`, storage-failure handling) — nothing in the envelope/import path this story depends on.

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.1: Preset Workspace Foundations] and #Epic 7 intro
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-9.1]
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/CHANGELOG-preset-workspace-library.md]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md] (no UI in 7.1; §2/§3 show how 7.5/7.6 consume `name`/`description`/`id`)
- [Source: docs/planning-artifacts/architecture.md — Decision I (format versioning), M8 (import is a destructive replace)]
- [Source: docs/project-context.md — static export, spec:check, naming, bundle growth gate]
- PoC: `origin/poc/preset-workspace-library` @ `6707203`

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- Task 2.1: route (b), throwaway script (`apps/web/scripts/generateStarterWorkspace.test.ts`, deleted after use, run via `npx vitest run --config vitest.sweep.config.mts scripts/generateStarterWorkspace.test.ts` from `apps/web`) — `createFakeRepositories()` → `seedDefaultWorkspace(repos)` → `seedDevFixtures(repos)` → `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() }).exportWorkspace()` → `JSON.stringify(envelope, null, 2)` written to `apps/web/public/workspaces/starter-workspace.json`. Confirmed output content: `organisms` = Conway's Classic, Aggressive Colonizer, Patient Defender, Chaotic Spreader; `battles` = Three-Way Skirmish, Grand Colony War (AR-45 fixtures, as FD4 expects). Then `npx prettier --write apps/web/public/workspaces/` (Task 2.2).
- Task 4.4 negative proof (manual, reverted, not committed):
  1. Added a stray `public/workspaces/notes.txt` → `lists exactly the entries present in the folder` failed: `expected [ 'notes.txt', …(1) ] to deeply equal [ 'starter-workspace.json' ]`, naming the orphan. Reverted (`rm notes.txt`).
  2. Emptied `index.json`'s `workspaces` array → 3 tests failed: "has at least one preset…" (`expected 0 to be greater than 0`), "defaultPresetId names exactly one listed entry" (`expected [] to have a length of 1 but got +0`), and the lockstep test (`expected [ 'starter-workspace.json' ] to deeply equal []`). Reverted (`index.json` restored to its committed content, re-verified with `npx vitest run lib/workspaces/presetWorkspaces.test.ts` → 7/7 passing).
- Task 5.1: `npm run build:standalone` → confirmed `apps/web/out/workspaces/index.json` and `apps/web/out/workspaces/starter-workspace.json` both exist (Next copies `public/` verbatim).
- Task 5.2: `npm run ci:dev` green end-to-end (typecheck → lint [0 errors, 1 pre-existing unrelated warning in `BattleGallery.tsx`] → format:check → spec:check → boundary:check → coverage → build:standalone → bundle:check → bench → bench:check → e2e:chromium). `bundle:check`: all five routes show **negative** growth (-0.1 KB each vs. baseline) — no route grew, confirming FD5 (nothing imports preset JSON into app code). `bench:check`: 7.465 ms vs. 16.667 ms budget (55.2% headroom). `e2e:chromium`: 313 passed, 1 skipped.

### Completion Notes List

- Landed the PoC's four files (`origin/poc/preset-workspace-library` @ `6707203`) per FD1, adding FD2 (`defaultPresetId`), FD3 (`PRESET_ID_PATTERN` slug constant), and FD6 (lockstep over every folder entry, not just `*.json`) on top.
- `starter-workspace.json` was regenerated through the real serializer (FD4), never copied from the PoC — see Debug Log for the route and confirmed content.
- Lockstep test resolves the folder with `dirname(fileURLToPath(import.meta.url))` (Task 4.3) — this jsdom-environment suite does not hit the PoC's claimed `fileURLToPath` throw; the comment says so.
- Manifest is parsed structurally in the test (`typeof`/`Array.isArray` checks) before being trusted, per Task 4.2.
- No new dependencies; no runtime consumer added (FD7); no `zod` added to `apps/web` (FD7).
- All 4 ACs satisfied; `npm run ci:dev` green with no route bundle growth.

### File List

- `apps/web/lib/workspaces/presetManifest.ts` (new)
- `apps/web/lib/workspaces/presetWorkspaces.test.ts` (new)
- `apps/web/public/workspaces/index.json` (new)
- `apps/web/public/workspaces/starter-workspace.json` (new)

### Change Log

- 2026-09-28 — Story 7.1 implemented: landed the PoC's manifest contract module and lockstep test
  with FD2 (`defaultPresetId`), FD3 (`PRESET_ID_PATTERN`) and FD6 (any-extension lockstep) added;
  regenerated `starter-workspace.json` through the real serializer (FD4); authored `index.json`.
  `npm run ci:dev` green, no route bundle growth. Status → review.

Dev Model: sonnet   # lands an existing PoC (4 files) with every open choice pinned in FD1–FD7 (default designation, id slug, regeneration route, no runtime parser); nothing left to architect
Proposed lane gate: none
