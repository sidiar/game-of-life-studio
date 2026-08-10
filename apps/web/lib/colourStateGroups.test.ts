import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupByColourState, resetColourStateWarnings } from './colourStateGroups';
import { ageShadeFor } from './displayColor';
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
  // The warn-once registry is a module singleton that restoreAllMocks does not touch. Without
  // this, "warns exactly once" passes only while it happens to be the first test in the file to
  // touch that ref, and any test added above it flips the assertion to zero calls.
  resetColourStateWarnings();
});

describe('groupByColourState', () => {
  it('two organisms sharing a colorToken produce one group, not two (Decision B.2)', () => {
    // refs 1 and 2 both resolve to tokenIndex 5, both non-aging.
    const g = grid(2, 1, [1, 2], [0, 0]);
    const table = lut([0, 5, 5], [0, 0, 0]);

    const groups = groupByColourState(g, table);
    expect(groups).toHaveLength(1);
    // Numeric comparator: the default one sorts lexicographically, which is right for [0, 1] and
    // wrong the moment a group holds a cell index >= 10.
    expect([...groups[0].cells].sort((a, b) => a - b)).toEqual([0, 1]);
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
    const occupant = [1, 2, 3];
    const ages = [0, 3, 9];
    const tokenIndex = [0, 2, 5, 9];
    const aging = [0, 1, 1, 0];
    const g = grid(3, 1, occupant, ages);
    const table = lut(tokenIndex, aging);

    // Derived from the INPUTS, not from the returned group's own fields. Asserting
    // `groupId === group.tokenIndex * 8 + group.ageShade` is a tautology: the implementation
    // builds ageShade as `groupId - tokenIndex * 8`, so it holds for any groupId whatsoever,
    // including a broken one (review 2026-08-06).
    const expected = occupant
      .map((ref, i) => tokenIndex[ref] * 8 + ageShadeFor(ages[i], aging[ref] === 1))
      .sort((a, b) => a - b);

    const groups = groupByColourState(g, table);
    expect(groups.map((group) => group.groupId)).toEqual(expected);
    for (const group of groups) {
      expect(group.groupId).toBe(group.tokenIndex * 8 + group.ageShade);
    }
  });

  it('an all-empty grid returns []', () => {
    const g = grid(3, 3, new Array(9).fill(0), new Array(9).fill(0));
    const table = lut([0], [0]);
    expect(groupByColourState(g, table)).toEqual([]);
  });

  it('a 20-token x 8-shade worst-case grid returns exactly 160 groups — the Decision B.2 bound', () => {
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
    // Exactly 160, not "at most": this fixture saturates every token x shade cell, so a <= bound
    // would also pass for an implementation returning fewer groups — or none at all.
    expect(groups).toHaveLength(160);
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

  it('throws when a buffer is shorter than the declared dimensions', () => {
    // Reachable without GridRenderer's assertion, since this is a public function. An over-long
    // occupant would emit phantom cells past the grid rectangle; a short age buffer reads
    // undefined, becomes NaN, and clamps to shade 0 — cells silently painted the newborn colour.
    const table = lut([0, 2], [0, 0]);
    const shortOccupant: RenderableGrid = {
      width: 2,
      height: 2,
      occupant: Uint8Array.from([1, 1, 1]),
      age: new Uint16Array(4),
    };
    const shortAge: RenderableGrid = {
      width: 2,
      height: 2,
      occupant: new Uint8Array(4),
      age: new Uint16Array(3),
    };

    expect(() => groupByColourState(shortOccupant, table)).toThrow(/needs 4 cells/);
    expect(() => groupByColourState(shortAge, table)).toThrow(/needs 4 cells/);
  });

  it('ignores occupant entries past width * height rather than emitting phantom cells', () => {
    const table = lut([0, 2], [0, 0]);
    const overLong: RenderableGrid = {
      width: 2,
      height: 1,
      occupant: Uint8Array.from([1, 1, 1, 1]), // 4 entries for a 2-cell grid
      age: new Uint16Array(4),
    };

    expect(groupByColourState(overLong, table).flatMap((g) => g.cells)).toEqual([0, 1]);
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

  // Story 1.11 Task 7: the dedupe is keyed PER LUT, not on the bare ref number. Two distinct
  // battles (two distinct LUT objects) each carrying the same out-of-range ref must each warn —
  // the assertion that fails against the pre-re-key module Set (which would report only 1) and
  // passes after it.
  it('warns twice when two different LUTs each carry the same out-of-range ref', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = grid(1, 1, [5], [0]);
    const battleALut = lut([0, 2], [0, 0]); // size 2 — ref 5 is out of range
    const battleBLut = lut([0, 2], [0, 0]); // a SEPARATE object, same shape

    groupByColourState(g, battleALut);
    groupByColourState(g, battleBLut);

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('still dedupes within the SAME LUT across multiple calls', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = grid(1, 1, [5], [0]);
    const table = lut([0, 2], [0, 0]);

    groupByColourState(g, table);
    groupByColourState(g, table);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
