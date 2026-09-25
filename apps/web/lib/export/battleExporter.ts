import { createWorkspaceSerializer, type AppRepositories } from '@gol/persistence';
import { APP_VERSION } from '@/lib/appVersion';
import { exportBattleToFile } from './exportBattleToFile';
import { exportWorkspaceToFile } from './exportWorkspaceToFile';

export interface BattleExporter {
  exportBattle(id: string): Promise<void>;
  exportWorkspace(): Promise<void>;
}

/**
 * **The lazily imported module (Story 5.6 FD1).** `/battle` had 0.4 KB of first-load headroom at
 * story creation, so the serializer — and everything it pulls in (`organismClosure`, `toEnvelope`,
 * `APP_VERSION`, both `*ToFile` functions and `downloadJsonFile`) — is built HERE, behind a bare
 * `import('@/lib/export/battleExporter')` inside `<BattlePage>`'s post-choice handler, rather than
 * at the page boundary the way Story 5.5's `/settings` builds it.
 *
 * The AR-2/AR-27 seam is unchanged: this is a FACTORY over the injected `AppRepositories`, never a
 * concrete repository — `<BattlePage>` still never imports `createRepositories()` or a concrete
 * repository itself. Recorded as a variance from the route-boundary construction Story 5.5 used,
 * in `deferred-work.md` (Task 8) and in the story's open flags.
 */
export function createBattleExporter(repos: AppRepositories): BattleExporter {
  const serializer = createWorkspaceSerializer({
    repos,
    appVersion: APP_VERSION,
    now: () => new Date(),
  });

  return {
    exportBattle: (id: string) => exportBattleToFile(serializer, id),
    exportWorkspace: () => exportWorkspaceToFile(serializer),
  };
}
