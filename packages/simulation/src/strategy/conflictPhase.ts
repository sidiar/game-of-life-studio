// Phase 3 of the three-phase strategy (FR-5.4, RFC-004 §3.2, M10 H-6): who WINS, and the write
// that finally turns cycle N into cycle N+1.
import type { Grid } from '../grid/grid';
import type { Claims } from './claims';
import type { ConflictDeps } from './phaseDeps';

/**
 * Resolves every contested cell by Dominance (ties random, through the injected `Rng`), writes the
 * winner, ages it, and CLEARS every cell nobody claimed — in place over the post-death grid.
 *
 * ## The full sweep is the load-bearing part (FR-5.2, M10)
 *
 * This iterates all `width * height` cells and walks a CURSOR through the claims arrays, rather
 * than iterating the claims. Iterating claims alone looks equivalent and is the story's central
 * trap: every occupant that made no claim would stay standing, so IMPLICIT DEATH would never
 * happen and Conway's Classic — which expresses all of its death implicitly, having no `die` rule
 * at all — would become a grid that only ever grows. It still "runs"; the blinker golden is what
 * fails.
 *
 * A cleared cell writes `occupant = 0` **and** `age = 0`, discharging `../grid/doubleBuffer.ts`'s
 * stale-frame obligation for the second half of the cycle: after two swaps the destination holds
 * cycle N-2's frame, so a writer that stores only living cells resurrects it, and an age left
 * standing under an empty cell is inherited by whatever is born there next.
 *
 * ## Why writing IN PLACE is safe here and was NOT in Phase 1
 *
 * Phase 1 reads NEIGHBOURS, so writing into the grid it scans makes an earlier cell's death change
 * a later cell's subject — its `assertDistinctSameSize` guard exists for that and is Phase 1's
 * alone (❌ do not copy it here; Phase 3 has one grid by design). Phase 3 reads only cell `i`'s OWN
 * previous age, and every cell is read-then-written exactly once in index order, so no cell's
 * result depends on another's. The saving is a `Uint8Array(N)` plus a `Uint16Array(N)` per cycle,
 * up to 20 times a second — the per-cycle allocation Decision A.6's steady-state budget and the
 * double buffer exist to avoid.
 *
 * ⚠️ The previous age therefore comes from THIS grid — Phase 1's output, which Phase 2 scanned —
 * never from the cycle-N front grid, which still holds pre-death ages.
 *
 * ❌ No rule is evaluated here and no evaluator is consulted. Phase 3 reads claims, Dominance and
 * the generator, and nothing else; reaching for `evaluatorsByRef` would re-open the decision the
 * compile-time partition and Phase 2 already closed.
 *
 * ❌ No extinction check, no "the run is over" flag (Decision B.5, Story 3.15). This is a pure
 * reducer with no opinion about whether it should be called again.
 */
