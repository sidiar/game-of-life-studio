import { afterEach, describe, expect, it, vi } from 'vitest';
import { rafScheduler } from './rafScheduler';

describe('rafScheduler (Story 3.10 Task 5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('request forwards the callback to window.requestAnimationFrame and returns its handle', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const callback = (): void => {};

    const handle = rafScheduler.request(callback);

    expect(raf).toHaveBeenCalledTimes(1);
    expect(raf).toHaveBeenCalledWith(callback);
    expect(handle).toBe(42);
  });

  it('cancel forwards the handle to window.cancelAnimationFrame', () => {
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    rafScheduler.cancel(42);

    expect(caf).toHaveBeenCalledTimes(1);
    expect(caf).toHaveBeenCalledWith(42);
  });
});
