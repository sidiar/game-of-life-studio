import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { createFakeRepositories, createMockWorkspace } from '@gol/test-utils';
import { PRESET_FETCH_TIMEOUT_MS } from './presetFetch';
import { PRESET_MANIFEST_FILE, PRESET_WORKSPACES_PATH } from './presetManifest';
import { preparePresetLink } from './presetLinkFlow';

const PRESETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'workspaces',
);
const MANIFEST_URL = `${PRESET_WORKSPACES_PATH}/${PRESET_MANIFEST_FILE}`;
const manifest = JSON.parse(readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8')) as {
  defaultPresetId: string;
  workspaces: { id: string; name: string; file: string }[];
};
const linked = manifest.workspaces[0];
if (linked === undefined) throw new Error('shipped index.json lists no preset');
const defaultEntry = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId);
if (defaultEntry === undefined) throw new Error('shipped index.json: default names no entry');
const envelope = (file: string) =>
  JSON.parse(readFileSync(join(PRESETS_DIR, file), 'utf8')) as {
    battles: { id: string }[];
    organisms: { id: string }[];
  };

const fromDisk = (file: string) => () =>
  new Response(readFileSync(join(PRESETS_DIR, file), 'utf8'));

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const route = routes[url];
    return route ? route() : new Response('not found', { status: 404 });
  });
}

const shippedRoutes = () => ({
  [MANIFEST_URL]: fromDisk(PRESET_MANIFEST_FILE),
  [`${PRESET_WORKSPACES_PATH}/${linked.file}`]: fromDisk(linked.file),
  [`${PRESET_WORKSPACES_PATH}/${defaultEntry.file}`]: fromDisk(defaultEntry.file),
});

const sortedIds = (items: { id: string }[]) => items.map((i) => i.id).sort();

async function snapshot(repos: ReturnType<typeof createFakeRepositories>) {
  return {
    battles: await repos.battles.listFull(),
    organisms: await repos.organisms.list(),
    description: (await repos.workspaceMeta.load()).description,
  };
}

