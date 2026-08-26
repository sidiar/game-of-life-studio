---
baseline_commit: 4256822
---

# Story 2.2: Create New Battle & Gallery Wiring

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to start a brand-new battle from the Gallery,
so that I can begin designing immediately.

## Acceptance Criteria

1. **Given** the Gallery, **When** "New Battle" (or the empty-state "Create Your First Battle" CTA)
   is clicked, **Then** the app navigates to `/battle/new` and seeds an empty grid at the default
   editable preset (FR-7.4, FR-3.1; see **Spec conflicts surfaced #1** for where the default
   actually comes from)
2. **And** the Story 1.12 empty-state CTA is now live — the no-dead-affordance gap closes here
3. **Given** a new unsaved battle, **When** the user leaves without saving, **Then** nothing is
   persisted and the Gallery is unchanged
4. **And** the new battle opens with the title "Untitled Battle" and an empty canvas

> 📐 **Scope discipline — "an empty canvas" (AC4) is not a canvas in this story.**
> `<PetriDishCanvas variant="edit">` is **Story 2.4**; the renderer's editing paths are **2.3**.
> This story seeds the empty **grid state** (the model) and renders the battle skeleton around it
> with the title "Untitled Battle". Prove the seed with a **pure unit test on the seed factory**,
> not by inventing debug DOM to assert against. See **What NOT to build**.

> 🛑 **Do not persist anything.** No `battles.save()`, no `crypto.randomUUID()` written to storage,
> nowhere in this story. A battle with zero placed organisms and an all-zero grid is
> **schema-legal** (`BattleSchema.superRefine` permits an empty `organismIds` beside an empty
> grid), so "helpfully" creating the record on open would compile, pass its own tests, and quietly
> fill the Gallery with phantom empty battles — the exact failure AC3 exists to forbid. Saving is
> **Story 2.13**.

> ⚠️ **The bundle gate measures the HOME route, and this story edits it.**
> `scripts/check-bundle-size.mjs` gzips only `out/index.html`; Story 2.1 landed it at
> **319.7 KB against a 330 KB budget — 10.3 KB of headroom**. `@mui/material/Button` is not
> affordable here and is not needed: both CTAs are `styled(Link)` over `next/link`, the pattern
> `BackLink` and `TitleLink` already use.

## Tasks / Subtasks

- [x] **Task 1: The default preset is read, never hardcoded** (AC: 1, 4)
  - [x] Resolve the new battle's `gridSize` from `repositories.settings.load()` →
        `settings.defaultGridSize`. **Do not write `{ cols: 100, rows: 60 }` anywhere.**
        `project-context.md` and Decision A both make a literal `100`/`60` a bug on sight, and the
        setting already exists in storage (`SettingsSchema.defaultGridSize`, Story 1.4/1.5) with
        exactly that default — see **Spec conflicts surfaced #1**. Today the observable behaviour
        is identical; the difference is that Story 6.8 ships a *control*, not a rewrite of this code.
  - [x] ⚠️ `SettingsRepository.load()` never returns `null` (an absent record resolves to
        `DEFAULT_SETTINGS`, `repositories.ts:48-51`) but it **throws `CorruptDataError` for a
        corrupt record**. A corrupt `gol:settings` must not blank the create route. Use the
        Gallery's established shape: `settings.load().catch(() => DEFAULT_SETTINGS)`
        (`BattleGallery.tsx`, the third entry in its `Promise.all`). `DEFAULT_SETTINGS` is exported
        from `@gol/domain` and is `Object.freeze`d — never mutate it.
  - [x] Settings load once, in `<BattlePage>`'s existing `useAsyncResource` load function. No new
        prop: `<BattlePage>` already receives the whole `AppRepositories` (spec §3.1), so
        `repositories.settings` is already in hand. Do **not** thread a `defaultGridSize` prop down
        from the route file.

- [x] **Task 2: Seed the new battle as a pure factory** (AC: 1, 4)
  - [x] New file `apps/web/lib/newBattleDraft.ts` (camelCase, never dotted). One pure function
        taking the preset and returning the seeded draft. It has no React, no repository, no
        `Date.now()` surprise — which is what makes AC1/AC4 testable without a canvas.
  - [x] ⚠️ **`Array(rows).fill([])` hands every row the SAME array reference** — writing one cell
        would write a whole column, and it looks correct until Story 2.5 paints. Use
        `Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))`, the shape
        `packages/test-utils/src/gridBuilders.ts#emptyGrid` documents for this exact reason.
  - [x] ❌ **You cannot import `emptyGrid` from `@gol/test-utils`.** `eslint.config.mjs`'s
        import-boundary block bans it in `apps/web` production code (test and e2e files are
        exempt). If you want the domain to own the builder instead of duplicating it, that is
        **forced decision 4** — decide and record, don't drift.
  - [x] Draft shape: cover exactly what a battle-in-progress needs and nothing more —
        `name`, `gridSize`, `gridState`, `organismIds`. The battle's **id** is **forced decision 5**.
        Do not add `createdAt`/`updatedAt`: those are stamped by the save path (Story 2.13), and a
        timestamp minted here would be a lie the moment the user leaves without saving.
  - [x] `name` is the empty string `''`, **not** the literal `"Untitled Battle"`.
        `battleDisplayName('')` already returns `"Untitled Battle"` for display (`lib/battleDisplayName.ts`),
        and `BattleSchema.name` is `z.string().max(100)` with no lower bound — seeding the display
        fallback as the stored name means Story 2.11's name field opens pre-filled with placeholder
        text the user has to delete, and Story 2.13 would persist "Untitled Battle" as a real name.
  - [x] Tests (`newBattleDraft.test.ts`): dimensions match the passed preset at **both** {50×30,
        100×60} (a test at one preset cannot catch a hardcoded constant); every cell is `0`; rows
        are **distinct array instances** (mutating `grid[0][0]` must not change `grid[1][0]`);
        `organismIds` is empty; `name` is `''`.

