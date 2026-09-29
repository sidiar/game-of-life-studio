---
baseline_commit: ae8a32b212047bab6c7e243f86f0eefdb300960b
---

# Story 7.5: Load Preset from Settings

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to load any bundled preset from the Settings page,
so that I can start over from curated content whenever I choose.

## Acceptance Criteria

1. **Given** the Settings Data Management area, **When** rendered, **Then** a preset row lists the manifest's presets (name + description) using the established SettingsCard row patterns (FR-9.3).
2. **And** loading replaces the whole workspace through the FR-8.4 pipeline, including its destructive warning with the export-first option, suppressed only for a pristine workspace (FR-9.3).
3. **And** success and failure feedback uses the shared 5.10 row-outcome slot, and a load in flight follows the established concurrent-action guards (FR-9.3).

## Tasks / Subtasks

- [x] **Task 1: Split the fetch helpers out of the first-visit loader** (AC: 1, 2), per FD1
  - [x] 1.1 Create `apps/web/lib/workspaces/presetFetch.ts`. Move `fetchOk`, `fetchPresetManifest`, `fetchPresetText` and `PRESET_FETCH_TIMEOUT_MS` (with its WHY comment, re-worded so it covers both callers) out of `loadDefaultPreset.ts`. Add `withPresetTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = PRESET_FETCH_TIMEOUT_MS): Promise<T>`: one `AbortController`, `setTimeout(abort)`, and the timer cleared in `finally`. This is exactly the pattern `loadDefaultPreset` inlines today.
  - [x] 1.2 `loadDefaultPreset.ts` imports these from `./presetFetch` and composes `withPresetTimeout`. Its behaviour must not change: the timeout still covers the network phase only, and the import is never raced. Do not re-export the moved names from `loadDefaultPreset.ts`. Update `loadDefaultPreset.test.ts`'s `PRESET_FETCH_TIMEOUT_MS` import, and keep every existing test green without editing any assertion.
  - [x] 1.3 `presetFetch.ts` must import nothing from `@gol/persistence` (no serializer). That is the whole point of the split (FD1). Add a head comment saying so, and naming its callers: 7.4's loader, this story's row and 7.6's link.
  - [x] 1.4 `presetFetch.test.ts`: `withPresetTimeout` resolves with the run's value and clears the timer; it aborts the signal after `timeoutMs` using fake timers; a run rejection propagates. Also add one `fetchPresetText` non-OK status test if no existing loader test already covers it through the loader.
- [x] **Task 2: Parameterise the FR-8.4 warning dialog** (AC: 2), per FD2
  - [x] 2.1 `ImportWarningDialog.tsx`: replace the `kind` prop with copy props: `title: string`, `body: string`, `confirmLabel: string`, `exportFailedText: string`. Keep everything else (ids, button order and variants, `autoFocus` on Cancel, `disableRestoreFocus`, act-on-exit, the in-dialog `exportState` live regions, `PAPER_MAX_WIDTH`) byte-identical. Update the doc comment: the dialog is now the FR-8.4 warning for every whole-workspace replace (a file import, a Settings preset, and in 7.6 a preset link).
  - [x] 2.2 `ImportWorkspaceRow.tsx` passes `title="Replace Your Workspace?"`, `body={importWarningText(dialogKind)}`, `confirmLabel="Import Anyway"`, and `exportFailedText="Your current workspace could not be exported. Nothing was imported."`. Import's rendered DOM must be unchanged, so every existing `ImportWorkspaceRow.test.tsx` and `settings.spec.ts` import test passes without edits.
  - [x] 2.3 Keep the file name and the `import-warning-dialog-title` / `-body` ids. Renaming them is churn, and `focusImportButtonIfLoose` matches the title id.
