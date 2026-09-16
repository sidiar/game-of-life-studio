import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import CycleCounter from './CycleCounter';

// The value node is Counter > Value (container > div > div) — read directly rather than through
// `getByText`: the visible glyph run is split across the `aria-hidden` padding span and a bare
// text node (FD6), so RTL's default matcher (an element's OWN text nodes only) never sees
// `0042` as one string, and a `textContent` function matcher matches every ancestor instead.
// Exact `textContent` equality below, not `toHaveTextContent` (a substring match that would
// accept `00042` for `0042`).
function valueNode(container: HTMLElement) {
  return container.querySelector('div > div > div');
}

describe('CycleCounter (Story 3.14)', () => {
  // FD6: the padding lives in its own aria-hidden span, and the digits are NOT inside it — a
  // screen reader hears "0" at cycle 0, never "zero zero zero zero".
  it('renders 0 as 0000, with the hidden span holding only the padding zeros', () => {
    const { container } = render(<CycleCounter cycle={0} />);

    expect(valueNode(container)?.textContent).toBe('0000');
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden?.textContent).toBe('000');
  });

  it('zero-pads 42 to 0042', () => {
    const { container } = render(<CycleCounter cycle={42} />);

    expect(valueNode(container)?.textContent).toBe('0042');
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('00');
  });

  // A four-digit cycle needs no padding span at all.
  it('renders 9999 with no padding span', () => {
    const { container } = render(<CycleCounter cycle={9999} />);

    expect(valueNode(container)?.textContent).toBe('9999');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  // No truncation, no modulo: a five-digit cycle simply grows.
  it('renders 12345 in full, with no truncation', () => {
    const { container } = render(<CycleCounter cycle={12345} />);

    expect(valueNode(container)?.textContent).toBe('12345');
  });

  it('has no axe violations at 0 or 12345', async () => {
    for (const cycle of [0, 12345]) {
      const { container, unmount } = render(<CycleCounter cycle={cycle} />);
      expect((await axe(container)).violations).toEqual([]);
      unmount();
    }
  });
});
