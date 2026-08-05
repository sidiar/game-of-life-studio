---
project_name: 'GameOfLife'
user_name: 'Sidiar'
date: '2026-07-16'
sections_completed:
  [
    'technology_stack',
    'language_rules',
    'framework_rules',
    'testing_rules',
    'quality_rules',
    'workflow_rules',
    'critical_rules'
  ]
status: 'complete'
rule_count: 78
optimized_for_llm: true
existing_patterns_found: 14
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

**Runtime:** Node 24 (`.nvmrc`) · npm 11.13.0 workspaces · Turborepo 2.10.5.
`.npmrc` sets `engine-strict=true` — installs **fail** on Node < 24, they don't warn.

**Core:** TypeScript 5.9.3 (strict) · Next.js 16.2.10 (App Router) · React 19.2.7

**Workspaces:** `apps/web` + `@gol/{domain,simulation,persistence,test-utils}`

**Planned, NOT yet installed** — do not import these until their story lands. Versions
are the architecture's floor; confirm the current stable at install time.

| Tech | Purpose | Lands in |
|---|---|---|
| Zod | shared schemas | Story 1.3 |
| MUI v6 + Emotion | all UI chrome | Epic 2 |

The test/lint toolchain (Vitest + RTL, Playwright, fast-check, axe-core, ESLint 9, Prettier)
is **installed** as of Story 1.2 — see Testing / Code Quality rules below.

**`build` means `tsc --noEmit`.** The `@gol/*` packages are just-in-time: they export
TS source directly (`"exports": "./src/index.ts"`) and `apps/web` compiles them via
`transpilePackages`. There is no `dist/`, no emit step, no bundling per package.
Do not add one.

**Version policy:** caret-on-current-stable. The goal is a reproducible fresh-clone
build, not latest. Do not bump versions opportunistically.

## Critical Implementation Rules

### Language-Specific Rules

- **Strict TS, no escape hatches.** `strict: true` repo-wide. No `any`, no `@ts-ignore`,
  no non-null `!` to silence a checker complaint — fix the type.
- **No DOM types in `packages/*`.** `tsconfig.base.json` is `lib: ["ES2022"]`; only
  `apps/web` adds `dom`. This is deliberate — it makes "the engine is pure" a
  compiler-enforced fact, not a convention.
  - `packages/persistence` needs `localStorage` → it adds `"lib": ["ES2022", "DOM"]`
    to its **own** tsconfig. Never add `dom` to `tsconfig.base.json`; never
    `declare const localStorage`.
  - If `domain` / `simulation` appear to need a DOM type, that is the design telling
    you the code is in the wrong package.
- **`isolatedModules: true`** — re-export types with `export type { X }`. A bare
  `export { SomeType }` fails to compile.
- **ESM everywhere.** All `@gol/*` are `"type": "module"`. No `require`, no
  `module.exports`, no default-export barrels.
- **Cross-package imports use the package name** (`@gol/domain`), never a relative path
  (`../../packages/domain/src`). `@/*` resolves inside `apps/web` only.
- **Zod parses at boundaries, not everywhere.** Validate at persistence load and file
  import; inside the engine types are already proven — never re-parse per cell.

### Framework-Specific Rules

**Next.js — static export, no server**

- `output: 'export'` in standalone. There is **no backend in the MVP**. Never add an API
  route, a server action, `next/headers`, `cookies()`, or any dynamic SSR. If a feature
  seems to need a server, it belongs to Connected mode (post-MVP).
- **Only `apps/web/lib/mode.ts` may read `process.env.NEXT_PUBLIC_MODE`.** `NEXT_PUBLIC_*`
  is string-inlined at build time and **only direct property access is replaced** —
  `process.env[name]` or destructuring yields `undefined` in the browser bundle.
  Import `APP_MODE` instead.
- `next.config.mjs` and `lib/mode.ts` must default identically (`'standalone'`).
  Divergence produces a build that claims one mode and emits another.

**Repositories are injected — never imported (AR-2/27)**

- The dual-mode seam is the entire reason `@gol/persistence` exists, and it is enforced
  by discipline alone: a direct import typechecks, passes tests, and silently welds the
  app to localStorage forever. This is the easiest rule here to break and the most
  expensive to unwind.
- A component or hook must **never** import a concrete repository
  (`LocalStorageBattleRepository`) or call `createRepositories()` itself. It receives
  repositories as **props/params**, typed as the interface (`BattleRepository`), and
  knows nothing about the implementation.
- `createRepositories()` is called **once, at the page boundary**, and the result is
  passed down. No global store, no repository Context, no module-level singleton.
