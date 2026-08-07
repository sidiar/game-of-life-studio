---
baseline_commit: aa32ccc
---

# Story 1.9: Clinical Lab Theme Tokens & App Shell

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the app to open into a polished Clinical Lab-styled shell,
so that the studio feels like a designed product from the first screen.

## Acceptance Criteria

1. **Given** the token layer, **When** defined, **Then** all `--gol-*` custom properties live in a dedicated CSS file under a `[data-theme]` block, covering the Clinical Lab spec (sans-serif, cyan accent, gray layers) (AR-36, UX-DR1 subset)
2. **Given** the MUI theme, **When** created, **Then** one immutable `createTheme()` references only `var(--gol-*)` tokens; MUI core only, per-component imports (AR-35/36)
3. **Given** the AR-46 lint rule, **When** the shell builds, **Then** zero raw color literals exist outside the token file and palette registry
4. **And** the `/` route renders the app chrome with navigation only to surfaces that exist (no dead links)
5. **And** Clinical Lab token pairs meet WCAG AA contrast (4.5:1 text / 3:1 controls), verified in-story (NFR-8.3)

## Tasks / Subtasks

- [x] **Task 1: Install MUI + Emotion** (AC: 2)
  - [x] From the repo root, add to **`apps/web`** `dependencies` (not root, not a package):

    ```
    npm i -w web @mui/material@^9.3.1 @mui/material-nextjs@^9.3.0 @emotion/react@^11.14.0 @emotion/styled@^11.14.1 @emotion/cache@^11.14.0
    ```

    - `@emotion/cache` is a **direct import** of `AppRouterCacheProvider` (`@mui/material-nextjs/v13-appRouter/appRouterV13.mjs:4`), not just an optional peer — omit it and the build fails on module resolution.
    - ❌ **No `@mui/icons-material`, no `@mui/x-*`, no `framer-motion`.** AR-35 bans the premium `x` packages outright; icons and Framer Motion have no consumer in this story and each is a bundle-budget event (see Task 7). The mockup's logo glyph is the text character `◉`.
  - [x] Verify `npm ls @mui/material @emotion/react` resolves without `ERESOLVE` and that `npm ci` from a clean `node_modules` still succeeds (`.npmrc` sets `engine-strict=true`; Node 24 is required).
  - [x] ⚠️ **The architecture says "MUI v6" and that number is now unusable — this story installs v9 and must say so in the Dev Agent Record.** `@mui/material-nextjs@6.5.0`'s `next` peer range caps at `^15.0.0`; this repo is on Next 16.2.10, so the v6 line ERESOLVE-fails on install. v7.3.11 and v9.3.1 both declare `next: ^16.0.0`. Project policy is caret-on-**current stable** with the architecture version as a floor (`project-context.md#Technology Stack`), and 9.3.1 is current stable (`npm view @mui/material dist-tags` → `latest: 9.3.1`, `latest-v6: 6.5.0`). AR-35's substance — **core only, no `@mui/x-*`, per-component imports** — is unchanged; only the major moves. Per-component deep imports (`@mui/material/Button`) are still first-class in v9: its `package.json` `exports` map declares 156 subpaths.

- [x] **Task 2: The `--gol-*` token layer** (AC: 1, 5)
  - [x] New file `apps/web/app/themes.css` — the dedicated token file NFR-8.4 requires. **One** `[data-theme]` block this story (Biotech Terminal is Story 6.1; do not stub it).
  - [x] Write the Clinical Lab block exactly as below. Every value is validated — the contrast numbers are in Task 6, the channel triplets are what MUI's `rgba(… / a)` state layers consume (Task 3).

    ```css
    /* Clinical Lab — the accessible default (NFR-8.3, assumption A-4). Values trace to
       ux-design-complete.md#Clinical Lab Theme and clinical-lab-theme/battle-gallery.html,
       with two WCAG-driven departures flagged inline. */
    :root[data-theme='clinical-lab'] {
      /* Surfaces */
      --gol-bg-primary: #0a0a0a;
      --gol-bg-secondary: #1a1a1a;
      --gol-bg-hover: #222222;

      /* Lines */
      --gol-border: #333333;
      --gol-border-control: #6e6e6e;

      /* Accent */
      --gol-accent: #00d4ff;
      --gol-accent-hover: #00e5ff;
      --gol-accent-active: #00a8cc;
      --gol-on-accent: #0a0a0a;
      --gol-accent-2: #00d4ff;

      /* Text */
      --gol-text-primary: #ffffff;
      --gol-text-secondary: #999999;
      --gol-text-tertiary: #8a8a8a;

      /* Type & shape */
      --gol-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
        sans-serif;
      --gol-letter-spacing-title: -0.5px;
      --gol-letter-spacing-body: 0;
      --gol-radius: 0px;

      /* Channel tokens — space-separated sRGB for the SAME colours above. MUI's
         cssVariables layer composes its hover/focus/selected state layers as
         rgba(var(--…-channel) / <alpha>); with no channel it warns at theme
         construction and every state layer silently renders transparent. */
      --gol-bg-primary-channel: 10 10 10;
      --gol-bg-secondary-channel: 26 26 26;
      --gol-accent-channel: 0 212 255;
      --gol-accent-2-channel: 0 212 255;
      --gol-text-primary-channel: 255 255 255;
      --gol-text-secondary-channel: 153 153 153;
      --gol-border-channel: 51 51 51;
    }
    ```

  - [x] Comment the **three departures from the UX spec** in the file, each naming the requirement that forced it (see Dev Notes "Spec conflicts surfaced"): `--gol-text-tertiary` raised `#666666 → #8a8a8a`; `--gol-border-control` added alongside `--gol-border`; `--gol-radius: 0px` (mockups) against RFC-003's `4px`.
  - [x] `--gol-accent-active` (`#00a8cc`) is a **new derived shade authored as its own token**, not computed — J.2 forbids JS colour math on theme values. It backs `primary.dark`, which MUI uses for the contained-button hover fill.
  - [x] Import it from `apps/web/app/layout.tsx` (`import './themes.css'`). Global CSS in App Router must be imported from a layout or component; a bare `<link>` is not the mechanism.
  - [x] ❌ **Do not add a channel token for every colour.** Only the seven above are consumed; the rest are dead weight that must stay in lockstep with a hex by hand.

