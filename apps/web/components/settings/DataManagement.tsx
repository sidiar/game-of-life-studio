'use client';

import { useEffect, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import type {
  AppRepositories,
  BattleRepository,
  OrganismRepository,
  WorkspaceMetaRepository,
  WorkspaceSerializer,
} from '@gol/persistence';
import { exportWorkspaceToFile } from '@/lib/export/exportWorkspaceToFile';
import {
  Card,
  CardTitle,
  Row,
  RowDescription,
  RowInfo,
  RowLabel,
  type RowOutcome,
} from './SettingsCard';
import ImportWorkspaceRow from './ImportWorkspaceRow';
import LoadPresetRow from './LoadPresetRow';
import ClearAllDataRow from './ClearAllDataRow';
import WorkspaceDescriptionRow from './WorkspaceDescriptionRow';

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
  /** Story 7.2: the workspace description row edits it, and the Import row's pristine check reads
   * it (FD6) — the union both need, never the aggregate. */
  workspaceMeta: Pick<WorkspaceMetaRepository, 'load' | 'save'>;
  /** Story 5.9 AC6: fired after a successful import so `<SettingsPage>` can refresh its counts. */
  onImported(): void;
  /** Story 5.10 AC5: fired after Clear All settles (success or failure, FD3) for the same reload. */
  onCleared(): void;
}

/**
 * Review Finding D2 (owner ruling a): the single outcome slot for the whole card. Every row
 * writes here instead of rendering its own status/alert, so a new flow started in ANY row
 * (including this component's own Export handler) replaces whatever the previous row left behind
 * — the bug the finding described was a successful Import's status line still on screen,
 * unchanged and now false, after a later Clear All. It also means an unscoped
 * `getByRole('status')` is unambiguous again once more than one row can produce an outcome.
 */
type DataManagementMessage = RowOutcome | null;

/** Which of the card's flows an outcome belongs to — the slot's owner. */
type OutcomeSource = 'description' | 'export' | 'import' | 'preset' | 'clear';

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
// uses for a refused save. Review Finding D2 (owner ruling a): this is now the CARD's one shared
// alert style, rendered once for whichever row last wrote to `message` — Export, Import or Clear
// All alike — rather than a copy each row owned.
const ErrorText = styled('p')({
  margin: '15px 0 0',
  fontSize: '13px',
  lineHeight: 1.5,
  color: 'var(--gol-danger)',
});

// `--gol-text-secondary` — the same gated pair Import's and Clear All's own success text used
// before D2 lifted it here as the card's one shared status style.
const SuccessText = styled('p')({
  margin: '15px 0 0',
  fontSize: '13px',
  lineHeight: 1.5,
  color: 'var(--gol-text-secondary)',
});

const EXPORT_ERROR_MESSAGE =
  'Your workspace could not be exported. Nothing was changed — try again.';

/**
 * The Data Management card (AC1, Story 5.5) — the first control this page renders, alongside
 * Workspace Statistics. Five rows: the workspace description (Story 7.2's
 * `<WorkspaceDescriptionRow>`), Export Workspace, Import (Story 5.9's `<ImportWorkspaceRow>`),
 * Load Preset (Story 7.5's `<LoadPresetRow>`) and Clear All Data (Story 5.10's `<ClearAllDataRow>`)
 * — each its own component rather than folded in here, since a third row's worth of state does
 * not belong in Export's.
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
 *
 * Review Finding D2 (owner ruling a): this component, not any one row, owns `message` — the
 * card's single "last outcome" slot. Export's own handler and both child rows all write through
 * it (the rows via `onMessage`), so starting a new flow anywhere replaces whatever a previous row
 * left behind, and the card never shows two outcome lines that disagree.
 */
export default function DataManagement({
  serializer,
  workspace,
  battles,
  organisms,
  workspaceMeta,
  onImported,
  onCleared,
}: DataManagementProps) {
  const [message, setMessage] = useState<DataManagementMessage>(null);
  // Story 7.2: bumped after an import or a Clear All — both replace the workspace description —
  // so the description row remounts and re-reads the store instead of showing stale text.
  const [descriptionKey, setDescriptionKey] = useState(0);
  // The row whose flow started most recently. Rows run concurrently (FD6: no cross-row locking),
  // so without an owner the slot is last-to-SETTLE wins: a pristine Import still awaiting the
  // serializer would land "Imported N battles…" over a Clear All the user confirmed after it —
  // the false line D2 exists to remove — and would do so into the `inert` card while that row's
  // dialog is open, where a live region inserted is never announced. Only the owner may publish.
  const ownerRef = useRef<OutcomeSource | null>(null);
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

  // `null` is only ever sent at the START of a flow (every row's contract), so it both claims the
  // slot and clears it; an outcome from any row that no longer owns the slot is dropped.
  function publish(source: OutcomeSource, next: DataManagementMessage) {
    if (next === null) {
      ownerRef.current = source;
      setMessage(null);
      return;
    }
    if (ownerRef.current !== source) return;
    setMessage(next);
  }

  async function handleExportClick() {
    // A second click while an export is in flight does nothing — no second exportWorkspace()
    // call, and the pending export's own outcome (success or the alert) still lands normally.
    if (pendingRef.current) return;

    pendingRef.current = true;
    // Clears whatever any row (Export, Import or Clear All) last left in the shared slot (D2).
    publish('export', null);

    try {
      await exportWorkspaceToFile(serializer);
    } catch {
      // No `error.message`, no stack trace — plain, non-technical copy only (AC8). Export is
      // read-only, so "nothing was changed" is simply true, not a hedge.
      if (mountedRef.current) publish('export', { role: 'alert', text: EXPORT_ERROR_MESSAGE });
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <Card aria-labelledby={DATA_MANAGEMENT_HEADING_ID}>
      <CardTitle id={DATA_MANAGEMENT_HEADING_ID}>Data Management</CardTitle>
      <WorkspaceDescriptionRow
        key={descriptionKey}
        workspaceMeta={workspaceMeta}
        onMessage={(next) => publish('description', next)}
      />
      <Row>
        <RowInfo>
          <RowLabel>Export Workspace</RowLabel>
          <RowDescription>
            Download a JSON file containing all your battles, organisms and the workspace
            description for backup or transfer
          </RowDescription>
        </RowInfo>
        <ExportButton type="button" aria-label="Export workspace" onClick={handleExportClick}>
          Export
        </ExportButton>
      </Row>
      <ImportWorkspaceRow
        serializer={serializer}
        battles={battles}
        organisms={organisms}
        workspaceMeta={workspaceMeta}
        onImported={() => {
          setDescriptionKey((k) => k + 1);
          onImported();
        }}
        onMessage={(next) => publish('import', next)}
      />
      <LoadPresetRow
        serializer={serializer}
        battles={battles}
        organisms={organisms}
        workspaceMeta={workspaceMeta}
        onImported={() => {
          setDescriptionKey((k) => k + 1);
          onImported();
        }}
        onMessage={(next) => publish('preset', next)}
      />
      <ClearAllDataRow
        workspace={workspace}
        organisms={organisms}
        onCleared={() => {
          setDescriptionKey((k) => k + 1);
          onCleared();
        }}
        onMessage={(next) => publish('clear', next)}
      />
      {/* D2: the ONE outcome slot for the whole card, wherever it was last written from. */}
      {message?.role === 'status' && <SuccessText role="status">{message.text}</SuccessText>}
      {message?.role === 'alert' && <ErrorText role="alert">{message.text}</ErrorText>}
    </Card>
  );
}
