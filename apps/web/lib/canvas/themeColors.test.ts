import { afterEach, describe, expect, it } from 'vitest';
import { readGridColors } from './themeColors';

// app/themes.css is never loaded under jsdom (Story 1.8's forced decision 1 traces this back to
// Story 1.11) — tokens are set inline on the root element itself, the only way getComputedStyle
// resolves a custom property here. AR-46 exempts test files, so the literals belong only here.
describe('readGridColors', () => {
  afterEach(() => {
    document.documentElement.style.cssText = '';
  });

  it('resolves both tokens from the given root, trimmed', () => {
    document.documentElement.style.setProperty('--gol-bg-primary', '  #0a0a0a  ');
    document.documentElement.style.setProperty('--gol-grid-line', ' rgb(51 51 51 / 0.3) ');

    expect(readGridColors(document.documentElement)).toEqual({
      background: '#0a0a0a',
      gridLine: 'rgb(51 51 51 / 0.3)',
    });
  });

  it('returns null when --gol-bg-primary is missing', () => {
    document.documentElement.style.setProperty('--gol-grid-line', 'rgb(51 51 51 / 0.3)');
    expect(readGridColors(document.documentElement)).toBeNull();
  });

  it('returns null when --gol-grid-line is missing', () => {
    document.documentElement.style.setProperty('--gol-bg-primary', '#0a0a0a');
    expect(readGridColors(document.documentElement)).toBeNull();
  });

  it('returns null when neither token is set (the jsdom default — themes.css never loads there)', () => {
    expect(readGridColors(document.documentElement)).toBeNull();
  });
});
