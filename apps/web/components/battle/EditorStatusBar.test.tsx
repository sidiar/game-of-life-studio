import type { ComponentProps } from 'react';
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

/**
 * Story 2.13: the prop set every render below shares, in ONE place. Thirteen call sites had
 * hand-copied it, so this story's three new props would have meant thirteen identical edits — the
 * same lesson `BattleEditorView.test.tsx`'s own `renderEditor` helper records, applied here.
 *
 * Defaults are the ENABLED, CLEAN, IDLE bar: `canUndo` true and `isDirty` false, so a test asking
 * about a disabled SAVE or an enabled UNDO overrides exactly the one thing it is about.
 */
function renderBar(overrides: Partial<ComponentProps<typeof EditorStatusBar>> = {}) {
  return render(
    <EditorStatusBar
      onUndo={() => {}}
      canUndo
      stats={EMPTY_STATS}
      onSave={() => {}}
      isDirty={false}
      isSaving={false}
      {...overrides}
    />,
  );
}

describe('EditorStatusBar', () => {
  // FR-3.8: "the button is disabled when canUndo is false". A REAL `disabled` attribute, not a
  // CSS-only grey — assistive tech reads the attribute, and `toBeDisabled()` asserts exactly that
  // rather than a computed colour.
  it('disables the UNDO button when canUndo is false', () => {
    renderBar({ canUndo: false });

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('enables the UNDO button when canUndo is true', () => {
    renderBar();

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('calls onUndo when the button is pressed', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    renderBar({ onUndo });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('does not call onUndo while disabled', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    renderBar({ onUndo, canUndo: false });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).not.toHaveBeenCalled();
  });

  // Story 2.8 Task 4: keyboard-operable, and Enter activates — the native behaviour a
  // `styled('button')` keeps and a `<div role="button">` would have had to reimplement.
  it('reaches UNDO by Tab and activates it with Enter', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    renderBar({ onUndo });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  /**
   * Story 2.13 (AC8), settling `deferred-work.md`'s ":371" entry: the previous version of this
   * test asserted `getAllByRole('button')` had length 1 and that no slider or SAVE existed — none
   * of which can FAIL on a tab stop. A `tabIndex={0}` on any stats element, or a link in the row,
   * passed it unchanged. That entry named this story as the one that "adds the second control to
   * this bar and will need a real tab-order assertion anyway"; this is it.
   *
   * ⚠️ The SAVE line INVERTED rather than being deleted (trap 5) — it is now a presence check —
   * while the slider line stays an absence check, because the Grid Zoom control is superseded
   * permanently (§9.1) rather than pending.
   */
  it('has exactly two tab stops, UNDO then SAVE, and the stats row adds none (AC8)', async () => {
    const user = userEvent.setup();
    renderBar({ stats: MIXED_STATS, isDirty: true });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await user.tab();
    // Focus has left the bar entirely — nothing in the stats row is reachable. `document.body` is
    // where jsdom parks focus once the last tabbable element is passed.
    expect(document.body).toHaveFocus();

    expect(screen.queryByRole('slider')).toBeNull(); // the mockup's Grid Zoom — superseded (§9.1)
  });

  // AC1, AC2: Generation is a literal 0, never state or a prop plumbed as if it could change.
  // AC5: each is a `role="group"` with a combined "label: value" accessible name.
  it('renders Generation as the literal 0, and Living Cells from stats', () => {
    renderBar({ stats: MIXED_STATS });

    expect(screen.getByRole('group', { name: 'Generation: 0' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Living Cells: 12' })).toBeInTheDocument();
  });

  // AC3: one Population entry per roster organism, each carrying the organism's colour and count.
  it('renders one population entry per organism, with a colour chip and the count', () => {
    renderBar({ stats: MIXED_STATS });

    const aggressive = screen.getByRole('img', { name: 'Aggressive Colonizer: 7' });
    expect(aggressive).toBeInTheDocument();
    const patient = screen.getByRole('img', { name: 'Patient Defender: 5' });
    expect(patient).toBeInTheDocument();
  });

  // AC3: "dropping to zero correctly when erased" — a zeroed organism still renders its own
  // labelled entry, reading 0, rather than vanishing from the row.
  it('renders a zeroed organism as a real entry reading 0, not an absence', () => {
    renderBar({ stats: ZEROED_STATS });

    expect(screen.getByRole('img', { name: 'Erased Organism: 0' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Aggressive Colonizer: 5' })).toBeInTheDocument();
  });

  // Task 4: an empty roster (or a battle with nothing placed) must not leave "Population"
  // dangling with nothing after it.
  it('renders a stated placeholder, not a dangling label, when there is nothing to populate', () => {
    renderBar();

    expect(screen.getByRole('group', { name: 'Population: none' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  // AC5 / forced decision 3(b): a NAMED REGION, not a live region — identifiable and navigable,
  // never announced. `role="status"` would interrupt the drag/undo flow with a number the user
  // just caused; nothing here asks for that.
  it('exposes the stats as a named region, not a live region', () => {
    renderBar({ stats: MIXED_STATS });

    expect(screen.getByRole('region', { name: 'Battle statistics' })).toBeInTheDocument();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  // Story 2.12 Task 5 / Story 2.13 AC8: axe-clean in every state this bar has — empty roster,
  // mixed counts, a zeroed organism, and (this story) clean / dirty / saving.
  it('has no axe violations across canUndo, stats and save states', async () => {
    const enabledMixed = renderBar({ stats: MIXED_STATS });
    expect((await axe(enabledMixed.container)).violations).toEqual([]);
    enabledMixed.unmount();

    const disabledEmpty = renderBar({ canUndo: false });
    expect((await axe(disabledEmpty.container)).violations).toEqual([]);
    disabledEmpty.unmount();

    const zeroed = renderBar({ stats: ZEROED_STATS });
    expect((await axe(zeroed.container)).violations).toEqual([]);
    zeroed.unmount();

    const dirty = renderBar({ stats: MIXED_STATS, isDirty: true });
    expect((await axe(dirty.container)).violations).toEqual([]);
    dirty.unmount();

    const saving = renderBar({ stats: MIXED_STATS, isDirty: true, isSaving: true });
    expect((await axe(saving.container)).violations).toEqual([]);
  });
});

// Story 2.13 (AC1, AC4): SAVE — the bar's second control and the first thing in `apps/web` that
// can write a battle.
describe('EditorStatusBar — SAVE (Story 2.13)', () => {
  // FR-7.8: "enabled exactly when isDirty". A REAL `disabled` attribute, never a CSS-only grey —
  // the same rule UNDO carries, and the reason `toBeDisabled()` is the assertion rather than a
  // computed colour.
  it('disables SAVE while the battle is clean', () => {
    renderBar({ isDirty: false });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('enables SAVE once the battle is dirty', () => {
    renderBar({ isDirty: true });

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  // AC4: a second save while one is in flight must not be possible — `battles.save()` is a
  // whole-collection read-modify-write, so two interleaved writes can lose one.
  it('disables SAVE while a save is in flight, even though the battle is still dirty', () => {
    renderBar({ isDirty: true, isSaving: true });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('calls onSave when SAVE is pressed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderBar({ isDirty: true, onSave });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onSave when SAVE is activated with Enter', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderBar({ isDirty: true, onSave });

    screen.getByRole('button', { name: 'Save' }).focus();
    await user.keyboard('{Enter}');

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does not call onSave while disabled', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderBar({ isDirty: false, onSave });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave while a save is in flight', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderBar({ isDirty: true, isSaving: true, onSave });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  // ❌ No "saved" toast and no success text (Dev Notes → *What NOT to build*): the disabled SAVE
  // button IS the success signal in the mockup. A save FAILURE is reported above the bar, by
  // `<BattleEditorView>`, never inside it — forced decision 4b, so that an arbitrary-length message
  // cannot reopen the `flexShrink: 0` overflow the 2026-08-28 review measured.
  it('reports neither success nor failure inside the bar', () => {
    renderBar({ isDirty: false });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/saved/i)).toBeNull();
  });
});
