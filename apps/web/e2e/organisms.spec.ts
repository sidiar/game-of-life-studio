import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Thin e2e (RFC-008 Decision 2), same fixtures/patterns as home.spec.ts / appShell.spec.ts.
test.describe('organisms route (Story 4.1)', () => {
  test('renders the Organism Library against the served static export, with zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/organisms');

    await expect(page.getByRole('heading', { level: 1, name: 'Organism Library' })).toBeVisible();
    // The hydration signal: the prerendered HTML says "Loading organisms…", so this list item is
    // only reachable once useWorkspaceSeed's and OrganismLibrary's own load effect have both run
    // — every assertion on errors/axe below must come AFTER it, or it races hydration exactly as
    // appShell.spec.ts explains.
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('nav reflects the current route on both pages', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'Organisms' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Battles' })).not.toHaveAttribute('aria-current');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Battles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Organisms' })).not.toHaveAttribute('aria-current');
  });

  test('is keyboard-reachable from / and activates via Enter', async ({ page, browserName }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();

    const organismsLink = page.getByRole('link', { name: 'Organisms' });

    // ⚠️ WebKit (and therefore the `tablet` project, which runs on it) does not include plain
    // `<a>` links in the default Tab order at all — matching real Safari's default with "Full
    // Keyboard Access" off, confirmed by tabbing 10 times against the served export and finding
    // document.activeElement pinned to <body> throughout. This is a WebKit/Safari engine default,
    // not an app defect: Chromium and Firefox both reach the link normally, and vitest-axe +
    // AppNav.test.tsx's own userEvent.tab() test already prove Tab order in a standards-compliant
    // engine. So only Chromium/Firefox get the real Tab-reachability assertion; WebKit gets the
    // Enter-activation half only, via a direct focus() (still a real keyboard-activation proof —
    // just not one that can also prove Tab *reaches* it in this engine).
    if (browserName === 'webkit') {
      await organismsLink.evaluate((el) => (el as HTMLElement).focus());
    } else {
      // Bounded loop (<= 10 presses): the wordmark is not focusable, so Organisms is the 2nd Tab
      // stop today, but this does not hardcode that — only that it is reachable at all.
      let reached = false;
      for (let i = 0; i < 10; i += 1) {
        await page.keyboard.press('Tab');
        const isFocused = await organismsLink.evaluate((el) => el === document.activeElement);
        if (isFocused) {
          reached = true;
          break;
        }
      }
      expect(reached).toBe(true);
    }

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/organisms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Organism Library' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('is prerendered — the raw served HTML already contains the heading and theme attribute', async ({
    request,
  }) => {
    const response = await request.get('/organisms');
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain('Organism Library');
    expect(html).toContain('data-theme="clinical-lab"');
  });

  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
