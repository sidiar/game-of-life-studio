import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import EditorStatusBar, { type EditorStatusBarStats } from './EditorStatusBar';

const EMPTY_STATS: EditorStatusBarStats = { livingCells: 0, perOrganism: [] };

const MIXED_STATS: EditorStatusBarStats = {
  livingCells: 12,
  perOrganism: [
    { organismId: 'a', name: 'Aggressive Colonizer', color: '#D55E00', count: 7 },
    { organismId: 'b', name: 'Patient Defender', color: '#56B4E9', count: 5 },
  ],
};

const ZEROED_STATS: EditorStatusBarStats = {
  livingCells: 5,
  perOrganism: [
    { organismId: 'a', name: 'Aggressive Colonizer', color: '#D55E00', count: 5 },
    { organismId: 'b', name: 'Erased Organism', color: '#56B4E9', count: 0 },
  ],
};

describe('EditorStatusBar', () => {
  // FR-3.8: "the button is disabled when canUndo is false". A REAL `disabled` attribute, not a
  // CSS-only grey — assistive tech reads the attribute, and `toBeDisabled()` asserts exactly that
  // rather than a computed colour.
  it('disables the UNDO button when canUndo is false', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo={false} stats={EMPTY_STATS} />);

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('enables the UNDO button when canUndo is true', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo stats={EMPTY_STATS} />);

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('calls onUndo when the button is pressed', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<EditorStatusBar onUndo={onUndo} canUndo stats={EMPTY_STATS} />);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('does not call onUndo while disabled', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<EditorStatusBar onUndo={onUndo} canUndo={false} stats={EMPTY_STATS} />);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).not.toHaveBeenCalled();
  });

  // Task 4: keyboard-operable. The button is the only tab stop in the bar, and Enter activates it
  // — the native behaviour a `styled('button')` keeps and a `<div role="button">` would have had
  // to reimplement.
  it('is reachable by Tab and activated by Enter', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<EditorStatusBar onUndo={onUndo} canUndo stats={EMPTY_STATS} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  // AC7: stats are text, not controls — UNDO stays the ONLY tab stop even once the stats row
  // renders real content. Converted from "renders no stats row" (2.12 is now this story).
  it('adds no new tab stop for the stats row (AC7)', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo stats={MIXED_STATS} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('slider')).toBeNull(); // the mockup's Grid Zoom — superseded (§9.1)
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull(); // Story 2.13
  });

  // AC1, AC2: Generation is a literal 0, never state or a prop plumbed as if it could change.
  // AC5: each is a `role="group"` with a combined "label: value" accessible name.
  it('renders Generation as the literal 0, and Living Cells from stats', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo stats={MIXED_STATS} />);

    expect(screen.getByRole('group', { name: 'Generation: 0' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Living Cells: 12' })).toBeInTheDocument();
  });

  // AC3: one Population entry per roster organism, each carrying the organism's colour and count.
  it('renders one population entry per organism, with a colour chip and the count', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo stats={MIXED_STATS} />);

    const aggressive = screen.getByRole('img', { name: 'Aggressive Colonizer: 7' });
    expect(aggressive).toBeInTheDocument();
    const patient = screen.getByRole('img', { name: 'Patient Defender: 5' });
    expect(patient).toBeInTheDocument();
  });

  // AC3: "dropping to zero correctly when erased" — a zeroed organism still renders its own
  // labelled entry, reading 0, rather than vanishing from the row.
  it('renders a zeroed organism as a real entry reading 0, not an absence', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo stats={ZEROED_STATS} />);

    expect(screen.getByRole('img', { name: 'Erased Organism: 0' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Aggressive Colonizer: 5' })).toBeInTheDocument();
  });

  // Task 4: an empty roster (or a battle with nothing placed) must not leave "Population"
  // dangling with nothing after it.
  it('renders a stated placeholder, not a dangling label, when there is nothing to populate', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo stats={EMPTY_STATS} />);

    expect(screen.getByRole('group', { name: 'Population: none' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  // AC5 / forced decision 3(b): a NAMED REGION, not a live region — identifiable and navigable,
  // never announced. `role="status"` would interrupt the drag/undo flow with a number the user
  // just caused; nothing here asks for that.
  it('exposes the stats as a named region, not a live region', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo stats={MIXED_STATS} />);

    expect(screen.getByRole('region', { name: 'Battle statistics' })).toBeInTheDocument();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  // Task 5: axe-clean in three states — empty roster, mixed counts, a zeroed organism — per AC7.
  it('has no axe violations across canUndo and stats states', async () => {
    const enabledMixed = render(<EditorStatusBar onUndo={() => {}} canUndo stats={MIXED_STATS} />);
    expect((await axe(enabledMixed.container)).violations).toEqual([]);
    enabledMixed.unmount();

    const disabledEmpty = render(
      <EditorStatusBar onUndo={() => {}} canUndo={false} stats={EMPTY_STATS} />,
    );
    expect((await axe(disabledEmpty.container)).violations).toEqual([]);
    disabledEmpty.unmount();

    const zeroed = render(<EditorStatusBar onUndo={() => {}} canUndo stats={ZEROED_STATS} />);
    expect((await axe(zeroed.container)).violations).toEqual([]);
  });
});
