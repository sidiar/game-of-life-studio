---
baseline_commit: 2e4dcf0
---

# Story 4.16: Create & Save Organism

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to save my new organism,
so that it joins my library for use in any battle.

## Acceptance Criteria

From `epics.md#Story 4.16: Create & Save Organism` (`:1177-1187`), decomposed into what a reviewer
can check independently. AC4–AC11 are repo-derived: the obligations the shipped gate (Story 4.13),
the deferred-work entries addressed to this story (`deferred-work.md:38-42, 795-801, 1970-1991,
2054-2079`), the battle save path this story mirrors (Story 2.13 / Story 2.16), the pinned
`contentHash` scheme (`defaultWorkspace.ts:25-37`) and the CI gates impose. **Read the Dev Notes'
forced decisions FD1–FD10 before touching a file** — this story is the first time authored data
leaves the editor, and the two things that can silently go wrong (a hash that forks rule identity
across every installed workspace; a "saved" toast over a write that failed) are settled there.

1. **A valid Save persists exactly one organism, through the injected repository, in the persisted
   shape.** With `validateOrganismDraft(draft)` returning `[]`, Save calls `organisms.save(record)`
   ONCE, where `organisms` is an `OrganismRepository` prop typed to the interface (AR-2 / AR-27 —
   passed down from `<OrganismLibrary>`, which received it from the page boundary; the modal
   imports no repository and calls no factory), and `record` is:
   - `schemaVersion: ORGANISM_SCHEMA_VERSION` — a new `@gol/domain` constant (`1 as const`,
     FD2), the AR-11 / Decision I stamp — never `CURRENT_FORMAT_VERSION`;
   - `id: crypto.randomUUID()` — minted at save time, inside the `try` (Story 2.16's review
     lesson), never in the draft (`organismDraft.ts:28-29`);
   - `name` RAW as typed (untrimmed — FD3), `colorToken`, `dominance`, `agingEnabled` straight
     from the draft;
   - `survivalRules` in list order (FR-2.6), each rule's own `id` KEPT (RFC-004 §2.4), every
     condition through `conditionFromDraft`, `payload` as drafted, and a REAL `contentHash` from
     the new hasher (AC7);
   - parsed through `OrganismSchema.parse` before the write (Zod at the boundary — the
     "persisted-shape view" `organismDraft.ts:90-91` promised), so a record the schema rejects
     never reaches storage and fails loudly on this side of the seam.
   The refused branch (≥ 1 error: `saveAttempted`, focus-to-first-invalid, nothing closes) is
   Story 4.13's and is byte-identical.

2. **Save is live and re-entrant-safe.** The header's Save `<Button>` is `disabled` ONLY for the
   duration of the write (`isSaving`, plus a `savingRef` so a second click while a promise is in
   flight is a no-op — `organisms.save()` is a whole-collection read-modify-write over one key,
   Story 2.13 AC4's reason), and carries `transition: 'none'` in its `sx` (FD8 — the MUI `Button`
   cross-fade trap `deferred-work.md:795-801` handed to this story). It is never disabled at rest,
   and it is released after a SUCCESSFUL write as well as after a failed one (AC3: the editor
   stays open, so "released when the dialog unmounts" no longer applies; a second Save after
   success is an update of the same id, not a second organism).

