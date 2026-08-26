/**
 * GridRenderer — the frozen contract (`component-tree-battle-page.md#5`), whose six methods land
 * across three epics. Story 1.8 shipped `drawFull` + `renderStatic` (plus `resize`/`setGridLines`,
 * which both need); **Story 2.3 adds the dirty-region editing paths** (`draw` + `markDirty`).
 * Epic 3 wraps it with the loop, adding nothing to it.
 *
 * A class, deliberately: the "no classes" rule (project-context.md) is scoped to the engine
 * (packages/simulation, the rules layer); this is the one place in apps/web a class is correct —
 * it holds genuine instance state (canvas, context, layout, overlay cache, and now the dirty-cell
 * marks and last-drawn colour-state baseline) that Epic 3 hands around via `onRendererReady`. The
 * dirty-region *decision logic* stays a pure module (dirtyCells.ts, AR-42) — only the hand lives
 * here.
 *
 * ⚠️ **No back buffer** (Story 2.3, spec conflict #1). RFC-002's headline Decision line reads
 * "HTML5 Canvas API with double buffering and dirty rectangle optimization", and its §"1. Double
 * Buffering" sketches a full offscreen frame plus a `drawImage` swap. The two optimisations are in
 * tension: a full-canvas `drawImage` per frame repaints everything anyway, which is precisely the
 * cost dirty regions exist to avoid — and Canvas2D never presents a partially-painted frame from
 * within one task, so there is no tearing to prevent. Dirty regions win; the grid-line overlay
 * (RFC-002 Risk 4) remains the only offscreen canvas here.
 *
 * AC3 — the frozen contract's other half: this file calls no browser scheduling primitive of any
 * kind (frame callbacks, timers, or microtask queuing), never mutates the grid it is given, and
 * owns no scheduling. Scheduling lives exclusively in SimulationLoop (Story 3.8). Enforced by
 * gridRenderer.test.ts both behaviourally (spies) and structurally (a source-text regex read off
 * disk, naming the exact primitives banned) — belt and braces, because the structural check is
 * the promise Epic 3 is actually being given.
 */
import { displayColorAt } from '../palette/displayColor';
import {
  ageShadeOfGroup,
  colourStateAt,
  EMPTY_COLOUR_STATE,
  groupByColourState,
  tokenIndexOfGroup,
} from './colourStateGroups';
import {
  markDirtyCells,
  selectDirtyCells,
  type CellCoord,
  type DirtyCellRepaint,
} from './dirtyCells';
import { computeGridLayout, gridLayoutEquals, type GridLayout } from './gridLayout';
import type { RefToFillGroup } from './refToFillGroup';
import type { RenderableGrid } from './renderableGrid';

// Re-exported so Stories 2.5/2.6/2.7 import the coordinate type from the renderer they hand it to,
// rather than reaching into the pure module behind it. `export type` is mandatory under
// isolatedModules — a bare re-export fails to compile.
export type { CellCoord };

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

/**
 * `window.devicePixelRatio ?? 1` is not enough: `??` catches only null/undefined, so a 0 or NaN
 * ratio (a stubbed value, a headless or virtualised display) survives it and collapses the
 * backing store to 0x0 — nothing renders and nothing throws. Require a finite positive number.
 */
function resolveDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.devicePixelRatio;
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
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
  // next mutation of the same buffer. Dropped the moment a resize() makes it the wrong shape —
  // see resize().
  private lastGrid: RenderableGrid | null = null;

  // Dirty state (Story 2.3). Flat cell indices, not merged rectangles — see dirtyCells.ts for why
  // a merged rect cannot go through the (colorToken, ageShade) batching path at all.
  private readonly dirtyCells = new Set<number>();

  // Per-cell last-drawn colour state — `fillGroupOf`'s `tokenIndex * 8 + ageShade`, which encodes
  // occupant token AND age shade in one comparison (AC1's rule verbatim), with EMPTY_COLOUR_STATE
  // for an empty cell. One Uint16Array of width * height (~12 KB at 100x60) is strictly cheaper
  // than retaining copies of both the occupant and age buffers, and it correctly treats two
  // organisms sharing a colour token as visually identical (Decision B.2 / M6).
  // `null` means "no baseline primed yet" — only a driven full repaint primes it, which is what
  // keeps renderStatic out of this state machine entirely.
  private lastColourState: Uint16Array | null = null;

  // The CSS-pixel box the backing store was last computed from, and the backing store this class
  // last wrote. Both exist to keep applyDevicePixelSizing idempotent — see the comment there.
  private cssWidth = 0;
  private cssHeight = 0;
  private backingWidth = -1;
  private backingHeight = -1;

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
    });
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
   *
   * ⚠️ **The anti-double-scaling guard below requires a RETAINED renderer** (Story 2.3, closing
   * the 1.11 review item). `backingWidth` starts at -1 per instance, so a caller that constructs a
   * fresh GridRenderer for every paint — which is exactly what `<PetriDishCanvas>`'s `static`
   * Gallery tiles do, deliberately (Story 1.11) — never matches it, and `authoredWidth` is always
   * the *previous* renderer's already-multiplied `cssPx * dpr`. That case is documented rather
   * than engineered around: making the guard instance-independent means writing renderer state
   * onto the canvas element, and the surfaces where repeated `resize()` on one instance is real —
   * the edit canvas (2.4) and the playback canvas (3.11) — are precisely the ones that retain a
   * renderer, because dirty tracking is meaningless without one. The residual `dpr²` exposure for
   * a static tile repainted at a 0-width box is recorded in deferred-work.md.
   */
  private applyDevicePixelSizing(): void {
    const dpr = resolveDevicePixelRatio();
    // The fallback must not read back a canvas.width THIS CLASS wrote: that value is already
    // `cssPx * dpr`, so feeding it through the `* dpr` below multiplies the backing store by dpr
    // again on every call — 2x, 4x, 8x across repeated resize()s at DPR 2, whenever clientWidth
    // reads 0 (detached, pre-layout, display:none). A canvas.width we did NOT write is a caller
    // sizing the surface directly, which is still a CSS-pixel instruction and the documented
    // pre-layout path — so distinguish the two rather than dropping the fallback entirely.
    const authoredWidth =
      this.canvas.width === this.backingWidth ? this.cssWidth : this.canvas.width;
    const authoredHeight =
      this.canvas.height === this.backingHeight ? this.cssHeight : this.canvas.height;

    this.cssWidth = this.canvas.clientWidth || authoredWidth;
    this.cssHeight = this.canvas.clientHeight || authoredHeight;

    const nextWidth = Math.round(this.cssWidth * dpr);
    const nextHeight = Math.round(this.cssHeight * dpr);
    this.backingWidth = nextWidth;
    this.backingHeight = nextHeight;
    // Assigning canvas.width/height resets the bitmap AND the context state even when the value
    // is unchanged, and under alpha: false a cleared bitmap composites as opaque black. A resize()
    // that then skips its repaint would leave a black rectangle where the dish was, so only
    // assign on a real change — and re-assert the identity transform when we do, since the reset
    // wipes it (the constructor's setTransform is not "held for the lifetime" on its own).
    if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) return;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
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

  /**
   * Builds (or rebuilds) the offscreen grid-line overlay for the current layout, if possible —
   * and **reuses** the cached one when the new layout describes the same picture at the same
   * backing-store size (Story 2.3, closing the 1.8 review item).
   *
   * `computeGridLayout` returns a fresh object per call, so `resize()`/`setGridLines()` reassign
   * `this.layout` on every invocation whether or not anything changed. Without this guard that
   * meant one full-backing-store canvas allocation per call: at NFR-7.2's ~50 Gallery tiles under
   * a sustained ResizeObserver drag, one per tile per debounce tick. The re-pointing below is what
   * makes the reuse visible to `paintGridLines`, whose cache check is an identity comparison.
   */
  private rebuildGridLineOverlay(): void {
    if (
      this.gridLineOverlay !== null &&
      this.gridLineOverlayLayout !== null &&
      this.layout.gridLinesVisible &&
      gridLayoutEquals(this.gridLineOverlayLayout, this.layout) &&
      // The overlay is drawn at 1:1 onto the main canvas, so a backing-store change invalidates it
      // even when the grid geometry inside it is unchanged.
      this.gridLineOverlay.width === this.canvas.width &&
      this.gridLineOverlay.height === this.canvas.height
    ) {
      this.gridLineOverlayLayout = this.layout;
      return;
    }

    this.gridLineOverlay = null;
    this.gridLineOverlayLayout = null;
    if (!this.layout.gridLinesVisible) return;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;

    const overlay = document.createElement('canvas');
    overlay.width = this.canvas.width;
    overlay.height = this.canvas.height;
    const overlayCtx = overlay.getContext('2d');
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
    const { originX, originY, drawWidth, drawHeight, cellSize } = this.layout;
    if (drawWidth <= 0 || drawHeight <= 0) return;

    target.fillStyle = this.colors.gridLine;
    // The closing bar of each axis is the grid's right/bottom border. Drawn at its natural
    // offset it lands one pixel PAST the rectangle, and when the grid fits the canvas exactly
    // (originX === 0, drawWidth === canvas.width) fillRect clips it away entirely — a dish with a
    // left and top border and no right or bottom one. Pull the closing bar back inside the
    // rectangle so "confined to the grid rectangle" is true of the drawing, not just the comment.
    for (let col = 0; col <= this.size.cols; col++) {
      target.fillRect(originX + Math.min(col * cellSize, drawWidth - 1), originY, 1, drawHeight);
    }
    for (let row = 0; row <= this.size.rows; row++) {
      target.fillRect(originX, originY + Math.min(row * cellSize, drawHeight - 1), drawWidth, 1);
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

  /** The pixels-only full repaint: no retention, no dirty state. Shared by both public entries. */
  private paintSurface(grid: RenderableGrid): void {
    this.assertGridMatchesSize(grid);
    this.paintBackground();
    this.paintCells(grid);
    this.paintGridLines();
  }

  /**
   * Full repaint for a renderer that will be DRIVEN again: pixels, plus the retention and
   * dirty-state reset that make a subsequent `draw` correct. `resize()`/`setGridLines()` go
   * through here too — both repaint the whole surface, so both must leave the same clean state.
   */
  private paint(grid: RenderableGrid): void {
    this.paintSurface(grid);
    this.lastGrid = grid;
    this.resetDirtyState(grid);
  }

  /**
   * Drops accumulated marks and (re)primes the last-drawn colour-state baseline for the whole
   * grid. The sweep is O(cells) and allocates once per grid shape — affordable because it runs on
   * a full repaint (mount, resize, grid-lines toggle), never on the per-edit `draw` path this
   * story exists to keep cheap.
   */
  private resetDirtyState(grid: RenderableGrid): void {
    this.dirtyCells.clear();
    const cellCount = grid.width * grid.height;
    if (this.lastColourState === null || this.lastColourState.length !== cellCount) {
      this.lastColourState = new Uint16Array(cellCount);
    }
    for (let index = 0; index < cellCount; index++) {
      this.lastColourState[index] = colourStateAt(grid, this.palette, index);
    }
  }

  /**
   * Full repaint. Keep calling this from a renderer that will be driven again — it resets dirty
   * state, which is what makes a `draw` after a `resize`/`setGridLines` correct. Story 1.11's
   * Gallery tiles must call `renderStatic` instead.
   */
  drawFull(grid: RenderableGrid): void {
    this.paint(grid);
  }

  /**
   * Loopless one-shot for a surface nothing will drive again (a Gallery tile, an editor-preview
   * still — M4/AR-25).
   *
   * Deliberately NOT an alias of `drawFull` (Story 2.3): it primes no colour-state baseline, keeps
   * no marks, and — closing the 1.8 review's retention item — **retains no `lastGrid`**. Making
   * these two aliases again opts ~50 Gallery canvases (NFR-7.2) into per-cell bookkeeping and 50
   * pinned typed-array pairs they never use. The retention it drops protected re-layout repaint
   * for static tiles, which since Story 1.11 has no caller: `<PetriDishCanvas>` constructs a fresh
   * renderer per paint and never calls `resize()`/`setGridLines()` on a static one. A static
   * surface re-layouts by reconstruction, not by repaint.
   */
  renderStatic(grid: RenderableGrid): void {
    this.paintSurface(grid);
  }

  /**
   * Accumulates dirty CANDIDATES between draws (AC2). Marking is legal before any draw; marks
   * survive until the next `draw`/`drawFull` consumes them, and re-marking a cell is free.
   *
   * ⚠️ It marks only. It must never paint, never read the canvas, and never touch `lastGrid`:
   * Stories 2.5/2.6 call this once per cell during a drag, so a repaint in here converts one
   * repaint per committed gesture into one per pointer move — the NFR-4.2 interaction budget this
   * whole story exists to protect. The hot stroke state stays in the caller's refs (RFC-005
   * Decision 6, project-context "hot simulation state").
   */
  markDirty(cells: Iterable<CellCoord>): void {
    markDirtyCells(this.dirtyCells, this.size, cells);
  }

  /**
   * Repaints only the marked cells whose colour state actually changed (AC1). Each surviving cell
   * is repainted background-first, then its colour through the shared batching, then the grid
   * lines that cross it.
   */
  draw(grid: RenderableGrid): void {
    // Same guard drawFull applies, and for a stronger reason: a dirty repaint against a mis-shaped
    // grid corrupts more silently than a full one, leaving the rest of the dish looking correct.
    this.assertGridMatchesSize(grid);

    // No baseline to diff against — a renderer's first frame legitimately has nothing to be
    // incremental against (Story 2.3 forced decision 3). Fall back to a full repaint rather than
    // throwing: `draw` becomes a pointer-move path in 2.6, and one extra full paint is cheaper
    // than an exception out of an event handler.
    if (this.lastColourState === null) {
      this.paint(grid);
      return;
    }

    const repaints = selectDirtyCells(this.dirtyCells, grid, this.palette, this.lastColourState);
    this.lastGrid = grid;
    this.dirtyCells.clear();
    // RFC-002 §"Only redraw dirty regions": nothing survived, so the context is not touched at
    // all — this is the property Decision D.3 relies on to make idle playback frames free.
    if (repaints.length === 0) return;

    this.paintDirtyCells(grid, repaints);
    for (const repaint of repaints) this.lastColourState[repaint.index] = repaint.colourState;
  }

  private paintDirtyCells(grid: RenderableGrid, repaints: readonly DirtyCellRepaint[]): void {
    const { originX, originY, cellSize } = this.layout;

    // (a) Background first, for EVERY repainted cell — including the ones that are now empty. The
    // full-repaint path can `continue` past empty cells (colourStateGroups.ts) because it fills
    // the whole background first; this path has no such prior fill, so skipping empties would
    // leave an erased cell showing its old colour, and a test that only ever paints would pass.
    this.ctx.fillStyle = this.colors.background;
    for (const { index } of repaints) {
      this.ctx.fillRect(
        originX + (index % grid.width) * cellSize,
        originY + Math.floor(index / grid.width) * cellSize,
        cellSize,
        cellSize,
      );
    }

    // (b) Colour, through the same (colorToken, ageShade) batching as the full path (AR-23,
    // Decision B.2). Opening a fresh path per cell is the RFC-002 §3 anti-pattern whether 6000
    // cells or 6 are involved, and one shared beginPath/fill across groups would re-fill groups
    // 1..n in group n's colour.
    const groups = new Map<number, number[]>();
    for (const { index, colourState } of repaints) {
      if (colourState === EMPTY_COLOUR_STATE) continue;
      const cells = groups.get(colourState);
      if (cells === undefined) groups.set(colourState, [index]);
      else cells.push(index);
    }
    for (const groupId of [...groups.keys()].sort((a, b) => a - b)) {
      this.ctx.fillStyle = displayColorAt(tokenIndexOfGroup(groupId), ageShadeOfGroup(groupId));
      this.ctx.beginPath();
      for (const index of groups.get(groupId) as number[]) {
        this.ctx.rect(
          originX + (index % grid.width) * cellSize,
          originY + Math.floor(index / grid.width) * cellSize,
          cellSize,
          cellSize,
        );
      }
      this.ctx.fill();
    }

    // (c) Not optional. paint() draws background -> cells -> lines, so lines sit ON TOP of cells;
    // filling a cell rect paints over the line segments bordering it. Without this the dish
    // accumulates line gaps wherever the user has painted, and in Edit mode nothing full-repaints
    // to clear them.
    this.restoreGridLinesOver(grid, repaints);
  }

  /**
   * Redraws just the four bar segments bordering each repainted cell, at the same clamped
   * coordinates `drawGridLinesInto` uses — so a restored border is byte-identical to the one a
   * full repaint would have drawn, including the closing bars pulled back inside the rectangle.
   *
   * Bar segments rather than a sub-rectangle `drawImage` of the cached overlay: the 9-argument
   * `drawImage` overload is outside the `Canvas2D` alias this file deliberately narrows to, so
   * that route would widen both the alias and the test double — and the double silently drops
   * arguments it does not declare, which is the wrong failure mode for a geometry change.
   */
  private restoreGridLinesOver(grid: RenderableGrid, repaints: readonly DirtyCellRepaint[]): void {
    if (!this.layout.gridLinesVisible) return;
    const { originX, originY, drawWidth, drawHeight, cellSize } = this.layout;
    if (drawWidth <= 0 || drawHeight <= 0) return;

    this.ctx.fillStyle = this.colors.gridLine;
    for (const { index } of repaints) {
      const col = index % grid.width;
      const row = Math.floor(index / grid.width);
      const x = originX + col * cellSize;
      const y = originY + row * cellSize;
      // min(..., drawWidth - 1) mirrors drawGridLinesInto: a closing bar at its natural offset
      // lands one pixel past the grid rectangle and gets clipped away.
      this.ctx.fillRect(originX + Math.min(col * cellSize, drawWidth - 1), y, 1, cellSize);
      this.ctx.fillRect(originX + Math.min((col + 1) * cellSize, drawWidth - 1), y, 1, cellSize);
      this.ctx.fillRect(x, originY + Math.min(row * cellSize, drawHeight - 1), cellSize, 1);
      this.ctx.fillRect(x, originY + Math.min((row + 1) * cellSize, drawHeight - 1), cellSize, 1);
    }
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
   * skips the repaint, DROPS the now-invalid grid, and waits for the caller's next `drawFull`
   * with a correctly-sized one.
   */
  resize(size: { cols: number; rows: number }): void {
    this.size = size;
    this.applyDevicePixelSizing();
    this.layout = computeGridLayout(this.canvas, this.size, this.showGridLines);
    this.rebuildGridLineOverlay();

    // Every cached cell position is now stale, so marks accumulated at the OLD geometry would
    // repaint at the wrong place on the next draw (Story 2.3). Whichever branch follows, the
    // surface either gets fully repainted or holds nothing worth diffing against.
    this.dirtyCells.clear();

    if (
      this.lastGrid !== null &&
      this.lastGrid.width === this.size.cols &&
      this.lastGrid.height === this.size.rows
    ) {
      this.paint(this.lastGrid); // re-primes the colour-state baseline at the new layout
      return;
    }
    // Dropping the reference is what keeps setGridLines() safe: it repaints lastGrid whenever
    // there is one, so a grid left behind at the wrong shape turns the FR-8.7 toggle into a
    // GridRendererDimensionMismatchError thrown out of a UI event handler (review 2026-08-06).
    // The colour-state baseline goes with it — a grid-dimension change (Story 2.14) makes the
    // buffer the wrong length, and a stale-length baseline would mis-index every comparison.
    this.lastGrid = null;
    this.lastColourState = null;
  }

  /** No-op-repaint when the value is unchanged; otherwise stores, invalidates the overlay cache,
   *  and repaints the last grid if there is one. */
  setGridLines(on: boolean): void {
    if (on === this.showGridLines) return;
    this.showGridLines = on;
    this.layout = computeGridLayout(this.canvas, this.size, this.showGridLines);
    this.rebuildGridLineOverlay();
    // Same reasoning as resize(): the whole surface is about to be repainted (or there is nothing
    // to diff against), so no accumulated mark can survive the toggle meaningfully.
    this.dirtyCells.clear();
    if (this.lastGrid !== null) this.paint(this.lastGrid);
  }
}
