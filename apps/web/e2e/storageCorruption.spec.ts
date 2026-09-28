import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace } from '@gol/test-utils';

// Story 5.11's e2e level, kept thin (RFC-008 Decision 2): real served static export, real
// localStorage, one scenario per namespace. The branch matrix (ordering, retry, StrictMode) lives
// in `StorageFailureNotice.test.tsx`.
//
// ⚠️ Corruption is seeded with `page.evaluate` + `page.reload()`, NEVER `addInitScript`: an init
// script re-runs on every navigation INCLUDING a reload, and a successful recovery reloads the page
// (FD7) — an init script would re-corrupt the store and the test would prove nothing.

const NON_DEFAULT_SETTINGS = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
const CORRUPT_WORKSPACE = /stored data appears to be damaged/;

type RawKeys = Record<string, string | null>;

/** Writes raw strings (null removes the key), then reloads so the page reads them from scratch. */
async function writeRawAndReload(page: Page, entries: RawKeys) {
  await page.evaluate((raw) => {
    for (const [key, value] of Object.entries(raw)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  }, entries);
  await page.reload();
}

async function readRawKeys(page: Page): Promise<RawKeys> {
  return page.evaluate((keys) => {
    const out: Record<string, string | null> = {};
    for (const key of Object.values(keys)) out[key] = localStorage.getItem(key);
    return out;
  }, STORAGE_KEYS);
}

/** A valid, stamped workspace (the mock battles and organisms) as raw strings. */
function workspaceRaw(): RawKeys {
  const { battles, organisms } = createMockWorkspace();
  return {
    [STORAGE_KEYS.schema]: JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION }),
    [STORAGE_KEYS.battles]: JSON.stringify(Object.fromEntries(battles.map((b) => [b.id, b]))),
    [STORAGE_KEYS.organisms]: JSON.stringify(Object.fromEntries(organisms.map((o) => [o.id, o]))),
  };
}

function alertWith(page: Page, text: RegExp) {
  // Scoped by text: a bare getByRole('alert') collides with Next's route announcer.
  return page.getByRole('alert').filter({ hasText: text });
}

async function confirmReset(page: Page) {
  await page.getByRole('button', { name: 'Reset Workspace' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clear All Data?' });
  await expect(
    dialog.getByText('This will delete all battles and organisms. This cannot be undone.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Clear All Data' }).click();
}

test.describe('load-time corruption handling (Story 5.11)', () => {
  test('corrupt gol:battles on / → Reset Workspace → the empty Gallery, Conway alone, settings byte-identical', async ({
    page,
  }) => {
    await page.goto('/');
    await writeRawAndReload(page, {
      ...workspaceRaw(),
      [STORAGE_KEYS.battles]: '{not json',
      [STORAGE_KEYS.settings]: NON_DEFAULT_SETTINGS,
    });
    await expect(alertWith(page, CORRUPT_WORKSPACE)).toBeVisible();

    await confirmReset(page);

    await expect(page.getByRole('link', { name: 'Create Your First Battle' })).toBeVisible();
    const after = await readRawKeys(page);
    expect(Object.keys(JSON.parse(after[STORAGE_KEYS.organisms] ?? '{}'))).toEqual([
      'conways-classic',
    ]);
    expect(after[STORAGE_KEYS.settings]).toBe(NON_DEFAULT_SETTINGS);
  });

  test('an unusable gol:schema stamp on /organisms → Reset → the Library holds exactly Conway, stamp current', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await writeRawAndReload(page, { ...workspaceRaw(), [STORAGE_KEYS.schema]: '{not json' });
    await expect(alertWith(page, CORRUPT_WORKSPACE)).toBeVisible();

    await confirmReset(page);

    const grid = page.getByRole('list', { name: 'Organisms' });
    await expect(grid.getByRole('listitem')).toHaveCount(1);
    await expect(grid).toContainText("Conway's Classic");
    const after = await readRawKeys(page);
    expect(after[STORAGE_KEYS.schema]).toBe(
      JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION }),
    );
  });

  test('a newer-format store offers Reload only, writes nothing, and /battle shows the newer body', async ({
    page,
  }) => {
    const { battles } = createMockWorkspace();
    await page.goto('/');
    await writeRawAndReload(page, {
      ...workspaceRaw(),
      [STORAGE_KEYS.schema]: JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }),
      [STORAGE_KEYS.settings]: NON_DEFAULT_SETTINGS,
    });
    const before = await readRawKeys(page);

    await expect(alertWith(page, /newer version of Game of Life Studio/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Workspace' })).toHaveCount(0);
    expect(await readRawKeys(page)).toEqual(before);

    await page.goto(`/battle?id=${battles[0].id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Newer Version Required' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /reset/i })).toHaveCount(0);
    expect(await readRawKeys(page)).toEqual(before);
  });

  test('corrupt gol:settings on /settings → Restore Default Settings → the page renders; data byte-identical', async ({
    page,
  }) => {
    await page.goto('/settings');
    await writeRawAndReload(page, { ...workspaceRaw(), [STORAGE_KEYS.settings]: '{not json' });
    await expect(alertWith(page, /stored settings appear to be damaged/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Workspace' })).toHaveCount(0);
    const before = await readRawKeys(page);

    await page.getByRole('button', { name: 'Restore Default Settings' }).click();

    await expect(page.getByRole('heading', { name: 'Workspace Statistics' })).toBeVisible();
    const after = await readRawKeys(page);
    expect(after[STORAGE_KEYS.battles]).toBe(before[STORAGE_KEYS.battles]);
    expect(after[STORAGE_KEYS.organisms]).toBe(before[STORAGE_KEYS.organisms]);
    expect(after[STORAGE_KEYS.settings]).not.toBe('{not json');
  });

  test('declining the reset leaves every key byte-identical', async ({ page }) => {
    await page.goto('/');
    await writeRawAndReload(page, {
      ...workspaceRaw(),
      [STORAGE_KEYS.organisms]: '{not json',
      [STORAGE_KEYS.settings]: NON_DEFAULT_SETTINGS,
    });
    await expect(alertWith(page, CORRUPT_WORKSPACE)).toBeVisible();
    const before = await readRawKeys(page);

    await page.getByRole('button', { name: 'Reset Workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear All Data?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    expect(await readRawKeys(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Reset Workspace' })).toBeFocused();
  });

  test('the notice and its reset dialog have no axe violations', async ({ page }) => {
    await page.goto('/');
    await writeRawAndReload(page, { ...workspaceRaw(), [STORAGE_KEYS.battles]: '[]' });
    await expect(alertWith(page, CORRUPT_WORKSPACE)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: 'Reset Workspace' }).click();
    // Three waits (the `deleteBattle.spec.ts` precedent): the Dialog's Fade, then MUI Button's
    // own colour transition, which is unsynchronised with it and trips color-contrast mid-mount.
    const dialog = page.getByRole('dialog', { name: 'Clear All Data?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
