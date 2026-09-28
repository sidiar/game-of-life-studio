'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS, type BattleSummary, type Organism, type Settings } from '@gol/domain';
import type {
  AppRepositories,
  BattleRepository,
  OrganismRepository,
  SettingsRepository,
} from '@gol/persistence';
import { battleDisplayName } from '@/lib/battleDisplayName';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';
import { sortByLastModified } from '@/lib/gallery/gallerySort';
import { resolveDisplayOrganisms } from '@/lib/displayOrganisms';
import { readGridColors } from '@/lib/canvas/themeColors';
import { pickStorageFailure, UNCLASSIFIED_STORAGE_FAILURE } from '@/lib/storage/storageFailure';
import StorageFailureNotice from '@/components/storage/StorageFailureNotice';
import BattleTile from './BattleTile';
import CreateBattleLink from './CreateBattleLink';
import DeleteBattleDialog, { useDeleteBattleDialog } from './DeleteBattleDialog';
import GalleryEmptyState from './GalleryEmptyState';

export interface BattleGalleryProps {
  battles: BattleRepository;
  organisms: OrganismRepository;
  settings: SettingsRepository;
  seedStatus: WorkspaceSeedStatus;
  /** The seed's rejection (`useWorkspaceSeed`'s `error`), classified beside the load's own. */
  seedError?: unknown;
  /** Story 5.11: offered to the storage-failure notice's Reset Workspace, and nothing else. A
   * `Pick`, never the aggregate (the Story 5.2 FD7 house rule). */
  workspace: Pick<AppRepositories, 'discardUnreadableStamp' | 'clearAll'>;
}

// The load effect's OWN outcome — seedStatus === 'error' is folded in at render time (below)
// rather than by calling setState synchronously from the effect body, which
// react-hooks/set-state-in-effect flags as a cascading-render risk the moment it can be avoided,
// and here it trivially can: the 'error' case needs no data from the effect at all.
type LoadState =
  | { kind: 'idle' }
  | { kind: 'ready'; summaries: BattleSummary[]; roster: Organism[]; settings: Settings }
  | { kind: 'error'; error: unknown };

// requestId identifies one load ATTEMPT, not one load — a fresh object per attempt, not a counter.
// The reducer only ever compares it for identity (===), so "which attempt is newer" never has to
// be encoded; "is this the attempt currently allowed to write status" is all it needs to answer.
interface LoadReducerState {
  status: LoadState;
  requestId: object;
}

type LoadAction =
  | { type: 'start'; requestId: object }
  | {
      type: 'success';
      requestId: object;
      summaries: BattleSummary[];
      roster: Organism[];
      settings: Settings;
    }
  | { type: 'error'; requestId: object; error: unknown }
  // A delete failure discovered OUTSIDE the load flow (handleDeleteFailed) — see its call site.
  | { type: 'invalidate'; error: unknown };

// Centralises the race the ref-based version used to enforce at each call site by convention: a
// resolution only lands if its requestId still matches the reducer's own, so a refresh() left over
// from an earlier reload() — or from React StrictMode's double effect setup — cannot resolve on
// top of a newer attempt or an invalidate(). Code review 2026-08-14 found the failure this
// prevents: a still-in-flight refresh() silently erasing the alert for a delete that actually
// failed.
function loadReducer(state: LoadReducerState, action: LoadAction): LoadReducerState {
  if (action.type === 'invalidate') {
    // Fresh, unmatchable requestId: no in-flight 'success'/'error' can ever satisfy the identity
    // check below again, so this error state is safe from being overwritten by a stale resolution.
    return { status: { kind: 'error', error: action.error }, requestId: {} };
  }
  if (action.type === 'start') {
    // status is deliberately left untouched — see the effect's own comment for why the previous
    // summaries must stay on screen while a reload()'s refetch is in flight.
    return { status: state.status, requestId: action.requestId };
  }
  if (action.requestId !== state.requestId) return state; // superseded — discard
  return {
    status:
      action.type === 'success'
        ? {
            kind: 'ready',
            summaries: action.summaries,
            roster: action.roster,
            settings: action.settings,
          }
        : { kind: 'error', error: action.error },
    requestId: state.requestId,
  };
}

const initialLoadState: LoadReducerState = { status: { kind: 'idle' }, requestId: {} };

