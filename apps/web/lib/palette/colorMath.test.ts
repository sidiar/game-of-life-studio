import { describe, expect, it } from 'vitest';
import { formatHsl, hexToHsl, hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from './colorMath';
import { PALETTE } from './paletteRegistry';

describe('hexToRgb / rgbToHex', () => {
  it('round-trips all 20 registry hexes through hex -> HSL -> hex within 1/255 per channel', () => {
    for (const color of PALETTE) {
      const original = hexToRgb(color.hex);
      const { h, s, l } = hexToHsl(color.hex);
      const roundTripped = hslToRgb(h, s, l);
      expect(Math.abs(roundTripped.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTripped.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTripped.b - original.b)).toBeLessThanOrEqual(1);
    }
  });

  it('rejects anything that is not #RRGGBB', () => {
    expect(() => hexToRgb('#fff')).toThrow();
    expect(() => hexToRgb('56B4E9')).toThrow();
    expect(() => hexToRgb('#gggggg')).toThrow();
    expect(() => hexToRgb('')).toThrow();
  });

  it('rgbToHex clamps and pads', () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
    expect(rgbToHex({ r: -10, g: 300, b: 128.6 })).toBe('#00ff81');
  });
});

describe('rgbToHsl achromatic edge cases', () => {
  it('does not divide by zero on black, white, or mid-grey', () => {
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 1 });
    const grey = rgbToHsl(128, 128, 128);
    expect(grey.s).toBe(0);
    expect(grey.h).toBe(0);
    expect(grey.l).toBeCloseTo(128 / 255, 5);
  });
});

describe('hue wrap at the red boundary', () => {
  it('keeps #ff0001 and #ff0100 on opposite sides of 0/360 rather than colliding', () => {
    const justBelowRed = rgbToHsl(255, 0, 1); // #ff0001
    const justAboveRed = rgbToHsl(255, 1, 0); // #ff0100
    expect(justBelowRed.h).toBeGreaterThan(355);
    expect(justBelowRed.h).toBeLessThan(360);
    expect(justAboveRed.h).toBeGreaterThanOrEqual(0);
    expect(justAboveRed.h).toBeLessThan(5);
  });
});

describe('formatHsl', () => {
  it('emits the legacy comma form rounded to 1 decimal place', () => {
    expect(formatHsl(201.23, 76.87, 62.5)).toBe('hsl(201.2, 76.9%, 62.5%)');
  });

  it('produces no -0', () => {
    expect(formatHsl(-0.04, -0.04, -0.04)).toBe('hsl(0, 0%, 0%)');
  });

  it('rounding is stable across repeated calls', () => {
    const a = formatHsl(120, 50, 50);
    const b = formatHsl(120, 50, 50);
    expect(a).toBe(b);
  });
});
