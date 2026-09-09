// The session boundary's first half (RFC-004 §3.5, Decision E.3): persisted, workspace-shared
// organism LIBRARY IDS become battle-relative numeric refs, once per session, before the first
// cycle. Nothing here runs per cell.
//
// FD8 (Dev Agent Record): this directory is the SESSION layer — the once-per-battle-run
// translation from persisted, string-keyed, workspace-shared data into battle-relative numbers and
// closures. It is a CALLER of ../engine/ and a sibling of ../gol/, never a member of either. What
// belongs here: anything computed once per battle and consumed per cell. What does not: anything
// the RAF loop calls (Stories 3.5/3.6/3.8), and anything domain-blind (that is ../engine/'s).
import type { OrganismRef } from '../gol/cellSubject';

// The never-match sentinel (FD6; RFC-004 §3.5, Decision E.3): what an `organismType` pattern
// naming an organism absent from THIS battle compiles to, so "occupied by organism X" is simply
// `false` in a battle without X.
//
// ⚠️ It must be a NUMBER that is not a ref, and `-1` is the only obvious candidate that works.
// Real refs are >= 1 (M14), and `cell.organismType` is `null` on an empty cell — `eq` is `===`
// and unguarded by design (operators.ts), so `-1` fails against both. `null`/`undefined` do NOT:
// a rewritten pattern of `null` AFFIRMATIVELY matches every empty cell, turning a `born` rule
// into one that populates the entire grid (Trap 3, deferred-work.md's organismType note). `0` is
// the reserved empty slot and would be almost as bad the day a caller stores it in a subject.
export const NO_MATCH_REF: OrganismRef = -1;

/**
 * The battle's `id -> OrganismRef` map, built once from the dense roster order.
 *
 * ⚠️ `ref = roster index + 1` (M14), slot `0` reserved for empty — never the bare index. Under the
 * bare-index reading `organisms[0]` is a real organism and collides with occupant `0` = empty, and
 * the failure is invisible: a map built one slot low yields a PLAUSIBLE battle in which every rule
 * targets its neighbour in the roster, with no failing test. Read back with `organisms[ref - 1]`.
 *
 * A duplicate id throws rather than letting the later index win silently: `organismIds` is the
 * placed set (Decision H) and is unique by construction, so a duplicate means an ill-formed battle
 * — and the symptom otherwise is a rule resolving to a ref that no cell on the grid carries.
 */
export function internOrganismIds(ids: readonly string[]): ReadonlyMap<string, OrganismRef> {
  const refById = new Map<string, OrganismRef>();
  ids.forEach((id, index) => {
    if (refById.has(id)) {
      throw new Error(`internOrganismIds: duplicate organism id "${id}" in the battle roster`);
    }
    refById.set(id, index + 1);
  });
  return refById;
}
