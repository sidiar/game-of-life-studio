---
baseline_commit: 6b1659a39d31a8d4ed02b8f2088e2440c718aa53
---
# Story 3.11: Mode Toggle & Run View Skeleton

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to flip my battle between Lab and Run,
so that I can design and then watch life unfold.

## Acceptance Criteria

From `epics.md#Story 3.11`, decomposed into what a reviewer can check independently. Everything
below the view already exists and is gated: `useSimulation` (3.10) owns the run; `drawDiff` (3.9)
is the repaint; `GridRenderer` (1.8/2.3) is the surface; `<BattlePage>` (2.1–2.16) owns `mode`,
the grid, the undo ring and the dirty flag. What does **not** exist is the seam between them: a
`mode` that can be `'run'`, a header control that flips it, the Run chassis that mounts the hook,
and the canvas variant that hands the hook a renderer. This story is the first consumer of the
hook and the first route import of the engine — AC8 is where that fact meets the bundle gate.

1. **The header renders the Lab⇄Run toggle for the first time (FR-3.10, spec §3.2, NFR-4.1).**
   `<BattleHeader>` renders two real `<button type="button">`s labelled `Lab` and `Run` (CSS
   uppercases them — accessible names stay sentence case, `<SidebarFooter>` trap 15) inside a
   `role="group"` named "Mode", each carrying `aria-pressed` for its own mode. The toggle renders
   **only when `mode` and `onModeToggle` are both supplied** — the props are still optional
   (§3.2), and the count-based "zero controls" test from Story 2.1 flips to "exactly two buttons,
   zero links" once they are. Pressing the already-active button fires nothing; pressing the other
   calls `onModeToggle(next)` once. `onEnterFullscreen` stays unrendered (Story 3.18).

2. **`<BattlePage>` owns `mode: 'lab' | 'run'` and the switch is state, never navigation (AR-28,
   RFC-005 Decision 3, Decision K).** `useState<'lab'>` widens to `useState<'lab' | 'run'>('lab')`;
   `data-mode` on `<Root>` reflects it in both states; the URL does not change; `<BattleHeader>`
   stays mounted across the flip (the same `<h1>` element before and after — one `<h1>` on the
   route, as `BattlePage.test.tsx` already counts). The toggle is **disabled while `isSaving`**
   (the visible half of the edit lock every other control on this route wears) and **while the
   roster cannot run** (AC7).

3. **Lab → Run mounts `<BattleSimulationView>`, which is the only component that touches
   `useSimulation` (spec §3.11, RFC-005 Decision 5).** New file
   `apps/web/components/battle/simulation/BattleSimulationView.tsx`. It calls
   `useSimulation(initialGrid, organisms, { genPerSec: startingSpeed })` exactly once, with
   **stable references** (3.10 consumer obligation 1 — `initialGrid` is the undo hook's `grid`
   value from `<BattlePage>`; `organisms` is a `useMemo` in `<BattlePage>`, AC7), and renders the
   Run chassis: `<SimulationSidebar>` + `<SimulationMain>`. It starts **paused at cycle 0** —
   observable as `data-status="paused"` and `data-cycle="0"` on the view's root element, rendered
   in every state (Story 2.11 forced decision 3's `data-dirty` precedent: an absent attribute and
   a wrong one are indistinguishable to a test with the wrong selector). `<BattleEditorView>` is
   **unmounted** while `mode === 'run'` — not hidden, not `display: none`.

