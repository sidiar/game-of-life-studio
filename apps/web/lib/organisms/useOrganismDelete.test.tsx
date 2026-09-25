import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { buildRuleReferenceIndex, buildUsageIndex, type Battle, type Organism } from '@gol/domain';
import {
  CONWAYS_CLASSIC,
  createFakeRepositories,
  createMockWorkspace,
  MOCK_ORGANISM_IDS,
} from '@gol/test-utils';
import { ORGANISM_DELETE_FAILED, ORGANISM_DELETED } from '@/lib/organisms/saveOutcome';
import { useOrganismDelete, type UseOrganismDeleteOptions } from './useOrganismDelete';

/**
 * The controller's own contract, driven through its returned props with the in-memory fakes — no
 * dialog is rendered, so each `onExited` is called by hand where a real dialog's exit transition
 * would call it. `OrganismLibrary.test.tsx` pins the same flows through the real dialogs and the
 * real `next/dynamic` boundaries; this file pins what only the hook can show directly: the write
 * count, the fresh re-verify (FD4) and the queue-then-publish ordering (FD7).
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const GLIDER: Organism = { ...CONWAYS_CLASSIC, id: 'unused-glider', name: 'Glider' };

async function rig(overrides: Partial<UseOrganismDeleteOptions> = {}) {
  const workspace = createMockWorkspace();
  const fakes = createFakeRepositories({
    organisms: [CONWAYS_CLASSIC, ...workspace.organisms, GLIDER],
    battles: workspace.battles,
  });
  const [library, summaries] = await Promise.all([fakes.organisms.list(), fakes.battles.list()]);
  const options: UseOrganismDeleteOptions = {
    organisms: fakes.organisms,
    battles: fakes.battles,
    library,
    summaries,
    usage: buildUsageIndex(summaries),
    ruleIndex: buildRuleReferenceIndex(library),
    reload: vi.fn(),
    canOpen: () => true,
    onEditorDeleted: vi.fn(),
    onWindowReleased: vi.fn(),
    ...overrides,
  };
  const hook = renderHook(() => useOrganismDelete(options));
  return { ...fakes, workspace, options, hook, library };
}

function recordOf(library: readonly Organism[], id: string): Organism {
  const record = library.find((organism) => organism.id === id);
  if (record === undefined) throw new Error(`no fixture organism ${id}`);
  return record;
}

/** A battle, saved AFTER the Library loaded, that places Glider — "saved in another tab". */
function lateBattle(workspace: { battles: Battle[] }): Battle {
  const [template] = workspace.battles;
  return {
    ...template,
    id: 'c5b3e4f6-7d8a-4b9c-8e0f-2a3b4c5d6e7f',
    name: 'Late Battle',
    organismIds: [
      MOCK_ORGANISM_IDS.aggressiveColonizer,
      MOCK_ORGANISM_IDS.patientDefender,
      GLIDER.id,
    ],
  };
}

