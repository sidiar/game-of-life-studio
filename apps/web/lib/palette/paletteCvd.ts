/**
 * CVD + dark-background validation math (Story 1.7 Task 4, AC1). Imported ONLY by its own test
 * and by the Story 4.9 / 6.11 re-confirmations — never by component code (no colour-science
 * dependency is worth the bundle/audit surface for a check that only ever runs in CI/tests).
 *
 * ⚠️ Every function here operates on LINEARISED sRGB. Running the CVD matrices, the WCAG
 * luminance sum, or the Lab conversion on gamma-encoded 0-255 values produces plausible-looking
 * numbers that are simply wrong — see docs/implementation-artifacts/palette-cvd-validation.md
 * for the reproduction table that catches exactly that mistake.
 */
import { hexToRgb } from './colorMath';

export interface LinearRgb {
  readonly r: number; // 0-1, linear (gamma removed)
  readonly g: number;
  readonly b: number;
}

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export type CvdType = 'protan' | 'deutan' | 'tritan';

// WCAG 2.x's own channel-linearisation breakpoint (0.03928), not the slightly different value
// (0.04045) from the underlying sRGB spec — G1/G2 are WCAG contrast gates, so this must match
// the definition they cite.
function linearizeSrgbChannel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** `#RRGGBB` -> linear sRGB in [0,1] per channel — the shared entry point into every check below. */
export function hexToLinearRgb(hex: string): LinearRgb {
  const { r, g, b } = hexToRgb(hex);
  return {
    r: linearizeSrgbChannel(r / 255),
    g: linearizeSrgbChannel(g / 255),
    b: linearizeSrgbChannel(b / 255),
  };
}

/** WCAG 2.x relative luminance, computed on linearised sRGB. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToLinearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio: (lighter + 0.05) / (darker + 0.05). */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

// sRGB (D65) linear-RGB -> CIE XYZ, IEC 61966-2-1.
const RGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const;

// CIE D65 reference white.
const D65_WHITE = { x: 0.95047, y: 1.0, z: 1.08883 };

const LAB_DELTA = 6 / 29;

function labF(t: number): number {
  return t > LAB_DELTA ** 3 ? Math.cbrt(t) : t / (3 * LAB_DELTA ** 2) + 4 / 29;
}

/** Linear sRGB (D65) -> CIE L*a*b*. Input must already be linearised — see hexToLinearRgb. */
export function srgbToLab(rgb: LinearRgb): Lab {
  const x = RGB_TO_XYZ[0][0] * rgb.r + RGB_TO_XYZ[0][1] * rgb.g + RGB_TO_XYZ[0][2] * rgb.b;
  const y = RGB_TO_XYZ[1][0] * rgb.r + RGB_TO_XYZ[1][1] * rgb.g + RGB_TO_XYZ[1][2] * rgb.b;
  const z = RGB_TO_XYZ[2][0] * rgb.r + RGB_TO_XYZ[2][1] * rgb.g + RGB_TO_XYZ[2][2] * rgb.b;

  const fx = labF(x / D65_WHITE.x);
  const fy = labF(y / D65_WHITE.y);
  const fz = labF(z / D65_WHITE.z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** Euclidean distance in CIE L*a*b* — the 1976 colour-difference formula. */
export function deltaE76(labA: Lab, labB: Lab): number {
  const dl = labA.l - labB.l;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

// Machado, Oliveira & Fernandes (2009) severity-1.0 simulation matrices, applied in linear sRGB.
const CVD_MATRICES: Record<
  CvdType,
  readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ]
> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Simulates a colour-vision-deficient view of a linear-sRGB colour, clamped to [0,1]. */
export function simulateCvd(rgbLinear: LinearRgb, type: CvdType): LinearRgb {
  const [rowR, rowG, rowB] = CVD_MATRICES[type];
  return {
    r: clamp01(rowR[0] * rgbLinear.r + rowR[1] * rgbLinear.g + rowR[2] * rgbLinear.b),
    g: clamp01(rowG[0] * rgbLinear.r + rowG[1] * rgbLinear.g + rowG[2] * rgbLinear.b),
    b: clamp01(rowB[0] * rgbLinear.r + rowB[1] * rgbLinear.g + rowB[2] * rgbLinear.b),
  };
}
