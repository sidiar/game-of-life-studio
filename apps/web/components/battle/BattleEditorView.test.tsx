import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { fireEvent } from '@testing-library/react';
import { RecordingContext2D } from '@/lib/recordingContext2d';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import BattleEditorView from './BattleEditorView';

const COLORS = { background: '#0a0a0a', gridLine: 'rgb(51 51 51 / 0.3)' };
const SIZE = { cols: 2, rows: 2 };

function makeGrid(width: number, height: number, occupant: number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: new Uint16Array(occupant.length),
  };
}

function makeLut(tokenIndex: number[], aging: number[]): RefToFillGroup {
  return {
    tokenIndex: Uint8Array.from(tokenIndex),
    aging: Uint8Array.from(aging),
    size: tokenIndex.length,
  };
}

const GRID = makeGrid(2, 2, [1, 0, 0, 1]);
const PALETTE = makeLut([0, 0], [0, 0]);
// The roster union <BattlePage> owns. Conway's Classic is index 0, so the default tool resolves
// to ref 1 — the same `index + 1` encoding the palette LUT above is built on.
const ROSTER = [CONWAYS_CLASSIC_ID];

describe('BattleEditorView', () => {
  it('renders the dish box and its canvas (AC1)', () => {
    const { container } = render(
      <BattleEditorView
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        rosterIds={ROSTER}
        onCommitGrid={() => {}}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    // The editor's dish carries an accessible name (AC7) — the inverse of the Gallery tile's
    // aria-hidden snapshot.
    expect(canvas).toHaveAttribute('role', 'img');
  });

  // Same "unavailable -> blank dish, same box" degradation BattleTile uses (Task 6): never
  // substitute a literal colour (AR-46, and it would silently paint the wrong theme).
  it('renders the box WITHOUT a canvas when colors is null', () => {
    const { container } = render(
      <BattleEditorView
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={null}
        rosterIds={ROSTER}
        onCommitGrid={() => {}}
      />,
    );

    expect(container.querySelector('canvas')).toBeNull();
  });

  // AC5 — this story is display-only: no sidebar, no status bar, no tool, no button, and no inert
  // placeholder standing in for any of them (NFR-4.1). Assert the ABSENCE, the way
  // BattleHeader.test.tsx asserts the mode toggle's absence — a presence-only check elsewhere
  // would still pass once a dead placeholder is added beside the canvas.
  it('renders no sidebar, status bar, tool, or button (AC5)', () => {
    render(
      <BattleEditorView
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        rosterIds={ROSTER}
        onCommitGrid={() => {}}
      />,
    );

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('complementary')).toHaveLength(0);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryAllByRole('toolbar')).toHaveLength(0);
  });
});

// The commit seam (Story 2.5, AC4/AC5). `<BattleEditorView>` owns `selectedTool` and resolves it
// to a ref against the roster union; the canvas paints and commits; this component only forwards.
describe('BattleEditorView — the commit seam (Story 2.5)', () => {
  // 20x10 against jsdom's default 300x150 canvas box gives cellSize 15 and zero margins, so cell
  // (col, row) sits at ((col + 0.5) * 15, (row + 0.5) * 15). See PetriDishCanvas.test.tsx.
  const PLACE_SIZE = { cols: 20, rows: 10 };
  const CELL = 15;
  const EMPTY_GRID = makeGrid(20, 10, new Array(200).fill(0));
  // Conway's Classic deliberately SECOND: a default tool that resolved to "whatever is first"
  // would give ref 1 here and the assertion below could not tell the two apart.
  const ROSTER_WITH_CONWAY_SECOND = ['some-other-organism', CONWAYS_CLASSIC_ID];
  const PALETTE_3 = makeLut([0, 0, 0], [0, 0, 0]);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountEditor(onCommitGrid: (next: RenderableGrid) => void) {
    const contexts = new Map<HTMLCanvasElement, RecordingContext2D>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      let context = contexts.get(this);
      if (context === undefined) {
        context = new RecordingContext2D();
        contexts.set(this, context);
      }
      return context as unknown as CanvasRenderingContext2D;
    });

    const { container } = render(
      <BattleEditorView
        grid={EMPTY_GRID}
        size={PLACE_SIZE}
        palette={PALETTE_3}
        showGridLines
        colors={COLORS}
        rosterIds={ROSTER_WITH_CONWAY_SECOND}
        onCommitGrid={onCommitGrid}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    // jsdom has no layout — getBoundingClientRect() is all zeros, which maps to "no cell".
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 300,
      height: 150,
      right: 300,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    return canvas;
  }

  // AC4 + AC5 in one falsifiable assertion. The committed cell's value is `index + 1` into the
  // roster (RFC-006 Decision 2), so ref 2 proves BOTH that the canvas's onStrokeCommit reached
  // onCommitGrid unchanged AND that the selected tool is Conway's Classic rather than "the first
  // roster entry".
  it('forwards the canvas commit to onCommitGrid, carrying the DEFAULT tool’s ref (AC4, AC5)', () => {
    const onCommitGrid = vi.fn();
    const canvas = mountEditor(onCommitGrid);

    fireEvent.pointerDown(canvas, {
      clientX: 3 * CELL + CELL / 2,
      clientY: 4 * CELL + CELL / 2,
      button: 0,
      isPrimary: true,
    });

    expect(onCommitGrid).toHaveBeenCalledTimes(1);
    const next = onCommitGrid.mock.calls[0][0] as RenderableGrid;
    expect(next).not.toBe(EMPTY_GRID);
    expect(next.occupant[4 * PLACE_SIZE.cols + 3]).toBe(
      ROSTER_WITH_CONWAY_SECOND.indexOf(CONWAYS_CLASSIC_ID) + 1,
    );
    // Nothing is transformed on the way through: every other cell is untouched.
    expect([...next.occupant].filter((v) => v !== 0)).toHaveLength(1);
  });

  // The tool resolves against the roster it is GIVEN. An empty roster means no ref, and a click
  // must then place nothing rather than writing ref 0 — which means EMPTY (Story 2.7's eraser).
  it('commits nothing when the roster contains no match for the selected tool', () => {
    const onCommitGrid = vi.fn();
    const contexts = new Map<HTMLCanvasElement, RecordingContext2D>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      let context = contexts.get(this);
      if (context === undefined) {
        context = new RecordingContext2D();
        contexts.set(this, context);
      }
      return context as unknown as CanvasRenderingContext2D;
    });
    const { container } = render(
      <BattleEditorView
        grid={EMPTY_GRID}
        size={PLACE_SIZE}
        palette={PALETTE_3}
        showGridLines
        colors={COLORS}
        rosterIds={[]}
        onCommitGrid={onCommitGrid}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 300,
      height: 150,
      right: 300,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.pointerDown(canvas, {
      clientX: 3 * CELL + CELL / 2,
      clientY: 4 * CELL + CELL / 2,
      button: 0,
      isPrimary: true,
    });

    expect(onCommitGrid).not.toHaveBeenCalled();
  });

  // Forced decision 6: a paintable surface that keeps the default arrow reads as inert. Styled on
  // the EDIT wrapper only — the Gallery's static tiles must not advertise interaction.
  it('gives the editor dish a placement cursor', () => {
    const { container } = render(
      <BattleEditorView
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        rosterIds={ROSTER}
        onCommitGrid={() => {}}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(getComputedStyle(canvas).cursor).toBe('crosshair');
  });
});
