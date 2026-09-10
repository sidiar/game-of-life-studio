// Phase 1 of the three-phase strategy (FR-5.2, RFC-004 §3.2, M10 H-5): who is EXPLICITLY killed.
import type { CellSubject } from '../gol/cellSubject';
import type { Grid } from '../grid/grid';
import { countNeighbors } from '../grid/neighborhood';
import type { PhaseDeps } from './phaseDeps';
import { evaluatorsFor } from './phaseDeps';

/**
 * Applies every organism's `die` rules to `source`, writing the post-death intermediate grid into
 * `destination` and returning it for chaining.
 *
 * ## Why a DESTINATION rather than a fresh grid (story FD2, option (b))
 *
 * RFC-004 §3.2's snippet used to read `deathPhase(grid, deps) => Grid`, i.e. allocate-per-call.
 * That snippet was illustrative pseudocode; `../grid/doubleBuffer.ts` — written after it, and
 * naming this story — states the shape the shipped buffer seam was built for: the phases write
 * into `back`, the caller swaps, and the SOURCE grid is never written, so the destination is a
 * distinct grid the caller supplied. Story 3.6 adopted the same shape for `threePhaseStep` (its FD1).
 * Allocating would cost a `Uint8Array(N)` plus a `Uint16Array(N)` PER CYCLE (18 KB at 100x60,
 * 72 KB at 200x120, up to 20 times a second), which is precisely the per-cycle
 * allocation Decision A.6's steady-state memory budget and the double buffer exist to avoid. It
 * also makes the two-buffer plan serve a three-grid pipeline: this intermediate IS `back`, Phase 2
 * only reads it, and Phase 3 finishes in place over it.
 *
 * ✅ The divergence is RESOLVED in the RFC's favour of what shipped: `threePhaseStep` landed in
 * Story 3.6 with the matching `(source, destination, deps)` shape, and RFC-004 §3.1/§3.2 were
 * amended to state it — on Sidiar's explicit authorization (2026-09-10), since amending an
 * authority doc is not a story's call (the M14/M15 precedent).
 *
 * ## The two properties this function is pinned on
 *
 * 1. **Every subject is materialized from `source`** (AC2, Trap 4). A loop that cleared cells into
 *    the grid it is scanning would make an earlier cell's death change a later cell's neighbour
 *    count — the result stops being a function of the input and starts depending on scan order,
 *    and a symmetric fixture cannot see it. Phase 1 is internally SIMULTANEOUS.
 * 2. **Every destination cell is written, empties included** (AC10, `doubleBuffer.ts`). After two
 *    swaps `back` holds cycle N-2's frame, so a writer that stores only living or changed cells
 *    RESURRECTS two-cycle-old cells, and nothing in the buffer layer can detect it. A cleared cell
 *    writes `occupant = 0` **and** `age = 0` — a stale age left behind is inherited by whatever is
 *    born there next.
 *
 * ⚠️ IMPLICIT DEATH IS NOT APPLIED HERE (M10, Trap 3 — the load-bearing sentence of this story). A
 * living cell that matches no `die` rule stays on the intermediate grid even when it will match no
 * `survive` rule either. It yields no claim and is gone at cycle end (`conflictPhase`'s sweep
 * clears every unclaimed cell), but it COUNTS AS A PHASE-2 NEIGHBOUR until then, which is what
 * preserves Conway's simultaneous-generation semantics. Conway's Classic has no `die` rule at
 * all, so this phase over a Conway battle returns a grid equal in content to its input.
 *
 * ❌ No call to `resolveCellAction` (Trap 13). The action partition is Story 3.4's COMPILE-TIME
 * work (AR-18, RFC-004 §2.3/§3.5): this phase asks `resolvesToDeath` and never filters, sorts or
 * inspects `payload`. Re-scanning the whole rule list per cell would quietly undo the partition
 * M10's precedence depends on.
 *
 * @throws Error when `destination` does not match `source`'s dimensions, or shares a buffer with
 *   it. Both are O(1), once per cycle — not a per-cell cost — and both name a failure that is
 *   otherwise silent: a mis-sized destination scatters every row-major index, and a shared buffer
 *   turns property 1 above into a lie.
 */
export function deathPhase(source: Grid, destination: Grid, deps: PhaseDeps): Grid {
  assertDistinctSameSize(source, destination);

  // ⚠️ `width`/`height` are read off the grid, never assumed (Decision A) — 100x60 is one preset
  // and Play mode expands to 200x120 (H-9).
  const { width, height, occupant, age } = source;
  const outOccupant = destination.occupant;
  const outAge = destination.age;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const ref = occupant[index];

      if (ref === 0) {
        // AC10: an empty source cell still writes both buffers. This is the branch that is
        // "obviously" skippable and whose absence resurrects cycle N-2.
        outOccupant[index] = 0;
        outAge[index] = 0;
        continue;
      }

      const evaluators = evaluatorsFor(deps, ref);
      // Fail closed (M12, Trap 14): an occupant naming no compiled organism has no `die` rules, so
      // it is not killed here. It makes no Phase-2 claim either, and is gone at cycle end.
      const dies =
        evaluators !== null &&
        evaluators.resolvesToDeath(subjectForOccupant(source, col, row, ref, age[index]));

      // A cleared cell zeroes AGE as well as occupancy: an age left standing under an empty cell
      // is inherited by the next organism born there, which reads as a cell that was never young.
      outOccupant[index] = dies ? 0 : ref;
      outAge[index] = dies ? 0 : age[index];
    }
  }

  return destination;
}

/**
 * The occupant's own view of its cell — `state: 'alive'` by definition, because Phase 1 only ever
 * asks an organism about a cell IT holds (Decision C, AR-20).
 *
 * Counts come from `countNeighbors` on the SOURCE grid: one organism per cell here, so there is
 * nothing for `neighborTally.ts`'s per-cell tally to amortise.
 *
 * ⚠️ For Story 3.7's benchmark, not for now: this scan runs for EVERY occupied cell, including
 * those of an organism with no `die` rule at all (Conway's Classic), whose `resolvesToDeath` can
 * only answer `false`. A per-organism "has death rules" flag on `OrganismEvaluators` would skip
 * it, but that is a Story 3.4 surface change and the repo optimises on measurement
 * (deferred-work.md, Story 3.5 review).
 *
 * ⚠️ `age` is passed exactly as stored — never clamped, incremented or saturated (Trap 9).
 * `CompiledSession.maxRelevantAge` is applied at CYCLE END, by `conflictPhase`'s write (Story
 * 3.6); clamping here would make an `age gt <literal>` rule behave differently in Phase 1 than at
 * cycle end.
 */
function subjectForOccupant(
  source: Grid,
  col: number,
  row: number,
  ref: number,
  age: number,
): CellSubject {
  const { same, other } = countNeighbors(source, col, row, ref);
  return {
    state: 'alive',
    organismType: ref,
    age,
    neighborCount: same,
    occupantNeighborCount: other,
  };
}

/**
 * Both checks are O(1) and run once per cycle. Phase 2 needs neither: it writes no grid.
 */
function assertDistinctSameSize(source: Grid, destination: Grid): void {
  if (destination.width !== source.width || destination.height !== source.height) {
    throw new Error(
      `deathPhase: destination is ${destination.width}x${destination.height}, ` +
        `expected ${source.width}x${source.height}`,
    );
  }
  if (destination.occupant === source.occupant || destination.age === source.age) {
    throw new Error(
      'deathPhase: destination shares a buffer with source — Phase 1 must never read its own ' +
        'output, or one cell dying changes the neighbour count of a cell scanned later (AC2)',
    );
  }
}
