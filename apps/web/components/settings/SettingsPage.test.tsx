import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { createFakeRepositories, createMockOrganisms, createMockWorkspace } from '@gol/test-utils';
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
    const workspace = createMockWorkspace();
    const repos = createFakeRepositories(workspace);

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });

    const stats = readStats();
    expect(stats['Saved Battles']).toBe(String(workspace.battles.length));
    expect(stats.Organisms).toBe(String(workspace.organisms.length));

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    const cardTitle = screen.getByRole('heading', { level: 2, name: 'Workspace Statistics' });
    expect(cardTitle).toBeInTheDocument();
    // aria-busy flips back off once ready — the wrapper is the card's grandparent
    // (wrapper > Container > Card > h2).
    expect(cardTitle.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
  });

  it('ready: Storage Used equals formatStorageSize(storageUsage().bytes) and is not the empty figure', async () => {
    const workspace = createMockWorkspace();
    const repos = createFakeRepositories(workspace);

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
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
    const workspace = { storageUsage: vi.fn().mockRejectedValue(new Error('boom')) };

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={workspace}
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
      />,
    );

    rerender(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={organisms}
        seedStatus="ready"
        workspace={repos}
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
      />,
    );

    await waitFor(() => {
      expect(readStats()['Saved Battles']).toBe('0');
    });
    const before = readStats()['Storage Used'];

    unmount();

    const workspace = createMockWorkspace();
    await repos.battles.save(workspace.battles[0]);

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('renders exactly one h1, exactly one h2, and no Epic 6 section text (the no-dead-section guard)', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="ready"
        workspace={repos}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(
      screen.queryByText(/display|simulation|theme|auto-save|export|import|clear/i),
    ).not.toBeInTheDocument();
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(3);
    });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
