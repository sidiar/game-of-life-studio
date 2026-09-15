---
baseline_commit: 14ac287fca18a89ea29d35a2c3ee264325665b4f
---

# Story 3.13: Speed Control

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to change simulation speed on the fly,
so that I can slow down to study or speed up to fast-forward.

## Acceptance Criteria

From `epics.md#Story 3.13`, decomposed into what a reviewer can check independently. The
semantics already exist and are tested: `useSimulation.setSpeed` (Story 3.10 AC7) is the ref-write
AR-34 asks for, the loop reads `msPerCycleRef` live every frame (Story 3.8 AC4, including the
downward-change accumulator cap), and the hook publishes `genPerSec` as React state (3.10 FD6 —
"the hook is the only holder of `msPerCycle`; without it Story 3.13 mirrors state that can drift
from a ref"). What does **not** exist is the control: the first Run-sidebar section, a detented
slider over the ladder, the wiring from `sim.genPerSec` / `sim.setSpeed`, a runtime ladder the
slider can index, and the tests that prove a slider move reaches the ref with no loop restart.
This story adds **no semantics to the hook** and **no state to the view**.

1. **`<SpeedControl>` renders as the first Run-sidebar section (spec §2, §3.12; FR-4.2).** New
   file `apps/web/components/battle/simulation/SpeedControl.tsx`, exported default, with exported
   `SpeedControlProps = { genPerSec: GenPerSec; onChange(v: GenPerSec): void }` — spec §3.12's two
   members, exactly (Story 4.15's preview panel and 3.18's `<FullscreenHUD>` reuse it, §7). It is
   rendered by `<BattleSimulationView>` inside `<SidebarContent>` wrapped in `<SidebarSection
   title="Speed">` — the Lab side's composition shape (`<BattleEditorView>` wraps every section
   the same way; the section owns the `<h2>`, the control never renders a heading). It is the
   ONLY child of `<SidebarContent>` this story; Story 3.14 inserts Population Analysis and Cycle
   Count ABOVE it and 3.16 adds Grid Size below (spec §2 order), so put it in with a comment that
   names that order rather than a placeholder for it.

