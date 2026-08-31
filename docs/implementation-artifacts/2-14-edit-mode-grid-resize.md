---
baseline_commit: 7caf465a8ff41c639cd8f5253acba005865b89ab
---

# Story 2.14: Edit-Mode Grid Resize

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to switch my battle between the editable grid presets,
so that I can pick the right canvas size for my design.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.14: Edit-Mode Grid Resize`, decomposed into the eight things a
reviewer can independently check. **AC6 collects the six `deferred-work.md` entries that name Story
2.14 as owner** — the same shape AC6 took in Story 2.13 and AC5/AC6 in Story 2.12.

⚠️ **This is the first story that changes the grid's DIMENSIONS on a live editor.** Every commit
source before it (click, drag, erase, undo, Clear-to-come) hands back a grid of the *same* shape.
Four mechanisms in `<PetriDishCanvas>` and `GridRenderer` were written for this moment, are
commented as waiting for it, and have **never once executed** — `GridRenderer.resize()` with a
genuinely new `size`, the construction effect's `[size, …]` dependency, the `handlePointerDown`
dimension guard, and `useUndoableGrid`'s dimension-carrying snapshot. The sidebar section is the
easy half of this story; making those four fire correctly is the real one.

1. **AC1 — A "Grid Info" sidebar section showing grid facts and the preset control (FR-3.1 facts,
   FR-3.11; spec §3.6).**
   A new `<GridSettingsSection>` mounts as the **third** `<SidebarSection>` — mockup order is
   Organisms · Battle Name · **Grid Info** · Tools (2.15) · Back (2.16), and
   `SidebarSection.tsx:13` names this story as a future consumer of the shell Story 2.11 built.
   Three fact rows — **Grid Size** (`100 × 60`), **Total Cells**, **Living Cells** — plus the
   preset control for **{50×30, 100×60} only** (Decision A, H-9).
   Mockup: `.control-group` / `.control-item` / `.control-label` / `.control-value`
   (`clinical-lab-theme/petri-dish-lab-mode.html:166-189`), markup `:709-726`.
   ⚠️ **"Living Cells" now renders in TWO places** — here and in `<EditorStatusBar>` (Story 2.12).
   That is the mockup's own design (`:790` sidebar, `:800` stats bar), not a mistake to consolidate.
   What must **not** be duplicated is the **derivation**: `<BattleEditorView>` already memoises
   `computeEditorGridStats` (`BattleEditorView.tsx:585-602`); feed this section from **that same
   memo**. A second `computeEditorGridStats` call is a second pass over 6,000 cells per committed
   gesture for a number the component already has.
   ⚠️ `totalCells` is `grid.width * grid.height` — derived from the **grid**, never from a stored
   `gridSize`. See trap 1.
   ⚠️ The mockup renders `6,000` with a separator. `toLocaleString()` is **locale-dependent** —
   see trap 10.

2. **AC2 — A resize preserves content top-left-anchored (AR-17).**
   Existing cells keep their `(col, row)`. Growing adds empty space to the **right and bottom**;
   shrinking clips everything outside the new bounds. This is **AR-17's `resizeGrid`**, which
   `epics.md:776` assigns to **Story 3.3** — see forced decision 1 for where it lives when it is
   needed two epics early.
   ⚠️ It returns **new buffers**, both of them. The `age` buffer is reallocated at the new length
   and zero-filled (trap 3); `occupant` is exactly `width * height` long (trap 4).

3. **AC3 — A shrink that would clip LIVING cells warns first; confirm applies, cancel changes
   nothing (FR-3.11; spec §3.15).**
   `<ResizeClipWarningDialog>` states the consequence **before** the action is taken. Confirm →
   the resize commits. Cancel (and Escape, and backdrop) → **nothing happens**: no commit, no undo
   entry, no dirty flag, and the control still reads the current preset.
   ⚠️ **Living cells, not cells.** A shrink over an all-empty region applies **silently** —
   warning about discarding nothing trains the user to dismiss the dialog unread.
   ⚠️ **Growing never warns** (epic AC, in as many words).

4. **AC4 — An applied resize is a SINGLE undoable commit, and marks the battle dirty.**
   One `onCommitGrid` call, therefore one ring entry, therefore one undo. Undo restores **both**
   dimensions and content — the snapshot already carries `cols`/`rows` and `restore()` already
   rebuilds at the snapshot's dimensions (`useUndoableGrid.ts:76-99`, whose comment calls this
   "the groundwork Story 2.14 (resize) inherits"). **Verify that, do not rebuild it.**
   The dirty flag comes free through `handleCommitGrid` (`BattlePage.tsx:584-595`) — the ONE
   commit seam. ❌ Do not add a second one.
   ⚠️ Selecting the **already-current** preset must be a **no-op** — no commit, no undo entry, no
   dirty. Same shape as Story 2.15's already-empty-Clear AC.

5. **AC5 — The new size persists on save as the battle's `gridSize`.**
   ⚠️ **This is almost certainly already true and needs a TEST, not code.** `projectBattleForSave`
   reads `gridSize` off the **live grid** (`battleRecord.ts:58-61`), and its own comment says so
   because of this story: *"`gridSize` comes from the LIVE grid, never from the draft … and Story
   2.14's resize then needs no change here."* Prove it end to end (resize → save → reload → the
   record's `gridSize` and `gridState` dimensions are the new ones) rather than editing the save
   path. If a change IS needed there, that comment is wrong and saying so is part of the story.

6. **AC6 — The six inherited `deferred-work.md` entries, settled with evidence.**
   Every one names this story. Two further entries (`:243`, `:257`) name it as **inheriting a
   decision already taken** — those are guardrails, not work; see *What NOT to build*.
   | Entry | What it asks of this story |
   |---|---|
   | `:75` | `GridRenderer.resize()` accepts `NaN`/fractional `cols`/`rows` unvalidated. This story is *"the first story to call `resize()` with a genuinely new size."* |
   | `:239` | The stroke's cached geometry goes stale on a mid-stroke **scroll**, not only on a resize. *"Pick this up in Story 2.14 … the next story that touches the geometry path."* ⚠️ Its premise has already been confirmed twice (2.9 added the scrolling ancestor, 2.11 the second section); this story adds the **third**. |
   | `:249` | The mid-stroke-re-layout decision *"ships untested"* — jsdom has no `ResizeObserver`. *"Pick this up in Story 2.14, which makes a live `size` change a real user action for the first time."* |
   | `:347` | The direct `onCommitGrid` **identity** assertion Story 2.11 Task 3 asked for was never written. *"Pick this up in whichever story next touches the commit seam (2.14's confirmed resize and 2.15's Clear both arrive at it), in its own spec file with the mock scoped to it."* |
   | `:367` | `computeEditorGridStats` iterates `occupant.length` rather than `width * height`. *"Pick this up in Story 2.14 … the story that introduces the first resize."* |
   | `:369` | The stats memo keys on `grid` object identity while `occupant` is readonly only at the property level. *"Revisit with the same Story 2.14 change."* |
   Each is **fixed** or **re-deferred with its premise corrected against the code as it stands** —
   the standard Story 2.12/2.13 set. A re-deferral must name the story that inherits it and say
   what changed.

7. **AC7 — The canvas survives a live `size` change: one renderer reconstruction, one full repaint,
   no dimension-mismatch throw, no `ResizeObserver` loop.**
   Not in the epic's AC list, and non-negotiable anyway — *"a story implementation must leave the
   system working end-to-end."* The four never-executed paths (see the ⚠️ above) all fire for the
   first time here. Specifically: `size` and `grid` must change in the **same commit** (trap 2);
   the construction effect (`PetriDishCanvas.tsx:282-336`) reconstructs and `drawFull`s the new
   grid; the grid effect (`:338-378`) then **skips** on `paintedGridRef.current === grid`; nothing
   throws `GridRendererDimensionMismatchError`; and the e2e console-cleanliness assertions stay
   green (no `"ResizeObserver loop completed with undelivered notifications."`).

8. **AC8 — Keyboard-operable, axe-clean, bundle re-measured.**
   The dialog is keyboard-operable (Escape = Cancel, focus trapped, focus restored to the control
   that opened it) and passes axe — the bar Story 1.13's `<DeleteBattleDialog>` already meets, and
   whose hook is reusable. The preset control is reachable and operable by keyboard with a visible
   focus ring, and its selected state is exposed to assistive tech (not conveyed by colour alone).
   Report `npm run bundle:check`'s measured gzip and headroom for `/`, `/battle` and `/battle/new`.
   ⚠️ **`/battle` has 8.5 KB of headroom and this story adds a dialog.** See forced decision 4 —
   this is the story's most likely hard stop, and the budget must not be raised without Sidiar.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (all ACs)**
  - [x] `apps/web/components/PetriDishCanvas.tsx` **in full**, and slowly. This is the file the
        story actually risks. Specifically: the construction effect (`:282-336`) — its three deps
        `[size, palette, colors]`, why `grid`/`showGridLines` are deliberately absent, and its
        cleanup's `endStrokeRef.current(false)` (Story 2.10's decision, which this story
        **inherits**); the grid effect (`:338-378`) and its three-part ordering (skip → terminate →
        renderer guard), whose comment names this story twice; the `ResizeObserver` effect
        (`:392-455`), its `endStroke(true)` **commit** policy and its `[size]` + `endStrokeRef`
        arrangement; `handlePointerDown`'s dimension guard (`:566`) and the review note above it
        that already anticipates *"a mid-stroke `size` change (Story 2.14)"*.
  - [x] `apps/web/lib/canvas/gridRenderer.ts:543-583` — `resize()`. Read the whole doc comment: it
        distinguishes a canvas-box resize from a **grid-dimension** change, names this story, and
        explains why the new-size branch **drops** `lastGrid` and `lastColourState`. Also
        `assertGridMatchesSize` (`:227-240`) and `GridRendererDimensionMismatchError` (`:89-97`).
  - [x] `apps/web/lib/useUndoableGrid.ts` in full — `GridSnapshot` (`:35-39`, dims included and
        why), `snapshot()` (`:76-84`, `.slice()` not `.subarray()`, and its note that *"2.14/2.15
        add new commit sources"*), `restore()` (`:86-99`, a NEW object every time, at the
        SNAPSHOT's dimensions). AC4 is mostly a verification of this file.
  - [x] `apps/web/components/battle/BattlePage.tsx` — the `size` memo and its Story 2.8 forced
        decision 4 comment (`:552-564`), which predicts this story's failure mode by name;
        `handleCommitGrid` (`:584-595`) and why its identity must stay stable; `savingRef`
        (`:244`) and the edit lock; `handleSave` (`:643-690`) and its `grid`-derived projection.
  - [x] `apps/web/components/battle/BattleEditorView.tsx` — `BattleEditorViewProps` (`:23-129`) and
        the `EditorMainProps = Omit<…>` intersection; the `stats` memo (`:585-602`) that AC1 feeds
        from; `<SidebarContent>` (`:186-193`) and the `gap` that will space the third section; the
        composition root's ❌-comment at `:506-508` naming Grid Info as this story's arrival.
  - [x] `apps/web/components/battle/SidebarSection.tsx` in full — the shared shell, the `<h2>`
        decision and the `heading-order` reasoning. Mount into it; do not re-derive the pair.
  - [x] `apps/web/components/gallery/DeleteBattleDialog.tsx` **in full** — the MUI `Dialog`
        composition, the `onClose` guard (there is no `disableEscapeKeyDown` in MUI v9), the
        `disableRestoreFocus` + explicit-restore arrangement, the three-phase open/exiting/closed
        lifecycle, `useInertBackground`, and the parent-effect placement that makes the ordering
        work. This is the proven pattern; AC8 asks for the same bar.
  - [x] `apps/web/lib/gridStats.ts` — `computeEditorGridStats`, and the `occupant.length` loop at
        `:54` that `deferred-work.md:367` is about.
  - [x] `apps/web/lib/battleRecord.ts:46-61` — the `gridSize`-from-the-live-grid comment that
        AC5 is a test of.
  - [x] `packages/domain/src/organismSchema.ts:36-42` — `EditableGridPresetSchema` is a `z.union`
        of two **literal** objects. That union is the whole allowed set (trap 9).
  - [x] `docs/implementation-artifacts/deferred-work.md` — the eight entries citing 2.14
        (`:71`, `:75`, `:239`, `:243`, `:249`, `:347`, `:367`, `:369`). `:71` is closed; `:243`
        and `:257` are **resolved decisions this story inherits**, not work.

- [x] **Task 2 — The pure resize primitive (AC2, AR-17)**
  - [x] Write `resizeGrid(grid, size)` per forced decision 1. Pure, no React, no DOM, no
        repository. Top-left anchored: `next.occupant[r * newW + c] = grid.occupant[r * oldW + c]`
        for every `(c, r)` inside **both** rectangles; everything else stays 0.
  - [x] Allocate **both** buffers fresh at `newW * newH`. `age` is zero-filled — every editable
        grid is age-zero everywhere (RFC-005 "Representation note"), the same fact `restore()` and
        `toRenderableGrid` already encode.
  - [x] Return the SAME identity untouched when the size is unchanged? **No** — return a new grid
        or make the caller not call it. Decide once and comment it; the no-op is enforced at the
        control (AC4), not smuggled in here, so this function stays a total function of its inputs.
  - [x] Write `willClipLivingCells(grid, size)` beside it — `true` iff a **non-zero** occupant lies
        outside the new bounds. Growing is `false` by construction. This is AC3's predicate; do
        not resize-then-compare-counts to answer it.
  - [x] Unit tests + fast-check properties (fast-check `^4.9.0` is installed at the root). See
        *Testing standards summary*.

- [x] **Task 3 — `<GridSettingsSection>` (AC1)**
  - [x] New component per spec §3.6's API: `{ gridSize, onResize, stats: { totalCells, livingCells } }`.
        Presentational — no repository, no grid, no derivation of its own.
  - [x] Three fact rows from the mockup's `.control-item` label/value pair. `Grid Size` renders
        `{cols} × {rows}`; `×` is U+00D7 and must be `aria-hidden` or spoken sensibly — decide and
        comment, the way `<EditorStatusBar>`'s `role="group"` + `aria-label` pattern does.
  - [x] The preset control per forced decision 2. Selected state must not be colour-only (AC8).
  - [x] `disabled` while a save is in flight, mirroring `<BattleNameField disabled={isSaving}>`
        (trap 8).
  - [x] Mount as the third `<SidebarSection title="Grid Info">` in `<BattleEditorView>`, fed from
        the existing `stats` memo plus `grid.width`/`grid.height`.

- [x] **Task 4 — `<ResizeClipWarningDialog>` and the confirm flow (AC3, AC8)**
  - [x] New dialog following `<DeleteBattleDialog>`'s composition exactly — including the `onClose`
        guard, `disableRestoreFocus` + explicit restore, and `useInertBackground`. ❌ Do not invent
        a second dialog idiom on this route.
  - [x] **Consequence first**, then the action: the body says what will be discarded before the
        confirm button is read. Quantify it if the number is honest (the count of living cells that
        fall outside the new bounds) — the predicate already walks that region.
  - [x] Cancel is `autoFocus` and first in DOM order (the destructive-confirm convention
        `<DeleteBattleDialog>` records).
  - [x] Dialog state is **ephemeral local** to `<BattleEditorView>` per forced decision 6; the
        commit goes through the existing `onCommitGrid` prop.

- [x] **Task 5 — Make the live `size` change actually work (AC7)**
  - [x] Trace, then test, the single commit in which `grid` and `size` both change: construction
        effect cleanup → construction → `drawFull(new grid)` → grid effect skips. Assert **one**
        `GridRenderer` construction and **one** `drawFull` per resize, not two.
  - [x] Confirm `GridRendererDimensionMismatchError` is never thrown on the resize path, from
        either `drawFull` or a subsequent `setGridLines` toggle (`resize()` drops `lastGrid`
        precisely so the FR-8.7 toggle cannot throw — that guard is now on a live path).
  - [x] Confirm the stroke policies hold and are **not relitigated**: a resize landing mid-stroke
        discards silently (Story 2.8 forced decision 5 + Story 2.10 decision 2(b), both ratified by
        Sidiar). No toast, no flash.
  - [x] e2e: no `"ResizeObserver loop completed with undelivered notifications."` in any project.

- [x] **Task 6 — Deferred work (AC6)**
  - [x] `:249` — add a fake `ResizeObserver` to `apps/web/vitest.setup.ts` (constructed, callback
        captured, invoked by hand). This unlocks the mid-stroke-re-layout pin **and** both
        `StaticDish`/`EditDish` re-fit paths that are currently e2e-only. ⚠️ Adding it globally
        changes every existing test that relies on `typeof ResizeObserver === 'undefined'` taking
        the early-return branch — check `PetriDishCanvas.test.tsx` and `BattleTile.test.tsx` before
        assuming it is free, and scope it to the files that want it if it is not.
  - [x] `:367` — one-line fix (`const cells = grid.width * grid.height`) or a recorded re-deferral
        with the premise checked against `resizeGrid`'s allocation.
  - [x] `:369` — verify `resizeGrid` hands back a NEW `RenderableGrid` so the stats memo's identity
        key stays sound, and record that as the evidence.
  - [x] `:347` — the `onCommitGrid` identity assertion, in **its own spec file** with
        `vi.mock('./BattleEditorView')` scoped to it (the entry says why it cannot live in
        `BattlePage.test.tsx`).
  - [x] `:75` — validate or re-defer with the premise re-checked: this story's caller passes
        `EditableGridPresetSchema`-shaped literals, so the reachability argument may still hold.
  - [x] `:239` — the mid-stroke scroll fix, or a re-deferral that says why a third sidebar section
        does not change the reachability.
  - [x] Add any NEW entries under a "Deferred from: Story 2-14-edit-mode-grid-resize" heading.

- [x] **Task 7 — Tests (all ACs)** — see *Testing standards summary* for the full list.

- [x] **Task 8 — Verification (the project rule: report actual output, never claim a step ran)**
  - [x] `npm run ci` — the full gate. ⚠️ **Do not pipe it** (`| tail` reports *tail's* status;
        this masked a real `format:check` failure during the Story 1.9 review). Redirect to a file
        and echo `$?`.
  - [x] `npm run bundle:check` — report gzip + headroom for all three routes against AC8. **If
        `/battle` exceeds 310 KB, stop and put forced decision 4 to Sidiar.** Every prior budget
        move in `check-bundle-size.mjs` carries Sidiar's name and date.
  - [x] A local green `ci` is not proof CI is green — check `gh run list` after pushing.

## Dev Notes

### The one thing that makes this story dangerous: four dormant paths go live at once

Everything before this story committed a grid of the **same shape**. Four mechanisms exist solely
for the moment that stops being true, and each carries a comment saying so:

| Path | Where | What it does the first time it runs |
|---|---|---|
| `GridRenderer.resize(newSize)` | `gridRenderer.ts:557` | Recomputes the backing store and layout, **drops** `lastGrid` and `lastColourState`, clears `dirtyCells` |
| Construction effect `[size, …]` | `PetriDishCanvas.tsx:336` | Tears down the retained renderer, discards an in-progress stroke, builds a new renderer, full-repaints |
| `handlePointerDown` dim guard | `PetriDishCanvas.tsx:566` | Refuses a stroke start when `grid` and `size` disagree |
| `GridSnapshot.cols/rows` | `useUndoableGrid.ts:35-39` | Makes undo restore a *differently-shaped* grid |

They are individually correct and were reviewed as such. What has never been checked is that they
compose. The composition hinges on one fact: **`size` is derived from `grid`** and is therefore
never a tick out of step with it (trap 1/2). Break that and the symptom is not a failing unit test
— it is `GridRendererDimensionMismatchError` thrown out of a passive effect, unmounting the editor.

### Where `resizeGrid` lives, and why it is not in `packages/simulation`

`epics.md:776` puts *"pure `resizeGrid` preserves content top-left-anchored, returning new buffers
(AR-17)"* in **Story 3.3**, alongside the typed-array `Grid` and Moore neighbourhood. This story
needs it two epics early, exactly as Story 1.8 needed `RenderableGrid` before `packages/simulation`
existed and Story 2.12 needed `computeEditorGridStats` before the counting layer did.

The precedent is set twice and says the same thing both times:

- `renderableGrid.ts:1-9` — *"Declared in apps/web (not packages/simulation, which does not exist
  yet and does not own this type until 3.3 lands): apps/web already depends on @gol/simulation,
  never the reverse, so building the join here is the only direction that doesn't invert that
  dependency or steal 3.3's design."*
- `gridStats.ts:11-13` — *"Not `lib/canvas/`: counting occupants is not a rendering concern. Not
  `packages/simulation`: that package does not exist yet, and `RenderableGrid` itself lives in
  `apps/web` for the same reason."*

`resizeGrid` operates on `RenderableGrid`, which is an `apps/web` type. Putting it in
`packages/simulation` would either invert the dependency or force that package to declare the type
it does not own until Story 3.3. Follow the precedent, and leave the same comment: Story 3.3 is the
eventual owner, **Story 3.16 (Play-mode ephemeral resize) is the second consumer**, and the anchor
semantics are shared between them (Decision A.3 — top-left for *both* resizes).

### `size` has exactly one source, and this story is why

`BattlePage.tsx:552-564` (Story 2.8 forced decision 4):

> `size` is DERIVED from the grid, not carried separately as `draft.gridSize`. From this story
> dimensions are a property of every undo snapshot, so two sources for one fact would be two things
> that can disagree — **and when 2.14 makes a resize commit a differently-shaped grid, that
> disagreement is `assertGridMatchesSize` throwing `GridRendererDimensionMismatchError` out of the
> canvas's grid effect (unmounting the editor)**, with `handlePointerDown`'s own dimension guard
> silently making the dish unpaintable first.

That comment was written *for* this story. The design it implies is small and complete: **the
resize commits a new grid, and everything else follows.** `size` recomputes from
`grid.width`/`grid.height` in the same render; the canvas reconstructs; `projectBattleForSave`
reads the new dimensions at the next save (AC5); `<GridSettingsSection>`'s facts re-derive from the
same grid.

❌ **Do not add a `gridSize` state cell, a `pendingSize`, or a `draft.gridSize` write.** Any of
those is the second source the comment forbids, and it typechecks.

### What a resize does NOT do

- It does **not** touch `rosterIds` or `sessionRoster`. Clipping a cell can remove an organism's
  last placement, but the roster stays as it is — the prune is a **save-time projection over a
  copy** (Decision H.1, `battleRecord.ts`), and Story 2.13's Dev Agent Record already corrected the
  entry that assumed otherwise. A shrink followed by a save simply prunes more.
- It does **not** touch the palette LUT. `buildRefToFillGroup` is keyed on `rosterIds`, which is
  unchanged, so the `palette` identity is stable and the renderer reconstruction comes from `size`
  alone.
- It does **not** re-seed `<BattlePage>` from anything, refetch, or reset the undo ring.
- It does **not** clear `saveError` (Story 2.13's lifecycle: the message stays true until the next
  save attempt).
- It does **not** persist anything by itself. Persistence is FR-7.8's explicit SAVE (AC5).

### Undo of a resize is already built — verify it, then leave it alone

`useUndoableGrid` snapshots `{ occupant, cols, rows }` and `restore()` rebuilds
`{ width: entry.cols, height: entry.rows, occupant: entry.occupant.slice(), age: new
Uint16Array(entry.cols * entry.rows) }`. That is dimension-restoring undo, complete, with a comment
naming this story. The AC4 work is a **test** that a resize → undo lands the editor back at the old
dimensions *and* the old content, and that the canvas repaints at the old size without throwing.

⚠️ The one genuinely new consequence: **undo now changes `size`**, so the undo path also exercises
the renderer reconstruction (AC7). Test undo-after-resize, not only resize.

### The bundle problem, stated plainly

Story 2.13 measured `/battle` at **301.5 KB gzip against a 310 KB budget — 8.5 KB of headroom**.
Story 1.13 measured the MUI `Dialog` stack's arrival on the home route at **+18.1 KB** (288.2 →
306.3). If this story statically imports `Dialog` into the battle route, the arithmetic does not
work.

This is not a reason to skip the dialog — FR-3.11 requires the warning. It is a reason to **measure
first and decide deliberately** (forced decision 4), and to remember that Story 2.16's
`<UnsavedChangesDialog>` lands on this same route and has the same need. Whatever is chosen here,
2.16 inherits.

⚠️ **The budget is never raised silently.** Both existing raises in `check-bundle-size.mjs` are
annotated with Sidiar's name and the date, and each records the measurement and the
`ceil((measured + 12) / 5) * 5` formula it came from.

### What NOT to build

- ❌ **No second commit seam.** `onCommitGrid` → `handleCommitGrid` → `commitGrid` is the one path
  (`BattleEditorView.tsx:79-82`, `BattlePage.tsx:566-595`). A resize is a commit like any other.
- ❌ **No `setPalette` on `GridRenderer`.** `deferred-work.md:71` closed that question on evidence
  in Story 2.10: a dep change reconstructs the renderer. Reconstruction is the mechanism here too.
- ❌ **No relitigating the mid-stroke policies.** Two are settled and ratified by Sidiar:
  `deferred-work.md:257` (an external `grid` change mid-stroke → **discard, silently** — *"2.14 and
  2.15 implement silent discard and must not relitigate it"*) and `:243` (the construction-effect
  cleanup → **discard properly, via `endStrokeRef.current(false)`** — *"Story 2.14 inherits the
  decision rather than the question"*). The `ResizeObserver` effect's `endStroke(true)` **commit**
  stays as it is: that is a canvas-box change, which does not change grid content.
- ❌ **No Play-mode sizes.** {150×90, 200×120} are Story 3.16's ephemeral expansion and must not
  appear in this control, this schema, or this story's tests (Decision A.2, H-9, FR-4.9).
- ❌ **No zoom control.** The lab mockup's `Grid Zoom` slider is superseded by Decision A.5's
  auto-fit (spec §9.1). It is not this story's control wearing a different name.
- ❌ **No "Reset to Saved" / "Randomize" / Export.** Spec §9.3 — Tools is Story 2.15 and those two
  are excluded from the MVP entirely.
- ❌ **No auto-save on resize.** RFC-006 Decision 8 — auto-save is a default-Disabled toggle,
  Story 6.10.
- ❌ **No settings write.** FR-8.10's "Default Grid Size" applies to **new** battles only; resizing
  this battle must not change the workspace default (PRD `:563`).

### Forced decisions (record the option taken and why in the Dev Agent Record)

1. **Where `resizeGrid` lives.** (a) `apps/web/lib/resizeGrid.ts` — **recommended**; follows the
   `gridStats.ts` precedent exactly ("resizing is not a rendering concern" ⇒ not `lib/canvas/`),
   and comments Story 3.3 as the eventual owner and Story 3.16 as the second consumer.
   (b) `apps/web/lib/canvas/resizeGrid.ts` — sits beside `renderableGrid.ts`, but `gridStats.ts`
   already rejected that reasoning for the same shape of function.
   (c) `packages/simulation` — inverts the type dependency (see *Where `resizeGrid` lives*).
   ⚠️ Whatever is picked, **camelCase, never dotted** (`resizeGrid.ts`).

2. **The form of the preset control.** Spec §9.2 says *"preset-picker style consistent with the
   play sidebar's Grid Size control"*, and that control is a **4-stop detented range slider**
   (`petri-dish-play-mode.html:247-315`, markup `:663-681`). With **two** options a slider is a
   poor control — two positions, no affordance, and awkward for a screen reader.
   (a) **Two `styled('button')` toggles in a `role="radiogroup"`** — **recommended**. Zero new MUI
   imports (the bundle matters here, forced decision 4), an obvious selected state, native keyboard
   semantics. `.tool-btn` (`petri-dish-lab-mode.html:407`) is the mockup's own sidebar button
   idiom to borrow from, and Story 2.15 will use it too.
   (b) A 2-stop slider, literally consistent with the play mockup. Consistent and worse.
   (c) MUI `ToggleButtonGroup` — semantically ideal, another MUI component on the tightest route.
   ⚠️ Record whichever is chosen; §9.2's "preset-picker style" is a hint, not a binding spec, and
   the spec itself says *"UX may want a mockup refresh; not blocking."*

3. **How the clip check is expressed.** (a) A pure `willClipLivingCells(grid, size)` predicate
   beside `resizeGrid` — **recommended**; one walk of the discarded region, and it can return the
   **count** for the dialog copy in the same pass. (b) Resize, then compare `livingCells` before
   and after — two full grid walks and it conflates "clipped" with "was already empty there".

4. **The dialog vs. the 8.5 KB of `/battle` headroom.** ⚠️ **Measure before choosing.**
   (a) Static MUI `Dialog`, and **raise the budget with Sidiar's explicit approval**, recording the
   measurement and the `ceil((measured + 12) / 5) * 5` formula in `check-bundle-size.mjs` the way
   both existing raises do.
   (b) `next/dynamic(() => import('./ResizeClipWarningDialog'), { ssr: false })` — the dialog is
   genuinely rare (only a shrink that clips), the chunk loads on demand, and **Story 2.16's
   `<UnsavedChangesDialog>` shares it**. Costs a loading state the user will never see and one
   `next/dynamic` import this codebase does not yet have. ⚠️ **AR-35 already sanctions this
   shape** — *"per-component imports for tree-shaking; **dynamic import for heavy components**
   (Organism Editor)"* (`epics.md:206`) — so (b) is an established convention arriving early, not a
   new one. It would also give Epic 4's `<OrganismEditorModal>` (spec §3.15, *"lazy editor over the
   mounted page"*) its first working example.
   (c) A hand-rolled `<dialog>` element — cheapest in bytes, but re-solves the focus-trap,
   `inert`, Escape and restore-focus problems `<DeleteBattleDialog>`'s code review already settled
   across four browser engines. ❌ Not recommended.
   **If (a) is chosen, the budget raise is Sidiar's call and the story stops until it is given.**

5. **Where the confirm flow's state lives.** (a) **Ephemeral local in `<BattleEditorView>`** —
   **recommended**, and what spec §3.3's own wiring line says: *"a shrinking resize that would clip
   living cells opens `<ResizeClipWarningDialog>` first, then commits (FR-3.11)."* The view already
   owns `selectedTool` as ephemeral local state (spec §6), and the commit still goes out through
   `onCommitGrid`. (b) `<BattlePage>` — it owns the seam and the lock, but a "pending resize" is
   not persisted, not undoable and not shared with Run mode; putting it there widens the props of
   two components for nothing.

6. **How `<GridSettingsSection>` gets `livingCells`.** (a) **From `<BattleEditorView>`'s existing
   `stats` memo** — **recommended**; one derivation, one pass. (b) A second
   `computeEditorGridStats` call — a second 6,000-cell walk per committed gesture for a number the
   component already holds. (c) Push the derivation up to `<BattlePage>` — contradicts spec §6,
   which assigns it to the view.

### Traps

1. **`totalCells` from the grid, never from a preset.** `grid.width * grid.height` is the single
   truth (the same rule `size` follows). Reading a stored `gridSize` gives a number that is right
   until the first resize and then silently stale for one render.
2. **`size` and `grid` must change in the SAME commit.** They do — `size` is `useMemo` over
   `grid.width`/`grid.height` — but only as long as the resize is a **grid commit**. Anything that
   sets a size first and a grid second (or vice versa) opens a render in which they disagree, and
   `assertGridMatchesSize` throws out of a passive effect. This is trap 1's consequence and the
   single most expensive mistake available in this story.
3. **Reallocate `age` at the new length.** A resize that keeps the old `Uint16Array` leaves a
   buffer whose length no longer matches `width * height`. Nothing in Epic 2 reads `age`, so
   **every test passes** — and Epic 3 then indexes off the end of it. `restore()` already models
   the correct behaviour (`new Uint16Array(entry.cols * entry.rows)`).
4. **`occupant.length` must be exactly `width * height`.** `deferred-work.md:367` exists because
   `computeEditorGridStats` iterates `occupant.length`: an over-allocated or pooled buffer counts
   cells outside the visible grid into `livingCells` and into a per-organism total, silently.
   Do not pool, do not reuse, do not `subarray`.
5. **`.slice()`, never `.subarray()`.** `subarray` returns a **view onto the same buffer** —
   the one-character version of storing the grid by reference. `snapshot()` says so at `:77-82`
   and names 2.14/2.15 as the new commit sources that make it matter.
6. **The clip warning is about LIVING cells.** Shrinking a 100×60 grid whose right half is empty
   discards nothing and must apply silently.
7. **Re-selecting the current preset is a no-op.** Not "a commit that happens to produce an equal
   grid" — an equal-but-new grid still pushes an undo entry and sets `isDirty`, which is a
   user-visible lie. Guard at the control.
8. **The edit lock refuses commits silently.** `handleCommitGrid` returns early while
   `savingRef.current` is true (`BattlePage.tsx:590`). A resize control that is not `disabled`
   during a save produces a click that appears to do nothing. `<BattleNameField disabled={isSaving}>`
   is the established visible half of that lock.
9. **Only two sizes exist in Edit.** `EditableGridPresetSchema` is a `z.union` of two literal
   objects, and `projectBattleForSave` **parses** through it. A third size does not fail at the
   control — it fails at save, three frames later, with a Zod message about `gridSize`.
10. **`toLocaleString()` is locale-dependent.** `(6000).toLocaleString()` is `"6,000"` on `en-US`,
    `"6 000"` on `fr-FR`, `"6.000"` on `de-DE`. A test asserting `"6,000"` passes on the author's
    machine and fails on a runner with a different `LANG` — and Playwright's four projects do not
    all inherit the same one. Pin the locale explicitly or format the separator by hand.
11. **A resize lands on TWO effects, not one.** The construction effect (deps include `size`) and
    the grid effect (dep `grid`) both fire. The construction effect paints and sets
    `paintedGridRef.current = grid`, so the grid effect **skips** — but only because construction
    is declared first (`PetriDishCanvas.tsx:282`, *"declared FIRST so a renderer is already stored
    before the grid / grid-lines effects below run"*). Reordering those two declarations reintroduces
    a double repaint, and only a call-count assertion catches it.
12. **`setGridLines` after a resize.** `resize()` drops `lastGrid` when the shape changed
    (`gridRenderer.ts:576-582`) *"so a grid left behind at the wrong shape turns the FR-8.7 toggle
    into a `GridRendererDimensionMismatchError` thrown out of a UI event handler."* That guard is
    now on a reachable path — toggling grid lines after a resize is a real test.
13. **Cite IDs exactly.** `npm run spec:check` fails the build on an ID that resolves to nothing
    under `docs/planning-artifacts` + `docs/project-context.md`. `AR-17` resolves (it is defined in
    `epics.md:179`). `Decision A`, `FR-3.11`, `FR-3.8`, `FR-7.8`, `RFC-005`, `M4` all resolve.
    `H-9` and `AC3` are **not tokenised** and are silently exempt — they are safe to write but are
    not gate-checked, so get them right by hand.

### Testing standards summary

Vitest + RTL, Playwright, fast-check, vitest-axe. `apps/web` carries **no coverage gate** (a
deliberate counter-metric); the value here is in the invariants, not the percentage.

**Pure (`resizeGrid` / `willClipLivingCells`) — the core of AC2:**
- Grow 50×30 → 100×60: every original cell keeps its `(col, row)`; the new right/bottom region is 0.
- Shrink 100×60 → 50×30: cells inside survive at the same coordinates; cells outside are gone.
- Both buffers are **new** — mutating the result leaves the input byte-identical (the assertion
  `battleRecord.test.ts` and `battleProjection.test.ts` already make for the projection).
- `age` is zero-filled and `occupant.length === width * height` (traps 3, 4).
- `willClipLivingCells` is `false` for any grow, `false` for a shrink over an empty region, `true`
  for a shrink over a single living cell at the boundary — test the **off-by-one** at
  `col === newCols` and `row === newRows`.
- **fast-check properties** (project-context lists "resize anchoring" among the engine invariants):
  anchoring (every cell in the intersection is preserved for arbitrary occupancy), grow-then-shrink
  is identity when nothing clips, and resizing to the same size preserves content exactly.

**Component:**
- `<GridSettingsSection>`: renders all three facts and both presets; the current one is marked
  selected; activating the **other** calls `onResize` once with that preset; activating the
  **current** one calls nothing (trap 7); `disabled` blocks both.
- `<BattleEditorView>`: a grow commits immediately with **no dialog**; a shrink that clips opens
  the dialog and commits **nothing** until confirm; confirm calls `onCommitGrid` **exactly once**
  with a grid of the new dimensions; cancel/Escape calls it **zero** times.
- `<ResizeClipWarningDialog>`: axe-clean; Escape = cancel; focus trapped; focus restored to the
  preset control that opened it.
- `<BattlePage>`: a resize sets `isDirty`; undo restores the previous dimensions **and** content;
  a save after a resize projects the new `gridSize` (AC5, at the unit level).
- `<PetriDishCanvas>`: a `size` change reconstructs the renderer **once** and `drawFull`s **once**
  (trap 11); no `GridRendererDimensionMismatchError` from the resize path or a following
  `setGridLines` toggle (trap 12); with the fake `ResizeObserver` from Task 6, the mid-stroke
  re-layout pin `deferred-work.md:249` asks for.

**E2E (`apps/web/e2e/battleRoute.spec.ts`, the established home for battle-route journeys):**
- Paint at 100×60 → shrink to 50×30 → the warning appears and names the consequence → confirm →
  the dish repaints at the new size → UNDO restores the old size and the painted cells → save →
  reload → the battle opens at the saved size with its cells intact.
- A grow shows **no** dialog.
- Console stays clean in all four Playwright projects — specifically no `ResizeObserver loop`
  warning (this is the assertion that catches an accidental paint↔observe cycle).
- ⚠️ Use `seedWorkspaceIfFresh` (`battleRoute.spec.ts:1033`) for any test that saves and then
  navigates: the shared `seedWorkspace` runs on **every** document load and would wipe the saved
  battle (Story 2.13 Debug Log 2). ⚠️ The `buildSeedPayload`/`seedWorkspace` copies are hand-synced
  across spec files — keep them byte-identical.

**Determinism / hygiene:**
- Never pixel- or snapshot-test the canvas. Test the renderer's brain (call counts, arguments,
  `fillStyle` strings) — the rule `PetriDishCanvas.test.tsx` already follows.
- No test whose only purpose is to raise a number; coverage-padding tests are rejected in review.

## Project Structure Notes

New (exact paths depend on forced decisions 1 and 4):

- `apps/web/lib/resizeGrid.ts` (+ `.test.ts`) — `resizeGrid` and `willClipLivingCells`. Pure; no
  React, no DOM, no repository. Comments must name **Story 3.3** as the eventual owner (AR-17) and
  **Story 3.16** as the second consumer.
- `apps/web/components/battle/GridSettingsSection.tsx` (+ `.test.tsx`) — spec §3.6.
- `apps/web/components/battle/ResizeClipWarningDialog.tsx` (+ `.test.tsx`) — spec §3.15.

Updated:

- `apps/web/components/battle/BattleEditorView.tsx` — the third `<SidebarSection>`, the resize
  handler, the confirm-dialog state, and `totalCells` folded onto the existing `stats` memo.
- `apps/web/components/battle/BattleEditorView.test.tsx` — the grow/shrink/confirm/cancel matrix.
- `apps/web/components/battle/BattlePage.test.tsx` — dirty-on-resize, undo-restores-dimensions.
- `apps/web/components/PetriDishCanvas.test.tsx` — the live `size` change (AC7).
- `apps/web/lib/gridStats.ts` — `deferred-work.md:367`, if fixed.
- `apps/web/vitest.setup.ts` — the fake `ResizeObserver`, if `deferred-work.md:249` is fixed
  globally rather than per-file.
- `apps/web/e2e/battleRoute.spec.ts` — the resize journey.
- `scripts/check-bundle-size.mjs` — **only** with Sidiar's explicit approval (forced decision 4).
- `docs/implementation-artifacts/deferred-work.md` — six entries settled or corrected-and-re-deferred,
  plus any new ones.
- `docs/implementation-artifacts/sprint-status.yaml`.

Likely **not** updated (check the assumption, do not assume the check):

- `apps/web/components/battle/BattlePage.tsx` — the resize needs no new state there; it arrives at
  the existing `handleCommitGrid`. If a change *is* needed, that is a signal the design drifted
  toward a second source for `size` (trap 1/2).
- `apps/web/lib/battleRecord.ts` — AC5 should be a test, not an edit.
- `packages/*` — nothing in this story belongs below the `apps/web` boundary yet.

Conventions that apply and are easy to violate here:

- **Grid dimensions are parameters, never constants.** A literal `100` or `60` outside the preset
  union is a bug — 100×60 is only the *default* (Decision A).
- **No DOM types in `packages/*`** — irrelevant if `resizeGrid` stays in `apps/web`, decisive if it
  does not.
- **Repositories are injected, never imported** (AR-2/27) — nothing in this story touches one.
- **Hot state in refs, never React state** — the dialog's open flag is ephemeral UI state and
  belongs in `useState`; nothing here is hot.
- **No raw hex** (AR-46, a live lint rule on `apps/web`) — the control's selected/hover states are
  `var(--gol-*)` tokens, and a `--gol-danger` warning must sit on `--gol-bg-secondary`, not
  `--gol-bg-hover` (4.48:1, deliberately excluded in `themeTokens.test.ts`).
- **Per-component MUI imports only** (AR-35) — `import Dialog from '@mui/material/Dialog'`, never
  the barrel, and on this route the bundle makes that non-optional.
- **Non-component TS files are camelCase, never dotted**; components are PascalCase `.tsx`.
- Comments explain **why**, not what; cite governing IDs exactly as the specs spell them.
- **Nothing reaches `main` without Sidiar's go-ahead**; a story branch may be pushed, merging is
  Sidiar's call.

## References

- [Source: docs/planning-artifacts/epics.md#Story 2.14: Edit-Mode Grid Resize] — the ACs.
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-17** (*"Typed-array grid
  … pure `resizeGrid` (top-left anchor)"*, `:179`), **AR-30** (`useUndoableGrid`'s ring stores
  occupant **+ dimensions**, ≤180 KB), **AR-2/27** (repository injection), **AR-35** (MUI core only,
  per-component imports), **AR-46** (no raw hex).
- [Source: docs/planning-artifacts/epics.md#Story 3.3: Typed-Array Grid & Neighborhood] — `:776`
  assigns `resizeGrid` to Story 3.3. Read alongside forced decision 1: this story builds it early
  in `apps/web`, exactly as 1.8 did for `RenderableGrid`.
- [Source: docs/planning-artifacts/architecture.md#Decision A] — **A.1** (per-battle `gridSize`),
  **A.2** (the two independent resizes; Edit is persisted + undoable and limited to {50×30, 100×60}),
  **A.3** (*"Top-left anchored … Growing adds empty space to the right and bottom … Shrinking clips
  cells outside the new bounds — in Edit mode this is destructive (warned + undoable)"*),
  **A.5** (auto-fit; the whole grid stays visible and rescales), **A.6** (*"Undo snapshots still
  capture grid dimensions (the 50×30 ↔ 100×60 Edit resize changes them)"*), **A.7** (only
  `initialGrid` is persisted).
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md] — `:211`/`:222`
  (Lab resize is persisted + undoable; Play resize is ephemeral), `:262-266` (`GridSnapshot` carries
  dims; capacity 30 at all sizes), `:263` (*"undo affects only `initialGrid` (placement/erase/Reset/
  **Edit-mode resize**)"*), `:404` (next-step: prototype `resizeGrid` for both paths, verify
  top-left anchor and hard-edge expansion).
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.6 `<GridSettingsSection>`] — the
  component API: `{ gridSize: EditableGridPreset; onResize(preset); stats: { totalCells; livingCells } }`,
  and *"the mockup shows read-only Grid Info; FR-3.11/Decision A added edit-mode resize afterward."*
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3 `<BattleEditorView>`] — the
  internal-wiring line: *"a shrinking resize that would clip living cells opens
  `<ResizeClipWarningDialog>` first, then commits (FR-3.11) — both undoable. Grid facts for
  `<GridSettingsSection>` derive from `grid`."*
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.15 Dialogs & guards] —
  `<ResizeClipWarningDialog>`: *"warn before shrink clips cells; confirm → undoable commit"*, Epic 2.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#4 Hooks] — `useUndoableGrid`'s
  contract: *"commit = paint/erase stroke, Clear, **Edit resize**"*.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#5 Non-React modules] —
  `GridRenderer.resize(size)`: *"re-layout + full repaint (A.5); also serves canvas-size changes."*
- [Source: docs/planning-artifacts/component-tree-battle-page.md#9] — **§9.1** (the mockup's Grid
  Zoom slider is superseded by auto-fit — no zoom control ships), **§9.2** (the resize control lands
  in `<GridSettingsSection>`, *"preset-picker style consistent with the play sidebar's Grid Size
  control … UX may want a mockup refresh; not blocking"*), **§9.3** (Reset-to-Saved / Randomize
  excluded).
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-3.11: Resize Grid (Edit
  Mode)] — the four ACs verbatim: editable sizes only; top-left anchored; *"the system warns before
  discarding cells"*; undoable (FR-3.8) and persisted on save (FR-7.8).
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-3.1 / FR-3.2] — the grid
  facts this section displays, and *"Display updates immediately when the grid is resized."*
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-8.10] — `:563`: the
  default-grid-size setting *"applies only to newly created battles"*. A resize must not write it.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html]
  — Grid Info markup `:709-726`; `.control-group` `:166`, `.control-item` `:172`, `.control-label`
  `:178`, `.control-value` `:185`; `.tool-btn` `:407`; the superseded `.zoom-control` `:818-822`.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode.html]
  — the Grid Size control §9.2 points at: `.speed-control` `:247-315`, markup `:663-681`. **Four**
  presets there, **two** here.
- [Source: docs/implementation-artifacts/deferred-work.md] — the eight entries citing this story:
  `:71` (closed), `:75`, `:239`, **`:243` (a resolved decision this story inherits)**, `:249`,
  **`:257` (a resolved, Sidiar-ratified decision this story inherits)**, `:347`, `:367`, `:369`.
- [Source: docs/implementation-artifacts/2-13-save-battle.md] — the current bundle baseline
  (`/battle` **301.5 KB**, 8.5 KB headroom), the edit-lock (`savingRef`) it added, the
  `seedWorkspaceIfFresh` e2e trap, and the projection comment AC5 is a test of.
- [Source: docs/implementation-artifacts/2-8-undo.md] — forced decision 4 (`size` derived from the
  grid) and forced decision 5 (the mid-stroke discard policy this story inherits).
- [Source: docs/implementation-artifacts/2-12-editor-status-bar-stats.md] — the `stats` memo AC1
  feeds from, and the ref/id de-duplication traps that come with it.
- [Source: docs/project-context.md] — auto-loaded; **"grid dimensions are parameters, never
  constants"**, the editable/persisted `{50×30, 100×60}` bound, "hot state in refs", the
  no-second-source rule, AR-46, the `spec:check` gate, the pipe-swallowed-exit-code warning, the
  commit gate, and the verification rules all apply unchanged.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Opus 5)

### Debug Log References

1. **The bundle question, settled by measurement rather than by argument (forced decision 4).**
   Three builds of the same tree, `npm run bundle:check` each time:
   | Variant | `/battle` gzip | Verdict |
   |---|---|---|
   | Static `import ResizeClipWarningDialog` | **320.8 KB** | ✖ **over the 310 KB budget by 10.8 KB** |
   | `React.lazy` + `<Suspense fallback={null}>` | 303.0 KB | ✓ 7.0 KB headroom |
   | **`next/dynamic(…, { ssr: false })`** (shipped) | **304.1 KB** | ✓ 5.9 KB headroom |
   The story predicted the hard stop and it is real: option (a) does not fit, so it would have
   required Sidiar's budget raise and the story would have stopped. Option (b) was taken.
   `next/dynamic` over bare `React.lazy` costs ~1 KB and buys the convention AR-35 names by name
   plus the Suspense boundary it manages itself — a route with 6 KB of headroom either way is not
   where that KB should be spent on a deviation. **No budget was raised.**

2. **The home route grew 2.7 KB and this story only partly caused it.** `/` went 326.8 → 329.5 KB
   (0.5 KB headroom against 330). Measured: the STATIC-import build put `/` at 328.9 KB, i.e. ~2.1
   KB appears on a route that imports none of this story's code and is a chunk-splitting side
   effect of adding modules to the graph at all; only ~0.6 KB is the `next/dynamic` boundary.
   Recorded in `deferred-work.md` as a decision for Sidiar (raise to 340, or put
   `<DeleteBattleDialog>` behind the same `next/dynamic` shape this story just proved) rather than
   acted on unilaterally. **Resolved 2026-08-31: Sidiar raised the home budget 330 -> 340 KB**
   (`check-bundle-size.mjs`), leaving 10.5 KB headroom. Worth knowing for the next raise: the
   standing `ceil((measured + 12) / 5) * 5` formula gives **345**, not 340 — the 340 figure
   originated as an arithmetic slip in the deferred-work entry, and Sidiar then chose it
   deliberately. The `<DeleteBattleDialog>` option is untaken and still the better lever if the
   home route needs real relief rather than a larger number.

3. **`deferred-work.md:75`'s premise was wrong, and this story is the evidence.** The entry says
   2.14 is "the first story to call `resize()` with a genuinely new size". It is not, and no such
   story exists: `size` is one of `EditDish`'s three CONSTRUCTION dependencies, so a
   grid-dimension change tears the renderer down and builds a new one — `GridRenderer.resize()` is
   never reached. Asserted directly rather than argued: `PetriDishCanvas.test.tsx`'s "reconstructs
   the renderer ONCE and full-repaints ONCE" carries `expect(resize).not.toHaveBeenCalled()`.
   Re-deferred with the premise corrected and re-pointed at Story 3.16.

4. **Three existing test suites needed re-scoping, not fixing.** "Living Cells" now renders in two
   places by the mockup's own design, so `getByRole('group', { name: /Living Cells: N/ })` became
   genuinely AMBIGUOUS in `BattleEditorView.test.tsx` (×3) and `BattlePage.test.tsx` (×3, via its
   `livingCells()` helper). All six are now scoped to the status bar's own named region rather
   than relaxed to `getAllBy`. `BattlePage.test.tsx`'s 255-organism-cap test was scoped to the cap
   NOTICE for the same reason (a 255-organism roster puts a bare "255" in Grid Info too).

5. **Two e2e traps, both from the dialog rather than from the resize.** (a) Playwright's `.check()`
   asserts the control ENDED UP checked, which is exactly what a shrink that opens the warning must
   not do — it fails against correct code on every clipping path, so every preset activation uses
   `.click()`, with a comment saying why. (b) While the dialog is open the editor is genuinely
   `inert` and `aria-hidden` (`useInertBackground` + MUI's `ariaHiddenSiblings`), so the Grid Info
   fact is not queryable from behind it; the "nothing has changed yet" half is asserted on the
   cancel path instead, and the inertness itself is now the assertion in its place.

6. **Two fixtures initially passed for the wrong reason and were rebuilt.** `<BattleEditorView>`'s
   shrink tests used small ad-hoc grids, where "shrinking to 50 × 30" is a GROW on both axes and
   can never clip; and the mock workspace's own 100 × 60 battle places its roster centrally, so
   shrinking it clips nothing. Both now use a 100 × 60 grid with a deliberate far-corner cell.

7. **WebKit needed EXPLICIT focus restoration, exactly as `<DeleteBattleDialog>` predicted.** The
   dialog first shipped relying on MUI's default restore-to-trigger, on the reasoning that — unlike
   the delete dialog — the trigger is still mounted on every close path. That is true and still not
   enough: MUI restores to whatever `document.activeElement` was at OPEN time, and WebKit does not
   focus a non-text form control on click, so `activeElement` is `<body>` and the restore
   faithfully puts focus there. Caught by `battleRoute.spec.ts`'s cancel test on the **webkit and
   tablet projects only** — chromium and firefox were green throughout. Fixed with
   `disableRestoreFocus` plus the same `restoreFocusPresetRef` + post-exit effect shape
   `useDeleteBattleDialog` uses, resolving the target by a `data-grid-preset` DOM lookup rather
   than a captured element.

8. **The axe scan landed mid-transition on WebKit, at 93 violations.** With only
   `toBeVisible()` before the scan, axe measured the confirm button at **1.89:1** (`#361019` on
   `#8c1e39`) and the body text at **2.67:1** — blended, transitional colours, not any settled
   state. Fixed by adopting `deleteBattle.spec.ts`'s three-wait pattern verbatim (visible →
   `opacity: 1` → 300ms), because MUI `Button`'s own root colour transition is unsynchronised with
   the Dialog's Fade. Same family as the `--gol-accent` cross-fade findings that cost SAVE and UNDO
   their transitions in Story 2.13 — which is why neither the preset option nor this dialog has a
   `transition` of its own.

9. **Mutation checks run on the three assertions that had to be falsifiable.** Adding `isDirty` to
   `handleCommitGrid`'s dep list reddens both `BattlePage.commitSeam.test.tsx` tests (and leaves
   `BattlePage.test.tsx`'s outward-consequence test green — which is the whole reason the new file
   exists). Deleting the `endStrokeRef.current(true)` line in the `ResizeObserver` callback reddens
   the mid-stroke re-layout pin. Reverting `gridStats.ts`'s loop bound reddens the new
   over-allocation test.

### Completion Notes List

**Forced decisions taken**

| # | Option | Why |
|---|---|---|
| 1 — where `resizeGrid` lives | **(a) `apps/web/lib/resizeGrid.ts`** | Follows `gridStats.ts` verbatim ("re-anchoring an occupant map is not a rendering concern" ⇒ not `lib/canvas/`; `packages/simulation` does not exist and does not own `RenderableGrid` until 3.3). The module comment names **Story 3.3** as the eventual owner and **Story 3.16** as the second consumer, with Decision A.3's shared top-left anchor. |
| 2 — the preset control | **(a), with NATIVE radios** | Two `role="radio"` buttons in a `role="radiogroup"` was the recommendation; native `<input type="radio">` keeps every stated benefit (zero new MUI imports on the tightest route, an obvious selected state) and adds two the hand-rolled version would have to re-implement: arrow-key navigation within the group, and an already-checked radio firing **no change event at all** — trap 7's no-op enforced by the platform rather than by a guard someone can delete. ❌ Not §9.2's 2-stop slider. |
| 3 — the clip check | **(a) a pure predicate** | `countClippedLivingCells` walks the discarded region once and returns the COUNT the dialog copy quotes; `willClipLivingCells` delegates. Growing visits no cells and returns 0 by construction, which makes "growing never warns" arithmetic rather than a branch. |
| 4 — the dialog vs. the budget | **(b) `next/dynamic`** | See Debug Log 1. Measured before choosing; (a) genuinely does not fit. |
| 5 — the confirm flow's state | **(a) ephemeral local in `<BattleEditorView>`** | Where spec §3.3's own wiring line puts it, beside the `selectedTool` cell §6 already assigns there. Two cells (`pendingResize` + `resizeDialogOpen`), not one, for `useDeleteBattleDialog`'s reason: the dialog has three phases and clearing the copy at close time renders a blank sentence mid-fade. |
| 6 — `livingCells` for Grid Info | **(a) the existing `stats` memo** | One derivation, one pass. `totalCells` is `grid.width * grid.height` at the call site — from the GRID, never a stored `gridSize` (trap 1). |

**Two recorded deviations from the specs** (both in `deferred-work.md` too, neither silent):

- `<GridSettingsSection>`'s `gridSize` prop is `{ cols: number; rows: number }` where §3.6 types it
  `EditableGridPreset` — the DISPLAY reads the live grid; the WRITE (`onResize(preset)`) is
  schema-shaped exactly as §3.6 says. Narrowing the display side would mean parsing, in a render
  path, a value already validated at load and re-validated at save.
- The preset option's focus ring is `:focus-within`, not `&:has(input:focus-visible)`. `:has()`
  shipped in Firefox 121; NFR-2.1's floor is Firefox 112, so a `:has()` ring is absent for nine
  Firefox versions — a keyboard user with no focus indicator. Selected state is driven by a
  `data-selected` attribute for the same reason.

**Acceptance criteria**

| AC | Evidence |
|---|---|
| AC1 — Grid Info section | `<GridSettingsSection>` mounts as the **third** `<SidebarSection>`; three fact rows + the two-preset control. `BattleEditorView.test.tsx` asserts the heading ORDER `['Organisms','Battle Name','Grid Info']`; `GridSettingsSection.test.tsx` (10 tests) covers the facts, the presets and the locale-pinned separator. |
| AC2 — top-left anchoring | `resizeGrid` + `resizeGrid.test.ts` (21 tests: 15 examples + 6 fast-check properties — anchoring, hard-edge fill, buffer lengths, same-size identity of content, grow-then-shrink round trip, clip ≤ population). Both buffers new; `age` reallocated zero-filled; `occupant.length === cols * rows`. |
| AC3 — warn before a clipping shrink | `<ResizeClipWarningDialog>` (9 tests), the `<BattleEditorView>` matrix (grow / empty-region shrink / clipping shrink / confirm / cancel / Escape), and the e2e journey. A shrink over an empty region applies **silently**; a grow never warns. |
| AC4 — ONE undoable commit, marks dirty | One `onCommitGrid` call asserted by count. `BattlePage.test.tsx` asserts `data-dirty` flips, UNDO becomes enabled exactly once, and undo restores **both** dimensions and content. Re-selecting the current preset is a no-op at the control AND at the handler. |
| AC5 — the new size persists | A **test, not an edit** — `battleRecord.ts` is untouched, and its comment ("`gridSize` comes from the LIVE grid … Story 2.14's resize then needs no change here") is correct. `BattlePage.test.tsx` asserts the saved record's `gridSize` and `gridState` shape; the e2e proves the whole round trip through the store and back in via the Gallery. |
| AC6 — the six inherited entries | All six settled with evidence: `:249` **fixed**, `:347` **fixed**, `:367` **fixed**, `:369` **closed on evidence**, `:75` and `:239` **re-deferred with their premises corrected against the code as it stands** and re-pointed at named stories. Five NEW entries recorded. |
| AC7 — the canvas survives a live `size` change | `PetriDishCanvas.test.tsx`'s new describe: ONE reconstruction (counted via `getContext`), ONE `drawFull` (trap 11), `resize()` NOT called, no dimension mismatch in either direction, an FR-8.7 toggle right after a resize (trap 12), and the mid-stroke silent discard with capture released (the inherited policy, not relitigated). e2e asserts no `ResizeObserver loop` warning. |
| AC8 — keyboard, axe, bundle | Dialog: Escape = Cancel, focus trapped, Cancel `autoFocus` and first in DOM order, axe-clean. Control: one tab stop landing on the checked member, arrow keys move within the group, a visible ring, selection carried by border + weight + a ✓ glyph as well as the native checked state. Bundle re-measured — see below. |

**What was deliberately NOT built**: no second commit seam; no `gridSize`/`pendingSize`/`draft.gridSize`
state (trap 1/2); no `setPalette`; no relitigating the two ratified mid-stroke policies; no
Play-mode sizes; no zoom control; no Reset-to-Saved / Randomize; no auto-save; no settings write;
no change to `battleRecord.ts` or `<BattlePage>`.

**Verification** (actual output, `npm run ci` unpiped with `$?` echoed):

| Step | Result |
|---|---|
| `npm run ci` (redirected to a file, `$?` echoed — never piped) | ✅ **exit 0** — typecheck → lint → format:check → spec:check → test:coverage → build:standalone → bundle:check → e2e, all green |
| unit/component | ✅ **52 files, 839 tests passed** (`apps/web`), plus `@gol/domain` 6, `@gol/persistence` 7, `@gol/test-utils` 5 |
| e2e | ✅ **268 passed, 4 skipped**, across all four Playwright projects (chromium, firefox, webkit, tablet) |
| `npm run bundle:check` | `/` **329.5 KB** gzip (10.5 KB headroom, budget 340 — raised from 330 by Sidiar 2026-08-31, after the run below measured 0.5 KB against the old budget) · `/battle` **304.1 KB** (5.9 KB, budget 310) · `/battle/new` **304.1 KB** (5.9 KB, budget 310). The `/battle` budget was **not** raised — see Debug Log 1 and 2. |
| `npm run spec:check` | ✅ all 161 cited ids resolve; 3/6 reconciliation citations resolve |

⚠️ A local green `ci` is not proof CI is green — check `gh run list` after the push.

### File List

**New**

- `apps/web/lib/resizeGrid.ts`
- `apps/web/lib/resizeGrid.test.ts`
- `apps/web/components/battle/GridSettingsSection.tsx`
- `apps/web/components/battle/GridSettingsSection.test.tsx`
- `apps/web/components/battle/ResizeClipWarningDialog.tsx`
- `apps/web/components/battle/ResizeClipWarningDialog.test.tsx`
- `apps/web/components/battle/BattlePage.commitSeam.test.tsx`

**Modified**

- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/PetriDishCanvas.test.tsx`
- `apps/web/lib/gridStats.ts`
- `apps/web/lib/gridStats.test.ts`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/2-14-edit-mode-grid-resize.md`

**Deliberately unchanged** (the assumption was checked, not assumed): `apps/web/components/battle/BattlePage.tsx`,
`apps/web/lib/battleRecord.ts`, `apps/web/vitest.setup.ts`, `scripts/check-bundle-size.mjs`, `packages/*`.

### Change Log

| Date | Change |
|---|---|
| 2026-08-29 | Story 2.14 implemented: `resizeGrid`/`countClippedLivingCells`, `<GridSettingsSection>`, `<ResizeClipWarningDialog>` behind `next/dynamic`, the confirm flow in `<BattleEditorView>`, six deferred-work entries settled, five new ones recorded. No bundle budget raised. Status → review. |

Dev Model: opus   # establishes AR-17's `resizeGrid` primitive (Story 3.3/3.16 inherit it) and settles the dialog/bundle strategy Story 2.16 reuses

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 23s | 24 | 2,424 | 15,533 | 483,542 | 501,523 |
| Step 1 — create-story | opus-5 | 1 | 10m 50s | 252 | 36,888 | 607,572 | 14,480,597 | 15,125,309 |
| Step 2 — dev-story | opus-5 | 1 | 38m 16s | 446 | 83,109 | 607,509 | 46,332,619 | 47,023,683 |
| Step 3 — code review + PR | sonnet-5 | 4 | 35m 19s | 866 | 48,852 | 2,388,826 | 48,085,026 | 50,523,570 |
| _of which the orchestrator_ | opus-5 | — | — | 104 | 16,590 | 63,785 | 2,772,232 | 2,852,711 |
| **Total (create-story → PR ready)** | | 6 | **1h 24m** | 1,588 | 171,273 | 3,619,440 | 109,381,784 | **113,174,085** |

Run started 2026-08-29 18:24 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
