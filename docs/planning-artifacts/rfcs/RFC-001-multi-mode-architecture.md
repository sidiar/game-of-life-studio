# RFC-001: Multi-Mode Architecture with Decoupled Storage Solution

**Status:** Approved
**Date:** 2026-06-05
**Approved:** 2026-07-10
**Author:** Architecture Team

## Summary

This RFC proposes a dual-mode architecture for Game of Life Studio that supports both Standalone (offline, localStorage-based) and Connected (API-backed, database-persistent) deployment modes from a single codebase. The architecture uses a Repository Pattern with dependency injection to completely decouple the persistence layer from the UI/business logic, enabling seamless switching between deployment modes at build time.

## Links

- [Main Architecture Document](/docs/planning-artifacts/architecture.md)
- [Product Requirements Document](/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md)
- [UX Design Specification](/docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/ux-design-complete.md)

## Overview

### Purpose & Goals

**Primary Purpose:**
Design an architecture that supports two distinct deployment modes without duplicating UI/business logic code, enabling both zero-cost static hosting (MVP) and scalable cloud deployment (future) from the same codebase.

**Goals:**
1. **Single Codebase:** Maintain one source of truth for all UI components and business logic
2. **Clean Abstraction:** Completely decouple persistence from presentation and domain logic
3. **Progressive Enhancement:** Start with standalone MVP, seamlessly add connected features later
4. **Type Safety:** Maintain full TypeScript type safety across all layers
5. **Testability:** Enable easy unit testing by mocking repository interfaces
6. **Performance:** No runtime overhead from abstraction in hot paths (simulation engine)

### Background

The Game of Life Studio project has two conflicting requirements:

1. **NFR-6.1:** The system must function completely offline with zero backend dependencies (static export, localStorage persistence)
2. **Future Vision:** Support user accounts, cloud sync, and collaboration features

Traditional web architectures tightly couple the frontend to either localStorage OR an API backend. This creates a dilemma:
- Building for localStorage first makes adding an API later difficult
- Building API-first requires infrastructure costs for the MVP
- Maintaining two separate codebases doubles development effort

The solution is a properly abstracted architecture where the persistence mechanism is injected at build time, allowing the same UI code to work with different storage backends.

### High Level Design Proposal

#### 1. Persistence Abstraction Pattern

**Decision:** Repository Pattern with async interfaces and dependency injection

**Implementation:**
```typescript
// Domain entities (pure business objects)
interface Battle {
  id: string
  name: string
  organismIds: string[]   // references into the workspace-shared Organism Library (FR-7.15) — NOT embedded copies. INVARIANT (arch Decision H.1): exactly the PLACED set — every entry has ≥1 cell in gridState; pruned at save (with the E.2 gridState remap). An organism added to the Edit-mode dropdown but never painted is session state (RFC-005), never persisted.
  gridSize: { cols: number; rows: number }   // per-battle dimensions (Decision A); an editable preset {50×30, 100×60} — persisted grids are Edit-mode (H-9)
  gridState: number[][]   // DENSE occupant map (0 = empty; v>0 = organismIds[v-1]); rows × cols per gridSize. Converted to RFC-004 typed-array Grid at runtime, and to sparse cells for export (RFC-006).
  createdAt: Date
  updatedAt: Date
}

// NOTE: Battles reference organisms BY ID, not by embedding full copies. The Organism Library is a
// workspace-level shared collection (FR-7.15): editing an organism propagates to every battle that
// uses it. RFC-006 (persistence/workspace schema) defines the export envelope and computes the
// referenced-organism closure so a single-battle export remains self-contained.

// Lightweight Gallery/index projection — everything except the heavy gridState (arch Decision H.4).
// organismIds is the PLACED set (identical to the full entity's — Decision H.1), so the RFC-005
// Decision 8 usage index builds from list() without deserializing a single grid; thumbnails stay
// on-demand from load() (arch M4).
interface BattleSummary {
  id: string
  name: string
  gridSize: { cols: number; rows: number }
  organismIds: string[]
  updatedAt: Date
  // NO createdAt: added 2026-08-07 (Story 1.10) to back a two-date disclosure panel, reverted
  // 2026-08-08 in the same story once the tile settled on ONE date (FR-7.3's "Date created / last
  // modified" read as a single field) — updatedAt alone, already equal to createdAt until a
  // battle's first edit.
}

// Repository interfaces (abstract persistence)
interface BattleRepository {
  save(battle: Battle): Promise<void>
  load(id: string): Promise<Battle | null>
  list(): Promise<BattleSummary[]>          // lightweight summaries for the Gallery
  listFull(): Promise<Battle[]>             // full battles — used by WorkspaceSerializer export (RFC-006)
  delete(id: string): Promise<void>
  exists(id: string): Promise<boolean>
  replaceAll(battles: Battle[]): Promise<void>   // bulk replace — atomic workspace import (RFC-006 Decision 5)
}

// OrganismRepository / SettingsRepository mirror this CRUD shape (with `replaceAll` where applicable).
// A DATA-ONLY `clearAll()` (FR-8.5: battles + organisms — it never touches settings, which are
// device-local and excluded from every export; RFC-006 Decision 6 / arch Decision F) is exposed on
// AppRepositories and consumed by the WorkspaceSerializer (RFC-006). These bulk methods were added
// to reconcile RFC-001 with RFC-006.

// Concrete implementations
class LocalStorageBattleRepository implements BattleRepository {
  async save(battle: Battle): Promise<void> {
    const battles = this.loadAllFromStorage()
    battles[battle.id] = battle
    localStorage.setItem('battles', JSON.stringify(battles))
  }
  // ... other methods
}

class ApiBattleRepository implements BattleRepository {
  constructor(private apiClient: ApiClient) {}

  async save(battle: Battle): Promise<void> {
    await this.apiClient.post('/battles', battle)
  }
  // ... other methods
}
```

