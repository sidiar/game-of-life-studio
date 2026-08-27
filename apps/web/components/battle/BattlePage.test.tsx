import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC, DEFAULT_SETTINGS, type Battle, type Organism } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import { RecordingContext2D } from '@/lib/recordingContext2d';
import { computeGridLayout } from '@/lib/canvas/gridLayout';
import { resetRefToFillGroupWarnings } from '@/lib/canvas/refToFillGroup';
import BattlePage from './BattlePage';

const { battles, organisms } = createMockWorkspace();
const SKIRMISH = battles.find((b) => b.id === MOCK_BATTLE_IDS.battleA) as Battle;

// jsdom never loads themes.css, so `readGridColors` resolves null and <BattleEditorView> renders
// the dish BOX with no canvas inside (Task 6's degradation) unless a test writes the --gol-*
// tokens onto <html> itself — the same workaround BattleGallery.test.tsx establishes for the
// identical gate on BattleTile's thumbnail.
function enableCanvasRendering() {
  document.documentElement.style.setProperty('--gol-bg-primary', '#0a0a0a');
  document.documentElement.style.setProperty('--gol-grid-line', 'rgb(51 51 51 / 0.3)');
}

// Real (unmocked) jsdom's `getContext('2d')` always returns null (no native `canvas` package —
// recordingContext2d.ts's own doc comment), which is enough to prove a canvas is PRESENT but
// nothing about what it painted. Gives every canvas its own `RecordingContext2D` (keyed by
// identity, like `installRecordingContexts`'s `offscreen: true` mode) so the very first mount
// paints for real — no forced-rerender trick needed, and the MAIN canvas's own recording is
// retrievable afterwards via `contextsByCanvas.get(mainCanvas)`.
function installPerCanvasRecording(): Map<HTMLCanvasElement, RecordingContext2D> {
  const contextsByCanvas = new Map<HTMLCanvasElement, RecordingContext2D>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    let ctx = contextsByCanvas.get(this);
    if (ctx === undefined) {
      ctx = new RecordingContext2D();
      contextsByCanvas.set(this, ctx);
    }
    return ctx as unknown as CanvasRenderingContext2D;
  });
  return contextsByCanvas;
}

afterEach(() => {
  document.documentElement.style.cssText = '';
  vi.restoreAllMocks();
  // The dangling-roster-id registry is a module singleton vi.restoreAllMocks() does not touch —
  // without this, a "warns once" claim silently depends on test order (refToFillGroup.ts).
  resetRefToFillGroupWarnings();
});

