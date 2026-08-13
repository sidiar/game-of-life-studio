import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import GalleryEmptyState from './GalleryEmptyState';

describe('GalleryEmptyState', () => {
  it('renders the designed empty-state heading, explanation and prompt (AC1)', () => {
    render(<GalleryEmptyState />);

    expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    // "what is this app" explanation (NFR-4.1) — matched by substring, so a wording tweak inside
    // the sentence does not break this test; the AC is "an explanation exists", not its prose.
    const description = screen.getByText(/cellular battles/i);
    // The prompt is asserted EXACTLY, unlike the description. GalleryEmptyState.tsx's own comment
    // forbids a title-cased standalone line ("Create Your First Battle") because it reads as a dead
    // button (AC2) — and a case-insensitive match is exactly what would wave that regression
    // through, since it stays a <p> and trips none of the control checks below.
    const prompt = screen.getByText('Create your first battle to begin.');

    // Two separate elements, not one merged <p>. Splitting "what is this app" from "what do I do"
    // is EmptyPrompt's entire reason to exist (Task 1); merging them back leaves every other
    // assertion in this file green.
    expect(description).not.toBe(prompt);
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

  // AC2 / the no-dead-affordance rule: the prompt is sentence text, not a control, until Story 2.2
  // wires the real CTA. Falsifiable per the 1.11 review pattern — adding a <button> here must turn
  // this red.
  it('ships no button, link, or other focusable control (AC2, no-dead-affordance)', () => {
    const { container } = render(<GalleryEmptyState />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    // Every native focusable plus the interactive ARIA roles, not just button/a: an
    // <input type="button" value="Create Your First Battle"> is the same dead affordance and would
    // slip past a button/a-only selector. `[tabindex="-1"]` is excluded deliberately — it is
    // programmatically focusable but not tab-reachable, so it is not what AC2 is about.
    expect(
      container.querySelectorAll(
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
      ),
    ).toHaveLength(0);
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<GalleryEmptyState />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
