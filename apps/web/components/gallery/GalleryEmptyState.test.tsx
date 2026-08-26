import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import GalleryEmptyState from './GalleryEmptyState';

describe('GalleryEmptyState', () => {
  it('renders the designed empty-state heading, explanation and CTA (AC1, AC2)', () => {
    render(<GalleryEmptyState />);

    expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    // "what is this app" explanation (NFR-4.1) — matched by substring, so a wording tweak inside
    // the sentence does not break this test; the AC is "an explanation exists", not its prose.
    const description = screen.getByText(/cellular battles/i);
    // The CTA label per spec conflict #2: FR-7.4 and this story's own AC1 both name it "Create
    // Your First Battle", overriding the mockups' shared "+ Create New Battle" copy.
    const cta = screen.getByRole('link', { name: 'Create Your First Battle' });
    expect(cta).toHaveAttribute('href', '/battle/new');

    // The explanation stays a non-interactive paragraph rather than being absorbed into the CTA's
    // accessible name — "what is this app" and "what do I do" are two jobs, and a link whose name
    // swallowed the NFR-4.1 explanation would still satisfy every other assertion in this file.
    // (`not.toBe(cta)` is NOT the guard it looks like: a <p> and an <a> can never be the same
    // node, so that comparison cannot fail. This asserts the property that actually can.)
    expect(description.tagName).toBe('P');
    expect(cta).not.toContainElement(description);
    expect(cta).toHaveAccessibleName('Create Your First Battle');
  });

  it('renders the decorative glyph as aria-hidden, not as an accessible name (forced decision 3)', () => {
    const { container } = render(<GalleryEmptyState />);

    // Find the glyph by its own text, then assert THAT node carries aria-hidden — not merely that
    // some node in the tree does. Removing the attribute, or moving it to an ancestor, turns this
    // red. A queryByRole('img') check would be vacuous here twice over: EmptyIcon is a <div>, which
    // has no implicit role, and RTL's queryByRole defaults to hidden:false, so it excludes
    // aria-hidden subtrees anyway — it cannot fail whatever the component does.
    const icon = Array.from(container.querySelectorAll('*')).find(
      (el) => el.children.length === 0 && el.textContent === '∅',
    );
    expect(icon).toBeDefined();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  // AC2's INVERSE of the Story 1.12 no-dead-affordance test: the prompt is now a real, live
  // control, not sentence text. Reuses the same focusable-selector list so an
  // <input type="button" value="Create Your First Battle"> still cannot sneak past — exactly ONE
  // focusable control, it is a link, and nothing else in the empty state is focusable.
  it('ships exactly one focusable control — the CTA link (AC2, inverted no-dead-affordance)', () => {
    const { container } = render(<GalleryEmptyState />);

    const focusable = container.querySelectorAll(
      [
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        'summary',
        'area[href]',
        'iframe',
        '[contenteditable]',
        '[tabindex]:not([tabindex="-1"])',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="checkbox"]',
        '[role="switch"]',
        '[role="option"]',
      ].join(', '),
    );

    expect(focusable).toHaveLength(1);
    expect(focusable[0].tagName).toBe('A');
    expect(focusable[0]).toHaveAttribute('href', '/battle/new');
    expect(focusable[0]).toHaveAccessibleName('Create Your First Battle');
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<GalleryEmptyState />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
