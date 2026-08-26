import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';

// Copied from e2e/deleteBattle.spec.ts (which copied it from gallery.spec.ts) rather than shared
// through a new module — the story's file list scopes this story to one new spec file. Keep them
// in sync if either changes; e2e/ is exempt from the @gol/test-utils import boundary
// (eslint.config.mjs).
function buildSeedPayload() {
  const { battles, organisms } = createMockWorkspace();
  const battlesRecord: Record<string, unknown> = Object.fromEntries(battles.map((b) => [b.id, b]));
  const organismsRecord = Object.fromEntries(organisms.map((o) => [o.id, o]));

  return JSON.parse(JSON.stringify({ battles: battlesRecord, organisms: organismsRecord })) as {
    battles: unknown;
    organisms: unknown;
  };
}

async function seedWorkspace(page: Page) {
  const payload = buildSeedPayload();

  await page.addInitScript(
    ([keys, formatVersion, data]) => {
      // Stamp gol:schema so isFreshWorkspace() is false and the default seed does not append
      // Conway's Classic to the roster mid-test.
      localStorage.setItem(
        (keys as Record<string, string>).schema,
        JSON.stringify({ formatVersion }),
      );
      localStorage.setItem(
        (keys as Record<string, string>).battles,
        JSON.stringify((data as { battles: unknown }).battles),
      );
      localStorage.setItem(
        (keys as Record<string, string>).organisms,
        JSON.stringify((data as { organisms: unknown }).organisms),
      );
    },
    [STORAGE_KEYS, CURRENT_FORMAT_VERSION, payload] as const,
  );
}

// The e2e serves the PRODUCTION static export (playwright.config.ts), which is the only place
// Architecture Decision K can actually be proven: `/battle/[id]` does not merely misbehave under
// `output: 'export'`, it fails the build — and a route shape that *builds* can still 404 on a
// static host. Hence the reload assertions below.
test.describe('battle route (Story 2.1)', () => {
  test('opens a battle from a Gallery tile and survives a reload', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await page.goto('/');

    // Hydration signal: the prerendered HTML says "Loading battles…", so a tile can only exist
    // once the client effect has run (appShell.spec.ts:28-39 explains why this matters before any
    // console-error assertion).
    await expect(page.getByRole('article')).toHaveCount(2);

    await page.getByRole('link', { name: 'Three-Way Skirmish' }).click();

    await expect(page).toHaveURL(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    // AC5 / AR-28: the battle route does NOT wear the app shell — no wordmark, no nav.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    // ...but it DOES still own exactly one <main> and exactly one <h1>. app/(battle)/layout.tsx
    // claims both in a comment and nothing asserted either: BattlePage.test.tsx renders the
    // component WITHOUT its layout, so only the composed route can prove it. Story 2.4 mounts the
    // Lab chassis into this same layout, which is exactly when a second landmark would appear.
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    // ⚠️ THE assertion this spec exists for. A click-only test passes for route shapes that 404
    // on refresh, because the App Router never leaves the SPA — the reload is what asks the
    // static host for `/battle` as a real document.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    expect(errors).toEqual([]);
  });

  // Decision K's second static page, reached by URL directly. Story 2.2 wires the Gallery CTA
  // that navigates here (createBattle.spec.ts) and seeds the route with a fresh draft — forced
  // decision 3 drops the Back-to-Gallery link for symmetry with the loaded battle branch, which
  // has never had one (deferred-work.md, owned by Story 2.16).
  test('serves /battle/new as its own prerendered page, seeded as Untitled Battle', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/battle/new');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');
    await expect(page.getByRole('link', { name: 'Back to Gallery' })).toHaveCount(0);
  });

  // An id that parses but matches nothing: the not-found branch, never an endless spinner (the
  // `ready` + `null` trap) and never the failure copy.
  test('renders the not-found body for a stale id, with a way back to the Gallery', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/battle?id=ffffffff-0000-4000-8000-000000000000');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Not Found');

    await page.getByRole('link', { name: 'Back to Gallery' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Gallery');
  });

  // A bare /battle with no query string at all — the same not-found branch, not a crash.
  test('renders the not-found body when ?id= is missing entirely', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/battle');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Not Found');
  });

  // The stretched link covers the whole tile, so Delete sits under it unless raised. If this
  // regresses, the destructive control silently becomes a second "open this battle" button.
  test('the tile delete button deletes rather than navigating', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/');
    await expect(page.getByRole('article')).toHaveCount(2);

    await page.getByRole('button', { name: 'Delete Three-Way Skirmish' }).click();

    // Dialog FIRST, then the URL. `toHaveURL('/')` is polled and succeeds on its first poll —
    // immediately after the click, before a regressed client-side Link navigation would have
    // committed — so on its own it is decorative. Awaiting the dialog gives the navigation a
    // chance to happen, which is what makes the URL assertion mean something.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  // ⚠️ THE stretched link's own test. Every other assertion in this story clicks the <a> by role,
  // i.e. the anchor's ~18px of title text — and jsdom does no hit-testing at all. Delete
  // `TitleLink`'s `::after { position: absolute; inset: 0 }` and all of those still pass while the
  // tile silently reverts to "only the title text opens the battle". This clicks the tile's BODY,
  // away from the title, so it can only succeed through the overlay.
  test('opens the battle when the tile body — not the title — is clicked', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/');
    await expect(page.getByRole('article')).toHaveCount(2);

    const tile = page.getByRole('article').filter({ hasText: 'Three-Way Skirmish' });
    const box = await tile.boundingBox();
    if (box === null) throw new Error('tile has no layout box');
    // Low-centre: below the title, clear of the top-right delete button's 34px band.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 24);

    await expect(page).toHaveURL(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
  });

  // Task 9 asked for an axe scan of THE ROUTE. BattlePage.test.tsx scans the component into a bare
  // container, so the layout's <main>, the <header>-inside-<main> composition and the real
  // document landmark structure were never checked by anything.
  test('has no axe accessibility violations on the loaded battle route', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    // Wait past hydration: goto resolves against the prerendered HTML, which is the Suspense
    // fallback ("Loading battle…") and contains none of what this story added.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
