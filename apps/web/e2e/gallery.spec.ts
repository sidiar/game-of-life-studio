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
function buildSeedPayload() {
  const { battles, organisms } = createMockWorkspace();
  const battlesRecord = Object.fromEntries(battles.map((b) => [b.id, b]));
  const organismsRecord = Object.fromEntries(organisms.map((o) => [o.id, o]));

  // addInitScript structured-clones its argument: Battle.createdAt/updatedAt are Date objects,
  // and the at-rest form is ISO strings, so JSON round-trip the payload first. A Date surviving
  // the clone would be JSON.stringify'd to the right shape anyway *in the browser* — which works
  // by accident and breaks the day the payload is built differently. Round-trip explicitly.
  return JSON.parse(JSON.stringify({ battles: battlesRecord, organisms: organismsRecord })) as {
    battles: unknown;
    organisms: unknown;
  };
}

async function seedWorkspace(page: Page) {
  const payload = buildSeedPayload();

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

    expect(errors).toEqual([]);
  });

  test('each organism dot has its own accessible name and reveals a tooltip on keyboard focus (WCAG 1.4.13)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);

    // Three-Way Skirmish: 3 organisms, no Conway's Classic.
    const tile = page.locator('article', {
      has: page.getByRole('heading', { name: 'Three-Way Skirmish' }),
    });
    const dot = tile.getByRole('button', { name: 'Aggressive Colonizer' });
    // The dot itself carries no visible text (aria-label only) — the tooltip is the visible
    // span with the same name, matched separately here.
    const tooltip = tile.getByText('Aggressive Colonizer', { exact: true });

    await expect(dot).toBeVisible();
    await expect(tooltip).toHaveCSS('opacity', '0');

    // Content-on-hover must also appear on focus (SC 1.4.13) — the real assertion a mouse-only
    // CSS ::before tooltip (the mockup's original pattern) could never pass.
    await dot.focus();
    await expect(tooltip).toHaveCSS('opacity', '1');

    // Dismissible (SC 1.4.13): Escape blurs the trigger, which drops :focus-within.
    await page.keyboard.press('Escape');
    await expect(dot).not.toBeFocused();
    await expect(tooltip).toHaveCSS('opacity', '0');

    // Every organism is reachable this way, not just the first.
    await expect(tile.getByRole('button', { name: 'Patient Defender' })).toBeVisible();
    await expect(tile.getByRole('button', { name: 'Chaotic Spreader' })).toBeVisible();
  });

  test('has no axe accessibility violations with tiles on screen', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);

    // The real-browser run is what actually checks rendered colour contrast —
    // text-tertiary on bg-secondary at 12px is the pair at risk.
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
