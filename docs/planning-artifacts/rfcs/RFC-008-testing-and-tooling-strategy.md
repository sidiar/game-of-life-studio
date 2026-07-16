# RFC-008: Testing & Tooling Strategy

**Status:** Approved
**Date:** 2026-06-23
**Approved:** 2026-07-13
**Author:** Architecture Team

## Summary

This RFC defines **how Game of Life Studio is tested and which tools enforce quality** — the toolchain (test runner, e2e/browser driver, coverage, lint, type-check, CI) and the testing strategy layered on top of it (what to test, at what level, to what depth, and why).

The guiding decisions:

1. **Exploit the testable architecture.** RFC-004 made the engine pure/functional and RFC-001 made persistence injectable *specifically* to be provable. The strategy is **engine-heavy**: the bulk of the value is fast, deterministic unit tests on `packages/simulation` + `packages/domain`, with a thin e2e layer on top.
2. **Coverage is scoped, not uniform.** 90%+ on the simulation/domain core (NFR-5.1, Metric 4); pragmatic, lighter coverage on UI glue (the Metric 4 counter-metric — *don't* chase 100%).
3. **Determinism is a precondition.** The FR-5.4 random tie-break is tested with a **fixed RNG seed**; correctness is pinned against **known Conway patterns**.
4. **Some NFRs need test *types* outside the pyramid** — performance/benchmark (NFR-1.1), cross-browser (NFR-2.1), and accessibility (NFR-8.3 + RFC-007) are first-class, not afterthoughts.

This resolves review **gap #14** (no testing/tooling decision) and makes NFR-5.1, NFR-2.1, and Success Metrics 4 & 5 satisfiable. The testing approach is itself a **portfolio-showcase deliverable** (Metric 5).

## Links

- [Main Architecture Document](/docs/planning-artifacts/architecture.md)
- [Product Requirements Document](/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md) — NFR-5.1 (90% coverage), NFR-2.1 (browsers), NFR-1.1 (perf), NFR-8.3 (a11y), Metrics 4 & 5
- [RFC-001: Multi-Mode Architecture](/docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md) — monorepo packages, Repository pattern (fakeable), Zod schemas
- [RFC-002: Grid Rendering](/docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md) — Canvas (special testing case), perf budget
- [RFC-004: Rules Engine & Simulation](/docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md) — pure functional engine, seedable RNG, Conway-pattern next steps
- [RFC-005: Application State](/docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md) — hooks (`useSimulation`, `useUndoableGrid`) to test
- [RFC-006: Persistence & Workspace Schema](/docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md) — serializer round-trip, atomic import, migrations
- [RFC-007: Organism Colour Palette](/docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md) — CVD palette validation

## Overview

### Purpose & Goals

**Primary Purpose:** Give every quality requirement a concrete tool and a defined test approach, so "done" is measurable and the engineering rigor the project exists to demonstrate is visible and enforced.

**Goals:**
1. **Provable core:** 90%+ coverage of the simulation/domain engine (NFR-5.1), tested deterministically against known outcomes.
2. **Right tool per requirement:** unit, integration, e2e, **performance**, **cross-browser**, and **accessibility** each have a named tool and a defined scope.
3. **Fast feedback:** the engine suite runs in milliseconds (pure functions, no DOM), so it can gate every commit.
4. **Exploit the seams:** test the generic rules engine with a non-GoL subject; test the simulation with a stubbed decision function; inject fake repositories.
5. **Counter-metric discipline:** don't chase 100%; don't test framework internals or trivial glue.
6. **Showcase quality:** the strategy itself demonstrates SDD rigor (Metric 5).

### Background

The PRD sets hard, measurable quality bars — 90% engine coverage (NFR-5.1/Metric 4), last-2-versions of four browsers (NFR-2.1), 60 FPS (NFR-1.1), WCAG AA (NFR-8.3) — but **no RFC has chosen a single tool or defined what "tested" means**. RFC-004 says "reach 90%+ coverage" and lists Conway-pattern verification as a next step; nothing names a runner, an e2e tool, or a coverage scope.

The architecture was, however, *designed* for testability: a pure functional engine with dependency injection and a seedable RNG (RFC-004), a Repository pattern that mocks trivially (RFC-001), and hooks that isolate hot state (RFC-005). This RFC's job is to **cash those design choices in**, not to bolt generic testing onto an untested-by-default codebase.

## High Level Design Proposal

### Decision 1: Toolchain

**Decision:** A single, ESM/TypeScript-native chain, chosen to fit the Next.js + monorepo stack (RFC-001/003).

| Concern | Tool | Rationale |
|---|---|---|
| **Unit/integration runner** | **Vitest** | ESM/TS-native, Vite-based, very fast, first-class monorepo support, built-in coverage + `bench` mode. Aligns with the rest of the toolchain. |
| **Component testing** | **React Testing Library** + Vitest + `jsdom` | User-centric component assertions; standard with RTL. |
| **E2E + cross-browser** | **Playwright** | Drives **Chromium, Firefox, WebKit** — covers Chrome/Edge, Firefox, **and Safari** (NFR-2.1) from one tool. |
| **Property-based** | **fast-check** | Ideal for the pure functional engine (invariants — Decision 5). |
| **Coverage** | **Vitest v8 coverage** | Per-package thresholds; CI gate (Decision 3). |
| **Accessibility** | **axe-core** (`@axe-core/playwright` + `vitest-axe`) | Automated WCAG checks (NFR-8.3). |
| **Lint / format** | **ESLint** (typescript-eslint) + **Prettier** | Mainstream, well-understood, showcase-legible. *(Biota/Biome is a faster all-in-one alternative — see Alternatives.)* |
| **Type-check** | **`tsc --noEmit`** (strict) | Types are a test; run as a CI gate. |
| **Bundle analysis** | **`@next/bundle-analyzer`** | Enforce RFC-003's ~300 KB budget. |
| **CI / hooks** | **GitHub Actions** + **husky** + **lint-staged** | Free for the public repo (NFR-6.2); Turborepo caching. |

### Decision 2: Test layers — an engine-heavy pyramid

**Decision:** The classic pyramid, deliberately **bottom-heavy on the engine**:

```
        ╱ E2E (Playwright, thin) ╲           key journeys × browser matrix
      ╱  Integration (Vitest)      ╲         repos, serializer, hooks, wiring
    ╱   Unit (Vitest, the bulk)      ╲       pure engine/domain/render logic
```

- **Unit (the bulk):** generic Rules Engine, GoL rules layer, the three simulation phases, conflict resolution, neighbour calc, aging, extinction auto-stop, `displayColor` LUT (RFC-007), auto-fit/resize math (Decision A), the dense↔sparse↔typed conversions (RFC-006 reconciliation), Zod schemas + migrations.
- **Integration:** `LocalStorage*` repositories, `WorkspaceSerializer` export/import **round-trip + atomic rollback + settings preservation** (import and Clear All must leave `gol:settings` untouched — RFC-006 Decision 6 / arch Decision F), `useUndoableGrid` and `useSimulation` hooks (RFC-005), settings persistence.
- **E2E (thin):** the David journey (create → paint → play → save → reload), export/import a battle, theme switch, resize (Decision A), settings — across the browser matrix.

### Decision 3: Coverage policy — scoped 90%, not uniform

**Decision:** Per-package coverage thresholds, gated in CI:

| Package | Threshold | Why |
|---|---|---|
| `packages/simulation`, `packages/domain` (incl. rules-engine) | **≥ 90%** | NFR-5.1 / Metric 4 — the provable core |
| `packages/persistence` | ~80% | Important but I/O-bound; round-trip tests carry it |
| `apps/web` (UI glue, layout, config) | **no hard gate** | Metric 4 counter-metric — don't chase 100% on glue; covered by component + e2e where it matters |

Coverage is a **floor on the core**, not a vanity number everywhere.

**Referential integrity is core (NFR-5.1 / validation H-8).** The whole-workspace delete guard, the organism→battles usage index, and the rule-reference index (`targetOrganismId → referencingOrganismId[]`, arch Decision E.5) (FR-1.4/1.7 — the highest-risk correctness claim) are held to the **≥90%** floor even though they wire through `packages/persistence`: their *pure* logic — usage/rule-reference derivation and the "delete-permitted" predicate — lives in `packages/domain` and is tested there to ≥90%; the persistence I/O wiring stays at ~80%, carried by round-trip tests. Required core tests also include the **Conway golden patterns** (blinker, glider, still-lifes) and multi-organism **conflict** cases (see Golden tests), so rule evaluation + Dominance resolution are covered, not just the phase plumbing.

### Decision 4: Determinism, fixtures & golden patterns

**Decision:** Engine tests are deterministic and verified against **known outcomes**:

- **Seeded RNG:** the FR-5.4 tie-break RNG is injected with a **fixed seed** in tests (RFC-004 Risk 6); production uses a fresh seed ("config, not outcome").
- **Conway golden patterns:** blinker (period-2), glider (translation), still-lifes (block/beehive — must remain stable cycle-to-cycle; note these are **not** auto-stopped, FR-4.7), plus curated **multi-organism conflict** scenarios with hand-computed expected grids.
- **Domain-agnosticism proof:** the generic Rules Engine is tested with a **non-Game-of-Life subject** (RFC-004 next step) to prove it imports nothing domain-specific.
- **Shared fixtures:** a `@gol/test-utils` package — grid builders, fake repositories, fixed seeds, the canonical organisms ("Conway's Classic" + the three PRD organisms).

### Decision 5: Property-based testing for the engine

**Decision:** Use **fast-check** for invariants the pure engine should hold for *all* inputs:

- **Determinism:** same `(grid, seed)` → identical `step()` output, every run.
- **Phase purity / referential transparency:** `resolveCellAction` depends only on its `CellSubject`.
- **No contradictions:** a cell is never simultaneously born and dead in a cycle.
- **Auto-stop (extinction only, FR-4.7):** the orchestrator auto-pauses iff the grid has **zero living cells**; it **never** auto-stops a frozen still-life (which keeps aging), an oscillator (blinker), or a spaceship (glider) — they all keep running until the user stops them (validation H-α, supersedes the earlier period-1 freeze scope).
- **Resize invariants (Decision A):** top-left anchor preserves in-bounds cells; growth only adds empty cells.
- **Round-trip identity:** `typed → dense → sparse → dense → typed` is lossless (RFC-006 conversions).

### Decision 6: Canvas & rendering testing

**Decision:** Test the **decision logic**, not the pixels.

- Pure-unit the renderer's brain: dirty-region computation, batch grouping `(organism, ageShade)`, the `displayColor` LUT, and the auto-fit cell-size math (Decision A).
- **Avoid pixel/snapshot tests** of the Canvas (brittle, browser-dependent); allow a *small* number of Playwright visual smoke checks only for catastrophic-regression detection.
- The Canvas element is exercised indirectly through e2e journeys.

### Decision 7: Performance & benchmark testing

**Decision:** Performance is a *measured* requirement, with a **Vitest `bench`** harness:

- Benchmark `step()` (and a render pass) across **all four grid presets × 20 organisms** (RFC-004 next step, Decision A).
- **Hard expectation:** the **100×60 baseline** meets the 60 FPS budget (NFR-1.1) — fails CI if regressed.
- **Tracked, not hard-gated:** larger grids record their numbers to confirm *graceful degradation* (Decision A) rather than a fixed FPS.
- Results are written to a benchmark report (Metric 5 documentation).

### Decision 8: Cross-browser & accessibility

**Decision:**
- **Cross-browser (NFR-2.1):** Playwright projects for **Chromium, Firefox, WebKit**, run in CI; mapping — Chrome/Edge → Chromium, Firefox → Firefox, Safari → WebKit. Tablet viewport (≥1024 px, NFR-3.1) included.
- **Accessibility (NFR-8.3):** automated **axe-core** checks on key screens in the **Clinical Lab** theme (the AA-guaranteed default per the NFR-8.3 reconciliation); keyboard-navigation smoke tests (MUI provides most of this); a **documented CVD validation** of the RFC-007 palette (Color Oracle / programmatic) — a manual+scripted check, since "distinguishable colours" isn't a pass/fail axe rule.

### Decision 9: CI pipeline, gates & monorepo test layout

**Decision:** A GitHub Actions pipeline with Turborepo caching:

```
typecheck (tsc) ─► lint (eslint) ─► unit+integration (vitest + coverage gate)
   ─► build (next, bundle-budget check) ─► e2e (playwright, 3 browsers) ─► a11y (axe)
```

- **PR gates:** typecheck, lint, unit/integration + coverage floor (Decision 3), build. E2e/a11y run on PRs to `main`.
- **Pre-commit (husky + lint-staged):** format + lint changed files + typecheck.
- **Layout:** each package owns its `vitest.config`; shared helpers in `@gol/test-utils`; e2e in `apps/web/e2e`.

## Risks & Mitigations

**Risk 1: Chasing the 90% number with low-value tests.**
- *Mitigation:* scope the gate to the engine/domain (Decision 3); the counter-metric is explicit; review rejects coverage-padding tests.

**Risk 2: Flaky e2e/cross-browser tests erode trust.**
- *Mitigation:* keep e2e thin (Decision 2); deterministic seeds; Playwright auto-waiting; quarantine flakes rather than blanket-retry.

**Risk 3: Canvas testing tempts brittle pixel snapshots.**
- *Mitigation:* test decision logic as pure units (Decision 6); pixel checks are smoke-only.

**Risk 4: WebKit/Safari-specific failures surface late.**
- *Mitigation:* WebKit is in the CI matrix from the start (Decision 8), not deferred to release.

**Risk 5: Toolchain churn / Jest-vs-Vitest second-guessing.**
- *Mitigation:* one decision, documented here (NFR-5.3); Vitest fits the Vite/TS/ESM/monorepo stack with the least friction.

**Risk 6: Perf benchmarks are environment-sensitive (CI noise).**
- *Mitigation:* treat large-grid numbers as *tracked* (Decision 7); only the 100×60 baseline hard-gates, with generous margin; run benches on a consistent runner.

## Alternatives Considered

**Alt 1: Jest instead of Vitest.**
- *Rejected:* heavier ESM/TS setup, slower, less monorepo-native for a Vite/Next stack. Vitest's API is Jest-compatible, so familiarity transfers.

**Alt 2: Cypress instead of Playwright.**
- *Rejected:* Playwright's first-class **WebKit** support is decisive for the Safari requirement (NFR-2.1); also better parallelism and trace tooling.

**Alt 3: Biome instead of ESLint + Prettier.**
- *Considered:* much faster, single tool. *Deferred:* ESLint's plugin ecosystem (a11y, testing, import rules) and ubiquity make it the safer showcase default; Biome is a reasonable future swap (kept open).

**Alt 4: Example-based tests only (no property-based).**
- *Rejected:* the pure functional engine is a textbook fit for property tests; they catch classes of bugs examples miss and reinforce the rigor thesis (Metric 5).

**Alt 5: Uniform 90% coverage across the whole repo.**
- *Rejected:* directly violates the Metric 4 counter-metric; wastes effort testing UI glue and inflates a vanity metric.

---

**Status:** Approved (2026-07-13)

**Next Steps (implementation):**
1. Stand up `@gol/test-utils` (grid builders, fake repos, fixed seeds, canonical organisms).
2. Implement the Conway golden-pattern suite + the non-GoL generic-engine test (RFC-004 next step).
3. Wire the GitHub Actions pipeline with per-package coverage gates and the 3-browser e2e matrix.
4. Add the Vitest `bench` harness and capture baseline numbers across the four grid sizes (Decision A).
5. Add axe-core checks + the documented CVD palette validation (RFC-007).
