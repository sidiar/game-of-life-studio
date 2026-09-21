import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { createFakeRepositories, createMockOrganisms, createMockWorkspace } from '@gol/test-utils';
import SettingsPage from './SettingsPage';

// `<dd>` carries no accessible name (ARIA "definition" role is name-from-author-prohibited), so
// term/definition pairs are read as parallel lists and matched by index/order — the same shape
// app/(gallery)/settings/page.test.tsx uses.
function readStats() {
  const terms = screen.getAllByRole('term').map((el) => el.textContent);
  const definitions = screen.getAllByRole('definition').map((el) => el.textContent);
  return Object.fromEntries(terms.map((term, i) => [term, definitions[i]])) as Record<
    string,
    string | null
  >;
}

describe('SettingsPage', () => {
  it('shows "Loading settings…" while seeding, even after both loads have resolved (Story 4.1 review lesson)', async () => {
    const repos = createFakeRepositories({ organisms: createMockOrganisms() });

    render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={repos.organisms}
        seedStatus="seeding"
      />,
    );

    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
    // Flush the fake's own promises — the loads resolve quickly, but seedStatus is still
    // 'seeding' and must keep the page in its loading state regardless.
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(2);
    });

    const stats = readStats();
    expect(stats['Saved Battles']).toBe(String(workspace.battles.length));
    expect(stats.Organisms).toBe(String(workspace.organisms.length));

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workspace Statistics' }),
    ).toBeInTheDocument();
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
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong loading your settings.',
    );
  });

  it('the seeding → ready flip re-runs the counts', async () => {
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

    const { rerender } = render(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={organisms}
        seedStatus="seeding"
      />,
    );

    rerender(
      <SettingsPage
        settings={repos.settings}
        battles={repos.battles}
        organisms={organisms}
        seedStatus="ready"
      />,
    );

    await waitFor(() => {
      expect(readStats().Organisms).toBe(String(createMockOrganisms().length));
    });
    expect(organisms.list).toHaveBeenCalledTimes(2);
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(2);
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(2);
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('term')).toHaveLength(2);
    });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
