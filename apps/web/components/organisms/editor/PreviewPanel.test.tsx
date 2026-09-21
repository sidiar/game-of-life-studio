import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import { GridRenderer } from '@/lib/canvas/gridRenderer';
import { resetColourStateWarnings } from '@/lib/canvas/colourStateGroups';
import { resetRefToFillGroupWarnings } from '@/lib/canvas/refToFillGroup';
import { computeGridLayout } from '@/lib/canvas/gridLayout';
import { RecordingContext2D } from '@/test-support/recordingContext2d';
import { displayColorAt, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { paletteIndexOf } from '@/lib/palette/paletteRegistry';
import { PREVIEW_GRID_SIZE } from '@/lib/organisms/previewGrid';
import { previewOrganismFrom } from '@/lib/organisms/previewOrganism';
import { createNewRuleDraft, ruleDraftFrom, type RuleDraft } from '@/lib/organisms/ruleDraft';
import PreviewPanel, { type PreviewPanelProps } from './PreviewPanel';

// `{ spy: true }` keeps the real implementation and only counts calls — test 23's FD2 tripwire
// reads call counts, not behaviour.
vi.mock('@/lib/organisms/previewOrganism', { spy: true });

const COLORS = { background: '#0a0a0a', gridLine: 'rgb(51 51 51 / 0.3)' };

// Deterministic id counter for `ruleDraftFrom` — never `crypto`, the `ruleDraft.test.ts` idiom.
function idCounter() {
  let n = 0;
  return () => `preview-c${++n}`;
}

/** Conway's Classic as `RuleDraft`s — the roster that survives (Decision B.5, no auto-pause). */
function conwayRules(): readonly RuleDraft[] {
  return CONWAYS_CLASSIC.survivalRules.map((rule) => ruleDraftFrom(rule, idCounter()));
}

/**
 * `BattleSimulationView.test.tsx:68-107`'s copy (a SECOND instance — the `PreviewPanel` rig
 * cannot import a `.test.tsx` file; recorded in `deferred-work.md`, lift to `@/test-support` on
 * the third copy). `frame(now)` fires every callback queued before the call, inside `act`.
 */
function installFrameDriver() {
  const queue: { handle: number; callback: FrameRequestCallback }[] = [];
  let nextHandle = 1;
  const raf = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      queue.push({ handle, callback });
      return handle;
    });
  const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle: number) => {
    const index = queue.findIndex((entry) => entry.handle === handle);
    if (index !== -1) queue.splice(index, 1);
  });
  return {
    raf,
    caf,
    frame(now: number): void {
      const batch = queue.splice(0);
      act(() => {
        for (const entry of batch) entry.callback(now);
      });
    },
    pending: () => queue.length,
  };
}

afterEach(() => {
  resetRefToFillGroupWarnings();
  resetColourStateWarnings();
  vi.restoreAllMocks();
});

// jsdom keeps the canvas at its 300x150 default (`clientWidth` is 0), giving 7px cells at
// origin (45, 5) over the 30x20 preview grid — derived, never hardcoded (the house rule).
function installPerCanvasRecording() {
  const contextsByCanvas = new Map<HTMLCanvasElement, RecordingContext2D>();
  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (this: HTMLCanvasElement) {
      let ctx = contextsByCanvas.get(this);
      if (ctx === undefined) {
        ctx = new RecordingContext2D();
        contextsByCanvas.set(this, ctx);
      }
      return ctx as unknown as CanvasRenderingContext2D;
    });
  return { contextsByCanvas, getContextSpy };
}

