---
baseline_commit: aa8ff8e
---

# Story 4.17: Edit Organism from Library

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to edit existing organisms with awareness of where they're used,
so that I change shared life forms deliberately.

## Acceptance Criteria

From `epics.md#Story 4.17: Edit Organism from Library` (`:1189-1200`), decomposed into what a reviewer
can check independently. AC5–AC11 are repo-derived: the obligations the code written FOR this story
by 4.2/4.3/4.8–4.16 imposes (every `Story 4.17` forward reference in `apps/web` — listed in the Dev
Notes' "What exists" table — is a promise this story keeps), the deferred-work entries addressed to
it (`deferred-work.md:753-757, 1443-1445, 1566-1567, 1631-1634, 2035-2048, 2366-2373`), and the CI
gates. **Read the Dev Notes' forced decisions FD1–FD10 before touching a file** — the three things
that can silently go wrong here (an edit that opens with no warning because the battle list was not
loaded; an edit that writes a SECOND organism instead of updating the one opened; an editor that
warns the organism about its own colour) are settled there.

1. **Every card carries an Edit action; a used organism is gated, an unused one opens directly.**
   `<OrganismCard>` renders a visible **"Edit"** button (accessible name `Edit <display name>`,
   `data-edit-organism-id="<id>"`) in a card-footer action row (mockup `.card-actions`/`.action-btn`,
   FD6) — on EVERY card, Conway's Classic included (M9 protects it from deletion, not editing;
   mockup `organism-library.html:440` renders its Edit enabled). Clicking it calls the Library's
   edit request with the organism. The Library computes `usedInBattles` — the number of DISTINCT
   saved battles whose `BattleSummary.organismIds` contains the id (Decision H: "used" = placed;
   FD1's `buildUsageIndex`) — and:
   - `usedInBattles === 0` → the editor opens directly, populated (AC3); no dialog.
   - `usedInBattles ≥ 1` → the **"Used in [N] Battle(s)"** warning opens FIRST (AC2), and the editor
     opens only if the user proceeds.
   The count is taken from the SAME loaded battle list the page holds (FD2) — never assumed `0`
   while that list is still loading: the Edit buttons render only in the Library's `'ready'`
   status, which now means BOTH lists are in hand.

2. **The in-use warning is a dialog with the PRD's copy and two actions.** `<OrganismInUseDialog>`
   (new, lazy, FD4): title **`Used in N Battle` / `Used in N Battles`** (`1 Battle`, `2 Battles` —
   the AC's "[N] Battle(s)" pluralised, never the literal "(s)"); body, verbatim from `prd.md:125`
   / `organism-editor-design.md:540` with the same pluralisation: **"This organism is used in N
   Battle(s). Editing it will affect all Battles that use it. Clone this organism first to create a
   Battle-specific variant?"**; actions in DOM order **Cancel** (`autoFocus`, first — the
   non-destructive action an immediate Enter hits, the house convention) then **Edit Anyway**
   (`variant="contained"`). Escape and backdrop are Cancel. **No Clone & Edit button in this story
   (FD5)** — it routes through Story 4.18's clone path, which is not on `main`; a button that does
   nothing is a dead affordance (NFR-4.1, the Story 4.2 FD1 rule), and Story 4.18 adds it. Cancel
   closes the dialog, nothing else changes, and focus returns to that card's Edit button. Edit
   Anyway closes the dialog and, once ITS exit transition has finished, opens the editor (AC3) —
   one modal on screen at a time (FD3). The `[N]` is plain text here; the FR-1.7 click-through to
   battle names is Story 4.20's.

3. **The editor opens fully populated, in the same shell, and edits in place.** With `organism`
   set (the new `Organism | null` lifecycle prop, FD7), `<OrganismEditorModal>`'s seed is
   `organismDraftFrom(organism, () => crypto.randomUUID())` (new, `organismDraft.ts`): `name`
   RAW as stored, `dominance`, `agingEnabled`, `colorToken`, and `survivalRules` in the record's
   order through `ruleDraftFrom` — the rule's own `id` KEPT (RFC-004 §2.4, never re-minted),
   `contentHash` dropped, each condition through `conditionDraftFrom` with a fresh editor-only id.
   Every field shows the record's value: the name field, the colour chip + swatch, the dominance
   slider AND textbox, the aging switch, one rule card per rule numbered in order with its
   conditions' property/operator/value(s) as stored. The title is still **"Organism Editor"** and
   the back label still `backLabelFor(origin)` — no UX doc specifies an edit-mode title
   (`organism-editor-design.md:118`). Nothing steals focus on mount (the `<RulesEditor>` /
   `<ConditionsEditor>` first-run guards written for this story hold): focus is wherever MUI's
   focus trap puts it, exactly as for a create. `saveStamp` initialises to `{ id: organism.id }`, so
   the FIRST Save in the session already upserts the opened organism (FD7) — `organisms.save()` is
   called with `record.id === organism.id`, `organisms.list()` afterwards has the SAME length, and
   the organism the card showed is the one that changed. `schemaVersion` is restamped
   `ORGANISM_SCHEMA_VERSION` (FD7 — the projection is unchanged). An UNCHANGED re-save is
   byte-identical: `projectOrganismForSave(organismDraftFrom(CONWAYS_CLASSIC, …), CONWAYS_CLASSIC.id)`
   deep-equals `CONWAYS_CLASSIC` (the ten pinned hashes reproduce; Story 4.16 AC7). The refusal
   branch, the outcome line, the alert line, the close-lock (Tasks 11–13 of 4.16) are byte-identical
   in behaviour for an edit session.

4. **Edit Anyway → save affects every battle placing it (FR-7.15); thumbnails reflect it on next
   render (M4).** Proven, not built: battles reference organisms by id, `<BattleGallery>` and
   `<BattlePage>` read `organisms.list()` at mount, and M4 thumbnails render on demand. The e2e
   (Task 10, test 3) edits a placed organism's name and colour, then visits `/` and finds the tile's
   organism dot under the NEW name. No battle record is written by an organism edit
   (`gol:battles` byte-identical across the whole flow).

5. **The Library refreshes on close, in place.** After the editor is closed (Back / Escape / ✕)
   following ≥ 1 save, the hook hands the last record on and the Library calls `reload()` (Story
   4.16 FD6 — stale-while-revalidate, no `'loading'` flash): the edited card shows the new
   name/colour/dominance/aging/rule count in `sortLibrary` position, the count badge reads the
   SAME total (an edit adds no card), and `organisms.list()` was called exactly twice (mount +
   reload). Focus lands on the edited organism's Edit button (FD9 — DOM lookup at restore time;
   the create button is the fallback when that button is gone).

