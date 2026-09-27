import type { Organism } from '@gol/domain';

/**
 * Story 4.24 (FR-3.12, FR-7.15, FD5): the organism library `<BattlePage>` renders from — the list
 * it LOADED, with every record the battle-origin editor has saved this session laid over it, by id.
 *
 * ⚠️ An overlay, never an `organismsResource.reload()`. A reload that rejects leaves the resource at
 * `status: 'error'` with no data, which (1) blanks the roster into the degraded notice mid-session
 * and (2) flips `rosterIds`' seed branch on `/battle/new` — index 0 changes hands and every painted
 * cell repaints as another organism, the Story 2.10 trap-1 silent repaint, which the next battle save
 * would persist. The overlay has no failure path: each record is exactly what `organisms.save` just
 * wrote.
 *
 * Replace-by-id only. A saved record whose id is NOT in `list` is appended — a branch no caller can
 * reach under Story 4.24 (the battle origin only EDITS an organism the page already loaded), named
 * here because Story 4.25's create-from-battle reuses this overlay for a new organism. Nothing
 * beyond the plain append is built for it.
 *
 * Returns `list` ITSELF when there is nothing to lay over it, so the caller's memo keeps its
 * identity (`palette`, `runOrganisms`, `rosterIds` and `roster` all key on it) until the first
 * adoption.
 */
export function applySavedOrganisms(
  list: readonly Organism[],
  saved: readonly Organism[],
): readonly Organism[] {
  if (saved.length === 0) return list;
  const byId = new Map(saved.map((organism) => [organism.id, organism] as const));
  const merged = list.map((organism) => byId.get(organism.id) ?? organism);
  const known = new Set(list.map((organism) => organism.id));
  for (const organism of saved) {
    if (!known.has(organism.id)) merged.push(organism);
  }
  return merged;
}

/**
 * The adoption step behind `applySavedOrganisms`: record `saved` as the latest version of its id —
 * replacing an earlier adoption of the same organism in place, else appending. Pure, for the
 * `setState` updater.
 */
export function adoptSavedOrganism(
  previous: readonly Organism[],
  saved: Organism,
): readonly Organism[] {
  const index = previous.findIndex((organism) => organism.id === saved.id);
  if (index === -1) return [...previous, saved];
  const next = [...previous];
  next[index] = saved;
  return next;
}
