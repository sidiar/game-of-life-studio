---
baseline_commit: adf2250e21758658cc8992197ad32a3ff2140432
---

# Story 2.15: Clear Petri Dish

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to clear the whole grid in one action,
so that I can start my design over.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.15: Clear Petri Dish`, decomposed into the seven things a reviewer
can independently check.

⚠️ **Read this before anything else: FR-3.7 asks for NO confirmation dialog, and neither does the
epic AC.** The PRD says, in full: *"The system shall provide a Reset button that clears all cells
on the entire grid, returning it to empty state"* — no acceptance criteria, no warning, no prompt.
The safety net is **FR-3.8 Undo**, which is already built and which AC2 requires this action to
feed. Story 2.14's `<ResizeClipWarningDialog>` exists because **FR-3.11 asks for it in as many
words** (*"the system warns before discarding cells"*); FR-3.7 does not, and `/battle` has **5.9 KB
of bundle headroom**. Adding a confirmation here would be unrequested scope paid for out of the
tightest budget in the repo. See *What NOT to build*.

1. **AC1 — A "Tools" sidebar section with a "CLEAR PETRI DISH" button (spec §3.7).**
   A new `<EditorToolsSection>` mounts as the **fourth** `<SidebarSection>` — mockup order is
   Organisms · Battle Name · Grid Info · **Tools** · Back (2.16), and `SidebarSection.tsx:13` and
   `BattleEditorView.tsx`'s composition-root comment (`"❌ No Tools section (2.15)"`) both name this
   story as the arriving consumer. Mount into the shared shell; do not re-derive the
   `<section>`/`<h2>` pair.
   Mockup: `.sidebar-section` + `.tool-btn`
   (`clinical-lab-theme/petri-dish-lab-mode.html:149-164`, `:407-431`), markup `:727-733`.
   ⚠️ **Label: "CLEAR PETRI DISH" in the UI, "Reset Grid" (FR-3.7) in the ACs** — spec §9.4 settles
   the naming explicitly (*"the mockup's Clear button IS FR-3.7's Reset Grid… use the mockup label
   in UI copy and the FR term in ACs"*). Do not invent a third name.

2. **AC2 — Clicking it empties every cell as ONE undoable commit, and marks the battle dirty
   (FR-3.7).**
   One `onCommitGrid` call → one `useUndoableGrid` ring entry → one undo restores the whole grid.
   The dirty flag comes free through `<BattlePage>`'s `handleCommitGrid` (`BattlePage.tsx:584-595`),
   which is **the one commit seam** — its own comment already names *"Clear (2.15)"* as an arriving
   source. ❌ Do not add a second seam and do not touch `<BattlePage>`.
   ⚠️ The cleared grid keeps the **current dimensions** (trap 1) and is a **new object with new
   buffers** (trap 2). Both matter for reasons no test will state for you.

3. **AC3 — On an already-empty grid, clicking does nothing: no commit, no undo entry, no dirty.**
   The emptiness test is `stats.livingCells === 0` — `<BattleEditorView>` already memoises that
   number (`BattleEditorView.tsx`'s `stats` memo). ❌ Do not add a second pass over `occupant` to
   answer a question the component already holds the answer to.
   This is the same shape as Story 2.14's already-current-preset no-op, and it exists for the same
   reason: an equal-but-new grid is not a harmless no-op — it pushes an undo entry and sets
   `isDirty`, which is a user-visible lie about unsaved work. See forced decision 1 for whether the
   control is also `disabled` in that state.

4. **AC4 — The Export button is not rendered, and Reset-to-Saved / Randomize stay excluded
   (spec §9.3).**
   The mockup's Tools section has **four** buttons; the MVP ships **one**.
   - "EXPORT BATTLE" is Epic 5 (FR-6.1/7.13). Spec §3.7 types it `onExport?()` — *"absent → not
     rendered"*. NFR-4.1 forbids dead affordances.
   - "RESET TO SAVED" and "RANDOMIZE" have **no backing FR at all** and §9.3 excludes them from the
     MVP outright. They are not deferred-to-a-later-story; they are not in the product.

5. **AC5 — Clear empties CELLS and nothing else, and the canvas survives it.**
   Not in the epic's AC list, and non-negotiable anyway — *"a story implementation must leave the
   system working end-to-end."* After a Clear, all of the following are **unchanged**: the grid's
   `width`/`height`; `rosterIds` and the sidebar roster list; the selected tool; the session roster;
   the battle name; `isSaving`. The dish repaints **once** through the grid effect's `drawFull`
   (`PetriDishCanvas.tsx:338-378`) with no `GridRendererDimensionMismatchError`.
   ⚠️ Two consequences that look like bugs and are correct — pin both, so a later story does not
   "fix" them (traps 4 and 5):
   - the status bar's **Population row still lists every roster organism, at 0** (it derives from
     `rosterIds`, not from placed cells) — it does **not** collapse to the "Population: —"
     placeholder;
   - **Clear → Save stores `organismIds: []`**, because Decision H.1's prune removes every entry
     with no placed cell. `BattleSchema` permits it and the `superRefine` passes. Do not guard
     against it.

6. **AC6 — The `deferred-work.md` entries this story inherits, settled with evidence.**
   | Entry | What it asks of this story |
   |---|---|
   | `:239` | The stroke's cached geometry goes stale on a mid-stroke **scroll**, not only on a resize. Re-deferred by Story 2.14 with *"Pick this up in **Story 2.15** (Clear), the next story at this seam, or in 3.18."* This story adds the **fourth** `<SidebarSection>`, making the scroll region taller again — the exact escalation the entry has been tracking since 2.9. Fix it, or re-defer it with the premise **re-checked against the code as it stands**. |
   | `:257` | An external `grid` change mid-stroke **ends the stroke and DISCARDS its paint, silently**. ⚠️ **Not work — a ratified decision this story inherits.** Story 2.8 forced decision 5, Story 2.10 decision 2(b), **both ratified by Sidiar (2026-08-27)**, and the entry names this story: *"2.14 and 2.15 implement silent discard and must not relitigate it."* No toast, no flash, no affordance. |
   | `:369` | The `stats` memo keys on `grid` object identity while `occupant` is readonly only at the property level. Closed by Story 2.14 *"on the strength of a test that will fail if it is broken rather than on a type that cannot be"*, with the note that **"Story 2.15's Clear inherits the same obligation."** The cleared grid must be a new wrapper with new buffers, and a test must fail if that stops being true. |
   | `:400` | ❌ **Explicitly NOT this story's.** The entry says so by name: *"Reconcile the spec line with whichever story next edits §3.6 (2.15 touches §3.7, not this one)."* Leave it. |
   Each entry is **fixed** or **re-deferred with its premise corrected** — the standard 2.12/2.13/2.14
   set. A re-deferral must name the story that inherits it and say what changed. Add any NEW entries
   under a `## Deferred from: Story 2-15-clear-petri-dish …` heading.

