---
baseline_commit: 10947c504375c875ef9debb5e7b4e1e0de381ac5
---

# Story 5.9: Import UI & Destructive Warning

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want clear warnings before import replaces my workspace,
so that I never lose data I meant to keep.

## Acceptance Criteria

Source: `epics.md#Story 5.9: Import UI & Destructive Warning` (`docs/planning-artifacts/epics.md:1421-1432`).
It is governed by:
- PRD **FR-8.4** (`prd.md:507-517`): the warning text, the three actions, Cancel as the default,
  and the "unmodified default" predicate;
- **FR-1.5** (`prd.md:141-145`): the seeded Conway's Classic baseline;
- architecture **M8** (`architecture.md:354`) and **Decision F**;
- RFC-006 **Decision 5** (`RFC-006-persistence-workspace-schema.md:246`).

The ACs are split here so a reviewer can check each one on its own.

1. **One Import row, one picker (FR-8.4).** The Data Management card gains an **Import** row
   below Export. It follows the mockup: `settings.html:405-418`, label "Import", the description,
   and a secondary-styled button. Clicking the button opens **one** native file picker, filtered to
   `.json` (`accept=".json,application/json"`). The same picker accepts both a
   `kind: 'workspace'` and a `kind: 'battle'` export. Nothing branches on `kind` except the
   warning's wording (M8).
