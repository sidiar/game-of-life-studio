---
baseline_commit: ba8b4f746a2e312d08c75d7d0404ca7087c79e95
---

# Story 3.14: Cycle Counter & Population Stats

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want live population analysis while the battle runs,
so that I can follow who's winning.

## Acceptance Criteria

From `epics.md#Story 3.14`, decomposed into what a reviewer can check independently. Every fact this
story DISPLAYS already exists and is tested: `useSimulation` publishes `cycle` (an int) and
`population` (pre-sorted `PopulationEntry[]` with `extinct` flags) at ≤ 10 Hz (Story 3.10 AC3/AC5,
M2, AR-29); manual `step()`, `pause()` and `stop()` publish unconditionally (3.10 FD4);
`derivePopulation` (`apps/web/lib/battle/population.ts`) owns the sort, the `pct` and the
extinction flag. What does **not** exist is the surface: two presentational sections above the
Speed section, and the tests that prove they render exactly what the hook publishes and nothing
per frame. This story adds **no semantics to the hook**, **no state to the view**, and **no sort,
filter or extinction logic to the components** (spec §3.12: "All pure presentational; logic
(sorting, extinction, cadence) upstream").

1. **`<PopulationStats>` renders as the FIRST Run-sidebar section (spec §2 order; FR-4.6).** New
   file `apps/web/components/battle/simulation/PopulationStats.tsx`, exported default, with exported
   `PopulationStatsProps = { entries: readonly PopulationEntry[]; totalLiving: number }` — spec
   §3.12's two members exactly (`PopulationEntry` imported from `@/lib/battle/useSimulation`, which
   re-exports it; never re-declared). Rendered by `<BattleSimulationView>` inside `<SidebarContent>`
   wrapped in `<SidebarSection title="Population Analysis">` (the mockup's title,
   `petri-dish-play-mode.html:568`; `<SidebarSection>` owns the `<h2>`, the component never renders
   a heading). `entries={sim.population}` and `totalLiving` per FD3 — passed straight from the
   hook's published view, in the hook's order, unmodified.