describe('useOrganismDelete', () => {
  it('allowed → confirm → deletes once, even for a double Confirm, and publishes only on exit', async () => {
    const { organisms, hook, library, options } = await rig();
    const del = vi.spyOn(organisms, 'delete');

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    expect(hook.result.current.confirmProps?.organismName).toBe('Glider');
    expect(hook.result.current.blockedProps).toBeNull();

    act(() => {
      hook.result.current.confirmProps?.onConfirm();
      hook.result.current.confirmProps?.onConfirm();
    });
    await waitFor(() => expect(hook.result.current.confirmProps?.open).toBe(false));
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(GLIDER.id);
    // Queued, not published: the dialog is still fading over an inert background.
    expect(hook.result.current.toast).toBeNull();
    expect(options.reload).not.toHaveBeenCalled();

    act(() => hook.result.current.confirmProps?.onExited?.());
    expect(hook.result.current.toast).toBe(ORGANISM_DELETED);
    expect(hook.result.current.confirmProps).toBeNull();
    expect(hook.result.current.windowActive).toBe(false);
    expect(options.reload).toHaveBeenCalledTimes(1);
    expect(options.onWindowReleased).toHaveBeenCalledTimes(1);
    expect(await organisms.load(GLIDER.id)).toBeNull();
  });

  it('cancel writes nothing, reloads nothing and publishes nothing', async () => {
    const { organisms, hook, library, options } = await rig();
    const del = vi.spyOn(organisms, 'delete');

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    act(() => hook.result.current.confirmProps?.onCancel());
    expect(hook.result.current.confirmProps?.open).toBe(false);
    act(() => hook.result.current.confirmProps?.onExited?.());

    expect(del).not.toHaveBeenCalled();
    expect(options.reload).not.toHaveBeenCalled();
    expect(hook.result.current.toast).toBeNull();
    expect(hook.result.current.windowActive).toBe(false);
  });

  it('a battle placing the organism, saved between the click and Confirm, blocks the write and hands off to the block dialog with the FRESH name (FD4, FD5)', async () => {
    const { organisms, battles, hook, library, workspace, options } = await rig();
    const del = vi.spyOn(organisms, 'delete');

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    await battles.save(lateBattle(workspace));
    // Renamed in the other tab as well: the block explains itself under the FRESH name.
    await organisms.save({ ...GLIDER, name: 'Glider (renamed)' });
    act(() => hook.result.current.confirmProps?.onConfirm());
    await waitFor(() => expect(hook.result.current.confirmProps?.open).toBe(false));
    act(() => hook.result.current.confirmProps?.onExited?.());

    expect(del).not.toHaveBeenCalled();
    expect(hook.result.current.confirmProps).toBeNull();
    expect(hook.result.current.blockedProps).toMatchObject({
      open: true,
      organismName: 'Glider (renamed)',
      battleNames: ['Late Battle'],
      referencingNames: [],
    });
    // The window never went null across the handoff.
    expect(hook.result.current.windowActive).toBe(true);
    expect(options.onWindowReleased).not.toHaveBeenCalled();
    expect(options.reload).toHaveBeenCalledTimes(1);
    expect(hook.result.current.toast).toBeNull();
  });

  it('a record deleted elsewhere is not written again, and no toast is published', async () => {
    const { organisms, hook, library, options } = await rig();

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    await organisms.delete(GLIDER.id);
    const del = vi.spyOn(organisms, 'delete');
    act(() => hook.result.current.confirmProps?.onConfirm());
    await waitFor(() => expect(hook.result.current.confirmProps?.open).toBe(false));
    act(() => hook.result.current.confirmProps?.onExited?.());

    expect(del).not.toHaveBeenCalled();
    expect(hook.result.current.toast).toBeNull();
    expect(hook.result.current.deleteError).toBeNull();
    expect(options.reload).toHaveBeenCalledTimes(1);
  });

  it('a rejected delete queues the failure, publishes it on exit, still reloads, and no toast', async () => {
    const { organisms, hook, library, options } = await rig();
    vi.spyOn(organisms, 'delete').mockRejectedValue(new Error('boom'));

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    act(() => hook.result.current.confirmProps?.onConfirm());
    await waitFor(() => expect(hook.result.current.confirmProps?.open).toBe(false));
    expect(hook.result.current.deleteError).toBeNull();

    act(() => hook.result.current.confirmProps?.onExited?.());
    expect(hook.result.current.deleteError).toBe(ORGANISM_DELETE_FAILED);
    expect(hook.result.current.toast).toBeNull();
    // The fresh read completed before the write was refused, so the cards may be stale.
    expect(options.reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['battles', 'corrupt'],
    ['organisms', 'quota'],
  ] as const)(
    'a rejected re-verify read (%s.list) never deletes — no `.catch(() => [])` (FD4)',
    async (repository, reason) => {
      const { organisms, battles, hook, library, options } = await rig();
      const del = vi.spyOn(organisms, 'delete');
      vi.spyOn(repository === 'battles' ? battles : organisms, 'list').mockRejectedValue(
        new Error(reason),
      );

      act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
      act(() => hook.result.current.confirmProps?.onConfirm());
      await waitFor(() => expect(hook.result.current.confirmProps?.open).toBe(false));
      act(() => hook.result.current.confirmProps?.onExited?.());

      expect(del).not.toHaveBeenCalled();
      expect(hook.result.current.deleteError).toBe(ORGANISM_DELETE_FAILED);
      expect(options.reload).not.toHaveBeenCalled();
    },
  );

  it('a Confirm landing during a Cancel fade neither writes nor leaves an outcome for the next window', async () => {
    const { organisms, hook, library, options } = await rig();
    const del = vi.spyOn(organisms, 'delete');

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    act(() => hook.result.current.confirmProps?.onCancel());
    expect(hook.result.current.confirmProps?.open).toBe(false);
    // Still mounted and enabled through the fade — the buttons are only `pending`-disabled.
    act(() => hook.result.current.confirmProps?.onConfirm());
    await Promise.resolve();
    act(() => hook.result.current.confirmProps?.onExited?.());

    expect(del).not.toHaveBeenCalled();
    expect(hook.result.current.confirmProps).toBeNull();
    expect(options.reload).not.toHaveBeenCalled();

    // The next window opens clean: a plain Cancel publishes nothing.
    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    expect(hook.result.current.confirmProps?.open).toBe(true);
    act(() => hook.result.current.confirmProps?.onCancel());
    act(() => hook.result.current.confirmProps?.onExited?.());
    expect(hook.result.current.toast).toBeNull();
    expect(options.reload).not.toHaveBeenCalled();
  });

  it("Conway's Classic (protected) opens no window at all", async () => {
    const { hook, library } = await rig();

    act(() => hook.result.current.requestDelete(recordOf(library, CONWAYS_CLASSIC.id), 'card'));

    expect(hook.result.current.windowActive).toBe(false);
    expect(hook.result.current.isWindowActive()).toBe(false);
    expect(hook.result.current.confirmProps).toBeNull();
    expect(hook.result.current.blockedProps).toBeNull();
  });

  it('a blocked organism opens the block variant from the settled data, and never writes', async () => {
    const { organisms, hook, library } = await rig();
    const del = vi.spyOn(organisms, 'delete');

    act(() =>
      hook.result.current.requestDelete(
        recordOf(library, MOCK_ORGANISM_IDS.patientDefender),
        'card',
      ),
    );

    expect(hook.result.current.confirmProps).toBeNull();
    expect(hook.result.current.blockedProps?.battleNames).toEqual([
      'Three-Way Skirmish',
      'Grand Colony War',
    ]);
    act(() => hook.result.current.blockedProps?.onClose());
    act(() => hook.result.current.blockedProps?.onExited?.());
    expect(hook.result.current.windowActive).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it('refuses a request canOpen rejects, and a second request while a window is open', async () => {
    const canOpen = vi.fn((origin: 'card' | 'editor') => origin === 'editor');
    const { hook, library } = await rig({ canOpen });

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    expect(hook.result.current.windowActive).toBe(false);

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'editor'));
    act(() =>
      hook.result.current.requestDelete(
        recordOf(library, MOCK_ORGANISM_IDS.patientDefender),
        'editor',
      ),
    );
    expect(hook.result.current.confirmProps?.organismName).toBe('Glider');
    expect(hook.result.current.blockedProps).toBeNull();
  });

  it('editor origin: the editor is closed only from the confirmation exit, and the toast waits for the EDITOR exit (FD7, FD9)', async () => {
    const { hook, library, options } = await rig();

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'editor'));
    act(() => hook.result.current.confirmProps?.onConfirm());
    await waitFor(() => expect(hook.result.current.confirmProps?.open).toBe(false));
    expect(options.onEditorDeleted).not.toHaveBeenCalled();

    act(() => hook.result.current.confirmProps?.onExited?.());
    expect(options.onEditorDeleted).toHaveBeenCalledTimes(1);
    expect(hook.result.current.toast).toBeNull();

    act(() => hook.result.current.onEditorExited());
    expect(hook.result.current.toast).toBe(ORGANISM_DELETED);
  });

  it('editor origin: a refusal is published for the editor, not the Library, and cleared with the editor', async () => {
    const { organisms, hook, library, options } = await rig();
    vi.spyOn(organisms, 'delete').mockRejectedValue(new Error('boom'));

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'editor'));
    act(() => hook.result.current.confirmProps?.onConfirm());
    await waitFor(() => expect(hook.result.current.confirmProps?.open).toBe(false));
    // Queued, not yet published: the confirmation is still fading over the inert editor.
    expect(hook.result.current.editorDeleteError).toBeNull();
    act(() => hook.result.current.confirmProps?.onExited?.());

    expect(hook.result.current.editorDeleteError).toBe(ORGANISM_DELETE_FAILED);
    expect(hook.result.current.deleteError).toBeNull();
    expect(options.onEditorDeleted).not.toHaveBeenCalled();

    act(() => hook.result.current.onEditorExited());
    expect(hook.result.current.editorDeleteError).toBeNull();
    expect(hook.result.current.toast).toBeNull();
  });

  it('clears the previous toast at the start of the next request, so a repeat re-announces', async () => {
    const { hook, library, organisms } = await rig();
    const second: Organism = { ...GLIDER, id: 'second-glider', name: 'Second' };
    await organisms.save(second);

    act(() => hook.result.current.requestDelete(recordOf(library, GLIDER.id), 'card'));
    act(() => hook.result.current.confirmProps?.onConfirm());
    await waitFor(() => expect(hook.result.current.confirmProps?.open).toBe(false));
    act(() => hook.result.current.confirmProps?.onExited?.());
    expect(hook.result.current.toast).toBe(ORGANISM_DELETED);

    act(() => hook.result.current.requestDelete(second, 'card'));
    expect(hook.result.current.toast).toBeNull();
  });
});
