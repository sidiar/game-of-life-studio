---
baseline_commit: 10947c5
---

# Story 4.26: Rule-Delete Confirmation Dialog

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to confirm before a survival rule is removed,
so that a stray double-click never wipes out rules I meant to keep.

## Acceptance Criteria

1. **Delete asks first.** Activating a rule card's ✕ (`Delete rule N`) by pointer, Enter or Space
   opens a confirmation dialog, and nothing changes in the rule list. The dialog names the rule:
   its Summary, or `Rule N` when the Summary is empty or whitespace only. The title is
   `Delete Rule?` and the destructive action is `Delete Rule`. It follows the Story 1.13
   `<DeleteBattleDialog>` pattern, restyled for the editor: 440px paper, Cancel first and
   autoFocused, `disableRestoreFocus`, `onTransitionExited`, `aria-labelledby` and
   `aria-describedby` (UX-DR15 vocabulary). (FR-2.5, UX-DR10)
2. **Confirm removes exactly that rule.** The rule is removed only after the dialog's exit
   transition has finished, never in the click's own commit (FD3). The remaining cards renumber.
   Focus lands per Story 4.10 AC5: the Summary of the card now at the removed index, else the new
   last card's Summary, else the empty state's `+ Add Rule` when no card remains.
3. **Cancel changes nothing.** Cancel, Escape and a backdrop click close the dialog. The draft is
   untouched (same rules, same order, same `isDirty`). Once the exit transition has finished,
   focus returns to the ✕ that opened the dialog.
4. **Keyboard-operable and axe-clean.** Focus is trapped inside the dialog and Escape cancels.
   Escape closes the confirmation only: the editor stays open and no unsaved-changes dialog
   appears, even with a dirty draft. axe passes with the dialog open, in jsdom and in e2e.
   (UX-DR17)
5. **The pointer double-click cascade is closed.** A double-click on ✕ removes at most one rule.
   The confirm action is the only destructive control. Neither it nor the backdrop acts on a click
   that arrives before the dialog's enter transition has finished, so the second click of a
   double-click is inert (FD4). A held Enter does not make the dialog flicker (FD5). An e2e test
   proves this with a real `dblclick()` (the `deferred-work.md` 4.10 entry, note (2)).
6. **Supersedes 4.10's immediate delete.** 4.10's no-confirmation delete is retired in the three
   places that state it: `epics.md` 4.10 AC3 (already annotated), the 4.10 story file's AC5 (already
   annotated) and `organism-editor-design.md` "Deleting a Rule" step 2 (already annotated). Close
   the `deferred-work.md` entry "A pointer double-click on a rule card's ✕ still cascades
   deletions" as resolved in Story 4.26. Leave the condition-delete entry beside it (FD7) open and
   untouched: it is the owner's call and not in scope.
7. **Existing tests are updated to pass through the dialog, not rewritten around it.** This covers
   the 4.10 delete tests in `RulesEditor.test.tsx`, the three rule deletes in
   `OrganismEditorModal.test.tsx` and the two delete tests in `e2e/organisms.spec.ts`
   (`the header action appends, and the cards renumber on delete`, and
   `keyboard: delete -> Summary -> ...`). Each still asserts what it asserted before, plus one
   pass through the dialog.

## Tasks / Subtasks

- [x] **Task 1: copy helper** (AC: 1)
  - [x] Add `apps/web/lib/organisms/ruleDeleteCopy.ts`, the `deleteBlockCopy.ts` idiom:
        `RULE_DELETE_TITLE = 'Delete Rule?'`, `RULE_DELETE_ACTION = 'Delete Rule'`,
        `ruleDeleteLabel(summary: string, index: number): string` (trimmed Summary when it is
        non-empty, else `Rule ${index + 1}`), and `ruleDeleteSentence(label: string): string`
        returning `“${label}” and its conditions will be removed from this organism.`
        Use curly quotes, the house form. Do not write "cannot be undone": the removal is
        recoverable until Save, because Discard restores it (FD2).
  - [x] Add a colocated `ruleDeleteCopy.test.ts`: summary vs empty vs whitespace-only vs a
        100-char summary, and the index base (0 → `Rule 1`).
