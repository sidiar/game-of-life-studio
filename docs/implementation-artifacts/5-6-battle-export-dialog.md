---
baseline_commit: bf62145d4092d5d3918fbfc61b096007fccb96ad
---

# Story 5.6: Battle Export Dialog

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to export a single battle to share,
so that others can import and run my creation.

## Acceptance Criteria

The source is `epics.md#Story 5.6: Battle Export Dialog` (`epics.md:1381-1393`), including the
save-before-export AC merged in #77. It is split here into items a reviewer can check one at a
time. It also takes on two hand-offs from earlier stories: Story 5.4's "the export entry point must
save, or block export on, a dirty/unsaved battle" (`deferred-work.md:2863-2870`), and Story 5.5's
reusable `apps/web/lib/export/` seam ("Entire Workspace behaves as 5.5"). **Read FD1–FD12 before
touching a file. `/battle` has 0.4 KB of bundle headroom (FD1).**

1. **"EXPORT BATTLE" renders in the editor's Tools section for the first time** (spec §3.7, FR-6.1;
   the 2.15 gap closes). `<EditorToolsSection>` gains an optional `onExport?(): void` and renders a
   second `ToolButton` labelled **Export Battle** *below* "Clear Petri Dish"
   (`petri-dish-lab-mode.html:729-732`, where Clear comes first and Export last; the two buttons
   §9.3 excludes sit between them and are not rendered). It renders
   only when `onExport` is supplied. With it absent, the section renders exactly what it renders
   today, byte for byte (NFR-4.1: absent → not rendered). The button is a native
   `<button type="button">`, is uppercase through the existing `ToolButton` styles, and carries
   `data-export-battle=""` (FD8). Its `disabled` is `isSaving` **alone**, so it gets its own prop
   and does not use Clear's `stats.livingCells === 0 || isSaving`. An empty battle is exportable
   (FD10).

2. **Clicking it opens a dialog offering "Battle Only" vs "Entire Workspace"** (FR-7.13). The
   dialog is a new `<ExportBattleDialog>` in the same idiom as the other three dialogs on the route
   (FD3):
   - heading **Export Battle**;
   - body quoting FR-7.13, "Export this Battle only, or export entire Workspace?";
   - three buttons in DOM order: **Cancel** (`autoFocus`, outlined), **Entire Workspace** (text),
     **Battle Only** (contained, the recommended action, last).

   Escape and a backdrop click route to Cancel. Cancel changes nothing, and focus returns to the
   EXPORT BATTLE button once the exit transition ends (FD8). The dialog is loaded through
   `next/dynamic` and mounted only while it is open or closing (FD1).

3. **Battle Only exports the initial (Edit-mode) grid with the Story 5.4 closure organisms**
   (FR-6.1, FR-7.13, Decision E.5). It calls
   `WorkspaceSerializer.exportBattle(id)` exactly once, with the **persisted** battle's id (FD5),
   and hands the returned `kind: 'battle'` envelope to `downloadJsonFile`. The file carries exactly
   one battle, plus the organisms it places, plus the transitive closure of those organisms' rule
   targets. It never carries the whole library (unless the closure happens to reach all of it) and
   never carries settings (AR-12 / Decision F.1).

4. **Entire Workspace behaves as Story 5.5** (FR-7.13, FR-8.3). It calls the existing
   `exportWorkspaceToFile(serializer)` unchanged, so the result is a `kind: 'workspace'` file named
   `game-of-life-workspace-YYYY-MM-DD.json`. It does **not** save first (FD6), and the dialog says so
   when the battle has unsaved changes (AC7).

5. **The default Battle Only filename is the battle name in kebab-case, e.g. `triple-threat.json`**
   (FR-6.4). A pure `battleExportFilename(name: string): string` in `apps/web/lib/export/` builds it
   (FD7):
   - normalise to NFKD and strip combining marks that follow a **Latin** base character only, then
     renormalise to NFC **→ Sidiar (2026-09-25):** superseding the original "strip every
     combining mark" — see the dated FD7 annotation below;
   - lowercase;
   - turn every run of characters that are not a Unicode letter, number, or (surviving, non-Latin)
     combining mark into one `-`;
   - trim leading and trailing `-`;
   - truncate to 60 code points, trim a trailing `-` the cut may leave **→ Sidiar (2026-09-25):**
     new sub-step — see the dated FD7 annotation below;
   - append `.json`.

   If nothing is left (an untitled battle `''`, whitespace only, or all punctuation and emoji), the
   name falls back to the kebab-case of `battleDisplayName('')`, which is `untitled-battle.json`.
   The name comes from the **exported envelope's** battle (`envelope.battles[0].name`), not from
   editor state. That is the Story 5.5 FD4 "one source per file" rule, and it is also the persisted
   name (AC6).

6. **The export contains initial state only, never live Run-mode state** (FR-6.1, AR-31, A-2). This
   holds by construction: `exportBattle(id)` reads `repos.battles.load(id)`, and the store only ever
   holds `initialGrid` (Run-mode state is never persisted). The EXPORT BATTLE control exists only in
   the Lab view (`<BattleEditorView>`). The Run view gets no export affordance in this story. A test
   pins that the exported cells equal the saved record's grid (AC11).

