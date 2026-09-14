/**
 * Case-insensitive, Unicode-normalised organism-name search (Story 4.2). Resolves
 * `deferred-work.md:335` (2.10 review): the interim roster predicate used `toLowerCase()` with no
 * normalisation, and both `<OrganismLibrary>` (AC4) and `<OrganismRoster>` now consume this ONE
 * shared function rather than keeping two subtly different search behaviours.
 *
 * NFC before lower-casing, and `toLocaleLowerCase()` rather than `toLowerCase()`:
 * - A decomposed "é" (NFD: `e` + a combining acute accent, two code points) renders identically
 *   to a precomposed "é" (NFC: one code point) but never `.includes()`-matches it — both the
 *   query and the name have to land on the same normal form first.
 * - Turkish dotted/dotless "i" (and any other locale-sensitive casing) is wrong under the
 *   ASCII-biased `toLowerCase()`; `toLocaleLowerCase()` with no argument follows the HOST locale
 *   instead, which is the *correct* form here even though it is not asserted for a specific
 *   locale below (that would be green locally and red on a differently-configured runner).
 * - `.trim()` because a mobile keyboard appends a trailing space after an accepted word, and a
 *   pasted name carries whatever whitespace it was copied with.
 */
export function normalizeOrganismSearch(text: string): string {
  return text.trim().normalize('NFC').toLocaleLowerCase();
}

/**
 * `normalizedQuery` is normalised ONCE by the caller, not per name: a per-keystroke render scans
 * every organism in the list, and re-running `normalizeOrganismSearch` on the query inside this
 * function would repeat that work once per organism for a single keystroke.
 */
export function organismNameMatches(name: string, normalizedQuery: string): boolean {
  return normalizeOrganismSearch(name).includes(normalizedQuery);
}
