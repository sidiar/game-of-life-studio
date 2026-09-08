---
baseline_commit: 6d035ad934ada206476a0f474c3ee298760c4155
---

# Story 2.5: Click Placement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to click a cell to place an organism,
so that I can start populating my petri dish.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.5: Click Placement`, decomposed into the seven things a reviewer
can independently check:

1. **AC1 — Placement.** Given the edit canvas, when a cell is clicked, the selected organism
   occupies that cell, **overwriting any previous occupant** (FR-3.4).
2. **AC2 — Feedback via the dirty path.** The visible feedback lands in **< 100 ms** and goes
   through `markDirty` + `draw`, **never `drawFull`** (NFR-4.2, AR-22). One click repaints one
   cell, not the grid.
3. **AC3 — Exact mapping.** Pointer→cell mapping is exact at **both** editable presets
   ({50×30, 100×60}), including **edge and corner cells**. A pointer in the centring margin, on the
   far edge boundary, or outside the canvas maps to **no cell** and places nothing.
4. **AC4 — The single commit seam.** The click flows through `onStrokeCommit` → `onCommitGrid`
   (spec §3.3/§3.10): **exactly one commit per click**, carrying a **new** grid value. The grid
   object the canvas received as a prop is never mutated, so 2.8's snapshot ring has something to
   revert to.
5. **AC5 — Default tool.** Until the roster UI (2.9), the selected tool is **Conway's Classic**
   (`CONWAYS_CLASSIC_ID`). No roster list, no eraser toggle, no tool UI of any kind ships here.
6. **AC6 — The placed organism has a ref and a colour.** Placing an organism that is not yet in the
   battle's `organismIds` still paints in **its own colour**: the roster union owned by
   `<BattlePage>` (spec §3.1 `sessionRoster`, Decision H.2) gives it an `OrganismRef` and the
   palette LUT is built over that union. Nothing is persisted — Story 2.13 owns save, and H.1
   prunes at that point.
7. **AC7 — A redundant click is a true no-op.** Clicking a cell that already holds the selected
   organism's ref produces **no commit and no repaint**. (Not in the epic's AC text for 2.5; it is
   the direct analogue of 2.7's "erasing already-empty cells is a visual no-op and produces no
   spurious commit", and the seam is wrong without it — a no-op click would otherwise create a 2.8
   undo entry and set 2.11's `isDirty`. Flagged in *Spec additions surfaced* below rather than
   slipped in silently.)

## Tasks / Subtasks

- [x] **Task 1 — The `Tool` model and the default selection (AC5)**
  - [x] Declare `Tool` in a new `apps/web/lib/tool.ts` (camelCase, never dotted). This story ships
        **only** the organism arm: `export type Tool = { kind: 'organism'; organismId: string }`.
        Story 2.7 widens it with `{ kind: 'eraser' }` — spec §3.4 gives the full union, and
        declaring the eraser arm now would be an unverifiable claim (the same call Story 2.4 made
        for `<BattleEditorView>`'s 13-prop interface).
  - [x] Add an exhaustiveness tripwire for `kind` in the one place that dispatches on it, mirroring
        `PetriDishCanvas.tsx`'s `assertUnhandledVariant`. Its job is to **stop compiling** the
        moment 2.7 widens the union without a matching arm.
  - [x] `<BattleEditorView>` owns `selectedTool` as `useState` (spec §3.3 lists it as that
        component's ephemeral local state), seeded to
        `{ kind: 'organism', organismId: CONWAYS_CLASSIC_ID }` from `@gol/domain`. ⚠️ The file's
        current doc comment says it "instantiates no hooks … every value it needs arrives as a
        prop" — that sentence is about the grid/undo hooks §3.3 keeps in `<BattlePage>`. Correct
        the comment; do not fight it by lifting `selectedTool` to `<BattlePage>`.

- [x] **Task 2 — Pure pointer→cell mapping (AC3)**
  - [x] New `apps/web/lib/canvas/pointerToCell.ts` — **pure, no DOM reads**, the sibling of
        `gridLayout.ts` / `dirtyCells.ts` / `colourStateGroups.ts`. It takes plain numbers (the
        canvas's bounding-rect box, its backing-store size, a `GridLayout`, and client
        coordinates) and returns `CellCoord | null`. The component does the DOM reads and hands
        them in; the decision logic is a unit (AR-42).
  - [x] Convert CSS px → device px with the canvas's **own** scale — `canvas.width / rect.width`,
        never `devicePixelRatio`. `GridRenderer` holds an identity transform and computes
        `cellSize` in device px on purpose (`gridRenderer.ts` constructor comment), so the element's
        measured ratio is the only number that is guaranteed to agree with what was painted, at any
        DPR and under any CSS scaling.
  - [x] Return `null` — never a clamped coordinate — for: a pointer in the centring margin
        (`originX`/`originY` letterboxing), a pointer past `drawWidth`/`drawHeight`, and a
        degenerate rect (`rect.width === 0` or `rect.height === 0`, which would otherwise produce
        `Infinity`/`NaN` and a garbage index). Reuse `toFlatIndex`'s eager-throw philosophy at a
        different severity: this boundary is a *user pointing at nothing*, which is normal, so it
        returns `null` rather than throwing out of an event handler.
  - [x] Unit-test at **both** presets against a realistic layout: the four corner cells, the first
        and last cell of the first and last row/column, the exact boundary pixel between two cells,
        the pixel one past `drawWidth` (must be `null`, **not** `col === cols`), a margin pixel, a
        zero-width rect, and a non-integer DPR scale factor (e.g. `canvas.width = rect.width * 1.5`).

- [x] **Task 3 — `<PetriDishCanvas variant="edit">` pointer handling (AC1, AC2, AC4, AC7)**
  - [x] Widen the `edit` member of `PetriDishCanvasProps` to spec §3.10's shape:
        `{ variant: 'edit'; grid: RenderableGrid; tool: Tool; onStrokeCommit(next: RenderableGrid): void }`.
        Add the one extra prop the ref resolution needs (see Task 4's forced decision) — the same
        additive-deviation pattern, and same justification, that `colors` already carries.
  - [x] Handle **`onPointerDown`**, not `onClick`. Placement on pointer-down is what makes AC2's
        < 100 ms honest, and it is what makes Story 2.6 a pure extension of this code path rather
        than a rewrite of it. Ignore any event where `event.button !== 0` or `event.isPrimary`
        is false — a right-click or a secondary touch point must not paint.
  - [x] On a hit: build the next occupant buffer as a **copy** (`grid.occupant.slice()`), write the
        ref at the flat index, then paint it **immediately and imperatively** through the retained
        renderer — `renderer.markDirty([{ col, row }])` then `renderer.draw(nextGrid)` — before
        anything reaches React. Then call `onStrokeCommit(nextGrid)`.
  - [x] Set `paintedGridRef.current = nextGrid` **at commit time** (see trap 1). Without it the
        committed grid comes back down as a new `grid` prop identity and the existing grid effect
        `drawFull`s it — a full 6,000-cell repaint plus a full colour-state re-prime per click,
        which passes every test and fails AC2.
  - [x] AC7: if `grid.occupant[index]` already equals the tool's ref, return early — no copy, no
        `markDirty`, no `draw`, no `onStrokeCommit`.
  - [x] The `age` buffer is carried through **by reference** into the next grid. Every edit-mode
        grid is age-zero everywhere (`renderableGrid.ts`, RFC-005 "Representation note") and
        nothing in Epic 2 writes age, so copying 12 KB per click would buy nothing. Say so in a
        comment — the next reader's instinct is to `slice()` both.

- [x] **Task 4 — The commit seam through `<BattleEditorView>` (AC4, AC5, AC6)**
  - [x] Add `onCommitGrid(next: RenderableGrid): void` to `BattleEditorViewProps` (spec §3.3's
        exact name) and wire `<PetriDishCanvas>`'s `onStrokeCommit` straight to it. This is the ONE
        seam — 2.6's stroke, 2.7's erase, 2.8's undo source, 2.14's resize and 2.15's Clear all
        arrive here.
  - [x] Add `rosterIds: readonly string[]` (the union — see Task 5) to `BattleEditorViewProps`, and
        resolve `Tool` → `OrganismRef` with a pure helper: `refForTool(tool, rosterIds)` =
        `rosterIds.indexOf(organismId) + 1`, returning `null`/`0` for a miss. Unit-test it — the
        `index + 1` encoding is the one number that ties `gridState`, `OrganismRef` and the LUT
        together (RFC-006 Decision 2 / `refToFillGroup.ts` header), and an off-by-one here paints
        the wrong organism silently.
  - [x] The resolution must never produce a ref `>= palette.size` (trap 3).

- [x] **Task 5 — `<BattlePage>`: held grid state + roster union (AC1, AC4, AC6)**
  - [x] Convert the grid from a derived `useMemo` value into **held state**. The seed still comes
        from `toRenderableGrid(draft.gridState)`; the live value is what `onCommitGrid` replaces.
        ⚠️ All hooks stay **above** every early `return` (four of them) — see trap 2 for the
        seeding hazard this creates and the shape that solves it.
  - [x] Hold `sessionRoster: string[]` (spec §3.1's own name, Decision H.2) and seed it — **once,
        stably** — with the default tool's organism id when it is not already in
        `draft.organismIds`. Derive `rosterIds` = `draft.organismIds` followed by the session
        entries not already in it, **memoized** so its identity is stable (trap 4).
  - [x] Build the palette from `rosterIds` rather than from `draft.organismIds`. This splits
        `toThumbnailSource`'s two halves at this call site: `toRenderableGrid` still seeds the
        grid, and `buildRefToFillGroup(rosterIds, organismsById)` builds the LUT. Do **not** widen
        `toThumbnailSource` further to keep the two joined — the grid is now state and the palette
        is now derived from a different input, so they no longer share a lifetime.
  - [x] Memoize the palette on `rosterIds` + `organisms` identity. A palette whose identity churns
        reconstructs the `GridRenderer` on every render (trap 4).
  - [x] `onCommitGrid` is `setGrid` for this story. ❌ Do **not** build a mini undo ring — Story 2.8
        replaces this with `useUndoableGrid` (RFC-005 Decision 6, spec §4), and 2.4's forced
        decision 2 already recorded that instruction.
  - [x] ❌ Do **not** set `isDirty` here. Story 2.11 owns dirty tracking and its own AC covers
        "given any grid commit, `isDirty` becomes true".

- [x] **Task 6 — Close `deferred-work.md`'s `organismIds`-aliasing item (owned by this story)**
  - [x] `toDraft()` sets `organismIds: battle.organismIds` **by reference**, so any story that
        writes to the draft's roster mutates the `Battle` record held inside `battleResource.data`.
        This story is the first with a roster union to build. The `gridState` half of that item is
        already neutralised (`toRenderableGrid` copies into a fresh `Uint8Array` and this story
        never writes `draft.gridState[r][c]`); the `organismIds` half is live. Fix it — copy in
        `toDraft`, or make `NewBattleDraft`'s arrays `readonly` at the type level so the compiler
        catches it — and mark the entry resolved with the date.

- [x] **Task 7 — Tests**
  - [x] Pure units (AR-42): `pointerToCell.test.ts` (Task 2's list), `refForTool` mapping.
  - [x] `PetriDishCanvas.test.tsx` edit-variant additions, against a `RecordingContext2D` installed
        **before the first render** (the technique the 2.4 review added — real jsdom's first
        `getContext('2d')` returns `null`, so a mount whose construction succeeds is otherwise
        unobservable): a pointer-down on a mapped cell calls `onStrokeCommit` exactly **once**; the
        committed grid is a **different object** whose `occupant` differs at exactly one index; the
        **prop** grid's `occupant` is byte-for-byte unchanged; a redundant click commits nothing
        (AC7); a pointer-down in the margin commits nothing; a `button: 2` pointer-down commits
        nothing; and — the AC2 assertion — the click's repaint does **not** go through the
        full-repaint path (assert on the recorded call volume, e.g. the click's `fillRect` count is
        bounded and not proportional to `cols * rows`).
  - [x] `BattleEditorView.test.tsx`: `onStrokeCommit` reaches `onCommitGrid` unchanged; the default
        tool is Conway's Classic.
  - [x] `BattlePage.test.tsx`: a commit updates the rendered grid; a second commit at another cell
        keeps the first; on `/battle/new` (empty `organismIds`) the palette has a ref for Conway's
        Classic; the palette and grid-seed identities stay stable across an unrelated rerender —
        extend the existing "keeps the grid/palette identity stable (AC7)" test rather than adding
        a parallel one, since it already asserts no second `GridRenderer` construction is attempted.
  - [x] ❌ No pixel or image snapshots of the canvas, ever (project-context).

- [x] **Task 8 — E2E (AC1, AC3, AC6)**
  - [x] Extend `apps/web/e2e/battleRoute.spec.ts` with the AR-42-permitted smoke check the file
        already uses: go to `/battle/new` (empty grid → background + grid lines = 2 distinct
        colours), click a point inside the dish, assert the distinct-colour count rises **above 2**.
        This is the only test that proves the whole chain — real DPR, real layout, real
        `getBoundingClientRect`, real roster-union ref allocation — end to end.
  - [x] ⚠️ `seedWorkspace()` in that file stamps `gol:schema` so the default seed does **not** run,
        and `createMockWorkspace()` does **not** include Conway's Classic. Add `CONWAYS_CLASSIC` to
        the seeded organisms in the specs this story touches, so the test exercises the real
        colour path rather than `buildRefToFillGroup`'s dangling-id fallback (trap 6).
  - [x] Re-run the route's axe scan — the canvas gains pointer handling, and `role="img"` is
        unchanged (see forced decision 5).
  - [x] ⚠️ `e2e/` has three hand-synced copies of `buildSeedPayload`/`seedWorkspace`
        (`deferred-work.md`). If you touch more than one of them, extract the shared fixture module
        that entry asks for and mark it resolved; if you touch one, keep the copies in sync and
        leave the entry standing.

- [x] **Task 9 — Verification and record-keeping**
  - [x] Run the full local gate: `npm run ci` (typecheck → lint → format:check → coverage → build →
        bundle → e2e). ⚠️ **Do not pipe it** — `npm run ci | tail` reports *tail's* exit status and
        has already masked a real `format:check` failure once. Redirect to a file and echo `$?`.
  - [x] Paste the `/battle` and `/battle/new` gzip measurements from `bundle:check` into the Dev
        Agent Record. The battle budget is 310 KB (measured 295.2/295.1 in Story 2.4); this story
        adds a handful of KB at most. If it moves, that is Sidiar's call — do not raise a budget
        unilaterally.
  - [x] Record new deferred work: the **keyboard-placement gap** (forced decision 5) at minimum.
  - [x] Update `sprint-status.yaml`: `2-5-click-placement` → `review`.
  - [x] ⚠️ A green local run is not proof CI is green — check `gh run list` after pushing.

### Review Findings

Reviewed by Sonnet (deliberately a different model from the opus implementation), via three parallel
adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) plus independent manual
verification of the four claims flagged for extra scrutiny. All four held up under direct
inspection of the code and its tests — no bucket contains a `decision-needed` finding.

- [x] [Review][Patch] `pointerToCell` never checked `rect.left`/`rect.top` for finiteness, despite
      its own comment claiming "non-finite inputs fold into the same guard" — a NaN there
      NaN-poisons every downstream comparison (all false) and returns `{ col: NaN, row: NaN }`
      instead of `null`, which `markDirty` would throw on. [`apps/web/lib/canvas/pointerToCell.ts`]
      Fixed, with a regression test.
- [x] [Review][Patch] `e2e/battleRoute.spec.ts` added a byte-for-byte duplicate of its own new
      `distinctColorCount` helper as an inline block inside the pre-existing Story 2.4 test, in the
      same file. [`apps/web/e2e/battleRoute.spec.ts`] Fixed — the old test now calls the helper.
- [x] [Review][Patch] `BattleEditorView.test.tsx`'s "commits nothing when the roster contains no
      match" test re-declared the entire `mountEditor` mount/mock/rect-stub boilerplate instead of
      parameterizing the existing helper with a `rosterIds` override.
      [`apps/web/components/battle/BattleEditorView.test.tsx`] Fixed.
- [x] [Review][Patch] `handlePointerDown` computes the flat index from `grid.width`/`grid.height`
      while `cell.col`/`cell.row` are only vouched for against the separate `size` prop.
      `GridRenderer.assertGridMatchesSize` already throws loudly for the constructed-renderer path
      (drawFull validates on mount), but trap 12's no-2D-context path builds no renderer and calls
      no drawFull, leaving that one path with no guard against a desync landing on the wrong cell
      or past the occupant buffer. [`apps/web/components/PetriDishCanvas.tsx`] Fixed, with a
      regression test exercising the no-renderer path specifically.
- [x] [Review][Defer] `Battle.gridState`/`organismIds` (packages/domain) are still plain mutable
      arrays — the `toDraft()` readonly fix only stops a write made through a `NewBattleDraft`
      reference — deferred, pre-existing (`deferred-work.md`).
- [x] [Review][Defer] `sessionRoster` is not reset across a `battleId` change on an already-mounted
      `<BattlePage>` — unreachable today (no same-mount battle-to-battle navigation exists), owner:
      whichever story first adds one — deferred (`deferred-work.md`).
- [x] [Review][Defer] Appending the session organism to `rosterIds` has no cap check against
      `buildRefToFillGroup`'s 255-organism limit — a latent crash this story's new union-building
      introduces, owner: Story 2.9 — deferred (`deferred-work.md`).
- [x] [Review][Defer] No `touch-action`/`preventDefault()` on the paintable canvas — harmless for a
      single tap, will matter once Story 2.6 adds an actual drag gesture — deferred
      (`deferred-work.md`).

Dismissed as noise or already correctly handled: `tool` prop declared-but-unread (pre-disclosed,
forced decision 2); `refForTool`'s exhaustiveness tripwire being "unverified" until Story 2.7 (an
inherent property of the pattern, mirrors `assertUnhandledVariant`); a hypothetical malformed
`toolRef` outside `[1, 255]` (the one production caller, `refForTool`, cannot produce one — adding
runtime validation for a type-guaranteed invariant would be the same speculative-generality the
project already declines elsewhere); non-uniform X/Y DPR scaling in `pointerToCell` (the dish box
enforces the same aspect ratio as its backing store; not a reachable scenario); the keyboard-
placement gap (already recorded by the implementer with an explicit owner, Story 6.11); the e2e
seed-helper triplication (already recorded and deliberately not touched further); process/doc-
volume observations (not code defects).

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **Where the pointer→cell layout comes from.** The mapping needs `originX`/`originY`/`cellSize`,
   and `GridRenderer.layout` is private. Two options:
   *(a)* add a layout accessor to the renderer — a change to the **frozen contract**
   (`component-tree-battle-page.md#5`), which no story since Epic 1 has made; or
   *(b)* recompute it in the pointer handler with the already-exported, already-pure
   `computeGridLayout(canvas, size, showGridLines)`.
   **(b) is recommended and is the lower-risk half**: `computeGridLayout` reads `canvas.width` /
   `canvas.height` live, so it re-derives exactly what the renderer derived from the same three
   inputs, including after a `resize()`. It also keeps the contract frozen. Its cost is that the
   three inputs must genuinely match — if you pass a different `showGridLines` than the renderer
   holds, `gridLinesVisible` differs but `cellSize`/`origin` do not, so the mapping is still
   correct; that is worth a comment so nobody "fixes" it later. Whichever you take, say why.
