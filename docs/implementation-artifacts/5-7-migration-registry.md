---
baseline_commit: 747727b
---

# Story 5.7: Migration Registry

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want one source-keyed migration path for all persisted and imported data,
so that format evolution never forks between storage and files.

## Acceptance Criteria

Source: `epics.md#Story 5.7: Migration Registry` (`docs/planning-artifacts/epics.md:1395-1406`),
governed by AR-11 (`epics.md:170`), architecture **Decision I** (`architecture.md:276-287`) and
RFC-006 **Decision 3** (`rfcs/RFC-006-persistence-workspace-schema.md:159-184`). Split here so a
reviewer can check each item on its own.

1. **One registry, source-keyed.** A single `MIGRATIONS` registry exists in `@gol/domain`.
   `MIGRATIONS[from]` upgrades a document from `from` to `from + 1`. `migrate()` loops while
   `from < CURRENT_FORMAT_VERSION`. `formatVersion` is the only version it reads or branches on
   (Decision I.1 / I.2). The registry is **empty** today: `CURRENT_FORMAT_VERSION` stays `1`.
2. **Both boundaries, same chain (AR-11 / Decision I.3).** The *same* `migrate()` function runs:
   - (a) **at-rest load**: every read of workspace data from localStorage (`gol:battles`,
     `gol:organisms`) goes through the at-rest format check driven by the `gol:schema` stamp;
   - (b) **file import**: `migrate()` is exported for Story 5.8's `parse → migrate → validate`
     pipeline and is proven here against envelope-shaped input.
   There is no second pipeline and no per-boundary copy of any step.
3. **Stamps are stamps (AR-11 / Decision I.4).** `organism.schemaVersion` and `PALETTE_VERSION` are
   never branched on. `organism.schemaVersion` is **asserted** at load: a stored or imported
   organism whose stamp is not `ORGANISM_SCHEMA_VERSION` fails `OrganismSchema`. That is the
   NFR-7.3 corrupt path, never a switch. `PALETTE_VERSION` is untouched and still unreferenced
   outside `apps/web/lib/palette/`.
4. **Newer version → clear rejection, nothing applied.** A document with
   `formatVersion > CURRENT_FORMAT_VERSION` is rejected **before any step or any Zod parse runs**.
   The typed error carries code `'newer-version'`, the found version and the supported version,
   and says clearly that the file or data came from a newer version of the app. It is thrown before
   anything is written, at either boundary (AR-11).
5. **Missing or invalid version → corrupt.** A document whose `formatVersion` is absent, not a
   number, not an integer, or `< 1` is rejected with code `'corrupt'` (RFC-006 Decision 3,
   NFR-7.3). So is a non-object input (`null`, an array, a string).
6. **Tests.** The registry has tests for the identity path (a current-version document passes
   through unchanged, and no step runs), for both rejection paths (AC4, AC5), and for chain
   mechanics against an **injected synthetic registry** (source-keyed order, one step per version,
   the gap check). The at-rest path has tests for current / fresh / newer / corrupt-stamp and for
   the write-back-with-rollback path through a synthetic migrator. No real migration step ships;
   real steps arrive with future format bumps.
7. **Nothing else moves.** No schema field is added, removed, or loosened; `WorkspaceExportSchema`
   keeps `formatVersion: z.literal(CURRENT_FORMAT_VERSION)`. `isFreshWorkspace()` stays
   presence-only. `gol:settings` is not migrated (FD8). `npm run ci:dev` is green.

## Tasks / Subtasks

- [x] **Task 1: the registry in `@gol/domain`** (AC: 1, 4, 5, 6)
  - [x] 1.1 New `packages/domain/src/formatMigrations.ts` (camelCase, never dotted). It contains:
    - `MigrationRepresentation = 'envelope' | 'at-rest'` (FD2);
    - `type FormatMigration = (doc: MigratableDocument, representation: MigrationRepresentation) => MigratableDocument`
      where `MigratableDocument = Readonly<Record<string, unknown>>`;
    - `MIGRATIONS: Readonly<Record<number, FormatMigration>>`, frozen and empty, with a WHY comment
      saying what a step is (Decision I.3: one atomic function per version, in the internal order
      *structure → rules → palette tokens*);
    - `createMigrator({ migrations, currentVersion })`, which returns
      `migrate(raw: unknown, representation): MigratableDocument` (FD3);
    - `migrate = createMigrator({ migrations: MIGRATIONS, currentVersion: CURRENT_FORMAT_VERSION })`.
  - [x] 1.2 `migrate` semantics, in order:
    - non-plain-object input → `'corrupt'`;
    - `formatVersion` fails `Number.isInteger(v) && v >= 1` → `'corrupt'`;
    - `v > currentVersion` → `'newer-version'`;
    - a missing `migrations[from]` for any `from` in `[v, currentVersion)` → a `'missing-step'`
      error. This is a programming error, and the registry-integrity test (1.4) makes it
      unreachable in production;
    - then loop the steps. After each step, `migrate` itself sets `formatVersion: from + 1` on the
      step's result, so a step cannot forget it.
    `migrate` never mutates `raw`. When no step runs it returns `raw` **by reference** (identity
    passthrough; the test asserts `toBe`). Story 5.8's snapshot/rollback relies on the input being
    untouched.
  - [x] 1.3 The error is `FormatMigrationError`, built as **an interface + factory + type guard,
    not a class** (FD4). The `validateRules.ts` `RuleCompilationError` precedent applies: a
    `Object.assign`'d real `Error`, `name: 'FormatMigrationError'`,
    `code: 'corrupt' | 'newer-version' | 'missing-step'`, `foundVersion: unknown`, and
    `supportedVersion: number`. It also exports `isFormatMigrationError(value)`. Messages are
    plain English. `'newer-version'` reads like *"This data was written by a newer version of Game
    of Life Studio (format N); this version supports format M. Update the app to open it."* The
    UI copy is Story 5.9's / 5.11's to choose, and the code is what they branch on.
  - [x] 1.4 `formatMigrations.test.ts` (per-file ≥90% gate) covers:
    - identity (a current-version envelope comes back with `toBe`, and a spy registry is never
      called);
    - `'newer-version'` (`CURRENT + 1`, and a large version) with no step called;
    - `'corrupt'` for missing, `'1'`, `1.5`, `0`, `-1`, `NaN`, `null`, `[]`, and a string input;
    - chain mechanics with an injected registry `{1: s1, 2: s2}` at `currentVersion: 3`:
      - a v1 input runs s1 then s2 in order;
      - a v2 input runs only s2;
      - each step sees the `representation` argument;
      - each step's output has `formatVersion` bumped by `migrate`;
      - the input object is not mutated (deep-frozen fixture);
    - the gap: registry `{1: s1}` at `currentVersion: 3` fails with `'missing-step'`;
    - **registry integrity for the real registry**: for every `v` in `[1, CURRENT_FORMAT_VERSION)`,
      `MIGRATIONS[v]` is a function. The loop is vacuous today and becomes load-bearing on the
      first bump. Say so in the test's comment.
  - [x] 1.5 Barrel: export `MIGRATIONS`, `migrate`, `createMigrator`, `isFormatMigrationError`
    and the types from `packages/domain/src/index.ts`, with a WHY comment in the barrel's style.
    **The barrel collides on every two-lane sync.** Add one contiguous block at the end so
    `[[sync.rules]]` resolves it mechanically.

