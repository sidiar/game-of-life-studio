import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useInView } from './useInView';

function Probe({ rootMargin }: { rootMargin?: string }) {
  // Generic parameter, not a cast at the call site: the hook hands back a ref the <div> accepts
  // directly, so nothing here asserts a type the checker cannot verify.
  const [ref, inView] = useInView<HTMLDivElement>(rootMargin);
  return (
    <div ref={ref} data-testid="probe">
      {inView ? 'in-view' : 'not-in-view'}
    </div>
  );
}

class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number> = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  takeRecords = () => [];
  constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.rootMargin = (options?.rootMargin as string) ?? '';
    FakeIntersectionObserver.instances.push(this);
  }
  trigger(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

afterEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
});

describe('useInView', () => {
  // jsdom (30.x) has no IntersectionObserver, and is not polyfilled by the setup file — this is
  // the DEFAULT behaviour every other unit test in this project relies on.
  it('defaults to true when IntersectionObserver is undefined (jsdom)', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('in-view');
  });

  it('starts false and flips true once the observed element intersects, with the given rootMargin', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

    render(<Probe rootMargin="50px" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('not-in-view');

    const observer = FakeIntersectionObserver.instances.at(-1);
    expect(observer?.rootMargin).toBe('50px');
    observer?.trigger(true);

    expect(screen.getByTestId('probe')).toHaveTextContent('in-view');
  });

  it('stays true and disconnects once it has entered — a later scroll-away does not flip it back', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

    render(<Probe />);
    const observer = FakeIntersectionObserver.instances.at(-1);
    observer?.trigger(true);
    expect(screen.getByTestId('probe')).toHaveTextContent('in-view');
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not flip true on a non-intersecting entry', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

    render(<Probe />);
    const observer = FakeIntersectionObserver.instances.at(-1);
    observer?.trigger(false);
    expect(screen.getByTestId('probe')).toHaveTextContent('not-in-view');
  });
});
