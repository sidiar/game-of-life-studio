import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { DisplayOrganism } from '@/lib/displayOrganisms';
import { ERASER_TOOL, type Tool } from '@/lib/tool';
import OrganismRoster from './OrganismRoster';

function organism(overrides: Partial<DisplayOrganism> & { id: string }): DisplayOrganism {
  return {
    name: 'Organism',
    color: '#56B4E9',
    colorToken: 'sky-blue',
    ...overrides,
  };
}

// Deliberately NOT in alphabetical order: roster order is the dense encoding's own (RFC-006
// Decision 2), so a component that sorted for display would look tidier and be tested green by an
// alphabetical fixture.
const ROSTER: readonly DisplayOrganism[] = [
  organism({ id: 'org-c', name: 'Chaotic Spreader', color: '#009E73', colorToken: 'bluish-green' }),
  organism({
    id: 'org-a',
    name: 'Aggressive Colonizer',
    color: '#D55E00',
    colorToken: 'vermillion',
  }),
  organism({ id: 'org-p', name: 'Patient Defender', color: '#3B82F6', colorToken: 'azure' }),
];

const ORGANISM_TOOL: Tool = { kind: 'organism', organismId: 'org-c' };

// Story 2.10's addable library. Deliberately EMPTY as the default: most of the suite below
// predates the add control, and an empty library renders none of it (AC8's "nothing left to add"
// state) — so the pre-existing assertions in this file stay true unless a test overrides it.
const LIBRARY: readonly DisplayOrganism[] = [
  organism({ id: 'lib-gold', name: 'Gold Glider', color: '#E69F00', colorToken: 'gold' }),
  organism({
    id: 'lib-magenta',
    name: 'Magenta Mutant',
    color: '#CC79A7',
    colorToken: 'reddish-purple',
  }),
];

function renderRoster(overrides: Partial<ComponentProps<typeof OrganismRoster>> = {}) {
  return render(
    <OrganismRoster
      roster={ROSTER}
      selectedTool={ORGANISM_TOOL}
      onSelectTool={() => {}}
      library={[]}
      onAddToRoster={() => {}}
      {...overrides}
    />,
  );
}

describe('OrganismRoster — the list (AC1)', () => {
  it('renders one row per roster member, in ROSTER order', () => {
    renderRoster();

    // getAllByRole preserves DOM order, which is the whole claim here. `textContent`, so the
    // eraser's decorative ✕ shows up — its ACCESSIBLE name is just "Eraser" (the glyph is
    // aria-hidden), which the eraser suite below pins separately.
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names).toEqual([
      'Chaotic Spreader',
      'Aggressive Colonizer',
      'Patient Defender',
      '✕Eraser',
    ]);
  });

  it('gives each row a colour chip painted in that organism’s resolved colour', () => {
    const { container } = renderRoster();

    const chips = [...container.querySelectorAll('[aria-hidden="true"]')];
    const backgrounds = chips
      .map((chip) => (chip as HTMLElement).style.background)
      .filter((background) => background !== '');
    // rgb(), because jsdom normalises an inline hex. The eraser's ✕ carries no background.
    expect(backgrounds).toEqual(['rgb(0, 158, 115)', 'rgb(213, 94, 0)', 'rgb(59, 130, 246)']);
  });

  // Trap 9: the row already carries the organism's name as visible text, so a chip with its own
  // accessible name makes every row announce its organism twice.
  it('hides the colour chip from assistive tech', () => {
    const { container } = renderRoster();

    const chip = container.querySelector('ul button span');
    expect(chip).toHaveAttribute('aria-hidden', 'true');
  });

  it('names each row by its VISIBLE text rather than a duplicating aria-label', () => {
    const { container } = renderRoster();

    // deferred-work.md's aria-label entry: an attribute name silently desyncs from the text when
    // one is changed without the other, and users and tests then query different strings.
    for (const button of container.querySelectorAll('button')) {
      expect(button).not.toHaveAttribute('aria-label');
    }
    expect(screen.getByRole('button', { name: 'Aggressive Colonizer' })).toBeInTheDocument();
  });

  it('exposes the roster as a list, so its COUNT is announced', () => {
    renderRoster();

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(ROSTER.length);
  });
});

