import { emptyGrid, gridFromPattern, placePattern } from '@gol/test-utils';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clearGrid, createGrid, gridFromDense, gridToDense } from './grid';

// Grid dimensions are parameters, never constants (Decision A, AR-17). Every size below is
// deliberately NOT one of the two editable presets except where a case is about the presets, so
// nothing in this module can quietly grow a dependency on 50x30 / 100x60.

describe('createGrid', () => {
  it('allocates occupant and age at exactly width * height', () => {
    const grid = createGrid(5, 3);

    expect(grid.width).toBe(5);
    expect(grid.height).toBe(3);
    expect(grid.occupant).toBeInstanceOf(Uint8Array);
    expect(grid.age).toBeInstanceOf(Uint16Array);
    expect(grid.occupant.length).toBe(15);
    expect(grid.age.length).toBe(15);
  });

  it('is all empty and age zero', () => {
    const grid = createGrid(4, 4);

    expect(grid.occupant.every((cell) => cell === 0)).toBe(true);
    expect(grid.age.every((age) => age === 0)).toBe(true);
  });

  it('allocates a distinct pair of buffers on every call (never a shared or pooled one)', () => {
    const a = createGrid(3, 3);
    const b = createGrid(3, 3);

    expect(a.occupant).not.toBe(b.occupant);
    expect(a.age).not.toBe(b.age);
  });

  it('supports a zero-area grid without throwing', () => {
    const grid = createGrid(0, 0);

    expect(grid.occupant.length).toBe(0);
    expect(grid.age.length).toBe(0);
  });

  it('throws on a dimension a typed array would silently coerce', () => {
    // `new Uint8Array(2.5)` throws, but `2.5 * 4` is 10 — a fractional dimension produces a
    // plausible-looking grid whose width no longer divides its buffer, and every row-major index
    // computed from it lands on the wrong cell. Negatives and NaN fail the same way.
    expect(() => createGrid(2.5, 4)).toThrow(/width/);
    expect(() => createGrid(4, -1)).toThrow(/height/);
    expect(() => createGrid(Number.NaN, 4)).toThrow(/width/);
  });
});

describe('OrganismRef encoding (FD5)', () => {
  /**
   * ⚠️ The single highest-consequence convention in the engine, pinned here because it is
   * invisible until Story 3.6 produces silently wrong winners: `ref = roster index + 1`, and slot
   * 0 is reserved for "empty". This is what Epic 1 and Epic 2 already ship
   * (`apps/web/lib/canvas/refToFillGroup.ts`), what the persisted dense `gridState` means
   * (RFC-001), and what `BattleSchema` validates. The competing reading — ref = the bare index —
   * makes `organisms[0]` collide with occupant 0 = empty.
   */
  it('roster index 0 is ref 1, and occupant 0 means empty, not the first organism', () => {
    const rosterIds = ['organism-a', 'organism-b'];
    const dense = gridFromPattern(['.AB'], { '.': 0, A: 1, B: 2 });

    const grid = gridFromDense(dense);

    expect(grid.occupant[0]).toBe(0); // empty — NOT rosterIds[0]
    expect(grid.occupant[1]).toBe(1); // ref 1 -> rosterIds[0]
    expect(grid.occupant[2]).toBe(2); // ref 2 -> rosterIds[1]
    expect(rosterIds[grid.occupant[1] - 1]).toBe('organism-a');
    expect(rosterIds[grid.occupant[2] - 1]).toBe('organism-b');
  });

  it('the ref ceiling is 255, so a full roster of 255 organisms is representable', () => {
    const grid = gridFromDense([[255]]);

    expect(grid.occupant[0]).toBe(255);
  });
});

describe('gridFromDense', () => {
  it('reads a dense grid into row-major occupant, value-for-value', () => {
    const dense = gridFromPattern(['.X.', 'XXX', '.X.'], { '.': 0, X: 1 });

    const grid = gridFromDense(dense);

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(3);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        expect(grid.occupant[row * 3 + col]).toBe(dense[row][col]);
      }
    }
  });

  it('age is a zero-filled Uint16Array — an at-rest grid is age 0 everywhere', () => {
    const { age } = gridFromDense(gridFromPattern(['.X', 'X.'], { '.': 0, X: 1 }));

    expect(age).toBeInstanceOf(Uint16Array);
    expect(Array.from(age)).toEqual([0, 0, 0, 0]);
  });

  it('occupant is a Uint8Array of exactly width * height', () => {
    const { occupant } = gridFromDense(emptyGrid(5, 4));

    expect(occupant).toBeInstanceOf(Uint8Array);
    expect(occupant.length).toBe(20);
  });

  it('throws naming the row on a ragged input', () => {
    expect(() =>
      gridFromDense([
        [0, 0, 0],
        [0, 0],
        [0, 0, 0],
      ]),
    ).toThrow(/row 1/);
  });

  it('throws on a cell value a Uint8Array would silently wrap', () => {
    expect(() => gridFromDense([[0, 256]])).toThrow(/row 0, col 1/);
    expect(() => gridFromDense([[0, -1]])).toThrow(/0\.\.255/);
    expect(() => gridFromDense([[1.9]])).toThrow(/row 0, col 0/);
    expect(() => gridFromDense([[Number.NaN]])).toThrow(/0\.\.255/);
  });

  it('accepts the full legal cell range, 0 and 255 included', () => {
    expect(Array.from(gridFromDense([[0, 255]]).occupant)).toEqual([0, 255]);
  });

  it('a 0x0 grid produces empty buffers without throwing', () => {
    const grid = gridFromDense([]);

    expect(grid.width).toBe(0);
    expect(grid.height).toBe(0);
    expect(grid.occupant.length).toBe(0);
    expect(grid.age.length).toBe(0);
  });
});

