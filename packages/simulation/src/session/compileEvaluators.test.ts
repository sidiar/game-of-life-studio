import { CONWAYS_CLASSIC } from '@gol/domain';
import { MOCK_ORGANISM_IDS, createMockOrganisms } from '@gol/test-utils';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { CellSubject } from '../gol/cellSubject';
import type { SurvivalRule, SurvivalRules } from '../gol/survivalRules';
import { compileSession } from './compileEvaluators';
import type { CompilableOrganism, OrganismEvaluators } from './compileEvaluators';
import { isRuleCompilationError } from './validateRules';

const cell = (over: Partial<CellSubject> = {}): CellSubject => ({
  state: 'empty',
  organismType: null,
  age: 0,
  neighborCount: 0,
  occupantNeighborCount: 0,
  ...over,
});

const mocks = (): CompilableOrganism[] => createMockOrganisms();

const evaluatorsFor = (
  session: ReturnType<typeof compileSession>,
  ref: number,
): OrganismEvaluators => {
  const evaluators = session.evaluatorsByRef[ref];
  if (evaluators === null || evaluators === undefined)
    throw new Error(`no evaluators at ref ${ref}`);
  return evaluators;
};

const rule = (over: Partial<SurvivalRule> = {}): SurvivalRule => ({
  id: 'r',
  contentHash: 'h',
  conditions: [{ property: 'cellState', operator: 'eq', pattern: 'alive' }],
  payload: { summary: 's', action: 'survive' },
  ...over,
});

describe('compileSession — the ref-indexed evaluator table (FD2, M14)', () => {
  it('sizes the table at roster length + 1 with slot 0 reserved for empty', () => {
    const organisms = mocks();
    const session = compileSession(organisms);

    expect(session.evaluatorsByRef).toHaveLength(organisms.length + 1);
    // Slot 0 is a deliberate `null`, not a hole: `evaluatorsByRef[0]` is the EMPTY cell value and
    // belongs to no organism.
    expect(session.evaluatorsByRef[0]).toBeNull();
    expect(session.refById.get(MOCK_ORGANISM_IDS.aggressiveColonizer)).toBe(1);
  });

  it('gives each organism a death evaluator and a birth/survival evaluator', () => {
    const session = compileSession(mocks());
    const aggressive = evaluatorsFor(session, 1);

    expect(typeof aggressive.resolvesToDeath).toBe('function');
    expect(typeof aggressive.resolveBirthSurvival).toBe('function');
  });
});

describe('phase partitioning happens once at compile time (AC1, AR-18, RFC-004 §2.3/§3.5)', () => {
  it('routes `die` rules to the death evaluator and NOWHERE else', () => {
    // Aggressive Colonizer dies with more than 5 neighbours; that rule must not be reachable from
    // Phase 2, or death-before-survival (M10) stops being a phase property.
    const session = compileSession(mocks());
    const aggressive = evaluatorsFor(session, 1);
    const overcrowded = cell({ state: 'alive', organismType: 1, neighborCount: 6 });

    expect(aggressive.resolvesToDeath(overcrowded)).toBe(true);
    // The birth/survival partition still answers `survive` for the same cell — Phase 1 wins by
    // running first, not by Phase 2 knowing about death.
    expect(aggressive.resolveBirthSurvival(overcrowded)).toBe('survive');
  });

  it('routes `born` and `survive` rules to the birth/survival evaluator only', () => {
    const session = compileSession(mocks());
    const aggressive = evaluatorsFor(session, 1);

    expect(aggressive.resolveBirthSurvival(cell({ state: 'empty', neighborCount: 3 }))).toBe(
      'born',
    );
    expect(aggressive.resolvesToDeath(cell({ state: 'empty', neighborCount: 3 }))).toBe(false);
  });

  it('never collapses "no rule matched" into "die" (Trap 9, M10)', () => {
    // Conway's Classic has no `die` rule at all: its death evaluator must be false for every cell,
    // and a non-surviving live cell must come back as `null`, not `'die'`. Implicit death is
    // resolved at cycle end by Story 3.6, not here.
    const session = compileSession([
      { id: 'conways-classic', survivalRules: CONWAYS_CLASSIC.survivalRules },
    ]);
    const conway = evaluatorsFor(session, 1);
    const lonely = cell({ state: 'alive', organismType: 1, neighborCount: 1 });

    expect(conway.resolvesToDeath(lonely)).toBe(false);
    expect(conway.resolveBirthSurvival(lonely)).toBeNull();
  });

  it('preserves the persisted order verbatim within each partition (FR-2.6)', () => {
    // Two `survive` rules both satisfied by the same cell: the FIRST in persisted order wins, and
    // reversing the input reverses the winner. A partition is a filter, never a sort.
    const first = rule({
      id: 'a',
      contentHash: 'ha',
      payload: { summary: 'first', action: 'survive' },
    });
    const second = rule({
      id: 'b',
      contentHash: 'hb',
      payload: { summary: 'second', action: 'born' },
    });
    const alive = cell({ state: 'alive', organismType: 1 });

    const forward = compileSession([{ id: 'o', survivalRules: [first, second] }]);
    expect(evaluatorsFor(forward, 1).resolveBirthSurvival(alive)).toBe('survive');

    const reversed = compileSession([{ id: 'o', survivalRules: [second, first] }]);
    expect(evaluatorsFor(reversed, 1).resolveBirthSurvival(alive)).toBe('born');
  });
});

