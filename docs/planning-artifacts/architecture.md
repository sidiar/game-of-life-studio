---
stepsCompleted: [1]
inputDocuments: [
  'docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md',
  'docs/planning-artifacts/briefs/brief-GameOfLife-2026-05-26/brief.md',
  'docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/ux-design-complete.md',
  'docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md'
]
workflowType: 'architecture'
project_name: 'GameOfLife'
user_name: 'Sidiar'
date: '2026-06-05'
---

# Game of Life Studio — Solution Architecture

**Status:** Approved (2026-07-13) · **Last updated:** 2026-07-13

This is the **umbrella architecture document** for Game of Life Studio. It gives the system-level picture and ties together the detailed **RFCs** (each owns one area in depth) and the **cross-cutting decisions** that span them.

**Source-of-truth rule:** for a cross-cutting concern, the [Cross-Cutting Decisions](#cross-cutting-decisions--conflict-resolutions) section is authoritative and the RFCs are aligned to it; for everything within one area, the owning RFC is authoritative. Jump to the [RFC index](#rfc-index--dependency-map) for depth or the [Traceability matrix](#requirement--rfc-traceability) to see which spec satisfies which requirement.

## System Overview

Game of Life Studio is a **client-only, statically-hosted** web app (NFR-6: $0 hosting, fully offline-capable) in which users design competing multi-organism cellular automata ("Battles") and run them in real time. There is **no backend in the MVP**.

**Shape at a glance:**
- A **Next.js (App Router) + TypeScript (strict)** app, **statically exported** (`output: 'export'`), on free static hosting (Vercel / GitHub Pages).
- **MUI v6** (one theme + app CSS-variable token layer — Decision J) for all UI chrome; the Petri Dish grid is drawn on an **HTML5 Canvas** *outside* MUI.
- A **pure, functional simulation engine** (no classes, dependency-injected, seedable RNG): a domain-agnostic Rules Engine + a Game-of-Life rules layer + a Simulation Engine.
- **Runtime state kept deliberately minimal** — no global store: persisted state in injected **repositories**, ephemeral UI state in local React state, and **hot simulation state in refs** (never React state) to protect 60 FPS.
- **Persistence** via browser **localStorage** behind a Repository abstraction, with a versioned **export/import** envelope for sharing and backup.
- A **dual-mode seam** (Standalone now / Connected later) exists via the Repository pattern, but only **Standalone** ships in the MVP.

```
┌────────────────────────────────────────────────────────────────────┐
│ UI  — Next.js App Router + MUI v6 (CSS-var themes)        RFC-003   │
│   Battle Gallery · Petri Dish (Edit/Play) · Organism Editor ·       │
│   Settings                                                          │
├────────────────────────────────────────────────────────────────────┤
│ Runtime state  — modes · undo · dirty · useSimulation     RFC-005   │
│   hot grid + RAF loop in refs ──drives──► Canvas renderer            │
├────────────────────────────────────────────────────────────────────┤
│ Rendering  — Canvas 2D · dirty regions · batch by org×shade RFC-002  │
│ Simulation + Rules  — 3-phase step · generic rules engine  RFC-004  │
│ Colour palette  — token → age-shade LUT                    RFC-007  │
├────────────────────────────────────────────────────────────────────┤
│ Domain entities + Repositories  — Zod · dependency injection RFC-001│
│ Persistence / Workspace  — localStorage · export envelope  RFC-006  │
├────────────────────────────────────────────────────────────────────┤
│ Tooling & tests  — Vitest · Playwright · fast-check · CI   RFC-008  │
└────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Concern | Choice | Owner |
|---|---|---|
| Framework | Next.js (App Router, static export) | RFC-001, RFC-003 |
| Language | TypeScript (strict) | RFC-001 |
| UI library | MUI v6 (single theme + app CSS-variable token layer — Decision J) + Emotion | RFC-003 |
| Animation | MUI transitions + CSS keyframes + Framer Motion (sparingly) | RFC-003 |
| Grid rendering | HTML5 Canvas 2D (double-buffer, dirty regions, auto-fit) | RFC-002 |
| Simulation engine | Pure functional TS (no classes, DI, seedable RNG) | RFC-004 |
| Runtime state | React local state + refs (no global store) | RFC-005 |
| Validation | Zod (shared schemas) | RFC-001, RFC-004, RFC-006 |
| Persistence | localStorage behind Repository pattern; versioned export envelope | RFC-001, RFC-006 |
| Organism colours | Token registry, theme-independent | RFC-007 |
| Testing | Vitest · React Testing Library · Playwright · fast-check · axe-core | RFC-008 |
| Lint/format/CI | ESLint + Prettier · `tsc` strict · Turborepo · GitHub Actions | RFC-001, RFC-008 |
| Hosting | Static (Vercel / GitHub Pages), $0/month | RFC-001 (NFR-6) |
| Connected mode *(post-MVP)* | FastAPI + PostgreSQL/SQLite | RFC-001, RFC-006 |

## RFC Index & Dependency Map

| RFC | Title | Owns |
|---|---|---|
| [RFC-001](rfcs/RFC-001-multi-mode-architecture.md) | Multi-Mode Architecture | Domain entities, Repository pattern, Zod, monorepo, dual-mode seam |
| [RFC-002](rfcs/RFC-002-grid-rendering-technology.md) | Grid Rendering Technology | Canvas 2D, perf budget, dirty regions, static render |
| [RFC-003](rfcs/RFC-003-frontend-ui-architecture.md) | Frontend UI Architecture | MUI, theming, animation, accessibility |
| [RFC-004](rfcs/RFC-004-simulation-rules-engine.md) | Rules Engine & Simulation | Generic rules engine, GoL rules layer, 3-phase step |
| [RFC-005](rfcs/RFC-005-application-state-modes-undo.md) | Application State, Modes & Undo | Runtime state, hooks, modes, undo, dirty-tracking |
| [RFC-006](rfcs/RFC-006-persistence-workspace-schema.md) | Persistence & Workspace Schema | Export envelope, migration, quota, auto-save |
| [RFC-007](rfcs/RFC-007-organism-colour-palette.md) | Organism Colour Palette | Token registry, CVD palette, aging transform |
| [RFC-008](rfcs/RFC-008-testing-and-tooling-strategy.md) | Testing & Tooling Strategy | Toolchain, test layers, coverage, CI |

**Companion specs** (elaborations of RFC decisions — where a companion spec and an RFC differ, the RFC wins):

| Spec | Elaborates | Owns |
|---|---|---|
| [Battle Page Component Tree](component-tree-battle-page.md) | RFC-003, RFC-005 (+ RFC-002/004/007 integration points) | Full component tree for `<BattlePage>` (Lab & Run): per-component responsibility, state placement, props/callbacks APIs, reuse/DI seams, FR traceability |

```
RFC-001 (entities, repos) ──┬──► RFC-004  (engine uses entities + Zod)
                            ├──► RFC-006  (persistence builds on repos)
                            └──► RFC-005  (state injects repos)

RFC-004 (engine) ──► RFC-005 (useSimulation drives step) ──► RFC-002 (renders)

RFC-007 (palette) ──► RFC-002 (displayColor LUT) · RFC-004 (aging) · RFC-001 (colorToken)

RFC-003 (UI)  ─ surrounds all UI surfaces
RFC-008 (testing) ─ spans every package
```

## Repository / Package Structure

A Turborepo monorepo (RFC-001), one source of truth across deployment modes:

```
apps/
  web/                 Next.js app — UI, App Router pages, e2e tests
  api/                 FastAPI service — Connected mode (POST-MVP only)
packages/
  domain/              entities, Zod schemas, generic rules-engine + GoL rules (RFC-004)
  simulation/          Simulation Engine — 3-phase step, grid buffers (RFC-004 Part 3)
  persistence/         Repository implementations + WorkspaceSerializer (RFC-001/006)
  test-utils/          shared fixtures, fake repos, fixed seeds, canonical organisms (RFC-008)
```

## Runtime Architecture (end-to-end)

The one flow that spans RFC-002/004/005/007 and the cross-cutting decisions. Three state categories (RFC-005): **persisted** (repositories), **ephemeral UI** (local state), **hot** (refs).

1. **Edit (Lab) mode.** The user paints into the authoritative `initialGrid` (local state in `<BattlePage>`); each gesture is an undoable snapshot (RFC-005); the Canvas renders it auto-fit (RFC-002, Decision A). Grid size is per-battle and resizable (Decision A).
2. **Enter Play (Run) mode.** The live grid is **cloned** from `initialGrid` into typed-array refs inside `useSimulation` (RFC-005); `initialGrid` becomes read-only.
3. **The loop (Decision D).** A RAF loop renders at ≤60 FPS; a **time accumulator** runs one `step()` per `msPerCycle` (= 1000 / gen-per-sec). Each `step()` is the pure **3-phase evaluation** (RFC-004) using precompiled per-organism evaluators and the seeded RNG for tie-breaks (FR-5.4). The renderer repaints only after a step, batching cells by `(organism, ageShade)` via the RFC-007 colour LUT (Decision B).
4. **Derived signals.** `cycle` (an int) and a **population** summary (one grid pass at ≤10 Hz, M2) are published to React; everything else about a running sim stays in refs (zero per-cycle re-renders, NFR-1.1).
5. **Auto-stop (FR-4.7).** When the grid goes extinct (no living cells remain), the loop pauses — a plain emptiness check, with no previous-cycle or age comparison (Decision B.5). Frozen grids, oscillators, and moving patterns are **not** auto-stopped: age keeps advancing under a visually static grid and is a first-class rule input, so a still-looking grid may still be evolving (validation H-α, superseding the earlier period-1 freeze scope).
6. **Stop / Run→Lab.** The live grid is discarded; the view falls back to `initialGrid` at its Edit-mode size (A-2 / A-3 preserved).
7. **Save / Export.** Save writes `initialGrid` (dense `gridState`) through the battle repository; export assembles the versioned envelope (sparse cells) via the `WorkspaceSerializer` (RFC-006).

## Cross-Cutting Decisions & Conflict Resolutions

This section records architecture-level decisions that span multiple RFCs and resolve conflicts identified during spec review. Each decision is the **canonical source of truth**; the affected RFCs are updated to match and link back here.

### Decision A — Size-parametric grid with per-battle dimensions and runtime resize

- **Status:** Accepted — 2026-06-23
- **Resolves:** Conflict A (variable grid size vs. fixed 100×60). Supersedes the "100×60 canonical/fixed" assumptions in RFC-002, RFC-004, RFC-005, RFC-006, and the "always 100×60" language in PRD FR-3.1/FR-3.2.
- **Affects:** RFC-001, RFC-002, RFC-004, RFC-005, RFC-006 (updated); PRD FR-3.1, FR-3.2, FR-8.10, NFR-1.1 (reconciliation required — see below).

**Decision.** The grid is fully size-parametric. Grid dimensions (`cols`/`width`, `rows`/`height`) are parameters throughout the engine, renderer, runtime state, and persistence — never constants. Allowed dimensions are the four FR-8.10 presets: **50×30, 100×60 (default), 150×90, 200×120**. **Edit-mode / persisted grids are limited to the two editable sizes (50×30, 100×60)** so cells stay clickable under auto-fit; the two larger sizes (150×90, 200×120) exist only as **ephemeral Play-mode expansion** (FR-4.9) — never persisted, never edited (validation H-9).

- **A.1 — Per-battle dimensions.** Each battle stores its own `gridSize`. New battles default to the FR-8.10 "Default Grid Size" setting (100×60 unless changed). Both the default and the Edit-mode sizes are the **editable subset {50×30, 100×60}** (H-9).

- **A.2 — Two independent resize capabilities** (mapped onto RFC-005's dual-grid model):
  - **Edit-mode resize (persisted):** the user may change the battle's grid size in Edit mode by selecting one of the **editable presets {50×30, 100×60}** (H-9). This mutates the authoritative `initialGrid`, is saved/exported, and is **undoable**.
  - **Play-mode resize (ephemeral):** while the simulation is **paused**, the user may resize the **live grid** by selecting any preset — **including the larger {150×90, 200×120} sizes not available in Edit** — to watch organisms expand into new space (FR-4.9 restricts resize to the paused state; the control is disabled while the simulation is actively running). It affects only the disposable live grid (RFC-005 Decision 4); it is **never persisted**. Stop / Run→Lab discards the live grid and returns to `initialGrid` at its Edit-mode size — preserving **A-2** (export initial state only) and **A-3** (Edit shows initial state).

- **A.3 — Anchor & clipping (both resizes).** **Top-left anchored:** existing cells keep their `(col,row)`. Growing adds empty space to the right and bottom; the hard edges (FR-5.9) move outward. Shrinking clips cells outside the new bounds — in Edit mode this is destructive (warned + undoable); in Play mode it only affects the disposable live grid.

- **A.4 — Performance.** 60 FPS is a **hard guarantee at the default 100×60 with up to 20 organisms** (NFR-1.1 baseline). Beyond that, performance degrades gracefully: rendering is decoupled from stepping (a repaint occurs per simulation step, not per RAF frame — finalized in Conflict D), and step cost scales ~O(N) (~6 ms at 6,000 cells → ~24 ms at 24,000, within the fastest 50 ms cadence). When a size/speed/device combination cannot sustain cadence, the runtime reduces effective gen/sec first, then render FPS. **No Web Worker in MVP** (it remains the documented escape hatch — RFC-002). Smaller grids explicitly support low-end devices.

- **A.5 — Rendering (auto-fit).** The renderer computes cell size to fit the **whole grid** into the canvas (`cellSize = floor(canvasPx / dimension)`); the entire grid is always visible and rescales on resize (cells shrink as the grid grows). Because Edit-mode sizes are bounded to {50×30, 100×60} (H-9), Edit-mode cells stay large enough to click (FR-3.4); the tiny-cell sizes only occur transiently during Play-mode expansion, where individual-cell editing isn't needed. This **replaces FR-3.2's fixed "visible-cell viewport presets"** (40×30 / 60×40 / 100×60). _[Proposed reconciliation of FR-3.2 — open to revisit.]_

- **A.6 — Memory.** Typed-array **live buffers** (occupant `Uint8Array` + age `Uint16Array`, double-buffered) scale to ≈ **144 KB** at the 200×120 **Play-mode** maximum. **Undo snapshots** are Edit-mode grids only, now capped at 100×60 (H-9) → ≈ **6 KB** each, ≈ **180 KB** for 30 levels (Edit no longer reaches 150×90/200×120, so the former ≈720 KB undo worst case no longer applies). Both within budget; **30 undo levels retained at all sizes**. Undo snapshots still capture grid **dimensions** (the 50×30 ↔ 100×60 Edit resize changes them).

- **A.7 — Persistence.** Only `initialGrid` is persisted/exported (A-2). The Battle entity carries `gridSize`; RFC-006's export envelope already carries `gridDimensions` (sparse cells are inherently size-agnostic), so import recreates the correct dimensions. Runtime (Play-mode) expansion is never persisted.

**PRD reconciliation (applied):**
- **FR-3.1:** now "default 100×60, per-battle, resizable to the FR-8.10 presets."
- **FR-3.2:** repurposed from fixed viewport presets to the size-parametric + auto-fit model (A.5).
- **NFR-1.1:** reworded to a guaranteed baseline (100×60 / 20 organisms) + graceful scaling (A.4).
- **FR-8.10:** kept as the default for *new* battles; battles are resizable afterward.
- **New FRs:** FR-3.11 (Edit-mode grid resize) and FR-4.9 (Play-mode runtime resize).

### Decision B — Visual aging via colour-batched age-shades; age is engine state

- **Status:** Accepted — 2026-06-23
- **Resolves:** Conflict B (per-cell aging saturation vs. batch-by-color rendering).
- **Affects:** RFC-002 (batching, dirty-tracking), RFC-004 (age semantics, extinction auto-stop). **Depends on** the colour-palette spec (still open) for base colours.

**Decision.**

- **B.1 — Age is engine state, not a render artefact.** Cell age (FR-5.6) is tracked by the engine and is a **first-class rule input** ("Age of Cell", FR-2.5) — already wired in RFC-004. Only the **saturation→colour mapping** (FR-5.7) is render-time. The renderer *reads* the engine's `age` array and owns no aging logic. (Corrects RFC-004 §3.3's earlier "render-time concern" wording.)

- **B.2 — Batch by colour state (`colorToken` × age-shade) *(revised 2026-07-09 — adversarial finding #6)*.** Rendering batches cells by **displayed colour state**, not by organism. `displayColor` (B.3 / RFC-007) is a pure function of `(colorToken, ageShade)`, so organisms sharing a token render identically and **fold into the same fill group**. A non-aging organism renders at its token's base colour, which RFC-007 defines as the full-saturation age-cap colour — i.e. its group key is `(token, 7)`. Batch key: `(colorToken, min(age, 7))` for aging organisms, `(colorToken, 7)` for non-aging. Worst case ≤ 20 tokens × 8 shades = **160 fill groups — palette-derived and independent of organism count**, which is exactly what makes M6's uncapped library and G.3's ≤255-per-battle roster compatible with batched rendering (organism-keyed batching would have grown to 255 × 8 = 2,040 "groups" — no bound at all). The renderer builds a per-battle `OrganismRef → fill-group` LUT at simulation start. *(The original organism-keyed wording predated M6; RFC-002's Background and RFC-007's LUT arithmetic already assumed colour-bounded batching — the design now matches them.)*

- **B.3 — Saturation transform.** `displayColor(organism, ageShade)` = the base palette colour with **HSL S-channel = 0.30 + 0.10 · ageShade** (FR-5.7), precomputed once per battle into a small LUT. (Finalized in RFC-007.)

- **B.4 — Dirty-tracking.** A cell is dirty on **occupant change OR age-shade change**; the latter is bounded to a cell's first 7 cycles (after which its shade is stable).

- **B.5 — Auto-stop (FR-4.7) is extinction-only.** The loop auto-pauses only when the grid contains **zero living cells** — a plain emptiness check, with no `gridEquals`/previous-cycle/age comparison. Freeze (still-life) detection was **removed**, superseding the earlier period-1 freeze+extinction scope (validation H-α): because age advances every cycle even under a visually static grid and is a first-class rule input (an organism may gate rules on `age > X`), a frozen-looking grid may still be evolving, so freeze-stopping it would be wrong. Oscillators and translating patterns are likewise not detected — they are visibly alive; the user stops them manually. Age is still bounded for **storage** by `min(age, MAX_RELEVANT_AGE)` where `MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)` *(revised 2026-07-09 — adversarial finding #3)*: one **above** the highest age literal any of the battle's organisms' rules reference — saturating *at* the literal would make an `age > maxLiteral` rule permanently unsatisfiable, while `maxLiteral + 1` keeps every operator (`eq/gt/lt/gte/lte/range`) correct for saturated cells; the 7 floors the eight age-shades. Computed once per battle at evaluator-compile time (RFC-004 §3.5; rules cannot change mid-run). The age buffer is canonically a **`Uint16Array`** (RFC-004 §3.4; A.6's memory math already assumes it — the earlier "stays a `Uint8Array`" claim is retired), and rule age literals are schema-bounded to **≤ 65534** (RFC-004 §2.4) so `maxLiteral + 1` always fits. Purely a storage optimization, decoupled from auto-stop.

**PRD reconciliation (applied):** FR-4.7 renamed to **"Auto-Stop on Extinction"**, scoped to **extinction only** (zero living cells); the age-inclusive freeze/steady-state comparison was removed, and its ACs now state that frozen grids, oscillators, and moving patterns are intentionally not auto-stopped because age keeps advancing and is a rule input (validation H-α, superseding the H-4 period-1 freeze scope). FR-5.7 unchanged.

### Decision C — Three-valued, relative Cell State (PRD-faithful)

- **Status:** Accepted — 2026-06-23
- **Resolves:** Conflict C (PRD's three-valued "Occupied / Organism Type" model vs. RFC-004's `empty | alive` simplification).
- **Affects:** RFC-004 (§2.1, §2.1.1, Zod schema, Risk 4, Future Extensions). **PRD: no change** — FR-2.5 already specifies the three values.

**Decision.**

- **C.1 — Cell State is three-valued and relative to the evaluating organism:** `empty | alive | occupied`, where **`alive`** = the cell holds *your* organism and **`occupied`** = it holds *another* organism. The Simulation Engine sets it when materializing the `CellSubject` — consistent with `neighborCount` / `occupantNeighborCount`, which are already relative.

- **C.2 — "Organism Type"** targets a *specific* organism (the occupant), relevant when Cell State = `occupied`. So "any other organism" = `cellState = occupied` (one condition); "a specific organism" = `organismType = <target organism>` — persisted as the target's **library id**, compiled to a numeric runtime ref at simulation start (Decision E).

- **C.3 — `ne` is no longer load-bearing:** it drops from "needed for any-other" to an optional future nicety (e.g. "occupied by someone other than organism X"). This reverts RFC-004's simplification and removes its Risk 4.

- **C.4 — Known trade-off:** "occupied by **anyone** (self *or* other)" is not directly expressible under AND-only MVP rules (would need OR / the reserved `RuleSetCollection`). Not a PRD requirement.

### Decision D — One canonical speed scale (gen/sec) + tick/render decoupling

- **Status:** Accepted — 2026-06-23
- **Resolves:** Conflict D (FR-4.2 ms/multiplier vs. FR-8.12 gen/sec mismatch) and finalizes the runtime-loop ownership that Decisions A & B forward-referenced.
- **Affects:** PRD FR-4.2, FR-8.12 (unified); RFC-002 §5, RFC-005 Decision 5.

**Decision.**

- **D.1 — One canonical scale: generations/second.** Ladder: **1, 2, 5, 10, 20 gen/sec; default 10**. Internal `msPerCycle = 1000 / genPerSec`. FR-4.2 (the in-play control) and FR-8.12 (the default *starting* speed) share this single ladder — FR-8.12 just picks the starting value.

- **D.2 — Max 20 gen/sec (50 ms/cycle).** Drops FR-8.12's 30 & 60 gen/sec. Guarantees `msPerCycle ≥` one 60 FPS frame (16.7 ms), hence **≤1 simulation step per render frame** — no spiral-of-death.

- **D.3 — Tick rate decoupled from render rate.** RAF renders at the display rate (≤60 FPS); a **time accumulator** advances the simulation one `step()` per `msPerCycle` and repaints only after a step (dirty regions make idle frames free). Speed is read from a ref → live change with no loop restart (FR-4.2 "adjust without pausing"). **Frame `delta` is clamped to `msPerCycle` before entering the accumulator** *(added 2026-07-09 — adversarial finding #11)*: without it, D.2's no-burst guarantee held only in steady state — a tab suspension or long GC pause would bank tens of seconds and drain them as a fast-forward burst at one step per frame. Clamped, a resumed tab advances at most one step, and unkeepable time is dropped (D.4 degradation), never replayed.

- **D.4 — Graceful degradation (ties to Decision A).** On large grids where a `step()` exceeds the frame budget, effective gen/sec drops; the loop structure is unchanged. No Web Worker in MVP.

**PRD reconciliation (applied):** FR-4.2 presets rewritten to the gen/sec ladder; FR-8.12 unified to the same ladder (30/60 dropped); both note the tick/render decoupling.

### Decision E — Stable organism ids at rest; numeric refs are runtime-only

- **Status:** Accepted — 2026-07-09
- **Resolves:** Architecture adversarial-review finding #1 (persisted `organismType` rule patterns stored a battle-relative numeric `OrganismRef`, while rules live on workspace-shared organisms — the same persisted rule meant a different target in every battle, and edit-time ref remapping would have corrupted the rule for every other battle using the organism).
- **Affects:** RFC-004 (§2.1/§2.1.1, §2.4 schema + stability note, §3.5, Risk 5), RFC-005 (Decision 8 — rule-reference index), RFC-006 (Decisions 1, 4, 5 — rule-aware closure & integrity assertion), RFC-008 (Decision 3 core-coverage scope); PRD FR-1.4 / FR-1.7 (reconciliation applied); Decision C.2 clarified (id at rest, ref at runtime).

**Decision.** The numeric `OrganismRef` (index into a battle's organisms array) is a **runtime-only** representation, confined to a simulation session. **No persisted structure carries a numeric ref across the battle boundary.**

- **E.1 — Rule patterns persist the library id.** An `organismType` condition's pattern is the target organism's **stable library id** (string) — the value the Organism Editor's picker naturally produces. Rules live on workspace-shared organisms (FR-7.15), so only a workspace-stable identifier is valid inside them.
- **E.2 — The grid stays numeric; battle-local encodings are unchanged.** The runtime occupant buffer remains numeric typed arrays (RFC-004 §3.4) — ids are not representable per cell, and the 60 FPS / memory budgets (A.6) depend on the numeric encoding. The persisted dense `gridState` (`v = index+1` into `organismIds`, RFC-001) is also unchanged: it is battle-relative but **self-contained** — `gridState` and `organismIds` live on the same Battle entity and are remapped together on roster edits.
- **E.3 — id→ref interning at the simulation boundary.** At simulation start the engine builds the battle's `id → OrganismRef` map (from the same dense organisms array it already assembles) and translates each rule pattern to its numeric ref **inside the compiled evaluators** (RFC-004 §3.5). The hot path compares numbers only — translation costs one lookup per rule per session, never per cell. A target id **not present in the battle** compiles to a never-match sentinel (e.g. `-1`): "occupied by organism X" is simply false in a battle that doesn't include X.
- **E.4 — Evaluator cache is session-scoped.** Compiled closures bake in the battle's id→ref mapping, so the `contentHash`-keyed evaluator cache lives **per simulation session (per battle run)**, not globally — the same rules used in two battles compile separately, eliminating cross-battle reuse of closures whose refs would resolve differently.
- **E.5 — Rule references are first-class references.** (a) **Delete (FR-1.4):** the M7 whole-workspace hard block extends to rule references — an organism cannot be deleted while **any other organism's rules target its id**. A derived `targetOrganismId → referencingOrganismId[]` index (computed from loaded organisms, mirroring RFC-005 Decision 8) backs the check; FR-1.7 surfaces the referencing organism names alongside the battle list. Self-references do **not** block (deleting an organism deletes its own rules with it). (b) **Export (RFC-006 Decision 4):** the single-battle referenced-organism closure includes organisms referenced by rules, **transitively**, so a shared file stays self-contained. (c) **Import (RFC-006 Decision 5):** the referential-closure assertion extends to rule-target ids. With (a)+(b) in place, a dangling rule-target id is unreachable through normal use; the assertion guards hand-edited/truncated files.

**PRD reconciliation (applied):** FR-1.4 usage check extended to rule references (own remedy wording; self-reference exemption); FR-1.7 popover gains a read-only "targeted by [M] organism rule(s)" section. FR-2.5's Organism Type property is unchanged — it already targets "a specific organism"; storing the target as an id is an architecture concern.

### Decision F — Settings are device-local: no export contains them, no import (or Clear All) touches them

- **Status:** Accepted — 2026-07-09
- **Resolves:** Architecture adversarial-review finding #2 (RFC-006 Decision 5's import ran `clearAll()` — wiping `gol:settings` — and only restored settings `if (envelope.settings)`; battle envelopes omit settings per Decision 6, so importing a friend's battle destroyed the importer's theme/grid-lines/default-speed preferences — the exact outcome Decision 6 promised to prevent). Also moots the settings↔`kind` coupling item of finding #13.
- **Affects:** RFC-006 (Decisions 1, 2, 4, 5, 6, 7; Risk 4; Open Questions), RFC-001 (`clearAll()` scope comment), RFC-008 (integration test scope). **PRD: no change needed** — FR-8.3 already scopes export to "all battles and organisms" and FR-8.5 scopes Clear All to "delete all battles and organisms"; settings-in-workspace-export was an RFC-level addition, now dropped.

**Decision.** Settings (theme, grid-lines, cell animation, default speed/grid size, auto-save toggle — FR-8.6–8.12) are **preferences of the person/device, not workspace data**. They live only in `gol:settings` and never cross the file boundary.

- **F.1 — No envelope carries settings.** `WorkspaceExportSchema` has no settings field at all — for battle *and* workspace exports alike. This matches FR-8.3's definition of the workspace export verbatim and removes the finding-#13 laxity (a `kind`↔`settings` consistency rule is unnecessary when the field doesn't exist).
- **F.2 — `clearAll()` is data-only.** It clears battles + organisms (and reseeds `DEFAULT_WORKSPACE` per M1/M9) but never touches `gol:settings`. The import path (RFC-006 Decision 5) reuses it, so import *cannot* affect settings by construction — no snapshot-and-restore patch needed.
- **F.3 — Clear All Data preserves settings (product decision, 2026-07-09).** FR-8.5's wording and warning text already scope it to battles and organisms; after Clear All the user keeps their theme and display preferences. A backup restored on another device brings the data; the viewer keeps their own preferences.
- **F.4 — M8's "replaces the entire workspace" is thereby pinned:** it means all battles and organisms — never settings.

### Decision G — Persistence schemas enforce the architecture's own invariants (H-9 presets, cell bounds, per-battle 255 cap)

- **Status:** Accepted — 2026-07-09
- **Resolves:** Architecture adversarial-review finding #4 (`BattleSchema.gridSize` / envelope `gridDimensions` were unconstrained ints — a hand-edited 999×999 file passed Zod, violating H-9 and the ≤180 KB undo-memory guarantee built on it; `PlacedCellSchema` never checked cells against `gridDimensions`, so sparse→dense conversion could write out of bounds; and the dense encoding's hard ≤255-organisms-per-battle cap was stated nowhere while M6 announced "uncapped"). Also closes finding #13's `gridState`-missing-`.int()` item.
- **Affects:** RFC-001 (`EditableGridPresetSchema`, `BattleSchema` bounds + `superRefine`), RFC-006 (envelope `gridDimensions` + import-boundary `superRefine`), RFC-004 (§3.4 occupant comment), M6 (clarifying sentence). **PRD: no change needed** — no FR promises grids outside the FR-8.10 editable presets or more than 255 organisms in one battle; NFR-1.1's "20" remains a performance baseline.

**Decision.** Every invariant the architecture commits to about persisted data is enforced by the Zod schemas at both validation boundaries (at-rest load and file import — one registry, Decision 3-style), not discovered downstream as memory blowups or typed-array overflow.

- **G.1 — Grid sizes are the H-9 editable presets, as literals.** A single-sourced `EditableGridPresetSchema` (`{50×30} | {100×60}`, defined in RFC-001, reused by RFC-006's `gridDimensions`) replaces the unconstrained ints. The larger Play-mode sizes (150×90, 200×120) are ephemeral and never reach a schema. Adding a preset later is a `formatVersion` bump + migration, per the existing chain.
- **G.2 — Structural integrity is refined, not assumed.** At rest: `gridState` row/column counts must match `gridSize`, and every cell value must index into `organismIds` (`v ≤ organismIds.length`). On import: every sparse cell must satisfy `x < cols, y < rows`, and duplicate coordinates are rejected as corrupt (not resolved last-wins).
- **G.3 — The per-battle organism cap is 255, stated and enforced.** The dense encoding (`0..255`, RFC-001) and the `occupant: Uint8Array` (RFC-004 §3.4) derive it; `organismIds` is capped `.max(255)` at rest, imports reject >255 distinct organisms in one battle, and the Battle roster UI blocks adding a 256th (with a message) instead of overflowing. This does **not** contradict M6: the *workspace library* stays uncapped; 255 bounds one battle's roster — ~12× the NFR-1.1 perf baseline, practically unreachable.

### Decision H — "Used by a battle" means *placed on its grid*; the persisted roster is exactly the placed set

- **Status:** Accepted — 2026-07-09
- **Resolves:** Architecture adversarial-review finding #5 (`BattleSummary` was never defined, so RFC-005 Decision 8's usage index could not be built from `battles.list()` as specified — and the `listFull()` fallback would deserialize every dense grid on every Library mount; "referenced" was roster-based for saved battles but placement-based for the open one, so an added-but-unpainted organism blocked deletion via one path and not the other; and nothing said whether `organismIds` is pruned when an organism's last cell is erased).
- **Affects:** RFC-001 (`BattleSummary` defined; `Battle.organismIds` invariant + schema `superRefine`), RFC-005 (Decision 8 — one placement definition, summary-borne index, session-state rule), RFC-006 (Decision 4 closure seed / Decision 5 roster reconstruction notes), M7 (parenthetical). **PRD: no change needed** — FR-1.3/1.4/1.7 say "used/referenced" without defining it; placement is the natural reading (product-confirmed 2026-07-09).

**Decision.** An organism is **used by a battle iff it has ≥1 cell on that battle's `initialGrid`** — one definition for the FR-1.3 warning, the FR-1.4 delete block, and the FR-1.7 battle list. (Rule references, Decision E.5, remain the separate second axis of "referenced.")

- **H.1 — Persisted `organismIds` ≡ the placed set.** Invariant at rest: every entry has ≥1 cell in `gridState` (schema-`superRefine`d, in the Decision G spirit), and every cell value indexes into it (G.2). Saving a battle **prunes** the roster: erasing an organism's last cell removes its entry at save, with the Decision E.2 `gridState` remap.
- **H.2 — Unpainted dropdown entries are session state.** An organism added to the Edit-mode Organism Dropdown but never painted lives only in RFC-005's working state — never persisted, never blocks deletion, gone on close/reload. This matches the envelope by construction: the export format carries **cells only, no roster field**, so an unplaced roster member could never survive a round trip anyway; with H.1 the round trip is lossless and no format change is needed.
- **H.3 — The saved/open split is now the same rule from two sources.** Saved battles contribute usage via `organismIds` (≡ placed); the open battle via its live `initialGrid`; RFC-005's existing union-and-dedupe handles the unsaved-erase window (a saved reference keeps counting until the erase is saved). FR-1.4's remedy "remove it from those Battles" concretely means: erase its cells and save.
- **H.4 — `BattleSummary` is defined and carries the placed `organismIds`.** `{ id, name, gridSize, organismIds, createdAt?, updatedAt }` — everything but the heavy `gridState`. The Decision 8 usage index builds from `list()` with zero grid deserialization; thumbnails stay on-demand from `load()` (M4). *(2026-08-07, Story 1.10: `createdAt` added, optional, to satisfy FR-7.3's "date created" without requiring `load()` per tile — `list()` skips records the summary schema rejects, so the field is optional rather than required to avoid silently narrowing what the Gallery shows.)*

### Decision I — One migration pipeline: `formatVersion` is the only version anything branches on

- **Status:** Accepted — 2026-07-09
- **Resolves:** Architecture adversarial-review finding #7 (three version axes — envelope `formatVersion`, per-organism rule `schemaVersion`, `PALETTE_VERSION` — with two incompatible conventions: RFC-006 keyed migrations by *source* version while RFC-004 keyed them by *target* version and ran them in a second pipeline at organism load; palette migrations ran "alongside" with no defined order or owner).
- **Affects:** RFC-006 (Decision 3 + Alternative 5 — now normative), RFC-004 (§2.4 `loadSurvivalRules` rewritten to parse+assert; Risk 7; guiding principle 7), RFC-007 (Decision 1 migration-safety note, Risk, Next Steps), RFC-001 (`OrganismSchema.schemaVersion` comment). **PRD: no impact** (internal data-evolution machinery).

**Decision.** There is exactly **one** migration pipeline — RFC-006's — and `formatVersion` is the **only** version any loader branches on.

- **I.1 — One driver.** Any change to any persisted shape — envelope structure, battle fields, organism/rule schema (RFC-004), a destructive palette-token change (RFC-007 removal/rename) — **bumps `formatVersion`** and lands as one step in RFC-006's registry. There is no rule-migration pipeline at organism load and no palette pipeline "alongside."
- **I.2 — One convention: source-keyed.** `MIGRATIONS[from]` upgrades `from → from+1`, looped while `from < CURRENT_FORMAT_VERSION` (RFC-006 Decision 3 as written). RFC-004's target-keyed `range(schemaVersion + 1, …)` pipeline is retired.
- **I.3 — One execution site, two entry points.** Migrations run only where data crosses a persistence boundary: at-rest load (`gol:schema` drives it) and file import — never when the engine consumes an organism. A step is **one atomic function** that performs all rewrites it needs internally, in the fixed order *structure → rules → palette tokens*; steps compose in version order. Cross-pipeline ordering questions cannot arise because there is one pipeline.
- **I.4 — Subordinate versions are stamps, not switches.** `organism.schemaVersion` is written by whichever `formatVersion` step touches rules and **asserted** at load (mismatch ⇒ corrupt, NFR-7.3 path — never branched on). `PALETTE_VERSION` stamps the token registry for provenance; **additive** palette changes need no migration at all (RFC-007 Decision 1), destructive ones ride a `formatVersion` step that rewrites tokens. Unknown tokens in a same-format file still degrade gracefully (default + warn, NFR-7.3); files from a newer app are already rejected by `formatVersion > CURRENT`.

### Decision J — Theme switching: one immutable MUI theme + an app-owned CSS-variable token layer

- **Status:** Accepted — 2026-07-09
- **Resolves:** Architecture adversarial-review finding #8 (RFC-003 built **two** `createTheme()` objects and swapped which one `ThemeProvider` received on `data-theme` change — a React re-render through Emotion, i.e. exactly the runtime recomputation its CSS-variables rationale claimed to avoid; the <100ms/no-FOUC budget was therefore unsubstantiated).
- **Affects:** RFC-003 (Summary, Decision 2 rewritten, Decision 3 rationale, Risks 3/4); RFC-005 Decision 9 unchanged (it already defers the mechanism here). **PRD: no change** — this aligns the design to NFR-8.2/8.4/8.5's existing acceptance criteria.

**Decision.** All theme-varying values are app-owned CSS custom properties (`--gol-*`) defined per `[data-theme='…']` block in a dedicated CSS file. **One** `createTheme()` references only `var(--gol-*)` strings (palette, typography, and radius/overrides via `components.styleOverrides`). A theme switch is a single `data-theme` attribute flip on `<html>` — the theme object, `ThemeProvider`, and React tree never change, so the switch costs a browser variable-recompute + repaint (genuinely within <100ms/<16ms), and the NFR-8.5 inline script keeps first paint FOUC-free.

- **J.1 — Why not MUI's packaged `colorSchemes` mode:** schemes vary the **palette only** — but Clinical Lab vs Biotech Terminal also differ in typography (sans vs monospace), radius (4 vs 0), and component overrides — and Material UI's scheme API is typed/documented for `light`/`dark`, which two *dark* brand themes would have to squat (breaking `applyStyles('dark')`, system-mode, and cross-tab semantics). The design follows MUI's architectural *direction* (attribute-driven CSS variables) with its own token layer.
- **J.2 — Accepted constraints:** no JS colour math on theme values (derived shades become their own tokens, e.g. `--gol-accent-hover`); `contrastText` supplied explicitly per theme; `palette.mode` is constant `'dark'`.
- **J.3 — Single source of truth for the preference:** the FOUC inline script reads the theme from the **`gol:settings`** record (RFC-006 Decision 7) with a defensive parse + default — no separate `theme` localStorage key. Settings toggle = write attribute + persist via the settings repository (RFC-005 Decision 9).
- **J.4 — NFR alignment:** NFR-8.2 ("applied via data attribute on root element"), NFR-8.4 ("dedicated CSS files", "component styles reference only CSS variable names", "new theme = (1) new CSS variable definitions, (2) registration in settings"), and NFR-8.5 (script-before-paint) are now satisfied **verbatim** by construction.

These resolve spec-vs-spec drift surfaced in review — mostly RFC-001 (the oldest doc) going stale against the newer authorities (RFC-004 for rules, RFC-006 for persistence). They are alignments, not new product decisions, except #5/#6 which the product owner decided.

1. **Repository interface (RFC-001 ← RFC-006).** RFC-001 already uses `SettingsRepository`; added the bulk methods the serializer needs — `listFull()`, `replaceAll()`, and a **data-only** `clearAll()` (FR-8.5: battles + organisms, never `gol:settings` — Decision F).
2. **Organism/rule schema (RFC-001 ← RFC-004).** RFC-001's `rules: z.array(RuleSchema)` (undefined) → `survivalRules: SurvivalRulesSchema` (RFC-004 is the authority) + `schemaVersion`.
3. **Battle grid shape — dense at rest, sparse on the wire.** Persisted: dense `gridState: number[][]` (RFC-001; `0` = empty, `v` = index+1 into `organismIds`). Runtime: typed-array `Grid` (RFC-004). Wire/export: sparse `cells[]` (RFC-006). The battle repository converts dense↔typed at load/save; the `WorkspaceSerializer` converts dense↔sparse at export/import. *(Product choice; dense at rest is heavier in localStorage than sparse — within NFR-7.2, covered by the FR-8.2 meter.)*
4. **Routing — Next.js App Router (file-based) is canonical;** RFC-005's `<Routes>` snippets are illustrative. The FR-7.9 unsaved guard needs no router-level blocker: a confirm on the in-app **Back** button + `beforeunload` (because modes are state, not routes — RFC-005 Decision 3).
5. **Accessibility (PRD ← RFC-003).** NFR-8.3 relaxed: **Clinical Lab** guaranteed WCAG AA (accessible default, A-4); **Biotech Terminal** is stylistic, not held to AA. Organism colour-blind distinguishability is specified in RFC-007 (gap F — closed).
6. **Determinism — "config, not outcome."** FR-5.4 keeps the random tie-break with **no stored seed**; a shared battle reproduces the initial *configuration*, not a specific run. Documented in PRD A-2 and RFC-004 Risk 6.

### Minor Spec Resolutions

Small specs that needed an owner but not a full RFC (review gaps #10, #11, #13, and the FR-4.6 cost question). Recorded here; light notes added to the owning RFCs. No PRD impact **except M5**, which adds FR-3.12 and amends FR-1.3 / FR-3.3 (product-owned change, applied 2026-06-26).

- **M1 — Default workspace seeding (FR-1.5).** First run (empty storage) and **Clear All Data** (FR-8.5) seed a `DEFAULT_WORKSPACE`: **zero battles** (so the Gallery shows the "Create Your First Battle" prompt, FR-7.4) and **one organism, "Conway's Classic"** (born = 3, survive = 2–3; `agingEnabled: false`; a default `colorToken` from RFC-007; `schemaVersion` + rules per RFC-004). A domain constant, applied by the persistence layer when no `gol:schema` record exists. The same ensure-default seed is also invoked **after Import** to keep Conway's Classic always present (M9). **Owner:** RFC-001 (seed data) + RFC-006 (applied on first run / clearAll / post-import).
- **M2 — Population statistics cost (FR-4.6).** Counts are a **derived view, not engine state**: the `useSimulation` hook computes per-organism living-cell counts with a single ≤O(cells) grid pass **at the throttled publish cadence (≤10 Hz)** — off the per-cycle hot path entirely (≈24k cells × 10 Hz ≈ nothing). Sorting (≤20 organisms) and extinction/skull detection (`count === 0`) happen at the same cadence. The RFC-004 engine stays pure and unchanged. **Owner:** RFC-005.
- **M3 — Organism Editor preview panel (FR-2.7).** A **second, isolated `useSimulation` instance** (RFC-005) over a small dedicated, non-persisted grid, running **only the organism under edit**. It reuses the RFC-004 engine and the RFC-005 hook unchanged — a working proof of engine reusability — and never touches the open battle's state (own subtree + refs). **Owner:** RFC-005 (+ RFC-004 reuse).
- **M4 — Gallery tile thumbnail (FR-7.2).** **Rendered on demand, not stored.** Each tile renders the battle's `initialGrid` through the existing Canvas renderer at small size (auto-fit, loopless `renderStatic`). No generated image is persisted → **zero quota cost, never stale** (resolves RFC-006's open question). **Owner:** RFC-002 (static render) + RFC-006 (open question closed).
- **M5 — In-battle organism editing (FR-3.12, new).** The Organism Editor is reachable from a **third entry point**: an inline **pencil affordance** on each Organism Dropdown row in the Battle Editor (Edit Mode), acting on the selected organism. It opens as a **modal overlay over the mounted `<BattlePage>`** — *not* a route change — so the in-progress (unsaved) `initialGrid` is preserved for free and the FR-7.9 navigation guard is not triggered; on **Save & Close** the shared-Library organism updates and the grid re-renders immediately (FR-7.15). The FR-1.3 warning fires (the open battle counts toward "[N] Battle(s)") and offers **Edit Anyway** (edits the shared organism) or **Cancel** only. **No Clone & Edit / grid rebind from the Battle Editor** (removed 2026-07-08 — see decision log; reverses the 2026-06-26 addition): to make a battle-specific variant the user clones in the Library (FR-1.6) and re-selects it, so no undoable-rebind or clone-lifecycle machinery is needed. No new route, no battle-draft persistence machinery (chosen over a real `/organism/[id]` route). **Owner:** RFC-005 (modal-over-battle) + RFC-003 (entry-point/modal) + UX organism-editor-design.md (third entry point, contextual "Back to Battle"). *(Library clones are managed manually — no zero-reference GC; FR-1.6/FR-1.4.)*
- **M6 — Organism count is uncapped; colours are reusable (validation C-1).** The 20-colour palette **no longer caps organism count**. Colour uniqueness is dropped: every palette token is always selectable and may be reused, with **two non-blocking warnings** — (a) in the **Organism Editor** when a colour another organism already uses is picked (FR-2.3), and (b) in the **Battle** when two organisms placed in the same battle share a colour, i.e. will be indistinguishable on the grid (FR-3.3). A new organism still defaults to the next unused token for convenience. The palette stays a **curated, developer-extensible token registry** (currently 20; appending is additive per RFC-007 Decision 1, no migration, no end-user colour authoring in MVP). Three previously-conflated "20"s are now distinct and single-sourced: **palette size** = a curation/quality choice (not a cap); **NFR-1.1 "20"** = a per-grid *performance* baseline (organisms co-placed on one grid); **NFR-7.2** = *storage* capacity, raised to **~200 organisms soft-guidance, not hard-capped** (bounded by the localStorage budget, graceful on quota). One hard technical bound does exist and is stated: a **single battle's roster is capped at 255 organisms** by the dense-encoding/`Uint8Array` occupant representation — schema- and UI-enforced, practically unreachable (Decision G.3); "uncapped" here means the workspace library. Create New (FR-1.2) and Clone (FR-1.6) are therefore uncapped by colour. **Owner:** RFC-007 (palette/reuse/warning + extensibility) + PRD product decision (FR-1.2/1.6/2.3/3.3, NFR-7.2). Resolves validation-report **C-1**.
- **M7 — Delete-organism is a whole-workspace hard block; usage is a read-only click-through (validation C-2).** Deleting an organism is **blocked whenever it is referenced by any saved Battle or the open grid** — a whole-workspace check, not just the current Petri Dish (FR-1.4). ("Referenced" = **placed** on the battle's `initialGrid` — Decision H; rule references are the separate E.5 axis.) The error names the count and the specific Battles and states the two remedies (remove it from those Battles, or delete the Battles). Because delete is blocked while referenced, a stored **dangling organism reference is unreachable** through normal use (closes the finding's "define load-time behaviour" — the state can't arise; import still tolerates an unknown id defensively via NFR-7.3 fallback). A new **FR-1.7 (Organism Usage Visibility)** surfaces *which* Battles: the "Used in [N] Battle(s)" count (in the FR-1.3 edit warning, the FR-1.4 delete error, and a persistent Organism-Editor-footer indicator) is a click-through to a **read-only popover of Battle names** — names only, no navigation, because the editor may be a modal over an in-progress Battle (FR-3.12/M5). All three consume the **existing** RFC-005 Decision 8 `organismId → battleId[]` usage index (no new stored structure); the PRD FR-1.4 previously lagged at "current grid only" while RFC-005 already intended the whole-workspace check, so this also reconciles that PRD↔RFC gap. **Owner:** RFC-005 (usage index + delete rule + name lookup) + RFC-006 (aggregate invariant enforced on delete) + PRD product decision (FR-1.3/1.4/1.7). Resolves validation-report **C-2**.
- **M8 — Import is a destructive whole-workspace replace, guarded by a mandatory warning + export-first (validation C-3, also closes H-7).** Import **replaces the entire workspace** — a replace, **not** a merge/add — and this holds even for a single-Battle file (FR-8.4). The contradiction the finding caught (the Sharing UJ promised a friend could import a Battle to "see the exact same setup," while FR-8.4 nukes their workspace) is resolved by *owning* the destructiveness, not by adding a non-destructive path: import **always** warns that the current workspace will be lost and offers **Export Current Workspace First** (runs the FR-8.3 export, then returns to the prompt), for both workspace and single-Battle imports; the envelope `kind` names what's being imported. "Replaces the entire workspace" means **all battles and organisms — never the importer's settings**, which no envelope carries and the data-only `clearAll()` cannot reach (Decision F). The UJ Sharing narrative and FR-7.13 are reworded to admit the replace. **Multiple side-by-side workspaces and a non-destructive add/merge import are explicitly deferred** (PRD Non-Goals) — a future `mergeWorkspace`/multi-workspace variant lands alongside the atomic-replace path (RFC-006 Decision 5), dovetailing with the connected-mode import-application already deferred (RFC-006 Decision 9). **Owner:** RFC-006 (atomic replace + warning/export-first semantics) + PRD product decision (FR-8.4/7.13, UJ, Non-Goals). Resolves validation-report **C-3** (and **H-7**).
- **M9 — Pre-loaded "Conway's Classic" is a protected, always-present default (validation H-A).** The C-2 delete rewrite (M7) left the FR-1.5 "shall include" invariant defeatable. Resolution (product decision): Conway's Classic is a **protected system organism — it cannot be deleted** (FR-1.4 exempts it regardless of usage; its Delete affordance is disabled), and the "always present" invariant is **ensured at every point where the app initializes or replaces the workspace**: first run + Clear All (already M1's `DEFAULT_WORKSPACE` seeding) **and now Import** — after an atomic replace (M8), the default is **re-added if the imported envelope lacks it** (a single-Battle export legitimately may not contain it). The app **deliberately does not** defend against out-of-band manual JSON edits (a hand-removed default) — that tamper case is out of scope, no validation/self-heal-on-plain-load added. So the invariant holds through all in-app operations without new corruption-handling machinery; it reuses the M1 seed helper at the import boundary. **Owner:** RFC-001 (seed helper `DEFAULT_WORKSPACE`/ensure-default) + RFC-006 (invoke ensure-default after `importWorkspace` replaceAll; delete-protection is a library rule) + PRD product decision (FR-1.4/1.5/8.4). Resolves validation-report **H-A**.
- **M10 — Cross-action-type precedence is a property of the simulation strategy (validation H-5/H-6).** The PRD left two competition questions open: **Die-vs-Survive** (H-5) and **Born-vs-Survive on an occupied cell** (H-6). Resolution (product decisions): **(H-5) death precedes survival** — a matching Die rule removes a cell regardless of a matching Survive rule or the configured rule order; **(H-6) survival and birth claims compete uniformly by Dominance** — incumbency grants no protection beyond Dominance, so a higher-Dominance birth can evict a surviving incumbent (ties random, FR-5.4). Crucially, **these are semantics of the MVP three-phase *strategy*, not invariants of the organism or the rules engine** (RFC-004 §3.1): an organism is strategy-agnostic data (rules + a configured order, FR-2.6), and *how* those actions are prioritized is owned by the active strategy. This keeps the competition mechanic a **decoupled, single-place knob** — a future strategy can preserve each organism's global rule order, or prioritize actions differently, by touching simulation logic alone (deferred — PRD Non-Goals / RFC-004 Future Extensions). Two clarifications ride along: **FR-2.6** sort is priority *within a phase* (Die in Phase 1; Born/Survive together in Phase 2), not across; and **implicit death** resolves at cycle-end (only explicit Die rules remove cells in Phase 1), so a non-surviving cell still counts as a Phase-2 neighbour — preserving simultaneous-generation semantics for Conway's Classic (survive 2–3, no Die rule). **UJ-1 ("Blue holds its corner") is re-validated as consistent — no change:** relative Cell State (Decision C) means an ordinary empty-cell Born rule can't target an occupied cell, so eviction is opt-in for deliberately-written "invader" rules that the UJ organisms don't use. **Owner:** RFC-004 (strategy layer §3.1, three-phase precedence §3.2, phase-partitioned evaluators §2.3/§3.5) + PRD product decision (FR-5.1/5.2/5.3/5.4, FR-2.6, Non-Goals). Resolves validation-report **H-5/H-6**.

## Requirement → RFC Traceability

Every PRD requirement maps to an owning spec (Success Metric 5). "Decision X" / "Mn" refer to the Cross-Cutting Decisions and Minor Spec Resolutions above.

### Functional requirements

| FR group | Owning spec(s) |
|---|---|
| **FR-1** Organism Library & Management | RFC-001 (entity), RFC-005 (usage index, integrity FR-1.3/1.4/1.7), RFC-006 (pre-loaded organism — M1; delete-invariant enforced — M7); in-battle edit entry FR-1.3 — M5; uncapped create/clone FR-1.2/1.6 — M6; whole-workspace delete block + usage visibility FR-1.4/1.7 — M7; protected always-present default FR-1.5 — M9; rule-reference delete block + visibility FR-1.4/1.7 — Decision E.5; "used" = placed on the grid, index built from `BattleSummary` — Decision H |
| **FR-2** Organism Editor | RFC-004 (survival rules FR-2.5/2.6 — rule order is config; applied by the active strategy, M10; organism-targeting persisted by library id — Decision E), RFC-007 (colour FR-2.3, reusable-with-warning — M6), RFC-005 (preview panel — M3) |
| **FR-3** Petri Dish — Edit Mode | RFC-005 (state, undo, resize), RFC-002 (rendering), Decision A (size + FR-3.11), in-battle organism edit FR-3.12 — M5, shared-colour warning FR-3.3 — M6 |
| **FR-4** Petri Dish — Play Mode | RFC-005 (controls, population — M2), RFC-004 (step; auto-stop = extinction only — H-α, supersedes H-4 freeze scope), Decision B.5 (extinction-only auto-stop), Decision D (speed), Decision A (FR-4.9) |
| **FR-5** Simulation Engine | RFC-004 (+ Decision B aging, Decision C cell-state, M10 cross-action precedence — strategy-owned, Decision E ids-at-rest / refs-at-runtime) |
| **FR-6** Battle Export | RFC-006 (envelope; rule-aware referenced-organism closure — Decision E.5); single-Battle import unified under FR-8.4 (Settings) |
| **FR-7** Battle Gallery & Workspace | RFC-005 (routing, gallery, guard), RFC-006 (workspace export/import), RFC-002 (thumbnail — M4) |
| **FR-8** Settings | RFC-006 (workspace mgmt, auto-save; destructive Import + warning/export-first FR-8.4 — M8; settings device-local, never exported, survive Import & Clear All — Decision F), RFC-003 (display prefs/theme), RFC-005 (settings load), Decision A (FR-8.10), Decision D (FR-8.12) |

### Non-functional requirements

| NFR group | Owning spec(s) |
|---|---|
| **NFR-1** Performance | RFC-002, RFC-004, RFC-005; Decisions A & D; RFC-008 (perf/benchmark tests) |
| **NFR-2** Browser Compatibility | RFC-002 (Canvas), RFC-008 (Playwright cross-browser matrix) |
| **NFR-3** Device & Screen Support | RFC-003 (responsive), RFC-002 (auto-fit, Decision A.5) |
| **NFR-4** Usability | RFC-003 (a11y/feedback), RFC-005 (responsive interactions) |
| **NFR-5** Maintainability & Code Quality | RFC-004 (SOLID/patterns), RFC-008 (90% coverage, NFR-5.1); all RFCs satisfy NFR-5.3 (decisions documented) |
| **NFR-6** Deployment | RFC-001 (static export, $0 hosting) |
| **NFR-7** Data Persistence | RFC-006 (localStorage, quota, corruption), RFC-001 (repositories); ~200-organism soft cap NFR-7.2 — M6 |
| **NFR-8** Theming | RFC-003 (theme system, contrast; one immutable theme + `--gol-*` token layer — Decision J), RFC-007 (organism colours, colour-blind — reconciliation #5) |

## MVP vs. Post-MVP Scope

**In MVP (Standalone):** all 8 FR groups; localStorage persistence + export/import; the single hard-coded 3-phase simulation strategy; size-parametric grids (Decision A) with Edit + Play resize; both themes; the extensible, reusable-with-warning token palette (currently 20 colours, RFC-007 / Decision M6); the full test/tooling chain (RFC-008).

**Explicitly deferred (post-MVP), with their owning spec:**
- **Connected mode** — FastAPI + DB, auth, sync/merge, bulk import-application (RFC-001; RFC-006 Decision 9).
- **IndexedDB** persistence (escape hatch) (RFC-006 Decision 7).
- **Selectable simulation strategies** — registry, descriptor, per-battle UI (RFC-004 §3.1, Future Extensions).
- **`ne` operator, new subjects, `RuleSetCollection` / OR rules** (RFC-004; Decision C.4).
- **Redo** (RFC-005 Decision 6).
- **Web Worker** for the engine (RFC-002; Decisions A.4 / D.4).
- **Pigment CSS** build-time extraction (RFC-003 Risk 3).
- **Light theme / per-theme palette variants** (RFC-007 Decision 5).
- **Multiple workspaces & non-destructive (add/merge) import** — MVP has one workspace and Import always replaces it (FR-8.4 / M8); a `mergeWorkspace`/multi-workspace model is deferred (RFC-006 Decision 5, dovetails with connected-mode import-application, Decision 9).

## Outstanding Follow-ups

- **Re-run PRD validation** — the PRD was edited for Decisions A & D, reconciliations #5/#6, and FR-2.3; the validation report predates these.
- **CVD-validate the palette hexes** (currently 20; RFC-007 / RFC-008) — an engineering task; the token model means re-tuning or appending needs no data migration.
- **Capture perf baselines** across the four grid sizes (RFC-008 / Decision A) to confirm the graceful-degradation claim.
- **FR-3.2 auto-fit** is marked "open to revisit" (Decision A.5).
- **FR-8.11 vs A-2 auto-save semantics** — ✅ Resolved 2026-06-26. FR-8.11 reframed to an Edit-Mode **Auto-Save toggle (default Disabled)**; the "every N generations during simulation" model is dropped (consistent with A-2 and RFC-006 Decision 8, now confirmed).
- **RFC statuses** — ✅ Resolved 2026-07-13. All eight RFCs reviewed and Approved (RFC-001, RFC-007 on 2026-07-10; RFC-004, RFC-006, RFC-005, RFC-002, RFC-003, RFC-008 on 2026-07-13); architecture phase closed.