2. **Where the tool→ref resolution lives.** `<PetriDishCanvas>` receives `tool: Tool` per spec
   §3.10, but `Tool` carries an organism **id** and the canvas paints a numeric **ref**. Either the
   canvas also receives `rosterIds` and resolves, or `<BattleEditorView>` resolves and passes the
   number. Recommended: resolve in `<BattleEditorView>` (it already owns `selectedTool` and will
   own the roster wiring in 2.9) and pass the canvas both `tool` — because §3.10 says so and 2.7's
   eraser arm needs it — and the resolved ref. Record which you chose; 2.6/2.7 inherit it.
3. **Where the `Tool` type lives.** `apps/web/lib/tool.ts` is recommended: it is needed by
   `<PetriDishCanvas>` (`components/`), `<BattleEditorView>` (`components/battle/`) and, from 2.9,
   `<OrganismRoster>`. Declaring it inside any one component makes the other two import from a
   sibling component file. Not `lib/canvas/` — a tool is an editor concept, not a rendering one.
4. **`sessionRoster` seeding shape.** The union must contain the default tool's organism **before**
   the first click, or the ref is unresolvable. Seed it once and stably (a lazy `useState`
   initializer, or a memo over `draft.organismIds`) — not as a fresh array per render (trap 4).
   Whether the seed is unconditional or conditional on `draft.organismIds` already containing
   Conway's Classic is your call; the union must not contain duplicates either way, because a
   duplicate id would produce two refs for one organism and 2.13's H.1 prune would then be
   ambiguous.
