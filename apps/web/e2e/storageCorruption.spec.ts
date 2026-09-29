import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace } from '@gol/test-utils';

// Story 7.4 (FD6): a fresh context now loads the default preset on its first seeding page. This
// spec overwrites the store right after a fresh first load; letting the preset import race that
// write would make it flaky, so this forces the silent FR-1.5 fallback: a 200 whose body is not a
// manifest fails the loader's parse. Never `route.abort()` or a 404 — Chromium logs "Failed to load
// resource" as a console error, which trips the zero-console-error assertions. A file-local copy,
// per the house convention for e2e helpers (see settings.spec.ts's `seedWorkspace`). Stamped
// (seeded) contexts never fetch, so the route is inert for them.
async function forcePresetFallback(page: Page) {
  await page.route('**/workspaces/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

test.beforeEach(async ({ page }) => {
  await forcePresetFallback(page);
});

// Story 5.11's e2e level, kept thin (RFC-008 Decision 2): real served static export, real
// localStorage, one scenario per namespace. The branch matrix (ordering, retry, StrictMode) lives
// in `StorageFailureNotice.test.tsx`.
//
// ⚠️ Corruption is seeded with `page.evaluate` + `page.reload()`, NEVER `addInitScript`: an init
// script re-runs on every navigation INCLUDING a reload, and a successful recovery reloads the page
// (FD7) — an init script would re-corrupt the store and the test would prove nothing.

const NON_DEFAULT_SETTINGS = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
// The corrupt-workspace line names only the namespace that failed (owner ruling D2 (b)).
const CORRUPT_BATTLES = /Your saved battles could not be read/;
const CORRUPT_ORGANISMS = /Your saved organisms could not be read/;
const CORRUPT_FORMAT = /Your saved workspace could not be read — its format information/;

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
    // Story 7.2: `gol:workspace` is a STORAGE_KEY, so `readRawKeys` reads it — seeded with a real
    // description so every byte-identity check below covers it too.
    [STORAGE_KEYS.workspace]: JSON.stringify({ description: 'Lab notes.' }),
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
    await expect(alertWith(page, CORRUPT_BATTLES)).toBeVisible();

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
    await expect(alertWith(page, CORRUPT_FORMAT)).toBeVisible();

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
    // Byte-identity is checked against the SEEDED strings, never a post-load read: a read taken
    // after the page rendered would prove only that the click wrote nothing, not that loading and
    // rendering the notice wrote nothing (AC4 / M9 — no self-heal on a plain load).
    const seeded: RawKeys = {
      ...workspaceRaw(),
      [STORAGE_KEYS.schema]: JSON.stringify({ formatVersion: CURRENT_FORMAT_VERSION + 1 }),
      [STORAGE_KEYS.settings]: NON_DEFAULT_SETTINGS,
    };
    await page.goto('/');
    await writeRawAndReload(page, seeded);

    await expect(alertWith(page, /newer version of Game of Life Studio/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Workspace' })).toHaveCount(0);
    expect(await readRawKeys(page)).toEqual(seeded);

    await page.goto(`/battle?id=${battles[0].id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Newer Version Required' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /reset/i })).toHaveCount(0);
    expect(await readRawKeys(page)).toEqual(seeded);
  });

  test('corrupt gol:settings on /settings → Restore Default Settings → the page renders; data byte-identical', async ({
    page,
  }) => {
    const seeded: RawKeys = { ...workspaceRaw(), [STORAGE_KEYS.settings]: '{not json' };
    await page.goto('/settings');
    await writeRawAndReload(page, seeded);
    await expect(alertWith(page, /stored settings appear to be damaged/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Workspace' })).toHaveCount(0);
    // Rendering the notice wrote nothing (AC4) — compared against the seeded strings.
    expect(await readRawKeys(page)).toEqual(seeded);

    await page.getByRole('button', { name: 'Restore Default Settings' }).click();

    await expect(page.getByRole('heading', { name: 'Workspace Statistics' })).toBeVisible();
    const after = await readRawKeys(page);
    expect(after[STORAGE_KEYS.battles]).toBe(seeded[STORAGE_KEYS.battles]);
    expect(after[STORAGE_KEYS.organisms]).toBe(seeded[STORAGE_KEYS.organisms]);
    expect(after[STORAGE_KEYS.settings]).not.toBe('{not json');
  });

  test('declining the reset leaves every key byte-identical', async ({ page }) => {
    const seeded: RawKeys = {
      ...workspaceRaw(),
      [STORAGE_KEYS.organisms]: '{not json',
      [STORAGE_KEYS.settings]: NON_DEFAULT_SETTINGS,
    };
    await page.goto('/');
    await writeRawAndReload(page, seeded);
    await expect(alertWith(page, CORRUPT_ORGANISMS)).toBeVisible();

    await page.getByRole('button', { name: 'Reset Workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear All Data?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // Against the seeded strings: neither the load, the notice, the dialog nor the decline wrote.
    expect(await readRawKeys(page)).toEqual(seeded);
    await expect(page.getByRole('button', { name: 'Reset Workspace' })).toBeFocused();
  });

  test('the notice and its reset dialog have no axe violations', async ({ page }) => {
    await page.goto('/');
    await writeRawAndReload(page, { ...workspaceRaw(), [STORAGE_KEYS.battles]: '[]' });
    await expect(alertWith(page, CORRUPT_BATTLES)).toBeVisible();
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
