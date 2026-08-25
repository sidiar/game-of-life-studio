import { describe, expect, it } from 'vitest';
import { hslToRgb, rgbToHex } from './colorMath';
import { displayColor, MAX_AGE_SHADE } from './displayColor';
import { PALETTE } from './paletteRegistry';
import {
  contrastRatio,
  deltaE76,
  hexToLinearRgb,
  relativeLuminance,
  simulateCvd,
  srgbToLab,
  type CvdType,
  type Lab,
} from './paletteCvd';

// The check evaluates what users actually see — displayColor's HSL output at each age shade —
// not the raw registry hexes (forced decision 1: those are pre-ramp authoring inputs, never
// painted on a cell directly).
function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const match = /^hsl\(([\d.-]+), ([\d.-]+)%, ([\d.-]+)%\)$/.exec(hsl);
  if (!match) throw new Error(`Not a legacy-comma hsl() string: "${hsl}"`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function pixelHexAt(tokenId: string, shade: number): string {
  const { h, s, l } = parseHsl(displayColor(tokenId, shade));
  return rgbToHex(hslToRgb(h, s / 100, l / 100));
}

const CVD_TYPES: readonly CvdType[] = ['protan', 'deutan', 'tritan'];
const ALL_MODES: readonly ('normal' | CvdType)[] = ['normal', ...CVD_TYPES];
const CVD_CORE = PALETTE.slice(0, 8); // RFC-007 Decision 2's Okabe-Ito/Paul-Tol CVD-robust core

function labFor(hex: string, mode: 'normal' | CvdType): Lab {
  const linear = hexToLinearRgb(hex);
  return srgbToLab(mode === 'normal' ? linear : simulateCvd(linear, mode));
}

describe('primitives', () => {
  it('relativeLuminance pins black and white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('contrastRatio is symmetric and maxes out at 21 for black/white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 5);
  });

  it('deltaE76 is 0 for identical colours and positive for different ones', () => {
    const labA = srgbToLab(hexToLinearRgb('#56b4e9'));
    const labB = srgbToLab(hexToLinearRgb('#56b4e9'));
    expect(deltaE76(labA, labB)).toBe(0);

    const labC = srgbToLab(hexToLinearRgb('#d55e00'));
    expect(deltaE76(labA, labC)).toBeGreaterThan(0);
  });

  it('simulateCvd clamps every channel to [0, 1]', () => {
    for (const color of PALETTE) {
      const linear = hexToLinearRgb(color.hex);
      for (const type of CVD_TYPES) {
        const simulated = simulateCvd(linear, type);
        for (const channel of [simulated.r, simulated.g, simulated.b] as const) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

// G1 — visibility. Every token, at the age-cap shade, has contrast ratio >= 3.0 against both
// #0a0a0a (Clinical Lab) and #000000 (Biotech Terminal). Measured worst: 5.12 (vermillion) — see
// docs/implementation-artifacts/palette-cvd-validation.md.
//
// The #000000 assertion is mathematically implied by the #0a0a0a one and cannot fail
// independently: contrast is (L + 0.05) / (Lbg + 0.05), and L(#000000) = 0 < L(#0a0a0a), so the
// black ratio is always the larger. It is kept as executable documentation that both shipped
// themes were considered — the binding constraint is #0a0a0a.
describe('G1 — visibility at the age cap', () => {
  it.each(PALETTE)('$id: contrast >= 3.0 against both dark backgrounds', (color) => {
    const hex = pixelHexAt(color.id, MAX_AGE_SHADE);
    expect(contrastRatio(hex, '#0a0a0a')).toBeGreaterThanOrEqual(3.0);
    expect(contrastRatio(hex, '#000000')).toBeGreaterThanOrEqual(3.0);
  });
});

// G2 — visibility while young. Every token, at every shade 0-7, has contrast ratio >= 2.5
// against #0a0a0a. Measured worst: 3.06 (bluish-green, shade 0).
describe('G2 — visibility while young', () => {
  it.each(PALETTE)('$id: contrast >= 2.5 against #0a0a0a at every shade', (color) => {
    for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
      const hex = pixelHexAt(color.id, shade);
      expect(contrastRatio(hex, '#0a0a0a')).toBeGreaterThanOrEqual(2.5);
    }
  });
});

// G3 — normal-vision distinctness. All 20 tokens are pairwise >= 8.0 ΔE76 at the age-cap shade
// under normal vision. Measured worst: 12.79 (azure/indigo).
describe('G3 — normal-vision distinctness at the age cap', () => {
  it('all 20 tokens are pairwise >= 8.0 ΔE76 under normal vision', () => {
    for (let i = 0; i < PALETTE.length; i++) {
      for (let j = i + 1; j < PALETTE.length; j++) {
        const labA = labFor(pixelHexAt(PALETTE[i].id, MAX_AGE_SHADE), 'normal');
        const labB = labFor(pixelHexAt(PALETTE[j].id, MAX_AGE_SHADE), 'normal');
        expect(deltaE76(labA, labB)).toBeGreaterThanOrEqual(8.0);
      }
    }
  });
});

// G4 — CVD-robust core. Tokens 1-8 are pairwise >= 4.0 ΔE76 at every shade 0-7 under normal,
// protan, deutan and tritan simulation. Measured worst: 4.77 (protan, bluish-green/coral-red).
//
// Deliberately NOT gating all 20 tokens under CVD simulation (RFC-007 Decision 2: a CVD-safe set
// of 20 via hue alone is not achievable; qualitative CVD-safe sets max out around 8-12). The
// all-20 matrix is recorded in palette-cvd-validation.md, not gated here — see Dev Notes.
describe('G4 — CVD-robust core (tokens 1-8)', () => {
  it('every core pair is >= 4.0 ΔE76 at every shade, under normal + all 3 CVD simulations', () => {
    for (const mode of ALL_MODES) {
      for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
        for (let i = 0; i < CVD_CORE.length; i++) {
          for (let j = i + 1; j < CVD_CORE.length; j++) {
            const labA = labFor(pixelHexAt(CVD_CORE[i].id, shade), mode);
            const labB = labFor(pixelHexAt(CVD_CORE[j].id, shade), mode);
            expect(deltaE76(labA, labB)).toBeGreaterThanOrEqual(4.0);
          }
        }
      }
    }
  });
});
