import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELL_STATES, NEW_ORGANISM_DOMINANCE } from '@gol/domain';
import { compileSession } from '@gol/simulation';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import type { ConditionDraft } from './conditionDraft';
import { createNewOrganismDraft, validateOrganismDraft } from './organismDraft';
import { PREVIEW_ORGANISM_ID } from './previewGrid';
import { previewOrganismFrom, PREVIEW_ORGANISM_NAME } from './previewOrganism';
import { createNewRuleDraft, ruleDraftFrom, type RuleDraft } from './ruleDraft';

// Deterministic id counter, never `crypto` — see `ruleDraft.test.ts`'s identical helper.
function counter() {
  let n = 0;
  return () => `c${++n}`;
}

const conwayDrafts = () =>
  CONWAYS_CLASSIC.survivalRules.map((rule) => ruleDraftFrom(rule, counter()));

describe('previewOrganismFrom', () => {
  it('a fresh draft (zero rules) yields a runnable organism with the draft colour and no rules', () => {
    const draft = createNewOrganismDraft([]);
    const organism = previewOrganismFrom(draft);
    expect(organism).not.toBeNull();
    expect(organism).toEqual({
      id: PREVIEW_ORGANISM_ID,
      name: PREVIEW_ORGANISM_NAME,
      colorToken: draft.colorToken,
      dominance: NEW_ORGANISM_DOMINANCE,
      survivalRules: [],
    });
  });

  it("Conway's rules as drafts compile to two rules, each stamped with its own draft id as contentHash", () => {
    const drafts = conwayDrafts();
    const organism = previewOrganismFrom({ colorToken: 'vermillion', survivalRules: drafts });
    expect(organism).not.toBeNull();
    expect(organism!.survivalRules).toHaveLength(2);
    organism!.survivalRules.forEach((rule, i) => {
      expect(rule.contentHash).toBe(drafts[i]!.id);
      expect(rule.conditions).toEqual(CONWAYS_CLASSIC.survivalRules[i]!.conditions);
    });
  });

  it('a zero-condition rule anywhere makes the draft unrunnable', () => {
    const drafts = [conwayDrafts()[0]!, createNewRuleDraft('empty')];
    expect(previewOrganismFrom({ colorToken: 'vermillion', survivalRules: drafts })).toBeNull();
  });

  it('an unparseable condition (neighborCount eq empty text) makes the draft unrunnable', () => {
    const rule: RuleDraft = {
      id: 'r1',
      conditions: [{ id: 'c1', property: 'neighborCount', operator: 'eq', pattern: '' }],
      payload: { summary: '', action: 'born' },
    };
    expect(previewOrganismFrom({ colorToken: 'vermillion', survivalRules: [rule] })).toBeNull();
  });

  it('the compile guarantee: compileSession does not throw for a fresh draft or Conway drafts, and ref 1 is the preview id', () => {
    const fresh = previewOrganismFrom(createNewOrganismDraft([]));
    expect(fresh).not.toBeNull();
    // A plain call IS the no-throw proof — `compileSession` throwing fails the test outright.
    expect(compileSession([fresh!]).refById.get(PREVIEW_ORGANISM_ID)).toBe(1);

    const conway = previewOrganismFrom({ colorToken: 'vermillion', survivalRules: conwayDrafts() });
    expect(conway).not.toBeNull();
    expect(compileSession([conway!]).refById.get(PREVIEW_ORGANISM_ID)).toBe(1);
  });

  it('an organismType condition targeting a name absent from the one-organism roster compiles to a never-match, not an error (Decision E.3)', () => {
    const rule: RuleDraft = {
      id: 'r1',
      conditions: [
        { id: 'c1', property: 'organismType', operator: 'eq', pattern: 'conways-classic' },
      ],
      payload: { summary: '', action: 'survive' },
    };
    const organism = previewOrganismFrom({ colorToken: 'vermillion', survivalRules: [rule] });
    expect(organism).not.toBeNull();
    expect(compileSession([organism!]).refById.size).toBe(1);
  });

  it('the returned object satisfies SimulationOrganism with exactly its five keys', () => {
    const organism = previewOrganismFrom({
      colorToken: 'vermillion',
      survivalRules: conwayDrafts(),
    });
    expect(organism).not.toBeNull();
    expect(Object.keys(organism!).sort()).toEqual(
      ['colorToken', 'dominance', 'id', 'name', 'survivalRules'].sort(),
    );
  });
});

// The four condition-draft shapes over a small, deliberately edge-heavy pattern pool — enough to
// hit valid, invalid and boundary text for every numeric property without fast-check's default
// string generator drowning out the interesting cases (the `conditionDraft.test.ts` sibling
// arbitrary is over the FULL text space; this one targets the previewOrganismFrom <-> Save-gate
// agreement specifically, so a tight, named pool is more informative per run).
const TEXT_POOL = ['', 'abc', '-1', '0', '3', '8', '9', '999', '1000'];
const ORGANISM_TYPE_POOL = ['', 'conways-classic'];
const NUMERIC_PROPERTIES = ['age', 'neighborCount', 'occupantNeighborCount'] as const;

const conditionArbitrary: fc.Arbitrary<ConditionDraft> = fc.oneof(
  fc.constantFrom(...CELL_STATES).map((pattern): ConditionDraft => ({
    id: 'fc',
    property: 'cellState',
    operator: 'eq',
    pattern,
  })),
  fc.constantFrom(...ORGANISM_TYPE_POOL).map((pattern): ConditionDraft => ({
    id: 'fc',
    property: 'organismType',
    operator: 'eq',
    pattern,
  })),
  fc
    .record({
      property: fc.constantFrom(...NUMERIC_PROPERTIES),
      pattern: fc.constantFrom(...TEXT_POOL),
    })
    .map(({ property, pattern }): ConditionDraft => ({
      id: 'fc',
      property,
      operator: 'eq',
      pattern,
    })),
  fc
    .record({
      property: fc.constantFrom(...NUMERIC_PROPERTIES),
      min: fc.constantFrom(...TEXT_POOL),
      max: fc.constantFrom(...TEXT_POOL),
    })
    .map(({ property, min, max }): ConditionDraft => ({
      id: 'fc',
      property,
      operator: 'range',
      pattern: [min, max],
    })),
);

const ruleArbitrary: fc.Arbitrary<RuleDraft> = fc
  .array(conditionArbitrary, { minLength: 0, maxLength: 3 })
  .map((conditions): RuleDraft => ({
    id: 'rule',
    conditions: conditions.map((c) => ({ ...c, id: 'c' })),
    payload: { summary: '', action: 'born' },
  }));

const draftArbitrary = fc.array(ruleArbitrary, { minLength: 0, maxLength: 3 });

describe('fast-check: previewOrganismFrom agrees with validateOrganismDraft, and every non-null result compiles', () => {
  it('previewOrganismFrom is null iff the draft has rule/condition errors, and a non-null result compiles', () => {
    fc.assert(
      fc.property(draftArbitrary, (survivalRules) => {
        const draft = { ...createNewOrganismDraft([]), name: 'x', survivalRules };
        const organism = previewOrganismFrom(draft);
        const errors = validateOrganismDraft(draft);
        expect(organism === null).toBe(errors.length > 0);
        if (organism !== null) {
          expect(() => compileSession([organism])).not.toThrow();
        }
      }),
      { numRuns: 200 },
    );
  });
});
