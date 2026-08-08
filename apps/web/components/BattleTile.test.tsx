import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { TileOrganism } from '@/lib/tileOrganisms';
import BattleTile from './BattleTile';

function organism(overrides: Partial<TileOrganism> & { id: string }): TileOrganism {
  return { name: 'Organism', color: 'hsl(200, 80%, 50%)', ...overrides };
}

const BASE_PROPS = {
  name: 'Three-Way Skirmish',
  gridSize: { cols: 50, rows: 30 },
  updatedAt: new Date('2026-07-25T18:15:00.000Z'),
  organisms: [
    organism({ id: 'a', name: 'Aggressive Colonizer' }),
    organism({ id: 'b', name: 'Patient Defender' }),
    organism({ id: 'c', name: 'Chaotic Spreader' }),
  ] as TileOrganism[],
};

describe('BattleTile', () => {
  it('renders the battle name as a level-2 heading', () => {
    render(<BattleTile {...BASE_PROPS} />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Three-Way Skirmish' }),
    ).toBeInTheDocument();
  });

  it('renders the grid-size stat, not a cycle count (forced decision 2)', () => {
    render(<BattleTile {...BASE_PROPS} />);
    expect(screen.getByText('50 × 30')).toBeInTheDocument();
  });

  it('renders the single last-modified date, with no visible organism-count text', () => {
    render(<BattleTile {...BASE_PROPS} />);
    expect(screen.getByText('Jul 25, 2026')).toBeInTheDocument();
    expect(screen.queryByText(/organisms?$/)).not.toBeInTheDocument();
  });

  // Each dot is a real, individually-labelled control — the accessible-name check that a mouse-
  // only CSS tooltip (the mockup's ::before pattern) could never pass.
  it('gives each organism dot its own accessible name via a real button', () => {
    render(<BattleTile {...BASE_PROPS} />);

    expect(screen.getByRole('button', { name: 'Aggressive Colonizer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Patient Defender' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chaotic Spreader' })).toBeInTheDocument();
  });

  it('is keyboard-focusable through the dots (AC5)', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Aggressive Colonizer' })).toHaveFocus();
  });

  it('dismisses on Escape (WCAG 1.4.13 dismissible) by blurring the focused dot', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);

    const dot = screen.getByRole('button', { name: 'Aggressive Colonizer' });
    await user.tab();
    expect(dot).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(dot).not.toHaveFocus();
  });

  it('caps the visible dots at 6 and folds the rest into a "+n" control whose accessible name lists every remaining organism', () => {
    const tenOrganisms = Array.from({ length: 10 }, (_, i) =>
      organism({ id: `id-${i}`, name: `Organism ${i}` }),
    );
    render(<BattleTile {...BASE_PROPS} organisms={tenOrganisms} />);

    for (let i = 0; i < 6; i++) {
      expect(screen.getByRole('button', { name: `Organism ${i}` })).toBeInTheDocument();
    }
    for (let i = 6; i < 10; i++) {
      expect(screen.queryByRole('button', { name: `Organism ${i}` })).not.toBeInTheDocument();
    }

    const more = screen.getByRole('button', {
      name: /4 more organisms: Organism 6, Organism 7, Organism 8, Organism 9/,
    });
    expect(more).toHaveTextContent('+4');
  });

  it('renders the fallback organism dot without throwing (dangling id)', () => {
    render(
      <BattleTile
        {...BASE_PROPS}
        organisms={[organism({ id: 'ghost', name: 'Unknown organism' })]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Unknown organism' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<BattleTile {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations with an overflowing roster', async () => {
    const tenOrganisms = Array.from({ length: 10 }, (_, i) =>
      organism({ id: `id-${i}`, name: `Organism ${i}` }),
    );
    const { container } = render(<BattleTile {...BASE_PROPS} organisms={tenOrganisms} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