- The factory reads the mode via `import { APP_MODE } from '@/lib/mode'` — **not**
  `process.env.NEXT_PUBLIC_MODE`. RFC-001's snippet showing a direct `process.env` read
  is illustrative and stale; `lib/mode.ts` is the single read-point (Story 1.1).
- **Test:** if swapping to an API-backed repo would require editing a component, the
  seam is already broken.

**React — three state categories, no global store**

- Never add Redux / Zustand / Jotai / Context-as-store. State goes to exactly one of:
  - **persisted** → injected repositories
  - **ephemeral UI** → local `useState`
  - **hot simulation** → `useRef`
- **Hot simulation state never touches React state.** The live grid, age buffers, and RAF
  loop live in refs. A `setState` per cycle destroys the 60 FPS budget (NFR-1.1). Only
  `cycle` (int) and the population summary publish to React, throttled to ≤10 Hz.
- **Modes are state, not routes.** Edit/Play are local state within `<BattlePage>`, not URL
  segments. App Router file-based routing is canonical; RFC-005's `<Routes>` snippets are
  illustrative only.

**MUI — one immutable theme (Decision J)**

- **Exactly one `createTheme()`**, referencing only `var(--gol-*)` strings. A theme switch
  is a `data-theme` flip on `<html>`. Never build two theme objects and swap which one
  `ThemeProvider` receives — that re-renders the tree through Emotion, the exact cost the
  CSS-variable design exists to avoid.
- No JS colour math on theme values — derived shades are their own tokens
  (e.g. `--gol-accent-hover`). `palette.mode` is constant `'dark'`.
- Don't use MUI's `colorSchemes` / `applyStyles('dark')` — both themes are dark and differ
  in typography and radius, not just palette.
- **The Canvas grid is drawn outside MUI.** Never wrap cells in MUI components.

### Testing Rules

**Current state:** Vitest (+ v8 coverage), RTL, and Playwright are installed (Story 1.2).
The coverage gate flips on in **Story 3.7** — the v8 provider and per-package configs exist,
but no ≥90% threshold is enforced yet and `passWithNoTests: true` keeps empty packages green.

- `npm test` runs real Vitest (`turbo run test`). Empty packages pass via `passWithNoTests`;
  `apps/web` carries the wiring-proof home-page test. A green `npm test` now means the runner
  actually executed — the pre-1.2 "vacuously green" caveat no longer applies.

**Coverage is a floor on the core, not a target everywhere**

| Scope | Gate |
|---|---|
| `packages/domain`, `packages/simulation` | **≥90%** (NFR-5.1) |
| `packages/persistence` | ~80% — carried by round-trip tests |
| `apps/web` | **no gate** — deliberate counter-metric |

- Do **not** chase 100%, and never write a test whose only purpose is to raise the number.
  Coverage-padding tests are rejected in review.
- **Referential-integrity logic is core.** The delete guard, usage index, and rule-reference
  index keep their *pure* logic in `packages/domain` at ≥90%, even though they wire through
  persistence. If you are testing that logic through a repository, it is in the wrong package.

**Determinism is a precondition**

- The FR-5.4 tie-break RNG is **injected with a fixed seed** in tests; production uses a
  fresh seed ("config, not outcome"). Never assert on unseeded random behaviour.
- Correctness is pinned against **Conway golden patterns**: blinker (period-2), glider
  (translation), still-lifes (block/beehive), plus hand-computed multi-organism conflict grids.
- **Prove domain-agnosticism:** the generic rules engine is tested with a **non-Game-of-Life
  subject**. If that test needs a GoL import, the engine has leaked.
- ⚠️ **Auto-stop is extinction-only (Decision B.5).** The intuitive test is wrong: still-lifes,
  oscillators, and gliders must **keep running**, because age advances under a visually static
  grid and is a rule input. A test asserting "a still-life auto-stops" looks correct and
  encodes a spec violation.

**Layout & fixtures**

- Each package owns its `vitest.config`. E2E lives in `apps/web/e2e` and stays thin.
- Shared fixtures come from `@gol/test-utils` — grid builders, in-memory fake repos, fixed
  seeds, canonical organisms. Don't hand-roll a fake repo in a test file.
- **Never pixel/snapshot-test the Canvas.** Test the renderer's brain as pure units (dirty
  regions, batch grouping, `displayColor` LUT, auto-fit math). Playwright visual checks are
  smoke-only.
- Property tests (fast-check) cover engine invariants: determinism, no cell both born and
  dead in a cycle, extinction-only auto-stop, resize anchoring, round-trip identity.

