---
baseline_commit: 2e7713f
---

# Story 2.4: Edit Canvas Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want my battle's grid displayed whole and crisp in the editor,
so that I always see the entire petri dish while designing.

## Acceptance Criteria

1. **Given** an open battle, **When** the editor renders, **Then**
   `<PetriDishCanvas variant="edit">` mounts a canvas and draws the loaded initial grid via the
   shared renderer (spec §3.10) — on **both** `/battle?id=<uuid>` and `/battle/new`
2. **And** auto-fit keeps the whole grid visible with `cellSize = floor(canvasPx / dimension)` at
   **both** editable presets, 50×30 and 100×60 (FR-3.1/3.2, Decision A.5)
3. **Given** the container resizes, **When** layout changes, **Then** the canvas re-fits
   **immediately** with a full repaint (FR-3.2) — the edit variant carries no debounce
4. **And** grid lines render per the default-on setting (FR-8.7 — `Settings.gridLines`, which
   defaults `true`)
5. **And** this story is **display-only**: no pointer handler, no tool, no commit, no undo, no
   sidebar, no status bar — and no inert placeholder standing in for any of them (NFR-4.1)
6. **And** the edit canvas holds **one** `GridRenderer` for the life of the mount and **repaints**
   through it (`drawFull` / `resize` / `setGridLines`) — it never reconstructs a renderer per
   paint the way the `static` variant deliberately does (AR-22; Story 2.3's retention policy)
7. **And** the grid the canvas is given has **one stable identity per load** — it is held state,
   not rebuilt in the render body — and the editor canvas passes axe with an accessible name

## Tasks / Subtasks

- [x] **Task 1 — Widen `PetriDishCanvasProps` with the `edit` variant** (AC: 1, 5, 6)
  - [x] Turn `PetriDishCanvasProps` into the discriminated union spec §3.10 specifies, keeping the
        shared props (`size`, `palette`, `showGridLines`, `colors`, `className`) common:
        ```ts
        type PetriDishVariantProps =
          | { variant: 'static'; grid: RenderableGrid }
          | { variant: 'edit'; grid: RenderableGrid };
        // 'playback' (3.11) joins later; `tool` + `onStrokeCommit` join the EDIT member in 2.5/2.6
        ```
  - [x] `assertUnhandledVariant` at `PetriDishCanvas.tsx:35` is this story's tripwire — it stops
        compiling the moment the union widens. Satisfy it by adding a real `'edit'` branch to the
        dispatch, **never** by casting, widening the guard's parameter, or deleting it.
  - [x] The two variants now have genuinely different lifecycles (per-paint reconstruct + 150 ms
        debounce vs. retained renderer + immediate re-fit). Keep **one exported component** in
        **one file** (spec §3.10 "the one grid surface"; `BattleTile` imports it and must not
        change its import), and have it dispatch on `variant` to two private bodies — e.g.
        `StaticDish` / `EditDish` — so each owns its own hooks. A `variant` never changes for a
        given mount (a mount is either a Gallery tile or an editor), so the remount a dispatch
        implies is unreachable; say so in a comment.
  - [x] ❌ Do **not** fold the edit lifecycle into the existing effect with `if (variant === …)`
        branches. The static path's contract is "construct, use once, drop" (1.11 forced
        decision 2); the edit path's is "construct once, retain, repaint". One effect cannot hold
        both without the deps array meaning two different things.

- [x] **Task 2 — The retained-renderer lifecycle for the `edit` variant** (AC: 1, 3, 6)
  - [x] Hold the renderer in a `useRef<GridRenderer | null>`, never in React state — it is hot,
        non-serialisable instance state (project-context "hot simulation state lives in refs").
  - [x] **Construction effect**, deps `[size, palette, colors]` — the three `GridRenderer`
        constructor arguments that have no setter. Construct, store it in the ref, clear the ref in
        the cleanup, and wrap the construction in the same `GridRendererContextError` catch the
        static path uses (see Trap 5).
  - [x] **Grid effect**, deps `[grid, rendererGeneration]` — `renderer.drawFull(grid)`. Nothing in
        2.4 changes `grid` after mount, but this is the seam 2.5/2.6 replace with `markDirty` +
        `draw`; wiring it now means those stories change one line instead of restructuring.
  - [x] ⚠️ The two effects have to compose without either double-painting on mount or leaving a
        **blank canvas after a rebuild**. Have the construction effect bump a
        `rendererGeneration` counter (`useState`) instead of drawing, and let the grid effect —
        which depends on that counter — be the single place a full paint happens. The obvious
        alternative (construction effect also calls `drawFull`) leaves an unconditional redundant
        full paint on every mount; if you take it instead, say so in a comment and in the Dev
        Agent Record. What is **not** acceptable is a construction effect that neither draws nor
        signals: `grid` is unchanged across a palette/colours rebuild, so the grid effect would not
        re-run and the dish would go blank with nothing logged.
  - [x] **Grid-lines effect**, deps `[showGridLines]` — `renderer.setGridLines(showGridLines)`.
        It is a no-op when the value is unchanged (`gridRenderer.ts:587`), so it is safe on mount.
  - [x] **`size` is handled by the construction effect in this story, not by `resize()`** — grid
        *dimension* changes are Story 2.14, and until an editable resize exists there is no
        caller. Do not pre-build a dimension-change path; do leave the comment saying 2.14 owns it.
  - [x] Effect declaration order matters: the construction effect must be declared **first**, so
        it has stored a renderer before the grid/grid-lines effects run on mount.

