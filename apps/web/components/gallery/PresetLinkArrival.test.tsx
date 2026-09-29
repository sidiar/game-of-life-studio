import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONWAYS_CLASSIC, type Organism } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { createFakeRepositories } from '@gol/test-utils';
import { downloadJsonFile } from '@/lib/export/downloadJsonFile';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';
import { PRESET_MANIFEST_FILE, PRESET_WORKSPACES_PATH } from '@/lib/workspaces/presetManifest';
import { PRESET_LINK_FETCH_FAILURE_MESSAGE } from '@/lib/workspaces/presetMessages';
import PresetLinkArrival, { type PresetLinkArrivalProps } from './PresetLinkArrival';

vi.mock('@/lib/export/downloadJsonFile', () => ({ downloadJsonFile: vi.fn() }));

beforeEach(() => {
  vi.mocked(downloadJsonFile).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PRESETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'workspaces',
);
const manifestText = readFileSync(join(PRESETS_DIR, PRESET_MANIFEST_FILE), 'utf8');
const manifest = JSON.parse(manifestText) as {
  defaultPresetId: string;
  workspaces: { id: string; name: string; file: string }[];
};
const entry = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId)!;
const envelopeText = readFileSync(join(PRESETS_DIR, entry.file), 'utf8');
const envelope = JSON.parse(envelopeText) as { battles: { id: string }[] };
const MANIFEST_URL = `${PRESET_WORKSPACES_PATH}/${PRESET_MANIFEST_FILE}`;
const ENVELOPE_URL = `${PRESET_WORKSPACES_PATH}/${entry.file}`;

const EXTRA_ORGANISM: Organism = { ...CONWAYS_CLASSIC, id: 'extra-organism', name: 'Extra' };
const pristineRepos = () => createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
const dirtyRepos = () => createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });

