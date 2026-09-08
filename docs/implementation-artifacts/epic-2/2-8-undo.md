---
baseline_commit: 6e7edd43b65ee18974720b41eb51d71649b2312e
---

# Story 2.8: Undo

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to undo my recent editing gestures,
so that I can experiment without fear.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.8: Undo`, decomposed into the nine things a reviewer can
independently check.

1. **AC1 — `useUndoableGrid` exists, owned by `<BattlePage>`, and is the ONLY grid state.** The
   hook holds the current `initialGrid` value plus a bounded ring of previous snapshots, and
   `<BattlePage>`'s Story 2.5 `editedGrid` / `setEditedGrid` pair is **replaced** by it — not kept
   beside it. Its returned shape follows spec §4: `[{ value, commit(next) }, { undo(), canUndo }]`
   (RFC-005 Decision 6, AR-30). No second grid state, no mini ring, nothing undo-shaped anywhere
   else in the tree.

2. **AC2 — 30 entries, FIFO, ≤180 KB at 100×60.** The ring holds **at most 30** snapshots. The
   31st commit evicts the oldest; the ring never grows past 30 regardless of gesture count. Each
   snapshot stores **the occupant map and its dimensions only** — 6,000 bytes at 100×60, so 30
   levels are 175.8 KB, inside AR-30's ≤180 KB. Storing `age` alongside it is a budget violation,
   not a nicety (trap 4).

3. **AC3 — One entry per committed gesture; a no-op gesture creates none.** A click commits once →
   one entry. A press-drag-release commits once at pointer-up (already true at the seam since Story
   2.6) → **one** entry, and undoing it reverts the whole stroke as a single unit (RFC-005 D6). A
   gesture that changed nothing fires no commit at all (Story 2.5 AC7 / 2.6 AC6 / 2.7 AC3), so it
   creates **no entry** and does not move `canUndo`.

4. **AC4 — Undo reverts exactly one gesture and the dish repaints to match.** After N commits, one
   `undo()` restores the grid as it stood before gesture N — occupant array equal cell-for-cell to
   the pre-gesture value — and the canvas repaints to show it. Undoing N times returns to the
   seeded grid; the (N+1)th undo is impossible (AC5), never a silent no-op behind an enabled
   button.

5. **AC5 — `canUndo` is reactive and drives the UNDO button's `disabled` live.** `canUndo` is
   `false` with an empty ring, becomes `true` on the first commit, and returns to `false` after the
   last entry is consumed — **each transition re-rendering the button with no other interaction**
   (FR-3.8: "the button is disabled when `canUndo` is false"). A `canUndo` read out of a ref
   satisfies the type and never re-renders; see trap 1 and the spec conflict it comes from.

6. **AC6 — Snapshots carry dimensions, and the restored grid is rebuilt from them.** A snapshot is
   `{ occupant, <dims> }` (RFC-005 D6). Restoring builds a **new** `RenderableGrid` object from the
   snapshot's dimensions, a **copy** of its occupant map, and a **fresh zero-filled** `Uint16Array`
   age buffer. Dimensions never change in this story — 2.14 is the resizer — so this is groundwork
   whose correctness is proved by unit test, not by a user action. The `size` the canvas receives
   and the dimensions the grid carries must be **structurally incapable of disagreeing** by the end
   of this story (forced decision 4), because the moment they can, `assertGridMatchesSize` throws
   `GridRendererDimensionMismatchError` out of the grid effect and unmounts the editor (trap 11).

7. **AC7 — Never persisted; component lifetime is undo lifetime.** No `localStorage` key, no
   repository write, no serialisation of the ring anywhere. It survives every re-render and (from
   Epic 3) every Lab↔Run switch because `<BattlePage>` stays mounted; it dies when `<BattlePage>`
   unmounts. **No explicit reset code is written for the Gallery return** — 2.16 adds the
   navigation that exercises it; the reset is structural (RFC-005 D6: "component lifetime *is* the
   undo lifetime").

8. **AC8 — Entries are independent copies, and the seed is not an entry.** Painting after an undo
   does not corrupt an older entry; no two entries alias the same `Uint8Array`; and the ring holds
   only *previous* values, never the current one — after N commits there are exactly N entries, and
   N undos land on the seed with `canUndo === false` (trap 6).

9. **AC9 — The three deferred-work items this story owns are closed.** `deferred-work.md` names
   Story 2.8 as owner of exactly three entries, and all three go live *because of* this story:
   (a) the resize effect's stale `endStroke` / `onStrokeCommit` closure — inert only while the
   commit handler was a bare `useState` setter, which AC1 ends; (b) a `grid` prop change mid-stroke
   is never reconciled — unreachable only while nothing could change `grid` during a drag, which
   undo ends; (c) mid-drag tool switching is unpinned — "where a wrong answer starts corrupting the
   undo ring". Each is closed with a test, or explicitly re-deferred with a written reason.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (AC1, AC4, AC9)**
  - [x] `apps/web/components/battle/BattlePage.tsx` in full — especially the `seedGrid` memo, the
        `lastSeedRef` set-state-during-render re-seed, and the `editedGrid ?? seedGrid` fallback.
        Those three lines are what this task replaces, and the comments on them state *why* the
        seed is held separately from the edits (the resource settles after the first render).
  - [x] `apps/web/components/PetriDishCanvas.tsx`'s `EditDish` in full — the construction effect,
        the **grid effect** (whose own comment names "Story 2.8's undo" as its reason to exist),
        the resize effect, `endStroke`, and `handlePointerDown`'s reclaim.
  - [x] `apps/web/components/battle/BattleEditorView.tsx` — the seven-prop slice of §3.3 and the
        `onCommitGrid` pass-through comment ("`<BattlePage>` owns what a commit MEANS … Story 2.8's
        undo ring tomorrow").
  - [x] `docs/implementation-artifacts/deferred-work.md` — the three entries naming Story 2.8.
  - [x] `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` Decision 6 (and
        Decision 2's tree annotation), plus `component-tree-battle-page.md` §3.1, §3.3, §3.8, §4.

- [x] **Task 2 — `useUndoableGrid` (AC1, AC2, AC6, AC7, AC8)**
  - [x] New file `apps/web/lib/useUndoableGrid.ts` — camelCase, not dotted (project-context
        naming), beside `useAsyncResource.ts` / `useInView.ts` / `useInertBackground.ts`. ❌ Not
        `lib/canvas/`: undo is an editor concept, not a rendering one (the same argument
        `lib/tool.ts`'s header makes for itself).
  - [x] Shape per spec §4 exactly: `[{ value, commit(next) }, { undo, canUndo }]`. ❌ Do **not**
        widen it with `redo`, a `history` accessor, a `depth` number, or a `clear()` — Redo is
        explicitly out of MVP scope (PRD §"Redo"; RFC-005 D6) and nothing needs the others.
  - [x] `commit(next)` pushes a snapshot of the **current** `value` (not of `next` — trap 2), then
        sets the value to `next`. Cap at 30, evicting oldest.
  - [x] Snapshot = copied occupant (`.slice()`) + dimensions. ❌ No `age` (trap 4). ❌ No structural
        clone of the whole `RenderableGrid`.
  - [x] `undo()` pops the newest entry and rebuilds a **new** `RenderableGrid` from it (AC6).
        Returning an object identity the canvas has already painted breaks the repaint (trap 5).
  - [x] `canUndo` is a **boolean** that changes with React state (AC5, forced decision 2).
  - [x] Handle the **seed changing after mount** — `<BattlePage>`'s seed arrives asynchronously and
        is `null` on the first render. Whatever the hook's signature, a new seed must reset both
        the value and the ring; carrying entries across a seed change means undo restores a
        *different battle's* grid (trap 8). Same class as the open `sessionRoster` entry in
        `deferred-work.md`; unreachable today for the same reason, and it must not be *newly*
        introduced here.
  - [x] `commit` and `undo` must have **stable identities** across renders (trap 7) — the canvas's
        resize effect holds one of them in a closure it does not re-register.

- [x] **Task 3 — Wire it into `<BattlePage>` (AC1, AC4, AC6, AC7)**
  - [x] Replace `editedGrid`/`setEditedGrid` with the hook. `onCommitGrid` becomes the hook's
        `commit`; `grid` becomes the hook's `value`.
  - [x] Preserve the async-seed behaviour the existing comments justify: the editor must still
        render the loaded grid when the resource settles *after* the first render, and must still
        re-seed when `seedGrid`'s identity changes.
  - [x] Thread `onUndo` + `canUndo` down to `<BattleEditorView>` (§3.3's `onUndo(): void; canUndo:
        boolean`), which forwards them to Task 4's status bar. ❌ Nothing else joins the prop slice.
  - [x] Settle forced decision 4 (`size`) and record it.

- [x] **Task 4 — The UNDO affordance (AC5)**
  - [x] Per forced decision 1: a minimal `<EditorStatusBar>` at
        `apps/web/components/battle/EditorStatusBar.tsx`, carrying **only** the undo slice of
        §3.8's interface (`onUndo`, `canUndo`). ❌ No `stats` prop, no placeholder Generation/Living
        Cells row, no SAVE button, no zoom slider — 2.12, 2.13 and §9.1 respectively, and a rendered
        inert control is what NFR-4.1 forbids (the rule Stories 2.4 and 2.5 both applied).
  - [x] Label **UNDO** (mockup `petri-dish-lab-mode.html:823`). `disabled` bound to `!canUndo`.
  - [x] Styling from `--gol-*` tokens only — `--gol-bg-secondary` + `--gol-border` for the bar,
        `--gol-action-disabled` / `--gol-action-disabled-bg` for the disabled button. **No raw hex**
        (AR-46 is a live lint rule on `apps/web`).
  - [x] Mount it inside `<MainContent>`, whose `position: relative` was left in place by Story 2.5
        as exactly this element's containing block — the comment says "nothing positions against it
        yet"; make it say what is true afterwards.
  - [x] The mockup's `.stats-bar` is `position: fixed; left: 320px` — 320px is the **sidebar width**
        that does not exist yet (2.9). Reproducing the literal offset now leaves the bar starting
        320px from the left of nothing. Match the mockup's *picture*, not its CSS, and say which you
        did (the same call `GridContainer`'s comment already made about `padding-bottom: 80px`).
  - [x] Keyboard-operable and axe-clean; the disabled state must be exposed to assistive tech, not
        merely painted grey.

- [x] **Task 5 — Close deferred item (a): the stale `endStroke` closure (AC9)**
  - [x] `deferred-work.md`: *"The resize effect captures a stale `endStroke`, and therefore a stale
        `onStrokeCommit`"*. Its own prescription: a `useRef` holding the latest `endStroke`, read by
        the `ResizeObserver` callback. Take it — a stable `commit` from Task 2 is **not** a
        substitute, because the staleness is in the whole `endStroke` closure (it also captures
        `grid`, `size` and `onStrokeCommit` from that render), and relying on one prop's identity
        re-arms the trap the moment another story wraps the handler.
  - [x] Update the effect's dep-omission comment to name the staleness, which it currently does not.

- [x] **Task 6 — Close deferred item (b): a `grid` change mid-stroke (AC9)**
  - [x] Undo makes this reachable for the first time: the user can press UNDO with a pointer down.
        Per forced decision 5, choose **end the stroke** or **rebase the working buffer**, implement
        it, and record the reasoning. This is a policy 2.14 (resize) and 2.15 (Clear) inherit
        unchanged, so it is a decision with three stories downstream of it, not a local patch.
  - [x] Pin it with a test that changes the `grid` prop between `pointerdown` and `pointerup` and
        asserts the chosen behaviour — including that the external change survives (today the
        commit reverts it wholesale).

- [x] **Task 7 — Close deferred item (c): mid-drag tool switching (AC9)**
  - [x] A test that opens a stroke, switches the tool mid-gesture (the 2.7 toggle is
        keyboard-operable), and asserts the stroke still paints its **pinned** `ref` and still
        commits **exactly once**. Story 2.7's forced decision 4 chose the pin on the grounds that
        "an entry that is half paint and half erase has no coherent meaning" — this story is where
        that entry becomes real, and it ships unpinned today.

- [x] **Task 8 — Tests (AC1–AC9)**
  - [x] **Hook units** (`apps/web/lib/useUndoableGrid.test.ts`, RTL `renderHook`): ring cap at 30
        with the 31st evicting the oldest; commit snapshots the previous value; N commits → N
        undos → seed, then `canUndo === false`; entries do not alias (mutate a committed buffer,
        assert the entry is unchanged); restore rebuilds dimensions and a zero age buffer of the
        right length; a new seed resets value **and** ring.
  - [x] **Memory claim (AC2)**: assert the arithmetic, not a heap measurement — `snapshot bytes ===
        cols * rows` and `30 * 6000 <= 180 * 1024`. A test that tries to weigh the heap measures the
        runtime, not the design.
  - [x] **`<BattlePage>` integration**: click → UNDO enables; UNDO → the grid prop the editor
        receives reverts; UNDO again → disabled. A **drag** (press-move-move-release) → one UNDO
        reverts the whole stroke (AC3) — Story 2.6's review specifically rejected "a click with a
        `pointerUp` bolted on" as a stand-in for a real drag.
  - [x] **Repaint (AC4)**: after `undo()`, `drawFull` is called with the restored grid — i.e.
        `paintedGridRef`'s identity skip did **not** swallow it (trap 5). Mutation-check this one:
        delete the "build a new object" line and confirm the test reddens.
  - [x] **`<BattleEditorView>`**: `onUndo`/`canUndo` forwarded, button named not merely counted (a
        Story 2.7 review finding, twice).
  - [x] **e2e** (`apps/web/e2e/battleRoute.spec.ts`): paint, press UNDO, assert the dish returns
        toward its pre-paint state. ⚠️ **Use a generous threshold, exactly as 2.7's reversal test
        does** — `restoreGridLinesOver` double-composites the translucent grid line at shared cell
        edges and cell corners, so ~30–35% of painted pixels legitimately differ after a perfect
        reversal. The canvas is **not** pixel-reversible even though the grid state is exactly
        reversible (`deferred-work.md`, "Deferred from: Story 2-7-eraser implementation"). An
        e2e demanding near-zero residual will fail against correct code.
  - [x] `npm run ci` before calling it done, and **report its real result** — redirect to a file and
        echo `$?`; `| tail` reports tail's status, not the gate's (project-context, a real
        Story 1.9 failure).
  - [x] ⚠️ `npm run bundle:check`: `/battle` and `/battle/new` have **~3.3–3.4 KB of headroom**
        against a 310 KB budget (`deferred-work.md`, 2.7). A status bar can plausibly consume it.
        **Do not raise a budget unilaterally** — both prior moves were Sidiar's call. If it goes
        over, record the measurement and the options (forced decision 1's plain-`<button>` variant
        is the zero-import one) and stop for Sidiar.

### Review Findings

Reviewed by **Sonnet** — deliberately the complementary model to the Opus implementation — via
three parallel layers (Blind Hunter: diff only; Edge Case Hunter: diff + full repo access, path
enumeration; Acceptance Auditor: diff + this story file + RFC-005/component-tree, independently
re-running `npm run ci` rather than trusting the Dev Agent Record). AC1–AC9 independently
re-verified against the code, not taken on the Dev Agent Record's word: `canUndo`'s reactive
boolean, forced decision 4's derived `size`, forced decision 5's `endStroke(false)`, the
`position: relative` removal, the `lastSeedRef` → state-based re-seed, and the AR-30 memory
arithmetic (175.8 KB ≤ 180 KB, `age` genuinely excluded) all check out exactly as recorded — no AC
violation, no silent-failure trap triggered, no spec conflict silently resolved.

- [x] [Review][Decision] **Forced decision 5 (`endStroke(false)`) silently discards a user's
      mid-stroke paint with no visible feedback — confirm this is acceptable UX, not just correct
      engineering.** [apps/web/components/PetriDishCanvas.tsx, grid effect] The engineering
      analysis is sound and independently re-verified: the story's own literally-recommended
      option (a) ("commit what it painted") is *logically impossible* to combine with Task 6's own
      requirement that "the external change survives" — committing a working buffer sliced from
      the pre-change grid necessarily reverts that change. Discard is the only self-consistent
      choice between the two, and it is pinned by tests proving the external change survives and
      the discarded stroke does not. What was **not** put to a human: a user who is mid-drag when
      an UNDO lands (today reachable only by continuing to hold the mouse down on the canvas while
      a *separate* input, e.g. Tab+Enter, activates the UNDO button — mechanically rare, not
      reachable from a single mouse) loses that paint with zero toast, flash, or other affordance
      telling them it happened. Stories 2.14 (resize) and 2.15 (Clear) inherit this policy
      unchanged per the Dev Agent Record, so a "yes, silent discard is fine" or "no, add feedback"
      answer now avoids relitigating it three more times. **Question for Sidiar:** is silent
      discard acceptable here, or does this need a visible signal before 2.14/2.15 build on it?
      **Resolution (Sidiar, 2026-08-27): silent discard is accepted. Ships as implemented, with no
      visible signal.** The engineering constraint stands on its own — option (a) is provably
      incompatible with Task 6's "the external change survives" requirement, so discard is the only
      self-consistent behaviour — and the UX cost of leaving it silent is judged acceptable at the
      reachability this race actually has: today it requires holding a mouse button down on the
      canvas while a *separate* input activates UNDO, which no single-pointer interaction produces.
      Adding a toast or flash would put a user-visible affordance on a path a user is not expected
      to reach, and would need its own placement, wording and dismissal decisions that no AC asks
      for. **This is a policy decision, not a per-story one: Stories 2.14 (resize) and 2.15 (Clear)
      inherit silent discard unchanged and must not relitigate it.** Revisit only if a later story
      makes the race reachable from a single pointer — that changes the premise this call rests on.
      No code change from this decision.

- [x] [Review][Patch] Strengthen `useUndoableGrid.test.ts`'s restore-copy claim so it actually
      distinguishes `restore()`'s own defensive copy from `commit()`'s
      [apps/web/lib/useUndoableGrid.test.ts:122-153] — the existing "hands back a grid whose buffer
      is not the ring entry" test compares `restored.occupant` against `seed.occupant`, but the
      ring entry is *already* a copy of `seed.occupant` (made by `commit()`'s own `snapshot()`), so
      the assertion holds whether or not `restore()` makes a second copy — mutation-testing away
      `restore()`'s `.slice()` left it (and all 15 other hook tests) green. Fixed by adding a
      call-count spy on `Uint8Array.prototype.slice`, the one primitive both copies go through:
      asserts a strictly higher call count after `undo()` than after `commit()`. Mutation-checked
      both ways — reddens alone when `restore()`'s `.slice()` is removed, passes with the real
      code. Not a production bug (the popped entry is discarded from `past` the same tick, so
      nothing internal could observe the aliasing either way); this closes a "claim not actually
      mutation-checked" gap of exactly the kind this project's own review discipline (Story 2.7)
      calls out elsewhere in this story.

- [x] [Review][Defer] Bundle headroom (2.1–2.8 KB across `/battle`, `/battle/new`, and home) is
      thin heading into Stories 2.9–2.13, which all add UI weight — deferred, pre-existing
      trajectory, already tracked with Sidiar's call flagged in `deferred-work.md` (the
      story's own re-measurement entry). Not this story's problem to fix; flagged for planning
      before 2.9 starts.

**Patches applied (own commit):** one — the `useUndoableGrid.test.ts` mutation-check gap above.

**Deferred:** one — the bundle-headroom trajectory, already tracked.

**Decision-needed:** one — forced decision 5's silent-discard UX, above. **Story left in
`review`** pending Sidiar's answer (`sprint-status.yaml` unchanged).

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **What the UNDO button lives in.** Options: *(a)* a minimal `<EditorStatusBar>` carrying only
   `onUndo`/`canUndo`, the same "this story's slice of a bigger interface" move
   `BattleEditorViewProps` already documents for §3.3's ~13 props; *(b)* a provisional button in the
   existing `ToolbarRow`, deleted in 2.12. **(a) is recommended**, and it is *not* the half-built
   panel Story 2.4 declined: §3.8's bar is a real component with a real, complete responsibility
   here (the epic AC says "the UNDO button in the status bar"), and 2.12/2.13 *add* to it rather
   than unpick it — the opposite of 2.7's toggle, which 2.9 deletes wholesale. Whichever you take,
   **nothing inert renders**: no stats placeholder, no disabled SAVE.
2. **Whether the button is MUI `<Button>` or a `styled('button')`.** The mockup uses a plain
   `<button class="btn">`, and `@mui/material/Button` is currently imported **only** by
   `DeleteBattleDialog` (gallery route) — pulling it onto the battle route spends part of a ~3.3 KB
   headroom. `styled('button')` is both more mockup-faithful and free, but hand-rolls the disabled
   and focus-visible states MUI would give. Recommended: measure with `bundle:check` and let the
   number decide; record which and why. Either way the disabled state must be a real `disabled`
   attribute, not a CSS-only grey.
3. **Where the snapshot ring physically lives: `useState` or `useRef` + a reactive flag.** RFC-005
   D6's *prose* says "a bounded ring … in local state"; its *snippet* puts `past` in a `useRef`.
   They cannot both be followed (see the spec conflicts below). Options: *(a)* the ring in `useState`
   with a functional update — one 30-element array copy per commit, ~240 bytes of pointer churn, and
   `canUndo` falls out for free; *(b)* the ring in a `useRef` plus a `useState` depth/flag that
   drives `canUndo`. **(a) is recommended** for having one source of truth; **(b) is acceptable**
   if you can state why, but two containers that must agree is exactly the shape `lib/tool.ts`'s
   trap 7 warns about. What is **not** acceptable is a ref with a derived `canUndo` that never
   re-renders (trap 1).
4. **Where `size` comes from once the grid owns its dimensions.** `<BattlePage>` passes
   `size={draft.gridSize}` while the grid separately carries `width`/`height`. AC6 makes dimensions
   a property of the snapshot, so from this story there are two sources for one fact. Options:
   *(a)* derive `size` from the current grid — `useMemo(() => ({ cols: grid.width, rows:
   grid.height }), [grid.width, grid.height])`, memoised on the **primitives** so the identity is
   stable (an inline literal churns the canvas's construction dep and throws away the retained
   renderer — Story 2.5 trap 7); *(b)* keep `draft.gridSize` and rely on them never disagreeing.
   **(a) is recommended**: they cannot disagree if there is only one of them, and 2.14 is the story
   where (b) starts throwing `GridRendererDimensionMismatchError` out of an effect. Record it either
   way — 2.14 inherits this choice.
5. **What a `grid` prop change mid-stroke does** (Task 6). Options: *(a)* end the stroke, committing
   what it painted — consistent with the resize effect's existing policy ("a mid-stroke re-layout
   ENDS the stroke", Story 2.6 Task 4), one line, and it reuses `endStroke`'s idempotence;
   *(b)* rebase the working buffer onto the new grid — preserves the in-flight gesture but has to
   decide what happens to cells the external change touched *and* the stroke also touched.
   **(a) is recommended** on precedent and cost; the user pressing UNDO with a pointer down is not
   a gesture whose continuation anyone has asked for. Whichever you take, 2.14 and 2.15 inherit it,
   so write the reasoning down rather than the mechanism.
6. **Whether a keyboard shortcut ships (Ctrl/⌘+Z).** No AC asks for one, no mockup shows one, and
   the hotkey hook in spec §4 is `useSimulationHotkeys` — Epic 3 (Story 3.19). **Recommended: no**,
   and say so, so the absence reads as a decision rather than an oversight.
7. **Whether `undo()` re-primes `paintedGridRef`.** It should not need to: the restored grid is a
   new object, so the grid effect's identity skip misses and `drawFull` runs (which is what AC4
   wants). Verify that rather than assuming it, and do **not** reach into the canvas to "help" —
   the ref's contract is "this grid is already on screen" and only the canvas may claim it.

### Spec conflicts and additions surfaced (do not silently pick one — this is the project rule)

- ⚠️ **`canUndo` is a function in RFC-005 D6 and a boolean in the component-tree spec.** RFC-005
  D6's snippet returns `{ undo, canUndo: () => past.current.length > 0 }`;
  `component-tree-battle-page.md` §4 and §3.8's `EditorStatusBarProps` both declare
  `canUndo: boolean`. The authority order (Architecture Decisions → owning RFC → companion specs)
  points at the RFC — but the RFC's own form **cannot satisfy its own epic AC**: `past` is a ref, so
  a function reading it triggers no re-render and the button's `disabled` freezes at its mount
  value. **Take the boolean**, note that the RFC snippet is illustrative (as several already are —
  `useAsyncResource`'s file header records the same about D1's `reload` sketch), and record the
  divergence in the Dev Agent Record rather than fixing the RFC in this story.
- ⚠️ **RFC-005 D6 contradicts itself on where the ring lives** — prose says "in local state", the
  snippet uses `useRef`. Resolve toward whatever makes `canUndo` reactive (forced decision 3) and
  say which sentence you followed.
- **RFC-005 D6's snapshot type names its dimensions `cols`/`rows`; `RenderableGrid` names them
  `width`/`height`.** The same two numbers under two specs — `gridRenderer.ts`'s
  `assertGridMatchesSize` already documents that seam and calls converting it into a loud failure
  "the highest-value assertion in this file". Pick one spelling for the snapshot, and be explicit
  at the boundary rather than letting the two drift.
- **RFC-005 D6's `past.current = [...past.current.slice(-29), snap]` is an illustration, not a
  mandate.** It is one full array copy per commit. A `push` + `shift`, or a true circular buffer,
  is equally compliant with AR-30. Do not treat the snippet's mechanics as the contract; the
  contract is 30 entries, oldest evicted, ≤180 KB.
- **Spec §3.10 types the edit variant's grid as `Grid`; this story still passes `RenderableGrid`.**
  Unchanged from 2.4–2.7 and still a *not-yet*, not a divergence: the typed-array `Grid`
  (RFC-004 §3.4) lands in Story 3.3 and satisfies `RenderableGrid` structurally.
- **`onStrokeCommit` / `onCommitGrid` stay exactly as they are.** 2.6's and 2.7's warning stands a
  third time: if you find yourself widening either signature (a "gesture kind", a cell list, an
  undo hint), stop — 2.14 and 2.15 arrive at the same seam.
- **The epic AC's "resets on return to Gallery" and 2.16's "returning to the Gallery resets the
  undo ring" are the same claim, satisfied structurally.** `<BattlePage>` unmounts; the hook dies.
  Do **not** write reset code here, and do not treat 2.16's restating of it as a second requirement.
- **`docs/project-context.md` still says "no PR flow exists"** — stale since Story 2.4 (branches
  are `story/<story-key>`, merged via PR with a merge commit). Noted, not this story's to change.
- If you find a *new* conflict between `docs/project-context.md` and an RFC, **surface it** —
  several rules there are deliberate overrides of stale RFC snippets, and new ones are signal.

### Silent-failure traps — the intuitive implementation is wrong

1. **`canUndo` read out of a ref.** Compiles, types correctly, and the button never changes state:
   it renders once, disabled, and stays disabled through every commit. Every unit test that calls
   the returned `canUndo` directly still passes, because the *value* is right — only the *render*
   never happens. Assert the button's `disabled` attribute through the DOM, not the hook's return.
2. **Snapshotting `next` instead of the current `value`.** The off-by-one that looks correct: the
   first undo appears to work (it restores the grid you just committed, which is the grid you are
   already looking at, so nothing visibly changes) and every subsequent undo is one gesture behind.
   Snapshot **before** the state update, as RFC-005 D6's snippet does.
3. **Storing the `RenderableGrid` object rather than a copy of its occupant.** `endStroke` commits
   `stroke.workingGrid`, and Story 2.6 trap 6 calls the committed buffer "radioactive" precisely
   because the next stroke slices a fresh copy off it — today nothing writes through it. That is a
   *convention*, not a compiler guarantee (`readonly Uint8Array` is readonly on the **property**,
   not the contents — Story 2.7 Dev Notes), and 2.14/2.15 will add new commit sources. `.slice()`
   the occupant into the ring; it is 6 KB and it removes a whole class of future corruption.
4. **Storing `age` in the snapshot.** Every initial grid has `age === 0` everywhere (RFC-005
   "Representation note"), so the age buffer carries no information — but it is a `Uint16Array`,
   twice the width of the occupant map. Including it makes a snapshot 18 KB instead of 6 KB and 30
   levels **540 KB instead of 176 KB**, blowing AR-30's ≤180 KB budget threefold with every test
   still green. Rebuild a zero-filled age buffer on restore instead.
5. **Returning a grid object the canvas has already painted.** `EditDish`'s grid effect skips when
   `paintedGridRef.current === grid`. If `undo()` hands back an object identity that was previously
   committed and painted (by caching restored grids, or by storing whole `RenderableGrid`s per
   trap 3 and returning one), the repaint is **skipped** and the canvas keeps showing the undone
   state while React state holds the restored one — the model and the view disagree silently until
   some later full repaint. Always build a new object.
6. **Counting the seed as an entry.** After N commits there are exactly N entries. An
   implementation that pushes the seed at mount makes `canUndo` true on a freshly-opened battle
   with nothing to undo, and the first press appears to do nothing.
7. **Assuming a stable `commit` closes the stale-closure item.** It does not — the resize effect's
   `ResizeObserver` callback captures the whole `endStroke` closure, which also holds that render's
   `grid`, `size` and `onStrokeCommit`. Fix it where the deferred entry says (a ref to the latest
   `endStroke`), and keep `commit` stable anyway.
8. **Dropping `<BattlePage>`'s async-seed handling while replacing `editedGrid`.** The existing
   comments spell out why the seed is held separately: the battle resource settles **after** the
   first render, so `useState(seedGrid)` captures `null` forever and the editor stays permanently
   blank with no error. The `lastSeedRef` set-state-during-render re-seed is the documented React
   pattern and must survive the refactor — extended to reset the ring too, not just the value.
9. **A churning `value` identity.** `paintedGridRef` guards on identity, so a `value` derived fresh
   per render makes `EditDish` `drawFull` ~6,000 cells on **every** unrelated re-render — no error,
   no test failure, just the dirty-region design silently switched off. `value` must be state.
10. **A ring cap of 30 that stores 31.** "30 undo levels" (FR-3.8) means 30 *reversible gestures*.
    Keeping the current value in the ring as well makes the effective depth 29 or the memory 186 KB,
    depending on which end you got wrong.
11. **`size` and the grid's dimensions drifting apart.** Not reachable in this story — nothing
    changes dimensions until 2.14 — which is exactly why the decision must be made *now* (forced
    decision 4). When it does become reachable, the failure is `assertGridMatchesSize` throwing
    `GridRendererDimensionMismatchError` out of the grid effect, which unmounts the editor; and
    `handlePointerDown`'s `if (grid.width !== size.cols …) return;` guard silently makes the dish
    unpaintable before that.
12. **A snapshot's occupant values are indices into `rosterIds`, not organism ids.** The dense
    encoding is `cell value = roster index + 1` (RFC-006 Decision 2), so an entry taken at gesture
    N is only meaningful while `rosterIds` keeps the ordering it had then. It is safe today
    *because the roster is append-only* — `<BattlePage>`'s union comment already forbids reordering
    ("would silently repaint every already-placed cell as a different organism"), and appending
    leaves every existing index untouched. Do not weaken that: an undo ring is the second thing
    (after the grid itself) that a roster reorder would silently corrupt, and 2.9/2.10 are the
    stories that could introduce one. ❌ Do **not** "fix" this by storing organism ids in the
    snapshot — that is a different encoding, 30× larger, and it contradicts Decision E's rule about
    what is and is not runtime-only.
13. **`getContext('2d')` is `null` under jsdom, always.** The renderer is never constructed in
    component tests, so any assertion phrased as "the canvas repainted" must be made against a
    recording context or a spy, exactly as `PetriDishCanvas.test.tsx` already does. The model half
    of every claim (the grid value reverted) tests fine without it; the view half does not.

### Previous story intelligence

**Story 2.7 (`2-7-eraser.md`, merged 6e7edd4)** — the seam this story consumes.
- The commit pipeline is complete and must not change shape: one stroke → one `endStroke(true)` →
  one `onStrokeCommit(workingGrid)` → `onCommitGrid`. Click, drag and erase all arrive there, and
  a gesture that changed nothing arrives **not at all**. That is what AC3 rests on; it is already
  proved by tests in `PetriDishCanvas.test.tsx` and `BattleEditorView.test.tsx`.
- `Tool` is the two-arm union with `refForTool` resolving the eraser to ref `0`. The undo ring is
  tool-agnostic — an erase entry and a paint entry are the same shape. ❌ Do not add a "gesture
  kind" to the snapshot.
- Its review deferred 10 items; **one names this story** (mid-drag tool switching, Task 7). Two
  more name 2.9, one names 6.11.
- Two process patterns that keep recurring in reviews here: **duplicated test helpers get found**
  (parameterise `mount`/`mountEditor` in `PetriDishCanvas.test.tsx`; three open deferred entries
  are about that file's helpers, and this story touches it), and **claims are mutation-checked** —
  delete the line, confirm the intended test actually reddens. Story 2.7's review found a vacuous
  guard test exactly that way.

**Story 2.6 (`2-6-drag-painting.md`)** — coalescing. "Exactly one commit fires for the whole
gesture … one future undo entry per stroke" is *this* story's AC3, already implemented and pinned.
It also settled: `pointercancel` commits rather than discards; a mid-stroke re-layout ends the
stroke; a secondary button's release does not end it. Its review deferred 12 items, **two of which
name this story** (Tasks 5 and 6).

**Story 2.5 (`2-5-click-placement.md`)** — the instruction this story executes, recorded twice:
"❌ Do **not** build a mini undo ring — Story 2.8 replaces this with `useUndoableGrid`". Nobody did,
so `<BattlePage>` holds a bare `useState` and there is nothing to unpick. Its forced decision 2 also
put tool→ref resolution in `<BattleEditorView>`, and its trap 7 is why every canvas construction
dependency (`size`, `palette`, `colors`) is memoised — forced decision 4 must not break that.

**Story 2.4 (`2-4-edit-canvas-display.md`)** — forced decision 2: "pick the smaller thing, and do
**not** build a mini undo ring". Same instruction, one story earlier. Also the source of the
"don't stub a half-built panel" rule that forced decision 1 has to argue against explicitly.

**Story 2.3 (`2-3-renderer-dirty-region-editing-paths.md`)** — the dirty-region contract. Undo is
one of the three cases the grid effect's comment names as *wanting* the full repaint
(`drawFull`, not `draw` + `markDirty`): the whole grid may differ, and `drawFull` re-primes the
colour-state baseline, which a dirty repaint would leave stale. ❌ Do not try to make undo
incremental — that is a real optimisation with a real correctness cost, and no AC asks for it.

### Git intelligence (last 5 commits)

`6e7edd4` merge of `story/2-7-eraser` (PR #8) · `d638843` docs: story 2-7 decision resolution ·
`f789aba` run stats · `3d84511` 2.7 review fixes · `9e29a49` 2.7 feature commit.

Conventions visible in that history: `feat:` / `fix:` / `docs:` prefixes naming the story in the
subject; **review fixes land as their own commit**, never folded into the feature commit; branches
are `story/<story-key>`, merged via PR with a **merge commit** — never squashed, because the
per-commit rationale is the record. Story subagents may commit and push to their own `story/*`
branch without asking; **merging is always Sidiar's call**, and approval for one merge never
carries to the next.

### Latest technical information

No new dependency, and none is warranted — an undo ring is thirty `Uint8Array` copies. Everything
needed is installed and pinned: React 19.2.7, Next 16.2.10, MUI 9.3.1 + Emotion, TypeScript 5.9.3
strict, Vitest + RTL (`@testing-library/react` 16.3.2, which exports `renderHook`), Playwright,
axe-core, jsdom 30.0.1. **Version policy is caret-on-current-stable — do not bump anything
opportunistically.** ❌ Explicitly not warranted here: `immer`, `use-undo`, `zundo`, or any history
library — RFC-005's entire premise is no global store and no state library, and the ring is ~40
lines.

- **React 19 `useState` functional updates** are the correct form for `commit` — reading `value`
  from the closure to build the snapshot is fine (it is the render's value, which is what the
  gesture started from), but the ring update must not depend on a stale ring. Prefer
  `setRing(prev => …)`.
- **`Uint8Array.prototype.slice()`** returns a new typed array with a copied buffer;
  `subarray()` returns a **view onto the same buffer** and is the one-character mistake that makes
  trap 3 real. Use `slice()`.
- **`Object.is` identity is what `paintedGridRef` compares** — see trap 5. A structurally-equal
  grid with a different identity repaints; an identical identity does not.
- **`cssVariables: true` is already on the single `createTheme()`** and is load-bearing: without it
  `<Button>` / `<IconButton>` throw at render because `alpha()` runs over a `var()` string. Any MUI
  control added in Task 4 inherits that dependency — **do not construct a second theme** (Decision J:
  exactly one `createTheme()`).
- **jsdom has no layout and no 2D context**: `getBoundingClientRect()` returns zeros unless stubbed
  and `getContext('2d')` returns `null`. Component tests stub the rect and use the recording
  context; geometry and pixel claims are the e2e's job.
- **`renderHook` + `act`**: state updates from `commit`/`undo` must be wrapped in `act`, or React 19
  warns and the assertions read pre-update values.

### What NOT to build (scope boundaries)

❌ **Redo, a `future[]` stack, a redo button** — explicitly out of MVP scope (PRD §Redo: "Undo is
   supported (FR-3.8); Redo is not"; RFC-005 D6 leaves *room* for it, which is not a licence)
❌ A history panel, a gesture list, an undo-depth indicator, a "N steps back" tooltip
❌ Undo of anything other than `initialGrid` — organism-library edits, battle rename and simulation
   progress are all explicitly out (RFC-005 D6 "Scope")
❌ Persisting the ring, serialising it, or putting it anywhere near a repository or `localStorage`
❌ Explicit reset-on-Gallery-exit code — the unmount does it (AC7); 2.16 owns the navigation
❌ A keyboard shortcut, unless forced decision 6 explicitly takes it and records why
❌ `<OrganismRoster>`, roster rows, the add dropdown, an `<EditorSidebar>` shell (2.9/2.10)
❌ `<BattleNameField>`, `isDirty`, dirty tracking of any kind (2.11) — an undo that clears
   `isDirty` is *wrong* anyway (undoing to the seed is not the same as being saved)
❌ Living-cell stats, per-organism counts, colour chips, Generation 0 (2.12) — the status bar ships
   with UNDO and nothing else
❌ SAVE, `organismIds` pruning, any repository **write** (2.13)
❌ Grid resize, `<GridSettingsSection>`, the preset control, `<ResizeClipWarningDialog>` (2.14) —
   AC6 is groundwork *for* it, not a down payment on it: no resize UI, no dimension-changing commit
❌ Clear Petri Dish / Reset (2.15) — it will be an undoable commit, through this story's unchanged
   seam, in its own story
❌ Back navigation, the unsaved-changes guard, `beforeunload`, `useDirtyGuard` (2.16)
❌ A mode toggle, a fullscreen affordance, a `'run'` branch, `onRendererReady` (Epic 3)
❌ Any widening of `onStrokeCommit` / `onCommitGrid`, or of `useUndoableGrid`'s §4 return shape
❌ Any change to the frozen `GridRenderer` contract (`component-tree-battle-page.md#5`)
❌ Making undo incremental (`markDirty` + `draw` instead of `drawFull`) — see Story 2.3 above
❌ Any `packages/*` change — this story is `apps/web` only, plus `@gol/test-utils` **usage** in
   fixtures (never a change to it)
❌ A Web Worker (not in the MVP)
❌ Raising a bundle budget — Sidiar's call, both prior times

### Project Structure Notes

New:
- `apps/web/lib/useUndoableGrid.ts` + `useUndoableGrid.test.ts` — camelCase, never dotted
  (project-context naming decision 2026-07-16). Beside the other hooks in `lib/`, **not** in
  `lib/canvas/`.
- `apps/web/components/battle/EditorStatusBar.tsx` + test — spec §3.8, beside `BattleHeader.tsx`
  and `BattleEditorView.tsx` (forced decision 1 may change this).

Modified:
- `apps/web/components/battle/BattlePage.tsx` — hook replaces `editedGrid`; `size` per forced
  decision 4; `onUndo`/`canUndo` threaded down.
- `apps/web/components/battle/BattleEditorView.tsx` — two props added to the §3.3 slice; mounts the
  status bar.
- `apps/web/components/PetriDishCanvas.tsx` — Tasks 5 and 6 only. ❌ No new prop, no new variant,
  no tool branch (Story 2.7 AC6 keeps this file tool-agnostic).
- `apps/web/components/battle/BattlePage.test.tsx` — ⚠️ carries a **pre-existing, load-dependent
  flake** reproduced on `main` (three tests snapshot the recording context immediately after
  `findByRole` and assume the construction effect flushed; ~1 failure in 6–10 parallel runs). The
  deferred entry assigns it to 2.11 as "the first that must touch this file" — **this story touches
  it first**. Fix it (drop the unsafe `as` casts; `await waitFor(…)` for the context) or record why
  not; either way do not mistake it for a regression this story caused.
- `apps/web/components/PetriDishCanvas.test.tsx`, `BattleEditorView.test.tsx`,
  `apps/web/e2e/battleRoute.spec.ts`.

Unchanged, deliberately: `lib/tool.ts`, `lib/canvas/*` (the renderer, `cellLine`, `dirtyCells`,
`refToFillGroup`, `renderableGrid`), every `packages/*`, `themes.css` (no new token is needed —
`--gol-bg-secondary`, `--gol-border`, `--gol-text-secondary`, `--gol-action-disabled` and
`--gol-action-disabled-bg` cover the bar and its disabled button).

### References

- [Source: docs/planning-artifacts/epics.md#Story 2.8: Undo] — the five epic ACs verbatim: the
  30-snapshot ring of (occupant + dimensions) at ≤180 KB, the status-bar UNDO button disabled on
  `canUndo === false`, one drag stroke reverting as a single unit, the ring living in
  `<BattlePage>` and never persisted, and dimensions restored as groundwork for 2.14.
- [Source: docs/planning-artifacts/epics.md#198] — AR-30 in full: "`useUndoableGrid` — 30-snapshot
  ring buffer (occupant + dimensions), gesture-coalesced strokes, ≤180 KB budget; component
  lifetime = undo lifetime".
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 6] — the
  owning decision: why `<BattlePage>`, the granularity rule, the capacity maths, the scope list,
  and the reference snippet (whose `canUndo` shape and `useRef` placement are the two conflicts
  above).
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 2] — the
  component tree annotated with state placement: "undo history (≤30) — co-located hook (Decision 6)
  — survives mode switch".
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 4] — the
  dual-grid model and the "Representation note" establishing that `initialGrid` age is 0 everywhere
  (trap 4's authority).
- [Source: docs/planning-artifacts/component-tree-battle-page.md#4] — `useUndoableGrid(seed: Grid)`
  returning `[{ value, commit }, { undo, canUndo: boolean }]`; "**Epic 2 implements the full
  RFC-005 design**; Epic 3 adds no undo code".
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.8] — `<EditorStatusBar>`:
  responsibility, the full props interface this story takes a slice of, and its Epic-2 assignment.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3] — `BattleEditorViewProps`'s
  `onUndo(): void; canUndo: boolean` line, and "the grid and undo ring live in `<BattlePage>` …
  so the initial grid survives Lab↔Run switches and this view can unmount freely".
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.1] — `<BattlePage>` state list:
  "*ephemeral via hook:* `initialGrid` + undo ring".
- [Source: docs/planning-artifacts/architecture.md#A.6] — the memory budget: Edit snapshots at the
  100×60 cap are ≈6 KB each, ≈180 KB for 30 levels; "**30 undo levels retained at all sizes**";
  snapshots still capture grid dimensions.
- [Source: docs/planning-artifacts/architecture.md#125] — "each gesture is an undoable snapshot".
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-3.8] — 30 levels;
  history persists across Edit↔Play; history resets on returning to the Gallery.
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#716] — "Redo — Undo is
  supported (FR-3.8); Redo is not."
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html#823]
  — the UNDO button in `.stats-bar`, beside SAVE; `.stats-bar` is `position: fixed; left: 320px`
  (the not-yet-existing sidebar's width — Task 4).
- [Source: docs/implementation-artifacts/deferred-work.md] — the three entries naming Story 2.8 as
  owner (stale `endStroke` closure; unreconciled mid-stroke `grid` change; unpinned mid-drag tool
  switch), plus the `BattlePage.test.tsx` flake, the `/battle` bundle headroom, and the
  `restoreGridLinesOver` double-composite that bounds what an e2e reversal test can assert.
- [Source: apps/web/components/battle/BattlePage.tsx] — the `seedGrid` memo, the `lastSeedRef`
  re-seed, `editedGrid ?? seedGrid`, and the comment naming this story as their replacement.
- [Source: apps/web/components/PetriDishCanvas.tsx] — the grid effect ("a grid that changes for a
  reason the canvas did not cause — Story 2.8's undo …"), `paintedGridRef`'s contract, `endStroke`,
  and the resize effect's dep-omission comment.
- [Source: apps/web/lib/canvas/gridRenderer.ts] — `assertGridMatchesSize`,
  `GridRendererDimensionMismatchError`, and `drawFull`'s "resets dirty state" contract.
- [Source: docs/project-context.md] — hot state in refs; no global store; camelCase non-dotted file
  names; AR-46 no raw hex; the commit gate; `npm run ci` is the local mirror and must not be piped.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (`bmad-dev-story`, story subagent under `implement-next-story`).

### Debug Log References

Full local gate, run as `npm run ci > /tmp/ci.log 2>&1; echo $?` — **redirected, never piped**
(project-context: `| tail` reports tail's status, which masked a real `format:check` failure in
Story 1.9). **Exit code 0.**

| Step | Result |
|---|---|
| `typecheck` | 5/5 packages pass |
| `lint` | 0 errors. One pre-existing warning (`BattleGallery.tsx:248`, unchanged on `main`) |
| `format:check` | pass (two files needed `prettier --write` first) |
| `spec:check` | pass — every ID cited in the new code resolves |
| `test:coverage` | **586 tests, 41 files, all passing** (was 542 before this story) |
| `build:standalone` | pass |
| `bundle:check` | **pass** — see the bundle note below |
| `e2e` | **172 passed, 4 skipped** across all four Playwright projects |

**`bundle:check` (the risk the story flagged):**

| Route | gzip | budget | headroom | before |
|---|---|---|---|---|
| `/battle` | 307.3 KB | 310 KB | **2.7 KB** | ~3.3 KB |
| `/battle/new` | 307.2 KB | 310 KB | **2.8 KB** | ~3.4 KB |
| `/` (home) | 327.9 KB | 330 KB | **2.1 KB** | ~3.5 KB |

All three are **inside budget and no budget was raised** (Sidiar's call, both prior times). The
status bar cost ~0.6 KB on the battle routes — forced decision 2 took `styled('button')` over
`@mui/material/Button`, which would have pulled the MUI button module onto that route for the first
time. Home moved because `<BattleTile>` imports `<PetriDishCanvas>`, so this story's canvas changes
ship to the Gallery too; the standing "home headroom is Sidiar's call" entry in `deferred-work.md`
is updated with the new measurement rather than acted on.

**Mutation checks** (delete the line, confirm the intended test actually reddens — the Story 2.7
review discipline):

| Claim | Mutation | Result |
|---|---|---|
| Task 6 terminate | remove `endStrokeRef.current(false)` from the grid effect | 3 tests red |
| Task 5 latest-closure | revert the observer to a direct `endStroke(true)` | 1 test red |
| AC4 repaint | swallow the grid effect's `drawFull` | 1 test red |
| AC6/trap 5 new object | store whole grids in the ring and hand the identity back | 3 hook units red |

⚠️ **One claim was WEAKER than it first looked, and the comment was corrected rather than the test
kept.** `<BattlePage>`'s repaint test does **not** prove trap 5's identity skip: `paintedGridRef`
holds the CURRENT grid and `restore()` returns a PREVIOUS one, so the two are never equal in any
flow reachable from that component — the identity-storing mutation passed it. The claim is pinned
where it *is* falsifiable (`useUndoableGrid.test.ts`'s "builds a NEW grid object on restore"), and
the integration test's comment now says so instead of claiming a mutation check it did not survive.

### Completion Notes List

**Forced decisions (all seven, as the story required):**

1. **The UNDO button lives in a minimal `<EditorStatusBar>`** — option (a), as recommended. It
   carries **only** `onUndo`/`canUndo`: no stats row, no placeholder Generation/Living Cells, no
   disabled SAVE, no zoom slider. Pinned by a test that counts the buttons *and* names them, plus
   explicit `queryByText(/generation/i)` / `queryByRole('slider')` absence checks, so 2.12's and
   2.13's content cannot arrive early without failing.
2. **`styled('button')`, not `@mui/material/Button`** — measured, and the number decided it. The
   mockup's control is a plain `<button class="btn">`, and `Button` is currently imported only by
   `DeleteBattleDialog` on the *gallery* route, so MUI would have added a module to the battle
   route against 3.3 KB of headroom. What MUI would have given free is written out instead: a real
   `disabled` attribute (never a CSS-only grey), and the `2px solid var(--gol-accent)` focus ring
   the Story 1.9 review established. Cost: ~0.6 KB.
3. **The ring lives in `useState`, in ONE state cell with the value** — option (a), as recommended.
   RFC-005 D6 contradicts itself (prose "in local state", snippet `useRef`); the prose is the half
   that can produce a `canUndo` which re-renders. One cell also means value and history can never
   be observed out of step. Cost: one ≤30-element array copy per *committed gesture* (~240 bytes,
   once per pointer-up — never per pointer-move).
4. **`size` is DERIVED from the grid** — option (a), as recommended. `<BattlePage>` no longer passes
   `draft.gridSize`; it passes `useMemo(() => ({ cols, rows }), [gridCols, gridRows])`, memoised on
   the **primitives** so the canvas's construction dep identity stays stable (Story 2.5 trap 7).
   Two sources for one fact cannot disagree if there is only one of them. ⚠️ **Story 2.14 inherits
   this**: a resize commits a differently-shaped grid and `size` follows it automatically.
5. **A mid-stroke external `grid` change ENDS the stroke and DISCARDS its paint** — `endStroke(false)`,
   a **documented deviation from the story's recommended option (a)**. Option (a) as written ("end
   the stroke, committing what it painted") cannot coexist with the same task's requirement that
   "the external change survives": the working buffer was sliced off the *pre-change* grid, so
   committing it reverts the external change wholesale — exactly the defect the deferred entry
   describes. The resize precedent is followed on the part that generalises (one gesture is never
   split across two grids) and departed from on the commit, because a resize does not change grid
   *content* and an undo is entirely about content. Option (b) (rebase) was rejected for having to
   invent an answer for cells both the change and the stroke touched, which no AC asks for.
   ⚠️ **2.14 and 2.15 inherit this policy.**
6. **No keyboard shortcut ships.** No AC asks for one, no mockup shows one, and spec §4's hotkey
   hook is `useSimulationHotkeys` — Epic 3 (Story 3.19). Recorded here so the absence reads as a
   decision, not an oversight.
7. **`undo()` does not re-prime `paintedGridRef`, and does not need to** — verified rather than
   assumed. `restore()` returns a new object, the grid effect's identity skip misses, `drawFull`
   runs. The canvas is not reached into: `paintedGridRef`'s contract is "this grid is already on
   screen", and only the canvas may claim it.

**Spec conflicts — recorded, not silently resolved (the project rule):**

- ⚠️ **`canUndo` is a function in RFC-005 D6 and a boolean in `component-tree-battle-page.md`.**
  **Took the boolean.** The authority order points at the RFC, but the RFC's own form *cannot
  satisfy its own epic AC*: `past` is a ref there, so a function reading it triggers no re-render
  and the button's `disabled` freezes at its mount value (FR-3.8 requires the opposite). The
  snippet is illustrative — as `useAsyncResource`'s file header already records about D1's `reload`
  sketch. **Not fixed in the RFC by this story**; the divergence is recorded here and in
  `useUndoableGrid.ts`'s own doc comment.
- ⚠️ **RFC-005 D6 contradicts itself on where the ring lives** (prose: local state; snippet:
  `useRef`). **Followed the prose**, which is the only half compatible with the reactive `canUndo`
  above. See forced decision 3.
- **`cols`/`rows` (RFC-005 D6) vs `width`/`height` (`RenderableGrid`, RFC-004 §3.4).** The snapshot
  keeps the **RFC's** spelling and the seam is crossed in exactly two functions (`snapshot`,
  `restore`) and nowhere else — the same "make the boundary explicit rather than let two spellings
  drift" call `assertGridMatchesSize` documents.
- **RFC-005 D6's `[...past.current.slice(-29), snap]` treated as illustration, not mandate**, as
  the story directed. The contract honoured is 30 entries / oldest evicted / ≤180 KB.
- **No new conflict between `docs/project-context.md` and an RFC was found.** The known-stale "no
  PR flow exists" line is unchanged (not this story's to fix).

**One thing the story did not anticipate, worth a reviewer's eye:** the `lastSeedRef`
set-state-during-render pattern the story told me to preserve is a **lint error inside a `use*`
function** — `react-hooks/refs` ("Cannot access refs during render") fires on the hook and not on
`<BattlePage>`, where the identical code lints clean on `main`. Resolved by switching to React's
*other* documented form of the same pattern: the previous seed is held **in the state cell** and
compared out of state, so there is no ref to read during render. Behaviour is identical (and pinned
by "adopts a seed that arrives after mount" and "resets both the value and the ring when the seed
changes"); the trap-8 hazard the story named is closed either way.

**Deferred-work items (AC9 and beyond) — FIVE closed, not three:**

- ✅ (a) the resize effect's stale `endStroke`/`onStrokeCommit` closure — fixed by the prescribed
  `useRef`, **not** by leaning on `commit` being stable. Side benefit: `[size]` is now genuinely
  exhaustive, so the effect's `eslint-disable-next-line react-hooks/exhaustive-deps` is **deleted**
  rather than re-justified.
- ✅ (b) an unreconciled mid-stroke `grid` change — forced decision 5 above.
- ✅ (c) mid-drag tool switching unpinned — closed as a **pin**, not a fix: the analysis was right
  and no production change was needed. Two tests, one of which proves the switch is not simply
  being ignored.
- ✅ **`endStroke(false)` would leave the canvas showing paint that no state holds** — this story
  turned out to be the **first `false` caller** (not the cancel path that entry expected). The hole
  does not open here by construction: the call lives inside the grid effect, whose reason to run is
  that the prop identity changed, and `renderer.drawFull(grid)` two lines below repaints from the
  prop grid — the first of the two remedies that entry names. ⚠️ A future `false` caller *outside*
  the grid effect still has to repaint for itself.
- ✅ **`BattlePage.test.tsx`'s pre-existing load-dependent flake** — the entry assigned it to "the
  next story that touches this file"; this story is that story. Two `waitFor` helpers
  (`findEditorCanvas`, `findRecording`) replace five unsafe `as` casts, so an unflushed construction
  effect is a retry instead of a `TypeError` in an unrelated assertion.

**Three NEW deferred items recorded** (`deferred-work.md`): the undo ring's dependence on the
append-only roster invariant (→ 2.9, the first story that writes `sessionRoster` — a sort there
would corrupt every entry silently); `<EditorStatusBar>`'s missing landmark/name once 2.12 fills it
with stats; and the new e2e's reuse of 2.7's uncalibrated 0.6 residual ratio.

**Scope discipline:** no `packages/*` change; no widening of `onStrokeCommit`/`onCommitGrid`; no
`redo`/`future[]`/history panel; no persistence of the ring; no reset-on-Gallery-exit code (the
unmount does it); no new `--gol-*` token; no change to the frozen `GridRenderer` contract; no new
dependency.

**One deliberate deletion to flag:** `<MainContent>`'s `position: relative` is **removed**. Story
2.5 kept it as the containing block `<EditorStatusBar>` would position against; the bar has now
arrived and sits **in flow** as the last row of that flex column instead (the mockup's
`position: fixed; left: 320px` offsets a 2.9 sidebar that does not exist, and its companion
`padding-bottom: 80px` reserve is unnecessary when `flex: 1` computes the reserve). Both comments
now say what is true rather than promising a future that already happened differently.

### File List

**New**

- `apps/web/lib/useUndoableGrid.ts`
- `apps/web/lib/useUndoableGrid.test.ts`
- `apps/web/components/battle/EditorStatusBar.tsx`
- `apps/web/components/battle/EditorStatusBar.test.tsx`

**Modified**

- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`
- `apps/web/components/PetriDishCanvas.tsx`
- `apps/web/components/PetriDishCanvas.test.tsx`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/epic-2/2-8-undo.md`

**Unchanged, deliberately:** `apps/web/lib/tool.ts`, `apps/web/lib/canvas/*`, every `packages/*`,
`apps/web/app/themes.css`.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-27 | 0.1 | Story created | create-story |
| 2026-08-27 | 1.0 | Implemented: `useUndoableGrid` (30-entry ring), `<EditorStatusBar>` with UNDO, `size` derived from the grid, and the three owned deferred-work items closed (plus two more). Full `npm run ci` green. | dev-story |
| 2026-08-27 | 1.1 | Code review (sonnet, complement of the opus dev agent): 1 patch applied, 1 deferred, 1 decision-needed. Review commit `a04999d`. | code-review |
| 2026-08-27 | 1.2 | Decision-needed resolved by Sidiar: silent discard accepted, no visible signal; 2.14/2.15 inherit it. No code change. Status → done. | Sidiar |

Dev Model: opus   # architecture-shaping: establishes `useUndoableGrid` — the commit/history seam every later editor mutation story (2.14 resize, 2.15 Clear, 2.16 reset) inherits — moves grid ownership out of `useState`, and must settle three decisions with downstream inheritance (ring container vs. reactive `canUndo`, the single source of grid dimensions, and mid-stroke external-change policy) while resolving two live RFC-005-vs-component-tree conflicts the RFC's own snippet cannot satisfy

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 19s | 12 | 1,856 | 8,564 | 244,136 | 254,568 |
| Step 1 — create-story | opus-5 | 1 | 9m 20s | 192 | 30,963 | 489,184 | 9,565,286 | 10,085,625 |
| Step 2 — dev-story | opus-5 | 1 | 22m 38s | 344 | 69,275 | 416,242 | 26,390,195 | 26,876,056 |
| Step 3 — code review + PR | sonnet-5 | 2 | 24m 30s | 740 | 27,490 | 933,768 | 75,088,268 | 76,050,266 |
| _of which the orchestrator_ | opus-5 | — | — | 40 | 6,686 | 25,131 | 903,654 | 935,511 |
| **Total (create-story → PR ready)** | | 4 | **56m 47s** | 1,288 | 129,584 | 1,847,758 | 111,287,885 | **113,266,515** |

Run started 2026-08-27 13:14 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
