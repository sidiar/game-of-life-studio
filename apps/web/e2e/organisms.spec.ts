import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC } from '@gol/test-utils';

// Thin e2e (RFC-008 Decision 2), same fixtures/patterns as home.spec.ts / appShell.spec.ts.
test.describe('organisms route (Story 4.1)', () => {
  test('renders the Organism Library against the served static export, with zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/organisms');

    await expect(page.getByRole('heading', { level: 1, name: 'Organism Library' })).toBeVisible();
    // The hydration signal: the prerendered HTML says "Loading organisms…", so this card is
    // only reachable once useWorkspaceSeed's and OrganismLibrary's own load effect have both run
    // — every assertion on errors/axe below must come AFTER it, or it races hydration exactly as
    // appShell.spec.ts explains.
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('nav reflects the current route on both pages', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'Organisms' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Battles' })).not.toHaveAttribute('aria-current');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Battles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Organisms' })).not.toHaveAttribute('aria-current');
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
    const organismsLink = nav.getByRole('link', { name: 'Organisms' });

    // ⚠️ WebKit (and therefore the `tablet` project, which runs on it) leaves plain `<a>` links
    // out of the plain-Tab order — Safari's default with "Press Tab to highlight each item" off.
    // Measured against the served export: ten plain Tabs leave document.activeElement on <body>,
    // while Option+Tab (`Alt+Tab` here) walks Battles → Organisms → … in DOM order. That modifier
    // is what a real Safari user presses to reach links, and WebCore refuses only Ctrl/Meta-
    // modified Tabs, so it moves focus on every WebKit port (Linux CI included). Using it keeps a
    // genuine Tab-reachability proof on all four projects rather than substituting a scripted
    // focus() on two of them. Chromium and Firefox reach the link with plain Tab.
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    // Bounded loop (<= 10 presses): the wordmark is not focusable, so Organisms is the 2nd Tab
    // stop today, but this does not hardcode that — only that it is reachable at all.
    let reached = false;
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press(tabKey);
      const isFocused = await organismsLink.evaluate((el) => el === document.activeElement);
      if (isFocused) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);

    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/organisms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Organism Library' })).toBeVisible();
    // This is a CLIENT-SIDE navigation (next/link under the persistent (gallery) layout), so
    // AppNav does not remount — the only way aria-current moves is usePathname() re-rendering it.
    // The two page.goto loads in the nav-state test above prove the prerendered attribute; this
    // is the one place the live subscription is proven.
    await expect(organismsLink).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Battles' })).not.toHaveAttribute('aria-current');
    // Hydration signal before the error check, same discipline as the first test.
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('is prerendered — the raw served HTML already contains the heading and theme attribute', async ({
    request,
  }) => {
    const response = await request.get('/organisms');
    expect(response.status()).toBe(200);

    const html = await response.text();
    // The rendered ELEMENT, not the bare string: the RSC flight payload (`self.__next_f.push`)
    // carries "Organism Library" even for a page the client renders onto an empty shell, so a
    // substring match would pass without any prerender at all.
    expect(html).toMatch(/<h1[^>]*>Organism Library<\/h1>/);
    // The SSR body is the pre-hydration "Loading organisms…" state — the fact every hydration
    // signal in this file relies on. If the list were ever prerendered instead, those waits
    // would silently stop proving hydration.
    expect(html).toContain('Loading organisms…');
    expect(html).toContain('data-theme="clinical-lab"');
  });

  test('has no axe accessibility violations', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

test.describe('organism card grid (Story 4.2)', () => {
  test('renders the SYSTEM card with its stats and the count badge, against the production seed', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/organisms');
    // Hydration signal, same discipline as the describe block above.
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const card = page.getByRole('article', { name: "Conway's Classic" });
    await expect(card).toBeVisible();
    await expect(card.getByText('SYSTEM')).toBeVisible();
    // Exact text matches, not `toContainText` substrings: 'No' is also inside 'No rules', and '50'
    // inside '150' — a loose match would pass on the wrong cell. Values come from the fixture.
    await expect(card.getByText('Dominance', { exact: true })).toBeVisible();
    await expect(card.getByText(String(CONWAYS_CLASSIC.dominance), { exact: true })).toBeVisible();
    await expect(card.getByText('Aging', { exact: true })).toBeVisible();
    await expect(
      card.getByText(CONWAYS_CLASSIC.agingEnabled ? 'Yes' : 'No', { exact: true }),
    ).toBeVisible();
    // Production build → no AR-45 dev fixtures (epics.md:426), so Conway's Classic is the ONLY
    // organism and its own rules are the count. Pluralised the way `ruleCountLabel` does, so the
    // assertion survives a fixture with one rule.
    const ruleCount = CONWAYS_CLASSIC.survivalRules.length;
    const ruleLabel =
      ruleCount === 0 ? 'No rules' : ruleCount === 1 ? '1 rule' : `${ruleCount} rules`;
    await expect(card.getByText(ruleLabel, { exact: true })).toBeVisible();

    await expect(page.getByRole('status')).toHaveText('1 Organism');

    expect(errors).toEqual([]);
  });

  test('search filters the grid live and never writes to localStorage', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const before = await page.evaluate(() => localStorage.getItem('gol:organisms'));
    // The byte-identity check below is vacuous if the key is wrong (null === null) — prove the
    // seed actually wrote it first.
    expect(before).not.toBeNull();

    const search = page.getByRole('textbox', { name: 'Search organisms' });
    await search.fill('zzz');

    await expect(page.getByText('No organisms match “zzz”.')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('0 of 1 Organism');
    await expect(search).toBeFocused();

    await search.fill('con');
    await expect(page.getByRole('article', { name: "Conway's Classic" })).toBeVisible();

    await search.fill('');
    await expect(page.getByRole('status')).toHaveText('1 Organism');

    const after = await page.evaluate(() => localStorage.getItem('gol:organisms'));
    expect(after).toBe(before);

    expect(errors).toEqual([]);
  });

  // Unchanged by Story 4.3: the create button sits BEFORE the search input in DOM order (mockup
  // `:405-406`), so the path from the input to the card has no new stop in it. The button's own
  // reachability is pinned in the Story 4.3 block below.
  test('is keyboard-reachable from the search input to the card', async ({ page, browserName }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const search = page.getByRole('textbox', { name: 'Search organisms' });
    await search.click();

    // WebKit needs Alt+Tab to reach a tabIndex stop the same way it needs it for a plain link
    // (`:48-89` above) — Safari's default with "Press Tab to highlight each item" off leaves a
    // plain Tab from a focused text input on the input itself.
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const card = page.getByRole('article', { name: "Conway's Classic" });

    let reached = false;
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press(tabKey);
      const isFocused = await card.evaluate((el) => el === document.activeElement);
      if (isFocused) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
  });

  test('has no axe accessibility violations after hydration or in the zero-match state', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const ready = await new AxeBuilder({ page }).analyze();
    expect(ready.violations).toEqual([]);

    const search = page.getByRole('textbox', { name: 'Search organisms' });
    await search.fill('zzz');
    await expect(page.getByText('No organisms match “zzz”.')).toBeVisible();

    const zeroMatch = await new AxeBuilder({ page }).analyze();
    expect(zeroMatch.violations).toEqual([]);
  });
});