type GalleryState =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'ready'; summaries: BattleSummary[]; roster: Organism[]; settings: Settings };

const HEADING_ID = 'battle-gallery-heading';

// Mockup: .section-header/.section-title/.section-subtitle (battle-gallery.html:91-108).
const SectionHeader = styled('div')({
  marginBottom: '35px',
});

const SectionTitle = styled('h1')({
  fontSize: '32px',
  fontWeight: 600,
  margin: '0 0 8px',
  letterSpacing: 'var(--gol-letter-spacing-title)',
  color: 'var(--gol-text-primary)',
});

const SectionSubtitle = styled('p')({
  fontSize: '14px',
  color: 'var(--gol-text-secondary)',
  margin: 0,
});

// Mockup: .toolbar (battle-gallery.html:111-118), but shipping ONLY the create CTA — the mockup's
// search input and Sort-By dropdown are Story 1.10's recorded resolution (spec conflict #3): no
// FR covers battle search, and a five-option sort directly contradicts FR-7.1's fixed "most recent
// first" (lib/gallery/gallerySort.ts). "Ship the mockup's toolbar band, not the mockup's whole toolbar."
const Toolbar = styled('div')({
  marginBottom: '35px',
});

// Native CSS Grid, not MUI Grid (which is flexbox/spacing and cannot express auto-fill, and
// costs bundle we do not have — Task 7). Mockup: .battle-grid (battle-gallery.html:235-240).
const TileGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: '24px',
});

const StatusText = styled('p')({
  color: 'var(--gol-text-secondary)',
});

