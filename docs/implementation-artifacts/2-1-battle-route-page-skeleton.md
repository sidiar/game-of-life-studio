---
baseline_commit: 49773cd
---

# Story 2.1: Battle Route & Page Skeleton

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to open a saved battle from the Gallery into its own editor page,
so that I can view and work on a specific battle.

## Acceptance Criteria

1. **Given** a Gallery tile, **When** clicked, **Then** the app navigates to the battle route and
   `<BattlePage>` loads that battle and the organism library via **injected** repositories
   (FR-7.5, AR-27; spec §3.1)
2. **Given** `<BattlePage>`, **When** mounted, **Then** it owns `mode` as local state with only
   `'lab'` populated — no Play toggle, no fullscreen affordance, no dead buttons (AR-28, NFR-4.1)
3. **And** the slim header displays the battle title **read-only**, falling back to
   "Untitled Battle" (spec §3.2)
4. **And** load-in-progress and load-failure render **distinct** states (`useAsyncResource`), with
   failure offering navigation back to the Gallery
5. **And** routes remain exactly `/` and the battle route (`/settings` arrives in Epic 5) (AR-28)

> 🛑 **This story cannot be implemented as AC1/AC5 are literally written.** `app/battle/[id]/page.tsx`
> **fails the build** under `output: 'export'`. Verified in this repo's own `next@16.2.12`
> (`node_modules/next/dist/build/index.js:1363-1368`): `config.output === 'export' && isDynamic &&
> !hasGenerateStaticParams` throws `Page "/battle/[id]" is missing "generateStaticParams()" so it
> cannot be used with "output: export" config.` — and `hasGenerateStaticParams` requires
> `prerenderedRoutes.length > 0`, so returning `[]` throws too. Battle ids are UUIDs minted in the
> user's browser and are **unknowable at build time**. Read **Spec conflicts surfaced #1** before
> writing a single file; it carries the resolution, the evidence, and the three alternatives that
> do not work.

> ⚠️ **This is the app's second route, and the first one that must NOT wear the Story 1.9 app
> shell.** `AppShell` (wordmark + `AppNav` + a 32px-padded `<main>`) is mounted in the ROOT layout
> and therefore renders on every route. The lab mockup's header is the battle title, with no
> wordmark and no nav (`petri-dish-lab-mode.html:647-656`). Two stacked headers is not a cosmetic
> problem: Story 2.4's auto-fit canvas (`cellSize = floor(canvasPx / dimension)`) sizes off the
> space this leaves. See **forced decision 2**.

> 📐 **Scope discipline.** This is a *skeleton*. No canvas, no sidebar, no roster, no tools, no
> save, no undo, no dirty tracking, no back-guard. The header title is a **read-only display**;
> `<BattleNameField>` is Story 2.11. See **What NOT to build**.

## Tasks / Subtasks

- [x] **Task 1: Settle the route shape and prove it survives the export build** (AC: 1, 5)
  - [x] Implement the resolution in **Spec conflicts surfaced #1**: a **static** `/battle` page that
        reads the id from `?id=<uuid>`, plus a **static** `/battle/new` page for Story 2.2. Both
        render the same `<BattlePage>`; `/battle/new` passes `battleId="new"`.
  - [x] Files: `apps/web/app/(battle)/battle/page.tsx` and
        `apps/web/app/(battle)/battle/new/page.tsx` (route-group placement comes from Task 2 —
        the group parentheses do **not** appear in the URL).
  - [x] ⚠️ `useSearchParams()` in a prerendered page throws
        `missing-suspense-with-csr-bailout` unless it sits inside a `<Suspense>` boundary
        (`next/dist/server/app-render/app-render.js:4279`). Put the `useSearchParams()` call in a
        child component and wrap it: `<Suspense fallback={<the same loading state as AC4}>`.
        Do **not** reach for `window.location.search` in an effect to dodge this.
  - [x] Cite **Architecture Decision K** in the Dev Agent Record as the authority for the route
        shape. It is a ratified decision, not a deviation — AR-28 already reads `/battle?id=`.
  - [x] **Verify:** `npm run build:standalone` succeeds and `apps/web/out/battle/index.html` +
        `apps/web/out/battle/new/index.html` both exist. A build that emits neither is the failure
        mode this task exists to catch.

- [x] **Task 2: Separate the battle chassis from the gallery shell** (AC: 3)
  - [x] Per **forced decision 2**: introduce route groups. `app/layout.tsx` keeps `<html>`,
        `<body>`, `AppProviders` and `./themes.css` and **stops rendering `AppShell`**.
  - [x] Move `apps/web/app/page.tsx` → `apps/web/app/(gallery)/page.tsx` and
        `apps/web/app/page.test.tsx` → `apps/web/app/(gallery)/page.test.tsx` (import stays
        `./page`). Add `apps/web/app/(gallery)/layout.tsx` rendering `<AppShell>{children}</AppShell>`.
  - [x] Add `apps/web/app/(battle)/layout.tsx` — the battle chassis. No wordmark, no `AppNav`, and
        its own `<main>` (the document must still have exactly one `<main>` landmark and, per Story
        1.9, exactly one `<h1>`).
  - [x] `AppShell.tsx` is otherwise **unchanged** — it keeps owning the `<main>` for the gallery
        branch. Do not make `AppShell` route-aware with `usePathname()`.
  - [x] **Verify:** `AppShell.test.tsx` and `e2e/appShell.spec.ts` still pass untouched — route
        groups do not change `/`'s rendered output. If they fail, the move was wrong, not the tests.

