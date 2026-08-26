'use client';

import { useState } from 'react';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS, type Battle, type Organism, type Settings } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { battleDisplayName } from '@/lib/battleDisplayName';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { createNewBattleDraft, type NewBattleDraft } from '@/lib/newBattleDraft';
import { BackLink, Notice, NoticeText, NoticeTitle } from '@/components/layout/Notice';
import BattleHeader from './BattleHeader';

const Body = styled('div')({
  padding: '30px',
  color: 'var(--gol-text-secondary)',
});

/**
 * The Suspense fallback for the `/battle` route AND the hook's own in-flight state, so both spell
 * "loading" identically. `useSearchParams()` in a prerendered page throws
 * `missing-suspense-with-csr-bailout` unless it sits under a boundary, and a boundary whose
 * fallback differs from the resolved loading state makes the page flicker between two spellings of
 * the same condition.
 */
export function BattleLoading() {
  return (
    <Body role="status" aria-live="polite">
      Loading battle…
    </Body>
  );
}

export interface BattlePageProps {
  // The DI seam (AR-2/AR-27), typed to the interface. This component never imports a concrete
  // repository and never calls createRepositories() itself — the page boundary does that once.
  repositories: AppRepositories;
  // 'new' is Story 2.2's create path. It is NOT an id: see the short-circuit below.
  battleId: string | 'new';
}

interface LoadedResource {
  battle: Battle | null;
  organisms: readonly Organism[];
  // Read unconditionally, not only for the 'new' branch: Task 1 wants it loaded once through the
  // page's existing useAsyncResource call rather than threaded down as a fresh prop. Only the
  // 'new' branch consumes it today — the loaded battle carries its own gridSize and ignores this
  // — so the loaded route pays one extra localStorage read, inside a Promise.all it is already
  // awaiting two others in. Do not make the read conditional to save it: `useAsyncResource`'s
  // deps are [repositories, battleId], so a branch here would need a second resource shape.
  settings: Settings;
}

// Converts a loaded Battle to the SAME shape createNewBattleDraft seeds, so the render below reads
// one shape instead of branching on battleId === 'new' forever (Task 3).
function toDraft(battle: Battle): NewBattleDraft {
  return {
    name: battle.name,
    gridSize: battle.gridSize,
    gridState: battle.gridState,
    organismIds: battle.organismIds,
  };
}

export default function BattlePage({ repositories, battleId }: BattlePageProps) {
  // AR-28: modes are local state, not routes. Epic 2 populates only 'lab' — the setter and the
  // 'run' branch arrive in Epic 3, and until then the route renders no toggle and no fullscreen
  // affordance at all (NFR-4.1: a rendered-but-inert control is worse than an absent one).
  const [mode] = useState<'lab'>('lab');

  // ⚠️ 'new' must never reach battles.load(). It is not a uuid, so the repository would treat it
  // as a plain miss and return null — indistinguishable from a stale/deleted id, which would make
  // /battle/new render "this battle is gone" for a page whose whole purpose is that it does not
  // exist yet. Story 2.2 short-circuits and seeds a fresh draft for the branch instead (below).
  //
  // ⚠️ Promise.all rejects on the FIRST rejection, so one corrupt ORGANISM record blanks the page
  // with "something went wrong" even when the battle itself loaded fine. Accepted for this story
  // — AC4 asks only for a distinct failure state — and recorded rather than discovered in review.
  //
  // settings.load() never rejects INTO this Promise.all: a corrupt gol:settings record must not
  // blank the create route (Task 1), so it degrades to DEFAULT_SETTINGS itself, the same shape
  // BattleGallery.tsx already establishes for the identical failure.
  const resource = useAsyncResource<LoadedResource>(async () => {
    const [battle, organisms, settings] = await Promise.all([
      battleId === 'new' ? Promise.resolve(null) : repositories.battles.load(battleId),
      repositories.organisms.list(),
      repositories.settings.load().catch(() => DEFAULT_SETTINGS),
    ]);
    return { battle, organisms, settings };
  }, [repositories, battleId]);

  if (resource.status === 'loading') return <BattleLoading />;

  // ⚠️ ORDER IS LOAD-BEARING: 'new' is checked BEFORE 'error'. /battle/new describes no stored
  // battle at all, but it still awaits organisms.list() in the same Promise.all — so with the
  // error branch first, one corrupt ORGANISM record made the create route announce "this battle
  // could not be loaded, its stored data may be damaged" about a battle that does not exist. That
  // is the same wrong-fact-about-the-wrong-record failure the not-found branch below exists to
  // prevent, reintroduced by branch order alone (Story 2.1 review).
  //
  // resource.data is undefined here only when organisms.list() rejected (settings.load() cannot
  // reject into this resource — see above), so the settings fallback below is DEFAULT_SETTINGS in
  // that case, matching the same degrade BattleGallery.tsx already uses.
  if (battleId === 'new') {
    const settings = resource.data?.settings ?? DEFAULT_SETTINGS;
    const draft = createNewBattleDraft(settings.defaultGridSize);
    return (
      <>
        <BattleHeader battleTitle={battleDisplayName(draft.name)} />
        {/* AC3/AC4: this seeds the empty grid STATE (the model), never persists anything, and
            renders no canvas yet — <PetriDishCanvas variant="edit"> is Story 2.4. */}
        <Body data-mode={mode}>The battle editor arrives in the next stories.</Body>
      </>
    );
  }

  if (resource.status === 'error') {
    return (
      <Notice>
        <NoticeTitle>Something Went Wrong</NoticeTitle>
        <NoticeText>This battle could not be loaded. Its stored data may be damaged.</NoticeText>
        <BackLink href="/">Back to Gallery</BackLink>
      </Notice>
    );
  }

  // ⚠️ THE third terminal state, and the one the intuitive code loses. `status === 'ready'` with
  // `battle === null` means the repository looked and found nothing (a deleted, stale or
  // hand-typed id, or a missing/empty ?id=). Branching on the VALUE first — `if (!data) return
  // <Loading/>` — folds it into "still loading" and spins forever with nothing logged. Its copy
  // must also differ from the error copy above: "gone" and "broken" are different facts and offer
  // the user different next moves.
  const battle = resource.data?.battle ?? null;
  if (battle === null) {
    return (
      <Notice>
        <NoticeTitle>Battle Not Found</NoticeTitle>
        <NoticeText>
          No battle matches this link. It may have been deleted, or the link may be incomplete.
        </NoticeText>
        <BackLink href="/">Back to Gallery</BackLink>
      </Notice>
    );
  }

  const draft = toDraft(battle);

  return (
    <>
      <BattleHeader battleTitle={battleDisplayName(draft.name)} />
      {/* The roster IS loaded and held (AC1) — <OrganismRoster> is its consumer in Story 2.9.
          `mode` is read here so the state cell is not merely declared: the Lab chassis, the canvas
          and the sidebar are Stories 2.4/2.9+, and this is the skeleton they mount into. */}
      <Body data-mode={mode}>The battle editor arrives in the next stories.</Body>
    </>
  );
}
