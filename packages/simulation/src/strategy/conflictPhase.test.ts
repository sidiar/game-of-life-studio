import { createSeededRng, FIXED_SEED } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import type { Action } from '../gol/survivalRules';
import { gridFromDense, gridToDense } from '../grid/grid';
import type { Grid } from '../grid/grid';
import { conflictPhase } from './conflictPhase';
import type { Claims } from './claims';
import type { ConflictDeps, OrganismRuntime } from './phaseDeps';

// HAND-BUILT `Claims` are the cheapest way to pin AC1-AC4 and AC6/AC7 (story FD5): Phase 3 is a
// separate exported function precisely so a Dominance test does not have to route through a whole
// cycle and a compiled roster. The goldens (`conwayGoldens` / `conflictGoldens`) then test the
// COMPOSITION rather than doing double duty.

const claimsOf = (entries: readonly (readonly [number, number, Action])[]): Claims => ({
  cellIndex: entries.map(([cell]) => cell),
  ref: entries.map(([, ref]) => ref),
  action: entries.map(([, , action]) => action),
});

const rosterOf = (...dominances: readonly number[]): OrganismRuntime[] =>
  dominances.map((dominance) => ({ dominance }));

// Throws when consulted. AC3's pin, and the one legitimate hand-rolled stub in this story: no
// fixture can express "must not be called".
const forbiddenRng = {
  int(): number {
    throw new Error('conflictPhase drew from the Rng on a cell that was not contested');
  },
};

const countingRng = (inner: {
  int(maxExclusive: number): number;
}): { int(maxExclusive: number): number; calls: number[] } => {
  const calls: number[] = [];
  return {
    calls,
    int(maxExclusive: number): number {
      calls.push(maxExclusive);
      return inner.int(maxExclusive);
    },
  };
};

const depsOf = (
  organisms: readonly OrganismRuntime[],
  rng: ConflictDeps['rng'] = forbiddenRng,
  maxRelevantAge = 7,
): ConflictDeps => ({ organisms, rng, maxRelevantAge });

const gridWithAges = (dense: readonly (readonly number[])[], ages: readonly number[]): Grid => {
  const grid = gridFromDense(dense);
  grid.age.set(ages);
  return grid;
};

describe('Dominance decides, and the roster lookup is ref - 1 (AC1, M14)', () => {
  it('the higher-Dominance claimant wins', () => {
    // Roster index 0 = ref 1 (dominance 20), index 1 = ref 2 (dominance 80).
    const grid = gridFromDense([[1]]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'survive'],
        [0, 2, 'born'],
      ]),
      depsOf(rosterOf(20, 80)),
    );

    expect(grid.occupant[0]).toBe(2);
  });

  it('reads organisms[ref - 1], not organisms[ref] — the silent off-by-one', () => {
    // Built so the two conventions give DIFFERENT answers. Under `organisms[ref - 1]` the
    // dominances in play are 90 (ref 1) and 10 (ref 2), so ref 1 wins. Under `organisms[ref]` they
    // are 10 (ref 1) and 50 (ref 2), so ref 2 wins. The third entry is what keeps the mutant from
    // CRASHING — AC1's whole point is that `organisms[ref]` is not a crash but a plausible battle —
    // and its value has to beat the middle one, or the mutant still elects ref 1 and the pin is
    // vacuous (the Story 3.6 review found it shipped as `(90, 10, 5)`, which is exactly that).
    // Verified by mutation: this test reddens under `organisms[ref]`.
    const grid = gridFromDense([[0]]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'born'],
        [0, 2, 'born'],
      ]),
      depsOf(rosterOf(90, 10, 50)),
    );

    expect(grid.occupant[0]).toBe(1);
  });

  it('compares Dominance as a plain number — no sentinel below which the first claimant wins', () => {
    // `OrganismRuntime.dominance` is `number`; FR-2.2's 1..100 range is the domain schema's promise,
    // not the type's. A `-1` sentinel for "no maximum yet" makes a run of negative Dominances elect
    // whoever came first. Seeding the maximum from the first claimant has no such floor.
    const grid = gridFromDense([[0]]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'born'],
        [0, 2, 'born'],
      ]),
      depsOf(rosterOf(-5, -1)),
    );

    expect(grid.occupant[0]).toBe(2);
  });

  it('resolves each contested cell independently across a multi-cell run', () => {
    const grid = gridFromDense([
      [0, 0],
      [0, 0],
    ]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'born'],
        [0, 2, 'born'],
        [3, 1, 'born'],
        [3, 3, 'born'],
      ]),
      depsOf(rosterOf(10, 50, 5)),
    );

    expect(gridToDense(grid)).toEqual([
      [2, 0],
      [0, 1],
    ]);
  });
});

