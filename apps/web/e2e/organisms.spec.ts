import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONWAYS_CLASSIC } from '@gol/test-utils';
import {
  CONWAYS_CLASSIC_ID,
  MAX_DOMINANCE,
  MAX_ORGANISM_NAME_LENGTH,
  MIN_DOMINANCE,
  NEW_ORGANISM_DOMINANCE,
} from '@gol/domain';

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
    // Story 4.13: Save is now the gate's enabled control.
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeEnabled();
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
  // Derived, never `50` (AC2): the domain pin test owns the number; a drift must fail there once,
  // not here a second time in six literal strings.
  const MAX = MAX_ORGANISM_NAME_LENGTH;
  const TOO_LONG = new RegExp(`Name cannot exceed ${MAX} characters`);

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

  /** The input's `aria-describedby` tokens, asserting the attribute EXISTS first — `''.split()` is
   * `['']`, length 1, which would let an absent attribute pass a length-1 check. */
  async function describedByIds(input: Locator): Promise<string[]> {
    const attr = await input.getAttribute('aria-describedby');
    if (attr === null) throw new Error('aria-describedby is absent');
    return attr.split(/\s+/);
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
    await expect(dialog.getByText(`0 / ${MAX}`)).toBeVisible();

    await input.fill('Aggressive Colonizer');

    await expect(dialog.getByText(`${'Aggressive Colonizer'.length} / ${MAX}`)).toBeVisible();
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
    const overLimit = 'x'.repeat(MAX + 1);

    await input.fill(overLimit);

    await expect(input).toHaveValue(overLimit);
    await expect(dialog.getByRole('alert')).toHaveText(TOO_LONG);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByText(`${MAX + 1} / ${MAX}`)).toBeVisible();

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
    await input.fill('x'.repeat(MAX + 1));
    await expect(dialog.getByRole('alert')).toBeVisible();
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  // The OTHER error state (AC7: "every state"), and the only one in which the placeholder is
  // visible: `--gol-text-secondary` at 0.8 opacity on `--gol-bg-hover`, beside the danger border.
  // The over-limit scan above has a value in the input, so it never measures that pairing.
  test('has no axe violations with the required error visible and the placeholder showing', async ({
    page,
  }) => {
    const { dialog, input } = await openNameField(page);
    await input.fill('x');
    await input.fill('');
    await expect(dialog.getByRole('alert')).toHaveText(/Organism name is required/);
    await expect(input).toHaveValue('');
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  // Every `aria-describedby` id resolves to a node in the DOM, and the order is error-then-counter.
  // Ids come from `useId()` (`:r1:`-style, colons included), so an attribute selector — a CSS `#`
  // selector cannot take a colon unescaped.
  test('the counter, and the error while visible, are associated through aria-describedby', async ({
    page,
  }) => {
    const { input } = await openNameField(page);

    const clean = await describedByIds(input);
    expect(clean).toHaveLength(1);
    await expect(page.locator(`[id="${clean[0]}"]`)).toHaveText(`0 / ${MAX}`);

    await input.fill('x'.repeat(MAX + 1));

    const withError = await describedByIds(input);
    expect(withError).toHaveLength(2);
    await expect(page.locator(`[id="${withError[0]}"]`)).toHaveText(TOO_LONG);
    expect(await page.locator(`[id="${withError[0]}"]`).getAttribute('role')).toBe('alert');
    await expect(page.locator(`[id="${withError[1]}"]`)).toHaveText(`${MAX + 1} / ${MAX}`);
    expect(withError[1]).toBe(clean[0]);
  });
});