describe('OrganismRoster — the eraser row (AC1, FR-3.6)', () => {
  it('renders the eraser LAST', () => {
    renderRoster();

    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toHaveAccessibleName('Eraser');
  });

  // AC1: "pinned at the bottom, visually separated from the list, not an entry inside it". The
  // eraser is a tool, not one of the battle's organisms — counting it as a list item would report
  // a roster of 4 for a battle of 3.
  it('keeps the eraser OUTSIDE the roster list', () => {
    renderRoster();

    const eraser = screen.getByRole('button', { name: 'Eraser' });
    expect(eraser.closest('ul')).toBeNull();
    expect(within(screen.getByRole('list')).queryByText('Eraser')).toBeNull();
  });

  it('still renders the eraser when the roster is empty', () => {
    renderRoster({ roster: [], selectedTool: ERASER_TOOL });

    expect(screen.getByRole('button', { name: 'Eraser' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('OrganismRoster — selection (AC2)', () => {
  it('calls onSelectTool with the clicked organism’s tool', async () => {
    const user = userEvent.setup();
    const onSelectTool = vi.fn();
    renderRoster({ onSelectTool });

    await user.click(screen.getByRole('button', { name: 'Patient Defender' }));

    expect(onSelectTool).toHaveBeenCalledTimes(1);
    expect(onSelectTool).toHaveBeenCalledWith({ kind: 'organism', organismId: 'org-p' });
  });

  it('calls onSelectTool with the eraser tool when the eraser row is clicked', async () => {
    const user = userEvent.setup();
    const onSelectTool = vi.fn();
    renderRoster({ onSelectTool });

    await user.click(screen.getByRole('button', { name: 'Eraser' }));

    expect(onSelectTool).toHaveBeenCalledTimes(1);
    expect(onSelectTool).toHaveBeenCalledWith(ERASER_TOOL);
  });

  // Selection is CONTROLLED (spec §3.3, §6): the component holds no state of its own, so a click
  // must change nothing on screen until the owner sends a new `selectedTool` back down. A local
  // mirror would pass a "clicking selects" test and then silently disagree with the ref the canvas
  // is actually painting.
  it('holds no selection state of its own — a click alone moves nothing', async () => {
    const user = userEvent.setup();
    renderRoster({ onSelectTool: vi.fn() });

    await user.click(screen.getByRole('button', { name: 'Patient Defender' }));

    expect(screen.getByRole('button', { name: 'Patient Defender' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Chaotic Spreader' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('marks EXACTLY ONE row selected for an organism tool', () => {
    renderRoster({ selectedTool: { kind: 'organism', organismId: 'org-a' } });

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName('Aggressive Colonizer');
  });

  // The eraser is part of the SAME exclusive selection (AC2: "the eraser included"), even though
  // it sits in a different container by AC1's own requirement.
  it('marks the eraser — and nothing else — selected for the eraser tool', () => {
    renderRoster({ selectedTool: ERASER_TOOL });

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName('Eraser');
  });

  // An organism tool whose organism is not in this roster. <BattleEditorView> resolves that away
  // before it ever gets here, but the component must not invent a selection if it does.
  it('marks no row selected for an organism the roster does not contain', () => {
    renderRoster({ selectedTool: { kind: 'organism', organismId: 'not-in-roster' } });

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(0);
  });
});

describe('OrganismRoster — the same-colour warning (AC4, FR-3.3, M6)', () => {
  const SHARED: readonly DisplayOrganism[] = [
    organism({ id: 'org-1', name: 'First Twin', color: '#D55E00', colorToken: 'vermillion' }),
    organism({ id: 'org-2', name: 'Lone Wolf', color: '#3B82F6', colorToken: 'azure' }),
    organism({ id: 'org-3', name: 'Second Twin', color: '#D55E00', colorToken: 'vermillion' }),
  ];

  // M6: "two NON-BLOCKING warnings" — BOTH rows of the pair, not just the second to appear.
  it('marks BOTH rows of a colliding pair, and no others', () => {
    renderRoster({ roster: SHARED, duplicateColorIds: ['org-1', 'org-3'] });

    expect(screen.getByRole('button', { name: /First Twin/ })).toHaveTextContent('Shared colour');
    expect(screen.getByRole('button', { name: /Second Twin/ })).toHaveTextContent('Shared colour');
    expect(screen.getByRole('button', { name: 'Lone Wolf' })).not.toHaveTextContent(
      'Shared colour',
    );
    expect(screen.getAllByText('Shared colour')).toHaveLength(2);
  });

  // Trap 5, in both directions: informational only. Not a disabled row, not a modal, not a block
  // on selection.
  it('leaves both marked rows enabled and selectable', async () => {
    const user = userEvent.setup();
    const onSelectTool = vi.fn();
    renderRoster({ roster: SHARED, duplicateColorIds: ['org-1', 'org-3'], onSelectTool });

    for (const name of [/First Twin/, /Second Twin/]) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Second Twin/ }));
    expect(onSelectTool).toHaveBeenCalledWith({ kind: 'organism', organismId: 'org-3' });
  });

  it('marks nothing when no duplicates are reported', () => {
    renderRoster();

    expect(screen.queryByText('Shared colour')).toBeNull();
  });
});

describe('OrganismRoster — the degraded roster (AC7)', () => {
  it('states that the library could not be read, instead of rendering an empty list', () => {
    renderRoster({ roster: [], selectedTool: ERASER_TOOL, libraryUnavailable: true });

    expect(screen.getByText(/organism library could not be read/i)).toBeInTheDocument();
    expect(screen.getByText(/placing organisms is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  // The ids survive a failed library, but nothing can name or colour them — a wall of "Unknown
  // organism" rows in the battle's own colours would be a worse lie than saying so.
  it('renders no organism rows even when roster ids survived the failure', () => {
    renderRoster({ roster: ROSTER, selectedTool: ERASER_TOOL, libraryUnavailable: true });

    expect(screen.queryByRole('button', { name: 'Chaotic Spreader' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('keeps the eraser available and selected — erasing needs no organism', () => {
    renderRoster({ roster: ROSTER, selectedTool: ERASER_TOOL, libraryUnavailable: true });

    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('OrganismRoster — what this story does NOT build (AC5)', () => {
  it('renders no per-row edit pencil or create button, with an empty library (AC8)', () => {
    renderRoster();

    // ✎ and the create button are Story 4.24/Epic 4. The search box and the "+ ADD ORGANISM"
    // dropdown are THIS story — see "the add control" describe block below — but with the default
    // EMPTY library there is nothing to search or add, so neither renders here either (AC8's
    // stated-empty-state, not a dead affordance).
    expect(screen.queryByText('✎')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /add organism/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /create/i })).toBeNull();
    // Exactly the three rows and the eraser — nothing else claims to be a control.
    expect(screen.getAllByRole('button')).toHaveLength(ROSTER.length + 1);
  });

  it('offers no way to REMOVE a row (Decision H.1 — erase its last cell and save, Story 2.13)', () => {
    renderRoster();

    expect(screen.queryByRole('button', { name: /remove|delete/i })).toBeNull();
  });
});

describe('OrganismRoster — the add control (AC1, AC2, AC3, AC5, AC8)', () => {
  it('lists exactly the library prop as add options, not the roster', () => {
    renderRoster({ library: LIBRARY });

    const select = screen.getByRole('combobox', { name: /add organism/i });
    const optionNames = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionNames).toEqual(['+ ADD ORGANISM', 'Gold Glider', 'Magenta Mutant']);
  });

  // AC2: the search box filters the DROPDOWN, and only the dropdown — the roster list above it is
  // never filtered, hidden, reordered or re-indexed.
  it('narrows the add list when typing, and leaves the roster list untouched', async () => {
    const user = userEvent.setup();
    renderRoster({ library: LIBRARY });

    await user.type(screen.getByRole('textbox', { name: /search organisms/i }), 'gold');

    const select = screen.getByRole('combobox', { name: /add organism/i });
    const optionNames = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionNames).toEqual(['+ ADD ORGANISM', 'Gold Glider']);

    // The roster list above is untouched: still all three rows, unfiltered, unreordered.
    const rosterNames = within(screen.getByRole('list'))
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(rosterNames).toEqual(['Chaotic Spreader', 'Aggressive Colonizer', 'Patient Defender']);
  });

  // AC2's predicate: case-insensitive substring on the name.
  it('matches case-insensitively, anywhere in the name', async () => {
    const user = userEvent.setup();
    renderRoster({ library: LIBRARY });

    await user.type(screen.getByRole('textbox', { name: /search organisms/i }), 'MUTA');

    const select = screen.getByRole('combobox', { name: /add organism/i });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['+ ADD ORGANISM', 'Magenta Mutant']);
  });

  // AC3: choosing an entry calls onAddToRoster with the chosen organism's id.
  it('calls onAddToRoster with the chosen organism’s id', async () => {
    const user = userEvent.setup();
    const onAddToRoster = vi.fn();
    renderRoster({ library: LIBRARY, onAddToRoster });

    await user.selectOptions(
      screen.getByRole('combobox', { name: /add organism/i }),
      'lib-magenta',
    );

    expect(onAddToRoster).toHaveBeenCalledTimes(1);
    expect(onAddToRoster).toHaveBeenCalledWith('lib-magenta');
  });

  // AC5 / Decision G.3: at the cap the control is disabled/unavailable and states the limit —
  // measured off `atCap`, never derived from `library` here (that derivation is the caller's).
  it('replaces the search and select with a stated limit at the cap', () => {
    renderRoster({ library: LIBRARY, atCap: true });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/roster is full/i)).toBeInTheDocument();
    expect(screen.getByText(/255/)).toBeInTheDocument();
  });

  // AC8: an empty library is a STATED state, not a dead dropdown with only its placeholder.
  it('states that nothing is left to add, rather than rendering an empty dropdown', () => {
    renderRoster({ library: [] });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/already in this battle/i)).toBeInTheDocument();
  });

  // AC8: a DIFFERENT fact from the library being empty — the search input stays rendered so the
  // user can see and clear what they typed, but the select is replaced by a message.
  it('states that the search matched nothing, keeping the search box rendered', async () => {
    const user = userEvent.setup();
    renderRoster({ library: LIBRARY });

    await user.type(screen.getByRole('textbox', { name: /search organisms/i }), 'zzz-no-match');

    expect(screen.getByRole('textbox', { name: /search organisms/i })).toHaveValue('zzz-no-match');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/no organisms match/i)).toBeInTheDocument();
  });

  // AC8's third state: a failed library means nothing to add and nothing to say about it beyond
  // the notice already rendered — the add control must not render at all.
  it('renders no add control at all when the library is unavailable', () => {
    renderRoster({
      roster: [],
      selectedTool: ERASER_TOOL,
      libraryUnavailable: true,
      library: LIBRARY,
    });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  // The cap takes priority over the library's own content — a full roster still says so even
  // when the broader workspace library has room (a fact `library.length === 0` cannot capture).
  it('shows the cap message even when the library itself is non-empty', () => {
    renderRoster({ library: LIBRARY, atCap: true });

    expect(screen.queryByText(/already in this battle/i)).toBeNull();
    expect(screen.getByText(/roster is full/i)).toBeInTheDocument();
  });

  // Code review (AC5): the cap message used to end "Remove an organism to add another" — an
  // instruction pointing at an affordance that exists in neither this story nor the app (the
  // story's own "What NOT to build": no row removal; Decision H.1's prune is Story 2.13's save).
  it('does not tell the user to remove an organism at the cap — there is no such control', () => {
    renderRoster({ library: LIBRARY, atCap: true });

    expect(screen.queryByText(/remove an organism/i)).toBeNull();
  });

  // Code review (AC8, trap 7): `library` is a DIFFERENCE, so it reads empty both when the roster
  // consumed the workspace and when the workspace itself is empty. Only the first is "already in
  // this battle"; asserting the pair keeps one message from being reused for the other fact.
  it('distinguishes an empty WORKSPACE from a roster that consumed the library', () => {
    const consumed = renderRoster({ library: [], workspaceEmpty: false });
    expect(screen.getByText(/already in this battle/i)).toBeInTheDocument();
    expect(screen.queryByText(/your organism library is empty/i)).toBeNull();
    consumed.unmount();

    renderRoster({ library: [], workspaceEmpty: true });
    expect(screen.getByText(/your organism library is empty/i)).toBeInTheDocument();
    expect(screen.queryByText(/already in this battle/i)).toBeNull();
  });

  // Code review (AC2): the predicate is trimmed. Mobile keyboards append a space after an accepted
  // word and pasted names carry their own, and untrimmed that reported "No organisms match" with
  // the organism sitting right there — with the offending character invisible in the message.
  it('ignores surrounding whitespace in the search query', async () => {
    const user = userEvent.setup();
    renderRoster({ library: LIBRARY });

    await user.type(screen.getByRole('textbox', { name: /search organisms/i }), '  gold  ');

    expect(
      within(screen.getByRole('combobox', { name: /add organism/i }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['+ ADD ORGANISM', 'Gold Glider']);
    expect(screen.queryByText(/no organisms match/i)).toBeNull();
  });

  // The other half of the same predicate: a query of nothing but spaces is an EMPTY query, so it
  // matches everything — which is what the pre-trim comment claimed was already true and was not
  // (it is false for any single-word name).
  it('treats an all-whitespace query as an empty one', async () => {
    const user = userEvent.setup();
    renderRoster({ library: LIBRARY });

    await user.type(screen.getByRole('textbox', { name: /search organisms/i }), '   ');

    expect(
      within(screen.getByRole('combobox', { name: /add organism/i }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['+ ADD ORGANISM', 'Gold Glider', 'Magenta Mutant']);
  });
});

describe('OrganismRoster — keyboard and axe (AC5)', () => {
  it('reaches and operates every row, and the eraser, by keyboard alone', async () => {
    const user = userEvent.setup();
    const onSelectTool = vi.fn();
    renderRoster({ onSelectTool });

    // Plain buttons, so every row is its OWN tab stop — no roving tabindex to arrow through
    // (forced decision 2). Tabbing four times must reach all three rows and then the eraser.
    for (const name of ['Chaotic Spreader', 'Aggressive Colonizer', 'Patient Defender', 'Eraser']) {
      await user.tab();
      expect(screen.getByRole('button', { name })).toHaveFocus();
    }

    await user.keyboard('{Enter}');
    expect(onSelectTool).toHaveBeenLastCalledWith(ERASER_TOOL);

    // Space activates a button too, and a row that only responded to a click would pass every
    // assertion above.
    await user.tab({ shift: true });
    await user.keyboard(' ');
    expect(onSelectTool).toHaveBeenLastCalledWith({ kind: 'organism', organismId: 'org-p' });
  });

  // AC9: the search input and the add control are reachable by keyboard alone too — tabbed to
  // AFTER the roster rows, matching DOM order (between the list and the pinned eraser).
  it('reaches the search input and the add control by keyboard, after the roster rows', async () => {
    const user = userEvent.setup();
    renderRoster({ library: LIBRARY });

    for (const name of ['Chaotic Spreader', 'Aggressive Colonizer', 'Patient Defender']) {
      await user.tab();
      expect(screen.getByRole('button', { name })).toHaveFocus();
    }

    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Search organisms' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Add organism to roster' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveFocus();
  });

  it('has no axe violations', async () => {
    const { container } = renderRoster();

    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no axe violations with the same-colour warning showing', async () => {
    const { container } = renderRoster({ duplicateColorIds: ['org-c', 'org-a'] });

    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no axe violations in the degraded state', async () => {
    const { container } = renderRoster({
      roster: [],
      selectedTool: ERASER_TOOL,
      libraryUnavailable: true,
    });

    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no axe violations with the add control rendered (library, cap and empty states)', async () => {
    const withLibrary = renderRoster({ library: LIBRARY });
    expect((await axe(withLibrary.container)).violations).toEqual([]);
    withLibrary.unmount();

    const atCap = renderRoster({ library: LIBRARY, atCap: true });
    expect((await axe(atCap.container)).violations).toEqual([]);
    atCap.unmount();

    const empty = renderRoster({ library: [] });
    expect((await axe(empty.container)).violations).toEqual([]);
  });
});
