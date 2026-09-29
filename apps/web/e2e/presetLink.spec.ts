import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace } from '@gol/test-utils';

// Story 7.6 (FR-9.4): `/?preset=<id>`. Its own spec; the existing specs never use `?preset` and
// must pass unedited (they prove the no-link path is untouched).

const PRESETS_DIR = join(__dirname, '..', 'public', 'workspaces');
const manifestText = readFileSync(join(PRESETS_DIR, 'index.json'), 'utf8');
const manifest = JSON.parse(manifestText) as {
  defaultPresetId: string;
  workspaces: { id: string; name: string; description: string; file: string }[];
};
const preset = manifest.workspaces.find((w) => w.id === 'colony-clash')!;
const envelopeText = readFileSync(join(PRESETS_DIR, preset.file), 'utf8');
const presetBattleNames = (JSON.parse(envelopeText) as { battles: { name: string }[] }).battles.map(
  (b) => b.name,
);
const TITLE = `Load “${preset.name}”?`;

// Test-side extra preset: the only way to tell "the link's preset" from a shipped one by battle
// names alone (the shipped catalogue's names are real content, never suffixed). Test data, never a
// shipped preset.
const LINK_DESCRIPTION = 'A test-only preset.';
const LINK_SUFFIX = ' (link)';
async function routeLinkTestPreset(page: Page) {
  await page.route('**/workspaces/index.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...manifest,
        workspaces: [
          ...manifest.workspaces,
          {
            id: 'link-test',
            name: 'Link Test',
            description: LINK_DESCRIPTION,
            file: 'link-test.json',
          },
        ],
      }),
    }),
  );
  await page.route('**/workspaces/link-test.json', (route) => {
    const env = JSON.parse(envelopeText) as {
      description: string;
      battles: { name: string }[];
    };
    env.description = LINK_DESCRIPTION;
    for (const b of env.battles) b.name = `${b.name}${LINK_SUFFIX}`;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(env),
    });
  });
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// File-local copy (house convention). `page.addInitScript` re-runs on EVERY navigation, including
// `page.reload()`, so a reload would re-seed and mask a replace: seed once per context.
async function seedWorkspace(page: Page) {
  const { battles, organisms } = createMockWorkspace();
  const payload = JSON.parse(
    JSON.stringify({
      battles: Object.fromEntries(battles.map((b) => [b.id, b])),
      organisms: Object.fromEntries(organisms.map((o) => [o.id, o])),
    }),
  ) as { battles: unknown; organisms: unknown };

  await page.addInitScript(
    ([keys, formatVersion, data]) => {
      if (sessionStorage.getItem('e2e-seeded') !== null) return;
      sessionStorage.setItem('e2e-seeded', '1');
      const k = keys as Record<string, string>;
      localStorage.setItem(k.schema, JSON.stringify({ formatVersion }));
      localStorage.setItem(k.battles, JSON.stringify((data as { battles: unknown }).battles));
      localStorage.setItem(k.organisms, JSON.stringify((data as { organisms: unknown }).organisms));
    },
    [STORAGE_KEYS, CURRENT_FORMAT_VERSION, payload] as const,
  );
  return { battles, organisms };
}

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

const galleryTitles = (page: Page) => page.getByRole('heading', { level: 2 });

