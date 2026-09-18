---
baseline_commit: 0c4e82e5116c7e7f12f0fe3c78fcfd75139f8091
---

# Story 3.18: Fullscreen Run Stage

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want an immersive fullscreen view of a running battle,
so that I can present or just enjoy it big.

## Acceptance Criteria

From `epics.md#Story 3.18` (`:961-972`), decomposed into what a reviewer can check independently.
This is UX-sourced scope (spec §9.5): the authority is `petri-dish-play-mode-fullscreen.html` plus
the header's `⛶ FULLSCREEN` button in `petri-dish-play-mode.html:555`, and
`component-tree-battle-page.md` §3.2 / §3.11 / §3.14 — there is no backing FR, so the governing
IDs in code are NFR-4.1 (no dead affordance), NFR-1.1 / AR-29 (nothing per cycle reaches React),
RFC-005 (state categories; the run-local `fullscreen` cell), Decision D (the loop is untouched) and
AR-46 (tokens only). What already exists and is pinned: `<BattleHeader>` declares
`onEnterFullscreen?()` and renders nothing for it (`BattleHeader.tsx:141`, `BattleHeader.test.tsx:26-41`);
`<BattleSimulationView>` is the Run chassis with the dish at
`SimulationLayout > SimulationMain > GridContainer > PetriDishBox > DishCanvas`
(`BattleSimulationView.tsx:203-284`); `PlaybackDish` constructs its renderer once per
`[cols, rows, palette, colors]` and re-fits on every container-box change through a
`ResizeObserver` on `canvas.parentElement` calling `renderer.resize({ cols, rows })`
(`PetriDishCanvas.tsx:848-928`); `GridRenderer.resize` "serves … canvas-box changes (fullscreen
re-layout, Story 3.18)" by re-reading the CSS box and repainting `lastGrid` (`gridRenderer.ts:637-648`);
and the hook's ref-forwarding `StepRenderer` was written so a renderer "swapped (… Story 3.18's
fullscreen) never rebuilds the loop" (`useSimulation.ts:52-56`). What does **not** exist: the
entry button, the `fullscreen` state cell, `<FullscreenStage>` and its two parts, the HUD's compact
pieces, and the tests. This story adds **no change to `PetriDishCanvas.tsx`, `useSimulation.ts`,
`gridRenderer.ts`, `SimulationLoop`, anything in `packages/**`, `check-bundle-size.mjs`,
`themes.css`, any route file, any repository, and nothing under `components/organisms/**` or
`lib/organisms/**` (lane 4's surface)**. *(FD4 owner override, 2026-09-18: `themes.css` DID change —
two channel-composed tokens for the floating chrome, `--gol-scrim-top` and `--gol-shadow-dish-glow`
(a third, `--gol-surface-hud`, shipped with (b) and was removed by second-review decision (d)); see
FD4 (b) and the File List.)*

1. **The header carries the entry, in Run mode only (spec §3.2; `petri-dish-play-mode.html:97-114`,
   `:551-560`; NFR-4.1).** `<BattleHeader>` renders a `<FullscreenButton>` (a plain
   `styled('button')`, `type="button"`) inside `<Actions>` BEFORE `<ModeToggle>` (the mockup's DOM
   order — tab order is Fullscreen → Lab → Run) **iff `mode === 'run'` AND `onEnterFullscreen` is
   supplied** — the same both-or-nothing rule the toggle already uses (`BattleHeader.tsx:119-127`).
   DOM text `Fullscreen` (sentence case — trap 15 of `<SidebarFooter>`; CSS uppercases it), the
   `⛶` glyph (U+26F6) in an `aria-hidden` span before it (the 3.17 FD4 shape: the glyph sits in
   axe's symbol range, `aria-hidden` keeps it out of the name, and the pair the control wears is
   gated in `themeTokens.test.ts` — say so in the comment). Chrome per the mockup's
   `.btn-fullscreen`: transparent, `1px solid var(--gol-accent)`, `var(--gol-accent)` text,
   `8px 16px`, `11px/600/0.5px`, hover `var(--gol-accent-tint)` (the token Story 4.2 authored for
   exactly this rgba), `:focus-visible` the route's accent ring, no `transition` (the mid-fade axe
   trap every bar on this route records). Never `disabled` — entering fullscreen touches no
   editor state, so neither the edit lock nor the roster refusal applies (both reach RUN only,
   `:861-870`). It carries `data-enter-fullscreen=""` — the focus-restore handle (AC7), the
   `[data-back-to-battles]` precedent (`SidebarFooter.tsx:130`, `useLeaveGuard.ts:138`). Tests
   (`BattleHeader.test.tsx`): a new run-mode case — `mode="run"` + `onEnterFullscreen` → exactly
   THREE buttons, `getByRole('button', { name: 'Fullscreen' })` present, before the group in DOM
   order, click → the handler once; `mode="run"` WITHOUT the prop → two buttons; the existing
   `mode="lab"` + prop case stays at two (`:26-41` — rewrite its comment: the third button is
   Run-only, so this Lab count is unaffected rather than "still fails"); axe clean in the
   three-button state.

2. **`<BattlePage>` owns `fullscreen` (FD1; RFC-005 "ephemeral UI → local `useState`"), and the
   header leaves the tree while it is on (FD9).** `const [fullscreen, setFullscreen] =
   useState(false)` beside `mode`; `const inFullscreen = mode === 'run' && fullscreen` is the ONLY
   value the render reads. `handleEnterFullscreen` / `handleExitFullscreen` are `useCallback([])`.
   Every writer that takes `mode` off `'run'` also clears the cell: `handleModeToggle` sets
   `fullscreen` false beside `setMode(next)` (`:338-341`), and the in-render adjust for a dangling
   roster (`:589`) becomes `{ setMode('lab'); setFullscreen(false); }` — otherwise a later Run
   entry would open straight into fullscreen (trap 16). Render: `{!inFullscreen && <BattleHeader …
   onEnterFullscreen={handleEnterFullscreen} />}` — the header is UNMOUNTED, not hidden, so its
   toggle and button are neither focusable nor announced under the stage (a covered-but-reachable
   control is the `aria-hidden-focus` shape `useInertBackground.ts:5-24` exists to prevent); the
   overlay's `<h1>` keeps the route's single-h1 invariant (AC3, AC7). `<BattleSimulationView>`
   receives `fullscreen={inFullscreen}`, `onExitFullscreen={handleExitFullscreen}` and
   `battleTitle={battleDisplayName(battleName)}` (the same string the header shows). Tests
   (`BattlePage.test.tsx`, a new `describe('Fullscreen run stage (Story 3.18)')` reusing the 3.11
   block's helpers `modeValue` / `runButton` / `labButton` / `backButton` / `findRunView`,
   `:2684-2701` — hoist or duplicate; the router mock at `:21-32` is mandatory): (a) Lab shows no
   Fullscreen button; RUN → the button appears; click → `[data-fullscreen="true"]` on the view
   root, `queryByRole('group', { name: 'Mode' })` is null, exactly one `<h1>` reading `Three-Way
   Skirmish`, `Exit fullscreen` present, no `complementary` landmark, no `Back to Battles`;
   (b) `Exit fullscreen` → the header is back (group `Mode`, RUN pressed, the Fullscreen button
   present again), `[data-fullscreen="false"]`, the four Run h2s in order, `Back to Battles` once,
   `data-status` / `data-cycle` unchanged across the round trip; (c) `initialMode="run"` (3.17)
   entry → the button is there on the first header render; (d) `BattlePage.modeToggle.test.tsx`'s
   prop-equality assertions gain the three new props (`fullscreen: false`, `onExitFullscreen` a
   function, `battleTitle: 'Three-Way Skirmish'`) — its mocked view records every prop (trap 6).

