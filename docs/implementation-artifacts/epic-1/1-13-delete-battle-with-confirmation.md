---
baseline_commit: d49ce59
---

# Story 1.13: Delete Battle with Confirmation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to delete battles I no longer need, with a confirmation step,
so that I can curate my collection without fear of accidental loss.

## Acceptance Criteria

1. **Given** a battle tile, **When** its delete action is invoked, **Then** a confirmation dialog
   names the battle before anything happens (FR-7.7)
2. **Given** the dialog, **When** confirmed, **Then** the battle is removed from storage and the
   Gallery updates; **When** cancelled, **Then** nothing changes
3. **And** deleting a battle never deletes organisms (shared library is workspace-level, FR-7.15
   data model)
4. **Given** the last battle is deleted, **When** the Gallery refreshes, **Then** the Story 1.12
   empty state appears
5. **And** the dialog is keyboard-operable (Escape cancels, focus trapped) and passes axe

> ⚠️ **This is the first story that mutates the Gallery in place**, and four deferred-work items
> name it by number as their owner. The re-list edge (Task 1) is not optional scaffolding — AC2 and
> AC4 are both unreachable without it, and Story 1.12's AC3 test currently passes by rendering two
> separate mounts precisely because no such edge exists yet.

> 💰 **This story spends bundle budget, by decision (Sidiar, 2026-08-13).** It ships
> `@mui/material/Dialog` per RFC-003's component inventory, and the AR-3 `~300 KB` gate moves to
> accommodate it. Measured at `d49ce59`, the Dialog + Button module stack gzips to **~45 KB** as a
> per-file sum against **11.8 KB** of headroom; the real whole-bundle delta will be smaller (shared
> `@mui/utils` chunks are already present) but is **unknown until measured**. Task 9 owns the
> measurement and the budget change. See forced decision 1.

> ⚠️ **The one thing MUI's Dialog does not give you: an inert background.** Verified at
> `d49ce59` — `@mui/material@9.3.1`'s `Modal/ModalManager.js:22` sets **`aria-hidden="true"`** on
> the background siblings and the package uses **`inert` nowhere**. The Gallery's tiles, delete
> buttons and organism dots are all focusable and all inside that subtree, so axe's
> **`aria-hidden-focus`** (serious, WCAG 4.1.2, enabled by default) is likely to fire on AC5's
> open-dialog scan. Task 5 owns measuring it and Task 3 owns the fix. Do not discover this at the
> end and reach for `disableRules`.

## Tasks / Subtasks

- [x] **Task 1: The re-list edge in `<BattleGallery>`** (AC: 2, 4)
  - [x] `apps/web/components/BattleGallery.tsx` — add a reload token and thread it through the
        existing load effect. Do **not** rewrite the effect; the `Promise.all`, the three `.catch`
        degradations and the `live` closure flag all stay exactly as they are.

    ```tsx
    const [reloadToken, setReloadToken] = useState(0);
    // …existing effect body, unchanged…
    }, [battles, organisms, settings, seedStatus, reloadToken]);

    // Named `reload`, not `refresh`: refresh() is the effect-internal function it re-invokes.
    const reload = useCallback(() => setReloadToken((n) => n + 1), []);
    ```

  - [x] **Why a token and not a lifted `useCallback` refresh:** bumping the token tears the effect
        down (setting `live = false` in its cleanup) and sets it back up, so the in-flight-response
        cancellation that already exists keeps working unchanged. A `refresh` lifted out of the
        effect would need its own `mounted` ref and would duplicate that logic — the 1.12 code
        comment at `:96-99` anticipated the lift, but the token is the smaller correct change and
        reuses the guard already written.
  - [x] ⚠️ **Do NOT reset `loadState` to `idle` on reload.** The old `summaries` staying in state
        while the refetch is in flight is what makes a delete feel instant. Resetting swaps the
        whole Gallery — every tile, every thumbnail — for "Loading battles…" on every delete, and
        the ~50-tile re-render that follows is the exact cost Story 1.11's `IntersectionObserver`
        work exists to avoid.
  - [x] Add the delete handler in `BattleGallery` (it owns the repositories and the list state;
        `BattleTile` must not):

    ```tsx
    async function confirmDelete(id: string) {
      await battles.delete(id);   // AC3: battles only. Never organisms.delete().
      reload();
    }
    ```

  - [x] ⚠️ **`reload()` after the `await`, never before, and never optimistically.** AC2's "removed
        from storage" is the assertion; a spliced-from-local-state list that never reached
        localStorage satisfies every DOM assertion and reappears on reload. The e2e's page-reload
        step (Task 6) is the only check that catches this.
  - [x] **Failure path** (forced decision 3): `battles.delete()` can reject —
        `LocalStorageBattleRepository.delete()` calls `readCollection()`, which throws
        `CorruptDataError` on an unparseable `gol:battles`. On rejection: close the dialog and set
        `loadState` to `{ kind: 'error' }`, reusing the shipped
        `<StatusText role="alert">Something went wrong loading your battles.</StatusText>` body.
        No new copy, no new component, no retry control.
  - [x] ❌ **Out of scope: a retry control.** `reload` is now the entry point the deferred
        "`loadState: 'error'` is terminal" item asked for, but the error body still renders no
        tiles, so nothing can invoke it from there. Record in the Dev Agent Record that the
        *mechanism* landed and the *retry affordance* did not; that deferred entry stays open.

- [x] **Task 2: The tile's delete affordance** (AC: 1, 5)
  - [x] `apps/web/components/BattleTile.tsx` — new `TileActions` wrapper + `DeleteButton`, plus one
        new prop `onRequestDelete(): void`. `BattleTile` **calls** it and holds no dialog state and
        no repository call of its own.
  - [x] Structure and values (clinical CSS at `clinical-lab-theme/battle-gallery.html:395-424`;
        the single-purpose Delete button rather than a `⋮` menu comes from the biotech markup at
        `biotech-terminal-theme/battle-gallery.html:679-681` + `:397-428` — the same
        structure-from-biotech / values-from-clinical split Stories 1.10–1.12 used):

    | Element | Mockup | Values |
    |---|---|---|
    | `TileActions` (`div`) | `.tile-actions` | `position: absolute`, `top: 18px`, `right: 18px` |
    | `DeleteButton` (`button`) | `.action-menu-btn` | `background: var(--gol-bg-hover)`, `border: 1px solid var(--gol-border-control)`, `color: var(--gol-text-secondary)`, `width/height: 28px`, `display: flex`, `alignItems/justifyContent: center`, `cursor: pointer`, `fontSize: 16px`, `padding: 0`, `transition: 'border-color 0.2s, color 0.2s, opacity 0.2s'` |
    | `DeleteButton:hover, :focus-visible` | `.action-menu-btn:hover` | `borderColor: var(--gol-accent)`, `color: var(--gol-accent)` |

  - [x] ⚠️ **Two deliberate departures from the clinical CSS — both are re-applications of rules
        this repo already wrote down, not new judgement calls:**
    1. **`border` → `--gol-border-control`.** The mockup says `var(--border)` (`#333333`, 1.57:1).
       SC 1.4.11 covers boundaries that identify a **control**, and `--gol-border-control`
       (`#6e6e6e`) exists for exactly this — Story 1.9 departure #2, and `themeTokens.test.ts:99-115`
       carries a comment forbidding the alternative fix (repainting `--gol-border`). Copying the
       mockup literally reintroduces the bug that token was created to prevent.
    2. **`display: none` → `opacity: 0`.** The mockup reveals actions with
       `.battle-tile:hover .tile-actions { display: block }`. A `display: none` control is not in
       the tab order at all, so AC5's "keyboard-operable" is unsatisfiable and a keyboard-only user
       can never delete a battle. Use `opacity: 0` on `TileActions` and `opacity: 1` under the
       tile's existing `&:hover, &:focus-within` (`BattleTile.tsx:52-56`) — the same hover/focus
       parity fix the Story 1.9 review applied to `AppNav`. Add the
       `@media (prefers-reduced-motion: reduce)` transition guard, matching `Tile` at `:57-60`.
  - [x] **This is the first real consumer of `--gol-bg-hover`** (deferred from the 1.9 review, which
        named this control). Note in the Dev Agent Record that it is painted here as a **resting**
        surface, not a hover state — the deferred entry's wording assumed the latter. The AA pairs
        it makes live (`text-secondary` on `bg-hover`, `border-control` on `bg-hover`) are already
        asserted by `themeTokens.test.ts`; no new gate row is needed for this control.
  - [x] Accessible name: `aria-label={\`Delete ${displayName}\`}` where `displayName` is the same
        `name.trim() === '' ? UNTITLED_BATTLE : name` expression the `<h2>` already uses — hoist it
        to a local so the two cannot drift. Also set `title` to the same string (the mockup uses
        `title="Actions"`; `aria-label` wins for the accessible name, `title` gives the pointer
        tooltip). A bare "Delete" would give every tile in the Gallery the same accessible name.
  - [x] Glyph: `×` (U+00D7 MULTIPLICATION SIGN), `aria-hidden="true"`.
        ⚠️ **Deliberately BMP, unlike `∅`/`◉`.** Story 1.12's Dev Notes document that axe's
        `ignoreUnicode`/`textIsEmojis` path drops symbol-only text into `incomplete` rather than
        evaluating its contrast. `×` is outside those ranges, so this glyph gets a **real**
        `color-contrast` evaluation in the e2e axe run — which is what we want for a control, and
        is why a trash-can emoji is the wrong choice here.
  - [x] ❌ **Do not build the `⋮` action menu.** The clinical mockup's button is titled "Actions"
        and has no menu behind it in any mockup; Edit/Run/Duplicate are Epic 2/3 and Epic 5. A menu
        holding one item, or holding items that do nothing, is the dead affordance NFR-4.1 forbids.
        The biotech mockup's per-action buttons are the shape to follow.
  - [x] ❌ Do not make the tile itself clickable. Navigation is Story 2.1/2.2.

