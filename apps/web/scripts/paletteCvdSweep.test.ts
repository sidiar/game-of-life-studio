/**
 * Regenerates the worst-pair matrix recorded in
 * `docs/implementation-artifacts/palette-cvd-validation.md` (Story 1.7 Task 4).
 *
 * Run it with:
 *   npx vitest run --config vitest.sweep.config.mts        (from apps/web/)
 *
 * It is a Vitest file rather than a standalone node script only because that is what resolves the
 * `apps/web/lib/*.ts` imports — the point is that this sweep runs the SAME `displayColor` and
 * `paletteCvd` code the gates run, so the table cannot drift from the implementation the way a
 * re-derived copy of the colour maths would. `vitest.config.mts` excludes `scripts/**`, so this
 * never runs as part of `npm test`; it prints a table and asserts nothing.
 *
 * `paletteCvd.test.ts` enforces the four gates. This file is the reporting half — Stories 4.9 and
 * 6.11 re-run it after any hex re-tune and paste the output back into the validation doc.
 */
import { describe, it } from 'vitest';
import { hslToRgb, rgbToHex } from '../lib/palette/colorMath';
import { displayColor, MAX_AGE_SHADE } from '../lib/palette/displayColor';
import { PALETTE } from '../lib/palette/paletteRegistry';
import {
  contrastRatio,
  deltaE76,
  hexToLinearRgb,
  simulateCvd,
  srgbToLab,
  type CvdType,
  type Lab,
} from '../lib/palette/paletteCvd';

type Mode = 'normal' | CvdType;

const MODES: readonly Mode[] = ['normal', 'protan', 'deutan', 'tritan'];
const CORE_SIZE = 8; // RFC-007 Decision 2's Okabe-Ito/Paul-Tol CVD-robust core
const CLINICAL_LAB_BG = '#0a0a0a';
const REPORTED_SHADES = [0, 3, 7] as const; // the rows the validation doc records

function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const match = /^hsl\(([\d.-]+), ([\d.-]+)%, ([\d.-]+)%\)$/.exec(hsl);
  if (!match) throw new Error(`Not a legacy-comma hsl() string: "${hsl}"`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

/** The hex a cell is actually painted with — displayColor's output, not the authoring hex. */
function pixelHexAt(tokenId: string, shade: number): string {
  const { h, s, l } = parseHsl(displayColor(tokenId, shade));
  return rgbToHex(hslToRgb(h, s / 100, l / 100));
}

function labFor(tokenId: string, shade: number, mode: Mode): Lab {
  const linear = hexToLinearRgb(pixelHexAt(tokenId, shade));
  return srgbToLab(mode === 'normal' ? linear : simulateCvd(linear, mode));
}

interface WorstPair {
  readonly deltaE: number;
  readonly pair: string;
}

function worstPair(limit: number, shade: number, mode: Mode): WorstPair {
  let deltaE = Infinity;
  let pair = '';
  for (let i = 0; i < limit; i++) {
    const labA = labFor(PALETTE[i].id, shade, mode);
    for (let j = i + 1; j < limit; j++) {
      const distance = deltaE76(labA, labFor(PALETTE[j].id, shade, mode));
      if (distance < deltaE) {
        deltaE = distance;
        pair = `${PALETTE[i].id}/${PALETTE[j].id}`;
      }
    }
  }
  return { deltaE, pair };
}

function minContrast(shade: number): number {
  return Math.min(
    ...PALETTE.map((color) => contrastRatio(pixelHexAt(color.id, shade), CLINICAL_LAB_BG)),
  );
}

const f2 = (n: number): string => n.toFixed(2);

describe('palette CVD sweep', () => {
  it('prints the worst-pair matrix', () => {
    const out: string[] = [];

    out.push(
      '| shade | mode | core 1–8 worst pair | all 20 worst pair | min contrast vs `#0a0a0a` |',
    );
    out.push('|---|---|---|---|---|');
    for (const shade of REPORTED_SHADES) {
      const contrast = f2(minContrast(shade));
      for (const mode of MODES) {
        const core = worstPair(CORE_SIZE, shade, mode);
        const all = worstPair(PALETTE.length, shade, mode);
        out.push(
          `| ${shade} | ${mode} | ${f2(core.deltaE)} (${core.pair}) | ` +
            `${f2(all.deltaE)} (${all.pair}) | ${contrast} |`,
        );
      }
    }

    // Worst case across ALL eight shades — the doc's summary line. Sampling only shades 0/3/7
    // understates it: several pairs dip between the reported rows.
    out.push('');
    out.push('Worst across all 8 shades:');
    for (const mode of MODES) {
      let core: WorstPair = { deltaE: Infinity, pair: '' };
      let all: WorstPair = { deltaE: Infinity, pair: '' };
      for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
        const c = worstPair(CORE_SIZE, shade, mode);
        const a = worstPair(PALETTE.length, shade, mode);
        if (c.deltaE < core.deltaE) core = c;
        if (a.deltaE < all.deltaE) all = a;
      }
      out.push(
        `  ${mode.padEnd(7)} core-8 ${f2(core.deltaE)} (${core.pair})` +
          `   all-20 ${f2(all.deltaE)} (${all.pair})`,
      );
    }

    // Every all-20 pair that dips below the G4 core threshold at any shade — the
    // "known-indistinguishable under CVD" list the doc records as informational.
    out.push('');
    out.push('All-20 pairs below 4.0 ΔE76 at any shade (informational, not gated):');
    for (const mode of MODES.filter((m) => m !== 'normal')) {
      for (let i = 0; i < PALETTE.length; i++) {
        for (let j = i + 1; j < PALETTE.length; j++) {
          let deltaE = Infinity;
          let at = -1;
          for (let shade = 0; shade <= MAX_AGE_SHADE; shade++) {
            const distance = deltaE76(
              labFor(PALETTE[i].id, shade, mode),
              labFor(PALETTE[j].id, shade, mode),
            );
            if (distance < deltaE) {
              deltaE = distance;
              at = shade;
            }
          }
          if (deltaE < 4.0) {
            out.push(
              `  ${mode.padEnd(7)} ${PALETTE[i].id}/${PALETTE[j].id}: ` +
                `${f2(deltaE)} (shade ${at})`,
            );
          }
        }
      }
    }

    console.log(`\n${out.join('\n')}\n`);
  });
});
