---
baseline_commit: e3fcd0e56d26a8cdc01e3fec30c80a510cefd2c3
---

# Story 5.11: Load-Time Corruption Handling

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the app to survive corrupted stored data,
so that a bad browser state never leaves me with a broken app.

## Acceptance Criteria

Source: `epics.md#Story 5.11: Load-Time Corruption Handling` (`docs/planning-artifacts/epics.md:1467-1478`).
It is governed by:
- PRD **NFR-7.3** (`prds/prd-GameOfLife-2026-05-26/prd.md:704-705`): "validate workspace data on load and
  handle corrupted data gracefully (display error, offer to reset workspace)";
- the owner decision of 2026-09-25 (Story 5.7 review): a `NewerFormatVersionError` gets **reload only,
  never a reset** (`deferred-work.md:3425-3442`, repeated inline in the epic AC);
- **Decision F / AR-12** (settings are device-local; the reset never touches them), **AR-13 / M1 / M9**
  (the reset re-seeds Conway's Classic; there is no automatic self-heal on a plain load), **AR-11 /
  Decision I.3-I.4** (the at-rest format check and its error classes), **AR-2 / AR-27** (injected ports);
- the Story 5.10 hand-off FD4 (`deferred-work.md:3807-3825`): `resetWorkspace()` over a corrupt stamp
  deletes data and then throws — this story must deal with the stamp **before** calling it.

The epic's four ACs are split so each can be checked on its own.

1. **A graceful error instead of a crash or a generic line (NFR-7.3).** On every route, when a load-time
   read of a `gol:*` namespace fails as a whole — the key is not JSON, is not the expected shape
   (`CorruptDataError`), or the `gol:schema` stamp is unusable or newer — the page renders a
   **storage-failure notice** that says, in plain language, what happened and what the user can do.
   It replaces today's generic lines:
   - `/`: "Something went wrong loading your battles." (`BattleGallery.tsx:300`);
   - `/organisms`: "Something went wrong loading your organisms." (`OrganismLibrary.tsx:666`);
   - `/settings`: "Something went wrong loading your settings." (`SettingsPage.tsx:147`);
   - `/battle?id=`: the "Something Went Wrong / … may be damaged" body (`BattlePage.tsx:1431-1437`).
   Nothing throws past a page boundary. The copy never shows `error.message`, a stack, a storage key or a
   story ID (FD6's copy table).
2. **The recovery offered depends on what failed (FD2).** The notice classifies the error, testing
   `NewerFormatVersionError` **before** `CorruptDataError` (it is a subclass):
   - **Newer format** → the only action is **Reload**. No reset button is rendered, ever.
   - **Corrupt workspace data** (`gol:battles`, `gol:organisms`, or an unusable `gol:schema` stamp) →
     **Reset Workspace**: the reset to the default workspace (the 5.10 path, FD3/FD4).
   - **Corrupt `gol:settings`** (only `/settings` reads it strictly) → **Restore Default Settings**,
     which rewrites `gol:settings` only. No workspace reset is offered for it (FD5).
   - **Storage full** (`QuotaExceededError`, e.g. the first-run seed write) and **anything else**
     (e.g. a `SecurityError` from blocked storage) → **Reload** only, with copy that does not call the
     data damaged. No reset is offered: the data may be intact.
3. **The reset is explicit, confirmed, and complete (FR-8.5 dialog / AR-13 / Decision F).**
   - **Reset Workspace** opens Story 5.10's confirmation dialog (`ClearAllDataDialog`, FR-8.5's sentence
     verbatim, Cancel default). Nothing is written before the user confirms.
   - Confirming runs `recoverWorkspace()` (FD4): the unusable stamp is discarded first, then the 5.10
     `resetWorkspace()` runs. Afterwards the store holds zero battles, exactly `[CONWAYS_CLASSIC]`, and a
     current `gol:schema` stamp — **also when the stamp itself was the corrupt key**.
   - `gol:settings` is byte-identical before and after.
   - On success the page reloads (FD7) and renders the healthy default workspace (on `/`: the Story 1.12
     empty state). On failure the notice shows an alert that never claims nothing changed, and the user
     can retry.
   - The reset runs only after the dialog's `onTransitionExited` (the live-region rule, Story 4.18 /
     5.9 / 5.10 act-on-exit shape).
4. **Declining leaves the stored data untouched (epic AC2).** Rendering the notice writes nothing.
   Cancel, Escape and a backdrop click on the dialog write nothing. No route ever repairs, re-seeds or
   rewrites a corrupt key without an explicit user action (M9: no self-heal on a plain load).
5. **A newer-format store is never offered a destructive action, on any surface.**
   - The notice shows Reload only (AC2).
   - `recoverWorkspace()` / `discardUnreadableStamp()` **refuse** a newer stamp (throw
     `NewerFormatVersionError`, write nothing), so no future caller can reset it either.
   - `saveFailureMessage` gains a `NewerFormatVersionError` branch, tested first, telling the user to
     reload rather than "try again" (`deferred-work.md:3431-3436`).
   - `importFailureMessage` gains a plain-`CorruptDataError` branch: "your saved workspace could not be
     read; nothing was imported" (`deferred-work.md:3770-3775`).
6. **An unknown organism id falls back rather than blocking load (epic AC3).** A battle whose roster
   names an organism id the library does not hold still loads and renders everywhere: its Gallery tile
   (fallback "Unknown organism" dot), and `/battle` (the existing degraded roster, RUN disabled with its
   reason). An unknown `colorToken` falls back to the default token with a one-time warning (Decision
   I.4). These paths **already exist**; this story pins them with tests and changes no fallback
   behaviour (FD8).
7. **Integration-tested per namespace (epic AC4, AR-44).**
   - `packages/persistence`, real localStorage: `recoverWorkspace()` recovers each of `gol:battles`,
     `gol:organisms` and `gol:schema` corruption; refuses a newer `gol:schema` with every key
     byte-identical; never touches `gol:settings`.
   - `apps/web` page tests: each route's notice, per namespace, with the right action set.
   - e2e: at least one scenario per namespace against the real store (Task 7).
8. **Keyboard, axe, tokens.** Every action is a native button (or link) reachable by Tab, with a visible
   focus ring. The notice passes axe in each variant, and with the reset dialog open. Only gated
   `--gol-*` pairs (AR-46). The notice uses no heading on the gallery-branch pages (the page's `<h1>`
   stays the only one) and keeps `<NoticeTitle>` (`h1`) on `/battle`.
9. **Nothing else moves.** Unchanged: `clearAll()`'s contract, `resetWorkspace()`'s contract, the
   import pipeline, the per-record skip in `list()` / `listFull()` (FD1), `/battle`'s degraded-roster
   behaviour for a failed organism library, and every happy-path render. `npm run ci:dev` is green.

## Tasks / Subtasks

