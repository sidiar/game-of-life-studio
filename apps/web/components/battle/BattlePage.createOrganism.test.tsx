import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONWAYS_CLASSIC, type Battle, type BattleSummary } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import { resetRefToFillGroupWarnings } from '@/lib/canvas/refToFillGroup';
import BattlePage from './BattlePage';

// ⚠️ MANDATORY (Story 2.16, trap 21): `useRouter()` throws outside an App Router context under
// RTL, and `<BattlePage>` calls it unconditionally for the Back navigation.
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: router.push }),
}));

/**
 * Story 4.25 — create an organism from the battle (FR-1.2, M5, Decision H.2), in its own file for
 * the `.editOrganism` / `.export` split precedent. The editor and the gate are the REAL lazy
 * modules behind `next/dynamic`; the repositories are `@gol/test-utils` fakes.
 *
 * `createMockWorkspace()`: Three-Way Skirmish (battle A) places all three mock organisms.
 */

const workspace = createMockWorkspace();
const SKIRMISH = workspace.battles.find((b) => b.id === MOCK_BATTLE_IDS.battleA) as Battle;

function seeded(): AppRepositories {
  return createFakeRepositories({
    battles: workspace.battles,
    organisms: [CONWAYS_CLASSIC, ...workspace.organisms],
  });
}

function dirtyValue(container: HTMLElement): string | null {
  const root = container.querySelector('[data-dirty]');
  if (root === null) throw new Error('Root (data-dirty) not found');
  return root.getAttribute('data-dirty');
}

function livingCellsFact(): string | null {
  return within(screen.getByRole('region', { name: 'Battle statistics' }))
    .getByRole('group', { name: /^Living Cells: \d+$/ })
    .getAttribute('aria-label');
}

/** The row's colour chip: the inline `background` on its decorative span (the 4.24 technique). */
function chipBackground(rowName: string): string {
  const chip = screen
    .getByRole('button', { name: rowName })
    .querySelector<HTMLElement>('span[aria-hidden="true"]');
  if (chip === null) throw new Error(`no chip on row ${rowName}`);
  return chip.style.background;
}

/**
 * Every roster ROW currently pressed (the list items only — the header's Lab/Run toggle carries
 * `aria-pressed` too) — re-queried, never a node captured before a modal.
 */
function pressedRows(): HTMLElement[] {
  return within(screen.getByRole('complementary'))
    .getAllByRole('listitem')
    .flatMap((item) => within(item).getAllByRole('button'))
    .filter((button) => button.getAttribute('aria-pressed') === 'true');
}

const createButton = () => screen.getByRole('button', { name: /create new organism/i });
const pencil = (name: string) => screen.getByRole('button', { name: `Edit ${name}` });

async function openSkirmish(repositories: AppRepositories = seeded()) {
  const view = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
  await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
  return view;
}

async function waitForNoDialog() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

async function createAndSave(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(createButton());
  const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
  const nameField = within(editor).getByRole('textbox', { name: 'Organism Name' });
  await user.type(nameField, name);
  await user.click(within(editor).getByRole('button', { name: 'Save' }));
  await within(editor).findByText(/saved/i);
  return editor;
}

afterEach(() => {
  vi.restoreAllMocks();
  router.push.mockReset();
  resetRefToFillGroupWarnings();
});

