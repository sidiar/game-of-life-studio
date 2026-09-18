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

// Hoisted to module scope (Story 3.12, Task 5): Story 3.11's Run-mode helpers, shared with 3.12's
// transport-control block below rather than duplicated. `runButton` / `labButton` / `dish` /
// `collectErrors` are the Run route's Lab⇄Run and playback-dish fixtures; both `test.describe`
// blocks below use them.
const runButton = (page: Page): Locator => page.getByRole('button', { name: 'Run' });
const labButton = (page: Page): Locator => page.getByRole('button', { name: 'Lab' });
const dish = (page: Page): Locator => page.getByRole('img', { name: /petri dish/i });
const sidebarHeadings = (page: Page): Locator =>
  page.getByRole('complementary').getByRole('heading', { level: 2 });
// Story 3.13: the Run sidebar's speed slider, by its accessible name. The `{ name }` is not
// optional — Story 3.16's Grid Size control is a second `role="slider"` in the same sidebar, and a
// bare `getByRole('slider')` stops being unambiguous the day it lands.
const speedSlider = (page: Page): Locator =>
  page.getByRole('slider', { name: 'Generations per second' });
// Story 3.16: the Run sidebar's grid-size slider, mirroring `speedSlider` above.
const gridSizeSlider = (page: Page): Locator =>
  page.getByRole('slider', { name: 'Grid dimensions' });
// Story 3.14: the population rows, scoped to the sidebar — `getByRole('listitem')` alone would
// also see any future list the main chassis grows.
const populationRows = (page: Page): Locator =>
  page.getByRole('complementary').getByRole('listitem');

// Story 3.17 (Trap 4): Playwright's `getByRole(…, { name })` is a case-insensitive SUBSTRING match
// by default, so the moment a tile also renders `Run ${name}` (below), every bare
// `getByRole('link', { name: <battle name> })` resolves to TWO elements and fails strict mode.
// `exact: true` is the fix; hoisted here so the five converted call sites below (and any future
// one) share it rather than repeating the option inline.
const tileLink = (page: Page, name: string): Locator =>
  page.getByRole('link', { name, exact: true });
// The Gallery's Run affordance (AC1). `exact: true` here too — `Run Three-Way Skirmish` would
// otherwise substring-match a hypothetical `Run Three-Way Skirmish II`, and it keeps this helper
// symmetric with `tileLink` above.
const runLink = (page: Page, name: string): Locator =>
  page.getByRole('link', { name: `Run ${name}`, exact: true });
// Story 3.18 (3.17 Trap 4 again): `exact: true` on BOTH — `Fullscreen` is a case-insensitive
// substring of `Exit fullscreen`, so a bare `{ name: 'Fullscreen' }` resolves to two buttons while
// the stage is up and strict-fails. `runButton`'s `'Run'` matches neither (the stage's badge is a
// `<span>`, not a button).
const fullscreenButton = (page: Page): Locator =>
  page.getByRole('button', { name: 'Fullscreen', exact: true });
const exitFullscreenButton = (page: Page): Locator =>
  page.getByRole('button', { name: 'Exit fullscreen', exact: true });

/** Every test using this asserts a clean console: the Run toggle mounts a lazy chunk and a second
 * canvas, and both `buildRefToFillGroup`'s warn-once and the ResizeObserver loop report there, not
 * as test failures. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('ResizeObserver loop')) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
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

    await tileLink(page, 'Three-Way Skirmish').click();

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
    // Low-centre: below the title, clear of the top-right action band — 62px wide as of Story
    // 3.17 (Run + 6px gap + Delete; the header reserves 68px for it), still well clear of this
    // low-centre point.
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
    await tileLink(page, 'Reopened Battle').click();
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
    await tileLink(page, 'Grand Colony War').click();
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

  test('Clear -> Save -> reload: the battle opens empty, roster re-seeded with Conway (AC5, trap 5)', async ({
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
    // Layered on so the workspace matches PRODUCTION, where M9 guarantees Conway's Classic is
    // present. Without it the fixture library has no Conway, `rosterIds`' seed branch finds
    // `defaultInLibrary === false`, and the roster reopens empty — an outcome production cannot
    // reach. Asserting that emptiness is what this test used to do (review, 2026-08-31).
    await seedConwaysClassic(page);
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
    await tileLink(page, 'Three-Way Skirmish').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    // The dish reopens exactly as empty as it was right after the Clear — nothing survived save.
    const dish = page.getByRole('img', { name: /petri dish/i });
    expect(await distinctColorCount(dish)).toBe(emptyColours);
    // Trap 5's downstream consequence: no placed organisms survived the prune, so the persisted
    // `organismIds` is empty — and `rosterIds` therefore seeds `[DEFAULT_TOOL.organismId]`. The
    // battle reopens listing AND pre-selecting Conway's Classic. Intended, and Sidiar's explicit
    // call (2026-08-31): Conway is the project's inspiration, so a cleared dish hands it back
    // rather than leaving a dead-empty roster. The eraser is NOT selected here.
    await expect(page.getByRole('list')).toHaveCount(1);
    await expect(page.getByRole('button', { name: "Conway's Classic" })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Eraser' })).toHaveAttribute(
      'aria-pressed',
      'false',
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

/**
 * Story 2.16 — back navigation and the unsaved-changes guard, end to end (AC1–AC7, AC9).
 *
 * The composed route is the only place the three mechanisms can be told apart: a real client
 * navigation (which is what unmounts `<BattlePage>` and therefore what AC5's undo reset actually
 * IS), a real MUI dialog with a real focus trap, and a real `beforeunload` listener.
 */