- [x] **Task 3: The single MUI theme** (AC: 2, 3)
  - [x] New file `apps/web/lib/theme.ts` — module-scope `const golTheme = createTheme({…})`, created **once**, exported as a `const`. No factory function, no second object, no `useMemo` wrapper. Decision J's whole claim is that `ThemeProvider` never receives a new identity.
  - [x] ⚠️ **RFC-003's theme snippet does not run.** `createTheme({ palette: { primary: { main: 'var(--gol-accent)', contrastText: … } } })` **throws** `MUI: Unsupported \`var(--gol-accent)\` color` — MUI's `augmentColor` derives `light`/`dark` via `lighten()`/`darken()`, which cannot parse a `var()` string. Verified against both 6.5.0 and 9.3.1; this is not a version regression, the snippet was never executable. **Two things fix it together, and you need both:**
    1. Supply `light`, `dark`, **and** `contrastText` explicitly for every palette colour, so nothing is derived.
    2. Set **`cssVariables: true`**. Without it, `<Button>` still throws at *render* (not construction) from `alpha(theme.palette.primary.main, …)` inside its variant styles — every variant, plus `IconButton`. With it, MUI emits `rgba(var(--mui-palette-primary-mainChannel) / …)` as CSS and performs no JS colour math at all.
  - [x] Write it as:

    ```ts
    const golTheme = createTheme({
      // Not a deviation from Decision J — the thing that makes Decision J implementable.
      // MUI emits `--mui-palette-*: var(--gol-*)` once at :root and its components read
      // `var(--mui-…, var(--gol-…))`, so a data-theme flip still propagates through both
      // layers by pure CSS recomputation. Without this, <Button> throws on render (see
      // Dev Notes trap 1). This is NOT MUI's `colorSchemes` mode, which J.1 rejects.
      cssVariables: true,
      palette: {
        mode: 'dark', // constant — both themes are dark (J.2)
        background: {
          default: 'var(--gol-bg-primary)',
          defaultChannel: 'var(--gol-bg-primary-channel)',
          paper: 'var(--gol-bg-secondary)',
          paperChannel: 'var(--gol-bg-secondary-channel)',
        },
        primary: {
          main: 'var(--gol-accent)',
          mainChannel: 'var(--gol-accent-channel)',
          light: 'var(--gol-accent-hover)',
          dark: 'var(--gol-accent-active)',
          contrastText: 'var(--gol-on-accent)',
        },
        secondary: {
          main: 'var(--gol-accent-2)',
          mainChannel: 'var(--gol-accent-2-channel)',
          light: 'var(--gol-accent-2)',
          dark: 'var(--gol-accent-2)',
          contrastText: 'var(--gol-on-accent)',
        },
        text: {
          primary: 'var(--gol-text-primary)',
          primaryChannel: 'var(--gol-text-primary-channel)',
          secondary: 'var(--gol-text-secondary)',
          secondaryChannel: 'var(--gol-text-secondary-channel)',
          disabled: 'var(--gol-text-tertiary)',
        },
        divider: 'var(--gol-border)',
        dividerChannel: 'var(--gol-border-channel)',
      },
      typography: { fontFamily: 'var(--gol-font)' },
      components: {
        // Radius goes through styleOverrides, not shape.borderRadius: MUI does arithmetic
        // on the numeric shape value, which a var() string cannot support (RFC-003 Decision 2).
        MuiPaper: { styleOverrides: { root: { borderRadius: 'var(--gol-radius)' } } },
        MuiButton: {
          styleOverrides: { root: { borderRadius: 'var(--gol-radius)', textTransform: 'none' } },
        },
      },
    });
    ```

    That exact set of seven `*Channel` keys is the **minimum that silences every MUI construction warning** — verified by running `createTheme` with each omitted. Dropping one is not a style choice; it turns off a state layer.
  - [x] `theme.ts` must contain **zero hex literals** and must **not** be added to the AR-46 `ignores` list in `eslint.config.mjs`. If a whitelist entry seems necessary, the token layer was bypassed.
  - [x] Tests (`apps/web/lib/theme.test.ts`):
    - `createTheme` at import time does not throw (module import alone proves construction; assert on a value so the import is not tree-shaken).
    - Every leaf of `palette.background`, `palette.primary`, `palette.secondary`, `palette.text`, plus `divider` and `typography.fontFamily`, is a string matching `/^var\(--gol-/`. Walk the object — an enumerated list of six assertions drifts the moment someone adds a colour.
    - `golTheme` is referentially identical across two imports (`await import` twice → `toBe`). This is the Decision J invariant a future refactor to `createTheme()`-in-a-function would silently break.
    - Render `<ThemeProvider theme={golTheme}><Button variant="contained"/><Button variant="text"/><Button variant="outlined"/><IconButton/></ThemeProvider>` and assert it does not throw. **This is the regression test for trap 1** — without it, removing `cssVariables: true` still passes every other test in this story and breaks the first story that renders a button (1.13).

