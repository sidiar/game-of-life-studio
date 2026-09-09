// AR-17's pure, top-left-anchored resize (RFC-004 §3.4, Decision A.3).
import type { Grid } from './grid';
import { createGrid } from './grid';

/**
 * Reallocates `grid` at `cols` x `rows`, preserving content TOP-LEFT ANCHORED (Decision A.3): every
 * cell inside both rectangles keeps its `(col, row)`, growth adds empty space to the right and
 * bottom (the hard edges of RFC-004 §3.3 move outward), and a shrink clips everything outside the
 * new bounds.
 *
 * Backs BOTH resizes — Edit-mode's persisted `initialGrid` (FR-3.11) and Story 3.16's ephemeral
 * Play-mode expansion of the live grid. Decision A.3 specifies top-left for both, which is why
 * this is one function rather than a per-mode fork.
 *
 * ⚠️ Returns NEW buffers and a NEW wrapper, ALWAYS — including when the requested size equals the
 * current one. Deliberately a total function of its inputs: the "selecting the current preset does
 * nothing" rule is a decision about the CONTROL, and smuggling it in here as an identity return
 * would make the contract depend on which caller asks, which is how an identity return becomes a
 * shared-buffer aliasing bug three stories later. Callers enforce their own no-ops.
 *
 * ⚠️ **`age` is CARRIED ACROSS, cell for cell, exactly as `occupant` is (story 3.3 FD6)** — never
 * zero-filled. Epic 2's `apps/web` implementation zero-filled it and justified that with an
 * Edit-mode-only premise: every editable grid is age-zero everywhere (RFC-005 "Representation
 * note"), so nothing is lost. True in Edit mode, and the two behaviours are indistinguishable
 * there. It does not survive Story 3.16, which resizes a LIVE grid whose cells have real ages —
 * and `age` is a first-class rule input (FR-2.5), so zero-filling would silently reset every
 * surviving cell to age 0 mid-simulation and change which rules fire, with no error and no failing
 * test. Copying costs one extra `set` per row and is correct for both modes.
 */
export function resizeGrid(grid: Grid, cols: number, rows: number): Grid {
  const resized = createGrid(cols, rows);

  const copyCols = Math.min(grid.width, cols);
  const copyRows = Math.min(grid.height, rows);

  for (let row = 0; row < copyRows; row++) {
    const from = row * grid.width;
    const to = row * cols;
    // `subarray` is safe HERE — and only here — because it is the SOURCE of a copy, never a value
    // that escapes: `TypedArray.set` reads the bytes into the destination's own buffer. The ban is
    // on RETAINING a view (`useUndoableGrid#snapshot` carries the same note, and uses `.slice()`),
    // which this does not do. A row-at-a-time `set` also beats a per-cell loop by the memmove the
    // engine does underneath.
    resized.occupant.set(grid.occupant.subarray(from, from + copyCols), to);
    resized.age.set(grid.age.subarray(from, from + copyCols), to);
  }

  return resized;
}
