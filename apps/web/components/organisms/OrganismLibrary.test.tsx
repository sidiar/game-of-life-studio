import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { NEW_ORGANISM_DOMINANCE, type Organism } from '@gol/domain';
import { CorruptDataError, QuotaExceededError } from '@gol/persistence';
import {
  CONWAYS_CLASSIC,
  createFakeRepositories,
  createMockOrganisms,
  createMockWorkspace,
  MOCK_ORGANISM_IDS,
} from '@gol/test-utils';
import { defaultColorToken } from '@/lib/palette/defaultColorToken';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { DEFAULT_COLOR_TOKEN, PALETTE, resolvePaletteColor } from '@/lib/palette/paletteRegistry';
import { sortLibrary } from '@/lib/organisms/sortLibrary';
import { NO_RULES_WARNING, ORGANISM_SAVED } from '@/lib/organisms/saveOutcome';
import OrganismLibrary from './OrganismLibrary';

// jsdom normalises an inline `hsl(...)` `style.background` to `rgb(...)` on the way in
// (`OrganismRoster.test.tsx`'s identical comment) — round-tripping through a throwaway element
// gives the same normalisation the component's own inline style went through.
function jsdomNormalizedColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.background = color;
  return probe.style.background;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The count badge, by its own `data-organism-count` hook. Story 4.22 added a second `role="status"`
 * to the page (the always-mounted delete status), so an unscoped `getByRole('status')` is a
 * strict-mode failure now — every badge query below was retargeted here, mechanically, with no
 * assertion changed.
 */
function queryCountBadge(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-organism-count]');
}

function countBadge(): HTMLElement {
  const badge = queryCountBadge();
  if (badge === null) throw new Error('the count badge is not rendered');
  return badge;
}

describe('OrganismLibrary', () => {
  it('shows loading copy while seedStatus is "seeding", even after list() has resolved', async () => {
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories({ organisms: mocks });
    const list = vi.spyOn(organisms, 'list');

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="seeding" />);

    // Let the fake's list() promise settle FIRST — asserting synchronously after render would
    // pass on resource.status === 'loading' alone, with the seedStatus clause of the fold deleted.
    await waitFor(() => expect(list).toHaveResolved());
    expect(screen.getByText('Loading organisms…')).toBeInTheDocument();
    expect(screen.queryByText(mocks[0].name)).not.toBeInTheDocument();
  });

  // The `seedStatus` dep on useAsyncResource is deliberate (the first list() reads a pre-seed
  // store); this pins that the flip re-runs list() and the post-seed result is what renders —
  // dropping the dep leaves every other test here green.
  it('re-runs list() when seedStatus flips from "seeding" to "ready", rendering the seeded rows', async () => {
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories();
    const list = vi.spyOn(organisms, 'list');

    const { rerender } = render(
      <OrganismLibrary organisms={organisms} battles={battles} seedStatus="seeding" />,
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    // The "seed" lands while the first read is already settled against an empty store.
    for (const organism of mocks) await organisms.save(organism);
    rerender(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(mocks.length);
    });
    expect(list).toHaveBeenCalledTimes(2);
  });

  // AC7: the interim <ul>/<li> becomes the card grid <ul role="list">/<li> -> <article>. This test
  // additionally pins the AC3 order (case-folded name, no Conway's Classic in this fixture) and
  // that each chip paints the LUT-resolved identity-shade colour, never a literal hex.
  it('renders each organism as a card once ready, in name order, with the right chip colour, and nothing else', async () => {
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories({ organisms: mocks });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    await waitFor(() => {
      for (const organism of mocks) {
        expect(screen.getByText(organism.name)).toBeInTheDocument();
      }
    });
    // A COUNT, for the same reason AppNav.test.tsx counts links: name-presence alone passes with
    // a duplicated or phantom row.
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(mocks.length);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Aggressive Colonizer', 'Chaotic Spreader', 'Patient Defender']);

    // Chips are DOM-order == grid order (headings above already pinned to case-folded name);
    // matched by index against the same ordering rather than by name, since the chip itself
    // carries no accessible text. Ordered by the component's own `sortLibrary`, not a raw `<`
    // sort, so a fixture differing only by case can never desync the index map. Scoped to the
    // grid — the toolbar's search icon is ALSO aria-hidden, and an unscoped query would pick it up
    // as a phantom fourth "chip".
    const sortedMocks = sortLibrary(mocks);
    const grid = screen.getByRole('list', { name: 'Organisms' });
    const chips = grid.querySelectorAll('[aria-hidden="true"]');
    expect(chips).toHaveLength(mocks.length);
    sortedMocks.forEach((organism, i) => {
      const chip = chips[i] as HTMLElement;
      // Guard first: if jsdom failed to parse the LUT's hsl string, BOTH sides would be '' and
      // the equality below would pass on nothing.
      expect(chip.style.background).not.toBe('');
      expect(chip.style.background).toBe(
        jsdomNormalizedColor(displayColor(organism.colorToken, MAX_AGE_SHADE)),
      );
    });
  });

  it('shows role="alert" when seedStatus is "error"', () => {
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="error" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong loading your organisms.',
    );
  });

  it('shows role="alert" when list() rejects, even with seedStatus "ready"', async () => {
    const organisms = {
      list: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Parameters<typeof OrganismLibrary>[0]['organisms'];
    const { battles } = createFakeRepositories();

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong loading your organisms.',
      );
    });
  });

  it('renders exactly one h1, "Organism Library"', async () => {
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(
      <OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Organism Library' }),
      ).toBeInTheDocument();
    });
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('has no axe accessibility violations once ready', async () => {
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(
      <OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />,
    );

    await waitFor(() => screen.getByText(createMockOrganisms()[0].name));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // AC3: Conway's Classic is pinned first regardless of save order — these mocks are saved
  // BEFORE Conway's Classic, so insertion order alone would put it last.
  it("orders the grid Conway's Classic first, then the rest by name", async () => {
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories({
      organisms: [...mocks, CONWAYS_CLASSIC],
    });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual([
        "Conway's Classic",
        'Aggressive Colonizer',
        'Chaotic Spreader',
        'Patient Defender',
      ]);
    });
  });

  it('filters the grid live by name, updating the count badge, and clearing restores it', async () => {
    const user = userEvent.setup();
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories({
      organisms: [...mocks, CONWAYS_CLASSIC],
    });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    await user.type(search, 'pat');

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Patient Defender' })).toBeInTheDocument();
    expect(countBadge()).toHaveTextContent('1 of 4 Organisms');

    await user.clear(search);

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(4);
    });
    // Exact, not substring: the pre-clear text '1 of 4 Organisms' also contains '4 Organisms'.
    expect(countBadge()).toHaveTextContent(/^4 Organisms$/);
  });

  it('shows a message, not an empty control, when the search matches nothing — the input stays and keeps focus', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(search);
    await user.type(search, 'zzz');

    await waitFor(() => {
      expect(screen.getByText('No organisms match “zzz”.')).toBeInTheDocument();
    });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Search organisms' })).toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  // View-only proof (AC4): typing and clearing must never write to the repository.
  it('never calls save/delete/replaceAll while searching — list() is called exactly once', async () => {
    const user = userEvent.setup();
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories({
      organisms: [...mocks, CONWAYS_CLASSIC],
    });
    const list = vi.spyOn(organisms, 'list');
    const battleList = vi.spyOn(battles, 'list');
    const save = vi.spyOn(organisms, 'save');
    const del = vi.spyOn(organisms, 'delete');
    const replaceAll = vi.spyOn(organisms, 'replaceAll');

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    await user.type(search, 'pat');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    await user.clear(search);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    expect(list).toHaveBeenCalledTimes(1);
    expect(battleList).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(replaceAll).not.toHaveBeenCalled();
  });

  // Story 4.8 (M6): the fixture DELIBERATELY contains Conway's Classic (sky-blue), so the derived
  // default is PALETTE[3] (amber) — a value only the derivation produces, never the Story 4.7
  // seed stopgap (`colorToken: DEFAULT_COLOR_TOKEN`, deleted in 4.8 — the constant itself stays,
  // it is the Decision I.4 fallback) (FD8).
  it('seeds the picker at the next unused token of the loaded library (M6) (Story 4.8)', async () => {
    const user = userEvent.setup();
    const fixture = [CONWAYS_CLASSIC, ...createMockOrganisms()];
    const { organisms, battles } = createFakeRepositories({ organisms: fixture });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(fixture.length));

    await user.click(screen.getByRole('button', { name: '+ Create New Organism' }));
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });

    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    const checked = within(dialog).getByRole('radio', { checked: true });
    expect(checked).toHaveAccessibleName(PALETTE[3].name);
    expect(checked).not.toHaveAccessibleName(resolvePaletteColor(DEFAULT_COLOR_TOKEN).name);
  });

  // Story 4.3 retargets this: the create button is the FIRST child of the toolbar's left group
  // (mockup `:405-406` — button before the search container), so DOM order and visual order agree
  // (SC 2.4.3) and it is the first stop. Story 4.17/4.18 retarget the card stops to each card's
  // Edit then Clone buttons (AC7 / Task 2): the article is not focusable, so two Tabs per card land
  // on its two real controls.
  it("tabs from the create button to the search input, then the first card's Edit then Clone, then the second card's Edit, in grid order", async () => {
    const user = userEvent.setup();
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories({
      organisms: [...mocks, CONWAYS_CLASSIC],
    });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    await user.tab();
    expect(screen.getByRole('button', { name: '+ Create New Organism' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Search organisms' })).toHaveFocus();

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: "Edit Conway's Classic" }),
    );
    expect(document.activeElement?.closest('article')).toBe(
      screen.getByRole('article', { name: "Conway's Classic" }),
    );

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: "Clone Conway's Classic" }),
    );

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Edit Aggressive Colonizer' }),
    );
  });

  it('has no axe violations while filtered', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(
      <OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />,
    );
    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.type(search, 'pat');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations in the zero-match state', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(
      <OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />,
    );
    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.type(search, 'zzz');
    await waitFor(() => screen.getByText('No organisms match “zzz”.'));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // Story 4.16 Task 11 (2026-09-22): the save-outcome region moved INTO the editor modal. Story
  // 4.22 then added the delete status region, so the badge is found by its own hook and its role
  // asserted directly.
  it('shows the count badge only once ready, as a role="status"', async () => {
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { rerender } = render(
      <OrganismLibrary organisms={organisms} battles={battles} seedStatus="seeding" />,
    );
    expect(queryCountBadge()).not.toBeInTheDocument();

    rerender(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => {
      expect(countBadge()).toHaveTextContent('3 Organisms');
    });
    expect(countBadge()).toHaveAttribute('role', 'status');
  });
});

