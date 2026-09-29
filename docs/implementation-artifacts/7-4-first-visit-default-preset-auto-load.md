---
baseline_commit: 4999674c7688c9c9ee146fe7e35ab29faa7171d0
---

# Story 7.4: First-Visit Default Preset Auto-Load

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a first-time visitor at any entry page (including the root URL),
I want the default preset loaded for me automatically,
so that I see a populated, runnable studio with zero clicks and no dialogs.

## Acceptance Criteria

1. **Given** a fresh workspace (the existing `isFreshWorkspace()` gate) in a production build, **When** any seeding page boundary runs (`useWorkspaceSeed`), **Then** the app fetches the manifest's default preset and imports it through the FR-8.4 pipeline with no dialog. The workspace is pristine, which is the FR-8.4 suppression case (FR-9.2).
2. **And** any failure (fetch, validation, quota) falls back to FR-1.5 default seeding (Conway's Classic) and reaches `status: 'ready'`. The app never blocks or errors on preset availability (FR-9.2).
3. **And** returning users (non-fresh workspace) are never touched, and Clear All Data (FR-8.5 / `resetWorkspace()`) does not re-trigger the preset. Clearing returns to the FR-8.5 default state, and a test asserts this explicitly (FR-9.2).
4. **And** dev builds keep the AR-45 mock-fixture branch unchanged. Its coverage duty is orthogonal to preset content.

## Tasks / Subtasks

- [x] **Task 1: Manifest runtime parse boundary** (AC: 1, 2), per FD2
  - [x] 1.1 Add `zod` to `apps/web/package.json` `dependencies` with the exact spec `@gol/domain` uses (`"^4.4.3"`). Run `npm install` so `package-lock.json` updates. Take no other version bump.
  - [x] 1.2 In `apps/web/lib/workspaces/presetManifest.ts`, add `PresetWorkspaceManifestSchema` (Zod). Entries: `id` matching `PRESET_ID_PATTERN`, non-empty `name`/`description`, and `file === \`${id}.json\``. Top level: `defaultPresetId` must name a listed entry (use `superRefine`). Keep the existing `PresetWorkspaceEntry` / `PresetWorkspaceManifest` interfaces and add a compile-time check that the schema's `z.infer` output is assignable to them, so the two cannot drift. Alternatively, replace the interfaces with `z.infer` aliases under the same exported names. Either way, keep the exported names stable, because 7.5 and 7.6 import them.
  - [x] 1.3 Update the head comment. It currently says "no fetch … and no `zod` dependency: the manifest's runtime parse boundary belongs to Story 7.4", which becomes false. Say that the schema is the parse boundary and that 7.4 is its first runtime caller. Keep every other sentence that is still true, and still import nothing from `public/`.
  - [x] 1.4 Unit tests in a new `presetManifest.test.ts`: accepts the shipped `index.json` shape, and rejects a bad id, `file ≠ ${id}.json`, a `defaultPresetId` naming no entry, and a non-object. Optionally switch `presetWorkspaces.test.ts`'s structural checks to parse through the schema. If you do, the lockstep gate must stay at least as strict as today.
- [x] **Task 2: The loader, a pure and injectable module** (AC: 1, 2), per FD1 and FD3
  - [x] 2.1 Create `apps/web/lib/workspaces/loadDefaultPreset.ts`. It exports `loadDefaultPreset(deps)`, where `deps = { fetch: typeof fetch; repos: AppRepositories; timeoutMs?: number }`. It builds `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() })` itself, which keeps the serializer inside the lazy chunk (FD4). Steps: fetch `${PRESET_WORKSPACES_PATH}/${PRESET_MANIFEST_FILE}` → `response.ok` check → `response.json()` → `PresetWorkspaceManifestSchema.parse` → resolve the default entry → fetch `${PRESET_WORKSPACES_PATH}/${entry.file}` → `response.ok` check → `response.text()` → `serializer.importWorkspace(text)`. It throws on any failure and never catches-and-swallows; the caller owns the fallback.
  - [x] 2.2 Timeout (FD3): export `PRESET_FETCH_TIMEOUT_MS = 5000` with a WHY comment. One `AbortController` covers BOTH fetches and the body reads. It aborts when the timer fires, and the timer is cleared in `finally`. The timeout must NOT cover the import: once the text is in hand, the import runs to completion, because an abort cannot stop a write region in progress and `applyImport` owns its own rollback.
  - [x] 2.3 Unit tests in `loadDefaultPreset.test.ts`, with an injected fake `fetch` (no `vi.stubGlobal` needed) and `createFakeRepositories()`. Assert on the store's contents and the fetch spy: happy path (serve the real `public/workspaces/` files off disk via `node:fs`; the store ends up holding the preset, and only the default entry's file was fetched); a manifest HTTP 404/500; a manifest that is not JSON; a manifest that fails the schema; an envelope HTTP 404; a hung fetch → rejects after the timeout, using fake timers, and the store is untouched; an import rejection (e.g. an envelope body that fails `validateImportFile`) propagates as the `ImportError`. Every failure case asserts that the store is still fresh and unwritten.
