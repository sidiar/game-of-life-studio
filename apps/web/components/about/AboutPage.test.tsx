import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import AboutPage, { CONTACT_EMAIL, CONWAY_WIKI_URL, GITHUB_URL, LINKEDIN_URL } from './AboutPage';

describe('AboutPage', () => {
  it('renders the About heading and one h2 per panel', () => {
    render(<AboutPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'About' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'The studio',
      'Made by',
      'How it was built',
      'Say hello',
    ]);
  });

  it('links to LinkedIn, GitHub and the Wikipedia article in a new tab, without an opener', () => {
    render(<AboutPage />);

    for (const [name, href] of [
      [/linkedin/i, LINKEDIN_URL],
      [/view on github/i, GITHUB_URL],
      [/conway's game of life/i, CONWAY_WIKI_URL],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('offers a mailto link to the contact address with a prefilled subject', () => {
    render(<AboutPage />);

    const mail = screen.getByRole('link', { name: CONTACT_EMAIL });
    expect(mail).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}?subject=Game%20of%20Life%20Studio`,
    );
    expect(mail).not.toHaveAttribute('target');
  });

  it('separates the studio name from the sentence it opens', () => {
    render(<AboutPage />);

    expect(
      screen.getByText('Game of Life Studio', { selector: 'strong' }).parentElement,
    ).toHaveTextContent(/^Game of Life Studio takes Conway's Game of Life ↗ and turns it/);
  });

  it('exposes exactly four links — the decorative specimen adds none', () => {
    render(<AboutPage />);

    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByTestId('about-specimen')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<AboutPage />);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
