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

    // AC4's no-dead-affordance rule (Story 4.1 AC1), proven in a real browser: exactly two nav
    // links — Battles and Organisms — Settings is still Story 5.1's.
    await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(2);

    // ⚠️ Wait for hydration BEFORE asserting on errors. page.goto
    // defaults to waitUntil: 'load', and every assertion above resolves against server-rendered
    // HTML on its first poll — the markup is all there pre-hydration. A hydration-mismatch
    // console.error lands a few ms later, i.e. after the assertion below had already run, so the
    // one check this comment claims exists nowhere else was passing by racing it.
    //
    // The empty state's <h2> is the hydration signal now (Story 1.12 retargeted this from
    // "No battles yet.", which Story 1.10 retargeted from "workspace: ready"): "Loading battles…"
    // is what the server-rendered HTML says, and this heading is only reachable once both
    // useWorkspaceSeed's and BattleGallery's client effects have run, which cannot happen before
    // React has hydrated this tree. Do NOT "fix" this by dropping the wait — it exists because the
    // console-error assertion below was racing hydration.
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();

    // Emotion hydration mismatches (missing AppRouterCacheProvider) surface only here, against
    // the served static export — not in `next dev`, and not in jsdom.
    expect(errors).toEqual([]);
  });

  // Guards AppRouterCacheProvider itself. Every other assertion in this
  // file reads the DOM *after* client-side Emotion has inserted its styles, so deleting the
  // provider — reintroducing the NFR-8.5 unstyled flash on the static host — left the whole suite
  // green. This reads the raw served HTML instead, where the server-inserted <style> tags either
  // are or are not present.
  test('ships server-inserted Emotion styles in the static HTML', async ({ request }) => {
    const html = await (await request.get('/')).text();

    expect(html).toContain('data-emotion');
    // options={{ key: 'gol' }} in AppProviders — a changed or dropped key means the collected
    // cache is not the one the tree rendered with.
    expect(html).toMatch(/data-emotion="gol/);
    // The token layer must be in the served document too, not only fetched afterwards.
    expect(html).toContain('data-theme="clinical-lab"');
  });

  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/');
    // ⚠️ Same hydration race as home.spec.ts's axe run: page.goto resolves at waitUntil:'load',
    // against a prerender that says "Loading battles…". Without this wait the shell is scanned with
    // the placeholder body under it rather than the real Gallery, and reports green either way.
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