function stubCanvasRect(canvas: HTMLCanvasElement): void {
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: canvas.width,
    height: canvas.height,
    right: canvas.width,
    bottom: canvas.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function centreOfCell(canvas: HTMLCanvasElement, col: number, row: number) {
  const { cellSize, originX, originY } = computeGridLayout(canvas, PREVIEW_GRID_SIZE, true);
  return {
    clientX: originX + col * cellSize + cellSize / 2,
    clientY: originY + row * cellSize + cellSize / 2,
    button: 0,
    isPrimary: true,
  };
}

function mount(overrides: Partial<PreviewPanelProps> = {}) {
  // `getContextSpy.mock.calls.length` is the construction oracle (the `PetriDishCanvas.test.tsx`
  // "colors identity" idiom): `GridRenderer` asks for a context in its constructor, and otherwise
  // only when `resize()` / `setGridLines()` rebuild the grid-line overlay — neither runs on a
  // props rerender under jsdom (no `ResizeObserver`; the lines flag never changes), so a grown
  // count means a rebuilt renderer and an unchanged count means none. `drawFull` alone cannot
  // tell the two apart — the grid effect's external-change path calls it too.
  const { contextsByCanvas: contexts, getContextSpy } = installPerCanvasRecording();
  const props: PreviewPanelProps = {
    colorToken: 'vermillion',
    agingEnabled: false,
    colors: COLORS,
    survivalRules: [],
    ...overrides,
  };
  const view = render(<PreviewPanel {...props} />);
  const canvas = view.container.querySelector('canvas');
  if (canvas !== null) stubCanvasRect(canvas);
  return { ...view, canvas, contexts, getContextSpy, props };
}

/** The Story 4.15 transport group — `getByRole('group', { name: 'Simulation controls' })`. */
function transport(container: HTMLElement): HTMLElement {
  return within(container).getByRole('group', { name: 'Simulation controls' });
}

/** `[data-preview-dish]` — the `data-status`/`data-cycle` test handle (3.11 FD7). */
function box(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-preview-dish]');
  if (element === null) throw new Error('dish box did not render');
  return element;
}

/** Draws a horizontal blinker at (14,10)-(16,10) — the 4.14 pointer rig, three committed cells. */
function drawBlinker(canvas: HTMLCanvasElement): void {
  for (const col of [14, 15, 16]) {
    fireEvent.pointerDown(canvas, centreOfCell(canvas, col, 10));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, col, 10));
  }
}

function drawnRecording(
  contexts: Map<HTMLCanvasElement, RecordingContext2D>,
  canvas: HTMLCanvasElement,
) {
  const recording = contexts.get(canvas);
  if (recording === undefined) throw new Error('no recording context registered for this canvas');
  return recording;
}