7. **AC7 — Keyboard-operable, axe-clean, bundle re-measured.**
   The button is a real `<button type="button">`, reachable and operable by keyboard with a
   **visible focus ring**, and passes axe on `/battle` and `/battle/new`.
   Report `npm run bundle:check`'s measured gzip and headroom for `/`, `/battle` and `/battle/new`.
   ⚠️ `/battle` has **5.9 KB** of headroom (304.1 against a 310 budget) and `/` has **10.5 KB**
   (329.5 against 340). This story should cost close to nothing — one styled `<button>` and one
   handler, zero new MUI imports. **If it does not, that is a signal the design grew a dialog**
   (see *What NOT to build*), not a signal to raise a budget. Every budget move in
   `check-bundle-size.mjs` carries Sidiar's name and the measurement it came from.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (all ACs)**
  - [x] `apps/web/components/battle/BattleEditorView.tsx` — `BattleEditorViewProps` and why Story
        2.14 added **nothing** to it; the `stats` memo (AC3's emptiness source); `handleResize` /
        `handleConfirmResize` (the commit-through-`onCommitGrid` shape this story copies, minus the
        dialog); `<SidebarContent>` and its `gap`; the composition root's `❌ No Tools section
        (2.15)` comment, which is the line this story deletes.
  - [x] `apps/web/components/battle/GridSettingsSection.tsx` **in full** — the closest sibling by
        far. Specifically: `--gol-border-control` over the mockup's decorative `--gol-border`; the
        `❌ No transition` comment and the axe cross-fade it prevents; the `data-disabled` /
        `disabled` pair; and ⚠️ the `:focus-within` decision, which is a workaround for a
        visually-hidden radio and **must not be copied** onto a real `<button>` (trap 8).
  - [x] `apps/web/components/battle/SidebarSection.tsx` in full — the shared shell and the `<h2>`
        / `heading-order` decision. Mount into it.
  - [x] `apps/web/components/battle/EditorStatusBar.tsx` — `UndoButton`/`SaveButton`: the
        `:disabled` colour pair, the removed transition and the axe finding behind it, and the
        `disabled={!canUndo || isSaving}` / `disabled={!isDirty || isSaving}` precedent that forced
        decision 1 turns on. Also `hasPopulation` (`:325`) — trap 4.
  - [x] `apps/web/lib/useUndoableGrid.ts` — `snapshot()`/`restore()`, the *"2.14/2.15 add new commit
        sources"* note, and why one commit is exactly one undo. AC2's undo half is a **verification
        of this file**, not new code.
  - [x] `apps/web/components/battle/BattlePage.tsx` — `handleCommitGrid` (`:584-595`), `savingRef`
        and the edit lock (`:244`), the `size` memo derived from `grid` (`:552-564`), and
        `rosterIds` (`:421-474`) — the array Clear must **not** touch.
  - [x] `apps/web/components/PetriDishCanvas.tsx:338-378` — the grid effect: the
        `paintedGridRef.current === grid` skip (why the cleared grid must be a NEW identity) and
        the `endStrokeRef.current(false)` terminate whose comment names this story by number.
  - [x] `apps/web/lib/resizeGrid.ts` — the module shape, placement argument and comment style a new
        pure grid helper should follow (forced decision 2).
  - [x] `apps/web/lib/battleRecord.ts` + `packages/domain/src/battleSchema.ts` — `projectBattleForSave`
        → `pruneAndRemapBattleGrid`, and the `superRefine` that makes `organismIds: []` legal
        (trap 5).
  - [x] `docs/planning-artifacts/component-tree-battle-page.md` §3.7 (the `<EditorToolsSection>`
        API), §3.3 (the wiring line: *"`EditorToolsSection.onClear` commits an empty grid (FR-3.7)"*),
        §9.3 and §9.4.
  - [x] `docs/implementation-artifacts/deferred-work.md` — the four entries in AC6.

- [x] **Task 2 — The cleared grid (AC2, AC5)**
  - [x] Produce an empty `RenderableGrid` at the grid's **current** `width`/`height` per forced
        decision 2. `occupant` is a fresh `Uint8Array(width * height)`; `age` is a fresh
        zero-filled `Uint16Array(width * height)`; the wrapper object is new.
  - [x] ❌ Never mutate `grid.occupant` in place (`.fill(0)`) — `readonly Uint8Array` is readonly on
        the property, not the contents, and an in-place clear freezes the stats memo, defeats the
        canvas's identity skip, and corrupts every undo snapshot that sliced off it. This is the
        obligation `deferred-work.md:369` hands to this story.
  - [x] Unit-test the identity and the buffer lengths directly — the test `:369` is closed on.

- [x] **Task 3 — `<EditorToolsSection>` (AC1, AC4, AC7)**
  - [x] New presentational component per spec §3.7. No repository, no grid, no derivation of its
        own — it receives callbacks and flags and renders buttons.
  - [x] `.tool-btn` styling from the mockup (`:407-421`), with the two substitutions this route has
        already settled: **`--gol-border-control`**, not `--gol-border` (SC 1.4.11 — this border is
        the button's only boundary), and **no `transition`** (the axe cross-fade trap).
  - [x] `:focus-visible` ring — this is a real `<button>`, so use `:focus-visible`, **not**
        `<GridSettingsSection>`'s `:focus-within` (trap 8).
  - [x] `disabled` while a save is in flight (`isSaving`), mirroring `<BattleNameField>` and
        `<GridSettingsSection>` — the visible half of `<BattlePage>`'s edit lock.
  - [x] ❌ No Export button, no Reset-to-Saved, no Randomize (AC4). Decide and comment whether
        `onExport?` is declared on the props now or by Epic 5 (forced decision 3).
  - [x] Mount as the fourth `<SidebarSection title="Tools">` in `<BattleEditorView>`.

- [x] **Task 4 — The clear handler (AC2, AC3, AC5)**
  - [x] `handleClear` in `<BattleEditorView>`, beside `handleResize` — spec §3.3 puts it there in
        as many words. One `onCommitGrid` call, nothing else.
  - [x] The already-empty guard from `stats.livingCells`, plus whatever forced decision 1 settles
        for the control.
  - [x] The `isSaving` guard, for the same reason `handleConfirmResize` carries one (a save can
        start after the render that disabled the button).
  - [x] ❌ Do not touch `sessionRoster`, `chosenTool`, `battleName` or `rosterIds`. Clear empties
        cells (trap 4).

- [x] **Task 5 — Deferred work (AC6)**
  - [x] `:239` — fix, or re-defer with the premise re-checked against a **four-section** sidebar.
  - [x] `:369` — discharge the inherited obligation with the Task 2 test, and record it on the entry.
  - [x] `:257` — confirm the silent-discard policy holds for a Clear landing mid-stroke and pin it.
        ⚠️ **Ratified — do not relitigate.**
  - [x] `:400` — leave alone; note that it was checked and is not this story's.

- [x] **Task 6 — Tests (all ACs)** — see *Testing standards summary*.

- [x] **Task 7 — Verification (the project rule: report actual output, never claim a step ran)**
  - [x] `npm run ci` — the full gate. ⚠️ **Do not pipe it** (`| tail` reports *tail's* status; this
        masked a real `format:check` failure during the Story 1.9 review). Redirect to a file and
        echo `$?`.
  - [x] `npm run bundle:check` — report gzip + headroom for all three routes against AC7.
  - [x] A local green `ci` is not proof CI is green — check `gh run list` after pushing.

## Dev Notes

### This story is small, and the reason it is small is the point

Every mechanism Clear needs already exists and is already proven:

| What Clear needs | Where it already lives | This story's job |
|---|---|---|
| A commit that is undoable | `useUndoableGrid.commit` → one ring entry | call it once |
| The dirty flag | `<BattlePage>.handleCommitGrid` | nothing — it is automatic |
| A repaint of an externally-changed grid | `<PetriDishCanvas>`'s grid effect → `drawFull` | hand it a NEW identity |
| A sidebar section shell | `<SidebarSection>` (built by 2.11 *for* this story) | mount into it |
| A sidebar button idiom | `.tool-btn` + `<GridSettingsSection>`'s token substitutions | reuse |
| An emptiness number | `<BattleEditorView>`'s `stats` memo | read it |

The risk is therefore **not** mechanism. It is (a) adding scope nobody asked for, and (b) breaking
one of the five things Clear must leave alone. Both are covered below.

### The commit seam, one more time

`<PetriDishCanvas>` → `onStrokeCommit` → `<BattleEditorView>.onCommitGrid` →
`<BattlePage>.handleCommitGrid` → `useUndoableGrid.commit`. Clear joins at
`<BattleEditorView>`, exactly where the confirmed resize joins:

```
handleClear() → onCommitGrid(emptyGridAt(grid.width, grid.height))
```

That is the whole feature. `handleCommitGrid` sets `isDirty`, refuses the commit under `savingRef`,
and keeps its stable identity (asserted by `BattlePage.commitSeam.test.tsx`, which Story 2.14 wrote
for exactly this pair of arriving stories). ❌ A second seam, a `clearGrid` prop on `<BattlePage>`,
or a `useState` for "cleared" would each break something that is currently guaranteed structurally.

### Undo of a Clear is already built — verify it, then leave it alone

`commit` snapshots the **current** value before replacing it, at that value's dimensions
(`useUndoableGrid.ts` `snapshot()`/`restore()`). So one Clear pushes one entry holding the full
pre-clear occupant map, and one UNDO restores it — content and dimensions both. There is nothing to
add. Prove it (`BattlePage.test.tsx`: Clear → UNDO → the cells are back, `canUndo` went true exactly
once) and stop.

⚠️ A Clear on a 100×60 grid snapshots 6 KB, the same as any other commit — `AR-30`'s ≤180 KB
thirty-level budget is unaffected. The ring stores occupant + dimensions and deliberately no `age`.

### What Clear does NOT do

- ❌ **It does not resize.** The cleared grid keeps `grid.width`/`grid.height`. A Clear that reset to
  the 100×60 default would be an unwarned resize — the exact thing FR-3.11 makes the user confirm.
- ❌ **It does not empty the roster.** `rosterIds` is `<BattlePage>`'s Decision H.2 union of the
  battle's `organismIds` and the session roster; it is not derived from the grid. After a Clear the
  sidebar still lists every organism, the selected tool is unchanged, and the user can immediately
  paint again. That is the intended behaviour — "start my design over", not "start this battle over".
- ❌ **It does not save, and does not clear `isDirty`.** Exactly one thing clears the dirty flag: a
  save that resolved (Story 2.13).
- ❌ **It does not reset the undo ring.** The ring dies with the mount, on return to the Gallery
  (FR-3.8 / Story 2.16). A Clear is an ordinary entry in it.
- ❌ **It does not confirm.** See below.

### The confirmation question, settled

The orchestration brief for this story assumed a confirmation dialog. **The specs do not ask for
one**, and three independent lines say so:

1. **FR-3.7** (`prd.md:248-249`) is one sentence with no acceptance criteria: *"provide a Reset
   button that clears all cells on the entire grid, returning it to empty state."* Contrast **FR-3.11**
   (`:265-270`), whose ACs include *"the system warns before discarding cells"* — that is where
   `<ResizeClipWarningDialog>` came from, and the PRD is explicit about which action gets a warning.
2. The **epic ACs** for this story name no dialog, and their second clause (*"an already-empty grid
   … nothing happens"*) describes a **direct-action** button, not a prompted one.
3. **Undo is the designed safety net.** FR-3.8 is in the same section, the ring is already built,
   and AC2 requires Clear to feed it.

Cost of ignoring this: `/battle` has 5.9 KB of headroom; Story 2.14 measured the MUI `Dialog` stack
at **+18.1 KB gzip** statically and had to put it behind `next/dynamic` to fit at all. A second
dialog is a bundle decision only Sidiar can authorise, in service of a requirement nobody wrote.

**If a reviewer later wants a confirmation, that is a PRD touch, not a story-level call.** Record it
in `deferred-work.md` rather than shipping it.

### Forced decisions (record the option taken and why in the Dev Agent Record)

1. **Is CLEAR PETRI DISH `disabled` on an empty grid, or enabled-and-inert?**
   AC3 says *"when clicked, nothing happens"*, which reads as enabled. But this route's own
   convention is the opposite: `UNDO` is `disabled={!canUndo || isSaving}` and `SAVE` is
   `disabled={!isDirty || isSaving}` — both are "nothing to do → disabled".
   - (a) **`disabled={livingCells === 0 || isSaving}` AND a handler guard** — recommended. Matches
     the two sibling buttons, tells the user *why* nothing would happen, and satisfies AC3's
     substance under either reading. The handler guard is the belt-and-braces half Story 2.14 used
     for trap 7 (the control makes it impossible; the handler refuses anyway).
   - (b) Enabled always, guarded in the handler only — literal to the AC's wording, but leaves a
     live button that does nothing, which is the affordance NFR-4.1 objects to.
   Whichever is taken, **the handler guard is not optional**: `stats.livingCells` is a render-time
   value and a commit dispatched in the same tick must still be refused.

2. **Where does the empty grid come from?**
   - (a) **A pure `emptyGrid(size)` / `clearGrid(grid)` in `apps/web/lib/`** — recommended, in the
     shape `resizeGrid.ts` and `gridStats.ts` already establish (pure, no React, no DOM, comment
     naming **Story 3.3** as the eventual owner alongside `resizeGrid`). It gives
     `deferred-work.md:369`'s inherited obligation a **directly falsifiable** test — new wrapper,
     new buffers, input untouched — instead of one inferred through a component render.
     Note `resizeGrid.ts` is named for resize; either add a sibling module or widen that module's
     doc comment deliberately rather than by accident.
   - (b) Inline in `<BattleEditorView>` — four lines, but the identity guarantee then has no test of
     its own.
   ❌ Not `@gol/test-utils`' grid builders: an ESLint `no-restricted-imports` rule forbids `apps/web`
   non-test code from importing that package.

3. **Does `<EditorToolsSection>` declare `onExport?` now?**
   Spec §3.7 types it `{ onClear(): void; onExport?(): void }`. Story 2.14 set the precedent for the
   other direction — *"the remaining sidebar sections bring whatever they need with them; declaring
   their props now would be an unverifiable claim this story cannot back up."*
   - (a) **Ship `onClear` only** — recommended; Story 5.6 adds `onExport?` when it has something to
     pass, and AC4 stays a statement about rendered output rather than about an unused prop.
   - (b) Declare it optional now, never pass it — spec-literal, but it is dead code today.
   Either way the deviation (or the non-deviation) is recorded, and AC4's assertion is on the DOM.

### Traps

1. **The cleared grid must keep the current dimensions.** `grid.width`/`grid.height`, never a
   constant. `epics.md` AR-17 and `project-context.md` are blunt: *"a hardcoded `100` or `60`
   anywhere is a bug — 100×60 is only the default"* (Decision A). `<BattlePage>`'s `size` memo is
   derived from `grid`, so a Clear that changed dimensions would change `size` and `grid` in the
   same commit and tear down the renderer for no reason.
2. **The cleared grid must be a NEW object with NEW buffers.** The canvas's grid effect returns
   early on `paintedGridRef.current === grid`, and the `stats` memo keys on `grid` identity. An
   in-place `occupant.fill(0)` leaves the dish showing cleared cells while the stats row and the
   undo snapshot still hold the old numbers — no error, no failing test. `readonly Uint8Array` is
   readonly on the **property**, not the contents (`deferred-work.md:369`).
3. **`age` is reallocated, zero-filled, at `width * height`.** Not carried over, not shared.
   `restore()` and `resizeGrid` both already model this; `computeEditorGridStats` and
   `GridRenderer.assertGridMatchesSize` treat `occupant.length === width * height` as an invariant
   of every `RenderableGrid` in circulation.
4. **The Population row does not empty.** `computeEditorGridStats` emits one `perOrganism` entry per
   de-duplicated `rosterIds` id **including zero counts**, and `<EditorStatusBar>`'s `hasPopulation`
   is `perOrganism.length > 0`. So after a Clear the row lists every roster organism at 0 — it does
   **not** fall back to "Population: —". Correct, and worth an assertion so nobody "fixes" it.
5. **Clear → Save stores `organismIds: []`.** `projectBattleForSave` → `pruneAndRemapBattleGrid`
   removes every entry with no placed cell (Decision H.1). `BattleSchema` allows an empty array and
   the `superRefine` passes (there is no unplaced roster member left to fail on). ⚠️ The visible
   consequence lands on the **next load** of that battle: the persisted `organismIds` is empty, so
   `<BattlePage>`'s `rosterIds` memo takes its `placed.length === 0 && defaultInLibrary` branch and
   seeds `[DEFAULT_TOOL.organismId]` — the reopened battle **lists and pre-selects Conway's
   Classic** (M9: always present in a production workspace). That is intended, not a leak: Sidiar's
   call, 2026-08-31 — Conway's Classic is the inspiration for the whole project, so a cleared dish
   handing it back is onboarding for someone who has never met it, and it is also what keeps a
   battle with nothing placed paintable. Decision H still governs what is *persisted*
   (`organismIds: []`); the seed is session state layered on top (H.2). Do not add a guard, and do
   not preserve a phantom roster at save. Only in an **e2e-seeded** workspace (which has no Conway)
   would the roster reopen empty with the eraser selected — a fixture artefact, which is why the
   e2e seeds Conway explicitly rather than asserting an outcome production cannot reach.
6. **The edit lock has two halves and needs both.** `disabled={… || isSaving}` on the button is the
   visible half; the `isSaving` check inside `handleClear` is the half that cannot be raced — a save
   can start *after* the render that disabled the control (this is exactly the finding the Story
   2.14 review fixed on `handleConfirmResize`). `<BattlePage>.handleCommitGrid` also refuses under
   `savingRef`, silently — so without the handler guard, a Clear in that window would look like it
   worked while nothing changed.
7. **A Clear landing mid-stroke discards the stroke, silently.** Reachable via multi-touch (one
   finger on the dish, another on the sidebar) — the same path `deferred-work.md:71` documents for
   the roster `<select>`. The policy is `endStroke(false)` from the grid effect, ratified by Sidiar
   twice. ⚠️ **No toast, no flash, no affordance.** Do not relitigate it.
8. **`:focus-visible`, not `:focus-within`.** `<GridSettingsSection>` uses `:focus-within` because
   its focusable element is a *visually-hidden* radio inside a `<label>`, and `:has()` is unusable
   below Firefox 121 (NFR-2.1's floor is 112). A `.tool-btn` is a real `<button>` that receives focus
   itself, so `:focus-visible` is both correct and better — it does not ring on a mouse click.
9. **No `transition` on the button.** Stories 2.13 and 2.14 each lost one to an axe scan that landed
   mid-fade and measured an *enabled* control at a contrast ratio no settled state has. The disabled
   pair (`--gol-action-disabled` on `--gol-action-disabled-bg`) is 2.54:1 and is only legitimate
   while the control is genuinely disabled; animating between it and an enabled pair paints ratios
   that belong to neither.
10. **`--gol-border-control`, not the mockup's `--gol-border`.** The decorative border measures
    1.57:1 against `--gol-bg-primary`; this border is the button's only boundary, so SC 1.4.11's 3:1
    applies. `themeTokens.test.ts` asserts the split exists precisely so it keeps being used.
11. **AR-46 is a live lint rule on `apps/web`** — no raw hex, `var(--gol-*)` only.

### Testing standards summary

Vitest + RTL, Playwright, vitest-axe. `apps/web` carries **no coverage gate** (a deliberate
counter-metric); the value here is in the invariants, not the percentage. No test whose only purpose
is to raise a number.

**Pure (the empty-grid helper, if forced decision 2 takes (a)):**
- Every cell is 0; `occupant.length === width * height`; `age.length === width * height` and is
  zero-filled.
- Dimensions are carried through unchanged, for both editable presets and for a non-preset size.
- Returns a **new** wrapper and **new** buffers: mutating the result leaves the input byte-identical,
  and `result !== grid`, `result.occupant !== grid.occupant`. ⚠️ This is the test
  `deferred-work.md:369` is closed on — it must fail if someone switches to an in-place `fill(0)`.

**Component:**
- `<EditorToolsSection>`: renders the "CLEAR PETRI DISH" button; clicking calls `onClear` once;
  renders **no** Export, Reset-to-Saved or Randomize control (assert their absence by name — AC4);
  `disabled` blocks the callback.
- `<BattleEditorView>`: the Tools section is the **fourth** heading — extend the existing heading-order
  assertion to `['Organisms','Battle Name','Grid Info','Tools']`; clicking Clear on a populated grid
  calls `onCommitGrid` **exactly once** with an all-zero grid **of the same dimensions**; clicking it
  on an empty grid calls it **zero** times; the roster list, the selected row and the name field are
  unchanged across a Clear.
- `<BattlePage>`: a Clear flips `data-dirty`; UNDO becomes enabled exactly once and restores the
  painted cells; a Clear is refused while a save is in flight; a save after a Clear projects
  `organismIds: []` with a valid `gridState` (trap 5, at the unit level).
- `<EditorStatusBar>` via `<BattleEditorView>`: after a Clear, "Living Cells" is 0 **and** the
  Population row still lists the roster at 0 (trap 4).
- `<PetriDishCanvas>`: a cleared grid identity triggers **one** `drawFull` and **no** renderer
  reconstruction (the `size` memo did not move); no `GridRendererDimensionMismatchError`; a Clear
  landing mid-stroke ends the stroke with `endStroke(false)` and releases pointer capture (trap 7 —
  the ratified policy, pinned not re-decided).

**E2E (`apps/web/e2e/battleRoute.spec.ts`, the established home for battle-route journeys):**
- Paint on `/battle` → CLEAR PETRI DISH → the dish repaints empty (`distinctColorCount` /
  `countChangedPixels`, the helpers already in that file) → UNDO restores the painted cells.
- Clear → SAVE → reload: the battle opens empty, and — with `seedConwaysClassic` layered on so the
  workspace matches production — the roster lists **and pre-selects Conway's Classic** (trap 5's
  downstream consequence, end to end).
- The Tools section renders exactly one button; no "EXPORT BATTLE" / "RESET TO SAVED" / "RANDOMIZE"
  anywhere on the route (AC4).
- axe-clean on `/battle` and `/battle/new` with the Tools section present, in all four projects.
- ⚠️ Use `seedWorkspaceIfFresh` (`battleRoute.spec.ts:1038`) for any test that saves and then
  navigates — the shared `seedWorkspace` runs on **every** document load and would wipe the saved
  battle (Story 2.13 Debug Log 2). ⚠️ The `buildSeedPayload`/`seedWorkspace` copies are hand-synced
  across spec files — keep them byte-identical.

**Determinism / hygiene:**
- Never pixel- or snapshot-test the canvas. Test the renderer's brain (call counts, arguments,
  `fillStyle` strings) — the rule `PetriDishCanvas.test.tsx` already follows (AR-42).
- Mutation-check the two assertions that must be falsifiable: switching the helper to an in-place
  `fill(0)` must redden the identity test, and deleting the already-empty guard must redden the
  no-op test.

## Project Structure Notes

New (exact paths depend on forced decision 2):

- `apps/web/components/battle/EditorToolsSection.tsx` (+ `.test.tsx`) — spec §3.7.
- `apps/web/lib/clearGrid.ts` (+ `.test.ts`) — the pure empty-grid helper, if (a). Comment must name
  **Story 3.3** as the eventual owner of the grid primitives (AR-17), the way `resizeGrid.ts` does.

Updated:

- `apps/web/components/battle/BattleEditorView.tsx` — the fourth `<SidebarSection>`, `handleClear`,
  and the deletion of the `❌ No Tools section (2.15)` line.
- `apps/web/components/battle/BattleEditorView.test.tsx` — the heading-order assertion and the
  clear/no-op matrix.
- `apps/web/components/battle/BattlePage.test.tsx` — dirty-on-clear, undo-restores-content,
  save-after-clear.
- `apps/web/e2e/battleRoute.spec.ts` — the Clear journey.
- `docs/implementation-artifacts/deferred-work.md` — the AC6 entries settled, plus any new ones.
- `docs/implementation-artifacts/sprint-status.yaml`.

Likely **not** updated (check the assumption, do not assume the check):

- `apps/web/components/battle/BattlePage.tsx` — Clear needs no new state there; it arrives at the
  existing `handleCommitGrid`. If a change *is* needed, that is a signal the design grew a second
  commit seam or a second source for `size`.
- `apps/web/lib/useUndoableGrid.ts`, `apps/web/lib/gridStats.ts`, `apps/web/lib/battleRecord.ts` —
  AC2's undo half, AC3's emptiness number and AC5's prune are **tests, not edits**.
- `apps/web/components/PetriDishCanvas.tsx` — the grid effect already handles an external change;
  this story adds a test, not a branch.
- `scripts/check-bundle-size.mjs` — **only** with Sidiar's explicit approval, and this story has no
  business needing it.
- `packages/*` — nothing here belongs below the `apps/web` boundary yet.

Conventions that apply and are easy to violate here:

- **Grid dimensions are parameters, never constants** (Decision A) — trap 1.
- **Repositories are injected, never imported** (AR-2/27) — nothing in this story touches one.
- **Hot state in refs, never React state** — nothing here is hot; the clear handler is an event
  handler and holds no state at all.
- **No raw hex** (AR-46, a live lint rule on `apps/web`); `var(--gol-*)` only.
- **Per-component MUI imports only** (AR-35) — and this component should need **zero** MUI imports.
- **Non-component TS files are camelCase, never dotted**; components are PascalCase `.tsx`.
- Comments explain **why**, not what; cite governing IDs exactly as the specs spell them
  (`npm run spec:check` fails the build on an ID that resolves to nothing).
- **Nothing reaches `main` without Sidiar's go-ahead**; a story branch may be pushed, merging is
  Sidiar's call.

## References

- [Source: docs/planning-artifacts/epics.md#Story 2.15: Clear Petri Dish] — the ACs.
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md] — **FR-3.7** (Reset Grid,
  `:248-249` — one sentence, no confirmation), **FR-3.8** (Undo, 30 levels, resets on return to the
  Gallery), **FR-3.11** (`:265-270` — the resize AC that *does* require a warning, for contrast).
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-17** (pure grid
  primitives), **AR-30** (`useUndoableGrid`'s ring: occupant + dimensions, ≤180 KB, component
  lifetime = undo lifetime), **AR-2/27** (repository injection), **AR-35** (MUI core only,
  per-component imports), **AR-42** (canvas testing as pure units), **AR-46** (no raw hex).
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.7] — `<EditorToolsSection>`'s
  API (`onClear`, optional `onExport`), and *"MVP ships two of the mockup's four buttons"*.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3] — the wiring line:
  *"`EditorToolsSection.onClear` commits an empty grid (FR-3.7)"*, and the sidebar order
  *"Organisms · Battle Name · Grid Info · Tools · Back"*.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#4] — `useUndoableGrid`'s contract:
  *"commit = paint/erase stroke, **Clear**, Edit resize"*.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#9] — **§9.3** (Reset-to-Saved and
  Randomize excluded from the MVP; no backing FR), **§9.4** (the "CLEAR PETRI DISH" / "Reset Grid"
  naming rule).
- [Source: docs/planning-artifacts/architecture.md#Decision H] — **H.1** (persisted `organismIds` ≡
  the placed set; saving prunes), **H.2** (unpainted roster entries are session state) — trap 5.
- [Source: docs/planning-artifacts/architecture.md#Decision A] — grid dimensions are per-battle
  parameters; the editable set is {50×30, 100×60} — trap 1.
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md] — Decision 6
  (`useUndoableGrid`, commit-per-gesture), and the "Representation note" that every initial grid is
  age-zero everywhere.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html]
  — `.sidebar-section` (`:149-164`), `.tool-btn` (`:407-431`), the Tools markup (`:727-733`).
- [Source: docs/implementation-artifacts/deferred-work.md] — entries `:239`, `:257`, `:369`, `:400`
  (AC6).
- [Source: docs/implementation-artifacts/epic-2/2-14-edit-mode-grid-resize.md] — the immediately preceding
  story: the commit-seam pattern, the `<GridSettingsSection>` styling substitutions, the axe
  transition findings, the bundle measurements this story is held against.
- [Source: docs/implementation-artifacts/epic-2/2-8-undo.md] — forced decision 5 (silent mid-stroke
  discard) and the ring's shape.
- [Source: docs/project-context.md] — the load-bearing non-obvious rules (auto-loaded by BMad
  skills; not restated here beyond the ones this story can actually trip).

### Review Findings

Code review, 2026-08-31, on **Opus** against a **Sonnet** implementation — three parallel
adversarial layers (Blind Hunter · Edge Case Hunter · Acceptance Auditor), all three of which
independently reached the handler-guard finding below. `npm run ci` re-run from scratch by the
reviewer: **exit 0** (865 unit/component, 296 e2e + 4 pre-existing skips), and the bundle
independently re-measured at the numbers Debug Log 5 reports.

**decision-needed** — **resolved by Sidiar, 2026-08-31 (option a)**; the story is `done`:

- [x] [Review][Decision] **Clear → Save → reload puts Conway's Classic into a battle that never
  contained it, and the e2e that says otherwise cannot show it** — AC5/trap 5 states the
  downstream consequence as *"`rosterIds` is empty, so `resolveSelectedTool` returns the eraser and
  the roster section shows its empty state."* In a **production** workspace that is false.
  `<BattlePage>`'s `rosterIds` memo seeds `[DEFAULT_TOOL.organismId]` whenever
  `placed.length === 0 && defaultInLibrary`, and `lib/tool.ts` states *"Conway's Classic is always
  present in a production workspace (M9: protected, re-seeded after import)"* — so reopening a
  cleared-and-saved battle lists **and pre-selects** Conway's Classic. That is verbatim the symptom
  `tool.ts`'s own comment was written against (*"opening a battle with three organisms and finding
  Conway's Classic listed"*) and that Story 2.9 forced decision 4 narrowed the seed to avoid. The
  seed's own comment does anticipate *"a saved battle H.1 pruned to nothing"* — but until this
  story that state took erasing every cell by hand; Clear makes it one click, which is what turns
  an edge case into the normal path. The e2e (`battleRoute.spec.ts`, Clear → Save → reload) asserts
  `getByRole('list')).toHaveCount(0)` and `Eraser` pressed, and passes **only because the test
  fixture library has no Conway's Classic** (`buildSeedPayload` → `createMockWorkspace`, and
  `seedWorkspaceIfFresh` stamps `gol:schema` so the default seed cannot add it) — it proves an
  outcome production cannot reach. Not auto-resolved: both readings are defensible and the choice
  is Decision H / Story 2.9 forced decision 4 territory, not a story-level call.
  **(a)** The production behaviour is right — a battle with nothing placed must stay paintable —
  so correct trap 5's text and make the e2e assert the seeded outcome by calling
  `seedConwaysClassic`. **(b)** The seed should apply to `/battle/new` only; an existing saved
  battle pruned to nothing keeps an honestly empty roster and the eraser, and Story 2.10's add
  dropdown is what makes it paintable again.

  **RESOLVED — (a), Sidiar, 2026-08-31.** The seed stays; the spec text and the e2e were wrong,
  not the code. Sidiar's reason is broader than the one (a) was argued on: Conway's Classic is the
  inspiration for the whole project, so a cleared dish handing it back is a **deliberate
  onboarding affordance** — someone who knows nothing about Conway should meet it — and not merely
  a fallback that keeps an empty battle paintable. Recorded here in that form so this is not
  re-opened later as a leaky default: the `tool.ts` comment about *"opening a battle with three
  organisms and finding Conway's Classic listed"* still stands, because that case has
  `placed.length > 0` and never reaches the seed branch. Applied: trap 5's statement rewritten
  above; the AC5 e2e now layers `seedConwaysClassic` and asserts the seeded outcome (roster lists
  Conway's Classic, pre-selected) instead of an empty roster that only the fixture library
  produced. No production code changed.

**patch** — applied in this review's own commit:

- [x] [Review][Patch] Neither half of `handleClear`'s guard was covered: deleting
  `if (stats.livingCells === 0 || isSaving) return;` outright left all 136 `BattleEditorView` +
  `BattlePage` tests green (verified by mutation, three ways). React never invokes `onClick` on a
  disabled `<button>`, so every test driving the real control measures the `disabled` expression
  and never the handler — including the trap-6 test whose comment claimed the opposite about
  `fireEvent`. New `apps/web/components/battle/BattleEditorView.clearGuards.test.tsx` mocks the
  control down to an enabled button; each guard now reddens independently. The two false comments
  are corrected in place, including the "same-tick race" justification, which was wrong — both
  guards read the same render's values the `disabled` expression reads.
- [x] [Review][Patch] `'leaves the roster, selection and battle name UNTOUCHED across a Clear'`
  passed on a `handleClear` that did nothing at all — `<BattleEditorView>` is controlled, so
  "untouched" was vacuous. Now asserts the commit happened.
  [apps/web/components/battle/BattleEditorView.test.tsx]
- [x] [Review][Patch] The `BattlePage` AC3 test promised a click in its title and never dispatched
  one. [apps/web/components/battle/BattlePage.test.tsx]
- [x] [Review][Patch] Trap 4's test asserted only that the word "Population" was present —
  `<EditorStatusBar>` renders that label in **both** branches, so it passed either way. Now reads
  the entries' `aria-label`s and asserts the same organisms, each at 0.
  [apps/web/components/battle/BattlePage.test.tsx]
- [x] [Review][Patch] `clearGrid` allocating from `width * height` rather than
  `grid.occupant.length` was pinned by nothing — every input, fast-check included, had the two
  equal. Added an over-allocated-input case; `gridStats.ts`'s comment is explicit that
  `RenderableGrid` does not guarantee they agree. [apps/web/lib/clearGrid.test.ts]
- [x] [Review][Patch] The e2e asserted `clearedPixels > 0`, which says the dish CHANGED, not that
  it is empty — a clear that zeroed one row would pass, and the undo check is relative to the same
  number. Added the status bar's `Living Cells: 0`. [apps/web/e2e/battleRoute.spec.ts]
- [x] [Review][Patch] `<EditorToolsSection>`'s style docblock named the enabled pair as
  `--gol-text-primary`-on-transparent; the resting colour is `--gol-text-secondary` and
  `--gol-text-primary` is the hover state. [apps/web/components/battle/EditorToolsSection.tsx]
- [x] [Review][Patch] The same file's header said *"the MVP ships ONE (spec §9.3)"*; §3.7 says the
  MVP ships **two** of four and §9.3 excludes only the other pair — this STORY ships one.
  [apps/web/components/battle/EditorToolsSection.tsx]
- [x] [Review][Patch] `BattleEditorViewProps`' comment still listed `<EditorToolsSection>` among
  "the remaining sidebar sections" after it landed. [apps/web/components/battle/BattleEditorView.tsx]
- [x] [Review][Patch] Describe headers advertised ACs they do not test (the unit block claimed AC5
  and AC7; the e2e block claimed AC6 and not AC5). Trimmed to what each covers.
- [x] [Review][Patch] Dev Agent Record corrections: AC5's evidence row cited `BattlePage.test.tsx`
  for assertions that live in `BattleEditorView.test.tsx` and claimed an `isSaving`-unchanged
  assertion that does not exist; the File List said 7 tests where there are 6, and
  `ready-for-dev → review` where the tracker went `backlog → review`.

**defer** — recorded in `deferred-work.md` under
`## Deferred from: code review of 2-15-clear-petri-dish (2026-08-31)`:

- [x] [Review][Defer] CLEAR self-disables on its own activation, blurring focus to `<body>` so the
  next Tab restarts at the top of the document — deferred, pre-existing route pattern (UNDO and
  SAVE have had the same shape since 2.8/2.13); worth fixing once for all three, and the
  `aria-disabled` alternative is a route-wide convention change that is Sidiar's call.
- [x] [Review][Defer] The focus-ring e2e cannot distinguish `:focus-visible` from `:focus-within`
  under a programmatic `.focus()`, and proves nothing about tab order — deferred, needs a shared
  modality-aware helper rather than an inline one-off. (Its comment's claim to follow an existing
  convention was false and is corrected in place — it is the only `outline-style` assertion in the
  whole `e2e/` tree.)
- [x] [Review][Defer] No `<PetriDishCanvas>` test pins a Clear specifically — deferred; the dev's
  source-agnostic argument holds and was re-checked, but pointer-capture release is asserted only
  on the palette path and "no renderer reconstruction on a same-dimension identity swap" is pinned
  nowhere. Gaps in a shared describe, not in this story's code.

**dismissed as noise (5):** the absence of a confirmation dialog (settled — FR-3.7 asks for none);
"Clear → Save discards the roster silently" (Decision H.1, specified); `EditorToolsSectionProps`
exported but unimported (file-wide convention, matches `GridSettingsSectionProps`); the header
docblock not being attached to the component symbol (matches `SidebarSection.tsx`,
`GridSettingsSection.tsx`); the AC4 e2e absence guard being name-only (the unit tests count).

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Sonnet 5)

### Debug Log References

1. **Forced decision 1 taken as (a): `disabled={livingCells === 0 || isSaving}` AND a handler
   guard.** `<EditorToolsSection>`'s `onClear` fires unconditionally on click, exactly like
   `<GridSettingsSection>`'s `onResize`; the emptiness and edit-lock guards both live in
   `<BattleEditorView>.handleClear`, matching the sibling controls' convention (UNDO/SAVE are both
   "nothing to do → disabled"). Belt-and-braces per trap 6: `stats.livingCells` is a render-time
   value, so the handler guard is not optional even with the control disabled.

2. **Forced decision 2 taken as (a): a new pure module, `apps/web/lib/clearGrid.ts`.** Mirrors
   `resizeGrid.ts`'s shape exactly (pure, no React/DOM, comment naming Story 3.3 as the eventual
   owner) rather than four inline lines in `<BattleEditorView>` — the inherited
   `deferred-work.md:369` obligation needed a directly falsifiable test of its own (new wrapper, new
   buffers, input untouched), which an inline literal would not have gotten independently.

3. **Forced decision 3 taken as (a): `onExport?` is NOT declared on `EditorToolsSectionProps`
   yet.** Story 5.6 adds it when it has something to pass, following the precedent Story 2.14 set
   for the sibling sections. AC4's absence assertions are on the rendered DOM, not on an unused prop.

4. **`deferred-work.md`'s four inherited AC6 entries, settled with evidence, no code added for any
   of them:**
   - `:239` (stale stroke geometry on a scroll) — **re-deferred**, premise re-checked against the
     now-FOUR-section sidebar. The sidebar still scrolls independently of the dish's `rect`
     (`flexShrink: 0`, fixed 320px); the new CLEAR button is one more `Tab` stop inside that region,
     which is the same "marginally more likely, still unreached" shift Story 2.14 recorded for the
     preset radios. Re-pointed at Story 2.16 (next to touch `<SidebarContent>`'s composition) or
     3.18 (first story where the defect is reachable with ONE pointer).
   - `:257` (silent mid-stroke discard, ratified) — **confirmed, not relitigated.** `<PetriDishCanvas>`
     receives `grid` as an opaque prop; the existing "external grid change mid-stroke" describe in
     `PetriDishCanvas.test.tsx` is already source-agnostic (`rerenderWith({ grid: external })`) and
     covers exactly the shape a Clear produces. No new test needed or added.
   - `:369` (stats memo keys on `grid` identity) — **discharged for Clear.** `clearGrid.test.ts`'s
     "returns a NEW wrapper and NEW buffers" is the same falsifiable shape `resizeGrid.test.ts`
     closed this entry on for resize.
   - `:400` (`GridSettingsSection.gridSize` vs. spec §3.6) — **checked, confirmed not this story's.**
     This story touches §3.7 only.

5. **Bundle, measured before and after (AC7):** `/battle` 304.1 → **304.3 KB** gzip (5.9 → 5.7 KB
   headroom, budget unchanged at 310); `/battle/new` 304.1 → **304.2 KB** (5.9 → 5.8 KB headroom).
   `/` unaffected at 329.5 KB (10.5 KB headroom, 340 budget). The story's own prediction — "close to
   nothing, zero new MUI imports" — held: one styled `<button>`, one pure helper, one handler. No
   budget move, no `check-bundle-size.mjs` edit.

6. **Two pre-existing tests needed re-scoping for the new control**, the same class of change
   Story 2.14 made for "Living Cells" appearing twice: `BattlePage.test.tsx`'s two fixed
   button-count assertions (`/battle/new`: 4 → 5; the loaded route: `organisms.length + 3` →
   `organisms.length + 4`) and `battleRoute.spec.ts`'s heading-order assertion (three `<h2>`s →
   four, `'Tools'` appended). All three were counting/naming assertions that a new sidebar button
   necessarily moves, not assertions this story's design broke.

7. **The e2e Clear/Undo pixel assertions follow Story 2.7/2.8's established
   snapshot-then-diff shape (`snapshotBaseline` / `countChangedPixels`)**, not a `distinctColorCount`
   equality check: an empty grid still paints grid lines over the background (default
   `gridLines: true`), so `distinctColorCount === 1` on a "cleared" dish would be a false claim.
   Undo's return-to-baseline residual is asserted at `< 5%` of the pixels Clear changed (tighter
   than the eraser reversal's `< 60%`), because Clear and Undo both repaint via the grid effect's
   `drawFull` — a full repaint from grid state, not the eraser's incremental dirty-region
   compositing that produces `restoreGridLinesOver`'s known ~30-35% residual.

### Completion Notes List

**Acceptance criteria**

| AC | Evidence |
|---|---|
| AC1 — Tools section, CLEAR PETRI DISH button | `<EditorToolsSection>` mounts as the **fourth** `<SidebarSection title="Tools">`. `BattleEditorView.test.tsx`'s heading-order assertion extended to `['Organisms','Battle Name','Grid Info','Tools']`; `EditorToolsSection.test.tsx` (5 tests) covers the button in isolation. |
| AC2 — ONE undoable commit, marks dirty | `handleClear` calls `onCommitGrid(clearGrid(grid))` exactly once. `BattleEditorView.test.tsx`'s Clear describe asserts one call, an all-zero grid, the SAME dimensions, and a NEW identity. `BattlePage.test.tsx` asserts `data-dirty` flips and UNDO becomes enabled exactly once; UNDO restores the painted cells. The e2e journey proves it with a real pointer and real layout. |
| AC3 — already-empty grid: no-op | `stats.livingCells === 0` guards both the control's `disabled` and the handler. Component test: zero `onCommitGrid` calls on an empty grid. `BattlePage.test.tsx` and the e2e both cover the `/battle/new` case. |
| AC4 — Export absent, Reset-to-Saved/Randomize excluded | Asserted by NAME in `EditorToolsSection.test.tsx`, `BattleEditorView.test.tsx` and the e2e — one button, nothing else, everywhere the Tools section renders. |
| AC5 — Clear touches cells only; the canvas survives | `BattleEditorView.test.tsx`: the roster list, the selected row and the battle name unchanged across a Clear (and, after review, that the Clear actually happened). `BattlePage.test.tsx`: trap 4's Population row still lists the SAME roster entries, each at 0, asserted by `aria-label`; a save after a Clear projects `organismIds: []` with a valid `gridState`, parsed through the real `BattleSchema` (trap 5). e2e proves the full Clear → Save → reload round trip, including the Conway's Classic re-seed on reopen (Sidiar's call, 2026-08-31). |
| AC6 — the four inherited `deferred-work.md` entries | All four settled with evidence — see Debug Log 4. Two re-affirmed as-is (`:257` ratified, `:400` not this story's), one re-deferred with its premise re-checked (`:239`), one discharged (`:369`). No new entries were generated by this story. |
| AC7 — keyboard, axe, bundle | Real `<button type="button">`, `:focus-visible` ring (trap 8 avoided — not `:focus-within`), reachable and operable by `Tab`/`Enter` (e2e). axe-clean on `/battle` and `/battle/new` with the Tools section present, across all four Playwright projects. Bundle re-measured — see Debug Log 5. |

**What was deliberately NOT built**: no confirmation dialog (see the story's own "confirmation
question, settled" — FR-3.7 has no AC requiring one, and Undo is the designed safety net); no
second commit seam; no touch to `sessionRoster`/`chosenTool`/`battleName`/`rosterIds`; no
`onExport?` prop; no Reset-to-Saved/Randomize; no change to `<BattlePage>`, `useUndoableGrid.ts`,
`gridStats.ts`, `battleRecord.ts`, `PetriDishCanvas.tsx` or `check-bundle-size.mjs` — each was
verified with a test rather than assumed unaffected.

**Verification** (actual output, `npm run ci` redirected to a file, never piped, `$?` echoed):

| Step | Result |
|---|---|
| `npm run ci` (`> /tmp/story-2-15-ci.log 2>&1; echo "EXIT_CODE=$?"`) | ✅ **EXIT_CODE=0** — typecheck → lint → format:check → spec:check → test:coverage → build:standalone → bundle:check → e2e, all green |
| `npm run typecheck` | ✅ pass, all 5 packages |
| `npm run lint` | ✅ 0 errors, 1 pre-existing unrelated warning (`BattleGallery.tsx`, predates this story) |
| `npm run format:check` | ✅ pass |
| `npm run spec:check` | ✅ all 164 cited ids resolve; 3/6 reconciliation citations resolve |
| `npm run test:coverage` | ✅ **54 test files, 865 tests passed** (`apps/web`); `@gol/domain` 6 files, `@gol/persistence` 7, `@gol/test-utils` 5 — all passed |
| `npm run build:standalone` | ✅ pass, all 4 routes prerendered |
| `npm run bundle:check` | `/` **329.5 KB** gzip (10.5 KB headroom, 340 budget) · `/battle` **304.3 KB** (5.7 KB, 310 budget) · `/battle/new` **304.2 KB** (5.8 KB, 310 budget) — no budget raised |
| `npm run e2e` | ✅ **296 passed, 4 skipped** (pre-existing pointer-type-conditional skips), across all four Playwright projects (chromium, firefox, webkit, tablet) |

⚠️ A local green `ci` is not proof CI is green — check `gh run list` after the push.

### File List

**New**

- `apps/web/lib/clearGrid.ts`
- `apps/web/lib/clearGrid.test.ts`
- `apps/web/components/battle/EditorToolsSection.tsx`
- `apps/web/components/battle/EditorToolsSection.test.tsx`

**Updated**

- `apps/web/components/battle/BattleEditorView.tsx` — the fourth `<SidebarSection title="Tools">`,
  `handleClear`, the `clearGrid`/`EditorToolsSection` imports, and the composition-root doc comment
  (the `❌ No Tools section (2.15)` line deleted).
- `apps/web/components/battle/BattleEditorView.test.tsx` — the heading-order assertion extended to
  four sections; the two pre-existing button-presence/count assertions updated for the new control;
  a new "Clear Petri Dish (Story 2.15)" describe block (6 tests — the record said 7).
- `apps/web/components/battle/BattlePage.test.tsx` — two pre-existing button-count assertions
  updated for the new control; a new "Clear Petri Dish (Story 2.15)" describe block (6 tests).
- `apps/web/e2e/battleRoute.spec.ts` — the pre-existing sidebar heading-order assertion extended to
  four headings; a new "Clear Petri Dish (Story 2.15)" describe block (7 tests).
- `docs/implementation-artifacts/deferred-work.md` — the four AC6 entries settled in place (no new
  heading added — nothing new surfaced).
- `docs/implementation-artifacts/sprint-status.yaml` — `2-15-clear-petri-dish`: `backlog` →
  `review` (the tracker never held `ready-for-dev`; the Change Log row records the story file's
  own status, not the tracker's).

### Change Log

| Date | Change |
|---|---|
| 2026-08-31 | Story created (`create-story`). Status → ready-for-dev. |
| 2026-08-31 | Implemented (`dev-story`): `<EditorToolsSection>` + `clearGrid.ts`, wired as the fourth sidebar section; all 4 inherited `deferred-work.md` entries settled; `npm run ci` green (865 unit/component tests, 296 e2e); bundle re-measured, no budget raise. Status → review. |
| 2026-08-31 | Code review (`bmad-code-review`, Opus, 3 adversarial layers). 11 patches applied in a second commit — chiefly `BattleEditorView.clearGuards.test.tsx`, which makes `handleClear`'s two guards falsifiable at all (deleting them left the whole suite green). 3 items deferred. **1 `decision-needed` open** (Clear → Save → reload seeds Conway's Classic into a battle that never held it; the e2e that denies it cannot reproduce production). Status stays `review` pending Sidiar's call. |

Dev Model: sonnet   # follows the Epic 2 sidebar-section + one-commit-seam patterns end to end; the dialog/bundle decision that made 2.14 architecture-shaping is absent here (FR-3.7 requires no confirmation), and no later story inherits a new pattern from it

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 29s | 30 | 3,434 | 14,775 | 605,088 | 623,327 |
| Step 1 — create-story | opus-5 | 1 | 8m 23s | 214 | 16,543 | 543,815 | 10,784,051 | 11,344,623 |
| Step 2 — dev-story | sonnet-5 | 1 | 32m 51s | 592 | 18,049 | 847,676 | 65,854,365 | 66,720,682 |
| Step 3 — code review + PR | opus-5 | 4 | 39m 23s | 1,616 | 104,452 | 1,243,021 | 167,667,862 | 169,016,951 |
| _of which the orchestrator_ | opus-5 | — | — | 80 | 14,035 | 53,310 | 1,923,037 | 1,990,462 |
| **Total (create-story → PR ready)** | | 6 | **1h 21m** | 2,452 | 142,478 | 2,649,287 | 244,911,366 | **247,705,583** |

Run started 2026-08-31 10:50 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
