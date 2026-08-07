import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import golTheme from './theme';

// Walks every leaf under a palette sub-object, asserting each is a var(--gol-*) reference. An
// enumerated list of assertions (one per key) drifts silently the moment someone adds a colour
// without a matching test line — this walks whatever is actually there.
function assertAllVarGol(obj: Record<string, unknown>, path = ''): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (typeof value === 'string') {
      expect(value, `${fullPath} should reference a --gol-* token`).toMatch(/^var\(--gol-/);
    } else if (typeof value === 'object' && value !== null) {
      assertAllVarGol(value as Record<string, unknown>, fullPath);
    }
  }
}

describe('golTheme', () => {
  it('constructs without throwing (module import alone proves this — assert a value so the import is not tree-shaken)', () => {
    expect(golTheme).toBeDefined();
    expect(golTheme.palette.mode).toBe('dark');
  });

  it('every palette.background / primary / secondary / text / action leaf, plus divider, is a --gol-* var()', () => {
    assertAllVarGol({
      background: golTheme.palette.background,
      primary: golTheme.palette.primary,
      secondary: golTheme.palette.secondary,
      text: golTheme.palette.text,
      // action joined the walk in code review 2026-08-07, when it was pinned to tokens. Its
      // *Opacity members are numbers and are skipped by the walk's typeof check — MUI multiplies
      // them, so they must stay numeric.
      action: golTheme.palette.action,
    });
    expect(golTheme.palette.divider).toMatch(/^var\(--gol-/);
  });

  it('typography.fontFamily is the --gol-font var()', () => {
    expect(golTheme.typography.fontFamily).toBe('var(--gol-font)');
  });

  // Decision J invariant: ThemeProvider must never receive a new theme identity.
  //
  // The obvious test — `await import('./theme')` twice and compare — cannot fail: ESM returns the
  // cached module namespace, so the two references are identical no matter what the module
  // contains, including `export default function makeTheme() { … }` (same function reference).
  // It was doing nothing, and was replaced in code review 2026-08-07. These two assertions can
  // fail: the export must be a theme object rather than a factory, and the source must contain
  // exactly one createTheme() call — the structural-read pattern established in Story 1.8.
  it('exports a theme object, not a factory', () => {
    expect(typeof golTheme).toBe('object');
    expect(golTheme).toHaveProperty('palette');
  });

  it('theme.ts calls createTheme exactly once', () => {
    // __dirname, not cwd — Turbo runs `test` inside apps/web today, but the path should not
    // depend on that. (import.meta.url is not a file: URL under this transform.)
    const source = readFileSync(join(__dirname, 'theme.ts'), 'utf8');
    // Comments are stripped first — theme.ts's own doc comment says "no second createTheme()
    // call anywhere", and counting that sentence would make this test fail on prose.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const calls = code.match(/\bcreateTheme\s*\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  // Regression test for silent-failure trap 1 (Story 1.9 Dev Notes): without cssVariables: true,
  // every one of these throws at RENDER (alpha() in MUI's variant styles), not at construction —
  // CssBaseline/Paper/Typography/TextField/Dialog all render fine either way, so only this test
  // catches removing cssVariables before Story 1.13 does.
  it('renders every Button variant and IconButton without throwing', () => {
    expect(() =>
      render(
        <ThemeProvider theme={golTheme}>
          <Button variant="contained">Contained</Button>
          <Button variant="text">Text</Button>
          <Button variant="outlined">Outlined</Button>
          <IconButton aria-label="icon" />
        </ThemeProvider>,
      ),
    ).not.toThrow();
  });
});
