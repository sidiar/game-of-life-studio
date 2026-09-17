import { describe, expect, it } from 'vitest';
import { SurvivalRuleSchema } from '@gol/domain';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import {
  appendRule,
  createNewRuleDraft,
  isRuleAction,
  MAX_RULE_SUMMARY_LENGTH,
  NEW_RULE_ACTION,
  removeRule,
  ruleActionLabel,
  RULE_ACTIONS,
  updateRulePayload,
  type RuleDraft,
} from './ruleDraft';

// Conway's Classic's own two rules, stripped of `contentHash` — real `RuleDraft`s, not
// hand-typed ones, so the three-rule cases below exercise the exact shape Story 4.16/4.17 will
// parse/seed.
function toDraft(rule: (typeof CONWAYS_CLASSIC.survivalRules)[number]): RuleDraft {
  const { contentHash: _contentHash, ...draft } = rule;
  return draft;
}

const [BORN, SURVIVE] = CONWAYS_CLASSIC.survivalRules.map(toDraft);

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
