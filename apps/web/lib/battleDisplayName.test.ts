import { describe, expect, it } from 'vitest';
import { battleDisplayName } from './battleDisplayName';

describe('battleDisplayName', () => {
  it('returns a real name unchanged', () => {
    expect(battleDisplayName('Three-Way Skirmish')).toBe('Three-Way Skirmish');
  });

  it('falls back for an empty or whitespace-only name', () => {
    expect(battleDisplayName('')).toBe('Untitled Battle');
    expect(battleDisplayName('   \t\n ')).toBe('Untitled Battle');
  });

  /**
   * Story 2.13 (AC6), settling `deferred-work.md`'s ":349" entry. None of these are ECMAScript
   * `WhiteSpace`, so `trim()` alone leaves them and the name skips the fallback — producing an
   * `<h1>` and a browser tab with no visible text. Reachable by pasting out of a web page, which
   * is ordinary user behaviour now that the field is live-bound to the header and the tab title.
   *
   * ⚠️ axe does NOT catch this: its `text.sanitize` does not strip U+200B, so `empty-heading` sees
   * non-empty text. This test is the only thing standing between that paste and a blank heading.
   */
  it.each([
    ['U+00AD SOFT HYPHEN', '\u00AD'],
    ['U+200B ZERO WIDTH SPACE', '\u200B'],
    ['U+200C ZERO WIDTH NON-JOINER', '\u200C'],
    ['U+200D ZERO WIDTH JOINER', '\u200D'],
    ['U+200E LEFT-TO-RIGHT MARK', '\u200E'],
    ['U+200F RIGHT-TO-LEFT MARK', '\u200F'],
    ['U+2060 WORD JOINER', '\u2060'],
    ['U+FEFF ZERO WIDTH NO-BREAK SPACE', '\uFEFF'],
  ])('treats a name made only of %s as empty', (_label, character) => {
    expect(battleDisplayName(character.repeat(3))).toBe('Untitled Battle');
    expect(battleDisplayName(` ${character} `)).toBe('Untitled Battle');
  });

  // The other side of the decision: an invisible character NEXT TO real text is not emptiness, and
  // the stored name is returned verbatim — this helper chooses a fallback, it does not sanitise.
  it('leaves an invisible character inside a real name alone', () => {
    expect(battleDisplayName('Sky\u200BNet')).toBe('Sky\u200BNet');
  });
});
