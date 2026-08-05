import type { AppRepositories } from '@gol/persistence';
import { createMockBattles, createMockOrganisms } from './mockWorkspace';

/**
 * Writes the AR-45 mock organisms and mock battles into `repos`. Takes the AppRepositories
 * INTERFACE (AR-2/27) — never a concrete repository, never createRepositories() — which is what
 * makes this unit-testable against `createFakeRepositories()` with no localStorage involved.
 *
 * Deliberately reads no environment variable and makes no dev/prod decision itself: the caller
 * (apps/web/lib/useWorkspaceSeed.ts) owns the single `process.env.NODE_ENV` read, keeping this
 * function pure with respect to its inputs and testable in isolation.
 *
 * Organisms are written before battles: Battle B's roster references CONWAYS_CLASSIC_ID, and the
 * caller is responsible for having already run seedDefaultWorkspace() so that id resolves — this
 * function itself does not seed Conway's Classic.
 */
export async function seedDevFixtures(repos: AppRepositories): Promise<void> {
  for (const organism of createMockOrganisms()) {
    await repos.organisms.save(organism);
  }
  for (const battle of createMockBattles()) {
    await repos.battles.save(battle);
  }
}
