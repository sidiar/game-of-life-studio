---
baseline_commit: 142d28b
---

# Story 1.3: Domain Entities & Zod Schemas

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want complete Zod schemas for all domain entities from day one,
so that architecture invariants are mechanically enforced at every boundary and never retrofitted.

## Acceptance Criteria

1. **Given** `@gol/domain`, **When** schemas are defined, **Then** `OrganismSchema` enforces name ≤ 50, integer dominance 1–100, `colorToken` (not raw hex), `agingEnabled`, `survivalRules`, and `schemaVersion` stamp (AR-7, RFC-001/004)
2. **And** `SurvivalRulesSchema` covers all five condition properties, all six operands including `range`, and age literals ≤ 65534, with per-rule opaque `id` + deterministic `contentHash` (AR-20/21)
3. **And** `BattleSchema` enforces name ≤ 100, `organismIds` ≤ 255, `EditableGridPresetSchema` ({50×30} | {100×60} literals), and dense `gridState` (AR-7)
4. **Given** a Battle payload violating an invariant, **When** parsed, **Then** superRefines reject it: gridState dimensions must match gridSize, every cell value must index into `organismIds`, and `organismIds` must equal the placed set (Decision H.1)
5. **And** unit tests cover a valid fixture per entity plus one rejection test per invariant

## Tasks / Subtasks

- [x] **Task 1: Wire Zod into `@gol/domain`** (AC: 1, 3)
  - [x] Add `zod` as a `@gol/domain` dependency (root devDeps stay as-is; this is a runtime dep of the package, not a devDep — `@gol/domain` ships in the browser bundle). Confirm current stable Zod v4 API surface before pinning (caret-on-current-stable per project-context version policy).
  - [x] Establish the schema file layout under `packages/domain/src/`. **Naming: non-component TS files are camelCase, never dotted** (project-context, decision 2026-07-16) — use `organismSchema.ts`, `battleSchema.ts`, `survivalRuleSchema.ts`, **not** `organism.schema.ts` / `battle.schema.ts`. RFC-001's and RFC-004's code snippets use the dotted form (`schemas/battle.schema.ts`) — that is illustrative and stale; project-context's naming rule wins (it says so explicitly).
  - [x] Replace the `src/index.ts` placeholder export (`GOL_DOMAIN`) with the real schema/type exports — remove the placeholder, don't leave it alongside real exports.

