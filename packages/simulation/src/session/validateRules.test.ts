import { CONWAYS_CLASSIC } from '@gol/domain';
import { createMockOrganisms } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import type { SurvivalRule, SurvivalRules } from '../gol/survivalRules';
import { isRuleCompilationError, validateSurvivalRules } from './validateRules';

// Malformed shapes are cast through `unknown` on purpose: every case below is UNREPRESENTABLE in
// the type system, which is the point — the reachable path is in-memory (Story 4.15's draft
// organism, import, migrations), where nothing has proven the types the signature claims. Zod
// already closes the persisted path.
const malformed = (rule: unknown): SurvivalRules => [rule as SurvivalRule];

const ok = (over: Partial<SurvivalRule> = {}): SurvivalRule => ({
  id: 'rule-1',
  contentHash: 'h1',
  conditions: [{ property: 'cellState', operator: 'eq', pattern: 'alive' }],
  payload: { summary: 'survives', action: 'survive' },
  ...over,
});

const rejects = (rules: SurvivalRules, pattern: RegExp): void => {
  expect(() => validateSurvivalRules('org-x', rules)).toThrow(pattern);
};

describe('validateSurvivalRules accepts everything the repo actually ships', () => {
  it("accepts Conway's Classic", () => {
    expect(() =>
      validateSurvivalRules('conways-classic', CONWAYS_CLASSIC.survivalRules),
    ).not.toThrow();
  });

  it('accepts all three AR-45 mock organisms — all five properties, all six operators', () => {
    const properties = new Set<string>();
    const operators = new Set<string>();
    for (const organism of createMockOrganisms()) {
      expect(() => validateSurvivalRules(organism.id, organism.survivalRules)).not.toThrow();
      for (const { conditions } of organism.survivalRules) {
        for (const condition of conditions) {
          properties.add(condition.property);
          operators.add(condition.operator);
        }
      }
    }
    // The title's claim, asserted: if the fixtures drift to cover less, the accept path shrinks
    // with them and this is where it shows.
    expect(properties.size).toBe(5);
    expect(operators.size).toBe(6);
  });
});

