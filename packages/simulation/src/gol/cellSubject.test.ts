// The property x operand matrix (AC6; Trap 4). Story 1.3's ConditionSchema is a DISCRIMINATED
// UNION, not a bare 5-property x 6-operator cartesian product: `cellState` admits only `eq` over
// its three values, `organismType` admits only `eq`, and the three numeric properties admit all
// six operators (a scalar, or `range` with a [min,max] tuple). This suite covers all 20 LEGAL
// combinations in both directions, so a predicate stuck at `true` cannot pass silently — plus two
// deliberate exceptions that assert what is NOT legal or NOT yet reachable: the Trap 1 library-id
// case below, and the frozen-dictionary guard. Subjects are hand-built CellSubject literals; no
// grid (RFC-004 §3.5).
import { describe, expect, it } from 'vitest';

import { conditionIsSatisfiedBy } from '../engine/firstSatisfiedBy';
import type { Condition } from '../engine/rule';
import { cellSelectors } from './cellSubject';
import type { CellProperty, CellState, CellSubject } from './cellSubject';

const cell = (overrides: Partial<CellSubject> = {}): CellSubject => ({
  state: 'empty',
  organismType: null,
  age: 0,
  neighborCount: 0,
  occupantNeighborCount: 0,
  ...overrides,
});

const holds = (condition: Condition<CellProperty>, subject: CellSubject) =>
  conditionIsSatisfiedBy(condition, subject, cellSelectors);

describe('cellSelectors — one row per CellProperty (AC2)', () => {
  it('resolves each property through its own selector, not a different field', () => {
    const subject = cell({
      state: 'alive',
      organismType: 3,
      age: 5,
      neighborCount: 2,
      occupantNeighborCount: 1,
    });
    expect(cellSelectors.cellState(subject)).toBe('alive');
    expect(cellSelectors.organismType(subject)).toBe(3);
    expect(cellSelectors.age(subject)).toBe(5);
    expect(cellSelectors.neighborCount(subject)).toBe(2);
    expect(cellSelectors.occupantNeighborCount(subject)).toBe(1);
  });

  // Task 3's mutation check ("delete one row, confirm the build fails, restore it") was performed
  // by hand during development (recorded in the Dev Agent Record) because `Selectors<CellSubject,
  // CellProperty>` turns an omitted row into a COMPILE error, not a runtime one — there is nothing
  // for a test to observe once the row exists. This test instead pins the five keys the dictionary
  // must keep, so a future edit that silently drops one fails HERE at test time too.
  it('covers exactly the five CellProperty keys — no more, no fewer', () => {
    const expectedKeys: CellProperty[] = [
      'cellState',
      'organismType',
      'age',
      'neighborCount',
      'occupantNeighborCount',
    ];
    expect(Object.keys(cellSelectors).sort()).toEqual([...expectedKeys].sort());
  });

  // The dictionary is exported from @gol/simulation's barrel, and `Readonly<…>` is erased at
  // runtime. Frozen so a consumer cannot assign over a row and corrupt every other reader for the
  // process lifetime — the same protection @gol/domain gives DEFAULT_SETTINGS / CONWAYS_CLASSIC.
  it('is frozen — a compile-time Readonly<> claim is erased at runtime', () => {
    expect(Object.isFrozen(cellSelectors)).toBe(true);
  });

  // The empty-cell contract Story 3.3 has to honour when it materializes CellSubjects from the
  // grid. `null` and `undefined` are indistinguishable through every `eq` test above (both are
  // !== any numeric ref), so without this assertion 3.3 could ship `undefined` and no test would
  // fail — while `organismType eq null` would flip from matching every empty cell to none.
  it('yields exactly null — never undefined — for an empty cell', () => {
    expect(cellSelectors.organismType(cell())).toBeNull();
    expect(cellSelectors.organismType(cell())).not.toBeUndefined();
  });
});

describe('cellState — eq only, three-valued', () => {
  const eqState = (pattern: CellState): Condition<CellProperty> => ({
    property: 'cellState',
    operator: 'eq',
    pattern,
  });

  it('matches each of the three values and no other', () => {
    expect(holds(eqState('empty'), cell({ state: 'empty' }))).toBe(true);
    expect(holds(eqState('empty'), cell({ state: 'alive' }))).toBe(false);
    expect(holds(eqState('empty'), cell({ state: 'occupied' }))).toBe(false);

    expect(holds(eqState('alive'), cell({ state: 'alive' }))).toBe(true);
    expect(holds(eqState('alive'), cell({ state: 'empty' }))).toBe(false);
    expect(holds(eqState('alive'), cell({ state: 'occupied' }))).toBe(false);

    expect(holds(eqState('occupied'), cell({ state: 'occupied' }))).toBe(true);
    expect(holds(eqState('occupied'), cell({ state: 'empty' }))).toBe(false);
    expect(holds(eqState('occupied'), cell({ state: 'alive' }))).toBe(false);
  });
});

