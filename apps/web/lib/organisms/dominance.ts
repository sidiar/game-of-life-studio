import { MAX_DOMINANCE, MIN_DOMINANCE } from '@gol/domain';

/**
 * Pure parse/clamp helpers for the Dominance numeric input (Story 4.6, FR-2.2). No React, no DOM —
 * `<DominanceField>` is the only caller today; Story 4.11's Age / Neighbor-count condition inputs
 * will want the same shape, and generalise this to `integerInput.ts` when they become the second
 * caller (the Story 4.5 FD6 reasoning — no abstraction over one caller).
 *
 * Parsing and clamping are kept as two separate functions, deliberately: `parseDominanceText`
 * answers "is this plain-integer text", `clampDominance` answers "fold a number into range". A
 * combined "parse and clamp" function could not be unit-tested for the un-clamped parse result,
 * which is exactly what FD3's "commit live only when in range" behaviour needs to distinguish.
 */

/**
 * `null` unless `text` (trimmed) is a plain decimal integer: `^-?\d+$`. `5.5`, `5.`, `1e2`, `+5`
 * and `''` are all `null`. The value may be OUTSIDE `[MIN_DOMINANCE, MAX_DOMINANCE]` — clamping is
 * `clampDominance`'s job, so the two concerns stay separately testable.
 *
 * `Number(text)` after the regex, never `parseInt` — `parseInt('5abc', 10)` silently returns `5`,
 * which would accept text the regex was written to reject.
 */
export function parseDominanceText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * `n` clamped into `[min, max]`. Defaults are the schema's own constants, never literals, so a
 * caller that never passes `min`/`max` still stays in sync with `OrganismSchema.dominance` if the
 * range ever moves. `Infinity` (a very long digit string parses to `Infinity` through `Number()`)
 * clamps to `max`, `-Infinity` to `min` — both fall out of the same two comparisons, no special
 * case needed.
 */
export function clampDominance(
  n: number,
  min: number = MIN_DOMINANCE,
  max: number = MAX_DOMINANCE,
): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** True when `n` needs no clamping — the field's "commit live on this keystroke" predicate. */
export function isDominanceInRange(
  n: number,
  min: number = MIN_DOMINANCE,
  max: number = MAX_DOMINANCE,
): boolean {
  return n >= min && n <= max;
}
