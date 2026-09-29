import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StrictMode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';
import { MOCK_BATTLE_IDS, MOCK_ORGANISM_IDS } from '@gol/test-utils';
import HomePage from './page';

// Outside the App Router `useSearchParams()` returns null in jsdom, so it is mocked (Story 7.6).
let currentParams = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => currentParams }));

// Story 1.10 replaced the placeholder body with the real Battle Gallery. What these tests
// exercise did not change: HomePage still owns createRepositories()/useWorkspaceSeed at the page
// boundary, and this file remains the wiring proof for Vitest + RTL + jsdom +
// @vitejs/plugin-react + the @gol/domain workspace-source import path all at once.
describe('HomePage', () => {
  afterEach(() => {
    currentParams = new URLSearchParams();
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('renders the Battle Gallery heading and, once ready, the empty-workspace copy', async () => {
    render(<HomePage />);

    // Story 1.9: the h1 moved here from the shell's wordmark ("Game of Life Studio", now a
    // styled <div> in AppShell, not a heading) — this page owns the document's only <h1>.
    expect(screen.getByRole('heading', { level: 1, name: 'Battle Gallery' })).toBeInTheDocument();

    // "wired to @gol/domain (N organism fields)" is gone (Story 1.10 Task 5): a rendered tile can
    // only exist if BattleSummarySchema (@gol/domain, through @gol/persistence) parsed a stored
    // record, which is a strictly stronger proof that the package resolved to its TS source than
    // a truthiness check ever was. The "seeds the AR-45 mock fixtures" test below is that stronger
    // proof exercised for real — a fixture-seeded tile rendering by NAME.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    });
  });

  it('has no axe accessibility violations once ready', async () => {
    const { container } = render(<HomePage />);
    await waitFor(() => screen.getByRole('heading', { level: 2, name: 'No Battles Yet' }));

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
  // is the strict environment and this test is the only place that reproduces it. Retargeted
  // (Story 1.10, then 1.12) from "workspace: ready" text to the empty-Gallery heading that now
  // signals the same thing: the seed effect resolved and the Gallery's own load effect ran behind it.
  it('reaches the ready Gallery under StrictMode, and still seeds exactly once', async () => {
    render(
      <StrictMode>
        <HomePage />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(stored)).toEqual([CONWAYS_CLASSIC_ID]);
  });

  // Story 1.6 AC3, positive half, and Story 1.10 AC4: a dev build auto-seeds the AR-45 mock
  // fixtures alongside Conway's Classic, and the Gallery renders a tile for each — Grand Colony
  // War (updatedAt 2026-07-25T18:15Z) before Three-Way Skirmish (2026-07-20T09:00Z), the frozen
  // literals in mockWorkspace.ts pinned precisely so this order is reproducible. vi.stubEnv is
  // applied before render — reading NODE_ENV inside the effect (not at module scope) is what lets
  // this take effect at all (Task 4 silent-failure trap).
  it('seeds the AR-45 mock fixtures under NODE_ENV=development and renders both as tiles, most-recent first', async () => {
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

    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual(['Grand Colony War', 'Three-Way Skirmish']);
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
  // gol:organisms holding only Conway's Classic, and the Gallery renders no tiles.
  it('seeds no mock fixtures without the development stub (NODE_ENV=test)', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    });

    expect(localStorage.getItem(STORAGE_KEYS.battles)).toBeNull();
    const organisms = JSON.parse(localStorage.getItem(STORAGE_KEYS.organisms) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(organisms)).toEqual([CONWAYS_CLASSIC_ID]);
  });

  // Story 7.6 (FR-9.4). The full arrival flow is covered by PresetLinkArrival.test.tsx and e2e.
  describe('preset link', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      window.history.replaceState(null, '', '/');
    });

    const manifestText = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        'public',
        'workspaces',
        'index.json',
      ),
      'utf8',
    );

    it('an unknown ?preset= shows a dismissible alert over the untouched gallery, then Dismiss focuses the h1', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const seeded = render(<HomePage />);
      await waitFor(() => {
        expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
      });
      seeded.unmount();
      vi.unstubAllEnvs();

      const fetchSpy = vi.fn<typeof fetch>(async () => new Response(manifestText));
      vi.stubGlobal('fetch', fetchSpy);
      currentParams = new URLSearchParams('preset=nope');
      window.history.replaceState(null, '', '/?preset=nope');

      render(<HomePage />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('“nope”');
      expect(alert).toHaveTextContent('Your workspace is untouched.');
      await waitFor(() =>
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
          'Grand Colony War',
          'Three-Way Skirmish',
        ]),
      );
      // The strip ran (FD6): a reload would not re-prompt.
      expect(window.location.search).toBe('');

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    });

    it('without the param nothing is fetched', async () => {
      const fetchSpy = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
      vi.stubGlobal('fetch', fetchSpy);

      render(<HomePage />);
      await waitFor(() => screen.getByRole('heading', { level: 2, name: 'No Battles Yet' }));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
