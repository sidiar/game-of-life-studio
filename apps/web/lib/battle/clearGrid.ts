import type { RenderableGrid } from '@/lib/canvas/renderableGrid';

/**
 * AR-17's Clear primitive (FR-3.7), and the empty-grid half of Story 2.15's Task 2.
 *
 * Lives beside `resizeGrid.ts`, in `apps/web` rather than `packages/simulation`, for the exact
 * reason that module's own comment already gives: `packages/simulation` does not exist yet, and
 * `RenderableGrid` is declared here because `apps/web` depends on `@gol/*` and never the reverse.
 *
 * ⚠️ **Story 3.3 is the eventual owner** — the same real typed-array `Grid` `resizeGrid.ts` names
 * is where this belongs once it exists; this module widens that destination deliberately rather
 * than by accident, per forced decision 2's own note.
 *
 * Pure: no React, no DOM, no repository, no module state.
 */

/**
 * A fresh, all-empty `RenderableGrid` at `grid`'s CURRENT dimensions (trap 1 — never a constant,
 * never a caller-supplied size: Clear does not resize).
 *
 * ⚠️ Returns NEW buffers and a NEW wrapper, always — never `grid.occupant.fill(0)` in place.
 * `readonly Uint8Array` is readonly on the property, not the contents, and an in-place clear
 * freezes `<BattleEditorView>`'s `stats` memo (keyed on `grid` identity) and defeats the canvas
 * grid effect's `paintedGridRef.current === grid` skip — the dish would show cleared cells while
 * the stats row and the next undo snapshot still held the old ones, with nothing logged
 * (deferred-work.md:369, the obligation this module discharges for Clear).
 *
 * `age` is reallocated zero-filled at `width * height`, never carried over — the same rule
 * `resizeGrid`'s own comment and `restore()` (`useUndoableGrid.ts`) already apply: every editable
 * grid is age-zero everywhere (RFC-005 "Representation note").
 */
export function clearGrid(grid: RenderableGrid): RenderableGrid {
  const { width, height } = grid;
  return {
    width,
    height,
    occupant: new Uint8Array(width * height),
    age: new Uint16Array(width * height),
  };
}
