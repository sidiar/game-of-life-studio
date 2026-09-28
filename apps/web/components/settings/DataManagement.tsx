'use client';

import { useEffect, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import type {
  AppRepositories,
  BattleRepository,
  OrganismRepository,
  WorkspaceSerializer,
} from '@gol/persistence';
import { exportWorkspaceToFile } from '@/lib/export/exportWorkspaceToFile';
import { Card, CardTitle, Row, RowDescription, RowInfo, RowLabel } from './SettingsCard';
import ImportWorkspaceRow from './ImportWorkspaceRow';
import ClearAllDataRow from './ClearAllDataRow';

export interface DataManagementProps {
  // A `Pick`, not the whole interface (FD7 of Story 5.2, AR-2/27) — this card's subtree needs
  // exactly two serializer methods and should not be able to reach for another. It calls neither
  // directly: `exportWorkspaceToFile` calls `exportWorkspace`, and `importWorkspace` is passed
  // through to `<ImportWorkspaceRow>`, Story 5.9's second row.
  serializer: Pick<WorkspaceSerializer, 'exportWorkspace' | 'importWorkspace'>;
  // Story 5.10's Clear All row needs `clearAll` alongside the serializer above (AR-2/27 — never
  // the whole aggregate).
  workspace: Pick<AppRepositories, 'clearAll'>;
  /** Story 5.9: the pristine-workspace check's `battleCount` half (AC4). */
  battles: Pick<BattleRepository, 'list'>;
  // Story 5.9's pristine check needs `list`; Story 5.10's reset needs `exists`/`save` — widened to
  // the union both rows require (FD2, still never the whole `OrganismRepository`).
  organisms: Pick<OrganismRepository, 'list' | 'exists' | 'save'>;
  /** Story 5.9 AC6: fired after a successful import so `<SettingsPage>` can refresh its counts. */
  onImported(): void;
  /** Story 5.10 AC5: fired after Clear All settles (success or failure, FD3) for the same reload. */
  onCleared(): void;
}

const DATA_MANAGEMENT_HEADING_ID = 'data-management-heading';

// Mockup: .settings-group / .settings-item (settings.html:139-157, 392-403). Export, Import
// (Story 5.9) and Clear All Data (Story 5.10) — Auto-Save arrives in 6.10 (FD7 — no dead
// affordance, and no card-level description paragraph promising it either).

// Mockup: .btn (settings.html:181-198), plus .settings-item-control's `flex-shrink: 0` (:176-178)
// so the button never shrinks at narrow widths — the house primary-button idiom
// `OrganismLibrary.tsx`'s `CreateButton` carries, COPIED here rather than imported (FD10: that file is the Epic 4 lane's
// live file, and 5.1 FD6 already refused to touch it for the same lane-boundary reason). No
// `transition: all` (the mid-fade axe trap every hover-button component in this codebase avoids)
// and no `disabled` — FD8: this button never self-disables, so keyboard focus never drops to
// `<body>` mid-export.
const ExportButton = styled('button')({
  background: 'var(--gol-accent)',
  color: 'var(--gol-bg-primary)',
  border: 'none',
  padding: '12px 24px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background-color 0.2s',
  '&:hover': {
    background: 'var(--gol-accent-hover)',
    transform: 'translateY(-1px)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// `--gol-danger` on `--gol-bg-secondary` (this card's own background) is one of the pairs
// `themeTokens.test.ts` gates at >=4.5:1 — the same pair `<BattleEditorView>`'s `SaveErrorLine`
// uses for a refused save.
const ErrorText = styled('p')({
  margin: '15px 0 0',
  fontSize: '13px',
  lineHeight: 1.5,
  color: 'var(--gol-danger)',
});

const EXPORT_ERROR_MESSAGE =
  'Your workspace could not be exported. Nothing was changed — try again.';

/**
 * The Data Management card (AC1, Story 5.5) — the first control this page renders, alongside
 * Workspace Statistics. Three rows: Export Workspace, Import (Story 5.9's `<ImportWorkspaceRow>`)
 * and Clear All Data (Story 5.10's `<ClearAllDataRow>`) — each its own component rather than
 * folded in here, since a third row's worth of state does not belong in Export's.
 *
 * FD8: re-entrancy without self-disabling. A `useRef<boolean>` in-flight flag makes a second click
 * while an export is running a no-op, WITHOUT `disabled` on the focused button — `deferred-work.md`
 * records the exact keyboard-focus trap `disabled` causes for the editor's and the preview's Clear
 * buttons (Stories 2.15 / 4.14).
 *
 * Unmount safety follows `useAsyncResource.ts`'s closure-flag reasoning, adapted for an event
 * handler rather than an effect: a mounted ref (not a closure variable — the promise here is
 * started by a click, not synced to an effect's own lifecycle) is flipped false in a cleanup-only
 * effect, and the click handler checks it before calling `setState` on the settled promise.
 */
export default function DataManagement({
  serializer,
  workspace,
  battles,
  organisms,
  onImported,
  onCleared,
}: DataManagementProps) {
  const [hasError, setHasError] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Re-armed on every setup, not only initialised by `useRef(true)`: StrictMode (the dev
    // default) runs setup → cleanup → setup, and a cleanup-only effect would leave the ref false
    // for the component's whole life — silently suppressing the AC8 alert in `next dev`. The same
    // reset `useWorkspaceSeed.ts` carries for the same reason.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleExportClick() {
    // A second click while an export is in flight does nothing — no second exportWorkspace()
    // call, and the pending export's own outcome (success or the alert) still lands normally.
    if (pendingRef.current) return;

    pendingRef.current = true;
    setHasError(false); // clears any alert from a previous, now-superseded attempt

    try {
      await exportWorkspaceToFile(serializer);
    } catch {
      // No `error.message`, no stack trace — plain, non-technical copy only (AC8). Export is
      // read-only, so "nothing was changed" is simply true, not a hedge.
      if (mountedRef.current) setHasError(true);
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <Card aria-labelledby={DATA_MANAGEMENT_HEADING_ID}>
      <CardTitle id={DATA_MANAGEMENT_HEADING_ID}>Data Management</CardTitle>
      <Row>
        <RowInfo>
          <RowLabel>Export Workspace</RowLabel>
          <RowDescription>
            Download a JSON file containing all your battles and organisms for backup or transfer
          </RowDescription>
        </RowInfo>
        <ExportButton type="button" aria-label="Export workspace" onClick={handleExportClick}>
          Export
        </ExportButton>
      </Row>
      {hasError && <ErrorText role="alert">{EXPORT_ERROR_MESSAGE}</ErrorText>}
      <ImportWorkspaceRow
        serializer={serializer}
        battles={battles}
        organisms={organisms}
        onImported={onImported}
      />
      <ClearAllDataRow workspace={workspace} organisms={organisms} onCleared={onCleared} />
    </Card>
  );
}
