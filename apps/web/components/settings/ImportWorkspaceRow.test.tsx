import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC, type Organism } from '@gol/domain';
import {
  createWorkspaceSerializer,
  ImportError,
  type AppRepositories,
  type ImportSummary,
  type WorkspaceSerializer,
} from '@gol/persistence';
import { createFakeRepositories, createMockBattles, createMockOrganisms } from '@gol/test-utils';
import { downloadJsonFile } from '@/lib/export/downloadJsonFile';
import ImportWorkspaceRow from './ImportWorkspaceRow';

// Same seam DataManagement.test.tsx mocks, for the same reason: Export First's own DOM mechanism
// (Blob/URL/anchor) is `downloadJsonFile.test.ts`'s job, not this file's.
vi.mock('@/lib/export/downloadJsonFile', () => ({
  downloadJsonFile: vi.fn(),
}));

// The vitest config sets neither `clearMocks` nor `restoreMocks`, so the mock's call history is
// otherwise shared across every `it` in this file (DataManagement.test.tsx's own precedent).
beforeEach(() => {
  vi.mocked(downloadJsonFile).mockClear();
});

// A second organism, deliberately NOT deep-equal to CONWAYS_CLASSIC — the cheapest way to make a
// workspace non-pristine (AC4) without needing a schema-valid Battle record.
const EXTRA_ORGANISM: Organism = {
  ...CONWAYS_CLASSIC,
  id: 'extra-organism',
  name: 'Extra Organism',
};

function buildSerializer(repos: AppRepositories): WorkspaceSerializer {
  return createWorkspaceSerializer({
    repos,
    appVersion: '0.0.0',
    now: () => new Date('2026-01-05T12:00:00.000Z'),
  });
}

function renderRow(props: {
  repos: Pick<AppRepositories, 'battles' | 'organisms'>;
  serializer: Pick<WorkspaceSerializer, 'exportWorkspace' | 'importWorkspace'>;
}) {
  const onImported = vi.fn();
  const result = render(
    <ImportWorkspaceRow
      serializer={props.serializer}
      battles={props.repos.battles}
      organisms={props.repos.organisms}
      onImported={onImported}
    />,
  );
  return { ...result, onImported };
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('import file input not found');
  return input;
}

function jsonFile(value: unknown, name = 'workspace.json'): File {
  return new File([JSON.stringify(value)], name, { type: 'application/json' });
}

