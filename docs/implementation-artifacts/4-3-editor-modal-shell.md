---
baseline_commit: 591f45b0ed561cc44e2615165f973a9d43247f4e
---

# Story 4.3: Editor Modal Shell

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the Organism Editor to open as a focused full-screen overlay,
so that authoring gets my full attention without losing my place.

## Acceptance Criteria

From `epics.md#Story 4.3: Editor Modal Shell` (`:1017-1027`), decomposed into what a reviewer can
check independently. AC5–AC8 are repo-derived: the obligations the shipped dialog idiom, the bundle
gate and the CI gates already impose on "the story that adds a dialog to a route".

1. **"+ Create New Organism" fills the toolbar slot and opens the editor.** `<OrganismLibrary>`'s
   reserved create-button slot (`OrganismLibrary.tsx:220-221`, the comment naming this story)
   renders a real `<button type="button">` per the Library mockup `.create-button`
   (`organism-library.html:122-139`, `:406`): `--gol-accent` fill, `--gol-bg-primary` text,
   `14px 28px` padding, 14px/600 uppercase via CSS (DOM text `+ Create New Organism` — accessible
   name stays sentence case, the `<SidebarFooter>` trap-15 convention), `white-space: nowrap`,
   `--gol-accent-hover` on hover, the house `:focus-visible` ring, **no `transition`** (the
   `<SidebarFooter>`/`<EditorStatusBar>` mid-fade axe trap). It carries `data-create-organism=""`
   — the focus-restore anchor (AC4). It is rendered in **every** status (loading / error / ready):
   the toolbar sits outside the `aria-busy` wrapper on purpose, and a control that vanishes while
   the list loads is the `deferred-work.md:187` mistake. Clicking it opens the editor. The
   `<OrganismRoster>` create button is **not** this story's (4.25; `OrganismRoster.tsx:417-419`).
   (FR-1.2 entry, NFR-4.1)

2. **The editor is a full-screen MUI `Dialog`, loaded via `next/dynamic`, with `role="dialog"`,
   trapped focus and ARIA labelling.** `<OrganismEditorModal>` (new,
   `components/organisms/editor/`) renders `<Dialog fullScreen open …>` — `role="dialog"` and
   `aria-modal` come from MUI; `aria-labelledby` points at the header's `<h2>` ("Organism
   Editor"). It reaches `<OrganismLibrary>` through `dynamic(() => import(…), { ssr: false })`
   exactly as `<BattlePage>` reaches `<UnsavedChangesDialog>` (`BattlePage.tsx:34-50`) — **never a
   static import** (AC7 is why). MUI's focus trap keeps Tab inside; the background is made
   genuinely non-interactive with `useInertBackground` from the **parent** hook (AC4), so the page
   behind is `aria-hidden` **and** `inert` for the whole open + exit-transition window. No
   `autoFocus` anywhere in the shell: MUI's trap focuses the dialog container, and Story 4.5's
   name field is the element that will legitimately claim first focus. (AR-35, UX-DR5/17)

3. **The header shows the contextual back label, a centred title, and Save + Close.** A
   `styled('header')` inside the dialog (mockup `.editor-header`: `--gol-bg-primary`, `1px solid
   var(--gol-border)` bottom rule, `20px 30px` padding, `flex-shrink: 0`) laid out as a 3-column
   grid `1fr auto 1fr` so the title is centred regardless of side widths: **left** a `<button>`
   whose accessible name is exactly `Back to Library` (decorative `<span aria-hidden="true">←</span>`
   glyph, the `<SidebarFooter>` shape — FD3 on the glyph); **centre** `<h2 id=…>Organism
   Editor</h2>` (18px/600, `--gol-letter-spacing-title`, CSS-uppercased); **right** a
   `<Button variant="contained" disabled>` labelled `Save` and an `IconButton` with accessible
   name `Close` containing `<span aria-hidden="true">✕</span>`. The back label is a pure function
   of `origin` (`'library'` → `Back to Library`, `'battle'` → `Back to Battle`; FD2) unit-tested
   for both values; only `'library'` is reachable from UI in this story. **Save is genuinely
   `disabled`** (FD4) — the readiness report's accepted within-epic inert affordance
   (`implementation-readiness-report-2026-07-16.md:370,403`) — and carries a comment naming Story
   4.16 as the story that wires it. Below the header, the dialog body is an empty `flex: 1;
   overflow: hidden` region for Story 4.4's columns — **no placeholder text, no footer** (the
   footer is Story 4.20's surface; FD1). (UX-DR5)

4. **Close, Back and Escape all close the modal, and focus returns to the invoking control.**
   All three route to the same `onClose` (MUI's `onClose` fires for Escape; the two buttons call it
   directly). Nothing else happens — no repository call, no state beyond the modal's own
   lifecycle; the unsaved-changes guard is Story 4.23's and inserts itself in front of `onClose`
   later. Focus restoration follows the repo's settled idiom (`useDeleteBattleDialog`,
   `useLeaveGuard`): `disableRestoreFocus` on the `Dialog`, a three-phase
   open → **exiting** → closed lifecycle in a parent hook (`useOrganismEditorModal`, FD5) that
   keeps `useInertBackground` active until `onTransitionExited`, then an effect keyed on the
   lifecycle clearing that focuses `document.querySelector('[data-create-organism]')` by **DOM
   lookup** (never a captured element — WebKit does not focus a `<button>` on click) and only when
   focus is "loose" (`null`, `<body>`, or still inside a `[role="dialog"]`). (UX-DR17)

5. **axe passes with the modal open, in jsdom and in all four Playwright projects.** vitest-axe on
   `<OrganismEditorModal open origin="library">` → `[]`; `@axe-core/playwright` on the served
   `/organisms` with the dialog open and settled (`toHaveCSS('opacity', '1')` first — the
   `deleteBattle.spec.ts:288-316` mid-fade lesson) → `[]`. The fullScreen paper must show **no
   border and no radius** (the theme's `MuiDialog.paper`/`MuiPaper.root` overrides would otherwise
   paint a 1px `--gol-border` edge and `--gol-radius` corners on a full-viewport surface — override
   at the call site via `slotProps.paper.sx`, never in the theme, per `theme.ts:167-170`'s own
   rule). (AR-44, UX-DR17)

6. **Existing guards are retargeted, never loosened.** `OrganismLibrary.test.tsx` keeps every test
   green; the tab-order test now reads search input → **create button** → first card → second card
   (the button sits in `<ToolbarLeft>` before the cards). `organisms.spec.ts`'s keyboard test
   is updated for the same reason. ✅ **Decided by Sidiar (2026-09-14): the shipped order
   `create button → search input → first card` stands** (Task 3 / mockup / SC 2.4.3); the order
   written here and in Task 3(f) / Task 4 is stale text, and the 4.2 keyboard e2e is correctly
   unchanged. `page.test.tsx`, `OrganismCard.test.tsx`, `AppShell`/`AppNav`
   tests and every battle-route test are untouched and **run**. Story 4.2's prerender proof still
   holds: the create button is in the SSR body (it is static chrome); the dialog is not (`ssr:
   false`).

