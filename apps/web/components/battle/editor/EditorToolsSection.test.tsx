import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditorToolsSection from './EditorToolsSection';

describe('EditorToolsSection', () => {
  it('renders the CLEAR PETRI DISH button', () => {
    render(<EditorToolsSection onClear={() => {}} />);

    expect(screen.getByRole('button', { name: /clear petri dish/i })).toBeInTheDocument();
  });

  it('calls onClear exactly once per click', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<EditorToolsSection onClear={onClear} />);

    await user.click(screen.getByRole('button', { name: /clear petri dish/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  // AC4: the mockup's other three tool buttons are not in the MVP at all — asserted by NAME, the
  // same NFR-4.1 absence-guard convention `<BattleEditorView>`'s own sidebar test uses.
  it('renders NO Export, Reset-to-Saved or Randomize control (AC4)', () => {
    render(<EditorToolsSection onClear={() => {}} />);

    expect(screen.queryByRole('button', { name: /export battle/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reset to saved/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /randomize/i })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('a disabled control blocks the callback (the visible half of the edit lock)', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<EditorToolsSection onClear={onClear} disabled />);

    const button = screen.getByRole('button', { name: /clear petri dish/i });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(onClear).not.toHaveBeenCalled();
  });

  it('is a real <button type="button">, keyboard-operable', () => {
    render(<EditorToolsSection onClear={() => {}} />);

    const button = screen.getByRole('button', { name: /clear petri dish/i });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  // Story 5.6 (AC1): absent → not rendered, matching NFR-4.1's "no dead affordance" convention.
  it('renders no Export Battle control when onExport is absent', () => {
    render(<EditorToolsSection onClear={() => {}} />);

    expect(screen.queryByRole('button', { name: /export battle/i })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  describe('onExport supplied (Story 5.6)', () => {
    it('renders Export Battle below Clear Petri Dish, with data-export-battle', () => {
      render(<EditorToolsSection onClear={() => {}} onExport={() => {}} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.map((button) => button.textContent)).toEqual([
        'Clear Petri Dish',
        'Export Battle',
      ]);
      expect(screen.getByRole('button', { name: 'Export Battle' })).toHaveAttribute(
        'data-export-battle',
        '',
      );
    });

    it('calls onExport exactly once per click', async () => {
      const user = userEvent.setup();
      const onExport = vi.fn();
      render(<EditorToolsSection onClear={() => {}} onExport={onExport} />);

      await user.click(screen.getByRole('button', { name: 'Export Battle' }));

      expect(onExport).toHaveBeenCalledTimes(1);
    });

    // AC1: `exportDisabled` alone — NOT `disabled` (Clear's own prop, driven by livingCells too),
    // and NOT tied to any living-cell count.
    it('disables on exportDisabled alone, independent of the Clear disabled prop', () => {
      render(
        <EditorToolsSection
          onClear={() => {}}
          disabled={false}
          onExport={() => {}}
          exportDisabled
        />,
      );

      expect(screen.getByRole('button', { name: 'Export Battle' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Clear Petri Dish' })).toBeEnabled();
    });

    it('an exportDisabled control blocks the callback', async () => {
      const user = userEvent.setup();
      const onExport = vi.fn();
      render(<EditorToolsSection onClear={() => {}} onExport={onExport} exportDisabled />);

      await user.click(screen.getByRole('button', { name: 'Export Battle' }));

      expect(onExport).not.toHaveBeenCalled();
    });
  });
});
