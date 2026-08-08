---
baseline_commit: b62b403
---

# Story 1.10: Battle Gallery Tiles & Sorting

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see my battle collection as tiles the moment I open the app,
so that I can find and pick up my work instantly.

## Acceptance Criteria

1. **Given** saved battles, **When** `/` loads, **Then** tiles render from `battles.list()` `BattleSummary` projections — no grid deserialization on the Gallery path (FR-7.1, AR-15)
2. **And** tiles are sorted by last-modified, most recent first
3. **Given** a tile, **When** displayed, **Then** it shows the battle name, created/modified dates, and organism names via tooltip or expandable metadata (FR-7.3), with hover affordances per the Gallery mockups (UX-DR18); the snapshot area renders a placeholder until Story 1.11
4. **Given** a dev build, **When** the Gallery loads, **Then** the two AR-45 fixture battles appear
5. **And** tiles are keyboard-focusable and the view passes the axe check

> ⚠️ **AC3 cannot be met by the current `BattleSummary` projection.** It has no `createdAt`
> (`packages/domain/src/battleSchema.ts:82-88`), and architecture **Decision H.4** + RFC-001 both fix
> the field list at `{id, name, gridSize, organismIds, updatedAt}` — `battleSchema.test.ts:185` even
> asserts `'createdAt' in summary === false` as a pinned invariant. AC1 forbids the obvious
> workaround (`load()` per tile). **→ Resolved (Sidiar, 2026-08-07): add `createdAt` to the
> projection as `IsoTimestamp.optional()`** (Task 1), and propagate the field list to Decision H.4,
> RFC-001 and RFC-005 in the same change. Rationale and the two rejected alternatives are in Dev
> Notes "Spec conflicts surfaced", conflict 1.

## Tasks / Subtasks

- [x] **Task 1: Put `createdAt` on the Gallery projection** (AC: 1, 3)
  - [x] `packages/domain/src/battleSchema.ts` — add `createdAt` to `BattleSummarySchema`, **optional**:

    ```ts
    // Decision H.4's field list omits createdAt; FR-7.3 / Story 1.10 AC3 require the created date
    // on the tile, and AR-15/AC1 forbid load()-per-tile to get it. It is a scalar already present
    // in every stored record, so carrying it costs zero grid work — the projection's whole point.
    // OPTIONAL, deliberately: list() SKIPS a record the summary schema rejects (Story 1.4 review:
    // "one bad battle must not blank the entire Gallery"), so making it required would silently
    // remove externally-tampered battles from the Gallery instead of showing them with one field
    // missing. Widen what lists, never narrow it.
    createdAt: IsoTimestamp.optional(),
    ```

  - [x] `packages/domain/src/battleSchema.test.ts` — update the two pinned assertions rather than
        deleting them: line ~174's exact-key-set list gains `'createdAt'`, and line ~185's
        `'createdAt' in … === false` becomes the **positive** assertion plus a new one proving a
        record *without* `createdAt` still projects (the optionality is the point).
  - [x] Add a test that `createdAt` hydrates to a `Date` (mirroring the existing `updatedAt` one) —
        `IsoTimestamp` transforms, so a string leaking through would only surface at
        `Intl.DateTimeFormat` call time as `RangeError`/`Invalid Date`.
  - [x] ❌ **No change to `LocalStorageBattleRepository` or `createFakeRepositories`.** Both call
        `BattleSummarySchema.safeParse(record)` on the whole stored record and Zod's strip *is* the
        projection — the new field flows through with zero repository code touched. Verify by test,
        not by editing them.
  - [x] ⚠️ **Docs propagation is part of this task, not a follow-up** (project rule: a resolved
        conflict is propagated everywhere). Three files state the old field list verbatim:
    - `docs/planning-artifacts/architecture.md:274` (Decision H.4)
    - `docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md:75-81` (the `BattleSummary` interface)
    - `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:315` (the usage-index note)

      Each gets `createdAt` plus a one-line dated note naming FR-7.3 as the driver. Do **not** touch
      the PRD (product-owned) and do not restate this in `epics.md` — AC3 already says "created/modified".

- [x] **Task 2: Load the Gallery at the page boundary** (AC: 1, 2, 4)
  - [x] Rewrite `apps/web/app/page.tsx` to keep `createRepositories()` + `useWorkspaceSeed` exactly
        where they are and pass repositories **down as props typed to the interfaces**:

    ```tsx
    export default function HomePage() {
      const repositories = useMemo(() => createRepositories(), []);
      const { status } = useWorkspaceSeed(repositories);

      return (
        <BattleGallery
          battles={repositories.battles}
          organisms={repositories.organisms}
          seedStatus={status}
        />
      );
    }
    ```

    - `BattleGallery` props are `BattleRepository` / `OrganismRepository` (AR-2/27). ❌ Never
      `AppRepositories`, never `createRepositories()` inside the component, never a concrete
      `LocalStorage*` import. A direct import typechecks and passes every test in this story.
  - [x] `apps/web/components/BattleGallery.tsx`, `'use client'`. It owns the load:

    ```tsx
    const [state, setState] = useState<GalleryState>({ kind: 'loading' });

    useEffect(() => {
      // ⚠️ GATED ON seedStatus — see Dev Notes trap 1. Listing before the seed resolves returns
      // an empty array on a first run and the Gallery renders "no battles" permanently.
      if (seedStatus === 'seeding') return;
      if (seedStatus === 'error') { setState({ kind: 'error' }); return; }

      let live = true;
      Promise.all([battles.list(), organisms.list()])
        .then(([summaries, roster]) => { if (live) setState({ kind: 'ready', summaries, roster }); })
        .catch(() => { if (live) setState({ kind: 'error' }); });
      return () => { live = false; };
    }, [battles, organisms, seedStatus]);
    ```

    - `live` is a closure flag here, **not** a ref: unlike `useWorkspaceSeed` (whose `hasRun` guard
      deliberately survives StrictMode's setup→cleanup→setup so the first setup owns the in-flight
      promise — see its doc comment), this effect re-runs from scratch on the second setup, so the
      closure flag matches the effect's own lifetime. Copying the ref pattern here would leave a
      stale `false` and drop the result.
    - One `Promise.all`, not two awaits: the tile cannot render a name without both, and two
      sequential round-trips double the localStorage latency budget (NFR-1.4) for no gain.
  - [x] ❌ **Do not build a generic `useAsyncResource`.** RFC-005 Decision 1's snippet names one, but
        it has exactly one call site until Story 1.13 needs `reload()`. Extract it when there is a
        second consumer; a speculative abstraction here is churn the review will flag.
  - [x] Expose the reload path as a **named local function** (`refresh()`) even though nothing calls
        it yet — Story 1.13's delete flow is `await battles.delete(id); refresh()`. One function, no
        abstraction.
  - [x] `apps/web/lib/gallerySort.ts` — the AC2 ordering as a pure unit:

    ```ts
    // Most-recently-modified first (FR-7.1). Ties are broken deterministically — name, then id —
    // because two battles saved in the same millisecond otherwise render in localStorage insertion
    // order, which differs between a fresh seed and a reload and makes both the e2e order
    // assertion and React's reconciliation non-reproducible.
    export function sortByLastModified(summaries: readonly BattleSummary[]): BattleSummary[];
    ```

    - Copy before sorting (`[...summaries].sort(...)`) — `Array#sort` mutates, and the input is the
      repository's array. ⚠️ **`toSorted()` does not typecheck**: `apps/web/tsconfig.json` sets
      `lib: ["dom", "dom.iterable", "ES2022"]` and `toSorted` is ES2023.
    - Compare names with plain `<`/`>`, **not** `localeCompare()` — no-locale `localeCompare` varies
      by ICU build, so a tie-break assertion could pass locally and fail on the CI runner.
  - [x] Tests (`apps/web/lib/gallerySort.test.ts`): descending order; equal `updatedAt` falls to
        name then id; input array is not mutated; empty array.

