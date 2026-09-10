import { CONWAYS_CLASSIC, createMockOrganisms, gridFromPattern } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import { gridFromDense } from '../grid/grid';
import type { Grid } from '../grid/grid';
import { compileSession } from '../session/compileEvaluators';
import type { CompilableOrganism } from '../session/compileEvaluators';
import { birthSurvivalPhase } from './birthSurvivalPhase';
import type { Claims } from './claims';
import type { PhaseDeps } from './phaseDeps';

// Refs are roster index + 1 (M14). createMockOrganisms(): 1 = Aggressive Colonizer,
// 2 = Patient Defender, 3 = Chaotic Spreader.
const REF_AGGRESSIVE = 1;
const REF_PATIENT = 2;
const REF_CHAOTIC = 3;

const mockSession = (): PhaseDeps => compileSession(createMockOrganisms());

const conwaySession = (): PhaseDeps =>
  compileSession([{ id: CONWAYS_CLASSIC.id, survivalRules: CONWAYS_CLASSIC.survivalRules }]);

const grid = (rows: readonly string[], legend: Record<string, number>): Grid =>
  gridFromDense(gridFromPattern(rows, legend));

/** Claims as readable triples, so a failure prints something a human can check by hand. */
const triples = (claims: Claims): Array<[number, number, string]> =>
  claims.cellIndex.map((index, i) => [index, claims.ref[i], claims.action[i]]);

// ── AC12: the Conway blinker, claim by claim ────────────────────────────────────────────────────

describe('birthSurvivalPhase — the Conway blinker, decomposed (AC12)', () => {
  // A vertical blinker on 5x5. Conway's Classic: born on an EMPTY cell with exactly 3 neighbours,
  // survive with 2-3 — and no `die` rule, so Phase 1 was a no-op and this grid IS the post-death
  // intermediate.
  //
  //        col:  0 1 2 3 4
  //   row 0:     . . . . .
  //   row 1:     . . C . .      <- 1 neighbour: no claim (implicit death)
  //   row 2:     . C C C .      <- centre survives; (1,2) and (3,2) are born
  //   row 3:     . . C . .      <- 1 neighbour: no claim
  //   row 4:     . . . . .
  const BLINKER = grid(['.....', '..C..', '..C..', '..C..', '.....'], { '.': 0, C: 1 });
  const at = (col: number, row: number): number => row * 5 + col;

  it('produces exactly one survive claim and two born claims', () => {
    expect(triples(birthSurvivalPhase(BLINKER, conwaySession()))).toEqual([
      [at(1, 2), 1, 'born'],
      [at(2, 2), 1, 'survive'],
      [at(3, 2), 1, 'born'],
    ]);
  });

  it('makes NO claim on the two end cells — implicit death is an absence, not a death claim', () => {
    // ⚠️ THE assertion of this story (M10, Trap 2). `resolveBirthSurvival` returns `null` for both
    // ends because no rule matched; collapsing that `null` into a death would remove them before
    // Phase-2 counting and break every Conway golden while looking equivalent. What fails if
    // someone "helpfully" collapses it is this test, and nothing else.
    const claims = birthSurvivalPhase(BLINKER, conwaySession());

    expect(claims.cellIndex).not.toContain(at(2, 1));
    expect(claims.cellIndex).not.toContain(at(2, 3));
    expect(claims.action).not.toContain('die');
  });
});

// ── AC5–AC8: the multi-organism pass ────────────────────────────────────────────────────────────

