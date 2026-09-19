---
baseline_commit: 92a3d4dbf60b8bd7fee295aba1b1a6fcd703490f
---

# Story 3.17: Run Battle from Gallery

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to run a battle straight from the Gallery,
so that I can watch without passing through the editor.

## Acceptance Criteria

From `epics.md#Story 3.17` (`:949-959`), decomposed into what a reviewer can check independently.
Almost everything this story needs already exists and is pinned: the battle route reads its id
from `?id=` under a `<Suspense>` boundary (`app/(battle)/battle/page.tsx:19-38`, Decision K.5);
`<BattlePage>` owns `mode` as local state and mounts the lazily-loaded `<BattleSimulationView>`
in place of the editor when it is `'run'` (`BattlePage.tsx:156`, `:881-895`), which starts paused
at cycle 0 by construction (3.11, pinned at `BattlePage.test.tsx:2718-2719`); the Run footer's
Back already runs the FR-7.9 guard and `router.push('/')` (`BattlePage.tsx:755-762`, `:890-893`,
pinned at `BattlePage.modeToggle.test.tsx:178-187` and `battleRoute.spec.ts:2090-2111`); and the
tile already has a stretched title link to `/battle?id=` plus a hover/focus-revealed action band
holding Delete (`BattleTile.tsx:189-207`, `:471-493`). What does **not** exist is (1) any way to
ENTER the route in Run mode — `mode` is hard-coded `useState<BattleMode>('lab')` and
`BattlePageProps` has two members; (2) a Run affordance on the tile; (3) a decision on what a
Run entry does when the roster cannot run (the 3-11 review's "header over nothing" entry,
`deferred-work.md:912-920`, which this story makes reachable ON MOUNT); and (4) the tests. This
story adds **no hook change, no engine change, no canvas change, no `<BattleHeader>` change, no
`<BattleSimulationView>` change, no `<SidebarFooter>` / `useLeaveGuard` change, no repository
touch, and no new route**.

1. **Every Gallery tile carries a Run affordance: a LINK to the battle route with a Run entry
   hint (FR-7.6; epics AC "the Run affordance appears on tiles only now that Run exists").**
   `<BattleTile>` renders a `RunLink` — a `styled(Link)` over `next/link`, the Story 2.2 FD1 /
   2.16 FD1 rule for PURE navigation (`CreateBattleLink.tsx:15-26`: middle-clickable,
   right-clickable, prefetched; ❌ never a `<button>` + `router.push`, and ❌ never `useRouter`
   in a Gallery file) — inside `TileActions` (`BattleTile.tsx:471`), BEFORE `DeleteButton`.
   `href` is `battleHref(battleId, { mode: 'run' })` = `` `/battle?id=${encodeURIComponent(id)}&mode=run` ``
   (AC3). Accessible name `` `Run ${displayName}` `` via `aria-label`, the same string as `title`
   (the Delete pattern, `:485-486`); glyph `▶` (U+25B6 — the transport bar's own Play glyph,
   `SimulationControlBar.tsx:190`) in an `aria-hidden` span (FD4). Observable: two links per tile
   (`getAllByRole('link')` is 2 — the title and Run), one button (Delete); the Run link is NOT
   inside the title anchor (`expect(titleLink).not.toContainElement(runLink)`); `href` exact.
   Nothing about the Run link's presence is conditional on the tile's roster (FD3 — the page,
   not the Gallery, decides whether a battle can run).

