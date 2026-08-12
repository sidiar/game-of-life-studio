import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace } from '@gol/test-utils';

// e2e/ is exempt from the @gol/test-utils import boundary (eslint.config.mjs) — home.spec.ts
// already imports @gol/domain + @gol/persistence, and this is the intended use.
//
// The e2e serves the PRODUCTION static export (playwright.config.ts), so the AR-45 dev fixtures
// are NOT seeded and the Gallery is empty by default. Seed localStorage before load instead.
// The mock workspace holds only 3 organisms, so no seeded battle can exceed MAX_VISIBLE_DOTS on
// its own. `crowded` adds one battle whose organismIds run past the cap using ids with no roster
// entry — they resolve to the dangling-id fallback dot, which is enough to render the "+n"
// indicator. That matters because the +n indicator is 10px --gol-text-tertiary on
// --gol-bg-secondary, the smallest text in the tile, and only a real browser can check its
// contrast: jsdom has no layout, so axe skips colour-contrast there entirely.
function buildSeedPayload(options: { crowded?: boolean } = {}) {
  const { battles, organisms } = createMockWorkspace();
  const battlesRecord: Record<string, unknown> = Object.fromEntries(battles.map((b) => [b.id, b]));
  const organismsRecord = Object.fromEntries(organisms.map((o) => [o.id, o]));

  if (options.crowded) {
    const crowded = {
      ...battles[0],
      id: 'c5b3e4f6-7d8a-4b9c-8e0f-2a3b4c5d6e7f',
      name: 'Crowded Roster',
      organismIds: Array.from({ length: 9 }, (_, i) => `absent-organism-${i}`),
    };
    battlesRecord[crowded.id] = crowded;
  }

  // addInitScript structured-clones its argument: Battle.createdAt/updatedAt are Date objects,
  // and the at-rest form is ISO strings, so JSON round-trip the payload first. A Date surviving
  // the clone would be JSON.stringify'd to the right shape anyway *in the browser* — which works
  // by accident and breaks the day the payload is built differently. Round-trip explicitly.
  return JSON.parse(JSON.stringify({ battles: battlesRecord, organisms: organismsRecord })) as {
    battles: unknown;
    organisms: unknown;
  };
}

