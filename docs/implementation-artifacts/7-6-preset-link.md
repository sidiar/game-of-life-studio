---
baseline_commit: 6d3380ccb647fe27b3051c24d9eadb04af8f6995
---

# Story 7.6: Preset Link

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor following a shared link,
I want a URL that loads a specific preset on arrival,
so that someone can hand me a ready-made experience in one click.

## Acceptance Criteria

1. **Given** a static-export-compatible URL form addressing a preset by manifest id (decided here: **`/?preset=<id>`**, a query param on the existing `/` route, per FD1; no server routing), **When** visited, **Then** the preset is fetched and imported through the FR-8.4 pipeline, behind its destructive warning. The warning is suppressed for a pristine workspace, so a first-time visitor lands directly in the loaded workspace (FR-9.4).
2. **And** an unknown or invalid preset id degrades gracefully to the normal app with a clear, dismissible message, never a broken or blank page (FR-9.4).
3. **And** the loaded-or-declined outcome leaves the URL without the `preset` param, so a reload does not re-prompt (decided here: FD6).

## Tasks / Subtasks

- [x] **Task 1: The link param helpers** (AC: 1, 3), per FD1 and FD6
  - [x] 1.1 New `apps/web/lib/workspaces/presetLink.ts`: `export const PRESET_LINK_PARAM = 'preset';` and `stripPresetLinkParam(): void`, which builds `new URL(window.location.href)`, deletes `PRESET_LINK_PARAM` from its `searchParams`, and calls `window.history.replaceState(null, '', url.pathname + url.search + url.hash)`. Every other param and the hash survive. Pass `null` as the state: Next 16's patched `replaceState` copies its own router tree into the entry (`node_modules/next/dist/client/components/app-router.js`, `copyNextJsInternalHistoryState`), and its restore reducer reuses that tree, so the page is NOT remounted and `useSearchParams()` updates.
  - [x] 1.2 Head comment: WHY a query param (FD1), and WHY `replaceState` rather than `router.replace` (a router navigation would be a new history-driven render of the page; the native call is the documented integration and keeps the page mounted, so the notice survives).
  - [x] 1.3 `presetLink.test.ts`: `?preset=x` alone becomes `/`; `?preset=x&foo=1#h` becomes `/?foo=1#h`; `replaceState` is called once, with `null` state (spy on `window.history.replaceState`; set the start URL with `window.history.replaceState(null, '', '/?preset=x')` in the test).
- [x] **Task 2: Link copy** (AC: 1, 2), per FD7
  - [x] 2.1 Add to `apps/web/lib/workspaces/presetMessages.ts`:
    - `PRESET_LINK_WARNING_BODY`, from the mockup's arrival modal (`preset-workspace-library.html:453-466`) as one plain string: "This link opens a preset workspace. Loading it replaces your entire workspace — all current battles and organisms will be lost. You can export your current workspace first to keep a backup. Cancelling takes you to your own workspace, untouched."
    - `presetLinkUnknownMessage(id: string, workspaceUntouched: boolean)`: "This preset link doesn't exist (anymore). The link pointed to a preset called “<id>”, which isn't in this version of the studio." Append " Your workspace is untouched." only when `workspaceUntouched` is true (FD5: a first visitor gets the default preset instead, so "untouched" would be false). Pass the id through `displayPresetId(raw)`: at most 40 characters, then `…`. React escapes the text, so this is a layout guard, not a security one.
    - `PRESET_LINK_FETCH_FAILURE_MESSAGE`: "The preset this link points to could not be downloaded. Reload the page to try again. Your workspace was not changed."
  - [x] 2.2 Reuse, never fork: `presetWarningTitle(name)`, `PRESET_CONFIRM_LABEL`, `PRESET_EXPORT_FAILED_TEXT`, `presetLoadSuccessMessage(name, summary)`, and `importFailureMessage(error)` for pipeline failures.
  - [x] 2.3 Unit tests: truncation at 40, the "untouched" suffix on and off, typographic quotes.
