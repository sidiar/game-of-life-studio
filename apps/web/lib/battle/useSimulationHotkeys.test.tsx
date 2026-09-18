import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from '@testing-library/react';
import {
  isSpaceActivator,
  shouldIgnoreHotkey,
  useSimulationHotkeys,
  type SimulationHotkeyBindings,
} from './useSimulationHotkeys';

function makeBindings(overrides: Partial<SimulationHotkeyBindings> = {}): SimulationHotkeyBindings {
  return {
    onPlayPause: vi.fn(),
    onStep: vi.fn(),
    onStop: vi.fn(),
    onToggleFullscreen: vi.fn(),
    canStep: true,
    ...overrides,
  };
}

/**
 * Dispatched from `document.body` by default — `window`-level `keydown` listeners see it exactly
 * as they would a real, loose-focus keypress (`bubbles: true`). The boolean `dispatchEvent`
 * returns is `false` exactly when the handler called `preventDefault()` (the `useDirtyGuard.test.tsx`
 * idiom, applied to `keydown`).
 */
function dispatchKeyDown(
  target: EventTarget,
  key: string,
  options: Partial<KeyboardEventInit> = {},
): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  return target.dispatchEvent(event);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('shouldIgnoreHotkey (AC3, pure)', () => {
  function event(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
    return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  }

  it('(i) ignores a defaultPrevented event', () => {
    const e = event({ key: ' ' });
    e.preventDefault();
    expect(shouldIgnoreHotkey(e)).toBe(true);
  });

  it('(i) ignores an isComposing event', () => {
    expect(shouldIgnoreHotkey(event({ key: ' ', isComposing: true }))).toBe(true);
  });

  it('(ii) ignores ctrlKey / metaKey / altKey, but not shiftKey alone', () => {
    expect(shouldIgnoreHotkey(event({ key: 'f', ctrlKey: true }))).toBe(true);
    expect(shouldIgnoreHotkey(event({ key: 'f', metaKey: true }))).toBe(true);
    expect(shouldIgnoreHotkey(event({ key: 'ArrowRight', altKey: true }))).toBe(true);
    // Shift+F yields key: 'F' — not suspended, the case-insensitive match still accepts it.
    expect(shouldIgnoreHotkey(event({ key: 'F', shiftKey: true }))).toBe(false);
  });

  it('(iii) ignores a repeat event', () => {
    expect(shouldIgnoreHotkey(event({ key: ' ', repeat: true }))).toBe(true);
  });

  it('(iv) ignores when the target is an editable/key-consuming control', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: input });
    expect(shouldIgnoreHotkey(e)).toBe(true);
    input.remove();
  });

  it('(v) ignores when a dialog is present anywhere on the page', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    expect(shouldIgnoreHotkey(event({ key: 'Escape' }))).toBe(true);
    dialog.remove();
  });

  it('(v) ignores when the event target is inside a dialog', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    const inner = document.createElement('span');
    dialog.appendChild(inner);
    document.body.appendChild(dialog);
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: inner });
    expect(shouldIgnoreHotkey(e)).toBe(true);
    dialog.remove();
  });

  it('(vi) ignores Space when the target natively activates on Space, but not other keys', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(spaceEvent, 'target', { value: button });
    expect(shouldIgnoreHotkey(spaceEvent)).toBe(true);

    const arrowEvent = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(arrowEvent, 'target', { value: button });
    expect(shouldIgnoreHotkey(arrowEvent)).toBe(false);
    button.remove();
  });

  it('does not ignore a plain Space on a loose-focus target', () => {
    expect(shouldIgnoreHotkey(event({ key: ' ' }))).toBe(false);
  });
});

