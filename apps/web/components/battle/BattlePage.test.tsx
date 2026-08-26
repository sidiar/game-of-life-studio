import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { Battle } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import BattlePage from './BattlePage';

const { battles, organisms } = createMockWorkspace();
const SKIRMISH = battles.find((b) => b.id === MOCK_BATTLE_IDS.battleA) as Battle;

// Always the real factory from @gol/test-utils — a hand-rolled fake in a test file is what the
// shared fixtures exist to prevent (project-context, Testing rules).
function seeded(overrides: readonly Battle[] = battles): AppRepositories {
  return createFakeRepositories({ battles: overrides, organisms });
}

// A repository whose battle load rejects. Built by REPLACING one method on a real fake rather
// than hand-rolling the interface, so the other 20-odd methods keep their real contracts.
function withFailingBattleLoad(): AppRepositories {
  const repositories = seeded();
  return {
    ...repositories,
    battles: {
      ...repositories.battles,
      load: () => Promise.reject(new Error('storage is damaged')),
    },
  };
}

describe('BattlePage', () => {
  it('loads the battle through the injected repositories and shows its title', async () => {
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading battle…');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('also loads the organism library (AC1), so the roster is in hand before Story 2.9 needs it', async () => {
    const repositories = seeded();
    const listSpy = vi.spyOn(repositories.organisms, 'list');

    render(<BattlePage repositories={repositories} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(listSpy).toHaveBeenCalled();
  });

  it('falls back to "Untitled Battle" for a battle with a blank name', async () => {
    const untitled: Battle = { ...SKIRMISH, name: '   ' };

    render(<BattlePage repositories={seeded([untitled])} battleId={untitled.id} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Untitled Battle' }),
    ).toBeInTheDocument();
  });

  // AC4's failure half: distinct from both the loading state and the not-found state, and it
  // offers the way back that AC4 requires.
  it('renders the error body with a link back to the Gallery when the load rejects', async () => {
    render(<BattlePage repositories={withFailingBattleLoad()} battleId={SKIRMISH.id} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something Went Wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Gallery' })).toHaveAttribute('href', '/');
  });

  // The third terminal state. A `ready` resource holding `null` is NOT "still loading" — the
  // intuitive `if (!data) return <Loading/>` spins here forever, silently, on every stale link.
  it('renders a not-found body — never the spinner — for an id no battle matches', async () => {
    render(<BattlePage repositories={seeded()} battleId="ffffffff-0000-4000-8000-000000000000" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Battle Not Found' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Gallery' })).toHaveAttribute('href', '/');
  });

  // A missing or empty ?id= arrives here as the empty string. It is the not-found branch, not a
  // crash and not an infinite spinner.
  it('treats an empty id as not-found rather than crashing', async () => {
    render(<BattlePage repositories={seeded()} battleId="" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Battle Not Found' }),
    ).toBeInTheDocument();
  });

  // Not-found and error must not share copy: "gone" and "broken" are different facts.
  it('gives not-found and failure distinct headings', async () => {
    const notFound = render(<BattlePage repositories={seeded()} battleId="missing" />);
    const notFoundHeading = (await notFound.findByRole('heading', { level: 1 })).textContent;
    notFound.unmount();

    const failed = render(
      <BattlePage repositories={withFailingBattleLoad()} battleId={SKIRMISH.id} />,
    );
    const failedHeading = (await failed.findByRole('heading', { level: 1 })).textContent;

    expect(notFoundHeading).not.toBe(failedHeading);
  });

  // battleId === 'new' must never reach battles.load(): 'new' is not an id, and a repository miss
  // would render "this battle is gone" for the create route. Story 2.2 owns the seeding.
  it('never calls battles.load for the "new" route, and renders its own placeholder', async () => {
    const repositories = seeded();
    const loadSpy = vi.spyOn(repositories.battles, 'load');

    render(<BattlePage repositories={repositories} battleId="new" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'New Battle' }),
    ).toBeInTheDocument();
    expect(loadSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Back to Gallery' })).toHaveAttribute('href', '/');
  });

  // AC2 / NFR-4.1 as a COUNT, not a presence check: `queryByRole('button', { name: /run/i })`
  // being null still passes after someone adds a dead RUN button labelled differently, or a
  // fullscreen button beside it. The whole route ships zero buttons in Epic 2.
  it('renders no Run, fullscreen, or any other button on the loaded route', async () => {
    render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // Exactly one <h1>: the battle title. The battle route drops AppShell, so nothing else on it
    // competes for the document heading, and nothing automated enforces that but this line.
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // App Router enables StrictMode in dev, so double-invoked effects are the default environment.
  // The hook has no run-once guard by design — this asserts the user-visible outcome (one title,
  // settled) rather than a call count the hook deliberately does not promise.
  it('settles to a single rendered battle under StrictMode', async () => {
    render(
      <StrictMode>
        <BattlePage repositories={seeded()} battleId={SKIRMISH.id} />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 1, name: 'Three-Way Skirmish' })).toHaveLength(
        1,
      ),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // The established pattern: the matcher is deliberately not wired (vitest.setup.ts), so the
  // violations array is asserted directly.
  it('has no axe accessibility violations once the battle is loaded', async () => {
    const { container } = render(<BattlePage repositories={seeded()} battleId={SKIRMISH.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Three-Way Skirmish' });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('has no axe accessibility violations in the not-found state', async () => {
    const { container } = render(<BattlePage repositories={seeded()} battleId="missing" />);
    await screen.findByRole('heading', { level: 1, name: 'Battle Not Found' });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