describe('gridToDense', () => {
  it('reads occupant back out as rows', () => {
    const dense = gridFromPattern(['12', '34'], { '1': 1, '2': 2, '3': 3, '4': 4 });

    expect(gridToDense(gridFromDense(dense))).toEqual(dense);
  });

  it('drops age — the dense at-rest form carries occupancy only (Decision A.7)', () => {
    const grid = createGrid(2, 1);
    grid.occupant[0] = 7;
    grid.age[0] = 99;

    expect(gridToDense(grid)).toEqual([[7, 0]]);
  });

  it('a 0x0 grid produces an empty array', () => {
    expect(gridToDense(createGrid(0, 0))).toEqual([]);
  });

  it('returns independent rows — mutating one row cannot touch another', () => {
    const dense = gridToDense(createGrid(2, 2));
    dense[0][0] = 5;

    expect(dense[1][0]).toBe(0);
  });
});

describe('clearGrid', () => {
  it('keeps the CURRENT dimensions — Clear never resizes', () => {
    const grid = gridFromDense(placePattern(emptyGrid(5, 3), [[1, 1]], 0, 0));

    const cleared = clearGrid(grid);

    expect(cleared.width).toBe(5);
    expect(cleared.height).toBe(3);
    expect(cleared.occupant.every((cell) => cell === 0)).toBe(true);
    expect(cleared.age.every((age) => age === 0)).toBe(true);
  });

  it('returns a NEW wrapper and NEW buffers — the input is untouched', () => {
    const grid = gridFromDense([
      [1, 2],
      [3, 4],
    ]);
    const before = Uint8Array.from(grid.occupant);

    const cleared = clearGrid(grid);
    cleared.occupant[0] = 200;
    cleared.age[0] = 7;

    expect(grid.occupant).toEqual(before);
    expect(cleared).not.toBe(grid);
    expect(cleared.occupant).not.toBe(grid.occupant);
    expect(cleared.age).not.toBe(grid.age);
  });

  it('allocates from width * height, NOT from the input buffer lengths', () => {
    // Story 2.15's review case, carried down with the function: every other fixture builds
    // `occupant` at exactly `width * height`, so `new Uint8Array(grid.occupant.length)` passes all
    // of them and the allocation is never actually pinned to the DIMENSIONS.
    const overAllocated = {
      width: 3,
      height: 2,
      occupant: Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      age: Uint16Array.from([1, 1, 1, 1, 1, 1, 1, 1]),
    };

    const cleared = clearGrid(overAllocated);

    expect(cleared.occupant.length).toBe(6);
    expect(cleared.age.length).toBe(6);
  });

  it('clears both editable preset sizes (Decision A.2)', () => {
    expect(clearGrid(createGrid(50, 30)).occupant.length).toBe(1500);
    expect(clearGrid(createGrid(100, 60)).occupant.length).toBe(6000);
  });
});

describe('grid properties (fast-check)', () => {
  // AR-41's round-trip identity. FD7: the dense<->typed half only — the sparse `cells[]` wire form
  // does not exist until Story 5.3's WorkspaceSerializer builds it.
  const arbDense = fc
    .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }))
    .chain(([width, height]) =>
      fc.array(fc.array(fc.integer({ min: 0, max: 255 }), { minLength: width, maxLength: width }), {
        minLength: height,
        maxLength: height,
      }),
    );

  it('dense -> typed -> dense is the identity', () => {
    fc.assert(
      fc.property(arbDense, (dense) => {
        expect(gridToDense(gridFromDense(dense))).toEqual(dense);
      }),
    );
  });

  it('typed -> dense -> typed preserves occupant byte for byte', () => {
    fc.assert(
      fc.property(arbDense, (dense) => {
        const grid = gridFromDense(dense);
        const back = gridFromDense(gridToDense(grid));

        expect(Array.from(back.occupant)).toEqual(Array.from(grid.occupant));
        expect(back.width).toBe(grid.width);
        expect(back.height).toBe(grid.height);
      }),
    );
  });

  it('every constructed grid holds occupant.length === age.length === width * height (AC1)', () => {
    fc.assert(
      fc.property(arbDense, (dense) => {
        const grid = gridFromDense(dense);

        expect(grid.occupant.length).toBe(grid.width * grid.height);
        expect(grid.age.length).toBe(grid.width * grid.height);
      }),
    );
  });

  it('gridFromDense never aliases its input', () => {
    fc.assert(
      fc.property(arbDense, (dense) => {
        const grid = gridFromDense(dense);
        grid.occupant[0] = (grid.occupant[0] + 1) % 256;

        expect(dense[0][0]).toBe(gridFromDense(dense).occupant[0]);
      }),
    );
  });
});