2. **The affordance wears the action band's existing chrome, and the band becomes a row.** The
   Run link and Delete share ONE style object — the 28×28 `--gol-bg-hover` / `--gol-border-control`
   / `--gol-text-secondary` block at `BattleTile.tsx:115-140`, with its `&:hover, &:focus-visible`
   accent pair, `:focus-visible` ring and reduced-motion guard — lifted into a `const actionChrome`
   that `DeleteButton = styled('button')(actionChrome)` and `RunLink = styled(Link)(actionChrome,
   { textDecoration: 'none' })` both consume (Trap 12: every ⚠️ comment on that block moves with
   it). `TileActions` gains `display: 'flex'` + `gap: '6px'` (the biotech mockup's own band,
   `biotech-terminal-theme/battle-gallery.html:382-388`); everything else on it — `position`,
   `top/right: 18px`, `zIndex: 1`, `opacity` reveal, `@media (hover: none)`, reduced-motion — is
   unchanged, so the Run link inherits the hover / `:focus-within` reveal, the touch
   always-visible rule and the above-the-overlay hit-testing for free. `TileHeader.paddingRight`
   grows from `34px` to **`68px`**: the band now spans 18 + 28 + 6 + 28 = 80px from the tile's
   right edge, minus the tile's 20px padding, plus the same 8px of breathing room the `:151-159`
   comment derives — rewrite that arithmetic in place. Tab order inside a tile is **title link →
   organism dots → Run → Delete** (FD5): Delete stays the LAST stop (the 1.13 rationale at
   `:465-470` stands; rewrite it to name the new stop). Tests: `BattleTile.test.tsx:135-147`'s
   "5 Tabs → Delete" becomes **6**, with a new assertion that the 5th lands on Run; `:310-315`'s
   `[data-tile-actions] button span[aria-hidden]` still resolves to `×` (Run is an `<a>`, not a
   `button`) — keep it and add the mirror for the Run glyph; axe-clean with both controls
   (`:239-258`'s three scans stay green — FD4 explains why the glyph does not change the verdict).

3. **The route's query contract lives in ONE module, `apps/web/lib/battle/battleRoute.ts`, with
   tests (FD2; Decision K.5).** Exports: `BATTLE_MODE_PARAM = 'mode'`, `RUN_MODE_VALUE = 'run'`,
   `battleHref(id: string, options?: { mode?: 'run' }): string` (no `options` → exactly the string
   `TitleLink` builds today, `` `/battle?id=${encodeURIComponent(id)}` `` — `BattleTile.test.tsx:122-129`
   pins it and must not change), and `initialModeFromParam(value: string | null): BattleMode`
   (`'run'` for the exact string `'run'`, `'lab'` for `null`, `''`, `'lab'`, `'RUN'`, `'play'`
   and anything else — a Zod parse at a boundary would be ceremony for a two-valued literal; the
   function IS the boundary). `BattleMode` is imported as a TYPE from
   `@/components/battle/BattleHeader` (the `useLeaveGuard.ts:4` precedent for a `lib/` module
   naming a component's type). ❌ No value import from any component, no `next/*` import, no
   other `lib/battle` import — this module rides in BOTH `/`'s and `/battle`'s first-load payload
   (Trap 11). `BattleTile.tsx` builds BOTH hrefs through it; `page.tsx` parses through it. Unit
   tests: the two href shapes, an id that needs encoding (`'a b'` → `a%20b`), the parse table.

4. **The battle route reads the entry hint beside the id and hands it down (Decision K.5).**
   `app/(battle)/battle/page.tsx`'s `BattleQueryRoute` (`:19-28`) reads the params ONCE into a
   local (`const params = useSearchParams()`) and passes
   `initialMode={initialModeFromParam(params.get(BATTLE_MODE_PARAM))}` beside `battleId`. Same
   reader, same `<Suspense>` boundary (`:34-36`), same CSR-bailout phase as `id` — no second
   boundary, no `window.location` (the file's own `:15-18` warning; Trap 6). `/battle/new/page.tsx`
   passes nothing (it defaults to `'lab'`; a Run entry on an empty new battle is nothing to watch —
   ❌ do not add the prop there). Comment the read in the `:24` register: what the value means,
   and that an unrecognised value is Lab, silently — a hand-typed `?mode=play` is not an error
   state the page should announce.

5. **`<BattlePage>` accepts `initialMode?: BattleMode` (default `'lab'`) and seeds `mode` from it
   — read ONCE, an ENTRY hint, never a synchronised route (FD1; RFC-005 Decision 3, AR-28,
   Decision K.1).** `useState<BattleMode>(initialMode)` at `BattlePage.tsx:156`. A later prop
   change is deliberately ignored (`useState`'s initialiser runs once — say so in the comment, and
   why: a flip is state, so the URL is never rewritten on a toggle, and the param still reading
   `run` after Run → Lab is the documented consequence, not a bug: a reload re-enters Run, exactly
   what the link promised). Rewrite the `:150-156` comment (Story 2.1 / 3.11 history + this
   story's seed) and the `dynamic()` comment at `:71-72` — "`mode` starts `'lab'`" is no longer
   the reason the Run view is never in the first paint; the reason is that `useSearchParams`
   bails the whole subtree out to client rendering, so the prerendered `battle.html` is the
   Suspense fallback and nothing below it (Trap 7). `<BattlePage>` tests
   (`BattlePage.test.tsx`, a new `describe('Run from Gallery (Story 3.17)')` reusing the 3.11
   block's `modeValue` / `dirtyValue` / `runButton` / `labButton` / `backButton` / `findRunView`
   helpers — hoist them to module scope or duplicate the six lines; do not import across
   describes): `render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id}
   initialMode="run" />)` → after `findRunView`: `data-status` `paused`, `data-cycle` `0`,
   `modeValue` `'run'`, `dirtyValue` `'false'`, RUN `aria-pressed="true"` and LAB `"false"`, the
   four Run h2s in order, no `Undo` button, no textbox, exactly one `Back to Battles`, the `<h1>`
   reads `Three-Way Skirmish`. The `RunLoading` fallback (`Loading simulation…`, `role="status"`)
   is what shows between the resources settling and the chunk resolving — assert it is gone once
   the view is found, nothing more (the chunk is mocked-synchronous under `vi.mock` in
   `modeToggle.test.tsx` and real under `BattlePage.test.tsx`; both shapes already exist).

6. **A Run entry whose roster cannot run lands in Lab with RUN disabled and its reason — never a
   header over nothing (FD3; NFR-4.1; closes `deferred-work.md:912-920`).** After the
   `runOrganisms` memo (`BattlePage.tsx:551-557`) and before the early returns, an in-render
   adjust in the exact shape `nameState` uses at `:261-267`:
   ```ts
   if (mode === 'run' && runOrganisms === null) setMode('lab');
   ```
   with a comment naming both readers it serves — this story's mount-time entry, and the 3-11
   review's future case (a library that changes under a mounted page, Stories 4.24/4.25). It cannot
   fire early: while the organism resource is in flight `rosterIds` is `NO_ROSTER` and
   `runOrganisms` is `[]`, not `null` (`:407`, `:416-417`, `:551-555` — Trap 8). It cannot loop:
   React re-runs the body once with `'lab'` and the condition is false. ❌ Not an effect
   (`react-hooks/set-state-in-effect` is live, and an effect renders one frame of the empty Run
   branch first — the exact flash this AC forbids); ❌ not a derived `effectiveMode` (state and
   `data-mode` would disagree — FD3 (b)). Tests: (a) `createFakeRepositories({ battles,
   organisms: [] })` + `initialMode="run"` (the `:2799-2814` fixture — a dangling roster with a
   loaded library) → `modeValue` `'lab'`, the four Lab h2s, RUN `toBeDisabled()` with `title`
   `Some organisms in this battle could not be loaded`, LAB pressed, no `[data-status]` ever
   mounted; (b) `withFailingOrganismList()` + `initialMode="run"` → the same, plus AC7's degraded
   roster notice is in the sidebar (whatever `:464-480` asserts for it today); (c) the happy path
   of AC5 proves the adjust does NOT fire on a resolvable roster. Under `<StrictMode>` the
   double-invoked body is a no-op on the second pass — the `nameState` precedent already runs
   under it in `page.test.tsx`; no new StrictMode test is owed.

7. **Back from a Gallery-launched run returns to the Gallery; Lab from a Gallery-launched run
   shows the persisted battle, clean (FR-7.10 unchanged, FR-4.8, AR-31, RFC-005 Decision 4).**
   Nothing new is wired — the Run footer's `onBack` is `handleBack` (`BattlePage.tsx:892`) and
   `leaveToGallery` is `router.push('/')` (`:755-757`). Tests pin that the EXISTING wiring holds
   from a run-first session: (a) `initialMode="run"` → `findRunView` → click `Back to Battles` →
   `router.push` called once with `'/'`, no `Unsaved Changes` dialog (a Gallery-launched run is
   clean by construction: the live grid never touches `initialGrid`, Decision 4); (b)
   `initialMode="run"` → click LAB → the editor mounts (four Lab h2s, `Grid Size: 50 by 30` in
   Grid Info — the SKIRMISH fixture, `mockWorkspace.ts:291-295`), `Undo` disabled, `dirtyValue`
   `'false'`, `data-status` gone; then RUN again → a fresh paused session at cycle 0 (the 3.11
   round-trip, entered from the other side); (c) in `BattlePage.modeToggle.test.tsx`, a run-first
   render receives the SAME props the toggle path receives — `initialGrid` is the seeded grid,
   `organisms` in roster order, `startingSpeed` 5, `showGridLines` false, `backDisabled` false —
   through a new `renderSkirmishInRun()` helper that waits for `runRenders`, not `editorRenders`
   (Trap 10).

8. **The Gallery and the route prove FR-7.6 end to end (e2e).** New
   `test.describe('Run from Gallery (Story 3.17)')` in `battleRoute.spec.ts` using the module-scope
   helpers (`runButton`, `labButton`, `dish`, `sidebarHeadings`, `collectErrors`, `seedWorkspace`,
   `distinctColorCount`) and a new module-scope `runLink = (page, name) =>
   page.getByRole('link', { name: `Run ${name}`, exact: true })`: (a) `seedWorkspace` → `/` → two
   articles → click `runLink(page, 'Three-Way Skirmish')` → `toHaveURL(`/battle?id=${battleA}&mode=run`)`
   → `[data-mode]` `run`, RUN `aria-pressed="true"`, `[data-status]` `paused` / `data-cycle` `0`,
   `dish` visible with `distinctColorCount > 2` (FR-3.10's "painted", the 3.11 assertion), the
   four Run headings, zero textboxes, one `Back to Battles`; click it → `toHaveURL('/')`, h1
   `Battle Gallery`, two articles (the `createBattle.spec.ts:74-77` shape); clean console.
   (b) `runLink(page, 'Grand Colony War')` (battleB carries the dangling Conway id in an
   e2e-seeded workspace — `battleRoute.spec.ts:1979-1981`, `:2115-2133`) → URL has `&mode=run`,
   `[data-mode]` `lab`, RUN disabled with the `:2125-2128` title, the four Lab headings, no
   `[data-status]`; clean console. (c) `page.goto(`/battle?id=${battleA}&mode=run`)` directly →
   Run (a bookmark works), then `page.reload()` → still Run (AC5's "a reload re-enters Run" made
   observable); `page.goto(`/battle?id=${battleA}&mode=play`)` → Lab (an unknown value degrades).
   (d) keyboard on the Gallery: focus the title link of the first tile, Tab through the three dots
   → Run link focused → Tab → Delete focused (`browserName === 'webkit' ? 'Alt+Tab' : 'Tab'`, the
   3.13/3.16 idiom; Trap 15). (e) `gallery.spec.ts:251` axe test: hover a tile first so the band is
   at `opacity: 1` when scanned — axe evaluates it either way, but the scan should measure the
   state a mouse user sees. (f) `gallery.spec.ts:135-161`'s long-name test: the title must now end
   before the BAND begins, not before the button — measure `tile.locator('[data-tile-actions]')`'s
   box (Trap 3), and rewrite its "delete button" wording. Run the Gallery specs and the new block on
   `chromium` AND `webkit` locally (`--workers=1`, a PRIVATE port — the 3-15 `reuseExistingServer`
   hazard is still live with lane 4 open).

9. **Every existing e2e locator that names a tile's title link is made EXACT (Trap 4).**
   Playwright's `getByRole(…, { name })` is a case-insensitive SUBSTRING match by default, so from
   this story `getByRole('link', { name: 'Three-Way Skirmish' })` resolves to TWO elements — the
   title and `Run Three-Way Skirmish` — and fails strict mode at `battleRoute.spec.ts:188`, `:1175`
   (`'Reopened Battle'`), `:1318`, `:1543`, `:1847`. Hoist `tileLink = (page, name) =>
   page.getByRole('link', { name, exact: true })` beside `runLink` and convert all five; grep
   `apps/web/e2e` for every `getByRole('link', { name:` whose name is a battle name and confirm no
   sixth. (`deleteBattle.spec.ts` names buttons `Delete …` and `createBattle.spec.ts` names the
   CTA — both unaffected; `getByRole('article').filter({ hasText })` at `:274` is unaffected.)
   Under RTL the string form is EXACT by default, so `BattleTile.test.tsx:107,118,125,139` stay
   correct as written — but a regex `/Three-Way Skirmish/` there would now match both; do not
   introduce one.

10. **Nothing per cycle reaches React; the budget and the bundle hold (NFR-1.1, AR-35, AR-43).**
    This story adds no hook, effect, ref or per-render allocation on the Run path: `initialMode`
    is read by a `useState` initialiser; the in-render adjust is a comparison. `bench:check` is
    unaffected (no engine change). `bundle:check` passes with `check-bundle-size.mjs` UNCHANGED:
    report `/`'s first-load gzip (333.4 KB / 340 after 3.16, 6.6 KB headroom — the Run link,
    `battleRoute.ts` and the flex rule land here) and `/battle`'s (308.7 KB / 310, **1.3 KB
    headroom** — `battleRoute.ts`, one prop, one comparison land here). Say by how much each moved.
    If `/battle` reddens, the documented next mechanism is splitting `PetriDishCanvas`'s variants
    (`deferred-work.md:862-866`) — never a threshold move (Sidiar's ratchet rule). The Run chunk
    (~6.3 KB gzip after 3.16) is untouched — confirm by grepping the built chunks for
    `"Grid dimensions"` as 3.16 did.

11. **Comments are made true; bookkeeping is done; gates hold (AC12 of every Epic 3 story).**
    `npm run ci`'s stages pass except the two PRE-EXISTING local-WebKit/tablet failures of Story
    3.12's "Tab reaches Play…" e2e (report them by name; do not fix; do not claim exit 0 if it is
    1 for that reason alone — the 3.16 review corrected exactly that claim). `spec:check` resolves
    every ID here and in code. Comments rewritten: `BattlePage.tsx:150-156` (the seed),
    `:71-72` (why the Run view is never prerendered), `:817-818` (`data-mode` "reflects BOTH
    values" → now also the mount value), `:873-880` (the Run branch's narrowing guard — say the
    adjust above is why `runOrganisms !== null` is now a TypeScript narrowing only, never a
    reachable render of nothing); `BattleTile.tsx:465-470` (tab order names Run), `:151-159` (the
    band arithmetic), `:78-83` (`TileActions` is a row), `:424-427` (the href now comes from
    `battleRoute.ts`); `CreateBattleLink.tsx:58-60` names a `BattleTile` block `ActionButton` that
    does not exist — correct it to the real names in passing (Trap 13); `simulation/README.md` is
    NOT touched (nothing lands in `simulation/`). `deferred-work.md`: (1) `:912-920` (3-11 review,
    "header over nothing") — **closed** by AC6, with the note that 3.17, not 4.24/4.25, made it
    reachable first and that the adjust covers their case too; (2) `:163` (2-1 review, the
    `TileActions` phantom hit target on hover-capable touch devices) — **widened** to 62×28 with
    Run in the band, and its consequence softened for the left half (a phantom Run tap navigates
    to a paused run — recoverable — where a phantom Delete tap opens a destructive dialog); leave
    the fix where it is; (3) `:735-738` (4-2, `SectionHeader` lift "after 3.17") — its precondition
    is now met; re-point to "the first story that touches both files" without the 3.17 clause;
    (4) `:165` (2-1 review, the two-phase `useSearchParams` read) — `mode` now rides the same read;
    the hazard is unchanged in kind and still unobserved; add the sentence; (5) a new "Deferred
    from: Story 3-17-run-battle-from-gallery" section with the candidates under Dev Notes.
    `sprint-status.yaml` moves this story only (`in-progress` at start, `review` at the end) — lane
    4 is open in another worktree; its status lines must not ride into this branch.

## Tasks / Subtasks

- [x] **Task 1 — the route contract module (AC3)**
  - [x] (a) New `apps/web/lib/battle/battleRoute.ts` (camelCase, never dotted). Head comment in the
    `simulationSpeed.ts:1-10` register: Decision K.5 (ids ride as query params on a static
    `/battle`); this module is the ONE place the tile's hrefs and the route's parse agree on the
    param name and value — two literals in two files is the drift `lib/battle/tool.ts` warns about
    for `DEFAULT_TOOL`; the entry hint is read ONCE by `<BattlePage>` and never written back
    (RFC-005 Decision 3: a flip is state). Body:
    ```ts
    import type { BattleMode } from '@/components/battle/BattleHeader';
    export const BATTLE_MODE_PARAM = 'mode';
    export const RUN_MODE_VALUE = 'run';
    export function battleHref(id: string, options?: { mode?: 'run' }): string { … }
    export function initialModeFromParam(value: string | null): BattleMode { … }
    ```
    `battleHref` without a mode returns byte-for-byte what `BattleTile.tsx:428` builds today.
  - [x] (b) `battleRoute.test.ts` beside it: `battleHref(id)` equals the pinned title shape;
    `battleHref(id, { mode: 'run' })` ends in `&mode=run`; `battleHref('a b')` encodes; the parse
    table — `'run'` → `'run'`; `null`, `''`, `'lab'`, `'RUN'`, `'play'`, `' run'` → `'lab'`.
    Pure, no React, no DOM.

- [x] **Task 2 — the tile (AC1, AC2)**
  - [x] (a) `BattleTile.tsx`: import `battleHref` from `@/lib/battle/battleRoute`; replace the
    inline template at `:428` with `battleHref(battleId)` (rewrite the `:424-427` comment: the
    encoding reasoning stays, the builder is named). Lift `:115-140`'s object into
    `const actionChrome = { … } as const` (or the dev's equivalent — the constraint is ONE object
    consumed twice, with every ⚠️ comment moved with it), `DeleteButton = styled('button')(actionChrome)`,
    `RunLink = styled(Link)(actionChrome, { textDecoration: 'none' })`. `TileActions` (`:84-106`)
    gains `display: 'flex', gap: '6px'` with a comment citing the biotech band. `TileHeader`
    (`:147-161`): `paddingRight: '68px'` and the rewritten arithmetic.
  - [x] (b) Render, inside `<TileActions data-tile-actions="">` and BEFORE `<DeleteButton>`:
    ```tsx
    <RunLink
      href={battleHref(battleId, { mode: 'run' })}
      aria-label={`Run ${displayName}`}
      title={`Run ${displayName}`}
    >
      <span aria-hidden="true">▶</span>
    </RunLink>
    ```
    Comment: why a link (2.2 FD1 / 2.16 FD1 — pure navigation), why `displayName` in the name
    (every tile's Run must be distinct, the Delete reasoning at `:472-473`), why the glyph (FD4:
    the transport bar's Play glyph; axe drops symbol-only text into `incomplete`, and the pair is
    gated by `themeTokens.test.ts:55-76` instead). Rewrite `:465-470` (tab order) to name Run.
    ❌ No `data-run-battle-id` — nothing restores focus to it (Delete's attribute exists for the
    dialog's focus restore, `:479-484`; a link navigates away).
  - [x] (c) `BattleTile.test.tsx`: `:135-147` → 6 Tabs, with the 5th asserted on
    `getByRole('link', { name: 'Run Three-Way Skirmish' })`; new tests — Run link `href` exact
    (`` `/battle?id=${BASE_PROPS.battleId}&mode=run` ``); Run link not inside the title link;
    two tiles → distinct Run names (`getAllByRole('link', { name: /^Run / })` equals the two
    names, the `:294-308` shape); the glyph span is `aria-hidden` and the accessible name is
    exactly `Run Three-Way Skirmish`; the title link's `href` test (`:122-129`) UNCHANGED and
    green; the three axe scans green. Do not write the word `localStorage` anywhere in
    `BattleTile.tsx`, even in a comment — `BattleGallery.test.tsx:537-549` scans the source.

- [x] **Task 3 — the route and the page (AC4, AC5, AC6, AC7)**
  - [x] (a) `app/(battle)/battle/page.tsx:19-28`: `const params = useSearchParams();`
    `const battleId = params.get('id') ?? '';`
    `const initialMode = initialModeFromParam(params.get(BATTLE_MODE_PARAM));`
    `<BattlePage repositories={repositories} battleId={battleId} initialMode={initialMode} />`.
    Extend the `:8-13` Decision K comment with the second param and its entry-hint semantics.
  - [x] (b) `BattlePage.tsx`: `BattlePageProps` gains `initialMode?: BattleMode` with a doc comment
    (FR-7.6; an ENTRY hint from the Gallery's Run link; read once; `'new'` never passes it);
    destructure with `initialMode = 'lab'`; `useState<BattleMode>(initialMode)`; the in-render
    adjust after `runDisabledReason` (`:556-557`) with its comment; rewrite `:150-156`, `:71-72`,
    `:817-818`, `:873-880` per AC11. Nothing else in the file changes — `handleModeToggle`, the
    lock, the guard, the render branches are untouched.
  - [x] (c) `BattlePage.test.tsx`: the new describe per AC5/AC6/AC7 (a)(b). Reuse `seeded()`,
    `withFailingOrganismList()`, `SKIRMISH`, the router mock (`:29-32` — MANDATORY, trap 21 of
    2.16), `resetRefToFillGroupWarnings` in `afterEach`. The existing 3.11 describe is untouched
    except where a helper is hoisted.
  - [x] (d) `BattlePage.modeToggle.test.tsx`: `renderSkirmishInRun()` (AC7 (c)) — render with
    `initialMode="run"`, `await screen.findByRole('group', { name: 'Mode' })`, `waitFor(runRenders
    .length > 0)`, `findByTestId('run')`; assert `editorRenders` is EMPTY at that point (the editor
    never mounted), then the prop equalities.

- [x] **Task 4 — e2e (AC8, AC9)**
  - [x] (a) `battleRoute.spec.ts`: hoist `tileLink` and `runLink` beside `speedSlider` (`:132-151`)
    with the Trap 4 comment; convert the five substring locators; add the 3.17 `test.describe`
    with tests (a)–(d) per AC8. Scope `view` / `cycle` locators per block (the 3.14 convention).
    `page.reload()` in (c) must re-await the h1 before reading `[data-mode]` (the `:204-205`
    hydration lesson).
  - [x] (b) `gallery.spec.ts`: (e) and (f) per AC8. The long-name test keeps its
    `titleBox.height > 30` guard and asserts `titleBox.x + titleBox.width <= bandBox.x`.
  - [x] (c) Run `gallery.spec.ts`, `deleteBattle.spec.ts`, `createBattle.spec.ts`, and the 2.1,
    2.16, 3.11 and 3.17 blocks of `battleRoute.spec.ts` on `--project=chromium --workers=1`, then
    `--project=webkit --workers=1`, on a PRIVATE port (revert before commit).

- [x] **Task 5 — comments made true, bookkeeping (AC10, AC11)**
  - [x] (a) The comment rewrites listed in AC11; `CreateBattleLink.tsx:58-60`'s stale block name.
    `grep -rn "3\.17\|3-17" apps packages docs/implementation-artifacts/deferred-work.md` — every
    "will" / "Story 3.17's" sentence reads as present or stays only where still true as history
    (`OrganismLibrary.tsx:42-44` is history once (3) below is re-pointed; `1-10:733-736` and
    `1-11:703-707` are archived story files — not edited).
  - [x] (b) `deferred-work.md` per AC11 (1)–(5). The new section's candidates are under Dev Notes →
    "Candidates to record".
  - [x] (c) `npm run build:standalone && npm run bundle:check` — the four route numbers; the Run
    chunk grep. `npm run ci > /tmp/ci-3-17.log 2>&1; echo $?` — the real exit code and the named
    failures.
  - [x] (d) `sprint-status.yaml`: this story's line only. Dev Agent Record: FD1–FD5 options taken
    and why; the bundle numbers (both routes, deltas); the `ci` exit code with named failures;
    which e2e projects ran on which port; the five converted locators by line.

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation (2026-09-17), via three parallel adversarial
layers (Blind Hunter — diff only; Edge Case Hunter — diff + read access; Acceptance Auditor — diff +
story + spec). 0 `decision-needed`, 12 `patch`, 3 `defer`, 9 dismissed as noise. The reviewer re-ran
the gate independently rather than trusting the Dev Agent Record: typecheck / lint / format:check /
spec:check / boundary:check exit 0; `apps/web` 1466 unit tests green; `build:standalone` +
`bundle:check` reproduce the Debug Log's four numbers exactly (333.6 / 308.9 / 308.7 / 295.4 KB);
e2e on a PRIVATE port (4917, an untracked throwaway config, deleted before commit): chromium
`battleRoute.spec.ts` 90/90 and `gallery`/`deleteBattle`/`createBattle` 19 passed + 1 skipped;
webkit 3.17 block + `gallery.spec.ts` 10/10.

- [x] [Review][Patch] AC6 tests claim "`[data-status]` never mounts — not even transiently" on a final-state `querySelector` that cannot observe a transient mount; add the recorder-based proof (`runRenders.length === 0`) in `BattlePage.modeToggle.test.tsx` and cut the comment to what the assertion proves [apps/web/components/battle/BattlePage.test.tsx:3014-3016; apps/web/components/battle/BattlePage.modeToggle.test.tsx]
- [x] [Review][Patch] `toHaveLength(4)` on level-2 headings does not distinguish Lab from Run (the Run sidebar has exactly four h2s too) — assert the Lab heading names in AC6(a) and AC7(b) [apps/web/components/battle/BattlePage.test.tsx:3007,3072]
- [x] [Review][Patch] Line-number citations are stale within this same diff (`deferred-work.md:912-920` moved by the patch's own insertions; `:~260` for `nameState`; `:204-205` for the hydration lesson) — cite by entry title / symbol, not line [apps/web/components/battle/BattlePage.tsx:577-579; apps/web/components/battle/BattlePage.test.tsx:2995; apps/web/e2e/battleRoute.spec.ts:2777]
- [x] [Review][Patch] Band width stated as "68px wide" (that is `TileHeader.paddingRight`; the band is 28 + 6 + 28 = 62px, as `BattleTile.tsx` and `deferred-work.md` both derive) [apps/web/e2e/battleRoute.spec.ts:289-290]
- [x] [Review][Patch] Tab-order test title "keeps the delete button outside the title link" now also pins Run's containment and position — rename it [apps/web/components/gallery/BattleTile.test.tsx:368]
- [x] [Review][Patch] AC8(d) keyboard e2e: the Run locator is page-scoped while the Delete locator is tile-scoped (two tiles sharing a name would strict-fail), and a zero-dot first tile would silently weaken the proof — scope Run to the tile and assert `dotCount > 0` [apps/web/e2e/battleRoute.spec.ts:3011-3032]
- [x] [Review][Patch] `OrganismLibrary.tsx` was edited although Task 5(a) said its comment "is history" once the deferred-work entry is re-pointed, and `components/organisms/**` is lane 4's surface (4.10) — revert the comment-only change; also "Story 3.17 has now landed" past tense in `deferred-work.md` from inside the PR that lands it [apps/web/components/organisms/OrganismLibrary.tsx:39-44; docs/implementation-artifacts/deferred-work.md:742-745]
- [x] [Review][Patch] `RunLink` comment gives a false reason for the spread — MUI's `styled()` resolver is variadic (`@mui/system/createStyled/createStyled.js:186`), so `styled(Link)(actionChrome, { textDecoration: 'none' })` would have worked; keep the spread, fix the why [apps/web/components/gallery/BattleTile.tsx:157-163]
- [x] [Review][Patch] The Run glyph comment says `aria-hidden` is "because axe's emoji regex would otherwise flag a symbol-only name as `incomplete`" — `aria-hidden` keeps the glyph out of the accessible name; the `incomplete` verdict is a color-contrast matter that FD4 accepts because the pair is gated by `themeTokens.test.ts`. The adjacent Delete comment ("a REAL color-contrast check … what we want for a real control") now reads as an argument against the line above it — make the two consistent [apps/web/components/gallery/BattleTile.tsx:501-503,516-517]
- [x] [Review][Patch] FD4(a)'s "record the `incomplete` entry as expected in the e2e axe test's comment, as 1.12 did for `∅`" was not done — the axe test comment only explains the hover [apps/web/e2e/gallery.spec.ts:269-272]
- [x] [Review][Patch] The e2e seed-helper fork entry still ends "Pick this up in the next story that touches `apps/web/e2e`" — 3.17 is that story and declined; "What NOT to build" said to re-point it honestly [docs/implementation-artifacts/deferred-work.md:193]
- [x] [Review][Patch] AC4 asked the read-site comment to say an unrecognised value is Lab, silently; the sentence lives only in `battleRoute.ts`. Also the Completion Notes' dangling "verified by `git diff --stat` before committing (below)" — nothing follows [apps/web/app/(battle)/battle/page.tsx:29-30; this file, Completion Notes]
- [x] [Review][Defer] `/battle?id=new&mode=run` seeds Run over an unsaved empty draft — the `'new'` sentinel leaking through the query route is pre-existing (Story 2.2), and the state it reaches is the one the RUN toggle already permits on `/battle/new` (an empty roster is `[]`, not `null`) [apps/web/app/(battle)/battle/page.tsx:32-34] — deferred, pre-existing
- [x] [Review][Defer] Two-phase `useSearchParams` read: if render 1 ever yields empty params, `useState(initialMode)` captures `'lab'` and — unlike the not-found flash the entry describes — does not self-heal; a `key` on the route side is the shape if it is ever observed [apps/web/app/(battle)/battle/page.tsx:32-37] — deferred, pre-existing (`deferred-work.md` two-phase entry, unobserved since Story 2.1)
- [x] [Review][Defer] When a library change under a mounted page (Stories 4.24/4.25) turns `runOrganisms` null mid-run, the adjust drops a LIVE session to Lab with no notice beyond the disabled RUN's `title` — unreachable today; whether a running session deserves a stop-and-explain is 4.24/4.25's call [apps/web/components/battle/BattlePage.tsx:588] — deferred, not reachable before 4.24/4.25

## Dev Notes

### Constraints the developer MUST follow

- **Scope: one contract module, one tile link + band reflow, one prop + one seed + one in-render
  adjust, one route read, tests, comments, bookkeeping.** No change to `<BattleHeader>` (the
  toggle already renders whatever `mode` is), `<BattleSimulationView>`, `<SidebarFooter>`,
  `useLeaveGuard`, `useSimulation`, `<PetriDishCanvas>`, `<BattleGallery>` (it passes nothing new —
  the tile builds its own href from `battleId`, as it already does), `<GalleryEmptyState>`,
  `check-bundle-size.mjs`, `themes.css`, anything in `packages/**`.
- **Modes are state, not routes (RFC-005 Decision 3, AR-28, Decision K.1).** The param is an
  ENTRY hint: `useState(initialMode)` reads it once, the toggle never writes the URL, nothing calls
  `router.replace` / `history.replaceState` (the route file's own warning at `page.tsx:15-18`;
  `deferred-work.md:376`'s remount analysis). `data-mode` is still the e2e's only handle on the
  mode.
- **Pure navigation is a link; guarded navigation is a button (2.2 FD1, 2.16 FD1).** The Run
  affordance navigates unconditionally → `styled(Link)`. ❌ No `useRouter` in any Gallery file, no
  `onClick` that navigates, no `<button>` for Run.
- **Repositories are injected, never imported (AR-2, AR-27).** Nothing here touches one; the tile
  keeps receiving `battles` for its thumbnail exactly as today.
- **Hot state stays in refs (RFC-005 Decision 5, AR-29).** This story adds nothing on the Run path
  beyond a seeded `useState` and a render-time comparison. No effect watches `mode`.
- **The in-render adjust is the `nameState` pattern (`BattlePage.tsx:257-267`), not an effect and
  not a derived value.** `react-hooks/set-state-in-effect` is live; an effect also paints the empty
  branch once. Place it after `runOrganisms`, before the early returns, guarded on
  `runOrganisms === null` only.
- **`apps/web` rules:** strict TS, no `any` / `!` / `@ts-ignore`; `react-hooks/refs`,
  `set-state-in-effect`, `exhaustive-deps` live; AR-46 no-raw-hex; comments explain WHY and cite by
  ID (`spec:check` reads code — `FR-7.6`, `FR-7.10`, `Decision K`, `RFC-005`, `AR-28`, `NFR-4.1`,
  `Story 3.11` exactly; `FR7.6` or `K-5` is silently exempt forever).
- **Determinism in tests:** the SKIRMISH fixture under the mock library — no ties, no RNG; the Run
  view is only ever asserted paused at cycle 0 here.
- **Commit gate.** The story subagent commits to its own `story/3-17-…` branch; merging is
  Sidiar's. Do not touch epic-4 story files or status lines.

### What this story is, in one paragraph

Story 3.11 built the toggle and the `'run'` branch so that entering Run would be `setMode('run')`
and nothing else: the header renders whichever mode it is handed, the lazy chunk mounts the view
over the persisted `grid` as `initialGrid`, the hook clones it and starts paused at cycle 0, and
the Run footer's Back already runs the FR-7.9 guard and pushes `/`. Story 2.1 made the tile a
stretched link to the static `/battle?id=` route and Story 1.13 gave it a hover-revealed action
band with one button in it. What is left is to let the Gallery SAY "run" — a second link in that
band carrying `&mode=run`, a one-module contract so the tile and the route cannot disagree on the
spelling, a route read beside the id, a prop that seeds `mode` once, and a guard for the one state
3.11 left as "unreachable today" that a Run entry reaches on mount: a roster that cannot run, which
lands in Lab with the RUN button disabled and explaining itself, exactly as it would after a toggle
attempt. Nothing is persisted, nothing is dirtied, the URL is never rewritten, and the engine never
learns how the page was entered.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — How the Gallery tells the route to open in Run.**
- **(a) `?mode=run` beside `?id=`, read once by `<BattlePage>` as `initialMode`; never rewritten
  on a toggle** *(recommended)*. Decision K.5 already says entity-scoped state rides as query
  params on a static page; the route already has the reader and the boundary; a link can carry it
  (bookmarkable, middle-clickable, prefetched, `page.goto`-able in e2e); RFC-005 Decision 3 is
  honoured because the param is consumed as an INITIAL value and the flip remains state. The
  visible consequence — the address bar still reads `&mode=run` after Run → Lab, and a reload
  re-enters Run — is stated in the comment and proven by e2e (c), not hidden.
- **(b) (a) plus `router.replace` to strip the param after mount.** ❌ A second navigation for
  cosmetics; `useRouter` reaching the page boundary; an effect (`set-state-in-effect`-adjacent);
  and a `replace` whose behaviour under the static export's CSR bailout nobody has measured
  (`deferred-work.md:376` records the remount hazard for the `/battle/new` → `/battle` case — same
  page file here, so likely no remount, but "likely" is not a reason to add a navigation).
- **(c) A hand-off outside the URL** (`sessionStorage` flag, module-level variable). ❌ Invisible,
  unbookmarkable, un-e2e-able without a seed, and state living outside the three categories
  RFC-005 allows.
- **(d) `<button>` + `router.push` from the tile.** ❌ 2.2 FD1 / 2.16 FD1: pure navigation is a
  link; `CreateBattleLink.tsx:20-26` says "do not modernise these into buttons on the strength of
  the hook now existing" in as many words.

**FD2 — Where the param contract lives.**
- **(a) `apps/web/lib/battle/battleRoute.ts`, consumed by the tile (both hrefs) and the route
  (the parse)** *(recommended)*. One builder, one parser, one pair of constants; tested pure; a
  type-only import of `BattleMode`. Tiny, and in both routes' first-load payload by construction
  (Trap 11).
- **(b) Literals in `BattleTile.tsx` and `page.tsx`.** ❌ The `DEFAULT_TOOL` / `CONWAYS_CLASSIC_ID`
  drift `lib/battle/tool.ts` documents; a renamed param compiles and 404s the feature silently.
- **(c) Put it in `@gol/domain`.** ❌ A URL is UI wiring, not domain (`apps/web` "holds UI and
  wiring"); and `packages/*` never learn a route exists.

**FD3 — A Run entry whose roster cannot run.**
- **(a) In-render `setMode('lab')` when `mode === 'run' && runOrganisms === null`; the tile shows
  Run unconditionally** *(recommended)*. Lands the user where a toggle attempt would leave them —
  Lab, RUN disabled with `title` (3.11 FD4), the AC7 roster notice when the library failed. State
  and DOM agree; the header's `aria-pressed` is honest; `handleModeToggle` is untouched. The same
  line closes the 3-11 review's future case (4.24/4.25 changing the library under a mounted page).
  The Gallery does not pre-judge runnability: it has `DisplayOrganism`s with fallbacks
  (`resolveDisplayOrganisms`), not the page's `runOrganisms` — hiding Run per tile would duplicate
  the page's rule in a second place with a second fixture, and would still be wrong the day the
  library changes between the Gallery render and the click.
- **(b) Leave `mode` at `'run'` and render on a derived `effectiveMode`.** ❌ `data-mode` and the
  header would say Lab while state says Run; every later reader of `mode` inherits the split.
- **(c) A fourth body ("this battle cannot run") in the Run branch.** ❌ A new surface for a state
  one click from a surface that already explains it; and it leaves `runOrganisms !== null` as a
  reachable render of nothing on every OTHER path.
- **(d) An effect that flips to Lab.** ❌ `react-hooks/set-state-in-effect`, and one painted frame
  of header-over-nothing — the exact flash AC6 forbids.

**FD4 — The Run glyph and its chrome.**
- **(a) `▶` (U+25B6) `aria-hidden`, on Delete's 28×28 chrome via one shared style object**
  *(recommended)*. The transport bar's own Play glyph (`SimulationControlBar.tsx:190`) — the same
  verb in two places reads as the same verb. axe's emoji regex contains `▶`
  (`node_modules/axe-core/axe.js:7792`), so `color-contrast` lands the glyph in `incomplete`
  rather than evaluating it (the Story 1.12/1.13 `textIsEmojis` note); that is acceptable HERE
  because the pair the control wears — `--gol-text-secondary` on `--gol-bg-hover`,
  `--gol-border-control` on `--gol-bg-hover` — is a GATED row in `themeTokens.test.ts:55-76`,
  which is the stronger check (1.13's Task note says the same: "already asserted by
  `themeTokens.test.ts`; no new gate row is needed"). Record the `incomplete` entry as expected in
  the e2e axe test's comment, as 1.12 did for `∅`.
- **(b) Text `RUN` on the biotech mockup's 50×32 text-button chrome.** ❌ The clinical theme is
  what ships; a text button beside a glyph button is two vocabularies in one band; the band grows
  to 106px and the header reservation to 94px.
- **(c) `▷` / `⊳`.** ❌ Same axe range (`getUnicodeNonBmpRegExp`, `axe.js:16686` covers
  U+2200–U+27BF wholesale), less recognisable, and not the glyph the transport bar uses.

**FD5 — Where Run sits in the tab order.**
- **(a) Before Delete, inside `TileActions` — DOM order equals visual order (left → right), and
  Delete stays the tile's LAST stop** *(recommended)*. The 1.13 rationale ("a destructive action
  reads naturally last") is intact; a screen-reader user meets Run before Delete.
- **(b) After Delete.** ❌ Visual/DOM mismatch, and it demotes the destructive control from last.

### Traps

1. **`BattleTile.test.tsx:135-147` counts five Tabs to Delete — it becomes six.** Convert, and pin
   the fifth stop on the Run link so a Run link placed AFTER Delete (FD5 (b)) reddens it.
2. **RTL string names are exact; Playwright's are substrings.** `screen.getByRole('link', { name:
   'Three-Way Skirmish' })` keeps working under RTL. `page.getByRole('link', { name: 'Three-Way
   Skirmish' })` does NOT — see Trap 4. Do not "harmonise" the two by switching RTL to regexes.
3. **`gallery.spec.ts:135-161` measures the title against the DELETE BUTTON's left edge.** The
   Run link now sits 34px further left; a title that clears Delete can run under Run. Measure the
   band (`[data-tile-actions]`), and keep the strict `[data-tile-actions] button` locator only if
   it is still used — it resolves to exactly one element (Run is an `<a>`).
4. **Five e2e locators go red under strict mode the moment the Run link renders**
   (`battleRoute.spec.ts:188`, `:1175`, `:1318`, `:1543`, `:1847`). `exact: true` on every
   title-link locator, through one hoisted helper. A test that hangs 30 s on `click()` rather than
   failing fast is this trap (the 3.15 trap-1 lesson) — convert BEFORE running the suite.
5. **The Run link must never share the title link's accessible name.** `Run ${displayName}` is
   distinct by construction; the untitled fallback still reads `Run Untitled Battle` — assert it
   (the `:285-292` shape for Delete).
6. **The two-phase `useSearchParams` hazard (`deferred-work.md:165`) now covers `mode` too.**
   Both values come from ONE `params` read in ONE render; if `id` were empty on render 1, `mode`
   would be too, and `useState(initialMode)` would capture `'lab'` — but in that world the page
   also shows not-found for a frame, which nobody has observed. No special handling; the entry
   gains a sentence. ❌ Do not "fix" it with a `{ value, seed }` re-seed of `mode` on prop change —
   that turns the entry hint into a synchronised route (FD1's line).
7. **`BattlePage.tsx:71-72`'s `ssr: false` justification becomes false.** "The Run view is never
   part of the first paint (`mode` starts `'lab'`)" — with `?mode=run` it starts `'run'`. The
   sentence that is still true: the prerendered `battle.html` is the Suspense fallback because
   `useSearchParams` bails the subtree to CSR, so nothing under it is ever prerendered. Write that.
8. **The adjust cannot fire while the roster is withheld.** `rosterSettled === false` →
   `rosterIds === NO_ROSTER` → `runOrganisms` is `[]` (`[].every(...)` is `true`), not `null`. It
   fires exactly once the organism resource has SETTLED (ready-but-empty, ready-with-a-hole, or
   error). If a test sees `data-mode="lab"` on a resolvable roster, something changed that chain.
9. **The loading gate returns before the header renders.** Between mount and the resources
   settling the page is `<BattleLoading>`; the RUN-pressed header and the `RunLoading` fallback
   appear only after. A test asserting `aria-pressed` must `await findByRole('group', { name:
   'Mode' })` first, as the 3.11 tests do.
10. **`BattlePage.modeToggle.test.tsx:78-89`'s `renderSkirmish` waits for the EDITOR to render.**
    A run-first render never mounts it — the helper would time out. Write `renderSkirmishInRun`
    and assert `editorRenders.length === 0` at the moment the run view is found (the proof that
    "directly in Play Mode" means the editor never mounted, not that it was replaced).
11. **`/battle` has 1.3 KB of headroom and `battleRoute.ts` lands in its first-load payload.**
    Keep the module to two constants and two functions; a value import from anywhere pulls that
    module's graph into both routes. Report both routes' numbers.
12. **Lifting Delete's style object must move its ⚠️ comments with it** (`BattleTile.tsx:108-114`:
    the `--gol-border-control` SC 1.4.11 reasoning; the first-consumer-of-`--gol-bg-hover` note).
    A refactor that leaves the reasoning on a block that no longer holds the value is how the next
    reader "simplifies" the token away.
13. **`CreateBattleLink.tsx:59` says "BattleTile's Tile, TileActions and ActionButton".** No
    `ActionButton` exists — it is `DeleteButton` today and `actionChrome` after this story. Fix the
    name while you are in the file's neighbourhood; do not leave a second stale name behind.
14. **`@media (hover: none)` makes BOTH controls permanently visible on touch.** The tablet
    Playwright project (`deleteBattle.spec.ts:123`) asserts the band's opacity is `1` there —
    unchanged; but the touch-visible band is now 62px wide and the tile-body click test at
    `battleRoute.spec.ts:268-281` clicks "clear of the top-right delete button's 34px band" — its
    coordinates (low-centre) are still clear; rewrite its comment to say 68px.
15. **WebKit's plain `Tab` lands on `<body>` locally** (the 3.12 pre-existing failure). Any Tab
    press the new keyboard test adds uses the `browserName === 'webkit' ? 'Alt+Tab' : 'Tab'` idiom
    (`battleRoute.spec.ts:2334-2392`), and the test is written on the Gallery, not the route.
16. **`next/link` prefetch now fires twice per tile** (title and Run share the `/battle` page). The
    App Router dedupes by route; nothing to do, but if a "prefetch storm" is ever suspected, this is
    where the second link came from.
17. **`data-mode` is rendered from the FIRST commit**, so `[data-mode="run"]` is true before the
    lazy chunk resolves. e2e (a) must wait on `[data-status]` for "paused at cycle 0", not on
    `data-mode` alone.
18. **`spec:check` reads this file.** Every ID above is spelled as the specs spell it.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **RFC-005 Decision 3 / AR-28 / Decision K.1 "the URL never changes on a flip" vs a `mode` query
  param.** Not a conflict once the param is an ENTRY hint: the flip still writes no URL, and K.5
  already licenses query params for entity-scoped state on the static route. The consequence (a
  stale `&mode=run` after Run → Lab; a reload re-enters Run) is documented and tested rather than
  hidden. Amendment candidates: `component-tree-battle-page.md` §3.1 (`BattlePageProps` gains
  `initialMode?: BattleMode`), §7 (an FR-7.6 row — there is none today), RFC-005 Decision 3's
  route list (`/battle?id=<uuid>[&mode=run]`), and the `deferred-work.md:696-701` RFC-touch
  tracker (AR-28 / D3 enumerations) takes the note.
- **No mockup renders a Run affordance on a tile.** The clinical mockup has a single `⋮` menu
  (`battle-gallery.html:519-521`, no menu authored), the biotech one a `COPY` / `DEL` band. Story
  1.13 chose per-action buttons over the menu (its Task note: "Edit/Run/Duplicate are Epic 2/3 and
  Epic 5 … the biotech mockup's per-action buttons are the shape to follow"); this story adds the
  second button to that band. Recorded as a mockup-refresh candidate beside 3.13's and 3.16's.
- **Epic AC "the Run affordance appears on tiles only now that Run exists" (no-dead-affordance).**
  Satisfied by construction — nothing hid it before; it is new. No feature flag, no
  `runAvailable` prop.
- **Spec §3.1's "FR-7.4/7.5 (entry)" lists no FR-7.6.** The route entry now serves three FRs;
  the §7 row is the amendment above.
- **`deferred-work.md:912-920` assigned the "header over nothing" fix to Stories 4.24/4.25.** This
  story reaches the state first (on mount) and takes the fix; the entry is closed here with that
  note, and 4.24/4.25 inherit the guard.

### What NOT to build

- ❌ No autoplay. FR-7.6 says "open directly in Play Mode"; the epic AC says "paused at cycle 0";
  the hook starts paused and nothing here calls `play`.
- ❌ No `⋮` action menu, no Edit link (the title IS the edit link, FR-7.5), no Duplicate / Export
  (Epic 5).
- ❌ No `router.replace` / `history.replaceState` to strip the param; no URL write on a toggle.
- ❌ No `useRouter`, `usePathname` or `useSearchParams` in any Gallery file.
- ❌ No per-tile runnability check; no `runnable` / `canRun` prop on `<BattleTile>` or
  `<BattleGallery>`.
- ❌ No change to `<BattleHeader>` (it already renders the pressed state from `mode`), no change to
  `<BattleSimulationView>`, `<SidebarFooter>`, `useLeaveGuard`, `useDirtyGuard`, `useSimulation`.
- ❌ No `SectionHeader` lift between `<OrganismLibrary>` and `<BattleGallery>` (`deferred-work.md:735`
  — this story touches `BattleTile.tsx`, not the Gallery's header; the lift's own condition is
  "touches both").
- ❌ No `initialMode` on `/battle/new`; no `mode` in the document title; no `error.tsx`.
- ❌ No new `@gol/test-utils` fixture; no edit to `component-tree-battle-page.md`,
  `architecture.md`, RFCs, mockups or any 2.x/3.x story file — candidates go to `deferred-work.md`.
- ❌ No shared e2e seed-helper extraction (`deferred-work.md:142` — "the next story that touches
  `apps/web/e2e`"): this story touches two spec files and adds five-line locator helpers; the
  four-way `seedWorkspace` fork is a larger change than the story warrants and is left as recorded
  (re-point the entry's "next story" honestly if you decline it).

### Candidates to record (`deferred-work.md`, Task 5 (b) (5))

1. Spec §3.1 `initialMode?`, §7 FR-7.6 row, RFC-005 D3 route-list amendment (above).
2. The mockup-refresh list gains "a Run control in the tile's action band" beside 3.13's and
   3.16's items.
3. The stale `&mode=run` after Run → Lab: revisit only if a user reports a reload landing in Run
   as surprising (FD1 (b) is the shape, measured, if so).
4. Whether the Gallery should ever pre-judge runnability (FD3) — only if the "cannot run" state
   becomes common enough that a disabled Run on the tile is kinder than a Lab landing.
5. The e2e seed-helper fork (`:142`) — now four copies if the new block copies nothing (it should
   copy nothing: it uses `battleRoute.spec.ts`'s own helpers).
6. The `TileActions` phantom hit target (`:163`) — the band is wider; the fix is unchanged.

### Testing standards summary

- `apps/web/lib/battle`: Vitest 4 + jsdom; `battleRoute.test.ts` is pure (no React, no DOM).
- `apps/web/components/gallery`: RTL + `vitest-axe` + `userEvent`; locate links BY EXACT NAME;
  `expect(a).not.toContainElement(b)` for nesting; `user.tab()` for order.
- `apps/web/components/battle`: the 3.11 describe's helpers; `findRunView` for the lazy chunk; the
  router mock is mandatory; `resetRefToFillGroupWarnings` in `afterEach`; never snapshot the canvas.
- e2e: Playwright, `expect.poll` never `waitForTimeout`; `exact: true` on every tile-link locator;
  `collectErrors` on every test; the Gallery specs and the new block on `chromium` + `webkit`,
  `--workers=1`, private port.
- Make every new test fail under the mutation it guards: Run placed after Delete (Tab test
  reddens); `battleHref` with a literal `?mode=run` in the tile instead of the builder (the
  contract test still passes — so ALSO grep the tile for the literal in review); the parse
  accepting `'RUN'` (table reddens); the adjust removed (AC6 (a) reddens on `[data-status]` never
  mounting → it mounts nothing and `modeValue` stays `'run'`); the adjust turned into an effect
  (lint reddens); `initialMode` defaulting to `'run'` (every 3.11 test reddens); `exact: true`
  dropped (five e2e tests hang).
- `npm run ci > /tmp/ci-3-17.log 2>&1; echo $?`; report the real exit code, the named failures,
  and the bundle numbers.

### Previous story intelligence (3.16) and recent git

- **3.16 shipped the last Run-sidebar section; the Run view's DOM is now stable for this story**:
  four h2s (`Population Analysis`, `Cycle Count`, `Speed`, `Grid Size`), two named sliders, four
  buttons (Back, Play, Next cycle, Stop & reset) — every count this story asserts on the Run side
  is 3.16's, pinned at `BattleSimulationView.test.tsx:120-142` and `BattlePage.test.tsx:2720-2730`.
- **3.16's review culture** (14 patches, 0 decision-needed): comments that overclaimed
  ("exactly the DOM, ARIA and styles") were cut to what the test proves; assertions that a
  weaker state also satisfies were tightened (`toHaveValue('0')` AND `aria-valuetext`); the Dev
  Agent Record's e2e exit code was corrected from a claimed 0 to the real 1. Expect the same:
  `data-mode="run"` alone does not prove "opens in Play Mode" — pin `[data-status]` too; "the
  editor never mounted" is `editorRenders.length === 0`, not "the run view is present".
- **3.16's Debug Log**: `/battle` 308.7 KB (1.3 KB headroom, unchanged from 3.15), `/` 333.4 KB
  (6.6 KB), Run chunk ~6.3 KB gzip; `bench:check` 7.255 ms / 56.5% headroom; the
  `reuseExistingServer` private-port hazard; the two pre-existing 3.12 WebKit/tablet failures.
- **3.11** is the story whose surfaces this one enters from the other side: FD1 (lazy chunk, `ssr:
  false`, `RunLoading`), FD4 (`runOrganisms` null → RUN disabled with `title`), FD5 (the view's
  props), and its review's "header over nothing" entry. **2.16** is the Back precedent (`useRouter`
  for GUARDED navigation only; trap 18 `'/'` not `'/index.html'`; trap 21 the router mock).
  **2.1** built the stretched link and pinned `/battle?id=` exactly; **1.13** built the band.
- **Git:** stories run on `story/*` branches merged by PR (#48 3.16, #49 4.9, #50 chore); `feat:` /
  `fix: review patches (story N.M)` / `docs: record implement-next-story run stats` is the commit
  shape. Lane 4's next story (4.10 rule cards) touches `components/organisms/**` and
  `lib/organisms/**` only; nothing in 4.10–4.23 reads `BattleTile.tsx`, `BattlePage.tsx`, or the
  route file. 4.24/4.25 (gated on `epic-3`) will find the AC6 guard already in place.

### External dependencies / versions

None new. React 19.2.7; Next 16.2.10 (`next/link`, `next/navigation` as already used); RTL 16.3.2;
`vitest-axe` 0.1.0; Vitest 4.1.x; Playwright as installed; MUI 9.3.1 (`styled` only).

## Project Structure Notes

- New (code): `apps/web/lib/battle/battleRoute.ts`.
- New (tests): `apps/web/lib/battle/battleRoute.test.ts`.
- Modified (code): `apps/web/components/gallery/BattleTile.tsx` (Run link, shared chrome, band
  row, header reservation, comments), `apps/web/components/battle/BattlePage.tsx` (`initialMode`
  prop, seed, in-render adjust, four comments), `apps/web/app/(battle)/battle/page.tsx` (the
  second param read), `apps/web/components/gallery/CreateBattleLink.tsx` (one stale name in a
  comment).
- Modified (tests): `apps/web/components/gallery/BattleTile.test.tsx`,
  `apps/web/components/battle/BattlePage.test.tsx`,
  `apps/web/components/battle/BattlePage.modeToggle.test.tsx`, `apps/web/e2e/battleRoute.spec.ts`
  (five locators + one block + two helpers), `apps/web/e2e/gallery.spec.ts` (two tests).
- Modified (docs): `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`, this
  file.
- Not touched: `apps/web/components/battle/BattleHeader.tsx`,
  `apps/web/components/battle/simulation/**`, `apps/web/components/battle/SidebarFooter.tsx`,
  `apps/web/components/gallery/BattleGallery.tsx`, `apps/web/lib/battle/useSimulation.ts`,
  `apps/web/lib/battle/useLeaveGuard.ts`, `apps/web/components/PetriDishCanvas.tsx`,
  `apps/web/app/(battle)/battle/new/page.tsx`, `packages/**`, `scripts/*`, any planning artifact,
  any epic-4 story or status line.
- Naming: `battleRoute.ts` / `battleHref` / `initialModeFromParam` / `BATTLE_MODE_PARAM` /
  `RUN_MODE_VALUE` (the `simulationSpeed.ts` / `gridPresets.ts` register); `RunLink` /
  `actionChrome` in the tile; `initialMode` on the page; test describes cite `FR-7.6` / `FR-7.10`
  / `Decision K` / `RFC-005`.

## References

- `docs/planning-artifacts/epics.md#Story 3.17` (`:949-959`); FR-7.5 (`:102`), FR-7.6 (`:103`),
  FR-7.10 (`:107`), FR-3.10 (`:62`), FR-4.8 (`:75`); Story 3.11 AC (`:874-885`), 2.16 AC
  (`:722-734`), 2.1 AC (`:527-539`); the FR coverage map row (`:301`).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` — **FR-7.6 (`:437-438`)**,
  FR-7.5 (`:434-435`), FR-7.9 (`:451-455`), FR-7.10 (`:457-458`), FR-3.10 (`:261-262`), FR-4.8
  (`:324-326`).
- `docs/planning-artifacts/architecture.md` — **Decision K (`:302-330`)**: the route table
  (`:321-324`), K.1 (`:326`), K.3 (`:328`), **K.5 (`:330`)**; Cross-RFC Reconciliation #4 (`:339`).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — **Decision 3
  (`:179-197`)**, the `useState('lab')` snippet (`:187`), Decision 4 (`:201-222`), Decision 7
  (`:281-288`), the routing reconciliation (`:197`).
- `docs/planning-artifacts/component-tree-battle-page.md` — §2 tree (`:52-56`, `:95`), **§3.1
  (`:101-114`)**, §3.2 (`:116-131`), §3.9 (`:242-246`), §3.11 (`:271-288`), §7 (`:428-457` — no
  FR-7.6 row), §9 (`:471-484`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/battle-gallery.html`
  — `.tile-actions` / `.action-menu-btn` (`:394-423`), a tile (`:517-525`), the demo click
  (`:798-811`); `biotech-terminal-theme/battle-gallery.html` — the two-button band
  (`:382-400`, `:679-682`).
- `apps/web/app/(battle)/battle/page.tsx` (the whole file — the reader `:19-28`, the boundary
  `:30-38`, the warnings `:8-18`); `apps/web/app/(battle)/battle/new/page.tsx:7-20`.
- `apps/web/components/battle/BattlePage.tsx` — `dynamic()` (`:52-77`, **`:71-72`**),
  `BattlePageProps` (`:132-138`), **`mode` (`:150-156`)**, `useRouter` (`:158-178`), `nameState`'s
  in-render adjust (`:239-268`), `handleModeToggle` (`:317-325`), `rosterSettled` (`:396-407`),
  `rosterIds` (`:416-469`), **`runOrganisms` / `runDisabledReason` (`:532-557`)**, `leaveToGallery`
  / `useLeaveGuard` (`:743-762`), the loading gate (`:764-780`), `data-mode` (`:817-825`), the
  header (`:828-837`), **the Run branch (`:873-895`)**.
- `apps/web/components/battle/BattleHeader.tsx` — `BattleMode` (`:121`), props (`:123-143`), the
  toggle (`:156-185`).
- `apps/web/components/battle/simulation/BattleSimulationView.tsx` — props (`:63-79`),
  `data-status` / `data-cycle` (`:209`), the footer (`:247`).
- `apps/web/lib/battle/useLeaveGuard.ts` — options (`:31-60`), `requestLeave` (`:148-156`);
  `apps/web/lib/battle/useDirtyGuard.ts:27-43`.
- `apps/web/components/gallery/BattleTile.tsx` — props (`:25-42`), `Tile` (`:44-76`),
  **`TileActions` (`:78-106`)**, **`DeleteButton` (`:108-140`)**, `TileHeader` (`:147-161`),
  `TitleLink` (`:179-207`), `DotRow` (`:241-251`), the return (`:420-495`, the href `:424-428`,
  the tab-order comment `:465-470`, Delete `:477-492`).
- `apps/web/components/gallery/CreateBattleLink.tsx:15-26` (link vs button), `:58-60` (the stale
  name); `apps/web/components/gallery/BattleGallery.tsx:303-321` (what the tile receives).
- `apps/web/components/gallery/BattleTile.test.tsx` — `BASE_PROPS` (`:19-36`), tab order
  (`:102-119`), href (`:122-129`), **nesting + 5 Tabs (`:135-147`)**, distinct names (`:294-308`),
  glyph (`:310-315`), axe (`:239-258`); `BattleGallery.test.tsx:537-549` (the source scan).
- `apps/web/components/battle/BattlePage.test.tsx` — router mock (`:21-32`), `seeded()` /
  `withFailingOrganismList()` (`:159-193`), the 3.11 describe (`:2683-2931`: helpers `:2684-2701`,
  the flip `:2704-2745`, dangling roster `:2799-2814`, failing library `:2817-2825`, Back from Run
  `:2831-2853`, Run chassis counts `:2871-2887`); `BattlePage.modeToggle.test.tsx` — mocks
  (`:11-64`), `renderSkirmish` / `enterRun` (`:78-95`), Back (`:178-187`).
- `apps/web/e2e/battleRoute.spec.ts` — seed (`:11-44`), helpers (`:132-166`), the Gallery → route
  test (`:176-208`), the tile-body click (`:262-281`), the 2.16 block (`:1643-1960`, clean Back
  `:1681-1704`), the 3.11 block (`:1978-2134`, disabled RUN `:2115-2133`), the 3.13 keyboard idiom
  (`:2334-2392`); the five substring locators (`:188`, `:1175`, `:1318`, `:1543`, `:1847`).
- `apps/web/e2e/gallery.spec.ts` — seed (`:24-83`), **long name (`:135-161`)**, axe (`:251-272`);
  `apps/web/e2e/createBattle.spec.ts:60-77` (the navigate-and-back shape);
  `apps/web/e2e/deleteBattle.spec.ts:92-106`, `:123` (the band's opacity assertions).
- `apps/web/lib/themeTokens.test.ts:55-76` (`text-secondary` / `bg-hover` gated), `:125-151`
  (`border-control`); `node_modules/axe-core/axe.js:7792` (`▶` in the emoji regex), `:16686`
  (the symbol ranges).
- `packages/test-utils/src/mockWorkspace.ts:22-25` (ids), `:291-314` (battleA 50×30 with the
  three mock organisms; battleB with Conway appended — dangling in an e2e-seeded workspace).
- `scripts/check-bundle-size.mjs` — `/` 340 (`:56`), `/battle` 310 (`:64-81`), `/organisms` 305.
- `docs/implementation-artifacts/deferred-work.md` — **`:163`** (phantom hit target), **`:165`**
  (two-phase `useSearchParams`), `:376` (`router.replace` remount), `:696-701` (RFC touch
  tracker), **`:735-738`** (`SectionHeader` after 3.17), `:862-866` (bundle mechanism),
  **`:912-920`** (header over nothing), `:921-927` (disabled reason via `title` → 6.11), `:142`
  (e2e seed fork).
- `docs/implementation-artifacts/epic-3/3-16-play-mode-ephemeral-resize.md` (Review Findings, Debug
  Log), `3-11-mode-toggle-run-view-skeleton.md` (FD1, FD4, FD5; `:413`, `:646`),
  `epic-2/2-16-back-navigation-unsaved-changes-guard.md` (FD1 `:353-368`, traps 16/18/21),
  `epic-1/1-13-delete-battle-with-confirmation.md` (`:106-149`, the band and the glyph),
  `lane-gates.yaml`.
- `docs/project-context.md` — "entity ids ride as query params" (K.5); "Modes are state, not
  routes"; "Repositories are injected"; hot state in refs; `spec:check` spelling; commit gate;
  bundle ratchet.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (`claude-sonnet-5`), via `implement-next-story`'s `bmad-dev-story` step.

### Debug Log References

**Forced decisions taken** (all the `(a)` / recommended option in every FD, per the story's own analysis):

- **FD1 (a)** — `?mode=run` beside `?id=`, read once by `<BattlePage>` as `initialMode`, never
  rewritten on a toggle. `apps/web/lib/battle/battleRoute.ts` is the one module both the tile and
  the route read the param name/value from.
- **FD2 (a)** — the contract lives in `apps/web/lib/battle/battleRoute.ts`, consumed by
  `BattleTile.tsx` (both hrefs) and `app/(battle)/battle/page.tsx` (the parse). Type-only import of
  `BattleMode`; no `next/*` import; no value import from any component.
- **FD3 (a)** — the in-render adjust `if (mode === 'run' && runOrganisms === null) setMode('lab')`,
  placed after `runDisabledReason` in `BattlePage.tsx`, guarded on `runOrganisms === null` alone
  (Trap 8: `rosterIds`/`runOrganisms` are `NO_ROSTER`/`[]`, never `null`, while the roster is still
  in flight, so this cannot fire early).
- **FD4 (a)** — `▶` (U+25B6), `aria-hidden`, on Delete's shared 28×28 chrome (`actionChrome`).
- **FD5 (a)** — Run sits before Delete in `TileActions`; Delete stays the tile's LAST tab stop.

**Bundle numbers** (`npm run build:standalone && npm run bundle:check`, this story's build):

| Route | Before (3.16) | After (3.17) | Δ | Headroom |
|---|---|---|---|---|
| `/` | 333.4 KB | 333.6 KB | +0.2 KB | 6.4 KB (was 6.6) |
| `/battle` | 308.7 KB | 308.9 KB | +0.2 KB | 1.1 KB (was 1.3) |
| `/battle/new` | 308.7 KB | 308.7 KB | +0.0 KB | 1.3 KB (unchanged — no `initialMode` prop passed there) |
| `/organisms` | — | 295.4 KB | — | 9.6 KB (unaffected, untouched by this story) |

All four routes stay green. The Run chunk (grep for `"Grid dimensions"` in `.next/static/chunks/`)
is 6484 bytes gzip (~6.33 KB), matching 3.16's ~6.3 KB — confirms it is untouched by this story, as
scoped.

**Bench** (`npm run bench && node scripts/check-bench-budget.mjs`, no engine change — informational
only): step + repaint-diff-path at 100×60×20 = 7.641 ms against the 16.667 ms budget, 9.025 ms
headroom (54.2%). Unaffected by this story (`packages/simulation` untouched).

**Coverage** (`npm run test:coverage`): 1466 tests pass across `apps/web`; `lib/battle/battleRoute.ts`
is 100/100/100/100. No gated package's threshold moved (`apps/web` carries no gate).

**e2e**: ran both as part of `npm run ci` and, separately, per-project with `--workers=1` against a
fresh `build:standalone` + `serve out` — the sandbox this story ran in shares CPU across whatever
Playwright spins up, and the FIRST full `npm run ci` run produced widespread, non-deterministic
failures across unrelated specs (`createBattle.spec.ts`, `organisms.spec.ts`, etc.) when all four
Playwright projects ran concurrently; those same specs passed cleanly, deterministically, every
time each project was re-run alone. This matches `docs/project-context.md`'s own warning ("a local
green `npm run ci` is not proof CI is green... local runs use your own browsers") — recorded here
because the effect was large enough on this run to need naming, not silently worked around.
Per-project results (chromium/webkit/firefox/tablet), single worker, against the ACTUAL fresh
build: chromium 109 passed / 1 skipped (touch-only test); webkit 108 passed / 1 skipped / **1
pre-existing failure**, `battleRoute.spec.ts:2240` "Tab reaches Play, Next cycle, Stop & reset…
(AC8)" (Story 3.12) — this is the documented pre-existing local-WebKit failure this story's own Dev
Notes name in advance, unrelated to this story's changes (not fixed, per instruction); firefox 96
passed (`battleRoute.spec.ts` + `gallery.spec.ts`); tablet 17 passed / 1 skipped
(`gallery.spec.ts` + `deleteBattle.spec.ts`). The tablet/webkit "Tab reaches Play…" pre-existing
failure is the ONE named exception `npm run ci`'s real exit code should reflect, per the story's own
instruction to report it by name rather than claim exit 0.

**`npm run ci`'s FULL run (`npm run ci > /tmp/ci-3-17.log 2>&1; echo $?`): exit code `1`.**
typecheck → lint → format:check → spec:check → boundary:check → test:coverage → build:standalone →
bundle:check → bench → bench:check all passed (5 turbo tasks green, then 5, then 5, then 2). The
`e2e` stage is the sole failure, with exactly **2** failing tests out of 688 (686 passed, 4
skipped) across all four projects run together:
`[webkit] battleRoute.spec.ts:2240 "Tab reaches Play, Next cycle, Stop & reset in order… (AC8)"`
and `[tablet] battleRoute.spec.ts:2240` (the same test) — both the two PRE-EXISTING local-
WebKit/tablet failures Story 3.12 is known for (this story's own Dev Notes named them in advance);
not fixed, per instruction. Every one of this story's own new tests — the four
`battleRoute.spec.ts` "Run from Gallery (Story 3.17)" tests and the two rewritten `gallery.spec.ts`
tests — passed on all four projects.

The five e2e substring locators converted to `tileLink(page, name)` (Trap 4):
`battleRoute.spec.ts:201, 1189, 1332, 1557, 1861`.

### Completion Notes List

- All 11 ACs implemented as scoped: the route contract module (AC3), the tile's Run link + shared
  action-band chrome (AC1, AC2), the route/page wiring of `initialMode` (AC4, AC5), the AC6 guard
  for a Run entry over a dangling roster, AC7's Back/Lab round trip from a Run-first session, the
  e2e proof end to end (AC8) and the five locator conversions (AC9), the bundle/bench check (AC10),
  and the comment/bookkeeping pass (AC11).
- No hook, effect, ref, engine or `packages/**` change, per the story's own scope fence — verified
  by `git diff --stat` before committing (the File List) and by `boundary:check` staying green.
- `OrganismLibrary.tsx`'s stale `SectionHeader`/FD9 comment (naming Story 3.17 as future work,
  "the parallel Epic 3 lane") was corrected in passing, alongside `CreateBattleLink.tsx:58-60`'s
  stale `ActionButton` name — both are comment-only, no behaviour change, and both were surfaced by
  the AC11 grep instruction (`grep -rn "3\.17\|3-17" apps packages docs/implementation-artifacts/deferred-work.md`).
- `deferred-work.md` updated per AC11 (1)-(5): closed the 3-11 review's "header over nothing" entry
  (`:912-920` before this story); widened the phantom-hit-target entry (`:163`) to the new 62×28 px
  band and its asymmetric consequence; added a sentence to the two-phase `useSearchParams` entry
  (`:165`); re-pointed the `SectionHeader` lift entry (`:735-738`) now that its precondition (this
  story landing) is met; amended the RFC-touch tracker (`:696-701` region) with the `initialMode`/
  `&mode=run` detail; and added a new "Deferred from: Story 3-17-run-battle-from-gallery" section
  with the five remaining candidates from Dev Notes.
- Spec-conflict flag from the story's own Dev Notes (RFC-005 Decision 3 vs. a `mode` query param)
  is not a new conflict — the story itself resolves it as an ENTRY hint, consistent with Decision
  K.5, and records the one planning-doc amendment it implies in `deferred-work.md` rather than
  editing the planning docs directly (out of this story's scope).

### File List

**New (code):** `apps/web/lib/battle/battleRoute.ts`
**New (tests):** `apps/web/lib/battle/battleRoute.test.ts`
**Modified (code):** `apps/web/components/gallery/BattleTile.tsx`,
`apps/web/components/battle/BattlePage.tsx`, `apps/web/app/(battle)/battle/page.tsx`,
`apps/web/components/gallery/CreateBattleLink.tsx` (`OrganismLibrary.tsx`'s stale comment was
touched by the dev and reverted in review — lane 4's surface, and Task 5(a) had called it history)
**Modified (tests):** `apps/web/components/gallery/BattleTile.test.tsx`,
`apps/web/components/battle/BattlePage.test.tsx`, `apps/web/components/battle/BattlePage.modeToggle.test.tsx`,
`apps/web/e2e/battleRoute.spec.ts`, `apps/web/e2e/gallery.spec.ts`
**Modified (docs):** `docs/implementation-artifacts/deferred-work.md`,
`docs/implementation-artifacts/sprint-status.yaml`, this file

## Change Log

- 2026-09-17 — Story 3.17 created (ready-for-dev): ultimate context engine analysis completed —
  comprehensive developer guide created.
- 2026-09-17 — Story 3.17 code review (Opus, full mode): 0 decision-needed, 12 patches applied,
  3 deferred to `deferred-work.md`, 9 dismissed; gate re-run independently (static gates 0,
  1466 unit tests, bundle numbers reproduced, e2e chromium + webkit on a private port). Status →
  done.
- 2026-09-17 — Story 3.17 implemented (status: review). All 11 ACs, all 5 tasks. `npm run ci`
  exit code 1 — the sole failures are the two pre-existing local-WebKit/tablet "Tab reaches Play…"
  (Story 3.12) tests, named in the Debug Log; every other stage (typecheck, lint, format:check,
  spec:check, boundary:check, coverage, build:standalone, bundle:check, bench, bench:check) is
  green, and every new test this story added passed on all four Playwright projects. Bundle: `/`
  333.6 KB (6.4 KB headroom), `/battle` 308.9 KB (1.1 KB headroom), `/battle/new` 308.7 KB
  (unchanged), `/organisms` unaffected. `deferred-work.md` updated per AC11.

Dev Model: sonnet   # every seam is already pinned (query-param route, mode-as-state, the lazy Run branch, the guarded Back, the tile's action band); FD1–FD5 resolve the one design call (an entry hint, read once) and the one reachable-on-mount hole, so the work is a link, a prop, a seed, one in-render adjust and tests over existing patterns
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 37s | 37s | 12 | 1,649 | 4,523 | 309,898 | 316,082 |
| Step 1 — create-story | opus-5 | 4 | 19m 20s | 19m 20s | 500 | 134,346 | 1,406,469 | 30,579,855 | 32,121,170 |
| Step 2 — dev-story | sonnet-5 | 1 | 53m 30s | 53m 30s | 894 | 113,789 | 797,556 | 115,709,236 | 116,621,475 |
| Step 3 — code review + PR | opus-5 | 4 | 31m 41s | 31m 41s | 416 | 108,836 | 1,250,597 | 23,607,024 | 24,966,873 |
| _of which the orchestrator_ | opus-5 | — | — | — | 48 | 10,660 | 24,616 | 1,366,599 | 1,401,923 |
| **Total (create-story → PR ready)** | | 9 | **1h 45m** | 1h 45m | 1,822 | 358,620 | 3,459,145 | 170,206,013 | **174,025,600** |

Run started 2026-09-17 10:21 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
