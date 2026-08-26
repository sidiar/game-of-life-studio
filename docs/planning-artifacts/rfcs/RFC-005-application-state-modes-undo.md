# RFC-005: Application State, Modes & Undo

**Status:** Approved
**Date:** 2026-06-22
**Approved:** 2026-07-13
**Author:** Architecture Team

## Summary

This RFC defines how Game of Life Studio manages **runtime application state** — the state that lives between the persistence layer (RFC-001) and the rendering/simulation engines (RFC-002, RFC-004).

The guiding decision is **deliberately minimal: there is no global client-state store** (no Redux, Zustand, or Jotai). State is handled by matching each kind of state to the simplest mechanism that fits it:

1. **Persisted state** (battles, organisms, settings) is owned by the **repositories** (RFC-001) and loaded **at the page boundary** via small async hooks, then passed to children as props. In Standalone/MVP the repository is localStorage, so a query-cache layer is unnecessary; components read and write the repository directly.
2. **Ephemeral UI state** (mode, selection, zoom, draft battle name, play/pause, speed, dirty flags, undo history) is **local component state**, lifted only to the lowest common ancestor that needs it.
3. **Hot simulation state** (the live grid buffers and the animation loop) lives in **refs inside a simulation hook** — never in React state — so a running simulation never triggers React re-renders and the 60 FPS budget (NFR-1.1) is protected.

Repositories are created once at the App root and **passed by props** to the page components that need them. No bespoke global context is introduced.

The result is the stated goal: **simple, maintainable state management with clear separation of concerns.**

## Links

- [Main Architecture Document](/docs/planning-artifacts/architecture.md)
- [Product Requirements Document](/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md) — FR-1.3/1.4, FR-3.8, FR-3.10, FR-4.4, FR-4.8, FR-7.8/7.9/7.10/7.15, FR-8 (settings persistence)
- [RFC-001: Multi-Mode Architecture](/docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md) — Repository pattern (**async** interfaces), `Battle`/`Organism` entities, build-time mode selection
- [RFC-002: Grid Rendering Technology](/docs/planning-artifacts/rfcs/RFC-002-grid-rendering-technology.md) — Canvas renderer, typed-array grid, RAF loop
- [RFC-004: Rules Engine & Simulation](/docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md) — pure `step`, double-buffered `Grid`, `SimulationStrategy`
- [UX — Play Mode Proposal](/docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/biotech-terminal-theme/play-mode-proposal.md) — mode-transition behavior, persistent top bar, undo preservation across modes
- [UX — Organism Editor Design](/docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md) — the editor's independent unsaved-changes scope

## Overview

### Purpose & Goals

**Primary Purpose:**
Establish the simplest state model that gives every piece of runtime state exactly one owner, a clear read/write path, and no accidental coupling — without reaching for a global store or query cache the MVP does not need.

**Goals:**
1. **Simplicity & maintainability:** prefer local state and standard React data flow; introduce shared mechanisms only where state genuinely crosses component boundaries.
2. **Clear separation of concerns:** persisted state, ephemeral UI state, and hot simulation state are three distinct categories with three distinct mechanisms.
3. **Persistence stays at the repository boundary:** components read/write through the injected repository; the Standalone (localStorage) path needs no caching layer.
4. **Performance isolation:** a running simulation must never re-render React (NFR-1.1); hot state lives in refs.
5. **Faithful mode model:** Edit↔Play (Lab↔Run) is an in-place state toggle, not navigation (FR-3.10, FR-4.4, FR-4.8).
6. **Correct undo & save semantics:** 30-level undo that survives mode switches and resets on Gallery exit (FR-3.8); two independent unsaved-change scopes (FR-7.9).
7. **Referential integrity:** shared-library rules backed by a derivation over loaded data (FR-1.3, FR-1.4, FR-1.7, FR-7.15).

### Background

The runtime-state layer is currently unowned. RFC-001 places **repositories** behind an async interface but says nothing about the working copy of the open battle, the current mode, the undo history, or how simulation progress reaches the UI without thrashing React.

The existing specs constrain this layer behaviorally but make **zero architectural commitments**, which leaves room for the minimal approach within firm guardrails:

- **Modes are not navigation.** *"Edit Mode → Play Mode feels like mode switching, not page navigation"*; the top bar is *"Persistent Across Edit/Play Modes"* (Play Mode Proposal).
- **Play→Edit restores the initial state**, not the live simulation state (FR-4.8, Assumption A-3).
- **Undo persists across mode switches** and **resets on return to Gallery** (FR-3.8; Play Mode Proposal).
- **Two unsaved-changes scopes exist:** the Battle workspace (FR-7.9) and the Organism Editor modal, which has its own *"Discard changes?"* flow (Organism Editor Design).
- **The shared library has integrity rules:** "used in N Battles" warning (FR-1.3); delete **blocked whenever the organism is referenced by any battle, the open grid, or another organism's rules** (whole-workspace check, FR-1.4; rule references per arch Decision E.5; "referenced" = **placed** on the grid — arch Decision H); the usage count is a read-only click-through to the battle names (FR-1.7).