test.describe('back navigation & the unsaved-changes guard (Story 2.16)', () => {
  const backButton = (page: Page): Locator => page.getByRole('button', { name: 'Back to Battles' });
  const leaveDialog = (page: Page): Locator =>
    page.getByRole('dialog', { name: 'Unsaved Changes' });

  /**
   * Dispatches a cancelable `beforeunload` and reports what the page's own listeners did with it
   * (trap 3): whether the event was CANCELLED, and whether `preventDefault()` was the thing that
   * cancelled it.
   *
   * ⚠️ Both, not just the first. `dispatchEvent` returning false is the effect a browser actually
   * acts on, but it cannot mutation-check `preventDefault()` on its own: the legacy
   * `event.returnValue = ''` the guard also writes (RFC-005 Decision 7's snippet carries both)
   * cancels a plain `Event` by itself, in every engine in the matrix — measured here, not assumed,
   * by deleting the `preventDefault()` call and watching all four projects stay green. Wrapping
   * the method is what makes the modern half falsifiable.
   *
   * ❌ It does NOT try to observe the native dialog: a browser will not show one on a page the
   * user has never interacted with (trap 2), so a test that loads a page, sets state
   * programmatically and closes it proves nothing either way.
   */
  async function dispatchBeforeUnload(
    page: Page,
  ): Promise<{ cancelled: boolean; preventDefaultCalled: boolean }> {
    return page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      let preventDefaultCalled = false;
      const original = event.preventDefault.bind(event);
      event.preventDefault = () => {
        preventDefaultCalled = true;
        original();
      };
      const cancelled = !window.dispatchEvent(event);
      return { cancelled, preventDefaultCalled };
    });
  }

  // AC2: the overwhelmingly common path.
  test('a clean battle goes straight to the Gallery, with no dialog (AC1, AC2)', async ({
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
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    await backButton(page).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Gallery');
    await expect(page).toHaveURL('/');
    // ⚠️ Asserted AFTER the navigation has landed, not immediately after the click: a dialog that
    // opened and was then torn down by the navigation would slip past an eager check.
    await expect(page.getByRole('dialog')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  // AC3: Cancel changes NOTHING — including the painted pixels, the dirty flag, and where focus is.
  test('dirty → Cancel keeps the battle, the paint and the focus exactly where they were (AC3, AC6)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const dish = page.getByRole('img', { name: /petri dish/i });
    await snapshotBaseline(dish);
    const box = await dish.boundingBox();
    if (box === null) throw new Error('the dish has no layout box');
    await dish.click({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');
    const paintedPixels = await countChangedPixels(dish);
    expect(paintedPixels).toBeGreaterThan(0);

    await backButton(page).click();

    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('You have unsaved changes. Save before leaving?');
    // Nothing has navigated: the editor is still behind the dialog.
    await expect(page).toHaveURL(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);

    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');
    // The paint survived — Cancel is not an undo.
    expect(await countChangedPixels(dish)).toBe(paintedPixels);
    // AC6: focus came back to the control that opened the dialog, not to <body>. Caught on the
    // webkit and tablet projects and by nothing else.
    await expect(backButton(page)).toBeFocused();
  });

  // AC6: Escape is Cancel — MUI v9 has no `disableEscapeKeyDown`, so it routes through the same
  // `onClose` a backdrop click takes.
  test('Escape closes the guard as a Cancel (AC6)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await page.getByRole('textbox', { name: /battle name/i }).fill('Renamed');
    await backButton(page).click();
    await expect(leaveDialog(page)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Renamed');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');
    await expect(backButton(page)).toBeFocused();
  });

  // AC3: Discard navigates and writes NOTHING — the stored record is byte-identical afterwards.
  test('dirty → Discard leaves, and the stored battle is unchanged (AC3)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const stored = () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.battles);
    const before = await stored();

    await page.getByRole('textbox', { name: /battle name/i }).fill('Discarded Rename');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');
    await backButton(page).click();
    await leaveDialog(page).getByRole('button', { name: 'Discard Changes' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Gallery');
    await expect(page).toHaveURL('/');
    // ⚠️ THE assertion: the same shape `createBattle.spec.ts` uses. A Discard that quietly saved
    // would satisfy every navigation assertion above.
    expect(await stored()).toBe(before);
    await expect(page.getByRole('article').filter({ hasText: 'Discarded Rename' })).toHaveCount(0);
  });

  // AC3/AC7: Save & Leave through the guard mints the record on `/battle/new` and lands on a
  // Gallery that lists it, with a live thumbnail — Story 2.13's path, reached from the dialog.
  test('dirty → Save & Leave writes the battle and the Gallery lists it (AC3, AC7)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    // ⚠️ `seedWorkspaceIfFresh`, never `seedWorkspace`: this test SAVES and then navigates, and the
    // shared seeder runs on every document load — it would overwrite the saved record on the way
    // into the Gallery (Story 2.13 Debug Log 2).
    await seedWorkspaceIfFresh(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    await page.getByRole('img', { name: /petri dish/i }).click();
    await page.getByRole('textbox', { name: /battle name/i }).fill('Saved On The Way Out');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');

    await backButton(page).click();
    await leaveDialog(page).getByRole('button', { name: 'Save & Leave' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Gallery');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('article')).toHaveCount(3);
    const tile = page.getByRole('article').filter({ hasText: 'Saved On The Way Out' });
    await expect(tile).toHaveCount(1);
    // The record parsed back through `BattleSchema` — `<BattleTile>` only mounts a canvas once
    // `battles.load(id)` has succeeded (M4: thumbnails are rendered on demand, never stored).
    await expect(tile.locator('canvas')).toBeAttached();

    expect(errors).toEqual([]);
  });

  /**
   * AC5 (FR-3.8): "undo history resets when returning to the Battle Gallery". ⚠️ This is an
   * assertion ABOUT THE NAVIGATION, not a feature: the ring lives in `<BattlePage>`'s state (AR-30,
   * "component lifetime = undo lifetime") and `router.push('/')` unmounts it. ❌ No reset call
   * exists anywhere; if this ever fails, the navigation stopped unmounting the page — which is the
   * bug, not the missing reset.
   */
  test('returning to the Gallery resets the undo ring (AC5)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();

    const dish = page.getByRole('img', { name: /petri dish/i });
    const box = await dish.boundingBox();
    if (box === null) throw new Error('the dish has no layout box');
    await dish.click({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
    await expect(undo).toBeEnabled();

    await backButton(page).click();
    await leaveDialog(page).getByRole('button', { name: 'Discard Changes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Gallery');

    await tileLink(page, 'Three-Way Skirmish').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    // A fresh mount, a fresh ring — and a clean battle, because the paint was discarded.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');
  });

  /**
   * AC4, in both directions (trap 3). ⚠️ This does NOT try to observe the native dialog: a browser
   * will not show one on a page the user has never interacted with (trap 2), so a test that loads
   * a page, sets state programmatically and closes it proves nothing either way. What it observes
   * is the guard's real effect — a cancelable `beforeunload` that a listener called
   * `preventDefault()` on makes `dispatchEvent` return false.
   *
   * Mutation check: deleting `event.preventDefault()` from `useDirtyGuard` reddens the
   * `preventDefaultCalled` assertion below; dropping the `!isDirty` early return reddens both
   * clean halves.
   */
  test('beforeunload is guarded while dirty and inert when clean (AC4)', async ({ page }) => {
    await seedWorkspaceIfFresh(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    // Clean on arrival: no listener, so nothing is cancelled and nothing prevents.
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');
    expect(await dispatchBeforeUnload(page)).toEqual({
      cancelled: false,
      preventDefaultCalled: false,
    });

    await page.getByRole('textbox', { name: /battle name/i }).fill('Guarded Battle');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');
    expect(await dispatchBeforeUnload(page)).toEqual({
      cancelled: true,
      preventDefaultCalled: true,
    });

    // ...and a save disarms it, which is the half an "is it registered" test alone cannot show.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');
    expect(await dispatchBeforeUnload(page)).toEqual({
      cancelled: false,
      preventDefaultCalled: false,
    });
  });

  // AC1/trap 9: the footer is not a fifth section. The heading structure is unchanged, and the
  // "Back to Gallery" LINK is still absent from `/battle/new` — two different controls (trap 14).
  test('the sidebar still has exactly four headings, and no Back-to-Gallery link (AC1)', async ({
    page,
  }) => {
    await seedWorkspaceIfFresh(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    await expect(page.getByRole('complementary').getByRole('heading', { level: 2 })).toHaveText([
      'Organisms',
      'Battle Name',
      'Grid Info',
      'Tools',
    ]);
    await expect(backButton(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Gallery' })).toHaveCount(0);
  });

  // AC9: a real `<button>`, keyboard-reachable, with a visible focus ring. ⚠️ Like the Story 2.15
  // assertion it mirrors, a programmatic `.focus()` matches `:focus`, `:focus-within` and
  // `:focus-visible` alike, so this cannot tell those apart — see deferred-work.md. What it proves
  // is that the control takes focus and that Enter reaches the guard.
  test('BACK TO BATTLES is keyboard-operable and shows a focus ring (AC9)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const back = backButton(page);
    await back.focus();
    await expect(back).toBeFocused();
    await expect(back).toHaveCSS('outline-style', 'solid');

    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Gallery');
  });

  test('has no axe accessibility violations with the footer present, on /battle (AC9)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(backButton(page)).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('has no axe accessibility violations with the footer present, on /battle/new (AC9)', async ({
    page,
  }) => {
    await seedWorkspaceIfFresh(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');
    await expect(backButton(page)).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('has no axe accessibility violations with the guard open (AC6)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await page.getByRole('textbox', { name: /battle name/i }).fill('Axe Scan');
    await backButton(page).click();

    // THREE waits, not one — the pattern `deleteBattle.spec.ts` established: `toBeVisible()` passes
    // the instant the element has a box, well before MUI's Fade settles, and `Button`'s own
    // background/colour transition is UNSYNCHRONISED with that Fade. Scanning between the two
    // settle points makes axe compute colour-contrast against blended, transitional colours.
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

test.describe('Lab⇄Run mode toggle (Story 3.11)', () => {
  // Three-Way Skirmish: all three roster organisms exist in the seeded library, so RUN is enabled.
  // (Grand Colony War carries the dangling Conway id in an e2e-seeded workspace — see the last
  // test, which uses exactly that.)
  test('flips to Run — paused at cycle 0, the playback dish painted, the editor gone, the URL unchanged — and back (AC1, AC2, AC3, AC5, AC6)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    const url = page.url();

    // The toggle: a named group, LAB pressed, RUN enabled.
    const toggle = page.getByRole('group', { name: 'Mode' });
    await expect(toggle).toBeVisible();
    await expect(labButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(runButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(runButton(page)).toBeEnabled();
    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'lab');

    await runButton(page).click();

    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'run');
    await expect(runButton(page)).toHaveAttribute('aria-pressed', 'true');
    // The Run view is behind a lazy chunk — wait for its root, then read its state.
    const view = page.locator('[data-status]');
    await expect(view).toHaveAttribute('data-status', 'paused');
    await expect(view).toHaveAttribute('data-cycle', '0');
    // FR-3.10 "the playback canvas painted": the hook's prime reached the Run dish.
    await expect(dish(page)).toBeVisible();
    expect(await distinctColorCount(dish(page))).toBeGreaterThan(2);
    // The chassis: four sidebar sections (Population Analysis, Cycle Count — Story 3.14; Speed —
    // Story 3.13; Grid Size — Story 3.16; the 3.11 skeleton had none), one <main>-equivalent
    // chassis, one <h1>, and the editor's controls are gone rather than hidden.
    await expect(sidebarHeadings(page)).toHaveText([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to Battles' })).toHaveCount(1);
    expect(page.url()).toBe(url);

    await labButton(page).click();

    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'lab');
    await expect(sidebarHeadings(page)).toHaveText([
      'Organisms',
      'Battle Name',
      'Grid Info',
      'Tools',
    ]);
    await expect(page.locator('[data-status]')).toHaveCount(0);
    await expect(dish(page)).toBeVisible();
    expect(await distinctColorCount(dish(page))).toBeGreaterThan(2);

    expect(errors).toEqual([]);
  });

  test('UNDO and the dirty flag survive a Run round trip, and the edit dish still shows the paint (AC6, AC9)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    // Paint in the top-left corner, where the seeded fixture places nothing.
    const box = await dish(page).boundingBox();
    if (box === null) throw new Error('the dish has no layout box');
    await dish(page).click({ position: { x: box.width * 0.05, y: box.height * 0.05 } });
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');

    await runButton(page).click();
    await expect(page.locator('[data-status]')).toHaveAttribute('data-cycle', '0');
    await labButton(page).click();

    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');
    await expect(dish(page)).toBeVisible();
    expect(await distinctColorCount(dish(page))).toBeGreaterThan(2);

    expect(errors).toEqual([]);
  });

  test('has no axe accessibility violations in Run mode, and again after returning to Lab (AC11)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    await runButton(page).click();
    await expect(page.locator('[data-status]')).toHaveAttribute('data-status', 'paused');
    await expect(dish(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await labButton(page).click();
    await expect(sidebarHeadings(page)).toHaveCount(4);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    expect(errors).toEqual([]);
  });

  // The guard is Story 2.16's; what is new is the SECOND sidebar's footer reaching it.
  test('Back from Run on a dirty battle opens the Unsaved Changes dialog (AC9)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await page.getByRole('textbox', { name: /battle name/i }).fill('Dirty in Run');

    await runButton(page).click();
    await expect(page.locator('[data-status]')).toHaveAttribute('data-status', 'paused');
    await page.getByRole('button', { name: 'Back to Battles' }).click();

    await expect(page.getByRole('dialog', { name: 'Unsaved Changes' })).toBeVisible();
    // Still in Run, still dirty, underneath the dialog. Attribute reads, not role queries: MUI's
    // modal marks everything outside the dialog `aria-hidden`, so `getByRole('heading')` cannot
    // see the <h1> while the guard is open.
    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'run');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');

    expect(errors).toEqual([]);
  });

  // AC7 / forced decision 4: an e2e-seeded workspace has NO Conway's Classic, and Grand Colony
  // War's roster names it — a genuinely dangling id. RUN is disabled with a reason, not hidden.
  test('disables RUN, with a reason, when a roster id has no library record (AC7)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleB}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grand Colony War');

    await expect(runButton(page)).toBeVisible();
    await expect(runButton(page)).toBeDisabled();
    await expect(runButton(page)).toHaveAttribute(
      'title',
      'Some organisms in this battle could not be loaded',
    );
    await expect(labButton(page)).toBeEnabled();
    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'lab');

    expect(errors).toEqual([]);
  });
});

test.describe('Transport controls (Story 3.12)', () => {
  // Trap 12: `getByRole('button', { name: 'Play' })` finds nothing once the sim is running — the
  // locator is lazy, so it must be re-resolved (or built with a state-agnostic name) per press.
  const playPauseButton = (page: Page): Locator =>
    page.getByRole('button', { name: /^(play|pause)$/i });
  const stepButton = (page: Page): Locator => page.getByRole('button', { name: 'Next cycle' });
  const stopButton = (page: Page): Locator => page.getByRole('button', { name: 'Stop & reset' });
  const view = (page: Page): Locator => page.locator('[data-status]');

  async function enterRun(page: Page): Promise<void> {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
  }

  test('Play advances cycles, Pause holds them, and Play again resumes (AC4)', async ({ page }) => {
    const errors = collectErrors(page);
    await enterRun(page);
    await expect(dish(page)).toBeVisible();
    await snapshotBaseline(dish(page));

    await playPauseButton(page).click();

    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    // Playwright retries `toHaveAttribute` until the assertion holds — the cycle count is
    // eventually-consistent with the RAF loop, never synchronous with the click.
    await expect(view(page)).not.toHaveAttribute('data-cycle', '0');
    await expect.poll(async () => countChangedPixels(dish(page))).toBeGreaterThan(0);

    await playPauseButton(page).click();

    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    const pausedCycle = await view(page).getAttribute('data-cycle');
    await page.waitForTimeout(300);
    await expect(view(page)).toHaveAttribute('data-cycle', pausedCycle ?? '');

    await playPauseButton(page).click();

    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect
      .poll(async () => Number(await view(page).getAttribute('data-cycle')))
      .toBeGreaterThan(Number(pausedCycle));

    expect(errors).toEqual([]);
  });

  test('Next cycle steps exactly one cycle while paused, and is disabled while playing (AC5)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    const before = Number(await view(page).getAttribute('data-cycle'));
    await stepButton(page).click();

    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', String(before + 1));

    await playPauseButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect(stepButton(page)).toBeDisabled();

    expect(errors).toEqual([]);
  });

  test('Stop & reset halts and repaints the dish byte-identical to cycle 0 (AC6)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);
    await expect(dish(page)).toBeVisible();
    await snapshotBaseline(dish(page));

    await playPauseButton(page).click();
    await expect.poll(async () => countChangedPixels(dish(page))).toBeGreaterThan(0);

    await stopButton(page).click();

    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    // ⚠️ If this reads non-zero, that is a `drawFull` that does not clear first or an aliasing
    // artefact (story Task 5c) — diagnose before weakening it to `distinctColorCount`.
    await expect.poll(async () => countChangedPixels(dish(page))).toBe(0);

    expect(errors).toEqual([]);
  });

  test('Tab reaches Play, Next cycle, Stop & reset in order, and Enter on Play keeps focus on the (now Pause) button (AC8)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await page.getByRole('button', { name: 'Back to Battles' }).focus();
    await page.keyboard.press('Tab');
    await expect(playPauseButton(page)).toBeFocused();
    await expect(playPauseButton(page)).toHaveText(/play/i);
    await page.keyboard.press('Tab');
    await expect(stepButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(stopButton(page)).toBeFocused();

    await page.getByRole('button', { name: 'Play' }).focus();
    await page.keyboard.press('Enter');

    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeFocused();

    expect(errors).toEqual([]);
  });

  test('has no axe violations while playing, and again after a Stop (AC8)', async ({ page }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await playPauseButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await stopButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    expect(errors).toEqual([]);
  });

  // AC6 last sentence: transport presses never dirty the battle, and Stop does not touch
  // `initialGrid` — the round trip back to Lab shows the same painted dish and the same (clean)
  // dirty flag.
  test('a Stop, then a round trip back to Lab, leaves the dish and the dirty flag unchanged (AC6)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);
    await expect(dish(page)).toBeVisible();
    const beforeColors = await distinctColorCount(dish(page));
    expect(beforeColors).toBeGreaterThan(2);

    await playPauseButton(page).click();
    // Let the run actually move before stopping — a Stop at cycle 0 has nothing to discard, and
    // this test is about the discard leaving `initialGrid` alone.
    await expect(view(page)).not.toHaveAttribute('data-cycle', '0');
    await stopButton(page).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '0');

    await labButton(page).click();

    await expect(sidebarHeadings(page)).toHaveCount(4);
    await expect(dish(page)).toBeVisible();
    expect(await distinctColorCount(dish(page))).toBe(beforeColors);
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    expect(errors).toEqual([]);
  });
});

test.describe('Speed control (Story 3.13)', () => {
  const playPauseButton = (page: Page): Locator =>
    page.getByRole('button', { name: /^(play|pause)$/i });
  const view = (page: Page): Locator => page.locator('[data-status]');
  const cycle = async (page: Page): Promise<number> =>
    Number(await view(page).getAttribute('data-cycle'));

  async function enterRun(page: Page): Promise<void> {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
  }

  // (a) AC1/AC2: the third Run-sidebar section (Story 3.14 inserted two above it), and the slider
  // at the ladder's default.
  test('the Speed section is the Run sidebar’s third section, with the slider at 10 gen/s (AC1, AC2)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await expect(sidebarHeadings(page)).toHaveText([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);
    await expect(speedSlider(page)).toHaveValue('3');
    await expect(speedSlider(page)).toHaveAttribute('aria-valuetext', '10 generations per second');
    await expect(page.getByText('10 gen/s')).toBeVisible();

    expect(errors).toEqual([]);
  });

  // (b) AC7, trap 2: the keyboard semantics are the browser's own — none re-implemented — which is
  // exactly why they are pinned here and not under jsdom, which does not step a range input.
  test('End, Home and the arrow keys move the slider one detent at a time, and Tab reaches the Grid Size slider then Back to Battles (AC7)', async ({
    page,
    browserName,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await speedSlider(page).focus();
    await expect(speedSlider(page)).toBeFocused();

    await page.keyboard.press('End');
    await expect(speedSlider(page)).toHaveValue('4');
    await expect(page.getByText('20 gen/s')).toBeVisible();

    await page.keyboard.press('Home');
    await expect(speedSlider(page)).toHaveValue('0');
    await expect(page.getByText('1 gen/s')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(speedSlider(page)).toHaveValue('1');
    await expect(page.getByText('2 gen/s')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(speedSlider(page)).toHaveValue('0');

    await page.keyboard.press('ArrowUp');
    await expect(speedSlider(page)).toHaveValue('1');

    await page.keyboard.press('ArrowDown');
    await expect(speedSlider(page)).toHaveValue('0');
    // The bottom detent is the one place the announcement is singular.
    await expect(speedSlider(page)).toHaveAttribute('aria-valuetext', '1 generation per second');

    // Trap 7 (Story 3.16): the Grid Size slider now sits between Speed and the footer while
    // PAUSED (a disabled range input is out of the tab order, so this stop only exists here, not
    // while playing). The footer is still the LAST child of the sidebar, so the SECOND Tab reaches
    // Back to Battles. WebKit needs `Alt+Tab` (the Story 4.1 idiom in `organisms.spec.ts`):
    // measured locally, a plain Tab from a range input leaves `document.activeElement` on `<body>`
    // on macOS WebKit, while Option+Tab — what a real Safari user presses — walks DOM order on
    // every WebKit port. Chromium and Firefox use plain Tab.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.keyboard.press(tab);
    await expect(gridSizeSlider(page)).toBeFocused();

    await page.keyboard.press(tab);
    await expect(page.getByRole('button', { name: 'Back to Battles' })).toBeFocused();

    expect(errors).toEqual([]);
  });

  // (c) AC4: a move while PLAYING is a ref write the loop reads on its next frame — the run keeps
  // going, at the new speed, with nothing paused. Playwright drives a range input through `fill`
  // (it dispatches `input` and `change`). The fast half POLLS rather than sleeping: at 20 gen/sec
  // only even cycles publish (`cyclesPerPublish` is 2), so a fixed window is a bet on the runner's
  // rAF cadence. The slow half proves the slowdown TOOK EFFECT — a loop still at 20 gen/sec moves
  // `data-cycle` by ~8 in 400 ms — and NOT the Story 3.8 FD3 cap: slowing down banks nothing (the
  // accumulator at 20 gen/sec is < 50 ms against a 1000 ms period), so the cap is a no-op on the
  // way down; the burst it guards against is the way UP, pinned by the view test (c′). The +2:
  // `setSpeed` never publishes, so an odd cycle stepped at 20 (unpublished) surfaces with the first
  // 1 gen/sec step as a +2 jump, and a slow runner can reach that step inside the window.
  test('moving the slider while playing keeps the run going at the new speed, without a burst on the way down (AC4)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await playPauseButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect(view(page)).not.toHaveAttribute('data-cycle', '0');

    await speedSlider(page).fill('4');
    await expect(speedSlider(page)).toHaveValue('4');
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect(page.getByText('20 gen/s')).toBeVisible();
    const fastFirst = await cycle(page);
    await expect.poll(() => cycle(page)).toBeGreaterThan(fastFirst);

    await speedSlider(page).fill('0');
    await expect(speedSlider(page)).toHaveValue('0');
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect(page.getByText('1 gen/s')).toBeVisible();
    const slowFirst = await cycle(page);
    await page.waitForTimeout(400);
    expect(await cycle(page)).toBeLessThanOrEqual(slowFirst + 2);

    expect(errors).toEqual([]);
  });

  // (d) AC7: axe on the route in Run mode after a slider move while PLAYING.
  test('has no axe violations in Run mode after a slider move while playing (AC7)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await playPauseButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await speedSlider(page).fill('4');
    await expect(speedSlider(page)).toHaveValue('4');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    expect(errors).toEqual([]);
  });

  // (e) FR-8.12: a live speed change is run-local. It never dirties the battle, and a new Run
  // session starts at `startingSpeed` again — the SETTING is where a preference lives (Story 6.9).
  test('a speed change never dirties the battle, and a new Run session starts back at 10 gen/s (AC4)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await speedSlider(page).fill('4');
    await expect(speedSlider(page)).toHaveValue('4');

    await labButton(page).click();
    await expect(sidebarHeadings(page)).toHaveCount(4);
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(speedSlider(page)).toHaveValue('3');
    await expect(speedSlider(page)).toHaveAttribute('aria-valuetext', '10 generations per second');

    expect(errors).toEqual([]);
  });
});

test.describe('Cycle counter & population stats (Story 3.14)', () => {
  const view = (page: Page): Locator => page.locator('[data-status]');
  // The Counter div is the Cycle Count section's own <h2>'s sibling. The counter's glyph run is
  // split across an `aria-hidden` padding span and a bare text node (FD6), so a text locator is
  // the wrong handle for a string that is only whole at the element level — read the element.
  const cycleValue = (page: Page): Locator =>
    page
      .getByRole('heading', { level: 2, name: 'Cycle Count' })
      .locator('xpath=following-sibling::*[1]');
  // Same reasoning: the Total Living Cells VALUE, read off its label's sibling rather than by
  // text (the label span and the value span share no ancestor whose OWN text is just the number).
  const totalLivingValue = (page: Page): Locator =>
    page.getByText('Total Living Cells').locator('xpath=following-sibling::*[1]');

  async function enterRun(page: Page): Promise<void> {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
  }

  // (a): Three-Way Skirmish places three 2x2 blocks (4 cells each) — a three-way tie, so roster
  // order — reading through the sidebar, the rows and the counter at mount.
  test('mounts with the three sections, the rows in roster order, and the counter at 0000 (AC1, AC2, AC5)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await expect(sidebarHeadings(page)).toHaveText([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);

    const rows = populationRows(page);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Aggressive Colonizer');
    await expect(rows.nth(0)).toContainText('4 (33%)');
    await expect(rows.nth(1)).toContainText('Patient Defender');
    await expect(rows.nth(1)).toContainText('4 (33%)');
    await expect(rows.nth(2)).toContainText('Chaotic Spreader');
    await expect(rows.nth(2)).toContainText('4 (33%)');
    await expect(rows.getByRole('img', { name: 'extinct' })).toHaveCount(0);
    await expect(page.getByText('Total Living Cells')).toBeVisible();
    await expect(totalLivingValue(page)).toHaveText('12');
    await expect(cycleValue(page)).toHaveText('0000');

    expect(errors).toEqual([]);
  });

  // (b): manual steps publish unconditionally — the counter follows `data-cycle` exactly.
  test('Next cycle advances the counter with data-cycle, and Stop & reset returns both to zero (AC6)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await page.getByRole('button', { name: 'Next cycle' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '1');
    await expect(cycleValue(page)).toHaveText('0001');

    await page.getByRole('button', { name: 'Stop & reset' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    await expect(cycleValue(page)).toHaveText('0000');

    expect(errors).toEqual([]);
  });

  // (c): the counter moves once Play is running, axe stays clean while playing, then Pause.
  test('the counter advances while playing, with a clean axe scan, then Pause holds it (AC6, AC7, AC8)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await page.getByRole('button', { name: 'Play' }).click();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect.poll(() => cycleValue(page).textContent()).not.toBe('0000');

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');

    expect(errors).toEqual([]);
  });

  // (d): the extinct row, end to end. `/battle/new` seeds exactly one roster row — the default
  // tool's organism, Conway's Classic (2.9's fixture) — so painting ONE cell there and stepping
  // once reproduces Task 4 (c)'s lone-cell death at the route level, without reusing 2.10's
  // heavier add-from-library flow (the story's documented fallback path; recorded in the Dev
  // Agent Record which path shipped).
  test('an extinct organism shows the skull, a zero count, and a clean axe scan (AC3, AC8)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const canvas = page.getByRole('img', { name: /petri dish/i });
    await canvas.click();
    const before = 2;
    await expect
      .poll(async () => distinctColorCount(canvas), { timeout: 2000 })
      .toBeGreaterThan(before);

    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    await expect(populationRows(page)).toHaveCount(1);
    await expect(populationRows(page).nth(0)).toContainText('1 (100%)');

    await page.getByRole('button', { name: 'Next cycle' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '1');

    await expect(populationRows(page).nth(0)).toContainText('0 (0%)');
    await expect(populationRows(page).getByRole('img', { name: 'extinct' })).toHaveCount(1);
    await expect(totalLivingValue(page)).toHaveText('0');

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // Under FR-4.7 the run auto-pauses at the very next cycle: an extinct grid can never be
    // "playing" for more than one cycle, so the scan below is of the auto-paused state — the state
    // FR-4.7 makes reachable — rather than of a still-playing extinct dish (Story 3.15).
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '2');
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(populationRows(page).getByRole('img', { name: 'extinct' })).toHaveCount(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    expect(errors).toEqual([]);
  });

  // (e): a Lab -> Run round trip is a NEW session — the counter and the rows return to their
  // mount values, not to wherever the previous session was left.
  test('a Lab round trip resets the counter and the population to a fresh session (AC6)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    // Leave for Lab at cycle 1, NOT after a Stop — a Stop would already restore the mount values,
    // and the round trip would then prove nothing about the session being new.
    await page.getByRole('button', { name: 'Next cycle' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '1');
    await expect(cycleValue(page)).toHaveText('0001');

    await labButton(page).click();
    await expect(sidebarHeadings(page)).toHaveCount(4);

    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    await expect(cycleValue(page)).toHaveText('0000');
    const rows = populationRows(page);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('4 (33%)');
    await expect(rows.nth(1)).toContainText('4 (33%)');
    await expect(rows.nth(2)).toContainText('4 (33%)');

    expect(errors).toEqual([]);
  });
});

test.describe('Extinction auto-pause (Story 3.15)', () => {
  const view = (page: Page): Locator => page.locator('[data-status]');
  const cycleValue = (page: Page): Locator =>
    page
      .getByRole('heading', { level: 2, name: 'Cycle Count' })
      .locator('xpath=following-sibling::*[1]');
  const totalLivingValue = (page: Page): Locator =>
    page.getByText('Total Living Cells').locator('xpath=following-sibling::*[1]');

  // (a): `/battle/new`'s single-organism roster, one cell painted — the 3.14 (d) recipe —
  // proves the auto-pause end to end: reachable, resumable (not a reset), and undone by Stop &
  // reset (FR-4.7).
  test('a lone painted cell auto-pauses at cycle 1, resumes and auto-pauses again, and Stop & reset undoes it (AC1, AC2)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await seedConwaysClassic(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    const canvas = page.getByRole('img', { name: /petri dish/i });
    await canvas.click();
    const before = 2;
    await expect
      .poll(async () => distinctColorCount(canvas), { timeout: 2000 })
      .toBeGreaterThan(before);

    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');

    await page.getByRole('button', { name: 'Play' }).click();
    // Assert `data-cycle` FIRST, then `data-status` (they land in one publish, and 'paused' is
    // also the pre-Play value — a status-first assertion could pass against stale DOM).
    await expect(view(page)).toHaveAttribute('data-cycle', '1');
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(cycleValue(page)).toHaveText('0001');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next cycle' })).toBeEnabled();
    await expect(totalLivingValue(page)).toHaveText('0');

    // Resume, not reset — the second auto-pause lands one cycle later, not back at 0.
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '2');
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(cycleValue(page)).toHaveText('0002');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next cycle' })).toBeEnabled();

    await page.getByRole('button', { name: 'Stop & reset' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(cycleValue(page)).toHaveText('0000');
    await expect(populationRows(page).nth(0)).toContainText('1 (100%)');
    await expect(populationRows(page).getByRole('img', { name: 'extinct' })).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  // (b): the route-level "a static grid keeps running" check. Three-Way Skirmish settles into
  // still-lifes at 8 cells from cycle 9 (measured) — it must NOT auto-pause, ever, no matter how
  // long it plays.
  test('Three-Way Skirmish keeps playing past cycle 30 once settled into still-lifes (AC4)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');

    // 20 gen/sec (the ladder's top index, 3.13) so cycle 30 arrives in ~1.5s.
    await speedSlider(page).fill('4');
    await expect(speedSlider(page)).toHaveAttribute('aria-valuetext', '20 generations per second');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');

    await expect
      .poll(async () => Number(await cycleValue(page).textContent()), { timeout: 5000 })
      .toBeGreaterThan(30);
    // Still playing at that point — the still-lifes it settled into never extinguish, so nothing
    // in that span could have taken the auto-pause branch.
    await expect(view(page)).toHaveAttribute('data-status', 'playing');

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');

    expect(errors).toEqual([]);
  });
});

test.describe('Play-mode ephemeral resize (Story 3.16)', () => {
  const view = (page: Page): Locator => page.locator('[data-status]');
  const cycle = async (page: Page): Promise<number> =>
    Number(await view(page).getAttribute('data-cycle'));

  // (a): the fourth Run-sidebar section, at the persisted size; a move resizes the LIVE grid
  // (never `initialGrid`), never steps a cycle, renames the dish, and Stop restores the persisted
  // size — the slider following it back.
  test('resizes among the four presets with the dish and slider following, without stepping a cycle (AC1, AC2, AC3, AC4)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`); // battleA: 50x30
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');

    await expect(sidebarHeadings(page)).toHaveText([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);
    await expect(gridSizeSlider(page)).toHaveValue('0');
    await expect(gridSizeSlider(page)).toHaveAttribute('aria-valuetext', '50 by 30 cells');

    await gridSizeSlider(page).fill('3');
    await expect(gridSizeSlider(page)).toHaveAttribute('aria-valuetext', '200 by 120 cells');
    await expect(dish(page)).toHaveAccessibleName('Petri dish, 200 by 120 cells');
    // Trap 9: a resize is not a step.
    expect(await cycle(page)).toBe(0);

    await page.getByRole('button', { name: 'Next cycle' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '1');

    await page.getByRole('button', { name: 'Stop & reset' }).click();
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    await expect(dish(page)).toHaveAccessibleName('Petri dish, 50 by 30 cells');
    await expect(gridSizeSlider(page)).toHaveValue('0');

    expect(errors).toEqual([]);
  });

  // (b): the resize is ephemeral — Lab shows the persisted size with no dirty indicator, and a
  // fresh Run starts back at the ladder's bottom.
  test('a resize never reaches the Lab: the Grid Info stays at the persisted size, nothing dirty (AC6)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');

    await gridSizeSlider(page).fill('2');
    await expect(gridSizeSlider(page)).toHaveAttribute('aria-valuetext', '150 by 90 cells');

    await labButton(page).click();
    // The LAB's four sections by name, not a count the Run sidebar's four would also satisfy.
    await expect(sidebarHeadings(page)).toHaveText([
      'Organisms',
      'Battle Name',
      'Grid Info',
      'Tools',
    ]);
    await expect(
      page.getByRole('complementary').getByRole('group', { name: /^Grid Size: / }),
    ).toHaveAttribute('aria-label', 'Grid Size: 50 by 30');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    // `'0'` AND the valuetext: an off-ladder live size would also clamp the thumb to 0 (FD4).
    await expect(gridSizeSlider(page)).toHaveValue('0');
    await expect(gridSizeSlider(page)).toHaveAttribute('aria-valuetext', '50 by 30 cells');

    expect(errors).toEqual([]);
  });

  // (c): the control is disabled while playing (Speed stays enabled — FR-4.2), with the hint
  // visible in both states.
  test('disables Grid Size while playing; Speed stays enabled; the hint is always visible (AC5)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(page.getByText('Adjustable while paused')).toBeVisible();

    await page.getByRole('button', { name: 'Play' }).click();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');

    await expect(gridSizeSlider(page)).toBeDisabled();
    await expect(speedSlider(page)).toBeEnabled();
    await expect(page.getByText('Adjustable while paused')).toBeVisible();

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(gridSizeSlider(page)).toBeEnabled();

    expect(errors).toEqual([]);
  });

  // (d): the keyboard semantics are the browser's own — End/Home/ArrowRight over the four presets.
  test('End, Home and ArrowRight move the Grid Size slider one detent at a time (AC7)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');

    await gridSizeSlider(page).focus();
    await expect(gridSizeSlider(page)).toBeFocused();

    await page.keyboard.press('End');
    await expect(gridSizeSlider(page)).toHaveValue('3');

    await page.keyboard.press('Home');
    await expect(gridSizeSlider(page)).toHaveValue('0');

    await page.keyboard.press('ArrowRight');
    await expect(gridSizeSlider(page)).toHaveValue('1');
    await expect(gridSizeSlider(page)).toHaveAttribute('aria-valuetext', '100 by 60 cells');

    expect(errors).toEqual([]);
  });

  // (e): the largest resize (battleB, 100x60 -> 200x120 = 24,000 cells) proves the resize path
  // doesn't itself step a cycle, and axe stays clean at the largest live size.
  test('a full-ladder resize on the 100x60 battle stays at cycle 0 and is axe-clean (AC3, AC9)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    // battleB's roster includes Conway's Classic (`rosterIdsWithConway`, `mockWorkspace.ts`),
    // which `seedWorkspace` alone does not add to the organism library (`seedConwaysClassic`'s
    // own head comment) — without this, RUN is disabled with "could not be loaded".
    await seedConwaysClassic(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleB}`); // battleB: 100x60
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grand Colony War');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(gridSizeSlider(page)).toHaveValue('1');

    await gridSizeSlider(page).fill('3');
    await expect(gridSizeSlider(page)).toHaveAttribute('aria-valuetext', '200 by 120 cells');
    expect(await cycle(page)).toBe(0);

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    expect(errors).toEqual([]);
  });
});

// Story 3.17 (FR-7.6): the Gallery and the route prove Run-from-Gallery end to end. Reuses the
// module-scope helpers above (`runButton`/`labButton` are the header toggle's OWN buttons, unaffected
// by this story) rather than any of `battleRoute.spec.ts`'s own hand-rolled seed logic.
test.describe('Run from Gallery (Story 3.17)', () => {
  test('runLink navigates straight into a paused Run session, and Back returns to the Gallery (AC8(a))', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto('/');
    await expect(page.getByRole('article')).toHaveCount(2);

    await runLink(page, 'Three-Way Skirmish').click();

    await expect(page).toHaveURL(`/battle?id=${MOCK_BATTLE_IDS.battleA}&mode=run`);
    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'run');
    await expect(runButton(page)).toHaveAttribute('aria-pressed', 'true');
    const view = page.locator('[data-status]');
    await expect(view).toHaveAttribute('data-status', 'paused');
    await expect(view).toHaveAttribute('data-cycle', '0');
    // FR-3.10 "the playback canvas painted" — the same smoke check the 3.11 toggle test uses.
    await expect(dish(page)).toBeVisible();
    expect(await distinctColorCount(dish(page))).toBeGreaterThan(2);
    await expect(sidebarHeadings(page)).toHaveText([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to Battles' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Back to Battles' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battle Gallery');
    await expect(page.getByRole('article')).toHaveCount(2);

    expect(errors).toEqual([]);
  });

  // AC8(b), FD3(a): battleB carries the dangling Conway id in an e2e-seeded workspace (no
  // seedConwaysClassic here) — a Run entry over it lands in Lab, disabled, exactly as a toggle
  // attempt would.
  test('runLink over a dangling roster lands in Lab with RUN disabled, and never mounts the Run view (AC8(b))', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto('/');
    await expect(page.getByRole('article')).toHaveCount(2);

    await runLink(page, 'Grand Colony War').click();

    await expect(page).toHaveURL(`/battle?id=${MOCK_BATTLE_IDS.battleB}&mode=run`);
    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'lab');
    await expect(runButton(page)).toBeDisabled();
    await expect(runButton(page)).toHaveAttribute(
      'title',
      'Some organisms in this battle could not be loaded',
    );
    await expect(sidebarHeadings(page)).toHaveText([
      'Organisms',
      'Battle Name',
      'Grid Info',
      'Tools',
    ]);
    await expect(page.locator('[data-status]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  // AC8(c): the query param is bookmarkable and survives a reload (AC5's "a reload re-enters
  // Run" made observable); an unrecognised value degrades to Lab silently.
  test('the ?mode=run entry is bookmarkable and survives a reload; an unrecognised value degrades to Lab (AC8(c))', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);

    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}&mode=run`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.locator('[data-status]')).toHaveAttribute('data-status', 'paused');

    // The hydration lesson (the Story 2.1 reload test above): re-await the h1 before reading
    // [data-mode] after a reload, since the prerendered fallback briefly replaces the tree.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'run');

    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}&mode=play`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'lab');

    expect(errors).toEqual([]);
  });

  // AC8(d), Trap 15: title link → organism dots → Run → Delete, the same order BattleTile.test.tsx
  // pins under RTL. Dot count is read off the tile rather than hardcoded — the fixture's own
  // roster size is not this test's concern, only that Run lands immediately after the last dot.
  test('keyboard reaches Run right after the last organism dot, then Delete (AC8(d))', async ({
    page,
    browserName,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto('/');
    // Hydration signal (appShell.spec.ts's own lesson): a bare `.count()` does not auto-wait the
    // way an `expect` assertion does, so without this the tile is still the prerendered "Loading
    // battles…" placeholder and every count below reads 0.
    await expect(page.getByRole('article')).toHaveCount(2);

    const tile = page.getByRole('article').first();
    const titleLink = tile.getByRole('link').first();
    const dotCount = await tile.getByRole('img').count();
    const tileName = (await titleLink.textContent()) ?? '';
    // A zero-dot tile would let the loop run 0 times and still land Run right after the title —
    // true, but not the ordering this test exists to pin.
    expect(dotCount).toBeGreaterThan(0);

    await titleLink.focus();
    await expect(titleLink).toBeFocused();

    // WebKit needs `Alt+Tab` (the 3.13/3.16 idiom): a plain Tab from a just-focused element can
    // leave `document.activeElement` on `<body>` on macOS WebKit.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    for (let i = 0; i < dotCount; i += 1) {
      await page.keyboard.press(tab);
    }

    // Tile-scoped like the Delete locator below — a page-scoped `runLink` would strict-fail the
    // day two seeded tiles share a name.
    await page.keyboard.press(tab);
    await expect(tile.getByRole('link', { name: `Run ${tileName}`, exact: true })).toBeFocused();

    await page.keyboard.press(tab);
    await expect(tile.getByRole('button', { name: `Delete ${tileName}` })).toBeFocused();

    expect(errors).toEqual([]);
  });
});

// Story 3.18: the fullscreen run stage, end to end. What the unit suite cannot see is here — the
// dish RE-LAID OUT (jsdom has no `ResizeObserver`, so "the box grows and stays painted" is only
// provable in a browser), the loop running through the swap on real frames, and the focus moves.
test.describe('Fullscreen run stage (Story 3.18)', () => {
  const view = (page: Page): Locator => page.locator('[data-status]');
  const cycle = async (page: Page): Promise<number> =>
    Number(await view(page).getAttribute('data-cycle'));

  async function enterRun(page: Page): Promise<void> {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    await expect(dish(page)).toBeVisible();
  }

  // (a) AC1/AC2/AC3/AC4/AC6/AC7: the round trip — the header gone, the dish LARGER and still
  // painted, Exit focused, axe clean; then the chassis back and the entry focused again.
  test('enters a fullscreen stage that re-lays out the same dish larger, and exits back to the chassis (AC10(a))', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);
    await expect(fullscreenButton(page)).toBeVisible();
    await expect(fullscreenButton(page)).toBeEnabled();
    const boxBefore = await dish(page).boundingBox();
    expect(boxBefore).not.toBeNull();
    if (boxBefore === null) return;
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (viewport === null) return;

    await fullscreenButton(page).click();

    await expect(view(page)).toHaveAttribute('data-fullscreen', 'true');
    await expect(page.getByRole('group', { name: 'Mode' })).toHaveCount(0);
    await expect(sidebarHeadings(page)).toHaveCount(0);
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(exitFullscreenButton(page)).toBeFocused();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Back to Battles' })).toHaveCount(0);
    // The SAME canvas, re-laid out: `expect.poll` because the ResizeObserver's re-fit is a frame
    // behind the layout change, and the comparison is strict — wider AND taller — inside the
    // viewport. Still painted (the re-fit repainted `lastGrid` at the new pixel size).
    await expect
      .poll(async () => {
        const box = await dish(page).boundingBox();
        return box !== null && box.width > boxBefore.width && box.height > boxBefore.height;
      })
      .toBe(true);
    const boxAfter = await dish(page).boundingBox();
    expect(boxAfter).not.toBeNull();
    if (boxAfter === null) return;
    expect(boxAfter.x).toBeGreaterThanOrEqual(0);
    expect(boxAfter.y).toBeGreaterThanOrEqual(0);
    expect(boxAfter.x + boxAfter.width).toBeLessThanOrEqual(viewport.width);
    expect(boxAfter.y + boxAfter.height).toBeLessThanOrEqual(viewport.height);
    await expect(dish(page)).toBeVisible();
    expect(await distinctColorCount(dish(page))).toBeGreaterThan(2);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await exitFullscreenButton(page).click();

    await expect(view(page)).toHaveAttribute('data-fullscreen', 'false');
    await expect(fullscreenButton(page)).toBeFocused();
    await expect(sidebarHeadings(page)).toHaveText([
      'Population Analysis',
      'Cycle Count',
      'Speed',
      'Grid Size',
    ]);
    await expect(page.getByRole('button', { name: 'Back to Battles' })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    // Back to (approximately) the chassis box — within a few px of the earlier measurement.
    await expect
      .poll(async () => {
        const box = await dish(page).boundingBox();
        return (
          box !== null &&
          Math.abs(box.width - boxBefore.width) < 4 &&
          Math.abs(box.height - boxBefore.height) < 4
        );
      })
      .toBe(true);
    expect(await distinctColorCount(dish(page))).toBeGreaterThan(2);

    expect(errors).toEqual([]);
  });

  // (b) AC5: a RUNNING simulation runs straight through the swap — still `playing`, the cycle
  // still climbing in fullscreen — and the HUD's Pause is the same transport as the bar's.
  test('keeps a running simulation running through enter, pauses it from the HUD, and exits with the counter in step (AC10(b))', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect.poll(() => cycle(page)).toBeGreaterThan(0);

    await fullscreenButton(page).click();

    await expect(view(page)).toHaveAttribute('data-fullscreen', 'true');
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    const cycleOnEntry = await cycle(page);
    await expect.poll(() => cycle(page)).toBeGreaterThan(cycleOnEntry);

    await page.getByRole('button', { name: 'Pause', exact: true }).click();

    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const pausedAt = await cycle(page);

    await exitFullscreenButton(page).click();

    await expect(view(page)).toHaveAttribute('data-fullscreen', 'false');
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    expect(await cycle(page)).toBe(pausedAt);
    // The sidebar's counter reads the same number `data-cycle` does (zero-padded to 4 digits).
    const counter = page
      .getByRole('complementary')
      .locator('section', { has: page.getByRole('heading', { name: 'Cycle Count' }) });
    await expect(counter).toContainText(String(pausedAt).padStart(4, '0'));

    expect(errors).toEqual([]);
  });

  // (c) AC5: speed and the ephemeral size are the HOOK's — set in the chassis, read in the HUD /
  // on the dish, still on the sliders after exit.
  test('carries the chosen speed and an ephemeral 150×90 through the stage and back (AC10(c))', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await speedSlider(page).focus();
    await page.keyboard.press('End'); // 20 gen/s, the top detent
    await expect(speedSlider(page)).toHaveAttribute('aria-valuetext', '20 generations per second');
    await gridSizeSlider(page).focus();
    await page.keyboard.press('End'); // 200x120
    await page.keyboard.press('ArrowLeft'); // 150x90
    await expect(gridSizeSlider(page)).toHaveAttribute('aria-valuetext', '150 by 90 cells');
    await expect(page.getByRole('img', { name: 'Petri dish, 150 by 90 cells' })).toBeVisible();

    await fullscreenButton(page).click();

    await expect(view(page)).toHaveAttribute('data-fullscreen', 'true');
    await expect(page.getByText('20 gen/s')).toBeVisible();
    await expect(page.getByRole('slider')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Petri dish, 150 by 90 cells' })).toBeVisible();

    await exitFullscreenButton(page).click();

    await expect(view(page)).toHaveAttribute('data-fullscreen', 'false');
    await expect(speedSlider(page)).toHaveAttribute('aria-valuetext', '20 generations per second');
    await expect(gridSizeSlider(page)).toHaveAttribute('aria-valuetext', '150 by 90 cells');
    await expect(page.getByRole('img', { name: 'Petri dish, 150 by 90 cells' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  // (d) AC7: Tab order in the stage is Exit → Play → Next cycle → Stop & reset — nothing else is
  // reachable (the header and the sidebar are unmounted, not hidden).
  test('tabs Exit → Play → Next cycle → Stop & reset in the stage (AC10(d))', async ({
    page,
    browserName,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await fullscreenButton(page).click();
    await expect(exitFullscreenButton(page)).toBeFocused();

    // WebKit needs `Alt+Tab` (the 3.13/3.16 idiom); `ci:dev` runs Chromium, where plain Tab is
    // the key.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.keyboard.press(tab);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(page.getByRole('button', { name: 'Next cycle', exact: true })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(page.getByRole('button', { name: 'Stop & reset', exact: true })).toBeFocused();

    expect(errors).toEqual([]);
  });

  // (e) AC2 (c): a Gallery Run entry (`?mode=run`, Story 3.17) shows the entry on the first
  // header render.
  test('a Gallery Run entry shows the Fullscreen button on first render (AC10(e))', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}&mode=run`);

    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'run');
    await expect(fullscreenButton(page)).toBeVisible();
    await expect(fullscreenButton(page)).toBeEnabled();
    await expect(view(page)).toHaveAttribute('data-fullscreen', 'false');

    expect(errors).toEqual([]);
  });
});

