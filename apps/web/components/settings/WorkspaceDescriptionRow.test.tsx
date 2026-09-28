import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { CONWAYS_CLASSIC, MAX_WORKSPACE_DESCRIPTION_LENGTH } from '@gol/domain';
import { createWorkspaceSerializer } from '@gol/persistence';
import { createFakeRepositories } from '@gol/test-utils';
import DataManagement from './DataManagement';
import WorkspaceDescriptionRow, {
  WORKSPACE_DESCRIPTION_SAVE_FAILED,
  WORKSPACE_DESCRIPTION_SAVED,
} from './WorkspaceDescriptionRow';

// The row inside the REAL card, so its outcome is asserted in the shared slot it publishes to.
function renderCard(repos = createFakeRepositories({ organisms: [CONWAYS_CLASSIC] })) {
  const serializer = createWorkspaceSerializer({
    repos,
    appVersion: '0.0.0',
    now: () => new Date('2026-01-05T12:00:00.000Z'),
  });
  const result = render(
    <DataManagement
      serializer={serializer}
      workspace={repos}
      battles={repos.battles}
      organisms={repos.organisms}
      workspaceMeta={repos.workspaceMeta}
      onImported={vi.fn()}
      onCleared={vi.fn()}
    />,
  );
  return { ...result, repos };
}

const field = () => screen.getByRole('textbox', { name: 'Workspace description' });
const saveButton = () => screen.getByRole('button', { name: 'Save workspace description' });

describe('WorkspaceDescriptionRow (Story 7.2, FR-9.5)', () => {
  it('loads the stored description into the field', async () => {
    renderCard(
      createFakeRepositories({
        organisms: [CONWAYS_CLASSIC],
        workspaceMeta: { description: 'Stored notes.' },
      }),
    );
    await waitFor(() => expect(field()).toHaveValue('Stored notes.'));
  });

  it('saves through the port and reports the outcome in the card’s shared status slot', async () => {
    const { repos } = renderCard();
    const user = userEvent.setup();

    await user.type(field(), 'My lab.');
    await user.click(saveButton());

    expect(await screen.findByRole('status')).toHaveTextContent(WORKSPACE_DESCRIPTION_SAVED);
    await expect(repos.workspaceMeta.load()).resolves.toEqual({ description: 'My lab.' });
  });

  it('a second click while a save is in flight is a no-op — and the button never disables', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = vi.fn(() => gate);
    const onMessage = vi.fn();
    render(
      <WorkspaceDescriptionRow
        workspaceMeta={{ load: vi.fn().mockResolvedValue({}), save }}
        onMessage={onMessage}
      />,
    );
    const user = userEvent.setup();

    await user.click(saveButton());
    await user.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeEnabled();

    release();
    await waitFor(() =>
      expect(onMessage).toHaveBeenLastCalledWith({
        role: 'status',
        text: WORKSPACE_DESCRIPTION_SAVED,
      }),
    );
  });

  it('a Save click before the initial load settles is a no-op — it cannot overwrite the stored value with the empty initial state (review finding, Story 7.2)', async () => {
    let resolveLoad: (meta: { description?: string }) => void = () => {};
    const loadGate = new Promise<{ description?: string }>((resolve) => {
      resolveLoad = resolve;
    });
    const save = vi.fn().mockResolvedValue(undefined);
    const onMessage = vi.fn();
    render(
      <WorkspaceDescriptionRow
        workspaceMeta={{ load: vi.fn(() => loadGate), save }}
        onMessage={onMessage}
      />,
    );

    // Fired before `load()` has resolved: `value` is still the initial `''`.
    fireEvent.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();

    resolveLoad({ description: 'Stored notes.' });
    await waitFor(() => expect(field()).toHaveValue('Stored notes.'));

    await userEvent.setup().click(saveButton());
    expect(save).toHaveBeenCalledWith({ description: 'Stored notes.' });
  });

  it('a failed save reports an alert', async () => {
    const onMessage = vi.fn();
    render(
      <WorkspaceDescriptionRow
        workspaceMeta={{
          load: vi.fn().mockResolvedValue({}),
          save: vi.fn().mockRejectedValue(new Error('quota')),
        }}
        onMessage={onMessage}
      />,
    );
    await userEvent.setup().click(saveButton());

    await waitFor(() =>
      expect(onMessage).toHaveBeenLastCalledWith({
        role: 'alert',
        text: WORKSPACE_DESCRIPTION_SAVE_FAILED,
      }),
    );
  });

  it('a rejected load leaves the field empty and usable', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkspaceDescriptionRow
        workspaceMeta={{ load: vi.fn().mockRejectedValue(new Error('corrupt')), save }}
        onMessage={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.type(field(), 'Fresh.');
    await user.click(saveButton());
    expect(save).toHaveBeenCalledWith({ description: 'Fresh.' });
  });

  it('clamps at the cap and announces the limit once', () => {
    render(
      <WorkspaceDescriptionRow
        workspaceMeta={{ load: vi.fn().mockResolvedValue({}), save: vi.fn() }}
        onMessage={vi.fn()}
      />,
    );

    fireEvent.change(field(), {
      target: { value: 'x'.repeat(MAX_WORKSPACE_DESCRIPTION_LENGTH + 10) },
    });
    expect(field()).toHaveValue('x'.repeat(MAX_WORKSPACE_DESCRIPTION_LENGTH));
    expect(screen.getByRole('status')).toHaveTextContent(
      `Description limit reached — ${MAX_WORKSPACE_DESCRIPTION_LENGTH} characters.`,
    );
  });

  it('re-reads the store after Clear All — the cleared description is gone from the field', async () => {
    const repos = createFakeRepositories({
      organisms: [CONWAYS_CLASSIC],
      workspaceMeta: { description: 'Stored notes.' },
    });
    renderCard(repos);
    await waitFor(() => expect(field()).toHaveValue('Stored notes.'));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /clear data/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      (await screen.findAllByRole('button', { name: 'Clear All Data' })).find((b) =>
        dialog.contains(b),
      ) as HTMLElement,
    );

    await waitFor(() => expect(field()).toHaveValue(''));
  });

  it('has no axe violations inside the card', async () => {
    const { container } = renderCard();
    await waitFor(() => expect(field()).toBeInTheDocument());
    expect((await axe(container)).violations).toEqual([]);
  });
});