- [x] **Task 3: `useAsyncResource`** (AC: 1, 4)
  - [x] New file `apps/web/lib/useAsyncResource.ts` (camelCase, never dotted — alongside
        `useInView.ts` / `useWorkspaceSeed.ts`). Implement RFC-005 Decision 1's hook:
        `{ data, status: 'loading' | 'ready' | 'error' }`.
  - [x] ⚠️ Use RFC-005's **closure** liveness flag (`let alive = true` + cleanup), **not**
        `useWorkspaceSeed`'s `mounted` ref. The ref there exists solely because a `hasRun` guard
        makes StrictMode's second setup skip while the first setup owns the in-flight promise
        (see `useWorkspaceSeed.ts`'s doc comment). This hook has **no** run-once guard, so
        StrictMode's second setup starts its own load with its own live closure. Copying the ref
        pattern here imports a fix for a bug this hook does not have.
  - [x] Do **not** ship RFC-005's `reload` in this story — its snippet (`() => load().then(setData)`)
        sets no status and honours no liveness flag. Nothing in AC1–AC5 needs it; add it in the
        story that does, correctly.
  - [x] Tests (`useAsyncResource.test.tsx`): loading → ready; rejection → `error`; unmount before
        settle sets no state; a `deps` change re-runs the load. Render under `<StrictMode>` in at
        least one test — that is the only way the double-invoke path is exercised.
  - [x] ❌ Do **not** refactor `BattleGallery`/`BattleTile` onto this hook. Story 1.10 explicitly
        put `useAsyncResource` out of its scope; retrofitting it here is unrequested churn against
        the most-tested component in the app.

- [x] **Task 4: `<BattlePage>`** (AC: 1, 2, 4)
  - [x] `apps/web/components/battle/BattlePage.tsx`, `'use client'`. Props **exactly** per spec §3.1:
        ```ts
        interface BattlePageProps {
          repositories: AppRepositories   // the DI seam (AR-2/27) — typed to the interface
          battleId: string | 'new'
        }
        ```
  - [x] State: `const [mode] = useState<'lab'>('lab')`. AC2 is "owns mode as local state with only
        `'lab'` populated". Keep the state cell (Epic 3 adds the setter and the `'run'` branch) but
        render **no** toggle and **no** fullscreen button.
  - [x] Load: one `useAsyncResource` over
        `Promise.all([repositories.battles.load(id), repositories.organisms.list()])`, deps
        `[repositories, battleId]`. `repositories` is `useMemo`-stable from the page boundary.
  - [x] ⚠️ **`battleId === 'new'` must not call `battles.load('new')`.** Story 2.2 owns the seeding;
        this story renders the not-found/empty branch for it or short-circuits — decide, and say
        which in the Dev Agent Record. Do not let a `'new'` id reach the repository, where
        `assertSafeCollectionId` semantics and a `null` result would silently look like a
        missing battle.
  - [x] The organism list is loaded (AC1 says so) and held; nothing renders it yet. Do not delete
        the load "because nothing uses it" — Story 2.9 is the consumer, and AC1 is explicit.

- [x] **Task 5: The three terminal states** (AC: 4)
  - [x] `loading` — a distinct, announced state. `error` — a distinct state whose body offers
        navigation back to the Gallery (`<Link href="/">`), per AC4.
  - [x] ⚠️ **`ready` with `battle === null` is a THIRD state, and the intuitive code loses it.**
        `BattleRepository.load()` returns `null` for "no such battle" and *throws* `CorruptDataError`
        for a stored-but-invalid record. With `data: T | undefined`, an early
        `if (!data) return <Loading/>` collapses "battle does not exist" into "still loading" — an
        infinite spinner on any stale/deleted/hand-typed id, with nothing logged. Branch on
        `status` first, then on `battle === null`.
  - [x] Not-found copy must differ from error copy (one is "this battle is gone", the other is
        "something went wrong"), and both offer the same back-to-Gallery link.
  - [x] A missing/empty `?id=` on `/battle` is the not-found branch, not a crash.

- [x] **Task 6: `<BattleHeader>`** (AC: 3)
  - [x] `apps/web/components/battle/BattleHeader.tsx`. Props **exactly** per spec §3.2 — `mode`,
        `onModeToggle`, `onEnterFullscreen` are all **optional and absent in Epic 2**:
        ```ts
        interface BattleHeaderProps {
          battleTitle: string
          mode?: 'lab' | 'run'
          onModeToggle?(next: 'lab' | 'run'): void
          onEnterFullscreen?(): void
        }
        ```
  - [x] Render the title as **text, not an input** (`<BattleNameField>` is Story 2.11) and not as
        the document `<h1>` unless this route has no other `<h1>` — settle the single-`<h1>` rule
        for this route in Task 2 and state the choice in the Dev Agent Record.
  - [x] Mockup source: `petri-dish-lab-mode.html:647-656` (`.header` / `.logo`), CSS at `:33-53`.
        Static chrome goes through `styled()`, not `sx` (RFC-003 Decision 3). Colours are
        `var(--gol-*)` tokens only — the AR-46 no-raw-hex ESLint rule is active on `apps/web`.
  - [x] Title fallback: reuse the single shared helper from Task 8. Do not write a second ternary.

- [x] **Task 7: Wire the Gallery tile** (AC: 1)
  - [x] `BattleTile.tsx` becomes clickable. ⚠️ **Do not nest `<TileActions>`' delete `<button>`
        inside an anchor** — invalid HTML, and it makes Delete navigate. Use the stretched-link
        pattern: `<Link>` around the `<TileTitle>` text with an `::after { position: absolute;
        inset: 0 }` overlay on the `Tile`, and raise `TileActions` above it (`position: relative` +
        `z-index`). The delete button must remain independently clickable and independently
        focusable, and the tab order must stay sane.
  - [x] Restore `cursor: pointer` on `Tile` — its current comment says "not until Story 2.2"; that
        comment is **wrong** (`epics.md:535` puts tile-click in 2.1, `epics.md:549` puts the New
        Battle CTA in 2.2). Fix the comment while you are there.
  - [x] Closes the deferred item "a battle with zero placed organisms has no focusable element in
        its tile" (`deferred-work.md:93`) — that entry names Story 2.2, but the tile becomes a
        focus stop **here**. Update the entry.
  - [x] ❌ The "New Battle" / "Create Your First Battle" CTAs stay dead. Story 2.2.

- [x] **Task 8: One `battleDisplayName`, one casing** (AC: 3)
  - [x] Move `battleDisplayName()` + the `UNTITLED_BATTLE` constant out of
        `components/gallery/BattleTile.tsx` into `apps/web/lib/battleDisplayName.ts`; re-import in
        `BattleTile.tsx` and `BattleGallery.tsx`. Story 1.13 exported it from the tile precisely so
        the tile and the delete dialog could not drift; the battle header is now the third consumer
        and importing a gallery component from a battle component would be the wrong seam.
  - [x] Per **Spec conflicts surfaced #2**, change the string to **"Untitled Battle"** (capital B)
        and update `BattleTile.test.tsx:55, :239-241`.

- [x] **Task 9: Tests** (AC: 1–5)
  - [x] `BattlePage.test.tsx` — against `createFakeRepositories()` from `@gol/test-utils` (never a
        hand-rolled fake): renders the title; renders "Untitled Battle" for an empty name; renders
        loading, then ready; a rejecting `battles.load` renders the error body **with** a link to
        `/`; an unknown id renders the not-found body; a `<StrictMode>` mount does not double-load
        visibly. **A count assertion for AC2/NFR-4.1**: `screen.queryByRole('button', { name: /run/i })`
        is null AND the route renders no `<button>` beyond those this story ships — a
        presence-only test still passes after someone adds a dead RUN button, which is exactly
        what AC2 forbids.
  - [x] `BattleHeader.test.tsx` — title display; nothing rendered for the absent optional props.
  - [x] `axe` scan of the battle route with zero violations (the established pattern:
        `await axe(container)` then `expect(results.violations).toEqual([])` — the matcher is
        deliberately not wired, see `vitest.setup.ts`).
  - [x] `AppNav.test.tsx`'s exact-one-link count assertion must still pass unchanged.
  - [x] `apps/web/e2e/battleRoute.spec.ts` — click a seeded Gallery tile, land on the battle route,
        see the battle's name in the header, and **reload the page** and still see it. The reload
        is the assertion that Task 1's route shape actually works on a static host; a click-only
        test passes for route shapes that 404 on refresh.
  - [x] ⚠️ `usePathname()`/`useSearchParams()` throw outside an App Router context under RTL, and
        the thrown error names React internals rather than the router (Story 1.9 Dev Notes).
        Mock `next/navigation` with `vi.hoisted` exactly as `AppNav.test.tsx:8-11` does.

- [x] **Task 10: Bookkeeping and the full gate**
  - [x] `deferred-work.md:85` ("nav active-matching is exact-equality, so nested routes highlight
        nothing") names **this story or 4.1, whichever lands first**. Under Task 2 `AppNav` is not
        rendered on the battle route at all, so the "you are nowhere" symptom does not arise here
        and there is still no second nav destination to design a match strategy against.
        **Re-point the entry to Story 4.1** with that reasoning. Do not close it, and do not invent
        a prefix-match strategy with one `href`.
  - [x] Add any new deferred items to `deferred-work.md` under a Story 2.1 heading.
  - [x] Run the **full** gate: `npm run ci` (typecheck → lint → format:check → spec:check →
        coverage → build:standalone → bundle:check → e2e). ⚠️ Do not pipe it — `npm run ci | tail`
        reports *tail's* exit code and has already masked a real `format:check` failure in this
        repo. Redirect to a file and echo `$?`. Record the actual result in the Dev Agent Record.
  - [x] Note in the record that `scripts/check-bundle-size.mjs` measures **only** `out/index.html`
        (the home route). The new battle route is **not** covered by the AR-3 gate — a green
        `bundle:check` says nothing about it.

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **The route shape — RESOLVED, no longer a decision this story makes.** Sidiar ratified
   `/battle?id=<uuid>` + `/battle/new` on 2026-08-26. It is now **Architecture Decision K**
   (`architecture.md`), and AR-28 has been amended to match (`epics.md:196`), along with
   `component-tree-battle-page.md`, RFC-001 and RFC-005. Implement Decision K as written;
   do not re-litigate it and do not flag it as a deviation in the Dev Agent Record. Note
   **K.5**: every route must be statically prerenderable and entity ids ride as query
   params — that binds later stories too.
2. **Where the app shell stops.** Route groups (`(gallery)` / `(battle)`), moving `app/page.tsx`
   one directory down. The alternative — teaching `AppShell` to check `usePathname()` — puts route
   knowledge inside a presentational shell and grows a branch per route forever. The route-group
   cost is a one-time file move; the conditional-shell cost compounds.
3. **`battleId === 'new'` handling in this story.** Story 2.2 owns seeding. Decide whether `/battle/new`
   renders the not-found body or a distinct "nothing here yet" placeholder, and say which. Either is
   defensible; silently calling `battles.load('new')` is not.
4. **Whether the battle route's `<h1>` is the battle title.** Story 1.9 fixed "exactly one `<h1>`
   per document" and made the shell wordmark a `<div>` for that reason. The battle route has no
   other heading candidate, so the title is the natural `<h1>` — but it is also spec'd as the
   mockup's `.logo` slot. Pick one and record it; `AppShell.test.tsx`'s h1-count assertion is the
   guard for the gallery branch and there is no equivalent guard for this route until you write one.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

**#1 — RESOLVED 2026-08-26 as Architecture Decision K.** `/battle/[id]` is unbuildable under
`output: 'export'`; AR-28 and NFR-6 could not both be satisfied literally. Sidiar chose
`/battle?id=<uuid>` + `/battle/new`; the authority docs now say so. Evidence retained below for
the record — **this is no longer an open question.**

Evidence, all verified against this repo at `49773cd`:

- `next@16.2.12`, `node_modules/next/dist/build/index.js:1363-1368`:
  ```js
  const hasGenerateStaticParams = workerResult.prerenderedRoutes && workerResult.prerenderedRoutes.length > 0;
  if (config.output === 'export' && isDynamic && !hasGenerateStaticParams) {
    throw new Error(`Page "${page}" is missing "generateStaticParams()" so it cannot be used with "output: export" config.`)
  }
  ```
  A `generateStaticParams()` returning `[]` fails the same check.
- `apps/web/next.config.mjs` sets `output: 'export'` in standalone, and `npm run ci` runs
  `build:standalone`. This is a **hard CI failure**, not a runtime warning.
- Client-side navigation cannot rescue it either. In export mode the App Router fetches the RSC
  payload by appending `.txt` to the pathname
  (`next/dist/client/components/router-reducer/fetch-server-response.js:94-105`). `/battle/<uuid>.txt`
  does not exist → 404 → hard navigation → the static 404 page. The prerendered set is the whole
  reachable set.
- Battle ids are `z.uuid()` minted in the browser (`packages/domain/src/battleSchema.ts:14`). There
  is nothing to enumerate at build time, in this or any future story.

**Resolution (ratified — Decision K):** one static page at `/battle` that reads `?id=<uuid>`, plus one static
page at `/battle/new`. Both render `<BattlePage>`. `new` stays a real path segment because a
*static* segment prerenders fine, which keeps Story 2.2's AC (`epics.md:549`) true verbatim.

Everything AR-28 actually protects survives: `<BattlePage>` still owns `mode` as local state, Lab↔Run
is still not a route change, `<BattlePage>` still stays mounted across modes, and there are still
exactly two reachable page surfaces. What changes is the *spelling* of one URL.

Rejected alternatives, with why:

| Option | Why not |
|---|---|
| `generateStaticParams()` → `[{ id: 'new' }]` | Builds, but only `/battle/new` exists. Every saved battle 404s. AC1 unreachable. |
| Catch-all `[[...id]]` | Same failure — only the prerendered `/battle` emits; sub-paths 404. |
| Host SPA-fallback rewrite | Works on Vercel, impossible on GitHub Pages (`architecture.md:71` names both). No deploy job exists to verify it, so CI would go on passing while the deployed app 404s. |
| `/battle#<id>` | Works, but `usePathname`/`Link` semantics degrade and the hash is invisible to the router. Strictly worse than a query param for the same deviation. |

**#2 — "Untitled Battle" vs "Untitled battle".** Four authority sites say title case
(`component-tree-battle-page.md:130`, `epics.md:537`, `epics.md:552`, and again at `epics.md:669`);
the shipped `BattleTile.tsx:26` uses `'Untitled battle'` with no recorded rationale. **Specs win** —
Task 8 changes the constant and the two tests. Doing it now costs two assertions; doing it after
Stories 2.2/2.11 also ship the string costs more.

**#3 — `project-context.md` says "No PR flow exists".** It does now (`d0dd6c6` is a merge commit
from PR #1, and CLAUDE.md describes `story/*` branches). Not this story's job to fix, but do not
treat the context file's branching paragraph as current.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **`ready` + `null` reads as "loading".** `useAsyncResource<T>` exposes `data: T | undefined`;
  with `T = [Battle | null, Organism[]]`, the natural `if (!data) return <Loading/>` swallows the
  not-found case forever. Branch on `status` before you touch `data`. (Task 5.)
- ⚠️ **`useSearchParams()` without `<Suspense>` fails the export build**, not the dev server.
  `next dev` will look perfectly fine right up until `npm run ci`.
- ⚠️ **Nesting the delete `<button>` inside the tile's `<Link>`** produces invalid HTML that browsers
  reparse silently, and Delete starts navigating. The Story 1.13 `@media (hover: none)` fix means
  that button is permanently visible on touch. (Task 7.)
- ⚠️ **`Promise.all` rejects on the first rejection.** A corrupt *organism* record would blank the
  battle page with "something went wrong" even though the battle itself loaded fine. Acceptable for
  this story (AC4 asks only for a distinct failure state) — but say so in the record rather than
  discovering it in review.
- ⚠️ **Do not add `useWorkspaceSeed` to the battle route.** A deep link into a fresh workspace has
  no battle to show regardless; the not-found branch is the correct answer and the Gallery seeds on
  its own mount. Seeding from a second boundary also doubles the M9 "Conway's Classic is re-seeded"
  surface for no gain.
- ⚠️ **Route groups do not change URLs.** `app/(gallery)/page.tsx` still serves `/`. If a test or
  the e2e suite starts asking for `/(gallery)`, something was moved wrong.
- ⚠️ **`ctx.fillStyle = 'var(--gol-*)'` is a silent no-op** — not reachable in this story (no canvas
  here), but Story 2.4 mounts the first edit canvas and will need `themeColors.ts`' resolution step.
  Do not "get ahead" by resolving colours in this story.

### Previous story intelligence (Epic 1, archived in `epic-1/`)

There is no `2-0-*.md`; Epic 1's stories live in `docs/implementation-artifacts/epic-1/`, which the
BMad non-recursive glob does not see. The load-bearing carry-overs:

- **Story 1.9 (`epic-1/1-9-*.md`)** — built `AppShell`/`AppNav`/`AppProviders`, established that
  `RootLayout` stays a server component (Emotion has no RSC support, so `'use client'` starts one
  level down in `AppProviders`), that the wordmark is a `<div>` not an `<h1>`, and that
  `createTheme()` **requires `cssVariables: true`** or `<Button>`/`<IconButton>` throw at render.
  It also fixed a hover/focus-visible parity gap on `AppNav` — apply the same rule to any new
  interactive chrome here.
- **Story 1.10** — put `useAsyncResource`, a repository Context and any data cache explicitly out of
  scope. This story is where the hook finally lands; that is not a licence to retrofit the Gallery.
- **Story 1.11** — `PetriDishCanvas` and `themeColors.ts` already exist. Not used here.
- **Story 1.12** — the empty-state CTA is deliberately inert copy; Story 2.2 makes it live. Leave it.
- **Story 1.13** — first `@mui/material/Dialog`; moved the bundle gate 300→320 (then 330 at
  `49773cd` for `Tooltip`). Per-component MUI imports only (AR-35), no `@mui/icons-material`. It
  also exported `battleDisplayName` specifically to stop the tile and the dialog drifting — Task 8
  continues that intent rather than reversing it.
- **Repo-wide lesson worth repeating:** a locally green `npm run ci` is not proof CI is green; the
  `e2e` job runs on Linux against a cached Playwright install. Check `gh run list` after pushing.

### Git intelligence

`49773cd` is the baseline. The five commits before it are a pre-Epic-2 cleanup pass merged as PR #1
(`d0dd6c6`), and two of them constrain this story directly:

- `59aa60d` archived Epic 1's story files into `epic-1/`. **Epic 2's story files stay flat** beside
  `sprint-status.yaml` or the BMad globs find nothing.
- `34eae20` + `11c4310` added `npm run spec:check`, scoped to `docs/planning-artifacts` +
  `docs/project-context.md`. Story files are **exempt**, source files are **not**: every `(AR-28)`,
  `(RFC-005)`, `(FR-7.5)` you write in a `.ts`/`.tsx` comment must resolve against that authority
  set, spelled exactly as the specs spell it (`AR-2`, not `AR2`; `M9`, not `M-9`).
- `64d6f41` reserved the tile's top-right corner so long names clear the delete button
  (`TileHeader.paddingRight: 34px`). Task 7's stretched link must not undo that reservation.

### Latest technical information

- **Next 16.2.12** (`package.json` declares `^16.2.10`). Route groups, `<Suspense>` + `useSearchParams`,
  and the export-mode `.txt` RSC convention are all as described above and were read out of this
  repo's installed copy, not from memory.
- **MUI 9.3.1** — per-component imports; `createTheme({ cssVariables: true })` is already configured
  in `lib/theme.ts`. This story should need **no new MUI component**: a header, a heading, a
  paragraph and a `next/link` are `styled()` primitives. Adding one costs bundle budget on a gate
  that does not even measure this route.
- **React 19.2.7** — App Router enables StrictMode in dev; double-invoked effects are the default,
  not an edge case (Task 3).
- **No new dependencies.** Not a router library, not a data-fetching library, not an icon package.

### What NOT to build (scope boundaries)

- ❌ **The canvas.** `<PetriDishCanvas variant="edit">`, auto-fit, `GridRenderer` wiring — Story 2.4.
- ❌ **The editor sidebar**: `<OrganismRoster>`, `<BattleNameField>`, `<GridSettingsSection>`,
  `<EditorToolsSection>`, `<SidebarFooter>`/Back — Stories 2.9/2.11/2.14/2.15/2.16.
- ❌ **`<EditorStatusBar>`, Undo, Save, dirty tracking, `useUndoableGrid`, `useDirtyGuard`,
  `beforeunload`** — Stories 2.8/2.11/2.12/2.13/2.16.
- ❌ **Any Run/Play affordance**: mode toggle, fullscreen button, `useSimulation`, hotkeys — Epic 3.
  AC2 makes their absence a *tested* property, not an omission.
- ❌ **Seeding a new battle's grid.** Story 2.2 owns `/battle/new`'s empty grid at the default
  editable preset. This story only routes to it.
- ❌ **The "New Battle" and "Create Your First Battle" CTAs.** Story 2.2.
- ❌ **`/settings`** — Epic 5. AC5 is a count: two reachable page surfaces, no more.
- ❌ **A global store, a repositories Context, react-query, a module-level repository singleton.**
  AR-27. `createRepositories()` is called once, at the page boundary, in `useMemo(..., [])`.
- ❌ **Importing a concrete repository** (`LocalStorageBattleRepository`) anywhere. It compiles, it
  passes tests, and it welds the app to localStorage forever (AR-2/27).
- ❌ **Refactoring `BattleGallery` onto `useAsyncResource`.**
- ❌ **A prefix/exact match strategy in `AppNav`.** Task 10 re-points that deferred item to 4.1.
- ❌ **New npm dependencies of any kind.**
- ❌ **Editing any file under `docs/planning-artifacts/`.** Conflicts get surfaced in the Dev Agent
  Record and `deferred-work.md`, never patched into a spec from a story.

### Project Structure Notes

Target layout after this story (new/moved marked):

```
apps/web/
  app/
    layout.tsx                      UPDATE — html/body/AppProviders/themes.css only; AppShell removed
    themes.css                      unchanged
    (gallery)/
      layout.tsx                    NEW  — <AppShell>{children}</AppShell>
      page.tsx                      MOVED from app/page.tsx (content unchanged)
      page.test.tsx                 MOVED from app/page.test.tsx
    (battle)/
      layout.tsx                    NEW  — battle chassis; no wordmark, no AppNav
      battle/
        page.tsx                    NEW  — page boundary: createRepositories() + ?id= + <Suspense>
        new/
          page.tsx                  NEW  — page boundary: createRepositories() + battleId="new"
  components/
    battle/                         NEW directory
      BattlePage.tsx                NEW
      BattlePage.test.tsx           NEW
      BattleHeader.tsx              NEW
      BattleHeader.test.tsx         NEW
    gallery/
      BattleTile.tsx                UPDATE — stretched link, cursor, imports battleDisplayName
      BattleTile.test.tsx           UPDATE — "Untitled Battle" casing, link assertions
      BattleGallery.tsx             UPDATE — import site of battleDisplayName only
    layout/AppShell.tsx             unchanged
  lib/
    useAsyncResource.ts             NEW
    useAsyncResource.test.tsx       NEW
    battleDisplayName.ts            NEW (extracted from BattleTile.tsx)
  e2e/
    battleRoute.spec.ts             NEW
docs/implementation-artifacts/
  deferred-work.md                  UPDATE — re-point :85, update :93, add any new items
```

Naming rules that bite here: non-component TS files are **camelCase, never dotted**
(`useAsyncResource.ts`, not `use-async-resource.ts` and not `async.resource.ts`); components are
PascalCase `.tsx`; cross-package imports use `@gol/*`, and `@/*` resolves inside `apps/web` only.
`apps/web` holds UI and wiring only — no simulation, persistence, or rules logic.

`apps/web` has **no coverage gate** (deliberate counter-metric). Write the tests the ACs need and
stop; a test whose only purpose is to raise the number is rejected in review.

### Deferred-work items this story touches

- `deferred-work.md:85` — nav active-matching. **Re-point to Story 4.1** (Task 10), do not close.
- `deferred-work.md:93` — "a battle with zero placed organisms has no focusable element in its tile".
  The entry says it "resolves itself in Story 2.2"; the tile becomes a focus stop in **2.1**
  (Task 7). Update the entry's owner.

### References

- [Source: docs/planning-artifacts/epics.md#Epic 2 / Story 2.1] — the five ACs, verbatim, at :527-539
- [Source: docs/planning-artifacts/epics.md#Runtime state] — AR-27 (:196-197), AR-28 (:198)
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.1] — `<BattlePage>` props, state
  categories, internal wiring
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.2] — `<BattleHeader>` props;
  "Untitled battles display 'Untitled Battle'"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#2] — "Epic 2 ships the skeleton with
  only `'lab'` populated and no Run or fullscreen affordance rendered (no dead buttons — NFR-4.1)"
- [Source: docs/planning-artifacts/component-tree-battle-page.md#4] — `useAsyncResource` / `useDirtyGuard`
  defer to RFC-005 Decisions 1 and 7
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 1] — the hook
  snippet and "no global store, no repositories context" (:88-135)
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md#Decision 3] — modes are
  local state; the App Router routing reconciliation note (:197)
- [Source: docs/planning-artifacts/architecture.md] — static export + $0 hosting (:25-28, :59, :71)
- [Source: docs/project-context.md] — repositories injected never imported; camelCase file naming;
  one immutable theme; `npm run ci` is the gate and must not be piped
- [Source: docs/planning-artifacts/ux-designs/.../clinical-lab-theme/petri-dish-lab-mode.html] —
  `.header`/`.logo` CSS at :33-53, markup at :647-656
- [Source: apps/web/app/page.tsx] — the page-boundary pattern to mirror (`useMemo(createRepositories, [])`)
- [Source: apps/web/lib/useWorkspaceSeed.ts] — why its `mounted` ref exists and why this story's hook
  must not copy it
- [Source: packages/persistence/src/repositories.ts] — `BattleRepository.load()` returns `null` for
  absent, throws `CorruptDataError` for corrupt
- [Source: packages/test-utils/src/index.ts] — `createFakeRepositories`, `MOCK_BATTLE_IDS`
- [Source: apps/web/components/layout/AppNav.test.tsx:8-11] — the `next/navigation` mocking pattern
- [Source: node_modules/next/dist/build/index.js:1363-1368] — the export/dynamic-route build error
- [Source: node_modules/next/dist/client/components/router-reducer/fetch-server-response.js:94-105] —
  export-mode `.txt` RSC fetch

## Dev Agent Record

### Agent Model Used

claude-opus-5 (dev-story), 2026-08-26.

### Debug Log References

Full gate, run unpiped and redirected (`npm run ci > /tmp/gol-ci.log 2>&1; echo $?`):

| Step | Result |
| --- | --- |
| `typecheck` | pass (5 tasks) |
| `lint` | pass — 0 errors, 1 pre-existing warning (`BattleGallery.tsx:239`, `react-hooks/exhaustive-deps`, untouched by this story) |
| `format:check` | pass |
| `spec:check` | pass — 123 source files, 125 distinct ids cited, all resolving |
| `test:coverage` | pass — web 367 tests / 31 files; domain 85; persistence 82; test-utils 75 |
| `build:standalone` | pass — routes `/`, `/_not-found`, `/battle`, `/battle/new`, all `○ (Static)` |
| `bundle:check` | pass — 319.7 KB gzipped against a 330 KB budget, 10.3 KB headroom |
| `e2e` | pass — 112 passed, 4 skipped, across chromium/firefox/webkit/tablet |

**Final `npm run ci` exit code: 0.**

Two failures were hit and fixed on the way, both recorded because they change the shipped code:

1. `lint` failed with `react-hooks/set-state-in-effect` on `useAsyncResource.ts` — the
   deps-change reset (`setStatus('loading')` at the top of the effect body) is a real cascading
   render, not a lint false positive. Reworked into React's render-phase "adjusting state when a
   prop changes" pattern (a `settledDeps` snapshot compared element-wise), which is lint-clean
   *and* correct, rather than suppressed with a disable comment. A test for the property it
   protects was added at the same time ("returns to loading and drops stale data the moment deps
   change").
2. `BattleTile.test.tsx`'s "is keyboard-focusable through the dots (AC5)" failed, as designed:
   the tile's first tab stop moved from the leading organism dot to the new title link. Retargeted
   to assert the new order rather than deleted — see the `deferred-work.md:93` note below.

### Completion Notes List

**Forced decision 1 — the route shape.** Not a decision this story made: Architecture **Decision K**
was ratified before implementation and is implemented as written — a static `/battle` reading
`?id=<uuid>` plus a static `/battle/new`. **Decision K.5** (every route statically prerenderable;
entity ids ride as query params) is cited in `app/(battle)/battle/page.tsx` as the standing rule for
later routes. Not flagged as a deviation, because it is not one.

**Forced decision 2 — where the app shell stops.** Route groups, as specified. `app/layout.tsx` keeps
only `<html>`/`<body>`/`AppProviders`/`themes.css`; `app/(gallery)/layout.tsx` wears `AppShell`
(which is otherwise **unchanged** — no `usePathname()`, no route awareness); `app/(battle)/layout.tsx`
is the battle chassis and owns that branch's `<main>`. `AppShell.test.tsx`, `AppNav.test.tsx` and
`e2e/appShell.spec.ts` all pass **untouched**, which is the proof the move preserved `/`'s output.

**Forced decision 3 — `battleId === 'new'`.** `<BattlePage>` **short-circuits**: `'new'` never
reaches `battles.load()`, and the route renders its **own distinct placeholder** ("New Battle"),
not the not-found body. Rationale: `/battle/new` is a page that does not exist *yet* by design,
and telling the user "this battle is gone" on the create route is simply the wrong fact. Pinned by
`BattlePage.test.tsx`'s `loadSpy` assertion, so a later refactor cannot quietly let `'new'` through.
Story 2.2 owns the seeding.

**Forced decision 4 — the battle route's `<h1>`.** The **battle title is the `<h1>`**, rendered by
`<BattleHeader>` into the mockup's `.logo` slot. The battle route drops `AppShell` entirely, so the
title is the only heading candidate and it genuinely is what the document is about; the gallery
branch's rule is unchanged (the shell wordmark stays a `<div>` so "Battle Gallery" remains that
document's sole `<h1>`). Nothing automated enforces single-`<h1>` — axe has no duplicate-h1 rule —
so `BattlePage.test.tsx` now carries this route's count assertion, the equivalent of
`AppShell.test.tsx`'s for the gallery branch. Each of the three terminal states renders its own
single `<h1>` too, so the property holds on every branch, not just the happy path.

**AC2 / NFR-4.1 is tested as a count, not a presence check.** `BattlePage.test.tsx` asserts
`queryAllByRole('button')` is empty on the loaded route and `BattleHeader.test.tsx` asserts the same
*while supplying* the Epic 3 props (`mode`, `onModeToggle`, `onEnterFullscreen`) — a presence-only
test still passes after someone adds a dead RUN button, which is exactly what AC2 forbids.

**`Promise.all` rejects on the first rejection.** A corrupt *organism* record therefore blanks the
battle page with the failure body even when the battle itself loaded fine. Accepted for this story
(AC4 asks only for a distinct failure state, and nothing renders the roster yet) and recorded in
`deferred-work.md` under a Story 2.1 heading, owned by Story 2.9.

**`useAsyncResource` scope.** RFC-005 Decision 1's `{ data, status }` only. `reload` is deliberately
**not** shipped — the RFC's snippet sets no status and honours no liveness flag. Liveness is the
RFC's **closure** flag, not `useWorkspaceSeed`'s `mounted` ref (that ref exists solely because a
`hasRun` guard makes StrictMode's second setup skip; this hook has no such guard, so every setup
owns a live closure). `BattleGallery`/`BattleTile` were **not** retrofitted onto the hook.

**Task 1's verification, stated precisely.** `npm run build:standalone` succeeds and both routes
prerender as static pages — but Next 16 emits them as **`out/battle.html`** and
**`out/battle/new.html`**, not the `out/battle/index.html` / `out/battle/new/index.html` the task
names. That is Next's export layout with `trailingSlash` unset (the repo default), the same layout
that already gives `/_not-found` → `out/_not-found.html`; the literal filenames in the task were an
assumption about export naming, not an authority-doc statement, so this is a task-wording nit rather
than a spec conflict. What the task actually guards against — a build that emits neither route — is
disproven twice over: the build's own route table lists both as `○ (Static)`, and
`e2e/battleRoute.spec.ts` **reloads** `/battle?id=…` against the served static export in all four
Playwright projects. Recorded in `deferred-work.md` because the extension-less → `.html` mapping is
a *host* behaviour, and no deploy job exists to verify it against a real host yet.

**Bundle gate coverage.** `scripts/check-bundle-size.mjs` measures **only** `out/index.html` — the
home route. `/battle` and `/battle/new` are **not** covered by the AR-3 gate, so this story's green
`bundle:check` (319.7 KB / 330 KB) says nothing whatsoever about them. Recorded in
`deferred-work.md`, owned by Story 2.4.

**Bookkeeping.** `deferred-work.md:85` (nav active-matching) **re-pointed to Story 4.1**, not closed:
under the route-group split `AppNav` is not rendered on the battle route at all, so the "you are
nowhere" symptom does not arise here and there is still only one `href` to design a match strategy
against. `deferred-work.md:93` (zero-organism tiles have no focus stop) **closed by this story**,
one earlier than the entry predicted — the tile's title link is now its first tab stop regardless of
roster, pinned by a test.

**No new dependencies, no new MUI component** — the header, headings, paragraphs and links are
`styled()` primitives over `next/link`.

### File List

New:

- `apps/web/app/(battle)/layout.tsx`
- `apps/web/app/(battle)/battle/page.tsx`
- `apps/web/app/(battle)/battle/new/page.tsx`
- `apps/web/app/(gallery)/layout.tsx`
- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/battle/BattleHeader.tsx`
- `apps/web/components/battle/BattleHeader.test.tsx`
- `apps/web/lib/useAsyncResource.ts`
- `apps/web/lib/useAsyncResource.test.tsx`
- `apps/web/lib/battleDisplayName.ts`
- `apps/web/e2e/battleRoute.spec.ts`

Moved (content unchanged):

- `apps/web/app/page.tsx` → `apps/web/app/(gallery)/page.tsx`
- `apps/web/app/page.test.tsx` → `apps/web/app/(gallery)/page.test.tsx`

Modified:

- `apps/web/app/layout.tsx` — `AppShell` removed; root layout keeps html/body/AppProviders/themes.css
- `apps/web/components/gallery/BattleTile.tsx` — stretched title link, `cursor: pointer` restored,
  `TileActions`/`DotRow` raised above the overlay, `battleDisplayName` re-imported from `lib/`
- `apps/web/components/gallery/BattleTile.test.tsx` — "Untitled Battle" casing; link/tab-order/
  delete-not-nested assertions
- `apps/web/components/gallery/BattleGallery.tsx` — `battleDisplayName` import site only
- `docs/implementation-artifacts/deferred-work.md` — `:85` re-pointed, `:93` closed, three new items
- `docs/implementation-artifacts/sprint-status.yaml` — `2-1-…: ready-for-dev → in-progress → review`

Unchanged, and verified so: `apps/web/components/layout/AppShell.tsx`, `AppShell.test.tsx`,
`AppNav.tsx`, `AppNav.test.tsx`, `e2e/appShell.spec.ts`.

## Change Log

| Date       | Change                                    |
| ---------- | ----------------------------------------- |
| 2026-08-26 | Story created (create-story), ready-for-dev |
| 2026-08-26 | Implemented (dev-story): Decision K battle route, `(gallery)`/`(battle)` route-group split, `useAsyncResource`, `<BattlePage>`/`<BattleHeader>`, clickable Gallery tiles. Full `npm run ci` green (exit 0). Status → review |

Dev Model: opus   # establishes the app's URL scheme under static export (Decision K), the route-group shell split, and the shared useAsyncResource hook — every later Epic 2-5 page inherits all three