/**
 * Story 4.3 — the editor entry point and its lifecycle THROUGH the real Library and the real
 * `next/dynamic` boundary. The shell's own contract is `OrganismEditorModal.test.tsx`'s and the
 * hook's is `useOrganismEditorModal.test.tsx`'s; what only this file can pin is the wiring.
 *
 * ⚠️ `next/dynamic` is NOT mocked — the asynchrony is the thing under test. Every first query for
 * the dialog is `find*`, never `get*`: the chunk resolves on a microtask
 * (`BattleEditorView.test.tsx`'s Story 2.14 suite records the same rule).
 */
describe('OrganismLibrary — editor modal shell (Story 4.3)', () => {
  const createButton = () => screen.getByRole('button', { name: '+ Create New Organism' });

  // The toolbar sits OUTSIDE the aria-busy wrapper on purpose: a control that vanishes while the
  // list loads is `deferred-work.md`'s "controls inside aria-busy" mistake, not repeated here.
  it('renders the create button in the loading, error and ready states', async () => {
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { rerender } = render(
      <OrganismLibrary organisms={organisms} battles={battles} seedStatus="seeding" />,
    );
    expect(screen.getByText('Loading organisms…')).toBeInTheDocument();
    expect(createButton()).toBeInTheDocument();

    rerender(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="error" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(createButton()).toBeInTheDocument();

    rerender(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(createButton()).toBeInTheDocument();
  });

  it('opens the editor as a labelled dialog when the create button is clicked', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(createButton());

    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Library' })).toBeInTheDocument();
    // Story 4.13: Save is now the gate's enabled control, not a disabled placeholder.
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Escape closes the editor and returns focus to the create button', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createButton()).toHaveFocus();
  });

  it('Close closes the editor and returns focus to the create button', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createButton()).toHaveFocus();
  });

  it('Back closes the editor and returns focus to the create button', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });

    await user.click(screen.getByRole('button', { name: 'Back to Library' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createButton()).toHaveFocus();
  });

  // Story 4.5: "a fresh draft per open is the `mounted` gate's doing" is the modal's claim; only
  // this file runs the real gate (`useOrganismEditorModal` + the conditional mount), so only here
  // can it be pinned. Both the value AND the `touched` flag must reset — a surviving `touched`
  // would reopen the editor red on an empty field (FD2).
  it('reopens with an empty, error-free name field — the draft does not survive an exit (Story 4.5)', async () => {
    const user = userEvent.setup();
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories({ organisms: mocks });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(mocks.length));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(screen.getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    expect(screen.getByRole('textbox', { name: 'Organism Name' })).toHaveValue('Glider');
    // Story 4.6: the draft's second field must not survive an exit either.
    fireEvent.change(screen.getByRole('slider', { name: 'Dominance' }), {
      target: { value: '77' },
    });
    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue('77');
    // Story 4.7: nor must the draft's third field — this is the only test that goes through the
    // real `mounted` gate.
    await user.click(screen.getByRole('switch', { name: 'Aging Degradation' }));
    expect(screen.getByRole('switch', { name: 'Aging Degradation' })).toBeChecked();
    // Story 4.8: nor must the draft's fourth field (the pointer pick collapses the palette, FD7,
    // so the chip's name is the readable evidence here).
    await user.click(screen.getByRole('button', { name: 'Change Color' }));
    await user.click(screen.getByRole('radio', { name: PALETTE[10].name }));
    expect(document.querySelector('[data-selected-name]')).toHaveTextContent(PALETTE[10].name);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });

    expect(screen.getByRole('textbox', { name: 'Organism Name' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Organism Name' })).not.toBeInvalid();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue(
      String(NEW_ORGANISM_DOMINANCE),
    );
    expect(screen.getByRole('switch', { name: 'Aging Degradation' })).not.toBeChecked();
    const expectedName = resolvePaletteColor(
      defaultColorToken(mocks.map((organism) => organism.colorToken)),
    ).name;
    await user.click(screen.getByRole('button', { name: 'Change Color' }));
    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(expectedName);
  });

  // View-only proof: an open/close cycle must never write to the repository, and must not re-list.
  it('never calls save/delete/replaceAll across an open/close cycle — list() is called exactly once', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });
    const list = vi.spyOn(organisms, 'list');
    const battleList = vi.spyOn(battles, 'list');
    const save = vi.spyOn(organisms, 'save');
    const del = vi.spyOn(organisms, 'delete');
    const replaceAll = vi.spyOn(organisms, 'replaceAll');

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(list).toHaveBeenCalledTimes(1);
    expect(battleList).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(replaceAll).not.toHaveBeenCalled();
  });
});

/**
 * Story 4.16: the save flow THROUGH the real modal, the real hook and the real Library — what
 * `OrganismEditorModal.test.tsx` cannot pin (the save happens over a MODAL it renders directly,
 * with a fake `organisms`/`onSaved` rig) and `useOrganismEditorModal.test.tsx` cannot pin either
 * (it stands in for the Library with a `<Probe>`). Only here is the whole wire real: the create
 * button, the modal, the hook's `onSaved` and the Library's `resource.reload()`. Amended
 * 2026-09-22 (Task 11): the outcome line itself moved INTO the modal (`OrganismEditorModal`'s own
 * `[data-save-outcome]`) — Save no longer closes the editor, so this block now saves, asserts the
 * IN-DIALOG outcome, then clicks Back to reach the reload/refocus effects the old flow got from
 * Save alone.
 */
