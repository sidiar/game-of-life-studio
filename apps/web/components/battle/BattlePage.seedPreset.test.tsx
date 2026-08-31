import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@gol/domain';
import { createFakeRepositories, createMockWorkspace } from '@gol/test-utils';
import BattlePage from './BattlePage';

// ⚠️ MANDATORY once Story 2.16 lands, not merely convenient (trap 21). `useRouter()` throws
// outside an App Router context under RTL — "invariant expected app router to be mounted" — so
// every file that renders `<BattlePage>` fails AT RENDER without this, in an error that names
// React internals rather than the router (the confusion `AppNav.test.tsx`'s own mock comment
// records from Story 1.9). `<BattlePage>` calls it for the FR-7.10 Back navigation.
//
// `vi.hoisted` so `push` is a real spy this file can assert on, rather than an anonymous mock
// buried in the factory (the idiom `AppNav.test.tsx` established for `usePathname`).
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: router.push }),
}));

// A dedicated file (not BattlePage.test.tsx) because vi.mock is module-scoped: mocking the seed
// factory there would swap it out under every other test in that suite. Same split, and the same
// reason, as BattleGallery.gridLines.test.tsx.
//
// This file exists ONLY to prove the VALUE IN TRANSIT — that settings.defaultGridSize is what
// reaches createNewBattleDraft. Nothing rendered exposes the grid's dimensions (the canvas is
// Story 2.4, and the story forbids inventing debug DOM to assert against), so without this the
// whole of Task 1 is unpinned: replacing `settings.defaultGridSize` with a literal
// `{ cols: 100, rows: 60 }` — the hardcode Decision A and project-context.md both call a bug on
// sight — passes BattlePage.test.tsx in full. `expect(settingsLoadSpy).toHaveBeenCalled()` proves
// the READ happened, never that the result was USED, and settings.load() sits in the shared
// Promise.all for both branches, so it is called either way.
vi.mock('@/lib/newBattleDraft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/newBattleDraft')>();
  return { ...actual, createNewBattleDraft: vi.fn(actual.createNewBattleDraft) };
});

const { organisms } = createMockWorkspace();

beforeEach(async () => {
  // vi.mock is module-scoped and this project's vitest config sets no `clearMocks`, so without
  // this the spy accumulates calls across tests and `.at(-1)` reads the previous render's args.
  const { createNewBattleDraft } = await import('@/lib/newBattleDraft');
  vi.mocked(createNewBattleDraft).mockClear();
});

describe('BattlePage — the "new" route seeds at settings.defaultGridSize (AC1, Task 1)', () => {
  it('seeds at the NON-default preset when the settings record says 50x30', async () => {
    const { createNewBattleDraft } = await import('@/lib/newBattleDraft');
    const repositories = createFakeRepositories({
      organisms,
      settings: { ...DEFAULT_SETTINGS, defaultGridSize: { cols: 50, rows: 30 } },
    });

    render(<BattlePage repositories={repositories} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    await waitFor(() => expect(createNewBattleDraft).toHaveBeenCalled());
    // 50x30 specifically: the FR-3.1 default is 100x60, so a hardcoded literal would produce that
    // and this assertion is the only thing in the suite that can tell the two apart.
    expect(vi.mocked(createNewBattleDraft).mock.calls.at(-1)?.[0]).toEqual({ cols: 50, rows: 30 });
  });

  it('seeds at 100x60 when no settings record exists (the FR-3.1 default, read not hardcoded)', async () => {
    const { createNewBattleDraft } = await import('@/lib/newBattleDraft');
    const repositories = createFakeRepositories({ organisms });

    render(<BattlePage repositories={repositories} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    await waitFor(() => expect(createNewBattleDraft).toHaveBeenCalled());
    expect(vi.mocked(createNewBattleDraft).mock.calls.at(-1)?.[0]).toEqual({ cols: 100, rows: 60 });
  });
});
