import { gridFromPattern } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';
import { gridFromDense } from './grid';
import { countNeighbors } from './neighborhood';

// ── The fixture the whole story turns on ────────────────────────────────────────────────────────
// ⚠️ `neighborCount` is SAME-organism and `occupantNeighborCount` is OTHER-organism (RFC-004 §2.1,
// Decision C.1) — NOT "all eight occupied neighbours". Conway's Classic is single-organism, so the
// two readings coincide for every other fixture in this package and diverge only in Story 3.6's
// multi-organism goldens, as wrong survival behaviour with no failing test naming why. This grid
// is the first thing in the repo that can tell a right materialization from a wrong one.
//
//   A = ref 1 (roster index 0)   B = ref 2 (roster index 1)   . = empty
//
//        col:  0 1 2
//   row 0:     A B A
//   row 1:     B A B
//   row 2:     A . A
//
// The centre cell (1,1) holds A. Its eight neighbours are A,B,A / B,_,B / A,.,A:
//   - four A  (the four corners)
//   - three B (up, left, right)
//   - one empty (down)
// So evaluated AS A:   same = 4, other = 3.
//    evaluated AS B:   same = 3, other = 4.
// The two pairs are mirror images, which is exactly what a "count all occupied neighbours"
// implementation cannot produce — it would answer 7/0 for both.
const MULTI_ORGANISM = gridFromDense(
  gridFromPattern(['ABA', 'BAB', 'A.A'], { '.': 0, A: 1, B: 2 }),
);

const REF_A = 1;
const REF_B = 2;

describe('countNeighbors — relative counts (AC5)', () => {
  it('answers differently for two organisms evaluating the SAME physical cell', () => {
    expect(countNeighbors(MULTI_ORGANISM, 1, 1, REF_A)).toEqual({ same: 4, other: 3 });
    expect(countNeighbors(MULTI_ORGANISM, 1, 1, REF_B)).toEqual({ same: 3, other: 4 });
  });

  it('never counts the cell itself, occupied or not', () => {
    // (1,1) holds A. If the centre leaked into the sum, `same` would read 5 for A.
    expect(countNeighbors(MULTI_ORGANISM, 1, 1, REF_A).same).toBe(4);
    // (1,2) is empty and its neighbours are B,A,B / A,_,A — evaluated as A that is same 3, other 2
    // (the row below (1,2) is off the grid).
    expect(countNeighbors(MULTI_ORGANISM, 1, 2, REF_A)).toEqual({ same: 3, other: 2 });
  });

  it('empty neighbours count toward NEITHER total (trap 9)', () => {
    const { same, other } = countNeighbors(MULTI_ORGANISM, 1, 1, REF_A);

    // The cell below the centre is empty, so the two counts sum to 7, not to the 8 neighbour slots.
    expect(same + other).toBe(7);
  });

  it('a ref present nowhere on the grid sees every occupied neighbour as OTHER', () => {
    expect(countNeighbors(MULTI_ORGANISM, 1, 1, 200)).toEqual({ same: 0, other: 7 });
  });

  it('the reserved empty ref 0 sees every occupied neighbour as OTHER, empties as neither', () => {
    // Pins the degenerate the doc comment blesses: the `value === 0` empty test runs BEFORE the
    // `value === selfRef` comparison, so a selfRef of 0 never claims an empty neighbour as `same`.
    // Reordering those two checks is the silent change this test exists to redden on.
    expect(countNeighbors(MULTI_ORGANISM, 1, 1, 0)).toEqual({ same: 0, other: 7 });
  });

  it('an all-empty grid answers 0/0 everywhere', () => {
    const empty = gridFromDense(gridFromPattern(['...', '...', '...'], { '.': 0 }));

    expect(countNeighbors(empty, 1, 1, REF_A)).toEqual({ same: 0, other: 0 });
  });
});

