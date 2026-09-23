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
 * "Used in N Battles" gate needs it before an edit can open. Story 4.19 then added the M7 live-grid
 * union BELOW (`resolveOrganismUsage` — a battle open in a session counts too), which is the same
 * derivation from a second source and so belongs where `UsageIndex` is defined.
 *
 * ⚠️ Its Decision E.5 rule-reference index did NOT land here, though this comment and
 * `deferred-work.md` both once said it would: it is `ruleReferenceIndex.ts`. That index is the
 * OTHER axis — "referenced by a rule", keyed off the organism library, against this module's
 * "used", keyed off battle summaries — and every spec that names both keeps them apart. Its only
 * cross-epic consumer (Story 5.4's export closure) imports it alone, and putting it here would put
 * that dependency behind a module named for battles.
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

/**
 * The open battle's contribution to usage (M7): a battle being edited in this session counts as
 * usage before it is ever saved.
 *
 * ⚠️ `organismIds` is exactly the set with >=1 cell on the LIVE `initialGrid` (Decision H) —
 * computed by the caller, because `packages/domain` never sees a grid (`tsconfig.base.json` is
 * `lib: ["ES2022"]`, so `RenderableGrid` and every other `apps/web` type is uncompilable here). In
 * `apps/web` that is `computeEditorGridStats(grid, rosterIds).perOrganism` filtered to `count > 0`,
 * NOT `<BattlePage>`'s roster union (`buildRosterIds`): the roster includes entries added to the
 * session dropdown and never painted, which Decision H.2 says are not usage. The roster union
 * typechecks here and silently over-reports every count and every Story 4.21 block.
 *
 * `id` is `null` for a battle that has never been saved — there is no id to dedupe against and no
 * name to resolve, so the caller labels that entry "Current Battle (unsaved)" (RFC-005 Decision 8).
 */
export interface OpenBattleUsage {
  readonly id: string | null;
  readonly organismIds: readonly string[];
}

/**
 * One battle an organism is used by. `battleId` is `null` only for a never-saved open battle.
 * Story 4.20 renders `entries.length` and Story 4.21 blocks on `entries.length > 0` — no caller
 * does arithmetic over two structures, which is what this shape exists to prevent.
 *
 * ⚠️ `placedOnLiveGrid` is NOT "this entry is the battle open in the editor". It says the LIVE grid
 * places this organism, and the two diverge in exactly the erase-window case below: a saved entry
 * for the open battle whose cells were erased in this unsaved session comes back
 * `{ battleId: openBattle.id, placedOnLiveGrid: false }`. To ask "is this the open battle" — the
 * question RFC-005 Decision 8 answers by labelling from live, possibly-renamed state — compare
 * `entry.battleId === openBattle.id`, which the caller can always do because it passed `openBattle`
 * in, and which covers the never-saved battle for free (`null === null`). This field was called
 * `isOpenBattle` until that name was found to promise the comparison it does not perform.
 */
export interface OrganismUsageEntry {
  readonly battleId: string | null;
  readonly placedOnLiveGrid: boolean;
}

/**
 * Unions the saved index with the open battle, deduped by battle id (M7, Decision H.3 — "the same
 * rule from two sources"). Omitting `openBattle`, or passing `null`, is exactly `buildUsageIndex`'s
 * answer.
 *
 * ⚠️ The open battle ADDS usage; it never removes it. An organism the saved index lists for the
 * open battle whose cells were erased in this unsaved session still yields its saved entry (with
 * `placedOnLiveGrid: false` — the live grid does not place it), because a saved reference counts until
 * the erase is saved: FR-1.4's remedy is "erase its cells AND save". The intuitive "live grid wins
 * for the open battle" satisfies every other case here and breaks this one silently, unblocking a
 * delete that would corrupt a battle still on disk.
 *
 * No name is resolved: `packages/domain` has no access to the open battle's live, possibly-renamed
 * state (RFC-005 Decision 8 puts labelling at the call site).
 */
export function resolveOrganismUsage(
  index: UsageIndex,
  organismId: string,
  openBattle?: OpenBattleUsage | null,
): readonly OrganismUsageEntry[] {
  const entries: OrganismUsageEntry[] = (index.get(organismId) ?? []).map((battleId) => ({
    battleId,
    placedOnLiveGrid: false,
  }));

  if (openBattle == null || !openBattle.organismIds.includes(organismId)) {
    return entries;
  }

  // A never-saved open battle (`id === null`) can match no saved entry, so it always appends —
  // no separate branch needed, and no sentinel id invented to make one.
  const saved = entries.findIndex((entry) => entry.battleId === openBattle.id);
  if (saved === -1) {
    entries.push({ battleId: openBattle.id, placedOnLiveGrid: true });
  } else {
    entries[saved] = { battleId: openBattle.id, placedOnLiveGrid: true };
  }
  return entries;
}
