import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { CONWAYS_CLASSIC, CONWAYS_CLASSIC_ID } from '@gol/domain';
import { resetWorkspace, type AppRepositories } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace, type FakeSeed } from '@gol/test-utils';
import { PRESET_MANIFEST_FILE, PRESET_WORKSPACES_PATH } from '@/lib/workspaces/presetManifest';
import { useWorkspaceSeed } from './useWorkspaceSeed';

// Story 7.4. The shipped files are served off disk, so case (a) proves the preset THIS build ships
// imports through the hook — not a fixture.
const PRESETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'workspaces',
);
const MANIFEST_URL = `${PRESET_WORKSPACES_PATH}/${PRESET_MANIFEST_FILE}`;
const manifestText = readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8');
const manifest = JSON.parse(manifestText) as {
  defaultPresetId: string;
  workspaces: { id: string; file: string }[];
};
const envelopeFile = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId)?.file;
if (envelopeFile === undefined) throw new Error('shipped index.json: default names no entry');
const envelopeText = readFileSync(join(PRESETS_DIR, envelopeFile), 'utf8');
const envelope = JSON.parse(envelopeText) as {
  battles: { id: string }[];
  organisms: { id: string }[];
  description?: string;
};

function servePresets() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === MANIFEST_URL) return new Response(manifestText);
    if (url === `${PRESET_WORKSPACES_PATH}/${envelopeFile}`) return new Response(envelopeText);
    return new Response('not found', { status: 404 });
  });
}

const sortedIds = (items: { id: string }[]) => items.map((i) => i.id).sort();

async function expectConwayOnly(repos: AppRepositories): Promise<void> {
  expect(await repos.battles.listFull()).toEqual([]);
  expect(sortedIds(await repos.organisms.list())).toEqual([CONWAYS_CLASSIC_ID]);
  expect((await repos.workspaceMeta.load()).description).toBeUndefined();
}

async function renderReady(
  repos: AppRepositories,
  wrapper?: (p: { children: ReactNode }) => ReactNode,
) {
  const hook = renderHook(() => useWorkspaceSeed(repos), { wrapper });
  await waitFor(() => expect(hook.result.current.status).not.toBe('seeding'));
  return hook;
}