- [x] **Task 3: Wire it into `useWorkspaceSeed`** (AC: 1, 2, 3, 4), per FD1, FD4 and FD5
  - [x] 3.1 In `apps/web/lib/gallery/useWorkspaceSeed.ts`, keep the existing order: read `isFreshWorkspace()` BEFORE any write. Then:
    - `fresh && NODE_ENV === 'production'`: `import('@/lib/workspaces/loadDefaultPreset')` (dynamic, FD4) → `loadDefaultPreset({ fetch: globalThis.fetch.bind(globalThis), repos })`. On ANY rejection → `seedDefaultWorkspace(repos)` (FD5).
    - otherwise: `seedDefaultWorkspace(repos)`, exactly as today. The dev branch (`fresh && NODE_ENV === 'development'` → `seedDevFixtures`) stays byte-for-byte the same in behaviour (AC4).
    - Then `setState({ status: 'ready' })` behind `mounted.current`. Keep the `hasRun` / `mounted` ref pattern and its comments.
  - [x] 3.2 A rejection of the fallback `seedDefaultWorkspace` still reaches `status: 'error'` with its error. That is today's behaviour, and Story 5.11's classification depends on it (for example, storage-full on a first-run quota failure). The PRESET's own failure is never surfaced, logged, or put into `error` (FD5).
  - [x] 3.3 Read `process.env.NODE_ENV` INSIDE the effect, as the dev branch already does, so `vi.stubEnv('NODE_ENV', 'production')` works in tests. Compare with `=== 'production'`. Never use `!== 'development'`, because Vitest runs as `'test'` and would then fetch in every apps/web unit test.
  - [x] 3.4 Update the hook's doc comment: the three branches, why freshness is read before any write (which now matters twice), why the preset path is dynamic-imported, and why a preset failure is silent.
  - [x] 3.5 Hook tests: in `apps/web/app/(gallery)/page.test.tsx`, beside the existing `stubEnv('NODE_ENV','development')` case, or in a new `useWorkspaceSeed.test.tsx` using `renderHook` and `createFakeRepositories()` from `@gol/test-utils`. Stub `NODE_ENV='production'` and `vi.stubGlobal('fetch', …)`. Cases:
    - (a) fresh + prod + fetch OK → the store holds the preset's battles and organisms plus the workspace description, `status: 'ready'`. Serve the REAL `public/workspaces/` files off disk via `node:fs` so the test proves the shipped preset imports.
    - (b) fresh + prod + fetch rejects → Conway's Classic alone, zero battles, `status: 'ready'`, `error: undefined`.
    - (c) fresh + prod + the import's write fails (a fake whose `organisms.replaceAll` throws once) → rollback → fallback seeds Conway, `ready`.
    - (d) NOT fresh + prod → `fetch` is never called.
    - (e) after `resetWorkspace()` (Clear All) + remount in prod → `fetch` is never called, and the store is Conway alone (AC3, stated explicitly).
    - (f) `NODE_ENV='test'` → `fetch` never called (the existing Conway-only tests still pass unchanged).
    - (g) StrictMode double-mount in prod → exactly one manifest fetch.