// Story 3.19: window-level hotkeys, end to end — the real DOM behaviour jsdom cannot see (native
// Space activation on a focused button, the Escape/dialog race with a genuinely mounted MUI
// modal, the fullscreen round trip through the keyboard rather than a click). Reuses 3.18's
// `view` / `cycle` / `enterRun` shape and the file's `runButton` / `dish` / `speedSlider` /
// `fullscreenButton` / `exitFullscreenButton` locators.
test.describe('Simulation hotkeys (Story 3.19)', () => {
  const view = (page: Page): Locator => page.locator('[data-status]');
  const cycle = async (page: Page): Promise<number> =>
    Number(await view(page).getAttribute('data-cycle'));

  async function enterRun(page: Page): Promise<void> {
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    await expect(dish(page)).toBeVisible();
  }

  // Trap 19: `runButton(page).click()` leaves focus ON the Mode toggle, and Space would flip it
  // back to Lab natively (AC3 (vi)) before ever reaching the hook. A click on the dish — not
  // focusable — blurs to `<body>`, the real "focus is loose" starting point every hotkey test
  // below needs before its first Space.
  async function parkFocus(page: Page): Promise<void> {
    await dish(page).click();
  }

  // (a) AC2/AC3: the four keys from a loose-focus chassis, plus the chassis hint.
  test('Space plays and pauses, ArrowRight steps three times, ArrowRight is a no-op while playing, Escape stops at 0 (AC2/AC3)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);
    await parkFocus(page);

    await page.keyboard.press('Space');
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect.poll(() => cycle(page)).toBeGreaterThan(0);

    await page.keyboard.press('Space');
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    const pausedAt = await cycle(page);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(view(page)).toHaveAttribute('data-cycle', String(pausedAt + 3));

    await page.keyboard.press('Space');
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    // A no-op while playing — `sim.step()` is never called, so it never throws (trap 1); the
    // cycle keeps the LOOP's own pace. The poll below only proves the loop is still running — it
    // would pass whether or not the key stepped — so the load-bearing assertion is the
    // `collectErrors` check at the end: a `step()` reached while playing throws, and that throw
    // surfaces there and nowhere else (AC12 (a)).
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => cycle(page)).toBeGreaterThan(pausedAt + 3);

    await page.keyboard.press('Escape');
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');

    // The chassis hint: three <kbd>s, visible.
    await expect(page.getByText('Shortcuts:')).toBeVisible();
    expect(await page.locator('kbd').count()).toBe(3);

    expect(errors).toEqual([]);
  });

  // (b) AC5/AC6: f enters the stage without touching a running sim; Escape stops AND exits the
  // stage (FD4 (c), owner's decision 2026-09-18 — superseding the shipped FD4 (a)).
  test('f enters the fullscreen stage without stopping a running sim, Escape stops AND exits it (AC5/AC6)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);
    await parkFocus(page);
    const boxBefore = await dish(page).boundingBox();
    expect(boxBefore).not.toBeNull();
    if (boxBefore === null) return;

    await page.keyboard.press('Space');
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect.poll(() => cycle(page)).toBeGreaterThan(0);

    await page.keyboard.press('f');

    await expect(view(page)).toHaveAttribute('data-fullscreen', 'true');
    await expect(exitFullscreenButton(page)).toBeFocused();
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    // The 3.18 (a) box assertion: the SAME dish, re-laid out larger.
    await expect
      .poll(async () => {
        const box = await dish(page).boundingBox();
        return box !== null && box.width > boxBefore.width && box.height > boxBefore.height;
      })
      .toBe(true);
    // The stage's hint now names both exit keys: F (toggle only) and Esc (stop & exit, FD4 (c)).
    // Four <kbd>s — F, Esc, Space, → (AC12 (b)); the chassis bar (three) is unmounted while the
    // stage is up, so the page-wide count is the stage's alone.
    await expect(page.getByText('to exit fullscreen')).toBeVisible();
    await expect(page.getByText('Stop & exit')).toBeVisible();
    await expect(page.locator('kbd')).toHaveCount(4);
    await expect(page.locator('kbd').nth(2)).toHaveText('Space');
    await expect(page.locator('kbd').nth(3)).toContainText('→');

    await page.keyboard.press('Escape');

    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');
    await expect(view(page)).toHaveAttribute('data-fullscreen', 'false'); // FD4 (c): exits too
    await expect(fullscreenButton(page)).toBeFocused();
    await expect(page.getByText('to exit fullscreen')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  // (c) AC3 (iv): the Speed slider is a native range input — ArrowRight moves it one detent and
  // never reaches the sim (the 3.13 e2e assertion, repeated with the hook mounted).
  test('ArrowRight on the Speed slider moves it one detent and does not step the sim (AC3 (iv))', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await enterRun(page);

    await speedSlider(page).focus();
    await page.keyboard.press('ArrowRight');

    await expect(speedSlider(page)).toHaveValue('4');
    await expect(view(page)).toHaveAttribute('data-cycle', '0');

    expect(errors).toEqual([]);
  });

  // (d) AC4: Lab mode mounts no hook at all — the four keys change nothing observable.
  test('the four keys change nothing in Lab mode (AC4)', async ({ page }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');
    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'lab');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');

    await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'lab');
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');
    await expect(page.locator('[data-fullscreen="true"]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  // (e) AC9: a dirty battle's Back guard suspends the hook — Escape closes the dialog, a playing
  // simulation is untouched underneath it.
  test('Escape closes the Unsaved Changes dialog and leaves a playing simulation untouched (AC9)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const box = await dish(page).boundingBox();
    if (box === null) throw new Error('the dish has no layout box');
    await dish(page).click({ position: { x: box.width * 0.05, y: box.height * 0.05 } });
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'true');

    await runButton(page).click();
    await expect(view(page)).toHaveAttribute('data-status', 'paused');
    await parkFocus(page);

    await page.keyboard.press('Space');
    await expect(view(page)).toHaveAttribute('data-status', 'playing');
    await expect.poll(() => cycle(page)).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Back to Battles' }).click();
    // Axe with the dialog OPEN over a playing Run (the 2.16 idiom) — the inert background plus
    // the hint lines underneath are the state a reviewer cannot see in jsdom. The idiom's THREE
    // waits, not one (`:1428-1437` says why): `toBeVisible()` passes the instant the Paper has a
    // box, before MUI's Fade settles, and a scan taken mid-fade computes colour-contrast against
    // blended colours — measured here on Chromium as 198 nodes at 3.31:1 with only the first wait.
    const dialog = page.getByRole('dialog', { name: 'Unsaved Changes' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(view(page)).toHaveAttribute('data-status', 'playing');

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
});
