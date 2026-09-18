'use client';

import { useCallback } from 'react';
import { styled } from '@mui/material/styles';
import type { Organism } from '@gol/domain';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { useSimulation, type GenPerSec } from '@/lib/battle/useSimulation';
import { useSimulationHotkeys } from '@/lib/battle/useSimulationHotkeys';
import PetriDishCanvas from '../../PetriDishCanvas';
import SidebarFooter from '../SidebarFooter';
import SidebarSection from '../SidebarSection';
import CycleCounter from './CycleCounter';
import FullscreenStage from './FullscreenStage';
import GridSizeControl from './GridSizeControl';
import PopulationStats from './PopulationStats';
import SimulationControlBar from './SimulationControlBar';
import SpeedControl from './SpeedControl';

/**
 * The Run chassis (spec §3.11, RFC-005 Decision 5): "the only component that touches
 * `useSimulation`". Everything below the hook is React-free and everything above it — `<BattlePage>`
 * — never sees a buffer; this component is the one place the two meet, and it reads exactly what
 * the hook publishes (`status`, `cycle`, `liveSize`) and forwards exactly one thing down
 * (`attachRenderer`). No `useState` holds anything from the engine (AR-29, NFR-1.1).
 *
 * The hook's three consumer obligations (its head comment), discharged here:
 * 1. STABLE references — by construction: `initialGrid` is `useUndoableGrid`'s value and
 *    `organisms` is the `runOrganisms` memo, both `<BattlePage>`'s, and the editor is unmounted
 *    while this renders so neither can change under it. A fresh array per render would restart
 *    the run every render as a hard crash ("Too many re-renders", Story 3.10's Dev Agent Record).
 * 2. ROSTER ORDER — `runOrganisms` is built over `rosterIds`, the same array `palette` was built
 *    over (M14: a LUT and a session compiled from different arrays disagree by ref).
 * 3. UNMOUNT to leave — `<BattlePage>`'s `mode` branch; Run -> Lab is the hook's own cleanup
 *    (stop the loop, detach the renderer, drop the session — Story 3.10 AC10), and nothing here
 *    writes to `initialGrid` (FR-4.8, AR-31).
 *
 * Story 3.19 added the hotkeys: `useSimulationHotkeys` is called HERE, once, because this is the
 * only component that holds `sim` (spec §3.11) — the hook itself never sees it, only the three
 * transport callbacks the two `<TransportControls>` homes already get (`onStop` composed per FD4
 * (c), below — it stops AND exits while the stage is up, the owner's 2026-09-18 decision), plus
 * `canStep` (`status === 'paused'`, the same boolean `<GridSizeControl>`'s `disabled` reads) and a
 * fullscreen toggle composed from `onExitFullscreen` (this view's own prop) and the new
 * `onEnterFullscreen` prop (FD5 (a); `<BattlePage>` passes the same callback the header's
 * Fullscreen button gets). Mounting here, not in `<BattlePage>`, is also what makes Lab mode
 * hotkey-free "by construction" (AC4):
 * `<BattlePage>` unmounts this view on Run -> Lab, which is the hook's own cleanup — no `enabled`
 * flag, no second listener. The extinction auto-pause (FR-4.7, Decision B.5, Story 3.15) is the
 * hook's alone — this component gains no state, hook, effect or prop for it; it is observed
 * through `status` exactly like a manual pause. The transport bar shipped in 3.12:
 * `<SimulationControlBar>` is the only thing that moves the view off paused-at-cycle-0, and
 * `handlePlayPause` below is the one derivation genuinely new there — which verb Play/Pause means,
 * decided from `status` (3.12 FD3). The Speed section shipped in 3.13: `<SpeedControl>` reads
 * `sim.genPerSec` and hands `sim.setSpeed` straight through — the view holds NO speed state of its
 * own (3.10 FD6: the hook is the only holder of the speed). Story 3.14 added
 * `<PopulationStats>` / `<CycleCounter>`, ABOVE the Speed section (spec §2): both are pure
 * presentational reads of `sim.population` / `sim.cycle`, so the view gains a `totalLiving` reduce
 * (FD3) and no hook, state, ref or effect of its own. Story 3.16 added the Grid Size section,
 * FOURTH after Speed: `<GridSizeControl>` reads `sim.liveSize` and hands `sim.resizeLive` straight
 * through (both `useCallback`-stable / plain reads off the hook, Story 3.10), `disabled` is a
 * render-time boolean off `sim.status` exactly like the transport bar's Next-cycle button — no new
 * state, hook, ref or effect here either.
 *
 * Story 3.18 added the fullscreen stage, as a LAYOUT SWAP and nothing more (spec §3.11
 * "CSS-driven"; FD2 (a)). `fullscreen` arrives as a prop — `<BattlePage>` owns the cell (FD1 (a),
 * the same shape 3.11 FD5 chose for `mode`: the header carries the entry control and is
 * `<BattlePage>`'s child, so the page flips the boolean and unmounts the header while it is on) —
 * and the view answers it three ways, none of which reach the hook: (1) `data-fullscreen` on the
 * root selects a second set of styles on the SAME styled blocks (`SimulationLayout` goes
 * `position: fixed; inset: 0`, the dish box becomes `min(94vw, 138vh)`); (2) the sidebar and the bottom
 * bar leave the tree through `false`-holding slots; (3) `<FullscreenStage>` — mounted in BOTH
 * states — wraps the UNCHANGED dish wrappers and renders its title row and HUD only while active.
 * Same component types at the same child positions above the canvas in both states, so React
 * keeps the canvas, its `GridRenderer` and the attached loop; only the dish's BOX changes, which
 * `PlaybackDish`'s `ResizeObserver` answers with `renderer.resize` (`PetriDishCanvas.tsx`). No
 * effect here keys on `fullscreen`; nothing new runs per cycle (NFR-1.1, AR-29); the HUD reads the
 * same <= 10 Hz published values the sidebar does (M2). `useSimulation`'s stable references
 * (obligation 1) are untouched by the swap, so the run never notices it (Decision D).
 *
 * Forced decision 5, option (a): props are `{ initialGrid, organisms, startingSpeed,
 * showGridLines, palette, colors, onBack, backDisabled }`. Not spec §3.11's `onExitToLab` (the
 * header owns the toggle, `<BattlePage>` flips `mode` — RFC-005 Decision 3's snippet had no
 * header) and not `cellAnimation` (no consumer until Story 6.7 — a prop nothing reads is the
 * dead-affordance rule applied to code). `palette` / `colors` / `onBack` are the same additive
 * deviations `<BattleEditorView>` carries, for the same reasons. All four recorded as §3.11
 * amendment candidates (deferred-work.md), and Story 3.18 added three more — `fullscreen`,
 * `onExitFullscreen`, `battleTitle` — for the FD1 reason above.
 */

