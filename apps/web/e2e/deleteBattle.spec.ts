import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace } from '@gol/test-utils';

// Copied from e2e/gallery.spec.ts (Story 1.10/1.13) rather than shared through a new module — the
// story's file list scopes this story to one new spec file. Keep the two in sync if either
// changes; e2e/ is exempt from the @gol/test-utils import boundary (eslint.config.mjs).
function buildSeedPayload() {
  const { battles, organisms } = createMockWorkspace();
  const battlesRecord: Record<string, unknown> = Object.fromEntries(battles.map((b) => [b.id, b]));
  const organismsRecord = Object.fromEntries(organisms.map((o) => [o.id, o]));

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

// The two seeded mock battles (packages/test-utils/src/mockWorkspace.ts), sorted most-recent-first
// exactly as gallery.spec.ts asserts: Grand Colony War (updatedAt 2026-07-25T18:15Z) before
// Three-Way Skirmish (updatedAt 2026-07-20T09:00Z).
const FIRST_BATTLE = 'Grand Colony War';
const SECOND_BATTLE = 'Three-Way Skirmish';

test.describe('delete battle with confirmation (Story 1.13)', () => {
  test('deletes the battle from storage, not just from React state (AC2)', async ({ page }) => {
    const [, deletedBattle] = createMockWorkspace().battles; // index 1 = Grand Colony War
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).click();
    await page.getByRole('button', { name: 'Delete Battle' }).click();

    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: FIRST_BATTLE })).not.toBeVisible();

    // Reading localStorage directly rather than page.reload(): seedWorkspace()'s addInitScript
    // re-runs on EVERY navigation Playwright makes on this page (that is what addInitScript is
    // documented to do), including a reload — so a reload-based check would silently re-seed the
    // original two-battle payload regardless of whether the delete persisted, defeating the very
    // thing this test exists to prove. Reading the stored collection directly is what actually
    // distinguishes "removed from storage" from "spliced out of React state" here.
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>,
      STORAGE_KEYS.battles,
    );
    expect(Object.keys(stored)).toHaveLength(1);
    expect(stored).not.toHaveProperty(deletedBattle.id);
  });

  // The reveal BattleTile.test.tsx cannot assert: jsdom computes no :hover/:focus-within opacity,
  // so this is the only place the control's visibility is actually proven. Task 2's departure from
  // the mockup (opacity rather than display: none, so the button keeps its place in the tab order)
  // is only defensible if the keyboard path really does reveal it.
  test('reveals the delete button on hover and on keyboard focus, and hides it otherwise', async ({
    page,
    hasTouch,
  }) => {
    test.skip(
      hasTouch,
      'hover-gated reveal does not apply to a touch pointer — @media (hover: none) pins it visible, covered by the test below',
    );

    await seedWorkspace(page);
    await page.goto('/');

    const tile = page.getByRole('article').filter({ hasText: FIRST_BATTLE });
    const actions = tile.locator('[data-tile-actions]');

    await expect(actions).toHaveCSS('opacity', '0');

    await tile.hover();
    await expect(actions).toHaveCSS('opacity', '1');

    // Move the pointer away, then reach the same tile by keyboard: focus-within must reveal it on
    // its own, with no pointer involved.
    await page.mouse.move(0, 0);
    await expect(actions).toHaveCSS('opacity', '0');

    await tile.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).focus();
    await expect(actions).toHaveCSS('opacity', '1');
  });

  // The other half of the same rule. A pointer that cannot hover never fires the reveal, and
  // opacity: 0 does not stop hit-testing — so before the 2026-08-14 review every tile on a touch
  // device carried an invisible but fully tappable destructive control. @media (hover: none) pins
  // it visible instead; this is the test that would go red if that branch were dropped.
  test('keeps the delete button permanently visible on a touch pointer', async ({
    page,
    hasTouch,
  }) => {
    test.skip(!hasTouch, 'the touch branch only applies to a no-hover pointer');

    await seedWorkspace(page);
    await page.goto('/');

    const tile = page.getByRole('article').filter({ hasText: FIRST_BATTLE });
    await expect(tile.locator('[data-tile-actions]')).toHaveCSS('opacity', '1');
  });

  test('Escape cancels — nothing changes in storage (AC2 cancel)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(2);

    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>,
      STORAGE_KEYS.battles,
    );
    expect(Object.keys(stored)).toHaveLength(2);
  });

  test('never deletes organisms — the roster survives in storage by id (AC3)', async ({ page }) => {
    const { organisms } = createMockWorkspace();
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).click();
    await page.getByRole('button', { name: 'Delete Battle' }).click();
    await expect(page.getByRole('article')).toHaveCount(1);

    const storedOrganisms = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>,
      STORAGE_KEYS.organisms,
    );
    for (const organism of organisms) {
      expect(storedOrganisms).toHaveProperty(organism.id);
    }
  });

  test('deleting both battles reveals the empty state live, without a reload (AC4)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(2);

    await page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).click();
    await page.getByRole('button', { name: 'Delete Battle' }).click();
    await expect(page.getByRole('article')).toHaveCount(1);

    await page.getByRole('button', { name: `Delete ${SECOND_BATTLE}` }).click();
    await page.getByRole('button', { name: 'Delete Battle' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('traps focus inside the dialog, starting on Cancel (AC5)', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).click();

    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    const confirmButton = page.getByRole('button', { name: 'Delete Battle' });
    await expect(cancelButton).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(confirmButton).toBeFocused();

    // One more Tab must stay inside the dialog (wrap back to Cancel), not escape to the page.
    await page.keyboard.press('Tab');
    await expect(cancelButton).toBeFocused();
  });

  test('the background is genuinely non-interactive while the dialog is open', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // getByRole cannot even resolve this locator once useInertBackground applies (an `inert`
    // subtree is excluded from the accessibility tree by definition) — proof in itself that the
    // background is non-interactive, but it means the REST of this test needs a raw CSS locator
    // to reach the DOM node at all.
    const otherDeleteButton = page.locator(`button[aria-label="Delete ${SECOND_BATTLE}"]`);
    await expect(otherDeleteButton).toHaveCount(1);
    await expect(otherDeleteButton).not.toBeFocused();

    // Confirms the mechanism, not just the symptom: the button sits under an `inert` ancestor.
    const isInert = await otherDeleteButton.evaluate((el) => el.closest('[inert]') !== null);
    expect(isInert).toBe(true);

    // Per spec, inert content "must not be focused" — a programmatic focus() call on it is a
    // no-op, unlike Tab (which the accessibility-tree exclusion above already rules out).
    await otherDeleteButton.evaluate((el) => (el as HTMLElement).focus());
    await expect(otherDeleteButton).not.toBeFocused();

    // Task 6's assertion, written for real: Tab all the way round the dialog's focus cycle and
    // confirm focus never lands on a background control. The `not.toBeFocused()` above is close to
    // vacuous on its own — nothing had focused the button — so the escape path needs Tab itself.
    // Four presses is comfortably more than the dialog's two tabbables, so a leak would show.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      const focusedInDialog = await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') !== null,
      );
      expect(focusedInDialog).toBe(true);
    }
  });

  test('cancelling returns focus to the delete button that opened the dialog, not <body>', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/');

    const trigger = page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` });
    await expect(page.getByRole('article')).toHaveCount(2);
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // `disableRestoreFocus` turns MUI's own restore off for every close path, not just the
    // post-delete one, so without an explicit move this lands on <body> — the "tab order restarts
    // at the top of the document" failure forced decision 4 exists to prevent (code review
    // 2026-08-14). Unlike the delete path, the trigger is still mounted here, so it is the target.
    await expect(trigger).toBeFocused();
  });

  test('Escape also returns focus to the delete button that opened the dialog', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/');

    const trigger = page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` });
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('a successful delete moves focus to the Gallery heading, not <body>', async ({ page }) => {
    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).click();
    await page.getByRole('button', { name: 'Delete Battle' }).click();

    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeFocused();
  });

  test('has no axe accessibility violations with the delete dialog open (AC5)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await seedWorkspace(page);
    await page.goto('/');

    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByRole('button', { name: `Delete ${FIRST_BATTLE}` }).click();
    // THREE waits, not one. `toBeVisible()` alone is not enough — MUI's Dialog opens through a
    // Fade transition (opacity 0 -> 1, ~225ms), and Playwright's visibility check passes the
    // instant the element has a bounding box, well before that settles. Waiting for the DIALOG's
    // own opacity to reach 1 is *still* not enough on its own: `Button`'s root styles apply their
    // OWN independent `background-color`/`color`/`box-shadow` transition on mount
    // (`node_modules/@mui/material/Button/Button.js`, `duration.short` = 250ms) — unsynchronised
    // with the Dialog's Fade wrapper, since it engages whenever the button's computed style is
    // first applied, not when the dialog's opacity changes. Scanning between those two settle
    // points makes axe compute colour-contrast against the CONFIRM button's blended, transitional
    // colours — confirmed empirically: reproduced 4/4 with no extra wait, gone 4/4 with even a
    // 100ms one. This is also the only place colour-contrast is genuinely evaluated at all — jsdom
    // has no layout, so the unit-test axe run in DeleteBattleDialog.test.tsx cannot check it.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);

    expect(errors).toEqual([]);
  });
});