- [x] **Task 2: assert the organism stamp** (AC: 3)
  - [x] 2.1 In `packages/domain/src/organismSchema.ts`, change `schemaVersion` from
    `z.number().int().min(1)` to `z.literal(ORGANISM_SCHEMA_VERSION)` (Decision I.4, "asserted at
    load (mismatch ⇒ corrupt)"; FD5). Rewrite the field comment: the stamp is asserted **after**
    the chain has run at both boundaries, so a correct literal can never reject a record a
    migration step was meant to upgrade. Move the "floored at 1" rationale to `migrate()`'s version
    check, where it now lives.
  - [x] 2.2 In `organismSchema.test.ts`, keep the `schemaVersion: 0` rejection. Add `2` rejected,
    and `ORGANISM_SCHEMA_VERSION` accepted. Check that the existing
    `CONWAYS_CLASSIC.schemaVersion === ORGANISM_SCHEMA_VERSION` pin still holds.
  - [x] 2.3 Sweep for fixtures that stamp anything other than `1`:
    `grep -rn 'schemaVersion:' packages apps/web --include='*.ts' --include='*.tsx'`. The sweep at
    story creation found only `1` and the deliberate `0` test. Any hit that stamps
    `CURRENT_FORMAT_VERSION` instead of `ORGANISM_SCHEMA_VERSION` is a latent axis mix-up
    (Story 1.5 FD3). Fix it only if it is in a file this story already touches; otherwise note it.

- [x] **Task 3: the at-rest boundary in `@gol/persistence`** (AC: 2, 4, 5, 6)
  - [x] 3.1 In `packages/persistence/src/localStorageAccess.ts`, add the internal
    `ensureCurrentAtRestFormat(migrator = migrate)`, called at the top of `readCollection` (FD6).
    It works in this order:
    1. Read `gol:schema`. If it is absent, return: the store is fresh, or only settings have been
       written (settings never stamp).
    2. Parse it. If it is not JSON or not an object, throw `CorruptDataError('gol:schema', …)`.
    3. Assemble the at-rest document: `{ formatVersion, battles: <raw gol:battles collection>,
       organisms: <raw gol:organisms collection> }`. Use the raw JSON with no Zod parse; migration
       runs before validation at this boundary too. *(Implemented as memoized LAZY getters, not an
       eager read — see the Dev Agent Record's FD6 deviation; review 2026-09-25 confirmed it.)*
    4. Call `migrator(doc, 'at-rest')`.
    5. If it returns the input by reference, return. This is the only path reachable today.
    6. Otherwise take the write-back path (3.2).
    Map a thrown `FormatMigrationError` to `CorruptDataError('gol:schema', <message>, { cause })`, so
    every existing caller's CorruptDataError handling covers it and Story 5.11 can branch on
    `cause.code === 'newer-version'` for its copy.
    *(Superseded for `'newer-version'` by the owner's 2026-09-25 decision: it now surfaces as
    `NewerFormatVersionError`, a `CorruptDataError` subclass in `@gol/persistence` — see FD9.)*
    ⚠️ The raw collection read inside this function must not re-enter `readCollection`, or it
    recurses. Use a private raw reader.
  - [x] 3.2 **Write-back with rollback.** The steps are not idempotent, and localStorage has no
    multi-key transaction. Do it in this order:
    1. Serialise **both** candidates before touching storage (the existing
       candidate-then-setItem discipline).
    2. Capture the two original strings.
    3. `setItem` battles, then organisms.
    4. On any failure, restore both originals and rethrow (a `QuotaExceededError` stays one).
    5. Only after both data writes succeed, **overwrite** the stamp with the migrated
       `formatVersion`.
    A plain `stampSchemaVersion()` is not enough: it only writes when the stamp is absent. If the
    stamp write itself fails, the data is already migrated under an old stamp and the next load
    would re-run the steps on migrated data. So a stamp-write failure also restores both data
    originals and rethrows. Put the WHY in a comment in the style of the existing "ORDERING IS
    LOAD-BEARING" block.
  - [x] 3.3 Rewrite the misleading `hasSchemaStamp` comment. "Presence-only check (not the stamp's
    value — Decision I asserts stamps, never branches on them)" conflates `gol:schema`'s value,
    which **is** `formatVersion`, the one thing Decision I allows a branch on, with the
    subordinate stamps. `isFreshWorkspace()` stays presence-only. The comment should say it is
    presence-only because freshness is a presence question, and that the value is read by the
    format check.
  - [x] 3.4 In `localStorageAccess.test.ts` (jsdom), add tests for each of:
    - a current stamp: reads proceed and nothing is written (spy on `setItem`);
    - no stamp: reads proceed and nothing is written;
    - a stamp of `{formatVersion: 2}`: `readCollection` throws `CorruptDataError` whose `cause`
      satisfies `isFormatMigrationError` with code `'newer-version'`, and **both data keys are
      byte-identical afterwards**; *(now `NewerFormatVersionError`, still `instanceof
      CorruptDataError` — FD9)*
    - stamps of `"x"`, `{}` and `{formatVersion: '1'}`: `CorruptDataError`;
    - through an injected synthetic migrator (export the function for tests only, or test through
      a small seam; do not widen the package barrel), write-back succeeds and restamps;
    - with a quota stub on the organisms write, battles is restored and the stamp is unchanged;
    - with a stub on the stamp write, both data keys are restored.
    Repository-level tests (`localStorageBattleRepository.test.ts` /
    `localStorageOrganismRepository.test.ts`) get one case each: a newer stamp makes
    `load`/`list`/`listFull` reject with `CorruptDataError` rather than skip silently. `list()`'s
    per-record skip must not swallow a whole-store format failure.

- [x] **Task 4: the import-boundary proof** (AC: 2b, 4)
  - [x] 4.1 In `formatMigrations.test.ts` (or a sibling test), run `migrate(env, 'envelope')` on a
    real envelope from `toEnvelope(...)`, JSON round-tripped, then `WorkspaceExportSchema.parse` on
    the result. Identity holds and the parse succeeds. The same envelope with `formatVersion: 2`
    is rejected by `migrate` with `'newer-version'` before `WorkspaceExportSchema` is consulted.
    That is the "never partially applied" half AC4 can prove without Story 5.8's writer.
  - [x] 4.2 Update the forward reference in the `WorkspaceExportSchema` JSDoc
    (`workspaceExportSchema.ts`, "belong to Story 5.7, which runs `migrate()` BEFORE `parse()`").
    The registry now exists, and the ordering obligation is Story 5.8's `importWorkspace`. Keep
    the "do not widen the literal" warning. Also update the `workspaceSerializer.ts` factory JSDoc,
    which says "`parse` / `migrate` / `importWorkspace` are still absent, and are Stories 5.7 and
    5.8". Strike only the `migrate` part.

- [x] **Task 5: records** (AC: 7)
  - [x] 5.1 In `deferred-work.md`, add a "Deferred from: Story 5-7" section recording FD1–FD9
    variances. Strike the entry this story discharges and annotate (never delete, never strike)
    the ones it only re-points — a struck entry reads as resolved, and the re-pointed ones stay open
    (FD7): the strip-vs-strict entry (`:27`), the battle `schemaVersion` entry (`:25`), the
    `colorToken` `.max()` entry (`:60`), the name `.min(1)` entries (`:103`, `:1114`), the summary
    100-vs-120 entry (`:1577`), and the Story 4.17 restamp note (`:2422`).
  - [x] 5.2 Run `npm run ci:dev`, redirected to a file with `echo $?`. Never pipe it. The bundle
    growth ratchet: `migrate` now reaches every route through `readCollection`. It should be far
    under 8 KB. If any route grows, refresh the baseline in the same change
    (`npm run build:standalone && npm run bundle:baseline`) and never hand-edit
    `scripts/bundle-baselines.json`.
  - [x] 5.3 Fill in the Dev Agent Record, including every forced decision you deviated from.

### Review Findings

Reviewed 2026-09-25 on **Fable 5.1** against the **Opus** implementation, via three parallel
adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Decisions are the owner's
and are left unresolved here; patches were applied in the review's own commit.

- [x] [Review][Decision] **A newer `gol:schema` stamp has no recovery path — the reset FD9 leans
  on cannot clear it** — `clearAll()` → `removeDataKeys()` keeps `gol:schema` by design (Story 1.5:
  "stays stamped through clearAll() on purpose"), so after the 5.11 reset the store is empty and
  *every* read still throws `CorruptDataError(newer-version)`; even the re-seed's `save()` is
  refused. FD9's "declining leaves the data untouched" is true; *accepting* leaves the user with
  nothing and the same error. Options: **(a)** a newer stamp is not a "corrupt" condition at all —
  5.11 shows only "update the app" for `cause.code === 'newer-version'` and offers no reset
  (`FormatMigrationError` surfaces as its own error class or a `CorruptDataError` subclass so the
  UI can tell without reaching into `cause`); **(b)** Story 5.10's `clearAll()` also rewrites the
  stamp to `CURRENT_FORMAT_VERSION` (or removes it, which flips `isFreshWorkspace()` and re-seeds
  through the normal path) — a change to Story 1.5's stamp-survives-clear rationale; **(c)** keep
  FD9 as shipped and make 5.11 call a new persistence-level "reset format" alongside the reset.
  Folds in the story's FD9 flag, which is sharper than stated: the error *class* is a footnote, the
  recovery path is the question. [`packages/persistence/src/localStorageAccess.ts` `removeDataKeys`,
  `createLocalStorageRepositories.ts:26-36`] **→ Sidiar (2026-09-25): (a)** — a newer stamp is not
  a corruption condition: the data is intact and a newer build reads it, so a reload is the fix
  and a reset would destroy recoverable data. 5.7 surfaces `newer-version` so the UI can tell it
  apart without reaching into `cause` — at the persistence boundary, where classes are allowed
  (`CorruptDataError` is one, `errors.ts`): its own error class or a `CorruptDataError` subclass;
  `@gol/domain`'s `FormatMigrationError` stays an interface + factory (no classes in the domain);
  5.11 shows only "a newer version of the app saved this data — reload" for it and offers no
  reset. `clearAll()` keeps the stamp (Story 1.5 unchanged). **✓ Applied 2026-09-25:**
  `NewerFormatVersionError extends CorruptDataError` (`packages/persistence/src/errors.ts`, exported
  from the barrel), thrown by `ensureCurrentAtRestFormat` for `'newer-version'` only; FD9 annotated;
  5.11's reload-only obligation recorded in `deferred-work.md`.
- [x] [Review][Decision] **FD2 — the step contract `(doc, representation)`** — no governing spec
  fixes a step's signature: RFC-006 Decision 3's snippet is single-argument and silently assumes one
  shape at both boundaries, which RFC-006 Decisions 2 and 7 (dense/id-keyed at rest, sparse arrays
  on the wire) make impossible; Decision I.3 only requires one atomic function per version. The
  review confirms the three rejected alternatives are the right ones to reject. Options: **(a)**
  confirm as shipped (steps branch on the SHAPE inside one function; both boundaries share every
  organism rewrite); **(b)** a canonical intermediate form (a third shape to keep in sync);
  **(c)** two tables (the fork AR-11 forbids). Free to change only while the registry is empty.
  [`packages/domain/src/formatMigrations.ts:37-48`] **→ Sidiar (2026-09-25): (a)** — confirmed
  as shipped: one atomic step per version, `(doc, 'envelope' | 'at-rest')`, branching on the shape
  only where a step touches battle structure or collection form. No code change. **✓ Confirmed
  2026-09-25.**
- [x] [Review][Decision] **FD7, narrowed to strip-vs-`.strict()`** — re-pointing `colorToken`
  `.max()`, `name` `.min(1)` and the summary 120→100 cap to the first `formatVersion` bump is
  *settled* by Decision I.1 ("any change to any persisted shape bumps `formatVersion`"): each fails
  a record valid today. Strip-vs-strict is not: nothing the app writes carries unknown keys, so
  `.strict()` is not a persisted-shape change in I.1's sense, and the deferred entry asked for it to
  be decided "together with 5.7/5.8" — Story 5.8's import boundary could still take it without a
  bump. Options: **(a)** keep strip everywhere (as shipped; a hand-edited file with a comment key
  still imports; the settings exclusion stays a strip); **(b)** `.strict()` on the *envelope* only,
  at import (5.8), leaving at-rest schemas strip; **(c)** `.strict()` everywhere at the first bump.
  [`docs/implementation-artifacts/deferred-work.md:27`] **→ Sidiar (2026-09-25): (a)** — keep strip everywhere, as
  shipped. A newer-format document is refused by version before any parse (AC4), so the only
  unknown keys a same-format document can carry are hand edits, foreign tools or junk — nothing
  worth preserving. Loose schemas (`z.looseObject`, keep-but-ignore) were considered and rejected:
  they would make the `settings` exclusion depend on the import code rather than the parser, and
  propagate foreign keys through the store and onward exports. No code change; the
  `deferred-work.md:27` entry closes on this decision. **✓ Applied 2026-09-25:** the entry is
  struck and marked closed by this decision.
- FD5 (`z.literal(ORGANISM_SCHEMA_VERSION)`) is **settled, not open**: Decision I.4 says verbatim
  "asserted at load (mismatch ⇒ corrupt, NFR-7.3 path)", RFC-006 Alternative 5 is normative on the
  same point, and AC3 requires it. No decision item.
- [x] [Review][Patch] **`replaceAll` bypasses the at-rest check, so "every write is covered" was
  false** — both repositories' `replaceAll` build a whole collection and call `writeDataKey` without
  `readCollection`; on an older stamp a real step would then re-run over current data, on a newer
  stamp this build would overwrite the newer data and leave its stamp. Fix: `writeDataKey` calls
  `ensureCurrentAtRestFormat()` before the write (one `getItem` + tiny parse; it throws before
  anything is written), the WHY comment now says so, and tests pin it at both the access layer and
  each repository's `replaceAll`. Story 1.4's "not rewritten by subsequent writes" fixture stamped
  `formatVersion: 99` as "hand-edited" — that is now a newer-format store by definition, so the
  fixture keeps the current version and proves non-rewriting through a marker key instead.
  [`packages/persistence/src/localStorageAccess.ts` `writeDataKey`]
- [x] [Review][Patch] **Rollback touched keys the failed write never overwrote** — a battles-write
  failure removed and re-set organisms too; the restore `setItem` is the one call that can lose
  data, so it now runs only over keys a commit actually replaced.
  [`packages/persistence/src/localStorageAccess.ts` `writeBackMigrated`]
- [x] [Review][Patch] **The write-back trusted the migrator for the version it stamped** — an
  injected migrator could stamp `{}` or `"2"` and make every later read throw; `asFormatVersion`
  refuses a non-integer before anything is written. [`localStorageAccess.ts` `asFormatVersion`]
- [x] [Review][Patch] **`asCollection` accepted a `Map`/class instance** — `JSON.stringify` renders
  either as `{}`, so a step bug would have wiped a collection and restamped it as migrated; it now
  requires a plain (or null-prototype) object. [`localStorageAccess.ts` `asCollection`]
- [x] [Review][Patch] **`createMigrator` spread a non-object step result silently** — `undefined`,
  `null`, an array or a string spread to `{ formatVersion }`, an empty document for the next step.
  A step's bug is a programming error, so it throws a plain `Error` (not a `FormatMigrationError`
  the UI would word as "your data is corrupt"); the at-rest boundary already passes those through.
  [`packages/domain/src/formatMigrations.ts` loop]