- [x] **Task 4: Providers + root layout** (AC: 2, 4)
  - [x] New file `apps/web/components/AppProviders.tsx`, `'use client'`. Composition, outermost first:

    ```tsx
    <AppRouterCacheProvider options={{ key: 'gol' }}>
      <ThemeProvider theme={golTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
    ```

    - Import from `@mui/material-nextjs/v16-appRouter` — the subpath matching Next 16. It re-exports the v13 implementation; the versioned path is the supported entry point.
    - **Why it is not optional here.** `output: 'export'` prerenders every route at build time, so Emotion runs on the server. Without the cache provider Emotion emits a `<style>` tag per component during SSR and re-inserts on hydration — visible unstyled flash on the static host, and the FOUC guarantee (NFR-8.5) that Story 6.5 formalises starts out already broken.
  - [x] Rewrite `apps/web/app/layout.tsx` (stays a **server** component — do not add `'use client'`):
    - `import './themes.css'` at the top.
    - `<html lang="en" data-theme="clinical-lab">`.
    - `<body><AppProviders><AppShell>{children}</AppShell></AppProviders></body>`.
  - [x] ⚠️ **The `data-theme` attribute is hardcoded this story, and that is the correct scope.** AR-37's FOUC inline script belongs to **Story 6.5**, and it cannot be written usefully yet: there is one theme, so there is nothing to read from `gol:settings` and nothing to flash. Hardcoding satisfies NFR-8.2's "applied via data attribute on root element" with zero script. ❌ Do not read `gol:settings` in the layout, do not add an inline `<script>`, do not add `suppressHydrationWarning`.
  - [x] ❌ **No `InitColorSchemeScript`, no `defaultMode`, no `colorSchemes`.** `cssVariables: true` alone does not require them, and MUI's colour-scheme machinery is exactly what J.1 rejects.

- [x] **Task 5: The app shell chrome** (AC: 3, 4)
  - [x] New file `apps/web/components/AppShell.tsx`, `'use client'`. Structure from `clinical-lab-theme/battle-gallery.html:474-484`:

    ```
    <header>  logo ("◉ Game of Life Studio", ◉ in --gol-accent) …… <AppNav />
    <main>    {children}
    ```

    Semantic elements, one `<main>` landmark, `<nav>` around the links. The header rule is `border-bottom: 2px solid var(--gol-border)`.
  - [x] New file `apps/web/components/AppNav.tsx`, `'use client'`. A module-level registry, not inline JSX:

    ```ts
    // AC4 / the no-dead-affordance rule: an entry appears here only once its route exists.
    // Organisms joins in Story 4.1, Settings in Story 5.1 — each is one line here.
    const NAV_ITEMS = [{ href: '/', label: 'Battles' }] as const;
    ```

    Render `next/link` per entry; mark the active one from `usePathname()` with `aria-current="page"` **and** the accent styling. Exactly one link renders this story.
  - [x] **Styling mechanism: `styled()` from `@mui/material/styles` on semantic elements** (`styled('header')`, `styled('nav')`, `styled('a')`), referencing `var(--gol-*)` only.
    - ❌ **Not `AppBar`/`Toolbar`/`Container`.** They cost ~10 KB gzip on a budget with ~19 KB left (Task 7) and bring fixed positioning, elevation shadows, and Material spacing that the mockup's plain flex header has none of — every one of which would then need overriding back off.
    - ❌ **Not CSS Modules.** RFC-003 Decision 3 fixes Emotion as the styling engine and says static styles go through `styled()`; a second styling system for a header is churn, and it splits where a future component's styles live.
    - ❌ **Not `sx` for these.** `sx` is for genuinely dynamic per-instance values (RFC-003 Decision 3); static chrome through `sx` re-resolves per render.
  - [x] Trim `apps/web/app/page.tsx` to the page's own content — the `<h1>Game of Life Studio</h1>` moves into the shell header, so the page must not render a second one. Keep `createRepositories()` + `useWorkspaceSeed` and the `workspace: {status}` line **exactly as they are**: `page.test.tsx` and `e2e/home.spec.ts` assert on `workspace: ready`, and the Story 1.5/1.6 seeding proofs run through them. Give the page an `<h1>` of its own (`Battle Gallery`, per the mockup's `.section-title`) so the document keeps exactly one h1 and axe stays green.
  - [x] Update `apps/web/app/page.test.tsx`: its two structural assertions (`heading level 1 name 'Game of Life Studio'`, `'Battle Gallery coming soon.'`) move to the shell's own test or to the new heading text. **Do not delete the four seeding tests or the StrictMode test** — they are the only reproduction of the Story 1.5 review regression.
  - [x] Tests (`apps/web/components/AppShell.test.tsx`, `AppNav.test.tsx`):
    - Shell renders one `banner`, one `navigation`, one `main` landmark; the logo text is present.
    - `AppNav` renders exactly **one** link, to `/`, labelled `Battles`, carrying `aria-current="page"`. Assert the **count** — a test that only checks `Battles` exists passes just as well after someone adds a dead `Settings` link, which is the exact failure AC4 exists to prevent.
    - `axe(container)` returns zero violations for the shell.
    - ⚠️ `usePathname()` throws outside an App Router context under RTL — `vi.mock('next/navigation', () => ({ usePathname: () => '/' }))` at the top of `AppNav.test.tsx`. Without it the test file fails on render with an error that reads like a component bug.

