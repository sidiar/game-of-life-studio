import { NEW_ORGANISM_DOMINANCE, type SurvivalRule } from '@gol/domain';
import type { SimulationOrganism } from '@/lib/battle/useSimulation';
import type { OrganismDraft } from './organismDraft';
import { PREVIEW_ORGANISM_ID } from './previewGrid';
import { parseRuleDraft } from './ruleDraft';

/**
 * The organism the preview RUNS (Story 4.15, FR-2.7 / M3): the draft's live rules under the
 * session id the drawing surface already paints with (`PREVIEW_ORGANISM_ID`, so ref 1 on the
 * drawn grid IS this organism — M14). Session-only: never persisted, never compared with a
 * library id, never handed to a repository. Story 4.16's save adapter is a SIBLING of this
 * function (real id, real `schemaVersion`, real hashes) that shares `parseRuleDraft`.
 *
 * `name` and `dominance` are constants, deliberately: nothing renders the name (the preview
 * shows no population reading — FD9), and dominance decides Phase-3 conflicts BETWEEN
 * organisms (`conflictPhase.ts`), which a one-organism roster never has. Reading them off the
 * draft would rebind the run on every name keystroke and every dominance drag for a value
 * that cannot change a single cell. `colorToken` IS read: it is `derivePopulation`'s type
 * and it is what a future population reading would show.
 */
export const PREVIEW_ORGANISM_NAME = 'Organism under edit';

export function previewOrganismFrom(
  draft: Pick<OrganismDraft, 'colorToken' | 'survivalRules'>,
): SimulationOrganism | null {
  const survivalRules: SurvivalRule[] = [];
  for (const rule of draft.survivalRules) {
    const parsed = parseRuleDraft(rule);
    if (parsed === null) return null;
    // FD5 — the session-only `contentHash` stand-in. `validateSurvivalRules` rejects an
    // empty hash because the per-session evaluator cache is keyed on the ordered join of a
    // LIST's hashes (`compileEvaluators.ts:125-127`) — a collision there hands one
    // organism another's evaluators. This session has ONE organism, so no two lists are
    // ever compared and any non-empty string is correct; the rule's own id is unique per
    // rule and stable across edits. ❌ Not a content address (AR-21) — never persisted,
    // never exported; Story 4.16's hasher mints the real one at save time.
    survivalRules.push({ ...parsed, contentHash: rule.id });
  }
  return {
    id: PREVIEW_ORGANISM_ID,
    name: PREVIEW_ORGANISM_NAME,
    colorToken: draft.colorToken,
    dominance: NEW_ORGANISM_DOMINANCE,
    survivalRules,
  };
}
