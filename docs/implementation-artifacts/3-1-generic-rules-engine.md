---
baseline_commit: 465fe8d60bca03445868644cad0f429153f7fe7d
---

# Story 3.1: Generic Rules Engine

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a domain-agnostic rules engine core,
so that GoL semantics sit on a proven, reusable evaluation layer.

## Acceptance Criteria

From `epics.md#Story 3.1: Generic Rules Engine`, decomposed into the six things a reviewer can
check independently.

1. **Given** `packages/simulation`, **When** the core is implemented, **Then** it exposes generic
   `Condition`, `Rule<Payload>` and `RuleSet<Payload>` types plus a `Selectors<S>` seam, all
   parametric over an arbitrary subject `S` — no type, field, or identifier in the layer names a
   cell, an organism, a grid, an age or an action (AR-16).
2. **And** operators are a **pure-predicate dictionary keyed by operator id** covering exactly the
   six MVP operators — `eq`, `gt`, `lt`, `gte`, `lte`, `range` — with `range` inclusive at both
   bounds. Adding a seventh must be one additive entry, not an edit to the evaluator (AR-16).
3. **And** evaluation is the three-level cascade: a condition passes when its operator predicate
   holds for `selector(subject)` vs. `pattern`; a rule passes when **all** its conditions pass
   (AND, short-circuiting); `firstSatisfiedBy` returns the **first** rule in `RuleSet` order whose
   conditions all pass, and `null` when none does — order is priority (FR-2.6). It returns the
   winning **`Rule`**, never a domain action.
4. **And** the layer is pure functional and provably domain-blind: no `class`, no `this`, no
   module-level mutable state, no DOM type, and **zero imports from `@gol/domain`** or any other
   GoL source — enforced mechanically (see Task 5), not asserted in prose.
5. **And** `Rule` carries an opaque `id: string` and a deterministic `contentHash: string` whose
   shape is **structurally identical** to Story 1.3's `SurvivalRule`: a
   `SurvivalRules` value must be assignable to `RuleSet<SurvivalPayload>` with **no mapping layer**
   (AR-21, RFC-004 §2.4). This story declares the fields; it generates neither value.
6. **And** its tests prove the engine with a **non-Game-of-Life subject** whose test file imports
   nothing from `@gol/domain` — covering all six operators (including `range` boundaries), the
   AND/short-circuit semantics, first-match-wins ordering, and the empty/no-match `null` path
   (AR-40, RFC-008 Decision 4).

## Tasks / Subtasks

- [x] **Task 1 — Settle the six forced decisions before writing code** (AC: 1, 4, 5)
  - [x] Read **Dev Notes → Forced decisions** end to end and record the option taken and why in the
        Dev Agent Record. Each one is inherited by Stories 3.2/3.4/3.5/3.6 — deciding by accident
        here is what the record exists to prevent.
  - [x] ❌ Do not start with the RFC snippet pasted verbatim. RFC-004 §1.1/§1.4 has an internal
        ambiguity (FD1) that has to be resolved first or it propagates into every consumer.

- [x] **Task 2 — Data model: `Condition`, `Rule<Payload>`, `RuleSet<Payload>`** (AC: 1, 5)
  - [x] `Operator` union: `'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'range'`. RFC-004 §1.1 splits it as
        `NumericOperator | EqualityOperator` where `EqualityOperator = 'eq'` — a union whose second
        arm is already inside the first, so it collapses to the same six. Keep the split only if
        it reads as documentation; it changes no type.
  - [x] `Condition` — `{ property, operator, pattern }`, all `readonly`. Property typing per **FD1**;
        `pattern` per **FD2**.
  - [x] `Rule<Payload>` — `{ id: string; contentHash: string; conditions: readonly Condition[];
        payload: Payload }`, all `readonly`. **The engine never inspects `payload`** — that is the
        single thing that keeps the layer reusable; returning an action instead would weld it to GoL.
  - [x] `RuleSet<Payload> = readonly Rule<Payload>[]`. Ordered; order is priority.
  - [x] ❌ Do **not** declare `RuleSetCollection`. RFC-004 §1.1 carries it commented "Reserved for a
        future fourth level … Not in the MVP" — reserving a name for nothing is speculative code.
  - [x] **Pin AC5 with a compile-time assertion, not a comment.** In the test file (not the source):
        assign a `SurvivalRules` fixture to `RuleSet<SurvivalPayload>` and let `tsc` prove
        assignability. If it does not compile, the shapes have drifted and Story 3.2 would need the
        mapping layer RFC-004 §2.4 promises it will not need. ⚠️ This assertion lives in the **GoL-
        facing** test file, never in the non-GoL one (AC6) and never in the engine source.
        `SurvivalPayload` is not currently exported by name from `@gol/domain` — see **FD6**.

- [x] **Task 3 — Operator dictionary** (AC: 2)
  - [x] `Record<Operator, Predicate>` where `Predicate = (value: unknown, pattern: unknown) => boolean`.
        Exhaustive by type: a new `Operator` arm fails the build until the entry exists (OCP with a
        compiler behind it).
  - [x] `range` is **inclusive on both ends** — `v >= lo && v <= hi`. Story 1.3's `NumericPattern`
        already validates `[min, max]` with `min <= max`, and Conway's Classic's survive rule is
        `range [2,3]` meaning 2 **or** 3. An exclusive upper bound silently makes Conway wrong.
  - [x] Comparison operators cast through `as number` (RFC-004 §1.2). That is not an escape hatch —
        the dictionary's contract is `unknown`, and validation happened at the schema boundary
        (project-context: *"inside the engine types are already proven — never re-parse per cell"*).
        ❌ Do not add per-call `typeof` guards or a Zod re-parse; that is the hot path (Story 3.4).
  - [x] ❌ No `ne`. Decision C.3 explicitly retired it — `cellState = occupied` covers "any other
        organism", so `ne` is a future nicety with no MVP requirement behind it.

