import { describe, expect, it } from 'vitest';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { DEFAULT_COLOR_TOKEN, PALETTE } from '@/lib/palette/paletteRegistry';
import { agingExampleColors } from './agingExample';

const SECOND_TOKEN = PALETTE[1].id;

describe('agingExampleColors', () => {
  it('returns exactly MAX_AGE_SHADE + 1 entries', () => {
    expect(agingExampleColors(DEFAULT_COLOR_TOKEN, false)).toHaveLength(MAX_AGE_SHADE + 1);
    expect(agingExampleColors(DEFAULT_COLOR_TOKEN, true)).toHaveLength(MAX_AGE_SHADE + 1);
  });

  it('Off: every entry is the identity colour (displayColor(token, MAX_AGE_SHADE))', () => {
    const identity = displayColor(DEFAULT_COLOR_TOKEN, MAX_AGE_SHADE);
    const colors = agingExampleColors(DEFAULT_COLOR_TOKEN, false);

    expect(colors.every((c) => c === identity)).toBe(true);
  });

  it('On: entry i equals displayColor(token, i) for every i, ends differ, and the last equals the Off value', () => {
    const colors = agingExampleColors(DEFAULT_COLOR_TOKEN, true);

    for (let i = 0; i <= MAX_AGE_SHADE; i++) {
      expect(colors[i]).toBe(displayColor(DEFAULT_COLOR_TOKEN, i));
    }
    expect(colors[0]).not.toBe(colors[MAX_AGE_SHADE]);
    expect(colors[MAX_AGE_SHADE]).toBe(
      agingExampleColors(DEFAULT_COLOR_TOKEN, false)[MAX_AGE_SHADE],
    );
  });

  it('two different known tokens give different arrays', () => {
    const first = agingExampleColors(DEFAULT_COLOR_TOKEN, true);
    const second = agingExampleColors(SECOND_TOKEN, true);

    expect(first).not.toEqual(second);
  });
});
