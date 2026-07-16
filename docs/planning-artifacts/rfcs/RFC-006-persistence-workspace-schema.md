# RFC-006: Persistence, Workspace Schema, Migration & Quota

**Status:** Approved
**Date:** 2026-06-22
**Approved:** 2026-07-13
**Author:** Architecture Team

## Summary

This RFC defines the **persistence and portability layer** for Game of Life Studio: the on-disk shape of a workspace, the **versioned export/import envelope** used for sharing and backup, the **migration** pipeline that keeps both at-rest and exported data forward-compatible, the **auto-save** behaviour, and the **localStorage quota** strategy. It is the schema-of-record that RFC-001 (repository pattern) and RFC-005 (runtime state) both defer to.

The guiding decisions:

1. **`Workspace` is a domain aggregate, not a repository.** It is the consistency boundary that owns referential integrity between battles and the shared organism library, and it groups the device-local settings. Repositories (RFC-001) persist its *parts*; they do not own portability. Settings never enter the portable envelope (Decision 6).
2. **Serialization is a layer of its own — not methods on the repositories.** A `WorkspaceSerializer` reads through the existing repository interfaces to assemble a portable envelope, and writes an imported envelope back through them. Export/import is cross-entity, transactional, and versioned; none of that belongs inside a single CRUD repository.
3. **One envelope schema for everything.** A single versioned `WorkspaceExport` schema serves both the full-workspace export (FR-8.3, Settings) and the single-battle export (FR-6.1/7.13). A battle export is simply that schema **filtered to one battle plus the organisms it references** — never a second format.
4. **One migration registry, two entry points.** The same `formatVersion` + migration chain is applied both when loading at-rest data from localStorage *and* when importing a file. Write a migration once; it protects both boundaries (resolving RFC-001's schema-drift risk and NFR-7.3's corruption handling).
5. **Import is atomic.** Parse → migrate → validate → integrity-check the *whole* envelope before any write; snapshot the current workspace; replace; roll back on any failure. A single unified **Import** action (FR-8.4, Settings) accepts both workspace and single-battle files; "Replace entire workspace" is all-or-nothing in both cases.
6. **Format now, connected-apply later.** The envelope and client-side export/import are MVP and **mode-agnostic** — they read/write through whichever `AppRepositories` is injected. Connected-mode *import application* (conflict/merge/ownership/bulk-write) is the only deferred piece, flagged post-MVP. No server bulk endpoints are added now.

## Links

- [Main Architecture Document](/docs/planning-artifacts/architecture.md)
- [Product Requirements Document](/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md) — FR-6 (Battle Export; single-Battle import unified under FR-8.4), FR-7.13/7.15 (single-Battle export prompt, shared library; FR-7.11/7.12/7.14 tombstoned → export/import moved to Settings), FR-8.2–8.5 (workspace stats, workspace export, unified Import, clear), FR-8.11 (Edit-mode auto-save toggle, default Disabled), NFR-1.4 (<10ms write p95), NFR-6.1 (offline/static), NFR-7.1–7.3 (localStorage persistence, capacity, corruption), OQ-2 (quota), A-2 (export initial state only)
- [RFC-001: Multi-Mode Architecture](/docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md) — Repository pattern (async interfaces), `Battle`/`Organism` entities, Zod schemas, build-time mode selection. *This RFC renames its `WorkspaceRepository` → `SettingsRepository` and references organisms by id.*
- [RFC-004: Rules Engine & Simulation](/docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md) — rule shape & version field; the `Grid` typed-array representation
- [RFC-005: Application State, Modes & Undo](/docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md) — owns the dirty flag and the working `initialGrid`; defers auto-save cadence, the localStorage key namespace, and the settings repository shape to this RFC
- Missing Technical Specs — gap #6 (workspace envelope & migration), gap #7 (quota), gap #8 (auto-save). *(Internal working notes kept outside this repository; referenced by gap number only — no machine-specific path.)*

## Overview

### Purpose & Goals

**Primary Purpose:**
Give the workspace a single authoritative on-disk and on-wire shape, with a versioning and migration story that lets the data format evolve without breaking existing saved workspaces or previously exported files.

