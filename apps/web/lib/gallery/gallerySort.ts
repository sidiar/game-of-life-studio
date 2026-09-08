import type { BattleSummary } from '@gol/domain';

/**
 * Most-recently-modified first (FR-7.1). Ties are broken deterministically — name, then id —
 * because two battles saved in the same millisecond otherwise render in localStorage insertion
 * order, which differs between a fresh seed and a reload and makes both the e2e order assertion
 * and React's reconciliation non-reproducible.
 *
 * Copies before sorting: `Array#sort` mutates, and the input is the repository's own array.
 * Compares names with plain `<`/`>`, not `localeCompare()` — a no-locale `localeCompare` varies by
 * ICU build, so a tie-break assertion could pass locally and fail on the CI runner.
 */
export function sortByLastModified(summaries: readonly BattleSummary[]): BattleSummary[] {
  return [...summaries].sort((a, b) => {
    const byUpdatedAt = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (byUpdatedAt !== 0) return byUpdatedAt;

    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}
