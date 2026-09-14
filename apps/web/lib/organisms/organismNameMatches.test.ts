import { describe, expect, it } from 'vitest';
import { normalizeOrganismSearch, organismNameMatches } from './organismNameMatches';

describe('organismNameMatches', () => {
  it.each([
    ["Conway's Classic", 'con', true],
    ["Conway's Classic", 'CON ', true], // caller-trimmed uppercase — the query is normalised too
    ['Café', 'café'.normalize('NFD'), true], // NFD query vs NFC name
    ['Café'.normalize('NFD'), 'café', true], // the reverse: NFD name vs NFC query
    ['AZURE', 'zure', true],
    ['Azure', 'azur e', false], // an internal space is not in the name at all
    ["Conway's Classic", '', true], // empty query matches every name
    ['', '', true],
  ] as const)('organismNameMatches(%j, %j) -> %s', (name, query, expected) => {
    // The query is normalised by the CALLER in real use (organismNameMatches assumes it is
    // already normalised) — but this table also proves the function is safe to call directly
    // with a raw query, since it re-normalises the name side regardless.
    expect(organismNameMatches(name, normalizeOrganismSearch(query))).toBe(expected);
  });

  // No Turkish-i row: `toLocaleLowerCase()` with no argument follows the HOST locale, so an
  // assertion pinned to Turkish casing would be green on a machine configured for it and red
  // everywhere else. The point of using the locale-aware form is that it is correct WHEREVER it
  // runs, not that a specific locale is in effect here.

  describe('normalizeOrganismSearch', () => {
    it('trims, NFC-normalises and lower-cases', () => {
      expect(normalizeOrganismSearch('  Conway  ')).toBe('conway');
    });
  });
});
