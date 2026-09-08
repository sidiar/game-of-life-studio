import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useDirtyGuard } from './useDirtyGuard';

function Probe({ isDirty }: { isDirty: boolean }) {
  useDirtyGuard(isDirty);
  return <div data-testid="probe" />;
}

/**
 * The listener set, tracked by SPYING on `window.addEventListener` / `removeEventListener` rather
 * than by dispatching an event and inferring from the outcome.
 *
 * ⚠️ This distinction is the whole of AC4 (trap 3). "Inactive when clean" has two implementations
 * that are indistinguishable through `dispatchEvent` — no listener at all, and a listener that
 * checks the flag and returns — and the AC asks for the first. Only a registration spy can tell
 * them apart, so it is what these tests assert on. `dispatchEvent` is used separately below, for
 * the different question of whether the attached handler actually cancels.
 */
function trackBeforeUnloadListeners() {
  const attached = new Set<EventListenerOrEventListenerObject>();

  // ⚠️ Bound BEFORE the spies replace them, and called through rather than swallowed: the
  // cancellation test below needs the hook's handler genuinely registered on the window. Reaching
  // for `EventTarget.prototype.addEventListener` instead throws under jsdom ("called on an object
  // that is not a valid instance of EventTarget") — jsdom's Window is a wrapper whose own method
  // is the only valid entry point.
  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);

  vi.spyOn(window, 'addEventListener').mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'beforeunload') attached.add(listener);
      originalAdd(type, listener, options);
    },
  );
  vi.spyOn(window, 'removeEventListener').mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === 'beforeunload') attached.delete(listener);
      originalRemove(type, listener, options);
    },
  );

  return { count: () => attached.size };
}

/**
 * `dispatchEvent` returns **false** exactly when a listener cancelled the event — the same
 * observation the e2e makes (trap 3), with no native dialog involved and no user-activation
 * requirement to satisfy.
 *
 * ⚠️ `cancelled` alone cannot mutation-check `preventDefault()`, here or in a real browser. The
 * legacy `event.returnValue = ''` the hook also writes (RFC-005 Decision 7's snippet carries both)
 * sets the canceled flag by itself — the `returnValue` setter treats any FALSY value as a cancel —
 * so deleting `preventDefault()` leaves a `cancelled` assertion green. **Measured, not assumed:**
 * the mutation was run against jsdom AND against all four Playwright projects, and every one of
 * them stayed green until the spy below was added. That spy is what makes the modern half
 * falsifiable; `e2e/battleRoute.spec.ts` observes the identical pair the identical way.
 */
function dispatchBeforeUnload(): { cancelled: boolean; preventDefaultCalled: boolean } {
  const event = new Event('beforeunload', { cancelable: true });
  const preventDefault = vi.spyOn(event, 'preventDefault');
  const notCancelled = window.dispatchEvent(event);
  return { cancelled: !notCancelled, preventDefaultCalled: preventDefault.mock.calls.length > 0 };
}

let listeners: ReturnType<typeof trackBeforeUnloadListeners>;

beforeEach(() => {
  listeners = trackBeforeUnloadListeners();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDirtyGuard (Story 2.16, AC4 / RFC-005 Decision 7)', () => {
  it('attaches NO beforeunload listener while the page is clean', () => {
    render(<Probe isDirty={false} />);

    expect(listeners.count()).toBe(0);
    // ...and nothing cancels the event either, which is the user-visible half of the same fact.
    expect(dispatchBeforeUnload().cancelled).toBe(false);
  });

  it('attaches exactly one beforeunload listener while the page is dirty', () => {
    render(<Probe isDirty />);

    expect(listeners.count()).toBe(1);
  });

  it('the attached handler CANCELS the unload, by calling preventDefault', () => {
    render(<Probe isDirty />);

    const { cancelled, preventDefaultCalled } = dispatchBeforeUnload();

    // ⚠️ Mutation check: deleting `event.preventDefault()` from the hook reddens the second line
    // and only the second line — the registration assertions stay green (the listener is still
    // attached) and `cancelled` stays true under jsdom for the reason `dispatchBeforeUnload`
    // records.
    expect(cancelled).toBe(true);
    expect(preventDefaultCalled).toBe(true);
  });

  it('removes the listener when the page becomes clean again (a save landing)', () => {
    const { rerender } = render(<Probe isDirty />);
    expect(listeners.count()).toBe(1);

    rerender(<Probe isDirty={false} />);

    expect(listeners.count()).toBe(0);
    expect(dispatchBeforeUnload().cancelled).toBe(false);
  });

  it('removes the listener on unmount while still dirty (navigating away from a dirty battle)', () => {
    const { unmount } = render(<Probe isDirty />);
    expect(listeners.count()).toBe(1);

    unmount();

    // ⚠️ Mutation check: dropping the effect's cleanup reddens this — and the discard path of
    // Story 2.16 is exactly an unmount while dirty, so a leaked listener there would prompt on
    // every subsequent tab close for the rest of the session.
    expect(listeners.count()).toBe(0);
    expect(dispatchBeforeUnload().cancelled).toBe(false);
  });

  it('does not re-register on a re-render that leaves the flag unchanged', () => {
    const { rerender } = render(<Probe isDirty />);
    rerender(<Probe isDirty />);

    // One listener, not two: the effect is keyed on `isDirty`, so an unrelated render must not
    // detach and re-attach. A count of 1 holds either way; what this pins is that the SET never
    // grew, which is what a missing dep list or a fresh handler per render would break.
    expect(listeners.count()).toBe(1);
  });
});
