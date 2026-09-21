'use client';

import { useCallback, useMemo, useState } from 'react';
import { styled } from '@mui/material/styles';
import { clearGrid, createGrid, isGridEmpty, type Grid } from '@gol/simulation';
import PetriDishCanvas from '../../PetriDishCanvas';
import { refForTool } from '@/lib/battle/tool';
import type { GridRendererColors } from '@/lib/canvas/gridRenderer';
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

/**
 * Story 4.14's drawing surface: a 30x20 dish (`<PetriDishCanvas variant="edit">`, unmodified) plus
 * Draw/Erase/Clear. Everything below is a copy of `<BattleEditorView>`'s edit-canvas wiring,
 * scaled to one organism (FD1's "shape 4.15 inherits" — see the story's Dev Notes):
 *
 *   <PreviewPanel colorToken agingEnabled colors>
 *     grid: useState<Grid>            (the initial state)     <- 4.15: useSimulation(grid, [organism], opts)
 *     mode: useState<DrawMode>
 *     <PreviewDishBox>                                       <- 4.15: while a session exists, render
 *       <PreviewCanvas variant="edit" ... onStrokeCommit={setGrid}/>   variant="playback" here instead
 *     <DrawingControls role="group">                         <- 4.15: disabled while running
 *       Draw | Erase | Clear
 *                                                            <- 4.15 appends: Play/Step/Stop, speed, cycle
 *
 * The panel takes no repository, no callback into the draft, no `onChange` — it reads two draft
 * fields and writes nothing back (M3, AR-32, AR-33; RFC-005 Decision 1: ephemeral UI state, its
 * own subtree and refs). (Story 4.14) (FR-2.7) (M3) (UX-DR13)
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

export default function PreviewPanel({ colorToken, agingEnabled, colors }: PreviewPanelProps) {
  const [mode, setMode] = useState<DrawMode>('draw');
  // The drawn pattern — ephemeral UI state, local to this panel (M3: "its own subtree and refs";
  // RFC-005 Decision 1). NOT on `OrganismDraft`: 4.16 persists that object and 4.23 diffs it, and
  // the AC says never-persisted / never dirty (FD2). Same lifetime as the modal (the `mounted`
  // gate unmounts both) — an empty dish per open, by construction.
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
  const tool = toolForDrawMode(mode);
  const toolRef = refForTool(tool, PREVIEW_ROSTER);
  const empty = isGridEmpty(grid); // 600 cells, per render — cheaper than a memo's bookkeeping

  // The guard INSIDE the updater keeps it pure and same-reference on a no-op (the
  // `setSurvivalRules` idiom): an equal-but-new empty grid would `drawFull` for nothing.
  const handleClear = useCallback(() => setGrid((g) => (isGridEmpty(g) ? g : clearGrid(g))), []);

  return (
    <>
      <PreviewDishBox data-preview-dish>
        {colors !== null && (
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
        )}
      </PreviewDishBox>
      <DrawingControls role="group" aria-label="Drawing tools">
        <ToolButton type="button" aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>
          Draw
        </ToolButton>
        <ToolButton type="button" aria-pressed={mode === 'erase'} onClick={() => setMode('erase')}>
          Erase
        </ToolButton>
        {/* Disabled while empty, not a silent no-op (NFR-4.1 — an enabled control that does
            nothing is the dead affordance; the 2.15 form). No confirmation: the dish is a
            sketch, and 2.15's Clear has none either. */}
        <ToolButton type="button" onClick={handleClear} disabled={empty}>
          Clear
        </ToolButton>
      </DrawingControls>
    </>
  );
}
