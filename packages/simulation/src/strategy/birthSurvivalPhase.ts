// Phase 2 of the three-phase strategy (FR-5.3, RFC-004 §3.2): who is ASKING to be here next cycle.
import type { CellState, CellSubject } from '../gol/cellSubject';
import type { Action } from '../gol/survivalRules';
import type { Grid } from '../grid/grid';
import type { Claims } from './claims';
import type { PhaseDeps } from './phaseDeps';
import { createNeighborTally, sameNeighbors, tallyNeighbors } from './neighborTally';

/**
 * Evaluates EVERY organism in the roster against EVERY cell of the post-death grid and returns the
 * candidate claims (`claims.ts` carries the returned value's invariants in full).
 *
 * ⚠️ `grid` must be Phase 1's OUTPUT, not the cycle-N grid (AC3). Deriving Phase 2's subjects from
 * the post-death intermediate is the whole of what makes RFC-004 §3.2's *"the same decision
 * function serves both phases; only the input grid changes"* true — and it is why explicit deaths
 * are gone from the neighbour counts while implicit ones are still standing (M10).
 *
 * ## Parallel, in the sense FR-5.3 means it
 *
 * No organism's answer is an input to another's, and no early exit depends on one: every organism
 * is asked about every cell, and each non-`null` answer is a CANDIDATE claim. `null` means *no rule
 * matched* — never a death (M15, Trap 2). A living cell that matches nothing simply makes no claim
 * and is gone at cycle end by implicit death; collapsing `null` into `'die'` would remove it before
 * neighbour counting and break every Conway golden while looking equivalent.
 *
 * ❌ NO CONFLICT RESOLUTION HERE (Trap 10). No `dominance`, no `rng`, no tie-break, no eviction: if
 * this function compared two claims it would have absorbed Phase 3 (Story 3.6). Two organisms
 * claiming one cell is the NORMAL output of this phase, not a problem for it to solve.
 *
 * ❌ No re-ranking or merging of an organism's RULES (AC8). Rule order is first-match priority
 * WITHIN the phase (FR-2.6, M10) and it already ran inside the compiled evaluator, so one organism
 * produces at most one ANSWER per cell — and this layer never re-scans its rules for a different
 * one. The single thing dropped below (FD4) is that answer itself when it is meaningless, not a
 * rule; see the comment at the drop for the consequence that has.
 *
 * ❌ No call to `resolveCellAction` (Trap 13) and no branch on `'die'` (Trap 11) — comparing
 * `=== 'survive'` for the FD4 rule below and passing the action through otherwise means the
 * unreachable case never has to be handled or "tightened" away.
 *
 * ⚠️ COST, for Story 3.7's benchmark rather than for now: this loop allocates one `CellSubject`
 * literal per (cell x organism) — ~120,000 a cycle at the NFR-1.1 baseline — and `countNeighbors`
 * in Phase 1 allocates one `NeighborCounts` per occupied cell. `CellSubject` is `readonly`, so a
 * reused scratch subject would be a deliberate seam, not a local tweak; it is the first candidate
 * to measure, and the repo optimises on measurement (deferred-work.md, Story 3.5 review).
 */
export function birthSurvivalPhase(grid: Grid, deps: PhaseDeps): Claims {
  // ⚠️ Dimensions are parameters, never constants (Decision A).
  const { width, height, occupant, age } = grid;
  const { evaluatorsByRef } = deps;
  const rosterEnd = evaluatorsByRef.length;

  const cellIndex: number[] = [];
  const ref: number[] = [];
  const action: Action[] = [];

  // One scratch tally for the whole pass, rewritten per cell (story FD5) — never per organism, and
  // never module state (AR-16).
  const tally = createNeighborTally();

  // CELL-OUTER, ORGANISM-INNER, and that is a contract rather than a preference: it is what makes
  // every claim for one cell CONTIGUOUS in the returned arrays, which is what lets Story 3.6's
  // Phase 3 resolve conflicts in a single linear pass with no map and no per-cell array. Reordering
  // these two loops silently breaks Phase 3 (claims.ts, invariant 1).
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const occ = occupant[index];
      const cellAge = age[index];

      // Once per cell — not once per (cell x organism). The <= 8 neighbour slots are read ONCE and
      // every organism derives its own `(same, other)` from the same tally.
      tallyNeighbors(grid, col, row, tally);

      // ⚠️ `ref = 1`, not 0: slot 0 is the reserved EMPTY value and holds a deliberate `null`
      // (M14/M15). And `evaluatorsByRef[r]`, never `[r - 1]` — the `- 1` form is correct for the
      // ROSTER array (Story 3.6's `organisms[ref - 1]`) and here it would run every organism's
      // neighbour's rules, producing a plausible battle no test names (Trap 1).
      for (let r = 1; r < rosterEnd; r++) {
        const evaluators = evaluatorsByRef[r];
        if (evaluators === null) continue;

        const same = sameNeighbors(tally, r);
        // Cell State is RELATIVE to the evaluating organism (Decision C, AR-20): `alive` = this
        // cell holds ME, `occupied` = it holds SOMEONE ELSE, `empty` = nobody. It is not a global
        // fact about the cell — the same physical cell is `alive` for its occupant and `occupied`
        // for every other organism in the same pass.
        const state: CellState = occ === 0 ? 'empty' : occ === r ? 'alive' : 'occupied';
        const subject: CellSubject = {
          state,
          // The OCCUPANT's ref (self or other), `null` when nobody is here — never the evaluating
          // organism's, which would make `organismType eq X` self-referential.
          organismType: occ === 0 ? null : occ,
          // Exactly as stored (Trap 9): the clamp is Story 3.6's cycle-end step.
          age: cellAge,
          neighborCount: same,
          occupantNeighborCount: tally.total - same,
        };

        const claimed = evaluators.resolveBirthSurvival(subject);
        if (claimed === null) continue;

        // FD4: a `survive` from an organism that does NOT occupy the cell is dropped. "Survive"
        // means the incumbent stays (RFC-004 §3.2: *"A survivor is just the incumbent's own Survive
        // claim"*), and such a rule is schema-legal — `cellState eq occupied` with a `survive`
        // payload. If one won Phase 3 the winner's age would be set to the PREVIOUS occupant's age
        // + 1, which is meaningless.
        //
        // ⚠️ The mirror case is NOT symmetric: an INCUMBENT answering `'born'` is a legitimate
        // claim — a rebirth, age reset to 0 — and dropping that would be a real defect. This
        // asymmetry is why a claim carries its action instead of being re-derived from occupancy.
        //
        // ⚠️ What is dropped is the organism's ANSWER, and first-match already gave it (FR-2.6):
        // an organism whose first matching rule is a non-incumbent `survive` makes NO claim on
        // that cell, even if a later rule would have said `born`. Falling through to the next
        // rule here would make this layer re-rank rules, which AC8 forbids; the rule that
        // shadows is the organism's own configuration, in the order the user chose. Pinned in
        // `birthSurvivalPhase.test.ts`.
        if (claimed === 'survive' && occ !== r) continue;

        cellIndex.push(index);
        ref.push(r);
        action.push(claimed);
      }
    }
  }

  return { cellIndex, ref, action };
}
