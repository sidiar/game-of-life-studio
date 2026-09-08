// AC4/AC5's assignability pin, and the reason it is a test file rather than a comment: RFC-004
// §2.4 claims "persisted data feeds the engine without any mapping layer", and the only thing that
// can prove that claim is `tsc`. If these assignments ever stop compiling, the two shapes have
// drifted — and under Story 3.2's FD1 (declaring Action/SurvivalPayload/SurvivalRule/SurvivalRules
// in this package rather than importing @gol/domain's), drift here is exactly the failure mode FD1
// accepts as the cost of keeping @gol/simulation self-describing.
//
// ⚠️ Spec-conflict flag (Dev Agent Record, FD1): AC4/FD1 ask for the pin to hold in BOTH
// directions. Only the DOMAIN -> ENGINE direction actually compiles, and it does so for a
// structural reason no implementation choice inside this story's scope can change: (1) engine
// Rule/RuleSet/Condition are `readonly` (AR-16 immutability, src/engine/rule.ts — out of scope to
// edit) while @gol/domain's Zod-inferred types are mutable, and TypeScript never allows assigning a
// readonly array into a mutable-typed reference regardless of element shape; (2) @gol/domain's
// Condition is a discriminated union with a narrowed `pattern` per branch, while the engine's
// generic Condition<Props> is deliberately ONE flat shape with `pattern: unknown` — the whole point
// of AR-16's domain-blindness. A strict supertype (the engine's) can never be reverse-assigned into
// a narrower discriminated union (the domain's) without a cast; narrowing the engine's Condition
// to fix that would re-introduce the exact GoL-awareness AR-16 exists to keep out of src/engine/.
// Both facts were confirmed empirically (`tsc` rejects every reverse-direction line attempted
// during development; see Dev Agent Record) rather than assumed. So this file pins the direction
// that is both SOUND and LOAD-BEARING — the one resolveCellAction and cellSelectors actually
// exercise at runtime — at all three levels (RuleSet, Rule, Condition), which is a strictly
// stronger pin than Story 3.1's AC5 (RuleSet only, Props defaulted to `string`).
//
// ⚠️ This file lives OUTSIDE src/engine/ on purpose. It must import @gol/domain, which the
// import-boundary block in eslint.config.mjs bans inside that directory. The AR-40 proof
// (src/engine/rulesEngine.test.ts) is the file that must stay GoL-free — a different file with a
// different job.
//
// It also carries the workspace-graph proof that Story 1.1's placeholder `SIMULATION_DEPENDS_ON`
// re-export used to carry: this import fails `tsc --noEmit` if the declared "@gol/domain": "*" edge
// stops resolving to that package's TS source. Under FD1 this is now the ONLY production-code-shaped
// place @gol/domain's types are exercised from this package — `src/gol/` declares its own.
//
// FD3 (Dev Agent Record): @gol/domain and this package's src/gol/ each export a type named
// `Condition` (and, as it turns out, also `SurvivalRule`/`SurvivalRules`) — this is the one file in
// the story that imports both of every pair into the same scope. @gol/domain's are aliased with a
// `Domain` prefix below; this package's own declarations keep the bare RFC-004 names, per Story
// 3.1's note that the engine's names are RFC-004's and stay as they are.
import { CONWAYS_CLASSIC } from '@gol/domain';
import type {
  Condition as DomainCondition,
  SurvivalRules as DomainSurvivalRules,
} from '@gol/domain';
import { describe, expect, it } from 'vitest';

import { firstSatisfiedBy } from './engine/firstSatisfiedBy';
import type { Condition, RuleSet } from './engine/rule';
import { cellSelectors } from './gol/cellSubject';
import type { CellProperty } from './gol/cellSubject';
import type { SurvivalPayload, SurvivalRule, SurvivalRules } from './gol/survivalRules';

describe('a GoL SurvivalRules value IS a generic RuleSet (AR-21, RFC-004 §2.4)', () => {
  it('assigns with no mapping layer — the compiler is the assertion', () => {
    const persisted: DomainSurvivalRules = CONWAYS_CLASSIC.survivalRules;
    const asRuleSet: RuleSet<SurvivalPayload> = persisted;

    // Reference identity, not deep equality: "no mapping layer" means the SAME object reaches the
    // engine. A copy or a re-shape would still satisfy toEqual and would still be a mapping layer.
    expect(asRuleSet).toBe(persisted);
  });

  // The load-bearing direction, at the whole-RuleSet and single-Rule levels: @gol/domain's
  // persisted shape assigns into THIS package's SurvivalRule/SurvivalRules (declared in
  // src/gol/survivalRules.ts per FD1) with no cast — the exact conversion resolveCellAction relies
  // on at runtime. See the header comment for why the reverse direction cannot type-check.
  it('a whole SurvivalRules value assigns into the engine type with no mapping layer', () => {
    const persisted: DomainSurvivalRules = CONWAYS_CLASSIC.survivalRules;
    const asEngineShape: SurvivalRules = persisted;

    // Reference identity, not deep equality: "no mapping layer" means the SAME object reaches the
    // engine. A copy or a re-shape would still satisfy toEqual and would still be a mapping layer.
    expect(asEngineShape).toBe(persisted);
  });

  it('a single SurvivalRule assigns into the engine type with no mapping layer', () => {
    const [domainRule] = CONWAYS_CLASSIC.survivalRules;
    if (domainRule === undefined) throw new Error('CONWAYS_CLASSIC.survivalRules is non-empty');
    const asEngineRule: SurvivalRule = domainRule;
    expect(asEngineRule).toBe(domainRule);
  });

  // The FD3 collision, exercised rather than just declared: @gol/domain's Condition (concrete,
  // Zod-inferred) assigns into this package's generic Condition<CellProperty> with no cast, for a
  // real condition off Conway's Classic.
  it('a Condition (FD3) assigns into the engine type with no mapping layer', () => {
    const [bornRule] = CONWAYS_CLASSIC.survivalRules;
    if (bornRule === undefined) throw new Error('CONWAYS_CLASSIC.survivalRules is non-empty');
    const [domainCondition] = bornRule.conditions;
    if (domainCondition === undefined) throw new Error('the born rule has at least one condition');

    const typed: DomainCondition = domainCondition;
    const asEngineCondition: Condition<CellProperty> = typed;
    expect(asEngineCondition).toBe(typed);
  });

  // Wiring proof with a REAL GoL subject and the REAL cellSelectors — CellSubject and its five
  // properties are Story 3.2's, and this replaces the earlier stub (`StubProperty`/`stubSelectors`)
  // that predicted this story. The payload arrives back with its domain type intact, uncast.
  it('carries the domain payload through the engine, using the real CellSubject and cellSelectors', () => {
    const winner = firstSatisfiedBy(
      CONWAYS_CLASSIC.survivalRules,
      { state: 'empty', organismType: null, age: 0, neighborCount: 3, occupantNeighborCount: 0 },
      cellSelectors,
    );

    // `.payload.action` resolving without a cast is the assertion; the value confirms the wiring.
    expect(winner?.payload.action).toBe('born');
  });
});
