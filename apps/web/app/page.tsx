import { OrganismSchema } from '@gol/domain';

import { APP_MODE } from '../lib/mode';

// Placeholder home route — the real Battle Gallery arrives in Story 1.10.
// Static text only: no fetch/API calls, nothing that breaks static export.
//
// Reading a field off OrganismSchema keeps Story 1.1's wiring proof honest: it fails the build
// if @gol/domain stops resolving to its TS source through transpilePackages. A truthiness check
// on the import would have passed for any non-schema value, proving nothing.
const DOMAIN_ORGANISM_FIELDS = Object.keys(OrganismSchema.shape).length;

export default function HomePage() {
  return (
    <main>
      <h1>Game of Life Studio</h1>
      <p>Battle Gallery coming soon.</p>
      <p>
        mode: {APP_MODE} · wired to @gol/domain ({DOMAIN_ORGANISM_FIELDS} organism fields)
      </p>
    </main>
  );
}
