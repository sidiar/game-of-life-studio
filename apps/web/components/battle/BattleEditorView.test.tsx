import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RefToFillGroup } from '@/lib/canvas/refToFillGroup';
import type { RenderableGrid } from '@/lib/canvas/renderableGrid';
import BattleEditorView from './BattleEditorView';

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

describe('BattleEditorView', () => {
  it('renders the dish box and its canvas (AC1)', () => {
    const { container } = render(
      <BattleEditorView grid={GRID} size={SIZE} palette={PALETTE} showGridLines colors={COLORS} />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    // The editor's dish carries an accessible name (AC7) — the inverse of the Gallery tile's
    // aria-hidden snapshot.
    expect(canvas).toHaveAttribute('role', 'img');
  });

  // Same "unavailable -> blank dish, same box" degradation BattleTile uses (Task 6): never
  // substitute a literal colour (AR-46, and it would silently paint the wrong theme).
  it('renders the box WITHOUT a canvas when colors is null', () => {
    const { container } = render(
      <BattleEditorView grid={GRID} size={SIZE} palette={PALETTE} showGridLines colors={null} />,
    );

    expect(container.querySelector('canvas')).toBeNull();
  });

  // AC5 — this story is display-only: no sidebar, no status bar, no tool, no button, and no inert
  // placeholder standing in for any of them (NFR-4.1). Assert the ABSENCE, the way
  // BattleHeader.test.tsx asserts the mode toggle's absence — a presence-only check elsewhere
  // would still pass once a dead placeholder is added beside the canvas.
  it('renders no sidebar, status bar, tool, or button (AC5)', () => {
    render(
      <BattleEditorView grid={GRID} size={SIZE} palette={PALETTE} showGridLines colors={COLORS} />,
    );

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('complementary')).toHaveLength(0);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryAllByRole('toolbar')).toHaveLength(0);
  });
});
