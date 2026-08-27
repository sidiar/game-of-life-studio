'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  GridRenderer,
  GridRendererContextError,
  type GridRendererColors,
} from '@/lib/canvas/gridRenderer';
import { cellsBetween } from '@/lib/canvas/cellLine';
import { computeGridLayout, type GridLayout } from '@/lib/canvas/gridLayout';
import { pointerToCell } from '@/lib/canvas/pointerToCell';
import type { CellCoord } from '@/lib/canvas/dirtyCells';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import type { Tool } from '@/lib/tool';

const RESIZE_DEBOUNCE_MS = 150;

// component-tree-battle-page.md#3.10 names this component and assigns three variants across three
// epics: static -> Epic 1 (Story 1.11), edit -> Epic 2 (this story), playback -> 3.11. Shared props
// stay common across the union; the variant tag decides the lifecycle. `tool` + `onStrokeCommit`
// joined the EDIT member in Story 2.5, which is what makes it structurally different from
// `static` for the first time.
interface PetriDishCanvasSharedProps {
  size: { cols: number; rows: number };
  palette: RefToFillGroup;
  showGridLines: boolean; // FR-8.7
  // Not in the component-tree's prop list. Same additive deviation, same reason, as Story 1.8's
  // fourth GridRenderer constructor parameter: the renderer holds no DOM/theme dependency, so the
  // caller substitutes the resolved tokens (Story 1.11 Dev Notes forced decision 4).
  colors: GridRendererColors;
  className?: string; // so the caller keeps owning the dish's box styling
}

export type PetriDishCanvasProps = PetriDishCanvasSharedProps &
  (
    | { variant: 'static'; grid: RenderableGrid }
    | {
        variant: 'edit';
        grid: RenderableGrid;
        // component-tree-battle-page.md#3.10's own shape for the edit member. `tool` is accepted
        // and deliberately NOT read here — AC6 (Story 2.7) keeps this canvas tool-agnostic on
        // purpose: it paints `stroke.ref`, whatever number that is, with no `tool.kind` branch
        // anywhere in this file, eraser included. The pre-resolved `toolRef` below is what it
        // actually paints with (forced decision 2); `tool` stays declared for §3.10's shape and
        // for a future variant that genuinely needs the organism id, not this one.
        tool: Tool;
        // The ONE additive prop beyond §3.10 — same deviation, same justification, as `colors`
        // (Story 1.11) and `size`: a `Tool` carries an organism ID and the grid buffer stores a
        // numeric OrganismRef, and the roster that translates between them belongs to
        // <BattleEditorView> / <BattlePage> (Decision H.2), not to a rendering surface. `null`
        // means "this tool resolves to no organism in this battle's roster" — the click is then a
        // no-op. `0` means "erase" (Story 2.7 AC4, RFC-006 Decision 2's reserved empty ref) and is
        // written like any other ref — `=== null`, never falsy, is the only correct check on it.
        toolRef: number | null;
        onStrokeCommit(next: RenderableGrid): void;
      }
  );
// 'playback' (3.11) joins this union next.

// Exhaustiveness guard for `variant`. Its job is to stop COMPILING the moment 3.11's 'playback'
// joins the union without a matching dispatch arm below — without it, a widened union
// type-checks unchanged and the new variant silently renders as whichever arm happens to be last,
// no error, no test failure.
function assertUnhandledVariant(variant: never): never {
  throw new Error(`Unhandled PetriDishCanvas variant: ${String(variant)}`);
}

type StaticDishProps = PetriDishCanvasSharedProps & { grid: RenderableGrid };

/**
 * The Gallery tile lifecycle (Story 1.11), unchanged in substance by this story except for the
 * observed-resize target: both variants now observe `canvas.parentElement ?? canvas` (Story 2.4
 * Task 4), each with its own rationale comment at its `observe()` call site.
 */
