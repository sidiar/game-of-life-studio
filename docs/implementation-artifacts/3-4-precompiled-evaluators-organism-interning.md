---
baseline_commit: e7651423abdcf931a2df698b66cdb8dbdcd6fbc7
---

# Story 3.4: Precompiled Evaluators & Organism Interning

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want per-organism rules compiled once per session,
so that the per-cell hot path compares numbers only.

## Acceptance Criteria

From `epics.md#Story 3.4: Precompiled Evaluators & Organism Interning`, decomposed into what a
reviewer can check independently. AC7–AC11 are repo-derived: four `deferred-work.md` entries and one
`architecture.md` Minor Resolution name **this story** as their owner, and a story that ships the
evaluator without them leaves them orphaned between 3.4 and 3.5.

1. **Given** a battle's roster and its organisms' `survivalRules`, **When** the session compiles,
   **Then** each organism gets **two phase-partitioned evaluators** — a **death evaluator** over its
   `die` rules and a **birth/survival evaluator** over its `born` + `survive` rules — and the
   `.filter` that partitions them runs **once at compile time, never per cell** (AR-18, RFC-004
   §2.3/§3.5, M10 H-5). Within each partition the persisted rule order is preserved verbatim as
   first-match priority (FR-2.6).
2. **And** compiled evaluators are **cached by `contentHash`** and the cache is **session-scoped,
   never global or module-level** (Decision E.4, AR-18). The compiled closures bake in this battle's
   id→ref map, so the same rules used in two battles must compile separately. Cache-key derivation
   is **FD3** — `contentHash` is an **opaque string**: never parsed, prefixed, hashed, or generated
   here (AR-21).
3. **And** organism ids are **interned to numeric `OrganismRef`s at the boundary**: the session
   builds the battle's `id → OrganismRef` map from the dense roster and rewrites every rule's
   `organismType` pattern (a persisted **library id string**) into that number **inside the compiled
   evaluator** — one lookup per rule per session, **never per cell** (AR-8, Decision E.3). The hot
   path compares numbers only.
   ⚠️ `ref = roster index + 1`, slot `0` reserved for empty (**M14**). `organisms[ref - 1]`, never
   `organisms[ref]`.
4. **And** a target id **absent from the battle** compiles to a **never-match sentinel** so
   "occupied by organism X" is simply `false` in a battle that does not include X (Decision E.3) —
   and the sentinel is a value that can never equal a real ref **or** the `null` an empty cell
   carries (see **Trap 3**: `pattern: null` affirmatively matches every empty cell).
5. **And** `MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)` is computed **once per battle at compile
   time** — the max over the `age` literals of **every** organism in the battle, not per organism —
   and age comparisons stay correct for saturated cells (AR-20, Decision B.5, RFC-004 §3.3).
   ⚠️ `+ 1`, not `maxAgeLiteral`; `max(7, …)`, not the bare max; and a `range` pattern contributes
   its **upper** bound. Literals on `neighborCount` / `occupantNeighborCount` contribute **nothing**.
6. **And** tests verify **cache hits on an unchanged `contentHash`** and **recompiles on change** —
   observably (an instrumented compile count or closure identity), not by assertion.
7. **And** the **eager compile-time diagnostic** M12 assigns to this story exists: the sweep that
   `conditionIsSatisfiedBy` currently pays for per cell happens **once per battle at compile time**
   — unknown `property` (not a `cellSelectors` key), unknown `operator` (outside the six), and a
   malformed `range` pattern are all detected before the first cycle (M12, `firstSatisfiedBy.ts:30`
   and `:49`, `operators.ts:45`).
8. **And** a **missing or malformed `payload` is an ERROR, not a skip** — `deferred-work.md`'s
   entry on this is marked **✅ Decided by Sidiar (2026-09-09): option (c), the eager diagnostic
   lands in Story 3.4**. Returning `null` for it would *formalize* the silent implicit-death
   collapse Trap 7 forbids, so it must fail loudly at compile time. The error's **shape** is
   **FD5**; whatever it is, it must name the organism id and the offending rule id.
9. **And** the per-cell guards in `packages/simulation/src/engine/firstSatisfiedBy.ts` are **left
   exactly as they are** (see **Trap 8**). M12 says they *become* redundant after this story and
   **"should be re-measured with Story 3.7's harness"** — 3.7 removes them under a measurement, 3.4
   does not remove them on an argument. `src/engine/` is untouched and `npm run boundary:check`
   still passes.
