import { MAX_ROSTER_SIZE } from '@/lib/canvas/refToFillGroup';

/**
 * Decision H.2's roster union: the battle's own `organismIds` (Decision H.1 — exactly the placed
 * set) followed by anything added to the roster this session that is not already in it.
 *
 * Lifted out of `<BattlePage>`'s `useMemo` in Story 2.9 for one reason: the two invariants below
 * are the kind that type-check, pass every rendering test, and corrupt data — so they need
 * assertions of their own, against this function, rather than being inferred from a page test.
 *
 * ⚠️ APPEND-ONLY, and that is load-bearing (AC9, trap 1). The dense encoding is `cell = roster
 * index + 1` (RFC-006 Decision 2), so an entry's INDEX is its identity: `gridState`, every live
 * `occupant` value, every one of Story 2.8's 30 undo snapshots and the `RefToFillGroup` LUT are
 * all keyed on it. Sorting this array, or building the union the other way round, silently
 * repaints every placed cell as a different organism AND reinterprets the whole undo ring — with
 * no throw, no warning, and a fully green suite. ❌ The fix is NOT to store organism ids in
 * snapshots: Decision E is explicit that refs are runtime-only.
 *
 * ⚠️ CAPPED at 255 (AC8, Decision G.3). `buildRefToFillGroup` THROWS above the cap, and its
 * caller is a render-phase `useMemo` — so an over-cap union is an uncaught teardown of the whole
 * editor rather than a degrade. The session entries are what this drops, never the battle's own:
 * dropping a placed organism would shift every later ref by one and repaint the grid, which is
 * the far worse failure. A battle whose OWN `organismIds` already exceeds the cap is
 * schema-rejected at load (BattleSchema, Decision G.3) and is deliberately not re-guarded here —
 * truncating it would hide a corrupt record behind a silently wrong grid.
 */
export function buildRosterIds(
  battleOrganismIds: readonly string[],
  sessionRoster: readonly string[],
): readonly string[] {
  const ids = [...battleOrganismIds];
  // A Set rather than `ids.includes` per candidate: the roster runs to 255 and this sits in a
  // render-path memo.
  const present = new Set(ids);

  for (const id of sessionRoster) {
    if (present.has(id)) continue;
    if (ids.length >= MAX_ROSTER_SIZE) break;
    ids.push(id);
    present.add(id);
  }

  return ids;
}
