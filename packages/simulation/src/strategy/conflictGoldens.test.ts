import {
  createMockOrganisms,
  createSeededRng,
  FIXED_SEED,
  gridFromPattern,
  MOCK_ORGANISM_IDS,
} from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import type { SurvivalRule } from '../gol/survivalRules';
import { createGrid, gridFromDense, gridToDense } from '../grid/grid';
import type { Grid } from '../grid/grid';
import { countNeighbors } from '../grid/neighborhood';
import { compileSession } from '../session/compileEvaluators';
import type { CompilableOrganism } from '../session/compileEvaluators';
import { birthSurvivalPhase } from './birthSurvivalPhase';
import type { Claims } from './claims';
import type { OrganismRuntime } from './phaseDeps';
import { deathPhase } from './deathPhase';
import { threePhaseStep } from './threePhaseStep';
import type { SimulationDeps } from './threePhaseStep';

// AR-40's hand-computed MULTI-ORGANISM conflict scenarios, compiled through `compileSession` from
// real organism data — never hand-built evaluators, because the thing under test is the whole
// path from a persisted rule to a resolved cell.
//
// ⚠️ These are the fixtures Conway cannot be: single-organism goldens cannot tell a swapped
// same/other neighbour pair apart, cannot see `organisms[ref]` vs `organisms[ref - 1]`, and cannot
// reach the tie-break at all.

const forbiddenRng = {
  int(): number {
    throw new Error('the Dominance tie-break was consulted on an uncontested cell');
  },
};

interface Roster {
  readonly organisms: readonly (CompilableOrganism & { readonly dominance: number })[];
}

const depsFor = (
  { organisms }: Roster,
  rng: SimulationDeps['rng'] = forbiddenRng,
): SimulationDeps => ({
  ...compileSession(organisms),
  // ROSTER-indexed, read as `organisms[ref - 1]` (M14) — the array Phase 3 compares Dominance
  // across, in the same order `compileSession` assigned refs from.
  organisms: organisms.map((organism): OrganismRuntime => ({ dominance: organism.dominance })),
  rng,
});

const claimsFor = (grid: Grid, deps: SimulationDeps): Claims =>
  birthSurvivalPhase(deathPhase(grid, createGrid(grid.width, grid.height), deps), deps);

const claimsOn = (claims: Claims, cellIndex: number): { ref: number; action: string }[] =>
  claims.cellIndex
    .map((cell, i) => ({ cell, ref: claims.ref[i], action: claims.action[i] as string }))
    .filter((claim) => claim.cell === cellIndex)
    .map(({ ref, action }) => ({ ref, action }));

const step = (grid: Grid, deps: SimulationDeps): Grid =>
  threePhaseStep(grid, createGrid(grid.width, grid.height), deps);

// ── Eviction REFUSED: the mock roster, whose Dominances are 80 / 45 / 20 ────────────────────────

describe('eviction refused on Dominance (AC12, FR-5.4)', () => {
  // Chaotic Spreader's CHAOTIC_BORN is `cellState eq occupied` + `organismType eq
  // <aggressiveColonizer's library id>`, dominance 20. Aggressive Colonizer's AGGRESSIVE_SURVIVE
  // is `cellState eq alive` + `neighborCount gte 2`, dominance 80. Story 3.5 proved the claim
  // EXISTS; this asserts who wins.
  const roster: Roster = { organisms: createMockOrganisms() };
  const LEGEND = { '.': 0, A: 1, C: 3 } as const;
  const PATTERN = ['......', '.AA...', '.AA...', '......', '....C.', '......'];
  const A_CELL = 1 * 6 + 1;

  it('the invader really does claim the incumbent cell', () => {
    const deps = depsFor(roster);
    const claims = claimsFor(gridFromDense(gridFromPattern(PATTERN, LEGEND)), deps);

    // Refs: 1 = Aggressive Colonizer, 2 = Patient Defender, 3 = Chaotic Spreader.
    expect(claimsOn(claims, A_CELL)).toEqual([
      { ref: 1, action: 'survive' },
      { ref: 3, action: 'born' },
    ]);
  });

  it('the 20-Dominance invader LOSES to the 80-Dominance incumbent, which ages on', () => {
    const grid = gridFromDense(gridFromPattern(PATTERN, LEGEND));
    const after = step(grid, depsFor(roster));

    expect(gridToDense(after)).toEqual(gridFromPattern(PATTERN, LEGEND));
    // A survivor, so `+1` — not a birth reset, which is what an incumbent-wins-by-rebirth bug
    // would produce.
    expect(after.age[A_CELL]).toBe(1);
  });

  it('never reaches the tie-break — 80 against 20 is not a tie (AC3)', () => {
    // `forbiddenRng` throws on any call, and the whole grid is swept every cycle.
    const grid = gridFromDense(gridFromPattern(PATTERN, LEGEND));
    expect(() => step(grid, depsFor(roster))).not.toThrow();
  });

  it('holds for many cycles rather than only the first', () => {
    let grid = gridFromDense(gridFromPattern(PATTERN, LEGEND));
    for (let cycle = 0; cycle < 6; cycle++) grid = step(grid, depsFor(roster));

    expect(gridToDense(grid)).toEqual(gridFromPattern(PATTERN, LEGEND));
    // maxRelevantAge here is max(7, 8 + 1) = 9 (Patient Defender's `age gte 8` literal), so six
    // cycles of survival read 6 — this fixture would saturate at 9, not at the eight-shade floor.
    expect(grid.age[A_CELL]).toBe(6);
    expect(compileSession(roster.organisms).maxRelevantAge).toBe(9);
  });
});

