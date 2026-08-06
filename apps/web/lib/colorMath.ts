/**
 * Pure, dependency-free colour-space conversions (Story 1.7 Task 2). No DOM, no colour-science
 * library — four small conversions plus a formatter are all the registry and display-colour LUT
 * need (see "What NOT to build": a chroma-js/culori dependency is deliberately out of scope).
 *
 * Two deliberate error policies, split by which direction the data flows:
 *   - INGEST (`hexToRgb`, `rgbToHsl`) throws on malformed input. These run at module init, where
 *     a loud failure is a build/boot error someone fixes, not a rendering artefact.
 *   - OUTPUT (`hslToRgb`, `rgbToHex`, `formatHsl`) never throws and never emits an unparseable
 *     string. These are on the render path, where an invalid `ctx.fillStyle` assignment is a
 *     silent no-op that repaints the PREVIOUS group's colour — a wrong-colour bug with no stack
 *     trace. Non-finite input is normalised to a valid colour rather than propagated as NaN.
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
  // NaN would evade the achromatic short-circuit below (`NaN === NaN` is false) and every
  // `max === rn` comparison, falling through to the blue sector and returning an all-NaN Hsl that
  // only surfaces later as an unparseable hsl() string. Reject at the ingest boundary instead.
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    throw new Error(`rgbToHsl: expected finite channels, got (${r}, ${g}, ${b})`);
  }

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
  // Output path: normalise rather than throw (see the file header). A non-finite hue would make
  // every comparison inside hueToChannel false and fall through to `return p` on all three
  // channels — a plausible mid-grey with no NaN left to trace back to its cause.
  const hSafe = Number.isFinite(h) ? h : 0;
  const sSafe = Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 0;
  const lSafe = Number.isFinite(l) ? Math.min(1, Math.max(0, l)) : 0;

  // Achromatic fast path. It is behaviourally identical to the general path below (at s = 0,
  // q = l and p = 2l - l = l, so every hueToChannel branch returns l) — it exists to skip the
  // hue arithmetic for greys, not to avoid a division that hueToChannel never performs.
  if (sSafe === 0) {
    const v = Math.round(lSafe * 255);
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

  const hn = (((hSafe % 360) + 360) % 360) / 360; // into [0, 1) — handles negative input
  const q = lSafe < 0.5 ? lSafe * (1 + sSafe) : lSafe + sSafe - lSafe * sSafe;
  const p = 2 * lSafe - q;

  return {
    r: Math.round(hueToChannel(p, q, hn + 1 / 3) * 255),
    g: Math.round(hueToChannel(p, q, hn) * 255),
    b: Math.round(hueToChannel(p, q, hn - 1 / 3) * 255),
  };
}

function toHexByte(n: number): string {
  // NaN survives the clamp untouched (Math.round/min/max all return NaN), and `NaN.toString(16)`
  // is the 3-character string "NaN" that padStart leaves alone — yielding "#NaN0000", which reads
  // as almost-valid and assigns to fillStyle as a no-op.
  if (!Number.isFinite(n)) return '00';
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

// Rounds to 1 decimal place, and normalises two values that would otherwise reach the template
// below: -0, which interpolates as "0" today but would carry its sign into any arithmetic a
// caller does on a parsed value; and non-finite input, which would emit "hsl(NaN, NaN%, NaN%)" —
// an unparseable fillStyle that silently keeps the previous fill colour. Normalising here rather
// than returning a literal fallback string keeps formatHsl's output on the template path, which
// is what exempts this file from AR-46 (see formatHsl's doc comment).
function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
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
