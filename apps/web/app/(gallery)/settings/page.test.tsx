import { StrictMode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { MOCK_BATTLE_IDS, MOCK_ORGANISM_IDS } from '@gol/test-utils';
import SettingsRoute from './page';

// `<dd>` maps to the ARIA "definition" role, which is name-from-author-PROHIBITED (unlike `<dt>`'s
// "term" role) — so `getByRole('definition', { name })` cannot resolve a specific tile. Terms and
// definitions are read as parallel lists instead and paired by index, exactly the order
// <WorkspaceStatistics> renders them in (Saved Battles, then Organisms).
function readStats() {
  const terms = screen.getAllByRole('term').map((el) => el.textContent);
  const definitions = screen.getAllByRole('definition').map((el) => el.textContent);
  return Object.fromEntries(terms.map((term, i) => [term, definitions[i]])) as Record<
    string,
    string | null
  >;
}

// Modelled on app/(gallery)/organisms/page.test.tsx — the wiring proof for this exact stack,
// applied to the third page boundary.
describe('SettingsRoute', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('renders the Settings heading at once, and the counts once ready (production seed)', async () => {
    render(<SettingsRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();

    // The production seed writes Conway's Classic only — no battles.
    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(2);
    });
    const stats = readStats();
    expect(stats['Saved Battles']).toBe('0');
    expect(stats.Organisms).toBe('1');
  });

  it('has no axe accessibility violations once ready', async () => {
    const { container } = render(<SettingsRoute />);
    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(2);
    });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Regression per app/(gallery)/organisms/page.test.tsx's own precedent: App Router turns
  // StrictMode on by default in dev, so this is the only place the seed's double-effect trap is
  // reproduced on THIS boundary.
  it('reaches ready under StrictMode, and seeds gol:organisms exactly once', async () => {
    render(
      <StrictMode>
        <SettingsRoute />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(readStats().Organisms).toBe('1');
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(stored)).toEqual([CONWAYS_CLASSIC_ID]);
  });

  it('renders the AR-45 mock counts under NODE_ENV=development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<SettingsRoute />);

    const expectedOrganismCount = Object.keys(MOCK_ORGANISM_IDS).length + 1; // + Conway's Classic
    const expectedBattleCount = Object.keys(MOCK_BATTLE_IDS).length;

    await waitFor(() => {
      expect(readStats().Organisms).toBe(String(expectedOrganismCount));
    });
    expect(readStats()['Saved Battles']).toBe(String(expectedBattleCount));
  });

  it('never writes gol:settings — the shell reads it, never writes it (AC5)', async () => {
    render(<SettingsRoute />);

    await waitFor(() => {
      expect(readStats().Organisms).toBe('1');
    });

    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
  });
});
