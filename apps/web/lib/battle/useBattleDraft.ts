'use client';

import { useMemo } from 'react';
import type { Battle, Settings } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { useAsyncResource, type AsyncResourceStatus } from '@/lib/useAsyncResource';
import { createNewBattleDraft, type NewBattleDraft } from '@/lib/battle/newBattleDraft';

/**
 * "What battle is this page opening?", extracted from `<BattlePage>` (2026-09-08) — the battle
 * resource, the `'new'` short-circuit, and the two branches' collapse into one `NewBattleDraft`.
 * The caller keeps only what is genuinely its own: the editor state seeded FROM the draft, and the
 * copy for the two failure bodies.
 *
 * The unified shape is Story 2.2's Task 3 and the reason this hook has a single return: both a
 * loaded `Battle` and a freshly seeded draft resolve to `NewBattleDraft`, so Stories 2.4/2.5/2.11/
 * 2.13 read one shape instead of branching on `battleId === 'new'` forever.
 *
 * ⚠️ `settings` is a PARAMETER, not a resource this hook loads. `<BattlePage>` owns
 * `settingsResource` and its `.catch(() => DEFAULT_SETTINGS)` fallback deliberately: that resource
 * exists as its own `useAsyncResource` precisely so a settings failure and a battle failure are
 * structurally independent (Story 2.9 Task 7 — a shared `Promise.all` let an unrelated rejection
 * silently substitute the wrong default grid size). Loading it in here would re-bundle, inside one
 * hook, exactly the coupling that story unbundled.
 */
export interface UseBattleDraftResult {
  /**
   * `null` ONLY for a real battle id with no usable battle in hand — a genuine load failure, or a
   * load that succeeded and found nothing. Never null for `battleId === 'new'`: that branch always
   * seeds. `status` is what separates the two failures ('error' vs 'ready'), and the caller must
   * branch on it FIRST — `useAsyncResource`'s own contract, since `data: undefined` means "not
   * settled" while a legitimately absent battle lands in `'ready'` holding `null`.
   */
  draft: NewBattleDraft | null;
  /** The BATTLE resource's status, verbatim. The caller's loading gate and its "Something Went
   * Wrong" vs "Battle Not Found" split are its only two consumers. */
  status: AsyncResourceStatus;
  /**
   * The loaded record's IDENTITY — the exact complement of what `NewBattleDraft` deliberately
   * leaves out (`newBattleDraft.ts`: minting `id`/`createdAt` before a save "would be a lie the
   * moment the user leaves /battle/new without saving"). `null` on `/battle/new` and on every
   * failure, which is what makes the first save on those paths MINT an id rather than update one.
   *
   * ⚠️ Narrowed to two fields rather than handing back the whole `Battle`, because the loaded
   * record is a fallback SOURCE for `saveBattle` and never a thing to write back to — a shape that
   * cannot carry a stale grid or roster cannot be mistaken for one. `createdAt` rides along because
   * `BattleSummarySchema` omits it (battleSchema.ts), so the loaded record is its only source and
   * re-stamping it on every save is invisible in the UI and silently wrong in every future export.
   *
   * ⚠️ Memoised on the loaded record: it sits in `saveBattle`'s dep list, so a fresh object per
   * render would rebuild that callback on every render.
   */
  loadedIdentity: { id: string; createdAt: Date } | null;
}

// Converts a loaded Battle to the SAME shape createNewBattleDraft seeds, so `<BattlePage>` reads
// one shape instead of branching on battleId === 'new' forever (Task 3, Story 2.2).
//
// ⚠️ These two arrays are handed out BY REFERENCE — they are the loaded `Battle` record's own,
// still held inside `battleResource.data`. `NewBattleDraft` used to declare them mutable, so any
// story that wrote `draft.gridState[r][c]` or pushed onto `draft.organismIds` would destroy the
// pristine loaded state in place, leaving nothing to revert to — and it would behave CORRECTLY on
// /battle/new (fresh arrays from createNewBattleDraft) and INCORRECTLY on /battle?id=…, the
// hardest possible shape for a bug to take. Story 2.5 closes that (deferred-work.md) by making
// `NewBattleDraft`'s arrays `readonly` at the TYPE level, so the compiler rejects the write
// instead of a convention having to catch it. Copying here was the alternative and was rejected:
// it costs a 6,000-element clone per load to defend against something the type system can rule
// out for free.
function toDraft(battle: Battle): NewBattleDraft {
  return {
    name: battle.name,
    gridSize: battle.gridSize,
    gridState: battle.gridState,
    organismIds: battle.organismIds,
  };
}