describe('BattlePage — create organism from battle (Story 4.25)', () => {
  it('renders the create button in Lab (AC1; its order is pinned in OrganismRoster.test.tsx)', async () => {
    await openSkirmish();

    expect(createButton()).toBeInTheDocument();
  });

  it('a click opens the editor in create mode, "Back to Battle", no gate, no usage fetch (AC2, AC3)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const listBattles = vi.spyOn(repositories.battles, 'list');
    await openSkirmish(repositories);

    await user.click(createButton());

    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(within(editor).getByRole('button', { name: /Back to Battle/ })).toBeInTheDocument();
    expect(within(editor).getByRole('textbox', { name: 'Organism Name' })).toHaveValue('');
    expect(screen.queryByRole('dialog', { name: /^Used in/ })).toBeNull();
    expect(within(editor).getByText('Used in 0 Battles')).toBeInTheDocument();
    expect(within(editor).queryByRole('button', { name: /delete organism/i })).toBeNull();
    expect(listBattles).not.toHaveBeenCalled();
  });

  it('keeps the grid, data-dirty and the undo ring untouched across open and Back (AC2)', async () => {
    const user = userEvent.setup();
    const { container } = await openSkirmish();
    // A dirty, undoable state: one Clear commit (the 4.24 AC4 test's technique).
    await user.click(screen.getByRole('button', { name: /clear petri dish/i }));
    expect(livingCellsFact()).toBe('Living Cells: 0');
    expect(dirtyValue(container)).toBe('true');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    const url = window.location.href;

    await user.click(createButton());
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    expect(window.location.href).toBe(url);
    expect(router.push).not.toHaveBeenCalled();
    expect(livingCellsFact()).toBe('Living Cells: 0');
    expect(dirtyValue(container)).toBe('true');
    // Undo still restores the pre-open grid.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(livingCellsFact()).not.toBe('Living Cells: 0');
  });

  it('Save → Back adopts the created organism into the roster, selected, with no battle save and no re-list (AC4, AC8)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const listOrganisms = vi.spyOn(repositories.organisms, 'list');
    const saveBattle = vi.spyOn(repositories.battles, 'save');
    const { container } = await openSkirmish(repositories);
    expect(listOrganisms).toHaveBeenCalledTimes(1);

    const existingRowOrder = [...document.querySelectorAll('[data-edit-organism-id]')].map((el) =>
      el.getAttribute('data-edit-organism-id'),
    );
    const existingChips = workspace.organisms.map((organism) => chipBackground(organism.name));

    const editor = await createAndSave(user, 'Brand New Organism');
    // Still open after Save (Story 4.16 Task 11) — nothing adopted yet.
    expect(screen.queryByRole('button', { name: 'Brand New Organism' })).toBeNull();
    // AC7: the footer still reads "Used in 0 Battles" AFTER the first save, too.
    expect(within(editor).getByText('Used in 0 Battles')).toBeInTheDocument();

    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    const row = await screen.findByRole('button', { name: 'Brand New Organism' });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(pressedRows()).toEqual([row]);
    // AC4's colour chip: rendered, and the M6 default over the WHOLE library — distinct from every
    // existing row's colour (code review 2026-09-27: "pin the colour chip").
    const newChip = chipBackground('Brand New Organism');
    expect(newChip).not.toBe('');
    for (const chip of existingChips) expect(newChip).not.toBe(chip);
    expect(dirtyValue(container)).toBe('false');
    expect(saveBattle).not.toHaveBeenCalled();
    expect(listOrganisms).toHaveBeenCalledTimes(1);

    // Existing rows keep their order — the new one is APPENDED, no ref shift (Story 2.10 trap 1).
    const rowIds = [...document.querySelectorAll('[data-edit-organism-id]')].map((el) =>
      el.getAttribute('data-edit-organism-id'),
    );
    expect(rowIds.slice(0, existingRowOrder.length)).toEqual(existingRowOrder);
    expect(rowIds).toHaveLength(existingRowOrder.length + 1);

    // The new organism is not offered again by the add dropdown (library subtracts rosterIds).
    expect(screen.queryByRole('option', { name: 'Brand New Organism' })).toBeNull();
  });

  it('Cancel on a clean draft adds no row, leaves the selection unchanged and writes nothing (AC5)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const saveOrganism = vi.spyOn(repositories.organisms, 'save');
    await openSkirmish(repositories);
    const libraryBefore = await repositories.organisms.list();
    const [selectedBefore] = pressedRows();
    expect(selectedBefore).toBeDefined();
    const selectedName = selectedBefore?.getAttribute('aria-label') ?? selectedBefore?.textContent;

    await user.click(createButton());
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    expect(document.querySelectorAll('[data-edit-organism-id]')).toHaveLength(
      workspace.organisms.length,
    );
    // Re-queried after close — a node captured before the modal could be detached.
    const selectedAfter = pressedRows();
    expect(selectedAfter).toHaveLength(1);
    expect(selectedAfter[0]?.getAttribute('aria-label') ?? selectedAfter[0]?.textContent).toBe(
      selectedName,
    );
    // Nothing written to `gol:organisms`.
    expect(saveOrganism).not.toHaveBeenCalled();
    expect(await repositories.organisms.list()).toEqual(libraryBefore);
  });

  it('save then Discard-later-edits still adds the saved record (AC5, FD3)', async () => {
    const user = userEvent.setup();
    await openSkirmish();

    const editor = await createAndSave(user, 'First Save');
    const nameField = within(editor).getByRole('textbox', { name: 'Organism Name' });
    await user.type(nameField, ' Extra');
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));

    const confirm = await screen.findByRole('dialog', { name: /unsaved changes/i });
    await user.click(within(confirm).getByRole('button', { name: 'Discard' }));
    await waitForNoDialog();

    expect(await screen.findByRole('button', { name: 'First Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'First Save Extra' })).toBeNull();
  });

  it('Save → rename → Save → Back hands over the LAST saved record: one row, the second name (FD3)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    await openSkirmish(repositories);

    const editor = await createAndSave(user, 'Draft One');
    const nameField = within(editor).getByRole('textbox', { name: 'Organism Name' });
    await user.clear(nameField);
    await user.type(nameField, 'Draft Two');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    // The second save landed (same id, upserted — Story 4.16 `saveStamp`), not a second record.
    await waitFor(async () => {
      const names = (await repositories.organisms.list()).map((organism) => organism.name);
      expect(names).toContain('Draft Two');
      expect(names).not.toContain('Draft One');
    });
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    expect(await screen.findByRole('button', { name: 'Draft Two' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Draft One' })).toBeNull();
    expect(document.querySelectorAll('[data-edit-organism-id]')).toHaveLength(
      workspace.organisms.length + 1,
    );
  });

  it('a create after a pencil press opens on fresh snapshots — "Used in 0 Battles", not the pencil\'s (FD4, AC7)', async () => {
    const user = userEvent.setup();
    await openSkirmish();

    await user.click(pencil('Aggressive Colonizer'));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
    let editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    await user.click(createButton());
    editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(within(editor).getByText('Used in 0 Battles')).toBeInTheDocument();
    expect(within(editor).queryByText(/Used in [1-9]/)).toBeNull();
  });

  // Review ruling (D1 a, 2026-09-27): AC6's "both paths" land on the create button ONLY when the
  // create session never saved. A saved create retargets to the new row's OWN ✎ instead — the fix
  // for the roster-cap regression the review found (a saved create landing the roster AT 255 would
  // otherwise unmount the create button before this restore ran, dropping focus to `<body>`). The
  // hook-level test in `useOrganismEditorModal.test.tsx` proves the retarget is cap-agnostic (it
  // fires on every battle-origin save, not only at the cap); this pins the two paths' OUTCOME
  // through the real page.
  it('focus returns to the create button when a create never saves, and to the new row’s ✎ when it does (AC6)', async () => {
    const user = userEvent.setup();
    await openSkirmish();

    await user.click(createButton());
    let editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();
    await waitFor(() => expect(createButton()).toHaveFocus());

    await user.click(createButton());
    editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    const nameField = within(editor).getByRole('textbox', { name: 'Organism Name' });
    await user.type(nameField, 'Second Organism');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await within(editor).findByText(/saved/i);
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();
    await waitFor(() => expect(pencil('Second Organism')).toHaveFocus());
    expect(createButton()).not.toHaveFocus();
  });

  it('a create press while a 4.24 pencil fetch is pending is a no-op (AC3)', async () => {
    const repositories = seeded();
    let resolveList: (value: BattleSummary[]) => void = () => {};
    const pending = new Promise<BattleSummary[]>((resolve) => {
      resolveList = resolve;
    });
    vi.spyOn(repositories.battles, 'list').mockReturnValueOnce(pending);
    await openSkirmish(repositories);

    fireEvent.click(pencil('Aggressive Colonizer'));
    fireEvent.click(createButton());

    await act(async () => {
      resolveList([]);
    });

    // The mounted editor is the PENCIL's — on the existing organism, not an empty create draft.
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(within(editor).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
      'Aggressive Colonizer',
    );
  });

  it('a create press while a battle save is in flight is a no-op (AC3, `savingRef`)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(repositories.battles, 'save').mockReturnValue(pending);
    await openSkirmish(repositories);
    await user.click(screen.getByRole('button', { name: /clear petri dish/i }));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
    fireEvent.click(createButton());

    // Let the lazy editor module resolve had the press gone through, then release the save.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      release?.();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Review ruling (D2 a, 2026-09-27): both presses above already no-op under `savingRef` — this
  // pins the VISIBLE half NFR-4.1 requires: neither control may look live while it silently does
  // nothing.
  it('disables the create button and the 4.24 ✎ while a battle save is in flight, re-enabling both once it settles (D2 a)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(repositories.battles, 'save').mockReturnValue(pending);
    await openSkirmish(repositories);
    await user.click(screen.getByRole('button', { name: /clear petri dish/i }));
    expect(createButton()).toBeEnabled();
    expect(pencil('Aggressive Colonizer')).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());

    expect(createButton()).toBeDisabled();
    expect(pencil('Aggressive Colonizer')).toBeDisabled();

    await act(async () => {
      release?.();
    });
    // Not `saveButton()`: a SUCCESSFUL save also clears `isDirty`, so SAVE stays disabled for that
    // separate reason (FR-7.8, `EditorStatusBar`'s "enabled exactly when there is something to
    // save") — the fact under test here is `isSaving` clearing, which the create button and the
    // pencil read directly.
    await waitFor(() => expect(createButton()).toBeEnabled());
    expect(pencil('Aggressive Colonizer')).toBeEnabled();
  });

  it('renders no create button in Run mode, and a Lab → Run → Lab round trip renders it again (AC8)', async () => {
    const user = userEvent.setup();
    await openSkirmish();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
    expect(screen.queryByRole('button', { name: /create new organism/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Lab' }));

    expect(await screen.findByRole('button', { name: /create new organism/i })).toBeVisible();
  });

  it('an empty workspace: create → save → the row appears, selected, and the empty-library copy changes (AC1, AC4)', async () => {
    const user = userEvent.setup();
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles: [], organisms: [] })}
        battleId="new"
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' });

    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).getByText(/your organism library is empty/i)).toBeInTheDocument();

    await user.click(createButton());
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    const nameField = within(editor).getByRole('textbox', { name: 'Organism Name' });
    await user.type(nameField, 'First Organism');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await within(editor).findByText(/saved/i);
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    const row = await screen.findByRole('button', { name: 'First Organism' });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(within(sidebar).getByText(/already in this battle/i)).toBeInTheDocument();
    expect(within(sidebar).queryByText(/your organism library is empty/i)).toBeNull();
  });
});