async function seedWorkspace(page: Page, options: { crowded?: boolean } = {}) {
  const payload = buildSeedPayload(options);

  await page.addInitScript(
    ([keys, formatVersion, data]) => {
      // Stamp gol:schema too: without it isFreshWorkspace() is true, seedDefaultWorkspace() runs,
      // and Conway's Classic is appended to the roster mid-test — harmless but it makes the
      // organism-name assertions depend on seeding order.
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

test.describe('battle gallery (Story 1.10)', () => {
  test('renders both seeded battles as tiles, most-recently-modified first, with zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await page.goto('/');

    // Hydration signal before asserting on console errors (appShell.spec.ts:28-37 explains why):
    // the prerendered HTML says "Loading battles…" and only the client effect can reach a tile.
    const headings = page.getByRole('heading', { level: 2 });
    await expect(headings).toHaveCount(2);

    // AC2: descending updatedAt — Grand Colony War (2026-07-25T18:15Z) before Three-Way Skirmish
    // (2026-07-20T09:00Z). An ORDER assertion, not two toBeVisible() calls.
    await expect(headings).toHaveText(['Grand Colony War', 'Three-Way Skirmish']);

    // Story 1.11 AC1/AC4: one real <canvas> per tile, each with a non-zero backing store. jsdom
    // cannot rasterise at all (Task 8), so this is the only place a 0x0 backing store — the
    // documented silent failure in gridLayout.ts:42-45 — can be caught for real.
    const canvases = page.locator('canvas');
    await expect(canvases).toHaveCount(2);
    const boxes = await canvases.evaluateAll((elements) =>
      elements.map((el) => {
        const canvas = el as HTMLCanvasElement;
        return { width: canvas.width, height: canvas.height };
      }),
    );
    for (const box of boxes) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }

    expect(errors).toEqual([]);
  });

  // Story 1.11 AC1: the one smoke check AR-42 allows — a distinct-colour count, never a pixel or
  // image snapshot. The canvas is untainted (no external images) so getImageData is legal here.
  // Grand Colony War places four organisms plus a glider on a 100x60 grid, guaranteeing more than
  // one colour is actually on screen (background + at least one organism).
  test('a tile canvas actually paints more than one colour (AC1, AR-42 smoke check)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/');

    const tile = page.locator('article', {
      has: page.getByRole('heading', { name: 'Grand Colony War' }),
    });
    const canvas = tile.locator('canvas');
    await expect(canvas).toBeAttached();

    const distinctColorCount = await canvas.evaluate((el) => {
      const canvasEl = el as HTMLCanvasElement;
      const ctx = canvasEl.getContext('2d');
      if (ctx === null) return 0;
      const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
      }
      return seen.size;
    });

    // > 2, not > 1. Grid lines over the background are already two distinct colours before a
    // single organism cell is drawn, and whether they render is DPR-dependent (100x60 clears
    // MIN_GRID_LINE_CELL_SIZE at DPR 2 on the tablet project, not at DPR 1) — so `> 1` is passed
    // by a canvas with no cells on it at all, on exactly the project where the check matters
    // least. Three distinct colours cannot be reached without at least one organism painted.
    expect(distinctColorCount).toBeGreaterThan(2);
  });

  test('each organism dot has its own accessible name and reveals a tooltip on hover and on keyboard focus (WCAG 1.4.13)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);

    // Three-Way Skirmish: 3 organisms, no Conway's Classic.
    const tile = page.locator('article', {
      has: page.getByRole('heading', { name: 'Three-Way Skirmish' }),
    });
    // role="img", not button — the dot has no activation behaviour, so a button role would
    // announce an action that does not exist.
    const dot = tile.getByRole('img', { name: 'Aggressive Colonizer' });
    // The dot itself carries no visible text (aria-label only) — the tooltip is the visible
    // span with the same name, matched separately here.
    const tooltip = tile.getByText('Aggressive Colonizer', { exact: true });

    await expect(dot).toBeVisible();
    await expect(tooltip).toHaveCSS('opacity', '0');

    // Content-on-hover must also appear on focus (SC 1.4.13) — the real assertion a mouse-only
    // CSS ::before tooltip (the mockup's original pattern) could never pass.
    await dot.focus();
    await expect(tooltip).toHaveCSS('opacity', '1');

    // Dismissible (SC 1.4.13): Escape hides the tooltip WITHOUT moving focus. An earlier
    // implementation blurred the trigger, which dropped the user at <body> and restarted the
    // tab order at the top of the document.
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCSS('opacity', '0');
    await expect(dot).toBeFocused();

    // Hoverable (SC 1.4.13): the tooltip must survive the pointer travelling onto it. This is
    // what `pointer-events: auto` + the ::after gap bridge buy — with neither, the tooltip
    // vanishes mid-traverse and this assertion fails.
    await dot.hover();
    await expect(tooltip).toHaveCSS('opacity', '1');
    await tooltip.hover();
    await expect(tooltip).toHaveCSS('opacity', '1');

    // Every organism is reachable this way, not just the first.
    await expect(tile.getByRole('img', { name: 'Patient Defender' })).toBeVisible();
    await expect(tile.getByRole('img', { name: 'Chaotic Spreader' })).toBeVisible();
  });

  test('has no axe accessibility violations with tiles on screen, including the "+n" overflow indicator', async ({
    page,
  }) => {
    await seedWorkspace(page, { crowded: true });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);

    // The +n indicator must actually be on screen for this run to mean anything: it is the
    // smallest text in the tile (10px --gol-text-tertiary on --gol-bg-secondary) and therefore
    // the contrast pair most at risk, and a real browser is the only place axe can check it.
    await expect(page.getByRole('img', { name: /3 more organisms:/ })).toBeVisible();

    // Story 1.11 AC1/AC2: canvases on screen must not introduce a NEW axe violation (the
    // aria-hidden dish carries no accessible-name obligation of its own).
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // Story 1.11 Task 5's degradation table, proven end to end: `crowded`'s organismIds run past
  // its placed set, so BattleSummarySchema lists it (list() shows the heading) but BattleSchema's
  // Decision H.1 superRefine rejects it (load() throws). jsdom cannot exercise this — only a real
  // browser proves the thumbnail's own load failure produces zero console noise.
  test('the crowded tile (whose load() throws) still renders its heading with zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page, { crowded: true });
    await page.goto('/');

    const headings = page.getByRole('heading', { level: 2 });
    await expect(headings).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Crowded Roster' })).toBeVisible();

    // Wait for the Gallery's terminal shape rather than sleeping: all three tiles issue their
    // load() together, and exactly two of them can produce a canvas — `crowded`'s throws. A fixed
    // timeout is both slower than it needs to be and, on a contended runner where the rejection
    // settles later than the sleep, silently unable to observe a console.error regression at all.
    // This barrier polls, so it tightens on a fast machine and stretches on a slow one.
    await expect(page.locator('canvas')).toHaveCount(2);

    expect(errors).toEqual([]);
  });
});
