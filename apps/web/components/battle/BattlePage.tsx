'use client';

import { useState } from 'react';
import Link from 'next/link';
import { styled } from '@mui/material/styles';
import type { Battle, Organism } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { battleDisplayName } from '@/lib/battleDisplayName';
import { useAsyncResource } from '@/lib/useAsyncResource';
import BattleHeader from './BattleHeader';

const Body = styled('div')({
  padding: '30px',
  color: 'var(--gol-text-secondary)',
});

const Notice = styled('div')({
  padding: '30px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '12px',
});

const NoticeTitle = styled('h1')({
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
  letterSpacing: 'var(--gol-letter-spacing-title)',
  color: 'var(--gol-text-primary)',
  textTransform: 'uppercase',
});

const NoticeText = styled('p')({
  margin: 0,
  fontSize: '14px',
  color: 'var(--gol-text-secondary)',
});

// Same hover/focus-visible parity the Story 1.9 review established on AppNav: textDecoration is
// kept here rather than removed, so the link is identifiable without relying on colour alone.
const BackLink = styled(Link)({
  fontSize: '14px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--gol-accent)',
  textDecoration: 'none',
  padding: '8px 16px',
  border: '1px solid var(--gol-border-control)',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
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

interface LoadedBattle {
  battle: Battle | null;
  organisms: readonly Organism[];
}

export default function BattlePage({ repositories, battleId }: BattlePageProps) {
  // AR-28: modes are local state, not routes. Epic 2 populates only 'lab' — the setter and the
  // 'run' branch arrive in Epic 3, and until then the route renders no toggle and no fullscreen
  // affordance at all (NFR-4.1: a rendered-but-inert control is worse than an absent one).
  const [mode] = useState<'lab'>('lab');

  // ⚠️ 'new' must never reach battles.load(). It is not a uuid, so the repository would treat it
  // as a plain miss and return null — indistinguishable from a stale/deleted id, which would make
  // /battle/new render "this battle is gone" for a page whose whole purpose is that it does not
  // exist yet. Story 2.2 owns the seeding; this story short-circuits and renders a distinct
  // placeholder for the branch.
  //
  // ⚠️ Promise.all rejects on the FIRST rejection, so one corrupt ORGANISM record blanks the page
  // with "something went wrong" even when the battle itself loaded fine. Accepted for this story
  // — AC4 asks only for a distinct failure state — and recorded rather than discovered in review.
  const resource = useAsyncResource<LoadedBattle>(async () => {
    const [battle, organisms] = await Promise.all([
      battleId === 'new' ? Promise.resolve(null) : repositories.battles.load(battleId),
      repositories.organisms.list(),
    ]);
    return { battle, organisms };
  }, [repositories, battleId]);

  if (resource.status === 'loading') return <BattleLoading />;

  if (resource.status === 'error') {
    return (
      <Notice>
        <NoticeTitle>Something Went Wrong</NoticeTitle>
        <NoticeText>This battle could not be loaded. Its stored data may be damaged.</NoticeText>
        <BackLink href="/">Back to Gallery</BackLink>
      </Notice>
    );
  }

  if (battleId === 'new') {
    return (
      <Notice>
        <NoticeTitle>New Battle</NoticeTitle>
        <NoticeText>There is nothing here yet — creating a battle is not wired up.</NoticeText>
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

  return (
    <>
      <BattleHeader battleTitle={battleDisplayName(battle.name)} />
      {/* The roster IS loaded and held (AC1) — <OrganismRoster> is its consumer in Story 2.9.
          `mode` is read here so the state cell is not merely declared: the Lab chassis, the canvas
          and the sidebar are Stories 2.4/2.9+, and this is the skeleton they mount into. */}
      <Body data-mode={mode}>The battle editor arrives in the next stories.</Body>
    </>
  );
}
