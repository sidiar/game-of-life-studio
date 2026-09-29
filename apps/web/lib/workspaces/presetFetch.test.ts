import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPresetText, PRESET_FETCH_TIMEOUT_MS, withPresetTimeout } from './presetFetch';

describe('withPresetTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves with the run value and clears the timer', async () => {
    vi.useFakeTimers();
    await expect(withPresetTimeout(async () => 42)).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts the signal after timeoutMs', async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;
    const pending = withPresetTimeout(async (signal) => {
      captured = signal;
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }, 100);
    const assertion = expect(pending).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(99);
    expect(captured?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(captured?.aborted).toBe(true);
    await assertion;
  });

  it('defaults to PRESET_FETCH_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;
    const pending = withPresetTimeout(async (signal) => {
      captured = signal;
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    });
    await vi.advanceTimersByTimeAsync(PRESET_FETCH_TIMEOUT_MS - 1);
    expect(captured?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(captured?.aborted).toBe(true);
  });

  it('propagates a run rejection and still clears the timer', async () => {
    vi.useFakeTimers();
    await expect(
      withPresetTimeout(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fetchPresetText', () => {
  it('rejects on a non-OK status', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('nope', { status: 404 }));
    await expect(
      fetchPresetText(fetchFn, { id: 'x', file: 'x.json' } as never, new AbortController().signal),
    ).rejects.toThrow('HTTP 404');
  });
});
