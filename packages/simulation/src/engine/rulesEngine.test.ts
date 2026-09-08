// AR-40's domain-agnosticism proof. The subject here is a library loan: no cell, no organism, no
// grid, no age, no action. project-context states the bar plainly — "the generic rules engine is
// tested with a non-Game-of-Life subject. If that test needs a GoL import, the engine has leaked."
//
// ⚠️ This file must import nothing from @gol/domain, and the import list IS part of the assertion.
// It sits inside src/engine/ so the no-restricted-imports block in eslint.config.mjs enforces that
// mechanically rather than leaving it to review. The AC5 assignability check deliberately lives
// OUTSIDE this directory (src/domainRuleSetCompatibility.test.ts) — it must import @gol/domain.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { conditionIsSatisfiedBy, firstSatisfiedBy, ruleIsSatisfiedBy } from './firstSatisfiedBy';
import type { Operator } from './operators';
import type { Condition, Rule, RuleSet, Selectors } from './rule';

interface LibraryLoan {
  readonly daysOverdue: number;
  readonly memberTier: string;
  readonly status: string;
}

type LoanProperty = 'daysOverdue' | 'memberTier' | 'status';

const loanSelectors: Selectors<LibraryLoan, LoanProperty> = {
  daysOverdue: (loan) => loan.daysOverdue,
  memberTier: (loan) => loan.memberTier,
  status: (loan) => loan.status,
};

// The payload is opaque to the engine, so its shape is arbitrary — which is the point.
interface FeeNotice {
  readonly notice: string;
  readonly feeCents: number;
}

const loan = (overrides: Partial<LibraryLoan> = {}): LibraryLoan => ({
  daysOverdue: 0,
  memberTier: 'standard',
  status: 'on-loan',
  ...overrides,
});

const rule = (
  id: string,
  conditions: readonly Condition<LoanProperty>[],
  payload: FeeNotice = { notice: 'notice', feeCents: 0 },
): Rule<FeeNotice, LoanProperty> => ({
  id,
  // Opaque to this layer (AR-21) — never parsed, prefixed or validated here.
  contentHash: `hash-of-${id}`,
  conditions,
  payload,
});

// Applies one operator against `daysOverdue` unless a different property is named.
const holds = (
  operator: Operator,
  pattern: unknown,
  subject: LibraryLoan,
  property: LoanProperty = 'daysOverdue',
) => conditionIsSatisfiedBy({ property, operator, pattern }, subject, loanSelectors);