function StaticDish({ grid, size, palette, showGridLines, colors, className }: StaticDishProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Routes a repaint failure into React's own error channel — see the debounced call site below.
  const [, setPaintError] = useState<null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    // Constructed, used once, and dropped on every (re)paint — never held in a ref (Story 1.11
    // Dev Notes forced decision 2). Two consequences at NFR-7.2's ~50 tiles: the offscreen
    // grid-line overlay each renderer allocates becomes garbage immediately instead of doubling
    // the Gallery's canvas memory, and the renderer's `lastGrid` borrow is never held. The trade is
    // that resize()/setGridLines() can't be used to repaint, so a resize below rebuilds a fresh
    // renderer from this same `grid` prop instead.
    function paint(target: HTMLCanvasElement): void {
      try {
        const renderer = new GridRenderer(target, size, palette, { colors, showGridLines });
        // ❌ Never drawFull: renderStatic is the terminal one-shot for a surface nothing drives
        // again (gridRenderer.ts:288-306). Calling drawFull would pass every test here and
        // silently opt this one-shot surface into the driven-renderer state machine Story 2.3
        // builds for the retained edit/playback surfaces.
        renderer.renderStatic(grid);
      } catch (error) {
        // getContext('2d') returns null under jsdom always, and can return null in a real browser
        // once a tab is over its canvas-memory budget — a live possibility at 50 tiles, not a
        // theoretical one. A throw out of an effect unmounts the whole Gallery tree; leave the
        // dish blank and carry on instead.
        if (!(error instanceof GridRendererContextError)) throw error;
      }
    }

    // Order matters: the effect runs after layout, so canvas.clientWidth/clientHeight are real
    // and applyDevicePixelSizing sizes the backing store correctly. Do not paint during render or
    // in a layout-effect that precedes the first layout pass.
    paint(canvas);

    if (typeof ResizeObserver === 'undefined') return; // absent in jsdom; initial paint above
    // must not depend on it.

    // Task 4 (Story 2.4): observe the PARENT, not the canvas. paint() writes canvas.width/height
    // (the canvas's own intrinsic dimensions) while the observer used to watch that same element
    // — any caller that does not size the element in CSS got intrinsic change -> content-box
    // change -> observer -> repaint -> forever (deferred-work.md:113). The parent's box is never
    // written by paint(), so the loop is broken by construction. BattleTile's PetriDish div is
    // already a correctly-sized parent (aspect-ratio: 5/3), so the Gallery's behaviour here is
    // unchanged — only what gets observed changes.
    const target = canvas.parentElement ?? canvas;

    let timer: ReturnType<typeof setTimeout> | undefined;
    // The box the current backing store was rasterised for — now the PARENT's box, since that is
    // what the observer reports. ResizeObserver fires an initial callback the moment observe() is
    // called, and fires again for any layout reassignment that leaves the box identical —
    // repainting on either is pure waste: it reconstructs the renderer and allocates a fresh
    // full-size grid-line overlay for a canvas already sized correctly, ~50 times over on the
    // Gallery's first commit (the NFR-1.3/7.2 budget AC4 protects).
    let lastWidth = target.clientWidth;
    let lastHeight = target.clientHeight;

    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;

      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          paint(canvas);
        } catch (error) {
          // paint() rethrows anything that is not a missing-2D-context. From the effect body
          // that lands in React's error channel; from a macrotask it would be an uncaught
          // window error instead — no boundary, no unmount, just a tile frozen on a stale
          // bitmap. Hand it back to React so BOTH call sites fail identically.
          setPaintError(() => {
            throw error;
          });
        }
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(target);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
    };
  }, [grid, size, palette, showGridLines, colors]);

  // aria-hidden, deliberately (Story 1.11 Dev Notes forced decision 5): everything the snapshot
  // conveys is already exposed as text in the same tile — the name (<h2>), the grid size, the
  // date, and every organism name on its own focusable marker (Story 1.10). FR-7.2 itself calls
  // the tile "a quick visual reference, not a disambiguated view".
  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}

type EditDishProps = PetriDishCanvasSharedProps & {
  grid: RenderableGrid;
  toolRef: number | null;
  onStrokeCommit(next: RenderableGrid): void;
};