5. **Keyboard placement is not in this story, and that is an accessibility gap.** The canvas
   carries `role="img"` + `aria-label` and deliberately no `tabIndex` (Story 2.4 forced decision,
   trap 9). Adding pointer-only placement makes cell editing mouse-only — a WCAG 2.1.1 concern that
   axe cannot detect (there is no focusable control to flag). None of 2.5's ACs ask for a keyboard
   path, and inventing one here would be unreviewed UX. **Record it as deferred work** naming a
   plausible owner (Story 6.11's accessibility validation pass, or whichever story first gives the
   dish focus) rather than leaving it unstated. Do not silently drop `role="img"` either — the
   editor dish is still the page's only subject and has no textual equivalent until 2.12's stats.
6. **The cursor over the dish.** The mockup styles `.petri-dish-grid` with no `cursor` rule
   (`petri-dish-lab-mode.html:452-459`), so there is nothing to copy. A paintable surface that
   keeps the default arrow reads as inert. `cursor: crosshair` (or `cell`) is a one-line,
   reversible call — take it and say which, or take neither and say why.

### Spec conflicts and additions surfaced (do not silently pick one — this is the project rule)

- **Spec §3.10 types the edit variant's grid as `Grid`; this story passes `RenderableGrid`.**
  Unchanged from Story 2.4 and still a *not-yet*, not a divergence: the typed-array `Grid`
  (RFC-004 §3.4) arrives in Story 3.3 and satisfies `RenderableGrid` structurally. Keep the
  existing comment; do not invent a `Grid` alias.
