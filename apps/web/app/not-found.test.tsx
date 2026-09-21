import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import NotFound from './not-found';

// AppNav reads usePathname(); on a 404 there is no matched route, and the nav simply renders
// nothing active. '/nope' stands in for "some address that matched no route".
vi.mock('next/navigation', () => ({
  usePathname: () => '/nope',
}));

describe('NotFound', () => {
  // THE regression guard. Story 2.1 moved AppShell off the root layout onto the (gallery) route
  // group, which took the shell off the 404 as a side effect — Next renders not-found.tsx under
  // the ROOT layout only, so no group layout reaches it. Every other test in the suite stayed
  // green through that regression, because none of them render this file.
  it('wears the app shell — banner, navigation and main landmark', () => {
    render(<NotFound />);

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByText(/Game of Life Studio/)).toBeInTheDocument();
  });

  // Story 4.1 AC1/AC2 (retargeted by Story 5.1): the 404 wears the shell, so it shows all three
  // nav links — and with no matched route, NONE may claim aria-current. This is the third "no
  // entry is active" surface after /battle (AppNav.test.tsx), and the only one that goes through
  // the real not-found tree.
  it('renders all three nav links with none of them current', () => {
    render(<NotFound />);

    const links = screen.getByRole('navigation').querySelectorAll('a');
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it('owns the document heading and offers a way back to the Gallery', () => {
    const { container } = render(<NotFound />);

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page Not Found');
    expect(screen.getByRole('link', { name: 'Back to Gallery' })).toHaveAttribute('href', '/');
  });

  // "Gone" and "broken" are different facts. This copy must not read as data corruption — the
  // battle route's error notice ("Its stored data may be damaged") is the one that means that,
  // and a mistyped URL is not evidence of it.
  it('explains a mistyped address, not damaged data', () => {
    render(<NotFound />);

    expect(screen.getByText(/does not match anything in the studio/)).toBeInTheDocument();
    expect(screen.queryByText(/damaged/)).not.toBeInTheDocument();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<NotFound />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
