// resolveCellAction (AC5): a thin wrapper over firstSatisfiedBy, plus the end-to-end proof that a
// PERSISTED SurvivalRules value evaluates through it with no mapping layer (AC4/AC6). Subjects are
// hand-built CellSubject literals — no grid (RFC-004 §3.5).
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import { resolveCellAction } from './resolveCellAction';
import type { CellSubject } from './cellSubject';
import type { SurvivalRule, SurvivalRules } from './survivalRules';

const cell = (overrides: Partial<CellSubject> = {}): CellSubject => ({
  state: 'empty',
  organismType: null,
  age: 0,
  neighborCount: 0,
  occupantNeighborCount: 0,
  ...overrides,
});

const survivalRule = (
  id: string,
  conditions: SurvivalRule['conditions'],
  action: SurvivalRule['payload']['action'],
): SurvivalRule => ({
  id,
  // Opaque here (AR-21/Trap 8) — never parsed or generated, a fixture string is enough.
  contentHash: `hash-of-${id}`,
  conditions,
  payload: { summary: `${id} fires`, action },
});

describe('resolveCellAction — thin wrapper over firstSatisfiedBy (AC5)', () => {
  it("returns the winning rule's action", () => {
    const rules: SurvivalRules = [
      survivalRule('born', [{ property: 'cellState', operator: 'eq', pattern: 'empty' }], 'born'),
    ];
    expect(resolveCellAction(rules, cell({ state: 'empty' }))).toBe('born');
  });

  // Trap 7: null means "no rule matched", never "die". Collapsing it into 'die' would break
  // Conway semantics (M10's implicit-death-at-cycle-end path is Story 3.5's no-claim plus Story 3.6's
  // cycle-end write, not this one's).
  it('returns null — not undefined, not "die" — when no rule matches', () => {
    const rules: SurvivalRules = [
      survivalRule('born', [{ property: 'cellState', operator: 'eq', pattern: 'empty' }], 'born'),
    ];
    const result = resolveCellAction(rules, cell({ state: 'alive', neighborCount: 9 }));
    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });

  it('returns null for an empty SurvivalRules', () => {
    expect(resolveCellAction([], cell())).toBeNull();
  });

  // Multi-rule ordering: first-match-wins within the set (FR-2.6).
  it('first-match-wins when several rules would otherwise match', () => {
    const rules: SurvivalRules = [
      survivalRule(
        'first',
        [{ property: 'cellState', operator: 'eq', pattern: 'alive' }],
        'survive',
      ),
      survivalRule('second', [{ property: 'cellState', operator: 'eq', pattern: 'alive' }], 'die'),
    ];
    expect(resolveCellAction(rules, cell({ state: 'alive' }))).toBe('survive');
    // Reversing the set reverses the winner — proves this is ordering, not luck.
    expect(resolveCellAction([...rules].reverse(), cell({ state: 'alive' }))).toBe('die');
  });
});

// The end-to-end proof that a PERSISTED SurvivalRules value evaluates with no mapping layer
// (AC4/AC6, RFC-004 §2.4). CONWAYS_CLASSIC.survivalRules is @gol/domain's shape, re-exported
// pass-through by @gol/test-utils — never a second copy.
describe("Conway's Classic — the persisted-rules integration proof (AC6)", () => {
  const rules: SurvivalRules = CONWAYS_CLASSIC.survivalRules;

  it('born on an empty cell with exactly 3 neighbors', () => {
    expect(resolveCellAction(rules, cell({ state: 'empty', neighborCount: 3 }))).toBe('born');
  });

  it('does not born an empty cell with 2 or 4 neighbors', () => {
    expect(resolveCellAction(rules, cell({ state: 'empty', neighborCount: 2 }))).toBeNull();
    expect(resolveCellAction(rules, cell({ state: 'empty', neighborCount: 4 }))).toBeNull();
  });

  it('survives an alive cell with 2 neighbors', () => {
    expect(resolveCellAction(rules, cell({ state: 'alive', neighborCount: 2 }))).toBe('survive');
  });

  it('survives an alive cell with 3 neighbors', () => {
    expect(resolveCellAction(rules, cell({ state: 'alive', neighborCount: 3 }))).toBe('survive');
  });

  // Conway's Classic has NO Die rule (M10) — an alive cell with 1 or 4 neighbors matches nothing,
  // which is the IMPLICIT death path, not a bug in the fixture or this resolver.
  it('null (implicit death, M10) on an alive cell with 1 or 4 neighbors — Conway has no Die rule', () => {
    expect(resolveCellAction(rules, cell({ state: 'alive', neighborCount: 1 }))).toBeNull();
    expect(resolveCellAction(rules, cell({ state: 'alive', neighborCount: 4 }))).toBeNull();
  });
});
