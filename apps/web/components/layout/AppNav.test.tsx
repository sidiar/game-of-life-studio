import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppNav from './AppNav';

// usePathname() throws outside an App Router context under RTL — the thrown error names React
// internals, not the router, so without this mock the test file fails on render in a way that
// reads like a component bug, not a missing router context (Story 1.9 Dev Notes).
const mockPathname = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

describe('AppNav', () => {
  it('renders exactly one link, to /, labelled Battles, carrying aria-current="page"', () => {
    mockPathname.value = '/';
    render(<AppNav />);

    // AC4 / the no-dead-affordance rule is a COUNT assertion: a test that only checks "Battles"
    // exists still passes after someone adds a dead "Settings" link, which is exactly the
    // failure AC4 exists to prevent.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);

    expect(links[0]).toHaveAttribute('href', '/');
    // Exact, not toHaveTextContent (code review 2026-08-07): the substring form passes for
    // "Battles (soon)" or "Battles Settings", which quietly undoes the count assertion above.
    expect(links[0]).toHaveTextContent(/^Battles$/);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
  });

  // The inactive branch never executed in CI before this test (code review 2026-08-07): the
  // pathname mock was hardcoded to '/', NAV_ITEMS has one entry whose href is '/', and the e2e
  // only ever visits '/'. So `active` was true in 100% of runs and every `active ? … : …`
  // fallback — secondary colour, transparent border, transparent background, the non-active
  // hover colour — plus the aria-current === undefined path shipped unexercised.
  it('omits aria-current when the route does not match', () => {
    mockPathname.value = '/organisms';
    render(<AppNav />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).not.toHaveAttribute('aria-current');
  });
});
