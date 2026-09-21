import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SurvivalRuleSchema } from '@gol/domain';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import type { ConditionDraft } from './conditionDraft';
import { createNewConditionDraft } from './conditionDraft';
import {
  appendRule,
  createNewRuleDraft,
  isRuleAction,
  MAX_RULE_SUMMARY_LENGTH,
  moveRule,
  NEW_RULE_ACTION,
  parseRuleDraft,
  removeRule,
  ruleActionLabel,
  RULE_ACTIONS,
  ruleDraftFrom,
  ruleNeedsCondition,
  RULE_NEEDS_CONDITION,
  updateRuleConditions,
  updateRulePayload,
  type RuleDraft,
} from './ruleDraft';

// Deterministic id counter, never `crypto` — `ruleDraftFrom(rule, counter)` in place of the old
// hand-destructure, so the two-rule fixtures below exercise the exact bridge Story 4.16/4.17 read.
function counter() {
  let n = 0;
  return () => `c${++n}`;
}

const [BORN, SURVIVE] = CONWAYS_CLASSIC.survivalRules.map((rule) => ruleDraftFrom(rule, counter()));

describe('RULE_ACTIONS', () => {
  it('is exactly [born, survive, die], each parsing through the schema enum', () => {
    expect(RULE_ACTIONS).toEqual(['born', 'survive', 'die']);
    for (const action of RULE_ACTIONS) {
      expect(SurvivalRuleSchema.shape.payload.shape.action.safeParse(action).success).toBe(true);
    }
  });
});

describe('isRuleAction', () => {
  it('is true for every RULE_ACTIONS entry', () => {
    for (const action of RULE_ACTIONS) {
      expect(isRuleAction(action)).toBe(true);
    }
  });

  it.each(['', 'Born', 'dead'])('is false for %j', (value) => {
    expect(isRuleAction(value)).toBe(false);
  });
});

describe('ruleActionLabel', () => {
  it('gives the three display strings', () => {
    expect(ruleActionLabel('born')).toBe('Born');
    expect(ruleActionLabel('survive')).toBe('Survive');
    expect(ruleActionLabel('die')).toBe('Die');
  });
});

describe('createNewRuleDraft', () => {
  it('builds a Born rule with an empty summary and no conditions, from the given id', () => {
    expect(createNewRuleDraft('x')).toEqual({
      id: 'x',
      conditions: [],
      payload: { summary: '', action: 'born' },
    });
    expect(createNewRuleDraft('x').payload.action).toBe(NEW_RULE_ACTION);
  });

  it('a 100-character summary parses through the payload schema', () => {
    const summary = 'x'.repeat(MAX_RULE_SUMMARY_LENGTH);
    const draft = { ...createNewRuleDraft('x'), payload: { summary, action: 'born' as const } };
    expect(SurvivalRuleSchema.shape.payload.safeParse(draft.payload).success).toBe(true);
  });
});

describe('ruleNeedsCondition', () => {
  it('is true for a fresh rule with no conditions', () => {
    expect(ruleNeedsCondition(createNewRuleDraft('x'))).toBe(true);
  });

  it('is false once the rule has one condition row', () => {
    const rule = { ...createNewRuleDraft('x'), conditions: [createNewConditionDraft('c1')] };
    expect(ruleNeedsCondition(rule)).toBe(false);
  });

  it('RULE_NEEDS_CONDITION matches the design doc string verbatim', () => {
    expect(RULE_NEEDS_CONDITION).toBe('Rule must have at least one condition');
  });
});

describe('appendRule', () => {
  it('puts the new rule last and returns a new array', () => {
    const rules = [BORN];
    const next = appendRule(rules, SURVIVE);
    expect(next).not.toBe(rules);
    expect(next).toEqual([BORN, SURVIVE]);
  });
});

describe('removeRule', () => {
  it('removes by id and preserves order', () => {
    const rules = [BORN, SURVIVE];
    expect(removeRule(rules, BORN.id)).toEqual([SURVIVE]);
  });

  it('returns the same reference for an unknown id', () => {
    const rules = [BORN, SURVIVE];
    expect(removeRule(rules, 'nope')).toBe(rules);
  });
});