- [x] **Task 3: `<BattlePage>` renders the seeded battle, not a placeholder** (AC: 1, 3, 4)
  - [x] Replace the `battleId === 'new'` `<Notice>` placeholder in
        `apps/web/components/battle/BattlePage.tsx` with the same skeleton the loaded-battle branch
        renders: `<BattleHeader battleTitle={battleDisplayName(name)} />` plus the existing body.
        The heading becomes **"Untitled Battle"** (AC4).
  - [x] Resolve both branches to **one value** before rendering, so Stories 2.4/2.5/2.11/2.13 read
        one shape rather than branching on `battleId === 'new'` forever. `component-tree-battle-page.md`
        §3.1 already names the state this page owns (`battleName`, `isDirty`, `sessionRoster`,
        `initialGrid` + undo ring); this story lands the *loaded/seeded* half of it and nothing else.
  - [x] ⚠️ **Keep the branch ORDER: `'new'` is checked BEFORE `'error'`.** It is load-bearing and
        the file says so — `/battle/new` still awaits `organisms.list()` in the shared
        `Promise.all`, so with the error branch first a corrupt organism record makes the create
        route announce "this battle could not be loaded, its stored data may be damaged" about a
        battle that does not exist. That regression was found and fixed in the Story 2.1 review;
        its two tests are named in Task 6 and must survive, retargeted.
  - [x] ⚠️ **`'new'` must still never reach `battles.load()`.** `BattlePage.test.tsx`'s `loadSpy`
        assertion pins this; keep it.
  - [x] ⚠️ **The `ready` + `null` trap is still live.** Branch on `status` before touching `data`
        — `if (!data) return <Loading/>` folds "battle does not exist" into "still loading". The
        existing comment in the file explains it; do not simplify it away while restructuring.
  - [x] ❌ Do not add `useWorkspaceSeed` to the battle route. Story 2.1 decided against it (a
        second seeding boundary doubles the M9 "Conway's Classic is re-seeded" surface) and a new
        battle needs no roster to exist — the roster is Stories 2.9/2.10.

- [x] **Task 4: The Gallery toolbar CTA** (AC: 1)
  - [x] `BattleGallery.tsx` gains the mockup's `.toolbar` band between `SectionHeader` and the tile
        grid, holding the create CTA **and nothing else**. Search input, Sort-By dropdown and
        battle-count badge stay out — see **Spec conflicts surfaced #3**; that is Story 1.10's
        recorded resolution, not an oversight to correct.
  - [x] Mockup source: `clinical-lab-theme/battle-gallery.html` — `.toolbar` CSS at `:111-125`,
        `.create-button` at `:127-144`, markup at `:491-499`. Label: **"+ Create New Battle"**.
  - [x] Render it as a **link, not a button** (forced decision 1). Colours are `var(--gol-*)`
        tokens only — the AR-46 no-raw-hex rule is active on `apps/web`, and the mockup's
        `#00e5ff` hover has a token (`--gol-accent-hover`); check `app/themes.css` before adding
        anything new. Static chrome goes through `styled()`, not `sx` (RFC-003 Decision 3).
  - [x] Hover **and** `:focus-visible` parity — the Story 1.9 review established this for every new
        interactive chrome element; `BackLink` in `components/layout/Notice.tsx` is the shipped
        example.
  - [x] Decide and record whether the toolbar renders during `loading` / `error` / empty
        (**forced decision 2**).

- [x] **Task 5: The empty-state CTA goes live** (AC: 2)
  - [x] `GalleryEmptyState.tsx`: the `EmptyPrompt` `<p>` ("Create your first battle to begin.")
        becomes the real CTA. That sentence exists **only** because Story 1.12 had no route to send
        it to — its own comment says "the FR-7.4 prompt ships as sentence text until Story 2.2
        wires the real CTA". Replace it; do not keep both the sentence and a button saying the same
        thing.
  - [x] Label: **"Create Your First Battle"** — see **Spec conflicts surfaced #2**. `EmptyDescription`
        (the "what is this app" paragraph, NFR-4.1) stays exactly as it is.
  - [x] Share one styled control between Tasks 4 and 5 rather than styling `.create-button` twice —
        two copies drift the moment either is themed. Both are the same visual affordance with
        different labels.

