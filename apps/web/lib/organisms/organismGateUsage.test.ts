import { describe, expect, it } from 'vitest';
import { buildUsageIndex, type Organism, type RuleReferenceIndex } from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { resolveOrganismGateUsage } from './organismGateUsage';
import { UNSAVED_BATTLE_LABEL } from './usageLabels';

/**
 * Story 4.24, AC6/AC7: the one resolver the Library's card Edit and the battle roster's ✎ both
 * hand to `requestEdit`. The domain halves are pinned in `packages/domain`; this pins the
 * composition — the open battle is ADDED (M7), labelled by its live name, and M / the names behind
 * it come from the rule index.
 */

const [first, second] = createMockOrganisms();
const library: readonly Organism[] = [CONWAYS_CLASSIC, first, second];
const summaries = [
  { id: 'b1', name: 'Glider Wars', organismIds: [first.id] },
  { id: 'b2', name: 'Three-Way Skirmish', organismIds: [first.id, second.id] },
];
const usageIndex = buildUsageIndex(summaries);
// Two rules of `second` target `first`: M = 2, one distinct name.
const ruleIndex: RuleReferenceIndex = new Map([
  [
    first.id,
    [
      { organismId: second.id, ruleId: 'r1' },
      { organismId: second.id, ruleId: 'r2' },
    ],
  ],
]);

describe('resolveOrganismGateUsage (Story 4.24)', () => {
  it('without an open battle: the saved battles, M and the distinct referencing names', () => {
    expect(
      resolveOrganismGateUsage(first.id, { usageIndex, ruleIndex, summaries, library }),
    ).toEqual({
      battleNames: ['Glider Wars', 'Three-Way Skirmish'],
      ruleCount: 2,
      referencingNames: [second.name],
    });
  });

  it('adds a never-saved open battle that places the organism, as "Current Battle (unsaved)"', () => {
    const usage = resolveOrganismGateUsage(CONWAYS_CLASSIC.id, {
      usageIndex,
      ruleIndex,
      summaries,
      library,
      openBattle: { id: null, name: 'Draft', organismIds: [CONWAYS_CLASSIC.id] },
    });
    expect(usage.battleNames).toEqual([UNSAVED_BATTLE_LABEL]);
    expect(usage.ruleCount).toBe(0);
  });

  it('labels the saved open battle by its LIVE name and does not double-count it', () => {
    const usage = resolveOrganismGateUsage(first.id, {
      usageIndex,
      ruleIndex,
      summaries,
      library,
      openBattle: { id: 'b2', name: 'Renamed Live', organismIds: [first.id] },
    });
    expect(usage.battleNames).toEqual(['Glider Wars', 'Renamed Live']);
  });

  it('an organism the open battle does not place is not usage (the placed set, Decision H.2)', () => {
    const usage = resolveOrganismGateUsage(CONWAYS_CLASSIC.id, {
      usageIndex,
      ruleIndex,
      summaries,
      library,
      openBattle: { id: null, name: '', organismIds: [] },
    });
    expect(usage.battleNames).toEqual([]);
  });
});
