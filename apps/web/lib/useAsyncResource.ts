'use client';

import { useEffect, useState } from 'react';

export type AsyncResourceStatus = 'loading' | 'ready' | 'error';

export interface AsyncResource<T> {
  data: T | undefined;
  status: AsyncResourceStatus;
}

// Element-wise Object.is, the same comparison React itself applies to a dependency array. The
// caller passes a fresh array literal every render, so identity says nothing.
function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

/**
 * The one loading hook every page boundary uses to read through an injected repository
 * (RFC-005 Decision 1). It owns nothing but the request lifecycle — no cache, no dedupe, no
 * global store: localStorage reads complete well inside NFR-1.4, so a query layer would add
 * machinery with nothing to buy.
 *
 * ⚠️ `data` is `T | undefined` and `undefined` means "not settled yet" — it does NOT mean
 * "nothing found". A repository that legitimately resolves to `null` (BattleRepository.load's
 * absent case) lands in `status: 'ready'` with `data` holding that `null`, so callers must branch
 * on `status` FIRST and only then inspect the value. The intuitive `if (!data) return <Loading/>`
 * collapses "does not exist" into "still loading" and spins forever with nothing logged.
 *
 * Liveness is a per-invocation closure flag, deliberately NOT the `mounted` ref
 * `useWorkspaceSeed.ts` uses. That ref exists there solely because a `hasRun` guard makes
 * StrictMode's second setup skip while the FIRST setup still owns the in-flight promise — by which
 * time the first closure is already dead. This hook has no run-once guard: every setup starts its
 * own load with its own live closure, so the closure flag is correct and the ref would import a
 * fix for a bug that cannot occur here.
 *
 * ⚠️ PRECONDITION: every element of `deps` must be referentially stable across renders, exactly
 * as for `useEffect`. The deps-change reset below runs during RENDER, so an unstable element (an
 * inline object, or a `createRepositories()` call that is not wrapped in `useMemo`) makes every
 * render see changed deps, set state, and re-render — React throws "Too many re-renders" and the
 * page white-screens. This is a hard crash, not a slow loop, and it is why `<BattlePage>`'s
 * `repositories` come `useMemo`-stable from the page boundary.
 *
 * ⚠️ `deps` must also keep a FIXED LENGTH. `sameDeps` short-circuits on `a.length === b.length`,
 * but React's own `areHookInputsEqual` compares only up to the shorter array and returns true for
 * a prefix — so growing `[a]` into `[a, b]` makes the render-phase reset fire (back to 'loading')
 * while the effect does NOT re-run. No request is ever started and the caller spins forever, with
 * only a dev-mode console error. Same rule as every other hook: never vary the deps array's shape.
 *
 * `reload` is deliberately not implemented. RFC-005's sketch (`() => load().then(setData)`) sets
 * no status and honours no liveness flag; nothing in this story needs it, and it belongs to the
 * story that does — written correctly there rather than shipped broken here.
 */
export function useAsyncResource<T>(load: () => Promise<T>, deps: unknown[]): AsyncResource<T> {
  const [resource, setResource] = useState<AsyncResource<T>>({
    data: undefined,
    status: 'loading',
  });
  const [settledDeps, setSettledDeps] = useState<unknown[]>(deps);

  // A deps change starts a NEW request, and leaving the previous request's 'ready'/'error' — and
  // its DATA — in place would show the old resource's outcome as though it were the new one's,
  // which is the whole class of bug this hook's status field exists to make impossible.
  //
  // Reset during RENDER, not in the effect. This is React's documented "adjusting state when a
  // prop changes" pattern: React re-runs this component immediately, before touching children or
  // painting, so there is no cascading render and nothing flashes. The obvious alternative — a
  // `setStatus('loading')` at the top of the effect body — is a real cascade (the stale state
  // renders and commits first) and is a lint error under react-hooks/set-state-in-effect.
  if (!sameDeps(settledDeps, deps)) {
    setSettledDeps(deps);
    setResource({ data: undefined, status: 'loading' });
  }

  useEffect(() => {
    let alive = true;

    // `Promise.resolve().then(load)` rather than `load()`: a non-async `load` that throws
    // synchronously would throw while the call expression is being evaluated — BEFORE .catch is
    // attached — so it escapes the effect entirely and tears the tree down to the nearest error
    // boundary, instead of landing in the 'error' status this hook exists to produce. The typed
    // `() => Promise<T>` signature does not prevent it.
    Promise.resolve()
      .then(load)
      .then((value) => {
        if (!alive) return;
        setResource({ data: value, status: 'ready' });
      })
      .catch(() => {
        // `data` stays undefined: a failed load must not hand the caller a half-built resource
        // alongside an error status.
        if (!alive) return;
        setResource({ data: undefined, status: 'error' });
      });

    return () => {
      alive = false;
    };
    // `load` is intentionally absent: callers pass an inline closure that is a new function every
    // render, so including it would re-run the effect forever. `deps` is the caller's declared
    // identity for the request — the same contract RFC-005's snippet specifies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return resource;
}
