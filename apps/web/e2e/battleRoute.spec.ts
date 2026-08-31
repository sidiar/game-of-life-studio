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

/**
 * Story 2.6 Task 8: a distinct-colour count alone (`distinctColorCount` above) rises identically
 * for a single painted cell and for a hundred, so it cannot distinguish this story's drag from
 * Story 2.5's click — only AREA can. This pair tallies painted pixels by diffing the canvas's
 * OWN pixel buffer against a snapshot taken before any gesture, entirely inside the page (the
 * snapshot lives on `window`, never crosses back over the CDP boundary as a giant JSON array).
 * `snapshotBaseline` must be called once, before the gesture; `countChangedPixels` reads it back.
 */
async function snapshotBaseline(canvas: Locator): Promise<void> {
  await canvas.evaluate((el) => {
    const canvasEl = el as HTMLCanvasElement;
    const ctx = canvasEl.getContext('2d');
    if (ctx === null) return;
    const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    (window as unknown as { __golBaseline?: Uint8ClampedArray }).__golBaseline =
      new Uint8ClampedArray(data);
  });
}

async function countChangedPixels(canvas: Locator): Promise<number> {
  return canvas.evaluate((el) => {
    const canvasEl = el as HTMLCanvasElement;
    const ctx = canvasEl.getContext('2d');
    if (ctx === null) return 0;
    const baseline = (window as unknown as { __golBaseline?: Uint8ClampedArray }).__golBaseline;
    if (baseline === undefined) return 0;
    const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    let changed = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] !== baseline[i] ||
        data[i + 1] !== baseline[i + 1] ||
        data[i + 2] !== baseline[i + 2] ||
        data[i + 3] !== baseline[i + 3]
      ) {
        changed++;
      }
    }
    return changed;
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

  // Story 2.9 (AC1, AC2, AC3): the roster is the route's tool picker now. Only the composed route
  // can prove that a battle's OWN organisms — the three the fixture places — reach the sidebar
  // under their real names, in roster order, with no fourth row for the default tool's organism
  // (forced decision 4) and no leftover Draw/Erase toggle (AC3).
  test('lists the battle’s own organisms in the sidebar, and no tool toggle (AC1, AC3)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const sidebar = page.getByRole('complementary');
    // Story 2.11 (AC7) / Story 2.14 (AC1) / Story 2.15 (AC1): "Organisms", "Battle Name", "Grid
    // Info", then "Tools" — four real `<h2>`s, siblings of each other, in the mockup's own order.
    await expect(sidebar.getByRole('heading', { level: 2 })).toHaveText([
      'Organisms',
      'Battle Name',
      'Grid Info',
      'Tools',
    ]);
    // Roster ORDER, not merely presence: the dense encoding is `cell = roster index + 1`, so a
    // sidebar that sorted for display would be the first visible symptom of a reordering bug.
    await expect(sidebar.getByRole('listitem')).toHaveText([
      'Aggressive Colonizer',
      'Patient Defender',
      'Chaotic Spreader',
    ]);
    // Decision H.1: Conway's Classic is in the LIBRARY (seedConwaysClassic) but placed in no cell
    // of this battle, so it must not appear in its roster.
    await expect(sidebar.getByRole('button', { name: "Conway's Classic" })).toHaveCount(0);
    // AC3: the provisional toggle is gone, not merely hidden. ⚠️ `exact: true` — Playwright's
    // accessible-name option is a case-insensitive SUBSTRING match by default, so a bare 'Erase'
    // matches the eraser row's own "Eraser" and this assertion would fail against correct code.
    await expect(page.getByRole('button', { name: 'Draw', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Erase', exact: true })).toHaveCount(0);
    // AC5/AC8: this story's own search + add control DOES render now — Conway's Classic is in
    // the seeded library but not placed here, so it is the add control's one option. Epic 4's
    // per-row pencil and CREATE button remain the only later-story controls still absent.
    await expect(sidebar.getByRole('textbox', { name: /search organisms/i })).toHaveCount(1);
    await expect(sidebar.getByRole('combobox', { name: /add organism/i })).toHaveCount(1);
    await expect(page.getByText('✎')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /create/i })).toHaveCount(0);
    // AC2: exactly one row selected, and it is the first.
    await expect(sidebar.getByRole('button', { name: 'Aggressive Colonizer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // ⚠️ The clean-console assertion trap 6 is about: a `rosterSettled` gate keyed on the wrong
    // resource prints buildRefToFillGroup's dangling-id warning on every load, and only an e2e
    // catches it.
    expect(errors).toEqual([]);
  });

  // Story 2.9 AC2, end to end: selecting a NON-DEFAULT roster row must change the ref the dish
  // actually paints. Real geometry, real pointer — and a colour count is the only observable that
  // does not depend on reading the canvas's internals.
  test('selecting a roster row then painting places THAT organism (AC2)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const canvas = page.getByRole('img', { name: /petri dish/i });
    await expect(canvas).toBeAttached();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('dish has no layout box');

    // /battle/new seeds exactly one roster row (the default tool's organism), so selecting it and
    // painting proves the row -> ref path without needing a second organism placed first.
    const row = page.getByRole('complementary').getByRole('button').first();
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');

    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await page.mouse.up();

    // background + grid lines is two; a third colour means an organism cell was really painted.
    expect(await distinctColorCount(canvas)).toBeGreaterThan(2);

    // Then the eraser row, which is the OTHER half of the same exclusive selection (AC2).
    const eraser = page.getByRole('button', { name: 'Eraser' });
    await eraser.click();
    await expect(eraser).toHaveAttribute('aria-pressed', 'true');
    await expect(row).toHaveAttribute('aria-pressed', 'false');

    expect(errors).toEqual([]);
  });

  // Story 2.10 (AC1, AC3, AC4, AC6): the whole add-from-library chain, end to end. Three-Way
  // Skirmish places 3 organisms; seedConwaysClassic layers Conway into the library WITHOUT
  // placing it, so the dropdown's one option, the fourth sidebar row it becomes, the immediate
  // selection (forced decision 1) and the reload-drops-it AC4 claim are all provable on one
  // fixture without hand-building a battle.
  test('adds an organism from the library, paints it, and loses the add on reload (AC1, AC3, AC4, AC6)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const sidebar = page.getByRole('complementary');
    // AC1: the dropdown offers exactly Conway's Classic — the one organism in the library but
    // not in this battle's own placed set.
    const addSelect = sidebar.getByRole('combobox', { name: /add organism/i });
    await expect(addSelect.getByRole('option')).toHaveText(['+ ADD ORGANISM', "Conway's Classic"]);

    // AC3: choosing it puts a FOURTH row in the sidebar, under its real name.
    await addSelect.selectOption({ label: "Conway's Classic" });
    await expect(sidebar.getByRole('listitem')).toHaveText([
      'Aggressive Colonizer',
      'Patient Defender',
      'Chaotic Spreader',
      "Conway's Classic",
    ]);

    // Forced decision 1: the add also SELECTS — no further click needed.
    const newRow = sidebar.getByRole('button', { name: "Conway's Classic" });
    await expect(newRow).toHaveAttribute('aria-pressed', 'true');

    // AC6: painting with it produces its OWN colour on the dish, not the empty background — the
    // reviewable claim the setPalette investigation (Task 5) exists to back up.
    const canvas = page.getByRole('img', { name: /petri dish/i });
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('dish has no layout box');
    const before = await distinctColorCount(canvas);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect
      .poll(async () => distinctColorCount(canvas), { timeout: 2000 })
      .toBeGreaterThan(before);

    // AC8: nothing left to add now that all four are in the roster — a stated empty state, not
    // an empty dropdown.
    await expect(sidebar.getByRole('combobox')).toHaveCount(0);
    await expect(sidebar.getByText(/already in this battle/i)).toBeVisible();

    // AC4: a session add is never written through a repository — a reload shows the battle's own
    // roster again, with the added organism gone.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.getByRole('complementary').getByRole('listitem')).toHaveText([
      'Aggressive Colonizer',
      'Patient Defender',
      'Chaotic Spreader',
    ]);
    await expect(
      page.getByRole('complementary').getByRole('button', { name: "Conway's Classic" }),
    ).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  // AC8's other stated state: "Grand Colony War" places all four fixture organisms
  // (createMockBattles), so once Conway is seeded into the library there is nothing left the
  // add control could ever offer — the free fixture for this, per the story's own Dev Notes.
  test('states nothing is left to add when the library is a subset of the roster (AC8)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleB}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grand Colony War');

    const sidebar = page.getByRole('complementary');
    // The roster's OWN search box, named — not `textbox` in general, which now also matches
    // Story 2.11's always-present Battle Name field (a different control, unaffected by this
    // state).
    await expect(sidebar.getByRole('textbox', { name: /search organisms/i })).toHaveCount(0);
    await expect(sidebar.getByRole('combobox')).toHaveCount(0);
    await expect(sidebar.getByText(/already in this battle/i)).toBeVisible();
  });

  // Same pattern as every other post-interaction axe check in this file — a regression check on
  // the add control's own accessible names and states, not a new claim.
  test('has no axe accessibility violations after adding an organism from the library', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await page
      .getByRole('complementary')
      .getByRole('combobox', { name: /add organism/i })
      .selectOption({ label: "Conway's Classic" });
    await expect(
      page.getByRole('complementary').getByRole('button', { name: "Conway's Classic" }),
    ).toHaveAttribute('aria-pressed', 'true');

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

  // Story 2.6 (AC1, AC4, AC5, AC8): THE end-to-end claim — a click-and-drag paints STRICTLY MORE
  // area than a click, which only real geometry, real pointer capture, and the interpolation unit
  // (cellLine.ts) together can produce. Two independent fresh drafts (Story 2.8's undo does not
  // exist yet, so a reload is the only way back to an empty dish between the two gestures).
  test('dragging across the dish paints strictly more area than a single click (AC1, AC4)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await seedConwaysClassic(page);

    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');
    const clickCanvas = page.getByRole('img', { name: /petri dish/i });
    await expect(clickCanvas).toBeAttached();
    const clickBox = await clickCanvas.boundingBox();
    if (clickBox === null) throw new Error('dish has no layout box');
    await snapshotBaseline(clickCanvas);

    await page.mouse.move(clickBox.x + clickBox.width * 0.3, clickBox.y + clickBox.height * 0.5);
    await page.mouse.down();
    await page.mouse.up();
    const clickPixels = await countChangedPixels(clickCanvas);
    expect(clickPixels).toBeGreaterThan(0); // the click itself must have painted something.

    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');
    const dragCanvas = page.getByRole('img', { name: /petri dish/i });
    await expect(dragCanvas).toBeAttached();
    const dragBox = await dragCanvas.boundingBox();
    if (dragBox === null) throw new Error('dish has no layout box');
    await snapshotBaseline(dragCanvas);

    await page.mouse.move(dragBox.x + dragBox.width * 0.2, dragBox.y + dragBox.height * 0.5);
    await page.mouse.down();
    // ⚠️ NO `steps` option — Playwright's mouse.move with none sends exactly ONE `pointermove`,
    // which is the only way this exercises AC4's interpolation (cellsBetween) rather than the
    // browser's own pointermove sampling density filling the gap on its own.
    await page.mouse.move(dragBox.x + dragBox.width * 0.8, dragBox.y + dragBox.height * 0.5);
    await page.mouse.up();
    const dragPixels = await countChangedPixels(dragCanvas);

    // review (2026-08-27): a MULTIPLE, not a bare `> clickPixels`. With `cellsBetween` deleted
    // outright the drag still paints two cells — the pointer-down cell and the single move's
    // endpoint — against the click's one, so `dragPixels > clickPixels` passes with AC4's
    // interpolation entirely absent, which is the one thing this test exists to prove. The sweep
    // covers 60% of the dish width (dozens of cells at either editable preset), so a 10x floor
    // clears the two-cell degenerate case by a wide margin without pinning an exact geometry.
    expect(dragPixels).toBeGreaterThan(clickPixels * 10);
    expect(errors).toEqual([]);
  });

  // Same pattern as the click-placement axe check above — the dish's role="img"/aria-label are
  // unchanged by this story, so this is the regression check, not a new accessibility claim.
  test('has no axe accessibility violations on /battle/new after a drag', async ({ page }) => {
    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const canvas = page.getByRole('img', { name: /petri dish/i });
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('dish has no layout box');

    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
    await page.mouse.up();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // Story 2.7 (AC1, AC2): THE end-to-end claim for the eraser is REVERSAL, not "some cells
  // changed" — a broken interpolation on the erase drag would still satisfy a bare
  // `remainingChangedPixels < paintedPixels`, which is why this pins a return to the PRE-PAINT
  // floor instead. Real geometry, real pointer capture, the same `cellsBetween` interpolation
  // both directions — unit tests stub jsdom's layout; this is the only place it is real.
  test(
    'drag to paint, then drag the eraser over the SAME path, returns painted pixels to the ' +
      'pre-paint floor (AC1, AC2, reversal)',
    async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await seedWorkspace(page);
      await seedConwaysClassic(page);
      await page.goto('/battle/new');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

      const canvas = page.getByRole('img', { name: /petri dish/i });
      await expect(canvas).toBeAttached();
      const box = await canvas.boundingBox();
      if (box === null) throw new Error('dish has no layout box');
      await snapshotBaseline(canvas);

      const start = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.5 };
      const end = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.5 };

      // Paint with the default selection — Story 2.9 makes that the FIRST ROSTER ROW, which on
      // /battle/new is the seeded default-tool organism (forced decision 4).
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      // ⚠️ NO `steps` — exactly one pointermove, the interpolation-exercising shape Story 2.6's
      // own drag test relies on (cellsBetween, not the browser's own sampling density).
      await page.mouse.move(end.x, end.y);
      await page.mouse.up();
      const paintedPixels = await countChangedPixels(canvas);
      expect(paintedPixels).toBeGreaterThan(0); // the drag itself must have painted something.

      // Drive the SIDEBAR ROW the way a user does — by its accessible name, not a test id or
      // class — which is what makes the AC5 keyboard/axe claim more than a unit-test artefact.
      // Story 2.9 replaced the provisional 'Erase' toggle with the roster's pinned eraser row.
      await page.getByRole('button', { name: 'Eraser' }).click();

      // Erase over the EXACT same path.
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y);
      await page.mouse.up();

      // THE reversal claim: painted pixels return to (at or near) the pre-paint floor — a
      // return-to-floor assertion, not a bare "some cells changed" one, which a broken
      // interpolation would also satisfy.
      //
      // ⚠️ NOT a near-zero bound (measured empirically ~30-35% residual, both here and on an
      // isolated single-cell paint+erase with no adjacent-cell interaction at all). The
      // residual is `restoreGridLinesOver`'s own known property (gridRenderer.ts), not an
      // eraser defect: it repaints each dirty cell's FOUR border segments independently, so two
      // segments meeting at a shared edge or corner (adjacent cells in one drag batch, or one
      // cell's own corner) each re-composite the semi-transparent `--gol-border` line on a
      // freshly-filled background — a DOUBLE alpha blend the ONE-pass full paint
      // (`drawGridLinesInto`) never produces. It is identical after paint and after erase (same
      // code path, same batch shape), so it is stable, not growing, and it is this story's
      // Dev Notes-cited frozen infrastructure (Story 2.3) — "do not add caching or dedupe on top
      // of it" — not something to patch here.
      //
      // ⚠️ review (2026-08-27): this assertion does NOT pin interpolation, and the comment
      // previously claimed it did. Both halves of the gesture run the same single `mouse.move`
      // through the same `cellsBetween`, so breaking interpolation shrinks `paintedPixels` and
      // the residual TOGETHER and the ratio still passes. Interpolation is genuinely pinned at
      // the unit level (`PetriDishCanvas.test.tsx`'s interpolated-erase test, mutation-checked
      // against `cellsBetween` -> `[cell]`). What this test does pin, and what no unit test can,
      // is that a real browser's pointer capture, geometry and DPR round-trip a paint and an
      // erase over identical coordinates back to the pre-paint floor. A binding lower floor on
      // `paintedPixels` (the shape Story 2.6's review used: a multiple of a single click's
      // pixels) needs its own calibration run — recorded in deferred-work.md rather than guessed
      // at here, since an uncalibrated floor is a flaky CI failure, not a stronger test.
      const remainingChangedPixels = await countChangedPixels(canvas);
      expect(remainingChangedPixels).toBeLessThan(paintedPixels * 0.6);

      expect(errors).toEqual([]);
    },
  );

  // Story 2.8 (AC3, AC4, AC5): UNDO, end to end, with real layout and a real pointer. Structured
  // as the eraser reversal test above is, and for the same reason — "some pixels changed" would
  // pass against an undo that reverted the wrong gesture, or none.
  test('painting then pressing UNDO returns painted pixels toward the pre-paint floor (AC4)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const canvas = page.getByRole('img', { name: /petri dish/i });
    await expect(canvas).toBeAttached();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('dish has no layout box');
    await snapshotBaseline(canvas);

    // AC5: a freshly seeded battle has nothing to undo, and the button says so.
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();

    const start = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.5 };
    const end = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.5 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // ⚠️ NO `steps` — one pointermove, so the stroke's own `cellsBetween` interpolation is what
    // fills the span, exactly as the paint/erase drags above do.
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();

    const paintedPixels = await countChangedPixels(canvas);
    expect(paintedPixels).toBeGreaterThan(0);
    await expect(undo).toBeEnabled(); // AC5: one committed gesture, one undo level.

    await undo.click();

    // ⚠️ The SAME generous threshold as the eraser reversal above, and for the identical reason:
    // `restoreGridLinesOver` double-composites the translucent grid line at shared cell edges and
    // corners, so ~30-35% of the painted pixels legitimately differ from the baseline after a
    // PERFECT reversal (deferred-work.md, Story 2.7). The canvas is not pixel-reversible even
    // though the grid state is exactly reversible — an e2e demanding near-zero residual fails
    // against correct code. Undo repaints via `drawFull` rather than the eraser's dirty path, so
    // if anything the residual here is smaller; the bound is kept identical rather than tightened
    // on one uncalibrated observation.
    const remaining = await countChangedPixels(canvas);
    expect(remaining).toBeLessThan(paintedPixels * 0.6);

    // AC3/AC8: the whole drag was ONE entry, so one press consumed the ring.
    await expect(undo).toBeDisabled();

    expect(errors).toEqual([]);
  });

  // Same pattern as the click-placement and drag axe checks above — regression check, not a new
  // accessibility claim, now covering the erase gesture and the sidebar row it goes through.
  test('has no axe accessibility violations on /battle/new after an erase', async ({ page }) => {
    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const canvas = page.getByRole('img', { name: /petri dish/i });
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('dish has no layout box');

    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
    await page.mouse.up();

    await page.getByRole('button', { name: 'Eraser' }).click();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
    await page.mouse.up();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // Story 2.11 (AC1, AC2, AC6): the composed route is the only place the sidebar field, the
  // header and the real browser tab title can all be checked together against the SAME keystroke.
  test('shows the stored name in the sidebar, and typing updates the header and the tab title live (AC1, AC2, AC6)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const nameField = page.getByRole('textbox', { name: /battle name/i });
    await expect(nameField).toHaveValue('Three-Way Skirmish');
    await expect(page).toHaveTitle('Three-Way Skirmish · Game of Life Studio');

    // `.fill()`, not `.pressSequentially()`: the caret position after a bare `.click()` is engine-
    // dependent (and not necessarily end-of-text even after an explicit `End` press in this
    // environment), which is immaterial to what this test actually claims — that the header and
    // the tab title track the field's VALUE live, not that keystrokes land at a particular offset.
    await nameField.fill('Three-Way Skirmish!');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish!');
    await expect(page).toHaveTitle('Three-Way Skirmish! · Game of Life Studio');
  });

  // AC3/AC5 through forced decision 3's chosen observability: `data-dirty` on `<BattlePage>`'s
  // Root, which the decision picked precisely because it "gives both unit AND e2e a real
  // assertion" — the unit half shipped, this is the other half. Asserted in BOTH states, never as
  // presence/absence: an attribute that is missing and one that reads 'false' are the same thing
  // to a selector that has gone stale.
  test('starts clean and goes dirty on a name edit, observable on the page root (AC3, AC5)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const root = page.locator('[data-dirty]');
    await expect(root).toHaveAttribute('data-dirty', 'false');

    await page.getByRole('textbox', { name: /battle name/i }).fill('Three-Way Skirmish!');

    await expect(root).toHaveAttribute('data-dirty', 'true');
  });

  // AC5, and it stays true until Story 2.13: nothing this story writes reaches a repository, so a
  // reload — which discards all React state and re-reads localStorage from scratch — must show the
  // ORIGINAL stored name, not the typed edit.
  test('a reload restores the stored name — nothing this story writes is persisted (AC5)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const nameField = page.getByRole('textbox', { name: /battle name/i });
    await nameField.fill('Renamed But Not Saved');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Renamed But Not Saved');

    await page.reload();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.getByRole('textbox', { name: /battle name/i })).toHaveValue(
      'Three-Way Skirmish',
    );
  });

  // AC2: clearing the field is the one case `battleDisplayName`'s trim-and-fallback has to cover
  // live, with no save and no blur.
  test('clearing the field on /battle/new leaves the header reading "Untitled Battle" (AC2)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const nameField = page.getByRole('textbox', { name: /battle name/i });
    await nameField.fill('Something');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something');

    await nameField.fill('');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');
  });

  // Same pattern as the click/drag/erase axe checks above — the Battle Name section is new
  // rendered content this story adds to both routes, so both get their own regression check,
  // including after the field has actually been typed into (forced decision 4's live-region
  // choice is exactly what a naive `aria-live="polite"` counter would fail here).
  test('has no axe accessibility violations on /battle after typing in the name field (AC8)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await page.getByRole('textbox', { name: /battle name/i }).pressSequentially(' Renamed');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('has no axe accessibility violations on /battle/new after typing in the name field (AC8)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    await page.getByRole('textbox', { name: /battle name/i }).pressSequentially('New Skirmish');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // Story 2.12 (AC1, AC3, AC7): the composed route is the only place the real roster's names and
  // the real grid's contents can be proven to reach the bar TOGETHER — unit tests stub both.
  // Three-Way Skirmish places three organisms under their real names (component-tree-battle-
  // page.md's own fixture), so this is provable without hand-building a battle.
  test('shows real per-organism population counts, labelled by name, in the status bar (AC1, AC3)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await expect(page.getByRole('group', { name: 'Generation: 0' })).toBeVisible();
    // Living Cells is a `role="group"` combined name too, so this also proves the value is a real
    // (non-zero) number rather than merely present.
    await expect(
      page
        .getByRole('region', { name: 'Battle statistics' })
        .getByRole('group', { name: /^Living Cells: [1-9]\d*$/ }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /^Aggressive Colonizer: \d+$/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Patient Defender: \d+$/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Chaotic Spreader: \d+$/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Battle statistics' })).toBeVisible();
  });

  test('has no axe accessibility violations on the status bar’s stats row', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.getByRole('region', { name: 'Battle statistics' })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // Story 2.12 (AC6, Task 6): a deliberately short AND narrow viewport, the shape both
  // deferred-work.md entries this story owns describe — a wide-but-short window makes the dish
  // taller than `<GridContainer>`, and Story 2.9's 320px sidebar makes it narrower besides. A
  // one-off `setViewportSize` here rather than a fifth Playwright project (four projects × a
  // fifth is real CI time, per the story's own Task 6).
  test('keeps the dish fully within the viewport and the sidebar at its full width, at a short/narrow viewport (AC6)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    const viewport = { width: 700, height: 500 };
    await page.setViewportSize(viewport);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    // (b) The 320px sidebar is intact — `flexShrink: 0` (EditorSidebar) means the DISH is the
    // element that gives ground, never the sidebar.
    const sidebarBox = await page.getByRole('complementary').boundingBox();
    if (sidebarBox === null) throw new Error('sidebar has no layout box');
    expect(sidebarBox.width).toBeCloseTo(320, 0);

    // (a) The dish box is fully within its container — bounded by the viewport itself, since
    // nothing on this route scrolls (forced decision 4's whole point: "the whole grid visible").
    // The pre-fix defect (deferred-work.md) was a centred-flex item TALLER than its container,
    // whose top overflow is unreachable by scrolling — this would show up here as `canvasBox.y`
    // reading negative or `canvasBox.y + canvasBox.height` exceeding the viewport height.
    const canvasBox = await page.getByRole('img', { name: /petri dish/i }).boundingBox();
    if (canvasBox === null) throw new Error('dish has no layout box');
    expect(canvasBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width);
    expect(canvasBox.y).toBeGreaterThanOrEqual(0);
    expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(viewport.width);
    expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(viewport.height);

    // review (2026-08-28): the four bounds above are all UPPER bounds, and a 0x0 box satisfies
    // every one of them — so a dish that collapsed instead of fitting would pass the test written
    // to prove it fits. A collapse is not hypothetical here: the sizing this AC changes is
    // exactly what a circular width/height dependency would zero out. Assert the dish still has
    // real area, and still fills the space actually left to it beside the 320px sidebar.
    expect(canvasBox.width).toBeGreaterThan(100);
    expect(canvasBox.height).toBeGreaterThan(60);
    expect(canvasBox.width).toBeGreaterThan((viewport.width - sidebarBox.width) / 2);

    // review (2026-08-28): the status bar's new stats row is the other thing that can widen this
    // route. Measured before the fix, at this very viewport and with only the fixture's three
    // organisms: `document.scrollWidth` 823 against a 700px viewport, with UNDO's right edge at
    // 864 — i.e. the bar's one control rendered off-screen. Assert the DOCUMENT, not just the
    // dish's box, or the row can push the page wide while every box-level check stays green.
    const docWidth = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(docWidth.scrollWidth).toBeLessThanOrEqual(docWidth.clientWidth);

    const undoBox = await page.getByRole('button', { name: 'Undo' }).boundingBox();
    if (undoBox === null) throw new Error('undo has no layout box');
    expect(undoBox.x + undoBox.width).toBeLessThanOrEqual(viewport.width);
  });

  // Story 2.12 AC6, the half the 700x500 test above does NOT cover (review, 2026-08-28). At
  // 700x500 the dish's width-driven height (188px) already fits the ~376px available, so every
  // assertion there passes against the UNFIXED code — it guards the narrow/sidebar half only.
  // A WIDE-but-SHORT viewport is the shape `deferred-work.md`'s entry actually describes, and it
  // is where the defect was measurable: before the fix, 1400x420 rendered a 600px-tall dish and
  // left `documentElement.scrollHeight` at 784 against a 420px viewport — 278px of it below the
  // fold, and (being a centred flex item) unreachable overflow above it too.
  test('does not overflow the fold at a WIDE but SHORT viewport (AC6)', async ({ page }) => {
    await seedWorkspace(page);
    const viewport = { width: 1400, height: 420 };
    await page.setViewportSize(viewport);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const canvasBox = await page.getByRole('img', { name: /petri dish/i }).boundingBox();
    if (canvasBox === null) throw new Error('dish has no layout box');
    expect(canvasBox.y).toBeGreaterThanOrEqual(0);
    expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(viewport.height);
    // Still a real dish, not a collapsed one.
    expect(canvasBox.width).toBeGreaterThan(100);
    expect(canvasBox.height).toBeGreaterThan(60);

    // ⚠️ THE assertion this test exists for, and the one the box-only checks above cannot make:
    // the ROUTE does not scroll. `<PetriDishBox>`'s `maxHeight: '100%'` is inert unless every
    // ancestor up to `<Root>` has a definite height, and a box that fits while the PAGE scrolls
    // is the exact state the first commit shipped.
    const doc = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(doc.scrollHeight).toBeLessThanOrEqual(doc.clientHeight);
  });
});

