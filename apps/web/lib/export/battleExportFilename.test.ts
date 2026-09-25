import { describe, expect, it } from 'vitest';
import { battleExportFilename } from './battleExportFilename';

// FD7's own table — one case per row, plus Latin-accented, non-Latin-script, and length-cap cases
// (Story 5.6 review decisions, 2026-09-25).
describe('battleExportFilename', () => {
  it('kebab-cases a simple two-word name', () => {
    expect(battleExportFilename('Triple Threat')).toBe('triple-threat.json');
  });

  it('collapses internal runs of whitespace and trims the ends', () => {
    expect(battleExportFilename('  Triple   Threat  ')).toBe('triple-threat.json');
  });

  it('strips a combining accent from a Latin base via NFKD normalisation', () => {
    expect(battleExportFilename('Café Wars!')).toBe('cafe-wars.json');
  });

  it('strips a Latin combining accent mid-word without an NFC precomposed form nearby', () => {
    // A DECOMPOSED é (`e` + U+0301), so the Latin-base mark strip is exercised on its own.
    expect(battleExportFilename('Cafe\u0301 Duel')).toBe('cafe-duel.json');
  });

  it('collapses punctuation runs to single hyphens', () => {
    expect(battleExportFilename('Battle #2: Rematch')).toBe('battle-2-rematch.json');
  });

  it('falls back to untitled-battle.json for an empty name', () => {
    expect(battleExportFilename('')).toBe('untitled-battle.json');
  });

  it('falls back to untitled-battle.json for a whitespace-only name', () => {
    expect(battleExportFilename('   ')).toBe('untitled-battle.json');
  });

  it('falls back to untitled-battle.json for emoji only', () => {
    expect(battleExportFilename('🔥🔥')).toBe('untitled-battle.json');
  });

  it('falls back to untitled-battle.json for punctuation only', () => {
    expect(battleExportFilename('!!!')).toBe('untitled-battle.json');
  });

  it('keeps a non-Latin script rather than stripping it to ASCII', () => {
    expect(battleExportFilename('מלחמה')).toBe('מלחמה.json');
  });

  it('keeps a Devanagari name intact, vowel signs and virama included (not stripped as marks)', () => {
    expect(battleExportFilename('नमस्ते')).toBe('नमस्ते.json');
  });

  it('keeps a Japanese name with voiced kana (dakuten) intact, not devoiced', () => {
    expect(battleExportFilename('がんばれ')).toBe('がんばれ.json');
  });

  it('keeps a Hangul name composed into syllable blocks, not loose jamo', () => {
    const result = battleExportFilename('전투');
    expect(result).toBe('전투.json');
    // Pin composed-syllable code points, not the NFKD-decomposed jamo the old pipeline produced.
    expect(Array.from(result.replace('.json', ''))).toEqual(['전', '투']);
  });

  it('truncates a long Latin name to 60 code points before appending .json', () => {
    const longName = 'Alpha '.repeat(20).trim(); // kebab-cases to well over 60 code points
    const result = battleExportFilename(longName);
    const slug = result.replace(/\.json$/, '');
    expect(Array.from(slug).length).toBeLessThanOrEqual(60);
    expect(result).toBe('alpha-alpha-alpha-alpha-alpha-alpha-alpha-alpha-alpha-alpha.json');
  });

  it('truncates a long CJK name to 60 code points, one code point per character', () => {
    const longName = '戦'.repeat(70);
    const result = battleExportFilename(longName);
    const slug = result.replace(/\.json$/, '');
    expect(Array.from(slug).length).toBe(60);
    expect(slug).toBe('戦'.repeat(60));
  });

  it('trims a trailing hyphen left by a truncation that lands right after a word boundary', () => {
    // Kebab-cases to 59 "a"s + "-" + 10 "b"s (70 code points); the 60-code-point cut lands
    // exactly on the hyphen, which must not survive as a trailing "-".
    const name = `${'a'.repeat(59)} ${'b'.repeat(10)}`;
    const result = battleExportFilename(name);
    expect(result).toBe(`${'a'.repeat(59)}.json`);
  });

  it('keeps a surrogate-pair character whole when it falls exactly on the 60-code-point cut', () => {
    // U+20000 is a supplementary-plane CJK ideograph (a genuine surrogate pair in UTF-16, with no
    // NFKD decomposition) placed as the 60th code point; a UTF-16-unit-based truncation would
    // split it into a lone surrogate instead of keeping it whole.
    const astral = String.fromCodePoint(0x20000);
    const name = `${'a'.repeat(59)}${astral}zzzzz`;
    const result = battleExportFilename(name);
    const slug = result.replace(/\.json$/, '');
    const codePoints = Array.from(slug);
    expect(codePoints.length).toBe(60);
    expect(codePoints[59]).toBe(astral);
    expect(() => encodeURIComponent(slug)).not.toThrow();
  });

  // Second code review (2026-09-25): a combining mark survives only ON A LETTER.
  it('falls back to untitled-battle for an emoji carrying a variation selector (U+FE0F)', () => {
    expect(battleExportFilename('❤️')).toBe('untitled-battle.json');
    expect(battleExportFilename('❤️❤️')).toBe('untitled-battle.json');
  });

  it('leaves no invisible variation selector or keycap mark where an emoji was dropped', () => {
    expect(battleExportFilename('Battle ❤️ Royale')).toBe('battle-royale.json');
    expect(battleExportFilename('1️⃣ round')).toBe('1-round.json');
  });

  it('drops the mark a spacing accent decomposes into rather than keeping it after a hyphen', () => {
    expect(battleExportFilename('Rock´n´Roll')).toBe('rock-n-roll.json');
    expect(battleExportFilename('¨Wars')).toBe('wars.json');
  });

  it('falls back to untitled-battle for a name made only of combining marks', () => {
    expect(battleExportFilename('\u0301\u0302')).toBe('untitled-battle.json');
  });

  it('drops a whole letter + mark cluster the 60-code-point cut would split', () => {
    // 59 × क then कि: the cut keeps a 60th क whose vowel sign ि falls past it, so that क goes too.
    const name = `${'क'.repeat(59)}कि`;
    expect(battleExportFilename(name)).toBe(`${'क'.repeat(59)}.json`);
  });

  // Third-round review (2026-09-25, owner decision (a) on ZWNJ/ZWJ): format characters (`\p{Cf}`)
  // are dropped before the non-letter collapse, except ZWNJ/ZWJ directly between two letters, which
  // are kept as the invisible joiners real spelling requires. Written as \u-escapes (never the
  // literal glyphs) so no invisible character sits in this file's own source.
  it('keeps ZWNJ in a Persian word rather than turning it into a word-breaking hyphen', () => {
    // Persian "I want": می + ZWNJ (U+200C) + خواهم.
    expect(battleExportFilename('می\u200Cخواهم')).toBe('می\u200Cخواهم.json');
  });

  it('keeps an Indic ZWJ between two letter clusters intact', () => {
    // क + ् (virama) + ZWJ (U+200D) + ष: a genuine Devanagari conjunct, not a hyphenation point.
    const name = `क्\u200Dष`;
    expect(battleExportFilename(name)).toBe(`क्\u200Dष.json`);
  });

  it('drops a soft hyphen inside a Latin word rather than turning it into a hyphen', () => {
    expect(battleExportFilename('Ba\u00ADttle')).toBe('battle.json');
  });

  it('drops RLM and LRM bidi marks silently', () => {
    expect(battleExportFilename('Battle\u200E Royale\u200F')).toBe('battle-royale.json');
  });

  it('drops a ZWNJ next to a space, punctuation, or at the start/end rather than keeping it', () => {
    expect(battleExportFilename('\u200CBattle')).toBe('battle.json');
    expect(battleExportFilename('Battle\u200C')).toBe('battle.json');
    expect(battleExportFilename('Battle\u200C Royale')).toBe('battle-royale.json');
    expect(battleExportFilename('Battle \u200CRoyale')).toBe('battle-royale.json');
    expect(battleExportFilename('Battle\u200C!Royale')).toBe('battle-royale.json');
  });

  it('trims a ZWNJ the 60-code-point cut leaves at the end rather than keeping it invisible', () => {
    // 59 letters, then a ZWNJ between two letters (kept by kebabCase), then 10 more letters: the
    // cut lands exactly on the kept ZWNJ, which must not survive as a trailing invisible character.
    const name = `${'a'.repeat(59)}\u200C${'a'.repeat(10)}`;
    expect(battleExportFilename(name)).toBe(`${'a'.repeat(59)}.json`);
  });

  // Third code review (2026-09-25): joiner context is judged by code point and after every other
  // format character is gone, and a joiner is judged before the orphan-mark strip.
  it('drops a BOM, bidi isolates, and a name made only of format characters falls back', () => {
    expect(battleExportFilename('\uFEFFBattle')).toBe('battle.json');
    expect(battleExportFilename('\u2067Battle\u2069 Royale')).toBe('battle-royale.json');
    expect(battleExportFilename('\u200E\u00AD\u200C')).toBe('untitled-battle.json');
  });

  it('drops a joiner in an emoji sequence, next to a digit or hyphen, or doubled', () => {
    expect(battleExportFilename('\u{1F468}\u200D\u{1F469} Battle')).toBe('battle.json');
    expect(battleExportFilename('a\u200C1')).toBe('a1.json');
    expect(battleExportFilename('a\u200C-b')).toBe('a-b.json');
    expect(battleExportFilename('a\u200C\u200Cb')).toBe('ab.json');
  });

  it('keeps a joiner between two astral (surrogate-pair) letters', () => {
    // Chakma letter AA (U+11103), outside the BMP: still a letter on each side of the ZWNJ.
    expect(battleExportFilename('\u{11103}\u200C\u{11103}')).toBe('\u{11103}\u200C\u{11103}.json');
  });

  it('keeps a ZWNJ an LRM sits beside, since the LRM is dropped first', () => {
    expect(battleExportFilename('می\u200E\u200Cخواهم')).toBe('می\u200Cخواهم.json');
  });

  it('keeps a mark a soft hyphen sat in front of attached to its letter', () => {
    expect(battleExportFilename('क\u00ADि')).toBe('कि.json');
  });

  it('drops a ZWJ followed by a mark and keeps the mark on the preceding letter', () => {
    expect(battleExportFilename('ब\u200D्क')).toBe('ब्क.json');
  });
});
