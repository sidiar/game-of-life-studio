'use client';

import { styled } from '@mui/material/styles';

/**
 * Spec §3.12: `{ cycle }`, zero-padded per mockup. Presentational and total — no hook, no state,
 * `cycle={sim.cycle}` straight through (the `<SpeedControl>` shape, 3.13).
 *
 * FD1: the mockup's accent-bordered, title-less `.cycle-counter` box becomes a title-less
 * `<CycleCounter>` wrapped by the VIEW in `<SidebarSection title="Cycle Count">` — one `<section>
 * <h2>` shape for every sidebar block (living or Lab side), which is what keeps axe's
 * `heading-order` rule settled for the route. The mockup's `2px solid var(--accent)` box border is
 * dropped here (a border inside the section's own border is a double frame) — a mockup-refresh
 * candidate (`deferred-work.md`).
 *
 * FD6: the zero-padding is a separate `aria-hidden` span, the digits are plain text. `0042` as one
 * text node is read aloud by common engines as "zero zero forty-two" or "zero zero four two" —
 * hiding the padding leaves the accessible text as `42` while the visible glyph run is unchanged.
 * No `role`, no `aria-live`, no `<output>` (FD8 — a 10 Hz live region is the announcement storm
 * 2.12 FD3 already rejected at a much lower cadence). No `toLocaleString` on the cycle — a grouped
 * `10,000` inside a zero-padded field mixes two number styles in one glyph run; this is a tabular
 * odometer, not a quantity (2.14 trap 10 is about counts and totals, not this).
 */

// Mockup: `.cycle-counter` (petri-dish-play-mode.html:317-323), minus the accent border (FD1).
const Counter = styled('div')({
  textAlign: 'center',
  padding: '4px 0 8px',
});

// Mockup: `.cycle-value` (:325-332).
const Value = styled('div')({
  fontSize: '32px',
  fontWeight: 600,
  color: 'var(--gol-accent)',
  letterSpacing: '3px',
  fontVariantNumeric: 'tabular-nums',
});

const CYCLE_DIGITS = 4; // the mockup's `0042`

export interface CycleCounterProps {
  cycle: number;
}

export default function CycleCounter({ cycle }: CycleCounterProps) {
  const digits = String(cycle);
  const padding = '0'.repeat(Math.max(0, CYCLE_DIGITS - digits.length));
  return (
    <Counter>
      <Value>
        {padding !== '' && <span aria-hidden="true">{padding}</span>}
        {digits}
      </Value>
    </Counter>
  );
}
