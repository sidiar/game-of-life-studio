'use client';

import Link from 'next/link';
import { styled } from '@mui/material/styles';

// The terminal-state block: a short uppercase title, one line of plain-language explanation, and
// exactly one way out. Four of these live on the battle route (new / error / not-found) and one on
// the 404 page — they were duplicated in BattlePage.tsx until Story 2.1's 404 needed the same
// shape, so they moved here rather than being copied a second time (Story 2.1, Decision-needed #1).
//
// `gutters` exists because the two mount points pad differently. app/(battle)/layout.tsx owns an
// UNPADDED <main> on purpose — Story 2.4's auto-fit canvas measures that box, and padding it would
// silently shrink the canvas budget — so a notice on that route must supply its own inset. AppShell
// already pads its <main> by 32px, so the 404 passes `gutters={false}` and inherits it instead of
// stacking two insets.
export const Notice = styled('div', {
  shouldForwardProp: (prop) => prop !== 'gutters',
})<{ gutters?: boolean }>(({ gutters = true }) => ({
  padding: gutters ? '30px' : 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '12px',
}));

export const NoticeTitle = styled('h1')({
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
  letterSpacing: 'var(--gol-letter-spacing-title)',
  color: 'var(--gol-text-primary)',
  textTransform: 'uppercase',
});

export const NoticeText = styled('p')({
  margin: 0,
  fontSize: '14px',
  color: 'var(--gol-text-secondary)',
});

// Same hover/focus-visible parity the Story 1.9 review established on AppNav: textDecoration is
// kept here rather than removed, so the link is identifiable without relying on colour alone.
export const BackLink = styled(Link)({
  fontSize: '14px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--gol-accent)',
  textDecoration: 'none',
  padding: '8px 16px',
  border: '1px solid var(--gol-border-control)',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});
