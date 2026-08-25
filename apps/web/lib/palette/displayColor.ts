/**
 * The display-colour LUT (Story 1.7 Task 3, AC3). Converts an organism's `colorToken` + age
 * shade into the canvas `fillStyle` string the renderer paints with — nothing here renders
 * anything; that is Story 1.8's `GridRenderer`.
 */
import { formatHsl } from './colorMath';
import { PALETTE, paletteIndexOf } from './paletteRegistry';

export const MAX_AGE_SHADE = 7; // FR-5.7 visual cap — NOT the engine's MAX_RELEVANT_AGE (Decision
// B.5). They collide at 7 by coincidence; never share the constant — a battle whose rules
// reference `age > 30` has MAX_RELEVANT_AGE = 31 and still exactly 8 age shades.

const SHADE_COUNT = MAX_AGE_SHADE + 1;

// Defensive: a NaN, negative, fractional, or un-capped raw age must clamp rather than index off
// the end of the table and return `undefined` into ctx.fillStyle, which would silently paint the
// previous group's colour instead of throwing. Number.isNaN is checked separately because
// Math.round(NaN) stays NaN and neither Math.max nor Math.min recover it.
function clampAgeShade(shade: number): number {
  if (Number.isNaN(shade)) return 0;
  return Math.min(MAX_AGE_SHADE, Math.max(0, Math.round(shade)));
}

/**
 * Non-aging organisms render at their token's age-cap colour, not a washed-out 30%
 * (architecture B.2: "a non-aging organism renders at its token's base colour ... its group key
 * is (token, 7)"). Conway's Classic has agingEnabled: false, so this is the code path the MVP's
 * default battle takes — the intuitive `agingEnabled ? min(age,7) : 0` is a spec violation that
 * looks like a rendering bug.
 */
export function ageShadeFor(age: number, agingEnabled: boolean): number {
  if (!agingEnabled) return MAX_AGE_SHADE;
  // Floor, not round: an age band is the shade a cell has REACHED. Rounding would let age 6.5
  // render identically to age 99 (both landing on the cap) and would make shade 0 unreachable for
  // any age below 0.5. Engine ages are integers today, so this only matters for a caller that
  // interpolates — but round is the one direction that lets a sub-cap age reach the cap shade.
  return clampAgeShade(Math.floor(Math.min(age, MAX_AGE_SHADE)));
}

// Precompute the whole table at module init: 20 tokens x 8 age shades = 160 short strings.
// RFC-007 frames this as "per battle, entries in use"; the full table is strictly less work than
// any per-battle construction, needs no invalidation when a battle's roster changes mid-edit, and
// cannot go stale (Story 1.7 forced decision 3).
const DISPLAY_COLOR_TABLE: readonly string[] = PALETTE.flatMap((entry) => {
  const shades: string[] = [];
  for (let shade = 0; shade < SHADE_COUNT; shade++) {
    // Integer percent first, then scale by the token's OWN saturation (Sidiar 2026-08-06,
    // forced decision 1): in IEEE-754 the float form 0.30 + 0.10 * shade gives
    // 0.7000000000000001 at shade 4 and 0.9999999999999999 at shade 7 — the latter would break
    // the displayColor(token, 7) === entry.hex identity below by a hair.
    const rampPercent = 30 + 10 * shade;
    // entry.s is the token's OWN saturation as a 0-1 fraction; the ramp scales relative to it,
    // not to an absolute 100% channel, so displayColor(token, 7) reproduces entry.hex exactly
    // instead of a fully-saturated relative of it.
    const sPercent = entry.s * rampPercent;
    const lPercent = entry.l * 100; // held constant across shades — the CVD mitigation depends on it
    shades.push(formatHsl(entry.h, sPercent, lPercent));
  }
  return shades;
});

/** Hot path: index directly into the precomputed table, no id lookup. */
export function displayColorAt(tokenIndex: number, ageShade: number): string {
  const safeIndex = Number.isNaN(tokenIndex)
    ? 0
    : Math.min(PALETTE.length - 1, Math.max(0, Math.round(tokenIndex)));
  const safeShade = clampAgeShade(ageShade);
  return DISPLAY_COLOR_TABLE[safeIndex * SHADE_COUNT + safeShade];
}

export function displayColor(token: string, ageShade: number): string {
  return displayColorAt(paletteIndexOf(token), ageShade);
}
