// Shared test fixtures (RFC-008 Decision 4/9): grid builders, in-memory fake repositories, the
// AR-45 mock organisms/battles, dev-only fixture seeding, and a fixed-seed RNG. Consumed by every
// package's tests plus apps/web's dev-only seed path (dynamic import — see useWorkspaceSeed.ts).

export { emptyGrid, gridFromPattern, placePattern } from './gridBuilders';

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

export { createSeededRng, FIXED_SEED } from './seededRng';
export type { Rng } from './seededRng';
