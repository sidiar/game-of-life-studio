import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { createFakeRepositories, createMockBattles, createMockOrganisms } from '@gol/test-utils';
import BattleGallery from './BattleGallery';

// Two tests below stub IntersectionObserver and write the --gol-* token layer onto <html>. Undoing
// that in the test BODY leaks both whenever an assertion throws first: the stub's instance counter
// survives into the next test, every tile reports not-intersecting, no thumbnail loads, and the
// AC2 never-stored assertions pass VACUOUSLY. One red test would report as one red plus one green.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.cssText = '';
});

// Sets the token layer jsdom never loads (app/themes.css is not applied here), so BattleTile's
// gridColors !== null gate opens and thumbnails actually load. Returns the observer stub's class
// so a test can cap how many tiles report as visible.
function enableThumbnails({ visibleCount }: { visibleCount: number }) {
  document.documentElement.style.setProperty('--gol-bg-primary', '#0a0a0a');
  document.documentElement.style.setProperty('--gol-grid-line', 'rgb(51 51 51 / 0.3)');

  class CappedIntersectionObserver implements IntersectionObserver {
    static instancesCreated = 0;
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    private readonly shouldIntersect: boolean;
    constructor(private readonly callback: IntersectionObserverCallback) {
      this.shouldIntersect = CappedIntersectionObserver.instancesCreated < visibleCount;
      CappedIntersectionObserver.instancesCreated += 1;
    }
    observe(): void {
      if (!this.shouldIntersect) return;
      queueMicrotask(() =>
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      );
    }
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', CappedIntersectionObserver);
  return CappedIntersectionObserver;
}

// Tile counts throughout this file read `getAllByRole('article')`, never a level-2 heading count
// (Story 1.13 Task 7). "Level-2 heading count" stopped meaning "tile count" once GalleryEmptyState
// and DeleteBattleDialog started rendering their own <h2>; `article` is BattleTile's own root
// (styled('article')) and is the sound proxy, established in 1.12. The rationale lives here rather
// than beside each of the six retargeted sites, which is where it was pasted three times.
describe('BattleGallery', () => {
  // AC1/AR-15, RETARGETED (Story 1.11, conflict 1, architecture.md:274): the tile LIST is still
  // summary-derived with zero grid deserialization — listFull() is still never called, unchanged
  // assertion — but AC1's own thumbnail is M4's sanctioned on-demand load() (Decision H.4: "the
  // Decision 8 usage index builds from list() with zero grid deserialization; thumbnails stay
  // on-demand from load()"). The invariant this guard actually protects is narrower than "never
  // load()": no tile's grid is EVER read before the tile list itself has painted from list()
  // alone. In this default (unthemed) jsdom environment gridColors resolves null
  // (themeColors.test.ts), so no tile's load effect ever engages at all — proving the stronger
  // half structurally rather than by timing a race against each tile's own effect. AC4's 50-battle
  // test below is what proves load() is BOUNDED once tiles do load for real.
  it('renders from list() only — never load() or listFull() (AC1, AR-15)', async () => {
    // The token layer is SET here and the observer never fires on its own, so the thumbnail path
    // is live but held: nothing but an intersection can start a load. That is what makes the
    // ordering assertion falsifiable — under the previous form gridColors resolved null in jsdom,
    // so no tile could load at any time and `expect(loadSpy).not.toHaveBeenCalled()` was satisfied
    // by the environment rather than by the component (code review 2026-08-10).
    document.documentElement.style.setProperty('--gol-bg-primary', '#0a0a0a');
    document.documentElement.style.setProperty('--gol-grid-line', 'rgb(51 51 51 / 0.3)');

    const observers: { fire: () => void }[] = [];
    class ManualIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds: ReadonlyArray<number> = [];
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(): void {
        observers.push({
          fire: () =>
            this.callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            ),
        });
      }
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', ManualIntersectionObserver);

    const battles = createMockBattles();
    const organisms = createMockOrganisms();
    const repos = createFakeRepositories({ battles, organisms });
    const loadSpy = vi.spyOn(repos.battles, 'load');
    const listFullSpy = vi.spyOn(repos.battles, 'listFull');

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(2);
    });

    // The invariant AR-15 actually protects (Story 1.11, conflict 1, architecture.md:274): the
    // tile LIST is summary-derived, so every name/date/size/dot is on screen with zero grids
    // deserialized. A regression that loads eagerly instead of on intersection fails HERE.
    expect(loadSpy).not.toHaveBeenCalled();
    // listFull() is never called at all — unchanged from Story 1.10, and the stronger half:
    // one listFull() would Zod-validate every grid in the workspace in a single synchronous chunk.
    expect(listFullSpy).not.toHaveBeenCalled();

    // …and the path is genuinely live, not merely switched off: an intersection starts exactly the
    // M4-sanctioned on-demand load. Without this the test could pass by never wiring thumbnails.
    expect(observers.length).toBeGreaterThan(0);
    observers.forEach((o) => o.fire());
    await waitFor(() => expect(loadSpy).toHaveBeenCalled());
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
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
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
    // All THREE sources, not two: settings joined the same Promise.all in Story 1.11, and a guard
    // that spies a subset of what it claims to cover is exactly the defect the 1.10 review found
    // on this test (it then watched battles only). Every source in the gated effect gets a spy.
    const settingsLoadSpy = vi.spyOn(repos.settings, 'load');

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="seeding"
      />,
    );

    expect(screen.getByText('Loading battles…')).toBeInTheDocument();
    expect(battleListSpy).not.toHaveBeenCalled();
    expect(organismListSpy).not.toHaveBeenCalled();
    expect(settingsLoadSpy).not.toHaveBeenCalled();
  });

  it('renders the alert body when seedStatus is "error"', () => {
    const repos = createFakeRepositories();
    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="error"
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the alert body when a ready list() rejects', async () => {
    const repos = createFakeRepositories();
    vi.spyOn(repos.battles, 'list').mockRejectedValue(new Error('boom'));

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // Story 1.12: retargeted from "renders the placeholder line and no tile grid" — there is no
  // placeholder any more, GalleryEmptyState is the designed AC1 body.
  it('renders the designed empty state and no tile grid for zero battles (AC1)', async () => {
    const repos = createFakeRepositories();
    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    });
    expect(screen.getByText(/cellular battles/i)).toBeInTheDocument();
    expect(screen.getByText(/create your first battle/i)).toBeInTheDocument();
    // "no tile grid": zero rendered BattleTile roots. The empty state's own <h2> means a raw
    // `heading level 2` count of zero no longer means "no tiles", so this assertion was retargeted
    // (here, Story 1.12) to what it always meant — BattleTile's root is styled('article').
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  // AC3, both directions — but as TWO SEPARATE MOUNTS, not a live transition, and the distinction
  // is load-bearing. BattleGallery has no re-list path after mount: refresh() runs once per effect
  // run and its dep array is stable once seedStatus settles, so a mounted gallery cannot go
  // summaries.length > 0 -> 0 at all. What this test proves is that the render condition maps
  // "storage holds a battle" and "storage holds none" to the right body — which is what the
  // condition actually depends on, and all Story 1.12 was scoped to ship.
  //
  // ⚠️ Story 1.13 (delete) owns the missing edge: it has to lift refresh() out of the effect so a
  // handler can call it, and only then can the empty state genuinely REAPPEAR in a live session.
  // Until that lands, nothing here would go red if it never did — see deferred-work.md,
  // "Deferred from: code review of 1-12-gallery-empty-state".
  it('renders a tile for a stored battle and the designed empty state for none (AC3, two mounts)', async () => {
    const populated = createFakeRepositories({ battles: createMockBattles() });
    const { unmount } = render(
      <BattleGallery
        battles={populated.battles}
        organisms={populated.organisms}
        settings={populated.settings}
        seedStatus="ready"
      />,
    );

    // Exact count, not > 0: createMockBattles() ships two battles, and a regression that rendered
    // only one of them would satisfy a truthiness check. This assertion is also what establishes
    // `article` as a sound proxy for "a tile" for the zero-count assertions below and in the AC1
    // test above, so weakening it weakens those too.
    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(2);
    });
    expect(
      screen.queryByRole('heading', { level: 2, name: 'No Battles Yet' }),
    ).not.toBeInTheDocument();
    unmount();

    const empty = createFakeRepositories();
    render(
      <BattleGallery
        battles={empty.battles}
        organisms={empty.organisms}
        settings={empty.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
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
        settings={populated.settings}
        seedStatus="ready"
      />,
    );
    // A "tiles have rendered" barrier, same false invariant as the
    // count assertions above.
    await waitFor(() => screen.getAllByRole('article'));
    expect((await axe(populatedContainer)).violations).toEqual([]);

    const empty = createFakeRepositories();
    const { container: emptyContainer } = render(
      <BattleGallery
        battles={empty.battles}
        organisms={empty.organisms}
        settings={empty.settings}
        seedStatus="ready"
      />,
    );
    await waitFor(() => screen.getByRole('heading', { level: 2, name: 'No Battles Yet' }));
    expect((await axe(emptyContainer)).violations).toEqual([]);

    const errored = createFakeRepositories();
    const { container: errorContainer } = render(
      <BattleGallery
        battles={errored.battles}
        organisms={errored.organisms}
        settings={errored.settings}
        seedStatus="error"
      />,
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
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
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
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(2);
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
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(1);
    });
  });

  // AC4, the load-bearing test for conflict 2 (Task 6): 50 schema-valid battles (Decision H.1 —
  // organismIds ≡ the placed set, satisfied trivially here by an empty roster over an all-empty
  // grid, so list() does not skip a single one of them). A capped fake IntersectionObserver
  // reports only the first N tiles as intersecting, simulating the visible slice of a scrolled
  // Gallery. battles.load() is called AT MOST N times, never once per battle — an unbounded call
  // count is exactly "thumbnail rendering blocks interactivity" (NFR-1.3/7.2), and each load() call
  // re-reads and re-parses the WHOLE gol:battles collection
  // (localStorageBattleRepository.ts:29-30), so 50 eager loads would be O(n^2) main-thread work.
  it('bounds battles.load() calls to the visible slice at 50-battle scale, not one per battle (AC4)', async () => {
    // The tile's load effect gates on gridColors !== null — the helper sets the tokens inline
    // (jsdom never loads themes.css) so the effect actually engages, and caps how many tiles
    // report as intersecting. Teardown is in the file-level afterEach, never in this body: an
    // assertion that throws here must not leak the stub into the AC2 tests below.
    const VISIBLE_COUNT = 5;
    enableThumbnails({ visibleCount: VISIBLE_COUNT });

    const battleCount = 50;
    const battles = Array.from({ length: battleCount }, (_, i) => {
      const suffix = String(i).padStart(12, '0');
      return {
        id: `10000000-0000-4000-8000-${suffix}`,
        name: `Battle ${i}`,
        organismIds: [] as string[],
        gridSize: { cols: 50, rows: 30 } as const,
        gridState: Array.from({ length: 30 }, () => Array.from({ length: 50 }, () => 0)),
        createdAt: new Date(2026, 0, 1, 0, 0, i),
        updatedAt: new Date(2026, 0, 1, 0, 0, i),
      };
    });
    const repos = createFakeRepositories({ battles });
    const loadSpy = vi.spyOn(repos.battles, 'load');

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    // Every tile's heading renders — metadata is complete before any grid is deserialized.
    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(battleCount);
    });

    await waitFor(() => expect(loadSpy).toHaveBeenCalled());
    // Let every queued intersection callback and its resulting load() settle before counting.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Bounded ABOVE by the visible slice — an unbounded count is precisely "thumbnail rendering
    // blocks interactivity", and each load() re-parses the whole gol:battles collection.
    expect(loadSpy.mock.calls.length).toBeLessThanOrEqual(VISIBLE_COUNT);
    // …and bounded BELOW by it: without this, "only one tile ever loads" — or a lazy path broken
    // so thoroughly that nothing loads after the first — satisfies the cap just as well as
    // correct behaviour does. Every tile the stub reported as visible must have loaded.
    expect(loadSpy.mock.calls.length).toBe(VISIBLE_COUNT);
    expect(new Set(loadSpy.mock.calls.map(([id]) => id)).size).toBe(VISIBLE_COUNT);
  });

  // AC2, "never stored" — two assertions, because the intent is easy to satisfy accidentally and
  // easy to break silently.
  describe('AC2 — thumbnails are never stored', () => {
    it('never calls canvas.toDataURL() or canvas.toBlob() during a full Gallery render', async () => {
      // Both mock battles must actually reach a painted canvas, or this proves nothing: waiting
      // only for the headings puts the assertion in a window that structurally CANNOT contain a
      // paint — the headings appear in the same commit that mounts the tiles, while every load()
      // is still in flight and no <PetriDishCanvas> has mounted yet.
      enableThumbnails({ visibleCount: 2 });
      const toDataUrlSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
      const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');

      const repos = createFakeRepositories({
        battles: createMockBattles(),
        organisms: createMockOrganisms(),
      });
      const loadSpy = vi.spyOn(repos.battles, 'load');

      const { container } = render(
        <BattleGallery
          battles={repos.battles}
          organisms={repos.organisms}
          settings={repos.settings}
          seedStatus="ready"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByRole('article')).toHaveLength(2);
      });
      await waitFor(() => expect(loadSpy).toHaveBeenCalledTimes(2));
      // The canvases are mounted and their paint effects have run — the spies now cover a window
      // in which a stored thumbnail would actually have had to be produced.
      await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(2));

      expect(toDataUrlSpy).not.toHaveBeenCalled();
      expect(toBlobSpy).not.toHaveBeenCalled();
    });

    // The behavioural spy above proves TODAY's build never calls these APIs; this structural
    // check is the promise M4 is actually making — a future change cannot reintroduce the call
    // path without also touching source text this test reads directly off disk.
    it('never mentions toDataURL, toBlob, createImageBitmap, or localStorage in source (structural)', () => {
      const galleryDir = dirname(fileURLToPath(import.meta.url));
      const forbidden = ['toDataURL', 'toBlob', 'createImageBitmap', 'localStorage'];
      // Both halves of the thumbnail path, and they no longer sit side by side: PetriDishCanvas
      // is the SHARED render surface one level up in components/ (the Battle page uses the same
      // one — component-tree-battle-page.md §2), while BattleTile is a gallery sibling.
      for (const file of ['../PetriDishCanvas.tsx', 'BattleTile.tsx']) {
        const source = readFileSync(join(galleryDir, file), 'utf-8');
        for (const term of forbidden) {
          expect(source, `${file} must never mention ${term} (AC2/M4)`).not.toContain(term);
        }
      }
    });
  });
});