describe('OrganismLibrary — save flow (Story 4.16)', () => {
  const createButton = () => screen.getByRole('button', { name: '+ Create New Organism' });

  /** The modal's OWN save-outcome region (Task 11) — scoped by its `data-*` hook, never
   * `getByRole('status')`: `<ColorPickerField>`'s reuse-warning region is a SECOND `role="status"`
   * inside this same dialog. */
  function saveStatusRegion(dialog: HTMLElement): HTMLElement {
    const el = dialog.querySelector<HTMLElement>('[data-save-status]');
    if (el === null) throw new Error('the save-outcome status region is not in the dialog');
    return el;
  }

  /** Fills the name and adds one rule with the default (valid) condition — the minimal valid
   * draft this block saves. */
  async function fillValidDraft(user: ReturnType<typeof userEvent.setup>, name = 'Glider') {
    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    const headerAdd = within(rules)
      .getAllByRole('button', { name: '+ Add Rule' })
      .find((b) => b.getAttribute('data-add-rule') === 'header')!;
    await user.click(headerAdd);
    const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
    await user.click(within(rule1).getByRole('button', { name: '+ Add Condition' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), name);
  }

  it('(a) open, name, Save: the dialog STAYS OPEN and its own [data-save-outcome] reads ORGANISM_SAVED', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    // The region is the MODAL's own now (Task 11) — mounted, empty, before any save.
    expect(saveStatusRegion(dialog)).toBeEmptyDOMElement();

    await fillValidDraft(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // Exactly the one sentence — `toHaveTextContent(string)` is a substring match that the
    // zero-rules variant (c) would satisfy too (review 2026-09-22).
    await waitFor(() => {
      expect(saveStatusRegion(dialog)).toHaveTextContent(
        new RegExp(`^${ORGANISM_SAVED.replace(/[.]/g, '\\.')}$`),
      );
    });
    // AC3, amended 2026-09-22: Save no longer closes the editor. Asserted AFTER MUI's exit
    // duration has elapsed (review 2026-09-22): under the superseded save-closes design the
    // dialog stayed in the DOM for the ~195 ms fade, so an immediate `getByRole('dialog')` was
    // satisfiable by the old behaviour. The hook test pins `open === true`; this pins the wire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Back to Library' })).toBeEnabled();
  });

  it('(b) Back after a save shows the new card in sortLibrary position, the SAME count-badge node reads the new total (no "loading" reset, list() called exactly twice), and focus returns to the create button', async () => {
    const user = userEvent.setup();
    const mocks = createMockOrganisms();
    const { organisms, battles } = createFakeRepositories({ organisms: mocks });
    const list = vi.spyOn(organisms, 'list');

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(mocks.length));

    const countBadgeBefore = countBadge();
    expect(countBadgeBefore).toHaveTextContent(`${mocks.length} Organisms`);

    await user.click(createButton());
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await fillValidDraft(user, 'Aardvark'); // sorts first, case-folded
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveStatusRegion(dialog)).not.toBeEmptyDOMElement());

    await user.click(within(dialog).getByRole('button', { name: 'Back to Library' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(mocks.length + 1);
    });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe('Aardvark');

    const countBadgeAfter = countBadge();
    // The SAME DOM node — a 'loading' reset in between would unmount and remount it.
    expect(countBadgeAfter).toBe(countBadgeBefore);
    expect(countBadgeAfter).toHaveTextContent(`${mocks.length + 1} Organisms`);
    expect(list).toHaveBeenCalledTimes(2);
    expect(createButton()).toHaveFocus();
  });

  it('(c) zero rules reads both sentences, in the still-open dialog', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saveStatusRegion(dialog)).toHaveTextContent(`${ORGANISM_SAVED} ${NO_RULES_WARNING}`);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Story 4.16, Task 11: the outcome line clears at the START of the next attempt (never a stale
  // sentence sitting under a fresh one) and a second Save in the SAME session upserts the same
  // organism — Back adds exactly ONE card, named with the LATEST save.
  it('(d) a second Save in the same session clears then re-fills the outcome line; Back adds exactly ONE card, with the LATEST name', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });
    const save = vi.spyOn(organisms, 'save');

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    // At least one rule, so the outcome is ORGANISM_SAVED alone, not the zero-rules pair.
    await fillValidDraft(user, 'Glider');
    const name = within(dialog).getByRole('textbox', { name: 'Organism Name' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveStatusRegion(dialog)).not.toBeEmptyDOMElement());

    await user.type(name, ' Mk II');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    // The SECOND write is what this test is about — waited for by the spy count (review
    // 2026-09-22), not by a sentence the first save had already left in the region.
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(saveStatusRegion(dialog)).toHaveTextContent(
        new RegExp(`^${ORGANISM_SAVED.replace(/[.]/g, '\\.')}$`),
      );
    });

    await user.click(within(dialog).getByRole('button', { name: 'Back to Library' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain('Glider Mk II');
    expect(headings).not.toContain('Glider');
  });

  it('(e) focus is on the create button after Back following a save', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveStatusRegion(dialog)).not.toBeEmptyDOMElement());

    await user.click(within(dialog).getByRole('button', { name: 'Back to Library' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createButton()).toHaveFocus();
  });

  it('(f) a rejected save leaves the dialog open with the alert visible and no outcome line; list() called once', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });
    const list = vi.spyOn(organisms, 'list');
    vi.spyOn(organisms, 'save').mockRejectedValueOnce(new Error('boom'));

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await within(dialog).findByRole('alert');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(saveStatusRegion(dialog)).toBeEmptyDOMElement();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('(g) has no axe violations with the outcome line visible in the still-open dialog', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveStatusRegion(dialog)).not.toBeEmptyDOMElement());

    // The dialog portals to `document.body`, outside `render()`'s own container — scan the whole
    // body, the idiom `OrganismEditorModal.test.tsx`'s axe tests already use for this reason.
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

/**
 * Story 4.17: the edit flow THROUGH the real Library, the real hook, the real in-use dialog and
 * the real modal — the only place the usage count comes from `buildUsageIndex` over a real
 * `battles.list()`. The mock workspace places Aggressive Colonizer in BOTH battles and Conway's
 * Classic in battle B only; `unused-glider` is placed nowhere.
 */