- [x] **Task 3 — Immediate container re-fit** (AC: 3, 6)
  - [x] `ResizeObserver` on the edit canvas, feature-detected exactly as the static path does
        (`typeof ResizeObserver === 'undefined'` → return; jsdom has none).
  - [x] Keep the static path's **unchanged-box guard** (ignore a notification whose `contentRect`
        matches the box the backing store was last rasterised for) — `observe()` fires an initial
        callback immediately and again for no-op layout reassignments, and repainting on those is
        pure waste.
  - [x] ❌ **Do not debounce.** AC3 says "immediately", and the 150 ms trailing debounce on the
        static path exists for a reason that does not hold here: ~50 tiles each allocating a
        full-size overlay per frame (deferred-work.md, 1.11). One editor canvas is one allocation,
        and a debounced editor visibly lags the window edge. State this contrast in a comment —
        it is the single most likely thing to be "fixed" back by a later reader.
  - [x] Re-fit by calling `renderer.resize(size)` **with the unchanged `size` prop** — `resize()`
        recomputes the backing store from the current CSS box, rebuilds the layout, reuses the
        overlay when the layout is unchanged, and full-repaints `lastGrid` (`gridRenderer.ts:557`).
        That is exactly "re-fits with a full repaint". ❌ Do not reconstruct the renderer here:
        reconstruction throws away the dirty baseline 2.5 depends on, and it is the one path where
        `applyDevicePixelSizing`'s anti-double-scaling guard actually works (see Trap 4).
  - [x] Disconnect the observer on cleanup.

- [x] **Task 4 — Close the `<PetriDishCanvas>` sizing-contract deferral** (AC: 3)
  - [x] deferred-work.md:113 (1.11 review) leaves the component open to a resize feedback loop:
        `paint()` writes `canvas.width`/`canvas.height` (the *intrinsic* dimensions) while the
        `ResizeObserver` watches **that same canvas**. Any caller that does not size the element in
        CSS gets intrinsic change → content-box change → observer → repaint → forever. The entry
        names Story 2.4 as the place to fix it.
  - [x] Fix: **observe the canvas's parent element** (`canvas.parentElement ?? canvas`) rather than
        the canvas. The parent's box is never written by `paint()`, so the loop is broken by
        construction rather than by a styling convention the caller has to remember. Apply it to
        both variants — `BattleTile`'s `PetriDish` div (`aspect-ratio: 5/3`) is already a
        correctly-sized parent, so the Gallery's behaviour is unchanged.
  - [x] Keep comparing against the box the backing store was rasterised for; with the parent
        observed, that is now the parent's `contentRect`.
  - [x] Update the two existing `FakeResizeObserver` tests if the observed target assertion
        changes, and mark the deferred entry resolved with the reasoning.

- [x] **Task 5 — The Lab chassis: `<BattleEditorView>` + `<EditorMain>`** (AC: 1, 2, 5)
  - [x] New `apps/web/components/battle/BattleEditorView.tsx` — the Lab-mode composition root named
        by spec §3.3 and the §2 tree. **Today it composes only `<EditorMain>`**; the sidebar
        (`<OrganismRoster>` 2.9, `<BattleNameField>` 2.11, `<GridSettingsSection>` 2.14,
        `<EditorToolsSection>` 2.15, `<SidebarFooter>` 2.16) and `<EditorStatusBar>` (2.12) are
        later stories and must **not** be stubbed — an empty rendered panel is a dead affordance.
  - [x] Props for this story: `{ grid: RenderableGrid; size: {cols; rows}; palette: RefToFillGroup;
        showGridLines: boolean; colors: GridRendererColors | null }`. Do **not** pre-declare the
        rest of §3.3's interface; unused props are unverifiable claims.
  - [x] `<EditorMain>` is a private layout child in the same file (spec §3.3: "`<EditorSidebar>` /
        `<EditorMain>` are private layout children, not shared").
  - [x] Layout, from `clinical-lab-theme/petri-dish-lab-mode.html`:
        - `.main-content` (`:434-441`) → `flex: 1; display: flex; flex-direction: column;
          background: var(--gol-bg-primary); position: relative`. ❌ Skip the mockup's
          `margin-top: 64px` — it offsets a `position: fixed` header this app deliberately does
          **not** pin (`BattleHeader.tsx:5-9`); reproducing the offset without the pin leaves a
          64 px gap under the header.
        - `.grid-container` (`:443-450`) → `flex: 1; display: flex; align-items: center;
          justify-content: center; padding: 30px`. The mockup's `padding-bottom: 80px` reserves
          the status bar — restore it in **Story 2.12**, not here; 80 px of empty reserve under
          nothing is not the mockup's picture.
        - `.petri-dish-grid` (`:452-459`) → `width: 100%; max-width: 1000px; aspect-ratio: 5/3;
          background: var(--gol-bg-primary); border: 2px solid var(--gol-border)`.
        - The canvas fills that box: `width: 100%; height: 100%; display: block` — the same
          `styled(PetriDishCanvas)` pattern `BattleTile`'s `DishCanvas` uses.
  - [x] ❌ No raw hex anywhere — the AR-46 ESLint rule is active on `apps/web`. Tokens only.
  - [x] Do not touch `app/(battle)/layout.tsx`. Its `<Main>` deliberately carries no padding
        precisely so this story's canvas measures the full box (its own comment says so).

- [x] **Task 6 — Wire the canvas into `<BattlePage>`** (AC: 1, 4, 7)
  - [x] **Collapse the two byte-identical `return` blocks into one** (deferred-work.md:189, named
        for this story). Both arms already resolve to `NewBattleDraft`; render
        `<BattleHeader> + <BattleEditorView>` once from the unified `draft`. Preserve the
        load-bearing branch **order** the 2.1 review fixed — `loading` → `'new'` → `error` →
        `battle === null` — and re-read the comments there before moving anything.
  - [x] **Hold the draft as state, one identity per load** (AC7; deferred-work.md:179, named for
        this story). Today `createNewBattleDraft(...)` runs in the render body: 61 array
        allocations per render at 100×60, with a fresh identity every time — which would make the
        canvas's `[grid]` effect repaint on every unrelated render. ⚠️ The hooks-order trap: the
        early `return`s sit **above** the point where the draft is computed, so a `useMemo`/
        `useState` cannot be dropped in where the draft is built. Every hook must be declared
        **before** the first conditional return. Resolve the draft in one hook at the top of the
        component (deriving from `resource`), or hold it with `useState` + the deps-change reset
        pattern `useAsyncResource` itself documents.
  - [x] Derive `grid` + `palette` from the draft with **one** memo, so both identities are stable:
        `toRenderableGrid(draft.gridState)` and `buildRefToFillGroup(draft.organismIds, byId)`.
        ❌ Do **not** hand-roll the dense→renderable loop or the LUT — both already exist and
        `lib/canvas/battleThumbnail.ts#toThumbnailSource` already composes them. Widen that
        function's parameter from `Battle` to `Pick<Battle, 'gridState' | 'organismIds'>` (a
        structural widening — no Gallery call site changes) so a `NewBattleDraft` satisfies it, and
        add a one-line comment naming its second consumer. Its now-narrow *name* is a rename
        candidate, not this story's job — record it as deferred work instead.
  - [x] `size` comes from `draft.gridSize` (`{cols, rows}`) — **never** a literal. A hardcoded 100
        or 60 anywhere is a bug (Decision A); 100×60 is only the default.
  - [x] `showGridLines` comes from the loaded `settings.gridLines` (FR-8.7, defaults `true`).
  - [x] `colors`: `readGridColors(document.documentElement)` in a `useMemo`, exactly as
        `BattleGallery.tsx:183-185` does (SSR-guarded with `typeof document === 'undefined'`).
        `getComputedStyle` forces a style recalculation — resolve **once** here and pass down, never
        inside the canvas.
  - [x] ⚠️ `readGridColors` returns `null` when the token layer is absent (always under jsdom).
        Render the dish **box** with no canvas inside it in that case — the same
        "unavailable → blank dish, same box" degradation `BattleTile` uses. Never substitute a
        literal colour: that is an AR-46 violation *and* silently paints the wrong theme.