- [x] **Task 2: `<RuleDeleteConfirmDialog>`** (AC: 1, 4, 5)
  - [x] Add `apps/web/components/organisms/editor/RuleDeleteConfirmDialog.tsx`, a pure function of
        its props, composed exactly like `<OrganismDeleteConfirmDialog>`. Props: `open`,
        `ruleLabel` (held by the caller until `onExited`), `onCancel`, `onConfirm`, `onExited?`.
        No `pending`: nothing is async.
  - [x] `DialogContentText` gets `sx={{ overflowWrap: 'anywhere' }}`. A 100-char space-free Summary
        must not widen the paper.
  - [x] Add the enter guard (FD4). An `entered` state is set from
        `slotProps.transition.onEntered` and reset whenever `open` becomes true. Until it is set,
        `onClose` with reason `'backdropClick'` is ignored and the Delete Rule click is ignored.
        Escape and Cancel stay live, since both are non-destructive. Expose it as `data-entered`
        on the paper (via `slotProps.paper`) so tests can wait on it. Merge `slotProps.paper` with
        the existing 440px `sx`. Verify in `node_modules/@mui/material/Dialog/Dialog.js` (`useSlot('transition')`, ~`:321-349`) that a
        `slotProps.transition.onEntered` reaches the `Fade` and is not overwritten by Modal's own
        transition callbacks. If it is overwritten, compose it rather than drop the guard.
  - [x] Give both buttons `onKeyDown={ignoreRepeatEnter}` and ignore a repeat-carrying Escape in
        `onClose` (FD5). This is the `<EditorUnsavedChangesDialog>` idiom: copy the function and do
        not import across dialogs (both are ~3 lines).
  - [x] Import it statically from `RulesEditor.tsx`. It is already inside the editor's lazy chunk
        (the `EditorUnsavedChangesDialog.tsx` header records why a nested `dynamic()` is wrong).
  - [x] Add a colocated `RuleDeleteConfirmDialog.test.tsx`, the
        `OrganismDeleteConfirmDialog.test.tsx` shape: title/sentence/label, Cancel autoFocused and
        first in DOM order, Cancel/Escape/backdrop → `onCancel` only (after entered), Delete Rule →
        `onConfirm` (after entered), **backdrop and Delete Rule before entered → neither callback**,
        repeated Enter swallowed, the label stays rendered through the exit fade, axe.
- [x] **Task 3: `<RulesEditor>` owns the confirmation** (AC: 1, 2, 3, 5)
  - [x] Add three-phase state, the house shape (`useDeleteBattleDialog` / 4.23 `confirming` +
        `confirmOpen`): `confirming: { id: string; label: string } | null` (the mounted window)
        and `confirmOpen: boolean` (the fade only). Add an outcome ref
        `'confirm' | 'cancel' | null` that is read ONLY in `onExited` (FD3).
  - [x] `handleDelete` becomes a request. Refuse it if a confirmation is already mounted (use a ref
        latch, not state). Cancel any open pointer drag first with `updateDrag(null)`: the drag's
        document-capture Escape listener would otherwise eat the dialog's Escape. Call the new
        optional `onBeforeDeleteConfirm?.()` prop (FD6). Snapshot the label from `rules` at request
        time with `ruleDeleteLabel(rule.payload.summary, index)`, then open.
  - [x] Call `useInertBackground(confirming !== null)` in `<RulesEditor>`, the parent of the dialog.
        Add it above the focus effects (the 4.23 placement comment explains the ordering). The
        module-level claims registry already makes it safe over the editor's own inert window
        (Story 4.22).
  - [x] Handle `onExited` with `setConfirming(null)`. On `'confirm'`, clear the reorder
        announcement if this was the last rule (the logic that sits in `handleDelete` today) and
        call `onRulesChange((current) => removeRule(current, id))`. Leave the FD6 list-diff effect
        as it is: it performs AC2's focus move. The dialog has unmounted and focus is outside
        `root`, so it counts as loose.
  - [x] On `'cancel'` (Cancel, Escape, backdrop), a restore effect keyed on `confirming` clearing
        focuses `[data-rule-id="<id>"] [data-rule-delete]`. It uses the existing `cardControl`
        lookup with `CSS.escape`, and never a captured element, because WebKit does not focus a
        `<button>` on click. The confirmation's background is inert for the whole fade, so the user
        cannot have placed focus anywhere real. Do not copy the `closest('[role="dialog"]')` loose
        check: inside the editor, every node is inside a dialog.
  - [x] Render `{confirming !== null && <RuleDeleteConfirmDialog ... />}` inside `rootRef`'s
        `<div>`, after the list or empty state. The empty-state branch is irrelevant here, because
        the dialog only opens from a card.
  - [x] Update the header doc comment (4.10 FD6 paragraph, plus a Story 4.26 paragraph). Comments
        explain WHY.
