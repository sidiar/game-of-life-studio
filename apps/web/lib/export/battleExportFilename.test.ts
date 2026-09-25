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
});