- [x] **Task 7 — Fix the settings/organism coupling that this story makes visible** (AC: 2, 4)
  - [x] deferred-work.md:183, named for this story: `settings.load().catch(…)` rides the shared
        `Promise.all` in `BattlePage.tsx`, and `Promise.all` rejects on the first rejection — so a
        corrupt `gol:organisms` record discards a `Settings` that loaded **perfectly**, and
        `/battle/new` silently seeds 100×60 for a user whose default is 50×30. "Invisible today;
        visibly wrong the moment Story 2.4 draws the canvas" — that is now.
  - [x] Fix with `Promise.allSettled` (or lift settings out of the shared resource) so a settings
        value that loaded is never discarded by an unrelated record's failure. Keep the existing
        degrade-to-`DEFAULT_SETTINGS` behaviour for a settings read that genuinely failed.
  - [x] ❗ Do **not** also convert the *organisms* failure into a partially-usable page — that is
        deferred-work.md:185, explicitly assigned to **Story 2.9**, which is the first story with a
        roster to show. Fix the settings coupling only.

- [x] **Task 8 — Extend the AR-3 bundle gate to the battle route** (AC: none — deferred-work chore)
  - [x] deferred-work.md:149, named for this story: `scripts/check-bundle-size.mjs` reads
        `out/index.html` only, so `/battle` and `/battle/new` are entirely unmeasured — and this is
        the story that adds real weight to that route.
  - [x] Generalise the script over a route list (`index.html`, `battle.html`, `battle/new.html` —
        note the export emits sibling `.html` files, not directory indexes: deferred-work.md:151),
        each with its own budget. Keep the existing home budget at **330 KB** and its comment
        history intact; set the battle-route budget from the **measured** value using the same
        formula the file already applies twice: `ceil((measured + 12) / 5) * 5`. Record the
        measurement in the Dev Agent Record.
  - [x] Keep the empty-asset-set failure guard for every route — a route that scrapes zero assets
        must fail, not pass vacuously.
  - [x] `scripts/check-bundle-size.mjs` is the single authority for those numbers — do not restate
        a budget figure anywhere else (`BattleTile.tsx` already says so).

