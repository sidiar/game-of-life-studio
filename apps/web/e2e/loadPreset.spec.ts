import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace } from '@gol/test-utils';

// Story 7.5 (FD8): its own spec, NOT `settings.spec.ts` — that file's file-wide
// `forcePresetFallback` serves `{}` for `index.json`, so the Load Preset row would render its
// list-failure state there. Here the real manifest is served; the pristine test forces the
// fallback for the FIRST visit only.

const PRESETS_DIR = join(__dirname, '..', 'public', 'workspaces');
const manifest = JSON.parse(readFileSync(join(PRESETS_DIR, 'index.json'), 'utf8')) as {
  defaultPresetId: string;
  workspaces: { id: string; name: string; description: string; file: string }[];
};
const preset = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId)!;
const presetBattleNames = (
  JSON.parse(readFileSync(join(PRESETS_DIR, preset.file), 'utf8')) as {
    battles: { name: string }[];
  }
).battles.map((b) => b.name);

function statValue(page: Page, term: string) {
  return page.getByRole('term').filter({ hasText: term }).locator('..').getByRole('definition');
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// File-local copy, per the house convention (see `settings.spec.ts`'s `seedWorkspace`).
async function seedWorkspace(page: Page) {
  const { battles, organisms } = createMockWorkspace();
  const battlesRecord = Object.fromEntries(battles.map((b) => [b.id, b]));
  const organismsRecord = Object.fromEntries(organisms.map((o) => [o.id, o]));
  const payload = JSON.parse(
    JSON.stringify({ battles: battlesRecord, organisms: organismsRecord }),
  ) as { battles: unknown; organisms: unknown };

  await page.addInitScript(
    ([keys, formatVersion, data]) => {
      // Stamps gol:schema so isFreshWorkspace() is false and the default seed does not append
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

  return { battles, organisms };
}

const TITLE = `Load \u201C${preset.name}\u201D?`;

async function storage(page: Page) {
  return page.evaluate(
    (keys: Record<string, string>) => ({
      battles: localStorage.getItem(keys.battles),
      organisms: localStorage.getItem(keys.organisms),
      settings: localStorage.getItem('gol:settings'),
    }),
    STORAGE_KEYS,
  );
}

test.describe('load preset from settings (Story 7.5)', () => {
  test('a non-pristine workspace warns; Load Preset replaces it, counts and gallery follow, gol:settings is untouched', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const seededSettings = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
    await page.addInitScript(
      (value) => localStorage.setItem('gol:settings', value),
      seededSettings,
    );
    await seedWorkspace(page);
    await page.goto('/settings');

    const select = page.getByRole('combobox', { name: 'Load Preset Workspace' });
    await expect(select).toBeVisible();
    await expect(select.locator('option:checked')).toHaveText(`${preset.name} (default)`);
    // Story 7.7: the list is the manifest, default first and suffixed, the rest in manifest order.
    const expectedOptions = [
      `${preset.name} (default)`,
      ...manifest.workspaces.filter((w) => w.id !== preset.id).map((w) => w.name),
    ];
    await expect(select.locator('option')).toHaveText(expectedOptions);
    await expect(page.getByText(preset.description, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Load preset workspace' }).click();
    const dialog = page.getByRole('dialog', { name: TITLE });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Load Preset' }).click();

    await expect(page.getByRole('status')).toContainText(`Loaded \u201C${preset.name}\u201D`);
    await expect(statValue(page, 'Saved Battles')).toHaveText(String(presetBattleNames.length));
    expect((await storage(page)).settings).toBe(seededSettings);

    // Client-side navigation: `seedWorkspace`'s init script would re-seed on a full page load.
    await page.getByRole('link', { name: 'Battles' }).click();
    for (const name of presetBattleNames) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('Cancel leaves gol:battles / gol:organisms byte-identical', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('2');
    const before = await storage(page);

    await page.getByRole('button', { name: 'Load preset workspace' }).click();
    const dialog = page.getByRole('dialog', { name: TITLE });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    expect(await storage(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Load preset workspace' })).toBeFocused();
  });

  test('a pristine workspace loads with no dialog', async ({ page }) => {
    // First visit only: the 7.4 fallback gives a stamped, Conway-only, pristine store.
    const handler = (route: import('@playwright/test').Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    await page.route('**/workspaces/index.json', handler);
    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('0');
    await page.unroute('**/workspaces/index.json', handler);
    await page.reload();

    await page.getByRole('button', { name: 'Load preset workspace' }).click();
    await expect(page.getByRole('status')).toContainText(`Loaded \u201C${preset.name}\u201D`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(statValue(page, 'Saved Battles')).toHaveText(String(presetBattleNames.length));
  });

  test('has no axe violations with the row rendered, nor with the preset dialog open', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Load preset workspace' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: 'Load preset workspace' }).click();
    await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
