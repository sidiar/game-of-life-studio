import { describe, expect, it } from 'vitest';
import { pruneAndRemapBattleGrid } from './battleProjection';
import { BattleSchema } from './battleSchema';

// Grid dimensions are PARAMETERS, never constants (project-context) — every fixture below builds
// its own, and the schema round-trip cases exercise both editable presets rather than assuming
// 100 × 60.
function grid(rows: number, cols: number, cells: readonly (readonly number[])[]): number[][] {
  expect(cells).toHaveLength(rows);
  for (const row of cells) expect(row).toHaveLength(cols);
  return cells.map((row) => [...row]);
}

/** An empty grid at `rows × cols`, with the given `(row, col) → ref` cells painted onto it. */
function paint(
  rows: number,
  cols: number,
  cells: readonly (readonly [number, number, number])[],
): number[][] {
  const out = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (const [row, col, ref] of cells) out[row][col] = ref;
  return out;
}

/**
 * The assertion this module is actually about: which ORGANISM each occupied cell resolves to,
 * before and after. Asserting the numbers would pass for a projection that shifted every ref
 * consistently in the wrong direction — the ids are what the numbers are supposed to mean.
 */
function organismAt(
  gridState: readonly (readonly number[])[],
  organismIds: readonly string[],
): (string | null)[][] {
  return gridState.map((row) =>
    row.map((value) => (value === 0 ? null : (organismIds[value - 1] ?? '<dangling>'))),
  );
}