describe('PreviewPanel', () => {
  it('renders the dish and its three controls, Draw pressed, Clear disabled', () => {
    const { container } = mount();

    const box = container.querySelector<HTMLElement>('[data-preview-dish]');
    if (box === null) throw new Error('dish box did not render');
    expect(
      within(box).getByRole('img', { name: 'Petri dish, 30 by 20 cells' }),
    ).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Drawing tools' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Draw', 'Erase', 'Clear']);
    expect(within(group).getByRole('button', { name: 'Draw' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Erase' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(group).getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('colors: null renders the box with no canvas and the controls intact (AC7)', () => {
    const { container } = mount({ colors: null });

    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('[data-preview-dish]')).not.toBeNull();
    const group = screen.getByRole('group', { name: 'Drawing tools' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
  });

  it('Draw/Erase are exclusive and keyboard-operable (AC2)', async () => {
    const user = userEvent.setup();
    mount();
    const draw = screen.getByRole('button', { name: 'Draw' });
    const erase = screen.getByRole('button', { name: 'Erase' });

    await user.click(erase);
    expect(erase).toHaveAttribute('aria-pressed', 'true');
    expect(draw).toHaveAttribute('aria-pressed', 'false');

    draw.focus();
    await user.keyboard(' ');
    expect(draw).toHaveAttribute('aria-pressed', 'true');
    expect(erase).toHaveAttribute('aria-pressed', 'false');
    expect(document.activeElement).toBe(draw);

    erase.focus();
    await user.keyboard('{Enter}');
    expect(erase).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(erase);
  });

  it('a click paints the organism under edit and enables Clear (AC3, AC5)', () => {
    const { canvas, contexts } = mount();
    if (canvas === null) throw new Error('canvas did not mount');

    // Markers taken AFTER mount: the construction `drawFull` already wrote a `fillStyle` and
    // `fillRect`s for the background, so an unmarked `toContain` / `some` would pass on an empty
    // dish. Only the writes the stroke itself appends carry the claim.
    const recording = drawnRecording(contexts, canvas);
    const fillsBefore = recording.fillStyleWrites.length;
    const callsBefore = recording.calls.length;

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));

    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    const expectedFill = displayColorAt(paletteIndexOf('vermillion'), MAX_AGE_SHADE);
    expect(recording.fillStyleWrites.slice(fillsBefore)).toContain(expectedFill);
    expect(recording.calls.slice(callsBefore).some((c) => c.op === 'fillRect')).toBe(true);
  });

  it('erasing the same cell empties the dish (AC3)', async () => {
    const user = userEvent.setup();
    const { canvas } = mount();
    if (canvas === null) throw new Error('canvas did not mount');

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Erase' }));
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Draw' }));
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
  });

  it('Clear empties everything and repaints (AC2)', async () => {
    const user = userEvent.setup();
    const { canvas } = mount();
    if (canvas === null) throw new Error('canvas did not mount');

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 1, 1));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 1, 1));
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 5, 5));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();

    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    // Exactly one: the grid effect's external-change path repaints the cleared grid once. Two
    // would mean the palette or size identity also moved on a Clear, which nothing here changes.
    expect(drawFullSpy).toHaveBeenCalledTimes(1);
  });

  it('a colour change repaints the drawn cells on the same commit (AC4)', () => {
    const { canvas, contexts, getContextSpy, rerender } = mount({ colorToken: 'vermillion' });
    if (canvas === null) throw new Error('canvas did not mount');

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));

    const recording = drawnRecording(contexts, canvas);
    const constructionsBefore = getContextSpy.mock.calls.length;
    const fillsBefore = recording.fillStyleWrites.length;
    rerender(
      <PreviewPanel colorToken="azure" agingEnabled={false} colors={COLORS} survivalRules={[]} />,
    );

    // A new palette identity reconstructed the renderer (a `getContext` call is the constructor's
    // alone) and the drawn cell came back in the new colour in that same commit.
    expect(getContextSpy.mock.calls.length).toBeGreaterThan(constructionsBefore);
    const expectedFill = displayColorAt(paletteIndexOf('azure'), MAX_AGE_SHADE);
    expect(recording.fillStyleWrites.slice(fillsBefore)).toContain(expectedFill);
  });

  it('aging on paints age-0 cells at shade 0 (AC4)', () => {
    const { canvas, contexts, rerender } = mount({ colorToken: 'vermillion', agingEnabled: false });
    if (canvas === null) throw new Error('canvas did not mount');

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));

    // Each half reads only the writes its own rerender appended: the recording is cumulative, so
    // the "off again" colour is already in the log from the initial draw and an unsliced
    // `toContain` would pass without the second repaint happening at all.
    const recording = drawnRecording(contexts, canvas);
    let mark = recording.fillStyleWrites.length;
    rerender(
      <PreviewPanel colorToken="vermillion" agingEnabled colors={COLORS} survivalRules={[]} />,
    );
    expect(recording.fillStyleWrites.slice(mark)).toContain(
      displayColorAt(paletteIndexOf('vermillion'), 0),
    );

    mark = recording.fillStyleWrites.length;
    rerender(
      <PreviewPanel
        colorToken="vermillion"
        agingEnabled={false}
        colors={COLORS}
        survivalRules={[]}
      />,
    );
    expect(recording.fillStyleWrites.slice(mark)).toContain(
      displayColorAt(paletteIndexOf('vermillion'), MAX_AGE_SHADE),
    );
  });

  it('a rerender with the SAME token and flag constructs nothing (AC4 memo)', () => {
    const { getContextSpy, rerender } = mount({ colorToken: 'vermillion', agingEnabled: false });

    const constructionsBefore = getContextSpy.mock.calls.length;
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    rerender(
      <PreviewPanel
        colorToken="vermillion"
        agingEnabled={false}
        colors={COLORS}
        survivalRules={[]}
      />,
    );

    expect(getContextSpy.mock.calls.length).toBe(constructionsBefore);
    expect(drawFullSpy).not.toHaveBeenCalled();
  });

  it('the drawn grid survives a mode switch and a colour change (AC5)', async () => {
    const user = userEvent.setup();
    const { canvas, rerender } = mount({ colorToken: 'vermillion' });
    if (canvas === null) throw new Error('canvas did not mount');

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));
    await user.click(screen.getByRole('button', { name: 'Erase' }));
    rerender(
      <PreviewPanel colorToken="azure" agingEnabled={false} colors={COLORS} survivalRules={[]} />,
    );

    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    // Erasing THAT cell empties the dish: the drawn cell survived at its own location, not merely
    // "some non-empty grid" survived.
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('a drag commits once, Clear enabled (AC1)', async () => {
    const user = userEvent.setup();
    const { canvas } = mount();
    if (canvas === null) throw new Error('canvas did not mount');
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 2, 4));
    fireEvent.pointerMove(canvas, { ...centreOfCell(canvas, 6, 4), buttons: 1 });
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 6, 4));

    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    expect(drawFullSpy).not.toHaveBeenCalled();

    // Clear-enabled is guaranteed by the pointer-down alone; erasing the START cell and finding
    // the dish still non-empty is what proves the move extended the stroke past its first cell.
    await user.click(screen.getByRole('button', { name: 'Erase' }));
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 2, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 2, 4));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
  });

  it('has no axe violations in the fresh state or after a draw', async () => {
    const { canvas, container } = mount();
    expect((await axe(container)).violations).toEqual([]);

    if (canvas === null) throw new Error('canvas did not mount');
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 3, 4));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 3, 4));
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('PreviewPanel — simulation (Story 4.15)', () => {
  it('at rest: the transport, the slider and the cycle readout render; the group is compact', () => {
    const { container } = mount();

    const group = transport(container);
    expect(group).toHaveAttribute('data-compact', 'true');
    expect(within(group).getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(within(group).getByRole('button', { name: 'Next cycle' })).toBeEnabled();
    expect(within(group).getByRole('button', { name: 'Stop & reset' })).toBeEnabled();

    expect(screen.getByRole('slider', { name: 'Generations per second' })).toHaveAttribute(
      'aria-valuetext',
      '10 generations per second',
    );

    const dish = box(container);
    expect(dish).toHaveAttribute('data-status', 'paused');
    expect(dish).toHaveAttribute('data-cycle', '0');

    expect(
      within(screen.getByRole('group', { name: 'Drawing tools' })).getAllByRole('button'),
    ).toHaveLength(3);
  });

  it('a fresh draft (zero rules) + one drawn cell: Play steps to cycle 1, the dish empties, and the run auto-pauses (AC4)', () => {
    const driver = installFrameDriver();
    const { container, canvas } = mount();
    if (canvas === null) throw new Error('canvas did not mount');

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 5, 5));

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    expect(box(container)).toHaveAttribute('data-status', 'playing');
    expect(within(transport(container)).getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // The edit canvas unmounted and a NEW canvas element (the playback surface) took its place —
    // a `getContext` call on a canvas that is not the one drawing used (3.11's construction proof).
    const runCanvas = container.querySelector('canvas');
    expect(runCanvas).not.toBeNull();
    expect(runCanvas).not.toBe(canvas);

    driver.frame(0);
    driver.frame(100);

    expect(box(container)).toHaveAttribute('data-status', 'paused');
    expect(box(container)).toHaveAttribute('data-cycle', '1');
    expect(within(transport(container)).getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(driver.pending()).toBe(0);

    expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Erase' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();

    // The run surface stays mounted through the auto-pause (FD3) — no swap back to the sketch.
    expect(container.querySelector('canvas')).toBe(runCanvas);
  });

  it('Stop returns to the sketch: cycle 0, tools enabled, the edit canvas back with the drawn cell (AC7)', () => {
    const driver = installFrameDriver();
    const { container, canvas, contexts } = mount();
    if (canvas === null) throw new Error('canvas did not mount');

    fireEvent.pointerDown(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    const runCanvas = container.querySelector('canvas');
    driver.frame(0);
    driver.frame(100);

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Stop & reset' }));

    expect(box(container)).toHaveAttribute('data-cycle', '0');
    expect(box(container)).toHaveAttribute('data-status', 'paused');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();

    // A FRESH edit canvas — distinct from both the original mount canvas and the run canvas.
    const editCanvas = container.querySelector('canvas');
    expect(editCanvas).not.toBeNull();
    expect(editCanvas).not.toBe(canvas);
    expect(editCanvas).not.toBe(runCanvas);

    const recording = drawnRecording(contexts, editCanvas as HTMLCanvasElement);
    expect(recording.fillStyleWrites).toContain(
      displayColorAt(paletteIndexOf('vermillion'), MAX_AGE_SHADE),
    );
  });

  it("Conway's rules + a blinker: it survives three driven cycles (no auto-pause, Decision B.5) and the counter follows", () => {
    const driver = installFrameDriver();
    const { container, canvas } = mount({ survivalRules: conwayRules() });
    if (canvas === null) throw new Error('canvas did not mount');
    drawBlinker(canvas);

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    driver.frame(100);
    driver.frame(200);
    driver.frame(300);

    expect(box(container)).toHaveAttribute('data-cycle', '3');
    expect(box(container)).toHaveAttribute('data-status', 'playing');
    expect(driver.pending()).toBe(1);
  });

  it('rule edits mid-run change nothing; Stop then Play applies them (AC2)', () => {
    const driver = installFrameDriver();
    const { container, canvas, rerender, props } = mount({ survivalRules: conwayRules() });
    if (canvas === null) throw new Error('canvas did not mount');
    drawBlinker(canvas);

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    driver.frame(100);
    driver.frame(200);
    expect(box(container)).toHaveAttribute('data-cycle', '2');

    // The roster is frozen mid-run: this change is not observed until Stop.
    rerender(<PreviewPanel {...props} survivalRules={[]} />);
    driver.frame(300);
    driver.frame(400);

    expect(box(container)).toHaveAttribute('data-cycle', '4');
    expect(box(container)).toHaveAttribute('data-status', 'playing');
    expect(within(transport(container)).getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Pause' }));
    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Stop & reset' }));
    expect(box(container)).toHaveAttribute('data-cycle', '0');

    // At rest, the roster now follows the empty rule list: the blinker dies at cycle 1.
    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    driver.frame(100);

    expect(box(container)).toHaveAttribute('data-cycle', '1');
    expect(box(container)).toHaveAttribute('data-status', 'paused');
  });

  it('the reverse direction: zero rules dies at cycle 1; after Stop, switching to Conway + a blinker survives (AC2)', () => {
    const driver = installFrameDriver();
    const { container, canvas, rerender, props } = mount({ survivalRules: [] });
    if (canvas === null) throw new Error('canvas did not mount');
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 5, 5));

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    driver.frame(100);
    expect(box(container)).toHaveAttribute('data-cycle', '1');
    expect(box(container)).toHaveAttribute('data-status', 'paused');

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Stop & reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    const editCanvas = container.querySelector('canvas');
    if (editCanvas === null) throw new Error('edit canvas did not remount');
    // A fresh canvas element has no stubbed `getBoundingClientRect` (jsdom defaults to an
    // all-zero rect), which would land every pointer event outside the grid.
    stubCanvasRect(editCanvas);
    drawBlinker(editCanvas);
    rerender(<PreviewPanel {...props} survivalRules={conwayRules()} />);

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    driver.frame(100);
    driver.frame(200);
    driver.frame(300);

    expect(box(container)).toHaveAttribute('data-cycle', '3');
    expect(box(container)).toHaveAttribute('data-status', 'playing');
  });

  it('rule edits AT REST rebind the run without touching the speed', () => {
    const { container, rerender, props } = mount();
    const slider = screen.getByRole('slider', { name: 'Generations per second' });
    fireEvent.change(slider, { target: { value: '2' } });
    expect(slider).toHaveAttribute('aria-valuetext', '5 generations per second');

    rerender(<PreviewPanel {...props} survivalRules={conwayRules()} />);
    expect(screen.getByRole('slider', { name: 'Generations per second' })).toHaveAttribute(
      'aria-valuetext',
      '5 generations per second',
    );
    expect(box(container)).toHaveAttribute('data-cycle', '0');

    const canvas = container.querySelector('canvas');
    if (canvas === null) throw new Error('canvas did not mount');
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 5, 5));
    expect(screen.getByRole('slider', { name: 'Generations per second' })).toHaveAttribute(
      'aria-valuetext',
      '5 generations per second',
    );
  });

  it('Next cycle from rest: exactly one cycle, the run surface mounts, tools disable, no frame requested (FR-4.3)', () => {
    const driver = installFrameDriver();
    const { container, canvas } = mount();
    if (canvas === null) throw new Error('canvas did not mount');
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 5, 5));

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Next cycle' }));

    expect(box(container)).toHaveAttribute('data-cycle', '1');
    expect(box(container)).toHaveAttribute('data-status', 'paused');
    expect(driver.raf).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled();
    expect(within(transport(container)).getByRole('button', { name: 'Next cycle' })).toBeEnabled();
    expect(within(transport(container)).getByRole('button', { name: 'Play' })).toBeEnabled();
  });

  it('Next cycle while playing is disabled with its title (3.12 FD6, inherited)', () => {
    installFrameDriver();
    const { container, canvas } = mount();
    if (canvas === null) throw new Error('canvas did not mount');
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 5, 5));

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));

    const step = within(transport(container)).getByRole('button', { name: 'Next cycle' });
    expect(step).toBeDisabled();
    expect(step).toHaveAttribute('title', 'Available while paused');
  });

  it('an unrunnable draft blocks the start and shows the hint; a runnable one unblocks (AC6)', () => {
    const { container, rerender, props } = mount();

    rerender(<PreviewPanel {...props} survivalRules={[createNewRuleDraft('r1')]} />);
    expect(within(transport(container)).getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(within(transport(container)).getByRole('button', { name: 'Next cycle' })).toBeDisabled();
    expect(
      within(transport(container)).getByRole('button', { name: 'Stop & reset' }),
    ).toBeEnabled();
    expect(screen.getByText('Fix the rule errors to run the preview.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draw' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Erase' })).toBeEnabled();

    const ruleWithCondition: RuleDraft = {
      id: 'r1',
      conditions: [{ id: 'c1', property: 'cellState', operator: 'eq', pattern: 'empty' }],
      payload: { summary: '', action: 'born' },
    };
    rerender(<PreviewPanel {...props} survivalRules={[ruleWithCondition]} />);
    expect(within(transport(container)).getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.queryByText('Fix the rule errors to run the preview.')).toBeNull();
  });

  it('a run in progress is never blocked by an unrunnable draft; blocking takes effect only after Stop (AC6, FD2)', () => {
    const driver = installFrameDriver();
    const { container, canvas, rerender, props } = mount({ survivalRules: conwayRules() });
    if (canvas === null) throw new Error('canvas did not mount');
    drawBlinker(canvas);

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    driver.frame(100);

    rerender(<PreviewPanel {...props} survivalRules={[createNewRuleDraft('r1')]} />);
    expect(within(transport(container)).getByRole('button', { name: 'Pause' })).toBeEnabled();
    let step = within(transport(container)).getByRole('button', { name: 'Next cycle' });
    expect(step).toBeDisabled();
    expect(step).toHaveAttribute('title', 'Available while paused');
    expect(screen.queryByText('Fix the rule errors to run the preview.')).toBeNull();

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Pause' }));
    step = within(transport(container)).getByRole('button', { name: 'Next cycle' });
    expect(step).toBeEnabled();

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Stop & reset' }));
    expect(within(transport(container)).getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByText('Fix the rule errors to run the preview.')).toBeInTheDocument();
  });

  it('a colour pick mid-run repaints the run surface on the same commit (4.14 AC4 holds during a run)', () => {
    const driver = installFrameDriver();
    const { container, canvas, contexts, getContextSpy, rerender, props } = mount({
      survivalRules: conwayRules(),
    });
    if (canvas === null) throw new Error('canvas did not mount');
    drawBlinker(canvas);

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    driver.frame(100);

    const constructionsBefore = getContextSpy.mock.calls.length;
    rerender(<PreviewPanel {...props} colorToken="azure" />);

    expect(getContextSpy.mock.calls.length).toBeGreaterThan(constructionsBefore);
    const runCanvas = container.querySelector('canvas');
    if (runCanvas === null) throw new Error('run canvas did not mount');
    const recording = drawnRecording(contexts, runCanvas);
    expect(recording.fillStyleWrites).toContain(
      displayColorAt(paletteIndexOf('azure'), MAX_AGE_SHADE),
    );
  });

  it('a rerender with the same props rebinds nothing (FD2 tripwire)', () => {
    const { container, getContextSpy, rerender, props } = mount();
    const constructionsBefore = getContextSpy.mock.calls.length;
    const statusBefore = box(container).getAttribute('data-status');
    const cycleBefore = box(container).getAttribute('data-cycle');

    rerender(<PreviewPanel {...props} />);

    expect(getContextSpy.mock.calls.length).toBe(constructionsBefore);
    expect(box(container).getAttribute('data-status')).toBe(statusBefore);
    expect(box(container).getAttribute('data-cycle')).toBe(cycleBefore);

    // The panel has no `name` prop, so a name-only draft edit cannot be observed directly here —
    // instead, pin `previewOrganismFrom`'s call count over rerenders sharing the SAME
    // [colorToken, survivalRules] identity: it must not be re-invoked.
    vi.mocked(previewOrganismFrom).mockClear();
    rerender(<PreviewPanel {...props} />);
    rerender(<PreviewPanel {...props} />);
    expect(previewOrganismFrom).not.toHaveBeenCalled();
  });

  it('unmount mid-run stops the loop (3.10 obligation 3)', () => {
    const driver = installFrameDriver();
    const { container, canvas, unmount } = mount();
    if (canvas === null) throw new Error('canvas did not mount');
    fireEvent.pointerDown(canvas, centreOfCell(canvas, 5, 5));
    fireEvent.pointerUp(canvas, centreOfCell(canvas, 5, 5));

    fireEvent.click(within(transport(container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    const handle = driver.raf.mock.results.at(-1)?.value as number | undefined;

    unmount();

    expect(driver.caf).toHaveBeenCalledWith(handle);
    expect(driver.pending()).toBe(0);
  });

  it('the Simulation controls group precedes the slider which precedes the cycle readout, all after Clear', () => {
    const { container } = mount();
    const clear = screen.getByRole('button', { name: 'Clear' });
    const group = transport(container);
    const slider = screen.getByRole('slider', { name: 'Generations per second' });
    const cycleBlock = container.querySelector('[data-preview-cycle]');
    if (cycleBlock === null) throw new Error('cycle block did not render');

    expect(clear.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      slider.compareDocumentPosition(cycleBlock) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('axe: at rest, blocked, and mid-run all have no violations', async () => {
    const atRest = mount();
    expect((await axe(atRest.container)).violations).toEqual([]);
    cleanup();

    const blocked = mount({ survivalRules: [createNewRuleDraft('r1')] });
    expect((await axe(blocked.container)).violations).toEqual([]);
    cleanup();

    const driver = installFrameDriver();
    const midRun = mount({ survivalRules: conwayRules() });
    if (midRun.canvas === null) throw new Error('canvas did not mount');
    drawBlinker(midRun.canvas);
    fireEvent.click(within(transport(midRun.container)).getByRole('button', { name: 'Play' }));
    driver.frame(0);
    driver.frame(100);
    expect((await axe(midRun.container)).violations).toEqual([]);
  });
});