7. **A battle with unsaved edits, or one never saved, is saved first, and the user can see that
   before choosing** (the #77 AC; RFC-006 Decision 4; owner ruling 2026-09-24). This story takes
   the **"saved first"** branch (FD4). The rules:
   - **`needsSave`** is `isDirty || persistedId === null`, where
     `persistedId = saveStamp?.id ?? loadedIdentity?.id ?? null`.
   - When `needsSave`, the Battle Only button reads **Save & Export Battle**, not "Battle Only".
     Its accessible name contains its visible text. A second body line explains the save: "This
     battle has unsaved changes. Save & Export Battle saves it first; Entire Workspace exports only
     what is already saved." For a never-saved battle it says "This battle has not been saved yet"
     instead of "has unsaved changes".
   - Choosing it runs the **existing** `<BattlePage>` save path (`saveBattle`, the same function
     SAVE and the leave guard's Save & Leave use: edit lock, H.1 prune, first-save id minting,
     `saveError`). Only if that save **succeeds** does it call `exportBattle(id)` with the id the
     save just wrote (FD5). A failed save exports nothing, and the existing `role="alert"` line
     reports it.
   - The file therefore always matches the persisted battle. When `needsSave` is false, Battle Only
     exports directly and writes nothing.

8. **A failed export is reported, and nothing is half-done.** If `exportBattle` or
   `exportWorkspace` rejects, no download is triggered. Possible causes: `ExportError('not-found')`
   (the battle was deleted in another tab) or `CorruptDataError`. The failure is reported through
   the **same `role="alert"` line** that `saveError` uses (FD9), in plain words with no
   `error.message` and no story IDs. For example: "This battle could not be exported. Try again."
   and "Your workspace could not be exported. Try again." A save that succeeded before a failed
   export stays saved, and the copy does not claim "nothing was changed". The next export attempt,
   and any save attempt, clears the message. The alert is published only after the dialog has
   exited (FD2, the live-region rule).

9. **Keyboard-operable, axe-clean, focus-correct.**
   - Tab reaches EXPORT BATTLE after Clear Petri Dish. Enter and Space open the dialog.
   - Inside the dialog, focus is trapped, starts on Cancel, and Escape cancels.
   - The background is `inert` for the whole open-and-exiting window (`useInertBackground`).
   - After **every** close path, focus lands on EXPORT BATTLE once the operation has settled (FD8).
     That covers Cancel, Escape, backdrop, a completed export and a failed one. The exception is
     when focus has already moved somewhere real.
   - vitest-axe on the dialog (plain and `needsSave` variants) and on `<BattlePage>` with the
     dialog open reports `[]`. `@axe-core/playwright` on the served `/battle` with the dialog open
     also reports `[]`.

10. **Repositories are injected, and `/battle`'s bundle is not raised** (AR-2 / AR-27; the owner's
    growth-ratchet preference).
    - No component imports `createRepositories` or a concrete repository.
    - The serializer is built from the **injected** `repositories` inside a lazily loaded module
      (FD1), with `APP_VERSION` and `() => new Date()`.
    - `npm run bundle:check` passes with **no `budgetGzipKb` change**. `/battle` measured 309.6 KB
      and `/battle/new` 309.3 KB against 310 on `main` at `bf62145`.
    - If the story cannot fit, **stop and flag it**. Do not raise the budget and do not trim
      unrelated code to make room.

    *(2026-09-25: the absolute budget was retired by #81 in favour of the growth gate, with the
    owner's approval; AC10 is met as "`bundle:check` passes and the growth is baselined in this
    PR" — /battle +0.6 KB, /battle/new +0.6 KB.)*

11. **Tests prove the file, not just the calls** (AR-44).
    - **Unit:** `battleExportFilename` covers the cases in FD7. `exportBattleToFile` uses a real
      `createWorkspaceSerializer` over `createFakeRepositories(createMockWorkspace())`. It captures
      the exact string handed to the download seam, and `WorkspaceExportSchema.parse(JSON.parse(…))`
      succeeds with `kind === 'battle'` and exactly one battle whose id is the requested one. It
      asserts the organism ids equal `organismClosure(battle.organismIds, library)`, and that there
      is no raw `settings` key. A rejecting serializer rejects with the same error and never calls
      download.
    - **Component (`BattlePage`):**
      - the clean saved battle exports without calling `battles.save`;
      - a dirty battle saves (with a `save` spy) *before* `exportBattle` is called with the saved
        id;
      - a never-saved `/battle/new` battle saves, then exports with the freshly minted id;
      - a rejecting save never calls `exportBattle` and shows the save alert;
      - a rejecting `exportBattle` shows the export alert and no download;
      - Entire Workspace calls `exportWorkspace` and never `battles.save`;
      - Cancel changes nothing (no save, no export, `data-dirty` unchanged);
      - EXPORT BATTLE is absent from the Run view.
    - **E2E (Chromium in `ci:dev`, all four projects in CI):**
      - seed via `addInitScript`, open a saved battle, click Export Battle, then Battle Only;
      - catch the `download` and assert `suggestedFilename()` equals the kebab-cased seeded name;
      - parse the file with `WorkspaceExportSchema` (imported from `@gol/domain`) and assert the
        battle id and cell count match the seed;
      - a second case: paint a cell (dirty), then Save & Export Battle. The file carries the new
        cell and `data-dirty` is `false` afterwards;
      - an axe scan with the dialog open.

12. **No regressions; stale forward-references are corrected in place** (the 5.3/5.4/5.5 review
    lesson).
    - Every existing `EditorToolsSection`, `BattleEditorView`, `BattlePage` and `battleRoute.spec`
      test stays green unchanged, except where a render must now pass the new prop.
    - Rewrite the comments that describe this story as future work:
      - `EditorToolsSection.tsx`'s header ("`onExport?()` is NOT declared on these props yet —
        Story 5.6 adds it");
      - the `exportBattle` JSDoc in `packages/persistence/src/workspaceSerializer.ts:40-51` ("What
        this hands to Story 5.6 …");
      - `exportWorkspaceToFile.ts`'s header ("Stories 5.6 and 5.9 both reuse this", which becomes
        5.9 only plus what 5.6 now does).
    - In `deferred-work.md`, annotate the 5.4 hand-off entry (`:2863`) as **CLOSED by Story 5.6**,
      keeping its text.
    - `npm run ci:dev` is green.

## Tasks / Subtasks

- [x] **Task 1: Read before writing (AC: all).**
  - [x] `apps/web/components/battle/BattlePage.tsx` end to end. Pay particular attention to:
        `savingRef` (the edit lock), `saveBattle` / `handleSave` (`:784-845`), `saveStamp`,
        `loadedIdentity`, `useLeaveGuard` wiring (`:859-866`), the four early returns (hooks must
        precede them), and the two `next/dynamic` calls and their bundle comments (`:34-81`).
  - [x] `apps/web/lib/battle/useLeaveGuard.ts`: the three-phase open/exiting/closed shape, the
        `restoreBackFocusRef` DOM-lookup focus restore, and the `useInertBackground` ordering rule.
        This story's dialog lifecycle copies it (FD3).
  - [x] `apps/web/components/battle/UnsavedChangesDialog.tsx`: the dialog idiom to copy (paper
        width, `BUTTON_SX`, guarded `onClose`, `disableRestoreFocus`, `onTransitionExited`,
        per-component MUI imports).
  - [x] `apps/web/components/battle/editor/EditorToolsSection.tsx` (+ test) and
        `BattleEditorView.tsx:60-170` (props interface) and `:876-892` (the Tools section).
  - [x] `apps/web/lib/export/*` (Story 5.5): `downloadJsonFile`, `exportWorkspaceToFile`,
        `workspaceExportFilename` and their tests. `apps/web/lib/appVersion.ts`.
  - [x] `packages/persistence/src/workspaceSerializer.ts` (`exportBattle(id)`, `ExportError`) and
        `errors.ts`.
  - [x] `apps/web/e2e/battleRoute.spec.ts`: the `addInitScript` seeding (`:25`, `:63`, `:1101`) and
        the `saving a battle (Story 2.13)` / `Clear Petri Dish (Story 2.15)` describes.
  - [x] `docs/project-context.md` → "A live region inserted while a dialog is open is never
        announced" (FD2).

- [x] **Task 2: Pure helpers in `apps/web/lib/export/` (AC: 3, 5, 11).**
  - [x] `battleExportFilename.ts` + test (FD7 cases).
  - [x] `exportBattleToFile.ts` + test:
        `exportBattleToFile(serializer: Pick<WorkspaceSerializer, 'exportBattle'>, id: string,
        download = downloadJsonFile): Promise<void>`. It runs `exportBattle(id)`, builds the filename
        from `envelope.battles[0].name`, and calls `download(filename, envelope)`. It rejects with
        the serializer's own error and never calls download on rejection. It shows no UI. It is the
        shape of `exportWorkspaceToFile` (`download` is a test seam, never a prop).
  - [x] `battleExporter.ts`, **the lazily imported module** (FD1): export
        `createBattleExporter(repos: AppRepositories)`. It returns
        `{ exportBattle(id): Promise<void>; exportWorkspace(): Promise<void> }`, built over
        `createWorkspaceSerializer({ repos, appVersion: APP_VERSION, now: () => new Date() })` and
        the two `*ToFile` functions. One small unit test: it builds from injected fake repos and
        both methods reach the download seam, using `vi.mock('./downloadJsonFile')`.

- [x] **Task 3: `saveBattle` reports the id it wrote (AC: 7; FD5).**
  - [x] Split the body: `persistBattle(): Promise<string | null>` holds today's `saveBattle` body
        unchanged and returns the `id` on success, `null` on refusal or throw.
        `saveBattle = useCallback(async () => (await persistBattle()) !== null, [persistBattle])`
        keeps `useLeaveGuard`'s `save(): Promise<boolean>` contract byte-compatible. The identity
        stays stable under the same deps.
  - [x] Do not change what a save does: no refetch, no roster re-seed, no `sessionRoster` clear
        (the existing comment's "exactly two things have changed").
  - [x] Existing `BattlePage.test.tsx` save and leave tests stay green unchanged.

- [x] **Task 4: `<ExportBattleDialog>` (AC: 2, 7, 9).**
  - [x] New `apps/web/components/battle/editor/ExportBattleDialog.tsx`. It lives in `editor/`
        because only the Lab view triggers it (project-context: root is for components both modes
        render). **Presentational and stateless:** props are `open`, `needsSave`, `neverSaved`,
        `onCancel`, `onChooseBattle`, `onChooseWorkspace` and `onExited`. There is no `pending`
        (FD2: nothing async runs while it is open).
  - [x] Copy `UnsavedChangesDialog`'s idiom:
        - per-component MUI imports;
        - `PAPER_MAX_WIDTH = '440px'` and `BUTTON_SX`;
        - `onClose` → `onCancel`;
        - `disableRestoreFocus`;
        - `onTransitionExited={onExited}`;
        - `aria-labelledby` / `aria-describedby` pointing at the title and FR-7.13 body.
  - [x] The needsSave line is a second `DialogContentText` (inside `aria-describedby` via two ids,
        or a wrapping id; pick one and test the computed description).
  - [x] Unit test: roles and names, the three buttons in order, Cancel `autoFocus`, the label switch
        on `needsSave`, the never-saved wording, Escape → `onCancel`, and axe `[]` in both variants.

- [x] **Task 5: Wire `<BattlePage>` (AC: 1–10; FD1–FD9).**
  - [x] `const ExportBattleDialog = dynamic(() => import('./editor/ExportBattleDialog'),
        { ssr: false })`, beside the other two. Add a short comment pointing at the
        `UnsavedChangesDialog` call's bundle rationale. Do not repeat that rationale.
  - [x] State, following the `useLeaveGuard` three-phase shape, kept inline or in a small
        `lib/battle/useExportDialog.ts` if inline grows past ~40 lines:
        - `exportConfirming` (mounted: open or exiting) plus `exportDialogOpen`;
        - `pendingChoiceRef: 'battle' | 'workspace' | null`;
        - `restoreExportFocusRef`;
        - `exportInFlightRef`;
        - `exportError: string | null`.
        `useInertBackground(exportConfirming)` is called from `<BattlePage>` (the dialog's parent),
        above the focus effect.
  - [x] `handleExport` (→ `onExport`) does nothing if `savingRef.current || exportInFlightRef.current`.
        Otherwise it clears `exportError` and opens the dialog.
  - [x] Choose handlers: record `pendingChoiceRef` and close the dialog (`exportDialogOpen = false`).
        **Nothing async runs yet** (FD2).
  - [x] `onExited` does the following:
        1. clear `exportConfirming`;
        2. if a choice is pending, run it (Battle: `needsSave ? persistBattle() → id : persistedId`,
           then `exportBattle(id)`; Workspace: `exportWorkspace()`) through
           `const { createBattleExporter } = await import('@/lib/export/battleExporter')` (FD1);
        3. set `exportError` on rejection;
        4. `finally`: clear the in-flight ref and restore focus to `[data-export-battle]` if focus is
           loose (FD8).
        Guard every post-await `setState` against unmount, following the closure-flag reasoning in
        `useAsyncResource.ts`'s docblock.
  - [x] Pass `onExport={handleExport}` and `exportDisabled={isSaving}` to `<BattleEditorView>`, and
        `saveError={saveError ?? exportError}` (FD9). Clear `exportError` at the start of
        `persistBattle` too, so a later save attempt doesn't leave a stale export message.
  - [x] Mount `{exportConfirming && <ExportBattleDialog … />}` beside `<UnsavedChangesDialog>`.

- [x] **Task 6: `<BattleEditorView>` + `<EditorToolsSection>` (AC: 1).**
  - [x] `BattleEditorViewProps` gains `onExport?(): void` (spec §3.3 already declares it) and
        `exportDisabled?: boolean`. Update the interface's header comment, which lists what each
        story added. Forward both to `<EditorToolsSection>`.
  - [x] `EditorToolsSectionProps` gains `onExport?(): void` and `exportDisabled?: boolean`. Render
        the two buttons in a wrapper with a vertical gap matching the mockup's `.tool-btn`
        `margin-bottom: 8px` (`petri-dish-lab-mode.html:406-421`). Do not add a `transition`
        (trap 9). **Do not** change
        Clear's DOM when `onExport` is absent (AC1): an existing test that queries the lone button
        must still pass. Rewrite the header comment (AC12).
  - [x] Tests: the export button absent without `onExport`; present, labelled, and after Clear with
        it; `disabled` follows `exportDisabled` only (not `livingCells`); click → `onExport` once.

- [x] **Task 7: Tests (AC: 6, 8, 9, 11).**
  - [x] `BattlePage.test.tsx` (or a new `BattlePage.export.test.tsx`, the precedent being
        `BattlePage.modeToggle.test.tsx`; say why in its header): the AC11 component cases. Mock
        `@/lib/export/downloadJsonFile` with `vi.mock` and clear it in `afterEach`. Use the real
        serializer over `createFakeRepositories`. Remember that the MUI transition must finish
        before `onExited` fires: follow how the existing leave-guard tests wait for it.
  - [x] Include an **ordering** test for FD2: at the first moment the export alert exists, no
        `role="dialog"` is in the document.
  - [x] `e2e/battleRoute.spec.ts`: a new `test.describe('export battle (Story 5.6)')` per AC11. Keep
        it thin (RFC-008 Decision 2). Do not add a Playwright project.

- [x] **Task 8: Notes (AC: 12).**
  - [x] The three comment rewrites. The `workspaceSerializer.ts` change is comment-only; confirm
        it with a diff.
  - [x] `deferred-work.md`: mark the 5.4 hand-off entry "CLOSED by Story 5.6" with the choice made
        (FD4), keeping its text. Add a `## Deferred from: Story 5-6-battle-export-dialog (<date>)`
        section holding FD6's workspace-from-a-dirty-battle note, FD1's in-component serializer
        construction, and anything the implementation surfaces.

- [x] **Task 9: Gate (AC: 10, 12).** *(2026-09-25: resolved — see Dev Agent Record resolution
      note. Original HALT text kept below for history.)*
  - [x] Record `/battle` and `/battle/new` **before** (309.6 / 309.3 KB on `bf62145`) and after.
        After: `/battle` **310.1 KB (317556 bytes gzip), 116 bytes OVER the 310 KB / 317440-byte
        budget**; `/battle/new` 309.9 KB (0.1 KB headroom).
  - [x] `npm run ci:dev`, **redirected to a file, not piped**, with the real exit code recorded.
        Never run `npm run ci`. *(2026-09-25: run to completion this session — `ci.log`, exit
        0. See Dev Agent Record.)*
  - [x] `spec:check` resolves every ID you cite (`FR-6.1`, `FR-6.4`, `FR-7.13`, `AR-2`, `AR-12`,
        `AR-27`, `AR-31`, `AR-44`, `Decision E.5`, `Decision F.1`, `Story 5.x` …). `npm run
        spec:check` passes clean (277/277 cited ids resolve).

### Review Findings

_Code review 2026-09-25 (Opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor over `origin/main...HEAD`)._

- [x] [Review][Decision] Filename slug strips every combining mark, not just Latin accents — FD7/AC5 prescribe `normalize('NFKD').replace(/\p{M}+/gu, '')`, which silently garbles scripts whose vowel signs/viramas are `\p{M}` (Devanagari "नमस्ते" loses its vowel signs, Japanese が → か, Hangul decomposes to loose jamo), contradicting the code's own "non-Latin names are kept" claim. The code follows the spec verbatim, so changing it is a spec change. Options: (a) keep FD7 as written and reword the comment to "Latin-accented and mark-free scripts"; (b) strip only marks following a Latin base (`/(\p{Script=Latin})\p{M}+/gu` → `'$1'`) then `normalize('NFC')`, updating FD7/AC5 and adding an Indic/Japanese/Hangul test; (c) drop mark-stripping and NFC-normalise only, accepting `café` → `café.json`. [apps/web/lib/export/battleExportFilename.ts:10-16] **→ Sidiar (2026-09-25): (b)** — strip only marks that follow a Latin base, then `normalize('NFC')`; update FD7/AC5 and add an Indic/Japanese/Hangul test.
- [x] [Review][Decision] No length cap on the export filename — a long battle name (≥ ~250 UTF-8 bytes, sooner for multi-byte scripts) exceeds common filesystem limits and the browser/OS may truncate the name or drop `.json`. FD7 sets no cap and the battle-name field's own max length decides whether this is reachable. Options: (a) accept, if the name field's max length already keeps the slug under the limit; (b) cap the slug (e.g. 100 code points, trailing `-` trimmed) and add the case to FD7 and its test; (c) defer to a later filename-hygiene story together with Windows reserved names (`con`, `nul`). [apps/web/lib/export/battleExportFilename.ts:31-34] **→ Sidiar (2026-09-25): (b), capped at 60 code points** (60 × 4 B + `.json` = 245 B, under the 255-byte limit for any script), trailing `-` trimmed after the cut; add to FD7 and its test. Windows reserved names stay deferred (browsers already rename them).
- [x] [Review][Decision] Page-level export tests mock the whole `battleExporter` module rather than using the real serializer over `createFakeRepositories` with `downloadJsonFile` mocked, as Task 7 specified — so no page-level test can observe AC11's "a rejecting `exportBattle` … and no download". The file header documents the variance (wiring vs. round trip, which `exportBattleToFile.test.ts` owns). Options: (a) accept the variance and record it in the Dev Agent Record as an FD-level deviation; (b) rewrite `BattlePage.export.test.tsx` per Task 7 (real serializer, mocked `@/lib/export/downloadJsonFile`), asserting on the download seam. [apps/web/components/battle/BattlePage.export.test.tsx:17-34] **→ Sidiar (2026-09-25): (a)** — accept; record in the Dev Agent Record as a deviation from Task 7, citing where each guarantee is proven: no-download-on-reject in `exportBattleToFile.test.ts` / `battleExporter.test.ts` (real serializer), the file contents in the AC11 round trip, save-then-export freshness in the e2e dirty-battle case, and wiring/order at page level.
- [x] [Review][Decision] Bundle baselines re-baselined for routes this story does not touch — `npm run bundle:baseline` regenerates every route, so `/` (+104 B), `/organisms` (+66 B) and `/settings` (+184 B) moved alongside `/battle` and `/battle/new`; the Dev Agent Record calls these "pre-existing drift from main" without evidence. The growth-ratchet intent is that unexplained growth is caught, not absorbed. Options: (a) accept (the documented refresh procedure is whole-file, and the drift is small); (b) restore those three routes to `main`'s values and explain or fix their growth separately; (c) change `bundle:baseline` to refresh only named routes. [scripts/bundle-baselines.json:2-6] **→ Sidiar (2026-09-25): (a)** — accept, and correct the Dev Agent Record: the growth is THIS story's, not drift from main. Evidence: the baselines were taken on `main` at `5c338f5`; the only later `main` commit (#81) is scripts/docs; the synced branch already read `/` +0.1, `/organisms` +0.1, `/settings` +0.2 KB before any review patch. Most likely mechanism (unverified): the new lazy chunks grow the shared runtime's chunk map, which every route loads — the same class of side effect Story 2.14 measured.
- [x] [Review][Patch] A stale save error hides every later export failure — `handleExport` cleared only `exportError`, so after a failed save a Workspace (or clean Battle Only) export failure rendered under `saveError ?? exportError` as the OLD save message, contradicting FD9's own "`handleExport` clears both" [apps/web/components/battle/BattlePage.tsx:handleExport]
- [x] [Review][Patch] Focus restore after a completed or failed export ran before React committed — the `finally`'s synchronous `focusExportButtonIfLoose()` could hit the Export button while it was still `disabled={isSaving}` (failed Save & Export) or still `inert`, a spec-mandated no-op leaving focus on `<body>` (FD8/AC9); now requested through state and performed by the post-commit restore effect [apps/web/components/battle/BattlePage.tsx:handleExportExited]
- [x] [Review][Patch] Focus-restore effect also fired on mount and could steal focus from `<body>` to Export Battle on page load; now gated on a restore actually being owed by an export dialog [apps/web/components/battle/BattlePage.tsx:focus-restore effect]
- [x] [Review][Patch] `focusExportButtonIfLoose` treated focus inside ANY dialog as loose, so an export settling after the user opened another dialog (Back → Unsaved Changes, resize-clip warning) yanked focus out of that dialog's trap; now only focus inside the export dialog itself counts [apps/web/components/battle/BattlePage.tsx:focusExportButtonIfLoose]
- [x] [Review][Patch] Clicks during the dialog's fade-out could switch the recorded choice (Battle Only then Entire Workspace exported the workspace) and a Cancel after a choice still exported; the first choice now wins [apps/web/components/battle/BattlePage.tsx:handleChoose]
- [x] [Review][Patch] Stale `runExportChoice` references (merged into `handleExportExited` during the bundle trims) in comments, the test header, and `deferred-work.md`'s FD6 one-liner [apps/web/components/battle/BattlePage.tsx; BattlePage.export.test.tsx; deferred-work.md]
- [x] [Review][Patch] `deferred-work.md`'s FD1 entry still said `/battle` was "fighting a stale absolute ceiling" and asked for the growth ratchet to land first — #81 already landed it [docs/implementation-artifacts/deferred-work.md]
- [x] [Review][Patch] Factually wrong comments: the mount-site comment said the lazy chunk is "never requested on the overwhelmingly common path" (every Export click requests it), and the lifecycle comment claimed it "stayed under Task 5's ~40-line guide" [apps/web/components/battle/BattlePage.tsx]
- [x] [Review][Patch] Test named "…no download is attempted twice" asserted nothing about repeat attempts; now pins `exportBattle` called exactly once [apps/web/components/battle/BattlePage.export.test.tsx]
- [x] [Review][Patch] AC9 focus coverage: only Cancel was tested at page level — added Escape, a failed Save & Export, and a completed Entire Workspace export landing focus on Export Battle [apps/web/components/battle/BattlePage.export.test.tsx]
- [x] [Review][Patch] AC6 "a test pins that the exported cells equal the saved record's grid" was covered only by a cell count; the AC11 round trip now pins `fromBattleExport(...).gridState` against the saved record's `gridState` [apps/web/lib/export/exportBattleToFile.test.ts]
- [x] [Review][Patch] Task 4's "test the computed description" was never tested — added `toHaveAccessibleDescription` for both variants [apps/web/components/battle/editor/ExportBattleDialog.test.tsx]
- [x] [Review][Patch] The FD2 ordering test's `MutationObserver` never disconnected on failure and a regression surfaced as a timeout; now bounded and always disconnected [apps/web/components/battle/BattlePage.export.test.tsx]
- [x] [Review][Patch] The e2e axe scan with the export dialog open ran on a bare `toBeVisible()`, mid-Fade, and failed `color-contrast` on blended colours in the review's `ci:dev` run; now uses the guard test's three-wait settle (`opacity: 1` + 300 ms) [apps/web/e2e/battleRoute.spec.ts:export battle axe test]
- [x] [Review][Defer] Export failure alert can still share a commit with `exportConfirming=false` (so be inserted before `useInertBackground` releases `inert`) if a rejection arrives before React commits the exit — only reachable by a synchronous/microtask rejection; every real rejection source is an IndexedDB request or a cold chunk fetch (a macrotask), so the commit always lands first in practice [apps/web/components/battle/BattlePage.tsx:handleExportExited] — deferred, theoretical today

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

**FD1: Everything heavy is lazy. `/battle` has 0.4 KB of headroom.** This was measured at story
creation on `bf62145` with `npm run build:standalone && npm run bundle:check`:

| Route | First-load gzip | Budget | Headroom |
|---|---|---|---|
| `/battle` | 309.6 KB | 310 | **0.4 KB** |
| `/battle/new` | 309.3 KB | 310 | 0.7 KB |

The budget will not be raised: `check-bundle-size.mjs:64-78` records the owner's 2026-09-09 ruling
and their preference to change the mechanism rather than the threshold. So:
- **The dialog** goes through `next/dynamic` (`ssr: false`), mounted only while open or exiting.
  That is the `UnsavedChangesDialog`/`ResizeClipWarningDialog` shape, and all three share the MUI
  `Dialog` chunk.
- **The export code** goes through a bare `import('@/lib/export/battleExporter')` inside the
  post-choice handler. That covers `createWorkspaceSerializer`, `toEnvelope`, `organismClosure`,
  `APP_VERSION` (which inlines `package.json`), `downloadJsonFile` and both `*ToFile` functions.
  None of it is in the first-load graph. `@gol/domain` is `sideEffects: false`, so
  `organismClosure`/`toEnvelope` tree-shake out of the static graph as long as nothing on the
  static path imports them.
- **What stays static:** the button, the props, the state cells, the handlers and the `import()`
  call sites. Expect roughly 0.2–0.4 KB.
- **Check `bundle:check` after Task 5, before writing tests.** If `/battle` exceeds 310, **stop and
  flag it**. Do not start shaving other code. The owner's options would be to land the deferred
  growth-ratchet gate (`deferred-work.md:398`) first, or to accept a specific trim.

The consequence for AR-2: in Story 5.5 the serializer is built at the page boundary
(`app/(gallery)/settings/page.tsx`). Here it is built **inside the lazy module, from the injected
`repositories`**. It is not built in `app/(battle)/battle/page.tsx` and `battle/new/page.tsx`,
because doing that statically is exactly the first-load cost this route cannot pay. The seam that
AR-2 protects, repositories typed as the interface and injected from the one `createRepositories()`
call, is intact: `createWorkspaceSerializer` is a factory over `AppRepositories`, not a concrete
repository. Record this as a variance in `deferred-work.md` (Task 8) and in the open flags below.

**FD2: Choose → close → act on exit.** A choice button only records the choice and closes the
dialog. The save and export run from `onExited`, once the dialog is gone. This is required by
project-context's live-region rule: `saveBattle` publishes `saveError` into a `role="alert"` from
its `catch`, and `<BattlePage>`'s tree is `inert` and `aria-hidden` while any dialog is mounted, so
an alert inserted then is **never announced**. Acting after exit makes every outcome (save failure,
export failure) insert into a live tree. It also removes the need for a `pending` state in the
dialog. Contrast Story 2.16's Save & Leave, which awaits inside the dialog because it navigates
away on success. Export stays on the page, so it has no such reason.

A download started ~200 ms after the click, after an `await`, is fine: Story 5.5's download already
runs after an awaited `exportWorkspace()`, and all four Playwright projects are green on it.

**FD3: One dialog idiom, one lifecycle.** The route already has three dialogs built on one idiom.
The fourth copies `UnsavedChangesDialog.tsx`:
- guarded `onClose` → `onCancel`;
- `disableRestoreFocus`;
- `onTransitionExited`;
- 440 px paper and `BUTTON_SX`;
- Cancel first with `autoFocus`.

It copies `useLeaveGuard`'s three-phase state (open → exiting → closed), with `useInertBackground`
called from the parent **above** the focus-restore effect. Do not import from
`UnsavedChangesDialog.tsx` or `useLeaveGuard.ts`. Copy the shape. The `import type` rule from
`useLeaveGuard.ts:22-24` applies to `ExportBattleDialogProps`: a value import from the dialog
module would pull MUI into the first-load chunk and defeat FD1.

Button semantics: **Battle Only** is the recommended action, because the dialog opened from a
battle's "Export Battle", so it is contained and last. **Entire Workspace** is a text button in the
middle. It is not destructive, so it does not get `color="error"`.

**FD4: "Saved first", made visible, not silent and not blocked.** The #77 AC leaves the story to
choose between saving first and blocking with a prompt to save. This story saves first, and makes
the save **explicit in the button label** ("Save & Export Battle"), following the Story 2.16
"Save & Leave" precedent. The alternatives were rejected for these reasons:
- **Blocking** would make the user close the dialog, press SAVE, then reopen export. That is three
  steps for one intent, and the block message would sit on a control users will hit on nearly
  every first export: a new battle is always unsaved.
- **A silent save** hidden behind "Battle Only" would write a Gallery entry, or bump `updatedAt`,
  without telling the user. That is the kind of surprise FR-7.9's whole guard exists to avoid.

The save is the **existing** path (Task 3), so it inherits all of the following for free:
- the edit lock;
- the H.1 prune, so the persisted `organismIds` is the placed set, which is what makes 5.4's
  closure seed right;
- first-save id minting;
- `saveError`;
- `isDirty` clearing only on a resolved write.

**FD5: Which id, and why `saveBattle` must report it.** `persistedId = saveStamp?.id ??
loadedIdentity?.id ?? null`. After a save inside the same handler, **`saveStamp` state has not
updated yet**, because the handler closed over the pre-save render. On `/battle/new`'s first save
that value is `null`, so the export would have no id. So `persistBattle()` returns the id it wrote
(Task 3), and the export uses that return value. It never re-reads state after the await.
`saveBattle` keeps returning `boolean` for `useLeaveGuard`.

After a first save on `/battle/new` the URL stays `/battle/new`. That is existing behaviour and not
this story's to change. Export uses the in-memory id, so it does not care.

**FD6: Entire Workspace does not save.** The AC's save obligation is for Battle Only ("before
`exportBattle(id)` is called"), and "Entire Workspace behaves as 5.5", which exports what is
persisted. Saving here would widen the AC. Instead, the `needsSave` body line tells the user that
Entire Workspace "exports only what is already saved". This is flagged below. If the owner wants
parity, it is a one-line `await persistBattle()` before `exportWorkspace()` in the workspace
branch.

Two related gaps stay with Story 5.11:
- `useWorkspaceSeed` is **not** mounted on `/battle`, so a workspace exported from a bookmarked
  battle in a never-seeded profile reflects the unseeded store (5.5 FD6's concern, on a different
  route).
- A partly corrupt store yields a partial file.

**FD7: The filename.** `battleExportFilename(name)`:
- `name.normalize('NFKD').replace(/\p{M}+/gu, '')`, then lowercase;
- `.replace(/[^\p{L}\p{N}]+/gu, '-')`;
- trim the leading and trailing `-`;
- if the result is empty, apply the same pipeline to `battleDisplayName('')`, giving
  `untitled-battle`;
- append `.json`.

Unicode letters are **kept**, so a Hebrew or Japanese name keeps its own script. The alternatives,
an ASCII strip or a fallback, would erase the name entirely, and FR-6.4's intent is "based on the
battle name". There is no length cap beyond `MAX_BATTLE_NAME_LENGTH`, which the schema already
enforces on the name.

Test cases:

| Input | Output |
|---|---|
| `'Triple Threat'` | `triple-threat.json` |
| `'  Triple   Threat  '` | `triple-threat.json` |
| `'Café Wars!'` | `cafe-wars.json` |
| `'Battle #2: Rematch'` | `battle-2-rematch.json` |
| `''` | `untitled-battle.json` |
| `'   '` | `untitled-battle.json` |
| `'🔥🔥'` | `untitled-battle.json` |
| `'!!!'` | `untitled-battle.json` |
| a non-Latin name, e.g. `'מלחמה'` | `מלחמה.json` |

The fallback is derived from `battleDisplayName`, not typed as a second literal, so it cannot
drift from the header's "Untitled Battle".

**→ Sidiar (2026-09-25), superseding the two paragraphs above (Review][Decision] items 1–2):**

1. **Latin-only mark stripping.** Stripping every `\p{M}` regardless of script (the original
   pipeline above) silently garbles scripts whose marks carry meaning: Devanagari vowel
   signs/virama, Japanese dakuten/handakuten (がんばれ → かんはれ), and Hangul, whose precomposed
   syllables NFKD-decompose into loose jamo with nothing to recompose them. The fix strips
   combining marks only where they follow a **Latin** base character, then renormalises to NFC:
   - `name.normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')`, then
     lowercase;
   - `.replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')` — **`\p{M}` is now exempted here too.** The literal
     regex the review offered (`[^\p{L}\p{N}]+`, unchanged) still reads a surviving non-Latin mark
     (a Devanagari matra, a Japanese dakuten) as "not a letter or number" and turns it into a
     hyphen, contradicting the review's own "नमस्ते, がんばれ, 전투 survive intact" — so this
     one extra exemption was necessary to actually deliver the stated outcome, not a separate
     policy choice. Flagging it here per project-context's "surface any new conflict" rule rather
     than silently picking a reading.
   - trim leading/trailing `-`; fallback and `.json` suffix unchanged.

2. **60-code-point cap**, capped at 60 code points, trailing `-` trimmed after the cut, applied to
   the slug **before** the empty-check that triggers the `untitled-battle` fallback:
   - `Array.from(slug).slice(0, 60).join('').replace(/-+$/, '')` — code points via `Array.from`,
     never `.slice()`/`.length` on the raw string, which count UTF-16 units and can split a
     surrogate pair (an astral character) in two.
   - 60 code points × 4 bytes (UTF-8 worst case, any script) + `.json` (5 bytes) = 245 bytes,
     under the 255-byte filename limit most filesystems enforce.
   - Windows reserved device names (`con`, `nul`, …) stay deferred — browsers already rename them
     on save.

Updated test cases (superseding the table above):

| Input | Output |
|---|---|
| `'Triple Threat'` | `triple-threat.json` |
| `'  Triple   Threat  '` | `triple-threat.json` |
| `'Café Wars!'` | `cafe-wars.json` |
| `'Café Duel'` | `cafe-duel.json` |
| `'Battle #2: Rematch'` | `battle-2-rematch.json` |
| `''` | `untitled-battle.json` |
| `'   '` | `untitled-battle.json` |
| `'🔥🔥'` | `untitled-battle.json` |
| `'!!!'` | `untitled-battle.json` |
| a non-Latin name, e.g. `'מלחמה'` | `מלחמה.json` |
| Devanagari `'नमस्ते'` | `नमस्ते.json` (vowel signs/virama intact) |
| Japanese `'がんばれ'` | `がんばれ.json` (voiced kana intact) |
| Hangul `'전투'` | `전투.json` (composed syllables, not loose jamo) |
| a long Latin name (kebab exceeds 60 code points) | truncated to 60 code points |
| a long CJK name (70 code points, no separators) | truncated to exactly 60 code points |
| a boundary case where the 60-code-point cut lands on a `-` | trailing `-` trimmed |
| a surrogate-pair character exactly at the cut | kept whole, never split into a lone surrogate |

**FD8: Focus lands on EXPORT BATTLE after the operation settles, not at exit.** The button wears
`disabled={isSaving}`, the visible half of the edit lock like every other sidebar control. If focus
were restored at dialog exit and a save then started, the focused button would disable and focus
would drop to `<body>`. That trap is recorded in `deferred-work.md` for Clear (Stories 2.15/4.14).
So:
- restore in the operation's `finally`, and immediately on exit only for Cancel;
- use a DOM lookup (`[data-export-battle]`), never a captured element, because WebKit does not
  focus a `<button>` on click (`useLeaveGuard.ts:92-99`);
- restore only when focus is loose (null, `<body>`, or inside the closing dialog).

**FD9: One alert line, not two.** Export failures reuse the `saveError` slot: `<BattlePage>`
passes `saveError ?? exportError`. This adds no new prop and no new surface. Both states are
cleared at the start of any save or export attempt, so a stale message never outlives the next
action. The two cannot be non-null at once in practice, because `persistBattle` clears
`exportError` and `handleExport` clears both. If they ever were, the save message wins, which is
the more actionable one.

**FD10: An empty battle is exportable.** Unlike Clear (disabled on zero living cells, because
clearing nothing is a no-op), exporting an empty battle is a real, if odd, file: zero cells and
zero organisms. `WorkspaceExportSchema` accepts it, since `kind: 'battle'` only requires exactly
one battle. Verify that with a unit test rather than assuming it. Disabling Export on empty would
also block exporting a fresh `/battle/new` to see the format.

**FD11: No success toast, no spinner, no `aria-busy`.** Story 5.5's stance (its FD8 and "What NOT
to build") carries over: the browser's download UI is the confirmation. A save-and-export changes
`data-dirty` to `false` and the SAVE button's state, which is visible feedback enough.

**FD12: Lab only.** FR-7.13 says "when exporting from within a Battle", and spec §3.7 places the
control in the Lab Tools section. The Run view (`<BattleSimulationView>`) gets nothing, and the
Run-mode hotkeys (Story 3.19) are untouched. The control never has to reason about live Run state:
AC6 holds because the store only ever has `initialGrid`.

### What exists: read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/battle/BattlePage.tsx` | **Modified.** It holds `saveBattle` (split, Task 3), `saveStamp`/`loadedIdentity` (the id, FD5), `savingRef`/`isSaving` (the lock), `useLeaveGuard` (the lifecycle model), and two `next/dynamic` calls with their bundle history. Every hook precedes four early returns. |
| `apps/web/components/battle/editor/BattleEditorView.tsx` | **Modified.** The props interface at `:66-170`, whose header comment lists each story's additions. The Tools section is at `:876-885`. `saveError` renders as `SaveErrorLine role="alert"` at `:460`. |
| `apps/web/components/battle/editor/EditorToolsSection.tsx` (+ test) | **Modified.** `ToolButton` styles, including the no-`transition` and `--gol-border-control` traps. Its header comment names this story. |
| `apps/web/components/battle/UnsavedChangesDialog.tsx`, `lib/battle/useLeaveGuard.ts` | The dialog idiom and lifecycle to copy (FD3). Do not import either. |
| `apps/web/lib/useInertBackground.ts` | Call it from the parent, above the focus effect. It handles the lazy-chunk race through its observer. |
| `apps/web/lib/export/{downloadJsonFile,exportWorkspaceToFile,workspaceExportFilename}.ts` | Story 5.5's seam. Reuse it unchanged. `exportWorkspaceToFile` gets a header-comment edit only. |
| `apps/web/lib/appVersion.ts` | `APP_VERSION`. Import it **only** from the lazy `battleExporter.ts` (FD1). |
| `packages/persistence/src/workspaceSerializer.ts`, `errors.ts` | `exportBattle(id)` → `load(id)` → closure → envelope, and `ExportError('not-found')`. Comment-only edit (AC12). |
| `packages/domain/src/workspaceExportSchema.ts` | `WorkspaceExportSchema`: `kind: 'battle'` has exactly one battle, and the battle name is `.max(MAX_BATTLE_NAME_LENGTH)`. |
| `apps/web/lib/battleDisplayName.ts` | The "Untitled Battle" source for FD7's fallback. |
| `packages/test-utils` | `createFakeRepositories`, `createMockWorkspace`, `MOCK_BATTLE_IDS`. |
| `apps/web/e2e/battleRoute.spec.ts` | Seeding idiom, the save and Clear describes to extend. |
| `scripts/check-bundle-size.mjs:59-91` | The `/battle` and `/battle/new` 310 ceilings and the no-raise ruling. |

### Architecture compliance

- **AR-2 / AR-27**: repositories are injected. The serializer is built from them in a lazy module
  (FD1 variance, flagged).
- **FR-6.1 / A-2 / AR-31**: initial state only. The Lab view is the only entry.
- **FR-6.3**: the envelope already carries name, dimensions, organisms, grid and metadata (Story
  5.3). Nothing changes here.
- **FR-6.4**: kebab-case filename (FD7).
- **FR-7.13**: the two-option prompt, quoted.
- **Decision E.5 / RFC-006 Decision 4**: the closure is computed by `exportBattle(id)`, which reads
  through repositories. Do not recompute it in `apps/web`.
- **Decision F.1 / AR-12**: no settings in any envelope.
- **RFC-005**: `isDirty` is cleared only by a resolved save, and export never clears it itself.
- **No DOM in `packages/*`**: the download stays in `apps/web/lib/export/`.
- **One theme / `--gol-*` only**: AR-46 no-raw-hex is live. Reuse `ToolButton`; use no new colours.
- **Naming**: `battleExportFilename.ts`, `exportBattleToFile.ts`, `battleExporter.ts` (camelCase),
  `ExportBattleDialog.tsx` (PascalCase).

### Library / framework notes

Nothing new is installed. The relevant stack:
- React 19.2;
- Next 16.2 static export, with `next/dynamic` for the dialog and a bare `import()` for the module;
- MUI v9, per-component imports: `Dialog`, `DialogTitle`, `DialogContent`, `DialogContentText`,
  `DialogActions`, `Button`;
- Vitest 4 + RTL + vitest-axe;
- Playwright: `page.waitForEvent('download')`, `download.suggestedFilename()`, `download.path()`.

The regex `\p{…}` classes need the `u` flag, and ES2022 supports them. Playwright's
`suggestedFilename()` returns the `download` attribute verbatim, so a Unicode filename survives,
but keep the e2e on an ASCII name.

### Testing standards

- Every test guards a named failure:
  - export of a stale saved copy over unsaved edits;
  - a first-save export with a `null` id;
  - an export after a failed save;
  - a save on Entire Workspace;
  - a save or export on Cancel;
  - an alert inserted while the dialog is still mounted;
  - focus dropped to `<body>`;
  - a non-kebab or empty filename;
  - an export button in Run mode;
  - `/battle` over budget.
- Name each `it` as a full sentence stating the invariant, with the reason in parentheses.
- `apps/web` has no coverage gate. Don't pad.
- jsdom lacks `URL.createObjectURL`. Mock `downloadJsonFile` at the component level (the 5.5
  pattern), and stub the URL APIs only in the helper's own test.
- Wait for the MUI exit transition before asserting post-exit effects. Copy the existing leave-guard
  tests' wait.

### Previous story intelligence

- **Story 5.5**:
  - `lib/export/` is the seam, and `downloadJsonFile` is the only DOM export code;
  - the filename comes from the envelope (one source);
  - a `useRef` in-flight guard, no self-disabling;
  - the StrictMode `mountedRef` bug (re-arm the flag in the effect body, or better, use a
    closure-flag per `useAsyncResource`);
  - e2e "no settings key" must assert on the **raw** `JSON.parse`, because Zod strips unknown keys;
  - round-trip tests capture the exact bytes the seam writes.
- **Story 5.4**: `exportBattle(id)` restored to the RFC shape by owner ruling, which created this
  story's save obligation. Review lessons: history is struck, never deleted; runtime strings carry
  no story IDs; an invariant you rely on gets a pinning test.
- **Story 2.16**: the leave guard's save-and-leave, the boolean-returning `saveBattle`, and the
  `restoreBackFocusRef` + DOM-lookup focus pattern.
- **Story 2.15 / 4.14**: the self-disabling-button focus trap (FD8).

### Git intelligence

`main` is at `bf62145` (#78 Story 5.5, #79 BattlePage title flake, #75 Story 4.20). Epic 5's recent
work is in `components/settings/` and `lib/export/`. **This is the first Epic 5 story to touch
`components/battle/`**, which the Epic 4 lane also works in: 4.24 and 4.25 add the roster
✎/create affordances and a lazy organism-editor modal over `<BattlePage>`. See the proposed lane
gate below. This story adds **no** `@gol/domain` barrel export.

### Project Structure Notes

- New: `apps/web/lib/export/{battleExportFilename,exportBattleToFile,battleExporter}.ts` (+ tests).
- New: `apps/web/components/battle/editor/ExportBattleDialog.tsx` (+ test).
- Optional new: `apps/web/lib/battle/useExportDialog.ts` (only if Task 5's inline state grows).
- Modified: `BattlePage.tsx` (+ test or new `BattlePage.export.test.tsx`), `BattleEditorView.tsx`,
  `EditorToolsSection.tsx` (+ test), `e2e/battleRoute.spec.ts`.
- Comment-only: `packages/persistence/src/workspaceSerializer.ts`,
  `apps/web/lib/export/exportWorkspaceToFile.ts`.
- Docs: `deferred-work.md`, `sprint-status.yaml`.
- Untouched on purpose:
  - `scripts/check-bundle-size.mjs`;
  - every `package.json`;
  - `packages/domain/src/index.ts`;
  - `useLeaveGuard.ts`, `UnsavedChangesDialog.tsx`;
  - `<BattleSimulationView>` and all of `simulation/`;
  - `app/(battle)/**/page.tsx` (FD1).

### What NOT to build

- ❌ An export affordance in Run mode or fullscreen (FD12).
- ❌ Import, or anything in `/settings` (5.9).
- ❌ A static import of the serializer, `APP_VERSION`, or the dialog into `/battle`'s first-load
  graph (FD1). ❌ A budget raise.
- ❌ A second closure computation in `apps/web` (Decision E.5 lives in `exportBattle`).
- ❌ Saving on Entire Workspace (FD6, flagged).
- ❌ A success toast, spinner, `aria-busy`, or `disabled` on the focused button while exporting
  (FD8, FD11).
- ❌ `showSaveFilePicker`, `file-saver`, or any new dependency.
- ❌ Changing the URL after a first save on `/battle/new` (FD5; existing behaviour).

### Open flags for the owner (not blockers: the story proceeds on the FDs)

- **FD1 (variance from Story 5.5 AC7):** on `/battle` the serializer is constructed inside a
  lazily loaded module from the injected repositories, not at the route boundary, because
  `/battle` has 0.4 KB of headroom. If the owner prefers boundary construction, the growth-ratchet
  gate (`deferred-work.md:398`) has to land first.
- **FD4:** "Save & Export Battle" saves first rather than blocking. It is visible in the label, and
  it creates a Gallery entry for a never-saved battle.
- **FD6:** Entire Workspace from a dirty battle exports the *saved* copy of that battle, and the
  dialog says so. Saving there too would be a one-line change.
- **Bundle risk:** if Task 5 cannot fit in 0.4 KB, the dev agent stops and flags it (AC10) rather
  than raising the budget.

### References

- `docs/planning-artifacts/epics.md:1381-1393` (Story 5.6, including the #77 AC), `:1369-1379`
  (5.5), `:1357-1367` (5.4), `:1277-1300` (4.24/4.25, same surface).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md`: FR-6.1 (`:390-394`), FR-6.3
  (`:399-408`), FR-6.4 (`:410-411`), FR-7.9 (`:451-455`), FR-7.13 (`:466-470`), A-2 (`:778-779`).
- `docs/planning-artifacts/component-tree-battle-page.md`: §2 (tree), §3.3 (`onExport?` on
  `BattleEditorViewProps`), §3.7 (`EditorToolsSection`), §3.15 (dialogs), row "6.1, 7.13" (`:453`).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md` Decision 4 (`:185-212`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html:407-421,727-733`
  (Tools buttons; the export dialog has no mockup, per `UX-PHASE-COMPLETION-REVIEW.md:145,170`).
- `docs/implementation-artifacts/deferred-work.md:2680-2700` (variance (7) withdrawn),
  `:2863-2870` (the 5.4 → 5.6 hand-off), `:3013-3019` (5.5 revoke-timing defer, same seam),
  `:398` (growth-ratchet gate).
- `docs/implementation-artifacts/5-5-export-workspace.md` (FD3/FD4/FD8, AC6/AC7, review findings),
  `5-4-rule-aware-organism-closure.md` (owner ruling (b)).
- `docs/project-context.md`: repositories injected; the live-region-while-dialog rule; `ci:dev`
  never piped; `spec:check` IDs; no raw hex; the Playwright viewport note.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5). Tasks 1–8 and the initial Task 9 attempt (through the HALT) were
one Sonnet session; the 2026-09-25 completion of Task 9 (baseline refresh, `ci:dev`, story
close-out) is a **second, separate Sonnet session** resuming the halted run from the synced branch;
the 2026-09-25 owner review-decision close-out (filename fix, decision annotations, final `ci:dev`)
is a **third, separate Sonnet session** resuming after the owner answered the four
`[Review][Decision]` items.

### Debug Log References

- `npm run typecheck` — green (all 5 workspaces).
- `npm run lint` — green (0 errors; 1 pre-existing unrelated warning in `BattleGallery.tsx`).
- `npm run format:check` — green (after `prettier --write` on the two new/touched test files).
- `npm run spec:check` — green: 277/277 cited spec ids resolve.
- `npm run boundary:check` — green: 7 escape shapes rejected, 2 legitimate imports accepted.
- `npm run test:coverage` (`apps/web` + all `@gol/*` packages) — green on a clean run (2177 web
  tests + 103 persistence tests, all passing); one earlier run under coverage instrumentation hit
  5000ms timeouts in `OrganismEditorModal.test.tsx` / `RulesEditor.test.tsx` (Epic 4 lane files,
  untouched by this story) — confirmed CPU-contention flakes, both by re-running the coverage gate
  clean and by running those two files alone (128/128 passing in 13s).
- `npm run build:standalone` — green.
- `npm run bundle:check` — **FAILED** on `main`'s absolute-budget gate: `/battle` measured 310.1 KB
  gzip (317,556 bytes) against the 310 KB (317,440-byte) budget — **116 bytes over**. `/battle/new`
  measured 309.9 KB (0.1 KB headroom). See "HALT" below. **Superseded 2026-09-25**: PR #81 (owner-
  approved) replaced the absolute ceiling with the growth gate in
  `scripts/check-bundle-size.mjs`/`scripts/bundle-baselines.json`; see the resolution note below.
- `npm run bench` / `bench:check` / `e2e:chromium` — **not run this session**: the story's own stop
  rule (AC10, FD1) said stop at the bundle gate rather than continue the chain past a failing
  `bundle:check`. Completed in the 2026-09-25 resumption session below.

**2026-09-25 resumption session (second Sonnet session, resuming the halt above):**

- Branch synced with `main` (merge commit `c128c99`) after PR #80 (Story 4.21) and PR #81 (the
  bundle growth-ratchet gate) both merged. `scripts/bundle-baselines.json` on `main` at that point
  was measured **without** this story's code (baseline `/battle` 309.5 KB / 316,924 bytes,
  `/battle/new` 309.3 KB / 316,721 bytes — same numbers as the story's own "before" measurement,
  modulo the 0.1 KB rounding already noted in FD1).
- `npm run build:standalone` — green (Turbo cache hit; no code changed since the prior build).
- `npm run bundle:check` — **PASSES** against the growth gate: `/battle` 310.1 KB vs. baseline
  309.5 KB (**+0.6 KB**, within the 8 KB allowance); `/battle/new` 309.9 KB vs. baseline 309.3 KB
  (**+0.6 KB**). `/` +0.1 KB, `/organisms` +0.1 KB, `/settings` +0.2 KB. **Correction (Review][Decision]
  item 4, → Sidiar 2026-09-25): this growth is THIS story's own, not "pre-existing drift from
  `main`" as first recorded here.** Evidence: the committed baselines were measured on `main` at
  `5c338f5`; the only later `main` commit before this branch synced (#81) touched only
  `scripts/`/docs, not any of `/`, `/organisms`, `/settings`'s source; and the synced branch
  already read `/` +0.1, `/organisms` +0.1, `/settings` +0.2 KB **before** the code-review patch
  landed, i.e. from this story's Tasks 1–8 code alone. Most likely mechanism (unverified): the new
  lazy chunks (`ExportBattleDialog`, `battleExporter`) grow the shared runtime's chunk map, which
  every route loads — the same class of cross-route side effect Story 2.14 measured for a lazy
  chunk elsewhere.
- `npm run bundle:baseline` — refreshed `scripts/bundle-baselines.json` (tool-written; not hand-
  edited): `/` 341838→341942, `/battle` 316924→317553, `/battle/new` 316721→317350, `/organisms`
  306101→306167, `/settings` 300846→301030 (bytes gzip). Re-ran `bundle:check` after: all five
  routes read `+0.0 KB`.
- `npm run ci:dev > ci.log 2>&1; echo $?` — **exit 0**. All stages green: `typecheck`, `lint`,
  `format:check`, `spec:check`, `boundary:check`, `test:coverage` (134 web test files / 2212 tests
  passed; all `@gol/*` packages green — no flakes this run), `build:standalone`, `bundle:check`
  (all 5 routes within the 8 KB growth allowance), `bench` + `bench:check` (9.435 ms headroom,
  56.6% of the 16.667 ms frame budget), `e2e:chromium` (278 passed, 1 pre-existing conditional
  skip unrelated to this story — `deleteBattle.spec.ts:113` touch-pointer case — 0 failures). The
  new `export battle (Story 5.6)` describe block in `e2e/battleRoute.spec.ts` ran all 6 cases
  green, including the axe scan. `ci.log` kept locally as an untracked artifact, not committed.

**2026-09-25 owner review-decision session (third Sonnet session, resuming after the four
`[Review][Decision]` answers):**

- `npm run build:standalone` — green.
- `npm run bundle:check` — **PASSES**, `+0.0 KB` on all 5 routes (`/`, `/battle`, `/battle/new`,
  `/organisms`, `/settings`): the filename-pipeline rewrite lives entirely inside the lazily
  loaded `battleExporter` chunk, not the first-load graph, so no route moved and `bundle:baseline`
  did not need to be re-run.
- `npm run ci:dev > ci.log 2>&1; echo $?` — **exit 0**. All stages green: `typecheck`, `lint`,
  `format:check`, `spec:check`, `boundary:check`, `test:coverage` (134 web test files / **2225**
  tests passed, up from the prior session's 2212 — this session's own 8 new
  `battleExportFilename.test.ts` cases plus normal suite variance from files touched since;
  all `@gol/*` packages green, no flakes this run: `@gol/persistence` 103/103, `@gol/simulation`
  408/408, `@gol/test-utils` 95/95, `@gol/domain` 212/212), `build:standalone`, `bundle:check`
  (`+0.0 KB` all 5 routes), `bench` + `bench:check` (7.952 ms headroom, 47.7% of the frame budget),
  `e2e:chromium` (278 passed, 1 pre-existing conditional skip — `deleteBattle.spec.ts:113`, same as
  the prior session, unrelated to this story — 0 failures). The `export battle (Story 5.6)` describe
  block ran all 6 cases green, including the axe scan, with no test changes needed (the e2e cases
  use ASCII seeded names, per Dev Notes' own "keep the e2e on an ASCII name"). `ci.log` kept locally
  as an untracked artifact, not committed.

### Completion Notes List

- Tasks 1–8 complete: pure export helpers (`battleExportFilename.ts`, `exportBattleToFile.ts`,
  `battleExporter.ts`), `<ExportBattleDialog>`, the `BattlePage.tsx` wiring (`persistBattle` split,
  the dialog's three-phase lifecycle, `handleExportExited`'s save-then-export sequencing), the
  `EditorToolsSection`/`BattleEditorView` prop threading, comment rewrites (`EditorToolsSection.tsx`,
  `workspaceSerializer.ts`, `exportWorkspaceToFile.ts`), and the `deferred-work.md` updates (the 5.4
  hand-off entry closed, a new "Deferred from: Story 5-6" section with the FD1/FD6 variances).
- Full test suite: `battleExportFilename.test.ts`, `exportBattleToFile.test.ts`,
  `battleExporter.test.ts` (`apps/web/lib/export/`); `ExportBattleDialog.test.tsx`,
  `EditorToolsSection.test.tsx` additions, `BattleEditorView.test.tsx` additions,
  `BattlePage.export.test.tsx` (new file, 11 tests — the `BattlePage.modeToggle.test.tsx`
  file-hoisted-`vi.mock` precedent, this time mocking `@/lib/export/battleExporter`); two existing
  `BattlePage.test.tsx` button-count assertions updated (+1 for the new Export Battle button);
  `e2e/battleRoute.spec.ts` gained `test.describe('export battle (Story 5.6)')` (6 cases — the
  original count here of "7" was a miscount, corrected in the 2026-09-25 resolution below) and its
  existing "Tools section" test was updated to expect both buttons. All of the above pass.
- **⛔ HALT at Task 9 (AC10): `/battle` is 116 bytes (0.1 KB) over its 310 KB bundle budget.**
  Per the story's own stop rule ("If the story cannot fit, stop and flag it. Do not raise the
  budget and do not trim unrelated code to make room") and the explicit instruction not to raise
  the budget, this run stops here rather than pushing to `review`.
  - Three rounds of in-scope trimming were made to `BattlePage.tsx`'s own new code before stopping
    (each re-measured): merged `handleChooseBattle`/`handleChooseWorkspace` into one `handleChoose`
    with inline JSX closures (139 → 129 bytes over); removed `restoreExportFocusRef` entirely by
    reusing `exportInFlightRef` (already required for FD11 re-entrancy) as the cancel-vs-choice
    signal for the focus-restore effect (129 → 116 bytes over); merged the separate
    `runExportChoice` function into `handleExportExited` itself, since MUI's `onTransitionExited`
    ignores a returned Promise (no measurable further drop, but real code simplified). All three
    trims are net code-quality improvements (less state, less duplication), not code golf, and are
    kept regardless of outcome. Full test suite re-verified green after each round (508/508 in
    `components/battle/`).
  - Not attempted, and flagged rather than done unilaterally: cutting the `exportMountedRef`
    unmount-safety guard (Task 5 explicitly requires it, and `<DataManagement>` carries the
    identical pattern — removing it to save ~100 bytes would be trimming required correctness code,
    not "unrelated" code, but still a call for the owner, not this agent, to make) or shortening the
    two AC8 failure sentences (the AC's own "For example:" wording suggests they are illustrative
    rather than byte-exact, but changing user-facing copy to fit a budget felt like the wrong trade
    to make without asking).
  - The story's own Dev Notes already named the two owner-facing options for exactly this outcome:
    land the deferred growth-ratchet gate (`deferred-work.md`'s "the bundle gate moves off absolute
    budgets" entry) first, or accept a specific trim. Recorded as the open item in this story's own
    "Deferred from: Story 5-6" section (`deferred-work.md`) and here.
  - Everything up to and including `test:coverage` is green; the working tree is NOT committed.

- **✅ RESOLUTION (2026-09-25, second Sonnet session).** The HALT above is kept verbatim for
  history; it is not superseded by editing it. What changed: with the owner's explicit approval,
  `chore/bundle-growth-ratchet` (PR #81) replaced `check-bundle-size.mjs`'s absolute per-route
  budget with a growth gate (8 KB gzip allowance past a committed baseline in
  `scripts/bundle-baselines.json`), landed on `main` and merged into this branch (`c128c99`). None
  of the three code trims from the HALT were reverted — they stand as real quality improvements,
  independent of the gate change. This session:
  1. Re-ran `npm run build:standalone` (Turbo cache hit — no source changed since the branch sync)
     and `npm run bundle:check`: passes. `/battle` +0.6 KB, `/battle/new` +0.6 KB over the `main`
     baseline (309.5 / 309.3 KB) — both well inside the 8 KB allowance, and both driven entirely by
     this story's own code, not drift.
  2. Ran `npm run bundle:baseline` to refresh `scripts/bundle-baselines.json` to this story's
     measured numbers (see the Debug Log entry above for the exact byte diff). The file is tool-
     written; no number was hand-edited.
  3. Ran `npm run ci:dev > ci.log 2>&1; echo $?` to completion: **exit 0**, no flakes, no HALT.
  4. Appended a dated annotation under AC10 (kept the AC text unchanged) recording that the
     absolute-budget bullets are retired in favour of the growth gate, per project-context's rule.
  5. Cleared Task 9's HALT marker and ticked its remaining `ci:dev` subtask.
  - The Task 8 `deferred-work.md` open item this HALT pointed at ("land the growth-ratchet gate
    first, or accept a specific trim") is itself already marked ✅ RESOLVED at `deferred-work.md:408`
    by PR #81 — no further edit needed there.

- **Owner review-decision session (2026-09-25, third Sonnet session, resuming after the owner
  answered the four `[Review][Decision]` items).**
  1. **Filename slug (items 1–2, `apps/web/lib/export/battleExportFilename.ts`):** rewrote
     `kebabCase` to strip combining marks only when they follow a **Latin** base
     (`.normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')`) instead of
     stripping every `\p{M}` regardless of script. **One correction beyond the review's literal
     example regex was required to actually satisfy its own stated outcome:** the existing
     "not a letter or number → `-`" step (`[^\p{L}\p{N}]+`) still reads a surviving non-Latin mark
     (a Devanagari vowel sign, a Japanese dakuten) as punctuation and turns it into a hyphen —
     confirmed empirically (`नमस्ते` → `नमस-त` with the literal example alone). Exempting `\p{M}`
     in that step too (`[^\p{L}\p{N}\p{M}]+`) was necessary to make Devanagari/Japanese/Hangul
     actually "survive intact" as the decision specifies. Flagged per project-context's "surface any
     new conflict" rule rather than silently choosing a reading; this is a mechanical fix to
     deliver the stated outcome, not a separate policy call. Added the 60-code-point cap
     (`Array.from`-based, never `.slice()`/`.length` on the raw string, so a surrogate pair at the
     cut is never split) with trailing-`-` trim after the cut. FD7 and AC5 annotated with dated
     owner-decision notes (not silently rewritten). 8 new unit tests: Café Duel (mid-word Latin
     accent), Devanagari, Japanese voiced kana, Hangul (pinned to composed-syllable code points, not
     jamo), a long Latin name, a long CJK name, a hyphen-at-the-cut boundary, and a surrogate-pair-
     at-the-cut boundary. All 17 tests in `battleExportFilename.test.ts` pass; the full
     `apps/web/lib/export/` + `apps/web/components/battle/` suite (548 tests) is green with no
     regressions.
  2. **Page-level test variance (item 3): accepted, no test rewrite**, per the owner's ruling. This
     is a deliberate deviation from Task 7's literal instruction ("uses the real
     `createWorkspaceSerializer` over `createFakeRepositories`... `downloadJsonFile` mocked") for
     `BattlePage.export.test.tsx` specifically, which instead mocks the whole
     `@/lib/export/battleExporter` module (documented in that file's own header). AC11's guarantees
     are proven elsewhere instead:
     - **no download on a rejecting export:** `exportBattleToFile.test.ts` and
       `battleExporter.test.ts`, both over the real serializer;
     - **the file's exact contents** (envelope shape, `kind: 'battle'`, organism closure, no
       `settings` key): the AC11 round trip in `exportBattleToFile.test.ts`;
     - **save-then-export freshness** (the saved id flows into the export): the e2e dirty-battle
       case in `e2e/battleRoute.spec.ts`'s `export battle (Story 5.6)` describe;
     - **wiring and ordering** (save before export, choice-then-close-then-act, the FD2 alert-after-
       exit ordering, focus restore per path): `BattlePage.export.test.tsx` itself, at the page
       level, over the mocked module.
     No code change for this item; only this record and the story's `[Review][Decision]` tick.
  3. **Bundle-baseline drift (item 4): accepted, and the Dev Agent Record corrected** — see the
     "Correction" note inline in the Debug Log's 2026-09-25 resumption entry above: the `/`,
     `/organisms`, `/settings` growth is this story's own code (the new lazy chunks' effect on the
     shared runtime's chunk map), not pre-existing drift from `main` as first recorded. No further
     code or baseline change; `scripts/bundle-baselines.json` already carries the correct
     (tool-written) numbers from the prior session.
  - Re-ran `npm run build:standalone` and `npm run bundle:check`: still passes, unchanged from the
    prior session (no route touched by this session's one code change to first-load-excluded
    filename logic). No `bundle:baseline` re-run needed (no route moved).
  - `npm run ci:dev > ci.log 2>&1; echo $?` — **exit 0** (see Debug Log below for the full
    breakdown).

### File List

**New:**
- `apps/web/lib/export/battleExportFilename.ts` (+ `.test.ts`)
- `apps/web/lib/export/exportBattleToFile.ts` (+ `.test.ts`)
- `apps/web/lib/export/battleExporter.ts` (+ `.test.ts`)
- `apps/web/components/battle/editor/ExportBattleDialog.tsx` (+ `.test.tsx`)
- `apps/web/components/battle/BattlePage.export.test.tsx`

**Modified:**
- `apps/web/components/battle/BattlePage.tsx` (`persistBattle`/`saveBattle` split, the export
  dialog's state/refs/effects/handlers, `<BattleEditorView>` props, `<ExportBattleDialog>` mount)
- `apps/web/components/battle/editor/BattleEditorView.tsx` (`onExport?`/`exportDisabled?` on the
  props interface and `EditorMainProps`' `Omit`, forwarded to `<EditorToolsSection>`)
- `apps/web/components/battle/editor/EditorToolsSection.tsx` (+ `.test.tsx`) (`onExport?`/
  `exportDisabled?`, the second `ToolButton`, the `:not(:last-child)` margin rule)
- `apps/web/components/battle/BattlePage.test.tsx` (two button-count assertions updated)
- `apps/web/components/battle/editor/BattleEditorView.test.tsx` (new "Export Battle wiring" describe)
- `apps/web/e2e/battleRoute.spec.ts` (new `export battle (Story 5.6)` describe; the Tools-section
  button-count test updated; two new imports)
- `apps/web/lib/export/exportWorkspaceToFile.ts` (header comment only)
- `packages/persistence/src/workspaceSerializer.ts` (JSDoc comment only)
- `scripts/bundle-baselines.json` (refreshed via `npm run bundle:baseline`, tool-written, to this
  story's measured first-load gzip sizes — see Change Log)
- `docs/implementation-artifacts/deferred-work.md` (5.4 hand-off entry closed; new "Deferred from:
  Story 5-6-battle-export-dialog" section)
- `docs/implementation-artifacts/5-6-battle-export-dialog.md` (this file: frontmatter
  `baseline_commit`, Status, Tasks/Subtasks, Dev Agent Record, AC5/FD7 dated owner-decision
  annotations, `[Review][Decision]` items ticked)
- `docs/implementation-artifacts/sprint-status.yaml` (`5-6-battle-export-dialog: in-progress` →
  `review`)

**Modified (2026-09-25 owner review-decision session):**
- `apps/web/lib/export/battleExportFilename.ts` (Latin-only mark stripping + NFC recompose,
  60-code-point cap, rewritten comments)
- `apps/web/lib/export/battleExportFilename.test.ts` (8 new cases: Latin mid-word accent,
  Devanagari, Japanese voiced kana, Hangul, long-Latin truncation, long-CJK truncation,
  hyphen-at-the-cut boundary, surrogate-pair-at-the-cut boundary)

### Change Log

- 2026-09-24 — Story 5.6 implemented (Tasks 1–8): the export helpers (`battleExportFilename`,
  `exportBattleToFile`, `battleExporter`), `<ExportBattleDialog>`, the `saveBattle`/`persistBattle`
  split, `<BattlePage>`'s export lifecycle (choose → close → act-on-exit, FD2), the Tools-section
  Export Battle button, and the `deferred-work.md` 5.4 hand-off closure. **Halted at Task 9**:
  `/battle` measured 116 bytes over the then-absolute 310 KB bundle budget after three rounds of
  in-scope trimming; per the story's own stop rule, the run stopped rather than raising the budget
  or trimming unrelated code. Not committed to Status `review`.
- 2026-09-25 — `chore/bundle-growth-ratchet` (PR #81, owner-approved) replaced the absolute
  per-route bundle budget with the 8 KB growth gate against a committed baseline. Landed on `main`
  independently of this story and merged into this branch (`c128c99`).
- 2026-09-25 — Story 5.6 Task 9 completed (second Sonnet session, resuming the halt): refreshed
  `scripts/bundle-baselines.json` via `npm run bundle:baseline` (`/battle` +0.6 KB, `/battle/new`
  +0.6 KB over the pre-story `main` baseline, both within the 8 KB allowance); ran `npm run ci:dev`
  to completion, exit 0, no flakes (134 web test files / 2212 tests, all `@gol/*` packages, 278
  e2e cases including the new 6-case `export battle (Story 5.6)` describe, `bench:check` 56.6%
  headroom); appended a dated AC10 annotation recording the gate change; cleared Task 9's HALT
  marker (history kept, not deleted). Status → review.
- 2026-09-25 — Code review (Opus): 14 patches applied (see Review Findings) — FD9 stale-save-error
  masking, post-commit focus restore for every close path, first-choice-wins during the fade, the
  racy e2e axe scan, and test/comment/deferred-work fixes; 4 `[Review][Decision]` items left open
  for the owner; 1 deferred. Baselines refreshed via `bundle:baseline` (`/battle`, `/battle/new`
  +62 B each). `ci:dev` exit 0. Status → in-progress (open decisions).
- 2026-09-25 — Owner answered all four `[Review][Decision]` items; this session applied them:
  1. Filename slug now strips combining marks only when they follow a Latin base, then
     renormalises to NFC, so Devanagari/Japanese/Hangul names survive intact (the review's own
     literal example regex needed one further, necessary fix — exempting `\p{M}` in the
     punctuation-collapse step too — to actually deliver that outcome; recorded as a surfaced
     conflict in the Dev Agent Record, not a silent choice).
  2. Added a 60-code-point cap on the slug (`Array.from`-based, trailing `-` trimmed after the
     cut). 8 new unit tests cover both decisions.
  3. Accepted the Task 7 page-level test variance; recorded the AC11 coverage mapping in the Dev
     Agent Record. No code change.
  4. Corrected the Dev Agent Record's "pre-existing drift from main" for the `/`, `/organisms`,
     `/settings` baseline growth to the owner's explanation: it is this story's own code.
  All four `[Review][Decision]` items ticked. AC5/FD7 annotated with dated owner-decision notes
  (originals kept, not rewritten). `npm run build:standalone` and `bundle:check` pass, `+0.0 KB`
  on all 5 routes (the change lives inside the lazy `battleExporter` chunk; no baseline refresh
  needed). `npm run ci:dev` exit 0, no flakes (2225/2225 web tests, 278/279 e2e — 1 pre-existing
  unrelated skip). Status → review.

Dev Model: sonnet   # follows existing patterns (UnsavedChangesDialog idiom, useLeaveGuard lifecycle, 5.5's lib/export seam); every structural choice (lazy boundary, save-then-export, id return, act-on-exit) is pre-decided in FD1–FD9, so nothing is left to architect.

Proposed lane gate:
  - story: 4-24-edit-organism-from-battle
    requires: 5-6-battle-export-dialog
    why: >-
      5.6 reshapes <BattlePage> (saveBattle split to return the id, a third lazy dialog with its own
      inert/focus lifecycle) and adds onExport/exportDisabled to BattleEditorViewProps; 4.24 adds its
      roster pencil props and a lazy editor modal on the same two files, and both spend /battle's
      0.4 KB of first-load headroom — landing 5.6 first lets 4.24 size against the post-export
      baseline instead of racing it.
  - story: 4-25-create-organism-from-battle
    requires: 5-6-battle-export-dialog
    why: >-
      Same surface and the same /battle headroom as 4.24.

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 16s | 16s | 16 | 2,948 | 6,842 | 447,566 | 457,372 |
| Step 1 — create | opus-5-5 | 1 | 7m 00s | 7m 00s | 134 | 3,873 | 347,116 | 8,283,620 | 8,634,743 |
| Step 2 — implement | sonnet-5 | 2 | 1h 10m | 12h 28m | 1,140 | 87,813 | 1,228,719 | 119,565,450 | 120,883,122 |
| Step 3 — review + PR | opus-5-5 | 4 | 15m 20s | 15m 20s | 290 | 12,161 | 673,241 | 12,029,206 | 12,714,898 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 200 | 72,526 | 232,749 | 9,719,088 | 10,024,563 |
| **Total (create → PR ready)** | | 7 | **1h 32m** | 12h 50m | 1,580 | 106,795 | 2,255,918 | 140,325,842 | **142,690,135** |

Run started 2026-09-24 20:24 CEST; wall clock runs to the point the run stopped for the owner's review. Active excludes 1 idle gap totalling 11h 18m (11h 18m from 21:14) — stretches with no transcript activity in the session or any subagent, such as a usage-limit reset or the machine asleep. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
