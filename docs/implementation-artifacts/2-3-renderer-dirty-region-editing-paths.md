---
baseline_commit: 074ed8f
---

# Story 2.3: Renderer Dirty-Region Editing Paths

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the renderer to repaint only changed cells,
so that editing feedback stays under the interaction budget at every grid size.

## Acceptance Criteria

1. **Given** the existing `GridRenderer`, **When** `draw(grid)` is called, **Then** only regions
   marked dirty since the last draw are repainted; a cell is dirty on occupant **or** age-shade
   change (AR-22, Decision B)
2. **And** `markDirty(cells)` accumulates dirty cells between draws
3. **Given** the frozen contract, **When** contract tests run, **Then** the public surface gains no
   scheduling: still no `requestAnimationFrame`, no grid mutation (RFC-002)
4. **And** dirty-region decision logic is tested as pure units, including: single-cell change
   repaints one region, not the full grid (AR-42)

> 📐 **Scope discipline — this story puts nothing on screen.**
> No canvas is mounted for editing here (`<PetriDishCanvas variant="edit">` is **Story 2.4**), no
> pointer handler exists (**2.5**/**2.6**), no undo ring (**2.8**). This story is the renderer
> module and its pure units only. Do **not** widen `PetriDishCanvasProps`, do **not** add an
> `'edit'` variant, do **not** touch `BattlePage`. The `assertUnhandledVariant` guard in
> `PetriDishCanvas.tsx:35` is 2.4's tripwire, not yours.

> 🛑 **`renderStatic` must not gain dirty state.** `gridRenderer.ts:288-306` names this story as
> the point where `drawFull` and `renderStatic` **diverge**: `drawFull` is for a renderer that will
> be driven again and gets dirty-state reset semantics; `renderStatic` is the terminal one-shot
> (Gallery tiles, M4/AR-25) and must never enter the driven-renderer state machine. Making them
> aliases again — or letting `renderStatic` prime the dirty baseline — silently opts ~50 Gallery
> canvases into per-cell bookkeeping they never use.

## Tasks / Subtasks

- [x] **Task 1 — Pure dirty-region decision module** (AC: 1, 2, 4)
  - [x] Create `apps/web/lib/canvas/dirtyCells.ts` — pure, no canvas, no DOM, sibling to
        `gridLayout.ts` / `colourStateGroups.ts` (the established AR-42 pattern: the renderer's
        *brain* is a unit, the renderer's *hand* is not)
  - [x] Define the coordinate type the frozen contract calls `CellCoord`. It exists nowhere in the
        repo — see **Forced decision 5**. Export it from this module.
  - [x] Accumulator: convert incoming coords to flat indices (`row * width + col`, the same
        encoding `colourStateGroups.ts` and `renderableGrid.ts` already use) into a `Set<number>`.
        Out-of-range coords must be rejected loudly, not written past the end — mirror
        `toRenderableGrid`'s eager-throw convention (`renderableGrid.ts:34-51`).
  - [x] Change detection: given a per-cell **last-drawn colour-state** buffer and a
        `RenderableGrid`, decide per candidate cell whether it actually changed. `fillGroupOf(lut,
        ref, age)` (`refToFillGroup.ts:97`) already encodes occupant token **and** age shade in one
        number — see **Forced decision 2**.
  - [x] Unit tests, no canvas anywhere: single-cell change yields exactly one dirty cell; a
        candidate whose colour state is unchanged is dropped (this is what makes Story 2.7's
        "erasing an already-empty cell is a visual no-op" true); a cell going occupied→empty **is**
        dirty; two organisms sharing a `colorToken` do **not** dirty each other's cells (Decision
        B.2 folding, already true of the batching path); age 6→7 dirties, age 7→8 does not
        (`ageShadeFor` saturates at 7 — `displayColor.ts:31-38`); out-of-range coord throws.
  - [x] ⚠️ **Add `'dirtyCells.ts'` to `NO_SCHEDULING_SOURCES` in `gridRenderer.test.ts:23-29`.**
        That array is hand-maintained; a new `lib/canvas/*.ts` file that is not listed escapes AC3's
        structural ban permanently and nothing fails.

- [x] **Task 2 — `markDirty(cells)` on `GridRenderer`** (AC: 2, 3)
  - [x] Accumulates between draws; calling it twice for the same cell is idempotent; calling it
        with an empty iterable is a no-op.
  - [x] It **marks only** — it must not paint, must not read the canvas, and must not touch
        `lastGrid`. A `markDirty` that repaints is the single easiest way to destroy this story's
        whole point (one repaint per painted cell during a drag instead of one per commit).
  - [x] Marking is legal before any draw has happened; the marks survive until the next `draw` or
        `drawFull` consumes them.

- [x] **Task 3 — `draw(grid)`: the dirty repaint path** (AC: 1, 3, 4)
  - [x] `assertGridMatchesSize(grid)` first — same guard `paint()` already applies
        (`gridRenderer.ts:177-191`). A dirty repaint against a mis-shaped grid corrupts more
        silently than a full one.
  - [x] Filter accumulated marks through the change detection from Task 1; if nothing survives,
        **return without touching the context at all** (RFC-002 §"Only redraw dirty regions":
        `if (this.dirtyRegions.size === 0) return`). Assert this with the recording double:
        `calls.length` unchanged, `fillStyleWrites.length` unchanged.
  - [x] Per surviving cell, in this order: (a) fill the cell rect with `colors.background`, (b)
        paint the cell's colour if occupied, (c) restore the grid lines that cross it. **(c) is not
        optional** — see **Silent-failure traps #1**.
  - [x] Reuse the existing batching for (b): group the surviving cells by `(colorToken, ageShade)`
        so one `fillStyle` write + one `beginPath`/`fill` covers each group (AR-23, Decision B.2).
        Do **not** open a fresh path per cell — that is the RFC-002 §3 anti-pattern, and it is the
        same anti-pattern whether 6000 cells or 6 are involved.
  - [x] Update the last-drawn colour-state buffer for every repainted cell, then clear the mark set.
  - [x] `draw` called with no prior `drawFull` has no baseline to diff against — see **Forced
        decision 3**.
  - [x] Tests: one painted cell produces a bounded call log (background fill + one group + line
        restoration) and **not** the ~6000-`rect` log a 100×60 `drawFull` produces — assert the
        `rect` count directly, that is AC4's "one region, not the full grid"; repeated `draw` with
        no new marks is a no-op; `draw` after `markDirty` of a cell whose state did not change is a
        no-op.

- [x] **Task 4 — `drawFull` / `renderStatic` divergence and retention policy** (AC: 1, 3)
  - [x] `drawFull`: full repaint **plus** dirty-state reset — clear the mark set and (re)prime the
        last-drawn colour-state buffer for the whole grid. This is what makes a `draw` after a
        `resize`/`setGridLines` correct.
  - [x] `renderStatic`: full repaint, **no** dirty-state, **no** colour-state buffer allocation,
        and — closing the open deferred item — **no `lastGrid` retention**. See **Forced
        decision 4**; this is a behavioural change to an Epic 1 path, so it needs its own tests and
        a `deferred-work.md` update.
  - [x] `resize()` and `setGridLines()` currently call `paint()` (the shared body). Both change the
        layout, which invalidates every cached cell position — after either, the whole surface has
        been repainted, so both must reset dirty state exactly as `drawFull` does. A `resize()` that
        leaves stale marks behind repaints cells at the *old* geometry on the next `draw`.
  - [x] `resize()`'s grid-dimension-change branch (`gridRenderer.ts:326-337`) drops `lastGrid`; the
        colour-state buffer is now the wrong length too and must be reallocated or dropped with it.

- [x] **Task 5 — Close the three renderer deferred-work items this story owns**
  (`docs/implementation-artifacts/deferred-work.md`, §"Deferred from: code review of
  1-8-gridrenderer-static-core")
  - [x] **`rebuildGridLineOverlay()` allocates a full-backing-store canvas on every `resize()`** —
        add the structural-equality guard on the previous layout the entry names, so an unchanged
        layout reuses the cached overlay instead of reallocating. Assert reuse by identity.
  - [x] **The overlay cache's `drawImage` path has zero test coverage** — the entry is re-pointed to
        this story because 2.3 is the first place able to assert the cache is *reused* across
        repaints rather than rebuilt. `installRecordingContext2d` scopes its `getContext` spy to one
        canvas instance (`recordingContext2d.ts:82`), so `GridRenderer`'s offscreen overlay always
        gets real jsdom (`null`) and every existing test exercises the *fallback*. Give the double a
        way to serve the offscreen canvas too (e.g. an opt-in second install, or matching on
        `HTMLCanvasElement` rather than one instance) and cover the `drawImage` branch of
        `paintGridLines`, the `gridLineOverlayLayout` identity check, and the dirty-path line
        restoration.
  - [x] **`applyDevicePixelSizing`'s anti-double-scaling guard is structurally inoperative under a
        per-paint renderer** — the entry says "whichever way that lands, the guard needs to be
        either instance-independent or explicitly documented as requiring a retained renderer".
        See **Forced decision 6**. Do one of the two; do not leave it as-is silently.
  - [x] Mark each closed entry `✅ Resolved in Story 2.3` in place (the file's own convention —
        strike the text, keep the history), and add a new §"Deferred from: Story 2.3" for anything
        you consciously punt.

- [x] **Task 6 — Contract tests still hold** (AC: 3)
  - [x] Extend the AC3 behavioural test at `gridRenderer.test.ts:75-96` to call `draw` and
        `markDirty` in the same sweep — the spies assert "across the full API surface", and the
        surface just grew.
  - [x] Extend the "never mutates the grid it is given" test (`:105`) the same way. The dirty path
        reads `occupant`/`age` and writes a *separate* buffer; a dev who writes the colour state
        back into `grid.age` would pass every other test in this file.
  - [x] Keep "owns no scheduling state — same input, identical call logs" true for the new methods.

- [x] **Task 7 — Verification**
  - [x] `npm run ci` — **redirect to a file and echo `$?`**; do not pipe (a pipe reports the
        pipe's exit code, which masked a real `format:check` failure in the Story 1.9 review).
  - [x] Record the actual per-workspace test counts, the `spec:check` id count, and the
        `bundle:check` number in the Dev Agent Record. Epic 2's canvas stories budget against
        **324.2 KB / 330 KB — 5.8 KB headroom** (Story 2.2's corrected measurement; 2.1's 319.7 KB
        is stale). This story should cost ~0 KB — nothing here is imported by a route yet.
  - [x] After pushing, check `gh run list`. A local green `npm run ci` is not proof CI is green.

### Review Findings

Code review (Sonnet, second model) ran three parallel adversarial layers (Blind Hunter, Edge Case
Hunter, Acceptance Auditor) against `git diff 074ed8f..1fcb919`, deduplicated and triaged below.

- [ ] [Review][Decision] **The RFC-002-vs-implementation "no back buffer" divergence is
      documented in code and the Dev Agent Record only, not propagated into the specs, and was
      resolved by the same agent that raised it.** RFC-002's Decision line
      (`docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md:85`) still reads "HTML5
      Canvas API with double buffering and dirty rectangle optimization", and
      `docs/planning-artifacts/architecture.md:63`'s Tech Stack table independently repeats
      "double-buffer" — a second, un-addressed citation of the same claim the story's "Spec
      conflicts surfaced" section didn't name. CLAUDE.md's own rule: *"Where docs/project-context.md
      and an RFC disagree, the context file flags a deliberate override... Surface any new conflict
      — don't silently pick one."* The reasoning itself checks out (verified independently: Canvas2D
      never presents a partially-painted frame within one task, so there is no tearing to prevent,
      and a full-canvas `drawImage` swap would repaint everything anyway — precisely what dirty
      regions exist to avoid). The open question is process, not correctness: does this count as
      "picking a side" on a cross-RFC conflict the project's own workflow says should be resolved
      one-at-a-time with Sidiar rather than pre-baked into the story and executed end-to-end by a
      single dev agent? **Options:** (a) accept the divergence as-is and have Sidiar (or a follow-up
      task) update RFC-002's Decision line and `architecture.md:63` to match reality; (b) reject the
      divergence and require an actual back buffer; (c) leave both docs stale deliberately and rely
      on `gridRenderer.ts`'s class comment as the sole source of truth. Left unresolved for Sidiar.

- [x] [Review][Patch] `markDirtyCells` could leave partial marks in caller-owned state on a
      mid-batch throw [`apps/web/lib/canvas/dirtyCells.ts:68`] — fixed: coords are now converted to
      indices in a local array before any is added to `marks`, so a throw touches nothing.
- [x] [Review][Patch] `draw()` cleared `dirtyCells` before `paintDirtyCells` ran, so a throw
      mid-paint would discard marks with no retry path
      [`apps/web/lib/canvas/gridRenderer.ts:432`] — fixed: the clear is now ordered after a
      successful paint.
- [x] [Review][Patch] Unchecked `groups.get(groupId) as number[]` cast in `paintDirtyCells`
      [`apps/web/lib/canvas/gridRenderer.ts:492`] — fixed: iterates `groups.entries()` directly,
      removing both the second lookup and the cast.
- [x] [Review][Patch] `dirtyCells.test.ts`'s `baselineFor()` fixture hand-reimplemented
      `colourStateAt`'s branching instead of calling it, so the two could silently diverge
      [`apps/web/lib/canvas/dirtyCells.test.ts:33`] — fixed: now calls the real `colourStateAt`.
- [x] [Review][Patch] The "warns once, not per candidate" test used the same out-of-range ref for
      both candidates, so it could not distinguish per-ref dedup from a global once-ever latch
      [`apps/web/lib/canvas/dirtyCells.test.ts:173`] — fixed: uses two distinct out-of-range refs
      and asserts two warnings, one per ref.
- [x] [Review][Patch] Erasing a cell while grid lines are visible (silent-failure trap #1's exact
      scenario) was never exercised end-to-end — every erase test used `showGridLines: false` and
      every line-restoration test used an occupied cell
      [`apps/web/lib/canvas/gridRenderer.test.ts`] — fixed: added a test combining both.
- [x] [Review][Defer] Bar-clamp geometry (`Math.min(offset * cellSize, bound - 1)`) is duplicated
      between `drawGridLinesInto` and `restoreGridLinesOver` rather than shared, risking silent
      drift despite the "byte-identical" claim [`apps/web/lib/canvas/gridRenderer.ts`] — deferred,
      low risk today (both private, same file, same review), tracked in `deferred-work.md`.
- [x] [Review][Defer] `resetDirtyState` sweeps the whole grid through `colourStateAt` on every
      full repaint (O(cells) baseline re-prime) — pre-existing, already tracked by the dev's own
      `deferred-work.md` entry for Story 3.7; confirmed correct, not re-filed.
- [x] [Review][Defer] `restoreGridLinesOver` draws 4 bar segments per dirty cell, 2 of which are
      no-ops for interior cells — pre-existing, already tracked by the dev's own `deferred-work.md`
      entry for Story 3.7/3.9; confirmed correct, not re-filed.

Dismissed as noise or non-reachable given the class's actual invariants (verified against the real
code, not assumed): `selectDirtyCells` receiving duplicate candidate indices (unreachable — its
only caller passes a `Set`); an out-of-range index reaching `lastColourState`/`colourStateAt`
(unreachable — `resize()`/`setGridLines()` clear `dirtyCells` and reset `lastColourState` together,
and `assertGridMatchesSize` runs before every dirty selection); `EMPTY_COLOUR_STATE`'s magic-number
justification; the "pure" doc-comment claim being technically impure w.r.t. `console.warn`/WeakMap
state; unbacked verification claims (independently re-run and confirmed exact: 440 `web` tests,
132/132 spec ids, 325.0 KB gzipped bundle); general comment-density/drift observations.

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **Dirty representation: flat-index cell set, or merged rectangles?** RFC-002 §"2. Dirty
   Rectangle Tracking" sketches a `DirtyRegionTracker` with `Map<string, DirtyRect>` and
   `mergeRegions()`. Against that: the entire existing paint path is flat-index-based
   (`colourStateGroups.ts` returns `cells: number[]` of flat indices; `paintCells` derives
   row/col from them), and a merged rectangle spans **multiple colour states**, so it cannot be
   painted through the batching path at all — it would need a second, unbatched paint routine and
   would repaint untouched cells inside the merged box. **Recommendation: `Set<number>` of flat
   indices, repainted through the existing `(colorToken, ageShade)` grouping.** The word "regions"
   in AC1 is satisfied by "the marked cells", which is what the frozen contract's own signature
   (`markDirty(cells: Iterable<CellCoord>)`) says. Record the choice; if you build rect merging,
   justify it against the batching bound.

2. **Where "a cell is dirty on occupant OR age-shade change" is decided.** Two readings of AC1:
   (a) the renderer diffs the incoming grid against a retained previous grid and derives the dirty
   set itself; (b) the caller marks candidates and the renderer repaints exactly those. Pure (a)
   makes `markDirty` — a method the frozen contract explicitly lists — dead weight, and requires
   copying both typed arrays every draw (a 100×60 `Uint8Array` + `Uint16Array` per frame at 60 FPS,
   against NFR-1.1). Pure (b) lets a wrong caller repaint stale cells and makes Story 2.7's
   "erasing an already-empty cell is a visual no-op" the caller's problem.
   **Recommendation: hybrid.** `markDirty` accumulates *candidates*; `draw` filters each candidate
   against a retained per-cell **last-drawn colour state**, which is exactly `fillGroupOf(lut, ref,
   age)` = `tokenIndex * 8 + ageShade` — one `Uint16Array` of `width * height` (~12 KB at 100×60)
   that encodes occupant token *and* age shade in a single comparison, with a sentinel for "empty"
   (valid group ids are 0..159, so e.g. `0xFFFF` is free). That is literally AC1's rule, it is
   cheaper than retaining both buffers, and it correctly treats two organisms sharing a colour
   token as visually identical (Decision B.2 / M6). Record whichever you pick.

3. **`draw` before any `drawFull`.** There is no baseline colour-state buffer to diff against.
   Options: throw a named error, or fall back to a full repaint and prime the baseline.
   **Recommendation: fall back to a full repaint**, with a comment naming why — a renderer's first
   frame legitimately has nothing to be incremental against, and throwing out of what will become a
   pointer-move path (2.6) is worse than one extra full paint. Pin it with a test either way.

4. **`renderStatic` retention.** The open item says nulling `lastGrid` in `renderStatic` "would fix
   the retention but also break re-layout repaint for static tiles, which is a real behavioural
   trade-off". Since Story 1.11, `<PetriDishCanvas>` constructs a fresh renderer per paint and
   never calls `resize()`/`setGridLines()` on a static one (`PetriDishCanvas.tsx:56-67`), so the
   re-layout repaint that retention protects **has no caller**. **Recommendation: drop the
   retention in `renderStatic`** and document that a static surface re-layouts by reconstruction.
   If you keep it, say what would break without it — the ~50 pinned typed-array pairs at NFR-7.2
   are the cost.

5. **The `CellCoord` shape.** Named by the frozen contract, defined nowhere. Candidates:
   `{ col: number; row: number }` (matches `gridLayout.ts` / the `size: { cols, rows }` vocabulary
   the renderer already speaks) vs `{ x, y }` (matches nothing here) vs a bare flat `number` (fast,
   but the contract says `CellCoord`, and callers in 2.5/2.6 will be thinking in grid coordinates
   straight off a pointer event). **Recommendation: `{ col: number; row: number }`**, converted to
   a flat index at the accumulator boundary. Every later story (2.5, 2.6, 2.7, 2.14, 2.15, 3.9)
   inherits this type — record it.

6. **Retained renderer vs per-paint renderer** (closes the `applyDevicePixelSizing` deferred item).
   Dirty tracking is meaningless for a renderer constructed fresh on every paint — this story is
   where a **retained** renderer becomes real for the edit/playback surfaces, while the Gallery's
   `static` tiles keep the per-paint pattern Story 1.11 chose deliberately. So the guard's premise
   ("repeated `resize()`s on one instance") is now true for the surfaces that will call `resize()`.
   **Recommendation: document the guard as requiring a retained renderer** (a comment naming the
   per-paint caller as the case it cannot help) rather than re-engineering it blind, and note in
   `deferred-work.md` that the `dpr²` exposure remains for `static` tiles repainted at a 0-width
   box. If you make it instance-independent instead, prove it with a test at DPR 2 across two
   renderer instances on the same canvas.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

**#1 — RFC-002's headline decision says "double buffering"; this story's ACs do not, and the
existing renderer has no back buffer.** RFC-002's Decision line is *"HTML5 Canvas API with double
buffering and dirty rectangle optimization"*, and its §"1. Double Buffering" sketches a full
offscreen frame + `drawImage` swap. Story 1.8 shipped **no** back buffer — the only offscreen
surface is the grid-line overlay cache (RFC-002 Risk 4). The two optimisations are in tension: a
full-canvas `drawImage` per frame repaints everything anyway, which is precisely the cost dirty
regions exist to avoid, and Canvas2D never presents a partially-painted frame from within one task,
so there is no tearing to prevent. **Suggested resolution: no back buffer; dirty regions win, and
the overlay cache remains the only offscreen canvas.** State this in the Dev Agent Record; do not
quietly add a back buffer because the RFC's title line asks for one.

**#2 — the method is `draw` in the frozen contract and `render` in RFC-002's loop sketch.**
`component-tree-battle-page.md#5` (the frozen contract, which Story 1.8 already implemented against)
says `draw(grid)`; RFC-002 §5's `SimulationLoop` calls `this.renderer.render(...)`. Same method,
two names. **The frozen contract wins** — it is the artefact Epic 3 is being handed and the one the
existing code matches. Note it so Story 3.8 does not rediscover it.

**#3 — AC1 says "regions", the contract signature says cells.** See **Forced decision 1**. Not a
blocker, but say which reading you implemented.

### Silent-failure traps — the intuitive implementation is wrong

1. ⚠️ **A dirty cell repaint erases the grid lines that cross it.** `paint()` draws background →
   cells → lines, so lines sit **on top** of cells (`gridRenderer.ts:280-286`). Filling a cell rect
   in the dirty path paints over the four line segments bordering it. Without explicit restoration
   the dish accumulates line gaps wherever the user has painted, and they persist until the next
   full repaint — which in Edit mode may be never. Restore the lines over the repainted area (bar
   segments around each dirty cell, or the corresponding sub-rectangle of the cached overlay).
   ⚠️ If you go the sub-rectangle route, note that `Canvas2D` (`gridRenderer.ts:29-32`) is a
   `Pick<>` exposing only the 3-argument `drawImage`; the 9-argument form needs both that alias
   **and** `RecordingContext2D.drawImage` (`recordingContext2d.ts:61`) widened, or the test double
   silently drops the source-rect arguments.

2. ⚠️ **`ctx.fillStyle = 'var(--gol-*)'` is a silent no-op** and the previous `fillStyle` stays.
   The dirty path adds new `fillStyle` write sites; every one of them must use a resolved concrete
   string from the injected `GridRendererColors` / `displayColorAt`, never a token (project-context
   *Silent-failure traps*; `themeColors.ts` is the resolver).

3. ⚠️ **Do not `beginPath()` once and `fill()` once across groups.** Canvas paths accumulate, so
   group *n*'s `fill()` re-fills groups 1..*n* in group *n*'s colour — "the last organism's colour
   wins", plus O(n²) fill work. One `beginPath`/`fill` per group, as `paintCells` already does.

4. ⚠️ **`markDirty` must not paint.** Stories 2.5/2.6 call it per cell during a drag; a repaint
   inside it converts one repaint-per-commit into one-per-pointer-move, which is the NFR-4.2
   budget this whole story exists to protect. The hot stroke state lives in the caller's refs
   (RFC-005 D6 / project-context *hot simulation state*); the renderer just accumulates.

5. ⚠️ **`age` saturates at shade 7.** `ageShadeFor` returns `min(age, 7)` and returns 7 outright for
   a non-aging organism (`displayColor.ts:31-38`). A dirty test asserting "any age change dirties
   the cell" encodes a spec violation: age 7→8→99 is visually identical and must **not** repaint.
   AR-22 says "bounded to a cell's first 7 cycles (after which its shade is stable)". Note that
   `MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)` (Decision B.5) is an **engine** constant, not a
   renderer one — do not import that reasoning into the shade comparison.

6. ⚠️ **A cell going occupied→empty is dirty and needs the background repainted, not skipped.**
   `groupByColourState` `continue`s on `ref === 0` because the full-repaint path already filled the
   whole background first (`colourStateGroups.ts:74`). The dirty path has no such prior fill — if
   you only paint occupied cells, an erase leaves the old colour on screen and every test that
   only ever paints will pass.

7. ⚠️ **Out-of-range refs still need the warn-once skip.** `groupByColourState` guards `ref >=
   lut.size` (`:80`), and the registry is keyed per-LUT via a `WeakMap`. If the dirty path derives
   fill groups without going through that function, re-derive the guard or you reintroduce the
   phantom-organism paint. `resetColourStateWarnings()` in `afterEach` for any test that touches it.

8. ⚠️ **`NO_SCHEDULING_SOURCES` is a hand-maintained array** (`gridRenderer.test.ts:23-29`). A new
   `lib/canvas/*.ts` file not added to it is exempt from AC3's structural ban forever, and nothing
   fails.

### Previous story intelligence (Story 2.2, `2-2-create-new-battle-gallery-wiring.md`)

- **Bundle baseline is 324.2 KB / 330 KB (5.8 KB headroom)**, corrected in 2.2's review. Story 2.1's
  recorded 319.7 KB is stale and the 319.7 → 324.2 movement predates 2.2. Do not assume `styled()`
  chrome consumed it. Nothing in this story should reach the home route at all.
- **Verification discipline that the review enforced:** measure claims rather than attributing them.
  2.2's first draft attributed ~4.5 KB to its own CTAs; the reviewer measured ~0 KB. If you claim a
  cost or a saving here, measure it.
- **`npm run ci` must be redirected, not piped** — the exit-code trap is repo lore now, twice over.
- **Every forced decision gets an entry in the Completion Notes List** naming the option chosen and
  the reason. 2.1 and 2.2 both did this; the code review reads it as the contract.
- **`deferred-work.md` entries are struck in place, not deleted** (`~~text~~ — **✅ Resolved in
  Story N.M.**`), and new deferrals get their own `## Deferred from: …` heading.

### Git intelligence (last 5 commits)

`074ed8f` (merge of `story/2-2-…`), `cd854cd`, `c4e29a0`, `c0f6acd`, `4256822`. Pattern: one
`feat:` commit implementing the story, then `fix:` commits applying code-review findings, merged
via PR with a **merge commit — never squashed** (the per-commit rationale is the point). Story work
runs on a `story/<story-key>` branch. Story subagents may commit and push to that branch without
asking; **merging to `main` is always Sidiar's call**.

### Latest technical information

No new dependency, no version movement. Everything this story needs is installed and pinned:
TypeScript 5.9.3 strict, Vitest + v8 coverage, jsdom (which returns `null` from `getContext('2d')` —
hence `recordingContext2d.ts`), Playwright. Canvas2D's `drawImage` 9-argument overload and
`ImageData` are baseline in all four NFR-2.1 engines; no feature detection needed. **Do not add
`canvas` (native build, fragile under `engine-strict` Node 24) or `vitest-canvas-mock` (unmaintained
jest port)** — Story 1.7 and 1.8 both declined exactly these, and the hand-rolled double is the
established answer. `OffscreenCanvas` is likewise unnecessary: the overlay cache uses a plain
detached `<canvas>` (`gridRenderer.ts:231`) precisely so the jsdom fallback stays a fallback.

### What NOT to build (scope boundaries)

| Not in this story | Where it lives |
|---|---|
| `<PetriDishCanvas variant="edit">`, any mounted editing canvas | 2.4 |
| Pointer→cell mapping, click placement, drag strokes, eraser | 2.5 / 2.6 / 2.7 |
| `useUndoableGrid`, the 30-snapshot ring | 2.8 (AR-30) |
| `setPalette` / mutating the LUT while a renderer is live | 2.10 (open deferred item, explicitly *not* 2.3) |
| Grid resize UI, the shrink warning dialog | 2.14 |
| `SimulationLoop`, RAF, the time accumulator | 3.8 (Decision D) |
| Playback colour-state batching at speed, the perf harness | 3.9 / 3.7 |
| Repainting tiles on a theme switch | 6.4 (open deferred item) |
| `CSS.supports` guard on theme colour strings | Epic 6 (open deferred item) |

### Project Structure Notes

- **Everything is in `apps/web/lib/canvas/`.** The renderer is *not* in `packages/*` and must not
  move there: it needs DOM types (`HTMLCanvasElement`, `CanvasRenderingContext2D`), and
  `tsconfig.base.json` is `lib: ["ES2022"]` deliberately so "the engine is pure" is
  compiler-enforced. `packages/simulation` is still an empty barrel.
- **`GridRenderer` is a class on purpose.** The "no classes" rule is scoped to the engine
  (`packages/simulation`, the rules layer); `gridRenderer.ts:8-11` records why this one place in
  `apps/web` is the exception — it holds genuine instance state. The new dirty state joins it.
  The **decision logic** stays a pure function module (AR-42), which is why Task 1 exists.
- Non-component TS files are **camelCase, never dotted** — `dirtyCells.ts`, not `dirty-cells.ts`
  or `dirty.cells.ts`.
- `isolatedModules: true` — re-export types with `export type { CellCoord }`.
- **Comments explain WHY.** Cite governing ids exactly as the specs spell them (`AR-22`, `M4`,
  `Decision B.2`, `RFC-002`); `npm run spec:check` fails the build on an id that resolves to
  nothing, and `AC1`/bare `Decision 7` are deliberately unchecked (story- and RFC-relative).
- **Coverage:** `apps/web` has no gate (deliberate counter-metric) — do not write tests to raise a
  number. The `packages/*` gates are untouched by this story. **Never pixel-snapshot the canvas**;
  the recording double and pure units are the whole strategy.

### References

- [Source: docs/planning-artifacts/epics.md#Story 2.3: Renderer Dirty-Region Editing Paths] — the ACs
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — AR-22 (dirty on occupant OR
  age-shade change, auto-fit), AR-23 (≤160 fill groups), AR-25 (loopless `renderStatic`), AR-42
  (canvas testing = pure units, no pixel snapshots)
- [Source: docs/planning-artifacts/component-tree-battle-page.md#5] — the **frozen contract**: all
  six methods, "never calls `requestAnimationFrame`, never advances simulation state", and the
  epic split ("Epic 1 ships `renderStatic` + `drawFull`; Epic 2 adds dirty-region editing paths;
  Epic 3 wraps it with the loop, adding nothing to it")
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.10] — `<PetriDishCanvas>`'s three
  variants and which epic each lands in (context only; not built here)
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md] — §"High Level Design
  Proposal" (the `render`/dirty-regions sketch and the double-buffering claim — see **Spec
  conflicts #1/#2**), §"2. Dirty Rectangle Tracking", §"3. Batch Rendering by Colour State",
  §"Age is engine state, not a render artefact", §"Static one-shot render (M4)", Risk 4 (overlay
  cache)
- [Source: docs/planning-artifacts/architecture.md#Decision B] — B.2 batch by colour state, B.4
  dirty on occupant **or** age-shade change bounded to the first 7 cycles, B.5 age semantics
- [Source: docs/planning-artifacts/architecture.md#Decision D] — D.3 repaint-only-after-a-step;
  "dirty regions make idle frames free" is the property Story 3.8 will rely on
- [Source: docs/planning-artifacts/architecture.md#M4] — thumbnails rendered on demand, never stored
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 6] — one
  commit per coalesced gesture; the granularity `markDirty`'s callers (2.5–2.7) will follow
- [Source: docs/project-context.md] — no DOM types in `packages/*`; hot state in refs; the
  `fillStyle = 'var(--gol-*)'` silent no-op; "never batch rendering by organism"; grid dimensions
  are parameters, never constants; the commit gate; the pipe-swallowed-exit-code trap
- [Source: docs/implementation-artifacts/deferred-work.md#Deferred from: code review of
  1-8-gridrenderer-static-core] — the three items Task 5 closes, verbatim
- Code being modified: `apps/web/lib/canvas/gridRenderer.ts` (`paint`/`drawFull`/`renderStatic`
  :278-306, `resize` :322-337, `setGridLines` :341-347, `paintGridLines` :267-276,
  `rebuildGridLineOverlay` :225-240, `applyDevicePixelSizing` :146-175, `Canvas2D` alias :29-32),
  `apps/web/lib/canvas/gridRenderer.test.ts` (`NO_SCHEDULING_SOURCES` :23-29, AC3 suite :74-141),
  `apps/web/lib/recordingContext2d.ts` (the double and its one-canvas `getContext` spy),
  `docs/implementation-artifacts/deferred-work.md`
- Code read but **not** modified: `colourStateGroups.ts`, `refToFillGroup.ts` (`fillGroupOf` :97),
  `renderableGrid.ts`, `gridLayout.ts`, `palette/displayColor.ts` (`ageShadeFor` :31),
  `components/PetriDishCanvas.tsx`

## Dev Agent Record

### Agent Model Used

claude-opus-5 (`bmad-dev-story`)

### Debug Log References

- `npm run ci` — redirected to a file, never piped (`npm run ci > ci.log 2>&1; echo $?`). **EXIT=0.**
  One pre-existing `react-hooks/exhaustive-deps` **warning** in `BattleGallery.tsx:248` (0 errors),
  untouched by this story.
- Per-workspace test counts after this story: `@gol/domain` 85 (5 files), `@gol/persistence` 82
  (7 files), `@gol/test-utils` 75 (5 files), `web` **439** (35 files). `@gol/simulation` is still an
  empty barrel (`passWithNoTests`). Story 2.3 adds 43 `web` tests: 19 in `dirtyCells.test.ts` (new)
  and 24 in `gridRenderer.test.ts` (55 total there, up from 31).
- `npm run spec:check` — 134 source files + 31 authority docs scanned, **132 distinct ids cited**,
  334 defined, all 132 resolve.
- `npm run bundle:check` — **325.0 KB gzipped / 330 KB budget, 5.0 KB headroom** (raw 1124.2 KB).
- `npm run e2e` — 140 passed, 4 skipped, across chromium/firefox/webkit/tablet.

### Completion Notes List

**Bundle: +0.8 KB gzipped, measured rather than assumed.** The story predicted ~0 KB ("nothing here
is imported by a route yet"). That premise is wrong and the measurement says so: `dirtyCells.ts` is
imported by `gridRenderer.ts`, which the home route already pulls in through
`BattleTile` → `<PetriDishCanvas>`. Measured by building the tree at `074ed8f` (stash) and rebuilding
with the story applied: **324.2 KB → 325.0 KB gzipped** (raw 1121.5 → 1124.2 KB). The 324.2 KB
baseline reproduced Story 2.2's corrected figure exactly, so the delta is this story's and nothing
else's. Headroom: 5.8 KB → **5.0 KB**. Nothing on the home route *calls* `draw`/`markDirty` yet —
the cost is the code being reachable, not used, and Story 2.4 is where it starts earning it.

**Forced decisions (all six, as recorded in the Dev Notes):**

1. **Dirty representation — `Set<number>` of flat indices, NOT merged rectangles.** Taken as
   recommended. RFC-002 §"2. Dirty Rectangle Tracking"'s `DirtyRegionTracker`/`mergeRegions()` is
   declined for a concrete reason, recorded in `dirtyCells.ts`'s header: a merged rectangle spans
   multiple colour states, so it cannot be painted through the `(colorToken, ageShade)` batching
   path at all (Decision B.2 / AR-23) — it would need a second, unbatched paint routine *and* would
   repaint untouched cells inside the merged box. The whole existing paint path is flat-index based,
   and the frozen contract's own signature is cell-shaped.
2. **Change detection — hybrid.** Taken as recommended. `markDirty` accumulates *candidates*;
   `draw` filters each against a retained per-cell last-drawn colour state
   (`Uint16Array` of `fillGroupOf`'s `tokenIndex * 8 + ageShade`, `0xFFFF` sentinel for empty).
   That is AC1's "occupant OR age-shade change" rule in one integer comparison, is cheaper than
   retaining copies of both typed arrays per draw (NFR-1.1), and folds two organisms sharing a
   colour token to visually identical for free (Decision B.2 / M6). `EMPTY_COLOUR_STATE` is `0xFFFF`
   specifically so a zero-filled fresh buffer reads as "group 0", not accidentally as "empty" —
   which is what forces `drawFull` to prime the baseline explicitly.
3. **`draw` before any `drawFull` — full-repaint fallback, not a throw.** Taken as recommended.
   `lastColourState === null` routes straight to `paint()`, which paints and primes. Comment names
   why: a renderer's first frame legitimately has nothing to be incremental against, and throwing
   out of what becomes a pointer-move path in Story 2.6 is worse than one extra full paint. Pinned
   by "falls back to a FULL repaint when no baseline has been primed yet".
4. **`renderStatic` retention — dropped.** Taken as recommended. `renderStatic` now calls
   `paintSurface()` (pixels only) and stops; `drawFull` calls `paint()`, which adds `lastGrid`
   retention *and* the dirty-state reset. A static surface re-layouts by reconstruction, not by
   repaint — safe because `<PetriDishCanvas>` has constructed a fresh renderer per paint since Story
   1.11 and never calls `resize()`/`setGridLines()` on a static one, so the re-layout repaint the
   retention protected had no caller. Removes ~50 pinned `Uint8Array`/`Uint16Array` pairs at
   NFR-7.2 scale.
5. **`CellCoord` = `{ col: number; row: number }`.** Taken as recommended, defined and exported from
   `dirtyCells.ts` and re-exported from `gridRenderer.ts` (`export type`, isolatedModules) so
   Stories 2.5/2.6/2.7/2.14/2.15/3.9 import it from the renderer they hand it to. Flat indices stay
   an internal encoding, converted at the accumulator boundary by `toFlatIndex`, which throws
   `DirtyCellRangeError` on an out-of-range **or non-integer** coord — the integer check is an
   addition, because a fractional col makes the flat index fractional and `Uint16Array[1.5]` reads
   `undefined` rather than throwing.
6. **Retained vs per-paint renderer — the DPR guard is documented, not re-engineered.** Taken as
   recommended. `applyDevicePixelSizing`'s comment now names `<PetriDishCanvas variant="static">`'s
   per-paint construction as the case the guard cannot help, and says why the instance-independent
   alternative (stamping renderer state onto the canvas element) was rejected without a real
   0-width repaint to justify it. The residual `dpr²` exposure is re-filed in `deferred-work.md`
   under "Deferred from: Story 2.3".

**Spec conflicts — resolutions recorded, none silently picked:**

- **#1 — RFC-002's headline "double buffering" vs. the ACs and the shipped renderer: NO BACK
  BUFFER.** Resolved as the story suggested, and stated in `gridRenderer.ts`'s class doc comment so
  the next reader finds it before re-adding one. The two optimisations are in tension — a
  full-canvas `drawImage` per frame repaints everything anyway, which is exactly the cost dirty
  regions exist to avoid — and Canvas2D never presents a partially-painted frame from within one
  task, so there is no tearing to prevent. The grid-line overlay (RFC-002 Risk 4) remains the only
  offscreen canvas. **This is a live RFC-002-vs-implementation divergence and it is now deliberate,
  not accidental; RFC-002's Decision line still says "double buffering".**
- **#2 — `draw` (frozen contract) vs `render` (RFC-002 §5's `SimulationLoop` sketch): the frozen
  contract wins.** The method is `draw(grid)`. `component-tree-battle-page.md#5` is the artefact
  Epic 3 is handed and the one Story 1.8's code already matches. Noted here so **Story 3.8** does
  not rediscover it and wire `renderer.render(...)`.
- **#3 — AC1 says "regions", the contract signature says cells: implemented as cells.** "The marked
  cells" is the reading; see forced decision 1 for why merged rects are not viable against the
  batching bound.

**Silent-failure traps — how each was actually handled:**

1. **Grid lines restored over every repainted cell.** `restoreGridLinesOver()` redraws the four bar
   segments bordering each dirty cell at the *same clamped coordinates* `drawGridLinesInto` uses
   (`min(col * cellSize, drawWidth - 1)`), so a restored border is byte-identical to a full
   repaint's, closing bars included. Bar segments rather than a sub-rectangle `drawImage`: the
   9-argument overload is outside the deliberately-narrow `Canvas2D` alias, and widening it would
   also mean widening `RecordingContext2D.drawImage`, whose current 3-argument signature would
   otherwise silently drop the source-rect arguments. Pinned by an exact-call-log assertion.
2. **Every new `fillStyle` write site uses a resolved concrete string** — `this.colors.background`,
   `this.colors.gridLine`, `displayColorAt(...)`. No `var(--gol-*)` reaches a context.
3. **One `beginPath`/`fill` per colour group**, groups iterated in ascending `groupId` order so two
   draws of the same change produce identical call logs (asserted).
4. **`markDirty` paints nothing** — asserted directly: `calls` and `fillStyleWrites` both length 0
   after marking.
5. **Age saturation respected** — `dirtyCells.test.ts` pins 6→7 dirty, 7→8 and 7→99 clean, and an
   age change on a NON-aging organism clean. `MAX_RELEVANT_AGE` is not imported anywhere near this.
6. **occupied→empty is dirty and repaints the background**, with no colour group emitted — asserted
   as an exact call log.
7. **The out-of-range-ref warn-once guard is reused, not re-derived.** `colourStateAt()` was
   extracted out of `groupByColourState`'s loop into `colourStateGroups.ts` (which owns the
   per-LUT `WeakMap` registry) and is now the single place both paint paths resolve a cell's colour
   state. `groupByColourState` calls it too, so there is exactly one guard, not two.
8. **`dirtyCells.ts` added to `NO_SCHEDULING_SOURCES`.**

**Scope discipline.** No canvas is mounted, `PetriDishCanvasProps` is untouched, no `'edit'`
variant, `BattlePage` untouched, `assertUnhandledVariant` left as 2.4's tripwire. `setPalette`
(Story 2.10) left open in `deferred-work.md`.

**Deferred-work items closed (4), all struck in place with the file's own convention:**

- `rebuildGridLineOverlay()` allocating on every `resize()` → structural-equality guard
  (`gridLayoutEquals`) plus a backing-store check; reuse asserted **by object identity** of the
  `drawImage` source across repaints, with a `document.createElement` spy proving zero allocation
  and a layout-changing `resize()` as the control that still rebuilds.
- The overlay cache's `drawImage` path having zero test coverage → `installRecordingContexts(canvas,
  { offscreen: true })` serves the offscreen overlay its own double, so the cached branch,
  the `gridLineOverlayLayout` identity check and the dirty-path line restoration are all now
  executed and asserted. The one-canvas `installRecordingContext2d(canvas)` is unchanged and still
  defaults to the RFC-002 Risk 4 fallback — **no Story 1.8 test changed meaning.**
- `renderStatic` retaining `lastGrid` → dropped (forced decision 4). A behavioural change to an
  Epic 1 path, so it carries its own tests.
- `applyDevicePixelSizing`'s guard being inoperative under a per-paint renderer → documented as
  requiring a retained renderer (forced decision 6), residual re-filed.

**New deferrals (§"Deferred from: Story 2-3…"):** the residual `dpr²` exposure for static tiles at a
0-width box; `drawFull`'s O(cells) baseline re-prime (→ 3.7, plus a note that Story 3.8's loop must
call `draw`, not `drawFull`); and the two redundant bar `fillRect`s per cell in the line restoration
(→ 3.7/3.9 if measured as material).

**Note for the reviewer — one test-shaping subtlety.** Two draft assertions were wrong in a way
worth flagging, because both were "the intuitive expectation is a spec violation" in miniature:
a second `draw` on a grid whose cell 0 was already painted produces **one** group, not two, because
cell 0's colour state is unchanged and correctly drops out of the dirty set. The batching control
test therefore uses a fresh renderer. If a future change makes that test pass with the old shape,
the change has broken the filter.

### File List

- `apps/web/lib/canvas/dirtyCells.ts` — **new.** Pure dirty-region decision module (AR-42):
  `CellCoord`, `DirtyCellRangeError`, `toFlatIndex`, `markDirtyCells`, `selectDirtyCells`.
- `apps/web/lib/canvas/dirtyCells.test.ts` — **new.** 19 unit tests, no canvas anywhere.
- `apps/web/lib/canvas/gridRenderer.ts` — `draw` + `markDirty` (the frozen contract's last two
  Epic-2 methods); `paintDirtyCells`/`restoreGridLinesOver`/`resetDirtyState`; `paint` vs
  `paintSurface` split so `drawFull` and `renderStatic` diverge; dirty-state reset in
  `resize`/`setGridLines`; overlay-cache reuse guard; DPR-guard documentation; no-back-buffer
  rationale.
- `apps/web/lib/canvas/gridRenderer.test.ts` — `dirtyCells.ts` added to `NO_SCHEDULING_SOURCES`;
  AC3's three contract tests extended over `draw`/`markDirty`; new suites for markDirty, draw,
  the drawFull/renderStatic divergence, and the overlay cache.
- `apps/web/lib/canvas/colourStateGroups.ts` — `EMPTY_COLOUR_STATE`, `colourStateAt`,
  `tokenIndexOfGroup`, `ageShadeOfGroup` extracted; `groupByColourState` now routes through
  `colourStateAt` so the out-of-range-ref guard has exactly one home.
- `apps/web/lib/canvas/gridLayout.ts` — `gridLayoutEquals` (structural, for the overlay cache).
- `apps/web/lib/recordingContext2d.ts` — `installRecordingContexts(canvas, { offscreen })` and
  `RecordingContext2dInstall`; `installRecordingContext2d` retained as the unchanged one-canvas
  install.
- `docs/implementation-artifacts/deferred-work.md` — 4 items closed, 3 new deferrals.
- `docs/implementation-artifacts/sprint-status.yaml` — `ready-for-dev` → `in-progress` → `review`.
- `docs/implementation-artifacts/2-3-renderer-dirty-region-editing-paths.md` — this record.

## Change Log

| Date       | Change                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| 2026-08-26 | Story created (create-story), ready-for-dev                               |
| 2026-08-26 | Implemented (dev-story): dirty-region editing paths, status -> review     |

Dev Model: opus   # architecture-shaping: no dirty-region pattern exists yet, and this story picks the dirty representation, the change-detection seam (markDirty vs renderer-side diff), the CellCoord type, and the retained-vs-per-paint renderer/retention policy — every one inherited unchanged by 2.4-2.8, 2.14, 2.15 and Epic 3's SimulationLoop; it also resolves two live RFC-002-vs-frozen-contract conflicts and three open renderer deferred items
