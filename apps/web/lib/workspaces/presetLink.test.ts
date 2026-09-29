import { afterEach, describe, expect, it, vi } from 'vitest';
import { stripPresetLinkParam } from './presetLink';

describe('stripPresetLinkParam', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('turns ?preset=x alone into the bare path', () => {
    window.history.replaceState(null, '', '/?preset=x');
    stripPresetLinkParam();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/');
  });

  it('keeps every other param and the hash', () => {
    window.history.replaceState(null, '', '/?preset=x&foo=1#h');
    stripPresetLinkParam();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/?foo=1#h',
    );
  });

  it('calls replaceState exactly once, with a null state', () => {
    window.history.replaceState(null, '', '/?preset=x');
    const spy = vi.spyOn(window.history, 'replaceState');
    stripPresetLinkParam();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(null, '', '/');
  });
});