describe('the eager diagnostic sweep (M12, AC7) — one pass per battle, not per cell', () => {
  it('rejects an unknown property', () => {
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'colour', operator: 'eq', pattern: 1 }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /"colour" is not a cell property/,
    );
  });

  it('accepts `cellState`, the persisted NAME, not `state`, the subject FIELD', () => {
    // Trap 12: a sweep validating property names against CellSubject's field names would reject
    // every valid saved rule in the workspace.
    expect(() =>
      validateSurvivalRules('org-x', [
        ok({ conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }] }),
      ]),
    ).not.toThrow();
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'state', operator: 'eq', pattern: 'empty' }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /"state" is not a cell property/,
    );
  });

  it('rejects an inherited key masquerading as a property', () => {
    // `cellSelectors` is a plain frozen object literal, so `'toString' in cellSelectors` is true.
    // Object.hasOwn is what makes this a rejection instead of a call to Object.prototype.toString.
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'toString', operator: 'eq', pattern: 1 }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /"toString" is not a cell property/,
    );
  });

  it('rejects an operator outside the six', () => {
    // `ne` was a real operator until Decision C retired it, so a pre-retirement persisted rule is
    // a concrete path here, not a hypothetical.
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'age', operator: 'ne', pattern: 1 }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /"ne" is not one of the six operators/,
    );
  });

  it('rejects a `range` pattern that is not a [min,max] tuple', () => {
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'age', operator: 'range', pattern: 5 }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /requires a \[min,max\] tuple/,
    );
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'age', operator: 'range', pattern: [5] }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /two numbers/,
    );
  });

  it('rejects an inverted `range`, which no value can satisfy', () => {
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'age', operator: 'range', pattern: [9, 2] }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /\[9,2\] is inverted/,
    );
  });

  it('rejects a tuple pattern under a scalar operator', () => {
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'age', operator: 'gte', pattern: [1, 2] }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /must not take a \[min,max\] tuple/,
    );
  });

  it('rejects a non-numeric pattern on a numeric property', () => {
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'neighborCount', operator: 'gt', pattern: '3' }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /requires a numeric pattern/,
    );
  });

  it('rejects a cellState pattern that is not one of the three states', () => {
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'cellState', operator: 'eq', pattern: 'aliv3' }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /is not a cellState/,
    );
  });

  it('rejects a rule with no conditions, which every cell satisfies vacuously', () => {
    rejects(malformed(ok({ conditions: [] })), /satisfied by every cell/);
    rejects(
      malformed({ id: 'r', contentHash: 'h', payload: { summary: '', action: 'die' } }),
      /`conditions` array/,
    );
  });

  it('names the organism and the rule in the message and on the error', () => {
    // This fires once per battle, so a useful message costs nothing.
    let caught: unknown;
    try {
      validateSurvivalRules(
        'mock-patient-defender',
        malformed(ok({ id: 'rule-42', conditions: [] })),
      );
    } catch (error) {
      caught = error;
    }

    expect(isRuleCompilationError(caught)).toBe(true);
    if (!isRuleCompilationError(caught)) throw new Error('expected a RuleCompilationError');
    expect(caught.organismId).toBe('mock-patient-defender');
    expect(caught.ruleId).toBe('rule-42');
    expect(caught.message).toContain('mock-patient-defender');
    expect(caught.message).toContain('rule-42');
    // Catchable as an ordinary Error, so a caller that only wants to degrade gracefully can.
    expect(caught).toBeInstanceOf(Error);
  });

  it('still names a rule that has no usable id', () => {
    let caught: unknown;
    try {
      validateSurvivalRules('org-x', malformed({ conditions: [], payload: { action: 'die' } }));
    } catch (error) {
      caught = error;
    }
    if (!isRuleCompilationError(caught)) throw new Error('expected a RuleCompilationError');
    expect(caught.ruleId).toBe('<rule with no id>');
  });

  it('rejects a rule that is not an object at all', () => {
    // A hole in a hand-built array, or a JSON null that survived a migration.
    rejects(malformed(null), /a rule must be an object/);
    rejects(malformed('born'), /a rule must be an object/);
  });

  it('rejects a condition that is not an object', () => {
    rejects(
      malformed(ok({ conditions: [null] } as unknown as Partial<SurvivalRule>)),
      /a condition must be an object/,
    );
  });

  it('rejects a survivalRules value that is not an array', () => {
    rejects(undefined as unknown as SurvivalRules, /survivalRules must be an array/);
  });

  it('rejects a numeric literal outside the schema bound — NaN, Infinity, negative, fraction, > 65534', () => {
    // `typeof NaN === 'number'`. Every comparison against NaN is false, so the rule is dead for
    // every cell with no diagnostic — the exact silent class this sweep exists to make loud. And
    // 65535 (or Infinity) makes `maxRelevantAge` overflow the Uint16 age buffer: the cycle-end
    // clamp would store a saturated cell as 0, a newborn (RFC-004 §2.4/§3.4).
    for (const pattern of [NaN, Infinity, -Infinity, -3, 7.5, 65535]) {
      rejects(
        malformed(ok({ conditions: [{ property: 'age', operator: 'gt', pattern }] })),
        /integer from 0 to 65534/,
      );
    }
    rejects(
      malformed(ok({ conditions: [{ property: 'age', operator: 'range', pattern: [0, 65535] }] })),
      /integer from 0 to 65534/,
    );
    rejects(
      malformed(ok({ conditions: [{ property: 'age', operator: 'range', pattern: [NaN, 5] }] })),
      /integer from 0 to 65534/,
    );
  });

  it('accepts the bound itself — 65534, and [0, 65534]', () => {
    expect(() =>
      validateSurvivalRules('org-x', [
        ok({ conditions: [{ property: 'age', operator: 'lte', pattern: 65534 }] }),
        ok({ conditions: [{ property: 'age', operator: 'range', pattern: [0, 65534] }] }),
      ]),
    ).not.toThrow();
  });

  it('rejects a missing, empty or non-string contentHash — the cache key would collide', () => {
    // `JSON.stringify([undefined])` and `[null]` are both "[null]": two organisms with DIFFERENT
    // hash-less rules would share one compiled pair (verified by execution during review).
    rejects(malformed({ ...ok(), contentHash: undefined }), /non-empty `contentHash`/);
    rejects(malformed(ok({ contentHash: '' })), /non-empty `contentHash`/);
    rejects(malformed({ ...ok(), contentHash: 42 }), /non-empty `contentHash`/);
  });
});