/**
 * Story 2.13 only. `seedWorkspace()` above registers an init script that runs before EVERY document
 * load and overwrites `gol:battles` unconditionally — correct for every test that only READS, and
 * fatal here: `page.goto('/')` after a save would wipe the battle that was just written and the
 * Gallery would show the two fixtures again, with no failure that names the cause. This variant
 * writes the identical payload only when the workspace has never been stamped, so the second
 * document load leaves the saved record alone.
 *
 * ⚠️ A separate helper rather than a conditional inside `seedWorkspace`: those three
 * `buildSeedPayload`/`seedWorkspace` copies are hand-synced across spec files (deferred-work.md),
 * and adding a branch only this story needs is exactly the silent divergence that entry warns
 * about. Same reasoning `seedConwaysClassic` above already records.
 */
async function seedWorkspaceIfFresh(page: Page) {
  const payload = buildSeedPayload();

  await page.addInitScript(
    ([keys, formatVersion, data]) => {
      const storageKeys = keys as Record<string, string>;
      if (localStorage.getItem(storageKeys.schema) !== null) return;
      localStorage.setItem(storageKeys.schema, JSON.stringify({ formatVersion }));
      localStorage.setItem(
        storageKeys.battles,
        JSON.stringify((data as { battles: unknown }).battles),
      );
      localStorage.setItem(
        storageKeys.organisms,
        JSON.stringify((data as { organisms: unknown }).organisms),
      );
    },
    [STORAGE_KEYS, CURRENT_FORMAT_VERSION, payload] as const,
  );
}