7. **The bundle gate passes on the measured route, and the Dialog stack is NOT in first load.**
   `npm run build:standalone` + `node scripts/check-bundle-size.mjs` before and after. `/organisms`
   (budget 305, baseline **293.5 KB** from Story 4.2) absorbs only the create button, the hook and
   the `next/dynamic` boundary — expect **+1 to +3 KB**; `/`, `/battle`, `/battle/new` unchanged
   within chunk-splitting noise (±0.5 KB, unattributed unless chunk-diffed — Story 4.1's lesson).
   If `/organisms` moves by ≳ +10 KB the Dialog stack has leaked into first load (a static import
   somewhere, or a **value** import of the modal module from the hook — see FD5) and that is a
   finding, not a number to nudge. **No budget is raised.** Record all four figures.

8. **`npm run ci` is green locally (exit code captured to a file, never piped to `tail`) and CI on
   the pushed branch is checked, not inferred** (`gh run list --limit 1` once the PR exists).

## Tasks / Subtasks

- [x] **Task 1 — `<OrganismEditorModal>` shell** (AC: 2, 3, 4, 5)
  - [x] Create `apps/web/components/organisms/editor/` (new folder — FD6: Epic 4's editor
        subtree, mirroring `components/battle/editor/`; the columns 4.4 adds and everything
        4.5–4.15 fills land here, never flat in `components/organisms/`).
  - [x] `apps/web/components/organisms/editor/OrganismEditorModal.tsx` — `'use client'`;
        per-component MUI imports only (`@mui/material/Dialog`, `Button`, `IconButton`,
        `@mui/material/styles`), per AR-35 and the three shipped dialogs' header comment.
        Props (FD2/FD5):
        ```ts
        export type OrganismEditorOrigin = 'library' | 'battle';
        export interface OrganismEditorModalProps {
          open: boolean;
          /** Drives the contextual back label (UX-DR5). 'battle' is Story 4.24's entry point. */
          origin: OrganismEditorOrigin;
          /** Close ✕, the back label and Escape all route here. Story 4.23 guards it. */
          onClose(): void;
          /** Fired once the exit transition has finished — the parent hook's cue to release
           *  `inert` and restore focus (the `<UnsavedChangesDialog>` contract). */
          onExited?(): void;
        }
        ```
        `export function backLabelFor(origin: OrganismEditorOrigin): string` — `'Back to Library'`
        / `'Back to Battle'`; exported so the test pins both without rendering `'battle'`.
  - [x] `<Dialog fullScreen open={open} onClose={onClose} onTransitionExited={onExited}
        disableRestoreFocus aria-labelledby={TITLE_ID} slotProps={{ paper: { sx: { border: 'none',
        borderRadius: 0 } } }}>`. Comment **why** each prop: `onClose` receives Escape (and a
        backdrop click, which a fullScreen dialog cannot receive — say so) and is the single close
        channel 4.23 will guard; `disableRestoreFocus` because the parent hook owns focus (copy the
        `<UnsavedChangesDialog>` paragraph's WebKit reason); the `paper` override because the theme
        borders every dialog (`theme.ts:161-179`) and a full-viewport surface must not.
        `disableEscapeKeyDown` no longer exists in MUI v9 (`DeleteBattleDialog.tsx:70-73`) — do not
        reach for it.
  - [x] Structure: `<Shell>` (`styled('div')`: `display: flex; flex-direction: column; height:
        100%` — the paper is already `100%` of the viewport under `fullScreen`, so `100vh` is the
        mockup's, not ours) → `<EditorHeader>` (mockup `.editor-header`, `organism-editor.html:40-48`,
        as a CSS grid `gridTemplateColumns: '1fr auto 1fr'; alignItems: center; gap: 20px`) →
        `<EditorBody>` (`flex: 1; overflow: hidden; minHeight: 0` — empty; one comment naming Story
        4.4). Header contents:
        - `<BackButton type="button" onClick={onClose}>` — copy `<SidebarFooter>`'s `BackButton`
          styles minus `width: 100%` (`justify-self: start`): `--gol-border-control` boundary
          (SC 1.4.11 — trap 10), `--gol-text-primary` label, 11px/600 uppercase, **no
          `transition`** (trap 11), the house focus ring. Content: `<span
          aria-hidden="true">←</span> {backLabelFor(origin)}`.
        - `<Title as h2 id={TITLE_ID}>Organism Editor</Title>` — copy `<BattleHeader>`'s `Title`
          (18px/600, `--gol-letter-spacing-title`, `textTransform: uppercase`, `margin: 0`),
          `justify-self: center; text-align: center`. `<h2>`, not `<h1>`: the page's `<h1>` is
          `aria-hidden` behind the modal but still the document's, and the Gallery's delete dialog
          already proves an `<h2>` `DialogTitle` over an aria-hidden `<h1>` passes axe on every
          project.
        - `<Actions>` (`justify-self: end; display: flex; gap: 12px; align-items: center`) →
          `<Button type="button" variant="contained" disabled sx={BUTTON_SX}>Save</Button>` with
          the comment: *inert until Story 4.16 wires persistence; genuinely `disabled`, not a
          no-op, because a control that looks live and does nothing is the worse lie (NFR-4.1);
          axe exempts disabled controls from `color-contrast` and MUI's own Button transition is
          harmless here because this button never changes state in this story — the story that
          enables it must re-read `EditorStatusBar.tsx:177-190` before adding any state flip.*
          `BUTTON_SX = { fontSize: '13px', padding: '12px 24px' }` — the same call-site pair the
          three dialogs carry and the reason it is not in the theme (`theme.ts:147-150`).
          Then `<IconButton type="button" aria-label="Close" onClick={onClose}
          sx={{ color: 'var(--gol-text-primary)' }}><span aria-hidden="true">✕</span></IconButton>`.
  - [x] Header comment: mockup line refs; the FD1 divergence (this header follows the epics AC /
        UX-DR5, not the 2026-06-01 mockup update — cite `ORGANISM-EDITOR-UPDATES.md:9-20`); cite
        `(Story 4.3)`, `(AR-35)`, `(AR-33)` (own dirty scope — arrives in 4.23, the shell is where it
        will live), `(M5)` (the `'battle'` origin), `(FR-1.2)` — spelled exactly as `spec:check`
        tokenises them.
  - [x] `OrganismEditorModal.test.tsx`: renders `role="dialog"` with accessible name `Organism
        Editor` (`toHaveAccessibleName`); heading level 2 `Organism Editor`; back button
        accessible name `Back to Library` for `origin="library"` and `Back to Battle` for
        `origin="battle"` (render both — the prop is the seam); `backLabelFor` table; `Save` is a
        `button` with `disabled`; `Close` button present; clicking Back → `onClose` once; clicking
        Close → `onClose` once; `userEvent.keyboard('{Escape}')` → `onClose` once; clicking Save does
        **nothing** (no handler to spy — assert `onClose` not called); `open={false}` renders no
        dialog in `document.body` (MUI unmounts — the `<DeleteBattleDialog>` note); axe on
        `document.body` with the dialog open → `[]`. Dialog is **portalled**: query `screen` /
        `document.body`, never `container`.

- [x] **Task 2 — `useOrganismEditorModal` (the parent-side lifecycle)** (AC: 2, 4)
  - [x] `apps/web/lib/organisms/useOrganismEditorModal.ts` — the `useLeaveGuard` shape, in
        `lib/organisms/` beside 4.2's helpers, **not** beside the modal (FD5: a value import of the
        modal module from a hook the Library calls during render would pull the whole Dialog stack
        back into first load and defeat the `next/dynamic` boundary with no test able to catch it
        — copy `useLeaveGuard.ts:13-30`'s three ⚠️ paragraphs, adapted). `import type {
        OrganismEditorModalProps, OrganismEditorOrigin } from
        '@/components/organisms/editor/OrganismEditorModal'` — **`import type`, and it must stay
        that way** (AC7 measures it).
        ```ts
        export interface UseOrganismEditorModalResult {
          /** Wire to the create button. Story 4.17 adds the edit entry beside it. */
          requestCreate(): void;
          /** "The editor is on screen in some form" — open OR still fading out. Gates the
           *  caller's conditional mount so the lazy chunk is never requested until the first
           *  open (the `useLeaveGuard.confirming` contract). */
          mounted: boolean;
          /** Spread onto `<OrganismEditorModal {...modalProps} />`. */
          modalProps: OrganismEditorModalProps;
        }
        export function useOrganismEditorModal(origin: OrganismEditorOrigin): UseOrganismEditorModalResult
        ```
        Two state cells (`mounted`, `dialogOpen`) — copy the "two cells, not one" paragraph from
        `useLeaveGuard.ts:81-93` verbatim in spirit; `useInertBackground(mounted)`; the focus
        effect keyed on `[mounted]` with the `focusIsLoose` predicate and
        `document.querySelector<HTMLElement>('[data-create-organism]')?.focus()`; `requestCreate`
        sets both cells and arms `restoreFocusRef`; `handleClose = () => setDialogOpen(false)`;
        `handleExited = () => setMounted(false)`; `modalProps` via `useMemo`. Keep the
        `useInertBackground` call **above** the focus effect **in this hook** — the
        cleanup-before-setup ordering paragraph (`useLeaveGuard.ts:114-125`) is the reason, and it
        is worth restating in one sentence here rather than by reference alone.
        ❌ No `mode: 'create' | 'edit'`, no organism argument, no dirty flag, no save — 4.16/4.17/4.23
        bring theirs. A prop nothing reads is a claim, not a seam.
  - [x] `useOrganismEditorModal.test.tsx` — copy `useLeaveGuard.test.tsx`'s harness (a tiny
        host component rendering a button with `data-create-organism` and the modal **statically**
        — the test may import it, the hook may not) and pin: `requestCreate` → `mounted` true,
        `modalProps.open` true; `onClose` → `open` false while `mounted` stays true until
        `onExited`; the background stays `inert` across the exit window and is released on
        `onExited` (via the `isInert()` predicate `useInertBackground.test.tsx` uses — jsdom has no
        native `inert`); focus returns to the `[data-create-organism]` element when focus is loose
        (body, and inside the closing dialog), and is **not** stolen when the user focused
        something real; a second open after a full cycle re-arms; `modalProps` identity is stable
        across unrelated re-renders.

- [x] **Task 3 — Wire the Library** (AC: 1, 2, 6, 7)
  - [x] `OrganismLibrary.tsx`: `const OrganismEditorModal = dynamic(() =>
        import('./editor/OrganismEditorModal'), { ssr: false })` at module scope, with a doc
        comment adapted from `BattlePage.tsx:34-50` — the Dialog stack measured **+18.1 KB gzip**
        static (Story 1.13, re-confirmed 2.14); `/organisms` has 11.5 KB of headroom; `ssr: false`
        because a closed dialog must never be prerendered into the static HTML. Then `const {
        requestCreate, mounted, modalProps } = useOrganismEditorModal('library')`.
  - [x] Replace the `:220-221` slot comment with `<CreateButton type="button"
        onClick={requestCreate} data-create-organism="">+ Create New Organism</CreateButton>` as
        the **first** child of `<ToolbarLeft>` (mockup `:405-406` — button precedes the search
        container; this also gives the tab order AC6 names). `CreateButton = styled('button')` per
        AC1; the `transform: translateY(-1px)` hover lift from the mockup is fine (transform is
        not a colour), the `transition: all` is not.
  - [x] Mount `{mounted && <OrganismEditorModal {...modalProps} />}` **after** the `aria-busy`
        wrapper, inside the `<section>`. Comment: gated on `mounted`, not `open`, so the chunk is
        fetched on first open only, and the fade-out completes before unmount (the `useLeaveGuard`
        contract). The `Dialog` portals to `document.body` regardless of where this sits.
  - [x] Update the component's header doc (`:151-159`): the Library now renders the editor entry;
        still no `battles` prop (4.19). Cite `(Story 4.3)`.
  - [x] `OrganismLibrary.test.tsx`: add (a) the create button renders in loading, error **and**
        ready states with accessible name `+ Create New Organism`; (b) clicking it → `await
        screen.findByRole('dialog', { name: 'Organism Editor' })` — **`find*`, never `get*`**, the
        chunk resolves on a microtask (`BattleEditorView.test.tsx:989-991`); (c) Escape →
        `waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())` and focus is
        on the create button (`toHaveFocus()`); (d) the same for Close; (e) view-only: `list` still
        called once, `save`/`delete`/`replaceAll` never, across an open/close cycle; (f) tab order
        retargeted: search input → create button → first card → second card. **Do not** wrap
        `next/dynamic` in a `vi.mock` — the asynchrony is the thing under test.

- [x] **Task 4 — e2e against the served static export** (AC: 2, 4, 5, 6)
  - [x] `apps/web/e2e/organisms.spec.ts`: new `test.describe('editor modal shell (Story 4.3)')`
        reusing the file's console/pageerror capture and the `getByText("Conway's Classic")`
        hydration signal. Tests:
        1. **Opens as a labelled dialog**: click `getByRole('button', { name: '+ Create New
           Organism' })` → `getByRole('dialog', { name: 'Organism Editor' })` visible; heading
           level 2 `Organism Editor`; `Back to Library`, `Save` (`toBeDisabled()`), `Close`
           buttons present. `errors` `toEqual([])`.
        2. **Focus is trapped and the background is inert**: after open, `document.activeElement`
           is inside `[role="dialog"]`; press Tab 4× and assert it stays inside each time
           (`deleteBattle.spec.ts:183-237`, including the programmatic-`focus()`-on-background
           no-op check against the search input).
        3. **Close / Back / Escape each close and return focus to the create button** — three
           tests or one parameterised loop; assert `not.toBeVisible()` then the create button
           `toBeFocused()`. This is the assertion `useDeleteBattleDialog`'s history says only a
           real browser can make (`setTimeout(0)` passed Chromium/Firefox and failed WebKit).
        4. **axe with the dialog open and settled** → `[]` (opacity-settle first, AC5). This is the
           only real-browser check of the header's contrast pairs and of the fullScreen paper.
        5. **Prerender proof**: the raw HTML (`page.request.get('/organisms')`, the file's existing
           pattern) contains the create button text and **no** `role="dialog"`.
  - [x] Keyboard test from 4.2 (`search input → first card`): insert the create button between
        them; keep the WebKit `Alt+Tab` branch as is.

- [x] **Task 5 — Bundle measurement, docs, verification** (AC: 6, 7, 8)
  - [x] Measure before (on `main`) and after Task 4; record all four routes in the Dev Agent
        Record. Do **not** edit `budgetGzipKb`. Confirm the Dialog stack is in a **separate
        chunk**: the `/organisms` delta must be single-digit KB, and `ls apps/web/out/_next/static/chunks`
        should show a new chunk appearing only when the modal is opened (network tab or the
        e2e's request log — one line of evidence is enough).
  - [x] `deferred-work.md`: add `## Deferred from: Story 4-3-editor-modal-shell (2026-09-14)`
        with: (1) **the header/footer spec divergence** (FD1) — `organism-editor-design.md:101-126`
        + epics UX-DR5 (header: Back / title / Save / Close) vs `ORGANISM-EDITOR-UPDATES.md:9-20` +
        `organism-editor.html:895-903,1222-1234` (name in header, Back in the sidebar footer, Save
        in an editor footer, no Close); this story followed the AC; the UX docs need a
        reconciliation touch — **not a code change, and do not edit either spec from a story**;
        (2) the disabled-Save cross-fade note handed to Story 4.16 (FD4); (3) MUI `Button`'s
        built-in colour transition on the header's Save — first MUI `Button` whose enabled state
        will flip on a scanned route once 4.16 lands (same axe mid-fade class as
        `EditorStatusBar.tsx:177-190`).
  - [x] `docs/project-context.md`: no rule change expected. If the dev hits a new "compiles but
        wrong" trap (a fullScreen-Dialog or dynamic-import gotcha not already in this file), add one
        line under *React — three state categories* or *MUI*; otherwise leave it.
  - [x] `npm run ci > /tmp/ci.log 2>&1; echo $?` — paste the exit code, the four bundle lines and
        the e2e summary into the Dev Agent Record. Push to `story/4-3-editor-modal-shell`; check
        `gh run list --limit 1` after the PR opens.

### Review Findings

Code review 2026-09-14 (Fable 5.1 reviewing an Opus implementation; Blind Hunter + Edge Case
Hunter + Acceptance Auditor, 32 raw findings, 12 dismissed as noise or spec-mandated shape).

- [x] [Review][Decision] **Toolbar tab order: `create → search → card` (shipped) or
      `search → create → card` (AC6 / Task 3(f) / Task 4)?** — The two orders trace to different
      sources and no spec settles it. For the shipped order: Task 3 ("**first** child of
      `<ToolbarLeft>`"), the Library mockup (`organism-library.html:406-408` renders
      `.create-button` before `.search-container`), and SC 2.4.3 (DOM order = visual order; a CSS
      `order` swap would break it). For the AC's order: AC6 `:110-112`, Task 3(f) `:254-255`,
      Task 4's last sub-item `:278-279` — all of which trace to Story 4.2's reserved slot sitting
      *after* `<SearchField>` (`4-2-organism-card-grid.md:216`), a placement, not a design
      decision. `epics.md:1017-1027` and the UX docs say nothing about toolbar order. **Options:**
      (1) ratify the shipped/mockup order — AC6, Task 3(f) and Task 4's last sub-item become stale
      text and nothing else moves; (2) enforce the AC — move `<CreateButton>` after
      `<SearchField>` in `OrganismLibrary.tsx` and retarget the unit tab-order test and the e2e
      "precedes the search input" test. AC6 also claims the 4.2 keyboard e2e "is updated"; it was
      not (correctly, under the shipped order — no new stop sits on `search → card`).
      ✅ **Decided by Sidiar (2026-09-14): option (1) — the shipped order is ratified.** No code
      moves; AC6, Task 3(f) and Task 4's last sub-item are annotated as stale.
- [x] [Review][Patch] e2e `openEditor` "settled" wait reads `opacity` off the `role="dialog"`
      paper, but MUI's `Fade` wraps `.MuiDialog-container` (Dialog.js: Transition → Container →
      Paper) and `getComputedStyle` reports an element's own opacity — the wait never waited
      [apps/web/e2e/organisms.spec.ts:252-258]
- [x] [Review][Patch] Focus-trap e2e passes vacuously: `activeElement?.closest(…) !== null` is
      `true` for a null `activeElement`, and a plain `Tab` on WebKit never leaves the container
      (the file's own Alt+Tab note) so four "still inside" checks proved nothing — now `!!`, the
      WebKit key, and both Back and Close must be seen focused
      [apps/web/e2e/organisms.spec.ts:329-357]
- [x] [Review][Patch] "Chunk requested on open" proof accepted any script growth, including a
      late Next `<Link>` prefetch — now settles `networkidle` first and asserts a URL absent from
      the pre-click set [apps/web/e2e/organisms.spec.ts:276-286]
- [x] [Review][Patch] `ssr: false` comment said prerendering "would put the whole stack back into
      the route's HTML"; a closed `Dialog` emits no markup either way — the flag is about the
      server bundle, as the story's own Dev Notes (`:433-436`) say
      [apps/web/components/organisms/OrganismLibrary.tsx:176-178]
- [x] [Review][Patch] `Stories 2.13/2.14/2.15` is a form `spec:check` cannot tokenise (the
      regex is `Story \d+\.\d+`), so three pointers were silently exempt
      [apps/web/components/organisms/editor/OrganismEditorModal.tsx:82]
- [x] [Review][Patch] Dev Agent Record counts: 6 (not 7) new Library tests, 8 (not 9) new e2e
      per project [docs/implementation-artifacts/4-3-editor-modal-shell.md:545,565,568]
- [x] [Review][Patch] Completion Notes labelled Task 5's deferred-work items as if all three were
      delivered as listed; items (2) and (3) were folded into one bullet and the tab-order item
      added [docs/implementation-artifacts/4-3-editor-modal-shell.md:604-606]
- [x] [Review][Patch] AC8 / Task 5's last sub-item is ticked while the record says the CI check
      is "pending, not done" — performed by this review once the PR exists: run `34839513811`
      on `0ea9392`, quality + e2e success; recorded in the Dev Agent Record
      [docs/implementation-artifacts/4-3-editor-modal-shell.md:300-302,575-576]
- [x] [Review][Defer] `useOrganismEditorModal.test.tsx`'s `afterEach` removes every
      `[aria-hidden="true"]` node in the document — including the still-mounted dialog's glyph
      spans and the RTL container — before RTL's own cleanup; copied verbatim from
      `useLeaveGuard.test.tsx:127` [apps/web/lib/organisms/useOrganismEditorModal.test.tsx:100-103]
      — deferred, pre-existing idiom
- [x] [Review][Defer] `deleteBattle.spec.ts:314-317` has the same paper-not-container opacity
      wait; its `waitForTimeout(300)` is what actually settles it [apps/web/e2e/deleteBattle.spec.ts:316]
      — deferred, pre-existing

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — The header follows the epics AC (UX-DR5), not the 2026-06-01 mockup revision. Flagged,
  not silently picked.** Three sources disagree. `organism-editor-design.md:101-126` and
  `epics.md:230` (UX-DR5) put **Back / centred title / Save + Close** in a header bar; the
  readiness-reviewed AC for this story says the same. `ORGANISM-EDITOR-UPDATES.md:9-20` (dated
  2026-06-01) and the shipped mockup `organism-editor.html` moved the organism **name** into the
  header, Back into the left sidebar's footer, Save into an editor footer beside the FR-1.7 usage
  indicator, and removed Close. The AC is the story's authority (`project-context.md` → spec
  authority order; the epics were validated against the UX docs on 2026-07-16 and kept the header
  form), and it is also the form that gives Escape/Close a visible control (UX-DR17 "Escape
  closes"). The mockup's footer is **not lost**: Story 4.20's AC says "Given the editor footer" —
  the usage indicator lands there, and 4.20 may put Save beside it if the UX touch says so. This
  story ships the header only, and records the divergence in `deferred-work.md` for the next UX
  touch (Task 5). **Do not build a footer here** — an empty band is a dead surface.

- **FD2 — `origin` is a prop from day one; only `'library'` is reachable.** The AC asks for a
  *contextual* back label and UX-DR5 names both labels. The label is a pure, exported function of
  `origin`, unit-tested for both values, and `'battle'` is the seam Stories 4.24/4.25 plug into
  (gated behind Epic 3 in `lane-gates.yaml`). This is **not** the speculative-prop trap
  `<BattleHeader>` records: the AC itself names the contextual behaviour, the prop has exactly one
  consumer (the label) and the test exercises both branches. What is **not** declared: `mode`,
  `organism`, `onSave`, `dirty` — nothing reads them yet.

- **FD3 — Glyph `←`, accessible name `Back to Library`.** The AC writes `◄`, the design doc's
  ASCII stand-in; the mockup and every shipped back control (`<SidebarFooter>`, `<BackLink>`) use
  `←`. The glyph is `aria-hidden`, so the testable content is the text; matching the house glyph
  keeps the two back controls on adjacent surfaces visually consistent.

- **FD4 — Save is `disabled`, not a no-op.** Both are dead affordances; the readiness report
  accepted one (`:370,403`) as a within-epic seam. `disabled` is the honest form: it is announced
  as unavailable, skipped by Tab, and exempt from axe's `color-contrast` (axe-core 4.12
  `color-contrast-matches` returns false for disabled nodes — the fact `EditorStatusBar.tsx:181`
  records). The trap that comes with it is the **cross-fade** on the disabled→enabled edge, and
  MUI `Button` ships its own colour transition. It cannot bite in this story (the state never
  flips), so nothing is patched; Story 4.16 inherits the note (Task 5).

- **FD5 — The lifecycle hook lives in `lib/organisms/`, imports the modal's props as `import
  type`, and is called from the component that renders the modal.** All three are the
  `useLeaveGuard` rules, for the same reasons: a value import from a hook called during render
  would drag the Dialog stack into first load (AC7 is the only thing that would notice, and only
  as a number); `useInertBackground` and the focus-restore effect must be **parent** effects so
  MUI's focus-trap move (a child effect) has already happened; and the focus effect must follow the
  inert call *in the same hook* so React's cleanup-before-setup ordering releases `inert` before
  `focus()` runs (a spec-mandated no-op on an inert node). The Library is the only caller today;
  `<BattleEditorView>` is 4.24/4.25's.

- **FD6 — `components/organisms/editor/` is created now.** ~20 stories fill the editor. The
  `components/battle/simulation/` precedent (created empty 2026-09-08 so Epic 3 "writes into it
  rather than landing flat and being moved after") is the same call. `<OrganismEditorModal>` is
  its root; 4.4's columns are its first siblings. Nothing else moves.

- **FD7 — No `loading` fallback for the dynamic import.** The two shipped lazy dialogs render
  nothing while the chunk resolves (a few ms on a static host); a spinner for that window is
  chrome nobody asked for. If the dev measures a visible gap on the tablet project, say so in the
  record rather than adding one.

- **FD8 — No MUI `AppBar`/`Toolbar`/`DialogTitle` for the header.** The layout is a three-slot
  grid the MUI primitives do not express without `sx` overrides; `styled()` + tokens is the house
  idiom for static chrome (RFC-003 Decision 3, `<BattleHeader>`). MUI `Button`/`IconButton` **are**
  used for Save/Close — inside the lazy chunk they cost nothing on first load, and the theme's
  `MuiButton` override already gives them the mockup's uppercase/600 treatment.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/OrganismLibrary.tsx:151-159, 208-229` | The file being modified: header doc, the toolbar and the create-button slot comment, the `aria-busy` wrapper the modal mounts after. |
| `apps/web/components/battle/UnsavedChangesDialog.tsx` | **Copy the Dialog props idiom** (`onClose` comment, `onTransitionExited`, `disableRestoreFocus` + WebKit reason, `BUTTON_SX`, per-component imports). |
| `apps/web/components/battle/BattlePage.tsx:34-50, 667-680, 794` | **Copy the `next/dynamic` call and its measurement comment**; how the hook is called from the renderer of the dialog; the conditional mount. |
| `apps/web/lib/battle/useLeaveGuard.ts` | **The hook to mirror**: two-cell lifecycle, `useInertBackground(mounted)`, focus effect with `focusIsLoose`, `import type`, the four ⚠️ paragraphs. |
| `apps/web/lib/battle/useLeaveGuard.test.tsx` | The harness shape for Task 2's test (host component, `isInert` predicate, focus assertions). |
| `apps/web/components/gallery/DeleteBattleDialog.tsx:150-260` | The DOM-lookup focus restore (`data-delete-battle-id`), why `setTimeout(0)` failed on WebKit, the "two states, not one" paragraph. |
| `apps/web/lib/useInertBackground.ts` | What `inert` covers, the MutationObserver that closes the lazy-dialog race (this modal is the third lazy consumer). |
| `apps/web/components/battle/SidebarFooter.tsx` | **Copy `BackButton`** (control border, no transition, aria-hidden glyph + sentence-case text). |
| `apps/web/components/battle/BattleHeader.tsx` | **Copy `Title`** (18px/600, uppercase via CSS, `--gol-letter-spacing-title`). |
| `apps/web/lib/theme.ts:137-185` | `MuiPaper.root` radius, `MuiDialog.paper` border/background, `MuiButton` uppercase — what the fullScreen paper must override at the call site and what Save/Close inherit. |
| `apps/web/components/battle/editor/EditorStatusBar.tsx:164-190` | The disabled-pair contrast numbers and the cross-fade trap FD4 hands to 4.16. |
| `apps/web/components/battle/editor/BattleEditorView.test.tsx:986-992` | `find*` not `get*` for a `next/dynamic` dialog. |
| `apps/web/e2e/deleteBattle.spec.ts:126-135, 183-320` | Escape, focus-trap, inert-background, focus-return and opacity-settled-axe assertions — **extend the patterns, do not fork them**. |
| `apps/web/e2e/organisms.spec.ts` | Hydration signal, WebKit `Alt+Tab` branch, raw-HTML prerender proof, the 4.2 describe block to sit beside. |
| `docs/planning-artifacts/ux-designs/…/organism-editor.html:32-60, 818-860` | `.editor-overlay`, `.editor-header`, `.back-btn`, `.btn-save` — the visual values (with FD1's caveat on *where* the mockup puts them). |
| `docs/planning-artifacts/ux-designs/…/organism-library.html:122-139, 405-406` | `.create-button` — fill, padding, hover, placement before the search box. |
| `scripts/check-bundle-size.mjs:92-100` | The `/organisms` entry (305 budget), the formula, "not a raise". |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.24/4.25 are gated on `epic-3`; this story touches none of Epic 3's surfaces (see Git intelligence). |

### Architecture compliance

- **AR-35** — per-component MUI imports; **dynamic import for the Organism Editor** is the
  architecture's own example of the heavy-component rule. `RFC-003:58,252` names the editor as
  *the* `Dialog` reachable from both the Library and the Battle Editor.
- **AR-33 / M5 / RFC-005 Decision 7** — the editor will own its **own** dirty scope, independent of
  the battle's; the shell is where that scope lives (4.23), and nothing in this story touches
  `useDirtyGuard` / `useLeaveGuard` or `<BattlePage>`. The `'battle'` origin exists so 4.24 can mount
  this same component over the mounted `<BattlePage>` — **no route change, ever** (Decision K.5;
  RFC-005 `:199` explains why a `/organism/[id]` route was rejected).
- **AR-2 / AR-27** — the modal receives **no repository** in this story (nothing to persist until
  4.16); when it does, it will be a prop typed to the interface, passed down from the page
  boundary. No Context, no `createRepositories()` below `page.tsx`.
- **RFC-005 Decision 1 / three state categories** — the modal lifecycle is ephemeral local
  `useState` in the parent hook; nothing persisted, nothing in refs but the focus-intent flag.
- **Decision J / RFC-003 Decision 3 / AR-46** — `styled()` + `var(--gol-*)` only; the fullScreen
  paper override is a call-site `sx` on a slot, which is the sanctioned place for per-instance
  values. No new tokens expected (`--gol-accent-hover` exists for the create button's hover).
- **AR-44 / UX-DR17** — `role="dialog"`, `aria-modal`, `aria-labelledby`, trapped focus, Escape,
  focus return; axe in jsdom **and** all four Playwright projects, with the dialog open.
- **NFR-4.1** — the create button is live; Save is `disabled` (the accepted seam); no footer, no
  placeholder columns, no `'battle'` control anywhere in UI.
- **Spec-id hygiene** — `spec:check` tokenises `AR-35`, `AR-33`, `AR-44`, `M5`, `FR-1.2`,
  `NFR-4.1`, `Decision K`, `RFC-003`, `RFC-005`, `Story 4.3`; write them exactly so. `UX-DR5`,
  `UX-DR17`, `FD*` and `deferred-work.md:NNN` are not checked.
- **Inherited `deferred-work.md` obligations:** `:187` (toolbar controls outside `aria-busy` —
  the create button obeys it); `:341` (disabled-control axe exemption — FD4 relies on the fact
  and inherits the cross-fade caveat); `:418`'s "still live as an option" (a lazy dialog returns
  the stack to on-demand — this story does exactly that on `/organisms` from the start); `:430`
  (the lazy-dialog inert race is closed by the shared hook — nothing to re-fix, but the test in
  Task 2 must still cover first-open).

### Library / framework notes (installed versions, no research needed)

- **MUI 9.3.1** — `Dialog` has `fullScreen` (`Dialog.d.ts:95`), `onTransitionExited`,
  `disableRestoreFocus`, `slotProps.paper`; `disableEscapeKeyDown` is **gone** (Escape always
  reaches `onClose` with reason `'escapeKeyDown'`). The fullScreen variant sets `margin: 0; width:
  100%; height: 100%; borderRadius: 0` on the paper — but the theme's `MuiPaper.root`
  `borderRadius: var(--gol-radius)` and `MuiDialog.paper` `border` are styleOverrides and win the
  cascade, hence the call-site `sx` (AC5). MUI marks body siblings `aria-hidden` and locks body
  scroll while open; `useInertBackground` adds `inert`.
- **Next 16.2.12, `output: 'export'`** — `dynamic(() => import(…), { ssr: false })` at module
  scope, exactly as the two shipped call sites; the import path is relative
  (`'./editor/OrganismEditorModal'`). A closed `Dialog` renders nothing, so nothing lands in the
  prerendered HTML even without `ssr: false` — the flag is about the **chunk**, not the markup.
- **React 19.2** — `inert` is a boolean prop; `useId()` if the title id needs to be unique per
  instance (a constant is fine while one editor can exist at a time — say which and why).
- **axe-core 4.12.1** (both runners) — `color-contrast` skips `disabled` and `inert` nodes;
  `aria-hidden-focus` is what `inert` keeps honest; heading-order over an aria-hidden `<h1>` is
  proven green by the Gallery's delete-dialog scan.
- **@testing-library/user-event 14** — `userEvent.setup()`; `keyboard('{Escape}')` reaches MUI's
  key handler on the focused element inside the dialog (focus the dialog or a button first).
- **Playwright 1.62** — `getByRole('dialog', { name })`, `toBeFocused()`, `toHaveCSS('opacity',
  '1')`; the `tablet` project is iPad Pro 11 landscape (1194 px) — fullScreen fills it.

### Testing standards

- `apps/web` has **no coverage gate** — every test above guards a named failure: the chunk leaking
  into first load (AC7's number), focus dropping to `<body>` on WebKit (the DOM-lookup restore),
  Tab escaping the dialog (trap + inert), a control vanishing while the list loads (`:187`), the
  create button not in the SSR body, the header's accessible names (`Back to Library`, `Organism
  Editor`, `Save`, `Close`), Escape closing, the `'battle'` label branch, the exit-transition
  window (inert held until `onExited`).
- Never snapshot the dialog; never assert colours in jsdom beyond inline styles; contrast is the
  e2e axe run's job (AC5).
- `lib/organisms/*` stays React-free **except** the hook (a `.ts` hook file with a `.test.tsx`
  harness, the `useLeaveGuard` layout).
- The 4.2 tests must not be edited to make the wiring pass beyond the tab-order retarget AC6
  names; if another one fails, the wiring is wrong, not the test.

### Previous story intelligence (Story 4.2)

- The toolbar's create-button slot is reserved at `OrganismLibrary.tsx:236-237` with this story's
  name on it; `ToolbarLeft` already has `gap: 15px` for the button + search pair (mockup
  `.toolbar-left`). Search state, sort, filter, badge — **settled, do not revisit**.
- 4.2's review found four assertion-hygiene classes worth not repeating: substring matches that a
  stale state also satisfies (`toHaveTextContent('4 Organisms')` vs `/^4 Organisms$/`), `'' === ''`
  passes on a failed style read, spy lists that do not match the test title, and prescriptive
  ARIA that is prohibited on the element (`aria-label` on a role-less `<span>`). The `IconButton`
  here **is** a button — `aria-label` is correct on it.
- 4.2 measured `/organisms` at **293.5 KB** (11.5 KB headroom) and reminded that `themes.css` is
  global (a token change moves every route). This story adds no token.
- The e2e WebKit branch (`Alt+Tab`) and the `find*`-for-lazy rule are the two engine facts most
  likely to cost a retry; both are cited above.
- 4.2's card-as-tab-stop policy (FD5 there) is **untouched** — cards stay `tabIndex={0}` articles;
  4.17 decides.

### Git intelligence

Last 12 commits on `main`: Story 4.2 (feat + review fixes — `components/organisms/`,
`lib/organisms/`, `lib/displayOrganisms.ts`, `OrganismRoster.tsx` (2 lines), `themes.css`,
`e2e/organisms.spec.ts`), Story 3.9 (`lib/canvas/*`, `scripts/check-bench-budget.mjs`,
`performance-baseline-validation.md`), the GitHub Pages deploy workflow and the ops runbook (docs
only). **Shared surfaces with the open Epic 3 lane (3.10–3.19):** none. 3.10 is `lib/simulation`-
side hooks, 3.11+ reshape `<BattlePage>`, `<BattleHeader>` and `components/battle/simulation/`;
3.17 touches `<BattleGallery>`. This story writes only `components/organisms/**`, `lib/organisms/**`,
`e2e/organisms.spec.ts` and docs. `useInertBackground.ts`, `useLeaveGuard.ts`, `BattlePage.tsx`
and `theme.ts` are **read, not modified**. 3.19's "hotkeys suspended while a dialog is open" will
key off the same `[role="dialog"]` presence this modal produces — nothing for this story to do.

### Project Structure Notes

- New: `components/organisms/editor/OrganismEditorModal.tsx` (+ test),
  `lib/organisms/useOrganismEditorModal.ts` (+ `.test.tsx`).
- Modified: `components/organisms/OrganismLibrary.tsx` (+ test), `e2e/organisms.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Naming: components PascalCase `.tsx`; hooks camelCase `use*.ts`, never dotted. The `editor/`
  subfolder under `components/organisms/` is the Epic 4 counterpart of `components/battle/editor/`.
- Untouched on purpose: `OrganismCard.tsx`, `app/(gallery)/organisms/page.tsx` (+ test),
  `AppShell`/`AppNav`, `lib/theme.ts`, `themes.css`, `useInertBackground.ts`, everything under
  `components/battle/`, `packages/*`, `scripts/check-bundle-size.mjs` budgets.

### References

- `docs/planning-artifacts/epics.md:1017-1027` (Story 4.3 ACs), `:34-35` FR-1.2/1.3, `:64`
  FR-3.12, `:135` NFR-4.1, `:201` AR-33, `:206` AR-35, `:218` AR-44, `:230-231` UX-DR5/6, `:241-242`
  UX-DR16/17, `:1029-1039` (4.4 columns), `:1189` (4.16 Save live), `:1235` (4.20 footer),
  `:1264-1300` (4.23 guard, 4.24/4.25 battle origin).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:119-124` FR-1.2/1.3, `:155-161`
  FR-1.7 footer indicator (why the footer is 4.20's).
- `docs/planning-artifacts/architecture.md:349-353` M3/M5/M6/M7 (modal-over-battle, names-only
  popover), `:381-383` FR→RFC map.
- `docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md:53-58` (component inventory —
  the editor `Dialog`), `:78-86` (import discipline), `:247-253` (dynamic import for the editor);
  `RFC-005-application-state-modes-undo.md:57, 140-171, 197-199, 281-299, 394` (tree, modal over
  `<BattlePage>`, two dirty scopes, where the editor mounts).
- `docs/planning-artifacts/component-tree-battle-page.md:92, 350, 424, 440` (`<OrganismEditorModal>`
  lazy, own dirty scope), `:378` (hotkeys suspended while a dialog is open — 3.19).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:8-49,
  53-75, 101-126, 520-567, 634-660, 723-746`; `ORGANISM-EDITOR-UPDATES.md:9-49, 104-114` (the
  divergence FD1 records); `clinical-lab-theme/organism-editor.html:32-60, 818-860, 895-903,
  1222-1234, 1343-1357`; `organism-library.html:122-139, 405-406`.
- `docs/planning-artifacts/implementation-readiness-report-2026-07-16.md:347, 370, 403` (inert
  Save accepted as a within-epic seam).
- `docs/implementation-artifacts/4-2-organism-card-grid.md:195-217, 314-388, 391-452, 674-687`
  (the slot, review classes, forced decisions, bundle figures).
- `docs/implementation-artifacts/deferred-work.md:187, 341, 418, 430, 699-716`.
- `docs/implementation-artifacts/lane-gates.yaml` (4.24/4.25 gated on `epic-3`).
- `docs/project-context.md` — Framework rules (repositories injected, three state categories,
  route groups / no route for modes), MUI rules (one theme, `styled()` + tokens), Testing rules
  (axe, no coverage padding, never snapshot), Code Quality (AR-46, `spec:check`, comments explain
  why), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5), via `bmad-dev-story` on branch `story/4-3-editor-modal-shell`
(baseline `591f45b`).

### Debug Log References

- **Red → green order followed per task.** Task 1's test failed on the missing module, Task 2's on
  the missing hook, Task 3's six new Library tests failed against the unwired Library (14
  existing stayed green) — then each went green without touching an existing assertion beyond the
  AC6 tab-order retarget.
- **`user.click` refuses a disabled MUI `Button`** — MUI's `:disabled` sets `pointer-events: none`
  and user-event 14 throws rather than click through it. That refusal is itself the proof a
  pointer cannot reach Save; the "does nothing" test dispatches a raw `fireEvent.click` to cover
  the one path that bypasses pointer-events (recorded in the test). Not a project-context rule —
  a testing-library fact, not a "compiles but wrong" trap.
- **Bundle, before (origin/main `591f45b`) → after:**
  - `/` 330.9 → **331.5 KB** gzip (budget 340; +0.6)
  - `/battle` 306.2 → **306.1 KB** (budget 310; −0.1)
  - `/battle/new` 306.1 → **306.0 KB** (budget 310; −0.1)
  - `/organisms` 293.5 → **295.2 KB** (budget 305; **+1.7**, inside the expected +1 to +3)
  - No budget edited. Chunk count 29 → 31. The editor's chunk (`0c0nh0huqy65e.js`, **2.3 KB
    gzip**) is referenced by **no** prerendered HTML (`organisms.html`, `index.html` both 0
    hits), and the e2e's "opens as a labelled full-screen dialog" test asserts the set of script
    requests grows on the click — the on-demand proof AC7 asks for. `/`'s +0.6 KB is 0.1 over the
    ±0.5 noise band and is **not chunk-diffed**: `/` mounts nothing from this story, so it is a
    shared-chunk boundary shift; flagged rather than attributed (Story 4.1's lesson).
- **Unit:** `vitest run` in `apps/web` — 71 files, **1051 passed**, 0 failed (10 new in
  `OrganismEditorModal.test.tsx`, 8 in `useOrganismEditorModal.test.tsx`, 6 in the Library's
  Story 4.3 block; 1 retargeted).
- **e2e:** `playwright test e2e/organisms.spec.ts` — **68 passed** across chromium / firefox /
  webkit / tablet (17 per project; 8 new per project including the three close channels' WebKit
  focus-return and the settled-dialog axe scan). Duration 37.0 s.
- **`npm run ci > ci.log 2>&1; echo $?` → `0`.** typecheck · lint · format:check · spec:check ·
  boundary:check · coverage (domain 100 / simulation 100 / persistence 99.19 / web 95.65 stmts,
  reported not gated) · build · bundle (the four lines above, all ✓) · bench + bench:check
  (`✓ within budget (9.025 ms headroom, 54.2% of the frame)`) · e2e **412 passed (2.7 m)** across
  all four projects.
- **`gh run list --limit 1`** — not run by the dev step (the PR is opened by the lane's review
  step, and the CI check belongs with it). **Done in review, 2026-09-14:** PR #33 → run
  `34839513811` on `0ea9392` — `quality` success, `e2e` success, `deploy` skipped (`gh run view
  34839513811`). Read, not inferred.

### Completion Notes List

- **Task 1 — `<OrganismEditorModal>`** at `apps/web/components/organisms/editor/` (new folder,
  FD6). `Dialog fullScreen` + `disableRestoreFocus` + `onTransitionExited` + call-site
  `slotProps.paper.sx = { border: 'none', borderRadius: 0 }`; three-slot `styled('header')` grid
  (Back / centred `<h2>` / Save + Close); empty `EditorBody`. `backLabelFor(origin)` exported and
  pinned for both origins. Save is genuinely `disabled` (FD4). No `autoFocus`, no footer, no
  placeholder text, no `mode`/`organism`/`onSave`/`dirty` props. The e2e additionally checks the
  paper's bounding box equals the viewport and that border-width / radius are `0px`.
- **Task 2 — `useOrganismEditorModal`** at `apps/web/lib/organisms/` (FD5): two cells
  (`mounted`, `dialogOpen`), `useInertBackground(mounted)` **above** the focus effect in the same
  hook, `focusIsLoose` predicate, `[data-create-organism]` DOM lookup, `useMemo`'d `modalProps`.
  The modal's props are `import type` — the test file imports the modal statically; the hook never
  does.
- **Task 3 — Library wiring:** `dynamic(() => import('./editor/OrganismEditorModal'), { ssr: false
  })` at module scope; `<CreateButton>` (`styled('button')`, mockup `.create-button`, hover lift
  kept, `transition: all` dropped) as the **first** child of `<ToolbarLeft>`, rendered in every
  status; `{editorMounted && <OrganismEditorModal {...modalProps} />}` after the `aria-busy`
  wrapper. `next/dynamic` is **not** mocked in the tests — every first dialog query is `find*`.
- **Task 4 — e2e block `editor modal shell (Story 4.3)`:** labelled dialog + header controls +
  fullScreen paper + on-demand chunk request; create-button Tab-reachability (Alt+Tab on WebKit)
  and its precedence over the search input; focus trap (4 Tabs stay inside) + inert background
  (raw locator, `closest('[inert]')`, programmatic `focus()` no-op); Close / Back / Escape each
  close and return focus to the create button (parameterised); axe with the dialog open and
  settled (opacity 1 + 300 ms for the Button's own transition); prerender proof (button element
  in the raw HTML, no `role="dialog"`, no "Organism Editor").
- **Task 5 — docs:** `deferred-work.md` gains the Story 4.3 section: (1) the header/footer
  three-way spec divergence (FD1) as a UX reconciliation touch; (2) Task 5's items (2) and (3)
  folded into ONE bullet — the disabled-Save cross-fade note for Story 4.16 already names MUI
  `Button`'s own 250 ms transition and the `EditorStatusBar` ratios, so a second bullet would
  have said the same thing twice; (3) the toolbar tab-order self-contradiction and how it was
  resolved — not on Task 5's list, added because it is a reviewer's decision, not the dev's.
  `project-context.md` unchanged — no new "compiles but wrong" trap surfaced.
- **⚠️ Deviation from the story text, flagged for review (not silently picked):** AC6 and Task 4
  wrote the toolbar tab order as `search input → create button → first card`; Task 3 and the
  mockup (`organism-library.html:405-406`) put the button **before** the search container as the
  first child of `<ToolbarLeft>`. Both cannot be true. The mockup/Task 3 placement was followed
  because DOM order then matches visual order (SC 2.4.3 — a CSS `order` swap to satisfy the AC's
  order would create a focus-order/visual-order mismatch). Real order: **create button → search
  input → first card → second card**; the unit tab-order test and the new e2e pin exactly that,
  and the 4.2 e2e keyboard test (`search → card`) is **unchanged** because no new stop sits on
  that path. If the AC's order was the intent, the fix is a two-line move plus retargeting the two
  tests. Recorded in `deferred-work.md` as well.
- **FD7 (no `loading` fallback):** no visible gap observed on the tablet project — the chunk
  resolves well inside the Fade's 225 ms on the served static export.
- **Verification summary:** typecheck 0 · eslint 0 on touched dirs · prettier clean ·
  `spec:check` ✓ (227 ids resolve) · unit 1051/1051 · e2e organisms 68/68 · bundle gate ✓ ·
  full `npm run ci` exit **0** (e2e 412/412).

### File List

- `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (new)
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` (new)
- `apps/web/lib/organisms/useOrganismEditorModal.ts` (new)
- `apps/web/lib/organisms/useOrganismEditorModal.test.tsx` (new)
- `apps/web/components/organisms/OrganismLibrary.tsx` (modified)
- `apps/web/components/organisms/OrganismLibrary.test.tsx` (modified)
- `apps/web/e2e/organisms.spec.ts` (modified)
- `docs/implementation-artifacts/deferred-work.md` (modified)
- `docs/implementation-artifacts/4-3-editor-modal-shell.md` (this file)
- `docs/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-09-14 — Story 4.3 implemented: `<OrganismEditorModal>` shell (full-screen MUI Dialog,
  header with contextual Back / centred title / disabled Save + Close), `useOrganismEditorModal`
  parent-side lifecycle (inert window, DOM-lookup focus restore), "+ Create New Organism" wired
  into the Library through `next/dynamic`; unit + e2e coverage; `deferred-work.md` entries for the
  FD1 spec divergence, the 4.16 cross-fade note and the tab-order resolution.

Dev Model: opus   # architecture-shaping: fixes the lazy-load boundary, the parent-side lifecycle hook (useOrganismEditorModal), the origin seam 4.24/4.25 plug into, the components/organisms/editor/ home and the header contract that 4.4-4.25 build on, and resolves a header-vs-footer spec divergence (FD1) rather than following an existing pattern
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 23s | 12 | 2,164 | 4,114 | 360,786 | 367,076 |
| Step 1 — create-story | opus-5 | 1 | 10m 48s | 166 | 46,577 | 485,412 | 12,555,577 | 13,087,732 |
| Step 2 — dev-story | opus-5 | 1 | 16m 42s | 262 | 59,218 | 288,786 | 19,665,231 | 20,013,497 |
| Step 3 — code review + PR | fable-5-1 | 5 | 1h 58m | 6,568 | 133,141 | 2,540,815 | 25,666,176 | 28,346,700 |
| _of which the orchestrator_ | opus-5 | — | — | 72 | 12,844 | 112,428 | 2,410,506 | 2,535,850 |
| **Total (create-story → PR ready)** | | 7 | **2h 25m** | 7,008 | 241,100 | 3,319,127 | 58,247,770 | **61,815,005** |

Run started 2026-09-14 11:24 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