describe('birthSurvivalPhase — every organism against every cell (AC5, AC6)', () => {
  // Three Aggressive Colonizer cells along the top edge of a 3x3 grid, evaluated against the whole
  // three-organism mock roster.
  //
  //   row 0:  A A A
  //   row 1:  . . .
  //   row 2:  . . .
  const TOP_ROW = grid(['AAA', '...', '...'], { '.': 0, A: REF_AGGRESSIVE });
  const at = (col: number, row: number): number => row * 3 + col;

  it('yields exactly the hand-computed claim set', () => {
    // (0,0) A: 1 same neighbour — no born (not empty), no survive (needs >= 2). Chaotic Spreader
    //          claims it: `cellState eq occupied` + `organismType eq aggressiveColonizer`.
    // (1,0) A: 2 same neighbours — survives, and Chaotic claims it too.
    // (2,0) A: 1 same neighbour — Chaotic's claim only.
    // (1,1)  : empty with exactly 3 A neighbours — Aggressive is born.
    expect(triples(birthSurvivalPhase(TOP_ROW, mockSession()))).toEqual([
      [at(0, 0), REF_CHAOTIC, 'born'],
      [at(1, 0), REF_AGGRESSIVE, 'survive'],
      [at(1, 0), REF_CHAOTIC, 'born'],
      [at(2, 0), REF_CHAOTIC, 'born'],
      [at(1, 1), REF_AGGRESSIVE, 'born'],
    ]);
  });

  it('lets an organism claim a cell ANOTHER organism occupies (H-6 candidate)', () => {
    // Chaotic Spreader's CHAOTIC_BORN targets `cellState eq occupied` + `organismType eq
    // <aggressive's library id>`, interned to ref 1 at compile time (Decision E.3). Phase 2 proves
    // the claim EXISTS; who wins the cell is Story 3.6's Phase 3.
    const claims = birthSurvivalPhase(TOP_ROW, mockSession());
    const onOccupied = triples(claims).filter(([, ref]) => ref === REF_CHAOTIC);

    expect(onOccupied).toEqual([
      [at(0, 0), REF_CHAOTIC, 'born'],
      [at(1, 0), REF_CHAOTIC, 'born'],
      [at(2, 0), REF_CHAOTIC, 'born'],
    ]);
  });

  it('materializes SAME-organism neighbour counts, not "all occupied neighbours" (Trap 6)', () => {
    // ⚠️ The discriminator. Cell (1,1) has 3 occupied neighbours, all of them Aggressive. Patient
    // Defender's PATIENT_BORN is `cellState eq empty` + `neighborCount range [3,4]` — under the
    // wrong reading (`neighborCount` = all eight occupied neighbours) Patient would answer 3 and
    // claim the cell. Its real `neighborCount` is 0: it has no cells anywhere.
    const claims = birthSurvivalPhase(TOP_ROW, mockSession());

    expect(triples(claims).filter(([, ref]) => ref === REF_PATIENT)).toEqual([]);
  });

  it('is order-independent across organisms — no organism sees another’s answer (AC5)', () => {
    // Reverse the roster and remap the grid to match (a ref is roster-position-dependent, M14):
    // the same physical dish, the same three organisms, evaluated in the opposite order. Every
    // claim must survive the permutation, re-keyed — which is what "in parallel" (FR-5.3) means
    // operationally. An early exit or a shared accumulator would show up here as a missing claim.
    const reversed = compileSession(createMockOrganisms().reverse());
    const remapped = grid(['AAA', '...', '...'], { '.': 0, A: 3 }); // Aggressive is now ref 3

    // Chaotic Spreader is ref 1 here, Aggressive ref 3. Note (1,0) carrying two claims with refs
    // ASCENDING inside the cell's run (claims.ts, invariant 2).
    expect(triples(birthSurvivalPhase(remapped, reversed))).toEqual([
      [at(0, 0), 1, 'born'],
      [at(1, 0), 1, 'born'],
      [at(1, 0), 3, 'survive'],
      [at(2, 0), 1, 'born'],
      [at(1, 1), 3, 'born'],
    ]);
  });
});

// ── AC7 / FD4: a claim carries its action ───────────────────────────────────────────────────────

describe('birthSurvivalPhase — survive is the incumbent’s alone (FD4)', () => {
  // `createMockOrganisms()` contains no non-incumbent `survive` rule, so the case has to be built:
  // it is schema-legal (`cellState eq occupied` with a `survive` payload) and the semantics must
  // not be decided by accident.
  const invader: CompilableOrganism = {
    id: 'invader',
    survivalRules: [
      {
        id: 'r-survive-others-cell',
        contentHash: 'h-survive-others-cell',
        conditions: [{ property: 'cellState', operator: 'eq', pattern: 'occupied' }],
        payload: { summary: 'survives on someone else’s cell', action: 'survive' },
      },
    ],
  };
  const rebornIncumbent: CompilableOrganism = {
    id: 'reborn',
    survivalRules: [
      {
        id: 'r-born-on-own-cell',
        contentHash: 'h-born-on-own-cell',
        conditions: [{ property: 'cellState', operator: 'eq', pattern: 'alive' }],
        payload: { summary: 'is reborn on its own cell', action: 'born' },
      },
    ],
  };

  it('DROPS a `survive` from an organism that does not occupy the cell', () => {
    // If such a claim won Phase 3, the winner's age would be set to the PREVIOUS occupant's age +
    // 1 — meaningless. Ref 1 is `reborn` (holding the cell), ref 2 is `invader`.
    const session = compileSession([rebornIncumbent, invader]);
    const claims = birthSurvivalPhase(grid(['R'], { R: 1 }), session);

    expect(triples(claims)).toEqual([[0, 1, 'born']]);
  });

  it('KEEPS a `born` from the incumbent — the mirror case is not symmetric (AC7)', () => {
    // A rebirth: Story 3.6 resets the winner's age to 0, which cannot be re-derived from
    // "winner === incumbent". Dropping this would be a silent aging bug with no failing test in
    // any single-organism fixture.
    const session = compileSession([rebornIncumbent]);
    const claims = birthSurvivalPhase(grid(['R'], { R: 1 }), session);

    expect(claims.action).toEqual(['born']);
  });
});

// ── AC8 / claims.ts: the invariants Story 3.6 depends on ────────────────────────────────────────