describe('interning (AC3/AC4, AR-8, Decision E.3)', () => {
  it("fires a targeting rule against the TARGET's ref and no other", () => {
    // Chaotic Spreader's CHAOTIC_BORN targets Aggressive Colonizer by LIBRARY ID; after
    // compilation the hot path compares numbers only.
    const session = compileSession(mocks());
    const chaotic = evaluatorsFor(session, 3);
    const aggressiveRef = session.refById.get(MOCK_ORGANISM_IDS.aggressiveColonizer) ?? 0;
    const patientRef = session.refById.get(MOCK_ORGANISM_IDS.patientDefender) ?? 0;

    expect(
      chaotic.resolveBirthSurvival(cell({ state: 'occupied', organismType: aggressiveRef })),
    ).toBe('born');
    expect(
      chaotic.resolveBirthSurvival(cell({ state: 'occupied', organismType: patientRef })),
    ).toBeNull();
  });

  it('is the counterpart to cellSubject.test.ts — a raw library-id string DOES match once interned', () => {
    // Before compilation an `organismType` pattern is a string and `eq` is `===`, so it matches
    // nothing (cellSubject.test.ts pins that as today's correct behaviour for the uncompiled
    // layer). This is the same rule, after this story's interning step.
    const session = compileSession(mocks());
    const chaotic = evaluatorsFor(session, 3);

    expect(chaotic.resolveBirthSurvival(cell({ state: 'occupied', organismType: 1 }))).toBe('born');
  });

  it('compiles a target absent from the battle to a never-match sentinel', () => {
    // Chaotic Spreader alone: Aggressive Colonizer is not in this roster, so "occupied by
    // Aggressive Colonizer" is simply false — on an occupied cell AND on an empty one.
    const chaoticOnly = mocks().filter(
      (organism) => organism.id === MOCK_ORGANISM_IDS.chaoticSpreader,
    );
    const session = compileSession(chaoticOnly);
    const chaotic = evaluatorsFor(session, 1);

    expect(chaotic.resolveBirthSurvival(cell({ state: 'occupied', organismType: 1 }))).toBeNull();
    expect(chaotic.resolveBirthSurvival(cell({ state: 'occupied', organismType: 2 }))).toBeNull();
    expect(chaotic.resolveBirthSurvival(cell({ state: 'empty', organismType: null }))).toBeNull();
  });

  it('never matches an EMPTY cell through a lone organismType condition (Trap 3)', () => {
    // The damaging shape, and the one the mock fixture cannot expose: CHAOTIC_BORN also carries
    // `cellState eq occupied`, which masks a bad sentinel. A rule whose ONLY condition targets an
    // absent organism is what a `null`/`undefined` sentinel turns into a rule that populates the
    // entire grid — `organismType` is the only nullable subject field and `eq` is `===`.
    const targeting: SurvivalRules = [
      rule({
        contentHash: 'targeting',
        conditions: [
          { property: 'organismType', operator: 'eq', pattern: 'absent-from-this-battle' },
        ],
        payload: { summary: 'colonize', action: 'born' },
      }),
    ];
    const session = compileSession([{ id: 'lone', survivalRules: targeting }]);
    const lone = evaluatorsFor(session, 1);

    expect(lone.resolveBirthSurvival(cell({ state: 'empty', organismType: null }))).toBeNull();
    expect(lone.resolveBirthSurvival(cell({ state: 'occupied', organismType: 1 }))).toBeNull();
    // …and the same rule against a target that IS present resolves, so the sentinel is not simply
    // breaking every organismType rule.
    const present = compileSession([
      { id: 'absent-from-this-battle', survivalRules: [rule()] },
      { id: 'lone', survivalRules: targeting },
    ]);
    expect(
      evaluatorsFor(present, 2).resolveBirthSurvival(cell({ state: 'occupied', organismType: 1 })),
    ).toBe('born');
  });

  it('resolves the SAME organism to different refs in different rosters (Decision E.4)', () => {
    // The whole reason the cache is session-scoped. Aggressive Colonizer is ref 1 in one battle
    // and ref 2 in the other, and Chaotic Spreader's compiled rule must follow it.
    const all = mocks();
    const chaotic = all.filter((organism) => organism.id === MOCK_ORGANISM_IDS.chaoticSpreader);
    const aggressive = all.filter(
      (organism) => organism.id === MOCK_ORGANISM_IDS.aggressiveColonizer,
    );

    const aggressiveFirst = compileSession([...aggressive, ...chaotic]);
    const chaoticFirst = compileSession([...chaotic, ...aggressive]);

    expect(aggressiveFirst.refById.get(MOCK_ORGANISM_IDS.aggressiveColonizer)).toBe(1);
    expect(chaoticFirst.refById.get(MOCK_ORGANISM_IDS.aggressiveColonizer)).toBe(2);

    expect(
      evaluatorsFor(aggressiveFirst, 2).resolveBirthSurvival(
        cell({ state: 'occupied', organismType: 1 }),
      ),
    ).toBe('born');
    expect(
      evaluatorsFor(aggressiveFirst, 2).resolveBirthSurvival(
        cell({ state: 'occupied', organismType: 2 }),
      ),
    ).toBeNull();

    expect(
      evaluatorsFor(chaoticFirst, 1).resolveBirthSurvival(
        cell({ state: 'occupied', organismType: 2 }),
      ),
    ).toBe('born');
    expect(
      evaluatorsFor(chaoticFirst, 1).resolveBirthSurvival(
        cell({ state: 'occupied', organismType: 1 }),
      ),
    ).toBeNull();
  });
});

