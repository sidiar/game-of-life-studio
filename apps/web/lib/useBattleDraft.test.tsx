import { describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, type Battle, type Settings } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { createFakeRepositories, createMockWorkspace, MOCK_BATTLE_IDS } from '@gol/test-utils';
import { useBattleDraft } from './useBattleDraft';

/**
 * The hook extracted from `<BattlePage>` (2026-09-08). `BattlePage.test.tsx` already pins the
 * OUTWARD behaviour through the real page — the loading gate, both failure bodies, the seeded
 * `/battle/new` grid — and stays the acceptance evidence. This file pins the hook's own contract:
 * the parts a page-level test either cannot observe, or can only observe by proxy.
 *
 * - that `'new'` never reaches `battles.load()` at all. Through the page this is visible only as
 *   "the editor rendered", which is equally true of a load that ran and happened to return null.
 * - the identity stability of the LOADED draft across a settings change, which is load-bearing
 *   (see the hook's header: `<BattlePage>` derives `seedGrid` from `draft`, and `useUndoableGrid`
 *   compares its seed by identity, so churn silently discards the undo ring). No page-level
 *   assertion exists for this and none is easy to write — the gate keeps the editor unmounted
 *   while the resources settle, so through the page the regression is invisible today and only
 *   becomes reachable when some later story renders before all three are ready.
 * - the `'ready' + null` vs `'error' + null` split as a STATUS fact rather than as rendered copy,
 *   so the distinction survives a rewording of either notice.
 *
 * Mutation checks (2026-09-08), each reddening the named tests and nothing else:
 *   - the `battleId === 'new'` short-circuit removed from the resource -> "never calls
 *     battles.load() for the create path".
 *   - the two memos merged into one `useMemo(…, [battleId, loadedBattle, settings])` -> "the
 *     loaded draft keeps its identity when settings resolve afterwards".
 *   - `status` hard-coded to `'ready'` -> "reports 'error' rather than 'not found'".
 *   - `createdAt` re-stamped with `new Date()` rather than read off the record -> "reports the
 *     loaded record id and createdAt".
 *   - `loadedIdentity` built inline instead of memoised -> all three loaded-path tests, not one.
 *     A fresh object per render never settles the probe's own adjust below, so the churn shows up
 *     as three timeouts rather than a clean assertion failure. Blunt, but it is the honest signal:
 *     that field sits in `saveBattle`'s dep list, where the same churn rebuilds that callback on
 *     every render.
 */

const { battles, organisms } = createMockWorkspace();
const SKIRMISH = battles[0];

function seeded(): AppRepositories {
  return createFakeRepositories({ battles, organisms });
}

// A repository whose battle load rejects — the only way to reach the resource's 'error' status
// with everything else intact. Built by REPLACING one method on a real fake rather than
// hand-rolling the interface, the pattern `BattlePage.test.tsx` already establishes.
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

/**
 * Renders the hook and reports what a test needs to see. `draft-changes` and `identity-changes`
 * count how many times each reference has CHANGED across commits, because the claims below are
 * about churn — which a single snapshot, or a `toBe` on a captured reference, cannot show.
 *
 * ⚠️ The counters are STATE adjusted during render, not refs. `react-hooks/refs` rejects reading or
 * writing a ref during render outright (a lint error), which is the same constraint that shaped
 * `useUndoableGrid`'s seed cell and `<BattlePage>`'s `nameState` — so the counter and the reference
 * it was taken from live in one cell here for the same reason they do there.
 *
 * `settings` is a prop rather than a resource so a test can move it independently of the battle —
 * the ordering the hook's header warns about, and the reason `settings` is a parameter at all.
 */
function Probe({
  repositories,
  battleId,
  settings,
}: {
  repositories: AppRepositories;
  battleId: string | 'new';
  settings: Settings;
}) {
  const { draft, status, loadedIdentity } = useBattleDraft(repositories, battleId, settings);

  const [seenDraft, setSeenDraft] = useState({ ref: draft, changes: 0 });
  if (seenDraft.ref !== draft) setSeenDraft({ ref: draft, changes: seenDraft.changes + 1 });

  const [seenIdentity, setSeenIdentity] = useState({ ref: loadedIdentity, changes: 0 });
  if (seenIdentity.ref !== loadedIdentity) {
    setSeenIdentity({ ref: loadedIdentity, changes: seenIdentity.changes + 1 });
  }

  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="draft">{draft === null ? '—' : `${draft.name || '(unnamed)'}`}</span>
      <span data-testid="size">
        {draft === null ? '—' : `${draft.gridSize.cols}x${draft.gridSize.rows}`}
      </span>
      <span data-testid="rows">{draft === null ? '—' : String(draft.gridState.length)}</span>
      <span data-testid="identity">{loadedIdentity === null ? '—' : loadedIdentity.id}</span>
      <span data-testid="created">
        {loadedIdentity === null ? '—' : loadedIdentity.createdAt.toISOString()}
      </span>
      <span data-testid="draft-changes">{String(seenDraft.changes)}</span>
      <span data-testid="identity-changes">{String(seenIdentity.changes)}</span>
    </div>
  );
}

