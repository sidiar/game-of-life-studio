---
baseline_commit: 087900177933e95ab54a12c19fddd185c63a8deb
---
# Story 4.22: Safe Delete & Protected Default

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to delete unused organisms — but never lose the built-in one,
so that my library stays clean and always usable.

## Acceptance Criteria

From `epics.md#Story 4.22: Safe Delete & Protected Default` (`:1252-1262`), plus the two owner decisions
Sidiar recorded on Story 4.21's review on 2026-09-25 (`4-21-delete-integrity-blocks.md:288-304`,
`deferred-work.md:3024-3044`):
- **FD2 (a):** 4.22 removes the "Delete only on blocked cards" transitional rule.
- **FD1 (a):** 4.22 builds the editor's Column-1 "Delete Organism" button, using the same verdict as
  the card.

**The domain verdict already exists and is 100% covered.** `organismDeleteVerdict` in
`packages/domain/src/organismDeleteGuard.ts` returns `protected` / `blocked` / `allowed`, and Story
4.21 wrote it for this story to consume. **This story adds no domain code.** Read FD1–FD14 before
touching a file. Five failures here compile and pass tests anyway, and each is settled there:
- deleting on a stale verdict (FD4);
- a second `role="status"` that turns every count-badge assertion strict-mode red (FD7);
- publishing the toast into an inert subtree (FD7);
- closing the editor and the dialog stacked on it in the same commit (FD9);
- a disabled Delete whose explanation a keyboard user can never reach (FD6).

