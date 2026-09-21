import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { GridRenderer } from '@/lib/canvas/gridRenderer';
import { resetColourStateWarnings } from '@/lib/canvas/colourStateGroups';
import { resetRefToFillGroupWarnings } from '@/lib/canvas/refToFillGroup';
import { computeGridLayout } from '@/lib/canvas/gridLayout';
import { RecordingContext2D } from '@/test-support/recordingContext2d';
import { displayColorAt, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { paletteIndexOf } from '@/lib/palette/paletteRegistry';
import { PREVIEW_GRID_SIZE } from '@/lib/organisms/previewGrid';
import PreviewPanel, { type PreviewPanelProps } from './PreviewPanel';

const COLORS = { background: '#0a0a0a', gridLine: 'rgb(51 51 51 / 0.3)' };

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
    ...overrides,
  };
  const view = render(<PreviewPanel {...props} />);
  const canvas = view.container.querySelector('canvas');
  if (canvas !== null) stubCanvasRect(canvas);
  return { ...view, canvas, contexts, getContextSpy, props };
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
    rerender(<PreviewPanel colorToken="azure" agingEnabled={false} colors={COLORS} />);

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
    rerender(<PreviewPanel colorToken="vermillion" agingEnabled colors={COLORS} />);
    expect(recording.fillStyleWrites.slice(mark)).toContain(
      displayColorAt(paletteIndexOf('vermillion'), 0),
    );

    mark = recording.fillStyleWrites.length;
    rerender(<PreviewPanel colorToken="vermillion" agingEnabled={false} colors={COLORS} />);
    expect(recording.fillStyleWrites.slice(mark)).toContain(
      displayColorAt(paletteIndexOf('vermillion'), MAX_AGE_SHADE),
    );
  });

  it('a rerender with the SAME token and flag constructs nothing (AC4 memo)', () => {
    const { getContextSpy, rerender } = mount({ colorToken: 'vermillion', agingEnabled: false });

    const constructionsBefore = getContextSpy.mock.calls.length;
    const drawFullSpy = vi.spyOn(GridRenderer.prototype, 'drawFull');
    rerender(<PreviewPanel colorToken="vermillion" agingEnabled={false} colors={COLORS} />);

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
    rerender(<PreviewPanel colorToken="azure" agingEnabled={false} colors={COLORS} />);

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
