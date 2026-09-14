import { createMockOrganisms, emptyGrid, gridFromPattern } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';
import { toRenderableGrid } from '@/lib/canvas/renderableGrid';
import { derivePopulation } from './population';

// Three mocks with distinct ids, names and colour tokens (AR-45) — the join below is BY ID, so a
// roster where every entry differs in all three is what catches an index-based join.
const ROSTER = createMockOrganisms();
const LEGEND = { '.': 0, a: 1, b: 2, c: 3 } as const;

describe('derivePopulation (Story 3.10 Task 3, M2, FR-4.6)', () => {
  it('reports every organism extinct, pct 0, in roster order on an empty grid', () => {
    const entries = derivePopulation(toRenderableGrid(emptyGrid(6, 4)), ROSTER);

    expect(entries.map((e) => e.organismId)).toEqual(ROSTER.map((o) => o.id));
    expect(entries.every((e) => e.extinct && e.count === 0 && e.pct === 0)).toBe(true);
  });

  it('sorts living organisms by count descending', () => {
    // a: 1 cell, b: 3 cells, c: 2 cells -> b, c, a.
    const grid = toRenderableGrid(gridFromPattern(['abbb', 'cc..'], LEGEND));

    const entries = derivePopulation(grid, ROSTER);

    expect(entries.map((e) => [e.organismId, e.count])).toEqual([
      [ROSTER[1].id, 3],
      [ROSTER[2].id, 2],
      [ROSTER[0].id, 1],
    ]);
    expect(entries.every((e) => !e.extinct)).toBe(true);
  });

  it('keeps roster order on a tie (stable, and tie-broken explicitly)', () => {
    // All three at 2 cells: roster order a, b, c must survive the sort untouched. Placed in
    // REVERSE roster order on the grid so a first-seen or last-seen ordering would both fail.
    const grid = toRenderableGrid(gridFromPattern(['cc..', 'bb..', 'aa..'], LEGEND));

    const entries = derivePopulation(grid, ROSTER);

    expect(entries.map((e) => e.organismId)).toEqual(ROSTER.map((o) => o.id));
  });

  it('sorts an extinct organism LAST even when it is first in the roster', () => {
    // a (roster slot 0) has no cells; b and c are alive.
    const grid = toRenderableGrid(gridFromPattern(['bbc.'], LEGEND));

    const entries = derivePopulation(grid, ROSTER);

    expect(entries.map((e) => e.organismId)).toEqual([ROSTER[1].id, ROSTER[2].id, ROSTER[0].id]);
    expect(entries[2].extinct).toBe(true);
    expect(entries[0].extinct).toBe(false);
  });

  it('computes pct as count / totalLiving * 100 — a 3:1 split is 75 / 25', () => {
    const grid = toRenderableGrid(gridFromPattern(['aaab'], LEGEND));

    const entries = derivePopulation(grid, ROSTER);

    expect(entries[0].pct).toBe(75);
    expect(entries[1].pct).toBe(25);
    expect(entries[2].pct).toBe(0);
  });

  it("carries each organism's own name and colorToken, joined by id — never by index", () => {
    // Only the THIRD roster slot is alive, so an index-based join off the stats' de-duplicated
    // order would attach the wrong name to it.
    const grid = toRenderableGrid(gridFromPattern(['c...'], LEGEND));

    const entries = derivePopulation(grid, ROSTER);

    expect(entries[0]).toEqual({
      organismId: ROSTER[2].id,
      name: ROSTER[2].name,
      colorToken: ROSTER[2].colorToken,
      count: 1,
      pct: 100,
      extinct: false,
    });
  });

  it('returns a frozen-shape readonly list with exactly one entry per roster organism', () => {
    const grid = toRenderableGrid(gridFromPattern(['ab'], LEGEND));

    const entries = derivePopulation(grid, ROSTER);

    expect(entries).toHaveLength(ROSTER.length);
  });
});
