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
    // AC2 (Story 2.2): the empty-state prompt is now a real control, not copy — the "no
    // dead-affordance" gap this route shipped with (Story 1.12) closes here.
    const emptyState = page.locator('h2', { hasText: 'No Battles Yet' }).locator('..');
    // Anchor the scope FIRST, and never lead with a zero-count: toHaveCount(0) against a locator
    // whose ancestor matched nothing is a pass, not a failure. The CTA's toHaveCount(1) is the
    // anchor — it goes red the moment the h2 text, tag or nesting changes, which is what stops the
    // button assertion after it from silently evaporating.
    const cta = emptyState.getByRole('link', { name: 'Create Your First Battle' });
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveAttribute('href', '/battle/new');
    // That link is the empty state's ONLY control — the CTA replaced the inert sentence, it did
    // not join a button.
    await expect(emptyState.getByRole('button')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // Real-browser axe run — covers rules jsdom cannot (e.g. colour-contrast), which the
  // component-level vitest-axe check necessarily skips because jsdom has no layout. Story 1.12:
  // this is therefore the only place the empty state's TEXT (--gol-text-secondary on the page
  // background) is contrast-checked for real.
  //
  // The decorative ∅ glyph is NOT contrast-checked here or anywhere, and that is expected rather
  // than a gap: color-contrast declares excludeHidden:false, so aria-hidden does not exempt it, but
  // `ignoreUnicode` is on by default and axe's textIsEmojis() matches any node whose visible text is
  // only symbol-range characters (∅ is U+2205, inside getUnicodeNonBmpRegExp()'s ∀-⋿).
  // The rule returns undefined for it, landing the node in `incomplete` — which this test discards.
  // ⚠️ Swap the glyph for a letter, a word, or an inline SVG and the exemption is gone: at
  // opacity 0.3 it composites to roughly 1.9:1 and becomes a serious violation. Re-run this then.
  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/');
    // ⚠️ page.goto resolves at waitUntil:'load', i.e. against the prerendered HTML — which says
    // "Loading battles…" and contains no empty state at all (the Task 6 grep gate proves it).
    // Without this wait, analyze() races hydration and can scan the loading body instead, checking
    // nothing this story added while still reporting green.
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();

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