/**
 * Geometry an in-progress stroke reads on every `pointermove` — resolved ONCE at pointer-down
 * (Task 4, AC2) rather than per move. `getBoundingClientRect()` forces a style/layout flush, and
 * a `pointermove` can arrive at the display's full refresh rate; doing either per move puts a
 * forced reflow on the hot path this story exists to keep cheap.
 *
 * Staleness this buys, named rather than left implicit (Task 4): the cached box is wrong if the
 * canvas is re-laid-out MID-STROKE (the resize effect's `renderer.resize(size)`). Forced decision
 * 3: the resize path ENDS the stroke (committing whatever was painted) rather than recomputing
 * this geometry — simpler, and a resize mid-drag is vanishingly rare.
 */
interface StrokeGeometry {
  readonly rect: { left: number; top: number; width: number; height: number };
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly layout: GridLayout;
}

/**
 * The in-progress stroke — ONE ref, never React state (AC2, project-context "hot simulation
 * state lives in refs"). Everything the gesture needs across its `pointermove` calls lives here:
 * the pointer that owns it (AC7), the working grid it paints into (Task 3), the interpolation
 * anchor (Task 6), whether anything actually changed (AC6), and the geometry cached at stroke
 * start (Task 4).
 */
interface Stroke {
  readonly pointerId: number;
  readonly geometry: StrokeGeometry;
  /** The resolved `OrganismRef` this stroke paints, fixed for the whole gesture at pointer-down.
   *  Story 2.7's toggle IS keyboard-operable mid-drag, which falsifies the earlier justification
   *  ("no roster UI to change the tool mid-drag") — the pin is kept anyway, on the reasoning that
   *  survives it: a gesture is ONE undo entry (RFC-005 Decision 6), and an entry that is half
   *  paint and half erase has no coherent meaning, so the tool a stroke started with is the tool
   *  it finishes with (Story 2.7 forced decision 4). Re-reading `toolRef` per move is not simply
   *  "more responsive" — it changes what one undo entry contains. Pinning here also keeps
   *  `toolRef`'s `number | null` type out of every per-move call. */
  readonly ref: number;
  /** Mutated in place for the life of the stroke; a NEW object every pointer-down (Task 3). */
  readonly workingGrid: RenderableGrid;
  /** The last painted cell — the interpolation anchor. `null` when the pointer is currently over
   *  no cell (Task 6: re-entry paints just the new cell, never a bridge across the outside gap). */
  anchor: CellCoord | null;
  /** True once at least one cell's occupant actually changed — AC6's "no-op stroke commits
   *  nothing", generalised from Story 2.5's single-cell redundant-click guard. */
  changed: boolean;
}

/**
 * The editor's retained-renderer lifecycle (Story 2.4, AC6). Unlike `StaticDish`, this surface
 * holds ONE `GridRenderer` for the life of the mount and repaints through it — never reconstructs
 * per paint. The two lifecycles cannot share one effect: the static path's contract is "construct,
 * use once, drop" and the edit path's is "construct once, retain, repaint" — one effect with
 * `if (variant === …)` branches would make its deps array mean two different things.
 *
 * A `variant` never changes for a given mount (a mount is either a Gallery tile or an editor), so
 * the component "remounting" from `static` to `edit` mid-life is unreachable — §3.11's future
 * fullscreen is a re-layout, never a remount.
 */
