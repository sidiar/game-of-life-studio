import { describe, expect, it } from 'vitest';
import { BattleSchema, BattleSummarySchema, MAX_BATTLE_NAME_LENGTH } from './battleSchema';

const PRESET = { cols: 50, rows: 30 } as const;

function emptyGrid(cols: number, rows: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

/** Writes `values` into the grid's first cells, row-major, so roster entries count as placed. */
function place(grid: number[][], values: number[]): number[][] {
  const cols = grid[0].length;
  values.forEach((v, i) => {
    grid[Math.floor(i / cols)][i % cols] = v;
  });
  return grid;
}

// The wire shape: timestamps are ISO strings, which BattleSchema hydrates into Dates.
const CREATED_AT = '2026-08-03T10:00:00.000Z';
const UPDATED_AT = '2026-08-03T11:00:00.000Z';

function validBattle() {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Battle',
    organismIds: ['conways-classic'],
    gridSize: PRESET,
    gridState: place(emptyGrid(PRESET.cols, PRESET.rows), [1]),
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

/**
 * Rejection tests assert the *specific* issue, and that it is the only one. Asserting bare
 * `success === false` let four fixtures pass by tripping the Decision H.1 placed-set check as
 * a side effect — each invariant could be deleted with the suite staying green.
 */
function issues(data: unknown) {
  const result = BattleSchema.safeParse(data);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues;
}

function expectSoleIssue(data: unknown, path: PropertyKey[], messageFragment: string) {
  const found = issues(data);
  expect(found).toHaveLength(1);
  expect(found[0].path).toEqual(path);
  expect(found[0].message).toContain(messageFragment);
}

describe('BattleSchema', () => {
  it('accepts a valid battle fixture', () => {
    const result = BattleSchema.safeParse(validBattle());
    expect(result.success).toBe(true);
  });

  it('hydrates ISO timestamps into Date objects', () => {
    const result = BattleSchema.parse(validBattle());
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe(CREATED_AT);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  // The regression guard for the z.date() -> ISO decision: a battle that has been through
  // JSON (localStorage, export envelope) must still validate. Under z.date() this threw
  // invalid_type on both timestamps, so every battle the app wrote was unreadable on reload.
  it('survives a JSON round-trip of its own parsed output', () => {
    const parsed = BattleSchema.parse(validBattle());
    const roundTripped: unknown = JSON.parse(JSON.stringify(parsed));
    expect(BattleSchema.safeParse(roundTripped).success).toBe(true);
  });

  it('rejects gridState dimensions that do not match gridSize', () => {
    const battle = validBattle();
    // Keep organismIds[0] placed, so the H.1 check cannot fire and mask this one.
    battle.gridState = place(emptyGrid(PRESET.cols, PRESET.rows - 1), [1]);
    expectSoleIssue(battle, ['gridState'], 'dimensions must match gridSize');
  });

  it('rejects a ragged gridState row', () => {
    const battle = validBattle();
    battle.gridState[5] = Array.from({ length: PRESET.cols - 1 }, () => 0);
    expectSoleIssue(battle, ['gridState'], 'dimensions must match gridSize');
  });

  it('rejects a cell value exceeding organismIds.length', () => {
    const battle = validBattle();
    // Both roster entries stay placed (1, 2), so only the index-range check can fire.
    battle.organismIds = ['conways-classic', 'second-organism'];
    battle.gridState = place(emptyGrid(PRESET.cols, PRESET.rows), [1, 2, 3]);
    expectSoleIssue(battle, ['gridState'], 'must index into organismIds');
  });

  it('rejects an organismIds entry with zero placed cells', () => {
    const battle = validBattle();
    // Only index 1 is placed; 'unplaced-organism' never appears on the grid.
    battle.organismIds = ['conways-classic', 'unplaced-organism'];
    expectSoleIssue(battle, ['organismIds'], 'must be exactly the placed set');
  });

  it('rejects duplicate library ids in organismIds', () => {
    const battle = validBattle();
    // Both indices are placed and in range, so only the uniqueness check can fire.
    battle.organismIds = ['conways-classic', 'conways-classic'];
    battle.gridState = place(emptyGrid(PRESET.cols, PRESET.rows), [1, 2]);
    expectSoleIssue(battle, ['organismIds'], 'must not contain duplicate library ids');
  });

  it('rejects an empty string in organismIds', () => {
    const battle = validBattle();
    battle.organismIds = [''];
    const found = issues(battle);
    expect(found.some((i) => i.path[0] === 'organismIds' && i.path[1] === 0)).toBe(true);
  });

  it('rejects organismIds longer than 255', () => {
    const battle = validBattle();
    // All 255 addressable roster slots are placed, so the cap is the only thing left to fail.
    battle.organismIds = Array.from({ length: 256 }, (_, i) => `organism-${i}`);
    battle.gridState = place(
      emptyGrid(PRESET.cols, PRESET.rows),
      Array.from({ length: 255 }, (_, i) => i + 1),
    );
    const found = issues(battle);
    expect(found.some((i) => i.code === 'too_big' && i.path[0] === 'organismIds')).toBe(true);
  });

  it('rejects a gridSize that is not one of the two literal presets', () => {
    // The grid matches the bogus 150x90 preset, so loosening EditableGridPresetSchema to
    // arbitrary numbers would make this fixture valid — the preset union is what rejects it.
    const found = issues({
      ...validBattle(),
      gridSize: { cols: 150, rows: 90 },
      gridState: place(emptyGrid(150, 90), [1]),
    });
    expect(found.some((i) => i.path[0] === 'gridSize')).toBe(true);
  });

  it('rejects a name over 100 characters', () => {
    expectSoleIssue({ ...validBattle(), name: 'x'.repeat(101) }, ['name'], '100');
  });

  // Story 2.11 (Task 2): the exported cap is the value BOTH schemas enforce — a one-character-over
  // name fails both, and the boundary itself (exactly the cap) is accepted by both. A literal `100`
  // re-typed at either `.max()` site could drift from this constant with the suite staying green;
  // deriving the fixture length FROM the export is what makes drift here a failing test rather than
  // a silent divergence.
  it('MAX_BATTLE_NAME_LENGTH is exactly the boundary both schemas enforce', () => {
    const atCap = 'x'.repeat(MAX_BATTLE_NAME_LENGTH);
    const overCap = 'x'.repeat(MAX_BATTLE_NAME_LENGTH + 1);

    expect(BattleSchema.safeParse({ ...validBattle(), name: atCap }).success).toBe(true);
    expect(BattleSchema.safeParse({ ...validBattle(), name: overCap }).success).toBe(false);
    expect(BattleSummarySchema.safeParse({ ...validBattle(), name: atCap }).success).toBe(true);
    expect(BattleSummarySchema.safeParse({ ...validBattle(), name: overCap }).success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    const found = issues({ ...validBattle(), id: 'conways-classic' });
    expect(found).toHaveLength(1);
    expect(found[0].path).toEqual(['id']);
  });

  it('rejects a cell value above 255', () => {
    const battle = validBattle();
    battle.gridState[0][1] = 256;
    const found = issues(battle);
    expect(found.some((i) => i.path[0] === 'gridState' && i.code === 'too_big')).toBe(true);
  });

  it('rejects a non-ISO createdAt', () => {
    const found = issues({ ...validBattle(), createdAt: 'yesterday' });
    expect(found).toHaveLength(1);
    expect(found[0].path).toEqual(['createdAt']);
  });

  it('rejects a Date object where the wire format expects an ISO string', () => {
    const found = issues({ ...validBattle(), createdAt: new Date(CREATED_AT) });
    expect(found.some((i) => i.path[0] === 'createdAt')).toBe(true);
  });
});

describe('BattleSummarySchema', () => {
  it('projects a stored battle record down to exactly the Decision H.4 fields', () => {
    const summary = BattleSummarySchema.parse(validBattle());

    expect(Object.keys(summary).sort()).toEqual([
      'gridSize',
      'id',
      'name',
      'organismIds',
      'updatedAt',
    ]);
  });

  // Pinned invariant: the projection carries neither the heavy grid nor a second date. FR-7.3's
  // "Date created / last modified" is one value, and `updatedAt` already is it.
  it('drops gridState AND createdAt — the summary omits every heavy or unneeded field', () => {
    const summary = BattleSummarySchema.parse(validBattle());
    expect('gridState' in summary).toBe(false);
    expect('createdAt' in summary).toBe(false);
  });

  it('hydrates updatedAt into a Date so the Gallery can sort on it', () => {
    const summary = BattleSummarySchema.parse(validBattle());

    expect(summary.updatedAt).toBeInstanceOf(Date);
    expect(summary.updatedAt.toISOString()).toBe(UPDATED_AT);
  });

  it('carries the placed roster, so the AR-15 usage index needs no grid', () => {
    expect(BattleSummarySchema.parse(validBattle()).organismIds).toEqual(['conways-classic']);
  });

  // The load-bearing property: the projection must genuinely not read gridState, not merely
  // delete it after a full parse. A record BattleSchema rejects on grid grounds still lists.
  it('accepts a record whose gridState would fail BattleSchema', () => {
    const corruptGrid = { ...validBattle(), gridState: 'not-a-grid' };

    expect(BattleSummarySchema.safeParse(corruptGrid).success).toBe(true);
    expect(BattleSchema.safeParse(corruptGrid).success).toBe(false);
  });

  it('still rejects a record missing a summary field', () => {
    const withoutName: Record<string, unknown> = { ...validBattle() };
    delete withoutName.name;

    expect(BattleSummarySchema.safeParse(withoutName).success).toBe(false);
  });
});
