import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC } from '@gol/test-utils';

const CREATE = '+ Create New Organism';

/** The dialog, settled: visible AND its Fade at opacity 1. `toBeVisible()` alone passes the
 * instant the element has a bounding box, well before the ~225ms Fade ends
 * (`deleteBattle.spec.ts`'s axe test records the measurement).
 *
 * ⚠️ The opacity is read off `.MuiDialog-container`, not the `role="dialog"` paper. MUI's `Fade`
 * wraps the CONTAINER (Dialog.js renders Transition → Container → Paper) and `getComputedStyle`
 * reports an element's OWN `opacity`, never an ancestor's — the paper's is `1` from its first
 * frame, so a wait on the paper returns at once and "settled" would be a name, not a fact.
 *
 * Module scope (Story 4.4) so the layout block reuses it rather than forking it. */
async function openEditor(page: Page) {
  await page.getByRole('button', { name: CREATE }).click();
  const dialog = page.getByRole('dialog', { name: 'Organism Editor' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
  return dialog;
}

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

test.describe('three-column layout (Story 4.4)', () => {
  type Box = { x: number; y: number; width: number; height: number };

  /** `boundingBox()` is `null` for a detached or hidden node — throw (the `battleRoute.spec.ts`
   * idiom) rather than optional-chain into a 0×0 box that passes every upper bound. */
  async function boxOf(locator: Locator, label: string): Promise<Box> {
    const box = await locator.boundingBox();
    if (box === null) throw new Error(`${label} has no layout box`);
    return box;
  }

  /** `/organisms` hydrated (the Story 4.1 hydration signal), the editor open and settled, and the
   * three regions located by their accessible names — the names the layout's unit test pins. */
  async function openLayout(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    return {
      dialog,
      basic: dialog.getByRole('region', { name: 'Basic Information' }),
      rules: dialog.getByRole('region', { name: 'Survival Rules' }),
      preview: dialog.getByRole('region', { name: 'Preview & Test' }),
    };
  }

  /** The layout's `Root` (the row): every column's grandparent, `MainGroup` its parent. */
  const layoutRoot = (basic: Locator) => basic.locator('xpath=../..');

  /** An element's OWN overflow: `scrollWidth/Height` report content that spills past it even where
   * `overflow: hidden` clips it. Read on the dialog paper and the layout root — never on
   * `document.documentElement` (review, 2026-09-14): MUI's Dialog is `position: fixed`, a fixed box
   * never contributes to the document's scrollable overflow, and `body` scroll is locked while it is
   * open, so the document's figures describe the Library page hidden BEHIND the modal, not the
   * columns — that read passes whatever the columns do. */
  const overflowOf = (el: Locator) =>
    el.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }));

  async function expectNoOverflow(dialog: Locator, basic: Locator) {
    for (const el of [dialog, layoutRoot(basic)]) {
      const o = await overflowOf(el);
      expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth);
      expect(o.scrollHeight).toBeLessThanOrEqual(o.clientHeight);
    }
  }

  const PROBE_ID = 'story-4-4-scroll-probe';
  /** A 4000px node appended to a region — a MEASUREMENT of its scroll container, never a rendered
   * placeholder (NFR-4.1). Returns the region's own scroll figures right after the append. */
  const probeIn = (region: Locator) =>
    region.evaluate((el, id) => {
      const probe = document.createElement('div');
      probe.id = id;
      probe.style.height = '4000px';
      el.appendChild(probe);
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    }, PROBE_ID);
  const removeProbe = (page: Page) =>
    page.evaluate((id) => document.getElementById(id)?.remove(), PROBE_ID);

  // ⚠️ No default Playwright project is ≥ 1400 wide (1280×720 desktop, 1194×834 tablet), so the
  // full tier exists only behind this one-off `setViewportSize` — the Story 2.12 precedent, never
  // a fifth project. `setViewportSize` precedes `goto` so the first layout is already at 1440.
  test('full tier (≥ 1400): 320 / flexible ≤ 800 / 400, one row, zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const viewport = { width: 1440, height: 900 };
    await page.setViewportSize(viewport);
    const { basic, rules, preview } = await openLayout(page);

    await expect(basic).toBeVisible();
    await expect(rules).toBeVisible();
    await expect(preview).toBeVisible();

    const basicBox = await boxOf(basic, 'Basic Information');
    const rulesBox = await boxOf(rules, 'Survival Rules');
    const previewBox = await boxOf(preview, 'Preview & Test');

    expect(basicBox.width).toBeCloseTo(320, 0);
    expect(previewBox.width).toBeCloseTo(400, 0);
    expect(previewBox.x + previewBox.width).toBeCloseTo(viewport.width, 0);
    // The flexible column sits between the fixed two and never exceeds the mockup's cap (FD1);
    // at 1440 it measures 1440 − 320 − 400 = 720, so it also has real width, not a collapse.
    expect(rulesBox.x).toBeGreaterThanOrEqual(basicBox.x + basicBox.width);
    expect(rulesBox.x + rulesBox.width).toBeLessThanOrEqual(previewBox.x);
    expect(rulesBox.width).toBeLessThanOrEqual(800);
    expect(rulesBox.width).toBeGreaterThan(600);
    // One row: same top, same height (`align-items: stretch`).
    expect(rulesBox.y).toBeCloseTo(basicBox.y, 0);
    expect(previewBox.y).toBeCloseTo(basicBox.y, 0);
    expect(rulesBox.height).toBeCloseTo(basicBox.height, 0);
    expect(previewBox.height).toBeCloseTo(basicBox.height, 0);
    expect(basicBox.height).toBeGreaterThan(100);

    expect(errors).toEqual([]);
  });

  // "Stay put" in its observable form (FD2): scrolling the Rules column moves nothing else, the
  // dialog stays exactly the viewport and nothing spills past the dialog or the layout root. There
  // is no rule content to overflow with until Story 4.10, so the tall probe node is appended to the
  // region and removed at the end. No axe in this test: the probe is not part of the page.
  test('the Rules column scrolls independently; Basic Information and Preview stay put', async ({
    page,
  }) => {
    const viewport = { width: 1440, height: 900 };
    await page.setViewportSize(viewport);
    const { dialog, basic, rules, preview } = await openLayout(page);

    const basicBefore = await boxOf(basic, 'Basic Information');
    const rulesBefore = await boxOf(rules, 'Survival Rules');
    const previewBefore = await boxOf(preview, 'Preview & Test');

    const rulesSize = await probeIn(rules);
    expect(rulesSize.clientHeight).toBeGreaterThan(0);
    expect(rulesSize.scrollHeight).toBeGreaterThan(rulesSize.clientHeight);

    const scrollTop = await rules.evaluate((el) => {
      el.scrollTop = 500;
      return el.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);

    expect(await boxOf(basic, 'Basic Information')).toEqual(basicBefore);
    expect(await boxOf(preview, 'Preview & Test')).toEqual(previewBefore);
    const dialogBox = await boxOf(dialog, 'dialog');
    expect(Math.round(dialogBox.height)).toBe(viewport.height);
    await expectNoOverflow(dialog, basic);
    await removeProbe(page);

    // FD2's other half: EVERY column is its own scroll container, so Basic Information and Preview
    // each overflow in place too rather than growing the row.
    const basicSize = await probeIn(basic);
    expect(basicSize.scrollHeight).toBeGreaterThan(basicSize.clientHeight);
    expect(await boxOf(basic, 'Basic Information')).toEqual(basicBefore);
    expect(await boxOf(rules, 'Survival Rules')).toEqual(rulesBefore);
    await removeProbe(page);

    const previewSize = await probeIn(preview);
    expect(previewSize.scrollHeight).toBeGreaterThan(previewSize.clientHeight);
    expect(await boxOf(preview, 'Preview & Test')).toEqual(previewBefore);
    expect(await boxOf(rules, 'Survival Rules')).toEqual(rulesBefore);
    await removeProbe(page);
  });

  // FD1's cap and centring engage only above 1520px (320 + 800 + 400): at 1440 the flexible column
  // is 720 by arithmetic and `≤ 800` is true of any width, so the cap needs its own viewport.
  test('wide (1600): the Rules column caps at 800px and centres between the fixed two', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const { basic, rules, preview } = await openLayout(page);

    const basicBox = await boxOf(basic, 'Basic Information');
    const rulesBox = await boxOf(rules, 'Survival Rules');
    const previewBox = await boxOf(preview, 'Preview & Test');

    expect(rulesBox.width).toBeCloseTo(800, 0);
    // 1600 − 320 − 400 − 800 = 80px of free space, split by `margin: 0 auto` into two 40px gutters.
    const leftGutter = rulesBox.x - (basicBox.x + basicBox.width);
    const rightGutter = previewBox.x - (rulesBox.x + rulesBox.width);
    expect(leftGutter).toBeCloseTo(40, 0);
    expect(rightGutter).toBeCloseTo(40, 0);
  });

  // The `-0.02` media-query edges: 1400 and 1024 are the FIRST width of the wider tier, 1399 and
  // 1023 the last of the narrower — the AC's ranges read as `≥ 1400`, `1024–1400`, `< 1024`. The
  // widths are resized in place; `toHaveCSS` retries until the re-layout lands.
  test('tier boundaries: 1400 is full, 1399 and 1024 are compressed, 1023 is the fold', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { basic, rules, preview } = await openLayout(page);
    const mainGroup = basic.locator('..');

    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(basic).toHaveCSS('width', '320px');
    await expect(preview).toHaveCSS('width', '400px');
    await expect(mainGroup).toHaveCSS('flex-direction', 'row');

    await page.setViewportSize({ width: 1399, height: 900 });
    await expect(basic).toHaveCSS('width', '280px');
    await expect(preview).toHaveCSS('width', '350px');
    await expect(mainGroup).toHaveCSS('flex-direction', 'row');

    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(basic).toHaveCSS('width', '280px');
    await expect(preview).toHaveCSS('width', '350px');
    await expect(mainGroup).toHaveCSS('flex-direction', 'row');

    await page.setViewportSize({ width: 1023, height: 800 });
    await expect(mainGroup).toHaveCSS('flex-direction', 'column');
    await expect(preview).toHaveCSS('width', '350px');
    const basicBox = await boxOf(basic, 'Basic Information');
    const rulesBox = await boxOf(rules, 'Survival Rules');
    expect(rulesBox.y).toBeGreaterThanOrEqual(basicBox.y + basicBox.height);
  });

  // The projects' own viewports (1280×720 desktop, 1194×834 tablet) are all inside the 1024–1400
  // band, so this is the tier EVERY other e2e in this file already runs in — no `setViewportSize`.
  test('compressed tier (1024–1400): 280 / flexible / 350, one row, no horizontal overflow', async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('project has no viewport');
    expect(viewport.width).toBeGreaterThanOrEqual(1024);
    expect(viewport.width).toBeLessThan(1400);

    const { dialog, basic, rules, preview } = await openLayout(page);
    const basicBox = await boxOf(basic, 'Basic Information');
    const rulesBox = await boxOf(rules, 'Survival Rules');
    const previewBox = await boxOf(preview, 'Preview & Test');

    expect(basicBox.width).toBeCloseTo(280, 0);
    expect(previewBox.width).toBeCloseTo(350, 0);
    expect(previewBox.x + previewBox.width).toBeCloseTo(viewport.width, 0);
    expect(rulesBox.x).toBeGreaterThanOrEqual(basicBox.x + basicBox.width);
    expect(rulesBox.x + rulesBox.width).toBeLessThanOrEqual(previewBox.x);
    expect(rulesBox.width).toBeGreaterThan(300);
    expect(rulesBox.y).toBeCloseTo(basicBox.y, 0);
    expect(previewBox.y).toBeCloseTo(basicBox.y, 0);
    expect(rulesBox.height).toBeCloseTo(basicBox.height, 0);

    await expectNoOverflow(dialog, basic);
  });

  // < 1024 is below NFR-3.1's supported floor: a graceful degradation, smoke-tested only (AC4) —
  // Basic Information stacked over Rules on the left (FD3), Preview at 350 on the right, every
  // region still in the tree, and no horizontal document overflow. No axe here.
  test('fold tier (< 1024): Basic Information stacks over Rules, Preview stays at 350', async ({
    page,
  }) => {
    const viewport = { width: 1000, height: 800 };
    await page.setViewportSize(viewport);
    const { dialog, basic, rules, preview } = await openLayout(page);

    await expect(basic).toBeVisible();
    await expect(rules).toBeVisible();
    await expect(preview).toBeVisible();

    const basicBox = await boxOf(basic, 'Basic Information');
    const rulesBox = await boxOf(rules, 'Survival Rules');
    const previewBox = await boxOf(preview, 'Preview & Test');

    expect(previewBox.width).toBeCloseTo(350, 0);
    expect(previewBox.x + previewBox.width).toBeCloseTo(viewport.width, 0);
    expect(rulesBox.x).toBeCloseTo(basicBox.x, 0);
    expect(rulesBox.width).toBeCloseTo(basicBox.width, 0);
    expect(rulesBox.y).toBeGreaterThanOrEqual(basicBox.y + basicBox.height);
    expect(basicBox.width).toBeGreaterThan(300);
    expect(basicBox.height).toBeGreaterThan(40);

    await expectNoOverflow(dialog, basic);
  });

  // FD3 proven, not asserted in a comment (review, 2026-09-14): the stacked pair shares ONE scroll
  // region — `MainGroup` — and a column that overflows GROWS to its content instead of collapsing.
  // Before the review fix Basic Information carried `flexShrink: 1` + `minHeight: 0` inside a flex
  // COLUMN, so the probe shrank it toward 0px and painted over Rules; this test fails on that.
  test('fold tier (< 1024): the stacked pair scrolls as one region and never collapses', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    const { basic, rules, preview } = await openLayout(page);
    const mainGroup = basic.locator('..');

    const basicBefore = await boxOf(basic, 'Basic Information');
    const previewBefore = await boxOf(preview, 'Preview & Test');

    const basicSize = await probeIn(basic);
    // The column grew by the probe's height rather than scrolling inside itself...
    const basicAfter = await boxOf(basic, 'Basic Information');
    expect(basicAfter.height).toBeGreaterThan(basicBefore.height + 3900);
    expect(basicSize.scrollHeight).toBeLessThanOrEqual(basicSize.clientHeight + 1);
    // ...Rules is pushed below it, still stacked...
    const rulesBox = await boxOf(rules, 'Survival Rules');
    expect(rulesBox.y).toBeGreaterThanOrEqual(basicAfter.y + basicAfter.height - 1);
    // ...and the wrapper is what scrolls, while Preview stays put.
    const group = await overflowOf(mainGroup);
    expect(group.scrollHeight).toBeGreaterThan(group.clientHeight);
    const scrollTop = await mainGroup.evaluate((el) => {
      el.scrollTop = 500;
      return el.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);
    expect(await boxOf(preview, 'Preview & Test')).toEqual(previewBefore);
    await removeProbe(page);
  });

  // The Story 4.3 block's axe test already scans the columns at the projects' default (compressed)
  // viewport; the full tier is reachable only here.
  test('has no axe violations at the full tier with the editor open and settled', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await openLayout(page);
    // Button's colour transition (250ms) is unsynchronised with the Dialog's Fade — the same wait
    // the Story 4.3 axe test records.
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('heading order inside the dialog is one <h2> then three <h3>s', async ({ page }) => {
    const { dialog } = await openLayout(page);

    await expect(dialog.getByRole('heading', { level: 2 })).toHaveCount(1);
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveCount(3);
    // ORDER, not just counts: every heading in the dialog, in DOM order — the `<h2>` first.
    await expect(dialog.getByRole('heading')).toHaveText([
      'Organism Editor',
      'Basic Information',
      'Survival Rules',
      'Preview & Test',
    ]);
  });
});

