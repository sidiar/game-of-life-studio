import type { BattleSummary } from './battleSchema';

/**
 * The AR-15 organism-usage index (Decision H / H.4, RFC-005 Decision 8): `organismId → battleId[]`,
 * DERIVED from `battles.list()` summaries on every read — never a separately stored structure.
 *
 * Why it derives from summaries and not from grids: `BattleSummary.organismIds` at rest IS the
 * placed set (Decision H.1 — pruned at save), so "used by a battle" is answerable without a single
 * grid being deserialized. Widening this to read `gridState` would make every Library open pay
 * for every battle's grid, for an answer the summary already carries.
 *
 * Why it lives in `@gol/domain`: referential-integrity logic (the delete guard, this index, the
 * rule-reference index) keeps its pure part here under the ≥90% per-file gate, and Story 4.20 needs
 * ONE derivation across the edit warning, the delete error and the footer — an inline count in
 * `apps/web` would be the second implementation the moment the next consumer lands.
 *
 * This is Story 4.19's first acceptance criterion, landed in Story 4.17 because the FR-1.3
 * "Used in N Battles" gate needs it before an edit can open. Story 4.19 extends THIS module with the
 * M7 live-grid union (a battle open in a session counts too) and the Decision E.5 rule-reference
 * index — neither is pre-empted here.
 */
export type UsageIndex = ReadonlyMap<string, readonly string[]>;

/**
 * Builds the index from battle summaries. `Pick<…>` so a test can pass minimal literals while a
 * full `BattleSummary` still assigns. Battle ids appear in input order (the caller sorts if a
 * display order matters); an id repeated INSIDE one summary's `organismIds` counts that battle
 * once — `BattleSummarySchema` has no duplicate refine, so a hand-edited or imported record may
 * repeat one.
 */
export function buildUsageIndex(
  summaries: readonly Pick<BattleSummary, 'id' | 'organismIds'>[],
): UsageIndex {
  const index = new Map<string, string[]>();
  for (const summary of summaries) {
    for (const organismId of new Set(summary.organismIds)) {
      const battles = index.get(organismId);
      if (battles === undefined) {
        index.set(organismId, [summary.id]);
      } else {
        battles.push(summary.id);
      }
    }
  }
  return index;
}
