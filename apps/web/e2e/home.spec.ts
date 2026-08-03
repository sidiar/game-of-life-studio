import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Thin e2e (RFC-008 Decision 2): only the home route exists this story. Gallery,
// Editor, Play, Settings arrive later and get their own specs.
test.describe('home route', () => {
  test('renders the placeholder gallery with zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Game of Life Studio' }),
    ).toBeVisible();
    await expect(page.getByText('Battle Gallery coming soon.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  // Real-browser axe run — covers rules jsdom cannot (e.g. colour-contrast),
  // which the component-level vitest-axe check necessarily skips.
  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/');
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
