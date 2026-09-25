import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { type Battle } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import BattlePage from './BattlePage';

// ⚠️ MANDATORY (Story 2.16, trap 21): `useRouter()` throws outside an App Router context under
// RTL, and `<BattlePage>` calls it unconditionally for the Back navigation.
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: router.push }),
}));

/**
 * Story 5.6, in its own file rather than folded into `BattlePage.test.tsx` — the precedent being
 * `BattlePage.modeToggle.test.tsx` (`vi.mock` is FILE-HOISTED, and this file needs one `vi.mock`
 * every OTHER `BattlePage.test.tsx` case must not see: `@/lib/export/battleExporter` — Story 5.6's
 * FD1 lazy module — replaced with a spy pair so these tests assert the WIRING (what gets called,
 * with what id, in what order relative to a save) rather than re-proving the real serializer round
 * trip, which `exportBattleToFile.test.ts` / `battleExporter.test.ts` / `exportWorkspaceToFile.test.ts`
 * already own. `vi.mock` intercepts the bare `import()` inside `handleExportExited` too (module-graph
 * level, the same trap `BattlePage.modeToggle.test.tsx`'s header names for `next/dynamic`).
 */
const battleExporterMock = vi.hoisted(() => ({
  exportBattle: vi.fn(async (_id: string) => {}),
  exportWorkspace: vi.fn(async () => {}),
}));
const createBattleExporterSpy = vi.hoisted(() => vi.fn(() => battleExporterMock));
vi.mock('@/lib/export/battleExporter', () => ({
  createBattleExporter: createBattleExporterSpy,
}));

const { battles, organisms } = createMockWorkspace();
const SKIRMISH = battles.find((b) => b.id === MOCK_BATTLE_IDS.battleA) as Battle;

function seeded(overrides: readonly Battle[] = battles): AppRepositories {
  return createFakeRepositories({ battles: overrides, organisms });
}

function dirtyValue(container: HTMLElement): string | null {
  const root = container.querySelector('[data-dirty]');
  if (root === null) throw new Error('Root (data-dirty) not found');
  return root.getAttribute('data-dirty');
}

const nameField = () => screen.getByRole('textbox', { name: /battle name/i });
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const exportButton = () => screen.getByRole('button', { name: 'Export Battle' });

async function openExportDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(exportButton());
  return await screen.findByRole('dialog', { name: 'Export Battle' });
}

afterEach(() => {
  vi.restoreAllMocks();
  router.push.mockReset();
  battleExporterMock.exportBattle.mockReset().mockResolvedValue(undefined);
  battleExporterMock.exportWorkspace.mockReset().mockResolvedValue(undefined);
  createBattleExporterSpy.mockClear();
});