### Code Quality & Style Rules

**Tooling state:** ESLint 9 (flat config), Prettier 3, and husky + lint-staged are installed
(Story 1.2). `npm run lint` / `npm run format` run repo-wide; the pre-commit hook formats and
lints staged files. The **AR-46 no-raw-hex rule** and a `@gol/test-utils` import-boundary rule
are active on `apps/web`. ESLint is pinned to **v9** — v10 breaks `eslint-config-next@16`.

**Comments explain WHY, not what** — the established convention across the scaffold.

- Every non-obvious constraint carries a comment naming the failure it prevents. Good, from
  `turbo.json`: *"tsconfig.base.json is extended by every workspace but is not in any task's
  default input set — without this, editing it returns cache hits and skips every typecheck."*
- Do **not** comment what the next line does, or narrate that a change is correct. Never
  leave review artefacts ("fixed per review", "as requested") in code.
- Cite the governing spec by ID where a rule is non-local: `(RFC-004 §3.5)`, `(Decision B.5)`,
  `(AR-2)`. That is how the next reader finds the authority.

**Naming**

- Packages: `@gol/<name>`. Internal workspace deps use `"*"`.
- React components: PascalCase (`<BattlePage>`), files `.tsx`.
- Non-component TS files: **camelCase — never dotted** (decision, 2026-07-16).
  → `repositoryFactory.ts`, **not** `repository.factory.ts`. RFC-001's dotted snippet is
  illustrative; this rule wins.
- Zod schemas: `<Entity>Schema` (`BattleSchema`, `EditableGridPresetSchema`).
- Docs and specs: kebab-case.

**Organization**

- Code belongs to the package that owns the concern; the `lib` boundary enforces it.
- `apps/web` holds UI and wiring only — no simulation, persistence, or rules logic.
- Config lives at the level it applies to: shared → `tsconfig.base.json` / root `turbo.json`;
  package-specific → that package's own config.

### Development Workflow Rules

**Repo state:** local-only, no remote, single `main` branch. No PR flow exists. The GitHub
Actions workflow is authored (`.github/workflows/ci.yml`, Story 1.2) but **cannot run until a
remote exists**; **`npm run ci`** is the local mirror of the gate (keep the two in lockstep).
Run the full gate before calling a change done — the pre-commit hook is the fast subset only.
(Branch naming is deliberately unspecified — add it when a remote exists.)

**🛑 Commit gate — never commit or stage without Sidiar's explicit go-ahead.**

- A standing instruction, not a per-task preference. Present the file list and a suggested
  commit message, then **wait**. Approval for one commit never carries to the next.

**📓 Technical glossary trigger.** When Sidiar says "add this term to the technical glossary" (or
similar), append a short entry to
`/Users/sidiar/projects/NewJob/KnowledgeBase/glossary/implementation-glossary.md` — brief
definition + one-line context, separated from other entries by a long dashed divider (see the
file's existing entries for the format). That path is **outside this repo** (shared across
projects under `NewJob/`), so it never shows up in this repo's `git status`.

**Commit message format** (observed):

- Story work: `Story 1.1: Turborepo monorepo scaffold`
- Follow-ups: `Story 1.1: apply code review fixes`
- Tooling: `chore: allowlist build and typecheck commands used during review`

**Story lifecycle** — `sprint-status.yaml` is the tracker:
`backlog → ready-for-dev → in-progress → review → done`

