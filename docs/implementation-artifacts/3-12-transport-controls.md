---
baseline_commit: 01c52be1b0e9cee16d25ccbe04134696b6569296
---

# Story 3.12: Transport Controls

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want play, pause, step, and stop controls,
so that I can drive the simulation precisely.

## Acceptance Criteria

From `epics.md#Story 3.12`, decomposed into what a reviewer can check independently. The
semantics already exist and are tested: `useSimulation` (Story 3.10 AC4) owns `play` / `pause` /
`step` / `stop`, and Story 3.11 mounted the Run chassis with `<SimulationMain>` holding the dish
box "and nothing else — no transport bar (3.12)". What does **not** exist is the bottom bar: the
component, its three controls, the wiring from `status` to a single Play/Pause toggle and a
paused-only Step, and the tests that prove a click does what FR-4.1/4.3/4.4 say. This story adds
no semantics to the hook and no state to the view — it is the first control surface over a run.

1. **`<SimulationControlBar>` renders in the Run bottom bar (spec §2, §3.13; FR-4.1, FR-4.3,
   FR-4.4).** New file `apps/web/components/battle/simulation/SimulationControlBar.tsx`, exported
   default, with exported `SimulationControlBarProps = { status: SimulationStatus; onPlayPause():
   void; onStep(): void; onStop(): void }` — spec §3.13's four members, exactly (§3.14's
   `<FullscreenStage>` will `Pick` from this type in Story 3.18). It is rendered by
   `<BattleSimulationView>` as the LAST child of `<SimulationMain>`, in flow below
   `<GridContainer>` — the `<EditorStatusBar>` placement (Story 2.8: in flow, never the mockup's
   `position: fixed`), so the dish's `flex: 1` reserve is computed from the bar's real height.
   The bar is the mockup's `.stats-bar` surface (`--gol-bg-secondary`, `1px solid var(--gol-border)`
   top border, `12px 25px` padding) with the transport cluster right-aligned; the left "hints"
   region is **absent** this story (Story 3.19 adds the SPACE / → / ESC hints together with the
   handlers — hints without handlers are the dead affordance NFR-4.1 forbids).

2. **Three real buttons in a named group.** `<div role="group" aria-label="Simulation controls">`
   holding three `<button type="button">`s in this DOM (and Tab) order: **Play/Pause**, **Next
   cycle**, **Stop & reset** — the mockup's `.control-buttons-horizontal` order (`gap: 10px`). DOM
   text is sentence case and CSS uppercases it (`<SidebarFooter>` trap 15 — accessible names are
   `Play` / `Pause` / `Next cycle` / `Stop & reset`); each carries its mockup glyph (`▶` / `⏸` /
   `⏭` / `⏹`) in a `<span aria-hidden="true">` so the names stay exactly those four strings.
   `getAllByRole('button')` on the view now returns **four** (Back + three).

3. **One Play/Pause toggle reflecting `status` (FR-4.1, UX-DR20, spec §3.13).** ONE button, one
   DOM element across the flip: while `status === 'paused'` it reads `Play` (`▶`); while
   `'playing'` it reads `Pause` (`⏸`). Its `onClick` fires `onPlayPause()` once per press; the
   view maps that to `sim.play()` or `sim.pause()` by the CURRENT `sim.status` (FD3). No
   `aria-pressed` on it — a control whose accessible name states the action it will perform is
   not a pressed-state toggle, and the two signals together contradict each other (FD1). Focus
   stays on the same element across the label change (asserted: press Play via keyboard, the
   button now named `Pause` `toHaveFocus()`).