describe('ties break through the INJECTED generator, and only on a genuine tie (AC2, AC3)', () => {
  it('never consults the generator when there is a single top claimant', () => {
    // `forbiddenRng` throws on any call. Drawing per cell would burn ~6,000 draws a cycle at the
    // NFR-1.1 baseline AND couple every seeded golden to grid content, so a later change to WHEN
    // we draw would silently re-roll every recorded outcome.
    const grid = gridFromDense([
      [1, 0, 2],
      [0, 3, 0],
    ]);

    expect(() =>
      conflictPhase(
        grid,
        claimsOf([
          [0, 1, 'survive'],
          [2, 2, 'survive'],
          [2, 3, 'born'],
          [4, 3, 'survive'],
        ]),
        depsOf(rosterOf(10, 50, 20)),
      ),
    ).not.toThrow();
  });

  it('draws exactly once per contested cell, with the tie count as the bound', () => {
    const rng = countingRng(createSeededRng(FIXED_SEED));
    const grid = gridFromDense([
      [0, 0],
      [0, 0],
    ]);

    conflictPhase(
      grid,
      claimsOf([
        // Cell 0: a three-way tie at 50. Cell 1: uncontested. Cell 3: a two-way tie at 50.
        [0, 1, 'born'],
        [0, 2, 'born'],
        [0, 3, 'born'],
        [1, 1, 'born'],
        [3, 2, 'born'],
        [3, 3, 'born'],
      ]),
      depsOf(rosterOf(50, 50, 50), rng),
    );

    expect(rng.calls).toEqual([3, 2]);
  });

  it('picks the k-th top claimant the generator names — k = 0 is the first', () => {
    const claims = claimsOf([
      [0, 1, 'born'],
      [0, 2, 'born'],
      [0, 3, 'born'],
    ]);

    // A stub returning a fixed k is what makes this NON-CIRCULAR: it pins the mapping from draw to
    // winner, which a seeded literal alone cannot (a literal only pins stability).
    for (const [k, expected] of [
      [0, 1],
      [1, 2],
      [2, 3],
    ] as const) {
      const cell = gridFromDense([[0]]);
      conflictPhase(cell, claims, depsOf(rosterOf(50, 50, 50), { int: () => k }));
      expect(cell.occupant[0]).toBe(expected);
    }
  });

  it('throws when the generator breaks its contract, rather than electing the first claimant', () => {
    // `Rng` is injected. An adapter written as `{ int: () => Math.random() }` or
    // `int: (n) => Math.random() * n` returns a fraction or an out-of-range draw; the pass-2 walk
    // then never lands and silently keeping the first top claimant would resolve EVERY tie to the
    // lowest ref — the exact low-ref bias `rng.ts` rejection-samples to remove, presenting as a
    // deterministic battle.
    const contest = claimsOf([
      [0, 1, 'born'],
      [0, 2, 'born'],
    ]);
    for (const bad of [7, 2, -1, 0.5]) {
      expect(() =>
        conflictPhase(gridFromDense([[0]]), contest, depsOf(rosterOf(50, 50), { int: () => bad })),
      ).toThrow(/rng\.int\(2\) must return an integer in \[0, 2\)/);
    }
  });

  it('skips over non-top claimants when counting to k', () => {
    // Refs 1 and 3 tie at 50; ref 2 sits between them at 10. `k = 1` must land on ref 3, not on
    // the second element of the run.
    const grid = gridFromDense([[0]]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'born'],
        [0, 2, 'born'],
        [0, 3, 'born'],
      ]),
      depsOf(rosterOf(50, 10, 50), { int: () => 1 }),
    );

    expect(grid.occupant[0]).toBe(3);
  });

  it('is reproducible under a fixed seed', () => {
    const run = (): number[] => {
      const grid = gridFromDense([
        [0, 0, 0],
        [0, 0, 0],
      ]);
      conflictPhase(
        grid,
        claimsOf([
          [0, 1, 'born'],
          [0, 2, 'born'],
          [1, 1, 'born'],
          [1, 2, 'born'],
          [4, 1, 'born'],
          [4, 2, 'born'],
          [5, 1, 'born'],
          [5, 2, 'born'],
        ]),
        depsOf(rosterOf(50, 50), createSeededRng(FIXED_SEED)),
      );
      return Array.from(grid.occupant);
    };

    expect(run()).toEqual(run());
  });
});