2. **A detented slider over the ladder, defaulting to 10 (FR-4.2, Decision D.1, AR-34).** ONE
   `<input type="range">` with `min={0}`, `max={SPEED_LADDER.length - 1}`, `step={1}`, whose value
   is the ladder INDEX (the mockup's own scheme, `petri-dish-play-mode.html:652,786-790`) and whose
   accessible name is `Speed` (a visible `<label htmlFor>` reading "Generations per second" is
   the name's source — see FD2). `aria-valuetext` is `"${genPerSec} generations per second"` so
   a screen reader hears the speed, never the index. The default is whatever `genPerSec` arrives
   as — `<BattlePage>` passes `settings.defaultSpeed` (10 today; Story 6.9 makes it a setting) as
   `startingSpeed`, and the hook publishes it back as `sim.genPerSec`; the control is CONTROLLED
   by that prop (`value={speedIndex(genPerSec)}`), never by local state. The five ladder labels
   `1 2 5 10 20` render under the track (`.speed-presets`) `aria-hidden`, and the current value
   renders as `10 gen/s` in the label row (`.speed-value`), also `aria-hidden` — the slider's
   `aria-valuetext` already carries that fact, and a second announcement is the double-read
   `<GridSettingsSection>` avoids with the same attribute.

3. **The ladder has ONE runtime source, typed against the schema (AR-34).** `apps/web/lib/battle/
   simulationSpeed.ts` gains `export const SPEED_LADDER = [1, 2, 5, 10, 20] as const satisfies
   readonly GenPerSec[]` plus a type-level exhaustiveness check that fails `tsc` if the schema's
   union and this array ever disagree in EITHER direction (a member here the schema lacks fails
   `satisfies`; a schema member missing here fails the check — Task 1 has the shape), and
   `export function speedIndex(genPerSec: GenPerSec): number` (the ladder position, `3` for 10).
   `simulationSpeed.test.ts` pins: strictly ascending, `msPerCycle` of every member in `[50, 1000]`
   (Decision D.2's band — the loop trusts it), `speedIndex` round-trips every member, and
   `SPEED_LADDER[speedIndex(v)] === v`. Story 6.9's settings control imports the same constant.

4. **A slider move applies live via the ref-write — no loop restart, no visual stutter (AR-34,
   FR-4.2 "without pausing").** `onChange` is `sim.setSpeed` passed STRAIGHT THROUGH (it is
   `useCallback`-stable with `[]` deps, 3.10). While `status === 'playing'`, moving the slider:
   calls `setSpeed` once per detent crossed, `data-status` stays `"playing"`, `cancelAnimationFrame`
   is NOT called, exactly one frame stays pending (the same chain), `drawFull` is not called (no
   re-clone — a speed change is not a Stop), and the NEXT frame steps at the new period (at 20
   gen/sec a `frame(now + 50)` is one cycle where it was half a cycle at 10). Moving it while
   paused changes `sim.genPerSec` and requests NO frame; the next Play runs at the new speed.
   `data-cycle` is unaffected by a speed change in either status.

5. **Tick rate stays decoupled from render rate (AR-24, Decision D.3); 20 gen/sec = 50 ms ≥ one
   frame (AR-34, D.2).** Nothing here touches the loop — the decoupling is Story 3.8's and its
   tests are the contract. What THIS story pins is the boundary: `SPEED_LADDER`'s maximum is 20
   and `msPerCycle(20) === 50` (AC3's band test), so the slider can never select a period under one
   60 FPS frame; and the AC4 view test at 20 gen/sec asserts one step per 50 ms frame, never two
   (the loop's `if`, not `while` — 3.8 FD3). Trap 1 (publish parity at 20) is what makes that test
   correct as written.

6. **Tokens only, contrast gated, no motion (AR-46, NFR-8.1; Story 2.13's bar rule).** The track
   is `--gol-border-control` (NOT the mockup's `var(--border)` — the same SC 1.4.11 substitution
   `<BattleNameField>`, `<OrganismRoster>` and `<GridSettingsSection>` each record: a 6 px track is
   the control's only boundary, and `--gol-border` on `--gol-bg-primary` is 1.57:1), the thumb
   `--gol-accent`, the value `--gol-accent` at 14px/600, the label and ladder marks
   `--gol-text-secondary` — every pair already a gated row in `themeTokens.test.ts` (`accent` /
   `text-secondary` on `bg-primary` under text pairs; `border-control` / `accent` on `bg-primary`
   under control pairs). No new token, no new contrast row, no raw hex and no `rgb()` in the
   `.tsx`. `:focus-visible` `2px solid var(--gol-accent)` at `outlineOffset: 2px` on the input.
   **No `transition`** (three stories on this route lost one to a mid-fade axe scan;
   `EditorStatusBar.tsx`'s comment block is the record). No `box-shadow` (the editor mockup's
   dominance thumb has an `rgba(…)` glow — not this control's, and AR-46 catches it anyway).

7. **Keyboard-operable and axe-clean in every state (UX-DR17, NFR-4.1).** Tab order in the Run
   sidebar is: slider → Back to Battles (the footer is the LAST child of the sidebar); the slider
   is reached BEFORE the transport bar in document order (sidebar precedes main). ArrowRight /
   ArrowUp move one detent up, ArrowLeft / ArrowDown one down, Home → 1 gen/sec, End → 20 — all
   native, none re-implemented (Trap 2: jsdom does not drive a range input's keyboard behaviour,
   so those are e2e assertions; unit tests use `fireEvent.change`). `vitest-axe` passes on the
   control at every ladder position and on the whole `<BattleSimulationView>` paused and playing
   with the section present; the e2e runs `AxeBuilder` on the route in Run mode after a slider
   move while PLAYING.

8. **The view stays a hook consumer, not a state owner (RFC-005 Decision 5, AR-29, NFR-1.1).**
   `<BattleSimulationView>` adds NO `useState`, no ref, no effect, no `useCallback` — it reads
   `sim.genPerSec` and passes `sim.setSpeed` through. `genPerSec` changes on user action only, so
   the control receives nothing that changes per cycle. The control itself is presentational and
   total: no hook, no state, no repository; its one derivation is `speedIndex(genPerSec)` and its
   one handler maps the event's index back through `SPEED_LADDER`.

9. **The engine chunk stays off the route's first load (AR-35, 3.11 AC8).** The control is
   imported only by `<BattleSimulationView>` (behind `next/dynamic`) and imports nothing new —
   `SidebarSection` is already on the route (Lab renders four), `simulationSpeed.ts` already rides
   in the Run chunk. `bundle:check` passes with `check-bundle-size.mjs` unchanged; the Dev Agent
   Record reports `/battle`'s measured first-load gzip (expected: unchanged from 308.6 KB within
   noise, 1.4 KB headroom) and the Run chunk's new size (4.8 KB gzip after 3.12). If `/battle`
   moves by more than noise, say why — `deferred-work.md`'s 3-11 entry names the next mechanism
   (split the `PetriDishCanvas` variants), never the threshold.

10. **Gates hold.** `npm run ci` exits 0: nothing in `packages/*` (coverage floors untouched);
    `spec:check` resolves every ID cited here and in code; `bench:check` unchanged (nothing on
    the benchmarked path). Count tests this story is written to flip are converted, not deleted
    (Task 6). `deferred-work.md` entries that name this story or the speed control are closed or
    corrected with a reason (Task 7).

## Tasks / Subtasks

- [x] **Task 1 — `SPEED_LADDER` and `speedIndex`** (AC3, AC5)
  - [x] `apps/web/lib/battle/simulationSpeed.ts`: add, after `GenPerSec`,
    ```ts
    export const SPEED_LADDER = [1, 2, 5, 10, 20] as const satisfies readonly GenPerSec[];
    // Both directions at compile time: `satisfies` rejects a member the schema lacks; this rejects
    // a schema member the ladder lacks. The schema stays the authority (the head comment); this
    // array is only the ORDER a slider needs.
    type MissingFromLadder = Exclude<GenPerSec, (typeof SPEED_LADDER)[number]>;
    const _ladderIsExhaustive: MissingFromLadder extends never ? true : never = true;
    void _ladderIsExhaustive;
    export function speedIndex(genPerSec: GenPerSec): number { … }
    ```
    (`indexOf` over the readonly tuple; typed input means it is always found — no `-1` branch
    to test into existence.) Extend the head comment's list of consumers: the transport control
    (Story 3.13) and the settings page (Story 6.9) both index THIS array. Check the `no-unused-vars`
    configuration tolerates the `_`-prefixed check or use the `void` form above — pick whichever
    lints clean without a disable comment.
  - [x] `simulationSpeed.test.ts`: the four pins in AC3 (ascending; `50 <= msPerCycle(v) <= 1000`
    for every member — cite Decision D.2; `speedIndex` round trip; `SPEED_LADDER.length === 5` is
    NOT a pin — the exhaustiveness check owns that).

- [x] **Task 2 — `<SpeedControl>`** (AC1, AC2, AC6, AC7, AC8; FD1, FD2, FD3)
  - [x] New `apps/web/components/battle/simulation/SpeedControl.tsx` (`'use client'`). Head
    comment: spec §3.12's responsibility line (detented slider over the ladder; live during
    playback via ref-write, no loop restart), that it is presentational and total (the
    `<SimulationControlBar>` shape: no hook, no state, no `sim`), that the value is a ladder INDEX
    (FD1) and why `aria-valuetext` is therefore mandatory, and the native-vs-MUI decision (FD1)
    with the `deferred-work.md` MUI Slider fact it rests on.
  - [x] Styled blocks (values from the mockup, `petri-dish-play-mode.html:246-306`):
    `Control = styled('div')` (`display: flex; flexDirection: column; gap: 12px` — `.speed-control`);
    `LabelRow = styled('div')` (`display: flex; justifyContent: space-between; alignItems: center`);
    `Label = styled('label')` (`fontSize: 11px; color: var(--gol-text-secondary); textTransform:
    uppercase; letterSpacing: 0.5px` — `.speed-label`, as a real `<label htmlFor>`; DOM text
    sentence case "Generations per second", CSS uppercases — trap 15 of 3.12);
    `Value = styled('span')` (`fontSize: 14px; color: var(--gol-accent); fontWeight: 600`);
    `Slider = styled('input')` — `width: 100%; height: 6px; margin: 0; background: var(--gol-border-
    control); borderRadius: 3px; appearance: none; WebkitAppearance: none; cursor: pointer`, with
    `'&::-webkit-slider-thumb'` and `'&::-moz-range-thumb'` (`appearance: none` / `WebkitAppearance:
    none`; `width: 16px; height: 16px; background: var(--gol-accent); borderRadius: 50%; border: 0`),
    `'&::-moz-range-track'` (`height: 6px; background: var(--gol-border-control); borderRadius:
    3px` — Firefox paints its own track unless this is set; the input's `background` alone is
    WebKit/Blink-only), and `'&:focus-visible'` (`outline: 2px solid var(--gol-accent);
    outlineOffset: 2px`). ❌ No `transition`, no `box-shadow`, no `position`, no `rgb(`.
    `Marks = styled('div')` (`display: flex; justifyContent: space-between; fontSize: 10px; color:
    var(--gol-text-secondary); letterSpacing: 0.5px; marginTop: -5px` — `.speed-presets`).
  - [x] Render:
    ```tsx
    const id = useId();
    <Control>
      <LabelRow>
        <Label htmlFor={id}>Generations per second</Label>
        <Value aria-hidden="true">{genPerSec} gen/s</Value>
      </LabelRow>
      <Slider id={id} type="range" min={0} max={SPEED_LADDER.length - 1} step={1}
              value={speedIndex(genPerSec)}
              aria-valuetext={`${genPerSec} generations per second`}
              onChange={(e) => onChange(SPEED_LADDER[Number(e.currentTarget.value)])} />
      <Marks aria-hidden="true">{SPEED_LADDER.map((v) => <span key={v}>{v}</span>)}</Marks>
    </Control>
    ```
    The `onChange` index is always in range for a native range input with these attributes, and
    `tsconfig.base.json` does NOT enable `noUncheckedIndexedAccess` (checked 2026-09-15), so the
    tuple lookup types as `GenPerSec` with no guard and no `!`. Do not add a runtime range check
    for a state the element cannot be in. React's `onChange` on a range input fires on every
    `input` event (each detent crossed during a drag), which is what "live during playback" means.
  - [x] `SpeedControl.test.tsx` beside it (`renderControl(overrides)` helper defaulting to
    `genPerSec: 10` and a `vi.fn()` — `SimulationControlBar.test.tsx`'s shape): one slider named
    `Generations per second` with `value` `"3"`, `min` `"0"`, `max` `"4"`, `step` `"1"`,
    `aria-valuetext` `"10 generations per second"`; `it.each(SPEED_LADDER)` renders each value at
    its index with its valuetext and the visible `N gen/s` text; `fireEvent.change(slider, {
    target: { value: '4' } })` calls `onChange` once with `20` and nothing else; value `'0'` → `1`;
    the control is CONTROLLED — after a change with a parent that does not update the prop, the
    slider still reads `"3"` (a `rerender` with `genPerSec: 20` moves it to `"4"`); the label is
    a real `<label>` associated by `for`/`id` (`getByLabelText('Generations per second')` finds the
    slider); the five marks render `aria-hidden`; `axe` at index 0, 3 and 4 (the series-with-
    `unmount` pattern). ⚠️ Trap 2: do NOT write `user.keyboard('{ArrowRight}')` expecting the value
    to move — jsdom does not implement range keyboard stepping; that lives in Task 5.

- [x] **Task 3 — Wire the section into `<BattleSimulationView>`** (AC1, AC4, AC8)
  - [x] `BattleSimulationView.tsx`: import `SidebarSection from '../SidebarSection'` (root-level,
    shared — README's list) and `SpeedControl from './SpeedControl'`. Inside `<SidebarContent>`:
    `<SidebarSection title="Speed"><SpeedControl genPerSec={sim.genPerSec} onChange={sim.setSpeed}
    /></SidebarSection>` with a comment: spec §2's order is Population Analysis (3.14), Cycle Count
    (3.14), Speed, Grid Size (3.16) — 3.14 inserts ABOVE, 3.16 below; `sim.setSpeed` is
    `useCallback`-stable with no deps (3.10) so it is passed straight through; the title is
    "Speed", not the mockup's "Speed Multiplier" (FD3).
  - [x] Rewrite `SidebarContent`'s "Rendered EMPTY this story" comment (it now holds one section;
    keep the sentence about pinning the footer) and the head comment's "Deliberately ABSENT, by
    story" list: drop `<SpeedControl>` (3.13), keep the rest. Nothing else in the file changes —
    no new hook, state, or callback (AC8).

- [x] **Task 4 — `<BattleSimulationView>` speed tests** (AC4, AC5, AC7, AC8)
  - [x] `BattleSimulationView.test.tsx`, new `describe('BattleSimulationView — speed control (Story
    3.13)')`, driving frames with the existing `installFrameDriver()` (3.12 FD4) and
    `installContexts()` where a paint is observed; `GridRenderer.prototype` spies for `drawFull` /
    `drawDiff`:
    (a) Mounts with the slider at index 3 and valuetext "10 generations per second" when
    `startingSpeed: 10`; with `startingSpeed: 2` at index 1 (the prop reaches the control through
    the hook's `genPerSec`, not directly — assert on the slider, which is the only observable).
    (b) Live change while playing: click `Play`, `frame(0)` (prime), `frame(100)` → `data-cycle`
    `"1"`; `fireEvent.change(slider, { target: { value: '4' } })` → slider reads `"4"`,
    `data-status` still `"playing"`, `cancelAnimationFrame` NOT called, exactly one frame pending
    (the SAME handle as before the change — capture `driver.lastHandle()` before and compare),
    `drawFull` still at its mount count, `data-cycle` still `"1"`. Then `frame(150)` → cycle 2
    (published — even), `frame(200)` → cycle 3 (NOT published at 20: `data-cycle` still `"2"`,
    Trap 1), `frame(250)` → `"4"`. `drawDiff` advanced once per stepped frame regardless of
    publish (the loop repaints every step; publish is React only).
    (c) Downward change while playing: at 10 gen/sec after two 100 ms frames, change to `'0'` (1
    gen/sec); `frame(now + 100)` → NO step (the accumulator was capped against the new 1000 ms
    period — 3.8 FD3), `frame(now + 1000)` → exactly one step. Assert via `drawDiff` count and
    `data-cycle` (every cycle publishes at 1 gen/sec).
    (d) Change while paused: `fireEvent.change` to `'4'` → no frame requested, `data-status`
    `"paused"`, `data-cycle` `"0"`; click `Play`, `frame(0)`, `frame(50)` → `data-cycle` `"0"`
    (cycle 1 unpublished at 20), `frame(100)` → `"2"`.
    (e) Stop does not reset the speed: change to `'4'`, click `Stop & reset` → slider still `"4"`
    (the hook's `stop()` touches buffers, seed and cycle, never `genPerSec` — assert it, because
    the intuitive "reset everything" edit is one line away in the hook and this is the test that
    reddens).
    (f) `axe` on the container paused and playing with the section present.
  - [x] Convert `it('renders the footer’s Back button and the transport bar: four buttons, no h2,
    no slider')`: buttons stay `4`; `queryAllByRole('heading', { level: 2 })` `0` → `1` named
    `Speed`; `queryByRole('slider')` null → one slider named `Generations per second`. Rewrite its
    comment: speed is here now; counter/stats (3.14) and grid size (3.16) are still absent —
    written so 3.14's two headings and 3.16's second slider fail it and convert it.

- [x] **Task 5 — e2e** (AC2, AC4, AC7)
  - [x] `apps/web/e2e/battleRoute.spec.ts`, new `test.describe('Speed control (Story 3.13)')` on
    Three-Way Skirmish (`MOCK_BATTLE_IDS.battleA`, the 3.11/3.12 choice). Reuse the module-scope
    `runButton`, `dish`, `sidebarHeadings`, `collectErrors`, `seedWorkspace`. Add nothing to
    `@gol/test-utils`. A `speedSlider = (page) => page.getByRole('slider', { name: 'Generations
    per second' })` helper at module scope beside the others, with a comment naming this story
    (3.16's Grid Size slider will need `{ name: … }` to stay unambiguous — say so).
    (a) Default and section: enter Run → `sidebarHeadings(page)` has text `['Speed']`; the slider
    has value `"3"` and `aria-valuetext` "10 generations per second"; `10 gen/s` is visible.
    (b) Keyboard (real browsers, Trap 2): focus the slider; `End` → value `"4"`, text `20 gen/s`;
    `Home` → `"0"`, `1 gen/s`; `ArrowRight` → `"1"`, `2 gen/s`; `ArrowLeft` → `"0"`. Tab from the
    slider lands on `Back to Battles`.
    (c) Live change while playing: click `Play`, wait for `data-cycle ≠ "0"`, `speedSlider.fill('4')`
    (Playwright drives range inputs through `fill` — dispatches `input` and `change`) →
    `[data-status="playing"]` still, `20 gen/s`, and `data-cycle` keeps growing (read twice ≥ 300 ms
    apart, second > first). Then `fill('0')` → still playing; read `data-cycle` twice 400 ms apart
    and assert the difference is `<= 1` (1 gen/sec cannot advance two cycles in 400 ms; the
    accumulator cap means no burst — this is the visible half of 3.8 FD3).
    (d) Axe: zero violations in Run mode after (c)'s slider move while PLAYING.
    (e) Round trip: after a speed change, click `Lab` → `[data-dirty]` is whatever it was (a clean
    battle stays `"false"`); click `Run` → the slider is back at `"3"` (a new session starts at
    `startingSpeed` — the speed is run-local, not battle state; FR-8.12 says the SETTING is where
    a preference lives, Story 6.9).
    Every test: `collectErrors(page)` empty. All four Playwright projects.
  - [x] Convert the 3.11 block's `await expect(sidebarHeadings(page)).toHaveCount(0)` (`:2000`) to
    `toHaveText(['Speed'])`, and rewrite its comment (the skeleton had no sections; 3.13 added the
    first).

- [x] **Task 6 — Conformance sweep** (AC10)
  - [x] `BattlePage.test.tsx`: the Run-mode count test (`:2859`, "exactly four buttons … and no
    slider (Story 3.12)") — buttons stay `4`, the `queryByRole('slider')` null assertion becomes
    ONE slider named `Generations per second`; rename the test and rewrite its comment so 3.16's
    second slider and 3.18's fullscreen button fail it. The two "Lab → Run" tests that assert
    `queryAllByRole('heading', { level: 2 })` is `0` after Run (`:2712-2736` region, and any
    other) become `1`; the Lab-side `4` stays.
  - [x] Grep `apps/web` for "3.13", "SpeedControl" and "speed control" in comments
    (`useSimulation.ts` head comment, `simulationSpeed.ts` head comment, `BattleSimulationView.tsx`,
    `simulation/README.md`, `PetriDishCanvas.tsx`) — every future-tense sentence now false gets
    rewritten; every one describing a contract this story honours stays.
  - [x] `simulation/README.md`: the "What goes here" list already names `<SpeedControl>`; add
    nothing unless a name differs.

- [x] **Task 7 — Bookkeeping** (AC9, AC10)
  - [x] `deferred-work.md`: (1) the 1-9 review entry "**MUI's derived component tokens are silently
    no-op'd by `lighten`/`darken`**" says "Slider → Epic 4 (speed control)" — correct it: the speed
    control is Story 3.13 (Epic 3) and ships a native `<input type="range">` (FD1), so MUI Slider
    still has NO consumer; its first candidate is now Story 4.6's dominance slider IF that story
    chooses MUI — and record in the same sentence that 3.13's native idiom exists for it to follow
    instead. (2) The 3-11 amendment-candidate list for `component-tree-battle-page.md` — append
    "Checked by Story 3.13: §3.12's `SpeedControlProps` shipped exactly as specced" (item 6's shape)
    or the deviation and why. (3) New "Deferred from: Story 3-13" section carrying: the mockup's
    section title "Speed Multiplier" (FD3 — a mockup refresh candidate, not blocking), the
    `aria-valuenow`-is-an-index fact for 6.11's route-wide a11y sweep (valuetext covers it; a
    screen reader that ignores valuetext hears "3 of 4"), and — if 3.16 should share a
    `<LadderSlider>` primitive with this control rather than copy the styled blocks — that as a
    3.16 decision, with the copy-with-pointer alternative (`barButtonBase`'s precedent) named.
  - [x] `npm run ci > /tmp/ci-3-13.log 2>&1; echo $?` — never pipe to `tail`. Record the exit
    code, `/battle` first-load gzip + headroom (AC9), the Run chunk size, `bench:check`
    (unchanged), and the unit/e2e counts in the Dev Agent Record.

### Review Findings

Code review 2026-09-15 — Fable, three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance
Auditor) against the Opus implementation; 13 raw findings, 1 merged, 1 dismissed. Patches landed in
`fix: review patches (story 3.13)`; the decision item is the owner's and is what holds the status
at `review`.

- [ ] [Review][Decision] Focus-ring geometry — AC6 puts `:focus-visible` on the 6 px `<input>` at a
  2 px offset, so the ring is a ~10 px band that the 16 px thumb overhangs top and bottom
  (reproduced from the styled blocks alone and screenshotted in real Chromium and Firefox). SC 2.4.7
  is met — the indicator is visible — and the mockup ships `outline: none`, so this is a design
  call, not a defect. Options: (a) keep AC6's literal placement; (b) move the outline to the thumb
  pseudo-elements (`:focus-visible::-webkit-slider-thumb` / `::-moz-range-thumb`); (c) grow the
  input to the thumb's 16 px and paint the track through `::-webkit-slider-runnable-track` /
  `::-moz-range-track`. Whichever ships is what 3.16's Grid Size slider copies.
- [x] [Review][Patch] `aria-valuetext` read "1 generations per second" at the bottom detent — the one
  string assistive tech hears for the position — and the unit test pinned the plural
  [apps/web/components/battle/simulation/SpeedControl.tsx:165]
- [x] [Review][Patch] e2e (c) slow half: the `+ 1` bound rested on a false premise (`setSpeed` never
  publishes, so an odd cycle banked at 20 gen/sec surfaces as `+2`), and its comment claimed
  coverage of the 3.8 FD3 cap, which slowing down cannot exercise (the cap is a no-op when `ms`
  grows) — bound widened to `+ 2`, comment rewritten [apps/web/e2e/battleRoute.spec.ts:2393]
- [x] [Review][Patch] e2e (c) fast half: a fixed 300 ms `waitForTimeout` against a 100 ms publish
  cadence — replaced by `expect.poll`, the file's own idiom
  [apps/web/e2e/battleRoute.spec.ts:2385]
- [x] [Review][Patch] `simulationSpeed.test.ts` said the ladder's LENGTH "is not pinned" while its
  sibling `toEqual` tables fail on a sixth member [apps/web/lib/battle/simulationSpeed.test.ts:13]
- [x] [Review][Patch] The unit-tier heading assertions were substring matches —
  `toHaveTextContent('Speed')` passes under "Speed Multiplier", the title FD3 rejected; now
  `{ name: 'Speed' }` (exact) [apps/web/components/battle/BattlePage.test.tsx:2725,
  apps/web/components/battle/simulation/BattleSimulationView.test.tsx:135]
- [x] [Review][Patch] Head comment said 3.16 "copies this idiom" while `deferred-work.md` records
  share-vs-copy as 3.16's open decision [apps/web/components/battle/simulation/SpeedControl.tsx:31]
- [x] [Review][Patch] The `onChange` comment claimed an out-of-ladder index is impossible — true in
  browsers (step snapping), false under jsdom, where `'2.6'` yields `onChange(undefined)` and a
  `NaN` period that freezes the loop silently; comment scoped, no guard (the story forbids one)
  [apps/web/components/battle/simulation/SpeedControl.tsx:150]
- [x] [Review][Patch] Dev Agent Record test arithmetic: `simulationSpeed` went 6 → 10 and the view
  15 → 22, so +23 on a 1211 baseline, not +21 on 1213 — corrected below
  [docs/implementation-artifacts/3-13-speed-control.md]
- [x] [Review][Patch] AC7 lists ArrowUp / ArrowDown; e2e (b) pressed only Right / Left — both added,
  plus the singular valuetext at the bottom detent [apps/web/e2e/battleRoute.spec.ts:2341]
- [x] [Review][Patch] AC2 says the accessible name is `Speed` while naming a `<label htmlFor>`
  "Generations per second" as its source — a spec-authoring inconsistency the story's conflict list
  did not flag; recorded under Spec-conflict flags [docs/implementation-artifacts/3-13-speed-control.md]
- [x] [Review][Defer] AC10's literal "`npm run ci` exits 0" — the local gate exits 1 on Story 3.12's
  "Tab reaches Play…" e2e on the macOS WebKit/tablet projects, reproduced on the untouched
  baseline and already recorded in `deferred-work.md` (3-13 section); the remote gate runs on this
  story's PR [docs/implementation-artifacts/deferred-work.md] — deferred, pre-existing

## Dev Notes

### Constraints the developer MUST follow

- **Scope: one constant + helper, one control, one section, tests, docs.** No cycle text or
  population bars (3.14), no extinction check (3.15 — the hook's thunk), no grid size slider
  (3.16), no gallery Run action (3.17), no fullscreen / HUD (3.18), no hotkeys (3.19), no
  settings page (6.9). Nothing in `packages/*`. No change to `useSimulation` (`setSpeed` and
  `genPerSec` already exist and are tested), `simulationLoop`, `GridRenderer`, `PetriDishCanvas`,
  `SimulationControlBar`, `SidebarSection`, `check-bundle-size.mjs`, `themes.css`,
  `themeTokens.test.ts`.
- **Hot state stays in the hook (RFC-005 Decision 5, AR-29).** The view gains zero hooks. The
  control is stateless and controlled by `genPerSec`. A `useState` mirroring the speed in the view
  or the control is the drift 3.10 FD6 added `genPerSec` to the hook's return to prevent.
- **The control never sees `sim`.** Props are spec §3.12's two members. If it needs a third
  (`disabled`, say) that is a spec amendment candidate — record it, do not silently widen. It
  does NOT need `disabled`: FR-4.2's whole point is "adjustable during playback".
- **`components/battle/` is split by mode (`simulation/README.md`).** `SpeedControl.tsx` goes in
  `simulation/`; `<SidebarSection>` is root-level (shared) and is imported from `../SidebarSection`
  — that is the sanctioned direction. Import nothing from `editor/`.
- **Repositories are injected, never imported (AR-2, AR-27).** Nothing here touches one.
- **`apps/web` rules:** strict TS, no `any`/`!`/`@ts-ignore`; `export type` for types; camelCase
  filenames; `@gol/*` by package name; `@gol/test-utils` and `@/test-support` only from tests;
  no raw colour literals — hex OR `rgb()`/`hsl()` — in `.tsx` (AR-46 lint, catches functional
  notation); `styled()` for static chrome, no `sx`, no MUI `Slider` on the battle route (FD1). No
  `transition` on any new control.
- **Never read or write a ref during render**; `react-hooks/refs`, `set-state-in-effect`,
  `exhaustive-deps` are live. No React Compiler — memoise by hand where the story says, nowhere
  else (this story says nowhere).
- **Comments explain WHY and cite by ID.** `spec:check` reads this file and the code: `FR-4.2`,
  `FR-8.12`, `AR-34`, `AR-24`, `AR-46`, `Decision D`, `M2`, `Story 3.10` exactly; `FR4.2`, `AR34`,
  `M-2` are silently exempt forever. `ACn` and bare `FDn` are story-relative and unchecked.
- **Commit gate.** The story subagent commits to its own `story/3-13-…` branch; merging is
  Sidiar's. Lane 4 is open in another worktree — its `sprint-status.yaml` diffs must not ride
  into this branch (3.8's review reverted exactly that).

### What this story is, in one paragraph

Story 3.10 built `setSpeed` as a ref write and published `genPerSec` back as React state precisely
so this story would have nothing to invent about speed; Story 3.8 made the loop read the ref every
frame and capped the accumulator so a downward change cannot burst. This story adds the surface:
one section, one native range input whose value is a ladder index, and a runtime `SPEED_LADDER` the
input can index (the schema had the ladder as a type only). Everything else is composed from
settled patterns — `<SidebarSection>` for the heading (2.11), the sentence-case-DOM/uppercase-CSS
name rule, the `--gol-border-control` substitution for control boundaries (2.11/2.14), the
no-`transition` rule, the frame driver for view tests (3.12 FD4), the fail-forward count tests.
Three things are decided rather than composed: native `<input type="range">` over MUI `Slider`
(FD1), what the slider's accessible name and announced value are (FD2), and the section title
(FD3). The idiom that ships here — a detented, index-valued, `aria-valuetext`-labelled ladder
slider in tokens — is what Story 3.16's Grid Size slider copies, Story 4.15's preview reuses
outright, and Stories 4.6 and 6.9 should follow, so get the pseudo-element styling and the a11y
attributes right once.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — Native `<input type="range">` or MUI `<Slider>`.**
- **(a) Native range, `styled('input')`, value = ladder index** *(recommended)*. The mockup's own
  markup (`min="0" max="4" step="1"`, `:652`) and script (`genPerSec[this.value]`, `:786-790`);
  detented by construction (`step={1}` over five integer positions — there is no in-between
  value to snap); zero new MUI modules on the route with the least bundle headroom (Story 2.14
  made the same call for native radios, for the same reason); native keyboard semantics (arrows,
  Home/End) and `role="slider"` for free. The one cost — `aria-valuenow` is the index — is paid by
  `aria-valuetext` (FD2). And the known trap: `deferred-work.md` (1-9 review) records that under
  `cssVariables: true` MUI emits `--mui-palette-Slider-primaryTrack: var(--gol-accent)`, identical
  to the active track, so a MUI Slider's inactive rail is INVISIBLE until someone authors a shade
  token and a `styleOverride` — a design call no mockup specifies.
- **(b) MUI `Slider` with `marks` and `step={null}`.** RFC-003's catalogue names it, and
  `step={null}` gives true detents. But it needs the rail fix above (a new token + theme
  override in a story that touches no theme), pulls `@mui/material/Slider` into the Run chunk
  (measurable — a MUI Slider is several KB gzip on its own), and its DOM (a `<span role="slider">`
  with a hidden `<input>`) makes every test and e2e locator in this story different from the
  mockup's element. `aria-valuetext` is supported via `getAriaValueText`, so a11y is a wash.
- **(c) Five `role="radio"` buttons (a segmented control).** Not a slider — the epic AC says
  "detented slider", spec §3.12 says slider, and 3.16's Grid Size control must be a slider too
  (README: "a detented slider over all four presets").

**FD2 — The slider's accessible name and announced value.**
- **(a) Visible `<label htmlFor>` "Generations per second" + `aria-valuetext="N generations per
  second"`** *(recommended)*. A real label association (not `aria-label`) so the visible text and
  the name are one string, spelled out — no `/`, which is announced as "slash" or dropped
  depending on the engine (the `×` → "by" reasoning of `<GridSettingsSection>`). `aria-valuetext`
  is the WAI-ARIA mechanism for exactly this case (a slider whose numeric value is not the thing
  the user cares about); with it set, a conforming screen reader announces "10 generations per
  second", not "3". The visible `10 gen/s` and the marks are `aria-hidden` so nothing is read
  twice.
- **(b) `aria-label="Speed"` on the input, no `<label>`.** Shorter, but the visible label text
  then names nothing, and axe's `label` rule is satisfied either way — (a) is strictly more.
- **(c) `<output htmlFor>` for the value.** Implicit `role="status"` = a polite live region that
  re-announces every detent on top of the slider's own announcement — the double read.

**FD3 — Section title.**
- **(a) "Speed"** *(recommended)*. The mockup's "Speed Multiplier" is the 0.5×–3× era's name and
  the mockup's own note says the control "now uses the canonical generations-per-second ladder …
  rather than an abstract 0.5x–3x multiplier" — a gen/sec value is not a multiplier of anything.
  `<SidebarSection>` uppercases it. Record as a mockup-refresh candidate (Task 7).
- **(b) "Speed Multiplier".** Mockup-faithful and wrong; 3.18's HUD and 4.15's preview would
  inherit the word.
- **(c) "Simulation Speed".** Fine, but the sidebar already says what is being simulated; the
  Lab side's titles are one or two words ("Organisms", "Battle Name", "Grid Info", "Tools").

**FD4 — Where `SPEED_LADDER` lives.**
- **(a) `apps/web/lib/battle/simulationSpeed.ts`** *(recommended)*. The file's head comment
  already declares itself the one place besides the schema that knows the ladder, `GenPerSec`
  is derived there, and `msPerCycle` / `cyclesPerPublish` are its siblings. The `satisfies` +
  exhaustiveness pair keeps the schema the authority. Story 6.9's settings control imports it
  from here (same app, no boundary crossed).
- **(b) `@gol/domain` beside `SettingsSchema`.** Also defensible (one file owns the ladder), but
  it moves a UI ordering concern into the domain package for one consumer, and the schema's
  `z.union` cannot be built from a runtime tuple without type gymnastics that obscure a
  five-literal union. Revisit only if a second package needs the order.

### Traps

1. **Publish parity at 20 gen/sec.** `cyclesPerPublish(20) === 2`, so `data-cycle` shows only
   EVEN cycles while the loop runs at 20; at every other ladder speed it shows every cycle. A view
   test that changes to 20 and expects `"3"` after three 50 ms frames is wrong and looks right.
   Manual `step()`, `pause()` and `stop()` publish unconditionally at any speed. Assert on
   `drawDiff` counts for "one step per frame" and on `data-cycle` only at even values.
2. **jsdom does not step a range input from the keyboard.** `user.keyboard('{ArrowRight}')` on a
   focused `<input type="range">` leaves `value` unchanged under jsdom — the unit test passes
   only if it asserts nothing. Unit tests drive the control with `fireEvent.change(slider, {
   target: { value: '4' } })` (RTL's documented approach for range inputs — `user.type` does not
   apply); keyboard behaviour is asserted in Playwright, where all four browsers implement it.
3. **The accumulator cap makes a downward change "lose" banked time by design.** After 10 gen/sec
   → 1 gen/sec, the next 100 ms frame steps NOTHING (3.8 FD3: `accumulator = Math.min(accumulator,
   ms)` against the new 1000 ms, then `+= min(delta, ms)`). A test expecting the old cadence to
   finish its cycle encodes the burst Decision D.3 forbids. Test (c) in Task 4 pins the correct
   behaviour.
4. **`sim.setSpeed` is stable; `sim` is not.** `sim` is a new object on every publish (its
   `useMemo` keys on `view`). Pass `sim.setSpeed` (stable, `[]` deps) — never a wrapper keyed on
   `sim`, which is the per-cycle prop churn 3.12's review caught in `handlePlayPause`.
5. **The `<label>` is the name; the value span is not.** A `<span>` "10 gen/s" next to the slider
   is NOT part of the accessible name and must not be — `getByRole('slider', { name: 'Generations
   per second' })` is the handle everywhere. Keep `aria-hidden` on the value and the marks or axe
   is fine but the announcement doubles.
6. **`SidebarSection` renders `<h2>`.** The first Run-sidebar section flips every "no h2 in Run"
   assertion: `BattleSimulationView.test.tsx` (Task 4), `BattlePage.test.tsx` twice (Task 6), and
   the 3.11 e2e `sidebarHeadings … toHaveCount(0)` (Task 5). Convert all four; a missed one is a
   red CI, not a silent pass.
7. **Firefox tracks need `::-moz-range-track`.** With `appearance: none` on the input, Blink/WebKit
   paint the input's own `background` as the track; Firefox paints its native track over it
   unless `::-moz-range-track` is styled. The tablet and webkit Playwright projects will not
   catch a Firefox-only unstyled track — check the firefox project's run, and if you doubt it,
   `npm run e2e -- --project=firefox --headed` once.
8. **`React.ChangeEvent` for a range input carries a STRING value.** `Number(e.currentTarget.value)`
   before indexing; `e.currentTarget.valueAsNumber` also works and skips the parse — either, with
   no `parseInt` radix gotcha.
9. **The control must be controlled.** `value={speedIndex(genPerSec)}` with `onChange`, never
   `defaultValue`: on a Stop the hook keeps `genPerSec` (test (e)), on Run → Lab → Run the hook
   re-seeds from `startingSpeed` and the slider must follow it (e2e (e)) — both are prop-driven
   truths a `defaultValue` would silently miss.
10. **`spec:check` reads this file.** Every ID above is spelled as the specs spell it.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **Mockup section title "Speed Multiplier"** vs Decision D.1's gen/sec ladder — FD3 (a); the
  mockup's own annotation concedes the scale changed. Mockup-refresh candidate, not an edit.
- **Mockup `.speed-slider` track `var(--border)`** vs SC 1.4.11 — `--gol-border-control`, the
  route's established substitution (2.11 / 2.14). Not new.
- **Mockup `.speed-label` "Generations / sec"** vs the accessible-name rule — spelled out as
  "Generations per second" (FD2); the visible text changes with it (one string, one name).
- **`deferred-work.md` (1-9 review) says "Slider → Epic 4 (speed control)"** — the speed control
  is Epic 3 (this story), and FD1 (a) means MUI Slider still has no consumer. Corrected in Task 7,
  not silently left.
- **RFC-003's component catalogue lists MUI Sliders** as bespoke-work eliminators — FD1 (a)
  departs for this control on bundle, mockup-fidelity and the recorded rail-token gap; Story 4.6
  makes its own call for a 1–100 continuous slider with a synced numeric input, where MUI's
  `Slider` may earn its weight. Record in `deferred-work.md` so 4.6 sees both facts.
- **spec §3.12 `SpeedControlProps`** — matches what ships exactly; `GenPerSec` is imported from
  `@/lib/battle/useSimulation` (re-exported there) rather than re-declared.
- **AC2's own wording (flagged in review, 2026-09-15):** it says the slider's "accessible name is
  `Speed`" and, in the same sentence, that a visible `<label htmlFor>` reading "Generations per
  second" is the name's source. A label association makes the label text the name, so the name is
  "Generations per second" — FD2 (a), and every locator in the story. The AC's `Speed` is the stale
  half; the section title is "Speed" (FD3), the control's name is not.

### What NOT to build

- ❌ No `<CycleCounter>`, `<PopulationStats>` (3.14), `<GridSizeControl>` (3.16), `<FullscreenHUD>`
  (3.18), `useSimulationHotkeys` (3.19).
- ❌ No change to `useSimulation` — no `speedUp()`/`speedDown()` verbs (3.19's hotkeys, if any,
  compose `setSpeed` + `SPEED_LADDER` in the hook of that story), no `genPerSec` prop observation.
- ❌ No `disabled` prop on the control (FR-4.2: live during playback is the feature).
- ❌ No `useState` / `useRef` / `useEffect` / `useCallback` in the view for the speed.
- ❌ No MUI `Slider` / `FormControl` / `Typography` on the battle route (FD1; Story 2.8 FD2).
- ❌ No new token, no new contrast row, no `themes.css` change; no `rgb(…)` / `box-shadow` in a
  `.tsx`; no `transition`.
- ❌ No `aria-live` region, no `<output>`, no `aria-valuenow` override (the browser sets it; only
  `aria-valuetext` is authored).
- ❌ No `SPEED_LADDER` in `@gol/domain` (FD4) and no second spelling of `[1, 2, 5, 10, 20]`
  anywhere — every consumer indexes the constant.
- ❌ No persistence of a speed change (FR-8.12: the setting is the preference; a live change is
  run-local and dies with the session — Story 6.9 AC2 says so in as many words).
- ❌ No `@gol/test-utils` additions; no new e2e seeding helper.
- ❌ No edit to `component-tree-battle-page.md`, `architecture.md`, RFC-003 or the mockups —
  candidates to `deferred-work.md`.

### Testing standards summary

- Vitest 4 in `apps/web` (jsdom, `vitest.setup.ts` registers `cleanup`; no coverage gate — the
  tests exist because the ACs need them). RTL 16 + `@testing-library/user-event` 14 (for clicks
  and Tab); `fireEvent.change` for the range input (Trap 2); `vitest-axe` for a11y;
  `installFrameDriver()` / `installContexts()` from `BattleSimulationView.test.tsx` (3.12);
  `GridRenderer.prototype` spies for `drawFull` / `drawDiff` counts.
- Never pixel/snapshot-test the canvas. Assert on renderer-method spies, `data-status`,
  `data-cycle`, and the slider's own attributes.
- Determinism: nothing asserts on cell contents after a step (3.12 trap 7 — the fixture's blinkers
  collide at cycle 1). Counts and attributes only.
- The hook's own tests (3.10 AC7) are the contract for `setSpeed`; here the WIRING is under test —
  that a slider move reaches `setSpeed` with the ladder value, that the loop chain survives it,
  that the control follows `genPerSec` and not the other way round.
- Make every new test fail under the mutation it guards: (b) reddens if a speed change restarts
  the loop (`cancelAnimationFrame` called / handle changes) or re-clones (`drawFull` +1); (c)
  reddens if the loop's `Math.min(accumulator, ms)` cap is removed; (e) reddens if `stop()` resets
  `genPerSec`; the controlled-input test reddens under `defaultValue`; the label test reddens
  under `aria-label`.
- `npm run ci > /tmp/ci-3-13.log 2>&1; echo $?`; report the real exit code and the bundle numbers.

### Previous story intelligence (3.12) and recent git

- **3.12 shipped the frame driver** (`installFrameDriver`: spies on `window.requestAnimationFrame`
  / `cancelAnimationFrame` with a queue, `frame(now)`, `lastHandle()`) — reuse it; its comment
  explains why `act` wraps each callback (the callbacks `setView`). Timestamps are the test's, so
  `frame(t)` at chosen `t` makes the accumulator deterministic.
- **3.12's review caught `[sim]` in a `useCallback`** re-creating a closure per publish. This
  story adds no callback at all; Trap 4 is the same lesson applied to a prop.
- **3.12 measured `/battle` at 308.6 KB gzip (1.4 KB headroom)** and the Run chunk at 4.8 KB
  gzip. This story's code is inside the Run chunk plus a constant in `simulationSpeed.ts` (already
  in that chunk); `/battle` should move by ~0 — `SidebarSection` is already on the route.
- **3.12's count tests were written to be flipped by this story** (`BattlePage.test.tsx:2855-2871`,
  `BattleSimulationView.test.tsx:120-133`) — the route's convention; convert, never delete.
- **3.12's e2e Debug Log:** the full four-project Playwright matrix was OOM-killed twice locally;
  `npx playwright test --project=chromium --workers=1` (apps/web) was the clean standalone signal.
  Budget for that, and confirm the GitHub Actions run after push (`gh run list`).
- **Git:** stories run on `story/*` branches merged by PR (#37 3.12, #38 4.5); `review:` / `fix:`
  commits follow the feature commit; `docs:` follow-ups for run stats. Lane 4's next story (4.6
  dominance control) does not touch `components/battle/**` or `lib/battle/**`; 4.15 (which
  reuses `<SpeedControl>`) is gated on 3-15, and 4.24/4.25 on `epic-3`, so this story reshapes
  `<BattleSimulationView>` with no open consumer in the other lane.

### External dependencies / versions

None new. React 19.2.7, Next 16.2.10, MUI 9.3.1 `styled` only, `@testing-library/react` 16.3.2,
`@testing-library/user-event` 14.6.1, `vitest-axe` 0.1.0, Vitest 4.1.x, jsdom 30, Playwright as
installed. `eslint-plugin-react-hooks` 7.1.1 via `eslint-config-next` 16.2.12. No React Compiler.
TypeScript 5.9.3 — `satisfies` on an `as const` tuple is the shape Task 1 relies on.

## Project Structure Notes

- New: `apps/web/components/battle/simulation/SpeedControl.tsx` (+ `.test.tsx`).
- Modified: `apps/web/lib/battle/simulationSpeed.ts` (+ `.test.ts`),
  `apps/web/components/battle/simulation/BattleSimulationView.tsx` (+ `.test.tsx`),
  `apps/web/components/battle/BattlePage.test.tsx` (count / heading tests),
  `apps/web/e2e/battleRoute.spec.ts` (new block; one 3.11 assertion converted; one module-scope
  locator), `apps/web/lib/battle/useSimulation.ts` **comments only** if a "Story 3.13" sentence
  is now false (Task 6), `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Not touched: `apps/web/app/themes.css`, `apps/web/lib/themeTokens.test.ts`,
  `apps/web/components/battle/SidebarSection.tsx`, `apps/web/components/battle/simulation/
  SimulationControlBar.tsx`, `apps/web/components/PetriDishCanvas.tsx`, `apps/web/components/
  battle/editor/**`, `apps/web/components/battle/BattlePage.tsx`, `packages/**`, `scripts/*`,
  any planning artifact.
- Naming: `SpeedControl` per spec §3.12 / README; `SpeedControlProps` exported; `SPEED_LADDER`,
  `speedIndex` in `simulationSpeed.ts`; private `Control` / `LabelRow` / `Label` / `Value` /
  `Slider` / `Marks`.

## References

- `docs/planning-artifacts/epics.md#Story 3.13` — the three clauses; Story 3.10 AC (the hook's
  `setSpeed`), 3.12 (the bar), 3.14/3.16 (what is still absent), 3.18 (HUD carries `genPerSec`),
  4.15 ("a speed slider over the canonical gen/sec ladder"), 6.9 ("Story 3.13's control consumes
  it as its initial value; live adjustments … don't alter the setting"); FR-4.2 (`:69`), FR-8.12
  (`:123`), AR-24, AR-34 (`:202`), UX-DR17 (`:242`), UX-DR20 (`:245`).
- `docs/planning-artifacts/component-tree-battle-page.md` — §2 (`<SpeedControl>` under
  `<SimulationSidebar>`, `:80`; sidebar order `:78-82`), **§3.12 (`SpeedControlProps`,
  `:298-301`; "reused by the Organism-Editor preview panel", `:308`)**, §3.14 (`hud.genPerSec`),
  §4 (`setSpeed(v) // ref-write; no loop restart`, `:370`), §7 (`4.2 | SpeedControl`, `:442`;
  `8.12 | starting speed`, `:454`; compact variants, `:467`).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` — FR-4.2 (`:287-298`), FR-8.12
  (`:576-583`), NFR-1.1, NFR-4.1, NFR-4.2, NFR-8.1.
- `docs/planning-artifacts/architecture.md` — Runtime Architecture step 3 (`:127`); **Decision D.1–
  D.3 (`:204-216`)** — the ladder, the 50 ms floor, the ref read and the delta clamp; AR-24,
  AR-29, AR-34, AR-35, AR-46 (defined in `epics.md:189-202`).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — Decision 5 (the hook
  contract; sketch illustrative). `RFC-003-frontend-ui-architecture.md` — Decision 1 (per-component
  imports, `:82-84` names `Slider`), Decision 3 (`styled()` over `sx`); the catalogue line (`:68`)
  FD1 departs from for this control. `RFC-002-grid-rendering-technology.md` §5 (the accumulator,
  as amended by 3.8's deferred note).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode.html`
  — `.speed-control` … `.speed-presets` (`:246-306`), the section markup (`:643-661`), the script
  (`:786-790`), the annotation on the ladder (`:768`); `organism-editor.html:390-450` (the
  dominance slider 4.6 will style — NOT this control's values).
- `apps/web/lib/battle/simulationSpeed.ts` (head comment — the single-source claim; `msPerCycle`,
  `cyclesPerPublish`), `apps/web/lib/battle/useSimulation.ts` (`genPerSec` state, `setSpeed`
  `:464-471`, obligation 6 `:81-82`, `stop()` `:438-462` — note it never touches `genPerSec`),
  `apps/web/lib/battle/useSimulation.test.ts` (AC7 describe `:418-446` — the contract this story
  wires), `packages/simulation/src/loop/simulationLoop.ts` (`:23-31` the speed-change bank;
  `:136-164` the live read and both clamps), `packages/domain/src/settingsSchema.ts` (`defaultSpeed`
  union `:29-33`), `apps/web/components/battle/simulation/BattleSimulationView.tsx`
  (`SidebarContent`, the head comment's ABSENT list, `startingSpeed`), `BattleSimulationView.test.tsx`
  (`installFrameDriver` `:74`, `installContexts` `:29`, the count test `:120-133`),
  `apps/web/components/battle/BattlePage.tsx` (`startingSpeed={settings.defaultSpeed}` `:885`),
  `BattlePage.test.tsx` (`:2712`, `:2736`, `:2855-2871`), `apps/web/components/battle/SidebarSection.tsx`
  (the `<h2>` decision), `apps/web/components/battle/editor/GridSettingsSection.tsx` (the
  `--gol-border-control` substitution, `useId`, the `aria-hidden` + spelled-out-name reasoning),
  `apps/web/components/battle/simulation/SimulationControlBar.tsx` (the presentational-total shape;
  no-`transition` comment), `apps/web/lib/themeTokens.test.ts` (text pairs `:66-76`, control pairs
  `:124-135` — the rows AC6 relies on, all present), `apps/web/e2e/battleRoute.spec.ts`
  (`sidebarHeadings` `:139`, `collectErrors` `:145`, the 3.11 block `:1966-2117`, the 3.12 block
  `:2118-`), `eslint.config.mjs` (AR-46 selectors incl. `rgb()`).
- `docs/implementation-artifacts/3-12-transport-controls.md` (FD4 frame driver, traps 6/7/15,
  review finding on `[sim]` deps, Dev Agent Record bundle numbers), `3-10-usesimulation-hook.md`
  (AC7, FD6, obligation 6, trap 10), `3-8-simulationloop.md` (AC4, FD3 — the speed-change bank),
  `deferred-work.md` (1-9 review: the MUI Slider rail token gap with the stale "Epic 4 (speed
  control)" pointer; 3-8: the accumulator amendment candidate; 3-11: §3.11/§4 amendment list,
  item 5 on `startingSpeed`), `lane-gates.yaml` (4.15 → 3-15; 4.24/4.25 → `epic-3`).
- `docs/project-context.md` — hot state in refs; `components/battle/` split; no raw colour
  literals; no DOM in `packages/*`; `spec:check` spelling; commit gate; bundle ratchet.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, via `bmad-dev-story` on branch
`story/3-13-speed-control` (baseline `14ac287`).

### Implementation Plan

Red-green per task, in story order. Task 1 first because Tasks 2–4 index `SPEED_LADDER`; Task 4's
tests were written BEFORE Task 3's wiring so the view tests were red for the right reason (no
slider), not a typo. Every test the Testing-standards section names as a mutation guard was run
against its mutation and confirmed red, then the mutation reverted (details below).

**Forced decisions taken:**
- **FD1 (a)** — native `<input type="range">`, `styled('input')`, value = ladder index. Recorded
  in `SpeedControl.tsx`'s head comment with the `deferred-work.md` rail-token fact it rests on.
- **FD2 (a)** — visible `<label htmlFor>` "Generations per second" + `aria-valuetext`; value and
  marks `aria-hidden`.
- **FD3 (a)** — section title "Speed"; "Speed Multiplier" recorded as a mockup-refresh candidate.
- **FD4 (a)** — `SPEED_LADDER` / `speedIndex` in `apps/web/lib/battle/simulationSpeed.ts`, with
  the `satisfies` + `Exclude<GenPerSec, …> extends never` pair. The `void ladderIsExhaustive` form
  lints clean without a disable comment (no `_`-prefix needed). Verified BOTH directions fail
  `tsc`: dropping `20` from the tuple → 2 errors; adding `40` → 1 error (`satisfies`).

### Debug Log References

- **Story trap 3 / Testing-standards "(c) reddens if the cap is removed" — the direction is
  wrong as written, the test is right as specced.** The 10 → 1 gen/sec change in (c) GROWS `ms`
  (100 → 1000), so `accumulator = Math.min(accumulator, ms)` is a no-op there; the test passed
  with the cap deleted. The cap bites when `ms` SHRINKS — a bank built at 1 gen/sec drained at 20
  — which is exactly what `simulationLoop.test.ts`'s own "speed-change bank" test (3.8) calls a
  "downward" change (downward in ms). Kept (c) exactly as specced (a valid AC4 pin: no burst on the
  way down, exactly one step per new period) and added **(c′)** "speeding up while playing drains
  at most one banked step, never a burst" — 900 ms banked at 1 gen/sec, slider to 20, six 16 ms
  frames → 2 `drawDiff` calls with the cap, **6 without it** (confirmed red under the mutation,
  restored, green). No production code changed for this.
- **(e) mutation confirmed:** a `stop()` that re-seeds `genPerSecRef` / `msPerCycleRef` /
  `setGenPerSec` from `opts.genPerSec` reddens "Stop & reset keeps the chosen speed"; reverted.
- **e2e: WebKit and tablet failed the ONE Tab press in test (b) with plain `Tab`** — focus fell to
  `<body>` from the range input. Probed with a scratch spec: on local macOS WebKit a plain Tab from
  ANY element (Lab button, slider, Back) lands on `<body>`, and Story 3.12's existing "Tab reaches
  Play…" test fails locally on webkit/tablet the same way — while CI's Linux WebKit passes it (main
  green through #39). `Alt+Tab` (Story 4.1's idiom, `organisms.spec.ts`) walks slider → Back on
  both local WebKit projects. Applied it to this story's one Tab press with a comment; the
  pre-existing 3.12 local failure is recorded in `deferred-work.md`, not patched here (its block
  is out of this story's conversion list). The scratch probe spec was deleted.
- **Trap 7 checked:** the firefox project ran the 3.13 block green (5/5); `::-moz-range-track` is
  set. Not visually inspected `--headed` — the axe scan is the mechanical check, and the track is
  a `--gol-border-control` box either way.

### Completion Notes List

- **Task 1:** `SPEED_LADDER` (`as const satisfies readonly GenPerSec[]`), the two-way
  exhaustiveness check, `speedIndex` (`indexOf` over the tuple; no `-1` branch). Head comment now
  names both consumers (3.13's control, 6.9's settings page) as indexing this array. Tests: strictly
  ascending; every member's `msPerCycle` in `[50, 1000]` and the max at exactly 50 (Decision
  D.2); `speedIndex` round-trips every member; `speedIndex(10) === 3`. The test file's `LADDER`
  table now IS `SPEED_LADDER` (a second spelling of `[1, 2, 5, 10, 20]` was the story's ❌).
- **Task 2:** `SpeedControl.tsx` — six styled blocks from the mockup (`:246-306`), track
  `--gol-border-control`, thumb/value `--gol-accent`, label/marks `--gol-text-secondary`;
  `::-webkit-slider-thumb`, `::-moz-range-thumb`, `::-moz-range-track`, `:focus-visible`. No
  `transition`, no `box-shadow`, no `position`, no colour literal. `useId` for the `for`/`id`
  pair. 12 unit tests incl. `it.each(SPEED_LADDER)`, the controlled-input proof, the real-`<label>`
  proof, `aria-hidden` on value and marks, axe at indices 0/3/4.
- **Task 3:** `<SidebarSection title="Speed"><SpeedControl genPerSec={sim.genPerSec}
  onChange={sim.setSpeed} /></SidebarSection>` inside `<SidebarContent>`, with the §2 order
  comment. Head comment's ABSENT list and `SidebarContent`'s comment rewritten. Zero new hooks,
  state, refs or callbacks in the view (AC8).
- **Task 4:** 7 new view tests — (a) index at `startingSpeed` 10 and 2; (b) live change: same
  RAF handle, `caf` never called, one pending, `drawFull` still 1, `data-cycle` unchanged, then
  one step per 50 ms frame with even-only publish (trap 1); (c) slow-down: no step at +100 ms,
  one at +1000 ms; (c′) speed-up: bank drained to ≤ 1 step; (d) paused change requests no frame,
  next Play at 20; (e) Stop keeps the speed; (f) axe paused/playing/after a live move. 3.11's count
  test converted to four buttons / one h2 "Speed" / one slider.
- **Task 5:** e2e block `Speed control (Story 3.13)` — 5 tests × 4 projects = 20 green; module
  `speedSlider` locator with the 3.16 note; the 3.11 `sidebarHeadings … toHaveCount(0)` converted
  to `toHaveText(['Speed'])`.
- **Task 6:** `BattlePage.test.tsx` — Run-mode count test now asserts ONE slider named
  "Generations per second" (renamed for 3.16/3.18 to flip); Lab → Run h2 count `0` → `1` ("Speed");
  the Lab-side `4`s untouched. Comment sweep: no future-tense "3.13" sentence remains in
  `apps/web`; `simulationLoop.ts:133`'s "the slider's to keep (Story 3.13)" and the README's list
  describe contracts now honoured and stay.
- **Task 7:** `deferred-work.md` — 1-9 review pointer corrected (MUI Slider still has no consumer;
  4.6 is the next candidate, with 3.13's native idiom named as the alternative); 3-11 amendment
  list item 7 (§3.12 `SpeedControlProps` shipped exactly as specced); new "Deferred from: Story
  3-13" section (mockup title, `aria-valuenow`-is-an-index for 6.11, the `<LadderSlider>`
  question for 3.16, and the pre-existing local-WebKit plain-Tab failure in the 3.12 e2e).
- **Gate (`npm run ci > /tmp/ci-3-13.log 2>&1; echo $?`) → exit 1, on the two pre-existing
  local-WebKit failures only.** Stage by stage: typecheck ✓ (5/5), lint ✓ (0 errors; 1
  pre-existing warning in `BattleGallery.tsx:248`), format:check ✓, spec:check ✓, boundary:check ✓,
  test:coverage ✓ — test-utils 89, domain 101, persistence 82, simulation 397, **web 83 files /
  1234 tests** (was 1211 + the 23 this story adds: 6 → 10 in `simulationSpeed`, 12 new
  `SpeedControl`, 7 new in the view plus 1 converted, 1 converted in `BattlePage` — counts
  corrected in review) — build:standalone ✓,
  bundle:check ✓, bench ✓, bench:check ✓ (**6.924 ms, 9.743 ms headroom, 58.5 % of the 16.667 ms
  budget** — unchanged, nothing on the benchmarked path), e2e: **530 passed, 2 failed** of 536 —
  both failures are Story 3.12's "Tab reaches Play, Next cycle, Stop & reset in order" on
  `webkit` and `tablet`, plain-Tab-to-`<body>` on local macOS WebKit. **Confirmed pre-existing by
  stashing this story and running that one test on the untouched baseline (`14ac287`): it fails
  identically.** CI's Linux WebKit passes it (main green through #39), so the remote gate is
  expected green; recorded in `deferred-work.md` for the next story that edits the 3.12 block. This
  story's own 20 e2e (5 × 4 projects) are green, WebKit included, via the Story 4.1 `Alt+Tab` idiom.
- **AC9 bundle:** `/battle` first-load **308.6 KB gzip, 1.4 KB headroom — unchanged from 3.12**
  (`/battle/new` 308.6, `/` 333.3, `/organisms` 295.3; `check-bundle-size.mjs` untouched). Run
  chunk (`348yoigcx7iwo.js` in the export built for this tree; carries both "Generations per
  second" and "Stop & reset"): **5.2 KB gzip (14.0 KB raw)**, up from 3.12's 4.8 KB (12.5 KB raw)
  — the control, its six styled blocks and `SPEED_LADDER`'s consumers — and **not referenced from
  `battle.html`**, so the route's first load did not move.
- **Spec-conflict flags:** none new beyond the story's own list. The story's Testing-standards
  claim about which mutation reddens (c) is corrected above, not silently.
- **Not built (per "What NOT to build"):** no `disabled` prop, no hook change, no view state, no
  MUI Slider, no token, no `aria-live`, no persistence of the speed, no test-utils addition, no
  planning-artifact edit.

### File List

New:
- `apps/web/components/battle/simulation/SpeedControl.tsx`
- `apps/web/components/battle/simulation/SpeedControl.test.tsx`

Modified:
- `apps/web/lib/battle/simulationSpeed.ts`
- `apps/web/lib/battle/simulationSpeed.test.ts`
- `apps/web/components/battle/simulation/BattleSimulationView.tsx`
- `apps/web/components/battle/simulation/BattleSimulationView.test.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/3-13-speed-control.md` (this file)

Not touched (as required): `apps/web/lib/battle/useSimulation.ts`, `packages/**`,
`apps/web/app/themes.css`, `apps/web/lib/themeTokens.test.ts`, `SidebarSection.tsx`,
`SimulationControlBar.tsx`, `PetriDishCanvas.tsx`, `BattlePage.tsx`, `scripts/*`, `simulation/README.md`
(already names `<SpeedControl>`), every planning artifact.

## Change Log

- 2026-09-15 — Story 3.13 implemented: `SPEED_LADDER` + `speedIndex`; `<SpeedControl>` (native
  detented range slider, index-valued, `aria-valuetext`); wired as the Run sidebar's first section
  ("Speed") through `sim.genPerSec` / `sim.setSpeed`; unit, view and e2e tests; count tests
  converted; `deferred-work.md` updated. Status → review.
- 2026-09-15 — Code review (Fable): 10 patches applied (singular `aria-valuetext` at 1 gen/sec,
  e2e (c) bound and comment, `expect.poll`, exact heading names, ArrowUp/ArrowDown, four comment
  corrections, Dev Record counts), 1 deferred (pre-existing local-WebKit 3.12 e2e), 1 decision
  open (focus-ring geometry). Status stays `review` until the decision is taken.

Dev Model: opus   # architecture-shaping: ships the detented ladder-slider idiom (native range, index value, aria-valuetext, tokenised track/thumb) that 3.16's Grid Size slider copies, 4.15 reuses outright and 4.6/6.9 should follow, plus the runtime SPEED_LADDER every later speed consumer indexes — patterns picked here, none existing in code to follow
Proposed lane gate: `- story: 4-6-dominance-control / requires: 3-13-speed-control / why: 4.6 is the app's second slider (1–100 + synced numeric input) and lane 4's next story; 3.13 decides native range vs MUI Slider (FD1) and the token treatment for track/thumb, and the stale deferred-work pointer ("Slider → Epic 4") means 4.6 would otherwise make the same call in parallel with no idiom to follow — one slider idiom, decided once`

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 17s | 17s | 10 | 1,109 | 5,019 | 276,770 | 282,908 |
| Step 1 — create-story | opus-5 | 1 | 9m 40s | 9m 40s | 142 | 43,197 | 444,360 | 8,890,162 | 9,377,861 |
| Step 2 — dev-story | opus-5 | 1 | 23m 29s | 23m 29s | 358 | 70,001 | 576,318 | 27,706,498 | 28,353,175 |
| Step 3 — code review + PR | fable-5-1 | 4 | 26m 33s | 26m 33s | 5,504 | 132,418 | 1,786,403 | 21,430,038 | 23,354,363 |
| _of which the orchestrator_ | opus-5 | — | — | — | 44 | 5,924 | 29,228 | 1,343,901 | 1,379,097 |
| **Total (create-story → PR ready)** | | 6 | **59m 59s** | 59m 59s | 6,014 | 246,725 | 2,812,100 | 58,303,468 | **61,368,307** |

Run started 2026-09-15 13:05 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
