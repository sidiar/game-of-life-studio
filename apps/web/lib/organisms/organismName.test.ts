import { describe, expect, it } from 'vitest';
import { MAX_ORGANISM_NAME_LENGTH } from '@gol/domain';
import { ORGANISM_NAME_REQUIRED, organismNameTooLong, validateOrganismName } from './organismName';

describe('validateOrganismName', () => {
  it('rejects an empty name as required', () => {
    expect(validateOrganismName('', 10)).toBe(ORGANISM_NAME_REQUIRED);
  });

  // `trim()` is applied to the REQUIRED check only — a whitespace-only name is as empty as ''.
  it('rejects a whitespace-only name as required', () => {
    expect(validateOrganismName('   ', 10)).toBe(ORGANISM_NAME_REQUIRED);
  });

  it('accepts a one-character name', () => {
    expect(validateOrganismName('a', 10)).toBeNull();
  });

  it('accepts a name of exactly maxLength characters', () => {
    expect(validateOrganismName('x'.repeat(10), 10)).toBeNull();
  });

  it('rejects a name of maxLength + 1 characters with the limit interpolated', () => {
    expect(validateOrganismName('x'.repeat(11), 10)).toBe('Name cannot exceed 10 characters');
    expect(organismNameTooLong(10)).toBe('Name cannot exceed 10 characters');
  });

  // UTF-16 code units, not code points — the measure `OrganismSchema.name.max()` uses
  // (`deferred-work.md`'s code-unit entry, settled by Story 4.5). Five thumbs-up emoji are five
  // code points but ten code units; a code-point count would call the eleven-unit string below
  // valid and the schema would then reject it at save.
  it('counts UTF-16 code units, so surrogate pairs count twice', () => {
    const emoji = '\u{1F44D}';
    expect(emoji.length).toBe(2);
    expect(validateOrganismName(emoji.repeat(5), 10)).toBeNull();
    expect(validateOrganismName(emoji.repeat(5) + 'a', 10)).toBe(organismNameTooLong(10));
  });

  // A string of spaces over the cap is OVER-LIMIT, not "required": the user typed something the
  // schema refuses, and "required" would send them to type more.
  it('reports too-long before required for an over-limit whitespace-only name', () => {
    expect(validateOrganismName(' '.repeat(11), 10)).toBe(organismNameTooLong(10));
  });

  // Derived from the export, never `50`: a literal here would pin a default that had drifted from
  // the schema's own cap and keep the suite green while doing it.
  it('defaults maxLength to the schema’s MAX_ORGANISM_NAME_LENGTH', () => {
    expect(validateOrganismName('x'.repeat(MAX_ORGANISM_NAME_LENGTH))).toBeNull();
    expect(validateOrganismName('x'.repeat(MAX_ORGANISM_NAME_LENGTH + 1))).toBe(
      organismNameTooLong(MAX_ORGANISM_NAME_LENGTH),
    );
  });
});
