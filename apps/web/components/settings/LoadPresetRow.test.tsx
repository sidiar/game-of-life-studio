import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONWAYS_CLASSIC, type Organism, type WorkspaceExportWire } from '@gol/domain';
import {
  createWorkspaceSerializer,
  ImportError,
  type AppRepositories,
  type WorkspaceSerializer,
} from '@gol/persistence';
import { createFakeRepositories } from '@gol/test-utils';
import { downloadJsonFile } from '@/lib/export/downloadJsonFile';
import { importFailureMessage } from '@/lib/import/importFailureMessage';
import { PRESET_FETCH_TIMEOUT_MS } from '@/lib/workspaces/presetFetch';
import { PRESET_MANIFEST_FILE, PRESET_WORKSPACES_PATH } from '@/lib/workspaces/presetManifest';
import {
  PRESET_FETCH_FAILURE_MESSAGE,
  PRESET_LIST_FAILURE_MESSAGE,
} from '@/lib/workspaces/presetMessages';
import type { RowOutcome } from './SettingsCard';
import LoadPresetRow from './LoadPresetRow';

vi.mock('@/lib/export/downloadJsonFile', () => ({ downloadJsonFile: vi.fn() }));

beforeEach(() => {
  vi.mocked(downloadJsonFile).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
  workspaces: { id: string; name: string; description: string; file: string }[];
};
const entry = manifest.workspaces.find((w) => w.id === manifest.defaultPresetId)!;
const envelopeText = readFileSync(join(PRESETS_DIR, entry.file), 'utf8');
const envelope = JSON.parse(envelopeText) as { battles: { name: string }[]; organisms: unknown[] };
const MANIFEST_URL = `${PRESET_WORKSPACES_PATH}/${PRESET_MANIFEST_FILE}`;
const ENVELOPE_URL = `${PRESET_WORKSPACES_PATH}/${entry.file}`;

const EXTRA_ORGANISM: Organism = { ...CONWAYS_CLASSIC, id: 'extra-organism', name: 'Extra' };

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

function buildSerializer(repos: AppRepositories): WorkspaceSerializer {
  return createWorkspaceSerializer({
    repos,
    appVersion: '0.0.0',
    now: () => new Date('2026-01-05T12:00:00.000Z'),
  });
}

function MessageOutlet({ message }: { message: RowOutcome | null }) {
  if (message?.role === 'status') return <p role="status">{message.text}</p>;
  if (message?.role === 'alert') return <p role="alert">{message.text}</p>;
  return null;
}

function renderRow(props: {
  repos: AppRepositories;
  serializer?: Pick<WorkspaceSerializer, 'exportWorkspace' | 'importWorkspace'>;
}) {
  const onImported = vi.fn();
  const onMessage = vi.fn();
  const serializer = props.serializer ?? buildSerializer(props.repos);
  function Harness() {
    const [message, setMessage] = useState<RowOutcome | null>(null);
    return (
      <>
        <LoadPresetRow
          serializer={serializer}
          battles={props.repos.battles}
          organisms={props.repos.organisms}
          workspaceMeta={props.repos.workspaceMeta}
          onImported={onImported}
          onMessage={(next) => {
            onMessage(next);
            setMessage(next);
          }}
        />
        <MessageOutlet message={message} />
      </>
    );
  }
  const result = render(<Harness />);
  return { ...result, onImported, onMessage };
}

const pristineRepos = () => createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
const dirtyRepos = () => createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });

async function loadButton() {
  return screen.findByRole('button', { name: 'Load preset workspace' });
}