describe('survive and born compete UNIFORMLY — incumbency is not a special case (AC4, H-6)', () => {
  it('a higher-Dominance BIRTH evicts a surviving incumbent', () => {
    const grid = gridWithAges([[1]], [5]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'survive'],
        [0, 2, 'born'],
      ]),
      depsOf(rosterOf(10, 90)),
    );

    expect(grid.occupant[0]).toBe(2);
    // A birth, not an inherited age: the evicted incumbent's 5 must not carry over.
    expect(grid.age[0]).toBe(0);
  });

  it('a lower-Dominance birth is REFUSED and the incumbent survives', () => {
    // Pinned in BOTH directions on purpose: a suite that only shows an eviction being refused
    // proves nothing about H-6 — it is equally consistent with an incumbency shortcut.
    const grid = gridWithAges([[1]], [5]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'survive'],
        [0, 2, 'born'],
      ]),
      depsOf(rosterOf(90, 10)),
    );

    expect(grid.occupant[0]).toBe(1);
    expect(grid.age[0]).toBe(6);
  });

  it('order within the run does not privilege the survivor', () => {
    // Same contest, the born claim listed FIRST. Claims are ordered by ref (claims.ts invariant 2),
    // so a resolver that took "the first claim at the top dominance" from an ordering that put
    // survivors first would still pass the two tests above.
    const grid = gridWithAges([[2]], [5]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'born'],
        [0, 2, 'survive'],
      ]),
      depsOf(rosterOf(90, 10)),
    );

    expect(grid.occupant[0]).toBe(1);
    expect(grid.age[0]).toBe(0);
  });

  it('a birth and a survive at EQUAL Dominance go to the tie-break, not to the incumbent', () => {
    const grid = gridWithAges([[1]], [5]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'survive'],
        [0, 2, 'born'],
      ]),
      depsOf(rosterOf(50, 50), { int: () => 1 }),
    );

    expect(grid.occupant[0]).toBe(2);
    expect(grid.age[0]).toBe(0);
  });
});