- [x] **Task 4: E2E, the shipped artifact** (AC: 1, 2, 3), per FD6
  - [x] 4.1 Audit every spec that starts from a fresh context without stamping `gol:schema` and asserts the empty or Conway-only baseline. Known: `home.spec.ts`, `appShell.spec.ts`, `createBattle.spec.ts` (the empty-state CTA test), `organisms.spec.ts` (~lines 91/107), `deleteBattle.spec.ts` (~179), `settings.spec.ts` (fresh-profile cases), `storageCorruption.spec.ts`. Grep for `No Battles Yet`, `isFreshWorkspace`, and any spec with no `seedWorkspace`/`addInitScript`. Every spec that needs the empty baseline forces the fallback with `page.route('**/workspaces/index.json', …)` fulfilled as **HTTP 200 with a non-manifest body** (FD6). Do not use `abort()` or a 404: Chromium reports those as console errors, which trips these specs' zero-console-error assertions. Follow the house convention of a file-local helper copy (see `settings.spec.ts:221`'s comment) unless you find a shared e2e helpers module already in use.
  - [x] 4.2 `home.spec.ts` stops being "the production-empty-workspace proof". Rewrite its header comment. Add a new first-visit test: a fresh context at `/` → the gallery shows the default preset's battles by name (read the names from the envelope via `node:fs`, not hard-coded), the workspace description renders, no dialog is present (`getByRole('dialog')` count 0), and there are zero console errors. Also check one other entry page (`/organisms` or `/settings`) the same way, since FR-9.2 says "whichever page they enter".
  - [x] 4.3 Fallback e2e: route the manifest to the 200-garbage body → `/` shows the designed empty state and Conway's Classic exists. This is the existing empty-state proof, now reached through the fallback.
  - [x] 4.4 Clear All e2e (AC3): first visit (preset loads) → Settings → Clear Data → reload `/` → the empty state and Conway alone, with no preset battles. `settings.spec.ts:468`'s Clear All test is the pattern.
  - [x] 4.5 Run `npm run e2e:chromium` locally, never the four-browser `npm run ci`.
- [x] **Task 5: Gates** (AC: all)
  - [x] 5.1 `npm run ci:dev` green. For `bundle:check`: FD4's dynamic import should keep `/`, `/organisms` and `/settings` near their baselines. If any route grows, refresh the baseline in this PR (`npm run build:standalone` then `npm run bundle:baseline`) and state the delta in the Dev Agent Record.
  - [x] 5.2 Manual smoke on the static export (`npm run build:standalone && npx serve out`): a fresh private window at `/` → the preset gallery, then press play on one battle. Take a screenshot into the scratchpad, not the repo. Then DevTools → Network → block `index.json` → a fresh profile → the empty state. Record both in the Dev Agent Record.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: The single integration point is `useWorkspaceSeed`, and the loader is a separate injectable module.** All three seeding boundaries (`app/(gallery)/page.tsx`, `organisms/page.tsx`, `settings/page.tsx`) already call the hook, so extending it covers "any entry page" with zero page edits. The fetch/parse/import logic lives in `lib/workspaces/loadDefaultPreset.ts` with `fetch` and `importWorkspace` injected, because 7.5 (Settings loader) and 7.6 (preset link) need the same manifest fetch → entry → envelope fetch → import chain for an arbitrary id. Consider factoring `fetchPresetManifest(fetch, signal)` and `fetchPresetText(fetch, entry, signal)` as exported helpers now, with `loadDefaultPreset` composing them. Do NOT build 7.5's or 7.6's UI or their id-addressed loader.
  - The loader builds the serializer itself from the injected `repos` (`createWorkspaceSerializer` is a factory over the ports, not a concrete repository), so AR-2/27 holds. `applyImport` is not in the `@gol/persistence` barrel, so don't widen the package API to reach it. `importWorkspace(text)` is the public composition (`validateImportFile` → `applyImport`).
  - `/battle` and `/battle/new` do not seed today (`BattlePage.tsx:~670` documents the accepted empty-library window). The AC scopes this story to "seeding page boundaries", so do not add the seed there. Listed as an open question.
