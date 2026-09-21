---
baseline_commit: 3ae861f61383f0ec29c5de5d0abd2f99da6e2014
---

# Story 5.1: Settings Page Shell

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a Settings page in the navigation,
so that workspace management has a home.

## Acceptance Criteria

From `epics.md#Story 5.1: Settings Page Shell` (`epics.md:1319-1330`), decomposed into what a
reviewer can check independently. AC5–AC9 are repo-derived: obligations the shipped code,
`deferred-work.md` and the CI gates already name for "the story that adds `/settings`" — the same
shape Story 4.1 used for `/organisms`, which is this story's precedent throughout.

1. **The top nav shows Battles, Organisms and Settings — exactly three links, in that order,
   nothing else.** On every page that wears `AppShell` (`/`, `/organisms`, `/settings`, the 404)
   `<nav aria-label="Main">` renders `Battles` → `/`, `Organisms` → `/organisms`, `Settings` →
   `/settings`, styled by the existing `NavItem` (mockup `.nav-item` / `.nav-item.active`,
   `clinical-lab-theme/settings.html:59-85, 349-358` — Settings is the third and `.active` on that
   page). This closes the 4.1 nav gap (`epics.md:1327`); it is the last nav entry the MVP adds.

2. **The active item is right on every route.** On `/settings` (and `/settings/`, a trailing-slash
   host) Settings carries `aria-current="page"` + the active style and the other two do not; on `/`
   and `/organisms` Settings does not. `/battle` and the 404 still light nothing. Colour is never
   the only signal (`aria-current` + the 1px `--gol-border` box, Story 4.1 AC2).

3. **`/settings` is a real, statically prerendered route whose page loads through injected
   repositories — the settings repository first.** `app/(gallery)/settings/page.tsx` is the page
   boundary: `createRepositories()` **once** (`useMemo(..., [])`), `useWorkspaceSeed` (FD2), and
   `<SettingsPage settings={…} battles={…} organisms={…} seedStatus={…}>` with every prop typed to
   its `@gol/persistence` **interface** (AR-2, AR-27). The page renders the mockup's header at once
   — `<h1>Settings</h1>` (the document's **only** h1) + subtitle "Configure workspace and
   preferences" (`settings.html:361-364`) — and its body only once `settings.load()` has resolved
   (FD3: the settings load is the page's readiness gate; a rejecting `settings.load()` renders a
   `role="alert"` and **no** sections — never a silent fall-back to `DEFAULT_SETTINGS`, see FD3 for
   why). `npm run build:standalone` emits `apps/web/out/settings.html` (Decision K.5 — a static
   path, no dynamic segment).

4. **The page presents only what exists, per the mockup's section layout — and nothing dead.**
   One `.settings-section` card (`settings.html:112-137`) headed `<h2>Workspace Statistics</h2>`,
   whose body is the mockup's `.workspace-stats` grid (`:282-314`) with the two tiles this story
   can fill truthfully: **Saved Battles** (`battles.list().length`) and **Organisms**
   (`organisms.list().length`). **Storage Used is Story 5.2's** (it needs the AR-14 usage meter,
   which does not exist yet) and is **absent**, not a placeholder. **Data Management renders for the
   first time in Story 5.5**, with its first control — FD4 records why an empty section is exactly
   the "dead section" this AC forbids. **No** Display Preferences, **no** Simulation Preferences,
   **no** Auto-Save row (`epics.md:1497-1581` — all Epic 6). Display order on the page: header,
   then the Workspace Statistics card. Nothing else.

5. **`gol:settings` is read, never written, by this story.** There is no settings *control* in
   5.1 (FR-8.1's "changes apply immediately or on confirm and persist" has nothing to apply to
   until Story 6.3 adds the first row), so the persistence half of the epic AC is satisfied by the
   existing `SettingsRepository.save()` + `writeSettingsKey` path (Story 1.4) and **proven by
   absence**: `SettingsPage.test.tsx` asserts `settings.save` is never called, and the e2e asserts
   `localStorage.getItem('gol:settings')` is byte-identical before and after the visit. A shell
   that wrote defaults back on load would stamp a record the user never chose (Decision F).

6. **The page is keyboard-operable and passes axe.** Tab reaches all three nav links in DOM order
   (Alt+Tab on WebKit, the Story 4.1 idiom), Enter on Settings navigates client-side and moves
   `aria-current`. vitest-axe on `AppNav`, `NotFound`, `SettingsPage` and the settings page test,
   and `@axe-core/playwright` on the served `/settings` after hydration, all report `[]` (AR-44;
   `epics.md:1595` names Settings a key screen). The stat tiles' pairs are already AA:
   `accent / bg-hover` 8.99:1 and `text-secondary / bg-hover` 5.58:1
   (`clinical-lab-contrast-validation.md:44,50`).

7. **Existing guards are retargeted, never loosened.** Count assertions go 2 → **3** (still
   counts — the reason they are counts is unchanged): `AppNav.test.tsx:24`,
   `app/not-found.test.tsx:33`, `e2e/appShell.spec.ts:27`, `e2e/organisms.spec.ts:60`. The
   `/battle` "nothing active" test keeps its path (`/battle` still has no entry). `AppShell.test.tsx`
   passes unchanged.