- [x] **Task 3: The lazy flow module** (AC: 1, 2), per FD3 and FD5
  - [x] 3.1 New `apps/web/lib/workspaces/presetLinkFlow.ts`. It may statically import `@gol/persistence` (`createWorkspaceSerializer`, `validateImportFile`), `presetFetch`, `presetManifest`, `loadDefaultPreset`, `exportWorkspaceToFile`, `importFailureMessage` and `APP_VERSION`, because only a dynamic `import()` ever loads it (FD3). Export:
    ```ts
    export type PresetLinkPlan =
      | { kind: 'unknown'; defaultLoaded: boolean }
      | { kind: 'download-failed' }
      | { kind: 'invalid-file'; message: string }
      | {
          kind: 'ready';
          entry: PresetWorkspaceEntry;
          pristine: boolean;
          load(): Promise<{ ok: true; summary: ImportSummary } | { ok: false; message: string }>;
          exportCurrent(): Promise<void>;
        };

    export async function preparePresetLink(deps: {
      presetId: string;
      fetch: typeof fetch;
      repos: AppRepositories;
      firstVisit: boolean;
      timeoutMs?: number;
    }): Promise<PresetLinkPlan>;
    ```
  - [x] 3.2 Steps, in this order (FD4, the same order as Story 7.5):
    1. If `!PRESET_ID_PATTERN.test(presetId)`, the result is `unknown`, with no manifest fetch.
    2. `withPresetTimeout((signal) => fetchPresetManifest(fetch, signal), timeoutMs)`. On any rejection, return `download-failed`.
    3. Find the entry by `id`. If there is none, the result is `unknown`.
    4. **`unknown` + `firstVisit`:** `await loadDefaultPreset({ fetch, repos, timeoutMs })`. `defaultLoaded` is `true` if it resolves and `false` if it rejects. Swallow the rejection silently, so the Conway-only store the seed wrote stays (the FR-1.5 fallback, same as 7.4 FD5). `unknown` without `firstVisit` never writes: `defaultLoaded: false`.
    5. `withPresetTimeout((signal) => fetchPresetText(fetch, entry, signal), timeoutMs)`. On any rejection, return `download-failed`.
    6. `validateImportFile(text)`. On a throw, return `invalid-file` with `importFailureMessage(error)`. Only deploy skew can reach this, because the lockstep gate validates every shipped preset.
    7. Pristine read, identical to `LoadPresetRow`: `Promise.all([repos.battles.list(), repos.organisms.list(), repos.workspaceMeta.load()])` → `isPristineWorkspace(...)`. A rejected read counts as NOT pristine.
    8. Build the serializer once: `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() })`. Return `ready`. `load()` wraps `serializer.importWorkspace(text)` and maps a rejection to `{ ok: false, message: importFailureMessage(error) }`, so it never rejects. `exportCurrent()` is `exportWorkspaceToFile(serializer)`, which rejects on failure.
  - [x] 3.3 Nothing in this module writes before step 4 or `load()`. Say so in the head comment. This is what makes "Your workspace was not changed" true in the download-failure copy.
  - [x] 3.4 `presetLinkFlow.test.ts`. Use the `loadDefaultPreset.test.ts` idiom: the REAL `public/workspaces/` files served off disk through an injected `fakeFetch` (unrouted URLs return 404), and `createFakeRepositories()` from `@gol/test-utils`. Cases:
    - (a) A known id on a pristine store (Conway only) gives `ready` with `pristine: true`, and `load()` resolves `ok` with the store holding the preset's battles.
    - (b) A known id on a store with battles gives `pristine: false`, and nothing is written until `load()`.
    - (c) A syntactically invalid id (`'../x'`, `'Bad'`, `''`) gives `unknown`, with ZERO fetches.
    - (d) A well-formed unknown id gives `unknown`. With `firstVisit: false`: `defaultLoaded: false`, no envelope fetch, and the store is unchanged. With `firstVisit: true`: `defaultLoaded: true`, and the store holds the default preset.
    - (e) `unknown` + `firstVisit` with the default envelope 404ing gives `defaultLoaded: false`, the promise resolves (it does not reject), and the store is unchanged.
    - (f) A manifest 500, a manifest `{}`, and an envelope 404 each give `download-failed`, and the store is unchanged.
    - (g) A hung envelope fetch with fake timers gives `download-failed` after `PRESET_FETCH_TIMEOUT_MS`.
    - (h) An envelope body `{` gives `invalid-file` with the exact `importFailureMessage` copy.
    - (i) A rejected pristine read gives `pristine: false`.
    - (j) `load()` with a failing `importWorkspace` resolves `{ ok: false, message }` and does not reject. To force it, make a fake repository's `replaceAll` reject.
- [x] **Task 4: Defer the first-visit preset when a link is present** (AC: 1), per FD5
  - [x] 4.1 `useWorkspaceSeed(repos, options?: { deferFirstVisitPreset?: boolean })`. In the production branch only, after `holdsNoUserData` is true: if `options?.deferFirstVisitPreset`, call `seedDefaultWorkspace(repos)` (Conway only, stamped) INSTEAD of the preset import, and record that the deferral happened. Read the option inside the effect; the effect keeps its empty deps and `hasRun` guard.
  - [x] 4.2 The return shape becomes `{ status, error, firstVisitPresetDeferred: boolean }`. It is `true` only when the deferral branch actually ran, and it is set in the same `setState` that reaches `'ready'`. It is `false` in every other case: not fresh, dev, test, holds user data, or no option.
  - [x] 4.3 The development branch (AR-45 fixtures) and every non-production path are unchanged. The other three seeding boundaries (`organisms/page.tsx`, `settings/page.tsx`) pass no option and destructure as today.
  - [x] 4.4 Extend the doc comment with a Story 7.6 paragraph: why deferring beats "load the default, then warn about replacing it" (FD5).
  - [x] 4.5 `useWorkspaceSeed.test.tsx`, new cases beside 7.4's:
    - Fresh + production + defer: no fetch at all, the store is Conway only and stamped, `ready`, `firstVisitPresetDeferred: true`.
    - Fresh + production + no option: unchanged, and the flag is `false`.
    - Not fresh + defer: the flag is `false`.
    - Fresh + production + defer, over an unstamped store holding battles (the D1 guard): the plain seed runs and the flag is `false`, because the store is not the first-visit case.
    - Fresh + development + defer: the fixtures still seed and the flag is `false`.
    - StrictMode + defer: one seed.
