import { CONWAYS_CLASSIC } from '@gol/domain';
import { createMockOrganisms } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import { operators } from '../engine/operators';
import type { SurvivalRule, SurvivalRules } from '../gol/survivalRules';
import { maxRelevantAge } from './maxRelevantAge';

const ruleWith = (conditions: SurvivalRule['conditions']): SurvivalRule => ({
  id: 'r',
  contentHash: 'h',
  conditions,
  payload: { summary: 'x', action: 'survive' },
});

const rulesOf = (id: string): SurvivalRules => {
  const organism = createMockOrganisms().find((candidate) => candidate.id === id);
  if (organism === undefined) throw new Error(`no mock organism "${id}"`);
  return organism.survivalRules;
};

describe('maxRelevantAge — max(7, maxAgeLiteral + 1) per BATTLE (AR-20, Decision B.5)', () => {
  it('falls back to the 7-shade floor when no organism mentions age', () => {
    // Conway's Classic is the control: no age literal, no die rule.
    expect(maxRelevantAge([CONWAYS_CLASSIC.survivalRules])).toBe(7);
  });

  it('still returns the floor for a literal below it — 3 gives 7, not 4', () => {
    expect(maxRelevantAge([[ruleWith([{ property: 'age', operator: 'gte', pattern: 3 }])]])).toBe(
      7,
    );
  });

  it("Patient Defender's `age gte 8` gives 9, not 8", () => {
    // The + 1 is the whole test: dropping it returns 8 here and reads as correct.
    expect(maxRelevantAge([rulesOf('mock-patient-defender')])).toBe(9);
  });

  it('takes the UPPER bound of a range pattern', () => {
    expect(
      maxRelevantAge([[ruleWith([{ property: 'age', operator: 'range', pattern: [2, 12] }])]]),
    ).toBe(13);
  });

  it('is the max over EVERY organism in the battle, not per organism', () => {
    // Trap 4's third failure mode: computed per organism, Conway would saturate at 7 in a battle
    // where Patient Defender's rules still ask about age 8.
    const battle = [CONWAYS_CLASSIC.survivalRules, rulesOf('mock-patient-defender')];
    expect(maxRelevantAge(battle)).toBe(9);
    expect(maxRelevantAge([...battle].reverse())).toBe(9);
  });

  it('ignores neighbour-count literals, which are not ages', () => {
    // Trap 11: `neighborCount` is SAME-organism and `occupantNeighborCount` OTHER-organism; both
    // are bounded at 8 and neither says anything about how long a cell has been alive. A scan that
    // swept every numeric literal would return 41 here.
    const rules: SurvivalRules = [
      ruleWith([
        { property: 'neighborCount', operator: 'lte', pattern: 40 },
        { property: 'occupantNeighborCount', operator: 'range', pattern: [1, 40] },
      ]),
    ];
    expect(maxRelevantAge([rules])).toBe(7);
  });

  it('keeps `age gt <maxLiteral>` satisfiable for a SATURATED cell — the reason for the + 1', () => {
    // This is the assertion that fails if someone "simplifies" the + 1 away. A cell clamped AT the
    // literal fails a strict `gt` forever, so the rule can never fire in any battle.
    const literal = 8;
    const saturated = maxRelevantAge([
      [ruleWith([{ property: 'age', operator: 'gt', pattern: literal }])],
    ]);

    expect(operators.gt(saturated, literal)).toBe(true);
    expect(operators.gt(literal, literal)).toBe(false);
  });

  it('is 7 for a battle with no organisms at all', () => {
    expect(maxRelevantAge([])).toBe(7);
  });
});