- [x] **Task 2: `SurvivalRuleSchema` / `ConditionSchema` / `SurvivalRulesSchema`** (AC: 2)
  - [x] Port the Zod schemas from RFC-004 §2.4 verbatim (they are the cited source of truth, not illustrative): `NumericLiteral = z.number().int().min(0).max(65534)`, `NumericPattern` (scalar or `[min,max]` tuple), `NumericCondition` (properties `age` | `neighborCount` | `occupantNeighborCount`, operators `eq|gt|lt|gte|lte|range`) with a `.refine` that `range` requires a tuple and other operators require a scalar, `CellStateCondition` (`property: 'cellState'`, pattern `empty|alive|occupied`), `OrganismTypeCondition` (`property: 'organismType'`, pattern = target's stable library id string — Decision E.1, never a numeric ref), `ConditionSchema` as a `discriminatedUnion('property', […])` of the three.
  - [x] **Do not tighten `neighborCount`/`occupantNeighborCount` below 0–65534 at the schema level.** RFC-004's own comment: "Property-specific tightening (neighbour counts are really 0–8) is editor-level UX, not schema." A dev agent's instinct to add a realistic 0–8 bound here is wrong — that belongs to the Epic 4 Organism Editor form validation, not this schema.
  - [x] `SurvivalPayloadSchema` (`summary: z.string().max(120)`, `action: 'born'|'survive'|'die'`), `SurvivalRuleSchema` (`id: z.string()`, `contentHash: z.string()`, `conditions: z.array(ConditionSchema).min(1)`, `payload`), `SurvivalRulesSchema = z.array(SurvivalRuleSchema)`.
  - [x] **`id` and `contentHash` are validated as opaque strings only — this story does not implement generation.** No `nanoid`, no hashing library, no `crypto` import. Real id/hash *generation* happens where organisms are actually authored (Epic 4's Organism Editor save flow) or where the engine first needs a cache key (Epic 3). Test fixtures use literal strings (e.g. `id: 'test-rule-1'`, `contentHash: 'test-hash-1'`) — the schema doesn't validate hash correctness, only that it's a string.

- [x] **Task 3: `OrganismSchema` and `EditableGridPresetSchema`** (AC: 1, 3)
  - [x] `OrganismSchema`: `schemaVersion: z.number().int()` (write-time stamp, never branched on — Decision I.4), `id: z.string()` — **plain string, NOT `.uuid()`**, unlike `Battle.id`. The protected default organism (FR-1.5, seeded in Story 1.5) uses a stable well-known id like `'conways-classic'`, not a UUID; constraining `Organism.id` to `.uuid()` would reject it. `name: z.string().max(50)`, `colorToken: z.string()` (opaque token string — **do not** validate against the palette registry; it doesn't exist until Story 1.7), `dominance: z.number().int().min(1).max(100)`, `agingEnabled: z.boolean()`, `survivalRules: SurvivalRulesSchema`.
  - [x] `EditableGridPresetSchema = z.union([{cols:50,rows:30}, {cols:100,rows:60}])` using `z.literal` on each field (RFC-001, Decision G.1) — single-sourced here; RFC-006's export envelope reuses it in a later story, don't duplicate it there.
  - [x] Export both `type Organism = z.infer<typeof OrganismSchema>` and the schema itself.

- [x] **Task 4: `BattleSchema` with structural superRefines** (AC: 3, 4)
  - [x] `BattleSchema`: `id: z.string().uuid()`, `name: z.string().max(100)`, `organismIds: z.array(z.string()).max(255)` (Decision G.3 — the dense `Uint8Array` occupant cap; the workspace library itself stays uncapped, don't confuse the two), `gridSize: EditableGridPresetSchema`, `gridState: z.array(z.array(z.number().int().min(0).max(255)))`, `createdAt: z.date()`, `updatedAt: z.date()`.
  - [x] `superRefine` with three checks (Decision G.2 / H.1 — implement all three, they are independent invariants each needing its own rejection test per AC5):
    1. `gridState.length === gridSize.rows && gridState.every(row => row.length === gridSize.cols)` — dimensions must match.
    2. Every cell value `v` satisfies `v <= organismIds.length` (0 = empty, `v` indexes `organismIds[v-1]`) — cell values must index into the roster.
    3. `organismIds` is **exactly** the placed set: every index `i` in `organismIds` has at least one cell with value `i+1` somewhere in `gridState` (Decision H.1 — no unplaced roster members at rest). Build the placed-value set once (`new Set(gridState.flat().filter(v => v > 0))`) and check every roster index is present in it — don't recompute per-index.
  - [x] Export `type Battle = z.infer<typeof BattleSchema>`.

- [x] **Task 5: Unit tests — one valid fixture + one rejection test per invariant, per entity** (AC: 5)
  - [x] `OrganismSchema`: one valid fixture; rejection tests for name > 50, dominance 0 / 101 / non-integer, missing/invalid `colorToken` type.
  - [x] `SurvivalRuleSchema`/`ConditionSchema`: one valid fixture per condition property (cellState, organismType, age, neighborCount, occupantNeighborCount) and per operand family (scalar ops + `range`); rejection tests for: age/neighborCount literal > 65534, `range` given a scalar pattern, a non-`range` operator given a tuple pattern, unknown `property`/`operator`/`pattern` enum values, empty `conditions` array.
  - [x] `BattleSchema`: one valid fixture; one rejection test per superRefine check — mismatched `gridState` dimensions vs `gridSize`, a cell value exceeding `organismIds.length`, an `organismIds` entry with zero placed cells (unplaced roster member) — plus `organismIds.length` > 255 and an invalid `gridSize` (not one of the two literal presets).
  - [x] Use Vitest (`packages/domain` already has `vitest.config.ts` from Story 1.2 — `passWithNoTests: true` was there only because there were no tests yet; this story is what removes that vacuous-green state for `@gol/domain`). No `@gol/test-utils` fixtures yet (that package is a placeholder until Story 1.6) — write fixtures inline in the test files for this story.

- [x] **Task 6: Verify** (AC: 1–5)
  - [x] `npm run typecheck` and `npm run test` (or scoped `-w @gol/domain`) both green; confirm `@gol/domain`'s tests are no longer running under `passWithNoTests` (i.e. real tests execute — check the Vitest summary line, don't just check exit code).
  - [x] `npm run lint` clean (no DOM-lib leakage, no raw hex — N/A here since this package has no `.tsx`, but confirm no accidental `dom` lib addition to `packages/domain/tsconfig.json`).
  - [x] Run `npm run ci` before calling the story done (full local gate — project-context "Verification before claiming done").

### Review Findings

_Code review 2026-08-03 — three layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 3 decision-needed, 10 patch, 5 deferred, 8 dismissed as noise. All 3 decisions resolved by Sidiar and all 10 patches applied the same day; `npm run ci` green afterwards (exit 0). The 5 deferrals are recorded in `deferred-work.md`._

_The schema port itself was audited clean: the Acceptance Auditor diffed every field, bound, operator, enum member, refine expression and superRefine body against RFC-001 §3 and RFC-004 §2.4 and found no drift, and confirmed the story's scope boundaries were held exactly. The findings below are about invariants the RFCs did not specify, and about tests that did not test what they were named after._

- [x] [Review][Decision] **`createdAt`/`updatedAt` are `z.date()`, so no persisted Battle can ever be validated** — `BattleSchema.safeParse(JSON.parse(JSON.stringify(battle)))` fails with `invalid_type@createdAt|updatedAt` (verified against Zod 4.4.3). Story 1.4's first load will reject every battle it wrote. RFC-001 §3's own load snippet (`BattleSchema.transform(d => ({...d, createdAt: new Date(d.createdAt)})).parse(...)`) is impossible in Zod — transforms run *after* validation — and RFC-006 uses `z.string().datetime()` for the same two fields. This is a **new cross-RFC conflict** (RFC-001 vs RFC-006), surfaced per project-context's "flag new conflicts" rule rather than silently picked. Options: (a) schema takes ISO strings (`z.iso.datetime()`) and hydrates to `Date` via `.transform()` — aligns with RFC-006; (b) schema keeps `z.date()` and Story 1.4 hydrates before parsing — leaves the hydration seam unvalidated; (c) `z.union([z.date(), z.iso.datetime().transform(s => new Date(s))])` — accepts both. The tests miss it because `validBattle()` hands the schema live `Date` objects that never touched JSON. [packages/domain/src/battleSchema.ts:13-14] — **Resolved (Sidiar, option a):** `const IsoTimestamp = z.iso.datetime().transform((s) => new Date(s))`. `Battle` (the `z.infer` output) still carries `Date`s; the parse *input* is the JSON shape, reachable as `z.input<typeof BattleSchema>`. Two regression tests added: `'hydrates ISO timestamps into Date objects'` and `'survives a JSON round-trip of its own parsed output'`. **RFC-001 §3's load snippet needs correcting** — it is unimplementable as written; flagged for whoever picks up Story 1.4.
- [x] [Review][Decision] **AC1's "`colorToken` (not raw hex)" is not mechanically enforced by anything** — `colorToken: z.string()` accepts `'#ff0000'`. Dev Notes deliberately defer palette validation to Story 1.7, and the AR-46 no-raw-hex lint rule only covers `apps/web`, so between now and 1.7 nothing enforces the second half of AC1. Options: accept the documented gap, or add a minimal negative guard (`.refine(t => !t.startsWith('#'))`) now. [packages/domain/src/organismSchema.ts:14] — **Resolved (Sidiar): guard added**, alongside `.min(1)`, citing AR-46. Story 1.7 replaces it with the real palette-registry check.
- [x] [Review][Decision] **`.claude/settings.local.json` allowlist additions exceed the story and are absent from its File List** — commit `1359b16` ("commands used during Story 1.3") adds `Bash(git push *)`, `Bash(gh auth *)`, `Bash(ssh … git@github.com)` and `Read(//Users/sidiar/**)`. Nothing in Story 1.3 pushes, authenticates to GitHub, or reads outside the repo; project-context states the repo is local-only with no remote and carries a hard commit gate. Sidiar's call whether to keep or strip these entries. [.claude/settings.local.json] — **Resolved (Sidiar): all four stripped** (`gh auth`, `ssh git@github.com`, `git push`, `Read(//Users/sidiar/**)`).
- [x] [Review][Patch] Four of six `BattleSchema` tests pass for the wrong reason — each also trips the H.1 placed-set check, so the invariant each is named after can be deleted and the suite stays green; no test inspects `error.issues` [packages/domain/src/battleSchema.test.ts:32,39,47,53]
- [x] [Review][Patch] `range` accepts an inverted tuple — `{property:'age',operator:'range',pattern:[3,2]}` parses; the refine checks tuple-ness only, never `min <= max`, yielding a silently unsatisfiable rule [packages/domain/src/survivalRuleSchema.ts:15-17]
- [x] [Review][Patch] `organismIds` accepts duplicates — `['a','a']` with cells `1` and `2` passes all three superRefines, contradicting Decision H.1's "placed **set**" and giving the AR-15 usage index a double count [packages/domain/src/battleSchema.ts:10]
- [x] [Review][Patch] Identifier and token strings accept `''` — no `.min(1)` on `Organism.id`, `Organism.colorToken`, `SurvivalRule.id`, `SurvivalRule.contentHash`, `OrganismTypeCondition.pattern`, or `organismIds` elements; `contentHash: ''` collides across every rule in a hash-keyed engine cache (display names left alone — an empty draft name is Epic 2/4 UI policy) [packages/domain/src/organismSchema.ts:10,14; survivalRuleSchema.ts:31,49,50; battleSchema.ts:10]
- [x] [Review][Patch] `z.string().uuid()` is deprecated in Zod v4 — `node_modules/zod/v4/classic/schemas.d.cts:120` marks it `@deprecated Use z.uuid() instead`; the `^4.4.3` caret will pull the minor that removes it [packages/domain/src/battleSchema.ts:6]
- [x] [Review][Patch] `schemaVersion` accepts `0` and negatives — `.int()` with no `.min(1)`, so the Decision I.4 stamp the RFC-006 migration chain asserts at load can start negative [packages/domain/src/organismSchema.ts:7]
- [x] [Review][Patch] All three superRefine issues carry `path: []` — every structural error lands at the root, so a consumer can only tell them apart by substring-matching the English message [packages/domain/src/battleSchema.ts:22,25-28,34-38]
- [x] [Review][Patch] Missing AC5 rejection tests — `Battle.name` ≤ 100, `Battle.id` uuid, `gridState` cell bound 0–255, `schemaVersion` integer, `agingEnabled` boolean, `SurvivalPayloadSchema` (`summary` ≤ 120, `action` enum) all have no rejection test; AC2's "all six operands" tests only `eq`/`gte`/`range` (never `gt`/`lt`/`lte`); `SurvivalRulesSchema` and the `Organism`↔`SurvivalRule` composition are never exercised [packages/domain/src/*.test.ts]
- [x] [Review][Patch] Vacuous duplicate test and an untested "missing" case — `'accepts a non-uuid stable well-known id'` re-sets `id` to the value the fixture already has, so it cannot fail independently of the preceding test; `'rejects a missing/invalid colorToken type'` only tests `colorToken: 42`, never the omitted key [packages/domain/src/organismSchema.test.ts:24,45]
- [x] [Review][Patch] Three stubs dropped the `@gol/domain` import instead of repointing it — Story 1.1 built those cross-imports as the build-time proof that the workspace graph, JIT source exports, and `transpilePackages` all resolve; `package.json` still declares `"@gol/domain": "*"`, so the edge is now declared but never compiled. `apps/web` was repointed to a real export; these three were not [packages/{persistence,simulation,test-utils}/src/index.ts]
- [x] [Review][Patch] Tautological wiring proof with a dead branch and a comment that misstates it — `OrganismSchema ? '@gol/domain' : ''` is statically always-truthy, the `''` branch is unreachable, and the rendered string is a literal owned by `apps/web`, so `page.test.tsx`'s assertion passes for any truthy export (the test comment's "derived from the real `OrganismSchema` export" is not what the code does) [apps/web/app/page.tsx:9]
- [x] [Review][Defer] `Battle` carries no `schemaVersion` stamp while `Organism` does [packages/domain/src/battleSchema.ts] — deferred, matches RFC-001 as written; revisit with the Story 5.7 migration registry
- [x] [Review][Defer] Duplicate rule `id`/`contentHash` within one `survivalRules` array are accepted [packages/domain/src/survivalRuleSchema.ts:55] — deferred, pre-existing; the hash-keyed evaluator cache that would collide lands in Epic 3
- [x] [Review][Defer] Unknown keys are stripped, not rejected, so persisted records round-trip lossily [packages/domain/src/*.ts] — deferred, pre-existing Zod default; the strict-vs-strip posture belongs with Story 1.4 load and Story 5.7/5.8 corruption handling
- [x] [Review][Defer] `updatedAt` earlier than `createdAt` is accepted [packages/domain/src/battleSchema.ts:13-14] — deferred, pre-existing; the Gallery sorts by `updatedAt`, so a corrupted record sorts oldest with no signal
- [x] [Review][Defer] `.max()` counts UTF-16 code units, not characters — 26 emoji exceed the 50-"char" name limit [packages/domain/src/organismSchema.ts:11] — deferred, matches RFC-001; the Epic 4 editor's character counter will need to agree

**Dismissed as noise (8):** `gridState` typed `number[][]` rather than `Uint8Array` (the persisted form is JSON; the comment cites the cap's origin, not the runtime type) · the placed-set invariant "breaks mid-edit autosave" (Decision H.1 prunes at save) · `.refine` inside `discriminatedUnion` crashing under Zod 3 (pinned `^4.4.3`) · `zod` as a dependency rather than a peer, and `dependencies` ordered after `devDependencies` (npm workspaces hoists one copy; no package.json sorter installed) · `gridSize` duplicating `gridState` dimensions (RFC-001 design) · `superRefine` skipped when the base parse fails (documented Zod semantics, no crash) · `neighborCount` not tightened to 0–8 (Task 2 explicitly forbids it) · contradictory conditions and `survivalRules: []` accepted (Story 4.10's rule-cards empty state implies zero rules is a valid authoring state).

## Dev Notes

### Constraints the developer MUST follow

- **Scope: `@gol/domain` schemas only.** No repository code (Story 1.4), no seeding (1.5), no test-utils fixtures (1.6), no palette registry (1.7), no rules-engine runtime logic (`Condition<P>`/`Rule<P>`/`RuleSet<P>` generic types, `firstSatisfiedBy`, evaluators — Story 3.1+). This story produces **Zod validation schemas and their inferred types only**.
- **No classes, no DOM types, no `this`.** `packages/domain`'s `tsconfig.json` extends `tsconfig.base.json` (`lib: ["ES2022"]`, no DOM) — this is compiler-enforced, don't add `"dom"` to the package's own tsconfig. Schemas and helper functions are plain objects/functions.
- **Strict TS, ESM, no escape hatches.** No `any`, no `@ts-ignore`, no non-null `!`. `isolatedModules: true` is repo-wide — re-export types with `export type { X }`.
- **`schemaVersion` and future `formatVersion`/`PALETTE_VERSION` are stamps, never branch points (Decision I.4).** Don't write any conditional logic keyed on `schemaVersion` in this story — there is exactly one migration pipeline and it doesn't exist until Story 5.7. `OrganismSchema.schemaVersion` is just `z.number().int()`.
- **`organismType` condition patterns store the target's stable *library id* (string) — never a numeric `OrganismRef`** (Decision E.1). This is the single easiest invariant in this story to get backwards; get it right here and Epic 3's evaluator-compilation step (which interns ids to refs) has nothing to fix later.
- **Version policy: caret-on-current-stable, confirm Zod's current stable at install time** — don't blindly copy a version number from an RFC snippet if a newer stable exists; don't chase bleeding-edge either.

### Scope-boundary flag: RFC-001's package layout sketch conflicts with the epics' actual placement — surfaced per project-context's "flag new conflicts" rule

RFC-001's illustrative directory tree puts `rules-engine/` **under** `packages/domain/`. But Epic 3 Story 3.1's AC is explicit: *"Given `packages/simulation`, When the core is implemented, Then it provides generic `Condition`/`Rule`/`RuleSet` types…"* — the **generic, domain-agnostic rules-engine logic** (the `Condition<P>`/`Rule<P>`/`RuleSet<P>` TypeScript interfaces, `firstSatisfiedBy`) lives in `packages/simulation`, not `packages/domain`. This story is unaffected in scope (it only needs the **Zod schemas** — `ConditionSchema`, `SurvivalRuleSchema`, `SurvivalRulesSchema` — which are the *persisted GoL-specific shape*, explicitly assigned to `@gol/domain` by this story's own AC1/AC2 wrapper "Given `@gol/domain`, When schemas are defined…"), but don't let RFC-001's stale directory sketch pull the generic engine types into `packages/domain` now — they don't exist until Story 3.1, in `packages/simulation`. The concrete Zod-inferred `SurvivalRule` type structurally satisfies the generic `Rule<P>` shape by construction (`{ id, contentHash, conditions, payload }` — same fields), so Story 3.1 needs no changes to this story's output to consume it.

### Previous story intelligence (1.1, 1.2)

- **JIT source packages, no build step.** `@gol/domain` exports `./src/index.ts` directly (`"exports": "./src/index.ts"` in its `package.json`); `apps/web` compiles it via `transpilePackages`. Don't add a `dist/` or emit step.
- **Turbo `typecheck`/`test` tasks carry no `^build`** — Vitest and `tsc --noEmit` read workspace source directly (Story 1.2 fixed this after Story 1.1 rode `^build` and ran zero real tests). Nothing to change here, just don't reintroduce a `^build` dependency.
- **The "vacuously green" trap applies to this exact package.** `packages/domain/vitest.config.ts` currently has `passWithNoTests: true` because there is no source yet — that's *why* the AC5 unit tests matter: after this story, `@gol/domain`'s `test` script must show real Vitest output (assertions run), not the "No test files found, exiting with code 0" message Story 1.2 saw for every `packages/*` workspace.
- **Coverage gate is not enforced yet** (flips Story 3.7) — write the AC5 tests for correctness and invariant coverage, not to chase a coverage percentage. Don't add tests whose only purpose is raising a number nobody is gating on yet.
- **Comment convention (1.1/1.2):** every non-obvious line carries a WHY comment citing the failure it prevents or the decision it encodes (e.g. cite `(Decision H.1)`, `(AR-20)`) — established in `eslint.config.mjs`/`turbo.json` from Story 1.2, continue it in the schema files.
- **Commit gate stands:** never stage/commit without Sidiar's explicit go-ahead, even after `npm run ci` is green.

### What NOT to build (scope boundaries)

- ❌ **Id/contentHash generation** (`nanoid`, hashing) — not this story (see Task 2). Test fixtures use literal strings.
- ❌ **Palette registry / colorToken validation against real tokens** — Story 1.7. `colorToken` is `z.string()` here, nothing more.
- ❌ **Generic rules-engine runtime** (`Condition<P>`, `firstSatisfiedBy`, evaluators, `packages/simulation`) — Story 3.1+.
- ❌ **`WorkspaceExportSchema` / migration registry / `formatVersion` branching** — Stories 1.4 (repositories) and 5.7 (migration registry). This story's schemas are consumed by that machinery later; don't build the machinery now.
- ❌ **Repository interfaces, localStorage read/write** — Story 1.4.
- ❌ **`@gol/test-utils` canonical fixtures** — Story 1.6. This story's own tests are self-contained.

### Project Structure Notes

Indicative — exact file split within `packages/domain/src/` is a judgment call, but names must be camelCase (see Task 1):

```
packages/domain/src/
  organismSchema.ts        OrganismSchema, EditableGridPresetSchema, inferred types
  battleSchema.ts           BattleSchema + superRefine, inferred types
  survivalRuleSchema.ts     ConditionSchema (+ its three variants), SurvivalRuleSchema, SurvivalRulesSchema
  index.ts                  re-exports (replaces the Story 1.1 placeholder)
```

Corresponding test files beside each (`packages/domain/src/*.test.ts`, or under a `src/__tests__/` folder — match whatever pattern `apps/web/app/page.test.tsx` (co-located) established in Story 1.2; this repo hasn't used a separate `__tests__` folder yet, prefer co-located `*.test.ts`).

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.3] — story statement + ACs (AR-7, AR-20, AR-21)
- [Source: docs/planning-artifacts/epics.md#Requirements Inventory / Architecture Requirements] — AR-7 (Zod schemas as source of truth), AR-8 (stable ids at rest, Decision E), AR-20 (Cell State three-valued/relative + age saturation), AR-21 (rule identity: id + contentHash)
- [Source: docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md#3. Data Model Layer Design] — `OrganismSchema`, `EditableGridPresetSchema`, `BattleSchema` + superRefine (the canonical Zod source for these three; the file-naming in this snippet, `schemas/battle.schema.ts`, is stale — project-context's camelCase-non-dotted rule overrides it)
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#2.4 Persistence] — `SurvivalRuleSchema`, `ConditionSchema` (`NumericCondition`/`CellStateCondition`/`OrganismTypeCondition`), `SurvivalPayloadSchema`, the id-vs-contentHash rationale, the "property-specific tightening is editor UX not schema" note
- [Source: docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md#Part 3, Story 3.1 boundary] — generic rules-engine types live in `packages/simulation`, not here (scope-boundary flag above)
- [Source: docs/planning-artifacts/architecture.md#Decision E — Stable organism ids at rest] — E.1 (rule patterns persist library id, never a numeric ref)
- [Source: docs/planning-artifacts/architecture.md#Decision G — Persistence schemas enforce the architecture's own invariants] — G.1 (literal grid presets), G.2 (structural superRefine invariants), G.3 (255 cap, stated and enforced)
- [Source: docs/planning-artifacts/architecture.md#Decision H — "Used by a battle" means placed on its grid] — H.1 (`organismIds` ≡ placed set, the third superRefine check)
- [Source: docs/planning-artifacts/architecture.md#Decision I — One migration pipeline] — I.4 (`schemaVersion` is a stamp, never a switch — don't branch on it in this story)
- [Source: docs/project-context.md#Language-Specific Rules / Naming] — no DOM types in `packages/*`; non-component TS files are camelCase, never dotted
- [Source: docs/implementation-artifacts/1-2-ci-pipeline-quality-gates.md] — Vitest/coverage infra already wired per-package; `passWithNoTests` context; comment-convention precedent
- [Source: docs/implementation-artifacts/deferred-work.md] — open item `@gol/persistence` has no DOM lib (Story 1.4's concern, not this story's)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5) via Claude Code

### Debug Log References

All commands from repo root, Node 24.16.0 / npm 11.13.0, 2026-08-03:

- **Zod install** — `npm install zod@^4.4.3 -w @gol/domain` → added as a runtime `dependencies` entry (not root devDeps), confirming current stable is 4.4.3.
- **API-surface probe before porting RFC snippets** — a throwaway script (run from inside `packages/domain` so Node resolves the workspace-hoisted package) confirmed Zod 4.4.3's `discriminatedUnion('property', [...])` accepts a member (`NumericCondition`) wrapped in `.refine(...)`, and `.superRefine((v, ctx) => ctx.addIssue({ code: 'custom', message }))` behaves exactly as the RFC-001/RFC-004 snippets assume. No API adjustments were needed; the RFC snippets were portable verbatim.
- **`npm run typecheck -w @gol/domain`** → green after each schema file landed.
- **`npm run test -w @gol/domain`** (via `turbo run test --filter=@gol/domain`) → 3 test files, 30 tests passed — confirms `@gol/domain` is no longer running under `passWithNoTests` (real Vitest summary line, not "No test files found").
- **`npm run lint`** (repo-wide) → clean.
- **`npm run ci`** (full local gate: typecheck → lint → format:check → test:coverage → build:standalone → bundle:check → e2e):
  - First run failed `format:check` (Prettier) on `battleSchema.ts` and `survivalRuleSchema.test.ts` → `npx prettier --write` on both, re-ran clean.
  - Second run failed `build:standalone` in `@gol/persistence` and `@gol/simulation`: their Story-1.1 placeholder `src/index.ts` stubs imported the now-removed `GOL_DOMAIN` placeholder constant from `@gol/domain` purely as a cross-package wiring smoke test. Fixed by dropping the cross-import in `packages/persistence/src/index.ts`, `packages/simulation/src/index.ts`, and `packages/test-utils/src/index.ts` (same pattern) — real integration lands in their own stories (1.4, Epic 3, 1.6) rather than being propped up by a placeholder that no longer exists.
  - `apps/web/app/page.tsx` also imported `GOL_DOMAIN` to render "wired to @gol/domain" as a Story 1.1 toolchain wiring proof, asserted on by `apps/web/app/page.test.tsx`. Swapped the import to the real `OrganismSchema` export (`const DOMAIN_PACKAGE_NAME = OrganismSchema ? '@gol/domain' : ''`) so the rendered text and existing test assertion are unchanged, while still proving the workspace-source resolution the comment claims.
  - Final run: **exit 0** — typecheck (5/5 packages), lint clean, format clean, `@gol/domain` coverage 100% stmts/branch/func/line across all three new schema files, `web` build + 180.9 KB gzip bundle (within 300 KB budget), Playwright e2e 8/8 passed.

### Completion Notes List

- **All three schemas ported from the cited RFC sources, not re-derived.** `ConditionSchema`/`SurvivalRuleSchema`/`SurvivalRulesSchema` from RFC-004 §2.4; `OrganismSchema`/`EditableGridPresetSchema`/`BattleSchema` (+ its `superRefine`) from RFC-001 §3. Verified against Zod 4.4.3 before writing — no API drift found, ported verbatim in substance (only cosmetic multi-line formatting from Prettier).
- **Scope held exactly to Zod schemas + inferred types.** No id/contentHash generation, no palette-registry validation, no generic rules-engine types, no repository/persistence code, no `@gol/test-utils` fixtures — all confirmed absent from the diff.
- **`organismType` condition pattern is `z.string()`** (stable library id), never a numeric ref — get-it-right-once per Dev Notes; covered by an explicit "library id string" test case.
- **`Organism.id` is a plain `z.string()`**, not `.uuid()`; `Battle.id` is `z.string().uuid()`. Covered implicitly by fixtures using a non-UUID organism id (`'conways-classic'`) and a UUID battle id.
- **Unplanned but necessary fix:** removing `@gol/domain`'s Story-1.1 placeholder export (`GOL_DOMAIN`) broke three other packages' placeholder wiring stubs (`@gol/persistence`, `@gol/simulation`, `@gol/test-utils`) and the `apps/web` home page + its test, all of which imported that placeholder purely to prove workspace-source resolution. Fixed minimally: the three package stubs dropped the now-pointless cross-import (their real domain usage lands in later stories); the web page was repointed to the real `OrganismSchema` export so its rendered text and existing test assertion are unchanged. This was a direct, unavoidable consequence of Task 1's explicit instruction to remove the placeholder rather than leave it alongside real exports — flagging it here since it touched files outside `packages/domain`.
- **Coverage:** `@gol/domain` now at 100% stmts/branch/func/line (not a target chased — a byproduct of one valid fixture + one rejection test per invariant per AC5). The >=90% gate itself still doesn't flip on until Story 3.7.
- **`npm run ci` green** including e2e (8/8) and bundle budget (180.9 KB gzip vs 300 KB) — both incidentally re-verified, not story scope, but confirms nothing broke web-side beyond the wiring-proof fix above.

### File List

New:

- packages/domain/src/organismSchema.ts
- packages/domain/src/organismSchema.test.ts
- packages/domain/src/battleSchema.ts
- packages/domain/src/battleSchema.test.ts
- packages/domain/src/survivalRuleSchema.ts
- packages/domain/src/survivalRuleSchema.test.ts

Modified:

- packages/domain/package.json (`zod` added as a runtime dependency)
- package-lock.json
- packages/domain/src/index.ts (placeholder `GOL_DOMAIN` export replaced with real schema/type re-exports)
- packages/persistence/src/index.ts (dropped now-broken placeholder cross-import of `GOL_DOMAIN`)
- packages/simulation/src/index.ts (dropped now-broken placeholder cross-import of `GOL_DOMAIN`)
- packages/test-utils/src/index.ts (dropped now-broken placeholder cross-import of `GOL_DOMAIN`)
- apps/web/app/page.tsx (wiring-proof text now derived from real `OrganismSchema` export instead of the removed `GOL_DOMAIN` placeholder)
- apps/web/app/page.test.tsx (comment updated to match; assertions unchanged)
- docs/implementation-artifacts/sprint-status.yaml (status transitions)
- docs/implementation-artifacts/1-3-domain-entities-zod-schemas.md (this story — tracking)

## Change Log

- 2026-08-03: Story 1.3 implemented — Zod v4.4.3 wired into `@gol/domain` as a runtime dependency; `ConditionSchema`/`SurvivalRuleSchema`/`SurvivalRulesSchema` (RFC-004 §2.4) and `OrganismSchema`/`EditableGridPresetSchema`/`BattleSchema` + its three-invariant `superRefine` (RFC-001 §3) ported verbatim against a confirmed-compatible Zod API. 30 unit tests (one valid fixture + one rejection per invariant per entity, per AC5) — 100% stmts/branch/func/line on the three new schema files. Fixed an unavoidable knock-on: removing the Story 1.1 `GOL_DOMAIN` placeholder broke three other packages' wiring-proof stubs (`@gol/persistence`, `@gol/simulation`, `@gol/test-utils`) and the `apps/web` home page + its test — all repointed off the placeholder (see Completion Notes). Verified: `npm run ci` exit 0 (typecheck, lint, format, coverage, build, bundle budget, e2e 8/8). Status → review.
- 2026-08-03: Code review (3 layers) — schema port audited clean against RFC-001 §3 / RFC-004 §2.4, no drift. 13 fixes applied: timestamps moved from `z.date()` to `z.iso.datetime()` + transform (persisted battles were unvalidatable, and RFC-001's load snippet is unimplementable as written); `z.string().uuid()` → `z.uuid()`; inverted `range` tuples, duplicate `organismIds`, and empty identifier strings now rejected; `schemaVersion` floored at 1; a raw-hex guard on `colorToken` (AR-46); `path` added to all four `superRefine` issues. Test suite rebuilt around isolating fixtures that assert on `error.issues` — four rejection tests previously passed by tripping the H.1 placed-set check as a side effect, so the invariants they named could be deleted with the suite green. Mutation-verified: removing any one of the four structural checks or the 255 cap now fails exactly its own test and nothing else. The three sibling stubs were repointed onto real `@gol/domain` exports rather than left importing nothing, restoring Story 1.1's workspace-graph build proof; the `apps/web` wiring proof now reads a field off `OrganismSchema` instead of a tautological truthiness check. 63 tests (was 30), 100% across the three schema files, `npm run ci` exit 0. Status → done.
