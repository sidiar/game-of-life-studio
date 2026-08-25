'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS, type BattleSummary, type Organism, type Settings } from '@gol/domain';
import type { BattleRepository, OrganismRepository, SettingsRepository } from '@gol/persistence';
import type { WorkspaceSeedStatus } from '@/lib/useWorkspaceSeed';
import { sortByLastModified } from '@/lib/gallerySort';
import { resolveTileOrganisms } from '@/lib/tileOrganisms';
import { readGridColors } from '@/lib/themeColors';
import BattleTile, { battleDisplayName } from './BattleTile';
import DeleteBattleDialog, { useDeleteBattleDialog } from './DeleteBattleDialog';
import GalleryEmptyState from './GalleryEmptyState';

export interface BattleGalleryProps {
  battles: BattleRepository;
  organisms: OrganismRepository;
  settings: SettingsRepository;
  seedStatus: WorkspaceSeedStatus;
}

// The load effect's OWN outcome — seedStatus === 'error' is folded in at render time (below)
// rather than by calling setState synchronously from the effect body, which
// react-hooks/set-state-in-effect flags as a cascading-render risk the moment it can be avoided,
// and here it trivially can: the 'error' case needs no data from the effect at all.
type LoadState =
  | { kind: 'idle' }
  | { kind: 'ready'; summaries: BattleSummary[]; roster: Organism[]; settings: Settings }
  | { kind: 'error' };

type GalleryState =
  | { kind: 'loading' }
  | { kind: 'error' }
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
}: BattleGalleryProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'idle' });

  // Bumped by reload() (Story 1.13) to re-enter the load effect below without resetting loadState
  // — see the effect's own comment for why a token rather than a lifted refresh().
  const [reloadToken, setReloadToken] = useState(0);

  // Bumped whenever something writes loadState from outside the load effect. The effect captures
  // its own value and discards its result if it no longer matches, so a refresh() still in flight
  // from an earlier reload() cannot resolve on top of a newer error — which would silently erase
  // the alert for a delete that actually failed (code review 2026-08-14).
  const loadGenRef = useRef(0);

  // Named `reload`, not `refresh`: refresh() is the effect-internal function it re-invokes.
  // Declared above the load effect rather than beside it only so the hook call below — which
  // consumes it — can sit above that effect too, keeping the effect ORDER the delete flow's focus
  // restoration depends on. See useDeleteBattleDialog's own comments.
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Forced decision 3: a rejecting delete (CorruptDataError from an unparseable gol:battles)
  // reuses the shipped alert body. No retry control, no new copy — see Task 1's "out of scope"
  // note. The dialog is already closed by the time the hook calls this.
  const handleDeleteFailed = useCallback(() => {
    // Bumped so an in-flight refresh() from an earlier reload() cannot resolve 'ready' on top of
    // this and erase the alert for a delete that genuinely failed.
    loadGenRef.current++;
    setLoadState({ kind: 'error' });
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
    // seedStatus === 'error' case needs no setState here at all — it is folded into `state` below.
    if (seedStatus !== 'ready') return;

    let live = true;
    // Paired with loadGenRef: `live` only covers this effect's own teardown, which a setLoadState
    // from an event handler does not trigger. See the ref's declaration.
    const gen = ++loadGenRef.current;

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
        // A corrupt gol:organisms must not blank a Gallery whose battles are all readable —
        // readCollection throws CorruptDataError for the whole key, and resolveTileOrganisms
        // already degrades an unresolved id to a neutral fallback dot. Without this catch the
        // Promise.all couples the two and discards the persistence layer's deliberate "one bad
        // record must not blank the view" stance (Story 1.4 review). Only battles.list() rejecting
        // is a real error state.
        organisms.list().catch(() => [] as Organism[]),
        // SettingsRepository.load() never returns null (an absent record resolves to
        // DEFAULT_SETTINGS, repositories.ts:48-51), so the catch is only for a corrupt record — a
        // corrupt gol:settings must not blank the Gallery either, for the same reason a corrupt
        // gol:organisms does not.
        settings.load().catch(() => DEFAULT_SETTINGS),
      ])
        .then(([summaries, roster, loadedSettings]) => {
          if (live && gen === loadGenRef.current)
            setLoadState({ kind: 'ready', summaries, roster, settings: loadedSettings });
        })
        .catch(() => {
          if (live && gen === loadGenRef.current) setLoadState({ kind: 'error' });
        });
    }
    refresh();

    // `live` is a closure flag, not a ref (unlike useWorkspaceSeed's `hasRun`/`mounted`): this
    // effect re-runs from scratch on StrictMode's second setup, so the closure flag matches the
    // effect's own lifetime — copying the ref pattern here would leave a stale `false` and drop
    // the result.
    return () => {
      live = false;
    };
    // reloadToken is a dependency solely to RE-TRIGGER this effect (Story 1.13's delete flow) —
    // bumping it tears the effect down (live = false in cleanup) and sets it back up, so the
    // in-flight-response cancellation above keeps working unchanged. loadState is deliberately
    // NOT reset to 'idle' on reload: the previous summaries stay on screen while the refetch is in
    // flight, which is what makes a delete feel instant rather than swapping the whole Gallery for
    // "Loading battles…" (and re-rendering/re-observing every surviving tile) on every delete.
  }, [battles, organisms, settings, seedStatus, reloadToken]);

  // Derived, not stored: seedStatus === 'error' and loadState === 'error' both mean the same
  // thing to the view, and folding them here (rather than writing seedStatus's error into
  // loadState from the effect) is what avoids the synchronous cascading setState.
  const state: GalleryState =
    seedStatus === 'error' || loadState.kind === 'error'
      ? { kind: 'error' }
      : loadState.kind === 'idle'
        ? { kind: 'loading' }
        : loadState;

  // Memoised because resolveTileOrganisms builds a Map over the whole roster per tile: done in the
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
        organisms: resolveTileOrganisms(summary.organismIds, roster),
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
      {state.kind === 'loading' && <StatusText>Loading battles…</StatusText>}
      {state.kind === 'error' && (
        <StatusText role="alert">Something went wrong loading your battles.</StatusText>
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
      <DeleteBattleDialog {...dialogProps} />
    </section>
  );
}
