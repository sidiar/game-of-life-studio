'use client';

import { styled } from '@mui/material/styles';
import type { RowOutcome } from '@/components/settings/SettingsCard';

// The dismissible arrival banner (Story 7.6 FD7), mockup `.arrival-banner`
// (`preset-workspace-library.html:157-166`). The 3px left border is decorative, not a control
// boundary; the mockup's `--warning` maps to `--gol-danger`.
const Banner = styled('div')({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  borderLeft: '3px solid var(--gol-danger)',
  padding: '14px 18px',
  marginBottom: '24px',
  maxWidth: '900px',
});

const Text = styled('p')({
  flex: 1,
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.5,
  color: 'var(--gol-text-secondary)',
});

// `--gol-text-secondary`, not tertiary: the icon must meet SC 1.4.11 (3:1) on `--gol-bg-secondary`.
const DismissButton = styled('button')({
  background: 'none',
  border: 'none',
  padding: '2px 6px',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  fontFamily: 'inherit',
  color: 'var(--gol-text-secondary)',
  '&:hover': {
    color: 'var(--gol-text-primary)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

export interface PresetLinkNoticeProps {
  notice: RowOutcome;
  onDismiss(): void;
}

export default function PresetLinkNotice({ notice, onDismiss }: PresetLinkNoticeProps) {
  return (
    <Banner>
      <Text role={notice.role}>{notice.text}</Text>
      <DismissButton
        type="button"
        aria-label="Dismiss message"
        onClick={() => {
          onDismiss();
          // The button that held focus is about to be gone; the gallery heading is the landing.
          document.getElementById('battle-gallery-heading')?.focus();
        }}
      >
        ✕
      </DismissButton>
    </Banner>
  );
}
