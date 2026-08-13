import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import GalleryEmptyState from './GalleryEmptyState';

describe('GalleryEmptyState', () => {
  it('renders the designed empty-state heading, explanation and prompt (AC1)', () => {
    render(<GalleryEmptyState />);

    expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    // "what is this app" explanation (NFR-4.1) — matched by substring, not the exact copy, so a
    // wording tweak does not break this test; the AC is "an explanation exists", not its prose.
    expect(screen.getByText(/cellular battles/i)).toBeInTheDocument();
    // FR-7.4's prompt copy.
    expect(screen.getByText(/create your first battle/i)).toBeInTheDocument();
  });

  it('renders the decorative glyph as aria-hidden, not as an accessible name (forced decision 3)', () => {
    const { container } = render(<GalleryEmptyState />);

    // Not reachable by role or accessible name — every fact it conveys is already text nearby.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const icon = container.querySelector('[aria-hidden="true"]');
    expect(icon).not.toBeNull();
    expect(icon?.textContent).toBe('∅');
  });

  // AC2 / the no-dead-affordance rule: the prompt is sentence text, not a control, until Story 2.2
  // wires the real CTA. Falsifiable per the 1.11 review pattern — adding a <button> here must turn
  // this red; Dev Agent Record records that check having been run.
  it('ships no button, link, or other focusable control (AC2, no-dead-affordance)', () => {
    const { container } = render(<GalleryEmptyState />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(container.querySelectorAll('button, a, [role="button"], [tabindex]')).toHaveLength(0);
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<GalleryEmptyState />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