- [x] **Task 3: Preset copy** (AC: 2, 3), per FD3
  - [x] 3.1 New `apps/web/lib/workspaces/presetMessages.ts` (beside the contract module; not in `lib/import/`, because these are preset-specific):
    - `presetWarningTitle(name)` → `` `Load “${name}”?` `` (mockup `preset-workspace-library.html:440`, with typographic quotes).
    - `PRESET_WARNING_BODY`: FR-8.4's claim in the mockup's words: "This replaces your entire workspace — all current battles and organisms will be lost. Export your current workspace first?". It must keep FR-8.4's substance: "replaces entire workspace", "lost", and the export-first offer.
    - `PRESET_CONFIRM_LABEL = 'Load Preset'`, and `PRESET_EXPORT_FAILED_TEXT = 'Your current workspace could not be exported. Nothing was loaded.'`.
    - `presetLoadSuccessMessage(name, summary)` → `` `Loaded “${name}” — your workspace now has N battles and M organisms.` ``, pluralised like `importSuccessMessage`, and built from the pipeline's `ImportSummary`, never a re-count.
    - `PRESET_FETCH_FAILURE_MESSAGE = 'The preset could not be downloaded. Check your connection and try again. Your workspace was not changed.'`.
    - `PRESET_LIST_FAILURE_MESSAGE = 'The preset list could not be loaded. Reload the page to try again.'`.
  - [x] 3.2 Import errors (`validateImportFile` / `importWorkspace` rejections) reuse `importFailureMessage(error)` unchanged. Do not fork the copy table.
  - [x] 3.3 Unit tests for the two builders (pluralisation, typographic quotes).
