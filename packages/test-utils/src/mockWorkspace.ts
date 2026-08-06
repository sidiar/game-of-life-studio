import { CONWAYS_CLASSIC_ID, type Battle, type Organism, type SurvivalRule } from '@gol/domain';
import { emptyGrid, placePattern } from './gridBuilders';

/**
 * AR-45 mock organisms/battles — the dev-only fixture workspace. Conway's Classic is imported,
 * never restated (Story 1.5 named this file as the consumer): a second copy here would drift from
 * the FR-8.4 "unmodified default" baseline the moment either is edited.
 */

// Stable string literals, not UUIDs — OrganismSchema.id is a bare non-empty string precisely so
// well-known ids are legal (the same reason 'conways-classic' works). They must be stable because
// an `organismType` condition persists the TARGET's library id (Decision E): a generated id would
// make Chaotic Spreader's `organismType eq mock-aggressive-colonizer` rule unresolvable on the
// next run, and the AR-45 coverage matrix below unresolvable with it.
export const MOCK_ORGANISM_IDS = {
  aggressiveColonizer: 'mock-aggressive-colonizer',
  patientDefender: 'mock-patient-defender',
  chaoticSpreader: 'mock-chaotic-spreader',
} as const;

// BattleSchema.id is z.uuid(), unlike Organism.id — generated once and pasted as frozen literals.
export const MOCK_BATTLE_IDS = {
  battleA: 'a3f1c2d4-5b6e-4f7a-8c9d-0e1f2a3b4c5d',
  battleB: 'b4a2d3e5-6c7f-4a8b-9d0e-1f2a3b4c5d6e',
} as const;

/*
 * Rule `id`/`contentHash` are frozen literals, generated once with the exact canonicalization
 * pinned in packages/domain/src/defaultWorkspace.ts and pasted here (same scheme Story 1.5 used
 * for Conway's Classic):
 *
 *   sha256hex(JSON.stringify(sortKeysDeep({ conditions, payload })))
 *
 * Unlike Conway's, these are NOT a cross-install identity baseline — regenerating them is
 * harmless and they carry no identity-pinning test — but they must match the scheme anyway so
 * Epic 4's real hasher can be validated against a set larger than Conway's two rules. See
 * docs/implementation-artifacts/deferred-work.md (Story 1.5 contentHash entry, extended here).
 */

// --- Aggressive Colonizer (dominance 80, no aging) ---------------------------------------------
const AGGRESSIVE_BORN: SurvivalRule = {
  id: '36ce2873-46de-4c0a-9ce1-7dfd10011878',
  contentHash: 'd25fbc29473be175af89f5a21f11db375e3f43dd90d7900d292769e4be6f35ae',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'empty' },
    { property: 'neighborCount', operator: 'eq', pattern: 3 },
  ],
  payload: {
    summary: 'Aggressively colonizes any empty cell with exactly 3 neighbors',
    action: 'born',
  },
};

const AGGRESSIVE_SURVIVE: SurvivalRule = {
  id: '0b6b6a7a-540f-4197-879b-f75d7828fd17',
  contentHash: '01636e9e1bb09e45f14883376f00fc2f89ef3529fd6fb9d329a599d84bfd4b7b',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'alive' },
    // Covers the `gte` operator (AR-45 coverage matrix).
    { property: 'neighborCount', operator: 'gte', pattern: 2 },
  ],
  payload: { summary: 'Survives with 2 or more neighbors', action: 'survive' },
};

const AGGRESSIVE_DIE: SurvivalRule = {
  id: '54e733da-a7d6-4ed7-b9e6-359f938d7512',
  contentHash: '2638698b1afa7fe03f4a3aa903399d0caa364efa3b626d76a04fc79a1064e38c',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'alive' },
    // Covers the `gt` operator and one of AR-45's >=1 explicit `die` rules.
    { property: 'neighborCount', operator: 'gt', pattern: 5 },
  ],
  payload: { summary: 'Dies of overcrowding with more than 5 neighbors', action: 'die' },
};

// --- Patient Defender (dominance 45, aging enabled) ---------------------------------------------
const PATIENT_BORN: SurvivalRule = {
  id: 'c40eca37-e599-44ec-8d8c-ba25f4e553c5',
  contentHash: '69edada77dce00c91195e8ec0aee47c930c2fb515116078df108e16a2a2ca90c',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'empty' },
    // Covers the `range` operator — a [min,max] tuple, not a scalar.
    { property: 'neighborCount', operator: 'range', pattern: [3, 4] },
  ],
  payload: { summary: 'Patiently born on an empty cell with 3 to 4 neighbors', action: 'born' },
};

const PATIENT_SURVIVE: SurvivalRule = {
  id: '86724b66-18db-44d8-8c39-b495ddc20e75',
  contentHash: '928c86413eaff4b78e1bbe70e61a517046cb621dd8ddba615e5b2bab514ac5c1',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'alive' },
    // Covers the occupantNeighborCount property and the `lt` operator.
    { property: 'occupantNeighborCount', operator: 'lt', pattern: 2 },
  ],
  payload: {
    summary: 'Defends and survives with fewer than 2 occupant neighbors',
    action: 'survive',
  },
};

