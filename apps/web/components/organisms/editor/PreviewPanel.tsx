'use client';

import { useCallback, useMemo, useState } from 'react';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS } from '@gol/domain';
import { clearGrid, createGrid, isGridEmpty, type Grid } from '@gol/simulation';
import PetriDishCanvas from '../../PetriDishCanvas';
import TransportControls from '../../battle/simulation/TransportControls';
import SpeedControl from '../../battle/simulation/SpeedControl';
import CycleDigits from '../../battle/simulation/CycleDigits';
import { refForTool } from '@/lib/battle/tool';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
import { useSimulation, type SimulationOrganism } from '@/lib/battle/useSimulation';
import { previewOrganismFrom } from '@/lib/organisms/previewOrganism';
import type { RuleDraft } from '@/lib/organisms/ruleDraft';
import {
  buildPreviewPalette,
  PREVIEW_GRID_SIZE,
  PREVIEW_ROSTER,
  toolForDrawMode,
  type DrawMode,
} from '@/lib/organisms/previewGrid';

// FR-8.7 names Gallery/Edit/Play; the preview is none of those, and the editor modal has no
// settings repository to read one from (4.1's page boundary loads organisms only). A module
// constant, not a `showGridLines` prop the modal cannot fill (FD5, the 4.9 FD1 "dead handle"
// rule) — the design doc draws the preview with grid lines on (`organism-editor-design.md:470`).
// Story 6.6 is the pointer for whether this setting should reach the preview at all.
const PREVIEW_GRID_LINES = true;

// FR-8.12's starting speed is a persisted setting the modal cannot read (no settings
// repository at the editor's boundary — 4.14 FD5's reasoning), so the preview starts at the
// schema's own default (Decision D.1's 10 gen/s) and the slider is the user's control from
// there. Story 6.9 decides whether the setting reaches the preview.
const PREVIEW_STARTING_SPEED = DEFAULT_SETTINGS.defaultSpeed;
// AC6's hint, verbatim — the Save gate's vocabulary (UX-DR14): a zero-condition rule IS a
// "rule error" there (`RULE_NEEDS_CONDITION`), and so it is here.
const PREVIEW_BLOCKED_HINT = 'Fix the rule errors to run the preview.';

/**
 * Story 4.14's drawing surface, and (4.15) a second, isolated `useSimulation` run over the same
 * drawn grid (M3, AR-32, RFC-005 Decision 5):
 *
 *   <PreviewPanel colorToken agingEnabled colors survivalRules>
 *     grid: useState<Grid>            (the initial state, run's `initialGrid` — AR-31)
 *     mode: useState<DrawMode>
 *     liveOrganism = previewOrganismFrom({ colorToken, survivalRules })   (4.15, memoised)
 *     roster: useState<SimulationOrganism[]>   (4.15, follows the draft AT REST — FD2)
 *     sim = useSimulation(grid, roster, { genPerSec: PREVIEW_STARTING_SPEED })   (4.15, the ONE hook call)
 *     atRest = sim.status === 'paused' && sim.cycle === 0
 *     <PreviewDishBox>
 *       {atRest
 *         ? <PreviewCanvas variant="edit" ... onStrokeCommit={setGrid}/>
 *         : <PreviewRunCanvas variant="playback" onRendererReady={sim.attachRenderer}/>}
 *     <DrawingControls role="group">        (disabled={!atRest})
 *       Draw | Erase | Clear
 *     <SimulationSection>                   (4.15)
 *       <TransportControls compact disabled={startBlocked} .../>
 *       {startBlocked && <RunHint/>}
 *       <SpeedControl .../>
 *       <CycleBlock><CycleDigits/></CycleBlock>
 *
 * The panel takes no repository, no callback into the draft, no `onChange` — it reads the draft's
 * rendering fields and its live rules and writes nothing back (M3, AR-32, AR-33; RFC-005 Decision
 * 1: ephemeral UI state, its own subtree and refs). The battle's state is never reachable: no
 * `<BattlePage>` import, no shared ref, no repository. (Story 4.14) (Story 4.15) (FR-2.7) (M3)
 * (UX-DR13) (AR-32) (FR-4.7)
 */
