import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { NEW_ORGANISM_DOMINANCE } from '@gol/domain';
import { CONWAYS_CLASSIC, createFakeRepositories, createMockOrganisms } from '@gol/test-utils';
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

describe('OrganismLibrary', () => {
  it('shows loading copy while seedStatus is "seeding", even after list() has resolved', async () => {
    const mocks = createMockOrganisms();
    const { organisms } = createFakeRepositories({ organisms: mocks });
    const list = vi.spyOn(organisms, 'list');

    render(<OrganismLibrary organisms={organisms} seedStatus="seeding" />);

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
    const { organisms } = createFakeRepositories();
    const list = vi.spyOn(organisms, 'list');

    const { rerender } = render(<OrganismLibrary organisms={organisms} seedStatus="seeding" />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    // The "seed" lands while the first read is already settled against an empty store.
    for (const organism of mocks) await organisms.save(organism);
    rerender(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

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
    const { organisms } = createFakeRepositories({ organisms: mocks });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

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
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="error" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong loading your organisms.',
    );
  });

  it('shows role="alert" when list() rejects, even with seedStatus "ready"', async () => {
    const organisms = {
      list: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Parameters<typeof OrganismLibrary>[0]['organisms'];

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong loading your organisms.',
      );
    });
  });

  it('renders exactly one h1, "Organism Library"', async () => {
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Organism Library' }),
      ).toBeInTheDocument();
    });
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('has no axe accessibility violations once ready', async () => {
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => screen.getByText(createMockOrganisms()[0].name));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  // AC3: Conway's Classic is pinned first regardless of save order — these mocks are saved
  // BEFORE Conway's Classic, so insertion order alone would put it last.
  it("orders the grid Conway's Classic first, then the rest by name", async () => {
    const mocks = createMockOrganisms();
    const { organisms } = createFakeRepositories({ organisms: [...mocks, CONWAYS_CLASSIC] });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

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
    const { organisms } = createFakeRepositories({ organisms: [...mocks, CONWAYS_CLASSIC] });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    await user.type(search, 'pat');

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Patient Defender' })).toBeInTheDocument();
    // Two `role="status"` regions exist now (Story 4.16's save-outcome line, always mounted) — the
    // count badge is the one whose text mentions "Organisms".
    const countBadge = () =>
      screen.getAllByRole('status').find((el) => /Organisms?$/.test(el.textContent ?? ''));
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
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

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
    const { organisms } = createFakeRepositories({ organisms: [...mocks, CONWAYS_CLASSIC] });
    const list = vi.spyOn(organisms, 'list');
    const save = vi.spyOn(organisms, 'save');
    const del = vi.spyOn(organisms, 'delete');
    const replaceAll = vi.spyOn(organisms, 'replaceAll');

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    await user.type(search, 'pat');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    await user.clear(search);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    expect(list).toHaveBeenCalledTimes(1);
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
    const { organisms } = createFakeRepositories({ organisms: fixture });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
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
  // (SC 2.4.3) and it is the first stop.
  it('tabs from the create button to the search input, then the first card, then the second, in grid order', async () => {
    const user = userEvent.setup();
    const mocks = createMockOrganisms();
    const { organisms } = createFakeRepositories({ organisms: [...mocks, CONWAYS_CLASSIC] });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));

    await user.tab();
    expect(screen.getByRole('button', { name: '+ Create New Organism' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Search organisms' })).toHaveFocus();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('article', { name: "Conway's Classic" }));

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('article', { name: 'Aggressive Colonizer' }),
    );
  });

  it('has no axe violations while filtered', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.type(search, 'pat');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations in the zero-match state', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    const search = await screen.findByRole('textbox', { name: 'Search organisms' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.type(search, 'zzz');
    await waitFor(() => screen.getByText('No organisms match “zzz”.'));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('shows the count badge only once ready, as a role="status"', async () => {
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { rerender } = render(<OrganismLibrary organisms={organisms} seedStatus="seeding" />);
    // The save-outcome region (Story 4.16) is always mounted, empty, and is the only status role
    // before the list is ready — the count badge itself does not exist yet.
    expect(
      screen.getAllByRole('status').some((el) => /Organisms?$/.test(el.textContent ?? '')),
    ).toBe(false);

    rerender(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => {
      expect(screen.getAllByRole('status').some((el) => el.textContent === '3 Organisms')).toBe(
        true,
      );
    });
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
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { rerender } = render(<OrganismLibrary organisms={organisms} seedStatus="seeding" />);
    expect(screen.getByText('Loading organisms…')).toBeInTheDocument();
    expect(createButton()).toBeInTheDocument();

    rerender(<OrganismLibrary organisms={organisms} seedStatus="error" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(createButton()).toBeInTheDocument();

    rerender(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(createButton()).toBeInTheDocument();
  });

  it('opens the editor as a labelled dialog when the create button is clicked', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
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
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createButton()).toHaveFocus();
  });

  it('Close closes the editor and returns focus to the create button', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createButton()).toHaveFocus();
  });

  it('Back closes the editor and returns focus to the create button', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
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
    const { organisms } = createFakeRepositories({ organisms: mocks });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
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
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });
    const list = vi.spyOn(organisms, 'list');
    const save = vi.spyOn(organisms, 'save');
    const del = vi.spyOn(organisms, 'delete');
    const replaceAll = vi.spyOn(organisms, 'replaceAll');

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(list).toHaveBeenCalledTimes(1);
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
 * button, the modal, the hook's `onSaved`, the Library's `resource.reload()` and its outcome line.
 */
describe('OrganismLibrary — save flow (Story 4.16)', () => {
  const createButton = () => screen.getByRole('button', { name: '+ Create New Organism' });

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

  it('(a) open, name, Save: the dialog leaves and [data-save-outcome] reads ORGANISM_SAVED — the status region existed before the save', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    // Queried right after render, before any save — the region must already exist, empty.
    expect(document.querySelector('[data-save-status]')).not.toBeNull();
    expect(document.querySelector('[data-save-outcome]')).toBeNull();

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await fillValidDraft(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Exactly the one sentence — `toHaveTextContent(string)` is a substring match that the
    // zero-rules variant (c) would satisfy too (review 2026-09-22).
    expect(document.querySelector('[data-save-outcome]')).toHaveTextContent(
      new RegExp(`^${ORGANISM_SAVED.replace(/[.]/g, '\\.')}$`),
    );
  });

  it('(b) the grid shows the new card in sortLibrary position and the count badge reads the new total — no "loading" reset, list() called exactly twice', async () => {
    const user = userEvent.setup();
    const mocks = createMockOrganisms();
    const { organisms } = createFakeRepositories({ organisms: mocks });
    const list = vi.spyOn(organisms, 'list');

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(mocks.length));

    const countBadgeBefore = screen
      .getAllByRole('status')
      .find((el) => /Organisms?$/.test(el.textContent ?? ''))!;
    expect(countBadgeBefore).toHaveTextContent(`${mocks.length} Organisms`);

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await fillValidDraft(user, 'Aardvark'); // sorts first, case-folded
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(mocks.length + 1);
    });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe('Aardvark');

    const countBadgeAfter = screen
      .getAllByRole('status')
      .find((el) => /Organisms?$/.test(el.textContent ?? ''))!;
    // The SAME DOM node — a 'loading' reset in between would unmount and remount it.
    expect(countBadgeAfter).toBe(countBadgeBefore);
    expect(countBadgeAfter).toHaveTextContent(`${mocks.length + 1} Organisms`);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('(c) zero rules reads both sentences', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(screen.getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.querySelector('[data-save-outcome]')).toHaveTextContent(
      `${ORGANISM_SAVED} ${NO_RULES_WARNING}`,
    );
  });

  it('(d) reopening the editor empties the region, and a second save re-fills it', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(screen.getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.querySelector('[data-save-outcome]')).not.toBeNull();

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    expect(document.querySelector('[data-save-outcome]')).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'Organism Name' }), 'Glider 2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.querySelector('[data-save-outcome]')).not.toBeNull();
  });

  it('(e) focus is on the create button after a save-close', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(screen.getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createButton()).toHaveFocus();
  });

  it('(f) a rejected save leaves the region empty, the dialog open, and list() called once', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });
    const list = vi.spyOn(organisms, 'list');
    vi.spyOn(organisms, 'save').mockRejectedValueOnce(new Error('boom'));

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(screen.getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('[data-save-outcome]')).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('(g) has no axe violations with the outcome line visible', async () => {
    const user = userEvent.setup();
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    await user.click(createButton());
    await screen.findByRole('dialog', { name: 'Organism Editor' });
    await user.type(screen.getByRole('textbox', { name: 'Organism Name' }), 'Glider');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