**Goals:**
1. **One schema of record** for at-rest storage and for export/import — no divergence (RFC-001 Risk 2).
2. **Portability with integrity:** an exported file is self-contained and referentially closed (every organism a battle references travels with it).
3. **Forward compatibility:** older files and older at-rest data migrate cleanly; files from a *newer* app are rejected with a clear message rather than silently corrupting state.
4. **Atomicity & safety:** import and clear are all-or-nothing; a failed write never leaves a half-replaced workspace.
5. **Mode-agnostic by construction:** the same code path serves Standalone and (later) Connected, because it operates on the repository interface, not on a storage mechanism.
6. **Quota-aware:** monitor usage, fail writes gracefully, and keep an IndexedDB escape hatch open (NFR-7.2/7.3, OQ-2).

### Background

Three PRD surfaces currently have no technical owner (missing-specs gaps #6–#8):

- **Export/import** is a major feature (FR-6.1/7.13 export, FR-8.3–8.5 workspace export / unified Import / clear) but no top-level schema, version field semantics, or migration pipeline is defined. RFC-004 versions *rules*; RFC-001 defines *Battle*/*Organism* shapes — nothing defines the **workspace envelope** that wraps them.
- **localStorage quota** (NFR-7.3, OQ-2, RFC-001 Risk 4) is explicitly flagged in the PRD as "should be addressed in an RFC."
- **Auto-save** (FR-8.11) touches the repository layer and NFR-1.4, and interacts awkwardly with A-2 (only the initial state is persisted) — an ambiguity this RFC resolves.

RFC-005 already draws the boundary: it owns the *working copy* (`initialGrid`) and the *dirty flag*, and consumes the repository interface — but it explicitly hands persistence shape, key namespace, auto-save cadence, and the settings repository to this RFC.

### The layering (the core idea)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Workspace (domain AGGREGATE)         consistency boundary / referential       │
│    • battles[]   (reference organisms by id)                                   │
│    • organismLibrary[]   (workspace-level, shared — FR-7.15)                   │
│    • settings    (device-local — never enters the envelope; Decision 6)         │
├──────────────────────────────────────────────────────────────────────────────┤
│  WorkspaceSerializer (PORTABILITY)    assemble ⇄ envelope; migrate; validate;   │
│    exportWorkspace() / exportBattle(id) / importWorkspace(file)                 │
│                       reads & writes ONLY through the repository interfaces     │
├──────────────────────────────────────────────────────────────────────────────┤
│  AppRepositories (PERSISTENCE — RFC-001)   { battles, organisms, settings }     │
│    LocalStorage* (MVP)  |  Api* (post-MVP)   — CRUD only, format-agnostic       │
└──────────────────────────────────────────────────────────────────────────────┘
        ▲                                            ▲
   one schema + one migration registry applied at BOTH the disk-load boundary
   (repository) and the file-import boundary (serializer)
```

The aggregate is the in-memory consistency boundary; repositories persist its parts; the serializer is the only thing that knows about the portable file format. Crucially, **export/import never appears as a method on a repository** — that would scatter a transactional, versioned, cross-entity operation across three independent CRUD objects and leave `formatVersion` ownership ambiguous.

## High Level Design Proposal

### Decision 1: `Workspace` aggregate vs. repositories — distinct responsibilities

**Decision:** Model `Workspace` as a domain aggregate distinct from `AppRepositories`. The aggregate is the consistency boundary (it owns the rule that a battle may only reference organisms present in the library); the repositories are persistence ports.

```ts
// Domain aggregate — the consistency boundary, not a persistence interface.
interface Workspace {
  battles: Battle[]          // each references organisms by id (see RFC-001, revised)
  organismLibrary: Organism[]   // workspace-level shared library (FR-7.15)
  settings: Settings         // device-local preferences — part of the aggregate, NEVER part of the export envelope (Decision 6)
}

// Persistence ports (RFC-001), unchanged in shape, renamed for clarity:
interface AppRepositories {
  battles:   BattleRepository
  organisms: OrganismRepository
  settings:  SettingsRepository   // ← was "WorkspaceRepository" in RFC-001
}
```

**Rationale:** "Workspace" should name the *whole* thing, not the settings blob. RFC-001's `LocalStorageWorkspaceRepository` actually stores settings; this RFC renames it `SettingsRepository` and reclaims "Workspace" for the aggregate and the export envelope. RFC-005 already uses `repositories.settings`, so this aligns the three documents.

> **Referential integrity (FR-1.3/1.4/1.7/7.15):** because battles reference organisms **by id**, the shared library "just works" — an organism edit propagates to every battle automatically. The aggregate invariant "a battle may only reference organisms present in the library" is **enforced on delete**: removing an organism referenced by any battle, the open grid, **or another organism's rules** (`organismType` patterns store library ids — arch Decision E) is **rejected** (FR-1.4, validation-report C-2 / arch M7 + Decision E.5), so a stored dangling reference is unreachable through normal use — import remains the only path that must *defensively* tolerate an unknown id (handled by graceful fallback, NFR-7.3). The cost is that **export must compute the referenced-organism closure** (Decision 4) so a shared file is self-contained. RFC-005 Decision 8 derives the inverse `organismId → battleId[]` index, reused for the FR-1.3 warning, the FR-1.4 delete block, and the FR-1.7 read-only battle-name list; this RFC consumes the same id-reference model.

### Decision 2: One versioned envelope; battle export is a filtered subset

**Decision:** A single Zod-validated `WorkspaceExport` envelope is the schema of record for every export. The single-battle export uses the **same** schema, filtered to one battle plus the organisms it references.

```ts
import { z } from 'zod'

export const CURRENT_FORMAT_VERSION = 1 as const

// Sparse initial-grid representation: only placed cells travel (grids are mostly empty).
// FR-6.3: "Cell positions and organism assignments." Dense 100×60 matrices are avoided.
const PlacedCellSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  organismId: z.string(),
})

const BattleExportSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(100),
  gridDimensions: EditableGridPresetSchema,         // {50×30, 100×60} only — persisted grids are Edit-mode (H-9), schema-enforced (arch Decision G.1); reuses RFC-001's single-sourced preset schema. A future preset = formatVersion bump + migration.
  cells: z.array(PlacedCellSchema),                 // initial (Edit-mode) state only — A-2
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((b, ctx) => {
  // Architecture invariants enforced at the import boundary (arch Decision G.2/G.3):
  if (b.cells.some(c => c.x >= b.gridDimensions.cols || c.y >= b.gridDimensions.rows))
    ctx.addIssue({ code: 'custom', message: 'cell out of grid bounds' })            // sparse→dense must never write out of bounds
  if (new Set(b.cells.map(c => `${c.x},${c.y}`)).size !== b.cells.length)
    ctx.addIssue({ code: 'custom', message: 'duplicate cell coordinates' })         // hand-edited/corrupt file, not last-wins
  if (new Set(b.cells.map(c => c.organismId)).size > 255)
    ctx.addIssue({ code: 'custom', message: 'more than 255 organisms in one battle' }) // dense-encoding / Uint8 occupant cap (G.3)
})

export const WorkspaceExportSchema = z.object({
  // ── metadata (FR-6.3) ──
  formatVersion: z.literal(CURRENT_FORMAT_VERSION), // drives migration; see Decision 3
  appVersion: z.string(),                           // provenance only, never branched on
  exportedAt: z.string().datetime(),
  kind: z.enum(['workspace', 'battle']),            // UI hint for the import warning (FR-7.13 export / FR-8.4 import)
  // ── payload ──
  organisms: z.array(OrganismSchema),               // the referenced subset (battle) or whole library (workspace)
  battles: z.array(BattleExportSchema),
  // NO settings field — settings are device-local and never travel in any export (Decision 6 / arch Decision F)
})

export type WorkspaceExport = z.infer<typeof WorkspaceExportSchema>
```

**Rationale:**
- **No second format.** FR-7.13 explicitly frames the single-battle export as a subset of the workspace export; one schema means one validator, one migration chain, one set of tests.
- **`formatVersion` vs `appVersion` are distinct.** `formatVersion` is the only field migration logic branches on; `appVersion` is human/provenance metadata. Conflating them is a common source of brittle migrations.
- **Sparse cells** keep a 100×60 battle *file* to the kilobytes of *placed* cells rather than 6,000 entries — small, size-independent share/download artifacts. (Sparse is **wire-only** and does not enter the localStorage quota budget; that is governed by the dense at-rest shape, with the arithmetic in Decision 7.)
- **At rest, the battle is stored DENSE** (`gridState: number[][]`, RFC-001 — per the team's storage decision); the serializer converts **dense → sparse `cells` on export** and **sparse → dense on import**. The wire/export format is always sparse; only the localStorage shape is dense. *(Dense at rest is heavier than sparse but within NFR-7.2; the FR-8.2 meter surfaces usage.)*

### Decision 3: One migration registry, applied at two boundaries

**Decision:** Migrations are a single ordered registry keyed by `formatVersion`. The same `migrate()` runs in two places: when the repository **loads at-rest data** from localStorage, and when the serializer **imports a file**. Unknown *higher* versions are rejected; missing/invalid versions are treated as corrupt.

```ts
type Migration = (data: any) => any            // vN  → vN+1
const MIGRATIONS: Record<number, Migration> = {
  // 1: (v1) => ({ ...v1, formatVersion: 2, /* … */ }),   // added as the format evolves
}

