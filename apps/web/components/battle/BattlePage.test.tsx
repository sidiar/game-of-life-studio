import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import {
  BattleSchema,
  CONWAYS_CLASSIC,
  DEFAULT_SETTINGS,
  MAX_BATTLE_NAME_LENGTH,
  type Battle,
  type Organism,
} from '@gol/domain';
import { CorruptDataError, QuotaExceededError, type AppRepositories } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import { RecordingContext2D } from '@/test-support/recordingContext2d';
import { computeGridLayout } from '@/lib/canvas/gridLayout';
import { resetRefToFillGroupWarnings } from '@/lib/canvas/refToFillGroup';
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
// test-support/recordingContext2d.ts's own doc comment), which is enough to prove a canvas is PRESENT but
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

/**
 * The heading resolving does NOT mean the editor's construction effect has flushed — the canvas
 * mounts in the same commit, but its passive effect (the `getContext` call that registers a
 * recording double) runs afterwards, and under CPU contention the gap is observable.
 *
 * deferred-work.md (Story 2.7 review) measured the resulting flake at ~1 failure in 6-10 parallel
 * runs, on `main` as well as on the branch, and named the fix: drop the unsafe `as` casts and
 * `waitFor` the context to be registered. The casts were the reason the flake surfaced as
 * `TypeError: Cannot read properties of undefined` rather than a legible failure. The entry
 * assigned this to "the next story that touches BattlePage.test.tsx"; Story 2.8 is that story.
 */
async function findEditorCanvas(container: HTMLElement): Promise<HTMLCanvasElement> {
  return await waitFor(() => {
    const canvas = container.querySelector('canvas');
    if (canvas === null) throw new Error('no canvas mounted yet');
    return canvas;
  });
}

async function findRecording(
  contextsByCanvas: Map<HTMLCanvasElement, RecordingContext2D>,
  canvas: HTMLCanvasElement,
): Promise<RecordingContext2D> {
  return await waitFor(() => {
    const recording = contextsByCanvas.get(canvas);
    if (recording === undefined) throw new Error('the construction effect has not run yet');
    return recording;
  });
}

