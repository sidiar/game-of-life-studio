import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC, DEFAULT_SETTINGS } from '@gol/domain';
import { NewerFormatVersionError, STORAGE_KEYS } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace } from '@gol/test-utils';
import type { StorageFailureKind } from '@/lib/storage/storageFailure';
import {
  CORRUPT_BATTLES_MESSAGE,
  CORRUPT_FORMAT_MESSAGE,
  CORRUPT_ORGANISMS_MESSAGE,
  CORRUPT_SETTINGS_MESSAGE,
  CORRUPT_WORKSPACE_MESSAGE,
  NEWER_VERSION_MESSAGE,
  RESTORE_SETTINGS_FAILURE_MESSAGE,
  STORAGE_FULL_MESSAGE,
  UNAVAILABLE_MESSAGE,
} from '@/lib/storage/storageFailureMessages';
import { CLEAR_ALL_FAILURE_MESSAGE } from '@/lib/clearAll/clearAllMessages';
import StorageFailureNotice from './StorageFailureNotice';

const NON_DEFAULT_SETTINGS = {
  ...DEFAULT_SETTINGS,
  theme: 'biotech-terminal' as const,
  gridLines: false,
};

async function populatedRepos() {
  const repos = createFakeRepositories(createMockWorkspace());
  await repos.settings.save(NON_DEFAULT_SETTINGS);
  return repos;
}

type Repos = Awaited<ReturnType<typeof populatedRepos>>;

async function snapshot(repos: Repos) {
  return {
    battles: await repos.battles.list(),
    organisms: await repos.organisms.list(),
    settings: await repos.settings.load(),
  };
}

function renderNotice(kind: StorageFailureKind, repos: Repos, reload = vi.fn()) {
  const result = render(
    <StorageFailureNotice
      kind={kind}
      workspace={repos}
      organisms={repos.organisms}
      settings={repos.settings}
      reload={reload}
    />,
  );
  return { ...result, reload };
}

const buttonLabels = () => screen.getAllByRole('button').map((b) => b.textContent);

async function openResetDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reset Workspace' }));
  const dialog = await screen.findByRole('dialog', { name: 'Clear All Data?' });
  return { user, dialog };
}

