import { describe, expect, it } from 'vitest';
import { CONWAYS_CLASSIC_ID } from './defaultWorkspace';
import { organismDeleteVerdict } from './organismDeleteGuard';
import { buildRuleReferenceIndex } from './ruleReferenceIndex';
import { buildUsageIndex, type OpenBattleUsage } from './usageIndex';
import type { Organism } from './organismSchema';
import type { Condition, SurvivalRule } from './survivalRuleSchema';

// ⚠️ Local literal fixtures, not `@gol/test-utils`'s canonical organisms: `@gol/test-utils`
// imports `@gol/domain`, so a dependency from here would close a package cycle
// (`ruleReferenceIndex.test.ts` records the identical constraint).

const summary = (id: string, organismIds: string[]) => ({ id, organismIds });

const targets = (pattern: string): Condition => ({
  property: 'organismType',
  operator: 'eq',
  pattern,
});

/** A rule whose `organismType` conditions name `targetIds`, in that order. */
function rule(id: string, ...targetIds: readonly string[]): SurvivalRule {
  return {
    id,
    contentHash: `content-${id}`,
    conditions: [{ property: 'age', operator: 'gt', pattern: 0 }, ...targetIds.map(targets)],
    payload: { summary: `rule ${id}`, action: 'survive' },
  };
}

function organism(
  id: string,
  ...survivalRules: readonly SurvivalRule[]
): Pick<Organism, 'id' | 'survivalRules'> {
  return { id, survivalRules: [...survivalRules] };
}

const openBattle = (id: string | null, organismIds: string[]): OpenBattleUsage => ({
  id,
  organismIds,
});

describe('organismDeleteVerdict', () => {
  it('is "protected" for Conway\'s Classic even with no usage at all', () => {
    const usage = buildUsageIndex([]);
    const ruleIndex = buildRuleReferenceIndex([]);

    expect(organismDeleteVerdict(CONWAYS_CLASSIC_ID, usage, ruleIndex)).toEqual({
      kind: 'protected',
    });
  });

  it('is "protected" for Conway\'s Classic even when a battle places it and a rule targets it (M9 wins over usage)', () => {
    const usage = buildUsageIndex([summary('battle-1', [CONWAYS_CLASSIC_ID])]);
    const ruleIndex = buildRuleReferenceIndex([organism('hunter', rule('r1', CONWAYS_CLASSIC_ID))]);

    expect(organismDeleteVerdict(CONWAYS_CLASSIC_ID, usage, ruleIndex)).toEqual({
      kind: 'protected',
    });
  });

  it('is "blocked" with only battles when a battle places the organism and nothing references it', () => {
    const usage = buildUsageIndex([summary('battle-1', ['prey'])]);
    const ruleIndex = buildRuleReferenceIndex([]);

    expect(organismDeleteVerdict('prey', usage, ruleIndex)).toEqual({
      kind: 'blocked',
      battles: [{ battleId: 'battle-1', placedOnLiveGrid: false }],
      referencingOrganismIds: [],
    });
  });

  it('is "blocked" with only rule references when no battle places the organism but a rule targets it', () => {
    const usage = buildUsageIndex([]);
    const ruleIndex = buildRuleReferenceIndex([organism('hunter', rule('r1', 'prey'))]);

    expect(organismDeleteVerdict('prey', usage, ruleIndex)).toEqual({
      kind: 'blocked',
      battles: [],
      referencingOrganismIds: ['hunter'],
    });
  });

  it('is "blocked" with BOTH lists when a battle places it AND a rule targets it (FD4 — one verdict, both reasons)', () => {
    const usage = buildUsageIndex([summary('battle-1', ['prey'])]);
    const ruleIndex = buildRuleReferenceIndex([organism('hunter', rule('r1', 'prey'))]);

    expect(organismDeleteVerdict('prey', usage, ruleIndex)).toEqual({
      kind: 'blocked',
      battles: [{ battleId: 'battle-1', placedOnLiveGrid: false }],
      referencingOrganismIds: ['hunter'],
    });
  });

  it('is "allowed" when no battle places it and no rule targets it', () => {
    const usage = buildUsageIndex([summary('battle-1', ['someone-else'])]);
    const ruleIndex = buildRuleReferenceIndex([organism('hunter', rule('r1', 'someone-else'))]);

    expect(organismDeleteVerdict('unused', usage, ruleIndex)).toEqual({ kind: 'allowed' });
  });

  it('is "allowed" for an organism whose only rule reference is to itself (Decision E.5 — a self-reference never blocks its own delete)', () => {
    const usage = buildUsageIndex([]);
    // `rule('r1', 'solo')` inside the organism named 'solo' is a self-reference; `ruleTargetIds`
    // already drops it, so the index carries no entry for 'solo' at all.
    const ruleIndex = buildRuleReferenceIndex([organism('solo', rule('r1', 'solo'))]);

    expect(organismDeleteVerdict('solo', usage, ruleIndex)).toEqual({ kind: 'allowed' });
  });

  it('is "blocked" with a null battleId for a never-saved open battle placing the organism (the openBattle union)', () => {
    const usage = buildUsageIndex([]);
    const ruleIndex = buildRuleReferenceIndex([]);

    expect(organismDeleteVerdict('fresh', usage, ruleIndex, openBattle(null, ['fresh']))).toEqual({
      kind: 'blocked',
      battles: [{ battleId: null, placedOnLiveGrid: true }],
      referencingOrganismIds: [],
    });
  });

  it('stays "blocked" for the erase-window case: a saved entry for the open battle whose live grid no longer places it (Story 4.19\'s union must not be undone here)', () => {
    const usage = buildUsageIndex([summary('battle-1', ['shared'])]);
    const ruleIndex = buildRuleReferenceIndex([]);

    expect(organismDeleteVerdict('shared', usage, ruleIndex, openBattle('battle-1', []))).toEqual({
      kind: 'blocked',
      battles: [{ battleId: 'battle-1', placedOnLiveGrid: false }],
      referencingOrganismIds: [],
    });
  });

  it('collapses two rules (from one organism) targeting it into ONE referencingOrganismIds entry', () => {
    const usage = buildUsageIndex([]);
    const ruleIndex = buildRuleReferenceIndex([
      organism('hunter', rule('r1', 'prey'), rule('r2', 'prey')),
    ]);

    const verdict = organismDeleteVerdict('prey', usage, ruleIndex);
    expect(verdict).toEqual({
      kind: 'blocked',
      battles: [],
      referencingOrganismIds: ['hunter'],
    });
  });
});