2. **The file is validated before anything is asked or written.** The picked file is read as text
   and passed to `validateImportFile` (`@gol/persistence`, Story 5.8's pure half). A rejection
   shows the AC6 error, shows **no** warning, and writes nothing. The picker's `value` is reset
   after every pick, so picking the same file again fires again.
3. **Mandatory warning for a non-pristine workspace (FR-8.4 / M8).** A valid file over a
   non-pristine workspace (AC4) opens a modal warning dialog **before any write**. The dialog:
   - names the kind being imported, following FR-8.4: "Importing this battle will replace your
     entire current workspace — all current battles and organisms will be lost. Export your current
     workspace first?" (it reads "this workspace" for `kind: 'workspace'`);
   - offers exactly three actions: **Cancel**, **Export Current Workspace First** and **Import
     Anyway**;
   - makes Cancel the default: it is `autoFocus`, first in DOM order, and Escape and a backdrop
     click both map to it. Cancel changes nothing.
4. **Pristine means "nothing to lose" (FR-8.4 / FR-1.5).** The warning is suppressed, and the
   import runs directly, **only** when both of these hold:
   - `battles.list()` is empty;
   - `organisms.list()` is exactly one organism, deep-equal to `CONWAYS_CLASSIC`.

   Deep-equal covers every field: name, colour, Dominance, the aging toggle and rules. A Conway's
   Classic edited in **any** field is user data. The check is read fresh at file-pick time, never
   from the page's cached statistics. If a read throws, the workspace counts as **not** pristine,
   so the warning shows. When in doubt, warn.
5. **Export Current Workspace First "then returns to this prompt" (FR-8.4).** The action runs the
   existing Story 5.5 seam (`exportWorkspaceToFile`). The dialog stays open, and focus stays on the
   button. On success, the dialog shows a short confirmation inside itself: the current workspace
   was downloaded. On failure, it shows an alert inside itself saying that nothing was exported and
   nothing was imported. In neither case does the import start. The user still chooses Import
   Anyway or Cancel.
6. **Outcome feedback (FR-8.4).**
   - **Success:** the card shows a confirmation as a `role="status"` message. It is built from
     `ImportSummary`, for example "Import complete — your workspace now has 3 battles and 5
     organisms." Workspace Statistics refreshes to the new counts (`statsResource.reload()`).
   - **Failure:** the card shows a specific, non-technical `role="alert"` message per the FD4
     table. It never shows `error.message`, a stack, or a Zod path. "Your workspace was not changed"
     appears **only** where it is provably true. It must never appear for
     `'rollback-failed'`, the one outcome where it is false (Story 5.8 FD5).
7. **No outcome is lost to the inert background.** A success or failure message that follows the
   dialog is published **after the dialog has fully exited** (project-context's live-region rule,
   and the Story 4.18 / 5.6 act-on-exit shape). The dialog records the choice. The import runs,
   and its outcome is inserted, only once `onTransitionExited` has fired. Focus then returns to the
   Import button.
8. **Keyboard and axe.** The whole flow works from the keyboard: Tab reaches Import, Enter/Space
   opens the picker, the dialog traps focus, and Escape cancels. It passes axe with the card
   idle, with the dialog open, and with each outcome message shown.
9. **Nothing else moves.** Unchanged:
   - `@gol/persistence`'s import pipeline, `ImportError` and `AppRepositories`;
   - `WorkspaceExportSchema`;
   - the Export row's behaviour.

   `gol:settings` is untouched by every path. This holds by construction (Decision F): nothing in
   the new UI references the settings repository. `npm run ci:dev` is green.

## Tasks / Subtasks

- [x] **Task 1: `isPristineWorkspace` in `@gol/domain`** (AC: 4)
  - [x] 1.1 Add a new file, `packages/domain/src/pristineWorkspace.ts` (camelCase, never dotted).
    It exports `isPristineWorkspace(battleCount: number, organisms: readonly Organism[]): boolean`,
    which is true iff `battleCount === 0 && organisms.length === 1` and `organisms[0]` is
    structurally equal to `CONWAYS_CLASSIC`.
    - Equality is a private, key-order-**insensitive** deep comparison over plain JSON values:
      objects, arrays in order, and primitives.
    - Do **not** compare `JSON.stringify` outputs. Key order out of a Zod parse or a hand-edited
      store is not a contract.
    - Do not add a dependency (lodash etc.).
  - [x] 1.2 Write a header WHY comment covering:
    - FR-8.4's "unmodified" means deep-equal to the FR-1.5 seed;
    - rules count, including `id` and `contentHash`. A rule deleted and re-added is not the seed;
    - it lives in domain because it is a workspace-integrity predicate (project-context: "pure
      logic in `packages/domain`").
  - [x] 1.3 Add `pristineWorkspace.test.ts`, under the ≥90% per-file gate. It covers:
    - the seed alone is pristine;
    - a deep copy of it, with keys reordered, is pristine;
    - one battle is not pristine;
    - a second organism is not pristine;
    - zero organisms is not pristine. This is not "fresh", because FR-8.4's wording requires
      Conway's Classic present and unmodified;
    - each editable field changed alone is not pristine: name, `colorToken`, `dominance`,
      `agingEnabled`, one rule's summary, a condition's pattern, rule order;
    - a same-id organism with an extra rule is not pristine.
  - [x] 1.4 Barrel: append **one contiguous block at the end** of `packages/domain/src/index.ts`,
    so the two-lane sync's `[[sync.rules]]` resolves the barrel mechanically. Give it a WHY comment.

- [x] **Task 2: the copy, in `apps/web/lib/import/`** (AC: 3, 6)
  - [x] 2.1 Add a new file, `apps/web/lib/import/importFailureMessage.ts`. It exports
    `importFailureMessage(error: unknown): string` per the FD4 table. Rules:
    - branch on `instanceof ImportError` and its `code`;
    - for `'write-failed'`, test `error.cause instanceof QuotaExceededError`;
    - test `NewerFormatVersionError` **before** `CorruptDataError`, because the former is a
      subclass (Story 5.7);
    - there is one fallback branch.

    The file's header WHY comment explains that the "not changed" claim is a property of
    `applyImport`: every non-`ImportError` rejection is thrown before its first write. That is why
    the fallback may say it.
  - [x] 2.2 In the same folder, add `importWarningText(kind: ExportKind): string`, the FR-8.4
    sentence from AC3, and `importSuccessMessage(summary: ImportSummary): string`. The success
    message pluralises correctly, including "1 battle" and "0 battles".
  - [x] 2.3 Add `importFailureMessage.test.ts` / `importMessages.test.ts`. They cover:
    - every code;
    - the quota cause;
    - `NewerFormatVersionError` versus plain `CorruptDataError` ordering;
    - a non-Error rejection;
    - that the `'rollback-failed'` string does **not** contain "not changed" / "unchanged";
    - that no message contains a Story ID, a Zod path, or `error.message`. Assert this by building
      each error with a sentinel `detail` and checking that it is absent.

- [x] **Task 3: `<ImportWarningDialog>`** (AC: 3, 5, 8)
  - [x] 3.1 Add a new file, `apps/web/components/settings/ImportWarningDialog.tsx`. It is
    presentational and copies `ExportBattleDialog.tsx`'s idiom (copy the shape, never import):
    - per-component MUI imports;
    - `PAPER_MAX_WIDTH = '440px'` and `BUTTON_SX`;
    - `disableRestoreFocus`, `onTransitionExited={onExited}`, `aria-labelledby` /
      `aria-describedby`.

    Props: `open`, `kind: ExportKind`, `exportState: 'idle' | 'exported' | 'failed'`, `onCancel`,
    `onExportFirst`, `onImportAnyway`, `onExited`.
  - [x] 3.2 Title: "Replace Your Workspace?" Body: `importWarningText(kind)`. Buttons in DOM order:
    - **Cancel**: `autoFocus`, `variant="outlined"`, `color="inherit"`;
    - **Export Current Workspace First**: `text`;
    - **Import Anyway**: `variant="contained" color="error"`. It is the only destructive control.
    No button self-disables (the Story 5.5 FD8 focus trap).
  - [x] 3.3 The export-first feedback renders inside `DialogContent`. It is not the dialog's
    `aria-describedby` target:
    - `exported`: `role="status"`, "Your current workspace was downloaded.";
    - `failed`: `role="alert"`, "Your current workspace could not be exported. Nothing was imported."

    It is safe to insert here, because the dialog's own subtree is the one part of the page that
    is **not** inert.
  - [x] 3.4 Reach it through `next/dynamic(() => import('./ImportWarningDialog'), { ssr: false })`
    from its caller (AR-35). `/settings` has no MUI `Dialog` in its first load today, and this
    dialog is rarely shown. `/battle`'s three lazy dialogs are the precedent.

- [x] **Task 4: the Import row and its flow** (AC: 1-8)
  - [x] 4.1 Add a new file, `apps/web/components/settings/ImportWorkspaceRow.tsx`. It is not
    folded into `DataManagement.tsx`, which Story 5.10 is about to grow with Clear All. It holds:
    - the row markup (reuse `DataManagement.tsx`'s `Row`/`RowInfo`/`RowLabel`/`RowDescription` by
      moving them to `SettingsCard.tsx` or a sibling module, not by a third copy);
    - a secondary button, styled per the mockup's `.btn-secondary` (`settings.html:200-210`) with
      `--gol-*` tokens only (AR-46);
    - a visually hidden `<input type="file">`, with `hidden` or `display:none`, `tabIndex={-1}`,
      and no label of its own. The visible button calls `inputRef.current.click()`.

    Props (FD2):
    - `serializer: Pick<WorkspaceSerializer, 'exportWorkspace' | 'importWorkspace'>`;
    - `battles: Pick<BattleRepository, 'list'>`;
    - `organisms: Pick<OrganismRepository, 'list'>`;
    - `onImported(): void`.
  - [x] 4.2 The flow runs in this order (FD1):
    1. `onChange`: read `file.text()`, then reset `input.value = ''`.
    2. `validateImportFile(text)`. On a throw, set the failure message and stop.
    3. Run the pristine check (Task 1, with both `list()` calls in one `Promise.all`; a rejection
       counts as not pristine).
    4. If pristine, run `serializer.importWorkspace(text)` directly.
    5. Otherwise, open the dialog with `kind` from the validated envelope, and hold `text` in a ref.
    6. **Import Anyway** records `'import'` and closes the dialog. **Cancel** records `'cancel'` and
       closes it.
    7. `onExited`: if `'import'`, run `serializer.importWorkspace(text)`, then publish its outcome.
       Either way, return focus to the Import button.

    Pass the file **text** to `importWorkspace`, not the pre-validated envelope. It re-validates,
    which is cheap, and it keeps `applyImport` internal (Story 5.8 FD1).
  - [x] 4.3 **Export First** calls `exportWorkspaceToFile(serializer)` while the dialog stays open.
    Guard it with its own in-flight ref, so a second click is a no-op. Set `exportState` from the
    outcome. Reset it to `'idle'` when a new dialog opens.
  - [x] 4.4 Guard re-entrancy with a `pendingRef` spanning pick → outcome, and do not use
    `disabled`. While a flow is in flight, a second Import click is a no-op. Use a `mountedRef`, as
    `DataManagement.tsx` does, including its StrictMode re-arm, before any post-await `setState`.
    A new pick clears the previous outcome message.
  - [x] 4.5 On success, call `onImported()`. `<SettingsPage>` wires it to `statsResource.reload()`,
    which is stale-while-revalidate, so there is no loading flash and the card stays mounted.
  - [x] 4.6 The outcome message renders under the row: `role="status"` for success, `role="alert"`
    for failure. Use `DataManagement.tsx`'s `ErrorText` colour pair (`--gol-danger` on
    `--gol-bg-secondary`, already gated at ≥4.5:1). The success line uses `--gol-text-secondary`
    or an existing gated pair; do not introduce an ungated pair.

- [x] **Task 5: wire it in** (AC: 1, 6, 9)
  - [x] 5.1 `DataManagement.tsx`:
    - render `<ImportWorkspaceRow>` after the Export row;
    - widen its `serializer` Pick to `'exportWorkspace' | 'importWorkspace'`;
    - take `battles`, `organisms` and `onImported`;
    - update the FD7 comment ("Import/Auto-Save/Clear All arrive…"), because Import has now arrived.
  - [x] 5.2 `SettingsPage.tsx`:
    - widen `serializer`'s Pick the same way, and update its comment;
    - pass `battles` / `organisms` (already props) and `onImported={statsResource.reload}`.
  - [x] 5.3 `app/(gallery)/settings/page.tsx` already passes the full serializer. No change is
    expected beyond comments.
  - [x] 5.4 In `lib/export/exportWorkspaceToFile.ts`'s header, "Story 5.9's import-time 'Export
    First' prompt is the third and does not exist yet" is now false. Reword it to name
    `ImportWorkspaceRow.tsx`.

- [x] **Task 6: tests** (AC: 1-9)
  - [x] 6.1 Add `ImportWorkspaceRow.test.tsx` (RTL, `@gol/test-utils` fakes; never a hand-rolled
    fake). Upload with `userEvent.upload` on the hidden input. It covers:
    - an invalid file shows the alert and never calls `importWorkspace` (use a `vi.fn` pass-through
      wrapper);
    - a pristine fake (seeded with `CONWAYS_CLASSIC` only) imports with no dialog and shows the
      status;
    - a non-pristine fake shows the dialog with the kind-specific sentence, for both kinds;
    - Cancel/Escape leaves the store untouched and focuses Import;
    - Import Anyway imports **after** exit. **Assert the ordering:** at the first moment the status
      or alert exists, the dialog is gone (project-context's rule; the ordering assertion is the
      only thing that catches it);
    - Export First keeps the dialog open, calls the export seam once, and shows its status. A
      rejecting export shows the in-dialog alert and still imports nothing;
    - `'rollback-failed'` copy. Inject it by wrapping `serializer.importWorkspace` to reject with a
      constructed `ImportError`;
    - a double click during an in-flight flow is a no-op;
    - `onImported` is called exactly once on success and never on failure;
    - axe with the dialog open and with each message shown.
  - [x] 6.2 In `SettingsPage.test.tsx`, remove `import` from the "dead section" forbidden regex,
    and update its comment. Auto-Save / Clear / Epic 6 stay forbidden. Add a test that a successful
    import refreshes the statistics counts.
  - [x] 6.3 In `DataManagement.test.tsx`, update it for the new props and the second row, and keep
    every Export assertion intact.
  - [x] 6.4 e2e: in `apps/web/e2e/settings.spec.ts`, add a `test.describe('import (Story 5.9)')`.
    Reuse the spec's own `seedWorkspace` helper. ⚠️ `addInitScript` re-runs on **every**
    navigation, so never reload after importing, or the seed overwrites the imported store. Use
    `setInputFiles` on the file input with an in-memory buffer:
    - a non-pristine workspace, and a valid workspace file built with `WorkspaceExportSchema`-valid
      data (for example the output of an Export click in the same test): the warning appears →
      Import Anyway → the status appears → the Workspace Statistics counts match the file.
      `gol:settings` is byte-identical before and after (read via `page.evaluate`);
    - an invalid file (`'{'`): the alert appears, and `gol:battles` / `gol:organisms` are
      byte-identical;
    - Export First: `page.waitForEvent('download')` fires and the dialog is still open;
    - axe with the dialog open.

    Keep it thin. The branch matrix lives in RTL. The raw-HTML "not.toContain('Import')" assertion
    in the prerender test stays valid (the row renders client-side, after the 'Loading settings…'
    shell), so leave it as is.

- [x] **Task 7: records** (AC: 9)
  - [x] 7.1 In `deferred-work.md`:
    - **annotate**, without striking, the "Concurrent-writer race in the import's snapshot→restore
      window" entry (code review of 5-8) with FD5's decision;
    - add a "Deferred from: Story 5-9" section with FD4's accepted limit (the pristine check reads
      through `list()`, which skips per-record-corrupt entries) and the M8/FR-8.4 wording conflict
      (Open flags).

    Never delete an entry.
  - [x] 7.2 Run `npm run ci:dev > <scratchpad>/ci.log 2>&1; echo $?`. Never pipe it. `/settings`
    grows. If `bundle:check` reports growth, refresh with
    `npm run build:standalone && npm run bundle:baseline`. Never hand-edit
    `scripts/bundle-baselines.json`.
  - [x] 7.3 Fill in the Dev Agent Record, including every forced decision you deviated from.