describe('StorageFailureNotice (Story 5.11)', () => {
  it.each<[StorageFailureKind, string, string[]]>([
    ['newer-version', NEWER_VERSION_MESSAGE, ['Reload']],
    ['corrupt-workspace', CORRUPT_WORKSPACE_MESSAGE, ['Reset Workspace']],
    ['corrupt-settings', CORRUPT_SETTINGS_MESSAGE, ['Restore Default Settings']],
    ['storage-full', STORAGE_FULL_MESSAGE, ['Reload']],
    ['unavailable', UNAVAILABLE_MESSAGE, ['Reload']],
  ])('%s: explains in one alert and offers exactly its action set', async (kind, text, actions) => {
    const repos = await populatedRepos();
    renderNotice(kind, repos);

    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(buttonLabels()).toEqual(actions);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  // Owner ruling D2 (b): the corrupt-workspace line names only the namespace that failed.
  it.each([
    [[STORAGE_KEYS.battles], CORRUPT_BATTLES_MESSAGE],
    [[STORAGE_KEYS.organisms], CORRUPT_ORGANISMS_MESSAGE],
    [[STORAGE_KEYS.schema], CORRUPT_FORMAT_MESSAGE],
  ])('corrupt-workspace with keys %j names only that namespace', async (keys, text) => {
    const repos = await populatedRepos();
    render(
      <StorageFailureNotice
        kind="corrupt-workspace"
        corruptKeys={keys}
        workspace={repos}
        organisms={repos.organisms}
        reload={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(buttonLabels()).toEqual(['Reset Workspace']);
  });

  it('newer-version never renders a reset or restore, even with every port given (owner ruling)', async () => {
    const repos = await populatedRepos();
    renderNotice('newer-version', repos);
    expect(screen.queryByRole('button', { name: /reset|restore/iu })).toBeNull();
  });

  it('corrupt-workspace without ports falls back to Reload rather than offering nothing', () => {
    render(<StorageFailureNotice kind="corrupt-workspace" reload={vi.fn()} />);
    expect(buttonLabels()).toEqual(['Reload']);
  });

  it('rendering the notice writes nothing (AC4)', async () => {
    const repos = await populatedRepos();
    const before = await snapshot(repos);
    const clearAll = vi.spyOn(repos, 'clearAll');
    const discard = vi.spyOn(repos, 'discardUnreadableStamp');
    const save = vi.spyOn(repos.settings, 'save');
    renderNotice('corrupt-workspace', repos);

    expect(await snapshot(repos)).toEqual(before);
    expect(clearAll).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('Reload calls reload once', async () => {
    const repos = await populatedRepos();
    const { reload } = renderNotice('unavailable', repos);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Reset Workspace opens Story 5.10's dialog with FR-8.5's sentence, Cancel first", async () => {
    const repos = await populatedRepos();
    renderNotice('corrupt-workspace', repos);
    const { dialog } = await openResetDialog();

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
  });

  it('confirm recovers the default workspace, keeps settings, and reloads once (AC3)', async () => {
    const repos = await populatedRepos();
    const before = await snapshot(repos);
    const { reload } = renderNotice('corrupt-workspace', repos);
    const { user, dialog } = await openResetDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(await repos.battles.list()).toEqual([]);
    expect(await repos.organisms.list()).toEqual([CONWAYS_CLASSIC]);
    expect(await repos.settings.load()).toEqual(before.settings);
  });

  it('the reset runs only after the dialog has exited — the ordering assertion', async () => {
    const repos = await populatedRepos();
    const workspace = {
      discardUnreadableStamp: vi.fn(() => repos.discardUnreadableStamp()),
      clearAll: vi.fn(() => repos.clearAll()),
    };
    const reload = vi.fn();
    render(
      <StorageFailureNotice
        kind="corrupt-workspace"
        workspace={workspace}
        organisms={repos.organisms}
        reload={reload}
      />,
    );
    const { user, dialog } = await openResetDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    // The confirm only records the choice: nothing has run while the dialog is exiting.
    expect(workspace.discardUnreadableStamp).not.toHaveBeenCalled();
    expect(workspace.clearAll).not.toHaveBeenCalled();

    await waitFor(() => expect(workspace.clearAll).toHaveBeenCalled());
    // Same tick as the wait resolving: the dialog must already be gone.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each([
    [
      'Cancel',
      async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) =>
        user.click(within(dialog).getByRole('button', { name: 'Cancel' })),
    ],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    [
      'a backdrop click',
      async (user: ReturnType<typeof userEvent.setup>) => {
        const container = document.querySelector('.MuiDialog-container');
        if (!(container instanceof HTMLElement)) throw new Error('dialog container not found');
        await user.click(container);
      },
    ],
  ])('%s writes nothing and returns focus to Reset Workspace (AC4)', async (_label, decline) => {
    const repos = await populatedRepos();
    const before = await snapshot(repos);
    const { reload } = renderNotice('corrupt-workspace', repos);
    const { user, dialog } = await openResetDialog();
    await decline(user, dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await snapshot(repos)).toEqual(before);
    expect(reload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reset Workspace' })).toHaveFocus(),
    );
  });

  it('a rejecting clearAll shows the never-"unchanged" alert, does not reload, and a retry succeeds', async () => {
    const repos = await populatedRepos();
    let shouldFail = true;
    const workspace = {
      discardUnreadableStamp: vi.fn(() => repos.discardUnreadableStamp()),
      clearAll: vi.fn(async () => {
        if (shouldFail) throw new Error('storage boom');
        await repos.clearAll();
      }),
    };
    const reload = vi.fn();
    render(
      <StorageFailureNotice
        kind="corrupt-workspace"
        workspace={workspace}
        organisms={repos.organisms}
        reload={reload}
      />,
    );
    let { user, dialog } = await openResetDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    // A text query, not a default role query: MUI aria-hides the background while the dialog is
    // mounted, so a role query could not see an alert published too early and the dialog check
    // below would pass vacuously. ByText ignores aria-hidden.
    await waitFor(() =>
      expect(
        screen.queryByText(CLEAR_ALL_FAILURE_MESSAGE, { selector: '[role="alert"]' }),
      ).not.toBeNull(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getAllByRole('alert', { hidden: true })).toHaveLength(2);
    expect(reload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reset Workspace' })).toHaveFocus(),
    );

    shouldFail = false;
    ({ user, dialog } = await openResetDialog());
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(await repos.organisms.list()).toEqual([CONWAYS_CLASSIC]);
  });

  it('a stamp that turned newer mid-recovery gets the newer copy, never "try again", and no reload', async () => {
    const repos = await populatedRepos();
    const workspace = {
      discardUnreadableStamp: vi
        .fn()
        .mockRejectedValue(new NewerFormatVersionError(STORAGE_KEYS.schema, 2, 1, 'x')),
      clearAll: vi.fn(() => repos.clearAll()),
    };
    const reload = vi.fn();
    render(
      <StorageFailureNotice
        kind="corrupt-workspace"
        workspace={workspace}
        organisms={repos.organisms}
        reload={reload}
      />,
    );
    const { user, dialog } = await openResetDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));

    await waitFor(() =>
      expect(
        screen.queryByText(NEWER_VERSION_MESSAGE, { selector: '[role="alert"]' }),
      ).not.toBeNull(),
    );
    expect(screen.queryByText(CLEAR_ALL_FAILURE_MESSAGE)).toBeNull();
    expect(workspace.clearAll).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a notice unmounted while the recovery runs does not reload the route the user moved to', async () => {
    const repos = await populatedRepos();
    let finishClear: (() => void) | undefined;
    const workspace = {
      discardUnreadableStamp: vi.fn(() => repos.discardUnreadableStamp()),
      clearAll: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishClear = () => {
              void repos.clearAll().then(resolve);
            };
          }),
      ),
    };
    const reload = vi.fn();
    const { unmount } = render(
      <StorageFailureNotice
        kind="corrupt-workspace"
        workspace={workspace}
        organisms={repos.organisms}
        reload={reload}
      />,
    );
    const { user, dialog } = await openResetDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    await waitFor(() => expect(workspace.clearAll).toHaveBeenCalledTimes(1));

    unmount();
    finishClear?.();

    // The recovery itself completes — it was already running when the user left.
    await waitFor(async () => expect(await repos.organisms.list()).toEqual([CONWAYS_CLASSIC]));
    expect(reload).not.toHaveBeenCalled();
  });

  it('a second Reset Workspace click during the exit is a no-op (one dialog, one reset)', async () => {
    const repos = await populatedRepos();
    const workspace = {
      discardUnreadableStamp: vi.fn(() => repos.discardUnreadableStamp()),
      clearAll: vi.fn(() => repos.clearAll()),
    };
    const reload = vi.fn();
    render(
      <StorageFailureNotice
        kind="corrupt-workspace"
        workspace={workspace}
        organisms={repos.organisms}
        reload={reload}
      />,
    );
    const button = screen.getByRole('button', { name: 'Reset Workspace' });
    const { user, dialog } = await openResetDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    // jsdom ignores `inert`, so this reaches the handler while the dialog exits.
    await user.click(button);

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(workspace.clearAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Restore Default Settings saves DEFAULT_SETTINGS only, and reloads (FD5)', async () => {
    const repos = await populatedRepos();
    const before = await snapshot(repos);
    const clearAll = vi.spyOn(repos, 'clearAll');
    const { reload } = renderNotice('corrupt-settings', repos);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Restore Default Settings' }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(await repos.settings.load()).toEqual(DEFAULT_SETTINGS);
    expect(await repos.battles.list()).toEqual(before.battles);
    expect(await repos.organisms.list()).toEqual(before.organisms);
    expect(clearAll).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a failed restore alerts without claiming success and does not reload', async () => {
    const repos = await populatedRepos();
    const settings = { save: vi.fn().mockRejectedValue(new Error('boom')) };
    const reload = vi.fn();
    render(<StorageFailureNotice kind="corrupt-settings" settings={settings} reload={reload} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Restore Default Settings' }));

    expect(await screen.findByText(RESTORE_SETTINGS_FAILURE_MESSAGE)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(reload).not.toHaveBeenCalled();
    expect(await repos.settings.load()).toEqual(NON_DEFAULT_SETTINGS);
  });

  it('under StrictMode, a confirmed reset still reloads (the mounted-ref re-arm)', async () => {
    const repos = await populatedRepos();
    const reload = vi.fn();
    render(
      <StrictMode>
        <StorageFailureNotice
          kind="corrupt-workspace"
          workspace={repos}
          organisms={repos.organisms}
          reload={reload}
        />
      </StrictMode>,
    );
    const { user, dialog } = await openResetDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Clear All Data' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('the actions are reachable by Tab', async () => {
    const repos = await populatedRepos();
    renderNotice('corrupt-workspace', repos);
    await userEvent.setup().tab();
    expect(screen.getByRole('button', { name: 'Reset Workspace' })).toHaveFocus();
  });

  it.each<StorageFailureKind>([
    'newer-version',
    'corrupt-workspace',
    'corrupt-settings',
    'storage-full',
    'unavailable',
  ])('%s has no axe violations', async (kind) => {
    const repos = await populatedRepos();
    const { container } = renderNotice(kind, repos);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no axe violations with the reset dialog open', async () => {
    const repos = await populatedRepos();
    renderNotice('corrupt-workspace', repos);
    await openResetDialog();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
