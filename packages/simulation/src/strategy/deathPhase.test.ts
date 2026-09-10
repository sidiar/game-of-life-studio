import { CONWAYS_CLASSIC, createMockOrganisms, gridFromPattern } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';

import { createGrid, gridFromDense, gridToDense } from '../grid/grid';
import type { Grid } from '../grid/grid';
import { compileSession } from '../session/compileEvaluators';
import type { CompilableOrganism } from '../session/compileEvaluators';
import { deathPhase } from './deathPhase';
import type { PhaseDeps } from './phaseDeps';

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────
// Compiled through `compileSession`, never hand-built (Trap 15): a hand-written `OrganismEvaluators`
// literal skips interning, MAX_RELEVANT_AGE and the eager sweep, so a golden asserted against one
// proves nothing about the pipeline the app runs.

// Refs are roster index + 1 (M14): 1 = Aggressive Colonizer, 2 = Patient Defender, 3 = Chaotic
// Spreader.
const REF_AGGRESSIVE = 1;
const REF_PATIENT = 2;

const mockSession = (): PhaseDeps => compileSession(createMockOrganisms());

const conwaySession = (): PhaseDeps =>
  compileSession([{ id: CONWAYS_CLASSIC.id, survivalRules: CONWAYS_CLASSIC.survivalRules }]);

const legendA = { '.': 0, A: REF_AGGRESSIVE };

const grid = (rows: readonly string[], legend: Record<string, number>): Grid =>
  gridFromDense(gridFromPattern(rows, legend));

const back = (source: Grid): Grid => createGrid(source.width, source.height);

// ── AC4 / M10: implicit death is NOT a Phase-1 fact ─────────────────────────────────────────────

describe('deathPhase over an organism with no `die` rule (AC4)', () => {
  // ⚠️ Conway's Classic has NO `die` rule at all, so Phase 1 over a Conway battle is a NO-OP. A
  // test asserting that a Conway cell with 1 neighbour is removed here has encoded the wrong
  // model: that cell dies by IMPLICIT death at cycle end (M10) and is still a Phase-2 neighbour
  // until then, which is exactly what preserves simultaneous-generation semantics.
  const BLINKER = ['.....', '..C..', '..C..', '..C..', '.....'];
  const legendC = { '.': 0, C: 1 };

  it('returns a grid equal in content to its input', () => {
    const source = grid(BLINKER, legendC);
    const result = deathPhase(source, back(source), conwaySession());

    expect(gridToDense(result)).toEqual(gridFromPattern(BLINKER, legendC));
  });

  it('leaves the doomed end cells standing — they have 1 neighbour and no `die` rule', () => {
    const source = grid(BLINKER, legendC);
    const result = deathPhase(source, back(source), conwaySession());

    // (2,1) and (2,3): the two cells Conway will not let survive. Phase 1 is not where that
    // happens.
    expect(result.occupant[1 * 5 + 2]).toBe(1);
    expect(result.occupant[3 * 5 + 2]).toBe(1);
  });
});

// ── AC1 / AC2: explicit deaths only, all decided from the source grid ───────────────────────────

describe('deathPhase applies `die` rules and nothing else (AC1)', () => {
  // Aggressive Colonizer's AGGRESSIVE_DIE is `cellState eq alive` + `neighborCount gt 5`.
  // A 3x3 block: only the centre has more than 5 same-organism neighbours (it has 8); the
  // edge-middles have 5 and the corners 3.
  const BLOCK = ['.....', '.AAA.', '.AAA.', '.AAA.', '.....'];

  it('removes exactly the cells whose own organism matched a `die` rule', () => {
    const source = grid(BLOCK, legendA);
    const result = deathPhase(source, back(source), mockSession());

    expect(gridToDense(result)).toEqual(
      gridFromPattern(['.....', '.AAA.', '.A.A.', '.AAA.', '.....'], legendA),
    );
  });

  it('is internally SIMULTANEOUS — two mutually-adjacent doomed cells both die (AC2, Trap 4)', () => {
    // Both (1,1) and (2,1) have exactly 6 same-organism neighbours, and each is a neighbour of the
    // other. A loop that cleared cells into the grid it is scanning would drop (2,1) to 5 after
    // (1,1) went, and (2,1) would SURVIVE — order-dependent, and invisible in a symmetric fixture.
    const source = grid(['.AA.', 'AAAA', '.AA.'], legendA);
    const result = deathPhase(source, back(source), mockSession());

    expect(gridToDense(result)).toEqual(gridFromPattern(['.AA.', 'A..A', '.AA.'], legendA));
  });

  it('reads `age` exactly as stored — an increment here would kill the 7 (Trap 9)', () => {
    // Patient Defender's PATIENT_DIE is `alive` + `age gte 8`. Only the INCREMENT half of Trap 9
    // is detectable by any rule: MAX_RELEVANT_AGE is `maxLiteral + 1` by construction (Decision
    // B.5), so a clamp to it changes no operator's answer — that is the point of the `+ 1`.
    const source = grid(['P.P'], { '.': 0, P: REF_PATIENT });
    source.age[0] = 7;
    source.age[2] = 8;

    const result = deathPhase(source, back(source), mockSession());

    expect(Array.from(result.occupant)).toEqual([REF_PATIENT, 0, 0]);
  });
});

// ── AC10: the destination is written in full ────────────────────────────────────────────────────