// ── Eviction WON: a purpose-compiled high-Dominance invader (Story 3.5's FD4 precedent) ─────────

const rule = (
  id: string,
  conditions: SurvivalRule['conditions'],
  action: 'born' | 'survive' | 'die',
): SurvivalRule => ({
  id,
  // The cache key is the ORDERED join of a rule list's contentHashes, so distinct rules need
  // distinct hashes or two organisms share one compiled evaluator pair (compileEvaluators.ts).
  contentHash: `hash-${id}`,
  conditions,
  payload: { summary: id, action },
});

describe('eviction WON — a birth evicts a surviving incumbent (AC4, M10 H-6)', () => {
  const INCUMBENT = 'test-incumbent';
  const INVADER = 'test-invader';

  const rosterWith = (incumbentDominance: number, invaderDominance: number): Roster => ({
    organisms: [
      {
        id: INCUMBENT,
        dominance: incumbentDominance,
        survivalRules: [
          rule(
            'incumbent-survive',
            [{ property: 'cellState', operator: 'eq', pattern: 'alive' }],
            'survive',
          ),
        ],
      },
      {
        id: INVADER,
        dominance: invaderDominance,
        survivalRules: [
          // Opt-in eviction: a Born rule written to fire on OCCUPIED cells (Decision C). An
          // ordinary `cellState eq empty` birth could never produce this claim.
          rule(
            'invader-born',
            [{ property: 'cellState', operator: 'eq', pattern: 'occupied' }],
            'born',
          ),
        ],
      },
    ],
  });

  const withIncumbentAt = (age: number): Grid => {
    const grid = gridFromDense([
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    grid.age[4] = age;
    return grid;
  };

  it('the 90-Dominance invader takes the cell, and the age RESETS to 0', () => {
    const after = step(withIncumbentAt(5), depsFor(rosterWith(10, 90)));

    expect(gridToDense(after)).toEqual([
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0],
    ]);
    // A birth, not an inherited age. Incumbency confers no protection beyond its own Dominance —
    // ❌ there is no `if (action === 'survive') return incumbent` shortcut to find here.
    expect(after.age[4]).toBe(0);
  });

  it('the SAME fixture with the Dominances swapped refuses the eviction', () => {
    // Pinned in BOTH directions: a suite that only shows an eviction being refused proves nothing
    // about H-6, and one that only shows it succeeding proves nothing about Dominance.
    const after = step(withIncumbentAt(5), depsFor(rosterWith(90, 10)));

    expect(gridToDense(after)).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    expect(after.age[4]).toBe(6);
  });

  it('pools the survive and born claims for the cell rather than ranking by action', () => {
    const deps = depsFor(rosterWith(10, 90));
    expect(claimsOn(claimsFor(withIncumbentAt(5), deps), 4)).toEqual([
      { ref: 1, action: 'survive' },
      { ref: 2, action: 'born' },
    ]);
  });
});

// ── Relative Cell-State gating: UJ-1's "Blue holds its corner" under H-6 ────────────────────────

describe('an ordinary empty-cell Born rule never contests an incumbent (AC5, UJ-1)', () => {
  // Eviction is OPT-IN because Cell State is relative to the evaluating organism (Decision C,
  // AR-20): `cellState eq empty` is simply false on an occupied cell, so such a rule produces no
  // claim there at all. The assertion is therefore an ABSENCE — which is the only shape that
  // shows eviction is opt-in rather than merely uncommon.
  const [aggressive, patient] = createMockOrganisms();
  const roster: Roster = { organisms: [aggressive, patient] };
  const LEGEND = { '.': 0, A: 1, P: 2 } as const;
  const PATTERN = ['........', '.PP.....', '.PA.....', '..AA..PP', '......P.'];
  const HELD_CELL = 2 * 8 + 2; // (2, 2) — the A cell with exactly three Patient neighbours.
  const CONTROL_CELL = 4 * 8 + 7; // (7, 4) — an EMPTY cell with exactly three Patient neighbours.

  it("Patient Defender's born rule fires on the control empty cell", () => {
    // Without this the absence below proves nothing: it would be equally consistent with the rule
    // never firing anywhere. PATIENT_BORN is `cellState eq empty` + `neighborCount range [3,4]`.
    const claims = claimsFor(gridFromDense(gridFromPattern(PATTERN, LEGEND)), depsFor(roster));
    expect(claimsOn(claims, CONTROL_CELL)).toEqual([{ ref: 2, action: 'born' }]);
  });

  it('the held cell has the SAME three Patient neighbours and gets no Patient claim', () => {
    const grid = gridFromDense(gridFromPattern(PATTERN, LEGEND));
    // Ref 2 = Patient Defender. `same` is the same-organism Moore count the rule reads.
    expect(countNeighbors(grid, 2, 2, 2).same).toBe(3);

    // Only the incumbent's own survive claim — the birth is gated out by cellState, not out-voted
    // by Dominance.
    expect(claimsOn(claimsFor(grid, depsFor(roster)), HELD_CELL)).toEqual([
      { ref: 1, action: 'survive' },
    ]);
  });

  it('so the incumbent holds its cell and ages, with no tie-break drawn', () => {
    const grid = gridFromDense(gridFromPattern(PATTERN, LEGEND));
    const after = step(grid, depsFor(roster));

    expect(after.occupant[HELD_CELL]).toBe(1);
    expect(after.age[HELD_CELL]).toBe(1);
    expect(after.occupant[CONTROL_CELL]).toBe(2);
    expect(after.age[CONTROL_CELL]).toBe(0);
  });

  it("Chaotic Spreader's occupied-cell born rule DOES contest — the contrast that makes it opt-in", () => {
    const withChaotic: Roster = { organisms: createMockOrganisms() };
    const claims = claimsFor(gridFromDense(gridFromPattern(PATTERN, LEGEND)), depsFor(withChaotic));

    // Ref 3 = Chaotic Spreader, whose born rule names `cellState eq occupied` and Aggressive
    // Colonizer's library id explicitly.
    expect(claimsOn(claims, HELD_CELL)).toEqual([
      { ref: 1, action: 'survive' },
      { ref: 3, action: 'born' },
    ]);
    expect(MOCK_ORGANISM_IDS.aggressiveColonizer).toBe('mock-aggressive-colonizer');
  });
});

// ── The Dominance TIE, resolved by the seeded generator ─────────────────────────────────────────

describe('a Dominance tie is resolved by the injected seeded Rng (AC2, AC12)', () => {
  // Two organisms, identical Dominance, both born on the same empty cell.
  const twins: Roster = {
    organisms: [
      {
        id: 'test-twin-a',
        dominance: 50,
        survivalRules: [
          rule(
            'twin-a-born',
            [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
            'born',
          ),
        ],
      },
      {
        id: 'test-twin-b',
        dominance: 50,
        survivalRules: [
          rule(
            'twin-b-born',
            [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
            'born',
          ),
        ],
      },
    ],
  };

  const oneEmptyCell = (): Grid => gridFromDense([[0]]);

  it('both twins claim the cell, so the contest is genuine', () => {
    expect(claimsOn(claimsFor(oneEmptyCell(), depsFor(twins)), 0)).toEqual([
      { ref: 1, action: 'born' },
      { ref: 2, action: 'born' },
    ]);
  });

  it('the draw selects the winner — k = 0 is the first top claimant, k = 1 the second', () => {
    // The NON-CIRCULAR half: a stub pins the mapping from draw to winner. A seeded literal alone
    // could only ever pin stability.
    expect(step(oneEmptyCell(), depsFor(twins, { int: () => 0 })).occupant[0]).toBe(1);
    expect(step(oneEmptyCell(), depsFor(twins, { int: () => 1 })).occupant[0]).toBe(2);
  });

  it('under FIXED_SEED the winner is a stable literal', () => {
    // ⚠️ FIXED_SEED is stable across runs BY CONTRACT (`@gol/test-utils`), which is the whole
    // reason a literal can be asserted at all — `Math.random()` in a fixture makes the suite flaky
    // in CI only. This asserts REPRODUCIBILITY; the test above asserts correctness.
    expect(step(oneEmptyCell(), depsFor(twins, createSeededRng(FIXED_SEED))).occupant[0]).toBe(2);
  });

  it('two fresh generators on the same seed produce the same battle', () => {
    const field = (): Grid => gridFromDense(gridFromPattern(['....', '....', '....'], { '.': 0 }));

    const first = step(field(), depsFor(twins, createSeededRng(FIXED_SEED)));
    const second = step(field(), depsFor(twins, createSeededRng(FIXED_SEED)));

    expect(Array.from(first.occupant)).toEqual(Array.from(second.occupant));
    // Both refs actually appear — a run in which one twin swept every cell would satisfy the
    // equality above while proving nothing about the draw.
    expect(new Set(first.occupant)).toEqual(new Set([1, 2]));
  });

  it('a THIRD twin at the same Dominance widens the draw rather than being ignored', () => {
    const three: Roster = {
      organisms: [
        ...twins.organisms,
        {
          id: 'test-twin-c',
          dominance: 50,
          survivalRules: [
            rule(
              'twin-c-born',
              [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
              'born',
            ),
          ],
        },
      ],
    };

    expect(step(oneEmptyCell(), depsFor(three, { int: () => 2 })).occupant[0]).toBe(3);
  });
});
