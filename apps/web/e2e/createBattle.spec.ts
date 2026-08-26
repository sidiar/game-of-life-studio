import { test, expect, type Page } from '@playwright/test';
import { CURRENT_FORMAT_VERSION } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { createMockWorkspace } from '@gol/test-utils';

// Copied from e2e/battleRoute.spec.ts / e2e/deleteBattle.spec.ts rather than shared through a new
// module — the story's file list scopes this story to one new spec file. Keep the three in sync
// if any changes; e2e/ is exempt from the @gol/test-utils import boundary (eslint.config.mjs).
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
      // Stamp gol:schema so isFreshWorkspace() is false and the default seed does not append
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
}

// AC3 — the proof jsdom cannot give: this runs against the served PRODUCTION static export
// (playwright.config.ts), so the AR-45 dev fixtures are absent and any battles.save() call this
// story does not make would show up as a real localStorage write.
test.describe('create new battle (Story 2.2)', () => {
  test('the Gallery toolbar CTA opens /battle/new, and leaving without saving persists nothing (AC1, AC3, AC4)', async ({
    page,
  }) => {
    await seedWorkspace(page);
    await page.goto('/');
    await expect(page.getByRole('article')).toHaveCount(2);

    const battlesBefore = await page.evaluate(
      (key) => localStorage.getItem(key),
      STORAGE_KEYS.battles,
    );

    await page.getByRole('link', { name: '+ Create New Battle' }).click();

    await expect(page).toHaveURL('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');
    // AC3's negative half, proven from inside the create route itself: nothing this story does
    // ever calls battles.save(), so no record should exist even before the user leaves.
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.battles)).toBe(
      battlesBefore,
    );

    // AC3: leave without saving. The route ships no Back-to-Gallery link (forced decision 3, for
    // symmetry with the loaded battle route) — browser Back is the only way out until Story
    // 2.16's sidebar footer exists.
    await page.goBack();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('article')).toHaveCount(2);
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.battles)).toBe(
      battlesBefore,
    );
  });

  // AC2's end-to-end half: the EMPTY-STATE CTA, not the toolbar CTA, reached from a genuinely
  // empty workspace — no seedWorkspace() call, mirroring e2e/home.spec.ts: a fresh Playwright
  // context has no localStorage, and a production build seeds no mock fixtures.
  test('the empty-state CTA opens /battle/new from a genuinely empty workspace (AC2)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();

    await page.getByRole('link', { name: 'Create Your First Battle' }).click();

    await expect(page).toHaveURL('/battle/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled Battle');
    // AC3 on THIS path too, not just the seeded one above: the empty workspace is where a
    // "helpfully create the record on open" regression would be least visible, because there is
    // no existing battle count to notice it changing.
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.battles),
    ).toBeNull();
  });
});