/**
 * Story 2.13 (AC2, AC4). The composed route is the only place the save can be proven END TO END:
 * a projection bug that violates `BattleSchema` stores fine, and then surfaces as an `unavailable`
 * Gallery tile and nowhere else — `battles.load()` throws `CorruptDataError` rather than returning
 * a record, `<BattleTile>` catches it, and no unit test in this repo would notice.
 */
test.describe('saving a battle (Story 2.13)', () => {
  test('saves a new battle, and the Gallery shows it with a live thumbnail (AC2, AC4)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspaceIfFresh(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    // Nothing edited yet, so there is nothing to save — a draft the user has not touched must not
    // be writable, or every visit to this route could leave an empty battle in the Gallery.
    const save = page.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();

    // Paint a real cell so the record has placed content: an all-empty grid would still store and
    // still render a thumbnail, and would prove nothing about the H.1 prune or the E.2 remap.
    await page.getByRole('img', { name: /petri dish/i }).click();
    await page.getByRole('textbox', { name: /battle name/i }).fill('Saved From The Lab');
    await expect(save).toBeEnabled();

    await save.click();

    // AC4: the dirty flag clears only once the write resolved, so this is the observable signal
    // that `battles.save` actually completed rather than merely being called.
    await expect(save).toBeDisabled();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    await page.goto('/');
    // Two seeded fixtures plus the one just saved.
    await expect(page.getByRole('article')).toHaveCount(3);
    const tile = page.getByRole('article').filter({ hasText: 'Saved From The Lab' });
    await expect(tile).toHaveCount(1);
    // FR-7.3: `updatedAt` was stamped now, so the freshest battle sorts first.
    await expect(page.getByRole('article').first()).toContainText('Saved From The Lab');

    // ⚠️ THE assertion this test exists for. `<BattleTile>` only mounts a canvas in its 'ready'
    // state, which it reaches by `battles.load(id)` succeeding — i.e. by the saved record parsing
    // through `BattleSchema` — and then painting it through the real renderer (M4: thumbnails are
    // rendered on demand, never stored). A pruned roster with un-remapped cells fails that parse
    // and leaves an empty box here, with no error anywhere else.
    await expect(tile.locator('canvas')).toBeAttached();

    expect(errors).toEqual([]);
  });

  test('re-opening the saved battle restores its name and its painted grid (AC2, AC4)', async ({
    page,
  }) => {
    await seedWorkspaceIfFresh(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const dish = page.getByRole('img', { name: /petri dish/i });
    const emptyColours = await distinctColorCount(dish);
    await dish.click();
    await expect
      .poll(async () => distinctColorCount(dish), { timeout: 2000 })
      .toBeGreaterThan(emptyColours);

    await page.getByRole('textbox', { name: /battle name/i }).fill('Reopened Battle');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    // Back to the Gallery and in again by its own tile — the same route a user takes, and the only
    // one that proves the minted id is reachable from outside the editor session that made it.
    await page.goto('/');
    await page.getByRole('link', { name: 'Reopened Battle' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reopened Battle');
    await expect(page.getByRole('textbox', { name: /battle name/i })).toHaveValue(
      'Reopened Battle',
    );

    // The reloaded dish paints the same number of distinct colours as the saved one did: the cell
    // is back, in an organism's colour, which is what a correct roster + remap round trip produces.
    const reopened = page.getByRole('img', { name: /petri dish/i });
    await expect
      .poll(async () => distinctColorCount(reopened), { timeout: 2000 })
      .toBeGreaterThan(emptyColours);
    // And a freshly loaded battle is CLEAN — the save is what made it so, not the navigation.
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('has no axe accessibility violations after a save', async ({ page }) => {
    await seedWorkspaceIfFresh(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    await page.getByRole('textbox', { name: /battle name/i }).fill('Axe Scan Battle');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

/**
 * Story 2.14 — edit-mode grid resize, end to end (AC2, AC3, AC4, AC5, AC7).
 *
 * The composed route is the only place the four dormant paths this story wakes up can be proven
 * together: a live `size` change reconstructs the renderer against REAL layout, `resizeGrid`'s
 * anchoring is visible in painted pixels, and the saved `gridSize` has to survive a round trip
 * through `BattleSchema` (a projection that violates it stores fine and surfaces only as an
 * `unavailable` Gallery tile).
 */
test.describe('edit-mode grid resize (Story 2.14)', () => {
  /**
   * ⚠️ `.click()`, never `.check()`, on the preset radios. Playwright's `check()` asserts the
   * control ENDED UP checked — which is exactly what a shrink that opens the warning must NOT do,
   * because nothing is committed until confirm and the control reads the live grid. `check()`
   * therefore fails against correct code on every clipping path.
   */

  /** The Grid Info section's own reading of the live grid's dimensions. */
  function gridSizeFact(page: Page): Locator {
    return page.getByRole('complementary').getByRole('group', { name: /^Grid Size: / });
  }

  test('a GROW commits immediately, with no warning (AC2, AC3, AC7)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
      // ⚠️ The paint-observe cycle assertion. `ResizeObserver` reports a box change, the effect
      // repaints, the repaint writes canvas.width/height — observing the wrong element turns that
      // into a loop the browser reports as a WARNING, never an error, so an error-only filter
      // would never see it. A live `size` change is the first thing to re-register that observer.
      if (msg.text().includes('ResizeObserver loop')) errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 50 by 30');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    await page.getByRole('radio', { name: '100 by 60' }).click();

    // ❌ Growing NEVER warns — it discards nothing (Decision A.3).
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 100 by 60');
    await expect(
      page.getByRole('complementary').getByRole('group', { name: /^Total Cells: / }),
    ).toHaveAttribute('aria-label', 'Total Cells: 6,000');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');
    // The dish survived the live `size` change and is still painting (AC7).
    await expect(page.getByRole('img', { name: /petri dish/i })).toBeVisible();
    expect(
      await distinctColorCount(page.getByRole('img', { name: /petri dish/i })),
    ).toBeGreaterThan(1);

    expect(errors).toEqual([]);
  });

  test('a shrink that clips WARNS, and the confirmed size survives a save and reload (AC3, AC5)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.text().includes('ResizeObserver loop')) errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    // ⚠️ `seedWorkspaceIfFresh`, never `seedWorkspace`: this test SAVES and then navigates, and
    // the shared seeder runs on every document load — it would overwrite the saved record on the
    // way back in (Story 2.13 Debug Log 2).
    await seedWorkspaceIfFresh(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleB}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grand Colony War');
    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 100 by 60');

    // Paint in the BOTTOM-RIGHT quadrant, which no 50 x 30 rectangle anchored at the top-left can
    // contain — the seeded fixture places its roster centrally, so without this the shrink clips
    // nothing and applies silently (trap 6), and the test would pass for the wrong reason.
    const dish = page.getByRole('img', { name: /petri dish/i });
    const box = await dish.boundingBox();
    if (box === null) throw new Error('the dish has no layout box');
    await dish.click({ position: { x: box.width * 0.9, y: box.height * 0.9 } });
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');

    await page.getByRole('radio', { name: '50 by 30' }).click();

    // AC3: the consequence is stated BEFORE the action, and it names LIVING cells.
    const dialog = page.getByRole('dialog', { name: 'Cells Will Be Discarded' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/living cell/i);
    await expect(dialog).toContainText('50 by 30');
    // Nothing has committed yet — and the editor behind the dialog is genuinely INERT and hidden
    // from assistive technology while it is open (`useInertBackground` + MUI's own
    // `ariaHiddenSiblings`), which is why the Grid Info fact is not queryable from here. The
    // "still reads the current size" half is asserted on the cancel path below, once the
    // background has been released.
    await expect(page.getByRole('complementary')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Resize Grid' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 50 by 30');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    // AC5: out and back in through the Gallery — the route a user takes, and the only one that
    // proves the record parsed back through `BattleSchema` at the new size.
    await page.goto('/');
    await page.getByRole('link', { name: 'Grand Colony War' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grand Colony War');
    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 50 by 30');
    await expect(page.getByRole('radio', { name: '50 by 30' })).toBeChecked();
    // The surviving cells came back with it — a battle that reloads blank would satisfy every
    // dimension assertion above.
    expect(
      await distinctColorCount(page.getByRole('img', { name: /petri dish/i })),
    ).toBeGreaterThan(1);

    expect(errors).toEqual([]);
  });

  test('cancelling the warning changes nothing at all (AC3)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleB}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grand Colony War');

    const dish = page.getByRole('img', { name: /petri dish/i });
    const box = await dish.boundingBox();
    if (box === null) throw new Error('the dish has no layout box');
    await dish.click({ position: { x: box.width * 0.9, y: box.height * 0.9 } });

    await page.getByRole('radio', { name: '50 by 30' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cells Will Be Discarded' });
    await expect(dialog).toBeVisible();

    // AC8: Escape is the keyboard's Cancel — MUI v9 has no `disableEscapeKeyDown`, so this is
    // routed through the same `onClose` a backdrop click takes.
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 100 by 60');
    // AC8: focus came back to the control that opened the dialog, not to <body>.
    await expect(page.getByRole('radio', { name: '50 by 30' })).toBeFocused();
    await expect(page.getByRole('radio', { name: '100 by 60' })).toBeChecked();
  });

  test('UNDO after a resize restores the previous dimensions and content (AC4)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.text().includes('ResizeObserver loop')) errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const dish = page.getByRole('img', { name: /petri dish/i });
    const coloursBefore = await distinctColorCount(dish);
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();

    await page.getByRole('radio', { name: '100 by 60' }).click();
    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 100 by 60');
    // ONE commit, therefore ONE ring entry — a resize that pushed two would need two undos.
    await expect(undo).toBeEnabled();

    await undo.click();

    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 50 by 30');
    await expect(undo).toBeDisabled();
    // The dish repainted at the OLD size, with the same palette on it — the renderer
    // reconstruction the undo path now triggers too (AC7).
    await expect.poll(async () => distinctColorCount(dish), { timeout: 2000 }).toBe(coloursBefore);

    expect(errors).toEqual([]);
  });

  test('has no axe accessibility violations with the resize warning open (AC8)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleB}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grand Colony War');

    const dish = page.getByRole('img', { name: /petri dish/i });
    const box = await dish.boundingBox();
    if (box === null) throw new Error('the dish has no layout box');
    await dish.click({ position: { x: box.width * 0.9, y: box.height * 0.9 } });

    await page.getByRole('radio', { name: '50 by 30' }).click();

    // THREE waits, not one — the pattern `deleteBattle.spec.ts` established and the reason it
    // gives: `toBeVisible()` passes the instant the element has a box, well before MUI's Fade
    // settles, and `Button`'s own root `background-color`/`color` transition (duration.short =
    // 250ms) is UNSYNCHRONISED with that Fade. Scanning between the two settle points makes axe
    // compute colour-contrast against blended, transitional colours — measured here on WebKit as
    // 93 violations, including the confirm button at 1.89:1 against a half-faded fill.
    const dialog = page.getByRole('dialog', { name: 'Cells Will Be Discarded' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('has no axe accessibility violations after a resize (AC8)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await page.getByRole('radio', { name: '100 by 60' }).click();
    await expect(gridSizeFact(page)).toHaveAttribute('aria-label', 'Grid Size: 100 by 60');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

/**
 * Story 2.15 — Clear Petri Dish, end to end (AC1, AC2, AC3, AC4, AC5, AC7).
 *
 * The composed route is where the Clear -> Save -> reload consequence (trap 5: `organismIds: []`
 * survives the real schema and the roster section really does reach its empty state) is provable
 * at all — a unit test can assert the projection, but not that the record actually reloads.
 */
test.describe('Clear Petri Dish (Story 2.15)', () => {
  test('CLEAR empties the dish, and UNDO restores the painted cells (AC1, AC2)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const dish = page.getByRole('img', { name: /petri dish/i });
    // Baseline is the SKIRMISH battle's own painted state — the same "snapshot before, diff
    // after" shape Story 2.7's erase and Story 2.8's undo e2e tests use, just starting from a
    // POPULATED dish rather than an empty one.
    await snapshotBaseline(dish);

    const clear = page.getByRole('button', { name: /clear petri dish/i });
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(clear).toBeEnabled();
    await expect(undo).toBeDisabled();

    await clear.click();

    // The dish moved away from the painted baseline — the organisms' cells are gone.
    const clearedPixels = await countChangedPixels(dish);
    expect(clearedPixels).toBeGreaterThan(0);
    // ⚠️ Story 2.15 review: `clearedPixels > 0` alone says the dish CHANGED, not that it is empty
    // — a clear that zeroed only the first row would satisfy it, and the undo check below is
    // relative to the same number, so it would stay self-consistent under that bug. The status
    // bar's own count is the assertion that says "empty".
    await expect(
      page
        .getByRole('region', { name: 'Battle statistics' })
        .getByRole('group', { name: 'Living Cells: 0' }),
    ).toBeVisible();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');
    // ONE commit, therefore ONE ring entry.
    await expect(undo).toBeEnabled();
    // AC3: nothing left to clear, so the control disables itself.
    await expect(clear).toBeDisabled();

    await undo.click();

    // Both the Clear and the Undo repaint via the grid effect's `drawFull` (a full repaint from
    // grid state, not the eraser's incremental dirty-region compositing), so the return to the
    // painted baseline is exact — no `restoreGridLinesOver` double-blend residual to allow for.
    await expect
      .poll(async () => countChangedPixels(dish), { timeout: 2000 })
      .toBeLessThan(clearedPixels * 0.05);
    await expect(undo).toBeDisabled();
    await expect(clear).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test('clicking CLEAR on an already-empty grid does nothing (AC3)', async ({ page }) => {
    await seedWorkspaceIfFresh(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const clear = page.getByRole('button', { name: /clear petri dish/i });
    await expect(clear).toBeDisabled();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('Clear -> Save -> reload: the battle opens empty, roster in its empty state (AC5, trap 5)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    // ⚠️ `seedWorkspaceIfFresh`, never `seedWorkspace`: this test SAVES and then navigates, and
    // the shared seeder runs on every document load — it would overwrite the saved record on the
    // way back in (Story 2.13 Debug Log 2).
    await seedWorkspaceIfFresh(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await page.getByRole('button', { name: /clear petri dish/i }).click();
    // The count right after Clear (background + grid lines, at THIS grid's dimensions) is the
    // "genuinely empty" baseline the reload is checked against below — robust to however many
    // distinct RGBA values the background/grid-line composite happens to produce, which
    // `toBe(1)` would assume away.
    const emptyColours = await distinctColorCount(page.getByRole('img', { name: /petri dish/i }));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    // Out and back in through the Gallery — the route a user takes, and the only one that proves
    // the pruned `organismIds: []` record actually parses back through `BattleSchema`.
    await page.goto('/');
    await page.getByRole('link', { name: 'Three-Way Skirmish' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    // The dish reopens exactly as empty as it was right after the Clear — nothing survived save.
    const dish = page.getByRole('img', { name: /petri dish/i });
    expect(await distinctColorCount(dish)).toBe(emptyColours);
    // Trap 5's downstream consequence: no placed organisms survived the prune, so the roster
    // section has nothing to list — no `role="list"` at all — and the tool falls back to the
    // eraser (spec §3.3: "eraser when the roster is empty").
    await expect(page.getByRole('list')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eraser' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    expect(errors).toEqual([]);
  });

  test('the Tools section renders exactly one button; no other MVP-excluded controls anywhere (AC4)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await expect(page.getByRole('heading', { level: 2, name: 'Tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: /clear petri dish/i })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /export battle/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /reset to saved/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /randomize/i })).toHaveCount(0);
  });

  test('has no axe accessibility violations on /battle with the Tools section present (AC7)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.getByRole('button', { name: /clear petri dish/i })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('has no axe accessibility violations on /battle/new with the Tools section present (AC7)', async ({
    page,
  }) => {
    await seedWorkspaceIfFresh(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');
    await expect(page.getByRole('button', { name: /clear petri dish/i })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // AC7: keyboard-operable with a visible focus ring.
  //
  // ⚠️ Story 2.15 review, on what this does and does NOT prove. A programmatic `.focus()` matches
  // `:focus`, `:focus-within` and `:focus-visible` alike, so this cannot tell trap 8's substitution
  // apart — swapping the rule to `:focus-within` leaves it green. It also proves nothing about tab
  // ORDER. What it does prove is that the control takes focus and that Enter reaches `onClear`.
  // The modality-sensitive half is recorded in deferred-work.md rather than faked here.
  test('CLEAR PETRI DISH is keyboard-reachable and shows a visible focus ring (AC7)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const dish = page.getByRole('img', { name: /petri dish/i });
    await snapshotBaseline(dish);

    const clear = page.getByRole('button', { name: /clear petri dish/i });
    await clear.focus();
    await expect(clear).toBeFocused();
    await expect(clear).toHaveCSS('outline-style', 'solid');

    await page.keyboard.press('Enter');

    // Enter on a focused <button> activates it exactly like a click — the dish moved away from
    // its painted baseline, proving the keypress actually reached `onClear`.
    await expect.poll(async () => countChangedPixels(dish), { timeout: 2000 }).toBeGreaterThan(0);
  });
});
