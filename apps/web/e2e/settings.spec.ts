import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURRENT_FORMAT_VERSION, WorkspaceExportSchema } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace } from '@gol/test-utils';

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

// Copied from e2e/createBattle.spec.ts's `seedWorkspace`, not shared through a new module — the
// story's file list scopes this story to this one spec file. e2e/ is exempt from the
// @gol/test-utils import boundary (eslint.config.mjs). Module-scoped (not a describe-local
// helper) since Story 5.9's `import` block, below, reuses it too (task 6.4).
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

// AC4's e2e level: the round trip proven against the REAL downloaded file, on the served
// production static export — jsdom cannot give this, only a real browser download can.
test.describe('export workspace (Story 5.5)', () => {
  test('clicking Export downloads a WorkspaceExportSchema-valid file named by AC3, holding exactly the seeded battles and organisms', async ({
    page,
  }) => {
    const { battles, organisms } = await seedWorkspace(page);
    await page.goto('/settings');
    await expect(statValue(page, 'Organisms')).toHaveText(String(organisms.length));

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export workspace' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^game-of-life-workspace-\d{4}-\d{2}-\d{2}\.json$/,
    );

    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const raw = await readFile(downloadPath as string, 'utf-8');
    const file = JSON.parse(raw) as Record<string, unknown>;
    // On the RAW file, never the parse output: Zod strips unknown keys, so `settings` would vanish
    // from `parsed` and this could never fail (AR-12 / Decision F.1).
    expect('settings' in file).toBe(false);
    const parsed = WorkspaceExportSchema.parse(file);

    expect(parsed.kind).toBe('workspace');
    expect(new Set(parsed.battles.map((b) => b.id))).toEqual(new Set(battles.map((b) => b.id)));
    expect(new Set(parsed.organisms.map((o) => o.id))).toEqual(new Set(organisms.map((o) => o.id)));
  });

  test('the Data Management card has no axe accessibility violations', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 2, name: 'Data Management' })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

