import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Battle } from '@gol/domain';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import type { BattleEditorViewProps } from './BattleEditorView';
import BattlePage from './BattlePage';

// ⚠️ MANDATORY once Story 2.16 lands, not merely convenient (trap 21). `useRouter()` throws
// outside an App Router context under RTL — "invariant expected app router to be mounted" — so
// every file that renders `<BattlePage>` fails AT RENDER without this, in an error that names
// React internals rather than the router (the confusion `AppNav.test.tsx`'s own mock comment
// records from Story 1.9). `<BattlePage>` calls it for the FR-7.10 Back navigation.
//
// `vi.hoisted` so `push` is a real spy this file can assert on, rather than an anonymous mock
// buried in the factory (the idiom `AppNav.test.tsx` established for `usePathname`).
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: router.push }),
}));

/**
 * deferred-work.md, **closed by Story 2.14**: the direct `onCommitGrid` IDENTITY assertion Story
 * 2.11 Task 3 asked for and never got.
 *
 * `BattlePage.test.tsx` covers the OUTWARD consequence ("keeps the commit seam working across an
 * unrelated re-render"), but that test passes just as happily with an arrow function inlined into
 * the JSX, because the grid lives in `useUndoableGrid` rather than in the captured closure. The
 * invariant AC4 names — a STABLE prop identity — is currently guaranteed by
 * `useCallback(…, [commitGrid])` alone, and nothing observes it.
 *
 * Why the assertion needs its own file: the only clean way to observe the prop is
 * `vi.mock('./BattleEditorView')`, and `vi.mock` is FILE-HOISTED — putting it in
 * `BattlePage.test.tsx` would replace the real child for all ~80 other tests there. The entry says
 * exactly this, and names "whichever story next touches the commit seam" as the owner. Story 2.14's
 * confirmed resize is a commit source, so it is that story.
 *
 * ⚠️ Why it matters, restated so nobody "simplifies" the `useCallback` away: `EditDish`'s resize
 * effect holds whatever `onCommitGrid` resolves to in a closure it deliberately does not
 * re-register (`PetriDishCanvas.tsx`, `[size]` + `endStrokeRef`). A wrapper rebuilt per render
 * makes that closure stale, and the symptom is a mid-stroke resize committing through a stale
 * handler — not a failing test anywhere else.
 */

// Every render's props, in order. Written from inside the mocked child, which is the only place
// the prop is observable at all.
const renderedProps: BattleEditorViewProps[] = [];

vi.mock('./BattleEditorView', () => ({
  default: (props: BattleEditorViewProps) => {
    renderedProps.push(props);
    return (
      <div>
        {/* An UNRELATED state change in `<BattlePage>` — it drives `battleName`/`isDirty`, and
            touches neither the grid nor the undo ring. That is the point: the seam's identity must
            survive a re-render it had nothing to do with. */}
        <button type="button" onClick={() => props.onNameChange(`${props.battleName}x`)}>
          rename
        </button>
        <span data-testid="name">{props.battleName}</span>
      </div>
    );
  },
}));

const { battles, organisms } = createMockWorkspace();
const SKIRMISH = battles.find((b) => b.id === MOCK_BATTLE_IDS.battleA) as Battle;

describe('BattlePage — the commit seam’s identity (Story 2.11 AC4, asserted in Story 2.14)', () => {
  it('hands <BattleEditorView> the SAME onCommitGrid across an unrelated re-render', async () => {
    const user = userEvent.setup();
    renderedProps.length = 0;
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles, organisms })}
        battleId={SKIRMISH.id}
      />,
    );
    await waitFor(() => expect(renderedProps.length).toBeGreaterThan(0));

    const before = renderedProps.at(-1) as BattleEditorViewProps;
    const rendersBefore = renderedProps.length;

    await user.click(screen.getByRole('button', { name: 'rename' }));

    await waitFor(() => expect(renderedProps.length).toBeGreaterThan(rendersBefore));
    const after = renderedProps.at(-1) as BattleEditorViewProps;

    // The re-render genuinely happened and genuinely changed something.
    expect(after.battleName).not.toBe(before.battleName);
    // ...and the seam is the SAME FUNCTION OBJECT, not merely one that still works.
    expect(after.onCommitGrid).toBe(before.onCommitGrid);
    // `onUndo` carries the same guarantee for the same reason (it is wrapped for the edit lock),
    // so it is asserted here rather than left to be discovered when it churns.
    expect(after.onUndo).toBe(before.onUndo);
  });

  it('keeps that identity across a COMMIT, so the ring’s own updates do not churn it either', async () => {
    renderedProps.length = 0;
    render(
      <BattlePage
        repositories={createFakeRepositories({ battles, organisms })}
        battleId={SKIRMISH.id}
      />,
    );
    await waitFor(() => expect(renderedProps.length).toBeGreaterThan(0));

    const before = renderedProps.at(-1) as BattleEditorViewProps;
    const grid = before.grid;
    const next = {
      width: grid.width,
      height: grid.height,
      occupant: grid.occupant.slice(),
      age: grid.age,
    };
    next.occupant[0] = next.occupant[0] === 0 ? 1 : 0;

    // Straight through the seam, exactly as a stroke, a Clear or Story 2.14's confirmed resize
    // arrives at it.
    before.onCommitGrid(next);

    await waitFor(() =>
      expect((renderedProps.at(-1) as BattleEditorViewProps).grid).not.toBe(grid),
    );
    expect((renderedProps.at(-1) as BattleEditorViewProps).onCommitGrid).toBe(before.onCommitGrid);
  });
});