- Dev moves the story to `review`, then code-review runs in a **fresh context** (a different LLM
  is recommended — the author shouldn't grade their own work).
- Update `sprint-status.yaml` as status changes; record verification commands and their output
  summary in the story's Dev Agent Record.

**Verification before claiming done**

- "Tested" means the story's own verification checklist actually ran — not that typecheck passed.
  Report failures with their output; never state a step ran when it didn't.
- `npm run ci` runs the full local gate (typecheck → lint → coverage → build → bundle → e2e);
  it is the closest local proxy for CI until a remote exists. Report its actual result.

### Critical Don't-Miss Rules

The architecture's Decisions A–J and M1–M10 mostly encode **reversals of the intuitive default**.
Following instinct here produces code that compiles, passes tests, and violates the spec.

**Anti-patterns — these compile and pass tests, and are still wrong**

- ❌ **No classes in the engine.** `packages/simulation` and the rules layer are pure functions
  with DI and a seedable RNG. No `class`, no `this`, no internal mutable state.
- ❌ **Grid dimensions are never constants.** `cols` / `rows` are parameters through the engine,
  renderer, state, and persistence. A hardcoded `100` or `60` anywhere is a bug — 100×60 is only
  the *default* (Decision A).
- ❌ **Never import a concrete repository** — see Framework rules (AR-2/27).
- ❌ **Never persist a numeric `OrganismRef`.** Refs are runtime-only and battle-relative; rules
  persist the target's **stable library id (string)**. A persisted ref means the same rule targets
  a different organism in every battle — silent cross-battle corruption (Decision E).
- ❌ **`clearAll()` never touches `gol:settings`.** It clears battles and organisms only. Import
  reuses it, so import *cannot* affect settings by construction. No envelope carries settings; no
  snapshot-and-restore patch (Decision F).
- ❌ **Never batch rendering by organism.** Batch by `(colorToken, min(age, 7))` — bounded at ≤160
  groups regardless of roster size. Organism-keyed batching is unbounded (Decision B.2).

**Silent-failure traps — the intuitive version is subtly wrong**

- ⚠️ **`MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)`** — *not* `maxAgeLiteral`. Saturating *at*
  the literal makes an `age > maxLiteral` rule permanently unsatisfiable; the `+1` keeps every
  operator correct for saturated cells (Decision B.5).
- ⚠️ **Age buffer is `Uint16Array`; occupant is `Uint8Array`.** Not the reverse, not both u8.
- ⚠️ **Cell State is three-valued *and relative to the evaluating organism*:** `alive` = *your*
  organism, `occupied` = *another* organism, `empty` = nobody. It is not a global truth — the
  engine sets it per-subject (Decision C).
- ⚠️ **Clamp frame `delta` to `msPerCycle` before the accumulator.** Without it, a tab suspension
  banks tens of seconds and drains them as a fast-forward burst (Decision D.3).
- ⚠️ **Death precedes survival; birth and survival compete by Dominance alone** — incumbency grants
  no protection. And **implicit death resolves at cycle-end**: a non-surviving cell still counts as
  a Phase-2 neighbour, which is what preserves Conway semantics (M10).
- ⚠️ **`formatVersion` is the only version anything branches on.** `schemaVersion` and
  `PALETTE_VERSION` are stamps — asserted, never switched on. One source-keyed pipeline:
  `MIGRATIONS[from]` upgrades `from → from+1` (Decision I).
- ⚠️ **The evaluator cache is session-scoped**, never global — compiled closures bake in that
  battle's id→ref map (Decision E.4).

**Bounds & invariants that are enforced, not assumed**

- Editable/persisted grids are **{50×30, 100×60} only**. 150×90 and 200×120 are ephemeral
  Play-mode expansion — never edited, never persisted, never reach a schema (Decision A / H-9).
- **255 organisms per battle** (dense encoding + `Uint8Array`), schema- and UI-enforced. The
  workspace *library* is uncapped — these are different numbers (Decision G.3 / M6).
- **`organismIds` ≡ the placed set** — every entry has ≥1 cell on `initialGrid`, pruned at save.
  "Used by a battle" always means *placed*, never *present in the dropdown* (Decision H).
- **Conway's Classic is protected** — it cannot be deleted, and is re-seeded after import (M9).
- **Import is a destructive whole-workspace replace**, even for a single-battle file: mandatory
  warning + Export-First. Never silently merge (M8).

**Performance gotchas**

- Only `initialGrid` is persisted/exported — never the live grid (A-2).
- Thumbnails render on demand through the existing renderer; **never stored** (M4).
- Population counts are a derived view at the ≤10 Hz publish cadence — **not engine state**, never
  computed per-cycle (M2).
- **No Web Worker in the MVP.** It is the documented escape hatch, not a tool to reach for.

---

## Usage Guidelines

**For AI agents:**

- Read this file before implementing any code.
- Follow all rules exactly as documented. When in doubt, prefer the more restrictive option.
- **Where this file and an RFC disagree, say so — don't silently pick one.** Several rules here
  deliberately override stale RFC snippets (`repositoryFactory.ts` naming, the factory's
  `APP_MODE` read). New conflicts are signal, not noise.
- Spec authority order: **Architecture Cross-Cutting Decisions** (A–J, M1–M10) → owning **RFC**
  → companion specs. Within one area the RFC wins; for anything cross-cutting the Decision wins.

**For humans:**

- Keep this lean and focused on what agents get *wrong* — not a project overview.
- Update when the stack changes or a story lands one of the "not yet installed" tools.
- **Delete rules as they stop being unobvious.** The Story 1.2 tooling notes and the `npm test`
  warning should disappear once CI is real.

Last updated: 2026-07-16