- [x] **Task 1: persistence — discard an unusable stamp, and `recoverWorkspace`** (AC: 3, 5, 7)
  - [x] 1.1 `packages/persistence/src/repositories.ts`: add one method to `AppRepositories`, with a WHY
    doc comment:
    ```ts
    /**
     * Removes the format stamp ONLY when it is unusable (not JSON, not a `{ formatVersion }` record,
     * or no integer version >= 1). A NEWER stamp is refused with `NewerFormatVersionError` and nothing
     * is written. A usable current/older stamp, or no stamp, is a no-op.
     */
    discardUnreadableStamp(): Promise<void>;
    ```
  - [x] 1.2 `localStorageAccess.ts`: implement it as an exported function beside
    `ensureCurrentAtRestFormat`. Share one "is this stamp usable, and what version?" reading with the
    format check rather than restating the rule a third time — extract a small internal helper if
    needed, and keep `ensureCurrentAtRestFormat`'s behaviour byte-for-byte (its tests must pass
    unchanged). It must **not** run a migration (no write-back side effect): it reads the stamp only.
    It never reads a collection, and never touches `gol:settings`.
  - [x] 1.3 `createLocalStorageRepositories.ts`: wire it (`async discardUnreadableStamp() { … }`).
  - [x] 1.4 `@gol/test-utils` `fakeRepositories.ts`: add the method as a documented no-op — the fake's
    stamp is a boolean, so it can never be unusable, and it has no newer-stamp seam
    (`deferred-work.md:3482-3486`). Say so in the comment. No other fake change.
  - [x] 1.5 New `packages/persistence/src/recoverWorkspace.ts`:
    ```ts
    export async function recoverWorkspace(
      workspace: Pick<AppRepositories, 'discardUnreadableStamp' | 'clearAll'>,
      organisms: Pick<OrganismRepository, 'exists' | 'save'>,
    ): Promise<void> {
      await workspace.discardUnreadableStamp();
      await resetWorkspace(workspace, organisms);
    }
    ```
    Header WHY comment: stamp **first** on the way down (the `restoreDataKeys` precedent,
    `localStorageAccess.ts` — every partial shape is then unstamped-with-data, which the next seed
    recovers, never stamped-but-empty); why `resetWorkspace` is reused unchanged (the 5.10 path, its
    FD4 contract stays); that a newer stamp throws before anything is written; retry is idempotent.
    Barrel: one block **appended at the end** of `packages/persistence/src/index.ts`, with a WHY comment.
  - [x] 1.6 Update `resetWorkspace.ts`'s header: the Story 5.11 hand-off paragraph now points at
    `recoverWorkspace()` as the caller that handles the stamp. Comment only.
  - [x] 1.7 `packages/persistence/src/recoverWorkspace.test.ts`, **real localStorage** (the
    `resetWorkspace.test.ts` / `seedDefaultWorkspace.test.ts` shape: `createLocalStorageRepositories()`,
    jsdom, `afterEach(localStorage.clear)`). One case per namespace, each seeding a non-default
    `gol:settings` **raw** and asserting it byte-identical afterwards:
    - `gol:battles` = `'{not json'`; `gol:battles` = `'[]'` (an array); `gol:organisms` = `'{not json'`;
    - `gol:schema` = `'{not json'`; `gol:schema` = `'{"formatVersion":"2"}'`; `gol:schema` = `'[]'`;
    - each ends with `battles.list()` → `[]`, `organisms.list()` → `[CONWAYS_CLASSIC]`, and a stamp that
      `readStoredValue`/`getItem` shows as `{ formatVersion: CURRENT_FORMAT_VERSION }`;
    - **newer stamp** (`{ formatVersion: CURRENT_FORMAT_VERSION + 1 }`) with data present →
      `recoverWorkspace` rejects with `NewerFormatVersionError`, and **all four** keys are byte-identical;
    - idempotent retry: a `setItem` spy throwing on the Conway write → rejects; a second call with the spy
      restored completes the recovery;
    - a healthy store is reset like 5.10's (the stamp is kept, not discarded).
  - [x] 1.8 Unit tests for `discardUnreadableStamp` beside the existing `localStorageAccess.test.ts` /
    `createLocalStorageRepositories.test.ts` cases: absent → no-op; current → no-op and byte-identical;
    each unusable shape → removed; newer → throws, byte-identical. Coverage tier is ~80% aggregate —
    do not pad.

