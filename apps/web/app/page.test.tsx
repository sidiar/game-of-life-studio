import { StrictMode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { MOCK_BATTLE_IDS, MOCK_ORGANISM_IDS } from '@gol/test-utils';
import HomePage from './page';

// Wiring proof for the toolchain, not a feature test: rendering the Story 1.1
// placeholder home page under Vitest exercises Vitest + React Testing Library +
// jsdom + @vitejs/plugin-react + the @gol/domain workspace-source import path
// (Vitest's parity with Next's transpilePackages) all at once.
describe('HomePage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('renders the placeholder gallery copy wired through @gol/domain', () => {
    const { container } = render(<HomePage />);

    // Story 1.9: the h1 moved here from the shell's wordmark ("Game of Life Studio", now a
    // styled <div> in AppShell, not a heading) — this page owns the document's only <h1>.
    expect(screen.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeInTheDocument();
    expect(screen.getByText('Battle Gallery coming soon.')).toBeInTheDocument();

    // The field count is read off the real OrganismSchema (Story 1.3), so matching a
    // number here proves the workspace package resolved to its TS source under Vitest.
    // Asserting only the literal text would pass even if the import were dead.
    expect(container.textContent).toMatch(/wired to @gol\/domain \(\d+ organism fields\)/);
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<HomePage />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Story 1.5 AC1: a first render against empty localStorage seeds DEFAULT_WORKSPACE.
  it('seeds gol:organisms with conways-classic on first render', async () => {
    render(<HomePage />);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(stored).toHaveProperty(CONWAYS_CLASSIC_ID);
    });
  });

  // Story 1.5 AC2: a second render (mount) against an already-seeded store adds no duplicate.
  it('adds no duplicate organism on a second render', async () => {
    const first = render(<HomePage />);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(stored).toHaveProperty(CONWAYS_CLASSIC_ID);
    });
    first.unmount();

    render(<HomePage />);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(Object.keys(stored)).toEqual([CONWAYS_CLASSIC_ID]);
    });
  });

  // Regression, review 2026-08-05. Nothing else in the pipeline renders strictly: these tests
  // mount bare and the e2e runs against the production export, where React does not double-invoke
  // effects — so `npm run ci` was fully green while `npm run dev` sat on "workspace: seeding"
  // forever. App Router turns StrictMode on by default (reactStrictMode unset => enabled), so dev
  // is the strict environment and this test is the only place that reproduces it.
  it('reaches "ready" under StrictMode, and still seeds exactly once', async () => {
    render(
      <StrictMode>
        <HomePage />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText(/workspace: ready/)).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(stored)).toEqual([CONWAYS_CLASSIC_ID]);
  });

  // Story 1.6 AC3, positive half: a dev build auto-seeds the AR-45 mock fixtures alongside
  // Conway's Classic. vi.stubEnv is applied before render — reading NODE_ENV inside the effect
  // (not at module scope) is what lets this take effect at all (Task 4 silent-failure trap).
  it('seeds the AR-45 mock fixtures under NODE_ENV=development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<HomePage />);

    await waitFor(() => {
      const battles = JSON.parse(localStorage.getItem(STORAGE_KEYS.battles) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(Object.keys(battles).sort()).toEqual(
        [MOCK_BATTLE_IDS.battleA, MOCK_BATTLE_IDS.battleB].sort(),
      );
    });

    const organisms = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(organisms).sort()).toEqual(
      [
        CONWAYS_CLASSIC_ID,
        MOCK_ORGANISM_IDS.aggressiveColonizer,
        MOCK_ORGANISM_IDS.patientDefender,
        MOCK_ORGANISM_IDS.chaoticSpreader,
      ].sort(),
    );
  });

  // Story 1.6 AC3, negative half: the default NODE_ENV under Vitest is 'test', not 'development'
  // — the `=== 'development'` guard (not `!== 'production'`) must leave gol:battles untouched and
  // gol:organisms holding only Conway's Classic.
  it('seeds no mock fixtures without the development stub (NODE_ENV=test)', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText(/workspace: ready/)).toBeInTheDocument();
    });

    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBeNull();
    const organisms = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(organisms)).toEqual([CONWAYS_CLASSIC_ID]);
  });
});