- [x] **Task 4: `<RuleCard>`** (AC: 1)
  - [x] Keep the `onDelete(id)` prop name and the ✕ markup (`aria-label`, `data-rule-delete`). Only
        its JSDoc changes: it now REQUESTS a delete. `RuleCard.test.tsx`'s "delete calls onDelete
        with the id, once" stays green unchanged.
- [x] **Task 5: `<OrganismEditorModal>`** (AC: 4, FD6)
  - [x] Pass `onBeforeDeleteConfirm={() => usageIndicatorRef.current?.closePanel()}` to
        `<RulesEditor>`, the 4.23 FD11 reason. A usage panel left open by Tab (UsageIndicator D1)
        arms a document-capture Escape listener. That listener would take the confirmation's Escape
        and focus a trigger behind the inert layer.
  - [x] Nothing else in the modal changes. The editor's own close guard never sees the
        confirmation's Escape: MUI's `useModal` `handleKeyDown` returns early unless the modal is
        on top, and the top modal `stopPropagation()`s. That matters because the confirmation is
        rendered INSIDE the editor's React tree, so synthetic events bubble through it. A test pins
        this (Task 6).
- [x] **Task 6: unit tests** (AC: 2, 3, 4, 5, 7)
  - [x] `RulesEditor.test.tsx`: add a local helper `confirmDelete(user)` that finds
        `dialog { name: 'Delete Rule?' }`, waits for its paper's `data-entered`, clicks
        `Delete Rule`, then waits for the dialog to leave the DOM (onExited). Route the 4.10 tests
        at `:157`, `:172`, `:184` and `:199` through it and keep their existing assertions.
  - [x] The `:184` Enter test: the first Enter now opens the dialog. Confirm with Enter on
        `Delete Rule` after entered, then press Enter again on the Summary it lands on. The
        assertion ("removes nothing more") is unchanged.
  - [x] The `:212` "focus in another card is left alone" test cannot keep its premise. Through the
        dialog, focus is always in the confirmation at confirm time, so the effect's "real control
        inside the list" branch is reachable only by a parent-driven removal. Keep the branch in
        the effect. Convert the test to drive the removal through the Harness's `onRulesChange`
        directly (a parent-driven removal), and record the change in Completion Notes. Do not
        delete the test.
  - [x] Add new `RulesEditor` tests:
    - opening names the Summary, and `Rule N` for an empty or whitespace-only Summary;
    - nothing is removed while the dialog is open;
    - Cancel, Escape and backdrop (after entered) each leave `rules` referentially identical, and
      focus returns to that card's ✕;
    - a `user.dblClick` on ✕ opens one dialog and removes nothing;
    - a backdrop mousedown+click and a Delete Rule click fired before `data-entered` do nothing;
    - opening mid-drag cancels the drag (no `li[data-dragging]`);
    - axe with the dialog open.
  - [x] `OrganismEditorModal.test.tsx` `:567`, `:662`, `:1002-1004`: pass through the dialog with
        the same helper (copy it locally; test helpers are per-file here) and keep every
        assertion.
  - [x] Add new `OrganismEditorModal` tests:
    - with a dirty draft, Escape on the rule confirmation closes it only (editor still open, no
      `Unsaved Changes` dialog, `onClose` not called);
    - a usage panel opened then left open closes when the rule confirmation opens (the FD11
      pattern's test in this file is the template).
- [x] **Task 7: e2e** (AC: 2, 3, 4, 5, 7)
  - [x] In `e2e/organisms.spec.ts` (Story 4.10 describe): the two delete tests pass through the
        dialog. Look the confirmation up with `page.getByRole('dialog', { name: 'Delete Rule?' })`
        (it portals to `<body>`, outside `rules`). Wait with
        `await expect(dialog.locator('[data-entered]')).toHaveCount(1)` before clicking
        `getByRole('button', { name: 'Delete Rule', exact: true })`. Playwright names are
        case-insensitive substrings, and `Delete Rule` would otherwise match `Delete rule 1`. The
        keyboard test presses Enter on ✕, waits for entered, then Tab → Enter on Delete Rule. That
        is Alt+Tab on WebKit, the existing `tabKey`.
  - [x] Add new e2e tests:
    - `dblclick()` on ✕ of rule 1 of three: the dialog is visible and three rules remain; then
      Cancel leaves three;
    - Escape cancels and ✕ is focused;
    - axe with the dialog open (use the existing axe helper in that file).
  - [x] Keep it thin. The e2e is Chromium-only in `ci:dev`, and CI runs the matrix.
- [x] **Task 8: bookkeeping** (AC: 6)
  - [x] In `deferred-work.md`, strike the 4.10 cascade entry and mark it `✅ Resolved in Story 4.26`,
        the file's existing form.
  - [x] Run `npm run ci:dev` (never the four-browser `npm run ci`). If `bundle:check` moves a route,
        refresh the baseline in this story (`npm run build:standalone` then
        `npm run bundle:baseline`). The dialog is expected to add nothing to first load, because it
        lives in the editor's lazy chunk.

## Dev Notes

### Forced decisions (defaults written in; follow them unless the owner overrides)

- **FD1: the confirmation lives in `<RulesEditor>`, not the modal.** `<RulesEditor>` owns the
  list, the FD6 focus effect, the drag state and the `cardControl` lookup, so every close path's
  focus move is local. The modal's only involvement is the FD6 panel-close callback.
- **FD2: copy.** The title is `Delete Rule?` (a question, like `Delete Battle?` and
  `Delete Organism?`). The action is `Delete Rule` (the object named). The body is
  `“<label>” and its conditions will be removed from this organism.` There is no "cannot be undone"
  claim: until Save, Discard restores the rule (4.23), so that sentence would be false.
- **FD3: act on the outcome in `onExited`, never in the click's commit.** This is the Story 4.22
  FD9 / 4.23 FD6 "no stacked unwinding" rule. Removing the rule in the same commit as closing the
  dialog would run the FD6 focus move while the confirmation still holds the focus trap and the
  editor is still inert, and `focus()` into an inert subtree is a silent no-op.
- **FD4: the enter guard.** The dialog paper is centred, and the rules column is the middle one, so
  the second click of a double-click can land on the backdrop (an instant dismiss) or on
  `Delete Rule` itself. `deferred-work.md` note (1) requires that click to be inert. A handler
  guard on `onEntered` keeps the visuals unchanged: no disabled flash, and no `pointer-events`
  trick that would let the click fall through to the inert editor. Escape and Cancel stay live
  because both are safe.
- **FD5: held-key hygiene.** Enter on ✕ opens the dialog on keydown, the auto-repeat then hits the
  autoFocused Cancel, the dialog closes, focus is restored to ✕, and the next repeat reopens it.
  The result is a flicker, not data loss. `ignoreRepeatEnter` on the buttons and the
  repeat-Escape filter in `onClose` are the 4.23 FD10 / review-D2 fixes, copied.
- **FD6: close the usage panel before opening.** The reason is 4.23 FD11 (`closePanel()` never
  moves focus). The optional prop keeps `<RulesEditor>` ignorant of the footer.
- **FD7: condition-row delete stays unconfirmed.** `deferred-work.md` leaves that to the owner, and
  this story does not touch `<ConditionsEditor>`.

### Current state of the files this story modifies

- `RulesEditor.tsx` (415 lines). `handleDelete` (`:158-166`) clears the announcement on the last
  rule and calls `removeRule` immediately. The FD6 effect (`:270-345`) diffs ids: length −1 moves
  focus to the neighbour's Summary or the empty CTA when focus is "loose" (`null`, `body`, or
  outside `root`). Its drag branch closes a drag whose card vanished. The Escape capture listener
  (`:259-268`) is live only mid-drag. **Preserve:** every FD6 branch (add, delete, reorder
  re-focus, the "real control inside the list" guard), `pendingFocusIdRef` clearing, the
  announcement logic, and the drag plumbing.
