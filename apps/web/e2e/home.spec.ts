import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';

// Thin e2e (RFC-008 Decision 2): only the home route exists this story. Editor, Play, Settings
// arrive later and get their own specs; the POPULATED Gallery gets its own spec (gallery.spec.ts,
// Story 1.10) — this file stays the production-empty-workspace proof.
test.describe('home route', () => {
  test('renders the real Battle Gallery, empty, with zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');

    // Story 1.9: the h1 moved to the page's own "Battle Gallery" heading — "Game of Life
    // Studio" is now the shell's wordmark (AppShell), not a document heading.
    await expect(page.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeVisible();
    // Story 1.12: a production load seeds no battles, so the designed empty state renders — its
    // own <h2> heading, "what is this app" explanation, and the FR-7.4 prompt.
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();
    await expect(page.getByText(/cellular battles/i)).toBeVisible();
    await expect(page.getByText(/create your first battle/i)).toBeVisible();
    // AC2 / no-dead-affordance: the empty state ships copy, not a control, until Story 2.2.
    const emptyState = page.locator('h2', { hasText: 'No Battles Yet' }).locator('..');
    await expect(emptyState.getByRole('button')).toHaveCount(0);
    await expect(emptyState.getByRole('link')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // Real-browser axe run — covers rules jsdom cannot (e.g. colour-contrast),
  // which the component-level vitest-axe check necessarily skips. Story 1.12: this is also where
  // the empty state's decorative glyph gets a real contrast evaluation — jsdom has no layout, so
  // the vitest-axe run in GalleryEmptyState.test.tsx skips colour-contrast entirely. See that
  // file's silent-failure-trap note on why the glyph is expected to land in axe's `incomplete`
  // bucket (unicode-only visible text), not `violations`.
  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/');
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // Story 1.5 AC1: the only place "when the app loads" is verified end-to-end through a real
  // static export — a fresh Playwright context has no localStorage, mirroring a first run.
  //
  // Story 1.6 AC3, production half: this runs against the PRODUCTION static export
  // (build:standalone, served from out/), so it proves the AR-45 dev fixtures are never SEEDED by
  // a production build — a stronger gate than a unit test, which mounts under NODE_ENV=test rather
  // than against the real artifact. It does not prove they are absent from the bundle: these
  // assertions hold equally if the fixture module ships and is merely never invoked. That claim is
  // the dead-code-elimination one, and its evidence is the `grep -r "Aggressive Colonizer"
  // apps/web/out` check recorded in the story's Dev Agent Record. There is deliberately no e2e for
  // the dev-seeded path; this config never serves `next dev`.
  test('seeds gol:organisms with conways-classic on first load, no duplicate on reload, and no AR-45 mock fixtures', async ({
    page,
  }) => {
    await page.goto('/');
    // The empty state's <h2> is the hydration signal now (Story 1.12, retargeted from "No battles
    // yet."): it is absent from the prerendered HTML ("Loading battles…") and only reachable once
    // useWorkspaceSeed's effect and BattleGallery's own load effect have both run.
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();

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
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();

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
