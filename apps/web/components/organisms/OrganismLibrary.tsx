'use client';

import { useState } from 'react';
import { styled } from '@mui/material/styles';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import type { OrganismRepository } from '@gol/persistence';
import { toDisplayOrganism } from '@/lib/displayOrganisms';
import { normalizeOrganismSearch, organismNameMatches } from '@/lib/organisms/organismNameMatches';
import { sortLibrary } from '@/lib/organisms/sortLibrary';
import { useAsyncResource } from '@/lib/useAsyncResource';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';
import OrganismCard from './OrganismCard';

export interface OrganismLibraryProps {
  organisms: OrganismRepository;
  seedStatus: WorkspaceSeedStatus;
}

const HEADING_ID = 'organism-library-heading';

// Mockup: .section-header/.section-title/.section-subtitle
// (organism-library.html:88-102) — same shape as BattleGallery's own section header. Duplicated
// rather than shared (FD9): lifting these into components/layout/SectionHeader.tsx is only worth
// doing together with switching BattleGallery to import them too, which is Story 3.17's surface
// (run-from-Gallery) in the parallel Epic 3 lane — do the lift in the first story after 3.17 that
// touches both.
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

const StatusText = styled('p')({
  color: 'var(--gol-text-secondary)',
});

// Mockup: .toolbar (organism-library.html:105-113). The FULL band rules ship on day one — unlike
// BattleGallery's toolbar band, which shipped `marginBottom`-only (`deferred-work.md`'s "toolbar
// band ships without the mockup's layout rules" entry), this toolbar has two children
// (search + count badge) from the start and needs the real flex layout.
const Toolbar = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '20px',
  flexWrap: 'wrap',
  marginBottom: '35px',
});

const ToolbarLeft = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '15px',
  flex: 1,
});

// Mockup: .search-container (:139-142).
const SearchField = styled('div')({
  position: 'relative',
  flex: 1,
  maxWidth: '400px',
});