- `RuleCard.tsx` (433 lines). The ✕ is `DeleteButton` (`:373-380`), `aria-label="Delete rule N"`,
  `data-rule-delete`, `onClick={() => onDelete(rule.id)}`. No markup change.
- `OrganismEditorModal.tsx` (1205 lines). `<RulesEditor>` is mounted at `:1158-1164`. `usageIndicatorRef`
  is at `:815`. The 4.23 confirmation at `:1194-1202` is the stacked-dialog template, rendered as a
  SIBLING of the editor `Dialog`. This story's dialog is rendered INSIDE it (via `<RulesEditor>`),
  which is why Task 5's Escape test exists.
- `lib/useInertBackground.ts`: the claims registry since Story 4.22 handles a modal stacked over the
  editor. Reuse it and do not modify it.

### What already exists (reuse, do not rebuild)

- `<OrganismDeleteConfirmDialog>` / `<DeleteBattleDialog>`: the dialog composition to copy.
- `<EditorUnsavedChangesDialog>`: `ignoreRepeatEnter` and the repeat-Escape `onClose` filter.
- `removeRule` (`lib/organisms/ruleDraft.ts`): returns the same reference for an unknown id, so a
  confirm whose rule vanished is a no-op.
- `deleteBlockCopy.ts`: the copy-module shape Task 1 mirrors.

