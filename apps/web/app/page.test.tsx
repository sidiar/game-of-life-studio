import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import HomePage from './page';

// Wiring proof for the toolchain, not a feature test: rendering the Story 1.1
// placeholder home page under Vitest exercises Vitest + React Testing Library +
// jsdom + @vitejs/plugin-react + the @gol/domain workspace-source import path
// (Vitest's parity with Next's transpilePackages) all at once.
describe('HomePage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('renders the placeholder gallery copy wired through @gol/domain', () => {
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Game of Life Studio' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Battle Gallery coming soon.')).toBeInTheDocument();

    // The field count is read off the real OrganismSchema (Story 1.3), so matching a
    // number here proves the workspace package resolved to its TS source under Vitest.
    // Asserting only the literal text would pass even if the import were dead.
    expect(container.textContent).toMatch(/wired to @gol\/domain \(\d+ organism fields\)/);
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<HomePage />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Story 1.5 AC1: a first render against empty localStorage seeds DEFAULT_WORKSPACE.
  it('seeds gol:organisms with conways-classic on first render', async () => {
    render(<HomePage />);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(stored).toHaveProperty(CONWAYS_CLASSIC_ID);
    });
  });

  // Story 1.5 AC2: a second render (mount) against an already-seeded store adds no duplicate.
  it('adds no duplicate organism on a second render', async () => {
    const first = render(<HomePage />);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(stored).toHaveProperty(CONWAYS_CLASSIC_ID);
    });
    first.unmount();

    render(<HomePage />);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(Object.keys(stored)).toEqual([CONWAYS_CLASSIC_ID]);
    });
  });
});
