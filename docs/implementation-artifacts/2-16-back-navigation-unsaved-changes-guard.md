---
baseline_commit: 1548a522c0ef519669475a1479486ad1bf12b10f
---

# Story 2.16: Back Navigation & Unsaved-Changes Guard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to return to the Gallery safely,
so that I never lose work by accident.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.16: Back Navigation & Unsaved-Changes Guard`, decomposed into the
nine things a reviewer can independently check.

⚠️ **This story closes Epic 2 and it is the story that gives the battle route an exit.** Both battle
surfaces have shipped with **no in-app escape hatch at all** since Story 2.1 dropped the placeholder
Back link (`deferred-work.md:175`); the browser's own Back button is the only way out today, which
is why `createBattle.spec.ts` navigates with `page.goBack()`. Three separate things arrive together
here — the footer affordance (FR-7.10), the in-app guard (FR-7.9, first half) and the
`beforeunload` guard (FR-7.9, second half) — and they are **independent mechanisms that must not be
made to cover for each other** (trap 1).

1. **AC1 — A pinned "← BACK TO BATTLES" sidebar footer (FR-7.10, spec §3.9).**
   A new `<SidebarFooter>` mounts as the **last child of `<EditorSidebar>`, a SIBLING of
   `<SidebarContent>` — not inside it**, so it stays pinned while the four sections scroll. Mockup:
   `.sidebar-footer` (`clinical-lab-theme/petri-dish-lab-mode.html:120-127`) + `.back-btn`
   (`:129-147`), markup `:737-741`.
   ⚠️ It is **not** a `<SidebarSection>` — it has no title and must not gain an `<h2>`. The
   heading-order assertions stay at **four** headings (`['Organisms','Battle Name','Grid Info',
   'Tools']`), in `BattleEditorView.test.tsx` and in `battleRoute.spec.ts`.
   ⚠️ Accessible name **"Back to Battles"** (the mockup's label), *not* "Back to Gallery" — that
   name belongs to `<Notice>`'s `BackLink` on the not-found/error branches, and
   `battleRoute.spec.ts:185` asserts a **link** with that name has count 0 on `/battle/new`. Keep
   both facts true: this control is a `<button>` named "Back to Battles".

2. **AC2 — Clean battle: Back navigates straight to the Gallery, with no dialog (FR-7.10).**
   `isDirty === false` → one navigation, no confirmation, nothing else touched. This is the
   overwhelmingly common path (`/battle/new` opened and abandoned, a battle opened and read).

3. **AC3 — Dirty battle: Save / Discard / Cancel (FR-7.9, spec §3.15).**
   `isDirty === true` → `<UnsavedChangesDialog>` opens instead of navigating.
   - **Save** persists through the *existing* Story 2.13 save path, **then** navigates.
   - **Discard** navigates, losing the changes. Nothing is written.
   - **Cancel** stays on the page and changes **nothing** — no commit, no undo entry, no save, and
     `isDirty` is still true.
   ⚠️ **A save that FAILS must not navigate** (forced decision 2). `handleSave` today swallows its
   own rejection into `saveError` and resolves either way, so `await onSave()` tells the caller
   *nothing*. Navigating on a failed save would discard exactly the data FR-7.9 exists to protect,
   and every current test would stay green.

4. **AC4 — `useDirtyGuard(isDirty)` registers and unregisters `beforeunload` (FR-7.9, RFC-005
   Decision 7).**
   A new `apps/web/lib/useDirtyGuard.ts`, the shape RFC-005 Decision 7 spells out in full. Active
   **only** while dirty: clean → no listener at all (not a listener that returns early — the AC
   says *"inactive when clean"*, and the falsifiable form of that is "no listener attached").
   Registered/unregistered is a **directly testable fact** (trap 3); do not settle for an e2e that
   cannot show a native dialog.

5. **AC5 — Returning to the Gallery resets the undo ring (FR-3.8).**
   FR-3.8's third acceptance criterion in as many words. This is **free** — the ring dies with the
   `<BattlePage>` mount (AR-30: "component lifetime = undo lifetime") and a client navigation
   unmounts it — but *free* is not *proven*: paint, Back, reopen the same battle, and UNDO is
   disabled. ❌ Do not add a reset call; if one appears to be needed, the navigation is not
   unmounting and that is the bug.

6. **AC6 — The dialog is keyboard-operable and axe-clean.**
   Escape = Cancel, focus trapped, focus **restored to the Back button** on every close path that
   stays on the page, and axe-clean on `/battle` with the dialog open. The two shipped dialogs on
   this route already solve every part of this — copy them (trap 6, trap 7).

7. **AC7 — What the guard must leave alone, and what it must not reach (the system stays working
   end-to-end).**
   - Back changes **nothing** about the editor: not `grid`, not `rosterIds`/`sessionRoster`, not
     `chosenTool`, not `battleName`, not `isDirty`. The only thing it does is navigate.
   - The dialog **never** appears on the not-found / error branches (they cannot be dirty, and they
     render before `<BattleEditorView>` exists) — but every hook this story adds is still declared
     **above** `<BattlePage>`'s four early returns, like every other hook in that file (trap 17).
   - Save-and-leave through the dialog lands on the Gallery **with the battle listed** — for
     `/battle/new` that means the first save mints the record and the Gallery shows it (Story 2.13's
     path, unchanged).
   - The background is `inert` while the dialog is open, released before focus is restored (trap 7).

8. **AC8 — The `deferred-work.md` entries this story inherits, settled with evidence.**
   | Entry | What it asks of this story |
   |---|---|
   | `:175` | *"`/battle/new` ships no Back-to-Gallery link… **both** battle surfaces now have no escape hatch other than the browser's own Back button until Story 2.16 ships the sidebar footer's real Back affordance. **Pick this up in Story 2.16**, which is already the story that owns the sidebar footer."* → **closed by AC1.** The entry names the tests that will fail loudly (`BattlePage.test.tsx`, `battleRoute.spec.ts`); they assert the absence of a **link named "Back to Gallery"**, which this story does not add. Update what actually moves and say why the rest stands. |
   | `:239` | The stroke's cached geometry goes stale on a mid-stroke **scroll**. Re-deferred by 2.14 and again by 2.15, which re-pointed it here: *"**Pick this up in Story 2.16** (the sidebar footer / Back button — the next story that touches `<SidebarContent>`'s composition), or in 3.18."* This story adds a control **outside** the scroll region and does not touch the geometry path. Fix it, or re-defer with the premise **re-checked against the code as it stands** (the footer is a sibling of `<SidebarContent>`, so the scroll region does not get taller — say so). |
   | `:355` | `<BattlePage>` silently reverts any other writer of `document.title`; *"Story 2.16's unsaved-changes marker is the obvious candidate… **Pick this up in Story 2.16 if it decorates the title**, by routing that state through `desiredTitleRef`."* → forced decision 7. **No FR asks for a title marker**; the expected answer is "checked, not decorating, entry stands". |
   | `:376` | Saving on `/battle/new` leaves `/battle/new` in the address bar, so a reload then a second save writes a **duplicate battle**. *"**Pick this up in Story 2.16**, which already owns navigation off this route."* ⚠️ **This story changes the entry's premise**: half its stated cost was *"it introduces `useRouter`, which this codebase has none of anywhere"* — after this story it does. The other half (a `router.replace` to `/battle?id=` is a hard remount that destroys the undo ring and the session roster) still stands. Forced decision 6. |
   | `:411` | `useInertBackground` snapshots body children once per open and would miss a portal that mounts later; *"**Pick this up in Story 2.16** (`<UnsavedChangesDialog>`), which this story's own doc comment already names as the second `next/dynamic` + `useInertBackground` consumer on this route."* This story **is** that second consumer. Fix it against a test that pins the DOM state, or re-defer with the premise re-checked now that two dialogs share the hook. |
   | `:417` | A control that disables itself on its own activation blurs focus to `<body>`; *"**Pick this up in Story 2.16** (the sidebar footer / Back button, the next story to touch focus order in this column), or in whichever story next revisits `<EditorStatusBar>`'s button states."* ⚠️ The `aria-disabled` alternative is a **route-wide convention change and Sidiar's call** — do not make it unilaterally. Record what the Back button does about it (forced decision 3) and either fix all three controls or re-defer. |
   | `:191` | ❌ **Not this story's.** *"Pick this up in Story 2.16 **or whichever story first adds a second toolbar control**"* — that is the **Gallery** toolbar band, and this story adds no toolbar control. Check it, note it, leave it. |
   Each entry is **fixed** or **re-deferred with its premise corrected** — the standard
   2.12/2.13/2.14/2.15 set. A re-deferral must name the story that inherits it and say what changed.
   Add any NEW entries under a `## Deferred from: Story 2-16-back-navigation-unsaved-changes-guard …`
   heading.

