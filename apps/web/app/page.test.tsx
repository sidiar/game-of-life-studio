import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import HomePage from './page';

// Wiring proof for the toolchain, not a feature test: rendering the Story 1.1
// placeholder home page under Vitest exercises Vitest + React Testing Library +
// jsdom + @vitejs/plugin-react + the @gol/domain workspace-source import path
// (Vitest's parity with Next's transpilePackages) all at once.
describe('HomePage', () => {
  it('renders the placeholder gallery copy wired through @gol/domain', () => {
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Game of Life Studio' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Battle Gallery coming soon.')).toBeInTheDocument();

    // The '@gol/domain' text is GOL_DOMAIN — its presence proves the workspace
    // package resolves to its TS source under Vitest.
    expect(container.textContent).toContain('wired to @gol/domain');
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<HomePage />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