- **FD2: The manifest is parsed with Zod, and `apps/web` takes a direct `zod` dependency.** Story 7.1 FD7 left both the parse and the dependency decision to this story. Zod is already in every route's bundle via `@gol/domain`'s schemas, so the dependency costs no bytes. A hand-rolled guard would be a second validation idiom next to "Zod parses at boundaries" (project-context). The schema lives in `presetManifest.ts`, the contract module, so 7.5 and 7.6 reuse it. Never `as PresetWorkspaceManifest` a fetched body; the module's own comment forbids it.
- **FD3: Timeout budget `PRESET_FETCH_TIMEOUT_MS = 5000`, covering the fetch phase only.** The UX notes say: "if the fetch is slow, the Conway-fallback timeout beats a spinner — decide the budget in-story". The envelope is ~396 KB raw (`colony-clash.json`), which is much smaller gzipped from the static host, and 5 s is generous on broadband while still bounding a hung request. One `AbortController` spans both fetches and both body reads. The import is never inside the timeout: aborting mid-`applyImport` is impossible, and a late-landing import after a fallback would be a second writer racing the Conway seed. A late fetch after abort is simply dropped (the `AbortError` rejects the promise).
- **FD4: The preset path is `import()`-ed dynamically, only when `fresh && production`.** It pulls `createWorkspaceSerializer`, the migration chain, the envelope schema and the loader into `/` and `/organisms`, which today carry none of the import pipeline. Returning visitors, who are every load after the first, should not pay for code that runs once per browser (AR-35 spirit, AR-3 growth gate). Next splits a dynamic `import()` into its own chunk. That is why the loader takes `repos` and builds the serializer itself (Task 2.1): the hook must not import `createWorkspaceSerializer` statically, or the serializer stays in the first-load bundle. `fetch` stays injected for tests.
- **FD5: A preset failure is silent. A fallback failure is not.** Every preset-path rejection is caught and followed by `seedDefaultWorkspace(repos)`. That covers a network failure, a non-OK status, a manifest parse error, an unknown `defaultPresetId`, a timeout, and an `ImportError` of any code, including `newer-version`, which is impossible in practice. There is no `console.*` call: the e2e suite asserts zero console errors on the happy path, and the hook's existing doc says "Never logged". Why the fallback is safe:
  - `applyImport` restores the snapshot of the still-unstamped store on a write failure, so `isFreshWorkspace()` is true again and `seedDefaultWorkspace`'s own gate passes.
  - A fetch/parse failure wrote nothing.
  - After `'rollback-failed'` the store state is unknown. The fallback still runs (it is gated and idempotent), and if IT throws, the hook reports `status: 'error'` exactly as today, so Story 5.11's classifier sees the fallback's error.
  - Do not call `seedDefaultWorkspace` after a SUCCESSFUL import. `applyImport` already ran `ensureDefaultOrganism`, and the gate would no-op anyway (the store is stamped), but the redundant read is noise.
- **FD6: E2E opts out with a 200 non-manifest body, not an abort.** A 404 or `route.abort()` logs "Failed to load resource" as a console error in Chromium, which breaks the zero-console-error assertions that most fresh-context specs carry. A `200` with `{}` fails the Zod parse → silent fallback. Specs that stamp `gol:schema` (the `seedWorkspace` helpers) are non-fresh and need nothing.

### What exists: read these before writing a line