- [x] **Task 6: Retarget the assertions Story 2.1 wrote against the placeholder** (AC: 1, 2, 4)
  - [x] `BattlePage.test.tsx:127` — *"never calls battles.load for the 'new' route, and renders its
        own placeholder"*: keep the `loadSpy` assertion, change the expected heading to
        "Untitled Battle", drop the Back-to-Gallery link assertion per **forced decision 3**.
  - [x] `BattlePage.test.tsx:146` — *"renders the New Battle placeholder even when the organism
        library fails to load"*: the **branch-order regression guard**. Retarget the heading; keep
        `expect(screen.queryByText(/stored data may be damaged/i)).not.toBeInTheDocument()`
        verbatim — asserting the heading alone lets a re-swap pass on a substring.
  - [x] `BattlePage.test.tsx:160` — *"still shows the failure body when a real battle id meets a
        corrupt organism library"*: unchanged, and it must stay green. If it goes red you coupled
        the two branches while unifying them.
  - [x] `e2e/battleRoute.spec.ts:88-96` — *"serves /battle/new as its own prerendered page"*: its
        comment says the CTA "stays inert until Story 2.2". Update the comment and the heading; the
        Back-to-Gallery link assertion follows forced decision 3.
  - [x] `GalleryEmptyState.test.tsx` — the *"ships no button, link, or other focusable control
        (AC2, no-dead-affordance)"* test is now **inverted**, not obsolete. Rewrite it into its
        mirror image: exactly **one** focusable control, it is a link, its `href` is `/battle/new`,
        and its accessible name is the CTA label. Reuse the file's existing focusable-selector list
        so an `<input type="button">` still cannot sneak past. **Do not delete the test.**
  - [x] `BattleTile.test.tsx`, `AppNav.test.tsx`, `AppShell.test.tsx`, `not-found.test.tsx`,
        `e2e/appShell.spec.ts` must pass **untouched**. If one goes red, this story reached
        somewhere it should not have.

- [x] **Task 7: Tests** (AC: 1–4)
  - [x] `newBattleDraft.test.ts` — Task 2's list.
  - [x] `BattlePage.test.tsx` — `/battle/new` renders the `<h1>` "Untitled Battle"; the settings
        repository **is** consulted (spy on `settings.load`); a repository whose `settings.load`
        **rejects** still renders the seeded battle (built by replacing one method on
        `createFakeRepositories()`, the file's existing `withFailingOrganismList` pattern — never a
        hand-rolled fake); the route still ships **zero buttons**
        (`expect(screen.queryAllByRole('button')).toHaveLength(0)`) and exactly one `<h1>`.
  - [x] `BattleGallery.test.tsx` — the CTA renders with `href="/battle/new"`; it renders in the
        populated Gallery and in the empty Gallery per forced decision 2; `axe` clean.
  - [x] `GalleryEmptyState.test.tsx` — Task 6's inverted control test plus the existing heading /
        description / `aria-hidden` glyph / `axe` assertions, unchanged.
  - [x] `apps/web/e2e/createBattle.spec.ts` (NEW) — the **AC3 proof, and the only level it can be
        proven at**: seed a workspace, click the Gallery CTA, land on `/battle/new`, see
        "Untitled Battle", navigate back to `/`, and assert the battle count is **unchanged** and
        no `gol:battles` record was added. A jsdom test cannot make this claim; the e2e runs against
        the served **production static export**, so the AR-45 dev fixtures are absent and
        localStorage must be seeded before load (`e2e/gallery.spec.ts`'s `buildSeedPayload` /
        `seedWorkspace` are the established helpers).
  - [x] Same spec, empty-workspace case: with **zero** battles seeded, the empty-state CTA
        navigates to `/battle/new` — the AC2 half, end to end.
  - [x] `apps/web` has **no coverage gate** (deliberate counter-metric). Write the tests the ACs
        need and stop; a test whose only purpose is to raise the number is rejected in review.

- [x] **Task 8: Bookkeeping and the full gate**
  - [x] Add any new deferred items to `deferred-work.md` under a Story 2.2 heading. Two existing
        Story 2.1 entries touch this route and are **not** yours to close: the "loading→settled
        transition is never announced" entry (owned by Story 2.4) and "Every battle shares one
        browser-tab title" (owned by Story 2.11).
  - [x] Run the **full** gate: `npm run ci` (typecheck → lint → format:check → spec:check →
        coverage → build:standalone → bundle:check → e2e). ⚠️ **Do not pipe it** — `npm run ci | tail`
        reports *tail's* exit code and has already masked a real `format:check` failure in this
        repo. Redirect to a file and echo `$?`. Record the actual result and the **bundle number**
        in the Dev Agent Record — this story spends home-route headroom and the next reader needs
        to know how much is left.
  - [x] ⚠️ A locally green `npm run ci` is not proof CI is green (the `e2e` job runs on Linux
        against a cached Playwright install). Check `gh run list` after pushing.

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **Link or button for the two CTAs.** Both mockups spell it `<button class="create-button">`, but
   the action is pure navigation to a static route — there is **no `useRouter` anywhere in this
   repo**, and Story 2.1 established `styled(Link)` for exactly this (`BackLink`, `TitleLink`). A
   link is middle-clickable, right-clickable, prefetched by the App Router, and works without a
   click handler. **Recommendation: `styled(Link)` wearing the mockup's button styling.** Record the
   choice; if you pick a `<button>` + programmatic navigation, say why, because it costs the above.
