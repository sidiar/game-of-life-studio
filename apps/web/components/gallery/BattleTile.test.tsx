import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createFakeRepositories, createMockBattles, createMockOrganisms } from '@gol/test-utils';
import type { TileOrganism } from '@/lib/tileOrganisms';
import BattleTile from './BattleTile';

function organism(overrides: Partial<TileOrganism> & { id: string }): TileOrganism {
  return { name: 'Organism', color: 'hsl(200, 80%, 50%)', ...overrides };
}

// gridColors: null keeps the thumbnail load effect permanently idle (Task 5's degradation
// table) — these tests are about the tile's TEXT/dot behaviour, not the canvas, which has its own
// suite. battles/roster come from the real fake-repo factory (never hand-rolled in a test file).
const BASE_PROPS = {
  battleId: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Three-Way Skirmish',
  gridSize: { cols: 50, rows: 30 },
  updatedAt: new Date('2026-07-25T18:15:00.000Z'),
  organisms: [
    organism({ id: 'a', name: 'Aggressive Colonizer' }),
    organism({ id: 'b', name: 'Patient Defender' }),
    organism({ id: 'c', name: 'Chaotic Spreader' }),
  ] as TileOrganism[],
  battles: createFakeRepositories().battles,
  roster: [],
  showGridLines: true,
  gridColors: null,
  // Story 1.13. A no-op default so the ~20 render() calls below that don't care about the delete
  // affordance don't each need their own spy; tests that DO care pass their own vi.fn() instead.
  onRequestDelete: vi.fn(),
};