describe('pruneAndRemapBattleGrid', () => {
  it('returns a legal empty projection for an empty roster and an empty grid', () => {
    const gridState = paint(3, 4, []);

    const result = pruneAndRemapBattleGrid(gridState, []);

    expect(result.organismIds).toEqual([]);
    expect(result.gridState).toEqual(paint(3, 4, []));
  });

  it('is the identity when every roster entry is placed (no erasure)', () => {
    const gridState = paint(2, 3, [
      [0, 0, 1],
      [1, 2, 2],
      [0, 1, 3],
    ]);
    const rosterIds = ['alpha', 'beta', 'gamma'];

    const result = pruneAndRemapBattleGrid(gridState, rosterIds);

    expect(result.organismIds).toEqual(rosterIds);
    expect(result.gridState).toEqual(gridState);
  });

  // The whole story's risk, in one test. Erasing an INTERIOR organism leaves the refs above it
  // in range, so an un-remapped projection saves, loads and renders — with every later cell
  // attributed to the wrong organism (Dev Notes, "the prune shifts refs").
  it('shifts only the refs above an erased interior organism, and every cell keeps its organism', () => {
    const rosterIds = ['alpha', 'beta', 'gamma'];
    // beta (ref 2) had cells until the user erased its last one; alpha (1) and gamma (3) remain.
    const gridState = paint(2, 3, [
      [0, 0, 1],
      [1, 1, 3],
    ]);

    const result = pruneAndRemapBattleGrid(gridState, rosterIds);

    expect(result.organismIds).toEqual(['alpha', 'gamma']);
    // alpha keeps ref 1; gamma moves 3 → 2. The numbers changed, the meaning did not.
    expect(result.gridState[0][0]).toBe(1);
    expect(result.gridState[1][1]).toBe(2);
    expect(organismAt(result.gridState, result.organismIds)).toEqual(
      organismAt(gridState, rosterIds),
    );
  });

  // The case that does NOT fail loudly: erase the FIRST organism and every later ref stays within
  // the pruned roster's length, so `superRefine` has nothing to object to.
  it('remaps correctly when erasing the first organism leaves later refs still in range', () => {
    const rosterIds = ['alpha', 'beta', 'gamma'];
    const gridState = paint(2, 2, [
      [0, 0, 2], // beta
      [1, 1, 3], // gamma
    ]);

    const result = pruneAndRemapBattleGrid(gridState, rosterIds);

    expect(result.organismIds).toEqual(['beta', 'gamma']);
    expect(organismAt(result.gridState, result.organismIds)).toEqual([
      ['beta', null],
      [null, 'gamma'],
    ]);
  });

  // Decision H.2: an organism added to the session roster but never painted is not part of the
  // record. It is indistinguishable here from a battle organism whose last cell was erased —
  // both are simply unplaced, which is the point of pruning on PLACEMENT rather than on origin.
  it('excludes a session-added but unpainted roster entry (Decision H.2)', () => {
    const gridState = paint(2, 2, [[0, 0, 1]]);

    const result = pruneAndRemapBattleGrid(gridState, ['alpha', 'never-painted']);

    expect(result.organismIds).toEqual(['alpha']);
    expect(result.gridState).toEqual(paint(2, 2, [[0, 0, 1]]));
  });

  // `BattleSummarySchema` has no duplicate check, so a repeated id survives a load and
  // `buildRosterIds` preserves it — but `BattleSchema.superRefine` rejects duplicates at rest.
  it('collapses a duplicate id onto one slot and merges its cells', () => {
    const rosterIds = ['alpha', 'beta', 'alpha'];
    const gridState = paint(2, 3, [
      [0, 0, 1], // alpha via ref 1
      [0, 2, 2], // beta
      [1, 1, 3], // alpha via ref 3
    ]);

    const result = pruneAndRemapBattleGrid(gridState, rosterIds);

    expect(result.organismIds).toEqual(['alpha', 'beta']);
    expect(organismAt(result.gridState, result.organismIds)).toEqual([
      ['alpha', null, 'beta'],
      [null, 'alpha', null],
    ]);
    expect(result.gridState[0][0]).toBe(result.gridState[1][1]);
  });

  it('collapses a duplicate id even when only the LATER slot is placed', () => {
    const gridState = paint(1, 2, [[0, 1, 2]]);

    const result = pruneAndRemapBattleGrid(gridState, ['alpha', 'alpha']);

    expect(result.organismIds).toEqual(['alpha']);
    expect(result.gridState).toEqual([[0, 1]]);
  });

  // A hand-edited or corrupt gridState (Story 2.12 trap 2 / Decision I.4). Carrying the value
  // through would produce a record that fails its own schema; it is already painted as EMPTY in
  // the editor, so dropping it makes the stored record agree with the screen.
  it('drops an out-of-range ref rather than emitting a record that fails its own schema', () => {
    const gridState = paint(2, 2, [
      [0, 0, 1],
      [1, 1, 9], // no roster entry at index 8
    ]);

    const result = pruneAndRemapBattleGrid(gridState, ['alpha']);

    expect(result.organismIds).toEqual(['alpha']);
    expect(result.gridState).toEqual(paint(2, 2, [[0, 0, 1]]));
  });

  it('does not alias or mutate its inputs', () => {
    const rosterIds = ['alpha'];
    const gridState = grid(1, 2, [[1, 0]]);

    const result = pruneAndRemapBattleGrid(gridState, rosterIds);
    result.gridState[0][1] = 1;
    result.organismIds.push('beta');

    expect(gridState).toEqual([[1, 0]]);
    expect(rosterIds).toEqual(['alpha']);
    expect(result.gridState[0]).not.toBe(gridState[0]);
  });

  // AC7: the output is parsed through the REAL schema rather than re-asserting the invariants
  // field by field — restating `superRefine`'s rules in an assertion is exactly how the two drift.
  describe('the projection satisfies BattleSchema by construction', () => {
    const stamps = {
      id: '00000000-0000-4000-8000-000000000000',
      name: 'Pruned Battle',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
    };

    for (const gridSize of [
      { cols: 50, rows: 30 },
      { cols: 100, rows: 60 },
    ] as const) {
      it(`parses at ${gridSize.cols}x${gridSize.rows} after pruning an interior organism`, () => {
        const rosterIds = ['alpha', 'beta', 'gamma'];
        // beta (ref 2) is deliberately absent; alpha and gamma sit at opposite corners so the
        // remap has to move gamma from 3 to 2.
        const gridState = paint(gridSize.rows, gridSize.cols, [
          [0, 0, 1],
          [gridSize.rows - 1, gridSize.cols - 1, 3],
        ]);

        const projected = pruneAndRemapBattleGrid(gridState, rosterIds);
        const parsed = BattleSchema.safeParse({ ...stamps, gridSize, ...projected });

        expect(parsed.success).toBe(true);
      });
    }

    it('parses after collapsing a duplicate id and dropping a dangling ref', () => {
      const gridSize = { cols: 50, rows: 30 } as const;
      const gridState = paint(gridSize.rows, gridSize.cols, [
        [0, 0, 1],
        [1, 1, 3],
        [2, 2, 7], // dangling
      ]);

      const projected = pruneAndRemapBattleGrid(gridState, ['alpha', 'unplaced', 'alpha']);
      const parsed = BattleSchema.safeParse({ ...stamps, gridSize, ...projected });

      expect(parsed.success).toBe(true);
      expect(projected.organismIds).toEqual(['alpha']);
    });

    // The negative control: without the remap, the same prune produces a record the schema
    // REJECTS — which is what makes the test above evidence rather than a tautology.
    it('rejects the un-remapped alternative, proving the remap is what the parse depends on', () => {
      const gridSize = { cols: 50, rows: 30 } as const;
      const gridState = paint(gridSize.rows, gridSize.cols, [
        [0, 0, 1],
        [1, 1, 3],
      ]);

      const unRemapped = BattleSchema.safeParse({
        ...stamps,
        gridSize,
        organismIds: ['alpha', 'gamma'],
        gridState,
      });

      expect(unRemapped.success).toBe(false);
    });
  });
});