const PATIENT_DIE: SurvivalRule = {
  id: '1a1ca582-697e-4eba-b2bd-b15563cf3aa9',
  contentHash: '0643c2a1c6fafb45e5b12e91211ed7007cabd066db26d13ebc03646582d4b53d',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'alive' },
    // Covers the `age` property and the second of AR-45's >=1 explicit `die` rules.
    { property: 'age', operator: 'gte', pattern: 8 },
  ],
  payload: { summary: 'Dies of old age at 8 cycles or more', action: 'die' },
};

// --- Chaotic Spreader (dominance 20, no aging) --------------------------------------------------
const CHAOTIC_BORN: SurvivalRule = {
  id: '347e01d7-bbb2-4132-be6f-18069207109a',
  contentHash: '26349dd7666eb087e6616d2448ee5782ef99863a86b1ed39bb68bd6aa879d944',
  conditions: [
    // Covers the `occupied` cellState pattern and the organismType property + `eq` operator —
    // the target is Aggressive Colonizer's stable LIBRARY id (Decision E), not a numeric ref.
    { property: 'cellState', operator: 'eq', pattern: 'occupied' },
    { property: 'organismType', operator: 'eq', pattern: MOCK_ORGANISM_IDS.aggressiveColonizer },
  ],
  payload: {
    summary: 'Chaotically spreads by colonizing an Aggressive Colonizer cell',
    action: 'born',
  },
};

const CHAOTIC_SURVIVE: SurvivalRule = {
  id: '5014a589-a10d-4312-8c6b-b7af52394324',
  contentHash: 'f1456a613eb905692d47aa0dd14e1cda149c13e3cc22517cead55bb5221f3c17',
  conditions: [
    { property: 'cellState', operator: 'eq', pattern: 'alive' },
    // Covers the `lte` operator — the last of the six (AR-45 coverage matrix: eq/gt/lt/gte/lte/range).
    { property: 'neighborCount', operator: 'lte', pattern: 4 },
  ],
  payload: { summary: 'Survives chaotically with 4 or fewer neighbors', action: 'survive' },
};

/**
 * DEEP copy of a rule (review 2026-08-05). The rules above are module-level constants so their
 * frozen id/contentHash literals sit next to the conditions they were generated from — but handing
 * the same object out of every createMockOrganisms() call made the factory shallow: only the
 * organism and its survivalRules ARRAY were fresh, while every rule, its conditions and its payload
 * stayed shared and unfrozen process-wide. One test writing to `organisms[0].survivalRules[0]`
 * then changed what the NEXT call returned, which is precisely the cross-test contamination the
 * factory-over-singleton decision exists to prevent.
 *
 * JSON round-trip, not structuredClone: packages/* compile with lib: ["ES2022"] and no @types/node,
 * so structuredClone does not typecheck (same constraint as fakeRepositories.ts). A SurvivalRule is
 * plain JSON — strings, numbers and a [min,max] tuple — so the round-trip is lossless here; the
 * cast restores the tuple type JSON.parse widens to number[].
 */
function cloneRule(rule: SurvivalRule): SurvivalRule {
  return JSON.parse(JSON.stringify(rule)) as SurvivalRule;
}

/**
 * Fresh objects on every call — deliberately NOT a frozen singleton like CONWAYS_CLASSIC (forced
 * decision 3, Dev Notes). Conway is a persisted baseline that must be referentially identical
 * everywhere, so freezing protects it; these are test INPUTS that tests will mutate, and a fresh
 * copy per call gives the same protection without needing the deepFreeze helper @gol/domain does
 * not export. "Fresh" must reach the rules, not stop at the organism — see cloneRule above.
 */
export function createMockOrganisms(): Organism[] {
  return [
    {
      schemaVersion: 1,
      id: MOCK_ORGANISM_IDS.aggressiveColonizer,
      name: 'Aggressive Colonizer',
      colorToken: 'vermillion', // RFC-007 Decision 2 token #2, CVD-robust core
      // Deliberate deviation from the PRD's literal `8` (forced decision 2, Dev Notes): the PRD's
      // 1-10-ish values predate FR-2.2's 1-100 scale and would lose every conflict to Conway's 50.
      // 80/45/20 preserves the PRD's relative ordering, stays distinct from the other two mocks
      // (AR-45) and from Conway's 50, with no tie-break RNG needed in a fixture.
      dominance: 80,
      agingEnabled: false,
      survivalRules: [AGGRESSIVE_BORN, AGGRESSIVE_SURVIVE, AGGRESSIVE_DIE].map(cloneRule),
    },
    {
      schemaVersion: 1,
      id: MOCK_ORGANISM_IDS.patientDefender,
      name: 'Patient Defender',
      colorToken: 'azure', // RFC-007 Decision 2 token #7
      dominance: 45,
      // AR-45's >=1 aging-enabled organism, and it matches the PRD's "cells fade in" intent.
      agingEnabled: true,
      survivalRules: [PATIENT_BORN, PATIENT_SURVIVE, PATIENT_DIE].map(cloneRule),
    },
    {
      schemaVersion: 1,
      id: MOCK_ORGANISM_IDS.chaoticSpreader,
      name: 'Chaotic Spreader',
      colorToken: 'bluish-green', // RFC-007 Decision 2 token #3
      dominance: 20,
      agingEnabled: false,
      survivalRules: [CHAOTIC_BORN, CHAOTIC_SURVIVE].map(cloneRule),
    },
  ];
}

