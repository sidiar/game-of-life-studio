import { StrictMode } from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { createWorkspaceSerializer } from '@gol/persistence';
import { createFakeRepositories, createMockBattles, createMockOrganisms } from '@gol/test-utils';
import { downloadJsonFile } from '@/lib/export/downloadJsonFile';
import { workspaceExportFilename } from '@/lib/export/workspaceExportFilename';
import DataManagement from './DataManagement';

// The download seam is mocked at the module `exportWorkspaceToFile` (and therefore
// `DataManagement`) actually calls — not stubbed via the URL APIs — because these tests care
// about WHAT was handed to the download step (the filename, the envelope), which a raw
// Blob/anchor stub would not expose as directly. `downloadJsonFile.test.ts` owns the DOM
// mechanism itself.
vi.mock('@/lib/export/downloadJsonFile', () => ({
  downloadJsonFile: vi.fn(),
}));

// The vitest config sets neither `clearMocks` nor `restoreMocks`, so the mock's call history is
// otherwise shared across every `it` in this file.
beforeEach(() => {
  vi.mocked(downloadJsonFile).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Story 7.5: serves the REAL shipped preset files, so the Load Preset row is fully live here.
// Resolved off this file (not `process.cwd()`), like `LoadPresetRow.test.tsx`; an unknown URL is a
// 404, never a thrown `readFileSync`.
const PRESETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'workspaces',
);
function stubPresetFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const file = join(PRESETS_DIR, url.replace('/workspaces/', ''));
      return url.startsWith('/workspaces/') && existsSync(file)
        ? new Response(readFileSync(file, 'utf8'))
        : new Response('not found', { status: 404 });
    }),
  );
}

const ENVELOPE = {
  formatVersion: 1,
  appVersion: '0.0.0',
  exportedAt: '2026-01-05T12:00:00.000Z',
  kind: 'workspace' as const,
  organisms: [],
  battles: [],
};

/**
 * Story 5.9: `<DataManagement>` now requires `battles`/`organisms`/`onImported` for its second row
 * (`<ImportWorkspaceRow>`), and `serializer` widens to `importWorkspace`. Story 5.10 adds
 * `workspace`/`onCleared` for its third row (`<ClearAllDataRow>`), and widens `organisms` to
 * `exists`/`save`. This file's Export assertions stay exactly as Story 5.5 wrote them — only the
 * props each render call needs are new; `<ImportWorkspaceRow>`'s and `<ClearAllDataRow>`'s own
 * behaviour are `ImportWorkspaceRow.test.tsx`'s and `ClearAllDataRow.test.tsx`'s jobs.
 */
