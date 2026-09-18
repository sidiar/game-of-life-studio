import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { createMockOrganisms } from '@gol/test-utils';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import type { PopulationEntry } from '@/lib/battle/useSimulation';
import PopulationPills from './PopulationPills';

// The `PopulationStats.test.tsx` fixture shape: hand-built `PopulationEntry` literals, never
// produced through `derivePopulation` (Story 3.10's own tests own the sort).
const [aggressive, patient, chaotic] = createMockOrganisms();

function entry(overrides: Partial<PopulationEntry>): PopulationEntry {
  return {
    organismId: aggressive.id,
    name: aggressive.name,
    colorToken: aggressive.colorToken,
    count: 0,
    pct: 0,
    extinct: false,
    ...overrides,
  };
}

describe('PopulationPills (Story 3.18, AC8)', () => {
  // A DELIBERATELY unsorted input — DOM order must equal prop order (M2: the hook's order is the
  // contract). Reddens under a `.sort` in the component.
  it('renders one pill per entry, in prop order, never re-sorted', () => {
    const extinctEntry = entry({
      organismId: chaotic.id,
      name: chaotic.name,
      colorToken: chaotic.colorToken,
      extinct: true,
    });
    const countOne = entry({
      organismId: patient.id,
      name: patient.name,
      colorToken: patient.colorToken,
      count: 1,
      pct: 10,
    });
    const countNine = entry({ count: 9, pct: 90 });

    render(<PopulationPills entries={[extinctEntry, countOne, countNine]} />);

    const list = screen.getByRole('list', { name: 'Population' });
    const pills = within(list).getAllByRole('listitem');
    expect(pills).toHaveLength(3);
    expect(pills.map((pill) => pill.textContent)).toEqual([
      'Chaotic Spreader 0☠',
      'Patient Defender 1',
      'Aggressive Colonizer 9',
    ]);
  });

  // The name reaches assistive technology through `<VisuallyHidden>`, the count as visible text,
  // and the skull as a named `img` — so what a screen reader hears for a pill is `${name}
  // ${count}` (+ `extinct`), never the count alone. Asserted as the item's TEXT plus the hidden
  // span and the named img rather than as an accessible NAME: `listitem` is not a
  // name-from-content role, so `toHaveAccessibleName` on an `<li>` is always empty — it would
  // pass trivially for an unnamed pill and prove nothing.
  it('reads `${name} ${count}` to assistive technology, plus `extinct` for an extinct entry', () => {
    render(
      <PopulationPills
        entries={[
          entry({ count: 127, pct: 100 }),
          entry({
            organismId: chaotic.id,
            name: chaotic.name,
            colorToken: chaotic.colorToken,
            extinct: true,
          }),
        ]}
      />,
    );

    const [living, extinct] = screen.getAllByRole('listitem');
    expect(living).toHaveTextContent('Aggressive Colonizer 127');
    expect(extinct).toHaveTextContent('Chaotic Spreader 0');
    // The name is in the tree (a hidden-by-clip span, NOT `aria-hidden`), the count is visible
    // text beside it.
    expect(within(living).getByText('Aggressive Colonizer')).not.toHaveAttribute('aria-hidden');
    expect(within(living).getByText('127')).toBe(living);
    expect(within(extinct).getByRole('img', { name: 'extinct' })).toBeInTheDocument();
    expect(within(living).queryByRole('img', { name: 'extinct' })).not.toBeInTheDocument();
  });

  // 3.14 FD4: colour on the swatch ONLY, via inline style — never on the text. 3.14 FD2: an
  // extinct pill goes hollow (transparent background, coloured border) and steps its text to
  // text-secondary via `data-extinct`, never `opacity`.
  it('colours the swatch alone, hollow and skulled on an extinct entry, with no opacity step', () => {
    render(
      <PopulationPills
        entries={[
          entry({ count: 5, pct: 100 }),
          entry({
            organismId: chaotic.id,
            name: chaotic.name,
            colorToken: chaotic.colorToken,
            extinct: true,
          }),
        ]}
      />,
    );

    const [living, extinct] = screen.getAllByRole('listitem');
    const livingSwatch = living.querySelector('span[aria-hidden="true"]');
    const extinctSwatch = extinct.querySelector('span[aria-hidden="true"]');
    const livingColor = displayColor(aggressive.colorToken, MAX_AGE_SHADE);
    const extinctColor = displayColor(chaotic.colorToken, MAX_AGE_SHADE);
    expect(livingSwatch).toHaveStyle({ background: livingColor, borderColor: livingColor });
    expect(extinctSwatch).toHaveStyle({ background: 'transparent', borderColor: extinctColor });
    expect(living).toHaveAttribute('data-extinct', 'false');
    expect(extinct).toHaveAttribute('data-extinct', 'true');
    // No inline colour on the pill itself (FD4) and no opacity step on the extinct one (FD2).
    expect(living.getAttribute('style')).toBeNull();
    expect(extinct.getAttribute('style')).toBeNull();
  });

  // The 3.14 rule: `en-US` grouping, so a four-digit count reads `1,234` on every locale.
  it('groups the count with en-US separators', () => {
    render(<PopulationPills entries={[entry({ count: 1234, pct: 100 })]} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('Aggressive Colonizer 1,234');
  });

  // An empty roster renders NOTHING — no empty `<ul>`, no placeholder copy (that copy is the
  // sidebar's, `<PopulationStats>`'s "No organisms in this battle").
  it('renders no list at all for an empty roster', () => {
    const { container } = render(<PopulationPills entries={[]} />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('has no axe violations with living and extinct pills', async () => {
    const { container } = render(
      <PopulationPills
        entries={[
          entry({ count: 127, pct: 60 }),
          entry({
            organismId: patient.id,
            name: patient.name,
            colorToken: patient.colorToken,
            count: 89,
            pct: 40,
          }),
          entry({
            organismId: chaotic.id,
            name: chaotic.name,
            colorToken: chaotic.colorToken,
            extinct: true,
          }),
        ]}
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
