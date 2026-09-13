import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Thin e2e (RFC-008 Decision 2), same fixtures/patterns as home.spec.ts / appShell.spec.ts.
test.describe('organisms route (Story 4.1)', () => {
  test('renders the Organism Library against the served static export, with zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/organisms');

    await expect(page.getByRole('heading', { level: 1, name: 'Organism Library' })).toBeVisible();
    // The hydration signal: the prerendered HTML says "Loading organisms…", so this list item is
    // only reachable once useWorkspaceSeed's and OrganismLibrary's own load effect have both run
    // — every assertion on errors/axe below must come AFTER it, or it races hydration exactly as
    // appShell.spec.ts explains.
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('nav reflects the current route on both pages', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'Organisms' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Battles' })).not.toHaveAttribute('aria-current');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Battles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Organisms' })).not.toHaveAttribute('aria-current');
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
    const organismsLink = nav.getByRole('link', { name: 'Organisms' });

    // ⚠️ WebKit (and therefore the `tablet` project, which runs on it) leaves plain `<a>` links
    // out of the plain-Tab order — Safari's default with "Press Tab to highlight each item" off.
    // Measured against the served export: ten plain Tabs leave document.activeElement on <body>,
    // while Option+Tab (`Alt+Tab` here) walks Battles → Organisms → … in DOM order. That modifier
    // is what a real Safari user presses to reach links, and WebCore refuses only Ctrl/Meta-
    // modified Tabs, so it moves focus on every WebKit port (Linux CI included). Using it keeps a
    // genuine Tab-reachability proof on all four projects rather than substituting a scripted
    // focus() on two of them. Chromium and Firefox reach the link with plain Tab.
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    // Bounded loop (<= 10 presses): the wordmark is not focusable, so Organisms is the 2nd Tab
    // stop today, but this does not hardcode that — only that it is reachable at all.
    let reached = false;
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press(tabKey);
      const isFocused = await organismsLink.evaluate((el) => el === document.activeElement);
      if (isFocused) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);

    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/organisms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Organism Library' })).toBeVisible();
    // This is a CLIENT-SIDE navigation (next/link under the persistent (gallery) layout), so
    // AppNav does not remount — the only way aria-current moves is usePathname() re-rendering it.
    // The two page.goto loads in the nav-state test above prove the prerendered attribute; this
    // is the one place the live subscription is proven.
    await expect(organismsLink).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Battles' })).not.toHaveAttribute('aria-current');
    // Hydration signal before the error check, same discipline as the first test.
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('is prerendered — the raw served HTML already contains the heading and theme attribute', async ({
    request,
  }) => {
    const response = await request.get('/organisms');
    expect(response.status()).toBe(200);

    const html = await response.text();
    // The rendered ELEMENT, not the bare string: the RSC flight payload (`self.__next_f.push`)
    // carries "Organism Library" even for a page the client renders onto an empty shell, so a
    // substring match would pass without any prerender at all.
    expect(html).toMatch(/<h1[^>]*>Organism Library<\/h1>/);
    // The SSR body is the pre-hydration "Loading organisms…" state — the fact every hydration
    // signal in this file relies on. If the list were ever prerendered instead, those waits
    // would silently stop proving hydration.
    expect(html).toContain('Loading organisms…');
    expect(html).toContain('data-theme="clinical-lab"');
  });

  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