test.describe('organism name field (Story 4.5)', () => {
  /** `/organisms` hydrated, the editor open and settled, and the field located THROUGH the
   * Basic Information region — so a field that rendered in another column would not be found. */
  async function openNameField(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const input = dialog
      .getByRole('region', { name: 'Basic Information' })
      .getByRole('textbox', { name: 'Organism Name' });
    return { dialog, input };
  }

  test('is labelled, required and counted inside Basic Information, with zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { dialog, input } = await openNameField(page);

    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('aria-required', 'true');
    await expect(dialog.getByText('0 / 50')).toBeVisible();

    await input.fill('Aggressive Colonizer');

    await expect(dialog.getByText('20 / 50')).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(errors).toEqual([]);
  });

  // FD1's real-browser pin. `fill()` sets the value and dispatches `input` — the bypass path a
  // native `maxlength` attribute does not cover and a clamp would truncate — so `toHaveValue` on
  // the EXACT 51-character string fails under either mechanism, which is the point.
  test('over-limit is an error, not a truncation; emptied is required; valid clears', async ({
    page,
  }) => {
    const { dialog, input } = await openNameField(page);
    const overLimit = 'x'.repeat(51);

    await input.fill(overLimit);

    await expect(input).toHaveValue(overLimit);
    await expect(dialog.getByRole('alert')).toHaveText(/Name cannot exceed 50 characters/);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByText('51 / 50')).toBeVisible();

    await input.fill('');

    await expect(dialog.getByRole('alert')).toHaveText(/Organism name is required/);
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    await input.fill('Glider');

    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });

  // The scan that measures `--gol-danger` for real: the error text and the over-limit counter on
  // the column's `--gol-bg-secondary` (4.90:1), and the invalid border on `--gol-bg-hover` (a
  // non-text boundary, 4.48:1 ≥ 3:1). jsdom skips `color-contrast`, so only this proves it. The
  // input has no transition (FD5), so nothing is mid-fade once `fill()` has resolved; the 300ms
  // wait is the header Button's own colour transition, the Story 4.3 measurement.
  test('has no axe violations with the over-limit error visible', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { dialog, input } = await openNameField(page);
    await input.fill('x'.repeat(51));
    await expect(dialog.getByRole('alert')).toBeVisible();
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  // Every `aria-describedby` id resolves to a node in the DOM, and the order is error-then-counter.
  // Ids come from `useId()` (`:r1:`-style, colons included), so an attribute selector — a CSS `#`
  // selector cannot take a colon unescaped.
  test('the counter, and the error while visible, are associated through aria-describedby', async ({
    page,
  }) => {
    const { input } = await openNameField(page);

    const clean = ((await input.getAttribute('aria-describedby')) ?? '').split(/\s+/);
    expect(clean).toHaveLength(1);
    await expect(page.locator(`[id="${clean[0]}"]`)).toHaveText('0 / 50');

    await input.fill('x'.repeat(51));

    const withError = ((await input.getAttribute('aria-describedby')) ?? '').split(/\s+/);
    expect(withError).toHaveLength(2);
    await expect(page.locator(`[id="${withError[0]}"]`)).toHaveText(
      /Name cannot exceed 50 characters/,
    );
    expect(await page.locator(`[id="${withError[0]}"]`).getAttribute('role')).toBe('alert');
    await expect(page.locator(`[id="${withError[1]}"]`)).toHaveText('51 / 50');
    expect(withError[1]).toBe(clean[0]);
  });
});
