import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC } from '@gol/domain';
import { createWorkspaceSerializer } from '@gol/persistence';
import {
  createFakeRepositories,
  createMockBattles,
  createMockOrganisms,
  createMockWorkspace,
} from '@gol/test-utils';
import { formatStorageSize } from '@/lib/settings/formatStorageSize';
import SettingsPage from './SettingsPage';

// `<dd>` carries no accessible name (ARIA "definition" role is name-from-author-prohibited), so
// term/definition pairs are read as parallel lists and matched by index/order — the same shape
// app/(gallery)/settings/page.test.tsx uses.
function readStats() {
  const terms = screen.getAllByRole('term').map((el) => el.textContent);
  const definitions = screen.getAllByRole('definition').map((el) => el.textContent);
  // Index pairing is only sound when the two lists are the same length — otherwise a tile's value
  // reads as `undefined` typed as `string` and the failure points at the wrong assertion.
  expect(definitions).toHaveLength(terms.length);
  return Object.fromEntries(terms.map((term, i) => [term, definitions[i]])) as Record<
    string,
    string | null
  >;
}

describe('SettingsPage', () => {
  it('shows "Loading settings…" while seeding, even after both loads have resolved (Story 4.1 review lesson)', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });
    const load = vi.spyOn(repos.settings, 'load');
    const listBattles = vi.spyOn(repos.battles, 'list');
    const listOrganisms = vi.spyOn(repos.organisms, 'list');
    const usage = vi.spyOn(repos, 'storageUsage');

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="seeding"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
    // Let every load actually SETTLE first — the useAsyncResource chain
    // (`Promise.resolve().then(load).then(set)`) is four microtask ticks deep, so a fixed number of
    // `await Promise.resolve()` flushes asserts against resources that are still 'loading' on
    // their own, and the test stays green with the `seedStatus === 'seeding'` clause deleted from
    // the fold (review 2026-09-21; the OrganismLibrary.test.tsx:27-40 shape).
    await waitFor(() => {
      expect(load).toHaveResolved();
      expect(listBattles).toHaveResolved();
      expect(listOrganisms).toHaveResolved();
      expect(usage).toHaveResolved();
    });
    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    // The wrapper is what carries aria-busy — never the outer section (deferred-work.md:192).
    expect(screen.getByText('Loading settings…').parentElement).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('ready: renders the counts derived from the fixtures, with dt/dd pairs associated', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });

    const stats = readStats();
    expect(stats['Saved Battles']).toBe(String(mockWorkspace.battles.length));
    expect(stats.Organisms).toBe(String(mockWorkspace.organisms.length));

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    const cardTitle = screen.getByRole('heading', { level: 2, name: 'Workspace Statistics' });
    expect(cardTitle).toBeInTheDocument();
    // aria-busy flips back off once ready — the wrapper is the card's grandparent
    // (wrapper > Container > Card > h2).
    expect(cardTitle.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
  });

  it('ready: Storage Used equals formatStorageSize(storageUsage().bytes) and is not the empty figure', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });

    const expected = formatStorageSize((await repos.storageUsage()).bytes);
    expect(readStats()['Storage Used']).toBe(expected);
    expect(readStats()['Storage Used']).not.toBe('0.0 KB');
  });

  it('a rejecting settings.load() renders an alert and no h2 (FD3 — never degrades to defaults)', async () => {
    const repos = createFakeRepositories({
      organisms: createMockOrganisms(),
      raw: { settings: { theme: 'not-a-real-theme', gridLines: 'not-a-boolean' } },
    });

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong loading your settings.',
      );
    });
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('a rejecting battles.list() renders an alert', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });
    const battles = { ...repos.battles, list: vi.fn().mockRejectedValue(new Error('boom')) };

    render(
      <SettingsPage
        settings={repos.settings}
        battles={battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong loading your settings.',
      );
    });
  });

  it('a rejecting workspace.storageUsage() renders an alert — same fold as the list rejection', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });
    const workspace = {
      storageUsage: vi.fn().mockRejectedValue(new Error('boom')),
      clearAll: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={workspace}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong loading your settings.',
      );
    });
  });

  it('seedStatus="error" renders an alert', () => {
    const repos = createFakeRepositories();

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="error"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong loading your settings.',
    );
  });

  it('the seeding → ready flip re-runs the counts and the storage meter (Story 5.2 FD6)', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });
    let call = 0;
    const organisms = {
      ...repos.organisms,
      list: vi.fn().mockImplementation(() => {
        call += 1;
        // First read (mid-seed) sees a pre-seed store; the second, post-flip read sees the seed.
        return Promise.resolve(call === 1 ? [] : createMockOrganisms());
      }),
    };
    const usageSpy = vi.spyOn(repos, 'storageUsage');

    const { rerender } = render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={organisms}
        seedStatus="seeding"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    rerender(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(readStats().Organisms).toBe(String(createMockOrganisms().length));
    });
    expect(organisms.list).toHaveBeenCalledTimes(2);
    expect(usageSpy).toHaveBeenCalledTimes(2);
  });

  it('page-scoped refresh: Saved Battles and Storage Used both change after a save on remount (AC4)', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });

    const { unmount } = render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(readStats()['Saved Battles']).toBe('0');
    });
    const before = readStats()['Storage Used'];

    unmount();

    const mockWorkspace = createMockWorkspace();
    await repos.battles.save(mockWorkspace.battles[0]);

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(readStats()['Saved Battles']).toBe('1');
    });
    const after = readStats()['Storage Used'];
    expect(after).not.toBe(before);
    expect(after).toBe(formatStorageSize((await repos.storageUsage()).bytes));
  });

  it('never calls settings.save (AC5 — the shell reads gol:settings, never writes it)', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });
    const saveSpy = vi.spyOn(repos.settings, 'save');

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('renders exactly one h1, exactly two h2s (Statistics + Data Management), and no Epic 6/6.10 dead-section text (the no-dead-section guard, updated by Story 5.10)', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: 'Data Management' })).toBeInTheDocument();
    // "Export" (Story 5.5), "Import" (Story 5.9) and "Clear" All Data (Story 5.10) are now real,
    // live affordances — no longer in the forbidden list. Auto-Save is still a dead section
    // (6.10), as are Epic 6's rows. The row adds no heading beyond the existing two h2s.
    expect(screen.queryByText(/display|simulation|theme|auto-save/i)).not.toBeInTheDocument();
  });

  it('has no axe accessibility violations once ready', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });
    const { container } = render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // AC9: axe on the WHOLE page with the export alert showing — heading order, the aria-busy
  // wrapper and the second card's landmark are only checked together here, not by
  // DataManagement.test.tsx's card-alone scan.
  it('has no axe accessibility violations in the export error state, with the alert showing', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });
    const { container } = render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{
          exportWorkspace: vi.fn().mockRejectedValue(new Error('unreadable')),
          importWorkspace: vi.fn(),
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /export workspace/i }));
    await screen.findByRole('alert');

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Story 5.9 AC6: `onImported={statsResource.reload}` (`<SettingsPage>`'s own wiring) — this is
  // the ONE place that wiring is exercised; `ImportWorkspaceRow.test.tsx` owns the import flow's
  // own branches (dialog, pristine skip, failures).
  it('a successful import refreshes the statistics counts (AC6)', async () => {
    // Target: pristine (AC4) — zero battles, the seed alone — so the import runs with no warning
    // dialog and this test stays about the refresh, not about dismissing a modal first.
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    const serializer = createWorkspaceSerializer({
      repos,
      appVersion: '0.0.0',
      now: () => new Date('2026-01-05T12:00:00.000Z'),
    });

    // A DIFFERENT, valid workspace file — one battle, the three mock organisms, no Conway's
    // Classic reference (createMockBattles()[1] targets Conway and would fail the closure check
    // without also carrying it; battle A does not).
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
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={serializer}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });
    expect(readStats()['Saved Battles']).toBe('0');
    expect(readStats().Organisms).toBe('1');

    const user = userEvent.setup();
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('import file input not found');
    await user.upload(input, file);

    // `ensureDefaultOrganism` adds Conway's Classic back (M9): the source carried 3 organisms and
    // no Conway, so the imported library ends at 4.
    await waitFor(() => {
      expect(readStats()['Saved Battles']).toBe('1');
    });
    expect(readStats().Organisms).toBe('4');
  });

  // Story 5.10 AC5: `onCleared={statsResource.reload}` (`<SettingsPage>`'s own wiring) — this is
  // the ONE place that wiring is exercised; `ClearAllDataRow.test.tsx` owns the flow's own
  // branches (dialog, ordering, failures).
  it('a confirmed Clear All refreshes the statistics counts to 0 battles / 1 organism (AC5)', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
        serializer={{ exportWorkspace: vi.fn(), importWorkspace: vi.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });
    expect(readStats()['Saved Battles']).toBe(String(mockWorkspace.battles.length));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Clear All Data?' });
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    await waitFor(() => {
      expect(readStats()['Saved Battles']).toBe('0');
    });
    expect(readStats().Organisms).toBe('1');
  });
});
