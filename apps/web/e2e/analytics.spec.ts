import { test, expect, type Page } from '@playwright/test';

const PROD = 'https://game-of-life-studio.com';
const COUNT_JS = 'https://gc.zgo.at/count.js';

// A stand-in for count.js: records the load it would count, and every later count() call.
const FAKE_COUNT_JS = `
  window.__gc = ['load:' + location.pathname];
  window.goatcounter = { count: function (v) { window.__gc.push(v.path); } };
`;

/** Serves the local static export under the production hostname, and fakes count.js. */
async function asProductionHost(page: Page, baseURL: string) {
  await page.route(`${PROD}/**`, async (route) => {
    const url = new URL(route.request().url());
    // Next aborts prefetches it no longer needs; fulfilling one of those throws "Fetch response
    // has been disposed", which is noise, not a failure of the page under test.
    try {
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch {
      // The request was aborted by the page.
    }
  });
  await page.route(COUNT_JS, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: FAKE_COUNT_JS }),
  );
}

test.describe('visit analytics (GoatCounter)', () => {
  test('off the production host, count.js is never requested', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('gc.zgo.at') || req.url().includes('goatcounter')) {
        requested.push(req.url());
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'About' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();

    expect(requested).toEqual([]);
  });

  test('on the production host, the load and each client-side navigation are counted once', async ({
    page,
    baseURL,
  }) => {
    await asProductionHost(page, baseURL!);

    await page.goto(`${PROD}/`);
    await expect(page.locator(`script[src="${COUNT_JS}"]`)).toHaveAttribute(
      'data-goatcounter',
      'https://gols.goatcounter.com/count',
    );
    await expect
      .poll(() => page.evaluate(() => (window as { __gc?: string[] }).__gc))
      .toEqual(['load:/']);

    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
    await nav.getByRole('link', { name: 'Organisms' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Organism Library' })).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => (window as { __gc?: string[] }).__gc))
      .toEqual(['load:/', '/about', '/organisms']);
  });
});