- [x] **Task 2: expose the error objects the UI must classify** (AC: 1, 2)
  - [x] 2.1 `lib/useAsyncResource.ts`: add `error: unknown` to `AsyncResource<T>` — `undefined` except
    in `status: 'error'`, where it holds the rejection. Additive: no existing caller changes. The
    render-phase deps reset and the stale-while-revalidate `reload()` both clear it exactly as they
    clear `data`. Extend `useAsyncResource.test.tsx` for it.
  - [x] 2.2 `lib/gallery/useWorkspaceSeed.ts`: return `{ status, error }`, keeping the rejection instead
    of discarding it. This closes the still-open `deferred-work.md:45` entry ("discards the error
    object"). No console logging (the e2e asserts a clean console on the happy path).
  - [x] 2.3 `lib/battle/useBattleDraft.ts`: surface the battle resource's `error` beside its status.
  - [x] 2.4 `BattleGallery.tsx`: the reducer's `'error'` action/state carries the rejection (`error:
    unknown`), so the view can classify it.

- [x] **Task 3: classification + copy, in `apps/web/lib/storage/`** (AC: 1, 2, 5)
  - [x] 3.1 New `apps/web/lib/storage/storageFailure.ts`:
    ```ts
    export type StorageFailureKind =
      | 'newer-version' | 'corrupt-workspace' | 'corrupt-settings' | 'storage-full' | 'unavailable';
    export function classifyStorageFailure(error: unknown): StorageFailureKind;
    /** The one failure a page shows when several reads failed at once (FD2's priority). */
    export function pickStorageFailure(errors: readonly unknown[]): StorageFailureKind | null;
    ```
    Rules, in this order:
    1. `instanceof NewerFormatVersionError` → `'newer-version'` (**first** — subclass of the next);
    2. `instanceof CorruptDataError` and `error.key === STORAGE_KEYS.settings` → `'corrupt-settings'`;
    3. `instanceof CorruptDataError` (any other key) → `'corrupt-workspace'`;
    4. `instanceof QuotaExceededError` → `'storage-full'`;
    5. anything else (including a `SecurityError` `DOMException`, a non-`Error` value) → `'unavailable'`.
    Priority for `pickStorageFailure`: newer-version > corrupt-workspace > corrupt-settings >
    storage-full > unavailable; `undefined` entries are skipped. Import the classes and `STORAGE_KEYS`
    from `@gol/persistence` as values — legitimate (the `saveFailureMessage.ts` header's reasoning); never
    a repository.
  - [x] 3.2 New `apps/web/lib/storage/storageFailureMessages.ts`: FD6's copy table as constants. Plain
    strings; no story IDs, no keys, no `error.message`. None may contain "theme", "display",
    "simulation" or "auto-save" (`SettingsPage.test.tsx:347`'s dead-section regex).
  - [x] 3.3 `storageFailure.test.ts`: every rule, the subclass ordering (a `NewerFormatVersionError`
    whose `key` is `gol:schema` must never classify as corrupt), each key, a `DOMException('…',
    'SecurityError')`, a thrown string, and `pickStorageFailure`'s priority.

- [x] **Task 4: `<StorageFailureNotice>`** (AC: 1, 2, 3, 4, 8)
  - [x] 4.1 New `apps/web/components/storage/StorageFailureNotice.tsx` (a new folder: the notice is
    shared by the gallery branch and the battle branch, so neither `components/gallery/` nor
    `components/battle/` owns it). Props (FD9 — `Pick`s, never the aggregate):
    ```ts
    interface StorageFailureNoticeProps {
      kind: StorageFailureKind;
      /** Needed only to offer Reset Workspace; omit it and the action is not rendered. */
      workspace?: Pick<AppRepositories, 'discardUnreadableStamp' | 'clearAll'>;
      organisms?: Pick<OrganismRepository, 'exists' | 'save'>;
      /** Needed only to offer Restore Default Settings. */
      settings?: Pick<SettingsRepository, 'save'>;
      /** Injected for tests; defaults to `() => window.location.reload()`. */
      reload?: () => void;
    }
    ```
    It renders a `role="alert"` paragraph with the kind's explanation, then the kind's actions (AC2).
    Reset Workspace renders only for `'corrupt-workspace'` **and** when both `workspace` and `organisms`
    are given; Restore Default Settings only for `'corrupt-settings'` with `settings`. A `'newer-version'`
    notice renders Reload and nothing else, whatever ports it is given (assert it in a test).
  - [x] 4.2 The reset flow copies `ClearAllDataRow.tsx`'s shape exactly (read it first):
    `pendingRef`, `choiceRef` (first choice wins), `dialogMounted` + `next/dynamic` lazy
    `ClearAllDataDialog` (`import('@/components/settings/ClearAllDataDialog')`, `{ ssr: false }` — reuse
    the dialog, never copy it), `useInertBackground(dialogMounted)` declared above the focus-restore
    effect, act-on-exit (`onTransitionExited`), `mountedRef` with the StrictMode re-arm, and "if the
    notice unmounted while the dialog was exiting, do not run the reset".
    - Confirm → on exit: `await recoverWorkspace(workspace, organisms)` → success: `reload()` (FD7);
      failure: an in-notice `role="alert"` with `CLEAR_ALL_FAILURE_MESSAGE`'s claim shape (never
      "unchanged"), focus back on Reset Workspace.
    - Cancel / Escape / backdrop: nothing written; focus back on Reset Workspace.
  - [x] 4.3 Restore Default Settings: `await settings.save(DEFAULT_SETTINGS)` then `reload()`; on failure
    an alert that says the settings could not be restored. No dialog: it overwrites only a record that
    already cannot be read, and touches no battle or organism (FD5).
  - [x] 4.4 Buttons: tokens only — the `ExportButton` idiom (`DataManagement.tsx`) for Reload / Restore,
    the `ClearButton` danger idiom (`ClearAllDataRow.tsx`) for Reset Workspace. Focus-visible outline,
    no `transition: all`, reduced-motion guard, never `disabled`. Accessible names contain the visible
    label (the Story 5.10 D1 lesson, WCAG 2.5.3).
  - [x] 4.5 `StorageFailureNotice.test.tsx` (RTL, `@gol/test-utils` fakes, failures via `vi.fn`
    pass-through wrappers — never a hand-rolled fake): each kind's text + exact action set; newer shows
    no reset even with every port given; reset → dialog → confirm → `recoverWorkspace` ran and `reload`
    called once; the **ordering** assertion (at confirm time the reset has not run; query
    `{ hidden: true }` — the Story 5.10 review's non-vacuous shape; mutation-check it); cancel / Escape
    / backdrop write nothing (snapshot `battles.list()`/`organisms.list()`/`settings.load()` before and
    after); a rejecting `clearAll` → alert, no `reload`, retry succeeds; Restore Default Settings saves
    `DEFAULT_SETTINGS` and reloads; StrictMode; axe for each kind and with the dialog open.

- [x] **Task 5: wire the notice into every route** (AC: 1, 2, 4, 9)
  - [x] 5.1 `/` — `BattleGallery.tsx`:
    - The error branch renders `<StorageFailureNotice kind={…}>` from `pickStorageFailure([seedError,
      loadError])` instead of the generic line. Pass `workspace`/`organisms` so the reset is offered. This
      needs `workspace: Pick<AppRepositories, 'discardUnreadableStamp' | 'clearAll'>` threaded from
      `app/(gallery)/page.tsx` (it already holds `repositories`) and `seedError` from
      `useWorkspaceSeed`.
    - ⚠️ Drop `organisms.list().catch(() => [])` (`:220`): `list()` already **skips** a per-record
      failure (Story 1.4 fault isolation), so this catch only ever swallows a **whole-namespace**
      failure — exactly what AC1 says must be reported. Rewrite its comment accordingly. Keep
      `settings.load().catch(() => DEFAULT_SETTINGS)` (FD5: only `/settings` reads settings strictly).
    - Keep the `StatusText role="alert"` wrapper semantics: exactly one alert region for the failure.
  - [x] 5.2 `/organisms` — `OrganismLibrary.tsx`: the error branch renders the notice from
    `pickStorageFailure([seedError, resource.error])`; thread `workspace` from
    `app/(gallery)/organisms/page.tsx`.
  - [x] 5.3 `/settings` — `SettingsPage.tsx`: the error branch renders the notice from
    `pickStorageFailure([seedError, statsResource.error, settingsResource.error])`, passing `workspace`,
    `organisms` **and** `settings` (for Restore Default Settings). Widen `workspace` to
    `Pick<AppRepositories, 'storageUsage' | 'clearAll' | 'discardUnreadableStamp'>`. This also discharges
    `deferred-work.md:2304-2310` (one alert string for three sources): the seed-write quota case now
    reads `'storage-full'`, never "damaged". Update the `:85-89` doc comment — the rescue path it
    anticipates is this one.
  - [x] 5.4 `/battle` — `BattlePage.tsx`'s `battleStatus === 'error'` body keeps `<Notice>` +
    `<NoticeTitle>` and its one way out, but its text and action come from the classification (FD10):
    - `'newer-version'` → title "Newer Version Required", the newer copy, **Reload** (no Back link needed,
      but keeping it is fine);
    - `'corrupt-workspace'` → "Something Went Wrong", the battle-route corrupt copy, **Back to Gallery**
      (the Gallery is where the reset lives);
    - `'storage-full'` / `'unavailable'` → their copy + Back to Gallery.
    No reset button on `/battle`. Do **not** touch the degraded-roster path for a failed
    `organisms.list()` (Story 2.9 AC6/AC7): it stays a partial page, not a notice.
  - [x] 5.5 Update the page tests (`BattleGallery.test.tsx`, `OrganismLibrary.test.tsx`,
    `SettingsPage.test.tsx`, `BattlePage.test.tsx`, and the three `app/(gallery)/**/page.test.tsx` if
    they assert the old strings). Every assertion on a removed "Something went wrong loading your …"
    string moves to the notice's copy. Add, per route, one test per namespace by wrapping the relevant
    fake method to reject with a constructed error (`new CorruptDataError(STORAGE_KEYS.battles, 'x')`,
    `…organisms…`, `…schema…`, `new NewerFormatVersionError(STORAGE_KEYS.schema, 2, 1, 'x')`,
    `…settings…` on `/settings` only), asserting the kind's action set. The newer-version seam is
    "construct the class from the barrel" (`deferred-work.md:3482-3486`); add no fake seam.

- [x] **Task 6: message branches on the save and import paths** (AC: 5)
  - [x] 6.1 `lib/saveFailureMessage.ts`: a `NewerFormatVersionError` branch **before** the
    `CorruptDataError` one — e.g. "This {battle|organism} was not saved because your workspace was saved
    by a newer version of the app. Nothing already stored was changed. Reload the page to continue." It
    must not say "try again". Pin the existing `'battle'` literals unchanged
    (`saveFailureMessage.test.ts`); add tests for the new branch in both subjects.
  - [x] 6.2 `lib/import/importFailureMessage.ts`: after the existing `NewerFormatVersionError` branch, a
    plain `CorruptDataError` branch: "Your saved workspace could not be read, so nothing was imported."
    Test it (a `CorruptDataError(STORAGE_KEYS.schema, …)` from the snapshot read).

- [x] **Task 7: e2e — `apps/web/e2e/storageCorruption.spec.ts`** (AC: 1-4, 7, 8)
  - [x] 7.1 ⚠️ **Seed corruption with `page.evaluate` + `page.reload()`, never `addInitScript`.**
    `addInitScript` re-runs on **every** navigation **including a reload** — and a successful reset
    reloads the page (FD7), so an init script would re-corrupt the store and the test would prove
    nothing (the `settings.spec.ts:64-65` trap, sharper here). Pattern: `goto('/')` → `page.evaluate`
    writes the raw bad value(s) → `page.reload()` → assert.
  - [x] 7.2 Scenarios (keep them thin):
    - `gol:battles = '{not json'` on `/` → notice with Reset Workspace → dialog shows FR-8.5's sentence →
      confirm → page reloads → "Create Your First Battle" visible; `gol:organisms` holds exactly Conway's
      Classic; a raw non-default `gol:settings` is byte-identical;
    - `gol:schema = '{not json'` on `/organisms` → Reset → the Library lists exactly Conway's Classic and
      the stamp is current (the FD4 case — unreachable before this story);
    - newer stamp (`{"formatVersion": 2}` plus valid data) on `/` → notice with **Reload** and no Reset
      button (`toHaveCount(0)`); every key byte-identical; `/battle?id=<a seeded id>` shows the newer
      body;
    - `gol:settings = '{not json'` on `/settings` → Restore Default Settings → the page renders its
      sections; `gol:battles`/`gol:organisms` byte-identical;
    - **decline**: corrupt `gol:organisms`, open the dialog, Cancel → every key byte-identical;
    - axe on the notice, and with the dialog open (the three-wait pattern `deleteBattle.spec.ts` and
      Story 5.10's dialog e2e use — MUI Button's own transition trips color-contrast mid-mount).
    - Scope alert locators by text: a bare `getByRole('alert')` collides with Next's route announcer.
  - [x] 7.3 Existing specs asserting zero console errors must stay green: nothing here logs on the happy
    path.

- [x] **Task 8: records** (AC: 9)
  - [x] 8.1 `deferred-work.md`: add a "Deferred from: Story 5-11" section. Record the owner flags
    below, and re-point — never delete or rewrite — the entries this story does **not** close:
    `:121` (BattleTile `'unavailable'`), `:369` / `:371` (degraded editor copy), `:2683-2700` / `:2826-2834`
    / `:2966` / `:3213` (export over a partly-corrupt store), `:3580-3586` (pristine check skips
    corrupt records), `:3664-3667` (`savedOrganisms` overlay — this story adds no library reload on
    `/battle`, so it stays latent). Mark as discharged, with a one-line pointer, the ones it closes:
    `:45`, `:143` (the notice's Reload is the retry affordance for a load failure), `:163` (blocked
    storage is no longer reported as corrupt — `'unavailable'`), `:2304-2310`, `:2526-2531`,
    `:3425-3442` / `:3470-3486` (newer-version hand-off), `:3767-3775`, `:3807-3825` (5.10 FD4).
  - [x] 8.2 `npm run ci:dev > <scratchpad>/ci.log 2>&1; echo $?` — never piped. If `bundle:check`
    reports growth past the allowance, refresh with `npm run build:standalone && npm run bundle:baseline`
    and commit the JSON; never hand-edit `scripts/bundle-baselines.json`. The dialog is lazy; the notice
    itself ships on four routes.
  - [x] 8.3 Fill in the Dev Agent Record, including any forced decision you deviated from and why.

### Review Findings

Code review 2026-09-28 (Claude Fable 5.1, `bmad-code-review` full mode: Blind Hunter + Edge Case
Hunter + Acceptance Auditor). 2 decision-needed, 11 patch, 2 defer, 2 dismissed.

- [ ] [Review][Decision] **A rejected `battles.delete()` now renders the load-time notice, with a
  destructive control, while the delete dialog is still exiting** — Dev-record deviation 1
  (`onDeleteFailed(error)` → `dispatchLoad({ type: 'invalidate', error })`) routes a delete-time
  failure into `<StorageFailureNotice>`: a `CorruptDataError(gol:battles)` from the delete's
  read-back shows "nothing has been changed" + **Reset Workspace**; a `QuotaExceededError` on its
  write-back reads "your workspace could not be set up"; a plain `Error` reads the blocked-storage
  copy. The `:143` entry (delete succeeded, re-list rejected) is marked discharged, yet that path now
  says "nothing has been changed" right after a write that did change the store. `useDeleteBattleDialog`
  calls `onDeleteFailed(error)` right after `setDialogOpen(false)`, so the alert and its button mount
  inside the still-inert background (project-context live-region rule; recorded in `deferred-work.md`
  as pre-existing — true for the old plain alert, but this story is what puts a destructive control
  there). No test pins which copy or action a failed delete produces (the only delete-failure test
  rejects with `new Error('boom')` and asserts an alert exists). AC1 governs load-time reads, so this
  is not an AC breach — it is an owner call. Options: **(a)** keep the classified notice on the delete
  path and add a test pinning it (`CorruptDataError` → Reset Workspace; plain `Error` → Reload), and
  keep `:143` discharged; **(b)** keep classification but hold the publish until the delete dialog's
  `onExited` (the Story 4.18 queued-outcome shape) — closes the live-region gap too; **(c)** route
  delete failures to a non-destructive surface (the `'unavailable'` copy with Reload only, or the old
  generic alert) and re-open `:143`. [`apps/web/components/gallery/BattleGallery.tsx:169-171,314-323`,
  `apps/web/components/gallery/DeleteBattleDialog.tsx:295-300`]
- [ ] [Review][Decision] **The corrupt-workspace and storage-full copy over-claim the scope of the
  fault** — FD6 fixes the *claims*, so this is the owner's to change. `CORRUPT_WORKSPACE_MESSAGE`
  says "Your saved battles and organisms could not be read" whenever any one of `gol:battles`,
  `gol:organisms` or `gol:schema` fails — on `/organisms` with only `gol:battles` corrupt the
  organisms read fine, and the one action offered deletes them. `STORAGE_FULL_MESSAGE` says "so your
  workspace could not be set up", but a `QuotaExceededError` also comes from the at-rest migration
  write-back on a collection *read* and from a failed Restore Default Settings (the latter currently
  shows `RESTORE_SETTINGS_FAILURE_MESSAGE`'s "try again", which cannot succeed on a full store).
  `CorruptDataError.key` is in hand at classification time. Options: **(a)** keep FD6's table verbatim
  (the reset is whole-workspace regardless, and the sentence names what the reset deletes); **(b)**
  make the corrupt-workspace line namespace-aware ("Your saved battles could not be read…" /
  "…organisms…" / "…workspace format…") by carrying `key` through the classifier; **(c)** also give the
  storage-full and restore-failure lines cause-neutral wording ("…so the app could not write to it").
  [`apps/web/lib/storage/storageFailureMessages.ts:22-29,39-40`, `apps/web/lib/storage/storageFailure.ts:23-28`,
  `apps/web/components/storage/StorageFailureNotice.tsx:241-252`]
- [x] [Review][Patch] `recoverWorkspace.ts` header claims "never the stamped-but-empty store" for every
  branch; on a healthy stamp `resetWorkspace()` keeps it and a Conway write failing after the clear
  leaves exactly that shape (5.10's contract) [`packages/persistence/src/recoverWorkspace.ts:8-17`]
- [x] [Review][Patch] A `NewerFormatVersionError` thrown mid-recovery (stamp turned newer since the
  notice classified it) is reported as "Some data may already have been deleted — try again": nothing
  was written and no retry can succeed [`apps/web/components/storage/StorageFailureNotice.tsx:225-236`]
- [x] [Review][Patch] `reload()` sits inside the `try` after a successful recovery / restore, so a
  throwing reload reports the store as not recovered [`apps/web/components/storage/StorageFailureNotice.tsx:226-228,246-247`]
- [x] [Review][Patch] Post-await `reload()` ignores `mountedRef` (unlike every other post-await effect
  here and in `ClearAllDataRow`): navigating away during the recovery reloads whatever route the user
  is on now [`apps/web/components/storage/StorageFailureNotice.tsx:228,247`]
- [x] [Review][Patch] `NoticeButton` leaves the UA `<button>` box partly in place (`line-height:
  normal`, Safari's `margin: 0 2px`, `appearance`), so `/battle`'s Reload does not box like the
  `BackLink` it is meant to match [`apps/web/components/layout/Notice.tsx:63-71`]
- [x] [Review][Patch] The "newer" ceiling is decided twice — `discardUnreadableStamp`'s `version >
  CURRENT_FORMAT_VERSION` and `migrate`'s `found > currentVersion` — with nothing naming the coupling
  (they agree today; the floor already cites `migrate`) [`packages/persistence/src/localStorageAccess.ts:252`]
- [x] [Review][Patch] Stale comment: the retained `settings.load().catch` is justified "for the same
  reason a corrupt gol:organisms does not" blank the Gallery — the reason the rewritten comment just
  above reverses [`apps/web/components/gallery/BattleGallery.tsx:234-237`]
- [x] [Review][Patch] e2e "byte-identical" `before` maps are read *after* the page loaded and rendered
  the notice, so they prove only that the click wrote nothing, not that loading did (AC4 first
  sentence / M9); the seeded strings are in hand [`apps/web/e2e/storageCorruption.spec.ts:113,135,154`]
- [x] [Review][Patch] AC7's "right action set" is asserted loosely on `/` (`toContain('Reset
  Workspace')`) and `/organisms` (presence only); a stray Reload/Restore beside Reset would pass
  [`apps/web/components/gallery/BattleGallery.test.tsx:432`, `apps/web/components/organisms/OrganismLibrary.test.tsx:230`]
- [x] [Review][Patch] Dead attribute `data-reset-workspace=""` — nothing reads it (focus restore goes
  through `resetButtonRef`) [`apps/web/components/storage/StorageFailureNotice.tsx:262`]
- [x] [Review][Patch] Test comment narrates history ("retargeted from …") rather than why
  [`apps/web/components/gallery/BattleGallery.test.tsx:400`]
- [x] [Review][Defer] A Conway's Classic write failing after `clearAll()` over a *healthy* stamp
  leaves a stamped-but-empty store that no plain load re-seeds (M9); only the failure alert's retry
  recovers it [`packages/persistence/src/resetWorkspace.ts:38-39`] — deferred, pre-existing (Story
  5.10 FD3's contract; the story forbids changing `resetWorkspace()`)
- [x] [Review][Defer] The Gallery's `state` fold shows the notice over a battle list that loaded fine
  when only the seed failed (e.g. a `QuotaExceededError` on the first-run Conway write), and Reload
  re-runs the same seed [`apps/web/components/gallery/BattleGallery.tsx:262-270`] — deferred,
  pre-existing (the fold predates this story; the copy is new)

Dismissed (2): `/battle`'s newer-version body dropping Back to Gallery (Task 5.4 says "no Back link
needed"); Task 4.1's "omit `workspace` and the action is not rendered" vs. the Reload fallback
(documented deviation 3, non-destructive).

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: "a namespace fails" means a whole-key failure; per-record skips stay as they are.** AC1 is about
  a `gol:*` namespace failing. Today only a whole-key failure (not JSON, not an object keyed by id, an
  unusable or newer stamp) rejects a `list()`; a single unreadable record is **skipped** by `list()` /
  `listFull()` — the reviewed Story 1.4 fault-isolation stance — and `load(id)` throws for it. This story
  does not change that contract. A per-record failure keeps its existing surfaces (the Gallery tile goes
  blank, `/battle?id=` shows its corrupt body). Telling the user about skipped records is an owner flag
  below, not scope.
- **FD2: one classifier, five kinds, one priority order** (Task 3). Class-based, never message-based.
  `NewerFormatVersionError` is always tested first (`errors.ts:15-27`, the owner ruling). A page with
  several failed reads shows the highest-priority one; after a recovery reloads the page, any remaining
  failure shows next (e.g. corrupt data and corrupt settings together: reset first, then restore
  settings).
- **FD3: the reset reuses Story 5.10's dialog and composition, not new ones.** "The 5.10 path" is
  `ClearAllDataDialog` (the FR-8.5 warning + explicit confirmation) and `resetWorkspace()`. Reuse both;
  never copy either. The dialog's FR-8.5 sentence ("This will delete all battles and organisms. This
  cannot be undone.") is exactly true here.
- **FD4: a new `AppRepositories.discardUnreadableStamp()` + `recoverWorkspace()` composition.**
  ⚠️ Architecture-shaping — it widens the persistence seam.
  - **Why a seam method:** a corrupt stamp makes every collection read and write throw (the at-rest
    check runs first), and `clearAll()` deliberately keeps the stamp (Story 1.5). So `resetWorkspace()`
    over a corrupt stamp deletes the data and then throws (5.10 FD4). The stamp can be removed only by
    something that holds the store. A free function reading `localStorage` from `apps/web` would weld the
    UI to localStorage — the exact AR-2/27 break `AppRepositories.isFreshWorkspace()`'s doc comment
    describes.
  - **Why not change `clearAll()` or `resetWorkspace()`:** `clearAll()` keeping the stamp is load-bearing
    (seeding hole, Story 1.5; the import pipeline reuses it), and 5.10 FD4 fixed `resetWorkspace()`'s
    contract.
  - **Why "discard unusable only":** it cannot be misused against a newer store. It refuses one
    (`NewerFormatVersionError`, nothing written), which makes the owner's "never a reset for a newer
    format" true at the persistence layer too, not only in the UI.
  - **Why stamp-first:** see Task 1.5.
- **FD5: corrupt `gol:settings` gets "Restore Default Settings", not the workspace reset.**
  - Decision F / AR-12 make settings unreachable from the 5.10 path, so a workspace reset cannot repair
    them. Offering it would destroy every battle over a record it never touches. That is the
    `deferred-work.md:2308-2310` warning: "the rescue path does not offer to reset a settings record that
    was never the problem".
  - The restore is `settings.save(DEFAULT_SETTINGS)`, on an explicit click only. `SettingsPage.tsx:85-89`
    already reserves exactly this: never write defaults over a corrupt record *implicitly*.
  - `/` and `/battle` keep their existing read-only degrade to `DEFAULT_SETTINGS` — they only read a
    preference, and blanking the Gallery over a theme value would be worse. Only `/settings` reads
    settings strictly, so only `/settings` shows this kind.
  - A deviation in wording from the epic AC's single "reset to the default workspace" — flagged below.
- **FD6: the copy table** (`lib/storage/storageFailureMessages.ts`). Wording may be polished. The
  **claims** are fixed:
  | Kind | Text (claim) | Actions |
  |---|---|---|
  | `newer-version` | "Your saved workspace was created by a newer version of Game of Life Studio, so this version can't open it. Your data is safe — reload the page to get the latest version." | Reload |
  | `corrupt-workspace` | "Your saved battles and organisms could not be read — the stored data appears to be damaged. You can reset to the default workspace, which deletes all battles and organisms. If you'd rather try to recover the data yourself, leave it as it is: nothing has been changed." | Reset Workspace |
  | `corrupt-settings` | "Your saved preferences could not be read — the stored settings appear to be damaged. You can restore the default settings. Your battles and organisms are not affected." | Restore Default Settings |
  | `storage-full` | "Your browser's storage for this site is full, so your workspace could not be set up. Free up space for this site in your browser's settings, then reload." | Reload |
  | `unavailable` | "Your saved data could not be accessed. Your browser may be blocking storage for this site (for example, a privacy setting). Nothing was changed — check your browser's settings, then reload." | Reload |
  | `/battle`, `corrupt-workspace` | "This battle could not be loaded — its saved data is damaged. Go back to the Gallery; if it reports damaged data too, you can reset your workspace there." | Back to Gallery |
  Reset failure alert: reuse `CLEAR_ALL_FAILURE_MESSAGE` (`lib/clearAll/clearAllMessages.ts`), never
  "unchanged". "Nothing has been changed" in the corrupt-workspace row is true because rendering the
  notice writes nothing (AC4).
- **FD7: a successful recovery reloads the page (`window.location.reload()`, injected for tests).**
  - `useWorkspaceSeed`'s `hasRun` guard makes the seed run once per mount, so a seed that failed on
    corrupt data stays `'error'` after an in-place recovery. `BattleGallery`, `OrganismLibrary` and
    `SettingsPage` each own a different reload shape.
  - A reload re-runs the seed and every read from scratch, with no new retry machinery in three
    components. The reloaded, healthy page is the success confirmation (on `/`, the Story 1.12 empty
    state), so there is no success live region to lose. The e2e consequence is Task 7.1.
- **FD8: AC3 is pinned, not rebuilt.** The unknown-organism fallbacks already exist and were reviewed:
  - `resolveDisplayOrganisms` → "Unknown organism" + `DEFAULT_COLOR_TOKEN` (`lib/displayOrganisms.ts:52,111-128`);
  - `refToFillGroup`'s warn-once (`lib/canvas/refToFillGroup.ts:50-56,89-94`) and `paletteIndexOf`'s
    unknown-token warn (`lib/palette/paletteRegistry.ts:89-107`);
  - `/battle`'s degraded roster with RUN disabled (`BattlePage.tsx:732`, `OrganismRoster.tsx:639-642`),
    already e2e-covered in `battleRoute.spec.ts` (dangling Conway id).
  Add only what is missing: a Gallery test with a battle whose roster names an id absent from the library
  (the tile renders with its fallback dot, and no notice appears). Do not redesign the "N identical
  Unknown organism entries" or "Living Cells vs Population" copy (`deferred-work.md:369,371`) — those
  need design the specs do not give. Re-point them (Task 8.1).
  - ⚠️ RFC-006:102 and the decision log (`:333`) say "import remains the only path that defensively
    tolerates an unknown id", while the epic AC applies the fallback at load too. There is no conflict in
    code — the render-time fallbacks serve both — so nothing to pick; just don't remove one because the
    RFC sentence suggests it is import-only.
- **FD9: `Pick` props, never the aggregate** (the Story 5.2 FD7 house rule). `createRepositories()`
  stays at the four page boundaries. `recoverWorkspace` and `DEFAULT_SETTINGS` are imported as values: a
  pure composition over injected ports, and a domain constant.
- **FD10: `/battle` classifies but never resets.** `useWorkspaceSeed` is not mounted there
  (`BattlePage.tsx:622-626`), and a per-record corrupt battle and a whole-key one both surface as
  `CorruptDataError(STORAGE_KEYS.battles)` — indistinguishable by class or key. So `/battle` routes to
  the Gallery, which can tell (its `list()` rejects only on a whole-key failure) and holds the reset.

### What exists: read these before writing a line

- `packages/persistence/src/errors.ts`: `CorruptDataError` (`key`), `NewerFormatVersionError`
  (subclass; `foundVersion`/`supportedVersion`), the doc comment's "a reset offer must test the subclass
  FIRST".
- `packages/persistence/src/localStorageAccess.ts`: `STORAGE_KEYS`, `readStoredValue`,
  `readRawCollection`, `ensureCurrentAtRestFormat` (runs on every collection read **and** every data
  write, stateless), `stampSchemaVersion` (writes only an absent stamp), `hasSchemaStamp`,
  `removeDataKeys`, `restoreDataKeys` ("stamp first on the way down"). The seeding-hole comment on
  `stampSchemaVersion` is why the stamp is removed, never overwritten with a guessed version.
- `packages/persistence/src/resetWorkspace.ts` (the 5.10 path + its FD4 hand-off),
  `ensureDefaultOrganism.ts`, `seedDefaultWorkspace.ts` (fresh-gated — a stamp-less store after
  `discardUnreadableStamp` is "fresh", which is fine because `resetWorkspace` calls
  `ensureDefaultOrganism` directly).
- `packages/persistence/src/repositories.ts`: `AppRepositories` and its doc-comment conventions.
- `packages/test-utils/src/fakeRepositories.ts`: `FakeSeed` (`raw` bypasses validation; per-record only),
  `stamped` boolean, fake `clearAll` / `isFreshWorkspace` / snapshot pair. It cannot produce a whole-key
  failure, a newer stamp, or a quota error: wrap methods with `vi.fn` in the test file.
- `apps/web/lib/useAsyncResource.ts` (read the whole header — the deps-shape precondition),
  `lib/gallery/useWorkspaceSeed.ts` (the `mounted` ref vs closure-flag reasoning),
  `lib/battle/useBattleDraft.ts`.
- `apps/web/components/gallery/BattleGallery.tsx:205-253,290-300`, `components/organisms/
  OrganismLibrary.tsx:279-287,565-568,664-667`, `components/settings/SettingsPage.tsx:85-150`,
  `components/battle/BattlePage.tsx:329-362,1406-1447`.
- `apps/web/components/settings/ClearAllDataRow.tsx` + `ClearAllDataDialog.tsx`: the act-on-exit flow and
  the dialog to reuse. `lib/clearAll/clearAllMessages.ts`.
- `apps/web/components/layout/Notice.tsx` (`Notice`, `NoticeTitle` = `h1`, `NoticeText`, `BackLink`).
- `apps/web/lib/saveFailureMessage.ts`, `lib/import/importFailureMessage.ts` (already tests the subclass
  first — the precedent).
- `apps/web/lib/useInertBackground.ts`; project-context's live-region rule.

### Architecture compliance

- **NFR-7.3**: error shown + reset offered; **the owner ruling**: newer → reload only.
- **AR-2 / AR-27**: `Pick`s at every boundary; the one new capability is a seam method, not a free
  localStorage function.
- **AR-11 / Decision I.3-I.4**: the at-rest check is unchanged; `discardUnreadableStamp` never migrates.
- **AR-12 / Decision F**: settings survive the reset (real-localStorage test); the settings restore is a
  separate, explicit action.
- **AR-13 / M1 / M9**: recovery re-seeds Conway's Classic via the 5.10 path; nothing self-heals without
  a click.
- **AR-35**: the dialog stays lazy (`next/dynamic`), MUI per-component imports.
- **AR-44**: per-namespace integration tests against real localStorage.
- **AR-46**: `--gol-*` tokens only; danger pairs as gated in `themeTokens.test.ts`.
- **No DOM types in `packages/*`**: the persistence changes sit behind `packages/persistence`'s own
  `DOM` lib, as today; `recoverWorkspace` touches ports only.
- **Spec-ID citations** must resolve under `npm run spec:check`. Write them exactly: `NFR-7.3`,
  `FR-8.5`, `AR-2`, `AR-11`, `AR-12`, `AR-13`, `AR-27`, `AR-35`, `AR-44`, `AR-46`, `M1`, `M9`,
  `Decision F`, `Decision I`, `RFC-006`, `Story 1.4`, `Story 1.5`, `Story 5.7`, `Story 5.10`,
  `Story 5.11`.

### Library / framework notes

- No new dependency. React 19, MUI v9.3.1 (`Dialog` via the reused 5.10 component). MUI v9 has no
  `disableEscapeKeyDown`; Escape routes through `onClose`, which maps to Cancel.
- `window.location.reload()` is fine in `apps/web` (a client component). `BattlePage.tsx`'s "never
  `window.location`" warning is about **navigation**, not reload.
- No web research needed: every API this story touches is in-repo.

### Testing standards

- `packages/persistence`: ~80% aggregate, carried by the real-localStorage tests. `apps/web`: no gate —
  test the branches that carry a claim; never pad.
- `@gol/test-utils` fakes only; failures via `vi.fn` pass-through wrappers in the test file.
- Prove "nothing was written" by comparing raw `localStorage.getItem` strings (e2e) or before/after
  repository reads (RTL).
- `npm run ci:dev` is the local gate — redirect to a file, `echo $?`, never pipe; never the four-browser
  `npm run ci`.
- Known flake: coverage-run CPU contention in `OrganismLibrary.test.tsx` / `OrganismEditorModal.test.tsx`
  / `BattlePage.*.test.tsx` under `ci:dev` (Story 5.9, 5.10). Re-run those files in isolation, record it,
  don't chase it.

### Previous story intelligence

- **Story 5.10 (done, #91):** `resetWorkspace`, `ClearAllDataDialog`, the act-on-exit row, and review
  lessons to pre-empt:
  - make the ordering test non-vacuous: query `{ hidden: true }` because MUI `aria-hidden`s the
    background, and mutation-check it;
  - a "second click is a no-op" test must click during the exit, or it passes without the guard;
  - the accessible name must contain the visible label (D1);
  - `<SettingsPage>` swaps its whole content for the error state when a reload rejects. Here that is
    wanted: the notice **is** the error state.
- **Story 5.9 (done):** don't run a write if the component unmounted mid-flow; hold focus restore until
  the outcome is published; a bare `getByRole('alert')` hits Next's route announcer.
- **Story 5.7 (done):** `NewerFormatVersionError`, the stateless at-rest check, and the owner ruling this
  story implements.
- **Story 2.9 (done):** `/battle`'s organism library is its own resource, and its failure is a
  degraded page, not a notice. Preserve it.
- **Story 1.4 (done):** per-record skip in `list()`, `load()` throws for a bad record. Preserve both.

### Git intelligence

`main` is at `e3fcd0e` (#92: Epic 7 planning docs only), after `a7f17d6` (#91, Story 5.10). All Epic 4
stories are done, so there is no lane gate. This story touches `packages/persistence` (a seam method, a
composition, tests), one `@gol/test-utils` method, `apps/web/lib/{useAsyncResource,gallery,battle,
storage,import}`, `saveFailureMessage.ts`, the four route components and their page boundaries, and a
new e2e spec. Epic 7 (backlog, next after Epic 5) will touch `useWorkspaceSeed` and `/settings` —
Story 7.4 (first-visit preset auto-load) and 7.5 (load preset from Settings). They will build on this
story's `{ status, error }` seed shape and the notice, so keep both small and documented.

### Project Structure Notes

- New:
  - `packages/persistence/src/recoverWorkspace.ts` + `.test.ts`;
  - `apps/web/lib/storage/storageFailure.ts` + `.test.ts`, `storageFailureMessages.ts`;
  - `apps/web/components/storage/StorageFailureNotice.tsx` + `.test.tsx`;
  - `apps/web/e2e/storageCorruption.spec.ts`.
- Modified:
  - `packages/persistence/src/{repositories,localStorageAccess,createLocalStorageRepositories,index,
    resetWorkspace}.ts` + the matching tests;
  - `packages/test-utils/src/fakeRepositories.ts` (one no-op method);
  - `apps/web/lib/{useAsyncResource,gallery/useWorkspaceSeed,battle/useBattleDraft,saveFailureMessage,
    import/importFailureMessage}.ts` + tests;
  - `apps/web/components/{gallery/BattleGallery,organisms/OrganismLibrary,settings/SettingsPage,
    battle/BattlePage}.tsx` + tests;
  - `apps/web/app/(gallery)/{page,organisms/page}.tsx` (thread `workspace`; `settings/page.tsx` already
    passes the aggregate).
- Docs: `deferred-work.md`, `sprint-status.yaml`. `scripts/bundle-baselines.json` only through the tool.
- Untouched on purpose: `clearAll()`'s implementations, `resetWorkspace()`'s body, `seedDefaultWorkspace`,
  `workspaceImport.ts`, `ensureCurrentAtRestFormat`'s behaviour, `BattleTile.tsx`, `OrganismRoster.tsx`,
  every `package.json`.

### What NOT to build

- ❌ Any reset, discard or re-seed that runs without an explicit click (M9 — no self-heal on load).
- ❌ A reset button for `'newer-version'`, `'storage-full'` or `'unavailable'`, on any route.
- ❌ Overwriting a corrupt stamp with a guessed version: remove it (FD4 / the seeding-hole comment).
- ❌ A root `error.tsx` / `global-error.tsx` / React error boundary: every failure here is a rejected
  promise already caught at a page boundary, and Next's `GlobalError` renders outside the themed root
  (project-context "Token layer shape").
- ❌ A Context or global store for the failure state (project-context: no global store).
- ❌ Changing `list()` / `listFull()` to throw on a bad record, or counting skipped records (FD1 → flag).
- ❌ A second copy of `ClearAllDataDialog` or of `resetWorkspace`'s body.
- ❌ An Export First offer on the notice: export reads through the same failing collection
  (`exportWorkspace()` rejects on a whole-key failure) — there is nothing it could export.
- ❌ Logging on the happy path (e2e zero-console-error assertions).

### Open flags for the owner (not blockers: the story proceeds on the FDs)

- **FD4 widens `AppRepositories`** (one method, mirrored as a no-op in the fake). It is the only
  AR-2-clean way to make the reset work over a corrupt stamp. Rejecting it means either a corrupt stamp
  gets no reset offer (AC2 fails for that namespace), or `clearAll()` / `resetWorkspace()` change their
  contracts.
- **FD5: corrupt settings get "Restore Default Settings", not "the 5.10 path".** The epic AC names one
  recovery for every namespace. For `gol:settings` that recovery cannot work by construction (Decision F),
  and offering it would destroy data unrelated to the fault.
- **FD1: per-record corruption stays silent at the list level.** Four deferred entries (export
  silently omitting unreadable records — and, for a skipped organism, producing a file import then
  rejects; the pristine check miscounting; BattleTile's `'unavailable'`) wait on a user-facing "N records
  could not be read" design. It needs a repository contract change (skipped counts). Recommend a
  follow-up story; re-pointed in `deferred-work.md`, not solved here.
- **FD7: success is shown by the reloaded page, with no success message.** FR-8.5's "display success
  confirmation" governs Clear All on `/settings` (still true there). The notice's reset is a recovery,
  and the empty Gallery it lands on is its confirmation.

### References

- `docs/planning-artifacts/epics.md:1467-1478` (5.11), `:1454-1465` (5.10), `:152` (NFR-7.3 summary),
  `:178-181` (AR-11 – AR-14).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:704-705` (NFR-7.3).
- `docs/planning-artifacts/architecture.md:247` (F.2), `:286-287` (I.3, I.4), `:347` (M1), `:355` (M9).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md:102,161,179,183,262-271`;
  `RFC-004-simulation-rules-engine.md:591,597-598`; `RFC-007-organism-colour-palette.md:73`.
- `docs/implementation-artifacts/deferred-work.md`: `:45`, `:121`, `:143`, `:163`, `:369`, `:371`,
  `:2304-2310`, `:2526-2531`, `:2683-2700`, `:2826-2834`, `:2966`, `:3213`, `:3413-3442`,
  `:3470-3486`, `:3580-3586`, `:3664-3667`, `:3767-3775`, `:3807-3825`.
- `docs/implementation-artifacts/5-10-clear-all-data.md` (FD1, FD3, FD4, review findings).
- `docs/project-context.md`: injected repositories; no global store; live-region rule; `clearAll()` never
  touches settings; coverage tiers; `ci:dev` never piped; bundle growth ratchet.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), via `bmad-dev-story` under `implement-next-story` (lane epic-5).

### Debug Log References

- `npm run ci:dev > <scratchpad>/ci.log 2>&1; echo $?` → **0**. typecheck, lint, format:check,
  spec:check, boundary:check, coverage (`apps/web` all files 96.84% stmts; persistence floor held),
  build, bundle:check (every route within the 8 KB allowance: `/` +3.0, `/battle` +4.2,
  `/battle/new` +4.2, `/organisms` +3.6, `/settings` +5.4 KB gzip), bench + bench:check (7.568 ms
  headroom, 45.4% of the frame), e2e Chromium **313 passed**.
- Baseline refreshed through the tool after the green run (`npm run bundle:baseline`; the
  `build:standalone` it needs had just run inside `ci:dev`) — project-context's growth ratchet:
  growth is baselined in the PR that moved it, never left to accumulate.
- New e2e spec run alone first: `playwright test --project=chromium e2e/storageCorruption.spec.ts`
  → 6 passed.
- Mutation check of the notice's ordering tests: running `recoverWorkspace` from the confirm handler
  (instead of on exit) turned both the success-ordering and failure-ordering tests red; restored.
- No flake hit this run (the known coverage-contention files passed in the full run).
- Review 2026-09-28: `npm run ci:dev` → **0** on the dev commit (e2e Chromium 313 passed). On the
  patched tree the first run hit the known coverage-run contention flake — five 5 s test timeouts
  in files the review did not touch (`BattlePage.export`, `OrganismLibrary` 4.21 guard,
  `BattleSimulationView`, `ColorPickerField`, `OrganismEditorModal`); all 323 tests in those five
  files pass in isolation. Second full `npm run ci:dev` on the patched tree → **0** (web 149 test
  files green, e2e Chromium 313 passed, bundle within baseline — no refresh needed).

### Completion Notes List

- **Task 1 (persistence).** `AppRepositories.discardUnreadableStamp()` (WHY doc comment) +
  `localStorageAccess.discardUnreadableStamp()`: removes an unusable stamp, refuses a newer one with
  `NewerFormatVersionError` (nothing written), no-op on absent/current; reads the stamp only — no
  migration, no collection read, never settings; a storage-access error (e.g. `SecurityError`) is
  rethrown, not treated as "unusable". Shared reading: `readStampRecord()` (record shape) is now used
  by both `ensureCurrentAtRestFormat` and the discard, and `isUsableFormatVersion()` by both
  `asFormatVersion` and the discard — `ensureCurrentAtRestFormat`'s existing tests pass unchanged.
  `recoverWorkspace()` (stamp first, then `resetWorkspace` unchanged) + barrel block appended at the
  end. `resetWorkspace.ts` header re-pointed (comment only). Fake: documented no-op. Real-localStorage
  tests: every namespace (battles not-JSON / array, organisms not-JSON, schema not-JSON / string
  version / array) with raw settings byte-identical; newer stamp refused with all four keys
  byte-identical; idempotent retry; healthy store keeps its stamp. Unit tests for the discard in
  `localStorageAccess.test.ts` + seam wiring in `createLocalStorageRepositories.test.ts`.
- **Task 2.** `useAsyncResource` gains `error` (cleared on deps change and on a settling reload,
  tested); `useWorkspaceSeed` returns `{ status, error }` (no logging); `useBattleDraft` surfaces
  `error`; `BattleGallery`'s reducer carries the rejection on `'error'` and `'invalidate'`.
- **Task 3.** `lib/storage/storageFailure.ts` (classifier, newer tested first; `pickStorageFailure`
  priority) + `storageFailureMessages.ts` (FD6 table verbatim, plus the restore-failure line) + tests
  (every rule, subclass ordering, each key, `SecurityError`, a thrown string, priority, and a copy
  guard against keys / story IDs / the `/settings` dead-section words).
- **Task 4.** `components/storage/StorageFailureNotice.tsx`: `role="alert"` explanation + the kind's
  action; `ClearAllDataRow`'s act-on-exit shape (pendingRef, first-choice-wins, lazy reused
  `ClearAllDataDialog`, `useInertBackground` above the focus-restore effect, StrictMode-re-armed
  mountedRef, no reset if unmounted mid-exit); success → `reload()`; failure →
  `CLEAR_ALL_FAILURE_MESSAGE` alert + focus back on Reset Workspace; Restore Default Settings saves
  `DEFAULT_SETTINGS` then reloads. 27 RTL tests incl. ordering (mutation-checked), decline ×3,
  retry, exit-time double click, StrictMode, Tab reach, axe per kind + dialog open.
- **Task 5.** Notice wired into `/`, `/organisms`, `/settings` (widened `workspace` Pick;
  `seedError` threaded from each page boundary); `/battle` classifies (FD10): newer → "Newer Version
  Required" + Reload; corrupt → battle copy + Back to Gallery; storage-full / unavailable → their
  copy + Back. The Gallery's `organisms.list().catch(() => [])` is dropped (comment rewritten); the
  settings degrade is kept. Per-route, per-namespace tests added; old-string assertions moved.
  FD8's missing test added (Gallery tile with a roster id the library lacks → fallback dot, no notice).
- **Task 6.** `saveFailureMessage` newer branch before the corrupt one (both subjects; never "try
  again"; the battle literals unchanged). `importFailureMessage` plain-`CorruptDataError` branch.
- **Task 7.** `e2e/storageCorruption.spec.ts`, `page.evaluate` + `page.reload()` only: battles on
  `/` (reset → empty Gallery, Conway alone, settings byte-identical); unusable stamp on `/organisms`
  (reset → Conway alone, stamp current); newer stamp on `/` (Reload, no Reset, byte-identical) and
  on `/battle?id=` (newer body); settings on `/settings` (restore → sections render, data
  byte-identical); decline (every key byte-identical, focus back); axe on the notice and with the
  dialog open (three-wait pattern).
- **Task 8.** `deferred-work.md`: discharge / re-point lines appended to every entry the story names
  (none deleted or rewritten) + a "Deferred from: Story 5-11" section with the owner flags.

**Deviations from the story text (each small, each forced by the code):**

1. **`DeleteBattleDialog`'s `onDeleteFailed()` now receives the rejection (`onDeleteFailed(error)`).**
   Task 2.4 makes the reducer's error state carry the rejection; the Gallery's other entry into that
   state — `'invalidate'` from a failed delete — had no error to carry without it. Additive; no other
   caller. Its pre-existing live-region timing (published while the delete dialog exits) is recorded
   in the new deferred section, not fixed.
2. **`components/layout/Notice.tsx` gains `NoticeButton`** (the `BackLink` style as a `<button>`) for
   `/battle`'s Reload — a reload is not a navigation, so a link would be the wrong element. The
   shared style object is now `WAY_OUT_STYLE`; `BackLink` renders identically.
3. **Fallbacks so the notice always has a way out:** a kind whose recovery port was not given renders
   Reload (never nothing), and a failure with no classifiable rejection (e.g. a delete-failure or seed
   error with no value) renders `'unavailable'` (`pickStorageFailure(...) ?? 'unavailable'`). A
   `'newer-version'` can never reach either recovery branch.
4. **Accent button text is `--gol-on-accent`, not `ExportButton`'s `--gol-bg-primary`** — the same
   value today, but `on-accent` is the pair `themeTokens.test.ts` gates (AR-46).
5. **`/battle`'s notice text keeps no `role="alert"`**, as before — the task asked only for the
   classified text and action; adding a live region to a terminal body was not asked for.
6. **`BattleGallery` / `OrganismLibrary` take `workspace` as a required prop** (the page boundary
   always passes it); their test files were updated mechanically (`workspace={repos}` /
   `...store`). Two existing tests were retargeted rather than deleted: the Gallery's "still renders
   tiles when organisms.list() rejects" (the dropped catch — now a per-namespace notice test) and
   `importFailureMessage`'s "plain CorruptDataError falls to the fallback" (now its own branch).
7. **Bundle baseline refreshed** although within the allowance — project-context's ratchet rule
   (growth is baselined in the PR that moved it); tool-written, not hand-edited.

### File List

New:
- `packages/persistence/src/recoverWorkspace.ts`
- `packages/persistence/src/recoverWorkspace.test.ts`
- `apps/web/lib/storage/storageFailure.ts`
- `apps/web/lib/storage/storageFailure.test.ts`
- `apps/web/lib/storage/storageFailureMessages.ts`
- `apps/web/components/storage/StorageFailureNotice.tsx`
- `apps/web/components/storage/StorageFailureNotice.test.tsx`
- `apps/web/e2e/storageCorruption.spec.ts`

Modified:
- `packages/persistence/src/repositories.ts`
- `packages/persistence/src/localStorageAccess.ts`
- `packages/persistence/src/localStorageAccess.test.ts`
- `packages/persistence/src/createLocalStorageRepositories.ts`
- `packages/persistence/src/createLocalStorageRepositories.test.ts`
- `packages/persistence/src/resetWorkspace.ts`
- `packages/persistence/src/index.ts`
- `packages/test-utils/src/fakeRepositories.ts`
- `apps/web/lib/useAsyncResource.ts`
- `apps/web/lib/useAsyncResource.test.tsx`
- `apps/web/lib/gallery/useWorkspaceSeed.ts`
- `apps/web/lib/battle/useBattleDraft.ts`
- `apps/web/lib/saveFailureMessage.ts`
- `apps/web/lib/saveFailureMessage.test.ts`
- `apps/web/lib/import/importFailureMessage.ts`
- `apps/web/lib/import/importFailureMessage.test.ts`
- `apps/web/components/gallery/BattleGallery.tsx`
- `apps/web/components/gallery/BattleGallery.test.tsx`
- `apps/web/components/gallery/BattleGallery.gridLines.test.tsx`
- `apps/web/components/gallery/DeleteBattleDialog.tsx`
- `apps/web/components/organisms/OrganismLibrary.tsx`
- `apps/web/components/organisms/OrganismLibrary.test.tsx`
- `apps/web/components/settings/SettingsPage.tsx`
- `apps/web/components/settings/SettingsPage.test.tsx`
- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/layout/Notice.tsx`
- `apps/web/app/(gallery)/page.tsx`
- `apps/web/app/(gallery)/organisms/page.tsx`
- `apps/web/app/(gallery)/settings/page.tsx`
- `apps/web/app/not-found.test.tsx` (comment only: the quoted battle-route copy)
- `scripts/bundle-baselines.json` (tool-written)
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/5-11-load-time-corruption-handling.md`

### Change Log

- 2026-09-28 — Story 5.11 implemented: `discardUnreadableStamp` seam + `recoverWorkspace`; the
  storage-failure classifier, copy and notice on every route; newer-version branches on save and
  import; per-namespace unit, integration and e2e tests; deferred-work records. Status → review.
- 2026-09-28 — Code review (Fable 5.1): 11 patches applied (newer-mid-recovery copy, reload outside
  the try and mount-gated, `NoticeButton` UA resets, e2e byte-identity against the seeded strings,
  exact action-set assertions, comment corrections, dead attribute); 2 deferred to `deferred-work.md`;
  2 decisions left for the owner under Review Findings. Status → in-progress.

Dev Model: opus   # architecture-shaping: widens the AppRepositories seam (discardUnreadableStamp) and sets the app-wide storage-failure classification + notice pattern every route and Epic 7 build on
Proposed lane gate: none