describe('OrganismLibrary — edit organism from library (Story 4.17)', () => {
  const UNUSED: Organism = { ...CONWAYS_CLASSIC, id: 'unused-glider', name: 'Glider' };
  const USED_NAME = 'Aggressive Colonizer';

  function rig() {
    const workspace = createMockWorkspace();
    const fakes = createFakeRepositories({
      organisms: [CONWAYS_CLASSIC, ...workspace.organisms, UNUSED],
      battles: workspace.battles,
    });
    return { ...fakes, workspace };
  }

  const editButton = (name: string) => screen.getByRole('button', { name: `Edit ${name}` });
  const inUseDialog = () => screen.queryByRole('dialog', { name: /^Used in \d+ Battles?$/ });
  const editorDialog = () => screen.queryByRole('dialog', { name: 'Organism Editor' });

  async function ready() {
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5));
  }

  it("(a) an unused organism's Edit opens the editor directly, populated, with no in-use dialog ever shown", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton('Glider'));

    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(within(dialog).getByRole('textbox', { name: 'Organism Name' })).toHaveValue('Glider');
    expect(inUseDialog()).toBeNull();
  });

  // AC10's edit-session no-write pin (review 2026-09-22): an edit opened and closed without Save
  // writes nothing and re-lists nothing. Positive control: test (e) below, same rig, same spies —
  // a Save in an edit session DOES reach `organisms.save` and DOES re-list once.
  it('(a2) an edit session closed by Back without Save writes nothing and reads each list exactly once', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    const list = vi.spyOn(organisms, 'list');
    const battleList = vi.spyOn(battles, 'list');
    const save = vi.spyOn(organisms, 'save');
    const battleSave = vi.spyOn(battles, 'save');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton('Glider'));
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    const name = within(dialog).getByRole('textbox', { name: 'Organism Name' });
    await user.type(name, ' II'); // a dirty draft, abandoned
    await user.click(within(dialog).getByRole('button', { name: 'Back to Library' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(save).not.toHaveBeenCalled();
    expect(battleSave).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(1);
    expect(battleList).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Glider' })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(editButton('Glider')));
  });

  it("(b) a used organism's Edit opens the 'Used in 2 Battles' dialog — title and sentence — and NOT the editor; nothing is written", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    const save = vi.spyOn(organisms, 'save');
    const battleSave = vi.spyOn(battles, 'save');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(USED_NAME));

    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    expect(gate).toHaveTextContent(
      'This organism is used in 2 Battles. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?',
    );
    expect(editorDialog()).toBeNull();
    // Both repositories: the title says nothing is written, so both writers are watched.
    expect(save).not.toHaveBeenCalled();
    expect(battleSave).not.toHaveBeenCalled();
  });

  it("(c) Cancel dismisses the warning, focus returns to that card's Edit button, and the editor never mounted", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await waitFor(() => expect(within(gate).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await user.click(within(gate).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(inUseDialog()).toBeNull());
    expect(editorDialog()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(editButton(USED_NAME)));
  });

  it('(d) Edit Anyway: the warning leaves FIRST, then the editor opens populated with the record', async () => {
    const user = userEvent.setup();
    const { organisms, battles, workspace } = rig();
    const used = workspace.organisms[0];
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));

    // Sequential, not stacked: the warning is still in the DOM (fading) and no editor exists yet.
    expect(inUseDialog()).not.toBeNull();
    expect(editorDialog()).toBeNull();
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(inUseDialog()).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(used.name);
    expect(within(dialog).getByRole('textbox', { name: 'Dominance value' })).toHaveValue(
      String(used.dominance),
    );
    expect(within(dialog).getAllByRole('group', { name: /^Rule \d+$/ })).toHaveLength(
      used.survivalRules.length,
    );
  });

  it("(e) rename + Save + Back: the card shows the new name in sort position, the SAME badge node reads the SAME total, lists were read exactly twice, save once with the SAME id, focus on the renamed card's Edit", async () => {
    const user = userEvent.setup();
    const { organisms, battles, workspace } = rig();
    const used = workspace.organisms[0];
    const list = vi.spyOn(organisms, 'list');
    const battleList = vi.spyOn(battles, 'list');
    const save = vi.spyOn(organisms, 'save');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();
    const badgeBefore = countBadge();
    expect(badgeBefore).toHaveTextContent(/^5 Organisms$/);

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    const name = within(dialog).getByRole('textbox', { name: 'Organism Name' });
    await user.clear(name);
    await user.type(name, 'Zealous Colonizer'); // sorts last, case-folded
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dialog.querySelector('[data-save-outcome]')).not.toBeNull());

    await user.click(within(dialog).getByRole('button', { name: 'Back to Library' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings[headings.length - 1]).toBe('Zealous Colonizer');
    });
    expect(screen.queryByRole('heading', { level: 2, name: USED_NAME })).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    const badgeAfter = countBadge();
    expect(badgeAfter).toBe(badgeBefore);
    expect(badgeAfter).toHaveTextContent(/^5 Organisms$/);
    expect(battleList).toHaveBeenCalledTimes(2);
    expect((save.mock.calls[0]?.[0] as Organism).id).toBe(used.id);
    await waitFor(() => expect(document.activeElement).toBe(editButton('Zealous Colonizer')));
  });

  it('(f) a rejecting battles.list() puts the Library in the error state — no cards, no Edit buttons', async () => {
    const { organisms, battles } = rig();
    vi.spyOn(battles, 'list').mockRejectedValue(new CorruptDataError('gol:battles', 'x'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong loading your organisms.',
      ),
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^Edit / })).toHaveLength(0);
  });

  it("(g) Conway's Classic (SYSTEM) has an Edit button and, placed in battle B, gates with 'Used in 1 Battle'", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    const edit = editButton("Conway's Classic");
    expect(edit).toBeEnabled();
    await user.click(edit);

    expect(await screen.findByRole('dialog', { name: 'Used in 1 Battle' })).toBeInTheDocument();
    expect(editorDialog()).toBeNull();
  });

  it('(h) has no axe violations with the in-use dialog settled, and with the seeded editor open', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();
    expect((await axe(document.body)).violations).toEqual([]);

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await waitFor(() => expect(within(gate).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    expect((await axe(document.body)).violations).toEqual([]);

    await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await waitFor(() => expect(inUseDialog()).toBeNull());
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

/**
 * Story 4.18: the clone flow THROUGH the real Library, the real card, the real hook and the real
 * in-use dialog — reusing `createMockWorkspace()` and an unused Glider, the 4.17 block's shape.
 */
describe('OrganismLibrary — clone organism (Story 4.18)', () => {
  const UNUSED: Organism = { ...CONWAYS_CLASSIC, id: 'unused-glider', name: 'Glider' };
  const USED_NAME = 'Aggressive Colonizer';

  function rig() {
    const workspace = createMockWorkspace();
    const fakes = createFakeRepositories({
      organisms: [CONWAYS_CLASSIC, ...workspace.organisms, UNUSED],
      battles: workspace.battles,
    });
    return { ...fakes, workspace };
  }

  const editButton = (name: string) => screen.getByRole('button', { name: `Edit ${name}` });
  const cloneButton = (name: string) => screen.getByRole('button', { name: `Clone ${name}` });
  const inUseDialog = () => screen.queryByRole('dialog', { name: /^Used in \d+ Battles?$/ });
  const editorDialog = () => screen.queryByRole('dialog', { name: 'Organism Editor' });
  const cloneAlert = () => document.querySelector('[data-clone-error]');

  async function ready() {
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5));
  }

  it('(a) Clone on an unused organism writes once with a fresh id, "<source> (Copy)" name, the source scalars and rule hashes with fresh ids; the grid gains one card, the SAME badge node reads one more, list() is called twice, battles are untouched beyond the mount read', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    const list = vi.spyOn(organisms, 'list');
    const save = vi.spyOn(organisms, 'save');
    const battleList = vi.spyOn(battles, 'list');
    const battleSave = vi.spyOn(battles, 'save');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();
    const badgeBefore = countBadge();
    expect(badgeBefore).toHaveTextContent(/^5 Organisms$/);

    await user.click(cloneButton('Glider'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const written = save.mock.calls[0]?.[0] as Organism;
    expect(written.id).not.toBe(UNUSED.id);
    expect(written.name).toBe('Glider (Copy)');
    expect(written.colorToken).toBe(UNUSED.colorToken);
    expect(written.dominance).toBe(UNUSED.dominance);
    expect(written.agingEnabled).toBe(UNUSED.agingEnabled);
    written.survivalRules.forEach((rule, i) => {
      expect(rule.contentHash).toBe(UNUSED.survivalRules[i].contentHash);
      expect(rule.id).not.toBe(UNUSED.survivalRules[i].id);
    });

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(6));
    expect(screen.getByRole('heading', { level: 2, name: 'Glider (Copy)' })).toBeInTheDocument();
    const badgeAfter = countBadge();
    expect(badgeAfter).toBe(badgeBefore);
    expect(badgeAfter).toHaveTextContent(/^6 Organisms$/);
    expect(list).toHaveBeenCalledTimes(2);
    expect(battleSave).not.toHaveBeenCalled();
    // The writer's reload() re-runs the SAME shared resource (organisms + battles, Promise.all —
    // Story 4.17 FD2), so a reload reads battles again too; this is the identical count the 4.17
    // save flow's own reload produces, not a clone-specific extra read.
    expect(battleList).toHaveBeenCalledTimes(2);
  });

  it("(b) Clone on Conway's Classic is allowed; the clone carries no SYSTEM tag and sorts by name, not first", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(cloneButton("Conway's Classic"));

    // `expect(x)` with no matcher asserts NOTHING (review 2026-09-22) — the wait only worked
    // incidentally, because `getByRole` throws when it finds nothing.
    const clonedHeading = await screen.findByRole('heading', {
      level: 2,
      name: "Conway's Classic (Copy)",
    });
    const clonedArticle = clonedHeading.closest('article');
    expect(clonedArticle).not.toHaveAttribute('data-system');

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("Conway's Classic"); // the ORIGINAL still pins first (M9)
    expect(headings[0]).not.toBe("Conway's Classic (Copy)");
  });

  it('(c) cloning the same organism three times produces three records, all sharing the SAME colorToken, all named "X (Copy)", with no error (AC7 — uncapped by the palette)', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    const save = vi.spyOn(organisms, 'save');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    for (let i = 0; i < 3; i++) {
      await user.click(cloneButton('Glider'));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(i + 1));
    }

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(8));
    const clones = save.mock.calls.map((call) => call[0] as Organism);
    expect(clones).toHaveLength(3);
    clones.forEach((clone) => {
      expect(clone.name).toBe('Glider (Copy)');
      expect(clone.colorToken).toBe(UNUSED.colorToken);
    });
    expect(cloneAlert()).toBeNull();
  });

  it("(d) a double click before the first write settles calls save ONCE; the clicked card's Clone button is disabled while in flight and enabled after; a second click after the settle calls save again", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    let resolveSave!: () => void;
    const save = vi.spyOn(organisms, 'save').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    const clone = cloneButton('Glider');
    // Review 2026-09-22: BOTH clicks must be dispatched inside ONE `act`, with no commit between
    // them. Two bare `fireEvent.click`s each flush React synchronously, so the second one landed
    // on a button that was ALREADY `disabled` and never reached `onClick` at all — the assertion
    // below was satisfied by the disabled attribute, and deleting `cloningRef`'s guard left the
    // test green. Dispatched this way the second click reaches the handler and only the ref latch
    // can stop the second write.
    act(() => {
      clone.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      clone.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(save).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(cloneButton('Glider')).toBeDisabled());
    // FD5 is an id, not a boolean: only the CLICKED card's Clone disables. Another card's stays
    // live — the distinguishing claim the id-over-boolean choice was made for.
    expect(cloneButton("Conway's Classic")).toBeEnabled();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveSave();
    });
    await waitFor(() => expect(cloneButton('Glider')).toBeEnabled());

    // Positive control: a second click after the settle calls save again.
    await user.click(cloneButton('Glider'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  it('(e) organisms.save rejecting with QuotaExceededError shows the quota sentence, adds no card, leaves the badge unchanged and calls list() once (no reload); a retry after the mock resolves succeeds and clears the alert', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    const list = vi.spyOn(organisms, 'list');
    const save = vi
      .spyOn(organisms, 'save')
      .mockRejectedValueOnce(new QuotaExceededError('gol:organisms'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();
    const badgeBefore = countBadge();

    await user.click(cloneButton('Glider'));

    await waitFor(() => expect(cloneAlert()).not.toBeNull());
    expect(cloneAlert()).toHaveTextContent(/storage is full/i);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(badgeBefore).toHaveTextContent(/^5 Organisms$/);
    expect(list).toHaveBeenCalledTimes(1);

    // The once-queued rejection is exhausted; the retry falls through to the REAL save (vi.spyOn's
    // default behaviour), so it actually persists rather than merely resolving.
    await user.click(cloneButton('Glider'));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(6));
    expect(cloneAlert()).toBeNull();
  });

  it('(e2) organisms.save rejecting with CorruptDataError shows the corrupt-data sentence', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    vi.spyOn(organisms, 'save').mockRejectedValueOnce(new CorruptDataError('gol:organisms', 'x'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(cloneButton('Glider'));

    await waitFor(() => expect(cloneAlert()).not.toBeNull());
    expect(cloneAlert()).toHaveTextContent(/could not be read/i);
  });

  it('(e3) organisms.save rejecting with a plain Error shows the generic sentence', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    vi.spyOn(organisms, 'save').mockRejectedValueOnce(new Error('boom'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(cloneButton('Glider'));

    await waitFor(() => expect(cloneAlert()).not.toBeNull());
    expect(cloneAlert()).toHaveTextContent(/could not be saved/i);
  });

  it("(f) the clone's own Edit opens the editor DIRECTLY (its usage count is 0), populated with the clone's fields", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(cloneButton('Glider'));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(6));

    await user.click(editButton('Glider (Copy)'));

    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(inUseDialog()).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
      'Glider (Copy)',
    );
  });

  it('(g) Clone & Edit from the gate on a used organism writes once, opens the editor on the CLONE (name field reads "<source> (Copy)") once the warning is gone, and leaves the SOURCE byte-identical', async () => {
    const user = userEvent.setup();
    const { organisms, battles, workspace } = rig();
    // By NAME, not `workspace.organisms[0]` (review 2026-09-22): the index happens to be the used
    // organism today, but nothing pins the fixture's order, so a reordering would silently turn
    // this into "an untouched bystander is unchanged" — green even if the clone had overwritten
    // the real source.
    const used = workspace.organisms.find((o) => o.name === USED_NAME);
    expect(used).toBeDefined();
    const save = vi.spyOn(organisms, 'save');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const clone = save.mock.calls[0]?.[0] as Organism;
    expect(clone.name).toBe(`${USED_NAME} (Copy)`);

    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(inUseDialog()).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
      `${USED_NAME} (Copy)`,
    );

    const sourceAfter = (await organisms.list()).find((o) => o.id === used?.id);
    expect(sourceAfter).toEqual(used);
  });

  it('(h) Clone & Edit with a rejecting save shows no editor, the alert visible, and focus on the SOURCE Edit button', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    vi.spyOn(organisms, 'save').mockRejectedValueOnce(new Error('boom'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));

    await waitFor(() => expect(cloneAlert()).not.toBeNull());
    expect(editorDialog()).toBeNull();
    await waitFor(() => expect(inUseDialog()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(editButton(USED_NAME)));
  });

  it('(i) has no axe violations with the clone alert visible, and with the three-action in-use dialog settled', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    vi.spyOn(organisms, 'save').mockRejectedValueOnce(new Error('boom'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(cloneButton('Glider'));
    await waitFor(() => expect(cloneAlert()).not.toBeNull());
    expect((await axe(document.body)).violations).toEqual([]);

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await waitFor(() => expect(within(gate).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    expect((await axe(document.body)).violations).toEqual([]);
  });

  // Review 2026-09-22. Disabling a focused button blurs it and no browser restores focus when the
  // attribute clears; measured in Chromium, Enter on a card's Clone left `document.activeElement`
  // as `BODY`. `deferred-work.md` asserts focus "stays on the Clone button" — this is that
  // sentence, pinned.
  it('(j) focus stays on the Clone button across the write, although the button is disabled mid-flight', async () => {
    const { organisms, battles } = rig();
    let resolveSave!: () => void;
    vi.spyOn(organisms, 'save').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    const clone = cloneButton('Glider');
    clone.focus();
    expect(document.activeElement).toBe(clone);
    fireEvent.click(clone);

    await waitFor(() => expect(cloneButton('Glider')).toBeDisabled());
    await act(async () => {
      resolveSave();
    });

    await waitFor(() => expect(cloneButton('Glider')).toBeEnabled());
    await waitFor(() => expect(document.activeElement).toBe(cloneButton('Glider')));
  });

  // AC6's reverse direction, which only the forward one was pinned for (review 2026-09-22).
  it('(k) editing the SOURCE after cloning leaves the clone byte-identical', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(cloneButton('Glider'));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(6));
    const cloneBefore = (await organisms.list()).find((o) => o.name === 'Glider (Copy)');
    expect(cloneBefore).toBeDefined();

    // Edit the SOURCE through the repository the component holds — the editor modal's own save
    // path is pinned by the 4.16/4.17 blocks; what AC6 claims here is record isolation.
    const source = (await organisms.list()).find((o) => o.id === UNUSED.id);
    await organisms.save({ ...(source as Organism), name: 'Glider Mk II', dominance: 42 });

    const cloneAfter = (await organisms.list()).find((o) => o.id === cloneBefore?.id);
    expect(cloneAfter).toEqual(cloneBefore);
  });

  // AC9's last clause, unpinned in both paths (review 2026-09-22): a Save inside the Clone & Edit
  // session must UPSERT the clone, not mint a seventh record.
  it('(l) a Save in the Clone & Edit editor session upserts the CLONE id and leaves list() length unchanged', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    const save = vi.spyOn(organisms, 'save');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const clone = save.mock.calls[0]?.[0] as Organism;
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });
    const lengthAfterClone = (await organisms.list()).length;

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect((save.mock.calls[1]?.[0] as Organism).id).toBe(clone.id);
    expect(await organisms.list()).toHaveLength(lengthAfterClone);
  });

  // Owner decision 2026-09-23 (review decision 1, option 2). The guard these two pin is a TIMING
  // one, so they assert the ORDER of two DOM facts rather than either fact alone: at the first
  // moment the alert exists, the gate must already be gone. Published from the writer's `catch`
  // instead — the shape before the fix — the alert is inserted during the gate's exit fade, into a
  // subtree `useInertBackground` has marked `inert`, where assistive tech drops it; both tests then
  // fail on the `inUseDialog()` line rather than on the alert's absence.
  it('(m) a Clone & Edit failure alert is inserted only AFTER the gate has exited, never into the inert background', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    vi.spyOn(organisms, 'save').mockRejectedValueOnce(new Error('boom'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));

    await waitFor(() => expect(cloneAlert()).not.toBeNull());
    expect(inUseDialog()).toBeNull();
    expect(editorDialog()).toBeNull();
  });

  it("(n) the card's own Clone failure still reports, the queue notwithstanding", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    vi.spyOn(organisms, 'save').mockRejectedValueOnce(new Error('boom'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(cloneButton('Glider'));

    await waitFor(() => expect(cloneAlert()).not.toBeNull());
    expect(inUseDialog()).toBeNull();
    expect(editorDialog()).toBeNull();
  });
});

