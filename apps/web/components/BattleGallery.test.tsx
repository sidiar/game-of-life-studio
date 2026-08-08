import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { createFakeRepositories, createMockBattles, createMockOrganisms } from '@gol/test-utils';
import BattleGallery from './BattleGallery';

describe('BattleGallery', () => {
  // AC1, the load-bearing test: a Gallery render must never call load() or listFull(). A test
  // that only checks tiles appear passes just as well after someone adds a load() per tile to
  // fetch the grid — the spies are what actually proves "no grid deserialization" (AR-15).
  it('renders from list() only — never load() or listFull() (AC1, AR-15)', async () => {
    const battles = createMockBattles();
    const organisms = createMockOrganisms();
    const repos = createFakeRepositories({ battles, organisms });
    const loadSpy = vi.spyOn(repos.battles, 'load');
    const listFullSpy = vi.spyOn(repos.battles, 'listFull');

    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="ready" />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    });

    expect(loadSpy).not.toHaveBeenCalled();
    expect(listFullSpy).not.toHaveBeenCalled();
  });

  // AC2: three battles seeded out of order render in descending updatedAt order — asserted on the
  // rendered heading sequence, not on the array the sort helper returned.
  it('renders tiles in descending updatedAt order regardless of seed order (AC2)', async () => {
    const oldest = {
      ...createMockBattles()[0],
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      name: 'Oldest',
    };
    const newest = {
      ...createMockBattles()[0],
      id: 'aaaaaaaa-0000-4000-8000-000000000002',
      name: 'Newest',
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    const middle = {
      ...createMockBattles()[0],
      id: 'aaaaaaaa-0000-4000-8000-000000000003',
      name: 'Middle',
      updatedAt: new Date('2026-07-22T00:00:00.000Z'),
    };
    const repos = createFakeRepositories({
      battles: [oldest, newest, middle],
      organisms: createMockOrganisms(),
    });

    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="ready" />,
    );

    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual(['Newest', 'Middle', 'Oldest']);
    });
  });

  it('renders the loading body and calls neither repository while seedStatus is "seeding" (trap 1)', () => {
    const repos = createFakeRepositories({ battles: createMockBattles() });
    const battleListSpy = vi.spyOn(repos.battles, 'list');
    const organismListSpy = vi.spyOn(repos.organisms, 'list');

    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="seeding" />,
    );

    expect(screen.getByText('Loading battles…')).toBeInTheDocument();
    expect(battleListSpy).not.toHaveBeenCalled();
    expect(organismListSpy).not.toHaveBeenCalled();
  });

  it('renders the alert body when seedStatus is "error"', () => {
    const repos = createFakeRepositories();
    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="error" />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the alert body when a ready list() rejects', async () => {
    const repos = createFakeRepositories();
    vi.spyOn(repos.battles, 'list').mockRejectedValue(new Error('boom'));

    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="ready" />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('renders the placeholder line and no tile grid for zero battles', async () => {
    const repos = createFakeRepositories();
    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="ready" />,
    );

    await waitFor(() => {
      expect(screen.getByText('No battles yet.')).toBeInTheDocument();
    });
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });

  it('has no axe violations: populated, empty, and error bodies', async () => {
    const populated = createFakeRepositories({
      battles: createMockBattles(),
      organisms: createMockOrganisms(),
    });
    const { container: populatedContainer } = render(
      <BattleGallery
        battles={populated.battles}
        organisms={populated.organisms}
        seedStatus="ready"
      />,
    );
    await waitFor(() => screen.getAllByRole('heading', { level: 2 }));
    expect((await axe(populatedContainer)).violations).toEqual([]);

    const empty = createFakeRepositories();
    const { container: emptyContainer } = render(
      <BattleGallery battles={empty.battles} organisms={empty.organisms} seedStatus="ready" />,
    );
    await waitFor(() => screen.getByText('No battles yet.'));
    expect((await axe(emptyContainer)).violations).toEqual([]);

    const errored = createFakeRepositories();
    const { container: errorContainer } = render(
      <BattleGallery battles={errored.battles} organisms={errored.organisms} seedStatus="error" />,
    );
    await waitFor(() => screen.getByRole('alert'));
    expect((await axe(errorContainer)).violations).toEqual([]);
  });

  it("resolves a battle's organism roster names for the tile's dots (sanity, real data)", async () => {
    const repos = createFakeRepositories({
      battles: [createMockBattles()[1]], // Grand Colony War — 3 mocks + Conway's Classic
      organisms: [...createMockOrganisms(), CONWAYS_CLASSIC],
    });

    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="ready" />,
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: "Conway's Classic" })).toBeInTheDocument();
    });
    expect(screen.getByRole('img', { name: 'Aggressive Colonizer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Patient Defender' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Chaotic Spreader' })).toBeInTheDocument();
  });

  // A corrupt gol:organisms throws CorruptDataError for the whole key. Battles that parse fine
  // must still list — the dots degrade to the dangling-id fallback rather than the page going to
  // the error body (Story 1.4's "one bad record must not blank the view").
  it('still renders tiles when organisms.list() rejects, degrading the dots', async () => {
    const repos = createFakeRepositories({
      battles: createMockBattles(),
      organisms: createMockOrganisms(),
    });
    vi.spyOn(repos.organisms, 'list').mockRejectedValue(new Error('corrupt'));

    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="ready" />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Unknown organism' }).length).toBeGreaterThan(0);
  });

  // list() reads Object.values() and returns each record's own `id`, never the collection key, so
  // two entries can carry the same id — which would collide React keys and log a console error.
  it('renders one tile per distinct battle id when a record id is duplicated', async () => {
    const [first] = createMockBattles();
    // Seeded through `raw` because the validated path keys the store by `battle.id` and would
    // silently collapse the duplicate — the defect only exists because list() returns the record's
    // own `id` rather than the collection key, so the two must disagree here.
    const serialize = (battle: unknown) => JSON.parse(JSON.stringify(battle)) as unknown;
    const repos = createFakeRepositories({
      organisms: createMockOrganisms(),
      raw: {
        battles: {
          'collection-key-a': serialize(first),
          'collection-key-b': serialize({ ...first, name: 'Duplicate id, different name' }),
        },
      },
    });

    render(
      <BattleGallery battles={repos.battles} organisms={repos.organisms} seedStatus="ready" />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    });
  });
});