function baseProps() {
  return {
    workspace: { clearAll: vi.fn().mockResolvedValue(undefined) },
    battles: { list: vi.fn().mockResolvedValue([]) },
    organisms: {
      list: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockResolvedValue(undefined),
    },
    onImported: vi.fn(),
    onCleared: vi.fn(),
    workspaceMeta: {
      load: vi.fn().mockResolvedValue({}),
      save: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('DataManagement', () => {
  it('renders the Data Management heading, the row label/description, and the Export button by role and accessible name (AC1)', () => {
    const serializer = {
      exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE),
      importWorkspace: vi.fn(),
    };
    render(<DataManagement serializer={serializer} {...baseProps()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Data Management' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Export Workspace' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Download a JSON file containing all your battles, organisms and the workspace description for backup or transfer',
      ),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /export workspace/i });
    expect(button).toHaveTextContent('Export');
  });

  it('also renders the Import row (Story 5.9) alongside Export, as its second heading/button', () => {
    const serializer = {
      exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE),
      importWorkspace: vi.fn(),
    };
    render(<DataManagement serializer={serializer} {...baseProps()} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import workspace/i })).toBeInTheDocument();
  });

  it('also renders the Clear All Data row (Story 5.10) as the last row in the card', () => {
    const serializer = {
      exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE),
      importWorkspace: vi.fn(),
    };
    render(<DataManagement serializer={serializer} {...baseProps()} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Clear All Data' })).toBeInTheDocument();
    const clearButton = screen.getByRole('button', {
      name: /clear data \(all battles and organisms\)/i,
    });
    expect(clearButton).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // Story 7.2: the workspace description row is FIRST — it is what Export carries.
    expect(headings).toEqual([
      'Workspace description',
      'Export Workspace',
      'Import',
      'Load Preset Workspace',
      'Clear All Data',
    ]);
  });

  it('clicking Export calls exportWorkspace exactly once and hands the download seam the AC3 filename and the envelope', async () => {
    const serializer = {
      exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE),
      importWorkspace: vi.fn(),
    };
    render(<DataManagement serializer={serializer} {...baseProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /export workspace/i }));

    await waitFor(() => {
      expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    });
    expect(serializer.exportWorkspace).toHaveBeenCalledTimes(1);
    // Derived, not hard-coded: the filename is the LOCAL date of `exportedAt`, so a literal
    // '2026-01-05' would fail on a UTC+12..+14 runner.
    expect(downloadJsonFile).toHaveBeenCalledWith(
      workspaceExportFilename(new Date(ENVELOPE.exportedAt)),
      ENVELOPE,
    );
  });

  it('a double click while an export is in flight calls exportWorkspace exactly once (FD8)', async () => {
    let resolveExport: (value: typeof ENVELOPE) => void = () => {};
    const pending = new Promise<typeof ENVELOPE>((resolve) => {
      resolveExport = resolve;
    });
    const serializer = {
      exportWorkspace: vi.fn().mockReturnValue(pending),
      importWorkspace: vi.fn(),
    };
    render(<DataManagement serializer={serializer} {...baseProps()} />);

    const button = screen.getByRole('button', { name: /export workspace/i });
    // Two synchronous clicks, before either await settles — the shape of a real rapid
    // double-click, and the only shape that can reach the in-flight guard's branch at all.
    fireEvent.click(button);
    fireEvent.click(button);

    expect(serializer.exportWorkspace).toHaveBeenCalledTimes(1);

    resolveExport(ENVELOPE);
    await waitFor(() => {
      expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    });
    expect(serializer.exportWorkspace).toHaveBeenCalledTimes(1);
  });

  it('a rejection shows role="alert" with plain, non-technical copy, never calls download, and the next click clears the alert (AC8)', async () => {
    const serializer = {
      exportWorkspace: vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(ENVELOPE),
      importWorkspace: vi.fn(),
    };
    render(<DataManagement serializer={serializer} {...baseProps()} />);

    const button = screen.getByRole('button', { name: /export workspace/i });
    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Your workspace could not be exported. Nothing was changed — try again.',
    );
    expect(alert.textContent).not.toMatch(/boom|error|stack/i);
    expect(downloadJsonFile).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    });
  });

  it('under StrictMode, a failure shows the alert, a retry clears it, and a second failure shows it again (the dev double-effect must not disarm the mounted guard)', async () => {
    const serializer = {
      exportWorkspace: vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockRejectedValueOnce(new Error('boom again')),
      importWorkspace: vi.fn(),
    };
    render(
      <StrictMode>
        <DataManagement serializer={serializer} {...baseProps()} />
      </StrictMode>,
    );

    const button = screen.getByRole('button', { name: /export workspace/i });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() => {
      expect(serializer.exportWorkspace).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(downloadJsonFile).not.toHaveBeenCalled();
  });

  it('Enter and Space on the focused Export button each trigger an export (a native <button>, AC9)', async () => {
    const user = userEvent.setup();
    const serializer = {
      exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE),
      importWorkspace: vi.fn(),
    };
    render(<DataManagement serializer={serializer} {...baseProps()} />);

    const button = screen.getByRole('button', { name: /export workspace/i });
    // Story 7.2: the description row's textarea and its Save button come first in the card.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    });

    await user.keyboard(' ');
    await waitFor(() => {
      expect(downloadJsonFile).toHaveBeenCalledTimes(2);
    });
    expect(serializer.exportWorkspace).toHaveBeenCalledTimes(2);
    expect(button).toHaveFocus();
  });

  it('adds no term/definition roles to the page (the readStats() index-pairing guard, AC9)', () => {
    const serializer = {
      exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE),
      importWorkspace: vi.fn(),
    };
    render(<DataManagement serializer={serializer} {...baseProps()} />);

    expect(screen.queryAllByRole('term')).toHaveLength(0);
    expect(screen.queryAllByRole('definition')).toHaveLength(0);
  });

  it('has no axe accessibility violations in the ready state', async () => {
    const serializer = {
      exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE),
      importWorkspace: vi.fn(),
    };
    const { container } = render(<DataManagement serializer={serializer} {...baseProps()} />);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe accessibility violations in the error state, with the alert visible', async () => {
    const serializer = {
      exportWorkspace: vi.fn().mockRejectedValue(new Error('boom')),
      importWorkspace: vi.fn(),
    };
    const { container } = render(<DataManagement serializer={serializer} {...baseProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /export workspace/i }));
    await screen.findByRole('alert');

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Review Finding D2 (owner ruling a): before this fix, Import and Clear All each kept their OWN
  // outcome message, so a successful Import's status line stayed on screen — stale and now false
  // — after a later confirmed Clear All. `<DataManagement>` owning a single slot fixes both the
  // false claim and the `getByRole('status')` ambiguity a chained Import-then-Clear flow hit.
  it('a confirmed Clear All replaces a prior Import status — one outcome line, not two (Review Finding D2)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] }); // pristine: Import runs with no dialog
    const serializer = createWorkspaceSerializer({
      repos,
      appVersion: '0.0.0',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });
    const sourceRepos = createFakeRepositories({
      organisms: createMockOrganisms(),
      battles: [createMockBattles()[0]],
    });
    const sourceSerializer = createWorkspaceSerializer({
      repos: sourceRepos,
      appVersion: '0.0.0',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });
    const envelope = await sourceSerializer.exportWorkspace();
    const file = new File([JSON.stringify(envelope)], 'workspace.json', {
      type: 'application/json',
    });

    render(
      <DataManagement
        serializer={serializer}
        workspace={repos}
        workspaceMeta={repos.workspaceMeta}
        battles={repos.battles}
        organisms={repos.organisms}
        onImported={vi.fn()}
        onCleared={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('import file input not found');
    await user.upload(input, file);

    const importStatus = await screen.findByRole('status');
    expect(importStatus).toHaveTextContent(/import complete/i);

    // Starting Clear All's flow (the click that opens its dialog) already clears the slot, from
    // a DIFFERENT row than the one that wrote it — the exact cross-row replace the ruling asks for.
    await user.click(
      screen.getByRole('button', { name: /clear data \(all battles and organisms\)/i }),
    );
    // `{ hidden: true }`: MUI `aria-hidden`s the card while the modal is up, so a default role
    // query would find no status whether or not the slot was actually cleared.
    await waitFor(() => expect(screen.queryByRole('status', { hidden: true })).toBeNull());

    const dialog = await screen.findByRole('dialog', { name: 'Clear All Data?' });
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'All data cleared. Your workspace is back to its default state.',
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  // The pristine-Import-and-Clear setup the D2 tests below share: a pristine target (Import runs
  // with no dialog) and a one-battle source envelope to import from.
  async function pristineSetup() {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const serializer = createWorkspaceSerializer({
      repos,
      appVersion: '0.0.0',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });
    const sourceSerializer = createWorkspaceSerializer({
      repos: createFakeRepositories({
        organisms: createMockOrganisms(),
        battles: [createMockBattles()[0]],
      }),
      appVersion: '0.0.0',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });
    const envelope = await sourceSerializer.exportWorkspace();
    const file = new File([JSON.stringify(envelope)], 'workspace.json', {
      type: 'application/json',
    });
    return { repos, serializer, file };
  }

  function importInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('import file input not found');
    return input;
  }

  async function confirmClearAll(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole('button', { name: /clear data \(all battles and organisms\)/i }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Clear All Data?' });
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
  }

  it('the reverse order holds too: an Import after a confirmed Clear All replaces its status (Review Finding D2)', async () => {
    const { repos, serializer, file } = await pristineSetup();
    render(
      <DataManagement
        serializer={serializer}
        workspace={repos}
        workspaceMeta={repos.workspaceMeta}
        battles={repos.battles}
        organisms={repos.organisms}
        onImported={vi.fn()}
        onCleared={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await confirmClearAll(user);
    expect(await screen.findByRole('status')).toHaveTextContent(/all data cleared/i);

    // Clearing left the store pristine, so this Import also runs with no dialog.
    await user.upload(importInput(), file);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/import complete/i));
    expect(screen.getAllByRole('status', { hidden: true })).toHaveLength(1);
  });

  it("an Export click clears another row's outcome from the shared slot (Review Finding D2)", async () => {
    const { repos, serializer, file } = await pristineSetup();
    render(
      <DataManagement
        serializer={serializer}
        workspace={repos}
        workspaceMeta={repos.workspaceMeta}
        battles={repos.battles}
        organisms={repos.organisms}
        onImported={vi.fn()}
        onCleared={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.upload(importInput(), file);
    expect(await screen.findByRole('status')).toHaveTextContent(/import complete/i);

    await user.click(screen.getByRole('button', { name: /export workspace/i }));
    await waitFor(() => expect(downloadJsonFile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
    expect(screen.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('an outcome from a flow started BEFORE the newest one is dropped: a late Import never overwrites a later Clear All (Review Finding D2)', async () => {
    const { repos, serializer, file } = await pristineSetup();
    let releaseImport: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    const importWorkspace = vi.fn(async (text: string) => {
      await gate;
      return serializer.importWorkspace(text);
    });
    render(
      <DataManagement
        serializer={{ exportWorkspace: serializer.exportWorkspace, importWorkspace }}
        workspace={repos}
        workspaceMeta={repos.workspaceMeta}
        battles={repos.battles}
        organisms={repos.organisms}
        onImported={vi.fn()}
        onCleared={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    // Pristine: no dialog, so the Import is in flight and nothing is inert.
    await user.upload(importInput(), file);
    await waitFor(() => expect(importWorkspace).toHaveBeenCalledTimes(1));

    await confirmClearAll(user);
    expect(await screen.findByRole('status')).toHaveTextContent(/all data cleared/i);

    // Settle the stale Import, and let its row's continuation (the `onMessage` it would publish)
    // run before asserting.
    await act(async () => {
      releaseImport();
      await importWorkspace.mock.results[0]?.value;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const statuses = screen.getAllByRole('status', { hidden: true });
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent(/all data cleared/i);
    expect(screen.queryByText(/import complete/i)).toBeNull();
  });

  // Story 7.5: the new 'preset' owner applies the same D2 rules as Import and Clear All.
  it('an Export click clears a Load Preset outcome from the shared slot (D2, Story 7.5)', async () => {
    stubPresetFetch();
    const { repos, serializer } = await pristineSetup();
    render(
      <DataManagement
        serializer={serializer}
        workspace={repos}
        workspaceMeta={repos.workspaceMeta}
        battles={repos.battles}
        organisms={repos.organisms}
        onImported={vi.fn()}
        onCleared={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Load preset workspace' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/^Loaded /);

    await user.click(screen.getByRole('button', { name: /export workspace/i }));
    await waitFor(() => expect(downloadJsonFile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
  });

  // Pins CURRENT, accepted behaviour (Story 7.5 review, owner ruling D1 (a)), not the ideal. Clear
  // All lands while the pristine-path preset import is in flight (after the fetch and the pristine
  // check), and only the outcome MESSAGE is dropped and asserted. The store (not asserted here)
  // still ends up holding the preset while the visible outcome says "All data cleared" — the
  // cross-row mismatch recorded in deferred-work.md.
  it('a stale Load Preset outcome that lands after a later Clear All is dropped (D2, Story 7.5)', async () => {
    stubPresetFetch();
    const { repos, serializer } = await pristineSetup();
    let releaseImport: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    const importWorkspace = vi.fn(async (text: string) => {
      await gate;
      return serializer.importWorkspace(text);
    });
    render(
      <DataManagement
        serializer={{ exportWorkspace: serializer.exportWorkspace, importWorkspace }}
        workspace={repos}
        workspaceMeta={repos.workspaceMeta}
        battles={repos.battles}
        organisms={repos.organisms}
        onImported={vi.fn()}
        onCleared={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Load preset workspace' }));
    await waitFor(() => expect(importWorkspace).toHaveBeenCalledTimes(1));

    await confirmClearAll(user);
    expect(await screen.findByRole('status')).toHaveTextContent(/all data cleared/i);

    await act(async () => {
      releaseImport();
      await importWorkspace.mock.results[0]?.value;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const statuses = screen.getAllByRole('status', { hidden: true });
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent(/all data cleared/i);
    expect(screen.queryByText(/^Loaded /)).toBeNull();
  });
});