- [x] **Task 4: `<LoadPresetRow>`** (AC: 1, 2, 3), per FD4–FD8
  - [x] 4.1 New `apps/web/components/settings/LoadPresetRow.tsx`, with props mirroring `ImportWorkspaceRowProps` exactly: `serializer: Pick<WorkspaceSerializer, 'exportWorkspace' | 'importWorkspace'>`, `battles: Pick<BattleRepository, 'list'>`, `organisms: Pick<OrganismRepository, 'list'>`, `workspaceMeta: Pick<WorkspaceMetaRepository, 'load'>`, `onImported(): void`, `onMessage(message: RowOutcome | null): void`. No `fetch` prop (FD5).
  - [x] 4.2 Manifest read on mount: `useAsyncResource(() => withPresetTimeout((signal) => fetchPresetManifest(browserFetch, signal)), [])`. `browserFetch` is a module-level `const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);`. It is a stable identity (the `useAsyncResource` precondition), and `vi.stubGlobal('fetch', …)` still reaches it.
  - [x] 4.3 Render, as one `Row` with `RowInfo` / `RowLabel` / `RowDescription` (FD6):
    - Label: "Load Preset Workspace". Description (mockup `:321`, minus "exactly like Import", which would overclaim given the pristine suppression): "Start over from a curated, ready-to-run workspace bundled with the app. Replaces your entire workspace — you are warned first whenever your current workspace holds data, and offered to export it."
    - `loading`: a plain `RowDescription`-styled line "Loading presets…". No control.
    - `error`: a plain line with `PRESET_LIST_FAILURE_MESSAGE`. No control, no `role="alert"`/`status` (it is the row's mount-time state, not an outcome; the `AddMessage` precedent in `OrganismRoster.tsx`). It never writes to the shared slot, and there is no `console.*` call.
    - `ready`: a native `<select>` with the entries ordered default first, then manifest order. The default's option text is suffixed " (default)" (mockup `:326`). The initial value is the default id. Below the row description, a description echo of the SELECTED entry's `description` (mockup `.preset-row-description`: 12px, `--gol-text-tertiary` if that token passes the gated contrast pair on `--gol-bg-secondary`, else `--gol-text-secondary`, `max-width: 520px`, `margin-top: 8px`). Plain text; not a live region. Then a "Load" button (`aria-label="Load preset workspace"`, `data-load-preset=""`).
    - The select's accessible name comes from the row label: give `RowLabel` an `id` and set `aria-labelledby` on the select. The select also gets `aria-describedby` pointing at the echo, so screen readers hear the description of the preset being chosen.
  - [x] 4.4 Load flow (FD7), mirroring `ImportWorkspaceRow.handleFileChange` step for step:
    1. If `pendingRef.current`, return (a no-op; never `disabled`). Otherwise set `pendingRef = true` and call `onMessage(null)`.
    2. `text = await withPresetTimeout((signal) => fetchPresetText(browserFetch, entry, signal))`. On any rejection: `onMessage({ role: 'alert', text: PRESET_FETCH_FAILURE_MESSAGE })`, release `pendingRef`, return.
    3. `validateImportFile(text)`. On rejection: the alert is `importFailureMessage(error)`, then release and return. (This is only reachable through a deploy skew, e.g. `newer-version`, because the lockstep gate validates every shipped preset.)
    4. The pristine check: identical to Import's (`Promise.all([battles.list(), organisms.list(), workspaceMeta.load()])` → `isPristineWorkspace(...)`, and a rejected read counts as NOT pristine).
    5. If `!mountedRef.current`, release and return (no unseen writes).
    6. If pristine, `await runLoad(text, entry.name)` and release. Otherwise stash the text and name in refs, reset `exportState`, owe focus, and mount and open the dialog with `presetWarningTitle(name)`, `PRESET_WARNING_BODY`, `PRESET_CONFIRM_LABEL` and `PRESET_EXPORT_FAILED_TEXT`.
    - `runLoad`: `serializer.importWorkspace(text)`. On success: `onMessage({ role: 'status', text: presetLoadSuccessMessage(name, summary) })`, then `onImported()`. On failure: `onMessage({ role: 'alert', text: importFailureMessage(error) })`. Both are guarded by `mountedRef`.
    - Copy the rest of Import's dialog machinery: `choiceRef` (the first choice wins), Export First with `exportInFlightRef` (and Load Preset is a no-op while that export runs, per 5.9 Review Decision 1), `handleDialogExited` running the load ONLY after the exit transition, and the post-exit focus restore (`focusTick`, `focusOwedRef`). The restore targets `[data-load-preset]` through a local `focusLoadButtonIfLoose()`, which uses the same "loose" definition as Import's.
    - The dialog is `next/dynamic` (`ssr: false`), the same as Import's call site (AR-35).
  - [x] 4.5 Lift Import's secondary button into `SettingsCard.tsx` as `SecondaryButton` (FD6). Keep the styles byte-identical and carry its comment. `ImportWorkspaceRow` and `LoadPresetRow` both use it. Copy `OrganismRoster.tsx`'s `AddSelect` shape (do not import it; it belongs to another area) as a local `PresetSelect`: `--gol-border-control`, the UA arrow, no `transition: all`, and a `prefers-reduced-motion` escape. Match the button's 13px sizing, and do not use uppercase text on the select (preset names are proper nouns).
- [x] **Task 5: Wire it into `<DataManagement>`** (AC: 1, 3)
  - [x] 5.1 Add `'preset'` to `OutcomeSource`. Mount `<LoadPresetRow>` between `<ImportWorkspaceRow>` and `<ClearAllDataRow>` (mockup order), passing the same `serializer` / `battles` / `organisms` / `workspaceMeta`, `onImported={() => { setDescriptionKey((k) => k + 1); onImported(); }}` and `onMessage={(next) => publish('preset', next)}`.
  - [x] 5.2 Update the head comment: five rows, and 7.5's row is its own component. `DataManagementProps`, `SettingsPage` and the page boundary are unchanged, because the row needs no new port.
- [x] **Task 6: Unit tests** (AC: all)
  - [x] 6.1 `LoadPresetRow.test.tsx`. Use `vi.stubGlobal('fetch', …)` (restore it in `afterEach`), `createFakeRepositories()` from `@gol/test-utils`, and a real `createWorkspaceSerializer` over the fakes, so the test proves a real import. Serve the REAL `public/workspaces/` files off disk via `node:fs` (the `loadDefaultPreset.test.ts` idiom) for the happy paths. Cases:
    - (a) Loading state, then `ready`: the options are default first with " (default)", and the echo shows the default's description and follows a `selectOptions` change.
    - (b) A manifest failure (HTTP 500, and a 200 `{}`) → the list-failure line, no select or button, and `onMessage` never called.
    - (c) Pristine store (fakes seeded with Conway only) → Load → no dialog → the store holds the preset's battles, `onMessage` gets `null` then the status with the preset name, and `onImported` is called once.
    - (d) Non-pristine → Load → dialog titled `Load “Colony Clash”?` → Cancel → the store is unchanged, `onMessage` got only `null`, and focus returns to the Load button after exit.
    - (e) Non-pristine → Load Preset → the import runs after exit, then the status and `onImported`.
    - (f) Export First → `exportWorkspace` is called and the dialog stays open; Load Preset clicked while the export is in flight does nothing.
    - (g) An envelope fetch failure (a 404; a reject) → the alert `PRESET_FETCH_FAILURE_MESSAGE`, and the store is unchanged.
    - (h) A hung envelope fetch (fake timers) → after `PRESET_FETCH_TIMEOUT_MS`, the same alert, and a new Load is accepted afterwards (`pendingRef` released).
    - (i) Double click while the first load is in flight → exactly one envelope fetch.
    - (j) Unmount while the fetch is pending → no import, and no `onMessage` after unmount.
    - (k) A `validateImportFile` failure (serve an envelope body `{`) → the `importFailureMessage` alert, and the store is unchanged.
    - (l) An `importWorkspace` rejection → the `importFailureMessage` alert, and `onImported` is not called.
  - [x] 6.2 `DataManagement.test.tsx`: a preset outcome is replaced by a later Export/Clear flow's `null`, and a stale preset outcome that lands after another row claimed the slot is dropped (the D2 owner rule applied to the new source).
  - [x] 6.3 `ImportWarningDialog`: if it has a direct test, update the props. Otherwise the `ImportWorkspaceRow` tests are the regression net for Task 2 and must pass without edits.
- [x] **Task 7: E2E** (AC: all), per FD8
  - [x] 7.1 New spec `apps/web/e2e/loadPreset.spec.ts`. NOT `settings.spec.ts`: that file's file-wide `beforeEach(forcePresetFallback)` serves `{}` for `index.json`, so the row would render its list-failure state there. Copy the file-local `seedWorkspace` helper (the house convention; see `settings.spec.ts:238`'s comment) and read the preset's battle names from `public/workspaces/colony-clash.json` via `node:fs` (`__dirname`, not `import.meta.url`: Playwright loads specs as CommonJS, per 7.4's debug log).
  - [x] 7.2 Non-pristine: `seedWorkspace` → `/settings` → the select shows "Colony Clash (default)" and the echo shows its description → Load → a dialog named `Load “Colony Clash”?` → Load Preset → the status line names the preset, the Saved Battles stat equals the preset's battle count, and `/` lists the preset's battle names. `gol:settings` is byte-identical before and after (Decision F). Zero console errors.
  - [x] 7.3 Cancel leaves `gol:battles` / `gol:organisms` byte-identical.
  - [x] 7.4 Pristine: a fresh context with the manifest routed to `{}` for the FIRST visit only (the 7.4 fallback, giving a stamped, Conway-only, pristine store), then `page.unroute` → `/settings` → Load → no dialog is ever present, and the status line appears.
  - [x] 7.5 axe: no violations with the row rendered, and none with the preset dialog open.
  - [x] 7.6 Confirm the existing `settings.spec.ts` axe and zero-console-error tests still pass with the row in its list-failure state (their forced `{}` manifest). If they do not, fix the row, not the spec.
  - [x] 7.7 Run `npm run e2e:chromium` locally, never the four-browser `npm run ci`.
