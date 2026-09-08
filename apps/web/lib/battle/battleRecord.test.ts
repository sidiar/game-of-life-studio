import { describe, expect, it } from 'vitest';
import { BattleSchema } from '@gol/domain';
import { toRenderableGrid, type RenderableGrid } from '@/lib/canvas/renderableGrid';
import { projectBattleForSave } from './battleRecord';

// Grid dimensions are PARAMETERS, never constants — every fixture builds its own preset, and the
// two editable presets are exercised explicitly rather than 100 × 60 being assumed.
const PRESETS = [
  { cols: 50, rows: 30 },
  { cols: 100, rows: 60 },
] as const;

const STAMPS = {
  id: '11111111-2222-4333-8444-555555555555',
  name: 'Saved Battle',
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-02T00:00:00.000Z'),
};

/** An empty grid at the given preset, with `(row, col) -> ref` cells painted onto it. */
function gridAt(
  preset: { cols: number; rows: number },
  cells: readonly (readonly [number, number, number])[] = [],
): RenderableGrid {
  const dense = Array.from({ length: preset.rows }, () =>
    Array.from({ length: preset.cols }, () => 0),
  );
  for (const [row, col, ref] of cells) dense[row][col] = ref;
  return toRenderableGrid(dense);
}

describe('projectBattleForSave', () => {
  for (const preset of PRESETS) {
    it(`produces a schema-valid record at ${preset.cols}x${preset.rows}`, () => {
      const grid = gridAt(preset, [
        [0, 0, 1],
        [preset.rows - 1, preset.cols - 1, 2],
      ]);

      const record = projectBattleForSave(grid, ['alpha', 'beta'], STAMPS);

      expect(BattleSchema.safeParse(JSON.parse(JSON.stringify(record))).success).toBe(true);
      expect(record.gridSize).toEqual(preset);
      expect(record.gridState).toHaveLength(preset.rows);
      expect(record.gridState[0]).toHaveLength(preset.cols);
    });
  }

  // The literal inverse of `toRenderableGrid`: the typed array's row-major layout back to dense
  // rows. Getting the stride wrong transposes the dish and nothing else notices.
  it('densifies row-major, so every cell lands back where it came from', () => {
    const grid = gridAt(PRESETS[0], [
      [0, 3, 1],
      [2, 0, 1],
      [5, 49, 2],
    ]);

    const record = projectBattleForSave(grid, ['alpha', 'beta'], STAMPS);

    expect(record.gridState[0][3]).toBe(1);
    expect(record.gridState[2][0]).toBe(1);
    expect(record.gridState[5][49]).toBe(2);
    expect(record.gridState[0][0]).toBe(0);
  });

  it('stamps identity and timestamps verbatim, including an empty name', () => {
    const record = projectBattleForSave(gridAt(PRESETS[0]), [], { ...STAMPS, name: '' });

    expect(record.id).toBe(STAMPS.id);
    // `''`, never `battleDisplayName`'s "Untitled Battle" — that is a DISPLAY fallback and storing
    // it would persist a placeholder as a real name (createNewBattleDraft records why).
    expect(record.name).toBe('');
    expect(record.createdAt).toEqual(STAMPS.createdAt);
    expect(record.updatedAt).toEqual(STAMPS.updatedAt);
  });

  // The H.1 prune / E.2 remap live in `@gol/domain` and are tested there in depth. What belongs
  // HERE is that this assembly actually routes through them rather than copying the grid across.
  it('routes through the prune and remap rather than copying the grid across', () => {
    const grid = gridAt(PRESETS[0], [
      [0, 0, 1],
      [1, 1, 3],
    ]);

    const record = projectBattleForSave(grid, ['alpha', 'erased', 'gamma'], STAMPS);

    expect(record.organismIds).toEqual(['alpha', 'gamma']);
    expect(record.gridState[1][1]).toBe(2);
    expect(BattleSchema.safeParse(JSON.parse(JSON.stringify(record))).success).toBe(true);
  });

  /**
   * Decision G.1 / H-9: editable and persisted grids are {50×30, 100×60} ONLY (150×90 and 200×120
   * are ephemeral Play-mode expansion and never reach a schema). Parsing the preset here makes an
   * out-of-preset grid fail at THIS boundary, naming the field — rather than as a `superRefine`
   * dimension mismatch surfacing from inside the repository, or as a record that stores fine and
   * refuses to load.
   */
  it('refuses a grid outside the two editable presets, at this boundary', () => {
    const grid = gridAt({ cols: 20, rows: 10 });

    expect(() => projectBattleForSave(grid, [], STAMPS)).toThrow();
  });

  // trap 1 / trap 2: a save READS the editor. `rosterIds` may be the loaded record's own array,
  // and the grid is the live one the canvas is painting from — writing through either would
  // corrupt the pristine state there is nothing left to revert to.
  it('does not alias or mutate the live grid or the roster it was given', () => {
    const grid = gridAt(PRESETS[0], [[0, 0, 1]]);
    const occupantBefore = Uint8Array.from(grid.occupant);
    const rosterIds = ['alpha'];

    const record = projectBattleForSave(grid, rosterIds, STAMPS);
    record.gridState[0][1] = 1;
    record.organismIds.push('beta');

    expect(grid.occupant).toEqual(occupantBefore);
    expect(rosterIds).toEqual(['alpha']);
  });
});