function EditDish({
  grid,
  size,
  palette,
  showGridLines,
  colors,
  className,
  toolRef,
  onStrokeCommit,
}: EditDishProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Hot, non-serialisable instance state — a ref, never React state (project-context "hot
  // simulation state lives in refs").
  const rendererRef = useRef<GridRenderer | null>(null);
  // The grid `rendererRef.current` was last full-painted with — a ref, and NOT React state, for
  // the same reason the renderer itself is one. Its whole job is to keep the mount at exactly ONE
  // full paint: the construction effect paints, then the grid effect below reads this and skips
  // the grid it has already seen painted (review 2026-08-26 — see both effects).
  const paintedGridRef = useRef<RenderableGrid | null>(null);
  // The in-progress drag stroke (Task 2) — a ref, never React state, which is the whole point of
  // AC2: zero React state updates between pointer-down and pointer-up.
  const strokeRef = useRef<Stroke | null>(null);
  // Routes a resize()-time repaint failure into React's own error channel, mirroring StaticDish.
  const [, setPaintError] = useState<null>(null);

  // Construction effect — declared FIRST so a renderer is already stored before the grid / grid-
  // lines effects below run on mount. Deps are the three GridRenderer constructor arguments that
  // have no setter: `size` (Story 2.14 owns dimension changes; until then there is no resize()
  // caller for it — see the comment on the resize effect), `palette`, and `colors`.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    try {
      const renderer = new GridRenderer(canvas, size, palette, { colors, showGridLines });
      rendererRef.current = renderer;
      // Painted HERE, in the commit that built the renderer. A construction effect that only
      // SIGNALS (the `rendererGeneration` counter this replaced, review 2026-08-26) cannot paint
      // in this commit at all: React flushes every passive effect of a commit before applying a
      // state update one of them queued, so the grid effect below ran once for the pre-signal
      // value and again for the bump — two full repaints of the same grid through the same
      // renderer on every editor mount, each re-priming the whole colour-state baseline (~6,000
      // cells at 100x60). Guarding that first run instead only trades the wasted paint for a
      // blank canvas until a second commit lands.
      renderer.drawFull(grid);
      paintedGridRef.current = grid;
    } catch (error) {
      // getContext('2d') returns null under jsdom always, and can return null in a real browser
      // past the canvas-memory budget. Leave the dish blank rather than throwing out of the
      // effect, which would unmount the whole editor.
      if (!(error instanceof GridRendererContextError)) throw error;
      rendererRef.current = null;
      paintedGridRef.current = null;
    }

    return () => {
      rendererRef.current = null;
      paintedGridRef.current = null;
      // Hygiene, not a commit path: an unmount mid-stroke drops the in-progress edit rather than
      // firing onStrokeCommit into a component that is going away. No AC in this story covers an
      // unmount-mid-drag; this only stops a stale ref outliving the mount.
      strokeRef.current = null;
    };
    // `grid` and `showGridLines` are read above but deliberately absent from deps. Neither is a
    // GridRenderer constructor argument without a setter, and listing either would reconstruct
    // the renderer for a change `drawFull`/`setGridLines` already serve — which is the retention
    // AC6 exists to protect. React rebuilds this closure on every render, so the `grid` it paints
    // when the deps DO change is always the current one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, palette, colors]);

  // Grid effect — the paint path for a `grid` that changes AFTER mount. Since Story 2.5 the
  // editor's OWN edits do not come through here: `handlePointerDown` paints them incrementally
  // (`markDirty` + `draw`) and records the result in `paintedGridRef`, so the committed grid's
  // round trip through <BattlePage>'s state lands on the skip below. What is left for this effect
  // is a grid that changes for a reason the canvas did not cause — Story 2.8's undo, 2.14's
  // resize, 2.15's Clear — each of which genuinely wants the full repaint.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return; // construction failed (missing 2D context) — leave it blank.
    if (paintedGridRef.current === grid) return;
    renderer.drawFull(grid);
    paintedGridRef.current = grid;
  }, [grid]);

  // Grid-lines effect. `setGridLines` is a no-op when the value is unchanged (gridRenderer.ts:587)
  // so this is safe to run on every mount, including the one right after construction.
  useEffect(() => {
    rendererRef.current?.setGridLines(showGridLines);
  }, [showGridLines]);

  // Task 3/4: immediate container re-fit, no debounce. AC3 says "immediately", and the static
  // path's 150ms trailing debounce exists for a reason that does not hold here: ~50 Gallery tiles
  // each allocating a full-size overlay per frame during a drag (deferred-work.md, 1.11) vs. ONE
  // editor canvas making ONE allocation. A debounced editor would visibly lag the window edge —
  // this is the single most likely thing a later reader "fixes" back in, so it is called out here
  // rather than left to be rediscovered.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    if (typeof ResizeObserver === 'undefined') return; // absent in jsdom.

    // Same parent-observation fix as StaticDish (Task 4) — paint() here is drawFull/resize()
    // writing canvas.width/height, and observing the canvas itself would be the identical
    // feedback loop.
    const target = canvas.parentElement ?? canvas;
    let lastWidth = target.clientWidth;
    let lastHeight = target.clientHeight;

    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;

      // Task 4 forced decision: a mid-stroke re-layout ENDS the stroke rather than recomputing
      // the cached geometry (StrokeGeometry's doc comment). Ending it here — before resize() —
      // commits whatever was painted so far through the SAME `renderer.draw` calls the stroke
      // already made, so `renderer`'s own `lastGrid` is already the working grid resize() is
      // about to repaint: no flicker, no stale rect surviving into the next move.
      //
      // review (2026-08-27): this runs BEFORE the renderer guard below, not after. The stroke's
      // cached `rect` goes stale on a re-layout whether or not a renderer exists — trap 12's
      // no-context path still writes cells into the working grid and still commits — so gating
      // the terminate on `renderer !== null` would leave exactly that path mapping every
      // remaining move through the pre-resize box and committing the wrong cells.
      if (strokeRef.current !== null) endStroke(true);

      const renderer = rendererRef.current;
      if (renderer === null) return;
      try {
        // `resize()` — NOT reconstruction. Reconstructing here throws away the dirty baseline
        // 2.5 depends on, and this retained instance is one of exactly two surfaces where
        // `applyDevicePixelSizing`'s anti-double-scaling guard actually works (gridRenderer.ts).
        // `size` is passed UNCHANGED: resize() recomputes the backing store from the current CSS
        // box, rebuilds the layout, reuses the grid-line overlay when unchanged, and
        // full-repaints `lastGrid` — exactly "re-fits with a full repaint".
        renderer.resize(size);
      } catch (error) {
        // Thrown from a macrotask (the observer callback), rethrowing would land as an uncaught
        // window error with no boundary. Route it back into React the same way StaticDish does.
        setPaintError(() => {
          throw error;
        });
      }
    });
    observer.observe(target);

    return () => observer.disconnect();
    // `endStroke` is a plain function value rebuilt every render, not a dependency with its own
    // identity worth tracking — same reasoning as the construction effect's `grid`/`showGridLines`
    // omission above. Listing it would re-register the ResizeObserver on every render instead of
    // only when `size` actually changes, which is the retention this effect exists to protect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  /**
   * Paints `cells` into the ACTIVE stroke's working buffer (Task 3). Writes every cell in the
   * segment — including ones already correct, cheaply — rather than pre-filtering the list: the
   * filtering already happens once, correctly, inside `renderer.draw`'s colour-state diff
   * (`selectDirtyCells`), and a second dedupe layer here would just be redundant work
   * (dirtyCells.ts / gridRenderer.ts `draw` doc comments — "do not add a second dedupe layer").
   *
   * Writes to `stroke.workingGrid.occupant` unconditionally on a real change even when no
   * renderer exists (trap 12: `getContext('2d')` is `null` under jsdom, always) — the model is
   * not the view, so the stroke's buffer and its `changed` flag stay correct regardless of
   * whether anything got painted on screen.
   */
  function paintStrokeCells(stroke: Stroke, cells: readonly CellCoord[]): void {
    if (cells.length === 0) return;
    const { workingGrid, ref } = stroke;
    let anyChanged = false;
    for (const cell of cells) {
      const index = cell.row * workingGrid.width + cell.col;
      if (workingGrid.occupant[index] !== ref) {
        workingGrid.occupant[index] = ref;
        anyChanged = true;
      }
    }
    // AC6's "no-op stroke commits nothing", generalised: a segment that changed nothing gets no
    // markDirty/draw call at all — mirroring Story 2.5's single-cell redundant-click guard, which
    // the existing AC7 test asserts by spying on both. A cell the pointer re-crosses inside a
    // segment that DID change something elsewhere still costs nothing extra: `draw`'s own
    // colour-state diff filters it out.
    if (!anyChanged) return;
    stroke.changed = true;
    const renderer = rendererRef.current;
    if (renderer !== null) {
      // AC2: the dirty path, never `drawFull`. Repaints only the cells this segment touched.
      renderer.markDirty(cells);
      renderer.draw(workingGrid);
    }
  }

  /**
   * The one shared terminate path (Task 2) for pointer-up, pointer-cancel, lost-capture, and a
   * mid-stroke re-layout (the resize effect above) — so "end the active stroke" exists exactly
   * once. IDEMPOTENT by construction: `strokeRef.current` is cleared FIRST, so a second call for
   * the same gesture (pointer-up AND lostpointercapture both fire in real browsers — AC5) finds
   * no stroke and does nothing.
   *
   * `commit` names the decision at the CALL SITE, not a runtime branch here that ever chooses
   * false today: every terminate reason in this story — up, cancel, lost capture, a mid-stroke
   * resize — commits (forced decision 2: "the user did draw those cells; discarding leaves the
   * dish showing paint no state holds"). The parameter stays because "does this termination
   * commit" is a real per-site decision this story was forced to make, not a foregone one — a
   * future terminate reason (an Escape-to-cancel, say) is exactly the kind of call site that would
   * pass `false`.
   */
  function endStroke(commit: boolean): void {
    const stroke = strokeRef.current;
    if (stroke === null) return;
    strokeRef.current = null;

    // Guarded — jsdom 30 has `PointerEvent` but not `releasePointerCapture` (trap 1). Capture is
    // released even on a commit=false path (none exists today, but the release must not depend on
    // a decision orthogonal to it).
    canvasRef.current?.releasePointerCapture?.(stroke.pointerId);

    if (!commit || !stroke.changed) return; // AC6: a no-op stroke commits nothing.

    // ⚠️ Trap 3, and the single most likely defect in this file: the committed grid comes straight
    // back down as a NEW `grid` prop identity and the grid effect full-repaints anything it has
    // not already seen — 6,000 cells plus a colour-state re-prime after every stroke, with every
    // test green and the dish still looking perfect.
    //
    // review (2026-08-27): guarded on the renderer again, restoring the split Story 2.5 recorded
    // and this story dropped. `paintedGridRef`'s contract is "this grid is already ON SCREEN";
    // when construction failed for want of a 2D context (trap 12 — always, under jsdom) nothing
    // was painted, so claiming it would suppress the full repaint the construction effect owes
    // that grid if a context ever does become available. The commit itself fires either way —
    // the model is not the view.
    if (rendererRef.current !== null) paintedGridRef.current = stroke.workingGrid;
    onStrokeCommit(stroke.workingGrid);
  }

  /**
   * Stroke start (Story 2.5 -> 2.6, FR-3.4/FR-3.5). Paints the first cell on pointer-DOWN, same
   * as Story 2.5 (AC2's < 100 ms feedback budget — a click event does not fire until pointer-up),
   * and opens the stroke that subsequent moves extend. A press-release with no movement is the
   * degenerate one-cell stroke (AC6); pointer-up still fires and still commits exactly once.
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    // A right-click, a middle-click, or a secondary touch point must never paint. `button === 0`
    // is the primary button on a pointerdown (it is 0 for touch and pen contact too, so this is
    // not a mouse-only check).
    if (event.button !== 0 || !event.isPrimary) return;
    // No organism to place: the tool resolves to nothing in this battle's roster. Painting ref 0
    // instead would ERASE the cell (that is Story 2.7's eraser), which is not what a failed
    // lookup means.
    if (toolRef === null) return;
    // AC7: a second pointer going down while a stroke is already active must not hijack or start
    // a second stroke. Checked BEFORE any geometry work, same reason as the move handler's guard.
    //
    // Story 2.7 Task 5 (deferred-work.md, taken): a pointerdown carrying the OPEN stroke's OWN
    // pointerId means its terminating event was never delivered — a tab backgrounded mid-touch,
    // or an OS gesture swallowing the up/cancel — and the `buttons === 0` self-heal on
    // `pointermove` cannot rescue it, because touch and pen emit no hover moves at all (trap 8).
    // Left as an unconditional reject, this pointer could never paint again for the life of the
    // mount, with no error and no visual cue. Reclaim instead: end the stale stroke (committing
    // whatever it already painted, same as any other termination) and fall through to open a
    // fresh one. A genuinely DIFFERENT pointer is still rejected outright — AC7 stays intact.
    if (strokeRef.current !== null) {
      if (strokeRef.current.pointerId !== event.pointerId) return;
      endStroke(true);
    }

    const canvas = canvasRef.current;
    if (canvas === null) return;

    // review (2026-08-26, carried into this story): fail closed at STROKE START, the same guard
    // Story 2.5 applied per click. The working grid's dimensions are then fixed for the whole
    // gesture (Task 3) — trap 12's no-renderer path builds no renderer and calls no
    // `assertGridMatchesSize`, so this is the only guard against an out-of-bounds write reaching
    // `grid.occupant` that way.
    if (grid.width !== size.cols || grid.height !== size.rows) return;

    // Task 4: geometry resolved ONCE here and cached on the stroke — never recomputed per move.
    // Forced decision 1(b) is unchanged from Story 2.5: `computeGridLayout` is pure and re-derives
    // exactly what the renderer derived from the same three inputs, so this still does not need a
    // `GridRenderer.layout` accessor (the frozen contract, component-tree-battle-page.md#5).
    const rect = canvas.getBoundingClientRect();
    const geometry: StrokeGeometry = {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      layout: computeGridLayout(canvas, size, showGridLines),
    };

    const cell = pointerToCell({
      rect: geometry.rect,
      canvasWidth: geometry.canvasWidth,
      canvasHeight: geometry.canvasHeight,
      layout: geometry.layout,
      size,
      clientX: event.clientX,
      clientY: event.clientY,
    });

    // Task 3: ONE working-grid allocation per stroke, sliced off the CURRENT prop grid — never a
    // fresh copy per move (the allocation churn NFR-4.2 will not survive). `age` is carried by
    // reference, unchanged from Story 2.5: every edit-mode grid is age-zero everywhere and
    // nothing in Epic 2 writes age.
    const workingGrid: RenderableGrid = {
      width: grid.width,
      height: grid.height,
      occupant: grid.occupant.slice(),
      age: grid.age,
    };

    const stroke: Stroke = {
      pointerId: event.pointerId,
      geometry,
      ref: toolRef,
      workingGrid,
      anchor: null,
      changed: false,
    };
    strokeRef.current = stroke;

    // Task 5: the native mechanism that keeps every subsequent pointermove/pointerup targeting
    // this canvas once the pointer leaves it (AC5), so React's own onPointerMove/onPointerUp props
    // keep firing unchanged. Guarded — jsdom 30 has no `setPointerCapture` (trap 1); an unguarded
    // call throws TypeError from inside this handler and takes every edit-variant test with it.
    canvas.setPointerCapture?.(event.pointerId);

    // The centring margin, the far-edge boundary, and a degenerate box all land here as `null` —
    // a normal outcome (the user pressed on no cell), not an error. The stroke stays open with no
    // anchor; a move back onto the dish paints just the re-entry cell (Task 6), never a bridge
    // across the outside gap.
    if (cell === null) return;

    paintStrokeCells(stroke, [cell]);
    stroke.anchor = cell;
  }

  /**
   * The drag itself (AC1, AC4). Fires on every hover move for the life of the mount, not just
   * during a stroke (trap 6) — the no-stroke early return below does NO work at all: no
   * `getBoundingClientRect()`, no `computeGridLayout`, no allocation.
   */
  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const stroke = strokeRef.current;
    // Cheapest checks first, before any geometry work: no active stroke, or a DIFFERENT pointer
    // (AC7 — a second finger's moves must not paint through the primary stroke).
    if (stroke === null || event.pointerId !== stroke.pointerId) return;

    // Trap 5's self-heal: `event.button` is -1 on a move (no button "changed state" on this
    // event) and must NEVER gate painting — the `buttons` BITMASK is the move-time equivalent.
    // Forced decision 5: treat the primary button reading as released (capture lost silently
    // somewhere the canvas never heard about) as a terminate-and-commit, same as any other
    // termination.
    if ((event.buttons & 1) === 0) {
      endStroke(true);
      return;
    }

    const { geometry } = stroke;
    const cell = pointerToCell({
      rect: geometry.rect,
      canvasWidth: geometry.canvasWidth,
      canvasHeight: geometry.canvasHeight,
      layout: geometry.layout,
      size,
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (cell === null) {
      // AC5: the pointer left the dish. The stroke stays OPEN (leaving and re-entering is one
      // gesture) and the anchor is dropped so a later re-entry does not bridge a line across the
      // outside path — cells the pointer went AROUND, never through.
      stroke.anchor = null;
      return;
    }

    if (stroke.anchor === null) {
      // Stroke start, or a re-entry after the pointer left the dish: paint just this cell.
      paintStrokeCells(stroke, [cell]);
    } else {
      // AC4: interpolate the gap a fast drag's widely-spaced samples would otherwise leave.
      paintStrokeCells(stroke, cellsBetween(stroke.anchor, cell));
    }
    stroke.anchor = cell;
  }

  // handlePointerUp / handlePointerCancel / handleLostPointerCapture (AC3, AC5, AC7): the three
  // browser-native ways a gesture ends, all routed through the ONE shared `endStroke`. Each
  // ignores a pointerId that is not the active stroke's own — a second pointer's up/cancel must
  // not terminate the primary stroke it never started (AC7).
  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const stroke = strokeRef.current;
    if (stroke === null || event.pointerId !== stroke.pointerId) return;
    // review (2026-08-27): the SAME mirror of pointer-down's `button !== 0` guard, and the one
    // place a `pointermove`'s `buttons` bitmask is the wrong tool. A mouse reports every button
    // on ONE pointerId, so right-clicking during a left-drag fires a `pointerup` with
    // `button === 2` while the left button is still held — without this, that ends and commits
    // the stroke mid-gesture (AC7 says a non-primary button must not disturb it), the rest of the
    // drag paints nothing because `strokeRef` is now null, and under Story 2.8 one gesture splits
    // into two undo entries. `button` is 0 for touch contact and pen tip too, so this is not a
    // mouse-only check; `pointercancel` and `lostpointercapture` deliberately do NOT get it —
    // both carry `button === -1` and both are real terminations whatever button caused them.
    if (event.button !== 0) return;
    endStroke(true);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const stroke = strokeRef.current;
    if (stroke === null || event.pointerId !== stroke.pointerId) return;
    // Forced decision 2: commit the cells already painted rather than discard them — discarding
    // is only defensible alongside a `drawFull` repaint from the prop grid, which is exactly the
    // AC2-forbidden path this story exists to avoid.
    endStroke(true);
  }

  function handleLostPointerCapture(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const stroke = strokeRef.current;
    if (stroke === null || event.pointerId !== stroke.pointerId) return;
    endStroke(true);
  }

  // role="img" + aria-label, deliberately the INVERSE of the static tile's aria-hidden (Story
  // 1.11 Dev Notes forced decision 5, Story 2.4 Dev Notes trap 9): the tile's snapshot has a
  // textual equivalent already on screen; the editor's dish IS the page's subject, with no
  // textual equivalent until Story 2.12's stats. `role="img"` is a naming role, so `aria-label`
  // is permitted here — on a bare element it would be stripped and flagged by axe's
  // `aria-prohibited-attr`. No `tabIndex`: Story 2.5 adds POINTER placement only, and no AC in
  // Epic 2 asks for a keyboard path — inventing one here would be unreviewed UX. That leaves cell
  // editing pointer-only, a WCAG 2.1.1 gap axe cannot detect (there is no focusable control to
  // flag); it is recorded in deferred-work.md rather than left unstated.
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Petri dish, ${size.cols} by ${size.rows} cells`}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
    />
  );
}

export default function PetriDishCanvas(props: PetriDishCanvasProps) {
  const { variant } = props;
  switch (variant) {
    case 'static':
      return <StaticDish {...props} />;
    case 'edit':
      return <EditDish {...props} />;
    default:
      return assertUnhandledVariant(variant);
  }
}