describe('LoadPresetRow', () => {
  it('(a) shows Loading, then the default first with " (default)" and a description echo that follows the selection', async () => {
    stubFetch({
      [MANIFEST_URL]: () =>
        new Response(
          JSON.stringify({
            defaultPresetId: 'beta',
            workspaces: [
              { id: 'alpha', name: 'Alpha', description: 'Alpha desc.', file: 'alpha.json' },
              { id: 'beta', name: 'Beta', description: 'Beta desc.', file: 'beta.json' },
            ],
          }),
        ),
    });
    renderRow({ repos: pristineRepos() });
    expect(screen.getByText('Loading presets…')).toBeInTheDocument();

    const select = await screen.findByRole('combobox', { name: 'Load Preset Workspace' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Beta (default)', 'Alpha']);
    expect(select).toHaveValue('beta');
    expect(screen.getByText('Beta desc.')).toBeInTheDocument();
    expect(select).toHaveAccessibleDescription('Beta desc.');

    await userEvent.setup().selectOptions(select, 'alpha');
    expect(screen.getByText('Alpha desc.')).toBeInTheDocument();
    expect(screen.queryByText('Beta desc.')).toBeNull();
  });

  it.each([
    ['HTTP 500', () => new Response('x', { status: 500 })],
    ['a 200 {}', () => new Response('{}')],
  ])(
    '(b) a manifest failure (%s) shows the list-failure line and never calls onMessage',
    async (_l, route) => {
      stubFetch({ [MANIFEST_URL]: route });
      const { onMessage } = renderRow({ repos: pristineRepos() });
      expect(await screen.findByText(PRESET_LIST_FAILURE_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Load preset workspace' })).toBeNull();
      expect(onMessage).not.toHaveBeenCalled();
    },
  );

  it('(c) a pristine store loads with no dialog and reports the preset by name', async () => {
    stubFetch();
    const repos = pristineRepos();
    const { onMessage, onImported } = renderRow({ repos });
    await userEvent.setup().click(await loadButton());

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      `Loaded “${entry.name}” — your workspace now has ${envelope.battles.length} battles and ${envelope.organisms.length} organisms.`,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await repos.battles.list()).map((b) => b.name).sort()).toEqual(
      envelope.battles.map((b) => b.name).sort(),
    );
    expect(onMessage.mock.calls[0]).toEqual([null]);
    expect(onMessage.mock.calls[1]).toEqual([{ role: 'status', text: status.textContent }]);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('(d) a non-pristine store opens the named dialog; Cancel changes nothing and returns focus', async () => {
    stubFetch();
    const repos = dirtyRepos();
    const organismsBefore = await repos.organisms.list();
    const { onMessage, onImported } = renderRow({ repos });
    const user = userEvent.setup();
    await user.click(await loadButton());

    const dialog = await screen.findByRole('dialog', { name: `Load “${entry.name}”?` });
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cancel', 'Export Current Workspace First', 'Load Preset']);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await repos.battles.list()).toEqual([]);
    expect(await repos.organisms.list()).toEqual(organismsBefore);
    expect(onMessage.mock.calls).toEqual([[null]]);
    expect(onImported).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Load preset workspace' })).toHaveFocus(),
    );
  });

  it('(e) Load Preset runs the import only after the dialog has exited, then reports', async () => {
    stubFetch();
    const repos = dirtyRepos();
    const { onImported } = renderRow({ repos });
    const user = userEvent.setup();
    await user.click(await loadButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Load Preset' }));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull(); // live-region ordering
    expect(onImported).toHaveBeenCalledTimes(1);
    expect((await repos.battles.list()).length).toBe(envelope.battles.length);
  });

  it('(f) Export First keeps the dialog open; Load Preset is a no-op while the export is in flight', async () => {
    stubFetch();
    const repos = dirtyRepos();
    const real = buildSerializer(repos);
    const importSpy = vi.fn(real.importWorkspace);
    let resolveExport!: (e: WorkspaceExportWire) => void;
    const exportWorkspace = vi.fn(
      () => new Promise<WorkspaceExportWire>((resolve) => (resolveExport = resolve)),
    );
    renderRow({ repos, serializer: { exportWorkspace, importWorkspace: importSpy } });
    const user = userEvent.setup();
    await user.click(await loadButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Export Current Workspace First' }),
    );
    expect(exportWorkspace).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Load Preset' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(importSpy).not.toHaveBeenCalled();

    resolveExport(await real.exportWorkspace());
    await waitFor(() =>
      expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
        'Your current workspace was downloaded.',
      ),
    );
    expect(importSpy).not.toHaveBeenCalled();

    // Once the export has settled, the confirm is live again.
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Load Preset' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('status')).toHaveTextContent(`Loaded “${entry.name}”`);
    expect(importSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a 404', () => new Response('x', { status: 404 })],
    ['a rejection', () => Promise.reject(new TypeError('network'))],
  ])(
    '(g) an envelope fetch failure (%s) alerts and leaves the store unchanged',
    async (_l, route) => {
      stubFetch({ [ENVELOPE_URL]: route });
      const repos = dirtyRepos();
      const organismsBefore = await repos.organisms.list();
      const { onImported } = renderRow({ repos });
      await userEvent.setup().click(await loadButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(PRESET_FETCH_FAILURE_MESSAGE);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(await repos.battles.list()).toEqual([]);
      expect(await repos.organisms.list()).toEqual(organismsBefore);
      expect(onImported).not.toHaveBeenCalled();
    },
  );

  it('(h) a hung envelope fetch times out with the same alert, and a new Load is then accepted', async () => {
    let hang = true;
    // An abortable hang, like the real `fetch`: rejects only when the timeout aborts the signal.
    const fetchFn = stubFetch();
    fetchFn.mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === ENVELOPE_URL && hang) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('a', 'AbortError')),
          );
        });
      }
      return Promise.resolve(new Response(url === MANIFEST_URL ? manifestText : envelopeText));
    });
    renderRow({ repos: pristineRepos() });
    const button = await loadButton();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    await vi.advanceTimersByTimeAsync(PRESET_FETCH_TIMEOUT_MS);
    vi.useRealTimers();
    expect(await screen.findByRole('alert')).toHaveTextContent(PRESET_FETCH_FAILURE_MESSAGE);

    hang = false;
    await userEvent.setup().click(button);
    expect(await screen.findByRole('status')).toHaveTextContent(/Loaded/);
  });

  it('(i) a double click while the first load is in flight fetches the envelope once', async () => {
    const fetchFn = stubFetch();
    const repos = pristineRepos();
    const real = buildSerializer(repos);
    const importSpy = vi.fn(real.importWorkspace);
    const { onImported, onMessage } = renderRow({
      repos,
      serializer: { exportWorkspace: real.exportWorkspace, importWorkspace: importSpy },
    });
    const button = await loadButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByRole('status');
    const envelopeFetches = fetchFn.mock.calls.filter(([u]) => u === ENVELOPE_URL);
    expect(envelopeFetches).toHaveLength(1);
    expect(importSpy).toHaveBeenCalledTimes(1);
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls).toHaveLength(2); // one null, one status
  });

  it('(j) unmounting while the fetch is pending runs no import and reports nothing', async () => {
    let release!: () => void;
    stubFetch({
      [ENVELOPE_URL]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(envelopeText));
        }),
    });
    const repos = pristineRepos();
    const real = buildSerializer(repos);
    const importSpy = vi.fn(real.importWorkspace);
    const { unmount, onMessage } = renderRow({
      repos,
      serializer: { exportWorkspace: real.exportWorkspace, importWorkspace: importSpy },
    });
    fireEvent.click(await loadButton());
    await waitFor(() => expect(release).toBeDefined());
    unmount();
    const callsBefore = onMessage.mock.calls.length;
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(importSpy).not.toHaveBeenCalled();
    expect(onMessage.mock.calls.length).toBe(callsBefore);
  });

  it('(k) an envelope that fails validation alerts with the import copy and changes nothing', async () => {
    stubFetch({ [ENVELOPE_URL]: () => new Response('{') });
    const repos = pristineRepos();
    const { onImported } = renderRow({ repos });
    await userEvent.setup().click(await loadButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      importFailureMessage(new ImportError('not-json')),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await repos.battles.list()).toEqual([]);
    expect(onImported).not.toHaveBeenCalled();
  });

  it('(l) an importWorkspace rejection alerts and never calls onImported', async () => {
    stubFetch();
    const repos = pristineRepos();
    const { onImported } = renderRow({
      repos,
      serializer: {
        exportWorkspace: vi.fn(),
        importWorkspace: vi.fn().mockRejectedValue(new ImportError('corrupt')),
      },
    });
    await userEvent.setup().click(await loadButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      importFailureMessage(new ImportError('corrupt')),
    );
    expect(onImported).not.toHaveBeenCalled();
  });
});
