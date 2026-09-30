'use client';

import type { ReactNode } from 'react';
import { styled } from '@mui/material/styles';
import SmallScreenGate from '@/components/layout/SmallScreenGate';
import { NoticeAnchor } from '@/components/layout/Notice';

// The battle chassis — the other half of the route-group split (this story). Deliberately NOT
// AppShell: no wordmark, no AppNav, no 32px padded main. <BattleHeader> is this route's only
// chrome, and it renders the battle title as the document's sole <h1> (see BattleHeader.tsx).
//
// This layout owns the <main> landmark so the document still has exactly one, exactly as
// AppShell does for the gallery branch. Padding lives on the content, not here: Story 2.4's
// auto-fit canvas measures this box, and a padded landmark would silently shrink its budget.
const Main = styled('main')({
  minHeight: '100vh',
  background: 'var(--gol-bg-primary)',
});

// Gated here rather than in <BattlePage> so every state of the route — Lab, Run, loading, the
// not-found notices — sits behind the same panel below NFR-3.1's floor. The way out is a full-page
// `NoticeAnchor`, never `BackLink`: a battle can be dirty behind the panel, and only a real unload
// reaches the dirty guard's `beforeunload` prompt.
export default function BattleLayout({ children }: { children: ReactNode }) {
  return (
    <Main>
      <SmallScreenGate exit={<NoticeAnchor href="/">Back to Battles</NoticeAnchor>}>
        {children}
      </SmallScreenGate>
    </Main>
  );
}
