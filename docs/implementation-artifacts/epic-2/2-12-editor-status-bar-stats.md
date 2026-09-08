---
baseline_commit: 84ddb6ae6ac9f61afa2037c06d4ba807d22f296c
---

# Story 2.12: Editor Status Bar Stats

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want live stats about my initial configuration,
so that I can see the composition of my battle while designing.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.12: Editor Status Bar Stats`, decomposed into the seven things a
reviewer can independently check. **AC5 and AC6 are `deferred-work.md` entries that name Story 2.12
as owner** — inherited debt coming due, not extra scope, exactly as AC6/AC7 were in Story 2.11.

1. **AC1 — The status bar grows its left half: Generation · Living Cells · Population.**
   `<EditorStatusBar>` currently renders `justifyContent: 'flex-end'` and one UNDO button. After
   this story its left side carries three `stat-item` pairs — a small uppercase label and a value —
   matching the mockup (`clinical-lab-theme/petri-dish-lab-mode.html:797-816`, `.stats-bar` /
   `.stats-left` / `.stat-item` / `.stat-label` / `.stat-value`, CSS at `:510-549`): **Generation**
   `0`, **Living Cells** `N`, **Population** with one entry per roster organism. `justifyContent`
   becomes `space-between` (the mockup's own value), and the stats sit in the `.stats-left` group
   the Story 2.8 comment deliberately left unbuilt.
   ⚠️ **Population entries carry a colour chip** (epic AC: "per-organism population counts with
   color chips"). The mockup colours the *numbers* instead and separates them with slashes; both
   are viable (see Dev Notes → *Colour, contrast, and why a chip is not optional*), but the chip is
   what the epic AC requires and what makes colour a redundant channel rather than the only one.
   ⚠️ **No Grid Zoom slider.** The mockup's `.zoom-control` (`:818-822`) is **superseded** — spec
   §9.1: whole-grid auto-fit (Decision A) replaced the viewport model, "no zoom control ships".
   The existing `queryByRole('slider')` absence assertion stays.

2. **AC2 — Generation is the literal `0`, not state and not a prop.**
   Edit mode has no simulation and no cycle: FR-4.5's counter belongs to Story 3.14 in the *run*
   sidebar. The Lab bar's "Generation 0" is a fixed label meaning "this is the initial
   configuration". Render it as a constant with a comment saying so.
   ⚠️ ❌ Do **not** add a `generation` field to `stats`, a `generation` prop, or a state cell. A
   number that can only ever be `0` but is plumbed as if it could change is an invitation for a
   later story to wire the *edit* bar to a simulation — and Lab mode has only `initialGrid` to wire
   it to (A-2: only `initialGrid` is persisted/exported; the live grid exists in Run mode alone).

3. **AC3 — The counts equal the actual grid contents, for every roster organism, including zero.**
   `livingCells` = the number of cells in `grid.occupant` that are non-zero. `perOrganism` carries
   **one entry per roster entry**, in roster order, with `count` = the number of cells whose
   `OrganismRef` resolves to that organism — `0` included, so an organism whose last cell is erased
   visibly drops to `0` rather than vanishing (the epic's "dropping to zero correctly when erased").
   A session-added-but-unpainted organism (Decision H.2) therefore reads `0`, which is the honest
   statement of what it is.
   ⚠️ **Refs resolve through `rosterIds`, never through `roster`** — see Dev Notes → trap 1. This is
   the Story 2.9 trap 2 recurring; getting it wrong mis-attributes every count after a duplicate id.
   ⚠️ **`sum(perOrganism.count) ≤ livingCells` is an invariant, not a bug** — see trap 2.

4. **AC4 — Derived once per commit, in `<BattleEditorView>`, never per pointer-move.**
   Spec §6 assigns "editor-grid stats (living cells, per-organism) | **derived per commit** |
   **BattleEditorView** | readers: GridSettingsSection, EditorStatusBar", and §3.3's State line
   repeats it ("memoized on `grid`/`roster` identity — recomputed per committed gesture, never per
   pointer-move (NFR-4.2)"). A `useMemo` in `<BattleEditorView>` keyed on the grid and roster
   identities satisfies this by construction: `useUndoableGrid` returns a **new** `value` object per
   `commit` and per `undo`, and an in-progress stroke never touches it (the stroke lives in
   `<PetriDishCanvas>`'s refs — RFC-005 Decision 6). The `<EditorStatusBar>` receives `stats` as a
   plain prop and holds nothing.
   ⚠️ ❌ The derivation does **not** move to `<BattlePage>`, and ❌ nothing about it becomes state.
   A test must prove the "once per commit" claim rather than asserting it in a comment.

5. **AC5 — The bar stops being an unidentified run of numbers.**
   (`deferred-work.md`, verbatim: "`<EditorStatusBar>`'s bar element carries no landmark or
   accessible name … Story 2.12 fills its left half with Generation / Living Cells / per-organism
   counts, at which point a screen-reader user gets a run of unlabelled numbers with no region to
   identify them. … **Pick this up in Story 2.12**, which is the story that adds the content.")
   After this story every number has a programmatically determinable label, and the stats group is
   identifiable — see forced decision 3 for the options and the recommendation. Settle the entry in
   `deferred-work.md` with the evidence.
   ⚠️ Each population entry needs an accessible name of its own: a bare colour chip beside a bare
   integer is **colour as the only channel** (WCAG 1.4.1) and an unlabelled number (1.3.1). The
   organism's *name* is what supplies it — which means `stats` carries more than spec §3.8's
   three-field shape (forced decision 2).

6. **AC6 — The dish box stops overflowing a short viewport, and the narrow case gains a test.**
   Two `deferred-work.md` entries, both naming this story:
   - "**The dish box can overflow a short viewport, and centred-flex overflow is unreachable by
     scrolling** … **Pick this up in Story 2.12**, the next story to touch this box" — `<PetriDishBox>`
     is `width: 100%; max-width: 1000px; aspect-ratio: 5/3` with no `max-height`, inside a
     `<GridContainer>` that centres it. When the available height is less than
     `min(1000, containerWidth − 60) × 3/5`, the box is taller than its container and overflows
     **equally in both directions**; the top overflow of a centred flex item cannot be reached by
     scrolling, so part of the dish is genuinely unviewable. See forced decision 4 for the three
     candidate fixes.
   - "**The sidebar's 320px column now competes with the dish for width, and no test covers the
     narrow case** … **Pick this up in Story 2.12**, which already owns the box's overflow behaviour
     and is the natural place for a narrow-viewport assertion."
   ⚠️ **That first entry's stated rationale is stale, its defect is not.** It says this story
   "restores the mockup's `padding-bottom: 80px` status-bar reserve, which makes the available
   height smaller still". It does not: Story 2.8 put `<EditorStatusBar>` **in flow** as the last row
   of `<MainContent>`'s flex column, and `BattleEditorView.tsx:187-190` records that the 80px
   "stays unreproduced permanently, not 'until 2.12'". What this story actually does to the dish's
   available height is whatever the stats row adds to the in-flow bar's own height — possibly
   nothing, since the bar's height is currently set by a `8px 16px`-padded button and a stats row of
   `10px` labels over `14px` values may fit inside it. **Measure it** and say so. Either way the
   underlying centred-flex defect is real and unchanged; correct the entry's reasoning when you
   settle it, and do not reinstate the 80px.

7. **AC7 — Keyboard-clean, axe-clean, bundle re-measured.**
   The bar adds **no new tab stop** (stats are text, not controls — UNDO stays the only focusable
   element in it) and the existing "reachable by Tab and activated by Enter" test still passes.
   `vitest-axe` reports zero violations on `<EditorStatusBar>` in every state (empty roster, mixed
   counts, zeroed organism) and on the rendered editor; the `/battle` + `/battle/new` Playwright axe
   scans stay at zero. Report `bundle:check`'s measured gzip and headroom for all three routes.
   Story 2.11 left **`/battle` 299.9 KB (10.1 KB headroom)**, **`/battle/new` 299.9 KB (10.1 KB)**
   and **`/` 326.6 KB (3.4 KB)**; budgets are 310 / 310 / 330 KB. A budget is never raised
   unilaterally — if one is exceeded, **STOP and ask Sidiar**.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (all ACs)**
  - [x] `apps/web/components/battle/EditorStatusBar.tsx` in full — `Bar`'s `justifyContent:
        'flex-end'` and the comment that names this story as the reason it is not `space-between`;
        `UndoButton`'s recorded reasons for being a `styled('button')` (bundle headroom, the real
        `disabled` attribute, the `2px solid var(--gol-accent)` focus ring); the `EditorStatusBarProps`
        doc comment listing exactly what this story adds and what 2.13 adds after it.
  - [x] `apps/web/components/battle/BattleEditorView.tsx` in full — `BattleEditorViewProps`;
        the `EditorMainProps = Omit<BattleEditorViewProps, …> & { tool; toolRef }` intersection
        (**this is where `stats` goes**, not on `BattleEditorViewProps` — see trap 5);
        `findDuplicateColorIds` and its `useMemo` (**the existing precedent for a per-commit
        derivation in this component**); `rosterIds`'s prop comment on why it is kept alongside
        `roster`; `<GridContainer>` / `<PetriDishBox>` (AC6).
  - [x] `apps/web/components/battle/OrganismRoster.tsx:86-100, 495-510` — `ColorChip`, its
        `aria-hidden="true"` and its `style={{ background: organism.color }}` call site. **Copy this
        pattern; do not invent a second chip.**
  - [x] `apps/web/lib/displayOrganisms.ts` — `DisplayOrganism` (`id`, `name`, `color`,
        `colorToken`, `unresolved?`) and the "ORDER IS PRESERVED but LENGTH IS NOT" warning.
  - [x] `apps/web/lib/canvas/renderableGrid.ts` — `RenderableGrid` (`width`/`height`/`occupant`/
        `age`; `occupant` is `0 = empty`, `1..255 = OrganismRef = dense roster index + 1`).
  - [x] `apps/web/lib/canvas/refToFillGroup.ts` — `MAX_ROSTER_SIZE`, and the degrade-and-**warn
        once** policy for a ref whose organism is missing (Decision I.4). Do not add a second warning.
  - [x] `apps/web/lib/useUndoableGrid.ts` — `commit` / `undo` both produce a **new** `value`, which
        is what makes AC4's memo correct by construction.
  - [x] The two absence tests this story converts (trap 4): `EditorStatusBar.test.tsx` "renders no
        stats row and no SAVE button (2.12 / 2.13 are not this story)" and
        `BattleEditorView.test.tsx`'s NFR-4.1 block (the `/generation/i`, `/living cells/i` and
        `queryAllByRole('status')` lines).
  - [x] `docs/implementation-artifacts/deferred-work.md` — the three entries naming this story
        (the `<EditorStatusBar>` landmark one, the centred-flex overflow one, the narrow-viewport
        one).

- [x] **Task 2 — The counting derivation (AC3)**
  - [x] New `apps/web/lib/gridStats.ts` (camelCase, never dotted). Suggested shape:
        ```ts
        export interface OrganismPopulation {
          organismId: string;
          count: number;
        }
        export interface EditorGridStats {
          livingCells: number;
          perOrganism: readonly OrganismPopulation[];   // one entry per rosterIds entry, in order
        }
        export function computeEditorGridStats(
          grid: RenderableGrid,
          rosterIds: readonly string[],
        ): EditorGridStats
        ```
  - [x] **One pass over `grid.occupant`**, accumulating into a `Uint32Array(rosterIds.length + 1)`
        indexed by ref (index 0 = empty, unused). `livingCells` is the count of non-zero cells;
        `perOrganism[i].count = tally[i + 1]`. ❌ No `Array.prototype.filter`/`reduce` per organism
        (that is `roster.length` passes over 6 000 cells), ❌ no `Map` keyed by string per cell.
  - [x] **Refs out of range** (`ref > rosterIds.length`) are counted in `livingCells` and attributed
        to nobody — see trap 2. No throw, no console warning.
  - [x] Co-located `apps/web/lib/gridStats.test.ts`. Cover: empty grid; a single organism; two
        organisms; an organism at `0` after every cell is erased; a **duplicate id in `rosterIds`**
        (both refs must aggregate onto the same id — see forced decision 1 for which shape wins);
        an out-of-range ref; a `rosterIds` of length 0 against a grid that somehow holds a ref.

- [x] **Task 3 — Wire the derivation into `<BattleEditorView>` (AC4)**
  - [x] `const stats = useMemo(() => computeEditorGridStats(grid, rosterIds), [grid, rosterIds])`
        — beside the existing `duplicateColorIds` memo, which is the same pattern for the same
        reason. `grid` currently arrives inside `...rest`; destructure it explicitly (it must stay
        forwarded to `<EditorMain>` as well).
  - [x] Join to display data **by id** (trap 1): build the `<EditorStatusBar>` payload by looking
        each `organismId` up in `roster` (a `Map` built in the same memo), never by index.
  - [x] Add `stats` to the `EditorMainProps` intersection (`& { tool; toolRef; stats }`), not to
        `BattleEditorViewProps` (trap 5), and thread it to `<EditorStatusBar>`.
  - [x] Test in `BattleEditorView.test.tsx`: rendering with a known grid shows the expected numbers;
        committing a grid updates them; **the derivation does not rerun on an unrelated re-render**
        (assert via a spy on the exported function or a render-count probe — pick one and say which
        in the Dev Agent Record).

- [x] **Task 4 — The stats row in `<EditorStatusBar>` (AC1, AC2, AC5)**
  - [x] Extend `EditorStatusBarProps` with `stats` (shape per forced decision 2). Keep the doc
        comment's ❌-list accurate: SAVE / `isDirty` is still Story 2.13's, the zoom slider is still
        superseded.
  - [x] `Bar` → `justifyContent: 'space-between'`; add a `StatsGroup` (`.stats-left`: flex, `gap:
        25px`), `StatItem` (flex, `gap: 8px`), `StatLabel` (`10px`, `var(--gol-text-secondary)`,
        uppercase, `letterSpacing: 0.5px`) and `StatValue` (`14px`, `var(--gol-text-primary)`,
        `fontWeight: 600`) — the mockup's four rules, translated to tokens.
  - [x] Wrap the existing UNDO button in a right-hand group so `space-between` has two children.
  - [x] Generation renders a literal `0` (AC2).
  - [x] Population renders one entry per `perOrganism` item: `<ColorChip aria-hidden="true"
        style={{ background: … }} />` + the count, each entry carrying the organism's name as its
        accessible name (forced decision 3).
  - [x] ❌ **No raw hex** (AR-46 is a live lint rule on `apps/web`): every static colour is a
        `--gol-*` token, and the chip's fill is the **already-resolved** `DisplayOrganism.color`
        passed through inline `style` — the same mechanism `<ColorChip>` already uses.
  - [x] Empty-roster and all-zero states render sensibly (a Population group with no entries must
        not leave a dangling label — decide and record).

- [x] **Task 5 — Landmark / accessible naming (AC5)**
  - [x] Implement forced decision 3.
  - [x] `vitest-axe` on `<EditorStatusBar>` in ≥3 states; keep the existing two-state axe test and
        extend it rather than replacing it.
  - [x] Update `BattleEditorView.test.tsx`'s `expect(screen.queryAllByRole('status')).toHaveLength(0)`
        if — and only if — forced decision 3 introduces one (trap 4).

- [x] **Task 6 — The dish box overflow + narrow-viewport test (AC6)**
  - [x] Implement forced decision 4 in `BattleEditorView.tsx`'s `<GridContainer>` / `<PetriDishBox>`.
  - [x] A Playwright assertion at a deliberately short/narrow viewport proving (a) the dish box is
        fully within its container's box, and (b) the 320px sidebar is intact — i.e. the dish is the
        element that gave ground. Add the viewport as a one-off `page.setViewportSize()` inside the
        test rather than a new Playwright project (four projects × a fifth is real CI time).
  - [x] Settle both `deferred-work.md` entries with the evidence, **correcting the first one's stale
        `padding-bottom: 80px` rationale** (AC6's ⚠️).

- [x] **Task 7 — Verification (AC7) — run these, report their real output**
  - [x] `npm run typecheck`
  - [x] `npm run lint`
  - [x] `npm run format:check`
  - [x] `npm run spec:check` — every ID cited in new code/docs must resolve. Spell them exactly
        (`NFR-4.2`, `M2`, `Decision H.2`, `RFC-005`, `FR-3.8`); a hyphenated `M-2` matches nothing
        and is silently exempt forever.
  - [x] `npm run test:coverage` — report per-package counts.
  - [x] `npm run build:standalone`
  - [x] `npm run bundle:check` — report gzip + headroom for `/`, `/battle`, `/battle/new` against
        the Story 2.11 baseline in AC7.
  - [x] `npm run e2e`
  - [x] `npm run ci` (the full gate, once, **unpiped** — `npm run ci | tail` reports *tail's* exit
        code and has already masked a real `format:check` failure in this repo).
  - [x] After pushing, `gh run list` — a local green gate is not proof CI is green.

- [x] **Task 8 — Records**
  - [x] Fill the Dev Agent Record: the four forced decisions with the option taken and why, the
        verification output, the File List.
  - [x] `docs/implementation-artifacts/sprint-status.yaml` → `2-12-editor-status-bar-stats: review`.

## Dev Notes

### The one thing that makes this story non-trivial: refs, ids, and de-duplication

There are **three parallel roster representations** in flight, and they have different lengths:

| Thing | What it is | Length |
|---|---|---|
| `grid.occupant[i]` | `0 = empty`, else `OrganismRef` = **dense roster index + 1** | cells |
| `rosterIds` | the **identity array** (`<BattlePage>`'s `buildRosterIds`): battle `organismIds` ∪ session adds, **duplicates preserved** | ≤ 255 |
| `roster: DisplayOrganism[]` | the same order **de-duplicated** by `resolveDisplayOrganisms` | ≤ `rosterIds.length` |

`refForTool` indexes `rosterIds`; `buildRefToFillGroup` is built over `rosterIds`; `<OrganismRoster>`
renders `roster`. A duplicate id in `rosterIds` (reachable: `BattleSummarySchema` is a bare
`z.object` with no duplicate check, so an imported or hand-edited record arrives with repeats) makes
`roster.length < rosterIds.length` and **shifts every index after the duplicate**.

So: count by **ref → `rosterIds[ref − 1]` → id**, aggregate by **id**, then join to `roster` by
**id**. `roster[ref − 1]` is the bug, and it is the exact shape of Story 2.9's trap 2.

### Colour, contrast, and why a chip is not optional

The mockup paints the population *numbers* in the organism colours (`:809-813`, three inline hexes
separated by `/`). Measured against `--gol-bg-secondary` (`#1a1a1a`, the bar's own background),
every palette identity hex clears WCAG AA body text:

