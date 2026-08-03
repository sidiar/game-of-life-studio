import { OrganismSchema } from '@gol/domain';

import { APP_MODE } from '../lib/mode';

// Placeholder home route — the real Battle Gallery arrives in Story 1.10.
// Static text only: no fetch/API calls, nothing that breaks static export.
// Story 1.3 replaced @gol/domain's placeholder export with real schemas — OrganismSchema
// stands in as the wiring proof that this workspace package resolves as TS source.
const DOMAIN_PACKAGE_NAME = OrganismSchema ? '@gol/domain' : '';

export default function HomePage() {
  return (
    <main>
      <h1>Game of Life Studio</h1>
      <p>Battle Gallery coming soon.</p>
      <p>
        mode: {APP_MODE} · wired to {DOMAIN_PACKAGE_NAME}
      </p>
    </main>
  );
}