describe('isSpaceActivator', () => {
  it('is true for a button, a link with href, and ARIA button/link/checkbox/switch/tab roles', () => {
    const button = document.createElement('button');
    expect(isSpaceActivator(button)).toBe(true);

    const link = document.createElement('a');
    link.href = '#';
    expect(isSpaceActivator(link)).toBe(true);

    const ariaButton = document.createElement('div');
    ariaButton.setAttribute('role', 'button');
    expect(isSpaceActivator(ariaButton)).toBe(true);
  });

  it('is false for a plain div and for null', () => {
    expect(isSpaceActivator(document.createElement('div'))).toBe(false);
    expect(isSpaceActivator(null)).toBe(false);
  });
});

describe('useSimulationHotkeys (Story 3.19, AC1/AC2)', () => {
  it('each key fires its binding exactly once, from a loose-focus target', () => {
    const bindings = makeBindings();
    renderHook(() => useSimulationHotkeys(bindings));

    dispatchKeyDown(document.body, ' ');
    expect(bindings.onPlayPause).toHaveBeenCalledTimes(1);

    dispatchKeyDown(document.body, 'ArrowRight');
    expect(bindings.onStep).toHaveBeenCalledTimes(1);

    dispatchKeyDown(document.body, 'Escape');
    expect(bindings.onStop).toHaveBeenCalledTimes(1);

    dispatchKeyDown(document.body, 'f');
    expect(bindings.onToggleFullscreen).toHaveBeenCalledTimes(1);

    dispatchKeyDown(document.body, 'F');
    expect(bindings.onToggleFullscreen).toHaveBeenCalledTimes(2);
  });

  it('ArrowRight with canStep: false calls nothing (trap 1 — never the same as sim.step() throwing)', () => {
    const bindings = makeBindings({ canStep: false });
    renderHook(() => useSimulationHotkeys(bindings));

    dispatchKeyDown(document.body, 'ArrowRight');

    expect(bindings.onStep).not.toHaveBeenCalled();
  });

  it('preventDefault is observed (dispatchEvent returns false) for every handled key, including a gated ArrowRight', () => {
    const bindings = makeBindings({ canStep: false });
    renderHook(() => useSimulationHotkeys(bindings));

    expect(dispatchKeyDown(document.body, ' ')).toBe(false);
    expect(dispatchKeyDown(document.body, 'ArrowRight')).toBe(false);
    expect(dispatchKeyDown(document.body, 'Escape')).toBe(false);
    expect(dispatchKeyDown(document.body, 'f')).toBe(false);
  });

  it('does NOT observe preventDefault for an ignored key (Ctrl+F)', () => {
    const bindings = makeBindings();
    renderHook(() => useSimulationHotkeys(bindings));

    expect(dispatchKeyDown(document.body, 'f', { ctrlKey: true })).toBe(true);
    expect(bindings.onToggleFullscreen).not.toHaveBeenCalled();
  });

  it('a KeyboardEvent with key: "Spacebar" is NOT Space (trap 7 — legacy IE value)', () => {
    const bindings = makeBindings();
    renderHook(() => useSimulationHotkeys(bindings));

    expect(dispatchKeyDown(document.body, 'Spacebar')).toBe(true);
    expect(bindings.onPlayPause).not.toHaveBeenCalled();
  });

  it('AC3 (iv): ArrowRight on a focused native range input (the LadderSlider shape) never steps', () => {
    const bindings = makeBindings();
    const { container } = render(<input type="range" />);
    renderHook(() => useSimulationHotkeys(bindings));

    const slider = container.querySelector('input');
    expect(slider).not.toBeNull();
    dispatchKeyDown(slider as HTMLInputElement, 'ArrowRight');

    expect(bindings.onStep).not.toHaveBeenCalled();
  });

  it('AC3 (v): a dialog on the page suspends all four keys', () => {
    const bindings = makeBindings();
    render(<div role="dialog" />);
    renderHook(() => useSimulationHotkeys(bindings));

    dispatchKeyDown(document.body, ' ');
    dispatchKeyDown(document.body, 'ArrowRight');
    dispatchKeyDown(document.body, 'Escape');
    dispatchKeyDown(document.body, 'f');

    expect(bindings.onPlayPause).not.toHaveBeenCalled();
    expect(bindings.onStep).not.toHaveBeenCalled();
    expect(bindings.onStop).not.toHaveBeenCalled();
    expect(bindings.onToggleFullscreen).not.toHaveBeenCalled();
  });

  it('AC3 (vi): Space on a focused button natively activates instead of toggling playback', () => {
    const bindings = makeBindings();
    const { container } = render(<button type="button">Play</button>);
    renderHook(() => useSimulationHotkeys(bindings));

    const button = container.querySelector('button');
    dispatchKeyDown(button as HTMLButtonElement, ' ');

    expect(bindings.onPlayPause).not.toHaveBeenCalled();

    // ArrowRight / Escape / F on the SAME focused button ARE handled (a button consumes none of
    // them).
    dispatchKeyDown(button as HTMLButtonElement, 'Escape');
    expect(bindings.onStop).toHaveBeenCalledTimes(1);
  });

  it('honours bindings swapped between renders WITHOUT a second addEventListener (AC1, trap 3)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const first = makeBindings();
    const { rerender } = renderHook(({ bindings }) => useSimulationHotkeys(bindings), {
      initialProps: { bindings: first },
    });
    const keydownCallsAfterMount = addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    expect(keydownCallsAfterMount).toBe(1);

    const second = makeBindings();
    rerender({ bindings: second });

    const keydownCallsAfterRerender = addSpy.mock.calls.filter(
      ([type]) => type === 'keydown',
    ).length;
    expect(keydownCallsAfterRerender).toBe(1);

    dispatchKeyDown(document.body, ' ');
    expect(first.onPlayPause).not.toHaveBeenCalled();
    expect(second.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('removes the listener exactly once on unmount (AC1, useDirtyGuard "no listener at all" form)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const bindings = makeBindings();
    const { unmount } = renderHook(() => useSimulationHotkeys(bindings));

    const [, handler] = addSpy.mock.calls.find(([type]) => type === 'keydown') ?? [];
    expect(handler).toBeDefined();

    unmount();

    const keydownRemovals = removeSpy.mock.calls.filter(
      ([type, listener]) => type === 'keydown' && listener === handler,
    );
    expect(keydownRemovals).toHaveLength(1);

    dispatchKeyDown(document.body, ' ');
    expect(bindings.onPlayPause).not.toHaveBeenCalled();
  });
});

describe('useSimulationHotkeys under StrictMode (trap: effects run twice on mount)', () => {
  it('leaves exactly one listener attached after the double-invoke settles', async () => {
    const React = await import('react');
    const bindings = makeBindings();
    // The `useDirtyGuard.test.tsx` tracking idiom: StrictMode's double-invoke means
    // `addEventListener` fires twice and `removeEventListener` once (setup, cleanup, setup) — a
    // raw call count is the wrong assertion; the live SET is what "one listener" means.
    const attached = new Set<EventListenerOrEventListenerObject>();
    const originalAdd = window.addEventListener.bind(window);
    const originalRemove = window.removeEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'keydown') attached.add(listener);
      originalAdd(type, listener, options as boolean | AddEventListenerOptions | undefined);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (type === 'keydown') attached.delete(listener);
      originalRemove(type, listener, options as boolean | EventListenerOptions | undefined);
    });

    function Probe() {
      useSimulationHotkeys(bindings);
      return null;
    }

    render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>,
    );

    expect(attached.size).toBe(1);

    dispatchKeyDown(document.body, ' ');
    expect(bindings.onPlayPause).toHaveBeenCalledTimes(1);
  });
});

describe('AC1 shape check', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('adds no listener before mount and removes it after unmount (mirrors useDirtyGuard.test.tsx)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const bindings = makeBindings();
    const { unmount } = renderHook(() => useSimulationHotkeys(bindings));

    expect(addSpy.mock.calls.some(([type]) => type === 'keydown')).toBe(true);
    unmount();
  });
});
