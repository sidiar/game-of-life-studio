// One Moore-neighbourhood pass per CELL, reused by every organism evaluating that cell (story FD5,
// option (b)).
import type { Grid } from '../grid/grid';
import { MAX_CELL_VALUE } from '../grid/grid';
import type { OrganismRef } from '../gol/cellSubject';

/**
 * A caller-owned scratch value holding one cell's neighbour tally.
 *
 * WHY THIS EXISTS. Phase 2 needs `(same, other)` for every (cell x organism) pair — 6,000 x 20 at
 * the NFR-1.1 baseline. Calling `countNeighbors` per pair re-reads the SAME <= 8 neighbour slots
 * once per organism: the identical work done up to 20 times over, ~1M reads a cycle. That is not a
 * readability-for-speed trade, it is a loop in the wrong order, so this is a RESTRUCTURING rather
 * than a speculative optimisation — but the repo optimises on measurement, so the second counting
 * path is pinned DIFFERENTIALLY against `countNeighbors` (`neighborTally.test.ts`), which stays the
 * reference implementation of hard-edge Moore counting. A second counter that quietly disagrees
 * with the first is exactly the defect no golden test would name.
 *
 * ⚠️ Phase 1 does NOT use this and should not: it evaluates one organism per cell (the occupant's
 * own), so there is nothing to amortise, and `countNeighbors` is the shorter correct thing.
 *
 * ❌ NOT module state (AR-16). One tally is allocated per PHASE call and rewritten per cell —
 * never per (cell x organism), which is the allocation this whole shape exists to remove. Two
 * simulations in one process (Story 3.9's preview instance, M3) each own theirs.
 */
export interface NeighborTally {
  /**
   * `countByRef[ref]` = how many of this cell's <= 8 neighbours hold `ref`. Indexed by ref, so the
   * per-organism lookup is O(1) rather than a scan.
   *
   * ⚠️ Only the entries in `touched` are meaningful; everything else is zero BECAUSE the previous
   * cell's entries were cleared, not because the array is re-allocated. Clearing all 256 slots per
   * cell would cost more than the pass it replaces — clearing the <= 8 touched ones costs nothing.
   */
  readonly countByRef: Uint8Array;
  /** The distinct occupied refs among this cell's neighbours — at most 8, one per neighbour slot. */
  readonly touched: Uint8Array;
  /** How many entries of `touched` are live. */
  touchedCount: number;
  /** Occupied neighbours, all organisms together. `other = total - countByRef[ref]`. */
  total: number;
}

export function createNeighborTally(): NeighborTally {
  return {
    // Sized by the dense encoding's ceiling (Decision G.3: 255 organisms, ref 1..255) so a ref is
    // an index, never a lookup. 256 bytes per phase call, once.
    countByRef: new Uint8Array(MAX_CELL_VALUE + 1),
    touched: new Uint8Array(8),
    touchedCount: 0,
    total: 0,
  };
}

/**
 * Rewrites `tally` to describe `(col, row)`'s Moore neighbourhood on `grid`.
 *
 * ⚠️ HARD EDGES, NO WRAP (FR-5.9), by the SAME clamped iteration bounds `countNeighbors` uses —
 * deliberately not the modulo idiom, which makes a glider leaving the right edge reappear on the
 * left and, on a 1-tall grid, maps every offset back onto the same row so the cell double-counts
 * its own neighbours and itself. The differential property test is what keeps the two bound
 * calculations from drifting apart.
 *
 * ⚠️ The cell itself is never its own neighbour.
 */
export function tallyNeighbors(grid: Grid, col: number, row: number, tally: NeighborTally): void {
  const { width, height, occupant } = grid;
  const { countByRef, touched } = tally;

  // Clear only what the PREVIOUS cell wrote. `countByRef.fill(0)` here would be 256 writes per
  // cell — 1.5M a cycle at the baseline — to erase at most 8.
  for (let i = 0; i < tally.touchedCount; i++) countByRef[touched[i]] = 0;
  tally.touchedCount = 0;
  tally.total = 0;

  const firstRow = row > 0 ? row - 1 : 0;
  const lastRow = row < height - 1 ? row + 1 : height - 1;
  const firstCol = col > 0 ? col - 1 : 0;
  const lastCol = col < width - 1 ? col + 1 : width - 1;

  for (let r = firstRow; r <= lastRow; r++) {
    const rowStart = r * width;
    for (let c = firstCol; c <= lastCol; c++) {
      if (r === row && c === col) continue;

      const value = occupant[rowStart + c];
      if (value === 0) continue;

      // First sighting of this ref for this cell: record it so the next cell can clear it.
      if (countByRef[value] === 0) {
        touched[tally.touchedCount] = value;
        tally.touchedCount++;
      }
      countByRef[value]++;
      tally.total++;
    }
  }
}

/**
 * The SAME-organism count for `ref` — `CellSubject.neighborCount`.
 *
 * ⚠️ `same` is `neighborCount` and `other` is `occupantNeighborCount` (RFC-004 §2.1, Decision C.1),
 * both relative to the EVALUATING organism. The bare name reads like "all eight occupied
 * neighbours"; Conway's Classic is single-organism, so the two readings coincide in every
 * single-organism fixture and diverge only under a multi-organism roster.
 */
export function sameNeighbors(tally: NeighborTally, ref: OrganismRef): number {
  return tally.countByRef[ref];
}