- [x] [Review][Patch] **`isFormatMigrationError` did not check `foundVersion`** — the guard's own
  comment promises the fields, not just the name. [`formatMigrations.ts` guard]
- [x] [Review][Patch] **Registry-integrity test could not see a step at the wrong slot** — a 1→2
  step registered under `2` passed the range loop and would fail as `missing-step` in a browser;
  the keys are now asserted to be exactly `1..CURRENT-1`. [`formatMigrations.test.ts`]
- [x] [Review][Patch] **`vi.restoreAllMocks()` at a test's tail** — runs only when every assertion
  before it passed; moved to `afterEach`. [`formatMigrations.test.ts`]
- [x] [Review][Patch] **Vacuous "no step runs" spy in the newer-version test** — the spy sat only at
  the current slot, which no implementation would consult for a newer document; it is now also at
  the document's own version. [`formatMigrations.test.ts`]
- [x] [Review][Patch] **The step contract hid that at-rest `battles`/`organisms` are lazy accessors
  that can throw `CorruptDataError`** — documented on `FormatMigration`; the header's garbled "the
  same `migrate()` file import runs" sentence fixed; `let migrated` typed instead of evolving.
  [`formatMigrations.ts`, `localStorageAccess.ts`]
- [x] [Review][Patch] **Task 5.1 said "strike and annotate" all six entries; only the discharged
  one is struck** — the right call (a strike reads as resolved), so the task text now says so; Task
  3.1 step 3 now notes the lazy-getter deviation inline. [this file]