describe('deathPhase writes every destination cell (AC10, doubleBuffer.ts)', () => {
  // ⚠️ After two swaps the back buffer holds cycle N-2's frame. A writer that stores only living
  // or changed cells RESURRECTS those cells, and nothing in the buffer layer can detect it — so
  // every test here hands `deathPhase` a destination pre-filled with a stale frame rather than a
  // fresh zeroed grid.
  const stale = (source: Grid): Grid => {
    const destination = createGrid(source.width, source.height);
    destination.occupant.fill(9);
    destination.age.fill(1234);
    return destination;
  };

  it('overwrites a stale frame everywhere, empties included', () => {
    const source = grid(['A..', '...', '..A'], legendA);
    const result = deathPhase(source, stale(source), mockSession());

    expect(Array.from(result.occupant)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('zeroes AGE under every empty cell, not just occupancy', () => {
    // A stale age left standing under an empty cell is inherited by whatever is born there next,
    // which reads as a cell that was never young.
    const source = grid(['A..'], legendA);
    source.age[0] = 5;

    const result = deathPhase(source, stale(source), mockSession());

    expect(Array.from(result.age)).toEqual([5, 0, 0]);
  });

  it('zeroes AGE under a cell it kills', () => {
    const source = grid(['P'], { P: REF_PATIENT });
    source.age[0] = 8; // PATIENT_DIE fires

    const result = deathPhase(source, stale(source), mockSession());

    expect(Array.from(result.occupant)).toEqual([0]);
    expect(Array.from(result.age)).toEqual([0]);
  });

  it('copies a survivor’s age forward verbatim', () => {
    const source = grid(['P'], { P: REF_PATIENT });
    source.age[0] = 7;

    const result = deathPhase(source, stale(source), mockSession());

    expect(Array.from(result.age)).toEqual([7]);
  });
});

// ── AC9: purity over the source, and the seam's own preconditions ───────────────────────────────

describe('deathPhase — the source is an input, the destination an output (AC9, FD2)', () => {
  it('never writes the source grid', () => {
    const source = grid(['.AA.', 'AAAA', '.AA.'], legendA);
    const occupantBefore = Array.from(source.occupant);
    const ageBefore = Array.from(source.age);

    deathPhase(source, back(source), mockSession());

    expect(Array.from(source.occupant)).toEqual(occupantBefore);
    expect(Array.from(source.age)).toEqual(ageBefore);
  });

  it('returns the caller-supplied destination itself for chaining — no grid is allocated', () => {
    const source = grid(['A'], legendA);
    const destination = back(source);

    const result = deathPhase(source, destination, mockSession());

    expect(result).toBe(destination);
    expect(result.occupant).toBe(destination.occupant);
  });

  it('rejects a mis-sized destination rather than scattering every row-major index', () => {
    const source = grid(['AA', 'AA'], legendA);

    expect(() => deathPhase(source, createGrid(4, 1), mockSession())).toThrow(/destination is 4x1/);
  });

  it('rejects a destination that shares a buffer with the source (Trap 4)', () => {
    const source = grid(['AA', 'AA'], legendA);
    const aliased: Grid = { ...source, age: new Uint16Array(4) };

    expect(() => deathPhase(source, aliased, mockSession())).toThrow(/shares a buffer/);
  });
});

// ── Trap 1 / Trap 14: the ref-indexed table ─────────────────────────────────────────────────────

describe('deathPhase — evaluatorsByRef indexing (Trap 1, Trap 14)', () => {
  it('asks the OCCUPANT’s own evaluator, not its neighbour’s', () => {
    // Ref 1 has a `die` rule that always fires; ref 2 has none. Under the `[ref - 1]` off-by-one,
    // ref 1 would read slot 0 (`null`, so it would survive) and ref 2 would read ref 1's rules
    // (so it would die) — the answers swap, and both grids look plausible.
    const organisms: CompilableOrganism[] = [
      {
        id: 'always-dies',
        survivalRules: [
          {
            id: 'r1',
            contentHash: 'h1',
            conditions: [{ property: 'cellState', operator: 'eq', pattern: 'alive' }],
            payload: { summary: 'always dies', action: 'die' },
          },
        ],
      },
      { id: 'immortal', survivalRules: [] },
    ];
    const source = grid(['XY'], { X: 1, Y: 2 });

    const result = deathPhase(source, back(source), compileSession(organisms));

    expect(Array.from(result.occupant)).toEqual([0, 2]);
  });

  it('fails closed on an occupant ref beyond the compiled roster (Trap 14, M12)', () => {
    // Unreachable through persistence (`BattleSchema` validates `v <= organismIds.length`) but an
    // ordinary in-memory shape bug. `evaluatorsByRef[7]` is `undefined`, and calling
    // `.resolvesToDeath` on it would crash the whole cycle from inside the loop; instead the cell
    // behaves as an organism with no rules — not killed here, no claim in Phase 2, gone at cycle
    // end by implicit death.
    const source = grid(['Z'], { Z: 7 });

    const result = deathPhase(source, back(source), conwaySession());

    expect(Array.from(result.occupant)).toEqual([7]);
  });

  it('accepts the whole CompiledSession — a wider deps object satisfies PhaseDeps (FD1)', () => {
    const session = compileSession(createMockOrganisms());
    const source = grid(['A'], legendA);

    // `session` carries `refById` and `maxRelevantAge` too; nothing here reads them, and Story
    // 3.6's full `SimulationDeps` will be accepted the same way with no adapter.
    expect(() => deathPhase(source, back(source), session)).not.toThrow();
  });
});
