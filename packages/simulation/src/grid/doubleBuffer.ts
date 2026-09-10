// The double-buffering seam AR-17 and Decision A.6 require, as a value the caller owns.
import type { Grid } from './grid';
import { createGrid } from './grid';

/**
 * A front/back pair of same-sized grids (AR-17, Decision A.6).
 *
 * ⚠️ WHAT THIS PREVENTS. RFC-004 §3.2's strategy signature `(grid, deps) => Grid` reads as
 * allocate-a-whole-new-grid-per-cycle, and at the NFR-1.1 baseline that is a fresh
 * `Uint8Array(24000)` plus a `Uint16Array(24000)` up to 20 times a second. Decision A.6's ~144 KB
 * at 200x120 is the STEADY-STATE memory budget, not a per-cycle allowance — double buffering is
 * what keeps the two the same number. Story 3.5 SHIPPED the writer this was built for: `deathPhase`
 * takes a caller-supplied destination (`deathPhase(source, destination, deps)`, its FD2) rather than
 * allocating per §3.2's snippet, so the post-death intermediate IS `back`, Phase 2 only reads it,
 * and Story 3.6's Phase 3 finishes in place over it before the swap. AR-41's "phases are pure,
 * inputs are never mutated" property holds as stated — the SOURCE grid is never written.
 *
 * ❌ NOT module state. No `class`, no `this`, no singleton (AR-16) — whatever holds the pair is a
 * value the caller owns and passes, which is also what lets Story 3.9's preview instance (M3) run
 * a second simulation in the same process without the two sharing a buffer.
 *
 * ❌ NOT a pool or allocator. `computeEditorGridStats` and `GridRenderer.assertGridMatchesSize`
 * both depend on `occupant.length === width * height`, which over-allocation breaks.
 */
export interface GridBuffers {
  /** The grid the renderer and the population pass read. */
  readonly front: Grid;
  /**
   * The scratch grid the next cycle writes into. Its contents before that write are meaningless —
   * all-empty fresh from `createGridBuffers`, but after two swaps it holds a STALE FRAME (cycle N
   * writes into the buffer cycle N-2 rendered). The obligation that follows sits on the WRITER: a
   * cycle must store every cell of `back`, empties included. A writer that stores only
   * living/changed cells — the natural-looking optimisation in a module this cost-conscious —
   * resurrects dead cells from two cycles ago, and nothing in this file can fail on it. Story 3.5's
   * `deathPhase` DISCHARGES that obligation for Phase 1 — it writes both buffers for every cell
   * including empties, and a cleared cell zeroes `age` as well as `occupant` — and it is pinned by
   * a test that pre-fills the destination with a stale frame. Story 3.6's Phase-3 write inherits
   * the same obligation.
   */
  readonly back: Grid;
}

/**
 * Pairs an existing grid as `front` with a fresh, empty `back` of the same dimensions — the shape
 * RFC-005 Decision 4 describes at Run, where the live grid is cloned from `initialGrid`.
 *
 * `front` is taken by reference, not copied: the caller already owns it and a copy here would only
 * double the allocation this seam exists to avoid.
 *
 * ⚠️ Pass a grid the simulation owns EXCLUSIVELY. After one `swapGridBuffers` the grid supplied
 * here IS `back` — the scratch buffer the next cycle writes into — so pairing `initialGrid`
 * itself would overwrite the persisted dish from the second cycle onward, with nothing logged.
 * RFC-005 Decision 4's "cloned from `initialGrid`" is the CALLER's step, taken before this one:
 * "taken by reference" trims the pairing's allocation, it does not waive the clone.
 */
export function createGridBuffers(front: Grid): GridBuffers {
  return { front, back: createGrid(front.width, front.height) };
}

/**
 * Exchanges the two roles, purely — a NEW pair value, both grids reused, nothing mutated. The
 * caller replaces its own reference with the return value; a caller still holding the old pair
 * still sees the pre-swap roles, which is what keeps this usable from a `useRef` without a
 * write-during-render.
 */
export function swapGridBuffers(buffers: GridBuffers): GridBuffers {
  return { front: buffers.back, back: buffers.front };
}
