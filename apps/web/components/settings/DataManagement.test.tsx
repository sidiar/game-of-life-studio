import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        'Download a JSON file containing all your battles and organisms for backup or transfer',
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
    expect(headings).toEqual(['Export Workspace', 'Import', 'Clear All Data']);
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
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

    const dialog = await screen.findByRole('dialog', { name: 'Clear All Data?' });
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'All data cleared. Your workspace is back to its default state.',
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
