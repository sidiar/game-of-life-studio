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

/**
 * The settings-item row primitives, LIFTED from `DataManagement.tsx` (Story 5.9 Task 4.1) rather
 * than copied a third time — `<ImportWorkspaceRow>` is the second consumer, and the two-copies
 * threshold this codebase lifts at (`SettingsCard.tsx`'s own header comment) is met. Mockup:
 * `.settings-item` / `.settings-item-info` / `.settings-item-label` / `.settings-item-description`
 * (`settings.html:139-174, 392-403`). `Row`'s rendered DOM and styles are byte-identical to
 * `DataManagement.tsx`'s former copy.
 */
export const Row = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '20px',
  padding: '15px 0',
});

export const RowInfo = styled('div')({
  flex: 1,
});

// Mockup: .settings-item-label (:162-167).
export const RowLabel = styled('h3')({
  fontSize: '14px',
  color: 'var(--gol-text-primary)',
  margin: '0 0 4px',
  fontWeight: 500,
});

// Mockup: .settings-item-description (:169-174).
export const RowDescription = styled('p')({
  fontSize: '13px',
  color: 'var(--gol-text-secondary)',
  margin: 0,
  lineHeight: 1.5,
});
