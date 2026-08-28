import { describe, expect, it } from 'vitest';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import { computeEditorGridStats } from './gridStats';

// Grid dimensions are parameters, never constants (project-context) — these two helpers build
// grids at more than one size on purpose, and neither is 100 x 60.
function makeGrid(width: number, height: number, occupant: number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: new Uint16Array(occupant.length),
  };
}

describe('computeEditorGridStats', () => {
  it('returns zero living cells and a zeroed entry per roster id on an empty grid', () => {
    const grid = makeGrid(3, 2, [0, 0, 0, 0, 0, 0]);

    const stats = computeEditorGridStats(grid, ['organism-a', 'organism-b']);

    expect(stats.livingCells).toBe(0);
    expect(stats.perOrganism).toEqual([
      { organismId: 'organism-a', count: 0 },
      { organismId: 'organism-b', count: 0 },
    ]);
  });

  it('counts a single organism’s cells', () => {
    // 4x1: refs 1, 0, 1, 1 -> three cells for the one roster id.
    const grid = makeGrid(4, 1, [1, 0, 1, 1]);

    const stats = computeEditorGridStats(grid, ['organism-a']);

    expect(stats.livingCells).toBe(3);
    expect(stats.perOrganism).toEqual([{ organismId: 'organism-a', count: 3 }]);
  });

  it('counts two organisms independently, in roster order', () => {
    // 2x3: refs 1, 2 / 2, 1 / 0, 2 -> organism-a: 2, organism-b: 3.
    const grid = makeGrid(2, 3, [1, 2, 2, 1, 0, 2]);

    const stats = computeEditorGridStats(grid, ['organism-a', 'organism-b']);

    expect(stats.livingCells).toBe(5);
    expect(stats.perOrganism).toEqual([
      { organismId: 'organism-a', count: 2 },
      { organismId: 'organism-b', count: 3 },
    ]);
  });

  // AC3: "dropping to zero correctly when erased" — an organism with cells on a prior commit and
  // none on this one must read 0, not vanish from perOrganism.
  it('drops an organism to zero once every one of its cells is erased', () => {
    const grid = makeGrid(2, 1, [0, 0]);

    const stats = computeEditorGridStats(grid, ['organism-a']);

    expect(stats.perOrganism).toEqual([{ organismId: 'organism-a', count: 0 }]);
  });

  // Forced decision 1(a): a duplicate id in rosterIds aggregates onto ONE entry, matching what
  // `roster` (de-duplicated by resolveDisplayOrganisms) renders as a single row — both refs'
  // cells sum into it.
  it('aggregates a duplicate id in rosterIds onto a single entry', () => {
    // ref 1 and ref 2 both resolve to 'organism-a' (duplicate at index 0 and index 1).
    const grid = makeGrid(3, 1, [1, 2, 2]);

    const stats = computeEditorGridStats(grid, ['organism-a', 'organism-a']);

    expect(stats.livingCells).toBe(3);
    expect(stats.perOrganism).toEqual([{ organismId: 'organism-a', count: 3 }]);
  });

  // Dev Notes trap 2: a ref beyond rosterIds.length is a real occupied cell with no organism
  // behind it (a corrupt/hand-edited gridState). It counts in livingCells and is attributed to
  // nobody — sum(perOrganism.count) < livingCells is the resulting invariant, not a bug.
  it('counts an out-of-range ref in livingCells and attributes it to nobody', () => {
    const grid = makeGrid(3, 1, [1, 5, 0]);

    const stats = computeEditorGridStats(grid, ['organism-a']);

    expect(stats.livingCells).toBe(2);
    expect(stats.perOrganism).toEqual([{ organismId: 'organism-a', count: 1 }]);
    const sum = stats.perOrganism.reduce((total, o) => total + o.count, 0);
    expect(sum).toBeLessThan(stats.livingCells);
  });

  it('handles an empty rosterIds against a grid that somehow holds a ref', () => {
    const grid = makeGrid(2, 1, [1, 0]);

    const stats = computeEditorGridStats(grid, []);

    expect(stats.livingCells).toBe(1);
    expect(stats.perOrganism).toEqual([]);
  });

  // A second grid size, per the "never hardcode 100x60" testing standard.
  it('works at a non-default grid size', () => {
    const grid = makeGrid(
      5,
      6,
      new Array(30).fill(0).map((_, i) => (i % 3 === 0 ? 1 : 0)),
    );

    const stats = computeEditorGridStats(grid, ['organism-a']);

    expect(stats.livingCells).toBe(10);
    expect(stats.perOrganism).toEqual([{ organismId: 'organism-a', count: 10 }]);
  });
});