- [x] **Task 6: WCAG AA verification** (AC: 5)
  - [x] New file `apps/web/lib/themeTokens.test.ts`. It must **parse `apps/web/app/themes.css`** (`readFileSync` + a `--gol-([a-z0-9-]+):\s*(#[0-9a-f]{6})` sweep) and assert over what it finds. ⚠️ A test that re-declares the hexes in TypeScript passes forever after someone edits the CSS — it verifies a copy, not the theme.
  - [x] Reuse `contrastRatio` from `apps/web/lib/paletteCvd.ts` (Story 1.7). ❌ Do not re-implement relative luminance; ❌ do not add a colour library.
  - [x] Classify every pair, because WCAG applies different thresholds to different roles — assert all three groups:
    - **Text pairs → ≥ 4.5:1** (SC 1.4.3): each of `text-primary`, `text-secondary`, `text-tertiary`, `accent` against each of `bg-primary`, `bg-secondary`, `bg-hover`; and `on-accent` against each of `accent`, `accent-hover`, `accent-active`.
    - **Control pairs → ≥ 3:1** (SC 1.4.11): `border-control` and `accent` (the focus ring) against each of the three backgrounds.
    - **Decorative** — `border` against the backgrounds is deliberately **excluded and commented as excluded**. SC 1.4.11 covers boundaries needed to *identify* a control; a divider or card edge is not one. `#333333` measures 1.57:1 and asserting 3:1 on it would force the mockup's entire line treatment to change for no accessibility gain. That is why `--gol-border-control` exists as a separate token.
  - [x] Every pair passes at the Task 2 values. Recorded reference figures — if a run disagrees, the token file drifted:

    | Pair | Ratio | Needs |
    |---|---|---|
    | text-primary / bg-primary | 19.80 | 4.5 |
    | text-primary / bg-hover | 15.91 | 4.5 |
    | text-secondary / bg-hover | 5.58 | 4.5 |
    | text-tertiary / bg-primary | 5.73 | 4.5 |
    | text-tertiary / bg-hover | **4.61** | 4.5 |
    | accent / bg-hover | 8.99 | 4.5 |
    | on-accent / accent-active | 7.05 | 4.5 |
    | border-control / bg-hover | **3.12** | 3 |
    | accent / bg-primary (focus) | 11.18 | 3 |

    The two bolded rows are the binding constraints — `--gol-text-tertiary` cannot go below `#828282` and `--gol-border-control` cannot go below `#666666` without failing.
  - [x] New doc `docs/implementation-artifacts/clinical-lab-contrast-validation.md`, following the `palette-cvd-validation.md` format: the reproduce command (path-relative to `apps/web`, and state that), the method, the full pair table with ratios, and the three departures from the UX spec with their justification. ⚠️ **Run the command you write in that doc.** Story 1.7's equivalent shipped a command that matched zero files and exited 0.

- [x] **Task 7: Full gate + bundle budget** (AC: 1–5)
  - [x] New e2e `apps/web/e2e/appShell.spec.ts` — the only place the token layer is proven to actually *apply*, since jsdom does not compute CSS custom properties:
    - `<html>` carries `data-theme="clinical-lab"`.
    - `getComputedStyle(document.body).backgroundColor` is `rgb(10, 10, 10)` — proves `themes.css` shipped, resolved, and reached MUI's `CssBaseline` through both variable layers.
    - The nav contains exactly one link.
    - `AxeBuilder` reports zero violations — the real-browser run is what actually checks rendered colour-contrast, which the component-level `vitest-axe` cannot.
    - Zero console errors on load (the existing `home.spec.ts` pattern). Emotion hydration mismatches surface here and nowhere else.
  - [x] Run `npm run ci` (typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e) and record the actual result. ⚠️ Green `npm test` has been misleading in four consecutive stories; MUI + a global CSS import + a server/client boundary change is precisely the shape of change that only breaks at `build:standalone`.
  - [x] ⚠️ **The bundle gate is the real risk in this story.** Baseline is **246.7 KB gzip against a 300 KB budget — 53.3 KB of headroom** (Story 1.8 Dev Agent Record). Measured cost of the shell as scoped (`ThemeProvider` + `CssBaseline` + `cssVariables` theme + `AppRouterCacheProvider` + `styled`, react/next external): **~35 KB gzip**, landing around **~281 KB with ~19 KB left** for Stories 1.10–1.13. Swapping in `AppBar`/`Toolbar`/`Container`/`Button` measures ~44 KB and leaves ~9 KB.
    - Record the exact figure `npm run bundle:check` prints in the Dev Agent Record.
    - If it exceeds 300 KB: **do not raise the budget.** Drop MUI components for semantic elements + `styled()` (which is the scoped design) and re-measure. `npm run analyze -w web` opens the treemap.
  - [x] Verify `npx eslint apps/web` is clean with **no new entry** in `eslint.config.mjs`'s AR-46 `ignores` (AC3). Sanity-check the rule still bites by temporarily pasting `#0a0a0a` into `AppShell.tsx` and confirming it fails.
  - [x] Update `docs/project-context.md`: the "Planned, NOT yet installed" table says MUI lands in **Epic 2** and pins **v6** — both are now wrong. Move it to installed, record the actual version, and note the `cssVariables` requirement so no later story tries the RFC-003 snippet again.

## Dev Notes

### Decisions this story is forced to make (flag them in the Dev Agent Record)

1. **⚠️ MUI major: the architecture's v6 is not installable on this repo.** `@mui/material-nextjs@6.5.0` declares `next: ^13 || ^14 || ^15`; the repo is on Next 16.2.10. v9.3.1 is current stable and declares `^16`. Installing v9 keeps every AR-35 constraint that matters (MIT core only, no `@mui/x-*`, per-component imports — v9 ships a 156-entry `exports` map, so deep imports are first-class) and follows the project's own caret-on-current-stable rule with the architecture version as a floor. **Fallback if v9 misbehaves: 7.3.11**, which also declares `next: ^16`. Surface the deviation; do not silently install v6 and fight the resolver.

2. **⚠️ `cssVariables: true` is required, and it is not the `colorSchemes` mode J.1 rejects.** RFC-003's theme snippet throws — twice, for two different reasons (see trap 1). Enabling `cssVariables` makes MUI emit `--mui-palette-*: var(--gol-*)` once and read `var(--mui-…, var(--gol-…))` everywhere, so all colour math becomes CSS `rgba(… / a)` instead of JS `alpha()`. Verified end-to-end: the emitted stylesheet is literally `:root{--mui-palette-primary-main:var(--gol-accent);--mui-palette-primary-mainChannel:var(--gol-accent-channel);…}` and Button's hover is `--variant-textBg:rgba(var(--mui-palette-primary-mainChannel) / calc(…))`. A `data-theme` flip recomputes both layers by pure CSS. Decision J's user-visible contract — one immutable theme, one attribute flip, no React render — holds exactly. What J.1 rejects is MUI's **`colorSchemes`** light/dark scheme API, which this does not use.

3. **⚠️ `data-theme` is a hardcoded attribute this story, not a script.** AR-37's FOUC script is Story 6.5's AC and has nothing to read until a second theme exists. Hardcoding `<html data-theme="clinical-lab">` satisfies NFR-8.2 and costs zero bytes. Adding the script now would mean shipping a `gol:settings` read whose only possible answer is the default, plus the `suppressHydrationWarning` that comes with it.

