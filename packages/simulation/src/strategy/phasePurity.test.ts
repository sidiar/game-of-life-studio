import { createMockOrganisms, createSeededRng, FIXED_SEED } from '@gol/test-utils';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createGrid, gridFromDense } from '../grid/grid';
import type { Grid } from '../grid/grid';
import { compileSession } from '../session/compileEvaluators';
import { birthSurvivalPhase } from './birthSurvivalPhase';
import { conflictPhase } from './conflictPhase';
import { deathPhase } from './deathPhase';
import type { OrganismRuntime, PhaseDeps } from './phaseDeps';
import { threePhaseStep } from './threePhaseStep';
import type { SimulationDeps } from './threePhaseStep';

// AR-41 assigns PHASE PURITY to this story, and it is the property examples cannot pin: the damage
// is a WRITE somewhere the assertions never look, on a grid shape the goldens never take.
//
// ⚠️ Purity is stated over the SOURCE (story FD2). `deathPhase` writes a caller-supplied
// DESTINATION — that is an output, and asserting "nothing anywhere was written" would be asserting
// the function does nothing. What must hold is that the source is byte-identical afterwards and
// that no returned buffer aliases a source buffer.

// ROSTERS are generated too (Task 5: "over generated grids and rosters"): any non-empty ordering
// of any subset of the mock organisms, so refs are re-assigned per case (M14: ref = index + 1)
// and no property can quietly depend on "Aggressive is always 1".
const arbRoster = fc.shuffledSubarray(createMockOrganisms(), { minLength: 1 });

interface PhaseCase {
  readonly roster: ReturnType<typeof createMockOrganisms>;
  readonly dense: number[][];
  readonly ages: number[];
  // Story 3.6: a narrow Dominance range so TIES are frequent rather than incidental — the whole
  // point of generating them is to drive the seeded tie-break, which a 1..100 spread almost never
  // reaches.
  readonly dominances: number[];
}

// Grids from 1x1 up, deliberately including 1xN and Nx1 — degenerate shapes are where hard-edge
// neighbour bounds go wrong (Trap 8), and a phase inherits that from the counting it does. Refs
// run 0..roster.length, so an out-of-roster ref never appears (that path has its own example
// tests in `deathPhase.test.ts` / `birthSurvivalPhase.test.ts`).
const arbCase: fc.Arbitrary<PhaseCase> = fc
  .tuple(arbRoster, fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 8 }))
  .chain(([roster, width, height]) =>
    fc.record({
      roster: fc.constant(roster),
      dense: fc.array(
        fc.array(fc.integer({ min: 0, max: roster.length }), {
          minLength: width,
          maxLength: width,
        }),
        { minLength: height, maxLength: height },
      ),
      // Ages up to 10 straddle PATIENT_DIE's `age gte 8` literal, so generated grids actually
      // exercise the death partition rather than always answering "no".
      ages: fc.array(fc.integer({ min: 0, max: 10 }), {
        minLength: width * height,
        maxLength: width * height,
      }),
      dominances: fc.array(fc.integer({ min: 1, max: 3 }), {
        minLength: roster.length,
        maxLength: roster.length,
      }),
    }),
  );

const buildGrid = ({ dense, ages }: PhaseCase): Grid => {
  const source = gridFromDense(dense);
  source.age.set(ages);
  return source;
};

const depsFor = ({ roster }: PhaseCase): PhaseDeps => compileSession(roster);

// Story 3.6: the full deps a whole cycle needs. Two calls with the same spec build two FRESH
// generators from the same seed — never one shared instance, which would make the determinism
// property below pass for the wrong reason (one advancing stream read twice cannot diverge from
// itself only if the two runs draw the same NUMBER of times, which is the thing under test).
const simulationDepsFor = (spec: PhaseCase): SimulationDeps => ({
  ...compileSession(spec.roster),
  organisms: spec.dominances.map((dominance): OrganismRuntime => ({ dominance })),
  rng: createSeededRng(FIXED_SEED),
});

