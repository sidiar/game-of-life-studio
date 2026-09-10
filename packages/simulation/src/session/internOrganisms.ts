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
import { MAX_CELL_VALUE } from '../grid/grid';
import { ROSTER_LEVEL, ruleCompilationError } from './validateRules';

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
 *
 * The ids themselves are checked too, because this is the in-memory boundary the sweep in
 * validateRules.ts protects and `id` is the interning KEY: `''` interns to a real ref that no
 * `organismType` pattern can ever name (the pattern validator rejects an empty id), and a
 * non-string becomes a `Map` key that `refById.get(<library id string>)` never finds — both
 * produce a plausible battle in which a targeting rule is silently a never-match. The roster cap
 * is enforced for the same reason: the occupant buffer is a `Uint8Array` (Decision G.3), so ref
 * 256 stores as 0 = empty and that organism can never occupy a cell. All three throw the same
 * `RuleCompilationError` the rule sweep throws (`ruleId: ROSTER_LEVEL`), so a caller has ONE
 * channel for "compileSession rejected this input".
 *
 * An index loop rather than `forEach`, which skips holes: a sparse roster would otherwise produce
 * a gap in the ref sequence and break `organisms[ref - 1]` for every organism after it.
 *
 * @throws RuleCompilationError with `ruleId === ROSTER_LEVEL`.
 */
export function internOrganismIds(ids: readonly string[]): ReadonlyMap<string, OrganismRef> {
  if (ids.length > MAX_CELL_VALUE) {
    throw ruleCompilationError(
      String(ids[MAX_CELL_VALUE]),
      ROSTER_LEVEL,
      `the battle roster has ${ids.length} organisms; the dense Uint8Array encoding caps it at ${MAX_CELL_VALUE} (Decision G.3)`,
    );
  }
  const refById = new Map<string, OrganismRef>();
  for (let index = 0; index < ids.length; index += 1) {
    const id: unknown = ids[index];
    if (typeof id !== 'string' || id.length === 0) {
      throw ruleCompilationError(
        String(id),
        ROSTER_LEVEL,
        `an organism id must be a non-empty string (AR-21), got ${String(id)} at roster index ${index}`,
      );
    }
    if (refById.has(id)) {
      throw ruleCompilationError(
        id,
        ROSTER_LEVEL,
        `duplicate organism id "${id}" in the battle roster`,
      );
    }
    refById.set(id, index + 1);
  }
  return refById;
}
