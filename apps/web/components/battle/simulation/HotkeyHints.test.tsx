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

  it('keeps a real space on both sides of the aria-hidden bullet (the spaces are not inside it)', () => {
    const { container } = render(<HotkeyHints entries={CHASSIS_ENTRIES} />);

    const bullets = Array.from(container.querySelectorAll('[aria-hidden="true"]')).filter(
      (node) => node.textContent === '•',
    );
    expect(bullets).toHaveLength(2);
    for (const bullet of bullets) {
      expect(bullet.previousSibling?.textContent).toBe(' ');
      expect(bullet.nextSibling?.textContent).toBe(' ');
    }
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
