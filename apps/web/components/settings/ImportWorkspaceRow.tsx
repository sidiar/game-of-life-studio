'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import dynamic from 'next/dynamic';
import { styled } from '@mui/material/styles';
import { isPristineWorkspace, type ExportKind } from '@gol/domain';
import {
  validateImportFile,
  type BattleRepository,
  type ImportSummary,
  type OrganismRepository,
  type WorkspaceSerializer,
} from '@gol/persistence';
import { importFailureMessage } from '@/lib/import/importFailureMessage';
import { FILE_READ_FAILURE_MESSAGE, importSuccessMessage } from '@/lib/import/importMessages';
import { exportWorkspaceToFile } from '@/lib/export/exportWorkspaceToFile';
import { useInertBackground } from '@/lib/useInertBackground';
import { Row, RowDescription, RowInfo, RowLabel } from './SettingsCard';

// Task 3.4 / AR-35: `/settings` carries no MUI `Dialog` in its first load today (Story 5.5/5.6's
// precedent — `<BattlePage>`'s `<ExportBattleDialog>`), and this dialog is rarely shown. The chunk
// is requested on the first non-pristine pick only.
const ImportWarningDialog = dynamic(() => import('./ImportWarningDialog'), { ssr: false });

export interface ImportWorkspaceRowProps {
  // `Pick`s, never the aggregate (FD2, the Story 5.2 FD7 house rule) — this row calls exactly
  // these four methods and imports no concrete repository or `createRepositories()` (AR-2/27).
  serializer: Pick<WorkspaceSerializer, 'exportWorkspace' | 'importWorkspace'>;
  battles: Pick<BattleRepository, 'list'>;
  organisms: Pick<OrganismRepository, 'list'>;
  /** AC6: `<SettingsPage>` wires this to `statsResource.reload()`. Called on success only. */
  onImported(): void;
}