function migrate(raw: unknown): unknown {
  const v = (raw as any)?.formatVersion
  if (typeof v !== 'number') throw new ImportError('corrupt')            // NFR-7.3
  if (v > CURRENT_FORMAT_VERSION) throw new ImportError('newer-version') // exported by a newer app
  let data: any = raw
  for (let from = v; from < CURRENT_FORMAT_VERSION; from++) data = MIGRATIONS[from](data)
  return data
}
```

**Rationale:** RFC-001 Risk 2 (schema drift) and NFR-7.3 (validate on load, handle corruption gracefully) are the *same problem* as importing an old file. Defining migrations once and applying them at both boundaries removes the drift risk by construction and means corrupt/old at-rest data is upgraded or rejected on load with the same code that guards import. The at-rest store carries a `gol:schema` record holding its `formatVersion` so the repository knows whether a load needs migration.

> **This chain is the ONLY migration pipeline (arch Decision I).** `formatVersion` is the only version anything branches on. A rule-schema change (RFC-004) or a **destructive** palette-token change (RFC-007 removal/rename) bumps `formatVersion` and lands as a step here; each step is one atomic function performing its rewrites internally in the order *structure → rules → palette tokens*. `organism.schemaVersion` and `PALETTE_VERSION` are write-time stamps updated by those steps and **asserted** at load — never independently branched on, and there is no second pipeline at organism load.
>
> **Palette tokens (RFC-007).** Organisms carry a `colorToken` (RFC-007), so a battle/workspace file is self-contained *given a compatible palette*. **Additive** palette changes need no migration; an **unknown token** in a same-format file (e.g. hand-edited) degrades gracefully on import — fall back to a default token and warn (NFR-7.3) — rather than failing the whole import; files from a newer app are already rejected by `formatVersion > CURRENT`.

### Decision 4: Export — assemble through repositories, close the organism reference set

**Decision:** `WorkspaceSerializer` exposes `exportWorkspace()` and `exportBattle(id)`. Both read through the repository interfaces and emit the envelope. `exportBattle` computes the **referenced-organism closure** so the file is self-contained.

```ts
class WorkspaceSerializer {
  constructor(private repos: AppRepositories) {}