- [x] **Task 5: `<PresetLinkArrival>`** (AC: 1, 2, 3), per FD2, FD3, FD4, FD6, FD8
  - [x] 5.1 New `apps/web/components/gallery/PresetLinkArrival.tsx` (default export), STATICALLY imported by the page. It is small: it imports only `presetMessages`, `presetLink`, React, `useInertBackground`, and a `next/dynamic` `ImportWarningDialog` (`ssr: false`, AR-35: the same `() => import('@/components/settings/ImportWarningDialog')` form as `LoadPresetRow`). It must NOT statically import `@gol/persistence` values, `presetFetch`, `presetManifest` (zod schema), `loadDefaultPreset` or `importFailureMessage` (FD3). Type-only imports are fine.
  - [x] 5.2 Props:
    ```ts
    export interface PresetLinkArrivalProps {
      presetId: string;
      seedStatus: WorkspaceSeedStatus;
      /** The seed deferred the first-visit preset for this link (FD5). */
      firstVisit: boolean;
      /** The page boundary's repositories (AR-2/27); the lazy flow builds the serializer (FD3). */
      repos: AppRepositories;
      /** true while the gallery must not read the store (fetch, pristine import, post-confirm import). */
      onBusyChange(busy: boolean): void;
      /** Exactly once. `keepLink` is true only for download-failed (FD6). */
      onSettled(result: { notice: RowOutcome | null; keepLink: boolean }): void;
    }
    ```
    `RowOutcome` is `import type` from `@/components/settings/SettingsCard`. Crossing into `settings/` for a type only is acceptable. If review objects, lift the interface to `lib/`; do not duplicate it.
  - [x] 5.3 Start once, when `seedStatus === 'ready'`. Use a `startedRef` that survives StrictMode setup → cleanup → setup, and a `mountedRef` re-armed on every setup (the `useWorkspaceSeed` / `LoadPresetRow` pattern). While `seedStatus` is `'seeding'`, do nothing. While it is `'error'`, do nothing and never settle: the storage-failure notice owns the page, and the link stays in the URL for after the user resolves it.
  - [x] 5.4 Flow:
    1. `import('@/lib/workspaces/presetLinkFlow').then(({ preparePresetLink }) => preparePresetLink({ presetId, fetch: browserFetch, repos, firstVisit }))`. `browserFetch` is the module-level stable arrow from `LoadPresetRow` (copy it with its comment; do not export it from the row). A REJECTION of the `import()` itself (a chunk load failure) is treated as `download-failed`. It must never leave the gallery held.
    2. If `!mountedRef.current` after it settles, stop. Do not call `load()` and do not settle. Nothing was written except, on `unknown` + `firstVisit`, the default preset, which is the page the user would have got anyway.
    3. `unknown`: settle `{ notice: { role: 'alert', text: presetLinkUnknownMessage(presetId, !plan.defaultLoaded) }, keepLink: false }`. With `firstVisit` and `defaultLoaded: false`, the store is Conway only, and "untouched" is accurate for a visitor who had nothing.
    4. `download-failed`: settle `{ notice: { role: 'alert', text: PRESET_LINK_FETCH_FAILURE_MESSAGE }, keepLink: true }`.
    5. `invalid-file`: settle `{ notice: { role: 'alert', text: plan.message }, keepLink: false }`.
    6. `ready` + `pristine`: `await plan.load()`. On `ok`, settle `{ notice: null, keepLink: false }`: silent, the UX §3 "load silently, land in the gallery". On failure, the alert is `message`.
    7. `ready` + not pristine: `onBusyChange(false)`, so the gallery renders the user's own workspace behind the dialog. Then mount and open `ImportWarningDialog` with `title={presetWarningTitle(entry.name)}`, `body={PRESET_LINK_WARNING_BODY}`, `confirmLabel={PRESET_CONFIRM_LABEL}` and `exportFailedText={PRESET_EXPORT_FAILED_TEXT}`.
  - [x] 5.5 Dialog machinery: copy `LoadPresetRow`'s exactly. That means `choiceRef` (the first choice wins), Export First through `plan.exportCurrent()` guarded by `exportInFlightRef` (confirm is a no-op while it runs, per 5.9 Review Decision 1), `exportState` `'idle' | 'exported' | 'failed'` reset to `'idle'` before each export, `useInertBackground(dialogMounted)`, and the load running ONLY from `onExited` (`handleDialogExited`). Nothing is ever `disabled`.
    - Cancel → exited: settle `{ notice: null, keepLink: false }`. The user is in their own untouched workspace on `/` (UX §3).
    - Load Preset → exited: `onBusyChange(true)`, then `await plan.load()`. `ok` settles `{ notice: { role: 'status', text: presetLoadSuccessMessage(entry.name, summary) }, keepLink: false }`. A failure settles with the alert `message`. The page drops the hold on settle, and the gallery re-reads (FD2).
  - [x] 5.6 Focus after the dialog exits: there is no trigger button to return to. Move focus to the gallery's `<h1>` (`#battle-gallery-heading`, already `tabIndex={-1}` for the delete flow), only if focus is "loose" (`null`, `<body>`, or inside `[aria-labelledby="import-warning-dialog-title"]`). Use the `focusTick` / `focusOwedRef` effect shape from `LoadPresetRow`, and focus BEFORE calling `onSettled`, because settling strips the URL and unmounts this component.
  - [x] 5.7 Renders only the dialog, or `null`. The notice is the page's (FD6), because this component unmounts when the param is stripped.