afterEach(() => {
  document.documentElement.style.cssText = '';
  vi.restoreAllMocks();
  // The router mock is a module-scoped `vi.fn()` that outlives each test, so without this a Back
  // assertion reads the PREVIOUS test's navigation. `mockReset`, not `mockClear`: one test below
  // gives `push` an implementation (to observe save-then-navigate ORDER), and
  // `vi.restoreAllMocks()` above only restores `vi.spyOn` spies — it leaves a `vi.fn()`'s
  // implementation in place.
  router.push.mockReset();
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

// A repository whose ORGANISM list rejects while the battle itself is perfectly readable — the
// only way to reach the organism resource's error status without the battle being at fault.
// Story 2.9: the two are separate `useAsyncResource` calls now, so this no longer takes the
// battle down with it (AC6) and instead drives the degraded roster (AC7).
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
  // Story 2.9: the provisional Draw/Erase toggle is gone (AC3) and the sidebar's roster is what
  // replaced it — a battle with nothing placed seeds the default tool's organism (forced decision
  // 4), so the create route carries exactly one roster row, the eraser, and UNDO. The status bar
  // sits OUTSIDE the `colors !== null` guard, so it renders here even though no canvas does: undo
  // acts on grid state, and a missing theme token layer is no reason to withhold it.
  it('renders exactly the roster row, the eraser, UNDO, SAVE, CLEAR, BACK, and one heading on the "new" route', async () => {
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms: ORGANISMS_WITH_CONWAY })}
        battleId="new"
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    expect(screen.queryByRole('button', { name: 'Draw' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Erase' })).toBeNull();
    expect(screen.getByRole('button', { name: CONWAYS_CLASSIC.name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eraser' })).toBeInTheDocument();
    // A freshly seeded battle has nothing to undo (AC8: the seed is not a ring entry).
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    // Story 2.13: and nothing to save either — `/battle/new` starts CLEAN. A draft the user has
    // not touched is not unsaved work, and offering to write it would put an "Untitled Battle"
    // with an empty grid in the Gallery for every visit to this route.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Story 2.15 (AC3): the grid is empty, so CLEAR renders but disabled — nothing to clear.
    expect(screen.getByRole('button', { name: /clear petri dish/i })).toBeDisabled();
    // Story 2.16 (trap 19): the sidebar footer's Back control — ENABLED on a clean draft, because
    // `disabled` here tracks a save in flight, not the dirty flag. Leaving is always available.
    expect(screen.getByRole('button', { name: 'Back to Battles' })).toBeEnabled();
    expect(screen.queryAllByRole('button')).toHaveLength(6);
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // Story 2.9 review, decision 1 (Sidiar's option (a)). `libraryUnavailable` covers a FAILED
  // organisms.list(); a SUCCESSFUL EMPTY one is a separate, reachable state — a fresh profile,
  // cleared storage, or a bookmarked /battle/new opened before the Gallery has ever run the
  // workspace seed. The seed used to fire there regardless, putting an id in the roster with no
  // record behind it, and the sidebar rendered a normal, pre-selected, clickable row reading
  // "Unknown organism": a page reporting no problem while offering a tool that places nothing.
  //
  // ⚠️ Note what this does NOT assert: the AC7 degraded notice. The library did not fail, so
  // claiming it did would be its own lie — the honest state is simply an empty roster.
  it('seeds NO roster row when the library loads successfully but is empty', async () => {
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms: [] })}
        battleId="new"
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    expect(screen.queryByText('Unknown organism')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText(/organism library could not be read/i)).toBeNull();
  });

  // The other half of decision 1: an empty roster is only acceptable because the selection has
  // somewhere honest to fall to. `resolveSelectedTool` yields the eraser (spec §3.3: "first roster
  // row; eraser when the roster is empty"), so exactly one control is still pressed — AC2 holds
  // even here — and Story 2.10's add dropdown is what makes the dish paintable again.
  it('falls back to the eraser, still exactly one selection, when the library is empty', async () => {
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms: [] })}
        battleId="new"
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
  });

  // The seed must still fire in the case it exists for — otherwise "stop seeding a fictional
  // organism" is trivially satisfiable by never seeding at all, which would leave /battle/new
  // unpaintable until Story 2.10 for every ordinary user.
  it('still seeds the default tool’s organism when the library DOES contain it', async () => {
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms: ORGANISMS_WITH_CONWAY })}
        battleId="new"
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    expect(screen.getByRole('button', { name: CONWAYS_CLASSIC.name })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // Story 2.9 AC6, INVERTING what this test asserted through Story 2.8 (deferred-work.md, owned
  // by this story). While one `Promise.all` loaded both, a corrupt ORGANISM record rendered the
  // BATTLE's failure body — the wrong fact about the wrong record — and that was accepted only
  // because nothing rendered the roster yet. The two resources settle independently now: a battle
  // that loaded perfectly renders, and the roster section is where the library's failure is
  // reported (AC7).
  it('renders the battle when the organism library is corrupt but the battle loaded (AC6)', async () => {
    render(<BattlePage repositories={withFailingOrganismList()} battleId={SKIRMISH.id} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stored data may be damaged/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Something Went Wrong' })).toBeNull();
  });

  // AC7 (deferred-work.md, owned by this story): the other half. Rendering the battle is only
  // correct if the roster's failure is STATED — an empty list on a page reporting no problem is
  // the state that entry was filed about.
  it('states the roster failure instead of silently rendering an empty roster (AC7)', async () => {
    render(<BattlePage repositories={withFailingOrganismList()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(screen.getByText(/organism library could not be read/i)).toBeInTheDocument();
    expect(screen.getByText(/placing organisms is unavailable/i)).toBeInTheDocument();
    // No list of unnameable rows, and no organism tool that could resolve against them.
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
  });

  // AC6's reverse, which still holds: the BATTLE failing is a different fact and keeps its own
  // failure body. A fix that made both resources non-blanking would silently take this with it.
  it('still renders the failure body when the BATTLE load rejects (AC6)', async () => {
    render(<BattlePage repositories={withFailingBattleLoad()} battleId={SKIRMISH.id} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something Went Wrong' }),
    ).toBeInTheDocument();
  });

  // The independence runs both ways: a healthy library must not rescue a broken battle, and a
  // broken battle must not suppress a healthy library. Pinned because "settle independently" is
  // easy to half-implement.
  it('renders the battle’s failure body even though the organism library loaded fine', async () => {
    const repositories = withFailingBattleLoad();
    const listSpy = vi.spyOn(repositories.organisms, 'list');
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);

    await screen.findByRole('heading', { level: 1, name: 'Something Went Wrong' });
    expect(listSpy).toHaveBeenCalled();
    expect(screen.queryByText(/organism library could not be read/i)).toBeNull();
  });

  // AC2 / NFR-4.1 as a COUNT, not a presence check: `queryByRole('button', { name: /run/i })`
  // being null still passes after someone adds a dead RUN button labelled differently, or a
  // fullscreen button beside it. Story 2.9 replaced the provisional Draw/Erase pair with the real
  // roster; 2.13 adds SAVE, 2.15 adds CLEAR and 2.16 adds BACK TO BATTLES, so the claim is now
  // "this battle's three organisms, the eraser, UNDO, SAVE, CLEAR and BACK — nothing else". A
  // NINTH button (Run, fullscreen, or Epic 4's per-row pencil) still fails here.
  it('renders no Run, fullscreen, or any other button beyond the roster, UNDO, SAVE, CLEAR and BACK on the loaded route', async () => {
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
    // AC3: the deleted toggle, named rather than merely counted — a bare length check is
    // satisfied by a dead control replacing one of them, which is what this count exists to catch.
    expect(screen.queryByRole('button', { name: 'Draw' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Erase' })).toBeNull();
    for (const organism of organisms) {
      expect(screen.getByRole('button', { name: organism.name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Eraser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    // Story 2.13: converted from an absence assertion (trap 5) — SAVE has arrived, disabled on a
    // freshly loaded battle because nothing has been edited yet.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Story 2.15: SKIRMISH places a roster, so CLEAR renders enabled.
    expect(screen.getByRole('button', { name: /clear petri dish/i })).toBeEnabled();
    // Story 2.16: converted from this test's own "2.16's Back" prediction — the eighth button IS
    // Back to Battles, and it is the last one this route expects. A NINTH (Run, fullscreen, or
    // Epic 4's per-row pencil) still fails here.
    expect(screen.getByRole('button', { name: 'Back to Battles' })).toBeEnabled();
    expect(screen.queryAllByRole('button')).toHaveLength(organisms.length + 5);
    // Exactly one <h1>: the battle title. The battle route drops AppShell, so nothing else on it
    // competes for the document heading, and nothing automated enforces that but this line.
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // Forced decision 4, the load-bearing half. Before Story 2.9 `sessionRoster` seeded
  // `DEFAULT_TOOL.organismId` UNCONDITIONALLY — invisible while nothing rendered the roster, and a
  // fourth row the moment it did: opening "Three-Way Skirmish" would list Conway's Classic, which
  // the user never added and which Decision H says is not part of that battle.
  it('lists exactly the battle’s OWN placed organisms — no seeded Conway’s Classic (AC1)', async () => {
    render(
      <BattlePage
        repositories={createFakeRepositories({
          battles: [SKIRMISH],
          organisms: ORGANISMS_WITH_CONWAY,
        })}
        battleId={SKIRMISH.id}
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const rows = within(screen.getByRole('list')).getAllByRole('button');
    // Decision H.1: "used by a battle" means PLACED — and in roster order, which is the dense
    // encoding's own (RFC-006 Decision 2), never sorted for display.
    expect(rows.map((row) => row.textContent)).toEqual(organisms.map((organism) => organism.name));
    expect(screen.queryByRole('button', { name: CONWAYS_CLASSIC.name })).toBeNull();
  });

  // AC2 / spec §3.3's "suggest: first roster row". The seed is conditional now, so `DEFAULT_TOOL`
  // is NOT in a loaded battle's roster — an initial selection that still pointed at it would
  // resolve to no ref, leaving the dish unpaintable and NO row selected.
  it('selects the FIRST roster row on a loaded battle (AC2)', async () => {
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName(organisms[0].name);
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
    const canvasOn = await findEditorCanvas(linesOn.container);
    const recordingOn = await findRecording(contextsByCanvas, canvasOn);
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
    const canvasOff = await findEditorCanvas(linesOff.container);
    const recordingOff = await findRecording(contextsByCanvas, canvasOff);

    // paintGridLines() draws the overlay via drawImage on the MAIN canvas's context whenever the
    // layout says lines are visible, and is a total no-op (no drawImage call at all) when they are
    // not — GridRenderer never falls back to direct fillRect line-drawing here because the
    // recording double makes the offscreen overlay canvas succeed, unlike real jsdom.
    expect(recordingOn.calls.some((c) => c.op === 'drawImage')).toBe(true);
    expect(recordingOff.calls.some((c) => c.op === 'drawImage')).toBe(false);
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
    // waitFor, not a bare read: the construction effect flushes AFTER the heading resolves, so a
    // straight `expect(...).toBeGreaterThan(0)` here is the same load-dependent flake the two
    // helpers above fix (deferred-work.md, Story 2.7 review).
    await waitFor(() => expect(getContextSpy.mock.calls.length).toBeGreaterThan(0));
    const callsAfterMount = getContextSpy.mock.calls.length;

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
    const canvas = await findEditorCanvas(container);
    const recording = await findRecording(contextsByCanvas, canvas);

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

// Conway's Classic is absent from createMockWorkspace() (trap 6) while production always has it
// (M9: protected, re-seeded after import). Seeded explicitly so these tests exercise the real
// colour path rather than buildRefToFillGroup's dangling-id fallback.
//
// Story 2.8: hoisted to module scope from inside the placement describe, so the undo describe
// below reuses the same mount wiring rather than hand-copying a second near-identical one — the
// duplicated-test-helper finding that keeps recurring in this project's reviews.
const ORGANISMS_WITH_CONWAY: readonly Organism[] = [...organisms, CONWAYS_CLASSIC];
const NEW_ROUTE_SIZE = DEFAULT_SETTINGS.defaultGridSize;

// `repositories` is optional and defaults to the standard /battle/new fixture. It exists for the
// Story 2.13 edit-lock tests, which have to spy on `battles.save` and therefore need a reference to
// the very object this helper used to construct privately.
async function renderNewRoute(
  repositories: AppRepositories = createFakeRepositories({
    battles: [],
    organisms: ORGANISMS_WITH_CONWAY,
  }),
) {
  const contextsByCanvas = installPerCanvasRecording();
  enableCanvasRendering();
  const view = render(<BattlePage repositories={repositories} battleId="new" />);
  await view.findByRole('heading', { level: 1, name: 'Untitled Battle' });
  const canvas = await findEditorCanvas(view.container);
  stubCanvasRect(canvas);
  return { ...view, canvas, recording: await findRecording(contextsByCanvas, canvas) };
}

// Click placement wiring (Story 2.5, AC1/AC4/AC6). <BattlePage> holds the grid, owns the roster
// union, and builds the palette over it — the three things that make a click actually land.
describe('BattlePage — click placement wiring (Story 2.5)', () => {
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
    const contexts = installPerCanvasRecording();
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
    const canvas = await findEditorCanvas(container);
    stubCanvasRect(canvas);
    const recording = await findRecording(contexts, canvas);

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

// Undo (Story 2.8). <BattlePage> owns `useUndoableGrid`, so this is the only level at which the
// whole loop is observable: a gesture commits, the ring grows, UNDO reverts it, and the dish
// repaints. The hook's own units live in lib/battle/useUndoableGrid.test.ts; what is tested here is the
// WIRING — that `canUndo` reaches the button's `disabled` live (trap 1), and that the restored
// grid actually reaches the canvas (trap 5).
describe('BattlePage — undo wiring (Story 2.8)', () => {
  const undoButton = () => screen.getByRole('button', { name: 'Undo' });

  /** The occupied cells of whatever the canvas last full-painted, read off the recording. */
  function paintedCellCount(recording: RecordingContext2D, backgroundFills: Set<string>): number {
    return recording.fillStyleWrites.filter((fill) => !backgroundFills.has(String(fill))).length;
  }

  function backgroundFills(): Set<string> {
    return new Set([
      document.documentElement.style.getPropertyValue('--gol-bg-primary'),
      document.documentElement.style.getPropertyValue('--gol-grid-line'),
    ]);
  }

  // AC5's three transitions in one test, each read off the DOM rather than off the hook: disabled
  // with an empty ring, enabled after one commit, disabled again once the ring is consumed — with
  // NO other interaction between them. A `canUndo` read out of a ref (trap 1) passes every unit
  // test of the hook and fails right here.
  it('drives the UNDO button’s disabled state through the whole cycle (AC5)', async () => {
    const user = userEvent.setup();
    const { canvas } = await renderNewRoute();

    expect(undoButton()).toBeDisabled();

    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 10, 10));
    expect(undoButton()).toBeEnabled();

    await user.click(undoButton());
    expect(undoButton()).toBeDisabled();
  });

  // AC3 + AC4: one entry per committed gesture, and each undo reverts exactly one of them.
  it('accumulates one undo level per gesture and consumes them one at a time (AC3, AC4)', async () => {
    const user = userEvent.setup();
    const { canvas } = await renderNewRoute();

    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 4, 4));
    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 5, 5));
    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 6, 6));

    await user.click(undoButton());
    expect(undoButton()).toBeEnabled();
    await user.click(undoButton());
    expect(undoButton()).toBeEnabled();
    await user.click(undoButton());
    expect(undoButton()).toBeDisabled(); // back at the seed — three gestures, three undos
  });

  // AC3's other half: a gesture that changed NOTHING never reaches `commit`, so it creates no
  // entry and does not move `canUndo`. The redundant re-click is the cheapest instance of it.
  it('creates no undo level for a gesture that changed nothing (AC3)', async () => {
    const user = userEvent.setup();
    const { canvas } = await renderNewRoute();
    const at = centreOfCell(canvas, NEW_ROUTE_SIZE, 7, 7);

    click(canvas, at);
    click(canvas, at); // the same cell, already occupied — no commit fires at all.

    await user.click(undoButton());
    expect(undoButton()).toBeDisabled(); // one entry existed, not two.
  });

  // AC3 / AC4 with a REAL drag — press, move, move, release. Story 2.6's review specifically
  // rejected "a click with a pointerUp bolted on" as a stand-in for this: the coalescing claim is
  // about the cells BETWEEN the endpoints, and one undo has to take all of them back together.
  it('reverts a whole press-drag-release stroke as ONE undo (AC3, AC4)', async () => {
    const user = userEvent.setup();
    const { canvas, recording } = await renderNewRoute();
    const background = backgroundFills();
    const at = (col: number, row: number) => centreOfCell(canvas, NEW_ROUTE_SIZE, col, row);

    fireEvent.pointerDown(canvas, at(3, 3));
    // `buttons: 1` is the move-time bitmask — a move reporting no primary button self-terminates.
    fireEvent.pointerMove(canvas, { ...at(6, 3), buttons: 1 });
    fireEvent.pointerMove(canvas, { ...at(10, 3), buttons: 1 });
    fireEvent.pointerUp(canvas, { ...at(10, 3), buttons: 0 });

    expect(undoButton()).toBeEnabled();

    const beforeUndo = recording.fillStyleWrites.length;
    await user.click(undoButton());

    // ONE undo empties the whole stroke: the repaint that follows writes only background fills.
    const afterUndo = recording.fillStyleWrites.slice(beforeUndo);
    expect(afterUndo.length).toBeGreaterThan(0); // it did repaint (AC4)
    expect(afterUndo.filter((fill) => !background.has(String(fill)))).toHaveLength(0);
    // And the stroke was one entry, not eight: the ring is empty after a single undo.
    expect(undoButton()).toBeDisabled();
  });

  // AC4's repaint half, at the level the model half cannot reach. Mutation-checked by swallowing
  // the grid effect's `drawFull` — this test reddens, the model-side ones stay green, which is the
  // split trap 13 describes (jsdom has no 2D context, so "the dish repainted" can only ever be a
  // claim about a recording double).
  //
  // ⚠️ What this does NOT prove is trap 5's identity skip. `paintedGridRef.current` holds the
  // CURRENT grid and `restore()` returns a PREVIOUS one, so the two are never equal in any flow
  // reachable from here — an implementation that stored whole `RenderableGrid`s and handed the
  // identity back still passes this. That claim is pinned where it is falsifiable instead:
  // `lib/battle/useUndoableGrid.test.ts`'s "builds a NEW grid object on restore", which reddens under
  // exactly that mutation.
  it('repaints the dish with the restored grid, not the identity it already painted (AC4)', async () => {
    const user = userEvent.setup();
    const { canvas, recording } = await renderNewRoute();
    const background = backgroundFills();

    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 12, 8));
    const beforeUndo = recording.fillStyleWrites.length;
    expect(paintedCellCount(recording, background)).toBeGreaterThan(0); // something was painted

    await user.click(undoButton());

    const afterUndo = recording.fillStyleWrites.slice(beforeUndo);
    // A skipped repaint writes NOTHING here — that is the whole failure mode.
    expect(afterUndo.length).toBeGreaterThan(0);
    expect(afterUndo.filter((fill) => !background.has(String(fill)))).toHaveLength(0);
  });

  // AC7 / trap 8: a new seed is a DIFFERENT battle. Carrying the ring across would let UNDO
  // restore the previous battle's grid into this one.
  it('resets the ring when the route switches to another battle (AC7)', async () => {
    const user = userEvent.setup();
    const contextsByCanvas = installPerCanvasRecording();
    enableCanvasRendering();
    const repositories = createFakeRepositories({
      battles: [SKIRMISH],
      organisms: ORGANISMS_WITH_CONWAY,
    });

    const view = render(<BattlePage repositories={repositories} battleId="new" />);
    await view.findByRole('heading', { level: 1, name: 'Untitled Battle' });
    const canvas = await findEditorCanvas(view.container);
    await findRecording(contextsByCanvas, canvas);
    stubCanvasRect(canvas);

    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 9, 9));
    expect(undoButton()).toBeEnabled();

    view.rerender(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await view.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await waitFor(() => expect(undoButton()).toBeDisabled());
    // review guard: the button must not merely be disabled — pressing it must not resurrect the
    // other battle's grid either. With the ring gone there is nothing to press.
    await user.click(undoButton());
    expect(undoButton()).toBeDisabled();
  });

  // AC7: nothing about the ring is persisted. The repository is a fake with real method identities,
  // so any write at all would show up here.
  it('never writes the undo ring to a repository (AC7)', async () => {
    const user = userEvent.setup();
    installPerCanvasRecording();
    enableCanvasRendering();
    const repositories = createFakeRepositories({ battles: [], organisms: ORGANISMS_WITH_CONWAY });
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    const settingsSaveSpy = vi.spyOn(repositories.settings, 'save');

    const view = render(<BattlePage repositories={repositories} battleId="new" />);
    await view.findByRole('heading', { level: 1, name: 'Untitled Battle' });
    const canvas = await findEditorCanvas(view.container);
    stubCanvasRect(canvas);

    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 2, 2));
    await user.click(undoButton());

    expect(saveSpy).not.toHaveBeenCalled();
    expect(settingsSaveSpy).not.toHaveBeenCalled();
    // localStorage is untouched too — the fakes are in-memory, so this pins the absence of a
    // second, direct write path (AR-2: a component never reaches a concrete repository anyway).
    expect(localStorage.length).toBe(0);
  });
});

// Story 2.10: adding organisms from the shared library. <BattlePage> is the only level at which
// the whole chain — the addable-library derivation, the sessionRoster write, the resolved row,
// and the repository-write absence — is observable in one place.
describe('BattlePage — adding organisms from the library (Story 2.10)', () => {
  // AC1 + AC3 in one flow: the add control offers exactly the library minus this battle's own
  // roster, and choosing the one option appends a fourth row under its real name.
  it('offers the library minus the roster, and adding appends a row with the organism’s real name (AC1, AC3)', async () => {
    const user = userEvent.setup();
    render(
      <BattlePage
        repositories={createFakeRepositories({
          battles: [SKIRMISH],
          organisms: ORGANISMS_WITH_CONWAY,
        })}
        battleId={SKIRMISH.id}
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const sidebar = screen.getByRole('complementary');
    // SKIRMISH places the three mock organisms; Conway is the only one of the four NOT placed.
    const select = within(sidebar).getByRole('combobox', { name: /add organism/i });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['+ ADD ORGANISM', CONWAYS_CLASSIC.name]);

    await user.selectOptions(select, CONWAYS_CLASSIC.id);

    const rows = within(screen.getByRole('list')).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      ...organisms.map((organism) => organism.name),
      CONWAYS_CLASSIC.name,
    ]);
    // AC1's own exclusion is derived from the same union: nothing left to add now that all four
    // are in the roster (AC8's stated-empty state, not a dead dropdown).
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/already in this battle/i)).toBeInTheDocument();
  });

  // AC4: nothing this story writes may reach a repository. Asserted against the fake repos' own
  // call counts, not by inspecting storage (AC4's own instruction) — the fakes are in-memory, so a
  // real write would show up on the spy regardless of backing store.
  it('writes to no repository when an organism is added (AC4)', async () => {
    const user = userEvent.setup();
    const repositories = createFakeRepositories({
      battles: [SKIRMISH],
      organisms: ORGANISMS_WITH_CONWAY,
    });
    const battleSaveSpy = vi.spyOn(repositories.battles, 'save');
    const organismSaveSpy = vi.spyOn(repositories.organisms, 'save');
    const settingsSaveSpy = vi.spyOn(repositories.settings, 'save');

    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.selectOptions(
      within(screen.getByRole('complementary')).getByRole('combobox', { name: /add organism/i }),
      CONWAYS_CLASSIC.id,
    );
    // The new row is proof the add actually happened, not merely that the control was operated.
    expect(screen.getByRole('button', { name: CONWAYS_CLASSIC.name })).toBeInTheDocument();

    expect(battleSaveSpy).not.toHaveBeenCalled();
    expect(organismSaveSpy).not.toHaveBeenCalled();
    expect(settingsSaveSpy).not.toHaveBeenCalled();
    // ❌ No `expect(localStorage.length).toBe(0)` here. `createFakeRepositories()` is in-memory, so
    // that assertion is green no matter what the component does — a permanently-passing line in the
    // one test AC5 rests on. Task 7 says so outright: assert the fake repos' CALL COUNTS, "not by
    // inspecting storage".
  });

  // Forced decision 1 (option b): choosing an entry both adds AND selects it, immediately
  // paintable — the same claim BattleEditorView.test.tsx pins in isolation, proven here through
  // the real sessionRoster round trip rather than a simulated rerender.
  it('selects the newly-added organism, immediately (forced decision 1)', async () => {
    const user = userEvent.setup();
    render(
      <BattlePage
        repositories={createFakeRepositories({
          battles: [SKIRMISH],
          organisms: ORGANISMS_WITH_CONWAY,
        })}
        battleId={SKIRMISH.id}
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.selectOptions(
      within(screen.getByRole('complementary')).getByRole('combobox', { name: /add organism/i }),
      CONWAYS_CLASSIC.id,
    );

    expect(screen.getByRole('button', { name: CONWAYS_CLASSIC.name })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // AC5 / Decision G.3, reusing rosterUnion.test.ts's approach: 255 distinct SYNTHETIC ids rather
  // than 255 schema-valid Organism library records (disproportionate for what this test needs to
  // prove — the arithmetic wiring, not the palette resolution of each one). BattleSchema's H.1
  // refinement still demands every id be PLACED, so all 255 are painted, one cell each, on a grid
  // large enough to hold them.
  it('blocks the add with a stated message at the 255-organism cap (AC5)', async () => {
    const CAP_SIZE = { cols: 50, rows: 30 } as const; // 1500 cells — comfortably over 255.
    const organismIds = Array.from({ length: 255 }, (_, i) => `cap-organism-${i}`);
    const gridState: number[][] = Array.from({ length: CAP_SIZE.rows }, () =>
      new Array(CAP_SIZE.cols).fill(0),
    );
    organismIds.forEach((_, i) => {
      gridState[Math.floor(i / CAP_SIZE.cols)][i % CAP_SIZE.cols] = i + 1;
    });
    const fullBattle: Battle = {
      id: SKIRMISH.id,
      name: 'Full Roster',
      organismIds,
      gridSize: CAP_SIZE,
      gridState,
      createdAt: SKIRMISH.createdAt,
      updatedAt: SKIRMISH.updatedAt,
    };

    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [fullBattle], organisms: [] })}
        battleId={fullBattle.id}
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Full Roster' });

    const sidebar = screen.getByRole('complementary');
    // The roster's OWN search box, named — not `textbox` in general, which now also matches
    // Story 2.11's always-present Battle Name field (a different control, unaffected by the cap).
    expect(within(sidebar).queryByRole('textbox', { name: /search organisms/i })).toBeNull();
    expect(within(sidebar).queryByRole('combobox')).toBeNull();
    expect(within(sidebar).getByText(/roster is full/i)).toBeInTheDocument();
    // ⚠️ Scoped to the cap NOTICE, not to the sidebar: from Story 2.14 the sidebar also carries
    // Grid Info, and a 255-organism roster on this fixture puts a bare "255" in its Living Cells
    // row too. The number that matters is the one inside the sentence that states the limit.
    expect(within(sidebar).getByText(/roster is full/i)).toHaveTextContent(/255/);
  });

  // ⚠️ Story 2.10 CODE REVIEW regression (2026-08-27) — trap 1, the append-only invariant, and the
  // one failure this story shipped. The `rosterIds` memo applied the `DEFAULT_TOOL` seed only while
  // the UNION (placed + session) was empty. This story gave `sessionRoster` its first writer, which
  // made that condition falsifiable by an add: the seeded organism was silently evicted from index
  // 0 and the added one took its place, so `cell = roster index + 1` (RFC-006 Decision 2)
  // reinterpreted every cell painted with the seed. No throw, no warning — the whole 660-test suite
  // stayed green. The seed now lives in the union's BASE, so a session add can only ever append.
  it('keeps the seeded organism at index 0 when an add lands on /battle/new (trap 1)', async () => {
    const user = userEvent.setup();
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms: ORGANISMS_WITH_CONWAY })}
        battleId="new"
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    // The seed, before the add: one row, and it is the default tool's organism.
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual([CONWAYS_CLASSIC.name]);

    await user.selectOptions(
      within(screen.getByRole('complementary')).getByRole('combobox', { name: /add organism/i }),
      organisms[0].id,
    );

    // APPENDED, never substituted: the seed keeps index 0, so every cell already painted as ref 1
    // still means the seeded organism.
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual([CONWAYS_CLASSIC.name, organisms[0].name]);
    // And the seeded organism is still NOT offered again (AC1's exclusion is the same union).
    expect(
      within(screen.getByRole('complementary'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).not.toContain(CONWAYS_CLASSIC.name);
  });

  // AC7, which the story required a test for and did not have: the window Story 2.9's decision 1
  // deliberately left open — a library that HOLDS organisms but not Conway's Classic, on
  // /battle/new. The seed does not fire, so the roster is honestly empty and the eraser carries the
  // selection; the add control is what makes the dish paintable again, and this is the assertion
  // that says so.
  it('makes /battle/new paintable again when the library lacks the default organism (AC7)', async () => {
    const user = userEvent.setup();
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms })}
        battleId="new"
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    // Story 2.9's accepted trade-off, still true: no roster, no organism tool, the eraser selected.
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');

    await user.selectOptions(
      within(screen.getByRole('complementary')).getByRole('combobox', { name: /add organism/i }),
      organisms[0].id,
    );

    // Paid back: a real roster row, selected, so `refForTool` resolves and the dish is paintable.
    const row = screen.getByRole('button', { name: organisms[0].name });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'false');
  });

  // AC8 / trap 7, code review: `library` is a DIFFERENCE, so it reads empty for two unrelated
  // reasons. In the empty-WORKSPACE window (a fresh profile, or a bookmarked /battle/new opened
  // before the Gallery ever ran the workspace seed) the roster is empty and nothing is in this
  // battle — so the "already in this battle" copy was a plain falsehood, in the exact state where
  // this message is the user's only signpost.
  it('says the library is empty, not that the battle already holds it all (AC8)', async () => {
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms: [] })}
        battleId="new"
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).getByText(/your organism library is empty/i)).toBeInTheDocument();
    expect(within(sidebar).queryByText(/already in this battle/i)).toBeNull();
    // Still not the AC7 degraded notice — the list loaded fine, it is simply empty.
    expect(screen.queryByText(/organism library could not be read/i)).toBeNull();
  });
});

