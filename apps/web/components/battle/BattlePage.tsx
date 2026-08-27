'use client';

import { useMemo, useState } from 'react';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS, type Battle, type Organism, type Settings } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { battleDisplayName } from '@/lib/battleDisplayName';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { createNewBattleDraft, type NewBattleDraft } from '@/lib/newBattleDraft';
import { buildRefToFillGroup } from '@/lib/canvas/refToFillGroup';
import { toRenderableGrid, type RenderableGrid } from '@/lib/canvas/renderableGrid';
import { readGridColors } from '@/lib/canvas/themeColors';
import { resolveDisplayOrganisms } from '@/lib/displayOrganisms';
import { buildRosterIds } from '@/lib/rosterUnion';
import { DEFAULT_TOOL } from '@/lib/tool';
import { useUndoableGrid } from '@/lib/useUndoableGrid';
import { BackLink, Notice, NoticeText, NoticeTitle } from '@/components/layout/Notice';
import BattleHeader from './BattleHeader';
import BattleEditorView from './BattleEditorView';

const Body = styled('div')({
  padding: '30px',
  color: 'var(--gol-text-secondary)',
});

// The composition root's own flex column (mockup's `.app-container`). The header is this column's
// first row; Story 2.9's sidebar+main row is the second, and it is declared inside
// `<BattleEditorView>` rather than here — the chassis belongs to the Lab view, not to the route.
//
// `<BattleHeader>` is NOT `position: fixed` here (BattleHeader.tsx forced decision), so
// `<BattleEditorView>`'s `flex: 1` needs an actual flex-column ancestor to fill the remaining
// height against, rather than the mockup's `margin-top` offset trick.
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