2. **Does the toolbar CTA render when the Gallery is empty / loading / errored?** An empty Gallery
   would then show two controls that do the same thing (toolbar + empty-state CTA). FR-7.4's AC
   frames the empty-state prompt as an *addition* ("When no Battles exist, display a 'Create Your
   First Battle' prompt"), not a replacement, and the mockups never render both because the biotech
   empty-state block is commented out — so the mockups do not settle it. Their accessible names
   differ, so there is no ambiguity for a screen-reader user either way.
   **Suggestion: render the toolbar unconditionally** (it is the persistent affordance; the empty
   state is first-run guidance) — but decide, record, and pin whichever you pick with a test.
3. **Does `/battle/new` keep a Back-to-Gallery link?** The 2.1 placeholder had one; the *loaded*
   battle branch has never had one — the real Back affordance is the sidebar footer in **Story
   2.16**. Keeping it makes `/battle/new` asymmetric with `/battle?id=`; dropping it leaves both
   battle surfaces with **no escape hatch** until 2.16 (browser Back still works).
   **Suggestion: drop it for symmetry**, and record it in `deferred-work.md` owned by 2.16 so the
   gap is visible rather than assumed. Either way, say which and update the two assertions in Task 6.
4. **Where the empty-grid builder lives.** `emptyGrid` exists in `@gol/test-utils` and is
   **banned** from `apps/web` production code by the ESLint import boundary. Options: (a) build the
   grid inside `lib/newBattleDraft.ts` — smallest diff, and `apps/web` genuinely is the wiring
   layer; (b) add `emptyGridState(cols, rows)` to `@gol/domain` (which already owns
   `BattleSchema.gridState`'s shape) and have `test-utils`' `emptyGrid` delegate to it — the
   re-export precedent already exists in `packages/test-utils/src/index.ts` for `CONWAYS_CLASSIC`,
   and Story 2.14's resize plus Story 5.8's import would reuse it. (b) costs a `packages/domain`
   change under a **≥90% coverage floor** (trivially met by a pure function). Pick one, record why;
   do not ship both.
5. **Does the draft carry an id?** `id: null` until Story 2.13's save mints one, or
   `crypto.randomUUID()` at seed time held in memory. `BattleSchema.id` is `z.uuid()`, so a `null`
   draft is *not* a `Battle` and must not be typed as one. **Suggestion: no id in the draft** — the
   entity does not exist until it is saved, and a uuid minted here is a value nothing can use and
   everything can accidentally persist. Say which, because 2.13 inherits it.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

**#1 — AC1's "100×60 until the FR-8.10 setting exists" is stale, and taking it literally violates
Decision A.** The setting *does* exist in storage: `packages/domain/src/settingsSchema.ts:27` has
carried `defaultGridSize: EditableGridPresetSchema.default(() => ({ cols: 100, rows: 60 }))` since
Story 1.4/1.5, `SettingsRepository.load()` resolves an absent record to `DEFAULT_SETTINGS`, and
`BattleGallery` already reads settings on every Gallery mount. What does **not** exist is the
*control* — that is Story 6.8.

Against that, hardcoding is forbidden by two authorities at once:
`docs/project-context.md#Critical Don't-Miss Rules` — *"Grid dimensions are never constants… A
hardcoded `100` or `60` anywhere is a bug"* — and Decision A.1: *"New battles default to the
FR-8.10 'Default Grid Size' setting."* Story 6.8's own AC (`epics.md:1545`) reads *"Story 2.2's
`'new'` seeding consumes it from now on"*, which names **this story's seeding path** as the consumer.

**Resolution: read `settings.defaultGridSize`.** The observable behaviour today is identical
(the default *is* 100×60), so no AC changes, and Story 6.8 ships a control instead of a retrofit.
The honest counter-reading — that "from now on" means consumption *begins* at 6.8 — is recorded
here and rejected: it would require this story to write the literal that project-context calls a
bug on sight.

**#2 — CTA copy: the mockups and the FRs disagree about the empty-state label.** Both mockups label
every create control `+ Create New Battle` (`clinical-lab-theme/battle-gallery.html:494`;
`biotech-terminal-theme/battle-gallery.html:644, :965`). But **FR-7.4's acceptance criterion** says
*"When no Battles exist, display a 'Create Your First Battle' prompt"*, and **this story's own AC1**
names it the *"empty-state 'Create Your First Battle' CTA"*. Two authority sites, both normative,
versus one mockup label.

**Resolution:** toolbar = **"+ Create New Battle"** (mockup, no FR names it); empty state =
**"Create Your First Battle"** (FR-7.4 + AC1, and it is the string the ACs test). Distinct labels
are also what makes forced decision 2 safe — a screen reader announces two different names, not the
same name twice.

**#3 — the mockup toolbar carries three controls this story must not ship.** `.toolbar` holds the
create button, a battle search input, a five-option Sort-By dropdown and a battle-count badge.
Story 1.10 resolved this (`epic-1/1-10-…md:606-611`) and the resolution stands: search exists as an
FR for the **organism library** only (FR-7.15 / UX-DR19) — there is no battle-search FR — and a
five-option sort dropdown directly contradicts FR-7.1's *fixed* "most recent first", which
`lib/gallerySort.ts` implements. Ship the toolbar band with the create CTA and nothing else.
Do not "complete the mockup".

**#4 — `project-context.md` still says "No PR flow exists".** It does now (`580767d` is a merge
commit from PR #2, and `CLAUDE.md` describes `story/*` branches). Pre-existing, not this story's job
to fix; just don't treat that paragraph as current.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **Creating the battle record on open.** A zero-organism, all-zero-grid battle passes
  `BattleSchema` (its `superRefine` only requires `organismIds` ≡ the *placed* set, and the empty
  set satisfies that). So `battles.save(draft)` on mount typechecks, parses, and silently breaks
  AC3 — every visit to `/battle/new` leaves a phantom "Untitled Battle" tile in the Gallery.
  Nothing in this story writes to any repository.
- ⚠️ **`Array(rows).fill([])`** shares one row array across every row. It renders fine, and fails
  in Story 2.5 when the first click paints a whole column.
- ⚠️ **A corrupt `gol:settings` must not blank the create route.** `settings.load()` throws
  `CorruptDataError`; the Gallery already degrades to `DEFAULT_SETTINGS` for exactly this. Left
  unhandled, it rides the shared `Promise.all` into the failure body and the create route again
  claims a nonexistent battle's data is damaged.
- ⚠️ **Branch order in `<BattlePage>`: `'new'` before `'error'`.** Fixed once already in the Story
  2.1 review. Two tests guard it — retarget them, never delete them.
- ⚠️ **`ready` + `null` reads as "loading".** Branch on `status` first. Restructuring the branches
  for one resolved shape is exactly where this gets reintroduced.
- ⚠️ **Home-route bundle headroom is 10.3 KB** and `bundle:check` only measures that route. One
  MUI `Button` import is the whole margin. Story 1.13's `Dialog` cost +18.1 KB for comparison.
- ⚠️ **`@gol/test-utils` is banned in `apps/web` production code** by `eslint.config.mjs` — the
  error message even names the trap. Test and e2e files are exempt.
- ⚠️ **`ctx.fillStyle = 'var(--gol-*)'` is a silent no-op** — not reachable here (no canvas in this
  story), and do not "get ahead" by resolving colours for Story 2.4.
- ⚠️ **`usePathname()`/`useSearchParams()` throw outside an App Router context under RTL**, and the
  error names React internals rather than the router. `next/link` alone does **not** need the mock —
  `BattleTile.test.tsx` renders `Link` today with no `next/navigation` stub — so do not add one
  reflexively.
- ⚠️ **Every ID you cite in a source comment is checked.** `npm run spec:check` fails the build when
  `AR-n` / `RFC-00n` / `FR-x.y` / `NFR-x.y` / `Mn` / `Decision A–Z` / `Story N.M` resolves to
  nothing under `docs/`. Spell them exactly as the specs do (`AR-2`, not `AR2`; `M9`, not `M-9` —
  a hyphenated form matches nothing and is silently exempt forever). Story files are exempt; source
  files are not.

### Previous story intelligence (Story 2.1, `2-1-battle-route-page-skeleton.md`)

- **Decision K is ratified and implemented**: `/battle?id=<uuid>` (static page + `?id`) and a static
  `/battle/new`. Both prerender; `npm run build:standalone` lists them as `○ (Static)`. Do not
  re-litigate the route shape, and do not introduce a dynamic segment for anything (**K.5**).
- **Route groups split the layout tree.** `app/(gallery)/` wears `AppShell`; `app/(battle)/` is the
  battle chassis with its own **unpadded** `<main>` (deliberate — Story 2.4's auto-fit canvas
  measures that box). `AppShell` stays route-unaware; never teach it `usePathname()`.
- **`battleId === 'new'` short-circuits** and never reaches `battles.load()`. This story keeps the
  short-circuit and replaces only what it renders.
- **The battle route's `<h1>` is the battle title**, rendered by `<BattleHeader>`. Nothing automated
  enforces single-`<h1>` (axe has no duplicate-h1 rule), so `BattlePage.test.tsx` carries this
  route's count assertion. Your seeded branch must render exactly one.
- **`useAsyncResource`** (`lib/useAsyncResource.ts`) is `{ data, status }` only — no `reload`. Its
  **deps must be referentially stable**: the deps-change reset runs during *render*, so an unstable
  deps element makes every render set state and React throws "Too many re-renders". `repositories`
  is `useMemo`-stable from the page boundary; keep it that way and do not add a fresh object or
  array to the deps.
- **`Promise.all` rejects on the first rejection** — a corrupt *organism* record still blanks the
  loaded-battle route with the failure body. Deferred to Story 2.9 and pinned by a test; do not
  "fix" it here, and do not let your settings addition make it worse.
- **`battleDisplayName('')` → `"Untitled Battle"`** (`lib/battleDisplayName.ts`, title case, four
  authority sites). Third consumer already; do not write a fourth ternary.
- **`createFakeRepositories()` from `@gol/test-utils`, never a hand-rolled fake.** To make one
  method fail, spread a real fake and replace that method (`withFailingOrganismList` in
  `BattlePage.test.tsx`) so the other ~20 methods keep their real contracts.
- **The `axe` pattern** is `const results = await axe(container); expect(results.violations).toEqual([])`
  — the matcher is deliberately not wired (`vitest.setup.ts`).
- **Epic 1's stories are archived in `docs/implementation-artifacts/epic-1/`**, which the BMad
  non-recursive glob does not see. **Epic 2's story files stay flat** beside `sprint-status.yaml`.
- Carry-overs worth naming: **Story 1.12** shipped the empty-state prompt as inert sentence text
  *specifically* awaiting this story; **Story 1.10** shipped no toolbar for cause (conflict #3
  above); **Story 1.13** moved the bundle budget to 320 and 2.1 to 330 — per-component MUI imports
  only (AR-35), no `@mui/icons-material`.

### Git intelligence

`4256822` is the baseline; `main` is clean. The Story 2.1 work landed as PR #2 (`580767d`), and
three of its commits constrain this story:

- `425f172` created `components/battle/`, the route groups, `lib/useAsyncResource.ts` and
  `lib/battleDisplayName.ts`. Extend those; do not re-derive them.
- `09f70df` (review fixes) is where the **branch-order** bug was caught and where the two guard
  tests come from. Re-introducing it by restructuring the branches would be a repeat, not a new bug.
- `93b54c8` added `app/not-found.tsx` and moved the notice primitives into
  `components/layout/Notice.tsx`. `<Notice>` keeps **two** consumers on the battle route
  (error, not-found) after your change removes the third — do not delete the module.

Commit message format observed for story work: `feat: create new battle & gallery wiring (story 2-2)`
for the implementation, `fix: apply story 2-2 code review findings` for follow-ups.

### Latest technical information

- **Next 16.2.12** (`package.json` declares `^16.2.10`). `next/link` in the App Router; no
  `useRouter` needed and none is used anywhere in this repo today.
- **MUI 9.3.1** — `styled()` from `@mui/material/styles` only. This story needs **no new MUI
  component**: two links, a flex container and the existing header are `styled()` primitives.
- **React 19.2.7** — StrictMode double-invokes effects in dev; `useAsyncResource` already handles it
  with a closure liveness flag.
- **No new dependencies.** Not a router library, not a data-fetching library, not an icon package.

### What NOT to build (scope boundaries)

- ❌ **The canvas.** `<PetriDishCanvas variant="edit">`, auto-fit, `GridRenderer` wiring — Story 2.4.
  AC4's "empty canvas" is the seeded grid *state*, proven by unit test.
- ❌ **The renderer's dirty-region editing paths** — Story 2.3.
- ❌ **Painting, erasing, undo, `useUndoableGrid`** — Stories 2.5–2.8.
- ❌ **The editor sidebar**: roster, name field, grid settings, tools, Back footer — Stories
  2.9/2.11/2.14/2.15/2.16.
- ❌ **`isDirty`, `useDirtyGuard`, `beforeunload`, the unsaved-changes dialog** — Stories 2.11/2.16.
- ❌ **Save of any kind** — Story 2.13. No `battles.save()`, no id minted into storage.
- ❌ **Any Run/Play affordance** — Epic 3. The route still ships **zero buttons**.
- ❌ **Gallery search, Sort-By dropdown, battle-count badge** — conflict #3; no FR behind them.
- ❌ **The Default Grid Size *control*** — Story 6.8. This story only *reads* the setting.
- ❌ **A `<BattleNameField>` or any editable title** — Story 2.11. The header title stays text.
- ❌ **Refactoring `BattleGallery`'s load reducer onto `useAsyncResource`.** Story 1.10 put that out
  of scope and Story 2.1 declined it again; it is the most-tested component in the app.
- ❌ **Touching `BattleTile`, `PetriDishCanvas`, the renderer, `AppShell`, `AppNav`, or
  `not-found.tsx`.** No AC reaches them; a diff there is a regression surface with no requirement
  behind it.
- ❌ **New npm dependencies of any kind.**
- ❌ **Editing any file under `docs/planning-artifacts/`.** Conflicts get surfaced in the Dev Agent
  Record and `deferred-work.md`, never patched into a spec from a story.

### Project Structure Notes

Target layout after this story (new marked; everything else is an edit):

```
apps/web/
  components/
    battle/
      BattlePage.tsx             UPDATE — settings read, seeded 'new' branch, one resolved shape
      BattlePage.test.tsx        UPDATE — retarget the two 'new' tests; seeding + settings tests
    gallery/
      BattleGallery.tsx          UPDATE — toolbar band + create CTA
      BattleGallery.test.tsx     UPDATE — CTA presence/href/axe
      GalleryEmptyState.tsx      UPDATE — prompt <p> becomes the live CTA
      GalleryEmptyState.test.tsx UPDATE — the no-control test inverts
      CreateBattleLink.tsx       NEW  — the shared styled(Link) both CTAs wear (name is yours)
  lib/
    newBattleDraft.ts            NEW  — pure seed factory
    newBattleDraft.test.ts       NEW
  e2e/
    createBattle.spec.ts         NEW  — CTA → /battle/new → back → Gallery unchanged (AC3)
    battleRoute.spec.ts          UPDATE — the /battle/new heading + its stale comment
packages/domain/src/
    (only if forced decision 4 picks option (b): emptyGridState + its test + index export)
docs/implementation-artifacts/
  deferred-work.md               UPDATE — any new items under a Story 2.2 heading
```

Naming rules that bite here: non-component TS files are **camelCase, never dotted**
(`newBattleDraft.ts`); components are PascalCase `.tsx`; cross-package imports use `@gol/*` and
`@/*` resolves inside `apps/web` only. `apps/web` holds UI and wiring only — no simulation,
persistence, or rules logic.

### References

- [Source: docs/planning-artifacts/epics.md#Epic 2 / Story 2.2] — the story at :541-552; the four
  ACs verbatim at :549-552
- [Source: docs/planning-artifacts/epics.md#Story 6.8] — ":1545 — Story 2.2's `'new'` seeding
  consumes it from now on" (conflict #1)
- [Source: docs/planning-artifacts/epics.md] — AR-27 (:195), AR-28 (:196), AR-46 (:220)
- [Source: docs/planning-artifacts/architecture.md#Decision A] — A.1 "New battles default to the
  FR-8.10 setting"; dimensions are parameters, never constants
- [Source: docs/planning-artifacts/architecture.md#Decision K] — the route shape and K.5's standing rule
- [Source: docs/planning-artifacts/architecture.md#Decision H] — "used by a battle" ≡ placed; the
  persisted roster is exactly the placed set
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.1] — `<BattlePage>` props and the
  state it owns; *"'new' seeds an empty grid at the FR-8.10 default preset (FR-7.4)"*
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.2] — `<BattleHeader>` is display
  only; "Untitled battles display 'Untitled Battle'"
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-7.4] — Create New Battle;
  the "Create Your First Battle" prompt
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-3.1] — default 100×60,
  per-battle, configurable to either editable preset via FR-8.10
- [Source: docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md#Decision 3] — static
  chrome via `styled()`, not `sx`
- [Source: docs/project-context.md] — repositories injected never imported; grid dimensions never
  constants; camelCase file naming; `npm run ci` is the gate and must not be piped
- [Source: docs/implementation-artifacts/2-1-battle-route-page-skeleton.md] — the branch-order fix,
  the `ready`+`null` trap, the `useAsyncResource` deps precondition, the bundle-gate coverage note
- [Source: docs/implementation-artifacts/epic-1/1-10-battle-gallery-tiles-sorting.md:606-611] —
  "ship no toolbar", with the reasoning conflict #3 preserves
- [Source: docs/implementation-artifacts/epic-1/1-12-gallery-empty-state.md] — the empty-state CTA
  is deliberately inert copy, explicitly awaiting this story
- [Source: apps/web/components/battle/BattlePage.tsx] — the branch order, the short-circuit, the
  three terminal states
- [Source: apps/web/components/gallery/BattleGallery.tsx] — `settings.load().catch(() => DEFAULT_SETTINGS)`,
  the section header the toolbar sits under
- [Source: apps/web/components/gallery/GalleryEmptyState.tsx] — `EmptyPrompt`'s own comment naming
  this story as its consumer
- [Source: apps/web/components/layout/Notice.tsx] — `BackLink`, the shipped `styled(Link)` control
- [Source: packages/domain/src/settingsSchema.ts:27] — `defaultGridSize` and `DEFAULT_SETTINGS`
- [Source: packages/domain/src/battleSchema.ts] — why a zero-organism empty battle is schema-legal
- [Source: packages/domain/src/organismSchema.ts:36-42] — `EditableGridPresetSchema` = {50×30, 100×60}
- [Source: packages/persistence/src/repositories.ts:48-51] — `SettingsRepository.load()` never returns null
- [Source: packages/test-utils/src/gridBuilders.ts#emptyGrid] — the row-aliasing trap, documented
- [Source: eslint.config.mjs:104-126] — the `@gol/test-utils` import boundary
- [Source: scripts/check-bundle-size.mjs:33] — `BUDGET_GZIP_KB = 330`, home route only
- [Source: docs/planning-artifacts/ux-designs/.../clinical-lab-theme/battle-gallery.html] —
  `.toolbar` :111-125, `.create-button` :127-144, markup :491-499
- [Source: docs/planning-artifacts/ux-designs/.../biotech-terminal-theme/battle-gallery.html:959-967] —
  the commented-out empty-state block with its CTA

## Dev Agent Record

### Agent Model Used

sonnet (Claude Sonnet 5) — as recorded in the story's own Dev Model line.

### Debug Log References

`npm run ci` (not piped; redirected to a file, exit code echoed) — full local gate, run once at
the end of Task 8:

- `typecheck`: pass (all 5 workspaces)
- `lint`: pass, 0 errors, 1 pre-existing warning (`BattleGallery.tsx`'s `state`
  `react-hooks/exhaustive-deps` warning — confirmed present at the `4256822` baseline via
  `git stash`; only its line number shifted)
- `format:check`: pass
- `spec:check`: pass — 127 cited ids, all resolve
- `test:coverage`: pass — `@gol/domain` 5 files/85 tests, 100% coverage (untouched this story);
  `@gol/test-utils` 5 files/75 tests, 93.56% (untouched); `@gol/persistence` 7 files/82 tests,
  99.19% (untouched); `web` **33 files / 390 tests passed**, 95.37% stmts / 88.98% branch / 97.04%
  funcs / 97.23% lines (no gate on `apps/web` — reported for the record only)
- `build:standalone`: pass — route table unchanged: `○ /`, `○ /_not-found`, `○ /battle`,
  `○ /battle/new`, all `○ (Static)`. Decision K.5 intact.
- `bundle:check`: pass — **324.2 KB gzipped / 330 KB budget, 5.8 KB headroom** (down from Story
  2.1's 10.3 KB; this story's toolbar CTA, empty-state CTA and `CreateBattleLink` cost ~4.5 KB
  gzipped, all `styled()` chrome, zero new MUI components)
- `e2e`: pass — **140 passed** across chromium/firefox/webkit/tablet, including the 2 new
  `createBattle.spec.ts` tests and the retargeted `battleRoute.spec.ts` test, on all 4 projects

Local `npm run ci` is green; per project-context.md this is not proof CI is green — check
`gh run list` after pushing.

### Completion Notes List

- **Forced decision 1 (link vs button):** `styled(Link)` — `CreateBattleLink.tsx`, shared by both
  CTAs. No `useRouter` exists anywhere in this repo; matches `BackLink`/`TitleLink`.
- **Forced decision 2 (toolbar visibility):** renders **unconditionally** across
  loading/error/empty/ready. Pinned by `BattleGallery.test.tsx`'s "renders the toolbar CTA even
  while loading or errored" test and the "alongside the empty-state CTA, with distinct names"
  test — the two CTAs' accessible names differ ("+ Create New Battle" vs "Create Your First
  Battle"), so no screen-reader ambiguity.
- **Forced decision 3 (Back-to-Gallery link on `/battle/new`):** dropped, for symmetry with the
  loaded battle branch (which has never had one). Recorded in `deferred-work.md` under a new Story
  2.2 heading, owned by Story 2.16. `BattlePage.test.tsx` and `e2e/battleRoute.spec.ts` assert the
  link's absence.
- **Forced decision 4 (empty-grid builder location):** option (a) — built inline in
  `lib/newBattleDraft.ts` rather than adding `emptyGridState` to `@gol/domain`. Smallest diff;
  `apps/web` is already the wiring layer; avoids a `packages/domain` change (and its ≥90% coverage
  floor) for one pure function this story alone needs. `@gol/test-utils`'s `emptyGrid` stays
  un-reused (import-boundary ban), and the row-aliasing trap it documents is reproduced correctly
  (`Array.from`, never `Array(rows).fill([])`) with its own unit test.
- **Forced decision 5 (draft id):** no id in the draft (`NewBattleDraft` carries no `id` field at
  all, rather than `id: null`). The entity does not exist until Story 2.13 saves it; a draft typed
  without an id field cannot be mistaken for a `Battle` by the type system, which a `null`-typed id
  would only catch at the value level.
- **Spec conflict #1 resolved as written:** `settings.defaultGridSize` is read via
  `repositories.settings.load()` inside `<BattlePage>`'s existing `useAsyncResource` call — no new
  prop threaded down, no literal `100`/`60` anywhere in the diff.
- **Spec conflict #2 resolved as written:** toolbar CTA = "+ Create New Battle"; empty-state CTA =
  "Create Your First Battle". Both assert exact accessible names in their tests.
- **Spec conflict #3 respected:** the Gallery toolbar ships the create CTA only — no search input,
  no Sort-By dropdown, no battle-count badge.
- **`<BattlePage>`'s two branches resolve to one shape:** `NewBattleDraft` (`{ name, gridSize,
  gridState, organismIds }`) is now what both the loaded-battle branch (via a local `toDraft()`
  conversion) and the seeded `'new'` branch render from, rather than each branch building its own
  ad hoc value. Nothing beyond the header title currently reads `gridState`/`organismIds` from it —
  that consumption starts in Story 2.4+ — but the shape is unified now per Task 3.
- **Branch order preserved:** `'new'` is still checked before `'error'` in `<BattlePage>`, with the
  Story 2.1 regression comment intact; the `ready` + `null` trap's guard comment is unchanged.
- **No new dependencies, no new MUI components.** Two `styled(Link)` primitives and one
  `styled('div')` toolbar wrapper account for the whole diff's bundle cost.
- **`e2e/home.spec.ts` was also retargeted** (not in the story's own file list, but its own
  in-file comment — "Story 2.2 will add the CTA as a real control" — predicted exactly this
  change): the empty-state's no-focusable-control assertions are replaced with a single CTA-link
  assertion, matching `GalleryEmptyState.test.tsx`'s inverted test.

### File List

**New:**

- `apps/web/lib/newBattleDraft.ts`
- `apps/web/lib/newBattleDraft.test.ts`
- `apps/web/components/gallery/CreateBattleLink.tsx`
- `apps/web/e2e/createBattle.spec.ts`

**Modified:**

- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/gallery/BattleGallery.tsx`
- `apps/web/components/gallery/BattleGallery.test.tsx`
- `apps/web/components/gallery/GalleryEmptyState.tsx`
- `apps/web/components/gallery/GalleryEmptyState.test.tsx`
- `apps/web/e2e/battleRoute.spec.ts`
- `apps/web/e2e/home.spec.ts` (retargeted; not originally in the story's file list — see
  Completion Notes)
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date       | Change                                                          |
| ---------- | ---------------------------------------------------------------- |
| 2026-08-26 | Story created (create-story), ready-for-dev                     |
| 2026-08-26 | Implemented (dev-story): all 8 tasks complete, status → review  |

Dev Model: sonnet   # wiring inside the chassis Story 2.1 already built — the route, the page boundary, the styled(Link) CTA pattern, the loader and the display-name helper all exist; the one new shape (the seeded draft) is already specified by component-tree §3.1, and every trap is named with a test attached