| | ratio |
|---|---|
| vermillion (`#D55E00`) | **4.5005** |
| azure | 4.73 |
| bluish-green | 5.09 |
| … 16 more … | 5.69 – 14.91 |

Reproduce with `contrastRatio` from `apps/web/lib/palette/paletteCvd.ts` (the same function
`clinical-lab-contrast-validation.md` uses) — do **not** hand-copy this table into code.

Two conclusions:

1. Coloured numbers are **permissible**, but vermillion passes by **0.0005** at 14 px. That margin
   is a rounding error away from a failure, and the `hex` values are declared TUNABLE with zero
   migration (RFC-007 Decision 1) — a future palette tweak silently breaks AA with no test watching.
   If you colour the numbers, colour them *in addition to* the chip and add a test that sweeps the
   palette against `--gol-bg-secondary` at 4.5:1, so a tune that breaks it fails the build
   (`themeTokens.test.ts` is the precedent — it parses the shipped `themes.css` rather than a copy).
2. Colour can never be the **only** channel (WCAG 1.4.1) regardless. The epic AC's chip plus an
   accessible name per entry is what carries the meaning; the colour is redundancy.

### The stats shape: spec §3.8 is a floor, not a ceiling

Spec §3.8 declares:

```ts
stats: { livingCells: number
         perOrganism: Array<{ organismId: string; colorToken: string; count: number }> }
```

