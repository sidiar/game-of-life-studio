import { MAX_ORGANISM_DESCRIPTION_LENGTH } from '@gol/domain';

/**
 * The organism description's one validator (FR-9.5, Story 7.2), mirroring `organismName.ts` so the
 * field's inline error and the Save gate (`validateOrganismDraft`) read the same function. Only an
 * over-limit check: the description is optional, so there is no "required" message. The editor
 * REFUSES rather than clamps (Story 7.2 FD8 — the organism name's pattern): the text may run past
 * the cap, and Save is gated until it is back under.
 */
export function organismDescriptionTooLong(maxLength: number): string {
  return `Description cannot exceed ${maxLength} characters`;
}

/** Shared with `<OrganismDescriptionField>`'s counter so the two agree on "over the cap". */
export function exceedsOrganismDescriptionLength(
  description: string,
  maxLength: number = MAX_ORGANISM_DESCRIPTION_LENGTH,
): boolean {
  return description.length > maxLength;
}

/** `null` when valid, else the message. UTF-16 code units, what the schema's `.max()` counts. */
export function validateOrganismDescription(
  description: string,
  maxLength: number = MAX_ORGANISM_DESCRIPTION_LENGTH,
): string | null {
  return exceedsOrganismDescriptionLength(description, maxLength)
    ? organismDescriptionTooLong(maxLength)
    : null;
}