/**
 * Story 4.20, AC5/AC6: the summaries this component already holds reach the modal, so the footer's
 * count is the SAME derivation over the SAME array as the in-use warning above — not a second one
 * that agrees by coincidence (FD8). Asserted through the real workspace, where Aggressive Colonizer
 * is placed by both battles and the Glider by neither.
 */
describe('OrganismLibrary — usage footer wiring (Story 4.20)', () => {
  const UNUSED: Organism = { ...CONWAYS_CLASSIC, id: 'unused-glider', name: 'Glider' };
  const USED_NAME = 'Aggressive Colonizer';

  function rig() {
    const workspace = createMockWorkspace();
    const fakes = createFakeRepositories({
      organisms: [CONWAYS_CLASSIC, ...workspace.organisms, UNUSED],
      battles: workspace.battles,
    });
    return { ...fakes, workspace };
  }

  const editButton = (name: string) => screen.getByRole('button', { name: `Edit ${name}` });

  async function ready() {
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5));
  }

  it("names both battles in the editor footer for an organism the warning counted as 'Used in 2 Battles'", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(USED_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });

    // The gate's title and the footer's label are the same count from the same index — the label is
    // also the same exported formatter, so the two cannot be worded differently either.
    const footer = within(dialog).getByRole('contentinfo');
    await user.click(within(footer).getByRole('button', { name: 'Used in 2 Battles' }));

    const panel = document.querySelector('[data-usage-battles-panel]') as HTMLElement;
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Three-Way Skirmish', 'Grand Colony War']);
  });

  it('reports zero, without an expansion, for an organism no battle places', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton('Glider'));
    const dialog = await screen.findByRole('dialog', { name: 'Organism Editor' });

    const footer = within(dialog).getByRole('contentinfo');
    expect(within(footer).getByText('Used in 0 Battles')).toBeInTheDocument();
    expect(within(footer).queryByRole('button')).toBeNull();
  });
});

