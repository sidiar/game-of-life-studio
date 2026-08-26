'use client';

import { useMemo, useState } from 'react';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS, type Battle, type Organism, type Settings } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { battleDisplayName } from '@/lib/battleDisplayName';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { createNewBattleDraft, type NewBattleDraft } from '@/lib/newBattleDraft';
import { toThumbnailSource } from '@/lib/canvas/battleThumbnail';
import { readGridColors } from '@/lib/canvas/themeColors';
import { BackLink, Notice, NoticeText, NoticeTitle } from '@/components/layout/Notice';
import BattleHeader from './BattleHeader';
import BattleEditorView from './BattleEditorView';

const Body = styled('div')({
  padding: '30px',
  color: 'var(--gol-text-secondary)',
});

// The composition root's own flex column (mockup's `.app-container`, minus the sidebar row this
// story has no content for yet). `<BattleHeader>` is NOT `position: fixed` here (BattleHeader.tsx
// forced decision), so `<BattleEditorView>`'s `flex: 1` needs an actual flex-column ancestor to
// fill the remaining height against, rather than the mockup's `margin-top` offset trick.
const Root = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
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

interface BattleResource {
  battle: Battle | null;
  organisms: readonly Organism[];
}

// Converts a loaded Battle to the SAME shape createNewBattleDraft seeds, so the render below reads
// one shape instead of branching on battleId === 'new' forever (Task 3, Story 2.2).
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
  // — AC4 asks only for a distinct failure state — and recorded rather than discovered in review
  // (deferred-work.md, owned by Story 2.9).
  const battleResource = useAsyncResource<BattleResource>(async () => {
    const [battle, organisms] = await Promise.all([
      battleId === 'new' ? Promise.resolve(null) : repositories.battles.load(battleId),
      repositories.organisms.list(),
    ]);
    return { battle, organisms };
  }, [repositories, battleId]);

  // Task 7 (deferred-work.md:183): LIFTED OUT of the battle/organisms Promise.all entirely,
  // rather than riding inside it with its own `.catch`. Before this story that `.catch` prevented
  // settings.load() from rejecting INTO the shared Promise.all, but did nothing about the reverse
  // problem — organisms.list() rejecting discarded a settings value that had already resolved
  // perfectly, because Promise.all fails the whole combinator on the first rejection regardless of
  // which OTHER promise already settled. A user whose default grid size is 50x30 would silently
  // get 100x60 on /battle/new the moment an unrelated organism record was corrupt. A fully
  // separate resource makes the two failures structurally independent: this one's own `.catch`
  // means its status is always eventually 'ready', never 'error', so it cannot be blanked by
  // anything battleResource does.
  const settingsResource = useAsyncResource<Settings>(
    () => repositories.settings.load().catch(() => DEFAULT_SETTINGS),
    [repositories],
  );
  const settings = settingsResource.data ?? DEFAULT_SETTINGS;

  // Task 6 / deferred-work.md:179 (AC7): the seeded draft used to be rebuilt in the RENDER BODY —
  // 61 array allocations per render at 100x60, with a fresh identity every time, which would make
  // the canvas's `[grid]` effect repaint on every unrelated render. Held here instead, in a hook
  // declared before every early `return` below (the hooks-order trap: `<BattlePage>` returns early
  // four times, and a hook below any of them is a conditional hook — React's error, not a subtle
  // one, but the *fix* people reach for, moving the return, is what would break the branch order
  // the Story 2.1 review fixed). `newDraft` is intentionally unconditional and independent of
  // `battleResource` — it depends only on `settings`, which is what keeps it correct even when
  // organisms.list() has failed (see settingsResource above).
  const newDraft = useMemo<NewBattleDraft | null>(
    () => (battleId === 'new' ? createNewBattleDraft(settings.defaultGridSize) : null),
    [battleId, settings],
  );
  const loadedBattle = battleResource.data?.battle ?? null;
  const loadedDraft = useMemo<NewBattleDraft | null>(
    () => (loadedBattle === null ? null : toDraft(loadedBattle)),
    [loadedBattle],
  );
  // The unified shape (Story 2.2's NewBattleDraft) both branches resolve to. For battleId ===
  // 'new', `newDraft` is always non-null (the memo above always seeds one in that branch); this
  // is null only for a real battle id with no usable battle in hand yet (a genuine load failure,
  // or a real not-found) — which is exactly the distinction the render below needs.
  const draft = battleId === 'new' ? newDraft : loadedDraft;

  // Task 6: `colors` resolved ONCE here (getComputedStyle forces a style recalculation) and
  // passed down, never resolved inside the canvas — the same memoised pattern
  // BattleGallery.tsx:183-185 already establishes. `document` is unavailable during the static
  // export's prerender; guarded rather than gated behind an effect for the same reason the
  // Gallery's version is — `colors` is never read by JSX rendered before a canvas actually mounts.
  const colors = useMemo(
    () => (typeof document === 'undefined' ? null : readGridColors(document.documentElement)),
    [],
  );

  // Task 6: ONE memo derives BOTH the grid and the palette, so both identities are stable
  // together. `toThumbnailSource` already composes `toRenderableGrid` + `buildRefToFillGroup`
  // (Story 1.11) — reused via a structural widening (`lib/canvas/battleThumbnail.ts`) rather than
  // reimplementing the dense->renderable loop or the LUT a second time. `undefined` roster
  // (organisms.list() failed) degrades to an empty roster, matching the "no roster to show yet"
  // reality of this story.
  const organisms = battleResource.data?.organisms;
  const renderable = useMemo(
    () => (draft === null ? null : toThumbnailSource(draft, organisms ?? [])),
    [draft, organisms],
  );

  // Both resources must settle before anything renders — not just battleResource. Without this,
  // a battle that resolves before settings would briefly seed /battle/new at the DEFAULT_SETTINGS
  // fallback grid size before correcting itself the moment settings arrives, which is the exact
  // flash Task 7 exists to prevent, just moved one tick later instead of removed.
  if (battleResource.status === 'loading' || settingsResource.status === 'loading') {
    return <BattleLoading />;
  }

  if (draft === null) {
    // Unreachable for battleId === 'new' — that branch's memo always seeds a draft — so this is
    // only ever a real battle id with no usable battle: either the load genuinely failed (status
    // 'error') or it succeeded and found nothing (a stale/deleted id, or a hand-typed one). "Gone"
    // and "broken" are different facts and offer the user different next moves, so the copy must
    // differ.
    if (battleResource.status === 'error') {
      return (
        <Notice>
          <NoticeTitle>Something Went Wrong</NoticeTitle>
          <NoticeText>This battle could not be loaded. Its stored data may be damaged.</NoticeText>
          <BackLink href="/">Back to Gallery</BackLink>
        </Notice>
      );
    }
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

  // Task 6 (deferred-work.md:189): Task 3 unified the draft TYPE but not the RENDER — this used to
  // be two byte-identical `return`s, each building its own local `draft`. Both arms already
  // resolve to the same `NewBattleDraft` shape, so one render now serves both: the create route
  // (`draft` is `newDraft`, always non-null), and a loaded battle (`draft` is `loadedDraft`, which
  // the guard above has already excluded being null for).
  //
  // `renderable` is non-null here too: it is null only when `draft` is, and that branch already
  // returned above.
  return (
    // mode is read here so the state cell is not merely declared: the sidebar and
    // <EditorStatusBar> are Stories 2.9+, and this is the skeleton they mount into.
    <Root data-mode={mode}>
      <BattleHeader battleTitle={battleDisplayName(draft.name)} />
      {/* renderable is non-null whenever draft is (see the memo above) — the check exists for
          TypeScript, not because the two can disagree at runtime. */}
      {renderable !== null && (
        <BattleEditorView
          grid={renderable.grid}
          size={draft.gridSize}
          palette={renderable.palette}
          showGridLines={settings.gridLines}
          colors={colors}
        />
      )}
    </Root>
  );
}
