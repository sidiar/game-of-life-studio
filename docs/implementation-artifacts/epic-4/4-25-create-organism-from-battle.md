---
baseline_commit: 3917ab49d6a9a2ddb3d0980bad052d6380e92f49
---

# Story 4.25: Create Organism from Battle

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to create a new organism while designing a battle,
so that inspiration doesn't require leaving my work.

## Acceptance Criteria

The epics source (`docs/planning-artifacts/epics.md` §Story 4.25) comes first, verbatim. The
numbered ACs after it are the implementation-level contract this story is reviewed against.

> **Given** the roster's "+ CREATE NEW ORGANISM" button (rendered from this story on; spec §3.4),
> **When** clicked, **Then** the editor opens in create mode over the mounted battle (FR-1.2 entry, M5)
> **Given** Save & Close, **When** completed, **Then** the new organism joins the session roster,
> immediately selectable for painting (Decision H.2; spec §3.4)
> **And** Cancel leaves the roster and battle untouched

"Save & Close" is stale. Story 4.16 Task 11 made Save keep the editor open, with Back / ✕ / Escape
returning to the entry context (`organism-editor-design.md` "Exit Points", amended 2026-09-22).
Story 4.24 read its own line as "Save, then Back to Battle", and `deferred-work.md` ("The
battle-origin flows still specify 'Save & Close'") says 4.25 must read its line the same way. This
story does.

1. **The create button renders (FR-1.2 entry, spec §3.4, mockup `.create-organism-btn`).** The Lab
   roster's add container gets a `+ Create New Organism` button, placed **after** the search input
   and the `+ ADD ORGANISM` select, as the mockup has it (`petri-dish-lab-mode.html:693`).
   - Its text is `+ Create New Organism`, the Library's string, uppercased by CSS. It carries
     `data-create-organism=""`, the focus-restore anchor `useOrganismEditorModal` already looks up.
   - Styling follows `.create-organism-btn` (`:260-278`): full width, a 1px **dashed**
     `--gol-accent` border, `--gol-accent` text, 11px/600/uppercase/0.5px letter-spacing,
     `--gol-bg-hover` on hover. Add a focus-visible ring (house style), enumerated transitions
     rather than `all`, a reduced-motion escape, and no raw hex (AR-46).
   - It renders **only when an `onCreateOrganism` prop is passed** (NFR-4.1, the 4.24 pencil rule).
   - **Where it renders (FD2):** in the normal state, the search-matches-nothing state, the
     "every library organism is already in this battle" state and the **empty-workspace** state.
     The empty-workspace copy ("create an organism to place it in a battle") now has its action
     right below it.
   - **Where it does not render:** at the roster cap, where the cap message stays alone (a creation
     could not join), in the `libraryUnavailable` degraded branch, and in Run mode, which has no
     roster.
2. **The editor opens in create mode over the mounted page (FR-1.2, M5, AR-33).** Activating the
   button calls the `useOrganismEditorModal('battle', …)` hook's `requestCreate()`. No usage fetch
   is needed, and no in-use gate opens, because a new organism is used nowhere. The editor is the
   same lazily loaded `<OrganismEditorModal>` 4.24 mounts, with `origin="battle"` and
   `organism === null`:
   - its header's Back reads `← Back to Battle` (`backLabelFor`);
   - its draft is `createNewOrganismDraft` over the **whole library**, the overlay-applied
     `editorLibrary`, never the roster (M6; the `deferred-work.md` 4-8 entry "Story 4.25 must pass
     the battle's library").
   No route change occurs, and `<BattlePage>` never unmounts. Throughout the editor's open and exit
   windows, every AC4 guarantee from Story 4.24 holds:
   - the page is `inert`;
   - `grid`, the undo ring, `battleName`, `isDirty` / `data-dirty` and the selected tool are
     unchanged;
   - no `beforeunload` change occurs;
   - `useLeaveGuard` never opens.
3. **Re-entrancy and guards.** A create press is a no-op while:
   - the editor or the gate is mounted;
   - a 4.24 pencil fetch is pending (`editPendingRef`);
   - a battle save is in flight (`savingRef`);
   - `organisms` is `undefined`.
   The hook's own `requestCreate` guard backs this up for a programmatic caller.
4. **Save, then Back: the organism joins the session roster, selected (Decision H.2, spec §3.4,
   FR-7.15, FD1, FD3).** If the create session saved at least once, then after the editor has fully
   exited, **in one commit**:
   - `<BattlePage>` adopts the last saved record into the 4.24 `savedOrganisms` overlay. This
     reaches `applySavedOrganisms`'s **append** branch, reachable for the first time.
   - The record's id is appended to `sessionRoster` through the existing `onAddToRoster`.
   - The new row becomes the selected tool, so the next press on the dish paints it. This is the
     `BattleEditorView` "add AND select" commitment 4.25 inherits (`BattleEditorView.tsx:657`).

   Also:
   - The new row renders last in the roster, with its name and colour chip, and gets its own ✎. It
     is absent from the add dropdown, because `library` subtracts `rosterIds`.
   - `isDirty` is unchanged: the session roster is never persisted (H.2), and a clean battle stays
     clean.
   - The grid's cells and the existing roster order are unchanged. The new id is **appended**, so
     no existing ref shifts (Story 2.10 trap 1).
   - `organisms.list()` is **not** called again (4.24 FD5: never `reload()`).
5. **Cancel leaves everything untouched.** Closing a create session that never saved (Back / ✕ /
   Escape on a clean draft, or Discard from the 4.23 guard) changes nothing:
   - no roster row is added and no overlay entry is added;
   - the selected tool, the grid, the undo ring and `data-dirty` are unchanged;
   - nothing is written to `gol:organisms`.
   A session that saved and **then** discarded later edits still hands back its last saved record,
   which joins the roster per AC4. The record exists in the shared library, and the 4.16/4.23
   close-time contract hands over the last save (FD3).
6. **Focus.** On close, focus returns to the `+ Create New Organism` button through the hook's
   existing `[data-create-organism]` restore. This holds on both paths, saved and cancelled.
   **Amended by Sidiar's review ruling D1 (a), 2026-09-27:** the cancelled path (a session that
   never saved) still restores to the create button; a session that saved restores to the new
   row's own ✎ (`[data-edit-organism-id="<newId>"]`) instead — including at the 255 cap, where the
   create button is gone by restore time. See Review Findings.
7. **The editor footer on a create session.** The footer shows `Used in 0 Battles`, both before and
   after the first save. The create handler sets `editSummaries` to `NO_SUMMARIES` and
   `editOpenBattle` to a fresh open-battle snapshot, so neither the gate's nor the footer's inputs
   can be stale values left over from an earlier pencil press (FD4). No Delete button renders (4.24
   FD6: no `onRequestDelete` from the battle origin).
8. **Run mode is untouched (FD5).** The create button exists only in Lab. The library changes only
   at the editor's exit, by an append whose id reaches `organisms` and `rosterIds` in the same
   commit, so `runOrganisms` never goes `null` from it. The next Lab → Run toggle compiles a session
   that includes the new organism. A Lab → Run → Lab round trip still renders the button.
9. **Bundle.** The button is a `styled('button')` in `OrganismRoster.tsx` (Forced decision 6 there:
   no MUI list primitives). The editor still reaches `/battle` and `/battle/new` only through the
   existing `next/dynamic` import. If either route grows past its 8 KB allowance, refresh its
   baseline in this PR (`npm run build:standalone` then `npm run bundle:baseline`, never a hand
   edit).
10. **Tests and gate.**
    - **Unit:** the `OrganismRoster` create-button tests:
      - it renders iff `onCreateOrganism` is passed;
      - its name, and `data-create-organism`;
      - it appears in the four add-container states and not at the cap or in the degraded branch;
      - a click calls the callback and not `onSelectTool` / `onAddToRoster`;
      - axe.
    - **Unit:** the `BattlePage` create tests (AC2–AC7).
    - **e2e:** a new create-from-battle spec, on a saved battle:
      - `+ Create New Organism` → name it → Save → Back to Battle;
      - the new row is present and `aria-pressed="true"`, and a click on the dish paints it (assert
        through the status bar's per-organism count, never pixels);
      - the URL is unchanged and `data-dirty` is unchanged;
      - `localStorage` holds the new organism, and the battle record is untouched;
      - a second flow shows that Cancel adds no row;
      - axe with the editor open over the battle.
    - Invert the two "no create button yet" assertions (`OrganismRoster.test.tsx:286-300`,
      `battleRoute.spec.ts:370-374`). Do not delete them.
    - `npm run ci:dev` is green.

## Tasks / Subtasks

- [x] **Task 1: The create button (AC1).**
  - [x] In `OrganismRoster.tsx`, add `onCreateOrganism?(): void` to `OrganismRosterProps` (spec
        §3.4's exact signature). Replace the "❌ Still no `onCreateOrganism`" paragraph with the
        shipped fact.
  - [x] Pass `onCreateOrganism` into `OrganismSearchAdd` and render the button inside
        `<AddContainer>` in every state except `atCap` (FD2).
        - Restructure the early returns so that each non-cap state renders its message or controls
          **plus** the button. Do not duplicate the button JSX four times: one small `CreateButton`
          element or a local helper is enough.
        - Keep the four-state comment block accurate.
  - [x] `styled('button')` per AC1, with `--gol-*` tokens only.
- [x] **Task 2: Thread through `BattleEditorView` with selection (AC4, FD1).**
  - [x] Add `onCreateOrganism?(onCreated: (organismId: string) => void): void` to
        `BattleEditorViewProps`. This deliberately deviates from spec §3.3's `onCreateOrganism?():
        void` (FD1, see Question 1); record the deviation in the prop's doc comment.
  - [x] Wrap it, in the same way as `handleAddToRoster`:
        `handleCreateOrganism = useCallback(() => onCreateOrganism?.((id) =>
        setChosenTool({ kind: 'organism', organismId: id })), [onCreateOrganism])`. Pass
        `onCreateOrganism === undefined ? undefined : handleCreateOrganism` to `<OrganismRoster>`,
        so an absent prop still means no button.
  - [x] Pull the prop out of `...rest` alongside `onEditOrganism`, because it belongs to the sidebar
        and not to `<EditorMain>`. Add it to the `Omit<…>` list at `:203-215`.
- [x] **Task 3: `<BattlePage>` wiring (AC2–AC8, FD1, FD3, FD4).**
  - [x] Destructure `requestCreate` from the existing `useOrganismEditorModal('battle', …)` call.
        Do **not** add a second hook call. One hook means one `useInertBackground` (the hook's head
        comment explains why).
  - [x] `onCreatedRef = useRef<((id: string) => void) | null>(null)`.
  - [x] `handleCreateOrganism(onCreated)`, a synchronous `useCallback`:
        - bail under AC3's guards;
        - otherwise stash `onCreated` in the ref;
        - `setEditSummaries(NO_SUMMARIES)`;
        - `setEditOpenBattle({ id: persistedId, name: battleName, organismIds: <placed set> })`,
          built exactly as the pencil builds it. Factor a small local helper if it keeps the two
          call sites identical;
        - clear the shared alert slot's three messages, since this is a new attempt (the 5.6 FD9
          rule);
        - then `requestCreate()`.
  - [x] Replace `onSaved: adoptSaved` with `onSaved: handleEditorSaved(record)`:
        - `const isNew = !(organisms ?? []).some((o) => o.id === record.id)`. A created record's id
          is unknown to the library before adoption, and a pencil edit's is always known.
        - `adoptSaved(record)`.
        - If `isNew`: `onAddToRoster(record.id)`, then `onCreatedRef.current?.(record.id)`.
        - Clear the ref.
        All three setters run in this one callback, which the hook invokes from `handleExited`, so
        React batches them into **one** commit. The row never renders as "Unknown organism" for a
        frame, and `runOrganisms` never observes the id without its record.
  - [x] Clear `onCreatedRef` on a pencil press too, so that a create closed **without** saving cannot
        leave a stale continuation for a later edit. `isNew` already makes a stale call unreachable,
        so this is defence in depth. Say so in one comment line.
  - [x] Pass `onCreateOrganism={handleCreateOrganism}` to `<BattleEditorView>` (Lab only, beside
        `onEditOrganism`).
  - [x] Touch nothing in `persistBattle`, `useDirtyGuard`, `useLeaveGuard`, `useUndoableGrid`,
        `rosterIds`' seeding logic, or `buildRosterIds`.
- [x] **Task 4: Tests (AC10).**
  - [x] `OrganismRoster.test.tsx`: the create-button block (AC1), and invert the `:286-300` "no
        create button" assertion into "none without `onCreateOrganism`".
  - [x] `BattlePage.createOrganism.test.tsx`, a new file (the `.editOrganism` / `.export` split
        precedent), using `@gol/test-utils` fakes:
        - a click opens the editor with "Back to Battle" and no gate;
        - no `battles.list()` call on create;
        - Save → Back gives a new last row that is `aria-pressed="true"`, with an unchanged
          `data-dirty`, unchanged existing row order, and no second `organisms.list` call;
        - Cancel on a clean draft adds no row and leaves the selection unchanged;
        - save then Discard-later-edits still adds the saved record;
        - no Delete button;
        - focus lands on the create button after close (after a save, on the new row's ✎ —
          AC6 as amended by ruling D1 a);
        - a create press while the pencil fetch is pending is a no-op;
        - on a workspace-empty `/battle/new` (empty library), create → save → the row appears and
          is selected, and the empty-library copy is replaced by the "every library organism is
          already in this battle" copy.
  - [x] `BattleEditorView` test (existing file): the wrapper selects the id its continuation
        receives.
  - [x] `applySavedOrganisms.test.ts` already pins the append branch. Update its title or comment
        from "the Story 4.25 branch" to the shipped fact, and nothing more.
  - [x] The new e2e `apps/web/e2e/createOrganismFromBattle.spec.ts` covers the AC10 flows. Seed
        through the existing `addInitScript` helpers, and verify the `localStorage` writes directly.
        Before axe, wait on the dialog container's opacity (the 4.23 mid-fade trap). Use
        `exact: true` on name queries (the 4.24 substring lesson: "Edit X" contains "X").
  - [x] Invert `battleRoute.spec.ts:370-374`'s "CREATE button remains absent" to "present once".
        Check that no other e2e counts sidebar buttons or `/create/i` matches that the new button
        would break. Retarget them; do not weaken them.
- [x] **Task 5: Comments and docs hygiene.**
  - [x] Sweep forward-looking "Story 4.25" comments so each states the shipped fact:
        - `BattlePage.tsx:~740` (the 3.17 adjust note), which is still unreachable (FD5);
        - `BattleEditorView.tsx:657`;
        - `OrganismRoster.tsx:473`;
        - `OrganismRoster.test.tsx:292`;
        - `applySavedOrganisms.ts:14-17`, where the append branch is now reachable;
        - `useOrganismEditorModal.ts:157-161`, where the `[data-create-organism]` fallback now
          finds the roster's button on `/battle`;
        - `useSimulationHotkeys.ts:68`;
        - `OrganismEditorModal.test.tsx:118`;
        - `organismDraft.ts:49`, after verifying its claim.
  - [x] In `deferred-work.md`, anchoring on entry titles and never on line numbers:
        - **Close:** "Story 4.25 must pass the battle's library" (4-8), and "The battle-origin flows
          still specify 'Save & Close'" (4-16, the 4.25 half).
        - **Record as honoured:** the 4-15 "mount this panel over `<BattlePage>` in Lab only"
          entry's "4.25's '+ Create' inherits the same rule".
        - **Re-point with the reason (FD5):** the 3-11 residual ("The residual stays with Story
          4.25"), the 3-17 "live run dropped to Lab without notice" entry and the 3-18 "in-render
          roster adjust exits fullscreen without a focus restore" entry. All three are unreachable
          through Epic 4 by construction. They have no remaining Epic 4 owner and pass to whichever
          story first changes the library under a mounted **Run** page.
        - **Re-point with the reason:** the 2-10 "same-name organisms indistinguishable in the add
          dropdown" entry. It is not addressed, because the create path does not touch the dropdown;
          re-point it to the Epic 4 UX reconciliation.
        - **Amend:** the 4-24 "`savedOrganisms` overlay is never cleared" entry. It now also holds
          **created** records absent from the loaded list, so a future reload must reconcile
          appended records too (see the proposed lane gate below).
- [x] **Task 6: Gate.** Run `npm run ci:dev` without piping it (Chromium e2e only, never the
      four-browser `ci` locally). Handle any baseline refresh per AC9.

### Review Findings

Code review 2026-09-27 (opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor).

- [x] [Review][Decision] Focus is lost when a create fills the roster to the cap (254 → 255) — AC6
      says focus returns to `+ Create New Organism` on both paths, but the append that lands in the
      editor's exit commit sets `atCap`, which unmounts the button (FD2) before the hook's restore
      effect runs; `[data-create-organism]` resolves to nothing and focus drops to `<body>`
      (`useOrganismEditorModal.ts` restore effect; `OrganismRoster.tsx` cap branch). Options:
      (a) on a saved create, restore to the new row's ✎ (`[data-edit-organism-id="<newId>"]`) —
      e.g. the hook records `{ kind: 'edit', organismId: saved.id }` for a create that saved, which
      also changes the non-cap path's target away from AC6's create button; (b) keep AC6's target
      and fall back to the new row's ✎ only when the create button is gone; (c) fall back to the
      cap message / Organisms section heading (needs a focusable target); (d) accept — a
      one-in-255 boundary, record it in `deferred-work.md`.
      **Sidiar ruled (a), 2026-09-27:** on a saved create, restore focus to the new row's ✎
      (`[data-edit-organism-id="<newId>"]`) on both paths — the non-cap path's restore target
      deliberately moves off AC6's create button.
      **Applied:** `useOrganismEditorModal`'s `handleSaved` now rewrites a `{ kind: 'create' }`
      restore intent to `{ kind: 'edit', organismId: saved.id }` the moment a save lands, scoped to
      `origin === 'battle'` (the Library keeps its own create-button target — pinned by one new
      test in that file plus an existing one). A create that never saves is untouched. Tested at the hook level
      (cap-agnostic — the fix fires on every battle-origin save) and at the page level (the two
      paths' outcome through the real roster)
      [apps/web/lib/organisms/useOrganismEditorModal.ts,
      apps/web/lib/organisms/useOrganismEditorModal.test.tsx,
      apps/web/components/battle/BattlePage.createOrganism.test.tsx]
- [x] [Review][Decision] The create button stays enabled during a battle save and silently
      no-ops — `handleCreateOrganism` bails on `savingRef.current` (AC3), but `CreateButton` has no
      `disabled`, unlike SAVE / UNDO / the name field (`disabled={isSaving}`); NFR-4.1 forbids an
      inert-looking control that does nothing. The 4.24 ✎ has the identical shape (guarded, not
      disabled). Options: (a) thread `isSaving` down (the `exportDisabled` pattern) and disable
      both the create button and the ✎ during a save; (b) disable the create button only, leaving
      the ✎ as 4.24 shipped it; (c) accept — the save window is milliseconds on localStorage, and
      record the ✎ + create pair in `deferred-work.md`.
      **Sidiar ruled (a), 2026-09-27:** thread `isSaving` down (the `exportDisabled` pattern) and
      disable both the create button and the 4.24 ✎ during a save.
      **Applied:** `OrganismRosterProps` gains `isSaving?: boolean` (default `false`), already
      available in `<BattleEditorView>`'s own scope (it was already a required prop there since
      Story 2.13) — no new plumbing needed through `<BattlePage>`. Both `<CreateButton>` and
      `<EditButton>` get a real `disabled` attribute and the same pre-validated disabled trio every
      other sidebar control on this route uses (`--gol-action-disabled` /
      `--gol-action-disabled-bg`); row SELECTION is untouched. Tested at all three layers (roster,
      wrapper, page)
      [apps/web/components/battle/editor/OrganismRoster.tsx,
      apps/web/components/battle/editor/OrganismRoster.test.tsx,
      apps/web/components/battle/editor/BattleEditorView.tsx,
      apps/web/components/battle/editor/BattleEditorView.test.tsx,
      apps/web/components/battle/BattlePage.createOrganism.test.tsx]
- [x] [Review][Patch] `onCreatedRef`'s comment claims it is `null` on every path except an open,
      un-adopted create — false after a cancelled create (no `onSaved`, so the dead continuation
      lingers until the next press); comment corrected to the real invariant
      [apps/web/components/battle/BattlePage.tsx:1058]
- [x] [Review][Patch] AC1's "after the search input and the add select" order is not pinned by any
      test — DOM-order assertion added
      [apps/web/components/battle/editor/OrganismRoster.test.tsx]
- [x] [Review][Patch] The "no create button in Run mode" test never asserts absence while in Run
      (AC8) [apps/web/components/battle/BattlePage.createOrganism.test.tsx:227]
- [x] [Review][Patch] The Cancel test re-checks a node captured before the modal opened (passes on
      a detached node) and never checks AC5's "nothing is written to `gol:organisms`" — re-query
      after close, exactly one pressed row, `organisms.save` not called, library unchanged
      [apps/web/components/battle/BattlePage.createOrganism.test.tsx:145]
- [x] [Review][Patch] The pending-pencil test's first `queryByRole('dialog')` assertion is vacuous
      (the lazy editor cannot have mounted synchronously on either path) — dropped; the test's
      real proof (the mounted editor is the pencil's) stays
      [apps/web/components/battle/BattlePage.createOrganism.test.tsx:214]
- [x] [Review][Patch] AC4's colour chip on the created row is not asserted (Dev Notes: "Pin
      everything the ACs claim, including … the colour chip")
      [apps/web/components/battle/BattlePage.createOrganism.test.tsx:109]
- [x] [Review][Patch] The AC2 test's title claims grid and undo ring are untouched but asserts
      neither — living-cells fact and Undo restore added (the 4.24 test's technique)
      [apps/web/components/battle/BattlePage.createOrganism.test.tsx:94]
- [x] [Review][Patch] AC7's "Used in 0 Battles … after the first save" and FD4's stale-snapshot
      reset (a create after a pencil press) are untested
      [apps/web/components/battle/BattlePage.createOrganism.test.tsx]
- [x] [Review][Patch] Save → rename → Save → Back (the FD3 "last saved record" hand-off) is
      untested — one row, carrying the second name
      [apps/web/components/battle/BattlePage.createOrganism.test.tsx]
- [x] [Review][Patch] AC3's `savingRef` guard has no test (4.24's "a comment that claims a boundary
      needs a test on that boundary") [apps/web/components/battle/BattlePage.createOrganism.test.tsx]
- [x] [Review][Patch] The `deferred-work.md` amendment to the 4-24 overlay entry says a created
      record reaches `organisms` "never through a … write the loaded list itself would reflect" and
      that a reload "would silently un-create it" — but the editor already wrote it to
      `gol:organisms`, so a fresh `list()` returns it; the reconcile risk is ordering (append vs
      sorted load) and the created-then-deleted id, reworded
      [docs/implementation-artifacts/deferred-work.md]
- [x] [Review][Defer] `handleModeToggle` does not guard on `organismEditorMounted`, so a
      programmatic Lab → Run → Lab while the editor is open would remount `<BattleEditorView>` and
      leave the create continuation calling a dead setter (the row joins, unselected) — blocked for
      users by `inert`; the toggle's guard shape is 4.24's [apps/web/components/battle/BattlePage.tsx:476]
      — deferred, pre-existing
- [x] [Review][Defer] `handleCreateOrganism` (like 4.24's `handleEditOrganism`) keys on `grid`,
      so its identity churns on every stroke commit and re-renders the roster subtree; `grid` is
      only needed at click time (read it through a ref) [apps/web/components/battle/BattlePage.tsx:1239]
      — deferred, pre-existing
- [x] [Review][Defer] The create button's hover state (11px `--gol-accent` on `--gol-bg-hover`)
      is never contrast-checked; axe scans the resting state only. Same token pair as the Library's
      create button [apps/web/components/battle/editor/OrganismRoster.tsx:347] — deferred,
      pre-existing
- [x] [Review][Defer] `createOrganismFromBattle.spec.ts` adds a third hand-synced copy of the e2e
      seed helper [apps/web/e2e/createOrganismFromBattle.spec.ts] — deferred, pre-existing

Second-pass review 2026-09-27 (opus; Blind Hunter + Edge Case Hunter + Acceptance Auditor), scoped
to the ruling pass `d5410f3..6383547`.

- [x] [Review][Patch] The 254 → 255 cap regression D1 (a) was ruled to fix had no test (the page
      test ran below the cap; the hook test rendered the new row up front) — page-level test added:
      a create from a 254-row roster unmounts the create button and lands focus on the new ✎
      (verified red with the retarget removed; a per-test 20 s timeout, since the 254-row fixture
      exceeded Vitest's 5 s default on CI's coverage run)
      [apps/web/components/battle/BattlePage.createOrganism.test.tsx]
- [x] [Review][Patch] AC6 and Task 5's test bullet still named the create button as the saved
      path's target — both annotated with the D1 (a) amendment [this file]
- [x] [Review][Patch] `handleSaved`'s comment said a second save "repeats the same assignment" —
      it skips the branch (the intent is already `'edit'`); comment corrected
      [apps/web/lib/organisms/useOrganismEditorModal.ts]
- [x] [Review][Patch] A Library-origin test comment claimed to prove the "no matching Edit button"
      fallback, which that path never reaches — comment corrected
      [apps/web/lib/organisms/useOrganismEditorModal.test.tsx]
- [x] [Review][Patch] `OrganismRosterProps.isSaving`'s JSDoc called it "the `exportDisabled`
      pattern"; the code passes `isSaving` itself, as `<BattleNameField>`/`<SidebarFooter>` get it
      [apps/web/components/battle/editor/OrganismRoster.tsx]
- [x] [Review][Patch] The Dev Agent Record overcounted the Library tests ("two new") and
      undercounted the hook tests ("3 new"; it is 4) — corrected [this file]
- [x] [Review][Defer] The restore effect resolves `[data-edit-organism-id]` even when that ✎ is
      now `disabled` (D2), so `?? [data-create-organism]` never falls back and `.focus()` no-ops —
      unreachable today (no battle save can start while the editor is open: both entry handlers
      bail under `savingRef`, the page is inert, no save hotkey) [apps/web/lib/organisms/useOrganismEditorModal.ts:244]
      — deferred, latent

## Dev Notes

### Forced decisions (defaults written in; follow them unless the owner overrides)

- **FD1: The created organism is selected, and selection reaches the view through a continuation.**
  "Immediately selectable" alone would be satisfied by a row the user must still click. But
  `BattleEditorView.tsx:657` records the Story 2.10 UX commitment that 4.25 inherits: "an organism
  reached via this sidebar becomes both present AND selected in one action". The + ADD dropdown
  does exactly that.
  - Selection (`chosenTool`) is `<BattleEditorView>`'s own state (spec §3.3), and the save
    completes in `<BattlePage>` at the editor's exit.
  - A continuation keeps selection where it is owned. `<BattlePage>` never learns about tools, and
    the view never learns about repositories.
  - The alternatives are worse:
    - a `selectOrganismRequest` prop, adopted by an in-render compare, is a second synchronisation
      path;
    - lifting `chosenTool` into `<BattlePage>` reverses spec §3.3;
    - an effect is a lint error (`react-hooks/set-state-in-effect`).
  - Cost: `BattleEditorView`'s `onCreateOrganism` gains a parameter that spec §3.3 does not declare.
    `<OrganismRoster>`'s signature stays spec-exact. **Question 1.**
- **FD2: The button is withheld at the cap, and shown on an empty workspace.**
  - At 255 a creation could be saved to the library but could never join this roster. Offering
    "create" there would promise the AC4 outcome and fail to deliver it. The cap message already
    explains the state (NFR-4.1 forbids inert controls, not explained absences).
  - On an empty workspace, the existing copy already tells the user to create an organism, and the
    button makes that actionable.
  - In the degraded `libraryUnavailable` branch the roster cannot render the result, so the button
    is withheld there too.
- **FD3: "Created" means the last saved record, handed over at close.** The editor stays open
  through saves (4.16 Task 11), and the hook's `onSaved` fires once, at exit, with the last saved
  record. A session that saved and then discarded later edits has still created an organism: it is
  in `gol:organisms` and would otherwise sit in the add dropdown unexplained. It joins the roster.
  Only a session that never saved is the epics' "Cancel". This matches the Library, where the same
  close triggers its reload. **Question 2.**
- **FD4: Create resets the editor's usage snapshots.** `editSummaries` and `editOpenBattle` are
  page state written by the 4.24 pencil. Left alone, a create after an edit would open with the
  previous edit's snapshots. They are harmless for a brand-new id today, since no summary or placed
  set can hold it, but they are a latent lie. So the create handler writes `NO_SUMMARIES` and a
  fresh open-battle snapshot. No `battles.list()` is needed: nothing can reference an id that does
  not exist yet, so the footer's `Used in 0 Battles` is exact.
- **FD5: The Run-mode deferrals stay unreachable.** The button is Lab-only. The library changes
  only at the editor's exit. The new id enters `organisms` (the overlay) and `rosterIds` (the
  session roster) in the same batched commit, so `runOrganisms` is never `null` from it, and the
  3-11/3-17/3-18 adjust is never exercised. After 4.25 no Epic 4 story changes the library under a
  mounted page (4.26 is editor-internal). Re-point those entries as having no Epic 4 owner, with
  that reason. Do not build the stop-and-explain notice.
- **FD6: `isNew` is derived and never tracked.** "Not in the library before adoption" is exactly
  "created this session". It needs no mode flag threaded through the hook, and the hook's `onSaved`
  contract stays unchanged for the Library.

### What already exists (reuse, do not rebuild)

- **`useOrganismEditorModal`:**
  - `requestCreate()`, with its `anyMounted` guard;
  - the create focus restore to `[data-create-organism]`;
  - `modalProps.organism === null` for a create;
  - the close-time `onSaved` (latest-value ref, so a callback that closes over `organisms` gets the
    current one).
- **`OrganismEditorModal`:**
  - the create branch (`createNewOrganismDraft(library.map(colorToken))`);
  - `saveStamp` (the first save mints the id, and later saves upsert it);
  - the 4.23 unsaved-changes guard;
  - `origin: 'battle'` and `backLabelFor`.
- **`<BattlePage>` (Story 4.24):**
  - the `dynamic()` editor import and its mount;
  - `editorLibrary` (sorted, with the overlay applied);
  - `savedOrganisms`, `adoptSaved`, and the `organisms` overlay memo;
  - `editSummaries` / `editOpenBattle`;
  - `editPendingRef`;
  - the shared alert slot.
- **`applySavedOrganisms`:** the append branch is already built and unit-tested (4.24 named it for
  this story).
- **`onAddToRoster`:** append-only, same array on a duplicate, never dirties.
- **`BattleEditorView`:** `handleAddToRoster`, the add-and-select pattern to mirror, and
  `resolveSelectedTool`, which keeps a `chosen` id only while it is in `roster`. That is why the
  roster append and the selection must land in the same commit.
- **The Library's create button:** the `+ Create New Organism` string and `data-create-organism`
  (`OrganismLibrary.tsx:608`).

### Current state of the files this story modifies

- **`components/battle/editor/OrganismRoster.tsx` (624 lines).**
  - Props: `roster, selectedTool, onSelectTool, duplicateColorIds?, libraryUnavailable?, library,
    workspaceEmpty?, onAddToRoster, atCap?, onEditOrganism?`.
  - `OrganismSearchAdd` is private and has four early-return states (cap / empty / no match /
    normal).
  - **Preserve:**
    - the pencil (siblings, never nested; no pencil on `unresolved` rows);
    - the degraded branch;
    - the pinned Eraser outside the list;
    - the controlled `value=""` select;
    - Forced decision 6 (bundle).
- **`components/battle/editor/BattleEditorView.tsx` (954 lines).**
  - It owns `chosenTool` and has `handleAddToRoster` (`:659`).
  - It renders the roster at `:855-876`.
  - `onEditOrganism` is pulled out of `rest` (`:640`).
  - It gains one prop.
- **`components/battle/BattlePage.tsx` (1506 lines).**
  - The overlay is at `:504-524`, `sessionRoster` / `onAddToRoster` at `:554-569`, and `rosterIds`
    at `:591-644`.
  - The 4.24 hook call is at `:1055-1061`, followed by `editSummaries` / `editOpenBattle`,
    `editPendingRef` and `handleEditOrganism` (`:1087-1160`).
  - The Lab render is at `:1389-1431`, and the modal mount at `:1495-1503`.
  - **Preserve:**
    - `organisms` stays memo-stable;
    - nothing sets `isDirty`;
    - every comment's invariant.
- **`lib/organisms/useOrganismEditorModal.ts`:** comment-only (`:157-161`). No behaviour change.
- **`lib/battle/applySavedOrganisms.ts`:** comment-only.

### Anti-patterns (these compile and pass tests, and are still wrong)

- ❌ A second `useOrganismEditorModal` call for create. Two `useInertBackground` restore maps would
  unwind out of order.
- ❌ `organismsResource.reload()` after a create (4.24 FD5: a rejection repaints the grid).
- ❌ Appending to `sessionRoster` in one callback and adopting into the overlay in another, or in a
  later tick. For one commit the roster would then hold an id with no record, which gives an
  "Unknown organism" row, and `resolveSelectedTool` would drop the selection.
- ❌ Selecting the new organism before its id is in `roster`. `resolveSelectedTool` discards a
  `chosen` id that is not in the roster and falls back to the first row.
- ❌ A `useEffect` that watches `savedOrganisms` or `rosterIds` to select or append
  (`react-hooks/set-state-in-effect`).
- ❌ Deriving the colour default from the roster. `editorLibrary` is the library (M6).
- ❌ Marking the battle dirty on create or adoption (AR-33, H.2).
- ❌ Hard-coding "Back to Battle". It comes from `backLabelFor(origin)`.
- ❌ Changing `<OrganismRoster>`'s `onCreateOrganism` signature away from spec §3.4's `(): void`.
  Only the view's differs (FD1).

### Project Structure Notes

- New files:
  - `components/battle/BattlePage.createOrganism.test.tsx`;
  - `e2e/createOrganismFromBattle.spec.ts`.
- No package changes, and the `@gol/domain` barrel is untouched (it is the lane-sync collision
  point).
- The editor stays in `components/organisms/editor/` and is reached from `components/battle/` only
  through `dynamic()`.

### Testing standards

- Vitest + RTL + `user-event` 14, with `@gol/test-utils` fakes only. Run axe in jsdom as the
  existing dialog tests do.
- Exit transitions use the 4.22/4.23 `onTransitionExited` technique.
- Never pixel-test the canvas. Assert the roster (row name, chip `style`, `aria-pressed`), the
  status bar's per-organism counts and `data-dirty`.
- Keep the e2e thin: one happy path, one cancel, axe.

### Previous story intelligence (4.24)

- 4.24's first `ci:dev` broke 5 `BattlePage.test.tsx` cases and 4 `battleRoute.spec.ts` cases,
  because the new per-row control changed button counts and name substring matches. Expect the same
  class here: the new button is one more sidebar `button`, and its name contains "Organism". Use
  `exact: true` and scoped queries.
- The review focused on the gate's clipping, dead affordances on unresolved rows, catch scope,
  derivation ordering, and assertions that the Task list claims but tests do not pin. Pin
  **everything** the ACs claim, including the selected state and the colour chip.
- The alert slot is shared by three members. This story adds no member, but its press must clear
  all three (the 5.6 FD9 rule).
- 4.24's second pass: a comment that claims a boundary needs a test on that boundary.

### Git intelligence

- The last merge is 4.24 (#87, `3917ab4`). This story builds directly on its `BattlePage.tsx`
  additions (the overlay, the hook call, the snapshots).
- Lane 5's remaining stories are 5.9 (import UI, `/settings`), 5.10 (clear-all, `/settings`) and
  5.11 (load-time corruption). 5.11 touches the load path near `organismsResource` and owns the
  "unknown organism id falls back" behaviour. The 4-24 deferral hands it the duty to clear or
  reconcile the overlay on any reload, and this story widens that overlay to hold created records.
  Hence the proposed gate below.

### Latest tech notes

React 19.2 (automatic batching across the `onExited` callback), MUI 9.3, Next 16 static export,
Playwright 1.62. No new dependencies.

### References

- `docs/planning-artifacts/epics.md` §Story 4.25; FR-1.2 (`:34`).
- `docs/planning-artifacts/architecture.md` Decision H.2 (`:272`), M5 (`:351`).
- `docs/planning-artifacts/component-tree-battle-page.md`:
  - §3.3 (`:153-154`, `onCreateOrganism?(): void`);
  - §3.4 (`:163-183`);
  - §2 (`:64`, `CreateOrganismButton`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md` `:40-54`
  (exits, return context); `clinical-lab-theme/petri-dish-lab-mode.html` `:260-278`
  (`.create-organism-btn`), `:682-694`.
- `docs/implementation-artifacts/epic-4/4-24-edit-organism-from-battle.md` (FD5 overlay, FD6 no Delete,
  AC4 invariants).
- `docs/implementation-artifacts/deferred-work.md`: the entries listed in Task 5, by title.
- `docs/implementation-artifacts/lane-gates.yaml`: 4.25 requires epic-3, which is satisfied.
- `docs/project-context.md`: the three state categories, AR-2/AR-27 injection, AR-35 dynamic
  imports, the live-region rule, the bundle growth ratchet, and `ci:dev`.

### Questions for Sidiar (saved for the end; defaults are written into the story)

1. **FD1:** should the created organism become the **selected** tool as well as join the roster?
   Default: yes, which mirrors + ADD's add-and-select. Selection reaches the view through a
   continuation parameter that spec §3.3 does not declare.
2. **FD3:** a create session that saved and then discarded later edits. Default: the saved record
   joins the roster. The alternative is to leave it in the library only, where it is reachable
   through + ADD.
3. **FD2:** should the create button be withheld at the 255 cap? Default: withheld, with the cap
   message alone.

## Dev Agent Record

### Agent Model Used

Sonnet (claude-sonnet-5), per the story's own Dev Model line.

### Debug Log References

- `npm run ci:dev` (2026-09-27): typecheck, lint, format:check, spec:check, boundary:check,
  test:coverage (all workspaces), build:standalone, bundle:check, bench, bench:check,
  e2e:chromium — all green.
  - Coverage: `@gol/domain` 100%, `@gol/simulation` 100%, `@gol/persistence` ~99.25%,
    `@gol/test-utils` ~95.78%, `apps/web` ~97.26% (no gate).
  - Bundle: all five routes grew within the 8 KB allowance (`/battle` +2.9 KB, `/battle/new`
    +3.0 KB, `/organisms` +1.1 KB, `/settings` +0.1 KB, `/` −0.3 KB) — no baseline refresh needed.
  - Bench: 8.326 ms headroom (50.0% of the 16.667 ms frame budget) — unaffected by this story.
  - e2e:chromium: 297 passed, 1 pre-existing skip, including both new
    `createOrganismFromBattle.spec.ts` specs and the inverted `battleRoute.spec.ts:329` assertion.
  - One typecheck fixup mid-run: `BattlePage.createOrganism.test.tsx`'s pending-`battles.list()`
    mock used a `readonly BattleSummary[]` Promise against a mutable-array-typed spy; retyped to
    `BattleSummary[]`.
  - One runtime fixup mid-run: `OrganismRoster.tsx`'s create button initially wired
    `onClick={onCreateOrganism}` directly, which passed the click `SyntheticEvent` as the
    callback's argument instead of calling it with none — wrapped in `() => onCreateOrganism()`.
- `npm run ci:dev` (2026-09-27, rulings-application pass — D1 a, D2 a): typecheck, lint,
  format:check, spec:check, boundary:check, test:coverage (all workspaces), build:standalone,
  bundle:check, bench, bench:check, e2e:chromium — all green, unpiped.
  - Test files/tests: `@gol/domain` 14/252, `@gol/simulation` 23/408, `@gol/persistence` 9/159,
    `@gol/test-utils` 6/99, `apps/web` 141/2449 — all passed, no regressions.
  - Coverage unchanged from the prior run: `@gol/domain` 100%, `@gol/simulation` 100%,
    `@gol/persistence` ~99.25%, `@gol/test-utils` ~95.78%, `apps/web` ~97.26% (no gate).
  - Bundle: all five routes within the 8 KB allowance, same deltas as the prior run (`/battle`
    +3.0 KB, `/battle/new` +3.0 KB, `/organisms` +1.1 KB, `/settings` +0.1 KB, `/` −0.3 KB) — the
    ruling's changes reuse existing `--gol-*` tokens and an already-threaded `isSaving` prop, so no
    baseline refresh was needed.
  - Bench: 9.564 ms headroom (57.4% of the 16.667 ms frame budget) — unaffected by this pass.
  - e2e:chromium: 297 passed, 1 pre-existing skip — unchanged from the prior run; this pass added
    no e2e coverage (Playwright specs untouched), only unit/component tests (Vitest + RTL).
  - No fixups needed this pass — typecheck, lint and format:check were all clean on the first try.

### Completion Notes List

- Implemented Tasks 1–6 in order. The create button (`OrganismRoster.tsx`), the
  `BattleEditorView` selection-continuation wrapper (FD1), and `<BattlePage>`'s
  `handleCreateOrganism` / `handleEditorSaved` (replacing the 4.24 `onSaved: adoptSaved` wiring)
  follow the story's Dev Notes and Forced Decisions (FD1–FD6) as written; no deviations.
- `applySavedOrganisms`'s append branch (4.24-authored, previously untested by any caller) is now
  exercised end to end by the create path — no change to its logic, only its comments/test title.
- `<OrganismEditorModal>`'s `library` prop was already `editorLibrary` (the overlay-applied, sorted
  full library) unconditionally for both create and edit sessions, so the 4-8 deferred-work.md
  entry ("Story 4.25 must pass the battle's library") needed no new wiring — closed on inspection,
  not a code change.
- Comment sweep (Task 5) covered all nine named sites plus the `deferred-work.md` entries listed
  in the task (4-8 closed, 4-16 closed for 4.25, 4-15 honoured, 3-11/3-17/3-18 re-pointed with "no
  remaining Epic 4 owner", 2-10 re-pointed to the Epic 4 UX reconciliation, 4-24's overlay entry
  amended for the new append-only case). The story's own proposed lane gate
  (`5-11-load-time-corruption-handling → 4-25-create-organism-from-battle`) is left for Sidiar's
  approval, not added to `lane-gates.yaml` unapproved.
- `npm run ci:dev` is green (see Debug Log References). All three Questions for Sidiar were
  answered by the story's own written defaults (FD1 yes / FD3 joins the roster / FD2 withheld at
  cap) — no runtime behavior deviates from them.
- **Rulings-application pass (2026-09-27):** applied Sidiar's two decisions on the review's
  remaining open items.
  - **D1 (a), focus at the cap:** `useOrganismEditorModal`'s `handleSaved` now rewrites a
    `{ kind: 'create' }` restore intent to `{ kind: 'edit', organismId: saved.id }` the instant a
    save lands, scoped to `origin === 'battle'`. This is the mechanism review option (a) proposed
    verbatim, placed where the review named it (the hook, not the page): it fixes the cap
    regression (the create button unmounts before the restore runs) by construction, because the
    fix never reads `atCap` — it retargets on every battle-origin save regardless. The Library's
    own create-button target (its own AC) is untouched, proven by one new hook-level test using a
    same-id Edit button to rule out "no matching node" as the reason (alongside the existing
    saved-then-Back test). A create that never saves
    still restores to the create button, on both origins.
  - **D2 (a), disabled during save:** `OrganismRosterProps` gains `isSaving?: boolean` (default
    `false`). `<BattleEditorView>` already receives `isSaving` as a required prop (Story 2.13) and
    already threads it to every other sidebar control the same way (`<BattleNameField>`,
    `<GridSettingsSection>`, `<EditorToolsSection>`, `<SidebarFooter>`) — this is the same pattern,
    one more consumer, no new plumbing through `<BattlePage>`. Both `<CreateButton>` and
    `<EditButton>` get a real `disabled` attribute plus the route's own pre-validated disabled trio
    (`--gol-action-disabled` / `--gol-action-disabled-bg`, matching `EditorToolsSection`,
    `BattleNameField`, `SidebarFooter`); row SELECTION is untouched, since painting a tool mutates
    nothing the save lock protects. `deferred-work.md`'s existing "every `disabled={isSaving}`
    control on `/battle` explains nothing" entry is amended to note the two new controls join that
    list rather than being a new gap.
  - Both review checklist items are checked off in place, with an **Applied** note recording the
    mechanism and the files touched, immediately under Sidiar's ruling.
  - Tested at every layer the change touches: `useOrganismEditorModal.test.tsx` (hook, 4 new
    tests), `OrganismRoster.test.tsx` (5 new tests: pencil + create button disabled/enabled,
    selection untouched, axe with a disabled control), `BattleEditorView.test.tsx` (1 new wiring
    test), `BattlePage.createOrganism.test.tsx` (the existing AC6 focus test rewritten for the new
    per-path outcome, plus 1 new test for the disable/re-enable window across a real battle save).
  - `npm run ci:dev` is green (see the second Debug Log entry) — no bundle baseline refresh needed
    (both changes reuse existing tokens and an already-threaded prop), no bench or coverage
    regression.

### File List

- `apps/web/components/battle/editor/OrganismRoster.tsx`
- `apps/web/components/battle/editor/OrganismRoster.test.tsx`
- `apps/web/components/battle/editor/BattleEditorView.tsx`
- `apps/web/components/battle/editor/BattleEditorView.test.tsx`
- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/battle/BattlePage.createOrganism.test.tsx` (new)
- `apps/web/lib/battle/applySavedOrganisms.ts`
- `apps/web/lib/battle/applySavedOrganisms.test.ts`
- `apps/web/lib/organisms/organismDraft.ts`
- `apps/web/lib/organisms/useOrganismEditorModal.ts`
- `apps/web/lib/organisms/useOrganismEditorModal.test.tsx`
- `apps/web/lib/battle/useSimulationHotkeys.ts`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/e2e/createOrganismFromBattle.spec.ts` (new)
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-09-27: Story created (create-story, lane epic-4).
- 2026-09-27: Implemented (dev-story) — create-from-battle button, selection continuation, the
  overlay's append path exercised for the first time, and the AC10 test/e2e/comment sweep.
  `npm run ci:dev` green. Status → review.
- 2026-09-27: Code review (opus) — 11 patches applied (one comment, one deferred-work correction,
  nine test pins), 4 deferred, 2 decision-needed left open for Sidiar. Status → in-progress.
- 2026-09-27: Applied Sidiar's rulings on both decision-needed review items — D1 (a): focus
  restores to the new row's ✎ on both paths once a create saves; D2 (a): the create button and the
  4.24 ✎ are disabled while a battle save is in flight. `npm run ci:dev` green. Status → review.
- 2026-09-27: Second-pass review (opus) of the ruling pass — 6 patches applied (the 255-cap focus
  test, AC6 / Task 5 amendment notes, three comment corrections, record test counts), 1 deferred,
  0 decision-needed. Status → done.

Proposed lane gate: { story: 5-11-load-time-corruption-handling, requires: 4-25-create-organism-from-battle, why: "5.11 owns BattlePage's library-load / unknown-id path and inherits the 4-24 duty to clear or reconcile the savedOrganisms overlay on any reload; 4.25 widens that overlay to hold created records absent from the loaded list" }

Dev Model: sonnet   # follows 4.24's established hook, overlay (append branch pre-built) and modal mount; the one new seam (a selection continuation) is small and fully specified here

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 53s | 53s | 32 | 4,293 | 23,493 | 955,059 | 982,877 |
| Step 1 — create | opus-5-5 | 1 | 5m 04s | 5m 04s | 98 | 6,055 | 320,712 | 5,044,297 | 5,371,162 |
| Step 2 — implement | sonnet-5 | 1 | 36m 29s | 36m 29s | 816 | 22,401 | 1,390,408 | 95,442,566 | 96,856,191 |
| Step 3 — review + PR | opus-5-5 | 4 | 27m 13s | 27m 13s | 308 | 18,570 | 897,571 | 11,934,361 | 12,850,810 |
| _of which the orchestrator_ | fable-5 | — | — | — | 86 | 22,270 | 56,799 | 2,892,080 | 2,971,235 |
| **Total (create → PR ready)** | | 6 | **1h 09m** | 1h 09m | 1,254 | 51,319 | 2,632,184 | 113,376,283 | **116,061,040** |

Run started 2026-09-27 09:39 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
