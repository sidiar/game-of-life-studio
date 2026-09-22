import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// A stat tile's value, scoped to the tile whose term matches — never `definition.nth(i)`: terms are
// matched by text, so reading the value by POSITION silently reads a different tile's number the
// day Story 5.2 inserts Storage Used or reorders the grid (review 2026-09-21). `<dd>`'s
// "definition" role is name-from-author-prohibited, so the term's wrapper is the only handle.
function statValue(page: Page, term: string) {
  return page.getByRole('term').filter({ hasText: term }).locator('..').getByRole('definition');
}

// Thin e2e (RFC-008 Decision 2), the Story 4.1 block of organisms.spec.ts:33-152 as the template.
test.describe('settings route (Story 5.1)', () => {
  test('renders Settings against the served static export, with zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/settings');

    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    // Hydration signal: the prerendered HTML says "Loading settings…", so these are only
    // reachable once useWorkspaceSeed's and SettingsPage's own resources have both settled —
    // every errors/axe assertion below comes AFTER this, or it races hydration
    // (appShell.spec.ts:29-40).
    await expect(page.getByRole('term').filter({ hasText: 'Saved Battles' })).toBeVisible();
    // The production seed writes Conway's Classic only — no battles.
    await expect(statValue(page, 'Saved Battles')).toHaveText('0');
    await expect(page.getByRole('term').filter({ hasText: 'Organisms' })).toBeVisible();
    await expect(statValue(page, 'Organisms')).toHaveText('1');
    await expect(page.getByRole('term').filter({ hasText: 'Storage Used' })).toBeVisible();
    // Assert the SHAPE, not a number — the production seed is a few KB and moves with every
    // Conway's Classic edit (Story 5.2 AC1/AC3).
    await expect(statValue(page, 'Storage Used')).toHaveText(/^\d[\d,]*\.\d KB$/);

    expect(errors).toEqual([]);
  });

  // Story 5.2 AC4: page-scoped loading — no subscription, no storage event, no polling. The
  // prerendered body says "Loading settings…", so a stale-but-hydrated page and a fresh mount look
  // identical unless the data actually changed in between; this is the only e2e shape that proves
  // the resource actually re-ran rather than merely re-rendering a cached value.
  test('refreshes on return after a save — page-scoped loading (Story 5.2 AC4)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('0');
    const before = await statValue(page, 'Storage Used').textContent();

    // Only client-side navigation from here on — a goto() re-runs the init script and would prove
    // a reload, not a return.
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Battles' }).click();
    await expect(page).toHaveURL('/');
    await page.getByRole('link', { name: 'Create Your First Battle' }).click();
    await expect(page).toHaveURL('/battle/new');

    await page.getByRole('img', { name: /petri dish/i }).click();
    await page.getByRole('textbox', { name: /battle name/i }).fill('Measured In Settings');
    const save = page.getByRole('button', { name: 'Save' });
    await save.click();
    // The write-resolved signal (battleRoute.spec.ts:1155-1156's precedent): the dirty flag clears
    // only once battles.save() has actually completed.
    await expect(save).toBeDisabled();
    await expect(page.locator('[data-dirty]')).toHaveAttribute('data-dirty', 'false');

    // Clean draft, no unsaved-changes guard dialog.
    await page.getByRole('button', { name: 'Back to Battles' }).click();
    await expect(page).toHaveURL('/');
    await nav.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await expect(statValue(page, 'Saved Battles')).toHaveText('1');
    await expect(statValue(page, 'Organisms')).toHaveText('1');

    const afterText = await statValue(page, 'Storage Used').textContent();
    const toKb = (text: string) => {
      const match = /^([\d,]+\.\d+)\s(KB|MB)$/.exec(text.trim());
      if (!match) throw new Error(`Not a storage size: "${text}"`);
      const value = Number(match[1].replace(/,/g, ''));
      return match[2] === 'MB' ? value * 1024 : value;
    };
    expect(toKb(afterText ?? '')).toBeGreaterThan(toKb(before ?? ''));

    expect(errors).toEqual([]);
  });

  test('nav: on /settings only Settings is current; on / only Battles is', async ({ page }) => {
    await page.goto('/settings');
    await expect(statValue(page, 'Organisms')).toHaveText('1');

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveCount(3);
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Battles' })).not.toHaveAttribute('aria-current');
    await expect(nav.getByRole('link', { name: 'Organisms' })).not.toHaveAttribute('aria-current');

    await page.goto('/');
    await expect(nav.getByRole('link', { name: 'Battles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Organisms' })).not.toHaveAttribute('aria-current');
    await expect(nav.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });

  test('is keyboard-reachable from / and activates via Enter', async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Main' });
    const settingsLink = nav.getByRole('link', { name: 'Settings' });

    // ⚠️ WebKit (and the `tablet` project, which runs on it) leaves plain <a> links out of the
    // plain-Tab order — see organisms.spec.ts:89-97 for the full explanation. Listeners attached
    // BEFORE the loop (4-1-*.md:255).
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    let reached = false;
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press(tabKey);
      const isFocused = await settingsLink.evaluate((el) => el === document.activeElement);
      if (isFocused) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);

    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    // Client-side navigation under the persistent (gallery) layout — AppNav does not remount, so
    // this is the one place the live usePathname() subscription is proven for this entry.
    await expect(settingsLink).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Battles' })).not.toHaveAttribute('aria-current');
    await expect(nav.getByRole('link', { name: 'Organisms' })).not.toHaveAttribute('aria-current');
    await expect(statValue(page, 'Organisms')).toHaveText('1');
    expect(errors).toEqual([]);
  });

  test('is prerendered — the raw served HTML has the heading, theme attribute, and no Epic 6 text', async ({
    request,
  }) => {
    const response = await request.get('/settings');
    expect(response.status()).toBe(200);

    const html = await response.text();
    // The rendered ELEMENT, not the bare string — the RSC flight payload carries the string even
    // for a page the client renders onto an empty shell (organisms.spec.ts:127-143).
    expect(html).toMatch(/<h1[^>]*>Settings<\/h1>/);
    expect(html).toContain('Loading settings…');
    expect(html).toContain('data-theme="clinical-lab"');
    // AC4 in the shipped bytes — none of Epic 6's sections exist yet.
    expect(html).not.toContain('Display Preferences');
    expect(html).not.toContain('Simulation');
    expect(html).not.toContain('Auto-Save');
    expect(html).not.toContain('Export');
    expect(html).not.toContain('Import');
    expect(html).not.toContain('Clear');
  });

  test('gol:settings is untouched by a visit', async ({ page }) => {
    // Variant 1: production seed, nothing in localStorage yet.
    await page.goto('/settings');
    const before = await page.evaluate(() => localStorage.getItem('gol:settings'));
    expect(before).toBeNull();
    await expect(statValue(page, 'Organisms')).toHaveText('1');
    const after = await page.evaluate(() => localStorage.getItem('gol:settings'));
    expect(after).toBeNull();
  });

  test('gol:settings byte-identity is preserved when a non-default record already exists', async ({
    page,
  }) => {
    const seeded = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
    await page.addInitScript((value) => {
      localStorage.setItem('gol:settings', value);
    }, seeded);

    await page.goto('/settings');
    await expect(statValue(page, 'Organisms')).toHaveText('1');

    const after = await page.evaluate(() => localStorage.getItem('gol:settings'));
    expect(after).toBe(seeded);
  });

  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/settings');
    await expect(statValue(page, 'Organisms')).toHaveText('1');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
