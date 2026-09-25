---
baseline_commit: 388dd205a8d3cd05fc50ddf004bce51d05b444e6
---

# Story 4.23: Editor Unsaved-Changes Scope

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the editor to guard its own unsaved changes,
so that I never lose authoring work — independent of any battle state.

## Acceptance Criteria

Epics source (`docs/planning-artifacts/epics.md` §Story 4.23), verbatim first, then the
implementation-level ACs this story is held to. The numbered ACs are the review contract.

> **Given** any edit (name, dominance, color, aging, rules, order), **When** made, **Then** the
> editor's own dirty scope activates (AR-33)
> **Given** a dirty editor, **When** Cancel/Back/Escape is used, **Then** "You have unsaved changes.
> Discard changes?" offers Discard / Keep Editing / Save (UX-DR16)
> **And** the editor's dirty scope is fully independent of the battle's dirty flag — neither
> triggers the other (AR-33)
> **And** a clean editor closes without any dialog

1. **Dirty scope = draft ≠ baseline.** `<OrganismEditorModal>` derives `isDirty` at render
   from a pure comparison of `draft` against a **baseline** draft. It stores no dirty flag.
   The baseline is the open-time `seed` until the first successful Save in the session, then
   the snapshot that Save projected (FD2). An edit to any of name, dominance, colour, aging, a
   rule's action/summary/conditions, adding or removing a rule or condition, or rule order makes
   the editor dirty. An edit that is later reverted by hand, back to baseline, makes it clean
   again (FD1). Covered for both the create session (seed from `createNewOrganismDraft`) and the
   edit session (seed from `organismDraftFrom`).