/** The Probe with a button that swaps `settings` for a different object, so a test can drive the
 * "settings resolve after the battle" ordering without a second async resource. */
function SettingsSwapProbe({
  repositories,
  battleId,
  next,
}: {
  repositories: AppRepositories;
  battleId: string | 'new';
  next: Settings;
}) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  return (
    <div>
      <button onClick={() => setSettings(next)}>swap settings</button>
      <Probe repositories={repositories} battleId={battleId} settings={settings} />
    </div>
  );
}

describe('useBattleDraft', () => {
  describe('the create path', () => {
    // ⚠️ The whole reason the short-circuit exists: 'new' is not a uuid, so a real load would
    // return a plain miss — indistinguishable from a stale id — and `/battle/new` would resolve to
    // "this battle is gone" for a page whose purpose is that it does not exist yet.
    it('never calls battles.load() for the create path', async () => {
      const repositories = seeded();
      const load = vi.spyOn(repositories.battles, 'load');

      render(<Probe repositories={repositories} battleId="new" settings={DEFAULT_SETTINGS} />);

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(load).not.toHaveBeenCalled();
    });

    // Seeded at the SETTINGS' preset, not at a constant — grid dimensions are parameters
    // (project-context). The fixture deliberately differs from DEFAULT_SETTINGS' 100x60 so a
    // hard-coded default cannot pass.
    it('seeds a draft at the settings default grid size', async () => {
      const settings: Settings = { ...DEFAULT_SETTINGS, defaultGridSize: { cols: 50, rows: 30 } };

      render(<Probe repositories={seeded()} battleId="new" settings={settings} />);

      await waitFor(() => expect(screen.getByTestId('size')).toHaveTextContent('50x30'));
      expect(screen.getByTestId('rows')).toHaveTextContent('30');
      // `name` is the EMPTY STRING, never the 'Untitled Battle' display fallback — seeding the
      // fallback would persist placeholder text as a real name on the first save.
      expect(screen.getByTestId('draft')).toHaveTextContent('(unnamed)');
    });

    // No record exists yet, so there is no identity to report — which is exactly what makes
    // `<BattlePage>`'s first save MINT an id rather than update one.
    it('reports no loaded identity for the create path', async () => {
      render(<Probe repositories={seeded()} battleId="new" settings={DEFAULT_SETTINGS} />);

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(screen.getByTestId('identity')).toHaveTextContent('—');
    });
  });

  describe('the loaded path', () => {
    it('collapses a loaded battle into the same draft shape', async () => {
      render(<Probe repositories={seeded()} battleId={SKIRMISH.id} settings={DEFAULT_SETTINGS} />);

      await waitFor(() =>
        expect(screen.getByTestId('draft')).toHaveTextContent('Three-Way Skirmish'),
      );
      // The RECORD's dimensions, never the settings default (100x60) — a loaded battle's grid size
      // is its own.
      expect(screen.getByTestId('size')).toHaveTextContent('50x30');
    });

    // The two fields `NewBattleDraft` deliberately drops. `createdAt` in particular has no other
    // source at save time: `BattleSummarySchema` omits it, so losing it here means silently
    // re-stamping it on every save.
    it('reports the loaded record id and createdAt', async () => {
      render(<Probe repositories={seeded()} battleId={SKIRMISH.id} settings={DEFAULT_SETTINGS} />);

      await waitFor(() =>
        expect(screen.getByTestId('identity')).toHaveTextContent(MOCK_BATTLE_IDS.battleA),
      );
      expect(screen.getByTestId('created')).toHaveTextContent(SKIRMISH.createdAt.toISOString());
    });

    /**
     * THE identity claim, and the reason the hook holds two memos instead of one.
     *
     * A settings resolution landing after the battle must not rebuild the loaded draft: nothing
     * about that draft's inputs changed, and `<BattlePage>` feeds `draft` to `seedGrid` with a
     * `[draft]` dep, which `useUndoableGrid` compares by identity — so a rebuild resets the value
     * and discards the whole 30-entry ring with no error anywhere.
     *
     * Counted rather than snapshotted: the assertion is that the swap causes NO further change,
     * which one `toBe` on a captured reference could not distinguish from a rebuild that happened
     * to produce an equal object.
     */
    it('keeps the loaded draft identity when settings resolve afterwards', async () => {
      const user = userEvent.setup();
      const next: Settings = { ...DEFAULT_SETTINGS, defaultGridSize: { cols: 50, rows: 30 } };

      render(<SettingsSwapProbe repositories={seeded()} battleId={SKIRMISH.id} next={next} />);

      await waitFor(() =>
        expect(screen.getByTestId('draft')).toHaveTextContent('Three-Way Skirmish'),
      );
      // One change each: null -> the loaded value, when the resource settled.
      expect(screen.getByTestId('draft-changes')).toHaveTextContent('1');
      expect(screen.getByTestId('identity-changes')).toHaveTextContent('1');

      await user.click(screen.getByRole('button', { name: 'swap settings' }));

      expect(screen.getByTestId('draft-changes')).toHaveTextContent('1');
      // `loadedIdentity` sits in `saveBattle`'s dep list — churn here rebuilds that callback on
      // every render, which is why it is memoised rather than built inline.
      expect(screen.getByTestId('identity-changes')).toHaveTextContent('1');
      // Still the record's own size, not the new default — the draft did not rebuild.
      expect(screen.getByTestId('size')).toHaveTextContent('50x30');
    });

    // The create path's converse: `newDraft`'s input genuinely IS `settings`, so a settings change
    // there MUST rebuild. Without this the test above would also pass on a hook that ignored
    // settings entirely.
    it('does rebuild the seeded draft when settings change on the create path', async () => {
      const user = userEvent.setup();
      const next: Settings = { ...DEFAULT_SETTINGS, defaultGridSize: { cols: 50, rows: 30 } };

      render(<SettingsSwapProbe repositories={seeded()} battleId="new" next={next} />);

      await waitFor(() => expect(screen.getByTestId('size')).toHaveTextContent('100x60'));

      await user.click(screen.getByRole('button', { name: 'swap settings' }));

      expect(screen.getByTestId('size')).toHaveTextContent('50x30');
    });
  });

  /**
   * "Gone" and "broken" are different facts that offer the user different next moves, and both
   * arrive as `draft === null`. `status` is the only thing that separates them — asserted here as
   * a status rather than as the rendered copy `BattlePage.test.tsx` checks, so the distinction
   * survives a rewording of either notice.
   */
  describe('the two failures', () => {
    it('reports ready with a null draft when the id matches no battle', async () => {
      render(
        <Probe
          repositories={seeded()}
          battleId="11111111-1111-4111-8111-111111111111"
          settings={DEFAULT_SETTINGS}
        />,
      );

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(screen.getByTestId('draft')).toHaveTextContent('—');
      expect(screen.getByTestId('identity')).toHaveTextContent('—');
    });

    it("reports 'error' rather than 'not found' when the load rejects", async () => {
      render(
        <Probe
          repositories={withFailingBattleLoad()}
          battleId={SKIRMISH.id}
          settings={DEFAULT_SETTINGS}
        />,
      );

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
      expect(screen.getByTestId('draft')).toHaveTextContent('—');
      expect(screen.getByTestId('identity')).toHaveTextContent('—');
    });
  });

  /**
   * The aliasing the `readonly` types exist to make safe (Story 2.5, deferred-work.md): `toDraft`
   * hands out the loaded record's OWN arrays rather than cloning 6,000 elements per load. Pinned
   * so a later story that "fixes" this into a copy has to justify the cost deliberately — and so
   * the `readonly` declarations stay understood as the actual protection rather than decoration.
   */
  it('aliases the loaded record arrays instead of cloning them', async () => {
    let seen: readonly (readonly number[])[] | null = null;
    let loaded: Battle | null = null;

    const repositories = seeded();
    const inner = repositories.battles.load.bind(repositories.battles);
    const spied: AppRepositories = {
      ...repositories,
      battles: {
        ...repositories.battles,
        load: async (id) => {
          loaded = await inner(id);
          return loaded;
        },
      },
    };

    // Published from an EFFECT rather than assigned during render: `react-hooks/globals` rejects
    // reassigning an outer variable in a render body, and an effect is the sanctioned escape.
    function AliasProbe() {
      const { draft } = useBattleDraft(spied, SKIRMISH.id, DEFAULT_SETTINGS);
      useEffect(() => {
        if (draft !== null) seen = draft.gridState;
      }, [draft]);
      return <span data-testid="ready">{draft === null ? 'no' : 'yes'}</span>;
    }
    render(<AliasProbe />);

    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('yes'));
    expect(seen).toBe(loaded!.gridState);
  });
});