### Review Findings

Code review 2026-09-27 (opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor, diff
`10947c5..fd5afc7`). 2 decision-needed, 7 patch, 5 defer, 11 dismissed.

- [ ] [Review][Decision] Export First can still be in flight when Import Anyway runs the import — `handleImportAnyway` / `handleDialogExited` never consult `exportInFlightRef` (`ImportWorkspaceRow.tsx:240-282`). A user who clicks Export First and then Import Anyway before the download settles gets `applyImport`'s `clearAll()` racing `exportWorkspace()`'s reads, so the "backup" can capture a partly replaced workspace; and if that export then fails, its in-dialog alert is set after the dialog has unmounted, so the user never learns the backup failed. Today's localStorage export settles in microseconds, so the window is narrow but real. Options: **(a)** keep the in-flight export promise in a ref and have `handleDialogExited` await it before `runImport`; if it rejected, do NOT import and publish the export-failure copy as the card's alert. **(b)** Make Import Anyway a no-op while an export is in flight (no `disabled`, per FD8), so the user must click again once the status appears. **(c)** Await the export as in (a) but import regardless of its outcome, surfacing the export failure alongside the import outcome. **(d)** Accept and record in `deferred-work.md` (single user, sub-millisecond window).
- [ ] [Review][Decision] Import row description no longer says import replaces the whole workspace — AC1 / Open flags (`ImportWorkspaceRow.tsx:292-295`). The mockup (`settings.html:409`) reads "Replaces your entire workspace (all battles & organisms) with the imported file — same for a full workspace export or a single-battle export. You are always warned first…". The Open flag only licensed replacing the "always warned first" clause, but the implementation dropped the first sentence too, so on the pristine path (no dialog) nothing on screen says a battle file replaces the whole workspace (M8). The code comment also calls the text "FR-8.4's description", which it is not. Options: **(a)** restore the mockup's first sentence and keep the reworded second ("Replaces your entire workspace (all battles & organisms) with the imported file — same for a full workspace export or a single-battle export. You are warned first whenever your current workspace holds data…"). **(b)** Keep the current single sentence and only fix the comment.
- [x] [Review][Patch] Pristine path writes after unmount — no `mountedRef` check between the pick-time awaits and `runImport`, so leaving `/settings` mid-read still replaces the workspace with no visible outcome [`ImportWorkspaceRow.tsx:208-222`]
- [x] [Review][Patch] Focus returned to Import before the import settled, contradicting the effect's own comment and AC7's "focus then returns" order — the restore effect fired on the `dialogMounted=false` commit while `runImport` was still pending [`ImportWorkspaceRow.tsx:151-155,266-282`]
- [x] [Review][Patch] Repeating Export First is never re-announced — `exportState` kept its old value, so an identical outcome did not re-insert the live region; reset to `'idle'` before each attempt [`ImportWorkspaceRow.tsx:246-257`]
- [x] [Review][Patch] `importFailureMessage`'s `ImportError` switch has no exhaustiveness check — a future `ImportErrorCode` (possibly a partial-write one) would silently fall into the "not changed" fallback [`apps/web/lib/import/importFailureMessage.ts:23-60`]
- [x] [Review][Patch] Inaccurate WHY comments — `pristineWorkspace.ts` claims a reorder mints new rule ids (it does not; array order catches it); `importFailureMessage.ts` attributes the "not changed" guarantee to `validateImportFile` instead of `applyImport`; `ImportWarningDialog.tsx` names the caller's `pendingRef` as Export First's guard (it is `exportInFlightRef`); `DataManagement.tsx` says it "calls exactly two serializer methods" [`pristineWorkspace.ts:5-9`, `importFailureMessage.ts:6-11`, `ImportWarningDialog.tsx:50-51`, `DataManagement.tsx:11-15`]
- [x] [Review][Patch] `deferred-work.md`'s M8/FR-8.4 entry gives a self-contradictory authority rationale ("FR-8.4 sits above M8 only via the … rule being read the OTHER way") [`docs/implementation-artifacts/deferred-work.md` — Story 5-9 section]
- [x] [Review][Patch] Untested claim-carrying branches — a rejecting `list()` must still warn (AC4 "when in doubt, warn"), a backdrop click must map to Cancel (AC3), and an Import-button click while a flow is pending must be a no-op (Task 4.4) [`ImportWorkspaceRow.test.tsx`]
- [x] [Review][Defer] A store fault from `applyImport`'s snapshot read (`CorruptDataError` other than `NewerFormatVersionError`) falls to the fallback "This file could not be imported", blaming the file for a store fault [`importFailureMessage.ts:70-73`] — deferred, store-corruption UX is Story 5.11's
- [x] [Review][Defer] No file-size cap before `file.text()` — a huge file is read and `JSON.parse`d in full before failing on quota [`ImportWorkspaceRow.tsx:190`] — deferred, no spec'd limit
- [x] [Review][Defer] A stats `reload()` that rejects after a successful import flips `<SettingsPage>` to its error state and unmounts the card, taking the "Import complete" status with it [`SettingsPage.tsx:157`] — deferred, pre-existing `useAsyncResource` reload-error shape
- [x] [Review][Defer] Export row and Import row keep independent `pendingRef`s, so on a pristine workspace (no dialog) an Export click and a file pick can run `exportWorkspace` and `importWorkspace` concurrently [`DataManagement.tsx:147`] — deferred, same single-writer stance as FD5
- [x] [Review][Defer] e2e `WorkspaceExportSchema.parse(IMPORT_ENVELOPE)` runs at describe-collection time, so a schema drift fails every test in `settings.spec.ts` with an opaque collection error [`apps/web/e2e/settings.spec.ts`] — deferred, test-hygiene only

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: pick → validate → pristine check → warn → import-on-exit.** The warning must **name the
  kind** (FR-8.4), so the file has to be read and validated before the warning can exist. This
  inverts the mockup's demo order (`settings.html:562-577` warns on click, before the picker). The
  mockup is illustrative. The PRD sentence is the spec, and it has two more benefits:
  - an invalid file is rejected before the user is asked to make a destructive choice about it;
  - Export First never downloads a backup for an import that was never going to run.
