'use client';

import type { ReactNode } from 'react';
import { styled } from '@mui/material/styles';

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

export default function BattleLayout({ children }: { children: ReactNode }) {
  return <Main>{children}</Main>;
}
