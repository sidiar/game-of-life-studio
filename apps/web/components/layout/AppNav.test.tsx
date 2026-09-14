import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import AppNav from './AppNav';

// usePathname() throws outside an App Router context under RTL — the thrown error names React
// internals, not the router, so without this mock the test file fails on render in a way that
// reads like a component bug, not a missing router context (Story 1.9 Dev Notes).
const mockPathname = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

describe('AppNav', () => {
  it('renders exactly two links, Battles then Organisms, in DOM order (Story 4.1 AC1/AC7)', () => {
    mockPathname.value = '/';
    render(<AppNav />);

    // Story 1.9 AC4 / Story 4.1 AC1 — the no-dead-affordance rule is a COUNT assertion: a test
    // that only checks "Battles" and "Organisms" exist still passes after someone adds a dead
    // "Settings" link, which is exactly the failure the rule exists to prevent.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);

    expect(links[0]).toHaveAttribute('href', '/');
    // Exact, not toHaveTextContent (code review 2026-08-07): the substring form passes for
    // "Battles (soon)" or "Battles Settings", which quietly undoes the count assertion above.
    expect(links[0]).toHaveTextContent(/^Battles$/);
    expect(links[1]).toHaveAttribute('href', '/organisms');
    expect(links[1]).toHaveTextContent(/^Organisms$/);
  });

  it('on / — Battles carries aria-current="page", Organisms does not (Story 4.1 AC2)', () => {
    mockPathname.value = '/';
    render(<AppNav />);

    const battles = screen.getByRole('link', { name: 'Battles' });
    const organisms = screen.getByRole('link', { name: 'Organisms' });
    expect(battles).toHaveAttribute('aria-current', 'page');
    expect(organisms).not.toHaveAttribute('aria-current');
  });

  it('on /organisms — Organisms carries aria-current="page", Battles does not (Story 4.1 AC2)', () => {
    mockPathname.value = '/organisms';
    render(<AppNav />);

    const battles = screen.getByRole('link', { name: 'Battles' });
    const organisms = screen.getByRole('link', { name: 'Organisms' });
    expect(organisms).toHaveAttribute('aria-current', 'page');
    expect(battles).not.toHaveAttribute('aria-current');
  });

  it('on /organisms/ (trailing slash) — Organisms is still active (prefix match, Story 4.1 AC2/FD3)', () => {
    mockPathname.value = '/organisms/';
    render(<AppNav />);

    expect(screen.getByRole('link', { name: 'Organisms' })).toHaveAttribute('aria-current', 'page');
  });

  // The inactive branch never executed in CI before this test (code review 2026-08-07): the
  // pathname mock was hardcoded to '/', NAV_ITEMS had one entry whose href is '/', and the e2e
  // only ever visited '/'. So `active` was true in 100% of runs and every `active ? … : …`
  // fallback — secondary colour, transparent border, transparent background, the non-active
  // hover colour — plus the aria-current === undefined path shipped unexercised. Story 4.1
  // retargeted the path: '/organisms' was the non-matching path here and now matches, so this
  // uses '/battle' — a real route that carries no nav entry — to keep every link on the
  // inactive branch at once.
  it('on /battle — no link carries aria-current (route has no nav entry)', () => {
    mockPathname.value = '/battle';
    render(<AppNav />);

    const links = screen.getAllByRole('link');
    for (const link of links) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it('has no axe accessibility violations', async () => {
    mockPathname.value = '/';
    const { container } = render(<AppNav />);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('is keyboard-operable: Tab reaches Battles then Organisms in order (Story 4.1 AC4)', async () => {
    mockPathname.value = '/';
    const user = userEvent.setup();
    render(<AppNav />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Battles' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Organisms' })).toHaveFocus();
  });
});