export interface BattleSimulationViewProps {
  /** The persisted dish (A-2). The hook clones it (Story 3.10 AC2); nothing here writes to it. */
  initialGrid: RenderableGrid;
  /** One domain `Organism` per roster slot, in `rosterIds` order (M14) — `runOrganisms`. */
  organisms: readonly Organism[];
  /** The INITIAL speed only (Story 3.10 obligation 6); `<SpeedControl>` changes it live. */
  startingSpeed: GenPerSec;
  showGridLines: boolean; // FR-8.7
  /** `<BattlePage>`'s LUT over `rosterIds` — never rebuilt here (trap 5). */
  palette: RefToFillGroup;
  /** null when the theme token layer is absent (always under jsdom) — the box renders, the canvas does not. */
  colors: GridRendererColors | null;
  /** FR-7.10, through `<SidebarFooter>`; `<BattlePage>` runs the FR-7.9 guard. */
  onBack(): void;
  /** The visible half of `<BattlePage>`'s edit lock (Story 2.16 forced decision 3a, reaffirmed). */
  backDisabled?: boolean;
  /**
   * Story 3.18 (spec §3.11 amendment candidate, FD1 (a)): the stage is ON. Owned by `<BattlePage>`
   * beside `mode` — never by this view — because the ENTRY control is the header's (§3.2) and the
   * header is the page's child; the page also clears it on every mode change so a later Run entry
   * never opens straight into fullscreen. Ephemeral UI state (RFC-005): never a URL param, never
   * persisted.
   */
  fullscreen: boolean;
  /** The stage's Exit control, straight through to `<BattlePage>`'s setter (FD1 (a)). */
  onExitFullscreen(): void;
  /**
   * Story 3.19 (FD5 (a), spec §3.11 amendment candidate): the twin of `onExitFullscreen` — the
   * header's Fullscreen button's own callback, straight through from `<BattlePage>`. The view
   * composes `fullscreen ? onExitFullscreen : onEnterFullscreen` for the `F` hotkey; nothing else
   * calls it (the header's button is `<BattlePage>`'s own child and calls `handleEnterFullscreen`
   * directly).
   */
  onEnterFullscreen(): void;
  /**
   * The stage's `<h1>` while the header is unmounted (FD9): the SAME string the header shows —
   * `battleDisplayName(battleName)`, applied once by `<BattlePage>` (trap 22).
   */
  battleTitle: string;
}

