import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    render(<OrganismCard organism={CONWAYS_CLASSIC} />);

    expect(screen.getByRole('heading', { level: 2, name: "Conway's Classic" })).toBeInTheDocument();
  });

  it('paints the chip with the LUT-resolved identity-shade colour, never a literal hex', () => {
    const { container } = render(<OrganismCard organism={CONWAYS_CLASSIC} />);

    const chip = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(chip.style.background).toBe(
      jsdomNormalizedColor(displayColor(CONWAYS_CLASSIC.colorToken, MAX_AGE_SHADE)),
    );
  });

  it('renders Dominance and Aging from the record', () => {
    const [, patientDefender] = createMockOrganisms();

    render(<OrganismCard organism={patientDefender} />);

    expect(screen.getByText('Dominance')).toBeInTheDocument();
    expect(screen.getByText(String(patientDefender.dominance))).toBeInTheDocument();
    expect(screen.getByText('Aging')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('renders "No" for a non-aging organism', () => {
    render(<OrganismCard organism={CONWAYS_CLASSIC} />);

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

    render(<OrganismCard organism={organism} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the SYSTEM tag and data-system when system is true', () => {
    const { container } = render(<OrganismCard organism={CONWAYS_CLASSIC} system />);

    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
    expect(container.querySelector('article')).toHaveAttribute('data-system', '');
  });

  it('renders neither the SYSTEM tag nor data-system by default', () => {
    const { container } = render(<OrganismCard organism={CONWAYS_CLASSIC} />);

    expect(screen.queryByText('SYSTEM')).not.toBeInTheDocument();
    expect(container.querySelector('article')).not.toHaveAttribute('data-system');
  });

  it('is a keyboard-focusable tab stop named after the organism', () => {
    render(<OrganismCard organism={CONWAYS_CLASSIC} />);

    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('tabIndex', '0');
    expect(article).toHaveAccessibleName("Conway's Classic");
  });

  it('renders "Unnamed organism" for an all-whitespace name', () => {
    const unnamed = { ...CONWAYS_CLASSIC, name: '   ' };

    render(<OrganismCard organism={unnamed} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Unnamed organism' })).toBeInTheDocument();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<OrganismCard organism={CONWAYS_CLASSIC} system />);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
