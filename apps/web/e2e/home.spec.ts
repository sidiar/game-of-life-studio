import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';

// Thin e2e (RFC-008 Decision 2) for what a production first visit gets. Since Story 7.4 that is
// the manifest's DEFAULT PRESET (FR-9.2), loaded silently on whichever seeding page is entered —
// the first describe below proves it against the shipped static export. The designed empty
// workspace is no longer what a first visit sees; it is what the silent FR-1.5 fallback and Clear
// All (FR-8.5) leave, and the second describe keeps that proof, reached through the fallback. The
// POPULATED Gallery's own behaviour has its own spec (gallery.spec.ts, Story 1.10).

// The shipped preset, read off disk — never hard-coded names, so the proof follows the content.
// `__dirname`, not `import.meta.url`: Playwright loads specs as CommonJS (apps/web has no
// `"type": "module"`), where `import.meta` is a SyntaxError.
const PRESETS_DIR = join(__dirname, '..', 'public', 'workspaces');
const manifest = JSON.parse(readFileSync(join(PRESETS_DIR, 'index.json'), 'utf8')) as {
  defaultPresetId: string;
  workspaces: { id: string; file: string }[];
};
const defaultFile = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId)?.file;
if (defaultFile === undefined) throw new Error('index.json: defaultPresetId names no entry');
const preset = JSON.parse(readFileSync(join(PRESETS_DIR, defaultFile), 'utf8')) as {
  description: string;
  battles: { name: string }[];
  organisms: { name: string }[];
};

// Story 7.4 (FD6): forces the silent FR-1.5 fallback — a 200 whose body is not a manifest fails
// the loader's parse. Never `route.abort()` or a 404: Chromium logs "Failed to load resource" as a
// console error, which trips the zero-console-error assertions. A file-local copy, per the house
// convention for e2e helpers.
async function forcePresetFallback(page: Page) {
  await page.route('**/workspaces/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('first visit loads the default preset (Story 7.4)', () => {
  test('at /: the preset gallery with its description, no dialog, zero console errors', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(preset.battles.length);
    for (const battle of preset.battles) {
      await expect(page.getByRole('heading', { level: 2, name: battle.name })).toBeVisible();
    }
    await expect(page.locator('[data-workspace-description]')).toHaveText(preset.description);
    // FR-9.2: the pristine first-visit store is FR-8.4's suppression case — no replace warning.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('at /organisms: the entry page loads the preset too (FR-9.2, "whichever page")', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/organisms');

    const grid = page.getByRole('list', { name: 'Organisms' });
    await expect(grid.getByRole('listitem')).toHaveCount(preset.organisms.length);
    for (const organism of preset.organisms) {
      await expect(grid).toContainText(organism.name);
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Clear All returns to the FR-8.5 default and a reload does NOT re-load the preset', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('article')).toHaveCount(preset.battles.length);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Clear data (all battles and organisms)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear All Data?' });
    await dialog.getByRole('button', { name: 'Clear All Data' }).click();
    await expect(page.getByRole('status')).toContainText('All data cleared');

    let manifestRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/workspaces/index.json')) manifestRequests += 1;
    });
    await page.goto('/');
    await page.reload();

    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    const organisms = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>,
      STORAGE_KEYS.organisms,
    );
    expect(Object.keys(organisms)).toEqual([CONWAYS_CLASSIC_ID]);
    // The stamp survives Clear All, so the store is never fresh again (M9) — nothing is fetched.
    expect(manifestRequests).toBe(0);
  });
});

test.describe('empty workspace via the FR-1.5 fallback', () => {
  test.beforeEach(async ({ page }) => {
    await forcePresetFallback(page);
  });

  test('renders the real Battle Gallery, empty, with zero console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');

    // Story 1.9: the h1 moved to the page's own "Battle Gallery" heading — "Game of Life
    // Studio" is now the shell's wordmark (AppShell), not a document heading.
    await expect(page.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeVisible();
    // Story 1.12: the fallback seeds no battles, so the designed empty state renders — its own
    // <h2> heading, "what is this app" explanation, and the FR-7.4 prompt.
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

  // Story 1.5 AC1: the FR-1.5 seed verified end-to-end through a real static export — a fresh
  // Playwright context has no localStorage, mirroring a first run whose preset fetch failed.
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