- `apps/web/lib/gallery/useWorkspaceSeed.ts` (UPDATE). Today it reads `isFreshWorkspace()` → `seedDefaultWorkspace()` → a dev-only dynamic `seedDevFixtures` → `ready`, or `error` with the rejection kept for 5.11. `hasRun` makes StrictMode seed once, and `mounted` is a ref that is re-armed on each setup (the Review 2026-08-05 bug: a closure flag left the page "seeding" forever). **Preserve:** freshness read before any write, the `hasRun`/`mounted` semantics, the empty deps plus the eslint-disable with its comment, the `=== 'development'` comparison, and the dynamic `@gol/test-utils` import (the import-boundary lint rule and prod DCE).
- `apps/web/lib/workspaces/presetManifest.ts` (UPDATE). `PRESET_WORKSPACES_PATH = '/workspaces'` (root-absolute; no `basePath`), `PRESET_MANIFEST_FILE`, `PRESET_ID_PATTERN`, the interfaces, and the head comment that assigns this story the runtime parse.
- `apps/web/public/workspaces/index.json`: `defaultPresetId: "colony-clash"`, one entry. `colony-clash.json` is the envelope (two battles, Four Corners 100×60 and Tug of War 50×30, plus Conway's Classic and three organisms, all described). Never import these into app code (7.1 FD5).
- `packages/persistence/src/workspaceImport.ts`: the pipeline order, `validateImportFile` (pure), `applyImport` (snapshot → clearAll → organisms → battles → workspaceMeta → ensureDefaultOrganism, rollback on throw). `workspaceSerializer.ts:147`: `importWorkspace(text)`.
- `packages/persistence/src/seedDefaultWorkspace.ts`: gated on `isFreshWorkspace()`. `resetWorkspace.ts` is Clear All: `clearAll()` + `ensureDefaultOrganism`. It keeps the `gol:schema` stamp, so a cleared store is never fresh, and that is the whole mechanism behind AC3. `localStorageAccess.ts:361`: freshness = `gol:schema` key absent.
- `packages/domain/src/pristineWorkspace.ts`: explains why AC1's "pristine" holds. A fresh store has zero battles, no organisms and no description, so the FR-8.4 warning would be suppressed anyway. This story never shows the dialog, so it does not call the predicate.
- Page boundaries: `app/(gallery)/page.tsx`, `organisms/page.tsx`, `settings/page.tsx` (FD2 of 5.1 explains why settings seeds). The consumers re-read on the `seedStatus` flip: `BattleGallery.tsx:268` gates its load on `seedStatus === 'ready'`, `OrganismLibrary.tsx:298` and `SettingsPage.tsx:129` have `seedStatus` in their deps. So the imported battles appear once `ready` lands, with no extra wiring. Verify it in the e2e.
- `apps/web/app/(gallery)/page.test.tsx`: the existing Conway-only and dev-fixture tests (`vi.stubEnv` at ~line 113). These must pass unchanged, because the test env is not production.
- `apps/web/lib/appVersion.ts`: `APP_VERSION` for the serializer deps.

### Architecture compliance

- **AR-2/27:** no concrete repository import and no `createRepositories()` outside the page boundary. The hook receives `AppRepositories`.
- **M8 / FR-8.4:** the preset is a whole-workspace replace through the one pipeline. No preset-specific parser, and no merging (FR-9.1).
- **Decision F:** settings are untouched by construction; `applyImport` never references `repos.settings`. Don't add settings reads to the loader.
- **M16:** the preset's workspace description lands in `gol:workspace` through `applyImport`. The gallery header shows it (7.2).
- **M9:** never re-seed a stamped store. The preset must be gated on `isFreshWorkspace()` and nothing looser, such as "organism library empty", which would be the self-heal M9 forbids.
- **Static export (Decision K.5):** a plain `fetch` of a static file; no route, no server.
- Cite IDs exactly: `FR-9.2`, `FR-8.4`, `FR-1.5`, `FR-8.5`, `AR-45`, `AR-2`, `AR-27`, `AR-35`, `AR-3`, `M9`, `M16`, `Decision F`, `Story 7.4`. `npm run spec:check` fails an ID that resolves to nothing.

### Library / framework notes

- `zod` `^4.4.3`, matching `@gol/domain`; no new major. Use Zod 4's API (`z.object`, `.superRefine`, `z.infer`), the same idiom `packages/domain/src/*Schema.ts` uses. Read one of those files for house style before writing.
- `fetch` + `AbortController`: standard in all target browsers and in Node 24 (Vitest).
- No web research needed: no new library surface beyond one already-used package.

### Testing standards

- The `apps/web` coverage gate is none (a deliberate counter-metric). Write tests for behaviour, not the number.
- Use the fakes from `@gol/test-utils` (`createFakeRepositories`); don't hand-roll a repo.
- Fake timers for the timeout test. Assert on the injected `fetch` / `importWorkspace` spies, not on global state.
- E2E runs against the static export (`playwright.config.ts` webServer: `build:standalone` + `serve out`), so NODE_ENV is production there and the preset path is live in every fresh context. That is why Task 4.1's audit is mandatory.
- The local gate is `npm run ci:dev` (Chromium e2e only).

### Project Structure Notes

- New: `apps/web/lib/workspaces/loadDefaultPreset.ts` (+ `.test.ts`), `apps/web/lib/workspaces/presetManifest.test.ts`. They sit beside the contract module; camelCase, no dotted names.
- Updated: `useWorkspaceSeed.ts`, `presetManifest.ts`, `apps/web/package.json`, `package-lock.json`, e2e specs, and possibly `scripts/bundle-baselines.json` (tool-written only).
- No change to `packages/*`: the pipeline, seed and reset already do everything required.

### What NOT to build

- No dialog, toast, banner or "sample loaded" copy (UX notes §1: "the feature IS the absence of friction").
- No Settings preset row (7.5), no URL param (7.6), no new presets (7.7).
- No re-trigger after Clear All, no "load preset" retry, and no persisted "preset loaded" flag. The stamp already is that flag.
- No change to the dev branch or `seedDevFixtures`.

### Previous story intelligence

- **7.3:** the default is `colony-clash`. `CONWAYS_CLASSIC` gained a description (D1), and `isPristineWorkspace` also accepts the pre-D1 description-less shape (D4). The second review re-aimed the legacy-store caveat away from 7.4: this story gates on the stamp, not on pristineness, so it is unaffected. The showcase test (`presetShowcase.test.ts`) already guards the content quality.
- **7.2:** the import writes the workspace description via `workspaceMeta.save`, so the gallery header shows it after a first visit.
- **7.1:** FD5 (never import `public/` JSON into app code), FD7 (7.4 owns the runtime parse and the zod decision), and the review patch noting that the warning is the caller's to supply or skip. This caller skips it by design (the pristine case).
- **5.11:** `useWorkspaceSeed`'s `error` feeds `pickStorageFailure`. Keep only the fallback's error there.

### Git intelligence

Recent main: `4999674` (merge of #100, story 7.3: content + `CONWAYS_CLASSIC` description + pristine D4). There have been no app-code changes to the seed path since 5.11.

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.4]
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-9.2]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md §1]
- [Source: docs/planning-artifacts/architecture.md#M16, M8, M9, Decision F]
- [Source: docs/implementation-artifacts/7-1-preset-workspace-foundations.md FD5, FD7]
- [Source: docs/implementation-artifacts/7-3-showcase-preset-content.md D1, D4]
- [Source: docs/project-context.md: repositories injected; Zod at boundaries; bundle growth gate; ci:dev]

### Open questions for the owner (answered provisionally above)

1. `/battle` and `/battle/new` do not seed, so a first visit that lands directly on a battle URL gets no preset. FR-9.2 says "whichever page they enter", but the epic AC scopes this story to seeding boundaries. Provisional: out of scope, matching today's accepted empty-library window.
2. An unstamped store that still holds data (only reachable by hand-editing, or after a partial 5.11 recovery) reads as fresh, and the preset's `clearAll()` would replace that data. Provisional: accept, because the stamp is the one freshness truth (M9) and the same store would already be re-seeded today.
3. Timeout 5 s (FD3). Provisional; tune in review if the smoke test suggests otherwise.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), via bmad-dev-story under implement-next-story.

