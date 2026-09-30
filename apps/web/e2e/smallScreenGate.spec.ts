import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * NFR-3.1's floor (700 × 480), end to end against the served static export. The panel's
 * visibility is pure CSS (`@media`), which jsdom cannot evaluate — this spec is the only place it
 * is proven. Viewports are set per test before `goto` (project-context: no fifth Playwright
 * project), from the 2026-09-30 device measurement: an upright phone, a landscape phone, and the
 * narrowest tablet (iPad mini portrait) that must stay ungated.
 *
 * A fresh workspace seeds the default preset, so the gallery always has a battle to open.
 */

const PHONE_PORTRAIT = { width: 393, height: 852 };
const PHONE_LANDSCAPE = { width: 852, height: 393 };
const TABLET_PORTRAIT = { width: 744, height: 1133 };

const gate = (page: Page) => page.locator('[data-small-screen-gate]');
const gateHeading = (page: Page) =>
  page.getByRole('heading', { level: 2, name: 'This screen needs more room' });

// `inert` checked on the DOM, not through the role engine: Playwright's `getByRole` still resolves
// controls inside an `inert` subtree, so a count-0 assertion would not prove the gate.
const isInert = (locator: Locator) => locator.evaluate((el) => el.closest('[inert]') !== null);

// Hydration signal: the prerendered gallery says "Loading battles…", so a Run link exists only once
// the client has seeded and read the workspace — after which the battle route hydrates on arrival.
async function openFirstBattleInRun(page: Page) {
  await page.goto('/');
  const run = page.getByRole('link', { name: /^Run / }).first();
  await expect(run).toBeVisible();
  await run.click();
  await expect(page).toHaveURL(/\/battle\?id=/);
}

test.describe('small-screen gate (NFR-3.1)', () => {
  test('an upright phone gets the panel on the battle route, and Continue anyway lets it through', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_PORTRAIT);
    await openFirstBattleInRun(page);

    await expect(gateHeading(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Battles' })).toHaveAttribute('href', '/');
    // Inert behind the panel once hydrated: no keyboard shortcut or tap reaches the Run transport.
    const stop = page.getByRole('button', { name: 'Stop & reset' });
    await expect.poll(() => isInert(stop)).toBe(true);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('button', { name: 'Continue anyway' }).click();
    await expect(gate(page)).toHaveCount(0);
    await expect(stop).toBeVisible();
    expect(await isInert(stop)).toBe(false);

    // Remembered for the tab: a reload does not ask again.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Stop & reset' })).toBeVisible();
    await expect(gate(page)).toHaveCount(0);
  });

  test('a landscape phone is gated too — by its height, not its orientation', async ({ page }) => {
    await page.setViewportSize(PHONE_LANDSCAPE);
    await openFirstBattleInRun(page);

    await expect(gateHeading(page)).toBeVisible();
  });

  test('the Organism Editor is gated on a phone, Tab reaches its way out, and it closes the editor', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_PORTRAIT);
    await page.goto('/organisms');
    await page.getByRole('button', { name: '+ Create New Organism' }).click();

    const dialog = page.getByRole('dialog', { name: 'Organism Editor' });
    const panel = dialog.locator('[data-small-screen-gate]');
    await expect(panel.getByRole('heading', { name: 'This screen needs more room' })).toBeVisible();
    await expect.poll(() => isInert(dialog.locator('[data-editor-back]'))).toBe(true);

    // The dialog's focus trap would otherwise pin Tab on the inert header's Back (measured on all
    // three engines) — the keyboard path to the panel is the regression this guards.
    const exit = panel.getByRole('button', { name: 'Back to Library' });
    await expect
      .poll(async () => {
        await page.keyboard.press('Tab');
        return exit.evaluate((el) => el === document.activeElement);
      })
      .toBe(true);

    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
  });

  test('the gallery routes are never gated', async ({ page }) => {
    await page.setViewportSize(PHONE_PORTRAIT);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /^Run / }).first()).toBeVisible();

    await expect(gate(page)).toHaveCount(0);
  });

  test('iPad mini portrait is not gated, and the Run bar keeps Stop & reset on screen', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET_PORTRAIT);
    await openFirstBattleInRun(page);

    const stop = page.getByRole('button', { name: 'Stop & reset' });
    await expect(stop).toBeVisible();
    await expect(gateHeading(page)).toBeHidden();

    // Measured at 744px before the Run bar wrapped: the ≈390px transport ran ~10px off the right
    // edge beside the 320px sidebar, clipping Stop & reset and scrolling the page sideways.
    const box = await stop.boundingBox();
    if (box === null) throw new Error('Stop & reset has no layout box');
    expect(box.x + box.width).toBeLessThanOrEqual(TABLET_PORTRAIT.width);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(TABLET_PORTRAIT.width);
  });
});
