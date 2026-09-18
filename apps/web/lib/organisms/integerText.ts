/**
 * The plain-integer-text parse, shared by `<DominanceField>` and `<ConditionRow>` (Story 4.11,
 * Task 2 — the second caller `dominance.ts`'s header named). Moved verbatim from
 * `parseDominanceText`; the body, the regex and the reasoning are unchanged.
 *
 * Deliberately NEITHER clamped NOR bounded here: bounds are the CALLER's job, and the two callers
 * disagree about what to do with an out-of-bounds result — `<DominanceField>` clamps silently
 * (`clampDominance`), `<ConditionRow>` displays an error (`validateConditionDraft`). A shared
 * bounds check would have to pick one behaviour for both.
 */

/**
 * `null` unless `text` (trimmed) is a plain decimal integer: `^-?\d+$`. `5.5`, `5.`, `1e2`, `+5`
 * and `''` are all `null`.
 *
 * `Number(text)` after the regex, never `parseInt` — `parseInt('5abc', 10)` silently returns `5`,
 * which would accept text the regex was written to reject.
 */
export function parseIntegerText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