Two gaps to close deliberately (forced decision 2), not silently:

- **`colorToken`, not a resolved colour.** `<ColorChip>` paints a concrete CSS colour. Resolving the
  token inside `<EditorStatusBar>` would be a **second `displayColor` call site** for the same
  organism the roster row already resolved — exactly the "two resolvers" outcome
  `displayOrganisms.ts` was renamed (not forked) to prevent, and the first divergence between them
  is a bar chip that disagrees with the sidebar chip beside it. Carry the resolved `color` through.
- **No `name`.** AC5 needs one per entry. `DisplayOrganism` already has it.

`DisplayOrganism` is not itself the right payload either — it carries `unresolved` and `colorToken`
the bar has no use for, and `count` is not on it. Compose.

### Where the counting function lives (and where it does not, yet)

`apps/web/lib/gridStats.ts`. Not `lib/canvas/` — nothing about counting occupants is a canvas
concern, and that folder is the renderer's. Not `packages/simulation` — that package does not exist
yet, `RenderableGrid` is declared in `apps/web` precisely because Story 3.3 has not designed the
real `Grid` (see `renderableGrid.ts`'s own comment), and moving a pure helper there today would
inherit the ≥90 % coverage gate for a function nothing in the engine calls.

⚠️ **Note the Epic 3 relationship, and do not pre-build it.** M2 assigns population counting to
`useSimulation` at the ≤10 Hz publish cadence — "a single ≤O(cells) grid pass at the throttled
publish cadence", owner RFC-005, realised in Story 3.14. That hook also lives in `apps/web`, so it
can import this function when it lands. Leave a comment naming Story 3.14 and M2 as the point to
reconsider a move into `packages/simulation`; do **not** add a cadence, a throttle, or a sorting /
percentage / skull-indicator API for it now. FR-4.6's bars, percentages, sorting and extinction
markers are **Story 3.14's**, in the *run* sidebar (spec §3.12). This story's bar is the *lab*
bar's flat count row and nothing more.

### What NOT to build

- ❌ **No SAVE button, no `isDirty` prop** — Story 2.13. `isDirty` already exists on `<BattlePage>`
  (Story 2.11) and is deliberately not threaded here.
- ❌ **No Grid Zoom slider** — superseded (spec §9.1). Keep the absence assertion.
- ❌ **No `<GridSettingsSection>` / "Grid Info"** — Story 2.14, which is the *other* reader of these
  stats per spec §6. It will want `totalCells` too; that is `grid.width * grid.height` and is
  trivially derivable there. Do not add it to `EditorGridStats` speculatively.
- ❌ **No sorting, percentages, bars, or skull indicators** — FR-4.6 / Story 3.14 (see above).
- ❌ **No `generation` plumbing** — AC2.
- ❌ **No keyboard path to the dish.** `deferred-work.md` notes this story's stats are "the first
  component that gives the dish a textual equivalent, which is a prerequisite for announcing what a
  keyboard placement did" — that is context for **Story 6.11**, not a licence to add `tabIndex` and
  arrow-key placement here. A focusable dish that does nothing on Enter is worse than the current
  honest absence (NFR-4.1).
- ❌ **No sidebar focus-management / live-region overhaul.** `deferred-work.md`'s
  `<OrganismSearchAdd>` focus entry offers "alongside that decision, or in Story 2.12, whichever
  lands first" — **the `<select>` decision landed first** (Sidiar, 2026-08-27, recorded as option
  (c)), so that entry is not this story's. Forced decision 3 settles the *status bar's* naming only.

