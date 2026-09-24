import { StrictMode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC_ID, WorkspaceExportSchema } from '@gol/domain';
import { measureStorageUsage, STORAGE_KEYS } from '@gol/persistence';
import { MOCK_BATTLE_IDS, MOCK_ORGANISM_IDS } from '@gol/test-utils';
import { formatStorageSize } from '@/lib/settings/formatStorageSize';
import { downloadJsonFile } from '@/lib/export/downloadJsonFile';
import { APP_VERSION } from '@/lib/appVersion';
import SettingsRoute from './page';

// AC7 (Story 5.5): the wiring test below clicks Export at the real page boundary and captures
// whatever reaches the download seam — mocked here for the same reason DataManagement.test.tsx
// mocks it, so the captured value is exactly what `exportWorkspaceToFile` handed it.
vi.mock('@/lib/export/downloadJsonFile', () => ({
  downloadJsonFile: vi.fn(),
}));

// Parses a rendered "1.5 KB" / "1.00 MB" tile value back to KB, so the production-vs-development
// comparison below asserts a RELATION (development strictly larger) rather than hardcoding either
// figure — hardcoding either would move every time a fixture or Conway's Classic changes.
function kbOf(text: string): number {
  const match = /^([\d,]+\.\d+)\s(KB|MB)$/.exec(text);
  if (!match) throw new Error(`Not a storage size: "${text}"`);
  const value = Number(match[1].replace(/,/g, ''));
  return match[2] === 'MB' ? value * 1024 : value;
}

// `<dd>` maps to the ARIA "definition" role, which is name-from-author-PROHIBITED (unlike `<dt>`'s
// "term" role) — so `getByRole('definition', { name })` cannot resolve a specific tile. Terms and
// definitions are read as parallel lists instead and paired by index, exactly the order
// <WorkspaceStatistics> renders them in (Saved Battles, Organisms, Storage Used).
function readStats() {
  const terms = screen.getAllByRole('term').map((el) => el.textContent);
  const definitions = screen.getAllByRole('definition').map((el) => el.textContent);
  // Index pairing is only sound when the two lists are the same length.
  expect(definitions).toHaveLength(terms.length);
  return Object.fromEntries(terms.map((term, i) => [term, definitions[i]])) as Record<
    string,
    string | null
  >;
}

// Modelled on app/(gallery)/organisms/page.test.tsx — the wiring proof for this exact stack,
// applied to the third page boundary.
describe('SettingsRoute', () => {
  afterEach(() => {
    // AC5, after EVERY mount here — including the StrictMode and NODE_ENV=development paths, the
    // two most likely to write an extra key: the shell reads gol:settings and never writes it
    // (Decision F). Asserted before clear(), or there is nothing left to assert against.
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
    localStorage.clear();
    vi.unstubAllEnvs();
    // The module-level download mock keeps its call history otherwise (the vitest config sets
    // neither clearMocks nor restoreMocks), so a later Export click would read a stale call.
    vi.mocked(downloadJsonFile).mockClear();
  });

  it('renders the Settings heading at once, and the counts once ready (production seed)', async () => {
    render(<SettingsRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();

    // The production seed writes Conway's Classic only — no battles.
    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });
    const stats = readStats();
    expect(stats['Saved Battles']).toBe('0');
    expect(stats.Organisms).toBe('1');
    // Measured AFTER ready — the seed has written gol:organisms (+ the stamp) by then (M9: Conway's
    // Classic is always there), so this is never the empty-store figure.
    expect(stats['Storage Used']).toBe(formatStorageSize(measureStorageUsage().bytes));
    expect(stats['Storage Used']).not.toBe('0.0 KB');
  });

  it('has no axe accessibility violations once ready', async () => {
    const { container } = render(<SettingsRoute />);
    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
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

  it('development Storage Used is strictly larger than the production figure (AR-45 fixtures)', async () => {
    const production = render(<SettingsRoute />);
    await waitFor(() => {
      expect(readStats().Organisms).toBe('1');
    });
    const productionKb = kbOf(readStats()['Storage Used'] ?? '');
    // Unmount and clear so the second render's isFreshWorkspace() reads true again — the dev
    // fixture branch only seeds when the workspace was fresh AT THE EFFECT'S START.
    production.unmount();
    localStorage.clear();

    vi.stubEnv('NODE_ENV', 'development');
    render(<SettingsRoute />);

    const expectedOrganismCount = Object.keys(MOCK_ORGANISM_IDS).length + 1; // + Conway's Classic
    await waitFor(() => {
      expect(readStats().Organisms).toBe(String(expectedOrganismCount));
    });
    const developmentKb = kbOf(readStats()['Storage Used'] ?? '');

    expect(developmentKb).toBeGreaterThan(productionKb);
  });

  it('never writes gol:settings — the shell reads it, never writes it (AC5)', async () => {
    render(<SettingsRoute />);

    await waitFor(() => {
      expect(readStats().Organisms).toBe('1');
    });

    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
  });

  // AC7: the serializer is built ONCE at this boundary (createWorkspaceSerializer({ repos,
  // appVersion: APP_VERSION, now })) and passed down as a Pick<..., 'exportWorkspace'> prop — this
  // is the one place that wiring can be proven against the REAL localStorage repositories rather
  // than a fake.
  it('clicking Export at the real page boundary produces a WorkspaceExportSchema-valid file stamped with APP_VERSION (AC2, AC5, AC7)', async () => {
    render(<SettingsRoute />);

    await waitFor(() => {
      expect(readStats().Organisms).toBe('1');
    });

    fireEvent.click(screen.getByRole('button', { name: /export workspace/i }));

    await waitFor(() => {
      expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    });

    const [filename, value] = vi.mocked(downloadJsonFile).mock.calls[0];
    expect(filename).toMatch(/^game-of-life-workspace-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = WorkspaceExportSchema.parse(value);
    expect(parsed.appVersion).toBe(APP_VERSION);
    expect(parsed.kind).toBe('workspace');
    expect(parsed.organisms.map((o) => o.id)).toEqual([CONWAYS_CLASSIC_ID]);

    // The AC5 guard still holds after an export: read-only, never writes gol:settings.
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
  });
});