describe('countNeighbors — Moore 8 with hard edges (AC4, FR-5.8/FR-5.9)', () => {
  // A fully-occupied grid: every count is purely a function of how many neighbour SLOTS are in
  // bounds, so a wrap bug shows up as a number and not as a subtle mis-attribution.
  //   corner -> 3, edge -> 5, interior -> 8.
  const filled = (cols: number, rows: number) =>
    gridFromDense(Array.from({ length: rows }, () => Array.from({ length: cols }, () => REF_A)));

  const FOUR_BY_FOUR = filled(4, 4);
  // ⚠️ A SECOND size, and not a square one: a `% width` wrap and a clamped bound agree on a square
  // grid far more often than they do on a rectangle.
  const FIVE_BY_THREE = filled(5, 3);

  it.each([
    ['top-left', 0, 0],
    ['top-right', 3, 0],
    ['bottom-left', 0, 3],
    ['bottom-right', 3, 3],
  ])('4x4 %s corner sees 3 neighbours, never 5 or 8', (_name, col, row) => {
    expect(countNeighbors(FOUR_BY_FOUR, col, row, REF_A)).toEqual({ same: 3, other: 0 });
  });

  it.each([
    ['top-left', 0, 0],
    ['top-right', 4, 0],
    ['bottom-left', 0, 2],
    ['bottom-right', 4, 2],
  ])('5x3 %s corner sees 3 neighbours', (_name, col, row) => {
    expect(countNeighbors(FIVE_BY_THREE, col, row, REF_A)).toEqual({ same: 3, other: 0 });
  });

  it.each([
    ['top', 2, 0],
    ['bottom', 2, 3],
    ['left', 0, 2],
    ['right', 3, 2],
  ])('4x4 %s edge sees 5 neighbours', (_name, col, row) => {
    expect(countNeighbors(FOUR_BY_FOUR, col, row, REF_A)).toEqual({ same: 5, other: 0 });
  });

  it.each([
    ['top', 2, 0],
    ['bottom', 2, 2],
    ['left', 0, 1],
    ['right', 4, 1],
  ])('5x3 %s edge sees 5 neighbours', (_name, col, row) => {
    expect(countNeighbors(FIVE_BY_THREE, col, row, REF_A)).toEqual({ same: 5, other: 0 });
  });

  it('an interior cell sees all 8, at both sizes', () => {
    expect(countNeighbors(FOUR_BY_FOUR, 1, 1, REF_A).same).toBe(8);
    expect(countNeighbors(FOUR_BY_FOUR, 2, 2, REF_A).same).toBe(8);
    expect(countNeighbors(FIVE_BY_THREE, 2, 1, REF_A).same).toBe(8);
  });

  /**
   * ⚠️ The degenerate strip is where a CLAMPED-bounds implementation and a `continue`-guard one
   * diverge, and where the modulo idiom `(row + dr + height) % height` stops being merely wrong and
   * starts double-counting: on a 1-tall grid every `dr` maps back onto row 0, so the cell's own row
   * is visited three times and the centre cell itself twice.
   */
  it('a 1-tall strip sees at most 2 neighbours, and never itself', () => {
    const strip = filled(4, 1);

    expect(countNeighbors(strip, 0, 0, REF_A)).toEqual({ same: 1, other: 0 });
    expect(countNeighbors(strip, 1, 0, REF_A)).toEqual({ same: 2, other: 0 });
    expect(countNeighbors(strip, 3, 0, REF_A)).toEqual({ same: 1, other: 0 });
  });

  it('a 1-wide column sees at most 2 neighbours, and never itself', () => {
    const column = filled(1, 4);

    expect(countNeighbors(column, 0, 0, REF_A)).toEqual({ same: 1, other: 0 });
    expect(countNeighbors(column, 0, 2, REF_A)).toEqual({ same: 2, other: 0 });
    expect(countNeighbors(column, 0, 3, REF_A)).toEqual({ same: 1, other: 0 });
  });

  it('a 1x1 grid sees no neighbours at all', () => {
    expect(countNeighbors(filled(1, 1), 0, 0, REF_A)).toEqual({ same: 0, other: 0 });
  });

  /**
   * ⚠️ The wrap test proper (FR-5.9). Two living cells sit at opposite ends of one row. Under
   * toroidal edges they are adjacent and each would report a neighbour; under hard edges neither
   * sees the other. This is the shape that makes Story 3.6's glider-translation golden pass at some
   * grid sizes and fail at others when it is wrong.
   */
  it('opposite edges are NOT adjacent — no wrap on either axis', () => {
    const horizontal = gridFromDense(gridFromPattern(['A..A'], { '.': 0, A: 1 }));
    expect(countNeighbors(horizontal, 0, 0, REF_A)).toEqual({ same: 0, other: 0 });
    expect(countNeighbors(horizontal, 3, 0, REF_A)).toEqual({ same: 0, other: 0 });

    const vertical = gridFromDense(gridFromPattern(['A', '.', '.', 'A'], { '.': 0, A: 1 }));
    expect(countNeighbors(vertical, 0, 0, REF_A)).toEqual({ same: 0, other: 0 });
    expect(countNeighbors(vertical, 0, 3, REF_A)).toEqual({ same: 0, other: 0 });

    // ...and the diagonal corner-to-corner case, which a wrap on BOTH axes would make adjacent.
    const diagonal = gridFromDense(gridFromPattern(['A..', '...', '..A'], { '.': 0, A: 1 }));
    expect(countNeighbors(diagonal, 0, 0, REF_A)).toEqual({ same: 0, other: 0 });
    expect(countNeighbors(diagonal, 2, 2, REF_A)).toEqual({ same: 0, other: 0 });
  });

  /**
   * A hand-computed Conway blinker, the single-organism case the rest of the engine is pinned
   * against. The vertical blinker's centre has 2 same-neighbours (survive), each tip has 1 (die),
   * and the two cells that will be born flanking the centre have exactly 3.
   */
  it('reproduces the hand-computed counts of a Conway blinker', () => {
    const blinker = gridFromDense(gridFromPattern(['.A.', '.A.', '.A.'], { '.': 0, A: 1 }));

    expect(countNeighbors(blinker, 1, 1, REF_A)).toEqual({ same: 2, other: 0 });
    expect(countNeighbors(blinker, 1, 0, REF_A)).toEqual({ same: 1, other: 0 });
    expect(countNeighbors(blinker, 1, 2, REF_A)).toEqual({ same: 1, other: 0 });
    expect(countNeighbors(blinker, 0, 1, REF_A)).toEqual({ same: 3, other: 0 });
    expect(countNeighbors(blinker, 2, 1, REF_A)).toEqual({ same: 3, other: 0 });
  });
});