**Rationale:**
- Async interfaces handle both sync (localStorage) and async (API) operations uniformly
- Repository pattern is well-understood and battle-tested
- Dependency injection enables testing and mode switching
- Domain entities remain pure, unaware of persistence

#### 2. Implementation Switching Strategy

**Decision:** Build-time selection with factory pattern

**Implementation:**
```typescript
// repository.factory.ts
export function createRepositories(): AppRepositories {
  const mode = process.env.NEXT_PUBLIC_MODE || 'standalone'

  if (mode === 'standalone') {
    return {
      battles: new LocalStorageBattleRepository(),
      organisms: new LocalStorageOrganismRepository(),
      settings: new LocalStorageSettingsRepository(),
    }
  } else {
    const apiClient = new ApiClient(process.env.NEXT_PUBLIC_API_URL)
    return {
      battles: new ApiBattleRepository(apiClient),
      organisms: new ApiOrganismRepository(apiClient),
      settings: new ApiSettingsRepository(apiClient),
    }
  }
}

// App initialization
const repositories = createRepositories()

export const AppContext = React.createContext({ repositories })

// Usage in components (identical for both modes)
function BattleGallery() {
  const { repositories } = useAppContext()
  const [battles, setBattles] = useState<BattleSummary[]>([])

  useEffect(() => {
    repositories.battles.list().then(setBattles)
  }, [])

  // Component has no knowledge of persistence implementation
}
```

**Build Configuration:**
```json
// package.json (apps/web)
{
  "scripts": {
    "build:standalone": "NEXT_PUBLIC_MODE=standalone next build",
    "build:connected": "NEXT_PUBLIC_MODE=connected next build",
    "dev:standalone": "NEXT_PUBLIC_MODE=standalone next dev",
    "dev:connected": "NEXT_PUBLIC_MODE=connected next dev"
  }
}
```
```js
// next.config.mjs — static export is configured HERE (`output: 'export'`); the separate
// `next export` command was removed in Next.js 14 and must not appear in any script.
export default {
  // Standalone mode emits the fully static site to apps/web/out/ (NFR-6.1);
  // Connected mode builds a normal server target.
  output: process.env.NEXT_PUBLIC_MODE === 'standalone' ? 'export' : undefined,
}
```

**Rationale:**
- Build-time selection optimizes bundle size (unused code eliminated)
- Factory pattern centralizes implementation selection
- Environment variables provide clear configuration
- Could add runtime detection later if needed

#### 3. Data Model Layer Design

**Decision:** Shared domain models with Zod validation

