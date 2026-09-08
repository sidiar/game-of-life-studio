// AC5's assignability pin, and the reason it is a test file rather than a comment: RFC-004 §2.4
// claims "persisted data feeds the engine without any mapping layer", and the only thing that can
// prove that claim is `tsc`. If these assignments ever stop compiling, the two shapes have drifted
// and Story 3.2 would need exactly the mapping layer the RFC promises it will not need.
//
// ⚠️ This file lives OUTSIDE src/engine/ on purpose. It must import @gol/domain, which the
// import-boundary block in eslint.config.mjs bans inside that directory. The AR-40 proof
// (src/engine/rulesEngine.test.ts) is the file that must stay GoL-free — a different file with a
// different job.
//
// It also carries the workspace-graph proof that Story 1.1's placeholder `SIMULATION_DEPENDS_ON`
// re-export used to carry: this import fails `tsc --noEmit` if the declared "@gol/domain": "*" edge
// stops resolving to that package's TS source. Story 3.2 restores that edge in production code.
import { CONWAYS_CLASSIC } from '@gol/domain';
import type { SurvivalRule, SurvivalRules } from '@gol/domain';
import { describe, expect, it } from 'vitest';

import { firstSatisfiedBy } from './engine/firstSatisfiedBy';
import type { RuleSet, Selectors } from './engine/rule';

// @gol/domain keeps SurvivalPayloadSchema module-local and exports no name for its inferred type
// (story FD6). The indexed access is the honest expression of "whatever that field is" and widens
// no other package's public surface from inside this story.
type SurvivalPayload = SurvivalRule['payload'];

describe('a GoL SurvivalRules value IS a generic RuleSet (AR-21, RFC-004 §2.4)', () => {
  it('assigns with no mapping layer — the compiler is the assertion', () => {
    const persisted: SurvivalRules = CONWAYS_CLASSIC.survivalRules;
    const asRuleSet: RuleSet<SurvivalPayload> = persisted;

    // Reference identity, not deep equality: "no mapping layer" means the SAME object reaches the
    // engine. A copy or a re-shape would still satisfy toEqual and would still be a mapping layer.
    expect(asRuleSet).toBe(persisted);
  });

  it('carries the domain payload through the engine untyped-cast-free', () => {
    // A deliberately trivial subject — CellSubject and its five properties are Story 3.2's. The
    // point here is only that the payload arrives back with its domain type intact.
    type StubProperty =
      'cellState' | 'organismType' | 'age' | 'neighborCount' | 'occupantNeighborCount';
    const stubSelectors: Selectors<{ neighborCount: number }, StubProperty> = {
      cellState: () => 'empty',
      organismType: () => null,
      age: () => 0,
      neighborCount: (subject) => subject.neighborCount,
      occupantNeighborCount: () => 0,
    };

    const winner = firstSatisfiedBy(
      CONWAYS_CLASSIC.survivalRules,
      { neighborCount: 3 },
      stubSelectors,
    );

    // `.payload.action` resolving without a cast is the assertion; the value confirms the wiring.
    expect(winner?.payload.action).toBe('born');
  });
});