describe('phase purity over the source grid (fast-check, AR-41, AC9)', () => {
  it('deathPhase leaves the source occupant and age byte-identical', () => {
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const occupantBefore = Array.from(source.occupant);
        const ageBefore = Array.from(source.age);

        deathPhase(source, createGrid(source.width, source.height), depsFor(spec));

        expect(Array.from(source.occupant)).toEqual(occupantBefore);
        expect(Array.from(source.age)).toEqual(ageBefore);
      }),
    );
  });

  it('birthSurvivalPhase leaves the grid it reads byte-identical', () => {
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const occupantBefore = Array.from(source.occupant);
        const ageBefore = Array.from(source.age);

        birthSurvivalPhase(source, depsFor(spec));

        expect(Array.from(source.occupant)).toEqual(occupantBefore);
        expect(Array.from(source.age)).toEqual(ageBefore);
      }),
    );
  });

  it('no returned buffer aliases a source buffer', () => {
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const destination = createGrid(source.width, source.height);

        const result = deathPhase(source, destination, depsFor(spec));

        expect(result.occupant).not.toBe(source.occupant);
        expect(result.age).not.toBe(source.age);
        expect(result.occupant).toBe(destination.occupant);
      }),
    );
  });

  it('both phases are deterministic — same input, same output, every time', () => {
    // Nothing in Phases 1-2 is random (the seeded `Rng` is Phase 3's, Story 3.6). A phase that
    // needed one would have absorbed Phase 3.
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const first = deathPhase(source, createGrid(source.width, source.height), depsFor(spec));
        const second = deathPhase(source, createGrid(source.width, source.height), depsFor(spec));

        expect(Array.from(first.occupant)).toEqual(Array.from(second.occupant));
        expect(Array.from(first.age)).toEqual(Array.from(second.age));
        expect(birthSurvivalPhase(first, depsFor(spec))).toEqual(
          birthSurvivalPhase(second, depsFor(spec)),
        );
      }),
    );
  });
});

describe('phase invariants over generated grids (fast-check)', () => {
  it('deathPhase writes EVERY destination cell, so a stale frame never survives (AC10)', () => {
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        // The destination starts as cycle N-2's ghost: a ref no cell holds and an age no cell has.
        const destination = createGrid(source.width, source.height);
        destination.occupant.fill(spec.roster.length + 1);
        destination.age.fill(999);

        deathPhase(source, destination, depsFor(spec));

        for (let i = 0; i < destination.occupant.length; i++) {
          expect(destination.occupant[i]).not.toBe(spec.roster.length + 1);
          expect(destination.age[i]).not.toBe(999);
        }
      }),
    );
  });

  it('deathPhase only ever REMOVES cells — it never adds, moves or relabels one', () => {
    // Phase 1's whole job is explicit death. A cell in the output is either the source's occupant
    // with the source's age, or empty with age 0.
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const result = deathPhase(source, createGrid(source.width, source.height), depsFor(spec));

        for (let i = 0; i < result.occupant.length; i++) {
          if (result.occupant[i] === 0) {
            expect(result.age[i]).toBe(0);
          } else {
            expect(result.occupant[i]).toBe(source.occupant[i]);
            expect(result.age[i]).toBe(source.age[i]);
          }
        }
      }),
    );
  });

  it('claims obey the invariants Story 3.6 depends on (claims.ts)', () => {
    fc.assert(
      fc.property(arbCase, (spec) => {
        const grid = buildGrid(spec);
        const claims = birthSurvivalPhase(grid, depsFor(spec));
        const cells = grid.width * grid.height;

        expect(claims.ref).toHaveLength(claims.cellIndex.length);
        expect(claims.action).toHaveLength(claims.cellIndex.length);

        for (let i = 0; i < claims.cellIndex.length; i++) {
          expect(claims.cellIndex[i]).toBeGreaterThanOrEqual(0);
          expect(claims.cellIndex[i]).toBeLessThan(cells);
          // Invariant 5: no claim carries `die` — it is unreachable by construction (M15).
          expect(claims.action[i] === 'born' || claims.action[i] === 'survive').toBe(true);
          // Invariant 4: a `survive` claim is always the incumbent's own (FD4).
          if (claims.action[i] === 'survive') {
            expect(grid.occupant[claims.cellIndex[i]]).toBe(claims.ref[i]);
          }

          if (i === 0) continue;
          // Invariant 1: non-decreasing cellIndex, so a cell's claims are contiguous.
          expect(claims.cellIndex[i]).toBeGreaterThanOrEqual(claims.cellIndex[i - 1]);
          // Invariant 2: within one cell's run, refs strictly increase — one claim per organism.
          if (claims.cellIndex[i] === claims.cellIndex[i - 1]) {
            expect(claims.ref[i]).toBeGreaterThan(claims.ref[i - 1]);
          }
        }
      }),
    );
  });
});

