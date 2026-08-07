import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppNav from './AppNav';

// usePathname() throws outside an App Router context under RTL — the thrown error names React
// internals, not the router, so without this mock the test file fails on render in a way that
// reads like a component bug, not a missing router context (Story 1.9 Dev Notes).
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('AppNav', () => {
  it('renders exactly one link, to /, labelled Battles, carrying aria-current="page"', () => {
    render(<AppNav />);

    // AC4 / the no-dead-affordance rule is a COUNT assertion: a test that only checks "Battles"
    // exists still passes after someone adds a dead "Settings" link, which is exactly the
    // failure AC4 exists to prevent.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);

    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[0]).toHaveTextContent('Battles');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
  });
});
