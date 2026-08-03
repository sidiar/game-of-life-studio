import { describe, expect, it } from 'vitest';
import { ConditionSchema, SurvivalRuleSchema, SurvivalRulesSchema } from './survivalRuleSchema';

const validPayload = {
  summary: 'Born on an empty cell with exactly 3 neighbors',
  action: 'born' as const,
};

describe('ConditionSchema', () => {
  it('accepts a valid cellState condition', () => {
    const result = ConditionSchema.safeParse({
      property: 'cellState',
      operator: 'eq',
      pattern: 'alive',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid organismType condition (library id string)', () => {
    const result = ConditionSchema.safeParse({
      property: 'organismType',
      operator: 'eq',
      pattern: 'conways-classic',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid age condition with a scalar pattern', () => {
    const result = ConditionSchema.safeParse({ property: 'age', operator: 'gte', pattern: 5 });
    expect(result.success).toBe(true);
  });

  it('accepts a valid neighborCount condition with a scalar pattern', () => {
    const result = ConditionSchema.safeParse({
      property: 'neighborCount',
      operator: 'eq',
      pattern: 3,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid occupantNeighborCount condition with a range pattern', () => {
    const result = ConditionSchema.safeParse({
      property: 'occupantNeighborCount',
      operator: 'range',
      pattern: [2, 3],
    });
    expect(result.success).toBe(true);
  });

  // AC2 requires all six operands; eq/gte/range are covered above.
  it.each(['gt', 'lt', 'lte'])('accepts the `%s` scalar operator', (operator) => {
    const result = ConditionSchema.safeParse({ property: 'age', operator, pattern: 4 });
    expect(result.success).toBe(true);
  });

  it('accepts a degenerate single-value range', () => {
    const result = ConditionSchema.safeParse({
      property: 'neighborCount',
      operator: 'range',
      pattern: [3, 3],
    });
    expect(result.success).toBe(true);
  });

  // An inverted tuple is satisfiable by no value, so the rule silently never fires.
  it('rejects a range whose min exceeds its max', () => {
    const result = ConditionSchema.safeParse({
      property: 'age',
      operator: 'range',
      pattern: [3, 2],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty organismType pattern', () => {
    const result = ConditionSchema.safeParse({
      property: 'organismType',
      operator: 'eq',
      pattern: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an age literal above 65534', () => {
    const result = ConditionSchema.safeParse({ property: 'age', operator: 'eq', pattern: 65535 });
    expect(result.success).toBe(false);
  });

  it('rejects a neighborCount literal above 65534', () => {
    const result = ConditionSchema.safeParse({
      property: 'neighborCount',
      operator: 'eq',
      pattern: 65535,
    });
    expect(result.success).toBe(false);
  });

  it('rejects `range` given a scalar pattern', () => {
    const result = ConditionSchema.safeParse({ property: 'age', operator: 'range', pattern: 5 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-range operator given a tuple pattern', () => {
    const result = ConditionSchema.safeParse({ property: 'age', operator: 'eq', pattern: [1, 2] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown property', () => {
    const result = ConditionSchema.safeParse({
      property: 'unknownProp',
      operator: 'eq',
      pattern: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown operator', () => {
    const result = ConditionSchema.safeParse({ property: 'age', operator: 'nope', pattern: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown cellState pattern value', () => {
    const result = ConditionSchema.safeParse({
      property: 'cellState',
      operator: 'eq',
      pattern: 'ghost',
    });
    expect(result.success).toBe(false);
  });
});

describe('SurvivalRuleSchema', () => {
  it('accepts a valid rule fixture', () => {
    const result = SurvivalRuleSchema.safeParse({
      id: 'test-rule-1',
      contentHash: 'test-hash-1',
      conditions: [
        { property: 'cellState', operator: 'eq', pattern: 'empty' },
        { property: 'neighborCount', operator: 'eq', pattern: 3 },
      ],
      payload: validPayload,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty conditions array', () => {
    const result = SurvivalRuleSchema.safeParse({
      id: 'test-rule-1',
      contentHash: 'test-hash-1',
      conditions: [],
      payload: validPayload,
    });
    expect(result.success).toBe(false);
  });

  // The Decision E.4 evaluator cache is keyed on contentHash — an empty one collides across
  // every rule in the workspace and returns the wrong compiled closure.
  it.each(['id', 'contentHash'])('rejects an empty %s', (field) => {
    const result = SurvivalRuleSchema.safeParse({
      id: 'test-rule-1',
      contentHash: 'test-hash-1',
      [field]: '',
      conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
      payload: validPayload,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload summary over 120 characters', () => {
    const result = SurvivalRuleSchema.safeParse({
      id: 'test-rule-1',
      contentHash: 'test-hash-1',
      conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
      payload: { summary: 'x'.repeat(121), action: 'born' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown payload action', () => {
    const result = SurvivalRuleSchema.safeParse({
      id: 'test-rule-1',
      contentHash: 'test-hash-1',
      conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
      payload: { summary: 'Reproduces', action: 'multiply' },
    });
    expect(result.success).toBe(false);
  });
});

describe('SurvivalRulesSchema', () => {
  const validRule = {
    id: 'test-rule-1',
    contentHash: 'test-hash-1',
    conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
    payload: validPayload,
  };

  it('accepts an array of valid rules', () => {
    expect(
      SurvivalRulesSchema.safeParse([validRule, { ...validRule, id: 'test-rule-2' }]).success,
    ).toBe(true);
  });

  it('accepts an empty rule set (an organism mid-authoring, Story 4.10)', () => {
    expect(SurvivalRulesSchema.safeParse([]).success).toBe(true);
  });

  it('rejects an array containing one invalid rule', () => {
    const result = SurvivalRulesSchema.safeParse([validRule, { ...validRule, contentHash: '' }]);
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('1.contentHash');
  });
});
