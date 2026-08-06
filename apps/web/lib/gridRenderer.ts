/**
 * GridRenderer — the frozen contract's static core (Story 1.8 Task 5, AC1/2/3/4).
 * `component-tree-battle-page.md#5` names six methods split across three epics; this story ships
 * exactly `drawFull` and `renderStatic` (plus `resize`/`setGridLines`, which both need). `draw`
 * (dirty regions) and `markDirty` are Story 2.3 — implementing them now means designing them
 * blind, before any editing gesture exists to shape them.
 *
 * A class, deliberately: the "no classes" rule (project-context.md) is scoped to the engine
 * (packages/simulation, the rules layer); this is the one place in apps/web a class is correct —
 * it holds genuine instance state (canvas, context, layout, overlay cache) that Epic 3 hands
 * around via `onRendererReady`.
 *
 * AC3 — the frozen contract's other half: this file calls no browser scheduling primitive of any
 * kind (frame callbacks, timers, or microtask queuing), never mutates the grid it is given, and
 * owns no scheduling. Scheduling lives exclusively in SimulationLoop (Story 3.8). Enforced by
 * gridRenderer.test.ts both behaviourally (spies) and structurally (a source-text regex read off
 * disk, naming the exact primitives banned) — belt and braces, because the structural check is
 * the promise Epic 3 is actually being given.
 */
import { displayColorAt } from './displayColor';
import { groupByColourState } from './colourStateGroups';
import { computeGridLayout, type GridLayout } from './gridLayout';
import type { RefToFillGroup } from './refToFillGroup';
import type { RenderableGrid } from './renderableGrid';

// Narrow structural alias of the canvas members this file actually uses. Declared here (not
// imported from lib.dom) so the hand-rolled test double in recordingContext2d.ts can satisfy it
// structurally, with no cast anywhere except the one spy-return-type coercion the test file names.
export type Canvas2D = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'fillRect' | 'beginPath' | 'rect' | 'fill' | 'drawImage' | 'setTransform'
>;

export interface GridRendererColors {
  readonly background: string; // the dish surface (--gol-bg-primary in Story 1.9)
  readonly gridLine: string; // --gol-border at the mockup's 0.3 alpha
}

export interface GridRendererOptions {
  readonly colors: GridRendererColors;
  readonly showGridLines?: boolean; // default TRUE (FR-8.7)
  readonly desynchronized?: boolean; // default FALSE — see the class doc comment below
}

export class GridRendererContextError extends Error {
  constructor() {
    super('GridRenderer: canvas.getContext("2d") returned null');
    this.name = 'GridRendererContextError';
  }
}

export class GridRendererDimensionMismatchError extends Error {
  constructor(expected: { cols: number; rows: number }, actual: { width: number; height: number }) {
    super(
      `GridRenderer: grid dimensions ${actual.width}x${actual.height} do not match the ` +
        `renderer's size ${expected.cols}x${expected.rows}`,
    );
    this.name = 'GridRendererDimensionMismatchError';
  }
}