2. **Every user close path is guarded.** Back (the header's "← Back to Library/Battle"), the ✕
   (the only "Cancel" this editor has, FD5) and Escape all go through **one** request-close
   handler. Clean: it closes at once through `onClose`, with no dialog (the fourth epics AC).
   Dirty: it opens the editor's unsaved-changes confirmation and closes nothing.
3. **The confirmation.** It is a modal dialog **stacked over the mounted editor**. The body reads
   exactly `You have unsaved changes. Discard changes?` (UX-DR16), and it has three actions
   labelled exactly `Keep Editing`, `Discard`, `Save`. The DOM order is Keep Editing (with
   `autoFocus`), then Discard, then Save (FD4). It has `role="dialog"`, `aria-labelledby` and
   `aria-describedby`, and passes axe in both the unit test and e2e. The background (the editor)
   is genuinely `inert` while it is up.
   - **Keep Editing**, Escape on the confirmation, and a backdrop click: the confirmation closes,
     nothing else changes (the draft, `saveAttempted` and the outcome lines are untouched), and
     focus returns per FD7.
   - **Discard**: the confirmation closes. Only once its exit transition has finished does the
     editor close through `onClose` (FD6), with no write. A create session that had already saved
     once still hands its last saved record to the Library at the editor's exit, through the
     unchanged `pendingSavedRef` path.
   - **Save**: the confirmation closes and, **after its exit**, the editor's own Save runs with
     "close on success" (FD3). A valid draft that writes successfully closes the editor. A draft
     the gate refuses (Story 4.13) keeps the editor open: the inline errors show and focus goes to
     the first invalid control. A write that fails keeps the editor open with the existing
     `SaveErrorLine` alert. In all three cases the alert, status or focus change happens after the
     confirmation has gone, never under it (the live-region rule in `project-context.md`).
4. **Clean after save.** After a successful Save, a Back, ✕ or Escape with no further edits closes
   at once with no dialog. An edit made **after** that Save makes the editor dirty again (FD2).
5. **Independence from the battle's dirty flag (AR-33).** The editor's scope is ephemeral UI state
   local to `<OrganismEditorModal>` (RFC-005 Decision 1). Nothing lifts it into
   `useOrganismEditorModal`, a Context or any battle surface. The modal takes no battle-dirty prop
   and reads or writes no `isDirty` of `<BattlePage>`. It registers **no** `beforeunload` listener
   (FD9), so `useDirtyGuard` stays the only one in the app. The battle's `useLeaveGuard` and
   `<UnsavedChangesDialog>` are not modified. A unit test pins that a dirty editor adds no
   `beforeunload` listener.
6. **Exemptions — closes that must NOT prompt** (both recorded in `deferred-work.md`):
   - The Library's **editor-origin close after a successful delete** (`closeEditor` =
     `modalProps.onClose`, `OrganismLibrary.tsx:471-475`) stays a direct, unguarded close. The
     organism is gone, so there is nothing to save the draft into. This holds by construction
     when the guard lives in the modal (it sits in front of the modal's own controls, not in front
     of the hook's `handleClose`). Pin it with a Library-level test: delete a dirty editor's
     organism, and the editor closes with no prompt.
   - **Back while the `ORGANISM_DELETE_GONE` alert shows** is a plain close with no prompt (Story
     4.22 fourth-pass decision (a), Sidiar 2026-09-25). A held Enter from the delete confirmation
     can repeat into that Back, and it must not answer a prompt. The exemption covers Back, ✕ and
     Escape alike for as long as `deleteError === ORGANISM_DELETE_GONE` (FD8).
7. **Existing locks still hold.** While a write is in flight, Back and ✕ stay `disabled` and Escape
   is a no-op (Story 4.16, Tasks 12/13). The request-close handler bails on `savingRef.current` and
   on `!open` (the exit fade) **before** it evaluates dirtiness, so no confirmation can open during
   a write or over a closing editor.
8. **Escape layering is kept.** With a usage panel open, the first Escape still closes only the
   panel (Story 4.20 D5), and the editor and the prompt stay untouched. A held (auto-repeating)
   Escape opens the confirmation **at most once**. A keydown carrying `event.repeat` neither opens
   the confirmation from the editor nor dismisses the confirmation (FD10). Before the confirmation
   mounts, any open usage panel is closed (FD11), so the confirmation's Escape can never be eaten
   by the panel's capture listener.
9. **Editor-state pass** (Story 4.22 deferrals, owner-resolved (b) on 2026-09-25):
   - A **successful** Save clears the Library-published in-editor delete alert (`editorDeleteError`,
     both `ORGANISM_DELETE_FAILED` and `ORGANISM_DELETE_GONE`). With the alert goes the Delete
     button's GONE-disabled state, so after a re-creating Save the editor's Delete is live again.
   - A delete alert published into the editor clears any stale `saveOutcome` / `saveError` line,
     so "Organism saved" never stands beside "no longer exists" (FD12).
10. **Tests.** Unit tests for the pure comparison and the modal flows (every AC above) are in
    `OrganismEditorModal.test.tsx` and the draft module's test. Existing tests that edit and then
    close are updated to go through the prompt (or to close clean) rather than deleted. An e2e in
    `apps/web/e2e/organisms.spec.ts` covers: dirty → Back → prompt, then Keep Editing (the editor
    stays, focus restored); Discard (the editor closes, nothing written to `localStorage`); Save
    (the record is written and the editor closes); a clean close with no prompt; and axe with the
    prompt open. `npm run ci:dev` is green.

## Tasks / Subtasks

- [x] **Task 1 — Pure dirty comparison (AC1, FD1).**
  - [x] Add `isOrganismDraftDirty(baseline: OrganismDraft, draft: OrganismDraft): boolean` (or
        `organismDraftsEqual`) to `apps/web/lib/organisms/organismDraft.ts`. Compare `name` raw
        (untrimmed, the projection writes it raw), `dominance`, `agingEnabled`, `colorToken`, and
        `survivalRules` **in order**. Each rule is compared by `id`, `payload.action`,
        `payload.summary` and its conditions in order. Each condition is compared by `property`,
        `operator` and `pattern`, where a range pattern is compared element-wise. The condition
        `id` is **never** compared, because it is editor-only and never persisted (FD1). Use
        reference equality as the fast path (`draft === baseline` → clean).
  - [x] Unit tests in `organismDraft.test.ts`: one test per edited field, reorder, add/remove
        rule, add/remove condition, a hand-revert back to clean, a re-added identical condition
        with a fresh id is clean, and a re-added identical rule with a fresh rule id is dirty.
- [x] **Task 2 — Baseline + `isDirty` in the modal (AC1, AC4, FD2).**
  - [x] Keep `seed` exactly as it is (it still feeds `ColorPickerField`'s `seedValue`, Story 4.9
        FD2). Add a `baseline` state initialised from the seed.
  - [x] In `saveOrganism`, capture the `draft` that is projected (the value read at the start of
        the attempt, the one `projectOrganismForSave` receives), and on success
        `setBaseline(thatSnapshot)`. Never use the draft at resolution time: fields stay editable
        during the write, and an edit typed mid-write must still count as dirty.
  - [x] `const isDirty = isOrganismDraftDirty(baseline, draft)`, computed per render and not
        memoised (the same reasoning as `errors`).
- [x] **Task 3 — The confirmation component (AC3, FD4, FD5).**
  - [x] New `apps/web/components/organisms/editor/EditorUnsavedChangesDialog.tsx`, composed exactly
        like `<UnsavedChangesDialog>` / `<OrganismDeleteConfirmDialog>`: per-component MUI imports
        (AR-35), `PAPER_MAX_WIDTH = '440px'`, `BUTTON_SX`, `disableRestoreFocus`,
        `onTransitionExited`, title + body ids, and a guarded `onClose` (ignores `event.repeat`
        Escape, FD10). Title `Unsaved Changes`. Body `You have unsaved changes. Discard changes?`.
        Buttons: `Keep Editing` (outlined, `color="inherit"`, `autoFocus`), `Discard`
        (`color="error"`), `Save` (`variant="contained"`). It holds no state and calls no
        repository.
  - [x] Import it **statically** from `OrganismEditorModal.tsx`. That file is already inside the
        editor's lazy chunk (the header comment at `:18-22`), so a nested `dynamic()` would split a
        chunk for nothing. ❌ Never import it from `OrganismLibrary.tsx` or
        `useOrganismEditorModal.ts`.
  - [x] Its own `EditorUnsavedChangesDialog.test.tsx`: copy, button order, autoFocus, the three
        callbacks, a repeat-Escape that is ignored, and axe.
- [x] **Task 4 — One guarded request-close channel (AC2, AC6, AC7, AC8, FD6-FD11).**
  - [x] Replace `handleRequestClose` with the guarded version. The order of checks is
        load-bearing: `savingRef.current` → return; `!open` → return; confirmation already
        open or exiting → return; a GONE exemption or `!isDirty` → `onClose()`; otherwise record the
        focus-restore intent (FD7), close any usage panel (FD11) and open the confirmation.
  - [x] Route **Back** through it. Today `BackButton onClick={onClose}` (`:782`) is a direct,
        unguarded close. Route the ✕ and the Dialog's `onClose` (Escape/backdrop) through it too.
        For the Dialog's `onClose`, read MUI's `(event, reason)` and ignore an `escapeKeyDown` whose
        `event.repeat` is true (FD10).
  - [x] Confirmation lifecycle in two cells (`confirming` = mounted window, `confirmOpen` = the
        fade), the `useLeaveGuard` shape. Call `useInertBackground(confirming)` **in the modal**
        (the confirmation's parent). The module-level claims registry (`useInertBackground.ts`,
        since Story 4.22) makes this nested window safe over the editor's own. Keep that call
        **above** the focus-restore effect that keys on `confirming` clearing (the
        cleanup-before-setup ordering the hooks record).
  - [x] Stash the chosen outcome in a ref (`'keep' | 'discard' | 'save'`) and act on it in the
        confirmation's `onExited` (FD6): `discard` → `onClose()`; `save` → run the Save with close
        on success (FD3); `keep` → focus restore only. The last action before the fade ends wins
        (the Story 4.17 gate rule). This is safe because none of the three writes anything before
        the exit.
  - [x] Add `data-editor-close=""` to the ✕ `IconButton` so it can be looked up for focus restore
        (FD7). `data-editor-back` already exists.
- [x] **Task 5 — Save with close-on-success (AC3, FD3).**
  - [x] Make `saveOrganism` report its outcome (`Promise<boolean>`: `true` only when the write
        resolved). The gate refusal and a rejection both return `false`. `handleSave` stays
        fire-and-forget. The prompt's Save path is
        `void saveOrganism().then((ok) => { if (ok) onClose(); })`, run from the confirmation's
        exit handler. Mind the existing `!open` guard in `saveOrganism`: the editor is still open at
        that moment, so it passes.
  - [x] `onSaved(record)` still fires on success (it stashes in the hook), so the Library reloads
        at the editor's exit exactly as it does today.
- [x] **Task 6 — Editor-state pass (AC9, FD12).**
  - [x] Add an optional callback prop to the modal, e.g. `onSaveSucceeded?(): void`, called on
        every successful write. In `<OrganismLibrary>` wire it to a new `clearEditorDeleteError()`
        exported by `useOrganismDelete` (it sets `editorDeleteError` to `null`). It stays a
        callback, never a repository (AR-2/AR-27). Alternatively, compose it into the Library's
        spread of `modalProps.onSaved`. Either is fine, but the clear must happen on a
        **successful** write only.
  - [x] Stale save lines vs a fresh delete alert: use the React "adjust state when a prop changes"
        render-time pattern (`prevDeleteError` state compared during render), **not** a
        `useEffect` (`react-hooks/set-state-in-effect`, `project-context.md`). When `deleteError`
        goes from `null` to non-null, clear `saveOutcome` and `saveError`. If the lint config
        rejects the render-time form, fall back to hiding the two lines while
        `deleteError !== null`, and record the choice.
- [x] **Task 7 — Tests (AC10).**
  - [x] `OrganismEditorModal.test.tsx`: every AC path. Clean close by each of the three channels
        with no dialog. Dirty by each field kind (one representative per AC1 category is enough
        at modal level, because Task 1 covers the matrix). Keep Editing, Escape and backdrop leave
        the draft intact and restore focus (FD7). Discard calls `onClose` only after the
        confirmation's `onTransitionExited`. Save covers valid (close), invalid (errors + focus,
        stays open) and rejecting repo (alert, stays open), each asserting that the alert or focus
        appears only after the confirmation has exited. Clean after save; dirty again after a
        post-save edit. The locks: no prompt while `isSaving`, none during the exit fade. The GONE
        exemption. The usage panel closed before the prompt (Tab to Back with a panel open →
        Enter → prompt → Escape dismisses the **prompt**). A repeat Escape. The absence of a
        `beforeunload` listener.
  - [x] Update existing tests that edit then close. `grep -n "onClose" OrganismEditorModal.test.tsx`
        finds 55 hits, and the Story 4.20 D5 Escape tests (`:2445-2470`) now protect a guarded
        editor. Their comments that say "no dirty guard until Story 4.23" must be rewritten
        (`UsageIndicator.tsx:224`, `DominanceField.tsx:219`, `OrganismEditorModal.test.tsx:2458`),
        without leaving review artefacts.
  - [x] `OrganismLibrary.test.tsx`: an editor-origin delete of a dirty editor closes it with no
        prompt (AC6), and a successful Save clears the in-editor delete alert (AC9).
  - [x] `apps/web/e2e/organisms.spec.ts`: the AC10 e2e set. Also check the existing e2e flows that
        edit and then press Back or Escape (about 13 hits on
        `Back to Library`/`keyboard.press('Escape')`). Each one now either saves first or passes
        through the prompt. Retarget; do not weaken.