**Implementation:**
```typescript
// schemas/battle.schema.ts
import { z } from 'zod'

export const OrganismSchema = z.object({
  schemaVersion: z.number().int(),              // rules schema version (RFC-004 §2.4) — a write-time stamp, updated by RFC-006's formatVersion chain and asserted at load (arch Decision I); never independently branched on
  id: z.string(),
  name: z.string().max(50),
  colorToken: z.string(),                       // stable palette token (RFC-007); resolved to hex at render time — NOT a raw hex
  dominance: z.number().int().min(1).max(100),  // FR-2.2: 1–100 INTEGER (the Pydantic/SQL mirrors below already enforce int)
  agingEnabled: z.boolean(),
  survivalRules: SurvivalRulesSchema,           // defined in RFC-004 (a generic RuleSet); replaces the earlier undefined `RuleSchema`
})

// PROTECTED DEFAULT (FR-1.5 / arch M1 + M9): the pre-loaded "Conway's Classic" is the seed
// organism in DEFAULT_WORKSPACE, identified by a stable well-known id (e.g. 'conways-classic').
// It is NON-DELETABLE (FR-1.4 exempts it regardless of usage — enforced in the delete rule, no
// schema flag needed) and ALWAYS PRESENT: ensureDefaultOrganism() re-adds it on first run,
// Clear All (FR-8.5), and after Import (RFC-006 Decision 5 / FR-8.4). Out-of-band JSON tampering
// that removes it on a plain at-rest load is out of scope (no self-heal on plain load).

// Persisted grids are Edit-mode only (H-9): exactly one of the two editable presets. The larger
// Play-mode sizes (150×90, 200×120) are ephemeral and never reach this schema. Single-sourced here;
// RFC-006's envelope `gridDimensions` reuses it (arch Decision G.1). A future preset = formatVersion bump.
export const EditableGridPresetSchema = z.union([
  z.object({ cols: z.literal(50),  rows: z.literal(30) }),
  z.object({ cols: z.literal(100), rows: z.literal(60) }),
])

// A battle is JSON at rest (localStorage) and on the wire (the RFC-006 envelope), so timestamps
// arrive as ISO strings and are hydrated here. This is NOT `z.date()`: JSON.stringify turns a
// Date into a string, and a Zod transform runs *after* validation, so `z.date()` rejects the raw
// string before any transform could rescue it. RFC-006 already spells these two fields as ISO
// strings, so this is also what lets the two schemas share one value.
// (Corrected in Story 1.4 — the previous `z.date()` + `.transform().parse()` pair below was
// unimplementable as written.)
const IsoTimestamp = z.iso.datetime().transform((s) => new Date(s))

export const BattleSchema = z.object({
  id: z.uuid(),
  name: z.string().max(100),
  organismIds: z.array(z.string()).max(255),   // references into the shared Organism Library (FR-7.15); ≤255 = the dense-encoding / Uint8 occupant cap (arch Decision G.3) — the library itself stays uncapped (M6)
  gridSize: EditableGridPresetSchema,          // per-battle dimensions (Decision A / H-9, schema-enforced — Decision G.1)
  gridState: z.array(z.array(z.number().int().min(0).max(255))),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).superRefine((b, ctx) => {
  // Structural invariants the architecture already commits to (arch Decision G.2):
  if (b.gridState.length !== b.gridSize.rows || b.gridState.some(r => r.length !== b.gridSize.cols))
    ctx.addIssue({ code: 'custom', message: 'gridState dimensions must match gridSize' })
  if (b.gridState.some(r => r.some(v => v > b.organismIds.length)))
    ctx.addIssue({ code: 'custom', message: 'gridState cell values must index into organismIds (v ≤ organismIds.length)' })
  const placed = new Set(b.gridState.flat().filter(v => v > 0))
  if (b.organismIds.some((_, i) => !placed.has(i + 1)))
    ctx.addIssue({ code: 'custom', message: 'organismIds must be exactly the placed set — no unplaced roster members at rest (arch Decision H.1)' })
})

// Type inference. The OUTPUT type carries hydrated Dates; the parse INPUT is the JSON shape with
// ISO strings, reachable as `z.input<typeof BattleSchema>`.
export type Battle = z.infer<typeof BattleSchema>
export type Organism = z.infer<typeof OrganismSchema>

// Validation at repository boundaries (as implemented in Story 1.4)
class LocalStorageBattleRepository implements BattleRepository {
  async save(battle: Battle): Promise<void> {
    // The whole collection lives under ONE key (RFC-006 Decision 7), not `battle-${id}`.
    // JSON.stringify renders the Date fields as exactly the ISO form IsoTimestamp accepts back.
    const collection = readCollection('gol:battles')
    collection[battle.id] = battle
    writeDataKey('gol:battles', collection)   // candidate-string-then-setItem (AR-14)
  }

  async load(id: string): Promise<Battle | null> {
    const record = readCollection('gol:battles')[id]
    if (record === undefined) return null            // absent

    const parsed = BattleSchema.safeParse(record)    // IsoTimestamp hydrates both timestamps
    if (!parsed.success) {
      // Present-but-invalid is NOT absent: returning null here would read as "no such battle",
      // and the next save would overwrite a record that was merely unparseable.
      throw new CorruptDataError('gol:battles', `battle "${id}"`)
    }
    return parsed.data
  }
}
```