// Small footprint, deliberately non-overlapping placements — this is a dev-fixture roster, not a
// golden Conway pattern (those are Epic 3's, built with gridFromPattern against a real test suite
// that does not exist yet). Each organism just needs >=1 placed cell to satisfy Decision H.1.
function placeMockRoster(
  cols: number,
  rows: number,
  organismIds: readonly string[],
  includeConway: boolean,
): number[][] {
  let grid = emptyGrid(cols, rows);

  // Roster index + 1 = cell value (RFC-006 Decision 2). Looked up by id rather than assumed
  // positionally, so `organismIds` order is deliberately NOT coupled to the placement order below
  // — reordering the roster stays correct. The lookup throws on a miss because bare `indexOf(...)
  // + 1` returns 0 for an absent id, which is the reserved EMPTY-cell value: the organism would
  // simply not be placed, and the failure would surface as a Decision H.1 superRefine error about
  // a roster member with no cells, pointing at the schema rather than at the roster mismatch.
  const cellValueFor = (organismId: string): number => {
    const index = organismIds.indexOf(organismId);
    if (index === -1) {
      throw new Error(`placeMockRoster: "${organismId}" is not in the roster [${organismIds}]`);
    }
    return index + 1;
  };

  const aggressiveIndex = cellValueFor(MOCK_ORGANISM_IDS.aggressiveColonizer);
  const patientIndex = cellValueFor(MOCK_ORGANISM_IDS.patientDefender);
  const chaoticIndex = cellValueFor(MOCK_ORGANISM_IDS.chaoticSpreader);

  // A 2x2 block per organism, spaced apart so nothing collides on a 50x30 grid.
  grid = placePattern(
    grid,
    [
      [aggressiveIndex, aggressiveIndex],
      [aggressiveIndex, aggressiveIndex],
    ],
    2,
    2,
  );
  grid = placePattern(
    grid,
    [
      [patientIndex, patientIndex],
      [patientIndex, patientIndex],
    ],
    10,
    2,
  );
  grid = placePattern(
    grid,
    [
      [chaoticIndex, chaoticIndex],
      [chaoticIndex, chaoticIndex],
    ],
    18,
    2,
  );

  if (includeConway) {
    const conwayIndex = cellValueFor(CONWAYS_CLASSIC_ID);
    // Classic glider, offset well clear of the roster above.
    grid = placePattern(
      grid,
      [
        [0, conwayIndex, 0],
        [0, 0, conwayIndex],
        [conwayIndex, conwayIndex, conwayIndex],
      ],
      26,
      2,
    );
  }

  return grid;
}

/**
 * Fresh objects on every call, same rationale as createMockOrganisms(). Fixed literal timestamps
 * (never `new Date()`): a per-run timestamp would make the Story 1.10 sort order non-reproducible
 * and the fixtures non-comparable across dev sessions. The two battles get different `updatedAt`
 * values so "sorted by last modified" has a defined answer.
 */
export function createMockBattles(): Battle[] {
  const rosterIds = [
    MOCK_ORGANISM_IDS.aggressiveColonizer,
    MOCK_ORGANISM_IDS.patientDefender,
    MOCK_ORGANISM_IDS.chaoticSpreader,
  ];

  const battleA: Battle = {
    id: MOCK_BATTLE_IDS.battleA,
    name: 'Three-Way Skirmish',
    organismIds: rosterIds,
    gridSize: { cols: 50, rows: 30 },
    gridState: placeMockRoster(50, 30, rosterIds, false),
    createdAt: new Date('2026-07-20T09:00:00.000Z'),
    updatedAt: new Date('2026-07-20T09:00:00.000Z'),
  };

  const rosterIdsWithConway = [...rosterIds, CONWAYS_CLASSIC_ID];
  const battleB: Battle = {
    id: MOCK_BATTLE_IDS.battleB,
    // The multi-organism competition Epic 3 is meant to be watchable on — also the second
    // editable preset for the Story 1.10/1.11 Gallery tiles and thumbnails.
    name: 'Grand Colony War',
    organismIds: rosterIdsWithConway,
    gridSize: { cols: 100, rows: 60 },
    gridState: placeMockRoster(100, 60, rosterIdsWithConway, true),
    createdAt: new Date('2026-07-22T14:30:00.000Z'),
    updatedAt: new Date('2026-07-25T18:15:00.000Z'),
  };

  return [battleA, battleB];
}

export function createMockWorkspace(): { organisms: Organism[]; battles: Battle[] } {
  return { organisms: createMockOrganisms(), battles: createMockBattles() };
}
