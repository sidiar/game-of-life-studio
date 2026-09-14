/**
 * The step-renderer adapter (Story 3.9 Task 3, AC3) — closes Story 3.8's Trap 1 for Story 3.10.
 *
 * A raw `GridRenderer` type-checks as a `StepRenderer` (it has a `draw(grid)` method) and paints
 * NOTHING after a step: `draw` is the marks-only Edit path (Story 2.3), and Story 3.8's loop marks
 * no cells by design — a dish that never visibly moves, with nothing thrown
 * (`packages/simulation/src/loop/simulationLoop.ts`, `StepRenderer`'s doc comment, "Trap 1" in
 * `docs/implementation-artifacts/3-8-simulationloop.md`). `toStepRenderer` is the named, obvious
 * object to hand `createSimulationLoop` instead: **Story 3.10's `useSimulation` must wire
 * `renderer: toStepRenderer(gridRenderer)`, never `renderer: gridRenderer` directly** (Decision D).
 *
 * Pure and DOM-free: no React, no scheduling, nothing beyond a one-line forward to `drawDiff`
 * (Story 3.9's playback repaint — `gridRenderer.ts`).
 */
import type { StepRenderer } from '@gol/simulation';
import type { GridRenderer } from './gridRenderer';

// `Pick<GridRenderer, 'drawDiff'>` rather than the whole class: the adapter needs exactly one
// method, and narrowing the parameter keeps this file testable with a bare `{ drawDiff }` object
// instead of a full renderer instance.
export function toStepRenderer(renderer: Pick<GridRenderer, 'drawDiff'>): StepRenderer {
  return {
    draw: (grid) => renderer.drawDiff(grid),
  };
}