/**
 * ⚠️ THE DRAFT'S IDENTITY IS LOAD-BEARING, and that is why the two memos below are NOT one.
 *
 * `<BattlePage>` derives `seedGrid` from `draft` with a `[draft]` dep, and `useUndoableGrid`
 * compares its seed by IDENTITY (`state.seed !== seed`) — a changed seed resets the value and the
 * whole 30-entry ring, because carrying entries across a seed change would let undo restore a
 * different battle's grid. So any needless churn in `draft` silently discards the user's undo
 * history and reverts the grid to the seed.
 *
 * ❌ Do not collapse these into `useMemo(…, [battleId, loadedBattle, settings])`. That is the
 * obvious simplification and it couples the LOADED draft to `settings`' identity, so a settings
 * resolution landing after the battle rebuilds a draft whose inputs did not change. Today the
 * caller's loading gate holds the editor unmounted until all three resources are non-loading, so
 * no ring exists yet to lose — the merge trades a guarantee away for nothing, and its failure
 * shape (discarded history, no error) is one no test watches for.
 *
 * `newDraft` may depend on `settings` because that IS its input: the seed's grid size is
 * `settings.defaultGridSize`, and it is deliberately independent of `battleResource` so it stays
 * correct even when the organism library has failed.
 */
export function useBattleDraft(
  repositories: AppRepositories,
  battleId: string | 'new',
  settings: Settings,
): UseBattleDraftResult {
  // ⚠️ 'new' must never reach battles.load(). It is not a uuid, so the repository would treat it
  // as a plain miss and return null — indistinguishable from a stale/deleted id, which would make
  // /battle/new render "this battle is gone" for a page whose whole purpose is that it does not
  // exist yet. Story 2.2 short-circuits and seeds a fresh draft for the branch instead (below).
  //
  // ⚠️ Deps stay a FIXED-LENGTH array of referentially stable elements — read `useAsyncResource`'s
  // header before touching them; growing one spins the page forever. `settings` is deliberately
  // NOT among them: it feeds the seed, not the load.
  const battleResource = useAsyncResource<Battle | null>(
    () => (battleId === 'new' ? Promise.resolve(null) : repositories.battles.load(battleId)),
    [repositories, battleId],
  );

  // Held in a memo, not rebuilt in the caller's render body — that was 61 array allocations per
  // render at 100x60 with a fresh identity every time, which made the canvas's `[grid]` effect
  // repaint on every unrelated render (Task 6 / deferred-work.md:179, AC7).
  const newDraft = useMemo<NewBattleDraft | null>(
    () => (battleId === 'new' ? createNewBattleDraft(settings.defaultGridSize) : null),
    [battleId, settings],
  );

  const loadedBattle = battleResource.data ?? null;
  const loadedDraft = useMemo<NewBattleDraft | null>(
    () => (loadedBattle === null ? null : toDraft(loadedBattle)),
    [loadedBattle],
  );

  const draft = battleId === 'new' ? newDraft : loadedDraft;

  // Keyed to `loadedBattle`, NOT to `battleId`: on `/battle/new` there is no record and no
  // identity to report, and the caller mints one on its first save.
  const loadedIdentity = useMemo(
    () =>
      loadedBattle === null ? null : { id: loadedBattle.id, createdAt: loadedBattle.createdAt },
    [loadedBattle],
  );

  // Memoised so a render that changed none of them hands the caller back the same object. The
  // three fields are read together and must never be observed a tick out of step.
  return useMemo(
    () => ({ draft, status: battleResource.status, loadedIdentity }),
    [draft, battleResource.status, loadedIdentity],
  );
}