- [x] [Review][Defer] **Absent stamp with data present is treated as current** [`localStorageAccess.ts`
  `ensureCurrentAtRestFormat`] — deferred, pre-existing: Story 1.4's data-then-stamp order allows
  "data written, stamp not", and Task 3.1 step 1 specifies absent ⇒ return. After a future bump
  such a store skips the chain and fails the parse instead. Reachable only if a ~20-byte stamp write
  fails right after a data write succeeded.
- [x] [Review][Defer] **Multi-tab races around the write-back** [`localStorageAccess.ts`
  `writeBackMigrated`] — deferred, out of scope: another tab restamping between this tab's stamp
  read and its write-back, or writing a collection between the originals capture and a failed
  commit. FD6 rejected a module flag for the same reason; cross-tab coordination (a `storage`-event
  re-check or a lock key) is its own design.
- [x] [Review][Defer] **A rollback restore `setItem` that itself throws loses the original**
  [`localStorageAccess.ts` `writeBackMigrated`] — deferred: after the remove the originals fit by
  construction (the store held exactly them), and a `SecurityError` would have failed the earlier
  `getItem`; no realistic path, but the branch is unguarded and untested.

Dismissed as noise (6): the import-boundary test proves the expression order the story asked for
(5.8 owns the real pipeline); `/*#__PURE__*/` on `migrate` (every route reaches `readCollection`
anyway); untrusted `formatVersion` strings in messages (5.11 owns copy and branches on `code`);
`createMigrator`/`ensureCurrentAtRestFormat` exported as seams (FD3 / Task 3.4 specify it);
`PALETTE_VERSION` named in a JSDoc sentence (a mention, not a reference); an
`ORGANISM_SCHEMA_VERSION ≤ CURRENT_FORMAT_VERSION` pin (independent axes, Story 1.5 FD3).

Verification: `npm run ci:dev` re-run after the patches (result in the Dev Agent Record). The
first run's `bench:check` was red at 21.9 ms while three review subagents and the build shared
the CPU; in isolation the frame is 5.9 ms (10.8 ms headroom) — contention, not the branch.

Cross-epic: 5.7 touches `packages/domain/src/index.ts` (barrel, `[[sync.rules]]` resolves it),
`organismSchema.ts`, `localStorageAccess.ts` and `scripts/bundle-baselines.json`. PR #83 (4.22)
touches only `apps/web` plus `bundle-baselines.json`/`deferred-work.md`/`sprint-status.yaml`, and
4.23–4.26 sit over the existing repository API — no `lane-gates.yaml` row proposed. The baseline
JSON will collide on the sync: re-run `npm run bundle:baseline` on the merged tree rather than
merging numbers.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1: the registry lives in `@gol/domain`, not `@gol/persistence`.** It is pure, DOM-free, and
  consumed by both boundaries. The envelope schema it guards already lives in `@gol/domain`
  (Story 5.3's split). It belongs under the NFR-5.1 ≥90% per-file gate, not persistence's ~80%
  aggregate. RFC-006's snippet places it near the serializer. That is illustrative, not a module
  assignment.
- **FD2: one step function per version, told which representation it holds.**
  ⚠️ *This is the architecture-shaping call of the story; flagged for the owner.* The two
  boundaries hold the same data in **different shapes**:
  - **at rest**, `battles` and `organisms` are id-keyed objects, and a battle is dense
    `gridState` + `organismIds` + `gridSize`;
  - **on the wire**, they are arrays, and a battle is sparse `cells` + `gridDimensions` with no
    roster (Story 5.3).
  Neither can be converted to the other before migration, because the converter
  (`toEnvelope`/`fromEnvelope`) needs *current-version parsed* records. So a step receives
  `(doc, representation)`. Organism records are identical in both, so rule and palette rewrites
  are written once. Only a step that touches battle structure or collection form branches on
  `representation`, and it does so inside its one atomic function. This satisfies Decision I.3
  ("one atomic function per step … steps compose in version order") and I.2 (source-keyed, one
  loop). The branch is on the **representation**, never on a version, so I.4 is untouched.
  Alternatives rejected:
  - separate `MIGRATIONS_AT_REST` / `MIGRATIONS_WIRE` tables: that is the fork AR-11 forbids;
  - migrating only envelopes and converting at-rest data through export/import on upgrade: this
    needs current-version parsing of old data, which is circular;
  - a canonical intermediate form: a third shape to keep in sync.
  The at-rest document uses the envelope's own top-level names (`formatVersion`, `battles`,
  `organisms`), so a step reads the same keys either way.