// Story 2.2 — the toolbar's "Create New Battle" CTA. Forced decision 2: it renders
// UNCONDITIONALLY, so both the populated and empty Gallery are covered below.
describe('BattleGallery — Create Battle CTA (Story 2.2)', () => {
  it('renders the toolbar CTA with href="/battle/new" in a populated Gallery', async () => {
    const repos = createFakeRepositories({ battles: createMockBattles() });
    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    expect(screen.getByRole('link', { name: '+ Create New Battle' })).toHaveAttribute(
      'href',
      '/battle/new',
    );
  });

  // Forced decision 2, proven rather than merely asserted in the Dev Notes: the empty Gallery
  // shows BOTH the toolbar CTA and GalleryEmptyState's own CTA, with distinct accessible names —
  // never the same name announced twice.
  it('renders the toolbar CTA alongside the empty-state CTA, with distinct names', async () => {
    const repos = createFakeRepositories();
    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '+ Create New Battle' })).toHaveAttribute(
      'href',
      '/battle/new',
    );
    expect(screen.getByRole('link', { name: 'Create Your First Battle' })).toHaveAttribute(
      'href',
      '/battle/new',
    );
  });

  it('renders the toolbar CTA even while loading or errored', () => {
    const seeding = createFakeRepositories();
    const { unmount } = render(
      <BattleGallery
        battles={seeding.battles}
        organisms={seeding.organisms}
        settings={seeding.settings}
        seedStatus="seeding"
      />,
    );
    expect(screen.getByRole('link', { name: '+ Create New Battle' })).toBeInTheDocument();
    unmount();

    const errored = createFakeRepositories();
    render(
      <BattleGallery
        battles={errored.battles}
        organisms={errored.organisms}
        settings={errored.settings}
        seedStatus="error"
      />,
    );
    expect(screen.getByRole('link', { name: '+ Create New Battle' })).toBeInTheDocument();
  });

  it('has no axe accessibility violations with the toolbar CTA present', async () => {
    const repos = createFakeRepositories({ battles: createMockBattles() });
    const { container } = render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

// Story 1.13 — the delete flow: dialog open/cancel/confirm, AC3's organism protection, and the
// live >0 -> 0 transition Story 1.12's review deferred to this story (deferred-work.md).
describe('BattleGallery — delete flow (Story 1.13)', () => {
  it('opens a dialog naming the clicked battle, without deleting anything yet (AC1)', async () => {
    const user = userEvent.setup();
    const [threeWay, grand] = createMockBattles();
    const repos = createFakeRepositories({
      battles: [threeWay, grand],
      organisms: createMockOrganisms(),
    });
    const deleteSpy = vi.spyOn(repos.battles, 'delete');

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));

    // Two battles seeded — proves the dialog names the CLICKED one, not a hardcoded string a
    // single-battle fixture would satisfy vacuously.
    await user.click(screen.getByRole('button', { name: `Delete ${grand.name}` }));

    const dialog = screen.getByRole('dialog', { name: 'Delete Battle?' });
    expect(within(dialog).getByText(new RegExp(grand.name))).toBeInTheDocument();
    expect(within(dialog).queryByText(new RegExp(threeWay.name))).not.toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("confirming calls battles.delete exactly once with that battle's id, and the Gallery drops to the surviving tile (AC2 confirm)", async () => {
    const user = userEvent.setup();
    const [threeWay, grand] = createMockBattles();
    const repos = createFakeRepositories({
      battles: [threeWay, grand],
      organisms: createMockOrganisms(),
    });
    const deleteSpy = vi.spyOn(repos.battles, 'delete');

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: `Delete ${grand.name}` }));
    await user.click(screen.getByRole('button', { name: 'Delete Battle' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith(grand.id);

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getByRole('heading', { level: 2, name: threeWay.name })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: grand.name })).not.toBeInTheDocument();
  });

  it('cancelling closes the dialog, never calls battles.delete, and leaves the tile count unchanged (AC2 cancel)', async () => {
    const user = userEvent.setup();
    const repos = createFakeRepositories({
      battles: createMockBattles(),
      organisms: createMockOrganisms(),
    });
    const deleteSpy = vi.spyOn(repos.battles, 'delete');

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: /^Delete /u })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('never calls organisms.delete, and the roster still resolves in full after the delete (AC3)', async () => {
    const user = userEvent.setup();
    const [threeWay, grand] = createMockBattles();
    const organisms = createMockOrganisms();
    const repos = createFakeRepositories({ battles: [threeWay, grand], organisms });
    const organismsDeleteSpy = vi.spyOn(repos.organisms, 'delete');

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: `Delete ${grand.name}` }));
    await user.click(screen.getByRole('button', { name: 'Delete Battle' }));

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(organismsDeleteSpy).not.toHaveBeenCalled();
    // Two assertions, not one: the spy alone would pass if the delete went through some other
    // path that never touched organisms at all without actually preserving the library.
    await expect(repos.organisms.list()).resolves.toHaveLength(organisms.length);
  });

  it('reappears the empty state, live, after deleting the last battle — one mounted instance, no unmount (AC4)', async () => {
    const user = userEvent.setup();
    const [threeWay] = createMockBattles();
    const repos = createFakeRepositories({ battles: [threeWay], organisms: createMockOrganisms() });

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(
      screen.queryByRole('heading', { level: 2, name: 'No Battles Yet' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Delete ${threeWay.name}` }));
    await user.click(screen.getByRole('button', { name: 'Delete Battle' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'No Battles Yet' })).toBeInTheDocument();
    });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('has no axe violations with the delete dialog open (AC5)', async () => {
    const user = userEvent.setup();
    const repos = createFakeRepositories({
      battles: createMockBattles(),
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

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: /^Delete /u })[0]);
    await screen.findByRole('dialog');

    // MUI's Dialog PORTALS to document.body, so render()'s own `container` never contains it —
    // scope the axe run to document.body, not container (Story 1.12 review "tests that cannot
    // fail" pattern).
    //
    // ⚠️ This run does NOT measure aria-hidden-focus, despite what this comment claimed before the
    // 2026-08-14 review. axe honours `inert` and skips the subtree entirely, so once
    // useInertBackground has run the background is outside the scan and the rule cannot fire here
    // whether the hook is correct or not. The hook's mechanism is asserted directly instead —
    // structurally in the test below, and in a real browser by e2e/deleteBattle.spec.ts's
    // `closest('[inert]')` and Tab-cycle checks. What this run still covers is everything else the
    // OPEN DIALOG contributes: its roles, its labelling, and its own colour contrast.
    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });

  // The assertion the axe run above cannot make. Not a colour or layout check — purely structural,
  // which is exactly what jsdom can prove: every background element MUI marked aria-hidden must
  // also be inert, so the "hidden from assistive tech" claim and "reachable by Tab" cannot diverge.
  it('makes every aria-hidden background sibling inert while the dialog is open', async () => {
    const user = userEvent.setup();
    const repos = createFakeRepositories({
      battles: createMockBattles(),
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

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: /^Delete /u })[0]);
    await screen.findByRole('dialog');

    const hidden = Array.from(document.body.children).filter(
      (el) => el.getAttribute('aria-hidden') === 'true',
    );
    // Guards the guard: if MUI ever stops aria-hiding siblings, an empty list would make the
    // every() below vacuously true.
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((el) => (el as HTMLElement).inert)).toBe(true);
  });

  // MUI keeps the dialog's children mounted for the whole exit transition. Clearing the battle
  // name at close time (rather than at onExited, which is what <BattleGallery> now waits for) put
  // a visible `“” will be permanently deleted.` on screen for those frames — on EVERY close, both
  // cancel and confirm (code review 2026-08-14).
  it('keeps the battle name in the dialog body for the whole close transition', async () => {
    const user = userEvent.setup();
    const repos = createFakeRepositories({
      battles: createMockBattles(),
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

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    const trigger = screen.getAllByRole('button', { name: /^Delete /u })[0];
    const battleName = trigger.getAttribute('aria-label')?.replace(/^Delete /, '') ?? '';
    expect(battleName).not.toBe('');

    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(battleName);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Mid-transition: still mounted, still naming the battle. The empty-quote form must never
    // appear at any point in the close.
    expect(dialog).toHaveTextContent(battleName);
    expect(dialog).not.toHaveTextContent('“”');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // Silent-failure trap 1, finally guarded (code review 2026-08-14). Task 5's falsification (a)
  // — moving reload() ahead of `await battles.delete(id)` — stayed GREEN against the whole suite,
  // because createFakeRepositories' synchronous store lets the reordered delete finish before any
  // waitFor barrier can observe the difference. Holding the delete promise open is what makes the
  // ordering observable: with the reordering in place, list() is called during the click instead
  // of after the resolve, and the assertion below goes red.
  it('re-lists only after battles.delete() resolves, never before', async () => {
    const user = userEvent.setup();
    const repos = createFakeRepositories({
      battles: createMockBattles(),
      organisms: createMockOrganisms(),
    });

    let resolveDelete: (() => void) | undefined;
    const deleteSpy = vi.spyOn(repos.battles, 'delete').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = () => resolve();
        }),
    );

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));

    // Spied only now, so the mount's own list() call is not in the count.
    const listSpy = vi.spyOn(repos.battles, 'list');

    await user.click(screen.getAllByRole('button', { name: /^Delete /u })[0]);
    await user.click(screen.getByRole('button', { name: 'Delete Battle' }));

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(listSpy).not.toHaveBeenCalled();

    resolveDelete?.();
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));
  });

  it('Escape closes the dialog without deleting anything', async () => {
    const user = userEvent.setup();
    const repos = createFakeRepositories({
      battles: createMockBattles(),
      organisms: createMockOrganisms(),
    });
    const deleteSpy = vi.spyOn(repos.battles, 'delete');

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: /^Delete /u })[0]);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('a rejecting delete closes the dialog and renders the alert body', async () => {
    const user = userEvent.setup();
    const repos = createFakeRepositories({
      battles: createMockBattles(),
      organisms: createMockOrganisms(),
    });
    vi.spyOn(repos.battles, 'delete').mockRejectedValue(new Error('boom'));

    render(
      <BattleGallery
        battles={repos.battles}
        organisms={repos.organisms}
        settings={repos.settings}
        seedStatus="ready"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: /^Delete /u })[0]);
    await user.click(screen.getByRole('button', { name: 'Delete Battle' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