test.describe('editor modal shell (Story 4.3)', () => {
  const CREATE = '+ Create New Organism';

  /** The dialog, settled: visible AND its Fade at opacity 1. `toBeVisible()` alone passes the
   * instant the element has a bounding box, well before the ~225ms Fade ends
   * (`deleteBattle.spec.ts`'s axe test records the measurement).
   *
   * ⚠️ The opacity is read off `.MuiDialog-container`, not the `role="dialog"` paper. MUI's `Fade`
   * wraps the CONTAINER (Dialog.js renders Transition → Container → Paper) and `getComputedStyle`
   * reports an element's OWN `opacity`, never an ancestor's — the paper's is `1` from its first
   * frame, so a wait on the paper returns at once and "settled" would be a name, not a fact. */
  async function openEditor(page: Page) {
    await page.getByRole('button', { name: CREATE }).click();
    const dialog = page.getByRole('dialog', { name: 'Organism Editor' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
    return dialog;
  }

  test('opens as a labelled full-screen dialog with the header controls, and zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    // The lazy boundary's only real-browser proof: the editor's chunk is requested on the first
    // open and not before. A static import somewhere would load it with the page and this set
    // would not grow on click — the bundle gate would then show it only as a number (AC7).
    const scriptRequests = new Set<string>();
    page.on('request', (req) => {
      if (req.resourceType() === 'script') scriptRequests.add(req.url());
    });

    await page.goto('/organisms');
    // Hydration signal, same discipline as the blocks above.
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    // Let Next's idle-time `<Link>` prefetches land BEFORE the snapshot, so a script that arrives
    // after the click is the click's and not a late prefetch masquerading as the editor chunk.
    // The bundle gate (AC7) stays the authoritative proof; this is its in-browser echo.
    await page.waitForLoadState('networkidle');
    const scriptsBeforeOpen = new Set(scriptRequests);

    const dialog = await openEditor(page);
    const scriptsOnOpen = [...scriptRequests].filter((url) => !scriptsBeforeOpen.has(url));
    expect(scriptsOnOpen).not.toEqual([]);
    await expect(dialog.getByRole('heading', { level: 2, name: 'Organism Editor' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back to Library' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

    // fullScreen: the paper spans the viewport, with the theme's dialog border and radius
    // overridden at the call site (AC5).
    const viewport = page.viewportSize();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(Math.round(box?.width ?? 0)).toBe(viewport?.width);
    expect(Math.round(box?.height ?? 0)).toBe(viewport?.height);
    await expect(dialog).toHaveCSS('border-top-width', '0px');
    await expect(dialog).toHaveCSS('border-top-left-radius', '0px');

    expect(errors).toEqual([]);
  });

  test('the create button is Tab-reachable and precedes the search input', async ({
    page,
    browserName,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    // WebKit needs Alt+Tab for the same reason the Story 4.1 block records.
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const createButton = page.getByRole('button', { name: CREATE });

    let reached = false;
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press(tabKey);
      if (await createButton.evaluate((el) => el === document.activeElement)) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);

    await page.keyboard.press(tabKey);
    await expect(page.getByRole('textbox', { name: 'Search organisms' })).toBeFocused();
  });

  test('traps focus inside the dialog and makes the background genuinely inert', async ({
    page,
    browserName,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    await openEditor(page);

    // `!!`, not `!== null`: with optional chaining a null `activeElement` yields `undefined`, and
    // `undefined !== null` is true — a dropped focus would read as "inside the dialog".
    const focusIsInsideDialog = () =>
      page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

    // MUI's trap has already moved focus inside — no `autoFocus` in the shell, so the container
    // itself is the landing spot until Story 4.5's name field claims it.
    expect(await focusIsInsideDialog()).toBe(true);

    // Four presses is more than the header's two enabled tabbables (Back, Close — Save is
    // disabled), so a leak to the page behind would show. WebKit needs Alt+Tab (the Story 4.1
    // block's note) — with a plain Tab there, focus never leaves the container and four "still
    // inside" assertions would pass without the trap ever being exercised, so each button also
    // has to be SEEN focused for the loop to count.
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const back = page.getByRole('button', { name: 'Back to Library' });
    const close = page.getByRole('button', { name: 'Close' });
    let backFocused = false;
    let closeFocused = false;
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press(tabKey);
      expect(await focusIsInsideDialog()).toBe(true);
      backFocused ||= await back.evaluate((el) => el === document.activeElement);
      closeFocused ||= await close.evaluate((el) => el === document.activeElement);
    }
    expect(backFocused).toBe(true);
    expect(closeFocused).toBe(true);

    // getByRole cannot resolve the search input once `inert` applies (an inert subtree is
    // excluded from the accessibility tree), so a raw CSS locator reaches the DOM node.
    const search = page.locator('input[aria-label="Search organisms"]');
    await expect(search).toHaveCount(1);
    const isInert = await search.evaluate((el) => el.closest('[inert]') !== null);
    expect(isInert).toBe(true);

    // Per spec, inert content "must not be focused" — a programmatic focus() is a no-op.
    await search.evaluate((el) => (el as HTMLElement).focus());
    await expect(search).not.toBeFocused();
  });

  const CLOSE_CHANNELS: ReadonlyArray<[string, (page: Page) => Promise<void>]> = [
    ['Close', (page) => page.getByRole('button', { name: 'Close' }).click()],
    ['Back to Library', (page) => page.getByRole('button', { name: 'Back to Library' }).click()],
    ['Escape', (page) => page.keyboard.press('Escape')],
  ];

  for (const [channel, close] of CLOSE_CHANNELS) {
    test(`${channel} closes the editor and returns focus to the create button, not <body>`, async ({
      page,
    }) => {
      await page.goto('/organisms');
      await expect(page.getByText("Conway's Classic")).toBeVisible();

      const createButton = page.getByRole('button', { name: CREATE });
      await openEditor(page);

      await close(page);

      await expect(page.getByRole('dialog')).not.toBeVisible();
      // `disableRestoreFocus` turns MUI's own restore off for every close path; without the
      // hook's explicit move this lands on <body>. Only a real browser can make this assertion —
      // `useDeleteBattleDialog`'s `setTimeout(0)` passed Chromium/Firefox and failed WebKit.
      await expect(createButton).toBeFocused();
      // And the background is interactive again: the input resolves by role once more.
      await expect(page.getByRole('textbox', { name: 'Search organisms' })).toBeVisible();
    });
  }

  test('has no axe accessibility violations with the editor open and settled', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    await openEditor(page);
    // Button's own colour transition (250ms) is unsynchronised with the Dialog's Fade — the
    // `deleteBattle.spec.ts` measurement. This is the only place the header's contrast pairs and
    // the fullScreen paper are genuinely evaluated (jsdom has no layout).
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the create button is prerendered and the dialog is not', async ({ request }) => {
    const response = await request.get('/organisms');
    expect(response.status()).toBe(200);

    const html = await response.text();
    // The rendered ELEMENT, not the bare string, for the same reason the Story 4.1 block gives.
    expect(html).toMatch(/<button[^>]*data-create-organism[^>]*>\+ Create New Organism<\/button>/);
    // `ssr: false` + a closed dialog: nothing of the modal reaches the static HTML.
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('Organism Editor');
  });
});
