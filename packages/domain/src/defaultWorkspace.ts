import type { Battle } from './battleSchema';
import type { Organism } from './organismSchema';
import type { SurvivalRule } from './survivalRuleSchema';

// Recursively freezes an object graph. Object.freeze is shallow — freezing CONWAYS_CLASSIC alone
// would still leave survivalRules, each rule, each condition and each payload mutable (the same
// finding the Story 1.4 review raised against DEFAULT_SETTINGS). A shared module-level singleton
// that any consumer can mutate in place corrupts every other reader of it.
function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    for (const key of Object.getOwnPropertyNames(value)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic recursive freeze
      deepFreeze((value as any)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// Stable well-known id (RFC-001 §3 PROTECTED DEFAULT block) — NOT a uuid. OrganismSchema.id is a
// bare non-empty string precisely so this literal is legal; every other organism in the workspace
// gets a generated id, this one never changes across installs (FR-8.4's baseline depends on it).
export const CONWAYS_CLASSIC_ID = 'conways-classic' as const;

// Frozen literal `id` / `contentHash` (forced decision 2 — see story 1.5 Dev Notes): the real
// generator/hasher is authored where organisms are authored (Epic 4) and consumed by the
// evaluator cache (Story 3.4); neither exists yet. Generated once and pasted — regenerating
// either literal forks rule identity across every installed workspace. Not semantic ids (RFC-004
// rejects those).
//
// `id` is a one-off crypto.randomUUID(). `contentHash` is, EXACTLY (review 2026-08-05 — the
// canonicalization was undocumented, which is what would let Epic 4's hasher silently disagree):
//
//   sha256hex(JSON.stringify(sortKeysDeep({ conditions, payload })))
//
// where sortKeysDeep rebuilds every plain object with its own keys in Array#sort order and maps
// arrays element-wise, preserving array ORDER (rule order is priority, FR-2.6). Hashed over
// {conditions, payload} only — never over `id`, which would make the hash self-referential.
// Reproduce with `node -e` before changing anything here; Epic 4's hasher must match this scheme
// or every installed workspace's rule identity forks. Tracked in deferred-work.md.
const BORN_RULE: SurvivalRule = {
  id: '1fcc1002-5f8a-4cf0-9fab-2c0c20492d51',
  contentHash: 'd9b3d443a42e63c10526023503302a87b0676110bf7e5c146625a5237026d93d',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'empty' },
    { property: 'neighborCount', operator: 'eq', pattern: 3 },
  ],
  payload: { summary: 'Born on an empty cell with exactly 3 neighbors', action: 'born' },
};

const SURVIVE_RULE: SurvivalRule = {
  id: '27855506-28f8-46c2-a85b-1464557a121d',
  contentHash: '1a7f0de8227e3031c7000336705781a2df139b445be381f351a4df1cb67c0918',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'alive' },
    { property: 'neighborCount', operator: 'range', pattern: [2, 3] },
  ],
  payload: { summary: 'Survives with 2-3 neighbors', action: 'survive' },
};

// No Die rule — order is priority (FR-2.6): born checked first, then survive. A living cell
// matching neither is gone at cycle end but still counts as a Phase-2 neighbour (implicit death,
// M10 / PRD FR-5 note); an explicit "dies with <2 or >3 neighbors" rule looks equivalent and is
// not — it removes the cell before Phase-2 neighbour counting and breaks every Conway golden test.
export const CONWAYS_CLASSIC: Organism = deepFreeze({
  schemaVersion: 1, // literal, not CURRENT_FORMAT_VERSION — see story 1.5 forced decision 3
  id: CONWAYS_CLASSIC_ID,
  name: "Conway's Classic",
  colorToken: 'sky-blue', // RFC-007 token #1, head of the distinguishability order
  dominance: 50, // FR-2.2 mid-range, stated verbatim in FR-1.5
  agingEnabled: false,
  survivalRules: [BORN_RULE, SURVIVE_RULE],
});

// Domain constant (arch M1, RFC-006 Decision 7), not a persistence value: applied through the
// repositories by @gol/persistence's ensureDefaultOrganism()/seedDefaultWorkspace(), never
// written here. Zero battles is the spec — a starter battle would make Story 1.12's "Create Your
// First Battle" empty state unreachable (FR-7.4).
export const DEFAULT_WORKSPACE: { battles: readonly Battle[]; organisms: readonly Organism[] } =
  deepFreeze({
    battles: [],
    organisms: [CONWAYS_CLASSIC],
  });
