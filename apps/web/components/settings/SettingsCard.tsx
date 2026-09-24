'use client';

import { styled } from '@mui/material/styles';

/**
 * The shared card chrome for `/settings` (Story 5.5, Task 4). Lifted out of
 * `WorkspaceStatistics.tsx` rather than copied a second time — with two cards now on one page,
 * both in this lane-5-only `components/settings/` folder, this is the cheapest point to do it.
 * `WorkspaceStatistics`'s rendered DOM and styles are byte-identical to before the lift.
 */

// Mockup: .settings-section (settings.html:112-121). `transition: all 0.3s` in the mockup is NOT
// carried over — the mid-fade axe trap `BattleNameField.tsx:18-49` records: a scan landing
// mid-transition can measure a control at a contrast ratio no settled state has. Only the
// `:hover` border colour actually changes here, so only `border-color` is enumerated, with the
// `prefers-reduced-motion` escape every transition in this codebase carries.
export const Card = styled('section')({
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
export const CardTitle = styled('h2')({
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--gol-text-primary)',
  margin: '0 0 8px',
  paddingBottom: '12px',
  borderBottom: '1px solid var(--gol-border)',
});
