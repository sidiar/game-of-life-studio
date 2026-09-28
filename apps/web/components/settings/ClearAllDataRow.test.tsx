import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC, DEFAULT_SETTINGS } from '@gol/domain';
import type { AppRepositories, OrganismRepository } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace } from '@gol/test-utils';
import ClearAllDataRow from './ClearAllDataRow';

function renderRow(props: {
  workspace: Pick<AppRepositories, 'clearAll'>;
  organisms: Pick<OrganismRepository, 'exists' | 'save'>;
}) {
  const onCleared = vi.fn();
  const result = render(
    <ClearAllDataRow
      workspace={props.workspace}
      organisms={props.organisms}
      onCleared={onCleared}
    />,
  );
  return { ...result, onCleared };
}

describe('ClearAllDataRow', () => {
  it('renders the row label, description and Clear Data button by role/accessible name (AC1)', () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    renderRow({ workspace: repos, organisms: repos.organisms });

    expect(screen.getByRole('heading', { level: 3, name: 'Clear All Data' })).toBeInTheDocument();
    expect(
      screen.getByText('Delete all battles and organisms from local storage (cannot be undone)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all data/i })).toHaveTextContent('Clear Data');
  });

  it("clicking Clear Data opens the dialog with FR-8.5's sentence and writes nothing (AC2)", async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const before = {
      battles: await repos.battles.list(),
      organisms: await repos.organisms.list(),
    };
    renderRow({ workspace: repos, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Clear All Data?' });
    expect(
      within(dialog).getByText(
        'This will delete all battles and organisms. This cannot be undone.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cancel', 'Clear All Data']);
    expect(await repos.battles.list()).toEqual(before.battles);
    expect(await repos.organisms.list()).toEqual(before.organisms);
  });

  it('the dialog shows even for a pristine workspace (contrast Story 5.9 AC4 — FD7, no pristine suppression)', async () => {
    const repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] });
    renderRow({ workspace: repos, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));

    expect(await screen.findByRole('dialog', { name: 'Clear All Data?' })).toBeInTheDocument();
  });

  it('Cancel leaves the store untouched and returns focus to Clear Data', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const before = {
      battles: await repos.battles.list(),
      organisms: await repos.organisms.list(),
    };
    renderRow({ workspace: repos, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await repos.battles.list()).toEqual(before.battles);
    expect(await repos.organisms.list()).toEqual(before.organisms);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /clear all data/i })).toHaveFocus(),
    );
  });

  it('Escape leaves the store untouched and returns focus to Clear Data', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const before = {
      battles: await repos.battles.list(),
      organisms: await repos.organisms.list(),
    };
    renderRow({ workspace: repos, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await repos.battles.list()).toEqual(before.battles);
    expect(await repos.organisms.list()).toEqual(before.organisms);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /clear all data/i })).toHaveFocus(),
    );
  });

  it('a backdrop click maps to Cancel: the store is untouched and focus returns to Clear Data', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const before = {
      battles: await repos.battles.list(),
      organisms: await repos.organisms.list(),
    };
    renderRow({ workspace: repos, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    await screen.findByRole('dialog');

    const container = document.querySelector('.MuiDialog-container');
    if (!(container instanceof HTMLElement)) throw new Error('dialog container not found');
    await user.click(container);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await repos.battles.list()).toEqual(before.battles);
    expect(await repos.organisms.list()).toEqual(before.organisms);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /clear all data/i })).toHaveFocus(),
    );
  });

  it('confirm on a populated fake resets to zero battles / Conway alone, shows status, calls onCleared once, and settings survive (AC3/AC4/AC5)', async () => {
    const mockWorkspace = createMockWorkspace();
    const repos = createFakeRepositories(mockWorkspace);
    // A NON-default settings record, so "unchanged" is a real comparison, not default === default.
    await repos.settings.save({
      ...DEFAULT_SETTINGS,
      theme: 'biotech-terminal',
      gridLines: false,
      defaultSpeed: 2,
    });
    const settingsBefore = await repos.settings.load();
    const settingsSaveSpy = vi.spyOn(repos.settings, 'save');
    const { onCleared } = renderRow({ workspace: repos, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'All data cleared. Your workspace is back to its default state.',
    );
    expect(await repos.battles.list()).toEqual([]);
    expect(await repos.organisms.list()).toEqual([CONWAYS_CLASSIC]);
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(settingsSaveSpy).not.toHaveBeenCalled();
    expect(await repos.settings.load()).toEqual(settingsBefore);
    // AC6: focus returns to Clear Data once the outcome is published (the `pendingRef` hold +
    // `focusTick` bump path, distinct from the Cancel/Escape/backdrop restore).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /clear all data/i })).toHaveFocus(),
    );
  });

  it('the dialog is already gone at the first moment the status exists — the ordering assertion (AC6)', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const workspace = { clearAll: vi.fn(() => repos.clearAll()) };
    renderRow({ workspace, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    // The confirm only records the choice: the reset has not started while the dialog exits.
    expect(workspace.clearAll).not.toHaveBeenCalled();

    // `hidden: true`: while the MUI modal is open it sets `aria-hidden` on its siblings (this
    // row's container among them), so a default role query could not see a status published
    // too early — the assertion below would pass vacuously.
    await waitFor(() => expect(screen.queryByRole('status', { hidden: true })).not.toBeNull());
    // Same tick as the wait resolving: the dialog must already be gone.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(workspace.clearAll).toHaveBeenCalledTimes(1);
  });

  it('failure: clearAll rejecting shows the alert without claiming the workspace is unchanged, and onCleared still runs (FD3)', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const workspace = { clearAll: vi.fn().mockRejectedValue(new Error('storage boom')) };
    const { onCleared } = renderRow({ workspace, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/unchanged/i);
    expect(alert.textContent).not.toMatch(/not changed/i);
    expect(onCleared).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /clear all data/i })).toHaveFocus(),
    );
  });

  it('failure after the clear (organisms.save rejects): a second confirm with the wrapper passing through completes the reset (idempotent retry)', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    let shouldFail = true;
    const organisms: Pick<OrganismRepository, 'exists' | 'save'> = {
      exists: repos.organisms.exists,
      save: vi.fn(async (organism) => {
        if (shouldFail) throw new Error('write boom');
        await repos.organisms.save(organism);
      }),
    };
    renderRow({ workspace: repos, organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    await screen.findByRole('alert');

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'All data cleared. Your workspace is back to its default state.',
    );
    expect(await repos.organisms.list()).toEqual([CONWAYS_CLASSIC]);
  });

  it('a second Clear Data click while a flow is pending is a no-op (one dialog, one reset)', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const workspace = { clearAll: vi.fn(() => repos.clearAll()) };
    renderRow({ workspace, organisms: repos.organisms });

    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: /clear all data/i });
    await user.click(button);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    // The dialog is now exiting and the flow is still pending. jsdom ignores `inert`, so this
    // click reaches the handler: without the `pendingRef` guard it would reset the recorded
    // choice and reopen the dialog, and the reset would never run.
    await user.click(button);

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(workspace.clearAll).toHaveBeenCalledTimes(1);
  });

  it('the flow works from the keyboard: Tab reaches Clear Data, Enter opens, focus stays trapped, Escape cancels (AC8)', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const battlesBefore = await repos.battles.list();
    renderRow({ workspace: repos, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.tab();
    const button = screen.getByRole('button', { name: /clear all data/i });
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Clear All Data?' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );

    // Tab cycles within the dialog (MUI's focus trap), never back out to the page.
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Clear All Data' })).toHaveFocus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
    expect(await repos.battles.list()).toEqual(battlesBefore);
  });

  it('under StrictMode, a confirmed reset still publishes its status (the mounted-ref re-arm)', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    render(
      <StrictMode>
        <ClearAllDataRow workspace={repos} organisms={repos.organisms} onCleared={vi.fn()} />
      </StrictMode>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('has no axe accessibility violations: idle, dialog open, status shown, alert shown', async () => {
    const repos = createFakeRepositories(createMockWorkspace());
    const { container } = renderRow({ workspace: repos, organisms: repos.organisms });
    expect((await axe(container)).violations).toEqual([]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog');
    expect((await axe(document.body)).violations).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    await screen.findByRole('status');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('an alert has no axe accessibility violations', async () => {
    const workspace = { clearAll: vi.fn().mockRejectedValue(new Error('boom')) };
    const repos = createFakeRepositories(createMockWorkspace());
    const { container } = renderRow({ workspace, organisms: repos.organisms });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    await screen.findByRole('alert');

    expect((await axe(container)).violations).toEqual([]);
  });
});
