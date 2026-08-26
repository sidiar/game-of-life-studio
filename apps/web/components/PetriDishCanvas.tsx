'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GridRenderer,
  GridRendererContextError,
  type GridRendererColors,
} from '@/lib/canvas/gridRenderer';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';

const RESIZE_DEBOUNCE_MS = 150;

// component-tree-battle-page.md#3.10 names this component and assigns three variants across three
// epics: static -> Epic 1 (Story 1.11), edit -> Epic 2 (this story), playback -> 3.11. Shared props
// stay common across the union; the variant tag decides the lifecycle. `tool` + `onStrokeCommit`
// join the EDIT member in 2.5/2.6 — not declared yet, so this story's `edit` member is identical
// in shape to `static`'s.
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
  ({ variant: 'static'; grid: RenderableGrid } | { variant: 'edit'; grid: RenderableGrid });
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

type EditDishProps = PetriDishCanvasSharedProps & { grid: RenderableGrid };

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
function EditDish({ grid, size, palette, showGridLines, colors, className }: EditDishProps) {
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

  // Grid effect — the paint path for a `grid` that changes AFTER mount. Nothing in this story
  // changes `grid`; this is the seam Stories 2.5/2.6 replace with `markDirty` + `draw`. It skips
  // the grid the construction effect above already painted, which is what keeps a mount (and a
  // palette/colours rebuild, where `grid` is unchanged and this effect does not re-run at all) at
  // exactly one full paint.
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

  // role="img" + aria-label, deliberately the INVERSE of the static tile's aria-hidden (Story
  // 1.11 Dev Notes forced decision 5, Story 2.4 Dev Notes trap 9): the tile's snapshot has a
  // textual equivalent already on screen; the editor's dish IS the page's subject, with no
  // textual equivalent until Story 2.12's stats. `role="img"` is a naming role, so `aria-label`
  // is permitted here — on a bare element it would be stripped and flagged by axe's
  // `aria-prohibited-attr`. No `tabIndex`: keyboard editing is out of scope for this story, and a
  // focusable dish would promise interaction it does not deliver.
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Petri dish, ${size.cols} by ${size.rows} cells`}
      className={className}
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