describe('ImportWorkspaceRow', () => {
  it('renders the Import row label, description and button by role/accessible name (AC1)', () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    renderRow({ repos, serializer: buildSerializer(repos) });

    expect(screen.getByRole('heading', { level: 3, name: 'Import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import workspace/i })).toBeInTheDocument();
  });

  it('an invalid file shows the alert and never calls importWorkspace, with no warning dialog (AC2)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const real = buildSerializer(repos);
    const importSpy = vi.fn(real.importWorkspace);
    renderRow({
      repos,
      serializer: { exportWorkspace: real.exportWorkspace, importWorkspace: importSpy },
    });

    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile('not even an object', 'bad.json'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not a valid Game of Life Studio export file/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('a pristine workspace (Conway alone) imports directly, with no dialog, and shows the success status (AC4/AC6)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const serializer = buildSerializer(repos);
    const { onImported } = renderRow({ repos, serializer });

    const envelope = await serializer.exportWorkspace(); // trivially valid: this workspace itself
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'Import complete — your workspace now has 0 battles and 1 organism.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it.each(['workspace', 'battle'] as const)(
    'a non-pristine workspace opens the dialog with the %s-kind warning sentence',
    async (kind) => {
      const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
      renderRow({ repos, serializer: buildSerializer(repos) });

      const sourceRepos = createFakeRepositories({
        organisms: createMockOrganisms(),
        battles: [createMockBattles()[0]],
      });
      const sourceSerializer = buildSerializer(sourceRepos);
      const envelope =
        kind === 'workspace'
          ? await sourceSerializer.exportWorkspace()
          : await sourceSerializer.exportBattle(createMockBattles()[0].id);

      const user = userEvent.setup();
      await user.upload(fileInput(), jsonFile(envelope));

      const dialog = await screen.findByRole('dialog', { name: 'Replace Your Workspace?' });
      const subject = kind === 'workspace' ? 'this workspace' : 'this battle';
      expect(
        within(dialog).getByText(new RegExp(`Importing ${subject} will replace`)),
      ).toBeInTheDocument();
      expect(
        within(dialog)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Cancel', 'Export Current Workspace First', 'Import Anyway']);
    },
  );

  it('Cancel leaves the store untouched and returns focus to Import', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const serializer = buildSerializer(repos);
    renderRow({ repos, serializer });
    const before = {
      battles: await repos.battles.list(),
      organisms: await repos.organisms.list(),
    };

    const envelope = await serializer.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await repos.battles.list()).toEqual(before.battles);
    expect(await repos.organisms.list()).toEqual(before.organisms);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /import workspace/i })).toHaveFocus(),
    );
  });

  it('Escape leaves the store untouched and returns focus to Import', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const serializer = buildSerializer(repos);
    renderRow({ repos, serializer });
    const before = {
      battles: await repos.battles.list(),
      organisms: await repos.organisms.list(),
    };

    const envelope = await serializer.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await repos.battles.list()).toEqual(before.battles);
    expect(await repos.organisms.list()).toEqual(before.organisms);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /import workspace/i })).toHaveFocus(),
    );
  });

  it('Import Anyway imports only after the dialog has fully exited — the dialog is already gone at the first moment the status exists (AC7)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const serializer = buildSerializer(repos);
    const { onImported } = renderRow({ repos, serializer });

    const sourceRepos = createFakeRepositories({
      organisms: createMockOrganisms(),
      battles: [createMockBattles()[0]],
    });
    const envelope = await buildSerializer(sourceRepos).exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Import Anyway' }));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeNull());
    // The ordering assertion, same tick as the wait resolving: the dialog is already gone.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onImported).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /import workspace/i })).toHaveFocus(),
    );
  });

  it('Export First keeps the dialog open, calls the export seam once, and shows its status inside the dialog (AC5)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const serializer = buildSerializer(repos);
    renderRow({ repos, serializer });

    const envelope = await serializer.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Export Current Workspace First' }),
    );

    await waitFor(() =>
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Your current workspace was downloaded.',
      ),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(downloadJsonFile).toHaveBeenCalledTimes(1);
  });

  it('a rejecting Export First shows the in-dialog alert, keeps the dialog open, and imports nothing (AC5)', async () => {
    vi.mocked(downloadJsonFile).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const real = buildSerializer(repos);
    const importSpy = vi.fn(real.importWorkspace);
    renderRow({
      repos,
      serializer: { exportWorkspace: real.exportWorkspace, importWorkspace: importSpy },
    });

    const envelope = await real.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Export Current Workspace First' }),
    );

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Your current workspace could not be exported. Nothing was imported.',
      ),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(importSpy).not.toHaveBeenCalled();
  });

  it("shows the 'rollback-failed' copy without claiming the workspace is unchanged (pristine, no dialog)", async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const envelope = await buildSerializer(repos).exportWorkspace();
    const importWorkspace = vi.fn().mockRejectedValue(
      new ImportError('rollback-failed', {
        cause: new Error('write boom'),
        rollbackError: new Error('restore boom'),
      }),
    );
    renderRow({ repos, serializer: { exportWorkspace: vi.fn(), importWorkspace } });

    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be fully restored/);
    expect(alert.textContent).not.toMatch(/not changed/i);
    expect(alert.textContent).not.toMatch(/unchanged/i);
  });

  it('a double file pick during an in-flight flow is a no-op (Task 4.4)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    let resolveImport: (summary: ImportSummary) => void = () => {};
    const pending = new Promise<ImportSummary>((resolve) => {
      resolveImport = resolve;
    });
    const importWorkspace = vi.fn().mockReturnValue(pending);
    renderRow({ repos, serializer: { exportWorkspace: vi.fn(), importWorkspace } });

    // A trivially valid, empty workspace envelope — built from a throwaway repos/serializer
    // rather than hand-typed, so it can never drift from `WorkspaceExportSchema`.
    const envelope = await buildSerializer(createFakeRepositories()).exportWorkspace();
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: [jsonFile(envelope)], configurable: true });
    // Two synchronous dispatches, before either handler's first `await` — the same shape
    // `DataManagement.test.tsx`'s double-click test uses to reach the in-flight guard's branch.
    fireEvent.change(input);
    fireEvent.change(input);

    await waitFor(() => expect(importWorkspace).toHaveBeenCalledTimes(1));

    resolveImport({ kind: 'workspace', battleCount: 0, organismCount: 1 });
    await screen.findByRole('status');
    expect(importWorkspace).toHaveBeenCalledTimes(1);
  });

  it('onImported is called exactly once on success', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const envelope = await buildSerializer(repos).exportWorkspace();
    const { onImported } = renderRow({ repos, serializer: buildSerializer(repos) });

    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));
    await screen.findByRole('status');

    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('onImported is never called on failure', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const importWorkspace = vi.fn().mockRejectedValue(new ImportError('corrupt'));
    const { onImported } = renderRow({
      repos,
      serializer: { exportWorkspace: vi.fn(), importWorkspace },
    });

    const envelope = await buildSerializer(repos).exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));
    await screen.findByRole('alert');

    expect(onImported).not.toHaveBeenCalled();
  });

  it('a rejecting list() read counts as NOT pristine — the warning still shows (AC4, "when in doubt, warn")', async () => {
    // Pristine by content (Conway alone) — only the failed read can make it warn.
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const serializer = buildSerializer(repos);
    const envelope = await serializer.exportWorkspace();
    const importSpy = vi.fn(serializer.importWorkspace);
    render(
      <ImportWorkspaceRow
        serializer={{ exportWorkspace: serializer.exportWorkspace, importWorkspace: importSpy }}
        battles={{ list: vi.fn().mockRejectedValue(new Error('read boom')) }}
        organisms={repos.organisms}
        onImported={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('a backdrop click maps to Cancel: the store is untouched and focus returns to Import (AC3)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const real = buildSerializer(repos);
    const importSpy = vi.fn(real.importWorkspace);
    renderRow({
      repos,
      serializer: { exportWorkspace: real.exportWorkspace, importWorkspace: importSpy },
    });

    const envelope = await real.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));
    await screen.findByRole('dialog');

    // MUI's backdrop-click target is the dialog container (mousedown AND click on itself).
    const container = document.querySelector('.MuiDialog-container');
    if (!(container instanceof HTMLElement)) throw new Error('dialog container not found');
    await user.click(container);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(importSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /import workspace/i })).toHaveFocus(),
    );
  });

  it('clicking Import while a flow is in flight does not open the picker again (Task 4.4)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    let resolveImport: (summary: ImportSummary) => void = () => {};
    const importWorkspace = vi.fn().mockReturnValue(
      new Promise<ImportSummary>((resolve) => {
        resolveImport = resolve;
      }),
    );
    renderRow({ repos, serializer: { exportWorkspace: vi.fn(), importWorkspace } });

    const envelope = await buildSerializer(createFakeRepositories()).exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));
    await waitFor(() => expect(importWorkspace).toHaveBeenCalledTimes(1));

    const pickerClick = vi.spyOn(fileInput(), 'click');
    await user.click(screen.getByRole('button', { name: /import workspace/i }));
    expect(pickerClick).not.toHaveBeenCalled();

    resolveImport({ kind: 'workspace', battleCount: 0, organismCount: 1 });
    await screen.findByRole('status');
  });

  it('Import Anyway returns focus to Import only after the import has settled (AC7)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const real = buildSerializer(repos);
    let resolveImport: (summary: ImportSummary) => void = () => {};
    const importWorkspace = vi.fn().mockReturnValue(
      new Promise<ImportSummary>((resolve) => {
        resolveImport = resolve;
      }),
    );
    renderRow({ repos, serializer: { exportWorkspace: real.exportWorkspace, importWorkspace } });

    const envelope = await real.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Import Anyway' }));

    await waitFor(() => expect(importWorkspace).toHaveBeenCalledTimes(1));
    const importButton = screen.getByRole('button', { name: /import workspace/i });
    expect(importButton).not.toHaveFocus();

    resolveImport({ kind: 'workspace', battleCount: 0, organismCount: 1 });
    await screen.findByRole('status');
    await waitFor(() => expect(importButton).toHaveFocus());
  });

  it('a repeated Export First re-inserts its status, so the second attempt is announced too (AC5)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const serializer = buildSerializer(repos);
    renderRow({ repos, serializer });

    const envelope = await serializer.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));
    const dialog = await screen.findByRole('dialog');
    const exportFirst = within(dialog).getByRole('button', {
      name: 'Export Current Workspace First',
    });

    await user.click(exportFirst);
    const first = await within(dialog).findByRole('status');
    await user.click(exportFirst);
    await waitFor(() => expect(downloadJsonFile).toHaveBeenCalledTimes(2));
    const second = await within(dialog).findByRole('status');

    expect(second).not.toBe(first);
  });

  it('has no axe accessibility violations with the warning dialog open', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC, EXTRA_ORGANISM] });
    const serializer = buildSerializer(repos);
    renderRow({ repos, serializer });

    const envelope = await serializer.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));
    await screen.findByRole('dialog');

    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });

  it('has no axe accessibility violations with the success status shown', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const serializer = buildSerializer(repos);
    const { container } = renderRow({ repos, serializer });

    const envelope = await serializer.exportWorkspace();
    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile(envelope));
    await screen.findByRole('status');

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe accessibility violations with the failure alert shown', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const { container } = renderRow({ repos, serializer: buildSerializer(repos) });

    const user = userEvent.setup();
    await user.upload(fileInput(), jsonFile('not valid', 'bad.json'));
    await screen.findByRole('alert');

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