- [x] **Task 8 — Comments and docs hygiene.**
  - [x] Update the forward-looking comments that name Story 4.23: `OrganismEditorModal.tsx` (the
        head comment `:391-392`, `:89-90`, `:720-721`, `:762`), `useOrganismEditorModal.ts:16,345`,
        `OrganismLibrary.tsx:471-474` (now: "stays unguarded, and here is why"),
        `organismDraft.ts` (header), `PreviewPanel.tsx:210` and `organismDraft.test.ts:37`, so each
        states the shipped fact. Cite `(AR-33)`, `(UX-DR16)` and `(Story 4.23)` as IDs, which
        `spec:check` validates.
  - [x] In `deferred-work.md`, mark the entries this story closes (the 4.22 editor-close
        exemption, the GONE Back exemption, the editor-state pass items, and the 4.20 third-pass
        "confirm mounting over an open panel"). Re-point the Dominance pending-text entry and the
        renamed-out-of-search focus entry per the Questions defaults.
- [x] **Task 9 — Gate.** Run `npm run ci:dev` (Chromium e2e only; never the four-browser `ci`
      locally). If `/organisms` first-load grows past the ratchet, refresh the baseline per
      `project-context.md` (it should not grow, because everything lands inside the lazy editor
      chunk).

### Review Findings

Code review 2026-09-25 (opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor, full mode).
3 decision-needed, 15 patch, 0 defer, 9 dismissed.

- [ ] [Review][Decision] Confirmation-Save closes the editor over an edit typed during the write —
  `handleConfirmationExited`'s `'save'` branch runs `saveOrganism().then((ok) => { if (ok) onClose(); })`.
  Fields stay editable while the write is in flight, and FD2 moves the baseline to the ATTEMPTED
  snapshot precisely so a mid-write edit stays dirty; but this path then calls `onClose()` without
  re-checking, so that edit is dropped with no prompt. AC3 says literally "a valid draft that writes
  successfully closes the editor". Options: (a) keep as shipped — the user chose "Save" and close;
  a mid-write edit on a localStorage write is a sub-frame window; (b) close only if the draft is
  still clean against the new baseline, otherwise stay open (read through a ref); (c) as (b) but
  re-open the prompt instead of staying silently open.
- [ ] [Review][Decision] A held Enter on Back/✕ cycles the prompt open → Keep Editing → open —
  Enter activates a `<button>` on keydown and auto-repeats: the first keydown opens the prompt with
  focus on Keep Editing (FD4 `autoFocus`), the next repeat clicks Keep Editing, FD7 restores focus to
  Back after the fade, the next repeat re-opens it. Nothing is ever discarded (Keep Editing is the
  safe action), but the prompt flickers for as long as the key is held. FD10 guards only Escape.
  Options: (a) accept — harmless by FD4's own design; (b) swallow `repeat` keydowns on the
  confirmation's buttons until keyup (the `UsageIndicator` D5 technique); (c) ignore a repeat-Enter
  on Back/✕ themselves (needs an `onKeyDown` beside `onClick`).
