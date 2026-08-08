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
  createdAt: new Date('2026-07-20T09:00:00.000Z'),
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

  it('starts with the disclosure collapsed', () => {
    render(<BattleTile {...BASE_PROPS} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Created')).not.toBeInTheDocument();
  });

  it('expands on click, revealing both dates and every organism name', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);

    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Modified')).toBeInTheDocument();
    // Both dates appear in the panel's <dl>; "Jul 25, 2026" also appears in the tile footer
    // (the always-visible updatedAt), so two occurrences total is the correct count here.
    expect(screen.getAllByText('Jul 20, 2026')).toHaveLength(1);
    expect(screen.getAllByText('Jul 25, 2026')).toHaveLength(2);
    expect(screen.getByText('Aggressive Colonizer')).toBeInTheDocument();
    expect(screen.getByText('Patient Defender')).toBeInTheDocument();
    expect(screen.getByText('Chaotic Spreader')).toBeInTheDocument();
  });

  it('expands on Enter and on Space via the keyboard (AC5)', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Enter}');
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard(' ');
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('caps the visible dots at 6 and shows "+n more", but the panel lists every organism', async () => {
    const user = userEvent.setup();
    const tenOrganisms = Array.from({ length: 10 }, (_, i) =>
      organism({ id: `id-${i}`, name: `Organism ${i}` }),
    );
    render(<BattleTile {...BASE_PROPS} organisms={tenOrganisms} />);

    expect(screen.getByText('+4 more')).toBeInTheDocument();
    expect(screen.getByText('10 organisms')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    tenOrganisms.forEach((o) => {
      expect(screen.getByText(o.name)).toBeInTheDocument();
    });
  });

  it('renders the fallback organism without throwing (dangling id)', () => {
    render(
      <BattleTile
        {...BASE_PROPS}
        organisms={[organism({ id: 'ghost', name: 'Unknown organism' })]}
      />,
    );
    expect(screen.getByText('1 organism')).toBeInTheDocument();
  });

  it('formats an absent createdAt as the stable placeholder in the panel', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} createdAt={undefined} />);

    await user.click(screen.getByRole('button'));
    expect(screen.getAllByText('Unknown')).toHaveLength(1);
  });

  it('has no axe violations, collapsed', async () => {
    const { container } = render(<BattleTile {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations, expanded', async () => {
    const user = userEvent.setup();
    const { container } = render(<BattleTile {...BASE_PROPS} />);
    await user.click(screen.getByRole('button'));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
