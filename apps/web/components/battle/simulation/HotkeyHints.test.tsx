import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import HotkeyHints from './HotkeyHints';

const CHASSIS_ENTRIES = [
  { key: 'Space', label: 'Play/Pause' },
  { key: '→', label: 'Next', arrow: true },
  { key: 'Esc', label: 'Stop' },
] as const;

describe('HotkeyHints (Story 3.19, FD6)', () => {
  it('renders the lead text and every entry label (the mockup content, one flowing text run)', () => {
    const { container } = render(<HotkeyHints lead="Shortcuts: " entries={CHASSIS_ENTRIES} />);

    const text = container.textContent ?? '';
    expect(text).toContain('Shortcuts:');
    expect(text).toContain('Play/Pause');
    expect(text).toContain('Next');
    expect(text).toContain('Stop');
  });

  it('DOM text is sentence case — Space / Esc, not SPACE / ESC (trap 15)', () => {
    const { container } = render(<HotkeyHints lead="Shortcuts: " entries={CHASSIS_ENTRIES} />);

    const text = container.textContent ?? '';
    expect(text).toContain('Space');
    expect(text).toContain('Esc');
    expect(text).not.toContain('SPACE');
    expect(text).not.toContain('ESC');
  });

  it('renders one <kbd> per entry', () => {
    const { container } = render(<HotkeyHints lead="Shortcuts: " entries={CHASSIS_ENTRIES} />);

    expect(container.querySelectorAll('kbd')).toHaveLength(3);
  });

  it('the arrow entry hides its glyph and carries a visually-hidden "Right arrow" name', () => {
    render(<HotkeyHints entries={CHASSIS_ENTRIES} />);

    const glyph = screen.getByText('→');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Right arrow')).toBeInTheDocument();
  });

  it('no <kbd> carries an aria-label (generic role forbids an author-assigned name, trap 14)', () => {
    const { container } = render(<HotkeyHints lead="Shortcuts: " entries={CHASSIS_ENTRIES} />);

    container.querySelectorAll('kbd').forEach((kbd) => {
      expect(kbd).not.toHaveAttribute('aria-label');
    });
  });

  it('nothing in the hint is focusable', () => {
    const { container } = render(<HotkeyHints lead="Shortcuts: " entries={CHASSIS_ENTRIES} />);

    expect(container.querySelectorAll('button, a[href], input, [tabindex]')).toHaveLength(0);
  });

  it('has no axe violations', async () => {
    const { container } = render(<HotkeyHints lead="Shortcuts: " entries={CHASSIS_ENTRIES} />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