- [x] **Task 8: Gates** (AC: all)
  - [x] 8.1 `npm run ci:dev` green. `/settings` gains the row, `presetFetch`, the copy and a dynamic dialog chunk it already had. If `bundle:check` flags growth past the allowance, refresh the baseline in this PR (`npm run build:standalone` then `npm run bundle:baseline`) and state the delta in the Dev Agent Record.
  - [x] 8.2 Manual smoke on the static export (`npm run build:standalone && npx serve out`), in headless Chromium if easier: first visit → `/settings` → Load (pristine → no dialog) → back to the gallery. Then edit or add something → Load → dialog → Load Preset. Take screenshots into the scratchpad, not the repo. Record the results in the Dev Agent Record.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: Split `presetFetch.ts` out of `loadDefaultPreset.ts`.** 7.4 exported `fetchPresetManifest` / `fetchPresetText` from the loader "for 7.5 and 7.6", but that module statically imports `createWorkspaceSerializer`. On `/settings` that costs nothing, because the page boundary already builds a serializer. 7.6, however, runs on routes whose first-load bundle must not carry the import pipeline (7.4 FD4, AR-3). Splitting now keeps one fetch module that every caller imports cheaply, and the loader stays the only thing `useWorkspaceSeed` dynamic-imports. `withPresetTimeout` is the loader's own inlined AbortController pattern, named so it is not re-typed in two more places. The row passes `browserFetch`, not a wrapper, so 7.4's deferred note ("revisit if 7.5 injects a fetch wrapper") stays not-triggered. Record that in the Dev Agent Record.