describe('conditionIsSatisfiedBy — the six MVP operators', () => {
  // Both directions on every predicate: a suite that only ever asserts `true` cannot fail against
  // a predicate hardcoded to return true.
  it('eq compares numbers by identity', () => {
    expect(holds('eq', 5, loan({ daysOverdue: 5 }))).toBe(true);
    expect(holds('eq', 5, loan({ daysOverdue: 6 }))).toBe(false);
  });

  it('eq compares non-numeric values too — it is the equality operator, not a numeric one', () => {
    expect(holds('eq', 'premium', loan({ memberTier: 'premium' }), 'memberTier')).toBe(true);
    expect(holds('eq', 'premium', loan({ memberTier: 'standard' }), 'memberTier')).toBe(false);
  });

  it('gt is strict', () => {
    expect(holds('gt', 5, loan({ daysOverdue: 6 }))).toBe(true);
    expect(holds('gt', 5, loan({ daysOverdue: 5 }))).toBe(false);
    expect(holds('gt', 5, loan({ daysOverdue: 4 }))).toBe(false);
  });

  it('lt is strict', () => {
    expect(holds('lt', 5, loan({ daysOverdue: 4 }))).toBe(true);
    expect(holds('lt', 5, loan({ daysOverdue: 5 }))).toBe(false);
    expect(holds('lt', 5, loan({ daysOverdue: 6 }))).toBe(false);
  });

  it('gte admits the boundary', () => {
    expect(holds('gte', 5, loan({ daysOverdue: 5 }))).toBe(true);
    expect(holds('gte', 5, loan({ daysOverdue: 6 }))).toBe(true);
    expect(holds('gte', 5, loan({ daysOverdue: 4 }))).toBe(false);
  });

  it('lte admits the boundary', () => {
    expect(holds('lte', 5, loan({ daysOverdue: 5 }))).toBe(true);
    expect(holds('lte', 5, loan({ daysOverdue: 4 }))).toBe(true);
    expect(holds('lte', 5, loan({ daysOverdue: 6 }))).toBe(false);
  });

  // The single highest-value assertion in this file. An exclusive upper bound reads as correct and
  // silently makes `range [2,3]` mean "2 only", which breaks every Conway golden pattern in Story
  // 3.6 — three stories after the bug is written.
  it('range is inclusive at BOTH bounds', () => {
    expect(holds('range', [2, 4], loan({ daysOverdue: 2 }))).toBe(true); // at lo
    expect(holds('range', [2, 4], loan({ daysOverdue: 3 }))).toBe(true); // inside
    expect(holds('range', [2, 4], loan({ daysOverdue: 4 }))).toBe(true); // at hi
    expect(holds('range', [2, 4], loan({ daysOverdue: 1 }))).toBe(false); // lo - 1
    expect(holds('range', [2, 4], loan({ daysOverdue: 5 }))).toBe(false); // hi + 1
  });

  it('resolves the value through the injected selector, not off the subject directly', () => {
    // Same subject, same operator, different property — proves the selector dictionary is the seam.
    expect(holds('eq', 'returned', loan({ status: 'returned' }), 'status')).toBe(true);
    expect(holds('eq', 'returned', loan({ status: 'returned' }), 'memberTier')).toBe(false);
  });
});

describe('ruleIsSatisfiedBy — AND semantics', () => {
  it('passes only when every condition passes', () => {
    const overduePremium = rule('overdue-premium', [
      { property: 'daysOverdue', operator: 'gt', pattern: 30 },
      { property: 'memberTier', operator: 'eq', pattern: 'premium' },
    ]);
    expect(
      ruleIsSatisfiedBy(
        overduePremium,
        loan({ daysOverdue: 31, memberTier: 'premium' }),
        loanSelectors,
      ),
    ).toBe(true);
    expect(
      ruleIsSatisfiedBy(
        overduePremium,
        loan({ daysOverdue: 31, memberTier: 'standard' }),
        loanSelectors,
      ),
    ).toBe(false);
    expect(
      ruleIsSatisfiedBy(
        overduePremium,
        loan({ daysOverdue: 1, memberTier: 'premium' }),
        loanSelectors,
      ),
    ).toBe(false);
  });

  it('short-circuits — a later condition is never evaluated once an earlier one fails', () => {
    // Observable proof, not a comment: `every` stops at the first false, a map-then-every would not.
    // This is the per-cell hot path (NFR-1.1), which is why the shape matters.
    let statusReads = 0;
    const countingSelectors: Selectors<LibraryLoan, LoanProperty> = {
      ...loanSelectors,
      status: (subject) => {
        statusReads += 1;
        return subject.status;
      },
    };
    const twoConditions = rule('two-conditions', [
      { property: 'daysOverdue', operator: 'gt', pattern: 30 },
      { property: 'status', operator: 'eq', pattern: 'on-loan' },
    ]);

    expect(ruleIsSatisfiedBy(twoConditions, loan({ daysOverdue: 1 }), countingSelectors)).toBe(
      false,
    );
    expect(statusReads).toBe(0);

    expect(ruleIsSatisfiedBy(twoConditions, loan({ daysOverdue: 31 }), countingSelectors)).toBe(
      true,
    );
    expect(statusReads).toBe(1);
  });

  it('a rule with no conditions is vacuously satisfied', () => {
    expect(ruleIsSatisfiedBy(rule('empty', []), loan(), loanSelectors)).toBe(true);
  });
});