// Private layout children (spec §3.3's rule for `<EditorSidebar>` / `<EditorMain>`, applied
// symmetrically to spec §2's `<SimulationSidebar>` / `<SimulationMain>`). The VALUES are
// `<BattleEditorView>`'s, copied rather than shared: every ⚠️/❌ on that file's styled blocks names
// a regression that shipped and was reverted (the `width: auto` ResizeObserver loop, the missing
// `minHeight: 0`), and the two chassis must not drift apart on toggle — read those comments before
// changing a value here.
//
// Trap 12: the sidebar is 320px, the LAB mockup's value, NOT the play mockup's 350px. One column,
// one width — a toggle that shifts the dish 30px reads as a page change, which is what RFC-005
// Decision 3 exists to avoid.
//
// Story 3.18 (FD2 (a)): every fullscreen style is a `'[data-fullscreen="true"] &'` PARENT selector
// on the EXISTING blocks (trap 17: the attribute selector must match React's stringified
// `"true"`), never a second component — a different wrapper type above the canvas in one state
// is the remount the epic's AC forbids. The stage covers the viewport by `position: fixed; inset:
// 0` with NO `z-index` (trap 15): it is later in DOM order than everything it must cover, and the
// header is unmounted while it is on (FD9). If a stacking bug ever appears, it is a DOM-order
// bug — fix the order, not the number.
const SimulationLayout = styled('div')({
  flex: 1,
  display: 'flex',
  minHeight: 0,
  '&[data-fullscreen="true"]': {
    position: 'fixed',
    inset: 0,
    background: 'var(--gol-bg-primary)',
  },
});

const SimulationSidebar = styled('aside')({
  width: '320px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: '25px',
  paddingBottom: 0,
  background: 'var(--gol-bg-secondary)',
  borderRight: '1px solid var(--gol-border)',
  overflowY: 'hidden',
});

// The `flex: 1` scroll region whose PRESENCE pins the footer at the same place as the Lab
// sidebar's. It holds Population Analysis and Cycle Count (3.14), Speed (3.13) and Grid Size
// (3.16), in the same `gap` exactly as 2.11/2.14/2.15 did on the Lab side.
const SidebarContent = styled('div')({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '25px',
  paddingBottom: '20px',
});

const SimulationMain = styled('div')({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--gol-bg-primary)',
});

// Fullscreen (3.18, FD4 (b)): no padding — the stage's title bar and HUD are `position: fixed`
// and out of flow, so this container is the whole viewport and only centres the dish; the dish's
// own `min(94vw, 138vh)` (`PetriDishBox` below) is the margin, exactly as the mockup draws it
// (`.fs-stage` centres `.petri-dish-grid` with no gutter of its own).
const GridContainer = styled('div')({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '30px',
  '[data-fullscreen="true"] &': {
    padding: 0,
  },
});

