import { createLocalStorageRepositories, type AppRepositories } from '@gol/persistence';

import { APP_MODE } from '@/lib/mode';

/**
 * Build-time mode selection (AR-2). This lives in apps/web rather than in @gol/persistence
 * because APP_MODE is only readable here — `@/lib/mode` is the single read-point for
 * NEXT_PUBLIC_MODE, and NEXT_PUBLIC_* is string-inlined at build time only for direct property
 * access, so a dynamic read from inside a package would yield undefined in the browser bundle.
 *
 * Call this ONCE at a page boundary and pass the result down as props (AR-27). No Context, no
 * provider, no module-level singleton: a component that reaches for repositories itself — or
 * imports a concrete LocalStorage* class — has broken the dual-mode seam, and will still compile
 * and pass its tests.
 *
 * Constructing repositories touches no storage, so importing this from a statically exported
 * route is safe; only the repository METHODS read localStorage.
 */
export function createRepositories(): AppRepositories {
  if (APP_MODE === 'standalone') return createLocalStorageRepositories();

  // Api* repositories are post-MVP (RFC-006 Decision 9). Failing loudly beats silently handing
  // back localStorage under a mode that promises a server.
  throw new Error(
    `Unsupported NEXT_PUBLIC_MODE "${APP_MODE}" — connected mode is post-MVP (RFC-006 Decision 9).`,
  );
}
