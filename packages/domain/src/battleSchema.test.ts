import { describe, expect, it } from 'vitest';
import { BattleSchema } from './battleSchema';

const gridSize = { cols: 50, rows: 30 } as const;

function emptyGrid(cols: number, rows: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function validBattle() {
  const gridState = emptyGrid(gridSize.cols, gridSize.rows);
  gridState[0][0] = 1; // organismIds[0] is placed here
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Battle',
    organismIds: ['conways-classic'],
    gridSize,
    gridState,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('BattleSchema', () => {
  it('accepts a valid battle fixture', () => {
    const result = BattleSchema.safeParse(validBattle());
    expect(result.success).toBe(true);
  });

  it('rejects gridState dimensions that do not match gridSize', () => {
    const battle = validBattle();
    battle.gridState = emptyGrid(gridSize.cols, gridSize.rows - 1); // one row short
    const result = BattleSchema.safeParse(battle);
    expect(result.success).toBe(false);
  });

  it('rejects a cell value exceeding organismIds.length', () => {
    const battle = validBattle();
    battle.gridState[0][0] = 2; // organismIds has only 1 entry, index 2 is out of range
    const result = BattleSchema.safeParse(battle);
    expect(result.success).toBe(false);
  });

  it('rejects an organismIds entry with zero placed cells', () => {
    const battle = validBattle();
    battle.organismIds = ['conways-classic', 'unplaced-organism']; // second id never placed on gridState
    const result = BattleSchema.safeParse(battle);
    expect(result.success).toBe(false);
  });

  it('rejects organismIds longer than 255', () => {
    const battle = validBattle();
    battle.organismIds = Array.from({ length: 256 }, (_, i) => `organism-${i}`);
    const result = BattleSchema.safeParse(battle);
    expect(result.success).toBe(false);
  });

  it('rejects a gridSize that is not one of the two literal presets', () => {
    const battle = validBattle();
    // @ts-expect-error deliberately invalid preset to test rejection
    battle.gridSize = { cols: 150, rows: 90 };
    const result = BattleSchema.safeParse(battle);
    expect(result.success).toBe(false);
  });
});
