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

function renderRoster(overrides: Partial<ComponentProps<typeof OrganismRoster>> = {}) {
  return render(
    <OrganismRoster
      roster={ROSTER}
      selectedTool={ORGANISM_TOOL}
      onSelectTool={() => {}}
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
  it('renders no per-row edit pencil, search box, add dropdown or create button', () => {
    renderRoster();

    // ✎ is Story 4.24; the search/add/create trio is Story 2.10 + Epic 4. The mockup carries all
    // four in this same section, so building a SUBSET of it is expected — and rendering any of
    // them inert would be the dead affordance NFR-4.1 forbids.
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
});
