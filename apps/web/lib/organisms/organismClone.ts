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
  // `Math.max(0, …)` (review 2026-09-22): a `maxLength` below the suffix's own 7 characters made
  // the second argument NEGATIVE, and `String#slice` reinterprets a negative end as an offset from
  // the END — so a SMALLER cap produced a LONGER name (`cloneOrganismName('HelloWorld', 0)` gave
  // `'Hel (Copy)'`, 10 characters for a cap of 0). Unreachable from both shipped call sites, which
  // take the default, but the parameter is exported and the docblock advertises it.
  const cut = cutAtCodePoint(name, Math.max(0, maxLength - CLONE_NAME_SUFFIX.length));
  const head = cut.trimEnd();
  return head === '' ? CLONE_NAME_SUFFIX.trimStart() : head + CLONE_NAME_SUFFIX;
}

/**
 * `name.slice(0, end)`, backed off by one when `end` would land BETWEEN a surrogate pair (review
 * 2026-09-22). `slice` counts UTF-16 code units, so a 25-emoji name (50 units, exactly the cap)
 * used to truncate to `'👾'×21 + '\ud83d'` — a lone high surrogate, which renders as U+FFFD on
 * the card and in both `aria-label`s, is unsearchable by its own visible text, and is not
 * well-formed UTF-8 for the Epic 5 export envelope. Zod's `.max()` counts code units too and does
 * not catch it.
 *
 * Code POINTS only, deliberately not grapheme clusters: a ZWJ sequence (👨‍👩‍👧‍👦) still splits into
 * its component emoji, which renders as valid characters rather than as a replacement glyph.
 * Snapping to cluster boundaries needs `Intl.Segmenter` and a rule for what to do when one
 * cluster is longer than the whole budget — `deferred-work.md` records it.
 */
function cutAtCodePoint(name: string, end: number): string {
  if (end <= 0 || end >= name.length) return name.slice(0, Math.max(0, end));
  const last = name.charCodeAt(end - 1);
  const next = name.charCodeAt(end);
  const splitsPair = last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  return name.slice(0, splitsPair ? end - 1 : end);
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