- **FD2: `Pick` props, never the aggregate** (the Story 5.2 FD7 house rule). The row calls exactly
  `exportWorkspace`, `importWorkspace`, `battles.list` and `organisms.list`. It does not import
  `createRepositories()` or a concrete repository (AR-2/27). `validateImportFile` and the error
  **classes** are imported from `@gol/persistence` as values. That is legitimate: they are pure
  functions and classes, not implementations, which is the same reasoning as
  `saveFailureMessage.ts`'s header.
- **FD3: the pristine predicate is pure domain logic, and deep-equal is key-order-insensitive.**
  Its inputs come from two `list()` reads at file-pick time. A rejected read means "not pristine",
  so the failure mode is an extra warning, never a lost workspace.
- **FD4: copy table.** Plain, non-technical, and no story IDs in runtime strings. The wording may
  be polished, but the **claims** are fixed:

  | Case | Must say | Must not say |
  |---|---|---|
  | `File.text()` rejects | could not be read; workspace not changed | — |
  | `'not-json'` / `'corrupt'` | not a valid Game of Life Studio export file (or damaged); workspace not changed | JSON, schema, Zod |
  | `'dangling-reference'` | the file is incomplete: it refers to organisms it does not include; workspace not changed | ids |
  | `'newer-version'` | made by a newer version of the app; reload to get the latest version, then try again; workspace not changed | version numbers are optional |
  | `'write-failed'` + `QuotaExceededError` cause | too large for this browser's storage; workspace restored/unchanged | — |
  | `'write-failed'` (other) | could not be completed; workspace restored/unchanged; try again | — |
  | `'rollback-failed'` | failed partway and the previous workspace **could not be fully restored**; reload, and restore from a backup (e.g. the Export First file) if anything is missing | "unchanged" / "not changed" |
  | `NewerFormatVersionError` (the store, from the snapshot read) | your saved workspace is from a newer version of the app; reload; nothing was imported | — |
  | any other throw | could not be imported; workspace not changed | `error.message` |

  **Accepted limit:** `list()` skips a per-record-corrupt entry, so a store whose *only* battle is
  unreadable reads as "no battles". That is recorded in `deferred-work.md`. Store corruption UX is
  Story 5.11's.
