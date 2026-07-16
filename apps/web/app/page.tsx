import { GOL_DOMAIN } from '@gol/domain';

import { APP_MODE } from '../lib/mode';

// Placeholder home route — the real Battle Gallery arrives in Story 1.10.
// Static text only: no fetch/API calls, nothing that breaks static export.
export default function HomePage() {
  return (
    <main>
      <h1>Game of Life Studio</h1>
      <p>Battle Gallery coming soon.</p>
      <p>
        mode: {APP_MODE} · wired to {GOL_DOMAIN}
      </p>
    </main>
  );
}
