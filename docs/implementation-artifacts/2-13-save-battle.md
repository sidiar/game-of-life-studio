---
baseline_commit: 95e8264
---

# Story 2.13: Save Battle

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to explicitly save my battle,
so that my work persists across sessions.

## Acceptance Criteria

Verbatim from `epics.md#Story 2.13: Save Battle`, decomposed into the eight things a reviewer can
independently check. **AC6 collects six `deferred-work.md` entries that name Story 2.13 as owner** —
inherited debt coming due, the same shape AC5/AC6 took in Story 2.12 and AC6/AC7 in Story 2.11.

⚠️ **This is the first code in the app that WRITES a battle.** Nothing in `apps/web` calls
`repositories.battles.save` today (`grep` it — the only hits are `vi.spyOn(…, 'save')` assertions
that it is NOT called). Every mistake in the projection below lands in the user's `gol:battles`
permanently and silently, so the ref arithmetic is the load-bearing part of this story, not the
button.

1. **AC1 — A SAVE button in the status bar's right group, enabled exactly when `isDirty`.**
   `<EditorStatusBar>` gains `onSave(): void; isDirty: boolean` (spec §3.8's remaining two props,
   FR-7.8) and renders SAVE beside UNDO inside the existing `<RightGroup>` — the slot Story 2.12
   built for it (`EditorStatusBar.tsx:181-193`: "Story 2.13's SAVE lands here and inherits the same
   protection", i.e. `flexShrink: 0`). Mockup: `.save-btn`
   (`clinical-lab-theme/petri-dish-lab-mode.html:608-624`, markup `:824`) — a SOLID accent button,
   `background: var(--gol-accent)`, `border: 1px solid var(--gol-accent)`,
   `color: var(--gol-on-accent)`, `padding: 8px 20px`, otherwise the same 11px/600/uppercase/0.5px
   type as UNDO. The mockup's `#00b8e0` hover is `var(--gol-accent-hover)`; ❌ **no raw hex** (AR-46
   is a live lint rule on `apps/web`).
   ⚠️ `disabled={!isDirty}` — a **real `disabled` attribute**, never a CSS-only grey, and the same
   `2px solid var(--gol-accent)` focus ring + `:disabled` token treatment `UndoButton` already
   carries. On a solid-accent button that focus ring needs an `outlineOffset` that stays visible
   against the accent fill; check it rather than copying blind.
   ⚠️ ❌ **No new `styled()` primitive if `UndoButton` can be parameterised** — but do not contort
   it either; see forced decision 5.

2. **AC2 — Saving a `'new'` battle CREATES; every save after that UPDATES the same entity (FR-7.8).**
   `NewBattleDraft` deliberately carries no `id` (`lib/newBattleDraft.ts`: "`id`, `createdAt` and
   `updatedAt` are stamped by the save path (Story 2.13); minting any of them here would be a lie
   the moment the user leaves `/battle/new` without saving" — Story 2.2 forced decision 5, which
   this story inherits). So this story mints the uuid, and `<BattlePage>` must REMEMBER it: the
   second save on `/battle/new` must call `battles.save` with the SAME id, not create a second
   battle.
   ⚠️ `crypto.randomUUID()` requires a **secure context** — it is `undefined` over plain `http://`
   on a LAN IP, which is a real way to open a static export. `localhost` and `https` are secure, so
   dev, Playwright and any real deployment are fine; decide whether to guard (forced decision 2).
   ⚠️ **`BattleSchema.id` is `z.uuid()`** — a hand-rolled id must be a real v4 uuid or the record
   fails its own load.
   ⚠️ The URL does **not** have to change; see forced decision 1 for the three options and why the
   recommended one keeps `/battle/new` in the address bar.