/**
 * Story 4.21: the hard-block dialog through the real Library, the real verdict and the real
 * dialog. `createMockWorkspace()` places Aggressive Colonizer in BOTH battles, and Chaotic
 * Spreader's rule targets it — so Aggressive Colonizer alone covers the "both blocks" case (AC4).
 * Patient Defender is placed but targeted by nothing (battle-only). Two more organisms are added
 * for the rule-only case, which nothing in the mock workspace covers on its own: `Vector Hunter`'s
 * rule targets `Silent Vector`, and `Silent Vector` is placed nowhere.
 */
const DELETE_UNUSED: Organism = { ...CONWAYS_CLASSIC, id: 'unused-glider', name: 'Glider' };
const DELETE_RULE_ONLY_TARGET: Organism = {
  ...CONWAYS_CLASSIC,
  id: 'silent-vector',
  name: 'Silent Vector',
  survivalRules: [],
};
const DELETE_REFERENCER: Organism = {
  ...CONWAYS_CLASSIC,
  id: 'vector-hunter',
  name: 'Vector Hunter',
  survivalRules: [
    {
      id: 'vector-hunter-rule',
      contentHash: 'vector-hunter-rule-hash',
      conditions: [{ property: 'organismType', operator: 'eq', pattern: 'silent-vector' }],
      payload: { summary: 'targets Silent Vector', action: 'survive' },
    },
  ],
};

/** The Story 4.21 delete workspace, shared with Story 4.22's block below: the mock workspace plus
 * Conway's Classic, an unused Glider, and the rule-only pair. */
function deleteRig() {
  const workspace = createMockWorkspace();
  const fakes = createFakeRepositories({
    organisms: [
      CONWAYS_CLASSIC,
      ...workspace.organisms,
      DELETE_UNUSED,
      DELETE_RULE_ONLY_TARGET,
      DELETE_REFERENCER,
    ],
    battles: workspace.battles,
  });
  return { ...fakes, workspace };
}

