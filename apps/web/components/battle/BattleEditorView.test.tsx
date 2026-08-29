import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { fireEvent } from '@testing-library/react';
import { RecordingContext2D } from '@/lib/recordingContext2d';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
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
// The roster union <BattlePage> owns. Conway's Classic is index 0, so a tool selecting it resolves
// to ref 1 — the same `index + 1` encoding the palette LUT above is built on.
const ROSTER: readonly DisplayOrganism[] = [
  {
    id: CONWAYS_CLASSIC_ID,
    name: "Conway's Classic",
    color: '#56B4E9',
    colorToken: 'sky-blue',
  },
];
const ROSTER_IDS = ROSTER.map((organism) => organism.id);

// Story 2.8: the prop set every bare render below supplies identically, in ONE place. Four call
// sites had hand-copied it, so this story's two new props would have meant four identical edits —
// the duplicated-test-helper finding this file's own `mountEditor` comment already records.
// Story 2.10: EMPTY by default, same reasoning as OrganismRoster.test.tsx's own default — most of
// the suite below predates the add control, and an empty library renders none of it, so the
// pre-existing assertions stay true unless a test overrides it.
// Story 2.11: `battleName` defaults to '' and `onNameChange` to a no-op — the same "extend the
// existing default props rather than hand-copying a new prop set into four call sites" lesson
// Story 2.8's own comment above already records, applied to this story's two new props.
function renderEditor(overrides: Partial<ComponentProps<typeof BattleEditorView>> = {}) {
  return render(
    <BattleEditorView
      grid={GRID}
      size={SIZE}
      palette={PALETTE}
      showGridLines
      colors={COLORS}
      rosterIds={ROSTER_IDS}
      roster={ROSTER}
      library={[]}
      onAddToRoster={() => {}}
      atCap={false}
      battleName=""
      onNameChange={() => {}}
      isDirty={false}
      onSave={() => {}}
      isSaving={false}
      saveError={null}
      onCommitGrid={() => {}}
      onUndo={() => {}}
      canUndo={false}
      {...overrides}
    />,
  );
}

/**
 * Story 2.14 (AC1): "Living Cells" now renders in TWO places — `<EditorStatusBar>` and the
 * sidebar's Grid Info section. That is the mockup's own design (:790 / :800), so an unscoped
 * `getByRole('group', { name: 'Living Cells: N' })` is genuinely ambiguous rather than broken.
 * The status bar's own named region is what scopes it back to one.
 */
