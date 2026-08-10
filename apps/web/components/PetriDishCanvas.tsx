'use client';

import { useEffect, useRef } from 'react';
import {
  GridRenderer,
  GridRendererContextError,
  type GridRendererColors,
} from '@/lib/gridRenderer';
import type { RefToFillGroup } from '@/lib/refToFillGroup';
import type { RenderableGrid } from '@/lib/renderableGrid';

// component-tree-battle-page.md#3.10 names this component and assigns three variants across three
// epics: static -> Epic 1 (this story), edit -> 2.4, playback -> 3.11. Built here with the
// `static` member only, as a single-member discriminated union, so those later stories EXTEND
// this file rather than replace a Gallery-local one-off (Story 1.11 Dev Notes forced decision 3).
export interface PetriDishCanvasProps {
  variant: 'static'; // union of one today; 'edit' (2.4) and 'playback' (3.11) join it
  grid: RenderableGrid;
  size: { cols: number; rows: number };
  palette: RefToFillGroup;
  showGridLines: boolean; // FR-8.7
  // Not in the component-tree's prop list. Same additive deviation, same reason, as Story 1.8's
  // fourth GridRenderer constructor parameter: the renderer holds no DOM/theme dependency, so the
  // caller substitutes the resolved tokens (Story 1.11 Dev Notes forced decision 4).
  colors: GridRendererColors;
  className?: string; // so the caller keeps owning the dish's box styling
}

const RESIZE_DEBOUNCE_MS = 150;

export default function PetriDishCanvas({
  grid,
  size,
  palette,
  showGridLines,
  colors,
  className,
}: PetriDishCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    // Constructed, used once, and dropped on every (re)paint — never held in a ref (Dev Notes
    // forced decision 2). Two consequences at NFR-7.2's ~50 tiles: the offscreen grid-line overlay
    // each renderer allocates becomes garbage immediately instead of doubling the Gallery's canvas
    // memory, and the renderer's `lastGrid` borrow (deferred-work.md: ~50 pinned typed-array
    // pairs) is never held. The trade is that resize()/setGridLines() can't be used to repaint, so
    // a resize below rebuilds a fresh renderer from this same `grid` prop instead.
    // Takes the canvas explicitly rather than closing over the outer `canvas` const: this runs
    // from both the initial synchronous call below and the debounced ResizeObserver callback,
    // and threading it as a parameter keeps both call sites provably non-null without a `!`.
    function paint(target: HTMLCanvasElement): void {
      try {
        const renderer = new GridRenderer(target, size, palette, { colors, showGridLines });
        // ❌ Never drawFull: renderStatic is the terminal one-shot for a surface nothing drives
        // again (gridRenderer.ts:288-306 names this story explicitly). Calling drawFull would
        // pass every test here and silently opt this one-shot surface into the driven-renderer
        // state machine Story 2.3 builds.
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

    // The tile track is minmax(320px, 1fr) in an auto-fill grid, so a window resize changes every
    // tile's width and the backing store goes stale (the browser then scales a bitmap rasterised
    // for a different box). ResizeObserver already coalesces to one callback per frame, which is
    // not enough here: an unthrottled repaint allocates a fresh full-size overlay canvas PER FRAME
    // per visible tile during a drag — the exact allocation profile deferred-work.md's
    // rebuildGridLineOverlay entry warns about. Trailing-debounce it.
    if (typeof ResizeObserver === 'undefined') return; // absent in jsdom; initial paint above
    // must not depend on it.

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => paint(canvas), RESIZE_DEBOUNCE_MS);
    });
    observer.observe(canvas);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
    };
  }, [grid, size, palette, showGridLines, colors]);

  // aria-hidden, deliberately (Dev Notes forced decision 5): everything the snapshot conveys is
  // already exposed as text in the same tile — the name (<h2>), the grid size, the date, and every
  // organism name on its own focusable marker (Story 1.10). FR-7.2 itself calls the tile "a quick
  // visual reference, not a disambiguated view".
  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
