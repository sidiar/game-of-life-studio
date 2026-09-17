'use client';

import { styled } from '@mui/material/styles';
import CycleDigits from './CycleDigits';

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
 * The digits themselves — the zero-padding as an `aria-hidden` span, the value as plain text
 * (FD6) — are `<CycleDigits>`, shared with the fullscreen HUD since Story 3.18 (FD8 (a)); this
 * component owns only the sidebar's box and its 32px accent typography around them.
 * `CycleCounter.test.tsx` passing unchanged is the lift's proof.
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

export interface CycleCounterProps {
  cycle: number;
}

export default function CycleCounter({ cycle }: CycleCounterProps) {
  return (
    <Counter>
      <Value>
        <CycleDigits cycle={cycle} />
      </Value>
    </Counter>
  );
}
