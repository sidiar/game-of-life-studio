import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import AppShell from './AppShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('AppShell', () => {
  it('renders one banner, one navigation, and one main landmark', () => {
    render(
      <AppShell>
        <p>page content</p>
      </AppShell>,
    );

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('renders the logo text', () => {
    render(
      <AppShell>
        <p>page content</p>
      </AppShell>,
    );

    expect(screen.getByText(/Game of Life Studio/)).toBeInTheDocument();
  });

  // The actual guard for forced decision 5 (code review 2026-08-07). axe-core has no
  // duplicate-h1 rule, so before this test the shell's wordmark could be changed from
  // styled('div') to styled('h1') with every other assertion in the repo still green — the
  // landmark counts, the logo text match, "Battle Gallery" in page.test.tsx and home.spec.ts,
  // and both axe runs all pass with two <h1>s on the page.
  it('renders the wordmark as a non-heading, leaving the page to own the only h1', () => {
    const { container } = render(
      <AppShell>
        <h1>Battle Gallery</h1>
      </AppShell>,
    );

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Battle Gallery');
    expect(screen.getByText(/Game of Life Studio/).tagName).not.toMatch(/^H[1-6]$/);
  });

  it('passes children through into the main landmark', () => {
    render(
      <AppShell>
        <p>page content</p>
      </AppShell>,
    );

    expect(screen.getByRole('main')).toHaveTextContent('page content');
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(
      <AppShell>
        <p>page content</p>
      </AppShell>,
    );
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