test.describe('preset link (Story 7.6)', () => {
  test('(a) first visit: the linked preset loads with no dialog, the default is never fetched, the URL is cleaned', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const requested: string[] = [];
    page.on('request', (req) => requested.push(req.url()));
    await routeLinkTestPreset(page);

    await page.goto('/?preset=link-test');

    for (const name of presetBattleNames) {
      await expect(
        page.getByRole('heading', { level: 2, name: `${name}${LINK_SUFFIX}` }),
      ).toBeVisible();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(requested.some((u) => u.includes('colony-clash.json'))).toBe(false);
    await expect.poll(() => new URL(page.url()).searchParams.has('preset')).toBe(false);

    await page.reload();
    for (const name of presetBattleNames) {
      await expect(
        page.getByRole('heading', { level: 2, name: `${name}${LINK_SUFFIX}` }),
      ).toBeVisible();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('(b) non-pristine + Cancel: the seeded workspace stays byte-identical, the URL is clean, a reload does not re-prompt', async ({
    page,
  }) => {
    const { battles } = await seedWorkspace(page);
    await page.goto('/?preset=colony-clash');

    const dialog = page.getByRole('dialog', { name: TITLE });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('This link opens a preset workspace');
    const before = await storage(page);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    for (const b of battles) {
      await expect(page.getByRole('heading', { level: 2, name: b.name })).toBeVisible();
    }
    expect(await storage(page)).toEqual(before);
    await expect.poll(() => new URL(page.url()).searchParams.has('preset')).toBe(false);
    await expect(page.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeFocused();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('(c) non-pristine + Load Preset: the preset replaces the workspace, gol:settings is untouched', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const seededSettings = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
    await page.addInitScript((value) => {
      if (sessionStorage.getItem('e2e-settings') !== null) return;
      sessionStorage.setItem('e2e-settings', '1');
      localStorage.setItem('gol:settings', value);
    }, seededSettings);
    await seedWorkspace(page);
    await page.goto('/?preset=colony-clash');

    const dialog = page.getByRole('dialog', { name: TITLE });
    await dialog.getByRole('button', { name: 'Load Preset' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Loaded' })).toContainText(
      `Loaded “${preset.name}”`,
    );
    for (const name of presetBattleNames) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    expect((await storage(page)).settings).toBe(seededSettings);
    await expect.poll(() => new URL(page.url()).searchParams.has('preset')).toBe(false);
    expect(errors).toEqual([]);
  });

  test('(d) unknown id on a non-pristine store: alert, store untouched, Dismiss removes it, URL clean', async ({
    page,
  }) => {
    const { battles } = await seedWorkspace(page);
    // The baseline is taken on a link-free visit, BEFORE the arrival runs (Review 2026-09-29), so
    // the comparison proves the unknown-id flow wrote nothing — not merely that Dismiss did not.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: battles[0]!.name })).toBeVisible();
    const before = await storage(page);
    await page.goto('/?preset=spiral-wars');

    const alert = page.getByRole('alert').filter({ hasText: 'spiral-wars' });
    await expect(alert).toContainText('“spiral-wars”');
    await expect(alert).toContainText('untouched');
    await expect.poll(() => new URL(page.url()).searchParams.has('preset')).toBe(false);
    // The notice survives the URL strip: the page was not remounted (replaceState, not a navigation).
    await expect(alert).toBeVisible();
    expect(await storage(page)).toEqual(before);

    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(alert).toHaveCount(0);
    expect(await storage(page)).toEqual(before);
  });

  test('(e) unknown id on a first visit: the default preset loads, the alert does not claim "untouched"', async ({
    page,
  }) => {
    await page.goto('/?preset=spiral-wars');

    const alert = page.getByRole('alert').filter({ hasText: 'spiral-wars' });
    await expect(alert).toContainText('“spiral-wars”');
    await expect(alert).not.toContainText('untouched');
    const defaultEntry = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId)!;
    const defaultNames = (
      JSON.parse(readFileSync(join(PRESETS_DIR, defaultEntry.file), 'utf8')) as {
        battles: { name: string }[];
      }
    ).battles.map((b) => b.name);
    for (const name of defaultNames) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
  });

  test('(f) axe: no violations with the dialog open, and none with the notice shown', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/?preset=colony-clash');
    const dialog = page.getByRole('dialog', { name: TITLE });
    await expect(dialog).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await page.goto('/?preset=spiral-wars');
    await expect(page.getByRole('alert').filter({ hasText: 'spiral-wars' })).toBeVisible();
    await expect(galleryTitles(page).first()).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
  // Story 7.7 (FD8): reachability by construction, proven once on the REAL manifest. Each visit is
  // a fresh context (pristine, so no dialog per 7.6 AC1); a second `?preset` visit in one context
  // would meet the first preset's workspace and prompt.
  test('(g) every non-default catalogue preset loads by link on a first visit', async ({
    browser,
  }) => {
    const catalogue = manifest.workspaces.filter((w) => w.id !== manifest.defaultPresetId);
    expect(catalogue.length).toBeGreaterThanOrEqual(3);
    for (const entry of catalogue) {
      const names = (
        JSON.parse(readFileSync(join(PRESETS_DIR, entry.file), 'utf8')) as {
          battles: { name: string }[];
        }
      ).battles.map((b) => b.name);
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`/?preset=${entry.id}`);
      for (const name of names) {
        await expect(
          page.getByRole('heading', { level: 2, name }),
          `preset "${entry.id}" battle "${name}"`,
        ).toBeVisible();
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await context.close();
    }
  });
});
