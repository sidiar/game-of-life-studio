import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { createMockOrganisms } from '@gol/test-utils';
import { canonicalRuleContent, ruleContentHash } from './ruleContentHash';

// Task 2 (a) — the load-bearing test: every pinned literal in the workspace, reproduced. A red
// result here means the hasher is wrong (AC7); it never means the literal should be regenerated.
describe('ruleContentHash — the ten pinned literals', () => {
  const rules = [
    ...CONWAYS_CLASSIC.survivalRules,
    ...createMockOrganisms().flatMap((o) => o.survivalRules),
  ];

  it('covers exactly ten rules — a fixture change is visible here', () => {
    expect(rules).toHaveLength(10);
  });

  it.each(rules.map((rule) => [rule.id, rule]))(
    'matches the pinned literal for rule %s',
    async (_id, rule) => {
      await expect(ruleContentHash(rule)).resolves.toBe(rule.contentHash);
    },
  );
});

describe('canonicalRuleContent', () => {
  const BORN_RULE_SHAPE = {
    conditions: [
      { property: 'cellState' as const, operator: 'eq' as const, pattern: 'empty' as const },
      { property: 'neighborCount' as const, operator: 'eq' as const, pattern: 3 },
    ],
    payload: { summary: 'Born on an empty cell with exactly 3 neighbors', action: 'born' as const },
  };

  it('reproduces the exact pinned string', () => {
    expect(canonicalRuleContent(BORN_RULE_SHAPE)).toBe(
      '{"conditions":[{"operator":"eq","pattern":"empty","property":"cellState"},{"operator":"eq","pattern":3,"property":"neighborCount"}],"payload":{"action":"born","summary":"Born on an empty cell with exactly 3 neighbors"}}',
    );
  });

  it('is insensitive to key order within an object', () => {
    const a = canonicalRuleContent({
      conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
      payload: { summary: 'x', action: 'born' },
    });
    const b = canonicalRuleContent({
      conditions: [{ operator: 'eq', property: 'cellState', pattern: 'empty' }],
      payload: { action: 'born', summary: 'x' },
    });
    expect(a).toBe(b);
  });

  it('is sensitive to array (condition) order', () => {
    const a = canonicalRuleContent({
      conditions: [
        { property: 'cellState', operator: 'eq', pattern: 'empty' },
        { property: 'neighborCount', operator: 'eq', pattern: 3 },
      ],
      payload: { summary: 'x', action: 'born' },
    });
    const b = canonicalRuleContent({
      conditions: [
        { property: 'neighborCount', operator: 'eq', pattern: 3 },
        { property: 'cellState', operator: 'eq', pattern: 'empty' },
      ],
      payload: { summary: 'x', action: 'born' },
    });
    expect(a).not.toBe(b);
  });

  it('excludes id — two rules with different ids and identical content hash equal (RFC-004 §2.4)', async () => {
    // The function's own signature — Pick<SurvivalRule, 'conditions' | 'payload'> — already
    // excludes `id`; this pins the RFC-004 §2.4 behaviour that follows: two full rule objects
    // that differ ONLY by id still hash equal.
    const ruleA = {
      id: 'rule-a',
      contentHash: 'irrelevant-a',
      conditions: [
        { property: 'cellState' as const, operator: 'eq' as const, pattern: 'empty' as const },
      ],
      payload: { summary: 'x', action: 'born' as const },
    };
    const ruleB = { ...ruleA, id: 'rule-b', contentHash: 'irrelevant-b' };
    const a = await ruleContentHash(ruleA);
    const b = await ruleContentHash(ruleB);
    expect(a).toBe(b);
  });

  it('changes when the payload summary changes', () => {
    const a = canonicalRuleContent({
      conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
      payload: { summary: 'x', action: 'born' },
    });
    const b = canonicalRuleContent({
      conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
      payload: { summary: 'y', action: 'born' },
    });
    expect(a).not.toBe(b);
  });
});

describe('ruleContentHash — output shape', () => {
  it('is 64 lowercase hex characters', async () => {
    const hash = await ruleContentHash(CONWAYS_CLASSIC.survivalRules[0]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