// Mockup: `.petri-dish-grid` (petri-dish-play-mode.html:440-447) — the accent border is "the cyan
// active-simulation border", the one Run-vs-Lab visual this story ships besides the toggle (AC10).
// The box values are the editor's (see above); only the border differs.
//
// Fullscreen (3.18, FD4 (b)): the mockup's `.petri-dish-grid` verbatim — `width: min(94vw,
// 138vh)` at 5:3, i.e. 94% of the viewport's width unless height binds first (138vh × 3/5 =
// 82.8vh tall), centred by `GridContainer`. The floating HUD overlaps the dish's bottom edge on
// every supported viewport (≈41px at 1280×720, where height binds; ≈23px at 1194×834, where width
// binds — the panel is opaque, so those rows are covered), as it does in the mockup; the
// top bar (≈67px: 18 + the ~31px Exit button + 18) reaches the dish's top edge (8.6vh ≈ 62px when
// height binds) by a few px at 720-tall viewports, where the gradient is already near-transparent.
// The chassis's `1000px` cap is lifted (`maxWidth: none`) — that cap is what
// "larger than the chassis" is measured against (e2e AC10 (a)), and `vw`/`vh` keep the box inside
// the viewport, which the same test asserts. The glow is `--gol-shadow-dish-glow` (the mockup's
// `box-shadow: 0 0 40px rgba(0,212,255,.12)`, composed from `--gol-accent-channel` — a static
// shadow on a box whose canvas repaints is one layer, not per-frame work).
const PetriDishBox = styled('div')({
  width: '100%',
  minWidth: 0,
  maxWidth: '1000px',
  maxHeight: '100%',
  aspectRatio: '5 / 3',
  background: 'var(--gol-bg-primary)',
  border: '2px solid var(--gol-accent)',
  '[data-fullscreen="true"] &': {
    width: 'min(94vw, 138vh)',
    maxWidth: 'none',
    maxHeight: 'none',
    boxShadow: 'var(--gol-shadow-dish-glow)',
  },
});

// Trap 13: the third `styled(PetriDishCanvas)` wrapper, carrying only what THIS variant needs —
// no `cursor: crosshair`, no `touchAction`, no `userSelect`: nothing to paint.
const DishCanvas = styled(PetriDishCanvas)({
  width: '100%',
  height: '100%',
  display: 'block',
});

