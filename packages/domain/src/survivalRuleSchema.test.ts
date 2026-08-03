import { describe, expect, it } from 'vitest';
import { ConditionSchema, SurvivalRuleSchema } from './survivalRuleSchema';

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
});
