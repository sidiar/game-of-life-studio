---
title: Battle Page Component Tree — Companion Spec
status: approved
created: 2026-07-15
updated: 2026-07-16 (rev 2 — reconciled against the Clinical Lab UX mockups petri-dish-lab-mode.html / petri-dish-play-mode.html / petri-dish-play-mode-fullscreen.html; iteration: added §3.3 <BattleEditorView>, battle-name maxLength 100 per RFC-001 — §9.10)
inputDocuments:
  - 'docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md'
  - 'docs/planning-artifacts/architecture.md'
  - 'docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md'
  - 'docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md'
  - 'docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md'
  - 'docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md'
  - 'docs/planning-artifacts/rfcs/RFC-007-organism-colour-palette.md'
  - 'docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-lab-mode.html'
  - 'docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode.html'
  - 'docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/clinical-lab-theme/petri-dish-play-mode-fullscreen.html'
---

# Battle Page Component Tree — Companion Spec

**Scope:** the full component design for `<BattlePage>` in both modes — **Lab (Edit)** and **Run (Play)**, including the **fullscreen Run stage** — plus the non-React modules it drives (renderer, simulation loop) and the seams it shares with other surfaces (Gallery thumbnails, Organism Editor preview).

**Governance:** this document *elaborates* approved decisions; it introduces none. Authority order: **owning RFC → architecture.md cross-cutting decisions → UX mockups → this spec.** Where a UX mockup predates and contradicts a reconciled architecture decision, the decision wins and the divergence is recorded in §9. Stories cite this spec for component APIs and CTA placement; they cite the RFCs for behavioral rules.

**Layout source of truth:** the Clinical Lab mockups. Both modes share one chassis — **slim header** (battle title + mode toggle) · **left sidebar** (mode-specific sections + Back footer) · **main area** (grid + bottom bar). CTAs live where the mockups put them: Save/Undo in the Lab bottom bar, Back in the sidebar footer, name editing in a sidebar section — **not** in the header.

---

## 1. Layer Map

Three layers, dependencies pointing down only:

```
┌─ REACT COMPONENTS (apps/web) ────────────────────────────────────────────┐
│  BattlePage · BattleHeader · sidebars & sections · PetriDishCanvas ·      │
│  EditorStatusBar · SimulationControlBar · FullscreenStage · dialogs      │
├─ HOOKS (apps/web) ───────────────────────────────────────────────────────┤
│  useAsyncResource · useUndoableGrid · useSimulation ·                     │
│  useSimulationHotkeys · useDirtyGuard                                    │
├─ NON-REACT MODULES (packages/*) ─────────────────────────────────────────┤
│  GridRenderer (RFC-002) · SimulationLoop (Decision D) ·                   │
│  simulation engine step/strategy (RFC-004) · palette LUT (RFC-007) ·     │
│  repositories (RFC-001/006)                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

Rule (RFC-005): React never holds hot state; non-React modules never reach into React. The hooks are the only bridge.

## 2. Component Tree (both modes + fullscreen)

```
app/(battle)/battle/page.tsx        # /battle?id=<uuid> — Decision K (static export)
└─ <BattlePage repositories>                                      [Epic 2]
   │  owns: mode, battleName, initialGrid (useUndoableGrid), isDirty,
   │        loaded organisms, session roster (H.2)
   ├─ <BattleHeader>            title display · mode toggle · fullscreen entry
   ├─ <UnsavedChangesDialog> + useDirtyGuard (beforeunload)       [Epic 2]
   │
   ├─ mode === 'lab' ─ <BattleEditorView>                         [Epic 2]
   │   ├─ <EditorSidebar>
   │   │   ├─ <OrganismRoster>            "Organisms" section     [Epic 2; ✎/create Epic 4]
   │   │   │   ├─ <OrganismRosterItem>*   color chip · name · ✎ pencil
   │   │   │   ├─ <OrganismSearchAdd>     search + "+ ADD ORGANISM" dropdown
   │   │   │   ├─ CreateOrganismButton    "+ CREATE NEW ORGANISM" [Epic 4]
   │   │   │   └─ <EraserTool>            fixed at section bottom (FR-3.6)
   │   │   ├─ <BattleNameField>           "Battle Name" section (FR-3.9)
   │   │   ├─ <GridSettingsSection>       "Grid Info" + edit resize (FR-3.11)
   │   │   ├─ <EditorToolsSection>        Clear (FR-3.7) · Export [Epic 5]
   │   │   └─ <SidebarFooter>             ← BACK TO BATTLES (FR-7.10)
   │   └─ <EditorMain>
   │       ├─ <PetriDishCanvas variant="edit">                    [Epic 2]
   │       ├─ <EditorStatusBar>           stats · UNDO · SAVE (FR-3.8/7.8)
   │       └─ <ResizeClipWarningDialog>   (FR-3.11)
   │
   ├─ mode === 'run' ─ <BattleSimulationView>                     [Epic 3]
   │   │  owns: useSimulation(initialGrid, organisms); fullscreen state
   │   ├─ <SimulationSidebar>
   │   │   ├─ <PopulationStats>           "Population Analysis" (FR-4.6)
   │   │   ├─ <CycleCounter>              "Cycle Count" (FR-4.5)
   │   │   ├─ <SpeedControl>              gen/sec ladder slider (FR-4.2)
   │   │   ├─ <GridSizeControl variant="play">  paused-only (FR-4.9)
   │   │   └─ <SidebarFooter>             ← BACK TO BATTLES (FR-7.10)
   │   ├─ <SimulationMain>
   │   │   ├─ <PetriDishCanvas variant="playback">
   │   │   └─ <SimulationControlBar>      hints · Play/Pause · Next · Stop (FR-4.1/4.3/4.4)
   │   ├─ fullscreen ─ <FullscreenStage>                          [Epic 3 — see §9.5]
   │   │   ├─ <FullscreenTopOverlay>      title + RUN badge · Exit Fullscreen
   │   │   ├─ (same PetriDishCanvas — re-laid out, never remounted)
   │   │   └─ <FullscreenHUD>             cycle · population pills · speed · transport
   │   └─ useSimulationHotkeys            SPACE / → / ESC / F     [Epic 3 — see §9.6]
   │
   └─ <OrganismEditorModal> (lazy)        over the mounted page (FR-3.12/M5)  [Epic 4]