4. **⚠️ Chrome is semantic HTML + `styled()`, not `AppBar`/`Toolbar`/`Container`.** Measured: the Material components cost ~9 KB gzip more on a budget with ~19 KB left after this story, and the mockup's header is a plain flex row with a 2px bottom rule — no elevation, no fixed positioning, no Material density. The overrides needed to undo those defaults would exceed the code they replace. This narrows RFC-003's "MUI covers all surrounding UI chrome" for the shell specifically; components with real behaviour (Dialog in 1.13, Select/Autocomplete in Epic 2, Slider in Epic 4) still come from MUI, which is where its accessibility value actually lives.

5. **⚠️ The `<h1>` moves from the page to the shell, and one has to be given up.** The header logo and the Gallery's `.section-title` are both h1-sized in the mockup, but two `<h1>`s trip axe. Resolution: the header logo is a styled `<div>`/`<span>` (it is a wordmark, not a document heading), and `<h1>` stays on the page as "Battle Gallery". `page.test.tsx`'s current assertion on `heading level 1 name 'Game of Life Studio'` must move, not be deleted.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

- **⚠️ Two `--gol-*` naming schemes exist.** RFC-003's snippet uses `--gol-bg` / `--gol-surface` / `--gol-text` / `--gol-text-2` / `--gol-divider`; Story 1.8's notes and the UX mockups use `--gol-bg-primary` / `--gol-border`. **Resolution: the UX-semantic names win** (`bg-primary`/`bg-secondary`/`bg-hover`, `text-primary`/`-secondary`/`-tertiary`, `border`). RFC-003's set is lossy — it has two background layers and two text levels where the UX spec has three of each — and Decision J mandates only "app-owned `--gol-*` properties per `[data-theme]` block", not specific names. Nothing in shipped code references any `--gol-*` name yet (Story 1.8's renderer takes injected colour strings), so this is free to fix now and expensive later. Flag it for the next RFC-003 touch.

- **⚠️ `--gol-radius`: RFC-003 says `4px` for Clinical Lab; every UX mockup renders `0`.** `ux-design-complete.md#Clinical Lab Theme` states "Border radius: 0 (sharp corners)" for cards, and no button, input, or card in `clinical-lab-theme/*.html` sets a radius. **Resolution: follow the mockups (`0px`)** — they are the visual authority for the theme's appearance and the RFC number appears only inside an illustrative snippet. Note the knock-on: Decision J.1 cites "radius (4 vs 0)" as one reason the two themes cannot be MUI colour schemes; with both at 0 that argument now rests on typography and `components.styleOverrides` alone, which is still sufficient. Flag for the next RFC-003 / architecture touch.

- **⚠️ The UX spec's Clinical Lab palette does not meet WCAG AA, which AC5 requires.** Measured with the Story 1.7 `contrastRatio`: `--text-tertiary #666666` is **3.45:1** on `#0a0a0a` and **3.03:1** on `#1a1a1a` — it is body/metadata/placeholder text and needs 4.5:1. `--border #333333` is **1.57:1** and **1.38:1** — below the 3:1 that SC 1.4.11 requires *of a control's own boundary*. **Resolution, two moves:** raise `--gol-text-tertiary` to `#8a8a8a` (5.73 / 5.04 / 4.61 — passes on all three backgrounds; `#828282` is the true floor), and **split the line token** rather than repaint every divider: `--gol-border` (`#333333`) stays for decorative dividers and card edges, which SC 1.4.11 does not cover, and a new `--gol-border-control` (`#6e6e6e`, 3.88 / 3.41 / 3.12) carries the boundary of inputs and outlined controls, where it does. Record both in the validation doc — Story 1.10's search input and metadata rows are the first consumers, and they will fail their own axe check if this is deferred.

- **⚠️ `project-context.md` says MUI lands in Epic 2.** It lands here, Story 1.9, Epic 1 — the table is stale, not a scope statement. Task 7 fixes it.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **`createTheme` with `var()` palette values throws — the RFC's own snippet is the failing case.** Two independent throws: at *construction* if `light`/`dark` are omitted (`augmentColor` → `lighten()`/`darken()`), and at *render* of the first `<Button>` or `<IconButton>` if `cssVariables` is off (`alpha()` in the variant styles). The second is the dangerous one: `CssBaseline`, `AppBar`, `Toolbar`, `Typography`, `Paper`, `Card`, `Divider`, `TextField`, `Dialog`, and `Tooltip` all render **fine** without `cssVariables`. A shell built from those looks completely correct and detonates in Story 1.13, in a file that changed nothing. The Task 3 button-render test is the guard.
- ⚠️ **Omitting a `*Channel` token is a warning, not an error, and the failure is invisible.** MUI logs `Can't create palette.primaryChannel…` at construction and then composes every hover/focus/selected state layer as `rgba( / 0.08)` — transparent. The UI simply has no interaction feedback, and nothing fails. The seven keys in Task 3 are the exact minimum; each was verified by omission.
- ⚠️ **A channel token is space-separated sRGB, not a hex and not `rgb()`.** `--gol-accent-channel: 0 212 255`. Writing `#00d4ff` or `rgb(0,212,255)` produces `rgba(#00d4ff / 0.08)`, which is an invalid declaration the browser drops silently.
- ⚠️ **`ThemeProvider` cannot live in the server layout.** Emotion has no RSC support; `AppProviders` needs `'use client'`, and so does anything using `styled()` or `sx`. `layout.tsx` itself stays a server component — adding `'use client'` there is the reflexive fix and it drags `metadata` export into an illegal position.
- ⚠️ **Without `AppRouterCacheProvider`, styles still "work" in dev.** `next dev` streams them in. The failure appears only in `build:standalone` + the served export, as an unstyled flash and duplicated `<style>` tags — which is also the only place the e2e runs.
- ⚠️ **`usePathname()` throws under RTL** with no App Router context. Mock `next/navigation` in `AppNav.test.tsx`. The thrown error names React internals, not the router, so it reads as a component bug.
- ⚠️ **A nav test that asserts "Battles is present" passes with dead links added.** AC4 is a *count* assertion. Same for the e2e.
- ⚠️ **`page.test.tsx` and `e2e/home.spec.ts` assert on text this story moves.** `'Game of Life Studio'` as an h1 and `'Battle Gallery coming soon.'` both change. Update the assertions; **do not** delete the seeding, StrictMode, or AR-45 dev-fixture tests around them — the StrictMode one is the sole reproduction of a review regression where `npm run ci` was fully green while `npm run dev` hung on "workspace: seeding" forever.
- ⚠️ **Global CSS must be imported from a layout/component.** `import './themes.css'` in `layout.tsx`. A `<link>` tag in the JSX is not processed and yields no tokens, and every colour then falls back to MUI's defaults — a blue-accented Material app that looks deliberate.
- ⚠️ **`--gol-border` at 1.57:1 will tempt an "accessibility fix" that repaints every divider.** It is excluded by role, not by oversight. Comment the exclusion in the test, or the next reviewer will "fix" it.

