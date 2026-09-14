---
baseline_commit: 6b1659a39d31a8d4ed02b8f2088e2440c718aa53
---

# Story 4.4: Three-Column Responsive Layout

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the editor organized into clear working columns,
so that basics, rules, and preview are all visible while I author.

## Acceptance Criteria

From `epics.md#Story 4.4: Three-Column Responsive Layout` (`:1029-1039`), decomposed into what a
reviewer can check independently. AC5–AC8 are repo-derived: the obligations the shipped modal
shell (Story 4.3), the bundle gate and the CI gates already impose on "the story that fills the
editor body".

1. **At ≥ 1400px the editor body renders three columns in DOM order Basic Information / Survival
   Rules / Preview & Test, at 320px / flexible / 400px.** `<OrganismEditorLayout>` (new,
   `components/organisms/editor/`) replaces the empty `<EditorBody />` in
   `OrganismEditorModal.tsx:116-122, 201` with three `<section>` landmarks, each named by its own
   `<h3>` (`aria-labelledby`) so it is a `region` with the accessible name `Basic Information`,
   `Survival Rules`, `Preview & Test` (mockup `organism-editor.html:909, 993, 1196` — the `.section-title`
   copy, not the design doc's column labels). Widths per the mockup CSS (`:66-77, 113-129`):
   Basic Information `width: 320px; flex-shrink: 0`, Preview `width: 400px; flex-shrink: 0`, Rules
   `flex: 1; min-width: 0; max-width: 800px; margin: 0 auto` (FD1 — the AC's "~500–600px" is what
   the flexible column measures at the 1400px boundary, and the mockup's 800px cap is the ceiling
   above it). Each column carries the mockup's `<h3>` + `<p>` description under it (the section
   description is design copy, not a placeholder) and **nothing else** — the slots are empty until
   4.5–4.15. (UX-DR5)

2. **The Rules column scrolls independently while the others stay put.** Each column is its own
   scroll container (`overflow-y: auto`, mockup `:81, 116, 127` — FD2 reads "stay put" as *no
   shared scroll*, not *never scrolls*, because the Basic Information column's 4.5–4.9 content
   will be ~700px tall against a 720px Playwright viewport). Scrolling the Rules column moves
   neither the Basic Information nor the Preview region's bounding box, the dialog paper stays
   exactly the viewport, and `document.documentElement.scrollHeight <= clientHeight` throughout.
   Proven in a real browser with a **tall probe node appended to the Rules region via
   `page.evaluate`** (there is no rule content to overflow with until 4.10) — the probe is a
   measurement, never a mock, and is removed before any axe scan. (UX-DR5)

3. **At 1024–1400px the columns compress to 280px / flexible / 350px; below 1024px the layout
   folds to two columns.** Compressed tier per `organism-editor-design.md:642-646`; fold per
   `:648-652` — Basic Information and Survival Rules **stacked** in a single left scroll region,
   Preview & Test on the right at 350px (FD3: one scroll region for the stacked pair, because
   Basic Information alone will fill a tablet's height and a second nested scroll region would
   leave the rules a few pixels). DOM order is unchanged across all three tiers (SC 1.3.2 /
   2.4.3 — CSS only, no conditional rendering, no `useMediaQuery`; FD4). Breakpoints are CSS media
   queries inside `styled()` — `@media (max-width: 1399.98px)` and `@media (max-width: 1023.98px)`
   — so 1400 is full-width and 1024 is compressed, exactly as the AC's ranges read. ⚠️ The four
   Playwright projects run at **1280×720 (desktop) and 1194×834 (tablet)** — every existing e2e
   already sees the *compressed* tier; the ≥ 1400 tier and the fold need one-off
   `page.setViewportSize` calls (the Story 2.12 precedent, `battleRoute.spec.ts:936-946`), never a
   fifth project. (UX-DR5, NFR-3.1)

4. **The fold tier is a graceful degradation, not a supported layout.** NFR-3.1 sets the minimum
   supported width at 1024px (`prd.md:615-616`), so < 1024 gets one e2e smoke check (regions
   positioned as FD3 says, no horizontal document overflow) and no axe run of its own; the
   compressed and full tiers get the real assertions. Nothing in the fold may *hide* a region —
   all three stay in the accessibility tree at every width. (NFR-3.1, NFR-3.2)