- **FD3: `createMigrator` is the seam, and `migrate` is its production instance.** It is the only
  way to test chain order, the gap check, and the at-rest write-back while the real registry is
  empty, without shipping a fake step or a mutable module registry. A factory over injected
  values is the repo's pattern (`createWorkspaceSerializer`, the injected RNG). The barrel exports
  both. Production code calls `migrate`.
- **FD4: `FormatMigrationError` is an interface + factory, not a class.** `@gol/domain` has no
  classes today, and it is the rules layer that project-context's "no classes in the engine"
  covers. `RuleCompilationError` (`packages/simulation/src/session/validateRules.ts:26-51`) is the
  precedent to copy, including a guard that checks the fields as well as `name`. RFC-006's
  `ImportError('newer-version' | 'corrupt')` is **not** created here. Story 5.8 owns `ImportError`
  and maps this error into it (its `'not-json'` / `'write-failed'` codes are not migration
  concerns). Recorded as a variance: the RFC names one error type for both boundaries, but the
  at-rest boundary is not an import.
- **FD5: assert `schemaVersion` with `z.literal(ORGANISM_SCHEMA_VERSION)`.** Decision I.4 says
  organism stamps are "**asserted** at load (mismatch ⇒ corrupt)". Today `OrganismSchema` accepts
  any integer ≥1, so a `schemaVersion: 7` record loads silently. That is a stamp nobody checks,
  and the half of AC3 still missing. The literal is safe because the chain runs before every
  parse at both boundaries (Task 3 wires the at-rest one). A future rules-shape bump changes
  `ORGANISM_SCHEMA_VERSION` and adds the step that restamps. `projectOrganismForSave` already
  stamps the constant (Story 4.17's RESTAMP decision, `deferred-work.md:2410-2423`). Every fixture
  on `main` stamps `1`.
- **FD6: at-rest migration runs inside `readCollection`, on every read, statelessly.** Wiring it at
  one app bootstrap point does not work. `useWorkspaceSeed` runs on `/`, `/organisms` and
  `/settings` only, and `/battle?id=` deep-links read the repositories without it. It would also
  mean a new `AppRepositories` method that `@gol/test-utils`' fakes must mirror, for a check that
  is only meaningful for localStorage. The cost per read is one `getItem` and a ~20-byte
  `JSON.parse`. Every write path is read-modify-write through `readCollection`, so writes are
  covered as well. No module-level "already migrated" flag: it would leak between tests and go
  stale if another tab migrates. The mode-agnostic seam is untouched. Connected mode's server
  owns its own migrations (RFC-006 Decision 9).
- **FD7: the deferred schema-tightening items are NOT taken here.** Several `deferred-work.md`
  entries name "Story 5.7" as the home for tightening:
  - `.strict()` vs strip;
  - `colorToken` `.max()`;
  - `name` `.min(1)` on organisms and battles;
  - the rule-summary schema cap of 120 vs the UX cap of 100.

  Each would make records that are **valid on `main` today** fail validation. Under Decision I.1
  that is a persisted-shape change, so it needs a `formatVersion` bump and a real repair step (an
  empty name needs a filler). AC6 says real migrations "arrive with future format bumps". Strip
  is kept deliberately, for four reasons:
  - newer-format data is now rejected by version before any parse (AC4);
  - unknown keys in a same-format file are stripped at parse, so they are never persisted;
  - `WorkspaceExportSchema`'s JSDoc already makes the strip the settings-exclusion mechanism;
  - `.strict()` would reject a hand-edited file for an extra comment key.

  Re-point every entry to "the first `formatVersion` bump — the registry's first real step",
  flagged for the owner. The battle `schemaVersion` entry (`:25`) is closed as **not needed**:
  Decision I makes `formatVersion` the only driver, and a battle stamp would be a second axis of
  the kind I.4 exists to forbid.
- **FD8: `gol:settings` is outside the chain.** Settings are device-local, never in any envelope
  (Decision F), and already self-heal through `SettingsSchema`'s per-field `.default()`
  (`settingsSchema.ts`). The workspace format version does not describe them, and
  `writeSettingsKey` deliberately does not stamp.
- **FD9: a newer at-rest stamp is surfaced as `CorruptDataError` with the migration error as
  `cause`.** This is a downgrade: the data was written by a newer build. It is not "corrupt" in
  the everyday sense, but every consumer already routes `CorruptDataError` to a
  "can't read your data" state, and Story 5.11 owns the UI and recovery (its reset offer, the
  5.10 path; declining leaves the data untouched, which this story guarantees by throwing before
  any write). A new top-level error class would need every caller updated now for a screen that
  does not exist yet.
  **↪ Revised by owner decision (Sidiar, 2026-09-25, review item (a)):** a newer stamp is **not**
  a corruption condition — the data is intact and a newer build reads it, so a reload is the fix
  and a reset would destroy recoverable data. It now surfaces as `NewerFormatVersionError`, a
  `CorruptDataError` subclass in `@gol/persistence` carrying `foundVersion` / `supportedVersion`
  (the migration error stays its `cause`); `FormatMigrationError` in `@gol/domain` stays an
  interface + factory. Story 5.11 shows only "a newer version of the app saved this data —
  reload" for it and offers no reset; `clearAll()` keeps the stamp (Story 1.5 unchanged). Every
  other migration failure (a stamp with no usable version) is still a plain `CorruptDataError`.

### What exists: read these before writing a line

- `packages/domain/src/settingsSchema.ts:1-8`: `CURRENT_FORMAT_VERSION = 1 as const`, the single
  source for both the at-rest stamp and the envelope literal.
- `packages/domain/src/workspaceExportSchema.ts`:
  - the envelope's `formatVersion: z.literal(CURRENT_FORMAT_VERSION)` and the JSDoc reserving the
    graceful path for this story;
  - Zod v4 spellings (`z.iso.datetime()`, `z.uuid()`), not the RFC's v3.
- `packages/domain/src/organismSchema.ts:20-35`: `ORGANISM_SCHEMA_VERSION` and the
  `schemaVersion` field (FD5).
- `packages/persistence/src/localStorageAccess.ts`:
  - `STORAGE_KEYS`;
  - `readStoredValue` / `readCollection` (the insertion point);
  - `writeKey`'s candidate-then-setItem;
  - the "ORDERING IS LOAD-BEARING" block;
  - `stampSchemaVersion` (writes only if absent);
  - `hasSchemaStamp` (presence-only, with a misleading comment, Task 3.3);
  - `QuotaExceededError`.
- `packages/persistence/src/errors.ts`: `CorruptDataError(key, detail, { cause })`.
- `packages/persistence/src/localStorage{Battle,Organism}Repository.ts`: `load` throws on a corrupt
  record, `list`/`listFull` skip per record. Both call `readCollection` first, so a throw from the
  format check propagates, and that is correct.
- `packages/simulation/src/session/validateRules.ts:26-51`: the interface + factory + guard
  error pattern (FD4).
- `packages/persistence/src/workspaceSerializer.ts`: export only. No `migrate`/`import` yet
  (Story 5.8 adds `importWorkspace`, consuming this story's `migrate`).
- `apps/web/lib/palette/paletteRegistry.ts:20`: `PALETTE_VERSION = 1`, referenced nowhere else
  (and by `deferred-work.md:2640-2652`'s ruling it is never stamped into an envelope). AC3 needs
  no change to it.

### Architecture compliance

- **Decision I** (`architecture.md:276-287`) is the authority:
  - I.1: one driver, `formatVersion`;
  - I.2: source-keyed `MIGRATIONS[from]`;
  - I.3: one execution site, two entry points, and steps as atomic functions ordered
    *structure → rules → palette*;
  - I.4: stamps are asserted, never switched on.
  RFC-004's target-keyed `range(schemaVersion + 1, …)` pipeline is **retired**. Do not
  reintroduce anything keyed on `schemaVersion`.
- **RFC-006 Decision 3** (`:159-184`). The snippet is v3/`any`-typed and illustrative. Do not copy
  `(raw as any)` or `type Migration = (data: any) => any`, because strict TS forbids `any`. Use
  `unknown` + narrowing and `Readonly<Record<string, unknown>>`.
- **AR-2/27**: nothing in `apps/web` changes. The at-rest check is inside the localStorage
  implementation, behind the injected `AppRepositories`.
- **No DOM types in `packages/domain`**: the registry is pure. `packages/persistence` already has
  the DOM lib for `localStorage`.
- **Zod parses at boundaries, not everywhere**: migration runs before the boundary parse, at the
  boundary, and never per engine consumption (Decision I.3).
- **Spec-ID citations** must resolve under `npm run spec:check`: `AR-11`, `NFR-7.3`,
  `Decision I`, `RFC-006`, `Story 5.8`. There is no hyphenated `M-9`.

### Library / framework notes

- No new dependency. Zod is v4 on this install (see the `workspaceExportSchema.ts` header). The
  literal is `z.literal(ORGANISM_SCHEMA_VERSION)`, which works because it is declared `as const`.
- `Object.freeze({})` typed as `Readonly<Record<number, FormatMigration>>`. The `@gol/domain`
  barrel's `sideEffects: false` note allows freezing at module scope. Do not register anything at
  import time.

### Testing standards

- `packages/domain` has a **≥90% per-file** gate. `formatMigrations.ts` needs every branch
  covered, which the AC6 list does naturally. No coverage-padding tests.
- `packages/persistence` runs under jsdom, which has a real `Storage` with a real quota. Stub
  `Storage.prototype.setItem` per key to simulate a mid-write failure, following the precedent in
  `localStorageAccess.test.ts`.
- Test "nothing was written" with a `setItem` spy **and** by comparing raw `getItem` strings
  before and after. The spy alone misses a `removeItem`.
- Deep-freeze migration inputs in tests to prove non-mutation.
- No e2e. No UI changes. The existing e2e suite must stay green (every page reads through
  `readCollection`).

### Previous story intelligence

- **Story 5.6** (done, #82): `lib/export/` is the app's export seam. `exportBattle(id)` reads
  through `repos.battles.load`. For this story: runtime strings carry no story IDs, history in
  `deferred-work.md` is struck and never deleted, and an invariant you rely on gets a pinning test.
- **Story 5.3**:
  - the envelope lives in `@gol/domain`, and the serializer factory in `@gol/persistence` only
    reads repositories;
  - variances from RFC-006 snippets are **recorded in `deferred-work.md`**, not absorbed silently;
  - Zod v4 spellings.
  The `formatVersion` literal was deliberately left strict so that this story's rejection path
  would be reachable.
- **Story 5.4**: the owner rules on variances. Present them as FDs and flags, and do not quietly
  pick one.
- **Stories 1.4 / 1.5**:
  - the data-then-stamp ordering and why stamp-then-data leaves a stamped-but-empty store;
  - `isFreshWorkspace()` gates seeding on stamp *presence*;
  - Story 1.5 FD3: `CONWAYS_CLASSIC.schemaVersion` is a literal `1`, not `CURRENT_FORMAT_VERSION`,
    because the two axes differ.

### Git intelligence

`main` is at `747727b` (#82 Story 5.6 merged). Recent Epic 5 work is in `apps/web/lib/export/`,
`components/settings/`, `components/battle/`. **This story is the first Epic 5 change to the
localStorage read path since Story 1.4.** It touches `packages/domain/src/index.ts` (the barrel
collides on every two-lane sync, and `[[sync.rules]]` resolves it) and
`packages/domain/src/organismSchema.ts`. The Epic 4 lane's open PR #83 (4.22) touches neither
(see the lane gate below).

### Project Structure Notes

- New:
  - `packages/domain/src/formatMigrations.ts` + `formatMigrations.test.ts`.
- Modified:
  - `packages/domain/src/organismSchema.ts` (+ test);
  - `packages/domain/src/index.ts`;
  - `packages/domain/src/workspaceExportSchema.ts` (JSDoc only);
  - `packages/persistence/src/localStorageAccess.ts` (+ test);
  - `packages/persistence/src/localStorage{Battle,Organism}Repository.test.ts` (one case each);
  - `packages/persistence/src/workspaceSerializer.ts` (JSDoc only).
- Docs: `deferred-work.md`, `sprint-status.yaml`.
- Possibly: `scripts/bundle-baselines.json`, tool-written and only if a route grows.
- Untouched on purpose:
  - everything under `apps/web`;
  - `repositories.ts` (no interface change, FD6);
  - `@gol/test-utils`' fakes;
  - `settingsSchema.ts` (`CURRENT_FORMAT_VERSION` stays `1`);
  - `paletteRegistry.ts`;
  - every `package.json`.

### What NOT to build

- ❌ A real migration step, or any `CURRENT_FORMAT_VERSION` bump (AC6).
- ❌ `importWorkspace`, `ImportError`, `assertReferentialClosure`, snapshot/rollback of the whole
  workspace, or any UI (Stories 5.8 / 5.9 / 5.11).
- ❌ Any branch on `schemaVersion`, `PALETTE_VERSION` or `appVersion` (Decision I.4).
- ❌ A second registry per boundary (FD2), or a mutable/registrable module-level registry (FD3).
- ❌ Loosening `WorkspaceExportSchema.formatVersion` to a range. That would make AC4 unreachable at
  import.
- ❌ Schema tightening from `deferred-work.md` (FD7), or migrating `gol:settings` (FD8).
- ❌ A new `AppRepositories` method (FD6).

### Open flags for the owner (not blockers: the story proceeds on the FDs)

- **FD2** is the shape every future step and Story 5.8 inherit: one step per version, taking
  `(doc, representation)`. If the owner prefers a different contract, change it now, while the
  registry is empty and changing it is free.
- **FD5** turns a silently accepted foreign `schemaVersion` into a corrupt record at load. That is
  Decision I.4 as written, but it is a behaviour change on existing (hypothetical, out-of-band)
  data.
- **FD7** re-points six `deferred-work.md` entries that named this story as their home, and keeps
  Zod's strip rather than `.strict()`.
- **FD9**: a downgraded browser (a newer stamp) reads as `CorruptDataError` until Story 5.11
  words it. *(Resolved 2026-09-25: `NewerFormatVersionError`, reload-only in 5.11 — see FD9.)*

### References

- `docs/planning-artifacts/epics.md:1395-1406` (Story 5.7), `:1408-1419` (5.8, the consumer),
  `:1447-1458` (5.11), `:168-172` (AR-9 to AR-13).
- `docs/planning-artifacts/architecture.md:276-287` (Decision I), `:259` (G.1: a preset change is
  a `formatVersion` bump), `:347` (M1 seeding keyed on `gol:schema`).
- `docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md:159-184` (Decision 3),
  `:219-240` (Decision 5 pipeline order), `:262` (`gol:schema → { formatVersion }`), `:271`
  (seeding), `:339-342` (Alternative 5, normative).
- `docs/implementation-artifacts/deferred-work.md`:
  - `:25` (battle stamp), `:27` (strip vs strict), `:60` (`colorToken` cap), `:103` and `:1114`
    (name `.min(1)`), `:1577` (summary cap);
  - `:2410-2423` (RESTAMP decision), `:2640-2652` (`PALETTE_VERSION` not stamped).
- `docs/project-context.md`:
  - "`formatVersion` is the only version anything branches on";
  - repositories are injected;
  - no DOM in `packages/*`;
  - coverage tiers;
  - `ci:dev` never piped;
  - the bundle growth ratchet;
  - `spec:check`.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (1M context) — `claude-opus-5-5[1m]`

### Debug Log References

- `npm run ci:dev` → exit 0 (typecheck, lint, format:check, spec:check, boundary:check,
  test:coverage, build:standalone, bundle:check, bench, bench:check, e2e:chromium 278 passed /
  1 skipped). Coverage: `@gol/domain` 100% on every file (incl. `formatMigrations.ts`),
  `@gol/persistence` 99.46% stmts / 97.29% branches aggregate. bench:check 6.719 ms headroom.
- bundle:check: every route +0.7 KB gzipped (within the 8 KB allowance) → baseline refreshed with
  `npm run bundle:baseline` over the `build:standalone` output of that same run (tool-written).
- One red test during development: the organisms-write quota stub also failed the rollback's
  restore `setItem` to the same key, so the test stub now fails only the first write to its key.
- **Code review 2026-09-25 (Fable 5.1):** `npm run ci:dev` after the review patches → exit 0
  (domain 243 / persistence 126 / web 2246 / test-utils 95 / simulation 408 passed; coverage
  `@gol/domain` 100% every file, `@gol/persistence` 99.48% stmts / 97.59% branches; bundle:check
  +0.1 KB gzipped per route for the new guards, baseline refreshed tool-written; bench:check
  7.031 ms, 9.6 ms headroom; e2e:chromium 278 passed / 1 skipped). No CI run exists for the branch
  (CI is pull_request-only). The one ESLint warning (`BattleGallery.tsx:248`) is pre-existing on
  `main`; `apps/web` is untouched.
- **Owner-decision pass 2026-09-25:** red first — the six newer-stamp assertions retargeted to
  `NewerFormatVersionError` failed (the error was still a plain `CorruptDataError`), then green.
  `npm run ci:dev` → exit 0 (domain 243 / persistence 126 / web 2246 / test-utils 95 / simulation
  408 passed; `@gol/persistence` 99.5% stmts / 97.64% branches, `errors.ts` 100%; bundle:check
  +0.1 KB gzipped per route, within the allowance — no baseline refresh; bench:check 9.321 ms
  headroom; e2e:chromium 278 passed / 1 skipped). One prettier fix on a retargeted test file.

### Completion Notes List

- **Task 1:** `packages/domain/src/formatMigrations.ts` — `MIGRATIONS` (frozen, empty),
  `createMigrator`, `migrate`, `FormatMigrationError` (interface + factory + field-checking
  guard), types. Order: non-plain-object → `corrupt`; bad `formatVersion` → `corrupt`; newer →
  `newer-version`; gap scan over the WHOLE range before any step runs → `missing-step`; then the
  loop, with `migrate` stamping `formatVersion: from + 1` after each step. Identity returns `raw`
  by reference. "Plain object" also rejects non-`Object.prototype` objects (a `Date`) and accepts a
  null-prototype one. 24 tests incl. the registry-integrity loop and the import-boundary proof.
  Barrel: one contiguous block appended at the end of `index.ts`.
- **Task 2:** `schemaVersion: z.literal(ORGANISM_SCHEMA_VERSION)`; comment rewritten, "floored at 1"
  moved to `migrate()`'s version check. Test added for `ORGANISM_SCHEMA_VERSION + 1` (kept `0`,
  `-5`, `1.5`; accepted-case and `CONWAYS_CLASSIC` pin already present and still pass). Sweep:
  every `schemaVersion:` fixture stamps `1` (or the constant); no `CURRENT_FORMAT_VERSION` axis
  mix-up found.
- **Task 3:** `ensureCurrentAtRestFormat(migrator = migrate)` at the top of `readCollection`, over a
  private `readRawCollection`; `FormatMigrationError` → `CorruptDataError('gol:schema', message,
  { cause })`. Write-back: all three candidates serialised first, originals captured, battles →
  organisms → stamp (overwritten, not `stampSchemaVersion`); any failure removes both data keys
  then restores the originals, and rethrows the original error. `hasSchemaStamp` comment rewritten.
  `writeKey` split into serialise + `commitCandidate` so the write-back shares the quota mapping.
  Tests: current / none / newer (byte-identical) / five bad stamps / non-migration error passes
  through / write-back success / organisms quota / stamp quota / never-written key rollback /
  malformed step output; one repository-level case each for battles (`load`/`list`/`listFull`) and
  organisms (`load`/`list`).
- **Task 4:** import-boundary proof in `formatMigrations.test.ts` (real `toEnvelope` output, JSON
  round-tripped; identity + `WorkspaceExportSchema` parse; newer envelope rejected with
  `parse`/`safeParse` spies never called). JSDoc forward references updated in
  `workspaceExportSchema.ts` and `workspaceSerializer.ts`.
- **Task 5:** `deferred-work.md` — new "Deferred from: Story 5-7" section (FD1–FD9); the six named
  entries struck/annotated/re-pointed, the Story 4.17 RESTAMP note annotated as read.
- **Deviations from the forced decisions (recorded for the owner):**
  - **FD6 / Task 3.1 step 3 — the at-rest document's collections are LAZY getters (memoized),
    not eagerly read.** Reading both full collections eagerly on every `readCollection` would (a)
    parse the whole store twice per read, contradicting FD6's own "one `getItem` and a ~20-byte
    `JSON.parse`" cost, and (b) make a corrupt `gol:battles` break every organism read (and vice
    versa) — a new cross-key failure coupling. With getters the identity path touches only
    `gol:schema`; a real step that reads a collection gets the same `CorruptDataError`. Pinned by a
    test.
  - **Task 3.2 rollback is remove-both-then-restore**, not restore-in-place, so restoring one
    original beside the other key's migrated (possibly larger) value cannot itself hit quota.
  - A step whose output has a non-object `battles`/`organisms` is rejected as `CorruptDataError`
    before anything is written (not specified by the story; the alternative was writing garbage).
- Open owner flags carried unchanged from the story: FD2 (step contract), FD5 (literal stamp
  assertion), FD7 (re-pointed tightening; strip kept), FD9 (downgrade reads as corrupt).
- **Owner decisions applied (Sidiar, 2026-09-25):**
  - ✅ Resolved review finding [Decision]: newer `gol:schema` stamp — option (a). New
    `NewerFormatVersionError extends CorruptDataError` in `packages/persistence/src/errors.ts`
    (`key`, `foundVersion`, `supportedVersion`, the `FormatMigrationError` as `cause`), exported
    from the `@gol/persistence` barrel; `ensureCurrentAtRestFormat` throws it for `'newer-version'`
    only — a stamp with no usable version (`'corrupt'`) and `'missing-step'` stay plain
    `CorruptDataError`. `FormatMigrationError` in `@gol/domain` unchanged (interface + factory).
    `clearAll()` untouched (keeps the stamp). **Why a subclass, not a sibling class:** every
    existing consumer of `CorruptDataError` is non-destructive and stays correct for newer data
    without a change — `saveFailureMessage`'s `instanceof` branch ("could not be read … nothing
    already stored was changed"; true: this build cannot read it), the Gallery/tile
    degrade-to-empty catches, `load()`'s documented "stored-but-unreadable throws
    `CorruptDataError`" contract and the repository tests pinning it. A sibling class would have
    silently moved `saveFailureMessage` to its generic branch and made every future "unreadable"
    handler list two classes. The one consumer that must NOT treat it as corrupt — 5.11's reset
    offer — checks the subclass first; recorded as a 5.11 hand-off in `deferred-work.md`. Tests:
    the access-layer newer-stamp test asserts class, `name`, `key`, both versions, `cause.code`
    and byte-identical keys; the five bad-stamp cases assert it is NOT a `NewerFormatVersionError`;
    the write-guard and repository `load`/`list`/`listFull`/`replaceAll` cases assert the
    subclass. FD9 (Dev Notes), Task 3.1/3.4 notes, the open-flags list, the
    `ensureCurrentAtRestFormat` JSDoc and the `deferred-work.md` FD9 entry annotated.
  - ✅ Resolved review finding [Decision]: FD2 step contract — option (a), confirmed as shipped.
    No code change.
  - ✅ Resolved review finding [Decision]: FD7 strip-vs-`.strict()` — option (a), strip kept. No
    code change; the `deferred-work.md` "Unknown keys are stripped" entry struck and marked closed
    by this decision.

### File List

- `packages/domain/src/formatMigrations.ts` (new)
- `packages/domain/src/formatMigrations.test.ts` (new)
- `packages/domain/src/index.ts`
- `packages/domain/src/organismSchema.ts`
- `packages/domain/src/organismSchema.test.ts`
- `packages/domain/src/workspaceExportSchema.ts` (JSDoc only)
- `packages/persistence/src/errors.ts` (`NewerFormatVersionError`)
- `packages/persistence/src/index.ts` (barrel export)
- `packages/persistence/src/localStorageAccess.ts`
- `packages/persistence/src/localStorageAccess.test.ts`
- `packages/persistence/src/localStorageBattleRepository.test.ts`
- `packages/persistence/src/localStorageOrganismRepository.test.ts`
- `packages/persistence/src/workspaceSerializer.ts` (JSDoc only)
- `scripts/bundle-baselines.json` (tool-written, +0.7 KB per route)
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/5-7-migration-registry.md`


Dev Model: opus   # architecture-shaping: fixes the step contract (FD2), the error type and the at-rest wiring that 5.8's import pipeline and 5.11's corruption handling build on
Proposed lane gate: none — 5.7 touches only packages/domain (formatMigrations.ts, organismSchema.ts, index.ts) and packages/persistence/src/localStorageAccess.ts; PR #83 (4.22) changes only apps/web/components/organisms + apps/web/lib/organisms + docs/bundle baselines and adds no persisted field (protection stays id-derived via organismDeleteVerdict/CONWAYS_CLASSIC_ID), and 4.23–4.26 are editor/battle UI over the existing repository API

## Change Log

- 2026-09-25 — Story 5.7 implemented: `formatMigrations.ts` registry + `migrate()` in `@gol/domain`,
  the at-rest format check with write-back/rollback in `readCollection`, `schemaVersion` asserted
  as a literal, import-boundary proof, deferred-work re-pointing, bundle baseline refresh. Status →
  review.
- 2026-09-25 — Code review (Fable 5.1): 11 patches applied in the review commit (the at-rest check
  now also guards `writeDataKey`/`replaceAll`, committed-keys-only rollback, stamp/collection/step
  output guards, test hardening), 3 items deferred, 3 owner decisions left open (newer-stamp
  recovery vs `clearAll`, FD2, strip-vs-strict). Status → in-progress pending those decisions.
- 2026-09-25 — Addressed code review findings - 3 items resolved (owner decisions): newer-version
  now surfaces as `NewerFormatVersionError` (a `CorruptDataError` subclass, reload-only hand-off to
  5.11); FD2 confirmed; strip kept and the deferred entry closed. Status → review.

---

This story was implemented with the 'Implement next story' skill with the following stats:

| Phase | Agent model | Agents | Active | Wall clock | Input | Output | Cache write | Cache read | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Step 0 — re-entry guard | — | 0 | 3m 59s | 3m 59s | 20 | 4,326 | 10,078 | 571,610 | 586,034 |
| Step 1 — create | opus-5-5 | 1 | 6m 19s | 6m 19s | 104 | 2,444 | 260,302 | 4,776,793 | 5,039,643 |
| Step 2 — implement | opus-5-5 | 1 | 10m 29s | 10m 29s | 152 | 2,145 | 247,139 | 7,826,564 | 8,076,000 |
| Step 3 — review + PR | fable-5-1 | 4 | 17m 25s | 17m 25s | 4,592 | 20,173 | 1,582,018 | 20,591,693 | 22,198,476 |
| _of which the orchestrator_ | opus-5-5 | — | — | — | 52 | 15,725 | 30,240 | 1,676,754 | 1,722,771 |
| **Total (create → PR ready)** | | 6 | **38m 12s** | 38m 12s | 4,868 | 29,088 | 2,099,537 | 33,766,660 | **35,900,153** |

Run started 2026-09-25 13:48 CEST; wall clock runs to the point the run stopped for the owner's review. No idle gaps were excluded; Active and Wall clock agree. (A gap counts as idle above 15 min.) Each phase row covers the phase agent, any agents it spawned, and the orchestrator's own turns in that window — the orchestrator row breaks its share out again, it is not additional. Cache reads dominate the token totals and are billed at a fraction of input rate, so read the Input and Output columns for effort and the total only as a ceiling. The orchestrator's final turn is still being written when these numbers are taken.
