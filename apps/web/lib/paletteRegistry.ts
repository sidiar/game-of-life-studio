/**
 * The organism-colour palette registry (Story 1.7, AR-26). This is the ONLY file in the repo
 * permitted to contain organism-colour hex literals — `eslint.config.mjs`'s AR-46 block
 * whitelists it explicitly (Task 5). Everywhere else, organism colour is a `colorToken` string
 * resolved through this module at render time; it is never stored as a hex on the organism
 * itself (AR-26, Decision I.4).
 */
import { hexToHsl } from './colorMath';

export interface PaletteColor {
  readonly id: string; // STABLE token — what organisms persist. Never reused, never renamed.
  readonly name: string; // human label for the Story 4.8 picker — decoupled from the hex
  readonly hex: string; // authoring value — TUNABLE with zero data migration (RFC-007 Decision 1)
  readonly h: number; // 0-360, derived
  readonly s: number; // 0-1, derived — the token's OWN saturation, and the anchor the age ramp
  //   scales against (Story 1.7 forced decision 1). Load-bearing, not decorative.
  readonly l: number; // 0-1, derived
}

export const PALETTE_VERSION = 1 as const;

interface PaletteSourceEntry {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
}

// RFC-007 Decision 2's 20 tokens, in the exact FR-2.3 default-assignment order — "safe core
// first". This order is load-bearing data, not presentation: Story 4.8 assigns colours to new
// organisms by walking it, and tokens 1-8 are the Okabe-Ito/Paul-Tol CVD-robust core that Task
// 4's G4 gate applies to specifically. Do not reorder.
const PALETTE_SOURCE: readonly PaletteSourceEntry[] = [
  { id: 'sky-blue', name: 'Sky Blue', hex: '#56B4E9' },
  { id: 'vermillion', name: 'Vermillion', hex: '#D55E00' },
  { id: 'bluish-green', name: 'Bluish Green', hex: '#009E73' },
  { id: 'amber', name: 'Amber', hex: '#E69F00' },
  { id: 'reddish-purple', name: 'Reddish Purple', hex: '#CC79A7' },
  { id: 'yellow', name: 'Yellow', hex: '#F0E442' },
  { id: 'azure', name: 'Azure', hex: '#3B82F6' },
  { id: 'coral-red', name: 'Coral Red', hex: '#FF6B5E' },
  { id: 'teal', name: 'Teal', hex: '#2DD4BF' },
  { id: 'violet', name: 'Violet', hex: '#B388FF' },
  { id: 'lime', name: 'Lime', hex: '#A3E635' },
  { id: 'magenta', name: 'Magenta', hex: '#F25CC1' },
  { id: 'cyan', name: 'Cyan', hex: '#67E8F9' },
  { id: 'tangerine', name: 'Tangerine', hex: '#FB923C' },
  { id: 'indigo', name: 'Indigo', hex: '#818CF8' },
  { id: 'mint', name: 'Mint', hex: '#6EE7B7' },
  { id: 'rose', name: 'Rose', hex: '#FB7185' },
  { id: 'chartreuse', name: 'Chartreuse', hex: '#D9F99D' },
  { id: 'lavender', name: 'Lavender', hex: '#C4B5FD' },
  { id: 'periwinkle', name: 'Periwinkle', hex: '#93C5FD' },
];

// h/s/l are DERIVED from hex at module init, never hand-written (RFC-007 Decision 1). Deriving
// once here IS the cache RFC-007 describes; a hand-typed triple that silently disagreed with its
// own hex would be a drift surface with no test able to catch it.
export const PALETTE: readonly PaletteColor[] = PALETTE_SOURCE.map((entry) => {
  const { h, s, l } = hexToHsl(entry.hex);
  return { ...entry, h, s, l };
});

export const DEFAULT_COLOR_TOKEN = 'sky-blue'; // token #1, and Conway's Classic's token

const paletteIndexById = new Map(PALETTE.map((color, index) => [color.id, index] as const));

// Verified once at module init, not per lookup. Both invariants used to be checked (or not) on
// the render path: a missing default token would have thrown INSIDE paletteIndexOf's unknown-token
// branch — turning Decision I.4's degrade-and-warn case into a hard crash mid-frame, in the one
// function documented never to throw — and a duplicate id would not have been caught at all,
// silently making the earlier entry unreachable and rendering it as its later namesake.
const DEFAULT_COLOR_INDEX: number = (() => {
  if (paletteIndexById.size !== PALETTE.length) {
    throw new Error('paletteRegistry: PALETTE contains duplicate ids');
  }
  const index = paletteIndexById.get(DEFAULT_COLOR_TOKEN);
  if (index === undefined) {
    throw new Error(
      `paletteRegistry: DEFAULT_COLOR_TOKEN "${DEFAULT_COLOR_TOKEN}" is not in PALETTE`,
    );
  }
  return index;
})();

// Dedupe unknown-token warnings: resolution happens inside the render path (per cell, per
// frame), so an un-deduped console.warn would drown the console at 60 FPS. The existing e2e
// suite asserts a clean console on the happy path — no known token may ever warn.
const warnedUnknownTokens = new Set<string>();

function warnUnknownTokenOnce(token: string): void {
  if (warnedUnknownTokens.has(token)) return;
  warnedUnknownTokens.add(token);
  console.warn(
    `[paletteRegistry] Unknown color token "${token}" — falling back to "${DEFAULT_COLOR_TOKEN}" (Decision I.4).`,
  );
}

/**
 * Unknown tokens are a degrade-and-warn case, not an error (Decision I.4): a file written by a
 * newer build, or one a future formatVersion migration hasn't rewritten yet, must still render.
 * Throwing here would turn a cosmetic mismatch into a blank Gallery.
 */
export function paletteIndexOf(token: string): number {
  const index = paletteIndexById.get(token);
  if (index !== undefined) return index;

  warnUnknownTokenOnce(token);
  return DEFAULT_COLOR_INDEX;
}

export function resolvePaletteColor(token: string): PaletteColor {
  return PALETTE[paletteIndexOf(token)];
}