- [x] **Task 9 — Tests** (AC: all)
  - [x] `PetriDishCanvas.test.tsx`, new `edit variant` describe block:
        - mounts a canvas; calls `GridRenderer.prototype.drawFull` and **never** `renderStatic`
          (the mirror of the existing static assertion, which must keep passing unchanged)
        - **retains** the renderer: an unrelated prop change (e.g. `className`) triggers no second
          construction — spy `document.createElement`/the constructor, mirroring the existing
          "does not retain the renderer" static test, inverted
        - a `ResizeObserver` notification with a **changed** box calls `resize()` **synchronously**
          — assert with fake timers that no timer advance is needed (this is AC3's real content)
        - an **unchanged** box triggers no repaint
        - unmount disconnects the observer
        - the missing-2D-context path does not throw (real jsdom `getContext` returns `null`)
        - use `installRecordingContext2d` / `installRecordingContexts` from
          `apps/web/lib/recordingContext2d.ts` — ❌ do not hand-roll a canvas double
  - [x] `BattlePage.test.tsx`: a canvas is present on **both** `/battle?id=` and `/battle/new`;
        `showGridLines` follows `settings.gridLines`; the grid prop keeps **one identity** across an
        unrelated rerender; a corrupt organisms list does **not** change the seeded grid size
        (Task 7). Use `@gol/test-utils`'s fake repositories — ❌ never hand-roll a fake repo.
  - [x] `BattleEditorView.test.tsx`: renders the dish box and the canvas; renders the box **without**
        a canvas when `colors` is `null`; renders **no** sidebar, status bar, tool or button (AC5 —
        assert the absence, the way `BattleHeader.test.tsx` asserts the mode toggle's absence).
  - [x] `e2e/battleRoute.spec.ts`: on a seeded battle, the edit canvas paints **more than two
        distinct colours** — the same AR-42-permitted smoke check `gallery.spec.ts:163-196` uses
        (never a pixel or image snapshot: project-context, "Never pixel/snapshot-test the Canvas").
        Add an `AxeBuilder` pass over the editor route (AC7).
  - [x] Auto-fit math (AC2) is already covered by `gridLayout.test.ts` as pure units — extend it
        only if a preset case is genuinely missing. ❌ Do not re-test `computeGridLayout` through
        the DOM, and do not add coverage-padding tests (they are rejected in review).

- [x] **Task 10 — Docs & bookkeeping**
  - [x] `deferred-work.md`: mark resolved — the sizing-contract loop (`:113`), the bundle gate
        (`:149`), the render-body draft (`:179`), the settings/organism coupling (`:183`), the
        duplicated return blocks (`:189`) — each with the reasoning, in the strikethrough +
        "✅ Resolved in Story 2.4" style Story 2.3 established.
  - [x] `deferred-work.md`: **re-point, do not silently drop** — the battle-route live-region
        deferral (`:159`) says "Story 2.4 **or any accessibility pass**"; it is a design call with
        no mockup behind it (move focus to the resolved heading? one persistent region?) and is not
        this story's scope. Re-point it at **Story 6.11** (accessibility validation pass) and say
        why. Same for the "Battle Not Found" flash (`:165`) — confirm the Task 6 restructure does
        not make it worse, then leave the entry standing with a note.
  - [x] `deferred-work.md`: new entry for the `toThumbnailSource` naming mismatch (Task 6).
  - [x] `sprint-status.yaml`: `ready-for-dev` → `in-progress` → `review`.
  - [x] Fill the Dev Agent Record: forced decisions, verification commands **and their real
        output** — "tested" means the checklist ran, never that typecheck passed.

### Review Findings

Code review (Opus, second model) ran the adversarial layers (Blind Hunter, Edge Case Hunter,
Acceptance Auditor) against `git diff 2e7713f..03bc3be`, deduplicated and triaged below. All seven
ACs are met; the findings are one real defect plus four accuracy items. No `decision-needed`
finding remains, so the story moves to `done`.

- [x] [Review][Patch] **`EditDish` full-painted the same grid TWICE on every editor mount in a real
      browser** — the exact redundant mount paint Task 2's `rendererGeneration` design was chosen to
      avoid. React flushes every passive effect of a commit *before* applying a state update one of
      them queued, so the grid effect ran once for the pre-signal value (`rendererGeneration === 0`,
      renderer already stored by the construction effect declared above it) and again for the
      0 → 1 bump: two `drawFull` calls, each re-priming the whole colour-state baseline
      (`resetDirtyState`, ~6,000 cells at 100×60), plus one extra React render. Invisible to every
      existing test because real jsdom's first `getContext('2d')` returns `null`, so the mount's
      construction always fails and neither run paints — the edit-variant suite forces its genuine
      construction with a `colors`-identity rerender, which only ever exercises the rebuild path.
      Confirmed by measurement (2 calls) before fixing. **Fixed** by having the construction effect
      paint in the commit that built the renderer and adding a `paintedGridRef` the grid effect
      checks before repainting: exactly one full paint per mount, one per palette/colours rebuild,
      one per genuine `grid` change (the 2.5/2.6 seam is unchanged), and the `rendererGeneration`
      React state is gone from a hot path. Guarding the pre-signal run instead was tried and
      rejected — it removes the wasted paint but leaves the dish blank until a second commit lands.
- [x] [Review][Patch] **The mount's paint count was untestable** — added
      `PetriDishCanvas.test.tsx` "full-paints exactly once on a mount whose 2D context is available
      from the start", which installs a `RecordingContext2D` per canvas *before* the first render
      (the shape `BattlePage.test.tsx` already uses). It is the only way to observe the
      real-browser mount under jsdom, and it fails against the pre-fix implementation.
- [x] [Review][Patch] **`StaticDish`'s JSDoc pointed at a `resizeTargetOf` helper that does not
      exist** — both variants inline `canvas.parentElement ?? canvas`. Comment corrected to
      describe what is actually there.
- [x] [Review][Patch] **Task 8 asked for the home budget's comment history "intact"; two facts were
      dropped in the rewrite** — Sidiar's attribution on both budget moves, and the pointer that
      `RFC-003:48/253/309` and `epics.md:159/:371` still quote the pre-measurement `~300KB` (a
      docs-reconciliation item that is still open in deferred-work.md:131). Both restored, plus the
      "passed but did not carry the ~12 KB headroom" reason for the 320 → 330 move.
- [x] [Review][Patch] **The Dev Agent Record's "Agent Model Used" said Claude Opus 5**, contradicting
      this story's own `Dev Model: sonnet` line and the orchestration record. Corrected — the audit
      trail is the point of that field.
- [ ] [Review][Deferred] **The dish box can overflow a short viewport, and centred-flex overflow is
      unreachable by scrolling** — `<PetriDishBox>` is `width: 100%; max-width: 1000px;
      aspect-ratio: 5/3` with no `max-height`, inside a `<GridContainer>` that centres it
      (`align-items: center`). On a wide-but-short window the box is taller than the container and
      overflows equally in both directions, so the top of the dish cannot be scrolled to. Both
      editable presets are exactly 5:3 against a 5:3 box, so auto-fit itself is correct and
      letterboxing is zero — this is the *container*, not `computeGridLayout`. Left as-is because
      the story prescribed these exact rules from `petri-dish-lab-mode.html:452-459` and a fix
      (`align-items: safe center`, or a `max-height`/`aspect-ratio` pairing) is a layout design call
      with no mockup behind it. Tracked in deferred-work.md, pointed at Story 2.12, which is the
      next story to touch this box.
- [ ] [Review][Deferred] **The home route now carries 4.5 KB of headroom against its 330 KB budget**
      (325.5 KB measured on this branch), where the gate's own convention is ~12 KB and the 320 → 330
      move was triggered at 2.5 KB. Almost none of that growth is this story's — `main` already
      measures ~325 KB after Story 2.3 — and the gate is green, so nothing is changed here. Tracked
      in deferred-work.md: the next story to touch a home-route component should expect to move the
      budget, and by precedent that number is Sidiar's to set.

**Verified independently rather than trusting the Dev Agent Record:** the mount paint count was
measured, not reasoned about; the full `npm run ci` was re-run from scratch on the reviewed tree
(exit 0 — 457 web unit tests, 144 e2e across chromium/firefox/webkit/tablet, all three bundle
routes within budget); and `BattleSchema`'s `gridState`-vs-`gridSize` cross-validation was checked
to confirm `toThumbnailSource`'s two documented throw paths (`toRenderableGrid` on a ragged grid,
`buildRefToFillGroup` on a >255 roster) are unreachable from `<BattlePage>`'s uncaught `useMemo`
call — the schema rejects both at the persistence boundary, unlike `<BattleTile>`, which catches.

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **One component, two private variant bodies** (Task 1). The alternative — one effect with
   `if (variant === 'edit')` branches — makes the deps array mean two different things and puts
   the static path's "construct, use once, drop" contract one typo away from the edit path's
   "construct once, retain". The cost of the split is that changing `variant` on a live mount would
   remount; no mount ever does (a tile is a tile, an editor is an editor, and §3.11's fullscreen is
   a re-layout, never a remount).
2. **Where the draft is held** (Task 6). `useState` seeded once vs. a `useMemo` over `resource`.
   Either satisfies AC7; the constraint is that all hooks precede the early returns and that the
   identity survives an unrelated rerender. Story 2.8 replaces whatever you choose with
   `useUndoableGrid` (spec §3.1) — so pick the smaller thing, and do **not** build a mini undo
   ring here.
3. **Observing the parent instead of the canvas** (Task 4). This changes the static variant's
   observed target too. Justify it in the Gallery's terms: `PetriDish` is already a
   correctly-sized parent, so behaviour is unchanged there while the feedback loop the component's
   contract permits stops being reachable at all.
4. **The battle-route bundle budget** (Task 8) is a number set from a measurement. Paste the
   measurement.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

- **Spec §3.10 types the edit variant's grid as `Grid`; this story passes `RenderableGrid`.**
  `Grid` (the typed-array engine grid, RFC-004 §3.4) does not exist until Story 3.3.
  `RenderableGrid` (`apps/web/lib/canvas/renderableGrid.ts`) is the structural join Story 1.8 built
  for exactly this gap, and `Grid` will satisfy it structurally with zero adaptation. Not a
  divergence — a not-yet. Say so in a comment rather than inventing a `Grid` alias.
- **Spec §3.3's `<BattleEditorView>` interface is ~13 props; this story implements 5.** The rest
  arrive with the components that consume them (2.9–2.16). Declaring them now would be unverifiable
  and would force every later story to distinguish "declared" from "wired".
- **The mockup's zoom slider does not ship** — spec §9 exclusion 1: the 50–200 % zoom predates
  Decision A.5, which replaced the viewport model with whole-grid auto-fit. No zoom control, ever.
  If you find yourself wanting one, auto-fit is wrong somewhere.
- If you find a *new* conflict between `docs/project-context.md` and an RFC, surface it — several
  rules there are deliberate overrides of stale RFC snippets, and new ones are signal.

### Silent-failure traps — the intuitive implementation is wrong

1. **`ctx.fillStyle = 'var(--gol-bg-primary)'` is a silent no-op.** Canvas2D parses a CSS
   `<color>`, not a `var()` reference; an unparseable assignment is *ignored* and the previous
   `fillStyle` stays. Nothing is logged. This is why `colors` is injected as resolved strings and
   why `readGridColors` returns `null` rather than a fallback literal. It recurs on every new
   canvas — this is that story for the editor.
2. **`renderStatic` and `drawFull` are not interchangeable.** `renderStatic` primes no colour-state
   baseline and retains no `lastGrid` (`gridRenderer.ts:409`), deliberately. Calling it on the edit
   canvas passes every test in this story and leaves Story 2.5's first `draw()` with nothing to
   diff against — the bug surfaces one story later, in someone else's code.
3. **`Math.max(1, …)` in `computeGridLayout` is load-bearing**, and so is taking `Math.min` of both
   axes. Do not "simplify" the auto-fit formula toward Decision A.5's literal
   `floor(canvasPx / dimension)`: the single-axis reading clips the other dimension off-canvas the
   moment the aspect ratios disagree. (Both editable presets are exactly 5:3 and the dish box is
   `aspect-ratio: 5/3`, so letterboxing is zero **by construction** — which means a single-axis bug
   would be invisible here and visible in Play-mode expansion.)
4. **`applyDevicePixelSizing`'s anti-double-scaling guard only works on a retained renderer**
   (`gridRenderer.ts:196-217`, and deferred-work.md's 2.3 entry). The guard compares
   `canvas.width` against the *instance's* `backingWidth`. The edit canvas is one of exactly two
   surfaces where it functions — reconstructing per resize forfeits it and can land the backing
   store at `cssPx * dpr²` on any 0-width repaint.
5. **`getContext('2d')` returns `null` under jsdom, always** — and can return `null` in a real
   browser past the canvas-memory budget. A throw out of an effect unmounts the tree. Catch
   `GridRendererContextError` and leave the dish blank; rethrow everything else. From a *macrotask*
   (the observer callback) rethrowing lands as an uncaught window error with no boundary — the
   static path routes it back into React via `setPaintError(() => { throw error })`; do the same.
6. **Hooks must all precede the early returns** (Task 6). `<BattlePage>` returns early four times.
   Adding a hook below any of them is a conditional hook — React's error, not a subtle one, but the
   *fix* people reach for (moving the return) is what breaks the branch order the 2.1 review fixed.
7. **`useAsyncResource`'s deps must keep a fixed length and be referentially stable.** Its own doc
   comment spells out both failure modes (a "Too many re-renders" white-screen, and a forever-spin
   with only a dev console error). If Task 7 changes the resource shape, do not change the deps
   array's length.
8. **Grid dimensions are parameters, never constants.** `size` flows from `draft.gridSize`. A
   literal `100`/`60`/`50`/`30` anywhere in this story is a bug (Decision A).
9. **`aria-hidden="true"` is correct for the *static* tile and wrong for the editor.** The tile's
   justification (1.11 forced decision 5) is that everything the snapshot conveys is already text in
   the same tile. The editor's dish is the page's subject and has no textual equivalent until 2.12's
   stats. Give the edit canvas an accessible name (`role="img"` + an `aria-label` naming the dish
   and its dimensions) — `role="img"` is a naming role, so `aria-label` is permitted there; on a
   bare element it would be stripped and flagged by axe's `aria-prohibited-attr` (the exact rule
   `BattleTile`'s dot markup already navigates). Keyboard editing is out of scope; do not add a
   `tabIndex` that promises interaction this story does not deliver.

### Previous story intelligence

**Story 2.3 (`2-3-renderer-dirty-region-editing-paths.md`, merged 9f3d62e)** — the renderer half of
this work is *done*; this story is its first on-screen consumer.

- `draw` + `markDirty` shipped, and `drawFull`/`renderStatic` **diverged** on purpose. Read
  `gridRenderer.ts:352-445` before writing the edit path.
- 2.3's scope note names this story explicitly: "No canvas is mounted for editing here
  (`<PetriDishCanvas variant="edit">` is **Story 2.4**) … The `assertUnhandledVariant` guard in
  `PetriDishCanvas.tsx:35` is 2.4's tripwire, not yours." It is now yours.
- 2.3 resolved the overlay-cache allocation item and the `applyDevicePixelSizing` guard item **by
  making retention real**. Both resolutions assume the edit canvas retains a renderer. Not
  retaining one silently re-opens two closed deferred items.
- `installRecordingContexts(canvas, { offscreen: true })` now gives the offscreen overlay a real
  recording double — that is the tool for asserting the `drawImage` cache branch.
- ⚠️ `2-3-*.md` still reads `Status: review` while `sprint-status.yaml` says `done`. Cosmetic drift
  from the merge; do not "fix" it as part of this story.

**Story 2.2 (`2-2-create-new-battle-gallery-wiring.md`)** — left five review items pointed at this
story; Tasks 6, 7 and 8 are those items. `NewBattleDraft`'s own doc comment names Story 2.4 as the
first consumer of the unified shape.

**Story 1.11 (`epic-1/1-11-battle-tile-thumbnails.md`)** — the reference implementation for
everything except retention. Its forced decisions 2 (per-paint renderer), 4 (injected colour
strings) and 5 (`aria-hidden`) are each **deliberately inverted or kept** here; know which is which
before copying a line.

### Git intelligence (last 5 commits)

`2e7713f` (orchestration timing) · `9f3d62e` merge of `story/2-3-*` · `61c26c4` retired canvas
double buffering from the specs · `17e92d9` 2.3 review fixes · `1fcb919` 2.3 feature commit.

Conventions visible in that history and to follow: `feat:`/`fix:`/`docs:` prefixes with the story
named in the subject; review fixes land as their own commit rather than being folded into the
feature commit; a spec change that a story forces is its own `docs:` commit. Story subagents may
commit and push to their own `story/*` branch without asking — **merging is always Sidiar's call**,
and approval for one merge never carries to the next.

### Latest technical information

No new dependency, and none is warranted. Everything this story needs is installed and pinned:
React 19.2.7, Next 16.2.10, MUI 9.3.1 + Emotion, TypeScript 5.9.3 strict, Vitest + RTL, Playwright,
axe-core. **Version policy is caret-on-current-stable — do not bump anything opportunistically.**

`ResizeObserver` is a platform API (baseline in every browser Playwright runs here) and is **absent
in jsdom** — feature-detect, exactly as the static path already does. `aspect-ratio` is likewise
baseline. `GridRenderer` deliberately declines `desynchronized: true` for multi-canvas surfaces
(`gridRenderer.ts:101-107`); the editor is a single interactive canvas, so it *could* opt in — but
that is Epic 3's documented call for the playback canvas, not a free win to take here.

### What NOT to build (scope boundaries)

❌ Pointer handling, `pointerdown`/`move`/`up`, pointer→cell mapping (2.5/2.6)
❌ `Tool`, tool selection, the eraser (2.5/2.7/2.9)
❌ `onStrokeCommit`, `onCommitGrid`, any commit seam (2.5)
❌ `useUndoableGrid`, the 30-snapshot ring, an UNDO button (2.8)
❌ The editor sidebar, any of its five sections, or an empty panel standing in for them (2.9–2.16)
❌ `<EditorStatusBar>`, stats, SAVE (2.12/2.13)
❌ Grid resize, `<GridSettingsSection>`, `<ResizeClipWarningDialog>` (2.14)
❌ A mode toggle, a fullscreen affordance, a `'run'` branch, `onRendererReady` (Epic 3)
❌ A zoom control (spec §9 exclusion 1 — auto-fit replaced it)
❌ A back-to-gallery link on the battle route (2.2 forced decision 3 deliberately removed it, and
   `BattlePage.test.tsx` + `e2e/battleRoute.spec.ts` assert its **absence**; 2.16 restores it)
❌ A Web Worker (not in the MVP)
❌ Any `packages/*` change — this story is `apps/web` wiring plus one repo script

### Project Structure Notes

New:
- `apps/web/components/battle/BattleEditorView.tsx` (+ `.test.tsx`)

Modified:
- `apps/web/components/PetriDishCanvas.tsx` (+ `.test.tsx`) — union widened, edit lifecycle,
  observed target
- `apps/web/components/battle/BattlePage.tsx` (+ `.test.tsx`) — held draft, single return, canvas
  wiring, `Promise.allSettled`
- `apps/web/lib/canvas/battleThumbnail.ts` — parameter widened structurally
- `scripts/check-bundle-size.mjs` — route list
- `apps/web/e2e/battleRoute.spec.ts` — paint smoke + axe
- `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`, this file

Conventions: PascalCase `.tsx` for components; camelCase, **never dotted**, for other TS files;
ESM only; cross-package imports by package name; `@/*` inside `apps/web` only; `export type` for
type re-exports (`isolatedModules`); comments explain **why** and cite the governing spec ID
(`npm run spec:check` fails the build on an ID that resolves to nothing under `docs/`, and
`AR-2`/`M9`/`FR-8.7` must be spelled exactly as the specs spell them).

**Verification** — `npm run ci` is the local mirror of the CI gate (typecheck → lint →
format:check → coverage → build → bundle → e2e). ⚠️ Do not pipe it: `npm run ci | tail` reports
*tail's* exit status and has already masked a real failure once. Redirect to a file and echo `$?`.
⚠️ A green local run is not proof CI is green — check `gh run list` after pushing.

`apps/web` has **no coverage gate** (deliberate counter-metric; the gate flips on for
`packages/domain` + `packages/simulation` in Story 3.7). Write the tests that pin behaviour, not
tests that raise a number.

### References

- [Source: docs/planning-artifacts/epics.md#Story 2.4: Edit Canvas Display] — the four ACs
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.10] — `<PetriDishCanvas>`
  responsibility, the three-variant union, `size`/`palette`/`showGridLines` props, the auto-fit note
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3] — `<BattleEditorView>`,
  `<EditorMain>` as private layout children, "instantiates no hooks"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.1] — `<BattlePage>` owns
  `initialGrid`; "no rendering logic"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#2] — the component tree and Epic
  assignment; "no dead buttons — NFR-4.1"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#9] — exclusion 1 (no zoom control)
