'use client';

import { styled } from '@mui/material/styles';
import type { OrganismRepository } from '@gol/persistence';
import { useAsyncResource } from '@/lib/useAsyncResource';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';

export interface OrganismLibraryProps {
  organisms: OrganismRepository;
  seedStatus: WorkspaceSeedStatus;
}

const HEADING_ID = 'organism-library-heading';

// Mockup: .section-header/.section-title/.section-subtitle
// (organism-library.html:88-102) — same shape as BattleGallery's own section header. Duplicated
// rather than shared (Task 3): lifting these into components/layout/SectionHeader.tsx is only
// worth doing together with switching BattleGallery to import them too, and that is not this
// change (Story 4.2 note).
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

/**
 * The page-boundary body for `/organisms` (AC3/AC4). `organisms` is injected, interface-typed
 * (AR-2/AR-27) — this component never imports a concrete repository or calls createRepositories().
 *
 * No `battles` prop yet: RFC-005's tree gives the Library both repositories for the usage index,
 * but that index is Story 4.19's — an unused prop today would be a lie about what this component
 * reads (Task 3).
 *
 * The rendered `<ul>` is the interim body FR-1.1's name half ships here; Story 4.2 replaces it
 * wholesale with the card grid (colour chip, hover states, search, count badge) — FD5.
 */
export default function OrganismLibrary({ organisms, seedStatus }: OrganismLibraryProps) {
  // Deps: `organisms` is useMemo-stable from the page boundary; `seedStatus` is a string — both
  // satisfy useAsyncResource's stable/fixed-length precondition. Re-running list() on the
  // seedStatus flip is deliberate (Task 3): while seeding, the first read hits a pre-seed store,
  // so the dep re-runs it once the seed settles — one cheap extra localStorage read (NFR-1.4)
  // rather than threading a "skip" flag through the hook.
  const resource = useAsyncResource(() => organisms.list(), [organisms, seedStatus]);

  // Folded at render, exactly as BattleGallery folds seedStatus against its own load state
  // (Task 3) — never written into the resource itself, which would risk a cascading setState.
  const status: 'loading' | 'error' | 'ready' =
    seedStatus === 'error' || resource.status === 'error'
      ? 'error'
      : seedStatus === 'seeding' || resource.status === 'loading'
        ? 'loading'
        : 'ready';

  return (
    <section aria-labelledby={HEADING_ID}>
      <SectionHeader>
        <SectionTitle id={HEADING_ID}>Organism Library</SectionTitle>
        <SectionSubtitle>Create and manage your life forms</SectionSubtitle>
      </SectionHeader>
      {/* aria-busy scoped to this wrapper only (deferred-work.md:187's mistake, not repeated
          here): the section itself will host 4.2's search box and 4.3's create button, and
          neither may be withheld from the accessibility tree while the list loads. */}
      <div aria-busy={status === 'loading'}>
        {status === 'loading' && <StatusText>Loading organisms…</StatusText>}
        {status === 'error' && (
          <StatusText role="alert">Something went wrong loading your organisms.</StatusText>
        )}
        {status === 'ready' && (
          <ul aria-label="Organisms">
            {(resource.data ?? []).map((organism) => (
              <li key={organism.id}>{organism.name}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
