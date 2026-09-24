---
baseline_commit: e06da2e898ed63243f705ea07ea32a4b27ae4c78
---

# Story 5.4: Rule-Aware Organism Closure

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want battle exports to carry every organism they truly depend on,
so that an imported battle never has dangling references.

## Acceptance Criteria

From `epics.md#Story 5.4: Rule-Aware Organism Closure` (`:1357-1367`), decomposed into what a reviewer
can check independently, plus the two obligations earlier stories handed forward to this one: Story
5.3 left `exportBattle` and the `kind: 'battle'` cardinality refinement here (`workspaceSerializer.ts:47-48`,
`workspaceExportSchema.ts:151-155`, `deferred-work.md:2640-2647`), and Story 4.19 built the forward edge
this story walks (`ruleReferenceIndex.ts` → `ruleTargetIds`, `lane-gates.yaml:45-49`). **Read FD1–FD10
before touching a file.**

1. **The closure is a pure `@gol/domain` derivation.** New module `packages/domain/src/organismClosure.ts`:
   `organismClosure(seedIds, library)` where `seedIds: readonly string[]` and
   `library: readonly T[]` with `T extends Pick<Organism, 'id' | 'survivalRules'>`, returning
   `readonly T[]` — the library's own records (same references, FD4), **in library input order**,
   restricted to the transitive closure. Pinned:
   - every seed id present in the library is included, even one with no rules;
   - an included organism whose rules target another (an `organismType` condition's `pattern`,
     Decision E) pulls that one in, and so on transitively (Decision E.5(b), RFC-006 Decision 4);
   - **chained**: A targets B, B targets C, seeds `[A]` ⇒ `{A, B, C}`;
   - **cycles terminate**: A↔B, and A→B→C→A, each return the three/two organisms exactly once and
     the call returns (no stack overflow, no infinite loop);
   - an organism targeted only by an organism OUTSIDE the closure is **not** included (the walk is
     forward from the seeds, never the reverse index — FD2);
   - an organism nobody reaches is not included, even if it targets a closure member;
   - a seed or rule target absent from the library (dangling) is skipped without throwing, and the
     walk continues past it for everything else (FD5);
   - a repeated seed id, or two paths to one organism, still yield it once;
   - empty seeds ⇒ `[]`; empty library ⇒ `[]`;
   - the input array and its records are not mutated, and the returned array is fresh (never the
     `library` array itself, even when every organism is in the closure).

2. **The closure reuses Story 4.19's forward edge — no duplicate logic.** The only way the module
   learns what an organism targets is `ruleTargetIds(organism)` imported from `./ruleReferenceIndex`.
   ⚠️ A diff that reads `survivalRules`, `conditions`, `property === 'organismType'` or `pattern`
   anywhere in `organismClosure.ts` fails this AC — that is the second definition of "a rule targets
   X" `lane-gates.yaml` gated this story to prevent. Nor does it call `buildRuleReferenceIndex`
   (the reverse index answers "who targets X", the wrong question for a forward walk — FD2).
   `ruleReferenceIndex.ts` itself is **not modified** (its body, signature and tests stay
   byte-identical); only the one head-comment sentence that says the closure "is Story 5.4's" may be
   updated to name the new module (Task 6).

