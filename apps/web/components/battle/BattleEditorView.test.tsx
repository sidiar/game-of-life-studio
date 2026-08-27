import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
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

// Story 2.8: the prop set every bare render below supplies identically, in ONE place. Four call
// sites had hand-copied it, so this story's two new props would have meant four identical edits —
// the duplicated-test-helper finding this file's own `mountEditor` comment already records.
function renderEditor(overrides: Partial<ComponentProps<typeof BattleEditorView>> = {}) {
  return render(
    <BattleEditorView
      grid={GRID}
      size={SIZE}
      palette={PALETTE}
      showGridLines
      colors={COLORS}
      rosterIds={ROSTER}
      onCommitGrid={() => {}}
      onUndo={() => {}}
      canUndo={false}
      {...overrides}
    />,
  );
}

describe('BattleEditorView', () => {
  it('renders the dish box and its canvas (AC1)', () => {
    const { container } = renderEditor();

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    // The editor's dish carries an accessible name (AC7) — the inverse of the Gallery tile's
    // aria-hidden snapshot.
    expect(canvas).toHaveAttribute('role', 'img');
  });

  // Same "unavailable -> blank dish, same box" degradation BattleTile uses (Task 6): never
  // substitute a literal colour (AR-46, and it would silently paint the wrong theme).
  it('renders the box WITHOUT a canvas when colors is null', () => {
    const { container } = renderEditor({ colors: null });

    expect(container.querySelector('canvas')).toBeNull();
  });

  // AC5 (Story 2.5) — this story shipped display-only: no sidebar, no status bar, no button, and
  // no inert placeholder standing in for any of them (NFR-4.1). Story 2.7 adds the FIRST working
  // control (the provisional tool toggle below), so "no button" is no longer the claim — updated
  // rather than left asserting something now false. What still does not exist is unchanged: no
  // sidebar, no status bar, no textbox. Assert the ABSENCE, the way BattleHeader.test.tsx asserts
  // the mode toggle's absence — a presence-only check elsewhere would still pass once a dead
  // placeholder is added beside the canvas.
  it('renders no sidebar or textbox — only the tool toggle and the status bar’s UNDO (AC5)', () => {
    renderEditor();

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('complementary')).toHaveLength(0);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    // The toggle's own group carries the accessible name; nothing else claims 'toolbar'.
    expect(screen.queryAllByRole('toolbar')).toHaveLength(0);
    // Exactly three buttons — Draw, Erase and Undo — nothing more. Story 2.8 added the third:
    // <EditorStatusBar> ships with UNDO ALONE, so the SAVE button (2.13) and the stats row (2.12)
    // must still be absent, which is what the count pins. review (2026-08-27): named, not merely
    // counted — a bare length check passes if one control is swapped for a dead one, the exact
    // failure the surrounding NFR-4.1 claim is about.
    expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erase' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    // 2.12's stats row: no Generation / Living Cells text anywhere yet (NFR-4.1).
    expect(screen.queryByText(/generation/i)).toBeNull();
    expect(screen.queryByText(/living cells/i)).toBeNull();
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

  // review (2026-08-26): `rosterIds` is a parameter, not a second hand-copied mount, so the
  // "no ref in the roster" case below reuses the exact same mount/mock/rect-stub wiring instead
  // of re-declaring it — the same discipline the story's own e2e helpers already apply to
  // `seedWorkspace`.
  //
  // Story 2.7: also returns `rerenderWithGrid`, standing in for <BattlePage> feeding a committed
  // grid back down as the next `grid` prop — the round trip the "switches tool ref" test below
  // needs to prove an erase actually empties a cell the PRIOR commit painted. review (2026-08-27):
  // the three pre-existing call sites were updated to destructure `{ canvas }` in this same change
  // — the previous wording here claimed they were untouched.
  //
  // Story 2.8: `onUndo` / `canUndo` are parameters here for the same reason `rosterIds` is one —
  // the undo forwarding tests need to vary them without a second hand-copied mount.
  function mountEditor(
    onCommitGrid: (next: RenderableGrid) => void,
    rosterIds: readonly string[] = ROSTER_WITH_CONWAY_SECOND,
    undo: { onUndo?: () => void; canUndo?: boolean } = {},
  ) {
    const { onUndo = () => {}, canUndo = false } = undo;
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

    const view = render(
      <BattleEditorView
        grid={EMPTY_GRID}
        size={PLACE_SIZE}
        palette={PALETTE_3}
        showGridLines
        colors={COLORS}
        rosterIds={rosterIds}
        onCommitGrid={onCommitGrid}
        onUndo={onUndo}
        canUndo={canUndo}
      />,
    );
    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
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

    function rerenderWithGrid(grid: RenderableGrid, nextCanUndo: boolean = canUndo) {
      view.rerender(
        <BattleEditorView
          grid={grid}
          size={PLACE_SIZE}
          palette={PALETTE_3}
          showGridLines
          colors={COLORS}
          rosterIds={rosterIds}
          onCommitGrid={onCommitGrid}
          onUndo={onUndo}
          canUndo={nextCanUndo}
        />,
      );
    }

    return { canvas, container: view.container, rerenderWithGrid };
  }

  // AC4 + AC5 in one falsifiable assertion. The committed cell's value is `index + 1` into the
  // roster (RFC-006 Decision 2), so ref 2 proves BOTH that the canvas's onStrokeCommit reached
  // onCommitGrid unchanged AND that the selected tool is Conway's Classic rather than "the first
  // roster entry".
  it('forwards the canvas commit to onCommitGrid, carrying the DEFAULT tool’s ref (AC4, AC5)', () => {
    const onCommitGrid = vi.fn();
    const { canvas } = mountEditor(onCommitGrid);

    // Story 2.6: the commit lands on pointer-up, not pointer-down (trap 2).
    fireEvent.pointerDown(canvas, {
      clientX: 3 * CELL + CELL / 2,
      clientY: 4 * CELL + CELL / 2,
      button: 0,
      isPrimary: true,
    });
    fireEvent.pointerUp(canvas, {
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

  // Story 2.6 Task 7, added in review (2026-08-27): the click above is the DEGENERATE stroke, so
  // on its own it never proves the coalescing that RFC-005 Decision 6 and Story 2.8's undo ring
  // both depend on. A real press-drag-release has to cross this seam exactly once too — with the
  // interpolated cells included, since `cellsBetween` runs inside <PetriDishCanvas> and only the
  // committed grid shows whether they survived the trip through `onStrokeCommit`.
  it('coalesces a whole drag into ONE onCommitGrid call carrying every traversed cell (AC4, AC5)', () => {
    const onCommitGrid = vi.fn();
    const { canvas } = mountEditor(onCommitGrid);
    const at = (col: number, row: number) => ({
      clientX: col * CELL + CELL / 2,
      clientY: row * CELL + CELL / 2,
      button: 0,
      isPrimary: true,
    });

    fireEvent.pointerDown(canvas, at(2, 4));
    // `buttons: 1` is the move-time bitmask — `button` is -1 on a pointermove, and a move
    // reporting no primary button self-terminates the stroke (trap 5).
    fireEvent.pointerMove(canvas, { ...at(4, 4), buttons: 1 });
    // One jump of four columns: the intervening cells exist only if the interpolation reached
    // the committed grid.
    fireEvent.pointerMove(canvas, { ...at(8, 4), buttons: 1 });
    expect(onCommitGrid).not.toHaveBeenCalled(); // one gesture, still open.
    fireEvent.pointerUp(canvas, { ...at(8, 4), buttons: 0 });

    expect(onCommitGrid).toHaveBeenCalledTimes(1);
    const next = onCommitGrid.mock.calls[0][0] as RenderableGrid;
    const ref = ROSTER_WITH_CONWAY_SECOND.indexOf(CONWAYS_CLASSIC_ID) + 1;
    const painted = [...next.occupant].flatMap((value, index) => (value === 0 ? [] : [index]));
    expect(painted).toEqual(
      Array.from({ length: 7 }, (_, i) => 4 * PLACE_SIZE.cols + (i + 2)), // cols 2..8 on row 4
    );
    for (const index of painted) expect(next.occupant[index]).toBe(ref);
  });

  // The tool resolves against the roster it is GIVEN. An empty roster means no ref, and a click
  // must then place nothing rather than writing ref 0 — which means EMPTY (Story 2.7's eraser).
  it('commits nothing when the roster contains no match for the selected tool', () => {
    const onCommitGrid = vi.fn();
    const { canvas } = mountEditor(onCommitGrid, []);

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
    const { container } = renderEditor();
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(getComputedStyle(canvas).cursor).toBe('crosshair');
  });

  // Story 2.6 AC8 / deferred-work.md (this story's owner): touch must paint, not scroll the
  // page, and a mouse drag must not start a native selection.
  it('gives the editor dish touch-action: none and user-select: none (AC8)', () => {
    const { container } = renderEditor();
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(getComputedStyle(canvas).touchAction).toBe('none');
    expect(getComputedStyle(canvas).userSelect).toBe('none');
  });

  // Story 2.7 AC5: the provisional toggle is reachable and operable by keyboard, and its selected
  // state is exposed to assistive tech — not by colour alone.
  it('the tool toggle is keyboard-operable and exposes its selected state via aria-pressed (AC5)', async () => {
    const user = userEvent.setup();
    mountEditor(vi.fn());

    const drawButton = screen.getByRole('button', { name: 'Draw' });
    const eraseButton = screen.getByRole('button', { name: 'Erase' });

    // DEFAULT_TOOL is Conway's Classic (the 'organism' arm) before any interaction.
    expect(drawButton).toHaveAttribute('aria-pressed', 'true');
    expect(eraseButton).toHaveAttribute('aria-pressed', 'false');

    // The dish carries no tabIndex (deferred-work.md, unchanged by this story), so Draw — the
    // group's roving tabIndex=0 member, being selected — is the FIRST (and only) tab stop into
    // the group; ArrowRight is the roving-tabindex pattern's own way to reach a sibling button
    // (MUI's ToggleButtonGroup, not a second Tab stop — the non-selected button carries
    // tabIndex=-1 exactly as WAI-ARIA's toolbar/radiogroup pattern specifies).
    await user.tab();
    expect(drawButton).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(eraseButton).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(eraseButton).toHaveAttribute('aria-pressed', 'true');
    expect(drawButton).toHaveAttribute('aria-pressed', 'false');
  });

  // Dev Notes "Latest technical information": MUI's exclusive ToggleButtonGroup fires onChange
  // with `value === null` when the already-selected option is clicked again — unhandled, that
  // would set the tool to nothing (an unresolvable `tool.kind`). Pin that it is ignored instead.
  // review (2026-08-27): this asserted on the already-selected DRAW button, which is the one case
  // the guard cannot affect — without `if (value === null) return;` the ternary sends null to
  // DEFAULT_TOOL, i.e. Draw, and the test stayed green. Deleting the guard reddened nothing. The
  // discriminating case is the already-selected ERASE button: unguarded, null falls through to
  // DEFAULT_TOOL and the tool silently snaps back to Draw under the user's finger.
  it('clicking the already-selected toggle option leaves the tool unchanged', async () => {
    const user = userEvent.setup();
    mountEditor(vi.fn());
    const drawButton = screen.getByRole('button', { name: 'Draw' });
    const eraseButton = screen.getByRole('button', { name: 'Erase' });

    await user.click(eraseButton);
    expect(eraseButton).toHaveAttribute('aria-pressed', 'true');

    // Clicking Erase AGAIN is MUI's `value === null` path. The eraser must stay selected.
    await user.click(eraseButton);
    expect(eraseButton).toHaveAttribute('aria-pressed', 'true');
    expect(drawButton).toHaveAttribute('aria-pressed', 'false');

    // And the same for Draw, the case that was already covered.
    await user.click(drawButton);
    await user.click(drawButton);
    expect(drawButton).toHaveAttribute('aria-pressed', 'true');
  });

  // Story 2.7 Task 6: the toggle SWITCHES `toolRef` — from the default tool's roster ref to the
  // eraser's 0 and back — and a gesture after switching still crosses the commit seam exactly
  // once. `rerenderWithGrid` stands in for <BattlePage> feeding the committed grid back down,
  // which is what lets the erase click below land on a cell a PRIOR commit actually painted.
  it(
    'switches the paint ref from the default tool’s roster ref to the eraser’s 0 and back, one ' +
      'commit per gesture (AC4, AC5)',
    async () => {
      const user = userEvent.setup();
      const onCommitGrid = vi.fn();
      // ROSTER_WITH_CONWAY_SECOND resolves Conway's Classic to ref 2 (index 1 + 1).
      const { canvas, rerenderWithGrid } = mountEditor(onCommitGrid);
      const index = (col: number, row: number) => row * PLACE_SIZE.cols + col;
      const paint = (col: number, row: number) => {
        const at = {
          clientX: col * CELL + CELL / 2,
          clientY: row * CELL + CELL / 2,
          button: 0,
          isPrimary: true,
        };
        fireEvent.pointerDown(canvas, at);
        fireEvent.pointerUp(canvas, at);
      };

      paint(3, 4);
      expect(onCommitGrid).toHaveBeenCalledTimes(1);
      const painted = onCommitGrid.mock.calls[0][0] as RenderableGrid;
      expect(painted.occupant[index(3, 4)]).toBe(2);
      rerenderWithGrid(painted); // the real round trip: the committed grid becomes the new prop.

      await user.click(screen.getByRole('button', { name: 'Erase' }));
      paint(3, 4); // the SAME cell, now occupied — the eraser must actually commit here.

      expect(onCommitGrid).toHaveBeenCalledTimes(2);
      const erased = onCommitGrid.mock.calls[1][0] as RenderableGrid;
      expect(erased.occupant[index(3, 4)]).toBe(0);
      rerenderWithGrid(erased);

      await user.click(screen.getByRole('button', { name: 'Draw' }));
      paint(6, 7);

      expect(onCommitGrid).toHaveBeenCalledTimes(3);
      const backToDraw = onCommitGrid.mock.calls[2][0] as RenderableGrid;
      expect(backToDraw.occupant[index(6, 7)]).toBe(2);
    },
  );

  // review (2026-08-27): the claim Task 3's last bullet actually asks for, at the level where it
  // is observable. `PetriDishCanvas.test.tsx`'s "empty roster" eraser test cannot make it — the
  // canvas never receives `rosterIds`, so it is handed `toolRef={0}` either way. Only here does a
  // real `refForTool(ERASER_TOOL, [])` resolution reach the commit seam, which is the one case
  // where the eraser and the organism tool legitimately differ: the organism tool commits nothing
  // against an empty roster (test above), the eraser still erases.
  it('erases through the commit seam even when the roster is EMPTY (AC4, Task 3)', async () => {
    const user = userEvent.setup();
    const onCommitGrid = vi.fn();
    const painted = new Uint8Array(PLACE_SIZE.cols * PLACE_SIZE.rows);
    const index = 4 * PLACE_SIZE.cols + 3;
    painted[index] = 1;
    const { canvas, rerenderWithGrid } = mountEditor(onCommitGrid, []);
    rerenderWithGrid({
      width: PLACE_SIZE.cols,
      height: PLACE_SIZE.rows,
      occupant: painted,
      age: EMPTY_GRID.age,
    });

    await user.click(screen.getByRole('button', { name: 'Erase' }));
    const at = {
      clientX: 3 * CELL + CELL / 2,
      clientY: 4 * CELL + CELL / 2,
      button: 0,
      isPrimary: true,
    };
    fireEvent.pointerDown(canvas, at);
    fireEvent.pointerUp(canvas, at);

    expect(onCommitGrid).toHaveBeenCalledTimes(1);
    expect((onCommitGrid.mock.calls[0][0] as RenderableGrid).occupant[index]).toBe(0);
  });

  // Story 2.8 AC5 / spec §3.3's `onUndo(): void; canUndo: boolean`. Forwarded, never interpreted —
  // this component holds no history state, so the only claim available here is that both props
  // reach the status bar's button intact. The button is NAMED, not merely counted (a Story 2.7
  // review finding, twice).
  it('forwards onUndo to the status bar’s UNDO button (AC5)', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    mountEditor(vi.fn(), ROSTER_WITH_CONWAY_SECOND, { onUndo, canUndo: true });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('forwards canUndo to the UNDO button’s disabled state, live (AC5)', () => {
    const onUndo = vi.fn();
    const { rerenderWithGrid } = mountEditor(vi.fn(), ROSTER_WITH_CONWAY_SECOND, {
      onUndo,
      canUndo: false,
    });

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    // A `canUndo` change alone — no other interaction — must re-render the button (trap 1: a
    // `canUndo` read out of a ref satisfies the type and never gets here).
    rerenderWithGrid(EMPTY_GRID, true);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    rerenderWithGrid(EMPTY_GRID, false);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  // AC5 says "passes axe" in as many words. Scoped to `container`, the established pattern for a
  // bare-component render (BattleTile.test.tsx, GalleryEmptyState.test.tsx) — nothing here
  // portals outside it, unlike DeleteBattleDialog's document.body scan.
  it('the toggle and the status bar have no axe violations', async () => {
    const { container } = mountEditor(vi.fn());
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
