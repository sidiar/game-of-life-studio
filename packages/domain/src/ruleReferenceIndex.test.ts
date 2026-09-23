import { describe, expect, it } from 'vitest';
import { ORGANISM_SCHEMA_VERSION, OrganismSchema, type Organism } from './organismSchema';
import type { Condition, SurvivalRule } from './survivalRuleSchema';
import {
  buildRuleReferenceIndex,
  referencingOrganismIds,
  ruleTargetIds,
} from './ruleReferenceIndex';

// ⚠️ Fixtures are local literals rather than `@gol/test-utils`' canonical organisms, which is the
// repo's rule everywhere else: `@gol/test-utils` imports `@gol/domain`, so a dependency from here
// would close a package cycle (`workspaceExportProjection.test.ts` records the same constraint).

/** A non-`organismType` condition on every rule: the branch the target scan must skip. */
const AGE_CONDITION: Condition = { property: 'age', operator: 'gt', pattern: 0 };

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
    conditions: [AGE_CONDITION, ...targetIds.map(targets)],
    payload: { summary: `rule ${id}`, action: 'survive' },
  };
}

function organism(
  id: string,
  ...survivalRules: readonly SurvivalRule[]
): Pick<Organism, 'id' | 'survivalRules'> {
  return { id, survivalRules: [...survivalRules] };
}

describe('ruleTargetIds', () => {
  it('returns every organism this organism’s rules target, in condition order (the forward edge Story 5.4 walks)', () => {
    expect(ruleTargetIds(organism('hunter', rule('r1', 'prey'), rule('r2', 'rival')))).toEqual([
      'prey',
      'rival',
    ]);
  });

  it('returns a target named by two rules once (the forward edge is a set of organisms, not a rule count)', () => {
    expect(ruleTargetIds(organism('hunter', rule('r1', 'prey'), rule('r2', 'prey')))).toEqual([
      'prey',
    ]);
  });

  it('excludes the organism’s own id (Decision E.5 — deleting an organism deletes its own rules with it)', () => {
    expect(ruleTargetIds(organism('hunter', rule('r1', 'hunter', 'prey')))).toEqual(['prey']);
  });

  it('returns an empty array for an organism with no rules at all', () => {
    expect(ruleTargetIds(organism('inert'))).toEqual([]);
  });

  it('returns an empty array for a rule carrying no organismType condition (every other property is skipped)', () => {
    expect(ruleTargetIds(organism('inert', rule('r1')))).toEqual([]);
  });

  it('keeps a target that matches no organism in the library (a dangling id is indexed, never filtered — Story 5.8 asserts on it)', () => {
    expect(ruleTargetIds(organism('hunter', rule('r1', 'deleted-long-ago')))).toEqual([
      'deleted-long-ago',
    ]);
  });
});

