// AC4/AC5's assignability pin, and the reason it is a test file rather than a comment: RFC-004
// §2.4 claims "persisted data feeds the engine without any mapping layer", and the only thing that
// can prove that claim is `tsc`. If these assignments ever stop compiling, the two shapes have
// drifted — and under Story 3.2's FD1 (declaring Action/SurvivalPayload/SurvivalRule/SurvivalRules
// in this package rather than importing @gol/domain's), drift here is exactly the failure mode FD1
// accepts as the cost of keeping @gol/simulation self-describing.
//
// ⚠️ RESOLVED BY M13 (2026-09-09) — this was a spec-conflict flag (Dev Agent Record, FD1; review
// 2026-09-08) until Sidiar amended AC4. AC4/FD1 originally asked for the pin to hold in BOTH
// directions at every level; M13 restates that as FORWARD at the container level and BOTH at the
// payload level, which is what this file pins. The split is structural, not a choice this story
// made, and the container half is architecturally EXCLUDED rather than deferred — there is no
// follow-up story:
//
//   - CONTAINER levels (RuleSet / Rule / Condition) — DOMAIN -> ENGINE only. (1) engine
//     Rule/RuleSet/Condition are `readonly` (AR-16 immutability, src/engine/rule.ts — out of scope
//     to edit) while @gol/domain's Zod-inferred types are mutable, and TypeScript never allows
//     assigning a readonly ARRAY into a mutable-typed reference regardless of element shape;
//     (2) @gol/domain's Condition is a discriminated union with a narrowed `pattern` per branch,
//     while the engine's generic Condition<Props> is deliberately ONE flat shape with
//     `pattern: unknown` — the whole point of AR-16's domain-blindness. A strict supertype can
//     never be reverse-assigned into a narrower discriminated union without a cast, and narrowing
//     the engine's Condition to fix it would re-introduce the exact GoL-awareness AR-16 exists to
//     keep out of src/engine/. RFC-004 §2.4 only ever claims the forward direction ("persisted
//     data is fed to the engine without any mapping layer"), so this half is the RFC's own claim.
//
//   - PAYLOAD level (SurvivalPayload / Action) — BOTH directions, pinned below. `readonly`
//     PROPERTY modifiers (unlike readonly arrays) are ignored for assignability, and `Action` is a
//     plain string union, so nothing structural blocks the reverse here.
//
// ⚠️ The payload direction is the one that MATTERS for FD1, and an earlier revision of this file
// omitted it. M13 generalizes exactly this: any type duplicated across the domain/engine seam must
// be pinned BIDIRECTIONALLY at the level it was duplicated. FD1 accepts duplicating Action/SurvivalPayload in src/gol/survivalRules.ts *on the
// grounds that* drift becomes a build failure here. A domain -> engine assignment alone is
// covariant, so it cannot deliver that: widening the ENGINE's copy (adding a fourth Action member)
// or hollowing it out still compiles, which is precisely the drift FD1 claimed to have closed.
// Verified by mutation during review — adding `'dormant'` to `Action` left `tsc` at exit 0 before
// the reverse pins below existed, and fails with them. Keep both directions, or FD1's justification
// stops being true.
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
  Organism as DomainOrganism,
  SurvivalRule as DomainSurvivalRule,
  SurvivalRules as DomainSurvivalRules,
} from '@gol/domain';
import { describe, expect, it } from 'vitest';