// Story 2.11 (AC1-AC6). `<BattlePage>` owns `battleName` and `isDirty`; this is the only level at
// which the seed-adoption trap, the live header binding, the dirty flag and the tab title are all
// observable together.
describe('BattlePage — battle name & dirty tracking (Story 2.11)', () => {
  /** `data-dirty` lives on `<Root>`, which carries no role — queried by its own attribute, the
   * same way this file would query `data-mode` if anything needed to. */
  function dirtyValue(container: HTMLElement): string | null {
    const root = container.querySelector('[data-dirty]');
    if (root === null) throw new Error('Root (data-dirty) not found');
    return root.getAttribute('data-dirty');
  }

  function nameField(): HTMLElement {
    return screen.getByRole('textbox', { name: /battle name/i });
  }

  // ⚠️ THE seed trap (Dev Notes → *Seeding the name*). A plain `useState(draft?.name ?? '')`
  // passes a /battle/new-only suite perfectly and still leaves every LOADED battle's field blank
  // forever — so this fixture is deliberately Three-Way Skirmish, never /battle/new alone.
  it('pre-fills the sidebar field from a LOADED battle’s stored name (AC1, seed trap)', async () => {
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(nameField()).toHaveValue(SKIRMISH.name);
    expect(nameField()).toHaveAttribute('maxlength', String(MAX_BATTLE_NAME_LENGTH));
  });

  it('updates the header live as the field is typed, with no save, blur or debounce (AC2)', async () => {
    const user = userEvent.setup();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');

    // No blur, no wait — the SAME paint the keystroke landed on already shows the new title.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Three-Way Skirmish!' }),
    ).toBeInTheDocument();
  });

  it('falls back to "Untitled Battle" in the header when the field is cleared (AC2)', async () => {
    const user = userEvent.setup();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.clear(nameField());

    expect(screen.getByRole('heading', { level: 1, name: 'Untitled Battle' })).toBeInTheDocument();
  });

  it('starts clean on both a loaded battle and /battle/new (AC5)', async () => {
    const loaded = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    expect(dirtyValue(loaded.container)).toBe('false');
    // Unmounted before the second mount — never TWO <BattlePage> instances live at once (the real
    // app never has two either, and each owns a tab-title `MutationObserver`; two live instances
    // fight over `document.title` forever, which is a test-harness artefact, not a product bug).
    loaded.unmount();

    const fresh = render(<BattlePage repositories={seeded()} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });
    expect(dirtyValue(fresh.container)).toBe('false');
  });

  it('goes dirty on a name edit, and never back, within this story (AC3)', async () => {
    const user = userEvent.setup();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(dirtyValue(container)).toBe('false');
    await user.type(nameField(), '!');
    expect(dirtyValue(container)).toBe('true');

    // Nothing in this story clears it — not even retyping the exact original name back.
    await user.clear(nameField());
    await user.type(nameField(), SKIRMISH.name);
    expect(dirtyValue(container)).toBe('true');
  });

  it('goes dirty on a painted cell (AC4)', async () => {
    const { container, canvas } = await renderNewRoute();
    expect(dirtyValue(container)).toBe('false');

    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 10, 10));

    expect(dirtyValue(container)).toBe('true');
  });

  // AC5: nothing this story writes reaches a repository — asserted against the fake repos' own
  // call counts (the Story 2.10 precedent), for BOTH triggers in one test.
  it('writes to no repository for a name edit or a painted cell (AC5)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const battleSaveSpy = vi.spyOn(repositories.battles, 'save');
    const organismSaveSpy = vi.spyOn(repositories.organisms, 'save');
    const settingsSaveSpy = vi.spyOn(repositories.settings, 'save');
    installPerCanvasRecording();
    enableCanvasRendering();

    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    const canvas = await findEditorCanvas(container);
    stubCanvasRect(canvas);
    click(canvas, centreOfCell(canvas, SKIRMISH.gridSize, 4, 4));

    expect(battleSaveSpy).not.toHaveBeenCalled();
    expect(organismSaveSpy).not.toHaveBeenCalled();
    expect(settingsSaveSpy).not.toHaveBeenCalled();
    // ❌ No `expect(localStorage.length).toBe(0)` here. `createFakeRepositories()` is in-memory, so
    // that assertion is green no matter what the component does — a permanently-passing line in the
    // one test AC5 rests on. Task 7 says so outright: assert the fake repos' CALL COUNTS, "not by
    // inspecting storage".
  });

  // AC4's real risk (Dev Notes): a churning `onCommitGrid` identity, not a missing flag. The
  // identity itself is not observable from outside `<BattlePage>` (it is never rendered into the
  // DOM), so this proves the OUTWARD consequence instead — the commit seam keeps working exactly
  // as before across an UNRELATED re-render (a name edit): a cell painted before the edit is still
  // held afterward (re-clicking it is still a no-op), and painting a new cell still works. A
  // wrapper rebuilt with a fresh identity per render is still guarded structurally by
  // `useCallback(fn, [commitGrid])` (BattlePage.tsx) — this test is the regression net around that
  // guarantee, not a replacement for it.
  it('keeps the commit seam working across an unrelated re-render (AC4, identity stability)', async () => {
    const user = userEvent.setup();
    const { canvas, recording } = await renderNewRoute();
    const at = centreOfCell(canvas, NEW_ROUTE_SIZE, 8, 8);

    click(canvas, at);
    const afterFirstClick = recording.calls.length;
    expect(afterFirstClick).toBeGreaterThan(0);

    // The unrelated re-render: typing in the name field flips `battleName` and `isDirty`, neither
    // of which the grid depends on.
    await user.type(nameField(), 'x');

    // Re-clicking the SAME cell is still a no-op — the held grid survived the re-render.
    click(canvas, at);
    expect(recording.calls.length).toBe(afterFirstClick);

    // A NEW cell still paints.
    const another = centreOfCell(canvas, NEW_ROUTE_SIZE, 20, 3);
    click(canvas, another);
    expect(recording.calls.length).toBeGreaterThan(afterFirstClick);
  });

  it('does not wrap undo — a bare undo never clears isDirty (Dev Notes)', async () => {
    const user = userEvent.setup();
    const { container, canvas } = await renderNewRoute();

    click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 5, 5));
    expect(dirtyValue(container)).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    // Undoing to the seed is not the same as being saved (Dev Notes → *Undo and the dirty flag*).
    expect(dirtyValue(container)).toBe('true');
  });

  describe('the browser tab title (AC6)', () => {
    it('is set to the loaded battle’s display name, suffixed with the app name', async () => {
      render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

      expect(document.title).toBe('Three-Way Skirmish · Game of Life Studio');
    });

    it('tracks typing, live', async () => {
      const user = userEvent.setup();
      render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

      await user.type(nameField(), '!');

      expect(document.title).toBe('Three-Way Skirmish! · Game of Life Studio');
    });

    // AC6: the not-found body must not claim a battle name it does not have.
    it('is not set to a battle name in the not-found branch', async () => {
      document.title = 'Battle Gallery · Game of Life Studio';

      render(
        <BattlePage repositories={seeded()} battleId="ffffffff-0000-4000-8000-000000000000" />,
      );
      await screen.findByRole('heading', { level: 1, name: 'Battle Not Found' });

      expect(document.title).toBe('Battle Gallery · Game of Life Studio');
    });

    // AC6 / Dev Notes: a client navigation back to the Gallery must not keep reading the last
    // battle's name — the cleanup restores whatever title preceded this mount, not a hardcoded
    // fallback (which could itself go stale against a future root layout rename).
    it('is restored to the pre-mount title on unmount', async () => {
      document.title = 'Battle Gallery · Game of Life Studio';

      const { unmount } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
      expect(document.title).toBe('Three-Way Skirmish · Game of Life Studio');

      unmount();

      expect(document.title).toBe('Battle Gallery · Game of Life Studio');
    });
  });
});

