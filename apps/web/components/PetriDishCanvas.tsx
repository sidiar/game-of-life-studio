'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  GridRenderer,
  GridRendererContextError,
  type GridRendererColors,
} from '@/lib/canvas/gridRenderer';
import { computeGridLayout } from '@/lib/canvas/gridLayout';
import { pointerToCell } from '@/lib/canvas/pointerToCell';
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
        // and deliberately NOT read here yet: this story's only arm is `{ kind: 'organism' }` and
        // the ref it resolves to arrives pre-resolved as `toolRef` (forced decision 2), so
        // branching on `tool.kind` would be a branch with one reachable case. Story 2.7's eraser
        // is what makes it load-bearing — declaring it now keeps the seam at §3.10's shape so 2.7
        // widens a union rather than adding a prop.
        tool: Tool;
        // The ONE additive prop beyond §3.10 — same deviation, same justification, as `colors`
        // (Story 1.11) and `size`: a `Tool` carries an organism ID and the grid buffer stores a
        // numeric OrganismRef, and the roster that translates between them belongs to
        // <BattleEditorView> / <BattlePage> (Decision H.2), not to a rendering surface. `null`
        // means "this tool resolves to no organism in this battle's roster" — the click is then a
        // no-op, never a write of ref 0 (which means EMPTY, and is Story 2.7's eraser).
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
  }, [size]);

  /**
   * Click placement (Story 2.5, FR-3.4). ONE commit per click, carrying a NEW grid value.
   *
   * `onPointerDown`, not `onClick` (RFC-002 Risk 5: "use pointer events API for unified
   * handling"): painting on press is what keeps the visible feedback inside NFR-4.2's 100 ms —
   * a click event does not fire until pointer-up — and it is what makes Story 2.6's drag an
   * extension of this path rather than a rewrite of it. ❌ No `setPointerCapture` here: a single
   * press needs none, and adding it pre-empts 2.6's "pointer-up outside the canvas" AC.
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

    const canvas = canvasRef.current;
    if (canvas === null) return;

    // Forced decision 1(b): the layout is RECOMPUTED here rather than read off the renderer.
    // `GridRenderer.layout` is private and adding an accessor would change the frozen contract
    // (component-tree-battle-page.md#5), which no story since Epic 1 has done. `computeGridLayout`
    // is pure and reads `canvas.width`/`height` live, so given the same three inputs it re-derives
    // exactly what the renderer derived — including after a `resize()`. The one input that can
    // legitimately differ is `showGridLines`, and that changes only `gridLinesVisible`, never
    // `cellSize`/`originX`/`originY` (gridLayout.ts) — so the mapping stays correct either way.
    // Do not "fix" this into a renderer accessor.
    const layout = computeGridLayout(canvas, size, showGridLines);
    const cell = pointerToCell({
      rect: canvas.getBoundingClientRect(),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      layout,
      size,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    // The centring margin, the far-edge boundary, and a degenerate box all land here. `null` is a
    // normal outcome — the user pointed at no cell — and it is also what keeps `markDirty`'s
    // `DirtyCellRangeError` (dirtyCells.ts) unreachable from inside this handler.
    if (cell === null) return;

    const index = cell.row * grid.width + cell.col;
    // AC7: the cell already holds this organism. No copy, no mark, no draw, no commit — a
    // redundant click must not create a Story 2.8 undo entry or flip Story 2.11's isDirty.
    if (grid.occupant[index] === toolRef) return;

    const occupant = grid.occupant.slice();
    occupant[index] = toolRef;
    const nextGrid: RenderableGrid = {
      width: grid.width,
      height: grid.height,
      occupant,
      // Carried by REFERENCE, on purpose. Every edit-mode grid is age-zero everywhere (RFC-005's
      // "Representation note"; `toRenderableGrid` allocates a zero-filled buffer) and nothing in
      // Epic 2 writes age, so copying 12 KB per click at 100x60 would buy nothing. The instinct
      // is to `slice()` both — don't, until something actually mutates age.
      age: grid.age,
    };

    const renderer = rendererRef.current;
    if (renderer !== null) {
      // AC2: the dirty path, never `drawFull`. One click repaints one cell.
      renderer.markDirty([cell]);
      renderer.draw(nextGrid);
      // ⚠️ THE trap this story is most likely to fall into. `onStrokeCommit` sends `nextGrid`
      // up to <BattlePage>, which puts it in state and hands it straight back down as a NEW
      // `grid` prop identity — and the grid effect above repaints whatever it has not already
      // seen. Without this line that round trip full-repaints all 6,000 cells and re-primes the
      // whole colour-state baseline on every single click, while every test still passes and the
      // dish still looks perfect.
      paintedGridRef.current = nextGrid;
    }
    // The commit fires even when the renderer is absent (a missing 2D context — always, under
    // jsdom). The model is not the view: a canvas that cannot paint must not silently swallow the
    // user's edit. `paintedGridRef` is deliberately NOT set in that case — there is nothing
    // painted for it to describe, and the construction effect will paint the current grid if a
    // context ever becomes available.
    onStrokeCommit(nextGrid);
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