- [x] **Task 4 — Evaluation: `conditionIsSatisfiedBy` / `ruleIsSatisfiedBy` / `firstSatisfiedBy`** (AC: 3)
  - [x] `conditionIsSatisfiedBy<S>(c, subject, selectors)` — resolve the value through the selector
        dictionary, apply the operator predicate. Selector-miss behaviour per **FD3**.
  - [x] `ruleIsSatisfiedBy<S>(rule, subject, selectors)` — `conditions.every(...)`. Native
        short-circuit; ❌ do not pre-`map` the conditions to booleans, that evaluates all of them.
  - [x] `firstSatisfiedBy<S, Payload>(ruleSet, subject, selectors): Rule<Payload> | null` —
        `ruleSet.find(...) ?? null`. **`?? null`, not `|| null`**: `find` returns `undefined`, and
        the two differ for any falsy-but-present value; and the return type is `| null`, so leaking
        `undefined` breaks every `=== null` check downstream.
  - [x] An empty `RuleSet` returns `null` — that is the AC3 "none does" path and it needs its own test.

- [x] **Task 5 — Make domain-blindness mechanical, not conventional** (AC: 4)
  - [x] Put the generic layer in its own directory under `packages/simulation/src/` (**FD4**) and add
        a `no-restricted-imports` block in `eslint.config.mjs` scoped to that directory, banning
        `@gol/domain` (and any relative escape out of it).
  - [x] **Why a lint rule and not a code comment:** this repo already treats "the engine is pure" as
        a *compiler-enforced fact* rather than a convention (project-context: no DOM types in
        `packages/*`; the `@gol/test-utils` import boundary in `eslint.config.mjs`). A GoL import
        into this layer typechecks, passes every test, and silently ends the reusability AR-16 is
        for. The one existing `no-restricted-imports` block is the pattern to copy — including its
        comment explaining the failure it prevents.
  - [x] `packages/simulation`'s `tsconfig.json` already inherits `lib: ["ES2022"]` with no `dom`.
        ❌ Never add `"dom"` to it. If something here appears to need a DOM type, the code is in the
        wrong package.
  - [x] ❌ Do **not** remove `"@gol/domain": "*"` from `packages/simulation/package.json`. Story 3.2
        lands the GoL layer in this same package and needs the edge; the boundary being enforced is
        *directory-scoped*, not package-scoped. See **FD5** for the placeholder that currently
        proves that edge.

- [x] **Task 6 — The non-GoL proof test** (AC: 6)
  - [x] One test file built on a subject with no cellular-automaton content — e.g. a library loan
        (`{ daysOverdue, memberTier, status }`) or a thermostat reading. Its `Selectors<S>` and its
        payload type are declared in the test file itself.
  - [x] ⚠️ **The test file must import nothing from `@gol/domain`.** project-context: *"If that test
        needs a GoL import, the engine has leaked."* This is the AR-40 proof, so the import list is
        part of the assertion — the ESLint block from Task 5 should cover this file too if it sits
        inside the guarded directory (**FD4** decides that).
  - [x] Cover: each of the six operators true **and** false (a predicate hardcoded to `true` passes a
        one-sided suite); `range` at `lo`, at `hi`, at `lo-1`, at `hi+1`; a two-condition rule where
        the second condition fails; first-match-wins with two rules that both match; `null` on
        no-match; `null` on an empty `RuleSet`.
  - [x] The returned value is the **`Rule`** — assert on its identity (`id`) and that its `payload`
        came back untouched, which is what proves the engine never read it.

- [x] **Task 7 — Package wiring and barrel** (AC: 1, 5)
  - [x] Export the types and the three functions from `packages/simulation/src/index.ts`. Types go
        out with `export type { … }` — `isolatedModules: true` is repo-wide and a bare
        `export { SomeType }` fails to compile.
  - [x] Settle the Story 1.1 placeholder exports per **FD5** and state the choice in the Dev Agent
        Record. ❌ Do not leave a dead placeholder sitting beside real exports unexplained.
  - [x] ❌ Do not touch `packages/simulation/vitest.config.ts`. Its `passWithNoTests: true` and its
        disabled coverage threshold are **Story 3.7's** to flip; this story just makes the package's
        `test` script produce real assertions for the first time.

- [x] **Task 8 — Verify** (AC: all)
  - [x] `npm run ci` — the full local gate. ⚠️ **Do not pipe it** (`| tail` reports *tail's* exit
        code; this masked a real `format:check` failure during the Story 1.9 review). Redirect to a
        file and echo `$?`.
  - [x] Confirm `packages/simulation` now reports real Vitest output, not
        `No test files found, exiting with code 0`.
  - [x] Every spec ID written in a comment must resolve — `npm run spec:check` runs inside `ci` and
        fails the build on a dangling citation. Write IDs exactly as the specs spell them
        (`AR-16`, `Decision C`, `FR-2.6`); `M-10` matches nothing and is silently exempt forever.
  - [x] Record the commands and their real output summary in the Dev Agent Record. Never state a
        step ran when it did not.

## Dev Notes

### Constraints the developer MUST follow

- **Scope: the generic layer only.** `CellSubject`, `resolveCellAction` and the five GoL properties
  are **Story 3.2**. Typed-array grids are **3.3**. Compilation, interning and the `contentHash`-keyed
  cache are **3.4**. Phases and the RNG are **3.5/3.6**. This story produces types, an operator
  dictionary, three pure functions, and their tests.
- **No classes in the engine.** `packages/simulation` is pure functions with DI. No `class`, no
  `this`, no internal mutable state — the operator dictionary is a frozen-by-construction module
  constant, not a registry anything mutates.
- **No DOM types in `packages/*`.** `tsconfig.base.json` is `lib: ["ES2022"]`; only `apps/web` adds
  `dom`, and `packages/persistence` adds it to its own tsconfig because it owns `localStorage`.
  Neither applies here.
