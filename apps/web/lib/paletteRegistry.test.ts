import { afterEach, describe, expect, it, vi } from 'vitest';
import { hexToRgb, hslToRgb } from './colorMath';
import {
  DEFAULT_COLOR_TOKEN,
  PALETTE,
  PALETTE_VERSION,
  resolvePaletteColor,
} from './paletteRegistry';

// RFC-007 Decision 2: tokens 1-8 are the Okabe-Ito/Paul-Tol CVD-robust core, in this exact order
// (Task 4's hard gate applies to them specifically — do not reorder).
const CVD_CORE_IDS = [
  'sky-blue',
  'vermillion',
  'bluish-green',
  'amber',
  'reddish-purple',
  'yellow',
  'azure',
  'coral-red',
];

const KEBAB_CASE_RE = /^[a-z]+(-[a-z]+)*$/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PALETTE shape', () => {
  it('has exactly 20 entries', () => {
    expect(PALETTE).toHaveLength(20);
  });

  it('has unique ids', () => {
    const ids = PALETTE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique names', () => {
    const names = PALETTE.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has kebab-case ids with no #', () => {
    for (const color of PALETTE) {
      expect(color.id).toMatch(KEBAB_CASE_RE);
      expect(color.id).not.toContain('#');
    }
  });

  it('has the first 8 ids equal to the CVD core list, in order', () => {
    expect(PALETTE.slice(0, 8).map((c) => c.id)).toEqual(CVD_CORE_IDS);
  });

  it('derives h/s/l that round-trip back to its own hex within 1/255 per channel', () => {
    for (const color of PALETTE) {
      const expected = hexToRgb(color.hex);
      const actual = hslToRgb(color.h, color.s, color.l);
      expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(1);
    }
  });

  it('pins PALETTE_VERSION to 1', () => {
    expect(PALETTE_VERSION).toBe(1);
  });
});

describe('resolvePaletteColor fallback (Decision I.4)', () => {
  it('resolves an unknown token to the default and warns exactly once across repeated calls', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const first = resolvePaletteColor('not-a-token');
    const second = resolvePaletteColor('not-a-token');
    const third = resolvePaletteColor('not-a-token');

    const defaultColor = PALETTE.find((c) => c.id === DEFAULT_COLOR_TOKEN);
    expect(first).toEqual(defaultColor);
    expect(second).toEqual(defaultColor);
    expect(third).toEqual(defaultColor);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('never warns for a known token', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolvePaletteColor('sky-blue');
    resolvePaletteColor('vermillion');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