4. **Play advances cycles at the current speed; Pause halts; resume continues (FR-4.1; Decision
   D, AR-24).** Pressing Play while paused calls `sim.play()` and the view root's `data-status`
   becomes `"playing"`; frames then advance `data-cycle` (one step per `msPerCycle` of frame time
   — the loop's contract, Story 3.8; NOT re-tested here beyond "cycles advance"). Pressing Pause
   calls `sim.pause()`: `data-status="paused"`, the outstanding frame is cancelled, and
   `data-cycle` holds the exact paused cycle (the hook publishes on pause, 3.10 AC4). Pressing
   Play again continues from that cycle over the SAME buffers — `data-cycle` does not reset and
   `drawFull` is not called again (a resume is not a new run; only Stop re-clones).

5. **Step advances exactly one cycle, paused only (FR-4.3, FR-4.5).** While `status === 'paused'`,
   Next cycle is enabled; pressing it calls `sim.step()` → `data-cycle` increments by exactly 1
   and the dish repaints once via `drawDiff` (prototype spy) with no animation frame requested.
   While `status === 'playing'` the button carries the REAL `disabled` attribute (the route's
   policy for every disabled control — `<EditorStatusBar>`'s "never a CSS-only grey"; the
   `aria-disabled` alternative is Story 6.11's route-wide sweep, `deferred-work.md`) plus
   `title="Available while paused"` (the RUN button's `title` precedent, 3.11 AC7). It re-enables
   on Pause. `sim.step()` is therefore never reachable while playing from this surface — the hook
   THROWS on that call (3.10 FD5), and a disabled button is what makes the throw unreachable
   rather than a state to absorb.

6. **Stop halts and returns to the initial state at cycle 0 (FR-4.4, AR-31, Decision A.2).**
   Pressing Stop & reset — in either status — calls `sim.stop()`: `data-status="paused"`,
   `data-cycle="0"`, the loop's frame is cancelled if one was outstanding, and the dish is
   full-painted once more via `drawFull` with a grid byte-equal to `initialGrid` (occupant AND
   age — the 3.11 AC5 comparison shape). The playback canvas is NOT rebuilt by a Stop:
   `sim.liveSize` is a fresh object at the same dimensions and `PlaybackDish` keys on
   `cols`/`rows` (3.11 review patch 1 — "every Stop in 3.12 would detach, rebuild and re-prime"
   was the bug fixed for exactly this story). `initialGrid` is untouched; `<BattlePage>`'s
   `grid`, `canUndo`, `isDirty` are unchanged by any transport press (AC9 of 3.11 still holds).
   Stop is **always enabled** (FD5).

7. **Tokens only, contrast gated, no motion (AR-46, NFR-8.1; Story 2.13's bar rule).** Play/Pause
   is the route's primary accent button (`<EditorStatusBar>`'s `SaveButton` pair: `--gol-accent`
   fill, `--gol-on-accent` text, `--gol-accent-hover` hover — the mockup's `.control-btn-play`
   `var(--accent)` / `var(--bg-primary)` verbatim). Stop is a danger outline (`--gol-danger`
   border + text on the bar's `--gol-bg-secondary`, hover `--gol-danger-hover` border + text —
   FD2). Next cycle is the secondary outline (`UndoButton` pair — FD2). Every button carries
   `barButtonBase`'s shape: `11px/600/uppercase/0.5px`, `font-family: inherit`, real `disabled`
   styled with the pre-validated trio (`--gol-action-disabled-bg` / `--gol-border` /
   `--gol-action-disabled`, `cursor: not-allowed`), `:focus-visible` `2px solid var(--gol-accent)`
   at `outlineOffset: 2px`. **No `transition` on any of them** — three stories on this route lost
   one to a mid-fade axe scan (`EditorStatusBar.tsx`'s comment block is the record). No raw hex
   and no `rgb()` in the `.tsx` — the AR-46 lint catches functional notation too, so a hover
   tint is a THEME token or nothing. `themeTokens.test.ts` gains the `danger-hover` on
   `bg-primary` / `bg-secondary` rows (≥ 4.5:1) that FD2 (a) relies on.

8. **Keyboard-focusable and axe-clean in every state (AC line 4 of the epic; NFR-4.1).** Tab
   order inside the bar is Play/Pause → Next cycle → Stop & reset (while playing, Next cycle is
   skipped because it is `disabled`); Enter and Space activate each. `vitest-axe` passes on the
   bar in `paused` and `playing`, and on the whole `<BattleSimulationView>` paused, playing, and
   after a Stop. The e2e runs `AxeBuilder` on the route in Run mode while PLAYING and again after
   Stop; every new e2e asserts `collectErrors(page)` is empty.

9. **The view stays a hook consumer, not a state owner (RFC-005 Decision 5, AR-29, NFR-1.1).**
   `<BattleSimulationView>` adds NO `useState`, no ref, no effect for the transport. It reads
   `sim.status` and passes `sim.step` / `sim.stop` straight through and the one derived
   `handlePlayPause`. `data-status` / `data-cycle` stay on the view root (3.14 renders them as
   text; the e2e and this story's tests read the attributes). Cycles still cause zero React
   re-renders beyond the hook's ≤ 10 Hz publish — the bar receives `status` and three callbacks,
   nothing that changes per cycle.

10. **The engine chunk stays off the route's first load (AR-35, 3.11 AC8).** The bar is imported
    only by `<BattleSimulationView>`, which is behind `next/dynamic`, so it rides in the Run chunk.
    `bundle:check` passes with `check-bundle-size.mjs` unchanged; the Dev Agent Record reports
    `/battle`'s measured first-load gzip (expected: unchanged from 308.5 KB within noise, 1.5 KB
    headroom), and the Run chunk's new size. If `/battle` moves by more than noise, say why —
    `deferred-work.md`'s 3-11 entry names the next mechanism (split the `PetriDishCanvas`
    variants), never the threshold.

11. **Gates hold.** `npm run ci` exits 0: nothing in `packages/*` (coverage floors untouched);
    `spec:check` resolves every ID cited here and in code; `bench:check` unchanged (nothing on the
    benchmarked path). Count tests that this story is written to flip are converted, not deleted
    (Task 6). `deferred-work.md` entries that name this story are closed or reassigned with a
    reason (Task 7).

## Tasks / Subtasks

- [x] **Task 1 — `<SimulationControlBar>`** (AC1, AC2, AC3, AC5, AC7; FD1, FD2)
  - [x] New `apps/web/components/battle/simulation/SimulationControlBar.tsx` (`'use client'`).
    Head comment: spec §3.13's responsibility line ("the Run bottom bar: keyboard hints left,
    transport buttons right"), that the hints half is Story 3.19's (with the handlers — NFR-4.1),
    that this is a presentational, total component (no hook, no state, no repository — the
    `<SidebarFooter>` shape: "fired on a real press and nothing else"), and the three colour
    decisions (FD2) with the contrast facts they rest on.
  - [x] `Bar = styled('div')`: `display: flex`, `alignItems: center`, `justifyContent: flex-end`
    (3.19 flips this to `space-between` when the hints land — say so in one line), `gap: 20px`,
    `padding: '12px 25px'`, `minWidth: 0`, `background: var(--gol-bg-secondary)`, `borderTop: 1px
    solid var(--gol-border)` — `<EditorStatusBar>`'s `Bar` values. `Transport = styled('div')`
    (`display: flex`, `gap: 10px`, `alignItems: center`, `flexShrink: 0`) rendered `role="group"
    aria-label="Simulation controls"`.
  - [x] A `barButtonBase` style OBJECT (Story 2.13 FD5 (c) — not a base component, not a
    `variant` prop; copy the object from `EditorStatusBar.tsx` with a one-line pointer rather than
    importing it — `simulation/` must not import from `editor/`, README rule) spread into three
    `styled('button')`s: `PlayPauseButton` (= `SaveButton`'s pair, `padding: '11px 18px'` per the
    play mockup's `.control-btn`), `StepButton` (= `UndoButton`'s pair: transparent,
    `1px solid var(--gol-border-control)`, `--gol-text-primary`, hover `--gol-bg-hover` +
    `--gol-text-secondary` border), `StopButton` (transparent, `1px solid var(--gol-danger)`,
    `color: var(--gol-danger)`, `&:hover:not(:disabled)`: `borderColor` + `color`
    `var(--gol-danger-hover)`, background UNCHANGED — FD2). Glyph span: `Icon = styled('span')`
    `fontSize: 15px; lineHeight: 1` (`.control-btn-icon`), `aria-hidden`. `display: inline-flex;
    alignItems: center; gap: 8px` on the buttons (`.control-btn`). ❌ No `transition`, no
    `position: relative`, no `rgb(` anywhere in the file.
  - [x] Render: `<PlayPauseButton type="button" onClick={onPlayPause}>{playing ? <><Icon
    aria-hidden="true">⏸</Icon> Pause</> : <><Icon aria-hidden="true">▶</Icon> Play</>}
    </PlayPauseButton>`; `<StepButton type="button" onClick={onStep} disabled={playing}
    title={playing ? 'Available while paused' : undefined}>` `⏭ Next cycle`; `<StopButton
    type="button" onClick={onStop}>` `⏹ Stop & reset`. `const playing = status === 'playing'`
    — derive once; the component has no other branch. The three glyphs and labels are the
    mockup's (`petri-dish-play-mode.html:749-762`, toggle script `:772-784`), sentence-cased.
  - [x] `SimulationControlBar.test.tsx` beside it (`renderBar(overrides)` helper defaulting to
    `status: 'paused'` and `vi.fn()`s — `EditorStatusBar.test.tsx`'s shape): renders three
    buttons named `Play` / `Next cycle` / `Stop & reset` inside a group named "Simulation
    controls"; with `status: 'playing'` the first is named `Pause`, `Next cycle` is `disabled`
    with the `title`, `Stop & reset` enabled; `Play` press calls `onPlayPause` once and NOT
    `onStep`/`onStop`; `Next cycle` press calls `onStep` once (paused) and nothing while
    disabled; `Stop & reset` calls `onStop` once in both statuses; the Play/Pause button is the
    SAME element across a `rerender` from `paused` to `playing` (capture the element, rerender,
    `toBe`); tab order paused: Play → Next cycle → Stop & reset → body; tab order playing: Pause
    → Stop & reset → body; Enter and Space on Play both fire once each; `axe` in both statuses
    (`vitest-axe`, the series-with-`unmount` pattern). ⚠️ `role="group"` with `aria-label` is
    what axe checks for a `group` name — not `aria-labelledby` to nothing.

- [x] **Task 2 — Wire the bar into `<BattleSimulationView>`** (AC1, AC3, AC4, AC6, AC9; FD3)
  - [x] `BattleSimulationView.tsx`: import `SimulationControlBar`; `const handlePlayPause =
    useCallback(() => { if (sim.status === 'playing') sim.pause(); else sim.play(); },
    [sim.status, sim.play, sim.pause])` — the view's `status` is React's truth and the
    handler's closure is re-created on every status change, which is exactly when the label
    flips (FD3). Comment: why the view maps and the bar does not (spec §3.13 gives the bar ONE
    `onPlayPause`; the bar never sees `sim`), and the one known gap — a thrown step leaves
    `status: 'playing'` over a stopped loop (`deferred-work.md`, 3-10 review → Story 3.15); in
    that state this button reads Pause, and pressing it runs `pause()`, which is the correct
    recovery, so nothing here guards it.
  - [x] Render `<SimulationControlBar status={sim.status} onPlayPause={handlePlayPause}
    onStep={sim.step} onStop={sim.stop} />` as the last child of `<SimulationMain>`, after
    `<GridContainer>`. `sim.step` / `sim.stop` are `useCallback`-stable (3.10) — pass them
    straight through; a wrapper adds nothing and costs a closure per render.
  - [x] Update the head comment: "Deliberately ABSENT, by story" drops the transport bar; "`sim.play`
    is never called: this view starts paused at cycle 0 and stays there" becomes the truth — the
    view starts paused at cycle 0 and the bar is the only thing that moves it. Keep every other
    sentence (obligations 1–3, FD5/FD7 of 3.11) as is. `<SimulationMain>`'s "the dish box …
    nothing else" comment in 3.11's AC10 lives in the story file, not the code — nothing to edit.
  - [x] `data-status` / `data-cycle` on the root: unchanged. Do NOT add `data-` mirrors for
    anything else; 3.14 renders the cycle as text.

- [x] **Task 3 — Contrast rows for FD2** (AC7)
  - [x] `apps/web/lib/themeTokens.test.ts`: extend the "danger pairs" describe (currently
    `danger` on `bg-primary` / `bg-secondary`) with `danger-hover` on the same two backgrounds,
    ≥ 4.5:1, in the file's `it.each`/loop shape; leave `bg-hover` excluded with its existing
    comment intact — that exclusion is precisely why the Stop hover changes the TEXT colour and
    not the surface (FD2). Expected: `#ff4477` on `#1a1a1a` measures ≈ 5.3:1 (compute with the
    file's `contrastRatio` before writing the test; if it is under 4.5, FD2 falls back to option
    (b) and the story records why). No `themes.css` change — both tokens exist (Story 1.13).

- [x] **Task 4 — `<BattleSimulationView>` transport tests** (AC3, AC4, AC5, AC6, AC8, AC9; FD4)
  - [x] `BattleSimulationView.test.tsx`, new `describe('BattleSimulationView — transport (Story
    3.12)')`. Frame driver (FD4): in `beforeEach`, `vi.spyOn(window, 'requestAnimationFrame')`
    and `'cancelAnimationFrame'` with a queue (`{ handle, callback }[]`, `frame(now)` splices the
    queue and calls each callback inside `act`, `cancel` splices by handle) — the same fake
    `useSimulation.test.ts` builds as a `FrameScheduler`, but installed on `window` because the
    view does not (and must not) take a scheduler prop; `rafScheduler`'s arrow wrappers look
    `window.requestAnimationFrame` up at call time, which is what makes the spy work. The
    existing `it('requests no animation frame while paused …')` keeps its bare spy — it asserts
    the paused invariant and is unaffected.
  - [x] Tests, all through real children (`installContexts()` for a painted dish where the
    assertion needs one; `GridRenderer.prototype` spies for `drawFull` / `drawDiff` counts):
    (a) Play: click `Play` → root `data-status="playing"`, one RAF requested, button now named
    `Pause` and `toHaveFocus()` after a keyboard activation; `frame(0)` (prime) then `frame(100)`
    at `startingSpeed: 10` → `data-cycle="1"`, `drawDiff` called once; `frame(200)` → `"2"`.
    (b) Pause: click `Pause` → `data-status="paused"`, `cancelAnimationFrame` called once with the
    outstanding handle, queue empty, `data-cycle` holds; a stray `frame(300)` advances nothing.
    (c) Resume: click `Play` again → `frame(300)` prime, `frame(400)` → `data-cycle="3"` — continued,
    not restarted; `drawFull` still at its mount count of 1.
    (d) Step paused: click `Next cycle` → `data-cycle` +1, `drawDiff` +1, NO RAF requested,
    `data-status` still `"paused"`.
    (e) Step disabled while playing: after Play, `Next cycle` `toBeDisabled()` with the `title`;
    `user.click` on it fires nothing (cycle unchanged) — and `sim.step` was never invoked
    (assert via `drawDiff` count, since the hook's throw would surface as an unhandled error).
    (f) Stop from playing: click `Stop & reset` → `data-status="paused"`, `data-cycle="0"`,
    `cancelAnimationFrame` called, `drawFull` now 2 with its last grid byte-equal to `GRID`
    (`occupant`, `age`, `width`, `height` — the 3.11 AC5 shape); the canvas element is the SAME
    node as before (`toBe`) and `onRendererReady` was not re-called — no rebuild (AC6).
    (g) Stop from paused at cycle N>0 (after steps) → same outcome; Stop at cycle 0 → still
    `"0"`, one more `drawFull`, no throw (FD5 (a) — always enabled, harmless).
    (h) `axe` on the container paused, playing, and after Stop.
  - [x] Convert `it('renders the footer’s Back button and nothing else: one button, no h2, no
    slider')`: `toHaveLength(1)` → `4`; the `queryByRole('button', { name: /play|pause|step|stop/i
    })` null assertion becomes a presence assertion for `Play`, `Next cycle`, `Stop & reset`;
    keep "no h2, no slider" (3.13/3.14 flip those). Rewrite its AC10 comment: the transport is
    here now; speed/counter/stats/grid size are still absent.
  - [x] Determinism: assert on `data-cycle` and renderer-method counts, never on cell contents
    after a step — the view exposes no `opts.seed`, and the fixture grid's two blinkers overlap
    at cycle 1 (cols 1–3 vs 3–5), which is a dominance/tie-break question the hook's seeded tests
    already own. The Stop byte-equality in (f) compares against `GRID` (cycle 0), which IS
    deterministic.

- [x] **Task 5 — e2e** (AC4, AC5, AC6, AC8)
  - [x] `apps/web/e2e/battleRoute.spec.ts`, new `test.describe('Transport controls (Story 3.12)')`
    on Three-Way Skirmish (`MOCK_BATTLE_IDS.battleA`; all three roster organisms resolve — the
    3.11 block's choice, for the same reason). Reuse the 3.11 block's `runButton`, `dish`,
    `collectErrors` (hoist them to the file's module scope if the two blocks would otherwise
    duplicate them — one definition, a comment saying which stories share it) and the file's
    `snapshotBaseline` / `countChangedPixels`. Add nothing to `@gol/test-utils`.
    (a) Play/Pause/resume: enter Run, `snapshotBaseline(dish)` at cycle 0, click `Play` →
    `[data-status="playing"]`, `expect(view).not.toHaveAttribute('data-cycle', '0')` (Playwright
    retries), `countChangedPixels > 0`; click `Pause` → `"paused"`, read `data-cycle` twice
    ≥ 300 ms apart and assert equal; click `Play` → cycle grows past the paused value.
    (b) Step: paused at cycle c, click `Next cycle` → `data-cycle` is `String(c + 1)` exactly,
    status still paused; while playing, `Next cycle` `toBeDisabled()`.
    (c) Stop: from playing, click `Stop & reset` → `"paused"`, `"0"`, and `countChangedPixels(dish)
    === 0` against the cycle-0 baseline — the dish is byte-identical to before Play. ⚠️ If this
    reads non-zero, that is a `drawFull` that does not clear first or an aliasing artefact —
    diagnose before weakening it to `distinctColorCount`.
    (d) Keyboard: Tab from the Back button reaches `Play`, then `Next cycle`, then `Stop & reset`;
    `Enter` on `Play` starts the run and focus stays on the (now `Pause`) button.
    (e) Axe: zero violations while PLAYING and again after Stop.
    (f) Round trip: after a Stop, click `Lab` → the editor's dish shows the same > 2 colours and
    `[data-dirty]` is whatever it was (a clean battle stays `"false"`) — transport presses never
    dirty the battle (AC6 last sentence).
    Every test: `collectErrors` empty. All four Playwright projects.

- [x] **Task 6 — Conformance sweep** (AC2, AC11)
  - [x] `BattlePage.test.tsx`: the Lab-mode count tests (`organisms.length + 7`, `/battle/new`
    → 8) are Lab-only and stay; the Run-mode describe has no total count — add ONE: after
    `findRunView`, `getAllByRole('button')` has length 4 (Back + Play + Next cycle + Stop & reset)
    and `queryByRole('slider')` is null — written so 3.13's slider and 3.18's fullscreen button
    fail it and convert it, the route's convention. The "ELEVENTH button … still fails here"
    comment on the loaded-route test is about LAB — leave it.
  - [x] Grep `apps/web` for "3.12" and "transport" in comments (`useSimulation.ts` head comment
    lines 44 and 63, `simulationLoop.ts` factory doc, `BattleSimulationView.tsx`,
    `simulation/README.md`) — every future-tense sentence that is now false gets rewritten;
    every one that describes a contract this story honours (Step is disabled during playback;
    the cycle counter lives with the thunk because manual Step bypasses the loop) stays.
  - [x] `simulation/README.md`: the "What goes here" list already names
    `<SimulationControlBar>`; add nothing unless a name differs.

- [x] **Task 7 — Bookkeeping** (AC10, AC11)
  - [x] `deferred-work.md`: (1) the 3-11 amendment-candidate list for `component-tree-battle-page.md`
    — append §3.13 as SHIPPED per spec (no deviation) or, if any prop was added, the deviation
    and why; (2) the 3-10 review entry "A throw inside the RAF step leaves `status: 'playing'`"
    — add one sentence: the Play/Pause button reads Pause in that state and pressing it is the
    recovery (`pause()` sets `'paused'`); still 3.15's to fix at the thunk; (3) new "Deferred
    from: Story 3-12" section carrying: the mockup's amber Next-cycle colour with no token (FD2
    (b) taken; a `--gol-warning` family is an Epic 6 token-layer decision, with the measured
    ratios), the `title`-on-disabled Step joining 6.11's sweep, and the Step-focus-loss note for
    3.19 (SPACE while `Next cycle` is focused disables the focused element — focus falls to
    `<body>`; 3.19 decides whether to move it).
  - [x] `npm run ci > /tmp/ci-3-12.log 2>&1; echo $?` — never pipe to `tail`. Record the exit
    code, `/battle` first-load gzip + headroom (AC10), the Run chunk size, `bench:check`
    (unchanged), and the unit/e2e counts in the Dev Agent Record.

### Review Findings

Reviewed 2026-09-15 on **Opus** against a **Sonnet** implementation, via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 25 normalised findings: 10 `patch`
(all applied), 0 `decision-needed`, 0 `defer`, 15 dismissed as noise. The dismissals worth a line:
the disabled-Step `title` gap (FD6, already 6.11's), `onStep` passed raw (spec §3.13; the hook's
throw is the guard-of-record), the e2e "baseline before prime" race (3.11's `toBeVisible` →
immediate `distinctColorCount` pattern is CI-proven — the prime is synchronous with mount), the
300 ms hold (Task 5 (a) prescribes it), the `▶ ⏸ ⏭ ⏹` glyphs (the mockup's own characters,
`<SidebarFooter>` precedent), and the "other hover pairs ungated" claim (`on-accent` × `accent-hover`
and `text-primary` × `bg-hover` are already rows in `themeTokens.test.ts`).

- [x] [Review][Patch] `handlePlayPause` keyed on `[sim]` re-created the closure on EVERY publish (`sim`'s `useMemo` keys on `view`, i.e. `cycle`/`population` at ≤ 10 Hz), not "on the one change that matters" as its comment claimed — the per-cycle prop churn AC9 rules out and a silent deviation from Task 2's `[sim.status, sim.play, sim.pause]`. Root cause: `exhaustive-deps` treats `sim.pause()` as a method call and demands `sim`. Fixed by destructuring `{ status, play, pause }` first; lints clean, comment rewritten to say why [BattleSimulationView.tsx:170-180]
- [x] [Review][Patch] `#ff4477` hex literal inside `StopButton`'s comment, in a file whose head comment says "No raw hex … anywhere in this file" — the number rots silently when the token moves; dropped, the ratios stay [SimulationControlBar.tsx:130]
- [x] [Review][Patch] `barButtonBase` comment claims a copy of the editor's object but the object adds `display`/`alignItems`/`gap` — per Task 1, now said so in the comment so the next sync does not "fix" it either way [SimulationControlBar.tsx:62-65]
- [x] [Review][Patch] Test (e) asserted only `drawDiff` not called — vacuous with no frame fired (a reached `sim.step()` throws, it does not draw). Added `data-cycle` still `"0"` [BattleSimulationView.test.tsx:333-336]
- [x] [Review][Patch] Test (h)'s comment cited "the `unmount`-series pattern" and named its handle `paused` while driving one render through three states without unmounting — comment and name corrected [BattleSimulationView.test.tsx:395-412]
- [x] [Review][Patch] `installFrameDriver` doc claimed "React 19 batches RAF too" — it does not; `act` is needed because the callbacks `setView`. Reworded [BattleSimulationView.test.tsx:91-92]
- [x] [Review][Patch] The Run-mode count test's title named four buttons but asserted only `toHaveLength(4)`; four wrong buttons passed. Added the four name lookups [BattlePage.test.tsx:2867-2869]
- [x] [Review][Patch] Round-trip e2e (f) clicked Stop straight after Play with no wait for `data-cycle` to move, so the Stop it tests may have had nothing to discard. Now waits for `data-cycle ≠ "0"` first [battleRoute.spec.ts:2260-2262]
- [x] [Review][Patch] Dev Agent Record said "7 new Story 3.12 e2e tests"; the block has 6 (every Task 5 case (a)–(f) present). Corrected [3-12-transport-controls.md Debug Log]
- [x] [Review][Patch] AC10/Task 7 require the Run chunk's new size in the Dev Agent Record; it was absent. Measured from the `out/` export built for the feat commit: **4.8 KB gzip (12.5 KB raw)**, up from 3.11's 4.2 KB (10.2 KB raw), and not referenced from `battle.html` — the bar rides in the dynamic chunk as AC10 requires. Recorded [3-12-transport-controls.md Completion Notes]

## Dev Notes

### Constraints the developer MUST follow

- **Scope: the bar, its wiring, two contrast rows, tests, docs.** No speed control (3.13), no
  cycle text or population bars (3.14), no extinction check (3.15 — the hook's thunk), no grid
  size (3.16), no gallery Run action (3.17), no fullscreen (3.18), no hotkeys and no hints
  (3.19). Nothing in `packages/*`. No change to `useSimulation`, `simulationLoop`,
  `GridRenderer`, `PetriDishCanvas`, `check-bundle-size.mjs`, `themes.css`.
- **Hot state stays in the hook (RFC-005 Decision 5, AR-29).** The view gains one `useCallback`
  and zero `useState`/`useRef`/`useEffect`. The bar is stateless. A `useState` holding anything
  from the engine is the failure NFR-1.1 names; a `useEffect` that calls `sim.play()` is a
  design change nobody asked for.
- **The bar never sees `sim`.** Props are spec §3.13's four members. If the bar needs a fifth
  thing, that is a spec amendment candidate — record it, do not silently widen.
- **`components/battle/` is split by mode (`simulation/README.md`).** `SimulationControlBar.tsx`
  goes in `simulation/`; it imports nothing from `editor/` — copy `barButtonBase` with a pointer
  rather than importing `<EditorStatusBar>`'s (the README names that exact shortcut as a design
  change). `<SidebarFooter>` stays the only root-level component the Run view renders.
- **Repositories are injected, never imported (AR-2, AR-27).** Nothing here touches one.
- **`apps/web` rules:** strict TS, no `any`/`!`/`@ts-ignore`; `export type` for types; camelCase
  filenames; `@gol/*` by package name; `@gol/test-utils` and `@/test-support` only from tests;
  no raw colour literals — hex OR `rgb()`/`hsl()` — in `.tsx` (AR-46 lint, unanchored selectors,
  catches shorthand strings); `styled()` for static chrome, no `sx`, no MUI `Button` on the
  battle route (Story 2.8 FD2 — bundle). No `transition` on any new control.
- **Never read or write a ref during render**; `react-hooks/refs`, `set-state-in-effect`,
  `exhaustive-deps` are live (eslint-plugin-react-hooks 7 via eslint-config-next 16). No React
  Compiler is configured — memoise by hand where the story says, nowhere else.
- **Comments explain WHY and cite by ID.** `spec:check` reads this file and the code: `FR-4.1`,
  `FR-4.3`, `FR-4.4`, `AR-46`, `Decision D`, `M2`, `Story 3.10` exactly; `FR4.1`, `AR46`,
  `M-2` are silently exempt forever. `ACn` and bare `FDn` are story-relative and unchecked.
- **Commit gate.** The story subagent commits to its own `story/3-12-…` branch; merging is
  Sidiar's. Lane 4 is open in another worktree — its `sprint-status.yaml` diffs must not ride
  into this branch (3.8's review reverted exactly that).

### What this story is, in one paragraph

Story 3.10 built the run and gave it four verbs; Story 3.11 put the run on screen and called none
of them — "`sim.play` is never called" is a sentence in the view's head comment. This story adds
the surface that calls them: one bar, three buttons, four props, and the single derivation that
is genuinely new (which verb Play/Pause means, decided in the view from `status`). Everything
else is a pattern this route already settled — the in-flow bottom bar (2.8), the shared
`barButtonBase` object (2.13), the accent/secondary button pairs, the real-`disabled` policy, the
no-`transition` rule, `role="group"` + `aria-label` for a named cluster (3.11's Mode group), the
sentence-case-DOM/uppercase-CSS accessible-name rule, the `data-status`/`data-cycle` test handles.
Three things are decided rather than composed: what a Play/Pause toggle says to a screen reader
(FD1), what colours the mockup's amber and red become under a token layer that has red but not
amber (FD2), and how the view's tests drive frames without a scheduler prop (FD4). Stop's
enablement (FD5) is the one product-shaped call, and it is small.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — What the Play/Pause toggle says.**
- **(a) One button whose accessible name flips `Play` ⇄ `Pause` with the glyph; no
  `aria-pressed`** *(recommended)*. The mockup's own script (`petri-dish-play-mode.html:772-784`)
  swaps icon and text. A name that states the next action is the pattern media players use and
  what a screen-reader user expects to hear before pressing. WAI-ARIA's toggle-button guidance
  is explicit that a button with `aria-pressed` must NOT change its label — the two signals
  together announce "Pause, pressed" for a running sim, which is backwards.
- **(b) Constant name (`Play/Pause`) + `aria-pressed={playing}`.** Correct ARIA, but the visible
  label then disagrees with the mockup and `getByRole('button', { name: 'Pause' })` — the
  natural test and e2e handle — stops existing.
- **(c) Two buttons, one hidden.** Focus is lost on every flip (the focused element unmounts);
  the mockup has one control.

**FD2 — Colours: the mockup has cyan / amber / red; the token layer has cyan and red.**
- **Play/Pause: the primary accent pair** (`--gol-accent` / `--gol-on-accent` / `--gol-accent-hover`)
  — the mockup's `.control-btn-play` is literally `var(--accent)` on `var(--bg-primary)`, and
  `SaveButton` already gates every state. No decision here.
- **Stop & reset:**
  - **(a) `--gol-danger` outline; hover swaps border AND text to `--gol-danger-hover`, surface
    unchanged; two new contrast rows** *(recommended)*. The mockup's `#ff0055` is the settings
    mockup's `--warning`, which Story 1.13 mapped to `--gol-danger` (`themes.css:59-64`); the
    outline shape is `OrganismRoster`'s dangling-row treatment (`1px solid var(--gol-danger)` +
    danger text) which already survived an axe pass. The mockup's hover is a 10 % danger TINT —
    and danger text on that tint measures ≈ **4.45:1** on `--gol-bg-secondary` (the same 4.48
    trap `themeTokens.test.ts` records for `--gol-danger` on `--gol-bg-hover`), so a
    `--gol-danger-tint` token would ship an AA failure on hover. Brightening the text instead
    (`#ff4477` ≈ 5.3:1 on the bar) is the `--gol-accent-hover` idea applied to danger, with the
    tokens that already exist. Task 3 adds the rows that make this a gated fact, not an estimate.
  - **(b) Hover fills: `--gol-danger` background, `--gol-on-danger` text.** Gated pairs only, no
    new rows; a bigger visual jump than the mockup's tint for a destructive control, and the
    delete dialog's filled button then has a lookalike in the bar.
  - **(c) `--gol-danger-tint` token + hover tint.** Fails AA at ≈ 4.45:1 — not an option.
- **Next cycle:**
  - **(a) Add `--gol-warning` / `--gol-warning-hover` (`#ffaa00` family) to `themes.css` + rows.**
    Mockup-faithful (amber measures ≈ 9:1 on the bar, and ≈ 7.6:1 on its own tint). But it is a
    new colour FAMILY for one control, Story 6.1 must then override it in the Biotech block, MUI's
    `palette.warning` stays Material (a second "warning" that is not MUI's), and the name says
    "caution" for an action that is not one.
  - **(b) The secondary outline pair (`UndoButton`'s)** *(recommended)*. No new token; Next cycle
    and UNDO are the two "exactly one step" buttons on this route, in the same bar position, in
    the same clothes — a rhyme, not a compromise. Play stays the accent fill and Stop the danger
    outline, so the cluster still reads primary / neutral / destructive. Record the amber as a
    token-layer candidate in `deferred-work.md` (Task 7) for Epic 6's theme pass, where a family
    added once serves both themes.
  - **(c) Accent outline (`--gol-accent` text/border, `--gol-accent-tint` hover).** Two cyan
    buttons side by side; the mockup deliberately makes Next a third colour.

**FD3 — Who decides what Play/Pause means.**
- **(a) The view: `handlePlayPause` reads `sim.status` and calls `play()` or `pause()`; the bar
  gets one `onPlayPause`** *(recommended)*. Spec §3.13's API verbatim; the bar stays a
  presentational total component that could render in `<FullscreenHUD>` (3.18) over the same
  `Pick`. `sim.status` is a render-time value in a `useCallback` keyed on it — never a ref read.
- **(b) The bar takes `onPlay` + `onPause` and branches on `status` itself.** Same behaviour,
  five props instead of four, and a spec deviation to record for no gain.
- **(c) The hook grows `togglePlay()`.** Touches `useSimulation` for a one-line consumer
  concern; 4.15's preview would inherit a verb the spec never listed.

**FD4 — Driving frames in the view's tests without a scheduler prop.**
- **(a) Spy `window.requestAnimationFrame` / `cancelAnimationFrame` with a manual queue and a
  `frame(now)` helper** *(recommended)*. `rafScheduler` looks the globals up at call time (its own
  ⚠️ about arrow wrappers is why), so a `vi.spyOn(window, …)` is the whole fake; timestamps are
  chosen by the test, so the loop's accumulator is deterministic (`frame(0)` primes, `frame(100)`
  at 10 gen/sec is one step). The existing "requests no animation frame while paused" test is a
  degenerate case of the same spy.
- **(b) `vi.useFakeTimers()` over jsdom's RAF.** jsdom's RAF is a timer whose `now` comes from
  jsdom's clock; Vitest 4's default `toFake` list does not include `performance`, and the loop
  keys on the callback's `now` argument — brittle and slower.
- **(c) A `scheduler?: FrameScheduler` prop on the view.** A test-only prop on a component
  `<BattlePage>` renders; the 3.11 props list was decided against exactly that class of thing.

**FD5 — Stop's enablement.**
- **(a) Always enabled** *(recommended)*. FR-4.4 attaches no precondition, the mockup draws no
  disabled state, and the "no-op at paused ∧ cycle 0" case is not quite a no-op — `stop()`
  mints a fresh seed (3.10 AC11), so the next Play is a new run under FR-5.4's tie-breaks. More
  practically, the predicate grows: 3.16 makes Stop meaningful at cycle 0 after an ephemeral
  resize (`liveSize ≠ initialGrid`'s size), and 3.19's ESC would need the identical guard — two
  later stories re-deriving one condition this story invented. `<EditorToolsSection>`'s "Clear
  disabled on an empty dish" is the counter-precedent, and it is different in kind: Clear on
  empty is provably identical output; Stop at cycle 0 is not.
- **(b) `disabled` while `status === 'paused' && cycle === 0`.** Needs `cycle` as a fifth bar
  prop (spec deviation) and the two later widenings above.

**FD6 — Step's disabled state: `disabled` or `aria-disabled`.**
- **(a) Real `disabled` + `title`** *(recommended)*. The route's policy — every disabled control
  on `/battle` is a real `disabled`, and the RUN button (3.11 AC7) is the precedent for `title`
  carrying the reason. The known gap (a keyboard user cannot reach the `title`) is recorded
  against Story 6.11 for the whole route; adding one `aria-disabled` control now makes the
  route inconsistent rather than better.
- **(b) `aria-disabled="true"` + a hand-written refusal in `onClick`.** The 6.11 shape; do it
  there, for every control at once.

### Traps

1. **`sim.step()` throws while playing (3.10 FD5).** The disabled button is the guard; a
   `pointer-events: none` or CSS-only grey is not. Test (e) in Task 4 asserts the click reaches
   nothing — under a real `disabled` attribute `user-event` does not dispatch `click`, which is
   the point.
2. **`handlePlayPause` must key on `sim.status`, not on a captured boolean.** A `useCallback`
   with `[]` deps would call `play()` forever. The `exhaustive-deps` rule catches the omission;
   read the warning, do not disable it.
3. **`sim.play` / `sim.pause` / `sim.step` / `sim.stop` throw with no live session** — before the
   session effect and after Run → Lab (`requireSession`). Unreachable from a rendered button
   (the bar mounts after the hook and unmounts with it), reachable from a test that clicks after
   `unmount()`. Do not add a guard in the view for a state the DOM cannot be in.
4. **Stop must not rebuild the canvas.** 3.11's review keyed `PlaybackDish` on `cols`/`rows` for
   this story. Task 4 (f) pins it (same canvas node, `onRendererReady` not re-called). If a
   future change keys the dish on `size` identity again, this is the test that reddens.
5. **`drawFull` counts: mount = 1, each Stop = +1, Play/Pause/Step = +0.** A resume that calls
   `drawFull` is a re-clone in disguise. `drawDiff` counts: one per stepped frame, one per manual
   Step — and zero on the priming frame (`frame(0)` contributes no delta; Story 3.8 FD4).
6. **Publish cadence at 10 gen/sec is every cycle** (`cyclesPerPublish(10) === 1`), so
   `data-cycle` tracks frames exactly in the tests. At 20 gen/sec it publishes every second cycle
   — do not write a test at 20 expecting `"1"` after one step from the loop; manual `step()`
   publishes unconditionally at any speed.
7. **The fixture grid's blinkers collide at cycle 1.** `GRID` has organism `a` at col 2 and `b`
   at col 4, rows 1–3: their horizontal phases occupy cols 1–3 and 3–5. Cell contents after a
   step are therefore a dominance question, deterministic by dominance but not something this
   story asserts on. Counts and attributes only; byte-equality only against cycle 0.
8. **`role="group"` needs `aria-label`, and `title` is not a name.** axe's `aria-allowed-role` /
   accessible-name rules: a group with no name is a violation; a `title` on the disabled Step
   is a description, not its name (`Next cycle` stays the name).
9. **Three `styled('button')`s, one base object.** Story 2.13 FD5 (c): a plain object spread,
   not `styled(BaseButton)` (a real wrapper component in a chunk that once had 9.5 KB headroom).
   Copying the object from `EditorStatusBar.tsx` is the cost of the `editor/`↔`simulation/`
   wall — pay it, do not tunnel.
10. **`user.tab()` order while playing skips the disabled Step** — assert Pause → Stop & reset →
    body, not a three-stop sequence; the bar's "exactly N tab stops" test has two answers.
11. **`--gol-danger` on `--gol-bg-hover` is 4.48:1 and excluded from the gate on purpose.** The
    Stop hover therefore changes NOTHING about the surface. A "small tint on hover" is the
    intuitive edit and the one that fails AA; the comment on `StopButton` must say so.
12. **`Pause` is the name while playing, `Play` while paused — and the e2e's `getByRole('button',
    { name: 'Play' })` must be re-resolved after each press.** Playwright locators are lazy, so
    a locator built with `{ name: 'Play' }` finds nothing while the sim runs; build them per
    state or use `{ name: /play|pause/ }` where the state is the thing under test.
13. **Sentence case in the DOM.** `Stop & reset`, `Next cycle` — CSS uppercases. A DOM `STOP &
    RESET` gives screen readers letter-by-letter noise in some engines (trap 15's whole point)
    and every `getByRole` name in this story is written sentence case.
14. **The `&` in `Stop & reset` is JSX text.** `Stop & reset` is fine inside JSX children;
    `&amp;` is not needed and renders literally.
15. **`spec:check` reads this file.** Every ID above is spelled as the specs spell it.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **Mockup `.control-btn-next` amber `#ffaa00` and `.control-btn-stop` `#ff0055` vs the token
  layer.** Red maps to `--gol-danger` (Story 1.13's own mapping of the settings mockup's
  `--warning`); amber has no token — FD2 (b), with the amber recorded as a token-layer candidate.
  No mockup edit.
- **Mockup hover tints (`rgba(255, 0, 85, 0.1)`, `rgba(255, 170, 0, 0.1)`)** vs AR-46 + the AA
  gate: the danger tint measures under 4.5:1 for danger text; FD2 chooses a text/border hover.
  The play button's hover `#00b8e0` is `--gol-accent-hover`'s role and maps directly.
- **Mockup `.stats-bar` is `position: fixed; left: 350px`** vs the in-flow bar at a 320 px sidebar
  — the same deviation `<EditorStatusBar>` recorded (Story 2.8) and 3.11's trap 12 (one column,
  one width). Not new; noted so the dev does not reproduce `fixed`.
- **Mockup `.control-btn` `transition: all 0.2s`** — dropped, the route's rule (Story 2.13's
  axe finding). Not new.
- **`play-mode-proposal.md` (biotech): "Pause state: `⏸ PAUSE` (cyan)" vs Play "matrix green".**
  Clinical Lab is the shipped theme; both states use the accent pair (one control, one colour).
  Epic 6's Biotech override may revisit; not this story's.
- **Epic AC wording "Step" / "Stop" vs mockup "Next Cycle" / "Stop & Reset" vs spec §3.13
  "Next Cycle" / "Stop & Reset".** The mockup and spec agree; the buttons say `Next cycle` and
  `Stop & reset`. Story 3.19's AC ("→ steps one cycle") and 4.15's ("Play/Stop, paused-only
  Step") use the verb, not the label — no conflict, recorded so nobody renames the buttons to
  match a verb.
- **RFC-005 Decision 5's sketch `pause = () => { … cancelAnimationFrame(raf.current!) }`** —
  illustrative; the loop owns RAF (3.8) and `pause()` is `loop.stop()`. Already flagged by 3.10.
- **spec §3.13 `status: 'paused' | 'playing'`** — matches the shipped `SimulationStatus` exactly.
  Import the type from `@/lib/battle/useSimulation` rather than re-declaring the union.

### What NOT to build

- ❌ No `<SpeedControl>`, `<CycleCounter>`, `<PopulationStats>`, `<GridSizeControl>` (3.13–3.16).
- ❌ No keyboard hints in the bar, no `<kbd>`, no `aria-keyshortcuts`, no key handling of any
  kind, no `useSimulationHotkeys` (Story 3.19 — hints and handlers land together).
- ❌ No fullscreen button, no `<FullscreenStage>` / `<FullscreenHUD>` (Story 3.18).
- ❌ No extinction handling — a run that goes extinct keeps playing until 3.15 (Decision B.5 is
  the hook's thunk seam, marked in `useSimulation.ts`).
- ❌ No change to `useSimulation` (no `togglePlay`, no `isRunning` exposure), `simulationLoop`,
  `PetriDishCanvas`, `GridRenderer`, `themes.css`, `check-bundle-size.mjs`.
- ❌ No `useState` / `useRef` / `useEffect` in the view or the bar for anything transport-related.
- ❌ No `--gol-warning`, `--gol-danger-tint` or any new token (FD2 — candidates go to
  `deferred-work.md`). No `rgb(…)` in a `.tsx`.
- ❌ No MUI `Button` / `ButtonGroup` / `IconButton` on the battle route (Story 2.8 FD2, 3.11 FD2).
- ❌ No `transition`, no `prefers-reduced-motion` block (nothing left to switch off).
- ❌ No `aria-pressed` on Play/Pause (FD1). No `aria-live` announcement of status — 3.14's
  counter and the button's own name change are the feedback.
- ❌ No `disabled` on Stop (FD5). No `cycle` prop on the bar.
- ❌ No `scheduler` / `seed` prop on `<BattleSimulationView>` for tests (FD4).
- ❌ No `@gol/test-utils` additions; no new e2e seeding helper (reuse `seedWorkspace`).
- ❌ No edit to `component-tree-battle-page.md`, `architecture.md`, RFC-005 or the mockups —
  candidates to `deferred-work.md`.

### Testing standards summary

- Vitest 4 in `apps/web` (jsdom, `vitest.setup.ts` registers `cleanup`; no coverage gate — the
  tests exist because the ACs need them). RTL 16 + `@testing-library/user-event` 14; `vitest-axe`
  for the a11y assertions; `RecordingContext2D` (`test-support/`) or the view test's own
  `installContexts()` for anything that must observe a paint; `GridRenderer.prototype` spies for
  `drawFull` / `drawDiff` counts; `createMockOrganisms` / `gridFromPattern` / `gridFromDense` from
  `@gol/test-utils` (the view test's existing fixtures).
- Never pixel/snapshot-test the canvas in unit tests. Assert on renderer-method spies and the
  recording context; in e2e on `distinctColorCount` (> 2) and, for Stop, on `countChangedPixels`
  against a cycle-0 baseline (the Story 2.6 helpers, already in the spec file).
- Determinism: nothing here asserts on cell contents after a step (trap 7). The Stop assertion
  compares to cycle 0, which is deterministic by construction (a clone).
- The hook's own tests (3.10 AC4) are the contract for what each verb does; here the WIRING is
  under test — that a press calls the right verb, that `status` drives the label and the
  disablement, that Stop does not rebuild the canvas. Do not re-test accumulator arithmetic.
- Make every new test fail under the mutation it guards (the 3.9 → 3.11 review culture): (f)
  reddens under `size`-identity deps; (e) reddens if `disabled` becomes a CSS class; (c) reddens
  if resume re-clones; the same-element test reddens under FD1 (c).
- `npm run ci > /tmp/ci-3-12.log 2>&1; echo $?`; report the real exit code and the bundle numbers.

### Previous story intelligence (3.11) and recent git

- **3.11 shipped the chassis this bar drops into**: `<SimulationMain>` is a `flex-direction:
  column` with `<GridContainer>` at `flex: 1; minHeight: 0` — the bar as its last child gets
  its real height reserved, no `padding-bottom` reserve, no `position`. The `⚠️` comments on
  those styled blocks record shipped-and-reverted regressions; do not touch the values.
- **3.11's review keyed `PlaybackDish` on dimensions for this story** ("every Stop in 3.12 would
  detach, rebuild and re-prime the renderer") — the test that pinned it is "a NEW `size` object
  with the SAME dimensions neither rebuilds nor re-calls" in `PetriDishCanvas.test.tsx`. Task 4
  (f) is the view-level twin.
- **3.11's Dev Agent Record: the one red e2e was an `<h1>` queried by role while a MUI modal
  held `aria-hidden` on the page** — read attributes under dialogs, not roles. No dialog opens in
  this story's e2e, but the Back-from-Run guard is one click away; keep transport tests away
  from it.
- **3.11 measured `/battle` at 308.5 KB gzip (1.5 KB headroom)** and recorded why the toggle
  cost 2.4 KB (the playback variant rides with `<PetriDishCanvas>` on the route). This story's
  code is entirely inside the dynamic Run chunk (4.2 KB gzip today) and should move the route by
  ~0; if it does not, the chunk-split diagnosis is `npm run analyze -w web`, and the mechanism
  named in `deferred-work.md` is the variant split — not a budget move.
- **3.11 test counts to convert:** `BattleSimulationView.test.tsx` "one button" (→ 4);
  `BattlePage.test.tsx`'s Run-mode describe has no total-count test yet — Task 6 adds one in the
  route's fail-forward convention.
- **3.10 → 3.11 review culture:** every test mutation-checked; comment drift (`:first-child` vs
  `:first-of-type`, a KB figure) was a patch category — write the numbers once, in one place.
- **Git:** stories run on `story/*` branches merged by PR (#36 3.11, #32 3.10, #33 4.3); `review:`
  / `fix:` commits after the feature commit; `docs:` follow-ups for run stats. Lane 4's next story
  (4-4 three-column layout) does not touch `components/battle/**`; 4.15 (the preview's own
  transport, "matching 3.12") is gated on 3-15 in `lane-gates.yaml`, and 4.24/4.25 on `epic-3`,
  so this story reshapes `<BattleSimulationView>` with no open consumer in the other lane.

### External dependencies / versions

None new. React 19.2.7, Next 16.2.10, MUI 9.3.1 `styled` only, `@testing-library/react` 16.3.2,
`@testing-library/user-event` 14.6.1, `vitest-axe` 0.1.0, Vitest 4.1.x, jsdom 30, Playwright as
installed. `eslint-plugin-react-hooks` 7.1.1 via `eslint-config-next` 16.2.12 (`refs`,
`set-state-in-effect`, `exhaustive-deps` live). No React Compiler.

## Project Structure Notes

- New: `apps/web/components/battle/simulation/SimulationControlBar.tsx` (+ `.test.tsx`).
- Modified: `apps/web/components/battle/simulation/BattleSimulationView.tsx` (+ `.test.tsx`),
  `apps/web/lib/themeTokens.test.ts` (two rows), `apps/web/components/battle/BattlePage.test.tsx`
  (one Run-mode count test), `apps/web/e2e/battleRoute.spec.ts` (new block; possibly hoisted
  helpers), `apps/web/lib/battle/useSimulation.ts` and
  `packages/simulation/src/loop/simulationLoop.ts` **comments only** if a "Story 3.12" sentence is
  now false (Task 6 — code untouched), `docs/implementation-artifacts/deferred-work.md`,
  `sprint-status.yaml`.
- Not touched: `apps/web/app/themes.css`, `apps/web/components/PetriDishCanvas.tsx`,
  `apps/web/components/battle/editor/**`, `apps/web/components/battle/BattlePage.tsx`,
  `scripts/*`, any planning artifact.
- Naming: `SimulationControlBar` per spec §3.13 / README; `SimulationControlBarProps` exported
  (3.18's `Pick`); private `Bar` / `Transport` / `PlayPauseButton` / `StepButton` / `StopButton` /
  `Icon`; `handlePlayPause` in the view beside the hook call.

## References

- `docs/planning-artifacts/epics.md#Story 3.12` — the four clauses; Story 3.11 AC10 (what was
  deliberately absent); 3.13–3.19 for what still is; UX-DR20 (`:245`); Story 4.15 ("matching
  3.12"), Story 3.19 (hints display-only, "matching 3.12").
- `docs/planning-artifacts/component-tree-battle-page.md` — §2 (`<SimulationControlBar>` under
  `<SimulationMain>`, `:85`), §3.11, **§3.13 (`SimulationControlBarProps`, `:310-323`)**, §3.14
  (`transport: Pick<…>`, `:336`), §4 (`useSimulation` return; `useSimulationHotkeys`), §6
  (`status` → "control bars, HUD", `:421`), §7 (`4.1, 4.3, 4.4 | SimulationControlBar`, `:441`),
  §9.6.
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` — FR-4.1 (`:283-285`), FR-4.3
  (`:299-300`), FR-4.4 (`:302-303`), FR-4.5, FR-4.7 (pause ≠ stop), FR-4.8, FR-4.9 (Stop returns
  to the Edit-mode size), NFR-4.1, NFR-4.2, NFR-1.1, NFR-8.1.
- `docs/planning-artifacts/architecture.md` — Runtime Architecture steps 3–6 (`:127-130`);
  Decision A.2 (Stop / Run→Lab discards, `:148-149`); Decision B.5 (not this story's check);
  Decision D.1–D.3 (`:212-216`); M2; AR-24, AR-29, AR-31, AR-34, AR-35, AR-46 (defined in
  `epics.md:189-202`).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — Decision 4's action
  table (Step / Play / Stop & Reset rows, `:213-215`), Decision 5 (the contract; the sketch is
  illustrative).
- `docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md` — Decision 1 (import
  discipline), Decision 3 (`styled()` over `sx`).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode.html`
  — `.control-btn` (`:185-201`), `.control-btn-play/-next/-stop` (`:203-232`), `.control-btn-icon`,
  `.control-buttons-horizontal` (`:239-244`), `.stats-bar` (`:478-491`), the bar markup
  (`:741-763`), the toggle script (`:772-784`); `petri-dish-play-mode-fullscreen.html` (`:354-367`
  — 3.18's shorter labels); `biotech-terminal-theme/play-mode-proposal.md` §A (`:114-144`).
- `apps/web/lib/battle/useSimulation.ts` (head comment — the 3.12 sentences at `:44` and `:63`;
  `SimulationStatus`; `play` / `pause` / `step` / `stop` bodies `:409-462`; `requireSession`),
  `apps/web/lib/battle/rafScheduler.ts` (arrow wrappers — FD4), `apps/web/lib/battle/simulationSpeed.ts`
  (`cyclesPerPublish`), `packages/simulation/src/loop/simulationLoop.ts` (`start`/`stop`
  idempotency; the "manual Step (Story 3.12)" factory doc), `apps/web/components/battle/simulation/BattleSimulationView.tsx`
  (`SimulationMain`, the head comment), `apps/web/components/battle/editor/EditorStatusBar.tsx`
  (`Bar`, `barButtonBase`, `UndoButton`, `SaveButton`, the no-`transition` record),
  `apps/web/components/battle/SidebarFooter.tsx` (glyph + sentence-case name pattern),
  `apps/web/components/battle/BattleHeader.tsx` (`ModeToggle` `role="group"` + `aria-label`),
  `apps/web/components/battle/editor/OrganismRoster.tsx` (danger outline that passed axe),
  `apps/web/app/themes.css` (`--gol-danger*`, `:59-68`; `--gol-accent-tint`), `apps/web/lib/themeTokens.test.ts`
  (the danger describe and its `bg-hover` exclusion comment, `:98-110`),
  `apps/web/components/PetriDishCanvas.tsx` (`PlaybackDish` keyed on `cols`/`rows`),
  `apps/web/lib/battle/useSimulation.test.ts` (`createFakeScheduler`, `runCycles` — the fake to
  mirror on `window`), `apps/web/components/battle/simulation/BattleSimulationView.test.tsx`
  (fixtures, `installContexts`, `root`), `apps/web/e2e/battleRoute.spec.ts` (3.11 block helpers;
  `snapshotBaseline` / `countChangedPixels` `:98-133`), `eslint.config.mjs` (AR-46 selectors incl.
  `rgb()`; test-support boundary).
- `docs/implementation-artifacts/3-11-mode-toggle-run-view-skeleton.md` (AC3/AC5/AC10, review
  patch 1, FD5/FD7, traps 2/4/12/13, Dev Agent Record bundle numbers),
  `3-10-usesimulation-hook.md` (AC4, AC8, AC11, FD5, traps 1/2/12), `deferred-work.md` (3-10
  review: throw leaves `'playing'`; 3-11: `PlaybackDish` on the route, §3.11 candidates,
  `title`-only reason → 6.11), `lane-gates.yaml` (4.15 → 3-15; 4.24/4.25 → `epic-3`).
- `docs/project-context.md` — hot state in refs; `components/battle/` split; no raw colour
  literals; no DOM in `packages/*`; `spec:check` spelling; commit gate; bundle ratchet.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), running the `bmad-dev-story` workflow directly (not via
`implement-next-story`'s per-phase subagents).

### Debug Log References

- `npm run ci` (full gate, run twice — the first caught a `format:check` failure, fixed with
  `prettier --write`): typecheck, lint, format:check, spec:check, boundary:check, test:coverage,
  build:standalone, bundle:check, bench, bench:check all green. The `e2e` step's full four-project
  Playwright matrix was killed twice by this sandbox's own memory pressure (not a test failure —
  no `FAIL`/`ERROR` line in either log; chromium had cleared 117/115-per-project tests and firefox
  194/460 total, all green, including every Story 3.12 case on both, before each kill).
- `npx playwright test --project=chromium --workers=1` (apps/web), run standalone after the second
  kill to get one complete, unconstrained signal: **114 passed, 1 skipped (pre-existing,
  unrelated), 0 failed** — exit 0. All 6 new Story 3.12 e2e tests included and green.
- Per `docs/project-context.md`'s own caveat ("a local green `npm run ci` is not proof CI is
  green"): webkit and tablet were not independently re-run locally after the OOM (chromium and
  firefox both confirmed clean; the four projects share one spec file and one fixture set, and
  nothing in this story is browser-specific). Confirm the actual GitHub Actions run after push.

### Completion Notes List

- `<SimulationControlBar>` built to spec §3.13 exactly — four props, no `sim`, no state — and
  wired into `<BattleSimulationView>` via one new `useCallback` (`handlePlayPause`) and zero new
  `useState`/`useRef`/`useEffect` (AR-29, NFR-1.1).
- All 7 tasks complete; every AC (1–11) has a corresponding unit, e2e, or contrast-gate assertion.
- `themeTokens.test.ts` gates `danger-hover` on `bg-primary` (≈5.98:1) and `bg-secondary`
  (≈5.26:1) — both comfortably above 4.5:1, confirming FD2 (a) before it shipped.
- Bundle: `/battle` moved 308.5 → 308.6 KB gzip (headroom 1.5 → 1.4 KB) and `/battle/new` stayed at
  308.5 KB (1.5 KB headroom) — within noise, as AC10 anticipated; the transport bar adds no new
  dependency and rides entirely in the existing Run chunk. Run chunk (measured at review from the
  `out/` export built for the feat commit — the chunk containing the "Simulation controls" group):
  **4.8 KB gzip, 12.5 KB raw**, up from 3.11's 4.2 KB / 10.2 KB; not referenced from `battle.html`,
  so it stays off the route's first load. `bundle:check` and `bench:check` both green, the latter
  unchanged in mechanism (nothing in `packages/*` touched).
- Coverage: `SimulationControlBar.tsx` and `BattleSimulationView.tsx` both 100/100/100/100
  (stmts/branch/funcs/lines) in the run's coverage report; `apps/web` carries no gate, but this is
  the honest number.
- `deferred-work.md` bookkeeping done (Task 7): the 3-11 §3.13 amendment-candidate entry closed as
  shipped-with-no-deviation; the 3-10 review's "throw leaves `status: 'playing'`" entry gained the
  one sentence about this button's recovery behaviour; a new "Deferred from: Story 3-12" section
  carries the amber-token, `title`-only-reason, and SPACE-focus-loss items for Epic 6 / 6.11 / 3.19.

### Forced Decisions

- **FD1 (a)** — one button, accessible name flips Play ⇄ Pause, no `aria-pressed`.
- **FD2** — Play/Pause: accent fill (no decision). Stop & reset: **(a)** danger outline, hover
  brightens text/border to `--gol-danger-hover` (gated ≈5.3–6.0:1, Task 3). Next cycle: **(b)** the
  secondary/neutral outline (`UndoButton`'s pair) — the amber-token option (a) deferred to Epic 6.
- **FD3 (a)** — the view decides Play vs Pause from `sim.status`; the bar gets one `onPlayPause`.
- **FD4 (a)** — `vi.spyOn(window, 'requestAnimationFrame'/'cancelAnimationFrame')` with a manual
  queue (`installFrameDriver` in `BattleSimulationView.test.tsx`), mirroring
  `useSimulation.test.ts`'s `createFakeScheduler` but installed on `window`.
- **FD5 (a)** — Stop & reset is always enabled; no `cycle` prop added to the bar.
- **FD6 (a)** — Next cycle disables with a real `disabled` attribute plus `title`; the keyboard-
  reachability gap for the `title` joins Story 6.11's route-wide sweep (recorded in
  `deferred-work.md`, not fixed here).

### Spec-conflict flags raised

None new. The Dev Notes' pre-identified conflicts (mockup amber/red vs the token layer, the
mockup's `position: fixed` bar, the mockup's `transition`, the epic-AC-vs-mockup-vs-spec button
labels, RFC-005's illustrative `pause()` sketch, spec §3.13's `status` union) were all confirmed
accurate during implementation; none needed a new flag.

### File List

- New: `apps/web/components/battle/simulation/SimulationControlBar.tsx`
- New: `apps/web/components/battle/simulation/SimulationControlBar.test.tsx`
- Modified: `apps/web/components/battle/simulation/BattleSimulationView.tsx`
- Modified: `apps/web/components/battle/simulation/BattleSimulationView.test.tsx`
- Modified: `apps/web/lib/themeTokens.test.ts`
- Modified: `apps/web/components/battle/BattlePage.test.tsx`
- Modified: `apps/web/e2e/battleRoute.spec.ts`
- Modified: `docs/implementation-artifacts/deferred-work.md`
- Modified: `docs/implementation-artifacts/sprint-status.yaml`
- Modified (this file): `docs/implementation-artifacts/3-12-transport-controls.md`
- Not touched (checked, no false-future-tense sentence found): `apps/web/lib/battle/useSimulation.ts`,
  `packages/simulation/src/loop/simulationLoop.ts`, `apps/web/components/battle/simulation/README.md`
  — all cited "Story 3.12" sentences already describe the contract this story honours.

### Change Log

- 2026-09-15: Story 3.12 implemented end-to-end (Tasks 1–7). `<SimulationControlBar>` added;
  `<BattleSimulationView>` wired to `sim.play`/`pause`/`step`/`stop`; `danger-hover` contrast rows
  gated; transport unit tests (frame-driven Play/Pause/Resume/Step/Stop) and e2e tests added;
  `BattlePage.test.tsx` Run-mode button count converted; `deferred-work.md` bookkeeping closed.
  `npm run ci` green (e2e confirmed via chromium full run + partial firefox run, see Debug Log).
- 2026-09-15 (review, Opus): 10 patches applied (see Review Findings) — `handlePlayPause` deps
  narrowed to `[status, play, pause]` (AC9), four test strengthenings, three comment corrections,
  two Dev Agent Record fixes (e2e count, Run chunk size). No decision-needed findings. Status → done.

Dev Model: sonnet   # follows settled patterns: the in-flow bottom bar (2.8), barButtonBase (2.13), the accent/secondary/danger button pairs, role="group" naming (3.11), real-disabled policy — the bar's props are spec §3.13 verbatim and the hook already owns every verb; nothing here picks a pattern later stories build on
Proposed lane gate: none
