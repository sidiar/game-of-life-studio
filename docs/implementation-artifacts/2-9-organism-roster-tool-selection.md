---
baseline_commit: ffa50fc2d76eb7947aa8ceab4961d7de0d021dcb
---

# Story 2.9: Organism Roster & Tool Selection

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a sidebar listing my battle's organisms with the eraser,
so that I can pick what I'm painting with at a glance.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.9: Organism Roster & Tool Selection`, decomposed into the ten
things a reviewer can independently check. AC6–AC10 are the `deferred-work.md` entries that name
Story 2.9 as owner — they are not extra scope, they are this story's inherited debt coming due.

1. **AC1 — The "Organisms" sidebar section exists and lists the roster.** `<BattleEditorView>`
   grows an `<EditorSidebar>` (the mockup's 320px left column) whose FIRST section is titled
   "Organisms" and renders one row per roster member: a colour chip + the organism's name, in
   **roster order** (spec §3.4: "render order = list order"). The Eraser is a row **pinned at the
   bottom**, visually separated from the list, not an entry inside it (FR-3.3, FR-3.6, UX-DR20;
   spec §3.4).

2. **AC2 — Clicking a row (or the eraser) selects that tool, with a visible selected state.**
   Selection is **controlled** — `selectedTool` stays owned by `<BattleEditorView>` (spec §3.3,
   §6), the roster receives `selectedTool` + `onSelectTool` and holds no selection state of its
   own. Exactly one row is in the selected state at any time, the eraser included. A selected
   organism row makes the dish paint that organism; the eraser row makes it erase — both through
   the existing `refForTool` → `toolRef` path, unchanged.

3. **AC3 — Story 2.7's provisional toggle is DELETED in the same commit.** `<EditorMain>`'s
   `ToggleButtonGroup` / `ToggleButton` block, its `ToolbarRow`, its `handleToolKindChange`, the
   two `@mui/material` imports and every test that queries "Draw"/"Erase" go away. Story 2.7's own
   comment promised exactly this ("Story 2.9's `<OrganismRoster>` replaces this whole block … in
   one commit"). ❌ Not both: a battle route that ships two tool pickers is the dead-affordance
   state NFR-4.1 forbids, in its worst form (two controls for one state).

4. **AC4 — Two roster organisms sharing a `colorToken` both carry a non-blocking warning.**
   Detection is on the **`colorToken` string**, not on a resolved hex and not on the name. **Both**
   rows of a colliding pair are marked (not just the second), the marking is purely informational
   — the rows stay selectable, nothing is disabled, no dialog appears (M6: "two **non-blocking**
   warnings"; FR-3.3). `duplicateColorIds` is derived in `<BattleEditorView>` from the roster
   (spec §6), memoised on roster identity, and passed down.

5. **AC5 — No pencil, no add box, no create button; keyboard-operable; axe-clean.** The per-row ✎
   is **not rendered** (Epic 4 — see Story 4.24's AC, which is where it first appears). The
   mockup's search input, "+ ADD ORGANISM" dropdown and "+ CREATE NEW ORGANISM" button are **not
   rendered** either — the add path is Story 2.10, create is Epic 4. Every row (organism and
   eraser) is reachable and operable by keyboard alone, the selected state is exposed to assistive
   tech, and a `vitest-axe` scan of the rendered sidebar reports zero violations; the `/battle`
   and `/battle/new` Playwright axe scans stay at zero.

6. **AC6 — A corrupt organism library no longer blanks a perfectly good battle.**
   (`deferred-work.md`, "`Promise.all` collapses a corrupt ORGANISM record…", owned by 2.9.)
   `battles.load(id)` and `organisms.list()` settle **independently**. A rejected `organisms.list()`
   must not render "Something Went Wrong" for a battle that loaded fine — the battle renders, and
   the roster section says so (AC7). The reverse still holds: a failed battle load still renders
   the existing distinct failure body.

7. **AC7 — A failed roster load is stated, not silently rendered as an empty roster.**
   (`deferred-work.md`, "/battle/new renders a fully successful page while the resource is in the
   `error` state", owned by 2.9.) When `organisms.list()` has failed, the Organisms section renders
   an explicit degraded message — the user is told the library could not be read and that placement
   is unavailable — instead of an empty list on a page reporting no problem. Copy is this story's
   call; the requirement is that the failure is **visible and specific**.

8. **AC8 — The 255-organism cap can no longer crash the editor from the session seed.**
   (`deferred-work.md`, "Appending the session organism to `rosterIds` has no cap check…", owned by
   2.9.) `buildRefToFillGroup` **throws** above 255 entries, inside a `useMemo` during render — an
   uncaught teardown of the whole editor. The union in `<BattlePage>` must not be able to produce a
   256th entry (Decision G.3). Guard it, and unit-test the guard against a 255-entry roster.

9. **AC9 — The roster stays append-only, and a test says so.** (`deferred-work.md`, "The undo ring
   is the second thing a roster REORDER would silently corrupt", owned by 2.9.) A snapshot's
   occupant values are dense refs (`cell = roster index + 1`), so re-ordering `rosterIds` silently
   repaints every placed cell AND corrupts every undo entry, with no error anywhere. This story
   adds a test asserting a roster change never reorders or removes existing entries. ❌ The fix is
   **not** storing organism ids in snapshots (Decision E is explicit that refs are runtime-only).

10. **AC10 — The bundle budget is re-measured, and the two remaining 2.9 debts are settled.**
    Deleting the MUI toggle should hand roughly 10 KB gzip back to `/battle` and `/battle/new`
    (`deferred-work.md`); the roster must not immediately spend it (forced decision 6). Report the
    measured headroom for all three routes. Also settled here: the duplicated-`aria-label` entry
    (closed by deleting the toggle) and the "stale stroke plus `toolRef === null` is unreclaimable"
    entry (trap 3 — closed with a fix, or re-deferred with a written reason and an owner).

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (all ACs)**
  - [x] `apps/web/components/battle/BattleEditorView.tsx` in full — `EditorMain`, the provisional
        toggle block and its comment, the `selectedTool` state, the `toolRef` memo, and the doc
        comment explaining why §3.3's "instantiates no hooks" does not forbid `selectedTool`.
  - [x] `apps/web/components/battle/BattlePage.tsx` in full — the two `useAsyncResource` calls,
        the `sessionRoster` lazy seed, the `rosterSettled` gate, the `rosterIds` union memo and the
        `palette` memo. Every one of AC6–AC9 lands in that ~40-line stretch.
  - [x] `apps/web/components/battle/EditorStatusBar.tsx` — the styled-primitive house style this
        story copies (no MUI, real `disabled`, `--gol-*` tokens only, focus-visible ring).
  - [x] `apps/web/lib/tool.ts` — `Tool`, `DEFAULT_TOOL`, `ERASER_TOOL`, `refForTool`.
  - [x] `apps/web/lib/tileOrganisms.ts` — the id×organism → `{id, name, color}` resolver that
        already exists, with its unknown-id and empty-name fallbacks.
  - [x] `apps/web/components/PetriDishCanvas.tsx` `handlePointerDown` — the `toolRef === null`
        guard and the stale-stroke reclaim immediately below it (trap 3).
  - [x] `docs/implementation-artifacts/deferred-work.md` — the **seven** entries naming Story 2.9,
        plus the "before Story 2.9 starts" bundle-headroom entry.
  - [x] `docs/planning-artifacts/component-tree-battle-page.md` §3.3, §3.4, §6, §9.8.
  - [x] `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html`
        — `.sidebar` / `.sidebar-content` / `.sidebar-section` (lines 98–160), `.used-organisms-list`
        / `.organism-item` / `.organism-color` / `.organism-name` (192–236), `.organism-eraser` /
        `.eraser-icon` / `.eraser-name` (338–380), and the markup at 658–701.

- [x] **Task 2 — The Lab sidebar chassis (AC1)**
  - [x] `<BattleEditorView>` becomes a **flex row**: `<EditorSidebar>` (320px, `--gol-bg-secondary`,
        right border) then the existing `<EditorMain>` column. Both stay **private layout children
        declared in `BattleEditorView.tsx`** (spec §3.3: "`<EditorSidebar>` / `<EditorMain>` are
        private layout children, not shared") — same file, exactly as `EditorMain` lives today.
  - [x] Reproduce the mockup's PICTURE, not its CSS: the mockup's `.sidebar { margin-top: 64px }`
        offsets a `position: fixed` header this app deliberately keeps in flow (the call
        `BattleHeader.tsx`, `GridContainer` and `EditorStatusBar.tsx` have each already made).
        `<BattlePage>`'s `Root` is a flex COLUMN — the sidebar+main row is a new flex row inside it.
  - [x] A reusable section frame (`.sidebar-section` + `.sidebar-section-title`) — 2.11, 2.14 and
        2.15 each mount a section into this same shell. Keep it module-private for now (forced
        decision 5).
  - [x] ❌ No sidebar **footer** and no Back button — Story 2.16. ❌ No Battle Name, Grid Info or
        Tools sections — 2.11 / 2.14 / 2.15. The sidebar ships with exactly one real section.
  - [x] Watch the dish: a 320px column takes width from `<GridContainer>`. `deferred-work.md`'s
        centred-flex overflow entry (owned by Story 2.12) explicitly names this story as making it
        worse. Do not fix it here; do not add a fixed `min-width` that makes it worse than necessary.

- [x] **Task 3 — `<OrganismRoster>` (AC1, AC2, AC4, AC5)**
  - [x] New file `apps/web/components/battle/OrganismRoster.tsx` — PascalCase component file beside
        `EditorStatusBar.tsx` (project-context naming; `components/battle/` is where the
        battle-specific composites live).
  - [x] Props are **this story's slice** of spec §3.4, following the precedent
        `BattleEditorView.tsx` and `EditorStatusBar.tsx` already set (declare what you can wire and
        verify, nothing more): `roster`, `selectedTool`, `onSelectTool`, `duplicateColorIds`.
        ❌ No `library`, no `onAddToRoster` (2.10). ❌ No `onEditOrganism`, no `onCreateOrganism`
        (Epic 4).
  - [x] Rows: colour chip + name. Chip colour comes from the SHARED resolver (Task 4) — never a
        second `displayColor(...)` call site with its own fallbacks.
  - [x] Eraser row pinned at the bottom, outside the list container, matching `.organism-eraser`'s
        `border-top` + `margin-top` separation. Its icon is the mockup's `✕`.
  - [x] Styled primitives only (`styled('div')` / `styled('button')`), the `EditorStatusBar` house
        style. ❌ No `@mui/material/List`, `ListItemButton`, `ToggleButton` or `Chip` — see forced
        decision 6 (bundle).
  - [x] ❌ No raw hex anywhere — AR-46 is a live lint rule on `apps/web`. The mockup's eraser
        `#ff6600` is a raw hex with no matching token; see forced decision 1.
  - [x] React key = organism id. The resolver already de-duplicates ids for exactly this reason.

- [x] **Task 4 — Roster display data and the same-colour derivation (AC1, AC4)**
  - [x] `<BattlePage>` must now pass the organism RECORDS down — `<BattleEditorView>` currently
        receives `rosterIds: readonly string[]` only, which carries no name and no colour.
        Resolve `rosterIds × organisms` once and pass the result; keep `rosterIds` wherever
        `refForTool` still needs the index (or derive the ids from the resolved list — but see
        trap 2: it must remain the SAME order).
  - [x] Reuse `resolveTileOrganisms` rather than writing a second resolver (forced decision 3). It
        already handles the unknown-id fallback (Story 5.11's territory), the empty-name fallback
        (an `aria-label`-less control is an axe failure) and the duplicate-id de-dupe.
  - [x] `duplicateColorIds` is derived in `<BattleEditorView>` (spec §6), memoised, from
        **`colorToken`** (trap 4) — which means the derivation needs the `Organism` records or a
        resolver output widened to carry the token. Pick one and say which.
  - [x] Initial selection: spec §3.3 leaves it to the story ("suggest: first roster row; eraser
        when the roster is empty"). Whatever is chosen must keep `/battle/new` paintable — see
        forced decision 4, which is the load-bearing one in this task.

- [x] **Task 5 — Wire selection and delete the provisional toggle (AC2, AC3)**
  - [x] `<EditorSidebar>` renders `<OrganismRoster>` with `<BattleEditorView>`'s existing
        `selectedTool` / `setSelectedTool`. The state cell does not move — only its UI does.
  - [x] Delete the toggle block, `ToolbarRow`, `handleToolKindChange`, and the `ToggleButton` /
        `ToggleButtonGroup` imports. Delete or rewrite the four `BattleEditorView.test.tsx` tests
        that query "Draw"/"Erase" and the one asserting "renders no sidebar or textbox" (it is now
        false by design).
  - [x] Confirm `refForTool` / `toolRef` / `onStrokeCommit` are UNCHANGED. This story swaps a
        picker; it does not touch the stroke pipeline.

- [x] **Task 6 — `<BattlePage>`: independent resources, roster failure, cap guard (AC6, AC7, AC8, AC9)**
  - [x] Split `battles.load(id)` and `organisms.list()` into two `useAsyncResource` calls — the
        structure `settingsResource` already demonstrates in this same file ("a fully separate
        resource makes the two failures structurally independent"). ⚠️ `useAsyncResource`'s deps
        array must keep a FIXED LENGTH and referentially stable elements; read its header before
        changing any call site.
  - [x] Re-derive the loading gate and the `rosterSettled` gate against the correct resource
        (trap 6) — the seed gate exists to stop `buildRefToFillGroup`'s warn-once firing about an
        empty library, which is now the ORGANISM resource's condition, not the battle's.
  - [x] Render the degraded roster state (AC7) — a failed organism load must reach
        `<OrganismRoster>` as a fact it can show, not as an empty array.
  - [x] Cap the union at 255 before it reaches `buildRefToFillGroup` (AC8).
  - [x] Add the append-only test (AC9). Assert that after a roster change, every pre-existing entry
        keeps its index.

- [x] **Task 7 — The `toolRef === null` reclaim ordering (AC10)**
  - [x] `handlePointerDown`'s `if (toolRef === null) return;` sits ABOVE the stale-stroke reclaim,
        so a null tool makes an orphaned stroke permanently unreclaimable. Decide whether this
        story makes it reachable (it does **not** if nothing can remove a roster row — 2.10 only
        ADDS — but a failed organism load plus an organism-kind selection can now produce a null
        ref where Conway's presence previously guaranteed one).
  - [x] Either fix it (move the reclaim above the guard — but re-read the 2026-08-27 review comment
        directly above that line first: guards that can abandon the handler must not run after a
        commit, so this is not a free reorder) or re-defer it in `deferred-work.md` with a written
        reason and a named owner.

- [x] **Task 8 — Tests (AC1–AC5, AC8, AC9)**
  - [x] `OrganismRoster.test.tsx`: rows render in roster order with the right names and chip
        colours; the eraser is the LAST row and outside the list; no `✎` / search / add / create
        control is in the document; clicking a row and clicking the eraser each call
        `onSelectTool` with the right `Tool`; the selected row exposes its state; a `duplicateColorIds`
        pair marks BOTH rows and neither is disabled; keyboard operation with `@testing-library/user-event`;
        `vitest-axe` scan is clean.
  - [x] `BattleEditorView.test.tsx`: selection round-trips from a roster row into the canvas's
        painted ref (extend the existing commit-seam tests rather than duplicating their harness);
        the removed-toggle tests are gone.
  - [x] `BattlePage.test.tsx`: a rejecting `organisms.list()` still renders the battle (AC6) and
        shows the degraded roster (AC7); a rejecting `battles.load` still renders the existing
        failure body; the 255 cap guard (AC8); the append-only assertion (AC9).
  - [x] `apps/web/e2e/battleRoute.spec.ts`: open "Three-Way Skirmish" and assert its organism names
        appear in the sidebar; select a non-default row and paint; select the eraser and erase; the
        axe scans stay at zero. ⚠️ The mock fixtures have **no two organisms sharing a
        `colorToken`** (`vermillion` / `azure` / `bluish-green` / Conway's `sky-blue`), so AC4 is a
        unit-test-only assertion unless the story deliberately changes a fixture — do NOT change
        `mockWorkspace.ts` casually; it is asserted by `@gol/test-utils`' own tests and by the
        gallery e2e.

- [x] **Task 9 — Verification and budget (AC10)**
  - [x] `npm run ci` in full. ⚠️ Never pipe it to `tail` — the pipe reports tail's exit code and has
        already masked a real failure once. Redirect to a file and echo `$?`.
  - [x] Record `bundle:check`'s measured gzip and headroom for `/`, `/battle` and `/battle/new`.
        If a budget is exceeded, **STOP and ask Sidiar** — budgets are never raised unilaterally.
  - [x] Update `deferred-work.md`: close the seven Story 2.9 entries (each with the outcome), and
        record anything newly discovered.

- [x] **Task 10 — Story record**
  - [x] Fill the Dev Agent Record: the forced decisions below (each with the option taken and why),
        verification commands with their real output summary, and the File List.
  - [x] `sprint-status.yaml`: `2-9-organism-roster-tool-selection: review` when the work is done.

### Review Findings

Reviewed by **Sonnet** — deliberately the complementary model to the Opus implementation — via
three parallel layers (Blind Hunter: diff only; Edge Case Hunter: diff + full repo access; Acceptance
Auditor: diff + this story file + `component-tree-battle-page.md` §3.3/§3.4/§6/§9.8, `architecture.md`
Decision H/M6/G.3, `deferred-work.md`, `themes.css`). AC1–AC10 independently re-verified against the
code, not taken on the Dev Agent Record's word: the WCAG contrast figure (recomputed independently:
4.484:1 on `#222222`, 5.58:1 on `#0a0a0a` — matches the claim), the `resolveSelectedTool` derivation
closing the `toolRef === null` trap by construction (confirmed `PetriDishCanvas.tsx` has zero diff
entries and the guard-before-reclaim ordering is unchanged), the `colorToken`-based duplicate
derivation, the 255-cap guard, the append-only test, all seven `deferred-work.md` entries, and
`mockWorkspace.ts` being untouched all check out exactly as recorded — no AC violation found.

Two **decision-needed** findings surfaced from the Edge Case Hunter layer, both rooted in the same
mechanism (an organism id that cannot be resolved against the loaded library) and requiring a product
call rather than an unambiguous code fix.

**Both were answered by Sidiar on 2026-08-27: option (a) for the first, option (b) for the second.**
Each is implemented in its own commit, with the resolution recorded inline below.

- [x] [Review][Decision — RESOLVED, option (a)] **A successfully-empty (not failed) organism library seeds a fake,
      selectable "Unknown organism" roster row instead of an honest empty roster.**
      [apps/web/components/battle/BattlePage.tsx, the `rosterIds` memo: `return union.length > 0 ?
      union : buildRosterIds(union, [DEFAULT_TOOL.organismId]);`] `libraryUnavailable`
      (`organismsResource.status === 'error'`) only covers a *failed* load — `organisms.list()`
      resolving to `[]` is a distinct, real, reachable state (a fresh browser profile / cleared
      storage / a bookmarked or shared `/battle/new` or `/battle?id=…` link opened before ever
      visiting the Gallery, since `useWorkspaceSeed` — which seeds Conway's Classic and persists it
      — runs only from `app/(gallery)/page.tsx`). In that state the empty-union fallback still
      unconditionally seeds `DEFAULT_TOOL.organismId`; `resolveDisplayOrganisms`
      (`apps/web/lib/displayOrganisms.ts`) can't find it in the (empty) library and falls back to
      `{ name: 'Unknown organism', colorToken: DEFAULT_COLOR_TOKEN }`; and because `roster.length >
      0`, `<OrganismRoster>` renders it as a normal, pre-selected, clickable row — no notice that
      anything is wrong, unlike AC7's genuine-failure path. **Options:** (a) guard the seed to only
      inject `DEFAULT_TOOL.organismId` when it is actually present in the resolved `organisms`
      array, otherwise leave `rosterIds` empty so the existing "eraser when the roster is empty"
      default applies (spec §3.3's own suggested behaviour for a truly empty roster) — trade-off:
      `/battle/new` becomes honestly unpaintable in this narrow case until the library has actually
      seeded, which is exactly the regression forced decision 4 was written to avoid, just triggered
      by a missing library rather than a missing selection; (b) accept the mislabeled row as a
      self-correcting stand-in (it disappears the moment the workspace seed has run once); (c)
      something broader — e.g. `<BattlePage>` itself ensuring the workspace seed has run before this
      route can reach a paintable state, which is out of this story's scope. **Question for Sidiar:**
      which of these (or another option) should this story (or a fast-follow) take?

      **✅ Sidiar's answer (2026-08-27): option (a).** The seed in `<BattlePage>`'s `rosterIds` memo
      is now conditional on `DEFAULT_TOOL.organismId` actually being present in the resolved
      `organisms` array; when it is not, `rosterIds` stays empty and `resolveSelectedTool` falls
      through to the eraser (spec §3.3's "eraser when the roster is empty"). The trade-off named in
      the finding is accepted deliberately: in that narrow window `/battle/new` is honestly
      unpaintable until Story 2.10's add dropdown ships, and an empty list is preferred to a
      fictional organism. Note this does NOT show AC7's degraded notice — the library did not fail,
      so claiming it did would be its own lie. Three tests pin it in `BattlePage.test.tsx`: no
      seeded row and no notice on an empty library; the eraser as the single remaining selection
      (AC2 still holds); and the seed still firing when the library DOES contain the default, so
      "stop seeding a fiction" cannot be satisfied by never seeding at all.

- [x] [Review][Decision — RESOLVED, option (b)] **The dangling-id colour fallback reuses `DEFAULT_COLOR_TOKEN`, which is
      also Conway's Classic's REAL token — so an unresolvable roster id can produce a false "Shared
      colour" warning against a legitimately sky-blue organism.**
      [apps/web/lib/palette/paletteRegistry.ts:63 — `DEFAULT_COLOR_TOKEN = 'sky-blue'; // token #1,
      and Conway's Classic's token`; apps/web/lib/displayOrganisms.ts's dangling-id branch;
      `findDuplicateColorIds` in apps/web/components/battle/BattleEditorView.tsx, which compares
      purely on `colorToken`] The code's own comment on the fallback already reasons through "two
      dangling ids colliding with each other" as intentional ("two unknown ids really do render in
      one colour... the warning doing its job") — but does not address a dangling id colliding with a
      REAL, correctly-sky-blue organism, which is the common case given `DEFAULT_COLOR_TOKEN` IS
      Conway's Classic's token. Any battle with one corrupt/dangling roster id (reachable per the
      code's own citation of "Story 5.11's territory") alongside Conway's Classic (or any other
      genuinely sky-blue organism) would show both as "Shared colour" for no real reason. Related to
      the finding above — same root cause, different symptom. **Options:** (a) give the dangling-id
      fallback a dedicated sentinel `colorToken` that can never equal a real palette token, so it
      cannot collide with a legitimately-coloured organism (special-case dangling-vs-dangling
      separately if that signal is still wanted); (b) exclude fallback/dangling entries from
      `findDuplicateColorIds` entirely — a corrupt reference is a different problem class from a
      genuine colour collision, and AC4/M6's warning is about organisms someone actually placed in
      the same colour; (c) accept the false positive as an edge case of an already-rare condition.
      **Question for Sidiar:** which option, and does it change the fallback's `color`/`colorToken`
      contract that other callers (e.g. the Gallery tile) also rely on?

      **✅ Sidiar's answer (2026-08-27): option (b).** `DisplayOrganism` gains an optional
      `unresolved?: boolean`, set only on the dangling-id branch of `resolveDisplayOrganisms`, and
      `findDuplicateColorIds` filters those entries out of both the count and the result. **The
      fallback's `color`/`colorToken` contract is unchanged** — which answers the second half of the
      question: `colorToken` still reports the token the entry is actually painted in, so
      `<BattleTile>` and Story 4.9's CVD work read exactly what they read before, and the new flag is
      ignorable by every consumer that does not run the FR-3.3 comparison. That is the specific
      reason option (a) was not taken: a sentinel token would have pushed a non-palette value into a
      field two other consumers read, and would still have left the two-dangler pair warning about
      each other — equally unactionable, since neither has a record to recolour. Four tests pin it:
      the flag itself and its absence on a resolved entry (`displayOrganisms.test.ts`), and in
      `BattleEditorView.test.tsx` no warning against a real sky-blue organism, none between two
      danglers, and a real colliding pair still warning with a dangler present (so the exclusion
      cannot be implemented as "skip the derivation entirely").

**Patch applied (own commit):**

- [x] [Review][Patch] **The roster's bottom-border separator never renders on any row —
      `Row`'s `&:last-of-type` is trivially true for every row.** [apps/web/components/battle/OrganismRoster.tsx]
      Each `<Row>` button is the *only* `<button>` inside its own `<RosterListItem>` (`<li>`), so it is
      "last of its type" under every `<li>`, every time — the rule fired on every row, not just the
      final one, and the mockup's inter-row separator silently never painted. No test can catch a CSS
      pseudo-class logic error like this (jsdom performs no layout and the project deliberately runs
      no pixel/snapshot tests), so it shipped invisibly. Fixed by moving the rule to
      `RosterList`, scoped against the true last `<li>`: `'& > li:last-child > button': { borderBottom:
      'none' }`. Verified: `OrganismRoster.test.tsx` (28 tests), `BattleEditorView.test.tsx`,
      `BattlePage.test.tsx` — 84 tests total, all still pass; `tsc --noEmit` and `eslint` clean on the
      file.

**Deferred (added to `deferred-work.md`):**

- [x] [Review][Defer] **`<BattleEditorView>`'s `chosenTool` state has no reset tied to battle
      identity, unlike `useUndoableGrid`'s ring.** [apps/web/components/battle/BattleEditorView.tsx —
      `const [chosenTool, setChosenTool] = useState<Tool | null>(null);`] — currently **unreachable**
      through any exposed UI path (no in-app navigation swaps `battleId` on an already-mounted
      `<BattlePage>` without a full route/page change today), so not a live bug; deferred,
      pre-existing pattern (`sessionRoster` already has the identical gap, tracked separately).
- [x] [Review][Defer] **`BattleEditorView.test.tsx` grows a second, near-duplicate mount harness
      (`mount` beside the existing `mountEditor`) in the same commit whose own comments warn against
      hand-copied setup.** [apps/web/components/battle/BattleEditorView.test.tsx:178,393] — cosmetic
      DRY debt, not a functional issue; `mountEditor` is scoped inside the first `describe` block so
      reuse needs hoisting it to module scope, a small refactor left for whoever next touches this
      file.
- [x] [Review][Defer] **The e2e AC2 test's first click lands on `/battle/new`'s only (already
      default-selected) roster row, so it doesn't itself prove a click CHANGES the selection between
      two organisms — only that the default selection paints and that switching to/from the eraser
      works.** [apps/web/e2e/battleRoute.spec.ts:330] — the organism-to-different-organism switch IS
      proven, just at the unit level (`BattleEditorView.test.tsx`'s "roster selection reaches the
      painted ref" describe), not end-to-end. Minor coverage gap, no known bug.
- [x] [Review][Defer] **No test exercises `battleResource` and `organismsResource` both failing at
      once**, the one scenario that most directly stresses AC6's "structurally independent" claim.
      [apps/web/components/battle/BattlePage.test.tsx] — manually traced: the code correctly falls
      through to the battle's own failure body regardless of organism status
      (`BattlePage.tsx`'s `if (draft === null)` branch checks `battleResource.status === 'error'`
      first), so this is an untested path, not a known bug.

**Dismissed as noise:**
- No name-collision warning, only colour — AC4/M6 explicitly scope the warning to `colorToken`
  collisions; two organisms sharing a display NAME is a different, un-asked-for concern.
- `DisplayOrganism.colorToken` being mandatory for a consumer (`<BattleTile>`) that ignores it — the
  documented, deliberate trade-off of forced decision 3 (one resolver, never two), not an oversight.
- `resolveSelectedTool`'s roster scan lacking a cited benchmark — 255 entries max, `Array.some`,
  re-run only on selection/roster change, not per render or per pointer-move; already recorded in
  `deferred-work.md` with the honest "not a measured problem, revisit only if roster gains a
  per-render derivation" framing, which is the correct level of rigor for a bound this small.

**Decision-needed: two, both above — story left in `review` pending Sidiar's answers**
(`sprint-status.yaml` unchanged). **Patches applied: one** (the CSS separator fix). **Deferred:
four**, written to `deferred-work.md`. **Dismissed: three.**

## Dev Notes

### Decisions this story is forced to make (flag each in the Dev Agent Record)

1. **The eraser row's colour.** The mockup hardcodes `#ff6600` for `.eraser-icon` and `.eraser-name`
   — a **raw hex**, which `eslint.config.mjs`'s AR-46 rule rejects in `apps/web`, and there is no
   orange `--gol-*` token in `themes.css` (the palette is `--gol-accent` cyan, `--gol-danger`
   `#ff3366`, and the neutral text/border ramp). Options: (a) add a new token to `themes.css` —
   correct per NFR-8.4's dedicated-file rule, but it obliges **Story 6.1** to override it in the
   Biotech block, so it is a cross-story commitment; (b) reuse `--gol-danger`, which already means
   "destructive" and needs nothing new; (c) render the eraser in the neutral text ramp and let
   position + the `✕` icon carry the distinction. Pick one and record the reasoning; (b) is the
   smallest correct move, (a) is the most faithful.

2. **The ARIA pattern for single-selection rows.** The roster is one exclusive selection spanning
   the organism list **and** the pinned eraser, which sit in different containers. Candidates:
   `role="radiogroup"` + `role="radio"` with roving tabindex (semantically exact for
   one-of-N, but the group must span both containers); a listbox/option pair (implies a different
   keyboard contract); or plain `<button>` rows carrying `aria-pressed` (what the deleted MUI
   toggle did, simplest, and each row stays independently tab-reachable). Whatever is chosen, AC5's
   two hard requirements are: exactly one selected state is announced, and axe is clean.
   ⚠️ `deferred-work.md`'s aria-label entry is a warning here — prefer the row's **visible text** as
   its accessible name over an `aria-label` that duplicates it, so tests and users query the same
   string.

3. **Reuse `resolveTileOrganisms` or write a roster resolver.** `apps/web/lib/tileOrganisms.ts`
   already maps `(organismIds, organisms) → { id, name, color }` with the three fallbacks that
   matter (unknown id, empty name, duplicate id) and goes through the same `displayColor(token,
   MAX_AGE_SHADE)` LUT the thumbnails use — which is precisely what keeps a roster chip from ever
   disagreeing with the dish. Reuse it. If the `Tile` name grates once a second caller exists,
   rename the module in this story rather than forking the logic; ❌ do not ship two resolvers.
   Note the gap: `TileOrganism` carries no `colorToken`, which AC4 needs (trap 4) — either widen it
   or derive `duplicateColorIds` from the `Organism[]` before resolution.

4. **What the roster SHOWS on a loaded battle — the `DEFAULT_TOOL` session seed.** `<BattlePage>`
   currently seeds `sessionRoster` with `DEFAULT_TOOL.organismId` (Conway's Classic)
   **unconditionally**, purely so the first click resolves to a ref. Once the roster is visible
   this stops being invisible plumbing: opening "Three-Way Skirmish" (roster: Aggressive Colonizer,
   Patient Defender, Chaotic Spreader) would list a **fourth** row, Conway's Classic, that the user
   never added and that Decision H says is not part of that battle. Options: (a) keep the seed
   unconditional and accept Conway in every roster; (b) seed only when the battle's own
   `organismIds` is empty — so `/battle/new` stays paintable and a loaded battle's roster is
   exactly its placed set; (c) drop the seed entirely and select "first roster row, eraser when
   empty" per spec §3.3 — ⚠️ this makes `/battle/new` **unpaintable** until Story 2.10 ships the
   add dropdown, a user-visible regression this story must not introduce. (b) is the
   recommendation; whichever is taken, `lib/tool.ts`'s and `<BattlePage>`'s comments about the seed
   must be updated to match, not left describing the old behaviour.

5. **Extract the sidebar-section frame now, or inline it.** 2.11 (Battle Name), 2.14 (Grid Info) and
   2.15 (Tools) all mount a section into this shell, and 2.16 adds the pinned footer. Extracting a
   styled `SidebarSection` + title with one consumer is mild speculation; inlining it means the next
   story does the extraction. Recommendation: build it as a module-private styled pair in
   `BattleEditorView.tsx` now, export it only when a second consumer arrives — a file move is cheap,
   a premature public API is not.

6. **Keep the bundle win.** `deferred-work.md` records that the provisional toggle cost `/battle`
   roughly 10 KB gzip and that headroom is ~2.7 KB. Deleting it should hand that back — and building
   the roster out of `styled('div')`/`styled('button')` (the `EditorStatusBar` precedent) rather
   than MUI `List`/`ListItemButton` is what keeps it. Measure before and after and report both.
   If `bundle:check` fails anyway, **stop and ask** — there is a standing rule against raising a
   budget unilaterally.

### Spec conflicts and additions surfaced (do not silently pick one — this is the project rule)

- **"Dropdown" vs roster — already resolved, cite it.** FR-3.3 says "Organism Dropdown"; the
  mockup and spec §3.4 build a roster list. Spec §9.8 settles it: follow the mockup structure, cite
  FR-3.3 **semantics**, not the literal word. No new conflict — just don't re-open it.
- **`OrganismSummary` does not exist.** Spec §3.3/§3.4 type `roster` and `library` as
  `OrganismSummary[]`, but `@gol/domain` exports `Organism` (and `BattleSummary`) only — there is no
  such type anywhere in the repo. ❌ Do not add one to `packages/domain` for a UI concern. Either
  pass `readonly Organism[]` or declare a local `apps/web` view type (the resolver's `TileOrganism`
  is already that shape). Record which, because Epic 4 will read the same spec line.
- **Mockup controls this story does not build.** `.organism-search`, `.organism-dropdown`,
  `.create-organism-btn` and `.organism-edit-btn` are all in the mockup's Organisms section and all
  belong to later stories (2.10 / Epic 4). Building the section means building a *subset* of it —
  this is expected, not a divergence.
- **Eraser colour has no token** — forced decision 1 above. If option (a) is taken, note in the Dev
  Agent Record that Story 6.1 inherits an override obligation.

### Silent-failure traps — the intuitive implementation is wrong

1. **⚠️ Never sort or reorder `rosterIds`.** The dense encoding is `cell = roster index + 1`
   (RFC-006 Decision 2), so a reordered roster silently repaints every placed cell as a different
   organism **and** corrupts all 30 undo snapshots — type-checks, passes every existing test, no
   error anywhere. If the roster ever needs a different *display* order, that is a separate derived
   array; the identity array stays append-only (AC9).
2. **⚠️ The list the UI renders and the array `refForTool` indexes must be the same order.** They
   are the same array today. If Task 4 introduces a resolved-object list, the index relationship
   must survive it — `resolveTileOrganisms` preserves order and de-dupes, which changes length if
   an id repeats. A resolved list is safe to *render*; it is not automatically safe to *index*.
3. **⚠️ `toolRef === null` becomes reachable.** `refForTool` returns `null` when an organism tool's
   organism is not in the roster — impossible while Conway was always seeded. Under forced decision
   4's option (b) or (c), and under AC7's failed-library path, an organism-kind selection can now
   resolve to `null`, at which point `handlePointerDown` returns before the stale-stroke reclaim and
   an orphaned stroke can never be cleared (`deferred-work.md`). Task 7 owns the call.
4. **⚠️ Same-colour detection compares `colorToken`s.** Comparing resolved hex strings happens to
   work today (palette hexes are distinct) but couples an FR-3.3 rule to the LUT; comparing names is
   simply a different question. M6's warning is "two organisms placed in the same battle share a
   colour" — the token is the colour's identity.
5. **⚠️ The warning is non-blocking, in both directions.** Not a disabled row, not a modal, not a
   block on selection, and not a *silent* pass either — both rows of the pair must show it.
6. **⚠️ Splitting the resources moves the `rosterSettled` gate's meaning.** That gate exists so
   `buildRefToFillGroup`'s warn-once (Decision I.4) does not fire on every load and on the static
   export's prerender, when there is no library to match ids against. After the split, "settled"
   must mean the **organism** resource, not the battle one. Getting this wrong reintroduces a
   console warning the e2e's clean-console assertions will catch — but only in e2e, not in units.
7. **⚠️ `buildRefToFillGroup` throws above 255 — during render, inside a `useMemo`.** That is an
   uncaught crash of the editor, not a degrade (AC8).
8. **⚠️ Don't churn `<PetriDishCanvas>`'s construction dependencies.** `size`, `palette` and the
   grid identity each tear down the retained renderer, the grid-line overlay and the dirty baseline
   when their identity changes. Adding a roster prop is fine; recomputing `palette` from a new array
   identity every render is not.
9. **⚠️ The colour chip is decorative.** The row already has the organism's visible name. Giving the
   chip its own accessible name creates a duplicate announcement; hide it from the a11y tree.
10. **⚠️ `useAsyncResource` deps must keep a fixed length and stable elements.** Growing `[a]` into
    `[a, b]` makes the render-phase reset fire while the effect does not re-run — the page spins
    forever with only a dev-mode console error. Read that hook's header before touching a call site.
11. **⚠️ The sidebar makes the dish's container smaller.** `deferred-work.md`'s centred-flex overflow
    entry (owned by Story 2.12) names this story as an aggravating factor: a centred flex item that
    overflows upward cannot be scrolled to. Not this story's fix — but don't be gratuitous about it.

### Previous story intelligence

**From Story 2.8 (Undo — `useUndoableGrid`, `<EditorStatusBar>`), the immediately relevant carry-over:**

- `<BattlePage>` now owns the grid through `useUndoableGrid`; `commit` and `undo` have **stable
  identities** and `canUndo` is a **boolean** (a ref-based `canUndo` never re-renders the button —
  RFC-005 Decision 6's snippet was wrong and the story documented the override). Any new prop this
  story threads down should keep the same discipline.
- `size` is **derived from the grid**, not carried separately — two sources for one fact is what
  makes `assertGridMatchesSize` throw out of the grid effect and unmount the editor. Do not
  reintroduce a second source for anything.
- `<EditorStatusBar>` is the template for a new chrome component here: `styled('button')` over
  `@mui/material/Button` (bundle), a **real** `disabled` attribute over a CSS grey, the
  `2px solid var(--gol-accent)` focus-visible ring the Story 1.9 review established, enumerated
  `transition` properties (never `all`), and a `@media (prefers-reduced-motion: reduce)` escape.
- The "ship one complete responsibility, don't stub" rule has now been applied three times (Story
  2.4 declined a half-built sidebar; 2.7 shipped a provisional toggle it promised to delete; 2.8
  shipped a status bar with only UNDO). This story is the beneficiary of the first and the executor
  of the second.
- Stories 2.5–2.8 each recorded **forced decisions** and **traps** in the Dev Agent Record, and the
  code comments cite the story and the failure they prevent — that convention is load-bearing here
  because `<BattlePage>`'s existing comments about `sessionRoster` and the seed become **stale**
  the moment forced decision 4 is resolved.

### Git intelligence (last 5 commits)

`ffa50fc` (merge) ← `f4c6b1a` docs: resolve story 2-8 decision · `193f07e` docs: run stats ·
`a04999d` fix: apply story 2-8 code review findings · `b22d2df` feat: Undo (story 2-8).

Shape of a story branch, from 2.6/2.7/2.8: one `feat:` commit carrying code + tests + the story file
+ `deferred-work.md` + `sprint-status.yaml`, then a `fix: apply … code review findings` commit, then
docs commits. Story 2.8 touched `PetriDishCanvas`, `BattleEditorView`, `BattlePage`,
`EditorStatusBar`, `battleRoute.spec.ts` and `lib/` — the same blast radius this story has, minus the
canvas. Story subagents may commit and push to their own `story/*` branch without asking; **merging
is always Sidiar's call**, and `main` is never touched directly.

### Latest technical information

- **MUI is v9.3.1 + Emotion** (not the architecture's v6 — see project-context). Per-component
  imports only (AR-35); the barrel is never imported. This story's net MUI movement should be
  **negative**: two component imports deleted, none added.
- **React 19.2.7 / Next 16.2.10, static export.** `'use client'` on every interactive component.
  No server anything.
- **`vitest-axe`'s `axe(container)`** is the established unit-level scan (see
  `BattleEditorView.test.tsx`); `@axe-core/playwright`'s `AxeBuilder` is the route-level one
  (`battleRoute.spec.ts`). Both already run in CI.
- **`@testing-library/user-event` v14** is available and is what the existing keyboard tests use
  (`userEvent.setup()`, `await user.tab()`, `await user.keyboard(...)`) — do not hand-roll
  `fireEvent.keyDown` for a keyboard-operability assertion.
- **`npm run ci`** = typecheck → lint → format:check → **spec:check** → coverage → build → bundle →
  e2e. `spec:check` fails on a cited spec ID that resolves to nothing under `docs/` — write IDs
  exactly as the specs spell them (`AR-46`, `M6`, `FR-3.3`, `Decision H`); a hyphenated `M-6`
  matches nothing and is silently exempt forever.
- **A local green `npm run ci` is not proof CI is green** — check `gh run list` after pushing.

### What NOT to build (scope boundaries)

- ❌ **No add-from-library**: no search input, no "+ ADD ORGANISM" dropdown, no `onAddToRoster`
  wiring, no writes to `sessionRoster` from the UI. That is **Story 2.10** in its entirety.
- ❌ **No ✎ pencil, no "+ CREATE NEW ORGANISM"** — Epic 4 (Story 4.24 is where the pencil first
  renders). AC5 names their absence explicitly.
- ❌ **No row removal / "remove from battle"** — no FR, no mockup control. Decision H.1 removes an
  organism by erasing its last cell and saving (Story 2.13).
- ❌ **No other sidebar section and no sidebar footer** — Battle Name (2.11), Grid Info + resize
  (2.14), Tools/Clear (2.15), Back (2.16). Sections arrive with their stories.
- ❌ **No stats in the status bar** (2.12), **no SAVE** (2.13), **no dirty tracking** (2.11).
- ❌ **No changes to the stroke pipeline, the renderer, or `useUndoableGrid`.** This story swaps a
  tool picker and fixes load/roster plumbing.
- ❌ **No new domain type, no schema change, no persistence change.** `sessionRoster` is session
  state (Decision H.2) and stays unpersisted until 2.13 prunes at save (Decision H.1).
- ❌ **No bundle-budget raise without Sidiar's approval.**

### Project Structure Notes

- New: `apps/web/components/battle/OrganismRoster.tsx` + `OrganismRoster.test.tsx`.
- Modified: `apps/web/components/battle/BattleEditorView.tsx` (+ test), `BattlePage.tsx` (+ test),
  `apps/web/e2e/battleRoute.spec.ts`, `docs/implementation-artifacts/deferred-work.md`,
  `docs/implementation-artifacts/sprint-status.yaml`. Possibly `apps/web/lib/tileOrganisms.ts`
  (forced decision 3) and `apps/web/app/themes.css` **only** under forced decision 1(a).
- Naming: components PascalCase `.tsx`; non-component TS files camelCase, **never dotted**.
- `apps/web` holds UI and wiring only — no simulation, persistence or rules logic. No DOM types
  leak into `packages/*`.
- Repositories stay **injected**: `<BattlePage>` receives `AppRepositories` as a prop and never
  imports a concrete repository or calls `createRepositories()`. Nothing this story adds may change
  that.
- Coverage: `apps/web` has **no coverage gate** (deliberate counter-metric). Write the tests that
  prove the ACs, not tests that raise a number.

### References

- [Source: docs/planning-artifacts/epics.md#Story 2.9: Organism Roster & Tool Selection] — the ACs.
- [Source: docs/planning-artifacts/epics.md#Story 2.10: Add Organisms from Library] — the boundary
  on the other side (search, add, the 256th-add block).
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.4] — `<OrganismRoster>`'s full
  interface, of which this story ships a slice.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3] — `<BattleEditorView>`:
  `selectedTool` ownership, `duplicateColorIds` as a per-commit derivation, private layout children,
  "initial tool selection is a story-level call".
- [Source: docs/planning-artifacts/component-tree-battle-page.md#6] — the state matrix rows for
  `selectedTool`, `sessionRoster`, `duplicateColorIds`, roster search filter.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#9] — item 8 (roster vs dropdown).
- [Source: docs/planning-artifacts/architecture.md#Decision H] — H.1 placed-set invariant, H.2
  session roster.
- [Source: docs/planning-artifacts/architecture.md#M6] — colours are reusable, two non-blocking
  warnings, uncapped library vs the 255-per-battle roster.
- [Source: docs/planning-artifacts/architecture.md#G.3] — the 255 cap is schema- **and**
  UI-enforced.
- [Source: docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md] — the token registry and
  `displayColor`.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html]
  — `.sidebar` 98–128, `.sidebar-section` 149–160, `.used-organisms-list` 192–236,
  `.organism-eraser` 338–380, markup 658–701.
- [Source: docs/implementation-artifacts/deferred-work.md] — the seven Story 2.9 entries and the
  bundle-headroom entry flagged "before Story 2.9 starts".
- [Source: docs/implementation-artifacts/2-7-eraser.md] — the provisional toggle's forced decision
  1(a) and its promise to be deleted here.
- [Source: docs/implementation-artifacts/2-8-undo.md] — `useUndoableGrid`, the boolean-`canUndo`
  override, the `<EditorStatusBar>` house style.
- [Source: docs/project-context.md] — AR-46 no-raw-hex, AR-35 per-component MUI imports, AR-2/27
  repository injection, the pipe-swallowed-exit-code and local-CI-is-not-CI warnings.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (dev-story workflow).

### Debug Log References

`npm run ci` (the full local gate: typecheck -> lint -> format:check -> spec:check -> coverage ->
build -> bundle -> e2e), redirected to a file with the exit code echoed separately — never piped,
per the recorded pipe-swallowed-exit-code trap.

| Run | Result | Notes |
|---|---|---|
| 1 | **exit 1** | `format:check` on four new/edited test files. Lint reported one pre-existing warning in `BattleGallery.tsx` (untouched by this story, 0 errors). |
| 2 | **exit 1** | Prettier fixed. Bundle PASSED. **5 e2e failures**, two distinct causes — see below. |
| 3 | **exit 0** | Full gate green. |

Final run 3: typecheck / lint / format:check / spec:check clean; coverage `web` 634 tests in 43
files, `@gol/domain` 85, `@gol/persistence` 82, `@gol/test-utils` 75 — all passing; **e2e 180
passed** across all four Playwright projects.

**The two e2e failures in run 2 were both real, and neither was a test artefact:**

1. **`--gol-danger` text failed WCAG AA.** axe measured the eraser row's `#ff3366` on the
   selected/hover background `#222222` at **4.48:1** against the 4.5 threshold for 11px text. This
   only fires on the SELECTED eraser — the same colour clears 4.5 against `--gol-bg-primary`, which
   is why the resting row looked fine. It changed forced decision 1 (below) and is recorded in
   `deferred-work.md` as a token-level finding that reaches beyond this story.
2. **Playwright's `getByRole` name option is a SUBSTRING match by default**, so the AC3 assertion
   `getByRole('button', { name: 'Erase' })).toHaveCount(0)` matched the eraser row's own "Eraser"
   and failed against correct code. Fixed with `exact: true`, with the reason written at the call
   site — RTL's `name` is a full-string match for strings, so the two libraries differ here and the
   difference is silent.

### Completion Notes List

**Bundle (AC10) — measured, not estimated.** `bundle:check` on the final run:

| Route | gzip | Budget | Headroom | Before this story |
|---|---|---|---|---|
| `/` | 326.5 KB | 330 KB | **3.5 KB** | ~3.5 KB (unchanged — the roster never renders here) |
| `/battle` | 298.7 KB | 310 KB | **11.3 KB** | ~2.7 KB |
| `/battle/new` | 298.7 KB | 310 KB | **11.3 KB** | ~2.7 KB |

Deleting `ToggleButton`/`ToggleButtonGroup` returned the ~10 KB `deferred-work.md` attributed to
them, and `<OrganismRoster>` did not spend it (forced decision 6: styled primitives only, net MUI
movement is two component imports deleted and none added). **No budget was raised and none needed
to be.** `/` is now the tightest of the three at 3.5 KB — flagged for the next story adding
shared-chunk weight.

**The four forced decisions, as taken:**

1. **Eraser colour — a measured split between options (b) and (c), not (b) as recommended.**
   `--gol-danger` for the whole row was implemented first and FAILED AA at 4.48:1 on the selected
   background (see Debug Log). Final: the eraser's NAME uses the neutral text ramp every other row
   uses (option (c)), and `--gol-danger` carries only the ✕ box — a non-text element held to WCAG
   1.4.11's **3:1**, which the same 4.48 clears with room, and whose glyph is `aria-hidden` so it is
   exempt from the text-contrast rule by construction rather than by luck. Option (a) (a new
   `--gol-eraser` token) was rejected as recorded: it obliges Story 6.1 to override it in the
   Biotech block, a cross-story commitment for one control's colour. **Story 6.1 inherits no
   obligation from this story.** Position, the separator border and the red ✕ carry the distinction.
2. **ARIA — plain `<button>` rows with `aria-pressed`.** The exclusive selection spans the list AND
   the pinned eraser, which sit in different containers by AC1's own requirement, so a
   `role="radiogroup"` would have to own both through a wrapper and hand-roll roving tabindex plus
   arrow keys — more code, more bundle, and a keyboard contract that gets worse as the roster grows
   toward 255 (one tab stop for the whole group instead of one per row). `aria-pressed` announces
   exactly one pressed row, keeps every row independently tab-reachable, and is what the deleted
   `ToggleButtonGroup` already exposed, so the contract users and tests query is unchanged. Rows are
   named by their VISIBLE text with **no `aria-label` anywhere** — the direct lesson of the
   `deferred-work.md` aria-label entry this story closes, and asserted as such.
3. **Reuse the resolver, and RENAME it.** `tileOrganisms.ts` → **`displayOrganisms.ts`**
   (`TileOrganism` → `DisplayOrganism`, `resolveTileOrganisms` → `resolveDisplayOrganisms`), which
   the story explicitly preferred over forking once a second, non-tile caller existed. Widened with
   **`colorToken`** so AC4 compares tokens rather than resolved hexes (trap 4); the dangling-id
   fallback reports `DEFAULT_COLOR_TOKEN`, the token it is actually painted in. ⚠️ **Superseded in
   part by the review:** that token is also Conway's Classic's own, so it is reported but no longer
   COMPARED — the fallback carries `unresolved: true` and `findDuplicateColorIds` excludes it (review
   decision 2, option (b), above). The claim that this "stays truthful about corrupt ids" was the
   half that did not survive: it warned a healthy sky-blue organism about a record that does not
   exist. **On
   `OrganismSummary`:** it does not exist in `@gol/domain` and was NOT added — `DisplayOrganism` is
   that shape and stays in `apps/web`, because a resolved hex and a fallback NAME are presentation
   concerns. Epic 4 reads the same spec line and should reuse this type.
4. **The `DEFAULT_TOOL` seed — option (b), plus a derivation the story did not anticipate needing.**
   The seed is now applied ONLY when the union would otherwise be empty, so a loaded battle's roster
   is exactly its placed set (Decision H.1) and "Three-Way Skirmish" no longer lists a fourth row
   the user never added. `sessionRoster` itself starts EMPTY — the seed moved out of it entirely,
   which also leaves Story 2.10 a clean writer.
   ⚠️ **Option (b) alone is not sufficient, and this is the part worth reading.** With the seed
   conditional, `DEFAULT_TOOL` is no longer guaranteed to be in the roster, so an initial selection
   of `DEFAULT_TOOL` would resolve to `refForTool(...) === null` on every loaded battle: the dish
   silently unpaintable AND no row selected, violating AC2's "exactly one, always". So
   `<BattleEditorView>` now DERIVES the effective tool (`resolveSelectedTool`) — the user's explicit
   choice while it is still valid, otherwise the first roster row, otherwise the eraser. Derived
   rather than synchronised in an effect, because the roster identity changes on a route switch and a
   `useState` seeded from the first roster would keep pointing at an organism the new battle has
   never heard of. `lib/tool.ts`'s and `<BattlePage>`'s comments about the seed were REWRITTEN to
   describe what it now means, not left describing the old behaviour.
   ⚠️ **Narrowed again by the review (decision 1, option (a)).** "The union would otherwise be
   empty" was still not a tight enough condition: it fired even when the library had loaded
   successfully and was EMPTY, seeding an id with no record behind it and rendering a fake
   "Unknown organism" row. The seed now additionally requires `DEFAULT_TOOL.organismId` to be
   present in the loaded library; otherwise the roster is empty and `resolveSelectedTool`'s eraser
   fallback — already written for exactly this shape — carries it.

**Traps navigated (the ones that changed the code):**

- **Trap 2 (`rosterIds` vs `roster`).** Both are passed to `<BattleEditorView>` and they are not
  interchangeable: `resolveDisplayOrganisms` de-duplicates, so the display list can be SHORTER.
  `refForTool` keeps indexing the identity array. Documented on both props.
- **Trap 6 (the `rosterSettled` gate's meaning moved).** Splitting the resources made "settled" the
  ORGANISM resource's condition, not the battle's. Left keyed on the battle, a battle resolving
  before the library would print `buildRefToFillGroup`'s dangling-id warn-once for every one of its
  organisms on every load — caught only by the e2e's clean-console assertions, which the new
  route-level roster test now also carries.
- **Trap 3 (`toolRef === null`) — closed by construction, not by reordering.** See Task 7 below.
- **Trap 11 (the sidebar shrinks the dish).** `<EditorSidebar>` is `flexShrink: 0` and
  `<MainContent>` gained `minWidth: 0`, so the dish gives ground rather than the sidebar being
  pushed off-screen. Not the Story 2.12 overflow fix, and deliberately not made worse.

**Task 7 — the `toolRef === null` reclaim: RE-DEFERRED, with reachability reduced rather than the
ordering changed.** The story expected this story to make it reachable. It did the opposite:
`resolveSelectedTool` only ever returns an organism arm after confirming the id is in the roster,
every other path yields the eraser (ref 0), and `libraryUnavailable` forces the eraser outright — so
no selection reachable from the UI resolves to `null`. Reordering was considered and rejected: the
2026-08-27 review comment directly above that guard establishes that nothing which can abandon the
handler may run after a commit, and the reclaim commits, so it is not the free swap it looks like —
and this story is explicitly scoped out of touching the stroke pipeline. Re-deferred to **Story
2.13** (save + the H.1 prune), the first story that can REMOVE an organism from a roster and so the
first that can genuinely re-open the path; 2.10 only appends.

**AC8's page-level fixture, deliberately not built.** The cap guard is unit-tested against a full
255-entry roster in `rosterUnion.test.ts` — which is what AC8 asks for in as many words ("unit-test
the guard against a 255-entry roster"), and it also pins the pre-fix behaviour by asserting
`buildRefToFillGroup` still throws on the unguarded append. A `<BattlePage>`-level version would
need 255 schema-valid `Organism` records and a `Battle` that passes `BattleSchema`, since
`createFakeRepositories` validates its seed; that was judged disproportionate to a claim already
proven at the unit the guard lives in.

**Fixtures:** `mockWorkspace.ts` was NOT touched. It has no two organisms sharing a `colorToken`, so
AC4 is proven at the unit level (`OrganismRoster.test.tsx` and `BattleEditorView.test.tsx` each
build a colliding pair — the latter with the SAME token but deliberately different resolved hexes,
so a derivation comparing rendered colour instead of the token fails there).

**Spec conflicts:** none new. §9.8's "dropdown vs roster" resolution was followed, not re-opened;
the `OrganismSummary` gap is recorded under forced decision 3.

### File List

**New**

- `apps/web/components/battle/OrganismRoster.tsx`
- `apps/web/components/battle/OrganismRoster.test.tsx`
- `apps/web/lib/rosterUnion.ts`
- `apps/web/lib/rosterUnion.test.ts`

**Renamed** (forced decision 3 — one resolver, never two)

- `apps/web/lib/tileOrganisms.ts` → `apps/web/lib/displayOrganisms.ts` (widened with `colorToken`)
- `apps/web/lib/tileOrganisms.test.ts` → `apps/web/lib/displayOrganisms.test.ts`

**Modified**

- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`
- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/gallery/BattleGallery.tsx` (rename call sites only)
- `apps/web/components/gallery/BattleTile.tsx` (rename call sites only)
- `apps/web/components/gallery/BattleTile.test.tsx` (rename + `colorToken` in the fixture)
- `apps/web/lib/canvas/refToFillGroup.ts` (`MAX_ROSTER_SIZE` exported)
- `apps/web/lib/tool.ts` (comments only — forced decision 4 made them stale)
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/2-9-organism-roster-tool-selection.md`

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-27 | 0.1 | Story context created | create-story |
| 2026-08-27 | 1.0 | Implemented: Lab sidebar chassis + `<OrganismRoster>`, Story 2.7's provisional toggle deleted, `<BattlePage>` resources split, seven `deferred-work.md` entries settled. `npm run ci` green. | dev-story |

Dev Model: opus   # architecture-shaping: establishes the Lab sidebar chassis and section frame that Stories 2.10/2.11/2.14/2.15/2.16 all mount into plus the `OrganismRosterItem` styling Epic 4 reuses, and must settle three decisions with downstream inheritance (the `DEFAULT_TOOL` session-roster seed and what a loaded battle's roster shows, the single-selection ARIA contract, the eraser's missing colour token) while restructuring `<BattlePage>`'s resource loading and closing seven inherited `deferred-work.md` entries

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 24s | 22 | 2,454 | 13,372 | 439,950 | 455,798 |
| Step 1 — create-story | opus-5 | 1 | 8m 33s | 196 | 27,463 | 480,535 | 9,210,805 | 9,718,999 |
| Step 2 — dev-story | opus-5 | 1 | 29m 22s | 410 | 55,028 | 518,140 | 34,687,413 | 35,260,991 |
| Step 3 — code review + PR | sonnet-5 | 4 | 22m 35s | 588 | 32,041 | 1,592,515 | 30,171,241 | 31,796,385 |
| _of which the orchestrator_ | opus-5 | — | — | 78 | 13,274 | 51,762 | 1,952,844 | 2,017,958 |
| **Total (create-story → PR ready)** | | 6 | **1h 00m** | 1,216 | 116,986 | 2,604,562 | 74,509,409 | **77,232,173** |

Run started 2026-08-27 14:35 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