8. **The route set has an automated guard, and it is this story that makes it change.**
   `deferred-work.md:176` ("AC5's route count has no automated guard … Pick this up in Epic 5,
   when `/settings` makes the expected set change for the first time") closes here: a `readdir`
   unit test over `apps/web/app/` pins the exact set of `page.tsx` files — five after this story —
   and that no path contains a `[dynamic]` segment (Decision K.5). Entry struck through with the
   resolution.

9. **The bundle gate measures the new route, and the local gate is green.**
   `scripts/check-bundle-size.mjs` gains a ROUTES entry for `settings.html` with a budget derived
   from a **measurement** by the file's own formula (`ceil((measured + 12) / 5) * 5`), the measured
   value in the entry's comment — a first measurement, not a raise (Story 4.1 Task 5 precedent).
   `npm run ci:dev` exits 0; CI on the pushed branch is checked, not inferred.

## Tasks / Subtasks

- [x] **Task 1 — Nav entry + retargeted guards** (AC: 1, 2, 6, 7)
  - [x] `apps/web/components/layout/AppNav.tsx`: append
        `{ href: '/settings', label: 'Settings', match: 'prefix' }` to `NAV_ITEMS`. `'prefix'`
        for the same reason `/organisms` is (FD3 of Story 4.1: stays lit on `/settings/`; a query
        never reaches `usePathname()`). Rewrite the header comment: the no-dead-affordance rule
        still governs the file, but the "Settings joins in Story 5.1" line is now history, not a
        promise — say the three entries are the MVP's complete set (AR-28's three page surfaces +
        `/organisms`; battle routes carry no entry by design). **Nothing else changes** — `NavItem`,
        the focus ring, `aria-current` are Story 1.9's and correct for N entries. Do not touch
        `AppShell.tsx`; do not teach it `usePathname()` (`project-context.md`, Framework rules).
  - [x] `AppNav.test.tsx`: (a) count → 3, hrefs + exact labels (`/^Settings$/`) + order; (b)
        pathname `/settings` → Settings has `aria-current="page"`, Battles and Organisms have none;
        (c) `/settings/` → Settings active (prefix); (d) the existing `/` and `/organisms` tests
        gain `expect(settings).not.toHaveAttribute('aria-current')`; (e) `/battle` test unchanged in
        path, its loop now covers three links; (f) keyboard test: third `tab()` lands on Settings.
        Keep the `vi.hoisted` + `vi.mock('next/navigation')` shape exactly (`:8-11`). Keep every
        existing comment; update the AC ids in the test names to `Story 5.1` only where the
        assertion actually changed (the 4.1 review patched exactly this drift — `4-1-*.md:253`).
  - [x] `apps/web/app/not-found.test.tsx:33`: `toHaveLength(2)` → `3`; amend the comment ("both nav
        links" → "all three"). The 404 still wears the shell with **nothing** current.

- [x] **Task 2 — The `/settings` route** (AC: 3, 4)
  - [x] `apps/web/app/(gallery)/settings/page.tsx` — `'use client'`, mirror
        `app/(gallery)/organisms/page.tsx` in shape: `const repositories = useMemo(() =>
        createRepositories(), [])`, `const { status } = useWorkspaceSeed(repositories)` (FD2),
        return `<SettingsPage settings={repositories.settings} battles={repositories.battles}
        organisms={repositories.organisms} seedStatus={status} />`. No `<main>` (AppShell owns it
        via the `(gallery)` group layout; parentheses never reach the URL). No `useDocumentTitle`
        (FD5). Header comment: Decision K.5 (static path), AR-27 (the page is the boundary), and
        **FD1** — why this file is under `(gallery)` and not `app/settings/page.tsx` as
        `RFC-005:197` sketches.
  - [x] `apps/web/app/(gallery)/layout.tsx`: comment only — the group now hosts `/`, `/organisms`
        **and** `/settings`; drop the "belongs here too or it will ship without the shell" warning
        (it has landed) but keep the `not-found.tsx` trap sentence for the next reader. Do not
        rename the group (Story 4.1 FD1).
  - [x] `apps/web/app/(gallery)/settings/page.test.tsx`, modelled on
        `app/(gallery)/organisms/page.test.tsx`: h1 `Settings` present at once; after `waitFor`,
        the `Saved Battles` tile shows `0` and `Organisms` shows `1` (Conway's Classic, seeded by
        THIS boundary — the strongest proof the repository path resolved and FD2 holds); axe clean
        once ready; a `<StrictMode>` mount reaches ready and seeds `gol:organisms` exactly once
        (`Object.keys(...)` = `[CONWAYS_CLASSIC_ID]`); `vi.stubEnv('NODE_ENV', 'development')` →
        Organisms `4` and Saved Battles `2` (the AR-45 fixtures: `MOCK_ORGANISM_IDS` has three,
        `MOCK_BATTLE_IDS` two — import the id maps from `@gol/test-utils` and derive the expected
        counts from `Object.keys(...).length`, never literals); `gol:settings` is **absent** from
        `localStorage` after every test (AC5 — the shell never writes it). `afterEach`:
        `localStorage.clear(); vi.unstubAllEnvs()`.

- [x] **Task 3 — `<SettingsPage>`** (AC: 3, 4, 5, 6)
  - [x] `apps/web/components/settings/SettingsPage.tsx` (new folder — Epic 5's UI home; 5.2, 5.5,
        5.9 and 5.10 all write here). Props:
        `{ settings: SettingsRepository; battles: BattleRepository; organisms: OrganismRepository;
        seedStatus: WorkspaceSeedStatus }` — interface types from `@gol/persistence`,
        `WorkspaceSeedStatus` from `@/lib/gallery/useWorkspaceSeed`. All three repositories are
        **read** (FD3/FD4), so none is the "unused prop that lies about what the component reads"
        Story 4.1 refused. Never import `createRepositories`, `LocalStorage*`, or `APP_MODE` here.
  - [x] Two `useAsyncResource` calls (`@/lib/useAsyncResource` — read its four ⚠️ contracts before
        wiring: stable deps, **fixed length**, branch on `status` before `data`, no reload):
        `settingsResource = useAsyncResource(() => settings.load(), [settings])` and
        `countsResource = useAsyncResource(() => Promise.all([battles.list(), organisms.list()]),
        [battles, organisms, seedStatus])`. Two, not one (FD3): the seed flip must re-run the counts
        (the first `list()` reads a pre-seed store — the `OrganismLibrary` note) but has no business
        re-reading settings, and the settings resource is the handle Story 6.3 lifts into editable
        state. Do **not** `.catch(() => DEFAULT_SETTINGS)` on the settings load — that is
        `BattleGallery`'s degrade, and it is wrong on this page (FD3).
  - [x] Derived view at render, folded exactly as `OrganismLibrary` folds `seedStatus`:
        `settingsResource.status === 'error' || countsResource.status === 'error' || seedStatus
        === 'error'` → error; `seedStatus === 'seeding' || either status === 'loading'` → loading;
        else ready. Counts: `countsResource.data[0].length` / `[1].length` — `BattleSummary[]` and
        `Organism[]`; never `listFull()` (the summaries are the cheap projection, Decision H.4).
  - [x] Render: `<section aria-labelledby={HEADING_ID}>` with the page header (`SectionHeader` /
        `SectionTitle` `h1` 32px/600 / `SectionSubtitle` — **third hand copy** of
        `BattleGallery.tsx:96-113`, FD6 says why it is not lifted here) and then, by view state:
        loading → `<StatusText>Loading settings…</StatusText>` (this string is the prerendered
        body and the e2e's hydration signal — keep it exact); error → `<StatusText
        role="alert">Something went wrong loading your settings.</StatusText>`; ready → the
        `<WorkspaceStatistics>` card. `aria-busy` on a wrapper around the status/body area only,
        **never** on the section (the `deferred-work.md:187` trap Story 4.1 also avoided) — 5.5's
        buttons will live inside this section.
  - [x] `<WorkspaceStatistics>` (same file, or `WorkspaceStatistics.tsx` beside it — your call; 5.2
        grows it either way): `<section aria-labelledby={STATS_HEADING_ID}>` styled as the
        mockup's `.settings-section` (`settings.html:112-121`: `--gol-bg-secondary`, 1px
        `--gol-border`, `padding: 30px`; the `:hover` accent border is kept as `border-color`
        only — **not** `transition: all`, the mid-fade axe trap `BattleNameField.tsx:18-49`
        records; enumerate `border-color 0.2s` + the `prefers-reduced-motion` escape). `<h2>`
        `Workspace Statistics` styled `.settings-section-title` (`:123-130`, 20px/600, 1px bottom
        rule). **No description paragraph** — the mockup's sentence describes export/import, which
        is Data Management's (5.5). Body: a `<dl>` styled `.workspace-stats` (`:282-287`, CSS grid
        `repeat(auto-fit, minmax(200px, 1fr))`, native grid as `BattleGallery`'s `TileGrid` is)
        holding two `.stat-item` groups (`<div>` wrapping `<dt>` label + `<dd>` value — a `div`
        child of `dl` is valid HTML and axe-clean; `:289-314`). DOM order is `dt` then `dd` (the
        only valid order) while the mockup shows value **above** label — `flexDirection:
        'column-reverse'` on the group, with a comment saying so. `dt` = "Saved Battles" /
        "Organisms" (12px uppercase `--gol-text-secondary`), `dd` = the count (32px/600
        `--gol-accent`), formatted `toLocaleString('en-US')` — the house locale pin
        (`GridSettingsSection`, `PopulationStats`; `deferred-work.md:429`). **Two tiles.** Storage
        Used arrives with 5.2's meter; leave a one-line `(Story 5.2)` note where it slots in.
  - [x] Styles: `styled()` with `var(--gol-*)` only (AR-46 no-raw-hex lint is active on
        `apps/web`); mockup → token map: `--bg-secondary`→`--gol-bg-secondary`,
        `--bg-hover`→`--gol-bg-hover`, `--border`→`--gol-border`, `--accent`→`--gol-accent`,
        `--text-secondary`→`--gol-text-secondary`. The mockup's `.settings-container` (`:106-110`,
        flex column, `gap: 30px`) wraps the cards — ship it now with one child; 5.5 adds the
        second card into it (the Gallery toolbar-band lesson, `deferred-work.md:196`, is that a
        band shipped without its layout rules looks broken for one commit when the second child
        lands — but a `gap` on a flex column is not speculative, it is the mockup's rule).
  - [x] `SettingsPage.test.tsx` with `createFakeRepositories(...)` from `@gol/test-utils`
        (`BattleGallery.test.tsx:108` shape; never hand-roll a fake repo): loading text while
        `seedStatus='seeding'` even after `list()` resolved (flush the fake's promise first — the
        4.1 review caught a synchronous version of this assertion passing vacuously,
        `4-1-*.md:257`); ready → counts render from `createMockWorkspace()` / `createMockOrganisms()`
        (assert the numbers **derived** from the fixture arrays, not literals) and the `dt`/`dd`
        pairs are associated (`getByRole('term')` / `getByRole('definition')`); a rejecting
        `settings.load()` → `role="alert"` and **no** `h2`; a rejecting `battles.list()` → alert;
        `seedStatus='error'` → alert; the seeding → ready flip re-runs the counts (a fake whose
        `list()` returns a different length on its second call — pin that the second value is what
        renders); `settings.save` never called (spy on the fake); exactly one `h1`, exactly one
        `h2`, **no** text matching `/display|simulation|theme|auto-save|export|import|clear/i`
        (the no-dead-section guard, a negative assertion anchored by the positive `h2` one); axe
        clean when ready.

- [x] **Task 4 — Route-set guard** (AC: 8)
  - [x] `apps/web/app/routes.test.ts`: `readdirSync(APP_DIR, { recursive: true })` (Node 24)
        where `APP_DIR = fileURLToPath(new URL('.', import.meta.url))`; keep entries ending in
        `page.tsx`, normalise `path.sep` to `/`, sort; `expect(pages).toEqual(['(battle)/battle/new/page.tsx',
        '(battle)/battle/page.tsx', '(gallery)/organisms/page.tsx', '(gallery)/page.tsx',
        '(gallery)/settings/page.tsx'])`. Second assertion: no entry contains `[` (a dynamic
        segment fails `output: 'export'` at build — Decision K.5 — but only at build, which is the
        slowest place to learn it). Doc-comment the failure it prevents (a stray `page.tsx` passes
        typecheck, lint, tests and `build:standalone`; the only evidence was a route table pasted
        into a Dev Agent Record) and cite `deferred-work.md:176` + `(Story 5.1)`. jsdom env is fine
        — `node:fs` is available; `vitest.config.mts`'s `include` already matches `app/**/*.test.ts`.
  - [x] `deferred-work.md:176`: strike through, append "**✅ Resolved in Story 5.1** —
        `apps/web/app/routes.test.ts` pins the five-file set and the no-dynamic-segment rule". Keep
        the entry's text (strike-through + resolution, never deletion — the file's convention).

- [x] **Task 5 — e2e against the served static export** (AC: 1, 2, 3, 5, 6, 7)
  - [x] `apps/web/e2e/settings.spec.ts` (thin, RFC-008 Decision 2), the Story 4.1 block of
        `organisms.spec.ts:33-152` as the template:
        1. `goto('/settings')` → h1 `Settings` visible; **hydration signal** = the `Saved Battles`
           term visible with definition `0` and `Organisms` with `1` (prerendered HTML says
           "Loading settings…"; every errors/axe assertion comes AFTER this or it races hydration —
           `appShell.spec.ts:29-40`); `errors` toEqual `[]`.
        2. Nav state: `getByRole('navigation', { name: 'Main' }).getByRole('link')` count **3**;
           on `/settings` Settings has `aria-current="page"`, the other two do not; `goto('/')` →
           Battles current, Settings not.
        3. Keyboard: from `/`, `tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'` (copy the
           `:89-97` comment's substance — WebKit leaves plain links out of Tab order), bounded loop
           ≤ 10 until the Settings link is `document.activeElement` (3rd stop today; do not
           hardcode), `Enter` → `toHaveURL(/\/settings$/)`, h1 visible, Settings `aria-current`
           moved and Organisms/Battles not (the one place the live `usePathname()` subscription is
           proven for this entry), hydration signal, `errors` `[]`. Listeners attached **before**
           the loop (`4-1-*.md:255`).
        4. Prerender proof: `request.get('/settings')` → 200; `html` matches
           `/<h1[^>]*>Settings<\/h1>/` (the ELEMENT, not the substring — the RSC flight payload
           carries the string even for a client-rendered page, `organisms.spec.ts:127-143`);
           contains `Loading settings…` and `data-theme="clinical-lab"`; does **not** contain
           `Display Preferences`, `Simulation`, `Auto-Save`, `Export`, `Import`, `Clear` (AC4 in
           the shipped bytes).
        5. `gol:settings` untouched: `localStorage.getItem('gol:settings')` before the visit
           (`null` on the production seed — assert that explicitly, then assert it is still `null`
           after hydration); a second variant seeds a non-default record via `page.addInitScript`
           before `goto` and asserts byte-identity after (the `organisms.spec.ts:202-222` shape,
           which pins the key name too).
        6. axe after the hydration signal → `[]`. This is the only place the stat tiles'
           `--gol-accent` / `--gol-text-secondary` on `--gol-bg-hover` are measured for real.
  - [x] `e2e/appShell.spec.ts:25-27`: `toHaveCount(2)` → `3`; comment: "exactly three: Battles,
        Organisms and Settings — the MVP's complete set (Story 5.1)". Keep the `Story 1.9`-scoped
        AC id as the 4.1 review fixed it (`4-1-*.md:254`).
  - [x] `e2e/organisms.spec.ts:60`: `toHaveCount(2)` → `3` — **this one line only.** The file is
        the Epic 4 lane's live surface (every 4.x story appends a describe block at the bottom);
        the edit is at the top and merges cleanly, but do not reformat, reorder or touch anything
        else in it.
  - [x] `e2e/notFound.spec.ts`: unchanged, but run it — the 404 now shows three links with
        **none** active.

- [x] **Task 6 — Bundle gate entry + measurement** (AC: 9)
  - [x] `npm run build:standalone` then `node scripts/check-bundle-size.mjs` **before** adding the
        entry; record the four existing routes' figures. `home (/)` and `organisms (/organisms)`
        both mount `AppNav`, which grew one entry — expect ≤ 0.5 KB movement; if more, find out
        why before continuing (Story 2.14 / 4.1 both saw chunk-splitting shifts of ~1 KB from
        merely adding modules to the graph; measure, do not guess — `4-1-*.md:262`).
  - [x] Add `{ name: 'settings (/settings)', html: 'settings.html', budgetGzipKb: <derived> }` with
        a comment: measured gzip KB, the formula, and that this is a **new measurement, not a
        raise**. Do **not** touch the four existing budgets, and do not pre-empt the growth-ratchet
        story (`deferred-work.md:397` — Sidiar's standing preference is to change a gate's
        mechanism rather than nudge its thresholds; a first measurement for a new route is
        neither).
  - [x] Record all five routes' measured numbers in the Dev Agent Record.

- [x] **Task 7 — Docs + verification** (AC: 8, 9)
  - [x] `deferred-work.md`: add a `## Deferred from: Story 5-1-settings-page-shell implementation
        (<date>)` section with three entries: (a) **Data Management renders first in Story 5.5**
        (FD4 — the AC-vs-rule call, for Sidiar to overrule if he wants an empty frame now); (b)
        **the section header is now three hand copies** (`BattleGallery`, `OrganismLibrary`,
        `SettingsPage`) — FD6, lift owed to the first story after Epic 4 closes that touches
        `OrganismLibrary.tsx`; (c) **RFC-005's `<SettingsPage settings={repo}>` tree line and
        `app/settings/page.tsx` path** (`RFC-005:172,197`) are stale against what shipped (three
        repositories, `(gallery)` group) — a docs-reconciliation item for the next RFC touch,
        alongside the 4.1 `/organisms` entry; **not** edited here (Sidiar owns RFC amendments).
  - [x] `docs/project-context.md`: **no rule changes expected.** The route-group rule and K.5 already
        name `/settings`. If a rule wants adding, it is the "settings page never degrades to
        `DEFAULT_SETTINGS`" one (FD3) — and only if the review agrees it is unobvious.
  - [x] `npm run ci:dev > /tmp/ci.log 2>&1; echo $?` (never pipe to `tail` — pipe-swallowed exit
        codes). Paste the exit code, the five bundle lines and the e2e summary into the Dev Agent
        Record. Push to `story/5-1-settings-page-shell` and check `gh run list --limit 1` once the
        PR exists — a local green is not proof.

### Review Findings

Reviewed 2026-09-21 on **Opus** against the **Sonnet** implementation (`7f32592`), via three parallel
adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 `decision-needed`,
12 `patch`, 3 `defer`, 16 dismissed.

- [x] [Review][Patch] "Loading while seeding, even after both loads have resolved" passes vacuously — two `await Promise.resolve()` ticks do not reach the resources' settle (the chain needs four), so the assertion holds with the `seedStatus === 'seeding'` clause deleted; use the `OrganismLibrary.test.tsx:27-40` shape (spies + `waitFor(() => expect(spy).toHaveResolved())`) [apps/web/components/settings/SettingsPage.test.tsx:21-41]
- [x] [Review][Patch] `readStats()` pairs terms and definitions by index with no length guard — a `dt`/`dd` count mismatch yields an `undefined` typed as `string` and a misleading failure [apps/web/components/settings/SettingsPage.test.tsx:12, apps/web/app/(gallery)/settings/page.test.tsx:44]
- [x] [Review][Patch] e2e reads definitions positionally (`.first()`/`.nth(1)`) while terms are matched by text — scope each `dd` to its tile; the nav test's title says "neither" but never asserts Organisms is not current on `/` [apps/web/e2e/settings.spec.ts:25-40,33-54]
- [x] [Review][Patch] Route-set guard uses `endsWith('page.tsx')`, which counts a colocated `homepage.tsx` as a route — match the basename exactly [apps/web/app/routes.test.ts:24]
- [x] [Review][Patch] `gol:settings` absence is asserted in one page test, not "after every test" (Task 2) — the StrictMode and `NODE_ENV=development` mounts never check it; assert in `afterEach` before `clear()` [apps/web/app/(gallery)/settings/page.test.tsx:56-59]
- [x] [Review][Patch] `AppNav.tsx` header cites AR-28 for "three page surfaces (Battles, Organisms, Settings)" — AR-28 names Gallery, Battle and Settings; `/organisms` is the fourth top-level route (`epics.md:1001`) [apps/web/components/layout/AppNav.tsx:9]
- [x] [Review][Patch] AC-id drift: the `/` and `/organisms` test names gained a Settings assertion (Story 5.1 AC2) but still read `(Story 4.1 AC2)` only [apps/web/components/layout/AppNav.test.tsx:36,48]
- [x] [Review][Patch] `page.tsx` cites FD1/FD2/FD5 with no story qualifier (precedent: `organisms/page.tsx` writes "FD2 (Story 4.1)"); the third section-header copy lacks the literal `(Story 5.1)` note Task 3 asked for [apps/web/app/(gallery)/settings/page.tsx:8-22, apps/web/components/settings/SettingsPage.tsx:17-22]
- [x] [Review][Patch] Stale citation `deferred-work.md:187` (blank line) — the `aria-busy` trap entry is at `:192` [apps/web/components/settings/SettingsPage.tsx:107]
- [x] [Review][Patch] Stray `"` after the closing backtick in the new FD6 entry [docs/implementation-artifacts/deferred-work.md:2162]
- [x] [Review][Patch] `aria-busy` scoping is documented at length and asserted nowhere — pin `true` while loading and `false` once ready in the unit tests [apps/web/components/settings/SettingsPage.tsx:110]
- [x] [Review][Patch] Dev Agent Record: Task 6's before-measurement was not taken ("no separate before/after build") yet the ≤0.5 KB claim is asserted — the actual evidence is Story 4.14's record (`4-14-*.md:880-883`: 333.8/309.3/309.1/295.6, byte-identical, delta 0.0 KB); also "6 new/edited files" lists five, and the `deferred-work.md:722` `error.tsx` third surface the spec asked to note is not noted [docs/implementation-artifacts/5-1-settings-page-shell.md:530-541]
- [x] [Review][Defer] Route-set guard does not cover `route.ts` handlers or `page.{js,jsx,mdx}` — Next serves those too and a `route.ts` fails `output: 'export'` only at build [apps/web/app/routes.test.ts:24-46] — deferred, pre-existing gap shape (the guard is new but the repo is TS-only; widen when a second route-defining basename ever appears)
- [x] [Review][Defer] One alert string for three failure sources — a corrupt `gol:settings`, a rejecting `list()`, and a failed seed WRITE all read "Something went wrong loading your settings." [apps/web/components/settings/SettingsPage.tsx:113] — deferred, pre-existing (FD3 assigns copy and the reset offer to Story 5.11; carry the three-source distinction there)
- [x] [Review][Defer] "Seeds gol:organisms exactly once" is proven by the final key set, which a double write of the same key also satisfies — a `setItem` spy count would prove it [apps/web/app/(gallery)/settings/page.test.tsx:88-104] — deferred, pre-existing (identical shape in `app/(gallery)/page.test.tsx` and `organisms/page.test.tsx`; strengthen all three together)

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — The route lives in `app/(gallery)/settings/page.tsx`.** `RFC-005:197` and
  `RFC-001:399` sketch `app/settings/page.tsx`, but the `(gallery)` group is "the branch that wears
  `AppShell`" (Story 2.1 forced decision 2; `app/(gallery)/layout.tsx`'s comment names `/settings`
  as belonging here). A page outside the group renders with no nav, no wordmark and no `<main>`,
  and **every jsdom test stays green** — `not-found.tsx`'s header documents that exact regression,
  found only in `out/`. The RFC path is illustrative (Cross-RFC Reconciliation #4: App Router
  file-based routing is canonical, RFC-005's sketches are not); the drift is recorded in
  `deferred-work.md` (Task 7), not silently absorbed.

- **FD2 — `/settings` runs `useWorkspaceSeed` at its boundary, like `/` and `/organisms`.** A
  bookmark to `/settings` in a fresh browser is a legitimate first visit; without the seed the
  Organisms tile reads `0`, contradicting M9 ("the library is never empty") on the very page whose
  job is to report the workspace truthfully. The hook is idempotent, its `hasRun` is per instance,
  Decision K unmounts routes hard, so at most one boundary is mounted at a time (Story 4.1 FD2's
  reasoning, unchanged). The AR-45 dev fixtures come with it — hence the `NODE_ENV=development`
  page test's counts of 4 and 2.

- **FD3 — The settings load is the page's readiness gate, and it never degrades to
  `DEFAULT_SETTINGS`.** The epic AC says `/settings` "loads the page via the injected settings
  repository", and nothing in 5.1 *displays* a setting. The load is still real: the page body
  renders only once `settings.load()` resolves, and a rejection (a corrupt `gol:settings` —
  `LocalStorageSettingsRepository.load()` throws `CorruptDataError`) renders an alert with no
  sections. `BattleGallery` and `<BattlePage>` degrade a failed settings read to
  `DEFAULT_SETTINGS`, and that is right for them — they only *read* a preference. It is wrong on
  the settings page: the first Epic 6 row that saves would write defaults over the user's damaged
  record, silently erasing whatever 5.11's rescue path could have recovered. Blocking is the
  conservative shape; Story 5.11 owns the copy and the reset offer. The loaded `Settings` value has
  **no consumer** until Story 6.3 — do not invent one (no "current theme" label, no summary), and
  do not pre-lift it into `useState`: the first row that edits it does that. Two resources rather
  than one `Promise.all` because the two loads have different deps (the counts re-run on the seed
  flip; settings must not) and different futures (6.3 lifts the settings resource; 5.2 grows the
  counts one).

- **FD4 — Workspace Statistics ships with the two counts it can fill; Data Management renders
  for the first time in Story 5.5.** AC2 in the epic names both sections *and* forbids dead
  sections in the same sentence. A Data Management card with no control is the dead section — the
  mockup's description for it ("Export, import, and manage…") promises three buttons that arrive
  in 5.5, 5.9 and 5.10. The project's seam pattern (`implementation-readiness-report-2026-07-16.md:340`:
  "the earlier story ships without the affordance, the later story explicitly renders it for the
  first time" — exactly how this story's nav entry arrived) resolves it: 5.5's own AC already
  reads "Given the Data Management section, When 'Export Workspace' is clicked", so 5.5 creating
  the card with its first row is a one-line reading of that AC. Workspace Statistics is different:
  its content *does* exist — two counts are one `list()` each through repositories this page must
  own anyway (5.10's Clear All needs all three). The Storage Used tile is not started: it needs the
  AR-14 usage meter, a `packages/persistence` addition with its own coverage floor, which is the
  substance of Story 5.2 (along with the refresh-on-return proof). This is the 4.1 → 4.2 split
  again (names in 4.1, cards in 4.2). **Flagged for Sidiar** as the one reading in this story that
  bends an AC's letter to honour its rule; if he wants the empty Data Management frame now, it is
  a ten-line addition with no other consequence.

- **FD5 — No tab-title work.** `useDocumentTitle` is a one-mounted-consumer hook by contract and
  belongs to `<BattlePage>`; `/` and `/organisms` claim no title and Settings follows them (Story
  4.1 FD4, verbatim reasoning). A per-route `metadata` export would need a server-component page,
  which this page-boundary pattern is not.

- **FD6 — The section header is a third hand copy, not a lift.** `OrganismLibrary.tsx:38-43`
  (FD9 of Story 4.1) defers the lift to "the first story after 3.17 that touches both"
  `BattleGallery` and `OrganismLibrary`. This story touches neither, and `OrganismLibrary.tsx` is
  the Epic 4 lane's live file (4.16–4.22 all edit it) — a lane-5 edit there is a guaranteed merge
  conflict for a cosmetic gain. A lift that switches only `BattleGallery` is the half-moved
  primitive 4.1 called "worse than either". Copy the ~20 lines with a `(Story 5.1)` note pointing
  at the two siblings; Task 7 records that the lift is now three-way and owed to the first story
  after Epic 4 closes.

- **FD7 — `'prefix'` match, an `<h2>` per card, a `<dl>` for the tiles.** Prefix for the same
  reason `/organisms` has it. `<h2>` because the page's `<h1>` is "Settings" and every card is a
  section of it (mockup `.settings-section-title` is an `h2`; Epic 6's cards will be `h2`s too,
  so `heading-order` stays flat). `<dl>` because a label/value pair is what a description list
  is — `role="term"` / `role="definition"` give tests and screen readers the association for free
  and axe is clean with `div`-wrapped groups.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/layout/AppNav.tsx` + `.test.tsx` | The only shape change: one `NAV_ITEMS` line. Comment says "Settings joins in Story 5.1 — one line here, not before". |
| `apps/web/lib/layout/navMatch.ts` | `isNavItemActive(pathname, href, match)` — unchanged; its doc comment is the `'prefix'` rationale. |
| `apps/web/app/(gallery)/organisms/page.tsx` + `.test.tsx` | **Copy this shape** for the settings page and its test (FD2 reasoning is in its header comment). |
| `apps/web/app/(gallery)/layout.tsx`, `app/not-found.tsx` + `.test.tsx` | The route-group split, its one trap (the 404 lost the shell), and the third "nothing active" surface. |
| `apps/web/components/organisms/OrganismLibrary.tsx:1-70,140-220` | Section header copy, the `seedStatus` fold at render, `aria-busy` scoped to the body wrapper, `StatusText`. Do **not** copy its search/toolbar/modal parts. |
| `apps/web/components/gallery/BattleGallery.tsx:90-125,220-245,278-300` | Section header original; the `settings.load().catch(() => DEFAULT_SETTINGS)` degrade you must **not** copy (FD3); `TileGrid` as the native-CSS-grid precedent. |
| `apps/web/lib/useAsyncResource.ts` | The four ⚠️ contracts. `data` is `undefined` until settled — branch on `status` first. |
| `apps/web/lib/gallery/useWorkspaceSeed.ts` | Idempotent seed; `NODE_ENV` read inside the effect (why `vi.stubEnv` works in the page test). |
| `packages/persistence/src/repositories.ts` | `SettingsRepository.load(): Promise<Settings>` (never null); `BattleRepository.list(): Promise<BattleSummary[]>`; `OrganismRepository.list()`. |
| `packages/persistence/src/localStorageSettingsRepository.ts` | Absent key → `SettingsSchema.parse({})`; present-but-invalid → `CorruptDataError`. The two branches FD3's tests exercise through the fake. |
| `packages/test-utils/src/fakeRepositories.ts` | `createFakeRepositories({ battles, organisms, settings, raw })`, `createMockWorkspace()`, `createMockOrganisms()`, `MOCK_BATTLE_IDS`, `MOCK_ORGANISM_IDS`. Its settings fake mirrors the real absent/corrupt branches. |
| `apps/web/e2e/organisms.spec.ts:1-152`, `appShell.spec.ts` | Hydration-signal discipline, WebKit `Alt+Tab`, listeners-before-loop, the rendered-element prerender proof, the `localStorage` byte-identity shape (`:202-222`). |
| `scripts/check-bundle-size.mjs` | ROUTES list, formula, the "single authority for every figure" rule, and the retirement note. |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/settings.html:59-85,105-137,281-314,349-395` | Nav, card, stats grid CSS and markup. Everything from `:392` on (rows, toggles, Display/Simulation) is **not** this story's. |
| `docs/implementation-artifacts/clinical-lab-contrast-validation.md:41-64` | The pairs the stat tiles use are already validated AA. |

### Architecture compliance

- **Decision K.5** — `/settings` is a static path; no dynamic segment, no `generateStaticParams`.
  The route-set test (Task 4) makes the "no `[segment]`" half a unit-test failure instead of a
  build failure.
- **AR-2 / AR-27** — `createRepositories()` once at the page file; every prop typed to the
  interface; no Context, no singleton, no concrete `LocalStorage*` import under `components/`.
  Test: swapping to an API repo must not touch `SettingsPage`.
- **AR-28** — Settings (`/settings`) is one of the three named page surfaces; this story adds a
  page, not a mode.
- **Decision F / AR-12** — `gol:settings` is device-local. The shell reads it and never writes it
  (AC5); nothing here touches `clearAll()`, envelopes or the FOUC script (AR-37, Story 6.5).
- **RFC-005 Decision 1 / Decision 9** — page-boundary loading through `useAsyncResource`; "most
  settings are read on the Settings page itself" — the read is established here, the first
  consumer arrives in 6.3. No `SettingsContext` (flagged, not adopted — `RFC-005:330`).
- **Decision J / RFC-003 Decision 3** — one theme, `var(--gol-*)` only, `styled()` for static
  chrome. No MUI `Card`/`Paper` for the settings card: a `styled('section')` is ~10 lines and adds
  no bundle; the route has no measured headroom yet (Task 6 measures it).
- **No DOM types in `packages/*`** — nothing in this story touches a package. (The AR-14 meter
  that will is Story 5.2's.)
- **Spec-id hygiene** — `npm run spec:check` tokenises `AR-n`, `FR-x.y`, `M9`, `Decision K`,
  `Story 5.1`, `RFC-005` out of code comments and docs; write them exactly so.

### Library / framework notes (installed versions, no research needed)

- **Next 16.2.x App Router, `output: 'export'`** — a new `page.tsx` under the `(gallery)` group is
  prerendered to `out/settings.html` (sibling `.html`, never a directory index —
  `check-bundle-size.mjs` header). `usePathname()` in a `'use client'` component is fine under
  export.
- **`next/link`** — `/` ↔ `/organisms` ↔ `/settings` are client-side navigations under the
  persistent `(gallery)` layout; `AppShell` does **not** remount; `AppNav` re-renders via
  `usePathname()`.
- **MUI 9.3.1 / Emotion** — `styled('section')`, `styled('dl')` etc.; `cssVariables: true` theme.
- **Node 24** — `readdirSync(dir, { recursive: true })` returns relative paths; normalise `sep`.
- **vitest-axe** — `axe(container)` + `results.violations` toEqual `[]`.
- **`@testing-library/user-event` 14** — `userEvent.setup()` then `await user.tab()` ×3.
- **Playwright 1.62** — four projects (1280×720 ×3, 1194×834 tablet); the stats grid's
  `minmax(200px, 1fr)` puts both tiles on one row at every project width; nothing responsive
  to add.

### Testing standards

- `apps/web` has **no coverage gate** (the deliberate counter-metric) — do not pad. Every test
  above guards a named failure: link count (dead affordance), `aria-current` per route (the
  deferred-work bug 4.1 closed), counts-by-repository (wiring + FD2), StrictMode (the seed's
  double-effect trap), `settings.save` never called + `gol:settings` byte-identity (Decision F),
  the negative "no Epic 6 text" match (no dead sections), route-set (`deferred-work.md:176`), raw
  HTML (prerender vs client-render), axe in a real browser (contrast).
- Never assert colours in jsdom; assert `aria-current` / roles and let the e2e axe own contrast.
- Derive every expected count from the fixture arrays (`Object.keys(MOCK_*_IDS).length`,
  `createMockWorkspace().battles.length`) — a fixture change must fail in the fixture's own
  test once, not here a second time.
- Keep the `vi.hoisted` pathname mock in `AppNav.test.tsx`; the settings page test needs **no**
  router mock (the page file does not render `AppNav`; the layout does).

### Previous story intelligence

- **Story 4.1** (`4-1-organisms-route-top-navigation.md`) — this story's template end to end:
  page-boundary shape, the interim-body principle (FD5 there → FD4 here), the seed-at-boundary
  argument (FD2), the bundle first-measurement rule (Task 5 there), and the review's eleven
  patches — read `:252-262` before writing tests: exact-vs-substring prerender match, listeners
  before the Tab loop, `aria-current` after the client-side navigation, flushed "loading even
  after resolve" assertions, AC-id drift in test names, `AR-27` spelled out for `spec:check`.
- **Story 4.14** (the most recent on `main`, Epic 4 lane): CI went red on WebKit/tablet over a
  ±0.5px `aspect-ratio` — nothing here measures pixels, but its lesson stands: check the actual
  four-browser run on the PR, do not infer it from Chromium.
- **Story 2.4** (`epic-2/2-4-*.md`, `deferred-work.md:188`) — lifted `settings.load()` out of a
  shared `Promise.all` so an unrelated failure could not discard a good settings value. The same
  separation, for a different reason, is FD3's two resources.
- **Story 1.4 / 1.5** (`epic-1/`) — `writeSettingsKey` never stamps `gol:schema`; the seed is
  gated on `isFreshWorkspace()`. Why AC5's "read, never write" is checkable against the raw key.

### Git intelligence

Last 12 commits on `main`: Story 4.14 (preview grid), 4.13 (validation feedback), the README
front door, and the lane-5 gates row. None touch `components/layout`, `app/(gallery)/layout.tsx`,
`app/not-found*`, `e2e/appShell.spec.ts` or `scripts/check-bundle-size.mjs`. Shared surfaces with
the Epic 4 lane on this story: `e2e/organisms.spec.ts` (one count at `:60`; Epic 4 appends
describe blocks at the end — merges cleanly) and `check-bundle-size.mjs` (additive entry; 4.15–4.26
may move the `organisms` figure, not the list). Neither is a dependency — see the lane-gate line
at the end.

### Project Structure Notes

- New: `app/(gallery)/settings/page.tsx` (+ `.test.tsx`), `app/routes.test.ts`,
  `components/settings/SettingsPage.tsx` (+ `.test.tsx`; optionally `WorkspaceStatistics.tsx`),
  `e2e/settings.spec.ts`.
- Modified: `components/layout/AppNav.tsx` (+ test), `app/not-found.test.tsx` (count),
  `app/(gallery)/layout.tsx` (comment), `e2e/appShell.spec.ts` (count + comment),
  `e2e/organisms.spec.ts` (`:60` only), `scripts/check-bundle-size.mjs` (new entry),
  `docs/implementation-artifacts/deferred-work.md`.
- Naming: components PascalCase `.tsx`; non-component TS camelCase, never dotted; new folder
  `components/settings/` mirrors `components/organisms/` (Epic 4's home) — Epic 6's rows land
  here too.
- Variances, recorded not absorbed: `RFC-005:172` types `<SettingsPage settings={repo}>` with
  one repository — this page takes three (the counts, and 5.10's Clear All, need them; the 4.1
  Library added repositories as it read them); `RFC-005:197` / `RFC-001:399` place the file at
  `app/settings/` — FD1. Both go to `deferred-work.md` (Task 7c).
- Untouched on purpose: `AppShell.tsx`, `app/layout.tsx` (no `gol:settings` read, no FOUC
  script — Story 6.5), `packages/*`, every RFC, `OrganismLibrary.tsx`, `BattleGallery.tsx`.

### References

- `docs/planning-artifacts/epics.md:1315-1330` — Epic 5 intro + Story 5.1 ACs; `:1332-1342` (5.2's scope, left intact); `:1369-1391` (5.5/5.6 — "Data Management section", "renders for the first time"); `:1433-1443` (5.10 needs all three repositories); `:1497-1581` (Epic 6's Display / Simulation Preferences sections — must be absent); `:196` AR-28; `:1595` axe on Settings.
- `docs/planning-artifacts/architecture.md:238-249` — Decision F (settings device-local); `:302-330` — Decision K, esp. K.5; `:336-339` — Cross-RFC Reconciliations #1, #4.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:484-489` — FR-8.1; `:493-497` — FR-8.2 (5.2's); `:527-583` — FR-8.6–8.12 (Epic 6's); `:624` — NFR-4.1.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:89-110` (Decision 1, `useAsyncResource`), `:120,172,181,197` (route sketch, tree line, three page surfaces, routing note — the two stale lines FD1 records), `:324-330` (Decision 9).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md:248-271` — Decision 6/7 (`gol:settings`, the FR-8.2 meter belongs to 5.2).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/settings.html` — nav `:59-85,349-358`; header `:88-103,361-364`; card `:105-137`; stats `:282-314,377-390`.
- `docs/planning-artifacts/implementation-readiness-report-2026-07-16.md:48,340` — clinical-lab is canonical; the seam pattern FD4 applies.
- `docs/implementation-artifacts/4-1-organisms-route-top-navigation.md` — the precedent (ACs, FDs, review findings `:252-262`, measured bundle figures `:483-497`).
- `docs/implementation-artifacts/deferred-work.md:176` (route-count guard → this story), `:187` (`aria-busy` trap), `:196` (toolbar band), `:397` (bundle gate mechanism — do not pre-empt), `:722` (`error.tsx` — pre-existing, gains a third surface here; note it in the record, do not fix).
- `docs/implementation-artifacts/lane-gates.yaml` — the 5-vs-4 analysis; this story has no row.
- `docs/project-context.md` — Framework rules (K.5, route groups, `AppShell` route-unaware, AR-27), Testing rules, Code Quality (AR-46, `spec:check`), Development Workflow (`ci:dev`, commit gate).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npm run typecheck` — 5/5 packages pass.
- `npm run lint` — 0 errors, 1 pre-existing warning (`BattleGallery.tsx:248`, unrelated to this
  story — `react-hooks/exhaustive-deps` on `state`).
- `npm run format:check` — clean after `prettier --write` on the three new/edited files it first
  flagged (`SettingsPage.tsx`, `SettingsPage.test.tsx`, `e2e/settings.spec.ts`).
- `apps/web` unit suite (`npx vitest run`): 111 test files, 1824 tests, all passing (includes the
  five new/edited test files this story touches: `AppNav.test.tsx`, `not-found.test.tsx`,
  `routes.test.ts`, `settings/page.test.tsx`, `SettingsPage.test.tsx`).
- `npm run build:standalone`: succeeds; Route (app) table lists `/`, `/_not-found`, `/battle`,
  `/battle/new`, `/organisms`, `/settings` — six static entries, all `○ (Static)`.
- `node scripts/check-bundle-size.mjs` — five routes measured, all within budget:
  - `home (/)`: 333.8 KB gzip / 340 KB budget (6.2 KB headroom)
  - `battle (/battle)`: 309.3 KB gzip / 310 KB budget (0.7 KB headroom — pre-existing tight
    margin, not moved by this story)
  - `battle/new (/battle/new)`: 309.1 KB gzip / 310 KB budget (0.9 KB headroom)
  - `organisms (/organisms)`: 295.6 KB gzip / 305 KB budget (9.4 KB headroom)
  - `settings (/settings)` — NEW: 291.5 KB gzip / 305 KB budget (13.5 KB headroom); budget derived
    as `ceil((291.5 + 12) / 5) * 5 = 305`.
  - AppNav's one added entry moved `home`/`organisms` by **0.0 KB**. No separate before-build was
    taken in this branch; the "before" figures are Story 4.14's record on `main` (the merge base,
    `4-14-preview-grid-drawing.md:880-883`): home 333.8 / battle 309.3 / battle-new 309.1 /
    organisms 295.6 — byte-identical to the four figures above (review 2026-09-21 corrected this
    line: the original read the delta off the size of the change rather than off a measurement).
  - `deferred-work.md:722` (no `error.tsx` under `app/(gallery)/`) gains a third surface with this
    route — `createRepositories()` throwing inside `useMemo` would white-screen `/settings` with no
    shell, as it would `/` and `/organisms`. Pre-existing, same owner; noted, not fixed.
- `npm run ci:dev > /tmp/ci.log 2>&1; echo $?` (redirected to a file, not piped, per
  `project-context.md`'s pipe-swallowed-exit-code warning) — **exit code 0**. Full chain:
  typecheck → lint → format:check → spec:check → boundary:check → test:coverage → build:standalone
  → bundle:check → bench → bench:check → e2e:chromium. `bench:check`: within budget (8.875 ms
  headroom, 53.3% of the frame — unchanged by this story, no engine code touched). `e2e:chromium`:
  **223 passed, 1 skipped** (the skip is `deleteBattle.spec.ts`'s pre-existing touch-pointer test,
  which only runs on the tablet/touch project — unrelated to this story).
- Pushed to `story/5-1-settings-page-shell`; CI fires on `pull_request` only, so the four-browser
  run happens once the PR is opened — check it there (a local green is not proof —
  `project-context.md`).
- Review (2026-09-21, Opus): full `npm run ci` locally — quality chain green; e2e **884 passed,
  4 skipped, 8 failed**, none in `settings.spec.ts`. Six were 30 s `page.goto` timeouts under the
  four-project contention (all six green when re-run serially, `--workers=1`); the other two are
  the pre-existing Story 3.12 "Tab reaches Play…" red on local WebKit/tablet that every Epic 3
  record since 3.13 names and that is green on the Linux runner. Nothing red is this story's.
  Post-patch: `npm run ci:dev` exit 0 and the patched `settings.spec.ts` green on all four
  projects (see the review commit).

### Completion Notes List

- Implemented all 7 tasks per the story's forced decisions (FD1–FD7) with no deviation:
  `/settings` lives under `app/(gallery)/settings/page.tsx` (FD1), runs `useWorkspaceSeed` at its
  own boundary (FD2), gates the page body on `settings.load()` resolving and never degrades to
  `DEFAULT_SETTINGS` on a rejection (FD3), ships only the Workspace Statistics card with its two
  fillable counts — Data Management is deliberately absent until Story 5.5 (FD4), adds no
  document-title work (FD5), copies the section header a third time rather than lifting it (FD6),
  and uses `'prefix'` nav matching, an `<h2>` per card and a `<dl>` for the stat tiles (FD7).
- `AppNav.tsx` gained the `Settings` entry (`'prefix'` match) as the third and final `NAV_ITEMS`
  row; its header comment now states the three entries are the MVP's complete set. Every
  retargeted count guard (`AppNav.test.tsx`, `not-found.test.tsx`, `appShell.spec.ts`,
  `organisms.spec.ts:60`) moved from 2 to 3, and `AppNav.test.tsx` gained `/settings` and
  `/settings/` active-state cases plus a third-tab-stop keyboard assertion.
- `SettingsPage.tsx` reads all three repositories via two independent `useAsyncResource` calls
  (settings; `Promise.all([battles.list(), organisms.list()])`) exactly as FD3 requires — the
  settings resource does not re-run on the seed flip, the counts resource does. `Loading
  settings…` is the prerendered body and the e2e hydration signal.
  `WorkspaceStatistics.tsx` is a sibling component (Story 5.2 grows it) rendering a `<dl>` of
  `div`-wrapped `dt`/`dd` groups, `flexDirection: column-reverse` to match the mockup's
  value-above-label look while keeping DOM order `dt` then `dd`. Neither the card nor the tiles
  carry `transition: all` — only `border-color`, with a `prefers-reduced-motion` escape (the
  `BattleNameField` mid-fade axe trap this codebase avoids everywhere).
- `apps/web/app/routes.test.ts` (Task 4) pins the five-file `page.tsx` set and asserts no path
  contains a dynamic segment. `dirname(fileURLToPath(import.meta.url))` is used instead of
  `new URL('.', import.meta.url)` — the latter threw `TypeError: The URL must be of scheme file`
  under Vitest's Vite-based module loader in this repo; noted in the file's own comment since the
  story's suggested snippet did not survive contact with the real toolchain.
  `deferred-work.md:176`'s entry is struck through and marked resolved.
- `e2e/settings.spec.ts` (new) covers the full Task 5 checklist: hydration signal + zero console
  errors, nav `aria-current` state on `/settings` and `/`, keyboard reachability with the
  WebKit `Alt+Tab` idiom, the prerendered-HTML proof (including the AC4 negative assertions for
  every Epic 6 section name), `gol:settings` byte-identity across two variants (absent, and a
  pre-seeded non-default record), and an axe scan. `appShell.spec.ts` and `organisms.spec.ts:60`
  had their nav-count assertions retargeted 2 → 3; `notFound.spec.ts` was run unchanged (it makes
  no link-count assertion, so it needed no edit) and passed.
- `check-bundle-size.mjs` gained the `settings (/settings)` entry (Task 6); the four existing
  budgets were not touched, and the entry is documented as a first measurement, not a raise
  (`deferred-work.md:397` — the growth-ratchet redesign is not pre-empted).
- `deferred-work.md` gained a new "Deferred from: Story 5-1-settings-page-shell implementation"
  section (Task 7) with the three items the story specified: FD4's Data Management timing call
  (flagged for Sidiar), FD6's now-three-way section-header duplication, and the two stale
  RFC-005 lines (repository count, route path) as a docs-reconciliation item.
  `docs/project-context.md` was left unedited — no new rule met the "unobvious enough to record"
  bar on review of the finished implementation.
- `<dd>`'s ARIA role ("definition") is name-from-author-prohibited, unlike `<dt>`'s ("term"), so
  every test that reads the stat tiles (`SettingsPage.test.tsx`, `settings/page.test.tsx`,
  `settings.spec.ts`) pairs `getAllByRole('term')`/`getAllByRole('definition')` by index/order
  rather than filtering `definition` by an accessible name — the story's own task text names this
  pairing (`getByRole('term')` / `getByRole('definition')`) but not the reason a name-filtered
  `definition` query cannot work; recorded here since it was not obvious going in.
- No new dependencies added; no `packages/*` file touched; `AppShell.tsx` and `app/layout.tsx`
  untouched as specified.

### File List

**New:**
- `apps/web/app/(gallery)/settings/page.tsx`
- `apps/web/app/(gallery)/settings/page.test.tsx`
- `apps/web/app/routes.test.ts`
- `apps/web/components/settings/SettingsPage.tsx`
- `apps/web/components/settings/SettingsPage.test.tsx`
- `apps/web/components/settings/WorkspaceStatistics.tsx`
- `apps/web/e2e/settings.spec.ts`

**Modified:**
- `apps/web/components/layout/AppNav.tsx`
- `apps/web/components/layout/AppNav.test.tsx`
- `apps/web/app/not-found.test.tsx`
- `apps/web/app/(gallery)/layout.tsx`
- `apps/web/e2e/appShell.spec.ts`
- `apps/web/e2e/organisms.spec.ts` (`:60` only)
- `scripts/check-bundle-size.mjs`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml` (status transitions)
- `docs/implementation-artifacts/5-1-settings-page-shell.md` (this file — tasks checked, status,
  Dev Agent Record)

### Change Log

- 2026-09-21 — Implemented (dev-story): Tasks 1–7 complete, all 9 ACs satisfied, `npm run ci:dev`
  green (exit 0) — 223/224 e2e tests passing (1 pre-existing, unrelated touch-pointer skip),
  1824/1824 `apps/web` unit tests passing, coverage/bundle/bench gates all green; status → review.
- 2026-09-21 — Code review (Opus, three adversarial layers): 12 patches applied (vacuous
  loading-while-seeding flush → spies + `toHaveResolved`; `readStats` length guard; e2e tile values
  scoped to their term instead of `definition.nth(i)`; nav e2e asserts Organisms on `/`;
  `routes.test.ts` basename equality; `gol:settings` null asserted in `afterEach`; `aria-busy`
  pinned in both states; AR-28 attribution, AC-id drift, FD qualifiers, stale `:187` citation,
  deferred-work typo, Dev Agent Record evidence), 3 deferred to `deferred-work.md`, 0 decisions
  open; status → done.

Dev Model: sonnet   # follows the page-boundary, route-group, AppNav and e2e patterns Story 4.1 fixed; every design call (sections, gating, seed, header copy) is decided in the FDs above
Proposed lane gate: none
