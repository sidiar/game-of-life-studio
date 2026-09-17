import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, type Battle } from '@gol/domain';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import type { BattleEditorViewProps } from './editor/BattleEditorView';
import type { BattleSimulationViewProps } from './simulation/BattleSimulationView';
import BattlePage from './BattlePage';

// ⚠️ MANDATORY (Story 2.16, trap 21): `useRouter()` throws outside an App Router context under RTL.
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: router.push }),
}));

/**
 * Story 3.11 (AC3, AC6, AC7, AC9): what `<BattlePage>` HANDS the two views across the flip —
 * asserted on prop IDENTITY, which only a props-recording mock can observe. The
 * `BattlePage.commitSeam.test.tsx` shape, in its own file because `vi.mock` is FILE-HOISTED and
 * would replace the real children for every test in `BattlePage.test.tsx`.
 *
 * `vi.mock` intercepts the `import()` inside `next/dynamic` too (module-graph level, trap 8), so
 * the Run recorder works — but the render is still async, hence the `waitFor`s.
 */

const editorRenders: BattleEditorViewProps[] = [];
const runRenders: BattleSimulationViewProps[] = [];

vi.mock('./editor/BattleEditorView', () => ({
  default: (props: BattleEditorViewProps) => {
    editorRenders.push(props);
    return (
      <div data-testid="editor">
        {/* An UNRELATED state change in `<BattlePage>` (drives `battleName`/`isDirty`, touches
            neither the grid nor the roster) — the identity assertions must survive it. */}
        <button type="button" onClick={() => props.onNameChange(`${props.battleName}x`)}>
          rename
        </button>
        <button
          type="button"
          onClick={() => {
            const next = {
              width: props.grid.width,
              height: props.grid.height,
              occupant: props.grid.occupant.slice(),
              age: props.grid.age,
            };
            next.occupant[0] = next.occupant[0] === 0 ? 1 : 0;
            props.onCommitGrid(next);
          }}
        >
          paint
        </button>
      </div>
    );
  },
}));

vi.mock('./simulation/BattleSimulationView', () => ({
  default: (props: BattleSimulationViewProps) => {
    runRenders.push(props);
    return <div data-testid="run" />;
  },
}));

const { battles, organisms } = createMockWorkspace();
const SKIRMISH = battles.find((b) => b.id === MOCK_BATTLE_IDS.battleA) as Battle;

// A non-default speed, so the `startingSpeed` assertion means something (the default is 10).
const SETTINGS = { ...DEFAULT_SETTINGS, defaultSpeed: 5 as const, gridLines: false };

afterEach(() => {
  editorRenders.length = 0;
  runRenders.length = 0;
  router.push.mockReset();
});

async function renderSkirmish() {
  const user = userEvent.setup();
  render(
    <BattlePage
      repositories={createFakeRepositories({ battles, organisms, settings: SETTINGS })}
      battleId={SKIRMISH.id}
    />,
  );
  await screen.findByRole('group', { name: 'Mode' });
  await waitFor(() => expect(editorRenders.length).toBeGreaterThan(0));
  return user;
}

async function enterRun(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Run' }));
  await waitFor(() => expect(runRenders.length).toBeGreaterThan(0));
  await screen.findByTestId('run');
}

// Story 3.17 (AC7(c), Trap 10): the OTHER entry — `initialMode="run"` — never mounts the editor at
// all, so `renderSkirmish`'s own wait (`editorRenders.length > 0`) would time out here. This waits
// on the RUN recorder instead, and the test using it asserts `editorRenders` is EMPTY at the
// moment the run view is found — the proof that "opens directly in Play Mode" means the editor
// never mounted, not merely that it was replaced.
async function renderSkirmishInRun() {
  render(
    <BattlePage
      repositories={createFakeRepositories({ battles, organisms, settings: SETTINGS })}
      battleId={SKIRMISH.id}
      initialMode="run"
    />,
  );
  await screen.findByRole('group', { name: 'Mode' });
  await waitFor(() => expect(runRenders.length).toBeGreaterThan(0));
  await screen.findByTestId('run');
}

