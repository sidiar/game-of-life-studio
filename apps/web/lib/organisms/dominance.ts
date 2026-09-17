import { MAX_DOMINANCE, MIN_DOMINANCE } from '@gol/domain';

/**
 * Pure clamp helpers for the Dominance numeric input (Story 4.6, FR-2.2). No React, no DOM.
 * Parsing moved to `integerText.ts` in Story 4.11, once `<ConditionRow>` became the second caller
 * of the plain-integer-text parse; `clampDominance` / `isDominanceInRange` stay here — dominance
 * clamps its out-of-range values, conditions display an error for theirs, so only the parse is
 * shared.
 */

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
