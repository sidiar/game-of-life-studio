---
baseline_commit: 734aea5
---

# Story 1.12: Gallery Empty State

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a first-time user,
I want an inviting, self-explanatory empty Gallery,
so that I understand what the app is and what to do first without a tutorial.

## Acceptance Criteria

1. **Given** a workspace with zero battles (production first run), **When** the Gallery loads, **Then** a designed empty state renders with a visual, a "what is this app" explanation, and the "Create Your First Battle" prompt copy (NFR-4.1, FR-7.4 prompt)
2. **And** per the no-dead-affordance rule, the create action button ships when the battle editor exists (wired in Epic 2) — Epic 1 ships the designed layout and copy
3. **And** the empty state disappears when the first battle exists and reappears if all battles are deleted
4. **And** the view passes the axe check in Clinical Lab

> ⚠️ **`'No battles yet.'` is a load-bearing hydration signal in 10 assertions across 9 tests, not a
> stray string.** `BattleGallery.tsx:184` renders it today as an explicit placeholder for this story.
> Four **e2e** assertions (3 tests) and six **unit** assertions (6 tests) use it as the proof that
> React has hydrated — because it is
> absent from the prerendered HTML (which says "Loading battles…") and only reachable once
> `useWorkspaceSeed`'s effect *and* `BattleGallery`'s load effect have both run. Two of those e2e
> tests then assert `expect(errors).toEqual([])`; `appShell.spec.ts:28-39` carries an explicit
> ⚠️ comment saying the console-error assertion was *racing hydration* until this wait was added.
> **Deleting the string without retargeting every call site does not fail loudly — it silently
> restores that race.** Task 3 enumerates all nine. This is the single most likely way to ship a
> green `npm run ci` that has stopped checking what it claims to check.

## Tasks / Subtasks

- [x] **Task 1: `<GalleryEmptyState>` — the designed empty state** (AC: 1, 2)
  - [x] New file `apps/web/components/GalleryEmptyState.tsx`, `'use client'` (the repo's convention
        for every `styled()` component: `AppShell`, `AppNav`, `BattleTile` all declare it even where
        the parent already has). No props — it renders fixed copy and nothing else.
  - [x] Structure, mapped 1:1 onto the mockup's four classes (clinical CSS at
        `clinical-lab-theme/battle-gallery.html:425-451`; the only rendered markup for those classes
        anywhere is the commented-out block at `biotech-terminal-theme/battle-gallery.html:961-966`,
        which is where the `∅` glyph and the copy shape come from):

    ```tsx
    <EmptyState>
      <EmptyIcon aria-hidden="true">∅</EmptyIcon>   {/* .empty-state-icon */}
      <EmptyTitle>No Battles Yet</EmptyTitle>        {/* .empty-state-title, an <h2> */}
      <EmptyDescription>…what this app is…</EmptyDescription>
      <EmptyPrompt>…the FR-7.4 prompt…</EmptyPrompt>
    </EmptyState>
    ```

  - [x] Styling from the mockup, tokens only (AR-46 — no hex, no `rgba()`; `opacity` is not a colour
        and needs no token):

    | Element | Mockup | Values |
    |---|---|---|
    | `EmptyState` (`div`) | `.empty-state` | `textAlign: center`, `padding: '80px 20px'`, `color: var(--gol-text-secondary)` |
    | `EmptyIcon` (`div`) | `.empty-state-icon` | `fontSize: 64px`, `marginBottom: 20px`, `opacity: 0.3` |
    | `EmptyTitle` (`h2`) | `.empty-state-title` | `fontSize: 24px`, `fontWeight: 600`, `margin: '0 0 12px'`, `color: var(--gol-text-primary)` |
    | `EmptyDescription` (`p`) | `.empty-state-description` | `fontSize: 14px`, `maxWidth: 400px`, `margin: '0 auto 16px'` |
    | `EmptyPrompt` (`p`) | (no mockup class — the mockup's 30px gap sat above the button) | `fontSize: 14px`, `maxWidth: 400px`, `margin: '0 auto'`, `color: var(--gol-text-primary)` |

  - [x] **The title is an `<h2>`.** The page's only `<h1>` is "Battle Gallery" (`BattleGallery.tsx`
        `SectionTitle`); an `<h3>` would skip a level, which axe's `heading-order` *does* check.
        ⚠️ This is what breaks `BattleGallery.test.tsx`'s `queryAllByRole('heading', { level: 2 })`
        `.toHaveLength(0)` assertion — Task 3 retargets it, it is not evidence the `<h2>` is wrong.
  - [x] **No `<button>`, no `<a>`, no `role="button"`, nothing focusable** (AC2). The prompt is
        sentence text. Do not style it as a button — a button-shaped element that does nothing is
        the exact dead affordance NFR-4.1 and Story 2.2's AC forbid.
  - [x] Copy — **write real product copy, and record the exact strings in the Dev Agent Record**.
        Proposed, satisfying "a visual + a what-is-this-app explanation + the FR-7.4 prompt":
    - title: `No Battles Yet`
    - description: `Game of Life Studio is a workspace for cellular battles: a grid where several
      organisms, each with its own rules for birth, survival and death, compete for space one
      generation at a time.`
    - prompt: `Create your first battle to begin.`

        ❌ **No meta or roadmap copy in shipped UI** — "the editor arrives in the next release",
        "coming soon", "not yet implemented". The intermediate state is a project fact, not a
        sentence the user reads.

- [x] **Task 2: Wire it into `BattleGallery`** (AC: 1, 3)
  - [x] `apps/web/components/BattleGallery.tsx:180-185` — replace the placeholder `<StatusText>No
        battles yet.</StatusText>` (and its "Story 1.12 owns this" comment) with
        `<GalleryEmptyState />`. **Replace, do not merge** — the placeholder comment says so.
  - [x] **The render condition is unchanged:** `state.kind === 'ready' && state.summaries.length === 0`.
        Both halves are load-bearing:
    - `state.kind === 'ready'` is what keeps the empty state out of the prerendered HTML and out of
      the `loading` and `error` bodies. Dropping it silently kills the Task 3 hydration signal *and*
      shows "No Battles Yet" while the workspace is still seeding.
    - `summaries.length`, **not** `tiles.length`: `tiles` is the de-duplicated, sorted projection.
      They agree today, but the empty state must key off "storage holds no battles", not off a
      derived array a future filter could empty.
  - [x] AC3 needs no new code — it is the same condition, and Story 1.13's delete refreshes
        `summaries`. Prove it with the tests in Task 4, do not add a second code path for it.
  - [x] `StatusText` still has two consumers (`loading`, `error`). Do not delete it.