describe('the assembled cycle (fast-check, AR-41, Story 3.6 AC13)', () => {
  it('the same seed gives a byte-identical run — occupant AND age', () => {
    // ⚠️ TWO INDEPENDENT sessions, each with its own generator. FR-5.4's tie-break is the single
    // non-deterministic decision a cycle makes, and A-2 keeps the seed out of everything
    // persisted, so "deterministic under a seed" is the only reproducibility the app can offer.
    fc.assert(
      fc.property(arbCase, (spec) => {
        const runOnce = (): Grid => {
          let grid = buildGrid(spec);
          const deps = simulationDepsFor(spec);
          for (let cycle = 0; cycle < 4; cycle++) {
            grid = threePhaseStep(grid, createGrid(grid.width, grid.height), deps);
          }
          return grid;
        };

        const first = runOnce();
        const second = runOnce();

        expect(Array.from(first.occupant)).toEqual(Array.from(second.occupant));
        expect(Array.from(first.age)).toEqual(Array.from(second.age));
      }),
    );
  });

  it('no cell is both born and dead in one cycle', () => {
    // Stated over the ASSEMBLED step: a cell that receives a winning claim is occupied afterwards,
    // and a cell that receives none is empty — with age 0, so nothing is inherited by whatever is
    // born there next.
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const deps = simulationDepsFor(spec);

        // The same three calls `threePhaseStep` makes, decomposed so the CLAIMS are observable.
        const destination = createGrid(source.width, source.height);
        deathPhase(source, destination, deps);
        const claims = birthSurvivalPhase(destination, deps);
        const claimed = new Set(claims.cellIndex);
        conflictPhase(destination, claims, deps);

        for (let i = 0; i < destination.occupant.length; i++) {
          if (claimed.has(i)) {
            expect(destination.occupant[i]).not.toBe(0);
          } else {
            expect(destination.occupant[i]).toBe(0);
            expect(destination.age[i]).toBe(0);
          }
        }
      }),
    );
  });

  it('a winner is always a claimant for that cell, aged by its own claim', () => {
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const deps = simulationDepsFor(spec);
        const destination = createGrid(source.width, source.height);

        deathPhase(source, destination, deps);
        const claims = birthSurvivalPhase(destination, deps);
        const previousAges = Array.from(destination.age);
        conflictPhase(destination, claims, deps);

        // The "always a claimant" half, asserted rather than assumed: the ref written to a claimed
        // cell is one of THAT cell's claimants. Without this, a slip such as `ref[winner + 1]`
        // survives — the aging loop below `continue`s past any occupant it does not recognise.
        const claimantsByCell = new Map<number, Set<number>>();
        for (let i = 0; i < claims.cellIndex.length; i++) {
          const refs = claimantsByCell.get(claims.cellIndex[i]) ?? new Set<number>();
          refs.add(claims.ref[i]);
          claimantsByCell.set(claims.cellIndex[i], refs);
        }
        for (const [cell, refs] of claimantsByCell) {
          expect(refs.has(destination.occupant[cell])).toBe(true);
        }

        for (let i = 0; i < claims.cellIndex.length; i++) {
          const cell = claims.cellIndex[i];
          if (destination.occupant[cell] !== claims.ref[i]) continue;

          // Age follows the winning claim's ACTION, never "winner === incumbent" — an incumbent
          // may legitimately win with a `born` claim (claims.ts invariant 3).
          const expected =
            claims.action[i] === 'born' ? 0 : Math.min(previousAges[cell] + 1, deps.maxRelevantAge);
          expect(destination.age[cell]).toBe(expected);
        }
      }),
    );
  });

  it('every stored age stays within the battle ceiling', () => {
    // The clamp is what keeps the value inside the Uint16 age buffer; `outAge[i] = value` wraps
    // silently at 65536 (validateRules.ts caps age literals at 65534 for exactly this reason).
    fc.assert(
      fc.property(arbCase, (spec) => {
        const deps = simulationDepsFor(spec);
        let grid = buildGrid(spec);
        for (let cycle = 0; cycle < 3; cycle++) {
          grid = threePhaseStep(grid, createGrid(grid.width, grid.height), deps);
          for (const age of grid.age) expect(age).toBeLessThanOrEqual(deps.maxRelevantAge);
        }
      }),
    );
  });

  it('threePhaseStep leaves the SOURCE byte-identical and returns no aliased buffer', () => {
    // The purity property of AR-41, extended to the whole cycle. Phase 3 writes IN PLACE over the
    // destination, which is exactly why this has to be restated at the composed level: the
    // in-place write is safe only because Phase 3 reads cell i's own previous age and nothing else.
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const occupantBefore = Array.from(source.occupant);
        const ageBefore = Array.from(source.age);
        const destination = createGrid(source.width, source.height);

        const result = threePhaseStep(source, destination, simulationDepsFor(spec));

        expect(Array.from(source.occupant)).toEqual(occupantBefore);
        expect(Array.from(source.age)).toEqual(ageBefore);
        expect(result.occupant).not.toBe(source.occupant);
        expect(result.age).not.toBe(source.age);
        expect(result.occupant).toBe(destination.occupant);
      }),
    );
  });

  it('overwrites a destination pre-filled with a stale frame, every cell (AC6)', () => {
    fc.assert(
      fc.property(arbCase, (spec) => {
        const source = buildGrid(spec);
        const destination = createGrid(source.width, source.height);
        // Cycle N-2's ghost: a ref no cell holds and an age above every ceiling.
        destination.occupant.fill(spec.roster.length + 1);
        destination.age.fill(999);

        threePhaseStep(source, destination, simulationDepsFor(spec));

        for (let i = 0; i < destination.occupant.length; i++) {
          expect(destination.occupant[i]).not.toBe(spec.roster.length + 1);
          expect(destination.age[i]).not.toBe(999);
        }
      }),
    );
  });
});