// The single behaviour Decision C exists for (RFC-004 §2.1.1) — asserted as a test, not left as a
// comment. Nothing else in the codebase pins this yet.
describe('cellState is RELATIVE to the evaluating organism (Decision C.1)', () => {
  it('the same physical cell reads "alive" for its own organism and "occupied" for another', () => {
    // One physical cell, two evaluations: the caller (Stories 3.5/3.6) is what decides which
    // CellSubject.state a given organism's evaluation sees for the same grid cell. This layer only
    // has to get the resulting comparison right, which is what is pinned here.
    const ownOrganismsEvaluation = cell({ state: 'alive' });
    const otherOrganismsEvaluation = cell({ state: 'occupied' });

    expect(
      holds({ property: 'cellState', operator: 'eq', pattern: 'alive' }, ownOrganismsEvaluation),
    ).toBe(true);
    expect(
      holds({ property: 'cellState', operator: 'eq', pattern: 'alive' }, otherOrganismsEvaluation),
    ).toBe(false);
    expect(
      holds(
        { property: 'cellState', operator: 'eq', pattern: 'occupied' },
        otherOrganismsEvaluation,
      ),
    ).toBe(true);
    expect(
      holds({ property: 'cellState', operator: 'eq', pattern: 'occupied' }, ownOrganismsEvaluation),
    ).toBe(false);
  });
});

describe('organismType — eq only, numeric OrganismRef pattern (post-interning shape)', () => {
  it('matches the same numeric ref and no other', () => {
    expect(
      holds({ property: 'organismType', operator: 'eq', pattern: 3 }, cell({ organismType: 3 })),
    ).toBe(true);
    expect(
      holds({ property: 'organismType', operator: 'eq', pattern: 3 }, cell({ organismType: 4 })),
    ).toBe(false);
  });

  it('never matches an empty cell, whose organismType is null', () => {
    expect(
      holds({ property: 'organismType', operator: 'eq', pattern: 0 }, cell({ organismType: null })),
    ).toBe(false);
  });

  // Trap 1, pinned rather than "fixed": a persisted organismType pattern is the target's stable
  // LIBRARY ID — a string (Decision E, @gol/domain's OrganismTypeCondition) — while
  // CellSubject.organismType is a numeric OrganismRef. `eq` is `===`, so a raw library-id pattern
  // matches nothing at THIS layer; that is correct, not a bug. The string -> ref translation
  // happens in ../session/compileEvaluators.ts (Decision E.3), never per cell here — and its
  // counterpart assertion, the same rule matching AFTER interning, lives in
  // ../session/compileEvaluators.test.ts ("a raw library-id string DOES match once interned").
  it('a raw library-id (string) pattern never matches at this layer — the session interns it', () => {
    expect(
      holds(
        { property: 'organismType', operator: 'eq', pattern: 'conways-classic' },
        cell({ organismType: 0 }),
      ),
    ).toBe(false);
  });
});

describe('age — all six operators, both directions', () => {
  const withAge = (age: number) => cell({ age });

  it('eq', () => {
    expect(holds({ property: 'age', operator: 'eq', pattern: 5 }, withAge(5))).toBe(true);
    expect(holds({ property: 'age', operator: 'eq', pattern: 5 }, withAge(6))).toBe(false);
  });
  it('gt is strict', () => {
    expect(holds({ property: 'age', operator: 'gt', pattern: 5 }, withAge(6))).toBe(true);
    expect(holds({ property: 'age', operator: 'gt', pattern: 5 }, withAge(5))).toBe(false);
  });
  it('lt is strict', () => {
    expect(holds({ property: 'age', operator: 'lt', pattern: 5 }, withAge(4))).toBe(true);
    expect(holds({ property: 'age', operator: 'lt', pattern: 5 }, withAge(5))).toBe(false);
  });
  it('gte admits the boundary', () => {
    expect(holds({ property: 'age', operator: 'gte', pattern: 5 }, withAge(5))).toBe(true);
    expect(holds({ property: 'age', operator: 'gte', pattern: 5 }, withAge(4))).toBe(false);
  });
  it('lte admits the boundary', () => {
    expect(holds({ property: 'age', operator: 'lte', pattern: 5 }, withAge(5))).toBe(true);
    expect(holds({ property: 'age', operator: 'lte', pattern: 5 }, withAge(6))).toBe(false);
  });
  // Inclusive at BOTH bounds (Trap 5) — lo, hi, lo-1, hi+1, each direction.
  it('range is inclusive at both bounds', () => {
    const condition: Condition<CellProperty> = {
      property: 'age',
      operator: 'range',
      pattern: [2, 4],
    };
    expect(holds(condition, withAge(2))).toBe(true); // lo
    expect(holds(condition, withAge(4))).toBe(true); // hi
    expect(holds(condition, withAge(1))).toBe(false); // lo - 1
    expect(holds(condition, withAge(5))).toBe(false); // hi + 1
  });
});