- **FD5: the 5.8 concurrent-writer race: accept the single-writer assumption, and document it.**
  The deferred entry asks this story to decide. On `/settings`:
  - nothing else in the tab writes `gol:battles` / `gol:organisms` during an import;
  - `pendingRef` makes the flow non-reentrant;
  - the dialog is modal.

  A **second tab** can still race it. That is the codebase-wide norm for every `save()`, and
  cross-tab locking (`navigator.locks`, a `storage`-event guard) is not built here. Annotate the
  entry with this ruling.
- **FD6: `next/dynamic` for the dialog.** This is AR-35 and the `/battle` precedent. `/settings`'s
  first load today carries no MUI `Dialog`. Loading the dialog lazily keeps the route's growth to
  the row and the copy. Growth is gated by the 8 KB ratchet, and if the baseline refresh is needed
  it is done through the tool.
- **FD7: no merge, no `kind` branch, no settings.** M8: a battle file replaces the whole workspace
  too. Only the warning sentence reads `kind`. Nothing touches `repositories.settings`.

### What exists: read these before writing a line

- `apps/web/components/settings/DataManagement.tsx`: the card, the Export row, `Row*` styled
  pieces, `ExportButton`, `ErrorText`, and the pending/mounted ref pattern (FD8, including the
  StrictMode re-arm). **Preserve:**
  - Export's behaviour and alert;
  - the no-`disabled` rule;
  - the `aria-label="Export workspace"` that e2e uses.
- `apps/web/components/settings/SettingsPage.tsx`: the `statsResource` (`useAsyncResource`, whose
  `reload()` is stale-while-revalidate), the `ready` gate that the card lives inside, and the
  `Pick` prop comments you will widen.
- `apps/web/components/settings/SettingsCard.tsx`: `Card`, `CardTitle`.
- `apps/web/app/(gallery)/settings/page.tsx`: the serializer is built once at the boundary. It
  already exposes `importWorkspace`.
- `apps/web/components/battle/editor/ExportBattleDialog.tsx`: the dialog idiom to copy, and the
  record-choice-then-act-on-`onExited` contract (Story 5.6 FD2). The `<BattlePage>` call site
  shows the `next/dynamic` line and the focus restore after exit.
- `apps/web/components/organisms/OrganismLibrary.tsx:338-414`: `queuedCloneErrorRef` plus
  `onExited`, the reference for "publish after the window is gone".
- `apps/web/lib/export/exportWorkspaceToFile.ts` + `downloadJsonFile.ts`: the Export First seam.
  It rejects with the serializer's error and never shows UI.
- `apps/web/lib/saveFailureMessage.ts`: the copy-function pattern, where the error classes are
  imported and the claims are properties of the write path.