### Anti-patterns (these compile and pass tests, and are still wrong)

- Removing the rule in `onConfirm` rather than `onExited` (FD3).
- Restoring focus to a captured `HTMLElement` rather than a DOM lookup (WebKit).
- Leaving MUI's restore-focus on (it restores to `<body>` on WebKit and overwrites the explicit
  move).
- `disabled` on `Delete Rule` until entered: a visible flash, and MUI's colour transition is the
  axe mid-fade trap.
- A `document` keydown listener for the repeat guard. It regressed unrelated tests in 4.23 (the
  `EditorUnsavedChangesDialog.tsx` header).
- Rewriting the 4.10 tests around new helpers so that their original assertions disappear (AC7).
- A `role="alert"`/`role="status"` inserted while the confirmation is up (the project-context
  live-region trap). The reorder status must not be cleared or set during the dialog; clear it
  only in the `onExited` confirm path.

### Testing standards

- Vitest + RTL + user-event 14, and axe via `vitest-axe`'s `axe()` on `results.violations`. The
  dialog portals to `document.body`, so scope queries with `screen`, not the render `container`.
- In jsdom the `Fade` completes on a real ~225 ms timer. Wait on `data-entered` and on the dialog
  leaving the DOM with `waitFor`, and never with fixed sleeps.
- jsdom's `dblClick` targets the same node twice (no hit-testing), so it proves the request latch,
  not FD4. The e2e `dblclick()` is FD4's proof. Pin both.

### Project Structure Notes

- New: `components/organisms/editor/RuleDeleteConfirmDialog.tsx` (+ test) and
  `lib/organisms/ruleDeleteCopy.ts` (+ test). Non-component files are camelCase.
- No package changes, and the `@gol/domain` barrel is untouched (the lane-sync collision point).

### Previous story intelligence (4.25)

- Review pinned "every claim the ACs make". Expect the reviewer to check each close path's focus
  target and the double-click proof specifically.
- Scoped, `exact: true` Playwright names: 4.24/4.25 broke existing specs through substring
  matches. `Delete Rule` vs `Delete rule N` is this story's instance.
- "A comment that claims a boundary needs a test on that boundary" (4.24 second pass).

### Git intelligence

- HEAD `10947c5` merges 4.25 (#88). The recent Epic 4 work is battle-side (`BattlePage`,
  `OrganismRoster`, `useOrganismEditorModal`). This story touches none of it. The last change to
  `RulesEditor.tsx` / `RuleCard.tsx` was 4.17 (`3ebe903`), and before that 4.13.

### Latest tech notes

React 19.2 (automatic batching, so `setConfirming(null)` and the parent's `setDraft` in
`onExited` land in one commit, and all passive cleanups run before any setup), MUI 9.3.1
(`slotProps.transition`, no `disableEscapeKeyDown`), Playwright 1.62. No new dependencies.

### References

- `docs/planning-artifacts/epics.md`: Story 4.26 (`:1302-1313`), Story 4.10 AC3 (`:1113`).
- `docs/implementation-artifacts/deferred-work.md` (~`:1652-1670`): the cascade entry, notes
  (1) and (2).
- `docs/implementation-artifacts/4-10-rule-cards-empty-state.md` AC5 / FD6.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:596-598`.
- `docs/project-context.md`: the live-region trap, AR-35 per-component imports, `ci:dev`.

### Questions for Sidiar (saved for the end; defaults are written in)

- The FD2 body copy. The default is `“<label>” and its conditions will be removed from this
  organism.`
- Should the confirmation also be shown for a rule with no Summary and no conditions (a freshly
  added, empty card)? The default is yes, because the AC has no exception.

## Dev Agent Record

### Agent Model Used

Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npm run ci:dev` — full pass: `typecheck`, `lint`, `format:check`, `spec:check`,
  `boundary:check`, `test:coverage` (2481/2481, see note below), `build:standalone`,
  `bundle:check` (all four routes within the 8 KB allowance — `battle`/`battle/new` +3.0 KB,
  `organisms` +1.1 KB, `settings` +0.1 KB, `home` −0.3 KB — no baseline refresh needed), `bench` /
  `bench:check` (NFR-1.1 frame unaffected), `e2e:chromium` (300 passed, 1 pre-existing skip).
