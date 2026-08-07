'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { styled } from '@mui/material/styles';

// AC4 / the no-dead-affordance rule: an entry appears here only once its route exists.
// Organisms joins in Story 4.1, Settings in Story 5.1 — each is one line here, not before.
const NAV_ITEMS = [{ href: '/', label: 'Battles' }] as const;

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
}));

export default function AppNav() {
  const pathname = usePathname();

  return (
    <Nav aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
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