describe('every destination cell is written, and an unclaimed occupant is CLEARED (AC6, M10)', () => {
  it('an occupied cell nobody claimed is gone at cycle end — implicit death', () => {
    // The story's central trap: iterating the claims arrays instead of sweeping the grid leaves
    // every non-claiming occupant standing, which makes Conway's Classic (no `die` rule at all) a
    // grid that only ever grows. It still "runs".
    const grid = gridWithAges(
      [
        [1, 2],
        [3, 0],
      ],
      [4, 5, 6, 0],
    );
    conflictPhase(grid, claimsOf([[1, 2, 'survive']]), depsOf(rosterOf(10, 20, 30)));

    expect(gridToDense(grid)).toEqual([
      [0, 2],
      [0, 0],
    ]);
    expect(Array.from(grid.age)).toEqual([0, 6, 0, 0]);
  });

  it('clears ages as well as occupants, so a stale frame never survives (doubleBuffer.ts)', () => {
    // The destination arrives holding cycle N-2's frame after two swaps. A cleared cell must zero
    // BOTH buffers: an age left standing under an empty cell is inherited by whatever is born
    // there next, which reads as a cell that was never young.
    const grid = gridWithAges(
      [
        [7, 7],
        [7, 7],
      ],
      [999, 999, 999, 999],
    );
    conflictPhase(grid, claimsOf([]), depsOf(rosterOf(10, 20, 30, 40, 50, 60, 70)));

    expect(Array.from(grid.occupant)).toEqual([0, 0, 0, 0]);
    expect(Array.from(grid.age)).toEqual([0, 0, 0, 0]);
  });

  it('sweeps every cell of a non-square grid, claims or not', () => {
    // Dimensions are parameters, never constants (Decision A) — a 1xN and an Nx1 grid are where a
    // row-major sweep written against a square goes wrong.
    const wide = gridFromDense([[0, 1, 2, 3, 0]]);
    conflictPhase(wide, claimsOf([[3, 3, 'survive']]), depsOf(rosterOf(10, 20, 30)));
    expect(gridToDense(wide)).toEqual([[0, 0, 0, 3, 0]]);

    const tall = gridFromDense([[1], [2], [3]]);
    conflictPhase(tall, claimsOf([[1, 2, 'survive']]), depsOf(rosterOf(10, 20, 30)));
    expect(gridToDense(tall)).toEqual([[0], [2], [0]]);
  });

  it('handles an empty grid and an empty claims list without touching the cursor', () => {
    const empty = gridFromDense([]);
    expect(() => conflictPhase(empty, claimsOf([]), depsOf(rosterOf(10)))).not.toThrow();
    expect(gridToDense(empty)).toEqual([]);
  });

  it('throws on claims that arrive out of order or off the grid, instead of wiping the rest', () => {
    // The cursor only advances past a claim whose cellIndex EQUALS the swept cell, so an
    // out-of-order or out-of-range claim stalls it: every later cell would be cleared and every
    // later claim dropped, and — extinction being a normal outcome — that reads as a legitimate
    // wipe-out. The post-sweep check makes it loud. Nothing in the shipped path can produce these
    // (`birthSurvivalPhase` scans row-major); this pins the contract for a hand-built caller.
    const outOfOrder = claimsOf([
      [1, 1, 'born'],
      [0, 2, 'born'],
    ]);
    expect(() =>
      conflictPhase(gridFromDense([[0, 0]]), outOfOrder, depsOf(rosterOf(10, 20))),
    ).toThrow(/1 of 2 claims were never matched to a cell/);

    const offGrid = claimsOf([[4, 1, 'born']]);
    expect(() =>
      conflictPhase(
        gridFromDense([
          [0, 0],
          [0, 0],
        ]),
        offGrid,
        depsOf(rosterOf(10)),
      ),
    ).toThrow(/1 of 1 claims were never matched to a cell/);
  });

  it('resolves a claim on the LAST cell — the cursor must not run off the end first', () => {
    const grid = gridFromDense([
      [0, 0],
      [0, 0],
    ]);
    conflictPhase(grid, claimsOf([[3, 1, 'born']]), depsOf(rosterOf(10)));

    expect(gridToDense(grid)).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });
});