// Several degradation tests below spy console.error to prove a path stays silent. Without this,
// the first spy survives the whole file: vi.spyOn on an already-spied property returns the
// EXISTING mock with its call history intact, so each later `not.toHaveBeenCalled()` asserts over
// every console.error since the first test — and the tests after it (including the axe run)
// execute with console.error muted, hiding React act()/key/ref warnings entirely.
// This project's vitest config sets neither `restoreMocks` nor `clearMocks`, so it must be here.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('BattleTile', () => {
  it('renders the battle name as a level-2 heading', () => {
    render(<BattleTile {...BASE_PROPS} />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Three-Way Skirmish' }),
    ).toBeInTheDocument();
  });

  it('falls back to a placeholder title rather than rendering an empty heading', () => {
    render(<BattleTile {...BASE_PROPS} name="   " />);
    expect(screen.getByRole('heading', { level: 2, name: 'Untitled battle' })).toBeInTheDocument();
  });

  // Forced decision 2's grid-size substitute for the mockup's unimplementable "Gen 47" is gone
  // (Sidiar, 2026-08-25) — it sat in the same top-right corner TileActions reveals the delete
  // button into on hover (the mockup has the identical collision: `.tile-actions` is
  // `position: absolute; top: 18px; right: 18px`, the same slot `.tile-stats` occupies), and
  // grid size wasn't valuable enough to keep fighting that overlap for. The corner is empty now.
  it('renders no grid-size stat in the header', () => {
    render(<BattleTile {...BASE_PROPS} />);
    expect(screen.queryByText('50 × 30')).not.toBeInTheDocument();
  });

  it('renders the single last-modified date, with no visible organism-count text', () => {
    render(<BattleTile {...BASE_PROPS} />);
    expect(screen.getByText('Jul 25, 2026')).toBeInTheDocument();
    expect(screen.queryByText(/organisms?$/)).not.toBeInTheDocument();
  });

  // Each dot is individually named — the accessible-name check a mouse-only CSS tooltip (the
  // mockup's ::before pattern) could never pass. role="img", not button: the dot has no activation
  // behaviour, so a button would announce an action that does not exist.
  //
  // Story 1.13: the tile now legitimately renders ONE button (delete) elsewhere in the tile, so
  // "no dot is a button" is asserted per-dot rather than as a blanket zero-buttons count — the
  // blanket form would fail the moment a real, unrelated button exists anywhere in the tile.
  it('gives each organism dot its own accessible name, and no dot is a button', () => {
    render(<BattleTile {...BASE_PROPS} />);

    const aggressive = screen.getByRole('img', { name: 'Aggressive Colonizer' });
    const patient = screen.getByRole('img', { name: 'Patient Defender' });
    const chaotic = screen.getByRole('img', { name: 'Chaotic Spreader' });
    expect(aggressive).toBeInTheDocument();
    expect(patient).toBeInTheDocument();
    expect(chaotic).toBeInTheDocument();
    for (const dot of [aggressive, patient, chaotic]) {
      expect(dot.tagName).not.toBe('BUTTON');
    }
  });

  it('is keyboard-focusable through the dots (AC5)', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);

    await user.tab();
    expect(screen.getByRole('img', { name: 'Aggressive Colonizer' })).toHaveFocus();
  });

  // MUI's Tooltip only mounts its content (role="tooltip", via a Popper portal) while open — no
  // data-attribute needed; presence/absence in the DOM IS the observable state.
  //
  // The keyboard-focus half of SC 1.4.13 is NOT verified here: MUI gates that reveal on
  // `:focus-visible` (@mui/utils/isFocusVisible), and jsdom's `Element#matches(':focus-visible')`
  // throws — caught, and treated as `false` — so a jsdom-focused dot never opens the tooltip
  // regardless of real-browser behaviour. gallery.spec.ts's tab-focus assertion is the only place
  // that reveal is actually exercised (verified there against chromium, firefox and webkit).
  it('reveals the tooltip on pointer hover, and hides it on pointer leave', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);
    const dot = screen.getByRole('img', { name: 'Aggressive Colonizer' });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(dot);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Aggressive Colonizer');

    await user.unhover(dot);
    await waitForElementToBeRemoved(() => screen.queryByRole('tooltip'));
  });

  // SC 1.4.13 "dismissible" requires dismissal WITHOUT moving focus — an earlier implementation
  // blurred the trigger, which dropped the user at <body> and restarted the tab order. MUI's
  // Tooltip closes on Escape via its own document keydown listener (Tooltip.js:444-451) without
  // touching focus, which is what this test now verifies against MUI's behaviour rather than a
  // hand-rolled one.
  //
  // Opened via hover, not Tab: MUI's focus-triggered reveal is `:focus-visible`-gated, which
  // jsdom cannot evaluate (see the test above). A real `.focus()` call still puts real DOM focus
  // on the dot regardless of that gate, which is all this test needs to verify Escape's
  // no-refocus behaviour.
  it('dismisses the tooltip on Escape while keeping focus on the dot', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);
    const dot = screen.getByRole('img', { name: 'Aggressive Colonizer' });

    await user.hover(dot);
    dot.focus();
    expect(dot).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitForElementToBeRemoved(() => screen.queryByRole('tooltip'));
    expect(dot).toHaveFocus();
  });

  // A pointer user has no focused element to receive the keydown, which is why MUI's listener is
  // on `document` rather than on the trigger.
  it('dismisses a hover-triggered tooltip on Escape', async () => {
    const user = userEvent.setup();
    render(<BattleTile {...BASE_PROPS} />);
    const dot = screen.getByRole('img', { name: 'Aggressive Colonizer' });

    await user.hover(dot);
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitForElementToBeRemoved(() => screen.queryByRole('tooltip'));
  });

  it('caps the visible dots at 6 and folds the rest into a "+n" control whose accessible name lists every remaining organism', () => {
    const tenOrganisms = Array.from({ length: 10 }, (_, i) =>
      organism({ id: `id-${i}`, name: `Organism ${i}` }),
    );
    render(<BattleTile {...BASE_PROPS} organisms={tenOrganisms} />);

    for (let i = 0; i < 6; i++) {
      expect(screen.getByRole('img', { name: `Organism ${i}` })).toBeInTheDocument();
    }
    for (let i = 6; i < 10; i++) {
      expect(screen.queryByRole('img', { name: `Organism ${i}` })).not.toBeInTheDocument();
    }

    const more = screen.getByRole('img', {
      name: /4 more organisms: Organism 6, Organism 7, Organism 8, Organism 9/,
    });
    expect(more).toHaveTextContent('+4');
  });

  it('renders the fallback organism dot without throwing (dangling id)', () => {
    render(
      <BattleTile
        {...BASE_PROPS}
        organisms={[organism({ id: 'ghost', name: 'Unknown organism' })]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Unknown organism' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<BattleTile {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations with an overflowing roster', async () => {
    const tenOrganisms = Array.from({ length: 10 }, (_, i) =>
      organism({ id: `id-${i}`, name: `Organism ${i}` }),
    );
    const { container } = render(<BattleTile {...BASE_PROPS} organisms={tenOrganisms} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations with an empty battle name', async () => {
    const { container } = render(<BattleTile {...BASE_PROPS} name="" />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

// Story 1.13, Task 2. jsdom cannot compute :hover/:focus-within-driven `opacity`, so the actual
// reveal is proven in a real browser — `e2e/deleteBattle.spec.ts`'s "the delete button is revealed
// by hover and by keyboard focus, and is hidden otherwise" (the claim this comment made before the
// 2026-08-14 review pointed at a test that did not exist). These tests cover the DOM structure and
// behaviour that CAN be asserted here: the button's accessible name, its glyph, and that it reports
// the request rather than acting on it itself.
describe('BattleTile — delete affordance (Story 1.13)', () => {
  it('names the delete button after the battle, and calls onRequestDelete on click, not the repository', async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    const deleteSpy = vi.spyOn(BASE_PROPS.battles, 'delete');
    render(<BattleTile {...BASE_PROPS} onRequestDelete={onRequestDelete} />);

    const button = screen.getByRole('button', { name: 'Delete Three-Way Skirmish' });
    await user.click(button);

    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(onRequestDelete).toHaveBeenCalledWith();
    // The tile never calls the repository itself — <BattleGallery> owns that call (AR-2/27: a
    // component receives repositories as props but a presentational tile must not act on them for
    // an operation it doesn't own).
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('falls back to the same "Untitled battle" name the heading uses, so the two cannot drift', () => {
    render(<BattleTile {...BASE_PROPS} name="   " />);
    expect(screen.getByRole('button', { name: 'Delete Untitled battle' })).toBeInTheDocument();
  });

  // Both tiles rendered into ONE document, not one-then-unmount-then-the-other: the property this
  // test is named for is that a screen-reader user on a POPULATED gallery can tell the delete
  // buttons apart. Rendered in isolation, each assertion only re-proves that the label interpolates
  // `name`, which the two tests above already cover.
  it('gives two tiles with different names distinct delete-button accessible names', () => {
    render(
      <>
        <BattleTile {...BASE_PROPS} name="Triple Threat" />
        <BattleTile {...BASE_PROPS} name="Grand Colony War" />
      </>,
    );

    const names = screen
      .getAllByRole('button', { name: /^Delete / })
      .map((button) => button.getAttribute('aria-label'));

    expect(names).toEqual(['Delete Triple Threat', 'Delete Grand Colony War']);
    expect(new Set(names).size).toBe(2);
  });

  it("renders the × glyph as aria-hidden, so it does not double the button's accessible name", () => {
    const { container } = render(<BattleTile {...BASE_PROPS} />);
    const glyph = container.querySelector('[data-tile-actions] button span[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveTextContent('×');
  });

  it('is a type="button", never a submit button inside an implicit form context', () => {
    render(<BattleTile {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /^Delete/ })).toHaveAttribute('type', 'button');
  });
});

// The thumbnail lifecycle (Story 1.11 Task 5). IntersectionObserver is absent in jsdom, so
// useInView defaults to true — every tile here is "in view" from mount, and gridColors is a real
// object rather than BASE_PROPS' null so the load effect actually fires.
describe('BattleTile — thumbnail (Story 1.11)', () => {
  const GRID_COLORS = { background: '#0a0a0a', gridLine: 'rgb(51 51 51 / 0.3)' };

  it('mounts a canvas and calls battles.load exactly once for a visible tile (AC1)', async () => {
    const [battle] = createMockBattles();
    const repos = createFakeRepositories({ battles: [battle], organisms: createMockOrganisms() });
    const loadSpy = vi.spyOn(repos.battles, 'load');

    const { container } = render(
      <BattleTile
        {...BASE_PROPS}
        battleId={battle.id}
        battles={repos.battles}
        roster={createMockOrganisms()}
        gridColors={GRID_COLORS}
      />,
    );

    await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull());
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith(battle.id);
  });

  it('never loads while gridColors is null — the tile still renders its heading', async () => {
    const [battle] = createMockBattles();
    const repos = createFakeRepositories({ battles: [battle], organisms: createMockOrganisms() });
    const loadSpy = vi.spyOn(repos.battles, 'load');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <BattleTile
        {...BASE_PROPS}
        battleId={battle.id}
        battles={repos.battles}
        roster={createMockOrganisms()}
        gridColors={null}
      />,
    );

    await screen.findByRole('heading', { level: 2, name: BASE_PROPS.name });
    expect(loadSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('degrades to a blank dish, without a console error, when load() throws CorruptDataError', async () => {
    // The e2e crowded fixture in miniature: nine organismIds, none placed — BattleSummarySchema
    // accepts it (list() shows the tile) but BattleSchema's Decision H.1 superRefine rejects it
    // (load() throws). This is the best regression case in the repo for this row.
    const [validBattle] = createMockBattles();
    const crowded = {
      ...validBattle,
      id: 'c5b3e4f6-7d8a-4b9c-8e0f-2a3b4c5d6e7f',
      organismIds: Array.from({ length: 9 }, (_, i) => `absent-organism-${i}`),
    };
    const repos = createFakeRepositories({
      raw: { battles: { [crowded.id]: crowded } },
    });
    const loadSpy = vi.spyOn(repos.battles, 'load');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <BattleTile
        {...BASE_PROPS}
        battleId={crowded.id}
        battles={repos.battles}
        roster={[]}
        gridColors={GRID_COLORS}
      />,
    );

    await screen.findByRole('heading', { level: 2, name: BASE_PROPS.name });
    await waitFor(() => expect(loadSpy).toHaveBeenCalledTimes(1));
    // Let the rejected load() promise settle and the component's own .catch chain re-render
    // before asserting the dish stayed blank — a bare synchronous check would pass vacuously
    // (the tile starts blank regardless) without proving the degradation path actually ran.
    await expect(loadSpy.mock.results[0].value as Promise<unknown>).rejects.toThrow();
    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('degrades to a blank dish when load() returns null (deleted mid-flight)', async () => {
    const repos = createFakeRepositories();
    const loadSpy = vi.spyOn(repos.battles, 'load');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <BattleTile
        {...BASE_PROPS}
        battleId="00000000-0000-4000-8000-000000000099"
        battles={repos.battles}
        roster={[]}
        gridColors={GRID_COLORS}
      />,
    );

    await screen.findByRole('heading', { level: 2, name: BASE_PROPS.name });
    // Same discipline as the CorruptDataError row above: wait for the load to be issued AND for
    // its promise to settle before asserting the dish stayed blank. A tile starts blank in every
    // state, so without these two awaits this test passes even if load() is never called at all
    // or the `battle === null` branch is deleted outright.
    await waitFor(() => expect(loadSpy).toHaveBeenCalledTimes(1));
    await expect(loadSpy.mock.results[0].value as Promise<unknown>).resolves.toBeNull();
    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('degrades to a blank dish when toThumbnailSource throws', async () => {
    const battleThumbnail = await import('@/lib/canvas/battleThumbnail');
    const throwSpy = vi.spyOn(battleThumbnail, 'toThumbnailSource').mockImplementation(() => {
      throw new Error('ragged gridState');
    });
    const [battle] = createMockBattles();
    const repos = createFakeRepositories({ battles: [battle], organisms: createMockOrganisms() });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <BattleTile
        {...BASE_PROPS}
        battleId={battle.id}
        battles={repos.battles}
        roster={createMockOrganisms()}
        gridColors={GRID_COLORS}
      />,
    );

    await screen.findByRole('heading', { level: 2, name: BASE_PROPS.name });
    await waitFor(() => expect(throwSpy).toHaveBeenCalled());
    expect(container.querySelector('canvas')).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    throwSpy.mockRestore();
  });

  it('does not throw or log when the 2D context is unavailable (real jsdom behaviour)', async () => {
    const [battle] = createMockBattles();
    const repos = createFakeRepositories({ battles: [battle], organisms: createMockOrganisms() });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <BattleTile
        {...BASE_PROPS}
        battleId={battle.id}
        battles={repos.battles}
        roster={createMockOrganisms()}
        gridColors={GRID_COLORS}
      />,
    );

    await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull());
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('has no axe violations with the canvas present', async () => {
    const [battle] = createMockBattles();
    const repos = createFakeRepositories({ battles: [battle], organisms: createMockOrganisms() });

    const { container } = render(
      <BattleTile
        {...BASE_PROPS}
        battleId={battle.id}
        battles={repos.battles}
        roster={createMockOrganisms()}
        gridColors={GRID_COLORS}
      />,
    );

    await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull());
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