- **Spec §3.4 gives `Tool` as a two-arm union; this story ships one arm.** The eraser is Story
  2.7's AC, verbatim ("the `Tool` model is `{ kind: 'organism'; organismId } | { kind: 'eraser' }`
  … a provisional toggle exposes the eraser until the roster section (2.9) replaces it"). Shipping
  the eraser arm here would leave an unreachable branch and pre-empt 2.7's own AC.
- **AC7 (redundant click = no commit) is an addition, not a quotation.** The epic's 2.5 AC text is
  silent on it; 2.7's is explicit for the symmetric erase case. It is included because the seam is
  wrong without it — a no-op click would create a 2.8 undo entry and flip 2.11's `isDirty`, and
  both of those stories would then have to un-pick it. Surface it in the Dev Agent Record so the
  reviewer knows it was a deliberate read-across rather than scope creep.
- **`<BattleEditorView>`'s "instantiates no hooks" note vs. §3.3's `selectedTool` state.** Both are
  from §3.3, one paragraph apart: the "no hooks" sentence is about `useUndoableGrid` living in
  `<BattlePage>`, and the State line explicitly assigns `selectedTool: Tool` to this component.
  Not a conflict — but the current file comment reads as the stronger claim, so correct it.
- If you find a *new* conflict between `docs/project-context.md` and an RFC, surface it — several
  rules there are deliberate overrides of stale RFC snippets, and new ones are signal.

### Silent-failure traps — the intuitive implementation is wrong

1. **The committed grid comes straight back down as a new `grid` prop, and `EditDish`'s grid effect
   will `drawFull` it.** `PetriDishCanvas.tsx:219-225` repaints whenever
   `paintedGridRef.current !== grid`. After a click, `onStrokeCommit` → `setGrid` → new identity →
   that effect fires → a full 6,000-cell repaint plus a full `resetDirtyState` colour-state
   re-prime, *on top of* the single-cell dirty paint that already happened. Every existing test
   still passes and the dish looks perfect. **Set `paintedGridRef.current` to the committed grid at
   commit time**, so the round trip is a no-op and AC2's "via the dirty-region path" is actually
   true. This is the single most likely defect in the story.
2. **`useState(seed)` in `<BattlePage>` captures the seed from the FIRST render, which is a render
   the draft does not exist on.** All hooks must precede the four early returns
   (`loading`, `draft === null` ×2 …), and on the first render `renderable`/`draft` are still null.
   `useState(renderable.grid)` below the guard is a conditional hook; above it, it seeds `null` and
   **never updates** when the resource settles — a permanently blank editor with no error anywhere.
   The working shape is to hold the *edit* separately from the *seed*: state initialised to `null`,
   `grid = editedGrid ?? seedGrid`, and `editedGrid` reset to `null` whenever the seed's identity
   changes (React's "adjusting state when a prop changes" pattern — a `lastSeedRef` compared during
   render, or an effect). Whichever you use, prove it with a test that resolves the resource after
   the first render.
3. **An out-of-range `OrganismRef` paints as EMPTY, silently.** `colourStateAt`
   (`colourStateGroups.ts:72-80`) returns `EMPTY_COLOUR_STATE` for any `ref >= lut.size`, with only
   a warn-once `console.warn`. So if the palette is built from `draft.organismIds` (length 0 on
   `/battle/new` → `lut.size === 1`) while the placement writes ref 1, the click *appears to do
   nothing*: no error, no throw, a passing test suite, and AC1 quietly unmet. The palette **must**
   be built from the same `rosterIds` the ref resolution indexes into. Assert it: a unit test that
   places into an initially-empty roster and checks the cell's colour state is not
   `EMPTY_COLOUR_STATE`.
