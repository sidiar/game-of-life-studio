import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './paletteCvd';

// Parses the SHIPPED CSS file, not a re-declared copy — a test that hardcodes the hexes in
// TypeScript passes forever after someone edits themes.css and verifies nothing (Story 1.9 Dev
// Notes). This is the only place in the repo that reads themes.css as data.
const THEMES_CSS_PATH = join(__dirname, '..', 'app', 'themes.css');
const HEX_TOKEN_RE = /--gol-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g;

function parseTokens(): Record<string, string> {
  const css = readFileSync(THEMES_CSS_PATH, 'utf8');
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(HEX_TOKEN_RE)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

const tokens = parseTokens();

function tok(name: string): string {
  const value = tokens[name];
  if (!value) {
    throw new Error(`themes.css has no --gol-${name} token — did the token layer change shape?`);
  }
  return value;
}

const BACKGROUNDS = ['bg-primary', 'bg-secondary', 'bg-hover'];

describe('Clinical Lab token layer — WCAG AA (AC5)', () => {
  it('parsed at least the expected token count from the shipped CSS', () => {
    // Sanity floor, not an exhaustive list — guards against the regex matching zero tokens
    // (e.g. themes.css moved or its syntax changed) and silently passing every test below with
    // an empty tokens object.
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(13);
  });

  describe('text pairs — SC 1.4.3, >= 4.5:1', () => {
    const textTokens = ['text-primary', 'text-secondary', 'text-tertiary', 'accent'];

    for (const text of textTokens) {
      for (const bg of BACKGROUNDS) {
        it(`${text} on ${bg}`, () => {
          const ratio = contrastRatio(tok(text), tok(bg));
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    const accentStates = ['accent', 'accent-hover', 'accent-active'];
    for (const state of accentStates) {
      it(`on-accent on ${state}`, () => {
        const ratio = contrastRatio(tok('on-accent'), tok(state));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  describe('control pairs — SC 1.4.11, >= 3:1', () => {
    const controlTokens = ['border-control', 'accent'];

    for (const control of controlTokens) {
      for (const bg of BACKGROUNDS) {
        it(`${control} on ${bg}`, () => {
          const ratio = contrastRatio(tok(control), tok(bg));
          expect(ratio).toBeGreaterThanOrEqual(3);
        });
      }
    }
  });

  // --gol-border (#333333) is DELIBERATELY excluded here, not by oversight. SC 1.4.11 covers
  // boundaries needed to identify a CONTROL; a decorative divider or card edge is not one.
  // --gol-border measures ~1.57:1 / ~1.38:1 against the two dark backgrounds and asserting 3:1
  // on it would force repainting every divider in the mockup for no accessibility gain — which is
  // exactly why --gol-border-control exists as a separate token (Story 1.9 Dev Notes: "the
  // intuitive 'accessibility fix' is wrong"). Do not add a --gol-border assertion here.
  it('documents the decorative-border exclusion (informational, not a gate)', () => {
    const ratio = contrastRatio(tok('border'), tok('bg-primary'));
    expect(ratio).toBeLessThan(3); // confirms the exclusion is real, not stale
  });
});