- [x] **Task 3: The tile** (AC: 3, 5)
  - [x] `apps/web/components/BattleTile.tsx`, `'use client'`. Structure from
        `clinical-lab-theme/battle-gallery.html:518-569`, semantic elements through `styled()`:

    ```
    <article>                          .battle-tile — bg-secondary, 1px border, 20px padding
      <header>                         .tile-header
        <h2>{name}</h2>                .tile-title, 18px/600
        <span>{cols} × {rows}</span>   .tile-stats — see forced decision 2 (NOT "Gen 47")
      <div aria-hidden="true" />       .petri-dish placeholder — Story 1.11 puts a canvas here
      <footer>                         .tile-meta
        <span>{formatted updatedAt}</span>
        <OrganismDisclosure />         the dot row, doubling as the FR-7.3 metadata trigger
    ```

    - The tile heading is `<h2>`: the page's only `<h1>` is "Battle Gallery" (Story 1.9 moved it
      there). A tile `<h3>` would skip a level and **that** axe does check (`heading-order`).
  - [x] **FR-7.3 metadata = an expandable disclosure, not a CSS tooltip.** The mockup's
        `.participant-dot::before` hover tooltip is mouse-only and unreachable by keyboard or AT;
        FR-7.3 explicitly permits "tooltip **or** expandable section", so take the section:

    ```tsx
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
      <DotRow aria-hidden="true" />   {/* colour is decorative; the names below carry the meaning */}
      {organisms.length} organism{organisms.length === 1 ? '' : 's'}
    </button>
    {open && (
      <div id={panelId}>
        <dl>Created … / Modified …</dl>
        <ul>{/* one <li> per organism: its dot (aria-hidden) + its name */}</ul>
      </div>
    )}
    ```

    - This is also what makes AC5's "keyboard-focusable" honest: the tile contains a real control
      with a real effect. ❌ **Do not put `tabIndex={0}` on the `<article>`** — until Story 2.2 wires
      click-to-open there is nothing for a focused tile to do, and a focus stop that does nothing is
      the no-dead-affordance rule broken in the one place axe cannot see it.
    - `useId()` for `panelId` — hardcoding one id breaks the moment two tiles render, and
      `aria-controls` silently points at the wrong panel rather than failing.
    - ❌ **No MUI `Tooltip`, `Popper`, `Collapse`, `Card`, or `Grid`** — see Task 7's budget note.
  - [x] Cap the visible dots: `const MAX_VISIBLE_DOTS = 6;` then `+{n} more` as text. A battle may
        legally place **255** organisms (Decision G.3) — the mockup's 2–3 dots is not the bound, and
        an uncapped row reflows the whole tile. The **full** list always renders inside the panel.
  - [x] `apps/web/lib/tileOrganisms.ts` — resolve ids → `{ id, name, color }` as a pure unit:
    - Colour is `displayColor(colorToken, MAX_AGE_SHADE)` from `@/lib/displayColor`.
      ⚠️ **Not `ageShadeFor(0, agingEnabled)`** — that returns the age-0 30%-saturation shade for an
      aging organism, so Patient Defender's identity dot would render washed out against its own
      Story 1.11 thumbnail cells. `MAX_AGE_SHADE` is the identity colour, and Story 1.7 pins
      `displayColor(token, 7) === PALETTE[token].hex` exactly.
      ⚠️ **Not `resolvePaletteColor(token).hex`** either: it is the same colour today, but the LUT is
      what Story 1.11's cells go through, so sharing it is what keeps a dot from ever disagreeing
      with its thumbnail.
    - A dangling id (in `organismIds`, absent from `organisms.list()`) resolves to a neutral
      fallback name and the default token — never `undefined`, never a throw. FR-1.4's delete guard
      makes this unreachable in normal use; an imported or hand-edited workspace is the case, and
      Story 5.11 owns the user-facing corruption story. Do not add a console warning: the e2e
      asserts a clean console and `paletteIndexOf` already warns-once on an unknown *token*.
  - [x] `apps/web/lib/formatBattleDate.ts` — one module-scope formatter:

    ```ts
    // Fixed 'en-US', not the user locale: the MVP has no i18n, and an undefined locale makes every
    // date assertion depend on the runner's ICU default — green locally, red on CI. Module scope,
    // not per render: constructing an Intl.DateTimeFormat is the expensive part.
    const FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    ```

    - Tests: a known ISO date formats to the expected string; `undefined` (an absent `createdAt`,
      Task 1) returns a stable placeholder rather than "Invalid Date".
  - [x] Hover affordance per the mockup (`battle-gallery.html:251-255`): `border-color:
        var(--gol-accent)`, `transform: translateY(-2px)`, and the shadow token from Task 4.
    - ❌ **Do not add `cursor: pointer`.** The mockup has it because its tile navigates; ours does
      not until Story 2.2. A pointer cursor promises a click that does nothing.
    - Add `:focus-within` alongside `:hover` so the keyboard path gets the same tile-level state
      change the mouse path does — the exact parity gap the Story 1.9 review found on `AppNav`.
  - [x] Tests (`apps/web/components/BattleTile.test.tsx`): name renders as `heading level 2`; the
        grid-size stat renders; the disclosure starts collapsed (`aria-expanded="false"`, panel
        absent), expands on click **and on `{Enter}`/`{Space}` via `userEvent.keyboard`**, and the
        panel then contains both dates and every organism name; a 10-organism roster renders 6 dots
        + "+4 more" but 10 names in the panel; a dangling id renders the fallback without throwing;
        `axe(container)` returns zero violations both collapsed and expanded.