4. **A churning `palette` identity reconstructs the `GridRenderer` on every render.** `EditDish`'s
   construction effect deps are `[size, palette, colors]` (`PetriDishCanvas.tsx:212`) — by design,
   since those are the constructor arguments with no setter. If `rosterIds` or the palette is
   rebuilt inline in the render body, every render throws away the renderer, the grid-line overlay
   and — critically — the **dirty baseline** that AC2 depends on, then full-repaints. Memoize both,
   and pin it with the existing "no second `GridRenderer` construction" assertion.
5. **`toDraft()` aliases the loaded `Battle`'s `organismIds`** (`deferred-work.md`, Task 6). Pushing
   the session organism onto `draft.organismIds` mutates the record inside `battleResource.data` —
   and it behaves **correctly on `/battle/new` and incorrectly on `/battle?id=…`**, which is the
   hardest possible shape for a bug to take. Build the union as a new array; do not push.
6. **Conway's Classic is absent from `createMockWorkspace()`.** `createMockOrganisms()` returns
   three fixtures and no Conway, while `battleB`'s roster *references* `CONWAYS_CLASSIC_ID` — and
   the e2e seed stamps `gol:schema` specifically so the default seed will not add it. So in an
   e2e-seeded workspace the default tool resolves to a **dangling** roster id:
   `buildRefToFillGroup` warns once and falls back to `DEFAULT_COLOR_TOKEN` (Decision I.4). The
   dish still paints, so the smoke check still passes — which is exactly why this is worth knowing
   before you spend an hour on the console warning. In production Conway's Classic is always
   present (M9: protected, re-seeded after import). Seed it explicitly in the e2e.
7. **`ctx.fillStyle = 'var(--gol-bg-primary)'` is a silent no-op.** Unchanged and still true —
   Canvas2D parses a CSS `<color>`, not a `var()` reference, and an unparseable assignment is
   *ignored*. This story adds no new colour resolution (`colors` still flows from `<BattlePage>`'s
   memoised `readGridColors`), so the trap is here only to stop anyone reaching for a token string
   when wiring a placement colour. The colour comes from the palette LUT, never from a token.
8. **`renderStatic` and `drawFull` are not interchangeable, and neither is `draw`.** `renderStatic`
   primes no colour-state baseline (`gridRenderer.ts:409`); `drawFull` primes it and repaints
   everything; `draw` needs a primed baseline and repaints only what changed. `draw` *falls back*
   to a full paint when `lastColourState === null` (`gridRenderer.ts:443-447`) rather than throwing
   — so a missing baseline degrades to "correct but slow" and no test notices. Confirm the mount's
   `drawFull` still runs before any click can arrive.
9. **`markDirty` validates and throws.** `toFlatIndex` raises `DirtyCellRangeError` for a
   non-integer or out-of-range coordinate (`dirtyCells.ts:53-62`) — deliberately, because a
   coordinate one column past the right edge would otherwise wrap onto the next row. That throw
   would land **inside a pointer event handler**. Task 2's `null` return is what keeps it
   unreachable: never hand `markDirty` a coordinate the mapper did not vouch for.
10. **Grid dimensions are parameters, never constants.** `size` flows from `draft.gridSize`, and
    the mapper takes `cols`/`rows` as arguments. A literal `100`/`60`/`50`/`30` anywhere in this
    story's production code is a bug (Decision A). Fixtures may name the presets; the code may not.
11. **Hot state stays in refs.** The in-progress buffer, the renderer and `paintedGridRef` are refs
    (project-context, RFC-005). Only the *committed* grid reaches React state — once per click
    here, once per gesture from 2.6. A `setState` inside the pointer path is the NFR-1.1/NFR-4.2
    violation this whole design exists to prevent.
