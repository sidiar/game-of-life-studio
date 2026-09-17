'use client';

import { styled } from '@mui/material/styles';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import type { PopulationEntry } from '@/lib/battle/useSimulation';
import VisuallyHidden from '@/components/VisuallyHidden';
import { Skull, Swatch } from './populationGlyphs';

/**
 * The fullscreen HUD's population reading (spec §3.14, §8's "compact variant"): one pill per
 * organism — swatch + count — with no name, no bar and no total. A SIBLING of `<PopulationStats>`
 * (the 3-14 deferred entry's recommendation, taken by Story 3.18 AC8), not a `compact`/`variant`
 * prop on it: the two share DATA (the hook's `PopulationEntry[]`) and the two glyphs
 * (`populationGlyphs.tsx`), not markup. Presentational and total — no hook, no state, no `sim`;
 * `entries` is `sim.population` straight through, in the hook's own order (M2: sorted upstream by
 * `derivePopulation`, NO SORT here — the unsorted-input test reddens if one sneaks in).
 *
 * What it inherits from Story 3.14, decision by decision:
 * - FD4: the organism colour goes on the SWATCH only, as an inline `style` value, never on the
 *   text. The mockup colours the whole `.hud-pop-pill` (`style="color: #ff0055"`), which is the
 *   same open contrast question the 3-14 entry records: the identity shade is gated >= 3:1 for
 *   non-text, not the 4.5:1 that 12px text needs against a developer-extensible palette.
 * - FD2: an extinct pill is NOT the mockup's `opacity: 0.4` (axe folds element opacity into the
 *   measured foreground). Three full-contrast channels carry extinction instead: the hollow
 *   swatch, the named `☠` `img`, and a text step to `--gol-text-secondary` via `data-extinct`.
 * - The `en-US` grouping on the count (2.14 trap 10 — a count is a quantity, `1,234`).
 * - No `aria-live` (3.14 FD8): the HUD re-renders at up to 10 Hz, and a live region there is an
 *   announcement storm.
 *
 * The organism NAME is present for assistive technology only, through `<VisuallyHidden>` — the
 * visible pill is swatch + count (the mockup), but a count with no subject is meaningless when
 * read aloud, so each `<li>`'s accessible name is `${name} ${count}` (+ `extinct`).
 *
 * Empty roster → nothing: the HUD omits the group entirely, and the sidebar's "No organisms in
 * this battle" copy stays the sidebar's.
 */

// Mockup: `.hud-pop` (petri-dish-play-mode-fullscreen.html:189-191) — the pills as a row.
const Pills = styled('ul')({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
});

// Mockup: `.hud-pop-pill` (:193-199), minus the colour on the text (FD4) and the extinct
// `opacity` (:207, FD2) — `data-extinct` selects the text-secondary step instead.
const Pill = styled('li')({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--gol-text-primary)',
  '&[data-extinct="true"]': {
    color: 'var(--gol-text-secondary)',
  },
});

export interface PopulationPillsProps {
  /** The hook's published, pre-sorted entries (`sim.population`) — rendered in THIS order. */
  entries: readonly PopulationEntry[];
}

export default function PopulationPills({ entries }: PopulationPillsProps) {
  if (entries.length === 0) return null;
  return (
    <Pills aria-label="Population">
      {entries.map((entry) => {
        const color = displayColor(entry.colorToken, MAX_AGE_SHADE);
        return (
          <Pill key={entry.organismId} data-extinct={entry.extinct}>
            <Swatch
              aria-hidden="true"
              style={{
                background: entry.extinct ? 'transparent' : color,
                borderColor: color,
              }}
            />
            <VisuallyHidden>{entry.name} </VisuallyHidden>
            {entry.count.toLocaleString('en-US')}
            {entry.extinct && (
              <Skull role="img" aria-label="extinct">
                ☠
              </Skull>
            )}
          </Pill>
        );
      })}
    </Pills>
  );
}
