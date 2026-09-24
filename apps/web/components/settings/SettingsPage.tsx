'use client';

import { styled } from '@mui/material/styles';
import type {
  AppRepositories,
  BattleRepository,
  OrganismRepository,
  SettingsRepository,
  WorkspaceSerializer,
} from '@gol/persistence';
import { useAsyncResource } from '@/lib/useAsyncResource';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';
import WorkspaceStatistics from './WorkspaceStatistics';
import DataManagement from './DataManagement';

export interface SettingsPageProps {
  settings: SettingsRepository;
  battles: BattleRepository;
  organisms: OrganismRepository;
  seedStatus: WorkspaceSeedStatus;
  // A `Pick`, not the whole aggregate and not a bare function (FD7, Story 5.2). Story 4.1 refused
  // "the unused prop that lies about what the component reads" — `repositories: AppRepositories`
  // would hand this component `clearAll`/`isFreshWorkspace` it does not call (yet; Story 5.10
  // widens this to `'storageUsage' | 'clearAll'` in one token). A bare
  // `storageUsage={repositories.storageUsage}` function prop detaches the method from its object —
  // harmless today (neither implementation uses `this`) and a `this` trap the day one does.
  workspace: Pick<AppRepositories, 'storageUsage'>;
  // The same `Pick` shape as `workspace` above, for the same reason (FD7, Story 5.2): this page
  // hands `<DataManagement>` exactly the one serializer method it calls, never the whole
  // `WorkspaceSerializer` interface — `exportBattle` is Story 5.6's, not something this page or
  // its children call (AC7, Story 5.5).
  serializer: Pick<WorkspaceSerializer, 'exportWorkspace'>;
}

const HEADING_ID = 'settings-heading';

// Mockup: .section-header/.section-title/.section-subtitle (settings.html:88-103,361-364).
// FD6 (Story 5.1) — a THIRD hand copy of BattleGallery.tsx's and OrganismLibrary.tsx's, not a lift: OrganismLibrary.tsx's own header copy (FD9 of Story 4.1)
// defers the lift to "the first story after 3.17 that touches both" BattleGallery and
// OrganismLibrary. This story touches neither, and OrganismLibrary.tsx is the Epic 4 lane's live
// file (4.16-4.22 all edit it) — a lane-5 edit there is a guaranteed merge conflict for a cosmetic
// gain. The lift is now owed to the first story after Epic 4 closes that touches OrganismLibrary.
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

// Mockup: .settings-container (:106-110). Wraps the two cards — Workspace Statistics and Data
// Management (Story 5.5) — a `gap` on a flex column is the mockup's rule, not speculation about a
// future sibling (the Gallery toolbar-band lesson, deferred-work.md:196).
const Container = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  gap: '30px',
});

/**
 * The page-boundary body for `/settings` (Story 5.1). All three repositories are injected,
 * interface-typed (AR-2/AR-27) — this component never imports a concrete repository or calls
 * createRepositories(). All three are READ here (FD3/FD4): battles and organisms feed the
 * Workspace Statistics counts, settings establishes the read-only load this story proves (AC5),
 * and Story 5.10's Clear All needs all three at this same boundary.
 *
 * FD3: the settings load is the page's readiness gate, and it never degrades to
 * DEFAULT_SETTINGS on a rejection — unlike BattleGallery/<BattlePage>, which only ever READ a
 * preference. A rejecting settings.load() renders an alert with no sections, because writing
 * defaults back over a corrupt record on the FIRST Epic 6 save would erase whatever Story 5.11's
 * rescue path could have recovered.
 */
export default function SettingsPage({
  settings,
  battles,
  organisms,
  seedStatus,
  workspace,
  serializer,
}: SettingsPageProps) {
  // Two resources, not one Promise.all (FD3): the counts must re-run on the seed flip (the first
  // list() read hits a pre-seed store — the OrganismLibrary note) but settings has no business
  // re-reading on that flip, and the settings resource is the handle Story 6.3 lifts into editable
  // state. Never .catch(() => DEFAULT_SETTINGS) on the settings load — that is BattleGallery's
  // degrade, and it is wrong on this page.
  //
  // The AR-14 usage meter rides the counts resource (renamed statsResource, Story 5.2 FD6) rather
  // than a third useAsyncResource: it has the counts' EXACT deps. useWorkspaceSeed writes
  // gol:organisms (and the stamp) at this boundary, so a figure measured mid-seed is stale by one
  // organism until the flip re-runs it — the same reason the counts re-run. Its failure mode
  // mirrors FD3: the meter only rejects on a storage-access failure, in which case every list() on
  // this page has already rejected too, so folding it in loses nothing.
  const settingsResource = useAsyncResource(() => settings.load(), [settings]);
  const statsResource = useAsyncResource(
    () => Promise.all([battles.list(), organisms.list(), workspace.storageUsage()]),
    [battles, organisms, workspace, seedStatus],
  );

  const status: 'loading' | 'error' | 'ready' =
    settingsResource.status === 'error' ||
    statsResource.status === 'error' ||
    seedStatus === 'error'
      ? 'error'
      : seedStatus === 'seeding' ||
          settingsResource.status === 'loading' ||
          statsResource.status === 'loading'
        ? 'loading'
        : 'ready';

  // BattleSummary[] / Organism[] — never listFull() (the summaries are the cheap projection,
  // Decision H.4).
  const battleCount = statsResource.data?.[0].length ?? 0;
  const organismCount = statsResource.data?.[1].length ?? 0;
  const storageBytes = statsResource.data?.[2].bytes ?? 0;

  return (
    <section aria-labelledby={HEADING_ID}>
      <SectionHeader>
        <SectionTitle id={HEADING_ID}>Settings</SectionTitle>
        <SectionSubtitle>Configure workspace and preferences</SectionSubtitle>
      </SectionHeader>
      {/* aria-busy scoped to this wrapper only, never the outer <section> — the
          deferred-work.md:192 trap Story 4.1 also avoided. The Data Management card (Story 5.5)
          lives INSIDE this wrapper, gated by the same `ready` fold as Workspace Statistics
          (FD6) — not outside it. */}
      <div aria-busy={status === 'loading'}>
        {status === 'loading' && <StatusText>Loading settings…</StatusText>}
        {status === 'error' && (
          <StatusText role="alert">Something went wrong loading your settings.</StatusText>
        )}
        {status === 'ready' && (
          <Container>
            <WorkspaceStatistics
              battleCount={battleCount}
              organismCount={organismCount}
              storageBytes={storageBytes}
            />
            <DataManagement serializer={serializer} />
          </Container>
        )}
      </div>
    </section>
  );
}
