---
baseline_commit: 1e70bcdf4fd18f12a48c58f01df1888aa7877237
---

# Story 4.2: Organism Card Grid

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want my organisms displayed as cards,
so that I can scan my library at a glance.

## Acceptance Criteria

From `epics.md#Story 4.2: Organism Card Grid` (`:1004-1015`), decomposed into what a reviewer can
check independently. AC6–AC9 are repo-derived: obligations the shipped code, `deferred-work.md`
and the CI gates already name for "the story that replaces the interim list" and "whichever story
next touches the search predicate".

1. **Every organism is a card with a colour chip and its name, laid out per the Library mockup.**
   Once loaded, `/organisms` renders one `<OrganismCard>` per organism inside a CSS grid
   `repeat(auto-fill, minmax(300px, 1fr))` / `gap: 24px` (`organism-library.html:192-197`). Each
   card (`:199-261`): `--gol-bg-secondary` surface, `1px solid var(--gol-border)`, `20px` padding;
   header row = 48×48 chip (`border: 2px solid currentColor`, `border-radius: 4px`, painted in the
   organism's **identity shade** `displayColor(colorToken, MAX_AGE_SHADE)` via inline style — the
   `<OrganismRoster>` `ColorChip` / `<BattleTile>` dot precedent, AR-46-clean) + name as an `<h2>`
   (18px/600, `--gol-text-primary`, overflow-safe). Below the header, the mockup's two stat cells —
   **Dominance** `{dominance}` and **Aging** `Yes|No` (`:269-300`, values in `--gol-accent`) — and
   the rules line as a **count only**: `N rules` / `1 rule` / `No rules` (FD1: the mockup's
   natural-language "Born: 3 neighbors | Survive: 2-3 neighbors" needs a rule summariser that does
   not exist until Story 4.10's vocabulary; recorded in `deferred-work.md`). **Not on the card
   yet:** the usage line (4.19/4.20 — FR-1.7 says counts must agree across all surfaces, so none
   ships early), Edit / Clone / Delete actions (4.17 / 4.18 / 4.21–4.22), and the
   "+ Create New Organism" button (4.3). No dead affordances (NFR-4.1). (FR-1.1, UX-DR19)

2. **Hover and keyboard focus give the same card-level state.** `&:hover, &:focus-within` →
   `border-color: var(--gol-accent)`, `transform: translateY(-2px)`,
   `box-shadow: var(--gol-shadow-tile-hover)` (mockup `:207-211`, already tokenised for
   `<BattleTile>`); transitions **enumerated** (`border-color, transform, box-shadow`), never
   `all`; a `prefers-reduced-motion` escape that also cancels the lift. Each card is a keyboard
   tab stop (`tabIndex={0}` on the `<article>`, named by its own heading via `aria-labelledby`)
   with the house `:focus-visible` ring (`2px solid var(--gol-accent)`, `outline-offset: 2px`).
   No Framer Motion (FD7).

3. **Conway's Classic always appears, first, marked SYSTEM; dev builds show the AR-45 fixtures
   too.** The grid order is a **pure, unit-tested function**: Conway's Classic (`CONWAYS_CLASSIC_ID`)
   pinned first, then the rest by name (case-folded, NFC-normalised, compared with `<`/`>` — never
   `localeCompare`, `lib/gallery/gallerySort.ts` says why), ties by raw name then id. The
   protected card carries `border-color: var(--gol-accent)` at rest and a visible `SYSTEM` tag
   (mockup `.preloaded` / `::before`, `:213-227`) rendered as real text on a new
   `--gol-accent-tint` token (FD6). Under `NODE_ENV=development` the three `createMockOrganisms()`
   names render as cards after Conway's Classic. **No empty state** — M9 says the library is never
   empty; do not build one. (M9, FR-1.5, AR-45)

4. **The search box filters the grid live by name and never touches the store.** The mockup's
   toolbar (`:105-189`) ships with the search input (`placeholder="Search organisms..."`,
   `aria-label="Search organisms"`, 14px, `--gol-border-control` boundary, house focus ring) and
   the count badge; the create button slot stays empty until 4.3. Typing filters cards by
   **case-insensitive, trimmed, NFC-normalised substring** of the displayed name; clearing restores
   the full grid in the AC3 order. The predicate is one shared pure function
   (`lib/organisms/organismNameMatches.ts`) that `<OrganismRoster>` also switches to, which
   **resolves `deferred-work.md:335`** ("pick this up in whichever story next touches the search
   predicate"). Search text is local `useState` (ephemeral UI — RFC-005 Decision 1); the filter
   is an unmemoised per-render scan (`deferred-work.md:337` closed it with a measurement). **Proof
   it is view-only:** a unit test asserts `organisms.list()` is called exactly once across typing
   and that `save` / `delete` / `replaceAll` are never called; the e2e asserts `gol:organisms` is
   byte-identical before and after a search. (UX-DR19; readiness-report 2026-07-16 issue #1)

5. **Zero matches is a message, not a vanished control.** With a non-empty query and no matching
   card the grid area shows `No organisms match “{query}”.` (the roster's copy, verbatim) in
   `StatusText`; the search input **never unmounts** and keeps focus (the exact failure
   `deferred-work.md:327` records for the roster). The count badge reads `N Organisms` /
   `1 Organism` with no query and `M of N Organisms` while filtering (pluralised by N), and is a
   `role="status"` polite live region — the one place filter results are announced (FD4).

6. **The grid passes axe with keyboard-focusable cards.** vitest-axe on `<OrganismCard>` and
   `<OrganismLibrary>` (ready, filtered, and zero-match states) → `[]`; `@axe-core/playwright` on
   the served `/organisms` in the ready and zero-match states → `[]`. A unit test tabs
   search input → first card → second card in DOM order (`userEvent.tab()`); the e2e walks the
   same order in a real browser (WebKit `Alt+Tab` caveat, `organisms.spec.ts:48-89`). (AR-44,
   UX-DR17)

7. **Existing guards are retargeted, never loosened.** The interim `<ul>` becomes the card grid
   `<ul role="list" aria-label="Organisms">` of `<li>` → `<article>`, so
   `OrganismLibrary.test.tsx`'s two `getAllByRole('listitem')` counts (`:42`, `:60`) keep working
   as counts; the "nothing else" test additionally asserts the order (AC3) and the chip colours.
   `app/(gallery)/organisms/page.test.tsx` and `e2e/organisms.spec.ts` query by name text and stay
   green unchanged — but **run them**; the `organisms.spec.ts:18` comment ("this list item") is
   corrected to "this card". `OrganismRoster.test.tsx` stays green after the predicate swap
   (AC4). `lib/displayOrganisms.test.ts` stays green after the `toDisplayOrganism` extraction
   (FD3).

8. **The bundle gate still passes on the measured route.** `npm run build:standalone` +
   `node scripts/check-bundle-size.mjs` before and after; `/organisms` (budget 305, 290.5 KB
   baseline from Story 4.1) absorbs the cards, and `/battle` moves by at most the shared
   `organismNameMatches` import. **No budget is raised** — if `/organisms` crosses 305 that is a
   finding to report, not a number to nudge (Sidiar's standing gate preference;
   `deferred-work.md:392` retires the absolute mechanism separately). No MUI `TextField` /
   `Card` / `Grid` imports (FD8). Record all four figures in the Dev Agent Record.

9. **`npm run ci` is green locally (exit code captured, never piped to `tail`) and CI on the
   pushed branch is checked, not inferred** (`gh run list --limit 1` once the PR exists).

## Tasks / Subtasks

- [x] **Task 1 — Pure helpers in `lib/organisms/`** (AC: 3, 4)
  - [x] `apps/web/lib/organisms/organismNameMatches.ts` (new folder — Epic 4's non-component
        helpers, beside `lib/gallery/` and `lib/layout/`):
        `export function normalizeOrganismSearch(text: string): string` →
        `text.trim().normalize('NFC').toLocaleLowerCase()`, and
        `export function organismNameMatches(name: string, normalizedQuery: string): boolean` →
        `normalizeOrganismSearch(name).includes(normalizedQuery)`. Doc-comment **why** (a decomposed
        "é" never matches a precomposed one; Turkish dotted/dotless i under `toLowerCase`; mobile
        keyboards append a trailing space) and cite `deferred-work.md`'s 2.10-review entry + `(Story
        4.2)`. The query is normalised **once by the caller**, not per name.
  - [x] `organismNameMatches.test.ts`: table-driven — `('Conway\'s Classic', 'con') → true`,
        `('Conway\'s Classic', 'CON ') → true` (caller-trimmed), `('Café', 'café')` (NFD query
        vs NFC name) → true and the reverse, `('AZURE', 'zure') → true`,
        `('Azure', 'azur e') → false`, empty query → true for every name. **No Turkish-i row**:
        `toLocaleLowerCase()` with no argument follows the host locale, so that assertion would be
        green locally and red on a differently-configured runner — the entry's point is that the
        locale-aware form is the *correct* one, not that a specific locale is in effect.
  - [x] `apps/web/lib/organisms/sortLibrary.ts`:
        `export function sortLibrary(organisms: readonly Organism[]): Organism[]` — copies before
        sorting (`Array#sort` mutates the repository's own array — `gallerySort.ts:9`); comparator:
        `CONWAYS_CLASSIC_ID` first (import from `@gol/domain`), then
        `normalizeOrganismSearch(a.name)` vs `…(b.name)` with `<`/`>`, then raw `name`, then `id`.
        Doc-comment why not `localeCompare` (copy `gallerySort.ts:10-11`'s reason — ICU varies by
        runner) and why insertion order is not a contract (`LocalStorageOrganismRepository.list()`
        is `Object.values` of the stored object; an API-backed repository promises nothing —
        AR-2/AR-27).
  - [x] `sortLibrary.test.ts`: Conway's pinned first regardless of input position; `['beta',
        'Alpha', 'alpha']` → `Alpha, alpha, beta` (case-fold then raw name); same name → by id;
        input array untouched (`toEqual` the original after the call); a second Conway-like name
        (`"Conway's Classic"` with a different id) is **not** pinned — the pin is by id, not name.

- [x] **Task 2 — One owner for name/colour fallback** (AC: 1, 7) — FD3
  - [x] `apps/web/lib/displayOrganisms.ts`: extract the resolved branch of
        `resolveDisplayOrganisms` (`:115-120`) into
        `export function toDisplayOrganism(organism: Organism): DisplayOrganism` (empty/whitespace
        name → `UNNAMED_ORGANISM`; `color: displayColor(organism.colorToken, MAX_AGE_SHADE)`;
        `colorToken`), and call it from `resolveDisplayOrganisms`. Behaviour is unchanged; the
        module's own doc (`:5-11`) is the reason a second resolver is not written in the card.
  - [x] `displayOrganisms.test.ts`: add two cases for `toDisplayOrganism` (a normal organism; an
        all-whitespace name → `Unnamed organism`). Existing cases unchanged.

- [x] **Task 3 — `<OrganismCard>`** (AC: 1, 2, 3, 6)
  - [x] `apps/web/components/organisms/OrganismCard.tsx` — `'use client'`, props
        `{ organism: Organism; system?: boolean }`. `system` is passed by the Library (which owns
        the M9 knowledge, `organism.id === CONWAYS_CLASSIC_ID`); the card stays dumb.
        Derive `const display = toDisplayOrganism(organism)`; `const nameId = useId()`
        (`BattleNameField.tsx:110-113` — a hydrated static export, never a hand-rolled id).
  - [x] Structure (mockup `:420-444`, minus the deferred parts):
        `<Card tabIndex={0} aria-labelledby={nameId} data-system={system ? '' : undefined}>` →
        `<CardHeader>` (`display:flex; gap:14px; align-items:center; margin-bottom:16px;
        padding-bottom:12px; border-bottom:1px solid var(--gol-border)`) containing
        `<ColorChip aria-hidden="true" style={{ background: display.color, color: display.color }} />`
        (48×48, `border: 2px solid currentColor`, `borderRadius: '4px'` — a literal length is fine,
        `--gol-radius` is the MUI shape token, `BattleTile.tsx:263-273` uses a literal too) and
        `<CardName as h2 id={nameId}>` (`minWidth: 0; overflowWrap: anywhere` — `BattleTile.tsx:163-177`
        explains the 50-char no-space name case; **h2** because the page's only h1 is the section
        title, and axe's heading-order rule checks it). Then `<CardStats>` (2-col grid, gap 12px)
        with two `<StatItem>` (`--gol-bg-hover` surface, `1px solid var(--gol-border)`, centred):
        `<StatLabel>Dominance</StatLabel><StatValue>{dominance}</StatValue>` and
        `Aging` / `{agingEnabled ? 'Yes' : 'No'}` — label 11px uppercase `--gol-text-secondary`,
        value 18px/600 `--gol-accent`. Then `<RulesLine>` 12px `--gol-text-secondary`:
        `ruleCountLabel(survivalRules.length)` → `No rules` / `1 rule` / `N rules`. When `system`,
        `<SystemTag aria-label="System organism">SYSTEM</SystemTag>` absolutely positioned
        top/right 12px (10px/600, `--gol-accent` on `--gol-accent-tint`, `1px solid var(--gol-border)`,
        `letter-spacing: 0.5px`) — **real text, not `::before`**, so it is in the accessibility tree
        and screen readers hear why Delete will be disabled in 4.22. `Card` gets
        `'&[data-system]': { borderColor: 'var(--gol-accent)' }` for the rest border.
  - [x] `Card = styled('article')` — copy `BattleTile.tsx:52-76`'s `Tile` shape (surface, border,
        padding, `position: relative`, enumerated transitions, `&:hover, &:focus-within` lift,
        reduced-motion escape) and add `'&:focus-visible': { outline: '2px solid var(--gol-accent)',
        outlineOffset: '2px' }`. **No `cursor: pointer`** — the card has no click action until
        4.17; a pointer cursor on a non-interactive surface is a dead affordance (NFR-4.1). Comment:
        `:focus-within` matches the article itself when it is the focused element, which is what
        gives the keyboard path the hover state (the Story 1.9 parity rule).
  - [x] Header comment: mockup line refs; **FD5** (why the article is the tab stop *now* and what
        4.17 decides); AR-46 (inline resolved colour, the roster precedent); cite `(Story 4.2)`,
        `(FR-1.1)`, `(M9)` exactly as `spec:check` tokenises them.
  - [x] `OrganismCard.test.tsx`: renders name as `heading level 2`; chip has
        `style.background === displayColor(token, MAX_AGE_SHADE)` (import the LUT in the test —
        never a literal hex; test files are lint-exempt but the LUT is the truth); Dominance/Aging
        values from `createMockOrganisms()` (Patient Defender → `Yes`, dominance 45); rule-count
        label for 0 / 1 / n rules; `system` renders the `SYSTEM` tag and `data-system`, absent
        otherwise; the article is focusable (`tabIndex 0`) and `toHaveAccessibleName(name)`; an
        all-whitespace name renders `Unnamed organism`; axe `[]`.

- [x] **Task 4 — `<OrganismLibrary>` body: toolbar + grid + search** (AC: 1, 3, 4, 5, 6, 7)
  - [x] `OrganismLibrary.tsx`: keep props, `useAsyncResource` wiring and the status fold **exactly
        as they are** (`:53-68`); keep `SectionHeader`/`SectionTitle`/`SectionSubtitle` duplicated
        (FD9 — do not touch `BattleGallery.tsx`, update the `:15-19` comment to say the lift now
        waits for Story 3.17's Gallery change to land). Add `const [searchText, setSearchText] =
        useState('')`.
  - [x] Toolbar, **outside** the `aria-busy` wrapper, between the header and the wrapper (the
        `:76-78` comment already reserves this slot): `<Toolbar>` with the mockup's **full** band
        rules — `display:flex; justify-content:space-between; align-items:center; gap:20px;
        flex-wrap:wrap; margin-bottom:35px` (`:105-113`; `deferred-work.md`'s "toolbar band ships
        without the mockup's layout rules" entry is why the Gallery's `marginBottom`-only band must
        not be copied — this band has two children on day one). Inside: `<ToolbarLeft>` (`flex:1;
        gap:15px`) holding `<SearchField>` (`position:relative; flex:1; max-width:400px`) →
        `<SearchInput type="text" placeholder="Search organisms..." aria-label="Search organisms"
        value={searchText} onChange=… />` + `<SearchIcon aria-hidden="true">⌕</SearchIcon>`
        (absolute right 14px, `--gol-text-tertiary`, `pointer-events:none`). Style the input per
        mockup `:148-167` **with the house substitutions** `BattleNameField.tsx:14-19` records:
        `--gol-border-control` (SC 1.4.11), a real `:focus-visible` ring (`outline-offset: -2px`),
        `--gol-bg-hover` on focus, enumerated `border-color 0.2s` transition + reduced-motion
        escape, `--gol-text-secondary` placeholder at 0.8 opacity. **No `<form>`** (Enter would
        submit → full reload under `output: 'export'`, `BattleNameField.tsx:95-99`). Wrap the field
        in `<div role="search">`. The create-button slot is empty — leave a one-line comment naming
        Story 4.3.
  - [x] Count badge on the right (`<CountBadge role="status">`, mockup `:180-189`: 12px uppercase
        `--gol-text-secondary`, `--gol-bg-secondary`, `1px solid var(--gol-border)`, `10px 14px`,
        `white-space:nowrap`), rendered **only when `status === 'ready'`**; text from a small pure
        helper in the same file: `organismCountLabel(shown, total, filtering)` → `4 Organisms` /
        `1 Organism` / `2 of 4 Organisms` / `0 of 1 Organism`. One live region on the page (FD4).
  - [x] Ready body: `const sorted = sortLibrary(resource.data ?? [])`; `const query =
        normalizeOrganismSearch(searchText)`; `const visible = query === '' ? sorted :
        sorted.filter((o) => organismNameMatches(toDisplayOrganism(o).name, query))` — match on the
        **displayed** name so `Unnamed organism` is searchable as what the user sees. Unmemoised;
        cite `deferred-work.md`'s 3.7 measurement in a comment. Render
        `<CardGrid as="ul" role="list" aria-label="Organisms">` (explicit `role="list"`: Safari
        drops list semantics under `list-style: none`) → `<li key={organism.id}>` →
        `<OrganismCard organism={organism} system={organism.id === CONWAYS_CLASSIC_ID} />`.
        `CardGrid`: the mockup grid (`minmax(300px, 1fr)`, `gap: 24px`, `margin: 0; padding: 0;
        list-style: none`). When `visible.length === 0 && query !== ''`: `<StatusText>No organisms
        match “{searchText}”.</StatusText>` **instead of** the grid (the input is in the toolbar,
        so it survives). `visible.length === 0 && query === ''` cannot happen (M9) — do not code a
        branch for it; a comment says so.
  - [x] `OrganismLibrary.test.tsx` — keep the seven tests (retarget only what AC7 names) and add:
        (a) order: with mocks saved **before** Conway's Classic, the `listitem`s' headings read
        `Conway's Classic, Aggressive Colonizer, Chaotic Spreader, Patient Defender`; (b) typing
        `pat` (via `userEvent.type`) leaves one card, badge `1 of 4 Organisms`; `user.clear()`
        restores four and `4 Organisms`; (c) `zzz` → `No organisms match “zzz”.` visible, zero
        `listitem`s, the search input still in the document **and still focused**
        (`toHaveFocus()`); (d) **view-only proof**: spies on `list`/`save`/`delete`/`replaceAll`
        from `createFakeRepositories({ organisms: [...mocks, CONWAYS_CLASSIC] })` — `list` called
        once total, the others never, across type + clear; (e) tab order: `user.tab()` from body
        → search input → first card (`document.activeElement` is the article named Conway's
        Classic) → second card; (f) axe `[]` in the filtered and zero-match states (the ready
        state is already covered); (g) the badge is absent while loading and has `role="status"`
        when ready. `afterEach`: `vi.restoreAllMocks()` (already there).

- [x] **Task 5 — Roster swap + token** (AC: 4, 3)
  - [x] `apps/web/components/battle/editor/OrganismRoster.tsx:352,360`: `const query =
        normalizeOrganismSearch(searchText)` and
        `library.filter((organism) => organismNameMatches(organism.name, query))`. Replace the
        `:343-351` "Case-insensitive substring…TRIMMED" paragraph with two lines pointing at the
        helper; **keep** the `:353-359` unmemoised-measurement paragraph verbatim. Nothing else in
        the file changes; `OrganismRoster.test.tsx` runs unchanged. ⚠️ This is the one file the
        Epic 3 lane could also be editing (3.11 reshapes `<BattlePage>`, not the roster, but check
        `git log origin/main -- apps/web/components/battle/editor/OrganismRoster.tsx` before
        starting; if a 3.x change is pending there, still make the edit — it is two lines and
        merges cleanly).
  - [x] `apps/web/app/themes.css`: add `--gol-accent-tint: rgb(var(--gol-accent-channel) / 0.1);`
        beside `--gol-shadow-tile-hover` (`:113`, same construction), with a comment: the SYSTEM
        tag's fill (mockup `rgba(0, 212, 255, 0.1)`), derived from the channel token so Epic 6's
        override block retunes it for free (Decision J — derived shades are their own tokens; the
        AR-46 rule flags `rgb(...)` literals in `.tsx`, which is why this cannot be inlined).
        `lib/themeTokens.test.ts` needs no change (it sweeps hex tokens; the "every reference
        resolves" suite picks the new token up automatically) — run it to prove that.

- [x] **Task 6 — e2e against the served static export** (AC: 3, 4, 5, 6, 8)
  - [x] `apps/web/e2e/organisms.spec.ts`: fix the `:18` comment wording; add a
        `test.describe('organism card grid (Story 4.2)')` block reusing the file's console/pageerror
        capture and the `getByText("Conway's Classic")` hydration signal:
        1. **Card + badge**: the Conway's Classic card is an `article` with accessible name
           `Conway's Classic`, contains `SYSTEM`, `Dominance` `50`, `Aging` `No`, `2 rules`
           (`CONWAYS_CLASSIC.survivalRules.length` — import from `@gol/test-utils`, e2e is
           lint-exempt); badge `getByRole('status')` reads `1 Organism` (production build → no
           AR-45 fixtures, `epics.md:426`).
        2. **Search is view-only**: read `localStorage['gol:organisms']` after hydration; type
           `zzz` into `getByRole('textbox', { name: 'Search organisms' })` → no
           `article`, `No organisms match “zzz”.` visible, badge `0 of 1 Organism`, input still
           focused; type `con` → the card is back; clear → badge `1 Organism`; re-read
           `localStorage['gol:organisms']` → `toBe` the earlier string. `errors` `toEqual([])`.
        3. **Keyboard**: click the search input, `Tab` → `document.activeElement` is the article
           named Conway's Classic (bounded loop ≤ 5, WebKit branch per `:48-89` — `Alt+Tab` on
           `webkit`/`tablet`); `:focus-visible` cannot be asserted cross-engine, so assert focus
           only.
        4. **axe** after hydration → `[]`, and again in the zero-match state → `[]`. This is
           the only real-browser contrast check of `--gol-accent` on `--gol-accent-tint` (10px
           SYSTEM text) and of the stat cells.
  - [x] Do **not** add a fourth copy of `buildSeedPayload`/`seedWorkspace` (`deferred-work.md:193`
        names three already); the production seed gives this spec everything it needs.

- [x] **Task 7 — Bundle measurement, docs, verification** (AC: 7, 8, 9)
  - [x] `npm run build:standalone && node scripts/check-bundle-size.mjs` on `main` (or the
        pre-story commit) and again after Task 6. Record all four routes. Expected: `/organisms`
        +2–4 KB (styled components + two helpers), `/battle` ±0.5 KB (the roster now imports
        `organismNameMatches`), `/` unchanged. Do **not** edit `budgetGzipKb`; if `/organisms`
        exceeds 305, stop and report the measurement (AC8).
  - [x] `deferred-work.md`: strike the `:335` predicate entry with `**✅ Resolved in Story 4.2** —
        `lib/organisms/organismNameMatches.ts` (NFC + `toLocaleLowerCase`), consumed by
        `<OrganismLibrary>` and `<OrganismRoster>`` (strike-through + resolution; never delete).
        Add a `## Deferred from: Story 4-2-organism-card-grid (date)` section with: (1) the
        rules-preview natural-language summary (FD1 — after 4.10); (2) the card-as-tab-stop policy
        handoff to 4.17 (FD5); (3) the `SectionHeader` lift, now blocked behind Story 3.17's
        Gallery edit (FD9). Same heading shape the file already uses (`:642`).
  - [x] `docs/project-context.md`: **no rule changes expected.** If the dev finds a new "compiles
        but wrong" trap (not a route list, not a summary), add one line under the matching section;
        otherwise leave it.
  - [x] `npm run ci > /tmp/ci.log 2>&1; echo $?` — paste the exit code, the four bundle lines and
        the e2e summary into the Dev Agent Record. Push to `story/4-2-organism-card-grid`; check
        `gh run list --limit 1` after the PR opens (the workflow is `main` + `pull_request` only —
        Story 4.1 review note).

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Card content = chip, name, Dominance, Aging, rule count; usage line, actions and the
  rules sentence are other stories'.** FR-1.1 asks for name + colour; the mockup and the UX
  completion review (`UX-PHASE-COMPLETION-REVIEW.md:20`) add dominance / aging / rules preview.
  Dominance and aging are fields on the record and cost two styled cells; rule *count* is
  `survivalRules.length`. The rules **sentence** ("Born: 3 neighbors | Survive: 2-3 neighbors")
  needs a summariser over action/condition vocabulary that Story 4.10 defines — writing it here
  means writing it twice. "Used in N battles" is FR-1.7, which demands one number across every
  surface; 4.19 builds the index and 4.20 the UI. Edit/Clone/Delete are 4.17/4.18/4.22; a button
  that does nothing is a dead affordance (NFR-4.1) — the same reason 4.1 shipped no toolbar.

- **FD2 — Ordering is Conway's Classic first, then name; a pure function.** `list()` returns
  `Object.values` insertion order — deterministic for localStorage today but not a repository
  contract, and reversed by a fresh seed vs a reload (the exact non-reproducibility
  `gallerySort.ts` fixed for battles). `Organism` has no timestamps, so name is the only stable
  key; Conway's pin is by **id** (`CONWAYS_CLASSIC_ID`), never by name (a user may name a clone
  identically — `deferred-work.md:363`, names are not unique).

- **FD3 — `toDisplayOrganism` is extracted, not duplicated.** `displayOrganisms.ts:5-11` exists
  because a second resolver (fallback name, identity-shade colour) was the outcome Story 2.9
  forbade. The card needs exactly that branch; pulling it out is a five-line refactor covered by
  the existing tests. `displayColor` returns an `hsl(...)` string (built by template substitution
  to dodge the AR-46 selector) — pass it through an inline `style`, never a styled prop.

- **FD4 — One live region: the count badge.** SC 4.1.3 wants filter results announced; the
  roster's zero-match message is deliberately *not* live and `deferred-work.md:327` records what
  that cost. Announcing "2 of 4 Organisms" politely per keystroke is the standard results pattern;
  making the zero-match message live *as well* would double-announce. The input lives in the
  toolbar, outside both the `aria-busy` wrapper and the conditional grid, so it can never unmount
  under the user's focus.

- **FD5 — The `<article>` is the tab stop, for now.** The AC says "keyboard-focusable cards".
  `<BattleTile>` solved this with a stretched title *link* because tiles navigate; organism cards
  open a modal (4.17), which does not exist yet, so there is no control to be the stop.
  `tabIndex={0}` + `aria-labelledby` makes each card a named stop that reads its organism aloud
  and lights the hover state via `:focus-within`. **Story 4.17 decides** whether the card stays a
  stop once Edit lands inside it (a stop wrapping stops is legal but noisy) — that is the
  `deferred-work.md` entry Task 7 adds. `role="img"` with `tabIndex` (the dot precedent) is
  wrong here: a card is content, not an image.

- **FD6 — `--gol-accent-tint` is a new token.** The mockup's SYSTEM fill is
  `rgba(0, 212, 255, 0.1)`; the AR-46 rule flags any `rgb(...)` literal in `.tsx`
  (`eslint.config.mjs:34`), and Decision J says derived shades are their own tokens.
  `--gol-shadow-tile-hover` is the precedent (channel token / alpha). Not `--gol-bg-hover`: that
  is a neutral surface and reads as "hover", not "accent".

- **FD7 — No Framer Motion.** `RFC-003:210-219` sketches `OrganismCard` as a `motion.div`. The
  package is not installed, `/organisms` has 14.5 KB of headroom, and RFC-003's own performance
  rule (`:222`) prefers CSS transforms. `<BattleTile>`'s CSS lift is the house implementation of
  this exact hover. **Flagged, not silently overridden**: the snippet is illustrative, like the
  RFC-005 `<Routes>` sketch Story 4.1 recorded.

- **FD8 — No MUI `TextField` / `Card` / `Grid`.** `BattleNameField.tsx:101-102`: Story 2.9 won
  ~10 KB by not importing `TextField`; MUI `Grid` cannot express `auto-fill`
  (`BattleGallery.tsx:122-123`). Styled primitives + native CSS grid, as every list surface in
  the app already does.

- **FD9 — `SectionHeader` stays duplicated.** 4.1 allowed the lift *only* together with switching
  `BattleGallery`. `BattleGallery.tsx` is Story 3.17's surface (run-from-Gallery) in the
  **parallel Epic 3 lane** — editing it here invites a merge conflict for twenty lines of CSS.
  Update the comment; do the lift in the first story after 3.17 that touches both.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/OrganismLibrary.tsx` (+ test) | The file being modified. Keep the hook wiring, the status fold and the `aria-busy` scoping; replace the `<ul>` body; add toolbar + search state. |
| `apps/web/components/gallery/BattleTile.tsx:52-76, 163-177, 189-209` | **Copy the `Tile` shape** for `Card` (enumerated transitions, hover/focus-within lift, reduced-motion); the h2 + `minWidth: 0` overflow guard; the focus-ring convention. |
| `apps/web/components/battle/editor/OrganismRoster.tsx:84-98, 193-226, 343-370, 509` | The chip precedent (inline resolved colour + `aria-hidden`), the `SearchInput` house substitutions, the predicate you are lifting, the zero-match copy. |
| `apps/web/components/battle/editor/BattleNameField.tsx:7-51, 89-113` | 14px input styling, `useId`, no-`<form>` rule, no-MUI-`TextField` rule. |
| `apps/web/lib/displayOrganisms.ts` | Where `toDisplayOrganism` is extracted from; `UNNAMED_ORGANISM`; why colour is `MAX_AGE_SHADE`, not age 0. |
| `apps/web/lib/palette/displayColor.ts:9,71` | `MAX_AGE_SHADE`, `displayColor(token, shade)` → `hsl(...)` string. |
| `apps/web/lib/gallery/gallerySort.ts` | The sort convention: copy, `<`/`>` not `localeCompare`, deterministic tie-breaks. |
| `apps/web/components/gallery/BattleGallery.tsx:114-128` | The toolbar band that shipped without layout rules (do not copy), the native-grid rationale. |
| `apps/web/app/themes.css:99-120` | Channel tokens and the `--gol-shadow-tile-hover` construction the new token mirrors. |
| `eslint.config.mjs:17-39, 83-102` | What AR-46 catches (`#hex`, `rgb()`, `hsl()` in string/template literals; tests, specs, e2e exempt). |
| `packages/domain/src/organismSchema.ts`, `defaultWorkspace.ts:23,65` | `Organism` fields (`survivalRules`, not `rules`; `name` has no floor), `CONWAYS_CLASSIC_ID`, `CONWAYS_CLASSIC`. |
| `packages/test-utils/src/mockWorkspace.ts:165-200`, `fakeRepositories.ts:75` | The three fixture names/tokens/dominance/aging (Patient Defender is the aging one); `createFakeRepositories({ organisms })`. |
| `apps/web/e2e/organisms.spec.ts` | Hydration-signal discipline, WebKit `Alt+Tab` branch, raw-HTML prerender proof — extend, do not fork. |
| `scripts/check-bundle-size.mjs:92-100` | The `/organisms` entry: 290.5 KB measured, 305 budget, the formula, "not a raise". |
| `docs/implementation-artifacts/deferred-work.md:187, 193, 327, 335, 337, 363, 392` | The obligations this story inherits (listed under Architecture compliance). |

### Architecture compliance

- **AR-2 / AR-27** — `OrganismLibrary` keeps receiving `organisms: OrganismRepository`; the card
  receives a plain `Organism`. No repository import, no Context, no `createRepositories()` below
  the page file. Still **no `battles` prop** — the usage index is 4.19's (4.1 Task 3).
- **RFC-005 Decision 1 / three state categories** — search text is ephemeral local `useState`;
  the library list stays in `useAsyncResource`; nothing persisted, nothing in refs.
- **M9** — Conway's Classic is present and pinned; no empty state exists to build. **M6** — the
  library is uncapped; the grid is `auto-fill` and the filter is O(n) per render (measured).
- **Decision J / RFC-003 Decision 3 / AR-46** — `styled()` + `var(--gol-*)` only; resolved
  organism colours via inline `style` (RFC-007 Decision 5: organism colours are **not** theme
  variables; there is no `--gol-organism-*`). One new token, in `themes.css`, on bare `:root`
  (project-context's token-layer rule: the default theme is not in a `[data-theme]` block).
- **Decision K.5** — no route change; `/organisms` stays a static path.
- **RFC-007 Decision 4 / B.2** — identity shade = age-cap shade (`MAX_AGE_SHADE`), the same LUT the
  cells use, so a chip never disagrees with a thumbnail.
- **AR-44 / UX-DR17** — axe in jsdom **and** in the four Playwright projects; keyboard order pinned
  by a test that walks it.
- **Spec-id hygiene** — `spec:check` tokenises `AR-46`, `FR-1.1`, `M9`, `Decision J`, `RFC-007`,
  `Story 4.2`; write them exactly so. `UX-DR19` and `deferred-work.md:NNN` are not checked.
- **Inherited `deferred-work.md` obligations:** `:335` resolved here (AC4); `:327` not repeated
  (AC5); `:187` not repeated (search/badge outside `aria-busy`); `:193` not worsened (no fourth
  seed-helper copy); `:337` cited (unmemoised filter); `:363` respected (key by id, pin by id);
  `:392` respected (no budget nudge).

### Library / framework notes (installed versions, no research needed)

- **Next 16.2.x, `output: 'export'`** — `useId()` is SSR-safe and hydration-stable; `useState`
  for the search text hydrates as `''`, matching the prerendered HTML (the toolbar renders in the
  SSR body; the badge does not, because status is `loading` at build time — so the prerender proof
  test's `Loading organisms…` assertion still holds).
- **React 19.2** — `<ul>` with `role="list"` is fine; `tabIndex={0}` on `<article>` is fine.
- **MUI 9.3.1 / Emotion** — `styled('article')`, `styled('ul')`, `styled('input')`; attribute
  selectors (`'&[data-system]'`) over Emotion cross-component selectors (`BattleTile.tsx:63-68`
  precedent).
- **vitest-axe** — `axe(container)` + `results.violations` `toEqual([])`; run it in each visual
  state, not just ready. **`@testing-library/user-event` 14** — `userEvent.setup()`; `type`,
  `clear`, `tab`.
- **Playwright 1.62** — `getByRole('status')` for the badge; the search input's role is `textbox`
  (`type="text"`); WebKit needs `Alt+Tab` to reach the article (`organisms.spec.ts:48-89` and the
  4.1 Debug Log explain the engine default).
- **`String.prototype.normalize('NFC')` / `toLocaleLowerCase()`** — both available in Node 24 and
  every Playwright engine; no polyfill, no ICU flag.

### Testing standards

- `apps/web` has **no coverage gate** — every test above guards a named failure: order (a fresh
  seed vs reload rendering differently), view-only search (a `save` from a filter), the input
  surviving zero matches (the `:327` trap), the badge as the only live region, tab order (the
  1.9 parity rule), axe in three states, the LUT-sourced chip colour (a chip disagreeing with its
  thumbnail), the prerender body (a client-rendered page on a 404 shell).
- Never assert colours in jsdom beyond the inline `style` string; contrast is the e2e axe run's
  job. Never snapshot the card.
- `lib/organisms/*` are pure — table-driven tests, no React.
- The roster's own tests must not be edited to make the swap pass; if one fails, the helper is
  wrong, not the test.

### Previous story intelligence (Story 4.1)

- Page boundary, `useWorkspaceSeed` at `/organisms` (FD2 there), the `seedStatus` dep re-run, and
  the `aria-busy` scoping are all **settled** — do not revisit. The 4.1 review found the
  seeding→ready re-run test was asserting synchronously; the fixed shape (`waitFor` on the spy's
  resolution) is the one to copy for the new list-call-count test.
- 4.1 explicitly left for 4.2: the card grid, colour chip, hover states, search box, count badge,
  ordering (Conway's first), "no empty state" (M9), and the `SectionHeader` lift decision (FD9
  above resolves it: not now).
- The 4.1 review dismissed "empty ready state / whitespace names" as 4.2's — the whitespace case
  is `toDisplayOrganism`'s `Unnamed organism` (FD3); the empty case does not exist (M9).
- Bundle: 4.1 measured 290.5 KB on `/organisms` and noted an **unattributed** +1.1 KB on `/`
  from chunk-splitting alone; do not attribute deltas without a chunk-level diff.
- WebKit does not Tab to plain links or, by default, walk `tabindex` stops the same way — the
  keyboard e2e branches on `browserName` (`Alt+Tab` on WebKit); reuse that branch.
- Story 3.8 (the other lane's latest merge) touched `packages/simulation` and
  `components/battle/simulation/` only — no overlap with this story's files.

### Git intelligence

Last 12 commits on `main`: Story 4.1 (feat + review fixes — the only commits touching
`components/organisms/`), Story 3.8 (`packages/simulation`, `components/battle/simulation/`), the
lane-aware `implement-next-story` recipe. Nothing recent touched `components/gallery/`,
`app/themes.css`, `lib/theme.ts`, `lib/displayOrganisms.ts` or `OrganismRoster.tsx`. **Shared
surfaces with the open Epic 3 lane (3.9–3.19):** `themes.css` (one additive token line),
`lib/displayOrganisms.ts` (one additive export; 3.14's population stats may consume
`DisplayOrganism`), `OrganismRoster.tsx` (two lines), `scripts/check-bundle-size.mjs` (comment
only, if at all). All additive; none is a gate. `BattleGallery.tsx` is deliberately **not**
touched (FD9).

### Project Structure Notes

- New: `lib/organisms/organismNameMatches.ts` (+ test), `lib/organisms/sortLibrary.ts` (+ test),
  `components/organisms/OrganismCard.tsx` (+ test).
- Modified: `components/organisms/OrganismLibrary.tsx` (+ test), `lib/displayOrganisms.ts`
  (+ test), `components/battle/editor/OrganismRoster.tsx` (2 lines + comment),
  `app/themes.css` (1 token), `e2e/organisms.spec.ts` (new describe block + one comment),
  `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Naming: components PascalCase `.tsx`; helpers camelCase, never dotted
  (`organismNameMatches.ts`, not `organism-name.matches.ts`). `lib/organisms/` is the new home for
  Epic 4's non-component logic (mirrors `lib/gallery/`).
- Untouched on purpose: `BattleGallery.tsx`, `BattleTile.tsx`, `app/(gallery)/organisms/page.tsx`
  (+ test), `AppNav`, `packages/*`, `lib/theme.ts`, `scripts/check-bundle-size.mjs` budgets.

### References

- `docs/planning-artifacts/epics.md:1004-1015` (Story 4.2 ACs), `:33` FR-1.1, `:37` FR-1.5,
  `:39` FR-1.7, `:218-220` AR-44/45/46, `:242` UX-DR17, `:244` UX-DR19, `:426` AR-45 dev-only
  seeding, `:1017` (4.3 create button), `:1189-1262` (4.17/4.18/4.22 card actions),
  `:1214-1238` (4.19/4.20 usage).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:116-117` FR-1.1 (name + colour
  indicator only), `:137,140-145` FR-1.4/1.5 protected default, `:155` FR-1.7 lives in the editor
  footer.
- `docs/planning-artifacts/implementation-readiness-report-2026-07-16.md:316,399,415` — issue #1
  (search AC added to 4.2).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/organism-library.html:105-347,404-444`
  — toolbar, search, badge, grid, card, hover, `.preloaded`/SYSTEM, stats, actions;
  `UX-PHASE-COMPLETION-REVIEW.md:20-36` — card content per FR; `ux-design-complete.md:708-711`.
- `docs/planning-artifacts/architecture.md:352` M6, `:355` M9, `:263-274` Decision H,
  `:289-297` Decision J, `:178` B.2 (identity colour = age-cap shade).
- `docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md:49-67,121-141` Decisions 1/4/5;
  `RFC-003-frontend-ui-architecture.md:210-222` (Framer sketch — illustrative, FD7);
  `RFC-005-application-state-modes-undo.md:71,126-133,168-171` (ephemeral filter state, the
  Library tree entry).
- `docs/implementation-artifacts/4-1-organisms-route-top-navigation.md:143-189,316-319` (what 4.1
  left for 4.2), `:244-277` (review findings and dismissals), `:483-497` (bundle figures).
- `docs/implementation-artifacts/deferred-work.md:187,193,327,335,337,363,392,642-660`.
- `docs/project-context.md` — Framework rules (three state categories, repositories injected),
  MUI/token-layer rules, Testing rules (no coverage padding, axe), Code Quality (AR-46,
  `spec:check`, comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- No implementation-blocking issues. Two test-only jsdom quirks discovered while writing
  `OrganismCard.test.tsx` / `OrganismLibrary.test.tsx`, both fixed in the tests, not the
  component: (1) jsdom canonicalises an inline `style.background` set to an `hsl(...)` string to
  `rgb(...)` on read-back — `OrganismRoster.test.tsx` already carries this exact comment; fixed by
  round-tripping the expected colour through a throwaway element (`jsdomNormalizedColor`) rather
  than hand-converting hsl to rgb. (2) An unscoped `container.querySelectorAll('[aria-hidden="true"]')`
  in `OrganismLibrary.test.tsx` also matched the toolbar's `<SearchIcon aria-hidden="true">` glyph,
  over-counting chips by one; fixed by scoping the query to the `role="list"` grid.
- Final `npm run ci`: exit 0 (captured to a file, never piped to `tail`, per the project-context
  rule). Full command: `typecheck && lint && format:check && spec:check && boundary:check &&
  test:coverage && build:standalone && bundle:check && bench && bench:check && e2e`.

### Completion Notes List

- **Task 1** — `lib/organisms/organismNameMatches.ts` (`normalizeOrganismSearch` +
  `organismNameMatches`) and `lib/organisms/sortLibrary.ts` land as the new `lib/organisms/`
  home for Epic 4's non-component logic (mirrors `lib/gallery/`). Both are pure, table/case
  driven unit tests, no React. `sortLibrary` pins `CONWAYS_CLASSIC_ID` by id (never name),
  copies before sorting, and ties break case-folded-name → raw-name → id, never `localeCompare`
  or insertion order (FD2).
- **Task 2** — `toDisplayOrganism` extracted from `resolveDisplayOrganisms`'s resolved branch
  (FD3); `resolveDisplayOrganisms` now calls it. Behaviour unchanged — existing
  `displayOrganisms.test.ts` cases pass untouched; two new cases added for the extracted function
  directly (normal organism; all-whitespace name → `Unnamed organism`).
- **Task 3** — `<OrganismCard>` built per the mockup subset FD1 keeps (chip, name, Dominance,
  Aging, rule count, SYSTEM tag when `system`), copying `<BattleTile>`'s `Tile` shape for the
  hover/focus-within lift and reduced-motion escape, plus its own `:focus-visible` ring (FD5: the
  `<article>` itself is the tab stop today). `--gol-accent-tint` (FD6) added to `themes.css` on
  bare `:root`, composed from `--gol-accent-channel` the same way `--gol-shadow-tile-hover` is —
  confirmed picked up automatically by `themeTokens.test.ts`'s token-sweep (no edit needed there).
  No MUI `Card`/`TextField`/`Grid`, no Framer Motion (FD7/FD8).
- **Task 4** — `<OrganismLibrary>` keeps the existing hook wiring/status fold/`aria-busy` scoping
  untouched; gained the toolbar (search input + count badge) **outside** the `aria-busy` wrapper
  (`deferred-work.md:187`'s mistake, not repeated) and the card grid replacing the interim `<ul>`.
  Search state is local `useState` (RFC-005 Decision 1); filter is an intentionally unmemoised
  per-render scan, matching the identical shape already measured and closed at
  `deferred-work.md:337`/Story 3.7 (`~0.02–0.04 ms` for 1,000 organisms). Zero-match renders
  `StatusText` (not `role="status"` — FD4, one live region only, the count badge) with the search
  input surviving in the toolbar. `visible.length === 0 && query === ''` has no code branch (M9:
  unreachable — Conway's Classic is always present).
- **Task 5** — `OrganismRoster.tsx`'s two-line predicate swap (`normalizeOrganismSearch` +
  `organismNameMatches`, replacing the old `trim().toLowerCase()` inline logic), the
  ":343-351"-equivalent comment replaced with a pointer at the shared helper, the
  unmemoised-measurement paragraph kept verbatim. `git log origin/main -- .../OrganismRoster.tsx`
  showed no pending Epic 3 change on this file at implementation time, so no rebase concern.
  `themes.css` gained `--gol-accent-tint` (see Task 3). `OrganismRoster.test.tsx` stays green
  unedited (100/100 in the roster+themeTokens run).
- **Task 6** — `organisms.spec.ts`'s `:18` comment corrected ("this list item" → "this card"); new
  `describe('organism card grid (Story 4.2)')` block covers the SYSTEM card + stats + badge
  against the production seed, view-only search with a `localStorage['gol:organisms']`
  before/after byte-identity check, WebKit-aware keyboard reachability (`Alt+Tab` branch, reusing
  the file's existing convention), and axe in both the ready and zero-match states. No fourth
  `seedWorkspace`/`buildSeedPayload` copy added (`deferred-work.md:193`) — the production seed is
  sufficient. All 4 new tests pass across all 4 Playwright projects in the full `npm run ci` run
  (see bundle/e2e figures below).
- **Task 7** — Bundle measured before/after (figures below); no budget changed (AC8). The
  `deferred-work.md:335` search-predicate entry struck through with a `✅ Resolved in Story 4.2`
  note (text preserved, per the file's convention); a new `## Deferred from: Story
  4-2-organism-card-grid implementation` section records the three items this story's forced
  decisions explicitly hand off (FD1's rules-sentence summariser → Story 4.10; FD5's
  card-as-tab-stop policy → Story 4.17; FD9's `SectionHeader` lift → the first post-3.17 story
  touching both files). `docs/project-context.md`: no new "compiles but wrong" trap found; left
  unchanged, per the story's own steer.

**Bundle measurement (AC8)** — `npm run build:standalone` + `node scripts/check-bundle-size.mjs`,
compared against Story 4.1's last recorded baseline (`4-1-organisms-route-top-navigation.md`):

| Route | Baseline (4.1) | Measured (4.2) | Δ | Budget | Headroom |
|---|---|---|---|---|---|
| `home (/)` | 330.6 KB | 330.8 KB | +0.2 KB | 340 KB | 9.2 KB |
| `battle (/battle)` | 305.8 KB | 306.1 KB | +0.3 KB | 310 KB | 3.9 KB |
| `battle/new` | 305.7 KB | 306.0 KB | +0.3 KB | 310 KB | 4.0 KB |
| `organisms (/organisms)` | 290.5 KB | 293.5 KB | +3.0 KB | 305 KB | 11.5 KB |

All four deltas land inside the story's own predicted ranges (`/organisms` +2–4 KB for the styled
card/toolbar primitives and two helpers; `/battle` and `/battle/new` ±0.5 KB for the shared
`organismNameMatches` import; `/` unchanged). No budget raised anywhere (AC8).

**Verification summary (final `npm run ci`, exit 0):**
```
typecheck    ✓ (5/5 packages)
lint         ✓ (0 errors, 1 pre-existing warning in BattleGallery.tsx — untouched by this story)
format:check ✓
spec:check   ✓
boundary:check ✓
test:coverage:
  @gol/simulation   393/393 (unchanged by this story)
  @gol/persistence   82/82
  @gol/domain        99/99 (unchanged by this story)
  @gol/test-utils    89/89
  web               999/999
build:standalone ✓ (routes: /, /organisms, /battle, /battle/new, /_not-found)
bundle:check:
  home (/)               330.8 KB / 340 KB  (9.2 KB headroom)
  battle (/battle)       306.1 KB / 310 KB  (3.9 KB headroom)
  battle/new             306.0 KB / 310 KB  (4.0 KB headroom)
  organisms (/organisms) 293.5 KB / 305 KB  (11.5 KB headroom)
bench / bench:check ✓ (8.696 ms headroom, 52.2% of the frame budget)
e2e ✓ (380 passed, 4 skipped, 4 browser projects)
```

### File List

**New:**
- `apps/web/lib/organisms/organismNameMatches.ts`
- `apps/web/lib/organisms/organismNameMatches.test.ts`
- `apps/web/lib/organisms/sortLibrary.ts`
- `apps/web/lib/organisms/sortLibrary.test.ts`
- `apps/web/components/organisms/OrganismCard.tsx`
- `apps/web/components/organisms/OrganismCard.test.tsx`

**Modified:**
- `apps/web/components/organisms/OrganismLibrary.tsx` (toolbar, search, count badge, card grid)
- `apps/web/components/organisms/OrganismLibrary.test.tsx` (retargeted + new coverage: order,
  search/filter, zero-match, view-only proof, tab order, axe in three states, badge visibility)
- `apps/web/lib/displayOrganisms.ts` (`toDisplayOrganism` extracted, FD3)
- `apps/web/lib/displayOrganisms.test.ts` (two new cases for `toDisplayOrganism`)
- `apps/web/components/battle/editor/OrganismRoster.tsx` (predicate swap to the shared helper,
  comment update)
- `apps/web/app/themes.css` (`--gol-accent-tint` token)
- `apps/web/e2e/organisms.spec.ts` (`:18` comment fix; new `organism card grid (Story 4.2)`
  describe block)
- `docs/implementation-artifacts/deferred-work.md` (resolved the `:335` search-predicate entry;
  added the Story 4.2 deferred-work section)
- `docs/implementation-artifacts/sprint-status.yaml` (status transitions)

### Change Log

- 2026-09-14: Story 4.2 implemented end-to-end (Tasks 1–7). `<OrganismLibrary>`'s interim `<ul>`
  of names becomes the mockup's card grid: `<OrganismCard>` (chip, name, Dominance, Aging, rule
  count, SYSTEM tag), a live search box filtering by a new shared, Unicode-normalised predicate
  (`lib/organisms/organismNameMatches.ts`, resolving `deferred-work.md:335`), a pure
  `sortLibrary` pinning Conway's Classic first, and a `role="status"` count badge as the page's
  one live region. `<OrganismRoster>` switches to the same shared predicate. `npm run ci` green
  (exit 0); bundle deltas within the story's own predicted ranges on all four measured routes, no
  budget raised. Status → `review`.