import { firstSatisfiedBy } from './engine/firstSatisfiedBy';
import type { Condition, RuleSet } from './engine/rule';
import { cellSelectors } from './gol/cellSubject';
import type { CellProperty } from './gol/cellSubject';
import type { Action, SurvivalPayload, SurvivalRule, SurvivalRules } from './gol/survivalRules';
import type { CompilableOrganism } from './session/compileEvaluators';
import type { OrganismRuntime } from './strategy/phaseDeps';

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

  // ── The REVERSE direction (ENGINE -> DOMAIN), at the payload level ──────────────────────────
  //
  // This is the half FD1's justification actually rests on: it fails the moment src/gol's own
  // Action/SurvivalPayload drift from @gol/domain's, which the forward (covariant) assignments
  // above cannot detect. `DomainSurvivalRule['payload']` is the indexed access that names
  // @gol/domain's payload type — it exports no standalone alias for it (Story 3.1's FD6).
  it("the engine payload assigns BACK into @gol/domain's payload type (FD1 drift guard)", () => {
    const domainPayload: DomainSurvivalRule['payload'] = { summary: 'survives', action: 'survive' };
    const asEnginePayload: SurvivalPayload = domainPayload;
    // …and back again. Adding a member to src/gol's `Action`, or dropping `summary`, fails HERE.
    const backToDomain: DomainSurvivalRule['payload'] = asEnginePayload;

    expect(backToDomain).toBe(domainPayload);
  });

  it("the engine Action assigns BACK into @gol/domain's action union (FD1 drift guard)", () => {
    const domainAction: DomainSurvivalRule['payload']['action'] = 'born';
    const asEngineAction: Action = domainAction;
    const backToDomain: DomainSurvivalRule['payload']['action'] = asEngineAction;

    // The value is incidental; both assignments compiling in BOTH directions is the assertion —
    // it proves the two three-member unions are mutually assignable, i.e. identical.
    expect(backToDomain).toBe('born');
  });

  // ── Story 3.4's FD1: the ORGANISM container, duplicated as a minimal local shape ────────────
  //
  // `CompilableOrganism` declares only what compilation reads — the library `id` to intern and the
  // `survivalRules` to compile — rather than importing @gol/domain's `Organism` (which would
  // reverse Story 3.2's FD1 test-only edge and drag colorToken/schemaVersion/dominance into the
  // engine) or declaring RFC-004 §3.1's speculative full `OrganismRuntime`.
  //
  // M13 asks for a BIDIRECTIONAL pin at the level duplicated. What is newly duplicated here is a
  // RECORD, not a union, and that distinction decides what the pin has to look like:
  //
  //   - Widening the engine's copy with a field `Organism` does NOT have is caught by the FORWARD
  //     assignment alone: @gol/domain's `Organism` stops satisfying `CompilableOrganism` and this
  //     file stops compiling. (Verified by mutation during development: adding
  //     `readonly weight: number` fails HERE.) That is unlike the payload level below, where
  //     widening a string UNION is covariant and therefore invisible forward.
  //   - ⚠️ The forward pin is BLIND to a field `Organism` already has — `dominance`,
  //     `agingEnabled`, `colorToken` — creeping into `CompilableOrganism`, because `organism`
  //     still satisfies the wider type. That is precisely the FD1 leak the record argues against
  //     (Phase 3's and 3.6's fields dragged into the engine early), so the KEY SET is pinned
  //     exactly below: a third key fails as a missing property, a dropped one as an excess
  //     property.
  //   - The reverse container assignment is structurally EXCLUDED for the reason the header
  //     already gives: `survivalRules` is a `readonly` array of the engine's flat `Condition`
  //     against @gol/domain's mutable array of a discriminated union. Nothing about this story
  //     changes that, and it reuses the already-pinned `SurvivalRules` rather than duplicating it
  //     again, so no NEW type crosses the seam unpinned.
  it("@gol/domain's Organism assigns into CompilableOrganism with no mapping layer (3.4 FD1, M13)", () => {
    const organism: DomainOrganism = {
      schemaVersion: 1,
      id: 'conways-classic',
      name: "Conway's Classic",
      colorToken: 'vermillion',
      dominance: 50,
      agingEnabled: false,
      survivalRules: [...CONWAYS_CLASSIC.survivalRules],
    };
    const compilable: CompilableOrganism = organism;

    expect(compilable).toBe(organism);
    // The reverse at the one level it CAN hold: the interned key is a plain `string` in both, so a
    // future narrowing of either `id` (to a branded or template-literal type) fails here.
    const backToDomainId: DomainOrganism['id'] = compilable.id;
    expect(backToDomainId).toBe(organism.id);

    // The exact key set (see the bullet above): `Record<keyof CompilableOrganism, true>` fails to
    // compile if a key is added to the interface and not here, or listed here and gone from it.
    const exactKeys: Record<keyof CompilableOrganism, true> = { id: true, survivalRules: true };
    expect(Object.keys(exactKeys).sort()).toEqual(['id', 'survivalRules']);
  });

  // ── Story 3.6's FD2: the ORGANISM RUNTIME, the other minimal local shape ───────────────────
  //
  // Phase 3 compares Dominance and nothing else, so `OrganismRuntime` declares `dominance` and
  // nothing else — RFC-004 §3.1 sketches it as `// dense array; dominance, agingEnabled, …` and
  // that `…` is a comment on a deferred type, not a contract.
  //
  // The KEY SET is what this pin is really for. The forward assignment alone is blind to a field
  // `Organism` already has creeping in, and there is one specific field that must never arrive:
  // `agingEnabled`. FR-2.4 makes it a RENDER input — *"this toggle affects visual rendering only;
  // cell-age tracking (FR-5.6) is unaffected"* — so an engine that reads it would stop a non-aging
  // organism's `age`-conditioned rules from ever firing, with no failing test in any fixture that
  // does not run past an age literal. Two shipped comments predicted the opposite before this
  // story and were corrected; this assertion is what keeps the correction true.
  it("@gol/domain's Organism assigns into OrganismRuntime, which carries dominance ALONE (3.6 FD2, M13)", () => {
    const organism: DomainOrganism = {
      schemaVersion: 1,
      id: 'conways-classic',
      name: "Conway's Classic",
      colorToken: 'vermillion',
      dominance: 50,
      agingEnabled: true,
      survivalRules: [...CONWAYS_CLASSIC.survivalRules],
    };
    const runtime: OrganismRuntime = organism;

    expect(runtime).toBe(organism);
    // The reverse at the level it CAN hold: `dominance` is a plain `number` in both, so a future
    // narrowing of either (to a branded or literal-union type) fails here.
    const backToDomain: DomainOrganism['dominance'] = runtime.dominance;
    expect(backToDomain).toBe(50);

    // Adding `agingEnabled` (or anything else) to the interface and not to this record fails to
    // compile; listing a key the interface does not have fails as an excess property.
    const exactKeys: Record<keyof OrganismRuntime, true> = { dominance: true };
    expect(Object.keys(exactKeys)).toEqual(['dominance']);
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
