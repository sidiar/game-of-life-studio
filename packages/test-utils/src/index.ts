// Shared test fixtures (RFC-008 Decision 4/9): grid builders, in-memory fake repositories, the
// AR-45 mock organisms/battles, dev-only fixture seeding, and a fixed-seed RNG. Consumed by every
// package's tests plus apps/web's dev-only seed path (dynamic import — see useWorkspaceSeed.ts).

// The canonical organism set AR-5/AC1 promises is "Conway's Classic + the three PRD organisms", so
// Conway is re-exported here rather than left for every consumer to reach into @gol/domain for
// separately. It is a pass-through of the single @gol/domain definition — never a second copy,
// which would drift from the FR-8.4 "unmodified default" baseline the moment either was edited.
export { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID } from '@gol/domain';

export { emptyGrid, gridFromPattern, placePattern } from './gridBuilders';

// The AR-43 performance fixture (Story 3.7). Exported rather than kept inside the bench file
// because TWO benches in two workspaces measure the same battle — @gol/simulation's engine step
// and apps/web's repaint decision — and a gate that sums them is only meaningful if both ran
// against one roster. `benchmarkRoster.test.ts` pins its shape; see the file header on why that
// shape is a gate parameter.
export {
  BENCHMARK_FILL_PERMILLE,
  BENCHMARK_GATED_PRESET,
  BENCHMARK_PRESETS,
  BENCHMARK_ROSTER_SIZE,
  createBenchmarkFill,
  createBenchmarkRoster,
} from './benchmarkRoster';

export { createFakeRepositories } from './fakeRepositories';
export type { FakeSeed } from './fakeRepositories';

export {
  createMockBattles,
  createMockOrganisms,
  createMockWorkspace,
  MOCK_BATTLE_IDS,
  MOCK_ORGANISM_IDS,
} from './mockWorkspace';

export { seedDevFixtures } from './seedDevFixtures';

// No `Rng` type is exported: @gol/simulation owns that name and declares it in Epic 3 (forced
// decision 4). createSeededRng's return type is structural, so it satisfies the real interface when
// it lands without this package ever publishing a competing declaration.
export { createSeededRng, FIXED_SEED } from './seededRng';