test.describe('dominance control (Story 4.6)', () => {
  /** `/organisms` hydrated, the editor open and settled, and both controls located THROUGH the
   * Basic Information region — so a control that rendered in another column would not be found. */
  async function openDominanceControl(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const basicInfo = dialog.getByRole('region', { name: 'Basic Information' });
    const slider = basicInfo.getByRole('slider', { name: 'Dominance' });
    const textbox = basicInfo.getByRole('textbox', { name: 'Dominance value' });
    return { dialog, slider, textbox };
  }

  test('opens at the default on both controls, description visible, zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { dialog, slider, textbox } = await openDominanceControl(page);

    await expect(slider).toHaveValue(String(NEW_ORGANISM_DOMINANCE));
    await expect(textbox).toHaveValue(String(NEW_ORGANISM_DOMINANCE));
    await expect(slider).toHaveAttribute('min', String(MIN_DOMINANCE));
    await expect(slider).toHaveAttribute('max', String(MAX_DOMINANCE));
    await expect(
      dialog.getByText('Priority in conflict resolution (1-100, higher wins)'),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  // (3.13's e2e at `battleRoute.spec.ts:2316-2345`, verbatim shape.)
  test('keyboard operates the slider and the textbox follows (AC6)', async ({
    page,
    browserName,
  }) => {
    const { slider, textbox } = await openDominanceControl(page);

    await slider.focus();
    await expect(slider).toBeFocused();

    await page.keyboard.press('End');
    await expect(slider).toHaveValue(String(MAX_DOMINANCE));
    await expect(textbox).toHaveValue(String(MAX_DOMINANCE));

    await page.keyboard.press('Home');
    await expect(slider).toHaveValue(String(MIN_DOMINANCE));
    await expect(textbox).toHaveValue(String(MIN_DOMINANCE));

    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue(String(MIN_DOMINANCE + 1));
    await expect(textbox).toHaveValue(String(MIN_DOMINANCE + 1));

    await page.keyboard.press('ArrowUp');
    await expect(slider).toHaveValue(String(MIN_DOMINANCE + 2));
    await expect(textbox).toHaveValue(String(MIN_DOMINANCE + 2));

    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveValue(String(MIN_DOMINANCE + 1));

    await page.keyboard.press('ArrowDown');
    await expect(slider).toHaveValue(String(MIN_DOMINANCE));

    // WebKit needs Alt+Tab to move focus off a range input (the Story 4.1 idiom in this file).
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(textbox).toBeFocused();
  });

  test('typing syncs live, snaps on commit, and rejects non-integers', async ({ page }) => {
    const { slider, textbox } = await openDominanceControl(page);

    await textbox.fill('42');
    await expect(slider).toHaveValue('42');

    await textbox.fill('150');
    await expect(slider).toHaveValue('42');

    await page.keyboard.press('Tab');
    await expect(textbox).toHaveValue(String(MAX_DOMINANCE));
    await expect(slider).toHaveValue(String(MAX_DOMINANCE));

    await textbox.fill('0');
    await page.keyboard.press('Enter');
    await expect(textbox).toHaveValue(String(MIN_DOMINANCE));
    await expect(slider).toHaveValue(String(MIN_DOMINANCE));
    await expect(textbox).toBeFocused();

    // The revert cases start from a MID-RANGE committed value, so "invalid text reverts" is
    // distinguishable from "empty → 0 → clamped to the minimum" — from 1 the two look the same.
    await textbox.fill('42');
    await expect(slider).toHaveValue('42');

    await textbox.fill('5.5');
    await page.keyboard.press('Tab');
    await expect(textbox).toHaveValue('42');
    await expect(slider).toHaveValue('42');

    await textbox.fill('');
    await page.keyboard.press('Tab');
    await expect(textbox).toHaveValue('42');
    await expect(slider).toHaveValue('42');
  });

  // Playwright sets a range's value and dispatches input/change (the 3.13 idiom) — the drag
  // stand-in.
  test('a slider drag path updates the textbox', async ({ page }) => {
    const { slider, textbox } = await openDominanceControl(page);

    await slider.fill('77');

    await expect(textbox).toHaveValue('77');
  });

  // The scan that measures the description's --gol-text-tertiary on --gol-bg-secondary and the
  // 16px/600 value text on --gol-bg-hover for real. No transition on the control, so no extra
  // wait beyond openEditor's own settle.
  test('has no axe violations after a keyboard slider move', async ({ page }) => {
    const { slider } = await openDominanceControl(page);
    await slider.focus();
    await page.keyboard.press('End');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('both controls’ descriptions are associated through aria-describedby', async ({ page }) => {
    const { slider, textbox } = await openDominanceControl(page);

    const sliderDescribedBy = await slider.getAttribute('aria-describedby');
    const textboxDescribedBy = await textbox.getAttribute('aria-describedby');
    if (sliderDescribedBy === null || textboxDescribedBy === null) {
      throw new Error('aria-describedby is absent');
    }
    expect(sliderDescribedBy).toBe(textboxDescribedBy);
    await expect(page.locator(`[id="${sliderDescribedBy}"]`)).toHaveText(
      'Priority in conflict resolution (1-100, higher wins)',
    );
  });
});

test.describe('aging degradation toggle (Story 4.7)', () => {
  /** `/organisms` hydrated, the editor open and settled, and both the switch and the example
   * strip located THROUGH the Basic Information region — so a control that rendered in another
   * column would not be found. Mirrors `openDominanceControl` above. */
  async function openAgingToggle(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const basicInfo = dialog.getByRole('region', { name: 'Basic Information' });
    const toggle = basicInfo.getByRole('switch', { name: 'Aging Degradation' });
    const strip = basicInfo.locator('[data-aging-example]');
    return { dialog, basicInfo, toggle, strip };
  }

  test('opens Off, description visible, strip has eight equal cells, zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { dialog, basicInfo, toggle, strip } = await openAgingToggle(page);

    await expect(toggle).not.toBeChecked();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(basicInfo.getByText('Off', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Cells increase saturation as they age')).toBeVisible();
    // 8 = MAX_AGE_SHADE + 1 (`apps/web/lib/palette/displayColor.ts`), which this spec does not
    // import today (only `@gol/*`) — the literal is written the way `:1058-1070` writes the
    // description string.
    await expect(strip.locator('[data-age]')).toHaveCount(8);

    const colors = await strip
      .locator('[data-age]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    // Eight unpainted cells are also "one distinct value" (`rgba(0, 0, 0, 0)`), so flat must
    // also mean painted.
    expect(colors[0]).not.toBe('rgba(0, 0, 0, 0)');
    expect(new Set(colors).size).toBe(1);
    expect(errors).toEqual([]);
  });

  test('click toggles On and the strip becomes a ramp', async ({ page }) => {
    const { basicInfo, toggle, strip } = await openAgingToggle(page);

    const readColors = () =>
      strip
        .locator('[data-age]')
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));

    const offColors = await readColors();

    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(basicInfo.getByText('On', { exact: true })).toBeVisible();

    const onColors = await readColors();
    expect(new Set(onColors).size).toBe(8);
    expect(onColors[7]).toBe(offColors[7]);

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(basicInfo.getByText('Off', { exact: true })).toBeVisible();

    const backToOffColors = await readColors();
    expect(new Set(backToOffColors).size).toBe(1);
  });

  test('keyboard: Tab from the dominance textbox reaches the switch; Space/Enter toggle; ArrowRight does nothing', async ({
    page,
    browserName,
  }) => {
    const { dialog, toggle } = await openAgingToggle(page);
    const dominanceTextbox = dialog.getByRole('textbox', { name: 'Dominance value' });

    await dominanceTextbox.focus();
    // WebKit needs Alt+Tab to move focus off a text input (the Story 4.1 idiom in this file).
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(toggle).toBeFocused();

    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();

    await page.keyboard.press('Enter');
    await expect(toggle).not.toBeChecked();

    await page.keyboard.press('ArrowRight');
    await expect(toggle).not.toBeChecked();
  });

  test('label click toggles', async ({ page }) => {
    const { dialog, toggle } = await openAgingToggle(page);

    await dialog.getByText('Aging Degradation', { exact: true }).click();

    await expect(toggle).toBeChecked();
  });

  // The scan that measures "On" in --gol-accent on --gol-bg-secondary for real. No transition on
  // the control, so no extra wait beyond openEditor's own settle.
  test('has no axe violations with the switch On', async ({ page }) => {
    const { toggle } = await openAgingToggle(page);

    await toggle.click();
    await expect(toggle).toBeChecked();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('the description is associated through aria-describedby', async ({ page }) => {
    const { toggle } = await openAgingToggle(page);

    const describedBy = await toggle.getAttribute('aria-describedby');
    if (describedBy === null) throw new Error('aria-describedby is absent');
    // useId() ids carry colons, so the id must be quoted as an attribute selector.
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
      'Cells increase saturation as they age',
    );
  });
});

test.describe('color picker & selection defaults (Story 4.8)', () => {
  /** `/organisms` hydrated, the editor open and settled, and the picker located THROUGH the
   * Basic Information region — so a control that rendered in another column would not be found.
   * Mirrors `openDominanceControl` / `openAgingToggle` above. The palette is collapsed at mount
   * (FD7) — `expandPalette` is the mockup's "Change Color ▾" click, taken by the tests that need
   * a radio. */
  async function openColorPicker(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const basicInfo = dialog.getByRole('region', { name: 'Basic Information' });
    const toggle = basicInfo.getByRole('button', { name: 'Change Color' });
    const radiogroup = basicInfo.getByRole('radiogroup', { name: 'Organism Color' });
    const expandPalette = async () => {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(radiogroup).toBeVisible();
    };
    return { dialog, basicInfo, toggle, radiogroup, expandPalette };
  }

  // The production seed holds ONE organism, Conway's Classic, on token #1 (sky-blue) —
  // `apps/web/e2e/organisms.spec.ts:153-190` pins the seed. The M6 default is therefore the
  // registry's SECOND entry, PALETTE[1] — written as the literal 'Vermillion' because this spec
  // imports only `@gol/*` (the 4.7 precedent for literals), never `apps/web/lib`.
  const DEFAULT_NAME = 'Vermillion';
  const PICKED_NAME = 'Amber';

  test('opens on the next unused token, all swatches enabled, zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { basicInfo, toggle, radiogroup, expandPalette } = await openColorPicker(page);

    // Collapsed at mount (FD7): the chip and the button are what render, no radio is reachable.
    await expect(basicInfo.locator('[data-selected-name]')).toHaveText(DEFAULT_NAME);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(radiogroup).toBeHidden();
    await expect(basicInfo.getByRole('radio')).toHaveCount(0);

    await expandPalette();
    // 20 = PALETTE.length — this spec does not import `apps/web/lib` (the 4.7 precedent).
    await expect(radiogroup.getByRole('radio')).toHaveCount(20);
    // `:enabled` counted to 20, not `:disabled` to 0 — a zero count also passes on a selector
    // that matches nothing.
    await expect(radiogroup.locator('input[type="radio"]:enabled')).toHaveCount(20);
    await expect(radiogroup.getByRole('radio', { name: DEFAULT_NAME })).toBeChecked();
    await expect(basicInfo.locator('[data-selected-name]')).toHaveText(DEFAULT_NAME);
    const describedBy = await radiogroup.getAttribute('aria-describedby');
    if (describedBy === null) throw new Error('aria-describedby is absent');
    await expect(page.locator(`[id="${describedBy}"]`)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a pick updates the display, the name and the aging strip together', async ({ page }) => {
    const { basicInfo, toggle, radiogroup, expandPalette } = await openColorPicker(page);

    const selectedSwatch = basicInfo.locator('[data-selected-swatch]');
    const capCell = basicInfo.locator('[data-aging-example] [data-age="7"]'); // MAX_AGE_SHADE
    const before = await selectedSwatch.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(before).not.toBe('rgba(0, 0, 0, 0)');

    await expandPalette();
    await radiogroup.getByRole('radio', { name: PICKED_NAME }).click();

    // A pointer pick collapses the palette and hands focus to the button (FD7) — never `<body>`.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(radiogroup).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(basicInfo.locator('[data-selected-name]')).toHaveText(PICKED_NAME);
    await expandPalette();
    await expect(radiogroup.getByRole('radio', { name: PICKED_NAME })).toBeChecked();

    const [selectedColor, smallColor, capColor] = await Promise.all([
      selectedSwatch.evaluate((el) => getComputedStyle(el).backgroundColor),
      basicInfo
        .locator('[data-color-token="amber"]')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      capCell.evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);

    expect(selectedColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(selectedColor).toBe(smallColor);
    expect(selectedColor).toBe(capColor);
    expect(selectedColor).not.toBe(before);
  });

  test('keyboard: the button is the stop, Enter opens, arrows move and select without collapsing', async ({
    page,
    browserName,
  }) => {
    const { dialog, basicInfo, toggle, radiogroup } = await openColorPicker(page);
    const nameTextbox = dialog.getByRole('textbox', { name: 'Organism Name' });

    await nameTextbox.focus();
    // WebKit needs Alt+Tab to move focus off a text input (the Story 4.1 idiom in this file).
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.keyboard.press(tabKey);
    // Collapsed: the button is the column's second stop and the slider its third.
    await expect(toggle).toBeFocused();
    await page.keyboard.press(tabKey);
    await expect(dialog.getByRole('slider', { name: 'Dominance' })).toBeFocused();

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press(tabKey);
    const checkedRadio = radiogroup.getByRole('radio', { name: DEFAULT_NAME });
    await expect(checkedRadio).toBeFocused();

    await page.keyboard.press('ArrowRight');
    // PALETTE[2] — the registry entry after DEFAULT_NAME's (PALETTE[1]); located by name so the
    // assertion says which radio took the selection, not merely that some index did.
    const nextRadio = radiogroup.getByRole('radio', { name: 'Bluish Green' });
    await expect(nextRadio).toBeChecked();
    await expect(nextRadio).toBeFocused();
    await expect(basicInfo.locator('[data-selected-name]')).toHaveText('Bluish Green');
    // A keyboard pick leaves the palette open (FD7): the roving focus is never dropped.
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press(tabKey);
    await expect(dialog.getByRole('slider', { name: 'Dominance' })).toBeFocused();
  });

  test('label click selects', async ({ page }) => {
    const { dialog, basicInfo, radiogroup, expandPalette } = await openColorPicker(page);

    await expandPalette();
    await dialog.locator('[data-color-token="teal"]').click();

    await expect(basicInfo.locator('[data-selected-name]')).toHaveText('Teal');
    await expandPalette();
    await expect(radiogroup.getByRole('radio', { name: 'Teal' })).toBeChecked();
  });

  // The scan that measures the ✓ on a real fill and the accent border for real, with the palette
  // OPEN on the picked swatch (a collapsed palette would scan nothing).
  test('axe with a user-picked swatch', async ({ page }) => {
    const { radiogroup, expandPalette } = await openColorPicker(page);

    await expandPalette();
    await radiogroup.getByRole('radio', { name: PICKED_NAME }).click();
    await expandPalette();
    await expect(radiogroup.getByRole('radio', { name: PICKED_NAME })).toBeChecked();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('the description is associated through aria-describedby', async ({ page }) => {
    const { radiogroup, expandPalette } = await openColorPicker(page);

    await expandPalette();
    const describedBy = await radiogroup.getAttribute('aria-describedby');
    if (describedBy === null) throw new Error('aria-describedby is absent');
    // useId() ids carry colons, so the id must be quoted as an attribute selector. AC4 (Story
    // 4.9): the description now carries the mockup's second sentence too.
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
      'Pick any color — colors are reusable. If another organism already uses your pick, a ' +
        "non-blocking warning appears (they'll share a color on the grid).",
    );
  });
});

// Story 4.9. The production seed holds Conway's Classic on `sky-blue` (`:153-190`), so the
// literals below are 'Sky Blue' (PALETTE[0] — the colliding pick), 'Amber' (PALETTE[3] — a free
// pick) and the exact AC1 sentence — each a literal because this spec imports only `@gol/*` (the
// 4.7/4.8 precedent). The status region is scoped to `basicInfo`: the page also has a count-badge
// `status` behind the inert backdrop, and scoping to Basic Information keeps the locator
// unambiguous.
test.describe('color reuse warning (Story 4.9)', () => {
  async function openColorPicker(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const basicInfo = dialog.getByRole('region', { name: 'Basic Information' });
    const toggle = basicInfo.getByRole('button', { name: 'Change Color' });
    const radiogroup = basicInfo.getByRole('radiogroup', { name: 'Organism Color' });
    const status = basicInfo.getByRole('status');
    const expandPalette = async () => {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(radiogroup).toBeVisible();
    };
    return { dialog, basicInfo, toggle, radiogroup, status, expandPalette };
  }

  const COLLIDING_NAME = 'Sky Blue';
  const FREE_NAME = 'Amber';
  const COLLISION_SENTENCE = "Conway's Classic already uses this color.";

  test('opens silent, dots mark the seed token only, zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { basicInfo, status, expandPalette } = await openColorPicker(page);

    await expect(status).toBeEmpty();
    await expandPalette();
    const inUse = basicInfo.locator('[data-in-use="true"]');
    await expect(inUse).toHaveCount(1);
    await expect(inUse).toHaveAttribute('data-color-token', 'sky-blue');
    // The dot must NOT join the radio's accessible name. Generated `content` is part of a label's
    // text alternative (accname §2F.ii) in every engine — a bare `"•"` names this radio
    // "• Sky Blue" — and jsdom cannot see it, so this browser-side check is the only real guard
    // (Story 4.9 review). Exact, not substring: `getByRole({ name })` alone would pass either way.
    await expect(inUse.getByRole('radio')).toHaveAccessibleName(COLLIDING_NAME);
    const describedBy = await basicInfo
      .getByRole('radiogroup', { name: 'Organism Color' })
      .getAttribute('aria-describedby');
    if (describedBy === null) throw new Error('aria-describedby is absent');
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
      'Pick any color — colors are reusable. If another organism already uses your pick, a ' +
        "non-blocking warning appears (they'll share a color on the grid).",
    );
    expect(errors).toEqual([]);
  });

  test('a colliding pick warns and proceeds', async ({ page }) => {
    const { basicInfo, toggle, radiogroup, status, expandPalette } = await openColorPicker(page);
    const saveButton = page.getByRole('button', { name: 'Save' });
    const saveBefore = await saveButton.evaluate((el) => el.outerHTML);

    await expandPalette();
    await radiogroup.getByRole('radio', { name: COLLIDING_NAME }).click();

    await expect(status).toContainText(COLLISION_SENTENCE);
    await expect(basicInfo.locator('[data-color-reuse-warning]')).toBeVisible();
    // The pick still proceeds exactly as an unwarned one would (FD7: a pointer pick collapses the
    // palette and hands focus to the button).
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await expect(basicInfo.locator('[data-selected-name]')).toHaveText(COLLIDING_NAME);
    // "Save is unaffected" as a before/after comparison — the Story 4.13 gate does not react to a
    // colour pick, which is neither a name, rule nor condition field it validates.
    await expect(saveButton).toBeEnabled();
    expect(await saveButton.evaluate((el) => el.outerHTML)).toBe(saveBefore);
    // The warning is still visible under the chip row while the palette is collapsed.
    await expect(status).toContainText(COLLISION_SENTENCE);

    await expandPalette();
    await expect(radiogroup.getByRole('radio', { name: COLLIDING_NAME })).toBeChecked();
    // 20 = PALETTE.length — this spec does not import `apps/web/lib` (the 4.7 precedent); counted
    // as `:enabled` to 20, never `:disabled` to 0, which a selector matching nothing also passes.
    await expect(radiogroup.locator('input[type="radio"]:enabled')).toHaveCount(20);
  });

  test('clears on a non-conflicting pick', async ({ page }) => {
    const { radiogroup, status, expandPalette } = await openColorPicker(page);

    await expandPalette();
    await radiogroup.getByRole('radio', { name: COLLIDING_NAME }).click();
    await expect(status).toContainText(COLLISION_SENTENCE);

    await expandPalette();
    await radiogroup.getByRole('radio', { name: FREE_NAME }).click();

    await expect(status).toBeEmpty();
  });

  test('keyboard: a colliding pick warns and leaves the palette open; the seed is silent', async ({
    page,
    browserName,
  }) => {
    const { toggle, radiogroup, status } = await openColorPicker(page);
    // WebKit needs Alt+Tab to move focus off a non-text control (the Story 4.8 idiom in this
    // file).
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press(tabKey);
    // The seed (Vermillion, PALETTE[1]) is checked at open — arrow-left moves to Sky Blue
    // (PALETTE[0]), the colliding pick.
    const checkedRadio = radiogroup.getByRole('radio', { name: 'Vermillion' });
    await expect(checkedRadio).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(radiogroup.getByRole('radio', { name: COLLIDING_NAME })).toBeChecked();
    await expect(status).toContainText(COLLISION_SENTENCE);
    // A keyboard pick leaves the palette open (FD7).
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('ArrowRight');
    // Back on the seed — silent again (FD2).
    await expect(radiogroup.getByRole('radio', { name: 'Vermillion' })).toBeChecked();
    await expect(status).toBeEmpty();
  });

  test('axe with the warning visible', async ({ page }) => {
    const { radiogroup, expandPalette } = await openColorPicker(page);

    await expandPalette();
    await radiogroup.getByRole('radio', { name: COLLIDING_NAME }).click();
    await expandPalette();
    await expect(radiogroup.getByRole('radio', { name: COLLIDING_NAME })).toBeChecked();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

// Story 4.10. `rules.locator('[data-add-rule="…"]')` disambiguates the two "+ Add Rule" controls
// that share one accessible name in the empty state (FD9) — `getByRole('button', { name: '+ Add
// Rule' })` alone matches two and fails Playwright's strict mode. Every numbered name
// (`getByRole(..., { name })`) is a case-insensitive SUBSTRING match unless `exact: true` is
// passed — `'Rule 1'` would also match `Rule 10`+ and `'Delete rule 1'` would match `Delete rule
// 12` — so every numbered lookup below passes `exact: true`.
test.describe('rule cards & empty state (Story 4.10)', () => {
  type Box = { x: number; y: number; width: number; height: number };

  /** `boundingBox()` is `null` for a detached or hidden node — throw (the Story 4.4 `boxOf`
   * idiom, forked here since that one is local to its own describe block) rather than
   * optional-chain into a 0×0 box that passes every upper bound. */
  async function boxOf(locator: Locator, label: string): Promise<Box> {
    const box = await locator.boundingBox();
    if (box === null) throw new Error(`${label} has no layout box`);
    return box;
  }

  async function openRules(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const rules = dialog.getByRole('region', { name: 'Survival Rules' });
    const headerAdd = rules.locator('[data-add-rule="header"]');
    const emptyAdd = rules.locator('[data-add-rule="empty"]');
    return { dialog, rules, headerAdd, emptyAdd };
  }

  function cardGroup(rules: Locator, n: number) {
    return rules.getByRole('group', { name: `Rule ${n}`, exact: true });
  }

  test('opens in the empty state, both add controls visible, header action beside the heading, zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { rules, headerAdd, emptyAdd } = await openRules(page);

    await expect(rules.locator('[data-rules-empty-state]')).toBeVisible();
    await expect(rules.getByText('No Rules Defined')).toBeVisible();
    await expect(headerAdd).toBeVisible();
    await expect(emptyAdd).toBeVisible();
    await expect(rules.getByRole('list')).toHaveCount(0);

    const heading = rules.getByRole('heading', { name: 'Survival Rules' });
    const headingBox = await boxOf(heading, 'Survival Rules heading');
    const actionBox = await boxOf(headerAdd, 'header + Add Rule');
    expect(actionBox.x).toBeGreaterThan(headingBox.x);
    expect(Math.abs(actionBox.y - headingBox.y)).toBeLessThanOrEqual(4);

    expect(errors).toEqual([]);
  });

  test('the empty CTA adds and focuses the Summary', async ({ page }) => {
    const { rules, emptyAdd } = await openRules(page);

    await emptyAdd.click();

    await expect(rules.locator('[data-rules-empty-state]')).toHaveCount(0);
    const group = cardGroup(rules, 1);
    await expect(group).toBeVisible();
    await expect(
      rules.getByRole('list', { name: 'Survival rules' }).getByRole('listitem'),
    ).toHaveCount(1);
    await expect(group.getByRole('textbox', { name: 'Summary' })).toBeFocused();
    await expect(group.locator('[data-rule-badge]')).toHaveText('Born');
    await expect(group.getByRole('combobox', { name: 'Action' })).toHaveValue('born');
  });

  test('the header action appends, and the cards renumber on delete', async ({ page }) => {
    const { rules, headerAdd } = await openRules(page);

    for (let i = 1; i <= 3; i++) {
      await headerAdd.click();
      const newest = cardGroup(rules, i);
      await expect(newest.getByRole('textbox', { name: 'Summary' })).toBeFocused();
    }

    await cardGroup(rules, 2).getByRole('combobox', { name: 'Action' }).selectOption('survive');
    await cardGroup(rules, 3).getByRole('combobox', { name: 'Action' }).selectOption('die');

    await expect(cardGroup(rules, 1).locator('[data-rule-badge]')).toHaveText('Born');
    await expect(cardGroup(rules, 2).locator('[data-rule-badge]')).toHaveText('Survive');
    await expect(cardGroup(rules, 3).locator('[data-rule-badge]')).toHaveText('Die');

    await rules.getByRole('button', { name: 'Delete rule 1', exact: true }).click();

    await expect(cardGroup(rules, 1).locator('[data-rule-badge]')).toHaveText('Survive');
    await expect(cardGroup(rules, 2).locator('[data-rule-badge]')).toHaveText('Die');
    // The neighbour's Summary, not another Delete button — a held Enter on one would cascade (AC5).
    await expect(cardGroup(rules, 1).getByRole('textbox', { name: 'Summary' })).toBeFocused();
  });

  test('Summary clamps at 100 with the counter agreeing', async ({ page }) => {
    const { rules, emptyAdd } = await openRules(page);
    await emptyAdd.click();

    const summary = cardGroup(rules, 1).getByRole('textbox', { name: 'Summary' });
    await summary.fill('x'.repeat(120));

    await expect(summary).toHaveValue('x'.repeat(100));
    await expect(rules.getByText('100 / 100')).toBeVisible();
  });

  test('keyboard: delete -> Summary -> Action -> + Add Condition -> Reorder inside a card', async ({
    page,
    browserName,
  }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    await headerAdd.click();
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    // Start on the card's Delete (its SECOND stop since Story 4.12 — the live Reorder handle is
    // the first, covered by the 4.12 Tab-order test) and walk Delete -> Summary -> Action -> + Add
    // Condition (Story 4.11 AC11d: the condition builder's own add button is the card's last
    // stop) -> the NEXT card's Reorder handle, its first stop (Story 4.12, AC11c) -> Delete.
    await rules.getByRole('button', { name: 'Delete rule 1', exact: true }).focus();
    await page.keyboard.press(tabKey);
    await expect(cardGroup(rules, 1).getByRole('textbox', { name: 'Summary' })).toBeFocused();
    await page.keyboard.press(tabKey);
    await expect(cardGroup(rules, 1).getByRole('combobox', { name: 'Action' })).toBeFocused();
    await page.keyboard.press(tabKey);
    await expect(
      cardGroup(rules, 1).getByRole('button', { name: '+ Add Condition' }),
    ).toBeFocused();
    await page.keyboard.press(tabKey);
    await expect(rules.getByRole('button', { name: 'Reorder rule 2', exact: true })).toBeFocused();
    await page.keyboard.press(tabKey);
    await expect(rules.getByRole('button', { name: 'Delete rule 2', exact: true })).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(cardGroup(rules, 2)).toHaveCount(0);
    // The neighbour's Summary, not another Delete button (AC5): a held Enter on a `<button>` would
    // cascade deletions; that card's Delete is one Shift+Tab back.
    await expect(cardGroup(rules, 1).getByRole('textbox', { name: 'Summary' })).toBeFocused();
  });

  test('the drag handle is enabled (Story 4.12)', async ({ page }) => {
    const { rules, emptyAdd } = await openRules(page);
    await emptyAdd.click();

    await expect(rules.getByRole('button', { name: 'Reorder rule 1', exact: true })).toBeEnabled();
  });

  test('axe in the empty state', async ({ page }) => {
    await openRules(page);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('axe with three cards (Born / Survive / Die)', async ({ page }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    await headerAdd.click();
    await headerAdd.click();
    await cardGroup(rules, 2).getByRole('combobox', { name: 'Action' }).selectOption('survive');
    await cardGroup(rules, 3).getByRole('combobox', { name: 'Action' }).selectOption('die');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

test.describe('condition builder (Story 4.11)', () => {
  async function openRules(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const rules = dialog.getByRole('region', { name: 'Survival Rules' });
    const headerAdd = rules.locator('[data-add-rule="header"]');
    return { dialog, rules, headerAdd };
  }

  function cardGroup(rules: Locator, n: number) {
    return rules.getByRole('group', { name: `Rule ${n}`, exact: true });
  }

  // The controls by exact name — `exact: true` because `Condition 1` is a substring of
  // `Condition 10`. `value` is one of a combobox (cellState/organismType) or a textbox (a numeric
  // scalar) depending on the row's property — `.or()` resolves to whichever exists.
  function row(card: Locator, n: number) {
    return {
      property: card.getByRole('combobox', { name: `Condition ${n} property`, exact: true }),
      operator: card.getByRole('combobox', { name: `Condition ${n} operator`, exact: true }),
      value: card
        .getByRole('combobox', { name: `Condition ${n} value`, exact: true })
        .or(card.getByRole('textbox', { name: `Condition ${n} value`, exact: true })),
      min: card.getByRole('textbox', { name: `Condition ${n} minimum`, exact: true }),
      max: card.getByRole('textbox', { name: `Condition ${n} maximum`, exact: true }),
      delete: card.getByRole('button', { name: `Delete condition ${n}`, exact: true }),
    };
  }

  test('a fresh rule has the group, no rows, and the add action; add focuses the property select; zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    const card = cardGroup(rules, 1);
    const addCond = card.locator('[data-add-condition]');

    await expect(card.getByRole('group', { name: 'Conditions (all must match)' })).toBeVisible();
    await expect(addCond).toBeVisible();
    await expect(card.getByRole('combobox', { name: /^Condition/ })).toHaveCount(0);

    await addCond.click();

    const r1 = row(card, 1);
    await expect(r1.property).toBeFocused();
    await expect(r1.property).toHaveValue('cellState');
    expect(await r1.operator.locator('option').allTextContents()).toEqual(['=']);
    await expect(r1.value).toHaveValue('empty');
    // PRD FR-2.5's own words: "Empty, Alive (your organism), or Occupied (another organism)".
    expect(await r1.value.locator('option').allTextContents()).toEqual([
      'Empty',
      'Alive (your organism)',
      'Occupied (another organism)',
    ]);

    expect(errors).toEqual([]);
  });

  test('property drives operator and value', async ({ page }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    const card = cardGroup(rules, 1);
    await card.locator('[data-add-condition]').click();
    const r1 = row(card, 1);

    await r1.property.selectOption('neighborCount');
    expect(await r1.operator.locator('option').allTextContents()).toHaveLength(6);
    await expect(r1.value).toHaveAttribute('placeholder', '0–8');
    await expect(r1.value).toHaveValue('');

    await r1.property.selectOption('organismType');
    expect(await r1.operator.locator('option').allTextContents()).toEqual(['=']);
    // The production build carries no AR-45 fixtures (M9) — the library is Conway's Classic alone.
    expect(await r1.value.locator('option').allTextContents()).toEqual(["Conway's Classic"]);
    await expect(r1.value).toHaveValue(CONWAYS_CLASSIC_ID);

    await r1.property.selectOption('age');
    await expect(r1.value).toHaveAttribute('placeholder', '0–999');
  });

  test('range and the pair error', async ({ page }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    const card = cardGroup(rules, 1);
    await card.locator('[data-add-condition]').click();
    const r1 = row(card, 1);

    await r1.property.selectOption('neighborCount');
    await r1.operator.selectOption('range');
    await expect(r1.min).toHaveAttribute('placeholder', 'Min');
    await expect(r1.max).toHaveAttribute('placeholder', 'Max');

    await r1.min.fill('3');
    await r1.max.fill('2');
    await expect(card.getByRole('alert')).toContainText('Min must be less than Max');
    await expect(r1.min).toHaveAttribute('aria-invalid', 'true');
    await expect(r1.max).toHaveAttribute('aria-invalid', 'true');

    await r1.max.fill('4');
    await expect(card.getByRole('alert')).toHaveCount(0);

    await r1.min.fill('x');
    await expect(card.getByRole('alert')).toContainText('Min must be a whole number from 0 to 8');
  });

  test('scalar bounds', async ({ page }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    const card = cardGroup(rules, 1);
    await card.locator('[data-add-condition]').click();
    const r1 = row(card, 1);
    await r1.property.selectOption('neighborCount');

    await r1.value.fill('9');
    await expect(card.getByRole('alert')).toContainText('Enter a whole number from 0 to 8');
    await r1.value.fill('8');
    await expect(card.getByRole('alert')).toHaveCount(0);

    await r1.property.selectOption('age');
    await r1.value.fill('1000');
    await expect(card.getByRole('alert')).toContainText('Enter a whole number from 0 to 999');
    await r1.value.fill('999');
    await expect(card.getByRole('alert')).toHaveCount(0);
  });

  test('rows renumber and focus follows a delete', async ({ page }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    const card = cardGroup(rules, 1);
    const addCond = card.locator('[data-add-condition]');
    await addCond.click();
    await addCond.click();
    await addCond.click();

    await row(card, 1).delete.click();
    await expect(row(card, 1).property).toBeVisible();
    await expect(row(card, 2).property).toBeVisible();
    await expect(row(card, 3).property).toHaveCount(0);
    await expect(row(card, 1).property).toBeFocused();

    await row(card, 1).delete.click();
    await row(card, 1).delete.click();
    await expect(addCond).toBeFocused();
    await expect(card).toBeVisible();
  });

  test('keyboard: Tab walks property -> operator -> value -> delete -> next row; the add button follows the last delete', async ({
    page,
    browserName,
  }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    const card = cardGroup(rules, 1);
    const addCond = card.locator('[data-add-condition]');
    await addCond.click();
    await addCond.click();
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    const r1 = row(card, 1);
    await r1.property.focus();
    await page.keyboard.press(tabKey);
    await expect(r1.operator).toBeFocused();
    await page.keyboard.press(tabKey);
    await expect(r1.value).toBeFocused();
    await page.keyboard.press(tabKey);
    await expect(r1.delete).toBeFocused();
    await page.keyboard.press(tabKey);
    const r2 = row(card, 2);
    await expect(r2.property).toBeFocused();

    // From row 2's Delete, Tab reaches + Add Condition — the card's new last stop (AC11d).
    await r2.delete.focus();
    await page.keyboard.press(tabKey);
    await expect(addCond).toBeFocused();

    // Enter on the focused Delete removes the row; focus lands on the new last row's property
    // (the "last was removed" branch, AC8).
    await r2.delete.focus();
    await page.keyboard.press('Enter');
    await expect(row(card, 2).property).toHaveCount(0);
    await expect(r1.property).toBeFocused();
  });

  test('axe with four row kinds (cellState / organismType / numeric scalar / range)', async ({
    page,
  }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    const card = cardGroup(rules, 1);
    const addCond = card.locator('[data-add-condition]');

    await addCond.click(); // row 1: cellState, the default
    await addCond.click();
    await row(card, 2).property.selectOption('organismType');
    await addCond.click();
    await row(card, 3).property.selectOption('age');
    await row(card, 3).value.fill('3');
    await addCond.click();
    await row(card, 4).property.selectOption('neighborCount');
    await row(card, 4).operator.selectOption('range');
    await row(card, 4).min.fill('2');
    await row(card, 4).max.fill('3');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test('axe with the pair alert visible', async ({ page }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    const card = cardGroup(rules, 1);
    await card.locator('[data-add-condition]').click();
    await row(card, 1).property.selectOption('neighborCount');
    await row(card, 1).operator.selectOption('range');
    await row(card, 1).min.fill('3');
    await row(card, 1).max.fill('2');
    await expect(card.getByRole('alert')).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

test.describe('rule reordering (Story 4.12)', () => {
  type Box = { x: number; y: number; width: number; height: number };

  async function boxOf(locator: Locator, label: string): Promise<Box> {
    const box = await locator.boundingBox();
    if (box === null) throw new Error(`${label} has no layout box`);
    return box;
  }

  async function openRules(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const rules = dialog.getByRole('region', { name: 'Survival Rules' });
    const headerAdd = rules.locator('[data-add-rule="header"]');
    return { dialog, rules, headerAdd };
  }

  function cardGroup(rules: Locator, n: number) {
    return rules.getByRole('group', { name: `Rule ${n}`, exact: true });
  }

  function handle(rules: Locator, n: number) {
    return rules.getByRole('button', { name: `Reorder rule ${n}`, exact: true });
  }

  function badges(rules: Locator) {
    return rules.locator('[data-rule-badge]').allTextContents();
  }

  // Born / Survive / Die, in that order — the 4.10 axe test's setup.
  async function threeCards(page: Page) {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    await headerAdd.click();
    await headerAdd.click();
    await cardGroup(rules, 2).getByRole('combobox', { name: 'Action' }).selectOption('survive');
    await cardGroup(rules, 3).getByRole('combobox', { name: 'Action' }).selectOption('die');
    return rules;
  }

  test('keyboard: ArrowUp moves, renumbers, keeps focus on the moved card, announces; the top is a consumed no-op; zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const rules = await threeCards(page);
    await handle(rules, 3).focus();

    // Born / Survive / Die (`ruleActionLabel` — literal, cited: `apps/web/lib`, spec imports
    // only `@gol/*`, the 4.10 idiom).
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => badges(rules)).toEqual(['Born', 'Die', 'Survive']);
    await expect(handle(rules, 2)).toBeFocused();
    await expect(rules.locator('[data-reorder-status]')).toHaveText(
      'Rule moved to position 2 of 3',
    );

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => badges(rules)).toEqual(['Die', 'Born', 'Survive']);
    await expect(handle(rules, 1)).toBeFocused();
    await expect(rules.locator('[data-reorder-status]')).toHaveText(
      'Rule moved to position 1 of 3',
    );

    // The top is a consumed no-op: still `handle(1)`.
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => badges(rules)).toEqual(['Die', 'Born', 'Survive']);
    await expect(handle(rules, 1)).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => badges(rules)).toEqual(['Born', 'Die', 'Survive']);
    await expect(handle(rules, 2)).toBeFocused();

    expect(errors).toEqual([]);
  });

  // Three 371px cards never fit the 632px Rules column, so a pointer drag from one end of the
  // list to the other has to cross the viewport edge. The component handles that by rect (FD8:
  // an off-screen card's rect still resolves the slot under capture), and Chromium/WebKit deliver
  // a captured `pointermove` at a y outside the viewport — but Firefox's driver does not, so the
  // portable path is the one FD8 names for a long list: WHEEL the column mid-drag until the
  // target is on screen, then move onto it. `mouse.wheel` scrolls whatever is under the pointer,
  // which is the column while the handle is held; mobile WebKit has no wheel, so the tablet
  // project scrolls the column directly (the swipe it cannot synthesise). No auto-scroll exists
  // (FD8, recorded).
  async function pressHandle(page: Page, rules: Locator, n: number) {
    await handle(rules, n).scrollIntoViewIfNeeded();
    const h = await boxOf(handle(rules, n), `handle ${n}`);
    const x = h.x + h.width / 2;
    await page.mouse.move(x, h.y + h.height / 2);
    await page.mouse.down();
    await expect(rules.locator('li[data-dragging]')).toHaveCount(1);
    await expect(rules.locator('li[data-dragging]')).toContainText(`Rule ${n}`);
    return x;
  }

  async function scrollUntilVisible(
    page: Page,
    rules: Locator,
    target: Locator,
    edge: 'top' | 'bottom',
    isMobile: boolean,
  ) {
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('no viewport');
    for (let i = 0; i < 12; i += 1) {
      const box = await boxOf(target, 'drop target');
      const y = edge === 'top' ? box.y + 4 : box.y + box.height + 4;
      if (y >= 0 && y <= viewport.height) return y;
      const delta = edge === 'top' ? -200 : 200;
      if (isMobile) {
        await rules.evaluate((el, dy) => el.scrollBy(0, dy), delta);
      } else {
        await page.mouse.wheel(0, delta);
      }
    }
    throw new Error(`drop target's ${edge} never entered the viewport`);
  }

  test('pointer: drag card 1 below card 3 — dragging state, after indicator, drop renumbers', async ({
    page,
    isMobile,
  }) => {
    const rules = await threeCards(page);

    const x = await pressHandle(page, rules, 1);
    const y = await scrollUntilVisible(page, rules, cardGroup(rules, 3), 'bottom', isMobile);
    await page.mouse.move(x, y, { steps: 8 });
    await expect(rules.locator('li[data-drop="after"]')).toHaveCount(1);
    await expect(rules.locator('li[data-drop="after"]')).toContainText('Rule 3');

    await page.mouse.up();
    await expect.poll(() => badges(rules)).toEqual(['Survive', 'Die', 'Born']);
    await expect(rules.locator('li[data-dragging]')).toHaveCount(0);
    await expect(rules.locator('li[data-drop]')).toHaveCount(0);
    await expect(handle(rules, 3)).toBeFocused();
  });

  test('pointer: drag card 3 above card 1 — before indicator', async ({ page, isMobile }) => {
    const rules = await threeCards(page);

    const x = await pressHandle(page, rules, 3);
    const y = await scrollUntilVisible(page, rules, cardGroup(rules, 1), 'top', isMobile);
    await page.mouse.move(x, y, { steps: 8 });
    await expect(rules.locator('li[data-drop="before"]')).toHaveCount(1);
    await expect(rules.locator('li[data-drop="before"]')).toContainText('Rule 1');

    await page.mouse.up();
    await expect.poll(() => badges(rules)).toEqual(['Die', 'Born', 'Survive']);
  });

  test('Escape mid-drag cancels and the editor stays open', async ({ page, isMobile }) => {
    const rules = await threeCards(page);
    const before = await badges(rules);

    const x = await pressHandle(page, rules, 1);
    const y = await scrollUntilVisible(page, rules, cardGroup(rules, 3), 'bottom', isMobile);
    await page.mouse.move(x, y, { steps: 8 });
    // The drag must be real before Escape is meaningful — without this the cancel assertions
    // below would hold vacuously.
    await expect(rules.locator('li[data-drop="after"]')).toHaveCount(1);

    // In WebKit `mouse.down()` does not focus the handle, which is exactly the case the
    // `document` capture listener exists for — the four-browser matrix on the PR proves it there;
    // Chromium locally.
    await page.keyboard.press('Escape');
    await expect(rules.locator('li[data-dragging]')).toHaveCount(0);
    await expect(rules.locator('li[data-drop]')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Organism Editor' })).toBeVisible();
    await expect.poll(() => badges(rules)).toEqual(before);

    await page.mouse.up();
    await expect.poll(() => badges(rules)).toEqual(before);
  });

  test("Tab order: the handle is the card's first stop", async ({ page, browserName }) => {
    const { rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    await headerAdd.click();
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    await handle(rules, 1).focus();
    await page.keyboard.press(tabKey);
    await expect(rules.getByRole('button', { name: 'Delete rule 1', exact: true })).toBeFocused();

    await cardGroup(rules, 1).getByRole('button', { name: '+ Add Condition' }).focus();
    await page.keyboard.press(tabKey);
    await expect(handle(rules, 2)).toBeFocused();
  });

  test('axe after a keyboard reorder', async ({ page }) => {
    const rules = await threeCards(page);
    await handle(rules, 1).focus();
    await page.keyboard.press('ArrowDown');
    // Never mid-drag — `opacity: 0.5` on the dragged card is a transient pointer state, not one
    // of the settled states this idiom scans (FD7).
    await expect.poll(() => badges(rules)).toEqual(['Survive', 'Born', 'Die']);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

test.describe('editor validation & feedback (Story 4.13)', () => {
  async function openRules(page: Page) {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const rules = dialog.getByRole('region', { name: 'Survival Rules' });
    const headerAdd = rules.locator('[data-add-rule="header"]');
    return { dialog, rules, headerAdd };
  }

  function cardGroup(rules: Locator, n: number) {
    return rules.getByRole('group', { name: `Rule ${n}`, exact: true });
  }

  function row(card: Locator, n: number) {
    return {
      property: card.getByRole('combobox', { name: `Condition ${n} property`, exact: true }),
      operator: card.getByRole('combobox', { name: `Condition ${n} operator`, exact: true }),
      value: card
        .getByRole('combobox', { name: `Condition ${n} value`, exact: true })
        .or(card.getByRole('textbox', { name: `Condition ${n} value`, exact: true })),
      min: card.getByRole('textbox', { name: `Condition ${n} minimum`, exact: true }),
      max: card.getByRole('textbox', { name: `Condition ${n} maximum`, exact: true }),
    };
  }

  const save = (dialog: Locator) => dialog.getByRole('button', { name: 'Save' });

  test('a fresh editor Save is refused: the name error, the red state, focus on the name field, zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const { dialog } = await openRules(page);
    await save(dialog).click();

    await expect(dialog.getByRole('alert')).toHaveText(/Organism name is required/);
    const name = dialog.getByRole('textbox', { name: 'Organism Name' });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();
    await expect(dialog).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('three errors at once, in document order; each clears on its own fix; focus walks the list', async ({
    page,
  }) => {
    const { dialog, rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    await headerAdd.click();
    const card2 = cardGroup(rules, 2);
    await card2.locator('[data-add-condition]').click();
    await row(card2, 1).property.selectOption('age');
    await row(card2, 1).operator.selectOption('range');
    await row(card2, 1).min.fill('5');
    // Max left untouched.

    await save(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveCount(3);
    const name = dialog.getByRole('textbox', { name: 'Organism Name' });
    await expect(name).toBeFocused();

    await name.fill('Glider');
    await expect(dialog.getByRole('alert')).toHaveCount(2);

    await save(dialog).click();
    const card1 = cardGroup(rules, 1);
    const addCondition1 = card1.getByRole('button', { name: '+ Add Condition' });
    await expect(addCondition1).toBeFocused();
    await expect(addCondition1).toHaveAttribute('data-invalid', 'true');
    // The 4.5 attribute-selector idiom — `useId` ids carry colons.
    const describedById = await addCondition1.getAttribute('aria-describedby');
    expect(describedById).not.toBeNull();
    await expect(page.locator(`[id="${describedById}"]`)).toHaveText(
      /Rule must have at least one condition/,
    );

    // A structural add un-sticks the override (FD3): card 1's line goes because its error is fixed,
    // and card 2's untouched-Max line goes because only the override was showing it. The next Save
    // re-flags Max alone — name valid, card 1 now has a (valid, default) row.
    await addCondition1.click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const max = row(card2, 1).max;
    await expect(max).not.toHaveAttribute('aria-invalid', 'true');

    await save(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveCount(1);
    await expect(max).toBeFocused();
    await expect(max).toHaveAttribute('aria-invalid', 'true');

    await max.fill('9');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  });

  test('zero rules is not refused; the notice is honest', async ({ page, browserName }) => {
    const { dialog, rules } = await openRules(page);
    await dialog.getByRole('textbox', { name: 'Organism Name' }).fill('Glider');

    const saveButton = save(dialog);
    await saveButton.click();

    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(rules.locator('[data-rules-empty-state]')).toBeVisible();
    // Not imported: the spec imports only `@gol/*` (the 4.10 idiom) — `SAVE_UNAVAILABLE_NOTICE`'s
    // literal, from `OrganismEditorModal.tsx`.
    await expect(dialog.locator('[data-save-notice]')).toHaveText(
      'Valid organism — saving to the library is not available yet.',
    );
    // Focus did not move. WebKit does not focus a `<button>` on click (the 4.3 note), so there
    // Save itself never received focus either — assert only that the name field did not steal it.
    if (browserName === 'webkit') {
      await expect(dialog.getByRole('textbox', { name: 'Organism Name' })).not.toBeFocused();
    } else {
      await expect(saveButton).toBeFocused();
    }
  });

  test('keyboard-only refusal', async ({ page }) => {
    const { dialog } = await openRules(page);
    await save(dialog).focus();
    await page.keyboard.press('Enter');

    await expect(dialog.getByRole('alert')).toHaveText(/Organism name is required/);
    const name = dialog.getByRole('textbox', { name: 'Organism Name' });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();

    // The gate adds no listener — Escape still closes the dialog.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('axe after a refused Save', async ({ page }) => {
    // AC10: name + rule errors visible, focus on the name field — the served build's red
    // "+ Add Condition" border and its `aria-describedby` line are what this scan is for.
    const { dialog, rules, headerAdd } = await openRules(page);
    await headerAdd.click();
    await save(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveCount(2);
    await expect(
      cardGroup(rules, 1).getByRole('button', { name: '+ Add Condition' }),
    ).toHaveAttribute('data-invalid', 'true');
    await expect(dialog.getByRole('textbox', { name: 'Organism Name' })).toBeFocused();
    // The header Button's own MUI transition (the 4.5 idiom).
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

test.describe('preview grid & drawing (Story 4.14)', () => {
  const preview = (dialog: Locator) => dialog.getByRole('region', { name: 'Preview & Test' });
  const dish = (dialog: Locator) => preview(dialog).getByRole('img', { name: /petri dish/i });
  const tool = (dialog: Locator, name: string) =>
    preview(dialog).getByRole('button', { name, exact: true });

  /** Distinct RGBA values actually rasterised on a canvas — the AR-42-permitted smoke check
   * (`battleRoute.spec.ts`'s `distinctColorCount`, copied with a pointer per the story's Task 4 —
   * lift on a third copy, `deferred-work.md`). */
  async function distinctColorCount(canvas: Locator): Promise<number> {
    return canvas.evaluate((el) => {
      const canvasEl = el as HTMLCanvasElement;
      const ctx = canvasEl.getContext('2d');
      if (ctx === null) return 0;
      const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) {
        seen.add([data[i], data[i + 1], data[i + 2], data[i + 3]].join(','));
      }
      return seen.size;
    });
  }

  /** The client point for a preview cell, from the CANVAS's own layout (never the geometric
   * centre — `deferred-work.md:344`'s note on the battle spec) — `floor(min(w/30, h/20))`, centred.
   * Measure the `img` (the canvas), not `[data-preview-dish]`: the box carries a 1px border, so its
   * rect is 2px wider than the surface the renderer laid out on, and a `floor` taken over the wrong
   * width diverges from the renderer's whenever `width / 30` sits just above an integer. */
  function cellCentre(
    box: { x: number; y: number; width: number; height: number },
    col: number,
    row: number,
  ) {
    const cellSize = Math.floor(Math.min(box.width / 30, box.height / 20));
    const drawWidth = cellSize * 30;
    const drawHeight = cellSize * 20;
    const originX = box.x + (box.width - drawWidth) / 2;
    const originY = box.y + (box.height - drawHeight) / 2;
    return {
      x: originX + col * cellSize + cellSize / 2,
      y: originY + row * cellSize + cellSize / 2,
    };
  }

  test('the dish and its controls render, Draw pressed, Clear disabled, zero console errors (no ResizeObserver loop)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    await expect(dish(dialog)).toBeAttached();
    await expect(dish(dialog)).toHaveAccessibleName('Petri dish, 30 by 20 cells');
    await expect(tool(dialog, 'Draw')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(dialog, 'Erase')).toHaveAttribute('aria-pressed', 'false');
    await expect(tool(dialog, 'Clear')).toBeDisabled();

    const box = await preview(dialog).locator('[data-preview-dish]').boundingBox();
    if (box === null) throw new Error('preview dish box has no layout box');
    // Derived from the viewport's tier (project-context.md: no default project is >= 1400 or
    // < 1024, so the FULL tier's 340px is unreachable at the default viewports; every project
    // this suite runs sits in the COMPRESSED band, giving a 350px column and a ~290px box) — a
    // range, not `toBeCloseTo(_, 0)`, because sub-pixel layout rounding lands the box at 289-290.
    expect(box.width).toBeGreaterThan(285);
    expect(box.width).toBeLessThan(295);
    // `aspect-ratio: 3 / 2` on a 1px-bordered box: WebKit (and so the tablet project) resolves it
    // ~2px taller than Chromium/Firefox at the same width (194.66 vs 192.67 at 289 — the first CI
    // run on this branch, 2026-09-21). A 3px tolerance still fails a missing rule (the box would
    // collapse to the canvas's own height) without pinning one engine's rounding.
    expect(Math.abs(box.height - box.width * (2 / 3))).toBeLessThan(3);

    expect(errors).toEqual([]);
  });

  // The FULL tier (≥ 1400: 400px column → 340px box, AC1's "11px cells at DPR 1") is reachable
  // only behind the 4.4 block's one-off `setViewportSize` — the Story 2.12 precedent, never a
  // fifth project. `setViewportSize` precedes `goto` so the first layout is already at 1440.
  test('full tier (≥ 1400): the dish box is ≈ 340 wide and a click still lands on its cell', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    const box = await preview(dialog).locator('[data-preview-dish]').boundingBox();
    if (box === null) throw new Error('preview dish box has no layout box');
    expect(box.width).toBeGreaterThan(335);
    expect(box.width).toBeLessThan(345);
    expect(Math.abs(box.height - box.width * (2 / 3))).toBeLessThan(3); // the WebKit note above

    const canvasBox = await dish(dialog).boundingBox();
    if (canvasBox === null) throw new Error('preview dish canvas has no layout box');
    const point = cellCentre(canvasBox, 5, 5);
    await page.mouse.click(point.x, point.y);
    await expect(tool(dialog, 'Clear')).toBeEnabled();
    await tool(dialog, 'Erase').click();
    await page.mouse.click(point.x, point.y);
    await expect(tool(dialog, 'Clear')).toBeDisabled();
  });

  test('Draw -> Clear enabled and the canvas paints more than two colours; Erase the same cell -> Clear disabled; Draw again, Clear -> disabled', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    const box = await dish(dialog).boundingBox();
    if (box === null) throw new Error('preview dish canvas has no layout box');
    const point = cellCentre(box, 5, 5);

    await page.mouse.click(point.x, point.y);
    await expect(tool(dialog, 'Clear')).toBeEnabled();
    await expect.poll(() => distinctColorCount(dish(dialog))).toBeGreaterThan(2);

    await tool(dialog, 'Erase').click();
    await page.mouse.click(point.x, point.y);
    await expect(tool(dialog, 'Clear')).toBeDisabled();

    await tool(dialog, 'Draw').click();
    await page.mouse.click(point.x, point.y);
    await expect(tool(dialog, 'Clear')).toBeEnabled();
    await tool(dialog, 'Clear').click();
    await expect(tool(dialog, 'Clear')).toBeDisabled();
  });

  test('a drag paints (one gesture, Clear enabled)', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    const box = await dish(dialog).boundingBox();
    if (box === null) throw new Error('preview dish canvas has no layout box');
    const from = cellCentre(box, 2, 10);
    const to = cellCentre(box, 20, 10);

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // No `steps` — one `pointermove` (`battleRoute.spec.ts:643-646`'s note).
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();

    await expect(tool(dialog, 'Clear')).toBeEnabled();
    // Clear-enabled is guaranteed by the pointer-down alone. Erasing the START cell and finding the
    // dish still non-empty is what proves the move painted past its first cell.
    await tool(dialog, 'Erase').click();
    await page.mouse.click(from.x, from.y);
    await expect(tool(dialog, 'Clear')).toBeEnabled();
  });

  test('isolation: open, draw, close leaves localStorage byte-identical; reopening shows an empty dish (M3)', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const before = await page.evaluate(() => [
      localStorage.getItem('gol:organisms'),
      localStorage.getItem('gol:battles'),
    ]);

    let dialog = await openEditor(page);
    const box = await dish(dialog).boundingBox();
    if (box === null) throw new Error('preview dish canvas has no layout box');
    const first = cellCentre(box, 3, 3);
    const second = cellCentre(box, 10, 8);
    await page.mouse.click(first.x, first.y);
    await page.mouse.click(second.x, second.y);
    await expect(tool(dialog, 'Clear')).toBeEnabled();

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();

    const after = await page.evaluate(() => [
      localStorage.getItem('gol:organisms'),
      localStorage.getItem('gol:battles'),
    ]);
    expect(after).toEqual(before);

    dialog = await openEditor(page);
    await expect(tool(dialog, 'Clear')).toBeDisabled();
  });

  test('keyboard: Draw -> Tab -> Erase -> Space toggles it -> Tab reaches Clear once enabled', async ({
    page,
    browserName,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    // Clear is disabled and so is skipped by Tab (browsers do not focus disabled controls) —
    // draw a cell with the mouse first, while still in the default Draw mode, so the Tab walk
    // below has a real stop to land on.
    const box = await dish(dialog).boundingBox();
    if (box === null) throw new Error('preview dish canvas has no layout box');
    const point = cellCentre(box, 4, 4);
    await page.mouse.click(point.x, point.y);
    await expect(tool(dialog, 'Clear')).toBeEnabled();

    await tool(dialog, 'Draw').focus();
    await page.keyboard.press(tabKey);
    await expect(tool(dialog, 'Erase')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(tool(dialog, 'Erase')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(dialog, 'Draw')).toHaveAttribute('aria-pressed', 'false');

    await page.keyboard.press(tabKey);
    await expect(tool(dialog, 'Clear')).toBeFocused();
  });

  test('axe after a draw, settled', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    const box = await dish(dialog).boundingBox();
    if (box === null) throw new Error('preview dish canvas has no layout box');
    const point = cellCentre(box, 5, 5);
    await page.mouse.click(point.x, point.y);
    await expect(tool(dialog, 'Clear')).toBeEnabled();
    await page.waitForTimeout(300);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
});

test.describe('preview simulation (Story 4.15)', () => {
  // Local copies of the 4.14 block's helper shapes (the `PreviewCanvas`/`installFrameDriver`
  // precedent — copy across a feature split rather than reach into a sibling `describe`, so the
  // 4.14 block stays byte-identical). `deferred-work.md` records the pair as a hoist candidate.
  const preview = (dialog: Locator) => dialog.getByRole('region', { name: 'Preview & Test' });
  const dish = (dialog: Locator) => preview(dialog).getByRole('img', { name: /petri dish/i });
  const tool = (dialog: Locator, name: string) =>
    preview(dialog).getByRole('button', { name, exact: true });
  const transport = (dialog: Locator) =>
    preview(dialog).getByRole('group', { name: 'Simulation controls' });
  const run = (dialog: Locator, name: string) =>
    transport(dialog).getByRole('button', { name, exact: true });
  const cycle = (dialog: Locator) => preview(dialog).locator('[data-preview-cycle]');
  const box = (dialog: Locator) => dialog.locator('[data-preview-dish]');

  function cellCentre(
    boxRect: { x: number; y: number; width: number; height: number },
    col: number,
    row: number,
  ) {
    const cellSize = Math.floor(Math.min(boxRect.width / 30, boxRect.height / 20));
    const drawWidth = cellSize * 30;
    const drawHeight = cellSize * 20;
    const originX = boxRect.x + (boxRect.width - drawWidth) / 2;
    const originY = boxRect.y + (boxRect.height - drawHeight) / 2;
    return {
      x: originX + col * cellSize + cellSize / 2,
      y: originY + row * cellSize + cellSize / 2,
    };
  }

  async function distinctColorCount(canvas: Locator): Promise<number> {
    return canvas.evaluate((el) => {
      const canvasEl = el as HTMLCanvasElement;
      const ctx = canvasEl.getContext('2d');
      if (ctx === null) return 0;
      const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) {
        seen.add([data[i], data[i + 1], data[i + 2], data[i + 3]].join(','));
      }
      return seen.size;
    });
  }

  async function drawOneCell(page: Page, dialog: Locator, col: number, row: number) {
    const dishBox = await dish(dialog).boundingBox();
    if (dishBox === null) throw new Error('preview dish canvas has no layout box');
    const point = cellCentre(dishBox, col, row);
    await page.mouse.click(point.x, point.y);
  }

  test('the controls render at rest, no horizontal overflow, zero console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    await expect(run(dialog, 'Play')).toBeEnabled();
    await expect(run(dialog, 'Next cycle')).toBeEnabled();
    await expect(run(dialog, 'Stop & reset')).toBeEnabled();
    await expect(
      preview(dialog).getByRole('slider', { name: 'Generations per second' }),
    ).toHaveAttribute('aria-valuetext', '10 generations per second');
    await expect(cycle(dialog)).toHaveText('Cycle0000');
    await expect(box(dialog)).toHaveAttribute('data-status', 'paused');
    await expect(box(dialog)).toHaveAttribute('data-cycle', '0');

    // Compressed tier (1280): the column fits the wrapped cluster with no scroll.
    expect(await preview(dialog).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    expect(errors).toEqual([]);
  });

  test('full tier (≥ 1400): the Preview & Test region still has no horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    expect(await preview(dialog).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('draw one cell (zero rules) -> Play -> auto-pause at cycle 1 with an empty dish; tools disabled; Stop restores the sketch (AC2, AC4, AC7)', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    await drawOneCell(page, dialog, 5, 5);
    // The drawn-cell colour count, taken BEFORE Play — the oracle for "the dish went empty" is
    // relative to this (fewer distinct colours), not an absolute count: anti-aliased grid-line
    // pixels can already push a genuinely two-colour dish past a hardcoded "<= 2".
    const drawnCount = await distinctColorCount(dish(dialog));

    await run(dialog, 'Play').click();
    await expect(box(dialog)).toHaveAttribute('data-status', 'paused');
    await expect(box(dialog)).toHaveAttribute('data-cycle', '1');
    await expect(run(dialog, 'Play')).toBeVisible();

    await expect(tool(dialog, 'Draw')).toBeDisabled();
    await expect(tool(dialog, 'Erase')).toBeDisabled();
    await expect(tool(dialog, 'Clear')).toBeDisabled();
    await expect.poll(() => distinctColorCount(dish(dialog))).toBeLessThan(drawnCount);

    await run(dialog, 'Stop & reset').click();
    await expect(box(dialog)).toHaveAttribute('data-cycle', '0');
    // The drawn cell is back — proven by the enabled Clear (a fresh edit canvas repaints the
    // sketch with slightly different anti-aliasing than the original, so an exact colour-count
    // comparison is not the right oracle here; Clear's state already is one).
    await expect(tool(dialog, 'Clear')).toBeEnabled();
  });

  test('Next cycle from rest advances exactly one cycle and stays paused (FR-4.3)', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    await drawOneCell(page, dialog, 5, 5);

    await run(dialog, 'Next cycle').click();
    await expect(box(dialog)).toHaveAttribute('data-cycle', '1');
    await expect(box(dialog)).toHaveAttribute('data-status', 'paused');
    await expect(tool(dialog, 'Draw')).toBeDisabled();
    await expect(run(dialog, 'Next cycle')).toBeEnabled();

    await run(dialog, 'Stop & reset').click();
    await expect(box(dialog)).toHaveAttribute('data-cycle', '0');
  });

  // FR-4.2: no rules are authored here (the condition builder's own e2e path is 4.11/4.13's) —
  // the zero-rule draft dies at cycle 1, which is all this test needs to prove the speed change
  // took effect without a restart.
  test('speed: the slider is the ladder; a change while playing neither pauses nor resets (FR-4.2)', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const slider = preview(dialog).getByRole('slider', { name: 'Generations per second' });

    await slider.fill('0');
    await expect(slider).toHaveAttribute('aria-valuetext', '1 generation per second');
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', '20 generations per second');

    await drawOneCell(page, dialog, 5, 5);
    await slider.fill('0');
    await run(dialog, 'Play').click();
    // The first cycle at 1 gen/s is 1000 ms away — a generous window well short of it.
    await page.waitForTimeout(300);
    await expect(box(dialog)).toHaveAttribute('data-cycle', '0');
    await expect(box(dialog)).toHaveAttribute('data-status', 'playing');

    // A ref write, no restart: a restart would have re-cloned and stayed playing at cycle 0 for
    // another full second at the OLD speed.
    await slider.fill('4');
    await expect(box(dialog)).toHaveAttribute('data-status', 'paused');
    await expect(box(dialog)).toHaveAttribute('data-cycle', '1');
  });

  test('"+ Add Rule" blocks Play with the hint; "+ Add Condition" unblocks (AC6)', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    await dialog.getByRole('button', { name: '+ Add Rule' }).first().click();
    await expect(run(dialog, 'Play')).toBeDisabled();
    await expect(
      preview(dialog).getByText('Fix the rule errors to run the preview.'),
    ).toBeVisible();
    await expect(run(dialog, 'Stop & reset')).toBeEnabled();

    await dialog.getByRole('button', { name: '+ Add Condition' }).click();
    await expect(run(dialog, 'Play')).toBeEnabled();
    await expect(preview(dialog).getByText('Fix the rule errors to run the preview.')).toBeHidden();
  });

  test('isolation (M3): open, draw, Play, wait for the auto-pause, Stop, close leaves localStorage byte-identical; reopening shows a fresh dish and run', async ({
    page,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();

    const before = await page.evaluate(() => [
      localStorage.getItem('gol:organisms'),
      localStorage.getItem('gol:battles'),
    ]);

    let dialog = await openEditor(page);
    await drawOneCell(page, dialog, 5, 5);
    await run(dialog, 'Play').click();
    await expect(box(dialog)).toHaveAttribute('data-status', 'paused');
    await run(dialog, 'Stop & reset').click();

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();

    const after = await page.evaluate(() => [
      localStorage.getItem('gol:organisms'),
      localStorage.getItem('gol:battles'),
    ]);
    expect(after).toEqual(before);

    dialog = await openEditor(page);
    await expect(cycle(dialog)).toHaveText('Cycle0000');
    await expect(tool(dialog, 'Clear')).toBeDisabled();
  });

  test('keyboard: draw a cell; Tab from Clear reaches Play; Enter plays; the same button reads Pause then Play again; the walk continues to the slider', async ({
    page,
    browserName,
  }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    await drawOneCell(page, dialog, 5, 5);

    await tool(dialog, 'Clear').focus();
    await page.keyboard.press(tabKey);
    // `:focus` re-resolves to whatever currently has focus — the SAME DOM element across the
    // Play/Pause flip (3.12 FD1: one button, one element, the accessible name is what changes).
    const playPauseButton = dialog.locator(':focus');
    await expect(playPauseButton).toHaveAccessibleName('Play');

    await page.keyboard.press('Enter');
    await expect(box(dialog)).toHaveAttribute('data-status', 'playing');
    await expect(playPauseButton).toBeFocused();
    // The lone drawn cell has zero rules and dies at cycle 1 — the auto-pause.
    await expect(box(dialog)).toHaveAttribute('data-status', 'paused');
    await expect(playPauseButton).toHaveAccessibleName('Play');

    await page.keyboard.press(tabKey);
    await expect(run(dialog, 'Next cycle')).toBeFocused();
    await page.keyboard.press(tabKey);
    await expect(run(dialog, 'Stop & reset')).toBeFocused();
    await page.keyboard.press(tabKey);
    const slider = preview(dialog).getByRole('slider', { name: 'Generations per second' });
    await expect(slider).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuetext', '5 generations per second');
  });

  test('axe: at rest with the controls, and paused after the extinction', async ({ page }) => {
    await page.goto('/organisms');
    await expect(page.getByText("Conway's Classic")).toBeVisible();
    const dialog = await openEditor(page);

    let { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);

    await drawOneCell(page, dialog, 5, 5);
    await run(dialog, 'Play').click();
    await expect(box(dialog)).toHaveAttribute('data-status', 'paused');
    await page.waitForTimeout(300);

    ({ violations } = await new AxeBuilder({ page }).analyze());
    expect(violations).toEqual([]);
  });
});
