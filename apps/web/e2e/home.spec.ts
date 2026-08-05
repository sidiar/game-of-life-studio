import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';

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

  // Story 1.5 AC1: the only place "when the app loads" is verified end-to-end through a real
  // static export — a fresh Playwright context has no localStorage, mirroring a first run.
  //
  // Story 1.6 AC3, production half: this runs against the PRODUCTION static export
  // (build:standalone, served from out/), so it is the one gate that proves the AR-45 dev
  // fixtures are truly unreachable end-to-end — not just absent from a passing unit test. There is
  // deliberately no e2e for the dev-seeded path; this config never serves `next dev`.
  test('seeds gol:organisms with conways-classic on first load, no duplicate on reload, and no AR-45 mock fixtures', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('workspace: ready')).toBeVisible();

    const afterFirstLoad = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      STORAGE_KEYS.organisms,
    );
    expect(afterFirstLoad).toHaveProperty(CONWAYS_CLASSIC_ID);
    expect(Object.keys(afterFirstLoad)).toEqual([CONWAYS_CLASSIC_ID]);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.battles),
    ).toBeNull();

    await page.reload();
    await expect(page.getByText('workspace: ready')).toBeVisible();

    const afterReload = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      STORAGE_KEYS.organisms,
    );
    expect(Object.keys(afterReload)).toEqual([CONWAYS_CLASSIC_ID]);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.battles),
    ).toBeNull();
  });
});