describe('preparePresetLink', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('(a) known id on a pristine store: ready + pristine, load() imports the preset', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const plan = await preparePresetLink({
      presetId: linked.id,
      fetch: fakeFetch(shippedRoutes()),
      repos,
      firstVisit: false,
    });
    if (plan.kind !== 'ready') throw new Error(`expected ready, got ${plan.kind}`);
    expect(plan.pristine).toBe(true);
    expect(plan.entry.id).toBe(linked.id);

    const result = await plan.load();
    expect(result.ok).toBe(true);
    expect(sortedIds(await repos.battles.listFull())).toEqual(
      sortedIds(envelope(linked.file).battles),
    );
  });

  it('(b) known id on a store with battles: not pristine, nothing written until load()', async () => {
    const { organisms, battles } = createMockWorkspace();
    const repos = createFakeRepositories({ organisms, battles });
    const before = await snapshot(repos);

    const plan = await preparePresetLink({
      presetId: linked.id,
      fetch: fakeFetch(shippedRoutes()),
      repos,
      firstVisit: false,
    });

    if (plan.kind !== 'ready') throw new Error(`expected ready, got ${plan.kind}`);
    expect(plan.pristine).toBe(false);
    expect(await snapshot(repos)).toEqual(before);
    await plan.load();
    expect(await snapshot(repos)).not.toEqual(before);
  });

  it.each(['../x', 'Bad', ''])('(c) invalid id %j is unknown with zero fetches', async (id) => {
    const fetchSpy = fakeFetch(shippedRoutes());
    const plan = await preparePresetLink({
      presetId: id,
      fetch: fetchSpy,
      repos: createFakeRepositories(),
      firstVisit: false,
    });
    expect(plan).toEqual({ kind: 'unknown', defaultLoaded: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // FD5 over Task 3.2 step 1's "no fetch": a malformed id on a FIRST visit is still an unknown link,
  // so the visitor gets the normal app — the default preset (Review 2026-09-29).
  it('(c) invalid id on a first visit loads the default preset, never fetching the id', async () => {
    const repos = createFakeRepositories();
    const fetchSpy = fakeFetch(shippedRoutes());

    const plan = await preparePresetLink({
      presetId: '../x',
      fetch: fetchSpy,
      repos,
      firstVisit: true,
    });

    expect(plan).toEqual({ kind: 'unknown', defaultLoaded: true });
    expect(fetchSpy.mock.calls.map(([u]) => String(u)).some((u) => u.includes('../x'))).toBe(false);
    expect(sortedIds(await repos.battles.listFull())).toEqual(
      sortedIds(envelope(defaultEntry.file).battles),
    );
  });

  it('(d) unknown id, not a first visit: no envelope fetch, store unchanged', async () => {
    const { organisms, battles } = createMockWorkspace();
    const repos = createFakeRepositories({ organisms, battles });
    const before = await snapshot(repos);
    const fetchSpy = fakeFetch(shippedRoutes());

    const plan = await preparePresetLink({
      presetId: 'spiral-wars',
      fetch: fetchSpy,
      repos,
      firstVisit: false,
    });

    expect(plan).toEqual({ kind: 'unknown', defaultLoaded: false });
    expect(fetchSpy.mock.calls.map(([u]) => u)).toEqual([MANIFEST_URL]);
    expect(await snapshot(repos)).toEqual(before);
  });

  it('(d) unknown id on a first visit loads the default preset', async () => {
    const repos = createFakeRepositories();
    const plan = await preparePresetLink({
      presetId: 'spiral-wars',
      fetch: fakeFetch(shippedRoutes()),
      repos,
      firstVisit: true,
    });
    expect(plan).toEqual({ kind: 'unknown', defaultLoaded: true });
    expect(sortedIds(await repos.battles.listFull())).toEqual(
      sortedIds(envelope(defaultEntry.file).battles),
    );
  });

  it('(e) unknown + first visit with the default envelope 404ing: resolves, defaultLoaded false, store unchanged', async () => {
    const repos = createFakeRepositories();
    const before = await snapshot(repos);
    const routes = shippedRoutes();
    delete (routes as Record<string, unknown>)[`${PRESET_WORKSPACES_PATH}/${defaultEntry.file}`];

    const plan = await preparePresetLink({
      presetId: 'spiral-wars',
      fetch: fakeFetch(routes),
      repos,
      firstVisit: true,
    });

    expect(plan).toEqual({ kind: 'unknown', defaultLoaded: false });
    expect(await snapshot(repos)).toEqual(before);
  });

  describe('(f) download failures leave the store unchanged', () => {
    it.each([
      ['a manifest 500', { [MANIFEST_URL]: () => new Response('x', { status: 500 }) }],
      ['a manifest {}', { [MANIFEST_URL]: () => new Response('{}') }],
      [
        'an envelope 404',
        {
          ...shippedRoutes(),
          [`${PRESET_WORKSPACES_PATH}/${linked.file}`]: () => new Response('', { status: 404 }),
        },
      ],
    ])('%s', async (_name, routes) => {
      const repos = createFakeRepositories();
      const before = await snapshot(repos);
      const plan = await preparePresetLink({
        presetId: linked.id,
        fetch: fakeFetch(routes),
        repos,
        firstVisit: false,
      });
      expect(plan).toEqual({ kind: 'download-failed' });
      expect(await snapshot(repos)).toEqual(before);
    });
  });

  it('(g) a hung envelope fetch gives download-failed after the timeout', async () => {
    vi.useFakeTimers();
    const hung = vi.fn<typeof fetch>((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === MANIFEST_URL)
        return Promise.resolve(
          new Response(readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8')),
        );
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    const pending = preparePresetLink({
      presetId: linked.id,
      fetch: hung,
      repos: createFakeRepositories(),
      firstVisit: false,
    });
    await vi.advanceTimersByTimeAsync(PRESET_FETCH_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ kind: 'download-failed' });
  });

  it('(h) an envelope body "{" gives invalid-file with the importFailureMessage copy', async () => {
    const plan = await preparePresetLink({
      presetId: linked.id,
      fetch: fakeFetch({
        ...shippedRoutes(),
        [`${PRESET_WORKSPACES_PATH}/${linked.file}`]: () => new Response('{'),
      }),
      repos: createFakeRepositories(),
      firstVisit: false,
    });
    if (plan.kind !== 'invalid-file') throw new Error(`expected invalid-file, got ${plan.kind}`);
    expect(plan.message).toBe(
      'This file is not a valid Game of Life Studio export file, or it is damaged. Your workspace was not changed.',
    );
  });

  it('(i) a rejected pristine read counts as not pristine', async () => {
    const repos = createFakeRepositories();
    repos.battles.list = () => Promise.reject(new Error('read refused'));
    const plan = await preparePresetLink({
      presetId: linked.id,
      fetch: fakeFetch(shippedRoutes()),
      repos,
      firstVisit: false,
    });
    if (plan.kind !== 'ready') throw new Error(`expected ready, got ${plan.kind}`);
    expect(plan.pristine).toBe(false);
  });

  it('(j) load() with a failing import resolves { ok: false, message } and never rejects', async () => {
    const repos = createFakeRepositories();
    repos.battles.replaceAll = () => Promise.reject(new Error('write refused'));
    const plan = await preparePresetLink({
      presetId: linked.id,
      fetch: fakeFetch(shippedRoutes()),
      repos,
      firstVisit: false,
    });
    if (plan.kind !== 'ready') throw new Error(`expected ready, got ${plan.kind}`);
    const result = await plan.load();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});
