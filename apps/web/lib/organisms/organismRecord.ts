import { ORGANISM_SCHEMA_VERSION, OrganismSchema, type Organism } from '@gol/domain';
import type { OrganismDraft } from './organismDraft';
import { parseRuleDraft } from './ruleDraft';
import { ruleContentHash } from './ruleContentHash';

/**
 * Projects the editor's draft onto the record `OrganismRepository.save` stores (Story 4.16, AC1,
 * FD3) — the mirror of `lib/battle/battleRecord.ts`'s `projectBattleForSave` and the SIBLING of
 * `previewOrganismFrom` (`previewOrganism.ts`): both walk the same drafts through the same
 * `parseRuleDraft`, one for a session-only run and one for a persisted record.
 *
 * Per rule: `parseRuleDraft(rule)` — the ONE place a `RuleDraft` becomes engine input
 * (`ruleDraft.ts:141-147`). A `null` result THROWS rather than silently skipping the rule: behind
 * a passed Save gate (`validateOrganismDraft(draft).length === 0`, Story 4.13) that branch is
 * unreachable, because the gate and `parseRuleDraft !== null` are exactly the same error set
 * (Story 4.15 FD4). A throw here surfaces through the modal's generic AC5 failure sentence rather
 * than a rule quietly dropped from the saved record — the only difference a future gate/parse
 * divergence could produce, and this makes it loud instead of silent.
 *
 * Rules hash CONCURRENTLY (`Promise.all`), but the assembled `survivalRules` array keeps the
 * DRAFT's list order, not the settle order — order is priority (FR-2.6) and `Promise.all`
 * preserves input order regardless of which promise resolves first.
 *
 * `name` is the draft's RAW string — untrimmed (FD3). Battles persist `battleName` raw including
 * `''` (`BattlePage.tsx:817-819`) for the identical reason: the gate validated the raw string's
 * length, and storing a trimmed variant would make the persisted value differ from the validated
 * one for no stated requirement.
 *
 * `OrganismSchema.parse` runs LAST — the persistence boundary's own parse ("Zod at boundaries",
 * project-context), matching `projectBattleForSave`'s `EditableGridPresetSchema.parse` at the same
 * point for the same reason. A record the schema would refuse never reaches storage.
 */
export async function projectOrganismForSave(draft: OrganismDraft, id: string): Promise<Organism> {
  const survivalRules = await Promise.all(
    draft.survivalRules.map(async (rule) => {
      const parsed = parseRuleDraft(rule);
      if (parsed === null) {
        throw new Error(
          `projectOrganismForSave: rule "${rule.id}" failed to parse behind a passed Save gate`,
        );
      }
      return { ...parsed, contentHash: await ruleContentHash(parsed) };
    }),
  );

  const record = {
    schemaVersion: ORGANISM_SCHEMA_VERSION,
    id,
    name: draft.name,
    colorToken: draft.colorToken,
    dominance: draft.dominance,
    agingEnabled: draft.agingEnabled,
    survivalRules,
  };

  return OrganismSchema.parse(record);
}