function statusBarGroup(name: string): HTMLElement {
  return within(screen.getByRole('region', { name: 'Battle statistics' })).getByRole('group', {
    name,
  });
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

  // Story 2.9 AC1 / Story 2.11 AC7 / Story 2.14 AC1: the sidebar arrives, and "renders no sidebar"
  // — true from Story 2.5 through 2.8 — is now false by design. What replaces "exactly one
  // section" is the mockup's own order: Organisms, Battle Name, THEN Grid Info — all real `<h2>`s,
  // siblings of each other, never a skipped level under the header's single `<h1>` (the
  // heading-order prediction `<BattleEditorView>`'s own comment used to carry, now settled rather
  // than merely trusted). ORDER, not membership: Grid Info is the mockup's third section and a set
  // comparison would pass with it first.
  it('renders the Lab sidebar with Organisms, Battle Name then Grid Info, in order (AC1)', () => {
    renderEditor();

    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Organisms',
      'Battle Name',
      'Grid Info',
    ]);
  });

  // NFR-4.1, asserted as ABSENCE — a presence-only check elsewhere still passes once a dead
  // placeholder is added beside the canvas.
  it('renders no other sidebar section and no footer (AC5)', () => {
    renderEditor();

    // Tools (2.15) and the Back button (2.16) are what is left of the mockup's sidebar; Battle
    // Name (2.11) and Grid Info (2.14) are now real and deliberately NOT asserted absent here.
    // Scoped by ACCESSIBLE NAME rather than counted: a bare `toHaveLength(1)` passes when the one
    // textbox is the WRONG one, which is the precise regression this NFR-4.1 absence guard exists
    // to catch.
    expect(screen.getAllByRole('textbox', { name: /battle name/i })).toHaveLength(1);
    // ⚠️ Story 2.14: Grid Size is a radiogroup of two PRESETS, never a free-text field — a textbox
    // here would be a third editable size arriving by the back door, which
    // `EditableGridPresetSchema` rejects at save (trap 9).
    expect(screen.queryByRole('textbox', { name: /grid size/i })).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull(); // ❌ no Grid Zoom slider — superseded (§9.1).
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reset to saved/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /randomize/i })).toBeNull();
    // Forced decision 3 (Story 2.12, AC5): a NAMED REGION, not a live region — `queryAllByRole
    // ('status')` stays true even now that the bar's content exists, because the stats never took
    // option (a)/(c). If a future story adds a live region here, this line must be updated with a
    // comment saying why, not deleted (trap 4).
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryAllByRole('toolbar')).toHaveLength(0);
    // Story 2.12: the stats row's own content now exists (converted from an absence assertion —
    // trap 4). Full coverage of the row lives in the dedicated describe block below.
    expect(screen.getByText(/generation/i)).toBeInTheDocument();
    // ⚠️ `getAllBy`, not `getBy`: Story 2.14 puts a second "Living Cells" label in the sidebar's
    // Grid Info section, which is the mockup's own design (:790 / :800) and not a duplication to
    // consolidate. Both are asserted, so this line still fails if EITHER disappears.
    expect(screen.getAllByText(/living cells/i)).toHaveLength(2);
    // Story 2.13: SAVE's absence assertion INVERTED, not deleted (trap 5) — it is the bar's
    // second real control now. `renderEditor`'s default is a CLEAN battle, so it renders disabled.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // ...and still no failure line, because nothing has failed (AC5's alert is conditional).
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // AC3: Story 2.7's provisional toggle is DELETED, in the commit that ships its replacement. A
  // route carrying two live tool pickers is the worst form of the dead affordance NFR-4.1 forbids.
  // Named, not merely counted: a count alone passes if the toggle is renamed rather than removed.
  it('renders NO Draw/Erase toggle — the roster replaced it (AC3)', () => {
    renderEditor();

    expect(screen.queryByRole('button', { name: 'Draw' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Erase' })).toBeNull();
    expect(screen.queryByRole('group', { name: /editing tool/i })).toBeNull();
    // Exactly the roster's one row, the eraser, UNDO and (Story 2.13) SAVE — nothing more.
    expect(screen.getByRole('button', { name: "Conway's Classic" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eraser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});

/**
 * Story 2.13 (AC1, AC5): `isDirty`/`onSave`/`isSaving` are INPUTS to this view — spec §3.3 lists
 * them as props, unlike `stats`, which this component derives. What is worth pinning here is that
 * they reach the bar untransformed, and that the failure line lands ABOVE the bar rather than
 * inside it (forced decision 4b).
 */
describe('BattleEditorView — the save affordance (Story 2.13)', () => {
  it('forwards isDirty to the bar untouched', () => {
    renderEditor({ isDirty: true });

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('forwards onSave to the bar untouched', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderEditor({ isDirty: true, onSave });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('forwards isSaving to the bar untouched', () => {
    renderEditor({ isDirty: true, isSaving: true });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  // AC5 / NFR-7.2: assertive, because a refused save is an event the user caused and must not
  // miss — unlike Story 2.12's stats, which are a passive summary and deliberately are NOT a live
  // region. The message states that existing data is untouched; that claim is a property of
  // `writeKey`'s candidate-string-then-`setItem` shape (AR-14), not a reassurance.
  it('renders a refused save as an assertive alert, above the status bar', () => {
    renderEditor({ saveError: 'Storage is full, so this battle was not saved.' });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/storage is full/i);
    // DOM order is what a screen reader and a sighted user both read: the alert precedes the bar's
    // stats region. `compareDocumentPosition` returns FOLLOWING (4) when the argument comes after.
    const stats = screen.getByRole('region', { name: 'Battle statistics' });
    expect(alert.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders no alert element at all when there is no failure to report', () => {
    renderEditor({ saveError: null });

    expect(screen.queryByRole('alert')).toBeNull();
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
  // Conway's Classic deliberately SECOND. Story 2.9 inverted what this pins: the initial selection
  // is now the FIRST ROSTER ROW (forced decision 4), not `DEFAULT_TOOL`, so an unclicked editor
  // must paint ref 1 here — and clicking Conway's own row must paint ref 2. A roster with Conway
  // first could not tell those two rules apart.
  const TWO_ORGANISMS: readonly DisplayOrganism[] = [
    {
      id: 'some-other-organism',
      name: 'Other Organism',
      color: '#D55E00',
      colorToken: 'vermillion',
    },
    { id: CONWAYS_CLASSIC_ID, name: "Conway's Classic", color: '#56B4E9', colorToken: 'sky-blue' },
  ];
  const ROSTER_WITH_CONWAY_SECOND = TWO_ORGANISMS.map((organism) => organism.id);
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
  // needs to prove an erase actually empties a cell the PRIOR commit painted.
  //
  // Story 2.8: `onUndo` / `canUndo` are parameters here for the same reason `rosterIds` is one.
  //
  // Story 2.9: the roster is now a pair — the DISPLAY list and the IDENTITY ids (trap 2) — and
  // they are passed as one parameter so a test cannot accidentally desynchronise them.
  function mountEditor(
    onCommitGrid: (next: RenderableGrid) => void,
    roster: readonly DisplayOrganism[] = TWO_ORGANISMS,
    undo: { onUndo?: () => void; canUndo?: boolean } = {},
  ) {
    const { onUndo = () => {}, canUndo = false } = undo;
    const rosterIds = roster.map((organism) => organism.id);
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
        roster={roster}
        library={[]}
        onAddToRoster={() => {}}
        atCap={false}
        battleName=""
        onNameChange={() => {}}
        isDirty={false}
        onSave={() => {}}
        isSaving={false}
        saveError={null}
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
          roster={roster}
          library={[]}
          onAddToRoster={() => {}}
          atCap={false}
          battleName=""
          onNameChange={() => {}}
          isDirty={false}
          onSave={() => {}}
          isSaving={false}
          saveError={null}
          onCommitGrid={onCommitGrid}
          onUndo={onUndo}
          canUndo={nextCanUndo}
        />,
      );
    }

    return { canvas, container: view.container, rerenderWithGrid };
  }

  const at = (col: number, row: number) => ({
    clientX: col * CELL + CELL / 2,
    clientY: row * CELL + CELL / 2,
    button: 0,
    isPrimary: true,
  });

  function paint(canvas: HTMLCanvasElement, col: number, row: number): void {
    fireEvent.pointerDown(canvas, at(col, row));
    fireEvent.pointerUp(canvas, at(col, row));
  }

  // AC4 + AC5 in one falsifiable assertion. The committed cell's value is `index + 1` into the
  // roster (RFC-006 Decision 2), so ref 1 proves BOTH that the canvas's onStrokeCommit reached
  // onCommitGrid unchanged AND that the selection defaults to the FIRST ROSTER ROW rather than to
  // Conway's Classic, which sits at index 1 here.
  it('forwards the canvas commit to onCommitGrid, carrying the FIRST roster row’s ref (AC4, AC5)', () => {
    const onCommitGrid = vi.fn();
    const { canvas } = mountEditor(onCommitGrid);

    // Story 2.6: the commit lands on pointer-up, not pointer-down (trap 2).
    paint(canvas, 3, 4);

    expect(onCommitGrid).toHaveBeenCalledTimes(1);
    const next = onCommitGrid.mock.calls[0][0] as RenderableGrid;
    expect(next).not.toBe(EMPTY_GRID);
    expect(next.occupant[4 * PLACE_SIZE.cols + 3]).toBe(1);
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
    const painted = [...next.occupant].flatMap((value, index) => (value === 0 ? [] : [index]));
    expect(painted).toEqual(
      Array.from({ length: 7 }, (_, i) => 4 * PLACE_SIZE.cols + (i + 2)), // cols 2..8 on row 4
    );
    for (const index of painted) expect(next.occupant[index]).toBe(1);
  });

  // Forced decision 4 / spec §3.3: "eraser when the roster is empty". Before Story 2.9 this case
  // selected an organism tool that resolved to NO ref, and the click placed nothing because the
  // lookup failed. Now the selection itself degrades to the eraser, so nothing is placed because
  // nothing is selected to place — a different mechanism reaching the same visible outcome, and
  // the assertion says which.
  it('falls back to the eraser — never a dangling organism tool — for an empty roster (AC2)', () => {
    const onCommitGrid = vi.fn();
    const { canvas } = mountEditor(onCommitGrid, []);

    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');

    paint(canvas, 3, 4);
    // Erasing an already-empty cell changes nothing, so no gesture crosses the seam.
    expect(onCommitGrid).not.toHaveBeenCalled();
  });

  // Forced decision 6 (Story 2.5): a paintable surface that keeps the default arrow reads as
  // inert. Styled on the EDIT wrapper only — the Gallery's static tiles must not advertise
  // interaction.
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

  // Story 2.8 AC5 / spec §3.3's `onUndo(): void; canUndo: boolean`. Forwarded, never interpreted —
  // this component holds no history state, so the only claim available here is that both props
  // reach the status bar's button intact. The button is NAMED, not merely counted (a Story 2.7
  // review finding, twice).
  it('forwards onUndo to the status bar’s UNDO button (AC5)', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    mountEditor(vi.fn(), TWO_ORGANISMS, { onUndo, canUndo: true });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('forwards canUndo to the UNDO button’s disabled state, live (AC5)', () => {
    const onUndo = vi.fn();
    const { rerenderWithGrid } = mountEditor(vi.fn(), TWO_ORGANISMS, {
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
});

// Story 2.9 AC2: the roster IS the tool picker now. These extend the commit-seam harness above
// rather than duplicating it — the claim is that a click on a sidebar row changes the ref the
// canvas actually paints, which is only observable end to end.
describe('BattleEditorView — roster selection reaches the painted ref (AC2)', () => {
  const PLACE_SIZE = { cols: 20, rows: 10 };
  const CELL = 15;
  const EMPTY_GRID = makeGrid(20, 10, new Array(200).fill(0));
  const TWO_ORGANISMS: readonly DisplayOrganism[] = [
    {
      id: 'some-other-organism',
      name: 'Other Organism',
      color: '#D55E00',
      colorToken: 'vermillion',
    },
    { id: CONWAYS_CLASSIC_ID, name: "Conway's Classic", color: '#56B4E9', colorToken: 'sky-blue' },
  ];
  const PALETTE_3 = makeLut([0, 0, 0], [0, 0, 0]);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mount(
    onCommitGrid: (next: RenderableGrid) => void,
    overrides: Partial<ComponentProps<typeof BattleEditorView>> = {},
  ) {
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

    const props = {
      size: PLACE_SIZE,
      palette: PALETTE_3,
      showGridLines: true,
      colors: COLORS,
      rosterIds: TWO_ORGANISMS.map((organism) => organism.id),
      roster: TWO_ORGANISMS,
      library: [] as readonly DisplayOrganism[],
      onAddToRoster: () => {},
      atCap: false,
      battleName: '',
      onNameChange: () => {},
      onCommitGrid,
      onUndo: () => {},
      canUndo: false,
      isDirty: false,
      onSave: () => {},
      isSaving: false,
      saveError: null,
      ...overrides,
    };
    const view = render(<BattleEditorView grid={EMPTY_GRID} {...props} />);
    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
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

    const rerenderWithGrid = (grid: RenderableGrid) =>
      view.rerender(<BattleEditorView grid={grid} {...props} />);

    return { canvas, container: view.container, rerenderWithGrid };
  }

  const index = (col: number, row: number) => row * PLACE_SIZE.cols + col;

  function paint(canvas: HTMLCanvasElement, col: number, row: number): void {
    const point = {
      clientX: col * CELL + CELL / 2,
      clientY: row * CELL + CELL / 2,
      button: 0,
      isPrimary: true,
    };
    fireEvent.pointerDown(canvas, point);
    fireEvent.pointerUp(canvas, point);
  }

  // The whole of AC2 in one assertion chain: selecting the SECOND row must paint ref 2, the
  // eraser must erase what it painted, and selecting back must paint ref 2 again — one commit per
  // gesture throughout. `rerenderWithGrid` stands in for <BattlePage> feeding each committed grid
  // back down, which is what lets the erase land on a cell a prior commit actually painted.
  it('paints the SELECTED row’s ref, erases via the eraser row, and switches back (AC2)', async () => {
    const user = userEvent.setup();
    const onCommitGrid = vi.fn();
    const { canvas, rerenderWithGrid } = mount(onCommitGrid);

    await user.click(screen.getByRole('button', { name: "Conway's Classic" }));
    paint(canvas, 3, 4);

    expect(onCommitGrid).toHaveBeenCalledTimes(1);
    const painted = onCommitGrid.mock.calls[0][0] as RenderableGrid;
    expect(painted.occupant[index(3, 4)]).toBe(2);
    rerenderWithGrid(painted);

    await user.click(screen.getByRole('button', { name: 'Eraser' }));
    paint(canvas, 3, 4); // the SAME cell, now occupied — the eraser must actually commit here.

    expect(onCommitGrid).toHaveBeenCalledTimes(2);
    const erased = onCommitGrid.mock.calls[1][0] as RenderableGrid;
    expect(erased.occupant[index(3, 4)]).toBe(0);
    rerenderWithGrid(erased);

    await user.click(screen.getByRole('button', { name: 'Other Organism' }));
    paint(canvas, 6, 7);

    expect(onCommitGrid).toHaveBeenCalledTimes(3);
    const backToDraw = onCommitGrid.mock.calls[2][0] as RenderableGrid;
    expect(backToDraw.occupant[index(6, 7)]).toBe(1);
  });

  // AC2: exactly one row selected at any time, the eraser included, and the selected state
  // follows the click rather than a local mirror inside the roster.
  it('moves the selected state as the user picks, including onto the eraser (AC2)', async () => {
    const user = userEvent.setup();
    mount(vi.fn());
    const pressedNames = () =>
      screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.textContent);

    // The default: the first roster row, before any interaction.
    expect(pressedNames()).toEqual(['Other Organism']);

    await user.click(screen.getByRole('button', { name: "Conway's Classic" }));
    expect(pressedNames()).toEqual(["Conway's Classic"]);

    await user.click(screen.getByRole('button', { name: 'Eraser' }));
    expect(pressedNames()).toEqual(['✕Eraser']);
  });

  // Clicking the already-selected row must be a no-op, not a deselection. The deleted
  // ToggleButtonGroup needed an explicit `value === null` guard for this; plain `aria-pressed`
  // buttons get it for free, and this pins that the free version actually holds.
  it('leaves the selection unchanged when the already-selected row is clicked again', async () => {
    const user = userEvent.setup();
    mount(vi.fn());

    await user.click(screen.getByRole('button', { name: 'Eraser' }));
    await user.click(screen.getByRole('button', { name: 'Eraser' }));

    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Other Organism' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  // AC4: the derivation lives HERE (spec §6) and compares colorTokens, not names or hexes.
  it('derives the same-colour warning from colorToken and marks BOTH rows (AC4)', () => {
    const twins: readonly DisplayOrganism[] = [
      { id: 'twin-1', name: 'First Twin', color: '#D55E00', colorToken: 'vermillion' },
      { id: 'lone', name: 'Lone Wolf', color: '#3B82F6', colorToken: 'azure' },
      // Same TOKEN, deliberately a different resolved hex: a derivation comparing the rendered
      // colour instead of the token would find no collision here and silently stop warning.
      { id: 'twin-2', name: 'Second Twin', color: '#D55E01', colorToken: 'vermillion' },
    ];
    renderEditor({
      colors: null,
      rosterIds: twins.map((organism) => organism.id),
      roster: twins,
    });

    expect(screen.getAllByText('Shared colour')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /First Twin/ })).toHaveTextContent('Shared colour');
    expect(screen.getByRole('button', { name: /Second Twin/ })).toHaveTextContent('Shared colour');
    expect(screen.getByRole('button', { name: 'Lone Wolf' })).not.toHaveTextContent(
      'Shared colour',
    );
  });

  // Story 2.9 review, decision 2 (Sidiar's option (b)). `resolveDisplayOrganisms`' dangling-id
  // fallback paints in DEFAULT_COLOR_TOKEN — which is 'sky-blue', Conway's Classic's OWN token,
  // not a spare. So the commonest corrupt shape (one dangling id in a battle that also places
  // Conway's Classic) used to mark a perfectly healthy organism as sharing a colour with a record
  // that does not exist, and there was no second organism for the user to recolour.
  it('does not warn a real organism about sharing a colour with a DANGLING id', () => {
    const roster: readonly DisplayOrganism[] = [
      {
        id: CONWAYS_CLASSIC_ID,
        name: "Conway's Classic",
        color: '#56B4E9',
        colorToken: 'sky-blue',
      },
      // What the fallback produces verbatim: same token as the row above, because that token IS
      // the default. `unresolved` is the only thing separating them.
      {
        id: 'ghost-organism',
        name: 'Unknown organism',
        color: '#56B4E9',
        colorToken: 'sky-blue',
        unresolved: true,
      },
    ];
    renderEditor({ roster, rosterIds: roster.map((organism) => organism.id) });

    expect(screen.queryAllByText('Shared colour')).toHaveLength(0);
  });

  // The other half of the exclusion, and the half a sentinel token (the review's option (a)) would
  // NOT have fixed: two danglers genuinely do render in one colour, but "recolour one of them" is
  // not an action either — neither has a record to recolour.
  it('does not warn two dangling ids about each other', () => {
    const roster: readonly DisplayOrganism[] = [
      {
        id: 'ghost-1',
        name: 'Unknown organism',
        color: '#56B4E9',
        colorToken: 'sky-blue',
        unresolved: true,
      },
      {
        id: 'ghost-2',
        name: 'Unknown organism',
        color: '#56B4E9',
        colorToken: 'sky-blue',
        unresolved: true,
      },
    ];
    renderEditor({ roster, rosterIds: roster.map((organism) => organism.id) });

    expect(screen.queryAllByText('Shared colour')).toHaveLength(0);
  });

  // The exclusion is scoped to the dangling entries themselves — a real collision sitting BESIDE
  // one must still warn, both rows. Without this, "exclude danglers" could be implemented as
  // "skip the whole derivation when any entry is unresolved" and stay green.
  it('still warns a real colliding pair when a dangling id is also present', () => {
    const roster: readonly DisplayOrganism[] = [
      { id: 'twin-1', name: 'First Twin', color: '#D55E00', colorToken: 'vermillion' },
      {
        id: 'ghost',
        name: 'Unknown organism',
        color: '#56B4E9',
        colorToken: 'sky-blue',
        unresolved: true,
      },
      { id: 'twin-2', name: 'Second Twin', color: '#D55E00', colorToken: 'vermillion' },
    ];
    renderEditor({ roster, rosterIds: roster.map((organism) => organism.id) });

    expect(screen.getAllByText('Shared colour')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /First Twin/ })).toHaveTextContent('Shared colour');
    expect(screen.getByRole('button', { name: /Second Twin/ })).toHaveTextContent('Shared colour');
  });

  // AC7: a failed organism library reaches the roster as a FACT it can state, and the selection
  // degrades with it — an organism tool would resolve against names and colours that do not exist.
  it('degrades to the eraser and states the failure when the library is unavailable (AC7)', () => {
    renderEditor({
      colors: null,
      rosterIds: TWO_ORGANISMS.map((organism) => organism.id),
      roster: TWO_ORGANISMS,
      libraryUnavailable: true,
    });

    expect(screen.getByText(/organism library could not be read/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Other Organism' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
  });

  // AC5 says "passes axe" in as many words. Scoped to `container`, the established pattern for a
  // bare-component render (BattleTile.test.tsx, GalleryEmptyState.test.tsx) — nothing here
  // portals outside it, unlike DeleteBattleDialog's document.body scan.
  it('the sidebar, roster and status bar have no axe violations (AC5)', async () => {
    const { container } = mount(vi.fn());

    expect((await axe(container)).violations).toEqual([]);
  });
});

// Story 2.10 (AC3, AC7, forced decision 1). `library` and `onAddToRoster` are threaded straight
// through to `<OrganismRoster>` (Task 4); the one thing THIS component adds is the add-AND-select
// wrapper, since the selection this story wires an add into is this component's own state.
describe('BattleEditorView — the add control (AC3, AC7, forced decision 1)', () => {
  const ADD_LIBRARY: readonly DisplayOrganism[] = [
    { id: 'lib-new', name: 'New Arrival', color: '#D55E00', colorToken: 'vermillion' },
  ];

  // Wiring: choosing an option in the roster's add control calls the `onAddToRoster` THIS
  // component was given, with the organism's id — proving `library`/`onAddToRoster` actually
  // reach `<OrganismRoster>` rather than being declared and dropped.
  it('threads library and onAddToRoster down to the roster’s add control', async () => {
    const user = userEvent.setup();
    const onAddToRoster = vi.fn();
    renderEditor({ library: ADD_LIBRARY, onAddToRoster });

    await user.selectOptions(screen.getByRole('combobox', { name: /add organism/i }), 'lib-new');

    expect(onAddToRoster).toHaveBeenCalledTimes(1);
    expect(onAddToRoster).toHaveBeenCalledWith('lib-new');
  });

  // Forced decision 1, option (b): add AND select. `<BattlePage>`'s real `onAddToRoster` and this
  // component's `setChosenTool` both fire inside the ADD event handler, so the parent's next
  // render already carries the new id in `roster`/`rosterIds` by the time React re-validates the
  // selection — simulated here with a rerender standing in for that round trip, the same pattern
  // `mountEditor`'s `rerenderWithGrid` uses for <BattlePage>'s committed-grid round trip.
  it('selects the newly-added organism once the parent hands back the updated roster', async () => {
    const user = userEvent.setup();
    const onAddToRoster = vi.fn();
    const { rerender } = renderEditor({
      rosterIds: [],
      roster: [],
      library: ADD_LIBRARY,
      onAddToRoster,
    });

    // Nothing chosen yet on an empty roster: the eraser (spec §3.3).
    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');

    await user.selectOptions(screen.getByRole('combobox', { name: /add organism/i }), 'lib-new');
    expect(onAddToRoster).toHaveBeenCalledWith('lib-new');

    // The parent's response: the new organism now IN the roster, and no longer in the library.
    const updatedRoster = [...ADD_LIBRARY];
    rerender(
      <BattleEditorView
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        rosterIds={updatedRoster.map((organism) => organism.id)}
        roster={updatedRoster}
        library={[]}
        onAddToRoster={onAddToRoster}
        atCap={false}
        battleName=""
        onNameChange={() => {}}
        isDirty={false}
        onSave={() => {}}
        isSaving={false}
        saveError={null}
        onCommitGrid={() => {}}
        onUndo={() => {}}
        canUndo={false}
      />,
    );

    // Selected WITHOUT a further click — the add itself carried the selection along.
    expect(screen.getByRole('button', { name: 'New Arrival' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'false');
  });
});

// Story 2.11 (AC1, AC7, Task 5). The heading-order claim (Organisms THEN Battle Name) is pinned
// in the first `describe` block above, alongside the rest of that block's structural assertions —
// this one covers the wiring: the live value renders, edits reach the parent unchanged, and the
// two new props go nowhere but `<BattleNameField>`.
describe('BattleEditorView — the Battle Name section (Story 2.11)', () => {
  // `battleName`/`onNameChange` are destructured OUT of props before `...rest` is spread onto
  // `<EditorMain>` (Task 5's "extend the Omit<…> list"), so this is unreachable by construction —
  // asserted here anyway, the same "test the identity, not just the flag" discipline AC4's commit
  // seam gets: `<EditorMain>` renders no textbox of its own, so a leak would show up as a SECOND
  // element carrying this value.
  it('renders battleName exactly once, in the sidebar’s field, and it does not leak into <EditorMain>', () => {
    renderEditor({ battleName: 'Marker Value' });

    expect(screen.getAllByDisplayValue('Marker Value')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: /battle name/i })).toHaveValue('Marker Value');
  });

  it('threads onNameChange from BattleNameField up to the caller unchanged (AC1, AC3)', async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn();
    renderEditor({ battleName: 'Old Name', onNameChange });

    await user.type(screen.getByRole('textbox', { name: /battle name/i }), '!');

    expect(onNameChange).toHaveBeenCalledWith('Old Name!');
  });
});

// Story 2.12 (AC3, AC4). `gridStats.test.ts` already pins the counting math itself; these two
// prove it actually reaches `<EditorStatusBar>` through the memo and updates when the grid a user
// is editing changes. The "does not rerun on an unrelated re-render" claim (Task 3) needs a spy on
// the exported derivation, which is module-scoped (`vi.mock`) — kept in its own file
// (`BattleEditorView.statsMemo.test.tsx`), the same split `BattlePage.seedPreset.test.tsx` uses
// for exactly the same reason (a module mock there would otherwise apply to every test in this
// file).
describe('BattleEditorView — the stats derivation (Story 2.12, AC3, AC4)', () => {
  const STATS_ROSTER: readonly DisplayOrganism[] = [
    {
      id: 'organism-a',
      name: 'Aggressive Colonizer',
      color: '#D55E00',
      colorToken: 'vermillion',
    },
    { id: 'organism-b', name: 'Patient Defender', color: '#56B4E9', colorToken: 'sky-blue' },
  ];
  const STATS_ROSTER_IDS = STATS_ROSTER.map((organism) => organism.id);

  it('shows livingCells and one population entry per organism, from the grid’s real contents', () => {
    // 2x2: refs 1, 2, 0, 1 -> organism-a: 2, organism-b: 1, livingCells: 3.
    const grid = makeGrid(2, 2, [1, 2, 0, 1]);
    renderEditor({ grid, rosterIds: STATS_ROSTER_IDS, roster: STATS_ROSTER });

    expect(statusBarGroup('Living Cells: 3')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Aggressive Colonizer: 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Patient Defender: 1' })).toBeInTheDocument();
  });

  it('updates the stats when a committed grid replaces the old one (AC4)', () => {
    const initialGrid = makeGrid(2, 2, [0, 0, 0, 0]);
    const { rerender } = renderEditor({
      grid: initialGrid,
      rosterIds: STATS_ROSTER_IDS,
      roster: STATS_ROSTER,
    });

    expect(statusBarGroup('Living Cells: 0')).toBeInTheDocument();
    // AC3: an all-empty grid still carries one entry PER ROSTER ORGANISM, reading 0 — "Population:
    // none" is reserved for an EMPTY ROSTER, a different fact (see EditorStatusBar.test.tsx).
    expect(screen.getByRole('img', { name: 'Aggressive Colonizer: 0' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Patient Defender: 0' })).toBeInTheDocument();

    const committedGrid = makeGrid(2, 2, [1, 1, 0, 0]);
    rerender(
      <BattleEditorView
        grid={committedGrid}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        rosterIds={STATS_ROSTER_IDS}
        roster={STATS_ROSTER}
        library={[]}
        onAddToRoster={() => {}}
        atCap={false}
        battleName=""
        onNameChange={() => {}}
        isDirty={false}
        onSave={() => {}}
        isSaving={false}
        saveError={null}
        onCommitGrid={() => {}}
        onUndo={() => {}}
        canUndo={false}
      />,
    );

    expect(statusBarGroup('Living Cells: 2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Aggressive Colonizer: 2' })).toBeInTheDocument();
  });
});

/**
 * Story 2.14 — the resize flow (AC1, AC2, AC3, AC4).
 *
 * The matrix the story asks for: a grow commits immediately with NO dialog; a shrink that clips
 * nothing does the same; a shrink that clips living cells commits NOTHING until confirm; confirm
 * commits exactly once at the new dimensions; cancel and Escape commit zero times.
 *
 * ⚠️ `<ResizeClipWarningDialog>` arrives through `next/dynamic`, so every assertion about it is
 * `find*`, not `get*` — the chunk resolves on a microtask. That is the same asynchrony a real
 * browser has, and asserting it here is what keeps the lazy boundary from silently breaking.
 */
describe('BattleEditorView — edit-mode grid resize (Story 2.14)', () => {
  /**
   * Both shrink fixtures are 100 x 60 — the LARGER editable preset — because the two cases only
   * differ once the target is genuinely smaller. A small ad-hoc grid shrinking "to 50 x 30" is a
   * GROW on both axes and can never clip, which is a test that passes for the wrong reason.
   *
   * Each holds the same 2 x 2 block at the top-left, which the shrink keeps; they differ only in
   * whether one cell also sits outside the new bounds (trap 6 — living cells, not cells).
   */
  function makeLargeGrid(withClippedCell: boolean): RenderableGrid {
    const grid = makeGrid(100, 60, new Array(6000).fill(0));
    grid.occupant[0] = 1;
    grid.occupant[1] = 1;
    grid.occupant[100] = 1;
    grid.occupant[101] = 1;
    // (99, 59): the far corner, outside every 50 x 30 rectangle anchored at the top-left.
    if (withClippedCell) grid.occupant[6000 - 1] = 1;
    return grid;
  }

  const EMPTY_EDGES = makeLargeGrid(false);
  const OCCUPIED_EDGES = makeLargeGrid(true);

  function preset(name: '50 by 30' | '100 by 60') {
    return screen.getByRole('radio', { name });
  }

  it('commits a GROW immediately, with no dialog (AC2, AC3)', async () => {
    const user = userEvent.setup();
    const onCommitGrid = vi.fn();
    // Currently 50 x 30; the grid is what the section reads its size from, so it has to agree.
    renderEditor({ grid: makeGrid(50, 30, new Array(1500).fill(0)), onCommitGrid });

    await user.click(preset('100 by 60'));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onCommitGrid).toHaveBeenCalledTimes(1);
    const committed = onCommitGrid.mock.calls[0][0] as RenderableGrid;
    expect([committed.width, committed.height]).toEqual([100, 60]);
    expect(committed.occupant.length).toBe(6000);
  });

  it('commits a shrink over an EMPTY region silently (trap 6)', async () => {
    const user = userEvent.setup();
    const onCommitGrid = vi.fn();
    renderEditor({ grid: EMPTY_EDGES, onCommitGrid });

    // A real shrink, 100 x 60 -> 50 x 30, over a region that holds nothing.
    await user.click(preset('50 by 30'));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onCommitGrid).toHaveBeenCalledTimes(1);
  });

  it('opens the warning for a shrink that clips living cells, and commits NOTHING yet (AC3)', async () => {
    const user = userEvent.setup();
    const onCommitGrid = vi.fn();
    renderEditor({ grid: OCCUPIED_EDGES, onCommitGrid });

    await user.click(preset('50 by 30'));

    expect(await screen.findByRole('dialog', { name: 'Cells Will Be Discarded' })).toBeVisible();
    // The count is the number of LIVING cells outside the new bounds — one, not the ~4,500 cells
    // the shrink discards.
    expect(screen.getByText(/discards 1 living cell/i)).toBeInTheDocument();
    expect(onCommitGrid).not.toHaveBeenCalled();
  });

  it('confirm commits EXACTLY ONCE, at the new dimensions (AC2, AC4)', async () => {
    const user = userEvent.setup();
    const onCommitGrid = vi.fn();
    renderEditor({ grid: OCCUPIED_EDGES, onCommitGrid });

    await user.click(preset('50 by 30'));
    await user.click(await screen.findByRole('button', { name: 'Resize Grid' }));

    // ONE call, therefore one undo ring entry, therefore one undo (AC4). A second call here is
    // the shape of defect that leaves a resize needing two undos to reverse.
    expect(onCommitGrid).toHaveBeenCalledTimes(1);
    const committed = onCommitGrid.mock.calls[0][0] as RenderableGrid;
    expect([committed.width, committed.height]).toEqual([50, 30]);
    // Top-left anchored (AR-17): the 2 x 2 block survives at its own coordinates, and the corner
    // cell the dialog warned about is gone.
    expect(committed.occupant[0]).toBe(1);
    expect(committed.occupant[1]).toBe(1);
    expect(committed.occupant[50]).toBe(1);
    expect(Array.from(committed.occupant).filter((cell) => cell !== 0)).toHaveLength(4);
  });

  it('cancel changes NOTHING — no commit, and the control still reads the current size (AC3)', async () => {
    const user = userEvent.setup();
    const onCommitGrid = vi.fn();
    renderEditor({ grid: OCCUPIED_EDGES, onCommitGrid });

    await user.click(preset('50 by 30'));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onCommitGrid).not.toHaveBeenCalled();
    // The section renders from `grid`, which never moved — so the control still reads 100 x 60
    // and the preset the user pressed is NOT checked. A control holding its own selection state
    // would be left showing the size the user did not get.
    // `find*`, because the sidebar is `inert` until the dialog's exit transition finishes
    // (`useInertBackground`) — which is itself worth asserting: a background left inert after a
    // cancel is an editor the user can no longer touch.
    expect(await screen.findByRole('group', { name: 'Grid Size: 100 by 60' })).toBeInTheDocument();
    expect(preset('100 by 60')).toBeChecked();
    expect(preset('50 by 30')).not.toBeChecked();
  });

  it('Escape changes nothing either — the same non-destructive dismissal (AC3)', async () => {
    const user = userEvent.setup();
    const onCommitGrid = vi.fn();
    renderEditor({ grid: OCCUPIED_EDGES, onCommitGrid });

    await user.click(preset('50 by 30'));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(onCommitGrid).not.toHaveBeenCalled();
  });

  it('the sidebar’s Grid Info facts come from the grid, and update with it (AC1)', () => {
    const { rerender } = renderEditor({ grid: makeGrid(4, 4, new Array(16).fill(0)) });

    expect(screen.getByRole('group', { name: 'Total Cells: 16' })).toBeInTheDocument();

    rerender(
      <BattleEditorView
        grid={OCCUPIED_EDGES}
        size={{ cols: 4, rows: 4 }}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        rosterIds={ROSTER_IDS}
        roster={ROSTER}
        library={[]}
        onAddToRoster={() => {}}
        atCap={false}
        battleName=""
        onNameChange={() => {}}
        isDirty={false}
        onSave={() => {}}
        isSaving={false}
        saveError={null}
        onCommitGrid={() => {}}
        onUndo={() => {}}
        canUndo={false}
      />,
    );

    // Grid Info's Living Cells is fed from the SAME `stats` memo `<EditorStatusBar>` reads
    // (forced decision 6a) — both rows report the new number off one derivation.
    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).getByRole('group', { name: 'Living Cells: 5' })).toBeInTheDocument();
    expect(statusBarGroup('Living Cells: 5')).toBeInTheDocument();
  });

  it('disables the preset control while a save is in flight (trap 8)', () => {
    renderEditor({ isSaving: true });

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});
