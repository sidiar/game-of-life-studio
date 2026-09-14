import { StrictMode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { MOCK_ORGANISM_IDS } from '@gol/test-utils';
import OrganismsPage from './page';

// Modelled on app/(gallery)/page.test.tsx — the wiring proof for this exact stack (Vitest + RTL +
// jsdom + the @gol/domain workspace-source import path), applied to the second page boundary.
describe('OrganismsPage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("renders the Organism Library heading at once, and Conway's Classic by name once ready", async () => {
    render(<OrganismsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Organism Library' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Conway's Classic")).toBeInTheDocument();
    });
  });

  it('has no axe accessibility violations once ready', async () => {
    const { container } = render(<OrganismsPage />);
    await waitFor(() => screen.getByText("Conway's Classic"));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Regression per app/(gallery)/page.test.tsx's own precedent: App Router turns StrictMode on
  // by default in dev, so this is the only place the seed's double-effect trap is reproduced.
  it('reaches ready under StrictMode, and seeds gol:organisms exactly once', async () => {
    render(
      <StrictMode>
        <OrganismsPage />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText("Conway's Classic")).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(stored)).toEqual([CONWAYS_CLASSIC_ID]);
  });

  it('renders the three AR-45 mock organisms by name under NODE_ENV=development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<OrganismsPage />);

    await waitFor(() => {
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

    // Its own waitFor (as app/(gallery)/page.test.tsx does): the storage write above lands
    // inside the seed effect, BEFORE the status flip re-runs list(), so the names can trail it by
    // a tick.
    await waitFor(() => {
      expect(screen.getByText('Aggressive Colonizer')).toBeInTheDocument();
      expect(screen.getByText('Patient Defender')).toBeInTheDocument();
      expect(screen.getByText('Chaotic Spreader')).toBeInTheDocument();
    });
  });
});