// Story 2.9 (AC6): the battle and the organism library are two SEPARATE resources now, so this
// combined shape is gone. A `{ battle, organisms }` pair is exactly what forced the `Promise.all`
// that collapsed a corrupt organism record into "this battle is broken".
//
// A stable empty array for the pre-settled roster: `rosterIds` feeds the `palette` memo, which is
// one of `EditDish`'s three construction dependencies, and a fresh `[]` per render would tear the
// retained renderer down on every render (Story 2.5 trap 7).
const NO_ROSTER: readonly string[] = [];

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
  const battleResource = useAsyncResource<Battle | null>(
    () => (battleId === 'new' ? Promise.resolve(null) : repositories.battles.load(battleId)),
    [repositories, battleId],
  );

  // Story 2.9 AC6 (deferred-work.md, owned by this story): the organism library is its OWN
  // resource. It used to ride inside the battle's `Promise.all`, which rejects on the FIRST
  // rejection — so one corrupt ORGANISM record rendered the battle's "Something Went Wrong" body
  // even when the battle itself loaded perfectly, telling the user the wrong thing about the wrong
  // record. That was accepted while nothing rendered the roster; `<OrganismRoster>` makes a
  // partially-usable page worth rendering, so the two failures are now structurally independent —
  // the same shape `settingsResource` below has demonstrated since Story 2.5.
  //
  // ❌ NOT given settings' `.catch(() => fallback)` treatment: a missing organism library is not
  // silently substitutable the way a missing settings record is. Its 'error' status is the fact
  // AC7's degraded roster is built on, so it must survive to the render.
  //
  // ⚠️ Deps stay a FIXED-LENGTH array of referentially stable elements — read `useAsyncResource`'s
  // header before touching any call site here; growing one spins the page forever.
  const organismsResource = useAsyncResource<readonly Organism[]>(
    () => repositories.organisms.list(),
    [repositories],
  );

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
  const loadedBattle = battleResource.data ?? null;
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

  const organisms = organismsResource.data;
  // AC7 (deferred-work.md, owned by this story): the library genuinely failed. Distinct from
  // `organisms === undefined`, which is also true while it is still in flight — collapsing the two
  // is what let `/battle/new` render a fully successful page over a resource in the `error` state,
  // with no alert, no retry and no log.
  const libraryUnavailable = organismsResource.status === 'error';

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

  // Decision H.2's session roster: organisms added to the Lab roster this session but not yet
  // painted. Starts EMPTY — Story 2.10's add-from-library dropdown is its first writer, and 2.13
  // (save + the H.1 prune) is the other. ❌ Never persisted: H.1 prunes at save, which is 2.13's.
  //
  // Story 2.9 forced decision 4: the `DEFAULT_TOOL.organismId` seed is NO LONGER in here. It was
  // seeded unconditionally so the first click resolved to a ref — invisible plumbing while nothing
  // rendered the roster, but a visible, wrong ROW the moment `<OrganismRoster>` ships: opening
  // "Three-Way Skirmish" would list a fourth organism, Conway's Classic, that the user never added
  // and that Decision H says is not part of that battle. It now applies only where it is actually
  // needed — see the union below.
  const [sessionRoster] = useState<readonly string[]>(() => NO_ROSTER);

  // ⚠️ Withheld entirely until the ORGANISM resource has settled (Story 2.9 trap 6). This gate used
  // to key on the BATTLE resource, which was the same thing while one `Promise.all` settled both;
  // splitting them moved its meaning. `buildRefToFillGroup` warns once per roster id with no
  // matching organism (Decision I.4), so a battle that resolves BEFORE the library would otherwise
  // print that diagnostic for every one of its organisms, on every load and on the static export's
  // prerender, about a library that simply had not arrived yet. The e2e's clean-console assertions
  // catch this and the unit tests do not.
  //
  // A settled-but-FAILED library is different: it genuinely is broken, the ids go in, and the
  // degrade-and-warn is the correct, informative behaviour. Nothing renders the canvas before both
  // resources settle (the loading guard below), so the editor never sees the withheld union.
  const rosterSettled = organismsResource.status !== 'loading';

  // `draft.organismIds` first — their ORDER is the dense encoding's own (RFC-006 Decision 2: cell
  // value = roster index + 1), so a session entry may only ever be APPENDED, and the cap keeps the
  // union from reaching a 256th entry `buildRefToFillGroup` would throw on. Both invariants live
  // in `buildRosterIds` with tests of their own (AC8, AC9) rather than inline here, because their
  // failure mode is a silently repainted grid rather than an error.
  //
  // ⚠️ A NEW array, never a push onto `draft.organismIds` — see toDraft above.
  const rosterIds = useMemo<readonly string[]>(() => {
    if (!rosterSettled) return NO_ROSTER;
    const union = buildRosterIds(draft?.organismIds ?? NO_ROSTER, sessionRoster);

    // Forced decision 4, option (b): seed the default tool's organism ONLY when the union would
    // otherwise be empty. That is the one case where the seed still earns its keep — a battle with
    // nothing placed (`/battle/new`, or a saved battle H.1 pruned to nothing) has no first row for
    // `<BattleEditorView>` to select, so without this the dish would be unpaintable until Story
    // 2.10 ships the add dropdown: a user-visible regression this story must not introduce.
    // A battle that places anything keeps a roster of exactly its own placed set (Decision H.1).
    //
    // ⚠️ The coupling this preserves: the seeded id must be whatever `DEFAULT_TOOL` resolves
    // against, so it is read off that constant rather than `CONWAYS_CLASSIC_ID` directly (lib/
    // tool.ts's own trap — two independent constants would drift and leave `refForTool` returning
    // null at every press).
    if (union.length > 0) return union;

    // Story 2.9 review, decision 1 (Sidiar's option (a)): and ONLY when that organism is actually
    // in the library that just loaded.
    //
    // `libraryUnavailable` covers a FAILED `organisms.list()`. A SUCCESSFUL EMPTY one is a
    // different, reachable state — a fresh browser profile, cleared storage, or a bookmarked
    // `/battle/new` opened before the Gallery has ever run the workspace seed (`useWorkspaceSeed`
    // is mounted by the Gallery page, not by this route). Seeding unconditionally there put an id
    // in the roster with no record behind it, so `resolveDisplayOrganisms` fell back and the
    // sidebar rendered a normal, pre-selected, clickable row reading "Unknown organism" — a page
    // reporting no problem while offering a tool that cannot place anything, which is precisely
    // what AC7's degraded notice exists to avoid saying by accident.
    //
    // The trade-off Sidiar accepted: in that narrow window the roster is honestly EMPTY and the
    // dish is honestly unpaintable — `resolveSelectedTool` falls through to the eraser (spec §3.3:
    // "first roster row; eraser when the roster is empty"), and Story 2.10's add dropdown is what
    // makes it paintable again. Better an empty list than a fictional organism.
    //
    // ⚠️ `organisms`, not `roster`: this memo FEEDS `roster`, so reading the resolved list here
    // would be a cycle. `rosterSettled` above already guarantees the resource is not in flight, so
    // `organisms ?? []` is an EMPTY LIBRARY here, never an unarrived one.
    const defaultInLibrary = (organisms ?? []).some(
      (organism) => organism.id === DEFAULT_TOOL.organismId,
    );
    return defaultInLibrary ? buildRosterIds(union, [DEFAULT_TOOL.organismId]) : NO_ROSTER;
  }, [draft, sessionRoster, rosterSettled, organisms]);

  // The roster resolved for DISPLAY — names and identity-shade colours — through the same
  // `displayColor` LUT the dish's own cells go through, which is what keeps a sidebar chip from
  // ever disagreeing with the cells it describes. Resolved once here rather than per consumer
  // (Story 2.9 forced decision 3: one resolver, never two).
  //
  // ⚠️ This is for RENDERING only. `rosterIds` above stays the identity array `refForTool` indexes
  // — `resolveDisplayOrganisms` de-duplicates, so the two can differ in length (trap 2).
  const roster = useMemo(
    () => resolveDisplayOrganisms(rosterIds, organisms ?? []),
    [rosterIds, organisms],
  );

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

  // Story 2.8: THE grid state, and the only one (AC1). `useState` + a `lastSeedRef` re-seed used
  // to live here inline; both moved inside the hook, which now owns the async-seed adoption AND
  // the 30-entry undo ring in one state cell (RFC-005 Decision 6, AR-30). ❌ No second grid state
  // beside it — that is what the hook replaced, not what it joined.
  //
  // The value changes once per COMMITTED gesture (a click, one stroke from Story 2.6, an undo)
  // and never per pointer move: the hot, in-progress state stays in the canvas's refs
  // (project-context, RFC-005 Decision 6).
  //
  // ⚠️ `seedGrid` is null on the FIRST render — every hook here precedes four early returns, and
  // the battle resource has not settled yet. The hook adopts the seed when it arrives and resets
  // the ring when it CHANGES (a different battle), which is what keeps a `useState(seedGrid)`
  // from capturing that null forever and leaving a permanently blank editor.
  const [{ value: grid, commit: commitGrid }, { undo, canUndo }] = useUndoableGrid(seedGrid);

  // Forced decision 4 (Story 2.8): `size` is DERIVED from the grid, not carried separately as
  // `draft.gridSize`. From this story dimensions are a property of every undo snapshot, so two
  // sources for one fact would be two things that can disagree — and when 2.14 makes a resize
  // commit a differently-shaped grid, that disagreement is `assertGridMatchesSize` throwing
  // `GridRendererDimensionMismatchError` out of the canvas's grid effect (unmounting the editor),
  // with `handlePointerDown`'s own dimension guard silently making the dish unpaintable first.
  //
  // Memoised on the two PRIMITIVES, never an inline literal: `size` is one of `EditDish`'s three
  // construction dependencies, so a churning identity there throws away the retained renderer, the
  // grid-line overlay and the dirty baseline on every render (Story 2.5 trap 7).
  const gridCols = grid?.width ?? 0;
  const gridRows = grid?.height ?? 0;
  const size = useMemo(() => ({ cols: gridCols, rows: gridRows }), [gridCols, gridRows]);

  // ALL THREE resources must settle before anything renders. Without this, a battle that resolves
  // before settings would briefly seed /battle/new at the DEFAULT_SETTINGS fallback grid size
  // before correcting itself the moment settings arrives, which is the exact flash Task 7 exists
  // to prevent, just moved one tick later instead of removed — and (Story 2.9) a battle that
  // resolves before the organism library would flash an empty sidebar before its roster appears.
  //
  // ⚠️ 'loading', never 'error' (AC6). A FAILED organism library must fall through to the render
  // below: the battle loaded, the grid is editable, and the roster section says what went wrong
  // (AC7). Gating on anything but 'loading' here would restore the very blanking this story exists
  // to remove.
  if (
    battleResource.status === 'loading' ||
    organismsResource.status === 'loading' ||
    settingsResource.status === 'loading'
  ) {
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
    // mode is read here so the state cell is not merely declared, and so Epic 3's Run mode has a
    // switch to flip on the chassis the Lab sidebar and status bar now hang off.
    <Root data-mode={mode}>
      <BattleHeader battleTitle={battleDisplayName(draft.name)} />
      {/* `grid` is non-null whenever draft is (the seed memo above) — the check exists for
          TypeScript, not because the two can disagree at runtime. */}
      {grid !== null && (
        <BattleEditorView
          grid={grid}
          size={size}
          palette={palette}
          showGridLines={settings.gridLines}
          colors={colors}
          rosterIds={rosterIds}
          roster={roster}
          libraryUnavailable={libraryUnavailable}
          /* The hook's `commit` IS the commit handler (Story 2.8) — a stable identity, exactly as
             the bare `useState` setter it replaced was, which is what lets the canvas's resize
             effect keep holding it in a closure it does not re-register. ❌ No `isDirty` here —
             Story 2.11 owns dirty tracking, and an undo that cleared it would be wrong anyway
             (undoing to the seed is not the same as being saved). */
          onCommitGrid={commitGrid}
          onUndo={undo}
          canUndo={canUndo}
        />
      )}
    </Root>
  );
}