describe('OrganismLibrary — delete integrity blocks (Story 4.21)', () => {
  const BOTH_NAME = 'Aggressive Colonizer';
  const BATTLE_ONLY_NAME = 'Patient Defender';

  // The fixtures moved to module scope (`deleteRig`) in Story 4.22, which shares them.
  const rig = deleteRig;

  const editButton = (name: string) => screen.getByRole('button', { name: `Edit ${name}` });
  const deleteButton = (name: string) => screen.queryByRole('button', { name: `Delete ${name}` });
  const blockDialog = (name: string) =>
    screen.queryByRole('dialog', { name: `Cannot delete ${name}` });

  async function ready() {
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(7));
  }

  // Inverted by Story 4.22 (Sidiar's 4.21 review decision FD2 (a)): the transitional "Delete only
  // on blocked cards" rule is gone — every card renders Delete, and the verdict decides what it does.
  it('renders Delete on every card — blocked and unused alike', async () => {
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    expect(deleteButton(BOTH_NAME)).not.toBeNull();
    expect(deleteButton(BATTLE_ONLY_NAME)).not.toBeNull();
    expect(deleteButton('Silent Vector')).not.toBeNull();
    expect(deleteButton('Glider')).toBeEnabled();
    expect(deleteButton('Vector Hunter')).toBeEnabled();
  });

  // Inverted by Story 4.22: Conway's Classic now HAS a Delete — disabled, with its reason, even
  // though a battle places it (`protected` wins in the verdict, M9).
  it("Conway's Classic has a DISABLED Delete even though it is placed in a battle (M9)", async () => {
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    const del = deleteButton("Conway's Classic");
    expect(del).toBeDisabled();
    expect(del).toHaveAccessibleDescription(
      "Conway's Classic is a built-in organism and can't be deleted.",
    );
  });

  it('a click on a battle-only organism opens the dialog naming the seeded battles, with no rule section', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton(BATTLE_ONLY_NAME) as HTMLElement);

    const dialog = await screen.findByRole('dialog', {
      name: `Cannot delete ${BATTLE_ONLY_NAME}`,
    });
    expect(within(dialog).getByText('It is used in 2 Battles:')).toBeInTheDocument();
    expect(within(dialog).getByText('Three-Way Skirmish')).toBeInTheDocument();
    expect(within(dialog).getByText('Grand Colony War')).toBeInTheDocument();
    expect(within(dialog).queryByText(/targeted by rules/i)).not.toBeInTheDocument();
  });

  it('a click on the rule-only organism names the referencing organism, with no battle section', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton('Silent Vector') as HTMLElement);

    const dialog = await screen.findByRole('dialog', { name: 'Cannot delete Silent Vector' });
    expect(within(dialog).getByText('It is targeted by rules of 1 organism:')).toBeInTheDocument();
    expect(within(dialog).getByText('Vector Hunter')).toBeInTheDocument();
    expect(within(dialog).queryByText(/used in/i)).not.toBeInTheDocument();
  });

  it('a click on an organism that is both placed and targeted gets BOTH sections in one dialog', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton(BOTH_NAME) as HTMLElement);

    const dialog = await screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` });
    expect(within(dialog).getByText('It is used in 2 Battles:')).toBeInTheDocument();
    expect(within(dialog).getByText('It is targeted by rules of 1 organism:')).toBeInTheDocument();
    expect(within(dialog).getByText('Chaotic Spreader')).toBeInTheDocument();
  });

  it('OK closes the dialog; Escape closes it too; the injected organisms.delete is NEVER called', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    const del = vi.spyOn(organisms, 'delete');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton(BOTH_NAME) as HTMLElement);
    await screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` });
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(blockDialog(BOTH_NAME)).toBeNull());

    await user.click(deleteButton(BATTLE_ONLY_NAME) as HTMLElement);
    await screen.findByRole('dialog', { name: `Cannot delete ${BATTLE_ONLY_NAME}` });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(blockDialog(BATTLE_ONLY_NAME)).toBeNull());

    expect(del).not.toHaveBeenCalled();
  });

  it("focus returns to the card's Delete button once the dialog has fully closed", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    const trigger = deleteButton(BOTH_NAME) as HTMLElement;
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` });
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(document.activeElement).toBe(deleteButton(BOTH_NAME)));
  });

  it('the battle count in the dialog equals the count the 4.17 in-use warning shows for the same organism', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton(BOTH_NAME));
    const gate = await screen.findByRole('dialog', { name: 'Used in 2 Battles' });
    await user.click(within(gate).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(deleteButton(BOTH_NAME) as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` });
    expect(within(dialog).getByText('It is used in 2 Battles:')).toBeInTheDocument();
  });

  it('a Delete click while the editor is mounted is a no-op (guard against a programmatic caller)', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(editButton('Glider'));
    await screen.findByRole('dialog', { name: 'Organism Editor' });

    // `screen.queryByRole` excludes an inert subtree, so the button is looked up by raw DOM query
    // instead — the same lookup `useInertBackground`'s consumers use, and precisely what makes the
    // background "physically unreachable" claim testable: `fireEvent` bypasses inert's own click
    // suppression entirely, so ONLY the component's own `editorMounted || gateMounted` guard (not
    // jsdom, not accessibility filtering) is what this test pins.
    const trigger = document.querySelector<HTMLElement>(
      `[data-delete-organism-id="${MOCK_ORGANISM_IDS.aggressiveColonizer}"]`,
    );
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger as HTMLElement);

    // Awaited, not a synchronous check (code review 2026-09-24): the dialog is behind
    // `next/dynamic`, so a same-tick `toBeNull()` held with or without the guard. Waiting past the
    // lazy chunk's resolution is what makes the guard's absence observable.
    await expect(
      screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` }, { timeout: 500 }),
    ).rejects.toThrow();
    expect(screen.getByRole('dialog', { name: 'Organism Editor' })).toBeInTheDocument();
  });

  // Code review 2026-09-24: on the FIRST Delete of a session the lazy dialog chunk has not
  // resolved, so no Modal has marked anything aria-hidden and nothing is inert — Create and every
  // card's Edit are still clickable in that window. Both clicks are fired in the same tick to land
  // inside it.
  it('Create and Edit are no-ops while the block dialog is pending (lazy-chunk window)', async () => {
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    // Raw DOM lookups: after the Delete click the Library may already sit under an aria-hidden
    // ancestor, which `getByRole` would filter out — what matters is that a click still lands.
    const create = document.querySelector<HTMLElement>('[data-create-organism]');
    const edit = editButton('Glider');
    fireEvent.click(deleteButton(BOTH_NAME) as HTMLElement);
    fireEvent.click(create as HTMLElement);
    fireEvent.click(edit);

    await screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` });
    await expect(
      screen.findByRole('dialog', { name: 'Organism Editor' }, { timeout: 500 }),
    ).rejects.toThrow();
  });

  it("keeps the dialog's content populated after OK, until the exit transition ends", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton(BOTH_NAME) as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));

    // Mid-fade: the paper is still mounted and must still carry the title and both sections.
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(`Cannot delete ${BOTH_NAME}`);
    expect(dialog).toHaveTextContent('It is used in 2 Battles:');
    expect(dialog).toHaveTextContent('Chaotic Spreader');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  // Code review 2026-09-24: the 2026-09-23 "publish once your window is gone" rule applied to the
  // block dialog — a card Clone that fails while the dialog is up must not insert its alert into
  // the inert background; it is published once the dialog has exited.
  it('a card-Clone failure that settles while the block dialog is up is published only after it exits', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    let rejectSave!: (error: Error) => void;
    vi.spyOn(organisms, 'save').mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectSave = reject;
        }),
    );
    const cloneError = () => document.querySelector('[data-clone-error]');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    fireEvent.click(screen.getByRole('button', { name: 'Clone Glider' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clone Glider' })).toBeDisabled(),
    );
    await user.click(deleteButton(BOTH_NAME) as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` });

    await act(async () => {
      rejectSave(new Error('boom'));
    });
    await waitFor(() =>
      expect(document.querySelector('[data-clone-organism-id="unused-glider"]')).not.toBeDisabled(),
    );
    expect(cloneError()).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(cloneError()).not.toBeNull());
  });

  it('has no axe violations with the block dialog open, in the "both" variant', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = rig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton(BOTH_NAME) as HTMLElement);
    await screen.findByRole('dialog', { name: `Cannot delete ${BOTH_NAME}` });

    expect((await axe(document.body)).violations).toEqual([]);
  });
});

/**
 * Story 4.22: safe delete through the real Library, the real controller and the real (lazy)
 * dialogs. Glider and Vector Hunter are `allowed` (nothing places or targets them); Silent Vector
 * is rule-blocked and opens the editor directly (no battle places it, so no in-use gate).
 */
describe('OrganismLibrary — safe delete & protected default (Story 4.22)', () => {
  const LATE_BATTLE_ID = 'c5b3e4f6-7d8a-4b9c-8e0f-2a3b4c5d6e7f';

  const deleteButton = (name: string) => screen.getByRole('button', { name: `Delete ${name}` });
  const confirmDialog = () => screen.queryByRole('dialog', { name: 'Delete Organism?' });
  const toastNode = () => document.querySelector('[data-delete-toast]');
  const createButton = () => screen.getByRole('button', { name: '+ Create New Organism' });

  async function ready() {
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(7));
  }

  /** Records, for every DOM mutation from now on, whether a dialog was still mounted at the moment
   * the given node first existed — the project-context ordering assertion ("at the first moment
   * the alert exists, the dialog is already gone"). `dialogPresent` defaults to "any dialog"; the
   * editor origin passes a narrower probe, because the editor is a dialog too and STAYS. */
  function watchFirstAppearance(
    selector: string,
    dialogPresent: () => boolean = () => document.querySelector('[role="dialog"]') !== null,
  ) {
    const seen: { dialogPresent: boolean }[] = [];
    const observer = new MutationObserver(() => {
      if (seen.length === 0 && document.querySelector(selector) !== null) {
        seen.push({ dialogPresent: dialogPresent() });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return {
      seen,
      stop: () => observer.disconnect(),
    };
  }

  function lateBattleFor(organismId: string, workspace: ReturnType<typeof createMockWorkspace>) {
    const [template] = workspace.battles;
    return {
      ...template,
      id: LATE_BATTLE_ID,
      name: 'Late Battle',
      organismIds: [MOCK_ORGANISM_IDS.aggressiveColonizer, organismId],
    };
  }

  it("an unused card's Delete opens the confirmation; Cancel writes nothing and returns focus to Delete", async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    const del = vi.spyOn(organisms, 'delete');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();
    const badgeBefore = countBadge().textContent;

    await user.click(deleteButton('Glider'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    expect(dialog).toHaveAccessibleDescription('Are you sure you want to delete “Glider”?');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(confirmDialog()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(deleteButton('Glider')));
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 2, name: 'Glider' })).toBeInTheDocument();
    expect(countBadge().textContent).toBe(badgeBefore);
    expect(toastNode()).toBeNull();
  });

  it('Escape on the confirmation cancels, and nothing is written', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    const del = vi.spyOn(organisms, 'delete');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton('Glider'));
    await screen.findByRole('dialog', { name: 'Delete Organism?' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(del).not.toHaveBeenCalled();
    expect(toastNode()).toBeNull();
  });

  it('Confirm deletes: the card is gone, the badge drops by one, the toast lands only after the dialog is gone, and focus is on Create', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    const del = vi.spyOn(organisms, 'delete');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();
    expect(countBadge()).toHaveTextContent('7 Organisms');

    await user.click(deleteButton('Glider'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    const watch = watchFirstAppearance('[data-delete-toast]');
    await user.click(within(dialog).getByRole('button', { name: 'Delete Organism' }));

    await waitFor(() => expect(toastNode()).not.toBeNull());
    watch.stop();
    expect(watch.seen).toEqual([{ dialogPresent: false }]);
    expect(document.querySelector('[data-delete-status]')).toHaveTextContent('Organism deleted');
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(DELETE_UNUSED.id);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(6));
    expect(screen.queryByRole('heading', { level: 2, name: 'Glider' })).toBeNull();
    expect(countBadge()).toHaveTextContent('6 Organisms');
    expect(createButton()).toHaveFocus();
  });

  it('a battle placing the organism, saved between the click and Confirm, blocks the delete and opens the block dialog with the fresh name (FD4)', async () => {
    const user = userEvent.setup();
    const { organisms, battles, workspace } = deleteRig();
    const del = vi.spyOn(organisms, 'delete');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton('Glider'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    // "Saved in another tab": the Library's settled snapshot never sees it.
    await battles.save(lateBattleFor(DELETE_UNUSED.id, workspace));
    await user.click(within(dialog).getByRole('button', { name: 'Delete Organism' }));

    const block = await screen.findByRole('dialog', { name: 'Cannot delete Glider' });
    expect(within(block).getByText('It is used in 1 Battle:')).toBeInTheDocument();
    expect(within(block).getByText('Late Battle')).toBeInTheDocument();
    expect(confirmDialog()).toBeNull();
    expect(del).not.toHaveBeenCalled();
    expect(await organisms.load(DELETE_UNUSED.id)).not.toBeNull();

    await user.click(within(block).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(document.activeElement).toBe(deleteButton('Glider')));
    expect(toastNode()).toBeNull();
  });

  it('a rejected delete reports the failure after the dialog exits, and the card stays', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    vi.spyOn(organisms, 'delete').mockRejectedValue(new Error('boom'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton('Glider'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    const watch = watchFirstAppearance('[data-delete-error]');
    await user.click(within(dialog).getByRole('button', { name: 'Delete Organism' }));

    await waitFor(() => expect(document.querySelector('[data-delete-error]')).not.toBeNull());
    watch.stop();
    expect(watch.seen).toEqual([{ dialogPresent: false }]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This organism could not be deleted. Nothing was changed — try again.',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Glider' })).toBeInTheDocument();
    expect(toastNode()).toBeNull();
  });

  it("Conway's Classic's disabled Delete opens nothing", async () => {
    const { organisms, battles } = deleteRig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    fireEvent.click(deleteButton("Conway's Classic"));

    await expect(screen.findByRole('dialog', {}, { timeout: 500 })).rejects.toThrow();
  });

  it('editor origin: Edit → Delete Organism → Confirm closes the editor, removes the card, and the toast lands after the EDITOR exits', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    const del = vi.spyOn(organisms, 'delete');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Edit Glider' }));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: 'Delete Organism' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    const watch = watchFirstAppearance('[data-delete-toast]');
    await user.click(within(confirm).getByRole('button', { name: 'Delete Organism' }));

    await waitFor(() => expect(toastNode()).not.toBeNull());
    watch.stop();
    // Neither the confirmation nor the editor was still mounted when the toast first existed.
    expect(watch.seen).toEqual([{ dialogPresent: false }]);
    expect(del).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { level: 2, name: 'Glider' })).toBeNull();
    expect(countBadge()).toHaveTextContent('6 Organisms');
    await waitFor(() => expect(createButton()).toHaveFocus());
    // FD9: both inert windows unwound — the page root is live again.
    const root = document.querySelector('[data-create-organism]')?.closest('body > *');
    expect(root).not.toBeNull();
    expect((root as HTMLElement).inert).not.toBe(true);
    expect(root).not.toHaveAttribute('aria-hidden');
  });

  it('editor origin, blocked: the block dialog stacks over the editor; OK leaves the editor open with focus on its Delete', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Edit Silent Vector' }));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    const nameField = within(editor).getByRole('textbox', { name: 'Organism Name' });
    await user.clear(nameField);
    await user.type(nameField, 'Draft Name');
    await user.click(within(editor).getByRole('button', { name: 'Delete Organism' }));
    const block = await screen.findByRole('dialog', { name: 'Cannot delete Silent Vector' });
    expect(within(block).getByText('Vector Hunter')).toBeInTheDocument();
    await user.click(within(block).getByRole('button', { name: 'OK' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Cannot delete Silent Vector' })).toBeNull(),
    );
    expect(screen.getByRole('dialog', { name: 'Organism Editor' })).toBe(editor);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(editor).getByRole('button', { name: 'Delete Organism' }),
      ),
    );
    // The draft is untouched.
    expect(within(editor).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
      'Draft Name',
    );
  });

  it('editor origin: Escape on the stacked confirmation closes only it — the editor stays open, focus back on its Delete', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    const del = vi.spyOn(organisms, 'delete');
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Edit Glider' }));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: 'Delete Organism' }));
    await screen.findByRole('dialog', { name: 'Delete Organism?' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Organism Editor' })).toBe(editor);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(editor).getByRole('button', { name: 'Delete Organism' }),
      ),
    );
    expect(del).not.toHaveBeenCalled();
    // Review 2026-09-25: the editor is handed back LIVE. jsdom's `inert` blocks nothing (the focus
    // assertion above passes either way), so this pins the write itself: the stacked window's
    // cleanup must not restore the `inert` the editor's own `useInertBackground` observer put on
    // the editor's portal when the confirmation marked it aria-hidden. The page root under the
    // editor stays inert.
    const editorPortal = editor.closest('body > *') as HTMLElement;
    expect(editorPortal.inert).not.toBe(true);
    const root = document.querySelector('[data-create-organism]')?.closest('body > *');
    expect((root as HTMLElement).inert).toBe(true);
  });

  it('editor origin: a rejected delete is reported inside the still-open editor', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    vi.spyOn(organisms, 'delete').mockRejectedValue(new Error('boom'));
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Edit Glider' }));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: 'Delete Organism' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete Organism' }));

    await waitFor(() => expect(confirmDialog()).toBeNull());
    await waitFor(() =>
      expect(within(editor).getByRole('alert')).toHaveTextContent(
        'This organism could not be deleted. Nothing was changed — try again.',
      ),
    );
    expect(document.querySelector('[data-delete-error]')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Organism Editor' })).toBe(editor);
  });

  it('editor origin: a record deleted in another tab keeps the editor open with an in-editor alert, writes nothing and publishes no toast (review decision (b))', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Edit Glider' }));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: 'Delete Organism' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    // "Deleted in another tab": gone from storage, still on the Library's settled snapshot.
    await organisms.delete(DELETE_UNUSED.id);
    const del = vi.spyOn(organisms, 'delete');
    // The ordering assertion, scoped to the stacked confirmation (the editor is a dialog too, and
    // stays): at the first moment the alert exists, the confirmation is already gone.
    const watch = watchFirstAppearance(
      '[data-editor-delete-error]',
      () => confirmDialog() !== null,
    );
    await user.click(within(confirm).getByRole('button', { name: 'Delete Organism' }));

    await waitFor(() =>
      expect(within(editor).getByRole('alert')).toHaveTextContent(
        'This organism no longer exists. It may have been deleted in another tab.',
      ),
    );
    watch.stop();
    expect(watch.seen).toEqual([{ dialogPresent: false }]);
    expect(confirmDialog()).toBeNull();
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Organism Editor' })).toBe(editor);
    expect(document.querySelector('[data-delete-error]')).toBeNull();
    expect(toastNode()).toBeNull();
    // The Library reloaded behind the editor: the card is gone, the badge dropped.
    await waitFor(() => expect(countBadge()).toHaveTextContent('6 Organisms'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(editor).getByRole('button', { name: 'Delete Organism' }),
      ),
    );
  });

  it('a second delete later in the session re-announces — the toast node re-mounts', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton('Glider'));
    let dialog = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete Organism' }));
    await waitFor(() => expect(toastNode()).not.toBeNull());
    const first = toastNode();

    await user.click(deleteButton('Vector Hunter'));
    // Cleared at the START of the request.
    expect(toastNode()).toBeNull();
    dialog = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete Organism' }));
    await waitFor(() => expect(toastNode()).not.toBeNull());

    expect(toastNode()).not.toBe(first);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5));
  });

  it('has no axe violations with the confirmation open', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton('Glider'));
    await screen.findByRole('dialog', { name: 'Delete Organism?' });

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('has no axe violations with the toast shown and the protected card present', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(deleteButton('Glider'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Organism?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete Organism' }));
    await waitFor(() => expect(toastNode()).not.toBeNull());
    expect(deleteButton("Conway's Classic")).toBeDisabled();

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('has no axe violations with the confirmation stacked over the editor', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Edit Glider' }));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: 'Delete Organism' }));
    await screen.findByRole('dialog', { name: 'Delete Organism?' });

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('has no axe violations with the block dialog stacked over the editor', async () => {
    const user = userEvent.setup();
    const { organisms, battles } = deleteRig();
    render(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Edit Silent Vector' }));
    const editor = await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.click(within(editor).getByRole('button', { name: 'Delete Organism' }));
    await screen.findByRole('dialog', { name: 'Cannot delete Silent Vector' });

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