```

`<BattlePage>` stays mounted across Lab↔Run (RFC-005 Decision 3). Epic 2 ships the skeleton with only `'lab'` populated and **no Run or fullscreen affordance rendered** (no dead buttons — NFR-4.1); Epic 3 adds the toggle, the `'run'` branch, and fullscreen.

## 3. Component Specifications

Format: **Responsibility** (single) · **State** (category per RFC-005) · **API** · **FRs / UX source** · **Reuse/DI** · **Epic**.

### 3.1 `<BattlePage>`

- **Responsibility:** own the open battle's shared runtime state and compose the header + mode views. No rendering logic, no persistence-format knowledge.
- **State:** *ephemeral local:* `mode`, `battleName`, `isDirty`, `sessionRoster: string[]` (organisms added to the Lab roster but not yet painted — Decision H.2: never persisted, never blocks deletion, gone on close); *ephemeral via hook:* `initialGrid` + undo ring; *persisted (via injected repos):* battle load/save, organisms list.
- **API:**
  ```ts
  interface BattlePageProps {
    repositories: AppRepositories        // DI seam (RFC-001 / RFC-005 Decision 1)
    battleId: string | 'new'             // 'new' seeds an empty grid at the FR-8.10 default preset (FR-7.4)
  }
  ```
  Internal wiring: `useAsyncResource` loads (battle, organisms); save handler → `repositories.battles.save` (the dense `gridState` is written as-is — Reconciliation #3; roster pruned to the placed set on save — H.1); Back handler runs the FR-7.9 guard then navigates.
- **FRs:** FR-7.4/7.5 (entry), FR-7.8 (save orchestration), FR-7.9 (dirty + guard), FR-3.10/4.8 (mode transitions: entering Run clones `initialGrid`; leaving Run discards the live grid by unmounting the Run view).
- **Epic:** 2 (skeleton + lab); 3 (run branch).

### 3.2 `<BattleHeader>` *(rev 2 — matches mockup header)*

- **Responsibility:** the slim persistent header: battle-title **display**, mode toggle, fullscreen entry. Nothing else — **no name editing, no Save, no Back, no dirty indicator** (those live in the sidebar/status bar per the mockups).
- **State:** none (controlled).
- **API:**
  ```ts
  interface BattleHeaderProps {
    battleTitle: string                          // display only ("logo" slot in the mockup);
                                                 // editing happens in <BattleNameField> (§3.5)
    mode?: 'lab' | 'run'                         // absent in Epic 2 → toggle not rendered
    onModeToggle?(next: 'lab' | 'run'): void     // FR-3.10 / FR-4.8; Epic 3
    onEnterFullscreen?(): void                   // run mode only (mockup: ⛶ FULLSCREEN); Epic 3
  }
  ```
- **FRs / UX:** FR-3.10, FR-4.8; fullscreen button per `petri-dish-play-mode.html` (see §9.5). Untitled battles display "Untitled Battle".
- **Epic:** 2 (title only), 3 (toggle + fullscreen).

### 3.3 `<BattleEditorView>` (Lab mode) *(rev 2 — new; the Lab counterpart of §3.11)*

- **Responsibility:** compose the Lab chassis (editor sidebar + main + status bar) and own tool selection. Deliberately thinner than its Run sibling: it instantiates no hooks — the grid and undo ring live in `<BattlePage>` (`useUndoableGrid`, RFC-005 D6) so the initial grid survives Lab↔Run switches and this view can unmount freely.
- **State:** *ephemeral local:* `selectedTool: Tool` (organism or eraser — §3.4; dies with the view); *derived per commit:* editor-grid stats (`livingCells`, `perOrganism` counts) and `duplicateColorIds` (FR-3.3 same-colour warning), memoized on `grid`/`roster` identity — recomputed per committed gesture, never per pointer-move (NFR-4.2).
- **API:**
  ```ts
  interface BattleEditorViewProps {
    grid: Grid                                   // current initialGrid value (owned by BattlePage; carries dimensions)
    onCommitGrid(next: Grid): void               // the one undoable-commit seam (RFC-005 D6):
                                                 // stroke (§3.10), Clear (FR-3.7), confirmed resize (FR-3.11)
    onUndo(): void; canUndo: boolean             // → EditorStatusBar (FR-3.8)
    battleName: string
    onNameChange(name: string): void             // → BattleNameField (FR-3.9)
    roster: OrganismSummary[]                    // placed ∪ session-added (Decision H) → OrganismRoster
    library: OrganismSummary[]                   // → OrganismRoster add dropdown (FR-7.15)
    onAddToRoster(organismId: string): void      // → sessionRoster (H.2)
    isDirty: boolean; onSave(): void             // → EditorStatusBar SAVE (FR-7.8)
    onBack(): void                               // → SidebarFooter (FR-7.10; the FR-7.9 guard runs in BattlePage)
    showGridLines: boolean                       // FR-8.7 → canvas
    onExport?(): void                            // → EditorToolsSection (Epic 5; absent → not rendered)
    onEditOrganism?(id: string): void            // → roster ✎ (Epic 4)
    onCreateOrganism?(): void                    // → roster create (Epic 4)
  }
  ```
  Internal wiring: stroke commits arrive from `<PetriDishCanvas variant="edit">` `onStrokeCommit` → `onCommitGrid`; `EditorToolsSection.onClear` commits an empty grid (FR-3.7); a shrinking resize that would clip living cells opens `<ResizeClipWarningDialog>` first, then commits (FR-3.11) — both undoable. Grid facts for `<GridSettingsSection>` derive from `grid`. Initial tool selection is a story-level call (suggest: first roster row; eraser when the roster is empty).
- **FRs / UX:** composition only — no FR of its own; chassis per `petri-dish-lab-mode.html` (sidebar order: Organisms · Battle Name · Grid Info · Tools · Back).
- **Reuse/DI:** none — battle-specific composite (`<EditorSidebar>`/`<EditorMain>` are private layout children, not shared).
- **Epic:** 2.

### 3.4 `<OrganismRoster>` *(rev 2 — replaces `<OrganismDropdown>`)*

The mockup realizes FR-3.3's "Organism Dropdown" as a **composite sidebar section**, not a single select: a fixed list of the battle's organisms (selectable, with per-row ✎ pencil), a search + add dropdown over the rest of the library, a create button, and the Eraser pinned at the bottom.

- **Responsibility:** tool selection (organism or eraser) and roster management for the open battle.
- **State:** *ephemeral local:* search filter text. Selection is controlled (owned by `<BattleEditorView>`, §3.3); the roster union is owned by `<BattlePage>`.
- **API:**
  ```ts
  interface OrganismRosterProps {
    roster: OrganismSummary[]                    // placed ∪ session-added (Decision H); render order = list order
    library: OrganismSummary[]                   // full shared library minus roster → the add dropdown (FR-7.15)
    selectedTool: Tool                           // { kind:'organism'; organismId } | { kind:'eraser' }
    onSelectTool(tool: Tool): void               // row click / eraser click (FR-3.3/3.6)
    onAddToRoster(organismId: string): void      // "+ ADD ORGANISM" → sessionRoster (H.2)
    duplicateColorIds?: string[]                 // same-color-in-battle warning rows (FR-3.3)
    onEditOrganism?(id: string): void            // ✎ per row → editor modal (FR-3.3/3.12); Epic 4
    onCreateOrganism?(): void                    // "+ CREATE NEW ORGANISM" → editor modal (M5); Epic 4
  }
  ```
- **FRs / UX:** FR-3.3, FR-3.6 (Eraser), FR-3.12 + FR-1.2 entry points (Epic 4), FR-7.15 (library-wide add list). Search box is UX-sourced (mockup; no dedicated FR) — filters the add dropdown only.
- **Reuse/DI:** none — battle-specific composite. `OrganismRosterItem` (chip + name + optional pencil) is shared with the Organism Library card list styling in Epic 4.
- **Epic:** 2 (list/add/eraser over seeded + fixture organisms); 4 (pencil + create).

### 3.5 `<BattleNameField>` *(rev 2 — moved out of the header)*

- **Responsibility:** the "Battle Name" sidebar section — text input with live character count.
- **API:**
  ```ts
  interface BattleNameFieldProps {
    value: string
    onChange(name: string): void                 // FR-3.9; marks battle dirty
    maxLength?: number                           // 100 per RFC-001 BattleSchema name cap — §9.10 (mockup's "/ 50" superseded)
  }
  ```
- **FRs / UX:** FR-3.9; layout per lab mockup sidebar section 2.
- **Epic:** 2.

### 3.6 `<GridSettingsSection>` *(rev 2 — mockup "Grid Info" + the post-mockup FR-3.11 resize)*

- **Responsibility:** show grid facts (size, total cells, living cells) and host the Edit-mode preset resize. The mockup (2026-05-27) shows read-only Grid Info; FR-3.11/Decision A (2026-06-23) added edit-mode resize afterward — the control lands in this section (see §9.2).
- **API:**
  ```ts
  interface GridSettingsSectionProps {
    gridSize: EditableGridPreset                 // {50×30} | {100×60}
    onResize(preset: EditableGridPreset): void   // FR-3.11 — parent shows ResizeClipWarningDialog if shrinking clips
    stats: { totalCells: number; livingCells: number }   // derived from initialGrid on commit
  }
  ```
- **FRs:** FR-3.1 (size facts), FR-3.11.
- **Epic:** 2.

### 3.7 `<EditorToolsSection>` *(rev 2 — mockup "Tools")*

- **Responsibility:** grid-level actions. MVP ships two of the mockup's four buttons; see §9.3 for the excluded pair.
- **API:**
  ```ts
  interface EditorToolsSectionProps {
    onClear(): void                              // "CLEAR PETRI DISH" = FR-3.7 Reset Grid (an undoable commit)
    onExport?(): void                            // "EXPORT BATTLE" → FR-6.1/7.13 dialog; Epic 5 (absent → not rendered)
  }
  ```
- **FRs:** FR-3.7; FR-6.1/7.13 (Epic 5).
- **Epic:** 2 (Clear), 5 (Export).

### 3.8 `<EditorStatusBar>` *(rev 2 — new; the lab bottom bar owns Undo + Save)*

- **Responsibility:** the Lab bottom bar: initial-grid stats on the left (Generation 0 · Living Cells · per-organism population counts, colored), **UNDO** and **SAVE** on the right.
- **State:** none (controlled). Stats are a cheap derivation from `initialGrid`, recomputed per committed gesture — not per pointer-move.
- **API:**
  ```ts
  interface EditorStatusBarProps {
    stats: { livingCells: number
             perOrganism: Array<{ organismId: string; colorToken: string; count: number }> }
    onUndo(): void; canUndo: boolean             // FR-3.8
    onSave(): void; isDirty: boolean             // FR-7.8 — save affordance state
  }
  ```
- **FRs / UX:** FR-3.8, FR-7.8; layout per lab mockup stats-bar. (The mockup's Grid Zoom slider in this bar is superseded — §9.1.)
- **Epic:** 2.

### 3.9 `<SidebarFooter>` / Back

- **Responsibility:** the pinned "← BACK TO BATTLES" footer, identical in both sidebars.
- **API:** `{ onBack(): void }` — `<BattlePage>` runs the FR-7.9 guard before navigating (FR-7.10).
- **Epic:** 2 (lab), 3 (run).

### 3.10 `<PetriDishCanvas>` — the one grid surface *(unchanged from rev 1)*

- **Responsibility:** mount a `<canvas>`, own pointer→cell mapping, delegate **all** drawing to the shared `GridRenderer`. Never draws a pixel itself; never schedules frames.
- **State:** *hot (refs only):* renderer instance, in-progress stroke buffer. A stroke commits **once** on pointer-up (RFC-005 D6).
- **API:**
  ```ts
  type PetriDishVariant =
    | { variant: 'edit'; grid: Grid; tool: Tool; onStrokeCommit(next: Grid): void }
    | { variant: 'playback'; onRendererReady(r: GridRenderer): void }   // useSimulation drives it imperatively
    | { variant: 'static'; grid: Grid }                                 // one-shot renderStatic (M4)

  interface PetriDishCanvasProps {
    size: { cols: number; rows: number }         // auto-fit derives cellSize (FR-3.2 / A.5)
    palette: RefToFillGroup                      // OrganismRef → (colorToken, agingEnabled) LUT (RFC-007/B.2)
    showGridLines: boolean                       // FR-8.7
    cellAnimation?: boolean                      // FR-8.8 (playback only)
    // ...one of the three variants above
  }
  ```
- **FRs:** FR-3.1/3.2, FR-3.4–3.6 (edit variant), FR-5.7 rendering, FR-8.7/8.8 consumption.
- **Reuse/DI:** same component serves the Battle editor (`edit`), Battle run (`playback`), Gallery tile + Organism-Editor preview (`static`/second `playback` — M3/M4). Renderer surfaces upward via `onRendererReady` — the DI seam keeping `useSimulation` DOM-free.
- **Epic:** `static` 1, `edit` 2, `playback` 3, preview reuse 4.

### 3.11 `<BattleSimulationView>` (Run mode) *(rev 2 — owns fullscreen)*

- **Responsibility:** compose the Run chassis (sidebar + main + optional fullscreen stage) and own the `useSimulation` instance. The only component that touches the hook.
- **State:** *hot (inside hook):* live grid, RAF loop; *ephemeral local:* `fullscreen: boolean` (RFC-005 D2 run-local state; entry from `<BattleHeader>`, exit from the overlay / `F`); *throttled derived:* `status`, `cycle`, `population`.
- **API:**
  ```ts
  interface BattleSimulationViewProps {
    initialGrid: Grid                            // cloned by the hook on mount (RFC-005 D4)
    organisms: OrganismRuntime[]                 // dense array w/ dominance, agingEnabled, compiled rules
    startingSpeed: GenPerSec                     // FR-8.12 default → FR-4.2 control
    onExitToLab(): void                          // FR-4.8
    showGridLines: boolean; cellAnimation: boolean
  }
  ```
  Fullscreen is a **layout swap, not a remount**: the same `<PetriDishCanvas>`/renderer instance is re-laid out into `<FullscreenStage>` (CSS-driven), so the live grid and renderer state survive entering/exiting fullscreen.
- **FRs / UX:** FR-4.1–4.9 composition; fullscreen per play-mode + fullscreen mockups (§9.5).
- **Epic:** 3.

### 3.12 Run sidebar sections *(rev 2 — analysis lives in the sidebar, not the bottom bar)*

```ts
interface PopulationStatsProps {                 // "Population Analysis" (FR-4.6)
  entries: Array<{ organismId: string; name: string; colorToken: string;
                   count: number; pct: number; extinct: boolean }>   // pre-sorted (M2); extinct last w/ ☠
  totalLiving: number                            // mockup "Total Living Cells" row
}
interface CycleCounterProps { cycle: number }    // FR-4.5 — zero-padded display per mockup
interface SpeedControlProps {                    // FR-4.2 — detented slider over the ladder 1|2|5|10|20
  genPerSec: GenPerSec
  onChange(v: GenPerSec): void                   // live during playback (ref-write; no loop restart)
}
interface GridSizeControlProps {                 // FR-4.9 — detented slider over all four presets
  value: GridPreset
  onChange(preset: GridPreset): void             // → useSimulation.resizeLive
  disabled: boolean                              // running ⇒ disabled ("⚠ Adjustable while paused")
}
```
All pure presentational; logic (sorting, extinction, cadence) upstream in `useSimulation`/M2. **Epic 3.** `PopulationStats` (compact) and `SpeedControl` are reused by the Organism-Editor preview panel (M3, Epic 4); `GridSizeControl` shares its preset model with `<GridSettingsSection>` (edit subset) and Settings (FR-8.10, Epic 6).

### 3.13 `<SimulationControlBar>` *(rev 2 — transport lives in the bottom bar)*

- **Responsibility:** the Run bottom bar: keyboard hints left, transport buttons right.
- **API:**
  ```ts
  interface SimulationControlBarProps {
    status: 'paused' | 'playing'
    onPlayPause(): void                          // FR-4.1 (one toggle button per mockup)
    onStep(): void                               // FR-4.3 "Next Cycle"
    onStop(): void                               // FR-4.4 "Stop & Reset"
  }
  ```
- **FRs / UX:** FR-4.1/4.3/4.4; hints (`SPACE`/`→`/`ESC`) per mockup — display only, handling in `useSimulationHotkeys` (§4).
- **Epic:** 3.

### 3.14 `<FullscreenStage>` *(rev 2 — new)*

- **Responsibility:** the immersive Run layout: top overlay (title + RUN badge + Exit), the re-parented canvas, bottom HUD.
- **API:**
  ```ts
  interface FullscreenStageProps {
    battleTitle: string
    onExit(): void                               // ⛶ Exit Fullscreen / F key
    hud: { cycle: number
           population: Array<{ colorToken: string; count: number; extinct: boolean }>  // compact pills, ☠ for extinct
           genPerSec: GenPerSec }
    transport: Pick<SimulationControlBarProps, 'status' | 'onPlayPause' | 'onStep' | 'onStop'>
    children: ReactNode                          // the live PetriDishCanvas (not remounted)
  }
  ```
- **UX source:** `petri-dish-play-mode-fullscreen.html` (no backing FR — §9.5).
- **Epic:** 3 (scope call at story creation).

### 3.15 Dialogs & guards *(unchanged)*

| Component | Responsibility | FR | Epic |
|---|---|---|---|
| `<UnsavedChangesDialog>` | "Save before leaving?" on Back with dirty battle | FR-7.9 | 2 |
| `useDirtyGuard(isDirty)` | registers/unregisters `beforeunload` (RFC-005 D7) | FR-7.9 | 2 |
| `<ResizeClipWarningDialog>` | warn before shrink clips cells; confirm → undoable commit | FR-3.11 | 2 |
| `<OrganismEditorModal>` | lazy editor over the mounted page (own dirty scope) | FR-3.12/M5 | 4 |

## 4. Hooks

### `useUndoableGrid(seed: Grid)` — RFC-005 Decision 6
```ts
returns [
  { value: Grid; commit(next: Grid): void },     // commit = paint/erase stroke, Clear, Edit resize
  { undo(): void; canUndo: boolean }
]
```
30-snapshot ring (occupant + dimensions), never persisted. Owned by `<BattlePage>` → survives mode switches, dies on Gallery exit. **Epic 2 implements the full RFC-005 design**; Epic 3 adds no undo code.

### `useSimulation(initialGrid, organisms, opts)` — RFC-005 Decision 5
```ts
returns {
  status: 'paused' | 'playing'
  cycle: number                                  // one int per cycle
  population: PopulationEntry[]                  // ≤10 Hz publish cadence (M2)
  play(): void; pause(): void; step(): void; stop(): void
  setSpeed(v: GenPerSec): void                   // ref-write; no loop restart (FR-4.2)
  resizeLive(p: GridPreset): void                // paused-only, ephemeral (FR-4.9)
  attachRenderer(r: GridRenderer): void          // from PetriDishCanvas onRendererReady
}
```
Owns the live double-buffered grid + `SimulationLoop` in refs. Auto-pauses on extinction (FR-4.7 — plain emptiness check, B.5). Instantiated twice: `<BattleSimulationView>` and the Organism-Editor preview (M3).

### `useSimulationHotkeys(bindings)` *(rev 2 — new; UX-sourced, §9.6)*
Run-mode-only key handling per the mockup hints: `SPACE` → play/pause, `→` → step, `ESC` → stop, `F` → toggle fullscreen. Suspended while any dialog/modal is open or an input has focus. **Epic 3.**

### `useAsyncResource(load, deps)` / `useDirtyGuard(isDirty)`
As specified in RFC-005 Decisions 1 and 7.

## 5. Non-React modules (the contracts that prevent churn)

### `GridRenderer` (RFC-002) — **frozen contract, Epic 1**
```ts
class GridRenderer {
  constructor(canvas: HTMLCanvasElement, size: { cols: number; rows: number }, palette: RefToFillGroup)
  draw(grid: Grid): void            // pure repaint of dirty regions; NO internal scheduling
  drawFull(grid: Grid): void        // full repaint (post-resize / first mount / fullscreen re-layout)
  renderStatic(grid: Grid): void    // loopless one-shot (M4: gallery tiles, preview stills)
  resize(size: { cols: number; rows: number }): void   // re-layout + full repaint (A.5); also serves canvas-size changes (fullscreen)
  markDirty(cells: Iterable<CellCoord>): void
  setGridLines(on: boolean): void   // FR-8.7 (separate cached overlay, RFC-002 Risk 4)
}
```
The renderer **never** calls `requestAnimationFrame` and **never** advances simulation state — scheduling lives exclusively in `SimulationLoop`. Epic 1 ships `renderStatic` + `drawFull` (Gallery tiles); Epic 2 adds dirty-region editing paths; Epic 3 wraps it with the loop, adding nothing to it.

### `SimulationLoop` (Decision D / RFC-002 §5) — Epic 3
RAF + time accumulator, `delta` clamped to `msPerCycle`, ≤1 step/frame, repaint-after-step. Constructed by `useSimulation` with `(renderer, step, msPerCycleRef)` — all three injected.

### Engine seam (RFC-004)
`useSimulation` receives compiled evaluators + `activeStrategy` via `createSimulation(organisms, rng)` from `packages/simulation`. The hook never imports rule internals (DIP). RNG injected (seeded in tests — RFC-008 D4).

### Palette LUT (RFC-007)
`buildRefToFillGroup(battleOrganisms)` at simulation/editor start → feeds renderer batching `(colorToken, ageShade)` (B.2). Built in Epic 1 (tile colors); full aging shades exercised from Epic 3.

## 6. State-management separation matrix

| State | Category (RFC-005) | Owner | Readers |
|---|---|---|---|
| battles / organisms / settings | persisted | repositories | BattlePage, Gallery, Library, Settings |
| `mode` | ephemeral | BattlePage | BattleHeader, view switch |
| `initialGrid` + undo ring | ephemeral (hook) | BattlePage / useUndoableGrid | EditorView, canvas(edit), save path, status-bar stats |
| `battleName`, `isDirty` | ephemeral | BattlePage | BattleHeader (display), BattleNameField, EditorStatusBar, guards |
| `sessionRoster` (added-not-painted, H.2) | ephemeral | BattlePage | OrganismRoster |
| `selectedTool` | ephemeral | BattleEditorView | OrganismRoster, canvas(edit) |
| roster search filter | ephemeral | OrganismRoster | itself |
| `fullscreen` | ephemeral | BattleSimulationView | FullscreenStage, BattleHeader (entry) |
| live grid, RAF handle, `msPerCycle` | **hot (refs)** | useSimulation | SimulationLoop → GridRenderer |
| `cycle`, `population`, `status` | throttled derived | useSimulation → React state | CycleCounter, PopulationStats, control bars, HUD |
| editor-grid stats (living cells, per-organism) | derived per commit | BattleEditorView | GridSettingsSection, EditorStatusBar |
| `duplicateColorIds` (FR-3.3 warning) | derived (from roster) | BattleEditorView | OrganismRoster |
| editor-modal dirty | ephemeral (own scope) | OrganismEditorModal | its own guard (D7) |

Invariant (reviewable in one line): **grid buffers never enter React state; nothing below `useSimulation` imports React.**

## 7. FR coverage (Battle Page surface)

| FR | Component(s) / module | Epic |
|---|---|---|
| 3.1, 3.2 | PetriDishCanvas + GridRenderer (auto-fit); size facts in GridSettingsSection | 2 |
| 3.3 | OrganismRoster (list + add dropdown + duplicate-color warning) | 2 |
| 3.4–3.6 | PetriDishCanvas(edit) stroke pipeline; EraserTool selection | 2 |
| 3.7 | EditorToolsSection "Clear Petri Dish" → undoable commit | 2 |
| 3.8 | EditorStatusBar UNDO ← useUndoableGrid | 2 |
| 3.9 | BattleNameField (sidebar) | 2 |
| 3.10, 4.8 | BattleHeader mode toggle → BattlePage | 3 |
| 3.11 | GridSettingsSection resize + ResizeClipWarningDialog | 2 |
| 3.12 | OrganismRoster ✎ / create → OrganismEditorModal | 4 |
| 4.1, 4.3, 4.4 | SimulationControlBar (+ FullscreenHUD transport) ← useSimulation | 3 |
| 4.2 | SpeedControl (sidebar slider over the ladder) | 3 |
| 4.5 | CycleCounter (sidebar; HUD in fullscreen) | 3 |
| 4.6 | PopulationStats ← M2 derivation (sidebar; pills in fullscreen HUD) | 3 |
| 4.7 | useSimulation auto-pause (B.5) | 3 |
| 4.9 | GridSizeControl(play) → useSimulation.resizeLive | 3 |
| 5.1–5.9 | engine via createSimulation seam (RFC-004) | 3 |
| 5.7 | GridRenderer ← displayColor LUT (RFC-007) | 3 |
| 7.4, 7.5 | route entry → BattlePage (`battleId: 'new' | id`) | 2 |
| 7.8 | EditorStatusBar SAVE → BattlePage save orchestration | 2 |
| 7.9 | UnsavedChangesDialog + useDirtyGuard | 2 |
| 7.10 | SidebarFooter Back (both modes) | 2, 3 |
| 6.1, 7.13 | EditorToolsSection "Export Battle" → export dialog | 5 |
| 8.7, 8.8, 8.12 | props into PetriDishCanvas / starting speed | consumed 2–3; sourced 6 |
| NFR-1.1 | hot-state rule + SimulationLoop + renderer batching | 3 |
| NFR-4.2 | stroke pipeline (immediate canvas feedback, commit-on-pointer-up) | 2 |

## 8. Reuse & DI summary

| Seam | Mechanism | Consumers |
|---|---|---|
| Repositories | props injection (App → Page) | BattlePage, Gallery, Library, Settings; fakes in tests |
| GridRenderer | constructed per canvas; passed up via `onRendererReady` | edit canvas, playback canvas, gallery tiles, editor preview |
| PetriDishCanvas | 3 variants (edit / playback / static) | Battle editor, Battle run (incl. fullscreen re-layout), Gallery tile, editor preview |
| Simulation engine | `createSimulation` factory + injected RNG | useSimulation ×2 (battle run, editor preview) |
| Preset pickers | shared preset model; GridSettingsSection (edit subset) / GridSizeControl (play, slider) / Settings (FR-8.10) | Epics 2, 3, 6 |
| SpeedControl / PopulationStats | compact variants | Play sidebar, fullscreen HUD, editor preview panel (M3) |
| SidebarFooter / OrganismRosterItem | shared primitives | both sidebars; Organism Library (Epic 4) |
| Theme | `--gol-*` tokens only (AR-46 lint) | every component above |

## 9. UX-mockup reconciliation & open items

The mockups are dated 2026-05-27; Decisions A–J landed 2026-06-23…07-09. Divergences, with resolutions:

1. **Grid Zoom slider (lab bottom bar) — excluded.** The mockup's 50–200% zoom predates Decision A.5, which replaced the viewport model with whole-grid auto-fit (FR-3.2). Architecture wins; no zoom control ships. *(Supersedes rev 1's "zoom is vestigial in RFC-005" note — the mockup is where it came from.)*
2. **Edit-mode grid resize missing from the lab mockup — added.** FR-3.11 postdates the mockup. The control lands in `<GridSettingsSection>` ("Grid Info" section), preset-picker style consistent with the play sidebar's Grid Size control. UX may want a mockup refresh; not blocking.
3. **"RESET TO SAVED" and "RANDOMIZE" (lab Tools) — excluded from MVP.** No backing FR exists for either (FR-3.7 covers only clear-to-empty; FR-4.4 covers stop-to-initial in Run). Both are plausible future FRs — flagged to product. If adopted, they slot into `<EditorToolsSection>` as two callbacks with no structural change.
4. **"CLEAR PETRI DISH" naming.** The mockup's Clear button *is* FR-3.7's "Reset Grid" (clear all cells). Stories should use the mockup label in UI copy and the FR term in ACs.
5. **Fullscreen Run stage — included, FR gap flagged.** Backed by two mockups (header ⛶ button + dedicated fullscreen layout) and RFC-005's run-local `fullscreen` state, but no FR exists. Treated as UX-sourced Epic 3 scope; recommend adding an FR (or explicit Non-Goal) at the next PRD touch. Implementation constraint either way: layout swap, never a canvas remount (§3.11).
6. **Keyboard shortcuts (SPACE / → / ESC / F) — included, FR gap flagged.** Present in both Run mockups as first-class hints; no FR. Cheap (`useSimulationHotkeys`), improves NFR-4.1 self-explanatory feel; same PRD-touch recommendation as #5.
7. **Lab bottom-bar stats (Generation 0 · Living Cells · per-organism counts) — included.** UX-sourced, no FR conflict; derived per committed gesture, so no perf concern (NFR-4.2 unaffected).
8. **Roster vs dropdown language.** FR-3.3 says "Organism Dropdown"; the mockup builds a roster list + add dropdown + eraser composite. Functionally identical coverage (all organisms reachable, eraser present, per-row pencil) — this spec follows the mockup structure; ACs should cite FR-3.3 semantics, not the literal word "dropdown".
9. **`SettingsContext` escape hatch** — unchanged from rev 1: props-drill `showGridLines`/`cellAnimation`; revisit only on evidence (RFC-005 D9).
10. **Battle-name length — 100, per RFC-001.** The lab mockup caps the name input at 50 (`maxlength="50"`, "13 / 50" counter), but RFC-001's `BattleSchema` sets `name: z.string().max(100)` — the 50-char cap belongs to **Organism** names, which the mockup likely borrowed. Owning RFC wins: `<BattleNameField>` uses `maxLength = 100` and the counter renders "N / 100". UX may want a mockup refresh; not blocking.