1. **Delete on every card (FD2 (a) — the 4.21 transitional rule is removed).** Every Library card
   renders the Delete action. The verdict decides what it does:
   - `allowed` → the confirmation dialog (AC2).
   - `blocked` → Story 4.21's block dialog, unchanged.
   - `protected` (Conway's Classic) → the button is **disabled** and carries the explanatory message
     (AC4).

   `<OrganismCard>`'s head comment, the `CardActions` comment and the `onRequestDelete` prop comment
   all stop describing the transitional state.

2. **Confirmation precedes removal (FR-1.4, UX-DR15).** For an `allowed` organism, Delete opens a
   confirmation dialog before anything is written. The dialog is modelled on
   `<DeleteBattleDialog>` (`apps/web/components/gallery/DeleteBattleDialog.tsx`).
   - Title: `Delete Organism?`
   - Body: the PRD sentence **verbatim**, `Are you sure you want to delete “<display name>”?`
     (`prd.md:136`). The name is resolved through `toDisplayOrganism`, so an `''` name reads
     `Unnamed organism`.
   - Actions: `Cancel` (first in DOM order, `autoFocus`, `variant="outlined"`, `color="inherit"`),
     then `Delete Organism` (`variant="contained"`, `color="error"`).
   - **Cancel**, **Escape** and the **backdrop** change nothing: no write, no reload, no toast.
     Focus returns to the Delete button that opened the dialog.

3. **Confirm deletes, with the toast and the refresh (FR-1.4, UX-DR14, epic "the Library grid
   refreshes").** On Confirm the following happens in order:
   1. **Re-verify.** The verdict is re-derived from a **fresh**
      `Promise.all([organisms.list(), battles.list()])` immediately before the write (FD4, 4.21's
      FD12).
   2. **Write.** Only if the fresh verdict is still `allowed` does `organisms.delete(id)` run.
   3. **Close.** The dialog closes. Once its exit transition has finished, the Library `reload()`s:
      the card is gone and the count badge drops by one.
   4. **Toast.** `Organism deleted` is published in a live region on the Library (FD7).
   5. **Focus.** Focus lands on the `+ Create New Organism` button, because the card's own Delete
      button is gone (FD8).
   6. **While the write is in flight**, both buttons are `disabled` and Escape and the backdrop are
      no-ops (the `<DeleteBattleDialog>` `pending` guard). A double-activation writes once (a
      synchronous latch ref, not `pending` state).

4. **Conway's Classic is protected regardless of usage (FR-1.5, M9, UX-DR15).**
   - On its card, Delete renders `disabled`, with the explanatory message
     `Conway's Classic is a built-in organism and can't be deleted.` (`prd.md:137`).
   - The message is **visible text on the protected card**, and the disabled button references it
     with `aria-describedby` (FD6).
   - This holds whether or not a battle places Conway's Classic or a rule targets it, because
     `protected` wins in the verdict (4.21 FD3).
   - No click path reaches any dialog for it.
   - The `SYSTEM` tag is unchanged.

5. **The editor's Column-1 "Delete Organism" (FD1 (a); `organism-editor-design.md:284-300,
   :573-583`).**
   - In an **edit** session (`organism !== null`), a `Delete Organism` button renders at the
     bottom of the Basic Information column. It uses the outlined danger style (FD10).
   - It is **absent** from a create session, including after that session's first Save (FD11).
   - It follows **the same verdict**:
     - `protected` → disabled, with the same message (AC4).
     - `blocked` → Story 4.21's block dialog, **stacked over the editor**. Dismissing it returns
       focus to the editor's Delete button, and the editor and its draft are untouched.
     - `allowed` → the confirmation dialog, stacked over the editor. Cancel returns focus to the
       editor's Delete button.
   - On Confirm (with the same re-verify, latch and pending lock as AC3), the organism is deleted.
     Then the confirmation exits, **and only then** the editor closes (FD9). Once the editor has
     exited, the Library reloads and publishes `Organism deleted`, and focus lands on
     `+ Create New Organism`. The design doc's steps 4–5: "Organism deleted, editor closes, returns
     to library" / "Success message: 'Organism deleted'".
   - The editor receives **no repository** for this. It gets one callback prop,
     `onRequestDelete?(): void`, and renders the button **iff** that prop is passed (the card's
     contract, FD11). The Library owns the verdict, the dialogs and the write (AR-2/AR-27).

6. **A stale verdict never deletes (FD4, the integrity guarantee, NFR-5.1 scope).** Suppose the
   re-verify at Confirm finds the organism `blocked` (say a battle placing it was saved in another
   tab). Then **nothing is deleted**:
   - the confirmation closes;
   - the Library reloads;
   - once the confirmation has exited, Story 4.21's block dialog opens **in the same window** with
     the fresh battles and names (a handoff, not a second click; FD5).

   Two more re-verify cases:
   - If the fresh read shows the organism **no longer exists** (it was deleted in another tab), the
     write is skipped and the Library reloads. There is no toast, because this action deleted
     nothing. *(Review decision (b), Sidiar 2026-09-25 — editor origin only: the editor stays open
     and reports `ORGANISM_DELETE_GONE` in-editor through FD12's `SaveErrorLine` alert; the card
     origin stays silent, its card is simply gone after the reload. Second-pass decision (a),
     Sidiar 2026-09-25: while that alert shows, the editor's Delete is `disabled` and described by
     the alert; a disabled button cannot hold focus, so focus lands on the editor's Save through the
     `editor-save` restore intent.)*
   - If the fresh read shows it is now `protected`, nothing is deleted. That is unreachable (ids do
     not change), but the verdict is total, so the handler must not assume otherwise.

7. **A refused delete is reported, never swallowed (NFR-7.2 idiom).** If the re-verify read or
   `organisms.delete` rejects:
   - the dialog closes, and nothing is removed from the grid;
   - once the dialog has exited, a `role="alert"` line on the Library reports
     `This organism could not be deleted. Nothing was changed — try again.` (FD12).

   Queue it and publish it from the exit handler, exactly as `queuedCloneErrorRef` does (the
   project-context live-region trap). For the editor origin, the editor stays open, so the alert
   must reach the user **inside the editor's window** (FD12).

8. **Keyboard and a11y.**
   - The confirmation dialog traps focus, `Cancel` is focused on open, and Escape cancels.
   - axe reports zero violations:
     - on the Library with the confirmation open;
     - on the Library with the toast visible;
     - on a Library holding the protected card's disabled Delete and its message;
     - on the editor with its Delete button;
     - on the editor with each dialog stacked over it.
   - The disabled Delete's `aria-describedby` target exists in the DOM.
   - The editor's Delete button passes `color-contrast` at rest and hovered in the e2e scan
     (`--gol-danger` on `--gol-bg-secondary`; the card button's 4.21 measurement is the precedent).

9. **Tests are updated, not rewritten around.** Story 4.21's "Delete only on blocked cards"
   assertions invert:
   - `OrganismCard.test.tsx:260` ("renders no Delete button when onRequestDelete is not passed");
   - `OrganismLibrary.test.tsx:1518` ("Conway's Classic has no Delete …");
   - e2e `organisms.spec.ts:4049` ("1. Delete is present only on the blocked cards").

   Every other 4.21 test stays green unchanged, apart from the mechanical count-badge retarget
   (FD7).

10. **Gates.**
    - `npm run ci:dev` is green from the worktree root, with its real exit code recorded. Do not
      pipe it.
    - `spec:check` passes on every ID written into a comment.
    - Bundle, under the growth ratchet that landed 2026-09-25 (project-context "Bundle size is
      gated on GROWTH"):
      - the new dialog and the new copy are behind `next/dynamic`;
      - `npm run bundle:check` passes against `scripts/bundle-baselines.json` (`/organisms`:
        306101 B);
      - if the route grew, refresh the baseline **in this story's diff** with
        `npm run build:standalone` then `npm run bundle:baseline`, and record the old and new
        numbers;
      - never hand-edit the JSON.

## Tasks / Subtasks

- [x] **Task 1: read before writing (AC: all).**
  - [x] `packages/domain/src/organismDeleteGuard.ts`, its head comment end to end. The verdict and
        its order are settled, so consume them.
  - [x] `apps/web/components/organisms/OrganismLibrary.tsx` end to end, especially:
        - `:439-534`, 4.21's delete window: `blocked`, `deleteDialogOpen`, `deleteWindowRef`,
          `deleteRestoreIdRef`, `requestDeleteOrganism`, `handleDeleteExited`, `guardedCreate`;
        - `:314-344`, the clone error queue and `publishQueuedCloneError`;
        - `:426-437`, the `onGateExited` composition;
        - `:652-687`, the card map.
  - [x] `apps/web/components/organisms/OrganismCard.tsx`: `ActionButton` (with its `&:disabled`,
        `[data-danger]` and no-transition notes), the prop contracts and the tab-stop comment.
  - [x] `apps/web/components/gallery/DeleteBattleDialog.tsx` end to end: the dialog **and**
        `useDeleteBattleDialog`. That file is the pattern for the confirmation's
        `pending` / latch / focus-after-exit / `focusIsLoose` rules.
  - [x] `apps/web/lib/organisms/useOrganismEditorModal.ts` end to end, especially the head comment's
        warning about **two `useInertBackground` restore maps unwinding in call order** (FD9) and
        `handleExited` / `restoreFocusRef` (FD8).
  - [x] `apps/web/components/organisms/editor/OrganismEditorModal.tsx`:
        - the props (`:70-142`);
        - the footer derivations (`:120-149`, the editor already builds `usageIndex`/`ruleIndex`);
        - `handleRequestClose` and the `isSaving` lock;
        - the `basicInfo` slot (`:447-466`);
        - `SaveErrorLine` (the in-editor alert FD12 reuses).
  - [x] `apps/web/components/organisms/OrganismDeleteBlockedDialog.tsx`, the dialog that now also
        opens over the editor.
  - [x] `apps/web/lib/useInertBackground.ts`, the MutationObserver note on "a nested modal".
  - [x] The mockup, `clinical-lab-theme/organism-library.html:334-349` (`.delete`, `:disabled`,
        `:disabled:hover`), `:442` (Conway's `disabled` Delete) and `:648-675` (the confirm/block
        branch).
  - [x] Re-read FD1–FD14 below.

- [x] **Task 2: extract the delete controller, `apps/web/lib/organisms/useOrganismDelete.ts`
      (AC: 1–3, 5–7).**
  - [x] Move 4.21's inline delete window **out** of `<OrganismLibrary>` into a hook (4.21 FD8 set
        the trigger: "extract `useOrganismDeleteBlock` … past roughly 30 lines", and this story
        doubles it). Name it `useOrganismDelete`, since it now owns confirm as well as block.
    - It must **not** live beside either dialog, because the `next/dynamic` import is load-bearing
      (the `useOrganismEditorModal` header records why).
    - Import both dialogs' prop types with `import type` only.
  - [x] Inputs: `organisms: OrganismRepository` and `battles: BattleRepository` (both
        interface-typed, injected by the Library, AR-2/AR-27), plus `reload(): void`.
        Also a `canOpen(): boolean` guard (or equivalent) so the Library keeps its
        "not while the editor or gate is mounted **for the card origin**" rule. The editor origin is
        the one case where the editor **is** mounted (FD9).
  - [x] State: one window cell, `pending` UI state, one latch ref, one restore intent ref, and the
        queued toast / error.
    - The window cell is `{ organismId; organismName; origin: 'card' | 'editor'; kind: 'confirm' |
      'blocked'; battleNames; referencingNames } | null`, held through the exit fade (the
      `confirming` precedent).
    - `pending` is the UI state; the **latch ref** is the authority.
    - The restore intent is `{ kind: 'card', organismId } | { kind: 'editor' } | { kind: 'create' }
      | null` — plus `{ kind: 'editor-save' }` since the second-pass decision (a): the editor-origin
      gone branch, whose Delete is disabled on the same commit and cannot take focus.
  - [x] `requestDelete(organism, origin)` works as follows:
    - It is synchronous. Set the window authority ref **first**, which is 4.21's
      `deleteWindowRef` guard against the lazy-chunk window.
    - Compute `organismDeleteVerdict(organism.id, usage, ruleIndex)` from the Library's **settled**
      data, the same data the cards render from (4.21 FD7). `protected` returns immediately, as
      defence in depth, because the disabled button makes it unreachable.
    - `blocked` → the block variant, with names resolved through `usageBattleNames` /
      `referencingOrganismNames` against the **unfiltered** `summaries` / `loadedOrganisms`.
    - `allowed` → the confirm variant.
  - [x] `confirm()` runs the AC3/AC6 sequence:
    - Latch, then `setPending(true)`.
    - The fresh read, then the fresh indexes (`buildUsageIndex`, `buildRuleReferenceIndex`), then
      the fresh verdict. Then branch:
      - `allowed` and the record is present → `await organisms.delete(id)` → queue the toast →
        restore intent is `create`.
      - record absent → reload only.
      - `blocked` → stash a **proceed-to-block** payload with the FRESH names (FD5).
    - Then close. The **exit handler** does the rest: publish, reload, hand off to block, or
      release the window.
    - A rejection anywhere in the read or the write queues the FD12 failure. `finally` releases the
      latch and `pending`.
  - [x] Exit handler, in ONE handler so React batches it:
    - If a proceed-to-block payload is stashed, swap the window to the `blocked` variant and reopen.
      The window never goes `null`, so inert never releases (the `handleGateExited` handoff
      precedent).
    - Otherwise clear the window, release the authority ref, then publish the queued toast or
      error, call `reload()` if a write or a fresh read happened, and publish the queued
      card-Clone failure (4.21's `handleDeleteExited` rule, kept).
    - For `origin: 'editor'` after a successful delete, signal the Library to close the editor
      **here**, after this dialog's exit (FD9). The toast is then held until the **editor's** exit
      (FD7).
  - [x] `useInertBackground(window !== null)` and the focus-restore effect, **in that order** in
        the hook. That order is load-bearing, and 4.21's `OrganismLibrary.tsx:461-464` comment
        moves with it. The focus effect follows the `useDeleteBattleDialog` `focusIsLoose` rule.
        Its targets:
    - card → `[data-delete-organism-id="…"]`;
    - editor → `[data-editor-delete-organism]`;
    - editor-save → `[data-editor-save]` (second-pass decision (a));
    - create → `[data-create-organism]`.

    All four are looked up by DOM query with `CSS.escape`, never with a captured element (FD8).
  - [x] Return `{ requestDelete, windowActive, blockedProps | null, confirmProps | null, toast,
        deleteError, closeEditorRequested… }` in whatever exact shape keeps `<OrganismLibrary>` thin.
        Keep **one** source of "which dialog is mounted".
  - [x] Tests in `useOrganismDelete.test.tsx`, through the hook with the in-memory fakes from
        `@gol/test-utils` (never a hand-rolled repo):
    - allowed → confirm → delete called once, and a double confirm still calls it once;
    - cancel → no write;
    - the stale case (FD4): a battle placing the organism is added to the fake **after** the
      request and **before** the confirm → no delete, and the handoff to blocked carries the fresh
      battle name;
    - the vanished record → no delete call, no toast;
    - a delete rejection → an error is queued and published on exit, and no toast;
    - `protected` → no window.

- [x] **Task 3: the confirmation dialog, `apps/web/components/organisms/OrganismDeleteConfirmDialog.tsx`
      (AC: 2, 3, 8).**
  - [x] Props: `open`, `organismName` (already display-resolved and held through the fade),
        `pending`, `onCancel()`, `onConfirm()`, `onExited?()`. It is a pure function of its props:
        no repository and no `@gol/domain` import.
  - [x] Composition: `<DeleteBattleDialog>`'s composition exactly:
    - 440 px paper, `disableRestoreFocus`, `onTransitionExited`;
    - `aria-labelledby` + `aria-describedby`;
    - `BUTTON_SX`, and `overflowWrap: 'anywhere'` on the body;
    - `onClose` guarded on `pending`.
  - [x] Copy lives in `apps/web/lib/organisms/deleteBlockCopy.ts`, which is **already lazy-only**
        (4.21 FD5). Add three strings there: `DELETE_CONFIRM_TITLE`, `deleteConfirmSentence(name)`
        and `DELETE_CONFIRM_ACTION`. Do not put them in `usageLabels.ts`, which is eager on
        `/organisms` since 4.21's review. Rename the module only if the dev judges the name
        misleading. If renamed, update every importer and its test file in the same commit.
  - [x] Tests:
    - title, sentence and name, including the `Unnamed organism` display fallback, which the
      caller resolves;
    - `Cancel` is focused on open;
    - Cancel, Escape and backdrop each call `onCancel`, while pending none of them does, and both
      buttons are disabled while pending;
    - Confirm calls `onConfirm`;
    - the name stays rendered while `open` flips to false;
    - axe is clean.

- [x] **Task 4: `<OrganismCard>` Delete on every card, and the protected state (AC: 1, 4, 8).**
  - [x] `onRequestDelete` stays **optional**, and the "renders iff present" contract stays, so a
        caller that passes no handler still gets no button. The Library now passes it on
        **every** card.
  - [x] New protected rendering, keyed on the existing `system` prop. The Library passes
        `system={verdict.kind === 'protected'}` (FD3):
    - the Delete button renders with native `disabled`;
    - it gets `aria-describedby` pointing at a `useId()` note;
    - the note renders under the action row **only on the protected card**, as real text:
      `Conway's Classic is a built-in organism and can't be deleted.`
  - [x] The note's styling is `--gol-text-secondary` at 12px, the `RulesLine` class. It uses no new
        token and no raw hex (AR-46).
  - [x] The button's `[data-danger]` colour stays under the existing `&:disabled` opacity. SC 1.4.3
        exempts disabled controls. Keep the existing `&:disabled:hover` reset, so the disabled
        button gives no false affordance, and keep it from lifting.
  - [x] Update the head comment, the `CardActions` comment, the `onRequestDelete` and `system` prop
        comments, and the `SystemTag` comment (it says "Delete will be disabled once Story 4.22
        adds it"). The tab-stop comment gets: Delete is the third stop on every card **except**
        the protected one, where a disabled button is skipped. The note is reachable in browse mode
        and through the button's description.
  - [x] `OrganismCard.test.tsx`:
    - invert `:260` per AC9 (without the prop there is still no Delete; the Library-level
      assertion is what flips);
    - `system` + `onRequestDelete` gives a disabled Delete with the description, and the note is
      present;
    - clicking the disabled Delete calls nothing;
    - a non-system card has no note;
    - Tab order Edit → Clone → Delete on a normal card, and Edit → Clone on the protected card;
    - axe is clean on the protected card.

- [x] **Task 5: the editor's "Delete Organism" (AC: 5, 8).**
  - [x] New optional prop on `OrganismEditorModalProps` (the data half, not the lifecycle half):
        `onRequestDelete?(): void`, with a contract comment. The editor renders the button iff the
        prop is passed **and** `organism !== null`.
  - [x] The editor computes `organismDeleteVerdict(organism.id, usageIndex, ruleIndex).kind` for
        the **disabled** state only, using the indexes it already builds (`:129-130`). This is a
        call to the domain verdict, not a re-derivation (4.21 FD3 forbids
        `entries.length > 0 || …`, not calling the function). The click decides nothing. It calls
        `onRequestDelete()`, and the Library re-derives at click time.
  - [x] Placement: last inside the `basicInfo` fragment (bottom of Column 1), with a
        `data-editor-delete-organism` attribute (the focus-restore key, FD8).
    - Styling per FD10: the outlined danger button, with `--gol-danger` text and a
      `--gol-border-control` border that turns `--gol-danger` on hover.
    - `transition: 'none'`, per the house mid-fade axe trap.
    - `disabled={isSaving || protected}`, because a delete must not race an in-flight save.
    - `aria-describedby` to the same protected note copy when `protected`.
  - [x] **Lock**: while a save is in flight, Delete is disabled (above). While a delete dialog is
        stacked over the editor, the editor is inert under it, so no editor control is reachable.
        No extra guard is needed beyond the Library's latch.
  - [x] `<OrganismLibrary>` passes `onRequestDelete={() => requestDelete(modalProps.organism,
        'editor')}` when `modalProps.organism !== null`. Take the record the hook holds for the
        mount. The name staleness after an in-session rename-and-save is FD11's recorded residual.
  - [x] `OrganismEditorModal.test.tsx`:
    - no Delete in create mode, and none after a create's first Save;
    - no Delete when the prop is absent;
    - Delete renders in edit mode and calls the prop;
    - disabled with the description for Conway's Classic;
    - disabled while `isSaving`;
    - axe is clean.

- [x] **Task 6: wire it in `<OrganismLibrary>` (AC: 1–7).**
  - [x] Replace 4.21's inline delete state with `useOrganismDelete`. Keep `guardedCreate`'s and
        `onRequestEdit`'s "bail while the delete window is open" guards, now reading the hook's
        authority. Keep the clone-publish deferral (`if (!deleteWindowActive) publish…`).
  - [x] Card map: pass `onRequestDelete` on **every** card (`() => requestDelete(organism,
        'card')`). Pass `system` from the verdict (FD3). Nothing else in the map changes.
  - [x] Mount both lazy dialogs on the hook's window. `OrganismDeleteBlockedDialog` is the existing
        `dynamic()`. Add `OrganismDeleteConfirmDialog` as a **fourth** `dynamic({ ssr: false })`
        boundary with a why-comment in the house form.
  - [x] **Editor origin (FD9).** On the hook's "close the editor" signal, call `modalProps.onClose()`.
    - This fires only after the confirmation has exited.
    - Compose the editor's `onExited` as `onGateExited` composes the gate's:
      `modalProps.onExited?.()` first, then publish the held toast.
    - ⚠️ `modalProps.onClose` is the channel Story 4.23's unsaved-changes guard will sit in front
      of. The delete-close must **not** prompt "discard changes?", because the organism is gone.
      Leave a comment at this call site naming that, and record it for 4.23 (Task 9).
  - [x] **The toast region (FD7).**
    - An always-mounted `<div role="status" data-delete-status>` whose child mounts with the
      sentence (the editor's `SaveOutcomeLine` idiom, `OrganismEditorModal.tsx:430-434`). It sits
      beside the `[data-clone-error]` alert, OUTSIDE the `aria-busy` wrapper.
    - It is cleared at the start of the next delete request, so a repeat re-announces.
    - Add `data-organism-count` to `CountBadge`, and retarget every **unscoped**
      `getByRole('status')` that means the badge to that attribute:
      - e2e `organisms.spec.ts:210, :235, :242, :2854, :3160`;
      - the 12 badge queries in `OrganismLibrary.test.tsx`.

      Leave `:1410` alone, because it is scoped to `basicInfo`. Update the Library's `:620-632`
      comment, which says the badge is "the page's only status node".
  - [x] **The failure alert (FD12)**, card origin: a `role="alert" data-delete-error` line beside
        `[data-clone-error]`, published on the dialog's exit. For the editor origin, see FD12.
  - [x] `OrganismLibrary.test.tsx`:
    - AC9's inversion at `:1518`, so Conway's Classic has a **disabled** Delete even when placed;
    - an unused card's Delete opens the confirmation, and cancel leaves the card and the badge;
    - confirm removes the card, drops the badge by one, shows `Organism deleted` **only after**
      the dialog is gone (assert the ordering, per the project-context live-region trap), and
      leaves focus on `+ Create New Organism`;
    - the stale case: mutate the fake battle repo between click and confirm → no delete, and the
      block dialog appears with the fresh name;
    - a delete rejection → the alert after exit and the card still present;
    - the editor origin, end to end in jsdom: Edit → Delete Organism → Confirm → the editor closes,
      the card is gone, and the toast appears after the **editor's** exit;
    - the editor origin, blocked: the block dialog over the editor, OK → the editor is still open
      and focus is on the editor's Delete button;
    - a second delete later in the session re-announces (the region's child re-mounts).

- [x] **Task 7: e2e (AC: 1–5, 8).**
  - [x] Replace the 4.21 block's test 1 (`organisms.spec.ts:4049`) with "Delete is present on every
        card; Conway's Classic's is disabled, with its message".
  - [x] Add a `safe delete & protected default (Story 4.22)` describe that reuses
        `seedWorkspace` / `seedExtraOrganisms` / `seedFillerBattlesFor` and **the 4.21 extras
        helper**. Do not add a payload builder. It covers:
    - the unused organism: Delete → confirm → the card is gone, the badge is decremented, the
      toast is visible, and a **reload** confirms the organism is gone from storage;
    - cancel and Escape change nothing (after the 300 ms settle);
    - the editor path: Edit → Delete Organism → Confirm → back on the Library with the toast;
    - the protected card: Delete is disabled and the message is visible;
    - console-error capture on every test;
    - axe (with the 300 ms settle, then `new AxeBuilder({ page }).analyze()`) with:
      - the confirm dialog open;
      - the toast shown;
      - the editor Delete hovered (the `color-contrast` check);
      - the confirm stacked over the editor.
  - [x] Remember that WebKit does not focus a clicked `<button>`. Assert focus only after keyboard
        paths or an explicit restore (4.21's previous-story note).

- [x] **Task 8: remove the 4.21 transitional references (AC: 1).**
  - [x] `grep -rn "4.22\|Story 4.22" apps/web packages` and update every comment that still
        describes Delete as blocked-only, or says "until Story 4.22". Examples:
        `OrganismCard.tsx:14-16, :141-142, :210-212, :259-266, :275-276` and
        `OrganismLibrary.tsx:653-655`.
  - [x] `organismDeleteGuard.ts`'s consumer list is still accurate, so leave the domain file alone
        unless a comment is now false.

- [x] **Task 9: `deferred-work.md` (AC: all).**
  - [x] Annotate the 4.21 section in place, without deleting anything:
    - the FD2 transitional entry → **resolved by 4.22**;
    - the FD1 editor-surface entry → **built in 4.22**;
    - the FD12 re-verify entry → **built in 4.22**.
  - [x] Add this story's section:
    - the editor-origin delete-close must bypass 4.23's unsaved-changes guard (→ **Story 4.23**);
    - 4.24's battle-origin editor decides whether to pass `onRequestDelete`, and if it does, the
      `openBattle` verdict argument and the current-grid remedy copy land together (→ **Story
      4.24**, joining 4.21's FD11 entry);
    - FD11's post-create-save Delete absence and the in-session rename name staleness;
    - FD13's re-pointing of the two card entries (the rules sentence and the stat-cell semantics,
      `:743-757` and `:775-790`) to the next story that touches card **content**. This story
      touches only the action row.
  - [x] Surface FD13 as a question below. Do not resolve it.

- [x] **Task 10: gates (AC: 10).**
  - [x] `npm run ci:dev` from the worktree root: redirect it to a file and read `$?`. Never pipe
        it, and never run the four-browser `npm run ci`.
  - [x] Bundle: report `/organisms`'s figure against its 306101 B baseline. If it grew, refresh the
        baseline through the tool, commit the JSON diff with the story, and record the old and new
        numbers.
  - [x] Record every command and its real output summary in the Dev Agent Record.

### Review Findings

Reviewed on **Fable** against an **Opus** implementation (2026-09-25), via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) plus the reviewer's own real-browser
probe of the one path no test covered.

- [x] [Review][Decision] **Editor-origin Confirm on a record already deleted in another tab leaves
  the editor open on a ghost** — AC6's "no longer exists" case says only "the write is skipped and
  the Library reloads; no toast". For `origin: 'editor'` the code does exactly that
  (`useOrganismDelete.ts`, the `freshRecord === undefined` branch): no close, no toast, no alert,
  the editor stays open on a record that no longer exists, and its next Save would re-create it
  through `organisms.save` (an upsert). Hook and Library tests cover the card origin only. Options:
  **(a)** treat it as deleted for the editor origin — close the editor through the same FD9
  sequence and reload, with no toast (this action deleted nothing) — one branch, no new copy;
  **(b)** keep the editor open and publish an in-editor `role="alert"` with a new sentence ("This
  organism no longer exists…"), which is a second unspecced copy line beside FD12's; **(c)** leave
  as built and record it as an FD11-class residual (cross-tab deletion mid-edit). Left for Sidiar;
  nothing changed here.
  **Resolved 2026-09-25 (Sidiar): (b)**: keep the editor open and publish an in-editor alert.
- [x] [Review][Patch] **Build the (b) resolution above** [`apps/web/lib/organisms/useOrganismDelete.ts`]:
  for `origin: 'editor'`, when Confirm's re-read finds the record gone, skip the write (as now),
  reload the Library, do not close the editor, and publish an in-editor `role="alert"` through the
  same `SaveErrorLine` surface FD12's failure uses. Copy (new, beside `ORGANISM_DELETE_FAILED` in
  `saveOutcome.ts`): `This organism no longer exists. It may have been deleted in another tab.`
  The card origin is unchanged. Add hook and Library tests for the editor origin of this branch.
- [x] [Review][Patch] **The editor is handed back DEAD after Cancel/Escape/OK on a dialog stacked
  over it (first delete of a page session)** [`apps/web/lib/useInertBackground.ts`] — measured in
  Chromium: after Cancel on the editor-origin confirmation, the editor's portal (and the page under
  it) stayed `inert`; nothing on screen could be clicked or focused until a reload. FD9's reasoning
  about "two restore maps unwinding in call order" missed that both instances hold a
  `MutationObserver`: the nested modal's mount marks the editor's own portal `aria-hidden`, the
  editor's observer (registered first, notified first) inerts that portal, and the stacked instance
  then records `inert: true` as the portal's "prior" and restores it on cleanup. The chunk-cached
  second open never hits it (the stacked instance's own effect sweep runs before the observers),
  which is why no jsdom test and no e2e caught it — every e2e is a fresh page, but none cancelled
  from the editor. Fix in the shared hook: ONE module-level claim registry (`prior` recorded once
  per element by the first instance to touch it, later instances add a hold), and a cleanup that
  releases an element when no instance holds it OR when MUI has already lifted its `aria-hidden`
  (the nested case) — an element still hidden by another instance's modal stays inert. Pinned
  three ways: `useInertBackground.test.tsx` ("a stacked instance releases…"), the Library's
  "Escape on the stacked confirmation" test now asserts the editor's portal is not inert and the
  root still is, and a new Chromium e2e ("Cancel on the stacked confirmation hands the editor back
  live"). Both jsdom pins go red on the original hook. The sequential gate → editor handoff
  (editor-hook test (e), "inert never dips") is unchanged: release still happens only at cleanup.
- [x] [Review][Patch] **A Confirm landing during a Cancel's exit fade wrote after the cancel and
  left the outcome queued for the next window** [`apps/web/lib/organisms/useOrganismDelete.ts`,
  `handleConfirm`] — the buttons stay enabled through the fade (`pending` is false), so the latch
  did not stop it; the fade's exit handler released the window before the write settled, and
  `outcomeRef` then belonged to whichever window opened next (a Cancel there would have published
  "Organism deleted"). Guarded on `!dialogOpen`; hook test added.
- [x] [Review][Patch] **The editor's Delete was reachable during the editor's own exit fade**
  [`apps/web/components/organisms/OrganismLibrary.tsx`, `canOpenDelete`] — a click within the
  ~195 ms after Back/Escape stacked a window over an editor about to unmount (the FD9 unwind in the
  wrong order, and a toast held for an editor exit that had already happened). The editor origin
  now also requires `modalProps.open`.
- [x] [Review][Patch] **Stale held toast** [`useOrganismDelete.ts`, `requestDelete`] —
  `heldToastRef` was never cleared at the next request, so a caller passing no `onEditorDeleted`
  would have published "Organism deleted" on a later, unrelated editor exit. Cleared with the rest.
- [x] [Review][Patch] **The FD5 handoff kept the click-time organism name** [`useOrganismDelete.ts`,
  `ConfirmOutcome.handoff`] — the hook and Library tests were titled "with the FRESH name" but only
  asserted the battle name; an organism renamed in another tab was blocked under its old name. The
  handoff now carries `toDisplayOrganism(freshRecord).name`; the hook test renames Glider between
  click and Confirm and asserts it.
- [x] [Review][Patch] **`ORGANISM_DELETE_FAILED` grew the battle routes** [`apps/web/lib/saveFailureMessage.ts`
  → `apps/web/lib/organisms/saveOutcome.ts`] — an organisms-only sentence in a module `/battle` and
  `/battle/new` import (+45/+46 B for code they never run, per the Debug Log). Moved beside
  `ORGANISM_DELETED`, which is where it pairs anyway; baseline refreshed through the tool (numbers
  in the Change Log — the battle routes do not net-shrink, because the shared-hook fix above grows
  every route by a few dozen bytes).
- [x] [Review][Patch] **`onEditorExited` depended on the whole `modalProps` object**
  [`OrganismLibrary.tsx`] — re-created every render while reading one field; `onExited` is now
  destructured, as `onClose` already was.
- [x] [Review][Patch] **Refusal coverage was one-sided** [`useOrganismDelete.test.tsx`] — the
  editor-origin refusal had no publish-after-exit ordering assertion (the one publish path without
  one; testing standards); only `battles.list()` rejecting was pinned; a delete rejected AFTER a
  successful fresh read was not asserted to still `reload()`. All three added (the read-rejection
  test is now an `it.each` over both repositories).
- [x] [Review][Patch] **AC8's "each dialog stacked over it" was real-browser-scanned for the
  confirmation only** [`apps/web/e2e/organisms.spec.ts`] — the block dialog over the editor was
  jsdom-only, and 4.21's own scroll-region violation was one jsdom could not see. Added.
- [x] [Review][Patch] **"Verbatim" was not literal** [`apps/web/lib/organisms/deleteBlockCopy.ts`]
  — `prd.md:136` has no quotation marks around `[Organism Name]` and `:137` no trailing period; the
  code follows the story and the `<DeleteBattleDialog>` precedent, so only the comment moved.
- [x] [Review][Patch] **`deferred-work.md`'s 4.21 section still sent readers to "Story 4.22 only"
  for the two card-content entries** [`deferred-work.md:3071`] — Task 9 annotated three 4.21
  entries and missed this fourth; annotated in place.
- [x] [Review][Patch] **Nits** [`OrganismEditorModal.tsx`] — `data-editor-delete-error` was a bare
  boolean (renders `="true"`; every sibling hook is `=""`), and the FD10 comment broke mid-phrase.
- [x] [Review][Defer] **Editor-origin focus restore relies on the reload resolving inside the
  editor's ~195 ms fade** [`useOrganismDelete.ts`, `handleExited`] — deferred, already recorded in
  this story's `deferred-work.md` section ("reloads the Library at the confirmation's exit").
- [x] [Review][Defer] **A `dynamic()` chunk that fails to load leaves the window authority set and
  every guard refusing** [`OrganismLibrary.tsx`] — deferred, pre-existing: Story 4.21's recorded
  "no `loading`/error fallback on any `dynamic()` boundary" class, to be fixed once for all.
- [x] [Review][Defer] **The in-editor delete alert outlives a later successful Save and can stand
  beside `saveError`** [`OrganismEditorModal.tsx`] — deferred, already recorded for the 4.23
  editor-state pass.

#### Second pass (2026-09-25, Fable, on the (b) build `bd21831`)

Reviewed on **Fable** against the **Opus** follow-up that built Sidiar's decision (b), via the same
three layers. The build conforms to the decision and to every FD it touches (FD7 same-commit
publish, FD8 restore intent kept, FD9 untouched, FD12 surface reused, card origin unchanged). One
decision, four patches, one dismissed.

- [x] [Review][Decision] **After the GONE alert, the editor's Delete stays enabled, and a repeat
  Delete → Cancel dismisses the alert** [`useOrganismDelete.ts:217-232`, `OrganismEditorModal.tsx:886-896`]
  — the (b) build leaves focus on the editor's Delete and nothing disables it. A second click
  computes the click-time verdict against the RELOADED `usage`/`ruleIndex` (the id is absent from
  both, so `allowed`), reopens "Delete Glider?" for a record the editor just said is gone, and
  `requestDelete` clears `editorDeleteError` at its start. Confirm → `gone` → the same alert again
  (coherent); **Cancel → `outcome === null` publishes nothing**, so the editor is back on the ghost
  with no alert, and its next Save re-creates the record with no signal on screen. The re-create
  itself is accepted (decision (b)); this is about the one signal (b) relies on being dismissible.
  Options: **(a)** disable the editor's Delete while `deleteError === ORGANISM_DELETE_GONE` (one
  prop on `DeleteOrganismButton`, `disabled={isSaving || deleteProtected || …}`, plus a test) —
  the button's only possible outcome is the alert already on screen; **(b)** keep the GONE alert
  across a cancelled repeat (skip the `requestDelete` clear when the pending message is the GONE
  sentence and the new window is a confirm); **(c)** leave as built and record it as an FD11-class
  residual under the 4.23 editor-state pass, beside the alert-lifecycle entry. Left for Sidiar;
  nothing changed here.
  **Resolved 2026-09-25 (Sidiar): (a)**: disable the editor's Delete while the GONE alert shows.
- [x] [Review][Patch] **Build the (a) resolution above** [`apps/web/components/organisms/editor/OrganismEditorModal.tsx`]:
  the editor's `DeleteOrganismButton` is `disabled` while `deleteError === ORGANISM_DELETE_GONE`,
  alongside the existing `isSaving` and `deleteProtected` conditions. Add a test that the button is
  disabled once the GONE alert is published. Keep focus somewhere valid: the (b) build restores
  focus to that button, and a disabled button cannot hold focus.
- [x] [Review][Patch] **The alert-lifecycle ledger's rationale is false for the GONE copy**
  [`deferred-work.md:3124-3127`, `:3168-3170`] — the entry says "Harmless (the sentence stays
  true)": true for `ORGANISM_DELETE_FAILED`, false for `ORGANISM_DELETE_GONE`, which the accepted
  re-creating Save falsifies while the alert stays mounted beside "Organism saved"
  (`data-save-status`). The reverse order is the same class: a stale "Organism saved" / `saveError`
  line stays mounted beside a freshly published GONE alert (`OrganismEditorModal.tsx:651-652`
  clears them only at the next Save; `requestDelete` clears only the hook's own cells). Both stay
  deferred to the 4.23 editor-state pass; the ledger just has to say so accurately.
- [x] [Review][Patch] **Consumer-side docs still describe `deleteError` as a refusal only**
  [`OrganismEditorModal.tsx:159`, `:854`; `OrganismLibrary.tsx:638`] — the hook's
  `editorDeleteError` doc was updated for (b); the editor's prop doc, its JSX comment and the
  Library's card-alert comment were not, and now under-describe the channel.
- [x] [Review][Patch] **AC6's vanished-record case has no editor-origin carve-out**
  [`4-22-safe-delete-protected-default.md:111-113`] — the (b) behaviour lives only in Review
  Findings and the Completion Notes; 4.23 inherits this editor and reads the AC.
- [x] [Review][Patch] **The new Library test re-implements `watchFirstAppearance` inline**
  [`OrganismLibrary.test.tsx:2073-2079`] — the helper hard-codes `[role="dialog"]`, which the
  editor origin cannot use (the editor is a dialog and stays), so the test duplicated the observer
  with `confirmDialog()`. Give the helper a dialog predicate parameter and reuse it.
- Dismissed (1): the Edge Case Hunter's "the ordering observer is blind to an alert inserted while
  the editor is still inert" — its guard (`editor.closest(...).inert` at first appearance) would
  false-fail on correct code: `useInertBackground` lifts `inert` from a plain `useEffect` (by
  design, after MUI's focus-trap move) on a transition-lane update, so at the observer's microtask
  the editor is still inert in the same task that lifts it. The observer pins what the file's
  established idiom pins (no publish from the writer during the fade), nothing more.

#### Third pass (2026-09-25, Fable, on the (a) build `d5b3c92`, synced with main as `3abe1e3`)

Reviewed on **Fable** against the **Opus** follow-up that built Sidiar's second-pass decision (a),
via the same three layers. The build conforms to the [Patch] wording (disabled alongside `isSaving`
and `deleteProtected`; `ORGANISM_DELETE_FAILED` stays enabled; the disable and the `editor-save`
focus move land in one commit, so the effect never targets the disabled button). #82's content was
not re-reviewed. One decision, three patches, three dismissed.

- [x] [Review][Decision] **After the accepted re-creating Save, the editor's Delete stays disabled
  for the rest of the session** [`useOrganismDelete.ts:238,387`, `OrganismEditorModal.tsx:655-656,:901`]
  — `editorDeleteError` is cleared only at the next `requestDelete` and at the editor's exit;
  `saveOrganism` clears only its own `saveError` / `saveOutcome`. Before (a) that was the
  second-pass ledger's "stale sentence" item (deferred to 4.23), because an enabled Delete's next
  request cleared it. With (a) the button that would clear it is the one disabled, the card origin
  is barred while the editor is mounted (`canOpen`), so once the user Saves — the path (b) exists
  for — the record is real and deletable again while the editor shows a disabled Delete under a
  "no longer exists" alert until Back/Escape. Options: **(a)** clear the GONE alert (and so the
  disable) when the editor's Save succeeds, now — a small clear-on-saved channel from the Library
  (the editor's `onSaved` is deferred by `useOrganismEditorModal` until exit, so it needs its own
  callback), which is a slice of the "one owner, cleared together on Save" item the second pass
  sent to 4.23; **(b)** leave it with the 4.23 editor-state pass as already deferred — the ledger
  (amended by this pass) says the disabled Delete rides on the same cell, and until then the user
  closes the editor and deletes from the card; **(c)** editor-local, no new channel: disable on
  `deleteError === ORGANISM_DELETE_GONE && saveOutcome === null`, so a successful Save re-enables
  Delete and its next request clears the alert (the alert itself stays until then, as deferred).
  Left for Sidiar; nothing changed here.
  **Resolved 2026-09-25 (Sidiar): (b)**: left to the 4.23 editor-state pass, as already deferred
  in `deferred-work.md`. No code change.
- [x] [Review][Patch] **The GONE-disabled Delete carries no accessible reason** [`OrganismEditorModal.tsx:863-866,:902`]
  — FD6: "a screen reader's browse mode reads the reason with the control … The same pattern
  applies to the editor's Delete", and AC8 "The disabled Delete's `aria-describedby` target exists
  in the DOM". The protected path does it (`protectedNoteId`); the new disabled state does not —
  the GONE `SaveErrorLine` has no `id`, and `aria-describedby` is `undefined`. The alert is
  announced once at publish, so not a hard failure, but a user who meets the dimmed button later
  hears no reason. One `useId()` on the line, referenced while the GONE sentence shows; assertion
  added to the editor's decision-(a) test. The JSX comment's "a Cancel would have dismissed it"
  also names the confirmation's Cancel now (the Blind Hunter read it as the editor's).
- [x] [Review][Patch] **Story text is stale against the fourth restore intent and the (a)
  behaviour** [`4-22-…md:113-115`, `:216-217`, `:252-256`, `:939`] — Task 2 still lists three
  restore intents and three focus targets, the Implementation Plan says `card` / `editor` /
  `create`, and AC6's editor-origin carve-out names the alert but not the disabled Delete or the
  focus-to-Save; 4.23 reads the AC (the second pass's own argument for putting (b) there).
- [x] [Review][Patch] **The ledger still describes an escape (a) removed** [`deferred-work.md:3177-3187`,
  `:3228-3233`] — "cleared at the start of the next delete request" is unreachable from the
  editor while GONE shows, and neither entry names the disabled Delete riding on the same cell.
  Amended in place; the decision above is cross-referenced.
- Dismissed (3): the Blind Hunter's "behaviour keyed on sentence identity" (both sides import the
  one exported constant; a discriminated prop is a refactor of a settled contract, not a bug);
  "focus lands on Save, the write" (the Save-vs-Back target is already with the owner, flagged
  outside this review; the one behavioural angle worth his knowing — a held Enter from the
  confirmation auto-repeats into Save after the ~195 ms fade — is reported to him, not raised
  here); "no hook-level focus test for `editor-save`" (no restore intent has one; the Library test
  pins focus on Save end to end, and the Chromium e2e pins the same effect for the `editor` intent).

## Dev Notes

### Forced decisions

- **FD1: the domain is done, so consume it.** `organismDeleteVerdict` already decides `protected` /
  `blocked` / `allowed`, in that order (4.21 FD3). This story calls it in three places:
  - the card map, which decides what each card's Delete does;
  - the controller at click time and again at confirm time;
  - the editor, for the disabled state only.

  All three call the **same function** over indexes built by the same `@gol/domain` builders.
  ❌ Writing `usage.get(id)?.length > 0 || ruleIndex.get(id)?.length > 0` anywhere is the second
  implementation 4.21 FD3 forbids. No file under `packages/*` changes, so no barrel collision with
  lane 5.

- **FD2: every card renders Delete (Sidiar, 4.21 review decision FD2 (a)).** The 4.21 transitional
  rule ("render only for `blocked`") existed only because an `allowed`/`protected` Delete would have
  been a dead affordance before this story (NFR-4.1). Both now do something true: confirm, or
  disabled with a reason. The card keeps its "renders iff `onRequestDelete` is present" contract,
  and the Library simply passes the prop everywhere. A component that never passes it keeps
  rendering no Delete, which leaves 4.24's battle roster free to decide for itself.

- **FD3: `system` comes from the verdict.** The card's `system` prop (SYSTEM tag, accent border,
  disabled Delete) is today `organism.id === CONWAYS_CLASSIC_ID` in the Library. Switch it to
  `verdict.kind === 'protected'`, which is the same value, so M9 has one source in `apps/web`.
  `CONWAYS_CLASSIC_ID` may then drop out of the Library's imports. Check it has no other use there
  before removing it.

- **FD4: re-verify immediately before the write (4.21 FD12, recorded in `deferred-work.md:3050`).**
  The click-time verdict comes from the Library's settled `resource.data`. That snapshot is
  refreshed only on reload. A battle saved in **another tab** since the Library loaded would be
  invisible to it, and deleting on that stale verdict creates exactly the dangling reference
  FR-1.4's integrity guarantee says is unreachable.
  - So Confirm re-reads **both** lists through the injected repositories, builds fresh indexes and
    re-runs the verdict. It writes only on `allowed`.
  - The two reads are one `Promise.all`, like the Library's own resource (4.17 FD2: `'ready'` means
    both lists).
  - No `.catch(() => [])` on either read, because a swallowed rejection reads as "unused" and
    deletes.
  - The click-time verdict stays synchronous from settled data (unchanged from 4.21). Only the
    **write** needs fresh data. A stale block message costs a wrong sentence, while a stale delete
    costs integrity.

- **FD5: stale-to-blocked is a handoff inside one window.** When the fresh verdict at Confirm is
  `blocked`, the user asked to delete something that now cannot be deleted. They need 4.21's
  explanation, and they should not have to click again to get it.
  - Stash the fresh block payload, close the confirmation, and in its exit handler swap the window
    to the `blocked` variant and reopen. This is `useOrganismEditorModal.handleGateExited`'s
    proceed-ref shape.
  - The window cell never goes `null` across the handoff, so `useInertBackground` never releases
    and the focus effect never fires in between.
  - Also `reload()` so the cards behind the dialog match the verdict they now show.
  - Once the block dialog is dismissed, focus returns per the original origin's restore intent.

- **FD6: the protected explanation is visible text, referenced by `aria-describedby`.** A natively
  `disabled` button is out of the tab order, so a tooltip or a `title` never reaches a keyboard or
  touch user. The mockup's `title` on hover is the demo's shortcut, not a spec. The PRD asks for "an
  explanatory message" and M9 says "its Delete affordance is disabled". Two shapes were considered:
  - **Chosen:** keep native `disabled` (the mockup's `:442` and M9's wording), and render the
    message as a short visible line on the protected card. The button's `aria-describedby` points
    at that line, so a screen reader's browse mode reads the reason with the control.
  - **Not taken:** `aria-disabled="true"` with a focusable button that explains on activation.
    It keeps a dead stop in the tab order on the one card nobody can delete, and it needs a third
    dialog variant for a message that fits in one line.

  The same pattern applies to the editor's Delete for Conway's Classic.

- **FD7: the toast is an in-flow live region on the Library, published after the last window
  exits.** "Toast" in this house is the in-flow status line (`OrganismEditorModal.tsx:273-277`: "Not
  MUI `Snackbar`, no floating layer, no auto-dismiss"). The rules:
  - **Always-mounted region, with the child mounting with the sentence.** 4.9 FD3: a live region has
    to exist before its content changes. `deferred-work.md:2112-2116` recommends this idiom for a
    Library-side save toast.
  - **Published only once the dialog (card origin) or the editor (editor origin) has exited.** The
    publish happens in the same handler that releases the window, so it lands in one commit. The
    project-context live-region trap applies: a node inserted under `useInertBackground` is never
    announced. `queuedCloneErrorRef` plus `onGateExited` is the reference implementation.
  - **The second `role="status"` is real, and it breaks tests.** `e2e/organisms.spec.ts`'s
    `countBadge = page.getByRole('status')` is unscoped at `:2854` and `:3160` (plus raw uses at
    `:210, :235, :242`), and so are 12 badge queries in `OrganismLibrary.test.tsx`. A second status
    node makes every one of them a strict-mode failure. The Library's own comment (`:620-632`)
    records why `[data-clone-error]` chose `role="alert"` to dodge this. That dodge is wrong here,
    because success is not an alert. Retarget the badge selectors to a `data-organism-count`
    attribute instead. This is a mechanical change with no assertion changes.

- **FD8: focus after close.**
  - **Cancel, and dismissing a block:** back to the Delete that opened the dialog. On a card that is
    `[data-delete-organism-id="…"]`; in the editor it is `[data-editor-delete-organism]`.
  - **After a successful delete, card origin:** the card and its button are gone. Focus goes to
    `[data-create-organism]`, the fallback `useOrganismEditorModal` already uses when a card is
    gone, rather than the heading the Gallery uses. The Library heading has no `tabIndex`, and the
    create button is the next meaningful control.
  - **After a successful delete, editor origin:** the editor hook's own restore intent is
    `{ kind: 'edit', organismId }`. Its lookup of `[data-edit-organism-id]` returns `null` because
    the card is gone, and it falls back to the create button by itself. Do not add a second focus
    move on that path.
  - Everything goes through DOM lookup with `CSS.escape`, after exit, with the
    `useDeleteBattleDialog` `focusIsLoose` check. WebKit does not focus a clicked `<button>`, so a
    captured element is never used.

- **FD9: a dialog stacked over the editor, and two inert hooks.** The editor origin is the first
  time a Library-owned dialog opens **over** the mounted editor. It is also the pattern Story 4.23's
  unsaved-changes dialog will follow.
  - `useOrganismEditorModal`'s head comment warns that two `useInertBackground` calls hold two
    restore maps that unwind in call order. That is safe **only if** the stacked dialog's window
    closes (and its cleanup restores the editor's portal and re-records the page root as "prior:
    inert") **before** the editor's own window closes.
  - So on a successful editor-origin delete, the sequence is strictly: confirmation `onExited` →
    **then** `modalProps.onClose()` → editor fade → editor `onExited` → reload and toast. Never
    close both in one handler.
  - 4.21's comment "never folded into one union — because the two windows never overlap" becomes
    false for the editor origin. Rewrite it to say they **nest**, and why nesting is safe under this
    ordering.
  - Pin the ordering with a test: after the whole sequence, the page root is not `inert` and has no
    `aria-hidden`.

- **FD10: the editor button's look.** `organism-editor-design.md:290-292` specifies "Warning color
  (red), outlined style, bottom of Column 1". The shipped editor mockup has no such button (4.21
  FD1), so there is no pixel reference. Reuse the card `ActionButton`'s house substitutions:
  `--gol-border-control` border, `--gol-danger` text, `--gol-danger` border on hover, no
  `transition`, a real `:focus-visible` ring, and the same disabled trio.
  - Size it as a full-width block at the bottom of the column, with a top margin that separates it
    from the aging toggle.
  - It lives in the editor's own styled components. Do not import `OrganismCard`'s private
    `ActionButton`: the two surfaces must not couple through a card-private component. If the dev
    finds the duplication large, lifting a shared `dangerOutlineButton` style object into
    `components/organisms/` is acceptable. Name it in the Dev Agent Record.

- **FD11: editor Delete scope.**
  - It renders only when `organism !== null`, that is, in an edit session.
  - The UX doc says "hidden when creating new organism". A create session that has saved once has a
    stored record (`saveStamp`), but the editor's `organism` prop is still `null`, and Delete stays
    hidden. Making it appear mid-session is a mode change the design doc does not describe. Record
    this; do not build it.
  - The name the confirmation shows is the record the hook opened the editor with. After an
    in-session rename-and-save it is the **old** name, until the Library reloads on close. The write
    itself is by id and correct, and the fresh read at Confirm could supply the current name if a
    reviewer wants it. Record it as a residual rather than making the request async.

- **FD12: failure copy and where it shows.**
  - Copy: `This organism could not be deleted. Nothing was changed — try again.` It follows
    `saveFailureMessage`'s discipline (state that existing data is untouched, name no affordance
    that does not exist). A refused delete leaves the collection byte-identical, because
    `writeDataKey` serialises before `setItem`, the AR-14 shape. Put it in `deleteBlockCopy.ts`
    (lazy), or beside `saveFailureMessage` if it has to be eager for the card-origin alert. Choose by
    import graph and note the choice.
  - Card origin: a `role="alert"` on the Library, published on the dialog's exit.
  - Editor origin: the editor stays open (nothing was deleted), so the Library alert would sit under
    the inert editor and never be heard. Surface it **inside the editor** instead. Pass it back as an
    optional `deleteError?: string | null` prop the editor renders in its existing `SaveErrorLine`
    idiom (`role="alert"`, conditionally mounted), published on the confirmation's exit.
  - ⚠️ A new copy sentence with no spec behind it. Surfaced as a question below, with this default
    written in.

- **FD13: the two card-content deferrals are not this story's.** `deferred-work.md:743-757` (the
  natural-language rules sentence) and `:775-790` (the stat-cell `<dl>` semantics) were re-pointed to
  4.22 on the assumption that it "renders Delete on every card and is the next story to touch
  `<OrganismCard>`'s content". 4.22 touches the **action row** and adds one note line. It does not
  reshape the stat block or the rules line, and neither item is in any 4.22 AC. No later Epic 4 story
  touches the card (4.23–4.26 are editor- and battle-side). Re-point both to "the next card-content
  change, or the Epic 4 UX reconciliation touch". ⚠️ Surfaced as a question below.

- **FD14: bundle.** The confirm dialog is a fourth `dynamic()` boundary and its copy is lazy. The
  eager delta is small:
  - the hook, which needs `buildUsageIndex` / `buildRuleReferenceIndex` (already eager);
  - the card's disabled branch and note;
  - the Library's region.

  The gate is growth against `scripts/bundle-baselines.json` (`/organisms` 306101 B), with an 8 KB
  allowance. Refresh the baseline through the tool if the route grew. Never hand-edit it, and never
  trim unrelated code for headroom.

### What already exists (reuse, do not rebuild)

| Need | Use | Where |
|---|---|---|
| Delete verdict (protected → blocked → allowed) | `organismDeleteVerdict(id, usage, ruleIndex, openBattle?)` | `packages/domain/src/organismDeleteGuard.ts` |
| Indexes | `buildUsageIndex(summaries)`, `buildRuleReferenceIndex(organisms)` | `@gol/domain` |
| Block dialog + its copy | `OrganismDeleteBlockedDialog`, `deleteBlockCopy.ts` | `apps/web/components/organisms/`, `apps/web/lib/organisms/` |
| Confirm-dialog pattern (pending, latch, focus-after-exit) | `DeleteBattleDialog` + `useDeleteBattleDialog` | `apps/web/components/gallery/DeleteBattleDialog.tsx` |
| Name resolvers | `usageBattleNames`, `referencingOrganismNames`, `toDisplayOrganism` | `apps/web/lib/organisms/usageLabels.ts`, `apps/web/lib/displayOrganisms.ts` |
| Inert background | `useInertBackground(active)` | `apps/web/lib/useInertBackground.ts` |
| Proceed-ref handoff | `handleGateExited` | `apps/web/lib/organisms/useOrganismEditorModal.ts` |
| Publish-after-exit | `queuedCloneErrorRef` + `onGateExited` | `OrganismLibrary.tsx:314-344, :426-437` |
| In-flow status line idiom | `role="status"` wrapper + `SaveOutcomeLine` | `OrganismEditorModal.tsx:273-287, :426-434` |
| In-editor alert idiom | `SaveErrorLine` | `OrganismEditorModal.tsx:260-271, :435-444` |
| Danger token | `--gol-danger` | `apps/web/app/themes.css` |
| Fakes | in-memory repos | `@gol/test-utils` |

### Current state of the files this story modifies

- **`OrganismCard.tsx`**: Edit, Clone, and a Delete that renders iff `onRequestDelete` is passed
  (4.21). `[data-danger]` is the red variant, and `&:disabled` / `&:disabled:hover` already exist.
  `system` drives the tag and the accent border. **Preserve:** the no-`transition` rule, every
  `data-*` hook, the `SystemTag` real-text rule and the `aria-labelledby` article.
- **`OrganismLibrary.tsx`**: one resource over both lists, with the memoized `usage` / `ruleIndex`,
  and 4.21's inline delete window. **Preserve:**
  - the one-resource rule;
  - the clone queue and its three publish sites;
  - `refocusCloneRef`;
  - the gate's `onGateExited`;
  - `guardedCreate` / `onRequestEdit`'s delete-window bail;
  - the `editorMounted || gateMounted` bail. It stays for the **card** origin; the editor origin is
    exempt by construction, and that is the only change to it.
- **`OrganismEditorModal.tsx`**: the props, the `isSaving` lock, `handleRequestClose`, the
  `basicInfo` fragment and the footer derivations. **Preserve:** the "the only side effect is
  `organisms.save`" contract. Delete adds **no** repository and **no** write here.
- **`deleteBlockCopy.ts`**: lazy-only (4.21 FD5). It gains strings; nothing is removed.

### Anti-patterns (these compile and pass tests, and are still wrong)

- ❌ `organisms.delete(id)` on the click-time verdict with no fresh read (FD4).
- ❌ `.catch(() => [])` on either re-verify read (FD4).
- ❌ Closing the confirmation and the editor in one handler (FD9).
- ❌ A second unscoped `role="status"` without retargeting the badge selectors (FD7).
- ❌ Publishing `Organism deleted` from the write's `then`, which lands under the inert dialog (FD7).
- ❌ A `title` or tooltip as the only explanation for the disabled Delete (FD6).
- ❌ Passing a repository into `<OrganismEditorModal>` for delete (AR-2/AR-27; FD11's callback prop).
- ❌ Re-deriving "blocked" / "protected" inline instead of calling `organismDeleteVerdict` (FD1).
- ❌ A `useEffect` keyed on window flags to publish the toast. It is a lint error
  (`react-hooks/set-state-in-effect`) and a cascading render (project-context).
- ❌ `transition` on any new button (the mid-fade axe trap), or raw hex (AR-46).
- ❌ Capturing the trigger element for focus restore (FD8; WebKit).

### Project Structure Notes

- New files:
  - `apps/web/lib/organisms/useOrganismDelete.ts` and `.test.tsx`;
  - `apps/web/components/organisms/OrganismDeleteConfirmDialog.tsx` and `.test.tsx`.
  - Non-component files are camelCase, never dotted.
- Modified:
  - `apps/web/components/organisms/OrganismCard.tsx` (plus its test);
  - `apps/web/components/organisms/OrganismLibrary.tsx` (plus its test);
  - `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (plus its test);
  - `apps/web/lib/organisms/deleteBlockCopy.ts` (plus its test);
  - `apps/web/e2e/organisms.spec.ts`;
  - `docs/implementation-artifacts/deferred-work.md`;
  - possibly `scripts/bundle-baselines.json`, tool-written.
- **Untouched:** `packages/*` entirely (no domain, persistence or barrel change), plus
  `OrganismDeleteBlockedDialog.tsx` (reused as is) and `useOrganismEditorModal.ts`. The Library
  composes around the hook's `modalProps`, following the `onGateExited` precedent. If the dev finds
  the hook must change, record why.
- **Lane note:** nothing here is read by any Epic 5 story. 5.10 (Clear All) and 5.8 (import)
  re-seed Conway's Classic through `@gol/persistence`, which this story does not touch. 5.4's
  closure reads `ruleTargetIds`, which is unchanged. No barrel edit, so no `[[sync.rules]]`
  collision.

### Testing standards

- Web: RTL with the in-memory fakes from `@gol/test-utils` (never a hand-rolled fake repo) and axe
  via the existing unit helpers. Lazy dialogs need `findBy…`, never a synchronous `getBy…` after
  the click (4.21 review: the vacuous-guard test).
- Assert **ordering** for every publish-after-exit: at the first moment the toast or alert exists,
  the dialog is already gone (project-context).
- e2e: Chromium locally via `ci:dev`; the four-browser matrix is CI's job. Use the 300 ms settle
  before any "dialog gone / still there" assertion or axe scan, and capture console errors on every
  test.
- No coverage-padding tests. `apps/web` has no coverage gate.

### Previous story intelligence (4.21)

- 4.21 built the verdict, the block dialog, the card's conditional Delete and the inline window.
  Its review added:
  - `deleteWindowRef`, the lazy-chunk window authority, with Create/Edit guarded on it;
  - the clone-error deferral to `handleDeleteExited`;
  - the list scroll regions (FD10, found by a **real-browser** 40-name axe run that jsdom cannot
    reproduce);
  - hover-contrast e2e.

  All of these carry over into the extracted hook.
- 4.21's review found a test passing vacuously because it asserted synchronously against a
  `next/dynamic` dialog. Every "the dialog did / did not open" assertion here needs `findBy` or a
  settle.
- 4.20 / 4.21 trap list: Escape closing the wrong layer. **This is live here:** with a dialog
  stacked over the editor, Escape must close the **top** dialog only. MUI routes Escape to the
  topmost Modal. Pin it with a test that Escape on the stacked confirmation leaves the editor open.
- The owner rules on review decisions one at a time. Keep open design points out of the code and in
  the questions below.

### Git intelligence

The recent `main` history is the 4.21 merge (#80, `5c338f5`) and the bundle growth ratchet (#81,
`0879001`, `scripts/bundle-baselines.json` plus `bundle:baseline`). 4.21's commits
(`17c95f6` "apply code review fixes", `246a94d` "record Sidiar's review decisions") are the last
touch to `OrganismLibrary.tsx` / `OrganismCard.tsx` / `organisms.spec.ts`. Nothing in lane 5 has
touched `components/organisms/**`.

### References

- `docs/planning-artifacts/epics.md`:
  - `:1252-1262` has Story 4.22's ACs.
  - `:1240-1250` has 4.21, and `:1264-1275` has 4.23 (the editor dirty scope, which inherits FD9's
    stacked-dialog pattern).
  - `:239-240` has UX-DR14 (the "Organism deleted" toast) and UX-DR15 (the safe-delete confirmation
    and the Conway's Classic disabled state).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md`:
  - `:129-139` has FR-1.4: the confirmation copy at `:136` and the protected message at `:137`;
  - `:141-146` has FR-1.5.
- `docs/planning-artifacts/architecture.md:353` has M7 and `:355` has M9.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/`:
  - `organism-editor-design.md:284-300, :573-583` has the editor Delete and the delete flow;
  - `ux-design-complete.md:686-699` has the exit points;
  - `clinical-lab-theme/organism-library.html:334-349, :442, :648-675` has the card Delete.
- `docs/implementation-artifacts/4-21-delete-integrity-blocks.md` has FD1–FD12 and both review
  decisions.
- `docs/implementation-artifacts/deferred-work.md:3024-3079` has 4.21's section, and
  `:2006-2021, :2103-2116` has the toast idioms.
- `docs/project-context.md` covers the live-region trap, referential-integrity-is-core, the
  repository seam, the bundle growth gate, `ci:dev`, and pipe-swallowed exit codes.

### Questions for Sidiar (saved for the end; defaults are written into the story)

1. **FD13**: the two card-content deferrals (the rules sentence and the stat-cell semantics) were
   pointed at 4.22, but no 4.22 AC covers them. The default re-points them to the next card-content
   change or the Epic 4 UX touch. Should either be built here instead?
2. **FD12**: the delete-failure sentence
   `This organism could not be deleted. Nothing was changed — try again.` has no spec source. Is it
   acceptable as written?

**Answered 2026-09-25 (Sidiar):** FD13: the default stands; both items move to the next story
that changes card content. FD12: the sentence is accepted as written.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (1M context) — `claude-opus-5-5[1m]`

### Implementation Plan

- **Controller** `lib/organisms/useOrganismDelete.ts`: one window cell (`confirm` | `blocked`,
  held through the fade), `dialogOpen`, `pending` + a synchronous latch ref, the window authority
  ref (4.21's `deleteWindowRef`), a restore-intent ref (`card` / `editor` / `create`, and since
  the second-pass decision (a) `editor-save`), a queued
  Confirm outcome ref, and a held-toast ref for the editor origin. `useInertBackground` is called
  above the focus effect (order load-bearing). Click-time verdict from the Library's settled data;
  Confirm re-reads both lists in one `Promise.all` (no `.catch`), rebuilds both indexes, re-runs
  `organismDeleteVerdict`, and writes only on `allowed`. ONE exit handler for both dialogs: the FD5
  handoff (swap to `blocked`, reopen, reload — the window never goes null) or release + publish
  (toast / failure / reload / queued clone failure / editor close) in one commit.
- **Copy**: the confirm strings in the lazy `deleteBlockCopy.ts`; `ORGANISM_DELETED` beside
  `ORGANISM_SAVED` in `saveOutcome.ts`, and `ORGANISM_DELETE_FAILED` beside `saveFailureMessage`
  (FD12's eager option — the hook, which publishes both, is in the first load); the protected
  message `PROTECTED_DELETE_MESSAGE` in the already-eager `usageLabels.ts`, so the eager card and
  the lazy editor share it without coupling to each other or pulling lazy copy into the first load.
- **FD10**: the editor's `DeleteOrganismButton` is its own styled component (no shared style
  object lifted — the duplication is one small object). No hover background fill: `--gol-danger` on
  `--gol-bg-hover` measured 4.48:1 in the e2e hover scan; the border-only hover passes.

### Debug Log References

- `npx vitest run` (apps/web) after Tasks 2–6: 131 files / 2209 tests passed.
- First e2e run (Chromium, organisms spec): 21 failures from one cause — the protected note
  ("Conway's Classic is a built-in organism…") is a second substring match for the spec's 49
  `getByText("Conway's Classic")` hydration checks. Retargeted mechanically to `exact: true`. Also:
  the editor Delete's hover fill failed `color-contrast` (4.48:1) — fill removed; and the "reload
  confirms" check re-seeded through `addInitScript` — replaced with a direct storage read.
- Second e2e run hit `ERR_CONNECTION_REFUSED` and a foreign build mid-run (port 4173 is shared with
  the other lane's worktree through `reuseExistingServer`); a clean re-run: 142/142 passed.
- First `npm run ci:dev`: exit 1 — `has no axe violations with each dialog stacked over the editor`
  timed out (5 s) under coverage load. Split into two tests, one per stacked dialog.
- Second `npm run ci:dev` (redirected to a file, `$?` read directly): **exit 0**. typecheck ✓; lint
  0 errors, 1 pre-existing warning (`BattleGallery.tsx:248`, not touched here); format ✓;
  spec:check ✓ (274 cited ids resolve); boundary ✓; coverage — web 131 files / 2210 tests, domain
  212, simulation 408, persistence 103, test-utils 95, all passed; build ✓; bundle ✓ (`/organisms`
  300.2 KB against the 298.9 KB baseline, +1.3 KB, inside the 8 KB allowance); bench ✓ (frame
  9.125 ms / 16.667 ms); e2e Chromium 280 passed.
- Bundle baseline refreshed through the tool (`npm run build:standalone` → `npm run
  bundle:baseline`): `/organisms` 306101 → **307423** B; `/battle` 316924 → 316969 B and
  `/battle/new` 316721 → 316767 B (+45/+46 B — the battle editor imports `saveFailureMessage.ts`,
  which gained `ORGANISM_DELETE_FAILED`); `/` and `/settings` unchanged. `npm run bundle:check`
  against the new baseline: exit 0.
- Review decision (b) build (2026-09-25): the new hook test went red first (`editorDeleteError`
  null), green after the change. First `npm run ci:dev`: **exit 1** — 2 `web` tests out of 2215,
  both outside this change (`BattlePage.modeToggle` "restores focus to the Fullscreen button…",
  and `OrganismLibrary` "reopens with an empty, error-free name field…" timed out at 5 s) under
  load average ~17 from another session; both files passed 97/97 in isolation. Second `npm run
  ci:dev` (redirected to a file, `$?` read directly): **exit 0** — typecheck ✓; lint 0 errors, the
  1 pre-existing `BattleGallery.tsx:248` warning; format ✓; spec:check ✓ (274 ids); boundary ✓;
  coverage — web 131 files / 2215 tests, domain 212, simulation 408, persistence 103, test-utils
  95; build ✓; bundle ✓ (`/organisms` 300.4 KB vs 300.3 KB baseline, +0.1 KB; every other route
  +0.0 — no baseline refresh); bench 8.618 ms / 16.667 ms; e2e Chromium 282 passed.

- Second-pass decision (a) build (2026-09-25): the new editor test and the amended Library test
  went red first (Delete enabled; focus on Delete), green after the change. `npm run ci:dev`
  (redirected to a file, `$?` read directly): **exit 0** on the first run — typecheck ✓; lint 0
  errors, the 1 pre-existing `BattleGallery.tsx:248` warning; format ✓; spec:check ✓ (274 ids);
  boundary ✓; coverage — web 131 files / 2216 tests, domain 212, simulation 408, persistence 103,
  test-utils 95; build ✓; bundle ✓ (`/organisms` 300.4 KB vs 300.3 KB baseline, +0.1 KB; every
  other route +0.0 — no baseline refresh); bench 7.411 ms / 16.667 ms; e2e Chromium 282 passed.

### Completion Notes List

- **AC1/AC9**: every Library card passes `onRequestDelete`; `system` comes from
  `verdict.kind === 'protected'` (FD3 — `CONWAYS_CLASSIC_ID` dropped from the Library's imports).
  The card keeps "renders iff the prop is passed". The 4.21 assertions inverted:
  `OrganismCard.test.tsx` (no prop → still no Delete, now pinned on the system card too),
  `OrganismLibrary.test.tsx` (Delete on every card; Conway's has a DISABLED Delete even when
  placed), and e2e 4.21 test 1 replaced.
- **AC2/AC3/AC6/AC7**: `OrganismDeleteConfirmDialog` (the fourth `dynamic()` boundary) +
  `useOrganismDelete`. Confirm → fresh re-verify → write → exit → toast / reload / focus on Create.
  A stale `blocked` → no write, handoff to the block dialog with the fresh names; a vanished record
  → no write, no toast, reload; a rejection (read or write) → `role="alert"` published on exit. The
  publish-after-exit ordering is asserted in jsdom with a MutationObserver (at the first moment the
  toast or alert exists, no dialog is mounted).
- **Deviation (recorded in `deferred-work.md`)**: the latch and `pending` are released in the exit
  handler, not in the writer's `finally` as Task 2 words it — the Story 4.18 gate review's finding
  (a dialog re-enabled for its fade takes a second Confirm or a Cancel that overwrites the outcome).
- **AC4/AC8 (FD6)**: native `disabled` + `aria-describedby` to a visible `useId()` note, on the
  card and in the editor. Fixed a latent specificity bug on the card: `&[data-danger]:hover`
  out-ordered `&:disabled:hover`, so a disabled Delete would have turned red on hover — now
  `:hover:not(:disabled)`.
- **AC5 (FD9/FD11)**: the editor gets `onRequestDelete?()` and `deleteError?` only (no
  repository). The Library closes the editor from the confirmation's exit handler and composes the
  editor's `onExited` to publish the held toast. The Library reloads at the confirmation's exit
  (Task 2's exit handler), so the card is gone before the editor hook's own focus restore runs and
  its Create fallback lands (FD8) — `useOrganismEditorModal.ts` is untouched. The FD9 unwind is
  pinned: after the whole sequence the page root is neither `inert` nor `aria-hidden`. Escape on a
  stacked confirmation closes only it (pinned).
- **FD7**: an always-mounted `[data-delete-status]` `role="status"` beside `[data-clone-error]`,
  outside `aria-busy`; the badge got `data-organism-count`, and every unscoped badge query (11 in
  `OrganismLibrary.test.tsx`; e2e `:210/:235/:242/:2854/:3160`) was retargeted with no assertion
  change. The Library's "only status node" comment is updated.
- **Not in the story's plan, surfaced**: the e2e `getByText("Conway's Classic")` retarget (49
  mechanical `exact: true` additions) — the same class as the FD7 retarget; and the 4.21 unit
  fixtures were hoisted to a module-scope `deleteRig()` shared with the 4.22 block.
- ✅ Resolved review finding [Patch]: **the (b) resolution for the editor-origin vanished record**.
  `ConfirmOutcome` gained `gone`; the exit handler publishes `ORGANISM_DELETE_GONE` ("This organism
  no longer exists. It may have been deleted in another tab.", new in `saveOutcome.ts` beside
  `ORGANISM_DELETE_FAILED`) into `editorDeleteError` for the editor origin only, so it renders
  through the editor's existing FD12 `SaveErrorLine` `role="alert"`. The write is still skipped,
  the Library still reloads, `onEditorDeleted` is not called (the editor stays open), no toast, and
  focus returns to the editor's Delete (the `editor` restore intent is kept). The card origin is
  unchanged (no alert; focus to Create). Tests: hook ("editor origin: a record deleted elsewhere
  keeps the editor open…", red before the change) and Library ("editor origin: a record deleted in
  another tab keeps the editor open with an in-editor alert…", with a publish-after-the-
  confirmation's-exit ordering assertion); the card-origin hook test now also asserts no editor
  alert.
- ✅ Resolved review finding [Patch]: **the second-pass (a) resolution — the editor's Delete is
  disabled while the record-gone alert shows**. `OrganismEditorModal`'s `DeleteOrganismButton` is
  `disabled={isSaving || deleteProtected || deleteError === ORGANISM_DELETE_GONE}`; a refusal
  (`ORGANISM_DELETE_FAILED`) leaves it enabled, since a retry is that alert's point. Focus: the (b)
  build restored focus to that Delete, which is now disabled on the same commit and cannot take
  focus, so the gone branch sets a new `editor-save` restore intent in `useOrganismDelete` and the
  focus effect lands on the editor's Save (new `data-editor-save` lookup key) — the editor's
  primary action, and the one the alert's re-create path runs through. The card origin is
  unchanged (Create). Tests: editor ("is disabled while the record-gone alert shows, and only for
  that sentence", red before the change) and the Library's editor-origin gone test (Delete disabled,
  focus on Save — red before the change, it previously asserted focus on Delete).
- **Owner questions open, defaults implemented**: FD13 (the card-content deferrals re-pointed to the
  next card-content change / Epic 4 UX touch) and FD12 (the failure sentence as written). Both are
  also listed at the end of this story's `deferred-work.md` section.

### File List

- `apps/web/lib/organisms/useOrganismDelete.ts` (new)
- `apps/web/lib/organisms/useOrganismDelete.test.tsx` (new)
- `apps/web/components/organisms/OrganismDeleteConfirmDialog.tsx` (new)
- `apps/web/components/organisms/OrganismDeleteConfirmDialog.test.tsx` (new)
- `apps/web/components/organisms/OrganismCard.tsx`
- `apps/web/components/organisms/OrganismCard.test.tsx`
- `apps/web/components/organisms/OrganismLibrary.tsx`
- `apps/web/components/organisms/OrganismLibrary.test.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/lib/organisms/deleteBlockCopy.ts`
- `apps/web/lib/organisms/deleteBlockCopy.test.ts`
- `apps/web/lib/organisms/saveOutcome.ts`
- `apps/web/lib/organisms/usageLabels.ts`
- `apps/web/lib/saveFailureMessage.ts` (review: the delete-failure sentence moved out again, to
  `saveOutcome.ts`)
- `apps/web/lib/useInertBackground.ts` (review: the nested-instance fix) and
  `apps/web/lib/useInertBackground.test.tsx`
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/4-22-safe-delete-protected-default.md`
- `scripts/bundle-baselines.json` (tool-written)

### Change Log

- 2026-09-25: Story 4.22 implemented — Delete on every card (confirm / block / protected and
  disabled), the editor's Column-1 Delete Organism, the `useOrganismDelete` controller with a fresh
  re-verify before the write, the `Organism deleted` status and the refusal alert, the badge
  selectors retargeted, and the bundle baseline refreshed. Status → review.
- 2026-09-25: Code review (Fable). Twelve patches applied — the load-bearing one is
  `useInertBackground`'s module-level claim registry, without which the editor is handed back inert
  after any Cancel/Escape/OK on a dialog stacked over it (measured in Chromium, now pinned in unit,
  jsdom and e2e). Also: a Confirm-during-Cancel-fade guard, the editor-origin `open` guard, the
  fresh-name handoff, the held-toast clear, `ORGANISM_DELETE_FAILED` moved to `saveOutcome.ts`,
  `onEditorExited` deps, three refusal-coverage tests, the block-over-editor axe e2e, and doc/nit
  fixes. Bundle baseline refreshed through the tool: `/organisms` 307423 → 307548 B (+125),
  `/battle` 316969 → 316998, `/battle/new` 316767 → 316795, `/` 341838 → 341919 — the shared hook
  grew every route; `/settings` unchanged. One owner decision left open (the editor-origin vanished
  record, AC6). Status → in-progress.
  - Review gate, `npm run ci:dev` redirected to a file with `$?` read directly: **exit 0** on the
    third run (typecheck ✓; lint 0 errors, the 1 pre-existing `BattleGallery.tsx:248` warning;
    format ✓; spec:check ✓ 274 ids; boundary ✓; coverage — web 131 files / 2213 tests, domain
    212, simulation 408, persistence 103, test-utils 95; build ✓; bundle ✓ within the 8 KB
    allowance on every route; bench 8.566 ms / 16.667 ms; e2e Chromium **282 passed**). The first
    two runs were **exit 1** with 5 and then 10 `Test timed out in 5000ms` failures, all axe or
    editor-flow tests in `OrganismLibrary.test.tsx` / `OrganismEditorModal.test.tsx`, a different
    set each time and mostly in Stories 4.3–4.17 this branch does not touch — the machine's load
    average was 17–25 from another session; the same two files passed 191/191 under coverage in
    isolation, and the third run started once load fell under 6. The 5 s axe-scan ceiling under
    coverage load is a known fragility (the Dev Record hit it once too); not changed here.
  - Real-browser probe before the fix: the new e2e "Cancel on the stacked confirmation" failed on
    the dev commit (`closest('[inert]')` on the editor's Delete returned the portal) and passes
    with the hook fix; the 4.21 + 4.22 e2e blocks then ran 18/18 in Chromium.

- 2026-09-25: Addressed code review findings — 1 item resolved: Sidiar's decision (b) for the
  editor-origin vanished record. `ORGANISM_DELETE_GONE` added to `saveOutcome.ts`; the
  `useOrganismDelete` exit handler publishes it in-editor (existing FD12 `SaveErrorLine` alert)
  for the editor origin, keeps the editor open, skips the write, reloads, no toast; card origin
  unchanged. Hook and Library tests added. `npm run ci:dev` exit 0. Status → review.
- 2026-09-25: Second-pass code review (Fable) of the (b) build. Conforms to the decision and every
  FD it touches. Four patches applied — all documentation and test hygiene, no behaviour change:
  the `deferred-work.md` alert-lifecycle entries amended (the "sentence stays true" rationale is
  false for `ORGANISM_DELETE_GONE`, and the reverse stale-"Organism saved"-beside-GONE order joins
  the same 4.23 item), the editor's `deleteError` prop doc / JSX comment and the Library's
  card-alert comment now name the GONE case, AC6 carries the editor-origin carve-out inline, and
  `watchFirstAppearance` took a dialog-predicate parameter so the new Library test reuses it
  instead of an inline observer. One dismissed (an inert-aware ordering guard that would
  false-fail: `useInertBackground` is a plain `useEffect`). One owner decision left open: the
  editor's Delete after the GONE alert (still enabled; a repeat Delete → Cancel dismisses the
  alert). Local `npm run ci:dev` on `bd21831` before the patches: exit 0 on the first run
  (web 131 files, e2e Chromium 282 passed). Status → in-progress.

- 2026-09-25: Addressed code review findings — 1 item resolved: Sidiar's second-pass decision (a).
  The editor's Delete is disabled while `ORGANISM_DELETE_GONE` shows; focus after that alert goes
  to the editor's Save (new `editor-save` restore intent, `data-editor-save` key) instead of the
  now-disabled Delete. Editor and Library tests. Status → review.
- 2026-09-25: Third-pass code review (Fable) of the (a) build, after the #82 sync. Conforms to the
  decision's [Patch] wording. Three patches applied: the GONE-disabled Delete is now
  `aria-describedby` the alert line (FD6's pattern, one `useId()`; asserted in the decision-(a)
  editor test, and the FD12 refusal asserted to carry no description), the story's Task 2 /
  Implementation Plan / AC6 text now name the fourth restore intent and the (a) behaviour, and the
  two `deferred-work.md` alert-lifecycle entries say the disabled Delete rides on the same cell.
  Three dismissed. One owner decision left open: after the accepted re-creating Save the editor's
  Delete stays disabled until the editor closes — clear on Save now, leave to 4.23, or
  editor-local re-enable. Status → in-progress.
  - Review gate, `npm run ci:dev` redirected to a file with `$?` read directly: **exit 0** on the
    patched tree (typecheck ✓; lint 0 errors, the 1 pre-existing `BattleGallery.tsx:248` warning;
    format ✓; spec:check ✓ 277 ids; boundary ✓; coverage — web 136 files / 2301 tests, domain 12
    files, simulation 23, persistence 8, test-utils 6, all passed; build ✓; bundle ✓ +0.0 KB on
    every route, no baseline refresh; bench 7.550 ms / 16.667 ms; e2e Chromium **288 passed**).
    The first run on `3abe1e3`, before the patches, was **exit 1** in the e2e stage only: 234
    passed, then `net::ERR_CONNECTION_REFUSED` on `127.0.0.1:4173` for the rest — the shared-port
    collision with the other lane's worktree the Dev Record already names, not this branch.
- 2026-09-25: Sidiar resolved the third-pass decision as (b): the disabled Delete under a stale
  GONE alert after a re-creating Save goes to the 4.23 editor-state pass (recorded in
  `deferred-work.md`). No code change; no review decision is open. Status → done.

Dev Model: opus   # architecture-shaping: first Library-owned dialog stacked over the mounted editor (two nested inert windows, close sequencing) — the pattern Story 4.23's unsaved-changes dialog builds on — plus the extracted delete controller and the Library's second live region
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 22s | 22s | 16 | 2,970 | 9,495 | 446,438 | 458,919 |
| Step 1 — create | opus-5-5 | 1 | 7m 17s | 7m 17s | 122 | 3,500 | 411,366 | 7,630,723 | 8,045,711 |
| Step 2 — implement | opus-5-5 | 1 | 35m 47s | 35m 47s | 348 | 5,991 | 599,897 | 40,293,996 | 40,900,232 |
| Step 3 — review + PR | fable-5-1 | 4 | 36m 38s | 36m 38s | 6,462 | 16,452 | 2,852,277 | 34,408,977 | 37,284,168 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 66 | 16,751 | 44,038 | 2,170,844 | 2,231,699 |
| **Total (create → PR ready)** | | 6 | **1h 20m** | 1h 20m | 6,948 | 28,913 | 3,873,035 | 82,780,134 | **86,689,030** |

Run started 2026-09-25 10:14 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