- [ ] [Review][Decision] Questions 1–4 are recorded as "resolved" without an owner ruling — the dev
  applied every written-in default (Q1 GONE exemption on all three channels; Q2 no `beforeunload`;
  Q3 accept that Escape from inside the dominance textbox discards uncommitted out-of-range text on
  an otherwise clean draft — independently re-raised by the Edge Case Hunter; Q4 renamed-out-of-search
  focus re-pointed onward). The review reworded `deferred-work.md` to "default applied, pending owner
  confirmation". Options per question: confirm the default, or override (Q1: Back only; Q2: add a
  dirty-only `beforeunload`; Q3: flush the field's pending text before the dirty check; Q4: build it
  here).
- [x] [Review][Patch] `EditorUnsavedChangesDialog.test.tsx` missing although Task 3 is ticked (copy,
  order, autoFocus, callbacks, repeat Escape ignored, axe) [apps/web/components/organisms/editor/EditorUnsavedChangesDialog.test.tsx]
- [x] [Review][Patch] `onSaveSucceeded` called inside the `try` — a throwing callback would report a
  stored write as failed and skip `onSaved`; moved beside `onSaved`, after `finally` [apps/web/components/organisms/editor/OrganismEditorModal.tsx]
- [x] [Review][Patch] FD7 focus restore ran for Discard/Save too, moving focus into an editor that is
  closing (or about to lock for the write); now restores only on Keep Editing / Escape / backdrop [apps/web/components/organisms/editor/OrganismEditorModal.tsx]
- [x] [Review][Patch] Stale "no dirty guard until Story 4.23" comment on the D5 test [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] FD11 test passed with `closePanel()` deleted (a pointer click on Back closes the
  panel through D1 first); now keyboard-only, and Escape dismisses the PROMPT [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] AC9 reverse direction (a fresh delete alert clears a stale save line) untested,
  and `deferred-work.md` claimed both directions pinned [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] Prompt-Save VALID / REJECTING tests did not assert the outcome lands only after
  the confirmation has gone (AC3) [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] No test for "no confirmation over a closing editor" (`!open`, AC7) [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] FD7 restore tested for ✕ only — added Back and the Escape-captured element;
  Keep Editing leaves `saveAttempted` and the outcome lines untouched (AC3) [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] FD2 "an edit typed mid-write stays dirty" had no test [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] Test titled "clean after save … and dirty again" only checked the clean half
  (the next test covers the other); renamed [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] Modal-level dirty only via name / add-rule; added dominance, colour and aging
  representatives (Task 7) [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx]
- [x] [Review][Patch] e2e Keep Editing did not prove the editor is live and clickable afterwards
  (the 4.22 leftover-`inert` regression class) [apps/web/e2e/organisms.spec.ts]
- [x] [Review][Patch] `deferred-work.md` said `closePanel()` runs "unconditionally, before evaluating
  anything else" — it runs on the dirty path only, after the checks; "both directions pinned" claim
  corrected [docs/implementation-artifacts/deferred-work.md]
