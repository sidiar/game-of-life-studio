/**
 * The import-side referential-closure check (RFC-006 Decision 5 / Decision E.5): every id an
 * envelope REFERENCES must be an id the envelope CARRIES. It is the other half of
 * `organismClosure.ts`'s contract — there a dangling id is skipped at export; here the resulting
 * file is rejected at import, before anything is written.
 *
 * Two kinds of reference are checked against the envelope's own `organisms[]`:
 *   - `cell`        — every `cells[].organismId` of every battle;
 *   - `rule-target` — every rule target of EVERY organism in the file, not only the ones a battle
 *                     places. An unplaced organism with a dangling target would survive the import
 *                     and fail later, at rule compile time, far from the file that caused it.
 *
 * ⚠️ **The edge is `ruleTargetIds`, and nothing else** — the same rule `organismClosure.ts` states.
 * This module never reads `conditions` or `pattern` directly: that would be a second definition of
 * "a rule targets X" beside Story 4.19's, free to disagree with the one export walks. It also
 * inherits `ruleTargetIds`' self-exclusion, which is why a self-reference is never reported.
 *
 * ⚠️ **The walk is NOT transitive, and does not need to be.** Every organism in the file is checked
 * directly, so a chain A→B→C with C absent is caught at B — the one link that is actually broken.
 * Walking from seeds would only add a way to miss an organism nothing reaches.
 *
 * ⚠️ **Conway's Classic gets no exemption.** The import re-ensures it afterwards (M9), but a file that
 * targets `conways-classic` without carrying it is still a file that does not describe itself; the
 * re-seed would silently substitute the stock record for whatever the author's rules were written
 * against.
 *
 * Pure, and throws nothing: `@gol/domain` has no classes, and a list serves the one caller (the
 * persistence import pipeline's `assertReferentialClosure` step) better than an error would — it
 * turns a non-empty list into its own typed failure, carrying every dangling id at once.
 */

import type { WorkspaceExport } from './workspaceExportSchema';
import { ruleTargetIds } from './ruleReferenceIndex';

export interface DanglingReference {
  readonly kind: 'cell' | 'rule-target';
  /** The id that resolves to nothing in the envelope's `organisms[]`. */
  readonly id: string;
  /** The battle id for a `cell`, the organism id for a `rule-target`. */
  readonly referencedBy: string;
}

/**
 * Every reference in `envelope` that its own `organisms[]` cannot resolve — each
 * `(kind, id, referencedBy)` at most once, in battle-then-organism input order. `[]` means the
 * closure holds.
 */
export function findDanglingReferences(
  envelope: Pick<WorkspaceExport, 'battles' | 'organisms'>,
): readonly DanglingReference[] {
  const carried = new Set(envelope.organisms.map((organism) => organism.id));
  const dangling: DanglingReference[] = [];

  for (const battle of envelope.battles) {
    // Per battle: a missing id painted on many cells is one broken reference, not one per cell.
    const reported = new Set<string>();
    for (const { organismId } of battle.cells) {
      if (carried.has(organismId) || reported.has(organismId)) continue;
      reported.add(organismId);
      dangling.push({ kind: 'cell', id: organismId, referencedBy: battle.id });
    }
  }

  for (const organism of envelope.organisms) {
    // `ruleTargetIds` already de-duplicates and drops self, so no per-organism set is needed.
    for (const targetId of ruleTargetIds(organism)) {
      if (!carried.has(targetId)) {
        dangling.push({ kind: 'rule-target', id: targetId, referencedBy: organism.id });
      }
    }
  }

  return dangling;
}