describe('BattlePage — Export Battle (Story 5.6)', () => {
  it('a clean, already-saved battle exports Battle Only without calling battles.save (AC7)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const dialog = await openExportDialog(user);
    expect(within(dialog).getByRole('button', { name: 'Battle Only' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Battle Only' }));

    await waitFor(() => expect(battleExporterMock.exportBattle).toHaveBeenCalledTimes(1));
    expect(battleExporterMock.exportBattle).toHaveBeenCalledWith(SKIRMISH.id);
    expect(saveSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a dirty battle saves first, then exports with the id the save just wrote (AC7)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const order: string[] = [];
    const saveSpy = vi
      .spyOn(repositories.battles, 'save')
      .mockImplementation(async (record: Battle) => void order.push(`save:${record.id}`));
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    expect(dirtyValue(container)).toBe('true');

    const dialog = await openExportDialog(user);
    expect(dialog).toHaveTextContent('This battle has unsaved changes.');
    const choose = within(dialog).getByRole('button', { name: 'Save & Export Battle' });
    battleExporterMock.exportBattle.mockImplementation(async (id: string) => {
      order.push(`export:${id}`);
    });
    await user.click(choose);

    await waitFor(() => expect(battleExporterMock.exportBattle).toHaveBeenCalledTimes(1));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(order).toEqual([`save:${SKIRMISH.id}`, `export:${SKIRMISH.id}`]);
    await waitFor(() => expect(dirtyValue(container)).toBe('false'));
  });

  it('a never-saved /battle/new battle saves, then exports with the freshly minted id (FD5)', async () => {
    const user = userEvent.setup();
    const repositories = createFakeRepositories({ battles: [], organisms });
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId="new" />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    await user.type(nameField(), 'Fresh Battle');

    const dialog = await openExportDialog(user);
    expect(dialog).toHaveTextContent('This battle has not been saved yet.');
    await user.click(within(dialog).getByRole('button', { name: 'Save & Export Battle' }));

    await waitFor(() => expect(battleExporterMock.exportBattle).toHaveBeenCalledTimes(1));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const mintedId = (saveSpy.mock.calls[0] as unknown[])[0] as Battle;
    expect(battleExporterMock.exportBattle).toHaveBeenCalledWith(mintedId.id);
  });

  it('a rejecting save never calls exportBattle and shows the save alert', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    vi.spyOn(repositories.battles, 'save').mockRejectedValue(new Error('boom'));
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    const dialog = await openExportDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save & Export Battle' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be saved/i);
    expect(battleExporterMock.exportBattle).not.toHaveBeenCalled();
    expect(dirtyValue(container)).toBe('true');
  });

  it('a rejecting exportBattle shows the export alert, attempts the export exactly once, and restores focus (AC8, AC9)', async () => {
    const user = userEvent.setup();
    battleExporterMock.exportBattle.mockRejectedValueOnce(new Error('boom'));
    const repositories = seeded();
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const dialog = await openExportDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Battle Only' }));

    const alert = await screen.findByRole('alert');
    // AC8: plain words, no error.message, no story IDs.
    expect(alert).toHaveTextContent('This battle could not be exported. Try again.');
    expect(alert).not.toHaveTextContent('boom');
    expect(alert).not.toHaveTextContent(/story|AC\d|FR-/i);
    expect(battleExporterMock.exportBattle).toHaveBeenCalledTimes(1);
    // AC9 / FD8: a failed export lands focus on EXPORT BATTLE too.
    await waitFor(() => expect(exportButton()).toHaveFocus());
  });

  // AC9 / FD8 (code review 2026-09-25): the failed-SAVE path is the one where the button is still
  // `disabled={isSaving}` when the operation settles — the restore must wait for that commit.
  it('a failed Save & Export restores focus to EXPORT BATTLE once the save lock releases (AC9)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    vi.spyOn(repositories.battles, 'save').mockRejectedValue(new Error('boom'));
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    const dialog = await openExportDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save & Export Battle' }));

    await screen.findByRole('alert');
    await waitFor(() => expect(exportButton()).toHaveFocus());
  });

  it('a completed Entire Workspace export restores focus to EXPORT BATTLE (AC9)', async () => {
    const user = userEvent.setup();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const dialog = await openExportDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Entire Workspace' }));

    await waitFor(() => expect(battleExporterMock.exportWorkspace).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(exportButton()).toHaveFocus());
  });

  it('Escape closes the dialog, exports nothing, and restores focus to EXPORT BATTLE (AC9)', async () => {
    const user = userEvent.setup();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await openExportDialog(user);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(battleExporterMock.exportBattle).not.toHaveBeenCalled();
    expect(battleExporterMock.exportWorkspace).not.toHaveBeenCalled();
    await waitFor(() => expect(exportButton()).toHaveFocus());
  });

  // FD9 (code review 2026-09-25): a stale save error must not mask a later export failure in the
  // shared `saveError ?? exportError` slot — opening the dialog clears both.
  it('after a failed save, a failed Entire Workspace export announces the EXPORT failure (FD9)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    vi.spyOn(repositories.battles, 'save').mockRejectedValueOnce(new Error('boom'));
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    await user.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);

    battleExporterMock.exportWorkspace.mockRejectedValueOnce(new Error('boom'));
    const dialog = await openExportDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Entire Workspace' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Your workspace could not be exported. Try again.',
      ),
    );
  });

  it('Entire Workspace calls exportWorkspace and never battles.save (FD6)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    const dialog = await openExportDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Entire Workspace' }));

    await waitFor(() => expect(battleExporterMock.exportWorkspace).toHaveBeenCalledTimes(1));
    expect(saveSpy).not.toHaveBeenCalled();
    expect(battleExporterMock.exportBattle).not.toHaveBeenCalled();
  });

  it('Cancel changes nothing: no save, no export, data-dirty unchanged, focus returns to Export Battle', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const saveSpy = vi.spyOn(repositories.battles, 'save');
    const { container } = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await user.type(nameField(), '!');
    expect(dirtyValue(container)).toBe('true');
    const dialog = await openExportDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(saveSpy).not.toHaveBeenCalled();
    expect(battleExporterMock.exportBattle).not.toHaveBeenCalled();
    expect(battleExporterMock.exportWorkspace).not.toHaveBeenCalled();
    expect(dirtyValue(container)).toBe('true');
    // FD8: focus lands back on EXPORT BATTLE once the exit transition has finished.
    await waitFor(() => expect(exportButton()).toHaveFocus());
  });

  it('EXPORT BATTLE is absent from the Run view (FD12)', async () => {
    const user = userEvent.setup();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    expect(exportButton()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /export battle/i })).toBeNull(),
    );
  });

  // FD2 (the live-region rule): the export failure alert must never be inserted while the dialog
  // is still mounted, `inert`-hidden ancestors and all — see `useInertBackground`'s own docblock
  // for why an alert inserted then is silent to a screen reader.
  it('FD2: at the first moment the export alert exists, no dialog is in the document', async () => {
    battleExporterMock.exportBattle.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    // Bounded and always disconnected (code review 2026-09-25): a regression fails here with a
    // message instead of hanging to the test timeout, and the observer never leaks into later tests.
    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const firstAlertHadNoDialog = new Promise<boolean>((resolve, reject) => {
      const check = () => {
        const alert = document.querySelector('[role="alert"]');
        if (alert === null) return false;
        resolve(document.querySelector('[role="dialog"]') === null);
        return true;
      };
      if (check()) return;
      observer = new MutationObserver(() => void check());
      observer.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(() => reject(new Error('no export alert appeared within 3s')), 3000);
    });

    try {
      const dialog = await openExportDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Battle Only' }));

      expect(await firstAlertHadNoDialog).toBe(true);
    } finally {
      observer?.disconnect();
      clearTimeout(timer);
    }
  });

  it('has no axe violations with the export dialog open, plain variant', async () => {
    const user = userEvent.setup();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    await openExportDialog(user);

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('has no axe violations with the export dialog open, needsSave variant', async () => {
    const user = userEvent.setup();
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
    await user.type(nameField(), '!');

    await openExportDialog(user);

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
