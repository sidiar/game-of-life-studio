import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupByColourState } from './colourStateGroups';
import type { RefToFillGroup } from './refToFillGroup';
import type { RenderableGrid } from './renderableGrid';

function grid(width: number, height: number, occupant: number[], age: number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: Uint16Array.from(age),
  };
}

function lut(tokenIndex: number[], aging: number[]): RefToFillGroup {
  return {
    tokenIndex: Uint8Array.from(tokenIndex),
    aging: Uint8Array.from(aging),
    size: tokenIndex.length,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('groupByColourState', () => {
  it('two organisms sharing a colorToken produce one group, not two (Decision B.2)', () => {
    // refs 1 and 2 both resolve to tokenIndex 5, both non-aging.
    const g = grid(2, 1, [1, 2], [0, 0]);
    const table = lut([0, 5, 5], [0, 0, 0]);

    const groups = groupByColourState(g, table);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells.sort()).toEqual([0, 1]);
  });

  it('an aging organism at ages 0..9 produces exactly 8 groups (ages >= 7 fold)', () => {
    const ages = Array.from({ length: 10 }, (_, i) => i);
    const g = grid(
      10,
      1,
      ages.map(() => 1),
      ages,
    );
    const table = lut([0, 3], [0, 1]);

    const groups = groupByColourState(g, table);
    expect(groups).toHaveLength(8);
  });

  it('a non-aging organism at any age produces exactly one group with ageShade 7', () => {
    const ages = [0, 1, 5, 7, 50, 99];
    const g = grid(
      6,
      1,
      ages.map(() => 1),
      ages,
    );
    const table = lut([0, 4], [0, 0]);

    const groups = groupByColourState(g, table);
    expect(groups).toHaveLength(1);
    expect(groups[0].ageShade).toBe(7);
  });

  it('every returned groupId equals tokenIndex * 8 + ageShade', () => {
    const g = grid(3, 1, [1, 2, 3], [0, 3, 9]);
    const table = lut([0, 2, 5, 9], [0, 1, 1, 0]);

    for (const group of groupByColourState(g, table)) {
      expect(group.groupId).toBe(group.tokenIndex * 8 + group.ageShade);
    }
  });

  it('an all-empty grid returns []', () => {
    const g = grid(3, 3, new Array(9).fill(0), new Array(9).fill(0));
    const table = lut([0], [0]);
    expect(groupByColourState(g, table)).toEqual([]);
  });

  it('a 20-token x 8-shade worst-case grid returns at most 160 groups', () => {
    // 20 aging organisms, one per token index 0..19; every age 0..7 present.
    const tokenIndex = Array.from({ length: 21 }, (_, i) => (i === 0 ? 0 : i - 1));
    const aging = Array.from({ length: 21 }, (_, i) => (i === 0 ? 0 : 1));
    const table = lut(tokenIndex, aging);

    const occupant: number[] = [];
    const age: number[] = [];
    for (let ref = 1; ref <= 20; ref++) {
      for (let a = 0; a <= 9; a++) {
        occupant.push(ref);
        age.push(a);
      }
    }
    const g = grid(occupant.length, 1, occupant, age);

    const groups = groupByColourState(g, table);
    expect(groups.length).toBeLessThanOrEqual(160);
  });

  it('cell indices are exhaustive and disjoint across groups', () => {
    const occupant = [1, 0, 2, 1, 0, 3];
    const g = grid(6, 1, occupant, [0, 0, 0, 4, 0, 0]);
    const table = lut([0, 1, 2, 3], [0, 0, 1, 0]);

    const groups = groupByColourState(g, table);
    const allCells = groups.flatMap((group) => group.cells);
    const expectedNonEmpty = occupant.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i !== -1);

    expect(allCells.sort((a, b) => a - b)).toEqual(expectedNonEmpty.sort((a, b) => a - b));
    expect(new Set(allCells).size).toBe(allCells.length); // disjoint — no cell in two groups
  });

  it('skips an out-of-range ref and warns exactly once', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // ref 5 is out of range for a 2-slot LUT (size 2: slot 0 + one real organism at ref 1).
    const g = grid(3, 1, [1, 5, 5], [0, 0, 0]);
    const table = lut([0, 2], [0, 0]);

    const groups = groupByColourState(g, table);
    const allCells = groups.flatMap((group) => group.cells);
    expect(allCells).toEqual([0]); // only the in-range ref survives
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