3. **On success the editor STAYS OPEN and reports in place; the Library refreshes when the editor
   is eventually closed.** (Owner's call, 2026-09-22 — supersedes the design doc's "Save & Close"
   `organism-editor-design.md:43, :558-559` and the first cut of this AC; the editor was redesigned
   to "match the Battle Editor pattern" (`ORGANISM-EDITOR-UPDATES.md`), and the Battle Editor stays
   open after SAVE.) In order: the write resolves → the modal keeps a `saveStamp` (`{ id }`, the
   `BattlePage.tsx:748` idiom) so that every LATER Save in this editor session writes the SAME id
   (`organisms.save()` upserts by id — one organism, updated in place, never a duplicate) → the modal
   publishes the outcome into an **always-mounted** `<div role="status" data-save-status>` inside
   the dialog, between the header and the body, beside the `SaveErrorLine` alert (FD5's in-flow
   idiom, relocated from the Library): the sentence `Organism saved successfully.` when the organism
   has ≥ 1 rule, `Organism saved successfully. No rules defined. Organism will have no living cells.`
   when it has zero (the epic's 4.13 AC3/AC4). The outcome text is cleared at the START of every
   attempt (clear-then-set, so an identical second outcome re-announces) and a failure clears it
   too (never both lines at once). Save is re-enabled after success (AC2) and **focus returns to
   the Save button** after the write resolves, success or failure — `disabled` drops focus to
   `<body>` (the HTML focus-fixup rule) and the editor is still the user's place. The modal still
   reports `onSaved(record)` (FD4); the hook stashes the LATEST record and does NOT close. When the
   user closes (Back / Escape / ✕ — a clean close, no dialog: Story 4.23 owns the dirty scope), the
   hook's ONE close channel runs as today, and once the exit transition has finished (`onExited`)
   it hands the last saved record to the caller's `onSaved` → `<OrganismLibrary>` calls
   `resource.reload()` (FD6 — stale-while-revalidate, no "Loading organisms…" flash, no grid
   unmount), so the new card appears in `sortLibrary` order and the count badge reads the new
   total. Focus lands on the `[data-create-organism]` button exactly as after any close. The
   Library publishes NOTHING (its `role="status"` region from the first cut is removed — it has no
   publisher left; the Story 4.1/4.2 count-badge tests return to their original single-region
   selectors). A close without any save in the session hands nothing on and triggers no reload.

4. **The saved organism is in the battle add-dropdown (FR-7.15) without any change to the battle
   page.** `<BattlePage>` reads `repositories.organisms.list()` at mount
   (`BattlePage.tsx:270`), so a saved organism is in `<OrganismSearchAdd>`'s `<select>` on the
   next visit to `/battle/new` — proven by the e2e (Task 9 test 3), not by new code.

5. **A failed write is reported inside the editor, non-destructively, and the editor keeps
   everything.** `QuotaExceededError`, `CorruptDataError` and any other rejection land in a
   `role="alert"` line between the header and the body (`SaveErrorLine`, FD7 — Story 2.13's idiom,
   conditionally mounted, cleared at the start of every attempt so a repeat re-announces). The
   copy comes from `saveFailureMessage(error, 'organism')` (FD7 — the battle helper lifted to
   `lib/saveFailureMessage.ts` with a `subject` parameter; the three battle sentences are
   byte-identical for `'battle'`). The dialog stays open, the draft is untouched (name, rules,
   preview sketch), Save is enabled again, `onSaved` is NOT called, no status line appears on the
   Library, and `organisms.list()` afterwards is unchanged (the fake repository's count; in the
   browser, `gol:organisms` byte-identical — AR-14's candidate-string-then-`setItem` makes that a
   property of the write path, NFR-7.2).

6. **Creation is uncapped by the palette (FR-1.2, M6).** With every one of the 20 palette tokens
   already in use by the loaded library, a valid Save still persists (the M6 default falls back to
   least-used, the Story 4.9 reuse warning stays non-blocking) — no count check exists anywhere on
   the path, and `OrganismRepository` has no cap (the workspace library is uncapped; the 255 bound
   is per BATTLE, Decision G.3).

7. **The real `contentHash` hasher lands and matches the pinned scheme byte-for-byte.**
   `ruleContentHash(rule)` (new, `apps/web/lib/organisms/ruleContentHash.ts`, FD1) computes
   `sha256hex(JSON.stringify(sortKeysDeep({ conditions, payload })))` — keys sorted deeply in
   `Array#sort` order, array ORDER preserved, `id` excluded, bare lowercase 64-hex with NO
   `sha256:` prefix (Story 1.5 settled that) — through WebCrypto (`crypto.subtle.digest`). Its test
   reproduces all **ten** pinned literals: `CONWAYS_CLASSIC`'s two (`defaultWorkspace.ts:41-56`)
   and the eight AR-45 mock rules (`createMockOrganisms()` from `@gol/test-utils`). A mismatch on
   any one is a red test, never a regenerated literal (`deferred-work.md:41` — "the pinning test
   exists to force that conversation rather than let it ship"). The Story 4.15 preview keeps its
   session-only `contentHash: rule.id` stand-in (`previewOrganism.ts`) — this hasher does NOT
   replace it (`deferred-work.md:1639-1643`).

8. **`useAsyncResource` gains `reload()` — stale-while-revalidate, and nothing else changes.**
   `AsyncResource<T>` gains `reload(): void` (stable identity). Calling it re-runs `load` with
   `status` still `'ready'` and `data` still the previous value until the new promise settles;
   the per-invocation liveness flag discards a superseded request; the render-phase deps reset is
   NOT triggered (the token is an effect dep only). `<BattlePage>`, `<SettingsPage>`,
   `<BattleGallery>` and `useBattleDraft` are untouched and their tests unchanged.

9. **The Story 4.13 transitional notice is gone.** `SaveNotice`, `SAVE_UNAVAILABLE_NOTICE`,
   `noticeRequested`/`noticeVisible` and the `{noticeVisible && …}` block are deleted from
   `OrganismEditorModal.tsx`; modal tests (14), (15) and the second (18) ("axe with the honest
   notice visible") are replaced by this story's cases; the 4.14 "drawing does not touch the draft"
   test's final `[data-save-notice]` assertion is retargeted to the new outcome; e2e 4.13 test 3
   ("zero rules is not refused; the notice is honest") is retargeted into the 4.16 block. No other
   4.3–4.15 test is touched; if any other test fails, the change is wrong, not the test.
   > **Review note (2026-09-22):** this AC collides with Task 8 / FD5 — the always-mounted
   > `<div role="status" data-save-status>` is a second `role="status"` element on `/organisms`,
   > so Story 4.1/4.2's count-badge tests (`OrganismLibrary.test.tsx` ×2, the 4.2 e2e block ×3)
   > had to be rescoped to the badge (`/Organisms?$/`). Those tests are outside the literal
   > 4.3–4.15 range but inside this AC's intent; the rescoping is the only sensible resolution
   > (the region is the owner's 2026-09-21 call) and is recorded here rather than left silent.
   > **Resolved by Task 11 (2026-09-22):** the region moved into the modal, so `/organisms` has
   > one `role="status"` again and every Story 4.1/4.2 selector is back to its original text
   > (`OrganismLibrary.test.tsx` ×2 — the second one was restored by the resume review —
   > `organisms.spec.ts` ×3). **The collision moved, it did not vanish:** the modal now carries a
   > second `role="status"` beside `<ColorPickerField>`'s reuse-warning region, so the three
   > Story 4.9 modal tests that read `within(dialog).getByRole('status')` were rescoped onto
   > `[data-color-reuse-status]` (the attribute the field has carried since 4.9). Same
   > reasoning, same disclosure.

10. **Isolation holds.** Close/Back/Escape without Save still writes nothing (the existing "never
    calls save/delete/replaceAll across an open/close cycle" tests stay green as written); the
    preview grid is never persisted (4.14/4.15 isolation e2e's stay green); Story 4.23's dirty
    scope, 4.17's record seeding, 4.20's footer and 4.24/4.25's battle origin are NOT started.

11. **Gates.** `npm run ci:dev` green (typecheck, lint, format, `spec:check`, `boundary:check`,
    coverage — `packages/domain` stays at 100% per file with the new constant's test, `apps/web`
    reported only — `build:standalone`, `bundle:check` within every route's budget, bench,
    bench:check, Chromium e2e). axe passes with the outcome line visible in the still-open
    editor, with the error line visible in the modal, and on the Library after Back following a
    save (amended 2026-09-22 with AC3 — the Library has no status line and there is no
    save-close). No new `--gol-*` token, no hex, no
    `transition` beyond the `'none'` override. Spec IDs written exactly as the specs spell them.

## Tasks / Subtasks

- [x] **Task 1 — `ORGANISM_SCHEMA_VERSION` (AC1, FD2)** — `packages/domain`
  - [x] `packages/domain/src/organismSchema.ts`: `export const ORGANISM_SCHEMA_VERSION = 1 as const;`
        beside `NEW_ORGANISM_DOMINANCE`, with a comment: the AR-11 / Decision I.4 STAMP on the
        organism/rules shape that a new record is written with — a different axis from
        `CURRENT_FORMAT_VERSION` (Story 1.5 forced decision 3: both are `1` today and a
        `formatVersion` bump that does not touch the organism shape must not restamp organisms).
        Export it from `packages/domain/src/index.ts` next to the other organism constants.
        `CONWAYS_CLASSIC`'s literal `1` is NOT changed (FD2).
  - [x] `organismSchema.test.ts`: (a) `OrganismSchema` accepts `schemaVersion:
        ORGANISM_SCHEMA_VERSION`; (b) `CONWAYS_CLASSIC.schemaVersion === ORGANISM_SCHEMA_VERSION`
        — the seed and the stamp cannot drift silently (a future bump has to touch both, through a
        migration). Keep the package at 100% per file.

- [x] **Task 2 — the hasher (AC7, FD1)** — `apps/web/lib/organisms/ruleContentHash.ts` (+ `.test.ts`)
  - [x] `export function canonicalRuleContent(rule: Pick<SurvivalRule, 'conditions' | 'payload'>): string`
        — `JSON.stringify(sortKeysDeep({ conditions: rule.conditions, payload: rule.payload }))`.
        `sortKeysDeep` (module-private): arrays mapped element-wise IN ORDER; plain objects rebuilt
        with `Object.keys(v).sort()` (default code-unit sort — the scheme's `Array#sort`); every
        other value returned as-is. Typed over `unknown`, no `any`, no cast: narrow with
        `Array.isArray` then `typeof v === 'object' && v !== null`, index through
        `Record<string, unknown>`.
  - [x] `export async function ruleContentHash(rule: Pick<SurvivalRule, 'conditions' | 'payload'>): Promise<string>`
        — `crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRuleContent(rule)))`
        → `Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')`.
        Bare hex, lowercase, no prefix. Head comment: the scheme verbatim, WHY it is here and not
        in `@gol/domain` (FD1), the secure-context caveat (same as `crypto.randomUUID()`, Story 2.13
        forced decision 2), and that Story 4.15's preview stand-in is untouched.
  - [x] Tests: (a) **the ten literals** — for each rule of `CONWAYS_CLASSIC.survivalRules` and of
        every organism in `createMockOrganisms()`, `await ruleContentHash(rule) === rule.contentHash`
        (loop over the fixtures; assert the loop ran over exactly 10 rules so a fixture change is
        visible); (b) `canonicalRuleContent(BORN_RULE-shaped input)` equals the exact string
        `{"conditions":[{"operator":"eq","pattern":"empty","property":"cellState"},{"operator":"eq","pattern":3,"property":"neighborCount"}],"payload":{"action":"born","summary":"Born on an empty cell with exactly 3 neighbors"}}`
        (reproduced 2026-09-22 with `node -e` against `createHash('sha256')`, which yields
        `d9b3d4…26d93d` — the pinned literal); (c) key order does not matter: two rules whose
        condition objects list keys in different orders hash equal; (d) array order DOES matter:
        swapping two conditions changes the hash (FR-2.6 — order is priority); (e) `id` is
        excluded: two rules with different ids and the same content hash equal (RFC-004 §2.4 —
        "identical rules share a `contentHash` but keep distinct `id`s"); (f) a `summary` edit
        changes the hash (payload is hashed); (g) the output matches `/^[0-9a-f]{64}$/`.

- [x] **Task 3 — the projection (AC1, FD3)** — `apps/web/lib/organisms/organismRecord.ts` (+ `.test.ts`)
  - [x] `export async function projectOrganismForSave(draft: OrganismDraft, id: string): Promise<Organism>`
        — the mirror of `lib/battle/battleRecord.ts`'s `projectBattleForSave` and the SIBLING of
        `previewOrganismFrom` (`previewOrganism.ts:9-13`): per rule, `parseRuleDraft(rule)`; a
        `null` THROWS `new Error(…)` naming the rule id (unreachable behind the gate — AC1's
        `errors.length === 0` is exactly `parseRuleDraft !== null` for every rule, Story 4.15 FD4 —
        and a throw surfaces as AC5's generic message rather than a silently skipped rule); then
        `contentHash: await ruleContentHash(parsed)`; assemble `{ schemaVersion:
        ORGANISM_SCHEMA_VERSION, id, name: draft.name, colorToken, dominance, agingEnabled,
        survivalRules }` and return `OrganismSchema.parse(record)`. Rules hash concurrently
        (`Promise.all` over the parsed list) — order is the list's, not the resolution's.
  - [x] Tests: (a) a two-rule draft built from `ruleDraftFrom(CONWAYS_CLASSIC.survivalRules[i],
        nextId)` projects to rules whose `id`s are the source ids and whose `contentHash`es are the
        pinned literals (the parse and the hash proven together); (b) `schemaVersion` is
        `ORGANISM_SCHEMA_VERSION`, `id` is the argument, `name` is the draft's RAW string (a name
        with trailing spaces round-trips untrimmed); (c) rule order is list order after a `moveRule`;
        (d) a zero-rule draft projects to `survivalRules: []` and parses; (e) a rule with zero
        conditions rejects (the throw names the rule id); (f) an invalid condition (`pattern: ''`
        organismType) rejects; (g) a draft the schema would refuse cannot be built through the
        editor's helpers, so pin the boundary directly: a `name` of 51 chars throws a `ZodError`
        (the gate would have refused it; the parse is the second line of defence).

- [x] **Task 4 — the two message helpers (AC3, AC5, FD5, FD7)**
  - [x] `git mv apps/web/lib/battle/saveFailureMessage.ts apps/web/lib/saveFailureMessage.ts`;
        signature `saveFailureMessage(error: unknown, subject: 'battle' | 'organism'): string`.
        The three `'battle'` sentences stay byte-identical (`BattleEditorView.test.tsx` and
        `BattlePage.test.tsx` assert them). `'organism'` copy, same structure: quota → "Storage is
        full, so this organism was not saved. Everything already saved is unchanged — delete a
        battle from the Gallery to free space, then save again." (battles are what fill the store;
        Export is still Story 5.5's — the helper's own reason); corrupt → "Saved organism data could
        not be read, so this organism was not saved. Nothing already stored was changed. Your work
        is still here — try again."; other → "This organism could not be saved. Nothing already
        stored was changed, and your work is still here — try again." Update the ONE import
        (`BattlePage.tsx:12`) and the helper's head comment (it now names two callers).
        `apps/web/lib/saveFailureMessage.test.ts` (new): the six sentences by class (`new
        QuotaExceededError('gol:organisms')`, `new CorruptDataError('gol:organisms', 'x')`, `new
        Error('x')`) × subject; each `'organism'` sentence contains "organism" and never "battle was
        not saved".
  - [x] `apps/web/lib/organisms/saveOutcome.ts` (+ `.test.ts`): `export const ORGANISM_SAVED =
        'Organism saved successfully.'`, `export const NO_RULES_WARNING = 'No rules defined.
        Organism will have no living cells.'` (design doc `:764`, verbatim), and
        `saveOutcomeMessage(organism: Pick<Organism, 'survivalRules'>): string` — `ORGANISM_SAVED`
        alone for ≥ 1 rule, `${ORGANISM_SAVED} ${NO_RULES_WARNING}` for zero. Pure; three tests.

- [x] **Task 5 — `useAsyncResource.reload()` (AC8, FD6)** — `apps/web/lib/useAsyncResource.ts`
  - [x] Add `reload(): void` to `AsyncResource<T>`. Inside: `const [reloadToken, setReloadToken] =
        useState(0)`, `const reload = useCallback(() => setReloadToken((n) => n + 1), [])`, and the
        effect's dependency list becomes `[...deps, reloadToken]` — the render-phase `sameDeps`
        reset keeps comparing `deps` ONLY, so a reload never flips `status` back to `'loading'`.
        Return `{ ...resource, reload }`. Replace the docblock's "`reload` is deliberately not
        implemented" paragraph with the contract: stale-while-revalidate; the previous data and
        status stay until the new promise settles; a superseded request is dropped by the liveness
        flag; consumers who need "refetching" as a state do not get one (nothing does).
        ⚠️ The `eslint-disable-next-line react-hooks/exhaustive-deps` on the effect stays (the
        reason is unchanged); the spread keeps `deps`'s fixed-length contract (one extra, always).
  - [x] `useAsyncResource.test.tsx` (append): (a) `reload()` re-invokes `load` once; `status` is
        `'ready'` and `data` is the OLD value between the call and the resolution, then the new
        value (use a deferred promise); (b) `reload()` while the FIRST load is pending: only the
        second result lands (resolve the first after the second — the liveness flag); (c) `reload`
        identity is stable across renders; (d) a reload after an `'error'` status recovers to
        `'ready'` with data.

- [x] **Task 6 — the modal (AC1, AC2, AC5, AC6, AC9, FD3, FD4, FD7, FD8)** —
  `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (+ `.test.tsx`)
  - [x] Props: `OrganismEditorLifecycleProps` gains `onSaved(organism: Organism): void` ("the write
        succeeded; the parent hook closes the dialog and, once exited, hands the record on —
        Story 4.16"); `OrganismEditorModalProps` gains `organisms: OrganismRepository` (`import
        type` from `@gol/persistence`; interface-typed; "the modal's only side effect, and it goes
        through this prop — never a concrete repository, never `createRepositories()`" (AR-2 /
        AR-27)).
  - [x] Delete `SaveNotice` (`:164-172`), `SAVE_UNAVAILABLE_NOTICE` (`:174-177`),
        `noticeRequested` (`:258`), `noticeVisible` (`:341`) and the block at `:428-432`. Add, in
        the same slot, `{saveError !== null && <SaveErrorLine role="alert" data-save-error>{saveError}</SaveErrorLine>}`
        — `SaveErrorLine` is `BattleEditorView.tsx:392-400`'s shape with `SaveNotice`'s `padding:
        '10px 30px'` and `borderBottom` (it sits under the header): `color: 'var(--gol-danger)'`,
        `background: 'var(--gol-bg-secondary)'`, no `transition`.
  - [x] State: `const [saveError, setSaveError] = useState<string | null>(null)`, `const
        [isSaving, setIsSaving] = useState(false)`, `const savingRef = useRef(false)`.
  - [x] Replace `handleSave` (`:343-353`) with `saveOrganism` (async, total) + the fire-and-forget
        `handleSave` (`BattlePage.tsx:750-848`'s shape, trimmed): if `savingRef.current` return;
        `setSaveError(null)` FIRST (clear-then-set); if `errors[0]` exists → the 4.13 refusal
        branch verbatim (`setSaveAttempted(true)`, the focus request) and return; else
        `savingRef.current = true; setIsSaving(true); try { const id = crypto.randomUUID(); const
        record = await projectOrganismForSave(draft, id); await organisms.save(record);
        onSaved(record); } catch (error) { setSaveError(saveFailureMessage(error, 'organism')); }
        finally { savingRef.current = false; setIsSaving(false); }`. Deps: `[errors, draft,
        organisms, onSaved]`. Comment WHY the id is minted inside `try` (Story 2.16 review: a throw
        above it skips `finally` and wedges `isSaving`), why `onSaved` is called before `finally`
        runs (the dialog starts closing; the two `setState`s land on a still-mounted modal and are
        harmless), and that Escape/Close during an in-flight write is allowed (the write still
        lands and still reports — nothing is lost, the outcome is just announced after a close the
        user asked for).
  - [x] Save button (`:410-412`): `disabled={isSaving}` and `sx={{ ...BUTTON_SX, transition:
        'none' }}` (or fold `transition: 'none'` into a `SAVE_SX` constant) with the
        `deferred-work.md:795-801` reason in a comment; rewrite the JSX comment above it (`:402-409`)
        — it still says "nothing here persists yet".
  - [x] Head comment (`:186-228`): the Story 4.13 paragraph now says what Save DOES (gate → project
        → write → `onSaved`; a rejection → the alert line); keep the AR-33 / 4.23 sentence.
  - [x] Tests (`OrganismEditorModal.test.tsx`): a per-test rig `mountModal(overrides?)` that builds
        `createFakeRepositories({ organisms: LIBRARY }).organisms` FRESH per call (a shared fake
        leaks saved records across tests) and passes `onSaved: vi.fn()` — every existing `render(`
        gains the two props through it (mechanical; no assertion touched). Then:
        (20) a valid draft (name "Glider", one rule with the default condition) → Save →
        `organisms.save` called once; the argument parses under `OrganismSchema`, has
        `schemaVersion === ORGANISM_SCHEMA_VERSION`, a uuid `id` (`/^[0-9a-f-]{36}$/`), the raw
        name, the draft's `colorToken`/`dominance`/`agingEnabled`, one rule whose `id` is the
        card's and whose `contentHash` equals `await ruleContentHash(rule)`; `onSaved` called
        once with the SAME object `save` received; `(await organisms.list()).length === LIBRARY.length + 1`;
        no `role="alert"` and no `[data-save-error]` in the dialog;
        (21) zero rules + valid name → saves (rules `[]`), `onSaved` called — the non-blocking
        pass Story 4.13 promised now proceeds;
        (22) an invalid draft → `save` NOT called, `onSaved` NOT called, the 4.13 refusal
        (name alert, focus) — pin that the gate still runs first;
        (23) `save` rejects with `new QuotaExceededError('gol:organisms')` → the alert line reads
        the quota sentence; the dialog is still open; the name field still holds "Glider" and the
        rule card is still there; Save is enabled again; `onSaved` not called; `list()` length
        unchanged. Repeat for `CorruptDataError` and a bare `Error` (the three sentences);
        (24) the alert line clears at the START of the next attempt: after (23), make `save`
        return a deferred promise and click Save again → `[data-save-error]` is null while the
        write is still pending (the clear is the handler's first `setState`, before any `await`);
        resolve it → `onSaved` fires. And a REFUSED Save (empty the name) after a failed write also
        clears the line — the refusal branch runs after the clear;
        (25) re-entrancy: `save` returns a deferred promise; two rapid clicks → `save` called once;
        Save `toBeDisabled()` while pending, enabled after resolution;
        (26) `crypto.randomUUID` throwing (spy it to throw) → the generic sentence, Save enabled
        again, `isSaving` released (the wedge test);
        (27) uncapped by the palette (AC6): a `library` of 20 organisms covering every `PALETTE`
        token (build from `PALETTE.map`) → the seed is a used token, the reuse warning shows on
        a pick, Save still persists;
        (28) axe with the error line visible;
        (29) the 4.14 "drawing does not touch the draft" test: replace the final
        `[data-save-notice]` assertion with `onSaved` called + the name still "Glider" (the save
        does not clear the draft — the parent unmounts the modal);
        (30) the preview run is not disturbed by a save: after a Play + auto-pause (the 4.15 rig),
        Save → `onSaved` fires and `[data-status]` on the dish is unchanged (no reset on save).
        Delete (14), (15) and the second (18). Record which numbers were renumbered.

- [x] **Task 7 — the hook (AC3, FD4)** — `apps/web/lib/organisms/useOrganismEditorModal.ts` (+ `.test.tsx`)
  - [x] Signature `useOrganismEditorModal(origin, options?: { onSaved?(organism: Organism): void })`.
        A `pendingSavedRef = useRef<Organism | null>(null)`. `handleSaved = useCallback((organism)
        => { pendingSavedRef.current = organism; setDialogOpen(false); }, [])` — the SAME close
        channel as `handleClose`, so Story 4.23's guard has one door to stand in front of, and it
        must NOT be guarded (a save is the opposite of discarding). `handleExited` becomes:
        `setMounted(false); const saved = pendingSavedRef.current; pendingSavedRef.current = null;
        if (saved !== null) onSavedRef.current?.(saved);` where `onSavedRef` is a latest-value ref
        assigned in an effect (so a caller's inline closure never stales and `modalProps` keeps
        its identity). `modalProps` gains `onSaved: handleSaved`. The focus restore is unchanged —
        `restoreFocusRef` was armed at `requestCreate`, so a save-close restores exactly like a
        Close. Head comment: the ordering guarantee (the caller's `onSaved` runs AFTER `mounted`
        clears — the Library must not reload or announce under a still-mounted dialog: the
        `useInertBackground` sweep, and the modal's reuse warning would otherwise flag the
        just-saved organism's own colour during the fade).
  - [x] Tests (`useOrganismEditorModal.test.tsx`; the `Probe` passes `organisms` from a fresh fake
        and forwards `options.onSaved` to a spy): (a) `modalProps.onSaved(record)` closes the
        dialog (`open` false, `mounted` true) and the caller's `onSaved` is NOT yet called; (b) after
        `onExited`, `mounted` is false and the caller's `onSaved` was called once with `record`;
        (c) a plain `onClose` → `onExited` never calls it; (d) focus returns to the create button
        after a save-close; (e) a caller whose `onSaved` changes identity between open and exit
        gets the LATEST one called (the ref); (f) `modalProps` identity is unchanged by a changing
        `onSaved` option (append to the existing stability test).

- [x] **Task 8 — the Library (AC3, AC4, AC6, FD5, FD6)** — `apps/web/components/organisms/OrganismLibrary.tsx` (+ `.test.tsx`)
  - [x] `const [saveOutcome, setSaveOutcome] = useState<string | null>(null)`; `const onSaved =
        useCallback((organism: Organism) => { resource.reload(); setSaveOutcome(saveOutcomeMessage(organism)); }, [resource.reload])`;
        pass `{ onSaved }` to `useOrganismEditorModal('library', …)`; `const openEditor =
        useCallback(() => { setSaveOutcome(null); requestCreate(); }, [requestCreate])` wired to
        the create button (the clear-then-set: a second save's identical sentence re-announces
        only if the region emptied in between).
  - [x] Render an always-mounted `<div role="status" data-save-status>` between `<Toolbar>` and
        the `aria-busy` wrapper, whose child `{saveOutcome !== null && <SaveOutcomeLine
        data-save-outcome>{saveOutcome}</SaveOutcomeLine>}` mounts with the text (the
        `ColorPickerField.tsx:380-390` idiom, verbatim in structure). `SaveOutcomeLine`: a `styled('p')`
        — `margin: '0 0 25px'`, `padding: '10px 14px'`, `fontSize: '12px'`, `lineHeight: 1.5`,
        `color: 'var(--gol-text-primary)'`, `background: 'var(--gol-bg-secondary)'`, `borderLeft:
        '2px solid var(--gol-accent)'`, `overflowWrap: 'anywhere'`; no `transition`. The wrapper
        `div` carries no styles (an empty region occupies no height). ⚠️ NOT inside the
        `aria-busy` wrapper and NOT before the toolbar: the create button stays the first Tab stop
        (`deferred-work.md:802-806`) and the region must survive every `status`.
  - [x] Pass `organisms={organisms}` to `<OrganismEditorModal>` (`:324`) — the same prop this
        component received; update the `:200-212` comment ("the modal receives no repository yet")
        and the mount comment.
  - [x] Tests (`OrganismLibrary.test.tsx`): (a) open → name → Save → the dialog leaves →
        `[data-save-outcome]` reads `ORGANISM_SAVED`; the `role="status"` region existed BEFORE the
        save (query it right after `render`, empty); (b) the grid shows the new card in
        `sortLibrary` position and the count badge reads `4 Organisms` (mocks + 1) — with NO
        `'loading'` reset in between: capture the count badge's DOM node before Save and assert it
        is the SAME node after the new card appears (a reset to `'loading'` unmounts the badge and
        the grid — a remount is a different node), and `list` was called exactly twice;
        (c) zero rules → the region reads `${ORGANISM_SAVED} ${NO_RULES_WARNING}`; (d) reopening
        the editor empties the region (`[data-save-outcome]` gone) and a second save re-fills it;
        (e) focus is on the create button after a save-close; (f) `save` rejecting → the region
        stays empty, the dialog stays open, `list` called once; (g) axe with the outcome line
        visible; (h) the existing "never calls save/delete/replaceAll across an open/close cycle"
        test stays as written (it is AC10's pin).

- [x] **Task 9 — e2e (AC1–AC6, AC9, AC11)** — `apps/web/e2e/organisms.spec.ts`
  - [x] New block `test.describe('create & save organism (Story 4.16)')` after the 4.15 block,
        reusing `openEditor`, the hoisted 4.13 helpers (`cardGroup`, `row`, `save` — hoist them to
        file scope if the 4.13 block still owns them, the 4.15 review's preferred call) and the
        console-error collector idiom (`:34-54`):
        1. **happy path** — `/organisms` → open → name `Glider` → header "+ Add Rule" → "+ Add
           Condition" (the default row is valid) → Save → the dialog is gone (`not.toBeVisible`)
           → `[data-save-outcome]` has text `Organism saved successfully.` → the card `Glider` is
           visible and the badge reads `2 Organisms` → `localStorage.getItem('gol:organisms')`
           parsed holds a record named `Glider` with `schemaVersion === 1`, one rule whose
           `contentHash` matches `/^[0-9a-f]{64}$/` and whose `conditions[0]` is the default
           `cellState eq empty` → `page.reload()` → the card is still there; zero console errors.
        2. **zero rules** — name only → Save → the outcome line carries both sentences; the card
           exists.
        3. **FR-7.15** — after 1, `page.goto('/battle/new')` → the sidebar's
           `getByRole('combobox', { name: /add organism/i })` has an option `Glider`
           (`battleRoute.spec.ts:440-441`'s locator; assert `toContainText`/an option count of 1
           for the name rather than the whole ordered list).
        4. **focus** — after a save-close the create button is focused (Chromium/Firefox; on
           WebKit assert only that focus is not inside a dialog — the 4.13 e2e's branch).
        5. **quota, in a real browser** — before Save, `page.evaluate` replaces
           `Storage.prototype.setItem` with a function throwing `new DOMException('full',
           'QuotaExceededError')`; Save → the dialog stays, `dialog.getByRole('alert')` reads the
           quota sentence, `gol:organisms` is byte-identical to the value read before the click;
           restore the prototype; Save again → succeeds (the line clears, the dialog closes).
        6. **keyboard** — after filling the name, `dialog.getByRole('button', { name: 'Save' }).focus()`
           then `page.keyboard.press('Enter')`; the flow of test 1 completes (dialog gone, outcome
           line, card). The header's Tab order is 4.3's and is not re-asserted.
        7. **axe** — after 1 with the outcome line visible; after 5 with the alert visible (wait for
           the dialog to be settled — the Save button has `transition: 'none'`, but scan after
           `expect(alert).toBeVisible()`).
        Retarget e2e 4.13 test 3 (`:2218-2240`): delete it from the 4.13 block — test 2 above is
        its successor (the "honest notice" it pinned no longer exists).
  - [x] Run `npx playwright test e2e/organisms.spec.ts --project=chromium` first, then the full
        `npm run ci:dev`. `lsof -i :4173` before starting.

- [x] **Task 10 — docs and bundle (AC7, AC11)**
  - [x] `deferred-work.md`: strike `:38` as `✅ Closed in Story 4.16` with the hasher's path, the
        10-literal pinning test and FD1's placement reason; add `## Deferred from: Story
        4-16-create-save-organism (<date>)` with: (1) the two live-region idioms — this story took
        the always-mounted one for the Library outcome and the conditionally-mounted `role="alert"`
        for the in-modal failure (both per the 2026-09-21 decision); (2) no auto-dismiss on the
        outcome line (open flag); (3) name persisted raw/untrimmed (open flag); (4)
        `fakeRepositories.ts:38-39`'s "no `@types/node`" comment is stale — `apps/web`'s
        `@types/node` is hoisted and `crypto.subtle`/`TextEncoder` DO typecheck in `packages/*`
        today (measured with a probe file 2026-09-22); the hasher deliberately does not rely on it
        (FD1); (5) `useAsyncResource.reload` exists now — `<BattleGallery>`'s `reloadToken`
        reducer is a candidate to migrate in a later touch; (6) Escape during an in-flight write is
        allowed and reports after the close; (7) Story 4.17 needs `projectOrganismForSave` to take
        the record's id and `schemaVersion` policy (restamp or keep) — flagged, not decided.
  - [x] Bundle: run `npm run build:standalone && npm run bundle:check`; record all four routes.
        `/organisms` gains the status region + `saveOutcomeMessage` (first load); the editor chunk
        gains the projection, the hasher and the failure helper — expect < 2 KB gzip each. If any
        route moves more than ±0.5 KB, say why.
  - [x] `sprint-status.yaml`: `4-16-create-save-organism: in-progress` at start, `review` at the
        end; Dev Agent Record with every command and its actual exit code.

- [x] **Task 11 — Save keeps the editor open (AC2, AC3 as amended 2026-09-22)** — owner's scope
  change after review; mirror the Battle Editor, do not invent a second idiom
  - [x] Modal (`OrganismEditorModal.tsx`): `const [saveStamp, setSaveStamp] = useState<{ id: string }
        | null>(null)`; `saveOrganism` uses `saveStamp?.id ?? crypto.randomUUID()` (still minted
        inside the `try`), sets the stamp on success. Release `isSaving`/`savingRef` in `finally`
        on BOTH outcomes again (the review's "hold after success" patch is superseded: the dialog
        no longer unmounts; interleaving is still refused by `savingRef`, and a second click after
        success is an upsert of the same id — pin that with a test: two Saves → `save` called
        twice with the SAME `id`, the fake repository's `list()` grew by ONE). Add
        `const [saveOutcome, setSaveOutcome] = useState<string | null>(null)`; clear it AND
        `saveError` at the start of every attempt; on success `setSaveOutcome(saveOutcomeMessage(record))`.
        Render an always-mounted `<div role="status" data-save-status>` between the header and the
        body (next to `SaveErrorLine`, which stays conditionally mounted and `role="alert"`), whose
        child `{saveOutcome !== null && <SaveOutcomeLine data-save-outcome>{saveOutcome}</SaveOutcomeLine>}`
        mounts with the text — move `SaveOutcomeLine` (the `styled('p')` from Task 8) here
        verbatim. `saveOutcomeMessage` (Task 4) is now imported by the modal, not the Library.
        A `saveButtonRef`; after the write settles (success or failure), `saveButtonRef.current?.focus()`
        — test: focus is on the Save button after a successful save and after a rejected one
        (`document.activeElement`), which closes the review's first `[Defer]` for this editor.
        Update the header comment (`:247-248`, `:474-475`) and the `onSaved` docblock (`:72-76`):
        the parent no longer closes on save.
  - [x] Hook (`useOrganismEditorModal.ts`): `handleSaved` only stashes into `pendingSavedRef`
        (overwriting — the LAST record wins) and no longer calls `setDialogOpen(false)`;
        `handleExited` is unchanged (hands the stashed record on after `mounted` clears, then
        clears it). With Task 12 in place a write cannot resolve after the exit any more, so the
        `mountedRef` late-save branch and its test are dead — remove both and say so in the
        docblock. Tests: (a) `onSaved` from the modal does NOT close the dialog; (b) Back after a
        save → the caller's `onSaved` fires once, after exit, with the last record; (c) two saves
        then Back → fires once with the second record; (d) close without a save → never fires.
  - [x] Library (`OrganismLibrary.tsx`): `onSaved` is `reload()` only; remove `saveOutcome`,
        `SaveOutcomeLine`, the `data-save-status` region and the `openEditor` clear; the
        `saveOutcomeMessage` import goes. Restore the Story 4.1/4.2 count-badge tests
        (`OrganismLibrary.test.tsx`, `organisms.spec.ts`) to their pre-4.16 single-`role="status"`
        selectors — the `/Organisms?$/` rescoping is no longer needed and AC9's review note is
        resolved, not just disclosed. Rewrite Task 8's tests (a)/(c)/(d)/(e)/(f)/(g) against the
        new flow: after Save the dialog is STILL open and `[data-save-outcome]` inside it reads the
        sentence; Back → the dialog leaves → the new card and `4 Organisms` (same badge node, no
        `'loading'` reset, `list` called exactly twice), focus on the create button; a rejected
        save → dialog open, no outcome line, alert present, `list` once.
  - [x] e2e (`organisms.spec.ts`): retarget the seven Story 4.16 tests — happy path asserts the
        in-dialog outcome line, then Back, then the card and the badge; zero-rules likewise; the
        focus test asserts the Save button after save and the create button after Back; add one
        test: Save, rename, Save again, Back → exactly one new card, with the second name.
  - [x] Docs: `organism-editor-design.md:43` ("Save & Close") → "**Save**: saves the organism and
        keeps the editor open with the outcome line; a later Save updates the same organism";
        `:558-559` → "4. Outcome line inside the editor: \"Organism saved successfully\" 5. Back
        returns to the Organism Library, refreshed"; `ux-design-complete.md:688` likewise. Add to
        the Story 4-16 section of `deferred-work.md`: the `saveStamp` is the seam Story 4.17 seeds
        from the opened organism (replaces item (7)'s "flagged, not decided" for the id half; the
        `schemaVersion` restamp-or-keep half stays open). Re-run `build:standalone` +
        `bundle:check`; `/organisms` first load should shrink (region + helper leave), the editor
        chunk grow by roughly the same; record the figures.

- [x] **Task 12 — lock the close while a write is in flight (review decision, owner chose (b))**
  - [x] Modal: the Back button gets `disabled={isSaving}` (the `BattlePage.tsx:1010`
        `backDisabled={isSaving}` idiom, same `transition: 'none'` reason as Save); the dialog's
        `onClose` (Escape / backdrop / ✕) becomes a no-op while `savingRef.current` — one guarded
        handler, not three. Tests: Escape and a Back click during an in-flight write do not close
        (dialog still present after the write resolves); Escape after it resolves closes as before.
  - [x] `deferred-work.md`: strike the "Escape during an in-flight organism save is allowed" entry
        as `✅ Closed in Story 4.16 (review decision (b))`; update the Open flags bullet below.
  - [x] The review's `[Review][Decision]` item under Review Findings: tick it once this task is
        done and note "(b), implemented in Task 12".

- [ ] **Task 13 — disable ✕ while a write is in flight (second review decision, owner chose (b))**
  - [ ] Modal: the ✕ `IconButton` gets `disabled={isSaving}` like Back, with the FD8 `transition:
        'none'` override in its `sx` (the MUI cross-fade trap) and whatever the house disabled
        styling for an icon button is (mirror `BackButton`'s disabled trio if the icon button has
        none). The `handleRequestClose` guard stays — Escape and backdrop still need it.
  - [ ] Test: ✕ is `disabled` during an in-flight write and enabled again after it settles
        (success and rejection); a click on it while saving does not close.
  - [ ] Tick the second review's `[Review][Decision]` item once done, noting "(b), implemented in
        Task 13".

### Review Findings

Code review 2026-09-22 (opus, second pair of eyes on a sonnet implementation): Blind Hunter (diff
only), Edge Case Hunter (diff + project), Acceptance Auditor (diff + story + project-context). 1
`decision-needed`, 16 `patch`, 2 `defer`, 10 dismissed as noise.

- [x] [Review][Decision] **Escape/Close/Back during an in-flight write — keep it allowed, or lock the close while saving?** **→ Owner's answer (2026-09-22): (b) — lock the close while saving; see Task 12. The owner also changed scope at the same time: Save keeps the editor open (AC3 amended, Task 11) — (b) rules out (1) — no exit can happen while a write is in flight; the editor staying open rules out (2) — a resolved save closes nothing; (3) shrinks to a visible state — the typed text is still on screen in the open editor and the next Save writes it as an update of the same id.** — The story's open flag chose "allowed" on the premise that the write is sub-millisecond. The write is `projectOrganismForSave` (one `crypto.subtle.digest` per rule, thread-pool) + `organisms.save()`; against localStorage it is a few ms, against a Connected-mode API repository it is a round-trip. Three residuals exist only when the write outlasts the ~195 ms exit fade, and none has a fix that does not need the owner's intent: (1) a write that REJECTS after the dialog has exited is reported nowhere — the `role="alert"` lives in the unmounted modal, and "nothing was lost" is then untrue from the user's side; (2) a write that resolves after the user has already reopened a fresh editor calls `handleSaved`, which closes the NEW editor (discarding its draft) and announces the OLD record; (3) fields stay editable while a write is in flight, so keystrokes typed in that window are silently not in the saved record. (The fourth residual — a write that resolves after the exit but before any reopen was dropped, then replayed on the next unrelated close — was a plain bug and is patched below.) Options: **(a) keep allowed**, accept (1)–(3) as Connected-mode residuals and record them in `deferred-work.md` for RFC-001's API repository story; **(b) lock the close while saving** — `onClose` (✕ / Back / Escape) is a no-op while `isSaving`, the `<UnsavedChangesDialog>` `pending` idiom; removes all three at the cost of a lock on a few-ms window today, and Story 4.23's guard then has a second condition to respect; **(c) keep allowed but session-bind the late outcome** — the hook stamps a session id per `requestCreate`, a late `handleSaved` from a stale session neither closes nor stashes but queues its report for after the current session exits; fixes (2), leaves (1) and (3). Files: `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (`saveOrganism`), `apps/web/lib/organisms/useOrganismEditorModal.ts` (`handleSaved`/`handleClose`), `deferred-work.md` (the "Escape during an in-flight organism save is allowed" entry, which currently asserts a "still reports" that the patched code now honours only for the no-reopen case). **Resolved: (b), implemented in Task 12.**
- [x] [Review][Patch] **(Superseded by Task 11 — the release is back in `finally` on both outcomes; a second Save is an upsert of `saveStamp.id`.)** A second Save during the exit fade after a SUCCESSFUL write writes a second organism — `finally` re-enables the button while the dialog is still mounted and interactive for ~195 ms; a double-click or a second Enter lands as a second `organisms.save()` with a fresh id. Hold `isSaving`/`savingRef` on success (the modal is unmounting; the parent's close is the release), release only on failure; move `onSaved(record)` out of the `try` so a throw from the parent is not reported as a failed save that actually succeeded [apps/web/components/organisms/editor/OrganismEditorModal.tsx:373-409]
- [x] [Review][Patch] **(Superseded by Task 12 + the resume review's `!open` guard — the branch and its test were removed; see the 2026-09-22 resume block below.)** A save that resolves AFTER an Escape-close's exit transition is dropped, then replayed on the next unrelated close — `handleSaved` only stashes into `pendingSavedRef` and `handleExited` has already fired; reproduced with a probe (caller's `onSaved` 0 calls after the late resolution, 1 call after the next plain Close). Hand the record on immediately when the dialog is no longer mounted [apps/web/lib/organisms/useOrganismEditorModal.ts:149-167]
- [x] [Review][Patch] `SAVE_SX` comment says "the write itself is sub-millisecond (a localStorage `setItem`)" — the disabled window is the digest(s) + the write, and the claim underpins the Escape decision above; reword [apps/web/components/organisms/editor/OrganismEditorModal.tsx:46-51]
- [x] [Review][Patch] Tests (24)/(25) assert `save` was reached synchronously after a click, but `organisms.save()` sits behind an `await`ed digest — `toBeDisabled()` is true on `waitFor`'s first check, so the following `toHaveBeenCalledTimes(1)` / `resolveSecond()` race the thread pool; wait for the spy count first [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:1092-1172]
- [x] [Review][Patch] Library test (a) asserts `toHaveTextContent(ORGANISM_SAVED)` — a substring match that the zero-rules sentence also satisfies; anchor it so the one-sentence case is proven to be exactly one sentence [apps/web/components/organisms/OrganismLibrary.test.tsx:558]
- [x] [Review][Patch] `useAsyncResource` "drops a superseded reload" is not Task 5 (b)'s scenario (the initial load is resolved BEFORE the first reload) and its late resolution lands outside `act`, so a broken liveness flag would still pass; run the described scenario (reload while the FIRST load is pending) and resolve the stale promise inside `act` [apps/web/lib/useAsyncResource.test.tsx:240-274]
- [x] [Review][Patch] `<OrganismLibrary>`'s `onSaved` depends on `[resource]` — a fresh object every render, so the `useCallback` never memoises and the hook's `onSavedRef` effect re-runs each render; destructure the stable `reload` and depend on it (the story's `[resource.reload]` intent) [apps/web/components/organisms/OrganismLibrary.tsx:246-256]
- [x] [Review][Patch] Task 3 (g) names a `ZodError` and the `MAX_ORGANISM_NAME_LENGTH` boundary but asserts a bare `rejects.toThrow()` over a hard-coded `51`; pin the class and derive the length from the constant [apps/web/lib/organisms/organismRecord.test.ts:96-98]
- [x] [Review][Patch] `ORGANISM_SCHEMA_VERSION`'s comment says `CONWAYS_CLASSIC`'s literal is "unrelated", while the test beside it pins that the two "must agree by construction"; the seed's literal is out of scope, not unrelated — reword [packages/domain/src/organismSchema.ts:21-26]
- [x] [Review][Patch] Test (20)'s id oracle `/^[0-9a-f-]{36}$/` accepts 36 hyphens; use the 8-4-4-4-12 shape [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:1000]
- [x] [Review][Patch] `sortKeysDeep` uses `value as Record<string, unknown>` where Task 2 said "no cast"; a type predicate narrows without one [apps/web/lib/organisms/ruleContentHash.ts:53-63]
- [x] [Review][Patch] Dev Agent Record's bundle narrative is invented — "down from the 11.5 KB Story 4.15 measured, a ~2.3 KB move" against a 4.15 record that reads `/organisms` 295.6 KB / 305 KB (9.4 KB headroom); the real move is +0.2 KB; re-measure and correct [docs/implementation-artifacts/4-16-create-save-organism.md — Completion Notes, Task 10]
- [x] [Review][Patch] `deferred-work.md:38` is closed by a trailing sub-bullet but its heading line is not struck — every other closed entry in that file is `~~…~~ — ✅ Closed in Story N`, and a scan of open debt by unstruck headings still lists it [docs/implementation-artifacts/deferred-work.md:38]
- [x] [Review][Patch] AC9 ("no other 4.3–4.15 test is touched; if any other test fails, the change is wrong, not the test") collides with Task 8's always-mounted `role="status"` region: Story 4.1/4.2's count-badge tests (`OrganismLibrary.test.tsx`, `organisms.spec.ts`) had to be rescoped to the second region. The record discloses the edits but the conflict was resolved silently; note it under AC9 [docs/implementation-artifacts/4-16-create-save-organism.md — AC9]
- [x] [Review][Patch] Test (20) asserts `colorToken` is merely a palette member rather than the draft's M6 seed (`defaultColorToken(LIBRARY…)`, which the 4.8 test already computes); test (22) claims "the 4.13 refusal (name alert, focus)" but never asserts focus [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:1004-1048]
- [x] [Review][Patch] `saveFailureMessage.ts`'s head comment says `BattleEditorView.test.tsx` / `BattlePage.test.tsx` assert the `'battle'` sentences byte-identically; they assert fragments (`/could not be saved/i`, a truncated prop literal) — the byte-identity pin is the new `saveFailureMessage.test.ts`; cite that instead [apps/web/lib/saveFailureMessage.ts:17-22]
- [x] [Review][Defer] Disabling the focused Save on a failed write drops keyboard focus to `<body>` (the HTML focus-fixup rule); the `role="alert"` still announces but the keyboard user is left at the document root — the same `disabled`-while-saving idiom `<EditorStatusBar>`'s SAVE / `<BattlePage>` ship, and no refocus is specified [apps/web/components/organisms/editor/OrganismEditorModal.tsx:478] — deferred, pre-existing idiom. **✅ Closed by Task 11 (2026-09-22):** the settle effect refocuses Save after every outcome; the resume review scoped it to loose focus only.
- [x] [Review][Defer] The WebKit branch of the save-close focus e2e ("focus is not inside a dialog") is satisfied by NO element being focused — the Story 4.13 e2e's idiom, inherited verbatim [apps/web/e2e/organisms.spec.ts:2940-2945] — deferred, pre-existing idiom

Dismissed (10): clearing `pendingSavedRef` at `requestCreate` (a reopen mid-fade keeps the dialog mounted, and the eventual close reports correctly); `mountModal`'s `[...library]` spread vs tests passing `LIBRARY` directly (`createFakeRepositories` copies its input through JSON either way); the moved helper's "Story 5.4" → "Story 5.5" (5.5 is `export-workspace` on the board — a correction); `toContain('organism')` beside an exact `toBe` (Task 4 asked for both); old-path importers (none — `grep` and `typecheck` agree); test (30)'s redundant re-read; a rejecting `reload()` after a successful save showing the success sentence over the load-error copy (both statements are true); duplicate/whitespace-variant names (no uniqueness requirement exists; raw name is the story's own open flag); insecure-context `crypto` (FD1 specifies the generic sentence, no fallback); e2e test 5 not asserting the alert cleared on retry (the dialog it lives in is asserted gone).


Resume review 2026-09-22 (opus, second pair of eyes on the sonnet Tasks 11–12 resume, diff `6db83f8..HEAD`): Blind Hunter (diff only), Edge Case Hunter (diff + project), Acceptance Auditor (diff + story + project-context + UX docs). 1 `decision-needed`, 13 `patch`, 1 `defer`, 10 dismissed as noise. CI: no run exists for the resume push (`996bf56`) — the last green run (35702085285) is on `6db83f8`; the review commit's push is the first run on Tasks 11–12.

- [ ] [Review][Decision] **The ✕ button stays enabled but silently inert while a write is in flight — keep Task 12's guard-only design, or disable it like Back?** **→ Owner's answer (2026-09-22): (b) — `disabled={isSaving}` on the ✕ `IconButton` too, with the `transition: 'none'` override (FD8) and a test; see Task 13.** Task 12 as written routes Escape/backdrop/✕ through one guarded `handleRequestClose` and gives only Back `disabled={isSaving}`; the dev's comment justified the split with "Back is a visible control the user can see go inert, unlike Escape or a backdrop click" — but ✕ is exactly as visible as Back. A sighted user clicks a live-looking button and nothing happens; a screen-reader user hears "Close, button" with no disabled state. (The resume review gave Back the house disabled trio so ITS lock is at least visible; ✕ has none.) Options: **(a) keep as specified** — guard only, the window is a few ms against localStorage, and revisit when RFC-001's API repository makes it a round-trip; **(b) `disabled={isSaving}` on the ✕ `IconButton` too**, keeping the guard for Escape — MUI `IconButton` carries the same 250 ms transition as `Button`, so it needs the `transition: 'none'` override for the axe scan (FD8's reason) and a test beside the Back one; **(c) `aria-disabled={isSaving}` on ✕** — announced to AT, still clickable-and-ignored for the pointer, no transition concern. Files: `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (the ✕ `IconButton`, `handleRequestClose`), its test's "close is locked while saving (Task 12)" block.
- [x] [Review][Patch] A Save clicked during the ~195 ms exit fade after a CLEAN close (Back/Escape/✕ with nothing in flight) starts a write the close-lock cannot see — the dialog is still mounted and interactive with `open={false}`, and a write outlasting the fade resolves after `onExited`, exactly the stash-then-replay the removed `mountedRef` branch guarded; `saveOrganism` now refuses while `!open` (test (36): Escape → `open={false}` → click + Enter on Save → `save` never called, `list()` unchanged) [apps/web/components/organisms/editor/OrganismEditorModal.tsx:427-433]
- [x] [Review][Patch] The settle-focus effect refocused Save unconditionally, yanking the caret from a field the user moved into during the write (a round-trip against an API repository); guarded on loose focus — `<body>`, `null`, or anything outside the editor `Shell` (MUI's trap parks focus on the dialog container after the fixup blur) — the `<BattlePage>` fullscreen-exit rule; test (35) clicks into the name field mid-write and keeps it [apps/web/components/organisms/editor/OrganismEditorModal.tsx:503-516]
- [x] [Review][Patch] `savingRef` was released in `finally` BEFORE `setSaveStamp` ran (outside the `try`), so the re-entrancy guard was open for one tick while the closure still held `saveStamp === null` — safe only by React batching; the stamp and the outcome now set inside `try` right after `organisms.save()` resolves, before the release, and the stamp is set on the FIRST success only (the state comment said "set once" while the code set it every pass) [apps/web/components/organisms/editor/OrganismEditorModal.tsx:456-484]
- [x] [Review][Patch] One of the two Story 4.2 count-badge assertions Task 11 said were restored was not — `filters the grid live by name` still read `getAllByRole('status').find(/Organisms?$/)` under a comment claiming "Two `role="status"` regions exist now"; restored to the original `screen.getByRole('status')` verbatim [apps/web/components/organisms/OrganismLibrary.test.tsx:189-197]
- [x] [Review][Patch] The modal's `BackButton` had no `&:disabled` rule and an unscoped `&:hover`, so the Task 12 lock rendered identically to a live button (pointer cursor, hover highlight); given the pre-validated disabled trio and `&:hover:not(:disabled)` every Back control on the battle route wears (`<SidebarFooter>`) [apps/web/components/organisms/editor/OrganismEditorModal.tsx:150-167]
- [x] [Review][Patch] Tests (33)/(34) and the three close-lock tests called `resolveSave()` after `waitFor(toBeDisabled())`, which passes synchronously on click — `organisms.save` sits behind an awaited digest, so `resolveSave` could still be unassigned (the (24)/(25) race the first review fixed); each now waits for the `save` spy first [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:1487-1660]
- [x] [Review][Patch] The Escape lock test pressed its negative Escape with focus on the (jsdom-unfixed) disabled Save and its positive one after the effect had refocused Save — not like-for-like; both presses now happen with the name field focused [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:1555-1596]
- [x] [Review][Patch] "Cleared at the start of every attempt / never both lines" was unpinned: (32) ran failure → success, so the region was empty after the failure only because nothing had ever filled it, and removing `setSaveOutcome(null)` left every test green; rewritten success → pending second write (region already empty) → rejection (alert alone); Library (d)'s mid-sequence `waitFor` on a sentence the first save had already left in place now waits for the second `save` call [apps/web/components/organisms/editor/OrganismEditorModal.test.tsx:1356-1402, apps/web/components/organisms/OrganismLibrary.test.tsx:635-665]
- [x] [Review][Patch] Library (a)'s "the dialog STAYS OPEN" was an immediate `getByRole('dialog')` that the superseded save-closes design also satisfied for the ~195 ms fade; asserted after MUI's exit duration has elapsed, plus Back enabled [apps/web/components/organisms/OrganismLibrary.test.tsx:546-585]
- [x] [Review][Patch] The hook's `handleClose` comment claimed all three closes are "routed through the modal's own guarded handler so none can fire while a write is in flight" — `modalProps.onClose` is unguarded and Back bypasses `handleRequestClose` via `disabled`; and both the hook and modal comments said a write "can never resolve after the dialog has exited", which parent-driven unmounts (route change) still allow; reworded in both files and in `deferred-work.md`, with the route-unmount residual recorded [apps/web/lib/organisms/useOrganismEditorModal.ts:141-165, apps/web/components/organisms/editor/OrganismEditorModal.tsx:476-484]
- [x] [Review][Patch] Story file: AC9's review note still read as if the `/Organisms?$/` rescoping were current and did not disclose the new Story 4.9 modal-test rescoping onto `[data-color-reuse-status]`; AC11 still said "status line visible on the Library … after a save-close"; the Open flags bullet still placed the outcome line in the Library; FD4/FD5 and five later sections contradicted amended AC3 with no pointer — an amendment banner now heads the Dev Notes; Review Findings did not mark the two patches Task 11/12 superseded nor the first `[Defer]` Task 11 closed; the Debug Log paired an exit-0 with a flake from a different run; "Agent Model Used" omitted the sonnet resume [docs/implementation-artifacts/4-16-create-save-organism.md]
- [x] [Review][Patch] `deferred-work.md`: the first review's "focus drops to `<body>`" defer was not struck although Task 11 closed it; the Story 4.17 `id`/`schemaVersion` bullet was deleted outright while the new `saveStamp` bullet said it "replaces this entry" — restored as `~~…~~ ✅ Half-closed` per the file's convention [docs/implementation-artifacts/deferred-work.md:2320-2365]
- [x] [Review][Patch] UX docs: "supersedes 'Save & Close' below" pointed at text that no longer exists, and neither doc said that ✕/Escape return to the Library refreshed exactly like Back, nor that all three are locked mid-write [docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:43-47, :560-562; ux-design-complete.md:688-691]
- [x] [Review][Defer] `epics.md` Stories 4.24/4.25 and `prd.md`'s organism-editor line still specify "Save & Close" for the battle-origin flows that Task 11's stay-open design now contradicts [docs/planning-artifacts/epics.md:1288, :1299; docs/planning-artifacts/prd.md:277] — deferred, planning docs outside this story's scope; recorded for 4.24/4.25 in `deferred-work.md`

Dismissed (10): `onSaved` throwing after a landed write is "reported nowhere" (the hook's `handleSaved` only assigns a ref — nothing there throws); the e2e `save(dialog).toBeFocused()` cannot distinguish "restored" from "never left" (the jsdom tests (33)/(34) pin the effect; the e2e is smoke); an Escape landing "in the macrotask gap after `savingRef=false` but before the settle commit" (the release and the commit are one batched task — no event can interleave); (25b) "depends on batching" (the stamp now precedes the release by construction); a `'battle'`-origin consumer of the changed `onSaved` contract (none exists until Story 4.24); Library (b) and (e) both asserting create-button focus (Task 11 asked for both); the `as Organism` casts in (25b) (the file's existing idiom at (20)/(22)); `[data-color-reuse-status]` "never added by the diff" (it has been on `<ColorPickerField>` since Story 4.9); keystrokes during an in-flight write not being in the record (the owner's decision text names this a visible state, and the next Save writes it); Task 12's "same `transition: 'none'` reason" not applied to Back (the button has no transition; the comment says so); the editor chunk shrinking despite added code (measured 46.4 KB raw / 13.1 KB gzip from this tree — the prior 46.8/13.2 is the first review's figure, not reproducible here, and the delta is within minification noise).


## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

> **Amendment 2026-09-22 (Tasks 11–12, owner's call after the first review).** FD4, FD5 and the
> sections below that mention a "save-close", the Library's outcome region, `openEditor`, "no
> status published before `onExited`" or "no guard on the save-close" describe the FIRST cut and
> are kept as its record. AC2/AC3 as rewritten, Task 11 and Task 12 are what the code does now:
> Save keeps the editor open and publishes its outcome INSIDE the modal (`SaveOutcomeLine`,
> `data-save-status`), a later Save upserts `saveStamp.id`, the hook only stashes and hands the
> last record on at `onExited`, the Library's `onSaved` is `reload()` alone, and Back/Escape/✕ are
> locked while a write is in flight.

- **FD1 — The hasher lives in `apps/web/lib/organisms/ruleContentHash.ts`, not in `@gol/domain`,
  and uses WebCrypto.** RFC-004 §2.4 / AR-21 specify "a deterministic hash (e.g. `sha256` over
  the canonicalized `{ conditions, payload }`)"; Story 1.5 pinned the exact scheme in
  `defaultWorkspace.ts:31-37` and `deferred-work.md:38-42` says the real hasher "is authored where
  organisms are authored (Epic 4)". Three candidates were weighed:
  - `packages/domain` (pure, ≥ 90% gate): a probe file with `crypto.subtle.digest` + `TextEncoder`
    DOES typecheck there today — but only because `apps/web`'s `@types/node` devDependency is
    hoisted to the root `node_modules/@types` and TypeScript auto-includes it. That is an
    undeclared dependency of a package whose own fixture code says the opposite
    (`fakeRepositories.ts:38-39`: "packages/* compile with lib: ["ES2022"] and no @types/node"),
    and it would be the first async, first-global-touching code in the domain package. Declaring
    `@types/node` there to make it honest widens a DOM-free package's surface for one function.
  - a hand-rolled synchronous SHA-256 in `@gol/domain`: ~80 lines of bit arithmetic nobody
    reviews — reinventing a wheel to dodge a platform API.
  - `apps/web` with the `dom` lib: `crypto.subtle` and `TextEncoder` are first-class types; the
    jsdom test environment exposes Node's WebCrypto (measured 2026-09-22: a `crypto.subtle.digest`
    call inside `apps/web`'s Vitest jsdom run returns a 64-hex digest — jsdom's own `Crypto` has no
    `subtle`, Vitest keeps Node's global); every known consumer is in `apps/web` (4.16 save, 4.17
    re-save, 4.18 clone copies content and hashes, Epic 5 CONSUMES hashes — `compileEvaluators.ts`
    and the export/import stories never compute one, `deferred-work.md:41`).
  The third wins. The canonicalization is a plain exported function so its test pins the exact
  string, and the async digest is the only platform call. **Secure-context caveat:** `crypto.subtle`
  is `undefined` over plain `http://` on a LAN IP — exactly the condition under which
  `crypto.randomUUID()` already fails on the battle save path (Story 2.13 forced decision 2); the
  honest `TypeError` surfaces through AC5's generic sentence. No fallback, no polyfill.

- **FD2 — `schemaVersion` is stamped from a new `ORGANISM_SCHEMA_VERSION` constant (`1 as const`,
  `@gol/domain`), never `CURRENT_FORMAT_VERSION`, and `CONWAYS_CLASSIC`'s literal stays.** Decision
  I.4: `organism.schemaVersion` is a STAMP "written by whichever `formatVersion` step touches
  rules" and asserted at load — a different axis from the envelope's `formatVersion`. Story 1.5's
  forced decision 3 refused `CURRENT_FORMAT_VERSION` for the seed because "a future `formatVersion`
  bump that does not touch the organism shape silently restamps the seed" — the same argument
  applies to every authored record. A named constant is what a future migration step references;
  a bare `1` in `organismRecord.ts` would be a second literal with no owner. The seed keeps its
  literal (touching `defaultWorkspace.ts` is out of scope), and Task 1's equality test makes the
  two agree by construction.

- **FD3 — The projection is one async function, `projectOrganismForSave(draft, id)`, mirroring
  `projectBattleForSave`; it throws on a rule the gate would have refused and ends with
  `OrganismSchema.parse`; the name is persisted raw.** The `organismDraft.ts` header (`:12-19`)
  already specified the shape: "Story 4.16's save path parses `{ ...rule, contentHash }` per rule";
  `ruleDraft.ts:136-155`'s `parseRuleDraft` is the ONE place a `RuleDraft` becomes engine input and
  its `null` is exactly the gate's rule/condition error set (Story 4.15 FD4). Behind a passed gate
  the `null` branch is unreachable; it throws rather than skips so a future gate/parse divergence
  is a loud generic-failure line, never a silently dropped rule. `OrganismSchema.parse` at the end
  is the "Zod at boundaries" rule — this is the persistence boundary for authored data, and the
  battle path parses `EditableGridPresetSchema` at the same point for the same reason
  (`battleRecord.ts:48-52`). **Name raw:** `organismName.ts:38-41` left "what it persists" to this
  story. Battles persist `battleName` raw including `''` (`BattlePage.tsx:817-819`); the gate
  validated the RAW string's length and the counter showed it; storing a trimmed variant would make
  the persisted value differ from the validated one for no stated requirement. Raw it is; flagged.

- **FD4 — The write happens in the modal, through an injected `organisms: OrganismRepository`
  prop; success is reported through a new lifecycle prop `onSaved(organism)`, and the parent hook
  closes the dialog and defers the caller's `onSaved` to `onExited`.** Why the modal and not the
  Library: the failure line has to live INSIDE the editor beside the unsaved draft (AC5, the 2.13
  shape), and `OrganismLibrary.tsx:200-212` already promised "when it does, it will be a prop typed
  to the interface, passed down from here". Why the hook owns the close: `useOrganismEditorModal`
  is the modal's single lifecycle owner (three phases, inert window, focus restore) and Story 4.23
  will stand in front of ITS close channel — a second close path from a save would be a door the
  guard cannot see. Why the caller's `onSaved` waits for `onExited`: (a) `useInertBackground.ts:66-68`
  sweeps body children appended while a dialog is open, so a status line published at save time
  would be inerted; (b) a Library reload during the fade re-renders the still-mounted modal with a
  `library` that now contains the saved organism, and the Story 4.9 reuse warning would flag the
  organism's own colour ("Glider already uses this color") for ~195 ms — the self-exclusion Story
  4.17 adds does not exist yet.

- **FD5 — The "toast" is the house's in-flow status line on the Library: an always-mounted
  `role="status"` region whose child mounts with the sentence — not MUI `Snackbar`, not a floating
  layer, no auto-dismiss.** UX-DR14 names a toast and the design doc places it after "Editor
  closes" (`:553-559`); nothing in any mockup styles one. `<EditorStatusBar>`'s own note
  (`EditorStatusBar.tsx:290-293`) records the house stance: outcomes are reported in flow, never
  in a floating layer. MUI `Snackbar` would be the first consumer of the no-op
  `--mui-palette-SnackbarContent-bg` token (`deferred-work.md:92`) and needs an authored shade no
  mockup specifies. The always-mounted idiom is the owner's explicit call for this story
  (`deferred-work.md:2054-2079`, corrected 2026-09-21): "the region has to exist before its content
  changes". The zero-rules warning rides the same sentence (the epic's 4.13 AC3, re-homed by the
  4.13 proposal the owner accepted). No timer: a timed dismissal is untestable without fake timers
  across a MUI transition and the status is cleared at the next open anyway; flagged.

- **FD6 — Library refresh is `useAsyncResource.reload()`, stale-while-revalidate, added in this
  story.** The hook's docblock (`useAsyncResource.ts:50-53`) deferred `reload` to "the story that
  does [need it] — written correctly there". This is that story, and 4.17/4.18/4.22 are three more
  callers. The alternative — a `libraryVersion` counter in the deps array (the `<BattleGallery>`
  `reloadToken` idiom) — flips `status` to `'loading'`, unmounts the card grid and the count badge,
  and re-announces the count through its `role="status"` on remount, on every save. A token that
  is an EFFECT dep but not part of the render-phase `sameDeps` reset gives the refetch without the
  reset; the existing liveness flag already makes a superseded request harmless. Additive: no
  consumer changes.

- **FD7 — The in-modal failure line is Story 2.13's `SaveErrorLine` (`role="alert"`,
  conditionally mounted, cleared at the start of each attempt), and the copy comes from the battle
  helper lifted to `apps/web/lib/saveFailureMessage.ts` with a `subject` parameter.** Two copies of
  a three-branch function that differ by a noun is the wrong kind of duplication; a second file in
  `lib/organisms/` would be the second hand copy the house lifts at the third. The move keeps the
  `'battle'` sentences byte-identical (two test files assert them) and changes one import. The
  `role="alert"` (not `status`) is deliberate: a refused write IS an error, and the 4.13 notice it
  replaces was `status` only because it was not one.

- **FD8 — Save is `disabled` during the write, with `transition: 'none'`.** `deferred-work.md:795-801`
  named this story as the first MUI `Button` whose enabled state flips on an axe-scanned route and
  told it to expect the override: MUI `Button` ships a 250 ms `background-color`/`color` transition,
  and an axe scan landing mid-fade measures a contrast no settled state has (`EditorStatusBar.tsx`
  UNDO 2.54:1 / SAVE 3.76:1). The disabled window is the write's duration (a localStorage
  `setItem` — sub-millisecond), but a failed write re-enables the button while the dialog is open
  and the e2e scans right after — the override costs nothing and removes the class of failure.

- **FD9 — Nothing else in the modal changes.** `library` keeps its 4.8/4.9/4.11 semantics (no
  self-exclusion — 4.17); no dirty scope (4.23, AR-33); no footer (4.20); the `'battle'` origin
  still only changes the back label (4.24/4.25); the preview panel is not reset on save (the modal
  unmounts on exit anyway). The refused branch of `handleSave` is moved, not rewritten.

- **FD10 — The `deferred-work.md:38-42` entry closes here, by the pinning test, and the stale
  fixture comment is recorded rather than edited.** AC7's ten-literal test is the "conversation"
  that entry demanded; the hasher matching all ten means no literal is regenerated and no installed
  workspace's rule identity forks. `fakeRepositories.ts:38-39` is a `packages/test-utils` comment
  whose claim FD1 measured false — a package-side edit for a comment is not this story's; it goes
  in the deferred section with the measurement.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx` | **Modified.** Props (`:45-68`), `BUTTON_SX` (`:41`), `SaveNotice`/`SAVE_UNAVAILABLE_NOTICE` (`:164-177`, deleted), the head comment (`:186-228`), the draft and its `seed` (`:245-247`), `noticeRequested` (`:258`), `errors`/`noticeVisible` (`:340-341`), `handleSave` (`:343-353`), the Save button and its comment (`:402-412`), the notice block (`:423-432`). |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` | **Modified.** The `LIBRARY` fixture (`:36`), tests (14)/(15) (`:754-797`), the second (18) (`:888-906`), the 4.14 draft-untouched test (`:1033-1077`), the 4.15 rig (`:1097-1195`) — `enableCanvasRendering`, `installFrameDriver`. |
| `apps/web/lib/organisms/useOrganismEditorModal.ts` (+ `.test.tsx`) | **Modified.** The two-cell lifecycle (`:55-56`), `restoreFocusRef` (`:70`), the focus effect (`:86-103`), `requestCreate`/`handleClose`/`handleExited` (`:106-119`), `modalProps` (`:121-129`). ⚠️ `import type` only from the modal module (`:4-7`, the bundle reason in the header). The test's `Probe` (`:57-79`). |
| `apps/web/components/organisms/OrganismLibrary.tsx` (+ `.test.tsx`) | **Modified.** The `dynamic()` import (`:26`), the props (`:28-31`), the repository comment (`:200-212`), `useAsyncResource` (`:220`), the hook call (`:229`), the toolbar/`aria-busy` structure (`:257-321`), the modal mount (`:324`). Test idioms: `createFakeRepositories`, the `findByRole('dialog')` / `waitFor(not.toBeInTheDocument)` exit wait (`:366-431`), the no-write pin (`:483-503`). |
| `apps/web/lib/useAsyncResource.ts` (+ `.test.tsx`) | **Modified (additive).** `sameDeps` (`:13-15`), the four ⚠️ contracts (`:22-49`), the "`reload` is deliberately not implemented" paragraph (`:50-53`), the render-phase reset (`:69-72`), the effect and its liveness flag (`:74-100`). |
| `apps/web/lib/battle/saveFailureMessage.ts` | **Moved** to `apps/web/lib/saveFailureMessage.ts` (FD7). The three sentences and their reasons (Export not shipped; corrupt ≠ full). Caller: `BattlePage.tsx:12, :832`. Asserted by `BattleEditorView.test.tsx`, `BattlePage.test.tsx:1904-1964`. |
| `apps/web/components/battle/BattlePage.tsx:750-848` | The save shape this story trims to fit: `isSaving`/`savingRef`/`saveError`, clear-at-start, id inside `try`, `finally` release, the fire-and-forget wrapper. `:817-819` — the raw name. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:392-400, 460` | `SaveErrorLine` and its `role="alert"` mount. |
| `apps/web/lib/battle/battleRecord.ts` | `projectBattleForSave` — the projection idiom (`:26-50` comment: a projection, not a state transition; parse at the boundary). |
| `apps/web/lib/organisms/organismDraft.ts` | `OrganismDraft` (`:23-25`), the header's promise about 4.16 (`:12-19`), `createNewOrganismDraft` (`:44-52`), `validateOrganismDraft` (`:93-118`; `:90-91` — "4.16's parse at the persistence boundary is the other view of the same facts". |
| `apps/web/lib/organisms/ruleDraft.ts:55-75, 136-169` | `RuleDraft`, `ParsedRuleDraft`, `parseRuleDraft`, `ruleDraftFrom` (the test fixtures' source of drafts from `SurvivalRule`s). |
| `apps/web/lib/organisms/conditionDraft.ts:14-25, 338-346` | `conditionFromDraft` — "the persisted-shape view, Story 4.16's save" — the parse this story consumes, never re-implements. |
| `apps/web/lib/organisms/previewOrganism.ts` | The SIBLING: `contentHash: rule.id` stand-in (`:29-36`) stays; `PREVIEW_ORGANISM_ID` is never a persisted id. |
| `apps/web/lib/organisms/colorReuse.ts`, `lib/palette/defaultColorToken.ts`, `lib/palette/paletteRegistry.ts` | `usersByColorToken`, `defaultColorToken` (least-used fallback — AC6), `PALETTE` (20 entries — the AC6 fixture). |
| `apps/web/components/organisms/editor/ColorPickerField.tsx:380-390` | The always-mounted `role="status"` idiom the Library's outcome region copies. |
| `packages/domain/src/organismSchema.ts`, `index.ts` | **Modified (one constant).** `OrganismSchema` (`:21-48`) — `schemaVersion` floored at 1, `name.max(50)`, the `#` guard; the constants block (`:9-20`). |
| `packages/domain/src/survivalRuleSchema.ts:79-90` | `SurvivalRuleSchema` — `contentHash: z.string().min(1)`, `conditions.min(1)`; "generation happens where organisms are authored (Epic 4)". |
| `packages/domain/src/defaultWorkspace.ts:25-56, 65-66` | **Unedited.** The pinned scheme and the two Conway literals; `schemaVersion: 1` literal + forced decision 3. |
| `packages/test-utils/src/mockWorkspace.ts:27-37, 40-140` | The eight mock rules under the identical scheme; `createMockOrganisms()`. |
| `packages/persistence/src/repositories.ts:34-50`, `localStorageOrganismRepository.ts:11-16`, `localStorageAccess.ts:20-66` | `OrganismRepository.save` (no validation — the caller's parse is the guard), the read-modify-write over `gol:organisms`, `QuotaExceededError`, `writeKey`'s candidate-string-then-`setItem`. |
| `packages/test-utils/src/fakeRepositories.ts:75-200` | `createFakeRepositories` — `organisms.save` round-trips through JSON; `list()` returns parsed records. The stale `:38-39` comment (FD10). |
| `apps/web/lib/useInertBackground.ts:55-80` | The `MutationObserver` sweep — why nothing is published under an open dialog (FD4). |
| `apps/web/components/battle/BattlePage.tsx:270`, `components/battle/editor/OrganismRoster.tsx:303-390` | `organisms.list()` at mount; `<OrganismSearchAdd>`'s `<select aria-label="Add organism to roster">` — AC4's proof surface. |
| `apps/web/e2e/organisms.spec.ts:1-32, 2119-2146, 2218-2240, 2436-2468` | `openEditor`, the 4.13 helpers, the retargeted test, the `localStorage` read idiom. `battleRoute.spec.ts:440-441` — the roster combobox locator. |
| `docs/implementation-artifacts/deferred-work.md:38-42, 795-806, 1639-1643, 1970-1991, 2016-2048, 2054-2079, 2080-2106` | The hasher entry; the cross-fade trap; the preview stand-in; the 4.13 hand-off (with the toast-host facts); the 4.13 review's dangling-id and `maxLength` notes; the idiom decision; the sticky-`saveAttempted` residuals (they still apply to the refused branch this story does not touch). |
| `docs/implementation-artifacts/4-13-editor-validation-feedback.md` (FD1, FD3, FD7, Open flags) | Why the toast waited; the draft-lags-textbox reasoning that still holds for a pointer Save; the proposed AC text this story implements. |
| `docs/implementation-artifacts/4-15-preview-simulation.md` (FD2, FD4, FD5, Review Findings) | The preview's binding rules (unchanged by a save); the stand-in hash; the review's test-strength lessons. |
| `docs/implementation-artifacts/epic-2/2-13-save-battle.md`, `2-16-*.md` | The save path's forced decisions (id minting, in-flow alert, clear-then-set) and the review that moved `randomUUID` inside `try`. |
| `docs/planning-artifacts/epics.md:34, 109, 143, 170, 173, 183, 195, 239, 1177-1187` | FR-1.2, FR-7.15, NFR-7.2, AR-11, AR-14, AR-21, AR-27, UX-DR14, this story's ACs. |
| `docs/planning-artifacts/architecture.md:276-287` | Decision I (I.2 source-keyed; I.4 stamps are asserted, never branched on). |
| `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md:485-535` | §2.4 — rule identity, the persisted JSON shape (the `sha256:` prefix in its example is superseded by Story 1.5's bare hex). |
| `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md` | Decision 7 (quota: "a failed write also fails the dirty-flag clear" — here: also fails the close). |
| `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:545-565, 747-777` | The save flow (steps 3–5), the canonical messages. |
| `docs/implementation-artifacts/lane-gates.yaml` | No gate on 4.16; this story proposes none. |

### Architecture compliance

- **AR-2 / AR-27 / RFC-001 §1** — the repository reaches the modal as an interface-typed prop
  from `<OrganismLibrary>`, which received it from `app/(gallery)/organisms/page.tsx`'s single
  `createRepositories()`; no component imports `@gol/persistence` for a value other than the two
  error classes (the `saveFailureMessage` precedent). Test: swapping to an API repository edits no
  component.
- **AR-11 / Decision I.4** — `schemaVersion` is a stamp from a named constant; nothing branches on
  it. **AR-21 / RFC-004 §2.4** — opaque `id` (kept from the draft) + deterministic `contentHash`
  (real, pinned scheme). **AR-14 / NFR-7.2 / RFC-006 Decision 7** — quota failure is caught,
  reported non-destructively, and the editor keeps its state; the write path's
  candidate-string-then-`setItem` is what makes "nothing already stored was changed" true.
- **M6 / FR-1.2** — uncapped by the palette; **M9** — Conway's Classic is untouched (the save
  writes one NEW id). **Decision H / FR-7.15** — the saved organism is a library record; no battle
  references it until placed.
- **RFC-005 Decision 1 / AR-33** — `saveError`/`isSaving` are ephemeral UI state in the modal;
  `saveOutcome` is ephemeral UI state in the Library; nothing goes in a ref that is not hot, nothing
  in a store. The editor's dirty scope is still 4.23's.
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)`; no new token; the one
  `transition` change is a removal (`'none'`). **AR-35** — no new dependency; the hasher and the
  projection ride the editor's lazy chunk; the Library's additions are a few hundred bytes.
- **Zod at boundaries** — `OrganismSchema.parse` once per save, in the projection; never per
  keystroke, never in the engine.
- **Spec-id hygiene** — `spec:check` tokenises `FR-1.2`, `FR-2.6`, `FR-7.15`, `NFR-4.1`,
  `NFR-7.2`, `AR-2`, `AR-11`, `AR-14`, `AR-21`, `AR-27`, `AR-33`, `AR-35`, `AR-45`, `AR-46`,
  `RFC-001`, `RFC-003`, `RFC-004`, `RFC-005`, `RFC-006`, `Decision G`, `Decision H`, `Decision I`,
  `Decision J`, `M6`, `M9`, `Story 1.5`, `Story 1.6`, `Story 2.13`, `Story 2.16`, `Story 3.4`,
  `Story 4.9`, `Story 4.13`, `Story 4.14`, `Story 4.15`, `Story 4.16`, `Story 4.17`, `Story 4.18`,
  `Story 4.20`, `Story 4.22`, `Story 4.23`, `Story 4.24`, `Story 4.25`, `Story 5.5`; write them
  exactly so. `UX-DR*`, `FD*`, `AC*` are not checked.

### Library / framework notes (installed versions, no research needed)

- **WebCrypto** — `crypto.subtle.digest('SHA-256', BufferSource)` returns `Promise<ArrayBuffer>`;
  available in every NFR-2.1 browser in a secure context (localhost, https — Playwright's
  `localhost:4173` qualifies) and as Node 24's global; Vitest's jsdom environment keeps Node's
  `crypto` global (measured — see FD1). No `import { createHash } from 'node:crypto'` anywhere in
  `apps/web` (it would not bundle for the browser).
- **`TextEncoder`** — global in the `dom` lib and in Node; UTF-8, which is what `createHash`'s
  `.update(string)` used to generate the literals (default encoding utf8) — the two agree.
- **`JSON.stringify` key order** — insertion order for plain objects, which is why `sortKeysDeep`
  REBUILDS every object via `Object.fromEntries(Object.keys(v).sort().map(…))`; numbers serialise
  without exponent for the values in range here; `pattern: [2, 3]` serialises as `[2,3]`.
- **React 19.2** — `setState` from a resolved promise inside a click handler batches; the `finally`
  block's two `setState`s after `onSaved` land on a still-mounted modal (the parent keeps it
  mounted through the fade) — no "unmounted component" warning exists in React 18+.
- **MUI `Dialog` v9** — `onTransitionExited` fires once per close; `onClose` fires for Escape; a
  `fullScreen` paper cannot receive a backdrop click. `Button` `sx={{ transition: 'none' }}` wins
  over the theme's variant transition (specificity of the emotion class order — the same override
  `EditorStatusBar.tsx` applies through `styled`).
- **Testing Library** — `await user.click(save)` resolves before the async save settles; wrap the
  outcome in `waitFor`/`findBy*`. `vi.spyOn(organisms, 'save').mockRejectedValue(…)` on a
  `createFakeRepositories()` instance works (plain object methods). A deferred promise for the
  re-entrancy test: `let resolve!: () => void; const pending = new Promise<void>((r) => (resolve = r));`.
- **Playwright 1.62** — `page.evaluate` can replace `Storage.prototype.setItem` for the quota test;
  `DOMException` with name `'QuotaExceededError'` is what `isQuotaExceeded` matches
  (`localStorageAccess.ts:36-50`); restore with the captured original. `page.reload()` keeps
  `localStorage`.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a record that skips
  `OrganismSchema` (Task 3 g), a hash that forks identity (Task 2 a — the load-bearing one), a
  toast over a failed write (Task 6 23, Task 8 f), a second click that double-writes (Task 6 25), a
  wedged `isSaving` (26), a Library reload that flashes "Loading…" (Task 8 b), an outcome published
  under a mounted dialog (Task 7 a/b), a repeat that does not re-announce (Task 8 d), a `'battle'`
  sentence that changed (Task 4), a `reload` that resets status (Task 5 a).
- `packages/domain` **stays at 100% per file** — the new constant is one line plus its two tests.
  `packages/persistence`, `packages/simulation`, `packages/test-utils` **untouched**.
- Never snapshot; never assert computed colours in jsdom; never run axe mid-transition (wait for the
  dialog to be gone, or the alert to be visible and the button settled); never click a disabled
  button to prove it is inert (assert `toBeDisabled` and that `save` was called once); never assert
  on the exact `id` value (assert the shape); never regenerate a pinned literal to make Task 2 pass.
- Write every test Tasks 1–9 name **before** ticking the task; record what each test actually does.
  The 4.15 review found tautologies (`dominance: organism!.dominance`), tripwires without a
  positive control (`not.toHaveBeenCalled` alone), and helper copies at the third site — the
  `onSaved`-not-called assertions in Task 6 (22)/(23) need the positive control of (20)/(21) in the
  same file, and the 4.13 e2e helpers are hoisted, not copied.

### Previous story intelligence (Story 4.15)

- The review was 12 test-strength patches and 0 source changes — the pattern since 4.13. The ones
  that recur here: an oracle satisfiable by history (slice after a marker / count calls), a
  `toHaveBeenCalled` where `Times(1)` was available, a `not.toHaveBeenCalled` tripwire with no
  positive control, a helper reaching its third copy (lift it), a docs claim that drifted from the
  code (the Dev Agent Record must say what the tests DO).
- 4.15 established that a Save-gate error set and `parseRuleDraft === null` are the same set (its
  FD4 and `previewOrganismFrom`) — FD3 leans on it; do not add a second validation pass.
- The 4.15 e2e's `paintedCell` reads and `expect.poll` timing idioms are not needed here; the
  4.14 `localStorage` byte-identical idiom IS (Task 9 test 5).
- `lsof -i :4173` before e2e; paste actual exit codes; keep AC text, FD text, comments and the Dev
  Agent Record in step.

### Git intelligence

`main` is at `2e4dcf0` (merge of #66, 4.15). The last app-code commits are 4.15's
(`components/organisms/editor/{PreviewPanel,OrganismEditorModal}.*`,
`lib/organisms/{previewOrganism,ruleDraft}.*`, `lib/battle/useSimulation.ts`,
`components/battle/simulation/TransportControls.*`, `test-support/frameDriver.ts`,
`e2e/organisms.spec.ts`). **Two epics are in progress**: Epic 5's lane has 5.1 merged (#65) and
5.2 (workspace statistics) open on #67; 5.2 reads `battles.list()`/`organisms.list()` through
`useAsyncResource` in `<SettingsPage>` and does not edit the hook, `OrganismLibrary.tsx` (which
5.1 explicitly avoided — `deferred-work.md:2170-2178`), or anything under `components/organisms/**`.
This story's files: `components/organisms/{OrganismLibrary,editor/OrganismEditorModal}.*`,
`lib/organisms/{useOrganismEditorModal,organismRecord,ruleContentHash,saveOutcome}.*`,
`lib/useAsyncResource.*` (additive), `lib/saveFailureMessage.*` (moved from `lib/battle/`),
`components/battle/BattlePage.tsx` (one import line), `packages/domain/src/{organismSchema,index}.ts`
(+ test), `e2e/organisms.spec.ts`, `deferred-work.md`, `sprint-status.yaml`.

### Project Structure Notes

- New: `apps/web/lib/organisms/ruleContentHash.ts` (+ `.test.ts`);
  `apps/web/lib/organisms/organismRecord.ts` (+ `.test.ts`);
  `apps/web/lib/organisms/saveOutcome.ts` (+ `.test.ts`); `apps/web/lib/saveFailureMessage.test.ts`.
- Moved: `apps/web/lib/battle/saveFailureMessage.ts` → `apps/web/lib/saveFailureMessage.ts`.
- Modified: `OrganismEditorModal.tsx` (+ `.test.tsx`); `useOrganismEditorModal.ts` (+ `.test.tsx`);
  `OrganismLibrary.tsx` (+ `.test.tsx`); `useAsyncResource.ts` (+ `.test.tsx`);
  `BattlePage.tsx` (import path only); `packages/domain/src/organismSchema.ts`, `index.ts`,
  `organismSchema.test.ts`; `e2e/organisms.spec.ts`; `deferred-work.md`; `sprint-status.yaml`.
- Naming: `ORGANISM_SCHEMA_VERSION`, `canonicalRuleContent`, `ruleContentHash`,
  `projectOrganismForSave`, `saveFailureMessage(error, subject)`, `ORGANISM_SAVED`,
  `NO_RULES_WARNING`, `saveOutcomeMessage`; modal locals `saveError`, `isSaving`, `savingRef`,
  `saveOrganism`, `handleSave`; styled `SaveErrorLine` (modal), `SaveOutcomeLine` (Library); hook
  `handleSaved`, `pendingSavedRef`, `onSavedRef`; Library locals `saveOutcome`, `onSaved`,
  `openEditor`; data attributes `data-save-error` (modal alert), `data-save-status` (Library
  region), `data-save-outcome` (Library line); props `organisms`, `onSaved`.
- Untouched on purpose: `defaultWorkspace.ts` (+ test), `mockWorkspace.ts`, `fakeRepositories.ts`,
  `previewOrganism.ts`, `previewGrid.ts`, `conditionDraft.ts`, `ruleDraft.ts`, `organismDraft.ts`,
  `organismName.ts`, `RulesEditor.tsx`, `ColorPickerField.tsx`, `PreviewPanel.tsx`,
  `OrganismCard.tsx`, `BattleGallery.tsx`, `SettingsPage.tsx`, `useBattleDraft.ts`,
  `localStorageOrganismRepository.ts`, `themes.css`, `theme.ts`, `playwright.config.ts`,
  `scripts/check-bundle-size.mjs`, `docs/project-context.md`, `lane-gates.yaml`.

### What NOT to build

- ❌ No hasher in `@gol/domain`, no `declare const crypto`, no `@types/node` added to a package,
  no hand-rolled SHA-256, no `node:crypto` import in `apps/web` (FD1).
- ❌ No `sha256:` prefix, no uppercase hex, no hashing of `id` or `schemaVersion` (the scheme).
- ❌ No regenerated literal in `defaultWorkspace.ts` / `mockWorkspace.ts` — if Task 2 (a) is red,
  the hasher is wrong (AC7).
- ❌ No `CURRENT_FORMAT_VERSION` on an organism; no edit to `CONWAYS_CLASSIC` (FD2).
- ❌ No trimming, no display-name fallback stored, no `Untitled`/`Unnamed` persisted (FD3).
- ❌ No repository import or `createRepositories()` in the modal, the hook or the Library; no
  Context; no module singleton (AR-2 / AR-27).
- ❌ No MUI `Snackbar`, no portal, no floating layer, no timer, no `aria-live="assertive"` on the
  outcome (FD5). No status published before `onExited` (FD4).
- ❌ No `'loading'` flash on reload; no second close channel from the save; no guard on the
  save-close (FD4/FD6 — 4.23's dialog is for discards).
- ❌ No dirty scope, no unsaved-changes dialog, no footer, no usage counts, no self-exclusion from
  the reuse warning, no edit mode (4.17/4.20/4.23).
- ❌ No `battles` prop on the Library or the modal (4.19); no roster update on `<BattlePage>` (4.25).
- ❌ No preview reset on save; no `stop()` call; no change to `useSimulation`.
- ❌ No new `--gol-*` token, no hex, no `transition` other than the `'none'` override.
- ❌ No `document.querySelector` from components beyond the hook's existing focus-restore lookup.
- ❌ No `any`, no `as Organism`, no `!` — the projection returns what `OrganismSchema.parse` gives.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **Name persisted raw (FD3).** Trailing/leading whitespace is stored as typed, like battles. If a
  trimmed name is wanted, it is a one-line change in `projectOrganismForSave` — but then the gate's
  counter and the stored length disagree by the whitespace.
- **No auto-dismiss on the outcome line (FD5; in the modal since Task 11).** The sentence stays
  until the next Save attempt or the editor closes. A 5–8 s dismissal is a `setTimeout` in the
  modal plus fake-timer tests; deferred until the 4.17/4.22 flows show whether it reads as
  clutter.
- **The hasher's placement (FD1).** `apps/web` was chosen over `@gol/domain` because of the
  undeclared `@types/node` reach and the package's DOM-free, synchronous character. If the owner
  would rather see rule identity under the ≥ 90% gate, the move is mechanical once `@types/node` is
  declared in `packages/domain/package.json` — and Task 2's ten-literal test moves with it.
- ~~**Escape during an in-flight write** is allowed; the write lands and reports after the close.~~
  Decided 2026-09-22 after review: the close is locked while saving (Task 12), and Save no longer
  closes the editor at all (Task 11).
- **`saveFailureMessage`'s quota advice** still says "delete a battle from the Gallery" for both
  subjects — Export (Story 5.5) is not on `main`; revisit the copy when it is.

### References

- `docs/planning-artifacts/epics.md:1177-1187` (Story 4.16 ACs), `:1140-1151` (4.13 — AC3/AC4
  re-homed here), `:1189-1200` (4.17), `:1264-1275` (4.23), `:34` (FR-1.2), `:109` (FR-7.15),
  `:143` (NFR-7.2), `:170, 173, 183, 195, 201` (AR-11/14/21/27/33), `:239` (UX-DR14).
- `docs/planning-artifacts/architecture.md:276-287` (Decision I).
- `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md:485-535` (§2.4);
  `RFC-006-persistence-workspace-schema.md` (Decision 7); `RFC-001-multi-mode-architecture.md` (§1
  ports); `RFC-005-application-state-modes-undo.md` (Decision 1, the page-boundary loading sketch).
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:545-565,
  747-777`.
- `docs/implementation-artifacts/4-13-editor-validation-feedback.md` (FD1, FD3, FD7, Open flags);
  `4-15-preview-simulation.md` (FD2, FD4, FD5, Review Findings); `epic-2/2-13-save-battle.md`,
  `epic-2/2-16-*.md`; `epic-1/1-5-default-workspace-seeding.md` (forced decisions 2/3);
  `epic-1/1-6-test-utilities-dev-fixture-workspace.md:91-107` (the `node -e` reproduction);
  `epic-3/3-4-*.md` (the cache consumes, never computes).
- `docs/implementation-artifacts/deferred-work.md:38-42, 92, 795-806, 1639-1643, 1970-1991,
  2016-2048, 2054-2079, 2080-2106, 2170-2178`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Framework rules (repositories injected, never imported; three state
  categories; the Canvas grid outside MUI), Language rules (Zod at boundaries; no escape hatches;
  no DOM types in `packages/*`), Critical rules (never persist a numeric ref — the rules persist
  library ids, which `conditionFromDraft` already guarantees; `clearAll` untouched), Testing rules
  (no gate on `apps/web`; shared fixtures from `@gol/test-utils`; the Playwright viewport band),
  Code Quality (AR-46; `spec:check`; comments explain why), Commit gate.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — implement-next-story lane-epic-4 run, 2026-09-22 (create + review).
Implementation and the Tasks 11–12 resume: Claude Sonnet. Resume review: Claude Opus 5.

### Debug Log References

Commands run and their actual exit codes (dev step's local gate, `npm run ci:dev`, plus the
targeted runs along the way):

- `packages/domain` `npx vitest run` — 6 files, 111 tests passed (exit 0), including Task 1's two
  new `organismSchema.test.ts` cases.
- `apps/web` `npx vitest run lib/organisms/ruleContentHash.test.ts` — 17 tests passed (exit 0),
  all ten pinned literals reproduced byte-for-byte on the first run (no regenerated literal).
- `apps/web` `npx vitest run lib/organisms/organismRecord.test.ts` — 8 tests passed (exit 0).
- `apps/web` `npx vitest run lib/saveFailureMessage.test.ts lib/organisms/saveOutcome.test.ts` — 9
  tests passed (exit 0).
- `apps/web` `npx vitest run lib/useAsyncResource.test.tsx` — 12 tests passed (exit 0; 4 new
  `reload()` cases).
- `apps/web` `npx vitest run components/organisms/editor/OrganismEditorModal.test.tsx` — 66 tests
  passed (exit 0; tests (14)/(15)/the second (18) deleted, the 4.14 draft-untouched test
  retargeted, tests (20)-(30) added).
- `apps/web` `npx vitest run lib/organisms/useOrganismEditorModal.test.tsx` — 14 tests passed
  (exit 0; 6 new save-close cases).
- `apps/web` `npx vitest run components/organisms/OrganismLibrary.test.tsx` — 30 tests passed
  (exit 0; 2 pre-existing count-badge assertions rescoped for the new second `role="status"`
  region, 8 new save-flow cases (a)-(g)).
- `apps/web` `npx vitest run` (whole app) — 117 files, 1925 tests passed (exit 0).
- `npm run typecheck` — exit 0 (one round-trip: `vi.fn()` without an explicit generic in
  `useAsyncResource.test.tsx` inferred `T` as `{}`; fixed with `useAsyncResource<string>(...)`).
- `npm run lint` — exit 0 (two round-trips: a `react-hooks/refs` error from reading `useRef(...)
  .current` during render in the hook test's `Probe`, fixed with a lazy `useState` initialiser
  instead; an `exhaustive-deps` warning on `onSaved`'s `useCallback`, fixed by depending on
  `resource` itself rather than `resource.reload`).
- `npm run format:check` — exit 0 (two round-trips, `prettier --write` on the touched files).
- `npm run spec:check` — exit 0 (261 cited ids resolve).
- `npm run boundary:check` — exit 0.
- `npm run test:coverage` (full monorepo) — exit 0; `packages/domain` at 100% all files;
  `apps/web/lib/organisms/{ruleContentHash,organismRecord,saveOutcome}.ts` and
  `components/organisms/OrganismLibrary.tsx` at 100%.
- `npm run build:standalone` — exit 0, all 6 routes prerendered.
- `npm run bundle:check` — exit 0; see Bundle notes below.
- `npm run bench` / `npm run bench:check` — exit 0; NFR-1.1 frame at 100×60×20 measured 6.912–8.4
  ms against the 16.667 ms budget across two runs (49.6%–58.5% headroom) — comfortably green, no
  gate change needed.
- `npx playwright test e2e/organisms.spec.ts --project=chromium` — first run: 101 passed, 2
  pre-existing failures (`organism card grid (Story 4.2)`'s two count-badge assertions, broken by
  the new second `role="status"` region) — fixed by scoping both to
  `.filter({ hasText: /Organisms?$/ })`; second run: 103 passed (exit 0), including all 7 new
  Story 4.16 e2e tests (happy path, zero rules, FR-7.15, focus, quota, keyboard, axe).
- `npm run ci:dev` (full local gate, both scoped and whole) — first run failed on
  `format:check` (unformatted `apps/web/e2e/organisms.spec.ts`); second run exit 0 — typecheck,
  lint (1 pre-existing unrelated warning in `BattleGallery.tsx`), format:check, spec:check,
  boundary:check, `test:coverage` (117 files / 1925 tests), `build:standalone`, `bundle:check` (all
  5 routes within budget), `bench`/`bench:check` (green), `e2e:chromium` (238 passed, whole suite).

---

**Resume (2026-09-22): review continuation implementing Tasks 11 and 12.**

- `apps/web` `npx tsc --noEmit` (repo-wide, run repeatedly across the session) — exit 0 throughout,
  no round-trips needed.
- `apps/web` `npx eslint` on every touched file — exit 0, no warnings introduced.
- `apps/web` `npx vitest run lib/organisms/useOrganismEditorModal.test.tsx` — 15 tests passed
  (exit 0); the "a save-close" describe block rewritten to "a save" (Task 11): the save-arriving
  test no longer closes the dialog, a new "two saves then Back fires once with the SECOND record"
  case added, and the dead "record arriving after an Escape-close has fully exited" scenario (and
  its `mountedRef` support code) removed — Task 12's close-lock makes a write resolving after an
  exit unreachable.
- `apps/web` `npx vitest run components/organisms/editor/OrganismEditorModal.test.tsx` — 74 tests
  passed (exit 0; up from 67): three Story 4.9 tests rescoped off `getByRole('status')` (now
  ambiguous — a second `role="status"` region, the save outcome, lives in this dialog too) onto
  `[data-color-reuse-status]`; (25)/(25b) rewritten for "released after every outcome" and "same id
  upserted, `list()` grew by ONE"; four new cases added — (31) the outcome line publishes and the
  dialog stays open, (32) it clears-then-refills across two attempts, (33)/(34) focus returns to
  Save after a successful and a rejected write (proven by an explicit `blur()` — jsdom does not
  itself implement the browser's disabled-drops-focus fixup, unlike a real engine, so the test
  simulates that fixup rather than relying on it) — plus a `close is locked while saving (Task 12)`
  block: Escape, a Back click and the ✕ button are all no-ops while a write is in flight, and each
  closes normally once it has settled.
- `apps/web` `npx vitest run components/organisms/OrganismLibrary.test.tsx` — 30 tests passed
  (exit 0): the count-badge test restored to the pre-4.16 single-`role="status"` selector (Task 11
  removed the Library's own status region, so the ambiguity Task 8 introduced is gone); tests
  (a)/(c)/(d)/(e)/(f)/(g) rewritten against the new flow (Save → assert the in-dialog outcome, THEN
  Back → assert the reload/refocus effects); (b) likewise, plus (d) retargeted from "reopening
  empties the region" (no longer meaningful — the modal remounts fresh either way) to "a second
  Save in the same session clears then re-fills the outcome line; Back adds exactly ONE card, with
  the LATEST name" (Task 11's upsert pin, exercised through the real wire).
- `apps/web` `npx vitest run` (whole app) — 117 files, 1934 tests passed (exit 0); a single flake
  reproduced under full-suite concurrency (`BattlePage.modeToggle.test.tsx`'s unrelated focus-restore
  case, nothing to do with this story's files) — confirmed green in isolation on two separate runs,
  the same class of contention flake `docs/project-context.md` records for the Playwright matrix.
  (Resume review note: a run in which that flake fired cannot have exited 0 — the exit code and
  the flake come from different runs of the same command; `ci:dev`'s own `test:coverage` stage
  below is the exit-0 record that counts.)
- `npm run build:standalone && npm run bundle:check` — exit 0; `/organisms` first load 295.6 KB /
  305 KB gzip (9.4 KB headroom) — down from the review's 295.8 KB (9.2 KB), the −0.2 KB the removed
  status region + `saveOutcomeMessage` import were expected to cost (Task 11's own prediction, now
  measured); the other four routes unchanged (home 333.6 KB, battle 309.4 KB, battle/new 309.2 KB,
  settings 291.3 KB — all within budget). The lazy editor chunk (`0dja1743kxpn1.js` in this build)
  measured 46.4 KB raw / 13.1 KB gzip, against the review's recorded ~46.8 KB / 13.2 KB — flat to
  very slightly smaller: the new `saveStamp`/`saveOutcome`/focus-effect code roughly offsets what
  Task 11 deleted from the modal (the old "hold after success" branching) and Task 12 added
  (`handleRequestClose`), so no ±0.5 KB explanation is owed.
- `npx playwright test e2e/organisms.spec.ts --project=chromium` — 104 passed (exit 0): the seven
  Story 4.16 tests retargeted (Save now asserts the in-dialog `[data-save-outcome]` first, then a
  `Back to Library` click reaches the card/badge/focus effects) plus one new test, "Save, rename,
  Save again, Back: exactly one new card, with the second name" (Task 11's e2e pin); the three
  count-badge assertions across the file (`organism card grid`, search, and the 4.16 block's
  `countBadge` helper) reverted to the pre-4.16 plain `page.getByRole('status')` — the Library has
  exactly one `role="status"` element again now that the outcome region lives in the modal.
- `npm run ci:dev` (full local gate) — first run failed on `format:check` (unformatted
  `OrganismEditorModal.tsx` and `OrganismLibrary.test.tsx`, `prettier --write`'d); second run
  **exit 0** — typecheck, lint (the same 1 pre-existing unrelated `BattleGallery.tsx` warning),
  format:check, spec:check (261 ids resolve), boundary:check, `test:coverage` (117 files / 1934
  tests, `packages/domain` 111, `@gol/simulation` 407, `@gol/persistence` 82, `@gol/test-utils` 89),
  `build:standalone`, `bundle:check` (all 5 routes within budget), `bench` (NFR-1.1 frame 8.748 ms
  against 16.667 ms, 47.5% headroom) / `bench:check` (green), `e2e:chromium` (239 passed, 1 skipped,
  whole suite, including all 8 Story 4.16 tests).

### Completion Notes List

- **Task 1** — `ORGANISM_SCHEMA_VERSION = 1 as const` added to `packages/domain/src/organismSchema.ts`
  beside `NEW_ORGANISM_DOMINANCE`, exported from `index.ts`. Two tests: the schema accepts it, and
  `CONWAYS_CLASSIC.schemaVersion === ORGANISM_SCHEMA_VERSION` (FD2's by-construction agreement).
  `CONWAYS_CLASSIC`'s literal `1` untouched. `packages/domain` stays at 100% per file.
- **Task 2** — `apps/web/lib/organisms/ruleContentHash.ts`: `canonicalRuleContent` (pure,
  `sortKeysDeep` over `{ conditions, payload }`) + `ruleContentHash` (async, WebCrypto
  `crypto.subtle.digest('SHA-256', …)`), per FD1. All ten pinned literals (Conway's two, the eight
  AR-45 mocks from `createMockOrganisms()`) reproduce byte-for-byte — verified independently with a
  `node -e` + `createHash('sha256')` probe before writing the implementation. 17 tests.
- **Task 3** — `apps/web/lib/organisms/organismRecord.ts`: `projectOrganismForSave(draft, id)` —
  per rule `parseRuleDraft` (throws, names the rule id, on a `null` — unreachable behind a passed
  gate), concurrent hashing via `Promise.all` (list order preserved), `OrganismSchema.parse` at the
  end. 8 tests, including the schema-boundary pin (a 51-char name throws a `ZodError`) and proving
  the parse and the hash together.
- **Task 4** — `saveFailureMessage.ts` moved `lib/battle/` → `lib/` and gained a
  `subject: 'battle' | 'organism'` parameter; the three `'battle'` sentences stayed byte-identical
  (new test file pins all six by class × subject). `BattlePage.tsx`'s one import/call site updated.
  `apps/web/lib/organisms/saveOutcome.ts`: `ORGANISM_SAVED`, `NO_RULES_WARNING`,
  `saveOutcomeMessage()` — 3 tests.
- **Task 5** — `useAsyncResource` gained `reload()`: a `reloadToken` state bumped by a stable
  callback, appended to the EFFECT's own dependency array only (never to the caller's `deps`, so it
  never trips the render-phase `sameDeps` reset back to `'loading'`). 4 new tests: stale-while-
  revalidate (old value until settle), a superseded reload dropped by the existing liveness flag,
  stable identity across renders, recovery from `'error'`.
- **Task 6** — `OrganismEditorModal`: `organisms: OrganismRepository` and `onSaved(organism)` added
  to props; `SaveNotice`/`SAVE_UNAVAILABLE_NOTICE`/`noticeRequested`/the notice block deleted;
  `SaveErrorLine` (`role="alert"`, `data-save-error`) added in the same slot. `handleSave` replaced
  by `saveOrganism` (async, total: gate → mint id inside `try` → project → `organisms.save()` →
  `onSaved`, or `saveFailureMessage` into `saveError`) + a fire-and-forget wrapper. Save gained
  `disabled={isSaving}` and `sx={{ ...BUTTON_SX, transition: 'none' }}` (FD8). Tests (14)/(15)/the
  second (18) deleted (the honest-notice tests — the notice no longer exists); the 4.14
  draft-untouched test's final assertion retargeted from `[data-save-notice]` to `onSaved` called +
  the name still "Glider". 11 new tests (20)-(30) added via a per-test `mountModal(overrides?)` rig
  (`createFakeRepositories` fresh per call): the happy-path save (schema-parses, uuid id, pinned
  hash), zero-rule save, the refusal positive control, all three failure sentences (quota/corrupt/
  generic) non-destructively, the clear-at-start-of-next-attempt idiom (both the deferred-success
  and the refused-after-failure cases), re-entrancy (one `save` call, disabled while pending),
  `crypto.randomUUID` throwing (the wedge test — a second real attempt still goes through), the
  uncapped-by-palette case (a 20-organism library covering every token), axe with the error line
  visible, and that a save mid-preview-run does not disturb `[data-status]`/`[data-cycle]` on the
  dish. All 50 pre-existing `render(` calls in the file migrated to the rig mechanically (no
  assertion touched); two multi-line `render(<OrganismEditorModal …/>)` calls outside the rig's
  reach (the `open={false}` test and the Escape-mid-run rerender test) were given the two new props
  by hand. 66 tests total in the file.
- **Task 7** — `useOrganismEditorModal(origin, options?: { onSaved? })`: `pendingSavedRef` stashes
  the saved record across the exit transition; `handleSaved` is the SAME close channel as
  `handleClose` (unguarded — a save is the opposite of a discard); `handleExited` hands the record
  to `onSavedRef.current` (a latest-value ref, assigned in an effect) only AFTER `mounted` clears.
  `modalProps` gained `onSaved: handleSaved`; its memoised identity is unaffected by a changing
  `onSaved` option (asserted). 6 new tests appended to the existing 8; the `Probe` builds a fresh
  fake `organisms` per instance via a lazy `useState` initialiser (not `useRef(...).current`, which
  a new `react-hooks/refs` lint rule flags as a render-time ref read). 14 tests total.
- **Task 8** — `<OrganismLibrary>`: `saveOutcome` state, an `onSaved` callback
  (`resource.reload()` + `setSaveOutcome(saveOutcomeMessage(organism))`), an `openEditor` wrapper
  (clears the outcome, then `requestCreate()`) wired to the create button. An always-mounted
  `<div role="status" data-save-status>` added BETWEEN the toolbar and the `aria-busy` wrapper,
  never inside it. `organisms` passed straight through to the modal (the same prop this component
  received). Two pre-existing count-badge assertions rescoped (`getByRole('status')` now matches
  two elements — the count badge is the one filtered by `/Organisms?$/`). 8 new tests (a)-(h): the
  region exists before any save, the same count-badge DOM node survives a save (no `'loading'`
  reset, `list()` called exactly twice), the zero-rule warning sentence, the region clears on
  reopen and re-fills on a second save, focus after a save-close, a rejected save leaves the region
  empty and the dialog open, axe with the outcome line visible, plus the existing no-write-across-
  open/close-cycle test (AC10's pin, unchanged). 30 tests total in the file.
- **Task 9** — `cardGroup`/`row`/`save` hoisted from the 4.13 describe block to file scope (module
  level, beside `openEditor`) — the 4.16 block reuses them, no copies. Seven new e2e tests: happy
  path (save → close → outcome line → card → `gol:organisms` parsed with `schemaVersion: 1`, a
  64-hex `contentHash`, the default condition → survives a `page.reload()`), zero rules (both
  sentences), FR-7.15 (the roster combobox on `/battle/new` offers the saved organism), focus
  (create button, with the WebKit "not inside a dialog" branch), quota (a real `Storage.prototype
  .setItem` override, the alert sentence, `gol:organisms` byte-identical, a restored retry
  succeeding), keyboard (focus Save, Enter), axe (outcome line visible, then the alert visible).
  The old 4.13 "zero rules is not refused; the notice is honest" test deleted (superseded by the
  4.16 zero-rules test); two pre-existing 4.2-block count-badge assertions rescoped for the same
  reason as Task 8's unit tests. 103 e2e tests in the file, all green on Chromium; 238 across the
  whole e2e suite under `npm run ci:dev`.
- **Task 10** — `deferred-work.md:38-42`'s hasher entry struck `✅ Closed in Story 4.16` with the
  hasher's path and the ten-literal test; a new `## Deferred from: Story 4-16-create-save-organism`
  section added with the seven items the story's Dev Notes named (the two live-region idioms, no
  auto-dismiss, raw/untrimmed name, the stale `fakeRepositories.ts` comment measured false,
  `useAsyncResource.reload` as a migration candidate for `<BattleGallery>`, Escape-during-write
  allowed, and 4.17's open `id`/`schemaVersion` policy question). Bundle
  (`npm run build:standalone && npm run bundle:check`), all five routes within budget: home 333.6
  KB/340 KB (6.4 KB headroom), battle 309.4 KB/310 KB (0.6 KB), battle/new 309.2 KB/310 KB (0.8 KB),
  organisms 295.8 KB/305 KB (9.2 KB headroom — Story 4.15 recorded 295.6 KB / 9.4 KB, so the move
  is +0.2 KB, inside Task 10's ±0.5 KB band: the status region + `saveOutcomeMessage` are what land
  on `/organisms`'s first load; the editor chunk, which carries the hasher/projection/failure-helper
  growth, is lazy and outside every route's first-load measurement — re-measured in the 2026-09-22
  review at 13.2 KB gzip / 46.8 KB raw for the whole chunk, and the review corrected this
  paragraph, whose first version cited a "11.5 KB → 9.2 KB, ~2.3 KB move" that no 4.15 record
  contains), settings 291.3 KB/305 KB (13.7 KB). `sprint-status.yaml` updated to `in-progress` at
  start, `review` at the end.

- **Task 11 (2026-09-22 resume)** — Save keeps the editor open (AC2/AC3 as amended, the owner's
  "match the Battle Editor" call). `OrganismEditorModal.tsx`: `saveStamp: { id: string } | null`,
  set on the first success and read back on every later attempt in the SAME mount, so
  `organisms.save()` upserts one organism instead of minting a sibling; `saveOrganism` restructured
  to a plain `try`/`catch`/`finally`, releasing `isSaving`/`savingRef` on BOTH outcomes again (the
  review's "hold after success" patch is dead — the dialog no longer unmounts on save) and calling
  `onSaved(record)` AFTER the `finally`, outside the `try`/`catch`, only on success — the id-mint
  and `onSaved`-outside-`try` properties from the original implementation are both preserved, just
  re-homed around the new structure. `saveOutcome` state (`null` = nothing to report, cleared
  alongside `saveError` at the start of every attempt) feeds an always-mounted
  `<div role="status" data-save-status>` between the header and `SaveErrorLine`, whose child
  (`SaveOutcomeLine`, moved verbatim from the Library) mounts with `saveOutcomeMessage(record)`.
  `saveOutcomeMessage` is now imported by the modal, not the Library. A `saveButtonRef` plus a
  settle counter (`saveSettledSeq`) drive a `useEffect` that calls `.focus()` on Save once the DOM
  has actually committed `disabled={false}` — a synchronous call inside the handler would target a
  still-disabled button and be a no-op. Hook (`useOrganismEditorModal.ts`): `handleSaved` now only
  overwrites `pendingSavedRef` (the LAST record wins) and no longer calls `setDialogOpen(false)`;
  the `mountedRef` late-save branch (dead once Task 12's close-lock lands — a write can never
  resolve after an exit any more) removed along with its test. Library (`OrganismLibrary.tsx`):
  `onSaved` is `reload()` only; `saveOutcome`/`SaveOutcomeLine`/the `[data-save-status]` region/the
  `openEditor` wrapper all removed (the create button's `onClick` goes back to `requestCreate`
  directly); the `Organism` type import and the now-unneeded rescoped count-badge selectors go with
  them. Tests and e2e retargeted throughout (see Debug Log); docs (`organism-editor-design.md`,
  `ux-design-complete.md`) and `deferred-work.md` updated to match (see below and Task 12).
- **Task 12 (2026-09-22 resume)** — lock the close while a write is in flight (the owner's review
  decision (b), superseding the story's original "allowed" open flag). `OrganismEditorModal.tsx`:
  one guarded handler, `handleRequestClose` (`if (savingRef.current) return; onClose();`), wired to
  the `Dialog`'s `onClose` (Escape, and the backdrop — unreachable under `fullScreen`, kept for
  documentation) and the ✕ `IconButton`'s `onClick`; the Back button gets `disabled={isSaving}`
  directly rather than routing through the guard, since it is a visible control the user can see go
  inert. `deferred-work.md`'s "Escape during an in-flight organism save is allowed" entry struck
  `✅ Closed in Story 4.16 (review decision (b), Task 12)`, with the three residuals the review's
  `[Review][Decision]` raised recorded as resolved (no exit can happen mid-write; a resolved save
  closes nothing since the editor stays open; the typed text is visible on screen and the next Save
  upserts it) and the now-dead late-save patch noted retired. The review's own `[Review][Decision]`
  item ticked with "(b), implemented in Task 12." Three new tests pin the lock (Escape, a Back
  click via `fireEvent` — bypassing React's synthetic disabled-click suppression to pin the
  `disabled` attribute itself, not merely a handler guard — and the ✕ button), each also proving the
  close works again once the write settles.

### File List

**New**
- `apps/web/lib/organisms/ruleContentHash.ts` (+ `.test.ts`)
- `apps/web/lib/organisms/organismRecord.ts` (+ `.test.ts`)
- `apps/web/lib/organisms/saveOutcome.ts` (+ `.test.ts`)
- `apps/web/lib/saveFailureMessage.test.ts`

**Moved**
- `apps/web/lib/battle/saveFailureMessage.ts` → `apps/web/lib/saveFailureMessage.ts`

**Modified**
- `packages/domain/src/organismSchema.ts`, `packages/domain/src/index.ts`,
  `packages/domain/src/organismSchema.test.ts`
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx` (+ `.test.tsx`)
- `apps/web/lib/organisms/useOrganismEditorModal.ts` (+ `.test.tsx`)
- `apps/web/components/organisms/OrganismLibrary.tsx` (+ `.test.tsx`)
- `apps/web/lib/useAsyncResource.ts` (+ `.test.tsx`)
- `apps/web/components/battle/BattlePage.tsx` (one import path + one call-site argument)
- `apps/web/e2e/organisms.spec.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/4-16-create-save-organism.md` (Tasks 11/12, Review Findings decision tick, this record)
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md` (Task 11)
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/ux-design-complete.md` (Task 11)

### Change Log

| Date | Change |
|---|---|
| 2026-09-22 | Code review (opus): 16 patches applied — Save held after a successful write (double-write during the exit fade), late save after an Escape-close reported at once instead of replayed on the next close, `onSaved` outside the `try`, `reload` destructured, test-strength fixes ((20)(22)(24)(25)(25b), Library (a), `useAsyncResource` superseded-load with an `act` positive control, `organismRecord` (g) `ZodError`), `sortKeysDeep` predicate, four comment/doc corrections (SAVE_SX, `ORGANISM_SCHEMA_VERSION`, `saveFailureMessage` head, bundle narrative), `deferred-work.md:38` struck, AC9/Task 8 conflict noted; 2 defers; 1 `[Review][Decision]` left open (Escape during an in-flight write). Status → in-progress. |
| 2026-09-22 | Story 4.16 implemented: `ORGANISM_SCHEMA_VERSION`, the real `contentHash` hasher, the save projection, the two message helpers, `useAsyncResource.reload()`, the modal's write path, the hook's save-close channel, the Library's outcome line, e2e coverage, and deferred-work bookkeeping. Status → review. |
| 2026-09-22 | Resume review (opus): 13 patches applied — `!open` guard on Save during the exit fade (test (36)), loose-focus-only refocus (test (35)), `saveStamp`/outcome set before the guard release and set once, the second Story 4.2 count-badge assertion restored, Back's disabled trio, five spy-wait fixes, like-for-like Escape test, the clear-at-start pin rewritten ((32), Library (d)), Library (a) asserted past the fade, hook/modal/deferred-work wording on what the lock does and does not cover, story-file bookkeeping (AC9/AC11/Open flags/FD banner/Review Findings marks/Debug Log), `deferred-work.md` strikes, UX-doc pointer and close paths; 1 defer (4.24/4.25 "Save & Close" planning lines); 1 `[Review][Decision]` left open (✕ enabled-but-inert while saving). Status → in-progress. |
| 2026-09-22 | Owner decisions after review, implemented: Task 11 — Save keeps the editor open (AC2/AC3 amended); the outcome line, `saveStamp` upsert-by-id and the focus-restore effect all move into/onto the modal, the Library's own status region and `openEditor` wrapper are removed. Task 12 — the close (✕/Back/Escape) is locked while a write is in flight, resolving the review's `[Review][Decision]` as option (b). Tests and e2e retargeted; docs (`organism-editor-design.md`, `ux-design-complete.md`, `deferred-work.md`) updated. `npm run ci:dev` green end to end (typecheck, lint, format, spec:check, boundary:check, 1934 unit/coverage tests, build:standalone, bundle:check, bench/bench:check, 239 e2e on Chromium). Status → review. |

---

Dev Model: sonnet   # every shape is a settled precedent (2.13's save path, 4.13's gate, 4.9's live region, battleRecord's projection); the two new facts — the hash scheme and the schemaVersion axis — are pinned by ten literals and a domain constant, so there is nothing to design, only to follow

Proposed lane gate: none   # `useAsyncResource` gains one additive field and no Epic 5 story edits that file; 5.2 (#67) reads through it unchanged; nothing in Epic 5 depends on the organism save path (5.3/5.5/5.8 consume `contentHash`, never compute it)

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 42s | 42s | 26 | 4,079 | 12,165 | 764,598 | 780,868 |
| Step 1 — create | opus-5 | 1 | 19m 49s | 19m 49s | 256 | 85,747 | 977,000 | 22,375,065 | 23,438,068 |
| Step 2 — implement | sonnet-5 | 1 | 34m 39s | 34m 39s | 900 | 140,949 | 1,010,043 | 129,289,618 | 130,441,510 |
| Step 3 — review + PR | opus-5 | 4 | 20m 04s | 20m 04s | 536 | 137,229 | 1,084,531 | 36,015,722 | 37,238,018 |
| _of which the orchestrator_ | opus-5 | — | — | — | 64 | 20,810 | 44,791 | 2,104,198 | 2,169,863 |
| **Total (create → PR ready)** | | 6 | **1h 15m** | 1h 15m | 1,718 | 368,004 | 3,083,739 | 188,445,003 | **191,898,464** |

Run started 2026-09-22 08:40 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
