import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import OrganismCard from './OrganismCard';

// jsdom normalises an inline `hsl(...)`/hex `style.background` to `rgb(...)` on the way in
// (`OrganismRoster.test.tsx`'s identical comment) — round-tripping the LUT's own hsl string
// through a throwaway element gives the SAME normalisation the component's own inline style went
// through, rather than hand-converting hsl to rgb here.
function jsdomNormalizedColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.background = color;
  return probe.style.background;
}

describe('OrganismCard', () => {
  it('renders the organism name as a level-2 heading', () => {
    render(<OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: "Conway's Classic" })).toBeInTheDocument();
  });

  it('paints the chip with the LUT-resolved identity-shade colour, never a literal hex', () => {
    const { container } = render(
      <OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} />,
    );

    const chip = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    // Guard first: if jsdom failed to parse the LUT's hsl string, BOTH sides would be '' and the
    // equality below would pass on nothing.
    expect(chip.style.background).not.toBe('');
    expect(chip.style.background).toBe(
      jsdomNormalizedColor(displayColor(CONWAYS_CLASSIC.colorToken, MAX_AGE_SHADE)),
    );
  });

  it('renders Dominance and Aging from the record', () => {
    const [, patientDefender] = createMockOrganisms();

    render(<OrganismCard organism={patientDefender} onRequestEdit={vi.fn()} />);

    expect(screen.getByText('Dominance')).toBeInTheDocument();
    expect(screen.getByText(String(patientDefender.dominance))).toBeInTheDocument();
    expect(screen.getByText('Aging')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('renders "No" for a non-aging organism', () => {
    render(<OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} />);

    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it.each([
    [0, 'No rules'],
    [1, '1 rule'],
    [2, '2 rules'],
  ] as const)('shows "%s" -> "%s" as the rule-count label', (count, label) => {
    const organism = {
      ...CONWAYS_CLASSIC,
      survivalRules: CONWAYS_CLASSIC.survivalRules.slice(0, count),
    };

    render(<OrganismCard organism={organism} onRequestEdit={vi.fn()} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the SYSTEM tag and data-system when system is true', () => {
    const { container } = render(
      <OrganismCard organism={CONWAYS_CLASSIC} system onRequestEdit={vi.fn()} />,
    );

    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
    expect(container.querySelector('article')).toHaveAttribute('data-system', '');
  });

  it('renders neither the SYSTEM tag nor data-system by default', () => {
    const { container } = render(
      <OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} />,
    );

    expect(screen.queryByText('SYSTEM')).not.toBeInTheDocument();
    expect(container.querySelector('article')).not.toHaveAttribute('data-system');
  });

  // Story 4.17 (AC7): the Edit button is the card's ONE keyboard stop; the article keeps its name
  // (it still labels the region) but is no longer focusable — a stop wrapping a stop is noise.
  it('the article is not a tab stop; the Edit button is, named "Edit <name>" and keyed by the organism id', () => {
    render(<OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={vi.fn()} />);

    const article = screen.getByRole('article');
    expect(article).not.toHaveAttribute('tabIndex');
    expect(article).toHaveAccessibleName("Conway's Classic");
    const edit = screen.getByRole('button', { name: "Edit Conway's Classic" });
    expect(edit).toBeEnabled();
    expect(edit).toHaveAttribute('data-edit-organism-id', CONWAYS_CLASSIC.id);
    expect(edit).toHaveTextContent('Edit');
  });

  it('names the Edit button after the display name for an all-whitespace name', () => {
    render(<OrganismCard organism={{ ...CONWAYS_CLASSIC, name: '   ' }} onRequestEdit={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Edit Unnamed organism' })).toBeInTheDocument();
  });

  it('a click on Edit calls onRequestEdit exactly once, with no arguments', async () => {
    const user = userEvent.setup();
    const onRequestEdit = vi.fn();
    render(<OrganismCard organism={CONWAYS_CLASSIC} onRequestEdit={onRequestEdit} />);

    await user.click(screen.getByRole('button', { name: "Edit Conway's Classic" }));

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit).toHaveBeenCalledWith();
  });

  // M9 protects Conway's Classic from DELETION, not editing — the mockup renders its Edit enabled.
  it('the SYSTEM card renders Edit enabled', () => {
    render(<OrganismCard organism={CONWAYS_CLASSIC} system onRequestEdit={vi.fn()} />);

    expect(screen.getByRole('button', { name: "Edit Conway's Classic" })).toBeEnabled();
  });

  it('renders "Unnamed organism" for an all-whitespace name', () => {
    const unnamed = { ...CONWAYS_CLASSIC, name: '   ' };

    render(<OrganismCard organism={unnamed} onRequestEdit={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Unnamed organism' })).toBeInTheDocument();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(
      <OrganismCard organism={CONWAYS_CLASSIC} system onRequestEdit={vi.fn()} />,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
