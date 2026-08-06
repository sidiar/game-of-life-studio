import { describe, expect, it } from 'vitest';
import { hexToRgb, hslToRgb } from './colorMath';
import { ageShadeFor, displayColor, displayColorAt, MAX_AGE_SHADE } from './displayColor';
import { DEFAULT_COLOR_TOKEN, PALETTE, paletteIndexOf } from './paletteRegistry';

// The renderer never parses its own output — this is purely a test-side accessor onto the legacy
// comma form emitted by colorMath's formatHsl, so the identity/ramp/lightness assertions below
// can inspect the numbers formatHsl rounded to instead of re-deriving them from scratch.
function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const match = /^hsl\(([\d.-]+), ([\d.-]+)%, ([\d.-]+)%\)$/.exec(hsl);
  if (!match) throw new Error(`Not a legacy-comma hsl() string: "${hsl}"`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

describe('displayColor(token, 7) reproduces entry.hex — the decision-1 identity', () => {
  it.each(PALETTE.map((color) => color))('$id', (color) => {
    const { h, s, l } = parseHsl(displayColor(color.id, MAX_AGE_SHADE));
    const rendered = hslToRgb(h, s / 100, l / 100);
    const expected = hexToRgb(color.hex);
    expect(Math.abs(rendered.r - expected.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(rendered.g - expected.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(rendered.b - expected.b)).toBeLessThanOrEqual(1);
  });
});

describe('the saturation ramp', () => {
  it("spans exactly 30%-100% of the token's own saturation across shades 0-7", () => {
    for (const color of PALETTE) {
      for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
        const { s } = parseHsl(displayColor(color.id, shade));
        const expectedPercent = color.s * (30 + 10 * shade);
        expect(s).toBeCloseTo(expectedPercent, 1);
      }
    }
  });

  it('holds lightness byte-identical across all 8 shades of the same token', () => {
    for (const color of PALETTE) {
      const lightnesses = new Set<number>();
      for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
        lightnesses.add(parseHsl(displayColor(color.id, shade)).l);
      }
      expect(lightnesses.size).toBe(1);
    }
  });

  it('holds hue identical across all 8 shades of the same token', () => {
    for (const color of PALETTE) {
      const hues = new Set<number>();
      for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
        hues.add(parseHsl(displayColor(color.id, shade)).h);
      }
      expect(hues.size).toBe(1);
    }
  });
});

describe('ageShadeFor', () => {
  it('non-aging organisms resolve to the age-cap shade, not shade 0', () => {
    expect(ageShadeFor(0, false)).toBe(7);
  });

  it('aging organisms use their raw age, capped at 7', () => {
    expect(ageShadeFor(0, true)).toBe(0);
    expect(ageShadeFor(99, true)).toBe(7);
  });

  it('clamps out-of-range and NaN ages', () => {
    expect(ageShadeFor(-5, true)).toBe(0);
    expect(ageShadeFor(NaN, true)).toBeGreaterThanOrEqual(0);
    expect(ageShadeFor(NaN, true)).toBeLessThanOrEqual(7);
  });
});

describe('displayColorAt clamping', () => {
  const index = paletteIndexOf('vermillion');

  it('clamps an out-of-range shade instead of returning undefined', () => {
    expect(displayColorAt(index, -3)).toBe(displayColorAt(index, 0));
    expect(displayColorAt(index, 99)).toBe(displayColorAt(index, 7));
    expect(displayColorAt(index, NaN)).toBeDefined();
  });

  it('clamps an out-of-range token index instead of returning undefined', () => {
    expect(displayColorAt(-1, 0)).toBe(displayColorAt(0, 0));
    expect(displayColorAt(999, 0)).toBe(displayColorAt(PALETTE.length - 1, 0));
    expect(displayColorAt(NaN, 0)).toBeDefined();
  });
});

describe('table completeness', () => {
  it('has exactly 160 distinct entries', () => {
    const all = new Set<string>();
    for (let index = 0; index < PALETTE.length; index++) {
      for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
        all.add(displayColorAt(index, shade));
      }
    }
    expect(all.size).toBe(160);
  });

  it('agrees between displayColor and displayColorAt for all 160 combinations', () => {
    for (const color of PALETTE) {
      const index = paletteIndexOf(color.id);
      for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
        expect(displayColor(color.id, shade)).toBe(displayColorAt(index, shade));
      }
    }
  });
});

describe('unknown tokens', () => {
  it('resolves through the Task 1 fallback rather than throwing', () => {
    expect(() => displayColor('not-a-real-token', 3)).not.toThrow();
    expect(displayColor('not-a-real-token', 3)).toBe(displayColor(DEFAULT_COLOR_TOKEN, 3));
  });
});