- **FD2: One FR-8.4 dialog, with copy as props.** The UX notes say the warning is "the FR-8.4 destructive dialog verbatim — same copy pattern… same export-first option… preset name in the dialog title", and the mockup shows that 7.5 and 7.6 share one dialog with different bodies (`preset-workspace-library.html:436-466`). A second dialog component would duplicate its focus, inert and act-on-exit contract, which took 5.9 two review rounds to get right. The props are strings only: no `ReactNode` title, and no accent-coloured name span (the mockup's `.preset-name` colour is decoration; the name in the text is the requirement). Import's copy moves to its call site unchanged.
- **FD3: Preset copy lives in `lib/workspaces/presetMessages.ts`.** Success names the preset, because the user chose it by name. Fetch failures get their own honest line ("could not be downloaded", "not changed" — true because nothing was written before the fetch settled). Import-pipeline failures reuse `importFailureMessage` as is: its "this file" wording is slightly off for a preset, but those codes are unreachable for a lockstep-gated preset except through deploy skew, and a second copy table is worse. See open question 2.
- **FD4: Fetch → validate → pristine check → warn → import, in that order.** The same order as Import (5.9 FD1), with the fetch standing in for the file read. The download comes first, so a network failure never shows the user a dialog that then fails, and so a validation failure never warns about a replace that cannot happen. The cost is that a Cancel wastes one static download, which is acceptable.
- **FD5: No `fetch` prop; `browserFetch` is module-level, and the manifest is read on mount.** A mount-time manifest read is what lets the row list names and descriptions without a click (AC1). It uses `useAsyncResource`, whose deps must be stable, so `globalThis.fetch.bind(...)` per render would crash-loop. The module-level arrow is stable, and tests stub the global. Threading a fetch port through `SettingsPage` → `DataManagement` for one row adds two prop layers for no test benefit. `fetch` is not a repository, so AR-2/27 does not apply.
- **FD6: Row shape.** The mockup's settings-item: a label, a description, and the select plus a secondary button in the control column, with the selected preset's description echoed under the row description (AC1's "name + description"). A native `<select>`, not MUI `Select`: the codebase's selects are all native styled ones, and MUI `Select` would pull Popover/Menu into `/settings`' first load (AR-35). Import's `ImportButton` becomes `SettingsCard.tsx`'s `SecondaryButton`, because this row is its second consumer, and `SettingsCard.tsx`'s own header states that two copies is the lift threshold.
- **FD7: The concurrent-action guard is 5.9/5.10's, not a new one.** A per-row `pendingRef` spans fetch through outcome, including the whole dialog window, and a click while pending is a silent no-op. The button is never `disabled` (5.5 FD8, the focus-loss trap). There is no cross-row locking (`<DataManagement>`'s own comment, FD6 of 5.10). The shared slot's started-latest-owner rule (`publish`) is what keeps an Import or Clear All that the user started later from being overwritten by a slower preset load. This is the "established concurrent-action guards" of AC3 and the UX note's "no-op while another data flow is in flight" read per row. See open question 1.
- **FD8: The e2e lives in its own spec.** See Task 7.1. The first-visit auto-load (7.4) means a fresh context already holds the preset, so the pristine-path test must force the fallback for the first visit only, and then let the real manifest through.

### What exists: read these before writing a line

- `apps/web/components/settings/ImportWorkspaceRow.tsx` (UPDATE: dialog props and `SecondaryButton`). This is the template for the whole flow: `pendingRef`, the StrictMode re-armed `mountedRef`, `choiceRef`, `exportInFlightRef`, `focusTick` / `focusOwedRef`, `useInertBackground(dialogMounted)`, and `handleDialogExited`, which runs the import only after exit (the project-context live-region rule). **Preserve:** every behaviour and the rendered DOM. The existing tests are the proof.
- `apps/web/components/settings/ImportWarningDialog.tsx` (UPDATE: FD2). **Preserve:** button order and variants, the Cancel `autoFocus`, Escape and backdrop routing to Cancel, `disableRestoreFocus`, `onTransitionExited`, the in-content `exportState` live regions, and the ids.
- `apps/web/components/settings/DataManagement.tsx` (UPDATE). The `publish(source, next)` owner slot, `descriptionKey` (bumped after a replace so the description row re-reads, which a preset load also needs, because it replaces the description; M16), and Export's own flow. **Preserve:** the D2 semantics exactly.
- `apps/web/components/settings/SettingsCard.tsx` (UPDATE: the `SecondaryButton` lift). `Row` / `RowInfo` / `RowLabel` / `RowDescription` / `RowOutcome`.
- `apps/web/lib/workspaces/loadDefaultPreset.ts` (UPDATE: FD1) and `presetManifest.ts`: the Zod `PresetWorkspaceManifestSchema` is the parse boundary, and the `PresetWorkspaceEntry` / `PresetWorkspaceManifest` interfaces are the ones to import. Never cast a fetched body.
- `apps/web/public/workspaces/index.json`: one entry today (`colony-clash`, the default). 7.7 adds more. Build and test for N entries, and do not special-case one entry (a one-option select is still a real control; the `ConditionRow.tsx` FD5 precedent).
- `apps/web/lib/import/importFailureMessage.ts`, `importMessages.ts`: the copy table and success-line idiom.
- `packages/domain/src/pristineWorkspace.ts`: `isPristineWorkspace(battleCount, organisms, description)`.
- `apps/web/components/battle/editor/OrganismRoster.tsx:300-330`: the `AddSelect` native select styling to copy (not import).
- `apps/web/lib/useAsyncResource.ts`: stable deps with a fixed length, and `data` is only meaningful when `status === 'ready'`.
- `apps/web/e2e/settings.spec.ts`: `forcePresetFallback` (file-wide) and `seedWorkspace` (~238). The import describe (~319) and its axe-with-dialog test are templates for 7.2–7.5.

### Architecture compliance

- **M8 / FR-8.4:** a preset load is a whole-workspace replace through `serializer.importWorkspace`. There is no preset parser, no merge, and a mandatory warning unless pristine. **FR-9.1:** the envelope goes to the pipeline as TEXT.
- **AR-2 / AR-27:** the row receives `Pick`s of ports from `<DataManagement>`. It imports no concrete repository and never calls `createRepositories()` or `createWorkspaceSerializer`.
- **Decision F:** `gol:settings` is untouched by construction. Assert byte-identity in the e2e as the Import tests do.
- **M16:** the preset's workspace description lands through `applyImport`. `descriptionKey` makes the Settings description row re-read it.
- **AR-35:** the dialog stays `next/dynamic`, and the select is native.
- **AR-46:** `--gol-*` tokens only. Check any new text/background pair against `themeTokens.test.ts`'s gated pairs.
- **Decision K.5:** a plain static `fetch`, with no route or server.
- Cite IDs exactly: `FR-9.3`, `FR-8.4`, `FR-9.1`, `M8`, `M16`, `AR-2`, `AR-27`, `AR-35`, `AR-3`, `AR-46`, `Decision F`, `Decision K.5`, `Story 7.5`. `npm run spec:check` fails an ID that resolves to nothing.

### Library / framework notes

- No new dependency. Use `zod` (already a direct `apps/web` dependency since 7.4) only through `PresetWorkspaceManifestSchema`.
- The native `<select>` works with `userEvent.selectOptions` (Testing Library) and `locator.selectOption` (Playwright).
- `fetch` + `AbortController` are standard. No web research needed.

### Testing standards

- The `apps/web` coverage gate is none; test behaviour. Use the fakes from `@gol/test-utils`, and a real serializer over them for the load assertions.
- Fake timers only in the timeout cases. Restore stubbed globals in `afterEach`.
- The live-region ordering rule: in the non-pristine tests, assert that when the status/alert first exists, the dialog is gone (project-context's "unless a test asserts the ordering").
- E2E runs against the static export (production), where the first-visit preset path is live in every fresh context. The local gate is `npm run ci:dev` (Chromium only).

### Project Structure Notes

- New: `apps/web/lib/workspaces/presetFetch.ts` (+ `.test.ts`), `apps/web/lib/workspaces/presetMessages.ts` (+ `.test.ts`), `apps/web/components/settings/LoadPresetRow.tsx` (+ `.test.tsx`), `apps/web/e2e/loadPreset.spec.ts`.
- Updated: `loadDefaultPreset.ts` (+ its test import), `ImportWarningDialog.tsx`, `ImportWorkspaceRow.tsx`, `SettingsCard.tsx`, `DataManagement.tsx` (+ test), and possibly `scripts/bundle-baselines.json` (tool-written only).
- No change to `packages/*`, `SettingsPage.tsx`, the page boundary, or `useWorkspaceSeed.ts`.

### What NOT to build

- No preset link or URL parameter (7.6), and no new presets (7.7).
- No preset thumbnails, badges, or "sample" labelling (UX §4).
- No cross-row lock, and no `disabled` on Load or the select.
- No `console.*` on any failure path, and no automatic retry of the manifest read.
- Do not lift the flow into a shared hook. This is the flow's second copy (Import is the first). 7.6's arrival flow is a different surface and decides whether a third copy earns a lift.
- Do not fix 7.4's deferred items (unmount/remount double load, the shared timeout budget). They concern `useWorkspaceSeed`, which this story does not touch.

### Previous story intelligence

- **7.4:** Added the Zod manifest parse, `fetchPresetManifest` / `fetchPresetText` / `PRESET_FETCH_TIMEOUT_MS` (moved here by FD1), and the silent first-visit load. E2E: fresh contexts auto-load, `forcePresetFallback` (200 `{}`, never abort or 404, because Chromium logs those as console errors) opts a spec out, and `__dirname` is required in specs. `npm install` of zod once bumped the lockfile. There is no dependency change here, so there is no lockfile edit.
- **7.3:** `colony-clash` is the default: two battles (Four Corners 100×60, Tug of War 50×30), Conway plus three organisms, and a described workspace. The echo and the dialog show real authored text.
- **7.2:** `WorkspaceDescriptionRow` and `descriptionKey`, and the Import row's pristine check reads the description (FD6 of 7.2). Reuse that three-way read.
- **5.9 / 5.10:** the flow, the dialog, and the D2 single-slot owner rule. Also 5.9 Review Decision 1 (the confirm is a no-op while Export First is in flight) and Decision 2 (a row description must not overclaim "always warned").

### Git intelligence

Recent main: `ae8a32b` (merge of #101, story 7.4: `loadDefaultPreset.ts`, `presetManifest.ts` schema, the `useWorkspaceSeed` production branch, and the e2e `forcePresetFallback` in six specs). Nothing has touched `components/settings/` since 7.2.

### Open questions for the owner (answered provisionally above)

1. The UX note says "no-op while another data flow is in flight". Read literally, that is a cross-row lock, which 5.10 FD6 deliberately does not have. Provisional (FD7): per-row guard plus the owner slot, matching "the established concurrent-action guards" of the AC.
2. Import-pipeline failure copy for a preset says "This file…" (`importFailureMessage`). It is reachable only through deploy skew. Provisional (FD3): reuse it, and do not fork the table.
3. Dialog wording: the mockup's "Load Preset" and "Export First" button labels vs Import's "Import Anyway" and "Export Current Workspace First". Provisional: "Load Preset" for the confirm (the mockup), with the shared dialog's existing "Export Current Workspace First" label kept (it is not a copy prop), so both flows present the same safe option identically.

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.5]
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-9.3, FR-8.4]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/preset-workspace-library-design.md §2]
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/preset-workspace-library.html:302-344, 436-466]
- [Source: docs/planning-artifacts/architecture.md#M8, M16, Decision F]
- [Source: docs/implementation-artifacts/7-4-first-visit-default-preset-auto-load.md FD1–FD6, Review Findings]
- [Source: docs/implementation-artifacts/epic-5/ (5.9 import row, 5.10 D2 slot ruling)]
- [Source: docs/project-context.md: live region while a dialog is open; repositories injected; Zod at boundaries; bundle growth gate; ci:dev]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5.5

### Debug Log References

- `npm run ci:dev`: typecheck, format, spec:check, boundary, coverage tests (web 2788 passed), build, bundle:check (home +0.3 KB, battle +0.1 KB gzipped, within the 8 KB allowance, no baseline refresh), bench all green; the only lint output is a pre-existing `BattleGallery.tsx` react-hooks warning. e2e:chromium 320 passed after fixing my own spec (a full `page.goto('/')` re-runs `seedWorkspace`'s init script and re-seeds; the gallery check uses the Battles nav link instead).

### Completion Notes List

- FD1: `presetFetch.ts` holds `fetchOk`, `fetchPresetManifest`, `fetchPresetText`, `PRESET_FETCH_TIMEOUT_MS` and `withPresetTimeout`; it imports nothing from `@gol/persistence`. `loadDefaultPreset` composes it with unchanged behaviour. The row passes the module-level `browserFetch`, not a wrapper, so 7.4's deferred "fetch wrapper" note is not triggered.
- FD2: `ImportWarningDialog` takes `title`/`body`/`confirmLabel`/`exportFailedText`; Import's rendered DOM is unchanged and its tests pass without edits.
- FD3/FD4: `presetMessages.ts` plus `LoadPresetRow` (fetch, validate, pristine check, warn, load after exit). `SecondaryButton` lifted into `SettingsCard.tsx`. Row wired between Import and Clear All with a `'preset'` outcome owner.
- Tests: `presetFetch`, `presetMessages`, `LoadPresetRow` (cases a to l), two new D2 cases in `DataManagement.test.tsx` (its heading-order assertion gained the new row), and `e2e/loadPreset.spec.ts` (non-pristine, Cancel, pristine, axe with dialog). The existing `settings.spec.ts` axe and console tests pass with the row in list-failure state.
- 8.2 manual smoke: covered by the e2e run against the static export (`build:standalone` output); no separate manual screenshots taken.

### File List

- apps/web/lib/workspaces/presetFetch.ts (new), presetFetch.test.ts (new)
- apps/web/lib/workspaces/presetMessages.ts (new), presetMessages.test.ts (new)
- apps/web/lib/workspaces/loadDefaultPreset.ts, loadDefaultPreset.test.ts
- apps/web/components/settings/LoadPresetRow.tsx (new), LoadPresetRow.test.tsx (new)
- apps/web/components/settings/ImportWarningDialog.tsx, ImportWorkspaceRow.tsx, SettingsCard.tsx
- apps/web/components/settings/DataManagement.tsx, DataManagement.test.tsx
- apps/web/e2e/loadPreset.spec.ts (new)
- docs/implementation-artifacts/sprint-status.yaml, 7-5-load-preset-from-settings.md

### Change Log

- 2026-09-29: Story 7.5 implemented: Load Preset row in Settings Data Management.

Dev Model: sonnet   # follows the established 5.9 Import-row flow and 7.4's fetch helpers; the surfaces 7.6 reuses (fetch module, dialog copy props) are pinned by FD1/FD2
Proposed lane gate: none
