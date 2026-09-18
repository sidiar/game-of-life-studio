---
baseline_commit: ce3f7ab418ab4ffcb63439c647722347ed2226b7
---

# Story 3.19: Simulation Hotkeys

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want keyboard control of the simulation,
so that I can drive playback without reaching for the mouse.

## Acceptance Criteria

From `epics.md#Story 3.19` (`:974-984`), decomposed into what a reviewer can check independently.
This is UX-sourced scope (spec §9.6): the authority is the two Run mockups' hint lines
(`petri-dish-play-mode.html:744-746` — `Shortcuts: SPACE Play/Pause • → Next • ESC Stop`;
`petri-dish-play-mode-fullscreen.html:370` — `Press F to exit fullscreen • SPACE Play/Pause • →
Next`) plus `component-tree-battle-page.md` §3.13 (hints "display only, handling in
`useSimulationHotkeys`"), §4 (`useSimulationHotkeys(bindings)`: "Run-mode-only key handling …
`SPACE` → play/pause, `→` → step, `ESC` → stop, `F` → toggle fullscreen. Suspended while any
dialog/modal is open or an input has focus") and §3.14 (`onExit(): void // ⛶ Exit Fullscreen / F
key`). There is no backing FR, so the governing IDs in code are FR-4.1 / FR-4.3 / FR-4.4 (what the
keys DO — the same verbs as Story 3.12's buttons), FR-4.5 (a keyboard step counts), NFR-4.1 (a
hint with nothing behind it is a dead affordance — hints and handlers land TOGETHER, as 3.12 and
3.18 both deferred them here for that reason), NFR-1.1 / AR-29 (nothing per cycle reaches React;
a keydown listener that re-subscribes at the 10 Hz publish cadence is churn), RFC-005 (the hook is
a bridge — React never holds hot state; the view stays "the only component that touches
`useSimulation`") and AR-46 (tokens only in the hint styles).

What already exists and is pinned: `<SimulationControlBar>` is the bar CHROME around
`<TransportControls>`, `justifyContent: 'flex-end'` with a head comment that says "3.19 flips it to
`space-between` once the left region has real content" (`SimulationControlBar.tsx:8-13,26-36`);
`<FullscreenStage>`'s file comment says "NOT rendered, by story: the mockup's `.fs-hint` line …
and its `keydown` script are Story 3.19's" (`FullscreenStage.tsx:49-52`); `<BattleSimulationView>`
says "Deliberately ABSENT, by story: hotkeys (3.19)" (`BattleSimulationView.tsx:38`), owns
`handlePlayPause` (`:266-270`, deps `[status, play, pause]`) and hands `sim.step` / `sim.stop`
straight through to both transport homes; `<BattlePage>` owns the `fullscreen` cell with
`handleEnterFullscreen` / `handleExitFullscreen` (`BattlePage.tsx:185-199`), clears it on every
mode change, unmounts the header while the stage is up, and restores focus to
`[data-enter-fullscreen]` on exit only when focus is loose (`:216-225`); the stage's
`<FullscreenTopOverlay>` focuses Exit on mount (`FullscreenStage.tsx:179-181`);
`useSimulation.step()` THROWS while playing (`useSimulation.ts:491`) and `stop()` is always
callable (3.12 FD5). What does **not** exist: any `keydown` handling on the battle route, any
`<kbd>`, `useSimulationHotkeys`, the hints half of either bar.

1. **`useSimulationHotkeys` exists and is a single window listener.** A hook at
   `apps/web/lib/battle/useSimulationHotkeys.ts` (FD1) with the signature in FD2, called ONCE from
   `<BattleSimulationView>` and nowhere else. It attaches exactly one `keydown` listener to
   `window` for the hook's lifetime — added on mount, removed on unmount, NEVER re-subscribed when
   the bindings change (the view re-renders at up to 10 Hz while playing; the bindings are read
   through a latest-ref assigned in an effect, trap 2). Unmounting the view (Run → Lab) removes
   the listener — assert with an `addEventListener` / `removeEventListener` spy, the
   `useDirtyGuard` "no listener at all" form.

2. **The four keys do what the hints say.** With the view mounted, focus loose (`<body>` or a
   non-interactive element) and no dialog on the page:
   - `Space` (`event.key === ' '`) → the bar's `onPlayPause` (Play while paused, Pause while
     playing — the view's `handlePlayPause`, the SAME derivation the buttons use, FR-4.1).
   - `ArrowRight` → `onStep` **only while `status === 'paused'`** (FR-4.3 "paused only, matching
     3.12"); while playing the key is a no-op — `sim.step()` is never called, never caught (its
     throw is the tripwire, trap 1). A keyboard step publishes exactly like a button step
     (`data-cycle` advances by one, FR-4.5).
   - `Escape` → `onStop` (FR-4.4): status paused, cycle 0, the initial grid repainted.
   - `f` / `F` (case-insensitive on `event.key`) → toggle fullscreen (AC5).
   - Every HANDLED key calls `event.preventDefault()` (Space would scroll, ArrowRight would
     scroll horizontally); an IGNORED key (AC3) never does — the native behaviour proceeds.

3. **Suspension rules — the hook ignores the event when ANY of these holds** (each one a unit
   test on the hook; the order below is the check order in code):
   - (i) `event.defaultPrevented` or `event.isComposing` (an IME or an inner handler got there
     first).
   - (ii) `event.ctrlKey || event.metaKey || event.altKey` — `⌘F` / `Ctrl+F` stays Find, `Alt+→`
     stays history navigation. `shiftKey` alone is NOT a modifier here (`Shift+F` yields
     `key === 'F'`, which the case-insensitive match accepts).
   - (iii) `event.repeat` — a held key fires once (FD7; the 3.18 review's "held `Enter`
     ping-pongs the stage" entry, closed for `F` by construction).
   - (iv) The target is, or is inside, an EDITABLE or KEY-CONSUMING control: `input`, `textarea`,
     `select`, `[contenteditable]` (any value but `"false"`), `[role="slider"]`,
     `[role="textbox"]`, `[role="combobox"]`, `[role="listbox"]`, `[role="menu"]`,
     `[role="menuitem"]`, `[role="option"]`. The Run sidebar's two `<LadderSlider>`s are native
     `<input type="range">` (3.13 FD1) — `ArrowRight` on a focused slider moves the slider and
     NEVER steps the sim (trap 5).
   - (v) A dialog is present or the event came from inside one: `document.querySelector(
     '[role="dialog"], [aria-modal="true"]') !== null` OR `target.closest('[role="dialog"],
     [aria-modal="true"]') !== null` (FD10). MUI's `<Dialog>` keeps its `role="dialog"` Paper in
     the DOM through its exit transition, so a second `Escape` a beat after Cancel is still
     suspended (trap 6).
   - (vi) **`Space` only:** the target natively activates on Space — `button`, `a[href]`,
     `summary`, `[role="button"]`, `[role="link"]`, `[role="checkbox"]`, `[role="switch"]`,
     `[role="tab"]`, `[role="menuitemcheckbox"]`, `[role="menuitemradio"]` — the hook does
     NOTHING and the browser's own activation runs (FD3 (a)): Space on a focused Play button
     fires `onPlayPause` ONCE (`SimulationControlBar.test.tsx:158-168` already pins "Enter and
     Space on Play both fire onPlayPause once each" — the hook must not make it twice), Space on a
     focused Stop button stops, Space on a focused Back button leaves. `ArrowRight` / `Escape` /
     `F` on a focused button ARE handled (a button consumes none of them).

4. **Lab mode has no hotkeys at all.** The hook is mounted by the Run view, which `<BattlePage>`
   unmounts in Lab (`BattlePage.tsx:992`), so in Lab there is no `keydown` listener on `window` —
   not one that declines to act (assert the spy sees zero `keydown` registrations from this hook
   across a Lab render). Pressing the four keys in Lab changes nothing observable: `data-mode`
   stays `lab`, `data-dirty` stays as it was, no fullscreen, no undo. Run → Lab while the hook is
   mounted removes the listener in the same commit that unmounts the view (AC1).

5. **`F` is the keyboard twin of the header's Fullscreen button and the stage's Exit button.**
   `<BattleSimulationView>` gains `onEnterFullscreen(): void` (FD5) and composes the toggle:
   `fullscreen ? onExitFullscreen : onEnterFullscreen`. Consequences, all of which already hold
   for the pointer path and must hold unchanged for the key:
   - `F` in the chassis: `data-fullscreen="true"`, the header unmounted, Exit focused (the stage's
     existing mount effect), the SAME canvas node, ONE renderer construction, no `drawFull`
     (3.18's three tripwire tests in `BattleSimulationView.test.tsx` stay green; a new test
     repeats them through the key).
   - `F` in the stage: `data-fullscreen="false"`, the chassis back, and — because the HUD and its
     focused control unmount, leaving focus on `<body>` — `<BattlePage>`'s restore effect moves
     focus to the header's `[data-enter-fullscreen]` button (the "loose focus" branch,
     `BattlePage.tsx:216-225`); no new focus code in this story.
   - A running simulation keeps running through both (`data-status="playing"` before and after,
     `data-cycle` monotone; the `rafScheduler` is untouched — Decision D).
   - `F` is handled whether or not the header's Fullscreen button would be enabled — it never is
     disabled (3.18 Completion Notes: "never disabled"), so there is no lock to mirror.

6. **`Escape` STOPS in the stage too; `F` is the only key that exits (FD4 (a)).** In fullscreen,
   `Escape` → `onStop` (status paused, cycle 0) and `data-fullscreen` stays `"true"`. The stage's
   hint line therefore names `F` and omits `ESC`, exactly as the fullscreen mockup draws it. The
   mockup's own `keydown` script exits on `Escape` (`petri-dish-play-mode-fullscreen.html:388-392`)
   — a conflict with the spec, flagged below; the spec wins (`epics.md:982`, spec §4) unless the
   owner says otherwise in review.

7. **The chassis bar shows the hints, left; display only.** `<SimulationControlBar>` renders the
   hint line as its FIRST child and `<TransportControls>` as its second; `Bar` flips to
   `justifyContent: 'space-between'` (its own comment's promise). Content, from the mockup:
   `Shortcuts: <kbd>Space</kbd> Play/Pause • <kbd>→</kbd> Next • <kbd>Esc</kbd> Stop` — DOM text
   in sentence case, CSS `text-transform: uppercase` (3.12 trap 13/14; `SPACE` / `ESC` on screen
   as the epic AC spells them). Styles are the mockup's `.keyboard-hint` (`:518-530`): `10px`,
   `--gol-text-secondary`, `letter-spacing: 0.5px`; each `<kbd>` `--gol-text-primary`, `600`,
   `margin: 0 3px`, `font-family: inherit`. The `→` glyph is `aria-hidden` with a
   `<VisuallyHidden>Right arrow</VisuallyHidden>` sibling inside the `<kbd>` (trap 14). The hint
   region is `minWidth: 0; flex: 1` so it WRAPS rather than pushing the transport off the bar at
   1024 wide (trap 16); the transport keeps `flexShrink: 0`. The bar stays presentational: no
   hook, no handler, no `sim` — `SimulationControlBar.test.tsx`'s tab-order test (`body → Play →
   Next cycle → Stop & reset → body`) passes unchanged because nothing in the hint is focusable.

8. **The stage shows its own hint line.** `<FullscreenStage>` renders, while `active`, the
   mockup's `.fs-hint` (`:260-278`): `Press <kbd>F</kbd> to exit fullscreen • <kbd>Space</kbd>
   Play/Pause • <kbd>→</kbd> Next` — `position: fixed; bottom: 14px`, centred (a full-width row
   with `justifyContent: center`, the `HudRow` idiom — no `transform`), `9px`,
   `--gol-text-tertiary`, uppercase, `letter-spacing: 0.5px`; `<kbd>`s `--gol-text-secondary`,
   `600`, `margin: 0 2px`; `pointer-events: none` (it floats over the stage's `--gol-bg-primary`
   margin below the dish — at every supported viewport the dish's bottom edge is ≥ 62px up, the
   hint occupies 14–25px — so the gated `text-tertiary` / `bg-primary` pair is the rendered one).
   Rendered AFTER the HUD in the fragment (a fourth `{active && …}` slot — `children` stays at
   slot 1, trap 8). Absent while `active` is false. Both hint lines are ONE component (FD6),
   `simulation/HotkeyHints.tsx`, styled by its host.

9. **The real dialog suspends the hotkeys.** From Run mode with a dirty battle (3.11/2.16 AC9:
   the Run sidebar's Back reaches the FR-7.9 guard), Back opens `<UnsavedChangesDialog>`:
   - `Escape` closes the dialog (Cancel — `BattlePage.test.tsx:2473-2486` pins it) and the
     simulation is UNTOUCHED: `data-status` and `data-cycle` are what they were before Back.
   - `Space` and `ArrowRight` while the dialog is open change neither.
   - After Cancel, focus is back on Back (the guard's restore) and — Back being a `button` — a
     following `Space` re-opens the dialog natively rather than toggling playback (AC3 (vi)).

10. **Nothing per cycle, nothing on first load.** No effect in the view or the hook keys on
    `cycle` / `population` / `status` for the listener; `handlePlayPause`'s deps stay
    `[status, play, pause]`; the hook holds no React state. `<BattlePage>` changes by ONE prop
    line (`onEnterFullscreen={handleEnterFullscreen}` — the callback already exists) and imports
    nothing new: the hook and `<HotkeyHints>` ride in the lazy Run chunk with the view (trap 12).
    `npm run bundle:check` green on all four routes; report `/battle`'s number (0.8 KB headroom at
    3.18's close). If it goes red, the mechanism changes (`deferred-work.md:888`'s
    `PetriDishCanvas` split), never the threshold.

11. **Accessibility.** axe clean: the bar with hints (paused and playing), the stage with its
    hint, the whole Run view in both layouts. No `aria-label` on a `<kbd>` (generic role — name
    prohibited, the same axe rule `<TransportControls>`' `role="group"` exists for). No
    `aria-keyshortcuts` on the shared `<TransportControls>` (FD8 (a): 4.15's preview renders the
    same cluster with no hotkeys behind it).

12. **e2e — one new `test.describe('Simulation hotkeys (Story 3.19)')` in
    `apps/web/e2e/battleRoute.spec.ts`**, after the 3.18 block, reusing its `view` / `cycle` /
    `enterRun` shape and the file's `runButton` / `dish` / `speedSlider` / `fullscreenButton` /
    `exitFullscreenButton` locators. ⚠️ After `runButton(page).click()` focus is ON the Mode
    toggle, and Space would flip it back to Lab natively (AC3 (vi)) — every test that presses
    Space first parks focus on `<body>` (`await dish(page).click()` — the canvas is not focusable,
    so the click blurs; or `page.evaluate(() => (document.activeElement as HTMLElement).blur())`)
    (trap 19):
    - (a) AC2/AC3: `Space` → `data-status="playing"` and `data-cycle` advancing; `Space` → paused,
      cycle held; `ArrowRight` ×3 → cycle +3; `ArrowRight` while playing → the cycle keeps its
      own pace (assert no throw via `collectErrors`); `Escape` → paused at 0. The chassis hint
      visible with its three `<kbd>`s.
    - (b) AC5/AC6: `f` → the stage (`data-fullscreen="true"`, Exit focused, the dish larger — the
      3.18 (a) box assertion), simulation still playing; `Escape` in the stage → paused at 0 and
      STILL fullscreen; `f` → chassis, `fullscreenButton` focused, `data-fullscreen="false"`; the
      stage's hint visible while up, gone after.
    - (c) AC3 (iv): focus `speedSlider`, `ArrowRight` → the slider moves one detent (the 3.13 e2e
      assertion) and `data-cycle` stays 0.
    - (d) AC4: in Lab (`data-mode="lab"`), `Space` / `ArrowRight` / `Escape` / `f` → `data-mode`
      still `lab`, `data-dirty` unchanged, no `[data-fullscreen="true"]` anywhere.
    - (e) AC9: paint a cell in Lab, Run, `Space` to play, sidebar Back → dialog; `Escape` → dialog
      gone, `data-status` still `playing`; then axe (`AxeBuilder`, the file's idiom).

13. **Comments and docs say what is true now.** `SimulationControlBar.tsx` (head + `Bar`
    comment: the hints half shipped; `space-between`), `FullscreenStage.tsx` (the "NOT rendered,
    by story" paragraph → the `.fs-hint` ships, the `keydown` script is the hook's; `onExit`'s doc
    mentions `F`), `BattleSimulationView.tsx` (the "Deliberately ABSENT" line → the hook is here;
    the props doc for `onEnterFullscreen`), `TransportControls.tsx` (the "3.19's hotkey hints name
    one set of verbs" sentence → what shipped, FD11), `BattlePage.tsx` (the `fullscreen`
    paragraph: `F` reaches the cell through the view's two callbacks), `simulation/README.md` (the
    hook lives in `lib/battle/`, FD1 — its "plus `useSimulationHotkeys`" line is corrected, and
    `<HotkeyHints>` is named beside the other shared Run pieces), `deferred-work.md` (the items
    addressed to 3.19 — see "Candidates to record"), `sprint-status.yaml` (this story's line
    only).

## Tasks / Subtasks

- [x] **Task 1 — the hook** (AC1, AC2, AC3, AC4)
  - [x] 1.1 `apps/web/lib/battle/useSimulationHotkeys.ts`: `SimulationHotkeyBindings` (FD2), the
        latest-ref assigned in a deps-less effect DECLARED BEFORE the listener effect (the
        `PetriDishCanvas.tsx:826-843` idiom, trap 2), the `[]`-deps listener effect on `window`
        with cleanup, the check order of AC3 as a pure `shouldIgnore(event)` / `isSpaceActivator(
        target)` pair exported for tests. Head comment: why `window` (the canvas is not focusable
        and focus is usually loose in Run mode), why a latest-ref (10 Hz churn), why FD3 (a), why
        the `[role="dialog"]` query (FD10), citing spec §4, NFR-4.1, AR-29.
  - [x] 1.2 `useSimulationHotkeys.test.tsx` (`renderHook` + `fireEvent.keyDown` on `document.body`
        / on a rendered `<input>` / `<button>` / `<div role="dialog">`): each key → its binding
        once; `ArrowRight` with `canStep: false` → nothing; `preventDefault` observed via the
        `dispatchEvent` return value (`false` when prevented) for handled keys and NOT for ignored
        ones; each AC3 rule (i)–(vi) as its own case; bindings swapped between renders are honoured
        WITHOUT a second `addEventListener` (spy count stays 1); unmount → `removeEventListener`
        once; a `KeyboardEvent` with `key: 'Spacebar'` is NOT Space (legacy IE value — the test
        documents the modern `' '`).

- [x] **Task 2 — wire the view** (AC1, AC2, AC5, AC6, AC10)
  - [x] 2.1 `BattleSimulationView.tsx`: new prop `onEnterFullscreen(): void` (doc it beside
        `onExitFullscreen`); `const toggleFullscreen = fullscreen ? onExitFullscreen :
        onEnterFullscreen` (a plain expression, both props stable — no `useCallback`); the hook
        call with `{ onPlayPause: handlePlayPause, onStep: sim.step, onStop: sim.stop,
        onToggleFullscreen: toggleFullscreen, canStep: sim.status === 'paused' }` — the SAME
        handlers the two transport homes get, nothing new derived. Rewrite the head comment's
        "Deliberately ABSENT" line and add the 3.19 paragraph (the hook is the view's because the
        view is the only holder of `sim` — spec §3.11; the fullscreen toggle is composed from the
        page's two callbacks — FD5).
  - [x] 2.2 `BattleSimulationView.test.tsx` (the file's `view()` / `installFrameDriver()` /
        `installContexts()` helpers; `view()`'s default props gain `onEnterFullscreen: vi.fn()`):
        Space → `data-status="playing"`; Space → paused; ArrowRight ×2 → `data-cycle="2"`;
        ArrowRight while playing → no throw, cycle unchanged until the next driven frame; Escape →
        paused at 0 with `drawFull` of the initial grid; `f` → `onEnterFullscreen` called once
        (chassis) / `onExitFullscreen` called once (`fullscreen: true`); the three 3.18 tripwires
        (same canvas node, one construction, no `drawFull`) repeated across an `F`-driven rerender
        with `fullscreen` flipped by the test; keydown from inside a rendered `<div
        role="dialog">` sibling → nothing; `<StrictMode>` → still one listener; unmount → listener
        gone.

- [x] **Task 3 — the page** (AC4, AC5, AC9, AC10)
  - [x] 3.1 `BattlePage.tsx`: `onEnterFullscreen={handleEnterFullscreen}` on the view (one line,
        with a one-line comment: the key's entry — same callback as the header's button). Update
        the `fullscreen` paragraph (`:174-186`).
  - [x] 3.2 `BattlePage.modeToggle.test.tsx`: the mocked-view prop assertions at `:135-136` and
        `:236-237` gain `expect(typeof run.onEnterFullscreen).toBe('function')`; a case where the
        mocked view calls `onEnterFullscreen()` then `onExitFullscreen()` and the header unmounts
        / remounts with focus restored — the existing `:264-330` shape.
  - [x] 3.3 `BattlePage.test.tsx` (real views, `seeded()` repositories): the `F` round trip through
        `user.keyboard('f')` — header gone, Exit focused, `f` again → Fullscreen button focused;
        Lab: `addEventListener` spy sees no `keydown` registration and the four keys leave
        `data-mode` / `data-dirty` unchanged; Run + dirty + Back → dialog → `{Escape}` → dialog
        gone, `[data-status]` unchanged (drive one `Space` first so the status is `playing`, with
        the frame driver, so "unchanged" is a real assertion).

- [x] **Task 4 — the hints** (AC7, AC8, AC11)
  - [x] 4.1 `simulation/HotkeyHints.tsx`: `HotkeyHintsProps { readonly lead?: string; readonly
        entries: readonly { readonly key: string; readonly label: string; readonly arrow?: boolean
        }[] }` → `<span>` with `lead` then `entries` joined by ` • ` (the separator `aria-hidden`
        — a bullet read aloud between every pair is noise), each key a `<kbd>`; `arrow: true`
        renders `<span aria-hidden="true">→</span><VisuallyHidden>Right arrow</VisuallyHidden>`.
        Unstyled beyond `kbd { font-family: inherit; font-weight: 600 }` — the host colours and
        sizes it (the `<CycleDigits>` shape). `HotkeyHints.test.tsx`: text, kbd count, the hidden
        arrow text, nothing focusable, axe.
  - [x] 4.2 `SimulationControlBar.tsx`: `HintLine = styled('div')` with the mockup's
        `.keyboard-hint` values + `minWidth: 0; flex: 1`, `& kbd { color: var(--gol-text-primary);
        margin: 0 3px }`; `Bar` → `space-between`; the head comment rewritten.
        `SimulationControlBar.test.tsx`: hint text present in both statuses, three `<kbd>`, tab
        order unchanged, axe unchanged.
  - [x] 4.3 `FullscreenStage.tsx`: `HintRow = styled('div')` (`position: fixed; bottom: 14px; left:
        0; right: 0; display: flex; justifyContent: center; pointerEvents: none`) wrapping a
        `HintText` with the `.fs-hint` values (`9px`, `--gol-text-tertiary`, uppercase, `0.5px`; `&
        kbd { color: var(--gol-text-secondary); margin: 0 2px }`), rendered as the FOURTH fragment
        slot while `active`. File comment: the "NOT rendered, by story" paragraph → what ships.
        `FullscreenStage.test.tsx`: hint present when active with `F` / `Space` / `→`, absent
        otherwise, axe.

- [x] **Task 5 — e2e** (AC12): the five tests above in `battleRoute.spec.ts`; run the new block
      and the whole 3.11–3.19 range on `--project=chromium --workers=1` first (the 3.18 record's
      private-port trick if a dev server is already up: `PORT = 4199` in `playwright.config.ts`,
      REVERTED before commit).

- [x] **Task 6 — docs** (AC13): the comment rewrites listed in AC13; `simulation/README.md`;
      `deferred-work.md` — see "Candidates to record"; `sprint-status.yaml` → `review` when done.

- [x] **Task 7 — gates**: `npm run ci:dev > /tmp/ci-3-19.log 2>&1; echo $?` (never piped to
      `tail` — project-context). Record exit code, unit counts, `bundle:check`'s four numbers,
      `bench:check`'s headroom (no engine change — say so), the Chromium e2e count. The
      four-browser matrix is CI's job on the pushed branch.

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation, via three parallel adversarial layers
(Blind Hunter, Edge Case Hunter, Acceptance Auditor); 12 findings dismissed as noise at triage.

- [ ] [Review][Decision] **FD4 — `Escape` while the fullscreen stage is up: Stop (shipped) or Exit?**
      — The implementation follows `epics.md:982` / spec §4 (`ESC` → Stop, `F` → toggle fullscreen):
      in the stage, `Escape` stops the run at cycle 0 and `data-fullscreen` stays `"true"` (AC6,
      e2e (b)); the stage hint names `F` only. The fullscreen mockup's own `keydown` script
      (`petri-dish-play-mode-fullscreen.html:388-392`) exits on `Escape` too. Options: **(a) keep
      as shipped** — one meaning per key in both layouts, the hints stay true, no code change;
      **(b) `Escape` exits the stage** (stops only in the chassis) — one branch on `fullscreen` in
      the view's `onStop` binding, the stage hint gains `ESC Exit`, AC6 / e2e (b) / the view test
      flip; **(c) `Escape` stops AND exits** — same one-branch change, hint reads `ESC Stop & exit`.
      Owner's call; `deferred-work.md`'s 3.19 section carries the FD4 (b) entry.
      **Owner's decision (2026-09-18): (c)** — `Escape` in the fullscreen stage **stops the run AND
      exits the stage**; in the chassis it keeps stopping only. Stage hint reads `ESC Stop & exit`;
      flip AC6 / e2e (b) / the view test accordingly and drop the now-settled FD4 (b) entry from
      `deferred-work.md`.
- [x] [Review][Patch] `onExit` prop has no doc comment, so AC13's "mentions `F`" never landed
      [`apps/web/components/battle/simulation/FullscreenStage.tsx:69`]
- [x] [Review][Patch] Hook head comment omits the NFR-4.1 citation Task 1.1 requires and FD3 (a)'s
      recorded consequence ("`SPACE Play/Pause` is true whenever focus is loose or on a
      non-activating element — after a click on the dish, after `Escape` from the dialog Space
      re-opens it, after a Gallery Run entry") [`apps/web/lib/battle/useSimulationHotkeys.ts:5-12`]
- [x] [Review][Patch] No accessible whitespace between hint entries — the only spaces live inside
      the `aria-hidden` separator, so a screen reader can run `Play/Pause` into `Right arrow`; move
      the spaces outside the hidden span (visually identical)
      [`apps/web/components/battle/simulation/HotkeyHints.tsx:56`]
- [x] [Review][Patch] `handleKeyDown` runs `shouldIgnoreHotkey`'s `document.querySelector` for
      every key typed in Run mode before checking the key is one of the four, and
      `event.key.toLowerCase()` throws on a `keydown` dispatched as a plain `Event` (no `key`);
      filter on the key set first [`apps/web/lib/battle/useSimulationHotkeys.ts:121-146`]
- [x] [Review][Patch] `queryByText('to exit fullscreen')` can never match (RTL's default matcher
      joins an element's OWN text nodes: `Press to exit fullscreen Play/Pause Next`), so the
      "no hint while inactive" test is carried by the `kbd` count alone; the active test's title
      names `F`, `Space`, `→` and asserts none of them; FD4 (a)'s "ESC deliberately absent" is
      unpinned [`apps/web/components/battle/simulation/FullscreenStage.test.tsx:241-256`]
- [x] [Review][Patch] "DOM text is sentence case" test asserts against its own fixture (the
      component echoes `entry.key` verbatim) — cannot fail; the bar's twin reads the real
      constant, so this one is padding [`apps/web/components/battle/simulation/HotkeyHints.test.tsx:23-31`]
- [x] [Review][Patch] Pure-function tests append `<input>` / `<div role="dialog">` / `<button>` to
      `<body>` with no `try/finally` — one failing assertion leaves a `role="dialog"` behind and
      silently suspends every later hook test; `isSpaceActivator` test title promises seven roles
      and asserts three; "AC1 shape check" asserts nothing it names (no before-mount, no removal)
      [`apps/web/lib/battle/useSimulationHotkeys.test.tsx:73-125,128-146,328-341`]
- [x] [Review][Patch] AC9 page test presses `Escape` once (trap 6 prescribes TWICE — the second a
      beat after Cancel, while MUI's Paper is still mounted), AC9 (ii) `Space`/`ArrowRight` while
      the dialog is open and (iii) a following `Space` on the restored Back re-opening it natively
      are untested, the `data-cycle` "unchanged" assertion is trivially true under the frame
      driver, and the `F` round trip skips trap 21's `expect(document.body).toHaveFocus()`
      [`apps/web/components/battle/BattlePage.test.tsx`]
- [x] [Review][Patch] `expect(() => fireEvent.keyDown(...)).not.toThrow()` is not the trap-1
      tripwire it reads as — jsdom routes a listener throw to the virtual console, never to the
      caller; the run fails through Vitest's unhandled-error channel instead (verified by
      mutation: removing the `canStep` gate → "Errors 1 error", exit non-zero). Say so
      [`apps/web/components/battle/simulation/BattleSimulationView.test.tsx:1324`]
- [x] [Review][Patch] e2e (e) runs axe after the dialog has closed; the story's testing standards
      name "the page with the dialog open in Run mode (the 2.16 idiom)" — add the open-dialog axe
      pass [`apps/web/e2e/battleRoute.spec.ts` (Story 3.19 block, test (e))]
- [x] [Review][Patch] Comment says the hints live "in each bar's own file" — they live in
      `HotkeyHints.tsx`; each bar only styles its copy
      [`apps/web/components/battle/simulation/TransportControls.tsx:18`]
- [x] [Review][Patch] Mid-sentence line break left by the edit ("…is the hook's alone — this
      component\n * gains no state…") [`apps/web/components/battle/simulation/BattleSimulationView.tsx:46-47`]
- [x] [Review][Patch] Dev Agent Record says `BattleSimulationView.test.tsx (+8)` — the diff adds 7;
      trap 16's 1024-wide check was neither run nor recorded (now measured — see the record)
      [`docs/implementation-artifacts/3-19-simulation-hotkeys.md` Dev Agent Record]
- [x] [Review][Defer] Presence-based dialog detection (FD10 (a)) makes all four keys silently
      dead while ANY `[role="dialog"]` / `[aria-modal="true"]` element persists (a `keepMounted`
      MUI Dialog, a hidden panel, an extension-injected node) and leaves the recorded chunk-fetch
      window open; FD10 (b)'s `enabled: !leaveConfirming` binding would close the window — the
      reviewer judges it not worth a new view prop today
      [`apps/web/lib/battle/useSimulationHotkeys.ts:60,91`] — deferred, recorded
- [x] [Review][Defer] The two selector lists omit `[role="radio"]` (Space selects a focused radio)
      and the arrow-consuming widgets (`tab`/`tablist`/`radiogroup`/`spinbutton`/`tree`/`grid`);
      no such control exists on the route today [`apps/web/lib/battle/useSimulationHotkeys.ts:25-53`]
      — deferred, 6.11 candidate
- [x] [Review][Defer] The latest-bindings ref is refreshed in a passive `useEffect` (the
      PetriDishCanvas idiom the story prescribed); a keydown landing between a rAF-driven commit
      (extinction auto-pause) and its passive flush reads a stale `canStep` / `handlePlayPause` —
      harmless direction today (`pause()` on a paused run), `useLayoutEffect` is the tighter form
      [`apps/web/lib/battle/useSimulationHotkeys.ts:115-118`] — deferred, theoretical
- [x] [Review][Defer] `installFrameDriver` is now duplicated between `BattlePage.test.tsx` and
      `BattleSimulationView.test.tsx` [`apps/web/components/battle/BattlePage.test.tsx`] — deferred,
      pre-existing helper; `@gol/test-utils` candidate
- [x] [Review][Defer] The Gallery `runLink` (`?mode=run`) Run entry — the one path where the hints
      are true from the first frame — is not in the hotkeys e2e block (trap 17 "should")
      [`apps/web/e2e/battleRoute.spec.ts`] — deferred, test-depth

## Dev Notes

### Constraints the developer MUST follow

- **The hook is the ONLY key handler on the route.** No `onKeyDown` on the bar, the stage, the
  view root or the canvas; no second listener for `F` in `<BattlePage>`. One listener, one check
  order, one place to read (spec §3.13 "handling lives in the hook").
- **The view stays the only holder of `sim`** (spec §3.11). The hook receives CALLBACKS and a
  boolean; it never sees `sim`, `status` as a string it interprets, or the loop. `<BattlePage>`
  never sees a sim handler.
- **No React state in the hook; no per-render re-subscription.** Latest-ref assigned in an
  effect (`react-hooks/refs` rejects a ref write during render — a lint ERROR, trap 2); the
  listener effect has `[]` deps.
- **`sim.step()` is never called while playing** (trap 1). `canStep` is the view's
  `sim.status === 'paused'`, the same boolean the Next cycle button's `disabled` is derived from.
- **Native activation is never doubled** (FD3 (a)). A control that consumes the key keeps it.
- **Tokens only** (AR-46 lint): the hint colours are `--gol-text-secondary` / `--gol-text-primary`
  (bar) and `--gol-text-tertiary` / `--gol-text-secondary` (stage) — all four exist and are
  gated in `themeTokens.test.ts`. **No new token; `themes.css` is untouched** (it is a shared-lane
  file — 3.18's record).
- **No `transition`, no animation** on the hints (the route's mid-fade axe trap).
- **The canvas / renderer / loop are untouched.** `F` reaches the SAME `fullscreen` cell the
  button does; the layout swap is 3.18's and this story adds no effect keyed on `fullscreen`.
- **`components/battle/simulation/` may not import from `editor/`**, and the hook in `lib/battle/`
  imports no component. `<VisuallyHidden>` comes from `@/components/VisuallyHidden`.
- **Nothing new in `/battle`'s first-load payload** beyond the one prop line (trap 12).
- **Every non-obvious constraint carries a WHY comment citing its ID** (project-context); no
  review artefacts in code.

### What this story is, in one paragraph

Four keys, one listener, two hint lines. `useSimulationHotkeys` is a `useDirtyGuard`-shaped
window listener hook that `<BattleSimulationView>` mounts with the same three transport handlers
it already hands to `<TransportControls>`, plus a fullscreen toggle composed from `<BattlePage>`'s
two existing callbacks and a `canStep` boolean. Its whole difficulty is in what it must NOT do:
fire twice when a button already has focus (Space activates buttons natively), steal arrow keys
from the two sliders, act inside or just after a dialog, act on `⌘F`, act on key repeat, or call
`step()` into the hook's own throw while playing. The hints are presentational `<kbd>` runs in
the bar's empty left half and the stage's bottom margin, styled per mockup, landing together with
the handlers because NFR-4.1 forbids a hint with nothing behind it — which is why 3.12 and 3.18
each left their half for this story.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — where the hook lives.**
- **(a) [default] `apps/web/lib/battle/useSimulationHotkeys.ts`**, beside `useSimulation`,
  `useDirtyGuard`, `useLeaveGuard`, `useUndoableGrid`, `useBattleDraft` — every battle hook is
  there, and `simulation/README.md` itself says "`useSimulation` is a hook, so it goes to
  `lib/battle/`". The README's "What goes here" list ALSO names `useSimulationHotkeys` (copied
  from spec §2's tree, which draws the hook under the view) — correct that line in Task 6.
- (b) `components/battle/simulation/useSimulationHotkeys.ts`, as the README's list reads today.
  Rejected: a hook among components is the asymmetry the README argues against one paragraph
  later, and `lib/battle/` is where `useDirtyGuard`'s listener idiom lives.

**FD2 — the bindings shape (spec §4 says only `useSimulationHotkeys(bindings)`).**
- **(a) [default]**
  ```ts
  export interface SimulationHotkeyBindings {
    readonly onPlayPause: () => void;       // Space   (FR-4.1)
    readonly onStep: () => void;            // ArrowRight, only while canStep (FR-4.3)
    readonly onStop: () => void;            // Escape  (FR-4.4)
    readonly onToggleFullscreen: () => void; // f / F  (spec §3.14 "Exit Fullscreen / F key")
    readonly canStep: boolean;              // the view's `status === 'paused'`
  }
  export function useSimulationHotkeys(bindings: SimulationHotkeyBindings): void;
  ```
  The three transport names are `SimulationControlBarProps`' names, so the view passes the SAME
  values to the hook and to both transport homes — one derivation of "what Play/Pause means"
  (3.12 FD3). `canStep` is a boolean rather than a `status` string so the hook interprets nothing
  and its test needs no `SimulationStatus` import.
- (b) `{ status, play, pause, step, stop, toggleFullscreen }` — the hook decides play-vs-pause.
  Rejected: a second copy of `handlePlayPause`'s derivation (3.12 FD3 rejected exactly this for
  the bar).
- (c) An `enabled: boolean` member for the dialog case instead of FD10's DOM check. See FD10.

**FD3 — Space when a control that natively activates on Space has focus.**
- **(a) [default] Defer to the browser.** If the target is a `button` / `a[href]` / `summary` /
  `[role="button"|"link"|"checkbox"|"switch"|"tab"|"menuitemcheckbox"|"menuitemradio"]`, the hook
  ignores Space entirely — the focused control activates, once. Space on Play/Pause toggles (same
  outcome as the hotkey), on Stop stops, on Back leaves, on Exit fullscreen exits, on the Mode
  toggle switches mode. Reasons: (1) no double fire —
  `SimulationControlBar.test.tsx:158-168` pins one call per Space; (2) WAI-ARIA's button pattern
  is that Space activates the focused button, and a screen-reader user hearing "Stop & reset,
  button" and pressing Space expects Stop; (3) the epic AC's own "suspended while … an input has
  focus" is this rule's spirit applied to every key-consuming control.
- (b) Always handle Space and `preventDefault()` on `keydown` to suppress the activation. Rejected:
  (1) the button's `click` on Space fires on `keyup` and whether a `keydown` `preventDefault`
  cancels it is engine-specific; (2) a focused Stop that toggles playback instead of stopping is a
  control that lies about itself; (3) the pinned test above would need a hook-aware rewrite.
- Consequence to record: the hint's `SPACE Play/Pause` is true whenever focus is loose or on a
  non-activating element — after a pointer click on the dish, after `Escape` from the dialog
  (focus on Back → Space re-opens it), after a Gallery Run entry. Say so in the hook's head
  comment; it is the reviewer's first question.

**FD4 — `Escape` while the stage is up.**
- **(a) [default] `Escape` stops; `F` is the only exit key** — `epics.md:982` ("ESC stops, F
  toggles fullscreen"), spec §4, spec §3.14 (`onExit … / F key`), and the fullscreen mockup's
  hint line (`Press F to exit fullscreen` — no ESC named). The chassis hint names `ESC Stop`; a
  key that meant Stop in one layout and Exit in the other would make one of the two hints false.
  `deferred-work.md:1672` already records the collision with the browser's own fullscreen exit key
  as a known property (no Fullscreen API is used — 3.18 FD3 (a) — so the browser never sees this
  `Escape` as fullscreen-related).
- (b) `Escape` exits the stage, per the mockup's `keydown` script (`:388-392`), and stops only in
  the chassis. **Owner's call if wanted** — flagged in "Spec-conflict flags"; the implementation
  difference is one branch on `fullscreen` in the view's `onStop` binding, so switching later is
  cheap.

**FD5 — how the view gets the toggle.**
- **(a) [default] A new `onEnterFullscreen(): void` prop on `<BattleSimulationView>`**, the twin
  of the existing `onExitFullscreen`; the view composes `fullscreen ? onExitFullscreen :
  onEnterFullscreen`. `<BattlePage>` passes `handleEnterFullscreen` — the callback the header
  already gets — so the page keeps exactly two writers of the cell and its exit path keeps setting
  the focus-restore flag (`BattlePage.tsx:196-199`). Amendment candidate for spec §3.11's props
  (the 3.18 list gains one member).
- (b) One `onToggleFullscreen` prop from the page (`fullscreen ? handleExitFullscreen() :
  handleEnterFullscreen()`, keyed on `fullscreen`). Rejected: a third page-level fullscreen
  callback whose identity changes per toggle, for no gain — the view already holds both halves'
  worth of information.

**FD6 — one hint component or two inline runs.**
- **(a) [default] `simulation/HotkeyHints.tsx`**, shared by the bar and the stage: the `<kbd>` +
  aria-hidden arrow + `<VisuallyHidden>` recipe exists once; hosts wrap it in their own styled
  block for size and colour (the `<CycleDigits>` shape — 20px in the HUD, 32px in the sidebar).
  Named in `simulation/README.md` beside `<TransportControls>` / `<CycleDigits>` /
  `<PopulationPills>`.
- (b) Inline markup in each host. Rejected: two copies of the arrow recipe is the drift the
  README warns about, and 3.18 just promoted `<VisuallyHidden>` for the same reason.

**FD7 — `event.repeat`.**
- **(a) [default] Ignore repeats for all four keys.** A held Space would toggle at the OS repeat
  rate (~30 Hz), a held `F` would ping-pong the stage (each swap a `renderer.resize` — the 3.18
  review's held-`Enter` entry, which this guard closes for `F`), a held `Escape` would re-mint
  seeds. A held `→` would auto-step — plausible as a scrub, but each step is a full cycle + publish
  + repaint at repeat rate on a 200×120 grid with no budget behind it (Decision A.4: larger
  presets are measured, never gated).
- (b) Allow repeat for `ArrowRight` only. Record as a candidate if the owner wants a scrub.

**FD8 — `aria-keyshortcuts` on the transport buttons.**
- **(a) [default] None.** `<TransportControls>` is shared with the fullscreen HUD (fine — the hook
  is mounted there too) AND with Story 4.15's preview panel, where NO hook will be mounted (the
  preview is a modal — AC3 (v) suspends the battle's hook while it is open, and the preview's own
  view must not mount one). An `aria-keyshortcuts` baked into the cluster would advertise keys
  the preview does not have. The hint line is the disclosure.
- (b) An opt-in `keyshortcuts?: boolean` prop on `<TransportControls>`. Candidate for 6.11's
  keyboard sweep; not this story.

**FD9 — the 3.12 review's open question ("Story 3.19 decides" whether to move focus when a
hotkey disables the focused control, `deferred-work.md:1018-1023`).**
- **(a) [default] No focus management; close the item as resolved-by-construction.** Under FD3
  (a) the reachable cases collapse: Space on a focused Next cycle is a native step (Next stays
  enabled); Space on a focused Play is the native toggle (Play/Pause is never disabled); a pointer
  press moves focus to the pressed control. The one keyboard path that unmounts a focused control
  is `F` (the bar or the HUD leaves), and 3.18's two focus effects already land focus on Exit /
  the Fullscreen button. Say so in the `deferred-work.md` update.
- (b) Move focus to Play/Pause whenever the focused transport control becomes `disabled`.
  Rejected for this story: no reachable trigger remains.

**FD10 — how "a dialog is open" is detected (AC3 (v)).**
- **(a) [default] The DOM, at keydown time:** `document.querySelector('[role="dialog"],
  [aria-modal="true"]')` plus `target.closest(...)`. One query per keypress over a three-child
  `<body>`; no prop, no coupling to `useLeaveGuard`, and it holds for ANY future modal over the
  page — Story 4.24/4.25's `<OrganismEditorModal>` (a MUI `Dialog`, `role="dialog"`) is suspended
  without touching this hook, which is what `lane-gates.yaml`'s 4.24 row ("3.19's 'hotkeys
  suspended while a dialog is open' is what 4.24 must not break") needs to be true by construction.
  MUI keeps the `role="dialog"` Paper mounted through the exit transition and `useLeaveGuard`
  restores focus to Back only as the dialog closes, so the "second Escape" a beat after Cancel is
  still suspended (trap 6). Known window, accepted as 3.18 accepted its own: on the FIRST Back of
  a page session the dialog is a `next/dynamic` chunk — between the click and the chunk resolving
  there is no `[role="dialog"]` yet, so a key in that window acts. Record it.
- (b) An `enabled: boolean` binding fed by `<BattlePage>` (`!leaveConfirming`) through a new
  view prop. Rejected alone: 4.24's modal would need its own plumbing to the hook; (a) needs
  none. Acceptable IN ADDITION if the reviewer wants the chunk window closed — say so rather than
  adding it silently.

**FD11 — the hint labels.**
- **(a) [default] The mockups' words:** `Play/Pause`, `Next`, `Stop` (chassis) and `to exit
  fullscreen`, `Play/Pause`, `Next` (stage). The hint is not an accessible name and the mockup is
  its authority; `Next` / `Stop` are prefixes of the buttons' `Next cycle` / `Stop & reset`, not
  different verbs. Rewrite `TransportControls.tsx:16-18`'s "3.19's hotkey hints name one set of
  verbs" to what shipped.
- (b) The buttons' full names. Rejected: the chassis line grows ≈ 40% and wraps sooner at 1024
  wide (trap 16) for no accessibility gain.

### Traps

1. **`sim.step()` throws while playing** (`useSimulation.ts:491`, 3.10's "never a silent no-op").
   `canStep` gates the call; the hook never `try`s. A test that presses `ArrowRight` while playing
   and asserts "no throw, cycle unchanged until the next frame" is the tripwire. `stop()` is total
   (3.12 FD5) and `play()` while playing is a no-op render-wise (`useSimulation.ts:474-476`), so
   Space and Escape need no gate.
2. **`react-hooks/refs` is a lint ERROR** on any ref read or write during render inside a `use*`
   function (`useSimulation.ts:337`, `PetriDishCanvas.tsx:826-843`). The latest-bindings ref is
   assigned in a deps-less `useEffect` DECLARED BEFORE the listener effect (so the refresh commits
   before the listener could fire from the same commit); the listener reads `ref.current` inside
   the event callback — an event callback is not render. React 19.2's `useEffectEvent` is the
   sanctioned alternative if preferred (call it only from inside the listener registered in the
   effect); either way, no `ref.current = …` in the function body.
3. **The view re-renders at ≤ 10 Hz while playing** (`sim` is a new object per publish). A
   `useEffect(…, [bindings])` would tear down and re-add the listener ten times a second — the
   churn AR-29 / AC10 forbid. `[]` deps on the listener effect; the ref carries the bindings.
4. **Space double fire.** A focused `<button>` fires `click` on Space `keyup`; a window `keydown`
   handler that ALSO toggles makes Play/Pause a no-op (toggle twice) and Stop-then-toggle
   surprising. FD3 (a) — `isSpaceActivator(target)` — is the whole answer; keep it a pure
   function with its own tests so the selector list is reviewable.
5. **`ArrowRight` on the sliders.** Both `<LadderSlider>`s are native `<input type="range">`
   (`LadderSlider.tsx:79,199-201`); the arrow keys move them and the 3.13 / 3.16 e2e tests press
   `ArrowRight` on them (`battleRoute.spec.ts:2357`, `:2856`). Without AC3 (iv) every one of
   those tests would ALSO step the sim and their `data-cycle` assertions would fail. `input` in
   the editable list covers it; `[role="slider"]` covers an ARIA slider that may arrive later.
6. **`Escape` reaches MUI's Dialog AND `window`.** MUI closes on `Escape` via `onClose`
   (`BattlePage.test.tsx:2473-2486`, "MUI v9 removed `disableEscapeKeyDown`"), and does not stop
   propagation, so the same event reaches the hook — which must be suspended (AC3 (v)) or the
   dish resets under a Cancel. The Paper stays in the DOM through the fade, `useLeaveGuard`
   restores focus to Back as it closes, and `useInertBackground` keeps everything else inert while
   open, so the target-based and presence-based checks together cover open, closing and
   just-closed. A test presses `{Escape}` TWICE after opening the dialog from a playing Run and
   asserts `data-status="playing"` after both.
7. **`event.key` for the space bar is `' '`** — a single space — not `'Space'` (that is
   `event.code`, and Playwright's `press('Space')` name) and not `'Spacebar'` (legacy IE).
   `userEvent.keyboard(' ')` and `fireEvent.keyDown(el, { key: ' ' })` both produce `' '`. Match
   `key === ' '`; a `code === 'Space'` fallback is harmless but not required.
8. **The stage fragment has FIXED SLOTS** (`FullscreenStage.tsx:317-329` — "THE load-bearing
   line"; the HUD slot is `:327`). The hint is a FOURTH `{active && <HintRow/>}` slot AFTER the HUD; `children` stays at
   slot 1. Putting the hint before `children`, or wrapping `children`, remounts the canvas —
   `BattleSimulationView.test.tsx`'s "same canvas node / one construction / drawFull unchanged"
   tests are the tripwire (3.18 proved it by mutation: 3 fail, restore → green).
9. **`F` handled with focus on the Mode toggle.** After a pointer or keyboard toggle to Run, the
   `Run` button holds focus; `F` (not a native activator) enters the stage, the header unmounts,
   the stage's mount effect focuses Exit. Then `F` again: the HUD unmounts (focus → `<body>`), the
   header remounts, and `<BattlePage>`'s restore effect finds focus loose and moves it to the
   Fullscreen button — NOT back to the Mode toggle where it started. That is 3.18's AC7 behaviour
   and is correct here too; do not add a "return focus to where it was" ref.
10. **Escape has no default to prevent, `f` has none worth preventing** — but call
    `preventDefault()` on every handled key anyway, uniformly: the test for "ignored keys do not
    prevent" (AC3) is only meaningful if handled keys always do.
11. **`shiftKey` is not a modifier here** — `Shift+F` produces `key: 'F'`; a Caps-Lock user
    produces `'F'` without shift. `key.toLowerCase() === 'f'`. `event.code === 'KeyF'` would also
    fire on a non-Latin layout where the same physical key types another letter — the hint says
    `F`, so match what the user typed, not where the key is.
12. **`/battle`'s first-load headroom is 0.8 KB** (3.18's close). `<BattlePage>` is in the
    first-load payload; `<BattleSimulationView>` and everything it imports is the lazy Run chunk
    (`BattlePage.tsx:78`). The hook, `<HotkeyHints>` and both hint styles are imported ONLY by
    the view / bar / stage, never by the page. One prop line on the page costs tens of bytes. If
    `bundle:check` still goes red: `deferred-work.md:888` names the mechanism (split
    `PetriDishCanvas`'s variants), and Sidiar's rule is mechanism-not-threshold.
13. **`BattlePage.modeToggle.test.tsx` asserts the view's prop set** (`:135-136`, `:236-237`,
    and the mocked view at `:264-330`). A new REQUIRED prop on `BattleSimulationViewProps`
    type-checks the mock's captured props only if those assertions are extended; do it in the same
    commit.
14. **No `aria-label` on `<kbd>`.** `<kbd>` has the `generic` role, and an author-assigned name on
    a generic is prohibited (the rule `<TransportControls>`' `role="group"` and `<EditorStatusBar>`'s
    `<StatItem>` both work around). The arrow's spoken name is a `<VisuallyHidden>` sibling of an
    `aria-hidden` glyph — the 3.17 FD4 / 3.18 skull idiom (`populationGlyphs.tsx`).
15. **DOM text is sentence case; CSS uppercases** (3.12 trap 13/14, `<SidebarFooter>` trap 15).
    `Space` / `Esc` / `F` in the DOM render as `SPACE` / `ESC` / `F`; tests query `getByText(
    'Space')`, not `'SPACE'`.
16. **The chassis bar can overflow at NFR-3.1's 1024 floor.** Sidebar 320 + main padding leaves
    ≈ 654px for the bar's content at 1024 wide; the uppercase hint (~315px) + the transport
    (~410px) + gap exceed it. `HintLine` gets `minWidth: 0; flex: 1` so it wraps to two 10px lines
    inside the bar's `12px` padding; `<Transport>` already has `flexShrink: 0`. Neither Playwright
    project is below 1194 wide (project-context: the four projects run at 1280×720 and 1194×834),
    so check 1024 once by hand or with a one-off `page.setViewportSize` (the 2.12 precedent) —
    never a fifth project.
17. **The Gallery Run entry starts with focus on `<body>`** (`?mode=run`, Story 3.17) — the one
    path where the hints are true from the first frame without a click. Both e2e entries
    (`runButton.click()` and `runLink`) should appear in the block: the first parks focus (trap
    19), the second does not need to.
18. **`useInertBackground` makes the background `inert` while a dialog is open** — an inert
    subtree receives no focus and no key events, so the hook's `window` listener still fires (the
    event's target is inside the dialog) but never with a background target. Do not rely on
    `inert` for suspension (the fade-out window is not inert); rely on AC3 (v).
19. **e2e: after `runButton(page).click()` the Mode toggle has focus.** `page.keyboard.press(
    'Space')` would activate it natively (FD3 (a)) and flip the route back to Lab — the test then
    fails with `data-mode="lab"` and a confusing "no hotkeys" symptom. Park focus first:
    `await dish(page).click()` (a click on a non-focusable element moves focus to `<body>`), or
    `page.evaluate` a `blur()`. Write the helper once in the describe (`parkFocus(page)`) and say
    why.
20. **Playwright key names:** `'Space'`, `'ArrowRight'`, `'Escape'`, `'f'`; WebKit needs
    `'Alt+Tab'` for Tab only (`organisms.spec.ts:998`) — not relevant to these four but the file's
    convention if a Tab appears.
21. **`user.keyboard('f')` in RTL types into the focused element** — if a test left focus on an
    `<input>` (none in Run mode, but `BattlePage.test.tsx` Lab tests focus the name field), the
    key goes there. Assert `document.body` has focus (or `blur()`) before pressing in a
    page-level test.
22. **`vi.spyOn(window, 'addEventListener')` sees EVERY listener** React and MUI add. Filter the
    spy's calls by `type === 'keydown'` and, for AC1's "one listener", by the handler identity the
    hook registered (capture it from the first `keydown` call; assert `removeEventListener` was
    called with the same function).

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

1. **Fullscreen mockup script vs. spec on `Escape`.** `petri-dish-play-mode-fullscreen.html:388-392`
   exits fullscreen on `f` / `F` / `Escape`; `epics.md:982` and spec §4 assign `ESC` → stop and `F`
   → toggle fullscreen; the same mockup's hint line names only `F` as the exit key. FD4 (a) follows
   the spec. Owner's call in review if the mockup's behaviour is wanted.
2. **`simulation/README.md` places the hook in two folders.** Its "What goes here" list names
   `useSimulationHotkeys` (from spec §2's tree), while its `useSimulation` paragraph says hooks
   go to `lib/battle/`. FD1 (a) resolves it for `lib/battle/`; the README line is corrected.
3. **Spec §6 / §3.11 say the view owns `fullscreen`; 3.18 FD1 (a) put it in `<BattlePage>`**
   (recorded amendment candidate, `deferred-work.md:1622-1631`). This story keeps the 3.18
   arrangement and reaches the cell through the view's two callbacks (FD5) — no new conflict,
   one more prop for the §3.11 amendment list.
4. **`play-mode-proposal.md:356-366` lists seven shortcuts** (`Esc` = "Stop & Reset / Exit
   Fullscreen", `E` Edit mode, `P` Play mode, `1-6` speed presets). The component-tree spec (rev
   2) and `epics.md` carry FOUR; the proposal is a superseded working document (the mockup's own
   annotation calls its speed presets the "0.5×–3× era"). Out of scope; recorded under "What NOT to
   build".
5. **`epics.md:983` says "the control bar displays the SPACE / → / ESC hints"; the fullscreen
   mockup adds an `F` hint in the stage** (`:370`). Not a conflict — the stage is a second home for
   the same display-only line (AC8) — but the AC's literal reading covers the chassis only; the
   stage hint is the mockup's and 3.18's "belongs to 3.19" note's.

### What NOT to build

- ❌ No `E` / `P` mode keys, no `1–6` speed keys, no speed hotkeys of any kind (FD-none: spec §4's
  four keys; 3.18 FD6 already noted "3.19 adds no speed keys").
- ❌ No Fullscreen API (`requestFullscreen`) and no `fullscreenchange` mirror — 3.18 FD3 (a),
  `deferred-work.md:1669-1677`.
- ❌ No `aria-keyshortcuts` (FD8), no `<kbd>` inside the transport buttons, no tooltip on the hints.
- ❌ No hotkeys in Lab mode (undo is a button; `Ctrl+Z` is not this story) and none in 4.15's
  preview.
- ❌ No focus management beyond what 3.18 ships (FD9); no route-wide `event.repeat` guard on
  `Enter` (6.11's sweep — `deferred-work.md:1726-1732`); no Exit/Fullscreen double-click geometry
  fix (`deferred-work.md:1761-1777`, 6.11's).
- ❌ No new token, no `themes.css` edit, no `transition`, no `backdrop-filter`.
- ❌ No change to `<TransportControls>`, `useSimulation`, `PetriDishCanvas`, `gridRenderer`,
  `packages/**`, `check-bundle-size.mjs`, route files, or anything under `organisms/**`.
- ❌ No PRD edit: the "PRD touch recommended" in `epics.md:984` is the owner's, not the dev's.

### Candidates to record (`deferred-work.md`, Task 6)

- The 3.12 review's "Story 3.19 decides" focus question (`:1018-1023`) → closed per FD9 (a) with
  the reasoning; strike through in place, the file's convention.
- The 3.18 mockup-refresh candidate 4 (`:1664-1666`, the `.fs-hint` and `keydown` script) → shipped;
  strike through. The held-`Enter` entry (`:1726-1732`) → `F` guarded by `event.repeat` (FD7);
  `Enter` remains 6.11's. The double-click geometry entry (`:1761-1777`) → unchanged, 6.11's.
- New: the FD10 chunk-fetch window (first Back of a session, before the dialog chunk resolves) —
  accepted, the 3.18 shape. New: FD7 (b) (`ArrowRight` repeat as a scrub) and FD8 (b)
  (`aria-keyshortcuts` opt-in) as candidates for 6.11. New: FD4 (b) if the owner leaves it open.
- `component-tree-battle-page.md` amendment candidates: §3.11 props gain `onEnterFullscreen` (the
  3.18 list's item 1 grows by one); §4's `useSimulationHotkeys(bindings)` → the FD2 shape and the
  `lib/battle/` home; §2's tree may name `<HotkeyHints>` beside `<LadderSlider>`.
- Mockup-refresh: the chassis mockup's hint sits in a `.stats-left` that also carried the lab
  bar's stats (`:743-746`) — the Run bar has no stats; the hint is its whole left half.

### Testing standards summary

- **Unit (Vitest + RTL, jsdom):** the hook via `renderHook` with `fireEvent.keyDown` on chosen
  targets (`document.body`, a rendered `<input>`, `<button>`, `<div role="dialog">`); `preventDefault`
  observed as `dispatchEvent`'s boolean; spies on `window.addEventListener` /
  `removeEventListener` filtered to `keydown` (trap 22). The view via its own file's helpers — the
  frame driver drives the loop, `data-status` / `data-cycle` are the assertions (3.11 FD7), the
  three 3.18 tripwires are re-asserted through an `F`-driven flip. The page via `seeded()`
  repositories and `user.keyboard`. `<StrictMode>` once for the hook (effects run twice on mount;
  one listener must remain).
- **No test asserts pixels.** `drawFull` / `drawDiff` call counts through `installContexts()` are
  the renderer's observable (project-context: test the renderer's brain, never snapshot the
  canvas).
- **axe** on: the bar (both statuses), the stage (active), the view in both layouts, the page
  with the dialog open in Run mode (the 2.16 idiom).
- **e2e:** one describe, five tests, Chromium locally (`npm run e2e:chromium` inside `ci:dev`);
  the matrix on the pushed branch. `collectErrors(page)` in every test that presses `ArrowRight`
  while playing (a throw from `step()` would surface there and nowhere else).
- **Coverage:** `apps/web` has no gate; still, every new `lib/battle/*.ts` has its `*.test.tsx`
  (the folder's convention, 100% of files today) and no test exists to move a number.
- **Gate:** `npm run ci:dev` redirected to a file, exit code echoed. Report `bundle:check`'s four
  numbers and `bench:check`'s headroom (no engine change — say so).

### Previous story intelligence (3.18) and recent git

- **3.18's shape is this story's scaffolding.** `fullscreen` lives in `<BattlePage>` (FD1 (a) there),
  the view receives `fullscreen` / `onExitFullscreen` / `battleTitle`, the stage is mounted in
  both states with a three-slot fragment (FD2 (a)), the header is unmounted while the stage is up
  (FD9) and focus is restored by an effect keyed on `inFullscreen` clearing with a loose-focus guard.
  `F` rides all of it unchanged; this story adds one prop and one slot.
- **The tripwire tests exist** (`BattleSimulationView.test.tsx`: same canvas node / one
  construction / `drawFull` unchanged; 3.18 mutated the fragment and watched 3 fail). Re-run them
  through the key; do not weaken them.
- **The Dev Agent Record's gates:** `npm run ci:dev` exit 0 with 142 unit files (web 100), e2e
  Chromium 193 passed / 1 skipped, `/battle` 309.2 KB of 310 (0.8 KB headroom), bench 8.5 ms
  headroom. Expect the Run chunk (`21mklh3rx7342.js`-shaped hash, 7.2 KB gzip at 3.18) to grow by
  the hook and hints; `/battle` first-load by tens of bytes.
- **Items 3.18's reviews addressed to 3.19** (all answered above): the `.fs-hint` line and
  `keydown` script (AC8, AC1); the `ESC`/Stop vs. browser-exit collision (FD4); the held-`Enter`
  ping-pong (FD7 for `F`); the Exit/Fullscreen double-click geometry (out of scope, 6.11); the
  3.12 focus question (FD9).
- **3.18's e2e habits:** `enterRun(page)` seeds, navigates, asserts the h1, clicks Run, waits for
  `data-status="paused"` / `data-cycle="0"` and a visible dish; `(a)` polls the dish box; every
  test ends axe-clean. The private-port trick when a dev server is up (`PORT = 4199`, reverted).
- **Git (last 8):** `ce3f7ab` marks 3.18 done; `7578d4d` merges PR #55; three docs/fix commits
  from 3.18's reviews; `71bc1a0` / `ba75ae2` are `implement-next-story.toml` chores. Nothing else
  touched the battle route since 3.18 — the file lines cited in this story are current on `main`.

### External dependencies / versions

None new. React 19.2.7 (`useEffectEvent` is stable if chosen over the latest-ref — either way no
render-time ref access, `eslint-plugin-react-hooks` 7.1.1 enforces it); `@testing-library/user-event`
(`' '`, `'{ArrowRight}'`, `'{Escape}'`, `'f'`); Playwright (`'Space'`, `'ArrowRight'`, `'Escape'`,
`'f'`). `KeyboardEvent.key` / `.repeat` / `.isComposing` are baseline across NFR-2.1's matrix.

## Project Structure Notes

- **New:** `apps/web/lib/battle/useSimulationHotkeys.ts` + `useSimulationHotkeys.test.tsx` (FD1);
  `apps/web/components/battle/simulation/HotkeyHints.tsx` + `HotkeyHints.test.tsx` (FD6).
- **Modified:** `simulation/BattleSimulationView.tsx` (+ prop, + hook call, comments) and its
  test; `simulation/SimulationControlBar.tsx` (hint half, `space-between`, comments) and its test;
  `simulation/FullscreenStage.tsx` (hint slot, comments) and its test; `simulation/TransportControls.tsx`
  (one comment sentence, FD11); `battle/BattlePage.tsx` (one prop line + the `fullscreen`
  paragraph); `BattlePage.test.tsx`, `BattlePage.modeToggle.test.tsx`; `simulation/README.md`;
  `apps/web/e2e/battleRoute.spec.ts`; `docs/implementation-artifacts/deferred-work.md`,
  `sprint-status.yaml`, this file.
- **Untouched by design:** `themes.css`, `TransportControls.tsx`'s markup, `useSimulation.ts`,
  `PetriDishCanvas.tsx`, `gridRenderer.ts`, `BattleHeader.tsx`, `packages/**`, `organisms/**`,
  `lib/organisms/**`, every route file. Nothing lane 4 edits is on this list; `BattlePage.tsx` is
  on 4.24/4.25's path and both are already gated on `epic-3`, which this story completes.
- **Naming:** camelCase non-component files (`useSimulationHotkeys.ts`, `HotkeyHints.tsx`);
  PascalCase components; the hook exports a named function, the components default exports —
  the folder's existing pattern.

## References

- `docs/planning-artifacts/epics.md:974-984` — Story 3.19 (the three ACs, the UX-source note).
- `docs/planning-artifacts/component-tree-battle-page.md` — §2 tree (`useSimulationHotkeys` under
  the Run view, `:90`); §3.11 `<BattleSimulationView>` ("exit from the overlay / `F`", `:274`);
  §3.13 `<SimulationControlBar>` ("hints … display only, handling in `useSimulationHotkeys`",
  `:322`); §3.14 `<FullscreenStage>` (`onExit … / F key`, `:332`); §4 the hook (`:377-378`); §6 the
  `fullscreen` row (`:419`); §9 items 5–6 (`:479-480`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode.html:518-530,743-746`
  — `.keyboard-hint` styles and markup.
- `…/clinical-lab-theme/petri-dish-play-mode-fullscreen.html:260-278,370,387-392` — `.fs-hint`
  styles and markup; the `keydown` script (the FD4 conflict).
- `…/biotech-terminal-theme/play-mode-proposal.md:141-145,318-324,356-366` — the superseded
  seven-shortcut table (out of scope).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` — FR-4.1 / FR-4.3 / FR-4.4 /
  FR-4.5, NFR-4.1 (`:624`), NFR-1.1, NFR-8.3.
- `docs/planning-artifacts/architecture.md` — Decision D (the loop is untouched), Decision B.5
  (extinction-only auto-pause — Space after an auto-pause resumes), AR-29, AR-46.
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — the three state
  categories; the hook is a bridge holding no state.
- `docs/implementation-artifacts/3-18-fullscreen-run-stage.md` — Dev Agent Record (FD1–FD9, the
  tripwire mutation, the gates), Change Log, the lane-gate line.
- `docs/implementation-artifacts/3-12-transport-controls.md:36-38,136-142,553-554` — the hints
  half deferred here; "no `aria-keyshortcuts`".
- `docs/implementation-artifacts/deferred-work.md:888,1018-1023,1620-1677,1726-1732,1761-1777`
  — the items addressed to this story.
- `docs/implementation-artifacts/lane-gates.yaml` — the 4.24 / 4.25 rows that name this story's
  suspension rule.
- Code: `apps/web/components/battle/BattlePage.tsx:174-225,392-400,933-1012`;
  `apps/web/components/battle/simulation/BattleSimulationView.tsx:38,266-270,232-395`;
  `apps/web/components/battle/simulation/SimulationControlBar.tsx`;
  `apps/web/components/battle/simulation/FullscreenStage.tsx:49-52,179-181,317-329`;
  `apps/web/components/battle/simulation/TransportControls.tsx:16-18,146-158`;
  `apps/web/components/battle/simulation/LadderSlider.tsx:19-21,79,199-201`;
  `apps/web/lib/battle/useSimulation.ts:62-63,131-149,474-476,488-492`;
  `apps/web/lib/battle/useDirtyGuard.ts` (the listener-hook idiom);
  `apps/web/lib/battle/useLeaveGuard.ts:1-80` (dialog lifecycle, focus restore);
  `apps/web/lib/useInertBackground.ts`; `apps/web/components/PetriDishCanvas.tsx:826-843` (the
  latest-ref idiom under `react-hooks/refs`); `apps/web/components/VisuallyHidden.tsx`;
  `apps/web/components/battle/simulation/SimulationControlBar.test.tsx:140-168`;
  `apps/web/components/battle/BattlePage.test.tsx:2473-2486`;
  `apps/web/components/battle/BattlePage.modeToggle.test.tsx:135-136,236-237,264-330`;
  `apps/web/e2e/battleRoute.spec.ts:136-176,2357,2856,3054-3070`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5).

### Debug Log References

- `npm run ci:dev > /tmp/ci-3-19.log 2>&1; echo $?` → exit **0**.
  - `typecheck` / `lint` (1 pre-existing unrelated warning, `BattleGallery.tsx`) / `spec:check` /
    `boundary:check` all green.
  - `format:check`: red on the first pass (`useSimulationHotkeys.test.tsx` unformatted) →
    `npx prettier --write` → green on the rerun.
  - `test:coverage`: **web 106 test files / 1684 tests passed** (includes the three new files —
    `useSimulationHotkeys.test.tsx` 23 tests, `HotkeyHints.test.tsx` 7 tests — and the extended
    `BattleSimulationView.test.tsx` (+7), `BattlePage.test.tsx` (+3), `BattlePage.modeToggle.test.tsx`
    (+1), `SimulationControlBar.test.tsx` (+4), `FullscreenStage.test.tsx` (+3)); `@gol/domain` 108,
    `@gol/persistence` 82, `@gol/test-utils` 89, `@gol/simulation` 407 — all unchanged/green.
  - `bundle:check`: `/battle` **309.2 KB / 310 KB, 0.8 KB headroom — IDENTICAL to 3.18's close**
    (trap 12 confirmed: the hook, `<HotkeyHints>` and both hint styles ride the lazy Run chunk only,
    zero bytes added to the first-load page). `/battle/new` 309.1 KB (0.9 KB headroom), `/`
    333.7 KB (6.3 KB headroom), `/organisms` 295.5 KB (9.5 KB headroom) — all green, no engine or
    route change this story.
  - `bench:check`: **9.814 ms headroom (58.9% of the 16.667 ms frame budget)** — no engine change,
    as expected; unchanged in shape from 3.18's baseline.
  - `e2e:chromium`: **198 passed, 1 skipped** (the pre-existing unrelated skip) — up from 3.18's
    193/1 by exactly the 5 new `Simulation hotkeys (Story 3.19)` tests.
  - Also run standalone before the full gate: `npx playwright test --project=chromium
    --workers=1 -g "Story 3.1[1-9]|Simulation hotkeys"` → **42 passed** (the whole 3.11–3.19 e2e
    range plus the new block, single worker, per Task 5's instruction).
  - **Trap 16, measured in review (2026-09-18, one-off Chromium probe at 1024×768, not committed):**
    the chassis bar is 704 px wide (x 320–1024, `space-between`); the hint wraps to two lines
    (246×30 px at x 345) and the transport group (388 px) ends at x 999 — inside the bar, with
    `scrollWidth === clientWidth` (no overflow). `minWidth: 0; flex: 1` does what AC7 says.

- **Review gate (2026-09-18, after the 13 patches):** `npm run ci:dev > …/ci-dev.log 2>&1; echo $?`
  → typecheck / lint (the same pre-existing `BattleGallery.tsx` warning) / format:check / spec:check /
  boundary:check green; `test:coverage` **web 106 files / 1692 tests** (+8 from the review's
  test additions), packages unchanged (108 / 82 / 89 / 407); `bundle:check` `/battle` **309.2 KB /
  310 KB, 0.8 KB headroom — unchanged** (`/` 333.7, `/battle/new` 309.1, `/organisms` 295.5);
  `bench:check` 8.704 ms headroom (52.2%). The chain's `e2e:chromium` stage went red with
  `net::ERR_CONNECTION_REFUSED` on `127.0.0.1:4173` from test 10 onward (the `serve` webServer
  dropped; every failure 1.1 s, none an assertion) — re-run alone: `npm run e2e:chromium` →
  **198 passed, 1 skipped, exit 0**.

### Completion Notes List

- **FD1 (a)** — the hook lives at `apps/web/lib/battle/useSimulationHotkeys.ts`, beside
  `useSimulation` / `useDirtyGuard` / `useLeaveGuard` / `useUndoableGrid` / `useBattleDraft`.
  `simulation/README.md` corrected (its "What goes here" list no longer names the hook; a new
  sentence beside the `useSimulation` paragraph names its actual home).
- **FD2 (a)** — `SimulationHotkeyBindings` shipped exactly as specced: `onPlayPause` / `onStep` /
  `onStop` / `onToggleFullscreen` / `canStep: boolean`. The hook interprets nothing; `canStep` is
  `sim.status === 'paused'`, read by the view.
- **FD3 (a)** — Space defers to the browser when the target natively activates on Space
  (`isSpaceActivator`, exported and unit-tested standalone); the hook does nothing on that key in
  that case.
- **FD4 (a)** — `Escape` stops the sim in BOTH the chassis and the stage; `F` is the only
  fullscreen-exit key. The mockup's own `keydown` script (which also exits on `Escape`) is a
  flagged spec conflict, not what shipped — see the story's Spec-conflict flags §1 and the
  `deferred-work.md` FD4 (b) entry left open for the owner.
- **FD5 (a)** — `<BattleSimulationView>` gained `onEnterFullscreen(): void`; the view composes
  `fullscreen ? onExitFullscreen : onEnterFullscreen` as a plain expression. `<BattlePage>` passes
  the SAME `handleEnterFullscreen` the header's Fullscreen button already receives.
- **FD6 (a)** — one shared `simulation/HotkeyHints.tsx`, consumed via `styled(HotkeyHints)` in both
  `SimulationControlBar.tsx` and `FullscreenStage.tsx` (an MUI `styled()` wrap rather than each
  host's own literal `styled('div')` wrapper as Task 4.1/4.2/4.3's literal text sketches — the
  component itself now accepts and forwards `className`, which is the standard `styled(Component)`
  seam and avoids an extra DOM wrapper per host; behaviourally and visually identical to the
  task's description).
- **FD7 (a)** — `event.repeat` suspends all four keys, closing the held-`Enter`-shaped ping-pong
  risk for `F` (`deferred-work.md`, 3.18's held-Enter entry updated). `ArrowRight` repeat-as-scrub
  recorded as a 6.11 candidate (FD7 (b)), not taken.
- **FD8 (a)** — no `aria-keyshortcuts` on `<TransportControls>` (shared with 4.15's preview, which
  mounts no hook); recorded as a 6.11 candidate (FD8 (b)).
- **FD9 (a)** — closed by construction, no focus-management code added; `deferred-work.md`'s 3.12
  "Story 3.19 decides" entry struck through with the reasoning.
- **FD10 (a)** — dialog suspension is a DOM query (`[role="dialog"], [aria-modal="true"]`, plus
  `target.closest(...)`), no new prop, no coupling to `useLeaveGuard`. The FD10 chunk-fetch window
  (first Back of a session, before `<UnsavedChangesDialog>`'s dynamic chunk resolves) accepted and
  recorded in `deferred-work.md`.
- **FD11 (a)** — hint labels are the mockup's own words (`Play/Pause` / `Next` / `Stop`,
  `to exit fullscreen`); `TransportControls.tsx`'s head comment rewritten to say what shipped.
- All 13 acceptance criteria verified: AC1 (single window listener, no re-subscription — pinned by
  the StrictMode/addEventListener-spy tests in both the hook's own suite and
  `BattleSimulationView.test.tsx`), AC2/AC3 (the four keys and all six suspension rules, unit +
  e2e), AC4 (Lab mounts no listener — unit spy assertion + e2e), AC5/AC6 (`F` round trip, e2e box
  assertion reused from 3.18), AC7/AC8 (both hint lines, with axe), AC9 (dialog suspension, unit +
  e2e with a genuinely playing sim), AC10 (no per-cycle work, bundle unchanged at `/battle`), AC11
  (axe clean throughout), AC12 (the five e2e tests), AC13 (docs below).
- Spec-conflict flags 1–5 all carried into the story file unchanged (no NEW conflict found); flag 1
  (`Escape`/mockup-script vs. spec) is the one live decision left to the owner, recorded in both
  places.

### File List

**New**
- `apps/web/lib/battle/useSimulationHotkeys.ts`
- `apps/web/lib/battle/useSimulationHotkeys.test.tsx`
- `apps/web/components/battle/simulation/HotkeyHints.tsx`
- `apps/web/components/battle/simulation/HotkeyHints.test.tsx`

**Modified**
- `apps/web/components/battle/simulation/BattleSimulationView.tsx`
- `apps/web/components/battle/simulation/BattleSimulationView.test.tsx`
- `apps/web/components/battle/simulation/SimulationControlBar.tsx`
- `apps/web/components/battle/simulation/SimulationControlBar.test.tsx`
- `apps/web/components/battle/simulation/FullscreenStage.tsx`
- `apps/web/components/battle/simulation/FullscreenStage.test.tsx`
- `apps/web/components/battle/simulation/TransportControls.tsx` (comment only)
- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/battle/BattlePage.modeToggle.test.tsx`
- `apps/web/components/battle/simulation/README.md`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/3-19-simulation-hotkeys.md` (this file)

## Change Log

- 2026-09-18 — Story 3.19 created (ready-for-dev): ultimate context engine analysis completed —
  comprehensive developer guide created.
- 2026-09-18 — Story 3.19 implemented: `useSimulationHotkeys` (the hook, `lib/battle/`),
  `<HotkeyHints>` (shared component), both hint lines wired into `<SimulationControlBar>` and
  `<FullscreenStage>`, `<BattleSimulationView>`/`<BattlePage>` wiring for the `F` toggle, all docs
  updated (AC13), `deferred-work.md` candidates recorded. `npm run ci:dev` green (exit 0): web
  106/1684 unit tests, e2e Chromium 198/1 skipped, `/battle` 309.2 KB (0.8 KB headroom, unchanged
  from 3.18), bench 9.814 ms headroom. Status → review.
- 2026-09-18 — Code review (Opus, three adversarial layers): 13 patches applied in place (the hook
  gains a key-set filter and an `event.key` type guard; `<HotkeyHints>` moves its separator spaces
  outside the `aria-hidden` bullet; `onExit` documented; five test files tightened — the dead
  `queryByText`, the fixture-only sentence-case test, the leaking `appendChild`s, the trap-6
  double-Escape and AC9 (ii)/(iii) coverage, the open-dialog axe pass in e2e (e)); 5 items deferred
  to `deferred-work.md`; 1 owner decision left open (FD4 — `Escape` in the stage). Status →
  in-progress until the FD4 decision is recorded.

Dev Model: sonnet   # follows patterns that exist — the useDirtyGuard listener-hook shape, the latest-ref idiom, 3.18's fullscreen cell and focus effects, presentational <kbd> runs; the one new seam (FD2's bindings) is prescribed above and nothing later builds on it (4.15's preview must NOT mount it)
Proposed lane gate: none   # 3.19 edits no file lane 4 touches (themes.css untouched, TransportControls markup untouched); 4.24/4.25 already gate on epic-3, which this story completes, and FD10's DOM-based suspension holds for their modal by construction

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 43s | 43s | 18 | 2,714 | 10,496 | 510,958 | 524,186 |
| Step 1 — create | opus-5 | 1 | 19m 30s | 19m 30s | 188 | 69,707 | 421,319 | 12,161,054 | 12,652,268 |
| Step 2 — implement | sonnet-5 | 1 | 28m 47s | 28m 47s | 678 | 129,445 | 728,693 | 77,278,563 | 78,137,379 |
| Step 3 — review + PR | opus-5 | 4 | 27m 23s | 27m 23s | 492 | 137,642 | 1,333,221 | 32,950,178 | 34,421,533 |
| _of which the orchestrator_ | opus-5 | — | — | — | 60 | 17,723 | 38,653 | 1,918,982 | 1,975,418 |
| **Total (create → PR ready)** | | 6 | **1h 16m** | 1h 16m | 1,376 | 339,508 | 2,493,729 | 122,900,753 | **125,735,366** |

Run started 2026-09-18 14:09 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
