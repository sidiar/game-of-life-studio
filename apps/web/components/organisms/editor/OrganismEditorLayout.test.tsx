import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import OrganismEditorLayout, { EDITOR_BREAKPOINTS } from './OrganismEditorLayout';

/**
 * Story 4.4's layout contract — STRUCTURE only, never layout. jsdom has no layout engine: every
 * `getBoundingClientRect` is zeros, `scrollHeight` is 0 and a `getComputedStyle(...).width` read
 * is `''`, so a width or scroll assertion here is `'' === ''` (Story 4.2's review class) and proves
 * nothing. The tiers, the widths and the independent scroll are `e2e/organisms.spec.ts`'s.
 */
describe('OrganismEditorLayout', () => {
  const REGION_NAMES = ['Basic Information', 'Survival Rules', 'Preview & Test'];

  /** `aria-labelledby` resolved by hand: `toHaveAccessibleName` checks one node, and the contract
   * here is the ORDER of three, which needs a plain list to compare. */
  const accessibleName = (region: HTMLElement): string => {
    const id = region.getAttribute('aria-labelledby');
    return (id && document.getElementById(id)?.textContent) || '';
  };

  it('renders three region landmarks in DOM order with the mockup section-title names', () => {
    render(<OrganismEditorLayout />);

    // One ordered read, not three separate `getByRole`s — those pass in any order, and DOM order
    // is the visual order at every tier (SC 1.3.2 / 2.4.3), so the order IS the contract.
    expect(screen.getAllByRole('region').map(accessibleName)).toEqual(REGION_NAMES);
  });

  it('names each region by exactly one level-3 heading with the same text', () => {
    render(<OrganismEditorLayout />);

    for (const region of screen.getAllByRole('region')) {
      const headings = within(region).getAllByRole('heading');
      expect(headings).toHaveLength(1);
      expect(within(region).getByRole('heading', { level: 3 })).toHaveTextContent(
        accessibleName(region),
      );
    }
  });

  it('renders each slot inside its own region and nowhere else', () => {
    render(
      <OrganismEditorLayout
        basicInfo={<div data-testid="probe-basic" />}
        rules={<div data-testid="probe-rules" />}
        preview={<div data-testid="probe-preview" />}
      />,
    );

    const [basic, rules, preview] = screen.getAllByRole('region');
    if (!basic || !rules || !preview) throw new Error('expected three regions');

    expect(within(basic).getByTestId('probe-basic')).toBeInTheDocument();
    expect(within(basic).queryByTestId('probe-rules')).toBeNull();
    expect(within(basic).queryByTestId('probe-preview')).toBeNull();

    expect(within(rules).getByTestId('probe-rules')).toBeInTheDocument();
    expect(within(rules).queryByTestId('probe-basic')).toBeNull();
    expect(within(rules).queryByTestId('probe-preview')).toBeNull();

    expect(within(preview).getByTestId('probe-preview')).toBeInTheDocument();
    expect(within(preview).queryByTestId('probe-basic')).toBeNull();
    expect(within(preview).queryByTestId('probe-rules')).toBeNull();
  });

  // No placeholder, no "coming soon" (NFR-4.1): an omitted slot leaves the column at its heading
  // pair and nothing else, so 4.5–4.15 each add content rather than replace a stand-in.
  it('renders only the heading pair in a column whose slot is omitted', () => {
    render(<OrganismEditorLayout />);

    for (const region of screen.getAllByRole('region')) {
      expect(region.children).toHaveLength(2);
      expect(region.children[0]?.tagName).toBe('H3');
      expect(region.children[1]?.tagName).toBe('P');
    }
  });

  // The e2e viewports (1440 full, 1280/1194 compressed, 1000 fold) are chosen around these two
  // numbers; pinning them here means a drift fails a unit test, not a WebKit run.
  it('exports the UX-DR5 breakpoints', () => {
    expect(EDITOR_BREAKPOINTS).toEqual({ compress: 1400, fold: 1024 });
  });

  it('has no axe violations', async () => {
    const { container } = render(<OrganismEditorLayout />);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