- [Source: docs/planning-artifacts/architecture.md#Decision A.5] — auto-fit;
  `cellSize = floor(canvasPx / dimension)`; replaces FR-3.2's viewport presets
- [Source: docs/planning-artifacts/architecture.md#Decision A / H-9] — editable grids are
  {50×30, 100×60} only; dimensions are parameters, never constants
- [Source: docs/planning-artifacts/architecture.md#AR-22] — dirty regions / auto-fit renderer
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md] — the frozen renderer
  contract, Risk 4 (cached grid-line overlay), "only redraw dirty regions"
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md] — hot state in
  refs; Decision 6 (one commit per gesture — the seam 2.5 fills)
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html#434-459]
  — `.main-content`, `.grid-container`, `.petri-dish-grid`
- [Source: docs/project-context.md] — the `var()`-in-`fillStyle` trap, no DOM types in
  `packages/*`, no raw hex (AR-46), hot state in refs, the commit gate
- [Source: docs/implementation-artifacts/deferred-work.md#113,149,159,165,179,183,189] — the six
  entries pointed at this story
- [Source: apps/web/lib/canvas/gridRenderer.ts#352-445,557-597] — `drawFull`/`renderStatic`/`draw`,
  `resize`, `setGridLines`
- [Source: apps/web/lib/canvas/gridLayout.ts] — `computeGridLayout`, `gridLayoutEquals`
- [Source: apps/web/components/gallery/BattleTile.tsx] — the `PetriDish`/`DishCanvas` box pattern
- [Source: apps/web/components/gallery/BattleGallery.tsx#183-185] — memoised `readGridColors`

## Dev Agent Record

### Agent Model Used

Claude Sonnet, via the `bmad-dev-story` workflow — matching this story's own `Dev Model: sonnet`
assignment below and the `implement-next-story` orchestration's record. (Corrected in review
2026-08-26: this line originally read "Claude Opus 5", which is the model that reviewed the
story, not the one that implemented it.)

### Debug Log References

Verification commands run, with their real outcomes (not just typecheck):

- `npx tsc --noEmit` (root `apps/web`) — clean, no errors.
- `npm run lint` — 0 errors, 1 warning (`BattleGallery.tsx:248`, pre-existing, unrelated to this
  story).
- `npm run format:check` — clean after `prettier --write` on the three new/changed test files and
  `PetriDishCanvas.tsx`.
- `npm run spec:check` — clean (every cited `AC`/`AR`/`Decision`/`FR` id resolves under `docs/`).
- `cd apps/web && npx vitest run` — **456/456 tests passed**, 36 test files (includes the 18 new
  edit-variant `PetriDishCanvas.test.tsx` tests, 3 new `BattleEditorView.test.tsx` tests, and 5 new
  `BattlePage.test.tsx` tests).
- `npm run build:standalone -w apps/web` — succeeds; emits `index.html`, `battle.html`,
  `battle/new.html` as documented in deferred-work.md:151.
- `node scripts/check-bundle-size.mjs` — all three routes within budget:
  - home (`/`): 325.5 KB gzip / 330 KB budget (4.5 KB headroom)
  - battle (`/battle`): 295.2 KB gzip / 310 KB budget (14.8 KB headroom)
  - battle/new (`/battle/new`): 295.1 KB gzip / 310 KB budget (14.9 KB headroom)
  - Battle-route budget derivation (Task 8, forced decision 4): `ceil((295.2 + 12) / 5) * 5 = 310`,
    the same formula the home budget's two prior moves used, from the higher of the two measured
    battle-route pages.
- `cd apps/web && npx playwright test --project=chromium` — **36/36 passed** (1 skipped, a
  pre-existing touch-pointer test gated to non-chromium projects).
- `cd apps/web && npx playwright test e2e/battleRoute.spec.ts --project=firefox --project=webkit`
  — **16/16 passed** (both browsers).
- `npm run ci` (root, redirected to a file, exit code checked explicitly per project-context's
  pipe-swallowed-exit-code warning) — **exit 0**: typecheck → lint → format:check → spec:check →
  test:coverage (all 4 packages + `apps/web`, 456 web tests) → build:standalone → bundle:check →
  e2e (**144/144 passed** across chromium/firefox/webkit/tablet).

### Completion Notes List

- **Forced decision 1 (one component, two private variant bodies):** taken as specified.
  `PetriDishCanvas.tsx` now dispatches on `variant` to `StaticDish`/`EditDish`, each with its own
  effects. The construction effect deliberately signals via a `rendererGeneration` counter rather
  than calling `drawFull` itself — the alternative named in Task 2 (construction effect also
  paints) was NOT taken, since it would double-paint on every mount.
- **Forced decision 2 (where the draft is held):** `useMemo`, not `useState`. Two memos
  (`newDraft`/`loadedDraft`), combined into one `draft` value read by a single render — chosen
  over one `useState` + reset because the two source values (`settings`, `battleResource.data`)
  already come from two independent `useAsyncResource` calls with their own stable identities, so
  a memo needed no extra reset-on-deps-change machinery. Both hooks are declared before every
  early `return`, preserving the Story 2.1 branch-order fix.
- **Forced decision 3 (observing the parent instead of the canvas):** taken for BOTH variants
  (Task 4 applies to the static path too, not just the new edit path). `BattleTile`'s `PetriDish`
  div is already a correctly-sized parent, so the Gallery's own tests and e2e checks were
  unaffected — confirmed by the full existing Gallery/BattleTile suite staying green unmodified.
- **Forced decision 4 (battle-route bundle budget):** 310 KB, from a real measurement (295.2 KB /
  295.1 KB gzip for `/battle` and `/battle/new` respectively) using the same
  `ceil((measured + 12) / 5) * 5` formula the home budget's two prior moves used. Pasted above in
  Debug Log References.
- **Task 7 approach:** took the "lift settings out of the shared resource" option explicitly named
  in the Dev Notes, over `Promise.allSettled`. A second, fully independent `useAsyncResource` call
  for `settings.load()` (with its own `.catch(() => DEFAULT_SETTINGS)`) makes an organisms-list
  failure structurally unable to discard a settings value that already resolved, without
  reshaping `LoadedResource`'s error semantics for `battles`/`organisms`. Both resources are
  gated together at the `loading` check so `/battle/new` never briefly flashes the
  `DEFAULT_SETTINGS` grid size before correcting to the real default.
- **Spec conflict acknowledged, not silently resolved:** `toThumbnailSource`'s parameter was
  widened from `Battle` to `Pick<Battle, 'gridState' | 'organismIds'>` (structural, zero change at
  the existing `BattleTile` call site) rather than duplicating the dense→renderable conversion for
  `NewBattleDraft`. The resulting name/signature mismatch is filed as new deferred work, not
  silently left implicit.
- **BattlePage's composition root** gained a `Root` styled flex-column wrapper (mockup's
  `.app-container`, minus the sidebar row this story has no content for) so `<BattleEditorView>`'s
  `flex: 1` has an actual flex-column ancestor to fill against — `<BattleHeader>` is not
  `position: fixed` here, so the mockup's `margin-top` offset trick does not apply.
- **Test technique for canvas-painting assertions in `BattlePage.test.tsx`:** real (unmocked)
  jsdom's `getContext('2d')` always returns `null`, so proving `showGridLines` actually reaches
  the paint required giving EVERY canvas (main + `GridRenderer`'s offscreen grid-line overlay) its
  own `RecordingContext2D`, keyed by identity, installed BEFORE the first render — rather than the
  component-level "force a second construction via a real dependency change" trick
  `PetriDishCanvas.test.tsx` uses (not available at the page level, since `size`/`palette`/`colors`
  are all intentionally kept stable there). `SKIRMISH` (50×30) was reused rather than a new
  fixture, since jsdom's default 300×150 canvas box already clears `MIN_GRID_LINE_CELL_SIZE` at
  that grid size.
- All ten tasks complete; no HALT conditions were hit; no new dependency was added (per the Dev
  Notes' "Latest technical information").

### File List

New:
- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`

Modified:
- `apps/web/components/PetriDishCanvas.tsx` — discriminated union widened with `edit`; dispatches
  to private `StaticDish`/`EditDish`; both variants now observe the canvas's parent element
- `apps/web/components/PetriDishCanvas.test.tsx` — new "edit variant" describe block (18 tests)
- `apps/web/components/battle/BattlePage.tsx` — held draft (`useMemo`), single unified render,
  settings lifted into its own `useAsyncResource`, canvas wiring via `<BattleEditorView>`
- `apps/web/components/battle/BattlePage.test.tsx` — 5 new tests (canvas presence on both routes,
  grid-lines threading, grid/palette identity stability, Task 7's grid-size regression)
- `apps/web/lib/canvas/battleThumbnail.ts` — `toThumbnailSource`'s parameter widened structurally
  to `Pick<Battle, 'gridState' | 'organismIds'>`
- `scripts/check-bundle-size.mjs` — generalised from one hardcoded home-route read to a route list
  (`home`, `battle`, `battle/new`), each with its own budget
- `apps/web/e2e/battleRoute.spec.ts` — new AR-42 paint-smoke test for the edit canvas
- `docs/implementation-artifacts/deferred-work.md` — five items resolved (`:113`, `:149`, `:179`,
  `:183`, `:189`), two re-pointed/confirmed (`:159` → Story 6.11, `:165` confirmed unaffected), one
  new entry (the `toThumbnailSource` naming mismatch)
- `docs/implementation-artifacts/sprint-status.yaml` — `2-4-edit-canvas-display`:
  `ready-for-dev` → `review`
- `docs/implementation-artifacts/2-4-edit-canvas-display.md` — this file

## Change Log

| Date       | Change                                                                |
| ---------- | ---------------------------------------------------------------------- |
| 2026-08-26 | Story created (create-story), ready-for-dev                          |
| 2026-08-26 | Implemented (dev-story): edit canvas display, retained-renderer lifecycle, immediate re-fit, resize-loop fix, BattleEditorView, BattlePage wiring + settings decoupling, battle-route bundle gate. Status → review |
| 2026-08-26 | Code review (Opus, second model): fixed the double full paint on every editor mount, added the mount-paint regression test, restored the home budget's comment history, corrected the Dev Agent Record's model attribution; two items deferred. Status → done |

Dev Model: sonnet   # follows patterns that already exist — 2.3 froze the renderer's retention/dirty policy, 1.11 shipped the PetriDishCanvas lifecycle and the injected-colours seam, spec §3.3/§3.10 fix the component APIs, and §3.1 already assigns initialGrid ownership (2.8's useUndoableGrid replaces whatever is held here); the remaining work is wiring plus five named deferred-work fixes, each with its trap and test spelled out above

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 34s | 24 | 3,007 | 12,787 | 479,141 | 494,959 |
| Step 1 — create-story | opus-5 | 1 | 9m 01s | 188 | 21,136 | 462,500 | 8,982,924 | 9,466,748 |
| Step 2 — dev-story | sonnet-5 | 1 | 30m 20s | 522 | 59,958 | 584,286 | 55,974,159 | 56,618,925 |
| Step 3 — code review + PR | opus-5 | 1 | 27m 45s | 304 | 55,724 | 633,402 | 19,943,090 | 20,632,520 |
| _of which the orchestrator_ | opus-5 | — | — | 72 | 16,673 | 37,462 | 1,648,869 | 1,703,076 |
| **Total (create-story → PR ready)** | | 3 | **1h 07m** | 1,038 | 139,825 | 1,692,975 | 85,379,314 | **87,213,152** |

Run started 2026-08-26 16:00 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
