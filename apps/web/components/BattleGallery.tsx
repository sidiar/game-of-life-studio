'use client';

import { useEffect, useMemo, useState } from 'react';
import { styled } from '@mui/material/styles';
import type { BattleSummary, Organism } from '@gol/domain';
import type { BattleRepository, OrganismRepository } from '@gol/persistence';
import type { WorkspaceSeedStatus } from '@/lib/useWorkspaceSeed';
import { sortByLastModified } from '@/lib/gallerySort';
import { resolveTileOrganisms } from '@/lib/tileOrganisms';
import BattleTile from './BattleTile';

export interface BattleGalleryProps {
  battles: BattleRepository;
  organisms: OrganismRepository;
  seedStatus: WorkspaceSeedStatus;
}

// The load effect's OWN outcome — seedStatus === 'error' is folded in at render time (below)
// rather than by calling setState synchronously from the effect body, which
// react-hooks/set-state-in-effect flags as a cascading-render risk the moment it can be avoided,
// and here it trivially can: the 'error' case needs no data from the effect at all.
type LoadState =
  | { kind: 'idle' }
  | { kind: 'ready'; summaries: BattleSummary[]; roster: Organism[] }
  | { kind: 'error' };

type GalleryState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; summaries: BattleSummary[]; roster: Organism[] };

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

export default function BattleGallery({ battles, organisms, seedStatus }: BattleGalleryProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'idle' });

  useEffect(() => {
    // Gated on seedStatus (silent-failure trap 1): useWorkspaceSeed writes Conway's Classic (and,
    // in dev, the AR-45 fixtures) from a sibling effect. Listing before that resolves returns []
    // and this state would go to 'ready' with zero battles before the seed ever runs. The
    // seedStatus === 'error' case needs no setState here at all — it is folded into `state` below.
    if (seedStatus !== 'ready') return;

    let live = true;

    // Named rather than inlined so the shape Story 1.13's delete flow needs
    // (`await battles.delete(id); …`) is already written; it will have to be lifted out of this
    // effect callback to be callable from a handler, which is that story's change, not this one's.
    // No useAsyncResource — one call site until then.
    function refresh() {
      // One Promise.all, not two sequential awaits: a tile cannot render a name without both, and
      // two round-trips would double the localStorage latency budget (NFR-1.4) for no gain.
      Promise.all([
        battles.list(),
        // A corrupt gol:organisms must not blank a Gallery whose battles are all readable —
        // readCollection throws CorruptDataError for the whole key, and resolveTileOrganisms
        // already degrades an unresolved id to a neutral fallback dot. Without this catch the
        // Promise.all couples the two and discards the persistence layer's deliberate "one bad
        // record must not blank the view" stance (Story 1.4 review). Only battles.list() rejecting
        // is a real error state.
        organisms.list().catch(() => [] as Organism[]),
      ])
        .then(([summaries, roster]) => {
          if (live) setLoadState({ kind: 'ready', summaries, roster });
        })
        .catch(() => {
          if (live) setLoadState({ kind: 'error' });
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
  }, [battles, organisms, seedStatus]);

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
        <SectionTitle id={HEADING_ID}>Battle Gallery</SectionTitle>
        <SectionSubtitle>Your saved cellular competitions</SectionSubtitle>
      </SectionHeader>
      {state.kind === 'loading' && <StatusText>Loading battles…</StatusText>}
      {state.kind === 'error' && (
        <StatusText role="alert">Something went wrong loading your battles.</StatusText>
      )}
      {state.kind === 'ready' && state.summaries.length === 0 && (
        // Deliberately undesigned — Story 1.12 owns the visual, the "what is this app" copy, and
        // the "Create Your First Battle" prompt. This sentence is a placeholder for that story to
        // replace, not merge with.
        <StatusText>No battles yet.</StatusText>
      )}
      {state.kind === 'ready' && state.summaries.length > 0 && (
        <TileGrid>
          {tiles.map(({ summary, organisms: tileOrganisms }) => (
            <BattleTile
              key={summary.id}
              name={summary.name}
              gridSize={summary.gridSize}
              updatedAt={summary.updatedAt}
              organisms={tileOrganisms}
            />
          ))}
        </TileGrid>
      )}
    </section>
  );
}