5. **axe passes with the modal open, in jsdom and in all four Playwright projects.** vitest-axe
   on `<OrganismEditorLayout>` alone and on `<OrganismEditorModal open origin="library">` → `[]`;
   `@axe-core/playwright` on the served `/organisms` with the dialog open and settled
   (`openEditor`'s container-opacity wait) → `[]` at the projects' default viewport **and** at
   1440×900. Heading order is `<h2>` (dialog title) → three `<h3>` (columns) — never `<h4>`, never
   a second `<h2>`. The three `region` landmarks have distinct names (`landmark-unique`). ⚠️ Do
   **not** add `tabIndex={0}` to any scroll container pre-emptively: axe's
   `scrollable-region-focusable` fires only when a region *actually overflows* with no focusable
   descendant, which no tier does with this story's content, and 4.5/4.10/4.14 each put focusable
   controls inside their column. (AR-44, UX-DR17)

6. **Existing guards are retargeted, never loosened.** `OrganismEditorModal.test.tsx` (10 tests),
   `useOrganismEditorModal.test.tsx` (8), `OrganismLibrary.test.tsx` (the Story 4.3 block) and
   the `editor modal shell (Story 4.3)` e2e block keep every assertion; the modal test gains the
   three-region check, and the e2e's `openEditor` helper and `CREATE` constant are **hoisted to
   module scope** so the new `three-column layout (Story 4.4)` describe block reuses them rather
   than forking them. No Library, card, page, `AppShell`/`AppNav` or battle-route test is edited.

7. **The bundle gate passes on the measured route, and `/organisms`'s first load does not move.**
   `npm run build:standalone` + `node scripts/check-bundle-size.mjs` before (on `main`) and after.
   The layout lives inside the lazily loaded editor chunk (`0c0nh0huqy65e.js`-class, **2.3 KB
   gzip** after 4.3), so `/organisms` (budget 305, baseline **295.2 KB** from Story 4.3) must stay
   within ±0.5 KB chunk-splitting noise and the editor chunk grows by ≲ 1.5 KB; `/`, `/battle`,
   `/battle/new` unchanged within noise. A `/organisms` move of ≳ +2 KB means the layout module was
   imported statically somewhere (or the modal's `import type` seam in `useOrganismEditorModal.ts`
   became a value import) — a finding, not a number to nudge. **No budget is raised.** Record all
   four figures plus the editor chunk's size.

8. **`npm run ci` is green locally (exit code captured to a file, never piped to `tail`) and CI on
   the pushed branch is checked, not inferred** (`gh run list --limit 1` once the PR exists).

## Tasks / Subtasks

- [x] **Task 1 — `<OrganismEditorLayout>`** (AC: 1, 2, 3, 4, 5)
  - [x] `apps/web/components/organisms/editor/OrganismEditorLayout.tsx` — `'use client'`;
        `styled` from `@mui/material/styles` only (no MUI `Grid`/`Stack`/`Box` — FD5; the layout
        is static chrome and RFC-003 Decision 3 puts static chrome in `styled()` + tokens).
        Exports:
        ```ts
        /** Viewport widths (CSS px) below which the editor body changes tier (UX-DR5). */
        export const EDITOR_BREAKPOINTS = { compress: 1400, fold: 1024 } as const;
        export interface OrganismEditorLayoutProps {
          /** Column 1 content — Story 4.5 (name), 4.6, 4.7, 4.8/4.9 mount here. */
          basicInfo?: ReactNode;
          /** Column 2 content — Story 4.10 (rule cards / empty state) mounts here. */
          rules?: ReactNode;
          /** Column 3 content — Story 4.14/4.15 (preview grid + isolated simulation, M3). */
          preview?: ReactNode;
        }
        export default function OrganismEditorLayout(props: OrganismEditorLayoutProps): JSX.Element
        ```
        The three slots are optional `ReactNode`s rendered *below* each column's heading pair —
        `undefined` renders nothing (no placeholder, no `children` prop; a column is addressed by
        name so 4.5 cannot land in the wrong one).
  - [x] Media queries as two module constants derived from the breakpoints, used inside every
        `styled()` object (Emotion's `'@media (…)': {}` key — the same shape the repo's
        `prefers-reduced-motion` blocks use, e.g. `OrganismLibrary.tsx:152`):
        ```ts
        const COMPRESS = `@media (max-width: ${EDITOR_BREAKPOINTS.compress - 0.02}px)`;
        const FOLD = `@media (max-width: ${EDITOR_BREAKPOINTS.fold - 0.02}px)`;
        ```
        `-0.02` (the Bootstrap convention) rather than `-1`: fractional CSS px viewports exist
        under browser zoom, and a `1399px` cutoff leaves a 1px band where neither tier applies.
        Level-4 range syntax (`width < 1400px`) is **not** used — Safari 16.4+, and NFR-2.1's
        floor is 15.5.
  - [x] Structure (DOM order is the visual order at every tier — SC 1.3.2/2.4.3):
        ```
        <Root>                       flex: 1; minWidth: 0; minHeight: 0; display: flex   (row)
          <MainGroup>                display: flex; flex: 1; minWidth: 0; minHeight: 0
            <BasicInfoColumn as section aria-labelledby=BASIC_ID>   320px | 280px
              <ColumnTitle as h3 id=BASIC_ID>Basic Information</ColumnTitle>
              <ColumnDescription>Define organism properties and appearance</ColumnDescription>
              {basicInfo}
            <RulesColumn as section aria-labelledby=RULES_ID>       flex: 1; max 800; margin: 0 auto
              <ColumnTitle as h3 id=RULES_ID>Survival Rules</ColumnTitle>
              <ColumnDescription>Define when cells are born, survive, or die</ColumnDescription>
              {rules}
          <PreviewColumn as section aria-labelledby=PREVIEW_ID>     400px | 350px
              <ColumnTitle as h3 id=PREVIEW_ID>Preview & Test</ColumnTitle>
              <ColumnDescription>Test organism behavior in isolation</ColumnDescription>
              {preview}
        ```
        - `MainGroup` is a **row** at ≥ 1024 (so Basic Information and Rules are laid out beside
          each other exactly as if they were `Root`'s direct children — no `display: contents`,
          FD3) and under `FOLD` becomes `flexDirection: 'column'; overflowY: 'auto'`, the single
          scroll region for the stacked pair. `minWidth: 0` + `minHeight: 0` on it and on `Root`
          are load-bearing: the flex `min-*: auto` floor is the exact defect Story 2.12's review
          measured (`BattleEditorView.tsx:209-221, 259-271`) — copy those two comments' reasoning
          in one sentence each.
        - `BasicInfoColumn` — mockup `.left-sidebar` (`:66-77`): `width: 320px; flexShrink: 0;
          background: var(--gol-bg-secondary); borderRight: 1px solid var(--gol-border); padding:
          25px; overflowY: auto; minHeight: 0`. `COMPRESS: { width: 280px }`. `FOLD: { width:
          'auto'; flexShrink: 1; overflow: 'visible'; borderRight: 'none'; borderBottom: '1px solid
          var(--gol-border)' }` (the pair's separator moves from the right edge to the bottom).
          The mockup's `padding-bottom: 0` + `.sidebar-content` inner scroller exist for a sticky
          `.sidebar-footer` this story does not have (4.3 FD1 — Back is in the header), so the
          column itself is the scroll container and the padding is uniform.
        - `RulesColumn` — mockup `.rules-column` (`:113-119`): `flex: 1; minWidth: 0; maxWidth:
          800px; margin: '0 auto'; padding: 30px; overflowY: auto; minHeight: 0`. `FOLD: {
          maxWidth: 'none'; margin: 0; overflow: 'visible'; flex: '0 0 auto' }`. Background is
          `--gol-bg-primary` by inheritance from `<Shell>` — do not restate it.
        - `PreviewColumn` — mockup `.preview-column` (`:122-129`): `width: 400px; flexShrink: 0;
          background: var(--gol-bg-secondary); borderLeft: 1px solid var(--gol-border); padding:
          30px; overflowY: auto; minHeight: 0`. `COMPRESS: { width: 350px }`. No `FOLD` rule
          (350px stays — the design doc's "Preview grid smaller (250px)" is the canvas, Story
          4.14's).
        - `ColumnTitle` — mockup `.section-title` (`:137-142`) as `<h3>`: `fontSize: 16px;
          fontWeight: 600; color: var(--gol-text-primary); letterSpacing:
          var(--gol-letter-spacing-title)` (the token IS `-0.5px`, `themes.css:51`); `margin: 0 0
          6px 0`. Sentence case, no `textTransform` — this heading is not a `<SidebarSection>`
          title and must not borrow its 13px-uppercase treatment.
        - `ColumnDescription` — `.section-description` (`:145-149`) as `<p>`: `fontSize: 12px;
          color: var(--gol-text-secondary); margin: 0 0 20px 0; lineHeight: 1.6`. ✅
          `--gol-text-secondary` on `--gol-bg-secondary` is a validated pair
          (`clinical-lab-contrast-validation.md`); on `--gol-bg-primary` (the Rules column) it is
          the same pair the Library's count badge and every status-bar label already pass axe with.
        - Ids: three module constants (`organism-editor-basic-info`, `organism-editor-rules`,
          `organism-editor-preview`) — the 4.3 `TITLE_ID` reasoning: one editor exists at a time.
        - ❌ No `transition` anywhere (the `<SidebarFooter>`/`<EditorStatusBar>` mid-fade axe
          trap). ❌ No scrollbar styling (mockup `:869-891` is theme polish for Epic 6, and
          `::-webkit-scrollbar` rules are a Chromium-only visual that no gate here can see).
          ❌ No `useMediaQuery`, no `window.matchMedia`, no `theme.breakpoints` (FD4).
  - [x] Header comment: mockup line refs; FD1–FD4 in one sentence each; cite `(Story 4.4)`,
        `(UX-DR5)`, `(NFR-3.1)`, `(M3)` (the preview slot is the isolated-simulation subtree's
        home), `(RFC-003)` — spelled exactly as `spec:check` tokenises them (`NFR-3.1`, `M3`,
        `RFC-003`, `Story 4.4`; `UX-DR5` and `FD*` are not checked).
  - [x] `OrganismEditorLayout.test.tsx` (jsdom — **structure only, never layout**; 4.2's review
        rule: an `'' === ''` style read proves nothing): (a) three `region` landmarks in DOM order
        with accessible names `Basic Information`, `Survival Rules`, `Preview & Test`
        (`getAllByRole('region')` and assert the ordered name list — not three separate `getBy`s
        that pass in any order); (b) each region contains exactly one `heading` of level 3 whose
        text is the region's name; (c) each slot renders inside its own region and nowhere else
        (`within(region).getByTestId(…)` for three distinct probe children, plus
        `queryByTestId` on the other two regions → `null`); (d) omitted slots render only the
        heading pair (region `children.length === 2`); (e) `EDITOR_BREAKPOINTS` equals `{ compress:
        1400, fold: 1024 }` (the numbers the e2e viewports are chosen around — pinned so a drift
        here fails a unit test, not a WebKit run); (f) axe on the rendered layout → `[]`.

- [x] **Task 2 — Mount it in the shell** (AC: 1, 5, 6, 7)
  - [x] `OrganismEditorModal.tsx`: `EditorBody` gains `display: 'flex'` (it is now a flex row
        whose only item is the layout `Root`; `flex: 1; overflow: hidden; minHeight: 0` stay),
        and `<EditorBody />` becomes `<EditorBody><OrganismEditorLayout /></EditorBody>` with a
        **static** relative import — the modal is already inside the lazy chunk, so a static
        import here is correct and a second `dynamic()` would be a nested lazy boundary for
        nothing. Retire the "Story 4.4's three columns land here. Empty on purpose" comment
        (`:116-117`); keep the `minHeight: 0` sentence. Update the component doc (`:124-140`) in
        one line: the body is now `<OrganismEditorLayout>`; the shell still holds no state.
  - [x] `OrganismEditorModal.test.tsx`: add one test — the open dialog contains the three
        `region` landmarks in order (`within(screen.getByRole('dialog')).getAllByRole('region')`).
        The existing axe test now scans the columns for free; do not duplicate it.
  - [x] `useOrganismEditorModal.ts` is **not touched** — its `import type` of the modal's props is
        the seam AC7 measures.

- [x] **Task 3 — e2e against the served static export** (AC: 2, 3, 4, 5, 6)
  - [x] `apps/web/e2e/organisms.spec.ts`: hoist `CREATE` and `openEditor` (`:247-262`) to module
        scope (above the first describe; the 4.3 block's usages are unchanged). New
        `test.describe('three-column layout (Story 4.4)')` reusing the file's console/pageerror
        capture and the `getByText("Conway's Classic")` hydration signal. Locate the columns as
        `dialog.getByRole('region', { name: 'Basic Information' })` etc. Tests:
        1. **Full tier (1440×900, `setViewportSize` before `goto`)**: three regions visible;
           Basic Information `boundingBox().width` ≈ 320 (`toBeCloseTo(320, 0)`), Preview ≈ 400
           and its right edge ≈ 1440; Rules `x ≥ basic.x + basic.width`, `x + width ≤ preview.x`,
           `width ≤ 800`; all three `y` equal and each height equal to the others (one row). Zero
           console errors.
        2. **Independent scroll (1440×900)**: `page.evaluate` appends a `<div style="height:
           4000px">` to the Rules region; assert on the region `scrollHeight > clientHeight`;
           set `scrollTop = 500` and read it back `> 0`; then assert the Basic Information and
           Preview boxes are **identical** to their pre-scroll boxes, `[role="dialog"]`'s box height
           equals the viewport height, and `documentElement.scrollHeight <= clientHeight`. Remove
           the probe at the end (and never run axe in this test). Repeat the `scrollHeight >
           clientHeight` half once for the Basic Information region (FD2 — each column is its own
           container).
        3. **Compressed tier (the project's own viewport — 1280 desktop / 1194 tablet, no
           `setViewportSize`)**: Basic Information ≈ 280, Preview ≈ 350, Rules between them, one
           row, no horizontal document overflow. This is the tier every other e2e in the file
           already runs in — say so in the test's comment.
        4. **Fold tier (1000×800)**: Preview ≈ 350 with its right edge ≈ 1000; Basic Information
           and Rules share the same `x` and `width`, Rules `y ≥ basic.y + basic.height`; all three
           regions `toBeVisible()`; `documentElement.scrollWidth <= clientWidth`. No axe here
           (AC4).
        5. **axe at 1440×900 with the dialog open and settled** → `[]` (opacity-settle on
           `.MuiDialog-container` first — `openEditor` already does it). The projects' default
           viewport is already scanned by the 4.3 block's axe test (which now sees the columns).
        6. **Heading order**: inside the dialog, `getByRole('heading', { level: 3 })` count is 3
           with the three names, and level-2 count is 1.
  - [x] Keep the WebKit `Alt+Tab` branch and every 4.3 assertion as they are.

- [x] **Task 4 — Bundle measurement, docs, verification** (AC: 6, 7, 8)
  - [x] Measure before (on `main`) and after Task 3; record the four routes and the editor
        chunk's gzip size in the Dev Agent Record. Do **not** edit `budgetGzipKb`.
  - [x] `deferred-work.md`: add `## Deferred from: Story 4-4-three-column-responsive-layout
        (2026-09-14)` with: (1) **the Rules-column width is specified two ways** — `epics.md:230,
        1037` (UX-DR5: "flexible ~500–600px") vs `ORGANISM-EDITOR-UPDATES.md:39` + the mockup
        (`organism-editor.html:113-119`, `max-width: 800px`); this story took the AC's band as the
        1400px measurement and the mockup's cap as the ceiling (FD1) — the same UX reconciliation
        touch 4.3 already asked for should settle the wording; (2) **the compressed and fold tiers
        have no mockup** — `organism-editor-design.md:634-656` is prose only and neither theme's
        HTML has an `@media` rule; the 280/350 widths and the stacked fold are implemented from
        that prose and should get a mockup pass before Epic 6 restyles the editor; (3) **the
        `.rules-header` row** (`organism-editor.html:993-999`) puts "+ Add Rule" beside the Rules
        title — Story 4.10 restructures the Rules column heading into that row (add a slot then,
        not now); (4) **`"stay put"` was read as *no shared scroll*** (FD2) — if the UX intent was
        that Basic Information and Preview never scroll, the 4.5–4.9 content height has to fit
        720px minus the header first, and that is a design question, not a CSS one.
  - [x] `docs/project-context.md`: add **one line** under *Testing Rules → Layout & fixtures*:
        the four Playwright projects run at 1280×720 (desktop) and 1194×834 (tablet) — no default
        project is ≥ 1400 or < 1024, so a layout tier outside that band is exercised only by a
        one-off `page.setViewportSize` (the Story 2.12 precedent), never a fifth project. This is
        a "compiles and passes, and tested the wrong tier" trap; it belongs there.
  - [x] `npm run ci > /tmp/ci.log 2>&1; echo $?` — paste the exit code, the bundle lines and the
        e2e summary into the Dev Agent Record. Push to `story/4-4-three-column-responsive-layout`;
        check `gh run list --limit 1` after the PR opens.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Rules column: `flex: 1; max-width: 800px` (mockup), and the AC's "~500–600px" is the
  1400px measurement, not a cap.** At exactly 1400px the flexible column is `1400 − 320 − 400 =
  680px` outer, 620px inside its 30px padding — the AC's band. Above that, the mockup
  (`organism-editor.html:113-119`, `ORGANISM-EDITOR-UPDATES.md:39` "Rules (800px max)") caps it at
  800px and centres it (`margin: 0 auto`), which is what stops rule cards stretching to 1500px on
  a wide monitor. Capping at 600px would waste the width the AC calls "flexible". Flagged in
  `deferred-work.md` (Task 4) rather than silently picked — `project-context.md`'s "new conflicts
  are signal" rule.

- **FD2 — Every column is its own scroll container; "stay put" means no shared scroll.** The
  mockup gives all three `overflow-y: auto` (`:81` via `.sidebar-content`, `:116`, `:127`). The
  Basic Information column's coming content (name + count, dominance slider + input, aging strip,
  100×100 swatch + 20 chips) is ~700px tall; the desktop Playwright projects are 720px high with a
  ~70px header above the body. `overflow: hidden` there would clip the colour picker on the exact
  viewport CI runs, and nothing in this story could see it. "Stay put" is satisfied in its
  observable form: scrolling the Rules column moves nothing else (Task 3, test 2).

- **FD3 — The fold stacks Basic Information over Rules inside ONE scroll region, via a real
  wrapper element, not `display: contents`.** `organism-editor-design.md:648-652` says "Column 1 +
  2 stacked on left / Column 3 on right" and no more. Two nested scroll regions would give the
  rules whatever height the ~700px Basic Information column leaves on an 834px tablet — nothing.
  One region is the only fold that is usable, and since 1024 is NFR-3.1's floor, this tier is a
  degradation path, smoke-tested only (AC4). `MainGroup` is a plain `<div>` flex row at ≥ 1024
  (visually identical to three direct children) and a flex column scroller below; `display:
  contents` would work but carries Safari's role-stripping history for no gain here.

- **FD4 — CSS media queries in `styled()`, not `useMediaQuery` / conditional rendering.** This is
  the repo's **first viewport breakpoint** (every existing `@media` is `prefers-reduced-motion` or
  `hover: none`). CSS keeps the DOM identical at every width (SC 1.3.2, and the three regions stay
  in the a11y tree), needs no `matchMedia` in jsdom, cannot mismatch between prerender and
  hydration (the dialog is `ssr: false` anyway, but the idiom will be copied), and costs zero JS.
  `useMediaQuery` would re-render the editor tree on every resize crossing and put layout
  knowledge in React state (RFC-005 Decision 1's three categories have no slot for it). The
  breakpoints are exported numbers so the unit test pins them and a later story (6.x restyle, a
  settings-page layout) can import rather than retype.

- **FD5 — `styled()` + tokens, no MUI `Grid`/`Stack`/`Box`.** RFC-003 Decision 3: static,
  reusable chrome is `styled()`; `sx` is for per-instance values. `<BattleEditorView>`'s
  sidebar/main row (`BattleEditorView.tsx:209-271`) is the shipped precedent and the mockup CSS
  maps 1:1 onto it. MUI `Grid` v2 would add its own breakpoint system (`theme.breakpoints`,
  defaults 600/900/1200/1536) that matches none of UX-DR5's numbers.

- **FD6 — Three named optional slots, no `children`.** The layout is the seam eleven stories
  mount into; `basicInfo` / `rules` / `preview` make the destination explicit at the call site.
  They are optional so this story renders the shell without placeholders (4.3's "a placeholder is
  chrome nobody asked for"), and they are *read* (rendered) here, so they are not the "prop
  nothing reads" 4.3 warned against. No `rulesAction` slot for 4.10's "+ Add Rule" header button —
  4.10 owns the `.rules-header` restructuring (Task 4's deferred note).

- **FD7 — Heading copy is the mockup's `.section-title` text, sentence case.** `Basic
  Information` / `Survival Rules` / `Preview & Test` (`organism-editor.html:909, 993, 1196`) — not
  the design doc's "Basic Info & Settings" column label, and not uppercased: the `<SidebarSection>`
  13px-uppercase treatment is the battle sidebar's, and a `text-transform` would change the
  accessible name computation on some screen readers for no visual reason the mockup asks for.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:43-51, 116-122, 124-140, 201` | **The file being modified**: `Shell` (flex column, `height: 100%`), the empty `EditorBody` this story fills, the doc block to touch, the mount line. Everything else in it stays. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` | Portalled-dialog query discipline (`screen`, never `container`); the axe test that now covers the columns. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:203-271` | **Copy the flex-chain reasoning**: `EditorLayout` `minHeight: 0`, `EditorSidebar` `width: 320px; flexShrink: 0; overflowY`, `MainContent` `minWidth: 0; minHeight: 0` and the review-measured defect each one prevents. |
| `apps/web/components/battle/SidebarSection.tsx` | The house heading-level reasoning (why the mockup's `<h3>` became an `<h2>` there — and why here it stays `<h3>` under the dialog's `<h2>`). |
| `apps/web/e2e/organisms.spec.ts:246-262, 415-434` | `openEditor` (container-opacity settle) and `CREATE` to hoist; the settled-axe pattern to reuse at 1440×900. |
| `apps/web/e2e/battleRoute.spec.ts:936-1010` | The one-off `setViewportSize` idiom, bounding-box assertions, the "0×0 box passes every upper bound" lesson, `documentElement.scrollWidth <= clientWidth`. |
| `apps/web/playwright.config.ts:18-24` | The four projects and their viewports — why the default runs are the compressed tier. |
| `apps/web/components/organisms/OrganismLibrary.tsx:30, 152, 229, 321` | The `dynamic()` boundary the layout must stay behind; the repo's `@media` object-key shape; the hook call and the gated mount (unchanged). |
| `apps/web/lib/organisms/useOrganismEditorModal.ts` | **Read, do not modify** — its `import type` is what keeps the Dialog stack (and now the layout) out of first load (AC7). |
| `apps/web/app/themes.css:51` | `--gol-letter-spacing-title: -0.5px` — the mockup's `.section-title` letter-spacing is already a token. |
| `apps/web/lib/theme.ts:137-185` | What MUI primitives inherit — irrelevant to the columns (plain elements), relevant if the dev reaches for `Box`/`Stack` (FD5 says not to). |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:31-130, 137-149, 495-507, 895-1000, 1190-1200` | The column CSS (verbatim values above), section-title/description CSS, the markup with the three `<h3>`s, the `.rules-header` row 4.10 inherits. **No `@media` anywhere in it.** |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:53-96, 634-656` | Column breakdown (320 / ~500–600 / 400) and the only source of the compressed (280 / flex / 350) and fold tiers — prose. |
| `docs/planning-artifacts/ux-designs/…/ORGANISM-EDITOR-UPDATES.md:23-46` | "Rules (800px max)" and the header/footer revision 4.3's FD1 already deferred. |
| `docs/implementation-artifacts/4-3-editor-modal-shell.md` | FD1–FD8 there (header form, `origin`, lazy boundary, `editor/` folder), the bundle figures, the review's e2e fixes (container opacity, focus-trap vacuity). |
| `docs/implementation-artifacts/deferred-work.md:747-793` | 4.3's open items — the header/footer divergence this story must not "fix" by building a footer; the `afterEach` sweep note (do not copy it into a new hook test — this story has none). |
| `scripts/check-bundle-size.mjs:92-100` | The `/organisms` entry (305), the formula, "not a raise". |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.24/4.25 gated on `epic-3`; this story touches none of Epic 3's surfaces. |

### Architecture compliance

- **UX-DR5 / NFR-3.1 / NFR-3.2** — three columns at ≥ 1400, compressed 1024–1400, fold below;
  1024 is the supported floor, so the fold is degradation, not a target (AC4). Neither `AR-` nor
  `Decision` text names the editor's columns — the component naming here (`OrganismEditorLayout`
  with `basicInfo`/`rules`/`preview` slots) is this story's to set (FD6) and the next stories
  follow it.
- **M3 / RFC-005 Decision 5** — the preview slot is where the *isolated* `useSimulation` subtree
  (own refs, never-persisted 30×20 grid) will mount in 4.14/4.15. The layout gives it a column and
  nothing else — no canvas, no hook, no grid here.
- **AR-35** — the layout is inside the `next/dynamic` boundary 4.3 drew; per-component MUI imports
  (`@mui/material/styles` only). Nothing new reaches `/organisms`'s first load (AC7).
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)`; the only values
  that are not tokens are the layout dimensions (320/280/400/350/800/25/30px and the two
  breakpoints), matching the repo's existing literal-width idiom (`EditorSidebar` 320px) — there
  are no `--gol-*` spacing/width/breakpoint tokens and Decision J's scope is palette, typography
  and radius. Do not mint layout tokens.
- **RFC-005 Decision 1 (three state categories)** — the layout holds **no state**; tier is CSS.
  No `useState`, no `useRef`, no `useMediaQuery` (FD4).
- **AR-2 / AR-27** — no repository anywhere near this story; nothing to persist.
- **AR-44 / UX-DR17** — three `region` landmarks with unique names, `<h2>` → `<h3>` heading order,
  axe in jsdom and all four projects with the dialog open; DOM order = visual order at every tier.
- **NFR-4.1** — no dead affordances: the columns render only their heading pair; no "coming soon"
  text, no disabled placeholder controls.
- **Spec-id hygiene** — `spec:check` tokenises `NFR-3.1`, `NFR-3.2`, `NFR-4.1`, `M3`, `AR-35`,
  `AR-44`, `AR-46`, `RFC-003`, `RFC-005`, `Decision J`, `Story 4.4`; write them exactly so.
  `UX-DR5`, `UX-DR17`, `FD*`, `SC n.n.n` and `deferred-work.md:NNN` are not checked.

### Library / framework notes (installed versions, no research needed)

- **MUI 9.3.1 / Emotion** — `styled('section')` and `styled('h3')` accept nested `'@media (…)'`
  keys in the style object; the generated class is static (no per-render cost). `as` is not
  needed — pick the element in `styled(<tag>)` directly so the landmark role is the element's own.
  A `styled()` component forwards `aria-labelledby`/`id` untouched.
- **Flexbox facts the story depends on** — a flex item's `min-width`/`min-height` default to
  `auto` (= content size), so a nested scroll container never engages without `min-*: 0` up the
  chain (`Root` → `MainGroup` → column). `EditorBody` already has `minHeight: 0`; `Shell` is
  `height: 100%` of the fullScreen paper, which is `height: 100%` of MUI's fixed container — the
  chain is definite all the way down. In a **row**, `align-items: stretch` gives each column the
  row's height, which is what makes `overflow-y: auto` on a column bound it.
- **CSS media queries** — `max-width: 1399.98px` is evaluated against the viewport width in CSS
  px. MUI's Dialog container is `position: fixed; inset: 0` and the fullScreen paper is `100%` of
  it, so the body spans the viewport regardless of any body scrollbar (MUI locks body scroll while
  open anyway) — column arithmetic and `boundingBox()` agree, and `preview.x + preview.width`
  measures the viewport width.
- **Playwright 1.62** — `page.setViewportSize` must precede `page.goto` (or be followed by a
  re-layout wait); `boundingBox()` returns `null` for detached/hidden nodes — throw, as
  `battleRoute.spec.ts:952` does, rather than optional-chain into a vacuous pass.
  `devices['Desktop Chrome' | 'Desktop Firefox' | 'Desktop Safari']` are 1280×720;
  `devices['iPad Pro 11 landscape']` is 1194×834.
- **axe-core 4.12.1** — `region` landmarks need unique accessible names (`landmark-unique`);
  `scrollable-region-focusable` evaluates real overflow (real browser only; jsdom never fires it);
  `heading-order` compares against the previous heading in DOM order, and the aria-hidden `<h1>`
  behind the modal is excluded from the sequence (4.3 proved `<h2>` first is green).
- **jsdom** — no layout: `getBoundingClientRect` is all zeros and `scrollHeight` is 0. Every
  size/scroll assertion belongs in Task 3; Task 1's test is structure and axe only.

### Testing standards

- `apps/web` has **no coverage gate** — every test above guards a named failure: a column that
  vanishes or reorders at a tier (regions + DOM order), the ≥ 1400 tier never being exercised
  (1440×900 `setViewportSize`), the fold overflowing the document (`scrollWidth`), a shared scroll
  (probe test), a nested scroll region that never engages (`scrollHeight > clientHeight` on the
  column, not the document), the layout leaking into first load (AC7's number), and a `<h4>` or a
  second `<h2>` breaking heading order.
- Never snapshot the layout; never assert computed widths in jsdom; never mock `matchMedia`
  (nothing calls it — FD4).
- The probe node in Task 3 test 2 is appended and removed inside the same test; if the dev
  finds a cleaner way to make the Rules column overflow without a probe, it must not involve
  rendering placeholder rules (NFR-4.1).
- The 4.3 tests must not be edited beyond the hoist AC6 names; if another one fails, the layout
  is wrong, not the test.

### Previous story intelligence (Story 4.3)

- The shell's structure is settled: `Shell` (flex column) → `EditorHeader` (3-slot grid) →
  `EditorBody` (`flex: 1; overflow: hidden; minHeight: 0`). This story adds `display: flex` to
  `EditorBody` and fills it; the header, the `Dialog` props, the paper override and the
  lifecycle hook are **untouched**.
- 4.3's review found the e2e "settled" wait had to read `.MuiDialog-container`'s opacity (the
  paper's is always 1) and that a focus-trap assertion written as `closest(...) !== null` passed
  vacuously on a `null` `activeElement`. Both lessons apply to the bounding-box tests here: assert
  real numbers (`toBeCloseTo`, `toBeGreaterThan`), never a nullable's negation.
- 4.3 measured the editor chunk at **2.3 KB gzip** and `/organisms` at **295.2 KB**; it confirmed
  the chunk is requested only on the first open. This story's whole footprint lands in that chunk.
- 4.3 FD1's header/footer divergence is **open** in `deferred-work.md:749-760`: do not build a
  footer, a sidebar footer, or move Back/Save — the mockup's `.sidebar-footer` and
  `.editor-footer` are not this story's surfaces (4.20 owns the editor footer).
- 4.3 FD6 created `components/organisms/editor/`; the layout is its second file. Nothing lands
  flat in `components/organisms/`.
- The 4.3 hook test's `afterEach` aria-hidden sweep is a known defect (`deferred-work.md:781-788`)
  — this story adds no hook test, so nothing to copy.

### Git intelligence

Last 12 commits on `main`: Story 4.3 (feat + review fixes + tab-order ratification —
`components/organisms/editor/`, `lib/organisms/useOrganismEditorModal.*`, `OrganismLibrary.*`,
`e2e/organisms.spec.ts`, `deferred-work.md`), Story 3.10 (`useSimulation` — `lib/simulation/`
hooks, review fixes on renderer sizing / cadence / seeding), and two skill/docs-only commits
(run-stats). **Shared surfaces with the open Epic 3 lane (3.11–3.19): none.** 3.11+ reshape
`<BattlePage>`, `<BattleHeader>` and `components/battle/simulation/`; 3.17 touches
`<BattleGallery>`; 3.19's "hotkeys suspended while a dialog is open" keys off `[role="dialog"]`,
which this story neither adds nor removes. This story writes only
`components/organisms/editor/**`, one line of `OrganismEditorModal.tsx`'s body, `e2e/organisms.spec.ts`
and docs.

### Project Structure Notes

- New: `components/organisms/editor/OrganismEditorLayout.tsx` (+ `.test.tsx`).
- Modified: `components/organisms/editor/OrganismEditorModal.tsx` (+ test), `e2e/organisms.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md`, `docs/project-context.md` (one line),
  `sprint-status.yaml`.
- Naming: components PascalCase `.tsx`; the exported constant is `EDITOR_BREAKPOINTS`
  (SCREAMING_CASE for a module constant, as `TITLE_ID`/`BUTTON_SX` in the shell).
- Untouched on purpose: `useOrganismEditorModal.ts`, `OrganismLibrary.tsx`, `OrganismCard.tsx`,
  `app/(gallery)/organisms/page.tsx`, `AppShell`/`AppNav`, `lib/theme.ts`, `themes.css`,
  everything under `components/battle/`, `packages/*`, `playwright.config.ts` (no fifth project),
  `scripts/check-bundle-size.mjs` budgets.

### References

- `docs/planning-artifacts/epics.md:1029-1039` (Story 4.4 ACs), `:133-134` NFR-3.1/3.2, `:135`
  NFR-4.1, `:206` AR-35, `:218` AR-44, `:220` AR-46, `:230` UX-DR5, `:242` UX-DR17, `:1017-1027`
  (4.3 — the shell), `:1041-1101` (4.5–4.9 Basic Information content), `:1103-1113` (4.10 Rules
  column), `:1153-1175` (4.14/4.15 Preview column), `:1227-1238` (4.20 footer — not this story).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:615-619, 723` (NFR-3.1 minimum
  width 1024; mobile out of scope).
- `docs/planning-artifacts/architecture.md:349` (M3 — isolated preview subtree), `:396-401`
  (NFR-3 → RFC-003 responsive; NFR-8 → Decision J).
- `docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md:58` (the editor `Dialog`),
  `:167-180` (Decision 3 — `styled()` vs `sx`); `RFC-005-application-state-modes-undo.md:177`
  (preview isolation), `:199` (modal over `<BattlePage>` — the `'battle'` origin the layout must
  not care about).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:53-96,
  634-656`; `ORGANISM-EDITOR-UPDATES.md:23-46`; `clinical-lab-theme/organism-editor.html:31-130,
  137-149, 495-507, 895-1000, 1190-1200`; `UX-PHASE-COMPLETION-REVIEW.md:342, 472` (responsive tiers
  acknowledged as not mocked up).
- `docs/implementation-artifacts/4-3-editor-modal-shell.md` (FD1–FD8, bundle figures, review
  findings); `4-2-organism-card-grid.md` (review assertion-hygiene classes).
- `docs/implementation-artifacts/deferred-work.md:747-793` (4.3's open items).
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (three state categories, MUI one theme,
  `styled()` + tokens), Testing rules (axe, never snapshot, no coverage padding, `setViewportSize`
  line this story adds), Code Quality (AR-46, `spec:check`, comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5`), via `bmad-dev-story` on branch
`story/4-4-three-column-responsive-layout`, baseline `6b1659a`.

### Implementation Plan

- Task 1 red→green: `OrganismEditorLayout.test.tsx` written first (module missing → 1 failed file),
  then the component. All seven `styled()` primitives are plain elements (`section`/`h3`/`p`/`div`)
  per FD5; media queries are the two module constants `COMPRESS` / `FOLD` derived from the exported
  `EDITOR_BREAKPOINTS` with the `-0.02` convention. No `transition`, no scrollbar styling, no
  `useMediaQuery`/`matchMedia`/`theme.breakpoints`, no `tabIndex` on scroll containers.
- Task 2 red→green: the three-region test added to `OrganismEditorModal.test.tsx` first (1 failed
  of 11), then `EditorBody` gained `display: 'flex'` and `<OrganismEditorLayout />` as its child via
  a static relative import. `useOrganismEditorModal.ts` untouched.
- Task 3: `CREATE` + `openEditor` hoisted to module scope (body unchanged, one sentence added to
  its doc); new `three-column layout (Story 4.4)` block with the six tests as specified, sharing a
  `boxOf` helper (throws on `null`, the `battleRoute.spec.ts` idiom) and an `openLayout` helper
  that returns the three region locators.
- Task 4: bundle before/after, `deferred-work.md` (four items), `project-context.md` (one bullet
  under *Layout & fixtures* + `Last updated` bump), `npm run ci`.

### Debug Log References

- Unit (`apps/web`, vitest): `OrganismEditorLayout.test.tsx` 6/6, `OrganismEditorModal.test.tsx`
  11/11 (10 + the new region test), `useOrganismEditorModal.test.tsx` 8/8, `OrganismLibrary`
  unchanged — `components/organisms lib/organisms` → 7 files, 72 tests, all passing.
- e2e (`npx playwright test e2e/organisms.spec.ts`, all four projects): **92 passed (1.0m)** on
  the first run — 23 tests × 4 projects, the six Story 4.4 tests included; Story 4.1/4.2/4.3 blocks
  untouched and green. No flake on the fold tier (1000×800) on WebKit/tablet.
- Bundle (`npm run build:standalone` + `node scripts/check-bundle-size.mjs`), before on `main`
  (`6b1659a`) vs after:

  | Route | Before (gzip) | After (gzip) | Budget |
  |---|---|---|---|
  | `/` | 331.5 KB | 331.5 KB | 340 |
  | `/battle` | 306.1 KB | 306.1 KB | 310 |
  | `/battle/new` | 306.0 KB | 306.0 KB | 310 |
  | `/organisms` | 295.2 KB | **295.2 KB** | 305 |

  Editor chunk (the one file containing `Organism Editor`, requested on first open):
  `0c0nh0huqy65e.js` 5809 B raw / **2325 B gzip** before → `07weuipcsaops.js` 7751 B raw /
  **2819 B gzip** after (**+0.5 KB gzip**, well under the ≲ 1.5 KB the AC allows). All four routes'
  first-load figures are byte-identical: the layout stayed behind the `dynamic()` boundary and the
  `import type` seam held. No budget edited.
- `npm run ci > ci.log 2>&1; echo $?` → **`0`**. Gate order typecheck → lint → format:check →
  spec:check → boundary:check → coverage → build:standalone → bundle:check → bench → bench:check
  → e2e, all green. Coverage: domain 100 / simulation 100 / persistence 99.19 / test-utils 94.44
  (stmts). Bundle lines: `/` 331.5 KB (8.5 headroom), `/battle` 306.1 (3.9), `/battle/new` 306.0
  (4.0), `/organisms` 295.2 (9.8). Bench: 9.27 ms mean at 100×60 × 20 against the 16.667 ms budget
  (7.188 ms headroom). e2e summary: **`web:e2e: 436 passed (5.0m)`** across the four projects.
  Remote CI is checked with `gh run list --limit 1` once the PR exists (a later step).

### Completion Notes List

- AC1: three `<section aria-labelledby>` regions in DOM order with the mockup `.section-title`
  copy; widths 320 / `flex: 1; max-width: 800px; margin: 0 auto` / 400 (FD1). Each column renders
  its `<h3>` + `<p>` and nothing else — no placeholder.
- AC2: every column is its own `overflow-y: auto` container (FD2); proven at 1440×900 with a 4000px
  probe appended to the Rules region — `scrollHeight > clientHeight`, `scrollTop` sticks at 500,
  Basic Information and Preview boxes `toEqual` their pre-scroll boxes, dialog height = viewport,
  `documentElement.scrollHeight <= clientHeight`; probe removed in-test, no axe in that test.
- AC3: `@media (max-width: 1399.98px)` → 280 / flexible / 350; `@media (max-width: 1023.98px)` →
  `MainGroup` becomes a column scroller with Basic Information stacked over Rules (FD3), Preview
  stays 350. CSS only; DOM identical at every tier (FD4). The compressed tier is asserted at each
  project's own viewport (1280 / 1194), the full tier and the fold via one-off `setViewportSize`.
- AC4: fold test asserts regions visible, same `x`/`width` for the stacked pair, Rules below Basic,
  Preview at 350 flush right, `scrollWidth <= clientWidth`; no axe at < 1024.
- AC5: axe `[]` in jsdom on the layout alone and on the open modal; `[]` in all four projects at the
  default viewport (4.3's test, now scanning the columns) and at 1440×900. Heading order `<h2>` →
  `<h3>` × 3 asserted in e2e. No `tabIndex` on scroll containers.
- AC6: all 4.3 unit/e2e assertions kept verbatim; only the hoist (`CREATE`, `openEditor`) moved
  lines. No Library, card, page, `AppShell`/`AppNav` or battle-route test edited.
- AC7: figures above — `/organisms` unchanged at 295.2 KB, editor chunk +0.5 KB gzip.
- AC8: local `npm run ci` result recorded below; the remote run is checked after the PR opens
  (the next step's job).
- Spec conflicts surfaced, not silently picked: Rules width (AC "~500–600px" vs mockup 800px cap)
  and "stay put" vs per-column scroll — both in `deferred-work.md` under this story's heading.

### File List

- `apps/web/components/organisms/editor/OrganismEditorLayout.tsx` (new)
- `apps/web/components/organisms/editor/OrganismEditorLayout.test.tsx` (new)
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (modified — static import,
  `EditorBody` `display: flex`, body mount, doc comment)
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` (modified — `within`
  import, one new test)
- `apps/web/e2e/organisms.spec.ts` (modified — hoist + new describe block)
- `docs/implementation-artifacts/deferred-work.md` (modified — new section)
- `docs/project-context.md` (modified — one bullet under *Layout & fixtures*, `Last updated`)
- `docs/implementation-artifacts/sprint-status.yaml` (modified — story status)
- `docs/implementation-artifacts/4-4-three-column-responsive-layout.md` (this file)

### Change Log

- 2026-09-14 — Story 4.4 implemented: `<OrganismEditorLayout>` (three regions, three tiers, three
  named slots) mounted in the editor shell; unit + e2e coverage for structure, tiers, independent
  scroll, axe and heading order; deferred-work and project-context notes; status → review.

Dev Model: opus   # architecture-shaping: sets the repo's first viewport-breakpoint idiom (CSS-in-styled, exported EDITOR_BREAKPOINTS), the three-slot layout contract and the fold/scroll ownership that Stories 4.5–4.15 mount into, and resolves two spec conflicts (Rules width 500–600 vs 800; "stay put" vs per-column scroll) rather than following an existing pattern
Proposed lane gate: none
