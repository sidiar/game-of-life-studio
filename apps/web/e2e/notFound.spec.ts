import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The component test (app/not-found.test.tsx) proves NotFound renders the shell. This proves the
// SHIPPED artifact does — that Next actually emits the shell into out/404.html and that the static
// host serves it for an unmatched path. The regression this guards was invisible to every jsdom
// test in the repo and only showed up in the built output, so the built output is where it belongs.
test.describe('unmatched routes', () => {
  test('serve the 404 page wearing the app shell', async ({ page }) => {
    await page.goto('/no-such-page');

    await expect(page.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeVisible();

    // The three landmarks that vanished when AppShell moved off the root layout.
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.getByText('Game of Life Studio')).toBeVisible();
  });

  test('offer a working way back to the Gallery', async ({ page }) => {
    await page.goto('/no-such-page');

    await page.getByRole('link', { name: 'Back to Gallery' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeVisible();
  });

  test('have no axe violations', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