describe('the session cache (AC2/AC6, FD3, Decision E.4)', () => {
  it('returns ONE compiled pair for two organisms with byte-identical rules', () => {
    // Observable, not asserted: closure identity. Same session, same id->ref map, so sharing is
    // safe — and it is the cache hit.
    const rules: SurvivalRules = [rule()];
    const session = compileSession([
      { id: 'twin-a', survivalRules: rules.map((r) => ({ ...r })) },
      { id: 'twin-b', survivalRules: rules.map((r) => ({ ...r })) },
    ]);

    expect(session.evaluatorsByRef[1]).toBe(session.evaluatorsByRef[2]);
  });

  it('recompiles when a contentHash changes', () => {
    const session = compileSession([
      { id: 'a', survivalRules: [rule({ contentHash: 'h1' })] },
      { id: 'b', survivalRules: [rule({ contentHash: 'h2' })] },
    ]);

    expect(session.evaluatorsByRef[1]).not.toBe(session.evaluatorsByRef[2]);
  });

  it('keys on the ORDERED join, so reordered rules are not a cache hit', () => {
    const a = rule({ id: 'a', contentHash: 'ha' });
    const b = rule({ id: 'b', contentHash: 'hb' });
    const session = compileSession([
      { id: 'one', survivalRules: [a, b] },
      { id: 'two', survivalRules: [b, a] },
    ]);

    // Order is priority (FR-2.6), so these are different evaluators. A `contentHash` SET would
    // have collapsed them.
    expect(session.evaluatorsByRef[1]).not.toBe(session.evaluatorsByRef[2]);
  });

  it('is immune to a duplicate contentHash inside one rule list (deferred-work: the E.4 collision)', () => {
    // `SurvivalRulesSchema` has no uniqueness refine, so this array is legal. Keying per RULE is
    // where it collides; keying on the ordered join of the LIST is not affected.
    const duplicated: SurvivalRules = [
      rule({ id: 'a', contentHash: 'same', payload: { summary: 'first', action: 'survive' } }),
      rule({ id: 'b', contentHash: 'same', payload: { summary: 'second', action: 'born' } }),
    ];
    const session = compileSession([
      { id: 'dup', survivalRules: duplicated },
      { id: 'single', survivalRules: [duplicated[0] as SurvivalRule] },
    ]);

    expect(session.evaluatorsByRef[1]).not.toBe(session.evaluatorsByRef[2]);
    expect(
      evaluatorsFor(session, 1).resolveBirthSurvival(cell({ state: 'alive', organismType: 1 })),
    ).toBe('survive');
  });

  it('never hits across sessions — a second session compiles its own closures', () => {
    const organisms = mocks();
    const first = compileSession(organisms);
    const second = compileSession(organisms);

    // Not a performance detail: a cross-session hit would return closures baked with the OTHER
    // battle's id->ref map.
    expect(second.evaluatorsByRef[1]).not.toBe(first.evaluatorsByRef[1]);
  });

  it('is not reachable from module scope — an empty roster carries no leftover state', () => {
    const empty = compileSession([]);
    expect(empty.evaluatorsByRef).toEqual([null]);
    expect(empty.refById.size).toBe(0);
  });
});