**Rationale:**
- Single source of truth for data shapes
- Runtime validation catches corruption/version mismatches
- Zod provides TypeScript types AND validation
- Transforms hydrate *after* validation, so the schema must accept the stored (JSON) shape — the wire format drives the field types, not the in-memory one

#### 4. Python API Architecture (Connected Mode)

**Decision:** FastAPI with PostgreSQL/SQLite

**Implementation:**
```python
# api/models/battle.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List
from uuid import UUID

class Organism(BaseModel):
    id: str
    name: str = Field(max_length=50)
    color_token: str   # stable palette token (RFC-007); resolved to hex at render time
    dominance: int = Field(ge=1, le=100)
    aging_enabled: bool
    rules: List[Rule]

class Battle(BaseModel):
    id: UUID
    name: str = Field(max_length=100)
    organism_ids: List[str]   # references into the shared Organism Library (FR-7.15)
    grid_state: List[List[int]]
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

# api/routers/battles.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/battles")

@router.post("/")
async def create_battle(
    battle: Battle,
    db: Session = Depends(get_db)
) -> Battle:
    db_battle = BattleModel(**battle.dict())
    db.add(db_battle)
    db.commit()
    return Battle.from_orm(db_battle)

@router.get("/{battle_id}")
async def get_battle(
    battle_id: UUID,
    db: Session = Depends(get_db)
) -> Battle:
    # ... retrieval logic
```

**Database Schema:**
```sql
-- PostgreSQL schema
CREATE TABLE battles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    grid_state JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE organisms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    color_token VARCHAR NOT NULL,   -- stable palette token (RFC-007), not a raw hex
    dominance INTEGER CHECK (dominance >= 1 AND dominance <= 100),
    aging_enabled BOOLEAN DEFAULT false,
    rules JSONB NOT NULL
);

-- Organisms are workspace-shared (FR-7.15), not battle-owned. Battle↔organism membership is a
-- many-to-many association, not a FK on organisms:
CREATE TABLE battle_organisms (
    battle_id   UUID REFERENCES battles(id)   ON DELETE CASCADE,
    organism_id UUID REFERENCES organisms(id) ON DELETE RESTRICT,
    PRIMARY KEY (battle_id, organism_id)
);
```

> **NOTE (Connected mode, post-MVP):** the schema above reflects the **shared Organism Library** (FR-7.15) — organisms are workspace-level and referenced by battles via the `battle_organisms` association, not owned by a single battle. The earlier draft's `organisms.battle_id` FK (battle-owned copies) contradicted FR-7.15 and has been removed. Auth, per-user workspace scoping, and bulk import/export application against this schema are deferred (see RFC-006 §Decision 9).

**Rationale:**
- FastAPI provides automatic OpenAPI documentation
- Pydantic models mirror TypeScript/Zod schemas
- PostgreSQL for production, SQLite for development
- JSONB for flexible rule storage

#### 5. Build & Deployment Pipeline

**Decision:** Monorepo with modular packages

