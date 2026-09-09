// Moore neighbourhood arithmetic with hard edges (RFC-004 §3.3, FR-5.8/FR-5.9). This is the module
// that materializes the two counts a `CellSubject` carries, and it runs 6,000 cells x up to 20
// organisms per cycle at the NFR-1.1 baseline — the hottest loop in the app.
import type { Grid } from './grid';
import type { OrganismRef } from '../gol/cellSubject';

/**
 * The two RELATIVE neighbour counts (RFC-004 §2.1, Decision C.1), produced together in one pass
 * over the <= 8 neighbours.
 *
 * ⚠️ `same` is `CellSubject.neighborCount` and `other` is `CellSubject.occupantNeighborCount`, and
 * both are relative TO THE EVALUATING ORGANISM — not "all eight occupied neighbours". The bare
 * name `neighborCount` reads like the latter, and because Conway's Classic is single-organism the
 * two readings coincide for every single-organism fixture in the repo; they diverge only in Story
 * 3.6's multi-organism goldens, as wrong survival behaviour with no failing test naming why.
 * `neighborhood.test.ts`'s two-organism fixture is the thing that can tell them apart.
 */
export interface NeighborCounts {
  readonly same: number;
  readonly other: number;
}

/**
 * Counts the Moore (8-adjacent) neighbours of `(col, row)` that hold `selfRef` and that hold any
 * other organism, in a single pass.
 *
 * ⚠️ HARD EDGES, NO WRAP (FR-5.9). Edge cells see 5 neighbours, corners 3, and nothing ever reads
 * `(-1, y)` or `(width, y)`. Enforced by CLAMPED ITERATION BOUNDS rather than an in-loop bounds
 * `continue`, so there is no out-of-bounds read to guard in the first place — and emphatically not
 * by the modulo idiom `(row + dr + height) % height`, which is the first thing most
 * implementations reach for and is wrong twice over here: it makes a glider that leaves the right
 * edge reappear on the left (so Story 3.6's glider-translation golden passes at some grid sizes
 * and fails at others), and on a 1-tall or 1-wide grid it maps every offset back onto the same row
 * and double-counts the cell's own neighbours and itself.
 *
 * ⚠️ Empty neighbours count toward NEITHER total, so `same + other <= 8` with equality only when
 * every in-bounds neighbour is occupied. A caller asserting the two sum to the neighbour SLOT count
 * has encoded the wrong model.
 *
 * A `selfRef` of `0` is not meaningful (0 is the reserved empty slot, never an organism) and is not
 * rejected: the empty test comes first, so a 0 answers `same: 0` and counts every occupied
 * neighbour as `other`, which is the degenerate any caller passing it deserves rather than a throw
 * inside the 60 FPS loop.
 *
 * `(col, row)` is trusted the same way: the engine's scan produces only in-bounds integer cells,
 * and a bounds check here would sit inside that same loop. Out-of-range or fractional coordinates
 * are NOT detected — the clamped bounds map them onto the nearest real rows/columns and the return
 * is a phantom cell's counts, silently. A caller that can be handed arbitrary coordinates owns
 * that validation, exactly as it owns `selfRef`'s.
 *
 * ⚠️ RETURN SHAPE is one small object literal per call (story FD4 option (a)) — the readable
 * default. RFC-004 §3.4 flags this exact spot as where the frame budget is won or lost, and the
 * zero-allocation alternative is a PACKED INTEGER: both counts are <= 8, so `same * 9 + other`
 * encodes the pair in one number that decodes as `(packed / 9) | 0` and `packed % 9`. It is
 * written down here rather than taken on instinct because this repo's standard for that trade is a
 * measurement (Story 3.1's M12 guards were justified with +0.019 ms/cycle against the 16.7 ms
 * budget), and the first measurements exist in Story 3.7. Swap under a number, not a hunch.
 *
 * ❌ No neighbour-count cache, no incremental dirty-cell tracker, no Web Worker. NFR-1.1 is met by
 * the typed arrays and the ~O(N) pass (Decision A.4).
 */
export function countNeighbors(
  grid: Grid,
  col: number,
  row: number,
  selfRef: OrganismRef,
): NeighborCounts {
  const { width, height, occupant } = grid;

  const firstRow = row > 0 ? row - 1 : 0;
  const lastRow = row < height - 1 ? row + 1 : height - 1;
  const firstCol = col > 0 ? col - 1 : 0;
  const lastCol = col < width - 1 ? col + 1 : width - 1;

  let same = 0;
  let other = 0;

  for (let r = firstRow; r <= lastRow; r++) {
    const rowStart = r * width;
    for (let c = firstCol; c <= lastCol; c++) {
      // The cell is not its own neighbour. Skipping it inside the loop (rather than splitting the
      // scan into up-to-three ranges) keeps the bounds arithmetic above to four comparisons; the
      // branch is perfectly predicted, taken exactly once per call.
      if (r === row && c === col) continue;

      const value = occupant[rowStart + c];
      if (value === 0) continue;
      if (value === selfRef) same++;
      else other++;
    }
  }

  return { same, other };
}