describe('birthSurvivalPhase — the claims value’s invariants (FD3)', () => {
  const TOP_ROW = grid(['AAA', '...', '...'], { '.': 0, A: REF_AGGRESSIVE });

  it('returns three arrays of equal length', () => {
    const claims = birthSurvivalPhase(TOP_ROW, mockSession());

    expect(claims.ref).toHaveLength(claims.cellIndex.length);
    expect(claims.action).toHaveLength(claims.cellIndex.length);
  });

  it('keeps every cell’s claims CONTIGUOUS, with cellIndex non-decreasing (invariant 1)', () => {
    // Story 3.6's Phase 3 is a single linear pass with a run detector and depends on this. A loop
    // reorder that broke it would otherwise surface as a silent conflict-resolution bug.
    const claims = birthSurvivalPhase(TOP_ROW, mockSession());

    for (let i = 1; i < claims.cellIndex.length; i++) {
      expect(claims.cellIndex[i]).toBeGreaterThanOrEqual(claims.cellIndex[i - 1]);
    }
  });

  it('gives one organism AT MOST ONE claim per cell (invariant 2, AC8)', () => {
    // Rule order is first-match priority within the phase and it already ran inside the compiled
    // evaluator — this layer never merges or re-ranks.
    const claims = birthSurvivalPhase(TOP_ROW, mockSession());
    const seen = new Set<string>();

    for (let i = 0; i < claims.cellIndex.length; i++) {
      const key = `${claims.cellIndex[i]}:${claims.ref[i]}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('returns a fresh value each call, owned by the caller (AR-16)', () => {
    const deps = mockSession();
    const first = birthSurvivalPhase(TOP_ROW, deps);
    const second = birthSurvivalPhase(TOP_ROW, deps);

    expect(first.cellIndex).not.toBe(second.cellIndex);
    expect(first.cellIndex).toEqual(second.cellIndex);
  });

  it('returns empty arrays when nothing claims anything', () => {
    const empty = grid(['..', '..'], { '.': 0 });
    const claims = birthSurvivalPhase(empty, conwaySession());

    expect(claims.cellIndex).toEqual([]);
    expect(claims.ref).toEqual([]);
    expect(claims.action).toEqual([]);
  });
});

// ── Trap 1 / Trap 3: the roster loop ────────────────────────────────────────────────────────────

describe('birthSurvivalPhase — the roster loop (Trap 1)', () => {
  it('starts at ref 1 and never calls slot 0’s null', () => {
    // `for (const e of evaluatorsByRef)` would hand slot 0's `null` to `.resolveBirthSurvival`
    // and crash; `evaluatorsByRef[ref - 1]` would run every organism's NEIGHBOUR's rules.
    const organisms: CompilableOrganism[] = [
      {
        id: 'claims-empty-cells',
        survivalRules: [
          {
            id: 'r1',
            contentHash: 'h1',
            conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
            payload: { summary: 'born anywhere empty', action: 'born' },
          },
        ],
      },
      { id: 'inert', survivalRules: [] },
    ];

    const claims = birthSurvivalPhase(grid(['..'], { '.': 0 }), compileSession(organisms));

    // Ref 1 — not ref 2, which is what `[ref - 1]` would produce.
    expect(triples(claims)).toEqual([
      [0, 1, 'born'],
      [1, 1, 'born'],
    ]);
  });

  it('skips a null table slot instead of calling it', () => {
    // `evaluatorsByRef` is typed `(OrganismEvaluators | null)[]`, so a `null` anywhere in it is a
    // legal input, not just at slot 0 — and `for (const e of evaluatorsByRef)` is the shape that
    // hands one straight to `.resolveBirthSurvival` and crashes the cycle. This is the one place a
    // deps object is assembled by hand rather than through `compileSession` (RFC-004 §3.5
    // sanctions stub evaluators for isolating a phase from the rules layer): the table's SHAPE is
    // what is under test, and no compiled roster can produce an interior hole.
    const compiled = compileSession([
      {
        id: 'claims-empty-cells',
        survivalRules: [
          {
            id: 'r1',
            contentHash: 'h1',
            conditions: [{ property: 'cellState', operator: 'eq', pattern: 'empty' }],
            payload: { summary: 'born anywhere empty', action: 'born' },
          },
        ],
      },
    ]);
    const holed: PhaseDeps = { evaluatorsByRef: [null, null, compiled.evaluatorsByRef[1]] };

    const claims = birthSurvivalPhase(grid(['.'], { '.': 0 }), holed);

    expect(triples(claims)).toEqual([[0, 2, 'born']]);
  });

  it('counts an implicitly-doomed cell as a neighbour for the whole phase (M10, Trap 3)', () => {
    // The blinker's end cell at (2,1) matches nothing and will be gone at cycle end — but it is
    // still standing here, and it is one of the 3 neighbours that let (1,2) and (3,2) be born.
    // Removing it in Phase 1 would leave them with 2 and no birth at all.
    const BLINKER = grid(['.....', '..C..', '..C..', '..C..', '.....'], { '.': 0, C: 1 });
    const claims = birthSurvivalPhase(BLINKER, conwaySession());

    expect(claims.cellIndex).toContain(2 * 5 + 1);
    expect(claims.cellIndex).toContain(2 * 5 + 3);
  });
});