### Previous story intelligence (1.5–1.8)

- **`npm run ci` is where cross-package breakage surfaces, not `npm test`.** Four stories running: 1.4 broke on `build:standalone`, 1.5 on `npm run dev` (StrictMode), 1.7 shipped a doc command matching zero files that exited 0, 1.8 was clean only because it ran the whole gate. This story adds a dependency, a global stylesheet, and a server/client boundary — the three highest-risk shapes for that pattern.
- **Story 1.6's, 1.7's, and 1.8's reviews all hunted ticked-but-unshipped subtasks.** The equivalents here: the button-render test in Task 3 (trivial to tick, and the *only* thing proving `cssVariables`), the nav **count** assertion, and the AR-46 negative check. Open the file before ticking.
- **Comment convention:** every non-obvious line carries a WHY naming the failure it prevents, citing the governing id — `(Decision J)`, `(J.2)`, `(AR-36)`, `(NFR-8.3)`, `(SC 1.4.11)`. The `cssVariables: true` line, each channel token block, the three UX departures, the `--gol-border` / `--gol-border-control` split, and the hardcoded `data-theme` each need one. **No review artefacts in code.**
- **`apps/web/vitest.config.mts` aliases `@`** → use `@/lib/…`, `@/components/…`. It excludes `scripts/**` and `e2e/**`.
- **Test-only modules are marked by doc comment, not by lint** (`paletteCvd.ts`, `recordingContext2d.ts`). `themeTokens.test.ts` importing `paletteCvd` from a test file is exactly the intended use.
- **`vitest-axe`'s `toHaveNoViolations` matcher is deliberately not wired** (Vitest 4 type conflict). Use `const results = await axe(container); expect(results.violations).toEqual([])` — the existing `page.test.tsx` pattern.
- **`apps/web` has no coverage gate** by design (RFC-008 Decision 3). Do not write tests to move the number.
- **Commit gate stands:** present the file list and a suggested message, then wait for Sidiar. Approval never carries between commits.

### What NOT to build (scope boundaries)

- ❌ **The Biotech Terminal `[data-theme]` block** — Story **6.1**. One block this story. Adding an empty second block invites half-populated tokens.
- ❌ **The FOUC inline script, theme selector cards, `gol:settings` theme read/write, instant-switch wiring** — Stories **6.3/6.4/6.5**.
- ❌ **Battle tiles, sorting, thumbnails, empty state, delete dialog** — Stories **1.10–1.13**. This story ships chrome; `page.tsx` keeps its placeholder body.
- ❌ **`/organisms` and `/settings` routes or nav entries** — Stories **4.1** and **5.1**. AC4 is precisely the promise that they are absent.
- ❌ **Wiring `--gol-*` into `GridRenderer`** — no route mounts a canvas until Story **1.11**. Its colours stay injected constructor arguments.
- ❌ **`@mui/icons-material`, `framer-motion`, `@mui/x-*`, a CSS-in-JS alternative, Pigment CSS.** RFC-003 Risk 3 lists Pigment as a *future* migration path contingent on profiling.
- ❌ **Grid-lines / cell-animation / default-size settings UI** — Epic **6**.
- ❌ **Raising `BUDGET_GZIP_KB` in `scripts/check-bundle-size.mjs`.** If the gate fails, the shell is too heavy; the budget is the constraint, not the variable.

### Project Structure Notes

```
apps/web/
  app/
    themes.css              --gol-* token layer, [data-theme='clinical-lab'] block        [new]
    layout.tsx              data-theme attr, themes.css import, AppProviders + AppShell   [modify]
    page.tsx                keeps seeding wiring; h1 -> "Battle Gallery"                  [modify]
    page.test.tsx           structural assertions updated; seeding tests untouched        [modify]
  components/                                                                             [new dir]
    AppProviders.tsx        'use client' — AppRouterCacheProvider + ThemeProvider + CssBaseline
    AppShell.tsx            'use client' — header (logo + nav) + <main>
    AppShell.test.tsx
    AppNav.tsx              'use client' — NAV_ITEMS registry, usePathname active state
    AppNav.test.tsx
  lib/
    theme.ts                the single module-scope createTheme()                          [new]
    theme.test.ts                                                                          [new]
    themeTokens.test.ts     parses themes.css, asserts the WCAG pair table                 [new]
  e2e/
    appShell.spec.ts        data-theme, computed bg, nav count, axe, console               [new]
  package.json              + @mui/material, @mui/material-nextjs, 3x @emotion            [modify]

docs/implementation-artifacts/clinical-lab-contrast-validation.md                          [new]
docs/project-context.md     MUI moved from "planned, Epic 2" to installed                  [modify]
```