// AC1-AC8's e2e level, kept thin (RFC-008 Decision 2) — the branch matrix (pristine skip, every
// FD4 copy variant, re-entrancy) lives in `ImportWorkspaceRow.test.tsx`; this only proves the flow
// against the REAL served static export and REAL localStorage.
test.describe('import (Story 5.9)', () => {
  // A hand-built, `WorkspaceExportSchema`-valid file (checked below) rather than the output of an
  // Export click on `seedWorkspace`'s fixture: that fixture's second battle places Conway's
  // Classic cells without carrying a Conway's Classic ORGANISM record (a gap in the fixture, not a
  // product bug — the real app's seed always keeps one), so exporting and re-importing it would
  // trip `'dangling-reference'` for a reason unrelated to what this suite is testing.
  const IMPORT_ENVELOPE = {
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: '9.9.9',
    exportedAt: '2026-01-05T12:00:00.000Z',
    kind: 'workspace',
    organisms: [
      {
        schemaVersion: 1,
        id: 'e2e-import-organism',
        name: 'E2E Import Organism',
        colorToken: 'sky-blue',
        dominance: 50,
        agingEnabled: false,
        survivalRules: [
          {
            id: 'e2e-rule-born',
            contentHash: 'e2e-rule-born-hash',
            conditions: [
              { property: 'cellState', operator: 'eq', pattern: 'empty' },
              { property: 'neighborCount', operator: 'eq', pattern: 3 },
            ],
            payload: { summary: 'Born with 3 neighbors', action: 'born' },
          },
        ],
      },
    ],
    battles: [
      {
        id: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f',
        name: 'E2E Import Battle',
        gridDimensions: { cols: 50, rows: 30 },
        cells: [{ x: 0, y: 0, organismId: 'e2e-import-organism' }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
  // Sanity: keeps the fixture honest against schema changes rather than trusting it by hand.
  WorkspaceExportSchema.parse(IMPORT_ENVELOPE);
  const IMPORT_FILE_BUFFER = Buffer.from(JSON.stringify(IMPORT_ENVELOPE));

  async function pickImportFile(page: Page, buffer: Buffer, name = 'workspace.json') {
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name, mimeType: 'application/json', buffer });
  }

  test('a non-pristine workspace warns, Import Anyway imports, counts refresh, and gol:settings stays byte-identical', async ({
    page,
  }) => {
    const seededSettings = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
    await page.addInitScript((value) => {
      localStorage.setItem('gol:settings', value);
    }, seededSettings);

    await seedWorkspace(page); // non-pristine: two seeded battles
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 2, name: 'Data Management' })).toBeVisible();

    await pickImportFile(page, IMPORT_FILE_BUFFER);

    const dialog = page.getByRole('dialog', { name: 'Replace Your Workspace?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Import Anyway' }).click();

    await expect(page.getByRole('status')).toContainText('Import complete');
    // 1 battle from the file; 1 organism from the file + Conway's Classic, re-ensured (M9).
    await expect(statValue(page, 'Saved Battles')).toHaveText('1');
    await expect(statValue(page, 'Organisms')).toHaveText('2');

    const settingsAfter = await page.evaluate(() => localStorage.getItem('gol:settings'));
    expect(settingsAfter).toBe(seededSettings);
  });

  test("an invalid file ('{') shows the alert and leaves gol:battles / gol:organisms byte-identical", async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('2');

    const before = await page.evaluate(
      (keys: Record<string, string>) => ({
        battles: localStorage.getItem(keys.battles),
        organisms: localStorage.getItem(keys.organisms),
      }),
      STORAGE_KEYS,
    );

    await pickImportFile(page, Buffer.from('{'), 'bad.json');

    // `page.getByRole('alert')` alone is a strict-mode violation on every route: Next's own
    // `#__next-route-announcer__` carries `role="alert"` permanently (organisms.spec.ts's `dialog`/
    // `card`-scoped alert queries are the same fix for the same reason) — filtered by text instead.
    await expect(
      page.getByRole('alert').filter({ hasText: 'not a valid Game of Life Studio' }),
    ).toBeVisible();
    // No dialog for an invalid file (AC2) — validation runs before the pristine check or the
    // warning.
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const after = await page.evaluate(
      (keys: Record<string, string>) => ({
        battles: localStorage.getItem(keys.battles),
        organisms: localStorage.getItem(keys.organisms),
      }),
      STORAGE_KEYS,
    );
    expect(after).toEqual(before);
  });

  test('Export First downloads the current workspace and the dialog stays open', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('2');

    await pickImportFile(page, IMPORT_FILE_BUFFER);
    const dialog = page.getByRole('dialog', { name: 'Replace Your Workspace?' });
    await expect(dialog).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Export Current Workspace First' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^game-of-life-workspace-\d{4}-\d{2}-\d{2}\.json$/,
    );
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText('Your current workspace was downloaded.');
  });

  test('has no axe accessibility violations with the import warning dialog open', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('2');

    await pickImportFile(page, IMPORT_FILE_BUFFER);
    // Settle before scanning. `toBeVisible()` alone scanned mid-Fade on CI (tablet, webkit) and
    // measured the title's blended colours — #262626 on #212121, a different pair every retry.
    // The Fade's opacity is read off `.MuiDialog-container`, not the `role="dialog"` paper, whose
    // own opacity is 1 from its first frame (`organisms.spec.ts`'s settle idiom records why); the
    // 300ms then covers `Button`'s own mount transition (the Clear All test below).
    const dialog = page.getByRole('dialog', { name: 'Replace Your Workspace?' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

// AC1-AC9's e2e level, kept thin (RFC-008 Decision 2): the real served static export, real
// localStorage, and the Gallery's post-reset empty state (AC7) — the branch matrix (ordering,
// idempotent retry, StrictMode) lives in `ClearAllDataRow.test.tsx`.
test.describe('clear all data (Story 5.10)', () => {
  test('confirming Clear Data resets to the default workspace, gol:settings survives byte-identical, and the Gallery shows its empty state (AC2/AC3/AC4/AC5/AC7)', async ({
    page,
  }) => {
    const seededSettings = JSON.stringify({ theme: 'biotech-terminal', gridLines: false });
    await page.addInitScript((value) => {
      localStorage.setItem('gol:settings', value);
    }, seededSettings);
    await seedWorkspace(page);

    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('2');

    await page.getByRole('button', { name: 'Clear data (all battles and organisms)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear All Data?' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText('This will delete all battles and organisms. This cannot be undone.'),
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Clear All Data' }).click();

    await expect(page.getByRole('status')).toContainText('All data cleared');
    await expect(statValue(page, 'Saved Battles')).toHaveText('0');
    await expect(statValue(page, 'Organisms')).toHaveText('1');

    const settingsAfter = await page.evaluate(() => localStorage.getItem('gol:settings'));
    expect(settingsAfter).toBe(seededSettings);

    // Client-side navigation only — a goto() re-runs the init script and would prove a reload,
    // not the actual post-reset Gallery (settings.spec.ts:64-65's precedent).
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Battles' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', { name: 'Create Your First Battle' })).toBeVisible();
  });

  test('Cancel leaves gol:battles / gol:organisms byte-identical', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('2');

    const before = await page.evaluate(
      (keys: Record<string, string>) => ({
        battles: localStorage.getItem(keys.battles),
        organisms: localStorage.getItem(keys.organisms),
      }),
      STORAGE_KEYS,
    );

    await page.getByRole('button', { name: 'Clear data (all battles and organisms)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear All Data?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    const after = await page.evaluate(
      (keys: Record<string, string>) => ({
        battles: localStorage.getItem(keys.battles),
        organisms: localStorage.getItem(keys.organisms),
      }),
      STORAGE_KEYS,
    );
    expect(after).toEqual(before);
  });

  test('has no axe accessibility violations with the Clear All Data dialog open', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/settings');
    await expect(statValue(page, 'Saved Battles')).toHaveText('2');

    await page.getByRole('button', { name: 'Clear data (all battles and organisms)' }).click();
    // Three waits, not one — the `deleteBattle.spec.ts` "has no axe accessibility violations with
    // the delete dialog open" precedent: `toBeVisible()` alone races the Dialog's Fade transition,
    // and even the Fade settling is not enough on its own — `Button`'s OWN root
    // background-color/color transition (`duration.short`, 250ms) is unsynchronised with it, so a
    // scan between those two settle points measures the CONFIRM button's blended, transitional
    // colours. Reproduces the exact same class of failure this story's button (contained, color
    // error) would otherwise trip.
    const dialog = page.getByRole('dialog', { name: 'Clear All Data?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

// Story 7.2 (FR-9.5): descriptions at all three levels, end to end — through the REAL import
// pipeline into REAL localStorage, then read back on every display surface. Thin (RFC-008
// Decision 2): the per-surface present/absent matrix lives in the unit tests.
test.describe('descriptions at every level (Story 7.2)', () => {
  const DESCRIBED_BATTLE_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const ENVELOPE = {
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: '9.9.9',
    exportedAt: '2026-01-05T12:00:00.000Z',
    kind: 'workspace',
    description: 'A lab notebook for rival colonies.',
    organisms: [
      {
        schemaVersion: 1,
        id: 'e2e-described-organism',
        name: 'Described Organism',
        description: 'Spreads fast, dies young.',
        colorToken: 'sky-blue',
        dominance: 50,
        agingEnabled: false,
        survivalRules: [],
      },
      {
        schemaVersion: 1,
        id: 'e2e-plain-organism',
        name: 'Plain Organism',
        colorToken: 'coral-red',
        dominance: 40,
        agingEnabled: false,
        survivalRules: [],
      },
    ],
    battles: [
      {
        id: DESCRIBED_BATTLE_ID,
        name: 'Described Battle',
        description: 'Two colonies, one dish.',
        gridDimensions: { cols: 50, rows: 30 },
        cells: [
          { x: 0, y: 0, organismId: 'e2e-described-organism' },
          { x: 5, y: 5, organismId: 'e2e-plain-organism' },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
        name: 'Plain Battle',
        gridDimensions: { cols: 50, rows: 30 },
        cells: [{ x: 1, y: 1, organismId: 'e2e-plain-organism' }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
  WorkspaceExportSchema.parse(ENVELOPE);

  test('an imported file’s descriptions appear on the gallery, the organism cards and the battle header', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 2, name: 'Data Management' })).toBeVisible();
    await expect(statValue(page, 'Organisms')).toHaveText('1'); // hydrated, pristine
    await page.locator('input[type="file"]').setInputFiles({
      name: 'workspace.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(ENVELOPE)),
    });
    // Pristine (Conway's Classic alone) ⇒ no warning dialog; the import runs straight away.
    await expect(page.getByRole('status')).toContainText('Import complete');
    // The Settings row re-reads the store after an import.
    await expect(page.getByRole('textbox', { name: 'Workspace description' })).toHaveValue(
      'A lab notebook for rival colonies.',
    );

    await page.goto('/');
    await expect(page.locator('[data-workspace-description]')).toHaveText(
      'A lab notebook for rival colonies.',
    );
    await expect(page.getByRole('article')).toHaveCount(2);
    // Only the described battle's tile carries a description element — no placeholder chrome.
    await expect(page.locator('[data-tile-description]')).toHaveCount(1);
    await expect(page.locator('[data-tile-description]')).toHaveText('Two colonies, one dish.');

    await page.goto('/organisms');
    await expect(page.getByRole('heading', { level: 2, name: 'Described Organism' })).toBeVisible();
    await expect(page.locator('[data-card-description]')).toHaveCount(1);
    await expect(page.locator('[data-card-description]')).toHaveText('Spreads fast, dies young.');

    await page.goto(`/battle?id=${DESCRIBED_BATTLE_ID}&mode=run`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Described Battle/i);
    await expect(page.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-battle-description]')).toHaveText('Two colonies, one dish.');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});