### Three categories of state, three mechanisms (the core idea)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. PERSISTED STATE          → injected Repositories (RFC-001), loaded at     │
│    battles, organisms,         the PAGE boundary via small async hooks,      │
│    settings.                   results passed to children as props.          │
│                                Standalone/MVP: localStorage, called directly │
│                                — no query cache. (Connected mode adds React  │
│                                Query inside ApiRepository — see note below.) │
├───────────────────────────────────────────────────────────────────────────┤
│ 2. EPHEMERAL UI STATE        → local component state (useState/useReducer)   │
│    mode, tool/organism selection, zoom, draft name, play/pause, speed,      │
│    fullscreen, dirty flags, undo history.  Lifted to the lowest common      │
│    ancestor that needs it (BattlePage for mode + initial grid + undo).       │
├───────────────────────────────────────────────────────────────────────────┤
│ 3. HOT SIMULATION STATE      → refs inside a simulation hook (NOT state)     │
│    live double-buffered grid (RFC-004 §3.4) + RAF loop (RFC-002 §5).         │
│    Drives the canvas imperatively; surfaces only THROTTLED derived signals   │
│    (cycle#, population, status) to React.  Zero re-renders per cycle.        │
└───────────────────────────────────────────────────────────────────────────┘
```

There is no need for a bespoke global store: *persisted* state is owned by the repositories and loaded where it is used; *ephemeral* state is local and lifted as little as possible; *hot* state is encapsulated in refs.

> **Connected-mode note (post-MVP):** React Query is relevant only to the **`ApiBattleRepository`** path, where network calls benefit from caching, deduplication, and Next.js prefetch/hydration. When Connected mode is built, those benefits are added **inside the API repository implementation / its hooks**, behind the same repository interface — with no change to the component-level data flow described here. It is intentionally **out of scope for this RFC and the MVP**, where the localStorage repository is read directly.

## High Level Design Proposal

### Decision 1: No global store — repositories injected by props, loaded at the page boundary

**Decision:** Create repositories once at the App root (per RFC-001's `createRepositories()`), and **pass them as props** to the page components that use them. Each page loads the persisted data it needs through a small async hook over the injected repository, and passes results to children as props. Do **not** introduce a global state library, a query cache (in MVP), or a repositories context.

**Rationale:**
- **localStorage is local and fast.** The repository read/write completes well under the NFR-1.4 budget (<10ms p95); there is no network round-trip to cache or deduplicate, so a query layer would add machinery without benefit.
- **Page-scoped data, no real-time cross-page sharing.** The Gallery, the Organism Library, and an open Battle live on different routes; each loads what it needs fresh on mount. There is no MVP requirement for one route's data to update another's live, so no shared cache or context is warranted.
- **Props for repositories, explicit and testable.** Injection is shallow (App → Page); passing a fake repository makes pages trivially testable. Dependencies stay visible.

A minimal, reusable loading hook keeps pages free of boilerplate:
```ts
function useAsyncResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData]     = useState<T>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    let alive = true
    load().then(d => { if (alive) { setData(d); setStatus('ready') } })
          .catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, deps)                                                     // eslint-disable-line
  return { data, status, reload: () => load().then(setData) }
}
```

```tsx
function App() {
  const repositories = useMemo(() => createRepositories(), [])   // RFC-001 factory
  return (
    <Routes>
      <Route path="/"           element={<BattleGalleryPage battles={repositories.battles} />} />
      <Route path="/battle/:id" element={<BattlePage repositories={repositories} />} />
      <Route path="/settings"   element={<SettingsPage settings={repositories.settings} />} />
    </Routes>
  )
}
```

```tsx
// Gallery: load the list from the repo; delete + reload locally. No global cache.
function BattleGalleryPage({ battles }: { battles: BattleRepository }) {
  const { data = [], reload } = useAsyncResource(() => battles.list(), [])
  const [filter, setFilter] = useState('')                       // ← ephemeral, local
  const visible = useMemo(() => applyFilter(data, filter), [data, filter])
  const onDelete = async (id: string) => { await battles.delete(id); reload() }
  return <BattleGallery battles={visible} onApplyFilter={setFilter} onDeleteBattle={onDelete} />
}
```

### Decision 2: Component tree & state placement

The component tree below (from the design intent) is annotated with **where each piece of state lives and why**. The rule: lift each piece of state to the **lowest common ancestor** that needs it — no higher.

```
<App>                               createRepositories()
│
├─ <BattleGalleryPage battles={repo}>          loads ['battles'] via useAsyncResource; delete+reload
│    └─ <BattleGallery battles onApplyFilter onDeleteBattle>   local: filter text
│         └─ <BattleCard>
│              └─ <PetriDish isPreview />                       static snapshot render (RFC-002)
│
├─ <BattlePage repositories={…}>               ── OWNS THE SHARED BATTLE STATE ──
│     • mode: 'lab' | 'run'                     local state  (Decision 3)
│     • initialGrid                             local state  (Decision 4) — the saved/edited grid
│     • undo history (≤30)                      co-located hook (Decision 6) — survives mode switch
│     • battleName + isDirty                    local state  (Decision 7)
│     • loads organisms once; passes to both children as props
│
│     ├─ <BattleEditorPage initialGrid onPetriDishChange onSave>   (rendered when mode==='lab')
│     │     • local: zoom, selectedOrganism/tool
│     │     • Organism Editor MODAL (FR-3.12 — arch M5): opened via the dropdown pencil, over the
│     │       mounted battle; receives organisms + battles repos (usage index below)
│     │     └─ <PetriDish isEdit />             paints into initialGrid (human-speed)
│     │
│     └─ <BattleSimulationPage initialGrid organisms>             (rendered when mode==='run')
│           • local: fullscreen, speed
│           • useSimulation(initialGrid, organisms) → { cycle, population, status, play, … }
│           •   ↑ live grid + RAF live in REFS inside the hook (Decision 5/6) — NOT state
│           └─ <PetriDish />                    hook draws into the canvas imperatively
│
├─ <OrganismLibrary organisms={repo} battles={repo} />   loads ['organisms']; the FR-1.3/1.4/1.7 usage
│                                              index derives from battles.list() summaries (Decision 8 /
│                                              arch H.4) — the Library needs BOTH repositories, as does
│                                              the Editor modal above (finding #15). Editor owns its own dirty.
└─ <SettingsPage settings={repo} />            loads ['settings']; theme also mirrored to data-attr
```

`<BattlePage>` stays mounted while the user toggles between Lab and Run (its children swap, it does not). This single fact gives us, for free: **mode-as-state**, **a stable home for the initial grid**, and **undo that survives mode switches and resets on Gallery exit** (because leaving the battle unmounts `<BattlePage>`).

> **Organism Editor preview (FR-2.7, M3).** The editor's preview panel is a **separate, isolated `useSimulation` instance** (Decision 5) over a small dedicated, non-persisted grid, running **only the organism under edit**. It reuses the RFC-004 engine and this hook unchanged and never touches the open battle's state — its own subtree and refs. This is a working proof that the simulation engine is reusable on an independent grid.

### Decision 3: Modes are local state, not routes

**Decision:** `mode: 'lab' | 'run'` is **local state in `<BattlePage>`**. The app has three page surfaces only — `/` (Gallery), the Battle route (`/battle?id=<uuid>`, plus `/battle/new`), `/settings` (**Decision K**). Switching Lab↔Run swaps the rendered child; it is never a route change.

This honors *"feels like mode switching, not navigation"* and keeps the persistent top bar mounted across modes. The mode-transition animations (Play Mode Proposal: 800ms / 600ms sequences) are presentation layered on the `setMode` call; they do not alter the state model.

```tsx
function BattlePage({ repositories }: { repositories: AppRepositories }) {
  const [mode, setMode] = useState<'lab' | 'run'>('lab')
  const [grid, undo]    = useUndoableGrid(/* seeded from loaded battle */)         // Decision 6
  const { data: organisms = [] } = useAsyncResource(() => repositories.organisms.list(), [])

  return mode === 'lab'
    ? <BattleEditorPage initialGrid={grid.value} onPetriDishChange={grid.commit} onSave={…} undo={undo} />
    : <BattleSimulationPage initialGrid={grid.value} organisms={organisms} onExitToLab={() => setMode('lab')} />
}
```

> **Routing reconciliation (App Router).** The canonical router is **Next.js App Router** with file-based routes — `app/(gallery)/page.tsx` (Gallery), `app/(battle)/battle/page.tsx` (Battle, opened as `/battle?id=<uuid>`; `app/(battle)/battle/new/page.tsx` creates one — **Decision K**: `[id]` is unbuildable under `output: 'export'`), `app/settings/page.tsx` (Settings). The parenthesised segments are **route groups**: they split the layout tree (the Gallery wears `AppShell`, the battle route does not) and never appear in the URL. The `<Routes>/<Route>` snippets above are *structural illustrations*, not the literal API (RFC-001/003 fix the App Router choice). Because modes are local state (Decision 3), the only real navigation away from an open battle is **Back-to-Gallery** (an in-app button → a confirm dialog) and **tab close/refresh** (`beforeunload`, Decision 7); no router-level navigation blocker is needed for the FR-7.9 guard.

> **In-battle organism edit (FR-3.12, M5).** Editing an organism from the Battle Editor's Organism Dropdown (per-row pencil) opens the Organism Editor as a **modal overlay over the mounted `<BattlePage>`** — like Back-to-Gallery, it is *not* a route change, so the in-progress `initialGrid` (Decision 4) stays in local state untouched and the FR-7.9 guard does **not** fire. The editor keeps its own independent dirty/discard scope (Decision 7). On **Save & Close**, the organism repository write makes the new config flow to the grid renderer (shared Library, FR-7.15) so the change is visible immediately on return. The FR-1.3 warning still applies (the open battle counts) and offers **Edit Anyway** or **Cancel** only — **there is no Clone & Edit or grid rebind from the Battle Editor** (removed 2026-07-08, reversing the 2026-06-26 addition). A battle-specific variant is made by cloning in the Library (`organisms.clone()`, FR-1.6) and re-selecting the clone; the Battle Editor edit path therefore needs **no** `useUndoableGrid` rebind op and **no** clone-lifecycle handling. This is why a real `/organism/[id]` route was rejected: a route would unmount `<BattlePage>` and force battle-draft persistence; the modal gives state preservation for free.

### Decision 4: Dual grid state — authoritative initial grid vs. disposable live grid

**Decision:** The open battle has **two** grid representations with different owners:

- **`initialGrid`** — local state in `<BattlePage>`. The Edit-Mode configuration: the **only** grid the user edits, and the grid that is **saved** (FR-7.8), **exported** (FR-6.1 / A-2), and **snapshotted** for the Gallery tile (FR-7.2).
- **live grid** — owned by the `useSimulation` hook inside `<BattleSimulationPage>` (Decision 5): the double-buffered typed arrays of RFC-004 §3.4. Created by **cloning `initialGrid`** when Run starts, advanced by `step`, and **discarded** on Stop / Run→Lab.

| Action | `initialGrid` (BattlePage state) | live grid (hook refs) |
|---|---|---|
| Lab paint/erase (FR-3.4–3.6) | mutate (+ undo entry) | n/a |
| Lab resize (Decision A) | resize top-left anchored (+ undo entry) — **persisted** | n/a |
| Enter Run (FR-3.10) | read-only (cloned) | created from clone |
| Step / Play (FR-4.1/4.3) | untouched | advanced |
| Run resize (Decision A) | untouched | resize top-left anchored — **ephemeral** |
| Stop & Reset (FR-4.4) | untouched | discarded → view shows `initialGrid` |
| Run → Lab (FR-4.8) | untouched | discarded |

"Return to initial state" is therefore trivially correct: it is simply *forgetting the live buffer* and unmounting the simulation view — never a reverse computation.

> **Representation note:** although conceptually a 2D occupant map, `initialGrid` is stored in the RFC-004 `Grid` typed-array shape so it can be handed to the engine and renderer with **zero conversion**. Editing in Lab mode mutates a `Uint8Array` occupant map (age is 0 in the initial state). At **rest** the battle persists a *dense* `gridState: number[][]` (RFC-001); the battle repository converts dense ↔ typed-array at the load/save boundary (occupant value `v` maps directly; age resets to 0).
>
> **Grid resize (Decision A — resolved).** The grid is size-parametric. **Edit-mode resize** is limited to the **editable sizes {50×30, 100×60}** (H-9) and mutates `initialGrid` (top-left anchored, persisted, undoable — Decision 6). **Play-mode resize** reallocates the **live grid** only and can expand into the **larger sizes {150×90, 200×120}** that Edit does not offer (top-left anchored, ephemeral; available only while the simulation is **paused** — FR-4.9); Stop / Run→Lab discards it and the view returns to `initialGrid` at its Edit-mode size. Undo holds Edit grids only, so undo memory is ≤180 KB at the 100×60 cap; the live buffer scales to 200×120 during Play (Decision 6 / A.6).

### Decision 5: The simulation hook and the HOT/COOL boundary (the performance-critical rule)

**Decision:** All hot simulation state is encapsulated in a **`useSimulation` hook** that owns the live grid and the RAF loop in **refs**, drives the canvas **imperatively**, and exposes only **throttled, derived** values through `setState`.

This is the one place where "use local component state" is deliberately *not* followed: putting the per-cycle grid in `useState` would re-render React at up to 60 Hz and blow NFR-1.1. Refs give us local encapsulation **without** reactivity.

```tsx
function useSimulation(initialGrid: Grid, organisms: OrganismRuntime[]) {
  const live   = useRef<Grid>()                 // double-buffered typed arrays (RFC-004 §3.4)
  const raf    = useRef<number>()               // RAF handle + tick scheduler (RFC-002 §5)
  const canvas = useRef<GridRenderer>()         // imperative renderer (RFC-002)

  const [status, setStatus]   = useState<'paused' | 'playing'>('paused')
  const [cycle, setCycle]     = useState(0)     // cheap: one int/cycle
  const [population, setPop]  = useState<PopulationStats>([])  // derived: one grid pass at ≤10 Hz publish cadence (M2), off the per-cycle path

  const play  = () => { setStatus('playing'); /* start RAF; loop calls step() + renderer */ }
  const pause = () => { setStatus('paused'); cancelAnimationFrame(raf.current!) }
  const step  = () => { /* one step(): mutate live ref, render, setCycle, maybe setPop */ }
  const stop  = () => { /* discard live ref; view falls back to initialGrid */ }

  // speed (msPerCycle) / status read inside the RAF loop come from refs, not props → live speed change, no loop restart (FR-4.2)
  return { status, cycle, population, play, pause, step, stop }
}
```

**The contract:** grid buffers never enter React state. The loop reads control values (speed, status) from refs; it writes pixels through the renderer; it pushes only `cycle` (one integer) and a **rate-capped** `population` summary into state for the counter and the stat bars (FR-4.5, FR-4.6). Everything else about a running simulation is invisible to React.

> **Speed model & tick/render decoupling (Decision D).** Speed is one canonical scale — **generations/second** (ladder 1 / 2 / 5 / 10 / 20, default 10; max 20). The hook stores `msPerCycle = 1000 / genPerSec` in a ref; the RAF loop renders at the display rate but advances the simulation via a **time accumulator** (one `step()` per `msPerCycle`, ≤1 per frame; frame `delta` clamped to `msPerCycle`, so a suspended tab resumes with at most one step — no fast-forward burst), per RFC-002 §5. Changing speed updates the ref with **no loop restart** (FR-4.2 "adjust without pausing").

`<BattleSimulationPage>` re-renders only on those throttled signals — which is exactly what its UI (cycle counter, population bars, play/pause/speed chrome) needs, and nothing more.

### Decision 6: Undo — a co-located hook in BattlePage, snapshot ring buffer

**Decision:** Undo is a **`useUndoableGrid` hook owned by `<BattlePage>`**, holding a bounded ring of `initialGrid` snapshots in local state. It is **never persisted**.

- **Why BattlePage:** it is the lowest common ancestor of the Lab and Run views and stays mounted across mode switches → undo **survives Lab↔Run** (FR-3.8). When the user returns to the Gallery, `<BattlePage>` unmounts → undo **resets** automatically (FR-3.8). No special lifecycle code needed; component lifetime *is* the undo lifetime.
- **Granularity:** one entry per committed gesture; a click-drag stroke (FR-3.5) is **coalesced into a single entry on pointer-up**.
- **Capacity:** 30 entries (FR-3.8) at **all grid sizes**. Each snapshot stores the occupant map **and its dimensions** (Edit-mode resize changes dimensions — Decision A). Edit is capped at 100×60 (H-9), so a snapshot is ≤6 KB and 30 levels are **≤180 KB** — the former 200×120 / ≤720 KB undo case no longer occurs (150×90/200×120 are Play-only, ephemeral, not in undo). Within budget.
- **Scope:** undo affects only `initialGrid` (placement/erase/Reset/**Edit-mode resize** — Decision A). It does **not** undo organism-library edits, battle rename, or simulation progress in the MVP. Reset (FR-3.7) is itself an undoable entry. Play-mode resize acts on the disposable live grid and is **not** undoable.

```tsx
type GridSnapshot = { occupant: Uint8Array; cols: number; rows: number }   // dims captured — resize-aware (Decision A)
function useUndoableGrid(seed: Grid) {
  const [value, setValue] = useState(seed)
  const past = useRef<GridSnapshot[]>([])               // ≤30, newest last
  const commit = (next: Grid) => {                      // called on gesture commit (paint, erase, Reset, resize)
    past.current = [...past.current.slice(-29), { occupant: value.occupant.slice(), cols: value.width, rows: value.height }]
    setValue(next)
  }
  const undo = () => { const s = past.current.pop(); if (s) setValue(/* rebuild Grid from s.cols/s.rows/s.occupant */) }
  return [{ value, commit }, { undo, canUndo: () => past.current.length > 0 }] as const
}
```

Snapshots are chosen over a command/delta log because a paint stroke or Reset touches many cells and 6 KB/snapshot is cheap. Redo is out of MVP scope (FR-3.8) but the ring leaves room for a `future[]` stack later.

### Decision 7: Dirty-tracking and the navigation guard — two local scopes

**Decision:** Two **independent**, **local** dirty flags feed one navigation guard.

1. **Battle dirty** — local to `<BattlePage>`: set when `initialGrid` or `battleName` differs from the last-saved value; cleared on successful Save (FR-7.8) or fresh load.
2. **Organism Editor dirty** — local to the Organism Editor modal: its own Cancel/Back/Escape *"Discard changes?"* flow (Organism Editor Design). It can be dirty while the battle is clean, and vice-versa, so it is a separate scope.

The guard covers both navigation channels (FR-7.9): in-app navigation (Back to Gallery) checks the flag and confirms; browser close registers `beforeunload` only while dirty.

```tsx
useEffect(() => {
  if (!isDirty) return
  const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
  window.addEventListener('beforeunload', h)
  return () => window.removeEventListener('beforeunload', h)
}, [isDirty])
```

The editor modal (innermost scope) resolves its own guard before the battle-level guard can fire.

> **Auto-save (FR-8.11)** — an Edit-mode, default-disabled toggle — clears the battle dirty flag on a successful write; the auto-save trigger (Edit-mode debounced write, payload, coordination with NFR-1.4) is **deferred to RFC-006**. This RFC owns only the flag.

### Decision 8: Organism-usage index — derived from loaded battles

**Decision:** A **memoized derivation** `Map<organismId, battleId[]>` computed from the loaded battles backs the shared-library rules — not a separately stored structure.

The places that need it (the Organism Library / Editor, for the FR-1.3 warning and FR-1.4 delete check) load the battles list from the battles repository and derive the index:
```tsx
function useOrganismUsage(battles: BattleRepository) {
  const { data = [] } = useAsyncResource(() => battles.list(), [])
  return useMemo(() => buildUsageIndex(data), [data])          // organismId → battleId[]
}
```

- **The index is buildable from `list()` by contract (arch Decision H.4):** `BattleSummary` (RFC-001) carries the battle's `organismIds` — which at rest is **exactly the placed set** (Decision H.1) — alongside id/name/gridSize/updatedAt. `buildUsageIndex` is a flat map over summaries; **no grid is ever deserialized** for the Library/Editor checks (no `listFull()` fallback).
- **"Used/referenced" has one definition — placement (arch Decision H):** an organism is used by a battle iff it has **≥1 cell on that battle's `initialGrid`**. Saved battles satisfy this via `organismIds` (≡ placed, pruned at save with the E.2 remap); the open battle via its live `initialGrid` — the same semantics, two sources. An organism added to the Edit-mode dropdown but **never painted is ephemeral session state owned by this RFC**: it is not persisted, does not survive close/reload, and never triggers the FR-1.3 warning or FR-1.4 block. Erasing an organism's last cell removes it from usage on save (until then, the union below still counts the saved reference).

- **FR-1.3 "used in N Battles":** the **union** count — `usage.get(id)` (saved battles) plus the open `<BattlePage>` `initialGrid` when it references the organism, deduped by battle id (the same union used for FR-1.4/FR-1.7 below) → the edit warning. The open, possibly-unsaved battle counts (PRD FR-3.12), so the warning never under-reports when an organism is edited from an unsaved "Current Battle."
- **FR-1.4 block delete when referenced by ANY battle:** deletion is **blocked** whenever `usage.get(id)` is non-empty **or** the organism appears on the **current `<BattlePage>` `initialGrid`** (the open, possibly-unsaved battle) **or any other organism's rules target the id (rule-reference index below — Decision E.5)**. This is a hard block across the whole workspace, not merely the open grid — so no saved battle or survival rule can be left with a dangling reference (validation-report C-2; arch M7 + Decision E).
- **Rule-reference index (Decision E.5):** a second memoized derivation, over the loaded **organisms** — `targetOrganismId → referencingOrganismId[]`, built by scanning each organism's `organismType` patterns (which store stable library ids per Decision E). It feeds the FR-1.4 delete block above and the FR-1.7 "targeted by [M] organism rule(s)" list. Self-references are excluded (deleting an organism deletes its own rules). Like the battle index, it is derived and memoized — no stored structure.
- **FR-1.7 usage visibility (read-only list):** the same index resolves the saved-battle names — `usage.get(id)?.map(bid => battlesById.get(bid)?.name)` — for the click-through popover behind the "[N] Battle(s)" count (edit warning, delete error, and the editor-footer indicator). The **open `initialGrid`** contributes its own entry when it uses the organism (labeled by the open battle's name, or **"Current Battle (unsaved)"** when it has no saved id yet), computed from the live grid rather than the index. The overall usage set is the **union** of the saved index and the live grid — matching the FR-1.4 block above, which already gates on `usage.get(id)` non-empty **OR** the current `initialGrid`. When the open battle is already saved, its live-grid and index entries are **deduplicated by battle id** to appear once, but the union means an unsaved live erase never drops the still-persisted saved reference (so the delete guard and the "[N]" count stay integrity-safe). Names only; no navigation (the editor may be a modal over an in-progress battle, FR-3.12).
- **FR-7.15 shared-library propagation:** battles reference organisms by id (RFC-001), so an organism edit is reflected everywhere automatically; the index only *informs* the user.

### Decision 9: Settings — loaded from the repository, theme mirrored to a data-attribute

**Decision:** Settings (FR-8) are persisted through a settings repository and loaded by the components that need them via the same `useAsyncResource` pattern. Theme additionally writes the `data-theme` attribute and uses the FOUC inline-script approach already specified in **RFC-003** (this RFC does not duplicate that mechanism).

Most settings are read on the Settings page itself. The few **display preferences read tree-wide** by `PetriDish` (grid-lines, cell-animation toggles — FR-8.7/8.8) are passed down as props from the page that renders the grid. These change rarely and only from the Settings route, so components re-read them on remount; no live cross-tree propagation is required.

> **The one context we would accept:** if threading display preferences to deeply-nested `PetriDish` instances proves to drill too far, a single **read-only `SettingsContext`** loaded once at the App root is the justified exception (theme excluded — handled by RFC-003). This is flagged, not adopted, to keep the MVP minimal.

## Risks & Mitigations

**Risk 1: "Local state" misread as "put the live grid in `useState`," breaking 60 FPS.**
- *Mitigation:* Decision 5 makes it an explicit rule — hot state lives in refs inside `useSimulation`; the grid never enters React state. Only `cycle` (an int) and a rate-capped `population` reach `setState`. Reviewable as a one-line invariant.

**Risk 2: Without a cache, multiple components re-loading the same data (e.g., battles) duplicate work.**
- *Mitigation:* persisted reads are page-scoped and localStorage is sub-10ms (NFR-1.4); a duplicate read is cheap and rare (different routes). If a hotspot appears, lift the load to the nearest common page and pass down — not a global cache. (Connected mode handles dedup via React Query inside the API repository.)

**Risk 3: Lifting `initialGrid` to `<BattlePage>` re-renders it on every edit.**
- *Mitigation:* edits occur at human speed in Lab mode; a re-render per stroke-commit is negligible. The performance-sensitive path (Run mode) keeps the grid in refs, so this lifting never touches the hot loop.

**Risk 4: Prop-drilling repositories/data through pages.**
- *Mitigation:* injection is shallow (App → Page only); within a Battle, organisms load once in `<BattlePage>` and pass to two direct children. No long chains. The one potential exception (display settings → deep `PetriDish`) has the documented `SettingsContext` escape hatch.

**Risk 5: No global store ⇒ cross-cutting concerns have nowhere to live.**
- *Mitigation:* the only cross-view ephemeral state (mode, initial grid, undo, battle dirty) has a natural common ancestor in `<BattlePage>`; persisted state is owned by repositories. No concern is left without an owner.

**Risk 6: Undo memory under larger grids (Conflict A — resolved, Decision A).**
- *Mitigation:* Edit grids are capped at 100×60 (H-9), so snapshots are **≤180 KB** for 30 levels (30 × 6 KB) — within budget; 30 levels kept at all sizes. Snapshots capture dimensions (resize-aware, 50×30 ↔ 100×60). The ring-buffer hook hides the representation, so switching to delta encoding or a smaller cap later is localized.

**Risk 7: State lost on accidental route change or close.**
- *Mitigation:* the navigation guard wraps exits from the battle route (`/battle?id=<uuid>`, Decision K); `beforeunload` covers hard close/refresh while dirty. Undo intentionally does not survive (FR-3.8), but unsaved *battle* data is protected.

## Alternatives Considered

**Alternative 1: Global store (Redux Toolkit / Zustand / Jotai).**
- *Pros:* one place for all state; devtools; ergonomic cross-tree reads.
- *Cons:* introduces a dependency and a parallel state model for state that is either *persisted* (owned by repositories) or *ephemeral and local* (better served by `useState`); risks centralizing things that have a natural component home; encourages putting hot state in a reactive store.
- *Rejected:* the app's state cleanly splits into "persisted," "ephemeral/local," and "hot/refs," each with a simpler dedicated mechanism. A global store would add weight and indirection without solving a problem we have.

**Alternative 2: React Query as the MVP data layer (including localStorage).**
- *Pros:* uniform caching/invalidation across both modes; one data-access pattern.
- *Cons:* its core benefits (network caching, dedup, prefetch/hydration) do not apply to synchronous, sub-10ms localStorage; it would add a provider and a cache the MVP never exercises.
- *Rejected for MVP:* React Query is reserved for the **`ApiBattleRepository`** (Connected mode, post-MVP), added inside that implementation behind the repository interface. The Standalone path reads the repository directly.

**Alternative 3: A repositories React Context.**
- *Pros:* avoids passing repos as props.
- *Cons:* hides dependencies; the injection is only one level deep (App → Page), so a context earns little.
- *Rejected:* props are explicit and testable here; context is reserved for genuine tree-wide propagation, of which there is essentially none (the lone candidate being read-only display settings).

**Alternative 4: Modes as routes (`/battle/:id/edit`, `/battle/:id/run`).**
- *Pros:* deep-linkable mode; conventional.
- *Cons:* a route change implies unmount/navigation, contradicting the UX requirement that the top bar persist and the switch feel like a mode toggle; would also complicate keeping the initial grid and undo alive across the "navigation."
- *Rejected:* conflicts with the Play Mode Proposal's stated principle; mode-as-local-state in `<BattlePage>` gives undo/initial-grid persistence for free.

**Alternative 5: Live simulation grid in React state (no refs).**
- *Pros:* "pure React," everything reactive.
- *Cons:* re-renders at the cycle rate; cannot meet NFR-1.1 at 100×60.
- *Rejected:* the simulation is an imperative, high-frequency loop — refs + a hook are the correct tool.

**Alternative 6: Command/delta-log undo.**
- *Pros:* smaller per-step memory; natural redo.
- *Cons:* needs inverse ops and gesture coalescing; Reset and large strokes are awkward as deltas; unjustified at 6 KB/snapshot.
- *Rejected for MVP:* snapshots are simpler; the ring-buffer hook keeps delta encoding open as a future option.

## Open Questions / Dependencies

- **Conflict A (grid size) — resolved ([Decision A](/docs/planning-artifacts/architecture.md#decision-a--size-parametric-grid-with-per-battle-dimensions-and-runtime-resize)):** size-parametric per-battle dimensions. Edit/persisted sizes = **{50×30, 100×60}** (editable); Play can expand to **{150×90, 200×120}** (ephemeral, paused-only — FR-4.9); top-left anchored (H-9). Undo snapshots capture dimensions; memory bounded at ≤180 KB (100×60 Edit cap).
- **RFC-006 (persistence/workspace schema)** owns the auto-save trigger (Edit-mode debounced; default-disabled toggle, FR-8.11), the localStorage key namespace, and the settings repository shape — this RFC only consumes the dirty flag and the repository interface.
- Should battle **rename** and **organism-list changes** be undoable, or grid-only (current proposal: grid-only for MVP)?
- Confirm the population-stats publish rate (proposed ≤10 Hz) with the UX team against perceived smoothness of the stat bars (FR-4.6).
- Decide whether display preferences reach `PetriDish` by props or via the optional read-only `SettingsContext` (Decision 9).
- Where the **Organism Library/Editor** physically mounts — ✅ **Resolved (arch M5, 2026-06-26, revised 2026-07-08):** both. The Library is an App-level surface, **and** the Organism Editor opens as a **modal over the mounted `<BattlePage>`** (FR-3.12 — dropdown pencil entry, contextual "Back to Battle"), preserving the unsaved grid with no FR-7.9 fire. The data path is identical at either mount point; both receive the organisms **and battles** repositories (usage index — Decision 8).

---

**Status:** Approved (2026-07-13)

**Next Steps (implementation):**
1. Prototype `useSimulation` and verify **zero React re-renders per cycle** (refs + renderer), publishing only throttled `cycle`/`population`.
2. Prototype `useUndoableGrid` in `<BattlePage>`; verify persistence across Lab↔Run and reset on Gallery exit.
3. Validate the direct-repository data flow against the localStorage implementation; confirm the Connected-mode React Query seam stays inside `ApiBattleRepository`.
4. Prototype `resizeGrid` for both Edit (persisted, undoable — editable sizes {50×30, 100×60}) and Play (ephemeral — can expand to {150×90, 200×120}) paths per Decision A; verify top-left anchor, hard-edge expansion, and undo memory bounds (≤180 KB at the 100×60 Edit cap); align dirty/auto-save handoff with RFC-006.
