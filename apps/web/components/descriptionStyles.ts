/**
 * Shared rules for read-only description text (FR-9.5, Story 7.2). Plain style objects rather than
 * a styled component: each surface (organism card, gallery tile, battle header, gallery header) has
 * its own element, size and spacing, and only these rules are common.
 *
 * `whiteSpace: 'pre-line'` keeps an author's newlines (plain text only — no markdown, no links, UX
 * §5); `overflowWrap: 'anywhere'` stops a long unbroken token pushing a card or tile wider.
 */
export const descriptionTextRules = {
  whiteSpace: 'pre-line',
  overflowWrap: 'anywhere',
} as const;

/**
 * The 2-line clamp used on organism cards and gallery tiles (Story 7.2 FD10) — the codebase's
 * first, so it lives in one place both surfaces read. The `display: -webkit-box` form is what all
 * four Playwright engines support. The clamp is visual only: the full text stays in the
 * accessibility tree, and the full text is visible in the entity's editor (the card's existing
 * Edit action) — there is deliberately no show-more toggle, which would add a tab stop.
 */
export const twoLineClampRules = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
} as const;