describe('moveRule', () => {
  const THREE: readonly RuleDraft[] = [BORN, SURVIVE, createNewRuleDraft('x')];
  const [B, S, X] = THREE;

  it('moves a rule down, others keep relative order', () => {
    const next = moveRule(THREE, B.id, 2);
    expect(next).toEqual([S, X, B]);
    expect(next[0]).toBe(S);
    expect(next[1]).toBe(X);
  });

  it('moves a rule up, others keep relative order', () => {
    const next = moveRule(THREE, X.id, 0);
    expect(next).toEqual([X, B, S]);
  });

  it('moves one step down then one step up returns to the start', () => {
    const down = moveRule(THREE, B.id, 1);
    expect(down).toEqual([S, B, X]);
    const up = moveRule(down, B.id, 0);
    expect(up).toEqual([B, S, X]);
  });

  it('returns the same reference when the clamped target equals the current index', () => {
    expect(moveRule(THREE, B.id, 0)).toBe(THREE);
  });

  it('returns the same reference for an unknown id', () => {
    expect(moveRule(THREE, 'nope', 1)).toBe(THREE);
  });

  it('clamps an out-of-range toIndex to the nearest end, and a same-index-after-clamp is a no-op', () => {
    expect(moveRule(THREE, B.id, 99)).toEqual([S, X, B]);
    expect(moveRule(THREE, X.id, -1)).toEqual([X, B, S]);
    // X is already last; clamp(2) === its current index === same reference.
    expect(moveRule(THREE, X.id, 2)).toBe(THREE);
  });

  it('never mutates the input array', () => {
    const before = [...THREE];
    moveRule(THREE, B.id, 2);
    expect(THREE).toEqual(before);
  });

  it('preserves length and the id set', () => {
    const next = moveRule(THREE, B.id, 2);
    expect(next).toHaveLength(THREE.length);
    expect(new Set(next.map((r) => r.id))).toEqual(new Set(THREE.map((r) => r.id)));
  });

  it('is a permutation for any source/target index (fast-check)', () => {
    const rules: readonly RuleDraft[] = [
      createNewRuleDraft('r0'),
      createNewRuleDraft('r1'),
      createNewRuleDraft('r2'),
      createNewRuleDraft('r3'),
      createNewRuleDraft('r4'),
    ];
    fc.assert(
      fc.property(fc.nat({ max: 4 }), fc.integer(), (sourceIndex, toIndex) => {
        const rule = rules[sourceIndex];
        const next = moveRule(rules, rule.id, toIndex);
        const clamped = Math.max(0, Math.min(rules.length - 1, toIndex));

        expect(next).toHaveLength(rules.length);
        expect(new Set(next.map((r) => r.id))).toEqual(new Set(rules.map((r) => r.id)));
        expect(next[clamped]).toBe(rule);

        const others = rules.filter((r) => r.id !== rule.id);
        const nextOthers = next.filter((r) => r.id !== rule.id);
        expect(nextOthers).toEqual(others);
      }),
    );
  });
});

describe('updateRulePayload', () => {
  it('patches summary alone, leaving action and other rules by reference', () => {
    const rules = [BORN, SURVIVE];
    const next = updateRulePayload(rules, BORN.id, { summary: 'new summary' });
    expect(next[0]).toEqual({ ...BORN, payload: { ...BORN.payload, summary: 'new summary' } });
    expect(next[1]).toBe(SURVIVE);
  });

  it('patches action alone, leaving summary and other rules by reference', () => {
    const rules = [BORN, SURVIVE];
    const next = updateRulePayload(rules, SURVIVE.id, { action: 'die' });
    expect(next[1]).toEqual({ ...SURVIVE, payload: { ...SURVIVE.payload, action: 'die' } });
    expect(next[0]).toBe(BORN);
  });

  it('returns the same reference for an unknown id', () => {
    const rules = [BORN, SURVIVE];
    expect(updateRulePayload(rules, 'nope', { summary: 'x' })).toBe(rules);
  });
});