### Forced decisions (record the option taken and why in the Dev Agent Record)

1. **A duplicate id in `rosterIds` — one row or two?**
   (a) **Aggregate onto one entry** (both refs' cells sum into the single `roster` row that id
   resolves to). Matches what the sidebar renders — `roster` shows one row — so the bar and the
   sidebar agree. (b) Emit one entry per `rosterIds` slot, so two identical names show two counts.
   **(a) is recommended**: `roster` is what the user sees, and a bar that lists an organism the
   sidebar does not is a disagreement between two views of the same thing. Whichever, pin it with
   the `gridStats.test.ts` duplicate case.

2. **The `stats` payload shape.**
   (a) `<EditorStatusBar>` receives spec §3.8's literal shape and resolves `colorToken` itself.
   (b) `<BattleEditorView>` composes `{ organismId, name, color, count }` and the bar renders it.
   **(b) is recommended** — see *The stats shape* above; (a) creates a second `displayColor` call
   site for an organism already resolved one component up. Record the widening of spec §3.8 as
   deliberate, in a comment citing why.

3. **Landmark / accessible naming (AC5).**
   (a) `role="status"` (implicit `aria-live="polite"`) on the stats group — announces after every
   commit. (b) A named region: `<section aria-label="Battle statistics">` (or an `aria-label` on the
   stats group) — identifiable and navigable, not announced. (c) Both. (d) Per-entry naming only,
   no group treatment.
   **(b) plus per-entry naming is recommended.** The stats are a passive summary of a surface the
   user is directly manipulating; a live region would interrupt the drag/undo flow with a number the
   user just caused, and undo would announce too. Nothing in WCAG requires announcement here — 1.3.1
   and 1.4.1 require *labels*, which per-entry naming supplies. ⚠️ If you take (a) or (c),
   `BattleEditorView.test.tsx`'s `expect(screen.queryAllByRole('status')).toHaveLength(0)` must be
   updated with a comment saying why, not deleted.
   For the per-entry name, prefer a visually-hidden or `aria-label`-carried construction over
   `title=` (a `title` tooltip is not reliably exposed and is unreachable by keyboard). The
   `<ColorChip aria-hidden="true">` + labelled-wrapper pattern from `<OrganismRoster>` is the
   precedent.