// Mockup: `.btn-secondary` (`settings.html:200-210`), `--gol-*` tokens only (AR-46). Copies
// `<SidebarFooter>`'s `BackButton` idiom for a bordered secondary control: `--gol-border-control`
// (not the decorative `--gol-border`) because this border is the button's OWN boundary, so SC
// 1.4.11's 3:1 applies — not `<DataManagement>`'s borderless `ExportButton`, which needs no such
// split. No `disabled` (FD8/AC8: this button never self-disables) and no `transition: all` (the
// mid-fade axe trap every hover-button component in this codebase avoids).
const ImportButton = styled('button')({
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 24px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background-color 0.2s, border-color 0.2s',
  '&:hover': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// Same gated pair `<DataManagement>`'s `ErrorText` uses (`--gol-danger` on this card's
// `--gol-bg-secondary`, >=4.5:1, `themeTokens.test.ts`).
const FailureText = styled('p')({
  margin: '15px 0 0',
  fontSize: '13px',
  lineHeight: 1.5,
  color: 'var(--gol-danger)',
});

// `--gol-text-secondary` — an existing gated pair (task 4.6), never a new, ungated one.
const SuccessText = styled('p')({
  margin: '15px 0 0',
  fontSize: '13px',
  lineHeight: 1.5,
  color: 'var(--gol-text-secondary)',
});

/**
 * FD8's DOM-lookup restore, mirroring `<BattlePage>`'s `focusExportButtonIfLoose` for the
 * identical reason: `disableRestoreFocus` on `<ImportWarningDialog>` turns off MUI's own restore
 * (WebKit does not focus a `<button>` on click, so `document.activeElement` at OPEN time would be
 * `<body>` there), so this component owns the restore instead. "Loose" is `null`, `<body>`, or
 * still inside the import dialog itself (a nested dialog stacked over it is not this component's
 * to steal focus from).
 */
function focusImportButtonIfLoose(): void {
  const active = document.activeElement;
  const focusIsLoose =
    active === null ||
    active === document.body ||
    active.closest('[aria-labelledby="import-warning-dialog-title"]') !== null;
  if (!focusIsLoose) return;
  document.querySelector<HTMLElement>('[data-import-workspace]')?.focus();
}

/**
 * The Import row (Story 5.9, AC1) — `<DataManagement>`'s second row. FD1's order: pick → validate
 * → pristine check → warn (unless pristine) → import once the dialog has fully exited.
 *
 * Re-entrancy (Task 4.4): `pendingRef` spans the WHOLE flow, pick through outcome — including the
 * entire time `<ImportWarningDialog>` is open, since the dialog itself makes the button
 * unreachable (`useInertBackground`) for exactly that window. A `mountedRef`, StrictMode-re-armed
 * like `<DataManagement>`'s own, guards every post-await `setState` and the `onImported()` call.
 */
export default function ImportWorkspaceRow({
  serializer,
  battles,
  organisms,
  onImported,
}: ImportWorkspaceRowProps) {
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKind, setDialogKind] = useState<ExportKind>('workspace');
  const [exportState, setExportState] = useState<'idle' | 'exported' | 'failed'>('idle');
  const [message, setMessage] = useState<{ role: 'status' | 'alert'; text: string } | null>(null);
  // Bumped whenever a post-exit focus restore is owed, so the effect below re-fires even though
  // `dialogMounted` itself did not change again (mirrors `<BattlePage>`'s `exportFocusTick`).
  const [focusTick, setFocusTick] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const exportInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const choiceRef = useRef<'import' | 'cancel' | null>(null);
  const pendingTextRef = useRef('');
  const focusOwedRef = useRef(false);

  useEffect(() => {
    // Re-armed on every setup (StrictMode runs setup → cleanup → setup) — the same reset
    // `<DataManagement>` and `useWorkspaceSeed.ts` carry, for the same reason.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Marks the background `inert` for exactly as long as the dialog is mounted (open or exiting) —
  // the project-context live-region rule this dialog's own in-content status/alert depends on.
  useInertBackground(dialogMounted);

  // Post-commit focus restore, run for every close path (Cancel/Escape/backdrop, or Import Anyway
  // once its import has settled). Must run AFTER `useInertBackground`'s cleanup has released
  // `inert` — React runs every cleanup for a commit before any setup, and that hook is declared
  // above this effect. `pendingRef` holds it back on the Import Anyway path: the
  // `dialogMounted=false` commit lands while `runImport` is still awaiting, and AC7 orders the
  // restore AFTER the outcome — the `focusTick` bump once the import settles re-fires this.
  useEffect(() => {
    if (dialogMounted || pendingRef.current || !focusOwedRef.current) return;
    focusOwedRef.current = false;
    focusImportButtonIfLoose();
  }, [dialogMounted, focusTick]);

  async function runImport(text: string): Promise<void> {
    try {
      const summary: ImportSummary = await serializer.importWorkspace(text);
      if (mountedRef.current) {
        setMessage({ role: 'status', text: importSuccessMessage(summary) });
        onImported();
      }
    } catch (error) {
      if (mountedRef.current) {
        setMessage({ role: 'alert', text: importFailureMessage(error) });
      }
    }
  }

  function handleImportButtonClick() {
    if (pendingRef.current) return;
    inputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (pendingRef.current) {
      input.value = '';
      return;
    }
    pendingRef.current = true;
    setMessage(null); // a new pick clears any previous outcome message (Task 4.4)

    let text: string;
    try {
      text = await file.text();
    } catch {
      input.value = '';
      pendingRef.current = false;
      if (mountedRef.current) setMessage({ role: 'alert', text: FILE_READ_FAILURE_MESSAGE });
      return;
    }
    input.value = ''; // reset AFTER the read, so picking the same file again fires again (AC1)

    let envelopeKind: ExportKind;
    try {
      envelopeKind = validateImportFile(text).kind;
    } catch (error) {
      pendingRef.current = false;
      if (mountedRef.current) setMessage({ role: 'alert', text: importFailureMessage(error) });
      return;
    }

    let pristine: boolean;
    try {
      const [battleSummaries, organismList] = await Promise.all([battles.list(), organisms.list()]);
      pristine = isPristineWorkspace(battleSummaries.length, organismList);
    } catch {
      // AC4 / FD3: a rejected read counts as NOT pristine — the failure mode is an extra warning,
      // never a silently-skipped one.
      pristine = false;
    }

    // Every step above awaited; if the row unmounted meanwhile (the user left `/settings`), the
    // import must not run unseen — nobody is left to read its outcome.
    if (!mountedRef.current) {
      pendingRef.current = false;
      return;
    }

    if (pristine) {
      await runImport(text);
      pendingRef.current = false;
      return;
    }

    pendingTextRef.current = text;
    choiceRef.current = null;
    setDialogKind(envelopeKind);
    setExportState('idle'); // reset when a NEW dialog opens (Task 4.3)
    focusOwedRef.current = true;
    setDialogMounted(true);
    setDialogOpen(true);
    // `pendingRef` stays true — the flow is still in progress, spanning the whole dialog window.
  }

  function handleDialogCancel() {
    if (choiceRef.current !== null) return; // the first choice wins (mirrors BattlePage FD2)
    choiceRef.current = 'cancel';
    setDialogOpen(false);
  }

  function handleImportAnyway() {
    if (choiceRef.current !== null) return;
    choiceRef.current = 'import';
    setDialogOpen(false);
  }

  async function handleExportFirst() {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    // Back to 'idle' first, so a repeat attempt with the same outcome re-inserts its live region
    // and is announced again, rather than leaving an identical node silently in place.
    setExportState('idle');
    try {
      await exportWorkspaceToFile(serializer);
      if (mountedRef.current) setExportState('exported');
    } catch {
      if (mountedRef.current) setExportState('failed');
    } finally {
      exportInFlightRef.current = false;
    }
  }

  /**
   * Task 4.2 step 7 / AC7: the ONLY place the import actually runs for the non-pristine path, and
   * only once the dialog's exit transition has fully finished — before this fires, the dialog's
   * own subtree is still the one non-inert part of the page, so publishing an outcome earlier
   * would insert a live region into a subtree `useInertBackground` still holds `inert`
   * (project-context's rule).
   */
  async function handleDialogExited() {
    setDialogMounted(false);
    const choice = choiceRef.current;
    choiceRef.current = null;

    if (choice !== 'import') {
      pendingRef.current = false;
      if (mountedRef.current) setFocusTick((tick) => tick + 1);
      return;
    }

    const text = pendingTextRef.current;
    pendingTextRef.current = '';
    await runImport(text);
    pendingRef.current = false;
    if (mountedRef.current) setFocusTick((tick) => tick + 1);
  }

  return (
    <>
      <Row>
        <RowInfo>
          <RowLabel>Import</RowLabel>
          {/* FR-8.4's description, NOT the mockup's "You are always warned first" — AC4 suppresses
              the warning for a pristine workspace, so "always" would overclaim (Dev Notes' Open
              Flags). */}
          <RowDescription>
            You are warned first whenever your current workspace holds data, and offered to export
            it before it is replaced.
          </RowDescription>
        </RowInfo>
        <ImportButton
          type="button"
          aria-label="Import workspace"
          onClick={handleImportButtonClick}
          data-import-workspace=""
        >
          Import
        </ImportButton>
        {/* Mockup: `.file-input-wrapper input[type="file"]` (`:317-326`) — `hidden`, not merely
            visually hidden, and no label of its own: the visible `<ImportButton>` is the only
            focusable trigger (`inputRef.current.click()`), never reached by Tab itself. */}
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          hidden
          tabIndex={-1}
          onChange={(event) => {
            void handleFileChange(event);
          }}
        />
      </Row>
      {message?.role === 'status' && <SuccessText role="status">{message.text}</SuccessText>}
      {message?.role === 'alert' && <FailureText role="alert">{message.text}</FailureText>}
      {dialogMounted && (
        <ImportWarningDialog
          open={dialogOpen}
          kind={dialogKind}
          exportState={exportState}
          onCancel={handleDialogCancel}
          onExportFirst={() => {
            void handleExportFirst();
          }}
          onImportAnyway={handleImportAnyway}
          onExited={() => {
            void handleDialogExited();
          }}
        />
      )}
    </>
  );
}
