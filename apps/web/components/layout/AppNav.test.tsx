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
  it('renders exactly two links, Battles then Organisms, in DOM order (AC1/AC7)', () => {
    mockPathname.value = '/';
    render(<AppNav />);

    // AC1 / the no-dead-affordance rule is a COUNT assertion: a test that only checks "Battles"
    // and "Organisms" exist still passes after someone adds a dead "Settings" link, which is
    // exactly the failure AC1 exists to prevent.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);

    expect(links[0]).toHaveAttribute('href', '/');
    // Exact, not toHaveTextContent (code review 2026-08-07): the substring form passes for
    // "Battles (soon)" or "Battles Settings", which quietly undoes the count assertion above.
    expect(links[0]).toHaveTextContent(/^Battles$/);
    expect(links[1]).toHaveAttribute('href', '/organisms');
    expect(links[1]).toHaveTextContent(/^Organisms$/);
  });

  it('on / — Battles carries aria-current="page", Organisms does not (AC2)', () => {
    mockPathname.value = '/';
    render(<AppNav />);

    const battles = screen.getByRole('link', { name: 'Battles' });
    const organisms = screen.getByRole('link', { name: 'Organisms' });
    expect(battles).toHaveAttribute('aria-current', 'page');
    expect(organisms).not.toHaveAttribute('aria-current');
  });

  it('on /organisms — Organisms carries aria-current="page", Battles does not (AC2)', () => {
    mockPathname.value = '/organisms';
    render(<AppNav />);

    const battles = screen.getByRole('link', { name: 'Battles' });
    const organisms = screen.getByRole('link', { name: 'Organisms' });
    expect(organisms).toHaveAttribute('aria-current', 'page');
    expect(battles).not.toHaveAttribute('aria-current');
  });

  it('on /organisms/ (trailing slash) — Organisms is still active (prefix match, AC2/FD3)', () => {
    mockPathname.value = '/organisms/';
    render(<AppNav />);

    expect(screen.getByRole('link', { name: 'Organisms' })).toHaveAttribute('aria-current', 'page');
  });

  // The retarget of the pre-4.1 "omits aria-current when the route does not match" test
  // (code review 2026-08-07): '/organisms' was the non-matching path there, and now matches, so
  // this uses '/battle' — a real route that carries no nav entry — to keep exercising the
  // inactive branch on every link.
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

  it('is keyboard-operable: Tab reaches Battles then Organisms in order (AC4)', async () => {
    mockPathname.value = '/';
    const user = userEvent.setup();
    render(<AppNav />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Battles' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Organisms' })).toHaveFocus();
  });
});
