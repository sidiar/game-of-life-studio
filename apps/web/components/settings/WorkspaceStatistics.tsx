'use client';

import { styled } from '@mui/material/styles';
import { formatStorageSize } from '@/lib/settings/formatStorageSize';

export interface WorkspaceStatisticsProps {
  battleCount: number;
  organismCount: number;
  storageBytes: number;
}

const STATS_HEADING_ID = 'workspace-statistics-heading';

// Mockup: .settings-section (settings.html:112-121). `transition: all 0.3s` in the mockup is NOT
// carried over — the mid-fade axe trap `BattleNameField.tsx:18-49` records: a scan landing
// mid-transition can measure a control at a contrast ratio no settled state has. Only the
// `:hover` border colour actually changes here, so only `border-color` is enumerated, with the
// `prefers-reduced-motion` escape every transition in this codebase carries.
const Card = styled('section')({
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '30px',
  transition: 'border-color 0.2s',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// Mockup: .settings-section-title (:123-130). `<h2>` because the page's `<h1>` is "Settings" and
// every card is a section of it (FD7) — Epic 6's cards will be `<h2>`s too, so `heading-order`
// stays flat.
const CardTitle = styled('h2')({
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--gol-text-primary)',
  margin: '0 0 8px',
  paddingBottom: '12px',
  borderBottom: '1px solid var(--gol-border)',
});

// Mockup: .workspace-stats (:282-287). Native CSS Grid, the `TileGrid` / `CardGrid` precedent.
const StatsGrid = styled('dl')({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '20px',
  margin: 0,
});

// Mockup: .stat-item (:289-297). A `div` wrapping `<dt>`/`<dd>` — the only valid `<dl>` grouping
// shape, axe-clean, and it gives `role="term"`/`role="definition"` for free. DOM order is
// `dt` then `dd` (the only valid order for a description list) while the mockup shows the value
// ABOVE the label — `column-reverse` achieves the mockup's visual order without inverting the DOM.
const StatItem = styled('div')({
  display: 'flex',
  flexDirection: 'column-reverse',
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border)',
  padding: '20px',
  textAlign: 'center',
  transition: 'border-color 0.2s',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// Mockup: .stat-label (:303-308).
const StatLabel = styled('dt')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  margin: 0,
});

// Mockup: .stat-value (:299-302).
const StatValue = styled('dd')({
  fontSize: '32px',
  color: 'var(--gol-accent)',
  fontWeight: 600,
  margin: '0 0 8px',
});

/**
 * The Workspace Statistics card. Three tiles — Saved Battles, Organisms, Storage Used — are the
 * card's complete set for the MVP (FR-8.2 names exactly these); this is not a partial view growing
 * a fourth tile later. The two counts are `toLocaleString('en-US')`-formatted integers (the house
 * locale pin: `GridSettingsSection`, `PopulationStats`; deferred-work.md:429 — an unpinned locale
 * renders "6 000" on fr-FR and fails a test written on en-US). Storage Used is UTF-16 bytes from
 * the AR-14 usage meter (`packages/persistence/src/localStorageAccess.ts`), formatted by
 * `formatStorageSize` (Story 5.2 FD2/FD5) — this component never reads storage itself.
 */
export default function WorkspaceStatistics({
  battleCount,
  organismCount,
  storageBytes,
}: WorkspaceStatisticsProps) {
  return (
    <Card aria-labelledby={STATS_HEADING_ID}>
      <CardTitle id={STATS_HEADING_ID}>Workspace Statistics</CardTitle>
      <StatsGrid>
        <StatItem>
          <StatLabel>Saved Battles</StatLabel>
          <StatValue>{battleCount.toLocaleString('en-US')}</StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>Organisms</StatLabel>
          <StatValue>{organismCount.toLocaleString('en-US')}</StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>Storage Used</StatLabel>
          <StatValue>{formatStorageSize(storageBytes)}</StatValue>
        </StatItem>
      </StatsGrid>
    </Card>
  );
}