12. **`getContext('2d')` returns `null` under jsdom, always.** `EditDish` already catches
    `GridRendererContextError` and leaves `rendererRef.current === null`. The pointer handler must
    tolerate that: `rendererRef.current === null` means paint nothing — but decide deliberately
    whether the **commit** still fires. (Recommended: it does. The model is not the view, and a
    canvas that cannot paint should not silently swallow the user's edit.) Say which you chose.

### Previous story intelligence

**Story 2.4 (`2-4-edit-canvas-display.md`, merged 6d035ad)** — this story is the direct
continuation; 2.4's "What NOT to build" list is, item for item, this story's scope.

- `EditDish` already retains ONE `GridRenderer` for the life of the mount and holds `paintedGridRef`
  — both exist precisely so this story has a dirty baseline and a way to suppress the round-trip
  repaint. Read `PetriDishCanvas.tsx:146-297` in full before writing a line.
- The 2.4 **review** found and fixed a double full-paint on every editor mount, and added
  `PetriDishCanvas.test.tsx`'s "full-paints exactly once on a mount whose 2D context is available
  from the start". That test is the tripwire for this story too: if your click path re-enters
  `drawFull`, extend that assertion rather than working around it.
- The technique for observing a *real-browser* mount under jsdom is `installRecordingContexts`
  installed **before the first render** (`apps/web/lib/recordingContext2d.ts`) — component-level
  tricks that force a second construction via a dependency change only ever exercise the rebuild
  path.
- Two items 2.4 deferred are still open and touch this story's surface: the dish box can overflow a
  short viewport (owner: 2.12 — **do not fix here**), and the home route's bundle headroom is 4.5 KB
  (owner: the next story to add home-route weight — this story adds none).
- 2.4's forced decision 2 recorded the instruction this story now executes: "Story 2.8 replaces
  whatever you choose with `useUndoableGrid` — so pick the smaller thing, and do **not** build a
  mini undo ring here."

**Story 2.3 (`2-3-renderer-dirty-region-editing-paths.md`)** — the renderer half of this work.
`draw` + `markDirty` and the `dirtyCells.ts` decision unit shipped there, and its own header names
this story: "Stories 2.5 and 2.6 will hand it grid coordinates straight off a pointer event".
`CellCoord` is `{ col, row }` (not `{ x, y }`) for exactly that reason.

**Story 2.2 (`2-2-create-new-battle-gallery-wiring.md`)** — `NewBattleDraft`'s doc comment names
2.5 among the stories that "read one shape instead of branching on `battleId === 'new'` forever",
and its review left the `organismIds`-aliasing item pointed here (Task 6).

### Git intelligence (last 5 commits)

`6d035ad` merge of `story/2-4-edit-canvas-display` · `81681d3` orchestration run stats ·
`d875717` 2.4 review fixes · `03bc3be` 2.4 feature commit · `2e7713f` orchestration timing.

Conventions to follow, visible in that history: `feat:`/`fix:`/`docs:` prefixes naming the story in
the subject; **review fixes land as their own commit**, never folded into the feature commit; a
spec change a story forces gets its own `docs:` commit. Story subagents may commit and push to
their own `story/*` branch without asking — **merging is always Sidiar's call**, and approval for
one merge never carries to the next. Never squash: the per-commit rationale is the record.

### Latest technical information

No new dependency, and none is warranted. Everything needed is installed and pinned: React 19.2.7,
Next 16.2.10, MUI 9.3.1 + Emotion, TypeScript 5.9.3 strict, Vitest + RTL, Playwright, axe-core.
**Version policy is caret-on-current-stable — do not bump anything opportunistically.**

- **Pointer Events, not Mouse Events.** RFC-002 Risk 5 ("Touch Input Latency") names the mitigation
  directly: *"Use pointer events API for unified handling."* `onPointerDown` is baseline in every
  browser Playwright runs here (chromium/firefox/webkit/tablet) and is what makes the touch and
  mouse paths one code path. React's `onPointerDown` is a synthetic event with the native
  `clientX`/`clientY`/`button`/`isPrimary` on it.
- **`setPointerCapture` is Story 2.6's tool, not this story's.** A single pointer-down needs no
  capture. Adding it now buys nothing and pre-empts 2.6's "pointer-up outside the canvas … without
  lost or phantom cells" AC.
- **jsdom has no layout**: `getBoundingClientRect()` returns all zeros unless stubbed. That is why
  Task 2's mapper takes the rect as plain numbers — the pure unit gets real geometry without a DOM,
  and the component test stubs the rect for the one case it needs. The end-to-end geometry claim is
  the e2e's job (Task 8), which is the only place real layout exists.
- `RenderableGrid.occupant` is `readonly Uint8Array` — `readonly` on the *property*, not the
  contents; TypeScript will not stop you mutating the buffer. The copy discipline in Task 3 is a
  convention the compiler cannot enforce, so it needs the test in Task 7 that asserts the prop
  grid is unchanged.

### What NOT to build (scope boundaries)

❌ Drag painting, `pointermove`, `setPointerCapture`, stroke coalescing (2.6)
❌ The eraser, the `{ kind: 'eraser' }` arm, a provisional eraser toggle (2.7)
❌ `useUndoableGrid`, the 30-snapshot ring, an UNDO button, any mini undo ring (2.8)
❌ `<OrganismRoster>`, the roster list, the add dropdown, the search box, the ✎ pencil, the
   same-colour warning, `duplicateColorIds` (2.9/2.10)
❌ `<BattleNameField>`, `isDirty`, dirty tracking of any kind (2.11)
❌ `<EditorStatusBar>`, living-cell stats, per-organism population counts (2.12)
❌ Save, `organismIds` pruning, any repository **write** (2.13)
❌ Grid resize, `<GridSettingsSection>`, `<ResizeClipWarningDialog>` (2.14)
❌ Clear Petri Dish (2.15)
❌ Back navigation, the unsaved-changes guard, `beforeunload` (2.16)
❌ A mode toggle, a fullscreen affordance, a `'run'` branch, `onRendererReady` (Epic 3)
❌ A zoom control (spec §9 exclusion 1 — auto-fit replaced it)
❌ A back-to-gallery link on the battle route — `BattlePage.test.tsx` and `e2e/battleRoute.spec.ts`
   assert its **absence** (2.2 forced decision 3; 2.16 restores it)
❌ Keyboard cell placement (forced decision 5 — record it, do not build it)
❌ A hover highlight / cell preview under the pointer — no AC, no mockup, and it would put a
   repaint on `pointermove` before 2.6 has decided how that path is budgeted
❌ Any `packages/*` change — this story is `apps/web` only, plus `@gol/test-utils` **usage** in
   e2e fixtures (never a change to it)
❌ A Web Worker (not in the MVP)

### Project Structure Notes

New:
- `apps/web/lib/tool.ts` (+ `.test.ts` if `refForTool` lands there)
- `apps/web/lib/canvas/pointerToCell.ts` (+ `.test.ts`)

Modified:
- `apps/web/components/PetriDishCanvas.tsx` (+ `.test.tsx`) — `edit` member widened with
  `tool`/`onStrokeCommit`, pointer-down handling, immediate dirty paint, `paintedGridRef` at commit
- `apps/web/components/battle/BattleEditorView.tsx` (+ `.test.tsx`) — `selectedTool` state,
  `onCommitGrid`/`rosterIds` props, tool→ref resolution
- `apps/web/components/battle/BattlePage.tsx` (+ `.test.tsx`) — held grid state, `sessionRoster`,
  memoised `rosterIds` + palette, `onCommitGrid`
- `apps/web/lib/newBattleDraft.ts` and/or `BattlePage.tsx#toDraft` — the aliasing fix (Task 6)
- `apps/web/e2e/battleRoute.spec.ts` — placement smoke + Conway in the seed
- `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`, this file

Conventions: PascalCase `.tsx` for components; camelCase, **never dotted**, for other TS files
(`pointerToCell.ts`, not `pointer-to-cell.ts` or `pointer.to.cell.ts`); ESM only; cross-package
imports by package name (`@gol/domain`), never a relative path; `@/*` inside `apps/web` only;
`export type` for type re-exports (`isolatedModules`); no `any`, no `@ts-ignore`, no non-null `!`;
no raw hex (AR-46 lint). Comments explain **why** and cite the governing spec ID —
`npm run spec:check` runs in `ci` and fails the build on an ID that resolves to nothing under
`docs/`, so spell IDs exactly as the specs do (`AR-22`, `M9`, `FR-3.4`, `Decision H.2`; a
hyphenated `M-9` matches nothing and is silently exempt forever).

`apps/web` has **no coverage gate** — deliberate counter-metric; the ≥90% gate flips on for
`packages/domain` + `packages/simulation` in Story 3.7. Write the tests that pin behaviour, not
tests that raise a number. Coverage-padding tests are rejected in review.

**🛑 Commit gate:** story subagents may commit and push to their own `story/*` branch without
asking. Merging is always Sidiar's call.

### References

- [Source: docs/planning-artifacts/epics.md#Story 2.5: Click Placement] — the four ACs
- [Source: docs/planning-artifacts/epics.md#Story 2.6: Drag Painting] — the next consumer of this
  story's stroke path; "the in-progress stroke lives in refs, never in React state"
- [Source: docs/planning-artifacts/epics.md#Story 2.7: Eraser] — the `Tool` union's second arm, and
  the "no spurious commit" precedent AC7 reads across from
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.10] — `<PetriDishCanvas>` "owns
  pointer→cell mapping"; the `edit` variant's `{ grid, tool, onStrokeCommit }`; hot state in refs;
  "a stroke commits once on pointer-up"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3] — `<BattleEditorView>`,
  `selectedTool` as its ephemeral state, `onCommitGrid` as "the one undoable-commit seam"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.4] — the `Tool` union
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.1] — `<BattlePage>` owns
  `initialGrid` and `sessionRoster` (Decision H.2)
