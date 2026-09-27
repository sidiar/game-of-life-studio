import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONWAYS_CLASSIC, type Battle, type Organism } from '@gol/domain';
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
 * Story 4.24 — edit an organism from the battle (FR-3.12, M5, AR-33), in its own file for the
 * `.export` / `.modeToggle` split precedent. The editor and the gate are the REAL lazy modules
 * behind `next/dynamic`; the repositories are `@gol/test-utils` fakes.
 *
 * `createMockWorkspace()`: Three-Way Skirmish (battle A) places all three mock organisms, and
 * Grand Colony War places them too — so Aggressive Colonizer is "Used in 2 Battles" from A (the
 * open battle dedupes against its own saved summary). `LONELY` is in the library and in no battle:
 * added to the session roster and never painted, it is the N = 0 case (Decision H.2).
 */

const workspace = createMockWorkspace();
const SKIRMISH = workspace.battles.find((b) => b.id === MOCK_BATTLE_IDS.battleA) as Battle;
const LONELY: Organism = {
  ...CONWAYS_CLASSIC,
  id: 'lonely-glider',
  name: 'Lonely Glider',
  colorToken: 'gold',
};

function seeded(): AppRepositories {
  return createFakeRepositories({
    battles: workspace.battles,
    organisms: [CONWAYS_CLASSIC, ...workspace.organisms, LONELY],
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

/** The gate's action row — the usage disclosure above it is a `<button>` too. */
function gateActions(gate: HTMLElement): string[] {
  const actions = gate.querySelector<HTMLElement>('.MuiDialogActions-root');
  if (actions === null) throw new Error('no action row');
  return within(actions)
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
}

const pencil = (name: string) => screen.getByRole('button', { name: `Edit ${name}` });

async function openSkirmish(repositories: AppRepositories = seeded()) {
  const view = render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
  await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });
  return view;
}

async function waitForNoDialog() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

afterEach(() => {
  vi.restoreAllMocks();
  router.push.mockReset();
  resetRefToFillGroupWarnings();
});

describe('BattlePage — edit organism from battle (Story 4.24)', () => {
  it('renders a pencil per roster row in Lab (AC1)', async () => {
    await openSkirmish();

    for (const organism of workspace.organisms) {
      expect(pencil(organism.name)).toHaveAttribute('data-edit-organism-id', organism.id);
    }
  });

  it('N ≥ 1 opens the two-button battle gate first, not the editor (AC3, AC5)', async () => {
    const user = userEvent.setup();
    await openSkirmish();

    await user.click(pencil('Aggressive Colonizer'));

    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    expect(gateActions(gate)).toEqual(['Cancel', 'Edit Anyway']);
    expect(within(gate).queryByRole('button', { name: 'Clone & Edit' })).toBeNull();
    expect(gate).toHaveTextContent('clone it in the Organism Library and select the clone here.');
    expect(screen.queryByRole('dialog', { name: 'Organism Editor' })).toBeNull();
  });

  it('the gate lists the open battle by its LIVE name (AC7, RFC-005 Decision 8)', async () => {
    const user = userEvent.setup();
    await openSkirmish();
    const nameField = screen.getByRole('textbox', { name: /battle name/i });
    await user.clear(nameField);
    await user.type(nameField, 'Renamed Skirmish');

    await user.click(pencil('Aggressive Colonizer'));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Used in 2 Battles' }));

    const panel = document.querySelector('[data-usage-battles-panel]') as HTMLElement;
    const names = within(panel)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(names).toContain('Renamed Skirmish');
    expect(names).toContain('Grand Colony War');
    expect(names).not.toContain('Three-Way Skirmish');
  });

  it('N = 0 (a session-added, unpainted organism) opens the editor directly (AC3)', async () => {
    const user = userEvent.setup();
    await openSkirmish();
    await user.selectOptions(screen.getByRole('combobox', { name: /add organism/i }), LONELY.id);

    await user.click(pencil(LONELY.name));

    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(within(editor).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(LONELY.name);
    expect(screen.queryByRole('dialog', { name: /^Used in/ })).toBeNull();
  });

  // Sidiar's review ruling (c), 2026-09-27: when the open battle is the only battle using the
  // organism, the gate would warn about the battle the user is already in — treat it as N = 0.
  it('the open battle as the SOLE user opens the editor directly, footer still counting it (AC5, ruling c)', async () => {
    const user = userEvent.setup();
    await openSkirmish(
      createFakeRepositories({
        battles: [SKIRMISH],
        organisms: [CONWAYS_CLASSIC, ...workspace.organisms, LONELY],
      }),
    );

    await user.click(pencil('Aggressive Colonizer'));

    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(within(editor).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
      'Aggressive Colonizer',
    );
    expect(screen.queryByRole('dialog', { name: /^Used in/ })).toBeNull();
    expect(
      within(within(editor).getByRole('contentinfo')).getByRole('button', {
        name: 'Used in 1 Battle',
      }),
    ).toBeInTheDocument();
  });

  it('after Edit Anyway the editor opens on the organism, reads "Back to Battle", and offers no Delete (AC4, AC9)', async () => {
    const user = userEvent.setup();
    await openSkirmish();

    await user.click(pencil('Aggressive Colonizer'));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));

    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(within(editor).getByRole('button', { name: /Back to Battle/ })).toBeInTheDocument();
    expect(within(editor).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
      'Aggressive Colonizer',
    );
    expect(within(editor).queryByRole('button', { name: /delete organism/i })).toBeNull();
    // The footer counts the open battle too (deduped against its saved summary).
    expect(
      within(within(editor).getByRole('contentinfo')).getByRole('button', {
        name: 'Used in 2 Battles',
      }),
    ).toBeInTheDocument();
  });

  it('keeps the grid, data-dirty and the undo ring across gate → editor → Back (AC4)', async () => {
    const user = userEvent.setup();
    const { container } = await openSkirmish();
    // A dirty, undoable state: one Clear commit.
    await user.click(screen.getByRole('button', { name: /clear petri dish/i }));
    expect(livingCellsFact()).toBe('Living Cells: 0');
    expect(dirtyValue(container)).toBe('true');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    const url = window.location.href;

    await user.click(pencil('Aggressive Colonizer'));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
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

  it('Cancel changes nothing and returns focus to the pencil; the page is live again (AC5)', async () => {
    const user = userEvent.setup();
    const { container } = await openSkirmish();

    await user.click(pencil('Aggressive Colonizer'));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Cancel' }));
    await waitForNoDialog();

    await waitFor(() => expect(pencil('Aggressive Colonizer')).toHaveFocus());
    expect(dirtyValue(container)).toBe('false');
    // The pencil works again: nothing inert, no latch left set.
    await user.click(pencil('Patient Defender'));
    expect(await screen.findByRole('dialog', { name: 'Used in 2 Battles' })).toBeInTheDocument();
  });

  it('Save → Back adopts the saved organism into the roster with no battle save, no dirty change and no library re-list (AC8, FD5)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const listOrganisms = vi.spyOn(repositories.organisms, 'list');
    const saveBattle = vi.spyOn(repositories.battles, 'save');
    const { container } = await openSkirmish(repositories);
    expect(listOrganisms).toHaveBeenCalledTimes(1);

    // Review 2026-09-26 (Task 7: "the roster row shows the new name AND colour"): the chip is the
    // inline `background` on the row's decorative span — `displayColor` resolves tokens to
    // concrete strings, so the adoption's colour half is assertable here, not only in the e2e.
    const chipBackground = (rowName: string) => {
      const chip = screen
        .getByRole('button', { name: rowName })
        .querySelector<HTMLElement>('span[aria-hidden="true"]');
      if (chip === null) throw new Error(`no chip on row ${rowName}`);
      return chip.style.background;
    };
    const chipBefore = chipBackground('Aggressive Colonizer');

    await user.click(pencil('Aggressive Colonizer'));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    const name = within(editor).getByRole('textbox', { name: 'Organism Name' });
    await user.clear(name);
    await user.type(name, 'Renamed Colonizer');
    await user.click(within(editor).getByRole('button', { name: 'Change Color' }));
    await user.click(
      within(within(editor).getByRole('radiogroup', { name: 'Organism Color' })).getByRole(
        'radio',
        { name: 'Amber' },
      ),
    );
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await within(editor).findByText(/saved/i);

    // Still open after Save (Story 4.16 Task 11) — nothing adopted yet.
    expect(screen.queryByRole('button', { name: 'Renamed Colonizer' })).toBeNull();

    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    expect(await screen.findByRole('button', { name: 'Renamed Colonizer' })).toBeInTheDocument();
    expect(pencil('Renamed Colonizer')).toHaveAttribute(
      'data-edit-organism-id',
      'mock-aggressive-colonizer',
    );
    // The chip half of the adoption (AC8): the row repainted with the saved colour.
    expect(chipBackground('Renamed Colonizer')).not.toBe(chipBefore);
    expect(dirtyValue(container)).toBe('false');
    expect(saveBattle).not.toHaveBeenCalled();
    expect(listOrganisms).toHaveBeenCalledTimes(1);
    // The organism was written; the battle record was not touched.
    const stored = await repositories.organisms.load('mock-aggressive-colonizer');
    expect(stored?.name).toBe('Renamed Colonizer');
    expect(stored?.colorToken).toBe('amber');
    // Roster ORDER is unchanged — only the edited row's label moved (no ref shift).
    const rowIds = [...document.querySelectorAll('[data-edit-organism-id]')].map((el) =>
      el.getAttribute('data-edit-organism-id'),
    );
    expect(rowIds).toEqual(SKIRMISH.organismIds);
  });

  it('closing without saving adopts nothing (AC8)', async () => {
    const user = userEvent.setup();
    await openSkirmish();
    await user.selectOptions(screen.getByRole('combobox', { name: /add organism/i }), LONELY.id);

    await user.click(pencil(LONELY.name));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: /Back to Battle/ }));
    await waitForNoDialog();

    expect(screen.getByRole('button', { name: LONELY.name })).toBeInTheDocument();
  });

  it('a rejecting battles.list() opens no dialog and shows the alert; a later attempt clears it (AC3)', async () => {
    const user = userEvent.setup();
    const repositories = seeded();
    const list = vi.spyOn(repositories.battles, 'list').mockRejectedValueOnce(new Error('damaged'));
    await openSkirmish(repositories);

    await user.click(pencil('Aggressive Colonizer'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't check where this organism is used, so it can't be edited right now.",
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    // The next pencil attempt clears it (and, with the list readable again, opens the gate).
    await user.click(pencil('Aggressive Colonizer'));
    await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    expect(screen.queryByText(/Couldn't check where this organism is used/)).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('a double activation fetches the battle list once (AC3 re-entrancy)', async () => {
    const repositories = seeded();
    const list = vi.spyOn(repositories.battles, 'list');
    await openSkirmish(repositories);

    act(() => {
      fireEvent.click(pencil('Aggressive Colonizer'));
      fireEvent.click(pencil('Aggressive Colonizer'));
    });

    await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('no pencil renders in Run mode, and a Lab → Run → Lab round trip renders them again (AC11)', async () => {
    const user = userEvent.setup();
    await openSkirmish();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(document.querySelector('[data-edit-organism-id]')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Lab' }));

    expect(await screen.findByRole('button', { name: 'Edit Aggressive Colonizer' })).toBeVisible();
  });
});