export class GridRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: Canvas2D;
  private readonly colors: GridRendererColors;
  // Deliberate deviation from RFC-002's snippet, which sets `desynchronized: true`
  // unconditionally: that flag requests a low-latency compositing surface per canvas, and the
  // Gallery mounts up to ~50 of them (NFR-7.2). It is an interactive-surface optimisation, not a
  // free win at scale — default it off; Epic 3's playback canvas opts in explicitly.
  private readonly desynchronized: boolean;

  private size: { cols: number; rows: number };
  private showGridLines: boolean;
  private layout: GridLayout;

  // Cache the grid-line overlay per RFC-002 Risk 4, but only when free to do so: an offscreen
  // canvas is unavailable under jsdom (no native canvas package — see Task 6), so this stays null
  // and setGridLines/resize fall back to drawing lines directly. Optimisation, not a hard
  // dependency.
  private gridLineOverlay: HTMLCanvasElement | null = null;
  private gridLineOverlayLayout: GridLayout | null = null;

  // A borrow, not ownership: kept only so resize()/setGridLines() can repaint the last grid they
  // were shown. The renderer never mutates it and never assumes it stays valid after the caller's
  // next mutation of the same buffer.
  private lastGrid: RenderableGrid | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    size: { cols: number; rows: number },
    private readonly palette: RefToFillGroup,
    options: GridRendererOptions,
  ) {
    this.canvas = canvas;
    this.colors = options.colors;
    this.desynchronized = options.desynchronized ?? false;
    this.size = size;
    this.showGridLines = options.showGridLines ?? true; // FR-8.7 default

    // alpha: false (RFC-002) makes the un-painted canvas opaque black — drawFull must fill the
    // WHOLE backing store, not just the grid rectangle, or the centring margins render as black
    // bars instead of dish surface (see drawFull below).
    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: this.desynchronized,
    }) as Canvas2D | null;
    // A silently context-less renderer produces a blank Gallery with a clean console — throw
    // named, don't degrade.
    if (ctx === null) throw new GridRendererContextError();
    this.ctx = ctx;

    this.applyDevicePixelSizing();
    // Identity transform, held for the renderer's lifetime: ctx.scale(dpr, dpr) would make the
    // integer cellSize fractional in device space at any non-integer DPR (1.25/1.5 are common),
    // seaming every cell edge. Compute cellSize in device px instead and never scale the context.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.layout = computeGridLayout(canvas, this.size, this.showGridLines);
    this.rebuildGridLineOverlay();
  }

  /**
   * Sets `canvas.width`/`canvas.height` (the backing store) from the CSS box and DPR — this is
   * what "crisply" in the story statement means. `clientWidth`/`clientHeight` are 0 for an
   * unattached canvas (jsdom, any pre-layout call); fall back to the canvas's existing width/
   * height attributes rather than producing a 0x0 backing store.
   */
  private applyDevicePixelSizing(): void {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
    const cssWidth = this.canvas.clientWidth || this.canvas.width;
    const cssHeight = this.canvas.clientHeight || this.canvas.height;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
  }

  private assertGridMatchesSize(grid: RenderableGrid): void {
    // The highest-value assertion in this file: without it a grid one row short reads garbage off
    // the end of the typed array and paints a plausible-looking but wrong dish, and a grid one
    // row long silently leaves stale cells on screen. `cols`/`rows` (the frozen contract's own
    // constructor names) vs `width`/`height` (RFC-004 §3.4's Grid names) are the same two
    // numbers under two specs — asserting they agree converts that naming seam from a silent-
    // corruption surface into a loud one.
    if (grid.width !== this.size.cols || grid.height !== this.size.rows) {
      throw new GridRendererDimensionMismatchError(this.size, grid);
    }
    const cellCount = grid.width * grid.height;
    if (grid.occupant.length !== cellCount || grid.age.length !== cellCount) {
      throw new GridRendererDimensionMismatchError(this.size, grid);
    }
  }

  private paintBackground(): void {
    this.ctx.fillStyle = this.colors.background;
    // The FULL backing store, not just the grid rectangle (see alpha: false above) — the
    // centring margins are dish surface, not the canvas's default opaque black.
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private paintCells(grid: RenderableGrid): void {
    const groups = groupByColourState(grid, this.palette);
    for (const group of groups) {
      // One fillStyle write and one fill() per group is the entire point of batching (AR-23); a
      // per-cell fillStyle write is the anti-pattern RFC-002 §3 opens with.
      this.ctx.fillStyle = displayColorAt(group.tokenIndex, group.ageShade);
      // beginPath() per group is mandatory, not stylistic: canvas paths accumulate, so omitting
      // it makes group n's fill() re-fill every rect from groups 1..n in group n's colour — "the
      // last organism's colour wins", and O(n^2) fill work with it.
      this.ctx.beginPath();
      for (const index of group.cells) {
        const row = Math.floor(index / grid.width);
        const col = index % grid.width;
        this.ctx.rect(
          this.layout.originX + col * this.layout.cellSize,
          this.layout.originY + row * this.layout.cellSize,
          this.layout.cellSize,
          this.layout.cellSize,
        );
      }
      this.ctx.fill();
    }
  }

  /** Builds (or rebuilds) the offscreen grid-line overlay for the current layout, if possible. */
  private rebuildGridLineOverlay(): void {
    this.gridLineOverlay = null;
    this.gridLineOverlayLayout = null;
    if (!this.layout.gridLinesVisible) return;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;

    const overlay = document.createElement('canvas');
    overlay.width = this.canvas.width;
    overlay.height = this.canvas.height;
    const overlayCtx = overlay.getContext('2d') as Canvas2D | null;
    if (overlayCtx === null) return; // jsdom: fall back to direct drawing, see paintGridLines.

    this.drawGridLinesInto(overlayCtx);
    this.gridLineOverlay = overlay;
    this.gridLineOverlayLayout = this.layout;
  }

  /**
   * Draws cols+1 vertical and rows+1 horizontal 1px bars with fillRect, confined to the grid
   * rectangle — never the full canvas, or they run out across the centring margin. fillRect on
   * integer coordinates is exact at every DPR; a stroked 1px line centred on an integer
   * coordinate straddles two pixels and renders as a soft 2px band, and the standard 0.5-offset
   * fix breaks again the moment DPR changes.
   */
  private drawGridLinesInto(target: Canvas2D): void {
    target.fillStyle = this.colors.gridLine;
    const { originX, originY, drawWidth, drawHeight, cellSize } = this.layout;
    for (let col = 0; col <= this.size.cols; col++) {
      target.fillRect(originX + col * cellSize, originY, 1, drawHeight);
    }
    for (let row = 0; row <= this.size.rows; row++) {
      target.fillRect(originX, originY + row * cellSize, drawWidth, 1);
    }
  }

  private paintGridLines(): void {
    if (!this.layout.gridLinesVisible) return;
    if (this.gridLineOverlay !== null && this.gridLineOverlayLayout === this.layout) {
      this.ctx.drawImage(this.gridLineOverlay, 0, 0);
      return;
    }
    // Cache unavailable (jsdom, or not yet built) — the cache is an optimisation, not a hard
    // dependency (RFC-002 Risk 4).
    this.drawGridLinesInto(this.ctx);
  }

  /** Shared body for drawFull/renderStatic — see the doc comments on each for why they stay two
   *  distinctly-named methods rather than one being an alias of the other. */
  private paint(grid: RenderableGrid): void {
    this.assertGridMatchesSize(grid);
    this.paintBackground();
    this.paintCells(grid);
    this.paintGridLines();
    this.lastGrid = grid;
  }

  /**
   * Full repaint. In Epic 1 this has the same body as `renderStatic` — they diverge in Story 2.3,
   * which gives `drawFull` dirty-state reset semantics that a terminal one-shot must not carry.
   * Keep calling this from a renderer that will be driven again; Story 1.11's Gallery tiles must
   * call `renderStatic` instead, so their one-shot renderers never enter the driven-renderer
   * state machine.
   */
  drawFull(grid: RenderableGrid): void {
    this.paint(grid);
  }

  /**
   * Loopless one-shot for a surface nothing will drive again (a Gallery tile, an editor-preview
   * still — M4/AR-25). Never call `drawFull` where this belongs (Story 1.11); see `drawFull`'s
   * doc comment for the semantic split Story 2.3 introduces.
   */
  renderStatic(grid: RenderableGrid): void {
    this.paint(grid);
  }

  /**
   * Recomputes the backing store from the current CSS box, recomputes the layout, invalidates
   * the grid-line overlay cache, and full-repaints the last grid drawn (or is a no-op repaint if
   * nothing has been drawn yet — safe to call before any grid exists, for re-layout only). Serves
   * both grid-dimension changes (Decision A) and canvas-box changes (fullscreen re-layout, Story
   * 3.18) per the contract comment.
   *
   * A canvas-box-only resize (fullscreen re-layout) keeps `size` unchanged, so the previously
   * drawn grid still matches and gets repainted at the new pixel dimensions. A grid-dimension
   * change (Story 2.14) passes a NEW `size` the old `lastGrid` no longer matches — repainting it
   * anyway would either throw mid-resize or paint stale content at the wrong dimensions, so this
   * skips the repaint and waits for the caller's next `drawFull` with a correctly-sized grid.
   */
  resize(size: { cols: number; rows: number }): void {
    this.size = size;
    this.applyDevicePixelSizing();
    this.layout = computeGridLayout(this.canvas, this.size, this.showGridLines);
    this.rebuildGridLineOverlay();
    if (
      this.lastGrid !== null &&
      this.lastGrid.width === this.size.cols &&
      this.lastGrid.height === this.size.rows
    ) {
      this.paint(this.lastGrid);
    }
  }

  /** No-op-repaint when the value is unchanged; otherwise stores, invalidates the overlay cache,
   *  and repaints the last grid if there is one. */
  setGridLines(on: boolean): void {
    if (on === this.showGridLines) return;
    this.showGridLines = on;
    this.layout = computeGridLayout(this.canvas, this.size, this.showGridLines);
    this.rebuildGridLineOverlay();
    if (this.lastGrid !== null) this.paint(this.lastGrid);
  }
}
