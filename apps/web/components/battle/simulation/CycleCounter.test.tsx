import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import CycleCounter from './CycleCounter';

// The value node is the hidden span's parent — asserted directly rather than through
// `getByText`, whose default matcher walks every ancestor and finds the same collapsed text at
// each level of this single-child tree (a false "multiple elements" failure, not a real one).
function valueNode(container: HTMLElement) {
  const hidden = container.querySelector('[aria-hidden="true"]');
  return hidden ? hidden.parentElement : container.querySelector('div > div');
}

describe('CycleCounter (Story 3.14)', () => {
  // FD6: the padding lives in its own aria-hidden span, and the digits are NOT inside it — a
  // screen reader hears "0" at cycle 0, never "zero zero zero zero".
  it('renders 0 as 0000, with the hidden span holding only the padding zeros', () => {
    const { container } = render(<CycleCounter cycle={0} />);

    expect(valueNode(container)).toHaveTextContent('0000');
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden).toHaveTextContent('000');
    expect(hidden?.textContent).not.toContain('0000');
  });

  it('zero-pads 42 to 0042', () => {
    const { container } = render(<CycleCounter cycle={42} />);

    expect(valueNode(container)).toHaveTextContent('0042');
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('00');
  });

  // A four-digit cycle needs no padding span at all.
  it('renders 9999 with no padding span', () => {
    const { container } = render(<CycleCounter cycle={9999} />);

    expect(valueNode(container)).toHaveTextContent('9999');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  // No truncation, no modulo: a five-digit cycle simply grows.
  it('renders 12345 in full, with no truncation', () => {
    const { container } = render(<CycleCounter cycle={12345} />);

    expect(valueNode(container)).toHaveTextContent('12345');
  });

  it('has no axe violations at 0 or 12345', async () => {
    for (const cycle of [0, 12345]) {
      const { container, unmount } = render(<CycleCounter cycle={cycle} />);
      expect((await axe(container)).violations).toEqual([]);
      unmount();
    }
  });
});
