import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportError, type AppRepositories } from '@gol/persistence';
import { createFakeRepositories } from '@gol/test-utils';
import { loadDefaultPreset } from './loadDefaultPreset';
import { PRESET_FETCH_TIMEOUT_MS } from './presetFetch';
import { PRESET_MANIFEST_FILE, PRESET_WORKSPACES_PATH } from './presetManifest';

// The REAL shipped files, served off disk — a happy path over a fixture would prove the loader,
// not that the preset this build ships actually imports.
const PRESETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'workspaces',
);
const MANIFEST_URL = `${PRESET_WORKSPACES_PATH}/${PRESET_MANIFEST_FILE}`;
const shippedManifest = JSON.parse(
  readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8'),
) as {
  defaultPresetId: string;
  workspaces: { id: string; file: string }[];
};
const defaultEntry = (() => {
  const found = shippedManifest.workspaces.find((w) => w.id === shippedManifest.defaultPresetId);
  if (!found) throw new Error('shipped index.json: defaultPresetId names no entry');
  return found;
})();
const ENVELOPE_URL = `${PRESET_WORKSPACES_PATH}/${defaultEntry.file}`;
const shippedEnvelope = JSON.parse(readFileSync(join(PRESETS_DIR, defaultEntry.file), 'utf8')) as {
  battles: { id: string }[];
  organisms: { id: string }[];
  description?: string;
};

/** Serves `routes` by URL; anything unrouted is a 404. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const route = routes[url];
    return route ? route() : new Response('not found', { status: 404 });
  });
}

const fromDisk = (file: string) => () =>
  new Response(readFileSync(join(PRESETS_DIR, file), 'utf8'));

async function expectUntouched(repos: AppRepositories): Promise<void> {
  expect(await repos.isFreshWorkspace()).toBe(true);
  expect(await repos.battles.listFull()).toEqual([]);
  expect(await repos.organisms.list()).toEqual([]);
  expect((await repos.workspaceMeta.load()).description).toBeUndefined();
}

describe('loadDefaultPreset', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('imports the shipped default preset, fetching only the manifest and the default envelope', async () => {
    const repos = createFakeRepositories();
    const fetchSpy = fakeFetch({
      [MANIFEST_URL]: fromDisk(PRESET_MANIFEST_FILE),
      [ENVELOPE_URL]: fromDisk(defaultEntry.file),
    });

    const summary = await loadDefaultPreset({ fetch: fetchSpy, repos });

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([MANIFEST_URL, ENVELOPE_URL]);
    expect(summary.kind).toBe('workspace');
    expect((await repos.battles.listFull()).map((b) => b.id).sort()).toEqual(
      shippedEnvelope.battles.map((b) => b.id).sort(),
    );
    expect((await repos.organisms.list()).map((o) => o.id).sort()).toEqual(
      shippedEnvelope.organisms.map((o) => o.id).sort(),
    );
    expect((await repos.workspaceMeta.load()).description).toBe(shippedEnvelope.description);
    expect(await repos.isFreshWorkspace()).toBe(false);
  });

  it.each([404, 500])('rejects on a manifest HTTP %i, writing nothing', async (status) => {
    const repos = createFakeRepositories();
    const fetchSpy = fakeFetch({ [MANIFEST_URL]: () => new Response('', { status }) });

    await expect(loadDefaultPreset({ fetch: fetchSpy, repos })).rejects.toThrow(`HTTP ${status}`);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expectUntouched(repos);
  });

  it('rejects on a manifest that is not JSON, writing nothing', async () => {
    const repos = createFakeRepositories();
    const fetchSpy = fakeFetch({ [MANIFEST_URL]: () => new Response('<html>oops</html>') });

    await expect(loadDefaultPreset({ fetch: fetchSpy, repos })).rejects.toThrow();
    await expectUntouched(repos);
  });

  it('rejects on a manifest that fails the schema, writing nothing', async () => {
    const repos = createFakeRepositories();
    const fetchSpy = fakeFetch({ [MANIFEST_URL]: () => new Response('{}') });

    await expect(loadDefaultPreset({ fetch: fetchSpy, repos })).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expectUntouched(repos);
  });

  it('rejects on an envelope HTTP 404, writing nothing', async () => {
    const repos = createFakeRepositories();
    const fetchSpy = fakeFetch({ [MANIFEST_URL]: fromDisk(PRESET_MANIFEST_FILE) });

    await expect(loadDefaultPreset({ fetch: fetchSpy, repos })).rejects.toThrow('HTTP 404');
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([MANIFEST_URL, ENVELOPE_URL]);
    await expectUntouched(repos);
  });

  it('rejects once the timeout elapses on a hung fetch, writing nothing', async () => {
    vi.useFakeTimers();
    const repos = createFakeRepositories();
    // Never answers on its own — settles only when the loader's AbortController fires.
    const fetchSpy = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    const pending = loadDefaultPreset({ fetch: fetchSpy, repos });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(PRESET_FETCH_TIMEOUT_MS - 1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    await expectUntouched(repos);
  });

  it('propagates the import pipeline rejection as the ImportError, writing nothing', async () => {
    const repos = createFakeRepositories();
    const fetchSpy = fakeFetch({
      [MANIFEST_URL]: fromDisk(PRESET_MANIFEST_FILE),
      [ENVELOPE_URL]: () => new Response('{"formatVersion":1,"kind":"workspace"}'),
    });

    const error: unknown = await loadDefaultPreset({ fetch: fetchSpy, repos }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ImportError);
    await expectUntouched(repos);
  });
});