10. **And** the two `apps/web` comments that predict this story —
    `lib/canvas/refToFillGroup.ts:9` and `lib/canvas/battleThumbnail.ts:6`, both claiming the LUT
    they build "is exactly the one Story 3.4's interning step will produce" — are **resolved, not
    ignored**: they describe a *different* map (`ref → fill group`, palette-dependent, Story 3.9's)
    that merely shares this story's roster ordering. Correct the wording, or state why it stands.
    ❌ Do **not** move `buildRefToFillGroup` into `packages/simulation` — it imports the `apps/web`
    palette registry. A comment predicting work this story has finished is not an acceptable end
    state (the Story 3.3 AC9 precedent).
11. **And** `deferred-work.md` is updated with the outcome of every entry this story touches: the
    duplicate-`contentHash` collision hazard (line 26 — **FD3** decides whether it is closed or
    still open), the `contentHash` generator confirmation (lines 38/41 — this story **consumes**
    hashes and must confirm it neither generates nor parses them), the illegal property × operator
    combinations (line 451 — AC7's sweep may close them at compile time; say either way), and the
    two `resolveCellAction` shape-assumption entries (lines 453/457 — discharged by AC7/AC8).

## Tasks / Subtasks

- [x] **Task 1 — Settle the forced decisions before writing code** (AC: 1, 2, 3, 5, 8)
  - [x] Read **Dev Notes → Forced decisions (FD1–FD9)** end to end and record the option taken and
        *why* in the Dev Agent Record. **FD1, FD2 and FD5 are inherited by Stories 3.5, 3.6, 3.8 and
        4.15**; deciding any of them by accident is what the record exists to prevent.
  - [x] Read the three shipped engine files first — `src/gol/cellSubject.ts`,
        `src/gol/resolveCellAction.ts`, `src/engine/firstSatisfiedBy.ts`. Each carries a comment
        naming what **this** story owes it. They are the specification of your seam.
  - [x] ❌ Do not start by writing a hash function. This story **consumes** `contentHash`; it does
        not produce one (AR-21, `deferred-work.md:38`).

- [x] **Task 2 — Interning: the `id → OrganismRef` map** (AC: 3, 4)
  - [x] Build the map once from the battle's dense roster order: `ids[i] → i + 1` (**M14**). Slot 0
        is empty and belongs to no organism.
  - [x] Pick the never-match sentinel (**FD6**) and pin, in a test, that it matches neither any real
        ref nor a `null` `organismType` on an empty cell.
  - [x] `@gol/test-utils`'s `createMockOrganisms()` already ships the exact fixture: Chaotic
        Spreader's `CHAOTIC_BORN` rule targets `MOCK_ORGANISM_IDS.aggressiveColonizer` by library id
        (`mockWorkspace.ts:118`). Use it — do not hand-roll a targeting organism.

- [x] **Task 3 — Compile the two phase-partitioned evaluators** (AC: 1, 3)
  - [x] Partition each organism's rules **once** by `payload.action`: `die` → death evaluator;
        `born` + `survive` → birth/survival evaluator. Preserve persisted order inside each
        partition (FR-2.6).
  - [x] Rewrite `organismType` patterns to numeric refs while partitioning. **Return new rule
        objects and new arrays** — the input rules are shared, sometimes frozen, fixture data.
  - [x] Close over the partitioned, rewritten rules; the returned closure takes a `CellSubject` and
        nothing else (**FD2** fixes the exact signatures).

- [x] **Task 4 — The session cache** (AC: 2, 6)
  - [x] Derive the cache key per **FD3** and key a session-local structure. ❌ No module-level `Map`,
        no singleton, no `globalThis` — AR-16 forbids module-level mutable state and Decision E.4
        forbids cross-battle reuse for a correctness reason, not a tidiness one.
  - [x] Prove the hit and the miss **observably**: two organisms with byte-identical rules in one
        session share one compiled closure (identity, `toBe`); changing a `contentHash` recompiles.
  - [x] Prove the *session* scope: the same organism compiled into two different sessions with
        different rosters yields evaluators that resolve the same `organismType` rule to **different
        refs**. This is the whole reason E.4 exists and nothing in the repo asserts it yet.

- [x] **Task 5 — `MAX_RELEVANT_AGE`** (AC: 5)
  - [x] Scan **only** `age` conditions across **all** the battle's organisms. Scalar pattern → the
        value; `range` pattern → the **upper** element.
  - [x] `max(7, maxAgeLiteral + 1)`. Test the three cases that separate a right implementation from
        a plausible one: no age literal anywhere (Conway's Classic → **7**), a literal below the
        floor (`age gte 3` → **7**, not 4), and `createMockOrganisms()`'s Patient Defender
        (`age gte 8`, `mockWorkspace.ts:107` → **9**, not 8).
  - [x] Test that a saturated cell still satisfies `age > maxLiteral`. That is the *reason* for the
        `+ 1`, and it is the assertion that fails if someone "simplifies" it later.

- [x] **Task 6 — The eager diagnostic sweep** (AC: 7, 8)
  - [x] One pass per battle at compile time over every condition of every rule: property is a
        `cellSelectors` key; operator is one of the six; a `range` pattern is a `[lo, hi]` tuple with
        `lo <= hi`; `payload` exists and its `action` is one of the three.
  - [x] Malformed `payload` **throws** (or whatever **FD5** resolves to) — never a skip, never a
        `null`. Name the organism id and the rule id in the message: this fires once per battle, so
        a useful message costs nothing.
  - [x] Decide and record whether the sweep also rejects the 10 **illegal property × operator**
        pairings `@gol/domain`'s `ConditionSchema` rejects but the engine's flat `Condition` admits
        (`deferred-work.md:451`) — that entry explicitly points here as one possible owner.

- [x] **Task 7 — Barrel, boundary, and the comments this story owes** (AC: 9, 10, 11)
  - [x] Export the new surface from `packages/simulation/src/index.ts`; types with
        `export type { … }` (`isolatedModules`).
  - [x] Update the comments in `cellSubject.ts` (lines 33, 45), `resolveCellAction.ts` (line 6),
        `rule.ts` (line 66), `firstSatisfiedBy.ts` (lines 30, 49), `operators.ts` (line 45) and
        `cellSubject.test.ts` (lines 147–148) that promise this story's work — each should now name
        what shipped, not what is coming. ⚠️ The three files under `src/engine/` are **comment-only**
        edits; no code there changes (AC9).
  - [x] Correct the two `apps/web` LUT comments (AC10) and update `deferred-work.md` (AC11).

- [x] **Task 8 — Verify, and report what actually ran**
  - [x] `npx vitest run --coverage` in `packages/simulation` — the package sits at **100%** after
        3.3; note it in the record if it moves.
  - [x] `npx eslint packages/simulation`, `node scripts/check-engine-boundary.mjs`,
        `node scripts/check-spec-ids.mjs`, `npx prettier --check packages/simulation`.
  - [x] `npm run ci` — full local gate. ⚠️ **Never pipe it.** `npm run ci | tail` reports *tail's*
        exit code; redirect to a file and echo `$?`. Report the real result.

## Dev Notes

### Constraints the developer MUST follow

- **Scope: compilation and interning only.** Phases, Dominance, `Rng`, `SimulationDeps` and
  `step()` are **3.5/3.6**. Benchmarks, the coverage-gate flip and the M12 guard removal are
  **3.7**. The RAF loop is **3.8**. Rendering LUTs are **3.9**. ❌ Nothing here steps a grid.
- **No classes, no `this`, no module-level mutable state** (AR-16). The cache is a value the caller
  owns — the same shape Story 3.3 chose for `GridBuffers` (its FD3), and for the same reason.
- **No DOM types, no React in `packages/*`.** `tsconfig.base.json` is `lib: ["ES2022"]`. No
  `crypto`, no `node:` builtins, no `structuredClone` (it does not typecheck here — see
  `mockWorkspace.ts`'s note).
- **Nothing lands in, or is imported backwards from, `src/engine/`.** This story is GoL-aware by
  construction — it knows actions, organism ids and cell properties — so it belongs in the caller
  layer. `eslint.config.mjs` + `scripts/check-engine-boundary.mjs` enforce it; both must stay green
  and **must not be widened** to cover the new code (the boundary is one-directional; guarding the
  caller would invert it).
- **`src/gol/` does not import `@gol/domain`.** Story 3.2's FD1 made that edge **test-only**. If this
  story needs an organism-shaped input, it declares it locally — and then **M13's generalizable rule
  binds**: *any story that duplicates a type across the domain/engine seam must pin it
  **bidirectionally** at the level it duplicated.* Forward-only is covariant and blind to widening in
  the engine's copy. See **FD1**.
- **Strict TS, no escape hatches.** No `any`, no `@ts-ignore`, no non-null `!`.
- **camelCase file names, never dotted.**
- **Comments explain WHY**, cite the governing ID, and name the failure they prevent —
  `spec:check`-enforced.
- **Commit gate stands** — never stage or commit without Sidiar's explicit go-ahead, even on a green
  `npm run ci`. (A story subagent under `implement-next-story` may push to its own `story/*` branch;
  merging is always Sidiar's call.)

### What this layer is, in one paragraph

3.1 shipped a generic evaluation cascade. 3.2 fixed it to the Game of Life and gave it
`resolveCellAction`. 3.3 shipped the grid that produces `CellSubject`s. **Every one of those three
deferred something to this story, in a comment, in the file where the deferral bites.** This story is
where they all come due: the `organismType` pattern that is still a raw string and therefore matches
nothing (`cellSubject.test.ts:148` pins that as *today's* correct behaviour); the `.filter` that 3.2
refused to write per cell; the `MAX_RELEVANT_AGE` the grid refuses to clamp with; the eager
diagnostic M12 sent here so failing closed stops being silent. What you build is the **session
boundary** — the one place where persisted, string-keyed, workspace-shared organism data becomes
battle-relative numbers and closures, once, before the first cycle. Everything after 3.4 in Epic 3
runs *inside* the frame budget and can afford none of it.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — What does the compiler take as input?**
It needs, per organism: the **library id** (to intern) and its **`survivalRules`**. `SimulationDeps`
(RFC-004 §3.1) also names `dominance` and `agingEnabled`, but those are Phase 3's and 3.6's.
- **(a) Declare a minimal local input type** — e.g. `readonly { id: string; survivalRules:
  SurvivalRules }[]` — taking only what compilation reads. `@gol/domain`'s `Organism` assigns into it
  structurally with no mapping layer, and the assignability pin proves it.
- **(b) Declare RFC-004 §3.1's full `OrganismRuntime`** (id + dominance + agingEnabled + rules) now,
  so 3.5/3.6 inherit a name.
- **(c) Import `@gol/domain`'s `Organism`** into `src/gol/`.

*Recommendation: **(a)**.* (c) reverses Story 3.2's FD1 and drags `colorToken` / `schemaVersion`
into the engine. (b) is speculative — Story 3.1 declined to declare `RuleSetCollection` on exactly
this ground ("reserving a name for nothing is speculative code"), and 3.5 will know what it needs.
⚠️ Whichever you take, **M13 binds**: extend `src/domainRuleSetCompatibility.test.ts` with the
forward pin at the container level, **and a bidirectional pin at any level you duplicate**. That test
is the only place the `@gol/domain` edge is exercised, and it is what turns drift into a build
failure instead of a wrong answer.

**FD2 — The compiled evaluator's shape, and an RFC-004 tension you must decide in the open.**
RFC-004 **§3.1** declares one injected `resolveAction: (organism: OrganismRef, cell: CellSubject) =>
Action | null`. RFC-004 **§2.3/§3.5** and AR-18 require **two** phase-partitioned evaluators per
organism (`resolvesToDeath` → `boolean`; `resolveBirthSurvival` → `Action | null`). Both are in the
same RFC; they cannot both be the whole truth.
- **(a)** Compile returns a per-organism pair, indexed by ref in a table whose slot 0 is unused —
  the shape `buildRefToFillGroup` already uses for ref-keyed lookup (`size = roster length + 1`).
  3.5 consumes the pair directly; §3.1's single-function `SimulationDeps` is what gets amended.
- **(b)** Compile returns one `(ref, cell, phase) => …`, matching §3.1 and re-branching per cell.
- **(c)** Both — the pair, plus a §3.1-shaped adapter over it.

*Recommendation: **(a)**.* (b) puts a branch back in the loop that the partition exists to remove,
and M10's death-before-survival precedence is a **phase** property, not a parameter. This is
RFC-004 disagreeing with itself — the same species as **M11** and **M13** — so record it as a
resolution candidate rather than silently picking a side, and note that **§3.1's `SimulationDeps`
signature is the line that needs amending**, owned by Story 3.5. ⚠️ `scripts/check-spec-ids.mjs`
tokenises `M1`–`M14`; do **not** cite an `M15` that does not exist yet, and if one is minted the
checker must be widened **in two places** (its own comment says why).

**FD3 — The cache key, and the duplicate-`contentHash` hazard.**
§3.5 says "cached by the rules' `contentHash` **set**". `SurvivalRulesSchema` is a bare
`z.array(SurvivalRuleSchema)` with **no uniqueness refine**, so two distinct rules in one array may
legally carry the same hash (`deferred-work.md:26`, which names this story as its owner).
- **(a) Key the per-organism evaluator pair on the ordered join of its rules' `contentHash`es.**
  Order is priority (FR-2.6), so a join preserves what a set discards, and a duplicate hash inside
  one organism is harmless — the key still distinguishes the *lists*.
- **(b) Key per rule**, caching compiled predicates. This is where the duplicate collides and
  returns the wrong closure.

*Recommendation: **(a)**, and close `deferred-work.md:26` by explaining why the ordered-join key is
immune rather than by adding a schema refine (a schema change is Epic 4/5 territory).*
⚠️ Two organisms with identical rules **in the same session** may safely share one compiled pair —
they resolve against the same id→ref map. Across sessions they may not (Decision E.4). Prove both.

**FD4 — Compile eagerly for the whole roster, or lazily per organism on first use?**
- **(a) Eagerly, at session construction**, for every organism in the roster. Diagnostics (AC7/AC8)
  then fire *before* the first cycle, which is the entire point of moving them off the hot path.
- **(b) Lazily on first evaluation**, memoized. Cheaper for an organism that is in the roster but
  never evaluated — and it drags a compile, and possibly a throw, back inside the RAF loop.

*Recommendation: **(a)**.* A battle roster is ≤255 entries (Decision G.3) and compiles once per run;
laziness buys nothing measurable and costs the guarantee.

**FD5 — How does a malformed rule fail?**
Sidiar has already decided **that** it fails eagerly here (`deferred-work.md:457`, option (c)); the
**shape** is yours.
- **(a) Throw a named error** (e.g. `RuleCompilationError`) carrying organism id + rule id.
- **(b) Return a result object** — `{ evaluators, errors }` — and let the caller decide.

*Recommendation: **(a)**, with (b) noted as the migration path if Story 4.15 needs it.* This runs
once, outside the loop, at a boundary a caller can wrap. ⚠️ The reachable path is **in-memory**, not
persisted: Zod already closes the persisted one (`survivalRuleSchema.ts` requires `min(1)`
conditions and a full payload, and `localStorageOrganismRepository` `safeParse`s on every read). The
open cases are **Story 4.15's draft organism straight out of the editor**, plus import (5.8) and
migrations (5.7). Whatever you choose must not degrade into returning `null` — that is the silent
implicit-death collapse `resolveCellAction.ts`'s Trap-7 comment forbids.

**FD6 — The never-match sentinel.**
§3.5 and Decision E.3 both suggest `-1`. Real refs are `≥ 1`, and `cell.organismType` is `null` on an
empty cell, so `-1` fails `eq` against both — which is the required behaviour and is *not* true of
`null`, `undefined` or `0` (see **Trap 3**). Take `-1` unless you can state a better one; either way
pin it against a real ref **and** against an empty cell.

**FD7 — How deep does "compile" go?**
- **(a) Partition + rewrite + close over `firstSatisfiedBy`.** The closure is
  `(cell) => firstSatisfiedBy(partition, cell, cellSelectors)?.payload.action ?? null` with the
  partition and rewritten patterns fixed at compile time. This is exactly §2.3's two helpers minus
  the per-cell `.filter`.
- **(b) Compile to a specialized predicate chain** — resolve each condition to a concrete
  `(cell) => boolean` at compile time, eliminating the per-cell selector and operator lookups
  entirely (which is the "zero-per-cell key sweep" `firstSatisfiedBy.ts:30` describes).

*Recommendation: **(a)** now, with **(b) written down in a comment**, including what it would
remove.* This repo's standard is measured optimization: M12's guards were justified at
+0.019/+0.091 ms against a 16.7 ms budget, and Story 3.3's FD4 recorded its packed-integer
alternative in a doc comment for 3.7 rather than building it blind. **The first measurements of this
loop exist in Story 3.7.** Build the readable form; leave 3.7 the decoded option.

**FD8 — Where does the session live on disk?**
`src/session/` as a third sibling to `engine/` and `gol/`, or new files inside `src/gol/`. Either is
defensible; **`src/engine/` is not**. Record the choice and why. If you add a directory, say in the
Dev Agent Record what belongs there and what does not, the way `src/engine/README.md` does.

**FD9 — Does the sweep close `deferred-work.md:451`'s illegal property × operator pairings?**
The engine's flat `Condition<CellProperty>` admits 30 combinations; `ConditionSchema` admits 20. The
10 illegal ones compile, then fail closed at runtime with no diagnostic — and the entry names
"Story 3.4's compile-time sweep **if that lands an eager validity check first**" as one of two
possible owners (the other is Epic 4's rule-authoring UI). You are now landing that check. Decide
whether the pairing table belongs here — GoL knowledge about which property takes which operator is
`src/gol/` knowledge, not `src/engine/`'s — or stays Epic 4's, and update the entry either way.

### Traps

1. ⚠️ **`ref = roster index + 1` (M14).** `ids[i] → i + 1` when building the map; `organisms[ref - 1]`
   when reading back. Under the bare-index reading `organisms[0]` is a real organism and collides
   with occupant `0` = empty. This is the exact spot the off-by-one is invisible: an interning map
   built one slot low produces a **plausible** battle in which every rule targets its neighbour in
   the roster, with no failing test.
2. ⚠️ **`contentHash` is opaque (AR-21).** Never parse it, never prefix-match it, never compute one.
   The real generator does not exist yet (`deferred-work.md:38`) and Conway's Classic's literals are
   a **cross-install identity baseline** — computing a hash here would fork rule identity across
   every already-installed workspace.
3. ⚠️ **`pattern: null` affirmatively matches every empty cell.** `organismType` is the only nullable
   subject field and `eq` is unguarded by design, so a rewritten pattern of `null`/`undefined` turns
   a "born" rule into one that populates the entire grid (`deferred-work.md:451`). The sentinel must
   be a number that is not a ref. This is the single most damaging way to get FD6 wrong.
4. ⚠️ **`MAX_RELEVANT_AGE` is `max(7, maxAgeLiteral + 1)`, per **battle**, not per organism.**
   Three independent ways to get it wrong, all of which look right: dropping the `+ 1` (makes an
   `age > maxLiteral` rule permanently unsatisfiable for saturated cells), dropping the `max(7, …)`
   floor (breaks the eight age-shades), and computing it per organism (an organism with no age rule
   would then saturate below another's literal in the same battle).
5. ⚠️ **A `range` pattern is a `[lo, hi]` tuple, not a scalar.** For AC5 take `hi`. For AC7's sweep,
   `(operator === 'range') === Array.isArray(pattern)` is the invariant `survivalRuleSchema.ts`
   states — a non-iterable pattern under `range` **throws** in the operator (M12 records that the
   original destructured it unchecked), and a 1-element array silently never matches.
6. ⚠️ **Do not mutate the input rules.** `createMockOrganisms()` hands out deep clones *because* a
   previous story shared them and one test's write changed the next call's data. `CONWAYS_CLASSIC` is
   `deepFreeze`d — an in-place pattern rewrite on it throws in strict mode, or worse, silently
   no-ops. Rewriting means **new condition objects, new rule objects, new arrays**.
7. ⚠️ **Partitioning is `payload.action`-based and lives OUTSIDE `src/engine/`.** `rule.ts:62` states
   it explicitly: the engine never inspects `payload`, "not to sort, not to filter, not to
   *optimize*". Reaching into `src/engine/` to add a partition helper ends the reusability AR-16
   exists for, and the lint rule will stop you — but only for imports, not for a new file placed
   there by hand.
8. ⚠️ **Do NOT delete `firstSatisfiedBy`'s `Object.hasOwn` and operator guards.** They *become*
   redundant once the sweep lands — M12 says so — and M12 says the removal is **re-measured with
   Story 3.7's harness**. Removing them here on the argument alone trades a measured 0.5% for an
   unmeasured crash surface, and `src/engine/` is the one directory this story does not change.
9. ⚠️ **`null` from an evaluator means "no rule matched", never "die".** Implicit death resolves at
   **cycle end** (M10) so a non-surviving cell still counts as a Phase-2 neighbour — that is what
   preserves Conway's simultaneous-generation semantics. Collapsing `null` into `'die'` anywhere in
   the compiled closure looks equivalent and breaks Conway's Classic, which has no Die rule at all.
10. ⚠️ **The cache must not be a module-level `Map`.** It looks like the obvious memoization and it
    is a correctness bug: the closures bake in a battle-specific id→ref map, so a cross-battle hit
    returns an evaluator whose `organismType` refs point at the *other* battle's roster (Decision
    E.4). AR-16 independently forbids module-level mutable state.
11. ⚠️ **`neighborCount` is SAME-organism; `occupantNeighborCount` is OTHER-organism.** Not relevant
    to compilation itself — flagged because AC5's literal scan must **exclude** both, and because a
    fixture that confuses them still passes single-organism tests (Conway's Classic makes the two
    readings coincide).
12. ⚠️ **`cellState` vs `state`.** The persisted property **name** is `cellState`; the `CellSubject`
    **field** is `state`. The asymmetry is deliberate (`cellSubject.ts`, Trap 3 there). A sweep that
    validates property names against the subject's *field* names rejects every valid saved rule.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **🔴 NEW — RFC-004 §3.1's single `resolveAction` vs §2.3/§3.5's two phase-partitioned evaluators.**
  See **FD2**. Not a doc-vs-doc conflict: it is RFC-004 disagreeing with itself, the same species as
  M11 and M13. Decide it in the open, record the reasoning, and name §3.1's `SimulationDeps`
  signature as the line that needs amending (owner: Story 3.5). ❌ Do not mint an `M15` unilaterally
  — Story 3.3's FD5 set the precedent that declaring a Minor Resolution is an authority-doc act, and
  M14 was minted only on Sidiar's explicit authorization.
- **🟡 `deferred-work.md:26` — duplicate `contentHash` within one `survivalRules` array is schema-legal
  and the E.4 cache is keyed on `contentHash`.** Known, explicitly assigned here. **FD3**.
- **🟡 `deferred-work.md:451` — the engine's flat `Condition` admits 10 pairings the schema rejects.**
  Known, and this story is one of the two named owners. **FD9**.
- **🟢 `project-context.md`'s authority-order line still reads "M1–M13"** while `architecture.md`
  carries **M14** and `check-spec-ids.mjs` accepts it. Not new (Story 3.3's Trap 13 flagged the same
  line at M10), harmless here, and noted only so M14 is not read as non-authoritative.
- **🟢 `architecture.md`'s Repository Structure table still places the rules engine in
  `packages/domain`.** Not new — surfaced at Story 1.3, resolved in `packages/simulation` at 3.1.
  Noted so it is not re-litigated.

### What NOT to build (scope boundaries)

- ❌ **A `contentHash` generator / hasher.** Epic 4 authors it (`deferred-work.md:38/41`). This story
  only confirms it consumes hashes opaquely.
- ❌ **Phases, `SimulationDeps`, `threePhaseStep`, Dominance, `resolveConflict`, the seeded `Rng`** —
  Stories 3.5/3.6. ❌ Nothing here steps a grid or reads `dominance`.
- ❌ **Aging, age increment, or age saturation.** This story **computes** `MAX_RELEVANT_AGE`;
  Story 3.6's cycle-end step **applies** it.
- ❌ **Benchmarks, the perf harness, the ≥90% coverage-gate flip, and the M12 guard removal** —
  Story 3.7. Do not touch `packages/simulation/vitest.config.ts`.
- ❌ **Any change to `src/engine/` beyond comments** (AC9). ❌ Do not widen the boundary lint or
  `check-engine-boundary.mjs`.
- ❌ **Moving `buildRefToFillGroup` or `battleThumbnail`'s LUT into `packages/simulation`** (AC10) —
  they depend on the `apps/web` palette registry, and colour batching is Story 3.9's.
- ❌ **Anything in `apps/web` beyond the two comment corrections.** No React, no hook, no UI.
- ❌ **A schema `refine` for duplicate `contentHash`** — a `@gol/domain` schema change is not this
  story's to make; explain the cache-key immunity instead (**FD3**).

### Testing standards summary

- **Location:** co-located `*.test.ts` beside the source, node environment. Every existing
  `packages/*` test follows this.
- **`@gol/test-utils` is the fixture source, and it already contains everything this story needs.**
  `createMockOrganisms()` (AR-45) covers all five properties, all six operators including `range`,
  an aging organism, distinct dominance values, ≥1 explicit `die` rule — **and** the one
  `organismType` rule in the repo that targets another organism by library id. `CONWAYS_CLASSIC` is
  the no-age-literal / no-die-rule control. ❌ Do not hand-roll organisms a fixture already provides.
- **The interning tests that must not be skipped**, because nothing in the repo asserts them yet:
  (1) a targeting rule fires against the target's ref and not against any other organism;
  (2) `cellSubject.test.ts:148`'s "a raw library-id string never matches" case now has its
  counterpart — after compilation it **does** match, and that test's comment should be updated to
  point at the new one rather than at a future story;
  (3) a target id absent from the roster never matches, on an occupied cell **and** on an empty one;
  (4) the same organism compiled into two different rosters resolves to two different refs (E.4).
- **Cache hits are proved observably, not asserted** (AC6) — closure identity or an instrumented
  compile counter, the way Story 3.1 proved short-circuiting with a counting selector and 3.2 proved
  the payload is untouched with a `toBe` reference check.
- **`fast-check` is installed** (root devDeps, v4, hoisted). AR-41 assigns no property test to this
  story, so add one only where examples genuinely cannot pin the invariant — the natural candidate is
  *"compilation never mutates its input"* over generated rule sets (Trap 6), which is exactly the
  shape 3.5's phase-purity properties will extend.
- **Determinism:** nothing here is random. ❌ Do not import the seeded RNG — it is Phase 3's (3.6).
- **No coverage-padding tests.** `packages/simulation` sits at **100%** after 3.3; write for
  correctness and let the number follow. The ≥90% gate flips in 3.7; padding is rejected in review
  regardless.
- **Never pixel/snapshot-test anything.** Not applicable here, and stated so it stays that way.

## Project Structure Notes

Indicative; the split is the developer's call, constrained by "nothing lands in `src/engine/`",
camelCase-never-dotted, and FD8's outcome.

```
packages/simulation/src/
  engine/                          ⛔ CODE UNCHANGED (AC9) — comment-only edits at
                                      firstSatisfiedBy.ts:30/:49, operators.ts:45, rule.ts:66
  gol/
    cellSubject.ts                    MODIFIED — comments at :33 and :45 now name what shipped
    cellSubject.test.ts               MODIFIED — the :147-148 "Story 3.4 interns it" case
    resolveCellAction.ts              MODIFIED — FD2's comment at :6; the function itself may stand
                                      unchanged as §2.3's whole-list primitive for a future strategy
    survivalRules.ts               ⛔ unchanged
  session/                         ← NEW (FD8), or folded into gol/
    internOrganisms.ts                the id -> OrganismRef map + never-match sentinel (FD6)
    compileEvaluators.ts              partition, rewrite, close (FD7); the session cache (FD3/FD4)
    maxRelevantAge.ts                 the per-battle age-literal scan (AC5)
    validateRules.ts                  the eager diagnostic sweep + error type (FD5, AC7/AC8)
    <name>.test.ts                    fixtures from @gol/test-utils
  domainRuleSetCompatibility.test.ts  MODIFIED (FD1, M13) — pins for any newly duplicated type
  index.ts                         barrel — `export type { … }` for types (isolatedModules)

apps/web/lib/canvas/refToFillGroup.ts     MODIFIED (AC10) — the :9 claim about this story
apps/web/lib/canvas/battleThumbnail.ts    MODIFIED (AC10) — the :6 claim about this story

docs/implementation-artifacts/deferred-work.md   MODIFIED (AC11) — lines 26, 38/41, 451, 453, 457
```

Not touched: `eslint.config.mjs`, `scripts/check-engine-boundary.mjs`, `scripts/check-spec-ids.mjs`
(unless an authorized new `M` id demands it), `packages/simulation/vitest.config.ts`,
`packages/simulation/tsconfig.json`, `packages/persistence/**`, `packages/domain/**`, and every
`.tsx` in `apps/web`.

## References

- [Source: docs/planning-artifacts/epics.md#Story 3.4: Precompiled Evaluators & Organism Interning]
  — the story statement and the five AC bullets decomposed above
- [Source: docs/planning-artifacts/epics.md#Requirements Inventory] — AR-8 (ids at rest, refs
  interned at simulation start, never-match sentinel), AR-18 (precompiled per-organism evaluators,
  `contentHash`-cached, session-scoped, phase-partitioned), AR-20 (relative cell state;
  `MAX_RELEVANT_AGE` computed per battle at compile time), AR-21 (opaque `id` + deterministic
  `contentHash`), AR-16 (three-layer functional design, no classes), AR-45 (the dev fixture
  workspace this story tests against)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.5 Precompiled
  evaluators (memoization, keyed by contentHash)] — the compile contract, interning at compile time,
  the session-scoped cache, the two phase-partitioned closures, "the `.filter` runs once at compile
  time, not per cell"
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.3 Action resolution —
  the abstraction layer on top of the engine] — `resolvesToDeath` / `resolveBirthSurvival`, and the
  note that the partitioning is the strategy's choice, not the engine's law
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.1 Evaluation strategy —
  pluggable, but hardcoded for the MVP] — `SimulationDeps.resolveAction`'s single-function signature;
  **the half of FD2's tension that needs amending**
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.1 The Cell subject
  (CellSubject) and its selectors] — `OrganismRef` = roster index + 1 (M14), the five properties,
  relative cell state
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#3.3 Engine-owned concerns
  (all pure)] — `MAX_RELEVANT_AGE`, and why the `+ 1` is load-bearing
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.4 Persistence: JSON
  structure (= the generic structure), schemas, and rule identity] — `contentHash` as content
  address and cache key; the `organismType` pattern is a library id; age literals bounded ≤ 65534
- [Source: docs/planning-artifacts/architecture.md#Decision E — Stable organism ids at rest; numeric
  refs are runtime-only] — E.3 (interning at the boundary, never-match sentinel), E.4 (the cache is
  session-scoped, and why)
- [Source: docs/planning-artifacts/architecture.md#Minor Spec Resolutions] — **M10** (death precedes
  survival; implicit death at cycle end), **M11** (`Props` mandatory on `Selectors`; §1.5 retired),
  **M12** (fail closed per cell, **eager diagnostics belong at evaluator-compile time — this
  story**, and the guards are re-measured in 3.7), **M13** (duplicate a type across the domain/engine
  seam → pin it **bidirectionally**), **M14** (`OrganismRef` = roster index + 1)
- [Source: docs/planning-artifacts/architecture.md#Decision B] — B.5, `MAX_RELEVANT_AGE = max(7,
  maxAgeLiteral + 1)`, the `Uint16Array` age buffer, extinction-only auto-stop
- [Source: docs/project-context.md#Critical Don't-Miss Rules] — never persist a numeric
  `OrganismRef`; the evaluator cache is session-scoped; `MAX_RELEVANT_AGE`'s `+ 1`; no classes and
  no module-level mutable state in the engine; Zod parses at boundaries, never per cell
- [Source: docs/implementation-artifacts/3-1-generic-rules-engine.md#Dev Agent Record] — FD1–FD6
  (the `Payload`/`Props` split, `pattern: unknown`, the typed selector seam, the `src/engine/`
  boundary + its README, the retired placeholders), and M12's origin
- [Source: docs/implementation-artifacts/3-2-gol-rules-layer.md#Dev Agent Record] — FD1 (payload
  types declared in `src/gol/`, the `@gol/domain` edge is **test-only**), **FD2 (the two
  phase-scoped helpers were deliberately deferred to this story)**, FD4 (the three-file split)
- [Source: docs/implementation-artifacts/3-3-typed-array-grid-neighborhood.md#Dev Agent Record] —
  FD3 (the double-buffer seam as a caller-owned value, the model for this story's cache), FD4 (write
  the unmeasured optimization down, don't build it), **FD5 (`OrganismRef` = index + 1, now M14)**,
  FD6 (`resizeGrid` carries `age`)
- [Source: docs/implementation-artifacts/deferred-work.md] — lines **26** (duplicate `contentHash`),
  **38/41** (the hash generator is Epic 4's), **451** (10 illegal property × operator pairings),
  **453** and **457** (`resolveCellAction`'s unguarded shapes; **Sidiar decided the eager diagnostic
  lands here**)
- [Source: packages/simulation/src/gol/cellSubject.ts] — the `OrganismRef` encoding comment, the
  "Story 3.4 interns it" deferral at :33, the "`MAX_RELEVANT_AGE` is Story 3.4's" note at :45
- [Source: packages/simulation/src/engine/firstSatisfiedBy.ts] — the M12 guards, their measured cost,
  and the ":30 zero-per-cell key sweep is Story 3.4's" note
- [Source: packages/test-utils/src/mockWorkspace.ts] — `CHAOTIC_BORN`'s `organismType` rule
  (the interning fixture), `PATIENT_DIE`'s `age gte 8` (the `MAX_RELEVANT_AGE` fixture), and the
  frozen `contentHash` literals
- [Source: packages/domain/src/survivalRuleSchema.ts] — what the persisted path already guarantees
  (and therefore what the sweep is really protecting: the in-memory path)

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Opus 5) — the `Dev Model: opus` justification at the foot of this file.

### Forced Decisions

**FD1 — compiler input: (a), a minimal local `CompilableOrganism`.**
`{ readonly id: string; readonly survivalRules: SurvivalRules }` in
`src/session/compileEvaluators.ts`. (c) would reverse Story 3.2's FD1 (the `@gol/domain` edge is
test-only) and drag `colorToken` / `schemaVersion` into the engine; (b)'s full `OrganismRuntime`
reserves names for `dominance` and `agingEnabled` that are Phase 3's and 3.6's, which Story 3.1
already declined to do on the same ground.
**M13 handled, and the analysis matters:** what is newly duplicated across the seam is a
*record*, not a union. Widening a record — the drift M13 exists to catch — is caught by the
FORWARD pin alone, because adding a required field makes `@gol/domain`'s `Organism` stop
satisfying `CompilableOrganism` and the pin stops compiling. **Verified by mutation:** adding
`readonly weight: number` failed `tsc` at `domainRuleSetCompatibility.test.ts:172`. That is
exactly unlike the payload level, where widening a string UNION is covariant and invisible
forward — which is why *that* level needs both directions and this one does not. The reverse
container assignment is structurally excluded for the reason the file's header already gives
(readonly array + flat `Condition` vs mutable array + discriminated union), and `SurvivalRules`
is reused rather than duplicated again, so no new type crosses the seam unpinned. A reverse pin
at the one level it *can* hold (`id`) is included.

**FD2 — evaluator shape: (a), the per-organism pair in a ref-indexed table, slot 0 unused.**
`OrganismEvaluators { resolvesToDeath, resolveBirthSurvival }`, table sized `roster + 1` with slot
0 an explicit `null`. **🔴 This resolves an RFC-004 self-conflict and is recorded as
decision-needed, not as a settled record.** §3.1 declares one injected
`resolveAction: (organism, cell) => Action | null`; §2.3/§3.5 and AR-18 require two
phase-partitioned evaluators. Both are in the same RFC and cannot both be the whole truth — the
same species as M11 and M13.
*Reasoning taken:* **M10's death-before-survival precedence is a cross-cutting Architecture
Decision, and the authority order makes a cross-cutting Decision outrank an RFC line.** It is
also a *phase* property, not a parameter: option (b) puts a per-cell branch back into the loop
that the compile-time partition exists to remove. **§3.1's `SimulationDeps.resolveAction`
signature is the line that needs amending, and Story 3.5 owns it.**
❌ **No `M15` minted and `architecture.md`'s decision list is untouched** — declaring a Minor
Resolution is an authority-doc act (Story 3.3's FD5 precedent; M14 was minted only on Sidiar's
explicit authorization). **This is a decision needed from Sidiar**, surfaced here rather than
taken in the canonical record. `scripts/check-spec-ids.mjs` still tokenises `M1`–`M14` and was
not widened.

**FD3 — cache key: (a), the ordered join of the rule list's `contentHash`es.**
`JSON.stringify(rules.map(r => r.contentHash))`, not `join('|')`: a plain join is **not
injective** over arbitrary opaque strings (`['a|b']` and `['a','b']` collide), which would
reintroduce a hash collision *in the cache key itself*; `contentHash` is opaque (AR-21) so no
separator can be ruled out, and JSON's escaping needs no assumption about the hash's alphabet.
Order is priority (FR-2.6), so the ordered join is also strictly more correct than §3.5's "hash
**set**" wording. `deferred-work.md`'s duplicate-`contentHash` entry (line 26) is **closed by
this design, not by a schema refine** — a duplicate hash *within* one organism is harmless
because the key distinguishes the *lists*. ⚠️ Recorded in the code: the key does assume
`contentHash` is a faithful content address, so a hand-written fixture reusing one hash literal
across different rules gets one organism's evaluators for both (this bit during development and
is now a comment).

**FD4 — (a), eager over the whole roster at session construction.** Diagnostics fire before the
first cycle, which is the entire point of moving them off the hot path; a roster is ≤255
(Decision G.3) and compiles once per run.

**FD5 — (a), a named error, as an interface + factory rather than a class.**
`RuleCompilationError` carries `organismId` + `ruleId` and names both in the message;
`isRuleCompilationError` is the guard. **Deliberate divergence from `packages/persistence`'s
`CorruptDataError`,** which *is* a real subclass: that package is not the engine, and AR-16 bans
classes and `this` in `packages/simulation`. `Object.assign` over a real `Error` keeps
`instanceof Error`, the stack and catchability. Fail-fast, not `{ evaluators, errors }`; the
result shape is recorded as the migration path if Story 4.15 needs every bad rule at once.

**FD6 — `-1`.** Pinned against a real ref *and* against the `null` an empty cell carries, through
the real `operators.eq` and the real `cellSelectors`, plus a compile test using a **lone**
`organismType` condition — the mock fixture's `CHAOTIC_BORN` also carries `cellState eq occupied`,
which *masks* a bad sentinel (a `null`-sentinel mutation failed only 1 test before that case was
added, and 2 after).

**FD7 — (a) built, (b) written down.** Partition + intern + close over `firstSatisfiedBy`. The
specialized-predicate-chain option, and what it would remove, is a comment in
`compileEvaluators.ts` pointing at Story 3.7, where the first measurements of this loop exist
(the Story 3.3 FD4 precedent).

**FD8 — a new `src/session/` directory**, a third sibling to `engine/` and `gol/`.
*What belongs there:* anything computed **once per battle run** and consumed per cell — the
id→ref map, the compiled evaluators and their cache, `MAX_RELEVANT_AGE`, the eager sweep.
*What does not:* anything the RAF loop calls per cycle (Stories 3.5/3.6/3.8), anything
domain-blind (that is `engine/`'s), and anything that would make `engine/` GoL-aware. It is a
CALLER of `engine/` and a sibling of `gol/`, never a member of either. Folding this into `gol/`
was the alternative; a separate directory keeps "runs once" and "runs per cell" visibly apart,
which is the distinction the whole story is about. The statement lives in `internOrganisms.ts`'s
header (the `src/engine/README.md` model, without adding a README).

**FD9 — yes: the property × operator legality table lands here.**
`LEGAL_OPERATORS` in `validateRules.ts` rejects all 10 illegal pairings at compile time (pinned by
a test that counts exactly 10 rejections and exactly 20 acceptances). The knowledge is GoL
knowledge and belongs in the caller layer; `src/engine/`'s flat `Condition<CellProperty>` still
admits all 30 by design (M11) and is unchanged. The sharper `organismType eq null` shape is closed
harder — an `organismType` pattern must be a **non-empty string**. **Still open and still Epic 4's:**
the *type-level* half — an illegal pairing written against `@gol/simulation`'s exported types
type-checks and only fails when a session compiles it. `deferred-work.md:451` says both halves.

### Debug Log References

Load-bearing invariants were verified by **mutation**, not just by assertion:

| Mutation | Result |
|---|---|
| `ref = index` (drop M14's `+ 1`) | 5 tests fail |
| drop the `+ 1` in `MAX_RELEVANT_AGE` | 5 tests fail |
| drop the `max(7, …)` floor | 5 tests fail |
| `NO_MATCH_REF = null` (Trap 3) | 2 tests fail |
| `range` scan takes the LOWER bound | 1 test fails |
| move the cache to module level (Trap 10) | 4 tests fail |
| key the cache on a sorted, de-duplicated hash **set** | 3 tests fail |
| skip the partition (every rule in both lists) | 2 tests fail |
| add a required field to `CompilableOrganism` | `tsc` fails at the M13 pin |

### Completion Notes List

- **AC1** — two phase-partitioned evaluators per organism, partitioned once at compile time in
  `compileOrganism`'s single loop; persisted order preserved within each partition (pinned by
  reversing the input and watching the winner flip).
- **AC2** — cached by `contentHash` (FD3), cache is a **local of `compileSession`** so
  cross-session reuse is structurally impossible rather than merely discouraged — the same
  caller-owned-value shape as Story 3.3's `GridBuffers`.
- **AC3/AC4** — interning at the boundary; `ref = index + 1`; absent target → `NO_MATCH_REF`.
- **AC5** — `max(7, maxAgeLiteral + 1)` over **every** organism, `range` contributing its upper
  bound, neighbour-count literals excluded.
- **AC6** — cache hit and miss proved **observably** by closure identity (`toBe` / `not.toBe`),
  no instrumentation surface added.
- **AC7/AC8** — the eager sweep; a malformed `payload` **throws**, honouring Sidiar's 2026-09-09
  decision. `payload.summary` is deliberately not validated (nothing in the engine reads it).
- **AC9** — `src/engine/` is **comment-only**; verified by filtering the diff to non-comment
  lines (empty). `npm run boundary:check` green, neither the lint block nor the script widened.
- **AC10** — both `apps/web` LUT comments corrected: they describe `ref → fill group`
  (palette-dependent, Story 3.9's), which merely *shares this story's roster ordering*. Nothing
  moved into `packages/simulation`.
- **AC11** — `deferred-work.md` updated for lines 26 (closed by FD3), 38/41 (confirmed: this
  story **consumes** hashes and neither generates nor parses them), 451 (partly closed — runtime
  half here, type-level half stays Epic 4's), 453 and 457 (discharged).
- **Verification, actually run** (not piped — redirected, `$?` echoed):
  `npm run ci` → **exit 0**. typecheck ✓, lint ✓, format:check ✓, spec:check ✓ (195 ids resolve),
  boundary:check ✓ (7 escapes rejected, 2 imports accepted), coverage ✓, build ✓, bundle ✓
  (`/` 10.1 KB headroom, `/battle` 4.7 KB, `/battle/new` 4.8 KB), e2e ✓ 344 passed.
  `packages/simulation` **212 tests, 100% statements / branches / functions / lines** — the
  package held its post-3.3 100%.
- **fast-check** used once, where examples cannot pin the invariant: *compilation never mutates
  its input* over generated rule sets (Trap 6), plus a deep-frozen `CONWAYS_CLASSIC` case.

### File List

**New**
- `packages/simulation/src/session/internOrganisms.ts`
- `packages/simulation/src/session/internOrganisms.test.ts`
- `packages/simulation/src/session/validateRules.ts`
- `packages/simulation/src/session/validateRules.test.ts`
- `packages/simulation/src/session/maxRelevantAge.ts`
- `packages/simulation/src/session/maxRelevantAge.test.ts`
- `packages/simulation/src/session/compileEvaluators.ts`
- `packages/simulation/src/session/compileEvaluators.test.ts`

**Modified**
- `packages/simulation/src/index.ts` (barrel — the session surface)
- `packages/simulation/src/domainRuleSetCompatibility.test.ts` (FD1 / M13 pin)
- `packages/simulation/src/gol/cellSubject.ts` (comments at the `OrganismRef` and `age` notes)
- `packages/simulation/src/gol/cellSubject.test.ts` (the "Story 3.4 interns it" case)
- `packages/simulation/src/gol/resolveCellAction.ts` (FD2 comment)
- `packages/simulation/src/engine/rule.ts` — **comment only**
- `packages/simulation/src/engine/firstSatisfiedBy.ts` — **comment only**
- `packages/simulation/src/engine/operators.ts` — **comment only**
- `apps/web/lib/canvas/refToFillGroup.ts` (AC10 — comment only)
- `apps/web/lib/canvas/battleThumbnail.ts` (AC10 — comment only)
- `docs/implementation-artifacts/deferred-work.md` (AC11)
- `docs/implementation-artifacts/sprint-status.yaml`
- `docs/implementation-artifacts/3-4-precompiled-evaluators-organism-interning.md`

### Change Log

- 2026-09-09 — Story 3.4 implemented: the session boundary (`src/session/`) — id→`OrganismRef`
  interning with a `-1` never-match sentinel, two phase-partitioned compiled evaluators per
  organism in a ref-indexed table, a session-scoped `contentHash`-keyed cache, per-battle
  `MAX_RELEVANT_AGE`, and the eager compile-time diagnostic sweep that fails loudly on a malformed
  rule or payload. `src/engine/` unchanged except comments. `deferred-work.md` outcomes written
  back. Status → review.

### Decisions Needed From Sidiar

1. **RFC-004 §3.1 vs §2.3/§3.5 (FD2).** Implemented as the phase-partitioned pair on M10's
   authority. The canonical record has **not** been touched: no `M15`, no edit to
   `architecture.md`'s decision list. If this should become a Minor Resolution, minting it is
   yours — and `scripts/check-spec-ids.mjs` must then be widened from `M14` in **both** places its
   own comment names. Either way, **§3.1's `SimulationDeps.resolveAction` signature needs
   amending** (owner: Story 3.5).

Dev Model: opus   # architecture-shaping: this story fixes the compiled-evaluator API that 3.5/3.6/3.8/4.15 all consume, resolves RFC-004 §3.1-vs-§3.5 in the open, sets the engine's fail-loud-at-compile-time posture (M12/deferred-work:457), and re-crosses the domain/engine seam under M13's bidirectional-pin rule — it establishes patterns rather than following one.
