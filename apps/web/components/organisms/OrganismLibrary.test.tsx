import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { NEW_ORGANISM_DOMINANCE, type Organism } from '@gol/domain';
import { CorruptDataError } from '@gol/persistence';
import {
  CONWAYS_CLASSIC,
  createFakeRepositories,
  createMockOrganisms,
  createMockWorkspace,
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
    expect(screen.getByRole('status')).toHaveTextContent('1 of 4 Organisms');

    await user.clear(search);

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(4);
    });
    // Exact, not substring: the pre-clear text '1 of 4 Organisms' also contains '4 Organisms'.
    expect(screen.getByRole('status')).toHaveTextContent(/^4 Organisms$/);
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
  // (SC 2.4.3) and it is the first stop. Story 4.17 retargets the card stops to each card's Edit
  // button (AC7): the article is no longer focusable, so one Tab per card lands on its one control.
  it("tabs from the create button to the search input, then the first card's Edit button, then the second's, in grid order", async () => {
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

  // Story 4.16 Task 11 (2026-09-22): the save-outcome region moved INTO the editor modal, so this
  // component is back to having exactly one `role="status"` element — the pre-4.16 selector.
  it('shows the count badge only once ready, as a role="status"', async () => {
    const { organisms, battles } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { rerender } = render(
      <OrganismLibrary organisms={organisms} battles={battles} seedStatus="seeding" />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<OrganismLibrary organisms={organisms} battles={battles} seedStatus="ready" />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('3 Organisms');
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

    const countBadgeBefore = screen.getByRole('status');
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

    const countBadgeAfter = screen.getByRole('status');
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
    const badgeBefore = screen.getByRole('status');
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
    const badgeAfter = screen.getByRole('status');
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