describe('compileSession is eager and fails loudly (AC7/AC8, FD4, FD5)', () => {
  it('throws before compiling ANY organism when a later one is malformed', () => {
    const organisms: CompilableOrganism[] = [
      { id: 'good', survivalRules: [rule()] },
      { id: 'bad', survivalRules: [{ ...rule(), conditions: [] }] },
    ];

    expect(() => compileSession(organisms)).toThrow(/Cannot compile organism "bad"/);
  });

  it('carries the organism and rule ids on the thrown error', () => {
    let caught: unknown;
    try {
      compileSession([{ id: 'bad', survivalRules: [{ ...rule(), id: 'rule-9', conditions: [] }] }]);
    } catch (error) {
      caught = error;
    }
    if (!isRuleCompilationError(caught)) throw new Error('expected a RuleCompilationError');
    expect(caught.organismId).toBe('bad');
    expect(caught.ruleId).toBe('rule-9');
  });
});

describe('MAX_RELEVANT_AGE rides along on the session (AC5)', () => {
  it('is one number for the whole battle', () => {
    // Patient Defender's `age gte 8` sets it; Conway and the others contribute nothing.
    expect(compileSession(mocks()).maxRelevantAge).toBe(9);
    expect(
      compileSession([{ id: 'c', survivalRules: CONWAYS_CLASSIC.survivalRules }]).maxRelevantAge,
    ).toBe(7);
  });
});

// Trap 6 — the invariant examples cannot pin, because the damage is a WRITE somewhere in a nested
// structure the assertions never look at. AR-41 assigns no property test to this story; this is
// the one place a generated corpus earns its place, and it is the shape Story 3.5's phase-purity
// properties will extend.
describe('compilation never mutates its input (Trap 6, fast-check)', () => {
  const conditionArb = fc.oneof(
    fc.record({
      property: fc.constant('organismType' as const),
      operator: fc.constant('eq' as const),
      pattern: fc.constantFrom('org-a', 'org-b', 'absent-from-this-battle'),
    }),
    fc.record({
      property: fc.constantFrom(
        'age' as const,
        'neighborCount' as const,
        'occupantNeighborCount' as const,
      ),
      operator: fc.constantFrom(
        'eq' as const,
        'gt' as const,
        'lt' as const,
        'gte' as const,
        'lte' as const,
      ),
      pattern: fc.integer({ min: 0, max: 20 }),
    }),
    fc.record({
      property: fc.constant('cellState' as const),
      operator: fc.constant('eq' as const),
      pattern: fc.constantFrom('empty' as const, 'alive' as const, 'occupied' as const),
    }),
  );

  const ruleArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    contentHash: fc.string({ minLength: 1, maxLength: 8 }),
    conditions: fc.array(conditionArb, { minLength: 1, maxLength: 4 }),
    payload: fc.record({
      summary: fc.constant('generated'),
      action: fc.constantFrom('born' as const, 'survive' as const, 'die' as const),
    }),
  });

  it('leaves every input rule, condition and array byte-identical', () => {
    fc.assert(
      fc.property(fc.array(ruleArb, { minLength: 1, maxLength: 5 }), (rules) => {
        const organisms: CompilableOrganism[] = [
          { id: 'org-a', survivalRules: rules as SurvivalRules },
          { id: 'org-b', survivalRules: rules as SurvivalRules },
        ];
        const before = JSON.stringify(rules);

        compileSession(organisms);

        expect(JSON.stringify(rules)).toBe(before);
      }),
    );
  });

  it('does not throw on a DEEP-FROZEN rule list — the rewrite allocates rather than assigns', () => {
    // CONWAYS_CLASSIC is deepFrozen in @gol/domain, so an in-place pattern rewrite would throw in
    // strict mode (module code is always strict) or, worse, silently no-op.
    const conway = { id: 'conways-classic', survivalRules: CONWAYS_CLASSIC.survivalRules };
    expect(() => compileSession([conway, ...mocks()])).not.toThrow();
    expect(Object.isFrozen(CONWAYS_CLASSIC.survivalRules)).toBe(true);
  });
});