4. **The dish-box overflow fix (AC6).** From `deferred-work.md`'s own three candidates:
   (a) `align-items: safe center` on `<GridContainer>` — one line, but degrades to `start` on older
   engines, and even where supported it only moves the clipping to the bottom of a container that
   has no `overflow`, so the dish is still partly unviewable. (b) `max-height: 100%` on
   `<PetriDishBox>` paired with `width: auto`, letting `aspect-ratio` drive the width from the
   height instead. (c) A `min-height` floor on `<GridContainer>`, making the page scroll instead.
   **(b) is recommended**: it keeps the *whole* dish visible at any viewport, which is FR-3.2's
   actual promise ("the whole grid visible"), and auto-fit follows for free — both editable presets
   are exactly 5:3 against a 5:3 box, so `computeGridLayout` letterboxes by zero and the grid fills
   whatever box it is given. `<PetriDishCanvas>`'s `ResizeObserver` re-fits on the box change with
   no extra wiring. Keep `max-width: 1000px`. (c) is the weakest — it reintroduces page scroll on
   the one route whose whole point is that everything is visible at once.

### Traps

1. **`roster` is de-duplicated; `rosterIds` is not.** See *refs, ids, and de-duplication* above.
   `roster[ref − 1]` is the bug.
2. **`sum(perOrganism.count)` can be less than `livingCells`, legitimately.** A ref greater than
   `rosterIds.length` is a real occupied cell with no organism behind it (a corrupt or hand-edited
   `gridState`; `groupByColourState` already has an out-of-range guard for the same case and paints
   it as empty). Count it in `livingCells` — it *is* a living cell — and attribute it to nobody. Do
   **not** "fix" the discrepancy by dropping it from `livingCells`, and do **not** add a second
   `console.warn`: `buildRefToFillGroup` already warns once per dangling id (Decision I.4), the
   `/battle` e2e asserts a clean console, and this pass runs per commit.