9. **AC9 — Keyboard-operable, axe-clean, bundle re-measured.**
   The Back control is a real `<button type="button">`, reachable and operable by keyboard with a
   **visible focus ring**; `/battle` and `/battle/new` pass axe with the footer present and with the
   dialog open. Report `npm run bundle:check`'s measured gzip and headroom for `/`, `/battle` and
   `/battle/new`.
   ⚠️ Current: `/battle` **304.3 KB** against a 310 budget (**5.7 KB** headroom), `/battle/new`
   **304.2 KB** (5.8 KB), `/` **329.5 KB** against 340 (10.5 KB). **The MUI `Dialog` stack measured
   +18.1 KB gzip when statically imported** (Story 1.13's measurement, re-confirmed by 2.14) — this
   story's dialog must go through `next/dynamic` like `<ResizeClipWarningDialog>`, and the marginal
   cost of the *second* dynamic dialog should be small because it imports the same modules. **Measure
   it; do not assume it.** Every budget move in `check-bundle-size.mjs` carries Sidiar's name and the
   measurement it came from — a raise here is his call, not the story's.

### What NOT to build

- ❌ **No auto-save**, no "save on leave" without asking. FR-8.11's auto-save is Epic 6 and is
  default-disabled; FR-7.9 asks for a *prompt*.
- ❌ **No route-level navigation blocker / `router.events` interception.** RFC-005's routing
  reconciliation says so in as many words: *"the only real navigation away from an open battle is
  Back-to-Gallery (an in-app button → a confirm dialog) and tab close/refresh (`beforeunload`); no
  router-level navigation blocker is needed for the FR-7.9 guard."* The App Router has no such API
  anyway.
- ❌ **No dirty marker in the tab title or the header** (forced decision 7 / `deferred-work.md:355`).
- ❌ **No mode toggle, no Run-mode sidebar footer** — `<SidebarFooter>` is written so Epic 3 can
  mount it in the Run sidebar (spec §8 lists it as a shared primitive), but this story renders it in
  the Lab sidebar only. NFR-4.1: no dead affordances.
- ❌ **No third dirty scope.** RFC-005 Decision 7 has exactly two, and the second (the Organism
  Editor's) is Story 4.23's.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (all ACs)**
  - [x] `apps/web/components/battle/BattlePage.tsx` **in full**, and specifically: `isDirty`
        (`:220`) and the comment that names this story as the guard that *"will read it in earnest"*;
        the **edit lock** `savingRef` (`:244`) and its two jobs; `handleSave` (`:643-690`) — the
        function this story has to learn the OUTCOME of (forced decision 2); the four early returns
        and the `<Notice>` / `BackLink href="/"` branches (AC7); `data-dirty` on `Root` (`:753`),
        which is how both unit and e2e already watch the flag; the `document.title` observer
        (`:280-350`) — `deferred-work.md:355`.
  - [x] `apps/web/components/battle/BattleEditorView.tsx` — `BattleEditorViewProps` and the comment
        that predicts this story (*"The one remaining sidebar section (`<SidebarFooter>` 2.16)
        brings whatever it needs with it"*); the `next/dynamic` call at `:51` whose doc comment says
        **"Story 2.16's `<UnsavedChangesDialog>` lands on this same route and inherits this call"**;
        `EditorSidebar` (`:209`, `paddingBottom: 0` — the footer supplies its own) and
        `SidebarContent` (`:223`); the composition root's `❌ No sidebar footer and no Back button
        (Story 2.16)` comment (`:543`), which is the line this story deletes;
        `restoreFocusPresetRef` + the focus-restore effect (`:684-716`) — the pattern AC6 copies.
  - [x] `apps/web/components/gallery/DeleteBattleDialog.tsx` **in full** — the dialog idiom AND
        `useDeleteBattleDialog`: the three-phase `confirming`/`dialogOpen` split, the `pending`
        latch and the guarded `onClose` (Escape must not close mid-write), `disableRestoreFocus`,
        the DOM-lookup focus restore and the WebKit finding behind it, and the in-flight ref.
  - [x] `apps/web/components/battle/ResizeClipWarningDialog.tsx` — the same idiom, one route closer:
        paper width, `BUTTON_SX`, Cancel-first + `autoFocus`, per-component MUI imports (AR-35).
  - [x] `apps/web/lib/useInertBackground.ts` — why it is called from the **parent** of the dialog and
        why it spans the exit transition; the one-shot snapshot `deferred-work.md:411` is about.
  - [x] `apps/web/lib/useUndoableGrid.ts` — AR-30's *"component lifetime = undo lifetime"* (AC5 is a
        verification of this file, not new code).
  - [x] `apps/web/components/gallery/CreateBattleLink.tsx` — **forced decision 1 of Story 2.2**,
        which chose `styled(Link)` over `useRouter` and recorded *"this repo has no `useRouter`
        anywhere"*. This story is where that changes; read the reasoning before overturning it.
  - [x] `apps/web/components/layout/AppNav.tsx` + `AppNav.test.tsx` — `next/navigation` is **already
        in this codebase** (`usePathname`), and its test file carries the `vi.hoisted` +
        `vi.mock('next/navigation', …)` idiom this story's tests need, with a comment explaining why
        the mock is mandatory rather than convenient. `not-found.test.tsx` and `AppShell.test.tsx`
        are the other two precedents. ⚠️ Trap 21 — what that mock's absence does to the three
        `BattlePage` test files.
  - [x] `apps/web/components/layout/Notice.tsx` — `BackLink` (the "Back to Gallery" **link**, whose
        name this story must not collide with) and its focus-visible/hover parity.
  - [x] `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` **Decision 7** (the
        two dirty scopes, the `beforeunload` snippet) and the **routing reconciliation** note at
        `:197` (no router-level blocker).
  - [x] `docs/planning-artifacts/component-tree-battle-page.md` §2 (the tree: the dialog and
        `useDirtyGuard` hang off `<BattlePage>`, `<SidebarFooter>` off the sidebar), §3.1, §3.3
        (`onBack(): void` is already in the props list), §3.9, §3.15, §8.
  - [x] `docs/implementation-artifacts/deferred-work.md` — the seven entries in AC8.
  - [x] `apps/web/e2e/battleRoute.spec.ts` — `seedWorkspace` vs **`seedWorkspaceIfFresh`** (`:1039`)
        and `seedConwaysClassic`; the Story 2.13 save journey at `:1066`; the `/battle/new`
        Back-to-Gallery **link** absence assertion (`:185`). Also `apps/web/e2e/createBattle.spec.ts:72`,
        whose comment says browser Back is the only way out *"until Story 2.16's sidebar footer
        exists"*.

- [x] **Task 2 — `useDirtyGuard` (AC4)**
  - [x] New `apps/web/lib/useDirtyGuard.ts`, per RFC-005 Decision 7. `if (!isDirty) return;` **before**
        the listener is attached, so a clean page has no listener at all.
  - [x] `e.preventDefault()` **and** `e.returnValue = ''` (the RFC's own snippet — the second is the
        legacy form some engines still require). Typed as `BeforeUnloadEvent`; no `any`, no cast to
        silence a checker.
  - [x] No `typeof window` guard needed — `useEffect` never runs during the static export's
        prerender, the reason `<BattlePage>`'s title effects give in place. (`useInertBackground`
        guards `document` for its own reasons; do not cargo-cult it.)
  - [x] Unit-test it with a real listener spy: dirty → attached, clean → **not** attached, dirty →
        clean → **removed**, unmount → removed. Trap 3 has the assertion shape that is actually
        falsifiable.

- [x] **Task 3 — `<SidebarFooter>` (AC1, AC9)**
  - [x] New presentational component per spec §3.9: `{ onBack(): void }` plus whatever forced
        decision 3 settles for `disabled`. No repository, no router, no state.
  - [x] `.sidebar-footer` + `.back-btn` from the mockup, with this route's settled substitutions:
        **`--gol-border-control`** not `--gol-border` (SC 1.4.11 — this border is the button's only
        boundary), **no `transition`** (the axe cross-fade trap), **`:focus-visible`** for the ring.
  - [x] Reproduce the mockup's *picture*, not its CSS: `margin-top: auto` is what pins the footer;
        `position: sticky; bottom: 0` is inert against a non-scrolling parent (trap 12). Decide and
        comment.
  - [x] The "←" glyph is decorative — settle its treatment (trap 13) so the accessible name is
        exactly "Back to Battles".
  - [x] Mount as the last child of `<EditorSidebar>`, **outside** `<SidebarContent>`; delete
        `<BattleEditorView>`'s `❌ No sidebar footer` comment and correct the `EditorSidebar` /
        props comments that promise it.
  - [x] Add `onBack(): void` to `BattleEditorViewProps` (spec §3.3 already declares it) and thread it
        from `<BattlePage>`. ❌ Nothing else new on that interface.

- [x] **Task 4 — `<UnsavedChangesDialog>` (AC3, AC6)**
  - [x] New component, composed **exactly** like `<ResizeClipWarningDialog>`/`<DeleteBattleDialog>`
        so this route keeps one dialog idiom: per-component MUI imports (AR-35), `PAPER_MAX_WIDTH`,
        `BUTTON_SX`, `aria-labelledby`/`aria-describedby`, `disableRestoreFocus`, `onTransitionExited`.
  - [x] Three actions. Copy per FR-7.9: *"You have unsaved changes. Save before leaving?"* Order,
        colours and which one carries `autoFocus` per forced decision 4.
  - [x] `pending` while the save is in flight: all three buttons disabled **and** `onClose` guarded,
        so Escape/backdrop cannot close the dialog mid-write (the exact bug the Story 1.13 review
        found on the delete path).
  - [x] Loaded through `next/dynamic` from the same place `<ResizeClipWarningDialog>` is (trap 8).
        ❌ Not a static import.

- [x] **Task 5 — The guard in `<BattlePage>` (AC2, AC3, AC5, AC7)**
  - [x] `useRouter()` from `next/navigation` (forced decision 1), `router.push('/')` for every
        navigation. ❌ Never `window.location` — the route file's own comment warns off exactly that.
  - [x] `handleBack`: clean → navigate; dirty → open the dialog. Nothing else.
  - [x] `handleDiscardAndLeave`: navigate. No write, no state reset (the mount is about to die).
  - [x] `handleSaveAndLeave`: save, and navigate **only if the save succeeded** — forced decision 2.
  - [x] `handleCancelLeave`: close, restore focus to the Back button once the exit transition has
        finished (trap 6), change nothing else.
  - [x] `useDirtyGuard(isDirty)` and `useInertBackground(...)` called here, from the **parent** of the
        dialog, above the four early returns (trap 17).
  - [x] ❌ Do not touch `handleCommitGrid`'s identity, `savingRef`'s role, or the `size` memo. If
        `<BattleEditorView>` needs a second new prop, stop and re-read spec §3.3.

- [x] **Task 6 — Deferred work (AC8)** — the seven entries above, each fixed or re-deferred with its
      premise corrected against the code as it now stands.

- [x] **Task 7 — Tests (all ACs)** — see *Testing standards summary*. Includes updating the
      pre-existing assertions this story necessarily moves (trap 19).

- [x] **Task 8 — Verification (the project rule: report actual output, never claim a step ran)**
  - [x] `npm run ci` — the full gate. ⚠️ **Do not pipe it** (`| tail` reports *tail's* status; this
        masked a real `format:check` failure during the Story 1.9 review). Redirect to a file and
        echo `$?`.
  - [x] `npm run bundle:check` — report gzip + headroom for all three routes against AC9.
  - [x] A local green `ci` is not proof CI is green — check `gh run list` after pushing.

### Review Findings

Three parallel adversarial layers (Blind Hunter — diff only; Edge Case Hunter — diff + repo;
Acceptance Auditor — diff + this spec). Acceptance Auditor found zero AC violations (all nine ACs,
all seven forced decisions and all eight AC8 deferred-work edits verified against the code, not
taken on the Dev Agent Record's word). One genuine defect surfaced, fixed, and regression-tested;
everything else was either an established precedent, an already-recorded and correctly-deferred
gap, or a concern that did not hold up once checked against the code.

- [x] **[Review][Patch] `crypto.randomUUID()` throwing before `saveBattle`'s `try` permanently
  strands the edit lock and, via this story's new `handleSaveAndLeave`, the leave dialog itself**
  [`apps/web/components/battle/BattlePage.tsx:729`] — Edge Case Hunter. Pre-existing placement
  (Story 2.13): `const id = existing?.id ?? crypto.randomUUID();` sat *above* `saveBattle`'s
  `try`/`catch`/`finally`, so a throw there (the code's own comment names the real trigger — a
  static export opened over plain `http://` on a LAN IP is not a secure context) skipped `finally`
  entirely, leaving `savingRef.current`/`isSaving` stuck `true` forever. Invisible with the old
  fire-and-forget `handleSave`; newly reachable through this story's `handleSaveAndLeave`, which
  `await`s the outcome — the throw left `<UnsavedChangesDialog>` open with all three buttons
  `disabled` (guarded by `pending`) and the background `inert`, no escape short of a reload.
  **Fixed:** `id`/`createdAt` computed inside `try`, so the existing `catch` → `setSaveError` →
  `finally` path now runs. **Regression test added**
  (`BattlePage.test.tsx`, `'a save that THROWS before the write (crypto.randomUUID unavailable)
  does not strand the dialog'`) and mutation-checked — reverting the fix reddens it with the exact
  bug shape (unhandled rejection, dialog never closes). Full `npm run ci` green after the fix
  (919 unit/component tests, 344 e2e passed / 4 skipped, bundle unchanged: `/` 329.6 KB, `/battle`
  304.8 KB, `/battle/new` 304.7 KB — matching the Dev Agent Record's own measurements exactly).

Dismissed as noise, precedent-matched, or already correctly handled (not written to
`deferred-work.md` — none rise above a documentation-only note, and re-litigating them there would
be exactly the coverage-padding / non-actionable churn `docs/project-context.md` warns against):

- Blind Hunter's "refused vs failed" `saveBattle()` ambiguity — already the story's own new
  `deferred-work.md` entry (`:423`), unreachable today by construction, correctly deferred.
- Blind Hunter's `useInertBackground` `MutationObserver` scope (`childList`+`subtree` on
  `document.body`) — deliberate, documented (the fix for `:411`), cost bounded to a 3-child sweep.
- Blind Hunter's `UnsavedChangesDialog`'s `color="error"` and the focus-restore
  `closest('[role="dialog"]')` check — both byte-identical to `DeleteBattleDialog`'s established
  idiom (Story 1.13), not new judgment calls.
- Blind Hunter's bundle-dedup and "+0.5 KB" claims being unfalsifiable from the diff alone — the
  Blind Hunter layer has no story-file access by design; independently re-measured above and
  confirmed exact.
- Blind Hunter's `BattleEditorView.test.tsx` "disables the footer while a save is in flight" test
  asserting across two independent `render()` calls rather than one `rerender` — a minor test-style
  nit, not a correctness gap; left as-is.
- Edge Case Hunter's and Blind Hunter's speculative "does the App Router ever delay the unmount"
  concerns on Discard/Save-and-leave — contradicted by Decision K (the battle route is a genuinely
  separate page file; navigation is a real unmount) and by AC5's own e2e, which would catch it.

## Dev Notes

### The three mechanisms, and why they are three

| Channel | Mechanism | Fires on |
|---|---|---|
| In-app Back | `<SidebarFooter>` → `onBack` → `<BattlePage>` guard → `<UnsavedChangesDialog>` → `router.push('/')` | a click on the footer button, and nothing else |
| Tab close / refresh | `useDirtyGuard(isDirty)` → `beforeunload` | a real document unload |
| Everything else | *(nothing)* | — |

They do not overlap and cannot substitute for each other: **`beforeunload` does not fire on a
client-side route change**, and the dialog cannot intercept a tab close. RFC-005's routing
reconciliation note is explicit that this is the whole design and that no router-level blocker is
needed. A story that tries to unify them will end up either double-prompting or building the
blocker the RFC says not to build.

### The save seam, and the outcome problem

`<BattlePage>.handleSave` is Story 2.13's, and it is **total**: it catches its own rejection into
`saveError` and resolves in both cases (`BattlePage.tsx:643-690`). So:

```ts
await onSave();          // resolved. Did it work? This code cannot tell.
router.push('/');        // ← navigates over a failed save. Silent data loss.
```

`isDirty` cannot answer it either — the flag read inside the handler is the render's closed-over
value, not the post-save one. Forced decision 2 settles the shape; whichever is taken, **there must
be a test that reddens when a failing save navigates**, because nothing today would.

### Undo, and what "reset on return" actually costs

Nothing. `useUndoableGrid`'s ring lives in `<BattlePage>`'s state (AR-30: *"component lifetime =
undo lifetime"*), and `router.push('/')` unmounts `<BattlePage>` — the ring goes with it. FR-3.8's
*"Undo history resets when returning to the Battle Gallery"* is therefore an assertion about the
navigation, not a feature. ⚠️ If a future story makes the battle route survive the trip (it must
not — Decision K's two pages are separate files), this AC silently breaks. Pin it end to end.

### What Back does NOT do

- ❌ **It does not save.** Only the two explicit save paths write: `<EditorStatusBar>`'s SAVE and the
  dialog's Save (which is the same call).
- ❌ **It does not clear `isDirty`.** Exactly one thing clears it: a save that resolved (Story 2.13).
  Discard leaves it true and then destroys the component holding it — those are different things,
  and setting the flag false on the way out would be a lie with a one-frame lifetime.
- ❌ **It does not reset the editor.** No `sessionRoster` clear, no tool reset, no name reset. The
  mount dies; there is nothing to tidy.
- ❌ **It does not touch the grid.** A Back is not a commit and must never reach `onCommitGrid`.

### Forced decisions (record the option taken and why in the Dev Agent Record)

1. **A `<button>` + `useRouter`, or a guarded `<Link>`?**
   Story 2.2 forced decision 1 chose `styled(Link)` for the Gallery CTAs and recorded the reason:
   *"this repo has no `useRouter` anywhere… a link is middle-clickable, right-clickable, and
   prefetched by the App Router for free."* That decision's premise was **pure** navigation; this is
   **guarded** navigation.
   - (a) **A real `<button type="button">` + `useRouter().push('/')`** — recommended. FR-7.10 says
     "Back **button**"; the mockup renders a `<button>`; on the dirty path the control opens a dialog
     rather than navigating, which is button semantics, not link semantics; and Save/Discard need
     `router.push` **regardless**, so a link would add a second navigation mechanism rather than
     remove one. ⚠️ Record the deviation from Story 2.2's decision and why its premise does not hold
     here — do not silently overturn it.
   - (b) A `styled(Link)` with `onClick` → `preventDefault()` when dirty. Keeps middle-click and
     prefetch on the clean path, but ships a link that sometimes does not navigate and still needs
     `useRouter` for the other two paths.
   ❌ Never `window.location` (the route file's own comment), and never a nested
   `<a><button></button></a>` — the mockup's markup is invalid HTML and is not the spec.

2. **How does the guard learn whether the save succeeded?**
   - (a) **Extract the body of `handleSave` into `saveBattle(): Promise<boolean>`**, with
     `handleSave` staying `() => { void saveBattle(); }` for `<EditorStatusBar>` — recommended.
     One code path, one place the outcome is decided, and the existing `saveError` surface is
     untouched. ⚠️ Watch the `useCallback` dep lists: `handleCommitGrid`'s stable identity is a
     structural guarantee (`BattlePage.commitSeam.test.tsx`) and must not be disturbed.
   - (b) Have `handleSave` return `Promise<boolean>` directly and widen `onSave` in
     `BattleEditorViewProps`. Fewer moving parts, but it changes a prop's contract for a consumer
     (`<EditorStatusBar>`) that does not care.
   - ❌ (c) Read `isDirty` after the await. It is the render's stale value; this "works" in a test
     that re-renders and fails in production.

3. **Is the Back control `disabled` while `isSaving`?**
   Every other sidebar control on this route is (`<BattleNameField>`, `<GridSettingsSection>`,
   `<EditorToolsSection>`) — the visible half of `<BattlePage>`'s edit lock.
   - (a) **`disabled={isSaving}`** — recommended. Consistent with the whole column, and it removes
     the confusing state where Back opens the dialog during an in-flight save whose Save button
     would then be refused by `savingRef` and close without navigating.
   - (b) Always enabled — navigation is not an edit. Then the dialog's Save path must handle
     "refused because a save is already running" as its own outcome rather than as a silent failure.
   Either way, `deferred-work.md:417`'s self-disable/focus-loss finding applies to (a) only in the
   narrow window where the user's own Save-and-leave is in flight — and there the dialog holds focus.
   Say which, and why.

4. **Dialog button order, colours and `autoFocus`.**
   Both shipped dialogs put **Cancel first in DOM order with `autoFocus`**, because MUI's focus trap
   otherwise focuses the first focusable descendant and an immediate Enter must hit the safe action.
   - (a) **Cancel (`autoFocus`, `variant="outlined" color="inherit"`) · Discard Changes
     (`color="error"`) · Save & Leave (`variant="contained"`)** — recommended: safe first,
     destructive middle, primary last, matching the established order's *reasoning* rather than its
     two-button shape.
   - (b) Cancel · Save · Discard. Defensible (destructive last, as in both shipped dialogs), but it
     puts the recommended action in the middle.
   Whatever is chosen, Escape maps to **Cancel**, and the copy quotes FR-7.9: *"You have unsaved
   changes. Save before leaving?"*

5. **A failed save from the dialog: where does the user find out?**
   - (a) **Close the dialog, stay on the page, and let Story 2.13's existing `role="alert"` line
     above the status bar report it** — recommended. Zero new copy, zero new surface, and it is the
     surface a failed SAVE already uses (NFR-7.2). The user is exactly where they need to be.
   - (b) Keep the dialog open with an inline error. More new copy, a second error surface, and it
     traps the user in a modal they may not be able to resolve.
   Either way: **no navigation**, and `isDirty` stays true.

6. **`deferred-work.md:376` — the `/battle/new` URL and the duplicate battle.**
   The entry rejected `router.replace('/battle?id=…')` on two grounds: the remount destroys the undo
   ring and the session roster, **and** it would introduce `useRouter`. This story kills the second
   ground.
   - (a) **Re-defer with the premise corrected** — recommended. The remount cost is unchanged and is
     the real objection; the honest fix (rewriting the URL without a remount) needs the App Router
     to support it, and `window.history.replaceState` is the thing the route file warns off.
   - (b) Fix it here. Then a save on `/battle/new` costs the user their undo ring at the exact moment
     they were told their work is safe — and that trade is Sidiar's call, not a story-level one.

7. **Does the title get a dirty marker (`deferred-work.md:355`)?**
   - (a) **No** — recommended. No FR asks for one, `<BattlePage>`'s title observer would have to be
     composed with rather than fought, and the entry survives untouched. Record that it was checked.
   - (b) Yes, routed through `desiredTitleRef`. Unrequested scope on the route with the least bundle
     headroom in the repo.

### Traps

1. **`beforeunload` does not fire on client-side navigation, and the dialog cannot see a tab close.**
   Two channels, two mechanisms (see the table above). Do not test one through the other.
2. **A `beforeunload` prompt requires sticky user activation.** A browser will not show the native
   dialog on a page the user has never interacted with — so an e2e that loads a page, sets state
   programmatically and closes it proves nothing either way. See trap 3 for what to assert instead.
3. **The falsifiable `beforeunload` assertion.** Unit: spy on `window.addEventListener` /
   `removeEventListener` (or attach a counter) and assert attach/detach per `isDirty` transition.
   Cross-browser: `page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))`
   — `dispatchEvent` returns **false** exactly when a listener called `preventDefault()`, so this
   observes the guard's real effect with no native dialog involved. **Mutation-check it**: deleting
   the `preventDefault()` must redden it.
4. **`handleSave` swallows its own failure.** See *The save seam* above. `await onSave()` resolving
   is not success.
5. **Save-and-leave while another save is in flight.** `savingRef` refuses re-entrancy silently
   (`BattlePage.tsx:644`), so the dialog's Save could resolve having written nothing. Forced
   decisions 3 and 5 between them must leave no path where that closes the dialog and navigates.
6. **Focus restore is a DOM lookup, not a captured element.** WebKit does not focus a `<button>` on
   click, so `document.activeElement` at open time is `<body>` and MUI's own restore faithfully puts
   focus there — *"the tab order restarts at the top of the document"*. Both shipped dialogs solve
   this the same way: `disableRestoreFocus`, a data attribute on the trigger, a `querySelector` at
   restore time, and the restore run from an **effect keyed on the confirmation clearing** so it
   lands after `inert` is released. Caught by the webkit and tablet projects and by nothing else.
7. **`useInertBackground` is called from the PARENT of the dialog** — `<BattlePage>`, not inside
   `<UnsavedChangesDialog>` — and it must span the **exit transition** (`confirming !== null`
   style), not just `open`. Calling it from the dialog inverts the effect order and inerts a subtree
   that still holds focus; releasing it at close time leaves a window in which the background is
   `aria-hidden` and tabbable at once.
8. **The bundle: `next/dynamic`, and measure the second dialog.** `<ResizeClipWarningDialog>` is
   already dynamic and its doc comment names this story as the inheritor. A static import here does
   not fit (the stack measured **+18.1 KB gzip**; `/battle` has 5.7 KB). Expect the second dynamic
   dialog to be cheap because it imports the same MUI modules — but Story 2.14 measured **~2.1 KB of
   Turbopack chunk-splitting side effect on `/` from adding modules to the graph at all**, and `/`
   has 10.5 KB. Measure all three routes before and after.
9. **The footer is not a section.** No `<h2>`, no `<SidebarSection>` wrapper. The heading-order
   assertions (unit and e2e) stay at four; if one of them moves to five, the footer was mounted
   wrong.
10. **`--gol-border-control`, not the mockup's `--gol-border`.** The decorative border measures
    1.57:1 against `--gol-bg-primary`; this border is the button's only boundary, so SC 1.4.11's 3:1
    applies. `themeTokens.test.ts` asserts the split exists precisely so it keeps being used. The
    mockup's `.back-btn` also uses `--text-primary` for its label where `.tool-btn` uses
    `--text-secondary`; both are validated pairs, so copy the mockup here rather than the sibling.
11. **No `transition` on the button.** The mockup has `transition: all 0.2s`. Stories 2.13, 2.14 and
    2.15 each lost one to an axe scan that landed mid-fade and measured a control at a contrast ratio
    no settled state has.
12. **The mockup's `position: sticky; bottom: 0` does nothing here.** `.sidebar` is
    `overflow-y: hidden` and the footer is a flex item of it — `margin-top: auto` (or
    `<SidebarContent>`'s `flex: 1`) is what pins it. This route's convention is to reproduce the
    picture and drop CSS whose only justification is the mockup (`margin-top: 64px`,
    `position: relative`, the 80px status-bar reserve are all precedents).
13. **The "←" glyph and the accessible name.** `<GridSettingsSection>` and `<EditorStatusBar>` both
    wrap decorative glyphs in `aria-hidden` spans and let the group's label carry the meaning; a
    screen reader announcing "left arrow back to battles" is noise. Keep the accessible name exactly
    **"Back to Battles"** — the e2e and the unit tests both select on it.
14. **Two different "back" affordances now exist on this route.** `<Notice>`'s `BackLink` is a
    `<Link>` named **"Back to Gallery"** and renders only on the not-found/error branches;
    `battleRoute.spec.ts:185` and `BattlePage.test.tsx:278` assert its **absence** on `/battle/new`.
    A footer button named "Back to Battles" leaves both assertions true — do not "fix" them, and do
    not rename either control into the other's name.
15. **Text-transform is not the accessible name.** The DOM text is sentence-case and CSS uppercases
    it (`<EditorToolsSection>` renders `Clear Petri Dish`, the mockup says `CLEAR PETRI DISH`). Same
    here.
16. **`useRouter` needs no `<Suspense>`** — that requirement is `useSearchParams`'s
    (`missing-suspense-with-csr-bailout`, a failure `next dev` never shows). Do not add a second
    boundary, and do not move the existing one.
17. **Every hook goes above the four early returns.** `<BattlePage>` declares every hook before its
    loading / error / not-found branches, deliberately and with a comment saying so. A
    `useDirtyGuard` or `useRouter` call placed after them is a conditional-hook crash on the
    not-found path, which no current test opens with a dirty flag.
18. **`router.push('/')`, not `'/index.html'`, not a relative path.** The Gallery is the root route;
    the static export serves it from `out/index.html` and the App Router resolves `/` correctly.
19. **Pre-existing assertions this story necessarily moves** — the same class of change 2.14 and 2.15
    each made. Expect at least: `BattleEditorView.test.tsx:152` (`queryByRole('button', {name: /back/i})`
    is currently asserted **null**), the fixed button-count assertions in `BattlePage.test.tsx`
    (`:485` and the `/battle/new` count), and `createBattle.spec.ts:72`'s comment about browser Back
    being the only way out. These are counting/naming assertions a new control necessarily moves —
    not assertions this story's design broke. ⚠️ Do **not** weaken an absence assertion into a
    presence one without reading what it was guarding (NFR-4.1).
20. **AR-46 is a live lint rule on `apps/web`** — no raw hex, `var(--gol-*)` only. And AR-35:
    per-component MUI imports; the footer button should need **zero** MUI imports.
21. **`useRouter()` throws outside an App Router context under RTL, and THREE existing test files
    render `<BattlePage>` without a `next/navigation` mock** — `BattlePage.test.tsx`,
    `BattlePage.commitSeam.test.tsx` and `BattlePage.seedPreset.test.tsx`. Adding the hook breaks all
    three **at render**, with an error that names React internals rather than the router (the exact
    confusion `AppNav.test.tsx`'s mock comment documents from Story 1.9). Expect to add the mock to
    each; that is a consequence of the design, not a symptom of a wrong one. The idiom is
    `vi.hoisted` + `vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))`, so `push`
    is assertable per test.
22. **`next/navigation` is not new here; `useRouter` is.** `AppNav.tsx` already imports
    `usePathname`. State the deviation from Story 2.2's forced decision 1 accurately — the repo has
    no *programmatic navigation*, not "no `next/navigation`".

### Testing standards summary

Vitest + RTL, Playwright, vitest-axe. `apps/web` carries **no coverage gate** (a deliberate
counter-metric); the value here is in the invariants, not the percentage. No test whose only purpose
is to raise a number.

**Hook (`useDirtyGuard`):**
- Clean → **no** `beforeunload` listener attached. Dirty → attached. Dirty→clean → removed.
  Unmount while dirty → removed.
- The handler calls `preventDefault()` (assert via `dispatchEvent` returning `false`, trap 3).
- ⚠️ Mutation-check: removing the cleanup, or dropping the `!isDirty` early return, must each redden
  a distinct test.

**Component:**
- `<SidebarFooter>`: renders one `<button>` named "Back to Battles"; click calls `onBack` once;
  `disabled` (per forced decision 3) blocks the callback; no heading is rendered.
- `<UnsavedChangesDialog>`: renders the three actions by name; each fires its own callback exactly
  once; `pending` disables all three; Escape routes to Cancel and is **refused** while `pending`.
- `<BattleEditorView>`: the footer renders **outside** `<SidebarContent>` (assert the DOM
  relationship, not just presence — that is the whole of AC1's "pinned"); the heading-order
  assertion still yields four; `onBack` is forwarded untouched.
- `<BattlePage>`: **the guard matrix.**
  - clean + Back → `router.push('/')` called once, **no dialog**;
  - dirty + Back → dialog open, **no navigation**;
  - dirty + Cancel → no navigation, no write, `data-dirty` still true, grid/roster/name unchanged;
  - dirty + Discard → navigation, `battles.save` **never called**;
  - dirty + Save → `battles.save` called, resolves, **then** navigation, in that order;
  - dirty + Save that **rejects** → **no navigation**, the `role="alert"` line reports it,
    `data-dirty` still true. ⚠️ This is the test that reddens if forced decision 2 is implemented as
    "await and go".
  - Mock `next/navigation`'s `useRouter` with the idiom `AppNav.test.tsx` already uses (`vi.hoisted`
    + `vi.mock`); assert on `push`'s argument, not on a URL. ⚠️ Trap 21: the mock is **mandatory** in
    every file that renders `<BattlePage>` once the hook lands, not only in the new tests.
- Story 2.13's `BattlePage.commitSeam.test.tsx` must still pass **unchanged** — if the
  `saveBattle` extraction disturbed `handleCommitGrid`'s identity, that is the test that says so.

**E2E (`apps/web/e2e/battleRoute.spec.ts`, the established home for battle-route journeys):**
- Clean: open a battle → BACK TO BATTLES → the Gallery heading. No dialog appeared.
- Dirty → Cancel: paint → Back → dialog → Cancel → still on `/battle`, the painted pixels are still
  there, `data-dirty` still true, and focus is back on the Back button.
- Dirty → Discard: paint → Back → Discard → Gallery, and the stored battle is **unchanged**
  (compare `localStorage` before/after, the shape `createBattle.spec.ts` already uses).
- Dirty → Save: on `/battle/new`, paint + name → Back → Save → Gallery **lists the new battle** with
  a live thumbnail. ⚠️ Use `seedWorkspaceIfFresh` (`battleRoute.spec.ts:1039`) for any test that
  saves and then navigates — the shared `seedWorkspace` runs on **every** document load and would
  wipe the saved battle (Story 2.13 Debug Log 2).
- **AC5:** paint → Back → reopen the same battle → UNDO is disabled.
- `beforeunload`: dirty → the dispatched cancelable event is prevented; after a save → it is not
  (trap 3). Both halves, so the assertion can fail in both directions.
- axe-clean on `/battle` and `/battle/new` with the footer present, and on `/battle` **with the
  dialog open**, in all four projects.
- The Tools/heading structure is unchanged: still four `<h2>`s, still no "Back to Gallery" **link**
  on `/battle/new`.
- ⚠️ The `buildSeedPayload`/`seedWorkspace` copies are hand-synced across spec files — keep them
  byte-identical.

**Determinism / hygiene:**
- Never pixel- or snapshot-test the canvas; use the file's existing `snapshotBaseline` /
  `countChangedPixels` / `distinctColorCount` helpers (AR-42).
- Mutation-check the three assertions that must be falsifiable: navigating on a **failed** save,
  navigating **without** the dialog while dirty, and a `beforeunload` listener that is never removed.

## Project Structure Notes

New:

- `apps/web/lib/useDirtyGuard.ts` (+ `.test.tsx`) — RFC-005 Decision 7. camelCase, never dotted.
- `apps/web/components/battle/SidebarFooter.tsx` (+ `.test.tsx`) — spec §3.9. Written so Epic 3 can
  mount the same component in the Run sidebar (spec §8 lists it as a shared primitive) — but with
  **no run-mode prop, branch or variant** added speculatively.
- `apps/web/components/battle/UnsavedChangesDialog.tsx` (+ `.test.tsx`) — spec §3.15, FR-7.9.

Updated:

- `apps/web/components/battle/BattlePage.tsx` — `useRouter`, the three leave handlers,
  `useDirtyGuard`, `useInertBackground`, the dynamic dialog, the `saveBattle` extraction (forced
  decision 2), and `onBack` passed to `<BattleEditorView>`.
- `apps/web/components/battle/BattleEditorView.tsx` — `onBack` on the props interface, the
  `<SidebarFooter>` mount, and the deletion/correction of the three comments that promise this story.
- `apps/web/components/battle/BattleEditorView.test.tsx`, `BattlePage.test.tsx` — the guard matrix
  and the moved assertions (trap 19).
- `apps/web/components/battle/BattlePage.commitSeam.test.tsx`,
  `apps/web/components/battle/BattlePage.seedPreset.test.tsx` — the `next/navigation` mock only
  (trap 21). ⚠️ If either needs more than that, the `saveBattle` extraction changed something it
  should not have.
- `apps/web/e2e/battleRoute.spec.ts` — the Back journeys; `apps/web/e2e/createBattle.spec.ts` — the
  stale comment at `:72` (and, if it reads better with the real affordance, the navigation itself).
- `docs/implementation-artifacts/deferred-work.md` — the AC8 entries settled, plus any new ones.
- `docs/implementation-artifacts/sprint-status.yaml`.

Likely **not** updated (check the assumption, do not assume the check):

- `apps/web/lib/useUndoableGrid.ts` — AC5 is a **test**, not an edit.
- `apps/web/components/battle/EditorStatusBar.tsx` — SAVE's behaviour is unchanged; only the
  function behind `onSave` is re-shaped, and its prop type should not have to move.
- `apps/web/components/PetriDishCanvas.tsx`, `apps/web/lib/clearGrid.ts`, `resizeGrid.ts`,
  `gridStats.ts`, `battleRecord.ts` — a Back is not a grid operation.
- `apps/web/components/layout/Notice.tsx` — `BackLink` keeps its name and its branches (trap 14).
- `scripts/check-bundle-size.mjs` — **only** with Sidiar's explicit approval.
- `packages/*` — nothing here belongs below the `apps/web` boundary.

Conventions that apply and are easy to violate here:

- **Repositories are injected, never imported** (AR-2/27) — this story touches one only through
  `handleSave`, which already has it.
- **Hot state in refs, never React state** — nothing here is hot.
- **No raw hex** (AR-46, a live lint rule on `apps/web`); `var(--gol-*)` only.
- **Per-component MUI imports only** (AR-35), and **dynamic import for heavy components** — the same
  clause that sanctions the dialog's lazy load.
- **Non-component TS files are camelCase, never dotted**; components are PascalCase `.tsx`.
- **No API route, no server action, no dynamic segment** — the static export is non-negotiable
  (Decision K).
- Comments explain **why**, not what; cite governing IDs exactly as the specs spell them
  (`npm run spec:check` fails the build on an ID that resolves to nothing).
- **Nothing reaches `main` without Sidiar's go-ahead**; a story branch may be pushed, merging is
  Sidiar's call.

## References

- [Source: docs/planning-artifacts/epics.md#Story 2.16: Back Navigation & Unsaved-Changes Guard] —
  the ACs.
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md] — **FR-7.9** (unsaved-changes
  warning: the confirmation prompt *and* the browser warning), **FR-7.10** (Back button from any
  Battle view), **FR-7.8** (save), **FR-3.8** (undo — *"history resets when returning to the Battle
  Gallery"*), **FR-8.11** (auto-save, Epic 6 and default-disabled — not this story).
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md] — **Decision 7**
  (two independent local dirty scopes, one guard; the `beforeunload` effect), and the routing
  reconciliation note (*"no router-level navigation blocker is needed for the FR-7.9 guard"*).
- [Source: docs/planning-artifacts/component-tree-battle-page.md#2] — the tree:
  `<UnsavedChangesDialog>` + `useDirtyGuard` hang off `<BattlePage>`; `<SidebarFooter>` is the last
  sidebar child in **both** modes.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.1] — *"Back handler runs the FR-7.9
  guard then navigates"*.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3] — `onBack(): void` is already
  declared on `BattleEditorViewProps` (*"the FR-7.9 guard runs in BattlePage"*), and the sidebar order
  *"Organisms · Battle Name · Grid Info · Tools · Back"*.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.9] — `<SidebarFooter>`'s
  responsibility and API.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.15] — `<UnsavedChangesDialog>` and
  `useDirtyGuard(isDirty)`, both Epic 2.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#8] — `SidebarFooter` as a shared
  primitive (both sidebars; Epic 4's Library).
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-30** (`useUndoableGrid`:
  component lifetime = undo lifetime), **AR-2/27** (App Router, static export, repository injection),
  **AR-35** (MUI core, per-component imports, dynamic import for heavy components), **AR-42** (canvas
  testing as pure units), **AR-44** (cross-browser e2e + axe), **AR-46** (no raw hex), **AR-3**
  (bundle budget in CI).
- [Source: docs/planning-artifacts/architecture.md#Decision K] — every route statically
  prerenderable; ids ride as query params; `/battle` and `/battle/new` are separate page files, which
  is why leaving either one is a real unmount.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html]
  — `.sidebar-footer` (`:120-127`), `.back-btn` (`:129-147`), the footer markup (`:737-741`).
- [Source: docs/implementation-artifacts/2-15-clear-petri-dish.md] — the immediately preceding story:
  the sidebar-button idiom and its two token substitutions, the axe transition finding, the
  four-section sidebar this story adds a footer beneath, and the bundle measurements this story is
  held against.
- [Source: docs/implementation-artifacts/2-14-edit-mode-grid-resize.md] — the `next/dynamic` dialog
  measurement (three variants, one tree) and the focus-restore machinery this story copies.
- [Source: docs/implementation-artifacts/2-13-save-battle.md] — the save path, the edit lock, and the
  `role="alert"` failure surface forced decision 5 reuses.
- [Source: docs/implementation-artifacts/deferred-work.md] — entries `:175`, `:191`, `:239`, `:355`,
  `:376`, `:411`, `:417` (AC8).
- [Source: docs/project-context.md] — the load-bearing non-obvious rules (auto-loaded by BMad skills;
  not restated here beyond the ones this story can actually trip).

## Dev Agent Record

### Agent Model Used

Opus (`claude-opus-5`), per the story's `Dev Model: opus` line.

### Debug Log References

1. **`useDirtyGuard`'s `preventDefault()` is NOT falsifiable through `dispatchEvent` alone — in
   jsdom OR in a real browser.** Trap 3 prescribes `!window.dispatchEvent(new Event('beforeunload',
   { cancelable: true }))` and says deleting `preventDefault()` must redden it. It does not. The
   handler also writes RFC-005 Decision 7's legacy `event.returnValue = ''`, and the `returnValue`
   setter cancels on any FALSY value — so the event is cancelled either way. Measured, not
   reasoned: the mutation was run against jsdom (6/6 green) and, after a rebuild, against all four
   Playwright projects (4/4 green). Both the unit test and the e2e now additionally observe
   `preventDefault` itself (a `vi.spyOn` on the event in jsdom; a wrapped method inside
   `page.evaluate` in the browser). Re-mutated afterwards: the unit test reddens 1 test, the e2e
   reddens all four projects. The `returnValue` write stays (the RFC carries it, and some engines
   still read it) but is not independently observable — the `returnValue` getter reports the
   canceled flag, not what was assigned — and that is recorded in the test rather than claimed away.

2. **jsdom implements no `inert` at all** — no reflected property, no attribute. `element.inert` is
   a plain expando reading `undefined` until something writes it, which made every
   `expect(el.inert).toBe(false)` in the new `useInertBackground.test.tsx` fail against elements the
   hook had correctly never touched. The file goes through an `isInert()` predicate instead.
   `useInertBackground` has shipped since Story 1.13 relying on this property; this is the first
   test file it has ever had.

3. **Trap 21 confirmed exactly as written.** Adding `useRouter` broke `BattlePage.test.tsx`,
   `BattlePage.commitSeam.test.tsx` and `BattlePage.seedPreset.test.tsx` at render — 96 failures
   across 4 files — with `Error: invariant expected app router to be mounted`. The `vi.hoisted` +
   `vi.mock('next/navigation', …)` idiom from `AppNav.test.tsx` fixed all three. ⚠️ One detail the
   story did not name: `afterEach`'s `vi.restoreAllMocks()` does NOT reset a `vi.fn()`'s
   implementation, only a `vi.spyOn` spy's — and one test gives `push` an implementation to observe
   save-then-navigate ORDER. `router.push.mockReset()` (not `mockClear()`) is what keeps that from
   leaking into the next test.

4. **`BattleEditorView.test.tsx`'s fourth failure was NOT the router** — it was trap 19, exactly as
   predicted: two button-count assertions and one `/back/i` absence assertion. Four pre-existing
   assertions moved in total (two in each file), every one a count or an absence a real new control
   necessarily moves. None was weakened: the `/back/i` absence was INVERTED to a presence assertion
   on the exact name, and a `queryByRole('link', { name: 'Back to Gallery' })` absence assertion was
   added beside it so the two controls can never drift into each other's names (trap 14).

5. **`onBack` reaches the callback with the click event.** `<SidebarFooter>` passes `onClick={onBack}`
   directly, matching `<EditorToolsSection>`'s `onClick={onClear}`, so an
   `expect(onBack).toHaveBeenCalledWith()` assertion fails. Dropped in favour of the call count —
   the prop's contract is `(): void` and React's argument is not part of it.

### Completion Notes List

**Forced decisions — all seven taken as recommended; none was overturned by the code.**

1. **A `<button>` + `useRouter` (option a).** FR-7.10 says "Back button", the mockup renders a
   `<button>`, and on the dirty path the control opens a dialog rather than navigating — button
   semantics, not link semantics. Save and Discard need `router.push` regardless, so a link would
   have added a second navigation mechanism rather than removed one. ⚠️ **The deviation from Story
   2.2's forced decision 1 is recorded at both ends**: `<BattlePage>` states why that decision's
   premise (PURE navigation) does not hold for GUARDED navigation, and `CreateBattleLink.tsx`'s
   comment — which asserted "this repo has no `useRouter` anywhere" — is corrected in place, with a
   ❌ against modernising those two CTAs into buttons on the strength of the hook now existing.
   Trap 22 honoured: what is new is *programmatic navigation*, not `next/navigation` (`<AppNav>` has
   imported `usePathname` since Story 1.9).

2. **`saveBattle(): Promise<boolean>` extracted, `handleSave` kept as the void entry point
   (option a).** One code path, one place the outcome is decided, `<EditorStatusBar>`'s `onSave(): void`
   contract untouched, and `saveError` untouched. `false` covers both "threw" and "never attempted".
   ⚠️ `handleCommitGrid`'s identity was NOT disturbed — its deps are still `[commitGrid]` — and
   `BattlePage.commitSeam.test.tsx` passes with only the `next/navigation` mock added, which is the
   test that says so.

3. **`disabled={isSaving}` on the Back control (option a).** Consistent with every other control in
   the column, and it removes the state where Back opens the dialog during an in-flight save whose
   Save button `savingRef` would then silently refuse. `deferred-work.md:417`'s self-disable defect
   is NOT reproduced: `isSaving` is not a function of Back's own activation, and in the one window
   where Back does go disabled (a Save-and-leave the dialog itself started) the dialog holds focus
   and the restore effect returns it afterwards.

4. **Cancel (`autoFocus`, outlined/inherit) · Discard Changes (`color="error"`) · Save & Leave
   (`variant="contained"`) (option a).** Safe first, destructive middle, recommended last. Escape
   maps to Cancel through the guarded `onClose`, and the body quotes FR-7.9 verbatim.

5. **A failed save closes the dialog and stays on the page (option a).** Story 2.13's existing
   `role="alert"` line reports it (NFR-7.2); zero new copy, zero new surface. No navigation, and
   `isDirty` stays true.

6. **`deferred-work.md:376` re-deferred with the premise corrected (option a).** Half its stated
   cost is now gone — `useRouter` exists — and that is recorded. The other half (a `replace` between
   two separate page files is a hard remount that destroys the undo ring and the session roster) is
   the real objection and is unchanged.

7. **No dirty marker in the tab title (option a).** No FR asks for one; `deferred-work.md:355` is
   recorded as checked-and-standing rather than touched. `<BattlePage>` still has exactly one title
   writer.

**AC8 — the seven inherited entries, each settled:**

| Entry | Outcome |
|---|---|
| `:175` | **✅ Closed.** The footer ships the escape hatch. The two tests the entry named did not have to move (they guard a LINK named "Back to Gallery"; this is a BUTTON named "Back to Battles"); the counting assertions that did move are enumerated in the entry. |
| `:191` | **Checked, not this story's.** It is the GALLERY toolbar band; this story touches no Gallery file. Re-pointed at "whichever story first adds a second Gallery toolbar control". |
| `:239` | **Re-deferred, premise re-checked and WEAKER.** The predicted "next story to touch `<SidebarContent>`'s composition" did not touch it: the footer is a SIBLING of the scroll region, so that region gained no height and no section. Re-pointed at 3.18. |
| `:355` | **Checked; entry stands untouched** (forced decision 7). |
| `:376` | **Re-deferred, premise corrected** (forced decision 6). |
| `:411` | **✅ Fixed.** `useInertBackground` now carries a `MutationObserver`, pinned by a new 8-test file that asserts the DOM state rather than an axe pass. Mutation-checked. |
| `:417` | **Re-deferred, premise re-checked.** Back does not become a fourth instance; the `aria-disabled` alternative is a route-wide convention change and Sidiar's call. |

Two NEW entries added under this story's own heading (a refused — as opposed to failed — Save &
Leave closes the guard silently, unreachable today by construction; and the bare
`[data-back-to-battles]` selector, which Epic 3's Run sidebar should re-check). The existing
focus-ring-modality entry was WIDENED rather than duplicated: this story added the second
`outline-style` assertion with the same blind spot and says so in place.

**Verification (actual output, Task 8):**

- `npm run ci` — **PASS**, exit `0`, redirected to a file rather than piped (project-context's
  pipe-swallowed-exit-code warning). typecheck → lint → format:check → spec:check → coverage →
  build:standalone → bundle:check → e2e, all green.
- Unit/component: **918 passed, 0 failed** across 59 files in `apps/web`, of which **48 tests in 4
  new files plus 16 tests added to two existing files** are this story's. The `@gol/*` packages are
  untouched and unchanged: domain 99, persistence 82, test-utils 75, simulation empty.
- E2E: **344 passed, 4 skipped, 0 failed** across all four Playwright projects (chromium, firefox,
  webkit, tablet) — 12 new tests × 4 projects = 48 of them this story's.
- `npm run lint`: 0 errors, 1 warning — the pre-existing `react-hooks/exhaustive-deps` warning on
  `BattleGallery.tsx:248`, untouched by this story.
- **Bundle (AC9), measured before and after on the same tree:**

  | Route | Before | After | Δ | Budget | Headroom after |
  |---|---|---|---|---|---|
  | `/` | 329.5 KB | **329.6 KB** | +0.1 | 340 | **10.4 KB** |
  | `/battle` | 304.3 KB | **304.8 KB** | +0.5 | 310 | **5.2 KB** |
  | `/battle/new` | 304.2 KB | **304.7 KB** | +0.5 | 310 | **5.3 KB** |

  Trap 8 confirmed: the SECOND `next/dynamic` dialog costs **+0.5 KB gzip** on the battle routes,
  not the +18.1 KB a static `Dialog` import measured — it pulls the same MUI modules the first one
  already put in the lazy chunk. `/` moved +0.1 KB (the `useInertBackground` observer, which the
  Gallery's own delete dialog uses). ❌ **No budget was raised**; `scripts/check-bundle-size.mjs` is
  untouched.

**Mutation checks run (each reddens a distinct test, and only what is claimed):**

| Mutation | Result |
|---|---|
| drop `!isDirty` early return in `useDirtyGuard` | reddens "attaches NO listener while clean" (+1) |
| drop the effect cleanup in `useDirtyGuard` | reddens "removes the listener on unmount while still dirty" (+1) |
| drop `event.preventDefault()` | reddens the unit cancel test (1) **and** the e2e in all 4 projects |
| `handleSaveAndLeave` → `await saveBattle(); router.push('/')` | reddens "a save that REJECTS does not navigate" — **and nothing else** |
| `handleBack` → always `router.push('/')` | reddens 6 of the 7 guard-matrix tests |
| delete `useInertBackground`'s `MutationObserver` | reddens exactly the 3 late-arrival tests |

**What was deliberately NOT built** (the story's own ❌ list, all honoured): no auto-save; no
route-level navigation blocker or `router.events` interception (RFC-005's routing reconciliation
forbids it and the App Router has no such API); no dirty marker in the title or header; no
Run-mode footer or mode toggle (`<SidebarFooter>` is written so Epic 3 can mount it, with no
run-mode prop, branch or variant added speculatively); no third dirty scope; no `window.location`
anywhere; no `<Suspense>` boundary added or moved (trap 16); `scripts/check-bundle-size.mjs`,
`useUndoableGrid.ts`, `EditorStatusBar.tsx`, `Notice.tsx` and every `packages/*` file untouched.

**AC5 costs nothing and is proven, not assumed:** no reset call was added anywhere. The e2e paints,
leaves via Discard, reopens the same battle through its Gallery tile and asserts UNDO is disabled —
so the claim rests on `router.push('/')` genuinely unmounting `<BattlePage>` (AR-30, "component
lifetime = undo lifetime"), which is what the test would catch if it ever stopped being true.

### File List

**New**

- `apps/web/lib/useDirtyGuard.ts`
- `apps/web/lib/useDirtyGuard.test.tsx`
- `apps/web/lib/useInertBackground.test.tsx`
- `apps/web/components/battle/SidebarFooter.tsx`
- `apps/web/components/battle/SidebarFooter.test.tsx`
- `apps/web/components/battle/UnsavedChangesDialog.tsx`
- `apps/web/components/battle/UnsavedChangesDialog.test.tsx`

**Modified**

- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/battle/BattlePage.commitSeam.test.tsx`
- `apps/web/components/battle/BattlePage.seedPreset.test.tsx`
- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`
- `apps/web/components/battle/BattleEditorView.statsMemo.test.tsx`
- `apps/web/components/battle/BattleEditorView.clearGuards.test.tsx`
- `apps/web/components/gallery/CreateBattleLink.tsx`
- `apps/web/lib/useInertBackground.ts`
- `apps/web/e2e/battleRoute.spec.ts`
- `apps/web/e2e/createBattle.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/2-16-back-navigation-unsaved-changes-guard.md`

### Change Log

| Date | Change |
|---|---|
| 2026-08-31 | Story created (`create-story`). Status → ready-for-dev. |
| 2026-08-31 | Implemented (`dev-story`): `useDirtyGuard`, `<SidebarFooter>`, `<UnsavedChangesDialog>`, the three leave handlers and the `saveBattle` extraction in `<BattlePage>`. `useInertBackground`'s one-shot snapshot fixed (`deferred-work.md:411`). All seven forced decisions taken as recommended; all seven inherited deferred entries settled; two new ones opened. `npm run ci` green; `/battle` 304.8 KB (5.2 KB headroom), no budget raised. Status → review. |
| 2026-08-31 | Code review (`bmad-code-review`, three-layer adversarial): zero AC violations, zero decision-needed findings. One patch applied — `crypto.randomUUID()` moved inside `saveBattle`'s `try` so a throw (secure-context loss) no longer strands the edit lock / the new leave dialog; regression test added and mutation-checked. Everything else dismissed as precedent-matched, already correctly deferred, or contradicted by the code. `npm run ci` green post-fix (919 unit/component, 344 e2e / 4 skipped, bundle unchanged). Status → done. |

Dev Model: opus   # architecture-shaping: it introduces the repo's first programmatic navigation (overturning Story 2.2's no-`useRouter` decision, which Epic 3's Run-mode Back and Epics 4/5's routes inherit) and the dirty-guard scope Story 4.23 must mirror, and it re-shapes Story 2.13's save path so a caller can act on the outcome