describe('useWorkspaceSeed — first-visit default preset (Story 7.4)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('(a) fresh + production: imports the shipped default preset and reaches ready', async () => {
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const repos = createFakeRepositories();

    const { result } = await renderReady(repos);

    expect(result.current).toEqual({ status: 'ready', error: undefined });
    expect(sortedIds(await repos.battles.listFull())).toEqual(sortedIds(envelope.battles));
    expect(sortedIds(await repos.organisms.list())).toEqual(sortedIds(envelope.organisms));
    expect((await repos.workspaceMeta.load()).description).toBe(envelope.description);
  });

  it('(b) fresh + production + fetch rejects: falls back to Conway alone, ready, no error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const repos = createFakeRepositories();

    const { result } = await renderReady(repos);

    expect(result.current).toEqual({ status: 'ready', error: undefined });
    await expectConwayOnly(repos);
  });

  it("(c) fresh + production + the import's write fails: rolls back, falls back to Conway, ready", async () => {
    vi.stubGlobal('fetch', servePresets());
    const repos = createFakeRepositories();
    const replaceAll = repos.organisms.replaceAll.bind(repos.organisms);
    let failed = false;
    repos.organisms.replaceAll = async (organisms) => {
      if (!failed) {
        failed = true;
        throw new Error('write refused');
      }
      return replaceAll(organisms);
    };

    const { result } = await renderReady(repos);

    expect(failed).toBe(true);
    expect(result.current).toEqual({ status: 'ready', error: undefined });
    await expectConwayOnly(repos);
  });

  it('(d) NOT fresh + production: never fetches', async () => {
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const repos = createFakeRepositories();
    await resetWorkspace(repos, repos.organisms); // stamps the store: a returning visitor

    const { result } = await renderReady(repos);

    expect(result.current.status).toBe('ready');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('(e) after Clear All (resetWorkspace) and a remount: never fetches, store is Conway alone (FR-8.5)', async () => {
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const repos = createFakeRepositories();

    const first = await renderReady(repos);
    expect(first.result.current.status).toBe('ready');
    expect(fetchSpy).toHaveBeenCalled();
    first.unmount();

    await resetWorkspace(repos, repos.organisms);
    fetchSpy.mockClear();

    const second = await renderReady(repos);

    expect(second.result.current.status).toBe('ready');
    expect(fetchSpy).not.toHaveBeenCalled();
    await expectConwayOnly(repos);
  });

  it("(f) NODE_ENV='test': never fetches", async () => {
    vi.unstubAllEnvs();
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const repos = createFakeRepositories();

    const { result } = await renderReady(repos);

    expect(result.current.status).toBe('ready');
    expect(fetchSpy).not.toHaveBeenCalled();
    await expectConwayOnly(repos);
  });

  it('(g) StrictMode double-mount in production: exactly one manifest fetch', async () => {
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const repos = createFakeRepositories();

    const { result } = await renderReady(repos, StrictMode);

    expect(result.current.status).toBe('ready');
    expect(fetchSpy.mock.calls.filter(([url]) => url === MANIFEST_URL)).toHaveLength(1);
  });

  // Review ruling D1: `writeDataKey` writes data THEN stamps, so a failed stamp write leaves an
  // unstamped store that still holds records. The fake stamps on every seeded write, so the
  // failed stamp is modelled by pinning `isFreshWorkspace()` to true.
  function unstampedStoreWith(seed: FakeSeed): AppRepositories {
    const repos = createFakeRepositories(seed);
    repos.isFreshWorkspace = () => Promise.resolve(true);
    return repos;
  }

  it('D1: an unstamped store holding battles is never replaced — no fetch, no clearAll, data survives', async () => {
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const { organisms, battles } = createMockWorkspace();
    const repos = unstampedStoreWith({ organisms, battles });
    const clearAll = vi.spyOn(repos, 'clearAll');

    const { result } = await renderReady(repos);

    expect(result.current).toEqual({ status: 'ready', error: undefined });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(clearAll).not.toHaveBeenCalled();
    expect(sortedIds(await repos.battles.listFull())).toEqual(sortedIds(battles));
    expect(sortedIds(await repos.organisms.list())).toEqual(
      [...new Set([...sortedIds(organisms), CONWAYS_CLASSIC_ID])].sort(),
    );
  });

  it('D1: an unstamped store holding a non-Conway organism is never replaced — the seed only adds Conway', async () => {
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const userOrganism = createMockWorkspace().organisms.find((o) => o.id !== CONWAYS_CLASSIC_ID);
    if (userOrganism === undefined) throw new Error('mock workspace: no non-Conway organism');
    const repos = unstampedStoreWith({ organisms: [userOrganism] });
    const clearAll = vi.spyOn(repos, 'clearAll');

    const { result } = await renderReady(repos);

    expect(result.current).toEqual({ status: 'ready', error: undefined });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(clearAll).not.toHaveBeenCalled();
    expect(await repos.battles.listFull()).toEqual([]);
    expect(sortedIds(await repos.organisms.list())).toEqual(
      [CONWAYS_CLASSIC_ID, userOrganism.id].sort(),
    );
  });

  it("D1: an unstamped store holding only Conway's Classic still gets the preset", async () => {
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const repos = unstampedStoreWith({ organisms: [CONWAYS_CLASSIC] });

    const { result } = await renderReady(repos);

    expect(result.current).toEqual({ status: 'ready', error: undefined });
    expect(fetchSpy).toHaveBeenCalled();
    expect(sortedIds(await repos.battles.listFull())).toEqual(sortedIds(envelope.battles));
  });

  it('D1: a failed emptiness read falls back to the plain seed silently — ready, no fetch, no clearAll', async () => {
    const fetchSpy = servePresets();
    vi.stubGlobal('fetch', fetchSpy);
    const repos = unstampedStoreWith({ organisms: [CONWAYS_CLASSIC] });
    repos.battles.list = () => Promise.reject(new Error('read refused'));
    const clearAll = vi.spyOn(repos, 'clearAll');

    const { result } = await renderReady(repos);

    expect(result.current).toEqual({ status: 'ready', error: undefined });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(clearAll).not.toHaveBeenCalled();
    expect(sortedIds(await repos.organisms.list())).toEqual([CONWAYS_CLASSIC_ID]);
  });

  it('a rejection of the FALLBACK seed still reaches error with its cause (Story 5.11)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const repos = createFakeRepositories();
    const quota = new Error('quota');
    repos.organisms.save = () => Promise.reject(quota);
    repos.organisms.replaceAll = () => Promise.reject(quota);

    const { result } = await renderReady(repos);

    expect(result.current).toEqual({ status: 'error', error: quota });
  });
});