- [x] **Task 4: Gallery layout, states, and the new token** (AC: 1, 3, 5)
  - [x] `BattleGallery.tsx` renders, in order: the section header
        (`<h1>Battle Gallery</h1>` + the mockup's `.section-subtitle` "Your saved cellular
        competitions"), then one of four bodies keyed off `state.kind`:

    | state | body | note |
    |---|---|---|
    | loading | `<p>Loading battles…</p>` | this is what the static export prerenders |
    | error | `<p role="alert">…</p>` | closes a deferred item — see below |
    | ready, 0 battles | `<p>No battles yet.</p>` | **plain placeholder**, Story 1.12 replaces it |
    | ready, N battles | the tile grid | |

    - Put `aria-busy={state.kind === 'loading'}` on the wrapping `<section>`. ❌ No `role="status"`
      live region — announcing the whole gallery on every change is worse than announcing nothing,
      and nothing in AC5 asks for it.
    - ⚠️ If you wrap in `<section>`, give it `aria-labelledby` pointing at the `<h1>`'s id. A bare
      `<section>` is not a landmark, so axe's `region` rule counts its content as outside one — and
      `AxeBuilder().analyze()` runs best-practice rules, not just violations of WCAG A/AA. A plain
      `<div>` is the other correct answer; an unnamed `<section>` is the one that fails.
    - ⚠️ The zero-battles line is **deliberately undesigned**. Story 1.12 owns the visual, the
      "what is this app" copy, and the "Create Your First Battle" prompt. Ship one sentence and a
      comment naming 1.12, so that story replaces rather than merges.
    - ⚠️ **No toolbar.** Create button → Epic 2 (no editor to open). Search input and Sort-By
      dropdown → **no FR exists for either** and a sort selector contradicts AC2's fixed order; see
      Dev Notes conflict 4. The Story 1.9 review's aside about "Story 1.10's search input" was an
      assumption about the mockup, not a requirement.
  - [x] The grid is the mockup's: `display: grid; grid-template-columns: repeat(auto-fill,
        minmax(320px, 1fr)); gap: 24px`. Native CSS Grid on a `styled('div')` — ❌ **not MUI `Grid`**,
        which is a flexbox/spacing abstraction that cannot express `auto-fill` and costs bundle.
        Verify at the NFR-3.1 floor (1024px) as well as desktop.
  - [x] `apps/web/app/themes.css` — one new token, because the mockup's shadow **cannot** be written
        in a component (AR-46 bans `rgba()` literals in `.ts`/`.tsx`, and the composite has no
        existing `--gol-*` equivalent):

    ```css
    /* Tile hover glow (Story 1.10). Mockup: box-shadow: 0 4px 12px rgba(0, 212, 255, 0.15).
       Authored as the whole shadow value so the component references exactly one token, and
       composed from --gol-accent-channel so the colour has a single source of truth — the same
       rgb(<channel> / <alpha>) form the --gol-action-* tokens above already use. */
    --gol-shadow-tile-hover: 0 4px 12px rgb(var(--gol-accent-channel) / 0.15);
    ```

    - No test edit needed: `themeTokens.test.ts`'s "every `--gol-*` reference resolves to a defined
      token" sweep picks up new `components/*.tsx` files automatically, and the AA hex sweep
      correctly ignores a non-`#rrggbb` value. Confirm both by running the file, not by assuming.
  - [x] **Resolve the `--gol-bg-hover` deferred item** (deferred-work.md, 1.9 review): it is still
        unpainted after this story — the mockup's tile hover changes border and shadow, **not** the
        surface. Do not invent a background change to give the token a consumer. Update the entry to
        re-point at **Story 1.13**'s `.action-menu-btn` (`background: var(--bg-hover)`), and note
        that the AA rows this story *does* exercise are `text-tertiary` and `text-secondary` on
        `bg-secondary` (the tile surface), both already gated and passing.
  - [x] **Close the `useWorkspaceSeed` error-path deferred item** (deferred-work.md, 1.5 review) to
        the extent this story owns it: the `error` body above is the "somewhere meaningful to
        surface it" that entry was waiting for. Scope: render the message, nothing more. ❌ Do not
        add retry, reset-offer, or storage diagnostics — Story 5.11 owns that UX. If you add any
        logging, it goes on the failure branch only (the e2e asserts zero console errors on the
        happy path).
  - [x] Tests (`apps/web/components/BattleGallery.test.tsx`), all against
        `createFakeRepositories()` from `@gol/test-utils` — ❌ never a hand-rolled fake:
    - **AC1, the load-bearing one:** `vi.spyOn(repos.battles, 'load')` and `'listFull'`, render with
      two seeded battles, and assert **both spies were never called**. A test that only checks tiles
      appear passes just as well after someone adds a `load()` per tile to fetch the grid.
    - **AC2:** three battles seeded out of order render in descending `updatedAt` order — assert on
      the **rendered heading sequence**, not on the array the sort helper returned.
    - `seedStatus: 'seeding'` renders the loading body and **calls neither repository** (trap 1).
    - `seedStatus: 'error'` renders the alert; a rejecting `list()` does too.
    - Zero battles renders the placeholder line and no tile grid.
    - `axe(container)` clean for the populated, empty, and error bodies.

- [x] **Task 5: Keep the Story 1.1–1.6 guards alive through the page rewrite** (AC: 4)
  - [x] `apps/web/app/page.test.tsx` — the four seeding tests, the StrictMode test and the two AR-45
        tests **stay**. What changes is only the text they wait on: `workspace: ready` →
        `No battles yet.` (production paths) or a fixture battle name (dev path). ⚠️ The StrictMode
        test is the **only** reproduction of the review regression where `npm run ci` was fully
        green while `npm run dev` hung on "workspace: seeding" forever — retarget it, never delete it.
  - [x] The placeholder page's two other assertions are **replaced by stronger ones, not dropped**:
    - `heading level 1 'Battle Gallery'` — unchanged, still the document's only `h1`.
    - `'Battle Gallery coming soon.'` — gone with the placeholder.
    - `/wired to @gol\/domain \(\d+ organism fields\)/` — Story 1.1's wiring proof. The page no
      longer renders it, and it is now redundant: a rendered tile can only exist if
      `BattleSummarySchema` (`@gol/domain`, through `@gol/persistence`) parsed a stored record, which
      is a strictly stronger proof that the workspace package resolved to its TS source. Replace the
      regex assertion with a comment saying so and an assertion on a seeded battle's name. **Say
      this in the Dev Agent Record** — silently deleting a named guard from Story 1.1 is exactly what
      the last three reviews hunted for.
    - `mode: {APP_MODE}` — gone with it. `createRepositories()` already throws on an unknown mode
      (`repositoryFactory.ts:24`), which is a real gate rather than displayed text.
  - [x] **New test, AC4:** with `vi.stubEnv('NODE_ENV', 'development')`, the Gallery renders tiles for
        both AR-45 fixtures — `Grand Colony War` **before** `Three-Way Skirmish` (updatedAt
        `2026-07-25T18:15Z` vs `2026-07-20T09:00Z`, `mockWorkspace.ts:270-296`). One test covers AC4
        and AC2's real-data half. The fixtures' timestamps are frozen literals precisely so this
        assertion is reproducible — do not replace them with `new Date()`.
  - [x] Sanity-check `Grand Colony War`'s roster resolves 4 names (3 mocks + Conway's Classic) and
        `Three-Way Skirmish` 3 — the two batter the dot-cap and name-resolution paths with real data.

- [x] **Task 6: e2e — the populated Gallery in a real browser** (AC: 1, 2, 3, 5)
  - [x] New `apps/web/e2e/gallery.spec.ts`. ⚠️ **The e2e serves the production static export**
        (`playwright.config.ts:29`), so the AR-45 dev fixtures are **not** seeded and the Gallery is
        empty by default. Seed `localStorage` before load instead:

    ```ts
    // e2e/ is exempt from the @gol/test-utils import boundary (eslint.config.mjs), and home.spec.ts
    // already imports @gol/domain + @gol/persistence — this is the intended use.
    const payload = { battles: …, organisms: … };  // JSON.parse(JSON.stringify(createMockWorkspace()))
    await page.addInitScript(([keys, data]) => { … localStorage.setItem(…) }, [STORAGE_KEYS, payload]);
    ```

    - `addInitScript` structured-clones its argument: `Battle.createdAt`/`updatedAt` are `Date`
      objects, and the at-rest form is ISO strings, so JSON round-trip the payload first. A `Date`
      surviving the clone would be `JSON.stringify`d to the right shape anyway *in the browser* —
      which works by accident and breaks the day the payload is built differently. Round-trip
      explicitly.
    - Also stamp `gol:schema` (`{ formatVersion: 1 }`, `storage.ts:117`). Without it
      `isFreshWorkspace()` is `true`, `seedDefaultWorkspace()` runs, and Conway's Classic is appended
      to the roster mid-test — harmless but it makes the organism-name assertions depend on seeding
      order.
  - [x] Assertions: two tiles in **descending** order (`page.getByRole('heading', { level: 2 })`
        `allTextContents()`, compared as a list — an order assertion, not two `toBeVisible()` calls);
        the disclosure expands on `Enter` and reveals both dates and every organism name; `AxeBuilder`
        reports zero violations with tiles on screen (the real-browser run is what actually checks
        rendered colour contrast — `text-tertiary` on `bg-secondary` at 12px is the pair at risk);
        zero console errors, asserted **after** a hydration signal, not after `page.goto`
        (`appShell.spec.ts:28-37` explains why).
  - [x] ❌ **Do not assert a literal formatted date string.** `Intl` output can differ by browser ICU
        build. Assert the *order* and that the panel contains a 4-digit year.
  - [x] `apps/web/e2e/home.spec.ts` — update the two placeholder assertions
        (`'Battle Gallery coming soon.'`, and `workspace: ready` in the seeding test) to the new empty
        body. Keep the test's structure: it is the only end-to-end proof that a production build seeds
        Conway's Classic and **no** AR-45 fixtures.
  - [x] `apps/web/e2e/appShell.spec.ts` — its hydration signal is `page.getByText('workspace: ready')`
        (line 37), which this story removes. Retarget it to `'No battles yet.'`, which has the same
        property and for the same reason: the prerendered HTML says "Loading battles…" and only the
        client effect can reach the empty state. ⚠️ **Do not "fix" this by dropping the wait** — it
        exists because the console-error assertion was racing hydration.

- [x] **Task 7: Full gate, bundle budget, docs** (AC: 1–5)
  - [x] ⚠️ **The bundle is the tightest constraint in this story.** Story 1.9 shipped **281.4 KB gzip
        against 300 KB — 18.6 KB of headroom**, and it has to cover 1.10, 1.11 *and* 1.13's Dialog.
    - Target: **zero new dependencies and no new MUI component imports.** Everything here is
      semantic HTML + `styled()` (already paid for) + native CSS Grid.
    - Record the exact `npm run bundle:check` figure in the Dev Agent Record. A rise above ~1 KB
      means an MUI component crept in — check `npm run analyze -w web`.
    - ❌ **Never raise `BUDGET_GZIP_KB`.** If the gate fails, the tile is too heavy.
  - [x] `npx eslint apps/web` clean with **no new entry** in the AR-46 `ignores` list. Sanity-check
        the rule still bites by temporarily writing the shadow as
        `boxShadow: '0 4px 12px rgba(0, 212, 255, 0.15)'` in `BattleTile.tsx` and confirming it
        fails; revert. (The plain-string form is caught now — the anchoring gap was fixed in the 1.9
        review.)
  - [x] Run the full `npm run ci` (typecheck → lint → format:check → test:coverage →
        build:standalone → bundle:check → e2e) and **record the actual result**, including per-package
        test counts. ⚠️ Do **not** pipe it to `tail`/`head` — the pipeline reports the last command's
        exit code and this masked a real `format:check` failure during the 1.9 review. Redirect to a
        file and echo `$?`.
  - [x] ⚠️ This story changes `packages/domain`, which carries a **≥90% coverage gate** — the only
        package in this story that has one. `apps/web` deliberately has none: do not write tests to
        move its number.
  - [x] Update `docs/implementation-artifacts/deferred-work.md` per Task 4 (two entries), and add
        any new deferrals from this story's own review.
  - [x] `docs/project-context.md` needs **no** change unless something in it turns out stale — the
        Gallery introduces no new tool, version, or convention. Say so explicitly rather than leaving
        it ambiguous.

## Dev Notes

### Decisions this story is forced to make (flag them in the Dev Agent Record)

1. **⚠️ `BattleSummary` gains `createdAt`, and that edits a cross-cutting Decision.** Ratified by
   Sidiar 2026-08-07 — see Task 1 and conflict 1. Optional rather than required, so the set of
   records that list is widened and never narrowed. The docs propagation is part of Task 1, not a
   follow-up: leaving H.4/RFC-001/RFC-005 stating the old field list is the failure mode the project's
   conflict rule exists to prevent.

2. **⚠️ The mockup's `Gen 47` tile badge is unimplementable and is replaced by the grid size.** A
   cycle count is Epic 3 *runtime* state; only `initialGrid` is ever persisted (A-2), no schema field
   holds a generation, and there is no live simulation to read one from on the Gallery path. The
   `.tile-stats` slot instead shows `{cols} × {rows}` — already in `BattleSummary`, genuinely useful
   (the two editable presets look very different), and honest. Flag as a deliberate mockup deviation.

3. **⚠️ FR-7.3's metadata is an expandable disclosure, not the mockup's CSS hover tooltip.** The
   `.participant-dot::before` pattern is mouse-only: unreachable by keyboard, invisible to AT, and it
   cannot carry both dates. FR-7.3 permits either form; only one of them can satisfy AC5 in the same
   story. The dot row stays visually, as the disclosure's trigger content.

4. **⚠️ Tiles are focusable *through their disclosure button*, not by `tabIndex` on the tile.** AC5
   asks for keyboard-focusable tiles; the no-dead-affordance rule forbids a focus stop with no
   behaviour. A real control inside the tile satisfies both, and Story 2.2 converts the tile itself
   into the link/button when there is finally somewhere to go.

5. **⚠️ The page loses its `workspace: {status}` and `mode: …` debug lines, and six assertions plus
   two e2e specs read them.** Enumerated in Tasks 5 and 6. `appShell.spec.ts` uses
   `workspace: ready` as its *hydration gate*, not as a feature check — miss that and the
   console-error assertion silently starts racing again, which is the exact defect the 1.9 review
   fixed.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

1. **⚠️ AC3 requires the created date; Decision H.4 defines `BattleSummary` without it; AC1 forbids
   the workaround.** Three authorities are involved and they do not agree:
   - `epics.md:479` (this story's AC3) and PRD **FR-7.3**: "Date created / last modified".
   - `architecture.md:274` (**Decision H.4**) and `RFC-001:75-81`: the projection is
     `{id, name, gridSize, organismIds, updatedAt}` — and `battleSchema.test.ts:185` pins the
     exclusion as a test.
   - `epics.md:477` (AC1) and **AR-15**: no grid deserialization on the Gallery path, so `load()`
     per tile is out.

   **→ Resolved (Sidiar, 2026-08-07): add `createdAt` to the projection as `IsoTimestamp.optional()`**
   (Task 1). It is a scalar already present in every stored record, so "lightweight" is untouched —
   the projection exists to drop `gridState`, and the H.4 field list reads like an enumeration of
   "everything but the heavy field" that simply overlooked a field no consumer needed until now.
   Optional rather than required because `list()` **skips** records the summary schema rejects (Story
   1.4 review: "one bad battle must not blank the entire Gallery"), so a required field would silently
   remove tampered records from the Gallery — the projection's tolerance may be widened, never
   narrowed. Rejected: **required** (narrows what lists, above) and **leave it alone** (tile shows the
   modified date only, leaving AC3/FR-7.3's "date created" unmet with no path to it that respects
   AC1). Authority order makes this a **Decision-level** edit — cross-cutting beats RFC — which is why
   it was ratified rather than decided at dev time. Propagation targets are listed in Task 1.

2. **⚠️ RFC-005 calls the component `<BattleCard>`; everything else says "tile".** FR-7.2 ("Battle
   Tile Display"), Story 1.10/1.11's titles, UX-DR18 and the mockup's `.battle-tile` class all say
   tile. **Resolution: `BattleTile`** — the RFC's component tree is a structural illustration (the
   same note that makes its `<Routes>` snippets non-literal), and four sources beat one. Flag for the
   next RFC-005 touch; no doc edit in this story.

3. **⚠️ RFC-005's `<BattleGalleryPage>` wrapper and `useAsyncResource` are pre-App-Router
   artefacts.** Under the canonical App Router (Reconciliation 4), `app/page.tsx` **is** the gallery
   page, so a second wrapper component adds a layer with no state of its own; and
   `useAsyncResource` is a helper with one consumer. **Resolution: `app/page.tsx` (boundary, owns
   `createRepositories()`) → `<BattleGallery>` (owns the load + view state) → `<BattleTile>`.** The
   state placement RFC-005 Decision 2 actually argues for is preserved exactly.

4. **⚠️ The mockup's toolbar — create button, search input, sort dropdown, battle count — has almost
   no requirement behind it.** Create is FR-7.4 but belongs to Epic 2 (nothing to open). Search
   exists as an FR for the **organism library** only (UX-DR19); there is no battle search FR. A
   Sort-By dropdown with five options directly contradicts FR-7.1/AC2's *fixed* "most recent first".
   **Resolution: ship no toolbar.** Flag for a future UX touch — if battle search/sort is wanted it
   needs an FR first, and the mockup should stop implying five sort orders the spec does not have.

5. **⚠️ `--gol-bg-hover` is still unpainted after the story the 1.9 review pointed at.** The tile
   hover changes border and shadow, not the surface. Re-point rather than invent a consumer
   (Task 4).

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **Listing before the seed resolves shows an empty Gallery forever.** `useWorkspaceSeed` writes
  Conway's Classic (and, in dev, the AR-45 fixtures) from an effect. A sibling effect calling
  `battles.list()` with `[]` deps runs in the same commit and resolves *first*: `list()` returns `[]`,
  the state goes to `ready` with zero battles, and nothing ever re-runs. In production the user sees
  "No battles yet." (correct by luck, since there are none) and in dev the fixtures never appear —
  AC4 fails while every other test passes. Gate on `seedStatus`.
- ⚠️ **`updatedAt` ties are silently insertion-ordered.** `Array#sort` is stable, so equal timestamps
  preserve the order `Object.values(collection)` happened to yield — which differs between a fresh
  seed and a reload. Add the name/id tie-break (Task 2).
- ⚠️ **`updatedAt` earlier than `createdAt` is accepted by the schema** (deferred-work.md, 1.3
  review): no cross-field check exists, and the Gallery sorts on `updatedAt`, so a tampered record
  sorts as the oldest battle with no signal. Do **not** add the refine here — it was deliberately
  deferred to a date-handling change. Just do not build the tile as if the two are ordered.
- ⚠️ **Formatting a date in a server-prerendered branch is a hydration mismatch waiting to happen.**
  `output: 'export'` prerenders every route at build time, in the build machine's timezone. This is
  safe **only because** tiles render behind a client-effect gate and never appear in the prerendered
  HTML. If a future refactor moves the load earlier, dates are the first thing to break — keep
  formatting inside the `ready` branch.
- ⚠️ **AR-46 does not see `rgba()` inside a CSS shorthand you compose at runtime, but it does see
  the literal.** `boxShadow: '0 4px 12px rgba(0, 212, 255, 0.15)'` fails lint (the selectors were
  un-anchored in the 1.9 review, so plain strings are caught now). The token is the fix, not a
  whitelist entry.
- ⚠️ **`battles.list()` silently drops records the summary schema rejects.** That is a deliberate
  Story 1.4 review decision ("one bad battle must not blank the entire Gallery"), so a corrupt battle
  is simply absent from the Gallery with no message. Do not add error surfacing for it here — Story
  5.11 owns it — and do not make Task 1's new field required, which would widen what gets dropped.
- ⚠️ **`ageShadeFor(0, agingEnabled)` is the wrong shade for an identity dot** (Task 3). It looks
  correct and renders Patient Defender pale.
- ⚠️ **A 255-organism roster is legal** (Decision G.3). The dot row must be capped; the name list
  must not be.
- ⚠️ **`vi.stubEnv('NODE_ENV', …)` must be set before render**, and `useWorkspaceSeed` reads it
  *inside* the effect precisely so that works. A module-scope `const IS_DEV` anywhere in the new code
  would evaluate at import time and make the AC4 test pass vacuously.
- ⚠️ **A closure flag, not a ref, for this effect's liveness** (Task 2). The opposite choice is right
  in `useWorkspaceSeed` and wrong here, for a documented reason.
- ⚠️ **`usePathname()` throws under RTL** with no App Router context. Only `AppNav` uses it today; if
  any new component reaches for it, mock `next/navigation` (`AppNav.test.tsx:8-10` is the pattern).
- ⚠️ **`vitest-axe`'s `toHaveNoViolations` matcher is deliberately not wired** (Vitest 4 type
  conflict). Use `const results = await axe(container); expect(results.violations).toEqual([])`.
- ⚠️ **`npm run ci` is where cross-package breakage surfaces, not `npm test`.** Five stories running:
  1.4 broke on `build:standalone`, 1.5 on `npm run dev` (StrictMode), 1.7 shipped a doc command that
  matched zero files and exited 0, 1.8 was clean only because the whole gate ran, 1.9's e2e failed on
  a heading assertion in a file its own task plan had omitted. This story touches `packages/domain`,
  the page boundary, and three e2e specs — the same shape.

### Previous story intelligence (1.4–1.9)

- **1.9 (shell, done 2026-08-07):** semantic HTML + `styled()` from `@mui/material/styles`, referencing
  `var(--gol-*)` only. `styled()` for static chrome, `sx` only for genuinely per-instance dynamic
  values (RFC-003 Decision 3). One `createTheme()` at module scope with `cssVariables: true`;
  `shape.borderRadius: 0` and `action.*` are now pinned to tokens, so a tile inherits sharp corners
  and the real hover overlay without touching the theme. **`error`/`warning`/`info`/`success` are
  still Material defaults** — deferred to Story 1.13; do not render `color="error"` here.
- **1.9's review found three wrong WHY comments** ("zero JS colour math", "construction warns", "two
  `<h1>`s trip axe") and the project treats a wrong WHY as worse than none. Every claim you comment
  in this story should be one you actually ran.
- **1.8 (renderer):** `renderStatic` exists and is frozen. This story must **not** call it — the
  snapshot is a placeholder until 1.11. Four deferred renderer items (LUT `setPalette`, `lastGrid`
  retention across ~50 tiles, the overlay `drawImage` path, warn-dedupe keying) all land in 1.11/2.x
  and are listed in `deferred-work.md`; the first one to read them is Story 1.11's author.
- **1.7 (palette):** organism colour is a `colorToken` resolved at render time; `paletteRegistry.ts`
  is the **only** file allowed hex literals. `displayColor` / `MAX_AGE_SHADE` / `resolvePaletteColor`
  are the API. Organism colours and `--gol-*` theme tokens are two separate systems and must not
  reference each other (RFC-007 Decision 5).
- **1.6 (fixtures):** `createFakeRepositories()`, `createMockWorkspace()`, `MOCK_BATTLE_IDS`,
  `MOCK_ORGANISM_IDS` all come from `@gol/test-utils`. Never hand-roll a fake repository. The mock
  battles' timestamps are frozen literals *because* of this story's sort assertion.
- **1.4 (persistence):** `list()` returns summaries and skips unparseable records; `load()` throws
  `CorruptDataError` rather than returning `null`; quota failures are non-destructive. `STORAGE_KEYS`
  is the only place key strings live.
- **The last four reviews all hunted ticked-but-unshipped subtasks.** The equivalents here: the AC1
  spy assertions (trivial to tick, and the only thing that actually proves "no grid deserialization"),
  the keyboard-activation half of the disclosure test, the dot-cap test, and the AR-46 negative check.
  Open the file before ticking.
- **Conventions:** comments explain WHY and cite the governing id (`(FR-7.3)`, `(Decision H.4)`,
  `(AR-15)`); no review artefacts in code; components PascalCase `.tsx`, non-component TS camelCase
  and never dotted; `@/lib/…` / `@/components/…` aliases; **commit gate stands** — present the file
  list and a suggested message, then wait for Sidiar.

### Git intelligence

Last five commits: `b62b403` (docs: `:root` token-layer override + amended ACs), `9cab48b` (docs:
repo/CI state), `ba09886` (ci: unconditional Playwright system deps), `6ba2e6f` (Story 1.9 review
fixes), `96f205a` (Story 1.9). Two things to carry forward:

- **A local green `npm run ci` is not proof CI is green.** The `e2e` job was red on every push
  between Stories 1.7 and 1.9 while `npm run e2e` passed locally, because a browser-cache hit skipped
  WebKit's apt system libraries. Fixed in `ba09886`. Check `gh run list` after pushing.
- The message convention is `Story 1.10: Battle Gallery Tiles & Sorting`, with follow-ups as
  `Story 1.10: apply code review fixes`.

### Latest technical information

**No new dependency, and that is a requirement, not an omission** (Task 7's budget). Everything this
story needs was installed and verified in Story 1.9, four days ago: MUI **9.3.1** + Emotion
11.14.x, Next **16.2.10**, React **19.2.7**, TypeScript 5.9.3, Vitest 4.1.10, Playwright 1.62.1.
Version policy is caret-on-current-stable with the architecture version as a floor — **do not bump
anything opportunistically** in a story with 18.6 KB of bundle headroom.

Two platform notes that matter here and are not obvious:

- **`Array.prototype.toSorted` is ES2023 and does not typecheck** under `apps/web`'s
  `lib: ["dom", "dom.iterable", "ES2022"]`. Use a spread + `sort`.
- **`rgb(<r> <g> <b> / <alpha>)` space-separated syntax** is what the new shadow token uses. It is
  supported across all four NFR-2.1 browsers and the `--gol-action-*` tokens already ship it, so the
  e2e matrix already covers the syntax.

### What NOT to build (scope boundaries)

- ❌ **Thumbnails / any canvas.** Story **1.11**. The snapshot area is an empty, `aria-hidden`
  placeholder box — no `renderStatic`, no `GridRenderer`, no `toRenderableGrid`, no grid-line
  overlay, no `battles.load()`.
- ❌ **The designed empty state, its illustration, its "what is this app" copy, and the "Create Your
  First Battle" prompt.** Story **1.12**. One plain sentence here.
- ❌ **Delete, the `⋮` action menu, any confirmation dialog, MUI `Dialog`/`Menu`.** Story **1.13** —
  which also owns the `error`/`warning` palette tokens and needs the bundle headroom.
- ❌ **Click-to-open, `/battle/[id]`, `cursor: pointer` on the tile, any link out of a tile.** Stories
  **2.1/2.2** (edit) and **3.17** (run). AC5 is keyboard *focusability*, not navigation.
- ❌ **Search input, Sort-By dropdown, battle-count badge, create button.** Conflict 4.
- ❌ **The AR-15 organism-usage index, `buildUsageIndex`, "used in N battles" counts.** Epic **4**
  (Story 4.19/4.20). This story maps ids → names for display only; that is not the index.
- ❌ **Grid-lines / cell-animation / theme settings, reading `gol:settings` at all.** Epic **6**.
  Story 1.11 is the first consumer of the grid-lines setting, not this one.
- ❌ **A global store, a repository Context, `useAsyncResource`, a data cache, `react-query`.** AR-27
  and RFC-005 Decision 1's "each route loads what it needs fresh on mount".
- ❌ **New dependencies of any kind** — including `@mui/icons-material`, `framer-motion`, a date
  library, or a virtualiser. ~50 battles (NFR-7.2) is not a virtualisation problem.
- ❌ **Raising `BUDGET_GZIP_KB`, or adding an AR-46 `ignores` entry.**
- ❌ **Cross-field date refines, `.strict()` schemas, quota instrumentation, corruption UX.** Stories
  5.7/5.8/5.11 own those, each for a documented reason in `deferred-work.md`.

### Project Structure Notes

```
packages/domain/src/
  battleSchema.ts             + createdAt on BattleSummarySchema (optional)              [modify]
  battleSchema.test.ts        two pinned assertions updated + optionality/Date tests      [modify]

apps/web/
  app/
    page.tsx                  page boundary: repos + seedStatus -> <BattleGallery>        [modify]
    page.test.tsx             seeding/StrictMode/AR-45 tests retargeted, not deleted      [modify]
    themes.css                + --gol-shadow-tile-hover                                  [modify]
  components/
    BattleGallery.tsx         'use client' — header, load, 4 view states, tile grid       [new]
    BattleGallery.test.tsx    AC1 spies, AC2 order, states, axe                           [new]
    BattleTile.tsx            'use client' — name, size stat, placeholder, disclosure     [new]
    BattleTile.test.tsx                                                                   [new]
  lib/
    gallerySort.ts            sortByLastModified — pure, deterministic tie-break          [new]
    gallerySort.test.ts                                                                   [new]
    tileOrganisms.ts          ids -> {name, colour}, dangling-id fallback                 [new]
    tileOrganisms.test.ts                                                                 [new]
    formatBattleDate.ts       one module-scope en-US Intl formatter                       [new]
    formatBattleDate.test.ts                                                              [new]
  e2e/
    gallery.spec.ts           seeded via addInitScript: order, disclosure, axe, console   [new]
    home.spec.ts              placeholder-copy assertions retargeted                      [modify]
    appShell.spec.ts          hydration signal retargeted                                 [modify]

docs/planning-artifacts/architecture.md                       Decision H.4 field list    [modify]
docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md   BattleSummary interface [modify]
docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md  usage-index note    [modify]
docs/implementation-artifacts/deferred-work.md                two entries resolved        [modify]
```

`apps/web/components/` is where RFC-001 §5 puts components; `apps/web` holds UI and wiring **only** —
no simulation, persistence, or rules logic. The sort/format/resolve helpers live in `apps/web/lib`
because they are presentation concerns; they would be wrong in `packages/domain`, which is also why
they are exempt from its ≥90% gate. Nothing new enters `packages/simulation` or
`packages/persistence`. No `eslint.config.mjs` change.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.10] — the story statement and five ACs verbatim
- [Source: docs/planning-artifacts/epics.md#Story 1.11 / 1.12 / 1.13] — thumbnails, empty state, and
  delete-with-confirm: the three scope boundaries this story must leave visibly unfinished
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-15** (summary-derived
  index, no grid deserialization), **AR-25** (`renderStatic` for tiles — Story 1.11), **AR-26**
  (`colorToken` resolved at render time), **AR-27** (no global store, props from the page boundary),
  **AR-46** (no raw colour literals)
- [Source: docs/planning-artifacts/architecture.md#Decision H] — **H.1** `organismIds` ≡ the placed
  set; **H.4** the `BattleSummary` field list this story amends
- [Source: docs/planning-artifacts/architecture.md#Minor Resolutions] — **M4** (tile thumbnails are
  on-demand and never stored — the reason the placeholder is not a cached image), **M6/G.3** (255
  organisms per battle, library uncapped)
- [Source: docs/planning-artifacts/prds/…/prd.md#FR-7.1–7.3] — Gallery is the home page, sorted by
  last modified; tile shows name + snapshot; metadata via tooltip **or expandable section**: dates
  created/modified and organism names
- [Source: docs/planning-artifacts/prds/…/prd.md#NFR-3.1 / NFR-4.2 / NFR-7.2] — ≥1024px, <100ms
  interaction feedback, ~50-battle soft capacity
- [Source: docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md:55-95] — `Battle`,
  `BattleSummary`, `BattleRepository`; the DI factory (its `process.env` read and dotted filename are
  both stale — `lib/mode.ts` and `repositoryFactory.ts` win)
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 1/2] — the
  gallery load/delete/reload shape and the state-placement rule; `<BattleCard>`/`<BattleGalleryPage>`/
  `useAsyncResource` are illustrations (conflicts 2 and 3)
- [Source: docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md#Decision 3] — Emotion is
  the styling engine; `styled()` for static, `sx` for dynamic only
- [Source: docs/planning-artifacts/ux-designs/…/clinical-lab-theme/battle-gallery.html:234-424] — the
  tile grid (`auto-fill, minmax(320px, 1fr)`, 24px gap), tile padding/border, hover treatment, the
  `.tile-header`/`.petri-dish`/`.tile-meta` structure, participant dots and their tooltip, and the
  toolbar this story does not build
- [Source: docs/planning-artifacts/ux-designs/…/ux-design-complete.md#Clinical Lab Theme] — token
  spec, sharp corners, hover-lift language (UX-DR1, UX-DR18)
- [Source: packages/domain/src/battleSchema.ts:74-90] — the projection being amended, and the comment
  explaining why Zod's strip *is* the mechanism
- [Source: packages/domain/src/battleSchema.test.ts:170-214] — the pinned assertions Task 1 updates
- [Source: packages/persistence/src/localStorageBattleRepository.ts:45-56] — `list()` skips
  unparseable records; the honest note that `JSON.parse` still materialises grids
- [Source: packages/persistence/src/repositories.ts:16-29] — the interfaces components must type
  against
- [Source: packages/test-utils/src/mockWorkspace.ts:270-296] — the two AR-45 battles, their rosters
  and their frozen timestamps (AC4 + AC2)
- [Source: apps/web/lib/displayColor.ts] — `displayColor`, `MAX_AGE_SHADE`, `ageShadeFor` and the
  `displayColor(token, 7) === hex` identity
- [Source: apps/web/lib/paletteRegistry.ts:97-113] — `paletteIndexOf` degrades-and-warns on an
  unknown token (Decision I.4); never throws
- [Source: apps/web/lib/useWorkspaceSeed.ts] — the seed lifecycle this story's load must wait on, and
  the ref-vs-closure distinction
- [Source: apps/web/app/page.tsx, page.test.tsx, e2e/home.spec.ts, e2e/appShell.spec.ts] — the exact
  assertions this story rewrites, including `appShell.spec.ts:28-37`'s hydration gate
- [Source: apps/web/lib/themeTokens.test.ts:157-200] — the "every `--gol-*` reference resolves"
  sweep that automatically covers the new components
- [Source: apps/web/lib/theme.ts] — `shape.borderRadius: 0` and the pinned `action.*` tokens the tile
  inherits; the still-Material status colours it must not use
- [Source: eslint.config.mjs:26-100] — the AR-46 selector group (now un-anchored) and its
  file-granular `ignores`
- [Source: apps/web/playwright.config.ts] — e2e serves the **production** export from `out/` across
  chromium/firefox/webkit/tablet: why AC4 is a unit test and the populated e2e must seed storage
- [Source: scripts/check-bundle-size.mjs] — the 300 KB gzip gate; 281.4 KB is the Story 1.9 baseline
- [Source: docs/implementation-artifacts/deferred-work.md] — the `--gol-bg-hover`,
  `useWorkspaceSeed` error-path, `updatedAt < createdAt`, and renderer entries this story resolves,
  re-points, or must leave alone
- [Source: docs/implementation-artifacts/1-9-clinical-lab-theme-tokens-app-shell.md] — the shell
  patterns, the three corrected comments, and the bundle/`npm run ci` lessons
- [Source: docs/project-context.md] — injected repositories, no DOM types in `packages/*`, grid
  dimensions are never constants, camelCase filenames, the commit gate

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the `bmad-dev-story` workflow.

### Debug Log References

- `npm run typecheck` — clean, 5/5 packages (turbo cache-aware).
- `npm run lint` — clean on first full run after one fix (see below).
- `npm run format:check` — 4 files needed `prettier --write` on the first pass
  (`BattleGallery.test.tsx`, `gallery.spec.ts`, `formatBattleDate.ts`, `gallerySort.test.ts`);
  clean after.
- One lint fix mid-implementation: `BattleGallery.tsx`'s original effect called
  `setState({ kind: 'error' })` synchronously in the effect body for `seedStatus === 'error'`,
  which `react-hooks/set-state-in-effect` (part of `eslint-config-next`'s React Compiler rules)
  flags as a cascading-render risk. Refactored to a `LoadState` (`idle` | `ready` | `error`,
  written only from the async `Promise.all` callbacks) plus a derived `GalleryState` computed at
  render time from `seedStatus` and `loadState` together — the effect body itself now only ever
  early-returns or kicks off the async `refresh()`, never calls `setState` synchronously. Re-ran
  the full `apps/web` suite (257/257) and lint (clean) after.
- Sanity-checked the AR-46 rule still catches the mockup's raw `boxShadow: '0 4px 12px rgba(0,
  212, 255, 0.15)'` form by temporarily writing it into `BattleTile.tsx` and re-running
  `npx eslint` (failed as expected, `no-restricted-syntax`), then reverted (Task 7).
- `npm run ci` (full pipeline, redirected to a file, exit code checked explicitly per Task 7's
  warning — never piped): **exit 0** on the first full run after the format fix above.
  - `@gol/domain`: 5 files / 88 tests, coverage 100% stmts/branch/funcs/lines (≥90% gate).
  - `@gol/persistence`: 7 files / 82 tests.
  - `@gol/test-utils`: 5 files / 75 tests.
  - `@gol/simulation`: no test files (unchanged by this story, expected).
  - `web` (apps/web, no coverage gate by design): 21 files / 257 tests.
  - `bundle:check`: **284.8 KB gzip / 300 KB budget — 15.2 KB headroom** (Story 1.9 baseline was
    281.4 KB / 18.6 KB headroom; this story's rise is 3.4 KB for two new components + four new
    `lib` helpers, zero new dependencies and zero new MUI component imports — confirmed by
    grepping both new components for `@mui` imports, which resolve to `styled` only).
  - `e2e`: 36 passed across chromium/firefox/webkit/tablet (9 tests × 4 projects: 3 `appShell`
    + 3 `gallery` (new) + 3 `home`), 0 failed.

### Completion Notes List

- **AC1** (list()-only, no grid deserialization): proven by `BattleGallery.test.tsx`'s spy
  assertion (`load`/`listFull` never called) — the load-bearing test the Dev Notes called out by
  name, not merely "tiles appear".
- **AC2** (most-recent-first): `gallerySort.test.ts` unit-tests the tie-break chain
  (`updatedAt` → `name` → `id`) in isolation; `BattleGallery.test.tsx` and `gallery.spec.ts` both
  assert on the *rendered heading sequence* for out-of-order seeds, not on the sort helper's
  return value.
- **AC3** (name, created/modified dates, organism names via expandable disclosure, hover
  affordances): `BattleTile.tsx`'s disclosure button + panel, `BattleTile.test.tsx` covers
  collapsed/expanded/keyboard-activated/10-organism-cap/dangling-id/absent-createdAt states, and
  `gallery.spec.ts` proves the real-browser keyboard path. The `createdAt` resolution (Task 1,
  ratified by Sidiar 2026-08-07) is propagated to `battleSchema.ts`, both pinned test assertions,
  and all three named docs (architecture.md Decision H.4, RFC-001, RFC-005), each with a dated
  note.
- **AC4** (AR-45 dev fixtures appear): `page.test.tsx`'s retargeted `NODE_ENV=development` test now
  asserts both fixture tiles render, in the frozen-timestamp order (Grand Colony War before
  Three-Way Skirmish) — one test covering AC4 and AC2's real-data half, as the Dev Notes specified.
- **AC5** (keyboard-focusable, axe-clean): tiles are focusable through the disclosure button, never
  `tabIndex` on the `<article>` (forced decision 4) — `BattleTile.test.tsx` proves Enter and Space
  both toggle it. `axe(container)` is asserted clean collapsed *and* expanded in
  `BattleTile.test.tsx` and `BattleGallery.test.tsx` (populated/empty/error bodies), plus a
  real-browser `AxeBuilder` run in `gallery.spec.ts`.
- **Task 5's three replaced assertions**, stated explicitly per the Dev Notes' "say this in the Dev
  Agent Record" instruction: the `/wired to @gol\/domain \(\d+ organism fields\)/` regex and the
  `mode: {APP_MODE}` line are both gone from `page.tsx` and from `page.test.tsx`'s assertions — a
  rendered tile is a strictly stronger proof that `@gol/domain`/`@gol/persistence` resolved to
  their TS source than the old truthiness-adjacent regex ever was, and `createRepositories()`
  already throws on an unknown mode (a real gate, not displayed text). This was not a silent
  deletion: both removals are called out here and in `page.test.tsx`'s own comments.
  `appShell.spec.ts`'s hydration gate (`workspace: ready`) is retargeted to `'No battles yet.'`,
  which has the identical property (absent from the prerendered HTML, reachable only after client
  effects run) — the wait itself was kept, not dropped, per the Dev Notes' explicit warning.
- **Both deferred-work.md entries Task 4 named are updated**, not just Task 1's docs propagation:
  `--gol-bg-hover` is re-pointed to Story 1.13's `.action-menu-btn` (the tile hover changes border
  + shadow only, confirmed by reading `BattleTile.tsx`'s own hover rule); the `useWorkspaceSeed`
  error-path entry is marked closed to the extent this story owns it — `BattleGallery` now renders
  the `role="alert"` body for both a seed-status error and a rejecting `list()`, with the
  underlying error object still undiagnosed (Story 5.11's scope, noted explicitly).
- **No change to `docs/project-context.md`** — checked explicitly (Task 7); the injected-repository
  and page-boundary description there already matches this story's `page.tsx`/`BattleGallery.tsx`
  split, and the Gallery introduces no new tool, version, or convention.
- **Bundle headroom after this story: 15.2 KB**, against 1.11 (thumbnails/canvas) and 1.13
  (Dialog, confirmation UI, the status palette tokens) still to come out of it.

### File List

**New:**
- `apps/web/components/BattleGallery.tsx`
- `apps/web/components/BattleGallery.test.tsx`
- `apps/web/components/BattleTile.tsx`
- `apps/web/components/BattleTile.test.tsx`
- `apps/web/lib/gallerySort.ts`
- `apps/web/lib/gallerySort.test.ts`
- `apps/web/lib/tileOrganisms.ts`
- `apps/web/lib/tileOrganisms.test.ts`
- `apps/web/lib/formatBattleDate.ts`
- `apps/web/lib/formatBattleDate.test.ts`
- `apps/web/e2e/gallery.spec.ts`

**Modified:**
- `packages/domain/src/battleSchema.ts` — `createdAt` on `BattleSummarySchema`, optional
- `packages/domain/src/battleSchema.test.ts` — pinned assertions updated, two new tests added
- `apps/web/app/page.tsx` — rewritten to the page-boundary shape (repos + seedStatus → `<BattleGallery>`)
- `apps/web/app/page.test.tsx` — retargeted assertions (Task 5), new AC4 tile-order test
- `apps/web/app/themes.css` — `--gol-shadow-tile-hover` token added
- `apps/web/e2e/home.spec.ts` — placeholder-copy assertions retargeted to the empty-Gallery body
- `apps/web/e2e/appShell.spec.ts` — hydration signal retargeted
- `docs/planning-artifacts/architecture.md` — Decision H.4 field list amended with a dated note
- `docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md` — `BattleSummary` interface amended
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — usage-index note amended
- `docs/implementation-artifacts/deferred-work.md` — two entries resolved/re-pointed
- `docs/implementation-artifacts/sprint-status.yaml` — status transitions (this workflow)

## Change Log

- 2026-08-07: Story created (context engine run against epics 1.10 + FR-7.1/7.2/7.3, AR-15/25/26/27/46,
  architecture Decisions H.1/H.4 + M4 + G.3, RFC-001 §1, RFC-005 Decisions 1–2, RFC-003 Decision 3,
  the Clinical Lab gallery mockup, and the shipped Story 1.4–1.9 code). Five forced decisions flagged
  for the Dev Agent Record — the `BattleSummary.createdAt` addition, the unimplementable `Gen 47`
  badge, disclosure-over-CSS-tooltip for FR-7.3, focus via a real control rather than `tabIndex`, and
  the removal of the `workspace:`/`mode:` debug lines that six assertions read. Five spec conflicts
  surfaced rather than silently resolved: **AC3 vs Decision H.4's projection — resolved the same day
  by Sidiar as `createdAt: IsoTimestamp.optional()` with propagation to H.4/RFC-001/RFC-005**,
  `<BattleCard>` vs "tile", RFC-005's pre-App-Router gallery wrapper and
  `useAsyncResource`, the mockup toolbar with no FR behind it, and `--gol-bg-hover` still unpainted.
  Status → ready-for-dev.
- 2026-08-07: Implemented (Claude Sonnet 5, `bmad-dev-story`). All 7 tasks complete, all 5 ACs
  satisfied. One implementation-time deviation from the story's exact snippet: `BattleGallery.tsx`'s
  load effect does not call `setState({ kind: 'error' })` synchronously in its body for
  `seedStatus === 'error'` as sketched in Task 2 — `eslint-config-next`'s
  `react-hooks/set-state-in-effect` rule flags that as a cascading-render risk, so the error case is
  folded into a `state` value derived at render time from `seedStatus` and an internal `loadState`
  instead; behaviour is identical (proven by the same `BattleGallery.test.tsx` cases the story
  specified), only the internal state shape differs. Full `npm run ci` green: 88+82+75 package
  tests, 257 `apps/web` tests, `packages/domain` at 100% coverage (≥90% gate), bundle 284.8 KB / 300
  KB (15.2 KB headroom), 36/36 e2e across chromium/firefox/webkit/tablet. Status → review.
