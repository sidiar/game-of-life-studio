import { MAX_ORGANISM_NAME_LENGTH } from '@gol/domain';

/**
 * The organism name's two inline error messages, verbatim from the UX spec
 * (`organism-editor-design.md:751-753`), and the ONE validator that produces them (Story 4.5,
 * FR-2.1). Pure — no React, no DOM — so `<OrganismNameField>` reads it for the inline error and
 * Story 4.13 calls the SAME function for the Save gate and focus-to-first-invalid; two copies would
 * be two chances for the field and the gate to disagree about what "invalid" means.
 *
 * Deliberately NOT a Zod refinement on `OrganismSchema.name`: `.min(1)` is a persisted-shape change
 * assigned to Stories 5.7/5.8 (`deferred-work.md`'s "no `.min(1)`" entry), and the messages are UI
 * strings, which do not belong in the domain package.
 */
export const ORGANISM_NAME_REQUIRED = 'Organism name is required';

export function organismNameTooLong(maxLength: number): string {
  return `Name cannot exceed ${maxLength} characters`;
}

/**
 * `null` when valid, else the message to show. Length is UTF-16 code units — `String.prototype
 * .length`, which is what `OrganismSchema.name.max()` counts — so what this calls valid, the
 * schema parses.
 *
 * Too-long is checked FIRST: a whitespace-only string over the cap is "over-limit", not
 * "required" — telling the user to type more would send them the wrong way. ⚠️ `trim()` is for
 * the required check ONLY; the value itself is never trimmed here (Story 4.16 decides what it
 * persists).
 */
export function validateOrganismName(
  name: string,
  maxLength: number = MAX_ORGANISM_NAME_LENGTH,
): string | null {
  if (name.length > maxLength) return organismNameTooLong(maxLength);
  if (name.trim().length === 0) return ORGANISM_NAME_REQUIRED;
  return null;
}