  async exportWorkspace(): Promise<WorkspaceExport> {
    const [battles, organisms] = await Promise.all([
      this.repos.battles.listFull(), this.repos.organisms.list(),
    ])
    return this.envelope('workspace', battles, organisms)   // battles + organisms only — settings never travel (Decision 6)
  }

  async exportBattle(id: string): Promise<WorkspaceExport> {
    const battle = await this.repos.battles.load(id)
    if (!battle) throw new ExportError('not-found')
    // At rest the grid is DENSE (battle.gridState: number[][]; 0 = empty, v = index+1 into organismIds).
    // Closure (arch Decision E.5): organisms placed in the battle ∪ organisms their rules target via
    // `organismType` patterns (stable library ids — Decision E), followed TRANSITIVELY, so the file
    // is self-contained and an import can never create a dangling rule-target id.
    const all = await this.repos.organisms.list()
    const referencedIds = ruleAwareClosure(new Set(battle.organismIds), all)   // placement ∪ rule targets, transitive — organismIds ≡ the placed set at rest (arch Decision H.1), so the seed is exactly the placed organisms
    const organisms = all.filter(o => referencedIds.has(o.id))
    return this.envelope('battle', [battle], organisms)    // envelope() runs gridState → sparse cells
  }
}
```

**Rationale:** Export is a *read-and-assemble* operation, identical in both deployment modes because it only uses `list`/`load`. The closure computation is the price of the shared-library model (Decision 1) and is what makes a battle file importable on a fresh workspace. The closure is **rule-aware and transitive** (arch Decision E.5): an organism whose rules target another organism pulls the target in too — a small graph walk over at most the library size — matching the FR-1.4 delete block, which treats rule references as first-class references.

### Decision 5: Import — atomic, validated, with rollback

**Decision:** `importWorkspace(file)` follows a strict order and is all-or-nothing. It validates the *entire* envelope before touching storage, snapshots the current workspace, replaces it, and rolls back on any write failure (FR-8.4: "replace entire workspace" — the unified Import handles both workspace and single-battle files).

```ts
async importWorkspace(fileText: string): Promise<void> {
  let parsed: unknown
  try { parsed = JSON.parse(fileText) }
  catch { throw new ImportError('not-json') }                 // → "This file isn't a valid workspace."

  const migrated  = migrate(parsed)                            // Decision 3 (may throw newer-version/corrupt)
  const envelope  = WorkspaceExportSchema.parse(migrated)      // Zod structural validation (FR-8.4) — incl. H-9 grid presets, cell bounds, duplicate cells, ≤255 organisms/battle (arch Decision G)
  assertReferentialClosure(envelope)                           // every cell.organismId AND every rule `organismType` target id ∈ organisms[] (Decision E.5)

  const rollback = await this.snapshotCurrent()                // capture for failure recovery
  try {
    await this.repos.clearAll()                                // DATA-ONLY: battles + organisms — never touches gol:settings (Decision 6)
    await this.repos.organisms.replaceAll(envelope.organisms)
    await this.repos.battles.replaceAll(envelope.battles.map(fromExportBattle))   // sparse cells → dense gridState (Decision 2) + rebuilds organismIds from the cells — lossless because the roster ≡ the placed set (arch Decision H.1); the envelope needs no roster field
    await this.ensureDefaultOrganism()                         // FR-1.5/M9: re-add Conway's Classic if the imported envelope lacks it
  } catch (e) {
    await this.restore(rollback)                               // half-replaced state never persists
    throw new ImportError('write-failed', { cause: e })
  }
}
```

**Rationale:** Validation-before-write plus a rollback snapshot is what makes the strong PRD warnings safe to honour: the user is told "this replaces everything," and the implementation guarantees it replaces everything *or nothing*. Referential-closure assertion catches truncated/hand-edited files that would otherwise import battles pointing at missing organisms.

> **Destructive-replace is intentional for MVP, guarded by a mandatory warning + export-first (FR-8.4, validation-report C-3 / H-7 / arch M8).** Import is a **replace, not a merge** — true even for a single-battle file. "Replaces the entire workspace" means **all battles and organisms**; the importer's **settings are never touched** — no envelope carries settings and `clearAll()` is data-only (Decision 6 / arch Decision F). The confirmation always warns that the current workspace will be lost and offers **Export Current Workspace First** (runs `exportWorkspace()` before proceeding); the envelope's `kind` field (`'workspace' | 'battle'`) lets the warning name what is being imported. This resolves the UJ-vs-FR-8.4 contradiction by *owning* the destructiveness rather than promising a non-destructive single-battle import. A **non-destructive add/merge import** and **multiple side-by-side workspaces** are **deferred** (PRD Non-Goals); when introduced they land here as a `mergeWorkspace` / multi-workspace variant alongside — not replacing — this atomic-replace path, and dovetail with the connected-mode import-application already deferred in Decision 9.

### Decision 6: Settings are device-local — they never travel in *any* export, and import can never touch them *(revised 2026-07-09 — arch Decision F)*

**Decision:** The envelope carries **no settings field at all** — neither for battle nor for workspace exports. Settings live only in `gol:settings` on the device. Correspondingly, `clearAll()` is **data-only** (battles + organisms); the import path (Decision 5) therefore cannot affect settings *by construction*, and **Clear All Data** (FR-8.5) preserves them too (product-confirmed 2026-07-09).

**Rationale:**
- **The adversarial review (finding #2) caught this Decision contradicting Decision 5 as previously written:** a battle envelope omitted `settings`, but import ran a `clearAll()` that wiped `gol:settings` and then had nothing to restore — importing a friend's battle destroyed the importer's theme, grid-lines, and default-speed preferences, the exact outcome this Decision promised to prevent. Removing settings from the format *and* scoping `clearAll()` to data closes the hole structurally rather than with a snapshot-and-restore patch.
- **The PRD never asked for settings in a file.** FR-8.3 defines workspace export as "the complete workspace (**all battles and organisms**)" and FR-8.5 defines Clear All as "delete **all battles and organisms**" — the earlier settings-in-workspace-export behaviour was an RFC-level addition, now dropped. No PRD change is needed.
- **Settings are preferences of the person/device, not workspace data.** Theme or grid-line choices are how *this user* likes to view any workspace; a backup restored onto a new machine should bring the data, while the viewer keeps their own preferences (they are trivially re-pickable in Settings).

### Decision 7: localStorage key namespace, quota monitoring & graceful failure

**Decision:** A flat, prefixed key namespace; size monitoring surfaced in Settings; quota-exceeded handled without data loss; IndexedDB kept as a documented escape hatch.

```
gol:schema       → { formatVersion }                  // drives at-rest migration (Decision 3)
gol:battles      → Record<id, BattleRecord>           // one key, whole collection
gol:organisms    → Record<id, OrganismRecord>         // the shared library
gol:settings     → SettingsRecord                     // device-local; excluded from clearAll() and from every export (Decision 6)
```

- **Monitoring (FR-8.2):** report usage via `navigator.storage.estimate()` where available, falling back to summing serialized lengths. **The quota budget is governed by the DENSE at-rest shape** (Decision 2 / Cross-RFC Reconciliation #3 — sparse is wire-only, so export-file sizes are irrelevant here). The arithmetic *(corrected 2026-07-09 — adversarial finding #12)*: a dense 100×60 `gridState` serializes to ~12 KB of JSON when mostly empty ("0," per cell) and ~24 KB at the pathological all-3-digit worst; a 50×30 grid ≤ ~6 KB. NFR-7.2's soft target — **50 battles × ≤24 KB ≈ 1.2 MB worst case, plus ~200 organisms × ~2 KB of rules JSON ≈ 0.4 MB ≈ 1.6 MB total** — is about a third of even the most conservative 5 MB per-origin quota (browsers commonly meter localStorage in UTF-16 code units; our character counts approximate those units, so the headroom holds under the strictest reading). The meter is therefore informational — and since organism count is **not hard-capped** (colours reusable — RFC-007 Decision 3 / arch M6), the graceful **quota-exceeded** path below remains the real backstop.
- **Quota-exceeded (NFR-7.3, OQ-2, RFC-001 Risk 4):** writes catch `QuotaExceededError` and surface a non-destructive message ("Storage full — export and remove a battle to free space"). A write is **never** allowed to truncate an existing good value: serialize to a candidate string first, then `setItem`; if it throws, the previous value is left intact and the operation reported as failed (it also fails the dirty-flag clear, so the user keeps their unsaved indicator).
- **IndexedDB escape hatch:** RFC-001 already lists it as the migration path. It stays **post-MVP**; the repository interface is async precisely so this swap requires no UI change.
- **First-run, Clear-All & post-Import seeding (M1 / M9, FR-1.5 / FR-8.5 / FR-8.4):** when no `gol:schema` record exists (fresh install) or after **Clear All Data**, the store is seeded with `DEFAULT_WORKSPACE` — **zero battles** + the pre-loaded **"Conway's Classic"** organism. Neither seeding path touches `gol:settings`: `clearAll()` is data-only (Decision 6), so settings survive Clear All; on a genuinely fresh install the settings record is simply absent and loads fall back to defaults. Defined as a domain constant, applied through the repositories. The same **`ensureDefaultOrganism()`** helper runs **after a successful Import** (Decision 5) so Conway's Classic is re-added when an imported envelope (e.g. a single-Battle export) lacks it — keeping the FR-1.5 "always present" invariant true. Conway's Classic is also **non-deletable** (FR-1.4, a library rule, not a persistence concern). The store deliberately does **not** self-heal an out-of-band manual edit that removes the default on a plain at-rest load — that tamper case is out of scope (validation H-A / arch M9).

### Decision 8: Auto-save — debounced persistence of editable state (FR-8.11 vs A-2 — confirmed in PRD 2026-06-26)

**Decision:** Auto-save persists the battle's **editable state** (name + initial grid + organism references), debounced after Edit-mode mutations, clearing the RFC-005 dirty flag on success and respecting NFR-1.4 (<10 ms write p95). It is gated by an **Enabled/Disabled toggle, default Disabled** (FR-8.11). The "every N generations during simulation" framing was dropped from FR-8.11 — auto-save **never runs during Play Mode simulation**. *(Confirmed in the PRD on 2026-06-26: FR-8.11 reframed from a frequency dropdown to this Edit-mode toggle; this Decision is no longer provisional.)*

**Rationale:** A-2 fixes that only the *initial* (Edit-mode) state is ever saved/exported; a running simulation produces no new persistable grid data, so "auto-save every N generations" would save an unchanged initial grid repeatedly. The useful behaviour is a **default-off, debounced auto-save of edits** (and an optional save on Run-start), which prevents data loss without contradicting A-2 — now the confirmed PRD position.

### Decision 9: Standalone now, connected-apply later (scoping)

**Decision:** Per the agreed scope, the envelope and client export/import ship in MVP and are mode-agnostic; connected-mode *import application* is deferred behind a flag. No server bulk endpoints are built now.

| Concern | MVP? | Notes |
|---|---|---|
| `WorkspaceExport` envelope (schema + version + migration) | **Yes** | One schema serves both modes forever |
| Client **export** (download file) | **Yes** | Pure client; reads through whatever repo is injected |
| Client **import** into localStorage | **Yes** | Atomic replace (Decision 5) |
| Quota monitoring & graceful failure | **Yes** | Decision 7 |
| Auto-save of editable state | **Yes** | Decision 8 |
| Import **application against an API** (ID collisions, merge vs. replace, ownership, bulk-write atomicity, server re-validation) | **No — flagged** | Connected-mode only; the *format* is unchanged, only *application* is hard |

**Rationale:** Because export/import operates on the repository interface, the format and client flow are free in both modes. The genuinely hard problems are import-*application* semantics against a live multi-user server — isolated to exactly one future surface, kept off the MVP critical path, and made explicit rather than left ambiguous (missing-specs gap #15).

## Risks & Mitigations

**Risk 1: A battle file imports with dangling organism references.**
- *Mitigation:* `exportBattle` computes the referenced-organism closure — placement **and** rule targets, transitively (Decision 4; arch Decision E.5); import asserts referential closure over both before writing (Decision 5). A truncated or hand-edited file is rejected, not half-imported.

**Risk 2: Schema drift between at-rest and exported data (RFC-001 Risk 2).**
- *Mitigation:* one envelope schema and one migration registry applied at both boundaries (Decision 3). The formats cannot diverge because there is only one.

**Risk 3: A partially-written import corrupts the workspace.**
- *Mitigation:* validate-then-write with a rollback snapshot (Decision 5); candidate-string-then-`setItem` so a quota failure never truncates an existing value (Decision 7).

**Risk 4: Importing a shared file silently overwrites the user's settings/theme.**
- *Mitigation:* no export contains settings and the import path's `clearAll()` is data-only, so `gol:settings` is unreachable from import by construction (Decision 6 / arch Decision F). RFC-008's serializer round-trip tests pin this (import preserves device settings).

**Risk 5: A file from a newer app version is imported and misread.**
- *Mitigation:* `migrate()` rejects `formatVersion > CURRENT` with a clear "exported by a newer version" message (Decision 3) rather than best-effort parsing.

**Risk 6: localStorage fills up mid-session (NFR-7.3 / OQ-2).**
- *Mitigation:* size meter in Settings (FR-8.2), non-destructive `QuotaExceededError` handling, export-and-remove guidance, IndexedDB escape hatch reserved (Decision 7).

**Risk 7: Auto-save thrashing the write path and missing NFR-1.4.**
- *Mitigation:* debounced, edit-triggered, single-key collection writes; the running simulation is *not* auto-saved (Decision 8).

## Alternatives Considered

**Alternative 1: `export()`/`import()` methods on each repository (the original proposal).**
- *Pros:* each repository "owns" its own shape; conceptually tidy per entity.
- *Cons:* scatters a transactional, versioned, cross-entity operation across three independent CRUD objects; leaves `formatVersion` ownership ambiguous; gives no natural home for atomic replace or the cross-repo referential closure.
- *Rejected:* a dedicated serializer that reads/writes *through* the repositories keeps repositories as pure persistence ports and puts versioning, validation, migration, and atomicity in one place. (Per-entity `toExport()`/`fromExport()` helpers are still fine as delegation.)

**Alternative 2: Two separate formats for battle-export vs. workspace-export.**
- *Pros:* each could be minimal for its case.
- *Cons:* two schemas, two validators, two migration chains, two test suites that drift; contradicts FR-7.13's "battle is a subset" framing.
- *Rejected:* one schema with a `kind` hint and a filtered payload is strictly simpler and matches the PRD.

**Alternative 3: Dense `number[][]` grid in the export (as RFC-001 sketched).**
- *Pros:* trivially mirrors the in-memory occupant map.
- *Cons:* 6,000 numbers per battle even when nearly empty; bloats files and the quota budget; couples the file to a fixed grid size.
- *Rejected:* a sparse `{x,y,organismId}[]` cell list is compact and matches FR-6.3 ("cell positions and organism assignments"); `gridDimensions` is carried separately for future-compat.

**Alternative 4: Build connected-mode bulk export/import endpoints now.**
- *Pros:* feature parity across modes immediately.
- *Cons:* requires auth, sync/conflict strategy, and bulk-write transactionality that RFC-001 has not specified; large MVP cost for a post-MVP mode.
- *Rejected:* format-now/apply-later isolates the hard part to one future surface without changing the schema (Decision 9).

**Alternative 5: Separate version fields per entity (battle version, organism version, rules version) with no envelope version.**
- *Pros:* fine-grained.
- *Cons:* no single coordinating version to branch migrations on; the import path would need to reconcile N independent version axes.
- *Rejected:* a single envelope `formatVersion` coordinates migration; RFC-004's rule-level version remains *inside* the organism payload and is migrated as part of the envelope step that touches organisms. *(This rejection is now normative — arch Decision I: RFC-004's former load-time rule-migration pipeline is retired; `schemaVersion` is stamped by the chain and asserted at load.)*

## Open Questions / Dependencies

- **FR-8.11 vs A-2 (auto-save semantics)** — ✅ **Resolved (PRD 2026-06-26).** FR-8.11 is now an Edit-mode, default-Disabled Auto-Save toggle; "every N generations during simulation" is dropped. Decision 8 (edit-triggered debounced auto-save) is confirmed.
- **Conflict A (grid size) — resolved ([Decision A](/docs/planning-artifacts/architecture.md#decision-a--size-parametric-grid-with-per-battle-dimensions-and-runtime-resize)):** size-parametric per-battle dimensions (FR-8.10 presets). `gridDimensions` already travels in the envelope and the Battle entity now carries `gridSize` (RFC-001), so import recreates the correct size. Sparse cells keep files size-independent; **only the initial (Edit-mode) grid is persisted** — and Edit is capped at 100×60 (H-9), so persisted grids never exceed 100×60; runtime Play-mode expansion to 150×90/200×120 is ephemeral, never saved (A-2). Even the former 200×120 fit comfortably in the 5–10 MB quota, so 100×60 is well within budget.
- **Settings shape:** the concrete `SettingsSchema` (theme, grid-lines, cell-animation, scan speed, default grid size, auto-save toggle, default speed — FR-8.6–8.12) should be finalized here or in a small companion; this RFC fixes only that it is one **device-local** record under `gol:settings` that never travels in any export (Decision 6 / arch Decision F).
- **`clearAll` / `replaceAll` repository methods:** this RFC assumes the repositories expose bulk `replaceAll` and a workspace-wide `clearAll` (FR-8.5). These extend RFC-001's interface (which currently lists only per-item CRUD) and should be added there.
- **Connected-mode import application** (Decision 9, deferred): when Connected mode is built, decide replace-vs-merge, ID remapping, ownership, and bulk-write atomicity. Out of scope here.
- **Thumbnail/tile snapshot (FR-7.2) — resolved (architecture M4):** rendered **on demand** from the battle's `initialGrid` via the Canvas renderer (RFC-002 `renderStatic`), **not stored** — zero quota cost and never stale.

---

**Status:** Approved (2026-07-13)

**Next Steps (implementation):**
1. Finalize `WorkspaceExportSchema` and `SettingsSchema`; lock `CURRENT_FORMAT_VERSION = 1`.
2. Prototype `WorkspaceSerializer.exportBattle` closure + `importWorkspace` atomic replace with rollback; test a truncated/newer-version/corrupt file.
3. Implement the quota meter (FR-8.2) and `QuotaExceededError` handling; verify candidate-string-then-`setItem` never truncates.
4. Wire the default-disabled Edit-mode auto-save toggle (FR-8.11, PRD 2026-06-26) to clear the RFC-005 dirty flag within NFR-1.4.
