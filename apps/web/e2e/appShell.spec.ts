import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// jsdom (used by the Vitest/RTL component tests) does not compute CSS custom properties, so this
// is the only place the --gol-* token layer is proven to actually APPLY end-to-end: shipped,
// resolved by a real browser, and reaching MUI's CssBaseline through both the --gol-* and
// --mui-palette-* layers (Story 1.9 Dev Notes).
test.describe('app shell (Story 1.9)', () => {
  test('applies the clinical-lab theme end-to-end with zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clinical-lab');

    // rgb(10, 10, 10) === --gol-bg-primary (#0a0a0a) — proves themes.css shipped, resolved, and
    // reached CssBaseline's body background through both the --gol-* and --mui-palette-* layers.
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(10, 10, 10)');

    // AC4's no-dead-affordance rule, proven in a real browser: exactly one nav link.
    await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(1);

    // Emotion hydration mismatches (missing AppRouterCacheProvider) surface only here, against
    // the served static export — not in `next dev`, and not in jsdom.
    expect(errors).toEqual([]);
  });

  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/');
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