6. **The organism under edit is excluded from its own library views (FD8).** With `organism` set,
   the modal derives `others = library.filter(o => o.id !== organism.id)` and passes THAT to
   `usersByColorToken` (the reuse warning) and to `<RulesEditor organisms>` (the organism-type
   dropdown). Opening an edit on an organism whose colour nobody else uses shows NO reuse warning
   (`deferred-work.md:1443-1445`'s exact failure, prevented); changing colour and picking the
   record's own colour back is silent too (`seedValue` is the record's token); picking a colour
   another organism holds warns as in 4.9. The organism-type dropdown lists every OTHER organism
   and never the one under edit (RFC-004 §2.1.1 — `organismType` names "a specific **other**
   organism"; the create flow has never listed self, so both modes agree). A seeded condition whose
   pattern is not in `others` (a self-reference, or an id the library no longer holds) renders as
   the existing `Unknown organism` option and still passes the gate (the Story 4.13 decision:
   accepted, flagged — not a repair, not an error). **When `others` is empty** (editing the sole
   organism — Conway's Classic in a fresh workspace, day one), the `Organism Type` `<option>` of
   every row's property `<select>` is `disabled`, so the unfixable `ORGANISM_REQUIRED` state
   (`deferred-work.md:2039-2043`) is unreachable through the UI; a seeded `organismType` row keeps
   rendering its value cell.

7. **The card's tab-stop policy is resolved (Story 4.2 FD5).** The `<article>` drops
   `tabIndex={0}`; the Edit button is the card's ONE keyboard stop; `aria-labelledby` stays on the
   article (it still names the region); `:focus-within` still lifts the card when its button is
   focused; `cursor: pointer` lives on the button only. The Story 4.2 keyboard tests
   (`OrganismLibrary.test.tsx` "tabs from the create button to the search input, then the first
   card…"; `organisms.spec.ts` "is keyboard-reachable from the search input to the card") are
   retargeted from the article to its Edit button — the ONLY pre-4.17 tests whose assertions
   change (the `OrganismCard.test.tsx` "is a keyboard-focusable tab stop named after the organism"
   case is replaced by the Edit-button case). Everything else in 4.1–4.16 stays green as written.

8. **The Library needs both repositories now (FD2, RFC-005 `:168-172`).** `<OrganismLibrary>` gains
   `battles: BattleRepository` (interface-typed, AR-2/AR-27), passed from
   `app/(gallery)/organisms/page.tsx`'s one `createRepositories()`; ONE `useAsyncResource` loads
   `Promise.all([organisms.list(), battles.list()])`. A rejecting `battles.list()` (whole-key
   corruption of `gol:battles` — `readCollection` is the only thrower; a bad RECORD is skipped by
   the repository) puts the Library in its existing `'error'` state. No `battles` reaches the
   modal (4.20's footer will need it; an unread prop is a lie — the Story 4.3 rule).

9. **The usage derivation is pure, in `@gol/domain`, and is the ONE source (FD1).**
   `packages/domain/src/usageIndex.ts` exports `buildUsageIndex(summaries): UsageIndex`
   (`ReadonlyMap<organismId, readonly battleId[]>`, RFC-005 Decision 8's own name) built from
   `Pick<BattleSummary, 'id' | 'organismIds'>[]` with no grid deserialization and no stored
   structure (AR-15, Decision H.4); an id repeated inside ONE summary's `organismIds` counts that
   battle once (`BattleSummarySchema` has no duplicate refine); battle ids appear in input order.
   Tested to 100% per file (the package's standing bar). This is Story 4.19's first AC landed
   early because it is this story's precondition; 4.19 extends the same module with the live-grid
   union (M7) and the rule-reference index (E.5) — nothing here pre-empts those.

10. **Isolation holds.** Cancel on the warning writes nothing; Back/Escape/✕ without Save writes
    nothing (`organisms.save` never called — the existing no-write pins stay as written, plus an
    edit-session one); the preview dish is not persisted; Story 4.18's Clone action and Clone &
    Edit, 4.20's footer/popover, 4.21/4.22's Delete, 4.23's dirty scope and 4.24's battle-origin
    edit are NOT started. No `?id=` on the URL — the editor is a modal, never a route (Decision
    K.5; 4-1's `:341` question is answered "no id rides the URL").

11. **Gates.** `npm run ci:dev` green (typecheck, lint, format, `spec:check`, `boundary:check`,
    coverage — `packages/domain` stays at 100% per file with the new module; `apps/web` reported
    only — `build:standalone`, `bundle:check` within every route's budget, bench, bench:check,
    Chromium e2e). axe passes on the Library with Edit buttons rendered, with the in-use dialog
    open and settled, and with the editor open on a seeded record. No new `--gol-*` token, no hex,
    no `transition` on the new button (FD6). Spec IDs written exactly as the specs spell them.

## Tasks / Subtasks

- [x] **Task 1 — the usage index (AC9, FD1)** — `packages/domain/src/usageIndex.ts` (+ `.test.ts`)
  - [x] `export type UsageIndex = ReadonlyMap<string, readonly string[]>;` and
        `export function buildUsageIndex(summaries: readonly Pick<BattleSummary, 'id' | 'organismIds'>[]): UsageIndex`
        — for each summary, for each id in `new Set(summary.organismIds)`, push `summary.id` onto
        the id's list (create on first sight). Pure, no class, no sorting (input order — the caller
        sorts if a display order matters). Head comment: Decision H / H.4 / AR-15 / RFC-005
        Decision 8 (the `Map<organismId, battleId[]>` derivation, "not a separately stored
        structure"); that this is Story 4.19's first AC landed in Story 4.17 because the FR-1.3 gate
        needs it, and that 4.19 adds the M7 live-grid union and the E.5 rule-reference index HERE.
        `Pick<…>` so a test can pass minimal literals and `BattleSummary` still assigns to it.
  - [x] Export from `packages/domain/src/index.ts` (value + `export type { UsageIndex }` —
        `isolatedModules`).
  - [x] Tests (a) two summaries sharing an id → that id maps to both battle ids, in input order;
        (b) an organism in no summary → `get` is `undefined` (the caller reads `?.length ?? 0`);
        (c) `['a', 'a']` inside one summary → one entry for that battle (dedupe); (d) `[]`
        summaries → an empty map; (e) the mock workspace: `buildUsageIndex(createMockBattles())`
        gives `mock-aggressive-colonizer` → both battle ids and `conways-classic` → `[battleB]`
        only (pins the fixture the e2e seeds from). 100% per file.

- [x] **Task 2 — the seed (AC3, FD7)** — `apps/web/lib/organisms/organismDraft.ts` (+ `.test.ts`)
  - [x] `export function organismDraftFrom(organism: Organism, nextId: () => string): OrganismDraft`
        — `{ name: organism.name, dominance, agingEnabled, colorToken, survivalRules:
        organism.survivalRules.map((rule) => ruleDraftFrom(rule, nextId)) }`. Pure; `nextId` is
        the condition-id source (`ruleDraftFrom`'s contract) — never `crypto` in here. Docblock: the
        inverse of `projectOrganismForSave` minus `id`/`schemaVersion`; rule ids kept; the header's
        "Story 4.17 seeds the whole draft from a loaded `Organism` in one assignment" promise, kept.
        Update the header (`:11-12`) and `createNewOrganismDraft`'s docblock (`:40-41`) from future
        to present tense.
  - [x] Tests: (a) `organismDraftFrom(CONWAYS_CLASSIC, nextId)` — scalars equal the record's, two
        rules in order with the record's ids, each condition carrying an id from `nextId` (count the
        calls: exactly the number of conditions), `contentHash` absent from every rule; (b) the
        **round-trip identity** (the load-bearing one): for `CONWAYS_CLASSIC` and every
        `createMockOrganisms()` record, `await projectOrganismForSave(organismDraftFrom(o, nextId), o.id)`
        `toEqual(o)` — ids, hashes, order, `schemaVersion` all reproduce, so an unchanged re-save
        cannot fork rule identity; (c) a numeric range condition round-trips (`[2, 3]` → `['2','3']`
        → `[2, 3]`); (d) a name with trailing whitespace seeds raw.

- [x] **Task 3 — the modal's edit mode (AC3, AC6, FD7, FD8)** —
  `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (+ `.test.tsx`)
  - [x] `OrganismEditorLifecycleProps` gains `organism: Organism | null` — docblock: "`null` is a
        create; a record is an edit session on THAT organism. Held by `useOrganismEditorModal` for
        the whole mount (through the exit fade — the `<DeleteBattleDialog>` `confirming` lesson) and
        read ONCE here, at mount, for the seed." Import `organismDraftFrom`.
  - [x] `seed`: `useState(() => organism === null ? createNewOrganismDraft(library.map(…)) :
        organismDraftFrom(organism, () => crypto.randomUUID()))`. Rewrite the `:292-299` comment:
        the initialiser is impure only in the edit branch (condition ids), which is fine for a lazy
        initialiser — React keeps ONE result and `draft` is initialised from `seed`'s VALUE, so the
        two cannot disagree (unlike an updater, `:383-384`).
  - [x] `saveStamp`: `useState(organism === null ? null : { id: organism.id })`. Update the
        `:324-327` comment: an edit session is stamped from mount, so its first Save is already an
        upsert of the opened organism, and `saveOrganism`'s `if (saveStamp === null)` guard is
        simply never true for it. `schemaVersion` restamp: one sentence in the same comment citing
        FD7 (`projectOrganismForSave` is untouched).
  - [x] `others`: `const others = organism === null ? library : library.filter((o) => o.id !== organism.id);`
        (per render, unmemoised — the same measurement as `usersByColorToken`); `usersByColorToken(others)`;
        `<RulesEditor organisms={others}>`. Update the `library` prop docblock (`:83-90`), the
        `:341-343` comment and `<ColorPickerField>`'s "Followers" line (`ColorPickerField.tsx:69-70`)
        to present tense; `colorReuse.ts:11-12`'s "the caller excludes" is now literally true —
        leave it.
  - [x] Head comment (`:244-282`): one paragraph on the edit session — seeded from `organism`,
        `saveStamp` from mount, self-excluded from the two library views, everything else
        identical; "(Story 4.17)" in the trailing id list.
  - [x] Tests (`OrganismEditorModal.test.tsx`): `mountModal` gains `organism?: Organism | null`
        (default `null` — every existing call is unchanged) and passes it. A fixture
        `EDITED = createMockOrganisms()[0]` (Aggressive Colonizer: `agingEnabled`, dominance 80,
        rules with cellState/neighborCount conditions — check the fixture and pick one with ≥ 2
        rules and a range condition if it exists) mounted with `library: [EDITED, ...others]`.
        New `describe('edit organism from library (Story 4.17)')`:
        (37) fields populated: name textbox value, colour chip name = the token's display name,
        dominance slider `aria-valuenow` AND textbox value, aging switch `aria-checked`, `Rule 1…N`
        groups in order, `Condition 1 property/operator/value` selects/textboxes with the stored
        values; the title is still "Organism Editor"; `[data-save-outcome]` absent;
        (38) no focus stolen on mount: after `mountModal({ organism: EDITED })`,
        `document.activeElement` is NOT inside any rule card or condition row (the first-run guards);
        (39) Save with NO edits → `organisms.save` called once with an argument `toEqual(EDITED)`
        (the round-trip through the real wire — hash, ids, `schemaVersion` reproduce);
        `(await organisms.list()).length` unchanged; `onSaved` called with that record;
        (40) rename + Save → `save` called with `id === EDITED.id`, the new name, `list()` length
        unchanged and `list()` holds the new name under the SAME id; a SECOND Save in the same
        session → `save` called twice, both with `EDITED.id`;
        (41) self-exclusion, colour: mount with `EDITED` the only holder of its token → no
        `[data-color-reuse-status]` text on open; pick another swatch then the original back →
        still silent; make a second organism share `EDITED`'s token → picking a THIRD colour and
        then the shared one warns with the OTHER organism's name only (never `EDITED`'s);
        (42) self-exclusion, dropdown: a seeded `organismType` row's `<select>` options never
        include `EDITED.id`/name; every other library organism is listed;
        (43) `Unknown organism`: seed a record whose `organismType` pattern is `EDITED.id` (self)
        → the value select shows the `Unknown organism` option selected; Save is NOT refused
        (positive control: `save` called);
        (44) `others` empty: mount `{ organism: CONWAYS_CLASSIC, library: [CONWAYS_CLASSIC] }`,
        add a rule and a condition → the property select's `organismType` option is `disabled`,
        the other four are enabled (Task 5);
        (45) `errorTargetSelector` with seeded ids (the 4.13 defer, `deferred-work.md:2035-2038`):
        seed a record whose rule id is `r"1\` (a quote and a backslash — legal `string().min(1)`)
        with an `age eq 3` condition; clear the value textbox; Save → focus is ON that textbox
        (`CSS.escape` path pinned end to end);
        (46) axe on the seeded editor.

- [x] **Task 4 — the in-use dialog (AC2, FD4, FD5)** — `apps/web/components/organisms/OrganismInUseDialog.tsx` (+ `.test.tsx`)
  - [x] Props `{ open: boolean; usedInBattles: number; onCancel(): void; onEditAnyway(): void; onExited?(): void }`.
        Composed EXACTLY like `<UnsavedChangesDialog>` (`UnsavedChangesDialog.tsx:61-133`): per-component
        MUI imports (AR-35), `PAPER_MAX_WIDTH = '440px'`, `BUTTON_SX`, `onClose={onCancel}` (no
        `pending` guard — nothing asynchronous runs from this dialog until Story 4.18 adds Clone &
        Edit, which brings `pending`), `onTransitionExited={onExited}`, `disableRestoreFocus`,
        `aria-labelledby`/`aria-describedby`. Title `battleCountLabel(usedInBattles)` = `Used in N Battle`
        / `Used in N Battles`; body the PRD sentence with `N Battle`/`N Battles` interpolated
        (export the two pure formatters for the tests; `overflowWrap` not needed — no user text).
        Buttons: Cancel (`autoFocus`, `color="inherit"`, `variant="outlined"`) then Edit Anyway
        (`variant="contained"`). Head comment: FR-1.3 / M7 / UX-DR6 lineage; WHY two buttons (FD5 —
        Clone & Edit is 4.18's, NFR-4.1); the battle variant (4.24) is the same two buttons, so no
        `origin` prop yet.
  - [x] Tests: (a) title/body for 1 and 2 (pluralisation, the exact sentence); (b) Cancel → `onCancel`
        once, `onEditAnyway` never; (c) Edit Anyway → the reverse; (d) Escape → `onCancel`;
        (e) Cancel is focused on open; (f) axe.

- [x] **Task 5 — the empty-others guard (AC6)** — `apps/web/components/organisms/editor/ConditionRow.tsx`
  (+ `.test.tsx`)
  - [x] In the property `<select>` (`:246-263`): `<option … disabled={property === 'organismType' && organisms.length === 0}>`.
        Comment: the 4.13 review's unfixable `ORGANISM_REQUIRED` (`deferred-work.md:2039-2043`) —
        reachable only when the organism under edit is the sole library entry (Story 4.17's
        library-minus-self); a disabled option keeps a seeded `organismType` row's current value
        selectable-as-is and merely stops a switch INTO the property.
  - [x] Test: with `organisms={[]}` the option is disabled and a seeded `organismType` row still
        renders its (unknown) value; with one organism it is enabled. Strike the deferred entry.

- [x] **Task 6 — the hook: `requestEdit` and the gate (AC1, AC2, AC5, FD3, FD9)** —
  `apps/web/lib/organisms/useOrganismEditorModal.ts` (+ `.test.tsx`)
  - [x] Result gains `requestEdit(organism: Organism, usedInBattles: number): void`,
        `gateMounted: boolean`, `gateProps: OrganismInUseDialogProps` (`import type` from the dialog
        module — erased, same reason as the modal's, `:17-27`). `modalProps` gains `organism`.
  - [x] State: `const [editing, setEditing] = useState<Organism | null>(null)` — set by
        `requestEdit`, cleared in `handleExited` (after the fade, never at close). `const [gate, setGate]
        = useState<{ organism: Organism; usedInBattles: number } | null>(null)` (mounted window) +
        `const [gateOpen, setGateOpen] = useState(false)` (the fade) — the two-cell shape again. A
        `proceedRef = useRef<Organism | null>(null)`: Edit Anyway stashes the organism; the gate's
        `onExited` consumes it and opens the editor.
  - [x] `restoreFocusRef` becomes `useRef<{ kind: 'create' } | { kind: 'edit'; organismId: string } | null>(null)`.
        `requestCreate` sets `{ kind: 'create' }`; `requestEdit` sets `{ kind: 'edit', organismId }`.
        The restore effect looks up `[data-edit-organism-id="${CSS.escape(id)}"]` for `'edit'`,
        falling back to `[data-create-organism]` when it finds nothing — the
        `useDeleteBattleDialog` trigger/fallback idiom (`DeleteBattleDialog.tsx:239-262`).
  - [x] `requestEdit(organism, usedInBattles)`: set the restore target; if `usedInBattles === 0` →
        `setEditing(organism); setMounted(true); setDialogOpen(true)`; else → `setGate({ organism,
        usedInBattles }); setGateOpen(true)`.
  - [x] Gate handlers: `handleGateCancel = () => setGateOpen(false)`; `handleGateEditAnyway = () =>
        { proceedRef.current = gate.organism; setGateOpen(false); }`; `handleGateExited = () => {
        const next = proceedRef.current; proceedRef.current = null; setGate(null); if (next !== null)
        { setEditing(next); setMounted(true); setDialogOpen(true); } }` — all four `setState`s in
        ONE handler, so the union below never dips to `false` between the gate and the editor.
  - [x] `useInertBackground(mounted || gate !== null)` — ONE call, ONE restore map (FD3's reason).
        The focus effect's dep becomes the same union (`const anyMounted = mounted || gate !== null`;
        effect keyed on `[anyMounted]`, early-return while it is true).
  - [x] `gateProps = useMemo(() => ({ open: gateOpen, usedInBattles: gate?.usedInBattles ?? 0,
        onCancel, onEditAnyway, onExited }), …)`; `gateMounted = gate !== null`. `modalProps` adds
        `organism: editing`.
  - [x] Head comment: the gate lives HERE (not a sibling hook) because two `useInertBackground`
        calls hold two restore maps and unwind in call order — the gate's cleanup would un-inert
        the background under a still-open editor; the sequential handoff (gate exits fully, then
        the editor mounts) keeps `mounted` meaning "the EDITOR is on screen" and fetches the editor
        chunk only when the user proceeds. Update the `requestCreate` docblock (`:36`).
  - [x] Tests (`useOrganismEditorModal.test.tsx`; the `Probe` gains an Edit button per organism
        of a small `LIBRARY` carrying `data-edit-organism-id`, a `usedIn` map, mounts
        `<OrganismInUseDialog {...gateProps}>` on `gateMounted`, passes `organism` through):
        (a) `requestEdit(o, 0)` → editor mounted+open, `modalProps.organism === o`, no gate;
        (b) `requestEdit(o, 2)` → `gateMounted`, gate open with `usedInBattles === 2`, editor NOT
        mounted (`screen.queryByRole('dialog', { name: 'Organism Editor' })` null);
        (c) Cancel → gate closes; after `onExited` `gateMounted` false, focus on THAT organism's
        Edit button, the editor never mounted;
        (d) Edit Anyway → gate `open` false while still mounted; editor NOT mounted yet; after the
        gate's `onExited` → gate unmounted, editor mounted+open with `organism === o`;
        (e) the background stays inert across (d) — `isInert(background)` true before, during and
        after the handoff (the existing `appendBackground` rig);
        (f) after (d), Back on the editor → after its `onExited`, focus on the Edit button of `o`;
        (g) when that button is gone (unmount the Probe's card), focus falls back to the create
        button; (h) `modalProps.organism` is `null` after `requestCreate`, and `editing` is cleared
        only after `onExited` (`modalProps.organism` still the record while `open` is false);
        (i) `modalProps`/`gateProps` identities are stable across an unrelated re-render (append to
        the existing stability test).

- [x] **Task 7 — the card (AC1, AC7, FD6)** — `apps/web/components/organisms/OrganismCard.tsx` (+ `.test.tsx`)
  - [x] Props gain `onRequestEdit(): void` (the `<BattleTile>` `onRequestDelete(): void` contract —
        the card knows nothing about usage). `CardActions = styled('div')` (`display: flex`,
        `gap: 8px`, `marginTop: 16px` — mockup `.card-actions` `:309-312`); `EditButton =
        styled('button')` from `.action-btn` (`:314-332`) with the house substitutions:
        `border: 1px solid var(--gol-border-control)` (SC 1.4.11 — `BattleTile.tsx:112-127`'s
        reason), `flex: 1`, `background: transparent`, `color: var(--gol-text-primary)`, `padding:
        10px 14px`, `fontSize: 12px`, `fontWeight: 600`, `textTransform: uppercase`,
        `letterSpacing: 0.5px`, `cursor: pointer`, `fontFamily: inherit`, hover `borderColor:
        var(--gol-accent)` + `background: var(--gol-bg-hover)` + `transform: translateY(-1px)`,
        `:focus-visible` ring, reduced-motion `transform: none`; **NO `transition`** (the mockup's
        `all 0.2s` is the `<CreateButton>` trap on this very page, `OrganismLibrary.tsx:88-95`).
        Render `<CardActions><EditButton type="button" aria-label={`Edit ${display.name}`}
        data-edit-organism-id={organism.id} onClick={() => onRequestEdit()}>Edit</EditButton></CardActions>`
        after `<RulesLine>`; `RulesLine` loses nothing. Clone and Delete are NOT rendered.
  - [x] Remove `tabIndex={0}` from `<Card>`; keep `aria-labelledby`; rewrite the FD5 comment
        (`:15-18`) and the "No `cursor: pointer`" paragraph (`:36-38`) — decided here.
  - [x] Tests: replace "is a keyboard-focusable tab stop named after the organism" with: the
        article is NOT focusable (`tabIndex` absent), the Edit button is, its accessible name is
        `Edit <name>` (and `Edit Unnamed organism` for the whitespace name), it carries
        `data-edit-organism-id`, a click calls `onRequestEdit` once; the SYSTEM card renders Edit
        enabled; axe with the button. Every existing `render(<OrganismCard …/>)` gains
        `onRequestEdit={vi.fn()}` (mechanical).

- [x] **Task 8 — the Library (AC1, AC5, AC8, FD1, FD2, FD9)** — `apps/web/components/organisms/OrganismLibrary.tsx` (+ `.test.tsx`)
  - [x] Props gain `battles: BattleRepository`; `page.tsx` passes `repositories.battles`. Replace
        the `:212-214` "No `battles` prop yet" paragraph.
  - [x] `const resource = useAsyncResource(() => Promise.all([organisms.list(), battles.list()]), [organisms, battles, seedStatus]);`
        `const [loadedOrganisms, summaries] = resource.data ?? [[], []];` (typed — no `any`);
        `sorted = sortLibrary(loadedOrganisms)`; `const usage = useMemo(() => buildUsageIndex(summaries), [summaries])`
        (`summaries` is referentially stable between loads — `resource.data` is one object per
        settle). Comment WHY one resource and not RFC-005 `:307-313`'s separate `useOrganismUsage`
        sketch: `'ready'` must mean both lists are in hand, or an Edit clicked before the battle
        list settles reads `0` and opens a used organism unwarned (FD2); why no `.catch` on
        `battles.list()` (FD2 — the alternative and its cost are in the story's Open flags).
  - [x] `const OrganismInUseDialog = dynamic(() => import('./OrganismInUseDialog'), { ssr: false });`
        beside the modal's `dynamic()`, same reasons (the MUI Dialog stack stays out of the first
        load; a closed dialog is never in the first paint).
  - [x] `const { requestCreate, requestEdit, mounted, modalProps, gateMounted, gateProps } = useOrganismEditorModal('library', { onSaved });`
        and `const onRequestEdit = useCallback((organism: Organism) => requestEdit(organism, usage.get(organism.id)?.length ?? 0), [requestEdit, usage]);`
        — `<OrganismCard … onRequestEdit={() => onRequestEdit(organism)} />`. Mount
        `{gateMounted && <OrganismInUseDialog {...gateProps} />}` beside the editor mount.
  - [x] Tests (`OrganismLibrary.test.tsx`): every `render(<OrganismLibrary …/>)` gains
        `battles={battles}` from the SAME `createFakeRepositories({ organisms, battles })` call
        (mechanical — destructure both; a fresh fake per test). The Story 4.2 keyboard test
        retargets its two card stops to the cards' Edit buttons (AC7). The "never calls
        save/delete/replaceAll while searching" pins add `battles.list` called exactly once.
        New `describe('edit organism from library (Story 4.17)')` with `createMockWorkspace()`
        (three organisms, two battles — Aggressive Colonizer is in both) plus one UNUSED organism
        (`{ ...CONWAYS_CLASSIC, id: 'unused-glider', name: 'Glider' }` — Conway's Classic itself is
        placed in battle B):
        (a) an unused organism's Edit → the editor dialog opens directly, name field reads the
        record's name, no in-use dialog ever appeared (`queryByRole('dialog', { name: /Used in/ })`
        null);
        (b) a used organism's Edit → `Used in 2 Battles` dialog (title AND the body sentence with
        `2 Battles`); the editor is NOT open; `organisms.save` not called;
        (c) Cancel → the dialog leaves; focus on that card's Edit button; the editor never mounted;
        (d) Edit Anyway → the warning leaves, THEN the editor opens (assert the editor is absent
        while the warning is still in the DOM, present after it is gone) populated with the record;
        (e) rename + Save → `[data-save-outcome]`; Back → the card shows the NEW name in
        `sortLibrary` position, the count badge reads the SAME `4 Organisms` on the SAME node,
        `organisms.list` called exactly twice, `battles.list` exactly twice, `organisms.save` once
        with `id === EDITED.id`; focus on the renamed organism's Edit button;
        (f) `battles.list` rejecting (`vi.spyOn(...).mockRejectedValue(new CorruptDataError('gol:battles', 'x'))`)
        → the existing `role="alert"` error copy, no cards, no Edit buttons;
        (g) Conway's Classic (SYSTEM) has an Edit button and, being placed in battle B, gates with
        `Used in 1 Battle`;
        (h) axe with the in-use dialog open (after its fade — `waitFor` the `autoFocus`ed Cancel)
        and with the seeded editor open.
  - [x] `page.test.tsx`: unchanged assertions; add one line — the page renders Edit buttons once
        ready (the wiring proof that `battles` reached the Library).

- [x] **Task 9 — docs bookkeeping in code comments** (no behaviour)
  - [x] Present-tense the forward references this story fulfils: `ruleDraft.ts:60-61, 159-162`,
        `conditionDraft.ts:343`, `RulesEditor.tsx:27, 282, 288`, `ConditionsEditor.tsx:27`,
        `OrganismEditorModal.tsx:87, 229, 298-299, 343`, `useOrganismEditorModal.ts:36`,
        `organismDraft.ts:11, 40-41`, `OrganismCard.tsx:13-18, 36-38`, `ColorPickerField.tsx:69-70`,
        `previewOrganism.ts` / `PreviewPanel.tsx` (only if they say "4.17 will"). Do NOT reword
        `colorReuse.ts:11-12` (already true) or `ruleContentHash.ts:26` (already true).

- [x] **Task 10 — e2e (AC1–AC7, AC11)** — `apps/web/e2e/organisms.spec.ts`
  - [x] Seeding: copy `buildSeedPayload`/`seedWorkspace` from `deleteBattle.spec.ts:10-42`
        VERBATIM with the same "copied, keep in sync" comment (the standing extraction entry,
        `deferred-work.md:199, 231`, fires only for a story touching more than one spec's seeding —
        this one touches one; record the fifth copy against that entry), plus a
        `seedExtraOrganisms(page)` init script registered AFTER it (the `battleRoute.spec.ts:62`
        `seedConwaysClassic` precedent) that merges `CONWAYS_CLASSIC` and `{ ...CONWAYS_CLASSIC,
        id: 'unused-glider', name: 'Glider' }` into `gol:organisms` — Conway so M9 holds on the
        page, Glider as the unused case.
  - [x] New block `test.describe('edit organism from library (Story 4.17)')` after the 4.16 block,
        reusing `openEditor`'s settle idiom (a local `openEditFor(page, name)` that clicks
        `getByRole('button', { name: `Edit ${name}` })` and waits for whichever dialog follows):
        1. **unused opens directly** — Glider's Edit → the `Organism Editor` dialog, settled; the
           name textbox reads `Glider`; no `Used in` dialog; zero console errors.
        2. **used is gated; Cancel** — Aggressive Colonizer's Edit → `getByRole('dialog', { name:
           'Used in 2 Battles' })`, body text contains "used in 2 Battles" and the clone sentence;
           Cancel is focused; press Escape → gone; the editor never appeared; `gol:organisms` and
           `gol:battles` byte-identical.
        3. **Edit Anyway → populated → edit → propagates (AC3, AC4, FR-7.15)** — Edit Anyway → the
           editor (settled) with name `Aggressive Colonizer`, dominance textbox `80`, the aging
           switch reflecting the fixture, `Rule 1..N` groups matching the fixture's rule count and
           `Condition 1 property` of rule 1 reading the stored property; rename to
           `Aggressive Colonizer v2` and pick a different swatch (the 4.8 e2e's pick idiom) → Save →
           `[data-save-outcome]` → Back → the card `Aggressive Colonizer v2` visible, the badge
           unchanged in count, `gol:organisms` parsed holds the id `mock-aggressive-colonizer` ONCE
           with the new name and `schemaVersion === 1`, and `gol:battles` byte-identical →
           `page.goto('/')` → the `Grand Colony War` tile's `getByRole('img', { name: 'Aggressive
           Colonizer v2' })` visible (the `gallery.spec.ts:218` locator).
        4. **unchanged re-save is byte-identical** — Conway's Classic (SYSTEM, placed in battle B
           → `Used in 1 Battle`) → Edit Anyway → Save with no edits → Back → `gol:organisms`'s
           `conways-classic` record `toEqual` the pre-flow record (hashes reproduce end to end).
        5. **focus** — after 3's Back, the `Edit Aggressive Colonizer v2` button is focused
           (Chromium/Firefox; WebKit: not inside a dialog — the standing branch).
        6. **keyboard** — Tab from the search input reaches the first card's Edit button (the
           retargeted 4.2 test), Enter opens the gate/editor.
        7. **axe** — with the in-use dialog settled (`.MuiDialog-container` opacity 1, the
           `openEditor` measurement) and with the seeded editor settled.
        Retarget the Story 4.2 "is keyboard-reachable from the search input to the card" test to
        the Edit button (AC7).
  - [x] `npx playwright test e2e/organisms.spec.ts --project=chromium` first, then `npm run ci:dev`.
        `lsof -i :4173` before starting.

- [x] **Task 11 — docs, bundle, status (AC11)**
  - [x] `deferred-work.md`: strike as `✅ Closed in Story 4.17` — `:753-757` (tab-stop policy),
        `:1443-1445` (library minus self), `:1566-1567` (seed strips hash, keeps ids),
        `:1631-1634` (dropdown excludes self — decided), `:2039-2043` (empty-organisms option
        disabled), `:2366-2373` (restamp policy — decided: restamp); annotate `:2044-2048`
        (dangling id: accepted, not repaired) and `:2035-2038` (seeded-record `errorTargetSelector`
        test landed) as closed. Add `## Deferred from: Story 4-17-edit-organism-from-library
        (<date>)` with: (1) Clone & Edit not rendered — 4.18 adds it with `pending` on the dialog;
        (2) the `[N]` in the warning is plain text until 4.20's popover; (3) the Library's error
        state now covers a corrupt `gol:battles` with organism-worded copy — Story 5.11 owns the
        copy; the graceful alternative (catch → `null` → Edit withheld) recorded; (4) the fifth
        e2e seed-helper copy; (5) self-reference renders `Unknown organism` — the 4.14 `selfId`
        adapter note still stands for the preview; (6) `buildUsageIndex` is 4.19's AC1, landed
        here — 4.19 extends `usageIndex.ts`; (7) the 4.9-review duplicate-name sentence
        (`:1455-1465`) was NOT picked up (this story does not touch the sentence).
  - [x] Bundle: `npm run build:standalone && npm run bundle:check`; record all five routes.
        `/organisms` first load gains the Edit button, `buildUsageIndex`, the second `dynamic()`
        boundary and the hook's growth — expect ≤ 1.5 KB gzip against 9.3 KB of headroom; the
        editor chunk grows by `organismDraftFrom` + the branch; the in-use dialog is a NEW lazy
        chunk (name it and its size). If any route moves more than ±0.5 KB beyond that, say why.
  - [x] `sprint-status.yaml`: `4-17-edit-organism-from-library: in-progress` at start, `review` at
        the end; Dev Agent Record with every command and its actual exit code.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — The usage count is `buildUsageIndex` in `@gol/domain`, landed now (Story 4.19's first
  AC), not an inline count in the Library.** Three candidates: (i) `summaries.filter((s) =>
  s.organismIds.includes(id)).length` inline in `<OrganismLibrary>` — two lines, but
  project-context says referential-integrity logic (the delete guard, the usage index) keeps its
  pure logic in `packages/domain` at ≥ 90%, and Story 4.20 demands ONE derivation across the edit
  warning, the delete error and the footer; an inline count is the second implementation the
  moment 4.19 lands. (ii) Reorder 4.19 before 4.17 — the owner's board, not this story's. (iii)
  Land the one pure function 4.17 needs under the name RFC-005 Decision 8 already gave it
  (`buildUsageIndex`, `:307-313`), in the module 4.19 will extend. (iii) it is: ~15 lines, 100%
  covered, no grid deserialization (H.4). The M7 live-grid union is NOT needed from the Library
  (no open battle exists on `/organisms`) and stays 4.19's.

- **FD2 — The Library loads both lists in ONE `useAsyncResource` (`Promise.all`), uncaught.**
  RFC-005 `:168-172` gives the Library both repositories; its `useOrganismUsage` sketch
  (`:307-313`) is a SEPARATE resource, which leaves a window in which `resource.status === 'ready'`
  (organisms loaded) while the battle list is still pending — an Edit clicked there reads `0` and
  opens a placed organism without the warning, silently. One resource makes `'ready'` mean both.
  Why no `battles.list().catch(() => [])` (the `<BattleGallery>` `organisms.list().catch` idiom):
  a swallowed rejection is the SAME silent `0`; `battles.list()` rejects only on whole-key
  corruption of `gol:battles` (`localStorageAccess.ts:80-88` — a bad record is skipped by
  `list()`), the condition that already blanks the Gallery today, and Story 5.11 owns load-time
  corruption UX. The graceful alternative (catch → `null` → Edit buttons withheld with an
  explanation nobody has written) is in the Open flags.

- **FD3 — The in-use gate lives in `useOrganismEditorModal`, and the editor opens only after the
  gate has fully exited.** Two hooks each calling `useInertBackground` hold two restore maps that
  unwind in call order: the gate's cleanup (its map recorded "prior: not inert") would set the
  background back to non-inert while the editor — whose map recorded "prior: inert" — is still
  open. One hook, one `useInertBackground(mounted || gate !== null)`. Sequential rather than
  stacked (the editor opening over the fading gate): the AC says the warning fires "before the
  editor opens"; `mounted` keeps its single meaning ("the EDITOR is on screen") for the lazy-chunk
  fetch, the inert window and the focus restore; and a Cancel never fetches the editor chunk. The
  cost is the gate's ~195 ms fade before the editor's fade-in — Story 4.23's dialog OVER the
  editor is a different case (it must stack) and does not follow this shape.

- **FD4 — The dialog is `<OrganismInUseDialog>`, a lazy sibling of the editor, composed like
  `<UnsavedChangesDialog>`.** It cannot be a static import (the MUI Dialog stack is +18.1 KB
  gzip; `OrganismLibrary.tsx:16-30`); a second `dynamic()` boundary costs a few hundred bytes on
  the first load and shares MUI with the editor chunk at bundle time. Not rendered from inside the
  editor chunk (the gate opens BEFORE the editor exists). Copy is the PRD's sentence verbatim with
  real pluralisation — "Battle(s)" is spec shorthand, not UI text (the count badge's
  `Organism`/`Organisms` precedent). Title = the AC's own name for the warning.

- **FD5 — Clone & Edit is Story 4.18's; this dialog ships Cancel / Edit Anyway.** 4.18 owns
  "[Name] (Copy)", the colour reuse, the uncapped-by-palette rule and the repository write;
  building it here either duplicates 4.18 or ships a button that does nothing (NFR-4.1, the Story
  4.2 FD1 rule this page already applied to Edit/Clone/Delete). The two-button dialog is exactly
  FR-3.12 / PRD `:127`'s battle variant, so it is spec-backed, not invented. 4.18 adds the third
  button (`onCloneAndEdit`, `pending` while the clone writes) and the hook's `proceedRef` already
  carries "which organism to open" — a clone just stashes the new record instead.

- **FD6 — The card's edit action is the mockup's visible "Edit" text button, and the article
  stops being a tab stop.** `organism-library.html:437-442` is a `.card-actions` row of Edit /
  Clone / Delete; only Edit ships (4.18/4.22 add theirs to the same row). The Story 4.2 FD5
  article-as-stop was explicitly provisional ("Story 4.17 decides"): a stop wrapping a stop is
  legal but noisy, so the button is the one stop and the article keeps its name. No `transition`
  (the page's `<CreateButton>` records the mid-fade axe trap); `--gol-border-control` for the
  boundary (SC 1.4.11 — `BattleTile.tsx:112-127`). The pencil `✎` is the battle roster's
  affordance (4.24, `petri-dish-lab-mode.html:668`), not the card's.

- **FD7 — Edit mode is `organism: Organism | null` on the lifecycle props, seeded through
  `organismDraftFrom`, with `saveStamp` from mount and `schemaVersion` RESTAMPED.** The hook must
  own the record (it persists through the exit fade — an emptied record would re-seed nothing, but
  the `mounted` gate keeps the modal alive for ~195 ms after close; the `<DeleteBattleDialog>`
  `confirming` lesson), so it rides `modalProps`. `saveStamp` is the seam Story 4.16 left for
  this exact purpose (`deferred-work.md:2366-2373`): seeded with `organism.id`, every Save is an
  upsert of the opened organism through the unchanged `saveOrganism`. `schemaVersion`: Decision
  I.4 defines it as a STAMP of the shape a record was written in; the projection ends in
  `OrganismSchema.parse`, which proves the written record IS the current shape, so the current
  constant is the only honest stamp — "keep" would preserve a stale stamp on a record that no
  longer has that shape once a future `formatVersion` step has migrated the field set. Both are
  `1` today; the choice matters only after Story 5.7's registry exists, and 5.7 should read this.
  `projectOrganismForSave` is untouched.

- **FD8 — Self-exclusion happens in the modal, from the `organism` prop, for BOTH library
  views.** The forward references say "the caller passes the library minus the organism under
  edit"; the modal IS the caller of `usersByColorToken` and `<RulesEditor>`, and it is the
  component that knows `organism`, so the Library keeps passing `sorted` unchanged (one prop, one
  meaning). The dropdown excludes self because RFC-004 §2.1.1 defines `organismType` as "a specific
  **other** organism" and the create flow never lists self; a persisted self-reference is legal
  (`alive`-equivalent) and renders through the existing `Unknown organism` option — accepted, not
  repaired, not blocked (the 4.13 review's dangling-id item, `:2044-2048`: the engine compiles an
  unresolvable id to a never-matching predicate, so nothing breaks; a save-time rewrite would
  silently change a rule). The empty-`others` case disables the property option (Task 5) rather
  than hiding the row kind — a seeded `organismType` row must keep its value cell.

- **FD9 — Focus restores to the edited card's Edit button by DOM lookup at restore time.** The
  `useDeleteBattleDialog` idiom (`DeleteBattleDialog.tsx:239-262`): never a captured element
  (WebKit does not focus a `<button>` on click), `CSS.escape` on the id (schema `string().min(1)`,
  `'conways-classic'` and the mock ids are not uuids), fallback to `[data-create-organism]` when
  the button is gone. A rename re-sorts the grid; React keys `<li>` by `organism.id`, so the node
  survives and the lookup finds it.

- **FD10 — Nothing else in the modal changes.** The refusal branch, the write path, the close-lock,
  the outcome/alert lines, the preview panel, the `structuralSize` un-stick (its initial value is
  now the seeded size — `prevStructuralSizeRef` already initialises from the first render) are
  untouched. No dirty scope (4.23), no footer (4.20), no Delete (4.21/4.22), no `battles` prop on
  the modal.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx` | **Modified.** Lifecycle props (`:59-80`), `library` docblock (`:82-90`), `seed`/`draft` (`:292-303`), `saveStamp` (`:324-328`), `usersByToken` (`:341-344`), `saveOrganism`'s `saveStamp?.id ?? crypto.randomUUID()` (`:454`) and `if (saveStamp === null)` (`:462`), `<ColorPickerField seedValue>` (`:649-654`), `<RulesEditor organisms>` (`:669-675`). `errorTargetSelector` (`:231-242`) — `CSS.escape` already. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` | **Modified.** `mountModal` (`:51-77`), the `LIBRARY` fixture, the 4.16 block's `save`/deferred-promise idioms (`:973-1712`), the 4.9 `[data-color-reuse-status]` scoping. |
| `apps/web/lib/organisms/useOrganismEditorModal.ts` (+ `.test.tsx`) | **Modified.** Two-cell lifecycle (`:75-76`), `restoreFocusRef` (`:86`), `pendingSavedRef`/`onSavedRef` (`:91-99`), `useInertBackground(mounted)` (`:105`), the focus effect (`:119-133`), `requestCreate`/`handleClose`/`handleSaved`/`handleExited` (`:135-173`), `modalProps` (`:175-184`). ⚠️ `import type` only from the modal module (`:5-8`, the `:17-27` reason) and from the new dialog module. The test's `Probe` (`:57-79`), `appendBackground`/`isInert` (`:36-48`). |
| `apps/web/components/organisms/OrganismLibrary.tsx` (+ `.test.tsx`) | **Modified.** The `dynamic()` import and its reasons (`:16-30`), props (`:32-35`), the "No `battles` prop yet" paragraph (`:212-214`), `useAsyncResource` (`:222`), `onSaved`/`reload` (`:233-241`), the hook call (`:247-251`), `sorted`/`visible` (`:271-276`), the card map (`:331-336`), the modal mount (`:347-349`). Tests: the per-test `createFakeRepositories`, the 4.16 block's `saveStatusRegion`/`fillValidDraft` (`:520-545`), the keyboard test (`:270`), the no-write pins (`:221, :486`). |
| `apps/web/components/organisms/OrganismCard.tsx` (+ `.test.tsx`) | **Modified.** FD1/FD5 comments (`:8-18`), the `Card` styles and "No `cursor: pointer`" (`:30-63`), `RulesLine` (`:132-136`), props (`:160-167`), `tabIndex={0}` (`:182`). |
| `apps/web/app/(gallery)/organisms/page.tsx` (+ `.test.tsx`) | **Modified (one prop).** `createRepositories()` once (`:19`), `<OrganismLibrary organisms=… seedStatus=…>` (`:25`). |
| `apps/web/components/organisms/editor/ConditionRow.tsx` (+ `.test.tsx`) | **Modified (one attribute).** The property `<select>` (`:246-263`); the organism-type value cell and `Unknown organism` (`:172-190`). |
| `apps/web/lib/organisms/organismDraft.ts` (+ `.test.ts`) | **Modified (one function).** Header (`:7-22`), `createNewOrganismDraft` docblock (`:26-42`) — the "4.17 does not call this factory" promise. |
| `apps/web/lib/organisms/ruleDraft.ts:159-169` | `ruleDraftFrom(rule, nextId)` (`:163-169`) — written for this story: keeps the rule id, drops the hash, ids conditions from `nextId`. `parseRuleDraft` (`:149-157`) — the inverse. |
| `apps/web/lib/organisms/conditionDraft.ts:343-380` | `conditionDraftFrom(condition, id)` — numbers to decimal text, ranges to text pairs; the `Unknown organism` reasoning is in `ConditionRow`. `OrganismOption` (`:31`). |
| `apps/web/lib/organisms/organismRecord.ts` | `projectOrganismForSave(draft, id)` — **unchanged**; the round-trip test (Task 2 b) proves seed ∘ project = identity. |
| `apps/web/lib/organisms/colorReuse.ts:1-19` | `usersByColorToken` — "the caller excludes the organism under edit (Story 4.17)". |
| `apps/web/components/organisms/editor/ColorPickerField.tsx:69-70, 282-307` | `seedValue` — the "never warns" comparison; the Followers line to present-tense. |
| `apps/web/components/organisms/editor/RulesEditor.tsx:270-300`, `ConditionsEditor.tsx:20-40, 84-90` | The first-run focus guards written for a seeded list; `CSS.escape` on rule ids; `defaultOrganismId = organisms[0]?.id ?? ''`. |
| `apps/web/components/battle/UnsavedChangesDialog.tsx` | **The dialog to copy** — three-action shape, guarded `onClose`, `PAPER_MAX_WIDTH`, Cancel-first `autoFocus`, `disableRestoreFocus`, `onTransitionExited`. |
| `apps/web/components/gallery/DeleteBattleDialog.tsx:174-320` | `useDeleteBattleDialog` — the two-cell + `focusAfterExitRef` + DOM-lookup restore idiom (`:239-262`), the in-flight latch; the `useInertBackground` placement comment (`:201-208`). |
| `apps/web/lib/useInertBackground.ts` | WHY one call per window (the `restore` map, `:35-51`); the `MutationObserver` that sweeps a body child appended while active — the editor's Modal appearing after the gate is swept by the SAME observer. |
| `apps/web/components/gallery/BattleTile.tsx:89-154, 276-360, 474-482` | `TileActions`/`actionChrome` (`:112-154`, the house action-button substitutions), the organism `Dot` with `label={organism.name}` (`:474`) — the e2e propagation locator. |
| `apps/web/lib/useAsyncResource.ts` | `data: T | undefined`, branch on `status` first (`:28-31`); `reload()` (`:54-62`); deps fixed-length. |
| `packages/domain/src/battleSchema.ts:82-103` | `BattleSummarySchema` — `organismIds` is the placed set, NO duplicate refine (why Task 1 dedupes). |
| `packages/domain/src/index.ts` | Export both the value and `export type { UsageIndex }`. |
| `packages/persistence/src/repositories.ts:16-50`, `localStorageBattleRepository.ts:40-52`, `localStorageAccess.ts:80-88` | `BattleRepository.list()` "for the Gallery and the AR-15 usage index (Decision H.4)"; a bad record is skipped; `readCollection` is the only thrower. `OrganismRepository.save` is a keyed upsert (`localStorageOrganismRepository.ts:11-16`). |
| `packages/test-utils/src/mockWorkspace.ts:15-25, 165, 284-320` | `MOCK_ORGANISM_IDS` (non-uuid ids — the `CSS.escape` case for real), `createMockOrganisms()`, `createMockBattles()` (A: three mocks; B: three mocks + Conway), `createMockWorkspace()`. |
| `packages/test-utils/src/fakeRepositories.ts:77` | `createFakeRepositories({ organisms, battles })` — both fakes from one call. |
| `apps/web/e2e/organisms.spec.ts:1-51, 2836-3060` | `openEditor`, the hoisted helpers, the 4.16 block (`fillValidDraft`, `countBadge`, `back`, the `localStorage` read idiom, the WebKit focus branch). `deleteBattle.spec.ts:10-42` — the seed helpers to copy; `battleRoute.spec.ts:62` — the layered init-script precedent; `gallery.spec.ts:218` — the dot locator. |
| `docs/implementation-artifacts/deferred-work.md:199, 231, 753-757, 1443-1445, 1455-1465, 1566-1567, 1631-1634, 2035-2048, 2116-2122, 2314-2373` | The seed-helper extraction rule; every entry addressed to this story (listed in Task 11). |
| `docs/implementation-artifacts/4-16-create-save-organism.md` (AC3, FD4, FD6, FD9, Tasks 11–13, Review Findings) | `saveStamp`, the close-lock, `reload()`, the review's test-strength lessons. |
| `docs/implementation-artifacts/4-2-organism-card-grid.md` (FD1, FD5), `4-3-editor-modal-shell.md` (FD2, `:219-220`), `4-9-*.md` (FD2, `:451-453`), `4-11-*.md` (`:727-731, 864-870`), `4-13-*.md` (`:631-641`) | The promises this story keeps, in their original words. |
| `docs/planning-artifacts/epics.md:35, 39, 109, 174, 201, 230-231, 1189-1238` | FR-1.3, FR-1.7, FR-7.15, AR-15, AR-33, UX-DR5/6, Stories 4.17–4.20. |
| `docs/planning-artifacts/architecture.md:222-236, 263-274, 276-287, 350-353` | Decisions E, H, I; M4, M5, M7. |
| `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:159-172, 303-323` | The state tree (both repositories to the Library) and Decision 8 (`buildUsageIndex`). `RFC-004:395-402` — §2.1.1 self vs other. `RFC-001:66-74` — by-id references, `BattleSummary`. |
| `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:123-127, 476-480` | FR-1.3's exact copy and the two variants; FR-7.15. |
| `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:13-15, 24-38, 118, 537-544` and `clinical-lab-theme/organism-library.html:309-349, 404-442` | The edit entry point, the warning's options, the unchanged title, the card action row's CSS and markup. |
| `docs/implementation-artifacts/lane-gates.yaml` | No gate on 4.17; this story proposes none. |

### Architecture compliance

- **AR-2 / AR-27 / RFC-001 §1** — `battles` reaches `<OrganismLibrary>` as an interface-typed
  prop from the page boundary's single `createRepositories()`; the card, the dialog and the hook
  import no repository; the modal's only side effect is still `organisms.save()`. Test: swapping to
  an API repository edits no component.
- **AR-15 / Decision H / H.4 / RFC-005 Decision 8** — usage derives from `BattleSummary.organismIds`
  via `list()`, no grid deserialization, no stored structure; "used" = placed. **M7** — the count
  is informational here; the delete block is 4.21's. **M4** — thumbnails on demand: propagation is
  free.
- **Decision E.1 / RFC-004 §2.4** — rule ids are stable across edits; `organismType` patterns stay
  library ids; the hasher reproduces unchanged rules byte-for-byte. **Decision I.4 / AR-11** —
  `schemaVersion` restamped from the named constant, never branched on.
- **M9** — Conway's Classic is editable, not deletable; nothing here writes a NEW id for it.
  **Decision K.5** — no route, no `?id=`; the editor is a modal.
- **RFC-005 Decision 1 / AR-33** — `editing`, `gate`, `gateOpen` are ephemeral UI state in the hook;
  the draft stays in the modal; no store, no Context. The editor's dirty scope is still 4.23's.
- **RFC-003 Decision 3 / Decision J / AR-46 / AR-35** — `styled()` + `var(--gol-*)`; no new token;
  no `transition` on the new button; per-component MUI imports; a second `dynamic()` boundary.
- **Zod at boundaries** — the seed is a projection of an already-parsed record (no re-parse); the
  save parses once (unchanged).
- **Spec-id hygiene** — `spec:check` tokenises `FR-1.3`, `FR-1.6`, `FR-1.7`, `FR-3.12`, `FR-7.15`,
  `NFR-4.1`, `AR-2`, `AR-11`, `AR-15`, `AR-27`, `AR-33`, `AR-35`, `AR-46`, `RFC-001`, `RFC-003`,
  `RFC-004`, `RFC-005`, `Decision E`, `Decision H`, `Decision I`, `Decision J`, `Decision K`, `M4`,
  `M7`, `M9`, `Story 4.2`, `Story 4.3`, `Story 4.9`, `Story 4.13`, `Story 4.16`, `Story 4.17`,
  `Story 4.18`, `Story 4.19`, `Story 4.20`, `Story 4.21`, `Story 4.22`, `Story 4.23`, `Story 4.24`,
  `Story 5.7`, `Story 5.11`; write them exactly so. `UX-DR*`, `FD*`, `AC*` are not checked.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — a lazy `useState` initialiser runs once per mount (twice under StrictMode, one
  result kept); `crypto.randomUUID()` inside it is fine because nothing else observes the discarded
  run. Four `setState`s in one event handler batch into one commit — `handleGateExited` relies on
  that to keep the `inert` union true across the handoff.
- **MUI `Dialog` v9** — `onTransitionExited` fires once per close; two dialogs are never open at
  once in this story, so no stacking concerns; `autoFocus` on Cancel is honoured by the focus trap.
- **Next 16 `dynamic()`** — a second `dynamic(() => import(...), { ssr: false })` in the same
  component is an independent chunk; webpack hoists modules shared with the editor chunk into a
  common async chunk — neither lands in the route's first load (the gate measures first load).
- **`CSS.escape`** — global in the `dom` lib and in jsdom; used for `data-edit-organism-id`
  lookups because ids are arbitrary non-empty strings.
- **Testing Library** — `getByRole('dialog', { name: 'Used in 2 Battles' })` resolves through
  `aria-labelledby`; `within(dialog)` for the buttons. The gate→editor sequence needs the gate's
  `onTransitionExited` to fire — in jsdom MUI's transitions complete via timers, so
  `await screen.findByRole('dialog', { name: 'Organism Editor' })` after Edit Anyway is enough;
  assert the editor's ABSENCE while `queryByRole('dialog', { name: /Used in/ })` is still present.
- **Playwright 1.62** — `getByRole('button', { name: 'Edit Aggressive Colonizer' })` (exact,
  `aria-label`); the tile dot is `getByRole('img', { name })`; init scripts run in registration
  order (`seedWorkspace` then `seedExtraOrganisms`).

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: an unwarned edit of a
  placed organism (Library b, hook b), a second organism written on an edit (modal 39/40 — the
  load-bearing ones), a forked rule hash on an unchanged re-save (organismDraft b, e2e 4), a
  self-collision colour warning (modal 41), a stolen focus on mount (modal 38), a gate that
  un-inerts under the editor (hook e), a restore that lands on `<body>` (hook f/g), an edit that
  adds a card (Library e), a battle write from an organism edit (e2e 3), an unfixable
  `ORGANISM_REQUIRED` (modal 44).
- `packages/domain` **stays at 100% per file** — the new module is one function plus five tests.
  `packages/persistence`, `packages/simulation`, `packages/test-utils` **untouched**.
- Never snapshot; never assert computed colours in jsdom; never run axe mid-transition; never
  click a disabled option to prove it is inert (assert `disabled`); never assert exact condition
  ids (assert the count and the shape); never regenerate a pinned literal.
- Every `not.toHaveBeenCalled` needs a positive control in the same block (the 4.15/4.16 review
  lesson); every "focus is on X" asserts `document.activeElement` (not `toHaveFocus` alone on a
  stale node); count `list()` calls, never just `toHaveBeenCalled`.
- Write every test Tasks 1–10 name **before** ticking the task; record what each test actually does.

### Previous story intelligence (Story 4.16)

- Three review rounds, mostly test-strength and comment drift: spy-wait races on an `await`ed
  digest before `organisms.save` (wait for the spy count, not `toBeDisabled`), a substring oracle
  (`toHaveTextContent`) satisfiable by the wrong sentence (anchor it), a `useCallback` depending on
  a fresh object (`resource`) instead of the stable field (`reload`), comments that went stale one
  patch later. Keep AC text, FD text, comments and the Dev Agent Record in step as you go.
- `saveStamp`'s FIRST-success-only guard and the `!open` refusal are both load-bearing and both
  untouched here; an edit session simply starts stamped.
- The `role="status"` collision inside the modal (`[data-save-status]` vs
  `[data-color-reuse-status]`) means every reuse-warning assertion scopes by `data-*` — do the same.
- `lsof -i :4173` before e2e; paste actual exit codes; `npm run ci:dev`, never `npm run ci`.

### Git intelligence

`main` is at `aa8ff8e` (merge of #69, 4.16). The last app-code commits are 4.16's
(`components/organisms/{OrganismLibrary,editor/OrganismEditorModal}.*`,
`lib/organisms/{useOrganismEditorModal,organismRecord,ruleContentHash,saveOutcome}.*`,
`lib/useAsyncResource.*`, `lib/saveFailureMessage.*`, `e2e/organisms.spec.ts`). **Two epics are in
progress**: Epic 5 has 5.1/5.2 merged (#65/#67) and 5.3 (export envelope serializer) next; 5.x
touches `packages/persistence`, `lib/settings/**` and `components/settings/**`, and reads
`organisms.list()`/`battles.list()` through `useAsyncResource` without editing it. This story's
files: `packages/domain/src/{usageIndex,index}.ts` (+ test), `components/organisms/{OrganismCard,
OrganismLibrary,OrganismInUseDialog}.*`, `components/organisms/editor/{OrganismEditorModal,
ConditionRow}.*`, `lib/organisms/{useOrganismEditorModal,organismDraft}.*`, `app/(gallery)/organisms/page.*`,
comment-only touches listed in Task 9, `e2e/organisms.spec.ts`, `deferred-work.md`,
`sprint-status.yaml`. No file overlaps Epic 5's next stories.

### Project Structure Notes

- New: `packages/domain/src/usageIndex.ts` (+ `.test.ts`);
  `apps/web/components/organisms/OrganismInUseDialog.tsx` (+ `.test.tsx`).
- Modified: `packages/domain/src/index.ts`; `OrganismEditorModal.tsx` (+ test);
  `useOrganismEditorModal.ts` (+ test); `OrganismLibrary.tsx` (+ test); `OrganismCard.tsx` (+ test);
  `ConditionRow.tsx` (+ test); `organismDraft.ts` (+ test); `app/(gallery)/organisms/page.tsx`
  (+ test); comment-only files in Task 9; `e2e/organisms.spec.ts`; `deferred-work.md`;
  `sprint-status.yaml`.
- Naming: `buildUsageIndex`, `UsageIndex`, `organismDraftFrom`, `OrganismInUseDialog`,
  `OrganismInUseDialogProps`, `battleCountLabel`; hook `requestEdit`, `gateMounted`, `gateProps`,
  locals `editing`, `gate`, `gateOpen`, `proceedRef`; Library locals `summaries`, `usage`,
  `onRequestEdit`; card `EditButton`, `CardActions`, prop `onRequestEdit`, attribute
  `data-edit-organism-id`; modal prop `organism`, local `others`.
- Untouched on purpose: `organismRecord.ts`, `ruleDraft.ts` (comments only), `conditionDraft.ts`
  (comment only), `previewOrganism.ts`, `PreviewPanel.tsx`, `RulesEditor.tsx` (comments only),
  `ColorPickerField.tsx` (comment only), `useAsyncResource.ts`, `useInertBackground.ts`,
  `BattleGallery.tsx`, `BattleTile.tsx`, `BattlePage.tsx`, `defaultWorkspace.ts`,
  `mockWorkspace.ts`, `fakeRepositories.ts`, `themes.css`, `theme.ts`, `playwright.config.ts`,
  `scripts/check-bundle-size.mjs`, `docs/project-context.md`, `lane-gates.yaml`.

### What NOT to build

- ❌ No Clone button, no Clone & Edit, no `organisms.clone()` (4.18); no `pending` on the gate.
- ❌ No usage popover, no click-through on `[N]`, no footer (4.20); no Delete (4.21/4.22).
- ❌ No `battles` prop on the modal; no live-grid union (M7 — 4.19); no rule-reference index (E.5 — 4.19).
- ❌ No inline `organismIds.includes` count in `apps/web`; no usage state stored anywhere.
- ❌ No second `useInertBackground` call; no stacked dialogs; no editor mount while the gate is on
  screen.
- ❌ No re-minted rule ids; no dropped or re-ordered rules on seed; no save-time repair of a
  dangling `organismType` id; no gate error for it either.
- ❌ No `CURRENT_FORMAT_VERSION` on an organism; no "keep the old `schemaVersion`" branch.
- ❌ No edit-mode title, no "Edit Organism" heading, no `mode` prop — `organism: Organism | null`
  is the whole switch.
- ❌ No `?id=` on the URL, no route, no `useSearchParams`.
- ❌ No `.catch(() => [])` on `battles.list()` in the Library (FD2).
- ❌ No `transition` on the Edit button; no `--gol-*` token; no hex; no `cursor: pointer` on the
  article; no `tabIndex` on the article.
- ❌ No new e2e seed module (the standing entry's trigger is not met); no edit to the four
  existing copies.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **Clone & Edit is deferred to 4.18 (FD5).** The AC lists it; the dialog ships Cancel / Edit
  Anyway. If the owner prefers the three-button dialog now, 4.18's clone function and write move
  into this story (about a day of the next story's scope).
- **A corrupt `gol:battles` now blanks the Library (FD2)** with the organism-worded error copy.
  The alternative — `battles.list().catch(() => null)` and Edit buttons withheld with a reason —
  needs copy and a test for a state Story 5.11 will redesign anyway.
- **`schemaVersion` is restamped on every edit save (FD7).** "Keep" is a one-line change in the
  projection's signature if 5.7 decides stamps must survive an edit unchanged.
- **The organism-type dropdown excludes self (FD8).** If self-targeting should be authorable, the
  filter for `<RulesEditor>` is a one-line revert and the `Unknown organism` case disappears.
- **The article is no longer a tab stop (FD6).** Keeping both stops is a one-line revert.
- **`buildUsageIndex` is 4.19's AC1 landed early (FD1).** 4.19's scope shrinks to the M7 union
  and the E.5 index; its story file should say so.

### References

- `docs/planning-artifacts/epics.md:1189-1200` (Story 4.17 ACs), `:1202-1238` (4.18–4.20),
  `:1277-1288` (4.24), `:35, 39, 109, 174, 201, 230-231` (FR-1.3/1.7/7.15, AR-15/33, UX-DR5/6).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:123-127, 154-161, 476-480`.
- `docs/planning-artifacts/architecture.md:222-236` (E), `:263-274` (H), `:276-287` (I),
  `:350-353` (M4/M5/M7).
- `docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md:159-172, 303-323`;
  `RFC-004-simulation-rules-engine.md:395-402, 485-535`; `RFC-001-multi-mode-architecture.md:58-96`.
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:13-15,
  24-38, 105-120, 537-544`; `ux-design-complete.md:684-696`;
  `clinical-lab-theme/organism-library.html:309-349, 404-442, 637-644`.
- `docs/implementation-artifacts/4-16-create-save-organism.md`; `4-2-organism-card-grid.md:423-430`;
  `4-3-editor-modal-shell.md:199-220`; `4-9-color-reuse-warning-cvd-validation.md:451-453`;
  `4-11-condition-builder.md:727-731, 864-870`; `4-13-editor-validation-feedback.md:631-641`;
  `epic-1/1-13-*.md` (the delete dialog's forced decisions — the hook idiom's origin).
- `docs/implementation-artifacts/deferred-work.md:199, 231, 753-757, 1443-1445, 1455-1465,
  1566-1567, 1631-1634, 2035-2048, 2116-2122, 2314-2373`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (repositories injected, never imported; three
  state categories), Language rules (no escape hatches; `isolatedModules` type re-exports; Zod at
  boundaries), Testing rules (`packages/domain` ≥ 90% per file — 100% today; referential-integrity
  logic is core; shared fixtures from `@gol/test-utils`; the Playwright viewport band), Code
  Quality (AR-46; `spec:check`; comments explain why), Critical rules (never persist a numeric
  ref; `clearAll` untouched), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, via `bmad-dev-story` under `implement-next-story`
(lane epic 4), 2026-09-22.

### Debug Log References

- Task 1 RED→GREEN: `packages/domain` `npx vitest run src/usageIndex.test.ts` — "no tests" (module
  absent) → 5 passed; `npx vitest run --coverage` — 7 files, 116 tests, **100% on every file**
  (91/91 statements, 31/31 branches, 16/16 functions, 82/82 lines).
- Task 2 RED→GREEN: `organismDraft.test.ts` — 4 × "organismDraftFrom is not a function" → 20 passed.
- Task 3: `tsc --noEmit` — 7 expected `organism` missing-prop errors (test renders + hook) → 0 after
  Tasks 3/6 wiring; `OrganismEditorModal.test.tsx` — 88 passed (11 new).
- Task 4: `OrganismInUseDialog.test.tsx` — 9 passed, first run.
- Task 5 RED→GREEN: `ConditionRow.test.tsx` — 1 failed (option not disabled) → 20 passed.
- Task 6: `useOrganismEditorModal.test.tsx` — 24 passed (9 new).
- Task 7 RED→GREEN: `OrganismCard.test.tsx` — 4 failed → 15 passed.
- Task 8 RED→GREEN: `OrganismLibrary.test.tsx` — 1 failed (the AC7 keyboard retarget, expected) → 38
  passed; `page.test.tsx` — 4 passed.
- Task 10: `npx playwright test e2e/organisms.spec.ts --project=chromium` — first run 110 passed /
  1 failed (test 3's `page.goto('/')` re-ran the init scripts and re-seeded the ORIGINAL name; fixed
  by navigating client-side through the nav link) → 7/7 of the 4.17 block green on re-run, 111 total.
- Task 11: `npm run build:standalone` exit 0; `npm run bundle:check` green on all five routes;
  `npm run lint` exit 0 (1 pre-existing warning in `BattleGallery.tsx:248`, untouched);
  `npm run format:check` exit 1 → `prettier --write` on the 7 flagged files → exit 0.
- **`npm run ci:dev` — exit 0** (2026-09-22): typecheck ✓ · lint ✓ (1 pre-existing warning,
  `BattleGallery.tsx:248`) · format:check ✓ · spec:check ✓ (266 ids resolve) · boundary:check ✓ ·
  test:coverage ✓ — domain 116 (100% per file), simulation 407, persistence 90, test-utils 95, web
  1997 (119 files) · build:standalone ✓ · bundle:check ✓ (five routes, numbers in Task 11) · bench +
  bench:check ✓ (9.563 ms headroom, 57.4% of the frame) · e2e:chromium ✓ **247 passed, 1 skipped**
  (the standing skip).

### Completion Notes List

- **Task 1** — `packages/domain/src/usageIndex.ts`: `buildUsageIndex(summaries): UsageIndex` over
  `Pick<BattleSummary, 'id' | 'organismIds'>[]`, `Set`-deduped per summary, input order, no sort.
  Exported (value + `export type`) from the index. Tests (a)–(d) in `usageIndex.test.ts` plus a
  full-`BattleSummary` assignability case. **Deviation, recorded:** test (e) — the mock-workspace pin
  — lives in `packages/test-utils/src/mockWorkspace.test.ts`, not beside the function: `@gol/domain`
  cannot import `@gol/test-utils` (test-utils depends on domain; a devDependency would be circular).
  It pins Aggressive Colonizer → `[battleA, battleB]`, Conway → `[battleB]`. This is the one
  `packages/test-utils` touch (a test file only; `mockWorkspace.ts` itself is untouched).
- **Task 2** — `organismDraftFrom(organism, nextId)` in `organismDraft.ts`; header and
  `createNewOrganismDraft` docblock present-tensed. Tests (a)–(d), including the round-trip identity
  `projectOrganismForSave(organismDraftFrom(o, …), o.id)` `toEqual(o)` for Conway + all three mocks
  (hashes, ids, order, `schemaVersion` reproduce).
- **Task 3** — modal: `organism: Organism | null` on the lifecycle props; `seed` branches on it;
  `saveStamp` initialised `{ id: organism.id }` for an edit; `others` feeds both `usersByColorToken`
  and `<RulesEditor organisms>`; comments rewritten as the task lists. Tests 37–46 (EDITED = Patient
  Defender: aging on, dominance 45, a `range` and an `age` condition — the fixture with the widest
  field coverage, as the task invited). **Test 41's last clause reshaped:** the story's "make a
  second organism share EDITED's token → re-picking the shared one warns with the OTHER name" cannot
  hold — the Story 4.9 FD2 rule (`seedValue` never warns, a token comparison) makes a re-pick of the
  record's own token silent whether or not it is shared, exactly as AC6 says. 41b instead measures
  self-exclusion directly: the seed swatch's `data-in-use` dot is `false` when EDITED is the sole
  holder and `true` only when a twin holds the token, and the re-pick stays silent either way. 41
  keeps the positive control (picking Conway's token warns with Conway's name).
- **Task 4** — `<OrganismInUseDialog>` composed like `<UnsavedChangesDialog>`; `battleCountLabel` and
  `organismInUseMessage` exported; Cancel `autoFocus` first, Edit Anyway `contained`; no Clone & Edit
  (FD5). Tests (a)–(f).
- **Task 5** — `ConditionRow.tsx`: the `organismType` `<option>` is `disabled` when
  `organisms.length === 0`; test covers empty (disabled, seeded row keeps its `Unknown organism`
  value cell) and one-organism (enabled).
- **Task 6** — hook: `editing`, `gate`/`gateOpen`, `proceedRef`, the union `anyMounted` for ONE
  `useInertBackground` call and the focus effect, `restoreFocusRef` as a discriminated intent with the
  `CSS.escape` lookup + create-button fallback, `requestEdit`, the three gate handlers
  (`handleGateExited` does all four `setState`s in one handler), `gateProps`/`gateMounted`,
  `modalProps.organism`. Tests (a)–(i), the Probe extended with per-organism Edit buttons and the real
  `<OrganismInUseDialog>`.
- **Task 7** — card: `CardActions` + `EditButton` (no `transition`, `--gol-border-control`,
  `:focus-visible` ring, reduced-motion `transform: none`), `aria-label="Edit <display name>"`,
  `data-edit-organism-id`, `onRequestEdit(): void`; `tabIndex` and the article's `:focus-visible`
  ring removed; FD5/"no cursor" comments rewritten. Tests: tab-stop case replaced (article not
  focusable, Edit button named/keyed), whitespace name, click → once, SYSTEM card enabled; every
  render gains `onRequestEdit={vi.fn()}`.
- **Task 8** — Library: `battles: BattleRepository`; one `useAsyncResource` over
  `Promise.all([organisms.list(), battles.list()])`; `usage = useMemo(buildUsageIndex(summaries))`;
  `onRequestEdit` → `requestEdit(organism, usage.get(id)?.length ?? 0)`; second `dynamic()` for the
  dialog; both mounts. `page.tsx` passes `repositories.battles`. Tests: every render gains
  `battles={battles}` from the same `createFakeRepositories` call; the 4.2 keyboard test retargeted
  to the Edit buttons; both no-write pins add `battles.list` called exactly once; new (a)–(h) block on
  `createMockWorkspace()` + Conway + an unused Glider; `page.test.tsx` asserts the Edit button renders.
- **Task 9** — `ColorPickerField.tsx` "Followers" → present tense; `ruleDraft.ts:60-61, :162` and
  `RulesEditor.tsx:288` reworded. `conditionDraft.ts:343`, `RulesEditor.tsx:27, 282`,
  `ConditionsEditor.tsx:27`, `colorReuse.ts:11-12`, `ruleContentHash.ts:26` were already
  present-tense / true and are untouched; `previewOrganism.ts` / `PreviewPanel.tsx` carry no
  "4.17 will".
- **Task 10** — `e2e/organisms.spec.ts`: the 4.2 keyboard test retargeted; `buildSeedPayload` /
  `seedWorkspace` copied VERBATIM (fifth copy) + `seedExtraOrganisms` (Conway + `unused-glider`)
  registered after; tests 1–7 as specified. One idiom learned: the propagation check (test 3) must
  navigate to `/` **client-side** (the nav link) — `page.goto('/')` re-runs the init scripts, which
  re-seed the fixture and overwrite the edit.
- **Task 11** — `deferred-work.md`: `:753-757`, `:1443-1445`, `:1566-1567`, `:1631-1634`,
  `:2035-2038`, `:2039-2043`, `:2366-2373` struck/decided; `:2044-2048` annotated (accepted, not
  repaired); new `## Deferred from: Story 4-17-edit-organism-from-library (2026-09-22)` with the seven
  entries. **Bundle** (`npm run bundle:check`, gzipped first-load / budget): home 333.7 / 340 KB
  (6.3 KB headroom; 4.16 recorded 333.6), battle 309.5 / 310 (0.5 KB; was 309.4), battle/new 309.3
  / 310 (0.7 KB; was 309.2), **organisms 296.3 / 305 (8.7 KB headroom; was 295.6 / 9.4 — a +0.7 KB
  move, within the story's ≤1.5 KB expectation)**, settings 291.5 / 305 (13.5 KB, unchanged). The
  three +0.1 KB moves on home/battle/battle-new are the `@gol/domain` index growing by one export —
  well inside ±0.5 KB. Lazy chunks: the in-use dialog is a NEW chunk `0jsgln4e2a_-a.js` — 6.7 KB
  raw / **2.4 KB gzip**; the editor chunk `3_d747lroyn27.js` is 48.7 KB raw / 13.7 KB gzip.
- **Open flags** (unchanged from the Dev Notes, none blocking): Clone & Edit deferred to 4.18;
  corrupt `gol:battles` blanks the Library; `schemaVersion` restamped; dropdown excludes self; the
  article is no longer a tab stop; `buildUsageIndex` landed early for 4.19.

### File List

New:
- `packages/domain/src/usageIndex.ts`
- `packages/domain/src/usageIndex.test.ts`
- `apps/web/components/organisms/OrganismInUseDialog.tsx`
- `apps/web/components/organisms/OrganismInUseDialog.test.tsx`

Modified:
- `packages/domain/src/index.ts`
- `packages/test-utils/src/mockWorkspace.test.ts` (test only — the Task 1 (e) fixture pin)
- `apps/web/lib/organisms/organismDraft.ts`, `organismDraft.test.ts`
- `apps/web/lib/organisms/useOrganismEditorModal.ts`, `useOrganismEditorModal.test.tsx`
- `apps/web/lib/organisms/ruleDraft.ts` (comments)
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`, `OrganismEditorModal.test.tsx`
- `apps/web/components/organisms/editor/ConditionRow.tsx`, `ConditionRow.test.tsx`
- `apps/web/components/organisms/editor/RulesEditor.tsx` (comment)
- `apps/web/components/organisms/editor/ColorPickerField.tsx` (comment)
- `apps/web/components/organisms/OrganismCard.tsx`, `OrganismCard.test.tsx`
- `apps/web/components/organisms/OrganismLibrary.tsx`, `OrganismLibrary.test.tsx`
- `apps/web/app/(gallery)/organisms/page.tsx`, `page.test.tsx`
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/4-17-edit-organism-from-library.md` (this file)

## Change Log

- 2026-09-22 — Story 4.17 implemented: Edit action on every card with the FR-1.3 "Used in N
  Battles" gate, the editor's edit mode (seeded from the record, in-place upsert, self-excluded
  library views), `buildUsageIndex` in `@gol/domain`, `<OrganismInUseDialog>`, the card's tab-stop
  policy resolved, e2e block, deferred-work bookkeeping. Status → review.

---

Dev Model: opus   # the gate-before-editor lifecycle (one inert window across two dialogs, sequential handoff, focus restore to a per-card trigger) is a new pattern 4.18 (Clone & Edit), 4.21 (delete block), 4.23 (dialog over the editor) and 4.24 (battle variant) all build on; the FDs settle its shape but the hook rewrite and its jsdom-unobservable ordering claims are where a follower-model implementation fails silently

Proposed lane gate: none   # this story touches no file Epic 5's next stories edit (5.3–5.5 read repositories and `packages/persistence` only), adds one pure module to `packages/domain` that 4.19 — not any 5.x story — extends, and the existing `5-4 → 4-19` gate already covers Epic 5's only dependency on that module; FD7's `schemaVersion` restamp is a decision Story 5.7 should read, not a code dependency