describe('aging: +1 on survive, 0 on born, saturating at maxRelevantAge (AC7, AC8, B.5)', () => {
  it('a survivor ages by one', () => {
    const grid = gridWithAges([[1]], [3]);
    conflictPhase(grid, claimsOf([[0, 1, 'survive']]), depsOf(rosterOf(10)));

    expect(grid.age[0]).toBe(4);
  });

  it('a birth resets to 0 even when the INCUMBENT wins it — a rebirth (claims.ts invariant 3)', () => {
    // Deriving the age update from `winner === incumbent` instead of the claim's ACTION passes
    // every other test in this file and is wrong exactly here. No single-organism fixture that
    // never rebirths in place can see it.
    const grid = gridWithAges([[1]], [4]);
    conflictPhase(grid, claimsOf([[0, 1, 'born']]), depsOf(rosterOf(10)));

    expect(grid.occupant[0]).toBe(1);
    expect(grid.age[0]).toBe(0);
  });

  it('saturates AT maxRelevantAge and stays there', () => {
    const grid = gridWithAges([[1]], [7]);
    const claims = claimsOf([[0, 1, 'survive']]);
    const deps = depsOf(rosterOf(10), forbiddenRng, 7);

    conflictPhase(grid, claims, deps);
    expect(grid.age[0]).toBe(7);
    conflictPhase(grid, claims, deps);
    expect(grid.age[0]).toBe(7);
  });

  it('is min(age + 1, max), NOT min(age, max) + 1 — the permanent off-by-one', () => {
    // An age already ABOVE the ceiling is the only input that separates the two formulas:
    // min(9, 7) + 1 = 8 overshoots forever, min(9 + 1, 7) = 7 does not. Invisible in any fixture
    // that never runs past maxRelevantAge, which is why AC11's 10-cycle blinker exists too.
    const grid = gridWithAges([[1]], [9]);
    conflictPhase(grid, claimsOf([[0, 1, 'survive']]), depsOf(rosterOf(10), forbiddenRng, 7));

    expect(grid.age[0]).toBe(7);
  });

  it('honours a battle-specific ceiling above the eight-shade floor', () => {
    // maxRelevantAge is `max(7, maxAgeLiteral + 1)` per battle (Decision B.5), never a constant.
    const grid = gridWithAges([[1]], [11]);
    conflictPhase(grid, claimsOf([[0, 1, 'survive']]), depsOf(rosterOf(10), forbiddenRng, 12));

    expect(grid.age[0]).toBe(12);
  });

  it('ages every survivor regardless of any aging toggle (AC8, FR-2.4)', () => {
    // `ConflictDeps` carries no `agingEnabled` and there is nothing to branch on — this test
    // states the CONSEQUENCE so a future reader adding the field finds a named obligation.
    // FR-2.4: the toggle affects visual rendering only; cell-age tracking is unaffected, because
    // age is engine state and a rule input whether or not the fade is shown. The symptom of
    // gating would be that a non-aging organism's `age`-conditioned rules never fire.
    const roster: OrganismRuntime[] = rosterOf(10, 20);
    expect(Object.keys(roster[0])).toEqual(['dominance']);

    const grid = gridWithAges([[1, 2]], [2, 2]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'survive'],
        [1, 2, 'survive'],
      ]),
      depsOf(roster),
    );

    expect(Array.from(grid.age)).toEqual([3, 3]);
  });
});

describe('the claims contract is consumed as a single linear pass (AC14, claims.ts invariant 1)', () => {
  it('resolves contiguous runs across many cells in one sweep', () => {
    const grid = gridFromDense([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    conflictPhase(
      grid,
      claimsOf([
        [0, 1, 'born'],
        [0, 3, 'born'],
        [2, 2, 'born'],
        [5, 1, 'born'],
        [5, 2, 'born'],
        [5, 3, 'born'],
        [8, 3, 'born'],
      ]),
      depsOf(rosterOf(10, 30, 20)),
    );

    expect(gridToDense(grid)).toEqual([
      [3, 0, 2],
      [0, 0, 2],
      [0, 0, 3],
    ]);
  });

  it('a run of one is not a tie and never reaches the generator', () => {
    const grid = gridFromDense([[0, 0, 0]]);
    expect(() =>
      conflictPhase(
        grid,
        claimsOf([
          [0, 1, 'born'],
          [1, 2, 'born'],
          [2, 3, 'born'],
        ]),
        depsOf(rosterOf(10, 20, 30)),
      ),
    ).not.toThrow();
    expect(gridToDense(grid)).toEqual([[1, 2, 3]]);
  });
});
