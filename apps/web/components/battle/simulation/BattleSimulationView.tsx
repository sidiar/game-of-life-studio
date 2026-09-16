'use client';

import { useCallback } from 'react';
import { styled } from '@mui/material/styles';
import type { Organism } from '@gol/domain';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { useSimulation, type GenPerSec } from '@/lib/battle/useSimulation';
import PetriDishCanvas from '../../PetriDishCanvas';
import SidebarFooter from '../SidebarFooter';
import SidebarSection from '../SidebarSection';
import CycleCounter from './CycleCounter';
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
 * Deliberately ABSENT, by story: `<GridSizeControl>` (3.16), fullscreen (3.18), hotkeys (3.19). The
 * extinction auto-pause (FR-4.7, Decision B.5, Story 3.15) is the hook's alone — this component
 * gains no state, hook, effect or prop for it; it is observed through `status` exactly like a
 * manual pause. The transport bar shipped in 3.12:
 * `<SimulationControlBar>` is the only thing that moves the view off paused-at-cycle-0, and
 * `handlePlayPause` below is the one derivation genuinely new there — which verb Play/Pause means,
 * decided from `status` (3.12 FD3). The Speed section shipped in 3.13: `<SpeedControl>` reads
 * `sim.genPerSec` and hands `sim.setSpeed` straight through — the view holds NO speed state of its
 * own (3.10 FD6: the hook is the only holder of the speed). Story 3.14 added
 * `<PopulationStats>` / `<CycleCounter>`, ABOVE the Speed section (spec §2): both are pure
 * presentational reads of `sim.population` / `sim.cycle`, so the view gains a `totalLiving` reduce
 * (FD3) and no hook, state, ref or effect of its own.
 *
 * Forced decision 5, option (a): props are `{ initialGrid, organisms, startingSpeed,
 * showGridLines, palette, colors, onBack, backDisabled }`. Not spec §3.11's `onExitToLab` (the
 * header owns the toggle, `<BattlePage>` flips `mode` — RFC-005 Decision 3's snippet had no
 * header) and not `cellAnimation` (no consumer until Story 6.7 — a prop nothing reads is the
 * dead-affordance rule applied to code). `palette` / `colors` / `onBack` are the same additive
 * deviations `<BattleEditorView>` carries, for the same reasons. All four recorded as §3.11
 * amendment candidates (deferred-work.md).
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
const SimulationLayout = styled('div')({
  flex: 1,
  display: 'flex',
  minHeight: 0,
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
// sidebar's. It holds Population Analysis and Cycle Count (3.14) and Speed (3.13); 3.16 drops
// Grid Size into the same `gap` exactly as 2.11/2.14/2.15 did on the Lab side.
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

const GridContainer = styled('div')({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '30px',
});

// Mockup: `.petri-dish-grid` (petri-dish-play-mode.html:440-447) — the accent border is "the cyan
// active-simulation border", the one Run-vs-Lab visual this story ships besides the toggle (AC10).
// The box values are the editor's (see above); only the border differs.
const PetriDishBox = styled('div')({
  width: '100%',
  minWidth: 0,
  maxWidth: '1000px',
  maxHeight: '100%',
  aspectRatio: '5 / 3',
  background: 'var(--gol-bg-primary)',
  border: '2px solid var(--gol-accent)',
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
  // extinction auto-pause (FR-4.7) and a mid-frame throw (the loop-facing wrappers, FD3) — the same
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
    <SimulationLayout data-status={sim.status} data-cycle={sim.cycle}>
      <SimulationSidebar>
        <SidebarContent>
          {/* Spec §2's sidebar order is Population Analysis, Cycle Count (both 3.14), Speed
              (3.13), Grid Size (3.16). Both new sections are pure reads of `sim.population` /
              `sim.cycle` — neither component sees `sim` (spec §3.12's props exactly). */}
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
        </SidebarContent>
        {/* The second caller `simulation/README.md` promised — the LAST child of the sidebar and a
            SIBLING of the content region (the pin — SidebarFooter.tsx's own comment). No prop
            added for Run mode; the same `handleBack` reaches the same FR-7.9 guard (AC9). */}
        <SidebarFooter onBack={onBack} disabled={backDisabled} />
      </SimulationSidebar>
      <SimulationMain>
        <GridContainer>
          <PetriDishBox>
            {/* `sim.liveSize`, not `initialGrid`'s dims: identical today, and Story 3.16's
                ephemeral resize then rebuilds the canvas at the live size for free (forced decision
                6). `attachRenderer` is `useCallback`-stable (Story 3.10 Task 4) and is passed
                STRAIGHT THROUGH — a wrapper would defeat the stability `PlaybackDish` relies on. */}
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
        {/* `sim.step` / `sim.stop` are `useCallback`-stable (Story 3.10) — passed straight
            through; a wrapper here would add a closure per render for nothing. Last child of
            `<SimulationMain>`, in flow (the `<EditorStatusBar>` placement, never the mockup's
            `position: fixed`), so the dish's `flex: 1` reserve is computed from the bar's real
            height. */}
        <SimulationControlBar
          status={sim.status}
          onPlayPause={handlePlayPause}
          onStep={sim.step}
          onStop={sim.stop}
        />
      </SimulationMain>
    </SimulationLayout>
  );
}