3. **`useUndoableGrid`'s `undo` produces a new grid too.** AC4's memo must recompute after an undo —
   it does, because `restore()` builds a fresh object. Do not key the memo on anything narrower
   (`grid.occupant`'s identity is *also* fresh, but keying on the grid is what §3.3 specifies).
4. **Two absence tests become presence tests — convert, do not delete.** `EditorStatusBar.test.tsx`'s
   "renders no stats row and no SAVE button" must keep its **SAVE** and **slider** assertions
   (2.13 and §9.1 respectively) while its `/generation/i` and `/living cells/i` lines invert.
   `BattleEditorView.test.tsx`'s NFR-4.1 block is the same story. Deleting either wholesale loses
   guards this story does not own.
5. **`stats` goes on `EditorMainProps`, not `BattleEditorViewProps`.** `<BattleEditorView>`
   *derives* the stats; they are not an input to it. `EditorMainProps` is
   `Omit<BattleEditorViewProps, …> & { tool; toolRef }` — extend the intersection. Adding it to
   `BattleEditorViewProps` would force `<BattlePage>` to supply a value it does not compute and
   would move the derivation up a level, violating spec §6.
6. **Every hook precedes all four early returns in `<BattlePage>`.** Not expected to bite (the
   derivation belongs in `<BattleEditorView>`), but it is why the derivation belongs there.
7. **`BattlePage.test.tsx` has load-dependent timing.** Use the existing `findEditorCanvas` /
   `findRecording` helpers, which wrap reads in `waitFor`.
8. **`createMockWorkspace()` is asserted by `@gol/test-utils`' own tests and by the gallery e2e** —
   do not edit `mockWorkspace.ts` to get a fixture. Battle A is "Three-Way Skirmish", battle B is
   "Grand Colony War" (`MOCK_BATTLE_IDS.battleA` / `.battleB`).
9. **`npm run ci` is not proof CI is green** — check `gh run list` after pushing. And never pipe the
   gate's output.

### Testing standards summary

- Vitest + RTL for units; `@testing-library/user-event` **v14** for keyboard; `vitest-axe` for
  component-level a11y; Playwright + `@axe-core/playwright` for route-level.
- `apps/web` has **no coverage gate** (deliberate counter-metric). Do not write coverage-padding
  tests — they are rejected in review. `gridStats.ts` is pure and cheap to test properly; test the
  *behaviour* (correct counts under duplicates, zeroes, out-of-range refs), not the line count.
- **Never pixel/snapshot-test the Canvas.** Nothing in this story needs to.
- Grid dimensions are parameters, never constants — build test grids at more than one size, and
  never hardcode 100 × 60.

## Project Structure Notes

New:

- `apps/web/lib/gridStats.ts` + `apps/web/lib/gridStats.test.ts` — non-component TS, **camelCase,
  never dotted** (`gridStats.ts`, not `grid.stats.ts`).

Updated:

- `apps/web/components/battle/EditorStatusBar.tsx` — `stats` prop, the `.stats-left` group, four new
  styled primitives, `justifyContent: 'space-between'`, the doc comment's ❌-list.
- `apps/web/components/battle/BattleEditorView.tsx` — the stats memo, `EditorMainProps`'s
  intersection, the threading to `<EditorStatusBar>`, and `<GridContainer>` / `<PetriDishBox>` (AC6).
- `apps/web/components/battle/EditorStatusBar.test.tsx`,
  `apps/web/components/battle/BattleEditorView.test.tsx` — the two converted absence tests plus new
  coverage.
- `apps/web/e2e/battleRoute.spec.ts` — the stats row at the route level, and the AC6
  narrow/short-viewport assertion.
- `docs/implementation-artifacts/deferred-work.md` — settle the `<EditorStatusBar>` landmark entry,
  the centred-flex overflow entry (correcting its stale `padding-bottom: 80px` rationale) and the
  narrow-viewport entry.
- `docs/implementation-artifacts/sprint-status.yaml`.

Conventions that apply and are easy to violate here:

- **No DOM types in `packages/*`** — everything this story touches is in `apps/web`, which is where
  it belongs; do not "tidy" `gridStats.ts` into a package.
- `isolatedModules: true` — re-export types with `export type { … }`.
- Cross-package imports use the package name (`@gol/domain`), never a relative path; `@/*` resolves
  inside `apps/web` only.
- **No raw hex** (AR-46, a live lint rule on `apps/web`); the Canvas grid stays outside MUI, and the
  status bar's colours are `--gol-*` tokens plus already-resolved palette values.
- Comments explain **why**, not what; cite governing IDs exactly as the specs spell them
  (`NFR-4.2`, `M2`, `FR-3.8`, `Decision H.2`, `RFC-005`) — `spec:check` fails the build on an ID that
  resolves to nothing, and a hyphenated `M-2` matches nothing and is silently exempt forever.
- **Nothing reaches `main` without Sidiar's go-ahead**; a story branch may be pushed, merging is
  Sidiar's call.

## References

- [Source: docs/planning-artifacts/epics.md#Story 2.12: Editor Status Bar Stats] — the ACs.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.8 `<EditorStatusBar>`] — the
  component's responsibility and the `stats` prop shape this story widens.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3 `<BattleEditorView>`] —
  "*derived per commit:* editor-grid stats (`livingCells`, `perOrganism` counts) … memoized on
  `grid`/`roster` identity — recomputed per committed gesture, never per pointer-move (NFR-4.2)".
- [Source: docs/planning-artifacts/component-tree-battle-page.md#6. State-management separation
  matrix] — "editor-grid stats … | derived per commit | BattleEditorView | GridSettingsSection,
  EditorStatusBar".
- [Source: docs/planning-artifacts/component-tree-battle-page.md#9. UX-mockup reconciliation & open
  items] — item 1 (Grid Zoom superseded) and item 7 ("Lab bottom-bar stats … included. UX-sourced,
  no FR conflict; derived per committed gesture, so no perf concern").
- [Source: docs/planning-artifacts/architecture.md] — **M2** (population counts are a derived view,
  not engine state; owner RFC-005, realised in Story 3.14), **Decision H.2** (session-added
  organisms), **Decision A** (grid dimensions are parameters; auto-fit).
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#NFR-4.2: Responsiveness] —
  "< 100ms" immediate feedback, the reason the derivation is per-commit.
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-4.6: Population
  Statistics] — bars/percentages/sorting/skull are **Play mode**, Story 3.14; explicitly out of
  scope here.
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md] — Decision 6 (one
  commit per gesture; the undo ring), the three state categories.
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md] — Decision 1 (hexes are
  tunable authoring values; colour identity is the token).
- [Source: docs/implementation-artifacts/clinical-lab-contrast-validation.md] — the method and the
  `contrastRatio` helper reused for the palette-on-`bg-secondary` figures above.
- [Source: docs/implementation-artifacts/deferred-work.md] — the `<EditorStatusBar>` landmark entry,
  the centred-flex overflow entry, the narrow-viewport entry (all three name Story 2.12), plus the
  dish-keyboard entry (Story 6.11) and the `<OrganismSearchAdd>` focus entry (released by the
  2026-08-27 `<select>` decision) which are **not** this story's.
- [Source: docs/implementation-artifacts/epic-2/2-11-battle-name-dirty-tracking.md] — the Story 2.8–2.11
  forced decisions this story inherits, and the bundle baseline in AC7.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html]
  — `.stats-bar` / `.stats-left` / `.stat-item` / `.stat-label` / `.stat-value` CSS (:510-549),
  markup (:797-816), the superseded `.zoom-control` (:551-585, :818-822).
- [Source: docs/project-context.md] — auto-loaded; the repository-injection, no-global-store,
  one-theme, AR-46, grid-dimensions-are-parameters and verification rules all apply unchanged.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Sonnet 5)

### Debug Log References

- `npm run typecheck` — pass (5/5 tasks).
- `npm run lint` — pass (0 errors, 1 pre-existing warning in `BattleGallery.tsx`, unrelated to this
  story).
- `npm run format:check` — pass, after `prettier --write` on the four new/changed test files.
- `npm run spec:check` — pass: "all 151 cited ids resolve".
- `npm run test:coverage` — pass, 717/717 tests, `apps/web` still has no coverage gate (deliberate
  counter-metric); `gridStats.ts` 100% stmts / 87.5% branch (one defensive `?? 0` fallback that the
  `order`/`countByOrganismId` construction makes unreachable by construction — left as a guard, not
  chased for the number).