// jsdom performs no layout, so getBoundingClientRect() is all zeros — which pointerToCell
// correctly maps to "no cell", making every click a no-op. Stubbing the rect to the canvas's own
// backing-store box (jsdom's default 300x150, which GridRenderer keeps because clientWidth is 0)
// gives the component real geometry at scale 1.
function stubCanvasRect(canvas: HTMLCanvasElement): void {
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: canvas.width,
    height: canvas.height,
    right: canvas.width,
    bottom: canvas.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

/** The client coordinate of the centre of cell (col, row), derived from the real auto-fit math. */
function centreOfCell(
  canvas: HTMLCanvasElement,
  size: { cols: number; rows: number },
  col: number,
  row: number,
  showGridLines = DEFAULT_SETTINGS.gridLines,
) {
  const { cellSize, originX, originY } = computeGridLayout(canvas, size, showGridLines);
  return {
    clientX: originX + col * cellSize + cellSize / 2,
    clientY: originY + row * cellSize + cellSize / 2,
    button: 0,
    isPrimary: true,
  };
}

/**
 * Story 2.6: a click is the degenerate stroke — pointer-DOWN paints, pointer-UP commits (trap 2).
 * Every "click" fixture below now needs both events, at the SAME point, to close the gesture:
 * without the up, `strokeRef` stays open and a later pointer-down at a DIFFERENT cell would be
 * rejected outright by AC7's "one stroke at a time" guard, rather than opening a new click.
 */
function click(canvas: HTMLCanvasElement, at: ReturnType<typeof centreOfCell>): void {
  fireEvent.pointerDown(canvas, at);
  fireEvent.pointerUp(canvas, at);
}

// Always the real factory from @gol/test-utils — a hand-rolled fake in a test file is what the
// shared fixtures exist to prevent (project-context, Testing rules).
function seeded(overrides: readonly Battle[] = battles): AppRepositories {
  return createFakeRepositories({ battles: overrides, organisms });
}

// A repository whose battle load rejects. Built by REPLACING one method on a real fake rather
// than hand-rolling the interface, so the other 20-odd methods keep their real contracts.
function withFailingBattleLoad(): AppRepositories {
  const repositories = seeded();
  return {
    ...repositories,
    battles: {
      ...repositories.battles,
      load: () => Promise.reject(new Error('storage is damaged')),
    },
  };
}

// A repository whose ORGANISM list rejects while the battle itself is perfectly readable. The
// page loads both through one Promise.all, so this is the only way to reach the error status
// without the battle being at fault.
function withFailingOrganismList(): AppRepositories {
  const repositories = seeded();
  return {
    ...repositories,
    organisms: {
      ...repositories.organisms,
      list: () => Promise.reject(new Error('gol:organisms is corrupt')),
    },
  };
}

// A repository whose SETTINGS load rejects (a corrupt gol:settings record). Built by replacing
// one method on a real fake, same pattern as the two helpers above — never a hand-rolled fake.
function withFailingSettingsLoad(): AppRepositories {
  const repositories = seeded();
  return {
    ...repositories,
    settings: {
      ...repositories.settings,
      load: () => Promise.reject(new Error('gol:settings is corrupt')),
    },
  };
}

describe('BattlePage', () => {
  it('loads the battle through the injected repositories and shows its title', async () => {
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading battle…');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('also loads the organism library (AC1), so the roster is in hand before Story 2.9 needs it', async () => {
    const repositories = seeded();
    const listSpy = vi.spyOn(repositories.organisms, 'list');

    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(listSpy).toHaveBeenCalled();
  });

  it('falls back to "Untitled Battle" for a battle with a blank name', async () => {
    const untitled: Battle = { ...SKIRMISH, name: '   ' };

    render(<BattlePage repositories={seeded([untitled])} battleId={untitled.id} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' }),
    ).toBeInTheDocument();
  });

  // AC4's failure half: distinct from both the loading state and the not-found state, and it
  // offers the way back that AC4 requires.
  it('renders the error body with a link back to the Gallery when the load rejects', async () => {
    render(<BattlePage repositories={withFailingBattleLoad()} battleId={SKIRMISH.id} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something Went Wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Gallery' })).toHaveAttribute('href', '/');
  });

  // The third terminal state. A `ready` resource holding `null` is NOT "still loading" — the
  // intuitive `if (!data) return <Loading/>` spins here forever, silently, on every stale link.
  it('renders a not-found body — never the spinner — for an id no battle matches', async () => {
    render(<BattlePage repositories={seeded()} battleId="ffffffff-0000-4000-8000-000000000000" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Battle Not Found' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Gallery' })).toHaveAttribute('href', '/');
  });

  // A missing or empty ?id= arrives here as the empty string. It is the not-found branch, not a
  // crash and not an infinite spinner.
  it('treats an empty id as not-found rather than crashing', async () => {
    render(<BattlePage repositories={seeded()} battleId="" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Battle Not Found' }),
    ).toBeInTheDocument();
  });

  // Not-found and error must not share copy: "gone" and "broken" are different facts.
  it('gives not-found and failure distinct headings', async () => {
    const notFound = render(<BattlePage repositories={seeded()} battleId="missing" />);
    const notFoundHeading = (await notFound.findByRole('heading', { level: 1 })).textContent;
    notFound.unmount();

    const failed = render(
      <BattlePage repositories={withFailingBattleLoad()} battleId={SKIRMISH.id} />,
    );
    const failedHeading = (await failed.findByRole('heading', { level: 1 })).textContent;

    expect(notFoundHeading).not.toBe(failedHeading);
  });

  // battleId === 'new' must never reach battles.load(): 'new' is not an id, and a repository miss
  // would render "this battle is gone" for the create route. Story 2.2 seeds a fresh draft
  // instead — forced decision 3 drops the Back-to-Gallery link for symmetry with the loaded
  // branch, which has never had one (deferred-work.md, owned by Story 2.16).
  it('never calls battles.load for the "new" route, and renders the seeded battle title', async () => {
    const repositories = seeded();
    const loadSpy = vi.spyOn(repositories.battles, 'load');

    render(<BattlePage repositories={repositories} battleId="new" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' }),
    ).toBeInTheDocument();
    expect(loadSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Back to Gallery' })).not.toBeInTheDocument();
  });

  // AC1/Task 1: the default preset is READ, never hardcoded — the settings repository is
  // consulted for every 'new' render, not just assumed.
  it('consults the settings repository for the "new" route (Task 1)', async () => {
    const repositories = seeded();
    const settingsLoadSpy = vi.spyOn(repositories.settings, 'load');

    render(<BattlePage repositories={repositories} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    expect(settingsLoadSpy).toHaveBeenCalled();
  });

  // A corrupt gol:settings record must not blank the create route (Task 1's silent-failure trap):
  // settings.load().catch(() => DEFAULT_SETTINGS) is the same degrade BattleGallery.tsx already
  // uses, so the seeded battle still renders rather than falling into the error body.
  //
  // ⚠️ This test alone does NOT pin the .catch(): the 'new' branch is checked before 'error' and
  // independently falls back with `resource.data?.settings ?? DEFAULT_SETTINGS`, so it stays green
  // with the .catch() deleted. The LOADED-route test below is the one that actually holds it.
  it('still renders the seeded battle when settings.load() rejects', async () => {
    render(<BattlePage repositories={withFailingSettingsLoad()} battleId="new" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' }),
    ).toBeInTheDocument();
  });

  // Where the .catch() is the ONLY guard. A real battle id has no 'new'-branch fallback in front
  // of it, so an uncaught settings rejection takes the shared Promise.all down and the page shows
  // "its stored data may be damaged" about a battle that loaded perfectly. Delete the .catch() in
  // BattlePage.tsx and this test goes red — which is what makes the degrade falsifiable.
  it('still renders a loaded battle when settings.load() rejects', async () => {
    render(<BattlePage repositories={withFailingSettingsLoad()} battleId={SKIRMISH.id} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stored data may be damaged/i)).not.toBeInTheDocument();
  });

  // Branch ORDER regression (Story 2.1 review). /battle/new describes no stored battle, yet it
  // still awaits organisms.list() in the shared Promise.all. With the error branch checked first,
  // a corrupt organism record made the create route claim a nonexistent battle's data was damaged
  // — the wrong fact about the wrong record, which is exactly what the not-found branch exists to
  // avoid. Asserting the heading is not enough on its own: assert the failure copy is absent too,
  // so re-swapping the branches fails here rather than silently passing on a substring.
  it('renders the seeded "new" battle even when the organism library fails to load', async () => {
    render(<BattlePage repositories={withFailingOrganismList()} battleId="new" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stored data may be damaged/i)).not.toBeInTheDocument();
  });

  // AC2/NFR-4.1 on the create route specifically, mirroring the loaded-route assertion below.
  // Story 2.7 adds the first real buttons on this route (the provisional tool toggle's Draw/
  // Erase pair) — updated from "zero buttons" to "exactly those two, nothing else", the same
  // shape a canvas-free skeleton must hold.
  it('renders exactly the tool toggle’s two buttons and one heading on the "new" route', async () => {
    render(<BattlePage repositories={seeded()} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erase' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(2);
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // The other half of the same ordering: a real battle id with a corrupt organism library DOES
  // still reach the failure body. Deliberate for this story (AC4 wants one distinct failure
  // state; nothing renders the roster yet) and tracked in deferred-work.md for Story 2.9 — pinned
  // here so the deferral is visible rather than assumed.
  it('still shows the failure body when a real battle id meets a corrupt organism library', async () => {
    render(<BattlePage repositories={withFailingOrganismList()} battleId={SKIRMISH.id} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something Went Wrong' }),
    ).toBeInTheDocument();
  });

  // AC2 / NFR-4.1 as a COUNT, not a presence check: `queryByRole('button', { name: /run/i })`
  // being null still passes after someone adds a dead RUN button labelled differently, or a
  // fullscreen button beside it. Story 2.7 puts the route's first two buttons on it (the
  // provisional tool toggle's Draw/Erase) — the claim updates to "exactly those two", not back
  // to zero, so a THIRD button (Run, fullscreen, or anything else) still fails this test.
  it('renders no Run, fullscreen, or any other button beyond the tool toggle on the loaded route', async () => {
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
    // review (2026-08-27): the two expected buttons are NAMED here, matching the sibling "new"
    // route test above. A bare length-2 check is satisfied by a dead control replacing one of
    // them, which is exactly the substitution this count was written to catch.
    expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erase' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(2);
    // Exactly one <h1>: the battle title. The battle route drops AppShell, so nothing else on it
    // competes for the document heading, and nothing automated enforces that but this line.
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // App Router enables StrictMode in dev, so double-invoked effects are the default environment.
  // The hook has no run-once guard by design — this asserts the user-visible outcome (one title,
  // settled) rather than a call count the hook deliberately does not promise.
  it('settles to a single rendered battle under StrictMode', async () => {
    render(
      <StrictMode>
        <BattlePage repositories={seeded()} battleId={SKIRMISH.id} />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 1, name: 'Three-Way Skirmish' })).toHaveLength(
        1,
      ),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // The established pattern: the matcher is deliberately not wired (vitest.setup.ts), so the
  // violations array is asserted directly.
  it('has no axe accessibility violations once the battle is loaded', async () => {
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe accessibility violations in the not-found state', async () => {
    const { container } = render(<BattlePage repositories={seeded()} battleId="missing" />);
    await screen.findByRole('heading', { level: 1, name: 'Battle Not Found' });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Task 9 (AC1): a canvas mounts on BOTH battle routes, not just the loaded one.
  it('mounts a canvas on the loaded battle route', async () => {
    enableCanvasRendering();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute('role', 'img');
  });

  it('mounts a canvas on the /battle/new route', async () => {
    enableCanvasRendering();
    const { container } = render(<BattlePage repositories={seeded()} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute('role', 'img');
  });

  // Task 6: showGridLines is READ from the loaded settings, not hardcoded (FR-8.7). Proven through
  // an actual paint: real jsdom's getContext('2d') always returns null (no canvas package), which
  // is enough to prove a canvas is present but nothing about what it painted — so this installs a
  // recording double PER canvas (main + GridRenderer's offscreen grid-line overlay) before the
  // very first mount. SKIRMISH is 50x30 against jsdom's default 300x150 canvas box: cellSize =
  // min(300/50, 150/30) = 5, clearing MIN_GRID_LINE_CELL_SIZE(4) — grid lines are legible here.
  it('paints grid lines when settings.gridLines is true, and none when it is false (FR-8.7)', async () => {
    const contextsByCanvas = installPerCanvasRecording();
    enableCanvasRendering();

    const linesOn = render(
      <BattlePage
        repositories={createFakeRepositories({
          battles: [SKIRMISH],
          organisms,
          settings: { ...DEFAULT_SETTINGS, gridLines: true },
        })}
        battleId={SKIRMISH.id}
      />,
    );
    await linesOn.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    const canvasOn = linesOn.container.querySelector('canvas') as HTMLCanvasElement;
    const recordingOn = contextsByCanvas.get(canvasOn);
    linesOn.unmount();

    const linesOff = render(
      <BattlePage
        repositories={createFakeRepositories({
          battles: [SKIRMISH],
          organisms,
          settings: { ...DEFAULT_SETTINGS, gridLines: false },
        })}
        battleId={SKIRMISH.id}
      />,
    );
    await linesOff.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    const canvasOff = linesOff.container.querySelector('canvas') as HTMLCanvasElement;
    const recordingOff = contextsByCanvas.get(canvasOff);

    // paintGridLines() draws the overlay via drawImage on the MAIN canvas's context whenever the
    // layout says lines are visible, and is a total no-op (no drawImage call at all) when they are
    // not — GridRenderer never falls back to direct fillRect line-drawing here because the
    // recording double makes the offscreen overlay canvas succeed, unlike real jsdom.
    expect(recordingOn?.calls.some((c) => c.op === 'drawImage')).toBe(true);
    expect(recordingOff?.calls.some((c) => c.op === 'drawImage')).toBe(false);
  });

  // AC7 / deferred-work.md:179: the grid the canvas is given must be HELD state with one stable
  // identity per load, not rebuilt in the render body. A rebuild-per-render bug would give
  // `palette` (built by the SAME `toThumbnailSource` memo as `grid`) a fresh identity on every
  // render, which the retained EditDish would notice by attempting a SECOND renderer construction
  // — a second getContext() call — on a rerender that changed nothing relevant.
  it('keeps the grid/palette identity stable across an unrelated rerender (AC7)', async () => {
    enableCanvasRendering();
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const repositories = seeded();

    const { rerender } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    const callsAfterMount = getContextSpy.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0); // the construction effect attempted at least once

    // Same repositories reference, same battleId — nothing that should change the seeded draft,
    // the grid, or the palette. React still re-invokes the component body (it is not memoized).
    rerender(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);

    expect(getContextSpy.mock.calls.length).toBe(callsAfterMount);

    // Story 2.5 (trap 4) extends the same claim across a COMMIT. `rosterIds` and `palette` are
    // now derived values feeding EditDish's construction deps `[size, palette, colors]`; if either
    // is rebuilt inline in the render body, the grid commit below throws away the retained
    // renderer, the grid-line overlay and — critically — the dirty baseline AC2 depends on, then
    // full-repaints. A second construction is a second getContext() call.
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    stubCanvasRect(canvas);
    click(canvas, centreOfCell(canvas, SKIRMISH.gridSize, 2, 2));
    rerender(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);

    expect(getContextSpy.mock.calls.length).toBe(callsAfterMount);
  });

  // ⚠️ Trap 2. Every hook in <BattlePage> precedes four early returns, so the grid state is
  // declared on a render where the resource has NOT settled and `seedGrid` is still null.
  // `useState(seedGrid)` would capture that null forever — a permanently blank editor with no
  // error anywhere, and every existing test still green because a canvas would still mount. The
  // seed is therefore held separately from the edit (`editedGrid ?? seedGrid`); this asserts the
  // observable consequence: the resource resolves AFTER the first render and the dish still
  // paints the loaded battle's contents.
  it('paints the seeded grid for a resource that resolves after the first render (trap 2)', async () => {
    const contextsByCanvas = installPerCanvasRecording();
    enableCanvasRendering();

    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    // The first render is the loading state — nothing has been seeded yet at this point.
    expect(screen.getByRole('status')).toHaveTextContent('Loading battle…');

    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    const recording = contextsByCanvas.get(canvas) as RecordingContext2D;

    // Three-Way Skirmish places three organisms, so a grid that actually arrived paints more than
    // the background. An all-empty grid (the captured-null failure) writes exactly one fillStyle.
    expect(new Set(recording.fillStyleWrites.map(String)).size).toBeGreaterThan(1);
  });

  // Task 7 / deferred-work.md:183: a corrupt gol:organisms record must not silently override the
  // user's actual default grid size on /battle/new. The aria-label EditDish carries names the
  // grid's own dimensions (Story 2.4), so this reads the seeded size straight off the DOM rather
  // than reaching into React internals.
  it('does not change the seeded grid size on /battle/new when the organism library fails to load (Task 7)', async () => {
    enableCanvasRendering();
    const repositories = seeded();
    const nonDefaultSettings = {
      ...DEFAULT_SETTINGS,
      defaultGridSize: { cols: 50, rows: 30 } as const,
    };
    const withCustomSettings: AppRepositories = {
      ...repositories,
      settings: {
        ...repositories.settings,
        load: () => Promise.resolve(nonDefaultSettings),
      },
      organisms: {
        ...repositories.organisms,
        list: () => Promise.reject(new Error('gol:organisms is corrupt')),
      },
    };

    const { container } = render(<BattlePage repositories={withCustomSettings} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    const canvas = container.querySelector('canvas');
    // DEFAULT_SETTINGS.defaultGridSize is 100x60 (settingsSchema.ts) — if the corrupt organism
    // record discarded the settings value that loaded perfectly, the dish would seed at that
    // default instead of the user's real 50x30 preference.
    expect(canvas).toHaveAccessibleName('Petri dish, 50 by 30 cells');
  });
});

// Click placement wiring (Story 2.5, AC1/AC4/AC6). <BattlePage> holds the grid, owns the roster
// union, and builds the palette over it — the three things that make a click actually land.
describe('BattlePage — click placement wiring (Story 2.5)', () => {
  // Conway's Classic is absent from createMockWorkspace() (trap 6) while production always has it
  // (M9: protected, re-seeded after import). Seed it explicitly so these tests exercise the real
  // colour path rather than buildRefToFillGroup's dangling-id fallback.
  const ORGANISMS_WITH_CONWAY: readonly Organism[] = [...organisms, CONWAYS_CLASSIC];
  const NEW_ROUTE_SIZE = DEFAULT_SETTINGS.defaultGridSize;

  async function renderNewRoute() {
    const contextsByCanvas = installPerCanvasRecording();
    enableCanvasRendering();
    const view = render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms: ORGANISMS_WITH_CONWAY })}
        battleId="new"
      />,
    );
    await view.findByRole('heading', { level: 1, name: 'Untitled Battle' });
    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
    stubCanvasRect(canvas);
    return { ...view, canvas, recording: contextsByCanvas.get(canvas) as RecordingContext2D };
  }

  // ⚠️ Trap 3, and the reason AC6 exists. On /battle/new `draft.organismIds` is EMPTY. A palette
  // built from it has size 1, so the ref 1 the click writes is out of range — `colourStateAt`
  // folds it to EMPTY_COLOUR_STATE with only a warn-once, `selectDirtyCells` finds nothing
  // changed, and the context is never touched: the click appears to do nothing, with no error, no
  // throw, and a fully green suite. The palette must come from the roster UNION.
  it('paints a placed organism on /battle/new, where the battle roster is empty (AC6)', async () => {
    const { canvas, recording } = await renderNewRoute();
    const opsBefore = recording.calls.length;
    const fillsBefore = recording.fillStyleWrites.length;

    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 10, 10));

    expect(recording.calls.length).toBeGreaterThan(opsBefore);
    const clickFills = recording.fillStyleWrites.slice(fillsBefore);
    // A repaint that only ever restored the background would mean the cell resolved to EMPTY.
    const backgroundish = new Set([
      document.documentElement.style.getPropertyValue('--gol-bg-primary'),
      document.documentElement.style.getPropertyValue('--gol-grid-line'),
    ]);
    expect(clickFills.some((fill) => !backgroundish.has(String(fill)))).toBe(true);
  });

  // ⚠️ THE held-state assertion. A second click on the SAME cell can only be a no-op if the first
  // commit was actually held and handed back down as the live grid; against a grid rebuilt from
  // the draft every render, the cell would still read empty and the click would repaint again.
  it('holds a committed grid: re-clicking the same cell is a no-op, another cell still paints', async () => {
    const { canvas, recording } = await renderNewRoute();

    const first = centreOfCell(canvas, NEW_ROUTE_SIZE, 10, 10);
    const second = centreOfCell(canvas, NEW_ROUTE_SIZE, 20, 12);

    click(canvas, first);
    const afterFirst = recording.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    click(canvas, first); // redundant — AC7, all the way through the page
    expect(recording.calls.length).toBe(afterFirst);

    click(canvas, second);
    const afterSecond = recording.calls.length;
    expect(afterSecond).toBeGreaterThan(afterFirst);

    // …and the FIRST cell is still occupied after the second commit: re-clicking it is still a
    // no-op. A commit that replaced rather than accumulated would have cleared it.
    click(canvas, first);
    expect(recording.calls.length).toBe(afterSecond);
  });

  // The same claim on a LOADED battle, where the roster is non-empty and `toDraft()` hands out the
  // stored record's own arrays. The click must never write through them (trap 5).
  it('places into a loaded battle without mutating the stored record', async () => {
    installPerCanvasRecording();
    enableCanvasRendering();
    const storedGridState = SKIRMISH.gridState;
    const storedRoster = SKIRMISH.organismIds;
    const beforeGrid = JSON.stringify(storedGridState);
    const beforeRoster = [...storedRoster];

    const { container } = render(
      <BattlePage
        repositories={createFakeRepositories({
          battles: [SKIRMISH],
          organisms: ORGANISMS_WITH_CONWAY,
        })}
        battleId={SKIRMISH.id}
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    stubCanvasRect(canvas);

    click(canvas, centreOfCell(canvas, SKIRMISH.gridSize, 4, 4));

    expect(JSON.stringify(storedGridState)).toBe(beforeGrid);
    expect([...storedRoster]).toEqual(beforeRoster);
  });

  // AC5, read off the DOM rather than out of React internals: the default tool is Conway's
  // Classic, so the ref written is Conway's index in the ROSTER UNION plus one. Three-Way
  // Skirmish's own roster does not contain Conway, so the union appends it — placing at ref
  // organismIds.length + 1, a ref the palette must also cover.
  it('appends the session organism to the roster union rather than reusing an existing ref', async () => {
    installPerCanvasRecording();
    enableCanvasRendering();
    const withoutConway = SKIRMISH.organismIds.filter((id) => id !== CONWAYS_CLASSIC.id);
    const battle: Battle = { ...SKIRMISH, organismIds: withoutConway };

    const { container } = render(
      <BattlePage
        repositories={createFakeRepositories({
          battles: [battle],
          organisms: ORGANISMS_WITH_CONWAY,
        })}
        battleId={battle.id}
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    stubCanvasRect(canvas);

    const recording = (
      vi.mocked(HTMLCanvasElement.prototype.getContext).mock.results[0] as {
        value: RecordingContext2D;
      }
    ).value;

    // A cell that is empty in the stored grid, so the placement definitely changes it.
    const emptyCell = findEmptyCell(battle.gridState);
    const at = centreOfCell(canvas, battle.gridSize, emptyCell.col, emptyCell.row);

    // The DELTA around the first click, not the running total — the mount's own full paint is
    // already in `calls` and would make a "greater than zero" check vacuous. A palette built from
    // `battle.organismIds` alone leaves the appended session ref out of range, `colourStateAt`
    // folds it to EMPTY, and this delta is 0.
    const beforeClick = recording.calls.length;
    click(canvas, at);
    const afterFirst = recording.calls.length;
    expect(afterFirst).toBeGreaterThan(beforeClick);

    // Re-clicking is a no-op only if the first click actually placed the session organism there.
    click(canvas, at);
    expect(recording.calls.length).toBe(afterFirst);
  });
});

function findEmptyCell(gridState: readonly (readonly number[])[]): { col: number; row: number } {
  for (let row = 0; row < gridState.length; row++) {
    for (let col = 0; col < gridState[row].length; col++) {
      if (gridState[row][col] === 0) return { col, row };
    }
  }
  throw new Error('fixture has no empty cell');
}