4. **The `'playback'` variant joins `<PetriDishCanvas>` (spec §3.10, Story 3.10 AC9).** Union
   member `{ variant: 'playback'; onRendererReady(renderer: GridRenderer | null): void }`; the
   `assertUnhandledVariant` guard gets its third dispatch arm. The new `PlaybackDish` is a
   **retained-renderer** lifecycle like `EditDish` (construct once per `[size, palette, colors]`,
   `setGridLines` effect, parent-observing `ResizeObserver` calling `renderer.resize(size)`), with
   three differences: it **paints nothing itself** — no `drawFull` in the construction effect, no
   grid prop, no pointer handlers — it calls `onRendererReady(renderer)` right after construction
   and `onRendererReady(null)` in the cleanup (the hook primes with `drawFull` on attach or when
   its session lands — either order, 3.10 Trap 1), and it is `role="img"` with the aria-label
   "Petri dish, C by R cells" like the edit dish (the running dish IS the page's subject). A
   missing 2D context (`GridRendererContextError`) leaves the dish blank and calls
   `onRendererReady` with nothing — the view runs headless, which is what every jsdom test relies
   on.

5. **The playback canvas is painted at cycle 0 (FR-3.10 "the playback canvas painted").** With a
   real 2D context, entering Run produces exactly one `drawFull` of a grid byte-equal to
   `initialGrid` through the playback renderer (the hook's `paintFull`: `resize` then `drawFull`,
   3.10 review) — asserted in `PetriDishCanvas.test.tsx` with a fake `onRendererReady` and in the
   e2e with the existing `distinctColorCount` helper (> 2 colours on the Run dish, same threshold
   as the edit dish's smoke check). The palette is the **same `RefToFillGroup`** `<BattlePage>`
   already builds over `rosterIds` (trap: a LUT built over a different array than the one the
   engine was compiled from is `ref` chaos — M14).

6. **Run → Lab halts, discards and shows the unchanged initial state (FR-4.8, AR-31, RFC-005
   Decision 4).** Flipping back unmounts `<BattleSimulationView>`; the hook's unmount cleanup
   stops the loop, detaches the renderer and drops the session (3.10 AC10 — no new code here).
   `<BattleEditorView>` remounts over the **same `grid` object** it had before (identity-asserted
   through a props-recording mock, the `BattlePage.commitSeam.test.tsx` shape) and its edit canvas
   full-paints that grid. Nothing this story adds writes to `initialGrid`.

7. **A roster that cannot run cannot enter Run (Decision H, Decision I.4, NFR-4.1).** The hook
   needs one domain `Organism` per roster slot (3.10 obligation 2). `<BattlePage>` derives
   `runOrganisms: readonly Organism[] | null` — `rosterIds` mapped through the library, `null` if
   ANY id has no record (`libraryUnavailable`, a dangling id, the pre-seed empty-library window).
   When null the Run button is `disabled` with a `title` explaining why ("Some organisms in this
   battle could not be loaded"), not hidden. This is the ONLY roster the view receives — never
   `roster` (`DisplayOrganism[]`, de-duplicated, not indexable by ref — Story 2.9 trap 2) and never
   a synthesised placeholder organism.

8. **The engine does not enter `/battle`'s first-load bundle (AR-35, 3.10 Trap 9, deferred-work →
   3.11).** `<BattleSimulationView>` is reached through `next/dynamic(() => import(...), { ssr:
   false })` from `<BattlePage>`, the shape `<UnsavedChangesDialog>` and `<ResizeClipWarningDialog>`
   already use on this route. `bundle:check` passes **with `check-bundle-size.mjs` unchanged** —
   the gate measures scripts referenced from the route's HTML, and a dynamic chunk is not one. The
   Dev Agent Record reports `/battle`'s measured first-load number, the headroom, and the size of
   the run-view chunk (`npm run analyze -w web`, or the `out/_next/static/chunks` file the import
   resolves to). If the number moves by more than the toggle's own weight, say why.

9. **Everything owned by `<BattlePage>` survives the round trip (RFC-005 Decision 3, FR-3.8,
   FR-7.9).** A Lab → Run → Lab cycle leaves `canUndo`, `isDirty`, `battleName`, `sessionRoster`,
   `saveStamp` and the selected roster exactly as they were — `<BattlePage>` never unmounts and
   none of its state cells key on `mode`. Tested: paint a cell, toggle twice, UNDO is enabled and
   `data-dirty="true"`. The Run sidebar's `<SidebarFooter>` fires the same `handleBack`, so the
   FR-7.9 dirty guard works from Run mode — the dialog's "Save" writes `initialGrid`, which is
   the correct grid (A-2).

10. **The Run chassis is a skeleton, not a stand-in (NFR-4.1).** `<SimulationSidebar>` renders
    `<SidebarFooter>` only — no Population Analysis (3.14), no Cycle Count (3.14), no Speed (3.13),
    no Grid Size (3.16). `<SimulationMain>` renders the dish box with the playback canvas and
    nothing else — no transport bar (3.12), no hotkey hints (3.19). No fullscreen button in the
    header (3.18). The dish box carries the play-mode mockup's `2px solid var(--gol-accent)` border
    ("the cyan active-simulation border"), which is the one Run-vs-Lab visual this story ships
    besides the toggle. Zero `<h2>`s in the Run sidebar this story: the route's heading structure
    is `<h1>` alone in Run mode (3.14 adds the first section headings).

11. **Both modes pass axe and keep the console clean (AR-3).** The e2e runs `AxeBuilder` on the
    route in Run mode and again after returning to Lab; every new e2e asserts `errors` empty. The
    toggle's active state colours are token-only (AR-46): `--gol-accent` on `--gol-accent-tint`
    for an active RUN (play-mode mockup), `--gol-text-primary` on `--gol-bg-hover` for an active
    LAB (lab-mode mockup) — see FD3. No `transition` on any new control (the axe mid-fade trap
    `<EditorStatusBar>` and `<SidebarFooter>` both record).

12. **Gates hold.** `npm run ci` exits 0: no `packages/*` change (coverage floors untouched);
    `spec:check` resolves every ID cited here and in code; `bundle:check` per AC8; `bench:check`
    unchanged (nothing on the benchmarked path). `deferred-work.md` entries that name this story
    are closed or reassigned with a reason (Task 9).

## Tasks / Subtasks

- [x] **Task 1 — `<BattleHeader>` toggle** (AC1, AC2, AC11; FD2, FD3)
  - [x] `apps/web/components/battle/BattleHeader.tsx`: add `disabled?: boolean` and
    `disabledReason?: string` to `BattleHeaderProps` (the reason lands as `title` on the RUN button
    only — LAB is always reachable from Run). Render `<Actions>` (mockup `.header-actions`, `gap:
    15px`) → `<ModeToggle role="group" aria-label="Mode">` (mockup `.mode-toggle`: `display: flex`,
    `1px solid var(--gol-border)`, `background: var(--gol-bg-secondary)`) → two
    `<ModeButton type="button" aria-pressed={mode === own}>`. Mockup `.mode-btn` verbatim minus
    `transition` and `position: relative`: transparent, no border, `--gol-text-secondary`, `8px
    20px`, 11px/600/uppercase/0.5px, `font-family: inherit`; first child gets `border-right: 1px
    solid var(--gol-border)`. Hover (`:not([aria-pressed="true"]):not(:disabled)`): `--gol-bg-hover`
    + `--gol-text-primary`. Focus: the route's `2px solid var(--gol-accent)` / `outlineOffset:
    2px` ring. Disabled: the pre-validated trio (`--gol-action-disabled-bg` / `--gol-border` /
    `--gol-action-disabled`, `cursor: not-allowed`).
  - [x] Active styling per FD3: `&[aria-pressed="true"]` → `--gol-bg-hover` + `--gol-text-primary`
    (lab mockup); the RUN button additionally `&[aria-pressed="true"]` → `--gol-accent-tint` +
    `--gol-accent` (play mockup, `themes.css` L120 — the token Story 4.2 authored for exactly this
    `rgba(0, 212, 255, 0.1)`). Two styled components or one with a `data-mode-value` selector —
    either is fine; no `sx`, no MUI `ToggleButtonGroup` (FD2).
  - [x] Handler: `onClick={() => next !== mode && onModeToggle?.(next)}` — the active button is a
    no-op, never a re-set. Render the group only when `mode !== undefined && onModeToggle !==
    undefined` (both optional in §3.2; Epic 2's tests supplied them and expected nothing — that
    expectation is what changes, not the optionality).
  - [x] `BattleHeader.test.tsx`: rewrite the count test to "renders exactly two buttons and no
    links when `mode` + `onModeToggle` are supplied; zero controls when they are not"; add: the
    active button has `aria-pressed="true"` and the other `"false"`; clicking the inactive one
    calls `onModeToggle` once with the other mode; clicking the active one calls nothing;
    `disabled` disables RUN (and `title` carries `disabledReason`) but never LAB; the group is
    `role="group"` named "Mode"; `axe` on both `mode` values (vitest-axe, the pattern
    `BattlePage.test.tsx` uses).

- [x] **Task 2 — `<BattlePage>`: `mode`, `runOrganisms`, the lazy view** (AC2, AC3, AC7, AC8,
  AC9; FD1, FD4)
  - [x] `const [mode, setMode] = useState<'lab' | 'run'>('lab')`. Rewrite the AR-28 comment above
    it: it no longer says "the setter arrives in Epic 3". `handleModeToggle = useCallback((next)
    => { if (savingRef.current) return; setMode(next); }, [])` — the same ref-based lock
    `handleNameChange` uses, for the same reason (a click dispatched in the tick a save starts).
  - [x] `runOrganisms` (FD4): `useMemo(() => { const byId = new Map(organisms.map(...)); const
    list = rosterIds.map((id) => byId.get(id)); return list.every(isDefined) ? list : null; },
    [rosterIds, organisms])`. Same deps as `palette` — same identity lifetime, which is what the
    hook's session key needs (3.10 FD2: a new `organisms` reference is a new run). Comment: why
    `null` and not a fallback organism; why `rosterIds` and not `draft.organismIds` (the session
    roster is part of the encoding — Story 2.10 trap 8); why `roster` is unusable (de-duplicated).
    `runDisabledReason = runOrganisms === null ? '…' : undefined`; pass `disabled={isSaving ||
    runOrganisms === null}` and the reason to `<BattleHeader>`.
  - [x] `const BattleSimulationView = dynamic(() => import('./simulation/BattleSimulationView'), {
    ssr: false, loading: RunLoading })` beside the `UnsavedChangesDialog` declaration, with a doc
    comment in that declaration's shape: the engine's weight, the 3.8 KB headroom
    (`deferred-work.md` → 3.11), AR-35's "dynamic import for heavy components", the ratchet rule
    (mechanism over threshold), and why `loading` is set here when the dialogs chose none (FD1:
    this chunk replaces the whole chassis, not a closed dialog). `RunLoading` renders the same
    `role="status"` / `aria-live="polite"` `<Body>` as `BattleLoading` with "Loading simulation…".
  - [x] Render: `<BattleHeader battleTitle mode={mode} onModeToggle={handleModeToggle} disabled
    disabledReason />`; `{mode === 'lab' ? <BattleEditorView … /> : <BattleSimulationView
    initialGrid={grid} organisms={runOrganisms} startingSpeed={settings.defaultSpeed}
    showGridLines={settings.gridLines} palette={palette} colors={colors} onBack={handleBack}
    backDisabled={isSaving} />}` — `runOrganisms` is non-null in the `'run'` branch by AC7 (the
    toggle refuses otherwise); narrow it with a guard that renders nothing rather than a `!`.
    `grid !== null` stays the outer guard for both branches.
  - [x] Keep `data-mode={mode}` and update its comment ("Epic 3's Run mode has a switch to flip"
    → it flipped). Keep the `useDirtyGuard`, `useLeaveGuard`, `useDocumentTitle` calls untouched —
    none of them read `mode`, and that is the point (AC9).

- [x] **Task 3 — `<BattleSimulationView>` + the chassis** (AC3, AC5, AC6, AC10; FD5, FD7)
  - [x] New `apps/web/components/battle/simulation/BattleSimulationView.tsx` (`'use client'`).
    Props (`BattleSimulationViewProps`, exported): `initialGrid: RenderableGrid`, `organisms:
    readonly Organism[]`, `startingSpeed: GenPerSec`, `showGridLines: boolean`, `palette:
    RefToFillGroup`, `colors: GridRendererColors | null`, `onBack(): void`, `backDisabled?:
    boolean`. Not `onExitToLab`, not `cellAnimation` (FD5). Head comment: §3.11's responsibility
    line ("the only component that touches the hook"), the three consumer obligations it
    discharges (stable refs — by construction, they are props from `<BattlePage>` memos; roster
    order — `runOrganisms` is built over `rosterIds`; unmount to leave — `<BattlePage>`'s branch),
    and what is deliberately absent (3.12–3.19 by name).
  - [x] `const sim = useSimulation(initialGrid, organisms, { genPerSec: startingSpeed })`. Do NOT
    memoise the options object into the hook's key — `opts.seed`/`opts.scheduler` are `undefined`
    and `genPerSec` is read once (3.10 obligation 6); a fresh `opts` literal per render is fine and
    the 3.10 tests pass one.
  - [x] Layout, private to this file (spec §3.3's "`<EditorSidebar>` / `<EditorMain>` are private
    layout children" applies symmetrically): `SimulationLayout` / `SimulationSidebar` /
    `SidebarContent` (rendered EMPTY this story — it is the `flex: 1` scroll region whose presence
    is what pins the footer at the same place as the Lab sidebar's; 3.13/3.14/3.16 drop sections
    into its `gap`) / `SimulationMain` / `GridContainer` / `PetriDishBox` / `DishCanvas`.
    Copy `<BattleEditorView>`'s values (`EditorLayout` `flex: 1; display: flex; minHeight: 0`;
    sidebar `320px` — NOT the play mockup's 350px, the two sidebars must not jump width on toggle
    and §3.2/§3.9 treat them as one column; `MainContent` `minWidth: 0; minHeight: 0`;
    `GridContainer` `minHeight: 0` — the AC6 line from Story 2.12's review; `PetriDishBox`
    `width: 100%; minWidth: 0; maxWidth: 1000px; maxHeight: 100%; aspectRatio: 5 / 3`). ⚠️ Every
    `⚠️`/`❌` comment on those styled blocks names a regression that was actually shipped and
    reverted (the `width: auto` ResizeObserver loop, the missing `minHeight: 0`); carry a one-line
    pointer to `BattleEditorView.tsx` rather than the paragraphs, and do NOT "simplify" the
    values. Dish border: `2px solid var(--gol-accent)` (AC10). `DishCanvas = styled(PetriDishCanvas)`
    `width/height: 100%; display: block` — no `cursor: crosshair`, no `touchAction` (nothing to
    paint).
  - [x] Root element `<SimulationLayout data-status={sim.status} data-cycle={sim.cycle}>` (AC3).
    `{colors !== null && <DishCanvas variant="playback" size={sim.liveSize} palette={palette}
    showGridLines={showGridLines} colors={colors} onRendererReady={sim.attachRenderer} />}` —
    `sim.liveSize`, not `initialGrid`'s dims, so 3.16's ephemeral resize rebuilds the canvas at
    the live size for free (the hook's head comment plans on exactly that rebuild); identical
    today. `attachRenderer` is `useCallback`-stable (3.10 Task 4), so it can be passed straight
    through without a wrapper — and a wrapper would defeat that stability.
  - [x] Sidebar: `<SimulationSidebar>` → `<SidebarContent />` (or nothing, per above) →
    `<SidebarFooter onBack={onBack} disabled={backDisabled} />` as the LAST child, sibling of the
    content region (the pin — `SidebarFooter.tsx`'s own comment). This is the second caller
    `simulation/README.md` promised.
  - [x] Update `apps/web/components/battle/simulation/README.md`'s "What goes here" only if a
    name here differs from its list (`<SimulationSidebar>`, `<SimulationMain>` are private layout
    children in this file, not exported components — say so in one sentence). Do not restate the
    design there (its own rule).

- [x] **Task 4 — `PetriDishCanvas` playback variant** (AC4, AC5; FD6)
  - [x] `apps/web/components/PetriDishCanvas.tsx`: add `| { variant: 'playback';
    onRendererReady(renderer: GridRenderer | null): void }` to the union; replace the two-line
    3.10 trailer with the member's own doc comment (what it is, why `null` — mirrors
    `attachRenderer`'s signature so the prop is a pass-through, not an adapter; why no `grid` —
    the hook owns the front buffer and the canvas never sees it; why no pointer handlers — Run mode
    does not edit). Add `case 'playback': return <PlaybackDish {...props} />`. The `never` guard
    then compiles again — that is what it was for.
  - [x] `PlaybackDish` (private, `type PlaybackDishProps = PetriDishCanvasSharedProps & {
    onRendererReady(...) }`): `canvasRef`; `rendererRef` (for the grid-lines and resize effects);
    `[, setPaintError]` for the observer's macrotask path (both siblings do this). Construction
    effect deps `[size, palette, colors]` (EditDish's — see FD6): `new GridRenderer(canvas, size,
    palette, { colors, showGridLines })`, store, `onRendererReady(renderer)`; on
    `GridRendererContextError` store null and do not call `onRendererReady` at all (the hook then
    has no renderer — headless, its documented state); cleanup: `onRendererReady(null)`,
    `rendererRef.current = null`. ⚠️ `onRendererReady` is read in the effect but is NOT a dep and
    must not be: a new prop identity would tear down and rebuild the renderer, and `attachRenderer`
    is stable anyway — hold it in a ref refreshed by an effect declared FIRST (the `endStrokeRef`
    shape, `PetriDishCanvas.tsx` Story 2.8 Task 5), and call through the ref in the cleanup so a
    cleanup that outlives its render still detaches through the CURRENT callback. Same
    `eslint-disable-next-line react-hooks/exhaustive-deps` + the paragraph explaining `showGridLines`
    (setter-served) as `EditDish` carries.
  - [x] Grid-lines effect: `rendererRef.current?.setGridLines(showGridLines)` on `[showGridLines]`.
    Resize effect on `[size]`: parent-observing `ResizeObserver`, `renderer.resize(size)` in a
    try/catch routed through `setPaintError` — EditDish's minus the stroke terminate. ⚠️ Playback
    `resize()` repaints `lastGrid`, which after a swap is the buffer the engine writes into next
    (`gridRenderer.ts` `lastGrid` comment); JS is single-threaded, so the observer callback never
    interleaves a step, and the worst case is one frame of the previous cycle, corrected by the
    next `drawDiff` (which re-primes off `lastColourState`). Say this in one comment; it is the
    only place the "paused-only reader" assumption in `gridRenderer.ts` is stretched, and 3.16/3.18
    inherit it.
  - [x] `<canvas ref role="img" aria-label={`Petri dish, ${cols} by ${rows} cells`} className>`
    — no pointer props, no `tabIndex`.
  - [x] `PetriDishCanvas.test.tsx`, new `describe('PetriDishCanvas (playback variant)')`, the
    edit-variant harness (per-canvas `RecordingContext2D` install BEFORE render for the mount
    case; `FakeResizeObserver` from the edit block): mounts `role="img"` with the name; calls
    `onRendererReady` once with a `GridRenderer` after mount and once with `null` on unmount;
    **never** calls `drawFull`/`renderStatic`/`draw` itself (spies on the prototype: zero calls
    from the canvas — the caller is what paints; prove it by calling `drawFull` from the test's
    own `onRendererReady` and asserting the recording context painted); a `size` change rebuilds
    (`null` then a new renderer); a `showGridLines` change calls `setGridLines` on the SAME
    instance without a rebuild; a parent resize calls `resize(size)` on the same instance; with
    real jsdom's null context: no `onRendererReady` call, no throw, canvas still present; a NEW
    `onRendererReady` identity on a size-stable rerender neither rebuilds nor re-calls, and the
    unmount detaches through the NEW callback (mutation-check: drop the ref and call the prop
    directly in cleanup → this test reddens).

- [x] **Task 5 — `<BattlePage>` mode tests** (AC2, AC3, AC6, AC7, AC9)
  - [x] `BattlePage.test.tsx`, new `describe('BattlePage — Lab⇄Run mode toggle (Story 3.11)')`,
    real children: toggle → `await screen.findByRole('group', { name: 'Mode' })`, click Run →
    `[data-mode="run"]`, `await` the view root (`[data-status="paused"]`, `[data-cycle="0"]` — it
    is behind `next/dynamic`, so `findBy*`/`waitFor`, the `UnsavedChangesDialog` precedent), no
    editor sections (`queryAllByRole('heading', { level: 2 })` is empty), still exactly ONE `<h1>`,
    the Back button still present; click Lab → sections back, `[data-mode="lab"]`. Round-trip
    state: `enableCanvasRendering` + `installPerCanvasRecording`, place a cell (the `findEditorCanvas`
    + click path Story 2.5's tests use), toggle twice, assert UNDO enabled and `data-dirty="true"`
    and the name field still holds a typed edit. Edit lock: mock a `battles.save` that never
    resolves, press SAVE, the Run button is `disabled`. Unresolved roster: `createFakeRepositories`
    with `organisms: []` for Three-Way Skirmish → Run `disabled` with the `title`; `organisms`
    rejecting (the AC7 degraded path) → same. `axe` in Run mode (`enableCanvasRendering` off is
    fine — the box renders without a canvas).
  - [x] New `BattlePage.modeToggle.test.tsx` — the `commitSeam` shape, because `vi.mock` is
    file-hoisted: mock BOTH `./editor/BattleEditorView` and `./simulation/BattleSimulationView`
    with props recorders (`vi.mock` intercepts the dynamic `import()` too). Assert: the view
    receives `initialGrid === ` the editor's last `grid`; `organisms` is an array of the mock
    workspace's three `Organism` records in `rosterIds` order (ids equal
    `SKIRMISH.organismIds`); `organisms` identity is stable across an unrelated re-render (a name
    edit — the AC7 memo's whole point; a fresh array per render restarts the run silently, 3.10
    FD2); after Run → Lab the editor's `grid` is the SAME object as before and `canUndo` equals
    its previous value. `startingSpeed` equals the seeded settings' `defaultSpeed` (seed a
    non-default `settings` through `createFakeRepositories` to make the assertion mean something).

- [x] **Task 6 — `<BattleSimulationView>` tests** (AC3, AC5, AC10)
  - [x] `BattleSimulationView.test.tsx` beside it: renders `data-status="paused"` /
    `data-cycle="0"`; renders `<SidebarFooter>`'s button and forwards `onBack`; renders no
    `<h2>`, no transport buttons, no slider (count the buttons: exactly one — Back); with `colors
    === null` no canvas, the dish box present; with `enableCanvasRendering` + a recording context
    the canvas is present with the accessible name and was full-painted once (the hook's prime —
    `RecordingContext2D` `fillRect` count > 0 or a `drawFull` prototype spy `toHaveBeenCalledTimes
    (1)`); unmount does not throw and cancels the frame (spy `window.requestAnimationFrame` /
    `cancelAnimationFrame` — the hook defaults to `rafScheduler`; jsdom implements RAF as a
    ~16 ms timer, so either assert zero `requestAnimationFrame` calls while paused — `play()` is
    never called in this story — or inject nothing and assert on `cancelAnimationFrame` not being
    needed). Prefer the first: **paused at cycle 0 means RAF is never requested** — a strong, cheap
    invariant for the skeleton. `axe` clean.
  - [x] A roster-order test through the real hook: two organisms, a grid with ref 2 placed, the
    view's `data-cycle` stays 0 and nothing throws — `compileSession` running on
    `createMockOrganisms()` is already pinned by `compileEvaluators.test.ts`; here it is the wiring
    that is under test, not the compile.

- [x] **Task 7 — e2e** (AC1, AC5, AC6, AC9, AC11)
  - [x] `apps/web/e2e/battleRoute.spec.ts`, new `test.describe('Lab⇄Run mode toggle (Story
    3.11)')` on Three-Way Skirmish (all three roster organisms exist in the seeded library; Grand
    Colony War carries the dangling Conway id in an e2e-seeded workspace — `seedConway` or avoid
    it). (a) The toggle is present, `Lab` pressed; click `Run` → `[data-mode="run"]`, the Run dish
    `role="img"` attached, `distinctColorCount` > 2, no `h2`, `main` count 1, `h1` count 1, URL
    unchanged; click `Lab` → the editor's four sections are back. `errors` empty. (b) Undo + dirty
    survive: click the dish in Lab, toggle Run and back, UNDO enabled, `[data-dirty="true"]`, the
    dish still shows > 2 colours. (c) Axe: zero violations in Run mode and after returning to Lab.
    (d) Back from Run on a dirty battle opens the Unsaved Changes dialog (one assertion — the guard
    is 2.16's; what is new is the second sidebar reaching it). (e) The dangling-roster case:
    Grand Colony War WITHOUT `seedConway` → Run button `disabled`. Reuse `seedWorkspace`,
    `distinctColorCount`; add nothing to `@gol/test-utils`.

- [x] **Task 8 — Header/route conformance sweep** (AC1, AC10)
  - [x] Two count tests in `BattlePage.test.tsx` are written to FAIL when this story lands, by
    design, and must be converted the way 2.13/2.15/2.16 converted their predecessors (each
    conversion is commented in place): (a) "renders no Run, fullscreen, or any other button beyond
    the roster, UNDO, SAVE, CLEAR and BACK on the loaded route" (~L508) — `queryByRole('button',
    { name: /run/i })` becomes a presence assertion, the count becomes `organisms.length + 7`
    (LAB + RUN), and the comment's "a NINTH button … still fails here" is rewritten for the
    ELEVENTH (fullscreen, Epic 4's pencil); (b) the `/battle/new` "exactly the roster row, the
    eraser, UNDO, SAVE, CLEAR, BACK, and one heading" test (~L361): `toHaveLength(6)` → 8. Keep
    the h1-count lines; `e2e` heading-order assertions (four `<h2>`s in Lab) still hold;
    `AppShell`/`AppNav` untouched (`(battle)` has no nav — AR-28).
  - [x] Grep for `useState<'lab'>` and "Epic 3" comments in `BattlePage.tsx`/`BattleHeader.tsx`
    and update every sentence that is now false (the "renders nothing for them" comment on
    `BattleHeaderProps`, the "no Run or fullscreen affordance" line in the `mode` comment —
    fullscreen is still true, the toggle half is not; `<SidebarFooter>`'s "❌ NO run-mode prop …
    Epic 3 mounts this same component in the Run sidebar" — it now does, with no prop added).
  - [x] `useLeaveGuard`'s focus-restore resolves `[data-back-to-battles]` by a bare document query
    (2.16 review entry: "confirm there that the two footers cannot coexist"). They cannot — `mode`
    is exclusive state and each branch renders one sidebar — so the Run sidebar's footer IS the
    restore target after a Run-mode Back → dialog → Cancel. Assert it once in Task 5 (dialog
    cancelled in Run mode → focus on the Back button) and close the entry (Task 9).

- [x] **Task 9 — Bookkeeping** (AC8, AC12)
  - [x] `deferred-work.md`: (1) the 3-10 "Story 3.11 will pull the whole engine into `/battle`"
    entry → close with the mechanism taken (FD1) and the measured numbers; (2) the Story 2.6 entry
    "Pointer capture … Pick this up in Story 3.11 (the playback canvas) or 6.11" → this story's
    e2e extends the PLAYBACK dish's coverage, not the edit dish's drag path; reassign to 6.11 with
    that reason (or close it if the dev writes the release-outside-the-canvas drag — one test, the
    entry spells it out — say which); (3) the Story 2.7 entry "`tool` remains a declared-but-unread
    prop … Pick this up in Epic 3, whose playback variant is the next one to touch this union" →
    per FD9; (4) the 4-1 review entry on the missing `error.tsx` (scoped to `(gallery)` there) →
    per FD8, add the `(battle)` Run-mode sentence; (5) the two 2.16 entries that name "Epic 3's
    Run-mode Back": the bare `[data-back-to-battles]` query → close (Task 8: the footers cannot
    coexist, asserted); the "Save & Leave REFUSED closes silently" entry → this story keeps
    `disabled={isSaving}` on the Run footer (forced decision 3a reaffirmed), so it stays
    unreachable — say so, leave it open; (6) new "Deferred from: Story 3-11" section:
    `component-tree` §3.11 amendment candidates (`onExitToLab` unused, `cellAnimation` not
    threaded, `palette`/`colors`/`onBack` additive — FD5), the §3.10 playback member's nullable
    `onRendererReady`, and anything below that the dev decides to leave.
  - [x] `npm run ci > /tmp/ci-3-11.log 2>&1; echo $?` — never pipe to `tail`. Record the exit
    code, `/battle` first-load gzip + headroom (AC8), the run-view chunk size, `bench:check`
    (unchanged), the unit/e2e counts, in the Dev Agent Record.

### Review Findings

Code review 2026-09-14 on **Fable** against the **Opus** implementation (`c0b02d7`), three
parallel adversarial layers (Blind Hunter / Edge Case Hunter / Acceptance Auditor). 0
decision-needed, 8 patch, 3 defer, 15 dismissed.

- [x] [Review][Patch] `PlaybackDish` is keyed on the `size` object's identity, and `useSimulation.stop()` mints a fresh `liveSize` at unchanged dimensions — every Stop in 3.12 would detach, rebuild and re-prime the renderer [apps/web/components/PetriDishCanvas.tsx:PlaybackDish] — construction and observer effects now key on `cols` / `rows`; new test "a NEW `size` object with the SAME dimensions neither rebuilds nor re-calls" (mutation-checked: identity deps redden it)
- [x] [Review][Patch] `onRendererReadyRef` comment overclaims: React runs every cleanup of a commit before any setup, so a commit changing both size and callback detaches through the PREVIOUS callback [apps/web/components/PetriDishCanvas.tsx:onRendererReadyRef] — comment now states the actual guarantee and why it suffices (`attachRenderer` is stable)
- [x] [Review][Patch] StrictMode test was vacuous about the thing it names — "one canvas, cycle 0" holds even if the hook ends up detached after the replay [apps/web/components/battle/simulation/BattleSimulationView.test.tsx] — asserts two `drawFull` primes and a painted surviving canvas
- [x] [Review][Patch] AC5 "byte-equal to `initialGrid`" compared `occupant` only [BattleSimulationView.test.tsx] — `age`, `width`, `height` compared too
- [x] [Review][Patch] "renders the dish box" test never located the box [BattleSimulationView.test.tsx] — renamed to what it pins (no canvas, paused at 0, footer present)
- [x] [Review][Patch] Task 7(e) e2e did not assert a clean console (AC11 "every new e2e asserts `errors` empty"); `collectErrors` pushed an error-level "ResizeObserver loop" message twice [apps/web/e2e/battleRoute.spec.ts] — `collectErrors` added to the AC7 test, the double push collapsed
- [x] [Review][Patch] Failing-library test asserted `title` presence, not text [apps/web/components/battle/BattlePage.test.tsx] — asserts the reason string
- [x] [Review][Patch] Comment drift: `:first-child` in prose vs `:first-of-type` in code [BattleHeader.tsx]; FD1 comment attributed 3.9 KB to the 3-10 deferred-work entry, which says 3.8 [BattlePage.tsx]; Dev Agent Record counted 12 toggle tests / 41 new unit tests (10 new + 1 rewritten / 39 new) — all three corrected
- [x] [Review][Defer] `mode === 'run' && runOrganisms === null` renders a header over nothing and never flips back [BattlePage.tsx:Run branch] — deferred: unreachable today (the library resource has fixed deps and `rosterIds` only changes in the unmounted editor); owned by the first story that changes the library while `<BattlePage>` is mounted (4.24/4.25, gated on `epic-3`)
- [x] [Review][Defer] The disabled RUN's reason lives only in `title`, which a keyboard user cannot reach on an unfocusable `disabled` button [BattleHeader.tsx] — deferred, pre-existing pattern: every `disabled={isSaving}` control on the route explains nothing at all, so this is the route's a11y policy, not this story's; Story 6.11
- [x] [Review][Defer] A rejected `import()` of the Run chunk (offline, rotated hashes after a deploy) has no boundary nearer than `GlobalError`, and the editor is already unmounted [BattlePage.tsx:dynamic()] — deferred into the 4-1 `error.tsx` entry FD8 already extended (a second throw path with the same owner)

## Dev Notes

### Constraints the developer MUST follow

- **Scope: the toggle, the `'run'` branch, the view skeleton, the playback variant, tests, docs.**
  No transport (3.12), no speed (3.13), no counter/stats (3.14), no extinction check (3.15 — it is
  the hook's), no resize control (3.16), no gallery Run action (3.17), no fullscreen (3.18), no
  hotkeys (3.19). Nothing in `packages/*`. No change to `useSimulation`, `GridRenderer`,
  `check-bundle-size.mjs`.
- **Hot state stays in the hook (RFC-005 Decision 5, AR-29).** The view reads `sim.status`,
  `sim.cycle`, `sim.liveSize` and passes `sim.attachRenderer` down; it never touches a buffer,
  never calls `play`. A `useState` holding anything from the engine is the failure NFR-1.1 names.
- **Repositories are injected, never imported (AR-2, AR-27).** The view receives `organisms` as
  domain records from `<BattlePage>`; it never sees `repositories`.
- **`components/battle/` is split by mode (`simulation/README.md`).** `<BattleSimulationView>`
  and its private layout children go in `simulation/`; nothing in `simulation/` imports from
  `editor/`. `<SidebarFooter>` and `<SidebarSection>` are root — shared. `<PetriDishCanvas>` is
  `components/` root already.
- **Never read or write a ref during render** (`react-hooks/refs` is an error inside `use*` and
  components); `react-hooks/set-state-in-effect` and `exhaustive-deps` are live. `EditDish`'s
  `endStrokeRef` shape is the sanctioned way to hold a latest-callback for a long-lived cleanup.
- **`apps/web` rules:** strict TS, no `any`/`!`/`@ts-ignore`; `export type` for types; camelCase
  filenames; `@gol/*` by package name; `@gol/test-utils` only from tests; no raw colour literals
  (AR-46 — `--gol-accent-tint` exists for the mockup's `rgba(0, 212, 255, 0.1)`); `styled()` for
  static chrome, no `sx` (RFC-003 Decision 3). No `transition` on any new control.
- **Comments explain WHY and cite by ID.** `spec:check` reads this file and the code: `AR-28`,
  `FR-3.10`, `FR-4.8`, `Decision K`, `M14`, `Story 3.10` exactly; `AR28`, `FR3.10`, `M-14` are
  silently exempt forever.
- **Commit gate.** The story subagent commits to its own `story/3-11-…` branch; merging is
  Sidiar's. Lane 4 is open in another worktree — its `sprint-status.yaml` diffs must not ride
  into this branch (3.8's review reverted exactly that).

### What this story is, in one paragraph

Story 2.1 shipped `<BattlePage>` with `mode` declared and only `'lab'` populated, and deliberately
rendered no toggle — a rendered-but-inert control being the one thing NFR-4.1 forbids. Nine
stories later the run side exists in full below the component layer: a hook that owns the live
grid, a loop that owns time, a repaint that owns the diff. This story is the seam: it flips the
`useState` to two values, gives the header the control the mockup always had, adds the branch that
mounts the Run chassis, and adds the canvas variant that hands the hook its renderer. Three things
are genuinely decided here rather than composed: how the engine reaches the route without
breaking the bundle gate (FD1), what "cannot run" means for a roster with a hole in it (FD4), and
what the Run chassis looks like before any of its controls exist (FD7). Everything else — the
layout values, the retained-renderer lifecycle, the props-recording test shape, the dynamic-import
shape — is a pattern this route already settled, applied to a second surface.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — How the engine reaches `/battle` without breaking `bundle:check`.**
- **(a) `next/dynamic` the whole `<BattleSimulationView>`** *(recommended)*. `check-bundle-size.mjs`
  measures the scripts the route's HTML references; a dynamic chunk is fetched on the first Run
  toggle and never appears there. The engine (`compileSession`, `threePhaseStep`,
  `createSimulationLoop`, `derivePopulation`) rides in the view's chunk together with the view.
  This is the shape the route already uses twice (`UnsavedChangesDialog`, `ResizeClipWarningDialog`)
  and `/organisms` once (`OrganismEditorModal`), AR-35's "dynamic import for heavy components",
  and Sidiar's ratchet rule (change the mechanism, not the threshold). Cost: one chunk fetch on
  the first toggle — a `loading` fallback covers the gap (see below); the chunk is cached
  thereafter. Note `BattleEditorView` already imports `clearGrid`/`resizeGrid` from
  `@gol/simulation` statically, so the package's grid primitives are on the route regardless —
  what moves is the engine proper.
- **(b) Static import + raise the 310 KB budget.** Honest and simple; needs Sidiar's explicit
  approval for a threshold move the ratchet rule exists to avoid, and adds the engine to a page
  most visits never run.
- **(c) `React.lazy` + `<Suspense>`.** Measured 1.1 KB cheaper than (a) in Story 2.14 and rejected
  there for the convention; same call here.
- **`loading` fallback:** *(recommended: yes, a `role="status"` "Loading simulation…" body)*. Story
  4.3 FD7 chose none for a DIALOG — nothing visible is missing while a closed dialog's chunk
  resolves. Here the editor unmounts on the flip and the chassis is the chunk, so without a
  fallback the page shows a header over nothing for the fetch duration. Trivial cost; say why it
  differs from the dialogs' choice.

**FD2 — The toggle's markup.**
- **(a) Two `styled('button')`s with `aria-pressed` in a `role="group"` named "Mode"**
  *(recommended)*. The mockup is two plain `<button>`s; `aria-pressed` is the toggle-button
  pattern axe understands; no MUI import on the tightest route (`<EditorStatusBar>`'s FD2 made
  this call for UNDO/SAVE on the same bundle argument). The group name gives screen readers the
  context the visual box gives sighted users.
- **(b) MUI `ToggleButtonGroup` (`exclusive`).** RFC-003 Decision 1 lists it, and Story 2.7 shipped
  one provisionally and 2.9 removed it with its `@mui/material` imports — the removal comment is
  in `BattleEditorView.tsx`. Costs bundle for a control the mockup styles differently anyway.
- **(c) A `role="radiogroup"` of visually-hidden radios in labels** (`<GridSettingsSection>`'s
  shape). Correct too, but the header's control is two buttons in the mockup, and the radio shape
  drags the `:focus-within` workaround along with it.

**FD3 — Active-state colour: the two mockups disagree, and both are right.**
- **(a) Mode-dependent: active LAB is neutral (`--gol-bg-hover` / `--gol-text-primary`, lab
  mockup), active RUN is accent (`--gol-accent-tint` / `--gol-accent`, play mockup)**
  *(recommended)*. The mockups were drawn per page and the difference is deliberate signalling —
  Run is "the simulation is live", the same reason the play dish's border turns accent. Contrast:
  `--gol-accent` on `--gol-accent-tint`-over-`--gol-bg-secondary` is ≈ the accent-on-secondary
  pair `themeTokens.test.ts` already gates at ≥ 4.5:1 (the tint is 10 % accent over the same
  ground, which only raises the ratio); verify with the file's `contrastRatio` helper in a one-off
  if in doubt — do not add a permanent test for a derived colour.
- **(b) One neutral active style for both.** Simpler; loses the mockup's Run signal; nothing else
  in this story then says "live" except the dish border.
- **(c) Accent for both.** Wrong per the lab mockup, and makes Lab look like something is running.

**FD4 — A roster with a hole in it.**
- **(a) `runOrganisms` is `null` when any `rosterIds` entry has no record; the Run button is
  `disabled` with a `title`** *(recommended)*. The hook's contract is one `Organism` per slot
  (3.10 obligation 2, M14), `compileSession` compiles what it is given, and a placeholder would
  have to invent rules for an organism nobody authored. Reachable today: a failed `organisms.list()`
  (AC7's degraded roster), an imported/hand-edited workspace with a dangling id (Story 5.11 owns
  the user-facing story), and the e2e's own Grand Colony War without `seedConway`. A disabled
  control with a reason is the pattern `<EditorToolsSection>` (Clear on an empty dish) and
  `<OrganismRoster>`'s add control (at cap) already use — NFR-4.1 forbids INERT controls, not
  explained ones.
- **(b) Drop unresolved ids from the run roster.** Shifts every later ref by one — the M14 failure
  Story 2.10's trap 1 describes; the grid would run with the wrong organisms in the wrong cells.
- **(c) Substitute a rule-less placeholder organism.** Runs; silently wrong semantics; and the
  placeholder's `colorToken` would need inventing too.

**FD5 — The view's props vs spec §3.11.**
- **(a) `{ initialGrid, organisms, startingSpeed, showGridLines, palette, colors, onBack,
  backDisabled }` — no `onExitToLab`, no `cellAnimation`** *(recommended)*. `onExitToLab` has no
  caller: the toggle lives in `<BattleHeader>` and `<BattlePage>` flips `mode` itself (RFC-005
  Decision 3's snippet put it on the view because its sketch had no header). `cellAnimation`
  (FR-8.8) has no consumer until Story 6.7 — a prop nothing reads is the dead-affordance rule
  applied to code. `palette`/`colors`/`onBack` are the same additive deviations `BattleEditorView`
  already carries for the same reasons (the LUT and the resolved tokens are built once in
  `<BattlePage>`; the footer needs its callback). Record all four as §3.11 amendment candidates
  (Task 9), the 3.10 precedent.
- **(b) Spec-literal props.** Two unused props, and a second exit path to keep consistent with the
  header's.

**FD6 — `PlaybackDish` construction deps.**
- **(a) `[size, palette, colors]`, EditDish's** *(recommended)*. `size` is `sim.liveSize`; when
  3.16 changes it the canvas rebuilds at the new size and re-attaches, which the hook's head
  comment names as the planned path ("Story 3.16's canvas rebuild"). The hook also calls
  `renderer.resize` on whatever is attached at `resizeLive` time — harmless on a renderer about to
  be dropped. One lifecycle, two variants, no special case.
- **(b) `[palette, colors]` only, size owned by the hook.** Then the observer's `renderer.resize
  (size)` closes over a stale `size` and would resize the renderer BACK to the mount-time grid on
  the next window resize — a bug 3.16 would have to discover.

**FD7 — What the Run sidebar shows before its sections exist.**
- **(a) The footer only** *(recommended)*. Honest skeleton; the chassis (column, scroll region,
  pinned footer) is real and 3.13/3.14/3.16 drop sections into `<SidebarContent>`'s `gap` exactly
  as 2.11/2.14/2.15 did on the Lab side. `data-status`/`data-cycle` on the view root carry the
  "paused at cycle 0" fact for tests until 3.14 renders it.
- **(b) Placeholder sections with static copy.** Dead affordances in prose form; and 3.14 would
  delete them.
- **(c) Pull `<CycleCounter>` forward.** Scope creep into 3.14; the epic sliced it deliberately.

**FD8 — The `compileSession` throw and the missing error boundary (3.10 Trap 5 → "3.11 decides").**
- **(a) Defer, with the reason written where 4-1's entry lives** *(recommended)*. After FD4 the
  only remaining throw paths are a schema-invalid rule or a > 255 roster — both unreachable from
  schema-validated storage (the 255 cap is UI-enforced at add time, Story 2.10 AC5). An
  `organismType` pattern naming an id outside the battle interns to the never-match sentinel
  (Decision E.3), not a throw. An `error.tsx` under `(battle)` is one file, but it is a route-level
  affordance with its own copy and its own bundle cost, and 4-1's entry already owns the question
  for both route groups. Add one sentence there: Run mode now has a throw path from the session
  effect, still unreachable in normal use.
- **(b) Add `app/(battle)/error.tsx` now.** Reasonable; do it only if the copy and the Back-to-
  Gallery affordance are written properly, and measure it (it is a static import on the route).

**FD9 — `tool` on the edit member (deferred-work, Story 2.7: "Epic 3's playback variant is the
next one to touch this union").**
- **(a) Leave it; update the entry** *(recommended)*. The playback member does not read it either,
  which settles the entry's question ("either a later variant reads it or it should go") as
  "go" — but removing it edits `<BattleEditorView>`'s `EditorMain` and every edit-variant test's
  props, in a Run-mode story. Reassign the removal to whichever story next edits the edit member,
  with the conclusion recorded.
- **(b) Remove it now.** Mechanical (`tsc` finds every site), but it widens this story's diff into
  `editor/` for a cleanup nothing here depends on.

### Traps

1. **`react-hooks/refs`, again.** Do not lazily init a ref during render in `PlaybackDish` or the
   view; the construction effect is where the renderer is born (`EditDish`'s exact shape).
2. **`onRendererReady` in the construction effect's deps.** Listing it rebuilds the renderer on
   every new callback identity; omitting it and calling the prop directly in cleanup detaches
   through a stale closure. The `endStrokeRef` pattern (Story 2.8 Task 5) is the answer, and
   Task 4's last test is its tripwire.
3. **A fresh `organisms` array per render restarts the run every render — as a hard crash.** 3.10's
   Dev Agent Record: "Too many re-renders", not a slow loop. `runOrganisms` is a `useMemo` on
   `[rosterIds, organisms]`; Task 5's identity test catches a regression.
4. **`grid` is the initial grid, and it is stable while in Run mode by construction** — the editor
   is unmounted, so nothing commits. Do not clone it in `<BattlePage>` "for safety": the hook
   clones (3.10 AC2), and a second clone per render would be a new session key per render
   (trap 3).
5. **`palette` must be built over the SAME `rosterIds` the engine was compiled from.** It already
   is (`<BattlePage>`'s `palette` memo); pass it through, never rebuild it in the view. A palette
   over `draft.organismIds` and a roster over `rosterIds` disagree by the session entries.
6. **Child effects run before parent effects.** `PlaybackDish`'s construction effect fires
   `onRendererReady` before the hook's session effect exists — the hook stores it and primes
   later (3.10 Trap 1, tested both ways there). Do not "fix" the order by delaying the call.
7. **`resize()` re-primes from `lastGrid`, and in playback `lastGrid` is a borrowed engine
   buffer.** See Task 4's note; the only new reader this story adds is the window-resize path, and
   it is safe by single-threading. Never call `renderer.resize` from anywhere in the view — the
   hook owns the renderer's grid size from attach on (3.10 review).
8. **`next/dynamic` + `vi.mock`.** `vi.mock('./simulation/BattleSimulationView', …)` intercepts
   the `import()` inside `dynamic()` (module-graph level), so the recorder mock works; but the
   render is still async — always `await screen.findBy…` / `waitFor` before asserting on anything
   in the run branch, in both mocked and real tests.
9. **StrictMode double-invokes effects in dev.** `PlaybackDish` builds two renderers on mount and
   the first's cleanup calls `onRendererReady(null)` — then the second calls it with a renderer.
   The hook handles attach/detach/attach (3.10 AC9). Task 4's unmount test plus a `<StrictMode>`
   render (`BattlePage.test.tsx` imports it already) covers the pair.
10. **The edit lock has two halves and the toggle needs both.** `disabled={isSaving}` on the RUN
    button is the visible half; `savingRef.current` in `handleModeToggle` is the half a same-tick
    click cannot bypass (`handleNameChange`'s comment). A mode flip mid-write would unmount the
    editor while `saveBattle` still holds its `grid` — harmless for the write, wrong for the
    user's model of what "saved" means.
11. **`data-mode` is read by nothing in code and by two tests.** Keep it on `<Root>`; the e2e's
    only handle on the mode is that attribute.
12. **Sidebar width.** The play mockup's `.sidebar` is 350 px; the lab mockup's is 320 px and
    that is what shipped. One column, one width — a toggle that shifts the dish 30 px reads as a
    page change, the thing RFC-005 Decision 3 exists to avoid.
13. **Three `styled(PetriDishCanvas)` wrappers now exist** (`BattleTile`, `BattleEditorView`,
    this view). Each carries only the styling its variant needs; do not hoist a shared one — the
    edit wrapper's `cursor`/`touchAction` lines are edit-only on purpose.
14. **`spec:check` reads this file.** Every ID above is spelled as the specs spell it.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **`play-mode-proposal.md` (biotech, RFC-005's cited source): "Switching modes preserves
  simulation state (if paused, stays paused)"** vs FR-4.8 / RFC-005 Decision 4 / Decision A.2:
  Run → Lab halts and DISCARDS the live grid. Architecture wins; the proposal predates the dual-grid
  decision. No edit — noted so the dev does not read the proposal as licence to keep the session.
- **`play-mode-proposal.md` keyboard table lists `E` / `P` for mode switching.** Story 3.19's
  hotkeys are SPACE / → / ESC / F per the Clinical Lab mockups and spec §9.6; `E`/`P` are not in
  scope anywhere. Not built.
- **RFC-005 Decision 3's snippet hands `onExitToLab` to the run view.** Illustrative — the header
  owns the toggle (spec §3.2). FD5 (a); amendment candidate recorded.
- **Spec §3.10's playback member: `onRendererReady(r: GridRenderer)`** → nullable, mirroring 3.10's
  `attachRenderer(PlaybackRenderer | null)`. Candidate recorded.
- **Spec §3.11's prop list vs what ships** — FD5. Candidates recorded, planning artifact not
  edited (M14/M15 precedent).
- **Lab vs play mockup active-toggle colours** — FD3 reconciles both rather than picking one.
- **`architecture.md` Runtime Architecture step 3 "(organism, ageShade)"** — already flagged by
  3.9/3.10; not re-recorded.

### What NOT to build

- ❌ No transport bar, no Play/Pause/Step/Stop buttons (Story 3.12). `sim.play` is never called.
- ❌ No `<SpeedControl>`, `<CycleCounter>`, `<PopulationStats>`, `<GridSizeControl>` (3.13–3.16).
- ❌ No fullscreen button, no `<FullscreenStage>`, no `fullscreen` state (Story 3.18).
- ❌ No `useSimulationHotkeys`, no key handling of any kind (Story 3.19).
- ❌ No Gallery Run action (Story 3.17).
- ❌ No `cellAnimation` prop anywhere (Story 6.7 brings its consumer).
- ❌ No change to `useSimulation`, `GridRenderer`, `playbackRenderer.ts`, the loop or the engine.
- ❌ No `renderer.drawFull`/`draw`/`markDirty`/`resize` call from the view or `PlaybackDish` (the
  hook paints; the observer's `resize` is the one exception and it is the canvas's, not the view's).
- ❌ No `useState` holding a grid, a renderer or anything from `sim` other than what the hook
  already publishes.
- ❌ No budget change in `check-bundle-size.mjs`; no `React.lazy`; no `ssr: true`.
- ❌ No MUI component on the battle route for the toggle (FD2).
- ❌ No `@gol/test-utils` additions; no new e2e seeding helper (reuse `seedWorkspace`).
- ❌ No edit to `component-tree-battle-page.md`, `architecture.md`, RFC-005 or the mockups —
  candidates to `deferred-work.md`.
- ❌ No `error.tsx` unless FD8 (b) is taken deliberately and measured.

### Testing standards summary

- Vitest 4 in `apps/web` (jsdom, `vitest.setup.ts` registers `cleanup`; no coverage gate — the
  tests exist because the ACs need them). RTL 16 + `@testing-library/user-event`; `vitest-axe`
  for the a11y assertions; `RecordingContext2D` (`test-support/`) for anything that must observe a
  paint; `createFakeRepositories` / `createMockWorkspace` / `MOCK_BATTLE_IDS` from `@gol/test-utils`.
- Never pixel/snapshot-test the canvas. Assert on renderer-method spies and the recording context's
  call counts, and in e2e on `distinctColorCount` — the established smoke threshold.
- Determinism: nothing here runs a cycle (no `play`, no `step`), so no seed is needed; if a test
  ever advances the simulation it injects `opts.seed` — which this view does not expose, so it
  does not.
- The hook's own tests (3.10) are the contract; do not re-test attach/detach/prime semantics here
  beyond the one prime-on-enter assertion — test the WIRING.
- `npm run ci > /tmp/ci-3-11.log 2>&1; echo $?`; report the real exit code and the bundle numbers.

### Previous story intelligence (3.10) and recent git

- **3.10 wrote this story's obligations into the hook's head comment** — stable references, roster
  order, unmount-to-leave, `onRendererReady` → `attachRenderer` straight through, `genPerSec` is
  initial-only, `compileSession` throws propagate (FD8). Its Dev Agent Record's first test run
  failed 23/37 with "Too many re-renders" from an unstable `initialGrid` reference — the failure
  mode is a crash, and `runOrganisms`'s memo is the guard here.
- **3.10's review made the hook own the attached renderer's size** (`paintFull` resizes before any
  full repaint it issues). `PlaybackDish` therefore never `drawFull`s and never needs to know the
  grid — construction, attach, detach, done.
- **3.10 Trap 9 / deferred-work**: the 3.8 KB headroom figure (post 4-2 merge) and the explicit
  suggestion of a `next/dynamic` split — FD1. **Current baseline (4.3's Dev Agent Record, on
  `main`):** `/battle` **306.1 KB** gzip against 310 (3.9 KB headroom), `/battle/new` 306.0,
  `/` 331.5 / 340, `/organisms` 295.2 / 305. 4.3 also measured a `next/dynamic` chunk that no
  prerendered HTML references (its editor chunk, 2.3 KB) and proved it on demand via the e2e's
  script-request count on the click — the same proof shape is available here if wanted, but AC8's
  `bundle:check` line is the gate. Expect the toggle + the `dynamic()` boundary to cost ~1 KB on
  the route (2.14 measured ~0.6 KB for the boundary alone, ~2.1 KB of chunk-split side effect on
  `/`); if `/battle` lands over 310 despite the split, that is a chunk-splitting side effect to
  diagnose with `npm run analyze -w web`, not a reason to raise — the absolute gate is a "stale
  ratchet" awaiting the growth-baseline redesign (`check-bundle-size.mjs`'s own comment), and
  neither is this story's to change.
- **Review culture (3.9 → 3.10):** every test made to fail under the mutation it guards. Task 4's
  ref-through-cleanup test and Task 5's `organisms`-identity test are the two whose mutations are
  named.
- **Git:** stories run on `story/*` branches merged by PR (#32 3.10, #33 4.3); `review:` /
  `fix:` commits after the feature commit; `docs:` follow-ups for run stats. Lane 4's next story
  (4-4) does not touch `components/battle/**`; 4.24/4.25 (which do) are gated on `epic-3` in
  `lane-gates.yaml`, so this story reshapes `<BattlePage>` and `<BattleHeader>` with no open
  consumer in the other lane.

### External dependencies / versions

None new. Next 16.2.10 `next/dynamic` (`ssr: false`, `loading`), React 19.2.7, MUI 9.3.1
`styled` only, `@testing-library/react` 16.3.2, `vitest-axe`, Playwright as installed. jsdom
implements `requestAnimationFrame` as a timer — the paused view never requests one, which is the
cheap invariant Task 6 pins.

## Project Structure Notes

- New: `apps/web/components/battle/simulation/BattleSimulationView.tsx` (+ `.test.tsx`),
  `apps/web/components/battle/BattlePage.modeToggle.test.tsx`.
- Modified: `apps/web/components/battle/BattleHeader.tsx` (+ `.test.tsx`),
  `apps/web/components/battle/BattlePage.tsx` (+ `.test.tsx`), `apps/web/components/PetriDishCanvas.tsx`
  (+ `.test.tsx`), `apps/web/e2e/battleRoute.spec.ts`, `apps/web/components/battle/simulation/README.md`
  (one sentence, if at all), `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Not touched: `apps/web/lib/**` (the hook is consumed, not changed), `packages/*`, `scripts/*`,
  `apps/web/components/battle/editor/**` (FD9 (a)), any planning artifact.
- Naming: `BattleSimulationView` per spec §3.11; private `SimulationSidebar` / `SimulationMain`
  per spec §2 (not exported — spec §3.3's "private layout children" rule); `PlaybackDish` beside
  `StaticDish` / `EditDish`; `runOrganisms` beside `rosterIds` / `roster` / `library`.

## References

- `docs/planning-artifacts/epics.md#Story 3.11` — the four clauses; Story 2.1's "only `'lab'`
  populated" AC this lifts; 3.12–3.19 for what is deliberately absent.
- `docs/planning-artifacts/architecture.md` — AR-28 (mode as local state), AR-29, AR-31, AR-35
  (dynamic import for heavy components), AR-46; Decision K (K.1 — the routing model is unchanged);
  Decision A.2 (Stop / Run→Lab discards); Decision D (D.1 default 10 gen/sec via FR-8.12);
  Runtime Architecture steps 1, 2, 6; M2, M14.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — Decision 2 (tree +
  ownership), Decision 3 (modes are state; the `onExitToLab` snippet is illustrative), Decision 4
  (the action table: Enter Run / Run → Lab rows), Decision 5, Decision 6 (undo survives the
  switch), Decision 9 (display prefs as props), Risks 1/3/5, Alternative 4.
- `docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md` — Decision 1 (import
  discipline), Decision 3 (`styled()` over `sx`), Risk 1 (dynamic imports).
- `docs/planning-artifacts/component-tree-battle-page.md` — §2 (the Run subtree), §3.1
  (`<BattlePage>` FR-3.10/4.8 line), §3.2 (`<BattleHeader>` API), §3.3 (private layout children),
  §3.9 (`<SidebarFooter>` in both modes), §3.10 (variants), §3.11 (`<BattleSimulationView>`), §6
  (the matrix: `mode` → BattlePage; `fullscreen` → view, later), §7 (3.10/4.8 row), §9.5.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` — FR-3.10, FR-4.8 (+ A-3),
  FR-3.8, FR-8.7, FR-8.8, FR-8.12, NFR-1.1, NFR-4.1.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode.html`
  — `.header-actions`, `.mode-toggle`, `.mode-btn` (+ `.active`, `:first-child`), `.petri-dish-grid`
  accent border, the chassis; `petri-dish-lab-mode.html` — the lab `.mode-btn.active`.
- `apps/web/lib/battle/useSimulation.ts` (head comment — consumer obligations; `attachRenderer`;
  `liveSize`), `apps/web/lib/canvas/gridRenderer.ts` (`lastGrid` borrow comment, `resize`,
  `drawDiff` null-baseline path), `apps/web/components/PetriDishCanvas.tsx` (`EditDish` lifecycle,
  `endStrokeRef`, the `never` guard, the 3.10 trailer), `apps/web/components/battle/BattlePage.tsx`
  (`mode`, `savingRef`, `palette`/`rosterIds`/`roster` memos, the `dynamic()` declaration),
  `apps/web/components/battle/editor/BattleEditorView.tsx` (layout values and their ⚠️ history),
  `apps/web/components/battle/SidebarFooter.tsx`, `SidebarSection.tsx`,
  `apps/web/components/battle/simulation/README.md`, `apps/web/app/themes.css` (`--gol-accent-tint`),
  `scripts/check-bundle-size.mjs` (what is measured), `apps/web/components/organisms/OrganismLibrary.tsx`
  (4.3's `dynamic()` rationale), `apps/web/components/battle/BattlePage.commitSeam.test.tsx` (the
  props-recorder shape), `apps/web/e2e/battleRoute.spec.ts` (`seedWorkspace`, `seedConway`,
  `distinctColorCount`).
- `docs/implementation-artifacts/3-10-usesimulation-hook.md` (AC9, AC10, FD2, FD3, Traps 1/5/9,
  Dev Agent Record), `deferred-work.md` (3-10 section; the 2.6 pointer-capture entry; the 2.7
  `tool` entry; the 4-1 error-boundary entry), `lane-gates.yaml` (4.24/4.25 on `epic-3`).
- `docs/project-context.md` — hot state in refs; modes are state not routes; `components/battle/`
  split; no DOM in `packages/*`; `spec:check` spelling; commit gate; bundle ratchet.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5`), via `bmad-dev-story` under `implement-next-story --epic 3`. Two
sessions: the first wrote the code and tests and hit a usage limit before bookkeeping; the second
(this record) verified every task against the diff, fixed the one red e2e, measured AC8 and closed
the story.

### Debug Log References

- `npm run ci > /tmp/ci-3-11.log 2>&1; echo $?` → first run **exit 1**: 1 e2e test red on all four
  projects — the new "Back from Run on a dirty battle opens the Unsaved Changes dialog" queried the
  `<h1>` by role while the guard was open, and MUI's modal marks everything outside the dialog
  `aria-hidden`. Replaced with attribute reads (`[data-mode="run"]`, `[data-dirty="true"]` under the
  dialog — the unit test's shape). Also added the `main` count-1 assertion Task 7(a) asks for.
  Everything ahead of e2e was green on that run: typecheck, lint (the one pre-existing warning at
  `BattleGallery.tsx:248`, untouched), format:check, spec:check (236 ids resolve), boundary:check,
  coverage (`@gol/domain` 99 tests, `@gol/simulation` 397, `@gol/persistence` 82, `@gol/test-utils`
  89 — all floors unchanged, nothing in `packages/*` touched; `web` 77 files / 1146 tests),
  build:standalone, bundle:check, bench, bench:check.
- Second `npm run ci` after the fix → **exit 0** (2026-09-14): every step green; e2e 432 passed
  (2.9 m); bench:check 9.439 ms headroom (56.6% of the frame) on that run.
- `bundle:check` (AC8): `/battle` **308.5 KB gzip against 310 — 1.5 KB headroom** (from 306.1 /
  3.9 on `main`), `/battle/new` 308.5 (from 306.0), `/` 333.3 / 340 (from 331.5), `/organisms`
  295.3 / 305. Run-view chunk `36kpzp_s8xfv4.js`: **4.2 KB gzip** (10.2 KB raw — the view, the hook,
  `simulationSpeed`, `population`); the engine proper (`compileSession`, `threePhaseStep`, RNG) is a
  second **5.4 KB gzip** chunk (`0b_hddxkggx7l.js`) Turbopack already emits for `/organisms`, so it
  is shared. Neither is referenced from `out/battle.html` — verified by grepping every script the
  HTML names for the hook's own error strings. **Why the route moved +2.4 KB rather than the toggle's
  ~1 KB:** `PlaybackDish` rides in the route's payload because `<PetriDishCanvas>` is one module
  statically imported by `<BattleEditorView>` (and `<BattleTile>` — hence `/` +1.8 KB). The
  `dynamic()` boundary moves the hook and engine, not the canvas variant. Recorded in
  `deferred-work.md` with the next mechanism (split the variants into modules) should 3.12–3.19 run
  out of headroom; `check-bundle-size.mjs` unchanged.
- `bench:check`: 8.747 ms headroom (52.5% of the frame) against 16.667 ms — unchanged in kind;
  nothing here is on the benchmarked path.
- e2e: 428 passed / 4 failed on the first run; the Story 3.11 block re-run after the fix: 20/20
  across chromium / firefox / webkit / tablet.
- Story-file units (5 files: `BattleHeader`, `BattlePage`, `BattlePage.modeToggle`,
  `BattleSimulationView`, `PetriDishCanvas`): 211 passed.

### Completion Notes List

- **Task 1** — `<BattleHeader>`: `Actions` → `ModeToggle role="group" aria-label="Mode"` → two
  `ModeButton type="button"` with `aria-pressed` and `data-mode-value`; mockup `.mode-btn` verbatim
  minus `transition`/`position`; FD3's mode-dependent active pair via the `[data-mode-value="run"]`
  selector; `disabled`/`disabledReason` reach RUN only. `BattleMode` exported. 13 tests including
  the flipped count test, "renders only when BOTH props", and axe in both modes.
- **Task 2** — `<BattlePage>`: `useState<BattleMode>('lab')`, `handleModeToggle` with the
  `savingRef` lock, `runOrganisms` memo on `[rosterIds, organisms]` (null on any hole),
  `runDisabledReason`, `dynamic()` with `loading: RunLoading` and the FD1 rationale beside the
  dialogs' declaration; the editor and the Run view are exclusive branches under the `grid !== null`
  outer guard, the Run branch narrowed by `runOrganisms !== null`. Comments rewritten where "Epic 3"
  was future tense (grep is clean).
- **Task 3** — `BattleSimulationView.tsx`: one `useSimulation` call, private layout children with
  the editor's values (320 px sidebar, `minHeight: 0`, `aspectRatio: 5 / 3`), accent dish border,
  `data-status`/`data-cycle` on the root, `<SidebarContent />` empty + `<SidebarFooter>` last.
  README: one sentence on the private layout children; the "second caller" line updated.
- **Task 4** — `PetriDishCanvas.tsx`: the `'playback'` union member with its doc comment,
  `PlaybackDish` (construction on `[size, palette, colors]`, `onRendererReadyRef` refreshed by an
  effect declared first, cleanup detaches through the ref, `GridRendererContextError` → headless,
  grid-lines effect, parent-observing `ResizeObserver` with the `lastGrid` borrow note), third
  dispatch arm. 8 tests, including the Trap 2 tripwire (new callback identity → unmount detaches
  through the NEW one).
- **Task 5** — `BattlePage.test.tsx`: 7 tests (flip + same `<h1>` element + URL, round-trip
  undo/dirty/name, edit lock, dangling roster, failing `organisms.list()`, Run-mode Back → Cancel →
  focus on the Run footer, axe in Run). `BattlePage.modeToggle.test.tsx`: 5 identity tests through
  props-recording mocks of both views (`initialGrid` is the editor's `grid`, `organisms` in
  `rosterIds` order and byte-equal to the fixtures, identity stable across the dialog re-render,
  same `grid`/`canUndo` after Run → Lab, `startingSpeed` = the seeded 5, `onBack` reaches the guard).
- **Task 6** — `BattleSimulationView.test.tsx`: 9 tests (paused/0, one button, forwards `onBack`,
  `colors === null` → no canvas, one `drawFull` byte-equal to `initialGrid` through the hook's
  clone, zero `requestAnimationFrame` while paused, StrictMode settles to one canvas, two-organism
  roster with ref 2 through the real hook, axe).
- **Task 7** — e2e block of 5 on Three-Way Skirmish (+ Grand Colony War without `seedConway` for the
  dangling case); `collectErrors` on every test; `distinctColorCount > 2` on the Run dish and again
  after returning to Lab; axe in both states.
- **Task 8** — both count tests converted (8 on `/battle/new`; `organisms.length + 7` on the loaded
  route, "ELEVENTH" rewritten); the two `aria-pressed` tool-selection tests scoped to the sidebar
  (`within(complementary)`) because the header now has a second pressed group; `SidebarFooter.tsx`
  head comment updated; the bare `[data-back-to-battles]` entry closed with the Run-mode assertion.
- **Task 9** — `deferred-work.md`: 3-10 bundle entry closed with FD1 + the numbers; 2.6 pointer-
  capture entry reassigned to 6.11; 2.7 `tool` entry settled as "go", removal reassigned; 4-1
  `error.tsx` entry carries the `(battle)` Run-mode sentence (FD8); 2.16's bare-query entry closed,
  "Save & Leave REFUSED" reaffirmed and left open; new 3-11 section (five §3.10/§3.11 amendment
  candidates, `disabled` collapsing two reasons, the `lastGrid` borrow, `PlaybackDish` on the route).

### Forced Decisions

- **FD1 (a)** — `next/dynamic` the whole view, `ssr: false`, WITH a `loading` fallback
  (`RunLoading`, `role="status"`): the editor unmounts on the flip, so unlike the dialogs the chunk
  IS the visible chassis. `check-bundle-size.mjs` untouched; measured above.
- **FD2 (a)** — two `styled('button')`s with `aria-pressed` in a `role="group"` named "Mode". No MUI
  import on the route.
- **FD3 (a)** — mode-dependent active colour: neutral LAB (`--gol-bg-hover`/`--gol-text-primary`),
  accent RUN (`--gol-accent-tint`/`--gol-accent`). One styled component, `data-mode-value` selector.
- **FD4 (a)** — `runOrganisms` is `null` on any unresolved id; RUN disabled with a `title`. Never a
  placeholder, never a dropped slot (M14).
- **FD5 (a)** — props `{ initialGrid, organisms, startingSpeed, showGridLines, palette, colors,
  onBack, backDisabled }`; no `onExitToLab`, no `cellAnimation`. Amendment candidates recorded.
- **FD6 (a)** — `[size, palette, colors]` construction deps; `size` is `sim.liveSize`.
- **FD7 (a)** — footer-only sidebar over an empty `<SidebarContent />`.
- **FD8 (a)** — no `error.tsx`; one sentence added to 4-1's entry.
- **FD9 (a)** — `tool` stays; entry settled as "go", removal reassigned to the next edit-member story.

### Spec-conflict flags raised

None new beyond the six the story pre-recorded (play-mode proposal's "preserves simulation state"
and its `E`/`P` keys — not built; RFC-005 Decision 3's `onExitToLab` — FD5; spec §3.10's non-null
`onRendererReady` and §3.11's prop list — amendment candidates in `deferred-work.md`; the two
mockups' active-toggle colours — FD3). One observation for the reviewer, not a conflict: the
engine's `@gol/simulation` slice was already a separate chunk on `/organisms` before this story
(the rule editor imports it), so "the first route import of the engine" in the AC preamble is true
of `/battle` and not of the app — it changes nothing about AC8, which is per route.

### File List

- `apps/web/components/battle/BattleHeader.tsx` (modified — the toggle, `BattleMode`, `disabled`/`disabledReason`)
- `apps/web/components/battle/BattleHeader.test.tsx` (modified — count test rewritten, 10 new tests: 2 optionality + 8 toggle)
- `apps/web/components/battle/BattlePage.tsx` (modified — `mode`, `handleModeToggle`, `runOrganisms`, lazy view, Run branch)
- `apps/web/components/battle/BattlePage.test.tsx` (modified — two count tests converted, two `aria-pressed` tests scoped, new Story 3.11 describe)
- `apps/web/components/battle/BattlePage.modeToggle.test.tsx` (new — props-identity tests through mocked views)
- `apps/web/components/battle/SidebarFooter.tsx` (modified — head comment only)
- `apps/web/components/battle/simulation/BattleSimulationView.tsx` (new)
- `apps/web/components/battle/simulation/BattleSimulationView.test.tsx` (new)
- `apps/web/components/battle/simulation/README.md` (modified — two sentences)
- `apps/web/components/PetriDishCanvas.tsx` (modified — `'playback'` member, `PlaybackDish`, dispatch arm)
- `apps/web/components/PetriDishCanvas.test.tsx` (modified — playback describe, 8 tests)
- `apps/web/e2e/battleRoute.spec.ts` (modified — Story 3.11 block, 5 tests)
- `docs/implementation-artifacts/deferred-work.md` (modified — six entries touched, new 3-11 section)
- `docs/implementation-artifacts/sprint-status.yaml` (modified — 3-11 → review)
- `docs/implementation-artifacts/3-11-mode-toggle-run-view-skeleton.md` (this file)

### Change Log

- 2026-09-14 — Story 3.11 implemented: Lab⇄Run toggle in `<BattleHeader>`, `mode` widened in
  `<BattlePage>` with `runOrganisms` and the lazy `<BattleSimulationView>`, the Run chassis skeleton,
  the `'playback'` `<PetriDishCanvas>` variant, 39 new unit tests (+ 1 rewritten) + 5 e2e,
  deferred-work bookkeeping. First `npm run ci` exit 1 (one e2e assertion under MUI's
  `aria-hidden`); fixed. Final `npm run ci` → **exit 0**: spec:check 236 ids; unit 89 / 397 / 99 /
  82 / 1146; bundle `/battle` 308.5 KB (1.5 KB headroom); bench 9.439 ms headroom (56.6%); e2e
  **432 passed**.
- 2026-09-14 — Code review (Fable): 8 patches applied (see Review Findings) — `PlaybackDish` keyed
  on dimensions rather than `size` identity (+1 test, mutation-checked), StrictMode / AC5 /
  title-text assertions strengthened, the AC7 e2e asserts a clean console, three comment and
  bookkeeping corrections; 3 items deferred to `deferred-work.md`. Story-file units 212 passed;
  typecheck / lint / format:check / spec:check exit 0. Status → done.

Dev Model: opus   # architecture-shaping: fixes the Run chassis every 3.12-3.19 story writes into, the hook-consumer contract (`runOrganisms` roster/refusal semantics, stable-reference ownership in <BattlePage>), the `'playback'` canvas lifecycle 3.16/3.18/4.15 rebuild on, and the engine-loading mechanism for the bundle gate (FD1) — new seams, not an existing pattern applied
Proposed lane gate: none