- [x] [Review][Patch] Comments still describing the pre-FD2 model: `organismDraft.ts` header ("one
  seed") and the `onClose` prop doc ("Story 4.23 guards it") [apps/web/lib/organisms/organismDraft.ts, apps/web/components/organisms/editor/OrganismEditorModal.tsx]

## Dev Notes

### Forced decisions (defaults written in; the dev follows them unless the owner overrides)

- **FD1 — What counts as "dirty": structural diff, reverts are clean, condition ids ignored.**
  The draft/seed contract has been written into the code since Story 4.5 ("Story 4.23 diffs one
  object against one seed", `organismDraft.ts` header; `OrganismEditorModal.tsx:450-452`). A
  sticky "touched" flag would prompt after a hand-revert, which is the one case where no work can
  be lost. Condition `id`s are editor-only keys (`conditionDraft.ts:34`, "never reaches
  `Condition`"), so a deleted and re-added identical condition would save byte-identical, and it
  is clean. Rule `id`s **are** persisted (RFC-004 §2.4, "re-minting would fork rule identity"), so
  a re-added identical rule is a real change to the record, and it is dirty. `name` is compared
  raw because the projection writes it raw (`organismRecord.ts:24-26`).
- **FD2 — The baseline moves on a successful Save.** Since Story 4.16 Task 11 the editor stays
  open after Save. If the diff stayed against the open-time seed, every Back after a Save would
  prompt about work that is already stored. `seed` itself must NOT move: it is also the FR-2.3
  "the default never warns" comparison for the colour-reuse warning (`seedValue`, Story 4.9 FD2).
  So the baseline is a second cell. It is the snapshot the successful write projected, never the
  draft at resolution time.
- **FD3 — Prompt Save = dismiss, then the normal Save with close on success.** This mirrors
  `useLeaveGuard`'s "navigate only if the save succeeded" (Story 2.16 forced decision 2) and its
  forced decision 5 (a) (a failed save stays on the page with the existing alert). Running the
  Save **after the confirmation's exit** instead of inside it, with a `pending` state, is
  deliberate. Any alert, inline error or focus move it produces then lands in a live, non-inert
  editor, which avoids the announced-under-a-dialog trap (`project-context.md`, "A live region
  inserted while a dialog is open is never announced"). It also avoids needing a pending state on
  the confirmation. The in-flight write then uses the editor's existing Task 12/13 lock.
- **FD4 — Button order and focus: Keep Editing, Discard, Save; Keep Editing autofocused.** The
  UX line lists "Discard | Keep Editing | Save" as the options, not a DOM order. The house idiom
  (`<UnsavedChangesDialog>`, Story 2.16 forced decision 4 (a)) is safe first, destructive in the
  middle, recommended last, with `autoFocus` on the safe action, so an immediate Enter or Escape
  changes nothing. The labels are UX-DR16's words verbatim. The title `Unsaved Changes` matches
  the battle dialog's consequence-first heading.
- **FD5 — "Cancel" is the ✕.** The shipped header has Back + Save + ✕ (Story 4.3). There is no
  separate Cancel button, and none is added. The AC's Cancel/Back/Escape maps to ✕/Back/Escape.
- **FD6 — Sequential close, never stacked unwinding.** Discard closes the confirmation, and only
  its `onExited` closes the editor. This is Story 4.22's FD9 rule for a dialog stacked over the
  editor: closing both in one handler unwinds two inert windows in one commit, and the ordering
  guarantees are written around one-at-a-time.
- **FD7 — Focus after Keep Editing, Escape or backdrop.** Restore to the control that asked. For
  Back, `[data-editor-back]`. For ✕, `[data-editor-close]`. For Escape, the element that held
  focus at keydown if it is still connected and inside `shellRef`, otherwise Back. Do the lookup
  at restore time (the WebKit-doesn't-focus-buttons-on-click rule every hook here records), from
  an effect keyed on `confirming` clearing, placed after `useInertBackground(confirming)`. "Loose
  focus" semantics are the same as `useOrganismEditorModal:204-210`.
- **FD8 — The GONE exemption covers all three channels.** Sidiar's ruling names Back, because
  that is where focus lands after the GONE alert. Exempting only Back would leave ✕ and Escape
  prompting over a draft whose record is gone, which is the inconsistency the ruling's reasoning
  ("nothing in the chain writes on its own") already covers. The draft is still saveable (the
  re-creating Save, decision (b)), so the user loses no ability, only the prompt. **Question 1**
  confirms this.
- **FD9 — No `beforeunload` for the editor.** UX-DR16 scopes the editor's flow to
  Cancel/Back/Escape. FR-7.9's tab-close warning is the battle's (`useDirtyGuard`). Adding an
  editor listener is not asked for, and on the battle origin (Story 4.24) it would blur "neither
  triggers the other". **Question 2** covers this.
- **FD10 — Repeat Escape is ignored at both layers.** MUI's `useModal` does not check
  `event.repeat` (`UsageIndicator.tsx` D5 notes). Without this, a held Escape cycles open, dismiss,
  open, and so on. Ignoring repeats in the editor's request (Escape reason only) and in the
  confirmation's `onClose` means one hold opens the prompt once and leaves it up. It is
  unreachable from `user.keyboard` / Playwright, so the unit test dispatches a synthetic
  `repeat: true` keydown on a focused element inside the dialog. That is the D5 test's documented
  technique (`OrganismEditorModal.test.tsx:2459-2470`), and you should read its comment on why the
  target must not be `document`.
- **FD11 — Close the usage panel imperatively before the prompt.** This is reachable. With D1, Tab
  away leaves a panel open. Shift+Tab to Back and Enter is not a `pointerdown`, so the panel stays
  open, and its document-capture Escape listener would then eat the prompt's Escape and pull focus
  to a trigger behind the inert layer (`deferred-work.md`, 4.20 third pass). The fix is not a
  prop-driven effect (`react-hooks/set-state-in-effect`). Default: `<UsageIndicator>` exposes
  `closePanel()` through `forwardRef`/`useImperativeHandle` (React 19: `ref` as a prop), and the
  request-close handler calls it before opening the confirmation. Closing it this way must NOT
  move focus: this is not the Escape path, and there is no `openerRef.focus()`.
- **FD12 — Clearing stale save lines on a fresh delete alert.** The Story 4.22 review assigned
  "one owner for the editor's outcome lines and the Library-published delete alert, cleared
  together" to this pass. The render-time prev-prop pattern is the React-sanctioned alternative to
  an effect. The derived "hide while `deleteError !== null`" is the fallback, but note what it
  costs: the next delete request clears `deleteError` and would **re-insert** the stale line,
  which is the re-announce trap the project context describes. Prefer the state clear.

### What already exists (reuse, do not rebuild)

- `validateOrganismDraft`, `saveOrganism` / `handleSave`, `savingRef` / `isSaving`, `saveStamp`,
  `focusRequest` + `errorTargetSelector`, and the `SaveOutcomeLine` / `SaveErrorLine` idioms, all
  in `OrganismEditorModal.tsx`.
- The three-phase dialog lifecycle and parent-side inert + focus restore: `useLeaveGuard.ts` is
  the closest template (read its comments). Do NOT call `useLeaveGuard` itself: its focus target
  is `[data-back-to-battles]` and its props are battle-shaped.
- `<UnsavedChangesDialog>` (battle root) is the composition template. Do not import it into the
  editor: `components/battle/` root means "shared by both battle modes" (`project-context.md`),
  and its copy and labels are FR-7.9's, not UX-DR16's.
- `useInertBackground` with its module-level claims registry, which is safe for nesting (Story
  4.22).
- `ORGANISM_DELETE_GONE` / `ORGANISM_DELETE_FAILED` (`lib/organisms/saveOutcome.ts`), and
  `editorDeleteError` / `setEditorDeleteError` (`useOrganismDelete.ts:172`).

### Current state of the files this story modifies

- **`apps/web/components/organisms/editor/OrganismEditorModal.tsx` (968 lines).** It holds
  `seed` + `draft` (`:457-462`), and no dirty state yet. `handleRequestClose` (`:722-725`) only
  checks `savingRef`. **Back calls `onClose` directly (`:782`)**, the ✕ calls `handleRequestClose`
  (`:838`), and the Dialog's `onClose` (Escape) calls `handleRequestClose` (`:763`).
  `saveOrganism` returns `Promise<void>`, guards `savingRef || !open`, clears both outcome lines
  at start, and sets `saveStamp` on first success. `deleteError` is rendered as a
  `SaveErrorLine`, and the Delete button is disabled on `isSaving || deleteProtected || GONE`.
  **Preserve**: every Story 4.13/4.16/4.17/4.20/4.22 behaviour and comment rationale, the
  `SAVE_SX` no-transition fix, `disableRestoreFocus`, and the `fullScreen` paper overrides.
- **`apps/web/lib/organisms/organismDraft.ts`.** It has the types, two seed factories and the
  validator. It gains the comparison. **Preserve**: purity (no React, no crypto).
- **`apps/web/components/organisms/editor/UsageIndicator.tsx`.** Internal `openPanel` state,
  capture Escape listener, repeat guard. It gains an imperative `closePanel` (FD11). **Preserve**:
  D1/D4/D5 behaviours exactly.
- **`apps/web/components/organisms/OrganismLibrary.tsx`.** `closeEditor` stays wired straight to
  `modalProps.onClose` (AC6). It gains the save-success → `clearEditorDeleteError` wiring (AC9).
- **`apps/web/lib/organisms/useOrganismDelete.ts`.** It gains `clearEditorDeleteError` in its
  result. **Preserve**: the latch and release at exit, and the restore intents.
- **`apps/web/lib/organisms/useOrganismEditorModal.ts`.** Comment updates only. `handleClose`
  stays unguarded (the guard is the modal's). Do not add dirty state here: this hook is in the
  first-load chunk and owns lifecycle only.

### Anti-patterns (these compile and pass tests, and are still wrong)

- ❌ Putting the guard in `useOrganismEditorModal.handleClose`. That would prompt on the
  delete-success close (AC6) and would require lifting the draft into the first-load chunk.
- ❌ A `useEffect` that syncs `isDirty` into state, or that resets `openPanel` / the outcome lines
  from a prop (`react-hooks/set-state-in-effect`).
- ❌ Moving `seed` on save (it breaks the Story 4.9 colour-warning seed comparison).
- ❌ Setting the baseline from the draft **at resolution** of the write (loses mid-write edits).
- ❌ Closing the confirmation and the editor in the same handler (FD6).
- ❌ Running the prompt's Save while the confirmation is still up (FD3's live-region trap).
- ❌ `import { Dialog } from '@mui/material'` (barrel, AR-35). Also wrong: a static import of the
  new dialog from any first-load module.
- ❌ Reusing `<UnsavedChangesDialog>` / `useLeaveGuard` from `components/battle` / `lib/battle`.
- ❌ Touching `<BattlePage>`'s `isDirty`, `useDirtyGuard` or `useLeaveGuard` (AR-33 independence,
  and Story 4.24's territory).

### Known limitation — Dominance pending text (deferred-work, 4-6 review)

`<DominanceField>` commits out-of-range or partial text only on blur or Enter. An **Escape pressed
inside the dominance textbox** while it holds uncommitted text (e.g. `150`) reads the pre-edit
`draft.dominance`. On an otherwise clean draft, the editor closes with no prompt and the pending
text is discarded. A pointer Back or ✕ blurs first, and React flushes the discrete blur update
before the click, so those are correct. Default: **accept and document** (in-range values commit
live, so only out-of-range or incomplete text is affected), keep `DominanceField`'s "never
stopPropagation Escape" contract, and re-point the deferred entry. **Question 3** asks whether to
flush instead.

### Project Structure Notes

- New: `apps/web/components/organisms/editor/EditorUnsavedChangesDialog.tsx` (+ `.test.tsx`).
  PascalCase component file. It sits in `organisms/editor/` because the editor is its only
  mount point, including over the battle (Story 4.24 mounts the same modal).
- No package changes. The comparison is UI-draft logic in `apps/web/lib/organisms/`, not
  `@gol/domain`: drafts are an app-layer type (`RuleDraft`), and no DOM types are involved.
- The bundle should not move for `/organisms` (everything lands inside the editor's lazy chunk).

### Testing standards

- Vitest + RTL + `user-event` 14. Use `@gol/test-utils` for fakes. Never hand-roll a fake repo.
  Axe in jsdom, as the existing dialog tests do.
- Exit-transition-dependent assertions: use the existing tests' technique for waiting on
  `onTransitionExited` (see the 4.22 stacked-dialog tests in `OrganismLibrary.test.tsx` /
  `OrganismEditorModal.test.tsx`).
- e2e stays thin (`project-context.md`). Do not write an e2e for the synthetic-repeat case.
- Local gate: `npm run ci:dev`. Do not pipe it (the exit code gets swallowed).

### Previous story intelligence (4.22)

- 4.22 introduced the first dialog stacked over the mounted editor. It rewrote
  `useInertBackground` to a module-level claims registry after a nested window handed the editor
  back inert following a Cancel (measured in Chromium). Your confirmation is the second stacked
  dialog, and the first one owned by the modal itself. Prove the e2e "Keep Editing → the editor
  is live and clickable" path. That is the exact regression class.
- 4.22's FD9: close order is stacked-first, editor-second, from the exit handler.
- 4.22 left three explicit hand-offs to this story (AC6 ×2 and AC9), all owner-resolved.
- 4.22 e2e note: `getByText("Conway's Classic")` needs `exact: true`, and the seeding helpers are
  `addInitScript`s that re-run on navigation. Verify writes in `localStorage` directly, not via
  `page.reload()`.
- Review cadence on this epic: multi-pass Fable reviews focus on focus restore, inert unwinding
  and live-region timing. Pin the ordering with tests (alert exists only after the dialog is
  gone).

### Git intelligence

The recent commits are 4.22 (safe delete, stacked confirmation, `useOrganismDelete`, the inert
registry) and 5.7 (the migration registry, persistence only, disjoint from this story).
`saveFailureMessage.ts` is shared with lane 5, and this story does not modify it.

### Latest tech notes

React 19.2 (`ref` as a regular prop, so `forwardRef` is optional; `useImperativeHandle` is
unchanged). MUI 9.3 (`disableEscapeKeyDown` was removed from Modal, so guard in `onClose`; the
`onClose(event, reason)` reasons are `'escapeKeyDown' | 'backdropClick'`). Next 16 static
export. Playwright 1.62. No new dependencies.

### References

- `docs/planning-artifacts/epics.md` §Story 4.23; AR-33 (`:201`); UX-DR16 (`:241`).
- `docs/planning-artifacts/architecture.md` M5 (`:351`), for the modal over the battle and the
  independent scopes.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` `:45`, `:57` (two
  independent unsaved-change scopes); Decision 1 (ephemeral UI state).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md` `:566-569`
  (the copy and options), `:734` (Escape closes with the unsaved warning).
- `docs/implementation-artifacts/deferred-work.md` `:1188-1198` (Dominance pending text), `:2522`
  (renamed-out-of-search focus), `:2998-3004` (panel vs confirmation), `:3159-3163` (delete-close
  exemption), `:3186-3202` (editor-state pass), `:3203-3210` (GONE Back exemption).
- `apps/web/lib/battle/useLeaveGuard.ts`, `apps/web/components/battle/UnsavedChangesDialog.tsx`
  (templates).
- `docs/project-context.md`: the live-region rule (`:434-452`), the three state categories, AR-35
  dynamic imports, and the `ci:dev` gate.

### Questions for Sidiar (saved for the end; defaults are written into the story)

1. **FD8**: should the GONE exemption cover ✕ and Escape as well as Back? Default: yes, all three.
2. **FD9**: should the editor also register a `beforeunload` while dirty (tab-close protection for
   organism authoring)? Default: no, since UX-DR16 scopes the flow to Cancel/Back/Escape.
3. **Dominance pending text**: accept that Escape from inside the dominance textbox discards
   uncommitted out-of-range text on an otherwise clean draft (default), or flush the field before
   the dirty check?
4. **Renamed-out-of-search focus drop** (`deferred-work.md:2522`, "stands on Story 4.23"): it is
   not in any 4.23 AC. Default: re-point it to the next Library touch or the Epic 4 UX
   reconciliation, not built here.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run lib/organisms/organismDraft.test.ts` — 35/35 (Task 1, `isOrganismDraftDirty`).
- `npx vitest run components/organisms/editor/OrganismEditorModal.test.tsx` — 128/128 (existing
  suite + the new "unsaved-changes guard (Story 4.23)" describe block; 3 pre-existing tests
  updated for the new dirty guard, see Completion Notes).
- `npx vitest run components/organisms/OrganismLibrary.test.tsx` — 88/88 (2 pre-existing tests
  updated; 2 new AC6/AC9 tests added).
- `npx vitest run` (apps/web, full) — 2316/2316.
- `npm run test:coverage` (all 4 gated packages) — green; `organismDraft.ts` and
  `OrganismEditorModal.tsx` both land inside `apps/web`'s no-gate scope but were measured at
  100%/98.46% stmts respectively.
- `npx tsc --noEmit` (apps/web) — clean throughout.
- `npx eslint .` (repo) — 0 errors (1 pre-existing, unrelated warning in `BattleGallery.tsx`).
- `npm run format:check` — clean.
- `npm run spec:check` — 279/279 cited ids resolve.
- `npm run boundary:check` — clean.
- `npm run build:standalone` — clean.
- `npm run bundle:check` — `/organisms` −0.0 KB (everything landed inside the editor's lazy
  chunk, as the story predicted); every other route also within its growth allowance.
- `npm run bench` + `npm run bench:check` — 5.903 ms frame vs 16.667 ms budget (64.6% headroom).
- `npm run e2e:chromium` — 293 passed, 1 skipped (pre-existing skip, unrelated).

### Completion Notes List

- Task 1: `isOrganismDraftDirty` added to `organismDraft.ts` — reference-equality fast path, then
  name/dominance/agingEnabled/colorToken, then `survivalRules` compared in order (rule `id` IS
  compared per FD1; condition `id` is NEVER compared). 15 new unit tests in `organismDraft.test.ts`
  cover every edited field, reorder, add/remove rule, add/remove condition, hand-revert-to-clean,
  and the two re-add cases (fresh condition id → clean, fresh rule id → dirty).
- Task 2: `baseline` state added alongside `seed` in `OrganismEditorModal`; `isDirty` derived per
  render via `isOrganismDraftDirty(baseline, draft)`. `saveOrganism` now captures the attempted
  draft once, before the `await`, and moves `baseline` to that exact snapshot only on a successful
  write (FD2) — an edit typed mid-write is captured by neither the record nor the new baseline.
- Task 3: `EditorUnsavedChangesDialog.tsx` added, composed like `<OrganismDeleteConfirmDialog>` /
  `<UnsavedChangesDialog>`. Its own `onClose` ignores a repeat-carrying Escape (FD10) via
  `'repeat' in event` narrowing on MUI's `{}` event type — no cast needed.
- Task 4: `handleRequestClose` rewritten to the guarded version with the exact check order the
  story specifies; it now takes a `CloseFocusIntent` (`back` | `close` | `escape` with the captured
  element) so FD7's focus restore can tell the three channels apart. `handleDialogClose` wraps the
  Dialog's own `onClose` to filter the repeat-carrying Escape and capture
  `document.activeElement` at keydown time. `confirming`/`confirmOpen` follow the
  `useLeaveGuard` three-phase shape; `useInertBackground(confirming)` is called in the modal,
  above the focus-restore effect (verified by reading `useInertBackground.ts`'s ordering
  contract). `usageIndicatorRef.current?.closePanel()` runs unconditionally before the
  confirmation opens (FD11) — required `<UsageIndicator>` to gain a `ref` prop
  (`UsageIndicatorHandle`, React 19 ref-as-prop + `useImperativeHandle`, no `forwardRef`).
  `data-editor-close` added to the ✕ `IconButton`.
- Task 5: `saveOrganism` now returns `Promise<boolean>` (`true` only on a settled write);
  `handleConfirmationExited`'s `'save'` branch runs `void saveOrganism().then((ok) => { if (ok)
  onClose(); })`. `handleSave` is unchanged (still fire-and-forget).
- Task 6: `onSaveSucceeded?(): void` added to the modal's props, called once per successful write
  (beside `onSaved`). `useOrganismDelete` gained `clearEditorDeleteError()`; `<OrganismLibrary>`
  wires it to the modal's `onSaveSucceeded`. The reverse direction (a fresh delete alert clearing
  stale save lines) uses the React in-render "adjust state when a prop changes" pattern
  (`prevDeleteError` compared during render, `setState` called conditionally in the render body,
  never in a `useEffect`) — confirmed against ESLint's `react-hooks/set-state-in-effect`
  (0 errors) rather than falling back to the derived-hide alternative the story allows.
- Task 7: added a "unsaved-changes guard (Story 4.23)" describe block to
  `OrganismEditorModal.test.tsx` (21 new tests: both clean/dirty paths on all three channels, the
  confirmation's copy/order/autoFocus, Keep Editing, Escape-on-confirmation and backdrop, Discard's
  ordering, Save's three outcomes, clean-after-save and dirty-again, the in-flight-write lock, the
  GONE exemption across all three channels, the FD11 panel-close, a repeat Escape, the absent
  `beforeunload` listener, and axe). Updated 3 pre-existing tests whose drafts are now dirty by the
  story's own construction (a filled name, or two added rules) so their Back/✕/Escape now goes
  through Discard rather than closing directly — behaviour changes, not weakenings; each now
  additionally proves the prompt appeared. Added 2 tests to `OrganismLibrary.test.tsx` for AC6 (a
  genuinely dirty editor closed by a successful editor-origin delete, no prompt) and AC9 (a
  successful re-creating Save clears the GONE alert and re-enables Delete); updated 2 pre-existing
  tests for the same "now dirty → now prompts" reason. Added a "unsaved-changes guard (Story 4.23)"
  block to `e2e/organisms.spec.ts` (5 tests: clean close, dirty→Back→prompt→Keep Editing with focus
  restore, Discard writes nothing, Save writes and closes, axe with the prompt open) — the axe test
  needed an explicit wait on the CONFIRMATION's own `.MuiDialog-container` opacity
  (`.last()`, since the editor's own settled container also matches the selector), the same
  mid-fade trap `project-context.md` documents elsewhere; without it axe measured contrast against
  a still-fading Paper and failed. The full existing e2e suite (293 tests) was re-run and passes
  unchanged — none of the ~13 pre-existing "edit then Back/Escape" flows needed retargeting; each
  already saves first or lands on a clean draft before closing.
- Task 8: swept every forward-looking "Story 4.23 will…" comment this story's Dev Notes named
  (`OrganismEditorModal.tsx`, `useOrganismEditorModal.ts`, `OrganismLibrary.tsx`,
  `DominanceField.tsx`, `UsageIndicator.tsx`) to state the shipped fact instead. `organismDraft.ts`'s
  header, `PreviewPanel.tsx:210` and `organismDraft.test.ts`'s existing comment were already
  accurate present-tense statements and needed no change. Marked six `deferred-work.md` entries
  resolved by this story (the 4.22 editor-close exemption, the GONE Back exemption across all three
  channels, the 4.20 third-pass "confirm mounting over an open panel", and the editor-state pass —
  both directions) and re-pointed two per the story's Questions defaults (Dominance pending text:
  accept-and-document; renamed-out-of-search focus: not in any 4.23 AC, re-pointed again to the
  next Library touch or the Epic 4 UX reconciliation).
- Task 9: `npm run ci:dev` full chain green (see Debug Log References). `/organisms` first-load did
  not grow (−0.0 KB against baseline) — no baseline refresh needed, as the story predicted.
- Questions 1–4 all resolved to their written-in defaults (no owner override surfaced during
  implementation): Q1 GONE exemption covers all three channels; Q2 no `beforeunload` listener; Q3
  Dominance pending text accept-and-document; Q4 renamed-out-of-search focus re-pointed onward.

### File List

- `apps/web/lib/organisms/organismDraft.ts` — modified: `isOrganismDraftDirty` +
  `conditionDraftsEqual`/`ruleDraftsEqual` helpers (Task 1).
- `apps/web/lib/organisms/organismDraft.test.ts` — modified: 15 new tests for
  `isOrganismDraftDirty` (Task 1).
- `apps/web/components/organisms/editor/EditorUnsavedChangesDialog.tsx` — new: the confirmation
  component (Task 3).
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx` — modified: `baseline`/`isDirty`
  (Task 2), the guarded request-close channel, `confirming`/`confirmOpen`, the confirmation's
  render and wiring, `data-editor-close` (Task 4), `saveOrganism`'s `Promise<boolean>` return
  (Task 5), `onSaveSucceeded` prop + the render-time `prevDeleteError` clear (Task 6), plus the
  Task 8 comment sweep.
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` — modified: new
  "unsaved-changes guard (Story 4.23)" describe block; 3 pre-existing tests updated for the new
  guard (Task 7).
- `apps/web/components/organisms/editor/UsageIndicator.tsx` — modified: `ref` prop +
  `UsageIndicatorHandle`/`closePanel` via `useImperativeHandle` (Task 4); comment sweep (Task 8).
- `apps/web/lib/organisms/useOrganismDelete.ts` — modified: `clearEditorDeleteError` (Task 6).
- `apps/web/components/organisms/OrganismLibrary.tsx` — modified: wires `onSaveSucceeded` to
  `clearEditorDeleteError` (Task 6); comment sweep (Task 8).
- `apps/web/components/organisms/OrganismLibrary.test.tsx` — modified: 2 new tests (AC6, AC9);
  2 pre-existing tests updated for the new guard (Task 7).
- `apps/web/components/organisms/editor/DominanceField.tsx` — modified: comment sweep (Task 8).
- `apps/web/e2e/organisms.spec.ts` — modified: new "unsaved-changes guard (Story 4.23)" describe
  block, 5 tests (Task 7).
- `docs/implementation-artifacts/deferred-work.md` — modified: six entries resolved, two
  re-pointed per the Questions defaults (Task 8).
- `docs/implementation-artifacts/sprint-status.yaml` — modified: `4-23-editor-unsaved-changes-scope`
  → `review`.

## Change Log

- 2026-09-25: Story implemented end to end (Tasks 1–9). `isOrganismDraftDirty` (pure diff,
  condition-id-blind/rule-id-aware per FD1), the editor's own `baseline`/`isDirty`, the guarded
  request-close channel routing Back/✕/Escape through one handler (FD6–FD11), the
  `<EditorUnsavedChangesDialog>` confirmation (UX-DR16), `saveOrganism`'s close-on-success Save
  path (FD3), and the AC9 editor-state pass (`onSaveSucceeded` / `clearEditorDeleteError` /
  render-time `prevDeleteError`). `npm run ci:dev` green; bundle unchanged on `/organisms`.
- Dev Model: sonnet — follows existing patterns (`useLeaveGuard`'s three-phase dialog, 4.22's
  stacked-over-editor window + inert registry, the house dialog idiom); the dirty-diff contract was
  fixed in code since 4.5 and every design choice is pinned as an FD in Dev Notes.
- Proposed lane gate: none.
- 2026-09-25: Code review (opus). 15 patches applied in a separate review commit: new
  `EditorUnsavedChangesDialog.test.tsx` (Task 3's missing deliverable); `onSaveSucceeded` moved out
  of the `try` beside `onSaved`; FD7 focus restore limited to Keep Editing/Escape/backdrop; the
  FD11 test made keyboard-only; new tests for AC9's reverse clear, the `!open` lock, FD7 Back/Escape
  targets, FD2 mid-write edits and per-category dirtiness; e2e proves the editor is live after Keep
  Editing; comment and `deferred-work.md` corrections. 3 decision-needed items left open for the
  owner (Review Findings) — status `in-progress`.
