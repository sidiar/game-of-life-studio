'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { styled } from '@mui/material/styles';
import { isNavItemActive } from '@/lib/layout/navMatch';

// Story 1.9 AC4 / the no-dead-affordance rule: an entry appears here only once its route exists.
// This is now the MVP's complete set — AR-28's three page surfaces (Battles, Organisms, Settings)
// plus the fact that battle routes carry no nav entry by design (they wear their own chassis, not
// AppShell). `match` is per-entry (Story 4.1, deferred-work.md:85): '/' has to be 'exact' because
// it prefixes every route, while '/organisms' and '/settings' are 'prefix' so each stays active on
// its own trailing-slash host (`/organisms/`, `/settings/`) and on any nested path — see
// lib/layout/navMatch.ts's doc comment.
const NAV_ITEMS = [
  { href: '/', label: 'Battles', match: 'exact' },
  { href: '/organisms', label: 'Organisms', match: 'prefix' },
  { href: '/settings', label: 'Settings', match: 'prefix' },
] as const;

const Nav = styled('nav')({
  display: 'flex',
  gap: '40px',
});

// Mockup: .nav-item / .nav-item.active (clinical-lab-theme/battle-gallery.html:68-88). Static
// chrome goes through styled(), not sx (RFC-003 Decision 3) — sx re-resolves per render for
// values that never change here.
const NavItem = styled(Link, {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean }>(({ active }) => ({
  color: active ? 'var(--gol-accent)' : 'var(--gol-text-secondary)',
  fontSize: '14px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  textDecoration: 'none',
  padding: '8px 16px',
  border: `1px solid ${active ? 'var(--gol-border)' : 'transparent'}`,
  backgroundColor: active ? 'var(--gol-bg-secondary)' : 'transparent',
  transition: 'color 0.2s',
  '&:hover': {
    color: active ? 'var(--gol-accent)' : 'var(--gol-text-primary)',
  },
  // Keyboard parity with the hover rule above (code review 2026-08-07). textDecoration: 'none'
  // plus a custom background left the UA default outline as the only focus signal — a colour
  // never chosen against #0a0a0a and different in every engine, so mouse users got a state
  // change keyboard users did not. --gol-accent is already gated at >= 3:1 against all three
  // backgrounds in themeTokens.test.ts under the label "focus ring"; this is the ring it meant.
  // axe does not evaluate focus visibility, so neither axe run would have caught its absence.
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
}));

export default function AppNav() {
  const pathname = usePathname();

  return (
    <Nav aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href, item.match);
        return (
          <NavItem
            key={item.href}
            href={item.href}
            active={active}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </NavItem>
        );
      })}
    </Nav>
  );
}