describe('updateRuleConditions', () => {
  it('patches only the named rule, keeping the others by reference', () => {
    const rules = [BORN, SURVIVE];
    const next = updateRuleConditions(rules, BORN.id, (conditions) => [...conditions].reverse());
    expect(next[0].conditions).toEqual([...BORN.conditions].reverse());
    expect(next[1]).toBe(SURVIVE);
  });

  it('returns the same reference for an unknown id', () => {
    const rules = [BORN, SURVIVE];
    expect(updateRuleConditions(rules, 'nope', (c) => [...c].reverse())).toBe(rules);
  });

  it('returns the same reference for an identity update (a no-op stays a no-op)', () => {
    const rules = [BORN, SURVIVE];
    expect(updateRuleConditions(rules, BORN.id, (c) => c)).toBe(rules);
  });
});

describe('ruleDraftFrom', () => {
  it('keeps the rule id, drops contentHash, and maps each condition with a fresh id', () => {
    const bornRule = CONWAYS_CLASSIC.survivalRules.find((r) => r.payload.action === 'born');
    if (!bornRule) throw new Error('fixture has no born rule');

    const draft = ruleDraftFrom(bornRule, counter());

    expect(draft.id).toBe(bornRule.id);
    expect(draft.payload).toEqual(bornRule.payload);
    const conditions: readonly ConditionDraft[] = draft.conditions;
    expect(conditions).toEqual([
      { id: 'c1', property: 'cellState', operator: 'eq', pattern: 'empty' },
      { id: 'c2', property: 'neighborCount', operator: 'eq', pattern: '3' },
    ]);
  });

  it('a fresh createNewRuleDraft is unchanged (conditions: [])', () => {
    expect(createNewRuleDraft('x')).toEqual({
      id: 'x',
      conditions: [],
      payload: { summary: '', action: 'born' },
    });
  });
});

describe('parseRuleDraft', () => {
  it('a rule with zero conditions parses to null', () => {
    expect(parseRuleDraft(createNewRuleDraft('r1'))).toBeNull();
  });

  it('a rule whose one condition is unrunnable parses to null', () => {
    const rule: RuleDraft = {
      id: 'r1',
      conditions: [{ id: 'c1', property: 'neighborCount', operator: 'eq', pattern: 'abc' }],
      payload: { summary: '', action: 'born' },
    };
    expect(parseRuleDraft(rule)).toBeNull();
  });

  it("round-trips CONWAYS_CLASSIC's rules through ruleDraftFrom", () => {
    for (const rule of CONWAYS_CLASSIC.survivalRules) {
      const draft = ruleDraftFrom(rule, counter());
      const parsed = parseRuleDraft(draft);
      expect(parsed).toEqual({ id: rule.id, conditions: rule.conditions, payload: rule.payload });
      expect(parsed && 'contentHash' in parsed).toBe(false);
    }
  });

  it('the parsed conditions are a NEW array carrying no draft id', () => {
    const draft = ruleDraftFrom(
      CONWAYS_CLASSIC.survivalRules.find((r) => r.payload.action === 'born')!,
      counter(),
    );
    const parsed = parseRuleDraft(draft);
    expect(parsed).not.toBeNull();
    expect(parsed!.conditions).not.toBe(draft.conditions);
    for (const condition of parsed!.conditions) {
      expect('id' in condition).toBe(false);
    }
  });

  it('a range draft with text bounds parses to a numeric [min, max] pattern', () => {
    const rule: RuleDraft = {
      id: 'r1',
      conditions: [{ id: 'c1', property: 'age', operator: 'range', pattern: ['2', '3'] }],
      payload: { summary: '', action: 'survive' },
    };
    const parsed = parseRuleDraft(rule);
    expect(parsed).toEqual({
      id: 'r1',
      conditions: [{ property: 'age', operator: 'range', pattern: [2, 3] }],
      payload: { summary: '', action: 'survive' },
    });
  });
});
