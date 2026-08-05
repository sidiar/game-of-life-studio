'use client';

import { useMemo } from 'react';
import { OrganismSchema } from '@gol/domain';

import { APP_MODE } from '@/lib/mode';
import { createRepositories } from '@/lib/repositoryFactory';
import { useWorkspaceSeed } from '@/lib/useWorkspaceSeed';

// Placeholder home route — the real Battle Gallery arrives in Story 1.10.
//
// Reading a field off OrganismSchema keeps Story 1.1's wiring proof honest: it fails the build
// if @gol/domain stops resolving to its TS source through transpilePackages. A truthiness check
// on the import would have passed for any non-schema value, proving nothing.
const DOMAIN_ORGANISM_FIELDS = Object.keys(OrganismSchema.shape).length;

export default function HomePage() {
  // createRepositories() runs ONCE per component instance (AR-27) — never at module scope, never
  // inside a child. useMemo with an empty dep array is what makes this "once", not "every render":
  // constructing repositories touches no storage, only the repository METHODS do, so calling it
  // here is safe for a statically exported route.
  const repositories = useMemo(() => createRepositories(), []);
  const { status } = useWorkspaceSeed(repositories);

  return (
    <main>
      <h1>Game of Life Studio</h1>
      <p>Battle Gallery coming soon.</p>
      <p>
        mode: {APP_MODE} · wired to @gol/domain ({DOMAIN_ORGANISM_FIELDS} organism fields)
      </p>
      <p>workspace: {status}</p>
    </main>
  );
}