3. **AC3 — The persisted record is the H.1 projection of the live editor state, not a copy of it.**
   One pure function turns `(grid: RenderableGrid, rosterIds, name, …)` into a `Battle`:
   - **`organismIds` is pruned to exactly the placed set** (Decision H.1). Session-added-but-unpainted
     entries are excluded (Decision H.2), and so is any battle organism whose last cell was erased.
   - **`gridState` is remapped in the same step** (Decision E.2): pruning shifts every ref after the
     removed slot, so cell values must be rewritten against the NEW `organismIds` order or the
     record indexes the wrong organisms. This is the whole risk of the story.
   - **Dense `number[][]`, `rows × cols`** — the inverse of `toRenderableGrid`
     (`lib/canvas/renderableGrid.ts:27`). Dense at rest is AR-9 / RFC-006 Decision 2; sparse is
     wire-only and belongs to Epic 5.
   - **`gridSize`** comes from the LIVE grid (`grid.width`/`grid.height`), not `draft.gridSize` —
     Story 2.8 forced decision 4 already made the grid the single source for dimensions, and Story
     2.14's "the new size persists on save" then needs no change here. Validate it through
     `EditableGridPresetSchema` so an out-of-preset grid fails loudly at the boundary (Decision G.1).
   - **`createdAt`** is minted on first save and **preserved** on every save after (read it off the
     loaded battle / the first-save stamp). **`updatedAt`** bumps every save, which is what makes
     the Gallery re-sort (`lib/gallerySort.ts#sortByLastModified`, FR-7.3).
   - **`name`** is the raw `battleName`, including `''` — `battleDisplayName` supplies "Untitled
     Battle" for DISPLAY only, and `createNewBattleDraft`'s comment records why the placeholder is
     never stored.
   ⚠️ **The projection must not touch the live editor state.** `rosterIds` and `grid` keep their
   pre-save identities after a save — see trap 1. Re-seeding `<BattlePage>` from the saved record
   would shift every live ref, reset the undo ring, and repaint the dish.
   ⚠️ **The output must satisfy `BattleSchema.superRefine` by construction** (`packages/domain/src/
   battleSchema.ts:33-76`): dims match `gridSize`; every cell value ≤ `organismIds.length`; roster ≡
   placed set; **no duplicate ids in `organismIds`** — and `rosterIds` CAN contain duplicates
   (Story 2.12's trap 1, `BattleSummarySchema` has no duplicate check), so the projection has to
   collapse them onto one slot rather than assume they cannot occur.

4. **AC4 — A successful save clears `isDirty`, and the battle is in the Gallery with a live thumbnail.**
   `isDirty` clears **only after `battles.save()` resolves** — never optimistically before the
   `await`, which would report success for a write that then throws (AC5). Nothing else about the
   editor changes: the grid, the undo ring, `sessionRoster` and the tool selection all survive.
   The thumbnail needs **no new code** — `<BattleTile>` renders it on demand from `battles.load(id)`
   through the existing renderer (M4, Story 1.11) — but it does need an e2e that proves the saved
   record is actually loadable and paintable, because a projection bug that violates
   `BattleSchema` surfaces there as an `unavailable` tile and nowhere else.
   ⚠️ **A second save while one is in flight must not be possible** — disable SAVE for the duration.
   Two interleaved read-modify-write cycles over the single `gol:battles` key can lose one of them
   (`localStorageBattleRepository.ts` reads the whole collection, mutates one entry, writes it back).

5. **AC5 — A quota failure is non-destructive, says so, and leaves the editor exactly as it was
   (AR-14, NFR-7.2).**
   The candidate-string-then-`setItem` half is **already built** — `writeKey`
   (`packages/persistence/src/localStorageAccess.ts:53-65`) serialises before touching storage and
   throws `QuotaExceededError`, so existing stored data is byte-identical after a failure. Story 1.4
   proves that. What this story owns is the **UI half**: catch it, surface a non-destructive message,
   and **leave `isDirty` true** so the user keeps their unsaved indicator (RFC-006 Decision 7 says
   the failed write "also fails the dirty-flag clear" in as many words).
   ⚠️ **`QuotaExceededError` is not the only reachable rejection.** `battles.save()` calls
   `readCollection` first, which throws `CorruptDataError` when `gol:battles` is unparseable JSON —
   reachable, and a different fact needing different copy. Every other rejection gets a generic
   non-destructive message. ❌ Never swallow one: an unreported save failure is the worst outcome in
   this story.
   ⚠️ The error surface must not re-break Story 2.12's bar-overflow fix — see forced decision 4.

6. **AC6 — Six inherited `deferred-work.md` entries, settled with evidence.**
   All six name this story. Two of them rest on a **stale premise** (see the ⚠️ below) — correct the
   entry's reasoning when you settle it, exactly as Story 2.12 was required to for the
   `padding-bottom: 80px` claim.
   - **`:229` — `Battle.gridState`/`organismIds` are still mutable arrays.** "Pick this up alongside
     whichever story first needs `Battle` itself to be immutable (2.13's save path is the most likely
     first writer to actually notice)." It is that story. Decide whether the zod-inferred `Battle`
     gains `readonly` (a `packages/domain` change under the ≥90% gate) or the entry is re-deferred
     with a reason; either way the projection must not alias the loaded record's arrays.
   - **`:349` — `battleDisplayName`'s `trim()` does not treat invisible-only names as empty.**
     "Pick this up with Story 2.13, the first story that persists a name the user typed and therefore
     the first with a reason to decide what an invisible name IS." U+200B / U+2060 / U+00AD are not
     ECMAScript `WhiteSpace`. Decide, and note that widening the emptiness test changes what the
     Gallery tiles and the delete dialog render for the same records.
   - **`:353` — hitting the 100-character name cap is silent in every modality.** "Pick this up with
     Story 2.13, which gives the field its first real failure mode (a save that can be refused)."
     The non-noisy shape the entry itself proposes: one polite live region rendered only at
     `value.length >= maxLength`.
   - **`:371` — "adds no new tab stop" is asserted by a test that cannot fail on a tab stop.**
     "Pick this up in Story 2.13, which adds the second control to this bar and will need a real
     tab-order assertion anyway." Replace the `getAllByRole('button')` count with a real
     `user.tab()` sequence: tab → UNDO, tab → SAVE, tab → focus has left the bar.
   - ⚠️ **`:275` — a stale stroke plus `toolRef === null` is unreclaimable.** "Pick this up in Story
     2.13 (save + the Decision H.1 prune), which is the first story that can REMOVE an organism from
     the roster and so the first that can genuinely re-open this path."
   - ⚠️ **`:329` — `onAddToRoster` has no cap guard, and `handleAddToRoster` selects unconditionally.**
     "Pick this up in Story 2.13, where the H.1 prune gives `sessionRoster` its second writer."
   ⚠️ **Both of those last two assume the prune MUTATES the live roster.** Under AC3's projection it
   does not — the prune is a save-time projection, `sessionRoster` gains no second writer, and
   nothing removes an organism from the live `rosterIds`. If you take forced decision 1(a), say so
   in both entries and re-defer them with the corrected reachability rather than claiming a fix you
   did not make. If you take 1(b), the remount makes `:275` reachable for real — then it is in scope.

7. **AC7 — The save path is proven pure and proven correct at the boundary, not just at the button.**
   The projection function is a pure unit with its own co-located tests, and at least one test
   round-trips through a **real schema parse** (`BattleSchema.safeParse(projected)`) rather than
   asserting field-by-field — the invariants in AC3 are exactly what `superRefine` already encodes,
   and re-stating them in an assertion is how the two drift apart. Property-style cases worth pinning:
   prune-with-no-erasure is identity; erasing an interior organism shifts only the refs above it;
   a duplicate id in `rosterIds` collapses to one slot with its cells merged; an out-of-range ref
   (Story 2.12 trap 2's dangling cell) does not produce a record that fails its own schema.

8. **AC8 — Keyboard-clean, axe-clean, bundle re-measured.**
   Tab order in the bar is **UNDO then SAVE** (DOM order), asserted for real per AC6's `:371` entry.
   `vitest-axe` reports zero violations on `<EditorStatusBar>` in every state (dirty, clean, saving,
   error) and on the rendered editor; the `/battle` + `/battle/new` Playwright axe scans stay at zero.
   Report `bundle:check`'s measured gzip and headroom for all three routes. Story 2.12 left
   **`/battle` 300.5 KB (9.5 KB headroom)**, **`/battle/new` 300.4 KB (9.6 KB)** and **`/` 326.6 KB
   (3.4 KB)**; budgets are 310 / 310 / 330 KB. A budget is never raised unilaterally — if one is
   exceeded, **STOP and ask Sidiar**.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (all ACs)**
  - [x] `apps/web/components/battle/BattlePage.tsx` in full. Specifically: `toDraft` (`:100-107`) and
        its by-reference warning; `isDirty` (`:217`) and its comment naming this story as the only
        thing that clears it; `handleNameChange` (`:222-225`); `sessionRoster` (`:354`) whose comment
        says "2.13 (save + the H.1 prune) is the other [writer]" — evaluate that claim against forced
        decision 1 rather than obeying it; the `rosterIds` memo (`:391-444`) and the **append-only**
        invariant its Story 2.10 review comment defends; `handleCommitGrid` (`:554-560`) and why its
        identity must stay stable; the four early returns and the every-hook-precedes-them rule
        (`:562-604`); `data-dirty` on `Root` (`:623`).
  - [x] `apps/web/components/battle/EditorStatusBar.tsx` in full — `<RightGroup>` (`:181-193`, the
        slot built for SAVE, and `flexShrink: 0`'s recorded reason), `UndoButton` (`:148-179`) and
        its three recorded reasons for being a `styled('button')`, `<Bar>`/`<StatsGroup>`'s
        `minWidth: 0` + `overflowX` (the 2026-08-28 review's measured overflow fix), and
        `EditorStatusBarProps`'s ❌-list naming exactly what this story adds.
  - [x] `apps/web/components/battle/BattleEditorView.tsx:23-129` — `BattleEditorViewProps` and the
        `EditorMainProps = Omit<…> & { tool; toolRef; stats }` intersection. **`isDirty`/`onSave` are
        INPUTS to this view, not derivations** — unlike `stats` they go on `BattleEditorViewProps`
        (spec §3.3 lists them there) and then through the `Omit` to `<EditorMain>`. Check that
        `Omit` list: props not listed pass through, so nothing needs adding to it.
  - [x] `packages/domain/src/battleSchema.ts` in full — `BattleSchema`, the four `superRefine`
        issues (`:33-76`), `MAX_BATTLE_NAME_LENGTH`, `IsoTimestamp`, and `BattleSummarySchema`'s
        note that it deliberately omits `createdAt`.
  - [x] `apps/web/lib/canvas/renderableGrid.ts` — `toRenderableGrid` is the function this story
        inverts; copy its eager-validation stance and its "0 = empty; 1..255 = roster index + 1"
        contract, do not restate them differently.
  - [x] `apps/web/lib/gridStats.ts` — `computeEditorGridStats` already does the ref → `rosterIds`
        → id fold this story's prune needs the "which ids are placed" half of. **Reuse or mirror it
        deliberately; do not invent a third counting loop** (forced decision 3).
  - [x] `packages/persistence/src/localStorageAccess.ts:20-65` — `QuotaExceededError`, the
        cross-browser name/code matching, and `writeKey`'s candidate-string comment. This is the
        half that already exists; AC5 is the UI half only.
  - [x] `packages/persistence/src/localStorageBattleRepository.ts` — `save()` is a whole-collection
        read-modify-write (why AC4's in-flight guard matters), and `load()` throws
        `CorruptDataError` rather than returning null.
  - [x] `packages/persistence/src/repositories.ts` — `BattleRepository.save(battle: Battle)`. Note
        the signature before reading the epic AC's "conversion happens inside the repository": see
        *Spec conflict surfaced* below.
  - [x] `apps/web/lib/newBattleDraft.ts` — why the draft has no `id`, and why `name` seeds `''`.
  - [x] `apps/web/components/gallery/BattleTile.tsx:361-440` and `lib/gallerySort.ts` — the
        on-demand thumbnail lifecycle and the `updatedAt` sort AC4's e2e observes.
  - [x] The four absence assertions this story converts (trap 5):
        `EditorStatusBar.test.tsx:83`, `BattleEditorView.test.tsx:140`, `BattlePage.test.tsx:484`
        and its `:477` comment ("a SIXTH button … 2.13's SAVE arriving early … still fails here").
  - [x] `docs/implementation-artifacts/deferred-work.md` — the six entries naming this story
        (`:229`, `:275`, `:329`, `:349`, `:353`, `:371`).

- [x] **Task 2 — The projection (AC3, AC7) — the load-bearing unit**
  - [x] Implement per forced decision 3. Suggested shape, wherever it lands:
        ```ts
        export interface BattleRecordDraft {
          id: string;
          name: string;
          createdAt: Date;
          updatedAt: Date;
        }
        /** H.1 prune + E.2 remap + dense conversion, in ONE pass-pair. */
        export function projectBattleForSave(
          grid: RenderableGrid,
          rosterIds: readonly string[],
          meta: BattleRecordDraft,
        ): Battle;
        ```
  - [x] **Two passes, not `rosterIds.length` passes.** Pass 1 over `grid.occupant` builds the placed
        set (a `Uint8Array`/`Set` of refs, or reuse `computeEditorGridStats`). Then build
        `oldRef → newRef` as a `Uint8Array(rosterIds.length + 1)` lookup, in first-occurrence order,
        collapsing duplicate ids onto one slot. Pass 2 writes the dense `number[][]` through it.
        ❌ No `Array.prototype.indexOf` per cell, ❌ no `Map<string, …>` keyed lookup per cell.
  - [x] **Out-of-range and dangling refs** (`ref > rosterIds.length`, or a ref whose id resolves to
        nothing): decide and pin. A cell that survives to `gridState` with a value above the pruned
        roster length makes the record **fail its own schema** — so it must be written as `0`
        (dropped) or the save must refuse. ⚠️ Dropping a cell is DATA LOSS the user did not ask for;
        say which you chose, why, and whether it is reported. It is reachable exactly the way Story
        2.12 trap 2 describes (a hand-edited or corrupt `gridState`).
  - [x] Co-located tests. Cover: nothing placed (empty roster, empty grid — a legal `Battle`); no
        erasure (prune is identity, refs unchanged); an interior organism fully erased (only refs
        above it shift, and every surviving cell still resolves to the same ORGANISM); a
        session-added-but-unpainted id (excluded — H.2); a duplicate id in `rosterIds` (one slot,
        cells merged); an out-of-range ref; both grid presets, never a hardcoded 100 × 60.
  - [x] **At least one test parses the output through `BattleSchema`** (AC7) rather than asserting
        fields — that is what keeps this function and `superRefine` from drifting.

- [x] **Task 3 — The save orchestration in `<BattlePage>` (AC2, AC4, AC5)**
  - [x] `savedId` / `createdAt` state per forced decision 1 and 2. ⚠️ Declared **before every early
        return** (`BattlePage.tsx:562+` — four of them; a hook below any is a conditional hook).
  - [x] `handleSave` as a `useCallback` whose identity is stable for the same reasons
        `handleCommitGrid`'s is (`:554-560`). It: guards against re-entry; projects; awaits
        `repositories.battles.save(record)`; on success records the id/`createdAt` and clears
        `isDirty`; on failure sets the error state and **leaves `isDirty` true**.
  - [x] ⚠️ **Do not re-seed anything from the saved record.** No `battleResource` refetch, no new
        `draft`, no touch to `rosterIds`, `grid`, `sessionRoster` or the undo ring — trap 1.
  - [x] Error state: `QuotaExceededError` → the storage-full copy; `CorruptDataError` → its own copy;
        anything else → a generic non-destructive message. Import both from `@gol/persistence`
        (they are exported for exactly this — `packages/persistence/src/index.ts`'s comment says so).
  - [x] Clear the error on the next successful save, and decide whether an edit clears it too
        (record which).
  - [x] Thread `isDirty` + `onSave` (+ whatever forced decision 4 needs) through
        `<BattleEditorView>` → `<EditorMain>` → `<EditorStatusBar>`.

- [x] **Task 4 — SAVE in `<EditorStatusBar>` (AC1, AC8)**
  - [x] Extend `EditorStatusBarProps` with `onSave(): void; isDirty: boolean` and keep the doc
        comment's ❌-list accurate (the Grid Zoom slider is still superseded — §9.1).
  - [x] The button per AC1's token list, inside `<RightGroup>`, **after** UNDO in DOM order.
  - [x] `type="button"` explicitly (the same reason `UndoButton` carries it).
  - [x] Forced decision 5 (share `UndoButton` vs a second primitive), recorded.
  - [x] Re-check the bar at a narrow viewport: Story 2.12's review measured `document.scrollWidth`
        823 at a 700px viewport with only three organisms before `minWidth: 0`/`overflowX` fixed it.
        SAVE adds ~70px of `flexShrink: 0` content to the side that must never shrink.

- [x] **Task 5 — The six deferred entries (AC6)**
  - [x] Settle `:371` first (the real tab-order assertion) — it is this story's own test.
  - [x] Settle `:229`, `:349`, `:353` with a decision each.
  - [x] Correct `:275` and `:329`'s stale premise (AC6's ⚠️) and either fix or re-defer with the
        corrected reachability. **Do not strike an entry through on a claim that is not true.**
        (Story 2.12's review found exactly that mistake in one of its own closure notes.)

- [x] **Task 6 — Tests**
  - [x] `EditorStatusBar.test.tsx`: SAVE present/named; disabled when `!isDirty`, enabled when dirty;
        `onSave` fires on click and on Enter; not fired while disabled; the converted `:83` absence
        assertion (keep its slider line); the real tab-order test; axe in ≥3 states.
  - [x] `BattleEditorView.test.tsx`: the converted `:140` line; `isDirty`/`onSave` reach the bar.
  - [x] `BattlePage.test.tsx`: the converted `:484` line and its `:477` count comment (the roster +
        UNDO + **SAVE** is now the complete set); a save on `/battle/new` calls `battles.save` once
        with a schema-valid record and a fresh uuid; a **second** save reuses the same id and bumps
        only `updatedAt`; a save on a loaded battle preserves `createdAt`; `isDirty` clears only
        after the promise resolves (`data-dirty` is the existing observable); the H.1 prune is
        visible end-to-end (a session-added organism is absent from the saved `organismIds`).
        ⚠️ Use the existing `findEditorCanvas` / `findRecording` helpers — this file has
        load-dependent timing (Story 2.12 trap 7).
  - [x] Quota path: a fake repository whose `battles.save` rejects with `QuotaExceededError`. Assert
        the message is shown, `isDirty` stays true, and the editor state is unchanged. ⚠️ **Do not
        edit `packages/test-utils/src/mockWorkspace.ts`** to get a fixture — it is asserted by its
        own tests and by the gallery e2e (Story 2.12 trap 8). `createFakeRepositories` returns an
        object whose methods can be `vi.spyOn`'d / replaced in the test file.
  - [x] `apps/web/e2e/battleRoute.spec.ts`: save on `/battle/new`, navigate to `/`, the tile is
        present, named, sorted first, and its **thumbnail reaches `ready`** (AC4 — the only check
        that proves the projection is loadable). Then re-open it and confirm the grid matches.

- [x] **Task 7 — Verification (AC8) — run these, report their real output**
  - [x] `npm run typecheck`
  - [x] `npm run lint`
  - [x] `npm run format:check`
  - [x] `npm run spec:check` — every ID cited in new code/docs must resolve. Spell them exactly
        (`AR-14`, `NFR-7.2`, `Decision H.1`, `Decision E.2`, `RFC-006`, `FR-7.8`, `M4`); a
        hyphenated `M-4` matches nothing and is silently exempt forever. ⚠️ "Reconciliation #3" is
        **not** a checked token and resolves to no section in this repo — see *Spec conflict
        surfaced*; cite `AR-9` / `RFC-006` instead.
  - [x] `npm run test:coverage` — report per-package counts. If Task 2's function lands in
        `packages/domain`, that package is under a **≥90% gate** (NFR-5.1).
  - [x] `npm run build:standalone`
  - [x] `npm run bundle:check` — gzip + headroom for `/`, `/battle`, `/battle/new` against AC8's
        baseline.
  - [x] `npm run e2e` — ⚠️ **kill anything bound to port 4173 first.** `playwright.config.ts` sets
        `reuseExistingServer: !process.env.CI`, and a stale `serve out` silently tests the wrong
        build. That invalidated an entire regression analysis in Story 2.12.
  - [x] `npm run ci` (the full gate, once, **unpiped** — `npm run ci | tail` reports *tail's* exit
        code and has already masked a real `format:check` failure in this repo).
  - [x] After pushing, `gh run list` — a local green gate is not proof CI is green.

- [x] **Task 8 — Records**
  - [x] Fill the Dev Agent Record: the five forced decisions with the option taken and why, the
        out-of-range-ref call from Task 2, the verification output, the File List.
  - [x] `docs/implementation-artifacts/sprint-status.yaml` → `2-13-save-battle: review`.

### Review Findings

Code review run 2026-08-28 (Sonnet, second pair of eyes on the Opus implementation). Three parallel
layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) plus direct verification of the H.1
prune / E.2 remap against the Dev Notes' worked example — confirmed correct, no findings against
the load-bearing projection logic.

- [x] [Review][Decision] **SETTLED by Sidiar, 2026-08-28: "Block all edits while `isSaving`."**
      Implemented as an EDIT LOCK on `savingRef` — the ref that already existed for save
      re-entrancy, now read by `handleNameChange`, `handleCommitGrid` and a new `handleUndo`
      wrapper, each returning early while a write is in flight. A ref rather than `isSaving` state
      is structural, not stylistic: `handleCommitGrid` must keep the stable identity `EditDish`'s
      resize effect closes over, and reading state would put `isSaving` in its dep list. The
      user-facing half is a real `disabled` attribute on SAVE (already present), UNDO
      (`!canUndo || isSaving`) and the name field (`<BattleNameField disabled>`, new prop);
      the canvas has no `disabled` attribute, so `handleCommitGrid`'s guard is the ONLY thing
      standing between a mid-write stroke and a falsely cleared dirty flag.
      Covered by five tests in `BattlePage.test.tsx` ("refuses every editor mutation while a write
      is in flight"), including that the lock LIFTS on both a resolved and a REFUSED write — a
      guard that never released would be worse than the bug it fixes. Mutation-checked: stripping
      the three guards fails the name and canvas tests. ⚠️ The undo test asserts the `disabled`
      attribute rather than bypassing it, because that IS the block for undo today; `handleUndo`'s
      own guard is belt-to-that-brace for Story 3.19's hotkeys, which bypass the button, and is
      NOT covered by a test — stated plainly rather than implied.
      Not chosen: snapshot-compare-before-clearing. It keeps the editor live during the write but
      leaves the user's edit in a state the store does not have, which is the same class of lie in
      a quieter form; blocking keeps `isDirty === false` a true statement about what is on disk.
      ~~Original finding:~~ `handleSave` clears `isDirty` unconditionally on success, even if the
      grid/roster/name were edited during the in-flight `await` — `BattlePage.tsx:608-655`. `grid`,
      `rosterIds`, `battleName` are captured by closure at call time; nothing besides the SAVE
      button is disabled while `isSaving` is true, so the canvas and name field stay editable
      during a save. An edit made during the `await` sets `isDirty(true)` via
      `handleCommitGrid`/`handleNameChange`; the resolving save's `setIsDirty(false)` then clobbers
      it, reporting "saved" for an edit that was never written. Not covered by any AC (AC4 only
      requires that a SECOND SAVE can't fire while one is in flight) and has more than one
      defensible fix (snapshot-compare identity before clearing vs. blocking all editing while
      saving), each with different UX cost — needs Sidiar's call, not a reviewer's guess.
      Independently found by both the Blind Hunter and Edge Case Hunter layers; confirmed by
      direct code reading.
- [x] [Post-review][Fix] `UndoButton`'s `transition` REMOVED, and the comment justifying it
      corrected — it claimed UNDO could safely cross-fade "because both states paint dark-on-dark,
      unlike SAVE". That is false: the disabled pair is `--gol-action-disabled` on
      `--gol-action-disabled-bg`, i.e. white@30% on white@12%, resolving to **#727272 on #353535 —
      2.54:1**. It never surfaced because axe EXEMPTS disabled controls from `color-contrast`, so
      the settled state is never scanned; on the disabled→enabled edge the button is already
      `enabled` in the DOM while its colours still sit near the disabled endpoint, and a scan
      landing there measures an ENABLED control at 2.54:1. Observed as a red
      `battleRoute.spec.ts:601` ("no axe violations on /battle/new after a drag") in a local full
      `npm run ci`, reporting exactly those two colours — the identical failure, from the identical
      cause, that cost SAVE its transition earlier in this story at 3.76:1.
      ⚠️ **Pre-existing, not introduced here** — that test involves no save, so
      `disabled={!canUndo || isSaving}` is a no-op in it. But this change makes UNDO's disabled
      state toggle on EVERY save rather than once at session start, which multiplies exposure to
      the hazard, so it is fixed here rather than deferred. ⚠️ Causation could not be proven by
      reproduction: 24 repeat-runs across all four Playwright projects pass both with and without
      the transition — it only surfaces under full-suite parallel load. The argument is
      arithmetic (the two animated endpoints are 2.54:1) plus the observed colours matching them
      exactly; removing the transition removes the hazard structurally rather than statistically.
      The rule for this bar is now that NEITHER button animates between a disabled and an enabled
      palette.
- [ ] [Review][Decision] "Reconciliation #3" spec conflict, surfaced by the dev in the Dev Agent
      Record — not resolved by this review per the run's own instructions. The epic AC's citation
      resolves to no section in this repo (`epics.md:692`, `component-tree-battle-page.md:112`,
      `RFC-006:268`, `RFC-001:399`). The substance is implemented (AR-9 / RFC-006 Decision 2: dense
      at rest, conversion in `apps/web`, repository port unchanged). Sidiar's call: correct the
      four citations to `AR-9` / `RFC-006 Decision 2`, or write the missing "Cross-RFC
      Reconciliations" section.
- [x] [Review][Patch] `UndoButton` silently lost its `&:hover:not(:disabled)` rule in the
      forced-decision-5 `barButtonBase` extraction [`EditorStatusBar.tsx:170-186`] — confirmed
      against `main` (which has the hover rule) and restored.
- [x] [Review][Patch] `battleDisplayName`'s `INVISIBLE_CHARACTERS` regex omits bidi isolates and
      embeddings (U+2066–U+2069, U+202A–U+202E) — a name built purely from those characters still
      renders blank but is not treated as empty, reproducing the bug `:349` exists to fix
      [`apps/web/lib/battleDisplayName.ts`]. Regex widened.
- [x] [Review][Patch] `saveFailureMessage`'s `CorruptDataError` copy told the user to "start a
      fresh workspace," an affordance that does not exist in the shipped app (no Settings/Clear UI)
      — the same category of issue the dev explicitly avoided for the Quota message
      [`apps/web/lib/saveFailureMessage.ts`]. Copy trimmed to match that discipline.
- [x] [Review][Patch] `deferred-work.md`'s new `/battle/new` reload entry understated the
      consequence — a reload resets `saveStamp` to `null` while `battleId` stays `'new'`, so the
      NEXT save after a reload mints a fresh uuid and writes a SECOND, independent battle to the
      Gallery, not just lost editor-session UI state [`deferred-work.md:376`]. Entry corrected.
- [x] [Review][Defer] `saveStamp` not reset when `battleId` changes on an already-mounted
      `<BattlePage>` — deferred, pre-existing family (already disclosed in `deferred-work.md`
      with corrected severity).
- [x] [Review][Defer] `projectBattleForSave`/`pruneAndRemapBattleGrid` double-allocate the dense
      grid per save — deferred, pre-existing (already disclosed in `deferred-work.md` with an
      explicit revisit trigger).
- [x] [Review][Defer] `computeEditorGridStats`'s fold and `pruneAndRemapBattleGrid`'s are mirrored
      rather than shared/called, a real deviation from forced decision 3's literal instruction —
      deferred, disclosed and reasoned, tracked with an explicit revisit trigger ("a THIRD fold").
- [x] [Review][Defer] No multi-tab / concurrent-write protection on `gol:battles` — deferred,
      pre-existing systemic localStorage limitation across the whole app, not introduced by this
      diff.
- [x] [Review][Defer] No test exercises `crypto.randomUUID()` being unavailable (non-secure
      context) — deferred, a deliberately-chosen documented tradeoff (forced decision 2) for a rare
      deployment condition.

Dismissed as noise (6): SAVE hover-state contrast already gated by the pre-existing
`themeTokens.test.ts` accentStates loop; two new e2e tests without console/pageerror tracking match
the file's own pre-existing convention (axe-only tests throughout skip this); the generic
save-failure fallback message for the randomUUID-unavailable path is a deliberate, documented
tradeoff; importing the `CorruptDataError`/`QuotaExceededError` error classes from `@gol/persistence`
into `apps/web` is explicitly permitted by AR-2/27 (which governs implementations, not error-class
taxonomies); `handleSave`'s `grid === null` guard is defensively unreachable (SAVE only renders
after the four early returns that gate on a loaded grid); `deferred-work.md`'s strikethrough-based
accumulation of corrections is a documentation-hygiene opinion, not an actionable defect.

## Dev Notes

### The one thing that makes this story dangerous: the prune shifts refs

`grid.occupant[i]` holds `roster index + 1` into **`rosterIds`** (RFC-006 Decision 2). The persisted
`gridState` holds `roster index + 1` into **`organismIds`**. Those are different arrays after a
prune, and nothing in the type system says so — both are `number`.

Worked example. `rosterIds = ['alpha', 'beta', 'gamma']`, and the user erases every `beta` cell:

| | before | after prune |
|---|---|---|
| roster | `['alpha','beta','gamma']` | `['alpha','gamma']` |
| `alpha` ref | 1 | 1 |
| `gamma` ref | **3** | **2** |

A projection that prunes `organismIds` and copies `occupant` verbatim writes `gamma`'s cells as `3`
into a two-entry roster. `BattleSchema.superRefine` catches that one (`v <= organismIds.length`), so
it fails loudly — which is the *lucky* case. Now erase every `alpha` cell instead: `beta` 2 → 1,
`gamma` 3 → 2, and the un-remapped cells still index **in range**. The record saves, loads, renders,
and every organism on the grid is the wrong one. No throw, no warning, a fully green suite.

This is the same failure family as Story 2.9 trap 2, Story 2.10 trap 1 and Story 2.12 trap 1, with
one difference: those repaint a screen, this one **writes the corruption to disk**.

Build the `oldRef → newRef` table explicitly and remap every cell through it. Test the shift by
asserting the saved record resolves back to the same **organism ids** per cell, not by asserting the
numbers.

### Duplicates in `rosterIds` are reachable, and the schema forbids them at rest

`BattleSummarySchema` is a bare `z.object` with no duplicate check, so an imported or hand-edited
record arrives with a repeated id, and `buildRosterIds` preserves it. `BattleSchema.superRefine`
**rejects** duplicates in `organismIds` (`:69-75`) — so the projection cannot pass them through. Fold
duplicate ids onto one slot and merge their cells, exactly as `computeEditorGridStats` already folds
them for the population count (forced decision 1a of Story 2.12, so the bar and the saved record
agree). A save is also the one moment this repo can *heal* that record.

### Where the projection lives

Two defensible homes, and `docs/project-context.md` points at the first:

> **Referential-integrity logic is core.** The delete guard, usage index, and rule-reference index
> keep their *pure* logic in `packages/domain` at ≥90%, even though they wire through persistence.

The H.1 prune and the E.2 remap are exactly that: invariants `BattleSchema.superRefine` already
encodes, on the entity `packages/domain` owns, and Story 5.8's atomic import will want the identical
remap. Against it: the input is `RenderableGrid`, which is declared in `apps/web`
(`renderableGrid.ts`'s own comment: `packages/simulation` "does not exist yet and does not own this
type until 3.3 lands"), and `packages/domain` must never import from `apps/web`.

Both can be true at once — see forced decision 3. `Uint8Array` is ES2022 and is fine in a package;
what is not fine is a `packages/*` file importing an `apps/web` type, or `dom` reaching
`tsconfig.base.json`.

### `isDirty`, the undo ring, and what a save does NOT do

A save is a **projection**, not a state transition on the editor. After it resolves, exactly one
thing has changed in `<BattlePage>`: `isDirty` is false (plus the remembered id on a first save).

- ❌ **No refetch.** Re-running `battles.load()` would rebuild `draft` → `seedGrid` → and
  `useUndoableGrid` **resets its ring when the seed changes** (`useUndoableGrid.ts:116`), so a
  refetch silently destroys thirty levels of undo to learn something the app already knows.
- ❌ **No re-seed of `rosterIds`.** The saved roster is pruned; the live one is not. Adopting the
  pruned order mid-session shifts every live ref and repaints the dish — the same corruption the
  section above describes, applied to the screen instead of the store.
- ❌ **No `sessionRoster` clear.** Decision H.2 makes those entries session state that dies on close;
  they are excluded from the *record*, not from the *session*. A user who added an organism, saved,
  and then wanted to paint with it would find it gone from the sidebar — and back in the add
  dropdown, which is worse than either.
- ❌ **Undo does not clear `isDirty`.** Already settled in Story 2.11 (`BattlePage.tsx:549-553`:
  "undoing to the seed is not the same as being saved"). Undoing back past a save leaves the battle
  dirty and that is correct.

### What NOT to build

- ❌ **No auto-save.** FR-8.11 / RFC-006 Decision 8 is a **default-Disabled** Edit-mode toggle, and
  the PRD makes it "inert until the Battle has been named/saved at least once (FR-7.8)". It is
  **Story 6.10**. No debounce, no timer, no "save on blur".
- ❌ **No unsaved-changes dialog, no `beforeunload`, no Back button** — Story 2.16 (FR-7.9/7.10).
  2.16's dialog CALLS this story's save handler; it does not live here.
- ❌ **No sparse conversion, no export envelope, no `WorkspaceSerializer`** — Epic 5. Dense at rest
  is the whole of AR-9 that this story touches.
- ❌ **No quota METER.** FR-8.2's usage figure is **Story 5.2**, in Settings. This story handles the
  failure, it does not predict it.
- ❌ **No resize, no Clear** — Stories 2.14 / 2.15. Persisting `gridSize` from the live grid (AC3) is
  the only anticipation of 2.14 that belongs here, and it costs nothing.
- ❌ **No "saved" toast / success confirmation** beyond `isDirty` clearing, unless forced decision 4
  chooses one deliberately. The disabled SAVE button *is* the success signal in the mockup.
- ❌ **No organism writes.** `repositories.organisms.save` is never called by this story;
  `BattlePage.test.tsx` already asserts it is not (`:1114-1130`).

### Forced decisions (record the option taken and why in the Dev Agent Record)

1. **What happens to the URL when `/battle/new` is saved?**
   (a) **Nothing.** `<BattlePage>` holds the minted id in state; the address bar keeps
   `/battle/new`; a reload loses the editor session but the battle is saved and reachable from the
   Gallery. (b) `router.replace('/battle?id=<uuid>')` — the URL becomes correct and reloadable, but
   `/battle/new` and `/battle` are **separate page files**, so this is a hard remount: the undo ring,
   `sessionRoster`, the tool selection and the retained renderer are all destroyed at the exact
   moment the user was told their work was safe. It also introduces `useRouter` — this codebase has
   none today (`CreateBattleLink.tsx` records that "the app has no `useRouter` anywhere"). (c)
   `window.history.replaceState` — rewrites the bar without a remount, but desyncs Next's own router
   state and is exactly the "reaching for `window.location`" the route file's comment warns off.
   **(a) is recommended.** The story's promise is that the work persists, and (a) delivers it with
   the least destruction; (b) trades a URL for the user's undo history. Record the URL gap as a
   `deferred-work.md` entry owned by Story 2.16 (which already owns navigation off this route) rather
   than leaving it unstated.

2. **How is the uuid minted, and is `crypto.randomUUID` guarded?**
   (a) Bare `crypto.randomUUID()`. (b) Guarded with a fallback for a non-secure context.
   **(a) is recommended**, with a comment naming the constraint: `localhost`, `https` and Playwright
   are all secure contexts, a fallback would be a hand-rolled v4 generator nothing tests, and the
   honest failure (a thrown TypeError surfacing through AC5's generic error path) beats a silent
   non-uuid that `BattleSchema.id`'s `z.uuid()` rejects on the next load. If you take (b), the
   fallback must produce a **schema-valid v4 uuid** and needs its own test.

3. **Where does the projection live, and does it reuse `computeEditorGridStats`?**
   (a) **All of it in `apps/web`** — one function beside `toRenderableGrid` in
   `lib/canvas/renderableGrid.ts`, or a new `lib/battleRecord.ts`. Smallest diff; `apps/web` is the
   wiring layer; no coverage gate. But it puts H.1/E.2 — referential-integrity logic — outside the
   package `project-context.md` assigns it to, and Story 5.8 will need it again.
   (b) **Split:** `packages/domain` owns a pure `pruneAndRemap(gridState: readonly (readonly
   number[])[], organismIds: readonly string[])` over the **at-rest shape it already owns**, and
   `apps/web` owns the `RenderableGrid → number[][]` densification (the literal inverse of
   `toRenderableGrid`, in the same file, sharing its validation stance). Two small functions, each in
   the package that owns its type, no dependency inversion, and 5.8 imports the domain half.
   (c) All of it in `packages/domain`, taking `occupant`/`width`/`height` primitives instead of
   `RenderableGrid`.
   **(b) is recommended.** It is the only option where neither package imports the other's type and
   the integrity logic sits where the ≥90% gate reaches it. ⚠️ Whichever you pick, do **not**
   duplicate `computeEditorGridStats`'s ref→id fold a third time — either call it, or extract the
   shared fold, and say which.

4. **Where does a save failure appear (AC5)?**
   (a) Inline in the status bar beside SAVE. Closest to the action — but the bar is the element Story
   2.12's review had to fix for horizontal overflow, and an arbitrary-length message on the
   `flexShrink: 0` side reopens exactly that. (b) A `role="alert"` line in the editor sidebar or
   above the bar, in flow, dismissed on the next successful save. (c) A modal dialog.
   **(b) is recommended**, and specifically **not (c)**: NFR-7.2 calls for a *non-destructive* report
   and a modal over an editor whose state is intact is a worse answer than a line of text.
   `role="alert"` (assertive) is right here in a way it was not for Story 2.12's stats — a failed
   save is an event the user caused and must not miss, not a passive summary.
   ⚠️ Whatever you choose, the message must state that **existing data is untouched** and, for the
   quota case, what to do about it. `QuotaExceededError`'s own message already says "Storage full —
   could not write … Export and remove a battle to free space"; decide whether to surface it verbatim
   (single source) or to write route-specific copy, and record why.

5. **Does SAVE share `UndoButton` or get its own primitive?**
   (a) A second `styled('button')` beside it. Duplicates ~15 lines of shared type/focus/disabled
   treatment, and the two can then drift. (b) Parameterise `UndoButton` with a `variant` prop and
   render the accent fill conditionally. One primitive, but a styled component with a behavioural
   prop is heavier than either call site needs. (c) Extract a shared base and compose both.
   **(c) or (a) are both defensible; (b) is not recommended** — a `variant` prop on a two-instance
   component is indirection with no second caller to justify it. Pick on measured bundle impact and
   say which; the headroom is 9.5 KB.

### Traps

1. **A save must leave `grid`, `rosterIds`, `sessionRoster` and the undo ring byte-identical.** See
   *`isDirty`, the undo ring, and what a save does NOT do*. The projection reads them; nothing writes
   back.
2. **`toDraft` hands out the LOADED battle's own arrays by reference** (`BattlePage.tsx:88-99`). The
   projection must build **new** arrays. `NewBattleDraft`'s `readonly` types stop a write made
   through the draft, but `deferred-work.md:229` records that `Battle`'s own arrays are still mutable
   — so `record.gridState = draft.gridState` typechecks and aliases the pristine loaded record.
3. **`createdAt` must survive an update.** `BattleSummarySchema` deliberately omits it
   (`battleSchema.ts:91-94`), so it is **not** on the summary the Gallery holds — read it from the
   loaded `Battle`, or from the value stamped at first save. Overwriting it with `new Date()` on every
   save is invisible in the UI (FR-7.3 renders `updatedAt` only) and silently wrong in every export.
4. **`updatedAt` must actually differ.** Two saves inside the same millisecond produce equal
   timestamps and `sortByLastModified` will not re-order. Not worth defending against in production;
   worth knowing before writing a test that saves twice and asserts the order flipped.
5. **Four absence tests become presence tests — convert, do not delete.** `EditorStatusBar.test.tsx:83`
   must keep its **slider** assertion (§9.1, still superseded) while its SAVE line inverts;
   `BattleEditorView.test.tsx:140` and `BattlePage.test.tsx:484` are the same story;
   `BattlePage.test.tsx:477`'s count comment names SAVE explicitly and needs rewording, not removing.
6. **Every hook precedes all four early returns in `<BattlePage>`.** The save state and handler are
   new hooks in a component that returns early four times.
7. **`battles.save` is a whole-collection read-modify-write.** Concurrent saves can lose one. Disable
   SAVE while a save is in flight (AC4), and remember `disabled` must be the real attribute.
8. **`createFakeRepositories` seeds are validated** (`fakeRepositories.ts#parseSeed`) — a fixture cast
   `as Battle` that violates `superRefine` throws at seed time, not at save time. That is a feature:
   it means a test cannot accidentally prove the projection works by seeding an invalid record.
9. **`npm run e2e` needs port 4173 free**, and `npm run ci` is not proof CI is green — check
   `gh run list` after pushing, and never pipe the gate's output.

### Spec conflict surfaced (do not silently pick one — this is the project rule)

**The epic AC's "dense `gridState` conversion happens inside the repository (Reconciliation #3)"
cannot be taken literally, and "Reconciliation #3" resolves to nothing in this repo.**

- `BattleRepository.save(battle: Battle)` takes a record whose `gridState` is **already**
  `number[][]` (`packages/domain/src/battleSchema.ts:29`). There is no conversion left for the
  repository to do. Honouring the sentence literally would mean widening the port to accept a
  `RenderableGrid` — an `apps/web` type — which inverts the dependency direction and breaks the
  DI seam the port exists for (AR-2/27).
- `architecture.md` has **no "Cross-RFC Reconciliations" section** (its headings run System Overview
  → Tech Stack → RFC Index → Package Structure → Runtime Architecture → Decisions A–K → Minor Spec
  Resolutions → Traceability → Scope → Follow-ups). The id is cited by `epics.md:692`,
  `component-tree-battle-page.md:112`, `RFC-006:268` and `RFC-001:399`, and `spec:check` does not
  tokenise it, so it has never failed a build.
- **The substance survives and is uncontested**: RFC-006 Decision 2 / **AR-9** — *"dense `gridState`
  at rest, sparse cells on the wire; conversion at repository/serializer boundaries"*. The
  dense/sparse boundary is Epic 5's serializer. What THIS story converts is the runtime
  **typed-array → at-rest dense** shape, which is an `apps/web` wiring concern and always was.
- **Recommendation:** implement the substance (dense at rest), cite `AR-9` / `RFC-006 Decision 2` in
  code, and record the discrepancy here rather than reshaping the port. Flag it to Sidiar in the Dev
  Agent Record — a citation that resolves to nothing is exactly the class of drift `spec:check`
  exists to catch, and this one is invisible to it.

### Testing standards summary

- Vitest + RTL for units; `@testing-library/user-event` **v14** for keyboard; `vitest-axe` for
  component-level a11y; Playwright + `@axe-core/playwright` for route-level.
- `apps/web` has **no coverage gate** (deliberate counter-metric); `packages/domain` has a **≥90%**
  floor (NFR-5.1). Do not write coverage-padding tests — they are rejected in review. The projection
  is pure and cheap to test properly; test the *behaviour* (which organism each surviving cell
  resolves to after a prune), not the line count.
- **Never pixel/snapshot-test the Canvas.** Nothing in this story needs to.
- Grid dimensions are parameters, never constants — build test grids at both editable presets, and
  never hardcode 100 × 60.
- Fixtures come from `@gol/test-utils`; **don't hand-roll a fake repo**, and don't edit
  `mockWorkspace.ts` (its battles are `MOCK_BATTLE_IDS.battleA` "Three-Way Skirmish" and
  `.battleB` "Grand Colony War", asserted by that package's own tests and the gallery e2e).

## Project Structure Notes

New (shape depends on forced decision 3):

- `packages/domain/src/battleProjection.ts` (+ `.test.ts`) — the H.1 prune + E.2 remap over the
  at-rest shape, re-exported from `packages/domain/src/index.ts`. **Under the ≥90% coverage gate.**
- `apps/web/lib/canvas/renderableGrid.ts` — gains the densifying inverse of `toRenderableGrid`
  (same file, same validation stance), or a new `apps/web/lib/battleRecord.ts` if the assembly step
  deserves its own module.

Updated:

- `apps/web/components/battle/BattlePage.tsx` — the saved-id / `createdAt` / in-flight / error state,
  `handleSave`, and the two new props on `<BattleEditorView>`.
- `apps/web/components/battle/BattleEditorView.tsx` — `isDirty` + `onSave` on
  `BattleEditorViewProps` (inputs, not derivations — unlike `stats`), forwarded to
  `<EditorStatusBar>`.
- `apps/web/components/battle/EditorStatusBar.tsx` — the SAVE button, its props, the doc comment's
  ❌-list.
- `apps/web/components/battle/EditorStatusBar.test.tsx`,
  `apps/web/components/battle/BattleEditorView.test.tsx`,
  `apps/web/components/battle/BattlePage.test.tsx` — four converted absence tests plus new coverage.
- `apps/web/components/battle/BattleNameField.tsx` (only if `deferred-work.md:353` is fixed rather
  than re-deferred).
- `apps/web/lib/battleDisplayName.ts` (only if `:349` is fixed rather than re-deferred — ⚠️ shared
  with the Gallery tiles and the delete dialog).
- `packages/domain/src/battleSchema.ts` (only if `:229`'s `readonly` widening is taken).
- `apps/web/e2e/battleRoute.spec.ts` — the save → Gallery → thumbnail round trip.
- `docs/implementation-artifacts/deferred-work.md` — six entries settled or corrected-and-re-deferred.
- `docs/implementation-artifacts/sprint-status.yaml`.

Conventions that apply and are easy to violate here:

- **Repositories are injected, never imported.** `<BattlePage>` already receives `repositories`;
  the save handler uses `repositories.battles.save`. ❌ Never import
  `LocalStorageBattleRepository`, never call `createRepositories()` below the page boundary
  (AR-2/27). The two error *classes* are a different thing — they are exported for callers to
  discriminate on, and importing them is the intended use.
- **No DOM types in `packages/*`** — `tsconfig.base.json` is `lib: ["ES2022"]`. `Uint8Array` is fine;
  an `apps/web` type import is not.
- `isolatedModules: true` — re-export types with `export type { … }`.
- Non-component TS files are **camelCase, never dotted** (`battleProjection.ts`, not
  `battle.projection.ts`).
- Cross-package imports use the package name (`@gol/domain`), never a relative path; `@/*` resolves
  inside `apps/web` only.
- **No raw hex** (AR-46, a live lint rule on `apps/web`) — SAVE's fill is `var(--gol-accent)` /
  `var(--gol-on-accent)` / `var(--gol-accent-hover)`.
- Comments explain **why**, not what; cite governing IDs exactly as the specs spell them —
  `spec:check` fails the build on an ID that resolves to nothing, and a hyphenated `M-4` matches
  nothing and is silently exempt forever.
- **Nothing reaches `main` without Sidiar's go-ahead**; a story branch may be pushed, merging is
  Sidiar's call.

## References

- [Source: docs/planning-artifacts/epics.md#Story 2.13: Save Battle] — the ACs.
- [Source: docs/planning-artifacts/epics.md#Additional Requirements] — **AR-9** (dense at rest,
  sparse on the wire, conversion at repository/serializer boundaries), **AR-14** (quota strategy),
  **AR-7** (BattleSchema superRefines), **AR-27/28** (no global store; `<BattlePage>` owns the dirty
  flag), **AR-30** (`useUndoableGrid`'s ring).
- [Source: docs/planning-artifacts/architecture.md#Decision H] — **H.1** ("Saving a battle **prunes**
  the roster: erasing an organism's last cell removes its entry at save, with the Decision E.2
  `gridState` remap"), **H.2** (unpainted dropdown entries are session state), **H.4**
  (`BattleSummary` shape).
- [Source: docs/planning-artifacts/architecture.md#Decision E] — **E.2** (`gridState` and
  `organismIds` "live on the same Battle entity and are remapped together on roster edits").
- [Source: docs/planning-artifacts/architecture.md#Decision G] — **G.1** (grid sizes are the H-9
  presets, as literals), **G.2** (structural integrity refined, not assumed), **G.3** (255 cap).
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 7] — the
  quota-exceeded path: "writes catch `QuotaExceededError` and surface a non-destructive message …
  the previous value is left intact and the operation reported as failed (**it also fails the
  dirty-flag clear, so the user keeps their unsaved indicator**)".
- [Source: docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md#Decision 8] —
  auto-save is a **default-Disabled Edit-mode toggle**, explicitly NOT this story (Story 6.10).
- [Source: docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md] — Decision 6 (one
  commit per gesture; the undo ring), the three state categories, Decision 7 (`beforeunload`, Story
  2.16).
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.1 `<BattlePage>`] — "save handler
  → `repositories.battles.save` … roster pruned to the placed set on save — H.1"; see *Spec conflict
  surfaced* for the rest of that line.
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.8 `<EditorStatusBar>`] —
  `onSave(): void; isDirty: boolean` (FR-7.8 — save affordance state).
- [Source: docs/planning-artifacts/component-tree-battle-page.md#3.3 `<BattleEditorView>`] —
  `isDirty: boolean; onSave(): void` listed as **props**, not derivations.
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#FR-7.8: Save Battle] —
  "Saves current Battle state (name, grid, organisms used)"; "Creates new Battle if first save,
  updates existing Battle if editing"; "Updates the Battle's last modified timestamp on each save".
- [Source: docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md#NFR-7.2 / NFR-7.3] — storage
  capacity and data integrity; the graceful quota path is the real backstop.
- [Source: docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html]
  — `.save-btn` CSS (`:608-624`), the bar's right group with UNDO (`:823`) and SAVE (`:824`), the
  superseded `.zoom-control` (`:818-822`).
- [Source: docs/implementation-artifacts/deferred-work.md] — the six entries naming this story
  (`:229`, `:275`, `:329`, `:349`, `:353`, `:371`); ⚠️ `:275` and `:329` rest on a premise this
  story's design falsifies (AC6).
- [Source: docs/implementation-artifacts/2-12-editor-status-bar-stats.md] — the bar's current shape,
  the `<RightGroup>` slot built for SAVE, the bundle baseline in AC8, the port-4173 e2e trap, and the
  ref/id/de-duplication traps this story's prune inherits.
- [Source: docs/implementation-artifacts/2-2-create-new-battle-gallery-wiring.md] — forced decision 5
  ("Does the draft carry an id?" — no; "2.13 inherits it").
- [Source: docs/project-context.md] — auto-loaded; repository injection, no-global-store, hot state
  in refs, grid-dimensions-are-parameters, "referential-integrity logic is core", AR-46, the commit
  gate and the verification rules all apply unchanged.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, `bmad-dev-story`)

### Debug Log References

Two real defects were found by the verification gate rather than by the unit suite, and both are
recorded in code beside the fix:

1. **The SAVE button's colour transition failed axe mid-fade.** `npm run e2e` failed 8 pre-existing
   Story 2.12 scans ("after a placement", "after a drag") on all four Playwright projects. A
   placement makes the battle dirty, which flips SAVE from disabled to enabled, and the axe scan
   that runs immediately afterwards measured the button **mid-transition at 3.76:1** (`#214147` on
   `#10a5c3`) against a 4.5:1 requirement. SAVE's two states are two DIFFERENT validated pairs
   (`--gol-on-accent`/`--gol-accent` and `--gol-action-disabled`/`--gol-action-disabled-bg`), so a
   cross-fade animates through pairs nothing validates and `themeTokens.test.ts` cannot see.
   Fix: SAVE carries no `transition`; UNDO keeps its, because both of ITS states are dark-on-dark
   and every intermediate frame stays legible. Recorded on `SaveButton` so it is not "restored for
   consistency" later.
2. **`page.addInitScript` wiped the saved battle on the next document load.** The new e2e navigates
   `/battle/new` → save → `/`, and this file's shared `seedWorkspace()` runs before EVERY document
   load and overwrites `gol:battles` unconditionally — so the Gallery came back with the two
   fixtures and no saved battle, with nothing naming the cause. Fix: a `seedWorkspaceIfFresh(page)`
   variant that writes only when `gol:schema` is absent, added as a SEPARATE helper so the three
   hand-synced `buildSeedPayload`/`seedWorkspace` copies stay byte-identical (deferred-work.md).

### Completion Notes List

**Forced decisions**

1. **URL on saving `/battle/new` — option (a), nothing changes.** `<BattlePage>` holds the minted id
   in state; the address bar keeps `/battle/new`. (b) `router.replace('/battle?id=…')` is a hard
   REMOUNT (the two are separate page files), destroying the undo ring, `sessionRoster` and the tool
   selection at the exact moment the user is told their work is safe — and it would introduce
   `useRouter`, which this codebase has nowhere; (c) `window.history.replaceState` desyncs Next's
   router state. The URL gap is recorded as a new `deferred-work.md` entry owned by **Story 2.16**,
   which already owns navigation off this route.
2. **uuid — option (a), bare `crypto.randomUUID()`**, with the secure-context constraint named in a
   comment. `localhost`, `https` and Playwright are all secure contexts. A hand-rolled fallback
   nothing tests could emit a non-uuid that `BattleSchema.id`'s `z.uuid()` rejects on the NEXT load —
   a save that appears to succeed and produces an unopenable battle. The honest failure (a
   `TypeError` surfacing through AC5's generic message) is strictly better.
3. **Projection placement — option (b), split.** `@gol/domain`'s `pruneAndRemapBattleGrid` owns the
   H.1 prune + E.2 remap over the at-rest `number[][]` shape that package already owns (100 %
   covered, ≥90 % gate); `apps/web`'s `projectBattleForSave` owns the `RenderableGrid → number[][]`
   densification and the identity/timestamp stamping. Neither package imports the other's type, and
   Story 5.8's atomic import imports the domain half. **On `computeEditorGridStats`: MIRRORED
   deliberately, not shared, and recorded as a deferred entry.** The two folds run over different
   shapes at different cadences — the stats fold walks a `Uint8Array` per COMMITTED GESTURE and
   yields counts; the projection fold walks the dense grid per SAVE and yields a ref remap. Sharing
   them would force the per-gesture path to allocate a dense `number[][]` it has no other use for,
   or force `packages/domain` to own a typed-array shape it must not own until Story 3.3. The
   deferred entry says to revisit at a THIRD fold.
4. **Save-failure surface — option (b).** A `role="alert"` line rendered in flow directly ABOVE the
   status bar by `<EditorMain>`, conditionally (so it announces on arrival), dismissed at the start
   of the next attempt. Not inside the bar (an arbitrary-length message on the `flexShrink: 0` side
   reopens the overflow the 2026-08-28 review measured), and not a modal (NFR-7.2 asks for a
   *non-destructive* report; a modal over an intact editor is worse than a line of text).
   **Copy is route-specific, not `QuotaExceededError.message` verbatim** — that message reads
   "Export and remove a battle to free space", and Export is Story 5.4 and does not exist yet, so it
   would name an affordance the user cannot find. Deleting a battle from the Gallery is what IS
   available today (Story 1.13). `saveFailureMessage.ts` carries the note to revisit when Epic 5
   ships export.
5. **SAVE vs UNDO — option (c), a shared style OBJECT (`barButtonBase`) spread into both.** Not (a)
   (duplicates the type/focus/disabled treatment and lets the two drift), not (b) (a `variant` prop
   on a two-instance component is indirection with no second caller), and not a `styled(Base)`
   composition (a real wrapper component in a chunk with 8.5 KB of headroom). A spread object costs
   nothing at runtime. ⚠️ The one thing NOT shared is the transition — see Debug Log 1.

**The out-of-range-ref call (Task 2).** A ref above `organismIds.length` is written as **0 — the
cell is dropped** — rather than refusing the save. It resolves to no organism, so there is nothing
to remap it to, and carrying it through would emit a record that fails its OWN schema
(`v <= organismIds.length`), i.e. a battle that stores and then cannot be re-loaded. It is only
reachable from an already-corrupt or hand-edited `gridState`, and such a cell is **already invisible
in the editor** (`groupByColourState` folds a ref past the palette to EMPTY), so dropping it makes
the stored record agree with what the user is looking at rather than losing something they can see.
**Not separately reported to the user:** `buildRefToFillGroup` already warns once per dangling id
(Decision I.4), and there is no action the user can take in the editor about a cell they cannot see.

**Error-state lifecycle (Task 3).** `saveError` is cleared at the **start** of every attempt, not
only on success. An identical message re-rendered in place would not re-announce through
`role="alert"`, so a second failure would be silent; unmounting the line first makes every attempt's
outcome audible. An ordinary EDIT does **not** clear it — the message is still true (the battle is
still unsaved), and clearing it on a keystroke would remove the only record of a failure that has
not been resolved.

**⚠️ Spec conflict — surfaced, not resolved unilaterally (for Sidiar).** The epic AC says the dense
`gridState` conversion "happens inside the repository (Reconciliation #3)". Implemented per the
story's recommendation — the substance (**AR-9** / RFC-006 Decision 2, dense at rest) with the
conversion in `apps/web`, and the port left alone. Two facts stand:
- `BattleRepository.save(battle: Battle)` already takes a record whose `gridState` is `number[][]`.
  There is no conversion left for the repository to do; honouring the sentence literally would mean
  widening the port to accept `RenderableGrid`, an `apps/web` type, which inverts the DI seam the
  port exists for (AR-2/27).
- **"Reconciliation #3" resolves to nothing in this repo.** `architecture.md` has no "Cross-RFC
  Reconciliations" section. The id is cited by `epics.md:692`, `component-tree-battle-page.md:112`,
  `RFC-006:268` and `RFC-001:399`, and `spec:check` does not tokenise it — so it has never failed a
  build and is invisible to the tool that exists to catch exactly this drift. **Sidiar's call**
  whether the four citations are corrected to `AR-9` / `RFC-006 Decision 2` or the missing section
  is written.

**Deferred work (AC6) — six inherited entries, all settled with evidence**

| Entry | Outcome |
|---|---|
| `:371` tab-order assertion | ✅ **Fixed** — a real `user.tab()` sequence (UNDO → SAVE → focus leaves the bar). |
| `:349` invisible-only names | ✅ **Fixed** — decision recorded: *a name that renders as nothing IS empty.* `battleDisplayName` strips U+00AD, U+200B–U+200F, U+2060, U+FEFF before `trim()`. DISPLAY only; the stored name stays raw. |
| `:353` silent 100-char cap | ✅ **Fixed** — the entry's own proposed shape: one polite `role="status"` rendered only at the cap. The counter stays `aria-describedby`-only. |
| `:229` mutable `Battle` arrays | ⏸ **Re-deferred, prediction corrected.** The save path did NOT need it: the projection allocates new arrays throughout and both modules test that mutating the RESULT leaves the inputs unchanged. Making the zod-inferred type readonly ripples through `replaceAll`/`listFull`/the fakes/`toDraft` — a `packages/domain` change under the ≥90 % gate for a hazard nothing trips. |
| `:275` stale stroke + `toolRef === null` | ⏸ **Re-deferred, premise CORRECTED.** The entry assumed 2.13's prune removes an organism from the LIVE roster. It does not — the prune is a save-time projection over a copy, so this path is exactly as unreachable as before. Re-pointed at the first story that genuinely SHRINKS the live roster mid-session. |
| `:329` `onAddToRoster` cap guard | ⏸ **Re-deferred, premise CORRECTED.** 2.13 gave `sessionRoster` no second writer at all; `onAddToRoster` is still the only one, and this story's test asserts the session-added organism SURVIVES a save. Re-pointed at whichever story gives it a genuine second writer. |

Four NEW entries were added under "Deferred from: Story 2-13-save-battle implementation": the
`/battle/new` URL gap (owned by Story 2.16), `saveStamp` joining the not-reset-on-`battleId` family
(with the note that its consequence is worse than the others' — a stale stamp would overwrite the
previous battle), the double dense allocation per save, and the mirrored-fold decision.

**Verification (Task 7) — actual output**

| Command | Result |
|---|---|
| `npm run typecheck` | ✅ 5/5 tasks |
| `npm run lint` | ✅ 0 errors (1 pre-existing `react-hooks/exhaustive-deps` warning in `useUndoableGrid.ts:248`, untouched by this story) |
| `npm run format:check` | ✅ all files |
| `npm run spec:check` | ✅ 154 cited ids resolve (162 sources, 31 authority docs) |
| `npm run test:coverage` | ✅ `@gol/domain` 6 files / **99 tests, 100 % stmts-branch-funcs-lines** (`battleProjection.ts` 100 %) · `@gol/persistence` 7/82 · `@gol/test-utils` 5/75 · `web` 48 files / **762 tests** |
| `npm run build:standalone` | ✅ 5/5 tasks |
| `npm run bundle:check` | ✅ `/` **326.8 KB** gzip (3.2 KB headroom, budget 330) · `/battle` **301.5 KB** (8.5 KB, budget 310) · `/battle/new` **301.5 KB** (8.5 KB, budget 310). No budget raised. |
| `npm run e2e` | ✅ **244 passed** (port 4173 cleared first) |
| `npm run ci` | ✅ exit 0, run unpiped to a file |

Bundle movement against Story 2.12's baseline: `/battle` and `/battle/new` **300.5/300.4 → 301.5 KB**
(≈ +1 KB for the SAVE button, the alert line, the projection and the save handler); `/` **326.6 →
326.8 KB** (the `battleDisplayName` widening). All three still inside budget.

⚠️ **A local green `npm run ci` is not proof CI is green** — check `gh run list` after the push.

### File List

**New**

- `packages/domain/src/battleProjection.ts`
- `packages/domain/src/battleProjection.test.ts`
- `apps/web/lib/battleRecord.ts`
- `apps/web/lib/battleRecord.test.ts`
- `apps/web/lib/saveFailureMessage.ts`
- `apps/web/lib/battleDisplayName.test.ts`

**Modified**

- `packages/domain/src/index.ts`
- `apps/web/components/battle/BattlePage.tsx`
- `apps/web/components/battle/BattleEditorView.tsx`
- `apps/web/components/battle/EditorStatusBar.tsx`
- `apps/web/components/battle/BattleNameField.tsx`
- `apps/web/lib/battleDisplayName.ts`
- `apps/web/components/battle/BattlePage.test.tsx`
- `apps/web/components/battle/BattleEditorView.test.tsx`
- `apps/web/components/battle/BattleEditorView.statsMemo.test.tsx`
- `apps/web/components/battle/EditorStatusBar.test.tsx`
- `apps/web/components/battle/BattleNameField.test.tsx`
- `apps/web/e2e/battleRoute.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/2-13-save-battle.md`

### Change Log

- 2026-08-28 — Story 2.13 implemented: the H.1 prune + E.2 remap projection (`@gol/domain`), the
  dense-at-rest conversion and save orchestration (`apps/web`), the SAVE button, the non-destructive
  save-failure alert, and six inherited `deferred-work.md` entries settled (three fixed, three
  re-deferred with corrected reasoning). Status → review.
- 2026-08-28 — Post-review: the concurrent-edit-during-save `decision-needed` finding settled by
  Sidiar ("block all edits while `isSaving`") and implemented as an edit lock on `savingRef`, with
  five regression tests. `UndoButton`'s transition removed alongside it — a latent 2.54:1 mid-fade
  the lock's more frequent disabled↔enabled toggling would have exposed far more often. Status
  UNCHANGED at review: the "Reconciliation #3" citation conflict is still open, and it is the
  remaining `decision-needed`.

Dev Model: opus   # first write path from the editor: the H.1 prune + E.2 ref-remap silently persists corruption when wrong, and the projection's package placement, new-battle identity, and save-failure surface are patterns 2.14/2.16/5.8/6.10 all inherit

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 26s | 26 | 2,740 | 15,362 | 522,309 | 540,437 |
| Step 1 — create-story | opus-5 | 1 | 10m 08s | 224 | 35,226 | 626,906 | 12,775,255 | 13,437,611 |
| Step 2 — dev-story | opus-5 | 1 | 35m 11s | 414 | 59,846 | 463,471 | 39,305,294 | 39,829,025 |
| Step 3 — code review + PR | sonnet-5 | 4 | 39m 19s | 1,058 | 47,387 | 1,402,610 | 64,861,307 | 66,312,362 |
| _of which the orchestrator_ | opus-5 | — | — | 70 | 11,466 | 53,942 | 1,646,720 | 1,712,198 |
| **Total (create-story → PR ready)** | | 6 | **1h 25m** | 1,722 | 145,199 | 2,508,349 | 117,464,165 | **120,119,435** |

Run started 2026-08-28 17:05 CEST; wall clock runs to the point the run stopped for Sidiar's review. Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
