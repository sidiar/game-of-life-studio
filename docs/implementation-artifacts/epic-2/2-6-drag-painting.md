---
baseline_commit: 07b97d80f0c85a4f70b02cca83d8589aa9783615
---

# Story 2.6: Drag Painting

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to drag across cells to paint many at once,
so that I can sketch patterns quickly.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.6: Drag Painting`, decomposed into the eight things a reviewer can
independently check:

1. **AC1 — The stroke paints.** Given pointer-down on the edit canvas, when the pointer moves
   across cells, each traversed cell holds the selected organism, **overwriting any previous
   occupant** (FR-3.5, same overwrite rule as FR-3.4).
2. **AC2 — Hot state in refs, and only the dirty path.** The in-progress stroke lives in **refs** —
   **zero React state updates between pointer-down and pointer-up** (spec §3.10 "hot (refs only):
   … in-progress stroke buffer", project-context, NFR-1.1/NFR-4.2). Every incremental repaint goes
   through `markDirty` + `draw`, **never `drawFull`**, and repaints only the cells that changed.
3. **AC3 — Exactly one commit per gesture.** One press-drag-release fires `onStrokeCommit` →
   `onCommitGrid` **once**, on pointer-**up**, carrying a **new** grid value (RFC-005 Decision 6:
   "a click-drag stroke is coalesced into a single entry on pointer-up"). The grid object received
   as a prop is never mutated — Story 2.8's ring must have a distinct value to revert to.
4. **AC4 — No gaps.** Cells between two successive pointer samples are painted too: a fast drag,
   which the browser reports as a few widely-spaced `pointermove` events, leaves a **continuous**
   line of cells, not a dotted one.
5. **AC5 — Clean termination, no lost or phantom cells.** Pointer-**up outside the canvas** ends
   the stroke and still commits exactly once. The pointer **leaving and re-entering** paints no
   cell the pointer did not actually cross inside the dish (no bridged line across the outside
   path) and drops none it did. `pointercancel` / lost capture terminates the stroke exactly once,
   never twice, never zero times.
6. **AC6 — A click is the degenerate stroke, and a no-op stroke commits nothing.** Press-release
   with no movement still paints on pointer-**down** (AC2's < 100 ms feedback is unchanged from
   Story 2.5) and commits **once**. A stroke whose cells all already hold the selected organism
   produces **no commit and no repaint** — the direct carry-forward of Story 2.5's AC7, which 2.8's
   undo ring and 2.11's `isDirty` both depend on.
7. **AC7 — One stroke at a time.** A secondary pointer (`isPrimary === false`), a non-primary
   button (`button !== 0`), or a second pointer-down while a stroke is active neither starts a
   second stroke nor paints a cell. Carried forward from Story 2.5 and now actually reachable —
   multi-touch on a tablet is the case.
8. **AC8 — The browser does not fight the gesture.** Touch drag on the dish paints instead of
   scrolling/panning the page, and a mouse drag does not start a native selection or image-drag.
   (Not in the epic's AC text: it closes the `deferred-work.md` entry that names **this story** as
   the owner — "Story 2.6 adds an actual press-drag-release gesture on this exact handler". Flagged
   in *Spec additions surfaced* below rather than slipped in silently.)

## Tasks / Subtasks

- [x] **Task 1 — The pure cell-line unit (AC4)**
  - [x] New `apps/web/lib/canvas/cellLine.ts` — **pure, no DOM** — the sibling of `pointerToCell.ts`
        / `gridLayout.ts` / `dirtyCells.ts`, which all split the same way (AR-42: the brain is a
        unit, the hand is not). Suggested shape:
        `export function cellsBetween(from: CellCoord, to: CellCoord): CellCoord[]` returning the
        cells strictly **after** `from` up to and **including** `to`, in traversal order. Excluding
        `from` is what makes "append the segment's cells" idempotent across consecutive moves
        without re-emitting the previous anchor every time.
  - [x] Use integer Bresenham. Both endpoints are cells the mapper already vouched for, so every
        interpolated cell is within `[0, cols) × [0, rows)` **by construction** — say so in a
        comment, because it is what keeps `markDirty`'s `DirtyCellRangeError` (`dirtyCells.ts`)
        unreachable from inside a pointer handler (Story 2.5 Task 2's rule, extended to a second
        producer of coordinates).
  - [x] Unit-test: same cell (→ empty array, **not** `[to]`), adjacent horizontal / vertical /
        diagonal, a shallow slope, a steep slope (the axis-swap branch), all four sign
        combinations, a long jump across the whole grid (result length = Chebyshev distance, first
        element adjacent to `from`, last element `=== to`), and that no returned cell repeats.

- [x] **Task 2 — The in-progress stroke, in refs (AC1, AC2, AC7)**
  - [x] In `EditDish` (`apps/web/components/PetriDishCanvas.tsx`) hold ONE `strokeRef` —
        `useRef<Stroke | null>(null)` — carrying everything the gesture needs: the active
        `pointerId`, the working `RenderableGrid` (see Task 3), the last painted `CellCoord` (the
        interpolation anchor, `null` when the pointer is currently over no cell), a `changed`
        flag, and the **cached geometry** (Task 4). ❌ No `useState`, no `useReducer`, nothing that
        re-renders — AC2 is the whole point of this story's shape.
  - [x] `handlePointerDown` (extend, do not rewrite): keep the `button !== 0 || !event.isPrimary`
        guard and the `toolRef === null` guard, then **also** return early when
        `strokeRef.current !== null` (AC7 — a second finger must not hijack the stroke). Open the
        stroke, paint the first cell exactly as today, and set the anchor.
  - [x] `handlePointerMove`: return immediately when `strokeRef.current === null` **or**
        `event.pointerId !== stroke.pointerId`. This handler fires on **every hover move**, not
        just during a stroke, so the no-stroke path must do no work at all — no
        `getBoundingClientRect()`, no `computeGridLayout`, no allocation.
  - [x] ⚠️ In the move handler, **never test `event.button === 0`** — on a `pointermove`,
        `button` is **-1** (no button changed state) and the check silently disables dragging
        entirely. The button state on a move lives in the `buttons` **bitmask** (trap 5).
  - [x] `handlePointerUp` / `handlePointerCancel` / `handleLostPointerCapture`: one shared
        `endStroke(commit: boolean)` so the terminate path exists exactly once. It must be
        **idempotent** — clearing `strokeRef.current` first, then acting — because pointer-up and
        `lostpointercapture` both fire for the same gesture in real browsers (AC5's "exactly once").

- [x] **Task 3 — The working grid: one object, mutated in refs, committed once (AC1, AC2, AC3)**
  - [x] At pointer-down build the working grid ONCE: `occupant = grid.occupant.slice()`, `age`
        carried **by reference** (unchanged from Story 2.5 — every edit-mode grid is age-zero
        everywhere and nothing in Epic 2 writes age; the comment explaining that already exists,
        keep it). Store the object in `strokeRef`.
  - [x] During the stroke, write into **that same buffer** — no new `Uint8Array`, no new
        `RenderableGrid` per move. A 6 KB copy per `pointermove` at 100×60 is the allocation
        churn NFR-4.2 will not survive, and there is no reader between moves that could observe an
        intermediate value.
  - [x] `renderer.draw(workingGrid)` per move, after `renderer.markDirty(segmentCells)`. `draw`
        diffs each candidate against its retained `lastColourState` (`dirtyCells.ts`
        `selectDirtyCells`), so a cell the pointer re-crosses costs nothing and an already-correct
        cell repaints zero times. ❌ Do **not** add a second dedupe layer on top of that.
  - [x] At pointer-up: if `changed === false`, **no commit at all** (AC6). Otherwise set
        `paintedGridRef.current = workingGrid` and call `onStrokeCommit(workingGrid)` — **once**.
  - [x] ⚠️ After committing, that buffer must **never** be written again. The next pointer-down
        slices a fresh copy off the current `grid` prop. Story 2.8's ring snapshots the *previous*
        value's occupant at commit time (RFC-005 Decision 6's snippet), so a post-commit mutation
        would silently rewrite history.
  - [x] Keep the `grid.width !== size.cols || grid.height !== size.rows` fail-closed guard the 2.5
        review added, and apply it at **stroke start** — the working grid's dimensions are then
        fixed for the gesture.

- [x] **Task 4 — Geometry cached per stroke, not per move (AC2)**
  - [x] Resolve `canvas.getBoundingClientRect()` and `computeGridLayout(canvas, size,
        showGridLines)` **once at pointer-down**, store both in `strokeRef`, and feed
        `pointerToCell` from the cached values on every move. `getBoundingClientRect()` forces a
        style/layout flush; doing it per `pointermove` (which can arrive at the display's full
        refresh rate) puts a forced reflow on the hot path this story exists to keep cheap.
  - [x] Name the staleness this buys: the cached box is wrong if the canvas is re-laid-out
        **mid-stroke** (the `ResizeObserver` effect calling `renderer.resize(size)`). Decide and
        record: recompute the cached geometry from the resize path, or end the stroke there. Do not
        leave it undecided — a stale rect maps the pointer to the wrong cell with nothing logged.

- [x] **Task 5 — Pointer capture and the browser's default gesture (AC5, AC8)**
  - [x] Capture the pointer at stroke start so moves and the up event keep targeting the canvas
        once the pointer leaves it. ⚠️ **jsdom 30 does not implement
        `setPointerCapture`/`releasePointerCapture`/`hasPointerCapture`** — a bare call throws
        `TypeError` *inside the pointer handler* and takes every existing edit-variant test with it
        (trap 1). Guard the call; keep the guard commented as a jsdom fact, not as defensive
        garnish.
  - [x] Release capture in `endStroke`, guarded the same way, and handle `onLostPointerCapture` as
        a terminate path (the browser can revoke capture on its own — element removal, a system
        gesture).
  - [x] AC8: add `touchAction: 'none'` to `BattleEditorView.tsx`'s edit-only `DishCanvas` styled
        wrapper — beside `cursor: 'crosshair'`, and for the same reason it lives there rather than
        inside `<PetriDishCanvas>`: only the **edit** variant is paintable, and the Gallery's
        static tiles must keep normal touch scrolling. Consider `userSelect: 'none'` for the mouse
        drag-selection case, and decide separately whether `event.preventDefault()` on pointer-down
        is warranted; record which of the three you took and why.
  - [x] Update the `deferred-work.md` "No `touch-action` / `event.preventDefault()` on the
        paintable canvas" entry — it names this story as the owner — marking it resolved with the
        date and what was actually done.

- [x] **Task 6 — Interpolation wiring and the re-entry rule (AC4, AC5)**
  - [x] On each move: map to a cell. If it is `null` (pointer off the dish), set the anchor to
        `null` and paint nothing — **do not** end the stroke (AC5: leaving and re-entering keeps
        one gesture) and **do not** remember the last inside cell as a bridge source.
  - [x] If it maps to a cell and the anchor is `null` (stroke start, or re-entry), paint **just
        that cell**. If the anchor is a cell, paint `cellsBetween(anchor, cell)`. Either way the
        anchor becomes the new cell.
  - [x] That rule is exactly AC5's "no phantom cells": bridging across a null gap would draw a
        straight line through cells the pointer went *around*, outside the dish. Say so at the call
        site — it reads like an omission otherwise, and it is the single most likely thing a later
        reader "fixes".
  - [x] ❌ Do **not** reach for `getCoalescedEvents()`. It is absent in jsdom, uneven across the
        browsers Playwright runs here, and the interpolation above already closes the gap it would
        close (trap 8).

- [x] **Task 7 — Tests**
  - [x] Pure unit: `cellLine.test.ts` (Task 1's list).
  - [x] ⚠️ **Story 2.5's existing click tests fire `pointerDown` only and assert a commit.** The
        commit now lands on pointer-**up**, so those tests fail as written. **Update them** — add
        the `pointerUp` — do not delete them and do not move the *paint* back to pointer-up to keep
        them green (trap 2). The one assertion that must keep firing on **pointer-down alone** is
        AC2's < 100 ms paint: pin it explicitly.
  - [x] `PetriDishCanvas.test.tsx` — new edit-variant cases, against the `RecordingContext2D`
        installed **before the first render** (`apps/web/lib/recordingContext2d.ts`; real jsdom's
        first `getContext('2d')` returns `null`, so a successfully-constructed mount is otherwise
        unobservable):
    - down → 3 moves → up commits **exactly once**, and the committed grid differs from the prop
      grid at every traversed cell and nowhere else;
    - the **prop** grid's `occupant` is byte-for-byte unchanged after the whole gesture (AC3);
    - **no React re-render occurs between down and up** (AC2) — e.g. a render counter in a test
      wrapper, or assert `onStrokeCommit` is the only callback that fires at all;
    - a move that jumps several cells paints the intervening cells (AC4);
    - `drawFull` is never called during the stroke, and the round trip after the commit does not
      trigger it either (AC2 + the `paintedGridRef` trap) — extend the existing
      "full-paints exactly once on a mount whose 2D context is available from the start"
      assertion rather than adding a parallel one;
    - a move to a point outside the box, then back in, paints no intervening cells (AC5);
    - `pointerUp` fired outside the canvas element still commits once (AC5);
    - `pointerCancel` mid-stroke terminates once, and a subsequent `pointerUp` commits nothing
      (idempotence);
    - a second `pointerDown` with a different `pointerId` mid-stroke is ignored (AC7);
    - a move with **no active stroke** paints nothing and commits nothing;
    - a drag entirely over cells that already hold the tool's ref commits nothing (AC6);
    - a `pointerMove` on which `event.buttons === 0` does not keep painting (trap 5's self-heal,
      if you take it — assert whichever behaviour you chose).
  - [x] `BattleEditorView.test.tsx` / `BattlePage.test.tsx`: one gesture produces exactly one
        `onCommitGrid` call and one rendered grid identity change. Extend the existing tests; do
        not re-declare their mount/mock/rect-stub boilerplate (a 2.5 review finding was exactly
        that duplication).
  - [x] ❌ No pixel or image snapshots of the canvas, ever (project-context).

- [x] **Task 8 — E2E (AC1, AC4, AC5, AC8)**
  - [x] Extend `apps/web/e2e/battleRoute.spec.ts` alongside the Story 2.5 placement test, reusing
        `seedWorkspace(page)` + `seedConwaysClassic(page)` + the existing `distinctColorCount`
        helper. A real drag: `page.mouse.move(x0, y0)` → `mouse.down()` → one or more
        `mouse.move(x1, y1)` → `mouse.up()`.
  - [x] The claim that actually proves this story end to end is **area**: a drag paints strictly
        more cells than a click. Count painted (non-background, non-grid-line) pixels — or reuse
        `distinctColorCount`'s `getImageData` shape for a pixel tally — and assert
        `dragPixels > clickPixels`. A distinct-colour count alone rises identically for one cell
        and for a hundred, so it cannot distinguish this story from 2.5.
  - [x] Include a **single-jump** move (Playwright's `mouse.move` with no `steps` sends one
        `pointermove`), which is the only way the e2e exercises AC4's interpolation rather than the
        browser's own sampling density.
  - [x] Assert `page.on('pageerror')` collected nothing — the capture guard and the handler paths
        are exactly the kind of thing that throws only in a real browser.
  - [x] Re-run the route's axe scan after a drag (the dish's `role="img"` / `aria-label` are
        unchanged; the scan is the regression check, not a new claim).
  - [x] ⚠️ `e2e/` has three hand-synced copies of `buildSeedPayload`/`seedWorkspace`
        (`deferred-work.md`) plus 2.5's fourth `seedConwaysClassic` helper in this file. If you
        touch more than one spec's seeding, extract the shared fixture module that entry asks for
        and mark it resolved; if you touch one, leave the copies alone and the entry standing.

- [x] **Task 9 — Verification and record-keeping**
  - [x] Run the full local gate: `npm run ci` (typecheck → lint → format:check → spec:check →
        coverage → build → bundle → e2e). ⚠️ **Do not pipe it** — `npm run ci | tail` reports
        *tail's* exit status and has already masked a real `format:check` failure once. Redirect to
        a file and echo `$?`.
  - [x] Paste the `/battle` and `/battle/new` gzip measurements from `bundle:check` into the Dev
        Agent Record. Story 2.5 measured **295.9 KB** against the 310 KB battle budget (14.1 KB
        headroom); this story adds one small module and some handlers. If a budget moves, that is
        Sidiar's call — do not raise one unilaterally. The home route's 4.5 KB headroom against
        330 KB is a standing deferred item; this story adds no home-route weight
        (`<BattleTile>` pulls in `<PetriDishCanvas>`, so check rather than assume).
  - [x] Record every forced decision below in the Dev Agent Record, plus any new deferred work.
  - [x] Update `deferred-work.md`: the `touch-action` entry resolved (Task 5).
  - [x] Update `sprint-status.yaml`: `2-6-drag-painting` → `review`.
  - [x] ⚠️ A green local run is not proof CI is green — check `gh run list` after pushing.

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **How the stroke keeps receiving events once the pointer leaves the canvas.** Two options:
   *(a)* `canvas.setPointerCapture(event.pointerId)` at stroke start — the native mechanism, which
   retargets every subsequent `pointermove`/`pointerup` for that pointer to the canvas, so React's
   own `onPointerMove`/`onPointerUp` props keep working unchanged; or *(b)* `window`
   `addEventListener` for the duration of the stroke. **(a) is recommended**: it is one line each
   way, it needs no effect/cleanup pairing, and it is what `deferred-work.md` and RFC-002 Risk 5's
   "use pointer events API for unified handling" already point at. Its one cost is the jsdom gap
   (trap 1). If you take (b), the listeners must be registered and removed from the same place
   `strokeRef` is opened and closed, or an unmount mid-stroke leaks them.
2. **What `pointercancel` does with the cells already painted.** Commit them, or discard them?
   **Recommended: commit.** It is the same principle Story 2.5 settled for trap 12 ("the model is
   not the view; a canvas that cannot paint must not swallow the user's edit") — the user did draw
   those cells, and discarding leaves the dish showing paint that no state holds. Discarding is
   defensible if you also repaint from the prop grid, which is a `drawFull` on a path AC2 says to
   avoid. Record the choice either way.
3. **What a mid-stroke re-layout does** (Task 4's cached geometry). Recompute, or end the stroke?
   Recomputing keeps the gesture alive across a window resize; ending it is simpler and a resize
   mid-drag is vanishingly rare. Either is fine — an *undecided* stale rect is not.
4. **`touch-action: none` vs `preventDefault()` vs both** (AC8). `touch-action: none` on the
   edit-only `DishCanvas` wrapper is the declarative, capture-friendly form and is recommended;
   `preventDefault()` on pointer-down additionally suppresses native drag-and-drop and
   text-selection for mouse. Note `userSelect: 'none'` as the third, narrower option. Say which you
   took, and update the deferred entry to match what actually shipped.
5. **Whether `event.buttons === 0` on a move self-terminates the stroke** (trap 5). It is a
   two-line safety net for the case where capture is unavailable and the button was released
   somewhere the canvas never heard about. Recommended: take it, and commit on that path like any
   other termination. If you skip it, say why.
6. **Whether the first cell paints on pointer-down.** It must — AC2's < 100 ms budget and Story
   2.5's existing behaviour both depend on it. This is listed as a decision only because the
   symmetric-looking alternative ("paint everything on move") is a one-line change that passes
   every commit-count test and silently regresses NFR-4.2 for the click case.

### Spec conflicts and additions surfaced (do not silently pick one — this is the project rule)

- **AC8 (`touch-action`) is an addition, not a quotation.** The epic's 2.6 AC text is silent on it;
  `deferred-work.md`'s entry names **Story 2.6** as its owner in as many words. It is in scope
  because RFC-002 Risk 5's entire rationale for Pointer Events is touch, and an un-suppressed
  touch-scroll fights this gesture for the same input.
- **Spec §3.10 types the edit variant's grid as `Grid`; this story keeps passing `RenderableGrid`.**
  Unchanged from Stories 2.4/2.5 and still a *not-yet*, not a divergence: the typed-array `Grid`
  (RFC-004 §3.4) arrives in Story 3.3 and satisfies `RenderableGrid` structurally.
- **Spec §3.10's `onStrokeCommit(next: Grid)` and §3.3's `onCommitGrid(next: Grid)` are unchanged
  by this story.** Story 2.5 built that seam for one click; this story fills it with a coalesced
  gesture. ❌ If you find yourself widening either signature (a "stroke start"/"stroke end" pair, a
  cell list, an in-progress callback), stop — that is the seam 2.7/2.8/2.14/2.15 all arrive at, and
  changing its shape here pre-empts four stories.
- **§6's invariant reads "grid buffers never enter React state", while §4's `useUndoableGrid`
  returns `value: Grid` from `useState`.** Not a new conflict and not this story's to resolve: the
  invariant is about the *hot* buffers (the live simulation grid, the in-progress stroke), which is
  exactly what this story keeps in refs. The *committed* value has been React state since Story 2.5
  and is what §4 prescribes.
- If you find a *new* conflict between `docs/project-context.md` and an RFC, surface it — several
  rules there are deliberate overrides of stale RFC snippets, and new ones are signal.

### Silent-failure traps — the intuitive implementation is wrong

1. **jsdom has no `setPointerCapture`.** Verified against this repo's jsdom **30.0.1**:
   `PointerEvent` exists, but `element.setPointerCapture`, `releasePointerCapture` and
   `hasPointerCapture` are all **`undefined`**, so an unguarded call throws
   `TypeError: canvas.setPointerCapture is not a function` from inside the pointer-down handler —
   which takes out every existing edit-variant test, including the ones that have nothing to do
   with this story. Guard it (`canvas.setPointerCapture?.(id)` compiles; a `typeof … === 'function'`
   check is equally fine and reads more honestly against a DOM type that claims the method is
   always there). The type-aware `no-unnecessary-condition` rule is **not** enabled in this repo's
   ESLint config, so neither form is flagged.
2. **The commit moves from pointer-down to pointer-up, and Story 2.5's tests encode the old
   timing.** `PetriDishCanvas.test.tsx`'s "click placement" describe fires `fireEvent.pointerDown`
   and asserts `onStrokeCommit` was called — every one of those goes red. That is the correct
   signal, not a problem to route around: update them to fire down **and** up. The seductive wrong
   fix is to keep committing on pointer-down and *also* commit on pointer-up, which produces two
   undo entries per drag in Story 2.8 and passes every test written today.
3. **`paintedGridRef.current` must be set at commit time.** Unchanged from Story 2.5 and still the
   single most likely defect: the committed grid comes straight back down as a new `grid` prop
   identity, and `EditDish`'s grid effect `drawFull`s anything it has not already seen — a full
   6,000-cell repaint plus a colour-state re-prime after every stroke, with every test still green
   and the dish still looking perfect.
4. **Mutating a committed buffer.** The working buffer is fair game *during* the stroke and
   radioactive after it. `useUndoableGrid` (2.8) snapshots the **previous** value's occupant at
   commit time, so a stroke that kept writing into an already-committed buffer would rewrite the
   undo history in place. The rule is one line: allocate at pointer-down, freeze at pointer-up.
5. **`event.button` is `-1` on `pointermove`.** Copying pointer-down's `if (event.button !== 0)`
   guard into the move handler disables dragging outright — and it looks like the careful thing to
   do. The move-time equivalent is the `buttons` **bitmask** (`event.buttons & 1`), which is a
   *different property with a different meaning*; use it only for the deliberate self-terminate in
   forced decision 5, never as a per-move gate on painting.
6. **`pointermove` fires on hover, not just during a drag.** The handler is attached for the life
   of the mount, so it runs on every mouse move over the dish. Anything expensive before the
   `strokeRef.current === null` early return — a `getBoundingClientRect()`, a `computeGridLayout`,
   an array allocation — is paid on plain hover, forever, and no test notices.
7. **A mid-stroke renderer reconstruction erases the in-progress paint.** `EditDish`'s construction
   effect deps are `[size, palette, colors]`; if any identity churns during a gesture it builds a
   new `GridRenderer` and `drawFull`s the **prop** grid — which is the pre-stroke value, because
   nothing has committed yet. The stroke's cells vanish from the canvas while `strokeRef` still
   holds them, and the pointer-up commit then re-applies them, so the net result is a flicker
   rather than data loss. Story 2.5 memoised `palette`/`colors`/`size` in `<BattlePage>` precisely
   so this does not happen; the pin is the existing "no second `GridRenderer` construction"
   assertion — keep it green rather than adding recovery code.
8. **`getCoalescedEvents()` is not a portable substitute for interpolation.** It is absent under
   jsdom entirely, and its availability across the four Playwright projects here
   (chromium/firefox/webkit/tablet) is uneven. Interpolation (Task 1) is deterministic, pure,
   unit-testable, and closes the same gap — a fast drag with three reported samples still paints a
   continuous line.
9. **`markDirty` validates and throws.** `toFlatIndex` raises `DirtyCellRangeError` for a
   non-integer or out-of-range coordinate, deliberately, and that throw would land inside a pointer
   event handler. Two producers now feed it: `pointerToCell` (returns `null` rather than clamping)
   and `cellsBetween` (bounded by construction, because both endpoints are already in range).
   Never hand `markDirty` a coordinate neither of them vouched for.
10. **`draw` degrades silently rather than throwing when there is no baseline.** `draw` falls back
    to a full paint when `lastColourState === null` (`gridRenderer.ts`) — so a stroke against a
    renderer that never got its mount-time `drawFull` is "correct but slow", and no test notices.
    Confirm the mount's `drawFull` still runs before any gesture can start.
11. **Grid dimensions are parameters, never constants.** `size` flows from `draft.gridSize`;
    `cellsBetween` takes coordinates, not bounds. A literal `100`/`60`/`50`/`30` anywhere in this
    story's production code is a bug (Decision A). Fixtures may name the presets; the code may not.
12. **`getContext('2d')` returns `null` under jsdom, always.** `EditDish` catches
    `GridRendererContextError` and leaves `rendererRef.current === null`. The whole stroke path must
    tolerate that: no paint, but — per Story 2.5's recorded decision — the **commit still fires**.
    Keep that behaviour for the gesture as a whole (one commit at pointer-up), and keep
    `paintedGridRef` unset on that path.
13. **`ctx.fillStyle = 'var(--gol-bg-primary)'` is a silent no-op.** Unchanged and still true. This
    story adds no colour resolution — the colour comes from the palette LUT, never from a token —
    and the trap is here only to stop anyone reaching for a token string while wiring a stroke
    colour.

### Previous story intelligence

**Story 2.5 (`2-5-click-placement.md`, merged 07b97d8)** — this story is a direct extension of that
code path, by 2.5's own design. Read `PetriDishCanvas.tsx`'s `EditDish` (the whole component) and
`lib/canvas/pointerToCell.ts` before writing a line.

- 2.5's Dev Notes said it explicitly: *"`setPointerCapture` is Story 2.6's tool, not this story's…
  adding it now pre-empts 2.6's 'pointer-up outside the canvas' AC."* That is this story's Task 5.
- **Forced decision 2 is inherited, not re-litigated:** the tool → ref resolution lives in
  `<BattleEditorView>`; the canvas receives both `tool` (§3.10's shape, load-bearing from 2.7) and
  a pre-resolved `toolRef: number | null`. `tool` is still declared-but-unread. Do not move this.
- **`Tool` still ships one arm** (`{ kind: 'organism'; organismId }`) with an exhaustiveness
  tripwire in `refForTool` that is designed to **stop compiling** when 2.7 adds `{ kind: 'eraser' }`.
  This story adds no arm and no eraser affordance.
- 2.5's review deferred four items. **One names this story as owner** — the missing `touch-action` /
  `preventDefault` (Task 5). The other three are **not** this story's: the mutable `Battle` arrays
  (owner: 2.13), `sessionRoster` not resetting across a same-mount `battleId` change (owner:
  whichever story first adds that navigation), and the 255-organism cap on the roster union
  (owner: 2.9).
- 2.5's review also flagged two *process* patterns worth repeating: duplicated test helpers get
  found (parameterise the existing `mount`/`mountEditor` helpers instead of re-declaring them), and
  claims are **mutation-checked** rather than trusted — flip `Math.floor` to `Math.round`, delete
  the `paintedGridRef` line, and confirm the intended test actually fails.

**Story 2.3 (`2-3-renderer-dirty-region-editing-paths.md`)** — the renderer half, and it was built
for this story specifically: `markDirty`'s doc comment says *"Stories 2.5/2.6 call this once per
cell during a drag, so a repaint in here converts one repaint per committed gesture into one per
pointer move"*, and `dirtyCells.ts` chose a flat-index `Set` because *"a drag stroke is the shape
that produces re-marking the same cell many times per gesture"*. The infrastructure is already
correct — do not add caching or dedupe on top of it.

**Story 2.4 (`2-4-edit-canvas-display.md`)** — the retained-renderer lifecycle and the
`installRecordingContexts`-before-first-render technique both come from here; its review found a
double full-paint on mount, and the assertion that caught it is the tripwire this story must keep
green.

### Git intelligence (last 5 commits)

`07b97d8` merge of `story/2-5-click-placement` (PR #6) · `bbf4c6a` orchestration run stats ·
`bfdb07c` 2.5 review fixes · `5e8c7fb` 2.5 feature commit · `6d035ad` merge of
`story/2-4-edit-canvas-display` (PR #5).

Conventions visible in that history: `feat:`/`fix:`/`docs:` prefixes naming the story in the
subject; **review fixes land as their own commit**, never folded into the feature commit; branches
are `story/<story-key>` and merge via PR with a **merge commit** — never squashed, because the
per-commit rationale is the record. Story subagents may commit and push to their own `story/*`
branch without asking; **merging is always Sidiar's call**, and approval for one merge never
carries to the next. (Note `docs/project-context.md` still says "no PR flow exists" — stale since
Story 2.4, not a decision this story needs to change.)

### Latest technical information

No new dependency, and none is warranted. Everything needed is installed and pinned: React 19.2.7,
Next 16.2.10, MUI 9.3.1 + Emotion, TypeScript 5.9.3 strict, Vitest + RTL, Playwright, axe-core,
jsdom 30.0.1. **Version policy is caret-on-current-stable — do not bump anything opportunistically.**

- **Pointer Events, one code path for mouse/pen/touch** (RFC-002 Risk 5). React exposes
  `onPointerDown` / `onPointerMove` / `onPointerUp` / `onPointerCancel` / `onLostPointerCapture` as
  synthetic events carrying the native `pointerId`, `isPrimary`, `button`, `buttons`, `clientX/Y`.
- **`setPointerCapture` is the browser feature this story turns on** — it is baseline in every
  browser Playwright runs here, and absent from jsdom (trap 1). Nothing else about capture needs
  polyfilling: with it, the canvas's own React handlers receive the out-of-bounds moves and the
  final up.
- **`touch-action` is CSS, not JS**, and it must be on the element receiving the pointer (or an
  ancestor) *before* the gesture starts — setting it from inside the handler is too late for the
  gesture in progress.
- **jsdom has no layout**: `getBoundingClientRect()` returns all zeros unless stubbed, which
  `pointerToCell` correctly maps to "no cell". The component tests stub the rect (2.5's `stubRect`
  helper); the end-to-end geometry claim is the e2e's job, which is the only place real layout
  exists.
- `RenderableGrid.occupant` is `readonly Uint8Array` — `readonly` on the *property*, not the
  contents; TypeScript will not stop you mutating the buffer. The copy-at-start / freeze-at-commit
  discipline is a convention the compiler cannot enforce, so it needs the test that asserts the
  prop grid is byte-for-byte unchanged after a full gesture.

### What NOT to build (scope boundaries)

❌ The eraser, the `{ kind: 'eraser' }` arm, any eraser toggle (2.7 — its AC says the erase runs
   through **this** story's stroke pipeline, so leave the pipeline tool-agnostic and stop there)
❌ `useUndoableGrid`, the 30-snapshot ring, an UNDO button, any mini undo ring (2.8)
❌ `<OrganismRoster>`, the roster list, tool-selection UI, the add dropdown (2.9/2.10)
❌ `<BattleNameField>`, `isDirty`, dirty tracking of any kind (2.11)
❌ `<EditorStatusBar>`, living-cell stats, per-organism counts (2.12)
❌ Save, `organismIds` pruning, any repository **write** (2.13)
❌ Grid resize, `<GridSettingsSection>`, `<ResizeClipWarningDialog>` (2.14)
❌ Clear Petri Dish (2.15)
❌ Back navigation, the unsaved-changes guard, `beforeunload` (2.16)
❌ A mode toggle, a fullscreen affordance, a `'run'` branch, `onRendererReady` (Epic 3)
❌ Keyboard placement or a focusable dish — still deferred (owner: Story 6.11), and still not
   something to invent here
❌ A hover highlight, a cell preview, a brush-size control, a shape/line tool, straight-line
   snapping with a modifier key — no AC, no mockup
❌ Predictive touch-path rendering / `getCoalescedEvents` (RFC-002 Risk 5 lists prediction as an
   option, not a requirement — trap 8)
❌ Any change to the frozen `GridRenderer` contract (`component-tree-battle-page.md#5`) — no new
   method, no layout accessor
❌ Any widening of `onStrokeCommit` / `onCommitGrid`
❌ Any `packages/*` change — this story is `apps/web` only, plus `@gol/test-utils` **usage** in e2e
   fixtures (never a change to it)
❌ A Web Worker (not in the MVP)

### Project Structure Notes

New:

- `apps/web/lib/canvas/cellLine.ts` (+ `.test.ts`)

Modified:

- `apps/web/components/PetriDishCanvas.tsx` (+ `.test.tsx`) — stroke refs, pointer
  move/up/cancel/lost-capture handlers, capture, commit-on-up
- `apps/web/components/battle/BattleEditorView.tsx` (+ `.test.tsx`) — `touchAction` (and whatever
  else forced decision 4 settles) on the edit-only `DishCanvas`
- `apps/web/components/battle/BattlePage.test.tsx` — one gesture, one commit
- `apps/web/e2e/battleRoute.spec.ts` — the drag smoke check
- `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`, this file

Conventions: PascalCase `.tsx` for components; camelCase, **never dotted**, for other TS files
(`cellLine.ts`, not `cell-line.ts`); ESM only; cross-package imports by package name
(`@gol/domain`), never a relative path; `@/*` inside `apps/web` only; `export type` for type
re-exports (`isolatedModules`); no `any`, no `@ts-ignore`, no non-null `!`; no raw hex (AR-46 lint).
Comments explain **why** and cite the governing spec ID — `npm run spec:check` runs in `ci` and
fails the build on an ID that resolves to nothing under `docs/`, so spell IDs exactly as the specs
do (`AR-22`, `FR-3.5`, `Decision A`, `RFC-005`; a hyphenated `M-9` matches nothing and is silently
exempt forever).

`apps/web` has **no coverage gate** — deliberate counter-metric; the ≥90% gate flips on for
`packages/domain` + `packages/simulation` in Story 3.7. Write the tests that pin behaviour, not
tests that raise a number. Coverage-padding tests are rejected in review.

**🛑 Commit gate:** story subagents may commit and push to their own `story/*` branch without
asking. Merging is always Sidiar's call.

### References

- [Source: docs/planning-artifacts/epics.md#Story 2.6: Drag Painting] — the three ACs
- [Source: docs/planning-artifacts/epics.md#Story 2.7: Eraser] — "through the same stroke pipeline
  — one commit per gesture"; the pipeline this story builds is what 2.7 reuses
- [Source: docs/planning-artifacts/epics.md#Story 2.8: Undo] — "one drag stroke reverts as a single
  unit (D6)"; the granularity this story's coalescing decides
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.10] — `<PetriDishCanvas>` "owns
  pointer→cell mapping"; *hot (refs only): renderer instance, in-progress stroke buffer*; "a stroke
  commits **once** on pointer-up"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3] — `<BattleEditorView>`,
  `onCommitGrid` as "the one undoable-commit seam"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#5] — the frozen `GridRenderer`
  contract (`draw` / `drawFull` / `renderStatic` / `markDirty` / `resize` / `setGridLines`)
- [Source: docs/planning-artifacts/component-tree-battle-page.md#6] — the state-separation matrix:
  "grid buffers never enter React state"
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 6] — "one
  entry per committed gesture; a click-drag stroke (FR-3.5) is **coalesced into a single entry on
  pointer-up**"; the snapshot ring that 2.8 builds on this story's commit granularity
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md] — the frozen renderer
  contract; "only redraw dirty regions"; Risk 5 "Touch Input Latency" → *separate input handling
  from render loop; use pointer events API for unified handling*
- [Source: docs/planning-artifacts/architecture.md#AR-22] — dirty-region tracking, auto-fit
- [Source: docs/planning-artifacts/architecture.md#Decision A] — grid dimensions are parameters;
  editable presets are {50×30, 100×60} only
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-3.5] — "click-and-drag
  across multiple cells to paint the selected organism in a continuous motion"
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#NFR-4.2] — "< 100ms"
- [Source: docs/project-context.md] — hot state in refs; grid dimensions never constants; the
  `var()`-in-`fillStyle` trap; no raw hex; the pipe-swallowed-exit-code trap; the commit gate
- [Source: docs/implementation-artifacts/epic-2/2-5-click-placement.md] — the pointer path this story
  extends; forced decisions 1 (recompute the layout, don't touch the frozen contract), 2 (tool→ref
  in `<BattleEditorView>`), 6 (`cursor: crosshair` on the edit-only wrapper); trap 12's
  commit-without-a-renderer call
- [Source: docs/implementation-artifacts/deferred-work.md] — the `touch-action`/`preventDefault`
  entry **owned by this story**; the keyboard-placement gap (6.11), the 255-cap (2.9), the mutable
  `Battle` arrays (2.13), the e2e seed-helper triplication — none of which are this story's
- [Source: apps/web/components/PetriDishCanvas.tsx] — `EditDish`: retained renderer,
  `paintedGridRef`, the construction/grid/grid-lines/resize effects, `handlePointerDown`
- [Source: apps/web/lib/canvas/pointerToCell.ts] — the pure mapper, its `null` contract, the
  canvas-measured DPR scale
- [Source: apps/web/lib/canvas/dirtyCells.ts] — `CellCoord`, `toFlatIndex`'s eager throw,
  `markDirtyCells`, `selectDirtyCells`
- [Source: apps/web/lib/canvas/gridRenderer.ts] — `markDirty` ("must never paint"), `draw`'s
  colour-state diff and its no-baseline fallback, `resize`
- [Source: apps/web/lib/canvas/gridLayout.ts] — `computeGridLayout`, `gridLayoutEquals`
- [Source: apps/web/lib/tool.ts] — `Tool`, `DEFAULT_TOOL`, `refForTool` and its exhaustiveness
  tripwire
- [Source: apps/web/lib/recordingContext2d.ts] — `installRecordingContexts`
- [Source: apps/web/e2e/battleRoute.spec.ts] — `seedWorkspace`, `seedConwaysClassic`,
  `distinctColorCount`, the Story 2.5 placement smoke check this story's drag check sits beside

## Dev Agent Record

### Agent Model Used

sonnet (Claude Sonnet 5) — as designated in the story's Dev Model line.

### Debug Log References

- `npm run ci` (typecheck -> lint -> format:check -> spec:check -> coverage -> build:standalone ->
  bundle:check -> e2e): **green**, all 5 turbo tasks successful. Run captured to
  `/tmp/ci-run.log`; exit code confirmed via `echo $?` (not piped -- the pipe-swallowed-exit-code
  trap this story's own Dev Notes name).
- `bundle:check` gzip measurements:
  - `/battle` and `/battle/new`: **296.4 KB** against the 310 KB budget -> **13.6 KB headroom**
    (Story 2.5's baseline was 295.9 KB / 14.1 KB headroom -- this story's one new module
    (`cellLine.ts`) plus the stroke handlers cost roughly 0.5 KB gzipped).
  - `/` (home): **326.5 KB** against the 330 KB budget -> **3.5 KB headroom** (previously noted as
    roughly 4.5 KB). `<BattleTile>` pulls in `<PetriDishCanvas>`, and this story's growth of that
    file (stroke refs, `cellsBetween`, five new pointer handlers) reaches the home bundle too, even
    though the Gallery's `static` variant never runs any of the new drag code paths at runtime.
    Still within budget; not raised unilaterally, per the story's own instruction -- flagged here
    for Sidiar's awareness since the headroom number moved.
- `apps/web` unit/component suite: 39 files, **529 tests**, all green, run standalone via
  `vitest run` from `apps/web` (multiple repeat runs, all clean). One run of the FULL monorepo
  `npm test` (turbo) showed a single flake -- `BattlePage.test.tsx > keeps the grid/palette
  identity stable across an unrelated rerender (AC7)` -- with `getContextSpy.mock.calls.length`
  reading 0 at the mount assertion, unrelated to any pointer/stroke logic (it fires before any
  drag interaction). Reran three consecutive `npm test`/`vitest run` passes with zero recurrence;
  not reproduced in isolation. Recorded here rather than silently re-run into green: looks like
  pre-existing cross-file test-order sensitivity under turbo's parallel invocation, not something
  this story's changes touch (the assertion is about the construction effect's `getContext` call
  count on mount, before any pointer event fires).
- e2e: `battleRoute.spec.ts` run explicitly across all 4 Playwright projects (chromium, firefox,
  webkit, tablet) -- **48/48 passed**, including the two new drag tests. Full `npm run ci` e2e
  step (all specs, all projects): **160 passed, 4 skipped** (the 4 skips are Story 1.13's
  touch/hover-only tests, pre-existing per-project skips, not caused by this story).
- Per CLAUDE.md's own warning, a green local run is not proof CI is green -- `gh run list` must be
  checked after the branch is pushed.

### Completion Notes List

- **Task 1** -- `cellLine.ts`'s `cellsBetween` is an integer Bresenham walk that pushes AFTER each
  step, so `from` is never emitted and `to` always is; unit-tested against the exact list Task 1
  asks for (same-cell, all four adjacency directions, a shallow and a steep slope, all four sign
  combinations, a 100x60-scale long jump, and a no-repeat invariant).
- **Task 2/3** -- `EditDish` now holds one `strokeRef: useRef<Stroke | null>`, carrying the active
  `pointerId`, a per-stroke `StrokeGeometry` snapshot, the resolved `ref` (the tool's
  `OrganismRef`, pinned at pointer-down), the mutated-in-place `workingGrid`, the interpolation
  `anchor`, and a `changed` flag. Zero `useState`/`useReducer` touched between down and up --
  pinned by a new `Profiler`-based test. `paintStrokeCells` is the one write path; it never adds a
  second dedupe layer on top of `draw`'s own colour-state diff, per the story's explicit warning.
- **Task 4** -- geometry (`getBoundingClientRect()` + `computeGridLayout`) is resolved once at
  pointer-down and cached on the stroke. Forced decision 3 (Dev Notes item 3): a mid-stroke
  re-layout **ends the stroke** (committing what was painted) rather than recomputing the cached
  rect -- implemented in the resize effect's `ResizeObserver` callback, which calls
  `endStroke(true)` before `renderer.resize(size)` whenever a stroke is active.
- **Task 5** -- `canvas.setPointerCapture?.(event.pointerId)` at stroke start,
  `canvasRef.current?.releasePointerCapture?.(stroke.pointerId)` in `endStroke`, both guarded per
  trap 1 (jsdom 30 has no implementation of either). Forced decision 4 (Dev Notes item 4): took
  `touch-action: none` **and** `user-select: none` on `BattleEditorView.tsx`'s `DishCanvas`; did
  **not** add `event.preventDefault()` -- both suppressions are declarative CSS read before the
  gesture starts, which is what AC8 actually needs, and `preventDefault()`'s only additional
  effect (suppressing native drag-and-drop) has no AC behind it. `deferred-work.md`'s
  `touch-action` entry is marked resolved with this reasoning.
- **Task 6** -- the re-entry rule lives in `handlePointerMove`: a cell of `null` clears the anchor
  and paints nothing (no bridge across the outside path); a non-null cell with a `null` anchor
  paints just that cell (stroke start or re-entry); otherwise `cellsBetween(anchor, cell)` fills
  the gap. `getCoalescedEvents()` was not used, per trap 8.
- **Forced decision 1** -- took (a), `setPointerCapture`, as recommended.
- **Forced decision 2** -- `pointercancel` (and every other termination reason) **commits**, not
  discards; `endStroke(commit: boolean)` is the one shared terminate path for
  up/cancel/lost-capture/mid-resize, idempotent by clearing `strokeRef.current` first.
- **Forced decision 5** -- took the `event.buttons & 1 === 0` self-terminate on move, committing
  on that path exactly like any other termination (unit-tested).
- **Forced decision 6** -- confirmed unchanged: the first cell still paints on pointer-down.
- **Trap 2** -- Story 2.5's click-placement tests (`PetriDishCanvas.test.tsx`,
  `BattleEditorView.test.tsx`, `BattlePage.test.tsx`) were **updated**, not routed around: each now
  fires `pointerUp` after `pointerDown` at the same point before asserting a commit. A new
  `click()` helper in `BattlePage.test.tsx` (down+up at one point) replaces the bare
  `fireEvent.pointerDown` call sites, since Story 2.6's AC7 rejects a second pointer-down while a
  stroke is still open -- without the paired `pointerUp`, the existing multi-click tests would
  silently stop opening new strokes rather than fail loudly.
- No `packages/*` change; no widening of `onStrokeCommit`/`onCommitGrid`; no eraser, undo,
  roster UI, name field, status bar, save, resize, Clear, back-navigation, or Epic 3 code -- scope
  boundaries held.
- No new dependency added; version policy (caret-on-current-stable) unaffected.

### File List

New:

- `apps/web/lib/canvas/cellLine.ts`
- `apps/web/lib/canvas/cellLine.test.ts`

Modified:

- `apps/web/components/PetriDishCanvas.tsx`
- `apps/web/components/PetriDishCanvas.test.tsx`
- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/epic-2/2-6-drag-painting.md` (this file)

### Code Review Record (2026-08-27, opus, fresh context)

Three adversarial layers (Blind Hunter — diff only; Edge Case Hunter — diff + repo; Acceptance
Auditor — diff + spec + context docs), plus an independent pass. Findings that survived
verification against the code (each claim mutation-checked, not trusted):

**Patched, in the review commit:**

1. **`paintedGridRef` was set on the no-renderer commit path**, dropping the split Story 2.5
   recorded in a comment and trap 12 spells out ("keep `paintedGridRef` unset on that path"). The
   ref's contract is "this grid is already on screen"; with no 2D context nothing was painted.
   Inert today (the grid effect returns on `renderer === null` first) but it is a deliberate
   invariant that 2.8/2.14 will make observable. Guarded on `rendererRef.current !== null` again;
   the commit still fires either way.
2. **The mid-stroke-resize terminate was gated behind `renderer !== null`.** The cached `rect` goes
   stale on a re-layout whether or not a renderer exists, and trap 12's no-context path still
   writes cells and still commits — so that path would have mapped every remaining move through
   the pre-resize box. `endStroke(true)` now runs before the renderer guard.
3. **The e2e's area assertion did not bind.** `dragPixels > clickPixels` passes with `cellsBetween`
   deleted outright: the drag still paints two cells (down + the single move's endpoint) against
   the click's one. Task 8 named area as *the* claim that distinguishes this story from 2.5, so the
   floor is now `clickPixels * 10` — the sweep covers 60% of the dish width.
4. **No drag gesture crossed the `onCommitGrid` seam in any integration test** (Task 7's last
   bullet asked for exactly that; both files only gained a `pointerUp` on existing *click*
   fixtures). Added one press-move-move-release to `BattleEditorView.test.tsx`, reusing
   `mountEditor` rather than re-declaring its boilerplate, asserting one call carrying cols 2..8 —
   mutation-checked: it fails with the interpolation removed.
5. **A secondary button's release ended and committed the stroke mid-drag.** `handlePointerUp`
   checked only `pointerId`, and a mouse reports every button on ONE pointerId — so right-clicking
   during a left-drag arrives as a `pointerup` with `button === 2` while the left button is still
   held, and it terminated the gesture. AC7 says a non-primary button must not disturb the stroke;
   the rest of the drag then painted nothing (`strokeRef` was null) and under 2.8 one gesture would
   have become two undo entries. Added the mirror of pointer-down's own `button !== 0` guard —
   deliberately NOT to `pointercancel`/`lostpointercapture`, which carry `button === -1` and are
   real terminations whatever caused them. Pinned by extending the AC7 test, which now also fires
   a foreign-`pointerId` `pointerup` (that guard survived every mutation before).
6. **`cellsBetween`'s bounding-box invariant was unasserted** even though the module's own doc
   comment declares it load-bearing — it is the whole reason `markDirty`'s `DirtyCellRangeError` is
   unreachable from a pointer handler, since `pointerToCell` vouches only for the two *endpoints*.
   Added a swept assertion over every integer endpoint pair in a 13×13 neighbourhood. (The exact
   stair-step path stays deliberately unpinned — the test file says so, and both roundings are
   valid lines.)
7. **Two test-hygiene fixes**: a third inline copy of the `getContext` spy in the drawFull test
   replaced with the describe's own `installContexts()`, and the drag describe's header comment —
   which narrated a reversal mid-sentence and then stated the opposite of what the code does —
   rewritten.

**Verified and found sound** (highest-risk claims, each mutation-checked): `cellsBetween` is a
correct Bresenham on all four quadrants, both slope-dominance branches and the 45° diagonal, with
`from === to → []`, `to` always last, no repeats, and no cell outside the endpoints' bounding box;
deleting `paintedGridRef.current = …` reddens two tests; replacing `cellsBetween(anchor, cell)`
with `[cell]` reddens the AC4 unit test and the new integration test. `renderer.draw`'s retained
`lastGrid` is a repaint source, not a diff baseline (`lastColourState` is a separate
`Uint16Array`), so mutating the working buffer in place across segments is safe and is what makes
`resize()`'s repaint show the live stroke. All 13 traps hold in the shipped code except trap 12's
`paintedGridRef` half, patched above. No "What NOT to build" boundary crossed; no `packages/*`
change; no widening of `onStrokeCommit`/`onCommitGrid`.

**Deferred — 12 items, all recorded in `deferred-work.md` with owners:** stale cached geometry on a
mid-stroke *scroll* (`ResizeObserver` sees size, not position); the resize effect's stale
`endStroke`/`onStrokeCommit` closure (inert while `onCommitGrid` is a bare `setState`, live from
2.8); the construction-effect cleanup discarding a stroke on any `[size, palette, colors]` change
and not releasing capture; `releasePointerCapture` unguarded by `hasPointerCapture` on the
cancel/lost-capture paths; pointer capture itself having no test that fails when it is deleted (and
AC8 pinned only by a jsdom computed-style check, with no touch e2e); Task 4's resize decision
untested (no `ResizeObserver` in jsdom); the duplicated fixture set across the two edit-variant
describes; the home-route bundle headroom at 3.5 KB; and —

**The `BattlePage.test.tsx` flake the Dev Agent Record reported: claim verified, diagnosis
corrected.** It is genuinely pre-existing — reproduced on `main` at 1 failure in 10
`npx turbo run test --force` runs, and on this branch at 1 in 6 — so it is not this story's doing.
But it is not confined to one test and it is not test-*order* sensitivity: three tests in that file
snapshot the recording context (or the `getContext` spy's call count) immediately after
`await findByRole(...)`, assuming the construction effect has already flushed, and an `as` cast
turns the miss into a `TypeError` instead of a clear failure. Under CPU contention that assumption
sometimes fails. Zero failures across 8 solo runs of the file and a full single-project
`vitest run`, which is why it looked like a one-off. **CI can go red on this PR without this story
having caused it** — re-run rather than chase it here.

**Decisions outstanding: none.** The home-route budget question is carried in the PR as the
standing deferred item it already is (`bundle:check` is green at 3.5 KB headroom; both prior moves
were Sidiar's call and none was made here).

Verification after the patches: `npm run ci` **green** end to end — typecheck, lint, format:check,
spec:check, coverage (5 packages, `apps/web` 39 files / 529 tests), build:standalone, bundle:check
(`/battle` + `/battle/new` 296.4 KB / 310 KB budget, 13.6 KB headroom; `/` 326.5 KB / 330 KB, 3.5 KB
headroom), e2e **160 passed, 4 skipped** across chromium/firefox/webkit/tablet.

## Change Log

| Date       | Change                                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-27 | Story created (create-story), ready-for-dev                                                                                                                                       |
| 2026-08-27 | Implemented (dev-story): drag-painting stroke pipeline, cellLine.ts interpolation unit, touch-action/user-select on the edit dish, updated Story 2.5 click tests for the pointer-up commit timing, new drag-painting unit and e2e tests. `npm run ci` green. Status -> review. |
| 2026-08-27 | Code review (opus, fresh context): 7 patches applied in a separate commit, 12 items deferred, 0 decisions outstanding. `npm run ci` green after the patches. Status -> done. |

Dev Model: sonnet   # extends the pointer/commit path Story 2.5 already established — the seam, the mapper, the Tool model and the dirty-paint discipline all exist; this adds a ref-held stroke and a pure interpolation unit on top of them, shaping nothing new for 2.7+

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 26s | 22 | 2,616 | 12,687 | 434,173 | 449,498 |
| Step 1 — create-story | opus-5 | 1 | 8m 48s | 162 | 33,887 | 301,836 | 7,489,338 | 7,825,223 |
| Step 2 — dev-story | sonnet-5 | 1 | 43m 24s | 552 | 36,134 | 1,666,447 | 51,214,228 | 52,917,361 |
| Step 3 — code review + PR | opus-5 | 6 | 53m 39s | 704 | 89,211 | 2,156,697 | 36,570,203 | 38,816,815 |
| _of which the orchestrator_ | opus-5 | — | — | 78 | 15,086 | 48,810 | 1,886,401 | 1,950,375 |
| **Total (create-story → PR ready)** | | 8 | **1h 46m** | 1,440 | 161,848 | 4,137,667 | 95,707,942 | **100,008,897** |

Run started 2026-08-27 08:22 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
