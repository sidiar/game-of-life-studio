import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC, CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace, MOCK_BATTLE_IDS, MOCK_ORGANISM_IDS } from '@gol/test-utils';

/**
 * Story 4.24 — edit an organism from the battle (FR-3.12, M5, AR-33), end to end against the
 * served static export. Thin by design (RFC-008 Decision 2): one happy path over a saved battle,
 * one unsaved-battle labelling check, and axe with the gate and with the editor over the battle.
 * Everything else — re-entrancy, the list-rejection alert, focus, the overlay's no-reload rule —
 * is `BattlePage.editOrganism.test.tsx`'s.
 */

// Copied from e2e/battleRoute.spec.ts (the standing hand-synced seeding copies; `deferred-work.md`'s
// extraction entry). Keep in sync if either changes; e2e/ is exempt from the @gol/test-utils
// import boundary (eslint.config.mjs).
function buildSeedPayload() {
  const { battles, organisms } = createMockWorkspace();
  const battlesRecord: Record<string, unknown> = Object.fromEntries(battles.map((b) => [b.id, b]));
  const organismsRecord = Object.fromEntries([...organisms, CONWAYS_CLASSIC].map((o) => [o.id, o]));

  return JSON.parse(JSON.stringify({ battles: battlesRecord, organisms: organismsRecord })) as {
    battles: unknown;
    organisms: unknown;
  };
}

// Conway's Classic rides in the payload above (rather than `battleRoute.spec.ts`'s separate
// `seedConwaysClassic` script): `/battle/new` seeds its roster with it, and a dangling default
// tool would warn on every load of this spec.
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

const pencil = (page: Page, name: string) =>
  page.getByRole('button', { name: `Edit ${name}`, exact: true });
const inUseDialog = (page: Page) => page.getByRole('dialog', { name: /^Used in \d+ Battles?$/ });
const editorDialog = (page: Page) => page.getByRole('dialog', { name: 'Organism Editor' });
const dirty = (page: Page) => page.locator('[data-dirty]');
const livingCells = (page: Page) =>
  page
    .getByRole('region', { name: 'Battle statistics' })
    .getByRole('group', { name: /^Living Cells: \d+$/ });

/**
 * The dialog, settled: visible AND its Fade at opacity 1 (the `organisms.spec.ts` idiom — axe on
 * a mid-fade dialog measures a contrast no settled state has; the 4.23 trap). Read off the LAST
 * `.MuiDialog-container`: only one dialog is on screen at a time here, but a fading predecessor
 * can still be in the DOM for a frame.
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

/** The row's colour chip — the canvas-adjacent place a colour change is observable without
 * pixel-testing the canvas (AR-42). */
const chipOf = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('span[aria-hidden="true"]').first();

test.describe('edit organism from battle (Story 4.24)', () => {
  test('saved battle: pencil → two-button gate → Edit Anyway → change colour → Save → Back to Battle keeps the grid, the dirty flag and the undo ring', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto(`/battle?id=${MOCK_BATTLE_IDS.battleA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three-Way Skirmish');

    // A dirty battle with one undo level: select Aggressive Colonizer and paint a stroke.
    const livingBefore = await livingCells(page).getAttribute('aria-label');
    await page.getByRole('button', { name: 'Aggressive Colonizer', exact: true }).click();
    await paintStroke(page);
    await expect(dirty(page)).toHaveAttribute('data-dirty', 'true');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    const livingPainted = await livingCells(page).getAttribute('aria-label');
    expect(livingPainted).not.toBe(livingBefore);

    const url = page.url();
    const battlesBefore = await storage(page, STORAGE_KEYS.battles);
    const chip = chipOf(page, 'Aggressive Colonizer');
    const chipBefore = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);

    // The gate: the battle variant, two actions.
    await pencil(page, 'Aggressive Colonizer').click();
    const gate = await settled(page, inUseDialog(page));
    await expect(gate).toHaveAccessibleName('Used in 2 Battles');
    await expect(gate.locator('.MuiDialogActions-root').getByRole('button')).toHaveText([
      'Cancel',
      'Edit Anyway',
    ]);
    await expect(gate.getByRole('button', { name: 'Clone & Edit' })).toHaveCount(0);
    const gateScan = await new AxeBuilder({ page }).analyze();
    expect(gateScan.violations).toEqual([]);

    // The editor, over the mounted battle.
    await gate.getByRole('button', { name: 'Edit Anyway' }).click();
    const editor = await settled(page, editorDialog(page));
    await expect(editor.getByRole('button', { name: /Back to Battle/ })).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
      'Aggressive Colonizer',
    );
    const editorScan = await new AxeBuilder({ page }).analyze();
    expect(editorScan.violations).toEqual([]);

    const basicInfo = editor.getByRole('region', { name: 'Basic Information' });
    await basicInfo.getByRole('button', { name: 'Change Color' }).click();
    await basicInfo
      .getByRole('radiogroup', { name: 'Organism Color' })
      .getByRole('radio', { name: 'Amber' })
      .click();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(async () => {
        const stored = await storage(page, STORAGE_KEYS.organisms);
        const record =
          stored === null ? {} : (JSON.parse(stored) as Record<string, { colorToken: string }>);
        return record[MOCK_ORGANISM_IDS.aggressiveColonizer]?.colorToken;
      })
      .toBe('amber');

    await editor.getByRole('button', { name: /Back to Battle/ }).click();
    await expect(editorDialog(page)).toBeHidden();

    // The battle behind: same URL, same dirty flag, the chip now shows the new colour, and the
    // battle record in storage is untouched — no battle save was needed (FR-3.12).
    expect(page.url()).toBe(url);
    await expect(dirty(page)).toHaveAttribute('data-dirty', 'true');
    await expect
      .poll(() => chip.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(chipBefore);
    expect(await storage(page, STORAGE_KEYS.battles)).toBe(battlesBefore);
    await expect(livingCells(page)).toHaveAttribute('aria-label', livingPainted ?? '');

    // Undo still restores the pre-stroke grid — the ring survived the round trip.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(livingCells(page)).toHaveAttribute('aria-label', livingBefore ?? '');

    expect(errors).toEqual([]);
  });

  test('unsaved /battle/new: the gate lists "Current Battle (unsaved)"', async ({ page }) => {
    const errors = collectErrors(page);
    await seedWorkspace(page);
    await page.goto('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');

    // /battle/new seeds one roster row (Conway's Classic); painting it makes the open battle use it.
    await page.getByRole('button', { name: "Conway's Classic", exact: true }).click();
    await paintStroke(page);

    // Grand Colony War (saved) places Conway's Classic too; the open battle is ADDED after it (M7).
    await pencil(page, "Conway's Classic").click();
    const gate = await settled(page, inUseDialog(page));
    await expect(gate).toHaveAccessibleName('Used in 2 Battles');
    await gate.getByRole('button', { name: 'Used in 2 Battles' }).click();
    await expect(page.locator('[data-usage-battles-panel]').getByRole('listitem')).toHaveText([
      'Grand Colony War',
      'Current Battle (unsaved)',
    ]);

    // Cancel changes nothing and hands focus back to the pencil.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(inUseDialog(page)).toBeHidden();
    await expect(pencil(page, "Conway's Classic")).toBeFocused();

    expect(errors).toEqual([]);
  });
});
