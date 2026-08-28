import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
import BattleEditorView from './BattleEditorView';

// A dedicated file (not BattleEditorView.test.tsx) because `vi.mock` is module-scoped: mocking
// `computeEditorGridStats` there would swap it out under every other test in that suite. Same
// split, and the same reason, as `BattlePage.seedPreset.test.tsx` and
// `BattleGallery.gridLines.test.tsx`.
//
// Story 2.12 Task 3: proves the "recomputed per committed gesture, never per pointer-move
// (NFR-4.2)" claim from the OTHER direction than `BattleEditorView.test.tsx`'s
// "updates on commit" test — that a re-render carrying the SAME `grid`/`rosterIds` identities
// does NOT call the derivation again, which is the actual memoization guarantee spec §6 asks for.
vi.mock('@/lib/gridStats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gridStats')>();
  return { ...actual, computeEditorGridStats: vi.fn(actual.computeEditorGridStats) };
});

const COLORS = { background: '#0a0a0a', gridLine: 'rgb(51 51 51 / 0.3)' };
const SIZE = { cols: 2, rows: 2 };

function makeGrid(width: number, height: number, occupant: number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: new Uint16Array(occupant.length),
  };
}

function makeLut(tokenIndex: number[], aging: number[]): RefToFillGroup {
  return {
    tokenIndex: Uint8Array.from(tokenIndex),
    aging: Uint8Array.from(aging),
    size: tokenIndex.length,
  };
}

const GRID = makeGrid(2, 2, [1, 0, 0, 1]);
const PALETTE = makeLut([0, 0], [0, 0]);
const ROSTER: readonly DisplayOrganism[] = [
  { id: CONWAYS_CLASSIC_ID, name: "Conway's Classic", color: '#56B4E9', colorToken: 'sky-blue' },
];
const ROSTER_IDS = ROSTER.map((organism) => organism.id);

beforeEach(async () => {
  // `vi.mock` is module-scoped and this project's vitest config sets no `clearMocks`, so without
  // this the spy accumulates calls across tests.
  const { computeEditorGridStats } = await import('@/lib/gridStats');
  vi.mocked(computeEditorGridStats).mockClear();
});

describe('BattleEditorView — the stats memo does not rerun on an unrelated re-render (Story 2.12, AC4)', () => {
  it('calls computeEditorGridStats once per grid/rosterIds identity, not once per render', async () => {
    const { computeEditorGridStats } = await import('@/lib/gridStats');

    const { rerender } = render(
      <BattleEditorView
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines
        colors={COLORS}
        rosterIds={ROSTER_IDS}
        roster={ROSTER}
        library={[]}
        onAddToRoster={() => {}}
        atCap={false}
        battleName=""
        onNameChange={() => {}}
        onCommitGrid={() => {}}
        onUndo={() => {}}
        canUndo={false}
      />,
    );

    expect(computeEditorGridStats).toHaveBeenCalledTimes(1);

    // A re-render carrying the SAME `grid` and `rosterIds` identities, but a change to something
    // this derivation does not depend on (`showGridLines`, `canUndo`) — the shape of an unrelated
    // re-render an ancestor's state change would cause.
    rerender(
      <BattleEditorView
        grid={GRID}
        size={SIZE}
        palette={PALETTE}
        showGridLines={false}
        colors={COLORS}
        rosterIds={ROSTER_IDS}
        roster={ROSTER}
        library={[]}
        onAddToRoster={() => {}}
        atCap={false}
        battleName=""
        onNameChange={() => {}}
        onCommitGrid={() => {}}
        onUndo={() => {}}
        canUndo // changed
      />,
    );

    expect(computeEditorGridStats).toHaveBeenCalledTimes(1);

    // A NEW grid identity (a committed gesture) must recompute.
    const nextGrid = makeGrid(2, 2, [1, 1, 0, 1]);
    rerender(
      <BattleEditorView
        grid={nextGrid}
        size={SIZE}
        palette={PALETTE}
        showGridLines={false}
        colors={COLORS}
        rosterIds={ROSTER_IDS}
        roster={ROSTER}
        library={[]}
        onAddToRoster={() => {}}
        atCap={false}
        battleName=""
        onNameChange={() => {}}
        onCommitGrid={() => {}}
        onUndo={() => {}}
        canUndo
      />,
    );

    expect(computeEditorGridStats).toHaveBeenCalledTimes(2);
  });
});
