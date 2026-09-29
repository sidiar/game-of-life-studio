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
 *
 * Story 7.4 adds the third branch: a FRESH workspace in a PRODUCTION build loads the manifest's
 * default preset (`loadDefaultPreset`, FR-9.2) through the FR-8.4 import pipeline, with no dialog —
 * a fresh store is pristine, the FR-8.4 suppression case. So there are three branches, all decided
 * by the one freshness read taken before any write: fresh + production → the preset (falling back
 * to `seedDefaultWorkspace`); fresh + development → `seedDefaultWorkspace` then the AR-45
 * fixtures, unchanged; anything else (a returning visitor, a Clear All'd store — `resetWorkspace()`
 * keeps the `gol:schema` stamp, so it is never fresh again, M9 — or Vitest's `'test'`) →
 * `seedDefaultWorkspace`, which no-ops on a stamped store. Freshness now matters twice over: the
 * preset's own import stamps the store too, so reading it after either write would misroute both
 * branches. The comparison is `=== 'production'`, never `!== 'development'`, for the same reason
 * as the dev branch: Vitest's `'test'` would otherwise fetch in every apps/web unit test.
 *
 * The preset path is `import()`-ed dynamically (Story 7.4 FD4): it drags the serializer, the
 * migration chain and the envelope schema along, and only a first visit ever runs it — every
 * returning load would otherwise pay for it in the first-load bundle (AR-3). The loader builds the
 * serializer itself from `repos` for that reason; this hook must never import it statically.
 *
 * A PRESET failure is silent (FD5): network, HTTP status, manifest parse, timeout, or an
 * `ImportError` of any code all fall back to `seedDefaultWorkspace(repos)`, never into `error`,
 * never logged. The fallback is safe after every one of them — a fetch/parse failure wrote nothing,
 * and `applyImport`'s rollback restores the still-unstamped snapshot, so the seed's own
 * `isFreshWorkspace()` gate passes. The FALLBACK's own rejection is not silent: it reaches
 * `status: 'error'` exactly as the plain seed's always has.
 *
 * `error` is the seed's rejection, kept (not discarded) so the page can classify it (Story 5.11):
 * a first-run write refused for lack of space is not "your data is damaged", and a newer-format
 * store must never be offered a reset. `undefined` unless `status === 'error'`. Never logged — the
 * e2e specs assert a clean console on the happy path.
 */
export function useWorkspaceSeed(repos: AppRepositories): {
  status: WorkspaceSeedStatus;
  error: unknown;
} {
  const [state, setState] = useState<{ status: WorkspaceSeedStatus; error: unknown }>({
    status: 'seeding',
    error: undefined,
  });
  const hasRun = useRef(false);
  // Liveness must be a REF, not a per-invocation `let cancelled` (Review 2026-08-05). The two
  // guards have different lifetimes: hasRun deliberately survives StrictMode's setup -> cleanup ->
  // setup so the seed runs once, which means the SECOND setup skips and the FIRST setup owns the
  // in-flight promise — while that first setup's cleanup has already fired. A closure flag is dead
  // by then, so the 'ready' update was discarded and the page read "workspace: seeding" forever
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
        .then((fresh) => {
          if (fresh && process.env.NODE_ENV === 'production') {
            // Story 7.4: the first-visit default preset. Dynamic import only (FD4) — see the doc
            // comment above. ANY preset failure falls back to the FR-1.5 seed, silently (FD5).
            return import('@/lib/workspaces/loadDefaultPreset')
              .then(({ loadDefaultPreset }) =>
                loadDefaultPreset({ fetch: globalThis.fetch.bind(globalThis), repos }),
              )
              .then(
                () => fresh,
                () => seedDefaultWorkspace(repos).then(() => fresh),
              );
          }
          return seedDefaultWorkspace(repos).then(() => fresh);
        })
        .then((fresh) => {
          if (fresh && process.env.NODE_ENV === 'development') {
            // Dynamic import only — see the doc comment above for why a static import is banned
            // here and why this is what makes the branch dead-code-eliminate from production.
            return import('@gol/test-utils').then(({ seedDevFixtures }) => seedDevFixtures(repos));
          }
          return undefined;
        })
        .then(() => {
          if (mounted.current) setState({ status: 'ready', error: undefined });
        })
        .catch((error: unknown) => {
          if (mounted.current) setState({ status: 'error', error });
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

  return state;
}