- [Source: docs/planning-artifacts/component-tree-battle-page.md#4] — `useUndoableGrid` (Story 2.8,
  not this one)
- [Source: docs/planning-artifacts/component-tree-battle-page.md#5] — the frozen `GridRenderer`
  contract (`draw` / `drawFull` / `renderStatic` / `markDirty` / `resize` / `setGridLines`)
- [Source: docs/planning-artifacts/component-tree-battle-page.md#6] — the state-separation matrix:
  "grid buffers never enter React state"
- [Source: docs/planning-artifacts/architecture.md#AR-22] — dirty-region tracking, auto-fit
- [Source: docs/planning-artifacts/architecture.md#Decision A] — grid dimensions are parameters;
  editable presets are {50×30, 100×60} only (H-9)
- [Source: docs/planning-artifacts/architecture.md#Decision B.2] — batch by
  `(colorToken, min(age,7))`, never by organism
- [Source: docs/planning-artifacts/architecture.md#Decision H] — `organismIds` ≡ the placed set;
  H.2 session roster; H.1 prune-at-save
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md] — the frozen renderer
  contract; Risk 5 "use pointer events API for unified handling"; "only redraw dirty regions"
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 6] — one
  commit per gesture; the seam this story fills; snapshots hold occupant + dimensions
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md] — the dense
  `gridState` encoding: cell value = roster index + 1 = `OrganismRef`
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-3.4] — "click
  individual cells to place the selected organism"
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#NFR-4.2] — "< 100ms"
- [Source: docs/project-context.md] — hot state in refs; repositories injected never imported; grid
  dimensions never constants; the `var()`-in-`fillStyle` trap; no raw hex; the commit gate
- [Source: docs/implementation-artifacts/deferred-work.md] — the `toDraft()` `organismIds`-aliasing
  entry (owned by this story); the e2e seed-helper triplication; the 2.4 dish-overflow and
  bundle-headroom entries (**not** this story's)
- [Source: docs/implementation-artifacts/epic-2/2-4-edit-canvas-display.md] — `EditDish`'s lifecycle, the
  double-paint review finding, the `RecordingContext2D`-before-first-render technique
- [Source: apps/web/components/PetriDishCanvas.tsx#146-297] — `EditDish`: retained renderer,
  `paintedGridRef`, the grid effect, the resize observer
- [Source: apps/web/lib/canvas/gridRenderer.ts#393-462,557-597] — `drawFull` / `renderStatic` /
  `markDirty` / `draw` / `resize` / `setGridLines`
- [Source: apps/web/lib/canvas/gridLayout.ts] — `computeGridLayout`, `gridLayoutEquals`
- [Source: apps/web/lib/canvas/dirtyCells.ts] — `CellCoord`, `toFlatIndex`, `markDirtyCells`,
  `selectDirtyCells`
- [Source: apps/web/lib/canvas/colourStateGroups.ts#72-80] — `colourStateAt`'s out-of-range→EMPTY
  fold (trap 3)
- [Source: apps/web/lib/canvas/refToFillGroup.ts] — `buildRefToFillGroup`, the 255 cap, the
  dangling-id degrade
- [Source: apps/web/lib/recordingContext2d.ts] — `installRecordingContexts`
- [Source: packages/domain/src/defaultWorkspace.ts] — `CONWAYS_CLASSIC_ID`, `CONWAYS_CLASSIC`
- [Source: packages/test-utils/src/mockWorkspace.ts] — the fixtures, and the absent Conway (trap 6)
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html#443-459]
  — `.grid-container`, `.petri-dish-grid` (no `cursor` rule — forced decision 6)

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5`) — matching this story's `Dev Model: opus` line.

### Debug Log References

- `npm run ci` (full local gate: typecheck → lint → format:check → spec:check → coverage → build →
  bundle → e2e), redirected to a file with `$?` echoed — never piped (project-context's
  pipe-swallowed-exit-code trap). **Exit 0.**
  - unit: 505 web tests / 38 files; 85 domain, 82 persistence, 75 test-utils — all green.
  - e2e: **152 passed** across chromium/firefox/webkit/tablet (was 148 + the 4 new).
  - bundle (gzip): `/` **326.0 KB** / 330 (4.0 KB headroom); `/battle` **295.9 KB** / 310 (14.1 KB);
    `/battle/new` **295.9 KB** / 310 (14.1 KB). Story 2.4 measured 295.2 / 295.1, so this story adds
    **~0.7–0.8 KB** to the battle routes and ~0.5 KB to home. **No budget moved** — all three are
    within, and a budget move is Sidiar's call.
- One earlier `npm run ci` failed (exit 1) on the new e2e only: the placement smoke check asserted
  `distinctColorCount === 2` for the empty dish and the browsers all reported **3**. The exact
  baseline is not the claim (the semi-transparent grid-line colour composites, and the closing bars
  at the far edge overlap into a third blend), so the assertion became a floor plus the *rise*.
- Mutation-checked every assertion this story leans on, rather than trusting a green run:
  `Math.floor` → `Math.round` in `pointerToCell` (12 failures); deleting
  `paintedGridRef.current = nextGrid` (the AC2 round-trip test fails, alone); building the palette
  from `draft.organismIds` instead of `rosterIds` (3 BattlePage tests fail). Each was reverted.

### Completion Notes List

**Forced decisions (all six, as recorded in Dev Notes):**

1. **Pointer→cell layout — option (b), recompute with `computeGridLayout`.** `GridRenderer.layout`
   stays private and the frozen contract (`component-tree-battle-page.md#5`) is untouched.
   `computeGridLayout` is pure and reads `canvas.width`/`height` live, so it re-derives exactly what
   the renderer derived from the same three inputs, including after a `resize()`. The one input that
   could drift is `showGridLines`, and it changes only `gridLinesVisible` — never
   `cellSize`/`originX`/`originY` — so the mapping is correct either way. Both the call site and
   `pointerToCell.test.ts` say so, so nobody "fixes" it into an accessor later.
2. **Tool→ref resolution lives in `<BattleEditorView>`.** It already owns `selectedTool` and owns the
   roster wiring from 2.9; a rendering surface has no business knowing what an organism id is. The
   canvas receives **both** `tool` (§3.10's shape, load-bearing from 2.7) and the resolved
   `toolRef: number | null`. `tool` is deliberately declared-but-not-read this story — noted at the
   prop, not silently. **2.6/2.7 inherit this.**
3. **`Tool` lives in `apps/web/lib/tool.ts`** (with `refForTool` and `DEFAULT_TOOL`), as recommended
   — three components need it and none of them should import from a sibling component file.
4. **`sessionRoster` seeded unconditionally in a lazy `useState` initialiser**, with de-duplication
   in the union rather than a conditional seed. Same array either way, no duplicates (a duplicate id
   would produce two refs for one organism and make 2.13's H.1 prune ambiguous), and it does not
   depend on a `draft` that does not exist on the first render. ⚠️ **One addition beyond the story
   text:** the seed is withheld until the battle resource has *settled*. Seeding earlier called
   `buildRefToFillGroup` with a roster id and an empty library, printing Decision I.4's
   dangling-id warning on every load and on the static export's **prerender** — a false diagnostic
   about nothing. A settled-but-*failed* resource still seeds, because there the library genuinely is
   broken and the degrade-and-warn is the informative behaviour.
5. **Keyboard placement not built — recorded as deferred work** (`deferred-work.md`, owner: Story
   6.11's accessibility pass, or whichever story first gives the dish focus). `role="img"` kept; no
   `tabIndex` added, since a focusable dish that does nothing on Enter is the dead affordance
   NFR-4.1 forbids. Noted that axe cannot see this gap — both scans stay green.
6. **Cursor: `crosshair`**, styled on `<BattleEditorView>`'s edit-only `DishCanvas` wrapper (not
   inside `<PetriDishCanvas>`), so the Gallery's static tiles do not advertise interaction.

**Trap 12 (no 2D context):** the commit **still fires**; only the paint is skipped. The model is not
the view, and a canvas that cannot paint must not swallow the user's edit. `paintedGridRef` is
deliberately *not* set on that path — there is nothing painted for it to describe.

**Spec deviations / additions surfaced:**

- **AC7 (a redundant click is a true no-op) is an addition, not a quotation** from the epic's 2.5 AC
  text. Included as the direct read-across from 2.7's "erasing already-empty cells … produces no
  spurious commit": without it a no-op click creates a 2.8 undo entry and flips 2.11's `isDirty`.
  Pinned at all three levels (canvas, editor view, page).
- **`Tool` ships one arm**, not §3.4's two. The eraser is 2.7's AC verbatim; shipping it here would
  leave an unreachable branch. The exhaustiveness tripwire in `refForTool` is what makes 2.7's
  widening a **compile error** — note it destructures `kind` into a local first, because TypeScript
  does not narrow a *non-union* object type to `never` in a `default` clause, so the obvious
  `assertUnhandledToolKind(tool)` would not have compiled at all today.
- **§3.10 types the edit variant's grid as `Grid`; this story passes `RenderableGrid`.** Unchanged
  from 2.4 and still a *not-yet* (Story 3.3's typed-array `Grid` satisfies it structurally).
- **`<BattleEditorView>`'s "instantiates no hooks" doc comment corrected**, not fought: §3.3's own
  State line assigns `selectedTool` to that component, one paragraph from the "no hooks" sentence,
  which is about `useUndoableGrid` living in `<BattlePage>`.
- **No new conflict** found between `docs/project-context.md` and any RFC.

**Task 6 (deferred-work item, owned by this story):** closed by the *readonly* half rather than the
copy — `NewBattleDraft.gridState` is `readonly (readonly number[])[]` and `organismIds` is
`readonly string[]`. The compiler now rejects the write a later story would otherwise make by
instinct; a defensive copy in `toDraft` costs a 6,000-element clone per load and still leaves the
mutable type inviting it. Type-only in production code (every consumer already took `readonly`
parameters). `newBattleDraft.test.ts`'s row-aliasing check now casts past the type on purpose — the
`fill([])` trap it guards is a *runtime* bug and has to stay observable.

**Task 8 (e2e):** `CONWAYS_CLASSIC` is seeded through a **separate** `seedConwaysClassic(page)` init
script layered on top of `seedWorkspace(page)`, rather than by editing one of the three hand-synced
`buildSeedPayload`/`seedWorkspace` copies — editing one would have created exactly the silent
divergence `deferred-work.md` warns about. The three copies stay byte-identical and **that entry
still stands**; the fourth-helper cost is recorded as its own deferred item.

**Scope held:** no drag/`pointermove`/`setPointerCapture`, no eraser arm, no undo ring, no roster UI,
no `isDirty`, no status bar, no save, no resize, no Clear, no keyboard placement, no hover preview,
no `packages/*` change, no new dependency.

### File List

**New**

- `apps/web/lib/tool.ts`
- `apps/web/lib/tool.test.ts`
- `apps/web/lib/canvas/pointerToCell.ts`
- `apps/web/lib/canvas/pointerToCell.test.ts`

**Modified**

- `apps/web/components/PetriDishCanvas.tsx`
- `apps/web/components/PetriDishCanvas.test.tsx`
- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`
- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/lib/newBattleDraft.ts`
- `apps/web/lib/newBattleDraft.test.ts`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/epic-2/2-5-click-placement.md` (this file)

## Change Log

| Date       | Change                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| 2026-08-26 | Story created (create-story), ready-for-dev                                |
| 2026-08-26 | Implemented (dev-story): Tasks 1-9 complete, `npm run ci` exit 0 → review  |
| 2026-08-26 | Reviewed (code-review, Sonnet): 4 patches applied (own commit), 4 items deferred, 0 decision-needed → done |

Dev Model: opus   # establishes the pointer→cell mapping, the Tool model, the onStrokeCommit→onCommitGrid seam, grid-copy discipline and the roster-ref allocation — five patterns 2.6–2.15 all build on, none of which exist yet

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 31s | 14 | 3,012 | 8,840 | 283,438 | 295,304 |
| Step 1 — create-story | opus-5 | 1 | 9m 53s | 174 | 40,200 | 465,727 | 9,175,722 | 9,681,823 |
| Step 2 — dev-story | opus-5 | 1 | 42m 17s | 306 | 84,988 | 1,046,903 | 21,914,456 | 23,046,653 |
| Step 3 — code review + PR | sonnet-5 | 4 | 39m 06s | 702 | 50,281 | 1,654,369 | 45,977,233 | 47,682,585 |
| _of which the orchestrator_ | opus-5 | — | — | 72 | 18,265 | 37,221 | 1,787,810 | 1,843,368 |
| **Total (create-story → PR ready)** | | 6 | **1h 31m** | 1,196 | 178,481 | 3,175,839 | 77,350,849 | **80,706,365** |

Run started 2026-08-26 17:26 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