- `packages/persistence/src/workspaceImport.ts`:
  - `validateImportFile` (pure, throws `ImportError`);
  - `applyImport`: `fromEnvelope` runs before the snapshot, every write-region throw becomes
    `'write-failed'` / `'rollback-failed'`, and a snapshot-read throw propagates unchanged;
  - `ImportSummary` (`organismCount` includes a Conway's Classic the import itself added).
- `packages/persistence/src/errors.ts`: `ImportError` (`code`, `cause`, `rollbackError`),
  `QuotaExceededError`, `CorruptDataError`, and `NewerFormatVersionError` (a subclass: test it
  first).
- `packages/domain/src/defaultWorkspace.ts`: `CONWAYS_CLASSIC` (deep-frozen, the FR-8.4 baseline)
  and `CONWAYS_CLASSIC_ID`.
- `packages/domain/src/workspaceExportSchema.ts`: `ExportKind`.
- `apps/web/e2e/settings.spec.ts`: `seedWorkspace` (an `addInitScript` seed), `statValue`, the
  download pattern, and axe.
- `apps/web/lib/useInertBackground.ts` and project-context's "A live region inserted while a dialog
  is open is never announced".
- Mockup: `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/settings.html`:
  - `:405-418`: the Import row;
  - `:200-210`: `.btn-secondary`;
  - `:562-577`: the demo flow. Its order is superseded by FD1.

### Architecture compliance

- **M8 / Decision F / AR-12**: a destructive whole-workspace replace, with settings unreachable.
- **FR-1.5 / M9 / AR-13**: Conway's Classic is re-ensured by `applyImport`. The UI does nothing
  extra.
- **AR-2 / AR-27**: injected `Pick`s, and the factory only at the page boundary.
- **AR-35**: the dialog is lazy, and MUI imports are per-component.
- **AR-46**: no raw hex. Use `--gol-*` tokens only.
- **No DOM types in `packages/*`**: `isPristineWorkspace` is pure. `File` and the input exist only
  in `apps/web`.
- **Spec-ID citations** must resolve under `npm run spec:check`. Write them exactly: `FR-8.4`,
  `FR-1.5`, `FR-8.3`, `M8`, `M9`, `Decision F`, `AR-2`, `AR-12`, `AR-13`, `AR-27`, `AR-35`, `AR-46`,
  `RFC-006`, `Story 5.5`, `Story 5.6`, `Story 5.8`, `Story 5.10`, `Story 5.11`.

### Library / framework notes

- No new dependency. Use `File.text()` (NFR-2.1 browsers all support it), not `FileReader`.
- React 19 and MUI v9.3.1 `Dialog` are used with per-component imports, as in `ExportBattleDialog`.
- `userEvent.upload` respects `accept`. Build test `File`s with `type: 'application/json'`.
  Playwright's `setInputFiles` accepts `{ name, mimeType, buffer }`.
- No web research was needed. Every API this story touches is in-repo or in the platform.

### Testing standards

- `packages/domain`: `pristineWorkspace.ts` is under the ≥90% **per-file** gate. `apps/web` has no
  gate. Test the branches that carry a claim, and do not pad coverage.
- Use `@gol/test-utils` fakes, never a hand-rolled repo. To inject a failure, wrap a method in
  `vi.fn` pass-throughs in the test file (the Story 5.8 precedent).
- To prove "nothing was written" in e2e, compare raw `localStorage.getItem` strings before and
  after.
- `npm run ci:dev` is the local gate: redirect it to a file and `echo $?`, and never pipe it.

### Previous story intelligence

- **Story 5.8 (done, #85):**
  - `validateImportFile` was exported **for this story** (FD1).
  - The six `ImportError` codes were **kept by the owner so this story's copy can be truthful**
    (FD5 ruling, 2026-09-26). `'write-failed'` means "exactly as it was" for every shape since the
    opaque snapshot ruling. `'rollback-failed'` is the only "not guaranteed" outcome.
  - A snapshot read on a newer-stamped store throws `NewerFormatVersionError`, not `ImportError`.
  - The concurrent-writer race was deferred to this story's wiring (FD5 here).
- **Story 5.6 (done):** the dialog idiom, the lazy boundary and act-on-exit (FD2), and focus
  restore after exit because of WebKit's "no focus on click".
- **Story 5.5 (done):** the Export row, the `exportWorkspaceToFile` seam (built for this reuse),
  FD8 (no `disabled`, the pending/mounted refs), and the house rule of no dead affordance. That
  rule is why Import was forbidden text until now.
- **Story 4.18:** the queued-outcome-until-exit reference, and the ordering assertion that is the
  only test that catches the live-region bug.

### Git intelligence

`main` is at `10947c5` (#88, Story 4.25). Epic 5's last merge was #85 (Story 5.8). The Epic 4
lane's remaining story, 4-26 (the rule-delete confirmation dialog in the organism editor), touches
`components/organisms/editor/` and the Story 4.10 tests. It shares no file with this story. This
story touches the domain barrel (one appended block, resolved by `[[sync.rules]]`).

### Project Structure Notes

- New:
  - `packages/domain/src/pristineWorkspace.ts` + `.test.ts`;
  - `apps/web/lib/import/importFailureMessage.ts` (+ `importWarningText` / `importSuccessMessage`,
    or a sibling `importMessages.ts`) + tests;
  - `apps/web/components/settings/ImportWorkspaceRow.tsx` + `.test.tsx`;
  - `apps/web/components/settings/ImportWarningDialog.tsx`.
- Modified:
  - `packages/domain/src/index.ts` (one block, appended at the end);
  - `apps/web/components/settings/{DataManagement,SettingsPage,SettingsCard}.tsx` and their tests;
  - `apps/web/lib/export/exportWorkspaceToFile.ts` (header comment only);
  - `apps/web/e2e/settings.spec.ts`.
- Docs: `deferred-work.md` and `sprint-status.yaml`. `scripts/bundle-baselines.json` changes only
  through the tool.
- Untouched on purpose:
  - every file in `packages/persistence`;
  - `@gol/test-utils`;
  - `workspaceExportSchema.ts`;
  - `app/(gallery)/settings/page.tsx`, except comments;
  - every `package.json`.

### What NOT to build

- ❌ A merge/add import, or any `kind` branch beyond the warning sentence (M8).
- ❌ Any change to the pipeline, `ImportError` or `AppRepositories`. If the UI seems to need one,
  stop and flag it.
- ❌ A drag-and-drop zone, a file-size cap, or a preview of the file's contents. None is specified.
- ❌ Clear All Data (Story 5.10), or store-corruption UX (Story 5.11).
- ❌ Cross-tab locking (FD5).
- ❌ A shared live-region host. That is the deferred class fix; use the act-on-exit shape.
- ❌ `disabled` on any button in this flow.

### Open flags for the owner (not blockers: the story proceeds on the FDs)

- **⚠️ Spec conflict: "always warns" versus "suppressed only for pristine".**
  - Architecture **M8** (`architecture.md:354`), **RFC-006** (`:246`, "The confirmation always
    warns") and the mockup's Import description ("You are always warned first", `settings.html:409`)
    say import **always** warns.
  - **FR-8.4** (`prd.md:512`) and this story's epic AC (`epics.md:1430`) suppress the warning for a
    pristine workspace.

  This story follows the **AC** and FR-8.4, which is the narrower and more specific rule. A pristine
  workspace has nothing to lose, and M8's "always" reads as "for both kinds". This is flagged
  because the authority order puts M8 above an RFC. If the owner rules "always", AC4 and Task 1
  drop, and the dialog shows unconditionally. The mockup's row description ("always warned first")
  is **not** copied verbatim for the same reason. Use "You are warned first whenever your current
  workspace holds data, and offered to export it before it is replaced."
- **FD1** inverts the mockup's order (warn before pick) so that the warning can name the kind.

### References

- `docs/planning-artifacts/epics.md:1421-1432` (5.9), `:1408-1419` (5.8), `:1434-1445` (5.10),
  `:116` (FR-8.4 summary).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:507-517` (FR-8.4), `:141-145`
  (FR-1.5).
- `docs/planning-artifacts/architecture.md:354` (M8), Decision F.
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md:246` (Decision 5, the
  import warning).
- `docs/implementation-artifacts/5-8-atomic-import-pipeline.md`: FD1, FD5, the review rulings.
- `docs/implementation-artifacts/5-6-battle-export-dialog.md`: FD1 (lazy), FD2 (act-on-exit), FD8
  (focus).
- `docs/implementation-artifacts/5-5-export-workspace.md`: FD7 (no dead affordance), FD8 (no
  `disabled`).
- `docs/implementation-artifacts/deferred-work.md`: "Deferred from: Story 5-8", "code review of
  5-8" (the race), `:2901` (the live-region class fix).
- `docs/project-context.md`: repositories are injected; `clearAll()` never touches settings;
  import is destructive; the live-region rule; the coverage tiers; `ci:dev` is never piped; the
  bundle growth ratchet.

## Dev Agent Record

### Agent Model Used

Sonnet (claude-sonnet-5), running as the Implement phase of `implement-next-story` in the
`lane-epic-5` worktree.

### Debug Log References

- `npm run ci:dev` — redirected to `<scratchpad>/ci.log`, `echo $?` captured (never piped, per
  project-context). Result and any deviations recorded in Completion Notes below.

### Completion Notes List

- **Task 1** — `isPristineWorkspace` in `packages/domain/src/pristineWorkspace.ts`: a private,
  key-order-insensitive `deepEqual` over plain JSON values (no `JSON.stringify` comparison, per
  FD3), true iff `battleCount === 0` and the organism list is exactly `[CONWAYS_CLASSIC]`
  structurally. 13 tests in `pristineWorkspace.test.ts` cover the seed alone, a key-reordered deep
  copy, one battle present, a second organism, zero organisms, every editable field changed alone
  (name/colorToken/dominance/agingEnabled/rule summary/condition pattern/rule order), and a
  same-id organism with an extra rule. Barrel: one block appended at the end of
  `packages/domain/src/index.ts` (`[[sync.rules]]`-safe).
- **Task 2** — `apps/web/lib/import/importFailureMessage.ts` (the FD4 copy table, branching on
  `ImportError.code` with `NewerFormatVersionError` checked before any `CorruptDataError` branch)
  and `apps/web/lib/import/importMessages.ts` (`importWarningText`, `importSuccessMessage`,
  `FILE_READ_FAILURE_MESSAGE` for the one FD4 row the pipeline never throws for — a rejected
  `File.text()`). Tests assert every code, the quota-cause branch, the ordering proof, a non-Error
  rejection, that `'rollback-failed'` never says "(un)changed", and that no message leaks a
  sentinel `detail`/story id/`error.message`.
- **Task 3** — `ImportWarningDialog.tsx`, copying `<ExportBattleDialog>`'s idiom (per-component MUI
  imports, `disableRestoreFocus`, `onTransitionExited`, 440px paper, Cancel `autoFocus`/first,
  Import Anyway `contained color="error"`/last). The Export-First status/alert renders inside
  `DialogContent`, deliberately NOT the `aria-describedby` target.
- **Task 4** — `ImportWorkspaceRow.tsx`: FD1's pick → validate → pristine check → warn-or-import
  order; `pendingRef` spans the whole flow (pick through outcome, including the entire
  dialog-open window); `mountedRef` StrictMode-re-armed like `<DataManagement>`'s; `focusOwedRef`
  + a `focusTick` counter reproduce `<BattlePage>`'s post-commit DOM-lookup focus restore
  (`data-import-workspace`, run after `useInertBackground`'s cleanup by declaration order);
  `exportInFlightRef` guards Export First independently. The dialog is reached through
  `next/dynamic` (AR-35, Task 3.4) from this file, not from `<ImportWarningDialog>` itself. `Row`/
  `RowInfo`/`RowLabel`/`RowDescription` were LIFTED to `SettingsCard.tsx` (Task 4.1) rather than
  copied a third time — `<DataManagement>` now imports them from there too, with byte-identical
  rendered output (its own test suite still passes unmodified in substance).
- **Task 5** — `DataManagement.tsx` renders `<ImportWorkspaceRow>` after Export and widens its
  `serializer` Pick; `SettingsPage.tsx` widens its own Pick and wires
  `onImported={statsResource.reload}`; `app/(gallery)/settings/page.tsx` needed no change (it
  already passed the full serializer); `exportWorkspaceToFile.ts`'s header now names
  `ImportWorkspaceRow.tsx` instead of "does not exist yet".
- **Task 6** — `ImportWorkspaceRow.test.tsx` (17 tests: invalid file, pristine direct import,
  both `kind`s' dialog copy, Cancel, Escape, the Import-Anyway ordering assertion — "dialog is
  already gone at the first moment the status exists" — Export First success/failure, the
  `'rollback-failed'` copy via an injected `ImportError`, the double-pick no-op, `onImported`
  called-once/never, and three axe scans). `SettingsPage.test.tsx`: `import` dropped from the
  dead-section forbidden regex, plus one new integration test proving a real import (via
  `createWorkspaceSerializer` over `createFakeRepositories`) refreshes the Workspace Statistics
  counts through the real `statsResource.reload` wiring. `DataManagement.test.tsx`: every existing
  Export assertion kept, with the new required props threaded through, plus one render check that
  the Import row is present. e2e: `apps/web/e2e/settings.spec.ts` gained
  `test.describe('import (Story 5.9)')` (moved `seedWorkspace` to module scope so both describe
  blocks can reuse it) — non-pristine warn → Import Anyway → counts refresh → `gol:settings`
  byte-identical; an invalid file leaves `gol:battles`/`gol:organisms` byte-identical; Export First
  fires a real download with the dialog still open; axe with the dialog open. The fixture file is
  hand-built rather than an Export-button round trip of `seedWorkspace`'s own data, because that
  fixture's second battle places Conway's Classic cells without carrying a Conway's Classic
  organism record — reimporting it would trip `'dangling-reference'` for a reason unrelated to
  this suite (noted in the spec file itself).
- **Task 7** — `deferred-work.md`: annotated (not struck) the Story-5.8-code-review "concurrent
  writer" entry with the FD5 ruling (single-writer assumption accepted, documented), and added a
  "Deferred from: Story 5-9" section carrying that same ruling in full, the accepted
  per-record-corrupt limit on the pristine check's `list()` reads, and the M8/FR-8.4 "always warns"
  vs "suppressed when pristine" wording conflict this story deliberately resolved toward the AC/
  FR-8.4 reading (surfaced, not silently picked).
- No task required a deviation from its Dev Notes forced decision (FD1–FD8 all followed as
  written); the one open item is the Dev Notes' own flagged M8/FR-8.4 conflict, which is not a
  blocker per the story file and is recorded for the owner in `deferred-work.md` as above.
- `npm run ci:dev` result: **first full run — every step green through `bench:check`
  (typecheck, lint [1 pre-existing warning, unrelated file], format:check, spec:check,
  boundary:check, `test:coverage`, `build:standalone`, `bundle:check`, `bench`, `bench:check`),
  `e2e:chromium` failed once** on a bug in this story's own new e2e test: a bare
  `page.getByRole('alert')` is a strict-mode violation on every route because Next's
  `#__next-route-announcer__` also carries `role="alert"` permanently
  (`organisms.spec.ts`'s `dialog`/`card`-scoped alert queries are the established fix for the
  same reason). Fixed by filtering the locator by text; re-verified with
  `npx playwright test --project=chromium e2e/settings.spec.ts` — **14/14 passed**. Two further
  full `ci:dev` re-runs both green through `bench:check` again, but `test:coverage` intermittently
  timed out (vitest's default 5000ms) on a DIFFERENT small subset of tests each time, always inside
  `components/organisms/OrganismLibrary.test.tsx` / `.../editor/OrganismEditorModal.test.tsx` —
  files this story never touches. Both files pass 100% (89/89 and 229/229) when run in isolation
  immediately after, in ~22–51s each versus the ~150–180s the full 2484-test coverage run takes;
  assessed as CPU-contention flake (the same class project-context documents for the Playwright
  four-project matrix, here reproducing under `vitest`'s coverage instrumentation instead), not a
  regression from this story. This story's own new/modified test files
  (`pristineWorkspace.test.ts`, `importFailureMessage.test.ts`, `importMessages.test.ts`,
  `ImportWorkspaceRow.test.tsx`, `DataManagement.test.tsx`, `SettingsPage.test.tsx`) passed clean
  in every one of these runs, including inside the flaking full-suite passes.

### File List

**New:**
- `packages/domain/src/pristineWorkspace.ts`
- `packages/domain/src/pristineWorkspace.test.ts`
- `apps/web/lib/import/importFailureMessage.ts`
- `apps/web/lib/import/importFailureMessage.test.ts`
- `apps/web/lib/import/importMessages.ts`
- `apps/web/lib/import/importMessages.test.ts`
- `apps/web/components/settings/ImportWarningDialog.tsx`
- `apps/web/components/settings/ImportWorkspaceRow.tsx`
- `apps/web/components/settings/ImportWorkspaceRow.test.tsx`

**Modified:**
- `packages/domain/src/index.ts` (one block appended)
- `apps/web/components/settings/SettingsCard.tsx` (`Row`/`RowInfo`/`RowLabel`/`RowDescription`
  lifted here)
- `apps/web/components/settings/DataManagement.tsx`
- `apps/web/components/settings/DataManagement.test.tsx`
- `apps/web/components/settings/SettingsPage.tsx`
- `apps/web/components/settings/SettingsPage.test.tsx`
- `apps/web/lib/export/exportWorkspaceToFile.ts` (header comment only)
- `apps/web/e2e/settings.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-09-27 — Story 5.9 implemented: the Import row, the mandatory destructive-replace warning
  (suppressed only for a provably pristine workspace), Export-First-then-return, outcome copy per
  the FD4 table, and the full act-on-exit/focus-restore/re-entrancy shape mirroring Stories
  5.5/5.6/4.18's precedents. `npm run ci:dev`: green apart from a coverage-run CPU-contention
  flake in two unrelated, untouched legacy files (see Completion Notes for the isolation-run
  proof); one real e2e bug of this story's own making (an alert-locator strict-mode collision with
  Next's route announcer) was found and fixed.

Dev Model: sonnet   # follows existing patterns (5.6's dialog idiom + act-on-exit, 5.5's Pick props/refs/export seam, 4.18's queued outcome, saveFailureMessage's copy function); the pipeline contract it consumes is 5.8's, and every structural choice is pre-decided in FD1–FD7
Proposed lane gate: none   # touches components/settings, a new lib/import, one appended @gol/domain barrel block and settings.spec.ts; Epic 4's only open story (4-26, rule-delete dialog in components/organisms/editor) neither uses nor reshapes any of these