`apps/web/components/` is the location RFC-001's repository structure prescribes. Component files are **PascalCase `.tsx`**; non-component TS is **camelCase, never dotted**. No `eslint.config.mjs` change — if an AR-46 whitelist entry seems necessary, the token layer was bypassed. Everything is in `apps/web`: `packages/*` have no `dom` lib and no React by design.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.9] — story statement + the five ACs verbatim
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-35** (MUI core only, no `@mui/x-*`, per-component imports, dynamic import for heavy components), **AR-36** (one immutable `createTheme()` over `var(--gol-*)`, `data-theme` flip, dedicated token file), **AR-37** (FOUC script — Story 6.5, not here), **AR-38** (animation strategy), **AR-46** (no raw colour literals)
- [Source: docs/planning-artifacts/epics.md#Story 4.1 / 5.1] — Organisms and Settings each add their own nav entry; "no dead links" is stated in both
- [Source: docs/planning-artifacts/epics.md#Story 6.1 / 6.3 / 6.4 / 6.5] — the Biotech block, selector cards, instant switch, and FOUC script this story must leave alone; 6.1's "zero component files change" is the test of whether this story's token layer is complete
- [Source: docs/planning-artifacts/architecture.md#Decision J] — one immutable theme + app-owned `--gol-*` layer; **J.1** (why not `colorSchemes`), **J.2** (no JS colour math, explicit `contrastText`, `palette.mode` constant `'dark'`), **J.3** (theme preference lives in `gol:settings`, no second key), **J.4** (NFR-8.2/8.4/8.5 satisfied by construction)
- [Source: docs/planning-artifacts/architecture.md#Cross-RFC Reconciliation 4/5] — App Router is canonical; NFR-8.3 relaxed so **Clinical Lab** carries the AA guarantee and Biotech does not
- [Source: docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md#Decision 1] — MUI core, MIT, no `@mui/x-*`; per-component import discipline; the Canvas grid stays outside MUI
- [Source: docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md#Decision 2] — the token-layer + single-theme design, the `themes.css` block, and the theme snippet whose palette values **throw** (see traps); radius via `styleOverrides` not `shape.borderRadius`
- [Source: docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md#Decision 3] — Emotion is the styling engine; `sx` for dynamic values only, `styled()`/`styleOverrides` for static
- [Source: docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md#Decision 5 / Risk 1] — Clinical Lab is the AA-compliant default; bundle mitigations (per-component imports, no premium packages, dynamic imports, ~300 KB budget)
- [Source: docs/planning-artifacts/prds/…/prd.md#NFR-8.1–8.5] — CSS custom properties, no hard-coded colours in components, `data-theme` on the root element, 4.5:1 / 3:1, dedicated CSS files, theme before first paint
- [Source: docs/planning-artifacts/ux-designs/…/ux-design-complete.md#Clinical Lab Theme] — the full token spec, button/toggle/card treatments, "border radius: 0", and the CSS-variable strategy
- [Source: docs/planning-artifacts/ux-designs/…/clinical-lab-theme/battle-gallery.html:8-90, 470-490] — the shell's actual chrome: header flex row with `2px` bottom rule, `◉` logo with accent glyph, uppercase 14px nav items, `.nav-item.active` = accent text + border + `--bg-secondary`
- [Source: docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md#5] — repository structure: `apps/web/app/` + `apps/web/components/`
- [Source: docs/implementation-artifacts/1-8-gridrenderer-static-core.md#Dev Notes] — the injected-colour constructor parameter awaiting `--gol-bg-primary` / `--gol-border`, and the `npm run ci` / ticked-but-unshipped lessons
- [Source: docs/implementation-artifacts/1-7-palette-token-registry-display-color-lut.md] — organism colours are **not** theme tokens (RFC-007 Decision 5); the two systems must not reference each other
- [Source: docs/implementation-artifacts/palette-cvd-validation.md] — the format and the "run the command you document" lesson for the new contrast doc
- [Source: apps/web/lib/paletteCvd.ts:45-74] — `relativeLuminance` / `contrastRatio`, WCAG-linearised; reuse, do not reimplement
- [Source: apps/web/app/layout.tsx, app/page.tsx, app/page.test.tsx, e2e/home.spec.ts] — the exact files this story rewrites and the assertions that must survive
- [Source: eslint.config.mjs:70-100] — the AR-46 `no-restricted-syntax` colour block and its file-granular `ignores`
- [Source: scripts/check-bundle-size.mjs] — the 300 KB gzip first-load gate this story is measured against
- [Source: docs/project-context.md] — one immutable theme; version policy (architecture floor, confirm current stable at install); camelCase filenames; the commit gate

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Code)

### Debug Log References

- `npm i -w web @mui/material@^9.3.1 @mui/material-nextjs@^9.3.0 @emotion/react@^11.14.0 @emotion/styled@^11.14.1 @emotion/cache@^11.14.0` — clean resolve, `npm ls` confirms 9.3.1/9.3.0/11.14.0/11.14.1 with no ERESOLVE (forced decision 1).
- `npx vitest run lib/theme.test.tsx` — all 5 pass, including the Task 3 button-render regression guard (trap 1).
- **New TS typing trap found and fixed (not in the story text):** `createTheme`'s exported `ThemeOptions` (MUI 9.3.1) redeclares `palette?: PaletteOptions` — the plain, non-`*Channel` shape — directly in its own body, which wins over whatever `cssVariables: true` might otherwise unlock via `ColorSystemOptions`. Passing the Task 3 palette object as an inline literal fails `tsc` with `TS2353` on every `*Channel` key (verified: `@mui/material/themeCssVarsAugmentation`, MUI's own documented augmentation for this, does **not** fix it — the typed Channel fields exist only under `colorSchemes.{light,dark}.palette`, the `extendTheme`/CssVarsProvider API J.1 rejects). Fix: declare the palette object as its own `const` (inferred type, not an inline literal) before passing it to `createTheme()` — TypeScript's excess-property check only fires on object literals checked directly against a target type, not on an already-typed variable passed by reference. Zero `as`/`@ts-expect-error` escapes needed. See `apps/web/lib/theme.ts`'s block comment.
- **`palette.text.icon` gap found via the Task 3 walk-the-object test:** left unset, MUI fills it with its own dark-mode default (`rgba(255, 255, 255, 0.5)`) — a raw literal AR-46 can't catch because it never appears in source. Set explicitly to `var(--gol-text-secondary)`.
- `npm run typecheck` / `npm run lint` / `npm run format:check` — all clean from repo root after fixing the above and running `prettier --write` on `themes.css` (long `--gol-font` line) and `page.test.tsx` (long assertion line).
- AR-46 sanity check (Task 7): temporarily added `background: '#0a0a0a'` to `AppShell.tsx`'s `Header` — `no-restricted-syntax` fired as expected; reverted before committing.
- `npm run test:coverage`: 295 tests total, all passing (web: 210, domain: 85, persistence: not re-listed but green, test-utils: 75). `apps/web` has no coverage gate by design (RFC-008 Decision 3).
- `npm run build:standalone`: clean static export, 3/3 pages.
- `npm run bundle:check`: **281.4 KB gzip / 300 KB budget, 18.6 KB headroom** — within ~0.4 KB of the story's pre-measured estimate (~281 KB / ~19 KB).
- `npm run e2e`: first run surfaced 4 failures — `e2e/home.spec.ts`'s `renders the placeholder gallery with zero console errors` test still asserted the pre-Story-1.9 `h1` text (`'Game of Life Studio'`), across chromium/firefox/webkit/tablet. This file was flagged in the story's Dev Notes ("silent-failure traps") but was not in the Task list's file plan — fixed to assert `'Battle Gallery'`, matching `page.test.tsx`'s equivalent update. Full suite then 20/20 across all four projects, including `appShell.spec.ts`'s `getComputedStyle` → `rgb(10, 10, 10)` check and zero axe violations.
- Full `npm run ci` (typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e) run end-to-end after all fixes: **green**.

### Completion Notes List

- All 5 ACs satisfied: (1) the `[data-theme='clinical-lab']` token block in `themes.css`; (2) the single `cssVariables: true` `createTheme()` in `lib/theme.ts`, MUI core only; (3) `npx eslint apps/web` clean, AR-46 sanity-checked live; (4) `/` renders the shell with exactly one nav link (`Battles`), proven by both a component test (count assertion) and the e2e nav-count check; (5) all 23 WCAG pairs pass in `themeTokens.test.ts`, parsed from the shipped CSS, cross-checked against `clinical-lab-contrast-validation.md`.
- The four forced decisions and conflicts flagged in the story's Dev Notes were all followed as prescribed and are not re-litigated here: MUI v9.3.1 over the architecture's v6, `cssVariables: true`, the hardcoded `data-theme`, semantic-HTML + `styled()` chrome over `AppBar`/`Toolbar`/`Container`, the `<h1>` move from the shell wordmark to the page, the UX-semantic `--gol-*` naming, `--gol-radius: 0px`, and the two WCAG-driven token departures (`text-tertiary` → `#8a8a8a`, new `--gol-border-control`).
- Two additional issues surfaced during implementation that the story did not anticipate, both fixed and logged above: the MUI 9.3.1 `ThemeOptions` typing gap for `*Channel` palette keys (Debug Log), and `e2e/home.spec.ts`'s stale heading assertion (Debug Log). Neither required a design decision — both are mechanical fixes consistent with the story's stated intent.
- Bundle: 281.4 KB / 300 KB, 18.6 KB headroom — consistent with the story's pre-measurement and leaves comparable headroom for Stories 1.10–1.13.

### File List

**New:**
- `apps/web/app/themes.css`
- `apps/web/lib/theme.ts`
- `apps/web/lib/theme.test.tsx`
- `apps/web/lib/themeTokens.test.ts`
- `apps/web/components/AppProviders.tsx`
- `apps/web/components/AppShell.tsx`
- `apps/web/components/AppShell.test.tsx`
- `apps/web/components/AppNav.tsx`
- `apps/web/components/AppNav.test.tsx`
- `apps/web/e2e/appShell.spec.ts`
- `docs/implementation-artifacts/clinical-lab-contrast-validation.md`

**Modified:**
- `apps/web/app/layout.tsx`
- `apps/web/app/page.tsx`
- `apps/web/app/page.test.tsx`
- `apps/web/e2e/home.spec.ts` (not in the original Task file plan — required per Dev Notes' own flagged trap; see Debug Log)
- `apps/web/package.json` (+ `package-lock.json`)
- `docs/project-context.md`
- `docs/implementation-artifacts/sprint-status.yaml` (status tracking)

## Change Log

- 2026-08-07: Story created (context engine run against epics 1.9 + AR-35/36/37/38/46, RFC-003 Decisions 1–5, architecture Decision J and reconciliations 4–5, PRD NFR-8.1–8.5, the Clinical Lab UX token spec and gallery mockup, and the shipped Story 1.5–1.8 code). Five forced decisions flagged for the Dev Agent Record — the MUI v6→v9 install, the `cssVariables: true` requirement, the hardcoded `data-theme`, semantic-HTML chrome over `AppBar`/`Container`, and the `<h1>` relocation. Four spec conflicts surfaced rather than silently resolved: two `--gol-*` naming schemes, `--gol-radius` 4px vs 0, the UX palette failing WCAG AA on two tokens, and `project-context.md`'s stale "MUI lands in Epic 2". Every claim about MUI behaviour, token contrast, and bundle cost in this story was measured, not recalled. Status → ready-for-dev.
- 2026-08-07: Implemented. All 7 tasks complete, all 5 ACs satisfied, `npm run ci` green end-to-end. Two implementation-time findings beyond the story's own analysis: an MUI 9.3.1 TypeScript typing gap for `*Channel` palette keys (fixed via an intermediate `const`, not a type escape hatch) and a stale heading assertion in `e2e/home.spec.ts` that the story's Dev Notes had flagged as a risk but the Task file plan omitted. Bundle: 281.4 KB / 300 KB gzip (18.6 KB headroom), matching the story's pre-measurement. Status → review.
