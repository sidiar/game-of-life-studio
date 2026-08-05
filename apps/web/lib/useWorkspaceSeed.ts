'use client';

import { useEffect, useRef, useState } from 'react';
import { seedDefaultWorkspace, type AppRepositories } from '@gol/persistence';

export type WorkspaceSeedStatus = 'seeding' | 'ready' | 'error';

/**
 * Runs Story 1.5's first-run seed exactly once at the page boundary. `repos` is typed against the
 * AppRepositories INTERFACE (AR-2/27) — this hook never imports a concrete repository or calls
 * createRepositories() itself.
 *
 * The hasRun guard exists because React 19 StrictMode double-invokes effects in dev: the seed
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
  // Liveness must be a REF, not a per-invocation `let cancelled` (Review 2026-08-05). The two
  // guards have different lifetimes: hasRun deliberately survives StrictMode's setup -> cleanup ->
  // setup so the seed runs once, which means the SECOND setup skips and the FIRST setup owns the
  // in-flight promise — while that first setup's cleanup has already fired. A closure flag is dead
  // by then, so `setStatus('ready')` was discarded and the page read "workspace: seeding" forever
  // in `npm run dev` (App Router enables StrictMode by default). A ref is re-armed by setup #2.
  const mounted = useRef(true);

  useEffect(() => {
    // Re-arm BEFORE the hasRun check — the early-return path below must still restore liveness.
    mounted.current = true;

    if (!hasRun.current) {
      hasRun.current = true;
      seedDefaultWorkspace(repos)
        .then(() => {
          if (mounted.current) setStatus('ready');
        })
        .catch(() => {
          if (mounted.current) setStatus('error');
        });
    }

    // Returned unconditionally so a genuine unmount always clears liveness, including on the
    // StrictMode second pass that skipped the seed.
    return () => {
      mounted.current = false;
    };
    // Empty deps by design (Story 1.5 Task 5): repos is constructed once at the page boundary via
    // useMemo(..., []), so it is referentially stable for the component's lifetime. Re-running on
    // identity change would fight the StrictMode guard above rather than complement it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status };
}
