'use client';

import { useMemo, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS, type Battle, type Organism, type Settings } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { battleDisplayName } from '@/lib/battleDisplayName';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { createNewBattleDraft, type NewBattleDraft } from '@/lib/newBattleDraft';
import { buildRefToFillGroup } from '@/lib/canvas/refToFillGroup';
import { toRenderableGrid, type RenderableGrid } from '@/lib/canvas/renderableGrid';
import { readGridColors } from '@/lib/canvas/themeColors';
import { DEFAULT_TOOL } from '@/lib/tool';
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
//
// ⚠️ These two arrays are handed out BY REFERENCE — they are the loaded `Battle` record's own,
// still held inside `battleResource.data`. `NewBattleDraft` used to declare them mutable, so any
// story that wrote `draft.gridState[r][c]` or pushed onto `draft.organismIds` would destroy the
// pristine loaded state in place, leaving nothing to revert to — and it would behave CORRECTLY on
// /battle/new (fresh arrays from createNewBattleDraft) and INCORRECTLY on /battle?id=…, the
// hardest possible shape for a bug to take. Story 2.5 closes that (deferred-work.md) by making
// `NewBattleDraft`'s arrays `readonly` at the TYPE level, so the compiler rejects the write
// instead of a convention having to catch it. Copying here was the alternative and was rejected:
// it costs a 6,000-element clone per load to defend against something the type system can rule
// out for free.
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

  const organisms = battleResource.data?.organisms;

  // Story 2.5 Task 5: the grid and the palette no longer share one memo. Until this story they
  // came from a single `toThumbnailSource(draft, organisms)` call, which was right while both
  // were derived from the same draft — but the grid is now HELD STATE the user edits, and the
  // palette is derived from the roster UNION below rather than from `draft.organismIds`. They no
  // longer share a lifetime or an input, so joining them would only mean one of the two has a
  // reason to churn that the other does not. ❌ Do not widen `toThumbnailSource` further to keep
  // them together.
  const seedGrid = useMemo<RenderableGrid | null>(
    () => (draft === null ? null : toRenderableGrid(draft.gridState)),
    [draft],
  );

  // Decision H.2's session roster. Seeded ONCE, in a lazy initialiser, with the default tool's
  // organism — the union must already contain it before the FIRST click, or `refForTool` resolves
  // to null and the click silently places nothing. Unconditional rather than conditional on
  // `draft.organismIds`: the union below de-duplicates, so seeding it either way produces the same
  // array, and a conditional seed would depend on a `draft` that does not exist on the first
  // render. Nothing sets it in this story — Story 2.9 (add from library) and 2.13 (save + H.1
  // prune) are its writers. ❌ Not persisted here: H.1 prunes at save, which is 2.13's story.
  //
  // review (2026-08-27): back to `DEFAULT_TOOL.organismId`. Widening `Tool` did break this line,
  // but the cause was `DEFAULT_TOOL`'s own `: Tool` annotation, not the union — narrowing the
  // annotation to the organism arm (`lib/tool.ts`) restores the property access AND the coupling
  // that matters here: the seeded roster must contain whatever the DEFAULT TOOL resolves against.
  // Reading `CONWAYS_CLASSIC_ID` directly made them two independent constants, so changing the
  // default tool would leave `refForTool` returning null and the dish silently unpaintable at
  // every press — the exact trap `lib/tool.ts`'s own comment warns about.
  const [sessionRoster] = useState<readonly string[]>(() => [DEFAULT_TOOL.organismId]);

  // `draft.organismIds` first — their ORDER is the dense encoding's own (RFC-006 Decision 2: cell
  // value = roster index + 1), so a session entry may only ever be APPENDED. Re-ordering, or
  // building the union the other way round, would silently repaint every already-placed cell as a
  // different organism.
  //
  // ⚠️ A NEW array, never a push onto `draft.organismIds` — see toDraft above.
  //
  // ⚠️ The session seed is withheld until the battle resource has SETTLED. `buildRefToFillGroup`
  // warns once for a roster id with no matching organism (Decision I.4) — and while the resource
  // is still in flight there is no organism library to match against yet, so seeding early prints
  // that diagnostic on every load, and on the static export's prerender, about nothing at all. A
  // settled-but-failed resource is different: the library genuinely IS broken there, the seed goes
  // in, and the degrade-and-warn is the correct, informative behaviour. Nothing renders the canvas
  // before the resource settles (the loading guard below), so the editor never sees the unseeded
  // union.
  const rosterSettled = battleResource.status !== 'loading';
  const rosterIds = useMemo<readonly string[]>(() => {
    const ids = draft === null ? [] : [...draft.organismIds];
    if (rosterSettled) {
      for (const id of sessionRoster) if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [draft, sessionRoster, rosterSettled]);

  // Built over `rosterIds`, NOT `draft.organismIds` (trap 3). On /battle/new the draft's roster is
  // empty, so a LUT built from it would have `size === 1` while placement writes ref 1 —
  // `colourStateAt` folds every ref >= size to EMPTY with only a warn-once, so the click would
  // appear to do nothing at all: no error, no throw, a fully green test suite, AC1 quietly unmet.
  //
  // Memoised on `rosterIds` + `organisms` because `palette` is one of `EditDish`'s three
  // construction dependencies (PetriDishCanvas.tsx) — a churning identity there throws away the
  // retained renderer, the grid-line overlay, and the dirty baseline AC2 depends on, on every
  // render.
  const palette = useMemo(() => {
    const organismsById = new Map((organisms ?? []).map((o) => [o.id, o] as const));
    return buildRefToFillGroup(rosterIds, organismsById);
  }, [rosterIds, organisms]);

  // The user's edits. State, not a ref: this IS the value React renders, and it changes once per
  // COMMITTED gesture (one click here, one stroke from Story 2.6) — never per pointer move. The
  // hot, in-progress state stays in the canvas's refs (project-context, RFC-005 Decision 6).
  //
  // ⚠️ Held SEPARATELY from the seed rather than `useState(seedGrid)`. Every hook here precedes
  // four early returns, so this one runs on the very first render — a render where the resource is
  // still loading and `seedGrid` is null. `useState(seedGrid)` captures that null forever and the
  // editor stays permanently blank, with no error anywhere. `editedGrid ?? seedGrid` plus the
  // reset below is React's "adjusting state when a prop changes" pattern, and it is what makes a
  // resource that settles AFTER the first render work at all.
  const [editedGrid, setEditedGrid] = useState<RenderableGrid | null>(null);
  const lastSeedRef = useRef<RenderableGrid | null>(null);
  if (lastSeedRef.current !== seedGrid) {
    lastSeedRef.current = seedGrid;
    // A new seed means a different battle (or the first one arriving): the edits belonged to the
    // old one. Setting state during render is deliberate and is the documented pattern — React
    // re-runs the body immediately, and the ref guard above makes the second pass a no-op, so it
    // cannot loop.
    if (editedGrid !== null) setEditedGrid(null);
  }
  const grid = editedGrid ?? seedGrid;

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
  // `grid` is non-null here too: it is null only when `draft` is, and that branch already
  // returned above.
  return (
    // mode is read here so the state cell is not merely declared: the sidebar and
    // <EditorStatusBar> are Stories 2.9+, and this is the skeleton they mount into.
    <Root data-mode={mode}>
      <BattleHeader battleTitle={battleDisplayName(draft.name)} />
      {/* `grid` is non-null whenever draft is (the seed memo above) — the check exists for
          TypeScript, not because the two can disagree at runtime. */}
      {grid !== null && (
        <BattleEditorView
          grid={grid}
          size={draft.gridSize}
          palette={palette}
          showGridLines={settings.gridLines}
          colors={colors}
          rosterIds={rosterIds}
          /* `setEditedGrid` IS the commit handler for this story — passed directly, so its
             identity is stable. ❌ No mini undo ring here: Story 2.8 replaces this with
             `useUndoableGrid` (RFC-005 Decision 6), and Story 2.4's forced decision 2 already
             recorded that instruction. ❌ No `isDirty` either — Story 2.11 owns dirty tracking and
             its own AC covers "given any grid commit, isDirty becomes true". */
          onCommitGrid={setEditedGrid}
        />
      )}
    </Root>
  );
}