describe('BattlePage — what the Run view receives (Story 3.11)', () => {
  it('hands the Run view the editor’s last `grid` as `initialGrid`, and the seeded settings (AC3)', async () => {
    const user = await renderSkirmish();
    const lastEditorGrid = (editorRenders.at(-1) as BattleEditorViewProps).grid;

    await enterRun(user);

    const run = runRenders.at(-1) as BattleSimulationViewProps;
    expect(run.initialGrid).toBe(lastEditorGrid);
    expect(run.startingSpeed).toBe(5);
    expect(run.showGridLines).toBe(false);
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  // AC7 / M14: one domain `Organism` per roster slot, in `rosterIds` order — which for a loaded
  // battle with nothing added this session IS `organismIds` order.
  it('hands the Run view the three Organism records in roster order, and the SAME palette (AC7, M14)', async () => {
    const user = await renderSkirmish();
    const editor = editorRenders.at(-1) as BattleEditorViewProps;

    await enterRun(user);

    const run = runRenders.at(-1) as BattleSimulationViewProps;
    expect(run.organisms.map((o) => o.id)).toEqual([...SKIRMISH.organismIds]);
    expect(run.organisms.map((o) => o.id)).toEqual([...editor.rosterIds]);
    // Structurally equal to the fixtures (the fake store round-trips through JSON, so identity
    // is the store's, not the fixture's) — a full `Organism`, rules included, never a summary.
    for (const organism of run.organisms) {
      expect(organism).toEqual(organisms.find((o) => o.id === organism.id));
    }
    // Trap 5: the LUT the engine's refs index is the one the editor painted with.
    expect(run.palette).toBe(editor.palette);
  });

  /**
   * The AC7 memo's whole point, and the test whose mutation is named: replace `useMemo` with a
   * per-render `rosterIds.map(...)` in `<BattlePage>` and this reddens — a fresh `organisms`
   * reference is a NEW SESSION to the hook (Story 3.10 FD2), so a re-render for an unrelated
   * reason would silently restart the run (and, in practice, crash with "Too many re-renders").
   */
  it('keeps the `organisms` identity stable across an unrelated re-render in Run mode (trap 3)', async () => {
    const user = await renderSkirmish();
    // Dirty first, so the Back guard has a dialog to open — the one `<BattlePage>` state change
    // reachable from Run mode this story that touches neither the roster nor the grid.
    await user.click(screen.getByRole('button', { name: 'rename' }));
    await enterRun(user);
    const before = runRenders.at(-1) as BattleSimulationViewProps;
    const rendersBefore = runRenders.length;

    before.onBack();
    await screen.findByRole('dialog', { name: 'Unsaved Changes' });

    // `<BattlePage>` re-rendered (the dialog's `leaveConfirming` flipped) with the Run view still
    // mounted, and handed it the SAME references.
    await waitFor(() => expect(runRenders.length).toBeGreaterThan(rendersBefore));
    const after = runRenders.at(-1) as BattleSimulationViewProps;
    expect(after.organisms).toBe(before.organisms);
    expect(after.palette).toBe(before.palette);
    expect(after.initialGrid).toBe(before.initialGrid);
    expect(router.push).not.toHaveBeenCalled();
  });

  // AC6: Run -> Lab remounts the editor over the SAME grid object, with the ring untouched.
  it('remounts the editor over the SAME grid with the same canUndo after Run → Lab (AC6, AC9)', async () => {
    const user = await renderSkirmish();
    await user.click(screen.getByRole('button', { name: 'paint' }));
    await waitFor(() => expect((editorRenders.at(-1) as BattleEditorViewProps).canUndo).toBe(true));
    const before = editorRenders.at(-1) as BattleEditorViewProps;

    await enterRun(user);
    expect((runRenders.at(-1) as BattleSimulationViewProps).initialGrid).toBe(before.grid);
    await user.click(screen.getByRole('button', { name: 'Lab' }));
    await screen.findByTestId('editor');

    const after = editorRenders.at(-1) as BattleEditorViewProps;
    expect(after.grid).toBe(before.grid);
    expect(after.canUndo).toBe(before.canUndo);
    expect(after.isDirty).toBe(true);
    expect(screen.queryByTestId('run')).toBeNull();
  });

  it('forwards the Run footer’s onBack to the same guard (AC9)', async () => {
    const user = await renderSkirmish();
    await enterRun(user);

    const run = runRenders.at(-1) as BattleSimulationViewProps;
    expect(run.backDisabled).toBe(false);
    // A CLEAN battle: the same `handleBack` navigates straight to the Gallery.
    run.onBack();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'));
  });

  // AC7(c) / Story 3.17: a run-first render receives the SAME props the toggle path receives —
  // proof that the seed feeds the identical prop-building code, not a second one.
  it('a run-first render (initialMode="run") never mounts the editor, and hands the Run view the same props the toggle path does (AC7(c))', async () => {
    await renderSkirmishInRun();

    expect(editorRenders).toHaveLength(0);
    expect(screen.queryByTestId('editor')).toBeNull();

    const run = runRenders.at(-1) as BattleSimulationViewProps;
    expect(run.initialGrid.width).toBe(SKIRMISH.gridSize.cols);
    expect(run.initialGrid.height).toBe(SKIRMISH.gridSize.rows);
    expect(run.organisms.map((o) => o.id)).toEqual([...SKIRMISH.organismIds]);
    expect(run.startingSpeed).toBe(5);
    expect(run.showGridLines).toBe(false);
    expect(run.backDisabled).toBe(false);
  });
});