// Mockup: .search-input (:144-167), with the house substitutions `BattleNameField.tsx:14-19`
// records: `--gol-border-control` (SC 1.4.11 — the mockup's `--border` measures only 1.57:1, below
// the 3:1 a control boundary needs), a real `:focus-visible` ring rather than the mockup's
// border-only focus swap, enumerated `border-color` transition + `prefers-reduced-motion` escape
// (never `transition: all`), and `--gol-text-secondary` placeholder text at 0.8 opacity rather
// than the mockup's `--text-tertiary` literal.
const SearchInput = styled('input')({
  width: '100%',
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 40px 12px 16px',
  fontSize: '14px',
  fontFamily: 'inherit',
  transition: 'border-color 0.2s',
  '&::placeholder': {
    color: 'var(--gol-text-secondary)',
    opacity: 0.8,
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
    borderColor: 'var(--gol-accent)',
    background: 'var(--gol-bg-hover)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// Mockup: .search-icon (:169-176). `pointer-events: none` so the glyph never intercepts a click
// aimed at the input beneath it.
const SearchIcon = styled('span')({
  position: 'absolute',
  right: '14px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--gol-text-tertiary)',
  fontSize: '16px',
  pointerEvents: 'none',
});

// Mockup: .organism-count (:179-189). The one live region on the page (FD4) — SC 4.1.3 wants
// filter results announced, and the roster's zero-match message is deliberately NOT live
// (`deferred-work.md:327` records what that cost); announcing the zero-match text as well would
// double-announce the same result.
const CountBadge = styled('span')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '10px 14px',
  whiteSpace: 'nowrap',
});

// Mockup: .organism-grid (:191-197).
const CardGrid = styled('ul')({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '24px',
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

/** `4 Organisms` / `1 Organism` with no query, `2 of 4 Organisms` / `0 of 1 Organism` filtering. */
function organismCountLabel(shown: number, total: number, filtering: boolean): string {
  const suffix = `Organism${total === 1 ? '' : 's'}`;
  return filtering ? `${shown} of ${total} ${suffix}` : `${total} ${suffix}`;
}

/**
 * The page-boundary body for `/organisms` (AC1-AC7). `organisms` is injected, interface-typed
 * (AR-2/AR-27) — this component never imports a concrete repository or calls createRepositories().
 *
 * No `battles` prop yet: RFC-005's tree gives the Library both repositories for the usage index,
 * but that index is Story 4.19's — an unused prop today would be a lie about what this component
 * reads.
 */
export default function OrganismLibrary({ organisms, seedStatus }: OrganismLibraryProps) {
  // Deps: `organisms` is useMemo-stable from the page boundary; `seedStatus` is a string — both
  // satisfy useAsyncResource's stable/fixed-length precondition. Re-running list() on the
  // seedStatus flip is deliberate (Story 4.1): while seeding, the first read hits a pre-seed
  // store, so the dep re-runs it once the seed settles — one cheap extra localStorage read
  // (NFR-1.4) rather than threading a "skip" flag through the hook.
  const resource = useAsyncResource(() => organisms.list(), [organisms, seedStatus]);

  // Ephemeral UI state only (RFC-005 Decision 1) — never persisted, never in a ref: this is not
  // hot simulation state.
  const [searchText, setSearchText] = useState('');

  // Folded at render, exactly as BattleGallery folds seedStatus against its own load state
  // (Story 4.1) — never written into the resource itself, which would risk a cascading setState.
  const status: 'loading' | 'error' | 'ready' =
    seedStatus === 'error' || resource.status === 'error'
      ? 'error'
      : seedStatus === 'seeding' || resource.status === 'loading'
        ? 'loading'
        : 'ready';

  // AC3's grid order is a pure, unit-tested function (`sortLibrary`) — never `Object.values`
  // insertion order (FD2). AC4's filter matches on the DISPLAYED name, via the same
  // `organismNameMatches` predicate `<OrganismRoster>` uses (resolving `deferred-work.md:335`),
  // so `Unnamed organism` is searchable as what the user actually sees.
  //
  // ⚠️ UNMEMOISED, ON PURPOSE — the identical per-render-scan measurement `<OrganismRoster>`'s
  // `<OrganismSearchAdd>` already closed for this exact shape of predicate over an uncapped
  // library (`deferred-work.md:337`, ~0.02-0.04 ms for 1,000 organisms): far past any realistic
  // workspace, and roughly one keystroke's worth of budget for a scan that runs once per render.
  const sorted = sortLibrary(resource.data ?? []);
  const query = normalizeOrganismSearch(searchText);
  const visible =
    query === ''
      ? sorted
      : sorted.filter((organism) => organismNameMatches(toDisplayOrganism(organism).name, query));

  return (
    <section aria-labelledby={HEADING_ID}>
      <SectionHeader>
        <SectionTitle id={HEADING_ID}>Organism Library</SectionTitle>
        <SectionSubtitle>Create and manage your life forms</SectionSubtitle>
      </SectionHeader>
      {/* OUTSIDE the aria-busy wrapper below (deferred-work.md:187's mistake, not repeated here):
          the search input and the count badge must never be withheld from the accessibility tree
          while the list loads, and the input must never unmount under the user's focus
          (deferred-work.md:327's trap, FD4). */}
      <Toolbar>
        <ToolbarLeft>
          <SearchField role="search">
            <SearchInput
              type="text"
              placeholder="Search organisms..."
              aria-label="Search organisms"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <SearchIcon aria-hidden="true">⌕</SearchIcon>
          </SearchField>
          {/* Create-button slot: Story 4.3 adds "+ Create New Organism" here. Empty until then —
              a button that does nothing is a dead affordance (NFR-4.1). */}
        </ToolbarLeft>
        {status === 'ready' && (
          <CountBadge role="status">
            {organismCountLabel(visible.length, sorted.length, query !== '')}
          </CountBadge>
        )}
      </Toolbar>
      <div aria-busy={status === 'loading'}>
        {status === 'loading' && <StatusText>Loading organisms…</StatusText>}
        {status === 'error' && (
          <StatusText role="alert">Something went wrong loading your organisms.</StatusText>
        )}
        {status === 'ready' &&
          (visible.length === 0 && query !== '' ? (
            // The search input stays in the toolbar above, so it survives this branch with focus
            // intact (deferred-work.md:327's exact failure, not repeated here).
            <StatusText>No organisms match “{searchText}”.</StatusText>
          ) : (
            // `visible.length === 0 && query === ''` cannot happen — the library is never empty
            // (M9, Conway's Classic is always present) — so no branch exists for it.
            <CardGrid role="list" aria-label="Organisms">
              {visible.map((organism) => (
                <li key={organism.id}>
                  <OrganismCard organism={organism} system={organism.id === CONWAYS_CLASSIC_ID} />
                </li>
              ))}
            </CardGrid>
          ))}
      </div>
    </section>
  );
}
