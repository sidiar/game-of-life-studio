import { CONWAYS_CLASSIC, createSeededRng, FIXED_SEED } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import type { CellSubject } from '../gol/cellSubject';
import { createGrid, gridFromDense, gridToDense } from '../grid/grid';
import { compileSession } from '../session/compileEvaluators';
import type { OrganismEvaluators } from '../session/compileEvaluators';
import { birthSurvivalPhase } from './birthSurvivalPhase';
import { deathPhase } from './deathPhase';
import type { ConflictDeps, PhaseDeps } from './phaseDeps';
import { activeStrategy, threePhaseStep } from './threePhaseStep';
import type { SimulationDeps, SimulationStrategy } from './threePhaseStep';

const forbiddenRng = {
  int(): number {
    throw new Error('threePhaseStep drew from the Rng on a cell that was not contested');
  },
};

const conwayDeps = (): SimulationDeps => ({
  ...compileSession([CONWAYS_CLASSIC]),
  organisms: [{ dominance: CONWAYS_CLASSIC.dominance }],
  rng: forbiddenRng,
});

describe('the assembled cycle composes the three phases (AC9, RFC-004 §3.2)', () => {
  it('turns a grid at cycle N into a grid at cycle N+1', () => {
    // A vertical blinker becomes a horizontal one — the smallest end-to-end proof that all three
    // phases ran and that the result reached the destination.
    const source = gridFromDense([
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ]);
    const destination = createGrid(3, 3);

    const result = threePhaseStep(source, destination, conwayDeps());

    expect(result).toBe(destination);
    expect(gridToDense(result)).toEqual([
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ]);
  });

  it('writes the DESTINATION and leaves the source byte-identical', () => {
    const source = gridFromDense([
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ]);
    source.age.set([0, 3, 0, 0, 3, 0, 0, 3, 0]);
    const occupantBefore = Array.from(source.occupant);
    const ageBefore = Array.from(source.age);

    threePhaseStep(source, createGrid(3, 3), conwayDeps());

    expect(Array.from(source.occupant)).toEqual(occupantBefore);
    expect(Array.from(source.age)).toEqual(ageBefore);
  });

  it('overwrites a destination holding a STALE FRAME (doubleBuffer.ts, AC6)', () => {
    // After two swaps the destination is cycle N-2's grid, so every cell — empties included —
    // must be stored. A writer that stores only living cells resurrects that frame silently.
    const source = gridFromDense([
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ]);
    const destination = createGrid(3, 3);
    destination.occupant.fill(1);
    destination.age.fill(999);

    threePhaseStep(source, destination, conwayDeps());

    expect(gridToDense(destination)).toEqual([
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ]);
    expect(Array.from(destination.age)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });

  it("raises Phase 1's mis-sized / shared-buffer guard on the caller's behalf", () => {
    const source = gridFromDense([[1, 1]]);

    expect(() => threePhaseStep(source, createGrid(3, 3), conwayDeps())).toThrow(/destination is/);
    expect(() => threePhaseStep(source, source, conwayDeps())).toThrow(/shares a buffer/);
  });

  it('is deterministic when nothing ties — the same input gives the same output', () => {
    const source = gridFromDense([
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ]);

    const first = threePhaseStep(source, createGrid(3, 3), conwayDeps());
    const second = threePhaseStep(source, createGrid(3, 3), conwayDeps());

    expect(gridToDense(first)).toEqual(gridToDense(second));
    expect(Array.from(first.age)).toEqual(Array.from(second.age));
  });
});

describe('SimulationDeps satisfies every phase structurally, with no adapter (AC9, FD2)', () => {
  it('is handed straight to Phase 1, Phase 2 and Phase 3', () => {
    // Story 3.5's FD1 deferred `SimulationDeps` on exactly this claim: "a wider object satisfies
    // the narrower parameter structurally, so no adapter is needed when it lands". If you find
    // yourself writing a mapping layer, the shape is wrong — so the claim is pinned rather than
    // restated. These assignments are the assertion; `tsc` is what checks them.
    const deps = conwayDeps();
    const asPhaseDeps: PhaseDeps = deps;
    const asConflictDeps: ConflictDeps = deps;

    expect(asPhaseDeps.evaluatorsByRef).toBe(deps.evaluatorsByRef);
    expect(asConflictDeps.organisms).toBe(deps.organisms);

    const source = gridFromDense([[1, 1, 1]]);
    const destination = createGrid(3, 1);
    deathPhase(source, destination, deps);
    expect(birthSurvivalPhase(destination, deps).cellIndex.length).toBeGreaterThan(0);
  });

  it('a CompiledSession spread with a roster and a generator IS a SimulationDeps', () => {
    // The cheapest thing Story 3.10 can construct: no builder, no mapping step. `maxRelevantAge`
    // rides on the deps for this reason rather than being passed alongside.
    const session = compileSession([CONWAYS_CLASSIC]);
    const deps: SimulationDeps = {
      ...session,
      organisms: [{ dominance: 50 }],
      rng: createSeededRng(FIXED_SEED),
    };

    expect(deps.maxRelevantAge).toBe(session.maxRelevantAge);
    expect(deps.evaluatorsByRef).toBe(session.evaluatorsByRef);
  });

  it('carries no agingEnabled for the engine to branch on (AC8, FR-2.4)', () => {
    // The exact key set of the roster entry. FR-2.4 makes the toggle a RENDER input; a field
    // published here is a field a later phase eventually reads "because it is there".
    const deps = conwayDeps();
    expect(Object.keys(deps.organisms[0])).toEqual(['dominance']);
  });
});

describe('the strategy seam (RFC-004 §3.1)', () => {
  it('threePhaseStep satisfies SimulationStrategy', () => {
    // The annotation on `activeStrategy` is where `tsc` checks this; declaring a strategy type the
    // only implementation does not satisfy is worse than not declaring one.
    expect(activeStrategy).toBe(threePhaseStep);

    const asStrategy: SimulationStrategy = threePhaseStep;
    expect(asStrategy).toBe(threePhaseStep);
  });

  it('a stub strategy satisfies the same type, so the seam is real', () => {
    // §3.1 calls this the intended extension seam. A second implementation is not built (no
    // registry, no descriptor, no `beta` flag — all deferred), but the TYPE has to be able to
    // describe one or the indirection buys nothing.
    const clearEverything: SimulationStrategy = (_source, destination) => {
      destination.occupant.fill(0);
      destination.age.fill(0);
      return destination;
    };

    const result = clearEverything(gridFromDense([[1]]), createGrid(1, 1), conwayDeps());
    expect(gridToDense(result)).toEqual([[0]]);
  });
});

describe('the engine runs on STUB evaluators with no rules at all (RFC-004 §3.5)', () => {
  // §3.5's separation-of-concerns claim — "it can be tested with stub evaluators and no rules at
  // all" — is worth exactly one test, and this is it. Nothing below parses, compiles or inspects a
  // rule; the phases see two closures.
  const stub = (
    resolvesToDeath: (cell: CellSubject) => boolean,
    resolveBirthSurvival: OrganismEvaluators['resolveBirthSurvival'],
  ): OrganismEvaluators => ({ resolvesToDeath, resolveBirthSurvival });

  it('kills through Phase 1, claims through Phase 2 and writes through Phase 3', () => {
    const deps: SimulationDeps = {
      // Slot 0 is the reserved EMPTY value and holds a deliberate `null` (M14/M15).
      evaluatorsByRef: [
        null,
        // Ref 1 dies wherever it stands, and claims nothing.
        stub(
          () => true,
          () => null,
        ),
        // Ref 2 survives its own cells and is born on every empty one.
        stub(
          () => false,
          (cell) => (cell.state === 'alive' ? 'survive' : cell.state === 'empty' ? 'born' : null),
        ),
      ],
      organisms: [{ dominance: 10 }, { dominance: 20 }],
      rng: forbiddenRng,
      maxRelevantAge: 7,
    };

    const source = gridFromDense([
      [1, 2],
      [0, 0],
    ]);
    source.age.set([4, 4, 0, 0]);

    const result = threePhaseStep(source, createGrid(2, 2), deps);

    // Ref 1 died in Phase 1, so its cell was empty when Phase 2 scanned and ref 2 was born there.
    expect(gridToDense(result)).toEqual([
      [2, 2],
      [2, 2],
    ]);
    // Ref 2's own cell survived (4 -> 5); the other three are births at 0.
    expect(Array.from(result.age)).toEqual([0, 5, 0, 0]);
  });

  it('an unclaimed stub occupant is gone at cycle end (implicit death, M10)', () => {
    const deps: SimulationDeps = {
      evaluatorsByRef: [
        null,
        stub(
          () => false,
          () => null,
        ),
      ],
      organisms: [{ dominance: 10 }],
      rng: forbiddenRng,
      maxRelevantAge: 7,
    };

    const source = gridFromDense([[1, 1, 1]]);
    const result = threePhaseStep(source, createGrid(3, 1), deps);

    // No `die` rule fired, so Phase 1 left every cell standing and Phase 2 counted them as
    // neighbours — and then none of them claimed, so all three are cleared. This is the ordering
    // that preserves Conway's simultaneous-generation semantics.
    expect(gridToDense(result)).toEqual([[0, 0, 0]]);
  });
});
