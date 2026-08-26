import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC, CURRENT_FORMAT_VERSION } from '@gol/domain';
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

/**
 * Adds Conway's Classic to the seeded organism library, as a SEPARATE init script layered on top
 * of seedWorkspace().
 *
 * WARNING: `createMockWorkspace()` returns three fixtures and no Conway, while seedWorkspace()
 * stamps `gol:schema` specifically so the default seed will not add it — so in an e2e-seeded
 * workspace the editor's default tool points at a DANGLING roster id: `buildRefToFillGroup` warns
 * once and falls back to DEFAULT_COLOR_TOKEN (Decision I.4). The dish still paints, so a smoke
 * check still passes; seeding the organism makes the placement test exercise the real colour path
 * instead. In production Conway's Classic is always present (M9: protected, re-seeded on import).
 *
 * Deliberately NOT folded into buildSeedPayload/seedWorkspace: those two are hand-synced copies
 * across three spec files (deferred-work.md), and editing one of them here would create exactly
 * the silent divergence that entry warns about. Init scripts run in registration order, so this
 * reads back what seedWorkspace wrote and merges into it.
 */
async function seedConwaysClassic(page: Page) {
  await page.addInitScript(
    ([keys, organism]) => {
      const key = (keys as Record<string, string>).organisms;
      const stored = localStorage.getItem(key);
      const record = stored === null ? {} : (JSON.parse(stored) as Record<string, unknown>);
      record[(organism as { id: string }).id] = organism;
      localStorage.setItem(key, JSON.stringify(record));
    },
    [STORAGE_KEYS, JSON.parse(JSON.stringify(CONWAYS_CLASSIC)) as unknown] as const,
  );
}

/** Distinct RGBA values actually rasterised on a canvas — the AR-42-permitted smoke check. */
async function distinctColorCount(canvas: Locator): Promise<number> {
  return canvas.evaluate((el) => {
    const canvasEl = el as HTMLCanvasElement;
    const ctx = canvasEl.getContext('2d');
    if (ctx === null) return 0;
    const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      seen.add([data[i], data[i + 1], data[i + 2], data[i + 3]].join(','));
    }
    return seen.size;
  });
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

  // Story 2.4 AC1/AC6: the SAME AR-42-permitted smoke check gallery.spec.ts:163-196 uses for
  // <PetriDishCanvas variant="static"> — never a pixel or image snapshot (project-context, "Never
  // pixel/snapshot-test the Canvas"). Three-Way Skirmish places three organisms on a 50x30 grid,
  // guaranteeing more than the background/grid-line pair is actually on screen.
  test('the edit canvas actually paints more than two colours (AC1, AR-42 smoke check)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const canvas = page.getByRole('img', { name: /petri dish/i });
    await expect(canvas).toBeAttached();

    // review (2026-08-26): was an inline duplicate of Story 2.5's `distinctColorCount` helper
    // (below), added to this same file for the click-placement smoke check. One copy, not two.
    const count = await distinctColorCount(canvas);

    // > 2, not > 1: background + grid lines are already two distinct colours before a single
    // organism cell is drawn. Three distinct colours cannot be reached without at least one
    // organism actually painted.
    expect(count).toBeGreaterThan(2);
  });

  // Story 2.5 (AC1, AC3, AC6): THE test that proves the whole chain end to end — real DPR, real
  // layout, real getBoundingClientRect, real roster-union ref allocation. jsdom has no layout at
  // all, so every unit test stubs the canvas box; this is the only place the pointer -> cell
  // mapping meets geometry the browser actually produced.
  test('clicking the dish places an organism on /battle/new (AC1, AC3, AC6)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const canvas = page.getByRole('img', { name: /petri dish/i });
    await expect(canvas).toBeAttached();

    // A fresh draft is an all-empty grid, so every colour on screen belongs to the dish surface
    // and its grid lines. The exact count is NOT the claim — the semi-transparent line colour
    // composites, and the closing bars at the far edge overlap — so this pins the floor and the
    // RISE below is what proves a cell was painted.
    const before = await distinctColorCount(canvas);
    expect(before).toBeGreaterThanOrEqual(2);

    // Dead centre of the dish — comfortably inside the grid at either editable preset, so this
    // does not depend on which default the seeded settings carry.
    await canvas.click();

    // A third colour cannot appear unless a cell was actually painted in an organism's colour,
    // which needs the mapping, the roster union's ref allocation AND the palette built over that
    // union to all be right (trap 3: an out-of-range ref paints as EMPTY, silently).
    await expect
      .poll(async () => distinctColorCount(canvas), { timeout: 2000 })
      .toBeGreaterThan(before);

    expect(errors).toEqual([]);
  });

  // The dish gained pointer handling; role="img" and its accessible name are unchanged (Story 2.4
  // forced decision, Story 2.5 forced decision 5 — still no tabIndex, and the keyboard-placement
  // gap is recorded as deferred work rather than invented here).
  test('has no axe accessibility violations on /battle/new after a placement', async ({ page }) => {
    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    await page.getByRole('img', { name: /petri dish/i }).click();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
