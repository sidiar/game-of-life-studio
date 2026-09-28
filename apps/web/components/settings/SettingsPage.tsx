'use client';

import { styled } from '@mui/material/styles';
import type {
  AppRepositories,
  BattleRepository,
  OrganismRepository,
  SettingsRepository,
  WorkspaceMetaRepository,
  WorkspaceSerializer,
} from '@gol/persistence';
import { useAsyncResource } from '@/lib/useAsyncResource';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';
import { pickStorageFailure, UNCLASSIFIED_STORAGE_FAILURE } from '@/lib/storage/storageFailure';
import StorageFailureNotice from '@/components/storage/StorageFailureNotice';
import WorkspaceStatistics from './WorkspaceStatistics';
import DataManagement from './DataManagement';

export interface SettingsPageProps {
  settings: SettingsRepository;
  battles: BattleRepository;
  organisms: OrganismRepository;
  seedStatus: WorkspaceSeedStatus;
  /** The seed's rejection (`useWorkspaceSeed`'s `error`), classified beside the reads' own. */
  seedError?: unknown;
  // A `Pick`, not the whole aggregate and not a bare function (FD7, Story 5.2). Story 4.1 refused
  // "the unused prop that lies about what the component reads" — `repositories: AppRepositories`
  // would hand this component `isFreshWorkspace` it does not call. Story 5.10 widens this to
  // `'storageUsage' | 'clearAll'` — Clear All needs `organisms` and this one token, never
  // `settings` (Decision F makes the settings repository unreachable from this path). A bare
  // `storageUsage={repositories.storageUsage}` function prop detaches the method from its object —
  // harmless today (neither implementation uses `this`) and a `this` trap the day one does.
  // Story 5.11 widens it by `discardUnreadableStamp` — the storage-failure notice's Reset
  // Workspace (`recoverWorkspace()`), still never `settings`.
  workspace: Pick<AppRepositories, 'storageUsage' | 'clearAll' | 'discardUnreadableStamp'>;
  // The same `Pick` shape as `workspace` above, for the same reason (FD7, Story 5.2): this page
  // hands `<DataManagement>` exactly the serializer methods it (and its Story 5.9 `<ImportWorkspaceRow>`
  // child) call, never the whole `WorkspaceSerializer` interface — `exportBattle` is Story 5.6's,
  // not something this page or its children call (AC7, Story 5.5; widened for `importWorkspace`,
  // Story 5.9 Task 5.2).
  serializer: Pick<WorkspaceSerializer, 'exportWorkspace' | 'importWorkspace'>;
  /** Story 7.2: the workspace description's port, handed through to `<DataManagement>` — a
   * `Pick`, like every prop here. */
  workspaceMeta: Pick<WorkspaceMetaRepository, 'load' | 'save'>;
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
 * Workspace Statistics counts, and settings establishes the read-only load this story proves
 * (AC5). Story 5.10's Clear All needs `organisms` and the `workspace` aggregate at this same
 * boundary — NOT `settings`: Decision F makes the settings repository unreachable from that path,
 * and this component never passes it down to `<DataManagement>`'s Clear All row.
 *
 * FD3: the settings load is the page's readiness gate, and it never degrades to
 * DEFAULT_SETTINGS on a rejection — unlike BattleGallery/<BattlePage>, which only ever READ a
 * preference. A rejecting settings.load() renders the storage-failure notice with no sections,
 * because writing defaults back over a corrupt record IMPLICITLY — on the first Epic 6 save —
 * would erase it without the user ever choosing to. Story 5.11's rescue path is that notice's
 * Restore Default Settings: the same write, but only on an explicit click (FD5), and it touches no
 * battle or organism. This page is the only one that reads settings strictly, so it is the only
 * one that can show the corrupt-settings kind.
 */
export default function SettingsPage({
  settings,
  battles,
  organisms,
  seedStatus,
  seedError,
  workspace,
  serializer,
  workspaceMeta,
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
        {/* Story 5.11: one notice for up to three failed sources, at FD2's priority — so a
            seed-write quota failure reads storage-full, never "damaged" (the one-alert-string
            problem the deferred-work entry recorded). No heading: the page's <h1> stays the only one. */}
        {status === 'error' && (
          <StorageFailureNotice
            {...(pickStorageFailure([
              seedStatus === 'error' ? seedError : undefined,
              statsResource.error,
              settingsResource.error,
            ]) ?? UNCLASSIFIED_STORAGE_FAILURE)}
            workspace={workspace}
            organisms={organisms}
            settings={settings}
          />
        )}
        {status === 'ready' && (
          <Container>
            <WorkspaceStatistics
              battleCount={battleCount}
              organismCount={organismCount}
              storageBytes={storageBytes}
            />
            <DataManagement
              serializer={serializer}
              workspace={workspace}
              battles={battles}
              organisms={organisms}
              workspaceMeta={workspaceMeta}
              onImported={statsResource.reload}
              onCleared={statsResource.reload}
            />
          </Container>
        )}
      </div>
    </section>
  );
}
