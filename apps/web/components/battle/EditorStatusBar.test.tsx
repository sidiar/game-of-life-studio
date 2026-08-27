import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import EditorStatusBar from './EditorStatusBar';

describe('EditorStatusBar', () => {
  // FR-3.8: "the button is disabled when canUndo is false". A REAL `disabled` attribute, not a
  // CSS-only grey — assistive tech reads the attribute, and `toBeDisabled()` asserts exactly that
  // rather than a computed colour.
  it('disables the UNDO button when canUndo is false', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo={false} />);

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('enables the UNDO button when canUndo is true', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo />);

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('calls onUndo when the button is pressed', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<EditorStatusBar onUndo={onUndo} canUndo />);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('does not call onUndo while disabled', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<EditorStatusBar onUndo={onUndo} canUndo={false} />);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).not.toHaveBeenCalled();
  });

  // Task 4: keyboard-operable. The button is the only tab stop in the bar, and Enter activates it
  // — the native behaviour a `styled('button')` keeps and a `<div role="button">` would have had
  // to reimplement.
  it('is reachable by Tab and activated by Enter', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<EditorStatusBar onUndo={onUndo} canUndo />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  // NFR-4.1: the bar ships with UNDO and nothing else. A stats placeholder or a disabled SAVE
  // would be exactly the inert rendered control this project keeps refusing to build early.
  it('renders no stats row and no SAVE button (2.12 / 2.13 are not this story)', () => {
    render(<EditorStatusBar onUndo={() => {}} canUndo />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/generation/i)).toBeNull();
    expect(screen.queryByText(/living cells/i)).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull(); // the mockup's Grid Zoom — superseded (§9.1)
  });

  it('has no axe violations in either state', async () => {
    const enabled = render(<EditorStatusBar onUndo={() => {}} canUndo />);
    expect((await axe(enabled.container)).violations).toEqual([]);
    enabled.unmount();

    const disabled = render(<EditorStatusBar onUndo={() => {}} canUndo={false} />);
    expect((await axe(disabled.container)).violations).toEqual([]);
  });
});