- [x] **Task 3: Retarget the hydration signal — all 10 call sites** (AC: 1, 3)
  - [x] Pick **one** replacement signal and use it everywhere:
        `getByRole('heading', { level: 2, name: 'No Battles Yet' })` (Playwright) /
        `screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })` (RTL). Role+name, not
        raw text — it survives a copy tweak to the description and asserts the heading level at the
        same time.
  - [x] **e2e — 4 assertions in 3 tests:** `e2e/home.spec.ts:24`, and `:54` + `:67` (both inside the
        one seeding test, before and after the reload); `e2e/appShell.spec.ts:40`. Keep each
        surrounding ⚠️ comment and update it to name the new signal — those comments are why the
        waits exist.
  - [x] **unit — 6 assertions in 6 tests:** `app/page.test.tsx:33`, `:39`, `:96`, `:153`;
        `components/BattleGallery.test.tsx:243`, `:273`.
  - [x] `BattleGallery.test.tsx:245` — `expect(screen.queryAllByRole('heading', { level: 2 }))
        .toHaveLength(0)` was "no tiles rendered"; the empty state now legitimately renders an `<h2>`.
        Retarget to what it meant: `expect(screen.queryAllByRole('article')).toHaveLength(0)`
        (`BattleTile`'s root is `styled('article')`). ❌ Do not "fix" it by making the title a `<p>`.
  - [x] Rename the test at `BattleGallery.test.tsx:236` — it says "renders the placeholder line";
        there is no placeholder any more.

- [x] **Task 4: Tests** (AC: 1, 2, 3, 4)
  - [x] New `apps/web/components/GalleryEmptyState.test.tsx`:
    - the `<h2>`, the description and the prompt are all on screen
    - the icon is `aria-hidden` (query the DOM node; it must not be reachable by role or name)
    - **AC2, the no-dead-affordance guard:** `queryAllByRole('button')`, `queryAllByRole('link')`
      **and** `container.querySelectorAll('button, a, [role="button"], [tabindex]')` are all empty.
      Model it on `appShell.spec.ts:26`'s "exactly one nav link" — that is this project's shape for
      proving an affordance is absent, and it is the assertion Story 2.2 will deliberately flip.
    - `const results = await axe(container); expect(results.violations).toEqual([])`
  - [x] `BattleGallery.test.tsx` — the retargeted zero-battles test now asserts the *designed* state
        (heading + description + prompt present, zero `article`s), and the existing three-body axe
        test's empty branch keeps covering it.
  - [x] **AC3, both directions, in one test** (the AC's own wording): render with one seeded battle →
        assert a tile and **no** "No Battles Yet"; then a second render against a repository with
        zero battles → assert the empty state. Use `createFakeRepositories({ battles: … })` from
        `@gol/test-utils` — never hand-roll a fake repo.
  - [x] `app/page.test.tsx` — retargets only. Do not add page-level empty-state assertions; the
        component test owns them.

- [x] **Task 5: e2e — the empty state is the production default** (AC: 1, 2, 4)
  - [x] `e2e/home.spec.ts` is already the production-empty-workspace proof: the e2e serves the
        static export, so the AR-45 dev fixtures are never seeded and `/` is empty with no
        `seedWorkspace()` call at all. Extend the existing "renders the real Battle Gallery, empty"
        test rather than adding a spec file:
    - the `<h2>` "No Battles Yet", the description and the prompt are visible
    - **AC2 in a real browser:** the empty-state container has zero buttons and zero links
    - `expect(errors).toEqual([])` stays *after* those waits
  - [x] The existing `has no axe accessibility violations` test in the same file now covers the
        empty state in a real browser at no extra cost — this is where `colour-contrast` is actually
        evaluated (jsdom has no layout, so the vitest-axe run skips contrast entirely). Add a comment
        saying so; do not duplicate the run.
  - [x] `e2e/appShell.spec.ts` — signal retarget only.

- [x] **Task 6: Verify** (AC: all)
  - [x] `npm run build:standalone`, then **`grep -c "No Battles Yet" apps/web/out/index.html` must
        print `0`.** This is the only check that proves the new hydration signal is still absent from
        the prerendered HTML. A non-zero count means the empty state leaked into the static render
        and every retargeted wait in Task 3 is now satisfied pre-hydration — green, and no longer
        checking anything. Record the command and its output.
  - [x] `npm run ci` — full gate, **exit code recorded, not piped**. ⚠️ `npm run ci | tail` reports
        *tail's* status; redirect to a file and echo `$?`.
  - [x] `npm run bundle:check` — baseline is **288.0 KB / 300 KB gzip (12.0 KB headroom)** after
        Story 1.11's review pass. Record the new number.
  - [x] Report the per-package test counts (`web` was **305**) and the e2e count (**44** across the
        four-project matrix), so a reviewer can see tests were added rather than moved.

### Review Findings

_Code review 2026-08-13 (three parallel layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor,
against `734aea5..e0e8fcb`). 1 decision, 10 patches, 4 deferred, 7 dismissed as noise._

_**All 11 patches applied 2026-08-13.** Verification: `npm run ci` **exit 0** (redirected to a file,
exit code echoed separately — not piped). `@gol/test-utils` 75, `@gol/domain` 85, `@gol/persistence`
82, `web` **311 passed / 27 files** (unchanged — every patch tightened existing assertions or
comments; none added a test). e2e **44 passed** across the full four-project matrix, including both
axe runs now gated behind the new hydration wait. Bundle **288.2 KB / 300 KB gzip**, unchanged —
no patch touched shipped markup, only comments and tests._

_**Three patches were falsification-checked** (1.11 review pattern), each reverted after: (1)
title-casing the prompt to `Create Your First Battle` — the exact regression
`GalleryEmptyState.tsx`'s own comment forbids — turns the AC1 test **red**, where the previous
`/create your first battle/i` match accepted it; (2) removing `aria-hidden` from the glyph turns the
forced-decision-3 test **red**, where the deleted `queryByRole('img')` line could not; (3) adding
`<input type="button" value="Create Your First Battle">` turns the AC2 test **red**, where the
previous `'button, a, [role="button"], [tabindex]'` selector passed it straight through._

_Two layer claims were **rejected on direct verification** and are recorded here so they are not
re-raised: (a) the Blind Hunter asserted axe-core excludes `aria-hidden` subtrees from
`color-contrast` — false, the rule declares `excludeHidden: false` (`node_modules/axe-core/axe.js`,
`id: 'color-contrast'`), and the glyph escapes via the `ignoreUnicode`/`textIsEmojis` path exactly as
this story's Dev Notes describe (`∅` U+2205 ∈ `∀-⋿`, `◉` U+25C9 ∈ `■-◿` in
`getUnicodeNonBmpRegExp()`); the story's cited reasoning holds. (b) The Acceptance Auditor computed
the web test count as 310 and called the recorded 311 impossible — `npx vitest run` in `apps/web`
reports **311 passed, 27 files**, so 311 is correct; the off-by-one is in *Story 1.11's* recorded
baseline (305 → actually 306), captured as a defer item below._

**Decision resolved** _(Sidiar, 2026-08-13)_

- [x] [Review][Decision] **AC3's "reappears if all battles are deleted" has no reachable code path,
      and the test cannot detect that** — `BattleGallery.tsx:87-135` calls `refresh()` once per
      effect run and the dep array `[battles, organisms, settings, seedStatus]` is stable after mount
      (`app/page.tsx` memoises the repositories; `seedStatus` settles at `'ready'`). A mounted gallery
      can therefore never transition `summaries.length > 0 → 0`. The AC3 test
      (`BattleGallery.test.tsx:258-292`) substitutes `unmount()` + a second `render()` against a fresh
      empty repo, so its second half is path-identical to the AC1 test at `:232-253` and passes for a
      reason unrelated to any transition. The story explicitly prescribed this ("AC3 needs no new
      code… do not add a second code path"), so the code follows spec.
      **Resolution: defer the mechanism, reword the test.** The re-list edge is Story 1.13's to build
      (it is forced by the delete flow anyway) and is tracked in `deferred-work.md`; the test's name
      and comment are corrected now so they stop claiming to prove reactivity they do not exercise.
      Folded into the patch list as the last entry.

**Patches**

- [x] [Review][Patch] **The axe e2e run never waits for hydration, so AC4 may be scanning the
      pre-hydration body** [`apps/web/e2e/home.spec.ts:40-44`] — `await page.goto('/')` resolves at
      `waitUntil: 'load'`, i.e. against the prerendered HTML, which the Task 6 gate proves contains
      no empty state (`grep -c "No Battles Yet" out/index.html` → 0; it says "Loading battles…").
      `analyze()` then runs with no wait. The other two tests in this file were given explicit
      hydration waits for exactly this reason. This is the only place `themes.css` is applied and
      `color-contrast` actually runs, so the empty state's contrast coverage is a race that reports
      green either way. `apps/web/e2e/appShell.spec.ts:63-67` has the identical gap. Fix: add
      `await expect(page.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeVisible();`
      before `analyze()`. _(edge+auditor)_
- [x] [Review][Patch] **Wrong WHY comment: claims a "real contrast evaluation" that provably does not
      happen, and cites a note that does not exist** [`apps/web/e2e/home.spec.ts:34-39`] — the comment
      says this is where "the empty state's decorative glyph gets a real contrast evaluation", then
      two lines later correctly says the glyph lands in axe's `incomplete` bucket. Both cannot be
      true: `incomplete` is precisely *not* an evaluation, and the test destructures only
      `{ violations }`, discarding `incomplete` entirely. It also points at "that file's
      silent-failure-trap note" in `GalleryEmptyState.test.tsx`, which contains no such note — the
      word "incomplete" appears nowhere in its 44 lines. Project rule: a wrong WHY is worse than none.
      _(blind+auditor)_
- [x] [Review][Patch] **"every value below comes from the clinical CSS" is false**
      [`apps/web/components/GalleryEmptyState.tsx:8-9`] — `EmptyPrompt` has no clinical source at all
      (its own comment at `:40-42` says "No mockup class for this line", contradicting the header),
      and `.empty-state-description` in the mockup is `margin-bottom: 30px` against the shipped
      `margin: '0 auto 16px'`. The 16px **is** what Task 1's table prescribes, so the code is
      spec-compliant — the blanket comment and the Dev Agent Record's "confirmed matching by direct
      comparison" are the inaccuracy, and the deliberate 30px→16px departure from the UX-DR18 mockup
      went unrecorded. _(blind+auditor)_
- [x] [Review][Patch] **The e2e AC2 guard can pass vacuously** [`apps/web/e2e/home.spec.ts:28-30`] —
      `page.locator('h2', { hasText: 'No Battles Yet' }).locator('..')` is never asserted non-empty,
      and `toHaveCount(0)` on a locator whose ancestor matches nothing is a pass, not a failure. The
      `..` scope is also structurally derived: it is the whole empty state only because `EmptyTitle`
      happens to be a direct child of `EmptyState`. Wrap the h2 in any container and the scope
      silently narrows, leaving a CTA added elsewhere in the empty state uninspected. Unlike the unit
      test it also omits `[role="button"]` and `[tabindex]` — the two shapes Story 2.2 is most likely
      to introduce first. Fix: anchor with
      `await expect(emptyState).toContainText('Create your first battle to begin.');` after deriving
      the scope. _(blind+edge+auditor)_
- [x] [Review][Patch] **`queryByRole('img')` is a test that cannot fail**
      [`apps/web/components/GalleryEmptyState.test.tsx:22`] — `EmptyIcon` is a `styled('div')`, and a
      `<div>` has no implicit ARIA role, so the query returns null regardless of the component. RTL's
      `queryByRole` additionally defaults to `hidden: false`, excluding `aria-hidden` subtrees — so
      even `role="img"` on the glyph would still pass. Satisfied by the environment, not the code;
      the load-bearing lines are the `querySelector('[aria-hidden="true"]')` / `textContent` pair
      below it. This is the exact "tests that cannot fail" pattern the 1.11 review produced 20 patches
      for. _(blind)_
- [x] [Review][Patch] **The no-focusable-control selector is narrower than its own title claims**
      [`apps/web/components/GalleryEmptyState.test.tsx:34-36`] — the test says "no button, link, or
      other focusable control" but checks `'button, a, [role="button"], [tabindex]'`, missing `input`,
      `select`, `textarea`, `summary`, `[contenteditable]`, `area[href]`, and interactive roles other
      than `button`. An `<input type="button" value="Create Your First Battle">` leaves all three
      assertions green. Conversely `[tabindex]` matches `tabindex="-1"`, which is not tab-focusable —
      simultaneously too narrow for the claim and too broad for the mechanism. _(blind+edge)_
- [x] [Review][Patch] **The title-case regression the component comment explicitly forbids is
      asserted nowhere** [`GalleryEmptyState.test.tsx:15`, `BattleGallery.test.tsx:248`,
      `e2e/home.spec.ts:26`] — `GalleryEmptyState.tsx:53-54` states the prompt ships as sentence text
      because "a title-cased standalone line here would read as a dead button", yet every assertion on
      that copy is `/create your first battle/i`. Rewriting `EmptyPrompt` to the standalone
      title-cased `Create Your First Battle` — the precise regression named — passes all three, and
      the button/link checks do not fire because it is still a `<p>`. Relatedly, no test asserts the
      description and prompt are *different* elements, so merging them back into one `<p>` (undoing
      the entire stated rationale for `EmptyPrompt`) also stays green. Fix: assert the exact string in
      at least the unit test. _(edge+blind)_
- [x] [Review][Patch] **Comment attributes a test-file change to the component file**
      [`apps/web/components/BattleGallery.test.tsx:76`] — "(GalleryEmptyState.tsx retargets that check
      to what it actually meant)". `GalleryEmptyState.tsx` is presentational and knows nothing about
      this assertion; the retarget is on the next line of this test file. Sends the reader to the
      wrong file. _(blind)_
- [x] [Review][Patch] **`toBeGreaterThan(0)` where an exact count was available**
      [`apps/web/components/BattleGallery.test.tsx:271`] — the fixture
      `createFakeRepositories({ battles: createMockBattles() })` has a known size; a regression
      rendering 1 tile of N passes. This assertion is also what establishes `article` as a valid proxy
      for "a tile", so weakening it weakens the retargeted zero-check. _(blind)_
- [x] [Review][Patch] **Two Dev Agent Record accuracy defects** [`1-12-gallery-empty-state.md`] — (a)
      the falsification-check quote reads `expected [ <button></button> ] to have a length of +0`, an
      *empty* button, where the check described adding `<button>Create New Battle</button>`; as
      written it reads reconstructed rather than pasted. The assertion itself is genuinely falsifiable,
      so this is a record-accuracy issue, not a test defect. (b) "Agent Model Used: claude-opus-5"
      against commit `e0e8fcb`'s `Co-Authored-By: Claude Sonnet 5` trailer — the implementation was
      Opus 5's and only the commit was made by Sonnet 5; the trailer should say so or the record
      should. _(auditor)_

- [x] [Review][Patch] **The AC3 test's name and comment claim a transition it does not exercise**
      [`apps/web/components/BattleGallery.test.tsx:255-292`] — resolution of the decision item above.
      The test is titled "shows a tile and hides the empty state with a battle, and **shows the empty
      state again** with none" and its comment says it "proves the render condition already **reacts**
      correctly", but it performs `render()` → `unmount()` → `render()`: two independent mounts of two
      component instances against two fixtures, with no state change and nothing re-rendering. Reword
      both to state plainly that this is two separate mounts, that `BattleGallery` has no re-list path
      after mount, and that Story 1.13's delete flow owns the transition — pointing at the
      `deferred-work.md` entry. Do **not** change the assertions; the coverage is what the story
      prescribed. _(blind+edge)_

**Deferred**

- [x] [Review][Defer] **AC3's live transition has no re-list mechanism; Story 1.13 must add one**
      [`apps/web/components/BattleGallery.tsx:87-135`] — deferred by decision, tracked for Story 1.13.
- [x] [Review][Defer] **Ten surviving assertions still equate "level-2 heading count" with "tile
      count"** [`BattleGallery.test.tsx:116,378,412,459,504`, `app/page.test.tsx:128`,
      `e2e/gallery.spec.ts:83,151,198,227`] — deferred, all are populated-gallery paths where the
      empty state does not render, so every count is correct today.
