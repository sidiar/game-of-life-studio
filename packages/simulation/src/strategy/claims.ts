// The value Phase 2 produces and Phase 3 (`conflictPhase.ts`, Story 3.6) consumes — the most
// consequential shape in this story, so its invariants are written down rather than left to be
// re-derived from the loop that happens to produce them.
import type { Action } from '../gol/survivalRules';
import type { OrganismRef } from '../gol/cellSubject';

/**
 * Every candidate claim made in one Phase-2 pass, as FLAT PARALLEL ARRAYS (story FD3, option (c)).
 *
 * Claim `i` is `(cellIndex[i], ref[i], action[i])`: organism `ref[i]` asks to occupy row-major cell
 * `cellIndex[i]` next cycle by `action[i]`. All three arrays have the same length; there is no
 * separate count field, because two lengths that can disagree eventually do.
 *
 * ## The invariants Phase 3 may depend on
 *
 * 1. **`cellIndex` is NON-DECREASING, and every claim for one cell is CONTIGUOUS.** Phase 2 scans
 *    cell-outer / organism-inner, so a cell's claims form one unbroken run. This is stated as a
 *    CONTRACT, not reported as an accident of the loop: it is what lets Phase 3 resolve conflicts
 *    in a single linear pass with a run detector — no map, no per-cell array, no allocation — and
 *    an invariant a consumer depends on but nobody wrote down is how a later loop reorder becomes
 *    a silent conflict-resolution bug. **Reordering the Phase-2 scan breaks Phase 3.**
 * 2. **Within a cell's run, `ref` is strictly increasing** — one organism produces AT MOST ONE
 *    claim per cell (AC8: first-match priority already ran inside the compiled evaluator, so this
 *    layer never merges or re-ranks).
 * 3. **`action` is the claim's own action, carried — never re-derived.** `conflictPhase` (Story
 *    3.6) sets a survivor's age to `min(age + 1, maxRelevantAge)` and a birth's to `0`, and
 *    "winner === incumbent" cannot tell them apart: an incumbent may legitimately win with a
 *    **`born`** claim (a rebirth, age reset). Dropping the action is a silent aging bug with no
 *    failing test in any single-organism fixture — pinned by name in `conflictPhase.test.ts`.
 * 4. **A `survive` claim is always the INCUMBENT's** (story FD4) — a non-incumbent's `survive` is
 *    dropped in Phase 2, so Phase 3 never has to ask whose age a survivor would inherit.
 * 5. **No claim carries `'die'`.** `resolveBirthSurvival` returns `Action | null` because RFC-004
 *    §2.3 spells it that way, but the compile-time partition routes every `die` rule to
 *    `resolvesToDeath`, so `'die'` is unreachable here (M15, Story 3.4's Decisions Needed #2). The
 *    type stays wide deliberately; ❌ do not narrow it and ❌ do not handle `'die'` as a live case.
 *
 * ## What was rejected, and why (Story 3.7 may revisit WITH A MEASUREMENT)
 *
 * - `Map<cellIndex, Claim[]>` — readable, but allocates one array per claimed cell plus a Map with
 *   thousands of entries per cycle, every cycle, inside the NFR-1.1 frame budget.
 * - A dense `(Claim[] | undefined)[]` of `width * height` — one full-size array per cycle on top of
 *   the same per-cell sub-arrays.
 * - `firstRef`/`firstAction` typed arrays spilling to a Map for contested cells — plausibly the
 *   fastest, and strictly more machinery than a linear pass over three arrays; it is worth
 *   building only against a benchmark that says the linear pass is the problem.
 *
 * ❌ NOT module state. This is a value the caller owns (AR-16), returned fresh from each Phase-2
 * call, exactly as `GridBuffers` (Story 3.3's FD3) and the session cache (Story 3.4) are.
 */
export interface Claims {
  /** Row-major `row * width + col` into the grid Phase 2 scanned. Non-decreasing (invariant 1). */
  readonly cellIndex: readonly number[];
  /** The claiming organism. Strictly increasing within one cell's run (invariant 2). */
  readonly ref: readonly OrganismRef[];
  /** `'born'` or `'survive'` — carried, never re-derived (invariants 3–5). */
  readonly action: readonly Action[];
}
