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
