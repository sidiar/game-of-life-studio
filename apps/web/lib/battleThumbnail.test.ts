import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockBattles, createMockOrganisms, emptyGrid } from '@gol/test-utils';
import { resetRefToFillGroupWarnings } from './refToFillGroup';
import { toThumbnailSource } from './battleThumbnail';

afterEach(() => {
  resetRefToFillGroupWarnings();
  vi.restoreAllMocks();
});

describe('toThumbnailSource', () => {
  it('produces a grid whose dimensions match gridSize and whose occupant values round-trip', () => {
    const [battle] = createMockBattles(); // Three-Way Skirmish, 50x30
    const { grid } = toThumbnailSource(battle, createMockOrganisms());

    expect(grid.width).toBe(battle.gridSize.cols);
    expect(grid.height).toBe(battle.gridSize.rows);
    expect(grid.occupant.length).toBe(battle.gridSize.cols * battle.gridSize.rows);

    for (let row = 0; row < battle.gridSize.rows; row++) {
      for (let col = 0; col < battle.gridSize.cols; col++) {
        expect(grid.occupant[row * battle.gridSize.cols + col]).toBe(battle.gridState[row][col]);
      }
    }
  });

  it('every initial grid has age all zeros (renderableGrid.ts:18-21)', () => {
    const [battle] = createMockBattles();
    const { grid } = toThumbnailSource(battle, createMockOrganisms());

    expect(grid.age.every((a) => a === 0)).toBe(true);
  });

  // Decision I.4 degrade-and-warn: a roster id with no matching organism must still produce a LUT
  // entry rather than throwing, so the battle still renders.
  it('a roster id absent from the roster still produces a LUT entry', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [battle] = createMockBattles();
    const missingId = battle.organismIds[0];
    const rosterWithoutFirst = createMockOrganisms().filter((o) => o.id !== missingId);

    const { palette } = toThumbnailSource(battle, rosterWithoutFirst);

    expect(palette.size).toBe(battle.organismIds.length + 1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('a battle with an empty roster produces a size-1 LUT and an all-empty grid', () => {
    // gridSize is one of the two editable presets only (Decision A) — 50x30 here, all-zero.
    const emptyBattle = {
      id: '00000000-0000-4000-8000-000000000000',
      name: 'Empty',
      organismIds: [] as string[],
      gridSize: { cols: 50, rows: 30 } as const,
      gridState: emptyGrid(50, 30),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const { grid, palette } = toThumbnailSource(emptyBattle, []);

    expect(palette.size).toBe(1);
    expect(grid.occupant.every((v) => v === 0)).toBe(true);
  });

  it('builds the id -> organism map once per battle, not per cell (roster resolved by id)', () => {
    const [, battleB] = createMockBattles(); // Grand Colony War, includes Conway's Classic
    const roster = createMockOrganisms();
    // Conway's Classic is not in createMockOrganisms() — its ref should degrade-and-warn, and
    // every OTHER organism must still resolve to its real token, proving the lookup is by id.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { palette } = toThumbnailSource(battleB, roster);

    expect(palette.size).toBe(battleB.organismIds.length + 1);
    expect(warnSpy).toHaveBeenCalledTimes(1); // exactly Conway's Classic's dangling ref
  });
});