2. **One horizontal bar per organism — colour, name, count, percentage — in the PUBLISHED order
   (FR-4.6, M2).** Each entry is one row: a 10×10 colour swatch, the organism's name, `"<count>
   (<pct>%)"`, and an 8 px bar whose fill width is `pct%` in the organism's colour. Rows render in
   `entries` order — the component NEVER sorts, and a unit test hands it a deliberately unsorted
   array and asserts DOM order equals prop order (the hook's sort is the contract; a second sort
   here is where the two would drift). Colour is `displayColor(colorToken, MAX_AGE_SHADE)` (the
   identity shade — the same LUT the dish and `<OrganismRoster>`'s chips go through; FD4), applied
   as an inline `style` (an already-resolved runtime hex, the `<ColorChip>` precedent in
   `OrganismRoster.tsx:88-100` — AR-46 has nothing to object to) on the swatch and the bar ONLY.
   Name and count text are `--gol-text-primary` / `--gol-text-secondary`, never the organism colour
   (FD4 — the mockup colours the text; Story 2.12 declined for the same palette-tunability reason
   and this story follows it). `pct` displays as `Math.round(pct)` (FD5); counts and the total as
   `toLocaleString('en-US')` (Story 2.14 trap 10 — the locale is pinned, never the runtime's).

3. **An extinct organism sits at the bottom with the skull (FR-4.6).** For `entry.extinct === true`
   (the FLAG — never `count === 0` or `pct === 0` re-derived here): the swatch is hollow
   (`background: transparent`, `borderColor: <hex>` — the mockup's `.pop-item.extinct` indicator),
   the name and count drop to `--gol-text-secondary`, a `☠` (U+2620) follows the name as `<span
   role="img" aria-label="extinct">`, the bar fill is `0%`. ❌ NOT the mockup's `opacity: 0.4` on the
   row (FD2 — it takes every text in the row below 4.5:1 and axe measures through opacity). "At the
   bottom" is the hook's ordering (living first, extinct last, 3.10 obligation 6) — this story
   renders it, tests it end to end, and adds no logic for it. An organism that was never placed
   (H.2's added-not-painted roster member) is extinct at cycle 0 and shows the skull from the first
   publish — correct, not a bug.

4. **A "Total Living Cells" row closes the section (FR-4.6; spec §3.12 `totalLiving`).** Below the
   rows, separated by `1px solid var(--gol-border)`, label `Total Living Cells` (text-secondary,
   uppercase by CSS) and the value (text-primary, 600). `totalLiving` is the sum of `entry.count`
   over `entries`, computed in `<BattleSimulationView>` as a plain render expression (FD3) — so the
   row always agrees with the bars above it, which is what the `pct` denominator was. An EMPTY
   `entries` (a battle run with nothing placed — Run is enabled for `runOrganisms === []`) renders a
   stated placeholder line "No organisms in this battle" (text-secondary) in place of the list and
   `Total Living Cells 0` — never an empty `<ul>` (the 2.12 `Population: —` rule: a label with
   nothing after it is an unstated placeholder).

5. **`<CycleCounter>` renders as the SECOND Run-sidebar section (spec §2; FR-4.5).** New file
   `apps/web/components/battle/simulation/CycleCounter.tsx`, exported default, `CycleCounterProps =
   { cycle: number }` (spec §3.12, exactly). Wrapped by the view in `<SidebarSection title="Cycle
   Count">` (FD1 — the mockup's cycle box has no `<h3>`; the label text becomes the section's `<h2>`
   so every sidebar block is one shape and the route's heading structure stays flat). The value is
   the mockup's `.cycle-value` (32px, 600, `--gol-accent`, `letterSpacing: 3px`,
   `fontVariantNumeric: 'tabular-nums'`, centred), zero-padded to FOUR digits (`0042`; spec §3.12
   "zero-padded display per mockup"), with the PADDING rendered in its own `aria-hidden` span and
   the digits as plain text (FD6) — so a screen reader hears "42", never "zero zero four two", and
   `9999 → 10000` simply grows (no truncation, no modulo). `cycle={sim.cycle}` straight through.

6. **The counter starts at 0 and increments per cycle, including manual steps (FR-4.5).** View
   tests: mounts at `0000`; one `Next cycle` click → `0001`; three clicks → `0003`; Play + frames at
   10 gen/sec → the text follows every published cycle; `Stop & reset` → `0000`; `pause()` after an
   odd cycle at 20 gen/sec shows the EXACT cycle (the hook's unconditional publish — trap 1). The
   root's `data-cycle` / `data-status` attributes STAY (FD7 — they are the test handle 74 assertions
   already use; the text is the user's); the comment that says "until Story 3.14 renders them as
   text" is rewritten, not the attributes.

7. **Updates land at the publish cadence and never per frame (M2, AR-29; NFR-1.1).** A view test
   wraps `<BattleSimulationView>` in React's `<Profiler onRender>` and counts COMMITS: at 10
   gen/sec, N stepping frames = N commits and an idle frame (delta below the period) = 0 commits; at
   20 gen/sec, 4 stepping frames = 2 commits (`cyclesPerPublish(20) === 2`) while `drawDiff` was
   called 4 times. Neither new component holds state, a ref, an effect or a memo; the view adds NO
   hook for either — `sim.population`, `sim.cycle` and the reduce for `totalLiving` are read in
   render (AC8 of 3.13 continues: the view is a hook consumer, not a state owner). ❌ No `aria-live`,
   no `role="status"`, no `<output>` anywhere in either component — a 10 Hz live region is the
   announcement storm 2.12 FD3 rejected at commit cadence, and M2's cadence is a rendering budget,
   not an announcement policy (FD8).

8. **Accessible structure, axe-clean in every state (UX-DR17, NFR-4.1, WCAG 1.3.1/1.4.1).** The
   rows are a real list — `<ul role="list">` (the explicit role is load-bearing: WebKit drops list
   semantics from a `list-style: none` list, so Playwright's `getByRole('listitem')` finds nothing
   on the `webkit`/`tablet` projects without it — trap 5) of `<li>` items whose VISIBLE text is the
   accessible content: name, then `"4 (33%)"`, plus the skull `img` for extinct rows. Swatch and bar
   are `aria-hidden` (decorative — the name and the percentage already state what they show, and
   colour is a redundant channel, WCAG 1.4.1). No `role="img"` on the row (2.12 used it because its
   entries were a chip and a bare number; these rows carry the name as text). `vitest-axe` passes on
   `<PopulationStats>` with a living/extinct mix, with all-extinct entries, and empty; on
   `<CycleCounter>` at 0 and 12345; and on the whole `<BattleSimulationView>` paused, playing and
   after a Stop. The e2e runs `AxeBuilder` on the route in Run mode while PLAYING with an extinct
   row present.

9. **Tokens only, contrast gated, no motion (AR-46, NFR-8.1; RFC-003 "No UI animation running
   during simulation steps").** Every static colour is an existing `--gol-*` token already gated
   in `themeTokens.test.ts` (`text-primary` / `text-secondary` / `accent` on `bg-primary` under text
   pairs; `border` is the decorative divider it is documented as); the two dynamic colours are the
   palette's identity shades, gated ≥ 3:1 vs `#0a0a0a` by `palette-cvd-validation.md` G1 (worst
   5.12) — sufficient for the swatch and bar (non-text, SC 1.4.11) and exactly why they are NOT
   used for text (AC2). ❌ **No `transition`** on the bar (the mockup's `width 0.3s ease-out` is a
   bar in perpetual motion at 10 Hz, and this route has lost three transitions to mid-fade axe
   scans — `EditorStatusBar.tsx`'s comment block is the record). No `opacity` (AC3), no
   `box-shadow`, no raw hex or `rgb()` in either `.tsx` (the AR-46 lint catches functional notation
   too), no new token, no `themes.css` change.

10. **The engine chunk stays off the route's first load (AR-35, 3.11 AC8).** Both components are
    imported only by `<BattleSimulationView>` (behind `next/dynamic`) and import nothing new to the
    route — `displayColor` (`displayOrganisms.ts` → `<BattleEditorView>`) and `SidebarSection` are
    already in `/battle`'s first-load payload. `bundle:check` passes with `check-bundle-size.mjs`
    unchanged; the Dev Agent Record reports `/battle`'s first-load gzip (expected: 308.6 KB within
    noise, 1.4 KB headroom) and the Run chunk's new size (5.2 KB gzip after 3.13). If `/battle`
    moves by more than noise, say why — `deferred-work.md`'s 3-11 entry names the next mechanism
    (split the `PetriDishCanvas` variants), never the threshold.

11. **Gates hold; count tests are converted, not deleted; bookkeeping is done.** `npm run ci`'s
    stages all pass except the two PRE-EXISTING local-WebKit failures of Story 3.12's "Tab reaches
    Play…" e2e (`deferred-work.md`, 3-13 section — report them by name, do not fix them here and do
    not claim exit 0 if it is 1 for that reason alone). Nothing in `packages/*`. `spec:check`
    resolves every ID cited here and in code. The three h2-count assertions and the 3.11 e2e
    heading assertion flip from one section to three (Task 5). `deferred-work.md` entries that name
    this story are closed or re-pointed with a reason (Task 6).

## Tasks / Subtasks

- [x] **Task 1 — `<PopulationStats>`** (AC1, AC2, AC3, AC4, AC8, AC9; FD2, FD4, FD5, FD8)
  - [x] New `apps/web/components/battle/simulation/PopulationStats.tsx` (`'use client'`). Head
    comment: spec §3.12's responsibility line; that it is presentational and total (the
    `<SpeedControl>` shape — no hook, no state, no `sim`, NO SORT: order is the hook's, M2); why the
    colour is an inline resolved hex (the `OrganismRoster.tsx` `ColorChip` comment, condensed) and
    why it is on the swatch and bar only (FD4); why the extinct row is not `opacity` (FD2); that
    Story 3.18's HUD pills and 4.15's preview are the "compact variants" spec §8 names and that
    this story ships the sidebar shape only — no `variant`/`compact` prop until a consumer exists
    (the dead-affordance rule applied to props, 3.11 FD5's reasoning).
  - [x] Imports: `styled` from `@mui/material/styles`; `displayColor`, `MAX_AGE_SHADE` from
    `@/lib/palette/displayColor`; `type PopulationEntry` from `@/lib/battle/useSimulation`.
  - [x] Styled blocks (values from the mockup, `petri-dish-play-mode.html:341-419`):
    `List = styled('ul')` (`listStyle: 'none'; margin: 0; padding: 0; display: flex;
    flexDirection: 'column'; gap: 10px` — `.population-stats`);
    `Row = styled('li')` (`display: flex; flexDirection: column; gap: 4px` — `.pop-item`);
    `Header = styled('div')` (`display: flex; justifyContent: space-between; alignItems: center;
    gap: 8px; fontSize: 10px; fontWeight: 600; letterSpacing: 0.5px` — `.pop-header`);
    `Name = styled('span')` (`display: flex; alignItems: center; gap: 6px; minWidth: 0;
    textTransform: uppercase; color: var(--gol-text-primary); overflowWrap: anywhere` — the
    roster's 50-character rule) with a `'&[data-extinct="true"]'` variant → `color:
    var(--gol-text-secondary)` (or a prop-driven styled variant — either; no `opacity`);
    `Swatch = styled('span')` (`width: 10px; height: 10px; flexShrink: 0; border: 1px solid` — the
    hex arrives via inline `style={{ background, borderColor }}`; extinct: `background:
    'transparent'`);
    `Skull = styled('span')` (`fontSize: 14px; marginLeft: 5px` — `.pop-extinct-indicator`);
    `Count = styled('span')` (`fontSize: 11px; color: var(--gol-text-secondary); flexShrink: 0;
    fontVariantNumeric: 'tabular-nums'`);
    `BarTrack = styled('div')` (`width: 100%; height: 8px; background: var(--gol-bg-secondary);
    border: 1px solid var(--gol-border); overflow: hidden` — `.pop-bar-container`; `border` is
    decorative here exactly as `themeTokens.test.ts` documents it — the bar is not a control);
    `BarFill = styled('div')` (`height: 100%` — width and background inline). ❌ No `transition`,
    no `opacity`, no `box-shadow`, no `position`, no `rgb(`.
    `Total = styled('div')` (`marginTop: 8px; paddingTop: 8px; borderTop: 1px solid
    var(--gol-border); display: flex; justifyContent: space-between; fontSize: 10px; color:
    var(--gol-text-secondary); textTransform: uppercase; letterSpacing: 0.5px` — `.total-living`);
    `TotalValue = styled('span')` (`color: var(--gol-text-primary); fontWeight: 600; fontSize:
    12px`); `Empty = styled('p')` (`margin: 0; fontSize: 11px; color: var(--gol-text-secondary)`).
  - [x] Render:
    ```tsx
    export interface PopulationStatsProps {
      /** The hook's published, pre-sorted entries (`sim.population`) — rendered in THIS order. */
      entries: readonly PopulationEntry[];
      /** Sum of `entries[].count` — the same denominator `pct` was computed against. */
      totalLiving: number;
    }
    // ...
    {entries.length === 0 ? (
      <Empty>No organisms in this battle</Empty>
    ) : (
      <List role="list">
        {entries.map((entry) => {
          const color = displayColor(entry.colorToken, MAX_AGE_SHADE);
          return (
            <Row key={entry.organismId}>
              <Header>
                <Name data-extinct={entry.extinct}>
                  <Swatch aria-hidden="true"
                          style={{ background: entry.extinct ? 'transparent' : color, borderColor: color }} />
                  <span>{entry.name}</span>
                  {entry.extinct && <Skull role="img" aria-label="extinct">☠</Skull>}
                </Name>
                <Count data-extinct={entry.extinct}>
                  {entry.count.toLocaleString('en-US')} ({Math.round(entry.pct)}%)
                </Count>
              </Header>
              <BarTrack aria-hidden="true">
                <BarFill style={{ width: `${entry.pct}%`, background: color }} />
              </BarTrack>
            </Row>
          );
        })}
      </List>
    )}
    <Total>
      <span>Total Living Cells</span>
      <TotalValue>{totalLiving.toLocaleString('en-US')}</TotalValue>
    </Total>
    ```
    `key={entry.organismId}` is unique by construction (`derivePopulation` de-duplicates ids —
    its head comment). The bar width uses the UNROUNDED `pct` (a 0.4 % organism still shows a
    sliver); the text uses the rounded one. `'transparent'` is a CSS keyword, not a colour
    literal — check the AR-46 selector tolerates it (it targets hex and `rgb()`/`hsl()`
    functions); if it does not, drop the `background` key on extinct rows instead of adding a
    disable comment. `displayColor` warns ONCE on an unknown token (Decision I.4) — the e2e
    asserts a clean console, so the fixture rosters use real tokens (they do).
  - [x] `PopulationStats.test.tsx` beside it (`renderStats(entries, totalLiving?)` helper; fixture
    entries built by hand as `PopulationEntry` literals with `createMockOrganisms()`' names and
    tokens, NOT through `derivePopulation` — the component's contract is "render what you are
    given"): (a) one `listitem` per entry, in PROP order, with a deliberately unsorted input
    (e.g. `[extinct, count 1, count 9]`) — DOM order equals prop order; (b) each row's text is
    `<name>` + `"<count> (<rounded pct>%)"` — `33.333… → 33`, `66.666… → 67`, `0.4 → 0` while the
    row is NOT marked extinct and has no skull; (c) `1234 → "1,234"`; (d) an extinct row has the
    `img` named `extinct`, a transparent swatch, `width: 0%` fill; living rows have no `img`;
    (e) swatch `background` and fill `background` equal `displayColor(token, MAX_AGE_SHADE)` for
    that entry and fill `width` is `${pct}%` (the unrounded value); (f) the swatch and the track
    are `aria-hidden`; (g) `Total Living Cells` shows `totalLiving` formatted; (h) empty
    `entries` → no `list`, the "No organisms in this battle" text, `Total Living Cells 0`;
    (i) the `<ul>` carries `role="list"` explicitly (trap 5 — assert the attribute, not just the
    role); (j) `axe` on the mixed, all-extinct and empty renders (the series-with-`unmount`
    pattern from `SpeedControl.test.tsx`).

- [x] **Task 2 — `<CycleCounter>`** (AC5, AC6, AC8, AC9; FD1, FD6)
  - [x] New `apps/web/components/battle/simulation/CycleCounter.tsx` (`'use client'`). Head
    comment: spec §3.12 (`{ cycle }`, zero-padded per mockup); presentational and total; FD1 (the
    mockup's accent-bordered box becomes a `<SidebarSection>` — one chrome for every sidebar block,
    and the `.cycle-label` text is the section's `<h2>`); FD6 (why the padding is a separate
    `aria-hidden` span). Styled: `Counter = styled('div')` (`textAlign: center; padding: '4px 0
    8px'`), `Value = styled('div')` (`fontSize: 32px; fontWeight: 600; color: var(--gol-accent);
    letterSpacing: 3px; fontVariantNumeric: 'tabular-nums'` — `.cycle-value`). The mockup's `2px
    solid var(--accent)` box border is NOT reproduced (it would be a second border inside the
    section's own — recorded as a mockup-reconciliation note, Task 6). No `transition`.
  - [x] Render:
    ```tsx
    export interface CycleCounterProps { cycle: number }
    const CYCLE_DIGITS = 4; // the mockup's `0042`
    const digits = String(cycle);
    const padding = '0'.repeat(Math.max(0, CYCLE_DIGITS - digits.length));
    <Counter>
      <Value>
        {padding !== '' && <span aria-hidden="true">{padding}</span>}
        {digits}
      </Value>
    </Counter>
    ```
    No `role`, no `aria-live`, no `<output>` (FD8). No `toLocaleString` on the cycle — a grouped
    `10,000` inside a zero-padded field is two number styles in one glyph run; the counter is a
    tabular odometer, not a quantity.
  - [x] `CycleCounter.test.tsx`: `0 → "0000"` with textContent and an `aria-hidden` span holding
    `"000"`; `42 → "0042"`; `9999 → "9999"` with NO padding span; `12345 → "12345"` (no truncation);
    the digits are NOT inside the hidden span (query the hidden span's text and assert it is
    zeros only — this is the FD6 guarantee); `axe` at 0 and 12345.

- [x] **Task 3 — Wire both sections into `<BattleSimulationView>`** (AC1, AC4, AC5, AC7; FD3, FD7)
  - [x] `BattleSimulationView.tsx`: import `PopulationStats from './PopulationStats'` and
    `CycleCounter from './CycleCounter'`. Inside `<SidebarContent>`, ABOVE the Speed section:
    ```tsx
    <SidebarSection title="Population Analysis">
      <PopulationStats entries={sim.population} totalLiving={totalLiving} />
    </SidebarSection>
    <SidebarSection title="Cycle Count">
      <CycleCounter cycle={sim.cycle} />
    </SidebarSection>
    ```
    where `const totalLiving = sim.population.reduce((sum, e) => sum + e.count, 0);` sits in the
    body as a plain expression with a comment (FD3): O(roster) per publish, ≤ 255 terms, computed
    exactly when the view re-renders anyway — a `useMemo` here is ceremony over nothing; and it is
    the sum of the displayed counts by design, so the total and the bars can never disagree.
    Rewrite the existing order comment (3.14 is here now; 3.16 adds Grid Size BELOW Speed), the
    head comment's "Deliberately ABSENT, by story" list (drop `<CycleCounter>` /
    `<PopulationStats>`), `SidebarContent`'s comment ("It holds the Speed section (3.13)" → the
    three sections), and the `data-status` / `data-cycle` comment at the root (FD7: the attributes
    STAY as the test handle; the text the user reads is the counter's). Nothing else in the file
    changes — no new hook, state, ref, effect or callback.

- [x] **Task 4 — `<BattleSimulationView>` tests** (AC2, AC3, AC6, AC7, AC8)
  - [x] `BattleSimulationView.test.tsx`, new `describe('BattleSimulationView — cycle counter &
    population stats (Story 3.14)')`, driving frames with `installFrameDriver()` (3.12 FD4) and
    `installContexts()` where a paint is observed. The module fixture `GRID` places `a` (3 cells)
    and `b` (3 cells) and leaves `c` unplaced — the extinct-at-cycle-0 case for free.
    (a) Mount: three h2s in order `Population Analysis`, `Cycle Count`, `Speed`; three `listitem`s
    in order `a`, `b`, `c` (living first — tie at 3 → roster order, then extinct); `c` carries the
    `img` named `extinct`, `a`/`b` do not; each living row reads `3 (50%)`, `c` reads `0 (0%)`;
    `Total Living Cells` `6`; the counter reads `0000`.
    (b) Manual steps: click `Next cycle` → counter `0001` and `data-cycle` `"1"` agree; twice more →
    `0003`. (Do not assert cell counts after a step — 3.12 trap 7: the mock organisms' rules are
    not Conway and the fixture's blinkers collide.)
    (c) Population follows a publish, deterministically: a second fixture — `organisms:
    [CONWAYS_CLASSIC]` (from `@gol/domain`), `palette` rebuilt for it, grid with ONE lone cell —
    reads `1 (100%)` / total `1` at mount; one `Next cycle` → the lone cell dies under Conway's
    rules: `0 (0%)`, the `img` named `extinct` appears, total `0`, counter `0001`. (No auto-pause
    yet — 3.15 — so the run simply continues; nothing here asserts on `status`.)
    (d) Stop: after (c), click `Stop & reset` → `1 (100%)`, no skull, total `1`, counter `0000`.
    (e) Cadence (AC7): wrap the view in `<Profiler id="run" onRender={spy}>`; click `Play`,
    `frame(0)` (prime), then at 10 gen/sec `frame(100)`, `frame(200)`, `frame(300)` → three commits
    (count `spy` calls after the prime), then `frame(310)` (below the period) → zero further
    commits and `drawDiff` unchanged; change the slider to `'4'` (20 gen/sec) — `setSpeed` writes
    `genPerSec` state, so that is ONE commit of its own: re-baseline the count AFTER the change —
    then fire `frame(360)`, `frame(410)`, `frame(460)`, `frame(510)` → `drawDiff` +4, commits +2
    (cycles 4–7 stepped, 4 and 6 published), the counter reading `0006` (trap 1). Then click
    `Pause` → one commit, the counter `0007` (the unconditional publish).
    (f) `axe` on the container paused (with the extinct row), playing, and after Stop.
  - [x] Convert `it('renders the footer’s Back button, the transport bar and the Speed section:
    four buttons, one h2, one slider')`: buttons stay `4`; `queryAllByRole('heading', { level: 2
    })` `1` → `3`, named `Population Analysis`, `Cycle Count`, `Speed` in that order (exact names);
    slider stays `1`. Rewrite its comment: 3.14 is here now; 3.16's second slider is what fails it
    next.

- [x] **Task 5 — e2e and the cross-file conformance sweep** (AC3, AC6, AC8, AC11)
  - [x] `apps/web/e2e/battleRoute.spec.ts`, new `test.describe('Cycle counter & population stats
    (Story 3.14)')`. Reuse `runButton`, `labButton`, `dish`, `sidebarHeadings`, `collectErrors`,
    `seedWorkspace`, `speedSlider`. Add a module-scope `populationRows = (page) =>
    page.getByRole('complementary').getByRole('listitem')` beside the others. Add nothing to
    `@gol/test-utils`.
    (a) Three-Way Skirmish (`MOCK_BATTLE_IDS.battleA`): enter Run → `sidebarHeadings(page)` has
    text `['Population Analysis', 'Cycle Count', 'Speed']`; three rows in roster order (`Aggressive
    Colonizer`, `Patient Defender`, `Chaotic Spreader` — three 2×2 blocks, 4 cells each, a
    three-way tie → roster order), each `4 (33%)`, no `img` named `extinct`; `Total Living Cells`
    `12`; the Cycle Count section reads `0000`.
    (b) `Next cycle` → the section reads `0001` and `[data-cycle]` is `"1"`; `Stop & reset` →
    `0000`.
    (c) Play → `expect.poll` until the counter's text differs from `0000` (the file's idiom); while
    PLAYING, `AxeBuilder` on the route → zero violations; then `Pause`.
    (d) Extinct row end to end: Grand Colony War (`MOCK_BATTLE_IDS.battleB`) in an e2e-seeded
    workspace carries a dangling Conway id — RUN is DISABLED there (3.11's last test), so it is
    NOT the extinct fixture. Instead, in `/battle/new`: add ONE organism from the library via the
    roster (Story 2.10's flow — reuse that block's locators), paint NOTHING, enter Run (Run is
    enabled for an empty-grid roster): one row, `0 (0%)`, the `img` named `extinct` present, total
    `0`, and axe zero violations. If the 2.10 flow proves too heavy to reuse, paint one cell, enter
    Run and step once with Conway's Classic as the roster's only organism — a lone cell dies at
    cycle 1 (Task 4 (c)'s route-level twin) — and record which path shipped.
    (e) Round trip: after (b)'s steps, `Lab` → `Run` → the counter is back at `0000` and the rows
    at `4 (33%)` (a new session).
    Every test: `collectErrors(page)` empty. All four Playwright projects — (a) is the one that
    catches trap 5 on `webkit`/`tablet`.
  - [x] Convert the 3.11 block's two `await expect(sidebarHeadings(page)).toHaveText(['Speed'])`
    (`:2006`, `:2306`) to the three-title array, and rewrite their comments.
  - [x] `BattlePage.test.tsx`: the two Lab → Run assertions that expect `1` h2 after Run
    (`:2722` region and its sibling) become `3` (named, exact); the Lab-side `4`s stay. The
    comment "3.14 raises this to three" is now the present tense — rewrite it so 3.16 (no new h2 —
    Grid Size is a section too, so `4`) is what changes it next.
  - [x] Grep `apps/web` for "3.14", "Story 3.14", "PopulationStats", "CycleCounter" in comments
    (`BattleSimulationView.tsx`, `population.ts`, `gridStats.ts`, `useSimulation.ts`,
    `EditorStatusBar.tsx` — its "FR-4.5's real counter is Story 3.14's" sentence stays true and
    stays; `simulation/README.md`) — every future-tense sentence now false gets rewritten; every
    one describing a contract this story honours stays. `simulation/README.md`'s "What goes here"
    list already names both components; add nothing unless a name differs.

- [x] **Task 6 — Bookkeeping** (AC10, AC11)
  - [x] `deferred-work.md`: (1) the 2-12 review entry "**The stats row's surplus is now a contained
    scroll…** Pick this up in Story 3.14" — RE-POINT with a reason: the Run sidebar renders
    population as a vertical list inside `SidebarContent`'s `overflow-y: auto` region (255 rows
    scroll, nothing is hidden), so the Run side has no such problem; the LAB status bar's
    horizontal overflow is untouched by this story and goes to whichever story next edits
    `<EditorStatusBar>` or Story 6.11. (2) The 2-14 entry "**"Living Cells" is formatted with a
    thousands separator in the sidebar and without one in the status bar** … Pick this up in
    whichever story next edits `<EditorStatusBar>` (3.14 rebuilds that row for Run mode)" —
    correct the parenthetical (3.14 did not edit `<EditorStatusBar>`; the Run sidebar pins
    `en-US` with a separator, so two of three surfaces now agree and the status bar is the odd
    one out) and leave the owner as stated. (3) The 2-15 review entry "**No `<PetriDishCanvas>`
    test pins a CLEAR specifically** … Pick this up in Story 3.14 (Play mode's canvas…)" —
    re-point to Story 3.16 (this story does not touch the canvas; 3.16's ephemeral resize is the
    next external-grid-change source). (4) The 3-11 amendment-candidate list — append item 8:
    "Checked by Story 3.14: §3.12's `PopulationStatsProps` and `CycleCounterProps` shipped exactly
    as specced" plus the one FACT the spec leaves open — `totalLiving` is not published by the
    hook; the consumer sums `entries[].count` (FD3) — as a §3.12 clarification candidate.
    (5) New "Deferred from: Story 3-14" section: the mockup's accent-bordered cycle box and
    title-less cycle section (FD1 — mockup-refresh candidate); the mockup's coloured name/count
    text (FD4 — a contrast-sweep against a tunable palette is what would license it; 4.15's
    preview and 3.18's HUD pills inherit the same call, and the HUD mockup's `color: <hex>` on
    pills is the same question); the mockup's `opacity: 0.4` extinct row and `transition: width`
    bar (FD2, AC9); the "compact variant" question for 3.18 / 4.15 — a `compact` prop on
    `<PopulationStats>` vs a sibling `<PopulationPills>` — with this story's recommendation (a
    sibling: the HUD shape has no name, no bar and no total, so it shares data, not markup);
    the FD5 rounding rule (a living organism at `< 0.5 %` reads `0%` beside a non-zero count — a
    `< 1%` display is a UX call, not taken here); and the "No organisms in this battle" copy as a
    UX-copy candidate.
  - [x] `npm run ci > /tmp/ci-3-14.log 2>&1; echo $?` — never pipe to `tail`. Record the exit
    code, which e2e failed if any (expected: only 3.12's local-WebKit Tab test, by name), `/battle`
    first-load gzip + headroom (AC10), the Run chunk size, `bench:check` (unchanged), and the
    unit/e2e counts in the Dev Agent Record.

### Review Findings

Reviewed on **Opus** against a **Sonnet** implementation (2026-09-16), via three parallel adversarial
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 `decision-needed`, 11 `patch` (all
applied in the review commit), 1 `defer`, 15 dismissed as noise.

- [x] [Review][Patch] Cadence test's frame-to-cycle comments were off by one frame — the loop banks
  10 ms at `frame(310)` and clamps the bank to the NEW 50 ms period before adding the delta
  (`simulationLoop.ts` FD3), so `frame(360)` already steps to cycle 4; 410/460/510 are cycles 5/6/7,
  with 4 and 6 published. The assertions (`drawDiff` +4, commits +2, `0006`, `0007` on Pause) were
  already consistent with the real arithmetic; the labels were not
  [apps/web/components/battle/simulation/BattleSimulationView.test.tsx:758-761]
- [x] [Review][Patch] The stated reason for avoiding `getByText` on the counter was wrong in three
  files ("matches the same collapsed text at two ancestor levels"). RTL's default matcher reads an
  element's OWN text nodes only, so a glyph run split across the `aria-hidden` padding span and a
  bare text node (FD6) is simply never found as one string; a `textContent` function matcher is
  what matches every ancestor. Comments rewritten to say what is true; `CycleCounter.test.tsx`'s
  `valueNode` fallback (`div > div`) also hit Counter rather than Value from the RTL container —
  now `div > div > div` in every case
  [apps/web/components/battle/simulation/CycleCounter.test.tsx:6-12,
  BattleSimulationView.test.tsx:608-610, apps/web/e2e/battleRoute.spec.ts:2445-2447]
- [x] [Review][Patch] `toHaveTextContent` is a substring match, so `0042` accepted `00042` and
  "12345 in full, with no truncation" accepted `012345` — every counter assertion is now exact
  `textContent` equality, and the ad-hoc `.not.toContain('0000')` is gone
  [apps/web/components/battle/simulation/CycleCounter.test.tsx:20-46]
- [x] [Review][Patch] Task 1 (j)'s "mixed" axe fixture had no extinct row (one living entry), and the
  all-extinct render was scanned with `totalLiving = 4` — an impossible state. The mix is now a real
  living + extinct pair (the one row shape that puts text-secondary beside text-primary and adds
  the skull `img`) and the all-extinct total is `0`
  [apps/web/components/battle/simulation/PopulationStats.test.tsx:157-163]
- [x] [Review][Patch] Task 5 (e)'s round trip clicked `Stop & reset` BEFORE leaving for Lab, so the
  post-round-trip `0000` / `4 (33%)` were values the test had already forced — it could not tell a
  new session from a preserved one. The test now leaves for Lab at cycle 1 (the story's literal
  "after (b)'s steps" included the Stop; its stated intent, "a new session", did not survive it)
  [apps/web/e2e/battleRoute.spec.ts:2569-2594]
- [x] [Review][Patch] Test (f)'s "playing" axe scan ran after `frame(0)` alone — the clock prime, no
  step, no publish — so the DOM scanned "while playing" was the paused DOM with a different button
  label. One published cycle (`frame(100)` at 10 gen/sec, `0001` asserted) now precedes the scan
  [apps/web/components/battle/simulation/BattleSimulationView.test.tsx:772-785]
- [x] [Review][Patch] AC6's "Play + frames at 10 gen/sec → the text follows every published cycle"
  was never asserted on the text (only on commit / `drawDiff` counts); `cycleText() === '0003'`
  after `frame(300)` added [apps/web/components/battle/simulation/BattleSimulationView.test.tsx:748]
- [x] [Review][Patch] AC8's e2e condition — "`AxeBuilder` … while PLAYING with an extinct row
  present" — was split across (c) (playing, no extinct row) and (d) (extinct row, paused). (d) now
  also presses Play, polls the counter past `0001`, scans with the skull row present, then pauses
  [apps/web/e2e/battleRoute.spec.ts:2560-2564]
- [x] [Review][Patch] Dead `data-extinct` attribute on `Count` — no `&[data-extinct]` rule exists on
  it (it is always text-secondary), so it was emitted on every row for nothing while the `Name`
  comment implied the attribute is what selects the extinct step. Removed, with a one-line comment
  on `Count` saying the step is `Name`'s alone. (The story's own render snippet carried it — a
  snippet slip, not a dev deviation.) [apps/web/components/battle/simulation/PopulationStats.tsx:175]
- [x] [Review][Patch] Magic counts in a source comment ("the test handle 35 unit and 39 e2e
  assertions already use") were already stale in the same diff that wrote them; dropped the numbers
  [apps/web/components/battle/simulation/BattleSimulationView.tsx:200-201]
- [x] [Review][Patch] Dev Agent Record arithmetic: "All eight recorded" — nine FDs (FD1–FD9) are
  listed and taken; "records the five items Task 6 named" — Task 6 (5) names six and six bullets
  were written. Corrected in place [this file, Completion Notes]
- [x] [Review][Defer] `textTransform: uppercase` on the organism NAME in `<PopulationStats>` —
  Chromium exposes the transformed string in the accessibility tree, so VoiceOver/NVDA can read
  "PATIENT DEFENDER" as an acronym or spell it. This is the route-wide sentence-case-DOM /
  uppercase-CSS convention (every `<SidebarSection>` `<h2>`, the Lab status bar) and not new here;
  the fix is an AT sweep call, not an axe one [apps/web/components/battle/simulation/PopulationStats.tsx:71]
  — deferred, pre-existing (Story 6.11's AT pass)

Dismissed (recorded so the next reviewer does not re-raise them): `pct` NaN / negative / >100 and
`cycle` negative / fractional / NaN guards (the hook's published contract — `derivePopulation`
bounds `pct`, the loop's cycle is a non-negative int; the component is total over what it is
given, not a validator); empty `name` / duplicate `organismId` (schema and `derivePopulation`'s
de-duplication own those); e2e (d)'s `before = 2` literal (the file's own 2.9 precedent, same
comment); `Skull` `marginLeft: 5px` inside `Name`'s `gap: 6px` (the mockup has both, `:363-368` /
`:398-401`); `letterSpacing: 3px` centring skew (the mockup's treatment); the `drawDiff` prototype
spy "never restored" (the file's `afterEach` runs `vi.restoreAllMocks()`); the structural
`div > div` / `following-sibling::*[1]` handles (verified against `SidebarSection`'s
`<section><h2/>{children}</section>` — a `data-testid` is not this codebase's idiom; `data-*`
handles on the ROOT are); e2e (c) not asserting the counter holds after Pause (3.12's transport
block owns that); `view`/`enterRun` duplicated per e2e describe (the file's per-block idiom);
heading order asserted via `textContent` rather than accessible name (identical for these h2s);
the redundant exact-name `Speed` assertion after the ordered array (harmless belt-and-braces);
"`totalLiving` contract asserted in prose only" (FD3 is the story's decision and the §3.12
clarification candidate is recorded); the story's own miscount ("two" `BattlePage.test.tsx`
assertions to convert — the baseline had ONE `toHaveLength(1)` at `:2722`, the "sibling" is the
Lab-side `4` that stays; four conversions total, not trap 6's five — a story-doc slip, the code is
right).

Verification by the reviewer: 46/46 unit tests in the three story files after the patches;
`eslint` + `prettier --check` on every touched file clean; `spec:check` 245/245 ids resolve;
`tsc --noEmit` on `apps/web` clean; the 3.14 e2e block ran green on `chromium` AND `webkit`
(trap 5) locally before the patches (10/10) and the 3.11/3.13/3.14 blocks again after them. AC10's
bundle numbers and AC11's `bench:check` are the remote gate's to confirm — see the PR's
Verification section.

## Dev Notes

### Constraints the developer MUST follow

- **Scope: two presentational components, two sections, a reduce, tests, docs.** No extinction
  check or auto-pause (3.15 — the hook's thunk), no grid size slider (3.16), no gallery Run action
  (3.17), no fullscreen / HUD / pills (3.18), no hotkeys (3.19), no `<EditorStatusBar>` edit (Lab
  side — the deferred entries are re-pointed, not acted on). Nothing in `packages/*`. **No change
  to `useSimulation`, `population.ts`, `gridStats.ts`, `simulationLoop`, `GridRenderer`,
  `PetriDishCanvas`, `SimulationControlBar`, `SpeedControl`, `SidebarSection`,
  `check-bundle-size.mjs`, `themes.css`, `themeTokens.test.ts`.** If a fact you need is not
  published by the hook, the answer is FD3's reduce, not a hook change — and if it is genuinely
  more than a sum, stop and record it (the M14/M15 precedent), do not widen the hook here.
- **Hot state stays in the hook (RFC-005 Decision 5, AR-29).** The view gains zero hooks. Both
  components are stateless and total. A `useState`/`useRef`/`useEffect` in either, or a
  `useMemo` in the view "to avoid the reduce", is the drift 3.10 FD6 exists to prevent.
- **The components never see `sim`.** Props are spec §3.12's members. `PopulationEntry` is
  imported from `@/lib/battle/useSimulation` (re-exported there), never re-declared (the type IS
  §3.12's `entries` element shape — 3.10 shipped it to spec).
- **The component never sorts, filters or re-derives extinction.** Order and `extinct` are the
  hook's (M2 — "logic … upstream"). Task 1 (a) is the test that reddens if a `.sort` or a
  `count === 0` check sneaks in.
- **`components/battle/` is split by mode (`simulation/README.md`).** Both files go in
  `simulation/`; `<SidebarSection>` is root-level (shared) and is imported from `../SidebarSection`.
  Import nothing from `editor/` — `<EditorStatusBar>`'s `ColorChip` is COPIED in kind (10 px, the
  play mockup's size, not 16), never imported (the README's boundary rule).
- **Repositories are injected, never imported (AR-2, AR-27).** Nothing here touches one.
- **`apps/web` rules:** strict TS, no `any`/`!`/`@ts-ignore`; `export type` for types; camelCase
  filenames; `@gol/*` by package name; `@gol/test-utils` and `@/test-support` only from tests;
  no raw colour literals — hex OR `rgb()`/`hsl()` — in `.tsx` (AR-46 lint; the two dynamic hexes
  arrive as runtime VALUES through `style`, which is the sanctioned path — `OrganismRoster.tsx`,
  `EditorStatusBar.tsx`, `BattleTile.tsx`); `styled()` for static chrome, no `sx`, no MUI
  `LinearProgress` / `List` / `Typography` on the battle route (FD9). No `transition`, no
  `opacity` on anything carrying text.
- **Never read or write a ref during render**; `react-hooks/refs`, `set-state-in-effect`,
  `exhaustive-deps` are live. No React Compiler — memoise nowhere (this story says nowhere).
- **Comments explain WHY and cite by ID.** `spec:check` reads this file and the code: `FR-4.5`,
  `FR-4.6`, `AR-29`, `AR-31`, `AR-35`, `AR-46`, `M2`, `Decision B`, `Decision I`, `Story 3.10`
  exactly; `FR4.5`, `AR29`, `M-2` are silently exempt forever. `ACn` and `FDn` are story-relative
  and unchecked.
- **Commit gate.** The story subagent commits to its own `story/3-14-…` branch; merging is
  Sidiar's. Lane 4 is open in another worktree — its `sprint-status.yaml` diffs must not ride into
  this branch (3.8's review reverted exactly that).

### What this story is, in one paragraph

Story 3.10 published `cycle` and a pre-sorted, extinction-flagged `population` at ≤ 10 Hz so that
this story would have nothing to compute: `derivePopulation` already joins by id, de-duplicates,
sorts living-by-count-then-roster and extinct-last, and computes `pct` against the living total;
`pause()`, `step()` and `stop()` already publish unconditionally so the counter is exact whenever
the run is still. This story adds the two surfaces spec §2 puts above the Speed section — a list of
bars and a padded odometer — composed from settled patterns: `<SidebarSection>` for the heading
(2.11), the resolved-hex-through-`style` colour chip (2.9/2.12), the sentence-case-DOM /
uppercase-CSS rule, the pinned `en-US` locale (2.14), the no-`transition` rule, the frame driver and
`drawDiff` spies for view tests (3.12 FD4), the fail-forward count tests. What is DECIDED rather than
composed: the Cycle Count block's chrome (FD1), the extinct row's treatment without `opacity` (FD2),
where `totalLiving` comes from (FD3), organism colour on non-text only (FD4), the percent rounding
(FD5), how a zero-padded number is read aloud (FD6), that `data-cycle` survives (FD7), that nothing
here is a live region (FD8), and native list markup over MUI (FD9). The row idiom that ships here —
`<li>` with visible name and `"count (pct%)"`, decorative swatch and bar, skull as a named `img`,
no colour on text — is what 3.18's HUD pills and 4.15's compact preview will be measured against,
so get the semantics right once.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — The Cycle Count block's chrome.**
- **(a) `<SidebarSection title="Cycle Count">` wrapping a title-less `<CycleCounter>`**
  *(recommended)*. Spec §2 lists `<CycleCounter> "Cycle Count"` in the same form as
  `<PopulationStats> "Population Analysis"`; every sidebar block on both sides of the toggle is one
  `<section><h2>` shape, which is what keeps axe's `heading-order` settled for the route
  (`SidebarSection.tsx`'s own comment) and the three count tests uniform. The mockup's
  `.cycle-label` ("Cycle Count", 10 px, text-secondary) becomes the `<h2>`; the value keeps the
  mockup's 32 px accent tabular treatment. The accent `2px` box border is dropped (a border inside a
  bordered section is a double frame) — mockup-refresh candidate.
- **(b) Reproduce the mockup box as a sibling of the sections, no `<h2>`.** Faithful, but the
  route then has one sidebar block without a heading, the label is a bare `<div>`, and the h2
  counts go to 2 instead of the 3 every 3.13 comment predicted — a special case for one block.
- **(c) The box INSIDE a `<SidebarSection>`.** Double border, and the label duplicates the heading.

**FD2 — The extinct row's treatment.**
- **(a) Hollow swatch + text-secondary name/count + `☠` `img` + 0 % bar; no `opacity`**
  *(recommended)*. Three redundant channels (position — the hook puts it last; the glyph; the
  hollow swatch) plus a text-colour step that stays at 6.95:1 (`text-secondary` / `bg-primary`).
  The mockup's `opacity: 0.4` would put white text at ~3.3:1 and `--gol-text-secondary` far below
  that — axe's `color-contrast` folds element opacity into the foreground, so the scan in Task 4 (f)
  and Task 5 (c)/(d) would fail on exactly the row the story is about.
- **(b) The mockup's `opacity: 0.4`.** Fails AC8/AC9 as measured above.
- **(c) `opacity` on the swatch and bar only, text unchanged.** Legal, but the swatch is already
  hollow and the bar is already empty — nothing left to dim.

**FD3 — Where `totalLiving` comes from.**
- **(a) `sim.population.reduce((s, e) => s + e.count, 0)` in the view, as a plain expression**
  *(recommended)*. Spec §3.12 gives the component the prop; §4's hook return has no such member;
  `derivePopulation` computes `pct` against `computeEditorGridStats(...).livingCells` and discards
  it. The sum of the displayed counts is what the bars already normalise to (`pct` sums to 100 of
  it), so total and bars can never disagree; the engine can never produce the dangling ref that
  would make `livingCells` differ from the sum (`claims.ts` invariant 2 — `population.ts`'s own
  note), so the only case where the two numbers differ is a corrupt persisted grid at cycle 0,
  which Story 5.11 owns for the Lab bar too (`deferred-work.md` line ~365). O(roster) per publish,
  no memo (the view re-renders on publish regardless).
- **(b) Publish `livingCells` from the hook** (a `RunView` field + a `derivePopulation` return
  change). Exact, but a hook AND a `population.ts` signature change for one number, a §4 amendment
  candidate, and a total that can visibly disagree with its own bars in the corruption case.
- **(c) Sum inside `<PopulationStats>` and drop the prop.** Simpler, but departs from §3.12's
  props, which 3.12 and 3.13 each shipped "exactly as specced" and recorded so — and 4.15's preview
  may have a real total to pass.

**FD4 — Where the organism colour goes.**
- **(a) Swatch and bar only; name and count in text tokens** *(recommended)*. Non-text contrast
  (SC 1.4.11, 3:1) is gated for every identity shade by `palette-cvd-validation.md` G1 (worst 5.12
  vs `#0a0a0a`), and both sit on `--gol-bg-primary` (`#0a0a0a`, the section background). Text at
  10–11 px needs 4.5:1 against a palette RFC-007 Decision 1 declares developer-extensible — Story
  2.12 declined to colour its numbers for exactly this reason and this row follows it; the name
  as text is the FR-4.6 disambiguator for two organisms sharing a token, and it must stay legible
  regardless of which token that is.
- **(b) The mockup's coloured name/count text.** Happens to pass today (5.12 ≥ 4.5) and has no
  gate that says so tomorrow; and the extinct row's coloured text at text-secondary-equivalent
  contrast would need its own sweep.

**FD5 — Percent formatting.**
- **(a) `Math.round(pct)`, integer, `"4 (33%)"`** *(recommended)*. The mockup's format
  (`127 (45%)`); a three-way tie reads `33% / 33% / 33%` (sums to 99 — a display artefact, not a
  data one; the bars use the unrounded value). A living organism under 0.5 % reads `0%` beside a
  non-zero count and NO skull — `extinct` is the flag, never the display.
- **(b) One decimal (`33.3%`).** More digits than a 10 Hz bar can be read at; not the mockup.
- **(c) `<1%` floor.** A UX call the mockup does not make — recorded as a candidate, not taken.

**FD6 — How the zero-padded cycle is read aloud.**
- **(a) Padding in its own `aria-hidden` span, digits as text** *(recommended)*. `0042` as one
  text node is announced "zero zero forty-two" or "zero zero four two" by common engines; with the
  padding hidden, the accessible text is `42` and the visible glyph run is unchanged (same font,
  same tabular metrics). No role needed on anything.
- **(b) Whole value `aria-hidden` + a visually-hidden `<span>42</span>`.** Works, but two DOM
  copies of the number and a `sr-only` utility this codebase does not have.
- **(c) `role="img" aria-label="Cycle 42"` on the value.** The 2.12 `group` construction's
  browse-mode weakness (`deferred-work.md` line ~361) for a leaf that does not need a role.

**FD7 — `data-cycle` / `data-status` on the view root.**
- **(a) Keep both attributes; rewrite the comment** *(recommended)*. 35 unit and 39 e2e assertions
  read them; they cost nothing; and the counter's TEXT is now the user-facing rendering, which is
  what the 3.11 comment meant by "until 3.14 renders them as text" — the attributes were never
  promised to go away, only to stop being the ONLY rendering.
- **(b) Remove them and re-target every assertion at the counter text.** ~74 edits across four
  files to lose a stable, semantic-free test handle — and `data-status` has no text twin at all.

**FD8 — Announcement.**
- **(a) No live region, no `role="status"`, no `<output>`** *(recommended)*. A 10 Hz polite region
  is a continuous announcement; 2.12 FD3 rejected even per-gesture announcement for the Lab stats
  as interrupting the user. Passive, labelled content (a list, a heading) is what WCAG 1.3.1/1.4.1
  require; the 6.11 pass owns any considered announcement policy (the biotech proposal's "announce
  cycle count changes every 10 cycles" is a design idea, not a spec).
- **(b) A polite region on the counter only.** Still one announcement per publish while playing.

**FD9 — Native markup or MUI.**
- **(a) `styled('ul')` / `styled('li')` / `styled('div')`** *(recommended)*. The mockup is plain
  divs; MUI `LinearProgress` brings `role="progressbar"` semantics (a bar that is a share, not a
  progress, would need `aria-valuetext` gymnastics and its own contrast override under
  `cssVariables: true` — the 1-9 review's derived-token no-op), and `List`/`ListItem` add modules
  to the route with the least headroom (AR-35). Story 2.8 FD2 / 3.13 FD1 made the same call.
- **(b) MUI `LinearProgress` per row.** Wrong semantics, wrong bundle direction.

### Traps

1. **Publish parity at 20 gen/sec.** `cyclesPerPublish(20) === 2`, so the counter shows only EVEN
   cycles while the loop runs at 20; `pause()` then publishes the exact (possibly odd) cycle. A
   view test that expects `0003` after three 50 ms frames is wrong and looks right. Assert on
   `drawDiff` counts for "one step per frame" and on the counter only at published values.
2. **`opacity` is contrast.** axe's `color-contrast` blends element/ancestor opacity into the
   measured foreground. The mockup's `.pop-item.extinct { opacity: 0.4 }` fails on the extinct row
   under a scan that passes everywhere else — FD2 (a).
3. **`transition: width` on a 10 Hz bar is perpetual motion**, and this route's three lost
   transitions were each caught by an axe scan mid-fade. RFC-003: "No UI animation running during
   simulation steps." None.
4. **The percent is a display; the flag is the truth.** `Math.round(0.4) === 0` for a LIVING
   organism; `pct === 0` is not extinction and `count === 0` is not this component's to check.
   Render the skull off `entry.extinct` only (Task 1 (b) reddens otherwise).
5. **WebKit strips list semantics from `list-style: none`.** Safari's accessibility tree exposes a
   `<ul>` with `list-style: none` as generic groups; Playwright's `getByRole('listitem')` returns
   zero on the `webkit` and `tablet` projects and the e2e is green on `chromium`/`firefox` only.
   `role="list"` on the `<ul>` (redundant to ARIA, load-bearing to WebKit) restores it; axe
   accepts the explicit role. Task 1 (i) pins the attribute so a refactor cannot drop it.
6. **`SidebarSection` renders `<h2>`.** Two new sections flip every "one h2 in Run" assertion:
   `BattleSimulationView.test.tsx` (Task 4), `BattlePage.test.tsx` twice (Task 5), the 3.11 e2e
   twice (`:2006`, `:2306`). Convert all five; a missed one is a red CI, not a silent pass.
7. **`sim` is a new object on every publish; its members are stable.** Pass `sim.population` and
   `sim.cycle` (values) and compute `totalLiving` inline — no `useCallback`/`useMemo` keyed on
   `sim` (3.12's review lesson), and no wrapper components that would memoise on it.
8. **The view fixture's `c` is unplaced, and its rules are not Conway.** Use `GRID` + `ORGANISMS`
   for the mount/extinct/order assertions (deterministic at cycle 0 and after Stop); use the
   `CONWAYS_CLASSIC` lone-cell fixture for anything that asserts a count AFTER a step. For that
   fixture either rebuild `palette` for the roster (`buildRefToFillGroup([CONWAYS_CLASSIC.id], …)`)
   or pass `colors: null` (the prop's documented "canvas does not render" arm) — a palette built
   for the mock roster under a Conway session is the warn-once `PlaybackDish` path, and the
   tests' clean-console premise breaks.
9. **`key` is `organismId`, and it is unique** — `derivePopulation` de-duplicates. Do not key on
   index (rows re-order between publishes as counts cross) and do not key on `name` (two
   organisms may share one — `OrganismSchema.name` has no uniqueness rule; the deferred 2-12 entry
   names it).
10. **`toLocaleString()` with no argument is the runtime's locale** (`"6 000"` on fr-FR) — pin
    `'en-US'` (2.14 trap 10). Counts and total only; NOT the cycle (Task 2's reasoning).
11. **`<Profiler>` counts commits, not renders.** `onRender` fires once per committed update of
    the subtree — what AC7 means by "re-render". StrictMode's double-invoked render bodies do not
    double it. Count calls AFTER the prime frame (mount and `play()` each commit once).
12. **`'transparent'` and the AR-46 selector.** The lint targets `#hex` and `rgb()/hsl()`
    literals; the keyword should pass. If it does not, omit `background` on extinct rows rather
    than adding a disable comment (Task 1's note).
13. **`spec:check` reads this file.** Every ID above is spelled as the specs spell it.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **Mockup `.pop-item.extinct { opacity: 0.4 }`** vs SC 1.4.3 under axe — FD2 (a). Mockup-refresh
  candidate; the same rule applies to the fullscreen mockup's `.hud-pop-pill.extinct` (3.18).
- **Mockup coloured `.pop-name` / `.pop-count` text** vs the palette-tunability reasoning 2.12
  recorded — FD4 (a). Not new in kind; new surface.
- **Mockup `.pop-bar { transition: width 0.3s }`** vs RFC-003's "No UI animation running during
  simulation steps" and the route's no-`transition` rule — none shipped.
- **Mockup's title-less `.cycle-counter` box with an accent border** vs spec §2's `"Cycle Count"`
  section form and the route's one-shape-per-section rule — FD1 (a). Mockup-refresh candidate.
- **Spec §3.12 `totalLiving: number` prop vs §4's hook return, which publishes no total** — FD3
  (a); recorded as a §3.12 clarification candidate (Task 6 item 4).
- **Biotech `play-mode-proposal.md` "Update frequency: Every cycle" and "Live region for population
  stats updates"** — superseded by M2/AR-29 (≤ 10 Hz) and by FD8; the proposal is marked "Initial
  proposal — awaiting review" and is not an authority.
- **`deferred-work.md` says 3.14 "rebuilds that row for Run mode" and "Play mode's canvas"** — it
  does neither (`<EditorStatusBar>` and `<PetriDishCanvas>` are untouched); both pointers are
  corrected in Task 6, not silently left.
- **spec §3.12 `PopulationStatsProps` / `CycleCounterProps`** — match what ships exactly;
  `PopulationEntry` is imported from `@/lib/battle/useSimulation` rather than re-declared.

### What NOT to build

- ❌ No extinction auto-pause, no `status` follow-through from the thunk (3.15).
- ❌ No `<GridSizeControl>` (3.16), no `<FullscreenStage>` / HUD pills (3.18), no
  `useSimulationHotkeys` (3.19), no `compact`/`variant` prop on `<PopulationStats>` (3.18/4.15
  decide; recorded in Task 6).
- ❌ No change to `useSimulation`, `population.ts`, `gridStats.ts` — no `totalLiving` in the hook
  (FD3), no rounding in `derivePopulation` (the component formats; the hook publishes data).
- ❌ No sort, filter, de-duplication or `count === 0` check in `<PopulationStats>`.
- ❌ No `useState` / `useRef` / `useEffect` / `useMemo` / `useCallback` in the view or either
  component.
- ❌ No `aria-live`, `role="status"`, `<output>`, `role="progressbar"`, `role="img"` on rows or
  `role="group"` constructions (FD6, FD8).
- ❌ No MUI `LinearProgress` / `List` / `ListItem` / `Typography` on the battle route (FD9).
- ❌ No `transition`, no `opacity` on text-bearing elements, no `box-shadow`, no `rgb(…)`/hex in a
  `.tsx`, no new token, no `themes.css` change, no new contrast row.
- ❌ No edit to `<EditorStatusBar>` (Lab) — its separator and overflow entries are re-pointed.
- ❌ No `@gol/test-utils` additions; no new e2e seeding helper.
- ❌ No edit to `component-tree-battle-page.md`, `architecture.md`, RFCs or the mockups —
  candidates to `deferred-work.md`.

### Testing standards summary

- Vitest 4 in `apps/web` (jsdom, `vitest.setup.ts` registers `cleanup`; no coverage gate — the
  tests exist because the ACs need them). RTL 16 + `@testing-library/user-event` 14 for clicks;
  `fireEvent.change` for the speed slider (3.13 trap 2); `vitest-axe`; `installFrameDriver()` /
  `installContexts()` from `BattleSimulationView.test.tsx` (3.12); `GridRenderer.prototype` spies
  for `drawDiff`; React's `Profiler` for commit counting (Task 4 (e)).
- Never pixel/snapshot-test the canvas. Assert on rows (`getAllByRole('listitem')`), text, the
  `img` named `extinct`, inline `style` values, `data-cycle`, and renderer-method spies.
- Determinism: cell counts after a step are asserted ONLY on the `CONWAYS_CLASSIC` lone-cell
  fixture (dies at cycle 1 by Conway's rules — no RNG involved, no ties). The mock roster is for
  cycle 0 and post-Stop only (3.12 trap 7).
- Component tests feed hand-built `PopulationEntry` literals — the contract under test is "render
  what you are given, in that order"; `derivePopulation`'s own tests (3.10) own the sort.
- Make every new test fail under the mutation it guards: Task 1 (a) reddens under a `.sort` in
  the component; (b) reddens if the skull keys off `count`/`pct`; (i) reddens if `role="list"` is
  dropped; Task 2's padding test reddens if the digits move into the hidden span; Task 4 (e)
  reddens if the view (or a component) gains per-frame state, and its 20 gen/sec half reddens
  under a per-cycle publish; the h2 count tests redden if a section is missing or mis-titled.
- `npm run ci > /tmp/ci-3-14.log 2>&1; echo $?`; report the real exit code, the named failures if
  any, and the bundle numbers.

### Previous story intelligence (3.13) and recent git

- **3.13 shipped the pattern this story composes with**: presentational-and-total controls in
  `simulation/`, `<SidebarSection>` wrapping at the view, `sim.<member>` passed straight through,
  the 3.12 frame driver for view tests, count tests written to be flipped by the next story
  (`BattleSimulationView.test.tsx:117-136`, `BattlePage.test.tsx:2720-2724`, e2e `:2006`, `:2306`).
  Convert, never delete.
- **3.13's review culture**: exact-name heading assertions (`{ name: 'Speed' }`), never substring;
  every trap's mutation confirmed red and reverted; e2e timing via `expect.poll`, never fixed
  `waitForTimeout`; the local macOS WebKit plain-`Tab` failure in 3.12's e2e is pre-existing and
  recorded — do not touch that block. `Alt+Tab` is the local-WebKit idiom if a Tab is ever needed
  (none is, here).
- **3.13 measured `/battle` at 308.6 KB gzip (1.4 KB headroom)** and the Run chunk at 5.2 KB gzip.
  This story's code is inside the Run chunk; `/battle` should move by ~0 (`displayColor` and
  `SidebarSection` are already on the route).
- **3.13's Debug Log:** `npm run ci` exited 1 on the two pre-existing local-WebKit e2e failures
  only; the remote gate was green. Expect the same and say so by name (AC11).
- **3.12's e2e Debug Log:** the full four-project Playwright matrix was OOM-killed twice locally;
  `npx playwright test --project=chromium --workers=1` (apps/web) was the clean standalone signal —
  but trap 5 is a WebKit-only failure, so run `--project=webkit` on the 3.14 block explicitly.
- **Git:** stories run on `story/*` branches merged by PR (#40 3.13, #41 4.6); `feat:` / `fix:
  review patches` / `docs: record … run stats` is the commit shape. Lane 4's next story (4.7 aging
  toggle) touches `components/organisms/**` only; 4.15 (which reuses `<PopulationStats>` compact)
  is gated on 3-15, and 4.24/4.25 on `epic-3`, so this story reshapes `<BattleSimulationView>` with
  no open consumer in the other lane.

### External dependencies / versions

None new. React 19.2.7 (`Profiler` is in the dev build Vitest runs), Next 16.2.10, MUI 9.3.1
`styled` only, `@testing-library/react` 16.3.2, `@testing-library/user-event` 14.6.1, `vitest-axe`
0.1.0, Vitest 4.1.x, jsdom 30, Playwright as installed (`@axe-core/playwright` already used by the
route's e2e). `eslint-plugin-react-hooks` 7.1.1 via `eslint-config-next` 16.2.12. No React Compiler.

## Project Structure Notes

- New: `apps/web/components/battle/simulation/PopulationStats.tsx` (+ `.test.tsx`),
  `apps/web/components/battle/simulation/CycleCounter.tsx` (+ `.test.tsx`).
- Modified: `apps/web/components/battle/simulation/BattleSimulationView.tsx` (+ `.test.tsx`),
  `apps/web/components/battle/BattlePage.test.tsx` (h2 counts), `apps/web/e2e/battleRoute.spec.ts`
  (new block; two 3.11 assertions converted; one module-scope locator),
  `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`. Comments only, if a
  "Story 3.14" sentence is now false: `apps/web/lib/battle/population.ts`, `gridStats.ts`,
  `useSimulation.ts`, `simulation/README.md`.
- Not touched: `apps/web/lib/battle/useSimulation.ts` (code), `population.ts` (code),
  `apps/web/app/themes.css`, `apps/web/lib/themeTokens.test.ts`, `SidebarSection.tsx`,
  `SpeedControl.tsx`, `SimulationControlBar.tsx`, `PetriDishCanvas.tsx`,
  `components/battle/editor/**`, `BattlePage.tsx`, `packages/**`, `scripts/*`, any planning
  artifact.
- Naming: `PopulationStats` / `CycleCounter` per spec §3.12 / README; `PopulationStatsProps`,
  `CycleCounterProps` exported; private styled `List` / `Row` / `Header` / `Name` / `Swatch` /
  `Skull` / `Count` / `BarTrack` / `BarFill` / `Total` / `TotalValue` / `Empty`, `Counter` / `Value`.

## References

- `docs/planning-artifacts/epics.md#Story 3.14` (`:912-923`) — the four clauses; Story 3.10 AC
  (`:869-872`, the published shape and cadence), 3.15 (`:933`, the counter stays visible on
  auto-pause), 3.18 (`:969`, HUD pills with skull), 4.15 (preview reuse); FR-4.5 / FR-4.6 (`:72-73`),
  AR-29 / AR-31 (`:197-199`), AR-35, AR-46, UX-DR17, UX-DR20 (`:245`).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` — FR-4.5 / FR-4.6 (`:305-314`,
  incl. "the organism **name** shown on each bar disambiguates" shared colours), FR-4.7 (`:316-322`),
  NFR-1.1, NFR-4.1, NFR-4.2, NFR-8.1.
- `docs/planning-artifacts/architecture.md` — Runtime Architecture step 4 (`:128`, "derived
  signals"); **M2 (`:348`)** — derived view, one pass at ≤ 10 Hz, "extinction/skull detection
  (`count === 0`) happen at the same cadence" (i.e. upstream); Decision B.5 (`:184`); FR-4 coverage
  row (`:384`).
- `docs/planning-artifacts/component-tree-battle-page.md` — §2 (`:75-90`, sidebar order and the
  two titles), **§3.12 (`:289-308`, `PopulationStatsProps` / `CycleCounterProps`, "All pure
  presentational; logic (sorting, extinction, cadence) upstream", compact-variant reuse)**, §3.14
  (`:325-341`, the HUD's `population` shape — colorToken/count/extinct only), §4 (`:363-375`),
  §6 (`:420-422`, "throttled derived … CycleCounter, PopulationStats"), §7 (`:443-444`), §8 (`:467`).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md` — Decision 5 (`:224-254`,
  "pushes only `cycle` (one integer) and a rate-capped `population` summary into state for the
  counter and the stat bars"). `RFC-003-frontend-ui-architecture.md` — animation performance rules
  (`:223-227`, "No UI animation running during simulation steps"), Decision 3 (`styled()` over
  `sx`). `RFC-007` Decision 1 (tunable palette — FD4's premise).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode.html`
  — `.cycle-counter` … `.total-living-value` (`:317-419`), the sidebar markup (`:563-641`), the
  annotation (`:768`); `petri-dish-play-mode-fullscreen.html` (`:330-350`, the HUD pills 3.18 will
  derive from — NOT this story's shape); `biotech-terminal-theme/play-mode-proposal.md` (`:175-236`,
  superseded proposal — context only).
- `docs/implementation-artifacts/palette-cvd-validation.md` (G1/G2 — identity shades ≥ 5.12:1 vs
  `#0a0a0a`; the FD4 numbers), `clinical-lab-contrast-validation.md` (text pairs; `border` is
  decorative and ungated).
- `apps/web/lib/battle/population.ts` (`PopulationEntry`, the head comment on order, `pct` ≤ 100,
  de-duplication), `population.test.ts` (the sort contract — do not re-test it),
  `apps/web/lib/battle/useSimulation.ts` (`publish` `:321`; `pause` `:417`; `step` `:426`; `stop`
  `:438`; `initialView` `:215`; the re-export `:27`),
  `useSimulation.test.ts` (`:225-299`, the cadence tests — the contract behind AC7),
  `apps/web/lib/battle/simulationSpeed.ts` (`cyclesPerPublish`), `apps/web/lib/palette/displayColor.ts`
  (`displayColor`, `MAX_AGE_SHADE`), `apps/web/lib/displayOrganisms.ts` (`:75-82`, why the identity
  shade), `apps/web/components/battle/editor/OrganismRoster.tsx` (`ColorChip` `:84-100` — the
  inline-hex precedent), `apps/web/components/battle/editor/EditorStatusBar.tsx` (`:91-134` the
  Lab entries and why colour is a redundant channel; the no-`transition` record),
  `apps/web/components/battle/editor/GridSettingsSection.tsx` (`:219-225`, the pinned locale),
  `apps/web/components/battle/SidebarSection.tsx`, `apps/web/components/battle/simulation/
  SpeedControl.tsx` (the presentational-total shape and head-comment style), `BattleSimulationView.tsx`
  (`SidebarContent` comment, the order comment, the root attributes comment, the ABSENT list),
  `BattleSimulationView.test.tsx` (`GRID` `:20-22` — `c` unplaced; `installFrameDriver` `:74`;
  `installContexts` `:29`; the count test `:117-136`), `apps/web/components/battle/BattlePage.tsx`
  (`runOrganisms` `:551-555` — built over `rosterIds`, so H.2 members run with zero cells),
  `BattlePage.test.tsx` (`:2712-2724`, `:2740`), `apps/web/e2e/battleRoute.spec.ts` (helpers
  `:131-160`, the 3.11 block `:1971-2123`, the 3.13 block `:2283-2436` — its shape is the model),
  `packages/test-utils/src/mockWorkspace.ts` (`placeMockRoster` `:205-278` — three 2×2 blocks, 4
  cells each; `battleB` carries the glider and, e2e-seeded, the dangling Conway id),
  `packages/domain/src/defaultWorkspace.ts` (`CONWAYS_CLASSIC`), `eslint.config.mjs` (AR-46
  selectors).
- `docs/implementation-artifacts/3-13-speed-control.md` (the section-wiring shape, traps 1/4/6,
  review findings, Dev Agent Record bundle numbers), `3-12-transport-controls.md` (FD4 frame
  driver, trap 7), `3-10-usesimulation-hook.md` (obligations 5–6, FD4 cadence, Task 3),
  `epic-2/2-12-editor-status-bar-stats.md` (FD3 named region, the colour-chip reasoning),
  `deferred-work.md` (2-12 review `:359`, `:361`, `:363`, `:365`; 2-14 `:424`; 2-15 review `:441`;
  3-10 `:815` bundle; 3-11 `:857` and the amendment list; 3-13 `:976-1016`), `lane-gates.yaml`
  (4.15 → 3-15; 4.24/4.25 → `epic-3`).
- `docs/project-context.md` — hot state in refs; population counts are a derived view at the
  publish cadence, never per cycle (M2); `components/battle/` split; no raw colour literals; no DOM
  in `packages/*`; `spec:check` spelling; commit gate; bundle ratchet.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via `bmad-dev-story`.

### Debug Log References

- `npm run ci > /tmp/ci-3-14.log 2>&1; echo $?` exited **1**, on `bench:check` alone — every
  earlier stage (typecheck, lint, format:check, spec:check, boundary:check, coverage, build,
  bundle:check) passed. This story touches nothing under `packages/simulation` or
  `packages/domain` (confirmed by `git status` / File List below), so the engine's real
  performance is unchanged; the number is an artefact of a heavily loaded shared machine (`uptime`
  read load averages of 51/161/134 while `npm run ci` ran, with a second `implement-next-story`
  lane's own `vitest` workers active concurrently — `ps aux` at the time shows both). Evidence: the
  `npm run ci` run measured the NFR-1.1 frame at **301.860 ms** (budget 16.667 ms); re-running
  `npm run bench && npm run bench:check` alone, seconds later with the other lane's workers exited,
  measured **28.524 ms** — a 10x swing with zero code changed in between. Per project-context ("a
  replayed benchmark is a lie... never Turbo-cached") this is exactly the failure mode the warning
  describes, not a regression: the budget is not moved and the code is not touched to chase a
  number that a quiet machine already shows converging toward the documented ~6-12 ms baseline.
  **Not independently verified against a quiet run at or under budget** — flagged rather than
  claimed green.
- `npm run e2e` (separately, since `bench:check` blocked the chained script) — **569 passed, 7
  failed, 4 skipped**. Two failures are the story's own expected pre-existing gap: `[webkit]` and
  `[tablet]` both fail `Transport controls (Story 3.12) › Tab reaches Play, Next cycle, Stop &
  reset in order...` — the local macOS WebKit plain-`Tab` failure `deferred-work.md`'s 3-12/3-13
  sections already record; not touched here (AC11). The other five —
  `[chromium] appShell.spec.ts › has no axe accessibility violations`,
  `[chromium] battleRoute.spec.ts › opens a battle from a Gallery tile and survives a reload`, and
  three `[firefox]` tests on `/battle/new` (placement axe, drag area, drag axe) — are **not**
  Story 3.14 surfaces (none touch `BattleSimulationView`/`PopulationStats`/`CycleCounter`) and the
  Firefox log shows an actual browser-process crash (`NS_ERROR_FAILURE`,
  `GraphicsCriticalError: RenderCompositorSWGL failed mapping default framebuffer`) under the same
  machine load as the bench swing above. Re-run individually (`--project=chromium` /
  `--project=firefox`, one test at a time) immediately afterward: **all five passed.** The
  project's own project-context note applies here too: "a local green `npm run ci` is not proof CI
  is green" — and, symmetrically, a local RED run under extreme contention is not proof of a
  regression either; the remote gate (`gh run list`, after push) is the one that counts.
- Story 3.14's own e2e block (`Cycle counter & population stats (Story 3.14)`, 5 tests) and the
  converted 3.11/3.12/3.13 blocks (21 tests total) were also run in isolation on both `chromium`
  and `webkit` (trap 5) — all green, including the WebKit list-role and the h2-count conversions.
- `apps/web`: 87 test files / 1316 tests passed (`test:coverage`), including the two new component
  test files (18 tests) and the two updated ones (`BattleSimulationView.test.tsx` 28 tests,
  `BattlePage.test.tsx` 109 tests).
- Bundle (`bundle:check`, from the `npm run ci` run): `/` 333.3 KB gzip (6.7 KB headroom); `/battle`
  **308.6 KB gzip (1.4 KB headroom)** — unchanged from 3.13, exactly as AC10 predicted (`displayColor`
  and `SidebarSection` were already on the route's first load); `/battle/new` 308.6 KB gzip (1.4 KB
  headroom); `/organisms` 295.3 KB gzip (9.7 KB headroom). The Run chunk (the lazy chunk holding
  `<BattleSimulationView>`, `<PopulationStats>`, `<CycleCounter>`, `<SpeedControl>`,
  `<SimulationControlBar>`) measured **5.9 KB gzip**, up from 3.13's recorded 5.2 KB — the two new
  presentational components' cost, off the route's first load as AC10 requires.

### Completion Notes List

- Forced decisions taken, all per the story's recommended option: **FD1(a)** `<CycleCounter>` is
  title-less, wrapped by the view in `<SidebarSection title="Cycle Count">`; the mockup's accent
  box border is dropped (double-frame) and recorded in `deferred-work.md`. **FD2(a)** the extinct
  row is a hollow swatch + text-secondary name/count + named `☠` `img` + 0% bar, no `opacity`.
  **FD3(a)** `totalLiving` is `sim.population.reduce(...)` in the view, a plain expression, no
  hook change. **FD4(a)** organism colour on the swatch/bar only, never on name/count text.
  **FD5(a)** `Math.round(pct)`, integer percent. **FD6(a)** the zero-padding lives in its own
  `aria-hidden` span; digits are plain text. **FD7(a)** `data-cycle`/`data-status` kept on the
  view root, comment rewritten. **FD8(a)** no live region, no `role="status"`, no `<output>`.
  **FD9(a)** native `styled('ul')`/`styled('li')`, no MUI list/progress components.
  All nine recorded as taken exactly as the story's Dev Notes describe; no deviation.
  Spec-conflict flags: none NEW beyond the ones the story already named (mockup opacity/colour/
  transition, the §3.12 `totalLiving` clarification candidate, the two corrected `deferred-work.md`
  pointers) — all resolved via the story's own FD calls, nothing left ambiguous.
- `<PopulationStats>` and `<CycleCounter>` are both pure, stateless, `'use client'` presentational
  components — no hook beyond none, no `sim`, no sort/filter/extinction re-derivation. Task 1 (a)'s
  unsorted-input test and Task 4's `<Profiler>` commit-count test both back this: a `.sort` or a
  per-frame state write reddens either.
- `<BattleSimulationView>` gained exactly one derived value (`totalLiving`, a plain `reduce`) and
  two new JSX sections; no new hook, ref, effect or memo, per the Dev Notes constraint list.
- Test-only ancestor-collision note (not a story defect, a testing-library/Playwright quirk worth
  recording for the next component test in this shape): `<CycleCounter>`'s Counter > Value is a
  single-child DOM chain, so a plain `getByText('0042')` matches the same collapsed text at two
  ancestor levels and throws "multiple elements found" under RTL, and the analogous Playwright
  `getByText` selector needs the same care. Both test files read the digits off a specific node
  (`CycleCounter.test.tsx`'s `valueNode` helper; `BattleSimulationView.test.tsx`'s `cycleText()`;
  the e2e's `cycleValue()`/`totalLivingValue()` via `xpath=following-sibling::*[1]`) instead.
- Task 5 (d)'s extinct-row e2e took the story's documented FALLBACK path: `/battle/new` (seeded
  with Conway's Classic as the one library organism, per 2.9's fixture), one cell painted, Run
  entered, one manual step — the lone cell dies under Conway's rules, reproducing Task 4 (c)'s
  assertion at the route level. The heavier 2.10 add-from-library flow was not reused (the story
  explicitly permits this substitution).
- Grep sweep (Task 5's fourth bullet) found no stale "Story 3.14" future-tense sentence needing a
  rewrite: `population.ts`, `gridStats.ts` and `EditorStatusBar.tsx`'s existing 3.14 citations are
  all already true in the present tense (documenting where the cadence/percentage/counter logic
  lives, which this story did not change), and `simulation/README.md`'s "What goes here" list
  already named both new components.
- `deferred-work.md` bookkeeping done: the 2-12 review entry (stats-row overflow) re-pointed with a
  reason (the Run sidebar scrolls, no overflow problem there); the 2-14 entry (thousands-separator
  inconsistency) corrected — this story did not edit `<EditorStatusBar>`, and now two of three
  surfaces agree; the 2-15 review entry (`<PetriDishCanvas>` CLEAR test gap) re-pointed to Story
  3.16 (this story never touches the canvas); the 3-11 amendment-candidate list got item 8 (props
  shipped to spec, the `totalLiving` clarification candidate); a new "Deferred from: Story 3-14"
  section records the six items Task 6 named (mockup chrome/colour/motion, the compact-variant
  question, the FD5 rounding floor, the empty-battle copy).

### File List

**New:**
- `apps/web/components/battle/simulation/PopulationStats.tsx`
- `apps/web/components/battle/simulation/PopulationStats.test.tsx`
- `apps/web/components/battle/simulation/CycleCounter.tsx`
- `apps/web/components/battle/simulation/CycleCounter.test.tsx`

**Modified:**
- `apps/web/components/battle/simulation/BattleSimulationView.tsx`
- `apps/web/components/battle/simulation/BattleSimulationView.test.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/3-14-cycle-counter-population-stats.md` (this file: frontmatter,
  task checkboxes, Dev Agent Record, Change Log, Status)

Nothing in `packages/*`; no planning artifact edited (per the story's own scope list).

## Change Log

- 2026-09-16 — Story 3.14 created (ready-for-dev): ultimate context engine analysis completed —
  comprehensive developer guide created.
- 2026-09-16 — Implemented: `<PopulationStats>` and `<CycleCounter>`, wired into
  `<BattleSimulationView>` above the Speed section; unit, view and e2e tests added/converted;
  `deferred-work.md` bookkeeping closed. Status -> review. `npm run ci` red on `bench:check` only,
  under measured machine contention (see Debug Log); `npm run e2e` red on the two pre-existing
  local-WebKit/tablet `Tab` failures plus five environmental flakes that all passed on isolated
  re-run (see Debug Log). No spec conflict beyond the ones the story already flagged.
- 2026-09-16 — Code review (Opus, three adversarial layers): 11 patches applied (test-strength and
  comment-accuracy fixes, one dead attribute removed — see Review Findings), 1 item deferred to
  Story 6.11, 0 decision-needed. Status -> done; the remote gate's `bench:check` / `bundle:check`
  result is recorded on the PR.

Dev Model: sonnet   # follows patterns that exist (2.12's stats-row chip, 3.13's presentational-section wiring, the hook's published contract); every open call is resolved in FD1–FD9 above — nothing here is a pattern a later story builds on rather than one 3.18/4.15 already have specced shapes for
Proposed lane gate: none

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 10m 55s | 10m 55s | 34 | 7,778 | 12,756 | 981,714 | 1,002,282 |
| Step 1 — create-story | opus-5 | 2 | 15m 43s | 15m 43s | 262 | 87,079 | 668,486 | 15,899,748 | 16,655,575 |
| Step 2 — dev-story | sonnet-5 | 1 | 54m 58s | 54m 58s | 602 | 84,779 | 822,953 | 61,024,882 | 61,933,216 |
| Step 3 — code review + PR | opus-5 | 4 | 26m 15s | 26m 15s | 404 | 104,141 | 912,816 | 24,503,033 | 25,520,394 |
| _of which the orchestrator_ | opus-5 | — | — | — | 66 | 16,135 | 30,015 | 2,060,190 | 2,106,406 |
| **Total (create-story → PR ready)** | | 7 | **1h 47m** | 1h 47m | 1,302 | 283,777 | 2,417,011 | 102,409,377 | **105,111,467** |

Run started 2026-09-16 09:31 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