type Routes = Record<string, () => Response | Promise<Response>>;
function stubFetch(overrides: Routes = {}) {
  const routes: Routes = {
    [MANIFEST_URL]: () => new Response(manifestText),
    [ENVELOPE_URL]: () => new Response(envelopeText),
    ...overrides,
  };
  const fn = vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const route = routes[url];
    return route ? route() : new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const manifestFetches = (fn: ReturnType<typeof stubFetch>) =>
  fn.mock.calls.filter(([url]) => url === MANIFEST_URL).length;

function renderArrival(
  repos: AppRepositories,
  overrides: Partial<PresetLinkArrivalProps> = {},
  strict = false,
) {
  const onBusyChange = vi.fn();
  const onSettled = vi.fn();
  const props: PresetLinkArrivalProps = {
    presetId: entry.id,
    seedStatus: 'ready',
    firstVisit: false,
    repos,
    onBusyChange,
    onSettled,
    ...overrides,
  };
  const ui = (p: PresetLinkArrivalProps) => (
    <>
      <h1 id="battle-gallery-heading" tabIndex={-1}>
        Battle Gallery
      </h1>
      <PresetLinkArrival {...p} />
    </>
  );
  const wrap = (p: PresetLinkArrivalProps) => (strict ? <StrictMode>{ui(p)}</StrictMode> : ui(p));
  const result = render(wrap(props));
  return {
    ...result,
    onBusyChange,
    onSettled,
    rerenderWith: (next: Partial<PresetLinkArrivalProps>) =>
      result.rerender(wrap({ ...props, ...next })),
  };
}

async function snapshot(repos: AppRepositories) {
  return {
    battles: await repos.battles.list(),
    organisms: await repos.organisms.list(),
    meta: await repos.workspaceMeta.load(),
  };
}

describe('PresetLinkArrival', () => {
  it('(a) does nothing while seeding, then starts once ready; never releases the hold early', async () => {
    const fetchFn = stubFetch();
    const repos = pristineRepos();
    const { rerenderWith, onBusyChange, onSettled } = renderArrival(repos, {
      seedStatus: 'seeding' as WorkspaceSeedStatus,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchFn).not.toHaveBeenCalled();

    rerenderWith({ seedStatus: 'ready' });
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(manifestFetches(fetchFn)).toBe(1);
    expect(onBusyChange).not.toHaveBeenCalledWith(false);
  });

  it('(b) pristine + known id: no dialog, the store holds the preset, settles silently', async () => {
    stubFetch();
    const repos = pristineRepos();
    const { onSettled } = renderArrival(repos);

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(onSettled).toHaveBeenCalledWith({ notice: null, keepLink: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await repos.battles.list()).map((b) => b.id).sort()).toEqual(
      envelope.battles.map((b) => b.id).sort(),
    );
  });

  it('(c) non-pristine: hold released, dialog names the preset, Cancel leaves the store and focuses the heading', async () => {
    stubFetch();
    const repos = dirtyRepos();
    const before = await snapshot(repos);
    const { onSettled, onBusyChange } = renderArrival(repos);
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: `Load “${entry.name}”?` });
    expect(onBusyChange).toHaveBeenCalledWith(false);
    expect(dialog).toHaveTextContent('This link opens a preset workspace');
    expect(onSettled).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(onSettled).toHaveBeenCalledWith({ notice: null, keepLink: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await snapshot(repos)).toEqual(before);
    expect(document.getElementById('battle-gallery-heading')).toHaveFocus();
  });

  it('(d) Load Preset: re-holds after exit, then settles with the status text; the dialog is gone by then', async () => {
    stubFetch();
    const repos = dirtyRepos();
    const { onSettled, onBusyChange } = renderArrival(repos);
    onSettled.mockImplementation(() => {
      expect(screen.queryByRole('dialog')).toBeNull(); // live-region ordering
    });
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Load Preset' }));

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    const [{ notice, keepLink }] = onSettled.mock.calls[0] as [
      { notice: { role: string; text: string }; keepLink: boolean },
    ];
    expect(keepLink).toBe(false);
    expect(notice.role).toBe('status');
    expect(notice.text).toContain(`Loaded “${entry.name}”`);
    expect((await repos.battles.list()).length).toBe(envelope.battles.length);
  });

  it('(e) Export First keeps the dialog open; confirm is a no-op while it is in flight, then works', async () => {
    stubFetch();
    const repos = dirtyRepos();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const realList = repos.battles.listFull.bind(repos.battles);
    repos.battles.listFull = async () => {
      await gate;
      return realList();
    };
    const { onSettled } = renderArrival(repos);
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Export Current Workspace First' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Load Preset' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onSettled).not.toHaveBeenCalled();

    release();
    await waitFor(() =>
      expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
        'Your current workspace was downloaded.',
      ),
    );
    expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Load Preset' }),
    );
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect((await repos.battles.list()).length).toBe(envelope.battles.length);
  });

  it('(f) unknown id, not first visit: alert with "untouched", link stripped, store unchanged', async () => {
    stubFetch();
    const repos = dirtyRepos();
    const before = await snapshot(repos);
    const { onSettled } = renderArrival(repos, { presetId: 'spiral-wars' });

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    const [{ notice, keepLink }] = onSettled.mock.calls[0] as [
      { notice: { role: string; text: string }; keepLink: boolean },
    ];
    expect(notice.role).toBe('alert');
    expect(notice.text).toContain('“spiral-wars”');
    expect(notice.text).toContain('Your workspace is untouched.');
    expect(keepLink).toBe(false);
    expect(await snapshot(repos)).toEqual(before);
  });

  it('(g) unknown id on a first visit: the default preset is loaded and "untouched" is not claimed', async () => {
    stubFetch();
    const repos = pristineRepos();
    const { onSettled } = renderArrival(repos, { presetId: 'spiral-wars', firstVisit: true });

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    const [{ notice }] = onSettled.mock.calls[0] as [{ notice: { text: string } }];
    expect(notice.text).toContain('“spiral-wars”');
    expect(notice.text).not.toContain('untouched');
    expect((await repos.battles.list()).length).toBe(envelope.battles.length);
  });

  it('(h) an envelope 404 settles with the download-failure copy and keeps the link', async () => {
    stubFetch({ [ENVELOPE_URL]: () => new Response('x', { status: 404 }) });
    const repos = pristineRepos();
    const before = await snapshot(repos);
    const { onSettled } = renderArrival(repos);

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(onSettled).toHaveBeenCalledWith({
      notice: { role: 'alert', text: PRESET_LINK_FETCH_FAILURE_MESSAGE },
      keepLink: true,
    });
    expect(await snapshot(repos)).toEqual(before);
  });

  it('(i) seedStatus error: no fetch and never settles', async () => {
    const fetchFn = stubFetch();
    const { onSettled } = renderArrival(pristineRepos(), { seedStatus: 'error' });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('(j) StrictMode: exactly one manifest fetch', async () => {
    const fetchFn = stubFetch();
    const { onSettled } = renderArrival(pristineRepos(), {}, true);
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(manifestFetches(fetchFn)).toBe(1);
  });

  it('(k) unmount while the envelope fetch is pending: no import, no settle', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchFn = stubFetch({
      [ENVELOPE_URL]: async () => {
        await gate;
        return new Response(envelopeText);
      },
    });
    const repos = pristineRepos();
    const before = await snapshot(repos);
    const { unmount, onSettled } = renderArrival(repos);
    await waitFor(() => expect(fetchFn.mock.calls.some(([u]) => u === ENVELOPE_URL)).toBe(true));

    unmount();
    release();
    await new Promise((r) => setTimeout(r, 30));

    expect(onSettled).not.toHaveBeenCalled();
    expect(await snapshot(repos)).toEqual(before);
  });
});