describe('firstSatisfiedBy — order is priority (FR-2.6)', () => {
  it('returns the FIRST matching rule when several match', () => {
    const first = rule('first', [{ property: 'daysOverdue', operator: 'gte', pattern: 1 }]);
    const second = rule('second', [{ property: 'daysOverdue', operator: 'gte', pattern: 1 }]);

    expect(firstSatisfiedBy([first, second], loan({ daysOverdue: 9 }), loanSelectors)?.id).toBe(
      'first',
    );
    // Reversing the set reverses the winner — that is what makes this ordering and not luck.
    expect(firstSatisfiedBy([second, first], loan({ daysOverdue: 9 }), loanSelectors)?.id).toBe(
      'second',
    );
  });

  it('skips non-matching rules ahead of the winner', () => {
    const never = rule('never', [{ property: 'daysOverdue', operator: 'gt', pattern: 1000 }]);
    const winner = rule('winner', [
      { property: 'memberTier', operator: 'eq', pattern: 'standard' },
    ]);
    expect(firstSatisfiedBy([never, winner], loan(), loanSelectors)?.id).toBe('winner');
  });

  it('returns the winning Rule with its payload untouched — the engine never reads it', () => {
    const payload: FeeNotice = { notice: 'Overdue by more than a week', feeCents: 250 };
    const winner = rule('fee', [{ property: 'daysOverdue', operator: 'gt', pattern: 7 }], payload);

    const result = firstSatisfiedBy([winner], loan({ daysOverdue: 8 }), loanSelectors);

    expect(result).toBe(winner);
    // Reference identity, not deep equality: a copied or re-shaped payload would still pass toEqual.
    expect(result?.payload).toBe(payload);
  });

  it('returns null — not undefined — when nothing matches', () => {
    const never = rule('never', [{ property: 'daysOverdue', operator: 'gt', pattern: 1000 }]);
    const result = firstSatisfiedBy([never], loan(), loanSelectors);
    // Strict null: `find` yields undefined, and `|| null` vs `?? null` differ for a falsy-but-found
    // value. A leaked undefined passes `!result` and fails `result === null` downstream.
    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });

  it('returns null for an empty RuleSet', () => {
    expect(firstSatisfiedBy([], loan(), loanSelectors)).toBeNull();
  });
});

describe('firstSatisfiedBy — invariant', () => {
  // Examples pin the orderings someone thought to write down. This pins first-match-wins across
  // every ordering fast-check can generate, including duplicate and unsatisfiable rules.
  const arbRuleSet: fc.Arbitrary<RuleSet<FeeNotice, LoanProperty>> = fc
    .array(fc.integer({ min: 0, max: 4 }), { maxLength: 6 })
    .map((thresholds) =>
      thresholds.map((threshold, index) =>
        // Distinct ids, colliding contentHashes for identical rules — the AR-21 split, in a fixture.
        rule(`rule-${index}`, [{ property: 'daysOverdue', operator: 'eq', pattern: threshold }], {
          notice: `overdue by exactly ${threshold}`,
          feeCents: threshold * 25,
        }),
      ),
    );

  const arbLoan: fc.Arbitrary<LibraryLoan> = fc.record({
    daysOverdue: fc.integer({ min: 0, max: 4 }),
    memberTier: fc.constantFrom('standard', 'premium'),
    status: fc.constantFrom('on-loan', 'returned'),
  });

  it('always equals the first rule that ruleIsSatisfiedBy accepts', () => {
    fc.assert(
      fc.property(arbRuleSet, arbLoan, (ruleSet, subject) => {
        const expected =
          ruleSet.filter((r) => ruleIsSatisfiedBy(r, subject, loanSelectors))[0] ?? null;
        expect(firstSatisfiedBy(ruleSet, subject, loanSelectors)).toBe(expected);
      }),
    );
  });
});