- [x] **Task 3: `<DeleteBattleDialog>` — `@mui/material/Dialog`** (AC: 1, 2, 5)
  - [x] New `apps/web/components/DeleteBattleDialog.tsx`, `'use client'`. Props:
        `{ open: boolean; battleName: string; pending: boolean; onCancel(): void; onConfirm(): void }`.
        It makes **no** repository call and holds **no** async state — `BattleGallery` owns both.
  - [x] **Per-component imports only** (AR-35, and it is what keeps this story's bundle delta as
        small as it can be): `import Dialog from '@mui/material/Dialog'` and the same shape for
        `DialogTitle`, `DialogContent`, `DialogContentText`, `DialogActions`, `Button`.
        ❌ Never `import { Dialog } from '@mui/material'` — the barrel pulls the whole library.
        ❌ No `@mui/x-*`, no `@mui/icons-material` (a new dependency, and this story has none).

    ```tsx
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <DialogTitle id={TITLE_ID}>Delete Battle?</DialogTitle>
      <DialogContent>
        <DialogContentText id={BODY_ID}>
          “{battleName}” will be permanently deleted. This cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending} autoFocus color="inherit" variant="outlined">
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={pending} color="error" variant="contained">
          Delete Battle
        </Button>
      </DialogActions>
    </Dialog>
    ```

  - [x] **`DialogTitle` already renders an `<h2>`** (`component: "h2"`,
        `node_modules/@mui/material/DialogTitle/DialogTitle.js:52`) — do not override it to an
        `<h3>`/`<h1>`. `<h2>` is the level that keeps `heading-order` valid under the page's single
        `<h1>`, and it is why Task 7's count retarget matters while the dialog is open.
  - [x] **`autoFocus` on Cancel, and Cancel first in DOM order.** MUI's focus trap focuses the first
        focusable descendant unless something carries `autoFocus`; for a destructive confirm, the
        safe action must be what an immediate Enter press hits.
  - [x] **AC1's "names the battle" is `battleName` in the described-by body**, and the parent must
        pass the same `displayName` fallback Task 2 hoists — a battle saved with `""` must read
        “Untitled battle”, not “””.
  - [x] **`onClose` fires for both Escape and backdrop click.** Wire both to `onCancel` — dismissal
        is the non-destructive action, so there is no reason to filter on the `reason` argument.
        Say so in a comment; the next reader will wonder whether the omission was deliberate.
  - [x] **Fix the `aria-hidden` background** (the banner above). Add
        `apps/web/lib/useInertBackground.ts` — a hook that, while `open`, also sets `inert` on the
        `document.body` children MUI has just marked `aria-hidden="true"`, and removes it on close.
        `inert` is a React 19 boolean-prop-supported attribute and is supported across the whole
        NFR-2.1 matrix (Chrome 102+, Firefox 112+, Safari 15.5+). This is the honest fix rather than
        a suppressed rule: it makes the background genuinely non-interactive for pointer, keyboard
        and AT, which is what `aria-hidden` already *claims*.
    - ⚠️ **Ordering matters.** Run it from a plain `useEffect` (not `useLayoutEffect`) so MUI's own
      focus move has already happened — inerting a subtree that still holds the focused element
      drops focus to `<body>`. Task 5's and Task 6's "focus starts on Cancel" assertions are what
      catch this; do not skip them.
    - ⚠️ **Do this only if Task 5's measurement shows `aria-hidden-focus` actually firing.** If the
      scan is clean without the hook, do not ship the hook — record the measurement instead. If the
      hook proves fragile (focus escaping, MUI's cleanup racing yours), the documented fallback is
      to scope the open-dialog axe run to the dialog subtree, with the reason recorded in the test
      and in the Dev Agent Record. ❌ `disableRules(['aria-hidden-focus'])` is not an option — it
      turns a real, reported defect into a silent one.
  - [x] Theme-level styling, **not per-instance `sx`** (RFC-003 Decision 3: static chrome goes
        through the theme/`styled()`; `sx` is for dynamic values). Add to `lib/theme.ts`'s
        `components` block, alongside the existing `MuiPaper`/`MuiButton` entries — values from the
        clinical settings mockup (`clinical-lab-theme/settings.html:181-219`, the only place this
        theme styles a destructive action):

    | Override | Values |
    |---|---|
    | `MuiDialog.styleOverrides.paper` | `background: var(--gol-bg-secondary)`, `border: 1px solid var(--gol-border)`, `maxWidth: '440px'`, `backgroundImage: 'none'` |
    | `MuiBackdrop.styleOverrides.root` | `backgroundColor: var(--gol-backdrop)` |
    | `MuiDialogTitle.styleOverrides.root` | `fontSize: '18px'`, `fontWeight: 600`, `color: var(--gol-text-primary)` |
    | `MuiDialogContentText.styleOverrides.root` | `color: var(--gol-text-secondary)`, `fontSize: '14px'` |
    | `MuiButton.styleOverrides.root` (extend the existing entry) | add `fontSize: '13px'`, `fontWeight: 600`, `textTransform: 'uppercase'`, `letterSpacing: '0.5px'`, `padding: '12px 24px'` |

    - ⚠️ **`backgroundImage: 'none'` is load-bearing.** MUI's `Paper` applies a lightness overlay
      gradient in dark mode; without this the dialog surface is not `--gol-bg-secondary` and every
      contrast number Task 4 gates becomes a number the app does not render — the same class of
      drift the 1.9 review found with `--gol-bg-hover`.
    - ⚠️ **The dialog edge uses `--gol-border`, not `--gol-border-control`.** A dialog boundary is
      decorative, not a control boundary; that split is exactly what `themeTokens.test.ts:99-115`
      protects, and inverting it here would be as wrong as using `--gol-border` on Task 2's button.
    - `.btn:hover { transform: translateY(-1px) }` — if you carry it over, put it behind the
      `prefers-reduced-motion` guard (the `Tile` precedent at `BattleTile.tsx:57-60`).
  - [x] ⚠️ **Departure from `.btn-warning`, with the arithmetic:** the mockup pairs
        `color: var(--text-primary)` (white) with `background: var(--warning)` (`#ff3366`) —
        **3.55:1, below AA's 4.5:1 for body text.** Dark-on-danger measures **5.58:1**, matches
        `.btn`'s own `color: var(--bg-primary)` two rules above it, and matches the shipped
        `--gol-on-accent: #0a0a0a`. So `--gol-on-danger: #0a0a0a`, delivered through
        `palette.error.contrastText` (Task 4). This is departure #4 in the series Story 1.9 opened;
        record it beside the other three.
  - [x] ❌ **No `<Snackbar>`, no toast, no undo.** FR-7.7 asks for a confirmation prompt only, undo
        for deletion is nowhere in the PRD, and `SnackbarContent-bg` is one of the four silently
        no-op'd derived tokens the 1.9 review recorded — rendering one would open that item too.

- [x] **Task 4: Danger tokens + the MUI `error` palette entry** (AC: 5)
  - [x] `apps/web/app/themes.css` — add to the bare `:root` block (Clinical Lab is unconditional;
        do **not** open a `[data-theme]` block, per `project-context.md#Token layer shape`):

    ```css
    --gol-danger: #ff3366;          /* clinical-lab-theme/settings.html:15 (--warning) */
    --gol-danger-hover: #ff4477;    /* settings.html:217-219 (.btn-warning:hover) */
    --gol-on-danger: #0a0a0a;       /* departure: the mockup's white is 3.55:1 — see Task 3 */
    --gol-danger-channel: 255 51 102;
    --gol-backdrop: rgb(0 0 0 / 0.6);
    ```

  - [x] `apps/web/lib/theme.ts` — pin `palette.error` to these tokens, alongside the existing
        `primary`/`secondary` entries and with the same explicit `main`/`light`/`dark`/
        `contrastText`/`mainChannel` shape (nothing derived — `augmentColor()`'s
        `lighten()`/`darken()` cannot parse a `var()` string, and returns its input silently
        rather than throwing):

    ```ts
    error: {
      main: 'var(--gol-danger)',
      mainChannel: 'var(--gol-danger-channel)',
      light: 'var(--gol-danger-hover)',
      dark: 'var(--gol-danger)',
      contrastText: 'var(--gol-on-danger)',
    },
    ```

  - [x] **`palette.error` is not optional here** — `<Button color="error" variant="contained">` reads
        `error.main` for its fill, `error.contrastText` for its label and `error.dark` for its hover
        fill. Left unset, all three are Material's raw defaults (`#f44336` and friends), which are
        invisible to AR-46 because they appear in no source file and which a `data-theme` flip would
        never change.
  - [x] **This closes the `error` half of the 1.9 deferred item that names this story**, and the
        comments that point here must be updated, not left stale — `theme.ts:63-67` ("the status
        colours (error/warning/info/success, deferred to Story 1.13)") and `themes.css:59-64` ("the
        status set … has no consumer until Story 1.13"). Re-point both at `error` being pinned and
        `warning`/`info`/`success`/`grey`/`common` still deferred, and update the `deferred-work.md`
        entry the same way. ⚠️ A wrong WHY is worse than none — Story 1.9's review found three.
  - [x] `apps/web/lib/themeTokens.test.ts` — add the rows that now ship, and **only** those:
    - `on-danger` on `danger` ≥ 4.5 (measured **5.58**) and on `danger-hover` ≥ 4.5 (**5.98**) —
      add `danger`/`danger-hover` to the existing `accentStates` loop's shape.
    - `danger` on `bg-primary` / `bg-secondary` ≥ 4.5 (**5.58** / **4.90**).
    - ⚠️ **Do not add `danger` on `bg-hover`** — it measures **4.48**, and nothing in this story
      paints danger text on that surface (the tile button is `text-secondary`, deliberately; only
      the dialog's filled Delete button is danger, on `bg-secondary`). Adding the row would fail the
      gate for a pair the app never renders. Record the 4.48 number in the Dev Agent Record so the
      first story that *does* want red-on-`bg-hover` finds it.
    - The channel-mirror test picks `--gol-danger-channel` up automatically from
      `CHANNEL_TOKEN_RE`; bump the `toBeGreaterThanOrEqual(7)` floor at `:132` to match the new
      count, and the `>= 13` token floor at `:62` if the added hex tokens change what "sanity floor"
      means.
    - ⚠️ `--gol-backdrop` is an `rgb()` composite, not a `#rrggbb`, so `HEX_TOKEN_RE` will not see
      it — that is fine and matches `--gol-grid-line`/`--gol-shadow-*`. The
      "every `--gol-*` reference resolves to a defined token" sweep at `:159-197` **is** what covers
      it, and it will fail loudly if the token is referenced but not defined.

- [x] **Task 5: Unit tests** (AC: 1, 2, 3, 4, 5)
  - [x] 🛑 **MUI's Dialog portals to `document.body`, so `render()`'s `container` does not contain
        it.** `screen.*` queries search `document.body` and work unchanged, but any assertion or axe
        run scoped to the returned `container` silently sees an empty tree and passes. Use `screen`
        for queries and `document.body` for axe. This is the single easiest way to ship a green
        suite that tests nothing in this story.
  - [x] **Measure the `aria-hidden-focus` question first, before writing the rest.** Render the
        Gallery with the dialog open, run axe over `document.body`, and look at what comes back.
        Record the actual rule ids and node counts in the Dev Agent Record — then apply Task 3's
        `useInertBackground` hook only if the rule fired. ⚠️ Report the real result either way; "it
        passed" without the numbers is not a measurement.
  - [x] New `apps/web/components/DeleteBattleDialog.test.tsx`:
    - renders `role="dialog"` with the accessible name "Delete Battle?" and the battle name in the
      described-by body (AC1)
    - Cancel fires `onCancel` and not `onConfirm`; Delete fires `onConfirm` and not `onCancel`
    - `pending` disables both buttons
    - `open={false}` renders no dialog at all (MUI unmounts by default — assert
      `screen.queryByRole('dialog')` is null, so a future `keepMounted` cannot slip in unnoticed)
    - **focus starts on Cancel** — MUI's focus trap runs in jsdom, so this one *is* unit-testable
      here, unlike the browser-only assertions in Task 6
    - `const results = await axe(document.body); expect(results.violations).toEqual([])`
  - [x] `apps/web/components/BattleGallery.test.tsx` — the flow tests, all against
        `createFakeRepositories(...)` from `@gol/test-utils` (never a hand-rolled fake):
    - **AC1:** clicking a tile's `Delete <name>` button opens a dialog naming *that* battle, and
      `battles.delete` has not been called. Seed **two** battles and assert the dialog names the one
      whose button was clicked — with one battle, a hardcoded name passes.
    - **AC2 confirm:** confirming calls `battles.delete` **exactly once with that battle's id**, and
      the tile count drops from 2 to 1 with the *other* battle still present.
    - **AC2 cancel:** cancelling closes the dialog, `battles.delete` is never called, and the tile
      count is unchanged. Assert on the spy, not only on the DOM.
    - **AC3:** spy on `organisms.delete` and assert it is never called, **and** assert
      `organisms.list()` still resolves the full roster after the delete. Two assertions because the
      spy alone would pass if the delete went through some other path.
    - **AC4 — the live transition, on ONE mounted instance:** seed exactly one battle, assert one
      `article` and no "No Battles Yet", delete it, then assert the empty-state heading appears with
      zero `article`s **without unmounting or re-rendering with a different repository**. ⚠️ This is
      the test that closes the 1.12 deferred item; the two-mount test at `:266` stays as-is and its
      ⚠️ comment should now point here instead of forward to this story.
    - **AC5 (jsdom half):** axe on `document.body` with the dialog open, plus Escape closing the
      dialog via MUI's `onClose` without deleting anything. ⚠️ `document.body`, never the `render()`
      container — the dialog is portalled out of it.
    - **Failure path:** a `battles.delete` that rejects closes the dialog and renders the
      `role="alert"` body.
  - [x] **Falsification step (the 1.11/1.12 review pattern, and it is a task, not a suggestion):**
        temporarily break the code each assertion guards and confirm the test goes red, then revert.
        At minimum: (a) call `reload()` *before* `await battles.delete(id)` → the AC2 test must fail;
        (b) delete the `aria-label` from `DeleteButton` → the AC1 query must fail; (c) add
        `organisms.delete(...)` to the handler → the AC3 test must fail. Record each result.

- [x] **Task 6: e2e — the browser half of AC2 and AC5** (AC: 2, 3, 4, 5)
  - [x] New `apps/web/e2e/deleteBattle.spec.ts`. Reuse `gallery.spec.ts`'s `seedWorkspace()` /
        `buildSeedPayload()` shape — the e2e serves the **production** static export, so the AR-45
        dev fixtures are never seeded and localStorage must be primed via `addInitScript`. Extract
        the helper to a shared module or copy it with a comment saying which file it came from;
        do not silently fork it.
    - **AC2, the storage assertion:** delete a battle, then **`await page.reload()`** and assert it
      is still gone. This is the only check in the whole suite that distinguishes "removed from
      storage" from "spliced out of React state", and a local-state-only implementation passes every
      other assertion in this story.
    - **AC2, cancel:** open the dialog, press `Escape`, assert two `article`s remain and
      `localStorage.getItem('gol:battles')` still parses to two records.
    - **AC3:** after deleting a battle, read `gol:organisms` from localStorage and assert all three
      mock organisms are still present, **by id**.
    - **AC4:** delete both seeded battles in one session and assert the "No Battles Yet" heading
      appears **without a reload** — the live transition in a real browser.
    - **AC5, focus trap:** with the dialog open, press `Tab` past the last control and assert
      `document.activeElement` is still inside the dialog; assert focus starts on Cancel.
    - **AC5, Escape:** closes the dialog and deletes nothing.
    - **AC5, focus after a successful delete:** the button that had focus is gone from the DOM.
      Assert focus landed somewhere deliberate rather than on `<body>` — see forced decision 4.
    - **AC5, the background is genuinely non-interactive:** with the dialog open, assert a Gallery
      tile's delete button cannot be reached by `Tab` and (if the Task 3 hook shipped) that the
      background carries `inert`. This is the assertion that would go red if the `aria-hidden`
      gap were papered over rather than fixed.
    - **AC5, axe with the dialog open:** a full `AxeBuilder` run. ⚠️ This is the only place
      `color-contrast` is genuinely evaluated (jsdom has no layout), so it is where the `×` glyph,
      the danger fill and the `--gol-backdrop` composite are actually checked. Gate it behind a
      visibility wait on the dialog first — the Story 1.12 review found two axe runs racing
      hydration because `page.goto` resolves at `waitUntil: 'load'`.
    - Assert zero console errors on the happy path, matching the file's siblings.
  - [x] Run the full four-project matrix (chromium/firefox/webkit/tablet). If WebKit misbehaves
        around the focus trap or the backdrop, report the actual failure — do not quietly narrow
        the project matrix.

- [x] **Task 7: Retarget the "heading count == tile count" assertions** (AC: 2, 4)
  - [x] Deferred from the 1.12 review, and this story is what makes them actively wrong: after a
        delete the count changes, and once the last battle is gone `GalleryEmptyState`'s own `<h2>`
        makes a count of **1** read as "one surviving tile" rather than "empty gallery". The dialog's
        own `<h2>` compounds it while it is open.
  - [x] ⚠️ **The deferred entry's site list is stale — this one is verified at `d49ce59`.** Its
        `BattleGallery.test.tsx` line numbers predate the 1.12 review patches, it lists
        `app/page.test.tsx:128` as a count when that line is an *order* assertion, and it misses a
        count-shaped `waitFor` barrier. Use the table below, and correct the entry when you close it.

    | Site | Shape | Action |
    |---|---|---|
    | `BattleGallery.test.tsx:116, 389, 423, 470, 515` | `toHaveLength(n)` on a heading count | → `getAllByRole('article')` |
    | `BattleGallery.test.tsx:318` | `waitFor(() => getAllByRole('heading', { level: 2 }))` — a "tiles have rendered" barrier, same false invariant | → `getAllByRole('article')` |
    | `e2e/gallery.spec.ts:151, 198` | `toHaveCount(n)` | → `page.getByRole('article')` |
    | `e2e/gallery.spec.ts:84, 228` | `toHaveCount(n)` on a `headings` locator reused two lines later for a name/text assertion | split the locator: count → `article`, text stays heading-based |
    | `BattleGallery.test.tsx:170`, `app/page.test.tsx:128-129`, `gallery.spec.ts:88, 229` | order / accessible-name assertions | **keep heading-based — do not touch** |

  - [x] Net: **10 sites change, all in two files** (`BattleGallery.test.tsx`, `e2e/gallery.spec.ts`).
        `app/page.test.tsx` needs **no** change from this task despite what the deferred entry says.
  - [x] The retarget target is `article` because `BattleTile`'s root is `styled('article')`
        (`BattleTile.tsx:46`), which is what the 1.12 review already established as the sound proxy
        for "a tile" (`BattleGallery.test.tsx:251`, and the exact-count assertion at `:281` that
        licenses it).

- [x] **Task 8: Close the `hasLoadStarted` dep-array contradiction in `<BattleTile>`** (AC: 2)
  - [x] Deferred from the 1.11 review, which names this story: the load effect declares
        `[inView, gridColors, battles, battleId, roster]` but its body is gated on a ref that is set
        once and never reset, so every declared dependency is inert. The entry says it becomes
        reachable "the moment anything refreshes the Gallery **in place**" — which is Task 1.
  - [x] What actually happens after a delete: `reload()` produces a new `state` identity, so
        `state.roster` and each tile's `organisms` array are new identities and every surviving
        `BattleTile` re-runs its effect and no-ops on the ref. That outcome is **correct** (the
        surviving battles' grids did not change) but the code says something it does not mean.
  - [x] Fix: replace the boolean ref with one that records *what* was loaded, so the guard honours
        the dependency the result actually depends on.

    ```tsx
    const loadedBattleId = useRef<string | null>(null);
    // …
    if (inView && gridColors !== null && loadedBattleId.current !== battleId) {
      loadedBattleId.current = battleId;
      …
    }
    ```

  - [x] Add a WHY comment stating plainly that a new `roster`/`battles` identity deliberately does
        **not** re-fetch, and that a roster change invalidating a painted palette is the separate
        open `setPalette` item (deferred-work, 1.8 review, owned by Story 2.10). ⚠️ Do not "fix"
        that here.
  - [x] The StrictMode double-invocation guarantee is unchanged: the ref is still per-tile-lifetime,
        and `key={summary.id}` still forces a remount when the id changes — this makes the guard
        truthful, it does not change behaviour. Say so in the Dev Agent Record rather than claiming
        a bug was fixed.

- [x] **Task 9: Move the bundle budget, then verify** (AC: all)
  - [x] **Measure before deciding.** Baseline is **288.2 KB / 300 KB gzip (11.8 KB headroom)** after
        Story 1.12's review pass. Run `npm run build:standalone && npm run bundle:check` with the
        dialog shipped and record the new first-load number **and the delta**. The ~45 KB figure in
        the banner is a per-file sum and is an upper bound, not a prediction — shared `@mui/utils`
        and `ButtonBase` chunks may already be present, and whole-bundle gzip compresses better.
  - [x] **Set the new budget from the measurement, not from a round number.**
        `BUDGET_GZIP_KB = ceil((measured + 12) / 5) * 5` — i.e. preserve roughly the ~12 KB of
        headroom the gate had before, rounded up to the next 5 KB. A budget set flush against the
        measured size stops catching regressions; a budget set far above it stops being a budget.
        Record the arithmetic.
  - [x] `scripts/check-bundle-size.mjs:15` — update the constant **and its comment**, which
        currently reads `// RFC-003 / AR-3 — first-load JS ceiling for the home route.` The new
        comment must say what moved, when, why, and on whose authority: the MUI Dialog decision
        (Sidiar, 2026-08-13), Story 1.13, and the measured before/after numbers. ⚠️ A silently
        raised budget is indistinguishable from a budget nobody is enforcing.
  - [x] **The specs say `~300KB` and now disagree with the gate — surface it, do not silently
        diverge** (`project-context.md`: "Where this file and an RFC disagree, say so"). Both
        statements are soft: `RFC-003:48` says "~200KB initial / ~300KB total — **to be validated by
        benchmarking after MUI integration**", and `epics.md:159` (AR-3) says "bundle budget
        ~300KB". This story *is* that benchmark, so the number moving is the RFC's own predicted
        outcome rather than a violation of it. Record the measured figure in the Dev Agent Record
        and add a `deferred-work.md` entry noting that `RFC-003:48/253/309` and `epics.md:159, :371`
        still carry the pre-measurement `~300KB` and should be reconciled in a docs pass.
        ❌ Do not edit the RFC or the epics file from this story.
  - [x] ⚠️ **If the measured delta is far above the ~45 KB upper bound, stop and report** rather
        than raising the budget to fit — that would mean something other than the Dialog stack
        landed in the bundle (a barrel import is the usual cause).
  - [x] `npm run build:standalone`, then `grep -c "No Battles Yet" apps/web/out/index.html` must
        still print `0` — the Story 1.12 hydration-signal gate. Task 7 touches the assertions that
        depend on it. Also `grep -c "Delete Battle?" apps/web/out/index.html` → `0`, confirming the
        dialog is not in the prerendered HTML.
  - [x] `npm run ci` — full gate, **exit code recorded, not piped** (`npm run ci | tail` reports
        *tail's* status; redirect to a file and echo `$?`).
  - [x] Report per-package unit counts (`web` was **311 / 27 files** at `d49ce59`) and the e2e count
        (**44** across the four-project matrix) so a reviewer can see tests were added, not moved.
  - [x] `npx eslint apps/web` — the pre-existing `BattleGallery.tsx` `exhaustive-deps` warning is
        inherited; report whether Task 1 changed it, and do **not** silence it with a disable
        comment.

### Review Findings

Code review 2026-08-14 against commit `92f384b` (baseline `d49ce59`). Three parallel layers —
Blind Hunter (diff only), Edge Case Hunter (diff + project read), Acceptance Auditor (diff + spec
+ context docs). 41 raw findings → 33 unique after dedup → 5 dismissed. All three layers
independently found the cancel-path focus gap; two independently found `error.dark`.

- [x] [Review][Decision → Patch] **Delete button is invisible but tappable on no-hover pointers** — `TileActions` reveals only under `Tile`'s `&:hover, &:focus-within`, and `opacity: 0` leaves the element hit-testable. On touch (incl. the `tablet` Playwright project, which passes because Playwright treats `opacity: 0` as visible) every tile carries an invisible 28×28 destructive control at its top-right. A tap opens a delete confirmation for a button the user never saw. Found independently by all three layers. **Resolved (Sidiar, 2026-08-14): option (a) — add `@media (hover: none) { opacity: 1 }`** so the control is permanently visible on touch pointers rather than inert. [apps/web/components/BattleTile.tsx:64-98]
- [x] [Review][Decision → Patch] **One component's needs pushed into global theme overrides** — `MuiDialog.styleOverrides.paper.maxWidth: '440px'` applies to every Dialog the app will ever render and silently beats MUI's own `maxWidth="sm|md|lg"` prop (a `paper` styleOverride outranks the prop-driven class), so a future full-screen editor dialog is 440px for non-obvious reasons. `MuiButton.styleOverrides.root` pins `padding: '12px 24px'` / `fontSize: '13px'` unconditioned on `size`, making `small`/`large` indistinguishable from `medium`. Decision J says one immutable theme, which is why these landed there. **Resolved (Sidiar, 2026-08-14): move the component-specific values to `sx` on the call sites** in `DeleteBattleDialog.tsx`, leaving only genuinely global styling in the theme. [apps/web/lib/theme.ts:MuiDialog, MuiButton]

- [x] [Review][Patch] **`disableRestoreFocus` strands focus on `<body>` on every cancel path — AC5 gap** [apps/web/components/DeleteBattleDialog.tsx:60, apps/web/components/BattleGallery.tsx:174-176]
- [x] [Review][Patch] **`error.dark` is byte-identical to `error.main`, so the destructive confirm button has no hover state** — the exact defect its own comment says it authored `dark` to avoid; `--gol-danger-hover` is on `light`, which no Button variant reads. Fixing this also legitimises the `danger-hover` AA gate row, which currently gates a pair nothing paints [apps/web/lib/theme.ts:62,65]
- [x] [Review][Patch] **Escape / backdrop during an in-flight delete closes the dialog but the delete still completes** — `pending` disables both Buttons but nothing gates `onClose` [apps/web/components/DeleteBattleDialog.tsx:52]
- [x] [Review][Patch] **Post-delete focus lands inside a still-`aria-hidden` subtree** — `closeAfterTransition` defers `ModalManager.remove()` to `onExited` (~195ms); the `setTimeout(…, 0)` focus move beats it, so screen readers announce nothing for the move forced decision 4 exists to make announceable [apps/web/components/BattleGallery.tsx:193]
- [x] [Review][Patch] **Un-inert window during the exit transition re-opens the gap the hook closes** — cleanup fires on `open=false` but aria-hidden persists to `onExited`, so Tab during fade-out reaches background controls the a11y tree calls hidden [apps/web/lib/useInertBackground.ts:40-42]
- [x] [Review][Patch] **`battleName` blanks to `''` for the ~195ms exit transition** — `setConfirming(null)` clears the name while Dialog keeps children mounted, rendering `“” will be permanently deleted.` during every close [apps/web/components/BattleGallery.tsx:275]
- [x] [Review][Patch] **`palette.error` is outside `theme.test.tsx`'s "every leaf is a `var(--gol-*)`" walk** — the enumerated list drifted exactly as its own comment warns [apps/web/lib/theme.test.tsx:30-42]
- [x] [Review][Patch] **Comment claims e2e coverage of the hover/focus reveal that does not exist** — `deleteBattle.spec.ts` has no tile opacity or `[data-tile-actions]` assertion; its only `toHaveCSS('opacity')` is on the dialog. The reveal that makes the control keyboard-reachable ships unverified [apps/web/components/BattleTile.test.tsx:205-207]
- [x] [Review][Patch] **The open-dialog axe assertions cannot fail for `aria-hidden-focus`** — axe honours `inert`, so the hook excludes the background subtree from its own scan; the test comment claims this run *is* the measurement, and it also describes the pre-fix world in present tense [apps/web/components/BattleGallery.test.tsx:283-288]
- [x] [Review][Patch] **`loadedBattleId` latches before the promise settles, and `deferred-work.md` overclaims the fix** — a rejected load latches permanently with no retry edge; the entry says "confirmed live" for an observation identical with the old boolean in place, while `BattleTile.tsx` says the change "does not change behaviour today". Four of five declared deps are still ignored [apps/web/components/BattleTile.tsx:388-395, docs/implementation-artifacts/deferred-work.md]
- [x] [Review][Patch] **Bundle comment overstates the breach 3×** — "306.3 KB gzip — 18.1 KB over budget" conflates the delta over the 1.12 baseline (18.1) with the overage against the 300 KB budget (6.3). `deferred-work.md` words the same fact correctly [scripts/check-bundle-size.mjs:18]
- [x] [Review][Patch] **No synchronous re-entrancy latch on confirm** — the guard tests `confirming !== null`, which is still non-null on a second activation, and `setDeletePending(true)` only disables after commit; a second delete of a removed id can reject into the catch and error out the Gallery after a *successful* delete [apps/web/components/BattleGallery.tsx:178-203]
- [x] [Review][Patch] **The handler's error write is not guarded by the load effect's `live` flag** — a later-resolving reload silently overwrites the alert, so a failed delete leaves no trace [apps/web/components/BattleGallery.tsx:199]
- [x] [Review][Patch] **`useInertBackground` restores `inert = false` unconditionally and snapshots once** — no prior-value capture, and body children appended while open are never inerted [apps/web/lib/useInertBackground.ts:34-42]
- [x] [Review][Patch] **A 100-char unbroken battle name overflows the 440px dialog paper** — `BattleSchema` allows it; `DialogContentText` sets no `overflow-wrap` [apps/web/components/DeleteBattleDialog.tsx:66-68]
- [x] [Review][Dismissed on inspection] ~~**`accent` on `bg-hover` is ungated**~~ — **false positive, verified 2026-08-14.** `accent` is already in `textTokens` AND in `controlTokens`, and `BACKGROUNDS` already includes `bg-hover`, so the pair is gated twice: `accent on bg-hover` at ≥4.5:1 (SC 1.4.3) and at ≥3:1 (SC 1.4.11), both listed by `vitest --reporter=verbose` and both passing. No row added — a third would have been a duplicate.
- [x] [Review][Patch] **The deferred focus call is never cancelled** — no `clearTimeout`; confirming and then clicking elsewhere inside the same tick yanks focus back to the heading [apps/web/components/BattleGallery.tsx:193]
- [x] [Review][Patch] **Task 6's "cannot be reached by `Tab`" assertion was never written** — the test never presses Tab; `not.toBeFocused()` right after open is near-vacuous [apps/web/e2e/deleteBattle.spec.ts:1159-1183]
- [x] [Review][Patch] **Nothing guards the `await delete` → `reload()` ordering** — Task 5's falsification (a) is recorded as having stayed green and was substituted with a different mutation; the story's own silent-failure trap #1 ships unguarded [apps/web/components/BattleGallery.test.tsx]
- [x] [Review][Patch] **A test named for two tiles renders one at a time** — `unmount()` between the two renders, so the distinctness property in the title is never exercised [apps/web/components/BattleTile.test.tsx:560-567]
- [x] [Review][Dismissed on inspection] ~~**Module-level `BASE_PROPS` mutated by `vi.spyOn` with no restore in this file**~~ — **false positive on both halves, verified 2026-08-14.** A file-level `afterEach(() => vi.restoreAllMocks())` already exists at `BattleTile.test.tsx:41` (pre-existing, so it was outside the reviewed diff — the layer only saw the diff). The shared `onRequestDelete: vi.fn()` is a documented deliberate no-op default (`:30-32`); every test that asserts on it passes its own `vi.fn()`.
- [x] [Review][Patch] **Comment describes conditional rendering the code does not do** — the parent renders `<DeleteBattleDialog>` unconditionally with `open={confirming !== null}`; the unmount is MUI's. Also: the "Task 7 retarget" comment is pasted verbatim three times while two identical retargets get none, and `DeleteBattleDialog.test.tsx`'s portalling comment sits above an unrelated `afterEach` [apps/web/components/BattleGallery.tsx:69-71, BattleGallery.test.tsx:51-106]

- [x] [Review][Defer] **A successful delete whose reload rejects wipes the whole Gallery into a terminal error** [apps/web/components/BattleGallery.tsx:146-148] — deferred, extends the already-recorded terminal-`loadState` item; the retry affordance that fixes it is explicitly out of scope for this story
- [x] [Review][Defer] **`delete(id)` is keyed on the collection key while `list()` returns each record's own `id`** [packages/persistence/src/localStorageBattleRepository.ts:69-74] — deferred, pre-existing repository semantics; the Gallery already de-duplicates for render but the delete path silently no-ops on a divergent workspace

**Dismissed as noise (5):** the `13 → 16` token-floor bump (verified correct — `HEX_TOKEN_RE` matches 6-digit hex only, so `--gol-backdrop` and `--gol-danger-channel` are rightly outside it, and the channel token has its own `7 → 8` floor); the "previous summaries stay on screen" claim (verified — `refresh()` never writes `loading`); Task 6's `page.reload()` substitution (the `addInitScript` re-seed rationale is correct and the direct `localStorage` read proves the same thing); shipping `useInertBackground` despite the measurement landing in `incomplete` rather than `violations` (the structural argument is sound and e2e proves the mechanism directly); `DeleteButton`'s `transition` omitting `opacity 0.2s` (the opacity transition correctly lives on `TileActions`, the element that animates).

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **✅ Already decided by Sidiar (2026-08-13) — ship `@mui/material/Dialog` and move the AR-3
   budget. Implement it; do not re-litigate it.** The alternative considered and rejected was a
   native `<dialog>` + `showModal()` at 0 KB. RFC-003 §"Component Inventory" lists "Modals
   (`Dialog`)" and §Accessibility argues MUI gives correct roles, focus management and keyboard
   interaction "out of the box, reducing hand-rolled ARIA risk" — following the RFC won, and the
   budget (stated as `~300KB` and explicitly "to be validated by benchmarking after MUI
   integration") is what moves. What the dev agent still owes is **the measurement, the new budget,
   and the honest note that the specs still say `~300KB`** (Task 9). This sets the precedent for
   Epic 2's `<UnsavedChangesDialog>` / `<ResizeClipWarningDialog>` and Epic 4's
   `<OrganismEditorModal>`: they reuse this Dialog, and the budget conversation does not reopen for
   each one — which is a large part of why paying the cost once, here, is the right shape.
2. **⚠️ One Delete button per tile, not the mockup's `⋮` "Actions" menu.** The clinical mockup shows
   a menu trigger with no menu authored anywhere; the biotech mockup shows per-action buttons and is
   the only mockup that renders a delete affordance at all. Every other tile action (Edit, Run,
   Duplicate, Export) belongs to Epic 2/3/5, so a menu shipped now is either one item in a wrapper
   or a set of dead entries. Same structure-from-biotech / values-from-clinical resolution Stories
   1.10–1.12 used for the same split.
3. **⚠️ A rejecting `battles.delete()` closes the dialog and shows the existing error body.** No AC
   covers delete failure and no mockup shows an error state, so this is a judgement call: the path
   is genuinely reachable (`readCollection()` throws `CorruptDataError` on an unparseable
   `gol:battles`), and the alternatives are worse — a dialog stuck in `pending` forever, or a
   swallowed rejection where the tile silently survives a "successful" delete. Reusing the shipped
   alert adds no new copy and no new component. State the exact behaviour you shipped.
4. **⚠️ Where focus goes after a successful delete.** The `<dialog>`'s focus-restoration target is
   the tile's Delete button, which the delete has just removed from the DOM, so the browser drops
   focus to `<body>` and the keyboard user restarts at the top of the document — the exact failure
   the Story 1.10 review called out when `TooltipTrigger` used `blur()`. Proposed resolution: move
   focus to the Gallery's `<h1>` (`SectionTitle`, which already carries `id={HEADING_ID}`) with
   `tabIndex={-1}`, which also re-announces the context the user has landed in. Confirm or change
   it, and say which in the Dev Agent Record.

### Spec conflicts surfaced (do not silently pick one — this is the project rule)

1. **⚠️ The clinical mockup's `.btn-warning` fails WCAG AA.** `color: var(--text-primary)` (white)
   on `background: var(--warning)` (`#ff3366`) measures **3.55:1**; AA body text needs 4.5:1.
   Dark-on-danger measures **5.58:1**, matches `.btn`'s own `color: var(--bg-primary)` two rules
   above it, and matches the shipped `--gol-on-accent: #0a0a0a`. **Resolution: `--gol-on-danger:
   #0a0a0a`**, recorded as departure #4 in Story 1.9's series and gated in `themeTokens.test.ts`.
2. **⚠️ The clinical mockup hides tile actions with `display: none`, which makes AC5
   unsatisfiable.** A `display: none` control is not in the tab order, so a keyboard-only user could
   never delete a battle. **Resolution: `opacity: 0` revealed by the tile's existing
   `&:hover, &:focus-within`** — the same parity fix the Story 1.9 review applied to `AppNav` and
   that `BattleTile`'s own `Tile` rule already implements.
3. **⚠️ The clinical mockup borders controls with `--border` (1.57:1).** SC 1.4.11 needs 3:1 for a
   boundary that identifies a control. **Resolution: `--gol-border-control`**, which Story 1.9
   created for exactly this and which `themeTokens.test.ts:99-115` explicitly protects. Do not
   repaint `--gol-border`.
4. **⚠️ The shipped bundle budget will no longer match `RFC-003:48/253/309` or `epics.md:159`
   (AR-3), which both say `~300KB`.** Resolved in forced decision 1 and Task 9: RFC-003 frames that
   figure as a target "to be validated by benchmarking after MUI integration", and this story is
   that benchmark. Record the measured number and file the docs reconciliation; do not edit the RFC
   or the epics file from a story, and do not let the divergence go unrecorded.
5. **⚠️ No confirmation-dialog mockup exists in either theme.** The only confirmation UI in any
   mockup is `settings.html`'s native `window.confirm()` in a demo `<script>`, which is not a
   shippable pattern (unstyleable, un-themeable, blocks the main thread). The dialog's visual design
   is therefore composed from `settings.html`'s `.btn` family plus the theme's surface tokens; there
   is nothing to "match" and nothing to contradict.

### Silent-failure traps — the intuitive implementation is wrong

- ⚠️ **An optimistic local-state splice passes almost every assertion in this story.** Removing the
  summary from React state without awaiting `battles.delete()` satisfies the tile-count assertions,
  the empty-state transition, and the axe runs. Only the e2e's `page.reload()` step catches it.
  Do not reorder Task 1's `await` → `reload()` sequence for perceived responsiveness.
- ⚠️ **Resetting `loadState` to `idle` on reload looks like the clean way to re-enter the effect.**
  It swaps the entire Gallery for "Loading battles…" on every delete and forces ~50 tiles to
  re-render and re-observe. Bump the token only.
- ⚠️ **The dialog is portalled to `document.body`, so `render()`'s `container` never contains it.**
  Every assertion or axe run scoped to `container` passes against an empty tree. Use `screen.*` and
  `document.body`. This is the highest-probability way to ship a green suite that checks nothing.
- ⚠️ **MUI 9.3.1 marks the background `aria-hidden` and never `inert`** (`Modal/ModalManager.js:22`;
  `inert` appears nowhere in the package — both verified at `d49ce59`). The background holds
  focusable tiles and buttons, so axe's `aria-hidden-focus` is likely to fire. Measure it (Task 5)
  and fix it (Task 3); never `disableRules` it.
- ⚠️ **`Paper`'s dark-mode overlay gradient silently changes the dialog's surface colour.** Without
  `backgroundImage: 'none'` on `MuiDialog.styleOverrides.paper`, the rendered surface is not
  `--gol-bg-secondary`, and every contrast ratio Task 4 gates is computed against a colour the app
  does not paint — the same drift the 1.9 review found with `--gol-bg-hover`.
- ⚠️ **`MuiBackdrop`'s default is a raw `rgba(0, 0, 0, 0.5)` that AR-46 cannot see**, because it
  lives in MUI's source rather than ours, and a `data-theme` flip would never change it. Author
  `--gol-backdrop` in `themes.css` and pin it through a `styleOverride`, exactly as
  `--gol-shadow-tooltip` and `--gol-grid-line` were, and exactly as `action.*` was pinned in the 1.9
  review.
- ⚠️ **`import { Dialog } from '@mui/material'` pulls the barrel.** With the budget already moving
  for this story, a barrel import is the one mistake that would make the measured delta unexplainable
  — and Task 9 tells you to stop and report rather than raise the budget to fit it.
- ⚠️ **Adding a hex token without its `-channel` line is silent.** `themeTokens.test.ts:118-145`
  documents why: MUI's `private_safeColorChannel` is called with no warning argument, so a missing
  channel ships `--mui-palette-error-mainChannel: #ff3366` — a hex where a triplet belongs — and
  every derived state layer resolves to an invalid `rgba()` and renders fully transparent, with
  nothing logged. That test is the guard, not the console.
- ⚠️ **`palette.error.dark` must be authored, not derived.** MUI's `lighten`/`darken` return their
  input unchanged on a `var()` string rather than throwing (theme.ts:97-105), so a derived `dark`
  silently equals `main` and the contained-button hover fill produces no visual feedback — the exact
  defect already recorded for `secondary`/`--gol-accent-2`.
- ⚠️ **The empty state's `<h2>` and the dialog's `<h2>` both inflate a "level 2 heading" count.**
  This is why Task 7 exists. A seeding regression yielding zero battles currently reports "1
  heading" and reads as one surviving tile.
- ⚠️ **`vitest-axe`'s `toHaveNoViolations` matcher is deliberately not wired** (`vitest.setup.ts:5-8`
  — its types conflict with `tsc`). Use
  `const results = await axe(container); expect(results.violations).toEqual([])`.
- ⚠️ **`getComputedStyle` returns `''` for every `--gol-*` under jsdom** — `app/themes.css` is never
  loaded there. Nothing in this story should read a token from JS; all colour goes through
  `var(--gol-*)` in styled objects.
- ⚠️ **`npm run ci` is where this surfaces, not `npm test`.** This story adds an e2e spec, touches
  four existing spec/test files, and changes the bundle.

### Previous story intelligence (1.10–1.12)

- **1.12 (empty state, done 2026-08-13):** 11 patches. Three were validated by *reverting the code
  they guard* and confirming the test went red — that falsification step is now standing practice
  here, and Task 5 makes it explicit. Its review also produced the AC3-has-no-reachable-code-path
  decision that Task 1 closes. Two review-layer claims were **rejected on direct verification**
  (an axe `aria-hidden`/`color-contrast` claim, and a test-count arithmetic claim); verify before
  accepting a layer's finding.
- **1.11 (thumbnails, done 2026-08-12):** 20 patches, **most of them tests that could not fail** —
  vacuous spies, guards satisfied by the jsdom environment rather than by the component. The
  portalled dialog is this story's version of that hazard: any query or axe run scoped to
  `render()`'s `container` sees an empty tree and passes.
- **1.10 (Gallery, done 2026-08-08):** established `page.tsx` → `<BattleGallery>` (owns load + view
  state) → `<BattleTile>`, repositories as props typed to the interfaces. Its review produced 19
  patches, most of the form "the schema permits it and the UI assumed it didn't" — for this story
  that shape is the empty battle name (`z.string().max(100)`, no lower bound), which is why Task 2
  hoists the `UNTITLED_BATTLE` fallback rather than passing `name` straight into the dialog.
- **1.9 (theme + shell):** three **wrong WHY comments** found in review; the project treats a wrong
  WHY as worse than none. Task 4 asks you to update two comments that currently point at this story
  — updating the code and leaving the comments stale is that same defect.
- **Conventions:** comments explain WHY and cite the governing id (`(FR-7.7)`, `(AR-46)`,
  `(Decision H)`); no review artefacts in code; components PascalCase `.tsx`, non-component TS
  camelCase and never dotted; `@/components/…` / `@/lib/…` aliases; **commit gate stands** — present
  the file list and a suggested message, then wait for Sidiar.

### Git intelligence

Baseline `d49ce59` ("Story 1.12: apply code review fixes"). Recent shape: `d49ce59`, `e0e8fcb`
(Story 1.12), `734aea5` (1.11 review fixes), `06ba795` (1.11), `41248b5` (1.10 review fixes).

- The two-commit rhythm per story is the norm: implementation, then the code-review patch pass.
  Do not treat the first green `npm run ci` as the end.
- Message convention: `Story 1.13: Delete Battle with Confirmation`, follow-up as
  `Story 1.13: apply code review fixes`.
- The working tree at baseline carries unrelated modifications (`.claude/settings.local.json`, a
  deleted `.claude/scheduled_tasks.lock`). They are **not** this story's and must not appear in its
  File List.

### Latest technical information

**No new dependency — that is a requirement, not an omission.** `@mui/material` **9.3.1** is already
installed; this story imports more of it, it does not add a package. ❌ No `@mui/icons-material`
(a new dependency), no `@mui/x-*` (AR-35). Alongside: Emotion 11.14.x, Next **16.2.10**, React
**19.2.7**, TypeScript 5.9.3, Vitest 4.1.10, jsdom 30.0.1, Playwright 1.62.1, axe-core 4.12.1.
Version policy is caret-on-current-stable — **do not bump anything opportunistically** in the story
that is already spending the bundle budget. Facts verified at `d49ce59` and load-bearing here:

- **`@mui/material@9.3.1` `Modal/ModalManager.js:22` sets `aria-hidden="true"`** on background
  siblings; `grep -rn inert node_modules/@mui/material/Modal node_modules/@mui/material/Unstable_TrapFocus`
  returns **nothing**. There is no built-in inert path — hence Task 3's hook.
- **`DialogTitle` renders `component: "h2"` by default** (`DialogTitle/DialogTitle.js:52`).
- **The theme already carries `cssVariables: true`,** which `theme.ts:87-106` records as required
  for `<Button>`/`<IconButton>` to render at all (`alpha()` in their variant styles throws on a
  `var()` string without it). `lib/theme.test.tsx` already renders both, so the path is proven —
  this story is the first to ship them.
- **`lighten`/`darken` return their input unchanged on a `var()` string** rather than throwing
  (`theme.ts:97-105`), which is why `palette.error.dark` must be authored.
- **`page.goto` defaults to `waitUntil: 'load'`,** which resolves against the prerendered HTML.
  Any Playwright assertion satisfiable by the prerender will be, on its first poll — which is why
  the axe run must wait for the dialog to be visible first.
- **`inert`** is supported across the NFR-2.1 matrix (Chrome 102+, Firefox 112+, Safari 15.5+) and
  React 19 passes it through as a boolean prop.
- **axe-core 4.12.1 ships `target-size` as `enabled: false`.** The 28×28 delete button clears
  SC 2.5.8's 24 px minimum anyway, unlike the 12 px organism dots — but a clean axe run still means
  only "none of the enabled rules fired".

### What NOT to build (scope boundaries)

- ❌ **A barrel import (`import { Dialog } from '@mui/material'`) or `@mui/icons-material`.**
  Per-component imports only (AR-35); the `×` glyph is text, not an icon package.
- ❌ **Any route, or any navigation from a tile.** `/` is still the only route; `/battle/[id]` is
  Story 2.1, `/battle/new` is 2.2, `/settings` is Epic 5.
- ❌ **Edit / Run / Duplicate / Export tile actions, or a `⋮` menu to hold them.** Epics 2, 3 and 5.
- ❌ **Delete-organism, the usage index, or any FR-1.4 / M7 integrity guard.** Battles have no
  referential dependents — nothing points *at* a battle — so this story needs no guard at all. The
  organism delete block is Epic 4 (Stories 4.21/4.22), and it lives in `packages/domain`.
- ❌ **Undo, a toast/snackbar, or a soft-delete/trash.** Not in FR-7.7 or anywhere in the PRD.
- ❌ **Multi-select or bulk delete.** Not in any AC. `clearAll()` is Story 5.10 and is a different
  operation with a different guarantee (Decision F: it never touches `gol:settings`).
- ❌ **A retry control on the error body** — the *mechanism* lands in Task 1; the affordance stays
  deferred (no AC, and the deferred entry asks only for the entry point).
- ❌ **`packages/*` changes of any kind.** `BattleRepository.delete(id)` already exists
  (`repositories.ts:24`), `LocalStorageBattleRepository.delete` is implemented
  (`localStorageBattleRepository.ts:69-74`), and `createFakeRepositories()` implements it
  (`fakeRepositories.ts:156-162`). If you find yourself editing a package, stop and say why.
- ❌ **A second `[data-theme]` token block, or any Biotech styling.** Story 6.1, and per
  `project-context.md#Token layer shape` it must be an override block, not a second complete set.
- ❌ **`warning` / `info` / `success` / `grey` / `common` palette entries.** Only `error` has a
  consumer after this story; pinning the rest speculatively is the opposite of what the 1.9 deferral
  decided.

### Project Structure Notes

```
apps/web/
  components/
    DeleteBattleDialog.tsx        'use client' — MUI Dialog, per-component imports, no repo  [new]
    DeleteBattleDialog.test.tsx   name/description wiring, callbacks, pending, focus, axe    [new]
    BattleGallery.tsx             reload token, confirm state, delete handler, focus move   [modify]
    BattleGallery.test.tsx        AC1/2/3/4/5 flow tests; count retargets (6 sites)         [modify]
    BattleTile.tsx                TileActions + DeleteButton + onRequestDelete; ref fix     [modify]
    BattleTile.test.tsx           the affordance's name, hover/focus reveal, callback       [modify]
  app/
    themes.css                    --gol-danger{,-hover,-channel}, --gol-on-danger, backdrop [modify]
  lib/
    useInertBackground.ts         only if Task 5's measurement shows aria-hidden-focus fires   [new]
    theme.ts                      palette.error + MuiDialog/Backdrop/DialogTitle overrides  [modify]
    themeTokens.test.ts           danger AA rows + channel/token floors                     [modify]
  e2e/
    deleteBattle.spec.ts          storage proof, cancel, AC3, live empty state, trap, axe     [new]
    gallery.spec.ts               count retargets (4 sites)                                 [modify]
scripts/
  check-bundle-size.mjs           BUDGET_GZIP_KB raised, with the measured before/after      [modify]
docs/implementation-artifacts/
  deferred-work.md                resolve 4 entries that name this story; add the docs-      [modify]
                                  reconciliation entry for the ~300KB figure
```

`apps/web` holds UI and wiring **only**. Nothing enters `packages/domain`, `packages/simulation` or
`packages/persistence`, and **no package has a coverage gate this story can trip** (`apps/web` is
deliberately ungated; the flip is Story 3.7). There is no `eslint.config.mjs` or `package.json`
change. If your diff touches a file outside the block above, stop and say why.

### Deferred-work items this story is expected to close

| Entry (in `deferred-work.md`) | Task | Outcome |
|---|---|---|
| 1.12 — "AC3's reappears… has no reachable code path; Story 1.13 must add the re-list edge" | 1, 5 | **Closed** |
| 1.12 — "Ten surviving assertions still equate level-2 heading count with tile count" | 7 | **Closed** — and correct its stale site list |
| 1.11 — "`hasLoadStarted` makes every declared dependency of `BattleTile`'s load effect inert" | 8 | **Closed** |
| 1.9 — "`--gol-bg-hover` is contrast-gated but never painted" | 2 | **Closed** — first consumer |
| 1.9 — "`error`/`warning`/`info`/`success`/… remain Material defaults" | 4 | **Partly** — `error` pinned; re-point the rest |
| 1.12 — "`loadState: 'error'` is terminal" | 1 | **Partly** — entry point exists, no retry affordance |
| 1.9 — "MUI's derived component tokens are silently no-op'd by `lighten`/`darken`" | 3, 4 | **Untouched** — `error.dark` is authored, so Button is unaffected; Slider/Switch/LinearProgress/Snackbar still have no consumer |

One **new** entry to add: `RFC-003:48/253/309` and `epics.md:159, :371` still carry the
pre-measurement `~300KB` bundle figure after Task 9 raises the gate — a docs reconciliation, owned
by whoever next revises those specs, not by this story.

Update each entry in place (struck through with the resolution, matching the file's existing
convention for resolved items) rather than deleting it. ⚠️ Do not mark an entry resolved that you
only partly addressed — Story 1.5's `useWorkspaceSeed` entry was struck through prematurely and had
to be reopened in a later review.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.13, :509-521] — the story statement and five ACs
  verbatim
- [Source: docs/planning-artifacts/epics.md:104] — **FR-7.7**, delete battle with confirmation prompt
- [Source: docs/planning-artifacts/epics.md:110] — **FR-7.15**, the shared workspace-level organism
  library that AC3 protects
- [Source: docs/planning-artifacts/prds/…/prd.md:440-442] — FR-7.7's own acceptance criterion,
  "Display confirmation prompt before deletion"
- [Source: docs/planning-artifacts/architecture.md:269, :321] — **Decision H** / **M7**: "used by a
  battle" means *placed on `initialGrid`*, and the whole-workspace hard block runs in the *organism*
  direction only — deleting a battle has no integrity guard because nothing references a battle
- [Source: docs/planning-artifacts/rfcs/RFC-005-…md:127-133] — the Gallery's own prescribed shape:
  "load the list from the repo; delete + reload locally. No global cache." — `await battles.delete(id);
  reload()` is RFC-005's line, not an invention
- [Source: docs/planning-artifacts/rfcs/RFC-003-…md:53-68, :234] — the MUI component inventory
  listing `Dialog` and the accessibility argument for it: the basis for forced decision 1
- [Source: docs/planning-artifacts/rfcs/RFC-003-…md:48, :253, :309] — the `~200KB initial / ~300KB
  total` budget, stated as "to be validated by benchmarking after MUI integration" — this story is
  that benchmark (Task 9)
- [Source: docs/planning-artifacts/epics.md:159, :371] — **AR-3**, "bundle budget ~300KB", the
  second place the figure is written down
- [Source: node_modules/@mui/material/Modal/ModalManager.js:22] — `setAttribute('aria-hidden',
  'true')` on background siblings, with no `inert` anywhere in the package: the AC5 risk
- [Source: node_modules/@mui/material/DialogTitle/DialogTitle.js:52] — `component: "h2"`
- [Source: docs/planning-artifacts/component-tree-battle-page.md:343-350] — §3.15 Dialogs & guards;
  `<UnsavedChangesDialog>` / `<ResizeClipWarningDialog>` are Epic 2 and inherit this story's dialog
  precedent
- [Source: docs/planning-artifacts/ux-designs/…/clinical-lab-theme/battle-gallery.html:395-424] —
  `.tile-actions` / `.action-menu-btn` / `:hover`, the source of every value in Task 2
- [Source: docs/planning-artifacts/ux-designs/…/biotech-terminal-theme/battle-gallery.html:397-428,
  :679-681] — the only rendered delete affordance in any mockup, and the per-action-button structure
- [Source: docs/planning-artifacts/ux-designs/…/clinical-lab-theme/settings.html:15, :181-219] —
  `--warning: #ff3366`, `.btn` / `.btn-secondary` / `.btn-warning`, the source of Task 3's button
  values and of the AA departure
- [Source: apps/web/components/BattleGallery.tsx:87-135, :140-145, :177-199] — the load effect,
  the `live` cancellation flag, the derived `state`, and the three view bodies
- [Source: apps/web/components/BattleTile.tsx:22-25, :46-61, :286-343] — `UNTITLED_BATTLE`, the
  `&:hover, &:focus-within` + reduced-motion precedent, and the `hasLoadStarted` effect Task 8 fixes
- [Source: apps/web/components/GalleryEmptyState.tsx] — the AC4 target; its `<h2>` is the hydration
  signal every retargeted wait keys on
- [Source: apps/web/lib/theme.ts:30-85, :97-105] — the explicit-shade palette shape Task 4 mirrors,
  and why `dark` must be authored rather than derived
- [Source: apps/web/app/themes.css:59-70, :100-114] — the `--gol-action-*` set, the comment
  deferring the status colours to this story, and the `--gol-shadow-*` / `--gol-grid-line`
  precedent for authoring a composite token instead of an inline `rgba()`
- [Source: apps/web/lib/themeTokens.test.ts:55-116, :118-157] — the AA gate rows, the deliberate
  `--gol-border` exclusion, and the channel-mirror guard
- [Source: apps/web/e2e/gallery.spec.ts:1-66] — `buildSeedPayload()` / `seedWorkspace()`, the
  production-export seeding pattern the new spec reuses
- [Source: apps/web/e2e/home.spec.ts:34-44] — the hydration wait that must precede an axe run, and
  why (`page.goto` resolves at `waitUntil: 'load'`)
- [Source: apps/web/vitest.setup.ts:5-8] — why `toHaveNoViolations` is not wired
- [Source: packages/persistence/src/repositories.ts:16-28] — `BattleRepository.delete(id)`, already
  defined; and the "consumers type against the INTERFACE, never an implementation" rule (AR-2/27)
- [Source: packages/persistence/src/localStorageBattleRepository.ts:69-74] — `delete()` reads the
  whole collection first, which is the `CorruptDataError` path forced decision 3 handles
- [Source: packages/test-utils/src/fakeRepositories.ts:156-162, :210-214] — the fake `delete`
  implementations both AC2 and AC3 assert against
- [Source: scripts/check-bundle-size.mjs:15] — `BUDGET_GZIP_KB = 300`, the constant Task 9 raises;
  **288.2 KB** is the 1.12 baseline
- [Source: docs/implementation-artifacts/epic-1/1-12-gallery-empty-state.md#Review Findings] — the AC3
  decision this story closes, and the falsification-check practice
- [Source: docs/implementation-artifacts/deferred-work.md] — the six entries in the table above
- [Source: docs/project-context.md] — injected repositories, no DOM types in `packages/*`, one
  immutable MUI theme, the token-layer `:root` shape, camelCase filenames, the
  verification-before-done rule, the commit gate

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (implementation, this session, after Sidiar's `/model` switch). The story file
itself (docs/implementation-artifacts/epic-1/1-13-delete-battle-with-confirmation.md) was authored by
claude-opus-5 in the earlier planning turn of this same conversation, before the switch — recorded
separately per this project's convention (Story 1.12's Dev Agent Record) of attributing the model
that actually produced each artifact rather than defaulting to whichever session made the commit.

### Debug Log References

- **Forced decision 1 (MUI Dialog vs. native `<dialog>`) — Sidiar's explicit choice**, gathered via
  `AskUserQuestion` before implementation began: ship `@mui/material/Dialog` per RFC-003, move the
  AR-3 budget. Implemented as decided; not re-litigated.
- **`npm run bundle:check`**: measured **306.3 KB gzip** home-route first load (10 assets) against
  the 1.12 baseline of 288.2 KB — a **+18.1 KB** delta, well under the story's own ~45 KB
  per-file-sum upper bound (shared `@mui/utils`/`ButtonBase` chunks were already in the bundle).
  `BUDGET_GZIP_KB` moved 300 → **320** via `ceil((306.3 + 12) / 5) * 5`; final gate: **"within
  budget (13.7 KB headroom)"**.
- **Hydration/prerender gate**: `npm run build:standalone` then
  `grep -c "No Battles Yet" apps/web/out/index.html` → `0`;
  `grep -c "Delete Battle?" apps/web/out/index.html` → `0`. Neither the empty state nor the dialog
  leaked into the prerendered HTML.
- **Task 5 `aria-hidden-focus` measurement** (before deciding whether to ship
  `useInertBackground`): a throwaway script rendering `<BattleGallery>` with the dialog open and
  inspecting the full axe result (not just `violations`) found the rule **did not appear in
  `violations`**, but **did appear in `incomplete` with exactly 1 matching node** — axe found a
  real focusable descendant under an `aria-hidden` ancestor and could not resolve it further
  without jsdom's absent layout. Structurally the finding is real (verified independently:
  `@mui/material@9.3.1`'s `Modal/ModalManager.js:22` sets `aria-hidden="true"` on background
  siblings and the package uses `inert` nowhere), so the hook shipped rather than waiting for a
  real-browser run to turn `incomplete` into a reported violation. e2e confirms the fix: the
  background delete button is unreachable by `getByRole` at all once inert, and a direct `.focus()`
  call on it (via a raw CSS locator) is a no-op.
- **Falsification checks (Task 5, the 1.11/1.12 review pattern)** — each applied, confirmed red,
  then reverted:
  - **(a) `reload()` before `await battles.delete(id)`**: the unit test (`BattleGallery.test.tsx`,
    "confirming calls battles.delete...") **stayed green** — confirming the story's own prediction
    that `createFakeRepositories`' synchronous underlying store can't distinguish this reordering
    through `waitFor`. An **additional e2e falsification** (removing the real `battles.delete()`
    call entirely, run against the actual static export) **did** catch it: 4 of 8
    `deleteBattle.spec.ts` tests went red (AC2 storage check, AC3, AC4, and the focus-after-delete
    test), proving the flow is not vacuous end-to-end even though the unit layer alone can't
    isolate this specific reordering.
  - **(b) Delete `aria-label` from `DeleteButton`**: initially passed unexpectedly — `title`
    (kept identical to `aria-label` deliberately) is a valid accessible-name fallback per the
    computation algorithm, so removing only `aria-label` doesn't break the query. Strengthened to
    genericize **both** `aria-label` and `title` to `"Delete"` (a real regression shape: threading
    the wrong/generic name through instead of the per-tile one) — this correctly turned 3 tests red
    (`BattleTile.test.tsx`'s naming test and the `BattleGallery.test.tsx` AC1 test).
  - **(c) Add `organisms.delete(...)` to the confirm handler**: turned the AC3 test red as
    expected ("expected 'delete' to not be called at all, but actually been called 1 times").
  - All three reverted to the real implementation; full suite reconfirmed green after each.
- **Two implementation bugs found only through e2e, not anticipated by the story's Task 3/6 text,
  both fixed and confirmed via re-run:**
  1. **`onClick={onRequestDelete}` passed the DOM `MouseEvent` as an argument**, violating the
     prop's own `(): void` contract — caught by a unit test asserting
     `toHaveBeenCalledWith()`. Fixed with `onClick={() => onRequestDelete()}`.
  2. **`disableRestoreFocus` alone did not make forced decision 4's focus move stick.** MUI's
     `FocusTrap` keeps its document-level `enforceFocus` listener attached until its own cleanup
     effect actually runs (torn down after React commits `open=false`); a synchronous
     `titleRef.current?.focus()` call in the same handler that calls `setConfirming(null)` can
     still land inside that window, and the trap silently pulls focus back. Fixed by deferring the
     focus call with `setTimeout(() => titleRef.current?.focus(), 0)`, confirmed by e2e
     ("a successful delete moves focus to the Gallery heading, not `<body>`").
- **A third, e2e-only timing issue in the axe test itself** (not a product bug): `Button`'s root
  styles apply their own `background-color`/`color`/`box-shadow` transition on mount
  (`node_modules/@mui/material/Button/Button.js`, `duration.short` = 250ms) — independent of and
  not synchronised with the Dialog's own `Fade` wrapper. Waiting for the dialog's `opacity: 1`
  alone was not sufficient; axe reproducibly (4/4 runs) computed colour-contrast against the
  Confirm button's blended, transitional colours in that gap. Fixed with an additional
  `page.waitForTimeout(300)` after the opacity wait, confirmed clean 4/4 afterward. The dialog's
  REAL, settled computed styles were independently verified correct throughout via a direct
  `getComputedStyle` inspection (`titleColor: rgb(255,255,255)`, `paperBg: rgb(26,26,26)`,
  `confirmBg: rgb(255,51,102)`, `confirmColor: rgb(10,10,10)` — all exactly the intended tokens).
- **A real tab-order regression found before any commit**: `TileActions` was originally placed as
  `<Tile>`'s first child (matching the mockup's markup order), which put the always-tabbable
  (opacity-0-but-focusable) delete button ahead of the organism dots in the DOM — breaking 3
  pre-existing Story 1.10 tests that assert the first `Tab` lands on the first dot. Fixed by moving
  `TileActions` to be `<Tile>`'s LAST child; `position: absolute` keeps its visual top-right
  placement unchanged. Documented in-line as a deliberate DOM-vs-visual-position split.
- **`npm run ci`** (redirected to a file, exit code echoed separately — not piped): first run caught
  3 files needing `prettier --write` (`BattleGallery.test.tsx`, `BattleTile.test.tsx`,
  `deleteBattle.spec.ts`, formatting only, no logic changes); re-run: **exit 0**.
- **`npx playwright test` — full four-project matrix** (chromium/firefox/webkit/tablet) for
  `deleteBattle.spec.ts` + `gallery.spec.ts` + `home.spec.ts` + `appShell.spec.ts`: **76 passed**
  (matches 44 at the 1.12 baseline + 8 new tests × 4 projects = 32).

### Completion Notes List

- **Forced decision 1 — resolved by Sidiar (2026-08-13), not re-opened**: `@mui/material/Dialog`,
  the AR-3 budget moved to 320 KB (measured 306.3 KB + ~12 KB headroom, rounded to the next 5 KB).
- **Forced decision 2 (one Delete button, not a `⋮` menu)**: shipped as specified — structure from
  the biotech mockup's per-action buttons, values from the clinical CSS.
- **Forced decision 3 (rejecting delete)**: shipped as specified — `catch` closes the dialog
  (`setConfirming(null)`) and sets `loadState` to `{ kind: 'error' }`, reusing the existing alert
  body. No retry control (out of scope, tracked in `deferred-work.md`).
- **Forced decision 4 (focus after delete)**: confirmed the proposed resolution — focus moves to
  the Gallery's `<h1>` (`tabIndex={-1}`) — but it needed two implementation details the story
  hadn't anticipated to actually work: `disableRestoreFocus` on the `Dialog` (to stop MUI's own
  restore-to-trigger from fighting it) AND deferring the `.focus()` call with `setTimeout(0, ...)`
  (to run after `FocusTrap`'s cleanup, not inside its still-active window). Both are documented
  in-line with the diagnostic reasoning.
- **Spec conflicts 1–5**: all resolved exactly as specified — `--gol-on-danger: #0a0a0a` (AA
  departure #4), `opacity: 0` reveal via `[data-tile-actions]` (not `display: none`),
  `--gol-border-control` on the delete button / `--gol-border` on the dialog edge (the
  decorative-vs-control split preserved in both directions), the bundle budget divergence recorded
  in `deferred-work.md` rather than edited into the RFC/epics files, and no existing mockup to
  reconcile for the dialog itself (composed from `settings.html`'s `.btn` family).
- **Task 5's `aria-hidden-focus` measurement**: shipped `useInertBackground` — the rule was not in
  `violations` but was in `incomplete` with a real matching node; treated as a genuine, structurally
  confirmed defect rather than a clean pass. See Debug Log for the reasoning.
- **Task 7's site-list correction**: the deferred-work entry's own line numbers were stale (predated
  the 1.12 review) and mis-scoped one site as a count when it was an order assertion. The verified,
  corrected table shipped in the story stands; `deferred-work.md`'s entry now records the correction
  rather than repeating the stale numbers.
- **Task 8**: `hasLoadStarted` (boolean, set-once) replaced with `loadedBattleId` (keyed on the
  battle id actually loaded) — confirmed live by the delete flow's `reload()`, which mints new
  `roster`/`state` identities on every surviving tile without changing `battleId`, and every
  surviving tile correctly no-ops rather than re-fetching an unchanged grid.
- **Deferred-work.md**: 4 entries closed (`--gol-bg-hover` first consumer, `hasLoadStarted` fix, the
  AC3 re-list edge, the heading-count retarget — with its stale site list corrected), 2 marked
  partly resolved (`error` pinned but `warning`/`info`/`success` remain deferred; the `reload()`
  entry point exists but no retry affordance), and 2 new entries added (the `~300KB` docs
  reconciliation; a closed-with-no-action note on the delete button's hit area so it isn't
  re-flagged against the unrelated organism-dot deferral).
- **Verification**: `npm run ci` exit 0. Per-package unit counts: `@gol/domain` 85, `@gol/persistence`
  82, `@gol/test-utils` 75 (all unchanged — this story touches only `apps/web`), `web`
  **336 passed / 28 files** (311/27 at the `d49ce59` baseline: +25 tests, +1 file —
  `DeleteBattleDialog.test.tsx` new; `BattleGallery.test.tsx` and `BattleTile.test.tsx` extended,
  not new). e2e: **76 passed** across the four-project matrix (44 baseline + 8 new tests × 4
  projects). Bundle: **306.3 KB / 320 KB gzip (13.7 KB headroom)**, budget moved from 300 KB per
  Task 9's measured formula. `npx eslint apps/web`: **0 errors, 1 warning** — the same pre-existing
  `BattleGallery.tsx` `exhaustive-deps` warning inherited unchanged from Story 1.11 (not silenced).
  Coverage: `packages/domain`/`persistence`/`test-utils` unchanged from baseline (this story touches
  no package); `apps/web` remains deliberately ungated (95.22% stmts / 89.03% branch, informational
  only) — `DeleteBattleDialog.tsx` 100%, `BattleGallery.tsx` 98.41%, `BattleTile.tsx` 98.36%.

### File List

- `apps/web/components/DeleteBattleDialog.tsx` — new
- `apps/web/components/DeleteBattleDialog.test.tsx` — new
- `apps/web/lib/useInertBackground.ts` — new (shipped: Task 5's measurement found the
  `aria-hidden-focus` risk real, not clean)
- `apps/web/e2e/deleteBattle.spec.ts` — new
- `apps/web/components/BattleGallery.tsx` — modified (reload token, confirm-dialog state, delete/
  cancel/confirm handlers, focus-restoration ref + deferred focus call, `battleDisplayName` import)
- `apps/web/components/BattleGallery.test.tsx` — modified (AC1–5 delete-flow tests, heading-count →
  article-count retargets at 6 sites)
- `apps/web/components/BattleTile.tsx` — modified (`TileActions`/`DeleteButton`, exported
  `battleDisplayName`, `onRequestDelete` prop, `hasLoadStarted` → `loadedBattleId` ref fix)
- `apps/web/components/BattleTile.test.tsx` — modified (delete-affordance tests, `onRequestDelete`
  default prop, the "no dot is a button" assertion narrowed to per-dot)
- `apps/web/app/themes.css` — modified (`--gol-danger`, `--gol-danger-hover`, `--gol-on-danger`,
  `--gol-danger-channel`, `--gol-backdrop`; comment corrections on the now-partly-resolved status-
  colour deferral)
- `apps/web/lib/theme.ts` — modified (`palette.error`, `MuiButton` extended, `MuiDialog`,
  `MuiBackdrop`, `MuiDialogTitle`, `MuiDialogContentText` style overrides; comment corrections)
- `apps/web/lib/themeTokens.test.ts` — modified (danger AA rows, `bg-hover` deliberately excluded,
  channel/token sanity-floor bumps)
- `apps/web/e2e/gallery.spec.ts` — modified (heading-count → article-count retargets at 4 sites)
- `scripts/check-bundle-size.mjs` — modified (`BUDGET_GZIP_KB` 300 → 320, with the measured
  before/after numbers and authority recorded in the comment)
- `docs/implementation-artifacts/deferred-work.md` — modified (4 entries closed, 2 partly resolved,
  2 new entries added)
- `docs/implementation-artifacts/sprint-status.yaml` — modified (story status lifecycle)

### Review fixes applied (2026-08-14)

Verification after applying all 22 patches + the 2 resolved decisions — `npm run ci` redirected to
a file with the exit code echoed separately, not piped:

- **`npm run ci` → exit 0.** `web` **340 passed / 28 files** (up from 336: +4 net — the inert
  structural test, the delete/re-list ordering guard, the Escape-while-pending guard, and the
  name-through-transition test; the two-tile naming test was rewritten in place, not added).
  `@gol/domain` 85, `@gol/persistence` 82, `@gol/test-utils` 75 — all unchanged.
- **e2e: 88 passed, 4 skipped** across the four-project matrix (was 76). +4 new tests: the
  hover/focus reveal, its touch counterpart, and focus restoration on both cancel and Escape. The
  4 skips are the two pointer-specific tests excluding the projects they do not apply to
  (`test.skip(hasTouch)` / `test.skip(!hasTouch)`), not silenced failures.
- **Bundle: 306.6 KB gzip, 13.4 KB headroom** against the 320 KB gate — +0.3 KB from moving the
  Dialog/Button values to `sx`.
- **ESLint: 0 errors, 1 warning** — the same pre-existing `exhaustive-deps` warning on
  `BattleGallery.tsx`, not silenced.
- **Falsification of the three new unit tests** (each broken, confirmed red, reverted): reordering
  `reload()` ahead of `await battles.delete(id)` → *"expected list to not be called at all, but
  actually been called 1 times"* — **this is the falsification Task 5 recorded as having stayed
  green**, now genuinely guarded by holding the delete promise open; removing `useInertBackground`
  → *"expected false to be true"*; rendering `battleName` instead of the retained name → *"Unable
  to find an element with the text: /Triple Threat/"*.

Two findings were dismissed during application rather than patched, both verified false positives —
see the struck-through bullets above. Three defects surfaced only while applying the fixes, none
predicted by the review:

1. **`disableEscapeKeyDown` no longer exists on MUI v9's Modal.** Escape is always routed through
   `onClose(event, 'escapeKeyDown')` (`useModal.js:115-125`), so the callback guard is the only
   available mechanism, not a belt-and-braces pair with the prop.
2. **React Compiler's lint rules rejected the first shape of two fixes** — `react-hooks/refs`
   (reading a ref during render, for the retained battle name) and
   `react-hooks/set-state-in-effect` (for the held-inert flag). Both were rebuilt around a
   three-phase parent state (`confirming` outliving `dialogOpen`) instead, which is a better model
   anyway: one piece of state now expresses "a confirmation is on screen in some form", which is
   exactly the window the background must stay inert for.
3. **The focus restore failed on WebKit only, twice, for two different reasons.** First a
   `setTimeout(0)` that could beat React's commit releasing `inert` (replaced with an effect keyed
   on `confirming` clearing, so the ordering is guaranteed by React rather than by the event loop).
   Then, after instrumenting the running page: **WebKit does not focus a `<button>` on click**, so
   `document.activeElement` read in the click handler was `<body>` and the code was faithfully
   restoring focus to the body. Replaced with a `data-delete-battle-id` lookup at restore time.
   Chromium and Firefox passed throughout both bugs — the four-project matrix is what caught them.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-13 | 0.1 | Story created from epics.md#Story 1.13 | Sidiar |
| 2026-08-13 | 1.0 | Implemented: delete affordance, `<DeleteBattleDialog>` (MUI), danger tokens + `palette.error`, the Gallery re-list edge, `hasLoadStarted` fix, heading-count retargets, bundle budget moved 300→320KB (measured), full `npm run ci` gate green, 4-project e2e matrix green | Claude (claude-sonnet-5) |
| 2026-08-14 | 1.1 | Code review (3 parallel layers, 41 raw → 33 unique findings): 22 patches + 2 decisions applied, 2 deferred, 7 dismissed. Headline fixes — focus restored on every cancel path (AC5 gap), `error.dark` no longer identical to `error.main`, Escape ignored mid-delete, dialog close-transition lifecycle reworked (inert + name + focus), touch reveal, re-entrancy latch, stale-error guard. `npm run ci` exit 0; 340 unit / 88 e2e | Claude (claude-opus-5) |