export default function BattleSimulationView({
  initialGrid,
  organisms,
  startingSpeed,
  showGridLines,
  palette,
  colors,
  onBack,
  backDisabled = false,
  fullscreen,
  onExitFullscreen,
  onEnterFullscreen,
  battleTitle,
}: BattleSimulationViewProps) {
  // The one hook call. The options object is a fresh literal per render ON PURPOSE: it is not part
  // of the session key (`seed` / `scheduler` are undefined, `genPerSec` is read once — Story 3.10
  // obligation 6), so memoising it would be ceremony over nothing.
  const sim = useSimulation(initialGrid, organisms, { genPerSec: startingSpeed });

  // FD3: the VIEW decides what Play/Pause means — `sim.status` is React's truth here, so the
  // handler's closure is re-created on every status change, exactly when the label is supposed to
  // flip. The bar itself never sees `sim` (spec §3.13 gives it ONE `onPlayPause`).
  //
  // Gap closed by Story 3.15: the hook's thunk now publishes `status: 'paused'` itself on both an
  // extinction auto-pause (FR-4.7) and a mid-frame throw (the loop-facing wrappers, 3.15 FD3) — the same
  // keyed `settleStopped` write `pause()` already used. `handlePlayPause` therefore needs no guard:
  // `status` is never stale over a loop that has already stopped itself, so a button that reads
  // "Pause" always means the loop really is running.
  //
  // Deps are the three members, not `sim`: `sim` is a NEW object on every publish (its `useMemo`
  // keys on `view`, which carries `cycle`/`population` at up to 10 Hz), so `[sim]` would hand the
  // bar a fresh `onPlayPause` per published cycle — the per-cycle churn AC9 rules out. Destructured
  // first because `exhaustive-deps` treats `sim.pause()` as a method call on `sim` and demands the
  // whole object otherwise. A `[]` array would call `play()` forever (trap 2).
  const { status, play, pause } = sim;
  const handlePlayPause = useCallback(() => {
    if (status === 'playing') pause();
    else play();
  }, [status, play, pause]);

  // FD5 (a): a plain expression, not `useCallback` — both `onEnterFullscreen` and
  // `onExitFullscreen` are stable props (`<BattlePage>`'s own `useCallback`s), so memoising the
  // choice between them buys nothing and only adds a dependency array to review.
  const toggleFullscreen = fullscreen ? onExitFullscreen : onEnterFullscreen;

  // FD4 (c) — owner's decision, 2026-09-18 (superseding the shipped FD4 (a)): `Escape` stops the
  // run in BOTH layouts and, while the stage is up, ALSO exits it — the one `fullscreen` branch
  // the review's FD4 called for. In the chassis (`fullscreen === false`) this reduces to
  // `sim.stop()` alone, unchanged from what shipped. A plain function, not `useCallback`: the
  // hook reads bindings through a latest-ref and never re-subscribes on identity (trap 3), so a
  // fresh closure per render costs nothing.
  const handleEscapeStop = () => {
    sim.stop();
    if (fullscreen) onExitFullscreen();
  };

  // Story 3.19: the ONLY key handler on the route (Dev Notes constraint). The hook receives the
  // same `onPlayPause` / `onStep` the two `<TransportControls>` homes get, `canStep` — the same
  // boolean `<GridSizeControl>`'s `disabled` reads — the composed fullscreen toggle, and ONE
  // composed verb: `onStop` is `handleEscapeStop` (FD4 (c)), not `sim.stop` straight through, so
  // that the key also exits the stage; both transport homes (the bar's `onStop` and the HUD's
  // `transport.onStop` below) are unaffected and still call `sim.stop` alone. No React state in
  // the hook, no per-render re-subscription (AR-29, AC10): see `useSimulationHotkeys.ts`'s own
  // head comment for the latest-ref mechanics.
  useSimulationHotkeys({
    onPlayPause: handlePlayPause,
    onStep: sim.step,
    onStop: handleEscapeStop,
    onToggleFullscreen: toggleFullscreen,
    canStep: sim.status === 'paused',
  });

  // FD3: `totalLiving` is not a hook member (§4's `RunView` publishes no such field) — it is the
  // sum of the displayed counts, computed here as a plain render expression: O(roster) per publish
  // (<= 255 terms), no `useMemo` (the view re-renders on every publish regardless, 3.12's review
  // lesson on memoising against a value that changes as often as the render). Because it sums the
  // SAME entries the bars render, the total and the bars can never disagree.
  const totalLiving = sim.population.reduce((sum, entry) => sum + entry.count, 0);

  return (
    // AC3: `data-status` / `data-cycle` on the root, in EVERY state — the test handle the unit and
    // e2e suites already read (FD7). Story 3.14 renders the cycle as TEXT too (`<CycleCounter>`
    // below); the attributes were never promised to disappear, only to stop being the only
    // rendering — the `data-dirty` precedent (an absent attribute and a wrong one look the same to
    // a test with the wrong selector).
    //
    // Story 3.18: `data-fullscreen` joins them, rendered in BOTH states as `"false"` / `"true"`
    // (trap 10) — the e2e's and the unit tests' handle on the stage, and the selector every
    // fullscreen style above keys on.
    <SimulationLayout data-status={sim.status} data-cycle={sim.cycle} data-fullscreen={fullscreen}>
      {/* Story 3.18 (trap 1): `{!fullscreen && …}` leaves `false` in child slot 0 while the stage
          is up, so `<SimulationMain>` stays at slot 1 in both states and React never re-keys the
          subtree that holds the canvas. Unmounted, not hidden (FD2 (e)): the sidebar holds no
          state of its own — every value it shows is the hook's — and hidden-but-mounted sliders
          would stay in the accessibility tree under the stage. */}
      {!fullscreen && (
        <SimulationSidebar>
          <SidebarContent>
            {/* Spec §2's sidebar order is Population Analysis, Cycle Count (both 3.14), Speed
              (3.13), Grid Size (3.16). The first two are pure reads (`sim.population` /
              `sim.cycle`); Speed and Grid Size each read one published value (`sim.genPerSec` /
              `sim.liveSize`) and hand ONE stable hook callback straight through (`setSpeed` /
              `resizeLive`). None of the four sees `sim` itself (spec §3.12's props exactly). */}
            <SidebarSection title="Population Analysis">
              <PopulationStats entries={sim.population} totalLiving={totalLiving} />
            </SidebarSection>
            <SidebarSection title="Cycle Count">
              <CycleCounter cycle={sim.cycle} />
            </SidebarSection>
            {/* The title is "Speed", not the mockup's "Speed Multiplier" — a gen/sec value
              multiplies nothing (3.13 FD3). `sim.setSpeed` is `useCallback`-stable with no deps
              (Story 3.10), so it is passed STRAIGHT THROUGH; a wrapper keyed on `sim` would be a
              fresh closure per published cycle (trap 4 — the churn 3.12's review caught in
              `handlePlayPause`). */}
            <SidebarSection title="Speed">
              <SpeedControl genPerSec={sim.genPerSec} onChange={sim.setSpeed} />
            </SidebarSection>
            {/* Story 3.16: `sim.resizeLive` is passed STRAIGHT THROUGH (stable, Story 3.10); `disabled`
              is a render-time boolean off `sim.status`, which follows the loop on every stop path
              (3.15 FD1), so the control can never be enabled over a running loop for more than one
              render — and the hook's FD5 throw (`resizeLive` while playing) is the tripwire if it
              ever is. No `useState`, no effect, no ref. */}
            <SidebarSection title="Grid Size">
              <GridSizeControl
                value={sim.liveSize}
                onChange={sim.resizeLive}
                disabled={sim.status === 'playing'}
              />
            </SidebarSection>
          </SidebarContent>
          {/* The second caller `simulation/README.md` promised — the LAST child of the sidebar and a
            SIBLING of the content region (the pin — SidebarFooter.tsx's own comment). No prop
            added for Run mode; the same `handleBack` reaches the same FR-7.9 guard (AC9). */}
          <SidebarFooter onBack={onBack} disabled={backDisabled} />
        </SimulationSidebar>
      )}
      <SimulationMain>
        {/* Story 3.18 (FD2 (a), AC4): the stage is MOUNTED IN BOTH STATES around the UNCHANGED
            dish wrappers, rendering its title row and HUD only while `active` — `FullscreenStage.tsx`'s
            fragment comment is the reconciliation argument. The `hud` / `transport` literals are
            fresh per render ON PURPOSE: the view re-renders on every publish regardless (its
            `useMemo` on `view` is what `sim` keys on), so memoising them would be the 3.12 memo
            trap — ceremony against a value that changes as often as the render. `handlePlayPause`
            keeps its `[status, play, pause]` deps (trap 8); `sim.step` / `sim.stop` are stable. */}
        <FullscreenStage
          active={fullscreen}
          battleTitle={battleTitle}
          onExit={onExitFullscreen}
          hud={{ cycle: sim.cycle, population: sim.population, genPerSec: sim.genPerSec }}
          transport={{
            status: sim.status,
            onPlayPause: handlePlayPause,
            onStep: sim.step,
            onStop: sim.stop,
          }}
        >
          <GridContainer>
            <PetriDishBox>
              {/* `sim.liveSize`, not `initialGrid`'s dims: identical at mount, and Story 3.16's
                `<GridSizeControl>` resize rebuilds the canvas at the live size for free through
                this same prop (forced decision 6 — `<PlaybackDish>` keys its construction on the
                DIMENSIONS, Story 3.11). `attachRenderer` is `useCallback`-stable (Story 3.10 Task 4)
                and is passed STRAIGHT THROUGH — a wrapper would defeat the stability `PlaybackDish`
                relies on. */}
              {colors !== null && (
                <DishCanvas
                  variant="playback"
                  size={sim.liveSize}
                  palette={palette}
                  showGridLines={showGridLines}
                  colors={colors}
                  onRendererReady={sim.attachRenderer}
                />
              )}
            </PetriDishBox>
          </GridContainer>
        </FullscreenStage>
        {/* `sim.step` / `sim.stop` are `useCallback`-stable (Story 3.10) — passed straight
            through; a wrapper here would add a closure per render for nothing. Last child of
            `<SimulationMain>`, in flow (the `<EditorStatusBar>` placement, never the mockup's
            `position: fixed`), so the dish's `flex: 1` reserve is computed from the bar's real
            height. Story 3.18: unmounted while the stage is up — the HUD renders the SAME
            `<TransportControls>` cluster, and the two never coexist, so the `Simulation controls`
            group stays unique on the page. */}
        {!fullscreen && (
          <SimulationControlBar
            status={sim.status}
            onPlayPause={handlePlayPause}
            onStep={sim.step}
            onStop={sim.stop}
          />
        )}
      </SimulationMain>
    </SimulationLayout>
  );
}
