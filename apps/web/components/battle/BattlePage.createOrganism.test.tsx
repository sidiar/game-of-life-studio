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
  it('renders the create button in Lab, after the search and add controls (AC1)', async () => {
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
    const url = window.location.href;

    await user.click(createButton());
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    expect(window.location.href).toBe(url);
    expect(router.push).not.toHaveBeenCalled();
    expect(dirtyValue(container)).toBe('false');
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

    const editor = await createAndSave(user, 'Brand New Organism');
    // Still open after Save (Story 4.16 Task 11) — nothing adopted yet.
    expect(screen.queryByRole('button', { name: 'Brand New Organism' })).toBeNull();

    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    const row = await screen.findByRole('button', { name: 'Brand New Organism' });
    expect(row).toHaveAttribute('aria-pressed', 'true');
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

  it('Cancel on a clean draft adds no row and leaves the selection unchanged (AC5)', async () => {
    const user = userEvent.setup();
    await openSkirmish();
    const previouslySelected = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-pressed') === 'true');
    expect(previouslySelected).toBeDefined();

    await user.click(createButton());
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    expect(document.querySelectorAll('[data-edit-organism-id]')).toHaveLength(
      workspace.organisms.length,
    );
    expect(previouslySelected).toHaveAttribute('aria-pressed', 'true');
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

  it('focus returns to the create button on both the saved and the cancelled path (AC6)', async () => {
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
    await waitFor(() => expect(createButton()).toHaveFocus());
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

    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      resolveList([]);
    });

    // The mounted editor is the PENCIL's — on the existing organism, not an empty create draft.
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(within(editor).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
      'Aggressive Colonizer',
    );
  });

  it('renders no create button in Run mode, and a Lab → Run → Lab round trip renders it again (AC8)', async () => {
    const user = userEvent.setup();
    await openSkirmish();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
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