### Debug Log References

- `npm install zod@^4.4.3 -w apps/web` resolved the spec to `^4.6.5` and bumped the lockfile's zod to 4.6.5. Reverted, pinned `"zod": "^4.4.3"` in `apps/web/package.json`, then ran `npm install`: the lockfile gains only the dependency line, and zod stays at 4.4.3 (no other version bump, per Task 1.1).
- First Chromium e2e run after the hook change had 26 failures, all fresh-context specs asserting the empty or Conway-only baseline (appShell, createBattle's empty-state CTA, home, organisms, settings). The Task 4.1 audit found these, plus `storageCorruption.spec.ts`, which passed but raced its raw-key overwrite against the preset import started by its first fresh `goto`.
- `home.spec.ts` first used `import.meta.url`, which failed because Playwright loads the specs as CommonJS. Switched to `__dirname`.

### Completion Notes List

- **Task 1:** `PresetWorkspaceManifestSchema` (plus `PresetWorkspaceEntrySchema`) in `presetManifest.ts`. It checks the kebab id, a non-blank name/description, `file === ${id}.json`, that `file` is not the manifest itself, a non-empty list, unique ids, and that `defaultPresetId` names a listed entry. The last three use `superRefine`. The interfaces are kept (7.5 and 7.6 import them). A two-way compile-time assignability check pins them to `z.infer`. The head comment is updated. `presetWorkspaces.test.ts` is left as is (optional step not taken; its lockstep gate is unchanged). Added 18 tests in `presetManifest.test.ts`.
- **Task 2:** `loadDefaultPreset.ts` exports `loadDefaultPreset`, the reusable `fetchPresetManifest` and `fetchPresetText`, and `PRESET_FETCH_TIMEOUT_MS = 5000`. One `AbortController` covers both fetches and both body reads, and the timer is cleared in `finally`. The import runs outside the timeout. The serializer is built inside the module (FD4). Added 8 tests: the real shipped files served off disk, manifest 404 and 500, non-JSON, schema failure, envelope 404, a hung fetch with fake timers, and an ImportError. Every failure case asserts the store is still fresh and unwritten.
- **Task 3:** `useWorkspaceSeed` now has a `fresh && NODE_ENV === 'production'` branch. It dynamically imports the loader, and any rejection falls back to `seedDefaultWorkspace`. The dev branch, the `hasRun`/`mounted` refs, the empty deps and the reading of freshness before any write are all unchanged. A fallback rejection still reaches `status: 'error'`. The doc comment covers the three branches, the dynamic import and the silent failure. New `useWorkspaceSeed.test.tsx` covers cases (a)–(g) plus the fallback-error case. Cases (a), (c), (e) and (g) were confirmed failing against the pre-change hook. The existing `page.test.tsx` passes unchanged.
- **Task 4:** a file-local `forcePresetFallback(page)` helper (a 200 with a `{}` body, per FD6) added as a file-level `beforeEach` in `appShell`, `organisms`, `settings` and `storageCorruption`, and per-test in `createBattle`'s empty-state CTA test. `home.spec.ts` is restructured:
  - a first-visit describe: `/` shows the preset battles by name (read from the envelope off disk), the workspace description, no dialog and zero console errors; `/organisms` shows every preset organism with no dialog and zero errors; Clear All → `/` + reload shows the empty state and Conway alone, with zero manifest requests (AC3).
  - a fallback describe holding the original empty-state, axe and seed proofs.
  Other specs either stamp `gol:schema` or never visit a seeding page without seeding (audited), so they need nothing. `npm run e2e:chromium`: 317 passed.
- **Task 5:** `npm run ci:dev` passed (exit 0): typecheck, lint, format:check, spec:check, boundary:check, coverage, build, bundle, bench, bench:check, and e2e on Chromium (317 passed). Bundle growth: `/` +0.1 KB, `/organisms` +0.2 KB, `/settings` +0.3 KB gzipped. All are within the 8 KB allowance, so FD4's dynamic import held and the baseline was not refreshed.
- **Manual smoke (5.2)** on the static export (`out/` served by `npx serve`), run as a headless Chromium script rather than interactive DevTools:
  - A fresh context at `/` showed the preset gallery ("Four Corners", "Tug of War") with 0 console errors. Opening Four Corners → Run → Play advanced it to cycle 15 with all four organisms live.
  - A fresh context with `index.json` blocked showed "No Battles Yet", with `gol:organisms` = `[conways-classic]`.
  - Screenshots are in the session scratchpad (`first-visit-gallery.png`, `first-visit-battle-running.png`, `blocked-manifest-empty-state.png`) and are not committed.
- Open questions 1–3 were left at their provisional answers: `/battle` does not seed, the unstamped-with-data store is accepted, and the timeout stays at 5 s (the smoke loaded well inside it).

### File List

- apps/web/package.json (modified: `zod` dependency)
- package-lock.json (modified)
- apps/web/lib/workspaces/presetManifest.ts (modified)
- apps/web/lib/workspaces/presetManifest.test.ts (new)
- apps/web/lib/workspaces/loadDefaultPreset.ts (new)
- apps/web/lib/workspaces/loadDefaultPreset.test.ts (new)
- apps/web/lib/gallery/useWorkspaceSeed.ts (modified)
- apps/web/lib/gallery/useWorkspaceSeed.test.tsx (new)
- apps/web/e2e/home.spec.ts (modified)
- apps/web/e2e/appShell.spec.ts (modified)
- apps/web/e2e/createBattle.spec.ts (modified)
- apps/web/e2e/organisms.spec.ts (modified)
- apps/web/e2e/settings.spec.ts (modified)
- apps/web/e2e/storageCorruption.spec.ts (modified)
- docs/implementation-artifacts/7-4-first-visit-default-preset-auto-load.md (this story)
- docs/implementation-artifacts/sprint-status.yaml (modified)

### Change Log

- 2026-09-29: Implemented Story 7.4. The manifest has a Zod parse boundary, and an injectable `loadDefaultPreset` loader has a 5 s fetch timeout. `useWorkspaceSeed` loads the default preset on a fresh production first visit and silently falls back to FR-1.5. The e2e suite opts out of the preset where the specs need an empty baseline, and there is a new first-visit/Clear All e2e. Status → review.

Dev Model: opus   # first runtime preset loader: sets the manifest-parse + fetch/timeout + silent-fallback pattern that 7.5 and 7.6 reuse
Proposed lane gate: none
