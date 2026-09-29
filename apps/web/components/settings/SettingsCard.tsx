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
  // Phone widths: the controls drop under the text instead of forcing horizontal scroll. No media
  // query — the wrap happens exactly when RowInfo's 240px basis and the controls no longer fit.
  flexWrap: 'wrap',
});

export const RowInfo = styled('div')({
  flex: '1 1 240px',
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

// LIFTED from `ImportWorkspaceRow.tsx` (Story 7.5 FD6) — `LoadPresetRow` is the second consumer.
// Mockup: `.btn-secondary` (`settings.html:200-210`), `--gol-*` tokens only (AR-46). Copies
// `<SidebarFooter>`'s `BackButton` idiom for a bordered secondary control: `--gol-border-control`
// (not the decorative `--gol-border`) because this border is the button's OWN boundary, so SC
// 1.4.11's 3:1 applies — not `<DataManagement>`'s borderless `ExportButton`, which needs no such
// split. No `disabled` (FD8/AC8: this button never self-disables) and no `transition: all` (the
// mid-fade axe trap every hover-button component in this codebase avoids).
export const SecondaryButton = styled('button')({
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 24px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background-color 0.2s, border-color 0.2s',
  '&:hover': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

/**
 * Review Finding D2 (owner ruling a, Story 5.10): `<DataManagement>` owns ONE "last outcome"
 * message slot for the whole card, written to by Export, Import and Clear All alike. A row never
 * renders its own status/alert any more — it reports through an `onMessage` callback shaped by
 * this type, and starting a new flow in any row calls `onMessage(null)` to replace whatever the
 * slot held, from any row. That `null` is also how a row CLAIMS the slot: `<DataManagement>` drops
 * an outcome from any row whose flow is no longer the most recently started, so send it only at a
 * flow's start, never as a later "clear". This is what keeps an unscoped `getByRole('status')` unambiguous once
 * more than one row can produce an outcome.
 */
export interface RowOutcome {
  role: 'status' | 'alert';
  text: string;
}
