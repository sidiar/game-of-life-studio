/**
 * Pure, dependency-free colour-space conversions (Story 1.7 Task 2). No DOM, no colour-science
 * library — four small conversions plus a formatter are all the registry and display-colour LUT
 * need (see "What NOT to build": a chroma-js/culori dependency is deliberately out of scope).
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Hsl {
  readonly h: number; // 0-360
  readonly s: number; // 0-1
  readonly l: number; // 0-1
}

/**
 * Accepts `#RRGGBB` only — the registry writes nothing else. Rejecting loudly here means a
 * malformed hex fails fast at module init instead of producing NaN channels that would only
 * surface as a black grid three stories later.
 */
export function hexToRgb(hex: string): Rgb {
  if (!HEX_RE.test(hex)) {
    throw new Error(`hexToRgb: expected "#RRGGBB", got "${hex}"`);
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  // Achromatic (r === g === b): hue/saturation are undefined, not a division by zero to work
  // around — return them as 0 directly (colorMath.test.ts pins #000000/#ffffff/#808080 on this).
  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s, l };
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  // Achromatic short-circuit mirrors rgbToHsl's — avoids the hue-to-rgb helper dividing by an s
  // that is exactly 0.
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hueToChannel = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const hn = (((h % 360) + 360) % 360) / 360; // normalise hue into [0, 1) — handles negative input
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToChannel(p, q, hn + 1 / 3) * 255),
    g: Math.round(hueToChannel(p, q, hn) * 255),
    b: Math.round(hueToChannel(p, q, hn - 1 / 3) * 255),
  };
}

function toHexByte(n: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(n)));
  return clamped.toString(16).padStart(2, '0');
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

// Rounds to 1 decimal place and normalises -0 to 0 — a rounded value near zero that comes out
// negative (e.g. Math.round(-0.04 * 10) / 10) must not carry that sign into arithmetic done on
// the return value elsewhere, even though template interpolation alone would already print "0".
function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

/**
 * Emits the legacy comma form — `hsl(201.2, 76.9%, 62.5%)` — because the e2e matrix runs
 * Chromium/Firefox/WebKit and the comma syntax has no version floor there, unlike the modern
 * space-separated form.
 *
 * Built by template substitution, never as a literal: `` `hsl(${h}, ${s}%, ${l}%)` `` splits into
 * template elements ("hsl(", ", ", "%, ", "%)") that don't match AR-46's
 * `(rgb|rgba|hsl|hsla)\([^)]*\)` selector, so this file needs no lint whitelist. Returning a
 * hard-coded fallback literal here would fail lint — always return via this same path.
 */
export function formatHsl(h: number, sPercent: number, lPercent: number): string {
  const hh = round1(h);
  const ss = round1(sPercent);
  const ll = round1(lPercent);
  return `hsl(${hh}, ${ss}%, ${ll}%)`;
}