export function conflictPhase(grid: Grid, claims: Claims, deps: ConflictDeps): Grid {
  // ⚠️ Dimensions are parameters, never constants (Decision A) — 100x60 is one preset and Play
  // mode expands to 200x120 (H-9).
  const { width, height, occupant, age } = grid;
  const cells = width * height;

  const { cellIndex, ref, action } = claims;
  const claimCount = cellIndex.length;
  const { organisms, rng, maxRelevantAge } = deps;

  // ONE cursor over the three parallel claim arrays, and no allocation anywhere below (story FD3,
  // option (b)). This is the whole of what `claims.ts`'s invariant 1 buys: because Phase 2 scans
  // cell-outer/organism-inner, a cell's claims are one unbroken run at a non-decreasing index, so
  // the sweep never needs a Map, a per-cell array or a second look. ⚠️ Reordering the Phase-2 scan
  // breaks this: the cursor STALLS on the first out-of-order claim and never advances again, which
  // would clear every later cell and drop every later claim — the post-sweep check at the bottom
  // turns that into a throw rather than a plausible extinction.
  let cursor = 0;

  for (let index = 0; index < cells; index++) {
    if (cursor >= claimCount || cellIndex[cursor] !== index) {
      // Nobody asked for this cell. An empty cell stays empty; an OCCUPIED one is cleared, which
      // is implicit death (M10) — the cell counted as a Phase-2 neighbour and is gone now.
      occupant[index] = 0;
      age[index] = 0;
      continue;
    }

    const runStart = cursor;
    let runEnd = runStart + 1;
    while (runEnd < claimCount && cellIndex[runEnd] === index) runEnd++;
    cursor = runEnd;

    // Pass 1: the top Dominance, how many claimants hold it, and where the first of them sits.
    //
    // ⚠️ SURVIVE AND BORN COMPETE UNIFORMLY (FR-5.4, M10 H-6, RFC-004 §3.2). There is deliberately
    // no `action === 'survive'` shortcut, no incumbency bonus and no ordering that puts survivors
    // first: a higher-Dominance birth EVICTS a surviving incumbent. Eviction stays opt-in because
    // Cell State is relative (Decision C) — an ordinary `cellState eq empty` Born rule never
    // produces a claim on an occupied cell in the first place, which is what keeps PRD UJ-1's
    // "Blue holds its corner" true under H-6.
    //
    // ⚠️ `organisms[ref - 1]`, never `organisms[ref]` (M14) — see `ConflictDeps`.
    //
    // Seeded from the FIRST claimant rather than from a `-1` sentinel: `OrganismRuntime.dominance`
    // is a plain `number`, and a sentinel quietly assumes FR-2.2's 1..100 range that the type does
    // not state — under it a run of negative Dominances would elect the first claimant regardless.
    let maxDominance = organisms[ref[runStart] - 1].dominance;
    let tieCount = 1;
    let firstTop = runStart;
    for (let i = runStart + 1; i < runEnd; i++) {
      const dominance = organisms[ref[i] - 1].dominance;
      if (dominance > maxDominance) {
        maxDominance = dominance;
        tieCount = 1;
        firstTop = i;
      } else if (dominance === maxDominance) {
        tieCount++;
      }
    }

    let winner = firstTop;
    if (tieCount > 1) {
      // ⚠️ THE GENERATOR IS DRAWN FROM ONLY ON A GENUINE TIE. A draw per cell would burn ~6,000 a
      // cycle at the NFR-1.1 baseline, and — worse — it would couple every seeded golden to grid
      // CONTENT, so a later change to when we draw silently re-rolls every recorded outcome.
      // Pinned by a stub `Rng` that throws (`conflictPhase.test.ts`).
      //
      // Pass 2 walks the run to the k-th claimant at the top Dominance. ❌ Not §3.2's
      // `Math.max(...claimants.map(…))` + `.filter(…)`: that is illustrative pseudocode and
      // allocates a mapped array plus a spread PER CONTESTED CELL inside the frame budget.
      // ❌ Not reservoir selection either — one pass, but it draws on cells that end up
      // uncontested and makes the number of draws depend on claim order.
      const draw = rng.int(tieCount);
      let k = draw;
      winner = -1;
      for (let i = firstTop; i < runEnd; i++) {
        if (organisms[ref[i] - 1].dominance === maxDominance) {
          if (k === 0) {
            winner = i;
            break;
          }
          k--;
        }
      }
      // ⚠️ LOUD on a generator that breaks its own contract. `Rng` is injected, and an adapter
      // written as `{ int: () => Math.random() }` or `int: (n) => Math.random() * n` returns a
      // fraction or an out-of-range draw: `k` then never reaches 0, the walk runs off the end of
      // the run, and silently keeping `firstTop` would resolve EVERY tie to the lowest ref —
      // precisely the bias `rng.ts`'s rejection sampling exists to remove, presenting as a
      // deterministic battle. One comparison per contested tie, never per cell.
      if (winner < 0) {
        throw new Error(
          `conflictPhase: rng.int(${tieCount}) must return an integer in [0, ${tieCount}), got ${draw}`,
        );
      }
    }

    // Read before write — the incumbent's age on the grid Phase 2 scanned.
    const previousAge = age[index];

    // ⚠️ The winning claim's ACTION decides the age, never `winner === incumbent`
    // (`claims.ts` invariant 3): an incumbent may legitimately win with a `born` claim, which is a
    // REBIRTH and resets to 0. No single-organism fixture can tell the two rules apart.
    //
    // ⚠️ `min(age + 1, max)`, NOT `min(age, max) + 1` — the second overshoots the clamp by one,
    // forever, and is invisible until a fixture runs past `maxRelevantAge`. Clamping BEFORE the
    // write is also what keeps the value inside the `Uint16Array` (`validateRules.ts` caps age
    // literals at 65534 for exactly this reason); `outAge[i] = value` wraps silently at 65536.
    //
    // ⚠️ Age advances regardless of `agingEnabled` (FR-2.4): that toggle affects RENDERING only —
    // cell-age tracking is unaffected, because age is engine state and a rule input whether or not
    // the visual fade is shown. There is no `agingEnabled` on `ConflictDeps` to branch on.
    //
    // ❌ No branch on `'die'` (`claims.ts` invariant 5, Story 3.4's Decisions Needed #2): the
    // compile-time partition makes it unreachable here. Do not handle it and do not narrow the
    // type — RFC-004 §2.3 spells the action wide on purpose.
    occupant[index] = ref[winner];
    age[index] =
      action[winner] === 'born'
        ? 0
        : previousAge + 1 < maxRelevantAge
          ? previousAge + 1
          : maxRelevantAge;
  }

  // ⚠️ Every claim must have been consumed. The cursor only advances past a claim whose
  // `cellIndex` EQUALS the cell being swept, so a claim that arrives out of order (`claims.ts`
  // invariant 1 broken) or names a cell outside the grid stalls it for the rest of the sweep:
  // every later cell takes the "nobody asked" branch and is cleared, every later claim is dropped,
  // and because extinction is a normal outcome (Decision B.5) the result reads as a legitimate
  // wipe-out. Checking ONCE after the sweep — never per cell — makes it loud instead. The only
  // producer that can trip this is a caller bypassing `birthSurvivalPhase`.
  if (cursor !== claimCount) {
    throw new Error(
      `conflictPhase: ${claimCount - cursor} of ${claimCount} claims were never matched to a cell — ` +
        `cellIndex must be non-decreasing and within [0, ${cells})`,
    );
  }

  return grid;
}