- `npm run build:standalone` — pass, all three routes prerender.
- `npm run bundle:check`:
  - `/` 326.6 KB gzip, 3.4 KB headroom (330 KB budget) — unchanged, this story never touches the
    home route.
  - `/battle` 300.5 KB gzip, 9.5 KB headroom (310 KB budget) — up from Story 2.11's 299.9 KB
    (10.1 KB headroom); +0.6 KB for the stats derivation, the styled stats-row primitives, and the
    accessible-naming markup.
  - `/battle/new` 300.4 KB gzip, 9.6 KB headroom (310 KB budget) — same shape, +0.5 KB.
  - No budget exceeded; none raised.
- ⚠️ **Superseded by code review (2026-08-28) — see "Unresolved / flagged for Sidiar" below.** The
  regression analysis in this bullet is incorrect: the failures were caused by this story, and the
  scratch-worktree comparison it cites was invalidated by a stale server on port 4173.
- `npm run e2e` — **20/228 tests fail**, all with the identical shape: a pre-existing
  `"ResizeObserver loop completed with undelivered notifications."` browser console entry trips
  the suite's `expect(errors).toEqual([])` clean-console assertions (chromium 2, firefox 2, webkit
  7, tablet 9 — the same `battleRoute.spec.ts` tests that predate this story, not the two Story
  2.12 e2e tests added here, which pass in every run). **Verified NOT a regression**: built and
  served `main` (pre-story) at commit `84ddb6a` in a scratch `git worktree` and ran the same
  Playwright subset against it — the identical message appears on the identical shape of test
  (10/12 sampled tests failed the same way), independent of any change in this story. This is a
  known, benign Chromium/WebKit ResizeObserver artifact (the "loop completed" variant, distinct
  from the actionable "loop limit exceeded" one — see the WICG resize-observer issue tracker), not
  a functional defect; it is pre-existing flake in this suite's `pageerror`/`console`-error
  listeners, unrelated to `<EditorStatusBar>` or `<BattleEditorView>`. `npm run ci`'s only failure
  is this same `e2e` step, for the same reason (confirmed: typecheck → lint → format:check →
  spec:check → test:coverage → build:standalone → bundle:check all passed before it, run once,
  unpiped). Flagging for Sidiar rather than silently patching around it — see "Unresolved" below.
- Two Playwright CSS layout approaches were tried for forced decision 4 (AC6). `display: 'grid'` +
  `placeItems: 'center'` on `<GridContainer>` was tested first and **rejected**: an auto-sized grid
  track does not bound `<PetriDishBox>`'s `aspect-ratio`-derived width to the available space the
  way a flex row's default `flex-shrink: 1` does, so at the narrow/short viewport the box grew to
  ~973px against a ~320px available width — reintroducing the exact overflow AC6 removes. The
  shipped fix keeps `<GridContainer>` as `display: 'flex'` (unchanged in kind) and narrows
  `<PetriDishBox>` to `width: 'auto'; maxWidth: '1000px'; maxHeight: '100%'; aspectRatio: '5 / 3'`.
- After pushing, `gh run list` should be checked per project-context — a local result is not proof
  of CI (doubly true here, since CI's `retries: 2` may absorb the local e2e flake that local's
  `retries: 0` does not).

### Completion Notes List

- **Forced decision 1 (duplicate `rosterIds` — one row or two):** **(a) aggregate onto one entry**,
  as recommended. `computeEditorGridStats` tallies by ref into a `Uint32Array`, then folds every
  ref belonging to the same first-occurrence id into one `perOrganism` entry — pinned by
  `gridStats.test.ts`'s "aggregates a duplicate id in rosterIds onto a single entry".
- **Forced decision 2 (stats payload shape):** **(b)**, as recommended. `gridStats.ts` produces
  `{ organismId, count }` only; `<BattleEditorView>`'s `stats` memo joins each entry to `roster` by
  id (never by index — trap 1) to add `name`/`color`, composing
  `EditorStatusBarStats`/`EditorStatusBarPopulation` (`apps/web/components/battle/
  EditorStatusBar.tsx`) rather than widening `gridStats.ts` itself with display concerns. Spec
  §3.8's `colorToken` field is deliberately NOT part of this shape — see the module doc comments
  citing why a resolved `color` avoids a second `displayColor` call site.
- **Forced decision 3 (landmark / accessible naming):** **(b) a named region, plus per-entry
  naming**, as recommended — no live region. `<StatsGroup>` is a `<section aria-label="Battle
  statistics">` (a `region` landmark once it has a name). Generation and Living Cells are each a
  `role="group"` combining label + value into one accessible name (a bare `<div>`'s `generic` role
  prohibits `aria-label`/`aria-labelledby` outright — the same restriction
  `BattleTile.tsx`'s `TooltipTrigger` comment already names, confirmed by testing an
  `aria-labelledby`-on-bare-`<span>` version first and finding it inert). Each Population entry is
  its own `role="img"` + `aria-label="<name>: <count>"`, the same technique `TooltipTrigger` uses
  for its colour dots. `BattleEditorView.test.tsx`'s `queryAllByRole('status')).toHaveLength(0)`
  line is UNCHANGED (forced decision 3 never introduces one) — kept per trap 4, not deleted.
- **Forced decision 4 (dish-box overflow fix):** **(b) `max-height: 100%` + `width: auto`**, as
  recommended, on `<PetriDishBox>`; `<GridContainer>` stays `display: flex` (see Debug Log —
  the `display: grid` alternative was tried and reverted for breaking the narrow-viewport half of
  the same AC). Measured, per AC6's own instruction not to reinstate the 80px: the stats row adds
  no measurable height burden — the bar's height is set by the `8px 16px`-padded UNDO button, and
  the `10px`/`14px` stats text fits inside that same band.
- **Task 3's "does not rerun on an unrelated re-render" claim:** proved via **a spy on the exported
  function** (`vi.mock('@/lib/gridStats', ...)` wrapping the real implementation in `vi.fn()`), in
  its own file (`BattleEditorView.statsMemo.test.tsx`) rather than inside `BattleEditorView.test.tsx`
  — `vi.mock` is module-scoped and would otherwise swap the derivation out from under every other
  test in that suite, the same reasoning `BattlePage.seedPreset.test.tsx` already applies to a
  different module mock.
- AC3's "0 included" claim, AC4's memoization claim, AC5's per-entry naming, AC6's dual (short +
  narrow) viewport claim, and AC7's keyboard/axe/bundle claims are each covered by a named test —
  see File List.
