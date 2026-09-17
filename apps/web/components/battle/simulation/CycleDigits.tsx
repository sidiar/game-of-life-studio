'use client';

/**
 * The zero-padded cycle glyph run — `0042` — with the padding out of the accessible text. Story
 * 3.18 FD8 (a) lifted it out of `<CycleCounter>` (Story 3.14) so that the sidebar's counter and
 * the fullscreen HUD's Cycle group render ONE implementation of the padding rule; each host owns
 * its own size/colour block around it (32px in the sidebar, 20px in the HUD).
 *
 * 3.14 FD6: the zero-padding is a separate `aria-hidden` span, the digits are plain text. `0042`
 * as one text node is read aloud by common engines as "zero zero forty-two" or "zero zero four
 * two" — hiding the padding leaves the accessible text as `42` while the visible glyph run is
 * unchanged. No `role`, no `aria-live`, no `<output>` (3.14 FD8 — a 10 Hz live region is the
 * announcement storm 2.12 FD3 already rejected at a much lower cadence). No `toLocaleString` on
 * the cycle — a grouped `10,000` inside a zero-padded field mixes two number styles in one glyph
 * run; this is a tabular odometer, not a quantity (2.14 trap 10 is about counts and totals, not
 * this).
 */

const CYCLE_DIGITS = 4; // the mockup's `0042`

export interface CycleDigitsProps {
  cycle: number;
}

export default function CycleDigits({ cycle }: CycleDigitsProps) {
  const digits = String(cycle);
  const padding = '0'.repeat(Math.max(0, CYCLE_DIGITS - digits.length));
  return (
    <>
      {padding !== '' && <span aria-hidden="true">{padding}</span>}
      {digits}
    </>
  );
}