- `test:coverage` is flaky under this sandbox's 6-core parallelism: two full runs each timed out
  (5000ms default) on a different, unrelated 2-4 test subset (e.g.
  `BattlePage.editOrganism.test.tsx`, `OrganismLibrary.test.tsx`); every failing file/test passed
  cleanly both in isolation (with `--coverage`) and in a full plain `vitest run` (no coverage
  instrumentation, 2481/2481 twice). A third full `test:coverage` run also passed clean
  (2481/2481). Concluded pre-existing CPU-contention flakiness in this environment, not a
  regression from this story.

### Completion Notes List

- Implemented per the story's forced decisions (FD1-FD7) with no deviations from the defaults;
  both "Questions for Sidiar" defaults stand.
- Task 6, the `:212` test ("deleting while focus sits in another card leaves that focus alone"):
  converted to drive the removal through the Harness's `onRulesChange` directly (a new
  `exposeRemove` callback prop on the test's `Harness`), per the story's own instruction — through
  the dialog, focus is always in the confirmation at confirm time, so that effect branch is now
  reachable only by a parent-driven removal.
- Two other pre-existing `RulesEditor.test.tsx` tests outside the named `:157/:172/:184/:199`
  quartet also call a rule delete and needed the same confirmation pass-through to stay green:
  "the dragged card leaving the list closes the drag" (renamed to name what actually closes the
  drag now — opening the confirmation, via `handleDelete`'s own `updateDrag(null)`, not the
  removal) and "the announcement does not survive the empty state" (both its deletes now route
  through `confirmDelete`).
- A raw DOM/CSS query (`document.querySelectorAll('[data-rule-id]')` in jsdom,
  `page.locator('[data-rule-id]')` in e2e), not `getByRole`, is required to count rule cards WHILE
  the confirmation is open: MUI's `ModalManager` marks the whole editor `aria-hidden` while a
  stacked dialog is topmost (the same mechanism `useInertBackground.ts`'s own header comment
  documents), and both RTL's and Playwright's role-based queries exclude `aria-hidden` subtrees by
  default. Two new tests needed this (one unit, one e2e); recorded here since a future edit that
  swaps a raw query back for `getByRole` there will silently start failing "resolved to 0 elements"
  again with no obvious cause.
- Task 7's own prescribed e2e assertion, `await expect(dialog.locator('[data-entered]')).toHaveCount(1)`,
  does not work: MUI puts `role="dialog"` directly on the Paper element, so `data-entered` (merged
  onto that same node via `slotProps.paper`) is a property of `dialog` itself, not a descendant —
  `.locator()` only searches descendants. Fixed to `await expect(dialog).toHaveAttribute('data-entered', '')`
  everywhere this pattern was used (both new e2e tests and the two updated 4.10 tests). Found via a
  real Chromium run: the jsdom/RTL unit tests never hit this because `screen.getByRole('dialog', ...)`
  there returns the dialog element itself and the tests call `.toHaveAttribute` on it directly, never
  `.locator('[data-entered]')` on it.
- Bundle growth is small but non-zero on three of four routes (see Debug Log) despite the dialog
  and its copy module living in the editor's already-lazy chunk; `bundle:check` still passes well
  within its 8 KB allowance, so no baseline refresh was needed per the story's own conditional.

### File List

- `apps/web/lib/organisms/ruleDeleteCopy.ts` (new)
- `apps/web/lib/organisms/ruleDeleteCopy.test.ts` (new)
- `apps/web/components/organisms/editor/RuleDeleteConfirmDialog.tsx` (new)
- `apps/web/components/organisms/editor/RuleDeleteConfirmDialog.test.tsx` (new)
- `apps/web/components/organisms/editor/RulesEditor.tsx` (modified)
- `apps/web/components/organisms/editor/RulesEditor.test.tsx` (modified)
- `apps/web/components/organisms/editor/RuleCard.tsx` (modified — JSDoc only)
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (modified)
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` (modified)
- `apps/web/e2e/organisms.spec.ts` (modified)
- `docs/implementation-artifacts/deferred-work.md` (modified — 4.10 cascade entry resolved)

## Change Log

- 2026-09-27: Story created (ready-for-dev).
- 2026-09-27: Implemented (Tasks 1-8); status set to review.

Proposed lane gate: none

Dev Model: sonnet   # follows the shipped stacked-dialog pattern (4.22/4.23) inside one component; the only new piece (the onEntered guard) is small and fully specified