describe('buildRuleReferenceIndex', () => {
  it('records the referencing organism and the rule under the target id (Decision E.5)', () => {
    const index = buildRuleReferenceIndex([organism('hunter', rule('r1', 'prey'))]);

    expect(index.get('prey')).toEqual([{ organismId: 'hunter', ruleId: 'r1' }]);
  });

  it('counts two rules of one organism naming the same target as two references (FR-1.7 renders a RULE count)', () => {
    const index = buildRuleReferenceIndex([
      organism('hunter', rule('r1', 'prey'), rule('r2', 'prey')),
    ]);

    expect(index.get('prey')).toEqual([
      { organismId: 'hunter', ruleId: 'r1' },
      { organismId: 'hunter', ruleId: 'r2' },
    ]);
  });

  it('counts two organismType conditions in ONE rule naming the same target as one reference (a rule references a target once)', () => {
    const index = buildRuleReferenceIndex([organism('hunter', rule('r1', 'prey', 'prey'))]);

    expect(index.get('prey')).toEqual([{ organismId: 'hunter', ruleId: 'r1' }]);
  });

  it('lists references in organism input order, then rule order within an organism (survivalRules order is priority, FR-2.6)', () => {
    const index = buildRuleReferenceIndex([
      organism('hunter', rule('h2', 'prey'), rule('h1', 'prey')),
      organism('rival', rule('v1', 'prey')),
    ]);

    expect(index.get('prey')).toEqual([
      { organismId: 'hunter', ruleId: 'h2' },
      { organismId: 'hunter', ruleId: 'h1' },
      { organismId: 'rival', ruleId: 'v1' },
    ]);
  });

  it('emits no entry for an organism whose rule targets itself, under its own key or any other (Decision E.5 — a self-reference must not block its own delete)', () => {
    const index = buildRuleReferenceIndex([organism('hunter', rule('r1', 'hunter'))]);

    expect(index.get('hunter')).toBeUndefined();
    expect(index.size).toBe(0);
  });

  it('indexes a target that matches no organism in the input (FD8 — filtering would hide the corruption Story 5.8 exists to catch)', () => {
    const index = buildRuleReferenceIndex([organism('hunter', rule('r1', 'deleted-long-ago'))]);

    expect(index.get('deleted-long-ago')).toEqual([{ organismId: 'hunter', ruleId: 'r1' }]);
  });

  it('has no entry for an organism nothing targets (the caller reads `?.length ?? 0`)', () => {
    const index = buildRuleReferenceIndex([organism('hunter', rule('r1', 'prey'))]);

    expect(index.get('hunter')).toBeUndefined();
    expect(index.get('hunter')?.length ?? 0).toBe(0);
  });

  it('returns an empty index for an empty library', () => {
    expect(buildRuleReferenceIndex([]).size).toBe(0);
  });

  it('mutates no input organism and returns references that alias nothing in the input (the index is a fresh derivation, never stored)', () => {
    const hunter = organism('hunter', rule('r1', 'prey'));
    const before = structuredClone(hunter);

    const index = buildRuleReferenceIndex([hunter]);

    expect(hunter).toEqual(before);
    expect(index.get('prey')).not.toBe(hunter.survivalRules);
    expect(index.get('prey')?.[0]).not.toBe(hunter.survivalRules[0]);
  });

  it('accepts a full Organism parsed by OrganismSchema without narrowing (no fixture here can be invalid unnoticed)', () => {
    const hunter: Organism = OrganismSchema.parse({
      schemaVersion: ORGANISM_SCHEMA_VERSION,
      id: 'hunter',
      name: 'Hunter',
      colorToken: 'organism-crimson',
      dominance: 10,
      agingEnabled: false,
      survivalRules: [rule('r1', 'prey')],
    });

    expect(buildRuleReferenceIndex([hunter]).get('prey')).toEqual([
      { organismId: 'hunter', ruleId: 'r1' },
    ]);
    expect(ruleTargetIds(hunter)).toEqual(['prey']);
  });
});

describe('referencingOrganismIds', () => {
  it('de-duplicates an organism that targets X from three rules while the index still counts three rules (FD5 — one structure, both answers)', () => {
    const index = buildRuleReferenceIndex([
      organism('hunter', rule('r1', 'prey'), rule('r2', 'prey'), rule('r3', 'prey')),
    ]);

    expect(index.get('prey')?.length).toBe(3);
    expect(referencingOrganismIds(index, 'prey')).toEqual(['hunter']);
  });

  it('lists distinct referencing organisms in first-reference order (what Story 4.20’s popover and Story 4.21’s block name)', () => {
    const index = buildRuleReferenceIndex([
      organism('rival', rule('v1', 'prey')),
      organism('hunter', rule('h1', 'prey')),
      organism('rival', rule('v2', 'prey')),
    ]);

    expect(referencingOrganismIds(index, 'prey')).toEqual(['rival', 'hunter']);
  });

  it('returns an empty array for an id nothing references (a list, not a map read — never undefined)', () => {
    const index = buildRuleReferenceIndex([organism('hunter', rule('r1', 'prey'))]);

    expect(referencingOrganismIds(index, 'hunter')).toEqual([]);
  });
});