export default function BattleGallery({
  battles,
  organisms,
  settings,
  seedStatus,
  seedError,
  workspace,
}: BattleGalleryProps) {
  const [loadState, dispatchLoad] = useReducer(loadReducer, initialLoadState);

  // Bumped by reload() (Story 1.13) to re-enter the load effect below without resetting loadState
  // — see the effect's own comment for why a token rather than a lifted refresh().
  const [reloadToken, setReloadToken] = useState(0);

  // Named `reload`, not `refresh`: refresh() is the effect-internal function it re-invokes.
  // Declared above the load effect rather than beside it only so the hook call below — which
  // consumes it — can sit above that effect too, keeping the effect ORDER the delete flow's focus
  // restoration depends on. See useDeleteBattleDialog's own comments.
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Forced decision 3: a rejecting delete (CorruptDataError from an unparseable gol:battles) is
  // reported through the load's error state — since Story 5.11, the classified storage-failure
  // notice. QUEUED here, never published: the hook calls this right after `setDialogOpen(false)`,
  // while the dialog is still EXITING and `useInertBackground` still holds this subtree inert. A
  // notice inserted then is never announced — and it carries a Reset Workspace button (project-
  // context live-region rule; Story 5.11 review, owner ruling D1 (b)). A ref, not state: nothing
  // renders from the queue. Published from `onDeleteDialogExited` below — the Story 4.18
  // queued-outcome shape (`<OrganismLibrary>`'s `queuedCloneErrorRef`).
  const queuedDeleteErrorRef = useRef<{ error: unknown } | null>(null);
  const handleDeleteFailed = useCallback((error: unknown) => {
    queuedDeleteErrorRef.current = { error };
  }, []);

  // Forced decision 4: focus-restoration target after a successful delete. The tile's Delete
  // button that opened the dialog is gone from the DOM by the time the dialog closes, so without
  // an explicit target the browser drops focus to <body> — the same "restarts the tab order at
  // the top of the document" failure the Story 1.10 review found with TooltipTrigger's blur().
  const titleRef = useRef<HTMLHeadingElement>(null);

  // The whole delete confirmation — the dialog's three phases, the in-flight latch, the inert
  // background, the focus restoration — lives in the hook. Called HERE, from the component that
  // renders the dialog, because the hook's effects have to be the dialog's PARENT effects to order
  // correctly against MUI's focus trap; calling it inside <DeleteBattleDialog> would invert that.
  // AC3: only `battles` is handed over, so no path through the confirmation can reach organisms.
  const { requestDelete, dialogProps } = useDeleteBattleDialog({
    battles,
    restoreFocusRef: titleRef,
    onDeleted: reload,
    onDeleteFailed: handleDeleteFailed,
  });

  // The dialog's call site. The hook's own `onExited` FIRST — it clears the confirmation, which
  // releases `inert` — then the publish, in the same event handler so React batches both into ONE
  // commit: the notice is created in the very commit that makes the page live again, never before
  // it (the `onGateExited` reasoning in `<OrganismLibrary>`). Every close path runs this; only a
  // failed delete has queued anything.
  const onDeleteDialogExited = useCallback(() => {
    dialogProps.onExited?.();
    const queued = queuedDeleteErrorRef.current;
    if (queued === null) return;
    queuedDeleteErrorRef.current = null;
    dispatchLoad({ type: 'invalidate', error: queued.error });
  }, [dialogProps]);

  // Resolved ONCE, not per tile: getComputedStyle forces a style recalculation, and at NFR-7.2's
  // 50 tiles that is 50 forced recalcs on one commit if done per-canvas (themeColors.ts).
  // ⚠️ `document` is not available during the static export's prerender — guarded rather than
  // gated behind an effect, because gridColors is never read by the JSX this component renders
  // before a tile actually mounts (Task 5), so a null-during-SSR value cannot produce a hydration
  // mismatch; it only has to avoid throwing during that prerender pass.
  const gridColors = useMemo(
    () => (typeof document === 'undefined' ? null : readGridColors(document.documentElement)),
    [],
  );

  useEffect(() => {
    // Gated on seedStatus (silent-failure trap 1): useWorkspaceSeed writes Conway's Classic (and,
    // in dev, the AR-45 fixtures) from a sibling effect. Listing before that resolves returns []
    // and this state would go to 'ready' with zero battles before the seed ever runs. The
    // seedStatus === 'error' case needs no dispatch here at all — it is folded into `state` below.
    if (seedStatus !== 'ready') return;

    // A fresh identity per effect run — not a ref, not a counter. loadReducer only ever compares
    // it for identity (===) against its own state, so no cleanup flag is needed to cancel a stale
    // resolution: dispatching 'success'/'error' with a superseded requestId is a no-op in the
    // reducer itself, whether the effect that started it has since torn down (a reload(), or
    // StrictMode's second setup) or the component has unmounted (React safely drops dispatches to
    // unmounted components). See loadReducer's own comment for the invalidate() half of this.
    const requestId = {};
    dispatchLoad({ type: 'start', requestId });

    // Named rather than inlined so the shape Story 1.13's delete flow needs
    // (`await battles.delete(id); …`) is already written; it will have to be lifted out of this
    // effect callback to be callable from a handler, which is that story's change, not this one's.
    // No useAsyncResource — one call site until then.
    function refresh() {
      // One Promise.all, not two sequential awaits (now three sources): a tile cannot render a
      // name without the first two, and a serial round-trip per source would multiply the
      // localStorage latency budget (NFR-1.4) for no gain.
      Promise.all([
        battles.list(),
        // NOT caught (Story 5.11): `list()` already SKIPS a per-record failure (Story 1.4 fault
        // isolation), and an unknown id already degrades to a neutral fallback dot — so a
        // rejection here is only ever a WHOLE-namespace failure (the key is not JSON, not an
        // object, or the stamp is unusable or newer). That is exactly what NFR-7.3 says must be
        // reported with a recovery, not papered over with an empty roster.
        organisms.list(),
        // SettingsRepository.load() never returns null (an absent record resolves to
        // DEFAULT_SETTINGS, repositories.ts:48-51), so the catch is only for a corrupt record. KEPT,
        // unlike the organisms catch above, because the Gallery only READS a preference here:
        // blanking every battle over a theme value would be the worse outcome. Only /settings reads
        // settings strictly, and it is where Restore Default Settings lives (Story 5.11 FD5).
        settings.load().catch(() => DEFAULT_SETTINGS),
      ])
        .then(([summaries, roster, loadedSettings]) => {
          dispatchLoad({ type: 'success', requestId, summaries, roster, settings: loadedSettings });
        })
        .catch((error: unknown) => {
          dispatchLoad({ type: 'error', requestId, error });
        });
    }
    refresh();

    // reloadToken is a dependency solely to RE-TRIGGER this effect (Story 1.13's delete flow) —
    // bumping it tears this effect down and sets it back up with a new requestId, so the
    // stale-resolution guard above keeps working unchanged. status is deliberately NOT reset to
    // 'idle' on reload (see loadReducer's 'start' case): the previous summaries stay on screen
    // while the refetch is in flight, which is what makes a delete feel instant rather than
    // swapping the whole Gallery for "Loading battles…" (and re-rendering/re-observing every
    // surviving tile) on every delete.
  }, [battles, organisms, settings, seedStatus, reloadToken]);

  // Derived, not stored: seedStatus === 'error' and loadState.status === 'error' both mean the
  // same thing to the view, and folding them here (rather than writing seedStatus's error into
  // the reducer from the effect) is what avoids the synchronous cascading setState.
  const state: GalleryState =
    seedStatus === 'error' || loadState.status.kind === 'error'
      ? {
          kind: 'error',
          error: loadState.status.kind === 'error' ? loadState.status.error : undefined,
        }
      : loadState.status.kind === 'idle'
        ? { kind: 'loading' }
        : loadState.status;

  // Memoised because resolveDisplayOrganisms builds a Map over the whole roster per tile: done in the
  // render body it is O(tiles x roster) on every render, and it mints a fresh array identity per
  // tile, which would defeat any later memo() on BattleTile.
  const tiles = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const { summaries, roster } = state;

    // De-duplicated by id: list() reads Object.values() and returns each record's own `id` field,
    // never the collection key, so two entries can carry the same id in an imported or hand-edited
    // workspace. That would collide React keys (a console error the gallery e2e asserts against)
    // and leave the sort comparator with no tie-break left to apply.
    const seen = new Set<string>();
    return sortByLastModified(summaries)
      .filter((summary) => {
        if (seen.has(summary.id)) return false;
        seen.add(summary.id);
        return true;
      })
      .map((summary) => ({
        summary,
        organisms: resolveDisplayOrganisms(summary.organismIds, roster),
      }));
  }, [state]);

  return (
    <section aria-labelledby={HEADING_ID} aria-busy={state.kind === 'loading'}>
      <SectionHeader>
        {/* tabIndex={-1}: a legal, non-tab-stop programmatic focus target — see the titleRef
            comment above for why the post-delete restore needs one that isn't the button it
            just removed. */}
        <SectionTitle id={HEADING_ID} ref={titleRef} tabIndex={-1}>
          Battle Gallery
        </SectionTitle>
        <SectionSubtitle>Your saved cellular competitions</SectionSubtitle>
      </SectionHeader>
      {/* Forced decision 2: renders UNCONDITIONALLY across loading/error/empty/ready. It is the
          persistent affordance, not first-run guidance (that is GalleryEmptyState's own CTA) — an
          empty Gallery legitimately shows two controls with the SAME action but DIFFERENT
          accessible names ("+ Create New Battle" vs "Create Your First Battle"), so a screen-reader
          user never hears one name announced twice. */}
      <Toolbar>
        <CreateBattleLink href="/battle/new">+ Create New Battle</CreateBattleLink>
      </Toolbar>
      {state.kind === 'loading' && <StatusText>Loading battles…</StatusText>}
      {/* One alert region for the failure — the notice's own explanation. No heading: the
          page's <h1> stays the only one. An unclassifiable pair (both undefined — e.g. a seed
          that failed with no rejection value) still gets the non-destructive 'unavailable'. */}
      {state.kind === 'error' && (
        <StorageFailureNotice
          {...(pickStorageFailure([seedStatus === 'error' ? seedError : undefined, state.error]) ??
            UNCLASSIFIED_STORAGE_FAILURE)}
          workspace={workspace}
          organisms={organisms}
        />
      )}
      {state.kind === 'ready' && state.summaries.length === 0 && <GalleryEmptyState />}
      {state.kind === 'ready' && state.summaries.length > 0 && (
        <TileGrid>
          {tiles.map(({ summary, organisms: tileOrganisms }) => (
            <BattleTile
              key={summary.id}
              battleId={summary.id}
              name={summary.name}
              gridSize={summary.gridSize}
              updatedAt={summary.updatedAt}
              organisms={tileOrganisms}
              battles={battles}
              roster={state.roster}
              showGridLines={state.settings.gridLines}
              gridColors={gridColors}
              onRequestDelete={() => requestDelete(summary.id, battleDisplayName(summary.name))}
            />
          ))}
        </TileGrid>
      )}
      <DeleteBattleDialog {...dialogProps} onExited={onDeleteDialogExited} />
    </section>
  );
}
