'use client';

import { useEffect, useRef, useState } from 'react';
import { seedDefaultWorkspace, type AppRepositories } from '@gol/persistence';

export type WorkspaceSeedStatus = 'seeding' | 'ready' | 'error';

/**
 * Runs Story 1.5's first-run seed exactly once at the page boundary. `repos` is typed against the
 * AppRepositories INTERFACE (AR-2/27) — this hook never imports a concrete repository or calls
 * createRepositories() itself.
 *
 * The useRef guard exists because React 19 StrictMode double-invokes effects in dev: the seed
 * itself is idempotent (seedDefaultWorkspace gates on isFreshWorkspace()), so nothing would
 * corrupt without the guard, but two concurrent runs could both observe isFreshWorkspace() ===
 * true and both write — this keeps the dev console and the write count honest.
 *
 * Story 1.6 layers the AR-45 dev-only fixture seed on top of this exact call site (dev build
 * seeds mocks; production seeds DEFAULT_WORKSPACE only) — keeping the call in the hook, not
 * inline in JSX, is what gives that story somewhere to extend.
 */
export function useWorkspaceSeed(repos: AppRepositories): { status: WorkspaceSeedStatus } {
  const [status, setStatus] = useState<WorkspaceSeedStatus>('seeding');
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    let cancelled = false;
    seedDefaultWorkspace(repos)
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // Empty deps by design (Story 1.5 Task 5): repos is constructed once at the page boundary via
    // useMemo(..., []), so it is referentially stable for the component's lifetime. Re-running on
    // identity change would fight the StrictMode guard above rather than complement it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status };
}
