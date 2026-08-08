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

// The tooltip's visibility is a data attribute rather than a class so the assertion does not
// depend on Emotion's generated names; jsdom cannot compute opacity, so this attribute IS the
// observable state in unit tests (the real opacity transition is asserted in gallery.spec.ts).
function tooltipOf(marker: HTMLElement): HTMLElement {
  const tooltip = marker.nextElementSibling;
  if (!(tooltip instanceof HTMLElement)) throw new Error('marker has no tooltip sibling');
  return tooltip;
}

describe('BattleTile', () => {
  it('renders the battle name as a level-2 heading', () => {
    render(<BattleTile {...BASE_PROPS} />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Three-Way Skirmish' }),
    ).toBeInTheDocument();
  });

  it('falls back to a placeholder title rather than rendering an empty heading', () => {
    render(<BattleTile {...BASE_PROPS} name="   " />);
    expect(screen.getByRole('heading', { level: 2, name: 'Untitled battle' })).toBeInTheDocument();
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

  // Each dot is individually named — the accessible-name check a mouse-only CSS tooltip (the
  // mockup's ::before pattern) could never pass. role="img", not button: the dot has no activation
  // behaviour, so a button would announce an action that does not exist.
  it('gives each organism dot its own accessible name, and no dot is a button', () => {
    render(<BattleTile {...BASE_PROPS} />);

    expect(screen.getByRole('img', { name: 'Aggressive Colonizer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Patient Defender' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Chaotic Spreader' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('is keyboard-focusable through the dots (AC5)', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);

    await user.tab();
    expect(screen.getByRole('img', { name: 'Aggressive Colonizer' })).toHaveFocus();
  });

  it('reveals the tooltip on focus and on pointer hover (WCAG 1.4.13)', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);
    const dot = screen.getByRole('img', { name: 'Aggressive Colonizer' });

    expect(tooltipOf(dot)).not.toHaveAttribute('data-open');

    await user.tab();
    expect(tooltipOf(dot)).toHaveAttribute('data-open');

    await user.tab();
    expect(tooltipOf(dot)).not.toHaveAttribute('data-open');

    await user.hover(dot);
    expect(tooltipOf(dot)).toHaveAttribute('data-open');
  });

  // SC 1.4.13 "dismissible" requires dismissal WITHOUT moving focus — an earlier implementation
  // blurred the trigger, which dropped the user at <body> and restarted the tab order.
  it('dismisses the tooltip on Escape while keeping focus on the dot', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);
    const dot = screen.getByRole('img', { name: 'Aggressive Colonizer' });

    await user.tab();
    expect(dot).toHaveFocus();
    expect(tooltipOf(dot)).toHaveAttribute('data-open');

    await user.keyboard('{Escape}');
    expect(tooltipOf(dot)).not.toHaveAttribute('data-open');
    expect(dot).toHaveFocus();
  });

  // A pointer user has no focused element to receive the keydown, which is why the listener is on
  // document rather than on the trigger.
  it('dismisses a hover-triggered tooltip on Escape', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);
    const dot = screen.getByRole('img', { name: 'Aggressive Colonizer' });

    await user.hover(dot);
    expect(tooltipOf(dot)).toHaveAttribute('data-open');

    await user.keyboard('{Escape}');
    expect(tooltipOf(dot)).not.toHaveAttribute('data-open');
  });

  it('caps the visible dots at 6 and folds the rest into a "+n" control whose accessible name lists every remaining organism', () => {
    const tenOrganisms = Array.from({ length: 10 }, (_, i) =>
      organism({ id: `id-${i}`, name: `Organism ${i}` }),
    );
    render(<BattleTile {...BASE_PROPS} organisms={tenOrganisms} />);

    for (let i = 0; i < 6; i++) {
      expect(screen.getByRole('img', { name: `Organism ${i}` })).toBeInTheDocument();
    }
    for (let i = 6; i < 10; i++) {
      expect(screen.queryByRole('img', { name: `Organism ${i}` })).not.toBeInTheDocument();
    }

    const more = screen.getByRole('img', {
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
    expect(screen.getByRole('img', { name: 'Unknown organism' })).toBeInTheDocument();
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

  it('has no axe violations with an empty battle name', async () => {
    const { container } = render(<BattleTile {...BASE_PROPS} name="" />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
