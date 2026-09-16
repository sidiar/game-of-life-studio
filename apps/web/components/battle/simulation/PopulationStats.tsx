'use client';

import { styled } from '@mui/material/styles';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import type { PopulationEntry } from '@/lib/battle/useSimulation';

/**
 * Spec §3.12 / component-tree-battle-page.md §3.12: "All pure presentational; logic (sorting,
 * extinction, cadence) upstream." This component is presentational and TOTAL — no hook, no state,
 * no `sim` — the `<SpeedControl>` shape (3.13). `entries` is `sim.population` straight through, in
 * the hook's own order: `derivePopulation` (Story 3.10) already sorted living-by-count-desc then
 * extinct-last, and NO SORT happens here — Task 1 (a)'s unsorted-input test reddens if one sneaks
 * in (M2 — "logic … upstream").
 *
 * The organism colour goes on the swatch and the bar ONLY, never on the name/count text (FD4):
 * the identity shade (`displayColor(colorToken, MAX_AGE_SHADE)`) is gated >= 3:1 for non-text
 * (`palette-cvd-validation.md` G1), not the 4.5:1 text needs at 10-11px against a developer-
 * extensible palette (RFC-007 Decision 1) — Story 2.12 declined to colour its numbers for the same
 * reason. The hex arrives as an inline `style` value, the `<ColorChip>` precedent
 * (`OrganismRoster.tsx:84-100`) — a resolved runtime VALUE, not a literal, so AR-46's raw-colour
 * lint has nothing to catch.
 *
 * The extinct row (FD2) is NOT the mockup's `opacity: 0.4`: axe's `color-contrast` folds element
 * opacity into the measured foreground, and `--gol-text-secondary` at 0.4 opacity on
 * `--gol-bg-primary` fails outright. Three redundant channels carry extinction instead: the hook's
 * ordering (last), the hollow swatch, and the named `☠` `img` — plus a full-contrast text-secondary
 * colour step. No `transition` on the bar fill (RFC-003: "No UI animation running during simulation
 * steps" — this route has lost three transitions to a mid-fade axe scan already,
 * `EditorStatusBar.tsx`'s comment block is the record).
 *
 * Story 3.18's HUD pills and 4.15's compact preview are the "compact variants" spec §8 names; this
 * story ships the sidebar shape only, no `variant`/`compact` prop until a consumer exists (the
 * dead-affordance rule applied to props, 3.11 FD5's reasoning).
 */

// Mockup: `.population-stats` (petri-dish-play-mode.html:341-346).
const List = styled('ul')({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

// Mockup: `.pop-item` (:348-351).
const Row = styled('li')({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

// Mockup: `.pop-header` (:353-359).
const Header = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.5px',
});

// Mockup: `.pop-name` (:361-368), minus the mockup's colour (FD4) and its `opacity` on extinct
// (FD2) — the `data-extinct` attribute selects the text-secondary step instead.
const Name = styled('span')({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  textTransform: 'uppercase',
  color: 'var(--gol-text-primary)',
  overflowWrap: 'anywhere', // the roster's 50-character rule
  '&[data-extinct="true"]': {
    color: 'var(--gol-text-secondary)',
  },
});

// `aria-hidden` at the call site (decorative — the name/percentage already state what the colour
// would). The hex arrives via inline `style` (background/borderColor); extinct rows go hollow.
const Swatch = styled('span')({
  width: '10px',
  height: '10px',
  flexShrink: 0,
  border: '1px solid',
});

// Mockup: `.pop-extinct-indicator` (:398-401).
const Skull = styled('span')({
  fontSize: '14px',
  marginLeft: '5px',
});

const Count = styled('span')({
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
});

// Mockup: `.pop-bar-container` (:370-376). `border` is decorative here exactly as
// `themeTokens.test.ts` documents it — the bar is not a control.
const BarTrack = styled('div')({
  width: '100%',
  height: '8px',
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  overflow: 'hidden',
});

// Width and background arrive as inline `style` (the unrounded `pct`, the resolved hex).
const BarFill = styled('div')({
  height: '100%',
});

// Mockup: `.total-living` (:403-411).
const Total = styled('div')({
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: '1px solid var(--gol-border)',
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '10px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

const TotalValue = styled('span')({
  color: 'var(--gol-text-primary)',
  fontWeight: 600,
  fontSize: '12px',
});

const Empty = styled('p')({
  margin: 0,
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
});

export interface PopulationStatsProps {
  /** The hook's published, pre-sorted entries (`sim.population`) — rendered in THIS order. */
  entries: readonly PopulationEntry[];
  /** Sum of `entries[].count` — the same denominator `pct` was computed against. */
  totalLiving: number;
}

export default function PopulationStats({ entries, totalLiving }: PopulationStatsProps) {
  return (
    <>
      {entries.length === 0 ? (
        <Empty>No organisms in this battle</Empty>
      ) : (
        <List role="list">
          {entries.map((entry) => {
            const color = displayColor(entry.colorToken, MAX_AGE_SHADE);
            return (
              <Row key={entry.organismId}>
                <Header>
                  <Name data-extinct={entry.extinct}>
                    <Swatch
                      aria-hidden="true"
                      style={{
                        background: entry.extinct ? 'transparent' : color,
                        borderColor: color,
                      }}
                    />
                    <span>{entry.name}</span>
                    {entry.extinct && (
                      <Skull role="img" aria-label="extinct">
                        ☠
                      </Skull>
                    )}
                  </Name>
                  <Count data-extinct={entry.extinct}>
                    {entry.count.toLocaleString('en-US')} ({Math.round(entry.pct)}%)
                  </Count>
                </Header>
                <BarTrack aria-hidden="true">
                  <BarFill style={{ width: `${entry.pct}%`, background: color }} />
                </BarTrack>
              </Row>
            );
          })}
        </List>
      )}
      <Total>
        <span>Total Living Cells</span>
        <TotalValue>{totalLiving.toLocaleString('en-US')}</TotalValue>
      </Total>
    </>
  );
}
