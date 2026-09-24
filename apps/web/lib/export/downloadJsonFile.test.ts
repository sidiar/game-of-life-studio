import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadJsonFile } from './downloadJsonFile';

// jsdom lacks URL.createObjectURL / URL.revokeObjectURL entirely — stub per test and restore
// (project-context testing rule: never leave a global stub installed across files).
describe('downloadJsonFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    revokeObjectURL = vi.fn();
    // @ts-expect-error jsdom does not implement the Blob URL API.
    URL.createObjectURL = createObjectURL;
    // @ts-expect-error jsdom does not implement the Blob URL API.
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    // @ts-expect-error restoring jsdom to its un-stubbed state.
    delete URL.createObjectURL;
    // @ts-expect-error restoring jsdom to its un-stubbed state.
    delete URL.revokeObjectURL;
    vi.useRealTimers();
  });

  it('creates a Blob whose type is application/json and whose text is the pretty-printed value (FD3)', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJsonFile('workspace.json', { a: 1, b: [2, 3] });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe(JSON.stringify({ a: 1, b: [2, 3] }, null, 2));

    clickSpy.mockRestore();
  });

  it('sets the anchor download attribute to the given filename, clicks it once, and removes it from the document', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    downloadJsonFile('game-of-life-workspace-2026-01-05.json', { ok: true });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const appendedAnchor = appendSpy.mock.results[0]?.value as HTMLAnchorElement;
    expect(appendedAnchor.download).toBe('game-of-life-workspace-2026-01-05.json');
    expect(removeSpy).toHaveBeenCalledWith(appendedAnchor);
    expect(document.body.contains(appendedAnchor)).toBe(false);

    clickSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('revokes the object URL after the deferred tick, not synchronously', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJsonFile('workspace.json', { ok: true });

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

    clickSpy.mockRestore();
  });
});
