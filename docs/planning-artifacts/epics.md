---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - 'docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md'
  - 'docs/planning-artifacts/architecture.md'
  - 'docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/ux-design-complete.md'
  - 'docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md'
  - 'docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md'
  - 'docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md'
  - 'docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md'
  - 'docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md'
  - 'docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md'
  - 'docs/planning-artifacts/rfcs/RFC-006-persistence-workspace-schema.md'
  - 'docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md'
  - 'docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md'
  - 'docs/planning-artifacts/component-tree-battle-page.md'
---

# GameOfLife - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for GameOfLife (Game of Life Studio), decomposing the requirements from the PRD, UX Design, and Architecture (umbrella document + RFC-001…008) into implementable stories.

Requirement IDs below preserve the PRD's canonical numbering (FR-1.1 … FR-8.12, NFR-1.1 … NFR-8.5) for traceability with the architecture documents. PRD tombstones (FR-6.2, FR-7.11, FR-7.12, FR-7.14, FR-8.9) are excluded — they were merged, moved, or removed and are retained in the PRD only for ID stability.

## Requirements Inventory

### Functional Requirements

**FR-1: Organism Library & Management**

- FR-1.1: View Organism Library — list all organisms with name and color indicator
- FR-1.2: Create New Organism — open Organism Editor with defaults; count uncapped by palette (bounded only by storage, NFR-7.2)
- FR-1.3: Edit Existing Organism — from Library or Battle Editor; "used in [N] Battle(s)" warning with Edit Anyway / Clone & Edit (Library) or Edit Anyway / Cancel (Battle Editor)
- FR-1.4: Delete Organism — whole-workspace hard block when referenced (any saved Battle, current grid, or another organism's rules targeting it); union of live-grid and saved-index usage; Conway's Classic protected (never deletable); referential-integrity guarantee
- FR-1.5: Pre-loaded Organism — "Conway's Classic" (Born 3, Survive 2–3, Dominance 50, aging off); always present; re-seeded on first run, Clear All, and Import
- FR-1.6: Clone Organism — "[Name] (Copy)" default, reuses source color, ordinary manually-managed organism
- FR-1.7: Organism Usage Visibility — "Used in [N] Battle(s)" + "Targeted by [M] organism rule(s)" counts with read-only, no-navigation popover of names; consistent at all surfaces (edit warning, delete error, editor footer)

**FR-2: Organism Editor**

- FR-2.1: Edit Organism Name (text)
- FR-2.2: Edit Dominance Value (integer 1–100; higher wins conflicts)
- FR-2.3: Set Organism Color — pre-set 20-color developer-extensible palette; colors reusable with non-blocking warning; new organism defaults to next-unused (then least-used) token; identical across themes
- FR-2.4: Toggle Aging Degradation — per-organism visual-only toggle (age tracking unaffected)
- FR-2.5: Define Survival Rules — Summary + Action (Born/Die/Survive) + AND-combined conditions over properties (Cell State, Organism Type, Age of Cell, Neighbor Count, Occupant Neighbor Count) with operands (=, >, <, >=, <=, range)
- FR-2.6: Sort Survival Rules — manual reorder = priority within a phase (applied by the active simulation model)
- FR-2.7: Initial State & Preview Panel — isolated test grid + simulation using the same engine as Play Mode, honoring extinction auto-stop

**FR-3: Petri Dish — Edit Mode**

- FR-3.1: Display Grid — default 100×60 (user-configurable default per FR-8.10); per-battle, resizable among editable presets
- FR-3.2: Grid Display (Auto-Fit) — whole grid always visible; cell size = canvas ÷ dimensions; immediate update on resize
- FR-3.3: Organism Selection — dropdown of all organisms (name + color) plus Eraser; per-row edit-pencil affordance; non-blocking same-color-in-battle warning
- FR-3.4: Place Organism Cells (Click)
- FR-3.5: Place Organism Cells (Drag)
- FR-3.6: Erase Cells (click or drag with Eraser)
- FR-3.7: Reset Grid (clear all cells)
- FR-3.8: Undo — 30 levels; survives Edit↔Play switches; resets on return to Gallery
- FR-3.9: Name Battle (text)
- FR-3.10: Toggle to Play Mode — current grid becomes the initial configuration
- FR-3.11: Resize Grid (Edit Mode) — editable presets {50×30, 100×60} only; top-left anchored; warn before clipping; undoable; persisted on save
- FR-3.12: Edit Organism from Battle Editor — Organism Editor as modal overlay over the Battle; grid preserved, no save required; FR-1.3 warning (Edit Anyway / Cancel only); grid re-renders on Save & Close

**FR-4: Petri Dish — Play Mode**

- FR-4.1: Play/Pause Control — resume continues from paused state
- FR-4.2: Speed Control — presets 1, 2, 5, 10 (default), 20 gen/sec; adjustable during playback; tick rate decoupled from render rate
- FR-4.3: Step Forward (Next Cycle) — advance exactly one cycle
- FR-4.4: Stop and Reset — halt and return to initial state
- FR-4.5: Cycle Counter — starts at 0, increments per step
- FR-4.6: Population Statistics — horizontal bars per organism (color, name, %), sorted; extinct organisms at bottom with skull indicator
- FR-4.7: Auto-Stop on Extinction — auto-pause (not Stop) only when zero living cells; frozen grids/oscillators/gliders intentionally NOT auto-stopped
- FR-4.8: Toggle to Edit Mode — halts simulation, displays initial state
- FR-4.9: Resize Grid (Play Mode) — any preset incl. 150×90/200×120; only while paused; ephemeral (never persisted)

**FR-5: Simulation Engine**

- FR-5.1: Cycle Execution — three-phase evaluation is the MVP's single simulation model; the model (not the organism) owns cross-action precedence
- FR-5.2: Phase 1 Death Evaluation — Die rules only; death precedes survival; explicit deaths removed before Phase 2 neighbor counting; implicit (no-match) deaths resolve at cycle end
- FR-5.3: Phase 2 Birth & Survival — all organisms in parallel against the post-death intermediate grid; candidate claims; sorted priority within phase
- FR-5.4: Phase 3 Conflict Resolution — higher Dominance wins; ties broken randomly (no stored seed — "config, not outcome"); Survive and Born claims compete uniformly (birth can evict an incumbent); relative Cell-State gating makes eviction opt-in
- FR-5.5: Rule Evaluation — properties/operands/values per the Organism Editor
- FR-5.6: Cell Aging — +1 per surviving cycle; resets to 0 on rebirth; engine state and first-class rule input
- FR-5.7: Visual Aging Degradation — 30% saturation at age 0, +10%/cycle, 100% cap at age 7
- FR-5.8: Neighbor Calculation — Moore neighborhood (8 adjacent)
- FR-5.9: Grid Edge Behavior — hard boundaries, no wrap; edge/corner cells have <8 neighbors

**FR-6: Battle Export**

- FR-6.1: Export Battle — JSON file of initial (Edit-mode) grid state only
- FR-6.3: JSON Format — battle name, grid dimensions, complete organisms, initial grid state, metadata (export timestamp, app version, format version)
- FR-6.4: File Naming — default filename from Battle name (e.g. `triple-threat.json`)

**FR-7: Battle Gallery & Workspace Management**

- FR-7.1: Battle Gallery View (Home Page) — tiles sorted by last modified (most recent first)
- FR-7.2: Battle Tile Display — name + miniature static snapshot of initial grid
- FR-7.3: Battle Tile Metadata — created/modified dates, organism names (tooltip or expandable)
- FR-7.4: Create New Battle — empty Petri Dish in Edit Mode; "Create Your First Battle" prompt when none exist
- FR-7.5: Open Battle for Editing (from Gallery)
- FR-7.6: Run Battle Simulation (open directly in Play Mode from Gallery)
- FR-7.7: Delete Battle — with confirmation prompt
- FR-7.8: Save Battle — explicit save; create-or-update; updates last-modified timestamp
- FR-7.9: Unsaved Changes Warning — confirm on back-to-Gallery; browser warning on tab close
- FR-7.10: Navigation to Gallery — Back button from any Battle view
- FR-7.13: Single Battle Export with Workspace Option — "Battle only" (battle + placed organisms, rule-aware closure) vs "Entire Workspace"
- FR-7.15: Shared Organism Library — workspace-level; edits affect all Battles; clone for variants

**FR-8: Settings Management**

- FR-8.1: Settings Page — accessible from main navigation; changes apply immediately or on confirm; persist in localStorage
- FR-8.2: Workspace Statistics Display — battle count, organism count, storage used (real-time, KB/MB)
- FR-8.3: Export Workspace — all battles + organisms; `game-of-life-workspace-YYYY-MM-DD.json`; metadata included
- FR-8.4: Import (unified) — accepts workspace or single-Battle exports; destructive whole-workspace replace; mandatory warning + "Export Current Workspace First" option (suppressed only for pristine workspaces); JSON validation; success/error feedback; Conway's Classic re-ensured after import
- FR-8.5: Clear All Data — warning + confirmation; returns workspace to default state (Conway's Classic only); settings preserved
- FR-8.6: Theme Selection — "Clinical Lab" (default) / "Biotech Terminal"; immediate application without reload; persists
- FR-8.7: Grid Lines Toggle — applies to Gallery tiles, Edit and Play Modes; default on; persists
- FR-8.8: Cell Animation Toggle — pulsing living-cell animation; default on; persists
- FR-8.10: Default Grid Size — {50×30, 100×60 (default)} for new battles only; persists
- FR-8.11: Auto-Save — Edit-Mode-only toggle, default Disabled; inert until first manual save; never runs during Play Mode
- FR-8.12: Default Simulation Speed — same ladder as FR-4.2 (default 10 gen/sec); sets starting speed; persists

### NonFunctional Requirements

- NFR-1.1: 60 FPS guaranteed at 100×60 grid with up to 20 co-placed organisms (baseline); graceful degradation beyond (reduce gen/sec first, then render FPS)
- NFR-1.2: Initial page load < 2s on desktop broadband
- NFR-1.3: Time to interactive < 3s
- NFR-1.4: localStorage read/write < 10ms (p95)
- NFR-2.1: Support last 2 versions of Chrome, Firefox, Safari, Edge (IE11 excluded)
- NFR-2.2: Requires HTML5 Canvas, localStorage, ES6+
- NFR-3.1: Minimum screen width 1024px (desktop + tablet)
- NFR-3.2: Desktop and tablet only (mobile phones excluded)
- NFR-4.1: No tutorial required — self-explanatory interface
- NFR-4.2: Immediate visual feedback on interactions (< 100ms)
- NFR-5.1: 90%+ test coverage on core simulation and integrity logic (rules engine, three-phase step, Dominance resolution, whole-workspace referential-integrity guarantee); Conway golden-pattern + multi-organism conflict tests required
- NFR-5.2: Demonstrate SOLID + load-bearing design patterns (Repository, Strategy, Adapter, Dependency Injection, Factory)
- NFR-5.3: Architectural decisions documented in decision logs/RFCs
- NFR-6.1: Fully offline, zero backend (static export + localStorage)
- NFR-6.2: $0/month hosting (Vercel / GitHub Pages)
- NFR-7.1: Workspace persisted in browser localStorage
- NFR-7.2: Soft capacity ~50 Battles / ~200 organisms; organism count storage-bounded, not hard-capped; graceful quota-exceeded failure preserving existing data
- NFR-7.3: Validate workspace data on load; handle corruption gracefully (error + reset offer)
- NFR-8.1: Themes via CSS custom properties; no hard-coded colors in components
- NFR-8.2: Theme switch < 100ms, no reload, no flash/layout shift; applied via `data-theme` attribute on root
- NFR-8.3: Clinical Lab meets WCAG AA contrast (4.5:1 / 3:1); Biotech Terminal is stylistic (not held to AA); organism colors distinguishable for color-blind users
- NFR-8.4: New themes addable without modifying component code
- NFR-8.5: Theme loads before first paint (no FOUC) — synchronous inline script in `<head>`

### Additional Requirements

Extracted from the Architecture umbrella document (Decisions A–K, M1–M10, Cross-RFC Reconciliations) and RFC-001…008.

**Project scaffold & infrastructure (RFC-001, RFC-008) — no external starter template; scaffold defined by RFC-001:**

- AR-1: Turborepo monorepo — `apps/web` (Next.js) + `packages/domain`, `packages/simulation`, `packages/persistence`, `packages/test-utils`; workspace + `turbo.json` task config (`apps/api` is post-MVP)
- AR-2: Next.js App Router + TypeScript strict; standalone mode statically exported via `output: 'export'`; build-time mode selection through `NEXT_PUBLIC_MODE` + repository factory
- AR-3: CI/CD — GitHub Actions pipeline: typecheck → lint → unit/integration + coverage gates → build (bundle budget ~300KB) → e2e (Playwright, 3 browsers) → a11y (axe); husky + lint-staged pre-commit; $0 static deployment (Vercel/GitHub Pages)
- AR-4: Toolchain — Vitest (+ v8 coverage, bench), React Testing Library, Playwright (Chromium/Firefox/WebKit), fast-check, axe-core, ESLint + Prettier, `tsc --noEmit`
- AR-5: `@gol/test-utils` package — grid builders, fake repositories, fixed RNG seeds, canonical organisms (Conway's Classic + the three PRD organisms)

**Domain, persistence & integrity (RFC-001, RFC-006, Decisions E–I, M1, M7–M9):**

- AR-6: Repository pattern with DI — `BattleRepository` / `OrganismRepository` / `SettingsRepository` (async interfaces), localStorage implementations, `BattleSummary` lightweight projection, bulk `replaceAll` + data-only `clearAll`
- AR-7: Zod schemas as the single source of truth, enforcing architecture invariants at both boundaries: `EditableGridPresetSchema` ({50×30}|{100×60} literals), BattleSchema superRefines (gridState dims match gridSize; cell values index into roster; roster ≡ placed set), ≤255 organisms per battle
- AR-8: Organism ids stable at rest; numeric `OrganismRef`s runtime-only, interned at simulation start (Decision E); rule `organismType` patterns persist library ids; never-match sentinel for absent targets
- AR-9: localStorage namespace `gol:schema` / `gol:battles` / `gol:organisms` / `gol:settings`; dense `gridState` at rest, sparse cells on the wire; conversion at repository/serializer boundaries
- AR-10: `WorkspaceSerializer` — versioned export envelope (`formatVersion` 1, `kind: workspace|battle`), rule-aware transitive referenced-organism closure on battle export; atomic import (parse → migrate → validate → closure assert → snapshot → replace → rollback on failure)
- AR-11: Single source-keyed migration registry applied at both boundaries (at-rest load + file import); `schemaVersion` / `PALETTE_VERSION` are stamps, never branch points; newer-version files rejected
- AR-12: Settings are device-local — never in any export envelope; import and Clear All cannot touch `gol:settings` by construction (Decision F)
- AR-13: `DEFAULT_WORKSPACE` seeding (zero battles + Conway's Classic) on first run, Clear All, and post-import (`ensureDefaultOrganism`)
- AR-14: Quota strategy — usage meter (FR-8.2), `QuotaExceededError` caught with non-destructive message, candidate-string-then-`setItem` so a failed write never truncates existing data
- AR-15: Organism-usage index derived from `BattleSummary.organismIds` (no grid deserialization; no stored structure) + rule-reference index (`targetOrganismId → referencingOrganismId[]`); "used" = placed on the grid (Decision H); union of saved index + live grid, deduped by battle id

**Simulation engine (RFC-004, Decisions B, C, M10):**

- AR-16: Three-layer functional design (no classes): generic domain-agnostic Rules Engine (`Condition`/`Rule`/`RuleSet`, `firstSatisfiedBy`) → GoL rules layer (`CellSubject`, `SurvivalRules`, `resolveCellAction`) → Simulation Engine (pluggable strategy, three-phase hardcoded for MVP)
- AR-17: Typed-array grid — `occupant: Uint8Array`, `age: Uint16Array`, double-buffered, size-parametric; pure `resizeGrid` (top-left anchor)
- AR-18: Precompiled per-organism evaluators (cached by `contentHash`, session-scoped), phase-partitioned (death evaluator / birth-survival evaluator)
- AR-19: Seedable injected RNG (fixed seed in tests; fresh seed in production — "config, not outcome")
- AR-20: Cell State is three-valued and relative (`empty | alive | occupied`); age saturates at `MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)` computed per battle at compile time
- AR-21: Rule identity — opaque generated `id` + deterministic `contentHash` per rule

**Rendering (RFC-002, RFC-007, Decisions A, B, D, M4):**

- AR-22: Canvas 2D renderer outside MUI — dirty-region tracking (dirty on occupant OR age-shade change), cached grid-line overlay as the only offscreen surface (no cell-layer back buffer — Story 2.3), auto-fit (`cellSize = floor(canvasPx / dimension)`)
- AR-23: Batch rendering by colour state `(colorToken, min(age,7))` — ≤160 fill groups, palette-derived, independent of organism count; per-battle `OrganismRef → fill-group` LUT
- AR-24: RAF loop with time accumulator — one `step()` per `msPerCycle`, ≤1 step/frame, frame delta clamped to `msPerCycle` (no fast-forward burst after tab suspension); repaint only after a step
- AR-25: Loopless `renderStatic` for Gallery tile thumbnails (rendered on demand, never stored) and editor-preview paused frames
- AR-26: Palette token registry — 20 CVD-considered entries ordered by distinguishability; organisms store `colorToken`, hex resolved at render time; `displayColor(token, ageShade)` LUT with constant-lightness saturation ramp; CVD validation of the 20 hexes (documented check)

**Runtime state (RFC-005, Decision D, M2, M3, M5):**

- AR-27: No global store — repositories injected by props at page boundary; three state categories (persisted / ephemeral local / hot refs)
- AR-28: `<BattlePage>` owns mode (`lab | run` as local state, not routes), authoritative `initialGrid`, undo, battleName + dirty flag; three page surfaces only — Gallery (`/`), Battle (`/battle?id=<uuid>`, plus `/battle/new`), Settings (`/settings`). Every route is statically prerenderable; entity ids ride as query params, never dynamic segments (Decision K)
- AR-29: `useSimulation` hook — live grid + RAF in refs, zero React re-renders per cycle; publishes only throttled `cycle` + `population` (≤10 Hz, M2)
- AR-30: `useUndoableGrid` — 30-snapshot ring buffer (occupant + dimensions), gesture-coalesced strokes, ≤180 KB budget; component lifetime = undo lifetime
- AR-31: Dual grid model — authoritative `initialGrid` (edited, saved, exported) vs disposable live grid (cloned on Run start, discarded on Stop/Run→Lab)
- AR-32: Organism Editor preview panel = second isolated `useSimulation` instance over a dedicated non-persisted grid (M3)
- AR-33: Organism Editor opens as modal overlay over mounted `<BattlePage>` (M5) — no route change, unsaved grid preserved, two independent dirty scopes (battle + editor)
- AR-34: One canonical speed scale (gen/sec ladder 1/2/5/10/20, max 20 = 50ms ≥ one frame); `msPerCycle` in a ref for live speed change without loop restart

**UI chrome & theming (RFC-003, Decision J):**

- AR-35: MUI v6 core only (no `@mui/x-*` premium); per-component imports for tree-shaking; dynamic import for heavy components (Organism Editor)
- AR-36: One immutable `createTheme()` referencing only `var(--gol-*)` tokens; theme switch = single `data-theme` attribute flip on `<html>`; `--gol-*` token layer per `[data-theme]` block in a dedicated CSS file
- AR-37: FOUC-prevention inline script in `<head>` reading theme from `gol:settings` (defensive parse, single source of truth)
- AR-38: Animation strategy — MUI transitions for standard UI, CSS keyframes for Biotech Terminal scan-line/glow effects, Framer Motion sparingly; no UI animation during simulation steps

**Testing strategy (RFC-008):**

- AR-39: Engine-heavy test pyramid; per-package coverage gates: ≥90% `packages/simulation` + `packages/domain` (incl. usage/rule-reference derivation and delete-permitted predicate), ~80% `packages/persistence`, no hard gate on `apps/web` glue
- AR-40: Conway golden-pattern suite (blinker, glider, still-lifes) + curated multi-organism conflict scenarios with hand-computed expected grids; generic engine proven with a non-GoL subject
- AR-41: Property-based tests (fast-check) — determinism, phase purity, no born-and-dead contradictions, extinction-only auto-stop, resize invariants, dense↔sparse↔typed round-trip identity
- AR-42: Canvas testing = decision logic as pure units (dirty regions, batch grouping, LUT, auto-fit math); no pixel snapshots beyond smoke checks
- AR-43: Vitest `bench` performance harness — all four grid presets × 20 organisms; 100×60 baseline hard-gates CI; larger grids tracked for graceful degradation
- AR-44: Cross-browser e2e matrix (Chromium/Firefox/WebKit incl. tablet viewport ≥1024px); axe-core a11y checks on key screens (Clinical Lab); serializer round-trip + atomic rollback + settings-preservation integration tests
- AR-45: Dev fixture workspace (party-mode review, 2026-07-15) — the `@gol/test-utils` canonical set is extended with **3 mock organisms + 2 mock battles placing them**, auto-seeded in **dev builds only**; production `DEFAULT_WORKSPACE` unchanged (FR-1.5 / M1 / M9 untouched). The mock organisms jointly cover all 5 condition properties (Cell State, Organism Type, Age of Cell, Neighbor Count, Occupant Neighbor Count), all 6 operands incl. `range`, ≥1 aging-enabled organism, distinct Dominance values, and ≥1 explicit Die-action rule
- AR-46: Lint rule from Story 1.1 — no raw hex/colour literals outside the theme token file and the palette registry (enforces NFR-8.1 mechanically; keeps the Epic 6 second theme cheap)

### UX Design Requirements

Extracted from `ux-design-complete.md` and `organism-editor-design.md`.

- UX-DR1: Two complete theme implementations per the UX token specs — Clinical Lab (sans-serif, cyan `#00d4ff` accent, gray layers, solid buttons, subtle hover lifts) and Biotech Terminal (monospace, matrix-green `#00ff41`, outlined glowing buttons, square corners, dense) — covering buttons, toggles, cards, inputs, badges in both themes
- UX-DR2: Settings theme-selector component — two selectable theme cards (radio semantics) with visual preview sample, name, description; hover (accent border + 2px lift) and active (accent border + glow) states; click-anywhere-on-card selection; immediate application
- UX-DR3: Display Preferences section layout — Theme Selection first, then Show Grid Lines and Cell Animation toggle rows with label + description + divider pattern
- UX-DR4: Biotech Terminal scan-line animation (CSS keyframes) and glow box-shadow effects on interactive elements
- UX-DR5: Organism Editor full-screen modal — three-column layout (Basic Info 320px / Survival Rules flexible ~500–600px scrollable / Preview & Test 400px); header bar with contextual Back label ("◄ Back to Library" / "◄ Back to Battle"), centered title, Save + Close actions; responsive compression at 1024–1400px and two-column below 1024px
- UX-DR6: Editor usage indicator — persistent "Used in [N] Battle(s)" footer label (+ "Targeted by [M] organism rule(s)" when applicable) opening a read-only names popover; "Used in 0 Battles" without expansion when unused
- UX-DR7: Color picker component — 20 swatches in rows, large selected-color display (100×100 with glow), in-use colors remain selectable with non-blocking "already uses this color" warning, no disabled swatches
- UX-DR8: Dominance control — slider (1–100) + synced editable numeric input; default 5 for new organisms; out-of-range values snap to min/max
- UX-DR9: Aging Degradation toggle with saturation-progression visual example (pale → full, age 0 → 7)
- UX-DR10: Rule card component — drag handle, colored action badge (Born green / Survive cyan-blue / Die red), rule label, delete button; summary input (≤100 chars, optional); condition rows (property dropdown → operand dropdown → value input/dropdown, delete per row); "+ Add Condition"; property-appropriate value inputs incl. range as `[Min] — [Max]` with min < max validation
- UX-DR11: Drag-to-reorder rules — elevation + semi-transparency while dragging, accent drop-zone indicators, renumbering on drop
- UX-DR12: Rules empty state — centered icon, "No Rules Defined" message, explanation, primary "+ Add Rule" action
- UX-DR13: Preview & Test panel — 30×20 canvas grid; Draw/Erase mode toggle + Clear; Play/Step/Stop controls, speed slider, cycle counter; runs the organism in isolation with live rule definitions
- UX-DR14: Editor validation & errors — inline errors with red border/icon below fields (name required ≤50 chars with character count, color required, rule needs ≥1 condition, numeric validity); focus moves to first invalid field on save; non-blocking "no rules defined" warning; success toasts ("Organism saved successfully" / "Organism deleted")
- UX-DR15: Editor warning dialogs — edit-in-use (options by entry point), delete blocked by battles (hard block, names + remedies), delete blocked by rule references (hard block, organism names + remedy), safe-delete confirmation, Conway's Classic delete disabled with explanatory message
- UX-DR16: Editor unsaved-changes flow — own scope: "You have unsaved changes. Discard changes?" with Discard / Keep Editing / Save on Cancel/Back/Escape
- UX-DR17: Accessibility patterns — full keyboard navigation (tab order, Escape closes with warning, arrow keys in rules/conditions), `role="dialog"`, ARIA labels on all inputs, validation errors announced, visible high-contrast focus indicators; contrast verification (4.5:1 text, 3:1 controls) for Clinical Lab
- UX-DR18: Battle Gallery UI — grid of battle tiles with hover effects, metadata display, create/edit/delete actions (mockups in both themes)
- UX-DR19: Organism Library UI — grid of organism cards with create/edit/clone/delete actions and a live name search/filter (mockups in both themes)
- UX-DR20: Petri Dish Lab & Play Mode UI — persistent top bar across modes, edit toolset (organism dropdown, undo/reset), play controls (play/pause/step/stop, speed, cycle counter, population bars) per mockups in both themes

### FR Coverage Map

- FR-1.1: Epic 4 — View Organism Library
- FR-1.2: Epic 4 — Create New Organism
- FR-1.3: Epic 4 — Edit organism with in-use warning
- FR-1.4: Epic 4 — Whole-workspace delete block + rule-reference accounting
- FR-1.5: Epic 1 — Conway's Classic seeded with the default workspace (dev builds additionally seed the AR-45 mock fixtures)
- FR-1.6: Epic 4 — Clone Organism
- FR-1.7: Epic 4 — Usage visibility (read-only popovers)
- FR-2.1: Epic 4 — Organism name
- FR-2.2: Epic 4 — Dominance value
- FR-2.3: Epic 4 — Color selection (reusable palette; CVD-validated swatch set is an AC of this epic's picker story, per party-mode review)
- FR-2.4: Epic 4 — Aging degradation toggle
- FR-2.5: Epic 4 — Survival rules builder
- FR-2.6: Epic 4 — Rule sorting/priority
- FR-2.7: Epic 4 — Initial State & Preview panel
- FR-3.1: Epic 2 — Grid display (per-battle size)
- FR-3.2: Epic 2 — Auto-fit rendering
- FR-3.3: Epic 2 — Organism dropdown + Eraser (pencil affordance activates in Epic 4)
- FR-3.4: Epic 2 — Click placement
- FR-3.5: Epic 2 — Drag painting
- FR-3.6: Epic 2 — Erase cells
- FR-3.7: Epic 2 — Reset grid
- FR-3.8: Epic 2 — Undo (30 levels)
- FR-3.9: Epic 2 — Name battle
- FR-3.10: Epic 3 — Toggle to Play Mode
- FR-3.11: Epic 2 — Edit-mode grid resize
- FR-3.12: Epic 4 — Edit organism from Battle Editor (modal)
- FR-4.1: Epic 3 — Play/Pause
- FR-4.2: Epic 3 — Speed control (gen/sec ladder)
- FR-4.3: Epic 3 — Step forward
- FR-4.4: Epic 3 — Stop and reset
- FR-4.5: Epic 3 — Cycle counter
- FR-4.6: Epic 3 — Population statistics
- FR-4.7: Epic 3 — Auto-stop on extinction
- FR-4.8: Epic 3 — Toggle to Edit Mode
- FR-4.9: Epic 3 — Play-mode resize (ephemeral)
- FR-5.1: Epic 3 — Three-phase cycle execution
- FR-5.2: Epic 3 — Phase 1 death evaluation
- FR-5.3: Epic 3 — Phase 2 birth & survival
- FR-5.4: Epic 3 — Phase 3 Dominance conflict resolution
- FR-5.5: Epic 3 — Rule evaluation
- FR-5.6: Epic 3 — Cell aging
- FR-5.7: Epic 3 — Visual aging degradation
- FR-5.8: Epic 3 — Moore neighborhood
- FR-5.9: Epic 3 — Hard grid edges
- FR-6.1: Epic 5 — Export battle
- FR-6.3: Epic 5 — Export JSON format
- FR-6.4: Epic 5 — Export file naming
- FR-7.1: Epic 1 — Battle Gallery home page
- FR-7.2: Epic 1 — Battle tile (name + snapshot via loopless `renderStatic` on the shared renderer contract)
- FR-7.3: Epic 1 — Battle tile metadata
- FR-7.4: Epic 2 — Create new battle (Epic 1's empty state shows the prompt; the action opens the Epic 2 editor)
- FR-7.5: Epic 2 — Open battle for editing
- FR-7.6: Epic 3 — Run battle from Gallery
- FR-7.7: Epic 1 — Delete battle
- FR-7.8: Epic 2 — Save battle
- FR-7.9: Epic 2 — Unsaved changes warning
- FR-7.10: Epic 2 — Back navigation to Gallery
- FR-7.13: Epic 5 — Battle-vs-workspace export prompt
- FR-7.15: Epic 4 — Shared organism library behavior (id-reference data model laid in Epic 1)
- FR-8.1: Epic 5 — Settings page
- FR-8.2: Epic 5 — Workspace statistics
- FR-8.3: Epic 5 — Export workspace
- FR-8.4: Epic 5 — Unified destructive import with warning + export-first
- FR-8.5: Epic 5 — Clear all data
- FR-8.6: Epic 6 — Theme selection
- FR-8.7: Epic 6 — Grid lines toggle
- FR-8.8: Epic 6 — Cell animation toggle
- FR-8.10: Epic 6 — Default grid size
- FR-8.11: Epic 6 — Auto-save toggle
- FR-8.12: Epic 6 — Default simulation speed

## Epic List

### Epic 1: Project Foundation & Battle Gallery
Users see their Battle collection the moment they open the app: a tile gallery with real snapshots, metadata, and safe deletion — and a designed empty state that carries the "what is this app?" burden (no tutorial, NFR-4.1). Includes the monorepo scaffold + CI (split stories per party-mode review: scaffold/CI, then domain entities + complete Zod schemas + repository interfaces), versioned persistence from the first write, `DEFAULT_WORKSPACE` seeding (Conway's Classic, FR-1.5) plus the AR-45 dev-build mock fixtures (3 organisms covering all condition types + 2 battles), Battle Gallery page (tiles sorted by last modified, thumbnails via the shared renderer's `renderStatic`, metadata, delete-with-confirm, empty state), and the Clinical Lab token layer + MUI shell (token-only styling enforced by the AR-46 lint rule). No dead affordances: the Gallery links only to what exists.
**FRs covered:** FR-1.5, FR-7.1, FR-7.2, FR-7.3, FR-7.7

### Epic 2: Battle Editor (Edit Mode & Canvas Renderer)
Users can create and design Battles: open a new or existing Battle into Edit Mode, paint and erase organisms on an auto-fit Canvas grid, undo, reset, resize, name, and save. Establishes the shared Canvas renderer core as a pure `draw(grid)` contract (no internal scheduling — Epic 3 adds the RAF loop around it, per RFC-002 and the party-mode churn review), the `<BattlePage>` mode-state skeleton (Edit/Play as states per RFC-005, with only Edit populated — no Play affordance shipped until Epic 3), `useUndoableGrid` (RFC-005 Decision 6), dual-grid groundwork, the unsaved-changes guard, and graceful quota failure on the save path.
**FRs covered:** FR-3.1–3.9, FR-3.11, FR-7.4, FR-7.5, FR-7.8–7.10

### Epic 3: Living Simulations (Play Mode & Engine)
Users can run their Battles and watch organisms live, compete, age, and go extinct in real time — with the dev-fixture battles (AR-45), multi-organism competition is watchable at the end of this epic. Generic rules engine → GoL rules layer → three-phase simulation strategy (pure functional, typed arrays, seeded RNG, precompiled evaluators), each engine story shipping its own tests (golden patterns, property tests) with a dedicated story only for the harness/benchmarks/coverage-gate flip, the 60 FPS RAF loop with colour-state batching wrapped around the Epic 2 renderer, and the full Play Mode UI (play/pause/step/stop, speed ladder, cycle counter, population bars with extinction indicators, extinction auto-pause, ephemeral resize, run-from-Gallery).
**FRs covered:** FR-3.10, FR-4.1–4.9, FR-5.1–5.9, FR-7.6

### Epic 4: Custom Organisms & the Shared Library
Users can create, edit, clone, and manage their own life forms with custom survival rules — the headline authoring experience ("now create your own"). Organism Library UI, the 3-column Organism Editor modal (dominance, reusable-color picker with CVD-validated swatches, aging toggle, rule cards with keyboard-operable drag-to-reorder, validation), the isolated preview simulation (second `useSimulation` instance, M3), in-battle editing (modal over Battle, M5), and all referential-integrity behavior (whole-workspace delete blocks, rule-reference accounting, usage visibility popovers, protected Conway's Classic).
**FRs covered:** FR-1.1–1.4, FR-1.6, FR-1.7, FR-2.1–2.7, FR-3.12, FR-7.15

### Epic 5: Sharing, Backup & Workspace Management
Users can export Battles to share, import shared files safely, and manage their workspace. Battle export with rule-aware organism closure, workspace export, unified destructive import (mandatory warning + export-first + atomic rollback), migration pipeline (formatVersion 1), Clear All Data, workspace statistics, quota monitoring, and the Settings page shell (complete with what it has — stats, data management — not a lobby for Epic 6).
**FRs covered:** FR-6.1, FR-6.3, FR-6.4, FR-7.13, FR-8.1–8.5

### Epic 6: Theming & Personalization
Users can switch to the Biotech Terminal aesthetic and tune the studio to their preferences. Second theme (token block, scan-lines, glows), theme-selector cards, FOUC-free loading, display preferences (grid lines, cell animation), simulation preferences (default grid size, default speed, auto-save), plus the accessibility **validation** pass (WCAG AA audit, axe-core, CVD palette verification) — validation, not remediation: a11y criteria are baked into every epic's stories from Epic 1.
**FRs covered:** FR-8.6–8.8, FR-8.10–8.12

## Epic 1: Project Foundation & Battle Gallery

Users see their Battle collection the moment they open the app: a tile gallery with real snapshots, metadata, and safe deletion — and a designed empty state that carries the "what is this app?" burden (no tutorial, NFR-4.1). Built on the monorepo scaffold, CI quality gates, complete domain schemas, versioned persistence, workspace seeding, the frozen renderer contract, and the Clinical Lab token layer.

### Story 1.1: Turborepo Monorepo Scaffold

As a developer,
I want a Turborepo monorepo with the Next.js app and domain packages scaffolded,
So that every subsequent story has a consistent, buildable home with enforced boundaries.

**Acceptance Criteria:**

**Given** a fresh clone, **When** dependencies are installed and the workspace build runs, **Then** Turborepo builds `apps/web` plus `@gol/domain`, `@gol/simulation`, `@gol/persistence`, and `@gol/test-utils` via the `turbo.json` task graph (AR-1)
**Given** `apps/web`, **When** it is built, **Then** Next.js App Router compiles under TypeScript `strict` and `output: 'export'` produces a fully static export (AR-2)
**And** the exported site serves a placeholder home route with zero backend calls (NFR-6.1)
**And** `NEXT_PUBLIC_MODE` is plumbed as the build-time mode flag consumed by the repository factory in Story 1.4 (AR-2)

### Story 1.2: CI Pipeline & Quality Gates

As a developer,
I want an automated pipeline enforcing quality gates on every push,
So that regressions are blocked from the first story onward.

**Acceptance Criteria:**

**Given** a push or PR, **When** GitHub Actions runs, **Then** the pipeline executes typecheck → lint → unit tests with coverage → build with ~300 KB bundle budget → Playwright e2e (Chromium/Firefox/WebKit) → axe-core a11y check on the home route, failing on any gate (AR-3/4)
**Given** a local commit, **When** it is created, **Then** husky + lint-staged run lint and format checks pre-commit
**Given** any component file containing a raw hex/colour literal outside the theme token file and the palette registry, **When** lint runs, **Then** the AR-46 rule fails the build
**And** the toolchain is Vitest (+ v8 coverage), React Testing Library, Playwright, fast-check, axe-core, ESLint + Prettier, `tsc --noEmit` (AR-4)

### Story 1.3: Domain Entities & Zod Schemas

As a developer,
I want complete Zod schemas for all domain entities from day one,
So that architecture invariants are mechanically enforced at every boundary and never retrofitted.

**Acceptance Criteria:**

**Given** `@gol/domain`, **When** schemas are defined, **Then** `OrganismSchema` enforces name ≤ 50, integer dominance 1–100, `colorToken` (not raw hex), `agingEnabled`, `survivalRules`, and `schemaVersion` stamp (AR-7, RFC-001/004)
**And** `SurvivalRulesSchema` covers all five condition properties, all six operands including `range`, and age literals ≤ 65534, with per-rule opaque `id` + deterministic `contentHash` (AR-20/21)
**And** `BattleSchema` enforces name ≤ 100, `organismIds` ≤ 255, `EditableGridPresetSchema` ({50×30} | {100×60} literals), and dense `gridState` (AR-7)
**Given** a Battle payload violating an invariant, **When** parsed, **Then** superRefines reject it: gridState dimensions must match gridSize, every cell value must index into `organismIds`, and `organismIds` must equal the placed set (Decision H.1)
**And** unit tests cover a valid fixture per entity plus one rejection test per invariant

### Story 1.4: Repository Interfaces & localStorage Implementations

As a developer,
I want integrity-aware repository contracts with localStorage implementations behind DI,
So that all persistence is swappable, versioned from the first write, and quota-safe.

**Acceptance Criteria:**

**Given** `@gol/persistence`, **When** interfaces are defined, **Then** `BattleRepository`/`OrganismRepository`/`SettingsRepository` are async, `battles.list()` returns lightweight `BattleSummary` projections without deserializing any grid, and bulk `replaceAll` + data-only `clearAll` exist (AR-6/15)
**Given** the localStorage implementations, **When** data is written, **Then** it lands under `gol:battles`/`gol:organisms`/`gol:settings` with dense `gridState` at rest, and `gol:schema` is stamped on the very first write (AR-9/11)
**Given** a write that would exceed quota, **When** `setItem` fails, **Then** the candidate-string-then-`setItem` strategy guarantees existing data is never truncated and a non-destructive `QuotaExceededError` surfaces to the caller (AR-14, NFR-7.2)
**And** the repository factory selects the localStorage implementation via `NEXT_PUBLIC_MODE`, injected by props at the page boundary — no global store (AR-2/27)
**And** `clearAll` cannot touch `gol:settings` by construction (Decision F / AR-12)

### Story 1.5: Default Workspace Seeding

As a user,
I want the app to come with Conway's Classic pre-loaded,
So that I can explore battles immediately without authoring an organism first.

**Acceptance Criteria:**

**Given** a first run with empty localStorage, **When** the app loads, **Then** `DEFAULT_WORKSPACE` is seeded: zero battles plus Conway's Classic (Born 3, Survive 2–3, Dominance 50, aging off) under the stable well-known id (FR-1.5, AR-13)
**Given** an already-seeded workspace, **When** `ensureDefaultOrganism()` runs again, **Then** it is idempotent — no duplicate is created, and a missing default is re-added
**And** re-seeding on Clear All and post-Import is exercised when those flows land in Epic 5 (hook exists now, verified by unit test)

### Story 1.6: Test Utilities & Dev Fixture Workspace

As a developer,
I want shared test utilities and a dev-only fixture workspace,
So that every story tests against canonical data and the running dev app is never empty.

**Acceptance Criteria:**

**Given** `@gol/test-utils`, **When** consumed by any package, **Then** it provides grid builders, in-memory fake repositories implementing the Story 1.4 interfaces, fixed RNG seeds, and the canonical organisms (Conway's Classic + the three PRD organisms) (AR-5)
**Given** the AR-45 mock set, **When** defined, **Then** the 3 mock organisms jointly cover all five condition properties, all six operands including `range`, ≥ 1 aging-enabled organism, distinct Dominance values, and ≥ 1 explicit Die-action rule, and the 2 mock battles place them
**Given** a dev build, **When** the app starts, **Then** the mock fixtures are auto-seeded; **Given** a production build, **Then** only the FR-1.5 `DEFAULT_WORKSPACE` seeding runs — mock data is unreachable (AR-45)

### Story 1.7: Palette Token Registry & Display-Color LUT

As a user,
I want organisms to have distinguishable, consistent colors everywhere they appear,
So that I can tell life forms apart at a glance in any view.

**Acceptance Criteria:**

**Given** the palette registry, **When** defined, **Then** it contains 20 curated tokens ordered by distinguishability, with the CVD-consideration check documented (AR-26, NFR-8.3)
**Given** an organism's `colorToken`, **When** rendered, **Then** hex is resolved at render time from the registry — never stored on the organism (AR-26)
**Given** `displayColor(token, ageShade)`, **When** computed, **Then** the LUT applies the constant-lightness saturation ramp (30% at age 0, +10%/cycle, 100% cap at age 7) and non-aging organisms resolve to the age-cap base color (FR-5.7 groundwork; consumed fully in Epic 3)
**And** LUT arithmetic is unit-tested; the registry file is a whitelisted location for the AR-46 lint rule

### Story 1.8: GridRenderer Static Core

As a user,
I want battle grids drawn crisply and identically wherever they appear,
So that a battle looks the same in the Gallery as it will in the editor.

**Acceptance Criteria:**

**Given** the `GridRenderer` contract, **When** implemented, **Then** it exposes `renderStatic(grid)` (loopless one-shot) and `drawFull(grid)` (full repaint), constructed with `(canvas, size, palette LUT)` (AR-22/25)
**Given** any grid dimensions, **When** laid out, **Then** auto-fit computes `cellSize = floor(canvasPx / dimension)` so the whole grid is always visible (FR-3.2 groundwork)
**Given** the frozen-contract rule, **When** contract tests run, **Then** the renderer never calls `requestAnimationFrame`, never mutates the grid, and owns no scheduling — Epic 3 wraps it without modifying it (RFC-002, party-mode churn review)
**And** grid-line overlay support (`setGridLines`, default on) is present (FR-8.7 consumption; toggle UI lands in Epic 6)
**And** decision logic (auto-fit math, batch grouping keys) is tested as pure units — no pixel snapshots beyond a smoke check (AR-42)

### Story 1.9: Clinical Lab Theme Tokens & App Shell

As a user,
I want the app to open into a polished Clinical Lab-styled shell,
So that the studio feels like a designed product from the first screen.

**Acceptance Criteria:**

**Given** the token layer, **When** defined, **Then** all `--gol-*` custom properties live in a dedicated CSS file — the default theme (Clinical Lab) on bare `:root`, so it applies to any document root, and every additional theme as a `:root[data-theme='…']` override block — covering the Clinical Lab spec (sans-serif, cyan accent, gray layers) (AR-36, UX-DR1 subset) _(amended 2026-08-07 from "under a `[data-theme]` block" — see Story 1.9's Review Findings; scoping the DEFAULT theme to the attribute left any root without it, e.g. Next's `GlobalError`, entirely unthemed)_
**Given** the MUI theme, **When** created, **Then** one immutable `createTheme()` references only `var(--gol-*)` tokens; MUI v6 core only, per-component imports (AR-35/36)
**Given** the AR-46 lint rule, **When** the shell builds, **Then** zero raw color literals exist outside the token file and palette registry
**And** the `/` route renders the app chrome with navigation only to surfaces that exist (no dead links)
**And** Clinical Lab token pairs meet WCAG AA contrast (4.5:1 text / 3:1 controls), verified in-story (NFR-8.3)

### Story 1.10: Battle Gallery Tiles & Sorting

As a user,
I want to see my battle collection as tiles the moment I open the app,
So that I can find and pick up my work instantly.

**Acceptance Criteria:**

**Given** saved battles, **When** `/` loads, **Then** tiles render from `battles.list()` `BattleSummary` projections — no grid deserialization on the Gallery path (FR-7.1, AR-15)
**And** tiles are sorted by last-modified, most recent first
**Given** a tile, **When** displayed, **Then** it shows the battle name, created/modified dates, and organism names via tooltip or expandable metadata (FR-7.3), with hover affordances per the Gallery mockups (UX-DR18); the snapshot area renders a placeholder until Story 1.11
**Given** a dev build, **When** the Gallery loads, **Then** the two AR-45 fixture battles appear
**And** tiles are keyboard-focusable and the view passes the axe check

### Story 1.11: Battle Tile Thumbnails

As a user,
I want each tile to show a miniature snapshot of its battle,
So that I can recognize battles visually instead of by name alone.

**Acceptance Criteria:**

**Given** a battle tile, **When** rendered, **Then** its initial-grid snapshot is drawn by the shared renderer's `renderStatic` with colors from the palette LUT (FR-7.2, AR-25)
**And** thumbnails are rendered on demand and never stored (no cached data URLs)
**And** grid lines follow the current setting (default on)
**Given** a Gallery at the soft-capacity scale (~50 battles), **When** it loads, **Then** thumbnail rendering does not block interactivity (NFR-1.3 / NFR-7.2)

### Story 1.12: Gallery Empty State

As a first-time user,
I want an inviting, self-explanatory empty Gallery,
So that I understand what the app is and what to do first without a tutorial.

**Acceptance Criteria:**

**Given** a workspace with zero battles (production first run), **When** the Gallery loads, **Then** a designed empty state renders with a visual, a "what is this app" explanation, and the "Create Your First Battle" prompt copy (NFR-4.1, FR-7.4 prompt)
**And** per the no-dead-affordance rule, the create action button ships when the battle editor exists (wired in Epic 2) — Epic 1 ships the designed layout and copy
**And** the empty state disappears when the first battle exists and reappears if all battles are deleted
**And** the view passes the axe check in Clinical Lab

### Story 1.13: Delete Battle with Confirmation

As a user,
I want to delete battles I no longer need, with a confirmation step,
So that I can curate my collection without fear of accidental loss.

**Acceptance Criteria:**

**Given** a battle tile, **When** its delete action is invoked, **Then** a confirmation dialog names the battle before anything happens (FR-7.7)
**Given** the dialog, **When** confirmed, **Then** the battle is removed from storage and the Gallery updates; **When** cancelled, **Then** nothing changes
**And** deleting a battle never deletes organisms (shared library is workspace-level, FR-7.15 data model)
**Given** the last battle is deleted, **When** the Gallery refreshes, **Then** the Story 1.12 empty state appears
**And** the dialog is keyboard-operable (Escape cancels, focus trapped) and passes axe

## Epic 2: Battle Editor (Edit Mode & Canvas Renderer)

Users can create and design Battles: open a new or existing Battle into Edit Mode, paint and erase organisms on an auto-fit Canvas grid, undo, reset, resize, name, and save. Ships the `<BattlePage>` mode-state skeleton with only Edit populated (no Play affordance until Epic 3), the renderer's dirty-region editing paths, `useUndoableGrid`, and the unsaved-changes guard. Component APIs per component-tree-battle-page.md §3.1–3.10.

### Story 2.1: Battle Route & Page Skeleton

As a user,
I want to open a saved battle from the Gallery into its own editor page,
So that I can view and work on a specific battle.

**Acceptance Criteria:**

**Given** a Gallery tile, **When** clicked, **Then** the app navigates to `/battle?id=<uuid>` and `<BattlePage>` loads that battle and the organism library via injected repositories (FR-7.5, AR-27, Decision K; spec §3.1)
**Given** `<BattlePage>`, **When** mounted, **Then** it owns `mode` as local state with only `'lab'` populated — no Play toggle, no fullscreen affordance, no dead buttons (AR-28, NFR-4.1)
**And** the slim header displays the battle title read-only, falling back to "Untitled Battle" (spec §3.2)
**And** load in progress and load failure render distinct states (`useAsyncResource`), with failure offering navigation back to the Gallery
**And** routes remain exactly `/`, `/battle` and `/battle/new` (`/settings` arrives in Epic 5) (AR-28, Decision K)

### Story 2.2: Create New Battle & Gallery Wiring

As a user,
I want to start a brand-new battle from the Gallery,
So that I can begin designing immediately.

**Acceptance Criteria:**

**Given** the Gallery, **When** "New Battle" (or the empty-state "Create Your First Battle" CTA) is clicked, **Then** the app navigates to `/battle/new` and seeds an empty grid at the default editable preset (FR-7.4, FR-3.1; 100×60 until the FR-8.10 setting exists)
**And** the Story 1.12 empty-state CTA is now live — the no-dead-affordance gap closes here
**Given** a new unsaved battle, **When** the user leaves without saving, **Then** nothing is persisted and the Gallery is unchanged
**And** the new battle opens with the title "Untitled Battle" and an empty canvas

### Story 2.3: Renderer Dirty-Region Editing Paths

As a developer,
I want the renderer to repaint only changed cells,
So that editing feedback stays under the interaction budget at every grid size.

**Acceptance Criteria:**

**Given** the existing `GridRenderer`, **When** `draw(grid)` is called, **Then** only regions marked dirty since the last draw are repainted; a cell is dirty on occupant or age-shade change (AR-22)
**And** `markDirty(cells)` accumulates dirty cells between draws
**Given** the frozen contract, **When** contract tests run, **Then** the public surface gains no scheduling: still no `requestAnimationFrame`, no grid mutation (RFC-002)
**And** dirty-region decision logic is tested as pure units, including: single-cell change repaints one region, not the full grid (AR-42)

### Story 2.4: Edit Canvas Display

As a user,
I want my battle's grid displayed whole and crisp in the editor,
So that I always see the entire petri dish while designing.

**Acceptance Criteria:**

**Given** an open battle, **When** the editor renders, **Then** `<PetriDishCanvas variant="edit">` mounts a canvas and draws the loaded initial grid via the shared renderer (spec §3.10)
**And** auto-fit keeps the whole grid visible with `cellSize = floor(canvasPx / dimension)` at both editable presets (FR-3.1/3.2)
**Given** the container resizes, **When** layout changes, **Then** the canvas re-fits immediately with a full repaint (FR-3.2)
**And** grid lines render per the default-on setting; this story is display-only — no pointer handling yet

### Story 2.5: Click Placement

As a user,
I want to click a cell to place an organism,
So that I can start populating my petri dish.

**Acceptance Criteria:**

**Given** the edit canvas, **When** a cell is clicked, **Then** the selected organism occupies that cell — overwriting any previous occupant — with visible feedback in < 100 ms via the dirty-region path (FR-3.4, NFR-4.2)
**And** pointer→cell mapping is exact at both presets, including edge and corner cells
**And** the click flows through the single commit seam (`onStrokeCommit` → `onCommitGrid`, spec §3.3/§3.10) so it will be undoable when 2.8 lands
**And** until the roster UI (2.9), the selected tool defaults to Conway's Classic

### Story 2.6: Drag Painting

As a user,
I want to drag across cells to paint many at once,
So that I can sketch patterns quickly.

**Acceptance Criteria:**

**Given** pointer-down on the canvas, **When** the pointer moves across cells, **Then** each traversed cell is painted with the selected organism and feedback is immediate — the in-progress stroke lives in refs, never in React state (FR-3.5, spec §3.10 hot state)
**Given** an in-progress stroke, **When** the pointer is released, **Then** exactly one commit fires for the whole gesture (RFC-005 D6) — one future undo entry per stroke
**And** pointer-up outside the canvas, or the pointer leaving and re-entering, terminates the stroke cleanly without lost or phantom cells

### Story 2.7: Eraser

As a user,
I want an eraser tool that clears cells by click or drag,
So that I can correct and refine my design.

**Acceptance Criteria:**

**Given** the eraser is the selected tool, **When** a cell is clicked or dragged over, **Then** those cells become empty through the same stroke pipeline — one commit per gesture (FR-3.6)
**And** erasing already-empty cells is a visual no-op and produces no spurious commit
**And** the `Tool` model is `{ kind: 'organism'; organismId } | { kind: 'eraser' }` (spec §3.4); a provisional toggle exposes the eraser until the roster section (2.9) replaces it

### Story 2.8: Undo

As a user,
I want to undo my recent editing gestures,
So that I can experiment without fear.

**Acceptance Criteria:**

**Given** `useUndoableGrid`, **When** gestures commit, **Then** a 30-snapshot ring buffer stores (occupant + dimensions), one entry per coalesced gesture, within the ≤ 180 KB budget at 100×60 (AR-30)
**Given** the UNDO button in the status bar, **When** clicked, **Then** the grid reverts one gesture; the button is disabled when `canUndo` is false (FR-3.8)
**And** one drag stroke reverts as a single unit (D6)
**And** the ring lives in `<BattlePage>` — it will survive future mode switches and resets on return to Gallery (FR-3.8, AR-30); never persisted
**And** undo restores grid dimensions too (groundwork for undoable resize in 2.14)

### Story 2.9: Organism Roster & Tool Selection

As a user,
I want a sidebar listing my battle's organisms with the eraser,
So that I can pick what I'm painting with at a glance.

**Acceptance Criteria:**

**Given** the "Organisms" sidebar section, **When** rendered, **Then** it lists the battle's roster rows (color chip + name) with the Eraser pinned at the bottom (FR-3.3/3.6, UX-DR20; spec §3.4)
**Given** a row (or the eraser), **When** clicked, **Then** it becomes the selected tool with a visible selected state, replacing the 2.7 provisional toggle; selection is owned by `<BattleEditorView>` (spec §3.3)
**Given** two roster organisms sharing a color token, **When** listed, **Then** both rows show the non-blocking same-color warning (FR-3.3, M6)
**And** the per-row ✎ pencil is **not** rendered (activates in Epic 4 — no dead affordance)
**And** the section is keyboard-operable and passes axe

### Story 2.10: Add Organisms from Library

As a user,
I want to add any library organism to my battle,
So that I can compose battles from the shared library.

**Acceptance Criteria:**

**Given** the roster section, **When** "+ ADD ORGANISM" opens the dropdown, **Then** it lists the library minus the current roster, filtered live by the search box — search filters the dropdown only (FR-7.15; spec §3.4)
**Given** a dropdown entry, **When** chosen, **Then** it joins `sessionRoster`, appears in the roster list, and is immediately selectable as a tool (Decision H.2)
**And** session-added-but-unpainted organisms are never persisted and vanish on close/reload (H.2 — verified end-to-end once save lands in 2.13)
**Given** a battle whose roster holds 255 organisms, **When** a 256th add is attempted, **Then** it is blocked with an explanatory message (Decision G.3)

### Story 2.11: Battle Name & Dirty Tracking

As a user,
I want to name my battle and have the app know when I have unsaved work,
So that my collection stays organized and my changes are protected.

**Acceptance Criteria:**

**Given** the "Battle Name" sidebar section, **When** rendered, **Then** it shows a text input with a live character counter "N / 100" and enforces maxLength 100 (FR-3.9; RFC-001 `BattleSchema`, spec §3.5/§9.10)
**Given** a name edit, **When** typed, **Then** the header title updates live and `isDirty` becomes true
**Given** any grid commit (paint, erase, clear, resize), **When** it lands, **Then** `isDirty` becomes true; `isDirty` is owned by `<BattlePage>` (spec §6)
**And** an empty name displays as "Untitled Battle" in the header

### Story 2.12: Editor Status Bar Stats

As a user,
I want live stats about my initial configuration,
So that I can see the composition of my battle while designing.

**Acceptance Criteria:**

**Given** the lab bottom bar, **When** rendered, **Then** it shows Generation 0, total Living Cells, and per-organism population counts with color chips (spec §3.8, §9.7)
**Given** a committed gesture, **When** it lands, **Then** stats recompute once per commit — never per pointer-move (NFR-4.2; spec §6 derived-per-commit)
**And** counts equal the actual grid contents for every placed organism, dropping to zero correctly when erased

### Story 2.13: Save Battle

As a user,
I want to explicitly save my battle,
So that my work persists across sessions.

**Acceptance Criteria:**

**Given** the SAVE button in the status bar, **When** `isDirty` is true, **Then** it is enabled; saving a `'new'` battle creates the entity, subsequent saves update it (FR-7.8)
**Given** a save, **When** executed, **Then** persisted `organismIds` is pruned to exactly the placed set — session-added-but-unpainted entries are excluded (Decision H.1), dense `gridState` conversion happens inside the repository (Reconciliation #3), and `updatedAt` bumps so the Gallery re-sorts
**And** after a successful save `isDirty` clears and the battle appears in the Gallery with a live thumbnail
**Given** a save that exceeds the storage quota, **When** it fails, **Then** a non-destructive error explains the situation, existing stored data is untouched, and the editor keeps the unsaved state (AR-14, NFR-7.2)

### Story 2.14: Edit-Mode Grid Resize

As a user,
I want to switch my battle between the editable grid presets,
So that I can pick the right canvas size for my design.

**Acceptance Criteria:**

**Given** the "Grid Info" sidebar section, **When** rendered, **Then** it shows grid facts (size, total cells, living cells) and the preset control for {50×30, 100×60} (FR-3.1 facts, FR-3.11; spec §3.6)
**Given** a resize, **When** applied, **Then** content is preserved top-left-anchored (AR-17)
**Given** a shrink that would clip living cells, **When** requested, **Then** a warning dialog states the consequence first; confirm applies, cancel changes nothing (FR-3.11; spec §3.15)
**And** an applied resize is a single undoable commit (dimensions + content restore on undo) and marks the battle dirty; growing never warns
**And** the new size persists on save as the battle's `gridSize`

### Story 2.15: Clear Petri Dish

As a user,
I want to clear the whole grid in one action,
So that I can start my design over.

**Acceptance Criteria:**

**Given** the "Tools" sidebar section, **When** "CLEAR PETRI DISH" is clicked, **Then** all cells empty as one undoable commit and the battle becomes dirty (FR-3.7 Reset Grid — mockup label in UI, FR term in ACs per spec §9.4)
**Given** an already-empty grid, **When** clicked, **Then** nothing happens — no commit, no undo entry
**And** the Export button is not rendered (Epic 5; no dead affordance), and Reset-to-Saved / Randomize remain excluded (spec §9.3)

### Story 2.16: Back Navigation & Unsaved-Changes Guard

As a user,
I want to return to the Gallery safely,
So that I never lose work by accident.

**Acceptance Criteria:**

**Given** the pinned "← BACK TO BATTLES" sidebar footer, **When** clicked with no unsaved changes, **Then** the app navigates straight to the Gallery (FR-7.10)
**Given** `isDirty` is true, **When** Back is clicked, **Then** the unsaved-changes dialog offers Save / Discard / Cancel — Save persists then navigates, Discard navigates losing changes, Cancel stays (FR-7.9; spec §3.15)
**Given** `isDirty` is true, **When** the tab is closed or refreshed, **Then** the native `beforeunload` warning appears; the guard is registered/unregistered by `useDirtyGuard` and inactive when clean (FR-7.9, RFC-005 D7)
**And** returning to the Gallery resets the undo ring (FR-3.8)
**And** the dialog is keyboard-operable (Escape = Cancel, focus trapped) and passes axe

## Epic 3: Living Simulations (Play Mode & Engine)

Users can run their Battles and watch organisms live, compete, age, and go extinct in real time. Three-layer functional engine (generic rules engine → GoL layer → three-phase strategy), each engine story shipping its own tests, the 60 FPS RAF loop with colour-state batching around the Epic 2 renderer, and the full Play Mode UI. Fullscreen stage and hotkeys included as UX-sourced scope (spec §9.5/9.6; PRD touch recommended).

### Story 3.1: Generic Rules Engine

As a developer,
I want a domain-agnostic rules engine core,
So that GoL semantics sit on a proven, reusable evaluation layer.

**Acceptance Criteria:**

**Given** `packages/simulation`, **When** the core is implemented, **Then** it provides generic `Condition`/`Rule`/`RuleSet` types over an arbitrary subject and `firstSatisfiedBy` returning the first rule whose AND-combined conditions all pass (AR-16)
**And** the layer is pure functional (no classes) and imports nothing GoL-specific
**And** its tests prove the engine with a non-GoL subject (AR-40)
**And** rules carry opaque `id` + deterministic `contentHash` consistent with the Story 1.3 schemas (AR-21)

### Story 3.2: GoL Rules Layer

As a developer,
I want the GoL-specific rule vocabulary on top of the generic engine,
So that organism rules evaluate exactly as the Organism Editor defines them.

**Acceptance Criteria:**

**Given** `CellSubject`, **When** defined, **Then** it exposes all five properties (Cell State, Organism Type, Age of Cell, Neighbor Count, Occupant Neighbor Count) and all six operands (=, >, <, >=, <=, range) (FR-5.5, FR-2.5)
**And** Cell State is three-valued and **relative**: `empty | alive` (same organism) `| occupied` (another organism) (Decision C, AR-20)
**And** `resolveCellAction` maps a matched rule to its Born/Die/Survive action (AR-16)
**And** unit tests cover every property × operand combination, including `range` boundary behavior

### Story 3.3: Typed-Array Grid & Neighborhood

As a developer,
I want the hot-path grid representation with neighborhood math,
So that simulation meets the 60 FPS budget by construction.

**Acceptance Criteria:**

**Given** the grid model, **When** implemented, **Then** it uses `occupant: Uint8Array` + `age: Uint16Array`, size-parametric and double-buffered (AR-17)
**And** neighbor calculation is Moore (8 adjacent) with hard boundaries — no wrap; edge/corner cells have < 8 neighbors (FR-5.8/5.9)
**And** pure `resizeGrid` preserves content top-left-anchored, returning new buffers (AR-17)
**And** property-based tests cover resize invariants and dense↔sparse↔typed round-trip identity (AR-41); the package imports no React (spec §6 invariant)

### Story 3.4: Precompiled Evaluators & Organism Interning

As a developer,
I want per-organism rules compiled once per session,
So that the per-cell hot path compares numbers only.

**Acceptance Criteria:**

**Given** simulation start, **When** evaluators compile, **Then** each organism gets phase-partitioned evaluators (death / birth-survival), cached by `contentHash`, session-scoped (AR-18)
**And** organism ids are interned to numeric `OrganismRef`s at the boundary; rule `organismType` targets are translated inside the compiled evaluators — one lookup per rule per session, never per cell (AR-8, Decision E.3)
**And** a target id absent from the battle compiles to a never-match sentinel ("occupied by X" is simply false)
**And** `MAX_RELEVANT_AGE = max(7, maxAgeLiteral + 1)` is computed once at compile time and age comparisons stay correct for saturated cells (AR-20)
**And** tests verify cache hits on unchanged `contentHash` and recompiles on change

### Story 3.5: Phases 1–2 — Death & Claims

As a developer,
I want the death and birth/survival phases as pure functions,
So that the M10 precedence semantics are individually testable.

**Acceptance Criteria:**

**Given** Phase 1, **When** it runs, **Then** only Die rules are evaluated, death precedes survival, and explicitly-dead cells are removed before Phase 2 neighbor counting (FR-5.2, M10 H-5)
**And** implicit (no-match) deaths resolve at cycle end — a non-surviving cell still counts as a Phase 2 neighbor (M10; preserves Conway simultaneous-generation semantics)
**Given** Phase 2, **When** it runs, **Then** all organisms evaluate in parallel against the post-death intermediate grid, producing candidate birth/survival claims with rule order as priority within the phase (FR-5.3, FR-2.6)
**And** both phases are pure (inputs never mutated — property-tested, AR-41) with hand-computed fixture grids

### Story 3.6: Phase 3 & the Assembled Cycle

As a user,
I want battles to resolve competition exactly by the documented rules,
So that outcomes are fair, deterministic under a seed, and Conway-faithful.

**Acceptance Criteria:**

**Given** competing claims on a cell, **When** Phase 3 resolves, **Then** higher Dominance wins, ties break randomly via the injected seeded RNG, and Survive/Born claims compete uniformly — birth can evict an incumbent; relative Cell-State gating keeps eviction opt-in (FR-5.4, M10 H-6, AR-19)
**Given** the assembled `step()`, **When** a cycle completes, **Then** surviving cells age +1, reborn cells reset to 0, and age saturates at `MAX_RELEVANT_AGE` (FR-5.1/5.6)
**And** the Conway golden-pattern suite passes: blinker period-2, glider translation, still-lifes stable (AR-40)
**And** curated multi-organism conflict scenarios match hand-computed expected grids (AR-40)
**And** property tests hold: same seed ⇒ identical run; no cell is both born and dead in one cycle (AR-41)

### Story 3.7: Performance Harness & Coverage-Gate Flip

As a developer,
I want benchmarks and the strict coverage gates active,
So that performance and test rigor are enforced from here on, not promised.

**Acceptance Criteria:**

**Given** the Vitest bench harness, **When** it runs, **Then** it measures `step()` + repaint across all four grid presets × 20 organisms (AR-43)
**And** the 100×60 × 20-organism baseline hard-gates CI within the 60 FPS budget (NFR-1.1); larger presets are tracked for graceful degradation, not gated
**And** the ≥ 90% coverage gates flip on for `packages/simulation` and `packages/domain`, ~80% for `packages/persistence` (AR-39, NFR-5.1)
**And** CI fails if either the benchmark baseline or a coverage gate regresses

### Story 3.8: SimulationLoop

As a developer,
I want the RAF scheduling loop as its own injected module,
So that timing logic is isolated from both React and the renderer.

**Acceptance Criteria:**

**Given** `SimulationLoop`, **When** constructed, **Then** it receives `(renderer, step, msPerCycleRef)` — all three injected (Decision D)
**And** the RAF time accumulator executes one `step()` per elapsed `msPerCycle`, at most one step per frame, with frame delta clamped to `msPerCycle` — no fast-forward burst after tab suspension (AR-24)
**And** repaint happens only after a step — no redundant paints on idle frames
**And** start/stop are idempotent; the loop adds nothing to the renderer contract (RFC-002 §5)
**And** behavior is unit-tested with a fake RAF/clock

### Story 3.9: Colour-State Batch Rendering

As a user,
I want smooth playback with visible aging,
So that large battles animate fluidly while organisms fade in with age.

**Acceptance Criteria:**

**Given** a playback repaint, **When** cells are drawn, **Then** they batch by `(colorToken, min(age, 7))` — ≤ 160 fill groups, independent of organism count (AR-23, B.2)
**And** non-aging organisms fold into their token's `(token, 7)` base-color group (B.2)
**And** the per-battle `OrganismRef → fill-group` LUT is built at simulation start
**And** the aging saturation ramp (30% → 100% by age 7) is visible in playback (FR-5.7)
**And** batch-grouping logic is pure-unit tested (AR-42) and the 3.7 benchmark confirms the baseline holds with batching active

### Story 3.10: `useSimulation` Hook

As a developer,
I want the one React↔engine bridge,
So that simulations run at 60 FPS with zero React re-renders per cycle.

**Acceptance Criteria:**

**Given** `useSimulation(initialGrid, organisms, opts)`, **When** mounted, **Then** it clones `initialGrid` (edits never leak back — AR-31, RFC-005 D4), holds the live grid + loop in refs, and returns `{status, cycle, population, play, pause, step, stop, setSpeed, resizeLive, attachRenderer}` (spec §4)
**And** simulation cycles cause zero React re-renders; `cycle` and `population` publish throttled at ≤ 10 Hz (AR-29, M2)
**And** `attachRenderer` receives the renderer from the canvas's `onRendererReady` — the hook stays DOM-free (spec §3.10)
**And** `stop()` restores the cloned initial state; `population` entries arrive pre-sorted with extinction flags (M2)

### Story 3.11: Mode Toggle & Run View Skeleton

As a user,
I want to flip my battle between Lab and Run,
So that I can design and then watch life unfold.

**Acceptance Criteria:**

**Given** the header, **When** Epic 3 lands, **Then** the Lab⇄Run toggle renders for the first time (no-dead-affordance satisfied) (FR-3.10; spec §3.2)
**Given** Lab mode, **When** toggled to Run, **Then** the current grid becomes the initial configuration (cloned by the hook) and `<BattleSimulationView>` renders the run chassis with the playback canvas painted (FR-3.10; spec §3.11), starting paused at cycle 0
**Given** Run mode, **When** toggled back to Lab, **Then** the simulation halts, the live grid is discarded by unmounting the run view, and the editor shows the unchanged initial state (FR-4.8, AR-31)
**And** `<BattlePage>` stays mounted across switches — the undo ring and dirty flag survive (RFC-005 D3, FR-3.8)

### Story 3.12: Transport Controls

As a user,
I want play, pause, step, and stop controls,
So that I can drive the simulation precisely.

**Acceptance Criteria:**

**Given** the run bottom bar, **When** Play is pressed, **Then** cycles advance at the current speed; Pause halts; resuming continues from the paused state — one toggle button reflecting status (FR-4.1, UX-DR20; spec §3.13)
**Given** a paused simulation, **When** Step is pressed, **Then** exactly one cycle advances; Step is disabled during playback (FR-4.3)
**Given** Stop, **When** pressed, **Then** the simulation halts and the grid returns to the initial state at cycle 0 (FR-4.4)
**And** controls are keyboard-focusable and pass axe

### Story 3.13: Speed Control

As a user,
I want to change simulation speed on the fly,
So that I can slow down to study or speed up to fast-forward.

**Acceptance Criteria:**

**Given** the sidebar Speed control, **When** rendered, **Then** it is a detented slider over the ladder 1 | 2 | 5 | 10 | 20 gen/sec, defaulting to 10 (FR-4.2; FR-8.12 setting arrives in Epic 6)
**Given** active playback, **When** speed changes, **Then** it applies live via `msPerCycle` ref-write — no loop restart, no visual stutter (AR-34)
**And** tick rate stays decoupled from render rate (AR-24); 20 gen/sec = 50 ms ≥ one frame (AR-34)

### Story 3.14: Cycle Counter & Population Stats

As a user,
I want live population analysis while the battle runs,
So that I can follow who's winning.

**Acceptance Criteria:**

**Given** the run sidebar, **When** the simulation advances, **Then** the cycle counter starts at 0 and increments per cycle, including manual steps (FR-4.5)
**And** population shows one horizontal bar per organism — color, name, percentage — pre-sorted, with a Total Living Cells row (FR-4.6, M2; spec §3.12)
**Given** an organism reaches zero cells, **When** displayed, **Then** it drops to the bottom with the skull indicator (FR-4.6)
**And** updates render at the ≤ 10 Hz publish cadence — the stats never drive per-frame re-renders (M2, AR-29)

### Story 3.15: Extinction Auto-Pause

As a user,
I want the simulation to pause itself when all life is gone,
So that I never watch an empty dish spin.

**Acceptance Criteria:**

**Given** a running simulation, **When** the grid reaches zero living cells, **Then** it auto-**pauses** (not Stop) — cycle counter and final grid stay visible (FR-4.7, B.5)
**And** the check is plain emptiness only: still-lifes, oscillators, and gliders never auto-stop (B.5)
**And** the extinction-only property is covered by a property-based test (AR-41)

### Story 3.16: Play-Mode Ephemeral Resize

As a user,
I want to try my battle on bigger grids without changing the saved battle,
So that I can experiment with more room.

**Acceptance Criteria:**

**Given** the paused run sidebar, **When** the Grid Size slider is used, **Then** the live grid resizes among all four presets including 150×90 and 200×120, content preserved top-left (FR-4.9; spec §3.12)
**Given** active playback, **When** running, **Then** the control is disabled with the "adjustable while paused" hint (FR-4.9)
**And** the resize is ephemeral: `initialGrid` and the saved battle are untouched; returning to Lab shows the persisted size (FR-4.9, AR-31)

### Story 3.17: Run Battle from Gallery

As a user,
I want to run a battle straight from the Gallery,
So that I can watch without passing through the editor.

**Acceptance Criteria:**

**Given** a Gallery tile, **When** its Run action is invoked, **Then** the battle opens directly in Play Mode, paused at cycle 0 (FR-7.6)
**And** the Run affordance appears on tiles only now that Run exists (no-dead-affordance)
**And** Back from a Gallery-launched run returns to the Gallery (FR-7.10 unchanged)

### Story 3.18: Fullscreen Run Stage

As a user,
I want an immersive fullscreen view of a running battle,
So that I can present or just enjoy it big.

**Acceptance Criteria:**

**Given** Run mode, **When** the header ⛶ FULLSCREEN button is pressed, **Then** `<FullscreenStage>` renders: top overlay (title + RUN badge + Exit), the canvas, and the bottom HUD (cycle, population pills with skull for extinct, speed, transport) (spec §3.14; `petri-dish-play-mode-fullscreen.html`)
**And** entering/exiting is a layout swap — the same canvas/renderer instance is re-laid out, never remounted; the live grid survives (spec §3.11)
**And** the running simulation continues uninterrupted across enter/exit
*(UX-sourced: authority = fullscreen mockup + spec §9.5; no backing FR — PRD touch recommended as follow-up)*

### Story 3.19: Simulation Hotkeys

As a user,
I want keyboard control of the simulation,
So that I can drive playback without reaching for the mouse.

**Acceptance Criteria:**

**Given** Run mode, **When** keys are pressed, **Then** SPACE toggles play/pause, → steps one cycle (paused only, matching 3.12), ESC stops, F toggles fullscreen — via `useSimulationHotkeys` (spec §4)
**And** hotkeys are suspended while any dialog/modal is open or an input has focus, and inactive entirely in Lab mode
**And** the control bar displays the SPACE / → / ESC hints (display-only; handling lives in the hook) (spec §3.13)
*(UX-sourced: authority = Run mockup hints + spec §9.6; no backing FR — same PRD touch)*

## Epic 4: Custom Organisms & the Shared Library

Users can create, edit, clone, and manage their own life forms with custom survival rules — the headline authoring experience. Organism Library on the new `/organisms` route (fourth top-level route; RFC-005 route-sketch omission flagged), the 3-column Organism Editor modal, the isolated preview simulation, in-battle editing, and all referential-integrity behavior.

### Story 4.1: Organisms Route & Top Navigation

As a user,
I want an Organisms section in the app's navigation,
So that I can reach my organism library from anywhere.

**Acceptance Criteria:**

**Given** any top-level page, **When** it renders, **Then** the top nav shows Battles and Organisms with the active item highlighted per the mockups (Settings joins in Epic 5 — no dead links)
**Given** `/organisms`, **When** visited, **Then** the Organism Library page loads the library via injected repositories (FR-1.1 entry, AR-27; RFC-005 component tree)
**And** `/organisms` is added as the fourth top-level route — modes are still never routes (AR-28 intent); the RFC-005 route-sketch omission is flagged for the next RFC touch
**And** navigation is keyboard-operable and passes axe

### Story 4.2: Organism Card Grid

As a user,
I want my organisms displayed as cards,
So that I can scan my library at a glance.

**Acceptance Criteria:**

**Given** the loaded library, **When** the page renders, **Then** each organism appears as a card with color chip and name, per the Library mockup grid and hover states (FR-1.1, UX-DR19)
**And** Conway's Classic always appears (M9 — the library is never empty, so no empty state is needed); dev builds also show the AR-45 fixtures
**Given** the library search box (per the Library mockup), **When** text is typed, **Then** the card grid filters live by organism name; clearing the box restores the full grid — search filters the view only and never modifies the stored library (UX-DR19; readiness-report 2026-07-16 issue #1)
**And** the grid passes axe with keyboard-focusable cards

### Story 4.3: Editor Modal Shell

As a user,
I want the Organism Editor to open as a focused full-screen overlay,
So that authoring gets my full attention without losing my place.

**Acceptance Criteria:**

**Given** the Library's "+ CREATE NEW ORGANISM" button, **When** clicked, **Then** the editor opens as a full-screen `Dialog` loaded via dynamic import (AR-35), with `role="dialog"`, trapped focus, and ARIA labelling (UX-DR5/17)
**And** the header shows the contextual back label ("◄ Back to Library"), centered title, and Save + Close actions — Save inert until Story 4.16 wires persistence
**Given** Close (or the back label), **When** activated, **Then** the modal closes and focus returns to the invoking control (unsaved-changes guard arrives in 4.23)

### Story 4.4: Three-Column Responsive Layout

As a user,
I want the editor organized into clear working columns,
So that basics, rules, and preview are all visible while I author.

**Acceptance Criteria:**

**Given** the open editor, **When** laid out ≥ 1400px, **Then** three columns render: Basic Info 320px / Survival Rules flexible ~500–600px / Preview & Test 400px (UX-DR5)
**And** the Rules column scrolls independently while the others stay put
**Given** 1024–1400px, **When** resized, **Then** columns compress per spec; below 1024px the layout folds to two columns (UX-DR5)

### Story 4.5: Organism Name Field

As a user,
I want to name my organism,
So that I can identify it across the library and battles.

**Acceptance Criteria:**

**Given** the Basic Info column, **When** rendered, **Then** the name field is a labelled text input, required, ≤ 50 characters with a live character count (FR-2.1, UX-DR14)
**And** empty or over-limit input shows the inline error style below the field (orchestrated fully in 4.13)
**And** the field carries an ARIA label and its error is programmatically associated (UX-DR17)

### Story 4.6: Dominance Control

As a user,
I want to set my organism's dominance,
So that I control how it fares in conflicts.

**Acceptance Criteria:**

**Given** the dominance control, **When** rendered, **Then** a 1–100 slider and an editable numeric input stay in sync both ways (FR-2.2, UX-DR8)
**And** a new organism defaults to 5 (UX-DR8)
**And** typed out-of-range values snap to min/max; non-integers are rejected (FR-2.2)
**And** the slider is keyboard-operable (UX-DR17)

### Story 4.7: Aging Degradation Toggle

As a user,
I want to toggle visual aging per organism,
So that I can choose whether my organism fades in with age.

**Acceptance Criteria:**

**Given** the aging toggle, **When** rendered, **Then** it shows the saturation-progression example strip (pale → full, age 0 → 7) using the organism's current color token via the display-color LUT (FR-2.4, UX-DR9)
**And** the toggle is visual-only: rule evaluation and age tracking are unaffected by its state (FR-2.4)
**And** the toggle state persists with the organism and round-trips through the editor

### Story 4.8: Color Picker & Selection Defaults

As a user,
I want to pick my organism's color from the palette,
So that it's recognizable on the grid.

**Acceptance Criteria:**

**Given** the color picker, **When** rendered, **Then** all 20 palette swatches display in rows with the selected color shown large (100×100 with glow) (FR-2.3, UX-DR7)
**Given** a new organism, **When** the editor opens, **Then** the default token is the next unused one, falling back to least-used when all are in use (FR-2.3, M6)
**And** selecting a swatch updates the selected display, the aging example strip, and the preview grid immediately
**And** no swatch is ever disabled (M6, UX-DR7)

### Story 4.9: Color Reuse Warning & CVD Validation

As a user,
I want to reuse colors knowingly,
So that palette limits never block me but I'm warned about ambiguity.

**Acceptance Criteria:**

**Given** a swatch already used by another organism, **When** selected, **Then** a non-blocking "[Organism] already uses this color" warning appears and the selection proceeds; save is unaffected (FR-2.3, M6, UX-DR7)
**And** the warning clears when a non-conflicting color is chosen
**And** the 20 palette hexes pass a documented color-vision-deficiency distinguishability check, recorded in the repo (AR-26, NFR-8.3 — party-mode AC)

### Story 4.10: Rule Cards & Empty State

As a user,
I want my survival rules as manageable cards,
So that I can build up behavior rule by rule.

**Acceptance Criteria:**

**Given** the Rules column, **When** rules exist, **Then** each renders as a card with drag handle, colored action badge (Born green / Survive cyan-blue / Die red), optional summary ≤ 100 chars, and a delete button (UX-DR10)
**Given** zero rules, **When** rendered, **Then** the centered empty state shows icon, "No Rules Defined", explanation, and a primary "+ Add Rule" action (UX-DR12)
**And** "+ Add Rule" appends a new card with a default action; deleting a card removes it immediately

### Story 4.11: Condition Builder

As a user,
I want to define AND-combined conditions per rule,
So that my rules express exactly when they fire.

**Acceptance Criteria:**

**Given** a rule card, **When** conditions are edited, **Then** each row offers property dropdown → operand dropdown → value input, with property-appropriate values: Cell State dropdown (empty/alive/occupied), Organism Type dropdown of library organisms, numeric inputs for Age/Neighbor/Occupant-Neighbor counts (FR-2.5, UX-DR10)
**Given** the `range` operand, **When** selected, **Then** the value input becomes [Min] — [Max] with min < max validated inline (UX-DR10)
**And** "+ Add Condition" adds a row, each row has a delete, and all conditions in a rule are AND-combined (FR-2.5)
**And** a rule requires ≥ 1 condition (enforced via 4.13's validation)

### Story 4.12: Rule Reordering

As a user,
I want to reorder rules by priority,
So that I control which rule wins within a phase.

**Acceptance Criteria:**

**Given** rule cards, **When** dragged, **Then** the dragged card elevates with semi-transparency, accent drop-zone indicators show valid positions, and cards renumber on drop (FR-2.6, UX-DR11)
**And** reordering is fully keyboard-operable via the focused drag handle and arrow keys (UX-DR17 — no pointer-only path)
**And** list order is priority within the evaluation phase (Die in Phase 1; Born/Survive in Phase 2 — FR-2.6, M10) and persists with the organism

### Story 4.13: Editor Validation & Feedback

As a user,
I want clear errors and confirmations when saving,
So that I always know what's wrong and what succeeded.

**Acceptance Criteria:**

**Given** invalid fields (name missing/over-limit, no color, a rule with zero conditions, numeric invalidity), **When** Save is attempted, **Then** inline errors render below each field with red border and icon, and focus moves to the first invalid field (UX-DR14)
**And** errors are announced to assistive technology (UX-DR17)
**Given** an organism with zero rules, **When** saved, **Then** a non-blocking "no rules defined" warning shows and the save proceeds (UX-DR14)
**And** successful saves show the "Organism saved successfully" toast (UX-DR14)

### Story 4.14: Preview Grid & Drawing

As a user,
I want a small test dish inside the editor,
So that I can sketch a starting pattern for my organism.

**Acceptance Criteria:**

**Given** the Preview & Test column, **When** rendered, **Then** it shows a 30×20 canvas grid drawn by the shared renderer over a dedicated, never-persisted grid (FR-2.7, AR-32, M3, UX-DR13)
**And** Draw/Erase mode toggle and Clear work; drawing places only the organism under edit (UX-DR13)
**And** the preview grid never touches battle or library state — its own subtree and refs (M3)

### Story 4.15: Preview Simulation

As a user,
I want to run my organism in isolation while I edit,
So that I can iterate on rules with instant feedback.

**Acceptance Criteria:**

**Given** the preview panel, **When** Play is pressed, **Then** a second isolated `useSimulation` instance runs the drawn pattern using the same engine as Play Mode (FR-2.7, AR-32)
**And** the simulation uses the **live, unsaved** rule definitions — rule edits apply on the next run (UX-DR13)
**And** Play/Stop, paused-only Step (matching 3.12), a speed slider over the canonical gen/sec ladder (1 | 2 | 5 | 10 | 20, AR-34 — supersedes the UX doc's earlier 0.5x–3x multiplier scale), and cycle counter work; extinction auto-pauses (FR-2.7, B.5)

### Story 4.16: Create & Save Organism

As a user,
I want to save my new organism,
So that it joins my library for use in any battle.

**Acceptance Criteria:**

**Given** valid editor data, **When** Save is pressed, **Then** the organism persists via the repository with its `schemaVersion` stamp, and the Save action is now live (FR-1.2, AR-11)
**And** the new organism appears in the Library grid and in battle add-dropdowns (FR-7.15)
**And** creation is uncapped by the palette — bounded only by storage with graceful quota failure (FR-1.2, M6, AR-14)

### Story 4.17: Edit Organism from Library

As a user,
I want to edit existing organisms with awareness of where they're used,
So that I change shared life forms deliberately.

**Acceptance Criteria:**

**Given** an organism card's edit action, **When** the organism is used in ≥ 1 battle, **Then** the "Used in [N] Battle(s)" warning offers Edit Anyway / Clone & Edit before the editor opens; unused organisms open directly (FR-1.3)
**Given** Edit Anyway → save, **When** completed, **Then** the update affects every battle placing it (FR-7.15) — thumbnails reflect it on next render
**And** Clone & Edit routes through Story 4.18's clone path
**And** the editor opens fully populated (name, dominance, color, aging, rules in order)

### Story 4.18: Clone Organism

As a user,
I want to clone an organism,
So that I can make variants without touching the original.

**Acceptance Criteria:**

**Given** a card's Clone action (or Clone & Edit from 4.17), **When** invoked, **Then** a new organism "[Name] (Copy)" is created with the source's color and rules — an ordinary, manually-managed organism (FR-1.6)
**And** editing the clone never affects the source
**And** cloning is uncapped by the palette (FR-1.6, M6)

### Story 4.19: Usage & Rule-Reference Derivations

As a developer,
I want usage and rule-reference indexes as pure derivations,
So that integrity checks are cheap, consistent, and never stored.

**Acceptance Criteria:**

**Given** loaded data, **When** derived, **Then** the usage index (`organismId → battleId[]`) builds from `BattleSummary.organismIds` — no grid deserialization, no stored structure (AR-15, Decision H)
**And** "used" = placed on the grid; an open battle's live grid unions with the saved index, deduped by battle id (Decisions H, M7)
**And** the rule-reference index (`targetOrganismId → referencingOrganismId[]`) derives from library rule patterns (Decision E.5)
**And** both derivations live in `packages/domain` under the ≥ 90% coverage gate (AR-39)

### Story 4.20: Usage Visibility UI

As a user,
I want to see where an organism is used,
So that I understand the impact of editing or deleting it.

**Acceptance Criteria:**

**Given** the editor footer, **When** rendered, **Then** it persistently shows "Used in [N] Battle(s)" plus "Targeted by [M] organism rule(s)" when M > 0 (FR-1.7, UX-DR6)
**Given** a non-zero count, **When** clicked, **Then** a read-only popover lists the battle (or organism) names — no navigation, safe over an in-progress battle (FR-1.7, M7)
**And** "Used in 0 Battles" renders without expansion (UX-DR6)
**And** counts are consistent across all surfaces: edit warning (4.17), delete error (4.21), footer (FR-1.7)

### Story 4.21: Delete Integrity Blocks

As a user,
I want deletion blocked when an organism is still needed,
So that my battles never break.

**Acceptance Criteria:**

**Given** an organism referenced by any saved battle or the open grid, **When** delete is attempted, **Then** it is hard-blocked with an error naming the count and the specific battles, and stating both remedies: remove it from those battles, or delete the battles (FR-1.4, M7, UX-DR15)
**Given** an organism targeted by other organisms' rules, **When** delete is attempted, **Then** the rule-reference block variant names the referencing organisms and the remedy (Decision E.5, UX-DR15)
**And** both checks consume the 4.19 derivations; nothing is deleted in either case, and the whole-workspace referential-integrity guarantee holds (NFR-5.1 scope)

### Story 4.22: Safe Delete & Protected Default

As a user,
I want to delete unused organisms — but never lose the built-in one,
So that my library stays clean and always usable.

**Acceptance Criteria:**

**Given** an unreferenced organism, **When** deleted, **Then** a confirmation dialog precedes removal; confirm deletes it with the "Organism deleted" toast, cancel changes nothing (FR-1.4, UX-DR15/14)
**And** Conway's Classic delete is disabled with an explanatory message regardless of usage (FR-1.5, M9)
**And** the Library grid refreshes after deletion

### Story 4.23: Editor Unsaved-Changes Scope

As a user,
I want the editor to guard its own unsaved changes,
So that I never lose authoring work — independent of any battle state.

**Acceptance Criteria:**

**Given** any edit (name, dominance, color, aging, rules, order), **When** made, **Then** the editor's own dirty scope activates (AR-33)
**Given** a dirty editor, **When** Cancel/Back/Escape is used, **Then** "You have unsaved changes. Discard changes?" offers Discard / Keep Editing / Save (UX-DR16)
**And** the editor's dirty scope is fully independent of the battle's dirty flag — neither triggers the other (AR-33)
**And** a clean editor closes without any dialog

### Story 4.24: Edit Organism from Battle

As a user,
I want to tweak an organism mid-battle-design,
So that I can adjust behavior without losing my grid.

**Acceptance Criteria:**

**Given** the battle roster, **When** Epic 4 lands, **Then** the per-row ✎ pencils render for the first time (FR-3.3 pencil affordance; spec §3.4)
**Given** a pencil, **When** clicked, **Then** the editor opens as a modal over the mounted `<BattlePage>` — no route change; the unsaved grid, undo ring, and battle dirty state are preserved beneath (FR-3.12, M5, AR-33)
**And** the in-use warning uses the battle variant: Edit Anyway / Cancel only, and the header reads "◄ Back to Battle" (FR-1.3, UX-DR5)
**Given** Save & Close, **When** completed, **Then** the battle grid re-renders with the updated organism, with no battle save required (FR-3.12)

### Story 4.25: Create Organism from Battle

As a user,
I want to create a new organism while designing a battle,
So that inspiration doesn't require leaving my work.

**Acceptance Criteria:**

**Given** the roster's "+ CREATE NEW ORGANISM" button (rendered from this story on; spec §3.4), **When** clicked, **Then** the editor opens in create mode over the mounted battle (FR-1.2 entry, M5)
**Given** Save & Close, **When** completed, **Then** the new organism joins the session roster, immediately selectable for painting (Decision H.2; spec §3.4)
**And** Cancel leaves the roster and battle untouched

## Epic 5: Sharing, Backup & Workspace Management

Users can export Battles to share, import shared files safely, and manage their workspace. Versioned serializer with rule-aware closure, migration pipeline, atomic destructive import, Clear All, workspace statistics, and the Settings page shell. NFR-7.3 load-time corruption handling lands here.

### Story 5.1: Settings Page Shell

As a user,
I want a Settings page in the navigation,
So that workspace management has a home.

**Acceptance Criteria:**

**Given** the top nav, **When** Epic 5 lands, **Then** the Settings entry renders for the first time and `/settings` loads the page via the injected settings repository (FR-8.1, AR-27; closes the 4.1 nav gap)
**And** the page presents its sections per the Settings mockup layout, containing only what exists: Workspace Statistics and Data Management (Display/Simulation preferences arrive in Epic 6 — no dead sections)
**And** setting changes apply immediately or on confirm and persist in `gol:settings` (FR-8.1)
**And** the page is keyboard-operable and passes axe

### Story 5.2: Workspace Statistics

As a user,
I want to see what my workspace holds and how much space it uses,
So that I can manage capacity before it becomes a problem.

**Acceptance Criteria:**

**Given** the statistics section, **When** rendered, **Then** it shows battle count, organism count, and storage used in real-time KB/MB (FR-8.2)
**And** the storage figure comes from the AR-14 usage meter over the `gol:*` namespaces
**And** values refresh when returning to the page after data changes (page-scoped loading, RFC-005)

### Story 5.3: Export Envelope & Serializer

As a developer,
I want a versioned serializer for all file exchange,
So that every exported file is self-describing and future-migratable.

**Acceptance Criteria:**

**Given** `WorkspaceSerializer`, **When** it serializes, **Then** it produces the versioned envelope — `formatVersion: 1`, `kind: 'workspace' | 'battle'`, metadata (export timestamp, app version) (AR-10, FR-6.3)
**And** grids convert dense-at-rest → sparse-on-the-wire at the serializer boundary, and back (AR-9)
**And** round-trip identity holds: serialize → parse → validate reproduces the exact workspace (AR-44, property-tested where practical — AR-41)
**And** settings are structurally absent from every envelope (AR-12)

### Story 5.4: Rule-Aware Organism Closure

As a developer,
I want battle exports to carry every organism they truly depend on,
So that an imported battle never has dangling references.

**Acceptance Criteria:**

**Given** a battle export, **When** the organism set is computed, **Then** it includes all placed organisms plus the transitive closure of rule-referenced organisms (an included organism's rules targeting another pulls that one in too) (AR-10, Decision E.5)
**And** the closure reuses the Story 4.19 rule-reference derivation — no duplicate logic
**And** tests cover chained references (A targets B, B targets C ⇒ C included) and cycles terminating correctly

### Story 5.5: Export Workspace

As a user,
I want to download my whole workspace as one file,
So that I have a backup and can move between machines.

**Acceptance Criteria:**

**Given** the Data Management section, **When** "Export Workspace" is clicked, **Then** a `kind: 'workspace'` file downloads containing all battles and all organisms with metadata (FR-8.3, FR-6.3)
**And** the default filename is `game-of-life-workspace-YYYY-MM-DD.json` (FR-8.3)
**And** the exported file passes the serializer's own validation (round-trip sanity)

### Story 5.6: Battle Export Dialog

As a user,
I want to export a single battle to share,
So that others can import and run my creation.

**Acceptance Criteria:**

**Given** the editor's Tools section, **When** Epic 5 lands, **Then** "EXPORT BATTLE" renders for the first time (spec §3.7 — the 2.15 gap closes)
**Given** the export action, **When** invoked, **Then** a dialog offers "Battle only" vs "Entire Workspace" (FR-7.13); Battle-only exports the initial (Edit-mode) grid with the 5.4 closure organisms (FR-6.1), Entire Workspace behaves as 5.5
**And** the default filename derives kebab-case from the battle name, e.g. `triple-threat.json` (FR-6.4); untitled battles get a sensible fallback
**And** the export contains initial state only — never live Run-mode state (FR-6.1, AR-31)

### Story 5.7: Migration Registry

As a developer,
I want one source-keyed migration path for all persisted and imported data,
So that format evolution never forks between storage and files.

**Acceptance Criteria:**

**Given** the migration registry, **When** data loads from localStorage **or** a file import, **Then** the same source-keyed chain applies at both boundaries (AR-11)
**And** `schemaVersion` and `PALETTE_VERSION` act as write-time stamps only — no runtime logic branches on them (AR-11)
**Given** a file with `formatVersion` newer than the app supports, **When** imported, **Then** it is rejected with a clear "app too old" error — never partially applied (AR-11)
**And** the registry has tests for identity (current-version passthrough) and rejection paths; real migrations arrive with future format bumps

### Story 5.8: Atomic Import Pipeline

As a developer,
I want import to be all-or-nothing,
So that a bad file can never destroy a user's workspace.

**Acceptance Criteria:**

**Given** an import execution, **When** it runs, **Then** the pipeline is parse → migrate → validate (full Zod, including superRefines) → closure assert → snapshot current workspace → `replaceAll` → rollback from snapshot on any failure (AR-10)
**Given** a battle-kind file, **When** imported, **Then** the unified destructive semantics apply (whole-workspace replace per FR-8.4) with the battle + its organisms as the new content
**And** after any successful import, Conway's Classic is re-ensured (FR-1.5, AR-13) and `gol:settings` is untouched — by construction, not by care (AR-12)
**And** integration tests cover: corrupt JSON, schema-invalid data, closure violation, and mid-replace failure → workspace identical to pre-import (AR-44)

### Story 5.9: Import UI & Destructive Warning

As a user,
I want clear warnings before import replaces my workspace,
So that I never lose data I meant to keep.

**Acceptance Criteria:**

**Given** the Data Management section, **When** "Import" is used, **Then** one unified file picker accepts both workspace and single-battle exports (FR-8.4)
**Given** a non-pristine workspace, **When** import is initiated, **Then** a mandatory warning states the destructive whole-workspace replacement and offers "Export Current Workspace First" (running 5.5) before proceeding; the warning is suppressed only for pristine workspaces (FR-8.4)
**And** success shows confirmation feedback; validation failure shows a specific, non-technical error and the workspace is unchanged (FR-8.4)
**And** the dialog flow is keyboard-operable and passes axe

### Story 5.10: Clear All Data

As a user,
I want to reset my workspace to factory state,
So that I can start completely fresh.

**Acceptance Criteria:**

**Given** "Clear All Data", **When** invoked, **Then** a warning + explicit confirmation precede any action (FR-8.5)
**Given** confirmation, **When** executed, **Then** the workspace returns to the default state — zero battles, Conway's Classic only (data-only `clearAll` + re-seed, AR-13)
**And** settings are preserved — theme and preferences survive (FR-8.5, AR-12, verified by integration test per AR-44)
**And** the Gallery subsequently shows the 1.12 empty state

### Story 5.11: Load-Time Corruption Handling

As a user,
I want the app to survive corrupted stored data,
So that a bad browser state never leaves me with a broken app.

**Acceptance Criteria:**

**Given** app load, **When** any `gol:*` namespace fails parsing or schema validation, **Then** the app renders a graceful error explaining the situation instead of crashing (NFR-7.3)
**And** the error offers a reset to the default workspace (the 5.10 path) as the recovery action; declining leaves the stored data untouched for manual rescue
**And** an unknown organism id encountered defensively falls back per NFR-7.3 rather than blocking load
**And** corruption scenarios are integration-tested per namespace

## Epic 6: Theming & Personalization

Users can switch to the Biotech Terminal aesthetic and tune the studio to their preferences. Second theme entirely in the token layer, theme-selector cards, FOUC-free loading, display and simulation preferences, and the closing accessibility validation pass (validation, not remediation).

### Story 6.1: Biotech Terminal Token Block

As a user,
I want a second, radically different visual theme,
So that I can work in a terminal-hacker aesthetic instead of the clinical one.

**Acceptance Criteria:**

**Given** the token CSS file, **When** the Biotech Terminal block is added, **Then** a `:root[data-theme='biotech-terminal']` **override block** restyles every `--gol-*` property that differs from the `:root` default: monospace type, matrix-green `#00ff41` accent, outlined button treatments, square corners, dense spacing (UX-DR1) _(amended 2026-08-07 from "a complete second `[data-theme]` token set covers every `--gol-*` property" — Story 1.9 put the DEFAULT theme's values on bare `:root` so an unstamped root is still themed, so a literal "complete second set" would reinstate the duplication that structure removes; see `project-context.md#Token layer shape`. Any token Biotech does **not** override must be a deliberate inherit, not an oversight — verify against the `:root` list.)_
**And** buttons, toggles, cards, inputs, and badges all restyle correctly in both themes (UX-DR1)
**And** zero component files change — the theme lands entirely in the token file, proving NFR-8.4; the AR-46 lint rule still passes
**And** the palette registry's organism colors are identical across themes (FR-2.3)

### Story 6.2: Biotech Effects

As a user,
I want the Biotech theme's signature glow and scan-line effects,
So that the theme feels alive, not just recolored.

**Acceptance Criteria:**

**Given** the Biotech Terminal theme, **When** active, **Then** the scan-line CSS keyframe animation renders and interactive elements carry glow box-shadows (UX-DR4)
**And** effects are implemented per the AR-38 strategy: CSS keyframes, not JS; MUI transitions untouched for standard UI
**And** no UI animation runs during simulation steps — playback frame budget is unaffected, verified against the 3.7 benchmark (AR-38, NFR-1.1)
**And** effects are scoped to the Biotech block — Clinical Lab renders none of them

### Story 6.3: Theme Selector Cards

As a user,
I want to pick my theme from visual preview cards,
So that I can see what I'm choosing before I choose it.

**Acceptance Criteria:**

**Given** the Settings Display Preferences section, **When** rendered, **Then** Theme Selection appears first (UX-DR3) as two selectable cards with preview sample, name, and description, with radio-group semantics (FR-8.6, UX-DR2)
**And** hover shows accent border + 2px lift; the active card shows accent border + glow; clicking anywhere on a card selects it (UX-DR2)
**And** the cards are keyboard-operable as a radio group (arrow keys move selection) and pass axe

### Story 6.4: Instant Theme Switch & Persistence

As a user,
I want theme changes to apply instantly and stick,
So that switching feels native and survives my next visit.

**Acceptance Criteria:**

**Given** a theme card selection, **When** clicked, **Then** the switch applies in < 100 ms by flipping the `data-theme` attribute on `<html>` — no reload, no flash, no layout shift (FR-8.6, NFR-8.2, AR-36)
**And** the selection persists to `gol:settings` and survives reload (FR-8.6)
**And** the canvas surfaces (Gallery thumbnails, editor, playback) render correctly immediately after a switch — organism colors unchanged, chrome tokens updated

### Story 6.5: FOUC-Free Theme Loading

As a user,
I want my chosen theme present from the very first paint,
So that the app never flashes the wrong look.

**Acceptance Criteria:**

**Given** `<head>`, **When** the page loads, **Then** a synchronous inline script reads the theme from `gol:settings` with a defensive parse (malformed/missing → Clinical Lab default) and stamps `data-theme` before first paint (NFR-8.5, AR-37)
**And** no theme flash is observable on hard reload with the Biotech theme persisted (e2e-verified)
**And** the script stays tiny and inline — no external request, no render blocking beyond itself (NFR-1.2)

### Story 6.6: Grid Lines Toggle

As a user,
I want to show or hide grid lines everywhere,
So that I can trade precision for a cleaner look.

**Acceptance Criteria:**

**Given** the Display Preferences toggle row (label + description + divider per UX-DR3), **When** Grid Lines is toggled, **Then** the setting applies to Gallery tiles, Edit Mode, and Play Mode via the renderer's `setGridLines` overlay (FR-8.7)
**And** the default is on; the choice persists in `gol:settings` (FR-8.7)
**And** the change is visible immediately in any open surface without reload (FR-8.1)

### Story 6.7: Cell Animation Toggle

As a user,
I want to control the living-cell pulse animation,
So that I can calm the visuals when I prefer.

**Acceptance Criteria:**

**Given** the Display Preferences row, **When** Cell Animation is toggled, **Then** the pulsing living-cell animation enables/disables on playback surfaces (FR-8.8)
**And** the default is on; the choice persists (FR-8.8)
**And** the animation never runs during simulation steps themselves — it respects the AR-38 rule and leaves the frame budget intact (NFR-1.1)

### Story 6.8: Default Grid Size Setting

As a user,
I want to choose the default size for new battles,
So that new petri dishes start the way I like them.

**Acceptance Criteria:**

**Given** the Simulation Preferences section, **When** Default Grid Size is set, **Then** the options are {50×30, 100×60} with 100×60 the default (FR-8.10)
**And** the setting affects **new battles only** — Story 2.2's `'new'` seeding consumes it from now on; existing battles are untouched (FR-8.10)
**And** the choice persists in `gol:settings`

### Story 6.9: Default Simulation Speed Setting

As a user,
I want to set my preferred starting speed,
So that every run begins at my pace.

**Acceptance Criteria:**

**Given** Simulation Preferences, **When** Default Simulation Speed is set, **Then** it offers the FR-4.2 ladder (1/2/5/10/20 gen/sec) with 10 as default (FR-8.12)
**And** entering Run mode starts at this speed — Story 3.13's control consumes it as its initial value; live adjustments during a run still work and don't alter the setting (FR-8.12)
**And** the choice persists in `gol:settings`

### Story 6.10: Auto-Save Toggle

As a user,
I want optional auto-save while editing,
So that I can choose convenience over explicit control.

**Acceptance Criteria:**

**Given** Simulation Preferences, **When** Auto-Save is toggled, **Then** it defaults to Disabled and persists (FR-8.11)
**Given** auto-save enabled, **When** editing a battle that has **never been manually saved**, **Then** auto-save stays inert — the first save is always explicit (FR-8.11)
**Given** auto-save enabled and a previously-saved battle, **When** edits commit, **Then** saves run automatically through the 2.13 path (quota failure surfaces the same non-destructive error) and `isDirty` clears — the 2.16 guard consequently stays quiet
**And** auto-save never runs during Play Mode (FR-8.11); it also never persists Play-mode ephemeral state (FR-4.9, AR-31)

### Story 6.11: Accessibility Validation Pass

As a user relying on assistive technology or affected by color-vision deficiency,
I want the app verified accessible end-to-end,
So that the studio genuinely works for me.

**Acceptance Criteria:**

**Given** the Clinical Lab theme, **When** audited, **Then** WCAG AA contrast holds across all screens: 4.5:1 text, 3:1 controls (NFR-8.3) — findings expected ≈ zero since a11y sat in every epic's DoD
**And** axe-core passes on all key screens: Gallery, Battle Editor, Play Mode, Organism Library, Organism Editor, Settings — wired into CI's e2e stage (AR-44)
**And** the organism palette's CVD distinguishability verification (4.9) is re-confirmed against final rendered output, documented (NFR-8.3, AR-26)
**And** Biotech Terminal is explicitly out of AA scope as stylistic (NFR-8.3); any genuine defects found become fixes in this story, not deferred tickets
