import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CELL_STATES,
  CONDITION_PROPERTIES,
  ConditionSchema,
  NUMERIC_CONDITION_PROPERTIES,
  NUMERIC_OPERATORS,
  type Condition,
} from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import {
  appendCondition,
  cellStateLabel,
  type ConditionDraft,
  conditionDraftFrom,
  conditionFromDraft,
  conditionPropertyLabel,
  createNewConditionDraft,
  defaultConditionFor,
  isCellState,
  isConditionProperty,
  isNumericConditionProperty,
  isNumericOperator,
  MAX_AGE_LITERAL,
  MAX_NEIGHBOR_COUNT,
  MIN_LESS_THAN_MAX,
  MIN_NUMERIC_LITERAL,
  numericBoundsFor,
  operatorLabel,
  operatorsFor,
  ORGANISM_REQUIRED,
  parseConditionDraft,
  removeCondition,
  replaceCondition,
  validateConditionDraft,
  withOperator,
} from './conditionDraft';

describe('label functions', () => {
  it('conditionPropertyLabel covers every CONDITION_PROPERTIES member with a non-empty, distinct string', () => {
    const labels = CONDITION_PROPERTIES.map(conditionPropertyLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('operatorLabel covers every NUMERIC_OPERATORS member with a non-empty, distinct string', () => {
    const labels = NUMERIC_OPERATORS.map(operatorLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('cellStateLabel covers every CELL_STATES member with a non-empty, distinct string', () => {
    const labels = CELL_STATES.map(cellStateLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // PRD-copy strings, pinned exactly (FR-2.5, FD2).
  it('cellStateLabel is the PRD copy exactly', () => {
    expect(cellStateLabel('empty')).toBe('Empty');
    expect(cellStateLabel('alive')).toBe('Alive (your organism)');
    expect(cellStateLabel('occupied')).toBe('Occupied (another organism)');
  });
});

describe('operatorsFor', () => {
  it('is exactly [eq] for the two singleton properties', () => {
    expect(operatorsFor('cellState')).toEqual(['eq']);
    expect(operatorsFor('organismType')).toEqual(['eq']);
  });

  it('is NUMERIC_OPERATORS (the same reference) for every numeric property', () => {
    for (const property of NUMERIC_CONDITION_PROPERTIES) {
      expect(operatorsFor(property)).toBe(NUMERIC_OPERATORS);
    }
  });
});

describe('numericBoundsFor', () => {
  it('is {0, 8} for both neighbour-count properties', () => {
    expect(numericBoundsFor('neighborCount')).toEqual({ min: 0, max: MAX_NEIGHBOR_COUNT });
    expect(numericBoundsFor('occupantNeighborCount')).toEqual({ min: 0, max: MAX_NEIGHBOR_COUNT });
    expect(MAX_NEIGHBOR_COUNT).toBe(8);
  });

  it('is {0, 999} for age', () => {
    expect(numericBoundsFor('age')).toEqual({ min: 0, max: MAX_AGE_LITERAL });
    expect(MAX_AGE_LITERAL).toBe(999);
    expect(MIN_NUMERIC_LITERAL).toBe(0);
  });
});

describe('guards', () => {
  it('isConditionProperty is true for every member, false for junk and a wrong-case value', () => {
    for (const property of CONDITION_PROPERTIES) expect(isConditionProperty(property)).toBe(true);
    expect(isConditionProperty('')).toBe(false);
    expect(isConditionProperty('CellState')).toBe(false);
    expect(isConditionProperty('neighborcount')).toBe(false);
  });

  it('isNumericConditionProperty is true for every numeric member, false for a singleton', () => {
    for (const property of NUMERIC_CONDITION_PROPERTIES) {
      expect(isNumericConditionProperty(property)).toBe(true);
    }
    expect(isNumericConditionProperty('')).toBe(false);
    expect(isNumericConditionProperty('cellState')).toBe(false);
    expect(isNumericConditionProperty('Age')).toBe(false);
  });

  it('isNumericOperator is true for every member, false for junk', () => {
    for (const operator of NUMERIC_OPERATORS) expect(isNumericOperator(operator)).toBe(true);
    expect(isNumericOperator('')).toBe(false);
    expect(isNumericOperator('EQ')).toBe(false);
    expect(isNumericOperator('cellState')).toBe(false);
  });

  it('isCellState is true for every member, false for junk', () => {
    for (const state of CELL_STATES) expect(isCellState(state)).toBe(true);
    expect(isCellState('')).toBe(false);
    expect(isCellState('Empty')).toBe(false);
    expect(isCellState('neighborCount')).toBe(false);
  });
});

describe('createNewConditionDraft', () => {
  it('builds a cellState/eq/empty draft from the given id', () => {
    expect(createNewConditionDraft('x')).toEqual({
      id: 'x',
      property: 'cellState',
      operator: 'eq',
      pattern: 'empty',
    });
  });
});

describe('defaultConditionFor', () => {
  it('cellState -> eq/empty', () => {
    expect(defaultConditionFor('c1', 'cellState', 'org-1')).toEqual({
      id: 'c1',
      property: 'cellState',
      operator: 'eq',
      pattern: 'empty',
    });
  });

  it('organismType -> eq/defaultOrganismId', () => {
    expect(defaultConditionFor('c1', 'organismType', 'org-1')).toEqual({
      id: 'c1',
      property: 'organismType',
      operator: 'eq',
      pattern: 'org-1',
    });
    expect(defaultConditionFor('c1', 'organismType', '')).toEqual({
      id: 'c1',
      property: 'organismType',
      operator: 'eq',
      pattern: '',
    });
  });

  it.each(NUMERIC_CONDITION_PROPERTIES)('%s -> eq/empty text', (property) => {
    expect(defaultConditionFor('c1', property, 'org-1')).toEqual({
      id: 'c1',
      property,
      operator: 'eq',
      pattern: '',
    });
  });
});

describe('withOperator', () => {
  it('scalar to scalar keeps the pattern', () => {
    const draft: ConditionDraft = { id: 'c1', property: 'age', operator: 'eq', pattern: '3' };
    expect(withOperator(draft, 'gt')).toEqual({
      id: 'c1',
      property: 'age',
      operator: 'gt',
      pattern: '3',
    });
  });

  it('scalar to range resets the pattern to a fresh pair', () => {
    const draft: ConditionDraft = { id: 'c1', property: 'age', operator: 'eq', pattern: '3' };
    expect(withOperator(draft, 'range')).toEqual({
      id: 'c1',
      property: 'age',
      operator: 'range',
      pattern: ['', ''],
    });
  });

  it('range to scalar resets the pattern to empty text', () => {
    const draft: ConditionDraft = {
      id: 'c1',
      property: 'age',
      operator: 'range',
      pattern: ['1', '2'],
    };
    expect(withOperator(draft, 'lte')).toEqual({
      id: 'c1',
      property: 'age',
      operator: 'lte',
      pattern: '',
    });
  });

  it('same-operator returns the SAME object', () => {
    const draft: ConditionDraft = { id: 'c1', property: 'age', operator: 'eq', pattern: '3' };
    expect(withOperator(draft, 'eq')).toBe(draft);
  });
});

describe('list helpers', () => {
  const A: ConditionDraft = { id: 'a', property: 'cellState', operator: 'eq', pattern: 'empty' };
  const B: ConditionDraft = { id: 'b', property: 'cellState', operator: 'eq', pattern: 'alive' };

  it('appendCondition puts the new condition last, in a new array', () => {
    const conditions = [A];
    const next = appendCondition(conditions, B);
    expect(next).not.toBe(conditions);
    expect(next).toEqual([A, B]);
  });

  it('removeCondition removes by id, preserving order, and returns the same reference for an unknown id', () => {
    const conditions = [A, B];
    expect(removeCondition(conditions, 'a')).toEqual([B]);
    expect(removeCondition(conditions, 'nope')).toBe(conditions);
  });

  it('replaceCondition replaces by id, keeps others by reference, and returns the same reference for an unknown id', () => {
    const conditions = [A, B];
    const replacement: ConditionDraft = { ...A, pattern: 'occupied' };
    const next = replaceCondition(conditions, replacement);
    expect(next[0]).toBe(replacement);
    expect(next[1]).toBe(B);
    expect(replaceCondition(conditions, { ...replacement, id: 'nope' })).toBe(conditions);
  });

  // The `withOperator` same-operator object, handed back unchanged, must not allocate — that is
  // what lets `updateRuleConditions`' no-op guard trip.
  it('replaceCondition returns the same reference when the slot already holds that object', () => {
    const conditions = [A, B];
    expect(replaceCondition(conditions, A)).toBe(conditions);
  });
});

describe('parseConditionDraft / validateConditionDraft / conditionFromDraft', () => {
  it('scalar numeric text parses, trims, and rejects junk / out-of-bounds', () => {
    const draftWith = (pattern: string): ConditionDraft => ({
      id: 'c1',
      property: 'neighborCount',
      operator: 'eq',
      pattern,
    });

    expect(conditionFromDraft(draftWith('3'))).toEqual({
      property: 'neighborCount',
      operator: 'eq',
      pattern: 3,
    });
    expect(conditionFromDraft(draftWith(' 3 '))).toEqual({
      property: 'neighborCount',
      operator: 'eq',
      pattern: 3,
    });
    for (const bad of ['', 'x', '1.5', '-1', '9']) {
      expect(validateConditionDraft(draftWith(bad))).toEqual({
        field: 'value',
        message: 'Enter a whole number from 0 to 8',
      });
    }
    expect(validateConditionDraft(draftWith('8'))).toBeNull();

    const ageDraft: ConditionDraft = { id: 'c2', property: 'age', operator: 'eq', pattern: '1000' };
    expect(validateConditionDraft(ageDraft)).toEqual({
      field: 'value',
      message: 'Enter a whole number from 0 to 999',
    });
    expect(validateConditionDraft({ ...ageDraft, pattern: '999' })).toBeNull();
  });

  it('range parses min then max then the pair, in order', () => {
    const rangeWith = (min: string, max: string): ConditionDraft => ({
      id: 'c1',
      property: 'neighborCount',
      operator: 'range',
      pattern: [min, max],
    });

    expect(conditionFromDraft(rangeWith('2', '3'))).toEqual({
      property: 'neighborCount',
      operator: 'range',
      pattern: [2, 3],
    });
    expect(validateConditionDraft(rangeWith('x', '3'))?.field).toBe('min');
    expect(validateConditionDraft(rangeWith('2', 'x'))?.field).toBe('max');
    expect(validateConditionDraft(rangeWith('3', '3'))).toEqual({
      field: 'pair',
      message: MIN_LESS_THAN_MAX,
    });
    expect(validateConditionDraft(rangeWith('4', '3'))).toEqual({
      field: 'pair',
      message: MIN_LESS_THAN_MAX,
    });
  });

  it('cellState is always valid, and builds the literal condition', () => {
    const draft: ConditionDraft = {
      id: 'c1',
      property: 'cellState',
      operator: 'eq',
      pattern: 'occupied',
    };
    expect(validateConditionDraft(draft)).toBeNull();
    expect(conditionFromDraft(draft)).toEqual({
      property: 'cellState',
      operator: 'eq',
      pattern: 'occupied',
    });
  });

  it('organismType requires a non-empty pattern', () => {
    expect(
      conditionFromDraft({ id: 'c1', property: 'organismType', operator: 'eq', pattern: 'org-1' }),
    ).toEqual({ property: 'organismType', operator: 'eq', pattern: 'org-1' });
    expect(
      validateConditionDraft({ id: 'c1', property: 'organismType', operator: 'eq', pattern: '' }),
    ).toEqual({ field: 'value', message: ORGANISM_REQUIRED });
  });

  it('validate is null exactly when conditionFromDraft is non-null', () => {
    const drafts: ConditionDraft[] = [
      { id: 'c1', property: 'cellState', operator: 'eq', pattern: 'empty' },
      { id: 'c2', property: 'organismType', operator: 'eq', pattern: '' },
      { id: 'c3', property: 'age', operator: 'eq', pattern: '5' },
      { id: 'c4', property: 'age', operator: 'eq', pattern: 'x' },
      { id: 'c5', property: 'age', operator: 'range', pattern: ['1', '2'] },
      { id: 'c6', property: 'age', operator: 'range', pattern: ['2', '1'] },
    ];
    for (const draft of drafts) {
      expect(validateConditionDraft(draft) === null).toBe(conditionFromDraft(draft) !== null);
    }
  });
});

// The four draft shapes as a fast-check arbitrary.
const scalarProperty = fc.constantFrom(...NUMERIC_CONDITION_PROPERTIES);
const numericText = fc.oneof(
  fc.nat({ max: 20 }).map(String),
  fc.string(),
  fc.constant(''),
  fc.integer({ min: -5, max: -1 }).map(String),
  fc.double().map(String),
);
const draftArbitrary: fc.Arbitrary<ConditionDraft> = fc.oneof(
  fc.constantFrom(...CELL_STATES).map((pattern): ConditionDraft => ({
    id: 'fc',
    property: 'cellState',
    operator: 'eq',
    pattern,
  })),
  fc.string().map((pattern): ConditionDraft => ({
    id: 'fc',
    property: 'organismType',
    operator: 'eq',
    pattern,
  })),
  fc
    .record({ property: scalarProperty, pattern: numericText })
    .map(({ property, pattern }): ConditionDraft => ({
      id: 'fc',
      property,
      operator: 'eq',
      pattern,
    })),
  fc
    .record({ property: scalarProperty, min: numericText, max: numericText })
    .map(({ property, min, max }): ConditionDraft => ({
      id: 'fc',
      property,
      operator: 'range',
      pattern: [min, max],
    })),
);

describe('fast-check: validity agrees with conditionFromDraft, and every built condition parses', () => {
  it('validateConditionDraft is null iff conditionFromDraft is non-null, and the result parses with no id', () => {
    fc.assert(
      fc.property(draftArbitrary, (draft) => {
        const valid = validateConditionDraft(draft) === null;
        const condition = conditionFromDraft(draft);
        expect(valid).toBe(condition !== null);
        if (condition !== null) {
          expect(ConditionSchema.safeParse(condition).success).toBe(true);
          expect('id' in condition).toBe(false);
        }
      }),
    );
  });
});

describe('round trip', () => {
  const allConditions: Condition[] = [
    ...CONWAYS_CLASSIC.survivalRules.flatMap((rule) => rule.conditions),
    ...createMockOrganisms().flatMap((organism) =>
      organism.survivalRules.flatMap((rule) => rule.conditions),
    ),
  ];

  it('conditionFromDraft(conditionDraftFrom(c, id)) equals c for every fixture condition', () => {
    for (const condition of allConditions) {
      expect(conditionFromDraft(conditionDraftFrom(condition, 'k'))).toEqual(condition);
    }
  });

  it('fast-check: every schema-valid condition within the editor bounds round-trips', () => {
    // Literals are drawn from EACH property's own bounds (age reaches 999, the neighbour counts
    // 8), so the editor cap itself is on the path — not only the 0..8 slice they share.
    const editorValidCondition: fc.Arbitrary<Condition> = fc.oneof(
      fc
        .constantFrom(...CELL_STATES)
        .map((pattern): Condition => ({ property: 'cellState', operator: 'eq', pattern })),
      fc
        .string({ minLength: 1 })
        .map((pattern): Condition => ({ property: 'organismType', operator: 'eq', pattern })),
      scalarProperty.chain((property) => {
        const { min, max } = numericBoundsFor(property);
        return fc
          .record({
            operator: fc.constantFrom(...NUMERIC_OPERATORS.filter((o) => o !== 'range')),
            pattern: fc.integer({ min, max }),
          })
          .map(({ operator, pattern }): Condition => ({ property, operator, pattern }));
      }),
      scalarProperty.chain((property) => {
        const { min, max } = numericBoundsFor(property);
        return fc
          .integer({ min, max: max - 1 })
          .chain((lo) =>
            fc
              .integer({ min: lo + 1, max })
              .map((hi): Condition => ({ property, operator: 'range', pattern: [lo, hi] })),
          );
      }),
    );

    fc.assert(
      fc.property(editorValidCondition, (condition) => {
        expect(conditionFromDraft(conditionDraftFrom(condition, 'k'))).toEqual(condition);
      }),
    );
  });
});

// Confirms parseConditionDraft's discriminated result shape directly, once, for the "one parse"
// claim in the header comment (the other tests above go through the two derived views).
describe('parseConditionDraft', () => {
  it('returns { ok: true, condition } or { ok: false, error }', () => {
    const ok = parseConditionDraft({
      id: 'c1',
      property: 'cellState',
      operator: 'eq',
      pattern: 'empty',
    });
    expect(ok).toEqual({
      ok: true,
      condition: { property: 'cellState', operator: 'eq', pattern: 'empty' },
    });

    const bad = parseConditionDraft({
      id: 'c1',
      property: 'organismType',
      operator: 'eq',
      pattern: '',
    });
    expect(bad).toEqual({ ok: false, error: { field: 'value', message: ORGANISM_REQUIRED } });
  });
});
