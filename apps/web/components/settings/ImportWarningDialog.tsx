'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import type { ExportKind } from '@gol/domain';
import { importWarningText } from '@/lib/import/importMessages';

// Per-component imports only (AR-35), copying `<ExportBattleDialog>`'s idiom — copy the SHAPE,
// never import it (a value import would pull MUI back into whatever route statically imports
// this file, defeating the `next/dynamic` call at `<ImportWorkspaceRow>`'s call site).

const TITLE_ID = 'import-warning-dialog-title';
const BODY_ID = 'import-warning-dialog-body';

// Matches `<ExportBattleDialog>` / `<UnsavedChangesDialog>` / `<DeleteBattleDialog>` — one dialog
// idiom, one width across the app.
const PAPER_MAX_WIDTH = '440px';
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export interface ImportWarningDialogProps {
  open: boolean;
  /** Which kind of file was picked — only ever reaches the warning SENTENCE (FD7); no branch. */
  kind: ExportKind;
  /** The Export First feedback, rendered inside `DialogContent` (Task 3.3). `'idle'` shows nothing. */
  exportState: 'idle' | 'exported' | 'failed';
  /** Escape and a backdrop click both route here (MUI's `onClose`). Changes nothing. */
  onCancel(): void;
  /** Runs `exportWorkspaceToFile` while the dialog stays open (AC5). */
  onExportFirst(): void;
  /** Records the choice to proceed. The import itself runs from `onExited` (AC7). */
  onImportAnyway(): void;
  /** Fired once the close transition has fully finished (AC7's act-on-exit contract). */
  onExited?(): void;
}

/**
 * FR-8.4's mandatory warning (Story 5.9, AC3/AC5/AC8) — a non-pristine workspace opens this before
 * any write. Presentational and stateless, matching `<ExportBattleDialog>`'s FD2 shape: a button
 * only records a choice (or, for Export First, starts a call the dialog stays open for) and this
 * component never runs `importWorkspace` itself.
 *
 * Button semantics (AC3): **Cancel** is first, `autoFocus`, and the ONLY thing Escape/backdrop map
 * to — an immediate Enter must hit the action that changes nothing. **Export Current Workspace
 * First** is a `text` button in the middle; it is not destructive on its own. **Import Anyway** is
 * `variant="contained" color="error"` — the one destructive control in this dialog, last in DOM
 * order. No button self-disables (the Story 5.5 FD8 focus-trap rule): Export First's own re-entrancy
 * guard lives in the caller's `pendingRef` (`<ImportWorkspaceRow>`), not here.
 */
export default function ImportWarningDialog({
  open,
  kind,
  exportState,
  onCancel,
  onExportFirst,
  onImportAnyway,
  onExited,
}: ImportWarningDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      onTransitionExited={onExited}
      // `<ImportWorkspaceRow>` restores focus to the Import button on every close path — see its
      // effect. WebKit does not focus a `<button>` on click, so MUI's default restore-to-trigger
      // (which reads `document.activeElement` at OPEN time) would land on `<body>` on that engine.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <DialogTitle id={TITLE_ID}>Replace Your Workspace?</DialogTitle>
      <DialogContent>
        <DialogContentText id={BODY_ID}>{importWarningText(kind)}</DialogContentText>
        {/* Task 3.3: NOT the dialog's aria-describedby target — the dialog's own subtree is the
            one part of the page `useInertBackground` does not mark inert, so it is safe to insert
            a live region here (unlike everywhere else in `apps/web`, project-context's rule). */}
        {exportState === 'exported' && (
          <DialogContentText component="p" role="status" sx={{ marginTop: '10px' }}>
            Your current workspace was downloaded.
          </DialogContentText>
        )}
        {exportState === 'failed' && (
          <DialogContentText component="p" role="alert" sx={{ marginTop: '10px' }}>
            Your current workspace could not be exported. Nothing was imported.
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          type="button"
          onClick={onCancel}
          autoFocus
          color="inherit"
          variant="outlined"
          sx={BUTTON_SX}
        >
          Cancel
        </Button>
        <Button type="button" onClick={onExportFirst} sx={BUTTON_SX}>
          Export Current Workspace First
        </Button>
        <Button
          type="button"
          onClick={onImportAnyway}
          variant="contained"
          color="error"
          sx={BUTTON_SX}
        >
          Import Anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
