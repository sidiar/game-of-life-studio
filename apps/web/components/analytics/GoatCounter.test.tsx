import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import GoatCounter, { isProductionHost, usePageviewCounter } from './GoatCounter';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('isProductionHost', () => {
  it.each([
    ['game-of-life-studio.com', true],
    ['www.game-of-life-studio.com', true],
    ['localhost', false],
    ['127.0.0.1', false],
    ['sidiar.github.io', false],
    ['game-of-life-studio.com.evil.example', false],
  ])('%s → %s', (hostname, expected) => {
    expect(isProductionHost(hostname)).toBe(expected);
  });
});

describe('GoatCounter', () => {
  it('renders no script off the production host (jsdom is localhost)', () => {
    const { container } = render(<GoatCounter />);

    expect(container.innerHTML).toBe('');
    expect(document.querySelector('script[data-goatcounter]')).toBeNull();
  });
});

describe('usePageviewCounter', () => {
  afterEach(() => {
    delete window.goatcounter;
  });

  it('skips the first pathname (count.js counts the load) and counts each later change once', () => {
    const count = vi.fn();
    window.goatcounter = { count };

    const { rerender } = renderHook(({ path }) => usePageviewCounter(true, path), {
      initialProps: { path: '/' },
    });
    expect(count).not.toHaveBeenCalled();

    rerender({ path: '/about' });
    rerender({ path: '/about' });
    rerender({ path: '/battle' });

    expect(count.mock.calls).toEqual([[{ path: '/about' }], [{ path: '/battle' }]]);
  });

  it('counts nothing when disabled', () => {
    const count = vi.fn();
    window.goatcounter = { count };

    const { rerender } = renderHook(({ path }) => usePageviewCounter(false, path), {
      initialProps: { path: '/' },
    });
    rerender({ path: '/about' });

    expect(count).not.toHaveBeenCalled();
  });

  it('does not throw when count.js has not loaded yet', () => {
    const { rerender } = renderHook(({ path }) => usePageviewCounter(true, path), {
      initialProps: { path: '/' },
    });

    expect(() => rerender({ path: '/about' })).not.toThrow();
  });
});
