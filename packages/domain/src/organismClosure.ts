/**
 * The Decision E.5(b) / RFC-006 Decision 4 organism closure: given the set of organisms a battle
 * actually places (Decision H.1 — the placed set, with no grid scan needed to find it), returns
 * every organism a battle export must carry so the file has no dangling `organismType` reference —
 * the seeds themselves, plus everything their rules target, transitively.
 *
 * ⚠️ **The edge is `ruleTargetIds`, and nothing else.** This module never reads `survivalRules`,
 * `conditions`, `property === 'organismType'` or `pattern` directly — that would be a second
 * definition of "a rule targets X" beside Story 4.19's, and `lane-gates.yaml` gated this story on
 * 4.19 specifically to prevent that duplication. If "targets" ever needs to mean something
 * different, that is a change to `ruleTargetIds` and an owner decision, not a local reinterpretation
 * here.
 *
 * ⚠️ **The walk is FORWARD, from the seeds.** "Everything the seeds depend on" is answered by
 * walking each organism's own `ruleTargetIds`; the reverse index (`buildRuleReferenceIndex`, "who
 * targets X") is not consulted and would answer the wrong question — it would pull in organisms
 * that target a placed one, which the exported battle does not need to resolve anything.
 *
 * ⚠️ **A dangling id — a seed or a rule target absent from the library — is skipped, not thrown.**
 * That can only happen through corruption (`organisms.list()` already skips an unparseable record
 * before this function ever sees the library), and raising it here would fail export on exactly the
 * gap Story 5.11 exists to report; Story 5.8's `assertReferentialClosure` rejects the resulting file
 * cleanly at import instead.
 *
 * Consumers: `exportBattle` (this story), and Story 5.6's "Export Battle" action through it.
 */

import type { Organism } from './organismSchema';
import { ruleTargetIds } from './ruleReferenceIndex';

/**
 * The transitive rule-reference closure of `seedIds` within `library`.
 *
 * Returns the library's OWN records — same references, never a copy — in the library's input
 * order, restricted to the ids reachable from the seeds. A worklist walk with a `visited` set
 * (never recursion — a library-sized chain must not risk a stack overflow) makes every cycle
 * terminate by construction: an id is pushed onto the worklist at most once, whether it is pushed
 * on its own account or reached again through a second path.
 */
export function organismClosure<T extends Pick<Organism, 'id' | 'survivalRules'>>(
  seedIds: readonly string[],
  library: readonly T[],
): readonly T[] {
  const byId = new Map<string, T>();
  for (const organism of library) {
    byId.set(organism.id, organism);
  }

  const visited = new Set<string>();
  const worklist: string[] = [];

  for (const seedId of seedIds) {
    if (!visited.has(seedId)) {
      visited.add(seedId);
      worklist.push(seedId);
    }
  }

  // A forward cursor rather than `pop`/`shift`: every id is pushed onto `worklist` at most once
  // (both loops check `visited` before pushing), so nothing is ever removed — `worklist` simply
  // grows until the cursor catches up. That keeps every index inside `[0, worklist.length)` for the
  // life of the loop, with no `undefined` case to special-case (FD6 — either traversal order is
  // correct; the final filter below is what restores library order in the output).
  for (let cursor = 0; cursor < worklist.length; cursor++) {
    const organism = byId.get(worklist[cursor]);
    if (organism === undefined) continue; // Dangling id — skipped, not thrown (see header).

    for (const targetId of ruleTargetIds(organism)) {
      if (!visited.has(targetId)) {
        visited.add(targetId);
        worklist.push(targetId);
      }
    }
  }

  return library.filter((organism) => visited.has(organism.id));
}
