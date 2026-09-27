import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC, CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';

/**
 * Story 4.25 — create an organism from the battle (FR-1.2, M5, Decision H.2), end to end against
 * the served static export. Thin by design (RFC-008 Decision 2): one happy path over a saved
 * battle (create, paint, verify storage untouched for the battle and written for the organism),
 * one Cancel flow, and axe with the editor open over the battle. Everything else — re-entrancy,
 * the footer's usage snapshot, the overlay's no-reload rule, focus — is
 * `BattlePage.createOrganism.test.tsx`'s.
 */

// Copied from e2e/battleRoute.spec.ts and e2e/editOrganismFromBattle.spec.ts (the standing
// hand-synced seeding copies; `deferred-work.md`'s extraction entry). Keep in sync if any change;
// e2e/ is exempt from the @gol/test-utils import boundary (eslint.config.mjs).
function buildSeedPayload() {
  const { battles, organisms } = createMockWorkspace();
  const battlesRecord: Record<string, unknown> = Object.fromEntries(battles.map((b) => [b.id, b]));
  const organismsRecord = Object.fromEntries([...organisms, CONWAYS_CLASSIC].map((o) => [o.id, o]));

  return JSON.parse(JSON.stringify({ battles: battlesRecord, organisms: organismsRecord })) as {
    battles: unknown;
    organisms: unknown;
  };
}

async function seedWorkspace(page: Page) {
  const payload = buildSeedPayload();

  await page.addInitScript(
    ([keys, formatVersion, data]) => {
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
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

const storage = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

// `exact: true` (the 4.24 substring lesson): "Edit X" and "Create New Organism" both contain
// "Organism", and a name query without it would over-match.
const createButton = (page: Page) =>
  page.getByRole('button', { name: '+ Create New Organism', exact: true });
const editorDialog = (page: Page) => page.getByRole('dialog', { name: 'Organism Editor' });
const dirty = (page: Page) => page.locator('[data-dirty]');

/**
 * The dialog, settled: visible AND its Fade at opacity 1 (the `organisms.spec.ts` idiom — axe on
 * a mid-fade dialog measures a contrast no settled state has; the 4.23 trap).
 */
async function settled(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(page.locator('.MuiDialog-container').last()).toHaveCSS('opacity', '1');
  return dialog;
}

/** Paints one horizontal stroke across the middle of the dish with the selected roster row. */
async function paintStroke(page: Page) {
  const canvas = page.getByRole('img', { name: /petri dish/i });
  await expect(canvas).toBeAttached();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('dish has no layout box');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.up();
}

test.describe('create organism from battle (Story 4.25)', () => {
  test('saved battle: + Create New Organism → name it → Save → Back to Battle adds a selected, paintable row, leaving the battle record untouched', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const url = page.url();
    const battlesBefore = await storage(page, STORAGE_KEYS.battles);
    await expect(dirty(page)).toHaveAttribute('data-dirty', 'false');

    await createButton(page).click();
    const editor = await settled(page, editorDialog(page));
    await expect(editor.getByRole('button', { name: /Back to Battle/ })).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Organism Name' })).toHaveValue('');
    await expect(editor.getByText('Used in 0 Battles')).toBeVisible();
    await expect(editor.getByRole('button', { name: /delete organism/i })).toHaveCount(0);
    const editorScan = await new AxeBuilder({ page }).analyze();
    expect(editorScan.violations).toEqual([]);

    await editor.getByRole('textbox', { name: 'Organism Name' }).fill('New Contender');
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(async () => {
        const stored = await storage(page, STORAGE_KEYS.organisms);
        const record =
          stored === null ? {} : (JSON.parse(stored) as Record<string, { name: string }>);
        return Object.values(record).some((organism) => organism.name === 'New Contender');
      })
      .toBe(true);

    await editor.getByRole('button', { name: /Back to Battle/ }).click();
    await expect(editorDialog(page)).toBeHidden();

    // Same URL, the battle record untouched (no battle save — Decision H.2), and the battle's own
    // dirty flag unaffected by the creation itself.
    expect(page.url()).toBe(url);
    expect(await storage(page, STORAGE_KEYS.battles)).toBe(battlesBefore);
    await expect(dirty(page)).toHaveAttribute('data-dirty', 'false');

    // The new row is present, already selected (FD1) — a click on the dish paints it, proven
    // through the status bar's per-organism count, never pixels (AR-42).
    const row = page.getByRole('button', { name: 'New Contender', exact: true });
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await paintStroke(page);
    await expect(page.getByRole('img', { name: /^New Contender: [1-9]\d*$/ })).toBeVisible();
    await expect(dirty(page)).toHaveAttribute('data-dirty', 'true');

    expect(errors).toEqual([]);
  });

  test('Cancel on a clean draft adds no row and returns focus to the create button', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    const rowsBefore = await page.locator('[data-edit-organism-id]').count();

    await createButton(page).click();
    const editor = await settled(page, editorDialog(page));
    await editor.getByRole('button', { name: /Back to Battle/ }).click();
    await expect(editorDialog(page)).toBeHidden();

    expect(await page.locator('[data-edit-organism-id]').count()).toBe(rowsBefore);
    await expect(createButton(page)).toBeFocused();

    expect(errors).toEqual([]);
  });
});
