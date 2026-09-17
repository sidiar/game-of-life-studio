'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { styled } from '@mui/material/styles';
import { CONWAYS_CLASSIC_ID } from '@gol/domain';
import type { OrganismRepository } from '@gol/persistence';
import { toDisplayOrganism } from '@/lib/displayOrganisms';
import { normalizeOrganismSearch, organismNameMatches } from '@/lib/organisms/organismNameMatches';
import { sortLibrary } from '@/lib/organisms/sortLibrary';
import { useOrganismEditorModal } from '@/lib/organisms/useOrganismEditorModal';
import { useAsyncResource } from '@/lib/useAsyncResource';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';
import OrganismCard from './OrganismCard';

/**
 * Story 4.3: the Organism Editor is loaded ON DEMAND, exactly as `<BattlePage>` loads
 * `<UnsavedChangesDialog>` and `<BattleEditorView>` loads `<ResizeClipWarningDialog>`. The MUI
 * `Dialog` stack measured **+18.1 KB gzip** when statically imported (Story 1.13, re-confirmed by
 * 2.14); `/organisms` has 11.5 KB of headroom under its 305 KB budget. AR-35 names the editor as
 * *the* example of its "dynamic import for heavy components" rule (RFC-003).
 *
 * `ssr: false` because a closed dialog can never be part of the first paint (`open` is false until
 * a user gesture), so there is nothing for the prerender to render: the flag keeps the module out
 * of the route's SERVER bundle, not out of its HTML — a closed `Dialog` emits no markup either way
 * (the e2e's prerender proof pins that). No `loading` fallback (FD7): the two
 * shipped lazy dialogs render nothing while the chunk resolves, and a spinner for a few
 * milliseconds is chrome nobody asked for.
 */
const OrganismEditorModal = dynamic(() => import('./editor/OrganismEditorModal'), { ssr: false });

export interface OrganismLibraryProps {
  organisms: OrganismRepository;
  seedStatus: WorkspaceSeedStatus;
}

const HEADING_ID = 'organism-library-heading';

// Mockup: .section-header/.section-title/.section-subtitle
// (organism-library.html:88-102) — same shape as BattleGallery's own section header. Duplicated
// rather than shared (FD9): lifting these into components/layout/SectionHeader.tsx is only worth
// doing together with switching BattleGallery to import them too. Story 3.17 (run-from-Gallery,
// the parallel Epic 3 lane) has landed and did not touch BattleGallery.tsx's header, so this is
// still open — do the lift in the first story that touches both files (deferred-work.md).
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
  // The zero-match message quotes the raw query back; a pasted no-space string must wrap rather
  // than push the page into horizontal scroll (Story 4.2 review).
  overflowWrap: 'anywhere',
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

// Mockup: .create-button (organism-library.html:122-139). The one filled control on this page.
// `--gol-accent-hover` is the mockup's literal `#00e5ff` as the token it already is
// (`<EditorStatusBar>`'s SAVE records the same substitution). The mockup's `transform:
// translateY(-1px)` hover lift is kept — a transform is not a colour — but its `transition: all`
// is NOT (the `<SidebarFooter>`/`<EditorStatusBar>` mid-fade axe trap: a scan landing mid-fade
// measures a control at a contrast ratio no settled state has).
const CreateButton = styled('button')({
  background: 'var(--gol-accent)',
  color: 'var(--gol-bg-primary)',
  border: 'none',
  padding: '14px 28px',
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'inherit',
  // The DOM text is sentence case and CSS uppercases it, so the accessible name stays
  // "+ Create New Organism" while the mockup's "+ CREATE NEW ORGANISM" is what renders.
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  '&:hover': {
    background: 'var(--gol-accent-hover)',
    transform: 'translateY(-1px)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
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
 * The page-boundary body for `/organisms`. `organisms` is injected, interface-typed (AR-2/AR-27)
 * — this component never imports a concrete repository or calls createRepositories().
 *
 * Since Story 4.3 it also renders the editor's entry point: the "+ Create New Organism" control
 * and the lazily loaded `<OrganismEditorModal>` it opens. The modal receives no repository yet —
 * nothing to persist until Story 4.16 — and when it does, it will be a prop typed to the
 * interface, passed down from here.
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

  // Called HERE, from the component that renders the modal, because the hook's effects have to be
  // the modal's PARENT effects to order correctly against MUI's focus trap. The hook's own header
  // records why it lives in `lib/organisms/` rather than beside the modal — the dynamic import
  // above is load-bearing and a static import of that module would defeat it.
  const { requestCreate, mounted: editorMounted, modalProps } = useOrganismEditorModal('library');

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
          the create button and the search input must never be withheld from the accessibility
          tree while the list loads, and the input must never unmount under the user's focus
          (deferred-work.md:327's trap, FD4). The count badge is deliberately NOT rendered until
          `ready` — there is no count to announce before the list exists, and an empty live region
          would misreport the page's state. */}
      <Toolbar>
        <ToolbarLeft>
          {/* First in the group, as the mockup has it (:405-406) — so DOM order matches the
              visual order and the button is the toolbar's first Tab stop. Rendered in EVERY
              status: creating an organism does not depend on the list having loaded.
              `data-create-organism` is the focus-restore anchor `useOrganismEditorModal` looks up
              by DOM query once the modal's exit transition ends (never a captured element — WebKit
              does not focus a <button> on click). */}
          <CreateButton type="button" onClick={requestCreate} data-create-organism="">
            + Create New Organism
          </CreateButton>
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
      {/* Gated on `mounted`, not `open`, so the chunk is fetched on the first open only and the
          fade-out completes before unmount (the `useLeaveGuard` contract). The Dialog portals to
          `document.body` regardless of where this sits in the tree. */}
      {/* `sorted` is the same list the cards render, so the editor's default colour is derived
          from exactly what the user sees (Story 4.8); unmemoised because the modal reads it once
          (Story 4.9 reads it per render and that is still one prop). */}
      {editorMounted && <OrganismEditorModal {...modalProps} library={sorted} />}
    </section>
  );
}
