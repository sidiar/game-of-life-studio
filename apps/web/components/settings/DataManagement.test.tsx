import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { downloadJsonFile } from '@/lib/export/downloadJsonFile';
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

describe('DataManagement', () => {
  it('renders the Data Management heading, the row label/description, and the Export button by role and accessible name (AC1)', () => {
    const serializer = { exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE) };
    render(<DataManagement serializer={serializer} />);

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

  it('clicking Export calls exportWorkspace exactly once and hands the download seam the AC3 filename and the envelope', async () => {
    const serializer = { exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE) };
    render(<DataManagement serializer={serializer} />);

    fireEvent.click(screen.getByRole('button', { name: /export workspace/i }));

    await waitFor(() => {
      expect(downloadJsonFile).toHaveBeenCalledTimes(1);
    });
    expect(serializer.exportWorkspace).toHaveBeenCalledTimes(1);
    expect(downloadJsonFile).toHaveBeenCalledWith(
      'game-of-life-workspace-2026-01-05.json',
      ENVELOPE,
    );
  });

  it('a double click while an export is in flight calls exportWorkspace exactly once (FD8)', async () => {
    let resolveExport: (value: typeof ENVELOPE) => void = () => {};
    const pending = new Promise<typeof ENVELOPE>((resolve) => {
      resolveExport = resolve;
    });
    const serializer = { exportWorkspace: vi.fn().mockReturnValue(pending) };
    render(<DataManagement serializer={serializer} />);

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
    };
    render(<DataManagement serializer={serializer} />);

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

  it('adds no term/definition roles to the page (the readStats() index-pairing guard, AC9)', () => {
    const serializer = { exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE) };
    render(<DataManagement serializer={serializer} />);

    expect(screen.queryAllByRole('term')).toHaveLength(0);
    expect(screen.queryAllByRole('definition')).toHaveLength(0);
  });

  it('has no axe accessibility violations in the ready state', async () => {
    const serializer = { exportWorkspace: vi.fn().mockResolvedValue(ENVELOPE) };
    const { container } = render(<DataManagement serializer={serializer} />);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe accessibility violations in the error state, with the alert visible', async () => {
    const serializer = { exportWorkspace: vi.fn().mockRejectedValue(new Error('boom')) };
    const { container } = render(<DataManagement serializer={serializer} />);

    fireEvent.click(screen.getByRole('button', { name: /export workspace/i }));
    await screen.findByRole('alert');

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
