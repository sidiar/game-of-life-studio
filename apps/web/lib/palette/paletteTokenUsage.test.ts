import { CONWAYS_CLASSIC } from '@gol/domain';
import { createBenchmarkRoster, createMockOrganisms } from '@gol/test-utils';
import { describe, expect, it } from 'vitest';
import { PALETTE } from './paletteRegistry';

/**
 * The cross-package guard the schema deliberately does not provide (Story 1.7 Task 5, forced
 * decision 4): every fixture `colorToken` must resolve to a REAL registry entry. Assert
 * membership directly against PALETTE — not via `resolvePaletteColor`, which by design returns
 * the default for a bad token and would make this test pass on exactly the failure it exists to
 * catch.
 *
 * This lives in apps/web because it is the only workspace that can import the registry,
 * @gol/domain, AND @gol/test-utils at once; test files are exempt from the Story 1.2 import
 * boundary, so the @gol/test-utils import is legal here.
 */
describe('fixture colorTokens resolve against the real palette registry', () => {
  const paletteIds = new Set(PALETTE.map((color) => color.id));

  it("Conway's Classic (@gol/domain) uses a real token", () => {
    expect(paletteIds.has(CONWAYS_CLASSIC.colorToken)).toBe(true);
  });

  it('every AR-45 mock organism (@gol/test-utils) uses a real token', () => {
    for (const organism of createMockOrganisms()) {
      expect(paletteIds.has(organism.colorToken)).toBe(true);
    }
  });

  it('every organism in the AR-43 benchmark roster (@gol/test-utils) uses a real, distinct token', () => {
    // `benchmarkRoster.ts` duplicates the registry's 20 ids as string literals because
    // @gol/test-utils cannot import apps/web's registry. An unknown token is NOT loud there —
    // `buildRefToFillGroup` falls back to the default token with a warn-once, which silently
    // collapses the fixture's fill groups and understates the gated repaint half. This is the
    // guard that file's comment points at; it did not cover this source until Story 3.7's review.
    const tokens = createBenchmarkRoster(20).map((organism) => organism.colorToken);
    for (const token of tokens) expect(paletteIds.has(token)).toBe(true);
    expect(new Set(tokens).size).toBe(20);
  });
});