**Repository Structure:**
```
game-of-life-studio/
├── apps/
│   ├── web/                 # Next.js application
│   │   ├── app/             # App Router (canonical — Cross-RFC Reconciliation #4): page.tsx, battle/[id]/, settings/
│   │   ├── components/
│   │   └── package.json
│   └── api/                 # FastAPI application
│       ├── routers/
│       ├── models/
│       └── requirements.txt
├── packages/
│   ├── domain/              # Shared business logic
│   │   ├── entities/
│   │   ├── rules-engine/
│   │   └── package.json
│   ├── persistence/         # Repository implementations
│   │   ├── interfaces/
│   │   ├── localStorage/
│   │   ├── api/
│   │   └── package.json
│   ├── simulation/          # Game engine (performance-critical)
│   │   ├── grid.ts
│   │   ├── evaluator.ts
│   │   └── package.json
│   └── test-utils/          # shared fixtures, fake repos, fixed seeds, canonical organisms (RFC-008)
│       └── package.json
├── deploy/
│   ├── standalone/
│   │   └── vercel.json      # Static export config
│   └── connected/
│       ├── vercel.json      # Frontend config
│       └── railway.toml     # Backend config
└── package.json             # Root workspace config
```

**Workspace Configuration:**
```json
// package.json (root)
{
  "name": "game-of-life-studio",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "build:standalone": "turbo run build:standalone",
    "build:connected": "turbo run build:connected",
    "test": "turbo run test"
  }
}

// turbo.json (Turborepo 2.x — the key is "tasks"; "pipeline" was the 1.x name)
{
  "tasks": {
    "build:standalone": {
      "dependsOn": ["^build"],
      "env": ["NEXT_PUBLIC_MODE"],
      "outputs": ["apps/web/out/**"]
    },
    "build:connected": {
      "dependsOn": ["^build"],
      "env": ["NEXT_PUBLIC_MODE", "NEXT_PUBLIC_API_URL"],
      "outputs": ["apps/web/.next/**"]
    }
  }
}
```

**Rationale:**
- Monorepo ensures version synchronization
- Packages enable code sharing between modes
- Turborepo provides efficient caching and parallel builds
- Clear separation between apps and shared packages

### Risks & Mitigations

**Risk 1: Abstraction Performance Overhead**
- **Risk:** Repository pattern might add latency to hot paths
- **Mitigation:** Keep simulation engine separate with direct memory access; repositories only for persistence operations

**Risk 2: Schema Drift Between Modes**
- **Risk:** localStorage and API schemas might diverge over time
- **Mitigation:** Shared Zod schemas enforce consistency; automated tests validate both implementations

**Risk 3: Build Complexity**
- **Risk:** Multiple build configurations might be confusing
- **Mitigation:** Clear npm scripts; CI/CD automation; comprehensive documentation

**Risk 4: localStorage Size Limits**
- **Risk:** Users might exceed 5-10MB localStorage quota
- **Mitigation:** Implement storage size monitoring; provide clear export/import flow; prepare IndexedDB migration path

**Risk 5: Feature Parity**
- **Risk:** Some features might only work in connected mode
- **Mitigation:** Clear feature flags; graceful degradation; UI communicates mode-specific limitations

### Alternatives Considered

**Alternative 1: Runtime Mode Detection**
- **Pros:** Single build, dynamic adaptation
- **Cons:** Larger bundle size, complex error handling, unpredictable behavior
- **Rejected because:** Build-time selection provides more predictable behavior and optimal bundle size

**Alternative 2: Separate Codebases**
- **Pros:** Simple, no abstraction overhead
- **Cons:** Duplicate code, maintenance nightmare, features diverge
- **Rejected because:** Violates DRY principle, doubles development effort

**Alternative 3: API-Only Architecture**
- **Pros:** Single implementation, standard architecture
- **Cons:** Requires backend infrastructure for MVP, no offline support
- **Rejected because:** Conflicts with zero-cost MVP requirement (NFR-6.1)

**Alternative 4: GraphQL with Apollo Client**
- **Pros:** Sophisticated caching, offline support via apollo-cache-persist
- **Cons:** Complex setup, large bundle size, overkill for this use case
- **Rejected because:** Adds unnecessary complexity for relatively simple data needs

**Alternative 5: IndexedDB for Standalone Mode**
- **Pros:** Larger storage capacity, better performance for large datasets
- **Cons:** Async API adds complexity, browser support varies
- **Rejected because:** localStorage sufficient for MVP; can migrate later if needed

---

**Status:** Approved (2026-07-10)
**Next Steps:**
1. Proceed to implementation per the epics and stories derived from this architecture