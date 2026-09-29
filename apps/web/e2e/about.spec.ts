import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('about route', () => {
  test('is prerendered — the raw served HTML already carries the heading and the contact links', async ({
    request,
  }) => {
    const response = await request.get('/about');
    expect(response.status()).toBe(200);

    const html = await response.text();
    // The rendered ELEMENT, not the bare string — the RSC payload carries strings too.
    expect(html).toMatch(/<h1[^>]*>About<\/h1>/);
    expect(html).toContain('href="https://www.linkedin.com/in/arielsidi/"');
    expect(html).toContain('href="https://github.com/sidiar/game-of-life-studio"');
    expect(html).toContain('href="mailto:hello@game-of-life-studio.com');
  });

  test('is reachable from the nav, marks About current, and renders with zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'About' }).click();

    await expect(page).toHaveURL(/\/about\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Battles' })).not.toHaveAttribute('aria-current');

    expect(errors).toEqual([]);
  });

  test('has no axe violations', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // Link previews (LinkedIn, dev.to, Slack, X) read the served HTML only, never the hydrated DOM,
  // and need ABSOLUTE image URLs — both are properties of the static export, so the raw response
  // is what is asserted.
  test('serves the link-preview metadata on / and /about', async ({ request }) => {
    for (const [path, title] of [
      ['/', 'Game of Life Studio'],
      ['/about', 'About · Game of Life Studio'],
    ] as const) {
      const html = await (await request.get(path)).text();
      expect(html).toContain(`<title>${title}</title>`);
      expect(html).toMatch(/<meta name="description" content="[^"]+"/);
      expect(html).toContain('<meta name="author" content="Ariel Sidi"/>');
      expect(html).toContain('<meta property="og:site_name" content="Game of Life Studio"/>');
      expect(html).toMatch(
        /<meta property="og:image" content="https:\/\/game-of-life-studio\.com\/opengraph-image\.png[^"]*"/,
      );
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image"/>');
      expect(html).toMatch(/<link rel="icon" href="\/icon\.svg[^"]*"/);
    }
  });

  test('the preview image and favicon are served', async ({ request }) => {
    const image = await request.get('/opengraph-image.png');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/png');

    const icon = await request.get('/icon.svg');
    expect(icon.status()).toBe(200);
  });
});