export interface PreviewPanelProps {
  /** The draft's two rendering fields (Story 4.7/4.8) — read on every render, never
   *  written. A pick or a flip re-mints the palette below, which is what repaints the
   *  drawn cells (Story 4.8 AC4's "follows by construction"). */
  colorToken: string;
  agingEnabled: boolean;
  /** Resolved ONCE by the modal (`readGridColors`); `null` = no token layer -> the box
   *  renders with no canvas (the `<BattleEditorView>` degradation, never a literal). */
  colors: GridRendererColors | null;
  /** Story 4.15: the draft's live rules, read on every render. The run compiles them
   *  (`previewOrganismFrom`) — at rest on every change, mid-run never (FD2). */
  survivalRules: readonly RuleDraft[];
}

// Mockup `.preview-canvas` (`organism-editor.html:729-736`) minus `cursor`/`image-rendering` — the
// canvas wears the cursor, and the renderer paints integer-aligned rects, so `pixelated` has
// nothing to do here.
//
// ⚠️ `width` stays DEFINITE (`100%`), never `auto` — this element is what `<PetriDishCanvas>`'s
// `ResizeObserver` observes, and an auto width derived from the canvas's intrinsic size is the
// paint -> resize -> paint loop the Story 2.12 review hit (20 e2e failures across four projects,
// `BattleEditorView.tsx:322-345`). Decorative `--gol-border` is fine here (the surface itself is
// the boundary — `--gol-bg-primary` against the column's `--gol-bg-secondary`), unlike a button's
// only edge.
const PreviewDishBox = styled('div')({
  width: '100%',
  minWidth: 0,
  aspectRatio: '3 / 2',
  background: 'var(--gol-bg-primary)',
  border: '1px solid var(--gol-border)',
});

// Pointer comment to `BattleEditorView.tsx:346-378` (`DishCanvas`): copied across the feature
// split, never imported — the 4.13 `<SaveErrorLine>` precedent. `touch-action: none` must be CSS
// on the element receiving the pointer, set before the gesture (Story 2.6 FD4).
const PreviewCanvas = styled(PetriDishCanvas)({
  width: '100%',
  height: '100%',
  display: 'block',
  cursor: 'crosshair',
  touchAction: 'none',
  userSelect: 'none',
});

// The run surface — `BattleSimulationView.tsx`'s `DishCanvas` (`:243-248`), copied with a pointer:
// no `crosshair`, no `touch-action` (nothing to paint, nothing to capture). `PreviewCanvas` (4.14)
// is unchanged and stays the edit surface.
const PreviewRunCanvas = styled(PetriDishCanvas)({
  width: '100%',
  height: '100%',
  display: 'block',
});

// Mockup `.drawing-controls` (`:738-742`).
const DrawingControls = styled('div')({
  display: 'flex',
  gap: '10px',
  marginTop: '15px',
});

// Mockup `.btn-tool` (`:744-769`) with the two house substitutions: `--gol-border-control` for a
// button's only boundary (SC 1.4.11 — `EditorToolsSection.tsx:27-30`), and no `transition` (the
// axe-mid-fade rule every editor control records). The pressed state is carried by `aria-pressed`
// (FD3); the accent border + text are its second visual channel (WCAG 1.4.1 —
// `OrganismRoster.tsx:72-79`).
const ToolButton = styled('button')({
  flex: 1,
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-secondary)',
  padding: '10px',
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  '&[aria-pressed="true"]': {
    borderColor: 'var(--gol-accent)',
    color: 'var(--gol-accent)',
  },
  '&:hover:not(:disabled):not([aria-pressed="true"])': {
    borderColor: 'var(--gol-text-primary)',
    color: 'var(--gol-text-primary)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    borderColor: 'var(--gol-border)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
});

// Mockup `.sim-controls`' `margin-top: 20px` (`organism-editor.html:770-776`); the grid-of-three is
// replaced by the reused cluster's own layout (FD8).
const SimulationSection = styled('div')({
  marginTop: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
});