- **Strict TS, no escape hatches.** No `any`, no `@ts-ignore`, no non-null `!`. `unknown` plus a
  documented cast is the right tool in the operator dictionary; `any` is not.
- **ESM, package-name imports.** `@gol/*` are `"type": "module"`. Cross-package imports use the
  package name, never a relative path into another workspace.
- **camelCase file names, never dotted** — `rulesEngine.ts`, not `rules.engine.ts` (project-context
  naming decision, 2026-07-16; RFC-001's dotted snippet is stale).
- **Comments explain WHY.** Every non-obvious line carries the failure it prevents and cites the
  governing ID. That convention is `spec:check`-enforced and is the house style across ~450 comment
  lines already in the workspace.
- **Commit gate stands** — never stage or commit without Sidiar's explicit go-ahead, even on a green
  `npm run ci`. (A story subagent under `implement-next-story` may push to its own `story/*` branch;
  merging is always Sidiar's call.)

### What this layer is, in one paragraph

Three levels — `Condition`, `Rule`, `RuleSet` — that know about subjects, properties, operators and
patterns, and nothing else. A `Selectors<S>` dictionary is the Adapter that lets any subject plug in;
`payload` is opaque data the engine carries and never reads. `firstSatisfiedBy` returns the **winning
rule**, and every domain builds its own thin action-resolution on top of that primitive. Story 3.2
will fix `S = CellSubject` and `Payload = SurvivalPayload` and add `resolveCellAction`; Story 3.5 will
call `firstSatisfiedBy` twice over **action-partitioned** subsets to get M10's death-before-survival
precedence. Both of those are *callers*. Neither is allowed to require a change in here — if a later
engine story needs this layer edited, the abstraction was drawn wrong.

### Forced decisions (record the option taken and why in the Dev Agent Record)

**FD1 — RFC-004 §1.1 vs §1.4: the letter `P` means two different things, and `Condition<P>` is inert.**
§1.1 declares `interface Condition<P = unknown>` where `P` is the **pattern** type — but then
`Rule<Payload>.conditions` is typed `readonly Condition[]` and every §1.4 signature takes a bare
`Condition`, so the parameter is never once supplied. §1.4 then reuses `P` as the **payload** in
`firstSatisfiedBy<S, P>`. Two meanings, one letter, and one of them unused.
*Settle it explicitly.* The low-risk reading: drop `Condition`'s unused type parameter, type
`pattern` per FD2, and name the payload parameter `Payload` (not `P`) everywhere so the collision
cannot recur in 3.2's file. If you keep `Condition<P>`, it must actually thread through
`Rule.conditions` — an inert parameter is worse than none, because it looks load-bearing.

**FD2 — `pattern`'s type: `unknown` vs. a generic parameter.**
The operator dictionary's contract is already `(value: unknown, pattern: unknown)`. `pattern: unknown`
matches it, keeps `Condition` non-generic, and stays assignable from `@gol/domain`'s concrete
`Condition` (whose patterns are `string | number | [number, number]`) — AC5's assignability check is
the arbiter. ⚠️ Verify the direction actually holds before committing: `SurvivalRule` must be
assignable **to** `Rule<SurvivalPayload>`, which requires `Condition`'s fields to be *no narrower*
than the domain's. A generic `Condition<Pattern>` can break that assignment in a way a comment will
not catch — let `tsc` decide.

**FD3 — What happens when `selectors[condition.property]` is missing.**
`noUncheckedIndexedAccess` is **not** enabled in `tsconfig.base.json`, so `Record<string, Selector<S>>`
hands back a `Selector<S>` the compiler believes in and the runtime does not — a typo'd property
throws `selectors[...] is not a function` from inside the hot path, per cell, with no useful message.
Options: (a) throw a named error naming the property and the available keys; (b) treat a missing
selector as a non-match (`false`) and keep evaluation total; (c) make it unreachable by typing the
seam — `Condition<Props extends string>` with `Selectors<S, Props> = Record<Props, Selector<S>>`, so
a domain that omits a selector fails at compile time.
(c) is the strongest and is the option most in keeping with this repo (it turns a runtime surprise
into a build failure), but it interacts with FD1/FD2 — check AC5's assignability under whichever you
pick. Whatever you choose, **the choice is inherited**: Story 3.2 supplies the selectors, and Story
3.4 compiles them away.

**FD4 — Where the boundary lives on disk, and what the lint rule guards.**
The AR-40 claim is "imports nothing GoL-specific", and Story 3.2 lands GoL code *in the same package*.
So the boundary is a **directory**, e.g. `packages/simulation/src/engine/` (generic) beside
`packages/simulation/src/gol/` (3.2's, not created here). Decide the directory name, and decide
whether the non-GoL **test** file sits inside the guarded directory — putting it inside means the
ESLint rule enforces AC6's "imports nothing from `@gol/domain`" for free, which is strictly better
than trusting review. Note the AC5 assignability test then cannot live there (it *must* import
`@gol/domain`) — that is fine, it is a different file with a different job.
*Precedent, from the four commits immediately before this story:* the repo has just been through a
deliberate round of exactly this move — `lib/gallery/`, `lib/battle/`, `components/battle/editor|
simulation/`, and `test-support/recordingContext2d` (which was fenced off with a
`no-restricted-imports` rule in the same commit, because *"nothing stopped a production module
importing it"*). A directory here is the established way this codebase makes a boundary mean
something; `components/battle/simulation/README.md` is the shape of note to leave behind if you want
3.2 to find the rule rather than trip over it.

**FD5 — The Story 1.1 placeholder exports in `packages/simulation/src/index.ts`.**
The file currently exports `GOL_SIMULATION` (a dead string constant) and `SIMULATION_DEPENDS_ON`
(`SurvivalRulesSchema`, re-exported purely to prove the declared `"@gol/domain": "*"` workspace edge
still resolves to that package's TS source — Story 1.1's graph proof, retargeted by Story 1.3).
Nothing else in the repo imports either. The tension: Story 1.3's precedent says replace a
placeholder rather than leave it beside real exports, but this story's real exports must **not**
import `@gol/domain`, so removing `SIMULATION_DEPENDS_ON` leaves the dependency edge unproven for
exactly one story (3.2 restores it for real).
Reasonable options: retire both and note in the Dev Agent Record that 3.2 re-establishes the edge; or
retire `GOL_SIMULATION` (which proves nothing) and keep `SIMULATION_DEPENDS_ON` one more story with
its comment updated to say *why* it is still here. Pick one, say why, and make the file's comments
true afterwards either way.

**FD6 — `SurvivalPayload` has no exported name.**
`@gol/domain` exports `Condition`, `SurvivalRule` and `SurvivalRules`, but `SurvivalPayloadSchema` is
a module-local const in `survivalRuleSchema.ts` and its inferred type is not exported. Task 2's
assignability check needs *some* payload type. Options: use `SurvivalRule['payload']` (an indexed
access — no change to `@gol/domain`, and the honest expression of "whatever that field is"); or add
the export to `@gol/domain`. Prefer the indexed access unless Story 3.2 turns out to need the name —
widening another package's public surface from inside this story is scope the AC does not ask for.

### Traps

1. ⚠️ **`find(...) ?? null`, never `|| null`.** They differ for any falsy-but-found value, and the
   signature promises `Rule<Payload> | null` — a leaked `undefined` passes `!winner` and fails
   `winner === null`, which is exactly how a downstream `null` check silently stops working.
2. ⚠️ **`range` is inclusive at both bounds.** `[2,3]` means "2 or 3". Get this wrong and every
   Conway golden pattern in Story 3.6 fails, three stories after the bug was written.
3. ⚠️ **`conditions.every` short-circuits; a `map`-then-`every` does not.** The per-cell hot path is
   the reason this layer exists in this shape.
4. ⚠️ **The engine must not read `payload`.** Not to sort, not to filter, not to "optimize". Story
   3.5 does the action-partitioned filtering *outside* — `firstSatisfiedBy(rules.filter(r =>
   r.payload.action === 'die'), …)` — because that partition is GoL precedence (M10), not a generic
   concern. A `payload.action` reference in this layer is the leak AR-40 tests for.
5. ⚠️ **`contentHash` is declared here and generated nowhere.** `deferred-work.md` records the whole
   picture: Conway's Classic's two literals are hand-pasted, the canonicalization is pinned as
   `sha256hex(JSON.stringify(sortKeysDeep({ conditions, payload })))` in
   `packages/domain/src/defaultWorkspace.ts`, and the real hasher is Epic 4's with Story 3.4
   confirming it. ❌ Writing a hasher here would fork rule identity across every installed workspace.
6. ⚠️ **Those literals carry no `sha256:` prefix**, though RFC-004 §2.4's JSON example shows
   `"sha256:9f2a7c…"`. Story 1.5 settled it as bare hex. `contentHash` is an **opaque string** to
   this layer — ❌ do not parse it, prefix it, or validate its shape.
7. ⚠️ **`id` is opaque and non-semantic.** RFC-004 §2.4 rejects `"rule_birth"` outright: an organism
   can hold several `born` rules, so semantic ids collide. Identical rules share a `contentHash` and
   keep **distinct** `id`s — so ❌ never dedupe, key, or compare rules by `id` believing it implies
   content, or vice-versa.
8. ⚠️ **Two types will be named `Condition`.** `@gol/domain` already exports one (the concrete,
   Zod-inferred GoL condition); this story adds the generic one in `@gol/simulation`. They coexist
   fine across packages, but **Story 3.2 imports both into one file** and will have to alias. Keep
   RFC-004's names here (they are the cited source of truth) and leave a comment at the export site
   naming the collision, so 3.2 discovers it by reading rather than by a compile error.
9. ⚠️ **Don't tighten what Story 1.3 deliberately left loose.** `neighborCount` is validated 0–65534,
   not 0–8, with RFC-004's own note that property-specific tightening is *editor-level UX* (Epic 4),
   not schema. That reasoning applies with more force here: this layer does not know what a neighbour
   is.
10. ⚠️ **`packages/*` has no `crypto`, no `node:` builtins, no DOM.** `lib: ["ES2022"]` only. If an
    approach reaches for `crypto.subtle` or `node:crypto`, it is trap 5 arriving by another road.
11. ⚠️ **Nothing in `apps/web` changes.** No route, no component, no bundle budget. If the diff
    touches `apps/web`, the scope has slipped.
12. ⚠️ **`packages/simulation` is currently vacuously green.** `passWithNoTests: true` means the
    package's `test` script exits 0 today with zero assertions. A green `npm test` after this story
    is only meaningful if `packages/simulation` shows a real test count — check it specifically.

### Spec-conflict flags (project-context: surface new conflicts, don't silently pick one)

- **`architecture.md`'s package table places the rules engine in `packages/domain`.** Its Repository
  Structure section reads *"domain/ … generic rules-engine + GoL rules (RFC-004)"*, and RFC-001's
  directory sketch nests `rules-engine/` under `packages/domain/`. Story 3.1's AC is explicit and
  wins: *"Given `packages/simulation`…"*. This is **not new** — Story 1.3 surfaced and resolved it,
  and this story implements that resolution. Noted so the dev does not re-litigate it, and so a
  future doc pass knows the table line is the stale one.
- **RFC-004 §1.5's `makeRuleSchema(payloadSchema, conditionSchema)` helper has no consumer, and this
  story should not build one.** §1.5 has the generic engine expose a Zod schema *helper* that the
  domain layer parameterizes. Story 1.3 instead authored the concrete `ConditionSchema` /
  `SurvivalRuleSchema` directly in `@gol/domain`, verbatim from RFC-004 §2.4 — so the helper's only
  intended caller already exists and does not use it. `packages/simulation` has no `zod` dependency,
  and adding one to ship an uncalled helper is speculative code that also pulls a parsing library
  into the engine package that project-context deliberately keeps at the boundaries. **Recommended:
  skip §1.5, note it here.** ⚠️ Flag this to Sidiar rather than deciding silently if it feels like
  more than a scope call.
- **RFC-004 §1.1/§1.4's `P` collision** — see FD1. An internal RFC ambiguity, not a cross-document
  conflict, but it must be resolved deliberately because 3.2 and 3.5 both consume the signature.

### What NOT to build (scope boundaries)

- ❌ `CellSubject`, the five GoL properties, `resolveCellAction`, the relative three-valued
  `cellState` — **Story 3.2**.
- ❌ Typed-array grid, Moore neighbourhood, `resizeGrid` — **Story 3.3**.
- ❌ Precompiled evaluators, the `contentHash`-keyed session cache, id→ref interning,
  `MAX_RELEVANT_AGE` — **Story 3.4**.
- ❌ Death / birth-survival phases, action-partitioned rule filtering, Dominance conflict resolution,
  the `Rng` interface (`@gol/simulation` owns that name — Story 1.6 forced decision 4 — but it is
  consumed by RFC-004 §3.1's `SimulationDeps`, which is **Story 3.6**, not this one) — **3.5/3.6**.
- ❌ `contentHash` or `id` **generation** or hashing of any kind — Epic 4 authoring / Story 3.4.
- ❌ A Zod schema helper (`makeRuleSchema`) and a `zod` dependency on `packages/simulation` — see the
  conflict flag above.
- ❌ `RuleSetCollection`, an `ne`/`in`/`contains` operator, OR-combining, rule groups — reserved or
  retired, all with no MVP requirement.
- ❌ Coverage-threshold changes, `passWithNoTests` removal, a shared vitest base config — **Story 3.7**
  (`deferred-work.md` explicitly parks the shared-base idea there).
- ❌ Benchmarks / `vitest bench` — **Story 3.7**.
- ❌ Anything in `apps/web`.

### Testing standards summary

- **Location:** co-located `*.test.ts` beside the source, node environment (`packages/*` are pure TS,
  no DOM). That is the pattern every existing `packages/*` test follows.
- **The AR-40 proof is the point of AC6, not a formality.** A non-GoL subject, declared in the test
  file, with no `@gol/domain` import. RFC-008 Decision 4 lists it as a required core test.
- **Both directions on every predicate.** Six operators × {passes, fails}; `range` at `lo`, `hi`,
  `lo-1`, `hi+1`. A suite that only ever asserts `true` cannot fail on a predicate stuck at `true`.
- **Assert on the returned `Rule`**, including that its `payload` round-trips untouched — that is the
  observable form of "the engine never reads the payload".
- **`fast-check` is installed** (root devDeps, v4, hoisted; already used in three `apps/web` tests).
  AR-41 does not assign a property test to this story, so this is optional and one is enough if it
  earns its place — e.g. `firstSatisfiedBy(rs, s, sel)` equals `rs.filter(r => ruleIsSatisfiedBy(...))[0] ?? null`
  for arbitrary rule sets, which pins first-match-wins across all orderings in a way examples cannot.
  ❌ Do not add property tests for coverage's sake.
- **No coverage-padding tests.** The ≥90% gate does not exist yet (Story 3.7) and coverage-padding is
  rejected in review regardless. Write for correctness and for the invariants above.
- **Determinism:** nothing here is random. ❌ Do not import the seeded RNG — it belongs to Phase 3.

## Project Structure Notes

Indicative; the exact split inside `packages/simulation/src/` is a judgment call constrained by FD4
and by the camelCase-never-dotted rule.

```
packages/simulation/src/
  engine/                      the guarded, domain-blind directory (FD4)
    operators.ts               Operator union + the predicate dictionary
    rule.ts                    Condition, Rule<Payload>, RuleSet<Payload>, Selectors<S>
    firstSatisfiedBy.ts        the three evaluation functions
    <name>.test.ts             the AR-40 non-GoL proof (no @gol/domain import)
  index.ts                     barrel — `export type { … }` for types (isolatedModules)
```

Updated:

- `packages/simulation/src/index.ts` — real exports replace the Story 1.1 placeholders per FD5.
- `eslint.config.mjs` — one `no-restricted-imports` block scoping the engine directory (Task 5),
  written in the shape of the existing `@gol/test-utils` boundary block, with a comment naming the
  failure it prevents. ⚠️ It is a **third**, independent block — do not merge it into the AR-46
  colour-literal block or the test-utils block, whose `ignores` lists are already documented as
  deliberately non-interchangeable.

Not touched: `packages/simulation/package.json` (the `@gol/domain` edge stays — Story 3.2 needs it),
`packages/simulation/tsconfig.json`, `packages/simulation/vitest.config.ts`, anything in `apps/web`.

## References

- [Source: docs/planning-artifacts/epics.md#Story 3.1: Generic Rules Engine] — story statement + the
  four AC bullets decomposed above
- [Source: docs/planning-artifacts/epics.md#Epic 3: Living Simulations (Play Mode & Engine)] — the
  three-layer framing and where 3.2–3.6 build on this layer
- [Source: docs/planning-artifacts/epics.md#Requirements Inventory / Architecture Requirements] —
  AR-16 (three-layer functional design, no classes), AR-21 (opaque `id` + deterministic
  `contentHash`), AR-40 (non-GoL subject proves domain-agnosticism), AR-41 (property-based invariants
  — assigned to 3.3/3.5/3.6, not here)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#Part 1 — Generic Functional Rules Engine]
  — §1.1 data model, §1.2 operator dictionary, §1.3 `Selectors<S>`, §1.4 the three evaluation
  functions and the "return the winning Rule, not an action" rationale, §1.5 the schema helper this
  story deliberately skips (see conflict flag)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.4 Persistence] — rule
  identity: opaque generated `id` vs. deterministic `contentHash`, and the "persisted data feeds the
  engine without any mapping layer" claim AC5 pins
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.3] — Story 3.5's
  action-partitioned `firstSatisfiedBy` calls: why the partition is a *caller* concern
- [Source: docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md#Decision 4] —
  domain-agnosticism proof with a non-GoL subject; seeded RNG; golden patterns (3.6, not here)
- [Source: docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md#Decision 5] —
  fast-check invariants and which stories own them
- [Source: docs/planning-artifacts/architecture.md#Decision C — Three-valued, relative Cell State] —
  C.3 retires `ne`; C.4's OR limitation is why `RuleSetCollection` stays unbuilt
- [Source: docs/planning-artifacts/architecture.md#Decision E — Stable organism ids at rest] — E.3
  id→ref interning happens inside the compiled evaluators (Story 3.4), E.4 the session-scoped
  `contentHash`-keyed cache this story's `contentHash` field feeds
- [Source: docs/planning-artifacts/architecture.md#Repository / Package Structure] — the `domain/`
  vs. `simulation/` placement line flagged as stale above
- [Source: docs/planning-artifacts/architecture.md#Minor Spec Resolutions] — M10 (death precedes
  survival; implicit death resolves at cycle-end) — context for why 3.5 partitions, not this layer
- [Source: docs/project-context.md#Critical Implementation Rules] — no classes in the engine; no DOM
  types in `packages/*`; `isolatedModules` re-export form; camelCase-never-dotted; Zod parses at
  boundaries, never per cell; comments explain WHY and cite the governing ID
- [Source: docs/project-context.md#Testing Rules] — *"the generic rules engine is tested with a
  non-Game-of-Life subject. If that test needs a GoL import, the engine has leaked"*; coverage is a
  floor on the core and the gate flips in Story 3.7; no coverage-padding tests
- [Source: docs/project-context.md#Development Workflow Rules] — `npm run ci` is the local mirror of
  CI; never pipe it; the commit gate
- [Source: packages/domain/src/survivalRuleSchema.ts] — the concrete shape AC5 must stay structurally
  compatible with; `SurvivalPayloadSchema` is module-local (FD6); the comment that `id`/`contentHash`
  generation belongs to Epic 4 / Epic 3, not to the schema
- [Source: packages/domain/src/defaultWorkspace.ts] — the pinned `contentHash` canonicalization and
  the bare-hex (no `sha256:` prefix) literals
- [Source: packages/simulation/src/index.ts] — the Story 1.1/1.3 placeholder exports FD5 settles
- [Source: docs/implementation-artifacts/epic-1/1-3-domain-entities-zod-schemas.md] — the
  `packages/domain` vs `packages/simulation` scope-boundary resolution this story implements; the
  "replace the placeholder, don't leave it alongside" precedent
- [Source: docs/implementation-artifacts/epic-1/1-6-test-utilities-dev-fixture-workspace.md] — forced
  decision 4: `@gol/simulation` owns the name `Rng` and declares it in Epic 3 (Story 3.6's
  `SimulationDeps`, not this story)
- [Source: docs/implementation-artifacts/deferred-work.md] — the Story 1.5 `contentHash` generator
  entry (Epic 4 authors it, Story 3.4 confirms it); duplicate `id`/`contentHash` within one
  `survivalRules` array is accepted and collides with the E.4 cache — **revisit at 3.4, not here**;
  the shared vitest base config parked at Story 3.7
- [Source: eslint.config.mjs] — the `packages/**/*.ts` lint block and the `@gol/test-utils`
  import-boundary block Task 5's new rule is modelled on

## Dev Agent Record

### Agent Model Used

claude-opus-5 (the story trailer's `Dev Model: opus`).

### Debug Log References

All commands run from the repo root on branch `story/3-1-generic-rules-engine`.

- `npm run ci` — **exit 0**. Redirected to a file with `$?` echoed, never piped (Task 8; the
  Story 1.9 `format:check` miss came from `| tail` reporting *tail's* status).
  Chain: typecheck → lint → format:check → spec:check → test:coverage → build:standalone →
  bundle:check → e2e.
- `npm run test:coverage` per package: `@gol/domain` 6 files / 99 tests · `@gol/simulation`
  **2 files / 19 tests** · `@gol/persistence` 7 files / 82 tests · `@gol/test-utils` 5 files /
  75 tests · `web` 62 files / 954 tests. Total 1,229 unit tests, 0 failures.
- `npm run e2e` — 344 passed, 4 skipped (2.0m).
- **Task 8's specific check:** `@gol/simulation` no longer prints
  `No test files found, exiting with code 0`. It reports real Vitest output and
  **100% stmts / branch / funcs / lines** across `operators.ts`, `rule.ts` and
  `firstSatisfiedBy.ts`. (The ≥90% gate itself is still Story 3.7's to flip —
  `vitest.config.ts` was not touched.)
- **The new lint rule was proved to fire, not merely to pass.** A throwaway
  `src/engine/__violation.ts` importing `@gol/domain` and `../index` produced 2 errors (exit 1);
  it was deleted and the clean tree re-linted to exit 0. A boundary rule that matches nothing
  passes CI forever, so the negative case is the only evidence worth having.
- `Decision C.3` was rejected by `npm run spec:check` in advance — the checker tokenises
  `Decision [A-Z](\.\d+)?` and no authority doc defines `C.3`. Citations were written as
  `Decision C`. Every other ID used (AR-16/21/40, FR-2.6, NFR-1.1, M10, Decision E.4,
  RFC-004/008, Story 3.2/3.4/3.5/3.6) was verified to resolve before being written.

### Completion Notes List

**The six forced decisions (Task 1). Each is inherited by Stories 3.2/3.4/3.5/3.6.**

- **FD1 — the `P` collision. Option taken: drop `Condition`'s pattern parameter; name the payload
  parameter `Payload` everywhere.** RFC-004 §1.1 declares `Condition<P = unknown>` with `P` as the
  *pattern*, then never supplies it (`Rule.conditions` is a bare `Condition[]`, every §1.4
  signature takes a bare `Condition`), while §1.4 reuses `P` as the *payload*. The inert half is
  gone. The parameter `Condition` *does* now carry — `Props` (see FD3) — genuinely threads through
  `Rule.conditions`, which was the story's stated bar: an inert type parameter is worse than none
  because it looks load-bearing. `Payload` is spelled out so the collision cannot recur in 3.2's
  file, where both `Condition` types meet.
- **FD2 — `pattern: unknown`.** It matches the operator dictionary's existing
  `(value: unknown, pattern: unknown)` contract, keeps `Condition` free of a pattern parameter, and
  stays assignable *from* `@gol/domain`'s concrete `Condition`. The story asked for the direction to
  be verified rather than assumed — it was, with a throwaway `tsc` probe *before* any source was
  written, because a generic `Condition<Pattern>` would have broken AC5 in a way review would not
  catch.
- **FD3 — missing selector. Option (c): make it unreachable by typing the seam.**
  `Selectors<S, Props extends string = string> = Readonly<Record<Props, Selector<S>>>`, with `Props`
  threaded through `Condition`/`Rule`/`RuleSet`. `noUncheckedIndexedAccess` is off repo-wide, so
  option (a)/(b)'s alternative was a per-cell runtime branch guarding against
  `selectors[...] is not a function`. Naming the key set instead turns that into a compile error at
  the call site that owns the omission, and costs **nothing** in the NFR-1.1 inner loop — no guard,
  no branch, no fallback. Verified empirically in both directions before adoption:
  - a selector dictionary missing a key → `error TS2345: Property 'tier' is missing …`;
  - the realistic Story 3.2 shape (`CONWAYS_CLASSIC.survivalRules` + a cell selector dictionary)
    infers `Props` to exactly the five GoL properties and names all three missing ones when the
    dictionary is short;
  - a dictionary with *extra* keys still compiles, so 3.2 is not forced into a minimal set.
  - The `= string` default is what keeps AC5's bare `RuleSet<SurvivalPayload>` legal.
- **FD4 — boundary on disk: `packages/simulation/src/engine/`, with the AR-40 test *inside* it.**
  Story 3.2's GoL layer lands in the same package, so the boundary is a directory, not a package.
  Putting `rulesEngine.test.ts` inside the guarded directory means ESLint enforces AC6's "imports
  nothing from `@gol/domain`" mechanically instead of by review. The AC5 assignability test
  therefore sits *outside*, at `src/domainRuleSetCompatibility.test.ts` — it must import
  `@gol/domain`; different file, different job. `src/engine/README.md` follows the
  `components/battle/simulation/README.md` precedent so 3.2 finds the rule rather than trips over
  it, and names `src/gol/` as where 3.2's code belongs.
- **FD5 — retire BOTH Story 1.1 placeholders.** `GOL_SIMULATION` proved nothing.
  `SIMULATION_DEPENDS_ON` existed only to prove the declared `"@gol/domain": "*"` edge still
  resolved to that package's TS source — a job now done **for real, and better**, by
  `domainRuleSetCompatibility.test.ts`, which imports `@gol/domain` and is covered by
  `tsc --noEmit` through this package's `include: ["src"]`. So the edge is *not* left unproven for
  a story, which was the only argument for keeping the placeholder; Story 1.3's
  "replace the placeholder, don't leave it beside real exports" precedent wins outright.
  `packages/simulation/package.json` keeps the `@gol/domain` dependency — 3.2 needs it.
- **FD6 — `SurvivalRule['payload']` (indexed access).** No change to `@gol/domain`'s public
  surface. Widening another package's exports from inside this story is scope the AC does not ask
  for, and the indexed access is the honest expression of "whatever that field is". If 3.2 needs
  the name, 3.2 can export it.

**RFC-004 §1.5 `makeRuleSchema` — deliberately NOT built.** Recording this as an explicit call, not
an omission. §1.5 has the generic engine expose a Zod schema *helper* the domain parameterizes, but
its only intended caller already exists and bypasses it: Story 1.3 authored `ConditionSchema` /
`SurvivalRuleSchema` concretely in `@gol/domain`, verbatim from RFC-004 §2.4. Building the helper
now would mean adding a `zod` dependency to `packages/simulation` to ship an **uncalled** function,
and pulling a parsing library into the engine package that project-context deliberately keeps at
the boundaries (*"inside the engine types are already proven — never re-parse per cell"*). Skipped
per the story's recommendation; no `zod` dependency was added. Flagged here for Sidiar rather than
buried — if the helper is ever wanted, it is additive and nothing here blocks it.

**Other decisions worth the reviewer's attention**

- `RuleSetCollection` not declared — RFC-004 §1.1 marks it "Not in the MVP"; reserving a name for
  nothing is speculative code.
- `Operator` kept as one six-arm union. RFC-004's `NumericOperator | EqualityOperator` split has
  `EqualityOperator = 'eq'` already inside the numeric arm, so it names the same six and documents
  nothing; collapsing it removes a distinction a reader would otherwise hunt for.
- The operator dictionary is module-internal — the barrel exports the three functions and the
  types only (Task 7). It is exercised through `conditionIsSatisfiedBy`, which is the real contract.
- `contentHash` / `id` are declared and **generated nowhere** (trap 5/6/7). Treated as opaque
  strings: never parsed, prefixed, or compared for content. No hashing, no `crypto`, no `node:`
  builtins.
- The engine never reads `payload`. Proved observably rather than asserted: the AR-40 test checks
  the returned rule's payload by **reference identity** (`toBe`), which a copy or re-shape would
  not satisfy.
- Short-circuiting is proved observably too — a counting selector shows the second condition's
  selector is invoked **0** times when the first condition fails.
- One fast-check property test earns its place (AR-41 assigns none to this story): `firstSatisfiedBy`
  always equals `ruleSet.filter(ruleIsSatisfiedBy)[0] ?? null`, which pins first-match-wins across
  every ordering, including duplicate and unsatisfiable rules. No coverage-padding tests were
  written.
- Nothing in `apps/web` was touched; `vitest.config.ts`, `tsconfig.json` and `package.json` of
  `packages/simulation` are all unchanged (Tasks 5/7 scope boundaries).

**Spec conflicts — status**

- `architecture.md`'s package table placing the rules engine in `packages/domain` is the **stale**
  line; the story's AC (`Given packages/simulation`) wins. Not new — Story 1.3 surfaced and
  resolved it, this story implements that resolution. Left for a future doc pass.
- RFC-004 §1.5 — see the explicit skip above.
- RFC-004 §1.1/§1.4's `P` collision — resolved in FD1. Internal RFC ambiguity, not a cross-document
  conflict.
- **No new conflicts surfaced.**

### File List

**Added**

- `packages/simulation/src/engine/operators.ts`
- `packages/simulation/src/engine/rule.ts`
- `packages/simulation/src/engine/firstSatisfiedBy.ts`
- `packages/simulation/src/engine/rulesEngine.test.ts` — the AR-40 non-GoL proof
- `packages/simulation/src/engine/README.md`
- `packages/simulation/src/domainRuleSetCompatibility.test.ts` — the AC5 assignability pin

**Modified**

- `packages/simulation/src/index.ts` — real exports replace the Story 1.1 placeholders (FD5)
- `eslint.config.mjs` — a third, independent `no-restricted-imports` block scoping
  `packages/simulation/src/engine/**`
- `docs/implementation-artifacts/sprint-status.yaml` — `3-1-generic-rules-engine` → `review`
- `docs/implementation-artifacts/3-1-generic-rules-engine.md` — this record

### Change Log

- 2026-09-08 — Generic rules engine implemented in `packages/simulation/src/engine/`: `Condition`,
  `Rule<Payload, Props>`, `RuleSet<Payload, Props>`, the `Selectors<S, Props>` seam, the six-operator
  predicate dictionary, and the three-level cascade `conditionIsSatisfiedBy` / `ruleIsSatisfiedBy` /
  `firstSatisfiedBy`. Domain-blindness made mechanical by a directory-scoped ESLint import boundary
  (proved to fire). 19 tests, 100% coverage on the package; `npm run ci` exit 0.


## Review Findings (Story 3.1)

Reviewed on **Sonnet** — deliberately the complement of the **Opus** agent that implemented the
story, so the review is a genuine second pair of eyes rather than the same reasoning re-run.

### Applied (patch bucket)

- **Engine boundary rule missed a bare `..` import.** The `no-restricted-imports` pattern guarding
  `packages/simulation/src/engine/` was `^\.\./`, which matches `../foo` but *not* a bare `import
  … from '..'` — the exact shape that reaches the package root, and therefore GoL code, without
  tripping the `@gol/*` ban above it. Widened to `^\.\.($|/)`. Verified in both directions: a probe
  file importing from `'..'` now fails lint with the boundary message, and legitimate intra-engine
  imports (`./operators`) still pass with the repo lint green.

### Confirmed, no change needed

- **AC5** — `SurvivalRules` is assignable to `RuleSet<SurvivalPayload>` with no mapping layer,
  covered by `domainRuleSetCompatibility.test.ts`.
- **AC4** — purity is mechanical, not asserted: zero `@gol/domain` imports, no `class`/`this`/module
  state/DOM, and the ESLint boundary was proved to *fire* rather than merely to pass.
- **AC6** — tests drive a non-GoL subject and the test file imports nothing from `@gol/domain`.
- **FD1** — dropping `Condition`'s inert pattern parameter and threading a real `Props` parameter
  holds up for the 3.2 and 3.5 consumers. `Props` is generic and names no GoL concept, so AC1 stands.
- **RFC-004 §1.5 `makeRuleSchema` skip** — judged a scope call, not a spec violation: the helper's
  only intended caller already exists in `@gol/domain` and bypasses it, and building it would pull
  `zod` into the engine package. Carried to Sidiar in the PR as a note, not as a blocker.

### Decision-needed

None. The story is therefore set to `done` on this branch.

### Coverage gap — read this before trusting the review as exhaustive

The review ran under repeated infrastructure failures (the machine slept mid-response five times;
the stream watchdog killed the agent on three of them). The Blind Hunter and Edge Case Hunter layers
completed; the **Acceptance Auditor was killed mid-pass** and its remaining checks were finished
inline instead. The findings above are the ones that survived, and the applied patch was
independently re-verified against the working tree afterwards — but this was not a clean run, and
the review should be treated as good rather than exhaustive.

---

Dev Model: opus   # architecture-shaping: this is the layer 3.2/3.4/3.5/3.6 all compile against, and it must settle a live RFC-004 ambiguity (the `P` parameter means "pattern" in §1.1 and "payload" in §1.4, and `Condition<P>` is inert as written), the `Selectors<S>` miss-behaviour that decides whether a missing selector is a build error or a per-cell runtime throw, the on-disk boundary plus its lint enforcement that makes AR-40's purity claim mechanical, and the RFC §1.5 schema-helper divergence — nothing precedes it to follow, and every one of those choices is inherited rather than revisited
