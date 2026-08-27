'use client';

import type { ReactNode } from 'react';
import { styled } from '@mui/material/styles';

// Mockup: `.sidebar-section` / `.sidebar-section-title` (clinical-lab-theme/petri-dish-lab-
// mode.html:149-164).
//
// Story 2.9 forced decision 5 built this pair module-private inside `<BattleEditorView>` "exported
// only when a second consumer arrives" — Story 2.11 (Battle Name) IS that second consumer, so the
// promised call comes due here (forced decision 2). Option (b) over (a): a `<SidebarSection
// title=…>` component centralises the `<h2>` decision axe's `heading-order` rule depends on, so
// 2.14 (Grid Info) and 2.15 (Tools) get one thing to mount rather than each re-deriving the pair.
const Section = styled('section')({
  border: '1px solid var(--gol-border)',
  padding: '15px',
  background: 'var(--gol-bg-primary)',
});

// <h2>, where the mockup uses <h3>: the battle title is the route's only <h1> (`<BattleHeader>`),
// so h2 is the next level down and every sidebar section is a sibling of the others. Reproducing
// the literal h3 would skip a level for no reason — `<BattleEditorView>`'s own comment predicted
// this would trip axe's heading-order rule "the moment 2.11 adds the second section" (AC7), so this
// is the one place that prediction is settled for every section, present and future.
const Title = styled('h2')({
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--gol-text-primary)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--gol-letter-spacing-title)',
  margin: '0 0 12px 0',
  paddingBottom: '8px',
  borderBottom: '1px solid var(--gol-border)',
});

export interface SidebarSectionProps {
  title: string;
  children: ReactNode;
}

export default function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <Section>
      <Title>{title}</Title>
      {children}
    </Section>
  );
}
