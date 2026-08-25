import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@gol/domain';
import { createFakeRepositories, createMockBattles, createMockOrganisms } from '@gol/test-utils';
import BattleGallery from './BattleGallery';

// A dedicated file (not BattleGallery.test.tsx) because vi.mock('./BattleTile', ...) is
// module-scoped: mocking it here would blank every heading/dot assertion in the main suite. This
// file exists ONLY to prove the VALUE in transit — that settings.gridLines reaches BattleTile's
// showGridLines prop — the pixel-level "does a grid line actually paint" behaviour is already
// covered at PetriDishCanvas.test.tsx (the renderer) and BattleTile.test.tsx (the load lifecycle).
vi.mock('./BattleTile', () => ({ default: vi.fn(() => null) }));

// vi.mock is module-scoped and this project's vitest config sets no `clearMocks`, so without this
// the mock accumulates calls across tests: `waitFor(() => expect(mockTile).toHaveBeenCalled())`
// is then satisfied on its first tick by the PREVIOUS test's calls — while this test's Gallery is
// still in its loading state with no tile rendered — and `.at(-1)` reads the wrong render's props.
// The barrier has to be able to distinguish "this render happened" from "some render happened".
beforeEach(async () => {
  const { default: BattleTile } = await import('./BattleTile');
  vi.mocked(BattleTile).mockClear();
});

describe('BattleGallery — settings.gridLines wiring (AC3, Task 4)', () => {
  it('passes showGridLines: false through to the tile when the setting is off', async () => {
    const { default: BattleTile } = await import('./BattleTile');
    const mockTile = vi.mocked(BattleTile);
    const repos = createFakeRepositories({
      battles: [createMockBattles()[0]],
      organisms: createMockOrganisms(),
      settings: { ...DEFAULT_SETTINGS, gridLines: false },
    });

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(mockTile).toHaveBeenCalled());
    expect(mockTile.mock.calls.at(-1)?.[0].showGridLines).toBe(false);
  });

  it('passes showGridLines: true (FR-8.7 default) when no settings record exists', async () => {
    const { default: BattleTile } = await import('./BattleTile');
    const mockTile = vi.mocked(BattleTile);
    const repos = createFakeRepositories({
      battles: [createMockBattles()[0]],
      organisms: createMockOrganisms(),
    });

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(mockTile).toHaveBeenCalled());
    expect(mockTile.mock.calls.at(-1)?.[0].showGridLines).toBe(true);
  });

  it('still renders with grid lines on when settings.load() rejects', async () => {
    const { default: BattleTile } = await import('./BattleTile');
    const mockTile = vi.mocked(BattleTile);
    const repos = createFakeRepositories({
      battles: [createMockBattles()[0]],
      organisms: createMockOrganisms(),
    });
    vi.spyOn(repos.settings, 'load').mockRejectedValue(new Error('corrupt'));

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(mockTile).toHaveBeenCalled());
    expect(mockTile.mock.calls.at(-1)?.[0].showGridLines).toBe(true);
  });
});