- [x] [Review][Defer] **`loadState: 'error'` is terminal, so an error → empty transition can never
      reach the empty state** [`apps/web/components/BattleGallery.tsx:122-124,140-142`] — deferred,
      pre-existing from Story 1.10.
- [x] [Review][Defer] **No announcement when the async loading → empty transition completes**
      [`apps/web/components/BattleGallery.tsx:181`] — deferred, pre-existing; the replaced
      `StatusText` was a bare `styled('p')` with no `role`/`aria-live` either, so nothing was lost.
- [x] [Review][Defer] **Story 1.11's recorded `web` test baseline of 305 is off by one** — deferred,
      pre-existing doc error in a closed story.

**Dismissed as noise (7):** the two verification-rejected claims described above (axe `aria-hidden`
exclusion; the 310-vs-311 count), plus — `article` coupling to `BattleTile`'s root (Edge verified it
is self-guarded by the `getAllByRole('article')` assertion at `:271`); `EmptyDescription`/`EmptyPrompt`
being near-duplicate styled objects (deliberate, prescribed value-by-value in Task 1's table);
hardcoded px dimensions alongside colour tokens (AR-46 governs colour only, the repo has no spacing
or type token scale, and Task 1 prescribes these exact values); `StatusText`'s semantics being
"silently discarded" (verified: it carries none); and requirement-ID / mockup line-number citations
being brittle (this is the project's documented commenting convention).

## Dev Notes

### Decisions this story is forced to make (flag them in the Dev Agent Record)

1. **⚠️ The FR-7.4 "prompt" ships as sentence text, not as a control.** AC1 requires the "Create Your
   First Battle" prompt copy; AC2 forbids the button until Story 2.2. A title-cased standalone line
   ("Create Your First Battle") reads as a button label and invites a click that does nothing — a
   dead affordance in everything but markup. The proposed resolution is a plain sentence
   ("Create your first battle to begin."), with the title-cased phrase becoming 2.2's button label.
   State the exact strings you shipped and why in the Dev Agent Record.

2. **⚠️ The empty state is a new component file, not styled blocks inside `BattleGallery`.**
   `BattleGallery.tsx` is already ~200 lines carrying the load effect, three view states and two
   memos, and Story 1.13 adds a delete flow plus a dialog to it. Story 2.2 has to reach into this
   markup to add the CTA. A named file with its own test is the cheaper thing for both. It also
   mirrors the shipped shape (`BattleTile`, `PetriDishCanvas`, `AppNav` are each their own file).

3. **⚠️ The decorative glyph carries no accessible name.** `aria-hidden="true"`, matching
   `AppShell.tsx:51`'s `<LogoAccent aria-hidden="true">◉</LogoAccent>`. Every fact the visual conveys
   is already in the adjacent heading and paragraph, so a name would be a duplicate announcement.
   Flag it so a reviewer reads it as a decision, not an omission.

4. **⚠️ `SectionSubtitle` ("Your saved cellular competitions") still renders above the empty state,**
   describing a collection that does not exist. The mockup keeps the section header in every state
   and no AC covers it. **Leave it**; note it so it is not re-raised as an oversight. If it is
   changed, that is a UX decision, not a drive-by edit.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

1. **⚠️ NFR-4.1 "no dead affordances" vs. AC1's "Create Your First Battle" prompt.** The prompt tells
   the user to do something Epic 1 gives them no way to do. This is *resolved in the epic itself*,
   not open: AC2 states the button ships with the editor, and `epics.md:550` (Story 2.2) says "the
   Story 1.12 empty-state CTA is now live — the no-dead-affordance gap closes here". So the gap is a
   sanctioned, tracked intermediate state. **Resolution: ship the copy, ship no control**, and do not
   paper over it with roadmap text. Nothing to escalate — recorded so the reviewer does not re-open it.

2. **⚠️ The clinical mockup styles `.empty-state` but never renders it.** The clinical theme file has
   the CSS block (`battle-gallery.html:425-451`) and no matching markup; the only markup — and the
   only copy and glyph — is a commented-out block in the *biotech* file (`:961-966`), which is the
   Epic 6 theme. **Resolution: take the structure and copy shape from the biotech block, take every
   value from the clinical CSS**, exactly as Stories 1.10/1.11 resolved the same split. The `∅`
   glyph is theme-neutral; Story 6.1 restyles the tokens, not the markup.

3. **⚠️ PRD FR-7.4 says "a large 'Create Your First Battle' button"** (`prd.md:24`, David's journey).
   Superseded for Epic 1 by the epic's AC2 sequencing. The button is Story 2.2's; the PRD sentence
   describes the finished product, not this story's slice.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **The hydration-signal retarget (Task 3) fails silently in both directions.** Miss a call site →
  a red test that names a string nobody renders (loud, fine). Render the empty state in the
  prerendered HTML → every wait resolves on the server markup, the `expect(errors).toEqual([])`
  assertions go back to racing hydration, and everything is green. The `grep` in Task 6 is the only
  guard against the second one.
- ⚠️ **Moving the empty state out from behind `state.kind === 'ready'` looks like a simplification.**
  `summaries.length === 0` is also true while `loadState` is `idle`. The condition is two clauses
  because the first render, the seeding window and the static prerender all have zero battles and
  none of them is the empty *state*.
- ⚠️ **`getComputedStyle` returns `''` for every `--gol-*` under jsdom** — `app/themes.css` is never
  loaded there. Nothing in this story reads a token from JS, so this only matters if you reach for
  one: don't. All colour goes through `var(--gol-*)` in the styled objects, where an unresolved token
  is a rendering concern, not a runtime `null`.
- ⚠️ **axe's `color-contrast` rule has `excludeHidden: false` and its matcher does not skip
  `aria-hidden`** — an `aria-hidden` element is still evaluated (verified in
  `node_modules/axe-core/axe.js:32190-32194`, `:28182-28196`). The icon at `opacity: 0.3` on
  `--gol-text-secondary` composites to roughly `#353535` on `#0a0a0a` (≈1.9:1), which would be a
  serious violation for text. It escapes because `ignoreUnicode: true` is on by default and
  `textIsEmojis()` matches any node whose visible text is *only* non-BMP-range symbols — `∅` (U+2205)
  and `◉` (U+25C9) both fall inside axe's `∀-⋿` / `■-◿` ranges — so the rule
  returns `undefined`, landing the node in **`incomplete`**, not `violations` (`axe.js:26800-26805`,
  `:26941-26948`, `:16686`). Two consequences: an `incomplete` entry for the icon is expected and is
  not a failure (the specs assert on `violations`), and **the moment the glyph is replaced by a Latin
  letter, a word, or an inline SVG with a `<title>`, the exemption evaporates and the 0.3 opacity
  becomes a real violation.** If you change the visual, re-run the e2e axe test and check.
- ⚠️ **`vitest-axe`'s `toHaveNoViolations` matcher is deliberately not wired** (`vitest.setup.ts:5-8`
  — its types conflict with `tsc`). Use `const results = await axe(container);
  expect(results.violations).toEqual([])`.
- ⚠️ **Do not reach for MUI components for this.** `<Box>`/`<Typography>`/`<Stack>`/`<Button>` all
  pull Material defaults that have to be overridden straight back off to match the mockup, on 12.0 KB
  of headroom. `styled()` on plain elements is the shipped convention for all static chrome
  (`AppShell.tsx:7-11` records the ~9 KB this reasoning saved once already), and RFC-003 Decision 3
  says static chrome goes through `styled()`, not `sx`.
- ⚠️ **AR-46 is a lint rule, and it only sees `.ts`/`.tsx`.** No hex, no `rgba()`, no named colour in
  the styled objects — `var(--gol-*)` only. Nothing in this story needs a new token; if you find
  yourself authoring one, re-read the table in Task 1.
- ⚠️ **`npm run ci` is where this surfaces, not `npm test`.** This story edits two e2e specs and the
  page-boundary test; the unit run alone cannot see any of it.

### Previous story intelligence (1.9–1.11)

- **1.11 (thumbnails, done 2026-08-12):** 20 review patches, and **most of them were tests that could
  not fail** — vacuous spies, guards satisfied by the jsdom environment rather than by the component,
  stubs torn down in the test body so one red test became one red plus one false green. The
  equivalent risk here is Task 3: a retargeted wait that resolves against server-rendered markup is
  exactly that failure mode. Two 1.11 patches were validated by *reverting the code they guard* and
  confirming the test went red — do the same for the AC2 no-affordance assertion (add a `<button>`
  to `GalleryEmptyState`, confirm the test fails, remove it).
- **1.10 (Gallery, done 2026-08-08):** established `page.tsx` → `<BattleGallery>` (owns load + view
  state) → `<BattleTile>`; repositories arrive as props typed to the interfaces. It also shipped the
  placeholder line this story replaces, with a comment naming this story and saying *replace, not
  merge*. Its own review produced 19 patches, most of the form "the schema permits it and the UI
  assumed it didn't" — the empty state has no data inputs at all, which is why this story is small.
- **1.9 (theme + shell):** three **wrong WHY comments** were found in review, and the project treats a
  wrong WHY as worse than none. The axe/unicode claim above is the one to be careful with here —
  it is verifiable against `node_modules/axe-core/axe.js`; if you restate it, restate what you ran.
  1.9 also set the `<h1>`/wordmark split and the `aria-hidden` decorative-glyph precedent.
- **Conventions:** comments explain WHY and cite the governing id (`(NFR-4.1)`, `(FR-7.4)`,
  `(AR-46)`); no review artefacts in code; components PascalCase `.tsx`, non-component TS camelCase
  and never dotted; `@/components/…` / `@/lib/…` aliases; **commit gate stands** — present the file
  list and a suggested message, then wait for Sidiar.

### Git intelligence

Baseline `734aea5` ("Story 1.11: apply code review fixes"). Recent shape: `734aea5`, `06ba795`
(Story 1.11), `41248b5` (1.10 review fixes), `a6afbfb` (1.10 mockup restore), `9fe64f5` (1.10).

- The two-or-three-commit rhythm per story is normal here — implementation, then the code-review
  patch pass. Do not treat the first green `npm run ci` as the end.
- Message convention: `Story 1.12: Gallery Empty State`, follow-ups as
  `Story 1.12: apply code review fixes`.
- The working tree at baseline carries unrelated modifications (`.claude/settings.local.json`, a
  deleted `.claude/scheduled_tasks.lock`). They are **not** this story's and must not appear in its
  File List.

### Latest technical information

**No new dependency — that is a requirement, not an omission.** Everything is installed and was
exercised in 1.9–1.11: MUI **9.3.1** + Emotion 11.14.x, Next **16.2.10**, React **19.2.7**,
TypeScript 5.9.3, Vitest 4.1.10, Playwright 1.62.1, axe-core 4.12.1. Version policy is
caret-on-current-stable — **do not bump anything opportunistically** in a story with 12.0 KB of
bundle headroom. Two platform notes that bear on this story specifically:

- **`page.goto` defaults to `waitUntil: 'load'`,** which resolves against server-rendered HTML. Every
  Playwright assertion that can be satisfied by the prerender *will* be, on its first poll. That is
  why the hydration wait exists and why its replacement has to be a string the prerender does not
  contain.
- **axe-core 4.12.1 ships `target-size` as `enabled: false`,** so nothing automated checks hit-area
  size. Irrelevant here (this story adds no interactive target) but it is why the 1.10 organism-dot
  target-size gap is a deferred item rather than a caught one — do not assume a clean axe run means
  "no a11y issues", only "none of the enabled rules fired".

### What NOT to build (scope boundaries)

- ❌ **Any create/new-battle control** — button, link, `role="button"`, or a clickable div. Story
  **2.2** wires `/battle/new` and turns this copy into a live CTA (`epics.md:549-550`).
- ❌ **Any route.** `/` is still the only route; `/battle/[id]` is Story 2.1, `/settings` is Epic 5.
- ❌ **The delete flow, the `⋮` action menu, or any Dialog** — Story **1.13**. AC3's "reappears if all
  battles are deleted" is proven here by *rendering against a zero-battle repository*, not by
  building deletion.
- ❌ **Toolbar, search, sort dropdown, battle count** — present in the mockup, none of them in an
  Epic 1 AC. `sortByLastModified` is fixed-order by design (1.10).
- ❌ **A second `[data-theme]` token block, or any Biotech styling.** Story **6.1**, and per
  `project-context.md#Token layer shape` it must be an override block, not a second complete set.
- ❌ **New `--gol-*` tokens.** Every value this story needs already exists.
- ❌ **Touching `BattleTile`, `PetriDishCanvas`, the renderer, or any `lib/` module.** The tile path
  is not on this story's critical path; a diff there is a regression surface with no AC behind it.
- ❌ **`packages/*` changes of any kind.** No schema, no repository, no domain constant. This is
  presentation only — `apps/web` holds UI and wiring only.

### Project Structure Notes

```
apps/web/
  components/
    GalleryEmptyState.tsx       'use client' — icon + h2 + description + prompt, no control  [new]
    GalleryEmptyState.test.tsx  copy, aria-hidden icon, zero focusable elements, axe         [new]
    BattleGallery.tsx           placeholder StatusText -> <GalleryEmptyState />              [modify]
    BattleGallery.test.tsx      signal retarget; h2-count -> article-count; AC3 both ways    [modify]
  app/
    page.test.tsx               signal retarget x4                                           [modify]
  e2e/
    home.spec.ts                signal retarget x3; designed-copy + no-affordance assertions [modify]
    appShell.spec.ts            signal retarget x1                                           [modify]
```

`apps/web` holds UI and wiring **only**, and this story is entirely presentational: nothing enters
`packages/domain`, `packages/simulation` or `packages/persistence`, **no package has a coverage gate
this story can trip** (`apps/web` is deliberately ungated — the coverage flip is Story 3.7), and
there is no `eslint.config.mjs`, `themes.css`, `theme.ts` or `package.json` change. If your diff
touches a file outside the block above, stop and say why.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.12] — the story statement and four ACs verbatim
- [Source: docs/planning-artifacts/epics.md#Story 1.13 / 2.2] — where delete (`:509-521`) and the live
  CTA (`:549-550`, "the no-dead-affordance gap closes here") land; the scope this story leaves open
- [Source: docs/planning-artifacts/epics.md:101] — **FR-7.4**, the "Create Your First Battle" prompt
- [Source: docs/planning-artifacts/epics.md:135] — **NFR-4.1**, no tutorial required
- [Source: docs/planning-artifacts/epics.md:243] — **UX-DR18**, the Gallery mockups as the visual
  authority; **AR-46** (`:220`), no raw colour literals outside the token file and palette registry
- [Source: docs/planning-artifacts/prds/…/prd.md#FR-7.4] — "When no Battles exist, display a 'Create
  Your First Battle' prompt"; **`prd.md:24`** — the journey sentence describing the finished button
- [Source: docs/planning-artifacts/prds/…/prd.md#NFR-4.1] — self-explanatory interface, no onboarding
- [Source: docs/planning-artifacts/architecture.md#Minor Resolutions] — **M1**: first run seeds
  **zero battles** "so the Gallery shows the 'Create Your First Battle' prompt" — i.e. the empty state
  is the *designed* production first-run view, not an edge case
- [Source: docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md] — Decision 2 (token
  layer, with `project-context.md`'s `:root` override) and Decision 3 (`styled()` for static chrome,
  `sx` only for dynamic values)
- [Source: docs/planning-artifacts/ux-designs/…/clinical-lab-theme/battle-gallery.html:425-451] — the
  `.empty-state` / `-icon` / `-title` / `-description` CSS, the source of every value in Task 1
- [Source: docs/planning-artifacts/ux-designs/…/biotech-terminal-theme/battle-gallery.html:961-966] —
  the only rendered markup for those classes: the `∅` glyph, "No Battles Yet", and the copy shape
- [Source: apps/web/components/BattleGallery.tsx:170-205] — the three view states, the
  `state.kind === 'ready' && state.summaries.length === 0` condition, and the placeholder comment
  naming this story
- [Source: apps/web/components/BattleTile.tsx:41-61, 71-85] — the `styled('article')` root the
  retargeted `queryAllByRole('article')` assertion keys off, and the `<h2>`/`<h1>` heading-level rule
- [Source: apps/web/components/AppShell.tsx:7-11, 20-35, 51] — why static chrome is `styled()` and not
  AppBar/Toolbar (~9 KB), the single-`<h1>` rule, and the `aria-hidden` decorative-glyph precedent
- [Source: apps/web/components/AppNav.tsx:7-9] — `NAV_ITEMS`, the shipped statement of the
  no-dead-affordance rule ("an entry appears here only once its route exists")
- [Source: apps/web/e2e/home.spec.ts:22-26, 51-54, 66-67] — the production-empty-workspace proof, the
  three hydration waits, and the axe run that will now cover the empty state's contrast for real
- [Source: apps/web/e2e/appShell.spec.ts:26, 28-40] — the "exactly one nav link" absence-proof pattern
  to model AC2's guard on, and the ⚠️ comment explaining why the hydration wait exists
- [Source: apps/web/app/page.test.tsx:32-34, 39, 88-97, 149-154] — the four signal call sites and the
  StrictMode regression test that depends on one of them
- [Source: apps/web/components/BattleGallery.test.tsx:236-246, 248-287] — the zero-battles test to
  retarget (including the `heading level 2` count) and the three-body axe test
- [Source: apps/web/vitest.setup.ts:5-8] — why `toHaveNoViolations` is not wired
- [Source: node_modules/axe-core/axe.js:32190-32194, 28182-28196, 26800-26805, 26941-26948, 16686] —
  `excludeHidden: false`, the matcher that does not skip `aria-hidden`, and the `ignoreUnicode` /
  `textIsEmojis` path that puts a symbol-only glyph in `incomplete` rather than `violations`
- [Source: scripts/check-bundle-size.mjs] — the 300 KB gzip gate; **288.0 KB** is the 1.11 baseline
- [Source: docs/implementation-artifacts/1-11-battle-tile-thumbnails.md#Review Findings] — the 20
  patches, and the "tests that cannot fail" pattern Task 4's falsification step exists to avoid
- [Source: docs/implementation-artifacts/deferred-work.md] — nothing here is owed by this story; the
  1.10 "zero placed organisms has no focusable element" entry resolves in **2.2**, not here
- [Source: docs/project-context.md] — injected repositories, no DOM types in `packages/*`, one
  immutable MUI theme, camelCase filenames, the verification-before-done rule, the commit gate

## Dev Agent Record

### Agent Model Used

claude-opus-5 (implementation). Commit `e0e8fcb` was made in a later session by claude-sonnet-5,
which is what its `Co-Authored-By` trailer records — the trailer names the committer, not the
author of the change. The 2026-08-13 code review (three layers + triage) was also claude-sonnet-5.

### Debug Log References

- `npm run build:standalone` then `grep -c "No Battles Yet" apps/web/out/index.html` → `0` (Task 6
  gate: the empty-state heading is confirmed absent from the prerendered HTML, so every retargeted
  hydration wait in Task 3 still requires a real client render to resolve).
- Falsification check (1.11 review pattern, Previous story intelligence): temporarily added a
  `<button>` to `GalleryEmptyState.tsx` and re-ran `GalleryEmptyState.test.tsx` — the AC2
  no-dead-affordance test went red, then reverted. Confirms the test is falsifiable, not
  environment-satisfied. ⚠️ **Corrected in the 2026-08-13 review:** this entry originally quoted a
  specific failure string that did not match the element it described (an empty `<button></button>`
  against a button said to contain "Create New Battle"), i.e. it was reconstructed rather than
  pasted. The check itself was real and re-confirmed during the review; the quote has been dropped
  rather than invented a second time.
- `npx playwright test e2e/home.spec.ts e2e/appShell.spec.ts` across the full 4-project matrix
  (chromium/firefox/webkit/tablet) — **24 passed**, including the real-browser axe run that is the
  only place the empty state's contrast (and the aria-hidden glyph's `incomplete`-not-`violations`
  landing) is actually evaluated.
- `npm run ci` (redirected to a file, exit code echoed separately — not piped): first run caught a
  Prettier formatting issue in the three new/changed test-adjacent files (`prettier --write` applied
  once, then `npm run ci` re-run clean). Final run: **exit 0**.

### Completion Notes List

- **Forced decision 1 (FR-7.4 prompt as sentence, not control):** shipped as written in the story —
  title "No Battles Yet", description explaining the app, and prompt "Create your first battle to
  begin." — sentence case, not the PRD's title-cased button label, specifically so it doesn't read
  as a dead button. The title-cased "Create Your First Battle" phrase is left for Story 2.2's actual
  button label.
- **Forced decision 2 (new component file):** `GalleryEmptyState.tsx` + its own test file, following
  the shipped one-component-per-file shape (`BattleTile`, `AppNav`, `AppShell`). `BattleGallery.tsx`
  only gained one import and a one-line render-condition swap.
- **Forced decision 3 (aria-hidden glyph):** confirmed via the `GalleryEmptyState.test.tsx` test that
  `∅` is not reachable by role or accessible name, and via the real-browser axe run
  (`home.spec.ts`'s "has no axe accessibility violations") that it produces zero violations end to
  end — landing in axe's `incomplete` bucket per the unicode-only-text exemption, not tested directly
  (axe-core's internal categorisation isn't part of the public API surface these specs assert on),
  but the `violations` array being empty is the assertion that actually matters and it holds.
  **Verify-if-changed note recorded, not yet needed:** the glyph was not changed to a letter/word/SVG
  during this story, so the exemption was never exercised — a future story that does needs to re-run
  this e2e axe test.
- **Forced decision 4 (`SectionSubtitle` unchanged):** left as-is; not touched.
- **Spec conflict 1 (NFR-4.1 vs. the prompt):** resolved as specified — copy ships, no control ships.
  Verified structurally by `GalleryEmptyState.test.tsx`'s AC2 test (zero buttons/links/`[tabindex]`)
  and again in a real browser by `home.spec.ts`.
- **Spec conflict 2 (mockup split):** structure/copy taken from the biotech commented-out block,
  styled values from the clinical CSS block, per the story's table in Task 1. ⚠️ **Corrected in the
  2026-08-13 review:** this note originally claimed *every* value was taken from the clinical CSS and
  was "confirmed matching by direct comparison", which is not accurate. Task 1's table itself departs
  from that CSS in two places, and the shipped code follows the table: `EmptyDescription`'s bottom
  margin is **16px** where `.empty-state-description` says **30px** (the mockup's 30px gap sat above
  a button this story does not ship), and `EmptyPrompt` has no mockup class at all. The code is
  spec-compliant; the blanket claim — and the matching comment in `GalleryEmptyState.tsx` — were not,
  and both now record the two departures explicitly.
- **Task 3 (hydration-signal retarget):** all 10 assertions across 9 tests (4 e2e in 3 tests, 6 unit
  in 6 tests) retargeted from `getByText('No battles yet.')` to
  `getByRole('heading', { level: 2, name: 'No Battles Yet' })`. The `BattleGallery.test.tsx:245`
  zero-heading-count assertion was retargeted to a zero-`article`-count assertion (Battle Gallery's
  own tiles, not the empty state's own now-legitimate `<h2>`), and the test at `:231` was renamed
  from "renders the placeholder line" to "renders the designed empty state" to match. The Task 6
  `grep` gate is the guard that this retarget didn't silently start passing against server-rendered
  HTML.
- **Task 4 (AC3 test):** added one new test to `BattleGallery.test.tsx` asserting both directions in
  a single test per the AC's own wording — one seeded battle renders a tile and hides the empty
  state; a second render against a zero-battle repository shows the empty state again. No new
  production code path was needed; the existing `state.kind === 'ready' && state.summaries.length
  === 0` condition already covers it.
- **Scope boundaries respected:** no route, no create/CTA control, no delete flow, no toolbar/search/
  sort, no new `--gol-*` token, no touch to `BattleTile`/`PetriDishCanvas`/the renderer/any `lib/`
  module, and no `packages/*` change — confirmed by the File List below matching the story's Project
  Structure Notes exactly.
- **Verification:** `npm run ci` exit 0. Per-package unit counts: `@gol/domain` 85, `@gol/test-utils`
  75, `@gol/persistence` 82, `web` **311 passed, 0 failed, 27 files** — 5 new `it()` blocks over the
  story's own two touched test files, directly counted: `GalleryEmptyState.test.tsx` is new at 4
  tests, and `BattleGallery.test.tsx` went from 13 to 14 (the one new AC3 test; the retargeted
  zero-battles test is a rename, not an addition). `page.test.tsx` stayed at 7 (retargets only, as
  scoped). ⚠️ **Reconciled in the 2026-08-13 review:** 311 was re-verified by running the suite, but
  it does not reconcile against Story 1.11's recorded `web` baseline of 305 (305 + 5 = 310). The
  discrepancy is in *1.11's* number: the true baseline at `734aea5` is **306**, so 306 + 5 = 311 and
  this story's figure is correct. Tracked in `deferred-work.md`. e2e: **44 passed** across the 4-project matrix (unchanged count — Task 5 extended existing
  tests rather than adding new spec files, matching the story's explicit instruction). Bundle:
  **288.2 KB / 300 KB gzip (11.8 KB headroom)**, up from the 1.11 baseline of 288.0 KB — the
  two-sentence empty-state copy and one new component account for the 0.2 KB delta. `npx eslint
  apps/web` clean except the pre-existing `BattleGallery.tsx` `exhaustive-deps` warning this story
  inherited unchanged (documented in 1.11's own Dev Notes as pre-existing).

### File List

- `apps/web/components/GalleryEmptyState.tsx` — new
- `apps/web/components/GalleryEmptyState.test.tsx` — new
- `apps/web/components/BattleGallery.tsx` — modified (placeholder `StatusText` → `<GalleryEmptyState />`)
- `apps/web/components/BattleGallery.test.tsx` — modified (hydration-signal retarget, renamed/
  retargeted zero-battles test, new AC3 test)
- `apps/web/app/page.test.tsx` — modified (hydration-signal retarget, 4 call sites)
- `apps/web/e2e/home.spec.ts` — modified (hydration-signal retarget, AC1/AC2 designed-state
  assertions, axe-coverage comment)
- `apps/web/e2e/appShell.spec.ts` — modified (hydration-signal retarget, 1 call site)
- `docs/implementation-artifacts/sprint-status.yaml` — modified (story status lifecycle)

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-12 | 0.1 | Story created from epics.md#Story 1.12 | Sidiar |
| 2026-08-12 | 1.0 | Implemented: `<GalleryEmptyState>`, wired into `BattleGallery`, all 10 hydration-signal call sites retargeted, AC3 test added, full `npm run ci` gate green | Claude (claude-opus-5) |
