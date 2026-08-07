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

  it('every palette.background / primary / secondary / text leaf, plus divider, is a --gol-* var()', () => {
    assertAllVarGol({
      background: golTheme.palette.background,
      primary: golTheme.palette.primary,
      secondary: golTheme.palette.secondary,
      text: golTheme.palette.text,
    });
    expect(golTheme.palette.divider).toMatch(/^var\(--gol-/);
  });

  it('typography.fontFamily is the --gol-font var()', () => {
    expect(golTheme.typography.fontFamily).toBe('var(--gol-font)');
  });

  // Decision J invariant: ThemeProvider must never receive a new theme identity. A future
  // refactor to createTheme()-inside-a-function would break this silently — every other
  // assertion in this file still passes.
  it('is referentially identical across two imports', async () => {
    const reimported = await import('./theme');
    expect(reimported.default).toBe(golTheme);
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