// The 3.16 "Adjustable while paused" hint's clothes.
const RunHint = styled('p')({
  margin: '-6px 0 0',
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
});

// Mockup `.cycle-counter` / `.cycle-label` / `.cycle-value` (`:798-815`) with the house's
// `tabular-nums` (3.14: an odometer, not a quantity) and the HUD's `2px` tracking in place of the
// mockup's `-1px` (a zero-padded run reads better spaced than squeezed; a style call, recorded).
const CycleBlock = styled('div')({
  textAlign: 'center',
});
const CycleLabel = styled('div')({
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--gol-text-secondary)',
  marginBottom: '5px',
});
const CycleValue = styled('div')({
  fontSize: '36px',
  fontWeight: 600,
  color: 'var(--gol-accent)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '2px',
});

export default function PreviewPanel({
  colorToken,
  agingEnabled,
  colors,
  survivalRules,
}: PreviewPanelProps) {
  const [mode, setMode] = useState<DrawMode>('draw');
  // The drawn pattern — ephemeral UI state, local to this panel (M3: "its own subtree and refs";
  // RFC-005 Decision 1). NOT on `OrganismDraft`: 4.16 persists that object and 4.23 diffs it, and
  // the AC says never-persisted / never dirty (FD2). Same lifetime as the modal (the `mounted`
  // gate unmounts both) — an empty dish per open, by construction. This is also the RUN's
  // `initialGrid` (AR-31): the hook clones it, and the live grid is discarded on Stop.
  const [grid, setGrid] = useState<Grid>(() =>
    createGrid(PREVIEW_GRID_SIZE.cols, PREVIEW_GRID_SIZE.rows),
  );
  // Identity-stable per (token, aging): one of EditDish's three construction dependencies. A
  // palette built per render would rebuild the renderer on every keystroke in the name field
  // (FD4).
  const palette = useMemo(
    () => buildPreviewPalette({ colorToken, agingEnabled }),
    [colorToken, agingEnabled],
  );

  // The organism the NEXT run would compile — `null` while a rule cannot run (AC6). Memoised on
  // the two draft fields it reads: a name keystroke or a dominance drag must not touch it (see
  // `previewOrganism.ts`).
  const liveOrganism = useMemo(
    () => previewOrganismFrom({ colorToken, survivalRules }),
    [colorToken, survivalRules],
  );
  // FD2 — the run's roster is PANEL STATE, so its identity — the hook's session key (3.10
  // obligation 1) — moves only when this component says so. Seeded from the live organism
  // (a fresh or record-seeded draft is always runnable); `[]` is the type-total fallback for
  // an unrunnable seed, which Play (`startBlocked`) never lets run.
  const [roster, setRoster] = useState<readonly SimulationOrganism[]>(() =>
    liveOrganism === null ? [] : [liveOrganism],
  );
  // The one hook call (M3: "a second isolated `useSimulation` instance"). `grid` is the drawn
  // sketch — the run's `initialGrid`, cloned by the hook (AR-31); the options literal is not
  // part of the key (3.11's reasoning), so no memo.
  const sim = useSimulation(grid, roster, { genPerSec: PREVIEW_STARTING_SPEED });
  // "At rest" = nothing has happened yet: paused at cycle 0 — after mount, after Stop, or after
  // a Pause that beat the first cycle. Everything below keys on it: which canvas is mounted,
  // whether the tools are live, whether the roster may follow the draft.
  const atRest = sim.status === 'paused' && sim.cycle === 0;
  // Render-phase adjustment — React's documented "adjusting state when a prop changes", the
  // same form `useSimulation` and `useUndoableGrid` use (never a `setState` in an effect,
  // `react-hooks/set-state-in-effect`): at rest the roster follows the draft, so the next
  // Play compiles the rules as they are NOW; mid-run it is frozen, so a rule edit changes
  // nothing until Stop (AC2 — "rule edits apply on the next run"). An unrunnable draft
  // (`null`) leaves the last runnable roster in place; `startBlocked` keeps it from running.
  if (atRest && liveOrganism !== null && roster[0] !== liveOrganism) {
    setRoster([liveOrganism]);
  }
  const startBlocked = atRest && liveOrganism === null;

  const tool = toolForDrawMode(mode);
  const toolRef = refForTool(tool, PREVIEW_ROSTER);
  const empty = isGridEmpty(grid); // 600 cells, per render — cheaper than a memo's bookkeeping

  // The guard INSIDE the updater keeps it pure and same-reference on a no-op (the
  // `setSurvivalRules` idiom): an equal-but-new empty grid would `drawFull` for nothing.
  const handleClear = useCallback(() => setGrid((g) => (isGridEmpty(g) ? g : clearGrid(g))), []);

  // 3.12 FD3: the PANEL decides what Play/Pause means; the cluster gets one handler. Deps are
  // the three members, never `sim` — a new object per publish (3.11's trap).
  const { status, play, pause } = sim;
  const handlePlayPause = useCallback(() => {
    if (status === 'playing') pause();
    else play();
  }, [status, play, pause]);

  return (
    <>
      {/* Keyed on `atRest`, not `status`: a paused run at cycle 42 (an auto-pause, FD3) must keep
          the live grid and the run surface, so `status === 'paused'` alone would wrongly swap back
          to the sketch. Keyed on `cycle === 0` alone would show the run surface for a paused-at-0
          run (correct: nothing happened, still the sketch) — so both together is the rest key. */}
      <PreviewDishBox data-preview-dish data-status={sim.status} data-cycle={sim.cycle}>
        {colors !== null &&
          (atRest ? (
            <PreviewCanvas
              variant="edit"
              grid={grid}
              size={PREVIEW_GRID_SIZE}
              palette={palette}
              showGridLines={PREVIEW_GRID_LINES}
              colors={colors}
              tool={tool}
              toolRef={toolRef}
              onStrokeCommit={setGrid}
            />
          ) : (
            <PreviewRunCanvas
              variant="playback"
              size={PREVIEW_GRID_SIZE}
              palette={palette}
              showGridLines={PREVIEW_GRID_LINES}
              colors={colors}
              onRendererReady={sim.attachRenderer}
            />
          ))}
      </PreviewDishBox>
      {/* The sketch cannot change under a live grid — the hook's `initialGrid` stays the
          reference the session was keyed on (3.10 obligation 1). Tools re-enable when Stop
          returns the panel to rest. */}
      <DrawingControls role="group" aria-label="Drawing tools">
        <ToolButton
          type="button"
          aria-pressed={mode === 'draw'}
          disabled={!atRest}
          onClick={() => setMode('draw')}
        >
          Draw
        </ToolButton>
        <ToolButton
          type="button"
          aria-pressed={mode === 'erase'}
          disabled={!atRest}
          onClick={() => setMode('erase')}
        >
          Erase
        </ToolButton>
        {/* Disabled while empty OR mid-run, not a silent no-op (NFR-4.1 — an enabled control that
            does nothing is the dead affordance; the 2.15 form). No confirmation: the dish is a
            sketch, and 2.15's Clear has none either. */}
        <ToolButton type="button" onClick={handleClear} disabled={!atRest || empty}>
          Clear
        </ToolButton>
      </DrawingControls>
      <SimulationSection>
        <TransportControls
          compact
          status={sim.status}
          onPlayPause={handlePlayPause}
          onStep={sim.step}
          onStop={sim.stop}
          disabled={startBlocked}
        />
        {startBlocked && <RunHint>{PREVIEW_BLOCKED_HINT}</RunHint>}
        <SpeedControl genPerSec={sim.genPerSec} onChange={sim.setSpeed} />
        <CycleBlock data-preview-cycle>
          <CycleLabel>Cycle</CycleLabel>
          <CycleValue>
            <CycleDigits cycle={sim.cycle} />
          </CycleValue>
        </CycleBlock>
      </SimulationSection>
    </>
  );
}