describe('isRuleCompilationError', () => {
  it('does not accept an Error that only forges the name', () => {
    // A rethrow that copies `name` but not the fields would otherwise pass the guard and hand
    // the caller `undefined` where the type promises `string`.
    const forged = Object.assign(new Error('x'), { name: 'RuleCompilationError' });
    expect(isRuleCompilationError(forged)).toBe(false);
    expect(isRuleCompilationError(new Error('x'))).toBe(false);
    expect(isRuleCompilationError(null)).toBe(false);
  });
});

// AC8, and deferred-work.md's `resolveCellAction` payload entry — decided by Sidiar 2026-09-09 as
// option (c): the eager diagnostic lands here, and a malformed payload is an ERROR, not a skip.
describe('a missing or malformed payload is an ERROR, never a silent null (AC8, M10, Trap 9)', () => {
  it('rejects a missing payload', () => {
    rejects(
      malformed({
        id: 'r',
        contentHash: 'h',
        conditions: [{ property: 'age', operator: 'gt', pattern: 1 }],
      }),
      /`payload` object/,
    );
  });

  it('rejects a payload with no action', () => {
    // The shape that could NOT be patched in review: `?? null` turns it into "no rule matched",
    // which M10 routes to implicit death — formalizing the silent collapse instead of fixing it.
    rejects(
      malformed(ok({ payload: { summary: 'x' } as unknown as SurvivalRule['payload'] })),
      /is not an action/,
    );
  });

  it('rejects an action outside the three', () => {
    rejects(
      malformed(
        ok({ payload: { summary: 'x', action: 'dormant' } as unknown as SurvivalRule['payload'] }),
      ),
      /"dormant" is not an action/,
    );
  });

  it('does NOT require a summary — nothing in the engine reads it', () => {
    expect(() =>
      validateSurvivalRules(
        'org-x',
        malformed(ok({ payload: { action: 'die' } as unknown as SurvivalRule['payload'] })),
      ),
    ).not.toThrow();
  });
});

// FD9 — deferred-work.md's 10 illegal property x operator pairings, closed at compile time.
describe('the property x operator legality table (FD9)', () => {
  const ILLEGAL_FOR_EQ_ONLY = ['gt', 'lt', 'gte', 'lte', 'range'] as const;

  it('rejects all 10 pairings the schema rejects and the flat Condition admits', () => {
    let rejected = 0;
    for (const property of ['cellState', 'organismType'] as const) {
      for (const operator of ILLEGAL_FOR_EQ_ONLY) {
        // The legality-table message specifically: a rejection for any other reason (a
        // `TypeError` from a broken table, the tuple check under `range`) would otherwise count.
        rejects(
          malformed(
            ok({
              conditions: [{ property, operator, pattern: 'alive' }],
            } as unknown as Partial<SurvivalRule>),
          ),
          /does not take operator/,
        );
        rejected += 1;
      }
    }
    expect(rejected).toBe(10);
  });

  it('leaves all 20 legal pairings alone', () => {
    for (const property of ['age', 'neighborCount', 'occupantNeighborCount'] as const) {
      for (const operator of ['eq', 'gt', 'lt', 'gte', 'lte'] as const) {
        expect(() =>
          validateSurvivalRules('org-x', [
            ok({ conditions: [{ property, operator, pattern: 2 }] }),
          ]),
        ).not.toThrow();
      }
      expect(() =>
        validateSurvivalRules('org-x', [
          ok({ conditions: [{ property, operator: 'range', pattern: [1, 2] }] }),
        ]),
      ).not.toThrow();
    }
    for (const property of ['cellState', 'organismType'] as const) {
      const pattern = property === 'cellState' ? 'alive' : 'some-library-id';
      expect(() =>
        validateSurvivalRules('org-x', [
          ok({ conditions: [{ property, operator: 'eq', pattern }] }),
        ]),
      ).not.toThrow();
    }
  });

  it('rejects a null organismType pattern — the shape that matches EVERY empty cell', () => {
    // Trap 3, sharper than the pairing table: `{ organismType, eq, null }` is a legal
    // Condition<CellProperty> and affirmatively matches every empty cell, so a `born` rule written
    // that way populates the entire grid.
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'organismType', operator: 'eq', pattern: null }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /non-empty library id/,
    );
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'organismType', operator: 'eq', pattern: 2 }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /non-empty library id/,
    );
    rejects(
      malformed(
        ok({
          conditions: [{ property: 'organismType', operator: 'eq', pattern: '' }],
        } as unknown as Partial<SurvivalRule>),
      ),
      /non-empty library id/,
    );
  });
});
