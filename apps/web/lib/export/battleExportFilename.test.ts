import { describe, expect, it } from 'vitest';
import { battleExportFilename } from './battleExportFilename';

// FD7's own table — one case per row, plus a non-Latin name proving Unicode letters survive.
describe('battleExportFilename', () => {
  it('kebab-cases a simple two-word name', () => {
    expect(battleExportFilename('Triple Threat')).toBe('triple-threat.json');
  });

  it('collapses internal runs of whitespace and trims the ends', () => {
    expect(battleExportFilename('  Triple   Threat  ')).toBe('triple-threat.json');
  });

  it('strips a combining accent via NFKD normalisation', () => {
    expect(battleExportFilename('Café Wars!')).toBe('cafe-wars.json');
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
});
