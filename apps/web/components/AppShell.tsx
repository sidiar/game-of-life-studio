'use client';

import type { ReactNode } from 'react';
import { styled } from '@mui/material/styles';
import AppNav from './AppNav';

// Mockup: .header (clinical-lab-theme/battle-gallery.html:38-45) — plain flex row with a 2px
// bottom rule, no elevation or fixed positioning. Semantic <header> + styled(), not
// AppBar/Toolbar: the Material defaults cost ~9 KB gzip more on a budget with ~19 KB left after
// this story, and every one of Material's density/elevation defaults would need overriding back
// off to match this mockup (Story 1.9 Dev Notes, forced decision 4).
const Header = styled('header')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '24px 32px',
  borderBottom: '2px solid var(--gol-border)',
});

// Wordmark, not a document heading — the page's own <h1> ("Battle Gallery") is the sole h1
// (Story 1.9 Dev Notes, forced decision 5). Two <h1>s on one document trips axe.
const Logo = styled('div')({
  fontSize: '24px',
  fontWeight: 600,
  letterSpacing: 'var(--gol-letter-spacing-title)',
  color: 'var(--gol-text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
});

const LogoAccent = styled('span')({
  color: 'var(--gol-accent)',
  fontWeight: 300,
});

const Main = styled('main')({
  padding: '32px',
});

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header>
        <Logo>
          <LogoAccent aria-hidden="true">◉</LogoAccent> Game of Life Studio
        </Logo>
        <AppNav />
      </Header>
      <Main>{children}</Main>
    </>
  );
}
