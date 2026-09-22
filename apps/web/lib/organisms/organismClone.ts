import {
  MAX_ORGANISM_NAME_LENGTH,
  ORGANISM_SCHEMA_VERSION,
  OrganismSchema,
  type Organism,
} from '@gol/domain';

/**
 * The clone's name suffix (FR-1.6: "[Original Name] (Copy)", Story 4.18 AC5). Exported so
 * `cloneOrganismName`'s truncation math and its tests share one literal.
 */
export const CLONE_NAME_SUFFIX = ' (Copy)';

/**
 * `[Name] (Copy)`, truncating the HEAD rather than overflowing the 50-character cap (FD2).
 * `OrganismSchema.name` is `z.string().max(50)` and `<OrganismNameField>` lets the user type
 * exactly 50, so `name + CLONE_NAME_SUFFIX` on a 50-character name is a 57-character record that
 * `OrganismSchema.parse` THROWS on — Clone would fail on precisely the names the editor allows.
 *
 * `trimEnd()` on the head so a cut landing on a space, or a source name that already ends in
 * one, does not yield `"Foo  (Copy)"`. A blank or whitespace-only source name yields exactly
 * `'(Copy)'` (the suffix with its leading space trimmed) — no leading space on a record whose
 * card otherwise reads `Unnamed organism`.
 *
 * The `maxLength` parameter exists for the same reason `organismName.ts`'s does — the tests
 * state the bound.
 */
export function cloneOrganismName(
  name: string,
  maxLength: number = MAX_ORGANISM_NAME_LENGTH,
): string {
  const head = name.slice(0, maxLength - CLONE_NAME_SUFFIX.length).trimEnd();
  return head === '' ? CLONE_NAME_SUFFIX.trimStart() : head + CLONE_NAME_SUFFIX;
}

/**
 * The clone projection (Story 4.18, FD1) — a pure, SYNCHRONOUS record→record projection, the
 * sibling of `organismRecord.ts`'s `projectOrganismForSave` (a record→record projection rather
 * than a draft→record one). Deliberately NOT routed through `organismDraftFrom` +
 * `projectOrganismForSave`: that path re-hashes every rule asynchronously to reproduce digits it
 * already has, and it is the editor's path, gated on `validateOrganismDraft` — a clone of a
 * schema-legal record outside the editor's tighter numeric bounds would be REFUSED by it
 * (`deferred-work.md`'s 4.11/4.17 bounds entry).
 *
 * Rule ids are re-minted per RFC-004 §2.4 ("`id` … assigned once at creation") through an
 * injected `nextRuleId` — never `crypto` inside, matching the `ruleDraftFrom`/`organismDraftFrom`
 * contract. `contentHash` is carried over UNCHANGED: `ruleContentHash.ts`'s scheme hashes
 * `{ conditions, payload }` with `id` excluded, so a copied rule's hash is already correct and
 * the clone needs no `crypto.subtle` and no `await`.
 *
 * `OrganismSchema.parse` runs LAST — the "Zod at boundaries" parse, and the thing that makes the
 * clone structurally independent of a possibly-frozen source: a bare `{ ...rule, id }` spread
 * keeps the source's `conditions` array REFERENCE, and `CONWAYS_CLASSIC` is `deepFreeze`d.
 * `schemaVersion` is stamped from `ORGANISM_SCHEMA_VERSION`, never carried over from the source
 * (Decision I.4 / the Story 4.17 restamp decision) — the record is written NOW, in this shape.
 */
export function cloneOrganismRecord(
  source: Organism,
  id: string,
  nextRuleId: () => string,
): Organism {
  const record = {
    schemaVersion: ORGANISM_SCHEMA_VERSION,
    id,
    name: cloneOrganismName(source.name),
    colorToken: source.colorToken,
    dominance: source.dominance,
    agingEnabled: source.agingEnabled,
    survivalRules: source.survivalRules.map((rule) => ({ ...rule, id: nextRuleId() })),
  };

  return OrganismSchema.parse(record);
}
