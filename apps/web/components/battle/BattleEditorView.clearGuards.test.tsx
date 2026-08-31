import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
import BattleEditorView from './BattleEditorView';

/**
 * Story 2.15 code review (2026-08-31) — the mutation check the story's Testing standards asked for
 * ("deleting the already-empty guard must redden the no-op test") and did not get.
 *
 * ⚠️ Why a dedicated file: `handleClear`'s two guards are unreachable through the real
 * `<EditorToolsSection>`, because that control is `disabled` on EXACTLY the two conditions the
 * guards test. React refuses to invoke `onClick` on a disabled `<button>` at all — a synthetic
 * `fireEvent.click` does not get past it either — so every test that drives the real control
 * measures the `disabled` expression and never the handler. Against `BattleEditorView.test.tsx`
 * and `BattlePage.test.tsx` as they stand, deleting `if (stats.livingCells === 0 || isSaving)
 * return;` outright leaves all 136 tests green.
 *
 * Mocking `<EditorToolsSection>` down to an always-ENABLED button is what makes the handler
 * reachable, and therefore falsifiable. `vi.mock` is module-scoped, which is why this is its own
 * file — the same split, and the same reason, as `BattleEditorView.statsMemo.test.tsx` and
 * `BattlePage.seedPreset.test.tsx`.
 *
 * These two tests are the belt to the control's braces (forced decision 1): the `disabled`
 * attribute is asserted in `BattleEditorView.test.tsx`; the handler is asserted here.
 */
vi.mock('./EditorToolsSection', () => ({
  default: ({ onClear }: { onClear(): void; disabled?: boolean }) => (
    // `disabled` is deliberately DROPPED: the point is to reach the handler the real control
    // makes unreachable. A mock that honoured it would reproduce the blind spot it exists to fill.
    <button type="button" onClick={onClear}>
      Clear Petri Dish
    </button>
  ),
}));

const COLORS = { background: '#0a0a0a', gridLine: 'rgb(51 51 51 / 0.3)' };
const SIZE = { cols: 2, rows: 2 };
const PALETTE: RefToFillGroup = {
  tokenIndex: Uint8Array.from([0, 0]),
  aging: Uint8Array.from([0, 0]),
  size: 2,
};
const ROSTER: readonly DisplayOrganism[] = [
  { id: CONWAYS_CLASSIC_ID, name: "Conway's Classic", color: '#56B4E9', colorToken: 'sky-blue' },
];

function makeGrid(width: number, height: number, occupant: number[]): RenderableGrid {
  return {
    width,
    height,
    occupant: Uint8Array.from(occupant),
    age: new Uint16Array(occupant.length),
  };
}

function renderEditor(
  overrides: { grid?: RenderableGrid; isSaving?: boolean; onCommitGrid?: () => void } = {},
) {
  const {
    grid = makeGrid(2, 2, [1, 0, 0, 1]),
    isSaving = false,
    onCommitGrid = () => {},
  } = overrides;
  return render(
    <BattleEditorView
      grid={grid}
      size={SIZE}
      palette={PALETTE}
      showGridLines
      colors={COLORS}
      rosterIds={ROSTER.map((organism) => organism.id)}
      roster={ROSTER}
      library={[]}
      onAddToRoster={() => {}}
      atCap={false}
      battleName=""
      onNameChange={() => {}}
      isDirty={false}
      onSave={() => {}}
      isSaving={isSaving}
      saveError={null}
      onCommitGrid={onCommitGrid}
      onUndo={() => {}}
      canUndo={false}
    />,
  );
}

describe('BattleEditorView — handleClear guards, reached directly (Story 2.15 review)', () => {
  function clearButton() {
    return screen.getByRole('button', { name: /clear petri dish/i });
  }

  // Reddens if `stats.livingCells === 0 ||` is dropped from `handleClear` (AC3).
  it('refuses the commit on an already-empty grid, even from an ENABLED control', () => {
    const onCommitGrid = vi.fn();
    renderEditor({ grid: makeGrid(2, 2, [0, 0, 0, 0]), onCommitGrid });

    fireEvent.click(clearButton());

    expect(onCommitGrid).not.toHaveBeenCalled();
  });

  // Reddens if `|| isSaving` is dropped from `handleClear` (trap 6). `<BattlePage>`'s
  // `handleCommitGrid` refuses under `savingRef` anyway, so this guard buys a click that is
  // genuinely inert rather than one that merely looks like it worked.
  it('refuses the commit while a save is in flight, even from an ENABLED control', () => {
    const onCommitGrid = vi.fn();
    renderEditor({ grid: makeGrid(2, 2, [1, 0, 0, 1]), isSaving: true, onCommitGrid });

    fireEvent.click(clearButton());

    expect(onCommitGrid).not.toHaveBeenCalled();
  });

  // The positive control: without this, both tests above would also pass on a `handleClear` that
  // never commits anything at all.
  it('commits exactly once on a populated grid that is not saving', () => {
    const onCommitGrid = vi.fn();
    renderEditor({ grid: makeGrid(2, 2, [1, 0, 0, 1]), onCommitGrid });

    fireEvent.click(clearButton());

    expect(onCommitGrid).toHaveBeenCalledTimes(1);
  });
});
