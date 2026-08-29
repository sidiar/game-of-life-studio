import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import GridSettingsSection, { EDITABLE_GRID_PRESETS } from './GridSettingsSection';

// Grid dimensions are parameters, never constants — but this control's two options ARE the schema's
// two literals (Decision A.2 / H-9), so the presets below are read from the exported array rather
// than re-typed. A test carrying its own `{ cols: 50, rows: 30 }` would keep passing after the
// array and the schema diverged.
const [SMALL, LARGE] = EDITABLE_GRID_PRESETS;

function renderSection(overrides: Partial<Parameters<typeof GridSettingsSection>[0]> = {}) {
  const onResize = vi.fn();
  const result = render(
    <GridSettingsSection
      gridSize={LARGE}
      stats={{ totalCells: LARGE.cols * LARGE.rows, livingCells: 127 }}
      onResize={onResize}
      {...overrides}
    />,
  );
  return { ...result, onResize };
}

describe('GridSettingsSection', () => {
  it('renders all three facts, with the size spoken as "by" rather than the × glyph (AC1)', () => {
    renderSection();

    expect(screen.getByRole('group', { name: 'Grid Size: 100 by 60' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total Cells: 6,000' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Living Cells: 127' })).toBeInTheDocument();
    // The mockup's visible text keeps the × (U+00D7) and the thousands separator. Scoped to the
    // fact row: the preset option below renders the same "100 × 60" string, deliberately.
    expect(
      within(screen.getByRole('group', { name: 'Grid Size: 100 by 60' })).getByText('100 × 60'),
    ).toBeInTheDocument();
    expect(screen.getByText('6,000')).toBeInTheDocument();
  });

  // Trap 1: the facts come from the GRID, never from a stored preset — so a size that is not one
  // of the two still renders truthfully, and simply matches no option.
  it('renders the grid’s real dimensions and cell count at a non-preset size (trap 1)', () => {
    renderSection({ gridSize: { cols: 7, rows: 3 }, stats: { totalCells: 21, livingCells: 4 } });

    expect(screen.getByRole('group', { name: 'Grid Size: 7 by 3' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total Cells: 21' })).toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('renders exactly the two EDITABLE presets, and marks the current one selected (AC1, AC8)', () => {
    renderSection();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: '100 by 60' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '50 by 30' })).not.toBeChecked();
    // ❌ No Play-mode sizes here, ever (Decision A.2, FR-4.9 — Story 3.16's ephemeral expansion).
    expect(screen.queryByRole('radio', { name: /150 by 90|200 by 120/ })).toBeNull();
  });

  it('exposes selection through more than colour: aria-checked AND a rendered mark (AC8)', () => {
    renderSection();

    const selected = screen.getByRole('radio', { name: '100 by 60' });
    // The NATIVE checked state, which is what the accessibility tree exposes as `checked` for a
    // real radio — no `aria-checked` attribute is written, and adding one would be a second source
    // for a fact the platform already carries.
    expect(selected).toBeChecked();
    // The ✓ is inside the SELECTED option's own label and nowhere else — the redundant visual
    // channel WCAG 1.4.1 asks for, and the one a CSS-only selected state would not provide.
    expect(selected.closest('label')).toHaveTextContent('✓');
    expect(screen.getByRole('radio', { name: '50 by 30' }).closest('label')).not.toHaveTextContent(
      '✓',
    );
  });

  it('calls onResize once with the OTHER preset when it is activated (AC1)', async () => {
    const user = userEvent.setup();
    const { onResize } = renderSection();

    await user.click(screen.getByRole('radio', { name: '50 by 30' }));

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(SMALL);
  });

  // Trap 7: an equal-but-new grid still pushes an undo entry and sets `isDirty`, which is a
  // user-visible lie about unsaved work. The native radio cannot fire for an already-checked
  // option — this asserts that platform behaviour is what the component actually relies on.
  it('calls NOTHING when the already-current preset is activated (trap 7)', async () => {
    const user = userEvent.setup();
    const { onResize } = renderSection();

    await user.click(screen.getByRole('radio', { name: '100 by 60' }));

    expect(onResize).not.toHaveBeenCalled();
  });

  // Trap 8: `handleCommitGrid` refuses commits while a save is in flight, so a live control here
  // would produce a click that appears to do nothing at all.
  it('disables BOTH presets while a save is in flight (trap 8)', async () => {
    const user = userEvent.setup();
    const { onResize } = renderSection({ disabled: true });

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '50 by 30' }));
    expect(onResize).not.toHaveBeenCalled();
  });

  it('is keyboard-reachable and operable, and arrow keys move within the group (AC8)', async () => {
    const user = userEvent.setup();
    const { onResize } = renderSection();

    await user.tab();
    // A radio GROUP takes one tab stop, landing on the checked member — the native semantics this
    // control borrows a real `<input type="radio">` for.
    expect(screen.getByRole('radio', { name: '100 by 60' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');

    expect(screen.getByRole('radio', { name: '50 by 30' })).toHaveFocus();
    expect(onResize).toHaveBeenCalledWith(SMALL);
  });

  it('names the group so the two options are identifiable (AC8)', () => {
    renderSection();

    expect(screen.getByRole('radiogroup', { name: 'Grid size preset' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderSection();

    expect((await axe(container)).violations).toEqual([]);
  });
});
