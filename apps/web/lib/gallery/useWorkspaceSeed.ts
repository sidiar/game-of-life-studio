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
 *
 * The dev-fixture branch below reads `isFreshWorkspace()` BEFORE `seedDefaultWorkspace()` runs
 * (Story 1.6 Task 4): the default seed's organism write stamps `gol:schema`, so reading freshness
 * afterwards would always see `false` and the fixtures would never seed. `process.env.NODE_ENV`
 * is read INSIDE the effect, not at module scope, so `vi.stubEnv` in a test can still take effect
 * before this reads it — a module-scope `const IS_DEV = …` would be evaluated at import time and
 * make the dev-path test pass vacuously. The comparison is `=== 'development'`, not
 * `!== 'production'`: Vitest runs with `NODE_ENV === 'test'`, and the `!==` form would seed mock
 * data into every apps/web unit test. `@gol/test-utils` is a devDependency — the import MUST stay
 * dynamic (`await import(...)`) because the Story 1.2 ESLint import-boundary rule bans a static
 * import of it from non-test app code, and because Next's build-time NODE_ENV inlining is what
 * makes this whole branch — including the import — dead-code-eliminated from the production
 * bundle (AC3's "mock data is unreachable in production").
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
      // Read BEFORE seeding — seedDefaultWorkspace()'s organism write stamps gol:schema, so
      // isFreshWorkspace() would already be false by the time it resolves (see the doc comment
      // above; this is the exact silent-failure trap Story 1.6 Task 4 calls out).
      repos
        .isFreshWorkspace()
        .then((fresh) => seedDefaultWorkspace(repos).then(() => fresh))
        .then((fresh) => {
          if (fresh && process.env.NODE_ENV === 'development') {
            // Dynamic import only — see the doc comment above for why a static import is banned
            // here and why this is what makes the branch dead-code-eliminate from production.
            return import('@gol/test-utils').then(({ seedDevFixtures }) => seedDevFixtures(repos));
          }
          return undefined;
        })
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