describe('neighborCount — all six operators, both directions', () => {
  const withNeighborCount = (neighborCount: number) => cell({ neighborCount });

  it('eq', () => {
    expect(
      holds({ property: 'neighborCount', operator: 'eq', pattern: 3 }, withNeighborCount(3)),
    ).toBe(true);
    expect(
      holds({ property: 'neighborCount', operator: 'eq', pattern: 3 }, withNeighborCount(2)),
    ).toBe(false);
  });
  it('gt is strict', () => {
    expect(
      holds({ property: 'neighborCount', operator: 'gt', pattern: 3 }, withNeighborCount(4)),
    ).toBe(true);
    expect(
      holds({ property: 'neighborCount', operator: 'gt', pattern: 3 }, withNeighborCount(3)),
    ).toBe(false);
  });
  it('lt is strict', () => {
    expect(
      holds({ property: 'neighborCount', operator: 'lt', pattern: 3 }, withNeighborCount(2)),
    ).toBe(true);
    expect(
      holds({ property: 'neighborCount', operator: 'lt', pattern: 3 }, withNeighborCount(3)),
    ).toBe(false);
  });
  it('gte admits the boundary', () => {
    expect(
      holds({ property: 'neighborCount', operator: 'gte', pattern: 3 }, withNeighborCount(3)),
    ).toBe(true);
    expect(
      holds({ property: 'neighborCount', operator: 'gte', pattern: 3 }, withNeighborCount(2)),
    ).toBe(false);
  });
  it('lte admits the boundary', () => {
    expect(
      holds({ property: 'neighborCount', operator: 'lte', pattern: 3 }, withNeighborCount(3)),
    ).toBe(true);
    expect(
      holds({ property: 'neighborCount', operator: 'lte', pattern: 3 }, withNeighborCount(4)),
    ).toBe(false);
  });
  // Conway's Classic's own survive rule (RFC-004 §2.4) — inclusive at both bounds, exactly the
  // shape that would silently drop "3" if the upper bound were ever misread as exclusive (Trap 5).
  it('range is inclusive at both bounds', () => {
    const condition: Condition<CellProperty> = {
      property: 'neighborCount',
      operator: 'range',
      pattern: [2, 3],
    };
    expect(holds(condition, withNeighborCount(2))).toBe(true); // lo
    expect(holds(condition, withNeighborCount(3))).toBe(true); // hi
    expect(holds(condition, withNeighborCount(1))).toBe(false); // lo - 1
    expect(holds(condition, withNeighborCount(4))).toBe(false); // hi + 1
  });

  // The DEGENERATE range [n, n] — legal under NumericCondition's `min <= max` refine, and the one
  // input that separates `>= && <=` from any strict-comparison regression: every other fixture
  // here has width >= 1 and would still pass if a single bound were made exclusive.
  it('range [n, n] matches exactly n (Trap 5, tightest bound)', () => {
    const condition: Condition<CellProperty> = {
      property: 'neighborCount',
      operator: 'range',
      pattern: [3, 3],
    };
    expect(holds(condition, withNeighborCount(3))).toBe(true);
    expect(holds(condition, withNeighborCount(2))).toBe(false);
    expect(holds(condition, withNeighborCount(4))).toBe(false);
  });
});

describe('occupantNeighborCount — all six operators, both directions', () => {
  const withOccupantNeighborCount = (occupantNeighborCount: number) =>
    cell({ occupantNeighborCount });

  it('eq', () => {
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'eq', pattern: 1 },
        withOccupantNeighborCount(1),
      ),
    ).toBe(true);
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'eq', pattern: 1 },
        withOccupantNeighborCount(0),
      ),
    ).toBe(false);
  });
  it('gt is strict', () => {
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'gt', pattern: 1 },
        withOccupantNeighborCount(2),
      ),
    ).toBe(true);
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'gt', pattern: 1 },
        withOccupantNeighborCount(1),
      ),
    ).toBe(false);
  });
  it('lt is strict', () => {
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'lt', pattern: 1 },
        withOccupantNeighborCount(0),
      ),
    ).toBe(true);
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'lt', pattern: 1 },
        withOccupantNeighborCount(1),
      ),
    ).toBe(false);
  });
  it('gte admits the boundary', () => {
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'gte', pattern: 1 },
        withOccupantNeighborCount(1),
      ),
    ).toBe(true);
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'gte', pattern: 1 },
        withOccupantNeighborCount(0),
      ),
    ).toBe(false);
  });
  it('lte admits the boundary', () => {
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'lte', pattern: 1 },
        withOccupantNeighborCount(1),
      ),
    ).toBe(true);
    expect(
      holds(
        { property: 'occupantNeighborCount', operator: 'lte', pattern: 1 },
        withOccupantNeighborCount(2),
      ),
    ).toBe(false);
  });
  it('range is inclusive at both bounds', () => {
    const condition: Condition<CellProperty> = {
      property: 'occupantNeighborCount',
      operator: 'range',
      pattern: [1, 2],
    };
    expect(holds(condition, withOccupantNeighborCount(1))).toBe(true); // lo
    expect(holds(condition, withOccupantNeighborCount(2))).toBe(true); // hi
    expect(holds(condition, withOccupantNeighborCount(0))).toBe(false); // lo - 1
    expect(holds(condition, withOccupantNeighborCount(3))).toBe(false); // hi + 1
  });
});