3. **`WorkspaceSerializer` gains `exportBattle(battle)`.** In
   `packages/persistence/src/workspaceSerializer.ts`:
   `exportBattle(battle: Battle): Promise<WorkspaceExportWire>` — reads `repos.organisms.list()`,
   computes `organismClosure(battle.organismIds, library)`, and returns
   `toEnvelope('battle', [battle], closure, { appVersion, exportedAt: now() })`. Pinned by tests in
   `workspaceSerializer.test.ts` (using `createFakeRepositories`, per the file's existing header):
   - the envelope is `kind: 'battle'`, carries exactly the one battle, and passes
     `WorkspaceExportSchema.parse`;
   - its `organisms` are exactly the rule-aware closure: a battle placing only Chaotic Spreader
     (whose rule targets Aggressive Colonizer, `mockWorkspace.ts:113-127`) exports both, and does
     **not** export an unplaced, unreferenced library organism;
   - a chained case through the repository (A placed, A→B→C) exports A, B and C;
   - the battle's cells are the battle passed in — **not** whatever `repos.battles` holds under the
     same id (FD1: the editor's in-memory battle is the source, never the saved copy);
   - `appVersion` and `exportedAt` come from the injected deps, exactly as `exportWorkspace`'s do;
   - `settings` is absent from the envelope (AR-12).
   `exportWorkspace` is unchanged, and so is its `listFull()` read.
   **⟶ Superseded in part 2026-09-24 (owner ruling (b), Review Findings):** the signature is now
   `exportBattle(id: string)` — it reads `repos.battles.load(id)` then `repos.organisms.list()`,
   and rejects with `ExportError('not-found')` for an unknown id. The "battle passed in, not
   whatever `repos.battles` holds" bullet is withdrawn (it described FD1, now reverted) and its test
   removed; a not-found test and a corrupt-record (`CorruptDataError`) test replace it. Every other
   bullet above still holds and is still pinned.

4. **`kind: 'battle'` means exactly one battle — in the schema of record.** `WorkspaceExportSchema`'s
   existing `superRefine` gains: `kind === 'battle' && battles.length !== 1` ⇒ a `custom` issue at
   path `['battles']`, with a message naming the rule. This is the half of the Story 5.3 review
   decision the owner handed to this story (`deferred-work.md:2640-2647`). Pinned:
   - the Story 5.3 test "does NOT constrain how many battles a kind carries" is **replaced**, not
     deleted-and-forgotten: `kind: 'battle'` with zero battles and with two battles each fail with an
     issue at `['battles']`; with one battle it parses;
   - `kind: 'workspace'` with zero, one and several battles still parses (cardinality is the battle
     kind's rule only);
   - the duplicate-id refinement is untouched and still fires independently (a `kind: 'battle'`
     envelope with one battle and two organisms sharing an id still fails at `['organisms']`);
   - the `⚠️ CARDINALITY IS NOT HERE` comment is rewritten to say what is now here and why, not left
     contradicting the code.
   The schema does **not** check the organism closure (that is Story 5.8's `assertReferentialClosure`,
   RFC-006 Decision 5 — FD7).

5. **Everything pure lands under the ≥90% per-file gate (AR-39, NFR-5.1).** `organismClosure.ts` is
   at **100% on all four metrics** (`perFile: true`; `include: ['src/**/*.ts']` measures it whether or
   not a test imports it). No `zod` import, no DOM type, no repository, no memoization or module-level
   state (`"sideEffects": false`), no new dependency in any `package.json`. `@gol/persistence` stays at
   its ~80% aggregate tier. The closure's logic is tested in `packages/domain`, never only through the
   serializer (project-context: "If you are testing that logic through a repository, it is in the
   wrong package").

6. **Barrel and scope.** `organismClosure` is exported from `packages/domain/src/index.ts` in a **new
   block appended at the end of the file** (FD8 — the two-lane barrel rule). No file under `apps/web`
   is modified: the "EXPORT BATTLE" button, the "Battle only / Entire Workspace" dialog, the filename
   and the download are Story 5.6's. `npm run ci:dev` is green, including `spec:check` on every ID the
   new comments cite and `bundle:check` unchanged.

7. **The stale notes that point at this story are corrected in place.** `workspaceSerializer.ts`'s
   factory JSDoc ("`exportBattle(id)` is deliberately absent … Story 5.4's"), the
   `workspaceExportSchema.ts` cardinality comment, the `ruleReferenceIndex.ts` head-comment sentence
   naming Story 5.4's closure, and `deferred-work.md:2640-2647` (annotate closed — the repo's
   annotate-don't-delete convention). `deferred-work.md` also gains the RFC-006 variance this story
   makes (FD1: `exportBattle(battle)` not `exportBattle(id)`), appended to the existing six-variance
   entry as a seventh, so the next reader does not "correct" it back to the RFC snippet.
   **⟶ Superseded in part 2026-09-24:** variance (7) was recorded, then withdrawn (struck, kept) by
   the owner's option-(b) ruling; the entry is back to six live variances.

## Tasks / Subtasks

- [x] **Task 1 — Read before writing (AC: all).**
  - [x] `packages/domain/src/ruleReferenceIndex.ts` end to end — `ruleTargetIds` is the only edge you
        walk; it already de-dupes, excludes self and keeps dangling targets (its JSDoc says why).
  - [x] `packages/domain/src/workspaceExportProjection.ts` (`toEnvelope`) and
        `workspaceExportSchema.ts` (the `superRefine` you extend).
  - [x] `packages/persistence/src/workspaceSerializer.ts` + `.test.ts` — the factory, its injected
        deps, the `createFakeRepositories` import and why it has no `package.json` edge.
  - [x] `packages/test-utils/src/mockWorkspace.ts:113-127` — the canonical Chaotic Spreader →
        Aggressive Colonizer rule reference (and `MOCK_ORGANISM_IDS`).
  - [x] Re-read FD1–FD10.

- [x] **Task 2 — `organismClosure.ts` (AC: 1, 2, 5).**
  - [x] File-level JSDoc in the house style (hazard paragraphs with ⚠️ above the imports): cites
        Decision E.5(b), RFC-006 Decision 4, Decision H.1 (seed = placed set); states that the edge is
        `ruleTargetIds` and nothing else (FD3); that the walk is forward (FD2); that dangling ids are
        skipped and why that is not this function's error to raise (FD5); consumers
        (`exportBattle` here, Story 5.6 through it).
  - [x] `export function organismClosure<T extends Pick<Organism, 'id' | 'survivalRules'>>(seedIds: readonly string[], library: readonly T[]): readonly T[]`
        — build `Map<id, T>` over `library`; iterative worklist (array stack/queue, **not** recursion
        — FD6) with a `visited: Set<string>`; for each popped id present in the map, push
        `ruleTargetIds(organism)`; finally `library.filter((o) => visited.has(o.id) && byId.has(o.id))`
        or equivalent so the output is library-ordered and fresh.
  - [x] Do not export the worklist or any helper; one public function.

- [x] **Task 3 — `organismClosure.test.ts` (AC: 1, 2, 5).**
  - [x] Local literal factories only (`organism(id, targets[][])` building one rule per target list,
        conditions `{ property: 'organismType', operator: 'eq', pattern }` plus a `cellState` one if
        you want realism). ⚠️ **No `@gol/test-utils` import** — it depends on `@gol/domain` (package
        cycle; `ruleReferenceIndex.test.ts` and `workspaceExportProjection.test.ts` carry the note).
  - [x] At least one fixture through `OrganismSchema.parse` (house convention — no invalid fixture
        goes unnoticed).
  - [x] Cover every bullet of AC1: seeds only; one hop; **chained A→B→C**; **2-cycle A↔B**;
        **3-cycle A→B→C→A**; reverse-only reference not pulled (X targets A, X excluded); unreached
        organism excluded; dangling seed; dangling mid-chain target (A→missing, A→B still included);
        duplicate seeds; two paths to one node; empty seeds; empty library; library order preserved
        when seeds/targets are given in a different order; records are the same references as the
        input (`toBe`) while the returned array is not the input array; input not mutated.
  - [x] Optional, not required: one fast-check property (closure is closed — every `ruleTargetIds`
        of every member that is in the library is itself a member; idempotent —
        `closure(ids(closure(s)))` equals `closure(s)`). Only if it guards something the examples
        don't; never to raise a number. — **Skipped**: every AC1 bullet above is already pinned by a
        named example, and per-file coverage is 100/100/100/100 without it; adding one would not
        guard anything the examples don't.

- [x] **Task 4 — `exportBattle` (AC: 3).**
  - [x] Add `exportBattle(battle: Battle): Promise<WorkspaceExportWire>` to the `WorkspaceSerializer`
        interface with a JSDoc stating: the caller passes the battle **as it would be saved** —
        pruned and remapped (`pruneAndRemapBattleGrid`, Decision H.1) so `organismIds` ≡ the placed
        set, which is what seeds the closure; the grid is Edit-mode initial state only, never live
        Run-mode state (FR-6.1 / A-2 / AR-31); and why it takes a `Battle` rather than an id (FD1).
  - [x] Implement in `createWorkspaceSerializer` per AC3. `repos.organisms.list()` only — no
        `battles.load`, no `battles.listFull`.
  - [x] **Superseded 2026-09-24 (owner ruling (b)):** the two subtasks above shipped as written, then
        were reverted — `exportBattle(id: string)` now reads `repos.battles.load(id)` (throwing
        `ExportError('not-found')`) plus `repos.organisms.list()`; no prune, no caller precondition.
  - [x] Replace the factory JSDoc's "`exportBattle(id)` is deliberately absent" paragraph with what
        now exists and what is still absent (`parse`/`migrate`/`importWorkspace` → 5.7/5.8).
  - [x] Tests in `workspaceSerializer.test.ts` covering every bullet of AC3, in a new
        `describe('exportBattle …')`. Use `CONWAYS_CLASSIC` / `mockWorkspace` organisms or
        `OrganismSchema.parse`d literals for the chained case; `emptyGrid` + `BattleSchema.parse` for
        battles (the file's `seededBattle()` pattern). Assert `WorkspaceExportSchema.parse(envelope)`
        succeeds.

- [x] **Task 5 — Cardinality refinement (AC: 4).**
  - [x] Extend the existing `superRefine` in `workspaceExportSchema.ts` (do not add a second
        `.superRefine` chain); issue `{ code: 'custom', path: ['battles'], message: … }`.
  - [x] Rewrite the `⚠️ CARDINALITY IS NOT HERE` comment block, and the `EXPORT_KINDS` JSDoc if it
        still reads as future tense.
  - [x] Replace the Story 5.3 "does NOT constrain how many battles" test in
        `workspaceExportSchema.test.ts` with the AC4 cases; assert the issue path, not the message
        text.
  - [x] `workspaceExportProjection.test.ts:234`'s `toEnvelope('battle', [], [] …)` test never parses
        its output and stays valid — leave it (it pins `toEnvelope`'s stamping, not a valid file).

- [x] **Task 6 — Barrel and notes (AC: 6, 7).**
  - [x] Append a new block at the **end** of `packages/domain/src/index.ts`: a 2–3 line banner (Story
        5.4, Decision E.5(b), consumed by `exportBattle`) + `export { organismClosure } from './organismClosure';`.
        Never insert mid-file, reorder or reflow (FD8).
  - [x] Update the one sentence in `ruleReferenceIndex.ts`'s head comment ("No transitive closure …
        those are Story 5.4's") to point at `organismClosure.ts`. Nothing else in that file.
  - [x] `deferred-work.md`: annotate `:2640-2647` as closed by this story; append variance (7) to the
        six-variance entry (`:2615-2638`) — `exportBattle(battle: Battle)` vs RFC-006 Decision 4's
        `exportBattle(id)`, with FD1's reason. *(Done, then withdrawn — struck, kept — by the
        2026-09-24 owner ruling.)*

- [x] **Task 7 — Gate (AC: 5, 6).**
  - [x] `npm run test:coverage -w @gol/domain` — `organismClosure.ts` at 100/100/100/100 per file.
  - [x] `npm run ci:dev` from the worktree root, redirected to a file, **not piped**; record the real
        exit code. Never `npm run ci` (four-browser matrix is CI's job).
  - [x] `spec:check` passes — every `AR-*`, `FR-*`, `NFR-*`, `M*`, `Decision *`, `RFC-00*`, `Story N.M`
        you wrote resolves under `docs/`.
  - [x] Record every command and its real result in the Dev Agent Record.

### Review Findings

Code review 2026-09-23 (Opus, against the Sonnet implementation; Blind Hunter + Edge Case Hunter +
Acceptance Auditor). 1 decision-needed, 9 patch, 3 defer, 6 dismissed.

- [x] [Review][Decision] `exportBattle(battle: Battle)` vs RFC-006 Decision 4's `exportBattle(id)` — owner ruling needed before Story 5.6 builds on it — FD1 made this call inside the story and shipped it; it is surfaced (story "Open flags for the owner", `deferred-work.md` variance (7), the JSDoc) but not ruled on, and it is not toolchain drift: it is a cross-document conflict. RFC-006 Decision 4 is normative, not just a snippet — `:187` "exposes `exportWorkspace()` and `exportBattle(id)`. **Both read through the repository interfaces**", plus `:65` (component diagram), `:200` (`repos.battles.load(id)`, `ExportError('not-found')`), `:297` (Risks), `:359` (prototype step) and the Rationale ("read-and-assemble … only uses `list`/`load`"). The other side is PRD FR-6.1 ("export the **current** Battle") / FR-7.13 and RFC-005's dirty working copy. Architecture E.5(b) fixes no signature. Under the authority order RFC-006 still wins for persistence and is unannotated; `project-context.md`'s override list is untouched, so a later agent would reasonably "correct" the code back. Note FD1's strongest argument ("an id-based export could not export an unsaved one") leans on an open 5.6 question — an unsaved battle has no id yet (`BattlePage.tsx` mints `crypto.randomUUID()` at save), and `BattleExportSchema.id` is `z.uuid()`. Options:
  - **(a) Accept the variance and propagate it** — annotate RFC-006 Decision 4 at `:65`, `:187`, `:200`, `:297`, `:359` (and the Rationale) with `exportBattle(battle)` and the FR-6.1 reason; add it to `project-context.md`'s deliberate-override list; Story 5.6 still decides the unsaved battle's id.
  - **(b) Revert to the RFC shape** — `exportBattle(id)` reads `repos.battles.load(id)` (with the RFC's not-found error); Story 5.6 forces a save (or blocks export on a dirty/unsaved battle) before exporting. The review's pruning patch then becomes redundant with the schema's H.1 check on load.
  - **(c) Both** — keep the value form as the primitive and add `exportBattle(id)` as the RFC-conformant wrapper (`load` then delegate); annotate RFC-006 that the value form exists for the dirty-editor path.
  - **Owner ruling (Sidiar, 2026-09-24): (b) — revert to the RFC shape, `exportBattle(id)`.** Resolve by implementing (b) and checking this item.
  - **Resolved (2026-09-24):** `exportBattle` now takes `id: string`, reads `repos.battles.load(id)`, and throws `ExportError('not-found')` (new, `packages/persistence/src/errors.ts`) when it resolves `null` — the RFC-006 Decision 4 shape, unannotated in the RFC. The pruning step the earlier patch added is removed: `BattleSchema.superRefine`'s Decision H.1 check already runs on every `load()` (real and fake repositories alike), so any battle `exportBattle` receives already has `organismIds` ≡ the placed set — pruning it again would re-enforce an invariant `load()` already guarantees. `deferred-work.md`'s variance (7) is withdrawn (kept, struck, not deleted) and its "never validates its Battle argument" deferred item is closed — the unsaved-battle premise it rested on no longer exists. A new hand-off is recorded for **Story 5.6**: the export entry point must save, or block export on, a dirty/unsaved battle before calling `exportBattle(id)`, since an unsaved battle now has no id to pass at all.
- [x] [Review][Patch] Closure seeded from `battle.organismIds` trusted a JSDoc-only "caller passes it pruned" precondition — an unpruned roster leaked unplaced organisms (and everything their rules target) into the file, against FR-7.13 "organisms placed on its grid"; an out-of-range ref emitted `organismId: undefined`. `exportBattle` now runs `pruneAndRemapBattleGrid` itself and exports/seeds from the pruned battle (a no-op for an already-pruned one); new test pins it [packages/persistence/src/workspaceSerializer.ts:100] — *superseded 2026-09-24: with `exportBattle(id)` the battle comes from `load()`, whose `BattleSchema` parse rejects an unpruned roster (H.1) as `CorruptDataError`; the prune call and its test were removed, and a corrupt-record test now pins the rejection*
- [x] [Review][Patch] "does not mutate the input array or its records" test could not fail — only the array was frozen and records were compared to themselves; now deep-freezes records and compares against a `structuredClone` snapshot [packages/domain/src/organismClosure.test.ts:136]
- [x] [Review][Patch] No test for a self-targeting organism (A→A, the smallest cycle) [packages/domain/src/organismClosure.test.ts]
- [x] [Review][Patch] The Chaotic Spreader → Aggressive Colonizer serializer test relied on a fixture relationship it never stated; now asserts the precondition via `ruleTargetIds` [packages/persistence/src/workspaceSerializer.test.ts:218]
- [x] [Review][Patch] First AC3 test checked only `battles.length === 1`, not that it is the battle passed in; now asserts the id [packages/persistence/src/workspaceSerializer.test.ts:200]
- [x] [Review][Patch] FD1 test's `currentEditorBattle` built by spread and never parsed, unlike every other fixture; now through `BattleSchema.parse` [packages/persistence/src/workspaceSerializer.test.ts:255] — *superseded 2026-09-24: the FD1 test itself was removed with the revert*
- [x] [Review][Patch] Runtime schema message cited "(Story 5.4)" — a project-management reference in a string import can surface to users (5.11); siblings cite Decisions or nothing. Dropped [packages/domain/src/workspaceExportSchema.ts:171]
- [x] [Review][Patch] `ruleReferenceIndex.ts` head-comment edit left a ~118-column line; re-wrapped to the file's width (comment only) [packages/domain/src/ruleReferenceIndex.ts:26]
- [x] [Review][Patch] `deferred-work.md` variance (7) said "this **schema** ships `exportBattle`" (it is the serializer), and the entry's closing "none of these is a defect in the RFC … a shipped toolchain" now misdescribed (7), a design variance awaiting an owner ruling; both corrected [docs/implementation-artifacts/deferred-work.md:2637]
- [x] [Review][Defer] `exportBattle` never validates its `Battle` argument (`BattleSchema.parse` / `WorkspaceExportSchema.parse` on output) — the value comes from editor state, not a parsed read, and an unsaved battle's `id` is not yet a uuid; parsing here would pre-empt Story 5.6's open id question [packages/persistence/src/workspaceSerializer.ts:100] — deferred to Story 5.6 — *closed 2026-09-24: the argument is now an id and `load()` parses; see `deferred-work.md`*
- [x] [Review][Defer] `toEnvelope('battle', …)` still accepts zero or many battles at the producer; only the schema enforces cardinality, at parse time [packages/domain/src/workspaceExportProjection.ts:149] — deferred, pre-existing (Story 5.3 API)
- [x] [Review][Defer] A dangling seed/target (reachable only via a corrupt, skipped organism record) is silently omitted, so export reports success on a file import will reject (FD5; already an owner open flag) [packages/domain/src/organismClosure.ts:56] — deferred to Story 5.11 / the FD5 owner flag

Code review 2026-09-24, round 2 (Opus, against Sonnet's uncommitted option-(b) revert; Blind Hunter
+ Edge Case Hunter + Acceptance Auditor). Verified: the code matches RFC-006 Decision 4 (`:65`,
`:187`, `:200-202`, `:297`, `:359`, Rationale) and needs no RFC note; removing
`pruneAndRemapBattleGrid` is sound, because both `BattleRepository.load()` implementations
(`localStorageBattleRepository.ts:24-38`, `fakeRepositories.ts:123-134`) `safeParse` through
`BattleSchema`, whose superRefine enforces H.1 in both directions (`battleSchema.ts:52-69`), and
there is no cache or migration bypass. No other `exportBattle` caller exists. 0 decision-needed,
7 patch, 1 defer, 7 dismissed.

- [x] [Review][Patch] History deleted, not struck, in `deferred-work.md`: the "Seven RFC-006 variances" summary line was rewritten, and the body of "`exportBattle` never validates its `Battle` argument" was replaced; both restored struck [docs/implementation-artifacts/deferred-work.md:2615, :2804]
- [x] [Review][Patch] Variance (7) was claimed "struck … kept below" but was neither struck nor below, and still read "awaiting the owner's ruling"; now struck in place, "below" → "above", and the (1)–(6) clause inside it re-affirmed [docs/implementation-artifacts/deferred-work.md:2641-2663]
- [x] [Review][Patch] History deleted in this story: the original FD1 paragraph, the Project Structure Notes variance line, and the tail of the Open-flags FD1 bullet; all restored struck [5-4-rule-aware-organism-closure.md FD1, Project Structure Notes, Open flags]
- [x] [Review][Patch] Live statements still describing `exportBattle(battle)` (AC3, AC7, Task 4, Task 6's last subtask, round-1 patch/defer items on the prune step, the FD1 test and the argument parse, the `battleProjection.ts` row, Completion Notes, Dev Model comment); each annotated superseded in place [5-4-rule-aware-organism-closure.md]
- [x] [Review][Patch] No test pinned the invariant the prune removal rests on; added: a stored battle with an unplaced roster entry makes `exportBattle(id)` reject with `CorruptDataError`, never `ExportError`, never an envelope [packages/persistence/src/workspaceSerializer.test.ts:235]
- [x] [Review][Patch] `ExportError` JSDoc said it "matches" the RFC's one-argument constructor while taking `(code, id)`; reworded as an extension, and recorded beside withdrawn variance (7) [packages/persistence/src/errors.ts:14]
- [x] [Review][Patch] Not-found test called `exportBattle` twice for two assertions; it now uses one captured promise. The Change Log's "ci:dev green (see Debug Log)" had no Debug Log entry; one is now recorded with the real result [packages/persistence/src/workspaceSerializer.test.ts:221; Debug Log References]
- [x] [Review][Defer] `LocalStorageBattleRepository.load()` indexes a plain object, so ids like `constructor`/`__proto__` resolve to an inherited value: the real store throws `CorruptDataError` where the fake (a `Map`) returns `null` → `ExportError('not-found')` [packages/persistence/src/localStorageBattleRepository.ts:25] — deferred, pre-existing (real ids are uuids)

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

**FD1 — REVERTED by owner ruling (2026-09-24; option (b) on the Review Findings' `[Review][Decision]`
item).** This forced decision originally had `exportBattle` take a `Battle` value rather than an id,
as a declared RFC-006 Decision 4 variance — the argument for it (an id-based export returns the
saved copy, which is stale for a dirty battle and cannot exist at all for an unsaved one) is no
longer this story's call to make. `exportBattle` now takes `id: string`, reads
`repos.battles.load(id)`, and throws `ExportError('not-found')` when it resolves `null` — the RFC
shape, unmodified. **What Story 5.6 owns instead:** forcing a save, or blocking export outright, on a
dirty/unsaved battle before calling `exportBattle(id)` — an unsaved battle has no `id` to pass here
at all, so the "what must an unsaved battle's id be" question this FD used to hand forward no longer
arises. `deferred-work.md`'s variance (7) is withdrawn (struck, not deleted) and records this reversal
in full.

*Original FD1, as the story shipped it on 2026-09-23 (superseded by the ruling above, kept for the
record):* ~~**FD1 — `exportBattle` takes a `Battle`, not an id (a declared RFC-006 Decision 4
variance).** The RFC snippet is `exportBattle(id)` → `repos.battles.load(id)`. That exports the
**saved** copy, and FR-6.1 exports "the current Battle" from inside the editor (Story 5.6 — the
button lives in the editor's Tools section), where the grid may be dirty or the battle never saved
at all. An id-based export would silently ship stale cells for a dirty battle and could not export
an unsaved one. Taking the battle value serves every case, and a caller that does want the saved
copy is one `battles.load(id)` away. The organisms are still read through the repository
(`organisms.list()`), so "export reads through the repository interfaces" holds for the part that
is library-wide. Recorded as variance (7) in `deferred-work.md` (Task 6). **What 5.6 still owns:**
producing the pruned `Battle` from editor state (the same `pruneAndRemapBattleGrid` projection save
uses), and whatever an unsaved battle's `id` must be (`BattleExportSchema.id` is `z.uuid()`) — not
decided here.~~

**FD2 — The walk is FORWARD, from the seeds, over `ruleTargetIds`.** The closure is "everything the
seeds depend on". The reverse index (`buildRuleReferenceIndex`) answers "who depends on X" — using it
here either requires inverting it back (a second algorithm over the same data) or produces the wrong
set (pulling in organisms that *target* a placed one, which the battle does not need). Pinned by the
"reverse-only reference not pulled" test.

**FD3 — `ruleTargetIds` is the ONLY edge definition.** It already (a) narrows `organismType`
conditions, (b) de-dupes, (c) excludes self (so a self-reference is never an edge — no special case
here), and (d) keeps dangling targets. `organismClosure.ts` must not touch `survivalRules` directly
(AC2). If you find you need a different notion of "targets", stop — that is a change to 4.19's
module and an owner decision, not a local helper.

**FD4 — Signature: generic over `Pick<Organism, 'id' | 'survivalRules'>`, returns the library's
records.** Generic `T` so tests pass minimal literals (FD11 of 4.19 — why `packages/domain` tests
never need `@gol/test-utils`) while `exportBattle` gets back full `Organism[]` without a cast or a
second lookup. Returns records (not ids) because the only consumer needs records and filtering the
library a second time at the call site is a second pass for nothing. Library input order, because
`organisms.list()` order is what `exportWorkspace` emits and a closure-ordered output would make the
two exports disagree on order for no reason.

**FD5 — Dangling ids are skipped, not thrown.** A seed or rule target missing from the library is
"unreachable through normal use" (M7 + Decision E.5(a)), so it only arises from corruption:
`organisms.list()` **skips** a corrupt record (fault isolation, `fakeRepositories.ts:202-208` and the
real repository), leaving its id dangling. `exportWorkspace` already takes the same stance and records
the gap against Story 5.11 (`workspaceSerializer.ts:74-86`). The resulting file would be rejected at
import by Story 5.8's `assertReferentialClosure` (RFC-006 Decision 5) — rejected cleanly, never
half-imported. Throwing here would make export fail on exactly the corruption 5.11 exists to report,
with no UI to tell the user. Say so in `exportBattle`'s JSDoc beside the existing `listFull` note, and
list it as an open flag below. Do not return the missing ids as a second output — nothing consumes it
(no dead surface).

**FD6 — Iterative worklist + `visited` set, not recursion.** The closure is bounded by library size
(uncapped — M6, Decision G.3's 255 is per-battle placement, not library), and a recursive DFS over a
long chain is a stack-depth bet. A worklist with `visited` checked **on push or on pop** (either is
correct; be consistent) terminates on every cycle by construction — this is the cycle guard the AC
asks tests for. Order of traversal does not leak into the output (FD4 filters in library order).

**FD7 — The schema checks cardinality; it does not check closure.** `kind: 'battle' ⇒ battles.length
=== 1` is structural and cheap, and the owner placed it in the schema (`deferred-work.md:2640`).
"Every cell's and rule target's organism is in `organisms[]`" is RFC-006 Decision 5's separate
`assertReferentialClosure` step at import — Story 5.8's. Adding it to `WorkspaceExportSchema` now
would pre-empt 5.8's design and change what a `workspace` file must satisfy on parse. Not here.

**FD8 — Append the barrel block at the END of `index.ts`.** `implement-next-story.toml`'s `[[sync.rules]]`
for `packages/domain/src/index.ts` resolves two-lane collisions only because both lanes append blocks
at the end. Epic 4's open stories (4.21's delete guard especially) may add domain exports too. A
block inserted beside `ruleReferenceIndex` "because it's related" would turn a mechanical sync into a
real conflict.

**FD9 — No closure for `exportWorkspace`.** A workspace export carries every organism already; the
closure is a battle-export concern only (RFC-006 Decision 4). Do not route `exportWorkspace` through
`organismClosure`.

**FD10 — No 255 check on the closure.** The envelope's `organisms[]` is uncapped (M6); the 255
ceiling is on distinct organisms **placed** in one battle's cells (Decision G.3), already enforced by
`BattleExportSchema`. A closure may legitimately exceed 255 through rule references.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `packages/domain/src/ruleReferenceIndex.ts` (+ `.test.ts`) | **The edge.** `ruleTargetIds(organism)` — de-duped, condition order, self excluded, dangling kept. Only its head-comment sentence about Story 5.4 changes (Task 6). |
| `packages/domain/src/workspaceExportSchema.ts` (+ `.test.ts:128-140`) | **Modified.** The envelope `superRefine` (duplicate ids, `:141-164`) gains the cardinality issue; the 5.3 test pinning its absence is replaced. |
| `packages/domain/src/workspaceExportProjection.ts` | `toEnvelope(kind, battles, organisms, meta)` — pure, fresh arrays, shared records, `CURRENT_FORMAT_VERSION` stamped. `exportBattle` calls it; do not edit it. |
| `packages/domain/src/battleProjection.ts` | `pruneAndRemapBattleGrid` — the projection that makes `organismIds` ≡ the placed set. ~~The *caller's* precondition for `exportBattle` (FD1), not called by this story.~~ *Superseded 2026-09-24 (FD1 reverted): `exportBattle(id)` gets its battle from `repos.battles.load(id)`, whose `BattleSchema` parse already enforces H.1 — no caller precondition, and still not called by this story.* |
| `packages/domain/src/index.ts` | Barrel; append at the end (FD8). |
| `packages/domain/vitest.config.ts` | `include: ['src/**/*.ts']`, `perFile: true`, 90/90/90/90. A new file at <90% fails the package. |
| `packages/persistence/src/workspaceSerializer.ts` (+ `.test.ts`) | **Modified.** The factory over `{ repos, appVersion, now }`; `exportWorkspace`'s `listFull` corruption note (the stance FD5 matches); the JSDoc that says `exportBattle` is 5.4's. The test file's header explains the undeclared `@gol/test-utils` import — follow it, do not "fix" it (owner decision, `deferred-work.md` 5.3 entry). |
| `packages/persistence/src/repositories.ts` | `OrganismRepository.list()` returns parsed `Organism[]`, corrupt records skipped. |
| `packages/test-utils/src/mockWorkspace.ts:113-127` | Chaotic Spreader's rule targets Aggressive Colonizer by `MOCK_ORGANISM_IDS.aggressiveColonizer` — the ready-made one-hop fixture for the serializer test. |
| `packages/test-utils/src/fakeRepositories.ts` | `createFakeRepositories({ battles, organisms })`; `organisms.list()` iterates insertion order and skips invalid records. |
| `docs/implementation-artifacts/deferred-work.md:2615-2647` | The six RFC-006 variances (append a seventh) and the cardinality hand-off (annotate closed). |
| `docs/implementation-artifacts/lane-gates.yaml:45-49` | The gate that made this story wait for 4.19 — "5.4 must consume 4.19's module, not define it". Satisfied on `main` (4.19 merged, #74). |

### Architecture compliance

- **Decision E / E.5(b) / RFC-006 Decision 4 / AR-10** — battle export's organism set = placed ∪ rule
  targets, transitively; rule targets are stable library ids in `organismType` `pattern`s, never refs.
- **Decision H / H.1** — `organismIds` ≡ placed set, so it is the closure seed with no grid scan.
- **AR-12 / Decision F.1** — no settings in any envelope (`toEnvelope` already guarantees it; assert it).
- **FR-6.1 / A-2 / AR-31** — initial Edit-mode state only; `exportBattle` receives a persisted-shape
  `Battle`, which has no live-grid field by construction.
- **AR-39 / NFR-5.1** — the closure's pure logic lives in `packages/domain` at ≥90% per file.
- **AR-2 / AR-27** — `exportBattle` reads `repos` injected into the factory; no concrete repository.
- **No DOM types in `packages/*`**; **Zod at boundaries only** (no `z.` in `organismClosure.ts`);
  **`isolatedModules`** (`export type` for types); strict TS — no `any`, `!`, `@ts-ignore`.
- **Naming** — camelCase, never dotted: `organismClosure.ts`.
- **Spec-id hygiene** — write IDs exactly (`Decision E.5`, `RFC-006`, `AR-10`, `AR-12`, `AR-39`,
  `NFR-5.1`, `FR-6.1`, `M6`, `M7`, `Story 4.19`, `Story 5.4`, `Story 5.6`, `Story 5.8`,
  `Story 5.11`); `spec:check` fails on anything that resolves to nothing.

### Library / framework notes

Installed versions, nothing new: TypeScript 5.9.3 strict, Zod 4.4.3 (schema file only — `ctx.addIssue({ code: 'custom', path, message })`, v4 spelling as the file already uses), Vitest 4 (`environment: 'node'`), fast-check available in `packages/domain` (optional here). No dependency changes.

### Testing standards

- Every test guards a named failure: a closure that stops after one hop; one that loops on a cycle;
  one that walks the reverse index; one that drops a seed with no rules; one that throws on a dangling
  id; an export that uses the saved copy instead of the passed battle; a `kind: 'battle'` file with
  0 or 2 battles that parses.
- Name each `it` as a full sentence stating the invariant, reason in parentheses (house convention).
- No coverage-padding tests. Fixtures in `packages/domain` are local literals.
- `npm run ci:dev` is the gate; report its real exit code, never piped.

### Previous story intelligence

- **Story 5.3** (previous in this epic): minted the envelope, `toEnvelope`, the factory serializer,
  the injected `appVersion`/`now` (FD5 there), and handed this story `exportBattle` + cardinality. Its
  review lessons: comments that describe a future state go stale in the next story (Task 5/6 here
  rewrite three of them); fast-check properties over grids need an explicit per-test timeout on the
  CI runner (`30_000`, `workspaceExportProjection.test.ts`) — if you add a property, keep it cheap or
  give it the same timeout; `"sideEffects": false` on `@gol/domain` is what keeps new domain modules
  out of routes that don't import them (5.3 FD10) — no import-time work in `organismClosure.ts`.
- **Story 4.19** (the gate): built `ruleTargetIds` specifically for this walk and excluded
  self-references at the source "to keep Story 5.4's closure off a self-edge". Its review found
  vacuous aliasing assertions — assert aliasing on things that can actually alias (the returned
  array vs the input array; records `toBe` the input records).

### Git intelligence

`main` at `e06da2e` (merge of #74, Story 4.19). 4.19 touched `packages/domain/src/{usageIndex,ruleReferenceIndex}.*`
and the barrel; 5.3 (#71) touched `workspaceExport{Schema,Projection}.*`, the barrel and
`packages/persistence/src/workspaceSerializer.*`. This story's files overlap both. Epic 4's lane is
still open (4.20–4.26): 4.20/4.21 consume `ruleReferenceIndex` but are not expected to reshape
`ruleTargetIds`; the barrel is the shared collision point (FD8).

### Project Structure Notes

- New: `packages/domain/src/organismClosure.ts` (+ `.test.ts`).
- Modified: `packages/domain/src/workspaceExportSchema.ts` (+ `.test.ts`), `packages/domain/src/index.ts`,
  `packages/domain/src/ruleReferenceIndex.ts` (one comment sentence),
  `packages/persistence/src/workspaceSerializer.ts` (+ `.test.ts`),
  `docs/implementation-artifacts/deferred-work.md`, `docs/implementation-artifacts/sprint-status.yaml`.
- Untouched on purpose: all of `apps/web`, `packages/simulation`, `packages/test-utils`,
  `workspaceExportProjection.ts`, `battleProjection.ts`, `usageIndex.ts`, any `package.json`,
  `lane-gates.yaml`, `docs/project-context.md`.
- ~~Variance: `exportBattle(battle)` vs RFC-006's `exportBattle(id)` (FD1), recorded in `deferred-work.md`.~~
- Variance: `exportBattle(battle)` vs RFC-006's `exportBattle(id)` (FD1) was tried and **withdrawn by
  owner ruling, 2026-09-24** — `exportBattle` ships as `exportBattle(id)`, matching RFC-006 Decision 4
  exactly. `packages/persistence/src/errors.ts` gains `ExportError` (not previously in the File List).

### What NOT to build

- ❌ No UI — no button, dialog, filename, `Blob`/download (Story 5.6 / 5.5).
- ❌ No `assertReferentialClosure`, no import path, no `migrate()` (Stories 5.7 / 5.8).
- ❌ No second "a rule targets X" definition; no edit to `ruleTargetIds` or `buildRuleReferenceIndex`.
- ❌ No recursion-based walk; no memo/cache/module state.
- ❌ No closure in `exportWorkspace` (FD9); no 255 cap on the closure (FD10).
- ~~❌ No `ExportError` class or not-found path — `exportBattle` takes the battle, there is nothing to not find (FD1).~~ — **Superseded (2026-09-24):** FD1 was reverted; `exportBattle(id)` now does read through `repos.battles.load(id)` and throws `ExportError('not-found')` when it returns `null` (`packages/persistence/src/errors.ts`), matching the RFC.
- ❌ No `package.json` edge for `@gol/test-utils` in `@gol/persistence` (owner decision; cycle breaks `build`).

### Open flags for the owner (not blockers — the story proceeds on the FDs)

- ~~**FD1 changes the RFC's `exportBattle(id)` to `exportBattle(battle)`** so the editor's current,
  possibly unsaved battle is what gets exported. If the owner prefers the RFC shape (export only the
  saved copy, Story 5.6 forcing a save first), it is a one-function change before 5.6 builds on it.~~ — **Ruled on
  (2026-09-24, option (b)):** reverted to the RFC shape, `exportBattle(id)`. See FD1 above and
  `deferred-work.md`'s withdrawn variance (7).
- **FD5: a dangling id (only reachable via a corrupt, skipped organism record) produces a battle file
  that Story 5.8's import will reject.** Same stance as `exportWorkspace`, same owner (Story 5.11) for
  telling the user. If the owner would rather export fail loudly here, it needs an error type and a UI
  message, which is 5.6/5.11 surface.

### References

- `docs/planning-artifacts/epics.md:1357-1367` (Story 5.4), `:1381-1392` (5.6, the consumer), `:169` (AR-10).
- `docs/planning-artifacts/architecture.md:234` (Decision E.5 (a)–(c)), `:263-274` (Decision H), `:353` (M7).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md` Decision 4 (`:185-215` — closure, rule-aware and transitive), Decision 5 (`:217-244` — import assertion, 5.8's), Decision 6 (settings never travel), Risks (`:297`).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md` FR-6.1 (`:390-394`), A-2 (`:778-779`).
- `docs/implementation-artifacts/4-19-usage-rule-reference-derivations.md` FD6, FD7 (the forward edge built for this story).
- `docs/implementation-artifacts/5-3-export-envelope-serializer.md` (review decision on refinements, `:366-389`; out-of-scope list, `:827-829`).
- `docs/implementation-artifacts/deferred-work.md:2615-2647`; `docs/implementation-artifacts/lane-gates.yaml:45-49`.
- `docs/project-context.md` — strict TS, no DOM in `packages/*`, Zod at boundaries, ≥90% per-file core gate, referential-integrity logic is core, no coverage padding, camelCase files, `spec:check`, `npm run ci:dev` never piped, commit gate.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npm run test:coverage -w @gol/domain` — 201 tests passed, 11 files; `organismClosure.ts` at
  100/100/100/100 per file (first run flagged one dead branch on an `Array.prototype.pop()` result
  check that could never be `undefined`; rewrote the walk as a forward-cursor worklist over a
  never-shrinking array, which removed the unreachable branch without recursion or a non-null
  assertion).
- `npm run test:coverage -w @gol/persistence` — 102 tests passed, 8 files (existing `exportWorkspace`
  suite plus the new `exportBattle` `describe` block).
- `npm run ci:dev` from the worktree root, redirected to a file (not piped) — **exit code 0**.
  Sequence run: `typecheck` (5 packages, all pass) → `lint` (0 errors, 1 pre-existing unrelated
  warning in `apps/web/components/gallery/BattleGallery.tsx`) → `format:check` (failed once on the
  two new/edited test files; fixed with `prettier --write`, then passed) → `spec:check` (373 source
  files scanned, 273 cited spec ids, all resolve) → `boundary:check` (pass) → `test:coverage` (all
  packages green, core packages at 100% per file) → `build:standalone` (pass) →
  `bundle:check` (home 333.8 KB / 340 KB budget, battle within budget — unchanged by this story) →
  `bench` / `bench:check` (pass) → `e2e:chromium` (255 passed, 1 skipped).
- 2026-09-24 (option-(b) revert, after the round-2 review patches) — `npm run ci:dev`, redirected to a
  file, exit **0**: `@gol/persistence` 103 tests passed (8 files; `workspaceSerializer.test.ts` 13,
  including the new not-found and corrupt-record tests), all other packages green; `bundle:check`
  within budget and unchanged (home 333.8 KB / 340 KB); `e2e:chromium` 255 passed, 1 skipped.

### Completion Notes List

- Added `packages/domain/src/organismClosure.ts`: `organismClosure(seedIds, library)`, the Decision
  E.5(b) / RFC-006 Decision 4 transitive rule-reference closure. Walks `ruleTargetIds` only (no
  second "a rule targets X" definition), forward from the seeds (never the reverse index), with an
  iterative forward-cursor worklist + `visited` set (no recursion, cycle-safe by construction).
  Returns the library's own records, library-ordered, in a fresh array. 100/100/100/100 coverage.
- `WorkspaceSerializer.exportBattle(battle: Battle)` added to the interface and factory in
  `packages/persistence/src/workspaceSerializer.ts`: reads `repos.organisms.list()`, computes
  `organismClosure(battle.organismIds, library)`, returns `toEnvelope('battle', [battle], closure, …)`.
  Takes the `Battle` value rather than an id (FD1, a declared RFC-006 Decision 4 variance) so the
  editor's current — possibly dirty or unsaved — battle is what exports, never the saved copy under
  the same id. `exportWorkspace` is unchanged. *(Superseded — reverted to `exportBattle(id)`; see
  the 2026-09-24 entry below.)*
- `WorkspaceExportSchema`'s `superRefine` gained the cardinality issue: `kind === 'battle' &&
  battles.length !== 1` ⇒ a `custom` issue at `['battles']`. The Story 5.3 test pinning the absence
  of that constraint was replaced with the AC4 cases (0/1/2 battles under `'battle'`;
  `'workspace'` stays uncapped); the duplicate-id refinement fires independently, unchanged.
  `WorkspaceExportSchema.test.ts`'s "does NOT constrain" test is gone — the assertion it made is now
  false by design.
- Barrel: `organismClosure` appended at the end of `packages/domain/src/index.ts` (FD8 — the
  two-lane sync rule). `ruleReferenceIndex.ts`'s one head-comment sentence naming "Story 5.4's"
  closure now names `organismClosure.ts`; nothing else in that file touched, confirmed by diff.
- `deferred-work.md`: the cardinality hand-off entry (`:2640-2647`) is annotated CLOSED by this
  story; the six-variance entry is now seven, with variance (7) recording
  `exportBattle(battle: Battle)` vs RFC-006 Decision 4's `exportBattle(id)` and FD1's reason.
  *(Superseded — (7) withdrawn by the 2026-09-24 ruling; see below.)*
- No file under `apps/web` touched. No new dependency in any `package.json`. `ruleReferenceIndex.ts`
  body/signature/tests are byte-identical apart from the one sentence named above.
- **2026-09-24 — Resolved the review's `[Review][Decision]` item (owner ruling: option (b)).**
  `WorkspaceSerializer.exportBattle` reverted from `exportBattle(battle: Battle)` to
  `exportBattle(id: string)`: it now reads `repos.battles.load(id)` and throws the new
  `ExportError('not-found')` (`packages/persistence/src/errors.ts`, exported from the package
  barrel) when `load()` resolves `null` — RFC-006 Decision 4's shape, unannotated. The prior
  review patch's internal `pruneAndRemapBattleGrid` call is removed: it is provably redundant now
  that the battle comes from `load()`, because `BattleSchema.superRefine` already enforces Decision
  H.1 (`organismIds` ≡ the placed set) on every successful `load()` — verified against both
  `LocalStorageBattleRepository.load()` and `fakeRepositories.ts`'s `battles.load()`, which both
  gate on `BattleSchema.safeParse` before returning. `workspaceSerializer.test.ts`: removed the
  FD1 "saved copy vs passed battle" test and the "seeds from the placed set, not the unpruned
  roster" test (both described a shape `exportBattle` no longer has — a raw, possibly-invalid
  editor battle can no longer reach this function at all); added a not-found test asserting
  `ExportError` with `code: 'not-found'`; kept and re-wired the closure (single-hop and chained),
  provenance (`appVersion`/`now`), and no-settings tests to the `id`-based call. `deferred-work.md`:
  variance (7) withdrawn (struck, not deleted) and re-counted as six variances; the "exportBattle
  never validates its Battle argument" entry closed (its unsaved-battle premise no longer exists);
  added a Story 5.6 hand-off (save or block export on a dirty/unsaved battle before calling
  `exportBattle(id)`). This story's own FD1, "Open flags for the owner", "What NOT to build", and
  "Project Structure Notes" sections annotated in place to match, per the repo's
  annotate-don't-delete convention.

### File List

- `packages/domain/src/organismClosure.ts` (new)
- `packages/domain/src/organismClosure.test.ts` (new)
- `packages/domain/src/index.ts` (modified — barrel export appended at end, FD8)
- `packages/domain/src/ruleReferenceIndex.ts` (modified — one head-comment sentence)
- `packages/domain/src/workspaceExportSchema.ts` (modified — cardinality `superRefine` issue,
  comment rewrite)
- `packages/domain/src/workspaceExportSchema.test.ts` (modified — AC4 cardinality tests replace the
  Story 5.3 "does NOT constrain" test)
- `packages/persistence/src/workspaceSerializer.ts` (modified — `exportBattle` interface + impl,
  factory JSDoc rewrite; reverted 2026-09-24 to `exportBattle(id)` per owner ruling — reads
  `repos.battles.load(id)`, throws `ExportError('not-found')`, no prune/remap step)
- `packages/persistence/src/workspaceSerializer.test.ts` (modified — new `exportBattle` describe
  block, AC3; reworked 2026-09-24 for the `id`-based signature, FD1/unpruned-roster tests removed,
  not-found test added)
- `packages/persistence/src/errors.ts` (modified 2026-09-24 — new `ExportError` class,
  RFC-006 Decision 4's `ExportError('not-found')`)
- `packages/persistence/src/index.ts` (modified 2026-09-24 — barrel export for `ExportError`)
- `docs/implementation-artifacts/deferred-work.md` (modified — cardinality hand-off closed, seventh
  RFC-006 variance appended, then withdrawn 2026-09-24 by owner ruling; the "exportBattle never
  validates its Battle argument" entry closed; new Story 5.6 hand-off added)
- `docs/implementation-artifacts/sprint-status.yaml` (modified — story status)
- `docs/implementation-artifacts/5-4-rule-aware-organism-closure.md` (this file — tasks, Dev Agent
  Record, Status)

## Change Log

- 2026-09-23 — Implemented Story 5.4: `organismClosure` (new `@gol/domain` module, 100% per-file
  coverage), `WorkspaceSerializer.exportBattle`, and the `kind: 'battle'` cardinality refinement.
  `npm run ci:dev` green (exit 0). Status → review.
- 2026-09-23 — Code review (Opus): 9 patches applied (notably `exportBattle` now prunes/remaps
  internally so the closure seeds from the placed set), 3 deferred to `deferred-work.md`, 1
  decision left for the owner (`exportBattle(battle)` vs RFC-006's `exportBattle(id)`).
  `npm run ci:dev` green after patches (exit 0). Status → in-progress pending that decision.
- 2026-09-24 — Owner ruling on the `[Review][Decision]` item: option (b), revert to the RFC shape.
  `exportBattle` now takes `id: string`, reads `repos.battles.load(id)`, and throws the new
  `ExportError('not-found')` (`packages/persistence/src/errors.ts`) when no battle exists under
  `id`. The review's pruning step is removed as redundant: `BattleSchema.superRefine`'s Decision
  H.1 check already runs on every `load()`, so a loaded battle's `organismIds` is already exactly
  the placed set. Tests reworked: the FD1 "saved copy vs passed battle" and unpruned-roster tests
  no longer apply and are removed; a not-found test is added; closure, provenance and no-settings
  coverage is kept. `deferred-work.md`'s variance (7) withdrawn (kept, struck) and its
  "`exportBattle` never validates its argument" entry closed; a Story 5.6 hand-off added (save or
  block export on a dirty/unsaved battle before calling `exportBattle(id)`). FD1 / Open flags /
  "What NOT to build" in this file annotated to match. `npm run ci:dev` green (see Debug Log).
  Status → review.
- 2026-09-24 — Code review round 2 (Opus) of the option-(b) revert: 7 patches applied (history
  restored struck in `deferred-work.md` and this file; stale `exportBattle(battle)` statements
  annotated superseded; corrupt-record `CorruptDataError` test added; `ExportError` JSDoc corrected;
  not-found test tidied; Debug Log entry recorded), 1 defer, 0 decisions. `npm run ci:dev` exit 0.
  Status → done.

Dev Model: sonnet   # follows existing patterns (4.19's forward edge, 5.3's factory + toEnvelope); the one new surface (exportBattle's signature) is pre-decided in FD1, so nothing is left to architect. (FD1 reverted 2026-09-24 by owner ruling — exportBattle(id), the RFC shape.)

Proposed lane gate: none   # the governing row (5-4 requires 4-19) is satisfied on main; 5.4 only consumes ruleTargetIds and appends to the barrel, and no open Epic 4 story (4-20..4-26) is expected to reshape ruleTargetIds or the export path.

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 18s | 18s | 12 | 2,066 | 8,606 | 337,478 | 348,162 |
| Step 1 — create | opus-5-5 | 1 | 4m 33s | 4m 33s | 90 | 2,526 | 269,706 | 4,406,762 | 4,679,084 |
| Step 2 — implement | sonnet-5 | 1 | 13m 17s | 13m 17s | 266 | 5,092 | 466,288 | 16,056,260 | 16,527,906 |
| Step 3 — review + PR | opus-5-5 | 4 | 8m 49s | 8m 49s | 244 | 16,680 | 481,673 | 7,937,403 | 8,436,000 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 46 | 16,439 | 34,874 | 1,464,428 | 1,515,787 |
| **Total (create → PR ready)** | | 6 | **26m 56s** | 26m 56s | 612 | 26,364 | 1,226,273 | 28,737,903 | **29,991,152** |

Run started 2026-09-23 11:54 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
