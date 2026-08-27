---
baseline_commit: 0f346d06c310aad28725da9fbb4bafe2c840f362
---

# Story 2.10: Add Organisms from Library

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to add any library organism to my battle,
so that I can compose battles from the shared library.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.10: Add Organisms from Library`, decomposed into the nine things a
reviewer can independently check. AC6–AC8 are `deferred-work.md` entries that name **Story 2.10** as
owner — inherited debt coming due, not extra scope.

1. **AC1 — The add control lists the library MINUS the current roster.** The "Organisms" section
   grows the mockup's `.add-organism-container`: a search input and a "+ ADD ORGANISM" dropdown
   (`petri-dish-lab-mode.html:683-692`). The dropdown's options are the workspace library
   (`organisms.list()`, FR-7.15) with every id already in the roster union removed — an organism
   already in the battle is never offerable again, so an "add" can never be a no-op. ❌ Still no
   "+ CREATE NEW ORGANISM" button and still no per-row ✎ (Epic 4 — Story 2.9's AC5 named their
   absence and it stands).

2. **AC2 — The search box filters the DROPDOWN, and only the dropdown.** Typing narrows the add
   list live (case-insensitive substring on the organism name is the expected reading; the story
   picks and records the exact predicate). ⚠️ The roster list above it — the battle's own organisms
   — is **never** filtered, hidden, reordered or re-indexed by the search. Spec §3.4: "Search box is
   UX-sourced (mockup; no dedicated FR) — filters the add dropdown only", and §6 places the filter
   text as `<OrganismRoster>`'s **own** ephemeral local state, read by nothing else.

3. **AC3 — Choosing an entry adds it to `sessionRoster`, renders it as a roster row, and makes it
   paintable.** The chosen id reaches `<BattlePage>`'s `sessionRoster` (Decision H.2 — the state
   cell that has had no writer until now), the union appends it (never inserts, never sorts —
   `buildRosterIds`), a row appears at the END of the roster list with the organism's real name and
   chip colour, and selecting that row paints THAT organism on the dish. The add control's options
   shrink by one, because AC1's exclusion is derived from the same union.

4. **AC4 — A session-added, unpainted organism is not persisted and does not survive a reload.**
   Decision H.2. Nothing this story writes may reach a repository: `sessionRoster` is working state,
   and the H.1 prune at save is Story 2.13's. A reload of `/battle?id=…` shows the battle's own
   roster again with the added organism gone. (The epic's own AC says "verified end-to-end once save
   lands in 2.13" — what IS verifiable here is that no repository write happens and that the row
   does not come back after a reload.)

5. **AC5 — A roster at the 255 cap blocks the next add WITH A MESSAGE.** Decision G.3: "the Battle
   roster UI blocks adding a 256th (with a message) instead of overflowing." `buildRosterIds`
   already stops appending at `MAX_ROSTER_SIZE` — **silently**, which is correct for a seed and
   wrong for a click (`deferred-work.md`, the Story 2.9 close note). At the cap the add control is
   disabled/unavailable and an explanatory message states the limit; nothing throws, the roster is
   unchanged, and the rest of the editor keeps working.
   ⚠️ The cap is measured on the IDENTITY array (`rosterIds.length`), never on the resolved display
   list — `resolveDisplayOrganisms` de-duplicates, so `roster.length` can be SHORTER than the number
   of refs the encoding has actually spent (Story 2.9 trap 2).

6. **AC6 — A roster mutated while a renderer is live paints the new organism correctly, and the
   `setPalette` entry is settled.** (`deferred-work.md`, "No `setPalette` — a roster change cannot
   update the LUT the renderer holds", explicitly "**Pick this up in Story 2.10** … the first story
   that mutates a roster while a renderer is live".) The entry's premise must be **re-tested against
   the code as it now stands** (see Dev Notes → *The `setPalette` entry is probably already closed*)
   and then either closed with the evidence or fixed. The reviewable claim either way: after an add,
   painting with the newly-added organism produces its OWN colour on the dish, not the empty
   background, and no `groupByColourState` out-of-range warning is emitted.

7. **AC7 — `/battle/new` is paintable again in the window Story 2.9 deliberately left open.**
   Story 2.9's review (decision 1, Sidiar's option (a)) made the `DEFAULT_TOOL` seed conditional on
   Conway's Classic actually being present in the loaded library, accepting that `/battle/new` is
   "honestly unpaintable" otherwise, "until Story 2.10's add dropdown ships". With a library that
   holds organisms but not Conway, the user can now add one and paint. This is the story that pays
   that debt back, and it needs a test that says so.

8. **AC8 — Nothing left to add is a stated state, not an empty dropdown.** When the library is a
   subset of the roster (reachable today: `mockWorkspace`'s "Grand Colony War" places all four
   organisms), the add control has zero options. A `<select>` containing only its placeholder is a
   live-looking control that does nothing — the dead affordance NFR-4.1 forbids. Say so instead. The
   same applies when the SEARCH matches nothing, which is a different fact and may deserve different
   copy; the story decides and records both.
   ⚠️ `libraryUnavailable` (Story 2.9 AC7) is a THIRD state: the library failed to load, so there is
   nothing to add and nothing to say about it beyond the notice already rendered. The add control
   must not render at all there.

9. **AC9 — Keyboard-operable, axe-clean, bundle re-measured.** The search input and the add control
   are reachable and operable by keyboard alone; the add control has an accessible name (the mockup
   gives it no visible label — see forced decision 2); `vitest-axe` on the rendered sidebar reports
   zero violations and the `/battle` + `/battle/new` Playwright axe scans stay at zero. Report
   `bundle:check`'s measured gzip and headroom for all three routes. Story 2.9 left `/battle` and
   `/battle/new` at **11.3 KB** headroom and `/` at **3.5 KB**; a budget is never raised
   unilaterally — if one is exceeded, **STOP and ask Sidiar**.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (all ACs)**
  - [x] `apps/web/components/battle/OrganismRoster.tsx` in full — the props interface (which
        deliberately omits `library`/`onAddToRoster` "Story 2.10 owns" them), the `RosterList` /
        `EraserRow` structure, the `aria-pressed` selection contract, and `DegradedNotice`.
  - [x] `apps/web/components/battle/BattleEditorView.tsx` in full — `chosenTool`,
        `resolveSelectedTool`, `findDuplicateColorIds`, the `toolRef` memo, `SidebarSection` /
        `SidebarSectionTitle`, and the `Omit<…, 'rosterIds' | 'roster' | 'libraryUnavailable'>`
        boundary that keeps roster props out of `<EditorMain>`.
  - [x] `apps/web/components/battle/BattlePage.tsx` in full — the `sessionRoster` `useState` (value
        only, no setter yet), the `rosterIds` memo with its conditional `DEFAULT_TOOL` seed, the
        `roster` memo, the `palette` memo, and `organismsResource`.
  - [x] `apps/web/lib/rosterUnion.ts` — `buildRosterIds`, its append-only and cap invariants.
  - [x] `apps/web/lib/canvas/refToFillGroup.ts` — `MAX_ROSTER_SIZE`, and the throw above it.
  - [x] `apps/web/components/PetriDishCanvas.tsx` `EditDish` — the construction effect's
        `[size, palette, colors]` deps and its cleanup. **This is the file AC6 turns on.**
  - [x] `apps/web/components/battle/EditorStatusBar.tsx` — the styled-primitive house style
        (`styled('button')`, real `disabled`, `--gol-*` only, `2px solid var(--gol-accent)`
        focus-visible ring, enumerated transitions, reduced-motion escape).
  - [x] `docs/implementation-artifacts/deferred-work.md` — the `setPalette` entry (line ~71), the
        Story 2.9 cap close-note ("needs its own USER-FACING message at the cap", ~line 231), the
        `resolveSelectedTool` scan entry (~line 307), and the `BattleTile` dependency-array residual
        (~line 107) that points at "the `setPalette` item (1.8 review, Story 2.10)".
  - [x] `docs/planning-artifacts/component-tree-battle-page.md` §2 (the `<OrganismSearchAdd>` node),
        §3.3, §3.4, §6.
  - [x] The mockup: `.add-organism-container` / `.organism-search` / `.organism-dropdown`
        (`clinical-lab-theme/petri-dish-lab-mode.html:281-336`) and the markup at 683-692.

- [x] **Task 2 — `<BattlePage>`: the `sessionRoster` writer and the library derivation (AC1, AC3, AC5)**
  - [x] Give `sessionRoster` its setter and an `onAddToRoster(organismId)` handler wrapped in
        `useCallback` (it feeds a prop; a fresh identity per render is churn on a path that already
        rebuilds the palette). Append only, and **no-op on an id already present** — the union
        de-dupes, but a duplicate entry in `sessionRoster` itself is state that lies.
  - [x] Derive the **addable** library once, memoised on `[organisms, rosterIds]`: the loaded
        organisms minus every id in `rosterIds`. Where it lives is a call (forced decision 4) —
        `<BattlePage>` beside `roster`, or `<BattleEditorView>` beside `duplicateColorIds`. Record
        which and why.
  - [x] The addable list is `DisplayOrganism[]` too — one resolver, never two (Story 2.9 forced
        decision 3). `resolveDisplayOrganisms(addableIds, organisms)` gives names + chip colours for
        free and keeps a dropdown entry from ever disagreeing with the row it becomes.
  - [x] The cap fact reaches the roster as a derived boolean off `rosterIds.length`, never
        `roster.length` (AC5's trap). ❌ Do not re-declare `255` — import `MAX_ROSTER_SIZE`.

- [x] **Task 3 — `<OrganismRoster>`: search + add (AC1, AC2, AC5, AC8, AC9)**
  - [x] Widen `OrganismRosterProps` with this story's slice of spec §3.4: `library` (the addable
        list) and `onAddToRoster`, plus whatever AC5's cap and AC8's empty state need. ❌ Still no
        `onEditOrganism`, still no `onCreateOrganism` — Epic 4.
  - [x] The component gains its FIRST state: the search text (`useState`), spec §6's "roster search
        filter | ephemeral | OrganismRoster | itself". Selection stays controlled and stays in
        `<BattleEditorView>` — do not move it.
  - [x] Filtering happens HERE, over the `library` prop, inside this component. ⚠️ Never over
        `roster` (AC2), and never inside the memo that feeds `resolveSelectedTool`
        (`deferred-work.md` names exactly this as the thing that would make a 255-element scan
        per-render).
  - [x] Place the block between the roster list and the pinned eraser, matching
        `.add-organism-container`'s `border-top` + `padding-top` separation. The eraser stays LAST
        and stays outside `<RosterList>`.
  - [x] Styled primitives only, `EditorStatusBar` house style. ❌ No `@mui/material/Autocomplete`,
        `Select`, `MenuItem`, `TextField` or `List` — the whole point of Story 2.9's ~10 KB win was
        to stop spending it (forced decision 5).
  - [x] ❌ No raw hex — AR-46 is a live lint rule on `apps/web`. Every colour is an existing
        `--gol-*` token; the mockup's `.organism-dropdown` SVG arrow is a `%23ffffff` data URI and
        is a raw colour by another name (forced decision 3).

- [x] **Task 4 — Wire it through `<BattleEditorView>` (AC3, AC7)**
  - [x] Thread `library` and `onAddToRoster` from `<BattlePage>` to `<OrganismRoster>`. They must
        **not** leak into `<EditorMain>` — extend the existing `Omit<…>` list rather than letting a
        layout child receive roster props.
  - [x] Confirm what happens to the SELECTION when the first organism is added to an empty roster.
        `resolveSelectedTool` returns `roster[0]` when `chosenTool` is null and the eraser when the
        roster is empty — so on `/battle/new` an add flips the selection to the new organism only
        while the user has never chosen anything. Whether an explicit add should also SELECT is
        forced decision 1; whatever is chosen, AC7's "the user can now paint" must hold end-to-end.
  - [x] ❌ `refForTool` / `toolRef` / `onStrokeCommit` unchanged. This story appends to a roster; it
        does not touch the stroke pipeline.

- [x] **Task 5 — Settle the `setPalette` deferred entry (AC6)**
  - [x] Establish empirically what a live roster mutation does today: does `EditDish`'s
        `[size, palette, colors]` construction effect reconstruct the renderer with the new LUT (see
        Dev Notes), or does a stale LUT survive? Write the test that answers it either way.
  - [x] If reconstruction covers it: **close the entry with the evidence**, and record the residual
        honestly — a full `drawFull` repaint and a discarded dirty baseline per add, which is
        correct-but-not-free, and the fact that the cleanup nulls `strokeRef` (unreachable via UI
        today: the add control is in the sidebar, not on the canvas).
  - [x] If a stale LUT does survive: the fix is a `setPalette` on `GridRenderer`. ⚠️ That is a
        change to the RFC-002 frozen contract — the contract tests in `gridRenderer.test.ts` assert
        the public surface. Do not add scheduling or grid mutation with it, and say so in the story
        record.
  - [x] The `BattleTile` dependency-array residual (`deferred-work.md` ~line 107) is filed under
        this same entry. It is a GALLERY, theme-flip concern, not a roster one — settle it or
        **re-point it explicitly** with a written reason and a named owner. Do not let it silently
        vanish with the entry it is nested under.

- [x] **Task 6 — Tests (AC1–AC9)**
  - [x] `OrganismRoster.test.tsx`: the add control lists exactly the `library` prop; typing narrows
        it and leaves the roster list untouched (assert BOTH halves — the second is AC2's real
        claim); choosing an entry calls `onAddToRoster` with the right id; at the cap the control is
        disabled and the message is present; with an empty `library` the empty state renders and no
        live-looking control does; with `libraryUnavailable` neither renders; keyboard operation via
        `@testing-library/user-event` v14; `vitest-axe` clean.
  - [x] `BattlePage.test.tsx`: an add appends to the union and the new row renders with the
        organism's real name (AC3); the addable list excludes the battle's own organisms (AC1); no
        repository write happens on add (AC4 — assert against the fake repos' call counts, not by
        inspecting storage); the cap path (AC5) — reuse `rosterUnion.test.ts`'s approach rather than
        building 255 schema-valid `Organism` records if that proves disproportionate, and say so.
  - [x] `BattleEditorView.test.tsx`: an added organism becomes selectable and reaches the painted
        ref (extend the existing "roster selection reaches the painted ref" harness — ⚠️ the file
        already carries a `mount`/`mountEditor` near-duplicate flagged in `deferred-work.md`; do not
        add a third).
  - [x] The AC6 test (Task 5) lives wherever the evidence is cleanest — a `<PetriDishCanvas>` /
        `EditDish` unit if it is about renderer reconstruction, an e2e colour-count check if it is
        about pixels. `e2e/gallery.spec.ts`'s AR-42 distinct-colour smoke check is the precedent.
  - [x] `apps/web/e2e/battleRoute.spec.ts`: on "Three-Way Skirmish" (roster = 3, library = 4 with
        `seedConwaysClassic`) the dropdown offers exactly Conway's Classic; adding it puts a fourth
        row in the sidebar; selecting and painting produces a new colour on the dish; a reload drops
        the row (AC4). ⚠️ `createMockWorkspace()` returns **three** organisms and **no Conway** —
        `seedConwaysClassic(page)` is the existing helper that layers it on, and battle B ("Grand
        Colony War") already places all four, which makes it the free fixture for AC8's
        nothing-left-to-add state. Do **not** edit `mockWorkspace.ts`: it is asserted by
        `@gol/test-utils`' own tests and by the gallery e2e.
  - [x] Axe scans stay at zero on `/battle` and `/battle/new`, including after an add.

- [x] **Task 7 — Verification and budget (AC9)**
  - [x] `npm run ci` in full. ⚠️ Never pipe it to `tail` — the pipe reports tail's exit code and has
        already masked a real `format:check` failure once. Redirect to a file and echo `$?`.
  - [x] Record `bundle:check`'s measured gzip and headroom for `/`, `/battle` and `/battle/new`
        against Story 2.9's numbers (326.5 / 298.7 / 298.7 KB; budgets 330 / 310 / 310). If a budget
        is exceeded, **STOP and ask Sidiar**.
  - [x] Update `deferred-work.md`: settle the `setPalette` entry and the cap-message note, and
        record anything newly discovered.

- [x] **Task 8 — Story record**
  - [x] Fill the Dev Agent Record: each forced decision below with the option taken and why,
        verification commands with their real output summary, and the File List.
  - [x] `sprint-status.yaml`: `2-10-add-organisms-from-library: review` when the work is done.

### Review Findings

Code review 2026-08-27, **Opus** (the story was implemented by Sonnet — the second pair of eyes is
deliberately a different model). Three parallel adversarial layers: Blind Hunter (diff only, no
project context), Edge Case Hunter (diff + full repo access), Acceptance Auditor (diff + this story
file + `architecture.md` G.3/H.1/H.2/M6/B.2/I.4, `component-tree-battle-page.md` §2/§3.3/§3.4/§6,
`epics.md`, `deferred-work.md`, `themes.css`, the mockup). 26 raw findings → 6 patched, 9 deferred,
2 decision-needed, 9 dismissed as noise.

- [ ] [Review][Decision] **The native `<select>` adds an organism on every Arrow-key press in
      Firefox and Windows Chrome** — on a CLOSED `<select>`, those engines move the selection with
      Up/Down and fire `change` per option rather than opening a popup. `onChange` here IS the add,
      so a keyboard user browsing the list adds organisms they never chose — one per keypress, each
      also stealing the tool selection through the add-and-select wrapper. AC9 asks for the control
      to be "operable by keyboard alone"; it is operable and destructive. Not caught by the suite:
      every test uses `user.selectOptions`, which sets the value directly. Fixing it means departing
      from forced decision 2's mockup-faithful "`<select>` whose selection IS the action", so it is
      Sidiar's call — see the PR body for the options.
- [ ] [Review][Decision] **A palette change mid-stroke is reachable, and the story recorded it as
      unreachable** [`apps/web/components/PetriDishCanvas.tsx`:313-319] — the Dev Agent Record and
      `deferred-work.md` both close the `setPalette` entry with the residual "the cleanup nulls
      `strokeRef` — unreachable via the UI today because the add control lives in the sidebar, not
      on the canvas". Multi-touch defeats that: one finger holds the dish (pointer capture is on the
      canvas, `touchAction: 'none'`), a second operates the sidebar `<select>`. Nothing rejects a
      second pointer on a DIFFERENT element. The cleanup then nulls `strokeRef` DIRECTLY rather than
      going through `endStroke`, so the painted cells are discarded with no undo entry AND
      `releasePointerCapture` never runs. The two sibling paths already disagree deliberately — the
      resize effect commits (`endStroke(true)`), the grid effect discards (`endStroke(false)`) — so
      which one a palette change should follow is a policy call that Stories 2.14/2.15 inherit.
- [x] [Review][Patch] **`/battle/new`'s seeded organism was evicted from index 0 by the first add,
      silently repainting its cells** [`apps/web/components/battle/BattlePage.tsx`:244-290]
- [x] [Review][Patch] **The new input and select painted their control boundary with the decorative
      `--gol-border` (1.57:1) instead of `--gol-border-control`** [`OrganismRoster.tsx`:200,247]
- [x] [Review][Patch] **The cap message instructed the user to "Remove an organism", an affordance
      that exists nowhere in the app** [`OrganismRoster.tsx`:307]
- [x] [Review][Patch] **"Every library organism is already in this battle" was stated for an EMPTY
      workspace library, where nothing is in the battle at all** [`OrganismRoster.tsx`:316]
- [x] [Review][Patch] **The search predicate was never trimmed, on a comment whose premise is false**
      [`OrganismRoster.tsx`:330]
- [x] [Review][Patch] **AC7 had no test, though the AC says in terms that it needs one**
      [`BattlePage.test.tsx`]
- [x] [Review][Defer] `sessionRoster` is still not reset when `battleId` changes on a mounted
      `<BattlePage>` — deferred, pre-existing (already tracked from the Story 2.9 review; this
      review strengthens the reachability argument and the entry is annotated)
- [x] [Review][Defer] Focus falls to `<body>` and nothing is announced when the `<select>` is
      replaced by a message by the user's own add — deferred, new
- [x] [Review][Defer] `onAddToRoster` has no cap guard and `handleAddToRoster` selects
      unconditionally, so an add clipped by `buildRosterIds` would be swallowed — deferred, unreachable today
- [x] [Review][Defer] The AC5 cap test is over-determined — its empty library hides the combobox for
      a second, independent reason — deferred, new
- [x] [Review][Defer] Two library organisms with the same name are indistinguishable in the dropdown
      — deferred, pre-existing (`OrganismSchema.name` has no uniqueness constraint)
- [x] [Review][Defer] The search predicate does no Unicode normalisation and uses `toLowerCase`
      rather than `toLocaleLowerCase` — deferred, new
- [x] [Review][Defer] `filtered` is an unmemoised scan of the uncapped workspace library on every
      render of `<OrganismSearchAdd>` — deferred, new
- [x] [Review][Defer] The e2e AC6 paint check asserts a distinct-colour-count INCREASE, not the
      added organism's own colour — deferred, new
- [x] [Review][Defer] No test adds a colour-colliding organism THROUGH the add control and asserts
      both rows warn, which the Dev Notes called "a cheap extra assertion worth having" — deferred, new
- [x] [Review][Defer] The DISABLED Undo button fails axe's `color-contrast` at 2.9:1, so every
      route-level axe scan is green only by luck about which state that button is in — deferred,
      pre-existing (surfaced by a flake during this review's `npm run ci`; not this story's code)

**Verified sound, for the record** (not taken on the Dev Agent Record's word):

- **The `setPalette` closure (AC6) holds.** `<BattlePage>`'s `palette` memo really does depend on
  `[rosterIds, organisms]`, `EditDish`'s construction effect really does list `palette` among its
  three deps, and its cleanup really does drop the retained renderer — so an add reconstructs with
  the new LUT and `drawFull`s. The closure is sound and **no `setPalette` was needed**; RFC-002's
  frozen contract is untouched. The proof is also stronger than the Blind Hunter alleged: that layer
  called the test's "no further warning" assertion vacuous on the warn-once dedupe, but
  `warnedOutOfRangeRefs` is a `WeakMap` keyed by **LUT identity**
  (`colourStateGroups.ts`:26), and the second render supplies a NEW identity — so a still-out-of-range
  ref WOULD warn again. The assertion discriminates. The load-bearing `displayColorAt` fillStyle
  assertion is independent of it either way. What the closure did NOT survive intact is its recorded
  residual — see decision-needed #2.
- **`bundle:check` re-measured independently** and matches the Dev Agent Record exactly: `/battle`
  299.4 KB (10.6 KB headroom), `/battle/new` 299.3 KB (10.7 KB), `/` 326.5 KB (3.5 KB). No budget raised.
- **The `deferred-work.md` bookkeeping is honest**: the `BattleTile` dependency residual is genuinely
  re-pointed to Story 6.4 (which exists — `sprint-status.yaml`:158, `epics.md`:1488) with a written
  reason, and the `resolveSelectedTool` scan entry is annotated rather than closed.
- **AC9's keyboard and axe coverage exists** at both the unit and route level, as claimed.

**Dismissed as noise:** the warn-once-vacuity claim above; `library` collapsing to `[]` when
`organisms` is `null` (unreachable — `libraryUnavailable` is `status === 'error'` and the loading
branch returns before the render); the `<select>`'s `aria-label` "duplicating" its placeholder (a
placeholder is not a persistent visible label and vanishes on typing, so the label is correct
practice, not the house-rule violation it was read as); several comment-accuracy nits; the
`localStorage.length` assertion being decorative; the two test helpers re-based onto `renderEditor`'s
defaults; the page-wide `/create/i` query in the e2e.

## Dev Notes

### The `setPalette` entry is probably already closed — verify, don't assume either way

`deferred-work.md` (1.8 review) says a roster change leaves the renderer holding a stale
`RefToFillGroup`, so the new organism "silently renders as empty". That was written when nothing
mutated a roster. Read the code as it stands before acting on it:

- `<BattlePage>`'s `palette` memo depends on `[rosterIds, organisms]`, so an add mints a **new**
  `RefToFillGroup` identity.
- `EditDish`'s construction effect (`PetriDishCanvas.tsx`) lists `palette` among its three deps and
  its cleanup drops the retained renderer — so a new palette identity **reconstructs** the renderer
  with the new LUT and calls `drawFull(grid)`.

If that holds, `setPalette` is unnecessary for the edit canvas and the entry closes on evidence
rather than on a code change — which is the outcome to prefer, because adding a setter to
`GridRenderer` means touching a contract RFC-002 froze and Epic 3 builds on. ⚠️ **Do not close it on
this reasoning alone.** Prove it with a test that adds an organism and asserts the new ref paints
its own colour, and record the residual (one full repaint per add; the dirty baseline is re-primed;
`strokeRef` is nulled by the cleanup — harmless today because the add control is in the sidebar and
cannot be reached mid-stroke).

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **Does adding an organism SELECT it?** The AC says "immediately selectable", not "selected".
   Options: (a) add only — the user then clicks the new row; `resolveSelectedTool` will still land
   on it on `/battle/new` when nothing has ever been chosen, so the two cases behave differently;
   (b) add AND select, by calling `onSelectTool` alongside `onAddToRoster` — one intent, one
   outcome, consistent on both routes, and it is what a user who just went looking for an organism
   almost certainly wants; (c) add and select only when the roster was previously empty. (b) is the
   recommendation, and it is a **UX commitment Epic 4's create-from-battle (Story 4.25) will
   inherit** — say so if it is taken. Whichever is chosen, AC2's "exactly one selected row, always"
   must still hold.

2. **The add control's shape, and its accessible name.** The mockup uses a native `<select>` whose
   first `<option>` is the label ("+ ADD ORGANISM"). Options: (a) a native `<select>` — zero bundle,
   free keyboard and screen-reader behaviour, free mobile picker; the placeholder-as-label needs an
   `aria-label` or a visually-hidden `<label>` because an `<option>` is not an accessible name, and
   a `<select>` cannot show a colour chip per entry; (b) a `<button>` + custom listbox — chips are
   possible, but it means hand-rolling roving tabindex, Escape, outside-click and `aria-activedescendant`,
   which is real bundle and a real a11y surface; (c) a filtered list of `<button>` rows reusing the
   `Row` primitive already in the file — no popup contract at all, chips for free, but it makes the
   section taller as the library grows. (a) is the smallest correct move and matches the mockup;
   (c) is the most consistent with what Story 2.9 built. ⚠️ Story 2.9's lesson applies either way:
   prefer a control's **visible text** as its accessible name over an `aria-label` duplicating it —
   here there is no visible label, so one of the two must be added deliberately.

3. **The dropdown arrow.** `.organism-dropdown`'s `background-image` is a data-URI SVG containing
   `fill='%23ffffff'` — a raw hex wearing a URL escape. AR-46's lint rule may or may not tokenise
   it, but shipping it would be the same violation either way, and white is not a `--gol-*` value.
   Either use the UA's own arrow (drop `appearance: none`), or draw it with `currentColor`. Record
   which; ❌ do not add a token for this.

4. **Where the addable-library derivation lives.** Spec §3.4 types `library` as "full shared library
   minus roster", so the subtraction is the parent's. `<BattlePage>` owns `organisms` and
   `rosterIds` and already resolves `roster` there; `<BattleEditorView>` owns `duplicateColorIds`
   and spec §6 puts derivations there. Either is defensible — pick one, keep it memoised on
   `[organisms, rosterIds]`, and do not compute it in two places.

5. **Keep the bundle win.** Story 2.9 handed `/battle` ~10 KB back and did not spend it. A `<select>`
   and an `<input>` as styled primitives cost effectively nothing; an MUI `Autocomplete` would cost
   more than the whole win. Measure before and after and report both.

### Spec conflicts and additions surfaced (do not silently pick one — this is the project rule)

- **`<OrganismSearchAdd>` is a named node in the component tree (§2) but has no §3 interface of its
  own.** It is listed as a child of `<OrganismRoster>`. Whether it becomes a separate file or stays
  inline in `OrganismRoster.tsx` is a story-level call — the same call Story 2.9 made for
  `SidebarSection` (forced decision 5: build it private, export it when a second consumer arrives).
  Extracting it is defensible if the file is getting long; do not extract it "because the tree draws
  a box".
- **`OrganismSummary` still does not exist.** Spec §3.4 types `library` as `OrganismSummary[]`;
  `@gol/domain` exports no such type. Story 2.9 settled this: `DisplayOrganism` (`apps/web/lib/
  displayOrganisms.ts`) IS that shape and stays in `apps/web`. Reuse it. ❌ Do not add a type to
  `packages/domain` for a UI concern.
- **"Dropdown" language — already settled, do not re-open.** Spec §9 item 8: follow the mockup
  structure, cite FR-3.3 semantics. This story is where the mockup's literal dropdown finally does
  appear, which is a nice symmetry and not a re-opening of anything.
- **The mockup has no cap state and no empty state.** AC5 and AC8 are Decision G.3 and NFR-4.1
  respectively, not mockup features. Building a subset of the mockup plus two states it does not
  draw is expected, not a divergence.

### Silent-failure traps — the intuitive implementation is wrong

1. **⚠️ APPEND-ONLY, still.** `cell = roster index + 1` (RFC-006 Decision 2). An add that inserts,
   sorts, or rebuilds the union in a different order silently repaints every placed cell as a
   different organism **and** reinterprets all 30 undo snapshots — no throw, no warning, a fully
   green suite. `buildRosterIds` already guarantees this; keep the new id going through it.
2. **⚠️ The cap is `rosterIds.length`, not `roster.length`.** `resolveDisplayOrganisms` de-duplicates,
   so the display list can be shorter than the identity array. Deriving "roster is full" from the
   display list under-counts and lets a 256th ref be spent, which is the throw AC5 exists to prevent.
3. **⚠️ Do not filter inside the memo that feeds `resolveSelectedTool`.** `deferred-work.md` names
   this precisely: "the same scan would become per-render if a later story makes the roster identity
   churn (e.g. filtering it for Story 2.10's search box in the same memo)". The search filter is
   `<OrganismRoster>`-local state over the `library` prop; it must not touch `roster`'s identity.
4. **⚠️ `sessionRoster` must not churn identity.** It feeds the `rosterIds` memo, which feeds
   `palette`, which is one of `EditDish`'s three construction dependencies — a fresh array per
   render tears down the retained renderer on every render. Use the functional setter form and
   return the SAME array when the id is already present, rather than a new equal one.
5. **⚠️ A repository must never be imported here.** AR-2/27. `<BattlePage>` receives
   `AppRepositories` as a prop; nothing this story adds may call `createRepositories()` or import a
   concrete repository, and (AC4) nothing may WRITE through one either.
6. **⚠️ `useAsyncResource` deps keep a FIXED LENGTH and stable elements.** This story adds no
   resource, but if it is tempted to, read that hook's header first — growing `[a]` into `[a, b]`
   spins the page forever with only a dev-mode console error.
7. **⚠️ `libraryUnavailable` and "library empty" are different facts.** Story 2.9's review turned on
   exactly this distinction and Sidiar chose the honest-empty-list answer. AC8 must not reuse the
   degraded-load copy for a library that simply has nothing left to offer, and must not claim a
   failure that did not happen.
8. **⚠️ The dropdown's options must be derived from `rosterIds`, not from `draft.organismIds`.** The
   session additions are the whole point — subtracting only the battle's placed set would keep
   offering an organism the user just added.
9. **⚠️ Playwright's `getByRole` name option is a SUBSTRING match by default; RTL's is a full-string
   match.** Story 2.9 lost a CI run to this ("Erase" matched "Eraser"). With rows and options
   sharing organism names, use `exact: true` in Playwright and expect the two libraries to disagree.
10. **⚠️ The sidebar section gets taller.** It already competes with the dish for width (trap 11 of
    Story 2.9); `SidebarContent` scrolls, so height is handled — but the section must not push the
    pinned eraser out of reach, and the eraser is the ONLY tool available in the degraded and
    empty-roster states.

### Previous story intelligence

**From Story 2.9 (Organism Roster & Tool Selection) — the immediately relevant carry-over:**

- `<OrganismRoster>` exists, is stateless, and is CONTROLLED. This story gives it its first state
  (the search text) and its first callback that is not a selection. Do not let `selectedTool` follow.
- `resolveSelectedTool` in `<BattleEditorView>` derives the effective tool: the user's explicit
  choice while valid, else the first roster row, else the eraser. It is a **derivation, not an
  effect**, deliberately — a `useState` seeded from the first roster would keep pointing at an
  organism a different battle has never heard of. Adding to the roster must not reintroduce a
  synchronising effect.
- The `DEFAULT_TOOL` seed in `<BattlePage>`'s `rosterIds` memo is conditional on the union being
  empty AND Conway's Classic being present in the loaded library (Sidiar's option (a), 2026-08-27).
  Three tests in `BattlePage.test.tsx` pin it. This story must not loosen that condition to make
  `/battle/new` paintable — AC7's answer is the add control, which is the answer Sidiar's decision
  explicitly deferred to this story.
- `findDuplicateColorIds` excludes `unresolved` entries (Sidiar's option (b), same date). A
  newly-added organism resolves fine, so AC3's new row participates in the FR-3.3 same-colour
  warning normally — **and a colliding add should mark BOTH rows**, which is a cheap extra assertion
  worth having since Story 2.9 could only prove it at the unit level.
- House style established and to be followed: styled primitives over MUI components, real `disabled`
  attributes, `2px solid var(--gol-accent)` focus-visible rings, enumerated transitions, a
  `prefers-reduced-motion` escape, no `aria-label` that duplicates visible text, no raw hex.
- The convention that comments cite the story and the failure they prevent is load-bearing here:
  `<BattlePage>`'s `sessionRoster` comment currently says "Story 2.10's add-from-library dropdown is
  its first writer". **Update it to describe what it now does** rather than leaving it predicting
  this story.

### Git intelligence (last 5 commits)

`0f346d0` (merge, PR #10) ← `394eb27` docs: record Sidiar's decisions and mark story 2.9 done ·
`f16ee5d` fix: exclude dangling ids from the same-colour warning · `54a1607` fix: seed the default
tool only when the library actually has it · `c6655f4` docs: run stats · `949b4c5` fix: apply story
2-9 code review findings · `705f310` feat: Organism roster & tool selection (story 2.9).

Shape of a story branch (2.6–2.9): one `feat:` commit carrying code + tests + the story file +
`deferred-work.md` + `sprint-status.yaml`, then `fix: apply … code review findings`, then docs
commits, then a merge PR. Story subagents may commit and push to their own `story/*` branch without
asking; **merging is always Sidiar's call**, and `main` is never touched directly.

### Latest technical information

- **MUI v9.3.1 + Emotion** (not the architecture's v6 — project-context). Per-component imports only
  (AR-35). `styled` from `@mui/material/styles` is the only MUI import this story should need; net
  component-import movement should be **zero**.
- **React 19.2.7 / Next 16.2.10, static export.** `'use client'` on every interactive component.
  No server anything, no API route, no dynamic segment.
- **`vitest-axe`'s `axe(container)`** is the unit-level scan; `@axe-core/playwright`'s `AxeBuilder`
  is the route-level one. Both already run in CI.
- **`@testing-library/user-event` v14** — `userEvent.setup()`, `await user.type(...)`,
  `await user.selectOptions(...)`, `await user.tab()`. ❌ Do not hand-roll `fireEvent.change` for a
  typing or selection assertion.
- **`npm run ci`** = typecheck → lint → format:check → **spec:check** → coverage → build → bundle →
  e2e. `spec:check` tokenises `ARn`, `RFC-00n`, `FRx.y`/`NFRx.y`, `M1`–`M10`, `Decision A–Z(.n)` and
  `Story N.M` out of `packages/` + `apps/` and fails on any that resolve to nothing under
  `docs/planning-artifacts` or `docs/project-context.md`. Write IDs exactly as the specs spell them
  (`FR-7.15`, `Decision H.2`, `Decision G.3`, `M6`, `AR-46`); a hyphenated `M-6` matches nothing and
  is silently exempt forever. ⚠️ Story files are NOT an authority source — a citation only in a
  story file does not make a code citation resolve.
- **A local green `npm run ci` is not proof CI is green** — check `gh run list` after pushing.

### What NOT to build (scope boundaries)

- ❌ **No "+ CREATE NEW ORGANISM" button and no per-row ✎ pencil** — Epic 4 (Stories 4.24/4.25).
  Their absence was Story 2.9's AC5 and remains true.
- ❌ **No row removal / "remove from battle"** — no FR, no mockup control. Decision H.1 removes an
  organism by erasing its last cell and saving (Story 2.13).
- ❌ **No save, no persistence, no schema change.** AC4 is that nothing is written.
- ❌ **No dirty tracking** (Story 2.11). An add is not currently a commit and does not touch the undo
  ring — ⚠️ and it deliberately should NOT: `useUndoableGrid`'s snapshots are (occupant +
  dimensions), and a roster addition changes neither. If undoing an add ever becomes a requirement,
  it is a new story, not a quiet widening of the ring here.
- ❌ **No other sidebar section and no sidebar footer** — Battle Name (2.11), Grid Info (2.14),
  Tools/Clear (2.15), Back (2.16).
- ❌ **No changes to the stroke pipeline or `useUndoableGrid`.** The only renderer-adjacent question
  is AC6's, and its preferred answer changes no renderer code at all.
- ❌ **No bundle-budget raise without Sidiar's approval.**

### Project Structure Notes

- Modified: `apps/web/components/battle/OrganismRoster.tsx` (+ test),
  `apps/web/components/battle/BattleEditorView.tsx` (+ test),
  `apps/web/components/battle/BattlePage.tsx` (+ test), `apps/web/e2e/battleRoute.spec.ts`,
  `docs/implementation-artifacts/deferred-work.md`,
  `docs/implementation-artifacts/sprint-status.yaml`.
- Possibly new: an `OrganismSearchAdd.tsx` (+ test) if forced decision 2/§2's node justifies the
  extraction; `apps/web/lib/canvas/gridRenderer.ts` **only** if AC6's investigation proves a
  `setPalette` is genuinely required.
- Naming: components PascalCase `.tsx`; non-component TS files camelCase, **never dotted**.
- `apps/web` holds UI and wiring only — no simulation, persistence or rules logic. No DOM types leak
  into `packages/*`.
- Repositories stay **injected** (AR-2/27): `<BattlePage>` receives `AppRepositories` as a prop.
- Coverage: `apps/web` has **no coverage gate** (deliberate counter-metric). Write the tests that
  prove the ACs, not tests that raise a number.

### References

- [Source: docs/planning-artifacts/epics.md#Story 2.10: Add Organisms from Library] — the ACs.
- [Source: docs/planning-artifacts/epics.md#Story 2.9: Organism Roster & Tool Selection] — the
  boundary on the other side (the section this story extends).
- [Source: docs/planning-artifacts/epics.md#Story 2.13: Save Battle] — where H.1's prune and AC4's
  end-to-end proof actually land.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.4] — `<OrganismRoster>`'s full
  interface (`library`, `onAddToRoster`), the search filter as local state, "filters the add
  dropdown only".
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3] — `<BattleEditorView>`:
  `roster` / `library` / `onAddToRoster` props, private layout children.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#2] — the `<OrganismSearchAdd>` node.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#6] — `sessionRoster` owned by
  `<BattlePage>`; roster search filter owned by `<OrganismRoster>` and read by itself.
- [Source: docs/planning-artifacts/architecture.md#Decision H] — H.1 placed-set invariant, H.2
  session roster (never persisted, gone on close/reload).
- [Source: docs/planning-artifacts/architecture.md#G.3] — the 255 cap, "the Battle roster UI blocks
  adding a 256th (with a message) instead of overflowing".
- [Source: docs/planning-artifacts/architecture.md#M6] — uncapped workspace library vs the
  255-per-battle roster; the two non-blocking same-colour warnings.
- [Source: docs/planning-artifacts/architecture.md#B.2] — colour-state batching, why the LUT is
  palette-bounded (the context for AC6).
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-7.15] — the shared,
  workspace-level organism library the add list is drawn from.
- [Source: docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md] — the frozen
  `GridRenderer` contract AC6 must not casually widen.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html]
  — `.add-organism-container` 281-289, `.organism-search` 290-311, `.organism-dropdown` 312-336,
  markup 683-692.
- [Source: docs/implementation-artifacts/deferred-work.md] — the `setPalette` entry (Story 2.10),
  the Story 2.9 cap close-note, the `resolveSelectedTool` scan entry, the `BattleTile` dependency
  residual.
- [Source: docs/implementation-artifacts/2-9-organism-roster-tool-selection.md] — the roster
  component, the four forced decisions, Sidiar's two review decisions, the bundle numbers.
- [Source: docs/project-context.md] — AR-46 no-raw-hex, AR-35 per-component MUI imports, AR-2/27
  repository injection, the pipe-swallowed-exit-code and local-CI-is-not-CI warnings.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npm run ci` (full gate: typecheck → lint → format:check → spec:check → test:coverage →
  build:standalone → bundle:check → e2e) — exit 0. Log redirected to a file, not piped, per the
  project's pipe-swallowed-exit-code warning.
- `npx vitest run` on each touched test file individually during development, plus
  `npm run test` (all 5 packages, 660 tests) and the full `e2e` run (192 Playwright tests across
  chromium/firefox/webkit/tablet) as part of `npm run ci`.

### Completion Notes List

**The `setPalette` deferred entry (AC6, Task 5) — CLOSED on evidence, no code change.**
Read `<BattlePage>`'s `palette` memo (`[rosterIds, organisms]` deps) and `EditDish`'s construction
effect (`[size, palette, colors]` deps, `PetriDishCanvas.tsx`) before touching anything: an add
mints a new `RefToFillGroup` identity, which the construction effect's dependency array picks up,
tearing down and reconstructing the retained renderer with the new LUT and calling `drawFull`.
Proved with a new `PetriDishCanvas.test.tsx` unit test that paints a ref out of range under the
FIRST palette identity (warns once, Decision I.4), rerenders with a second identity that brings it
in range, and asserts a SECOND `drawFull` call plus the cell's own `displayColorAt` fillStyle with
no further warning — and with a new e2e test (`battleRoute.spec.ts`) that adds Conway's Classic to
a real battle and asserts a new colour actually lands on the dish. `GridRenderer`'s RFC-002 frozen
contract is untouched; no `setPalette` was added. Residual recorded in `deferred-work.md`: one full
`drawFull` repaint per add (the dirty baseline is re-primed, not incrementally updated), and the
construction effect's cleanup nulls `strokeRef` — unreachable via the UI today because the add
control lives in the sidebar, not on the canvas.

⚠️ **Amended by the code review (2026-08-27).** The closure itself was independently re-verified and
stands — the mechanism, the tests and the untouched RFC-002 contract are all as described above. The
SECOND residual's "unreachable via the UI today" is wrong, and was corrected in `deferred-work.md`:
multi-touch reaches it (one finger holding the dish, a second operating the sidebar `<select>` —
`handlePointerDown`'s second-pointer reject only guards the canvas element), and the cleanup nulls
`strokeRef` **directly** rather than through `endStroke`, so the in-progress cells are discarded with
no undo entry and `releasePointerCapture` never runs. Commit-vs-discard for a palette change is a
policy Stories 2.14/2.15 inherit, so it went to Sidiar as a decision-needed finding rather than being
patched here.

**Forced decision 1 (add-and-select) — option (b) taken.** Selecting an entry both adds it to
`sessionRoster` AND selects it (`<BattleEditorView>`'s `handleAddToRoster` wraps `<BattlePage>`'s
`onAddToRoster` with `setChosenTool`). `<BattlePage>`'s write and `<BattleEditorView>`'s selection
update fire inside the same event handler, so React batches them into one commit — the new row
renders selected on the very first paint, never a flash of the prior selection. This is a UX
commitment Epic 4's create-from-battle (Story 4.25) inherits, recorded at the call site.

**Forced decision 2 (add control shape) — option (a) taken, a native `<select>`.** Zero bundle,
free keyboard/screen-reader behaviour, free mobile picker. Its accessible name is an `aria-label`
("Add organism to roster") — an `<option>`'s text is never exposed as its parent `<select>`'s
accessible name, so the mockup's placeholder-as-label needed one of the two Story 2.9 named
(`aria-label` or a visually-hidden `<label>`); `aria-label` was chosen since there is no visible
text for it to duplicate. The search input gets the same treatment (`aria-label="Search
organisms"`, alongside its own placeholder text).

**Forced decision 3 (dropdown arrow) — option (a) taken, the UA's own arrow.** The mockup's arrow
is a `background-image` data-URI SVG with `fill='%23ffffff'` — AR-46 territory regardless of
whether the lint rule tokenises a URL-escaped hex. `currentColor` inside an SVG loaded as a CSS
`background-image` does not resolve against the host element's colour (needs an inline SVG or a
`mask-image`, neither justified for one arrow), so `appearance: none` and the custom
`background-image` are both simply absent — the browser's own native arrow renders instead. No new
`--gol-*` token was added for this.

**Forced decision 4 (addable-library derivation) — `<BattlePage>` chosen**, beside `roster`, both
memoised on `[organisms, rosterIds]`. `<BattlePage>` already owns `organisms` and already resolves
`roster` through `resolveDisplayOrganisms` there; computing `library` the same way keeps the raw
`Organism[]` from ever needing to reach `<BattleEditorView>` as a new prop.

**Forced decision 5 (bundle) — confirmed.** `bundle:check`: `/battle` 299.4 KB gzip (was 298.7 KB,
+0.7 KB; budget 310, headroom 10.6 KB, down from 11.3), `/battle/new` 299.3 KB gzip (was 298.7 KB,
+0.6 KB; budget 310, headroom 10.7 KB), `/` unchanged at 326.5 KB gzip (budget 330, headroom 3.5
KB). No budget exceeded; nothing escalated to Sidiar.

**AC2 search predicate — recorded.** Case-insensitive substring on the organism NAME, never
trimmed (a search of all spaces matches everything, same as an empty search).

**AC8's two "nothing to add" states — distinct copy, as required.** An empty `library` (workspace
subset of roster) renders "Every library organism is already in this battle."; a non-empty library
whose search matches nothing renders "No organisms match "<query>"." and keeps the search input
rendered so the user can see/clear what they typed. AC5's cap message ("Roster is full — 255
organisms is the limit…") takes priority over both — checked first, since a full roster is true
regardless of what the broader library holds.

⚠️ **AC7 was claimed satisfied without a test, and the code review added one.** The
`<BattleEditorView>` describe block titled "(AC3, AC7, forced decision 1)" renders the bare component
with a hand-fed roster and a manual `rerender`; it never exercises `/battle/new`, a Conway-less
library, or a paint, so it proved nothing about AC7 — which says in terms that "it needs a test that
says so". The review's `BattlePage.test.tsx` addition is that test. The review also found that the
one `/battle/new` path that WAS exercised by hand was the broken one — see the trap-1 finding.

**AC5's cap test** reuses `rosterUnion.test.ts`'s approach rather than 255 schema-valid `Organism`
library records: `BattlePage.test.tsx`'s cap test builds a real `Battle` with 255 distinct
synthetic organism ids, each placed on one grid cell (satisfying `BattleSchema`'s Decision H.1
refinement), and an empty organism library — proving the `atCap` arithmetic wiring end to end
without needing the palette-resolution machinery 255 real library records would exercise for no
extra assurance.

**`deferred-work.md` updated:** the `setPalette` entry closed with evidence (no code change); the
Story 2.9 cap close-note resolved (AC5's message now ships); the `BattleTile` dependency-array
residual re-pointed to **Story 6.4** (its pointer, "the `setPalette` item, Story 2.10", no longer
resolves to anything open — this is the same underlying fact as the already-Story-6.4-owned
"thumbnail never repaints on theme switch" entry); the `resolveSelectedTool` scan entry annotated
to confirm this story's search filter did NOT enter that memo (stays open per its own criteria).

**No new dependencies, no scope creep.** ❌ No `onEditOrganism`/`onCreateOrganism` (Epic 4). ❌ No
row removal. ❌ No save/persistence/schema change (AC4 — pinned by repository-spy tests asserting
zero calls, plus an e2e reload that shows the added row gone). ❌ No dirty tracking, no undo-ring
change. ❌ No renderer contract change (AC6's preferred answer).

### File List

- `apps/web/components/battle/BattlePage.tsx` — `sessionRoster` writer (`onAddToRoster`), the
  `library` (addable) and `atCap` derivations, wired into `<BattleEditorView>`.
- `apps/web/components/battle/BattlePage.test.tsx` — new describe block: add offers library minus
  roster (AC1/AC3), no repository write (AC4), add-and-select (forced decision 1), the 255-cap
  message (AC5).
- `apps/web/components/battle/BattleEditorView.tsx` — `library`/`onAddToRoster`/`atCap` threaded
  through, the `Omit<>` boundary extended, the add-and-select wrapper (forced decision 1).
- `apps/web/components/battle/BattleEditorView.test.tsx` — `renderEditor`/`mountEditor`/`mount`
  helpers extended with the three new props; new describe block for wiring + add-and-select.
- `apps/web/components/battle/OrganismRoster.tsx` — the search input, the native `<select>` add
  control, and the private `<OrganismSearchAdd>` component (four states: cap / empty / no-search-
  match / normal), placed between the roster list and the pinned eraser.
- `apps/web/components/battle/OrganismRoster.test.tsx` — new describe block for the add control
  (AC1/AC2/AC3/AC5/AC8), keyboard tab-order and axe coverage extended.
- `apps/web/components/PetriDishCanvas.test.tsx` — the AC6 `setPalette`-closing test.
- `apps/web/e2e/battleRoute.spec.ts` — the existing roster-listing test's textbox/combobox
  assertions updated (this story's own controls now render); three new tests: the full
  add/select/paint/reload chain (AC1/AC3/AC4/AC6), AC8's nothing-left-to-add state on "Grand Colony
  War", and a post-add axe scan.
- `docs/implementation-artifacts/deferred-work.md` — the `setPalette` entry closed; the Story 2.9
  cap close-note resolved; the `BattleTile` dependency-array residual re-pointed to Story 6.4; the
  `resolveSelectedTool` scan entry annotated.
- `docs/implementation-artifacts/2-10-add-organisms-from-library.md` — this file.
- `docs/implementation-artifacts/sprint-status.yaml` — story status.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-27 | 0.1 | Story context created | create-story |
| 2026-08-27 | 1.0 | Implemented: add-from-library search + dropdown, sessionRoster writer, addable-library and cap derivations, add-and-select wiring; `setPalette` deferred entry closed on evidence; full `npm run ci` green | dev-story |

Dev Model: sonnet   # follows the chassis, roster component, resolver and selection contract Story 2.9 already established — this adds two controls and one state cell into an existing section, and its one open architectural question (the deferred `setPalette` entry) is pre-analysed here down to a verify-and-close

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 27s | 24 | 2,275 | 12,603 | 480,054 | 494,956 |
| Step 1 — create-story | opus-5 | 1 | 7m 17s | 166 | 7,181 | 469,200 | 8,300,780 | 8,777,327 |
| Step 2 — dev-story | sonnet-5 | 1 | 23m 40s | 590 | 31,486 | 722,072 | 77,199,796 | 77,953,944 |
| Step 3 — code review + PR | opus-5 | 4 | 33m 15s | 1,448 | 99,609 | 1,016,350 | 135,033,009 | 136,150,416 |
| _of which the orchestrator_ | opus-5 | — | — | 52 | 8,139 | 29,743 | 1,150,577 | 1,188,511 |
| **Total (create-story → PR ready)** | | 6 | **1h 04m** | 2,228 | 140,551 | 2,220,225 | 221,013,639 | **223,376,643** |

Run started 2026-08-27 16:10 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