/**
 * Story 2.13 (AC2, AC3, AC4, AC5). This is the first code in the app that WRITES a battle —
 * `battles.save` had exactly one kind of assertion against it before this story, that it is NOT
 * called — so what is pinned here is the whole write: which entity is created, which is updated,
 * what the record contains, and what happens when the write is refused.
 */
describe('BattlePage — saving (Story 2.13)', () => {
  function dirtyValue(container: HTMLElement): string | null {
    const root = container.querySelector('[data-dirty]');
    if (root === null) throw new Error('Root (data-dirty) not found');
    return root.getAttribute('data-dirty');
  }

  const nameField = () => screen.getByRole('textbox', { name: /battle name/i });
  const saveButton = () => screen.getByRole('button', { name: 'Save' });

  /** The record handed to `battles.save`, parsed through the REAL schema (AC7) rather than
   * duck-typed — `superRefine` already encodes every invariant the projection has to satisfy, and
   * re-stating them here is how the two drift apart. */
  function savedRecord(spy: ReturnType<typeof vi.spyOn>, call = 0): Battle {
    const argument: unknown = (spy.mock.calls[call] as unknown[])[0];
    const parsed = BattleSchema.safeParse(JSON.parse(JSON.stringify(argument)));
    if (!parsed.success) {
      throw new Error(`saved record failed BattleSchema: ${JSON.stringify(parsed.error.issues)}`);
    }
    return parsed.data;
  }

  // AC2: `/battle/new` carries no id (newBattleDraft.ts), so the first save MINTS one. The record
  // has to be schema-valid on the way in or `battles.load()` throws CorruptDataError on the way
  // back out — which is why `savedRecord` parses rather than asserts fields.
  it('creates a battle with a fresh uuid on the first save from /battle/new (AC2, AC3)', async () => {
    const user = userEvent.setup();
    const repositories = createFakeRepositories({ battles: [], organisms: ORGANISMS_WITH_CONWAY });
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    const { container } = render(<BattlePage repositories={repositories} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    expect(saveButton()).toBeDisabled();
    await user.type(nameField(), 'Fresh Battle');
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const record = savedRecord(saveSpy);
    expect(record.name).toBe('Fresh Battle');
    expect(record.gridSize).toEqual(NEW_ROUTE_SIZE);
    expect(record.organismIds).toEqual([]); // nothing placed — the H.1 prune's degenerate case
    // AC4: the flag clears only once the promise has RESOLVED.
    await waitFor(() => expect(dirtyValue(container)).toBe('false'));
    expect(saveButton()).toBeDisabled();
    // The battle is genuinely retrievable under the id that was minted, which is the only thing
    // that makes the Gallery tile (and its thumbnail) possible.
    await expect(repositories.battles.load(record.id)).resolves.not.toBeNull();
  });

  // AC2: "every save after that UPDATES the same entity". A second `crypto.randomUUID()` would
  // leave two "Fresh Battle" tiles in the Gallery and no way to tell which one the editor is on.
  it('reuses the minted id on a second save rather than creating a second battle (AC2)', async () => {
    const user = userEvent.setup();
    const repositories = createFakeRepositories({ battles: [], organisms: ORGANISMS_WITH_CONWAY });
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    await user.type(nameField(), 'First');
    await user.click(saveButton());
    await waitFor(() => expect(saveButton()).toBeDisabled());
    await user.type(nameField(), ' Then Second');
    await user.click(saveButton());
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));

    const first = savedRecord(saveSpy, 0);
    const second = savedRecord(saveSpy, 1);
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('First Then Second');
    // trap 3: `createdAt` survives the update — it is absent from `BattleSummarySchema`, so
    // overwriting it here would be invisible in the UI and wrong in every future export.
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    // trap 4: two saves inside one millisecond produce EQUAL timestamps, so this is `>=`, not `>`.
    // The claim that matters is the one below it — one entity, not two.
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    await expect(repositories.battles.list()).resolves.toHaveLength(1);
  });

  // trap 3 again, from the other direction: a LOADED battle already has a `createdAt`, and the
  // only place to read it is the loaded record (`BattleSummarySchema` omits it).
  it('preserves a loaded battle’s createdAt and bumps only updatedAt (AC3)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    await user.click(saveButton());
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));

    const record = savedRecord(saveSpy);
    expect(record.id).toBe(SKIRMISH.id);
    expect(record.createdAt.getTime()).toBe(SKIRMISH.createdAt.getTime());
    expect(record.updatedAt.getTime()).toBeGreaterThanOrEqual(SKIRMISH.updatedAt.getTime());
    expect(record.name).toBe(`${SKIRMISH.name}!`);
  });

  /**
   * AC3 / Decision H.2, end to end: an organism added from the sidebar dropdown this session but
   * never painted is session state, and the prune drops it from the RECORD.
   *
   * The other half is just as load-bearing and is asserted here too: `organismIds` and `gridState`
   * come back BYTE-IDENTICAL to the loaded battle's. Every roster entry is still placed, so the
   * Decision E.2 remap is the identity — and a projection that shifted refs anyway (or that
   * appended the session id to `organismIds`) would show up right here as a reordered roster over
   * an unreordered grid.
   */
  it('prunes a session-added organism out of the saved record, leaving the placed set untouched (AC3)', async () => {
    const user = userEvent.setup();
    const repositories = createFakeRepositories({
      battles: [SKIRMISH],
      organisms: ORGANISMS_WITH_CONWAY,
    });
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.selectOptions(
      within(screen.getByRole('complementary')).getByRole('combobox', { name: /add organism/i }),
      CONWAYS_CLASSIC.id,
    );
    // The add is visible in the SESSION — the row is in the sidebar — and must not be in the record.
    expect(
      within(screen.getByRole('complementary')).getByRole('button', { name: CONWAYS_CLASSIC.name }),
    ).toBeInTheDocument();

    await user.type(nameField(), '!');
    await user.click(saveButton());
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));

    const record = savedRecord(saveSpy);
    expect(record.organismIds).not.toContain(CONWAYS_CLASSIC.id);
    expect(record.organismIds).toEqual(SKIRMISH.organismIds);
    expect(record.gridState).toEqual(SKIRMISH.gridState);
    // ...and the SESSION still has it afterwards. A save is a projection, not a state transition:
    // clearing `sessionRoster` would take an organism the user just added out of their sidebar and
    // put it back in the add dropdown (Dev Notes → *what a save does NOT do*).
    expect(
      within(screen.getByRole('complementary')).getByRole('button', { name: CONWAYS_CLASSIC.name }),
    ).toBeInTheDocument();
  });

  // AC4: never optimistically. Clearing before the await would report success for a write that
  // then throws — RFC-006 Decision 7 ties the dirty-flag clear to the write succeeding.
  it('keeps isDirty true for the whole in-flight write, and clears it only on resolve (AC4)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(repositories.battles, 'save').mockReturnValue(pending);
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    await user.click(saveButton());

    // Still dirty, and SAVE is unavailable — a second interleaved read-modify-write over the one
    // `gol:battles` key can lose one of the two (AC4, trap 7).
    expect(dirtyValue(container)).toBe('true');
    await waitFor(() => expect(saveButton()).toBeDisabled());

    release?.();
    await waitFor(() => expect(dirtyValue(container)).toBe('false'));
  });

  /**
   * THE EDIT LOCK (Sidiar's call, 2026-08-28, settling the code review's decision-needed finding).
   *
   * `handleSave` projects its record BEFORE the await and clears `isDirty` when the write RESOLVES.
   * Anything the user changed in between is therefore reported saved and never written — the one
   * failure mode this story cannot tolerate, and invisible in every other test here because they
   * all resolve the write before touching the editor again. The fix refuses the edit instead, so
   * these tests assert the REFUSAL: state unchanged during the window, and the record that reaches
   * the repository unaffected by what was attempted.
   *
   * ⚠️ Each of the three mutation seams is covered separately. They are guarded independently in
   * `<BattlePage>` (`handleNameChange`, `handleCommitGrid`, `handleUndo`), so one test passing says
   * nothing about the other two — and the canvas seam is the one with no `disabled` attribute to
   * fall back on.
   */
  describe('refuses every editor mutation while a write is in flight', () => {
    /** Story 2.12's live readout, which is the only view of the grid a unit test can read back.
     * `role="group"` with an `aria-label` of `Living Cells: N` (`<EditorStatusBar>`) — parsed
     * rather than matched against an expected string, so the assertion states a NUMBER.
     *
     * ⚠️ Scoped to the status bar's own named region (Story 2.14): the sidebar's Grid Info section
     * carries a second `Living Cells: N` group, by the mockup's own design, so an unscoped lookup
     * is ambiguous rather than wrong. */
    function livingCells(): number {
      const label = within(screen.getByRole('region', { name: 'Battle statistics' }))
        .getByRole('group', { name: /^Living Cells: \d+$/ })
        .getAttribute('aria-label');
      return Number(label?.replace('Living Cells: ', ''));
    }

    /** A save that hangs until released, so the in-flight window can be inspected. */
    function hangingSave(repositories: AppRepositories) {
      let release: (() => void) | undefined;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = vi.spyOn(repositories.battles, 'save').mockReturnValue(pending);
      return { spy, release: () => release?.() };
    }

    it('refuses a name edit, and the released save still reports the name it projected', async () => {
      const user = userEvent.setup();
      const repositories = seeded();
      const { spy, release } = hangingSave(repositories);
      render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

      await user.type(nameField(), '!');
      await user.click(saveButton());
      await waitFor(() => expect(saveButton()).toBeDisabled());

      // The visible half: the field is genuinely unavailable, not merely ignored.
      expect(nameField()).toBeDisabled();

      // The authoritative half. `user.type` on a disabled field is already a no-op, so the guard
      // is exercised directly through the same prop the field calls — otherwise this test would
      // pass with `handleNameChange` unguarded, proving only that `disabled` works.
      fireEvent.change(nameField(), { target: { value: 'Renamed Mid-Write' } });
      expect(nameField()).toHaveValue('Three-Way Skirmish!');

      release();
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      // The record is the one projected before the await, and the refused edit never reached it.
      expect(savedRecord(spy).name).toBe('Three-Way Skirmish!');
    });

    // The seam with no user-facing half: a canvas has no `disabled` attribute, so `handleCommitGrid`
    // is the only thing standing between a mid-write stroke and a falsely cleared dirty flag.
    it('refuses a canvas edit, leaving the grid it saved intact', async () => {
      const user = userEvent.setup();
      // The /battle/new fixture, not `seeded()`: a click only lands when `DEFAULT_TOOL` resolves
      // against the roster (trap 3 above), and it is built here rather than inside `renderNewRoute`
      // only so `battles.save` can be spied on.
      const repositories = createFakeRepositories({
        battles: [],
        organisms: ORGANISMS_WITH_CONWAY,
      });
      const { spy, release } = hangingSave(repositories);
      const { container, canvas } = await renderNewRoute(repositories);

      click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 5, 5));
      expect(dirtyValue(container)).toBe('true');

      await user.click(saveButton());
      await waitFor(() => expect(saveButton()).toBeDisabled());

      // A second, different cell, attempted mid-write.
      click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 6, 6));

      // ⚠️ THE assertion — read through Story 2.12's live "Living Cells" readout, because the
      // saved RECORD cannot show this: it was projected before the await and reads 1 either way.
      // Without the guard the stroke commits, this says 2, and the release below then clears
      // `isDirty` over a grid holding a cell that never reached the store.
      expect(livingCells()).toBe(1);

      release();
      await waitFor(() => expect(dirtyValue(container)).toBe('false'));

      // `isDirty === false` is now a true statement about the grid on screen: one cell, and it is
      // the one in the record.
      expect(livingCells()).toBe(1);
      expect(savedRecord(spy).gridState[5]?.[5]).toBeGreaterThan(0);
    });

    it('refuses an undo, so the dirty flag never clears over a rewound grid', async () => {
      const user = userEvent.setup();
      const repositories = createFakeRepositories({
        battles: [],
        organisms: ORGANISMS_WITH_CONWAY,
      });
      const { spy, release } = hangingSave(repositories);
      const { container, canvas } = await renderNewRoute(repositories);

      click(canvas, centreOfCell(canvas, NEW_ROUTE_SIZE, 5, 5));
      await user.click(saveButton());
      await waitFor(() => expect(saveButton()).toBeDisabled());

      // The `disabled` attribute IS the block for undo, and it is asserted rather than bypassed:
      // there is no other undo path in the app today (3.19's hotkeys are the first, and are why
      // `handleUndo` carries a guard of its own — belt to this brace, not covered here).
      // ⚠️ Disabled even though `canUndo` is TRUE: there is history, so this can only be `isSaving`.
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

      release();
      await waitFor(() => expect(dirtyValue(container)).toBe('false'));

      // Nothing was rewound: the ring still holds its one commit (so UNDO is available again) and
      // the cell that reached the store is still on the grid.
      expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
      expect(livingCells()).toBe(1);
      expect(savedRecord(spy).gridState[5]?.[5]).toBeGreaterThan(0);
    });

    // The lock LIFTS. A guard that never released would be a worse bug than the one it fixes.
    it('accepts edits again once the write has resolved', async () => {
      const user = userEvent.setup();
      const repositories = seeded();
      const { release } = hangingSave(repositories);
      const { container } = render(
        <BattlePage repositories={repositories} battleId={SKIRMISH.id} />,
      );
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

      await user.type(nameField(), '!');
      await user.click(saveButton());
      await waitFor(() => expect(saveButton()).toBeDisabled());
      release();
      await waitFor(() => expect(dirtyValue(container)).toBe('false'));

      expect(nameField()).toBeEnabled();
      await user.type(nameField(), '?');

      expect(nameField()).toHaveValue('Three-Way Skirmish!?');
      expect(dirtyValue(container)).toBe('true');
    });

    // A REFUSED write must also lift the lock, or a user who hit quota could never edit their way
    // out of it — the `finally` block is what guarantees this, and nothing else asserted it.
    it('accepts edits again after a write that FAILED', async () => {
      const user = userEvent.setup();
      const repositories = seeded();
      vi.spyOn(repositories.battles, 'save').mockRejectedValue(
        new QuotaExceededError('gol:battles'),
      );
      const { container } = render(
        <BattlePage repositories={repositories} battleId={SKIRMISH.id} />,
      );
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

      await user.type(nameField(), '!');
      await user.click(saveButton());
      await screen.findByRole('alert');

      expect(nameField()).toBeEnabled();
      await user.type(nameField(), '?');

      expect(nameField()).toHaveValue('Three-Way Skirmish!?');
      expect(dirtyValue(container)).toBe('true');
    });
  });

  /**
   * AC5 / NFR-7.2 / AR-14: a refused write is non-destructive, says so, and leaves the editor
   * exactly as it was. The candidate-string-then-`setItem` half is already proven by Story 1.4
   * (`writeKey`); this is the UI half.
   *
   * ⚠️ The fixture replaces ONE method on a real fake (the established pattern in this file) —
   * `mockWorkspace.ts` is never edited for a fixture; its battles are asserted by that package's
   * own tests and by the gallery e2e.
   */
  it('reports a quota failure non-destructively and leaves the battle dirty (AC5)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    vi.spyOn(repositories.battles, 'save').mockRejectedValue(new QuotaExceededError('gol:battles'));
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    await user.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/storage is full/i);
    expect(alert).toHaveTextContent(/unchanged/i);
    // The indicator the user relies on survives the failure (RFC-006 Decision 7: the failed write
    // "also fails the dirty-flag clear").
    expect(dirtyValue(container)).toBe('true');
    // ...and SAVE is available again, so the user can retry once they have freed space.
    await waitFor(() => expect(saveButton()).toBeEnabled());
    // Nothing about the editor moved: the name they typed, the roster and the heading are intact.
    expect(nameField()).toHaveValue(`${SKIRMISH.name}!`);
    for (const organism of organisms) {
      expect(screen.getByRole('button', { name: organism.name })).toBeInTheDocument();
    }
  });

  // A different fact needing different copy: `battles.save()` READS the whole collection first,
  // so an unparseable `gol:battles` fails the save before any write is attempted. There is no
  // space to free and nothing the editor can do about it.
  it('reports an unreadable store with its own copy, not the storage-full copy (AC5)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    vi.spyOn(repositories.battles, 'save').mockRejectedValue(
      new CorruptDataError('gol:battles', 'not valid JSON'),
    );
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    await user.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be read/i);
    expect(alert).not.toHaveTextContent(/storage is full/i);
  });

  // ❌ Never swallowed: an unreported save failure is the worst outcome available to this story,
  // so an error with no class of its own still reaches the user.
  it('reports an unrecognised failure with a generic non-destructive message (AC5)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    vi.spyOn(repositories.battles, 'save').mockRejectedValue(new Error('something else entirely'));
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    await user.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be saved/i);
    expect(alert).toHaveTextContent(/nothing already stored was changed/i);
    expect(dirtyValue(container)).toBe('true');
  });

  // ❌ No organism writes anywhere in this story — a save writes battles and nothing else
  // (`organisms.save` is already asserted un-called elsewhere in this file; this pins it across
  // the one action that could plausibly have reached for it).
  it('writes no organism and no settings record when saving a battle', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const organismSaveSpy = vi.spyOn(repositories.organisms, 'save');
    const settingsSaveSpy = vi.spyOn(repositories.settings, 'save');
    const battleSaveSpy = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    await user.click(saveButton());
    await waitFor(() => expect(battleSaveSpy).toHaveBeenCalledTimes(1));

    expect(organismSaveSpy).not.toHaveBeenCalled();
    expect(settingsSaveSpy).not.toHaveBeenCalled();
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

/**
 * Story 2.14 — edit-mode grid resize (AC2, AC4, AC5, AC7).
 *
 * `<BattlePage>` is the only level at which the resize, the undo ring, the dirty flag and the save
 * projection are all observable together — and the level at which a resize is a LIVE `size` change
 * on a mounted canvas, which is the thing the story is actually risky about.
 *
 * ⚠️ There is no `<BattlePage>` change in this story: the resize arrives at the existing
 * `handleCommitGrid` and `size` re-derives from `grid` in the same commit. These tests exist to
 * prove that, not to cover something new here.
 */
describe('BattlePage — edit-mode grid resize (Story 2.14)', () => {
  /**
   * A 100 x 60 battle with one cell in the FAR corner (99, 59).
   *
   * ⚠️ Built rather than reused: the mock workspace's own 100 x 60 battle places its roster in the
   * middle of the grid, so shrinking it to 50 x 30 clips nothing and applies silently — a fixture
   * that makes the shrink tests below pass for the wrong reason. The corner cell is what makes the
   * warning reachable at all.
   */
  const CLIPPING_BATTLE: Battle = (() => {
    const source = battles.find((b) => b.id === MOCK_BATTLE_IDS.battleB) as Battle;
    const gridState = source.gridState.map((row) => [...row]);
    gridState[59][99] = 1; // ref 1 -> the first roster id, so nothing dangles.
    return { ...source, gridState };
  })();

  function dirtyValue(container: HTMLElement): string | null {
    const root = container.querySelector('[data-dirty]');
    if (root === null) throw new Error('Root (data-dirty) not found');
    return root.getAttribute('data-dirty');
  }

  function gridSizeFact(): string {
    const group = within(screen.getByRole('complementary')).getByRole('group', {
      name: /^Grid Size: /,
    });
    return group.getAttribute('aria-label') ?? '';
  }

  // AC2 + AC4 + AC7 in one journey: a GROW commits with no dialog, marks the battle dirty, and the
  // canvas survives the live `size` change (an unmounted editor would take every later query with
  // it).
  it('grows the grid in ONE undoable commit, marks it dirty, and keeps the editor mounted', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(gridSizeFact()).toBe('Grid Size: 50 by 30');
    expect(dirtyValue(container)).toBe('false');

    await user.click(screen.getByRole('radio', { name: '100 by 60' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(gridSizeFact()).toBe('Grid Size: 100 by 60');
    expect(dirtyValue(container)).toBe('true');
    expect(await findEditorCanvas(container)).toBeInTheDocument();
    // ONE commit, therefore ONE ring entry: UNDO is available exactly once.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  // AC4, and the one genuinely new consequence of this story: UNDO now changes `size` too. The
  // groundwork is `useUndoableGrid`'s dimension-carrying snapshot — this VERIFIES it end to end
  // rather than rebuilding it, including the renderer reconstruction the reverse change triggers.
  it('undo restores BOTH the previous dimensions and the previous content (AC4)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const livingBefore = within(screen.getByRole('region', { name: 'Battle statistics' }))
      .getByRole('group', { name: /^Living Cells: \d+$/ })
      .getAttribute('aria-label');

    await user.click(screen.getByRole('radio', { name: '100 by 60' }));
    expect(gridSizeFact()).toBe('Grid Size: 100 by 60');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(gridSizeFact()).toBe('Grid Size: 50 by 30');
    // Content, not just dimensions: a grow adds only empty cells, so the population is identical
    // on the way out and on the way back.
    expect(
      within(screen.getByRole('region', { name: 'Battle statistics' }))
        .getByRole('group', { name: /^Living Cells: \d+$/ })
        .getAttribute('aria-label'),
    ).toBe(livingBefore);
    // The dish repainted at the old size rather than throwing out of a passive effect (AC7).
    expect(await findEditorCanvas(container)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  // AC3 at the page level: the warning fires on a real battle whose cells reach past the smaller
  // preset, and cancelling leaves the battle CLEAN — no commit, no ring entry, no dirty flag.
  it('warns before a shrink that clips, and a cancel leaves the battle untouched (AC3)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const { container } = render(
      <BattlePage repositories={seeded([CLIPPING_BATTLE])} battleId={CLIPPING_BATTLE.id} />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Grand Colony War' });

    await user.click(screen.getByRole('radio', { name: '50 by 30' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(gridSizeFact()).toBe('Grid Size: 100 by 60');
    expect(dirtyValue(container)).toBe('false');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('a confirmed shrink commits once, at the smaller size, and is undoable (AC3, AC4)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const { container } = render(
      <BattlePage repositories={seeded([CLIPPING_BATTLE])} battleId={CLIPPING_BATTLE.id} />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Grand Colony War' });

    await user.click(screen.getByRole('radio', { name: '50 by 30' }));
    await user.click(await screen.findByRole('button', { name: 'Resize Grid' }));

    await waitFor(() => expect(gridSizeFact()).toBe('Grid Size: 50 by 30'));
    expect(dirtyValue(container)).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(gridSizeFact()).toBe('Grid Size: 100 by 60');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  /**
   * AC5. `projectBattleForSave` reads `gridSize` off the LIVE grid, and its own comment says Story
   * 2.14 "then needs no change here" — this is the test that claim was owed, at the unit level.
   * ⚠️ A TEST, not an edit: if this ever needs a change in the save path, that comment is wrong.
   */
  it('persists the NEW size on save, from the live grid (AC5)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const repositories = seeded();
    const save = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.click(screen.getByRole('radio', { name: '100 by 60' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const record = save.mock.calls[0][0];
    expect(record.gridSize).toEqual({ cols: 100, rows: 60 });
    // The stored grid itself carries the new dimensions too — a record whose `gridSize` and
    // `gridState` disagreed would fail `BattleSchema`'s own superRefine on the next load.
    // (❌ Not `BattleSchema.safeParse(record)` here: the schema parses the SERIALISED shape, whose
    // timestamps are ISO strings, so it rejects an in-memory record for a reason unrelated to
    // this story. The round trip through the store is covered end to end in `battleRoute.spec.ts`.)
    expect(record.gridState).toHaveLength(60);
    expect(record.gridState[0]).toHaveLength(100);
  });

  // Trap 8 / the edit lock: the resize control is genuinely unavailable during a write, not merely
  // refused by `handleCommitGrid` after the click has already looked like it did something.
  it('disables the preset control while a save is in flight (trap 8)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const repositories = seeded();
    let release = () => {};
    vi.spyOn(repositories.battles, 'save').mockImplementation(
      () => new Promise<void>((resolve) => (release = () => resolve())),
    );
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    // Something to save.
    await user.type(screen.getByRole('textbox', { name: /battle name/i }), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('radio', { name: '100 by 60' })).toBeDisabled());
    expect(gridSizeFact()).toBe('Grid Size: 50 by 30');

    release();
    await waitFor(() => expect(dirtyValue(container)).toBe('false'));
    expect(screen.getByRole('radio', { name: '100 by 60' })).toBeEnabled();
  });
});

/**
 * Story 2.15 — Clear Petri Dish (AC2, AC3, AC5).
 *
 * `<BattlePage>` is the only level at which a Clear's commit, the undo ring, the dirty flag and
 * the save projection are all observable together. ⚠️ There is no `<BattlePage>` change in this
 * story: Clear arrives at the existing `handleCommitGrid`, exactly like the resize before it —
 * these tests exist to prove that, not to cover something new here.
 */
describe('BattlePage — Clear Petri Dish (Story 2.15)', () => {
  function dirtyValue(container: HTMLElement): string | null {
    const root = container.querySelector('[data-dirty]');
    if (root === null) throw new Error('Root (data-dirty) not found');
    return root.getAttribute('data-dirty');
  }

  function livingCellsFact(): string | null {
    return within(screen.getByRole('region', { name: 'Battle statistics' }))
      .getByRole('group', { name: /^Living Cells: \d+$/ })
      .getAttribute('aria-label');
  }

  function clearButton() {
    return screen.getByRole('button', { name: /clear petri dish/i });
  }

  it('clears in ONE undoable commit and marks the battle dirty (AC2)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    // SKIRMISH places a roster, so there is something to clear.
    expect(livingCellsFact()).not.toBe('Living Cells: 0');
    expect(dirtyValue(container)).toBe('false');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await user.click(clearButton());

    expect(livingCellsFact()).toBe('Living Cells: 0');
    expect(dirtyValue(container)).toBe('true');
    // ONE commit, therefore ONE ring entry.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    expect(await findEditorCanvas(container)).toBeInTheDocument();
  });

  it('UNDO after a Clear restores the painted cells (AC2)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const livingBefore = livingCellsFact();
    await user.click(clearButton());
    expect(livingCellsFact()).toBe('Living Cells: 0');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(livingCellsFact()).toBe(livingBefore);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(await findEditorCanvas(container)).toBeInTheDocument();
  });

  it('on an already-empty grid, the control is disabled and Undo stays disabled after a click (AC3)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    // /battle/new is a freshly-seeded, empty grid.
    const { container } = render(<BattlePage repositories={seeded()} battleId="new" />);
    await screen.findByRole('heading', { level: 1 });

    expect(livingCellsFact()).toBe('Living Cells: 0');
    expect(clearButton()).toBeDisabled();

    // ⚠️ Story 2.15 review: this test's title promised a click and the body never dispatched one.
    // The click is a no-op against the disabled control by design — but "nothing happened" is the
    // claim, so something has to be attempted for the assertions below to be about anything.
    await user.click(clearButton());

    expect(livingCellsFact()).toBe('Living Cells: 0');
    expect(dirtyValue(container)).toBe('false');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  // Trap 4: the Population row does NOT collapse to "Population: —" after a Clear — it lists
  // every roster organism, at 0, because it derives from `rosterIds`, never from placed cells.
  it('the Population row still lists the roster, at 0, after a Clear (trap 4)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const statsRegion = screen.getByRole('region', { name: 'Battle statistics' });
    expect(within(statsRegion).queryByText('Population')).toBeInTheDocument();
    const namesBefore = within(statsRegion)
      .getAllByRole('img')
      .map((entry) => entry.getAttribute('aria-label')?.replace(/: \d+$/, ''));
    expect(namesBefore.length).toBeGreaterThan(0);

    await user.click(clearButton());

    // ⚠️ Story 2.15 review: `getByText('Population')` alone passes in BOTH branches —
    // `<EditorStatusBar>` renders that label for the placeholder too — so the entries themselves
    // have to be read. THE SAME organisms, each now at 0: that is trap 4's actual claim, and the
    // thing a later story might "fix" by collapsing the row.
    expect(within(statsRegion).queryByLabelText(/population: none/i)).toBeNull();
    expect(
      within(statsRegion)
        .getAllByRole('img')
        .map((entry) => entry.getAttribute('aria-label')),
    ).toEqual(namesBefore.map((name) => `${name}: 0`));
  });

  /** Mirrors `describe('BattlePage — saving (Story 2.13)')`'s own `savedRecord` — the record
   * parsed through the REAL schema (AC5) rather than duck-typed, so trap 5's "the superRefine
   * PASSES on an empty organismIds" claim is proven against the actual schema, not restated. */
  function savedRecord(spy: ReturnType<typeof vi.spyOn>): Battle {
    const argument: unknown = (spy.mock.calls[0] as unknown[])[0];
    const parsed = BattleSchema.safeParse(JSON.parse(JSON.stringify(argument)));
    if (!parsed.success) {
      throw new Error(`saved record failed BattleSchema: ${JSON.stringify(parsed.error.issues)}`);
    }
    return parsed.data;
  }

  // Trap 5: Clear -> Save prunes every roster entry with no placed cell (Decision H.1), and the
  // schema permits the resulting empty array.
  it('a save after a Clear projects organismIds: [] with a valid gridState (trap 5, AC5)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const repositories = seeded();
    const save = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.click(clearButton());
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const record = savedRecord(save);
    expect(record.organismIds).toEqual([]);
    expect(record.gridState).toHaveLength(30);
    expect(record.gridState[0]).toHaveLength(50);
    expect(record.gridState.every((row) => row.every((cell) => cell === 0))).toBe(true);
  });

  // Trap 6 / the edit lock: Clear is genuinely unavailable during a write, not merely refused by
  // `handleCommitGrid` after the click already looked like it did something.
  it('disables the Clear control while a save is in flight (trap 6)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const repositories = seeded();
    let release = () => {};
    vi.spyOn(repositories.battles, 'save').mockImplementation(
      () => new Promise<void>((resolve) => (release = () => resolve())),
    );
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(screen.getByRole('textbox', { name: /battle name/i }), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(clearButton()).toBeDisabled());
    const livingDuringSave = livingCellsFact();

    release();
    await waitFor(() => expect(dirtyValue(container)).toBe('false'));
    expect(clearButton()).toBeEnabled();
    // Nothing cleared during the window it was disabled.
    expect(livingCellsFact()).toBe(livingDuringSave);
  });
});

/**
 * Story 2.16 — the FR-7.9/FR-7.10 guard matrix. This is where the three mechanisms meet: the
 * footer's Back press, the confirmation, and the navigation.
 *
 * ⚠️ The one test that could not exist before this story is "a save that REJECTS does not
 * navigate". `handleSave` is total — it catches its own rejection into `saveError` and resolves
 * either way — so an implementation that simply `await`s and then pushes would pass every other
 * test in this file while silently discarding the user's work. Forced decision 2's
 * `saveBattle(): Promise<boolean>` exists for that one assertion.
 */
describe('BattlePage — back navigation & the unsaved-changes guard (Story 2.16)', () => {
  function dirtyValue(container: HTMLElement): string | null {
    const root = container.querySelector('[data-dirty]');
    if (root === null) throw new Error('Root (data-dirty) not found');
    return root.getAttribute('data-dirty');
  }

  const backButton = () => screen.getByRole('button', { name: 'Back to Battles' });
  const nameField = () => screen.getByRole('textbox', { name: /battle name/i });

  /** Opens the confirmation from a genuinely dirty loaded battle: type into the name field (the
   * cheapest real mutation), then press Back. */
  async function openGuard(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
    await user.type(nameField(), '!');
    expect(dirtyValue(container)).toBe('true');
    await user.click(backButton());
    return await screen.findByRole('dialog', { name: 'Unsaved Changes' });
  }

  // AC2: the overwhelmingly common path — a battle opened, read, and left.
  it('a CLEAN battle navigates straight to the Gallery, with no dialog (AC2)', async () => {
    const user = userEvent.setup();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    expect(dirtyValue(container)).toBe('false');

    await user.click(backButton());

    // The ARGUMENT, not a URL: `/` is the Gallery's route, and the App Router resolves it against
    // the static export's `out/index.html` (trap 18 — never `/index.html`, never a relative path).
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a DIRTY battle opens the confirmation and navigates NOTHING (AC3)', async () => {
    const user = userEvent.setup();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const dialog = await openGuard(user, container);

    expect(dialog).toBeVisible();
    expect(dialog).toHaveTextContent('You have unsaved changes. Save before leaving?');
    expect(router.push).not.toHaveBeenCalled();
  });

  // AC3/AC7: Cancel changes NOTHING — the whole point of the option.
  it('Cancel writes nothing, navigates nowhere, and leaves the editor exactly as it was (AC3, AC7)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const save = vi.spyOn(repositories.battles, 'save');
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const dialog = await openGuard(user, container);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.push).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    // Still dirty — Cancel is not a save, and the edit survives it.
    expect(dirtyValue(container)).toBe('true');
    expect(nameField()).toHaveValue('Three-Way Skirmish!');
    // AC6: focus comes back to the control that opened the dialog, not to <body>.
    await waitFor(() => expect(backButton()).toHaveFocus());
  });

  // Escape is Cancel (AC6) — routed through the same `onClose` a backdrop click takes, because MUI
  // v9 removed `disableEscapeKeyDown`.
  it('Escape is Cancel: no navigation, no write, still dirty (AC6)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const save = vi.spyOn(repositories.battles, 'save');
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await openGuard(user, container);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.push).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(dirtyValue(container)).toBe('true');
  });

  // AC3: Discard leaves, losing the changes. Nothing is written — that is the whole distinction
  // from Save & Leave, and a `battles.save` call here would be a silent auto-save.
  it('Discard navigates and writes nothing at all (AC3)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const save = vi.spyOn(repositories.battles, 'save');
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const dialog = await openGuard(user, container);
    await user.click(within(dialog).getByRole('button', { name: 'Discard Changes' }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/');
    expect(save).not.toHaveBeenCalled();
    // ❌ And the flag is NOT cleared on the way out: `isDirty` stays true and the mount holding it
    // is about to die. Clearing it would be a lie with a one-frame lifetime.
    expect(dirtyValue(container)).toBe('true');
  });

  // AC3: the save lands FIRST, then the navigation — in that order, not merely both.
  it('Save & Leave persists through the existing save path, THEN navigates (AC3)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const order: string[] = [];
    const save = vi
      .spyOn(repositories.battles, 'save')
      .mockImplementation(async () => void order.push('save'));
    router.push.mockImplementation(() => void order.push('push'));
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const dialog = await openGuard(user, container);
    await user.click(within(dialog).getByRole('button', { name: 'Save & Leave' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'));
    expect(save).toHaveBeenCalledTimes(1);
    // ⚠️ ORDER, not membership: navigating first and saving into a dying mount is a real bug shape
    // that "both were called" cannot see.
    expect(order).toEqual(['save', 'push']);
  });

  /**
   * ⚠️ THE test forced decision 2 exists for. `handleSave` swallows its own rejection into
   * `saveError` and resolves either way, so an "await and go" implementation navigates over a
   * failed write — losing exactly the data FR-7.9 protects — and every other test in this file
   * stays green.
   *
   * Forced decision 5(a): the dialog closes, the user stays where they were, and Story 2.13's
   * existing `role="alert"` line reports the failure. No new copy, no second error surface.
   */
  it('a save that REJECTS does not navigate — it reports and stays (AC3, forced decision 2)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    vi.spyOn(repositories.battles, 'save').mockRejectedValue(new QuotaExceededError('gol:battles'));
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const dialog = await openGuard(user, container);
    await user.click(within(dialog).getByRole('button', { name: 'Save & Leave' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage/i);
    expect(router.push).not.toHaveBeenCalled();
    // The guard is still armed: the work is still unsaved, and the user is on the page that holds
    // it, with SAVE live again.
    expect(dirtyValue(container)).toBe('true');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  // Review regression (Story 2.16): `crypto.randomUUID()` used to sit ABOVE the `try` that
  // `saveBattle` builds around the write, on `/battle/new` only (a loaded battle's `existing?.id`
  // short-circuits it). A throw there skipped `catch`/`finally` entirely, leaving `savingRef`/
  // `isSaving` stuck `true` forever — invisible with the old fire-and-forget `handleSave`, but
  // `handleSaveAndLeave` now `await`s the outcome, so the same throw left `<UnsavedChangesDialog>`
  // open with all three buttons `disabled` (guarded by `pending`) and the background `inert` — no
  // escape short of a reload. This reddens on that placement and stays green with `id`/`createdAt`
  // computed inside `try`.
  it('a save that THROWS before the write (crypto.randomUUID unavailable) does not strand the dialog', async () => {
    const user = userEvent.setup();
    const repositories = createFakeRepositories({ battles: [], organisms: ORGANISMS_WITH_CONWAY });
    const randomUUID = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      // The real-world trigger the code comment names: a static export opened over plain `http://`
      // on a LAN IP is not a secure context, so `crypto.randomUUID` is `undefined` there — calling
      // it throws a `TypeError`, not a rejection `saveBattle`'s own `await` would catch.
      throw new TypeError('crypto.randomUUID is not a function');
    });
    const { container } = render(<BattlePage repositories={repositories} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    const dialog = await openGuard(user, container);
    await user.click(within(dialog).getByRole('button', { name: 'Save & Leave' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(dirtyValue(container)).toBe('true');
    // The bug shape: without the fix, the dialog stays open forever with every button disabled and
    // the edit lock never releases.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(backButton()).toBeEnabled();

    randomUUID.mockRestore();
  });

  // Forced decision 3(a): the visible half of the edit lock. The dialog's own Save would be
  // refused by `savingRef` while another write is in flight, and would then close without
  // navigating — a false-success UI. Disabling the control removes the path entirely.
  it('the Back control is unavailable while a save is in flight (forced decision 3a)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    let release = () => {};
    vi.spyOn(repositories.battles, 'save').mockImplementation(
      () => new Promise<void>((resolve) => (release = () => resolve())),
    );
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(backButton()).toBeDisabled());
    await user.click(backButton());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.push).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(dirtyValue(container)).toBe('false'));
    expect(backButton()).toBeEnabled();
  });

  // AC7: the guard's ONLY effect is navigation. It never reaches the commit seam, never touches
  // the roster, the name or the tool — a Back is not a commit.
  it('opening and cancelling the guard leaves the grid, the roster and the tool untouched (AC7)', async () => {
    const user = userEvent.setup();
    enableCanvasRendering();
    installPerCanvasRecording();
    const repositories = seeded();
    const save = vi.spyOn(repositories.battles, 'save');
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const rosterBefore = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-pressed'));
    const livingBefore = within(screen.getByRole('region', { name: 'Battle statistics' }))
      .getByRole('group', { name: /^Living Cells: \d+$/ })
      .getAttribute('aria-label');
    const undoBefore = screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled');

    const dialog = await openGuard(user, container);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(
      within(screen.getByRole('region', { name: 'Battle statistics' }))
        .getByRole('group', { name: /^Living Cells: \d+$/ })
        .getAttribute('aria-label'),
    ).toBe(livingBefore);
    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-pressed')),
    ).toEqual(rosterBefore);
    // The undo ring did not gain an entry: the name edit that made the battle dirty is not a grid
    // commit, and neither is anything the guard did.
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(undoBefore);
    expect(save).not.toHaveBeenCalled();
  });

  // AC7: the dialog can never appear on the not-found / error branches — they render before
  // `<BattleEditorView>` exists, and nothing there can be dirty. Every hook this story adds is
  // declared ABOVE those early returns (trap 17), which is what keeps this branch from being a
  // conditional-hook crash rather than a clean notice.
  it('renders the not-found notice with no footer and no dialog (AC7, trap 17)', async () => {
    render(<BattlePage repositories={seeded()} battleId="ffffffff-0000-4000-8000-000000000000" />);
    await screen.findByRole('heading', { level: 1, name: 'Battle Not Found' });

    expect(screen.queryByRole('button', { name: 'Back to Battles' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    // ⚠️ The OTHER back affordance, which this branch has always had and keeps (trap 14).
    expect(screen.getByRole('link', { name: 'Back to Gallery' })).toBeInTheDocument();
  });

  it('has no axe violations with the guard open (AC6)', async () => {
    const user = userEvent.setup();
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await openGuard(user, container);

    // `document.body`, not `container`: MUI portals the dialog out of `render()`'s own container,
    // so scoping this to `container` would silently scan a tree with no dialog in it.
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