3. **`<FullscreenStage>` renders the immersive layout: top overlay, the dish, bottom HUD (spec
   §3.14; `petri-dish-play-mode-fullscreen.html`).** New `simulation/FullscreenStage.tsx`, default
   export, props = spec §3.14's `{ battleTitle, onExit, hud, transport, children }` **plus
   `active: boolean`** (FD2 (a) — the component is mounted in BOTH states and renders its chrome
   only while active; see AC4 for why). Its two parts, `<FullscreenTopOverlay>` and
   `<FullscreenHUD>`, are private children of that file (spec §3.3's rule for `<EditorSidebar>` /
   `<EditorMain>`; `simulation/README.md` already says "`<FullscreenStage>` and its two parts").
   - **Top overlay** (`.fs-top` / `.fs-title` / `.fs-mode-badge` / `.fs-exit`, mockup `:38-92`):
     a row with `justifyContent: space-between`, `padding: 18px 24px`; left, an `<h1>` holding
     `battleTitle` ONLY (14px/600/uppercase-by-CSS/`--gol-text-secondary`, `minWidth: 0` +
     `overflowWrap: anywhere` — the header's own 100-character rule) followed by a SIBLING
     `<span>` badge reading `Run` (accent text, `1px solid var(--gol-accent)`, `2px 8px`,
     10px/600/1px) — the badge stays OUTSIDE the `<h1>` so the heading's accessible name is exactly
     the title (trap 9); right, `<button type="button">` with DOM text `Exit fullscreen` and an
     `aria-hidden` `⛶` before it, chrome per `.fs-exit` minus the rgba surface (FD4: `transparent`
     on the stage's own `--gol-bg-primary`, `1px solid var(--gol-border-control)` — SC 1.4.11
     needs the control token, not `--gol-border`), hover → accent border + text, focus-visible ring,
     no `transition`. It calls `onExit`. *(FD4 (b), 2026-09-18: the bar is `position: fixed` under
     `--gol-scrim-top`, and the Exit surface is opaque `--gol-bg-secondary` — the mockup's
     `rgba(0,0,0,.4)` made opaque, the surface the HUD panel shares — not `transparent`; second-review
     decision (d) removed the interim translucent `--gol-surface-hud` token.)*
   - **The dish**: `children` — the live `<PetriDishCanvas>` inside its unchanged wrappers (AC4).
   - **HUD** (`.fs-hud` / `.hud-*`, mockup `:131-210`; `.control-btn*` `:212-259`): a centred row (`padding: 0 24px 40px` —
     the mockup's 40px bottom offset, in flow) holding one panel: `display: inline-flex; alignItems:
     center; gap: 20px; padding: 12px 20px; background: var(--gol-bg-secondary); border: 1px solid
     var(--gol-border); maxWidth: 94vw; flexWrap: wrap; justifyContent: center`. *(FD4 (b): the row
     is `position: fixed; bottom: 40px`, not in flow; the panel's surface stays the opaque
     `--gol-bg-secondary` — second-review decision (d).)*
     Groups in this
     order, separated by `1px × 28px` `--gol-border` dividers (`aria-hidden`): **Cycle** — a
     10px/uppercase `--gol-text-secondary` label `Cycle` + the zero-padded digits at
     20px/600/accent/`tabular-nums`/2px letter-spacing (`.hud-cycle-value`), through
     `<CycleDigits>` (FD8) so the padding is ONE implementation (3.14 FD6: the padding is an
     `aria-hidden` span, the digits plain text); **Population** — `<PopulationPills entries=
     {hud.population} />` (AC8); **Speed** — label `Speed` + `` `${hud.genPerSec} gen/s` `` at
     13px/600/`--gol-text-primary` (`.hud-speed-value`; FD6 — a read-out, not a slider);
     **Transport** — `<TransportControls {...transport} />` (FD7), the SAME three accessible
     names as the bottom bar (`Play`/`Pause`, `Next cycle`, `Stop & reset`), NOT the mockup's
     `Play`/`Next`/`Stop`.
   - NOT rendered: the mockup's `.fs-hint` line (`Press F to exit …`) and its `keydown` script
     (`:261-279`, `:373-393`) — Story 3.19's, together with the handlers that make them true
     (NFR-4.1); no Back, no speed slider, no grid-size control, no sidebar.
   - Tests (`FullscreenStage.test.tsx`, RTL + `vitest-axe`): `active={false}` renders ONLY its
     children (no `<h1>`, no buttons); `active` renders one `<h1>` with the exact title, the badge
     outside it, `Exit fullscreen` calling `onExit` once, the cycle padding `aria-hidden` and the
     digits as text (`0042` → hidden `00` + `42`), the speed read-out text, the three transport
     buttons with `Next cycle` disabled while `status: 'playing'`, `Play` ↔ `Pause` by status; the
     pills per AC8; Tab order Exit → Play → Next cycle → Stop & reset (trap 12); axe clean in both
     states; `Exit fullscreen` has focus after mount (AC7).

4. **Entering and exiting is a layout swap — the SAME canvas element and the SAME `GridRenderer`,
   re-laid out, never remounted (spec §3.11 "CSS-driven"; epic AC2; FD2).** The invariant is
   React's reconciliation: an element keeps its DOM node only while its ancestor chain has the same
   component types at the same child positions. Therefore, in `BattleSimulationView.tsx`:
   - `SimulationLayout` (the view root) gets `data-fullscreen={fullscreen}` rendered in BOTH states
     (the `data-dirty` / `data-status` rule: an absent attribute and a wrong one look alike to a
     test with the wrong selector), and every fullscreen style is a `'[data-fullscreen="true"] &'`
     parent selector on the EXISTING styled blocks — `SimulationLayout` → `position: fixed; inset:
     0; background: var(--gol-bg-primary)` (no `z-index`: it is later in DOM order than everything
     it must cover, and the header is unmounted anyway — trap 15); `GridContainer` →
     `padding: 20px 24px`; `PetriDishBox` → `width: auto; height: 100%; maxWidth: 100%; maxHeight:
     none; aspectRatio: '5 / 3'` (height-driven — in a fixed-inset column the binding constraint
     is nearly always height, so the accent border hugs the grid; when width binds instead the
     renderer letterboxes vertically, as it already does horizontally today). These values are a
     starting point; the invariants are (i) both rows visible with the dish between them at
     1280×720 and 1194×834, (ii) the dish's box strictly LARGER than in the chassis at 1280×720
     (e2e AC10 (a)). *(FD4 (b), 2026-09-18 — what shipped: `GridContainer` `padding: 0`; `PetriDishBox`
     `width: min(94vw, 138vh); maxWidth: none; maxHeight: none; boxShadow: var(--gol-shadow-dish-glow)`
     — width-declared, not height-driven. Invariant (i) reads "both floating rows on screen, the HUD
     overlapping the dish's bottom edge (≈41px at 1280×720, ≈23px at 1194×834) as in the mockup";
     (ii) holds: 990×592 vs 896×517.)*
   - The sidebar leaves the tree: `{!fullscreen && <SimulationSidebar>…</SimulationSidebar>}` — a
     `false` keeps child slot 0 occupied so `<SimulationMain>` stays at slot 1 (trap 1).
   - Inside `<SimulationMain>`: `<FullscreenStage active={fullscreen} …>` wraps the UNCHANGED
     `<GridContainer><PetriDishBox>{colors !== null && <DishCanvas … />}</PetriDishBox></GridContainer>`
     as `children`, and renders `<>{active && <TopOverlay/>}{children}{active && <HUD/>}</>` —
     a fragment with three FIXED slots, so `children` is at slot 1 in both states; then
     `{!fullscreen && <SimulationControlBar … />}`. Comment the fragment with the reconciliation
     reason — it is the load-bearing line of the story.
   - `PlaybackDish` is untouched: its `ResizeObserver` on `canvas.parentElement`
     (`PetriDishCanvas.tsx:903`) sees `PetriDishBox` change size and calls
     `renderer.resize({ cols, rows })`, which re-reads the CSS box and repaints `lastGrid`
     (`gridRenderer.ts:648-672`). ❌ Nothing in the view calls `renderer.resize` (the hook owns the
     renderer from attach on — `PetriDishCanvas.tsx:895-897`), ❌ no `key` change on the canvas, ❌
     no `display: none` anywhere on the canvas's ancestor chain (a 0-width transition is the
     `deferred-work.md` "dpr² exposure" entry's revisit trigger — confirm in that entry that this
     story introduces none).
   - Tests (`BattleSimulationView.test.tsx`, with `installContexts()` + `installFrameDriver()` +
     `vi.spyOn(GridRenderer.prototype, 'drawFull')`, the file's own idioms `:29-107`, and the
     `view()` helper extended with `fullscreen={false}`, `onExitFullscreen={vi.fn()}`,
     `battleTitle="Three-Way Skirmish"`): (a) `rerender(view({ fullscreen: true }))` → the
     `canvas` element is `toBe` the one captured before, `querySelectorAll('canvas')` is 1, the
     contexts map still holds ONE canvas (no second construction), `drawFullSpy` count UNCHANGED
     (a remount would re-attach and re-prime — the `:376-378` "same canvas node" shape), the root
     carries `data-fullscreen="true"`, no `complementary`, no sliders, `Exit fullscreen` present;
     (b) `rerender(view({ fullscreen: false }))` → same canvas node again, `drawFull` still
     unchanged, four h2s back, two sliders back, the bottom bar's `Simulation controls` group
     back; (c) under `<StrictMode>` the round trip settles to one canvas and one primed renderer
     (the `:206-220` shape).

5. **The running simulation continues uninterrupted across enter and exit (epic AC3; Decision D,
   AR-29).** Nothing about the swap reaches the hook: `useSimulation(initialGrid, organisms, …)`
   keeps its stable references (obligation 1), no effect in the view keys on `fullscreen`, and
   the loop's `draw` forwards to whatever renderer is attached — the same one. Tests: (a)
   `BattleSimulationView.test.tsx` — Play, `driver.frame(0)`, `driver.frame(100)` (cycle 1), flip
   `fullscreen` on, `driver.frame(200)`, `driver.frame(300)` → `data-cycle` advanced, `data-status`
   still `playing`, `driver.caf` NOT called, `driver.pending()` is 1 (the next frame is still
   queued), then flip off and two more frames → still advancing; (b) paused at cycle 2 → enter →
   `data-cycle` `2`, `data-status` `paused` → exit → the same; (c) `sim.setSpeed(20)` then enter →
   the HUD reads `20 gen/s`; exit → the Speed slider's `aria-valuetext` reads 20; (d) an ephemeral
   resize to 150×90 (paused) then enter → the dish's `aria-label` is still `Petri dish, 150 by 90
   cells` and the same canvas node (the 3.16 rebuild is keyed on DIMENSIONS, which do not change
   here — trap 2); exit → Grid Size still reads 150×90 (`resizeLive` state lives in the hook, the
   sidebar merely re-reads it). e2e (AC10 (b)) proves it in a real browser with `expect.poll` on
   `data-cycle`.

6. **Exit restores the chassis exactly, and the entry control gets focus back (FD9; AC7).** On
   `Exit fullscreen`: `<BattlePage>` flips the cell; the header remounts (its ⛶ button is a NEW
   element); the view re-renders the sidebar and bar from the hook's published values (cycle,
   population, speed, live size) — nothing is stored in the view, so nothing is lost. Focus: in
   `<BattlePage>`, `handleExitFullscreen` sets a `restoreFullscreenEntryFocusRef` (a ref, the
   `useLeaveGuard.ts:96-105` shape) before `setFullscreen(false)`; a `useEffect` keyed on
   `inFullscreen` runs after the commit that remounted the header, clears the flag, and — only if
   focus is LOOSE (`document.activeElement` is null or `document.body`; "do not steal focus the
   user has already placed somewhere real", `:130-136`) — focuses
   `document.querySelector<HTMLElement>('[data-enter-fullscreen]')`. A DOM lookup at restore time,
   never a captured element, for the reason `useLeaveGuard.ts:100-104` records (WebKit does not
   focus a `<button>` on click). ❌ Not `react-hooks/set-state-in-effect` territory — `.focus()`
   is not state. Test (`BattlePage.test.tsx`): after Exit, `screen.getByRole('button', { name:
   'Fullscreen' })` `toHaveFocus()`; and with focus placed on the Stop button by the user before
   Exit (`user.click` on Exit moves focus to Exit itself under jsdom/RTL, so this case is: exit via
   the mocked view's `onExitFullscreen` while a sidebar-less control holds focus) — document what
   the test can and cannot prove rather than overclaiming (the 3.17 review's "cannot observe a
   transient mount" lesson).

7. **Focus and accessibility across the swap (NFR-4.1; SC 2.4.3 focus order).** Entering: the
   `Exit fullscreen` button takes focus on mount — an effect in `<FullscreenTopOverlay>` (or React
   `autoFocus` on the button, the `UnsavedChangesDialog.tsx:104-111` precedent, if lint allows it)
   — because the element that had focus (the header's ⛶) has just unmounted and focus would
   otherwise fall to `<body>`. Exactly one `<h1>` in every state (the header's in the chassis, the
   overlay's in fullscreen — `BattlePage.test.tsx:544-546`'s single-h1 line stays the guard). No
   `aria-live` anywhere (3.14 FD8 — a 10 Hz region is an announcement storm). The pills carry the
   organism NAME for assistive tech through `<VisuallyHidden>` (AC8), the count as visible text, and
   the `☠` `img` named `extinct` (the `PopulationStats.tsx:171-175` element, shared). axe clean:
   unit (`FullscreenStage.test.tsx`, `BattlePage.test.tsx` in the fullscreen state) and e2e
   (`AxeBuilder` with the stage up, the `:2095` shape). Tab order in fullscreen: Exit fullscreen →
   Play/Pause → Next cycle → Stop & reset, nothing else reachable (the header is gone, the sidebar
   is gone).

8. **The HUD's compact pieces are SHARED, not copied (spec §8's "compact variants"; the 3-14
   deferred entry "The compact variant question for Story 3.18 / 4.15").**
   - `<TransportControls>` (new `simulation/TransportControls.tsx`, FD7): the `<Transport
     role="group" aria-label="Simulation controls">` cluster with its three buttons, `Icon`,
     `barButtonBase` and every comment on them, LIFTED out of `SimulationControlBar.tsx:47-217`;
     props = `SimulationControlBarProps` (re-exported or imported as a type — one declaration).
     `<SimulationControlBar>` becomes `<Bar><TransportControls {...props} /></Bar>` and
     **`SimulationControlBar.test.tsx` passes UNCHANGED** (the 3.16 `<LadderSlider>` refactor-proof:
     same DOM, same ARIA, same styles). The two never coexist (the bar unmounts in fullscreen), so
     `getByRole('group', { name: 'Simulation controls' })` stays unique on the page.
   - `<CycleDigits>` (new `simulation/CycleDigits.tsx`, FD8): `CYCLE_DIGITS`, the `aria-hidden`
     padding span and the digits text, lifted out of `CycleCounter.tsx:38-56` with the FD6 comment;
     `<CycleCounter>` renders `<Counter><Value><CycleDigits cycle={cycle} /></Value></Counter>` and
     **`CycleCounter.test.tsx` passes UNCHANGED**.
   - `<PopulationPills>` (new `simulation/PopulationPills.tsx`; the 3-14 entry's recommendation —
     a SIBLING, ❌ no `compact`/`variant` prop on `<PopulationStats>`): `{ entries: readonly
     PopulationEntry[] }` rendered in the hook's order; a `<ul aria-label="Population">` of `<li>`
     pills (`.hud-pop-pill`: `inline-flex; gap: 6px; 12px/600/tabular-nums`), each = the shared
     `<Swatch>` (10×10, `1px solid` in the identity shade, hollow when extinct — `aria-hidden`) +
     `<VisuallyHidden>{entry.name}</VisuallyHidden>` + the count (`toLocaleString('en-US')`, the
     3.14 rule) + the shared `<Skull role="img" aria-label="extinct">` when extinct. Colour arrives
     ONLY on the swatch via `displayColor(entry.colorToken, MAX_AGE_SHADE)` as an inline `style`
     (3.14 FD4: never on the text — the mockup's coloured `.hud-pop-pill` text is the same open
     contrast question the 3-14 entry records); extinct text steps to `--gol-text-secondary` via
     `data-extinct`, ❌ never `opacity: 0.4` (3.14 FD2 — axe folds opacity into the foreground).
     Empty roster → nothing (the HUD group is omitted; the sidebar's "No organisms in this battle"
     copy is the sidebar's). `Swatch` and `Skull` are exported from `PopulationStats.tsx` (named
     exports) or lifted into a small `populationGlyphs.tsx` beside it — the dev's call; the
     constraint is ONE definition of the hollow-swatch and skull pattern, and
     **`PopulationStats.test.tsx` passes UNCHANGED**. Tests (`PopulationPills.test.tsx`): order
     preserved (an unsorted input is NOT re-sorted), the accessible name of each item is
     `${name} ${count}` (+ `extinct`), swatch hollow + skull on an extinct entry, `1,234` grouping,
     no `list` when empty, axe clean.
   - `<VisuallyHidden>` (FD5): promoted from `editor/GridSettingsSection.tsx:146-153` to
     `apps/web/components/VisuallyHidden.tsx` (an app-wide primitive beside `PetriDishCanvas.tsx`),
     with `<GridSettingsSection>` importing it — `simulation/` must not import from `editor/`
     (`simulation/README.md`), and a second copy is the drift the README warns about. `tsc` proves
     the move; `GridSettingsSection.test.tsx` passes unchanged.

9. **Nothing per cycle reaches React; no animation runs during steps; the budgets hold (NFR-1.1,
   AR-29, RFC-003, AR-35).** The HUD reads `sim.cycle` / `sim.population` / `sim.genPerSec` — the
   same ≤ 10 Hz published values the sidebar reads (M2); `handlePlayPause`'s deps stay
   `[status, play, pause]` (3.12's per-publish-churn lesson — ❌ never `[sim]`); no `useMemo` on
   `totalLiving`-style render expressions; no `transition`, `animation`, `backdrop-filter` or
   `box-shadow` on anything over the dish (FD4) *(FD4 (b): the dish box ITSELF wears the static
   `--gol-shadow-dish-glow`; nothing floating over the dish has a shadow, blur or transition)*.
   `bench:check` is unaffected (no engine change —
   report the number anyway). **Bundle:** every new module (`FullscreenStage`, `PopulationPills`,
   `TransportControls`, `CycleDigits`) is imported ONLY from files inside the Run chunk
   (`BattleSimulationView.tsx`, `SimulationControlBar.tsx`, `CycleCounter.tsx`) — a static import
   from `BattlePage.tsx` or `BattleHeader.tsx` would pull it into `/battle`'s first-load payload
   (trap 14). What DOES land in first-load: the header's button + styles, the page's state cell,
   two callbacks, one ref, one effect, and `VisuallyHidden.tsx` as its own module. `/battle` is at
   **308.9 KB against 310 (1.1 KB headroom)** after 3.17; report `/`, `/battle`, `/battle/new`,
   `/organisms` after `npm run build:standalone && npm run bundle:check`, and the Run chunk's size
   (grep the built chunks for `"Exit fullscreen"`, the 3.16/3.17 idiom with `"Grid dimensions"`).
   If `/battle` reddens, the documented next mechanism is splitting `PetriDishCanvas`'s variants
   into their own modules (`deferred-work.md`, 3-11 section, first entry) — **never a threshold
   move** (Sidiar's ratchet rule) — and because that touches a file Stories 4.14/4.15 will import,
   say so prominently in the Dev Agent Record so the reviewer can propose a lane gate.

10. **End to end in a real browser (e2e).** New `test.describe('Fullscreen run stage (Story
    3.18)')` in `battleRoute.spec.ts` using the module-scope helpers (`runButton`, `labButton`,
    `dish`, `sidebarHeadings`, `collectErrors`, `seedWorkspace`, `distinctColorCount`), plus two
    new module-scope locators `fullscreenButton = (page) => page.getByRole('button', { name:
    'Fullscreen', exact: true })` and `exitFullscreenButton = (page) => page.getByRole('button', {
    name: 'Exit fullscreen', exact: true })` (`exact` because Playwright's `{ name }` is a substring
    match — 3.17 Trap 4; `Fullscreen` is a substring of `Exit fullscreen`, case-insensitively):
    (a) seed → `/battle?id=${battleA}` → RUN → `fullscreenButton` visible and enabled; measure
    `dish(page).boundingBox()` → click it → `[data-fullscreen="true"]`, the `Mode` group has count
    0, `sidebarHeadings` count 0, `getByRole('complementary')` count 0, one `<h1>` reading
    `Three-Way Skirmish`, `Exit fullscreen` focused (`toBeFocused()`), the dish visible with
    `distinctColorCount > 2` (still painted — the re-layout repainted `lastGrid`), its new box
    strictly wider AND taller than before and inside the viewport, `getByRole('main')` count 1;
    axe clean; click `Exit fullscreen` → `[data-fullscreen="false"]`, `fullscreenButton` focused,
    the four Run headings back, `Back to Battles` once, the dish box back to (approximately) its
    earlier size; clean console. (b) RUN → `Play` → `expect.poll(data-cycle) > 0` → enter
    fullscreen → `data-status` `playing` and `expect.poll` shows `data-cycle` still climbing →
    `Pause` from the HUD (the accessible name flips to `Play`) → exit → the sidebar's cycle counter
    text equals `data-cycle`. (c) speed 20 via the sidebar slider (`ArrowRight` presses, the 3.13
    idiom) + Grid Size 150×90 (paused) → enter → HUD reads `20 gen/s`, the dish's `aria-label` is
    `Petri dish, 150 by 90 cells` → exit → both sliders still read those values. (d) keyboard: from
    the focused Exit button, Tab → Play, Tab → Next cycle, Tab → Stop & reset
    (`browserName === 'webkit' ? 'Alt+Tab' : 'Tab'`, the 3.13/3.16 idiom — it only matters if the
    block is run on webkit locally; `ci:dev` is Chromium). (e) a Gallery Run entry
    (`?mode=run`) shows the Fullscreen button on first render. Run the block on `chromium` with
    `--workers=1` on a PRIVATE port (the `reuseExistingServer` hazard is still live with lane 4
    open in another worktree).

11. **Comments are made true; bookkeeping is done; the gate holds.** `npm run ci:dev > /tmp/ci-3-18.log
    2>&1; echo $?` — the dev step's gate (Chromium e2e only; the four-browser matrix is CI's job on
    the pushed branch — `project-context.md`, updated by PR #53). Report the REAL exit code and any
    named failure. `spec:check` resolves every ID here and in code. Comments rewritten:
    `BattleHeader.tsx:41-43` (the `gap` "will space Story 3.18's button" → does), `:141` (the prop
    is rendered now, run-only), `BattlePage.tsx:171` ("still absent" → owned here, FD1),
    `BattleSimulationView.tsx:37` ("Deliberately ABSENT … fullscreen (3.18)" → shipped; hotkeys
    3.19 still absent), `SimulationControlBar.tsx:15-17` (the `Pick` prediction → `<TransportControls>`
    is the shared piece), `SpeedControl.tsx:14-16` (the HUD does NOT render `<SpeedControl>` — FD6;
    4.15 may), `PopulationStats.tsx:31-33` (the pills shipped as a sibling), `CycleCounter.tsx`
    head (the digits are shared), `BattleHeader.test.tsx:26-27` and `BattlePage.test.tsx:539-541`
    (the "3.18 still fails here" predictions — the button is Run-only, so the Lab counts hold),
    `BattlePage.test.tsx:2866-2867` (the Run-view count is `within(view)`, and the button is in the
    header — it holds too; say so). `simulation/README.md`: the "What goes here" list names
    `<TransportControls>`, `<CycleDigits>`, `<PopulationPills>` as shared Run-mode pieces (the
    `<LadderSlider>` sentence's shape) and notes `<VisuallyHidden>` lives at `components/` root
    because both `editor/` and `simulation/` render it. `deferred-work.md`: (1) the 2-6 review's
    "stroke's cached geometry goes stale on a mid-stroke SCROLL" entry — its "pick this up in 3.18"
    premise is WRONG and must be re-pointed honestly: fullscreen is Run-only and the edit dish is
    unmounted in Run, so no stroke exists to go stale; next owner is whichever story gives the
    EDITOR a scrolling ancestor containing the dish; (2) the 2-3 review's "dpr² exposure … revisit
    with Story 3.18 if that path introduces a 0-width transition" — confirmed: it does not (no
    `display: none` on the canvas's chain); (3) the 3-14 "compact variant question" — **closed** by
    `<PopulationPills>` (sibling, no prop); (4) the 3-15 "`status` union candidate" — unchanged: the
    HUD renders `status` through `<TransportControls>` exactly as the bar does and shows no reason;
    (5) the 3-11 section's §3.10/§3.11 amendment list gains this story's items (Dev Notes →
    Candidates); (6) a new "Deferred from: Story 3-18-fullscreen-run-stage" section with the
    remaining candidates. `sprint-status.yaml` moves THIS story only (`in-progress` at start,
    `review` at the end) — lane 4 is open in another worktree; its lines must not ride into this
    branch.

## Tasks / Subtasks

- [x] **Task 1 — the shared pieces (AC8)**
  - [x] (a) `apps/web/components/VisuallyHidden.tsx`: the `:146-153` object as a default-exported
    `styled('span')` with a head comment (why it exists app-wide: `editor/` and `simulation/` both
    render it and neither may import the other). `GridSettingsSection.tsx` imports it; delete the
    local copy; `GridSettingsSection.test.tsx` green unchanged.
  - [x] (b) `simulation/TransportControls.tsx`: lift `Transport`, `barButtonBase`, the three
    buttons, `Icon`, and the render from `:172-215` with every comment; props type
    `SimulationControlBarProps` (declare it ONCE — keep it in `SimulationControlBar.tsx` and import
    it as a type, or move it and re-export; no duplicate interface). `SimulationControlBar.tsx`
    keeps `Bar` and its head comment (rewritten per AC11). `SimulationControlBar.test.tsx` green
    unchanged.
  - [x] (c) `simulation/CycleDigits.tsx`: `CYCLE_DIGITS`, the padding computation, the
    `aria-hidden` span + digits, the FD6 comment; `CycleCounter.tsx` renders it inside `Value`.
    `CycleCounter.test.tsx` green unchanged.
  - [x] (d) `Swatch` + `Skull` shared (named exports from `PopulationStats.tsx`, or
    `simulation/populationGlyphs.tsx`); `PopulationStats.test.tsx` green unchanged.

- [x] **Task 2 — `<PopulationPills>` (AC8, AC7)**
  - [x] (a) `simulation/PopulationPills.tsx` per AC8 with a head comment in the `PopulationStats.tsx`
    register (which 3.14 decisions it inherits: FD2 no opacity, FD4 colour on the swatch only, M2
    order from the hook, the `en-US` grouping).
  - [x] (b) `PopulationPills.test.tsx`: the six assertions in AC8 + axe.

- [x] **Task 3 — `<FullscreenStage>` (AC3, AC7)**
  - [x] (a) `simulation/FullscreenStage.tsx` per AC3: `active`, the fragment with three fixed slots
    (comment: reconciliation), `<FullscreenTopOverlay>` and `<FullscreenHUD>` as private children,
    the focus-on-mount effect on the Exit button, every mockup line cited on its styled block
    (the route's convention), FD4's deviations named where they apply (no rgba, no
    backdrop-filter, no gradient, no glow, in-flow rows) *— superseded 2026-09-18 by FD4 (b): no
    rgba literal, no `backdrop-filter`, no `transition`; floating rows, gradient and glow as tokens*.
  - [x] (b) `FullscreenStage.test.tsx` per AC3's test list.

- [x] **Task 4 — the view (AC4, AC5, AC9)**
  - [x] (a) `BattleSimulationView.tsx`: props `fullscreen: boolean`, `onExitFullscreen(): void`,
    `battleTitle: string` with doc comments (spec §3.11 amendment candidates — the owner is
    `<BattlePage>`, FD1); `data-fullscreen` on the root; the `[data-fullscreen="true"] &` rules on
    `SimulationLayout` / `GridContainer` / `PetriDishBox`; the sidebar slot; `<FullscreenStage
    active={fullscreen} battleTitle={battleTitle} onExit={onExitFullscreen} hud={{ cycle: sim.cycle,
    population: sim.population, genPerSec: sim.genPerSec }} transport={{ status: sim.status,
    onPlayPause: handlePlayPause, onStep: sim.step, onStop: sim.stop }}>` around the unchanged dish
    wrappers; the bar slot. The `hud` / `transport` literals are fresh per render ON PURPOSE (the
    view re-renders per publish regardless — 3.12's memo lesson; say so). Head comment rewritten.
  - [x] (b) `BattleSimulationView.test.tsx`: extend `view()`; the AC4 (a)(b)(c) and AC5 (a)–(d)
    tests; the existing "four buttons / four h2s / two sliders" counts are unchanged in the
    chassis state.

- [x] **Task 5 — the header (AC1)**
  - [x] (a) `BattleHeader.tsx`: `FullscreenButton` styled block (mockup `:97-114` cited), rendered
    per AC1 before `<ModeToggle>`, `data-enter-fullscreen=""`, the glyph span; the two comment
    rewrites.
  - [x] (b) `BattleHeader.test.tsx`: the three cases + axe; the `:26-27` comment.

- [x] **Task 6 — the page (AC2, AC6, AC7)**
  - [x] (a) `BattlePage.tsx`: the state cell, `inFullscreen`, the two callbacks, the ref + restore
    effect (AC6), the two writer resets (AC2), the conditional header, the three new view props;
    the `:171` comment.
  - [x] (b) `BattlePage.test.tsx`: the new describe per AC2 (a)–(c) and AC6/AC7's focus and single-h1
    assertions; axe in the fullscreen state. `BattlePage.modeToggle.test.tsx`: the three props in
    every prop-equality assertion (`renderSkirmish` / `renderSkirmishInRun`), plus one case that
    drives the mocked view's `onExitFullscreen` and asserts the header remounts.

- [x] **Task 7 — e2e (AC10)**
  - [x] (a) `battleRoute.spec.ts`: the two locators beside `runLink` (`:159-166`) with the Trap 4
    comment; the 3.18 `test.describe` with tests (a)–(e); `page.setViewportSize` is NOT needed —
    the default 1280×720 project is the tier under test.
  - [x] (b) Run `battleRoute.spec.ts`'s 3.11–3.18 blocks on `--project=chromium --workers=1` on a
    private port (revert the port before commit).

- [x] **Task 8 — comments made true, bookkeeping, the gate (AC9, AC11)**
  - [x] (a) The comment rewrites listed in AC11; `grep -rn "3\.18\|3-18" apps/web/components
    apps/web/lib apps/web/e2e` — every "will" / "Story 3.18's" sentence reads as present or stays
    only where true as history (`PetriDishCanvas.tsx:895-896`, `useSimulation.ts:54`,
    `gridRenderer.ts:639-640` are history and stay).
  - [x] (b) `simulation/README.md` and `deferred-work.md` per AC11 (1)–(6).
  - [x] (c) `npm run build:standalone && npm run bundle:check` — the four route numbers + the Run
    chunk; `npm run ci:dev > /tmp/ci-3-18.log 2>&1; echo $?` — the real exit code.
  - [x] (d) `sprint-status.yaml`: this story's line only. Dev Agent Record: FD1–FD9 options taken
    and why; the bundle numbers (all four routes, deltas vs 3.17's 333.6 / 308.9 / 308.7 / 295.4);
    the `ci:dev` exit code; which e2e project ran on which port.

### Review Findings

Reviewed 2026-09-17 on **Fable** (`claude-fable-5-1`) against the Opus implementation (`81519e6`),
via three parallel layers (Blind Hunter / Edge Case Hunter / Acceptance Auditor) plus the
reviewer's own read of the diff. Triage: 2 `decision-needed`, 8 `patch`, 3 `defer`, 16 dismissed.
Auditor: no AC violation or missing behaviour. Local `npm run ci:dev` on the review checkout: exit 0
(185 Chromium e2e passed, bench 7.774 ms, `/battle` 309.1 KB — the Dev Agent Record's numbers
reproduce). The fullscreen dish was re-measured against the built export: **924×553 at 1280×720,
1114×667 at 1194×834** (canvas box; the bordered `PetriDishBox` is 928×557 / 1118×671).
Decisions below are left for the owner; nothing in them was resolved by the reviewer.

- [x] [Review][Decision] **Fullscreen can be entered while the Run chunk is still loading — a
  headerless "Loading simulation…" page with no Exit until the chunk resolves** — `<BattleHeader>`
  renders the Fullscreen button from `mode === 'run'` alone, and AC2 (c) / AC10 (e) pin it on the
  FIRST header render, i.e. while `dynamic()` is still fetching `BattleSimulationView` (first
  Lab→Run toggle, every Gallery `?mode=run` entry on a cold cache). A click in that window sets
  `fullscreen=true` → the header unmounts → the page is `<Root>` + `RunLoading`; focus drops to
  `<body>`; the stage (with Exit) appears only when the chunk lands. Options: **(a)** accept and
  record — the window is one chunk fetch, cached thereafter, and the stage self-heals on arrival;
  add a `RunLoading`-visible note or nothing; **(b)** gate the entry on the view being mounted
  (`onEnterFullscreen={runViewMounted ? … : undefined}` via a mount/unmount callback from the
  view, or a `Suspense`-driven flag) — this REVERSES AC2 (c) / AC10 (e) ("button on the first
  header render") and adds a state cell to `<BattlePage>`; **(c)** keep the header mounted until
  `<FullscreenStage>` reports `active` — contradicts FD9's unmount-on-entry and the single-h1
  invariant for one commit. A rejected chunk import is pre-existing behaviour (no `error.tsx`, by
  story) and is not made worse here. [`BattlePage.tsx` `handleEnterFullscreen`;
  `BattleHeader.tsx` `showFullscreen`]
  **Owner decision (2026-09-18): (a) — accept and record.** No code change. Record the window in
  `deferred-work.md` (this story's section) as a known, self-healing, cold-cache-only state, with
  option (b) named as the fix if it ever matters; then check this item. — **Applied 2026-09-18:**
  recorded as the first entry of the 3-18 code-review section in `deferred-work.md`; no code.
- [x] [Review][Decision] **A pointer double-click on `Exit fullscreen` lands its second click on
  the header's `Lab` button, which remounts under the pointer** — Exit sits at roughly
  y∈[12,43], x∈[W−184, W−24] (TopOverlay `12px 24px`, button `8px 16px`); the header remounts on
  the first click's commit with the Mode group at y∈[20,51], x∈[W−156, W−30], `Lab` its left
  half. The second `click` of a double-click fires on `Lab` → `handleModeToggle('lab')` → the Run
  view unmounts and the session (cycle, ephemeral size) is dropped. `handleModeToggle` checks only
  `savingRef`. Same class as the rule-delete ✕ double-click cascade already on `deferred-work.md`
  (Story 4.26's target). Options: **(a)** accept and record beside the 4.26 entry (a double-click
  on a toggle-shaped button is unusual, and Lab is one click away from Run again); **(b)** ignore
  `click` with `event.detail > 1` on `ModeButton` — touches 3.11's toggle, one line, and needs a
  test in `BattleHeader.test.tsx`; **(c)** reposition Exit (left side of the overlay) so nothing
  interactive remounts beneath it — a mockup deviation on top of FD4's. Not patched: (b) and (c)
  both reach a surface the story did not own, and the fix shape is the owner's.
  [`FullscreenStage.tsx` `ExitButton`; `BattleHeader.tsx` `ModeToggle`]
  **Owner decision (2026-09-18): (b) — ignore repeat clicks on the mode toggle.** In
  `BattleHeader.tsx`'s `ModeButton` click handling, return early when `event.detail > 1` (the
  second and later clicks of a pointer multi-click; keyboard-synthesised clicks carry `detail ===
  0` and must still fire). Comment WHY (the Exit → Lab remount geometry, this decision). Add a test
  in `BattleHeader.test.tsx`: a click with `detail: 2` does not call `onModeToggle`, a plain click
  and a keyboard activation still do. Then check this item. — **Applied 2026-09-18:** both
  `ModeButton`s share a `toggleTo(next)` handler that returns on `event.detail > 1` (and on the
  already-active mode, as before), commented with the Exit → Lab remount geometry; the test
  dispatches `detail: 2` (no call), `detail: 1` (one call) and `Enter` via user-event (a second
  call, `'lab'`).
- [x] [Review][Patch] `GridContainer`'s fullscreen comment states a 544px-tall dish; the measured
  value (Dev Agent Record, `deferred-work.md`, and re-measured here) is 553px
  [`apps/web/components/battle/simulation/BattleSimulationView.tsx` `GridContainer`] — applied.
- [x] [Review][Patch] The Lab-round-trip test's comment claims "the rule is still exercised
  through `handleModeToggle`"; by then `fullscreen` is already `false` (Exit cleared it), so that
  clear is a no-op in the test and both AC2 clears are defensive-only today (the header is
  unmounted while the stage is up; the in-render adjust needs a roster that goes dangling under a
  mounted page, Stories 4.24/4.25). Comment rewritten to what the test proves; the guards stay
  (AC2 mandates them) [`apps/web/components/battle/BattlePage.test.tsx` "re-enters Run in the
  chassis"] — applied.
- [x] [Review][Patch] The restore effect's comment says "under `<StrictMode>` the effect
  double-runs and the ref is cleared on the first pass" — StrictMode double-invokes effects on
  MOUNT only, where `inFullscreen` is `false` and the ref is `false`; a dependency change runs
  once. Sentence rewritten [`apps/web/components/battle/BattlePage.tsx` restore effect] — applied.
- [x] [Review][Patch] `onEnterFullscreen`'s JSDoc omits that the button lives inside the toggle's
  `<Actions>` cluster, so `mode` + `onModeToggle` are preconditions too (Run mode + the handler
  WITHOUT `onModeToggle` renders nothing). Documented [`apps/web/components/battle/BattleHeader.tsx`
  props] — applied.
- [x] [Review][Patch] `<PopulationPills>`'s head comment claims each `<li>`'s "accessible name" is
  `${name} ${count}`; `listitem` is not a name-from-content role (its own test says so). Reworded
  to what assistive technology reads [`apps/web/components/battle/simulation/PopulationPills.tsx`]
  — applied.
- [x] [Review][Patch] The shared `Skull` glyph carried `<PopulationStats>`'s `marginLeft: 5px`, so
  the HUD skull sat 11px off its count (5px + the pill's 6px `gap`). Margin moved to the row host
  (`RowSkull = styled(Skull)` in `PopulationStats.tsx`), the glyph is spacing-free
  [`apps/web/components/battle/simulation/populationGlyphs.tsx`, `PopulationStats.tsx`] — applied.
- [x] [Review][Patch] `Pills` never wraps: past ~20 organisms at 1280px the pill row exceeds the
  panel's `94vw`, the centred `HudRow` overflows both edges, and the leftmost pills are clipped
  off-viewport with no scroll (the stage root is `position: fixed`). `flexWrap: 'wrap'` +
  `justifyContent: 'center'` on `Pills` — the panel's own overflow policy, extended to the pills
  [`apps/web/components/battle/simulation/PopulationPills.tsx` `Pills`] — applied.
- [x] [Review][Patch] `simulation/README.md` says 4.15 is "the third consumer of all three"; the
  pills have ONE consumer today (`deferred-work.md` has it right: "second of the pills"); and the
  3-18 deferred section says "diverges in five places" over four numbered items. Both reworded
  [`apps/web/components/battle/simulation/README.md`, `docs/implementation-artifacts/deferred-work.md`]
  — applied.
- [x] [Review][Defer] The in-render roster adjust exits fullscreen without a focus restore: it
  clears the cell without setting `restoreFullscreenEntryFocusRef`, and `[data-enter-fullscreen]`
  does not exist in Lab anyway, so the stage's Exit button unmounts and focus lands on `<body>`
  [`apps/web/components/battle/BattlePage.tsx` in-render adjust] — deferred: unreachable until a
  library change can land under a mounted page (Stories 4.24/4.25, the case the adjust was written
  for); recorded in `deferred-work.md` for that owner.
- [x] [Review][Defer] A held `Enter` auto-repeats `click` on every `keydown`, and each commit moves
  focus to the counterpart control (Exit on entry, Fullscreen on exit), so the stage toggles at
  key-repeat rate, each cycle driving a `renderer.resize` repaint; no `event.repeat` guard
  [`BattleHeader.tsx` `FullscreenButton`, `FullscreenStage.tsx` Exit] — deferred: a property of
  every focus-handoff pair in the app, harmless to the run (the loop is untouched), and a guard is
  a route-wide keyboard policy (Story 6.11's sweep), not this story's; recorded in
  `deferred-work.md`.
- [x] [Review][Defer] No floor on the fullscreen dish height: the title row and HUD take height
  first and the height-driven box gets the remainder, so a short viewport (or a HUD that wraps to
  several lines with a wide roster) shrinks the dish toward 0px; `applyDevicePixelSizing`'s
  `clientHeight || authoredHeight` fallback keeps it from crashing
  [`apps/web/components/battle/simulation/BattleSimulationView.tsx` `GridContainer` /
  `PetriDishBox`] — deferred: both supported tiers (NFR-3.1, ≥1024 wide; measured 1280×720 and
  1194×834) are fine; a `minHeight` or a scrolling stage column is a design value for the mockup
  refresh; recorded in `deferred-work.md`. **Closed 2026-09-18 by the FD4 (b) override**: the dish
  is `min(94vw, 138vh)`, a function of the viewport alone; what remains (the fixed HUD covering
  more of the dish on a short viewport or under a wide, wrapped roster) is in the closed entry.

#### Second review (2026-09-18)

Reviewed 2026-09-18 on **Fable** (`claude-fable-5-1`) against the Opus commits since the first
review (`92ea1e7` FD4 (a) → (b); `61e4b3b` / `f43176c` — the owner's two decisions applied), plus a
re-read of the full diff; the same three parallel layers. Triage: 1 `decision-needed`, 9 `patch`,
2 `defer`, 12 dismissed. **The two first-review decisions are applied to intent**: (1) recorded in
`deferred-work.md` with option (b) named, no code; (2) `toggleTo` returns on `event.detail > 1`, and
the test's `Enter` really dispatches `detail: 0` under user-event 14.6.1 (`keypress.js` →
`dispatchUIEvent(target, 'click')` with no `detail`). The no-`z-index` stacking claim was verified
on the tree: nothing under `SimulationLayout` carries `position` / `transform` / `filter` /
`contain`, so the fixed overlays paint above the dish by DOM order alone. CI: `61e4b3b` green
(quality + e2e, all four projects); `f43176c` — HEAD and the PR head — triggered **no run**
(`actions/runs?head_sha=` → 0), so the review commit's push is the first run on this content.

- [x] [Review][Decision] **HUD text falls under AA where the HUD overlaps a bright colony** — FD4
  (b)'s reason (2) says the 0.82 `bg-secondary` surface "visually dominates whatever cells lie under
  it"; the arithmetic says otherwise for the weakest gated token. `--gol-surface-hud` is
  `rgb(26 26 26 / 0.82)`, so 18% of the cell colour composes through. `HudLabel` (10px) and the
  extinct pill (12px) are `--gol-text-secondary` (`#999999`): on plain `bg-secondary` the pair is
  6.1:1 (the gated row in `themeTokens.test.ts`); over the palette's yellow `#F0E442` the composite
  is ≈ `rgb(64 62 33)` and the pair is **3.8:1**, ≈3.5:1 over a near-white shade, ≈4.2:1 over the
  accent cyan — under WCAG AA's 4.5:1 for text this size (NFR-8.3 names the default theme as the
  AA-guaranteed one). The label band IS over cells on the tablet tier (1194×834: the dish's bottom
  edge is 80px from the viewport bottom, the HUD spans ≈40–102px, its text centre ≈71px) and within
  a few px of them at 1280×720; axe reports the pair `incomplete`, so no gate sees it. Options:
  **(a)** accept as the mockup's own property — record it under the FD4 override and in
  `deferred-work.md`; **(b)** raise `--gol-surface-hud` to `/ 0.92` (composite over yellow ≈
  `rgb(43 42 29)` → 5.1:1 for text-secondary; the panel still reads translucent; the Exit button
  shares the token); **(c)** keep 0.82 and lift the HUD's two `--gol-text-secondary` uses
  (`HudLabel`, the extinct pill) to `--gol-text-primary` (≈11:1 over yellow) — the mockup's
  `.hud-label` is `#999`, so this is a visible deviation. Not patched: (b) changes an owner-chosen
  value, (c) changes the mockup's typography, (a) records a known AA miss — the owner's call.
  [`apps/web/app/themes.css` `--gol-surface-hud`; `FullscreenStage.tsx` `HudLabel`;
  `PopulationPills.tsx` `Pill[data-extinct]`]
  **Owner decision (2026-09-18): (d) — no alpha on the HUD surface.** The mockup's HUD reads as a
  slightly-grey opaque panel; make it exactly that: `HudPanel` and `ExitButton` in
  `FullscreenStage.tsx` take `background: var(--gol-bg-secondary)` (opaque, the mockup's
  `--bg-secondary`), and the `--gol-surface-hud` token is REMOVED from `themes.css` (no other
  consumer; its comment block shrinks to the two tokens that remain, `--gol-scrim-top` and
  `--gol-shadow-dish-glow`). Text on the panel is then the gated `themeTokens.test.ts` pair
  (6.1:1) wherever the panel sits — the contrast question is gone, not tuned. The scrim and the
  glow are unchanged. Update the FD4 override paragraph, the file-header comment in
  `FullscreenStage.tsx` and the `deferred-work.md` mockup-refresh line that name three tokens
  (now two); re-run the gates; then check this item.
- [x] [Review][Patch] Story text still says `themes.css` is untouched in five places (Story
  section, Dev Notes constraints, What NOT to build, Project Structure "Not touched", Dev Agent
  Record "For the reviewer") and the File List omits it — it is a shared-lane file (4.2 / 4.6 / 4.10
  appended tokens; the new block sits directly above 4.10's), so a lane-4 token append is an
  adjacent-hunk merge conflict the reviewer note should name
  [`docs/implementation-artifacts/3-18-fullscreen-run-stage.md:37-40, 547-554, 843-845, 938-939,
  1119-1121, 1138-1156`]
- [x] [Review][Patch] AC3 (Exit `transparent`, HUD "in flow" on `--gol-bg-secondary`), AC4
  (`padding: 20px 24px`, `width: auto; height: 100%`, invariant (i) "dish between them"), AC9 (no
  `box-shadow`) and Task 3 (a) ("no glow, in-flow rows") still describe FD4 (a); the FD4 override's
  "What shipped" omits the Exit button's `--gol-surface-hud` surface (the mockup's `rgba(0,0,0,.4)`)
  [`docs/implementation-artifacts/3-18-fullscreen-run-stage.md:106-114, 145-152, 274-275, 378-379,
  675-677`]
- [x] [Review][Patch] The first review's `[Defer]` "No floor on the fullscreen dish height" reads
  as open while `deferred-work.md` closes it under FD4 (b)
  [`docs/implementation-artifacts/3-18-fullscreen-run-stage.md:534-541`]
- [x] [Review][Patch] The proposed lane-gate row says 4.15 is "the third consumer of all three";
  the first review corrected README / `deferred-work.md` to third of `<TransportControls>` /
  `<CycleDigits>`, second of the pills [`docs/implementation-artifacts/3-18-fullscreen-run-stage.md`
  `Proposed lane gate`]
- [x] [Review][Patch] Head comments describe the in-flow layout: "the dish box becomes
  height-driven" / "a title row above the dish, a HUD below it"
  [`apps/web/components/battle/simulation/BattleSimulationView.tsx:62`;
  `apps/web/components/battle/simulation/FullscreenStage.tsx:11-12`]
- [x] [Review][Patch] `Pills` comment: "the HUD grows and the height-driven dish gives up the
  difference" cites a closed entry; with a fixed HUD a wrapped roster grows UPWARD over the dish
  (255 organisms ≈ 14 pill lines ≈ 370px over a 596px dish at 1280×720) — recorded nowhere
  [`apps/web/components/battle/simulation/PopulationPills.tsx:45-46`; `deferred-work.md` closed
  "no floor" entry]
- [x] [Review][Patch] Decision-2 comment's geometry is pre-FD4 (b): "Exit ≈ y 12–43" came from
  `12px` padding; shipped `18px` → Exit ≈ y 18–49 (the overlap with `Lab` at y 20–51 still holds)
  [`apps/web/components/battle/BattleHeader.tsx:199-204`]
- [x] [Review][Patch] "the top bar's scrim overlaps its top edge on none of the supported ones" is
  false at 1280×720: the dish top is at 8.6vh ≈ 62px and the bar ≈ 67px (18 + ~31 + 18), so the
  gradient's last ~5px (≈0.07 alpha) cross the edge; and the `ExitButton` contrast sentence names
  `--gol-bg-primary` as the button's ground while its surface is now `--gol-surface-hud`
  [`apps/web/components/battle/simulation/BattleSimulationView.tsx:199-201`;
  `apps/web/components/battle/simulation/FullscreenStage.tsx:133-138`]
- [x] [Review][Patch] `deferred-work.md`'s dpr² entry says the swap yields "a height-driven dish
  box" [`docs/implementation-artifacts/deferred-work.md:200`]
- [x] [Review][Defer] Decision 2 (b)'s residuals: the header's Fullscreen button (right edge ≈
  W−171) and the stage's Exit (x W−184..W−24, y 18–49 vs 20–51) overlap by ≈13px across the swap
  and neither carries the `detail` guard (a double-click there enters and exits, or exits and
  re-enters — two layout swaps, no session drop); iOS WebKit synthesises each tap's `click` with
  `detail: 1`, so a touch double-tap on Exit still reaches `Lab` on an iPad (the `tablet` Playwright
  project is desktop WebKit and cannot see it); and no browser test delivers a real cross-target
  `detail: 2` (the unit test proves the `if`, not the UA's click-count policy)
  [`apps/web/components/battle/BattleHeader.tsx` `FullscreenButton` / `toggleTo`;
  `apps/web/components/battle/simulation/FullscreenStage.tsx` `ExitButton`] — deferred: the owner
  scoped the fix to the mode toggle; recorded in `deferred-work.md`.
- [x] [Review][Defer] A third `VisuallyHidden` copy lives in lane 4's
  `organisms/editor/ColorPickerField.tsx` ("The `GridSettingsSection.tsx` copy") — FD5 (a)'s
  drift, in a file this story may not touch
  [`apps/web/components/organisms/editor/ColorPickerField.tsx:226-234`] — deferred, pre-existing
  (lane 4 surface); pointer recorded in `deferred-work.md` for the next `organisms/editor` story.

#### Third review (2026-09-18)

Reviewed 2026-09-18 on **Fable** (`claude-fable-5-1`) against the commits since the second review
(`d0bb0f1` sync with `main` after #56; `eb22490` / `209f3e6` — the owner's decision (d) applied),
plus a re-read of the full diff against `main`; the same three parallel layers. Triage: 0
`decision-needed`, 4 `patch`, 0 `defer`, 4 dismissed. Decision (d) is applied to intent in code
(`HudPanel` / `ExitButton` on `var(--gol-bg-secondary)`, `--gol-surface-hud` gone with no consumer
left in either lane's tree, `themeTokens.test.ts`'s undefined-token sweep green) and in the three
doc targets its paragraph named; the e2e count moving 185 → 193 and `/battle` 309.1 → 309.2 KB are
the merge's (4.11's eight net `organisms.spec.ts` tests; `@gol/domain`'s exported enums in every
route's first-load), not this story's. The SC 1.4.11 reasoning on `ExitButton` holds with the
opaque fill: `--gol-border-control` is a gated row against both `bg-primary` (outside, the scrim's
channel) and `bg-secondary` (inside). CI for `209f3e6`: see the Change Log line.

- [x] [Review][Patch] The story still stated "three tokens" as current fact in six places the
  decision-(d) pass did not reach (the Story-section italic, the Dev Notes constraint italic, two
  What-NOT-to-build italics — one also saying "the bundle stayed at 309.1 KB" — the Project
  Structure "Not touched" line and the Debug Log's FD4 summary)
  [`docs/implementation-artifacts/3-18-fullscreen-run-stage.md:41, 670, 960, 967, 1061, 1151`]
- [x] [Review][Patch] `deferred-work.md`'s second-review preamble still announced the HUD-contrast
  `decision-needed` item as open in the story file [`docs/implementation-artifacts/deferred-work.md:1755-1757`]
- [x] [Review][Patch] The HUD/dish overlap figures were swapped between the two tiers: the dish is
  `min(94vw, 138vh)` at 5:3, so at 1280×720 height binds (596px tall, bottom edge 62px up) and at
  1194×834 width binds (673px tall, edge ≈80px up); the panel spans ≈40–103px → ≈41px and ≈23px,
  not "≈22px at 1280×720, ≈40px at 1194×834"; `deferred-work.md`'s "~33px at 1280×720" matched
  neither. With the panel now opaque the figure is the band of cells hidden, not dimmed
  [`apps/web/components/battle/simulation/BattleSimulationView.tsx:200`;
  `docs/implementation-artifacts/3-18-fullscreen-run-stage.md:162`;
  `docs/implementation-artifacts/deferred-work.md:1738`]
- [x] [Review][Patch] `themes.css`'s block comment called the scrim and the glow "these two
  surfaces" — the glow is a `box-shadow` [`apps/web/app/themes.css:147`]

## Dev Notes

### Constraints the developer MUST follow

- **Scope: one header button, one state cell + focus restore in the page, three view props + the
  fixed-slot swap, one new stage component, three shared pieces lifted out of existing files, one
  primitive promoted, tests, comments, bookkeeping.** ❌ No change to `PetriDishCanvas.tsx`,
  `useSimulation.ts`, `gridRenderer.ts`, `playbackRenderer.ts`, `LadderSlider.tsx`,
  `SpeedControl.tsx` (comment only), `GridSizeControl.tsx`, `SidebarFooter.tsx`, `useLeaveGuard.ts`,
  `themes.css`, `check-bundle-size.mjs`, any route file, anything in `packages/**`, anything in
  `components/organisms/**` / `lib/organisms/**` (lane 4 — the 3.17 review reverted exactly such a
  touch). *(`themes.css`: superseded 2026-09-18 by the FD4 override — two tokens appended; the third,
  `--gol-surface-hud`, was removed by second-review decision (d).)*
- **Hot state stays in refs (RFC-005 Decision 5, AR-29).** The swap is CSS + reconciliation. No
  effect watches `fullscreen` in the view; the ONLY effects this story adds are the two focus moves
  (an `.focus()` call is not state). Nothing new runs per cycle; the HUD is a reader of the ≤ 10 Hz
  publish (M2).
- **The layout swap is a reconciliation invariant, not a styling preference.** Same component types
  at the same child positions above the canvas in both states; `false` holds a slot; the
  `<FullscreenStage>` fragment has three fixed slots. Pin it with "same canvas node" + "no second
  context" + "`drawFull` count unchanged" (AC4) — the assertions that redden if anyone later
  "tidies" the wrappers.
- **Modes are state, not routes (RFC-005 Decision 3, AR-28).** `fullscreen` is a second local cell
  beside `mode`, never a URL param, never persisted, never in `gol:settings`. `data-mode` is still
  the e2e's handle on the mode; `data-fullscreen` (on the view root) is the new handle on the stage.
- **Repositories are injected, never imported (AR-2, AR-27).** Nothing here touches one.
- **MUI: `styled()` only, tokens only (Decision J, AR-46).** `FUNCTIONAL_COLOUR_PATTERN`
  (`eslint.config.mjs:34`) bans `rgba(…)` in components — the mockup's four rgba surfaces cannot
  ship as literals (trap 4). `--gol-backdrop` (`themes.css:69`) exists but is the dialog scrim;
  do not repurpose it for the HUD.
- **`apps/web` rules:** strict TS, no `any` / `!` / `@ts-ignore`; `react-hooks/refs`,
  `set-state-in-effect`, `exhaustive-deps` live; comments explain WHY and cite by ID —
  `spec:check` reads code AND this file: `NFR-4.1`, `NFR-1.1`, `AR-29`, `AR-46`, `RFC-003`,
  `RFC-005`, `Decision D`, `M2`, `Story 3.14` exactly.
- **Determinism in tests:** the frame driver and `installContexts()` in `BattleSimulationView.test.tsx`;
  the seeded SKIRMISH fixture in `BattlePage.test.tsx`; never a snapshot of the canvas.
- **Commit gate.** The story subagent commits to its own `story/3-18-…` branch; merging is
  Sidiar's. Do not touch epic-4 story files or status lines.

### What this story is, in one paragraph

Every mechanism the stage needs already exists: the header declares the entry prop it never
rendered; the Run chassis owns a dish whose canvas re-fits itself whenever its parent box changes
and whose renderer repaints the last grid at the new pixel size on that same event; the hook
forwards every frame's `drawDiff` to whatever renderer is attached and was written so a re-layout
never rebuilds the loop. What is left is to make the chassis's own wrappers wear a second set of
clothes: a boolean in `<BattlePage>` that the header's `⛶ Fullscreen` sets and the overlay's `Exit
fullscreen` clears; a `data-fullscreen` attribute on the Run view's root that turns the layout into
a fixed, viewport-filling column, unmounts the sidebar and the bottom bar, and lets a
`<FullscreenStage>` — mounted in both states, chrome-rendering in one — put a title row above the
dish and a HUD below it. The dish's wrappers do not move, so React keeps the canvas; the box
changes, so the observer re-fits it; nothing touches the hook, so the run never notices. The HUD's
three compact readings are the sidebar's own pieces lifted out and shared, and the transport is the
bar's own cluster in a second home.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — Where `fullscreen` lives.** Spec §3.11 / §6 say `<BattleSimulationView>`; §3.2 puts the
ENTRY in `<BattleHeader>`, which is `<BattlePage>`'s child, not the view's.
- **(a) `<BattlePage>` owns the cell; the header reports the press; the view receives `fullscreen`
  + `onExitFullscreen`** *(recommended)*. The exact shape 3.11 FD5 (a) already chose for `mode`
  (the spec's `onExitToLab` on the view was dropped because "the header owns the toggle,
  `<BattlePage>` flips `mode`") — one ephemeral cell, one owner, the header unmountable from the
  place that renders it. A §6 amendment candidate (owner column), recorded in `deferred-work.md`.
- **(b) The view owns it and exposes an imperative handle (`useImperativeHandle` / a callback ref)
  the page hands the header.** ❌ A ref-based back-channel between siblings is a new pattern on
  this route for a boolean, and 3.19's `F` toggle would still have to reach the same cell.
- **(c) The view renders its own entry button in the chassis.** ❌ The mockup puts it in the
  header; the header's prop would stay dead forever.
- **(d) A third `mode` value (`'run-fullscreen'`).** ❌ `BattleMode` is the route param's and the
  toggle's type (3.17); widening it leaks fullscreen into `initialModeFromParam`, `data-mode` and
  every `aria-pressed`.

**FD2 — The swap mechanism.**
- **(a) Same tree positions; `data-fullscreen` on the view root + `'[data-fullscreen="true"] &'`
  parent selectors on the existing styled blocks; sidebar and bar leave via `false` slots;
  `<FullscreenStage active>` is always mounted around the unchanged dish wrappers and renders its
  chrome as fixed fragment slots** *(recommended)*. Satisfies §3.14's `children: ReactNode` API
  literally AND §3.11's "never remounted", with the reconciliation argument in ONE commented place.
- **(b) No `<FullscreenStage>` component — `<FullscreenTopOverlay>` and `<FullscreenHUD>` as
  standalone siblings of `<GridContainer>` rendered only while fullscreen.** Acceptable on the
  invariants (three fixed slots in `<SimulationMain>` instead), but a spec §2 name with no file, and
  the `children` API gone. Take it only if (a) proves awkward; record why.
- **(c) A different wrapper component in fullscreen (`<FullscreenStage>` around the canvas only
  while active).** ❌ A new element type above the canvas = unmount + remount of the canvas: the
  renderer is destroyed and rebuilt, `attachRenderer(null)` then `attachRenderer(new)`, a re-prime,
  and one blank frame — exactly what the epic AC forbids. AC4's tests redden on it.
- **(d) `createPortal` the dish into a fullscreen container.** ❌ Switching a subtree between
  portal and non-portal changes its fiber type — the same remount, plus a `document.body` child the
  battle layout's `<main>` no longer contains.
- **(e) Keep the sidebar/bar mounted and `display: none` them.** ❌ Hidden-but-mounted sliders and
  buttons stay in the DOM and the accessibility tree; unmounting is the honest state, and the
  sidebar holds no state of its own to preserve (every value is the hook's).

**FD3 — The browser Fullscreen API.**
- **(a) No `requestFullscreen()` — "fullscreen" is the in-app stage filling the viewport**
  *(recommended)*. Spec §3.11 says "CSS-driven"; the API's own `Escape` exit would desynchronise the
  cell unless a `fullscreenchange` listener mirrored it (a new effect + listener), Story 3.19
  assigns `ESC` to Stop (a direct collision with the browser's exit key), jsdom cannot exercise it
  and Playwright headless cannot observe it, and WebKit needs the prefixed form. The user still has
  F11 / the browser's own fullscreen on top of this stage. A candidate for `deferred-work.md` ("true
  fullscreen" enhancement), not scope.
- **(b) Call `document.documentElement.requestFullscreen()` on enter and `exitFullscreen()` on
  exit.** ❌ For the reasons above; also a permissions/gesture-gated API that fails silently from a
  non-user-initiated call (3.19's `F` from a `keydown` is fine, a programmatic re-entry is not).

**FD4 — Overlay geometry and surfaces.** The mockup floats the top bar (`position: fixed`, a 0.9→0
`rgba` gradient, `pointer-events: none`) and the HUD (`rgba(26,26,26,.82)` + `backdrop-filter:
blur(8px)`) OVER the dish, adds a `box-shadow: 0 0 40px rgba(0,212,255,.12)` glow, and sizes the
dish `min(94vw, 138vh)`.
- **(a) In-flow rows — top overlay / dish / HUD as a flex column; opaque `--gol-bg-primary` stage,
  `--gol-bg-secondary` HUD panel with `--gol-border`; no gradient, no `backdrop-filter`, no glow**
  *(recommended)*. Three reasons, in order: AR-46 bans the four rgba literals and the token layer
  should not grow two translucent surfaces for one screen; text over a translucent panel over
  arbitrary organism cells has NO gate-able contrast (every pair this story uses — accent /
  text-primary / text-secondary on bg-primary / bg-secondary — is already a row in
  `themeTokens.test.ts:66-100`); `backdrop-filter` over a canvas repainting at up to 60 FPS forces
  per-frame recomposition of the region beneath it, which RFC-003's "no UI animation during
  simulation steps" rule exists to keep off the budget (NFR-1.1). The dish is not overlapped, so
  nothing over it needs translucency. Mockup-refresh candidate.
- **(b) Mockup-faithful floating overlays.** ❌ Needs `--gol-surface-translucent` + gradient tokens,
  an axe `incomplete` (or violation) on every HUD scan, and a compositor cost nobody has measured.
  Record the glow and translucency as what the mockup shows and why this route does not reproduce
  it (the 3.14 FD2 shape).
- **OWNER OVERRIDE (2026-09-18): (b), not (a).** Reviewed against the mockup on the built branch,
  (a) made fullscreen read as "the chassis minus its sidebar" — the dish grew 3% at 1280×720
  (924×553 vs 896×517) and the chrome stayed stacked. The three reasons for (a) do not hold:
  (1) AR-46 bans the literal in the component, not the surface — `--gol-shadow-tile-hover` (1.10),
  `--gol-accent-tint` (4.2) and `--gol-shadow-slider-thumb` (4.6) are exactly this, mockup rgba
  composed from the `--gol-*-channel` triplets that exist for the purpose (`themes.css:99-105`);
  (2) axe reports text over a translucent surface as `incomplete`, never a violation, and the HUD's
  0.82 `bg-secondary` surface visually dominates whatever cells lie under it; (3) is real and is
  answered by dropping `backdrop-filter` alone — the floating layout costs nothing per frame. What
  shipped: `.fs-top` and `.fs-hud` `position: fixed` over the dish, the dish `min(94vw, 138vh)`,
  two tokens (`--gol-scrim-top`, `--gol-shadow-dish-glow`) — no blur, no `transition`. Measured:
  **990×592 at 1280×720** (mockup 994×596), **1486×890 at 1920×1080**.
  *(Second-review decision (d), 2026-09-18: the HUD panel and the Exit button are OPAQUE
  `--gol-bg-secondary`, not a translucent token — reason (2) above was wrong for the weakest gated
  pair: 18% of a bright colony composed through the 0.82 surface and put `--gol-text-secondary`
  at ≈3.8:1 over the palette's yellow, under AA. The `--gol-surface-hud` token that shipped with
  (b) was removed; the scrim and the glow are unchanged, so the floating chrome is two tokens.)*

**FD5 — `<VisuallyHidden>`.**
- **(a) Promote `editor/GridSettingsSection.tsx:146-153` to `apps/web/components/VisuallyHidden.tsx`;
  both callers import it** *(recommended)*. Neither `editor/` nor `simulation/` may import the
  other (README); a primitive both render belongs above both, like `<PetriDishCanvas>`. One module
  wrapper (~50 B gzip) lands in `/battle` first-load — noted, not a concern.
- **(b) Copy the six lines into `PopulationPills.tsx`.** Acceptable under the `barButtonBase`
  "repeat rather than tunnel through the wall" precedent (2.13 FD5 (c)), but that precedent was
  about a style OBJECT with route-specific values; this is a generic primitive, and a second copy is
  the drift the README names.

**FD6 — Speed in the HUD.** Spec §3.14 gives `hud.genPerSec` (a value); spec §8 lists
`SpeedControl … fullscreen HUD`; the mockup shows a read-out (`Speed 10 gen/s`, `:171-175`,
`:347-350`); `SpeedControl.tsx:14-16` predicted the HUD renders the slider.
- **(a) A read-out — label + `` `${genPerSec} gen/s` ``** *(recommended)*. §3.14 is the
  component's own spec and agrees with the mockup; a range input floating in a HUD is not what
  either drew; 3.19 adds no speed keys, so a presenter changes speed from the chassis. Rewrite the
  `SpeedControl.tsx` comment (4.15's preview may still render the slider — say so).
- **(b) `<SpeedControl>` in the HUD.** ❌ §8's line reads as "compact variants exist" rather than
  "the HUD has a slider"; a `role="slider"` in the HUD also changes 3.19's hint vocabulary.

**FD7 — Transport in the HUD.**
- **(a) Lift the cluster into `<TransportControls>`; both the bar and the HUD render it; the SAME
  three accessible names** *(recommended)*. One definition of the Play/Pause single-button rule
  (3.12 FD1), the real `disabled` on Step (3.12 FD6), the always-enabled Stop (3.12 FD5) and the
  colour decisions (3.12 FD2). The mockup's shorter HUD labels (`Play`/`Next`/`Stop`) are not
  adopted: accessible names are part of the route's test vocabulary (`getByRole('button', { name:
  'Next cycle' })` in three files) and 3.19's hints name one set of verbs. Mockup-refresh candidate.
- **(b) Render `<SimulationControlBar>` inside the HUD and restyle its `Bar`.** ❌ The bar's chrome
  is a full-width bottom bar with a top border; overriding it from a parent selector is two
  components pretending to be one.
- **(c) Three new buttons in the HUD.** ❌ A second copy of four 3.12 decisions.

**FD8 — The cycle digits.**
- **(a) Lift the padding + digits into `<CycleDigits>`; `<CycleCounter>` and the HUD both render
  it** *(recommended)*. 3.14 FD6's `aria-hidden` padding rule stays one implementation; each host
  owns its own size/colour block (32px in the sidebar, 20px in the HUD).
- **(b) A `size` / `variant` prop on `<CycleCounter>`.** Acceptable — there is a consumer now, so
  the dead-affordance rule does not bite — but the sidebar's `Counter` (centred, padded) is not
  the HUD's inline group; a prop that switches layout AND typography is two components in one.

**FD9 — The header while fullscreen.**
- **(a) Unmount it (`{!inFullscreen && <BattleHeader …/>}`); the overlay's `<h1>` carries the
  title; explicit focus moves on enter and exit** *(recommended)*. The stage covers the header, so a
  mounted header is reachable-but-invisible for keyboard and AT users — the exact shape
  `useInertBackground` was written to prevent for dialogs. Unmounting is the honest state; the
  header holds no state; `data-mode` on `<Root>` is unaffected (it is `<BattlePage>`'s, not the
  header's).
- **(b) Keep it mounted with `inert` + `visibility: hidden`.** ❌ Focus is lost either way (a hidden
  element cannot hold it), so the explicit restore is needed regardless; and two `<h1>`s would
  exist in the DOM, one hidden.

### Traps

1. **React reconciles unkeyed children by POSITION.** `{cond && <A/>}` leaves `false` in the slot;
   `{cond ? <A/> : <B/>}` swaps types in one slot (fine for the bar/HUD, fatal above the canvas).
   Never let a new element TYPE appear between `<SimulationMain>` and `<DishCanvas>` in one state
   only. AC4 (a)'s three assertions are the tripwire.
2. **`PlaybackDish` observes `canvas.parentElement`** (`PetriDishCanvas.tsx:903`) — `PetriDishBox`
   must stay the canvas's direct parent in both states. Its construction is keyed on `cols`/`rows`
   (not the `size` object) precisely so a same-dimension re-render never rebuilds it
   (`:801-806`); an ephemeral 150×90 stays 150×90 across the swap because the dimensions are the
   hook's `liveSize`, unchanged by the layout.
3. **jsdom has no `ResizeObserver`** (`PetriDishCanvas.tsx:901` returns early). The "re-laid out"
   half of the AC is unobservable in unit tests; do not stub a fake observer to assert
   `renderer.resize` — that tests the stub. Unit tests prove "not remounted"; e2e (AC10 (a))
   proves "re-laid out" (the box grows, the dish stays painted).
4. **AR-46 bans `rgb()`/`rgba()`/`hsl()` literals** (`eslint.config.mjs:34`, unanchored). The
   mockup's `rgba(10,10,10,.9)`, `rgba(26,26,26,.82)`, `rgba(0,0,0,.4)`, `rgba(0,212,255,.12)`
   are all out; `--gol-accent-tint` is the one rgba the token layer already provides.
5. **The Lab-mode button counts do NOT change.** `BattlePage.test.tsx:543`'s `organisms.length + 7`
   and `BattleHeader.test.tsx:38`'s `2` are both Lab-mode; the fullscreen button is Run-only.
   `BattlePage.test.tsx:2878`'s `within(view)` count of 4 excludes the header. Rewrite the three
   predictive comments; convert no count. Add the Run-mode header case (three buttons).
6. **`BattlePage.modeToggle.test.tsx` mocks `<BattleSimulationView>` and asserts EXACT props**
   (`:11-64`, the `runRenders` recorder). Three new props → three new equalities; a missing one
   fails `toEqual`, a typo passes `toMatchObject` — use the file's existing shape.
7. **Focus drops to `<body>` twice** — when the header unmounts (enter) and when the overlay
   unmounts (exit). Both moves are explicit. On exit use the DOM-lookup-at-restore-time shape with
   the loose-focus check (`useLeaveGuard.ts:114-138`), not a captured element (WebKit). Under
   `<StrictMode>` effects double-run: `.focus()` twice on the same element is idempotent.
8. **`handlePlayPause`'s deps stay `[status, play, pause]`** — `sim` is a new object per publish;
   passing `transport={{ … onPlayPause: handlePlayPause }}` is a fresh literal per render and that
   is fine (the view re-renders per publish anyway); a `useMemo` on it would be the 3.12 memo trap.
9. **RTL names are exact; Playwright's are substrings.** The badge `Run` must sit OUTSIDE the
   overlay's `<h1>` or `getByRole('heading', { level: 1, name: 'Three-Way Skirmish' })` fails under
   RTL. In Playwright, `getByRole('button', { name: 'Fullscreen' })` ALSO matches `Exit fullscreen`
   — `exact: true` on both new locators (3.17 Trap 4). `runButton`'s `'Run'` matches neither
   (`Fullscreen` / `Exit fullscreen` do not contain it).
10. **`data-fullscreen` is rendered in BOTH states**, as `"false"` / `"true"` strings — React
    stringifies the boolean. A test reading `toHaveAttribute('data-fullscreen', 'false')` is the
    honest one; `not.toHaveAttribute` is not.
11. **`sidebarHeadings` / `getByRole('complementary')` resolve to NOTHING in fullscreen.** Assert
    `toHaveCount(0)`; a `toHaveText([])` on an empty locator also passes but says less.
12. **Tab order is DOM order**: overlay (Exit) → HUD (Play/Pause, Next cycle, Stop & reset). Keep
    the overlay before the dish and the HUD after it in the fragment; nothing else focusable
    exists in the stage.
13. **`spec:check` reads this file.** `Decision D`, `RFC-003`, `NFR-4.1`, `AR-46`, `M2` — as the
    specs spell them. There is no FR for fullscreen; do not invent one.
14. **`/battle` has 1.1 KB of first-load headroom.** The Run chunk is free (dynamic import); the
    header/page additions are not. Keep `FullscreenButton`'s style object to the mockup's lines;
    reuse `ModeButton`'s `:focus-visible` and `:disabled` values by copying the two rules, not by
    a shared object that changes `ModeButton`'s identity. Measure; if red, the PetriDishCanvas
    split is the mechanism and the Dev Agent Record must flag it for a lane gate (AC9).
15. **No magic `z-index`.** The fixed `SimulationLayout` is later in DOM order than everything it
    covers and the header is unmounted; MUI's `Dialog` (z 1300) cannot open from fullscreen (no
    Back there). If a stacking bug appears, it is a DOM-order bug — fix the order, not the number.
16. **The dangling-roster adjust runs in render** (`BattlePage.tsx:589`). Extend it to clear
    `fullscreen` in the same in-render write (two setters, one pass, no loop — the second pass sees
    both false). Do not turn it into an effect (`set-state-in-effect`).
17. **Emotion parent selectors**: `'[data-fullscreen="true"] &': { … }` inside the object passed to
    `styled('div')` is the syntax; the attribute selector must match React's stringified `"true"`.
18. **`SimulationControlBar.test.tsx` / `CycleCounter.test.tsx` / `PopulationStats.test.tsx` /
    `GridSettingsSection.test.tsx` are the refactor proofs** — they pass UNCHANGED or the lift
    changed behaviour. Do not "improve" them in the same diff.
19. **The `ci:dev` gate, not `ci`.** The four-browser matrix is CI's job on the pushed branch
    (PR #53); the pre-existing WebKit/tablet "Tab reaches Play…" failures are not reproduced locally
    on purpose. Report `ci:dev`'s real exit code.
20. **Private port for local e2e** — lane 4's worktree may hold the default port with
    `reuseExistingServer` (the 3-15 hazard). Revert before commit.
21. **`autoFocus` and lint.** `eslint-config-next` wires `jsx-a11y`; if `jsx-a11y/no-autofocus`
    reports, use the mount effect instead (`exitRef.current?.focus()`), never a disable comment.
22. **The overlay's `<h1>` text is `battleTitle` as given** — `<BattlePage>` passes
    `battleDisplayName(battleName)`, so an untitled battle reads `Untitled Battle` in both the
    header and the overlay; do not apply the fallback twice.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **Spec §3.11 / §6 "`fullscreen` owner = `<BattleSimulationView>`" vs §3.2 "entry from
  `<BattleHeader>`".** The header is `<BattlePage>`'s child; the cell moves up one level (FD1 (a)),
  the same resolution 3.11 FD5 took for `onExitToLab`. Amendment candidates: §3.11 props
  (`fullscreen`, `onExitFullscreen`, `battleTitle`), §6 owner row, §2 tree annotation.
- **Spec §3.14 `children: ReactNode` vs §3.11 "never remounted".** Compatible only if the stage
  is mounted in both states (FD2 (a)) — `active: boolean` is the amendment; `hud.population`
  becomes `readonly PopulationEntry[]` (the hook's entries carry `organismId`/`name`/`pct` the
  pills need); `transport` is the whole `SimulationControlBarProps`.
- **Spec §8 "SpeedControl … fullscreen HUD" vs §3.14 `genPerSec` (a value) vs the mockup's
  read-out.** FD6 (a): read-out. §8's line is the amendment.
- **Mockup HUD labels `Play`/`Next`/`Stop` vs the bar's `Play`/`Next cycle`/`Stop & reset`.**
  FD7 (a): the bar's. Mockup-refresh candidate.
- **Mockup `.fs-hint` + `F`/`Escape` script.** Story 3.19's (spec §4 `useSimulationHotkeys`, §9.6);
  NFR-4.1 forbids the hint without the handler. Nothing here listens to keys.
- **Mockup translucency, gradient, glow, floating overlays.** FD4 (a); AR-46 and the contrast gate
  are the authorities. Mockup-refresh candidate. *(Overridden 2026-09-18: FD4 (b) — the mockup
  is followed; AR-46 is satisfied by composed tokens, as in 1.10/4.2/4.6.)*
- **No backing FR (spec §9.5; epic note "PRD touch recommended").** Unchanged by this story; the
  RFC-touch tracker entry in `deferred-work.md` (Story 4.1's section) takes the note that the
  fullscreen stage shipped as UX-sourced scope.
- **`deferred-work.md`'s 2-6 review entry says 3.18 makes the stale stroke geometry reachable.**
  False: fullscreen is Run-only and `EditDish` is unmounted in Run — re-point it (AC11 (1)).
- **`SpeedControl.tsx:14-16` predicts the HUD renders it.** Corrected by FD6; the comment is
  rewritten.

### What NOT to build

- ❌ No hotkeys, no `keydown` listener, no `.fs-hint` line, no `F`/`ESC` handling (3.19).
- ❌ No `requestFullscreen()` / `fullscreenchange` (FD3).
- ❌ No `compact` / `variant` prop on `<PopulationStats>` or `<CycleCounter>`; no second copy of the
  transport buttons, the padding rule, the swatch/skull, or `VisuallyHidden`.
- ❌ No speed slider, grid-size control, Back button, sidebar or name field in the stage.
- ❌ No new `--gol-*` token, no `rgba` literal, no `backdrop-filter`, no `transition`, no glow.
  *(Superseded 2026-09-18 by the FD4 owner override: two composed tokens — the scrim and the glow —
  ship, the HUD panel and Exit button on opaque `--gol-bg-secondary` (second-review decision (d));
  the `rgba` literal, `backdrop-filter` and `transition` bans stand.)*
- ❌ No `z-index` constant, no portal, no `key` on the canvas, no `display: none` on its chain, no
  `renderer.resize` call from the view.
- ❌ No change to `PetriDishCanvas.tsx`, `useSimulation.ts`, `gridRenderer.ts`, `packages/**`,
  route files, `themes.css`, `check-bundle-size.mjs` — unless AC9's red-bundle clause fires, and
  then ONLY the documented variant split, flagged loudly. *(`themes.css`: superseded 2026-09-18 by
  the FD4 override, not by the bundle clause — two composed tokens; the bundle stayed within budget:
  309.1 KB, 309.2 KB after the sync with main.)*
- ❌ No `error.tsx`; no `aria-live`; no `title` tooltips on the new buttons (their text is the
  name).
- ❌ No edits to `component-tree-battle-page.md`, `architecture.md`, RFCs, mockups, or any 2.x/3.x
  story file — candidates go to `deferred-work.md`.
- ❌ Nothing under `components/organisms/**` or `lib/organisms/**` (lane 4).

### Candidates to record (`deferred-work.md`, Task 8 (b))

1. Spec amendments: §3.11 props (`fullscreen`, `onExitFullscreen`, `battleTitle`); §3.14 `active`,
   `hud.population: readonly PopulationEntry[]`, `transport: SimulationControlBarProps`; §6 owner
   row → `<BattlePage>`; §8 HUD speed → read-out; §2 tree note that `<FullscreenStage>` is mounted
   in both states.
2. Mockup-refresh: HUD labels (FD7), translucent/gradient/glow surfaces and floating overlays
   (FD4), the `.fs-hint` line belongs to 3.19.
3. "True fullscreen" via the Fullscreen API as a post-3.19 enhancement (FD3), with the ESC-collision
   note.
4. The 2-6 review's stale-stroke entry re-pointed (AC11 (1)); the 2-3 review's dpr² entry confirmed
   (AC11 (2)); the 3-14 compact-variant entry closed (AC11 (3)).
5. Story 4.15 pointers: `<TransportControls>`, `<CycleDigits>`, `<PopulationPills>` and
   `<SpeedControl>` are the preview panel's reusable pieces — the lane-gate proposal at the end
   of this file says why.
6. `<BattleHeader>`'s `disabled` collapse (3-11 entry) is unchanged — the fullscreen button is never
   disabled; note it so the entry stays accurate.

### Testing standards summary

- `apps/web/components/battle/simulation`: RTL + `vitest-axe` + `userEvent`; `installContexts()`,
  `installFrameDriver()`, `vi.spyOn(GridRenderer.prototype, 'drawFull')` for the swap invariants;
  `resetColourStateWarnings()` in `afterEach`; never snapshot the canvas.
- `apps/web/components/battle`: the 3.11 helpers; `findRunView` for the lazy chunk; the router mock
  is mandatory; `resetRefToFillGroupWarnings` in `afterEach`; single-h1 assertions in every state.
- Refactor proofs: `SimulationControlBar.test.tsx`, `CycleCounter.test.tsx`,
  `PopulationStats.test.tsx`, `GridSettingsSection.test.tsx` — unchanged and green.
- e2e: Playwright, `expect.poll` never `waitForTimeout`; `exact: true` on the two new locators;
  `collectErrors` on every test; `chromium --workers=1` on a private port.
- Make every new test fail under the mutation it guards: a wrapper type added above the canvas in
  one state (AC4 (a) reddens on the canvas identity / context count / `drawFull` count); the
  sidebar hidden instead of unmounted (`complementary` count); the header kept mounted (`Mode`
  group present in fullscreen); `fullscreen` not cleared on a mode flip (AC2 (b)'s second Run entry
  opens in fullscreen); the badge inside the `<h1>` (exact heading name); the pills coloured on the
  text (axe); `setFullscreen` in an effect (lint); `TransportControls` labels shortened (three
  files' `getByRole` names).
- `npm run ci:dev > /tmp/ci-3-18.log 2>&1; echo $?`; report the real exit code and the bundle
  numbers.

### Previous story intelligence (3.17) and recent git

- **3.17 shipped the `?mode=run` entry**: `<BattlePage>` can now MOUNT in Run, so the fullscreen
  button must be present on the first header render of a Gallery-launched run (AC2 (c), AC10 (e)).
  Its in-render adjust (`:589`) is the second writer this story extends (trap 16).
- **3.17's review culture** (12 patches, 0 decision-needed): line-number citations that the same
  diff moves were rejected — cite by symbol/entry title in code and `deferred-work.md`; comments
  that overclaimed what a test proves were cut to what it proves; a comment-only edit under lane
  4's surface (`OrganismLibrary.tsx`) was REVERTED — stay out of `components/organisms/**`. Expect
  the same: "the canvas was not remounted" is `toBe(canvasBefore)` + one context + an unchanged
  `drawFull` count, not "the dish is visible".
- **3.17's Debug Log**: `/battle` 308.9 KB (1.1 KB headroom), `/` 333.6 KB (6.4 KB), `/battle/new`
  308.7, `/organisms` 295.4; Run chunk ~6.3 KB gzip; bench 7.641 ms (54% headroom); the concurrent
  four-project local e2e produced contention flakes → PR #53 made `ci:dev` (Chromium only) the dev
  gate.
- **3.16** built the last sidebar section and the `<LadderSlider>` lift — the refactor-proof idiom
  Task 1 repeats four times. **3.14** decided the pills' rules (FD2/FD4/FD6) and recommended the
  sibling. **3.12** is the transport's authority (FD1/FD2/FD5/FD6). **3.11** built the chassis whose
  wrappers this story restyles (FD5 (a): the header owns the toggle — the FD1 precedent here).
  **2.16** is the focus-restore precedent (`useLeaveGuard`).
- **Git:** stories run on `story/*` branches merged by PR (#51 4.10, #53 chore `ci:dev`); `feat:` /
  `fix: review patches (story N.M)` is the commit shape. Lane 4's next story is 4.11 (condition
  builder) — `components/organisms/**` and `lib/organisms/**` only; nothing in 4.11–4.13 reads any
  file this story touches. 4.24/4.25 are gated on `epic-3`.

### External dependencies / versions

None new. React 19.2.7 (fragments, `inert` passthrough, `autoFocus`); Next 16.2.10; MUI 9.3.1
(`styled` only); RTL 16.3.2; `vitest-axe` 0.1.0; Vitest 4.1.x; Playwright as installed.

## Project Structure Notes

- New (code): `apps/web/components/VisuallyHidden.tsx`,
  `apps/web/components/battle/simulation/FullscreenStage.tsx`,
  `apps/web/components/battle/simulation/PopulationPills.tsx`,
  `apps/web/components/battle/simulation/TransportControls.tsx`,
  `apps/web/components/battle/simulation/CycleDigits.tsx` (and optionally
  `populationGlyphs.tsx`).
- New (tests): `FullscreenStage.test.tsx`, `PopulationPills.test.tsx` (beside their components).
- Modified (code): `apps/web/components/battle/simulation/BattleSimulationView.tsx`,
  `SimulationControlBar.tsx`, `CycleCounter.tsx`, `PopulationStats.tsx` (exports + comment),
  `SpeedControl.tsx` (comment), `README.md`; `apps/web/components/battle/BattleHeader.tsx`,
  `BattlePage.tsx`; `apps/web/components/battle/editor/GridSettingsSection.tsx` (import only).
- Modified (tests): `BattleSimulationView.test.tsx`, `BattleHeader.test.tsx`,
  `BattlePage.test.tsx`, `BattlePage.modeToggle.test.tsx`, `apps/web/e2e/battleRoute.spec.ts`.
- Modified (docs): `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`, this
  file.
- Not touched: `apps/web/components/PetriDishCanvas.tsx`, `apps/web/lib/battle/useSimulation.ts`,
  `apps/web/lib/canvas/**`, `apps/web/app/**` except `themes.css` (two tokens, FD4 (b) — see the
  File List), `scripts/check-bundle-size.mjs`, `packages/**`, `apps/web/components/organisms/**`,
  `apps/web/lib/organisms/**`, any planning artifact, any epic-4 story or status line.
- Naming: PascalCase component files; `data-fullscreen` (view root), `data-enter-fullscreen`
  (header button); DOM text sentence case (`Fullscreen`, `Exit fullscreen`, `Run`, `Cycle`,
  `Speed`), CSS uppercases; test describes cite `Story 3.18` and the governing IDs.

## References

- `docs/planning-artifacts/epics.md#Story 3.18` (`:961-972`); Story 3.11 (`:874-885`), 3.12
  (`:887-898`), 3.14 (`:912-923`), 3.16 (`:937-947`), 3.19 (`:974-985`); the Epic 3 preamble
  (`:738`).
- `docs/planning-artifacts/component-tree-battle-page.md` — §2 tree (`:75-90`, `:95`), **§3.2
  (`:116-131`)**, §3.10 (`:248-269`), **§3.11 (`:271-287`)**, §3.12 (`:289-308`), §3.13
  (`:310-323`), **§3.14 (`:325-341`)**, §4 hotkeys (`:377-378`), §5 `GridRenderer.resize`
  (`:392`), §6 `fullscreen` row (`:419`), §7 rows 4.1/4.5/4.6 (`:441-444`), §8 (`:464`, `:467`),
  **§9.5 (`:479`)**, §9.6 (`:480`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode-fullscreen.html`
  — `.fs-stage` (`:28-36`), `.fs-top` (`:38-52`), `.fs-title` / `.fs-mode-badge` (`:54-72`),
  `.fs-exit` (`:74-92`), `.petri-dish-grid` (`:94-101`), `.fs-hud` (`:131-148`), `.hud-*`
  (`:150-210`), `.control-btn*` (`:212-259`), `.fs-hint` (`:261-279`), markup (`:282-371`), the
  demo script (`:373-393`); `petri-dish-play-mode.html` — `.header-actions` (`:55-59`),
  **`.btn-fullscreen` (`:97-114`)**, header markup (`:551-560`).
- `docs/planning-artifacts/architecture.md` — Decision D (the loop), Decision J (one theme),
  Cross-Cutting Decisions; `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md`
  — Decision 2 (run-local state), Decision 3 (modes are state), Decision 5 (`useSimulation`);
  `RFC-003-frontend-ui-architecture.md` — Decision 4 (animation; "cannot interfere with simulation
  engine performance", `:51`).
- `apps/web/components/battle/BattleHeader.tsx` — `Actions` (`:41-47`), `ModeButton` (`:75-117`),
  props (`:119-142`, **`:141`**), render (`:148-187`).
- `apps/web/components/battle/BattlePage.tsx` — `dynamic()` (`:52-81`), **`mode` (`:162-172`)**,
  `handleModeToggle` (`:333-341`), **the adjust (`:575-589`)**, the header (`:861-870`), **the Run
  branch (`:906-930`)**.
- `apps/web/components/battle/simulation/BattleSimulationView.tsx` — head comment (`:19-61`),
  props (`:63-79`), **styled blocks (`:81-158`)**, `handlePlayPause` (`:175-194`), **render
  (`:203-284`)**.
- `apps/web/components/battle/simulation/SimulationControlBar.tsx` — `Bar` (`:31-41`),
  **`Transport` … render (`:47-217`)**, props (`:154-169`).
- `apps/web/components/battle/simulation/PopulationStats.tsx` — head (`:7-33`), `Swatch`
  (`:88-93`), `Skull` (`:96-99`), the map (`:158-181`); `CycleCounter.tsx` — `CYCLE_DIGITS` +
  render (`:38-56`); `SpeedControl.tsx:14-16`.
- `apps/web/components/PetriDishCanvas.tsx` — **`PlaybackDish` (`:786-940`)**: construction deps
  (`:848-879`), the observer (`:887-928`, `parentElement` at `:903`), the `lastGrid` note
  (`:890-897`).
- `apps/web/lib/canvas/gridRenderer.ts` — `resize` contract (`:637-672`), `applyDevicePixelSizing`
  (`:208-230`).
- `apps/web/lib/battle/useSimulation.ts` — head (`:31-110`; the swap sentence `:52-56`; obligations
  `:75-100`), result (`:131-155`).
- `apps/web/lib/battle/useLeaveGuard.ts` — `restoreBackFocusRef` (`:96-105`), **the restore effect
  (`:114-138`)**; `apps/web/components/battle/SidebarFooter.tsx:130` (`data-back-to-battles`);
  `apps/web/lib/useInertBackground.ts:5-24` (why a covered-but-reachable control is a bug).
- `apps/web/components/battle/editor/GridSettingsSection.tsx:146-153` (`VisuallyHidden`);
  `apps/web/components/battle/UnsavedChangesDialog.tsx:104-111` (`autoFocus` precedent).
- `eslint.config.mjs` — AR-46 (`:22-36`, `:74-102`; `FUNCTIONAL_COLOUR_PATTERN` `:34`);
  `apps/web/app/themes.css` — tokens (`:20-45`), `--gol-backdrop` (`:69`), `--gol-accent-tint`
  (`:120`); `apps/web/lib/themeTokens.test.ts` — text pairs (`:66-100`), control pairs (`:129-139`).
- Tests: `BattleHeader.test.tsx:26-57`; `BattlePage.test.tsx` — router mock (`:21-32`), Lab count
  (`:539-546`), 3.11 helpers (`:2684-2701`), the flip (`:2703-2750`), the Run count
  (`:2862-2884`); `BattlePage.modeToggle.test.tsx` — mocks (`:11-64`), recorders (`:212`, `:239`);
  `BattleSimulationView.test.tsx` — helpers (`:29-107`), StrictMode (`:206-220`), **"same canvas
  node" (`:376-378`)**; `apps/web/e2e/battleRoute.spec.ts` — helpers (`:132-166`),
  `distinctColorCount` (`:76`), the 3.11 block (`:1993-2075`), axe (`:2095`), the 3.17 block
  (`:2904-`).
- `docs/implementation-artifacts/deferred-work.md` — the 2-3 review "dpr² exposure" entry (`:200`),
  the 2-6 review "stroke's cached geometry … SCROLL" entry (`:240`), the 3-11 implementation
  section (`:872-920`: bundle mechanism, §3.10/§3.11 amendments, `lastGrid`), the 3-14 section
  (`:1230-1259`: cycle chrome, coloured pill text, **compact variant `:1248-1252`**), the 3-15
  section (`:1276-`: `status` union `:1288-1290`), the 3-17 sections (`:1416-1475`).
- `docs/implementation-artifacts/3-17-run-battle-from-gallery.md` (Review Findings, Debug Log),
  `3-16-play-mode-ephemeral-resize.md` (the `<LadderSlider>` lift), `3-14-cycle-counter-population-stats.md`
  (FD2/FD4/FD6/FD8), `3-12-transport-controls.md` (FD1/FD2/FD5/FD6),
  `3-11-mode-toggle-run-view-skeleton.md` (FD5), `lane-gates.yaml`.
- `docs/project-context.md` — hot state in refs; one theme / tokens only; `ci:dev` is the dev gate;
  `spec:check` spelling; the bundle ratchet; commit gate.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, under `implement-next-story` (lane = Epic 3).

### Debug Log References

- **Forced decisions taken**: FD1 (a) — `<BattlePage>` owns `fullscreen` beside `mode`; the header
  reports the press; the view receives `fullscreen` / `onExitFullscreen` / `battleTitle`. FD2 (a) —
  `data-fullscreen` on the view root + `'[data-fullscreen="true"] &'` parent selectors on the
  existing styled blocks; sidebar and bar leave via `false`-holding slots; `<FullscreenStage
  active>` always mounted around the unchanged dish wrappers, chrome as fixed fragment slots. FD3
  (a) — no `requestFullscreen()`. FD4 (a) — in-flow rows, opaque surfaces, no rgba / gradient /
  blur / glow / transition — **overridden to (b) by the owner on 2026-09-18** (floating chrome,
  `min(94vw, 138vh)` dish, two composed tokens once decision (d) removed the third; see the FD4 block and the Change Log). FD5 (a) — `<VisuallyHidden>` promoted to `components/` root. FD6 (a) —
  Speed as a read-out. FD7 (a) — `<TransportControls>` lifted, same three names. FD8 (a) —
  `<CycleDigits>` lifted. FD9 (a) — header unmounted while the stage is up, explicit focus moves.
  The swatch/skull pair went to a small `populationGlyphs.tsx` (the AC8 "dev's call").
- **The one value change against the story's starting point** (AC4's "these values are a starting
  point; the invariants are…"): measured at 1280×720 in Chromium with the mockup-faithful in-flow
  values (top row `18px` vertical, HUD `40px` bottom offset, dish gutter `20px`), the fullscreen
  dish came out **838×501 — SMALLER than the chassis's 896×517**, because rows in flow compete
  with the dish for height where the mockup's floating overlays did not, and the layout is
  height-bound at 16:9. Tightened to `12px` / `16px` / `12px`: **924×553 at 1280×720** and
  **1114×667 at 1194×834** (chassis 810×484 there), both rows on screen at both tiers — AC4's
  invariants (i) and (ii) hold; the numbers are in the styled blocks' comments and in
  `deferred-work.md`'s mockup-refresh candidate 3. **Moot since 2026-09-18** (FD4 owner override):
  the chrome floats, nothing competes with the dish for height, and the dish is `min(94vw,
  138vh)` — 990×592 at 1280×720, 1486×890 at 1920×1080. The mockup-faithful paddings (`18px 24px`,
  `bottom: 40px`) are back as drawn.
- **Mutation check on the AC4 tripwire**: with `<FullscreenStage>` rewritten as `active ? <div>…
  {children}…</div> : <>{children}</>` (FD2 (c)), `BattleSimulationView.test.tsx`'s three
  "same canvas node / one construction / drawFull unchanged" tests reddened (3 failed), and went
  green again on restore.
- **`listitem` has no name-from-content**: the AC8 "accessible name of each item is `${name}
  ${count}`" assertion cannot be written as `toHaveAccessibleName` on an `<li>` (always empty, so
  it would pass trivially for an unnamed pill). `PopulationPills.test.tsx` asserts the item's
  TEXT plus the hidden (not `aria-hidden`) name span and the named `img` instead, and says why.
- **Construction count, not context-map size**: `installContexts()`'s map also holds the
  renderer's offscreen grid-line overlay canvas, so "one context" is asserted as `getContext`
  calls whose `this` is the main canvas (the 3.16 `installContextsWithCounts` idiom).
- **Refactor proofs unchanged and green**: `SimulationControlBar.test.tsx`,
  `CycleCounter.test.tsx`, `PopulationStats.test.tsx`, `GridSettingsSection.test.tsx` (40 tests).
- **Bundle** (`npm run build:standalone && npm run bundle:check`, all green, no threshold move,
  no `PetriDishCanvas` split needed): `/` **333.6 KB** (340; Δ 0.0 vs 3.17), `/battle`
  **309.1 KB** (310; **0.9 KB headroom**, Δ +0.2), `/battle/new` **308.9 KB** (310; 1.1 KB
  headroom, Δ +0.2), `/organisms` **295.4 KB** (305; Δ 0.0). What landed in first-load: the
  header's button + styles, the page's cell / two callbacks / one ref / one effect, and
  `VisuallyHidden.tsx`. The Run chunk (the one holding `"Exit fullscreen"` and `"Grid dimensions"`,
  `21mklh3rx7342.js`): **7.2 KB gzip** (23.7 KB raw), up from ~6.3 KB — `FullscreenStage`,
  `PopulationPills`, `TransportControls`, `CycleDigits`, `populationGlyphs` all ride there.
- **e2e**: the 3.18 block (5 tests) and the whole 3.11–3.18 range (37 tests) on
  `--project=chromium --workers=1` against a private port (`PORT = 4199` in
  `playwright.config.ts`, reverted to 4173 before commit).
- **Owner decisions pass (2026-09-18)**: `BattleHeader.test.tsx` RED (the `detail: 2` click called
  `onModeToggle`) → guard → 18/18 green. `npm run ci:dev` exit **0**: unit 142 files green
  (test-utils 6, domain 6, persistence 7, simulation 23, web 100), bundle within budget on all
  four routes (`/battle` 0.9 KB headroom, unchanged), bench 8.118 ms headroom, e2e Chromium
  **185 passed, 1 skipped** on the default port.
- **`npm run ci:dev > /tmp/ci-3-18.log 2>&1; echo $?`**: **exit 0** (typecheck → lint → format:check → spec:check → boundary:check → coverage → build → bundle → bench → bench:check → e2e:chromium; **185 Chromium e2e passed**, 1.0 min). The four-browser matrix is CI's job on the pushed branch.
- **`bench:check`** (no engine change, reported anyway): frame **7.205 ms** (step 7.062 + repaint-diff 0.143) against 16.667 ms — 9.462 ms headroom, 56.8% of the frame; green, no engine change.
- **Second-review decision (d) pass (2026-09-18)**: `--gol-surface-hud` removed; `HudPanel` /
  `ExitButton` → `var(--gol-bg-secondary)`; no test referenced the token (grep over `apps/`,
  `packages/`, `docs/` — only `themes.css`, `FullscreenStage.tsx` and the docs named it). `npm run
  ci:dev` exit **0**: typecheck → lint → format:check → spec:check → boundary:check → coverage
  (persistence 82, simulation 407, test-utils 89, domain 108, web green incl. `themeTokens` 86) →
  build → bundle (`/battle` 309.2 KB, 0.8 KB headroom; `/battle/new` 0.9 KB; `/` 6.3 KB;
  `/organisms` 9.5 KB) → bench:check (8.525 ms headroom, 51.2% of the frame) → e2e Chromium
  **193 passed, 1 skipped** (1.2 min).

### Completion Notes List

- AC1: `<FullscreenButton>` in `<BattleHeader>`'s `<Actions>` before `<ModeToggle>`, iff
  `mode === 'run'` and `onEnterFullscreen`; `⛶` `aria-hidden`; `data-enter-fullscreen=""`; never
  disabled. Tests: three-button Run case (order, click), Run without the prop, enabled under
  `disabled`, axe; the Lab count comment rewritten.
- AC2/AC6/AC7: `<BattlePage>` — `fullscreen` cell, `inFullscreen`, `handleEnterFullscreen` /
  `handleExitFullscreen` (`useCallback([])`), `restoreFullscreenEntryFocusRef` + the restore
  effect (DOM lookup, loose-focus guard), both writers clear the cell, header unmounted while on,
  three view props. Tests: `BattlePage.test.tsx` new describe (round trip, focus restore, Lab
  round trip never re-enters fullscreen, `initialMode="run"` first render, axe);
  `BattlePage.modeToggle.test.tsx` gains the three prop equalities on both paths plus three
  mocked-view cases (header unmount/remount through `onExitFullscreen`, do-not-steal-focus,
  restore-when-loose).
- AC3: `simulation/FullscreenStage.tsx` (default export; `FullscreenTopOverlay` / `FullscreenHUD`
  private; `active`; the three-slot fragment with the reconciliation comment; focus-on-mount
  effect on Exit; every mockup line cited; FD4 deviations named). 12 tests.
- AC4/AC5/AC9: `BattleSimulationView.tsx` — three props, `data-fullscreen` in both states, the
  parent-selector rules, sidebar/bar slots, `<FullscreenStage>` around the unchanged wrappers with
  fresh `hud`/`transport` literals (commented), head comment rewritten. No effect keys on
  `fullscreen`; `handlePlayPause` deps unchanged. 8 new tests (same node / one construction /
  drawFull unchanged; StrictMode; playing through the swap with no `caf` and one pending frame;
  paused at cycle 2; speed 20 read-out ↔ slider; ephemeral 150×90 on the same node; pills from
  the hook; focus + axe).
- AC8: `<TransportControls>` (props type declared once there, re-exported from the bar),
  `<CycleDigits>`, `<PopulationPills>` (sibling, `data-extinct`, colour on the swatch only,
  `en-US` grouping, nothing for an empty roster — 6 tests), `populationGlyphs.tsx`,
  `components/VisuallyHidden.tsx`.
- AC10: `battleRoute.spec.ts` — two `exact: true` locators beside `runLink`, the 3.18 describe
  with (a)–(e); (a) polls the dish box strictly wider AND taller and inside the viewport, painted,
  axe clean, Exit focused, then Fullscreen focused and the box back within 4px.
- AC11: comments rewritten in `BattleHeader.tsx` (`Actions`, the prop doc), `BattlePage.tsx`
  (the `mode` paragraph), `BattleSimulationView.tsx` (head), `SimulationControlBar.tsx` (head),
  `SpeedControl.tsx` (head), `PopulationStats.tsx` (head), `CycleCounter.tsx` (head),
  `BattleHeader.test.tsx`, `BattlePage.test.tsx` ×2; `simulation/README.md` names the three
  shared pieces and `<VisuallyHidden>`'s home; `deferred-work.md` (1)–(6) done, plus the RFC-touch
  tracker note; `sprint-status.yaml` this story's line only.
- Owner review decisions (2026-09-18): ✅ Resolved review finding [Decision]: fullscreen entered
  during the Run chunk fetch — option (a), accepted and recorded in `deferred-work.md` (no code).
  ✅ Resolved review finding [Decision]: Exit double-click landing on the remounted `Lab` — option
  (b), `event.detail > 1` guard on the mode toggle in `BattleHeader.tsx` + one test (`detail: 2`
  ignored; `detail: 1` and keyboard `Enter` still fire). `BattleHeader.test.tsx`: 18/18.
- **Second-review decision applied (2026-09-18)** —
  ✅ Resolved review finding [Decision]: HUD text under AA over a bright colony — the owner's
  option (d): `HudPanel` and `ExitButton` are opaque `var(--gol-bg-secondary)`; `--gol-surface-hud`
  removed from `themes.css` (its comment block now covers the two tokens that remain); the FD4
  override paragraph, the `FullscreenStage.tsx` file-header and `.fs-exit` / `.fs-hud` comments,
  the two AC italics that named the token, the File List line and the `deferred-work.md`
  mockup-refresh line now say two tokens and an opaque panel. No new test: the panel's text is the
  already-gated `themeTokens.test.ts` bg-secondary pair, and no test named the removed token.
- **For the reviewer**: nothing here touches `PetriDishCanvas.tsx`, `useSimulation.ts`,
  `gridRenderer.ts`, `packages/**`, `check-bundle-size.mjs`, any route file, or anything under
  `components/organisms/**` / `lib/organisms/**`. `themes.css` IS touched since the FD4 override
  (2026-09-18): two tokens appended at the end of `:root` (three until decision (d) removed
  `--gol-surface-hud`), directly above Story 4.10's rule-action block — `themes.css` is a shared-lane file (4.2 / 4.6 / 4.10 each appended there), so a lane-4
  token append lands as an adjacent-hunk conflict; merge one lane's PR, let the other sync. The
  bundle stayed green, so the
  documented `PetriDishCanvas` split (which would touch a file 4.14/4.15 import) was NOT needed
  and no lane gate is proposed on that account; the lane gate the story file already proposes
  (4.15 requires 3.18, for the three shared `simulation/` pieces) stands.

### File List

New:
- `apps/web/components/VisuallyHidden.tsx`
- `apps/web/components/battle/simulation/FullscreenStage.tsx`
- `apps/web/components/battle/simulation/FullscreenStage.test.tsx`
- `apps/web/components/battle/simulation/PopulationPills.tsx`
- `apps/web/components/battle/simulation/PopulationPills.test.tsx`
- `apps/web/components/battle/simulation/TransportControls.tsx`
- `apps/web/components/battle/simulation/CycleDigits.tsx`
- `apps/web/components/battle/simulation/populationGlyphs.tsx`

Modified:
- `apps/web/components/battle/BattleHeader.tsx`
- `apps/web/components/battle/BattleHeader.test.tsx`
- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/battle/BattlePage.modeToggle.test.tsx`
- `apps/web/components/battle/editor/GridSettingsSection.tsx` (import only; local
  `VisuallyHidden` removed)
- `apps/web/components/battle/simulation/BattleSimulationView.tsx`
- `apps/web/components/battle/simulation/BattleSimulationView.test.tsx`
- `apps/web/components/battle/simulation/SimulationControlBar.tsx`
- `apps/web/components/battle/simulation/CycleCounter.tsx`
- `apps/web/components/battle/simulation/PopulationStats.tsx`
- `apps/web/components/battle/simulation/SpeedControl.tsx` (comment only)
- `apps/web/components/battle/simulation/README.md`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/3-18-fullscreen-run-stage.md` (this file)
- `apps/web/app/themes.css` (FD4 (b), 2026-09-18: `--gol-scrim-top`, `--gol-shadow-dish-glow`;
  the interim `--gol-surface-hud` was removed by second-review decision (d))

## Change Log

- 2026-09-17 — Story 3.18 created (ready-for-dev): ultimate context engine analysis completed —
  comprehensive developer guide created.
- 2026-09-17 — Implemented (review): the fullscreen run stage — header entry, page-owned
  `fullscreen` cell with focus restore, the CSS-driven no-remount layout swap in the Run view,
  `<FullscreenStage>` with `<TransportControls>` / `<CycleDigits>` / `<PopulationPills>` lifted
  out as shared Run pieces, `<VisuallyHidden>` promoted; 38 new unit tests, 5 e2e; bundle green.
- 2026-09-17 — Code review (in-progress): 8 patches applied (comment accuracy ×5, the shared
  skull's host margin, wrapping pills, doc wording), 3 deferred to `deferred-work.md`, 2 decisions
  left open for the owner (fullscreen during the Run chunk fetch; the Exit/Lab double-click).
- 2026-09-18 — Owner review against the mockup: FD4 (a) → (b). The top bar and HUD float over the
  dish (`position: fixed`), the dish is `min(94vw, 138vh)` with the accent glow; the mockup's
  translucent surfaces become three channel-composed tokens (`--gol-scrim-top`,
  `--gol-surface-hud`, `--gol-shadow-dish-glow`); `backdrop-filter` and `transition` stay out.
  Unit, e2e (3.14/3.16/3.18 blocks + axe) and bundle gates green; `/battle` unchanged at 309.1 KB.
- 2026-09-18 — Addressed code review findings - 2 items resolved (the two owner decisions): the
  chunk-fetch fullscreen window accepted and recorded in `deferred-work.md`; the mode toggle
  ignores repeat clicks (`event.detail > 1`), with a test. Status → review.
- 2026-09-18 — Second code review (in-progress): 9 patches applied (the story's `themes.css` /
  in-flow statements brought in line with FD4 (b), the File List, the lane-gate wording, four code
  comments, one `deferred-work.md` line), 2 deferred to `deferred-work.md` (decision 2's residuals;
  a third `VisuallyHidden` copy in lane 4), 1 decision left open for the owner (HUD text under AA
  where the translucent HUD overlaps a bright colony).
- 2026-09-18 — Addressed code review findings - 1 item resolved (the owner's decision (d)): the HUD
  panel and the Exit button are opaque `--gol-bg-secondary`; `--gol-surface-hud` removed from
  `themes.css`; the FD4 override, the `FullscreenStage.tsx` file comment and the `deferred-work.md`
  mockup-refresh line now name two tokens. Gates re-run. Status → review.
- 2026-09-18 — Third code review (done): 4 patches applied (the six residual "three tokens"
  statements, `deferred-work.md`'s stale open-decision preamble, the swapped HUD/dish overlap
  figures in code comment + story + `deferred-work.md`, one noun in `themes.css`'s comment), 0
  deferred, 0 decisions open, 4 dismissed. CI for `209f3e6`: green — quality 3m04s, e2e 11m36s, deploy skipped (PR) — run 35317561904.
- 2026-09-18 — Third-review patches committed as `e6f6005` (CI green: quality 2m28s, e2e 12m04s).
  PR #55 taken out of draft and merged into `main` by the owner as `7578d4d`. Status → done.

Dev Model: opus   # architecture-shaping: it decides where `fullscreen` lives (BattlePage, against spec §6), establishes the CSS-driven no-remount layout-swap pattern that 3.19's F key toggles and that React reconciliation can silently break, and factors <TransportControls>/<CycleDigits>/<PopulationPills> out of 3.12/3.14's files as the pieces 4.15 builds on
Proposed lane gate: { story: 4-15-preview-simulation, requires: 3-18-fullscreen-run-stage, why: "3.18 lifts the transport trio out of <SimulationControlBar> (<TransportControls>), the zero-padded digits out of <CycleCounter> (<CycleDigits>) and ships <PopulationPills> as the compact population sibling — the preview panel (spec §8 / §3.12: SpeedControl + compact PopulationStats + cycle counter + Play/Stop/Step) is the third consumer of <TransportControls> and <CycleDigits> and the second of <PopulationPills>, and must reuse them rather than re-author or edit the same simulation/ files concurrently" }

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 1m 12s | 1m 12s | 10 | 1,604 | 3,438 | 314,202 | 319,254 |
| Step 1 — create | opus-5 | 1 | 26m 24s | 26m 24s | 206 | 96,090 | 1,201,504 | 19,215,980 | 20,513,780 |
| Step 2 — implement | opus-5 | 1 | 26m 35s | 26m 35s | 336 | 104,528 | 479,649 | 35,070,066 | 35,654,579 |
| Step 3 — review + PR | fable-5-1 | 4 | 16m 52s | 16m 52s | 5,560 | 134,218 | 2,924,600 | 28,803,104 | 31,867,482 |
| _of which the orchestrator_ | opus-5 | — | — | — | 52 | 15,053 | 38,227 | 1,855,935 | 1,909,267 |
| **Total (create → PR ready)** | | 6 | **1h 11m** | 1h 11m | 6,112 | 336,440 | 4,609,191 | 83,403,352 | **88,355,095** |

Run started 2026-09-17 19:32 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