- [x] **Task 6: `<PresetLinkNotice>`** (AC: 2), per FD7
  - [x] 6.1 New `apps/web/components/gallery/PresetLinkNotice.tsx`: `{ notice: RowOutcome; onDismiss(): void }`. Mockup `.arrival-banner` (`preset-workspace-library.html:157-166`): flex row, `--gol-bg-secondary` background, 1px `--gol-border`, a 3px left border in `--gol-danger` (the mockup's `--warning`; decorative, not a control boundary), padding `14px 18px`, `margin-bottom: 24px`, `max-width: 900px`. The text is 13px `--gol-text-secondary` in a `<p>` carrying `role={notice.role}`. The dismiss control is a native `<button type="button" aria-label="Dismiss message">` showing `✕` in `--gol-text-secondary` (not tertiary, because the icon must meet SC 1.4.11 3:1 on `--gol-bg-secondary`; verify the pair in `themeTokens.test.ts` terms), with a `:focus-visible` outline in `--gol-accent`. No `transition: all`.
  - [x] 6.2 Dismiss removes the notice. Focus goes to `#battle-gallery-heading`, because the button that held focus is gone.
  - [x] 6.3 `PresetLinkNotice.test.tsx`: the role is applied, the dismiss button calls `onDismiss`, and axe reports no violations.
- [x] **Task 7: The gallery page boundary** (AC: all), per FD1 and FD2
  - [x] 7.1 `app/(gallery)/page.tsx`: split it the way `app/(battle)/battle/page.tsx` is split. `HomePage` returns `<Suspense fallback={null}><GalleryRoute /></Suspense>`, and `GalleryRoute` reads `useSearchParams()`. Carry the battle route's `missing-suspense-with-csr-bailout` WHY comment, adapted: the export build fails without the boundary, and `next dev` never shows it. The fallback is `null` because the whole page is client-seeded (its prerender was only ever the seeding state) and AppShell's nav and wordmark stay prerendered by the layout. Note in the Dev Agent Record that `index.html` now prerenders an empty `<main>`.
  - [x] 7.2 `GalleryRoute` owns everything `HomePage` owns today: `createRepositories()` in `useMemo` (AR-27) and the seed. It adds:
    - `const presetId = params.get(PRESET_LINK_PARAM);` (`null` means no link).
    - `useWorkspaceSeed(repositories, { deferFirstVisitPreset: presetId !== null })`.
    - `const [arrivalBusy, setArrivalBusy] = useState(presetId !== null);` and `const [notice, setNotice] = useState<RowOutcome | null>(null);`.
    - The gallery's status: `const galleryStatus = status === 'ready' && arrivalBusy ? 'seeding' : status;`. Add a WHY comment: `BattleGallery` reads nothing until `'ready'`, and its load effect re-runs on the `'seeding'` → `'ready'` edge while keeping the previous summaries on screen (its `loadReducer` `'start'` case). That edge is exactly the post-import refresh, with no remount and no new prop (FD2).
    - `{presetId !== null && <PresetLinkArrival presetId={presetId} seedStatus={status} firstVisit={firstVisitPresetDeferred} repos={repositories} onBusyChange={setArrivalBusy} onSettled={handleSettled} />}`.
    - `handleSettled` (`useCallback`): `setNotice(result.notice)`, `setArrivalBusy(false)`, then `if (!result.keepLink) stripPresetLinkParam()`.
    - Render order inside the fragment: `{notice && <PresetLinkNotice notice={notice} onDismiss={() => setNotice(null)} />}`, then `<BattleGallery … seedStatus={galleryStatus} />`, then the arrival.
  - [x] 7.3 `BattleGallery.tsx` is NOT modified.
  - [x] 7.4 `app/(gallery)/page.test.tsx`: add `vi.mock('next/navigation', () => ({ useSearchParams: () => currentParams }))` with a mutable `let currentParams = new URLSearchParams()` reset in `afterEach`. Outside the App Router, `useSearchParams()` returns `null` in jsdom. Every existing case must pass unchanged with empty params. Add:
    - With `?preset=nope` on a stamped non-pristine store: the alert notice appears, the gallery lists the stored battles, and Dismiss removes the notice and focuses the `<h1>`.
    - With no param: no `PresetLinkArrival` side effects, and no fetch (stub `fetch` and assert it was not called).
    The full flow is covered in Task 8 and e2e, not here.
- [x] **Task 8: `<PresetLinkArrival>` unit tests** (AC: all)
  - [x] 8.1 `components/gallery/PresetLinkArrival.test.tsx`. Use `vi.stubGlobal('fetch', …)` serving the real files off disk (the `LoadPresetRow.test.tsx` idiom, `import.meta.url` path plus a 404 for unrouted URLs) and `createFakeRepositories()`. The flow module is REAL (its dynamic import resolves under Vitest). Cases:
    - (a) `seedStatus: 'seeding'` → no fetch. Re-render with `'ready'` → the flow starts. `onBusyChange` is never called with `false` before the flow decides.
    - (b) Pristine + known id → no dialog, the store holds the preset, and `onSettled` is called once with `{ notice: null, keepLink: false }`.
    - (c) Non-pristine → `onBusyChange(false)` → a dialog named `Load “Colony Clash”?` whose body contains "This link opens a preset workspace" → Cancel → after exit, `onSettled({ notice: null, keepLink: false })`, the store is unchanged (compare the lists), and focus is on `#battle-gallery-heading` (render a stub `<h1 id="battle-gallery-heading" tabIndex={-1}>` beside it).
    - (d) Non-pristine → Load Preset → `onBusyChange(true)` after exit → `onSettled` with the status text naming the preset. The live-region ordering: at the moment `onSettled` fires, the dialog is gone.
    - (e) Export First → exported state shown, the dialog stays open, confirm while the export is in flight is a no-op, and confirm works once it settles.
    - (f) Unknown id, `firstVisit: false` → alert with "Your workspace is untouched.", `keepLink: false`, and the store is unchanged.
    - (g) Unknown id, `firstVisit: true` → the store holds the default preset, and the alert has no "untouched" sentence.
    - (h) Envelope 404 → `PRESET_LINK_FETCH_FAILURE_MESSAGE`, `keepLink: true`.
    - (i) `seedStatus: 'error'` → no fetch and no `onSettled`.
    - (j) StrictMode → exactly one manifest fetch.
    - (k) Unmount while the envelope fetch is pending → no import, and no `onSettled` after unmount.
- [x] **Task 9: E2E** (AC: all)
  - [x] 9.1 New `apps/web/e2e/presetLink.spec.ts`. Copy the file-local `seedWorkspace`, `trackErrors` and `storage` helpers from `loadPreset.spec.ts` (the house convention), and read the preset from `public/workspaces/` via `node:fs` and `__dirname`.
    - ⚠️ `page.addInitScript` re-runs on EVERY navigation, including `page.reload()`, so a reload would re-seed and mask a replace. For the reload assertions, make the init script seed only once per context: guard it with `if (sessionStorage.getItem('e2e-seeded') === null) { …; sessionStorage.setItem('e2e-seeded', '1'); }`. 7.5 hit this, per its debug log.
  - [x] 9.2 A second preset for the first-visit test, test-side only. Route `**/workspaces/index.json` to the shipped manifest plus an entry `{ id: 'link-test', name: 'Link Test', description: <d>, file: 'link-test.json' }`. Route `**/workspaces/link-test.json` to the shipped `colony-clash.json` envelope with its `description` set to `<d>` and every battle `name` suffixed ` (link)`. That is valid envelope JSON; the pipeline accepts it. This is test data, never a shipped preset, and it is the only way to tell "the link's preset" from "the default" while the manifest ships one entry.
  - [x] 9.3 Tests:
    - (a) Fresh context → `/?preset=link-test` → no dialog ever, the gallery lists the ` (link)` battle names, `colony-clash.json` is NEVER requested (record `page.on('request')`), the URL has no `preset`, `reload()` → still no dialog and the same battles, zero console errors.
    - (b) Non-pristine (`seedWorkspace`) → `/?preset=colony-clash` → a dialog named `Load “Colony Clash”?` → Cancel → the seeded battles are listed, `gol:battles`/`gol:organisms` are byte-identical, the URL has no `preset`, and `reload()` shows no dialog.
    - (c) Non-pristine → Load Preset → the preset's battles are listed, the status notice names the preset, `gol:settings` is byte-identical (Decision F), and the URL is clean.
    - (d) Non-pristine → `/?preset=spiral-wars` → an alert containing `“spiral-wars”` and "untouched", the store is byte-identical, Dismiss removes it, and the URL is clean.
    - (e) Fresh context → `/?preset=spiral-wars` → the default preset's battles are listed (the normal first-visit app), plus the alert without "untouched".
    - (f) axe: no violations with the dialog open, and none with the notice shown.
  - [x] 9.4 The existing specs never use `?preset` and must pass unedited. `home.spec.ts`'s first-visit tests prove the no-link path is untouched.
  - [x] 9.5 Run `npm run e2e:chromium` locally, never the four-browser `npm run ci`.
- [x] **Task 10: Gates** (AC: all)
  - [x] 10.1 `npm run ci:dev` green. `/` gains `PresetLinkArrival`, `PresetLinkNotice`, `presetLink`, `presetMessages` and a dynamic dialog chunk. The flow module is a separate lazy chunk. If `bundle:check` reports growth past the allowance, first confirm that nothing heavy leaked statically (grep the `/` first-load chunks for `createWorkspaceSerializer` / `PresetWorkspaceManifestSchema`), then refresh the baseline (`npm run build:standalone && npm run bundle:baseline`) and state the delta in the Dev Agent Record.
  - [x] 10.2 Manual smoke on the static export (`npm run build:standalone && npx serve out`, headless Chromium is fine): a fresh profile at `/?preset=colony-clash` shows no dialog and a clean URL. Then rename a battle → `/?preset=colony-clash` → dialog → Cancel → rename intact. Then `/?preset=nope` → notice → Dismiss. Screenshots go to the scratchpad, not the repo. Record the results in the Dev Agent Record, or say plainly that the smoke did not run.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: The URL is `/?preset=<id>`, a query param on the existing Gallery route.** Decision K.5 makes query params the house idiom for ids ("entity ids ride as query params"), and Decision K.3 rejected a hash for the battle route because it "never reaches the Next router". `/` is the landing page the UX names ("land in the gallery", §3). No new route, so `routes.test.ts`'s five-file set is unchanged. The cost is the `useSearchParams()` Suspense boundary (Task 7.1), which is copied from `app/(battle)/battle/page.tsx`. The id needs no encoding: `PRESET_ID_PATTERN` slugs are URL-safe (7.1 FD3). Open question 1 records the hash alternative.
- **FD2: The gallery is held, not remounted.** The page passes `BattleGallery` a composite status: `'seeding'` while the arrival is busy. `BattleGallery`'s load effect already depends on `seedStatus`, returns early while it is not `'ready'`, and on the edge back to `'ready'` re-reads with the old tiles kept on screen. So the post-import refresh needs no new prop, no `key` bump (which would drop the focused `<h1>`), and no edit to a 433-line component. The hold covers exactly three windows: fetch through the pristine decision, the pristine-path import, and the post-confirm import. It is released while the dialog is up, so Cancel lands on a gallery that is already rendered.
- **FD3: Heavy code stays out of `/`'s first load (AR-3, 7.4 FD4).** Only `presetLinkFlow.ts`, reached by dynamic `import()`, touches the serializer, the manifest zod schema, `validateImportFile`, `loadDefaultPreset`, `exportWorkspaceToFile` or `importFailureMessage`. `<PresetLinkArrival>` is a small static import that renders only a `next/dynamic` dialog. The flow builds the serializer from the page's `repos`, the same way `loadDefaultPreset` does, because building it in `GalleryRoute` would put the pipeline in every Gallery load. It never calls `createRepositories()` (AR-2/27). A failed flow-chunk load is treated as `download-failed`, so the gallery hold is always released. This is the one failure a `next/dynamic` component could not have reported.
- **FD4: Fetch → validate → pristine check → warn → import.** This is 7.5's FD4 order (5.9 FD1), so a network failure never shows a dialog that then fails. The pristine check is the shared `isPristineWorkspace` three-way read, and a rejected read means warn.
- **FD5: A first visit with a link loads the LINK's preset, never the default first.** Without coordination, `useWorkspaceSeed` would import the default preset on a fresh store, and the arrival would then find a non-pristine store and show a warning dialog on the visitor's very first page. That breaks AC1's "lands directly in the loaded workspace", and it wastes a ~400 KB fetch. So the page passes `deferFirstVisitPreset`, the seed writes Conway only (stamped and pristine), and the arrival's ordinary pristine path loads the linked preset silently. Deferral is reported back (`firstVisitPresetDeferred`) so that an unknown id or download failure on a first visit can still honour FR-9.2 (below). The flag is "the seed deferred for this link", not "pristine": a Clear-All'd store is pristine too, and FR-9.2 says Clear All must not re-trigger the preset.
  - On a first visit with an unknown id, the flow loads the default preset (`loadDefaultPreset`, unchanged) and the notice says the link was bad. That is "the normal app" (UX §3) for someone who has never been here.
  - On a first visit with a download failure, the store stays Conway only, which is 7.4's own fallback state. The link is kept so a reload retries. On that reload the store is stamped and pristine, so the retry loads silently.
- **FD6: When the URL is cleaned, and who owns the notice.** Every settled outcome strips `preset` except `download-failed`: a transient failure should be retryable by reload, and the copy says so. Loaded, declined, unknown and invalid-file outcomes are all stripped, so a reload never re-prompts (AC3). A seed `'error'` never starts the flow and never strips. The strip is `window.history.replaceState` (Task 1), done by the page in `handleSettled` after the notice is set. Stripping makes `useSearchParams()` return no param, which unmounts `<PresetLinkArrival>`. That is why the notice lives in the page's state and not in the arrival.
- **FD7: Feedback.** A pristine load is silent: the populated gallery and its workspace description are the feedback (UX §1/§3). A confirmed load gets a `status` notice naming the preset. That is the only feedback a screen-reader user gets for a replace they chose, and it is the same success line as 7.5. Unknown, download and pipeline failures get an `alert`. It is one dismissible banner in the mockup's `.arrival-banner` shape, above the gallery section. It is not the Settings row-outcome slot, because there is no row here; the UX's "existing error-feedback patterns" is met by the `RowOutcome` shape and roles. The live-region rule holds by construction: the only outcome that follows a dialog is published after `onExited` and after an `await`, the same as 7.5.
- **FD8: One dialog, the 7.5 way.** `ImportWarningDialog` takes copy props (7.5 FD2). The link has its own body (the mockup's arrival modal adds "This link opens…" and "Cancelling takes you to your own workspace, untouched.") and shares 7.5's title builder, confirm label and export-failed text. Do not add a prop to the dialog.

### What exists: read these before writing a line

- `apps/web/components/settings/LoadPresetRow.tsx`: THE template for the dialog half (`pendingRef`/`startedRef`, `mountedRef` re-arm, `choiceRef`, `exportInFlightRef`, `focusTick`/`focusOwedRef`, `handleDialogExited`, and `browserFetch`). Copy it; do not import from it, and do not lift a shared hook. This is the third copy of the flow (Import, Load Preset, link). The 7.5 story deferred the lift decision to here, and it is decided NO: the arrival has no trigger button, no row slot, and a page-level hold, so a shared hook would need three modes. Record that in the Dev Agent Record.
- `apps/web/components/settings/ImportWarningDialog.tsx`: unchanged. Its ids (`import-warning-dialog-title`) are what the "loose focus" check matches.
- `apps/web/lib/gallery/useWorkspaceSeed.ts` (UPDATE, Task 4): three branches decided by one freshness read taken before any write. **Preserve** the read-before-write ordering, the `hasRun`/`mounted` split, the D1 `holdsNoUserData` guard, the silent preset fallback, and the `=== 'production'` / `=== 'development'` comparisons. The deferral is a fourth outcome INSIDE the production + empty branch, nothing else.
- `apps/web/app/(gallery)/page.tsx` (UPDATE, Task 7) and `app/(battle)/battle/page.tsx` (the Suspense/`useSearchParams` pattern to copy).
- `apps/web/components/gallery/BattleGallery.tsx`: READ only. Its effect deps `[…, seedStatus, reloadToken]` and `loadReducer`'s `'start'` case are what FD2 relies on. Confirm both before relying on them.
- `apps/web/lib/workspaces/presetFetch.ts`, `presetManifest.ts` (`PRESET_ID_PATTERN`, `PresetWorkspaceEntry`), `loadDefaultPreset.ts` and `presetMessages.ts`: reuse all of them. 7.5 FD1 split `presetFetch` out precisely so this story could import it cheaply.
- `packages/domain/src/pristineWorkspace.ts`: `isPristineWorkspace(battleCount, organisms, workspaceDescription?)`.
- `apps/web/e2e/loadPreset.spec.ts` and `home.spec.ts`: helpers, the `__dirname` rule, and the `forcePresetFallback` idiom (200 `{}`, never abort or 404, because Chromium logs those as console errors). Route test-only files with `route.fulfill` and a 200.

### Architecture compliance

- **FR-9.4:** the link loads through the FR-8.4 pipeline (`serializer.importWorkspace`, M8). There is no preset parser (FR-9.1), and the warning is mandatory unless pristine.
- **Decision K.5:** a query param on a static route, with nothing to prerender per id.
- **AR-2 / AR-27:** `createRepositories()` stays once, in `GalleryRoute`. The arrival receives `AppRepositories` as a prop, and the serializer is built inside the lazy flow from that prop.
- **AR-3 / AR-35:** see FD3. The dialog is `next/dynamic`.
- **FR-9.2:** fresh visitors without a link are unaffected. Clear All never re-triggers a preset: the deferral flag requires a fresh store, and `resetWorkspace()` keeps the stamp (M9).
- **Decision F:** `gol:settings` is untouched by construction. Assert it in the e2e.
- **M16:** the workspace description arrives through `applyImport`. The gallery's re-read after the hold shows it.
- **AR-46:** `--gol-*` tokens only in `PresetLinkNotice`.
- Cite IDs exactly: `FR-9.4`, `FR-9.2`, `FR-9.1`, `FR-8.4`, `M8`, `M9`, `M16`, `AR-2`, `AR-27`, `AR-3`, `AR-35`, `AR-46`, `Decision K.5`, `Decision K.3`, `Decision F`, `Story 7.6`. `npm run spec:check` fails any ID that resolves to nothing.

### Library / framework notes

- No new dependency. `useSearchParams` from `next/navigation` (Next 16.2): it requires a `<Suspense>` ancestor in a statically exported page or the build fails with `missing-suspense-with-csr-bailout`. Run `build:standalone` early, not just `next dev`. It returns `null` outside the App Router (jsdom), which is why `page.test.tsx` must mock it.
- `window.history.replaceState` is the Next-documented way to change the URL without navigation. Next 16 patches it to sync `useSearchParams` and keeps the current router tree, so the page stays mounted. Verify in e2e (d) that the notice survives the strip. If the page remounts instead, STOP and report it; do not silently switch to `router.replace` or to a hash.
- Inherited hazard (not handled): `deferred-work.md`'s two-phase `useSearchParams` entry (Story 2.1, widened by 3.17). If render 1 ever yielded empty params, the seed would not defer, and a first-visit link would show a dialog over the default preset. It is unobserved on `/battle`. E2E (a) is the canary. If it fails that way, report it rather than working around it.

### Testing standards

- The `apps/web` coverage gate is none; test behaviour. Use the fakes from `@gol/test-utils` and real serializers over them. Serve the real shipped files off disk.
- Fake timers only in the timeout cases. Restore stubbed globals in `afterEach`.
- Live-region ordering: assert that at the first moment a post-dialog notice exists, the dialog is gone (project-context rule).
- The local gate is `npm run ci:dev` (Chromium e2e only).

### Project Structure Notes

- New: `apps/web/lib/workspaces/presetLink.ts` (+ test), `apps/web/lib/workspaces/presetLinkFlow.ts` (+ test), `apps/web/components/gallery/PresetLinkArrival.tsx` (+ test), `apps/web/components/gallery/PresetLinkNotice.tsx` (+ test), `apps/web/e2e/presetLink.spec.ts`.
- Updated: `apps/web/app/(gallery)/page.tsx` (+ `page.test.tsx`), `apps/web/lib/gallery/useWorkspaceSeed.ts` (+ test), `apps/web/lib/workspaces/presetMessages.ts` (+ test), and possibly `scripts/bundle-baselines.json` (tool-written only).
- Unchanged: `BattleGallery.tsx`, `ImportWarningDialog.tsx`, `LoadPresetRow.tsx`, `packages/*`, the other page boundaries, and `public/workspaces/`.

### What NOT to build

- No "copy preset link" UI anywhere (not in AC; see open question 2). No new presets (7.7).
- No link handling on `/organisms`, `/settings` or `/battle`. `?preset` is read on `/` only.
- No shared flow hook (see "What exists"). No cross-flow lock.
- No `console.*` on any path. No automatic retry.
- Do not fix 7.4/7.5 deferred items (the unmount-abort, the dialog-chunk `pendingRef`, the `exportInFlightRef` leak). Only FD3's flow-chunk failure is handled, because here it would hold the gallery forever.

### Previous story intelligence

- **7.5:** The dialog's copy props, `presetFetch.ts`, `presetMessages.ts` and the whole flow shape. Its review hardened the tests: compare store LISTS rather than counts, pin exact copy, prove "works after the export settles", and assert the second `onMessage`/`onSettled` payload, not just its call. Apply the same rigour from the start. Its manual smoke was initially skipped and then flagged in review, so run 10.2.
- **7.4:** `useWorkspaceSeed`'s production branch, the D1 `holdsNoUserData` guard, `loadDefaultPreset`, and e2e `forcePresetFallback`. Its review found that `page.goto` re-runs init scripts, hence the sessionStorage guard in 9.1.
- **7.3:** `colony-clash` (two battles, Conway plus three organisms, a described workspace) is the only shipped preset. Hence the test-side second preset in 9.2.
- **5.9 / 5.10:** act-on-exit, Review Decision 1 (confirm is a no-op during Export First), and never `disabled`.

### Git intelligence

`main` is at `6d3380c` (the #102 merge, story 7.5: `LoadPresetRow`, `presetFetch`, `presetMessages`, and the `ImportWarningDialog` copy props). Nothing has touched `app/(gallery)/page.tsx` or `components/gallery/` in Epic 7 except 7.2's description rendering.

### Open questions for the owner (answered provisionally above)

1. **Query param vs hash** (the AC left it open). Provisional: `/?preset=<id>` (FD1, Decisions K.5/K.3). A hash (`/#preset=<id>`) would avoid the Suspense boundary and the empty-`<main>` prerender, and it is invisible to the router, so stripping is trivial. But it contradicts K.3's stated reason and the house idiom. Changing this later breaks every link already shared, so it is worth an explicit yes.
2. **No link-generation UI.** There is no "Copy link" button, in Settings or anywhere else. Links are hand-built from manifest ids. 7.7 or a follow-up could add one beside the Load Preset row.
3. **Download failure keeps the param** (FD6), so reload retries. The alternative is to always strip, which is simpler but makes a retry mean re-opening the original link.

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.6]
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-9.4, FR-9.2, FR-8.4]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md §3]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/preset-workspace-library.html:157-166, 345-357, 453-466]
- [Source: docs/planning-artifacts/architecture.md#Decision K (K.3, K.5), M8, M9, M16, Decision F]
- [Source: docs/implementation-artifacts/7-5-load-preset-from-settings.md FD1–FD8, Review Findings]
- [Source: docs/implementation-artifacts/7-4-first-visit-default-preset-auto-load.md FD4, FD5, review D1]
- [Source: docs/implementation-artifacts/deferred-work.md: two-phase useSearchParams (Story 2.1/3.17), 7.4 and 7.5 entries]
- [Source: docs/project-context.md: K.5, AR-2/27, live region while a dialog is open, bundle growth gate, ci:dev]

## Dev Agent Record

### Agent Model Used

Sonnet 5.5 (claude-sonnet-5-5)

### Debug Log References

- `npm run ci:dev` green (typecheck, lint, format:check, spec:check, boundary:check, coverage, build:standalone, bundle:check, bench, bench:check, e2e chromium 327 passed).
- Earlier runs: one Vitest failure (page.test.tsx asserted gallery tiles the instant the alert appeared; the gallery re-read is async, so it now uses `waitFor`), and e2e strict-mode failures because `getByRole('alert')` also matches Next's `__next-route-announcer__` (filtered by text). One `loadPreset.spec.ts` axe contrast failure on /settings appeared once under load and passed on rerun and in the final ci:dev (a dialog-transition flake, unrelated to this story).
- The replaceState remount hazard and the two-phase `useSearchParams` hazard did NOT occur: e2e (d) shows the notice surviving the URL strip, and e2e (a) (first visit + link) never shows a dialog.

### Completion Notes List

- `/?preset=<id>` implemented per FD1-FD8. `app/(gallery)/page.tsx` is split into `HomePage` (Suspense, fallback null) and `GalleryRoute`; `index.html` now prerenders an empty `<main>` (the page was client-seeded anyway; the layout's nav and wordmark stay prerendered).
- Shared-flow lift decision (deferred by 7.5): NO. The arrival has no trigger button, no row slot and a page-level hold, so this is the third copy of the dialog flow rather than a shared hook.
- Bundle: `/` first-load gzip 341.0 KB vs baseline 339.2 KB (+1.8 KB), within the 8 KB growth allowance, so `scripts/bundle-baselines.json` was not refreshed.
- Manual smoke (10.2): not run as a separate manual pass. The equivalent was covered by e2e against the static export served from `out/` (fresh visit + link with no dialog and a clean URL, non-pristine + Cancel with byte-identical storage, unknown id + Dismiss). Rename-then-Cancel was not exercised by name; e2e (b) proves the seeded store is byte-identical after Cancel.
- Nothing in `presetLinkFlow.ts` writes before the unknown+firstVisit default load or `load()`.

### File List

- apps/web/lib/workspaces/presetLink.ts (new)
- apps/web/lib/workspaces/presetLink.test.ts (new)
- apps/web/lib/workspaces/presetLinkFlow.ts (new)
- apps/web/lib/workspaces/presetLinkFlow.test.ts (new)
- apps/web/lib/workspaces/presetMessages.ts
- apps/web/lib/workspaces/presetMessages.test.ts
- apps/web/lib/gallery/useWorkspaceSeed.ts
- apps/web/lib/gallery/useWorkspaceSeed.test.tsx
- apps/web/components/gallery/PresetLinkArrival.tsx (new)
- apps/web/components/gallery/PresetLinkArrival.test.tsx (new)
- apps/web/components/gallery/PresetLinkNotice.tsx (new)
- apps/web/components/gallery/PresetLinkNotice.test.tsx (new)
- apps/web/app/(gallery)/page.tsx
- apps/web/app/(gallery)/page.test.tsx
- apps/web/e2e/presetLink.spec.ts (new)
- docs/implementation-artifacts/7-6-preset-link.md
- docs/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-09-29: Story 7.6 implemented (preset link `/?preset=<id>`), status review.

Dev Model: sonnet   # architecture-shaping (URL form, seed-hook deferral, gallery page boundary split); escalation to opus withheld because its Fable review pairing is unavailable, so FD1–FD8 pin every pattern for a Sonnet dev
Proposed lane gate: none
