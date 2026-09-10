import { createMockOrganisms } from '@gol/test-utils';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createGrid, gridFromDense } from '../grid/grid';
import type { Grid } from '../grid/grid';
import { compileSession } from '../session/compileEvaluators';
import { birthSurvivalPhase } from './birthSurvivalPhase';
import { deathPhase } from './deathPhase';
import type { PhaseDeps } from './phaseDeps';

// AR-41 assigns PHASE PURITY to this story, and it is the property examples cannot pin: the damage
// is a WRITE somewhere the assertions never look, on a grid shape the goldens never take.
//
// ⚠️ Purity is stated over the SOURCE (story FD2). `deathPhase` writes a caller-supplied
// DESTINATION — that is an output, and asserting "nothing anywhere was written" would be asserting
// the function does nothing. What must hold is that the source is byte-identical afterwards and
// that no returned buffer aliases a source buffer.

const REF_CEILING = 3; // the mock roster's size; refs 0..3, so out-of-roster refs never appear

// Grids from 1x1 up, deliberately including 1xN and Nx1 — degenerate shapes are where hard-edge
// neighbour bounds go wrong (Trap 8), and a phase inherits that from the counting it does.
const arbGrid = fc
  .tuple(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 8 }))
  .chain(([width, height]) =>
    fc.record({
      dense: fc.array(
        fc.array(fc.integer({ min: 0, max: REF_CEILING }), {
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
    }),
  );

const buildGrid = ({ dense, ages }: { dense: number[][]; ages: number[] }): Grid => {
  const source = gridFromDense(dense);
  source.age.set(ages);
  return source;
};

const deps = (): PhaseDeps => compileSession(createMockOrganisms());

describe('phase purity over the source grid (fast-check, AR-41, AC9)', () => {
  it('deathPhase leaves the source occupant and age byte-identical', () => {
    fc.assert(
      fc.property(arbGrid, (spec) => {
        const source = buildGrid(spec);
        const occupantBefore = Array.from(source.occupant);
        const ageBefore = Array.from(source.age);

        deathPhase(source, createGrid(source.width, source.height), deps());

        expect(Array.from(source.occupant)).toEqual(occupantBefore);
        expect(Array.from(source.age)).toEqual(ageBefore);
      }),
    );
  });

  it('birthSurvivalPhase leaves the grid it reads byte-identical', () => {
    fc.assert(
      fc.property(arbGrid, (spec) => {
        const source = buildGrid(spec);
        const occupantBefore = Array.from(source.occupant);
        const ageBefore = Array.from(source.age);

        birthSurvivalPhase(source, deps());

        expect(Array.from(source.occupant)).toEqual(occupantBefore);
        expect(Array.from(source.age)).toEqual(ageBefore);
      }),
    );
  });

  it('no returned buffer aliases a source buffer', () => {
    fc.assert(
      fc.property(arbGrid, (spec) => {
        const source = buildGrid(spec);
        const destination = createGrid(source.width, source.height);

        const result = deathPhase(source, destination, deps());

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
      fc.property(arbGrid, (spec) => {
        const source = buildGrid(spec);
        const first = deathPhase(source, createGrid(source.width, source.height), deps());
        const second = deathPhase(source, createGrid(source.width, source.height), deps());

        expect(Array.from(first.occupant)).toEqual(Array.from(second.occupant));
        expect(Array.from(first.age)).toEqual(Array.from(second.age));
        expect(birthSurvivalPhase(first, deps())).toEqual(birthSurvivalPhase(second, deps()));
      }),
    );
  });
});

describe('phase invariants over generated grids (fast-check)', () => {
  it('deathPhase writes EVERY destination cell, so a stale frame never survives (AC10)', () => {
    fc.assert(
      fc.property(arbGrid, (spec) => {
        const source = buildGrid(spec);
        // The destination starts as cycle N-2's ghost: a ref no cell holds and an age no cell has.
        const destination = createGrid(source.width, source.height);
        destination.occupant.fill(REF_CEILING + 1);
        destination.age.fill(999);

        deathPhase(source, destination, deps());

        for (let i = 0; i < destination.occupant.length; i++) {
          expect(destination.occupant[i]).not.toBe(REF_CEILING + 1);
          expect(destination.age[i]).not.toBe(999);
        }
      }),
    );
  });

  it('deathPhase only ever REMOVES cells — it never adds, moves or relabels one', () => {
    // Phase 1's whole job is explicit death. A cell in the output is either the source's occupant
    // with the source's age, or empty with age 0.
    fc.assert(
      fc.property(arbGrid, (spec) => {
        const source = buildGrid(spec);
        const result = deathPhase(source, createGrid(source.width, source.height), deps());

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
      fc.property(arbGrid, (spec) => {
        const grid = buildGrid(spec);
        const claims = birthSurvivalPhase(grid, deps());
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