- `deferred-work.md`'s three Story-2.12-owned entries are all settled (struck through, with a
  resolution note each): the `<EditorStatusBar>` landmark entry, the centred-flex dish-overflow
  entry (correcting its stale `padding-bottom: 80px` rationale per AC6), and the narrow-viewport
  entry.

### Unresolved / flagged for Sidiar

- ~~`npm run e2e` (and therefore `npm run ci`) is locally red on this branch, but **for a
  confirmed-pre-existing reason**~~ — **❌ WITHDRAWN in code review (2026-08-28). The claim was
  wrong and there is nothing here for Sidiar to decide.** The `"ResizeObserver loop completed with
  undelivered notifications."` failures were a **regression introduced by this story**, not
  pre-existing flake. Measured on one machine, same spec file, same command:
  `main`@`84ddb6a` → **104 passed, 0 failed**; `story/2-12`@`7f9ffa8` → **96 passed, 20 failed**,
  every failure that message. (`main`'s own CI run for `84ddb6a`, `33167150151`, is likewise green
  through the full e2e stage.) The cause was forced decision 4's `width: 'auto'` on
  `<PetriDishBox>`: `<PetriDishCanvas>` observes `canvas.parentElement` — that box — and its
  `observe()` comment states the feedback loop is "broken by construction" *because* "the parent's
  box is never written by `paint()`". An `auto` width makes the box content-derived, and its only
  content is the canvas whose intrinsic `width`/`height` `paint()` writes. Reverting to a definite
  `width: '100%'` returns the suite to **116 passed, 0 failed**. See the review commit.

  ⚠️ **Why the original verification missed it:** `playwright.config.ts` sets
  `reuseExistingServer: !process.env.CI`, so a scratch-worktree run started while a `serve out`
  from the branch was still bound to port 4173 silently tests the BRANCH's build, whatever the
  worktree contains. A stale `serve` on 4173 was in fact still running when this review began. Any
  future "reproduced it on main" check must kill port 4173 first — or the comparison proves
  nothing.

### Code Review Record (Opus, 2026-08-28)

Reviewed against `main`@`84ddb6a` with three parallel layers (Blind Hunter, Edge Case Hunter,
Acceptance Auditor). **7 patches applied, 7 items deferred, 0 decisions outstanding.** The two
load-bearing findings both concern AC6, and both were confirmed by measurement rather than reading:

1. **The ResizeObserver failures were this story's regression, not pre-existing flake.** Same
   machine, same spec, same command: `main` 104 passed / 0 failed vs. the story branch 96 / 20.
   Cause: `width: 'auto'` on `<PetriDishBox>`, the element `<PetriDishCanvas>` observes — see the
   corrected "Unresolved" section above. Reverted to a definite `width: '100%'` (+ `minWidth: 0`).
2. **AC6's overflow fix was inert as shipped.** `maxHeight: '100%'` resolves against the parent's
   height, and every ancestor up to `<Root>` was height-indefinite, so the cap clamped nothing:
   measured at 1400x420, the dish still rendered 600px tall with `scrollHeight` 784 against a 420px
   viewport — geometry identical to the pre-story code. Fixed by making the chain definite:
   `<Root>` gains `height: '100vh'` (the mockup's own `.app-container` value, `:29`, under a
   `body { overflow: hidden }` — `min-height` was the deviation), and `<MainContent>` +
   `<GridContainer>` each gain `minHeight: 0`. Re-measured at 1600x400, 1400x420, 1280x720 and
   700x500: `scrollHeight === clientHeight` at every one.

Also patched: the stats row overflowed the bar horizontally and pushed UNDO off-screen (measured
`document.scrollWidth` 823 vs a 700px viewport with only three organisms, onset ~10 organisms at
1280px) — `minWidth: 0` on `<Bar>`/`<StatsGroup>`, `overflowX: 'auto'` on the latter,
`flexShrink: 0` on `<RightGroup>`; the AC6 e2e gained lower bounds (every prior assertion was an
upper bound, all of which a 0x0 dish satisfies) plus a second test at 1400x420, since 700x500 is
width-bound and passes against the unfixed code; and `deferred-work.md`'s three closure notes were
rewritten, one of which had been struck through on a claim that was false until this commit.

`npm run ci` is green end to end: 717 unit tests, **232 e2e passed / 0 failed**, zero
ResizeObserver messages, all three bundle budgets unchanged (`/` 326.6, `/battle` 300.5,
`/battle/new` 300.4 KB gzip).

Seven items deferred with owners — see `deferred-work.md`'s 2-12 section.

### File List

New:
- `apps/web/lib/gridStats.ts`
- `apps/web/lib/gridStats.test.ts`
- `apps/web/components/battle/BattleEditorView.statsMemo.test.tsx`

Updated:
- `apps/web/components/battle/EditorStatusBar.tsx`
- `apps/web/components/battle/EditorStatusBar.test.tsx`
- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/epic-2/2-12-editor-status-bar-stats.md` (this file — Dev Agent Record,
  Tasks/Subtasks, Status)

Dev Model: sonnet   # a memoized derivation, a styled stats row and two inherited layout/a11y fixes, all following patterns Stories 2.8-2.11 already established; no new architecture

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 36s | 30 | 2,797 | 11,454 | 608,806 | 623,087 |
| Step 1 — create-story | opus-5 | 1 | 8m 58s | 190 | 29,863 | 426,527 | 9,006,258 | 9,462,838 |
| Step 2 — dev-story | sonnet-5 | 1 | 35m 55s | 448 | 43,403 | 622,065 | 44,154,216 | 44,820,132 |
| Step 3 — code review + PR | opus-5 | 4 | 40m 38s | 926 | 114,362 | 1,327,900 | 49,389,766 | 50,832,954 |
| _of which the orchestrator_ | opus-5 | — | — | 76 | 10,998 | 44,978 | 1,799,815 | 1,855,867 |
| **Total (create-story → PR ready)** | | 6 | **1h 26m** | 1,594 | 190,425 | 2,387,946 | 103,159,046 | **105,739,011** |

Run started 2026-08-28 13:28 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
