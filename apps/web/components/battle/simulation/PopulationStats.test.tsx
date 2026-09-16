import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { createMockOrganisms } from '@gol/test-utils';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import type { PopulationEntry } from '@/lib/battle/useSimulation';
import PopulationStats, { type PopulationStatsProps } from './PopulationStats';

/**
 * The component's contract is "render what you are given, in that order" — fixture entries are
 * hand-built `PopulationEntry` literals, NOT produced through `derivePopulation` (its own tests,
 * Story 3.10, own the sort). `createMockOrganisms()` supplies the names/tokens so the fixtures
 * read like real data without re-deriving anything.
 */
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

function renderStats(entries: readonly PopulationEntry[], totalLiving = 0) {
  const props: PopulationStatsProps = { entries, totalLiving };
  return render(<PopulationStats {...props} />);
}

describe('PopulationStats (Story 3.14)', () => {
  // Task 1 (a): a DELIBERATELY unsorted input — DOM order must equal prop order. This reddens
  // under a `.sort` in the component (M2: the hook's order is the contract).
  it('renders one listitem per entry, in prop order, never re-sorted', () => {
    const extinctEntry = entry({
      organismId: chaotic.id,
      name: chaotic.name,
      colorToken: chaotic.colorToken,
      count: 0,
      pct: 0,
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

    renderStats([extinctEntry, countOne, countNine], 10);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText(chaotic.name)).toBeInTheDocument();
    expect(within(rows[1]).getByText(patient.name)).toBeInTheDocument();
    expect(within(rows[2]).getByText(aggressive.name)).toBeInTheDocument();
  });

  // Task 1 (b): rounded percent text; trap 4 — a living organism can round to 0% with no skull.
  it.each([
    [10, 33.333333, '10 (33%)'],
    [20, 66.666666, '20 (67%)'],
    [1, 0.4, '1 (0%)'],
  ])('renders "%s (%s%%)" as "%s"', (count, pct, expected) => {
    renderStats([entry({ count, pct })], count);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText(expected)).toBeInTheDocument();
    expect(within(row).queryByRole('img', { name: 'extinct' })).not.toBeInTheDocument();
  });

  // Task 1 (c): thousands separator, pinned locale (2.14 trap 10).
  it('formats a four-digit count with a thousands separator', () => {
    renderStats([entry({ count: 1234, pct: 100 })], 1234);

    expect(screen.getByText('1,234 (100%)')).toBeInTheDocument();
  });

  // Task 1 (d): the extinct row carries the named skull, a transparent swatch and a 0%-width fill;
  // a living row has neither the skull nor a hollow swatch.
  it('marks an extinct entry with a hollow swatch, the named skull, and a 0% bar fill', () => {
    const { container } = renderStats(
      [entry({ organismId: chaotic.id, name: chaotic.name, count: 0, pct: 0, extinct: true })],
      0,
    );

    const row = screen.getByRole('listitem');
    expect(within(row).getByRole('img', { name: 'extinct' })).toHaveTextContent('☠');
    const swatch = container.querySelector('span[aria-hidden="true"]');
    expect(swatch).toHaveStyle({ background: 'transparent' });
    const fill = container.querySelector('div[aria-hidden="true"] > div');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('does not mark a living entry with the skull image', () => {
    renderStats([entry({ count: 4, pct: 100 })], 4);

    expect(screen.queryByRole('img', { name: 'extinct' })).not.toBeInTheDocument();
  });

  // Task 1 (e): swatch and fill colour equal the identity-shade LUT for the entry's token; fill
  // width is the UNROUNDED pct.
  it('colours the swatch and bar fill with the identity shade of the entry token', () => {
    const { container } = renderStats(
      [entry({ colorToken: patient.colorToken, count: 1, pct: 33.333333 })],
      1,
    );
    const color = displayColor(patient.colorToken, MAX_AGE_SHADE);

    const swatch = container.querySelector('span[aria-hidden="true"]');
    expect(swatch).toHaveStyle({ background: color, borderColor: color });
    const fill = container.querySelector('div[aria-hidden="true"] > div');
    expect(fill).toHaveStyle({ background: color, width: '33.333333%' });
  });

  // Task 1 (f): swatch and track are decorative.
  it('hides the swatch and the bar track from assistive technology', () => {
    const { container } = renderStats([entry({ count: 1, pct: 100 })], 1);

    expect(container.querySelector('span[aria-hidden="true"]')).toBeInTheDocument();
    expect(container.querySelector('div[aria-hidden="true"]')).toBeInTheDocument();
  });

  // Task 1 (g): the total row always reads `totalLiving`, formatted.
  it('shows the formatted totalLiving in the Total Living Cells row', () => {
    renderStats([entry({ count: 1000, pct: 100 })], 1000);

    expect(screen.getByText('Total Living Cells')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
  });

  // Task 1 (h): an empty roster renders the stated placeholder, never a bare empty list.
  it('renders the empty-battle placeholder and a zero total when entries is empty', () => {
    renderStats([], 0);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('No organisms in this battle')).toBeInTheDocument();
    expect(screen.getByText('Total Living Cells')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // Trap 5: WebKit drops list semantics from `list-style: none` — the explicit role is
  // load-bearing, so pin the ATTRIBUTE, not just the resolved role.
  it('carries an explicit role="list" on the <ul>', () => {
    renderStats([entry({ count: 1, pct: 100 })], 1);

    expect(screen.getByRole('list')).toHaveAttribute('role', 'list');
  });

  // AC8: axe-clean with a living/extinct mix (the one row shape that puts text-secondary beside
  // text-primary and adds the skull `img`), all-extinct, and empty.
  it('has no axe violations mixed, all-extinct, or empty', async () => {
    const mixed = [
      entry({ count: 4, pct: 100 }),
      entry({ organismId: chaotic.id, name: chaotic.name, count: 0, pct: 0, extinct: true }),
    ];
    const allExtinct = [entry({ count: 0, pct: 0, extinct: true })];
    const cases: ReadonlyArray<readonly [readonly PopulationEntry[], number]> = [
      [mixed, 4],
      [allExtinct, 0],
      [[], 0],
    ];
    for (const [entries, totalLiving] of cases) {
      const { container, unmount } = renderStats(entries, totalLiving);
      expect((await axe(container)).violations).toEqual([]);
      unmount();
    }
  });
});
