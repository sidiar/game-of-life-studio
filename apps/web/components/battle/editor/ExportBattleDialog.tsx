'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

// Per-component imports only (AR-35), copied from `<UnsavedChangesDialog>` — `/battle` is the
// tightest bundle budget in the repo (FD1: 0.4 KB of headroom at story creation), which is also
// why this dialog is reached through `next/dynamic` from `<BattlePage>` rather than a static
// import. See that call site for the measurement.

const TITLE_ID = 'export-battle-dialog-title';
const BODY_ID = 'export-battle-dialog-body';
const SAVE_NOTE_ID = 'export-battle-dialog-save-note';

// Matches `<UnsavedChangesDialog>` / `<DeleteBattleDialog>` / `<ResizeClipWarningDialog>` — one
// dialog idiom, one width (FD3).
const PAPER_MAX_WIDTH = '440px';
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export interface ExportBattleDialogProps {
  open: boolean;
  /**
   * `isDirty || persistedId === null` (Story 5.6 FD4/FD5, AC7). Switches the Battle Only button's
   * label to "Save & Export Battle" and adds the second body line explaining why.
   */
  needsSave: boolean;
  /**
   * `persistedId === null` specifically — chooses between "has unsaved changes" and "has not been
   * saved yet" in the second body line. Read only when `needsSave` is true.
   */
  neverSaved: boolean;
  /** Escape and a backdrop click both route here (MUI's `onClose`). Changes nothing. */
  onCancel(): void;
  /** Records the Battle Only / Save & Export Battle choice. Nothing async runs yet — see `onExited`. */
  onChooseBattle(): void;
  /** Records the Entire Workspace choice. Nothing async runs yet — see `onExited`. */
  onChooseWorkspace(): void;
  /** Fired once the close transition has fully finished — the moment `<BattlePage>` acts on a
   * recorded choice (FD2) and restores focus (FD8). */
  onExited?(): void;
}

/**
 * FR-7.13's prompt (Story 5.6, spec §3.7): "Export this Battle only, or export entire Workspace?"
 *
 * **Presentational and stateless — no `pending`.** FD2: nothing async runs while this dialog is
 * open. A choice button only records which option was picked and closes the dialog; the save
 * and/or export run from `onExited`, once the dialog is genuinely gone, which is what keeps a
 * failure alert from being inserted into a subtree `useInertBackground` still has `inert`
 * (project-context's live-region rule).
 *
 * Copies `<UnsavedChangesDialog>`'s idiom (FD3) — guarded-by-nothing `onClose` (there is no
 * `pending` to guard against here), `disableRestoreFocus`, `onTransitionExited`, the 440px paper,
 * `BUTTON_SX`, Cancel first with `autoFocus`. Do NOT import from that module — copy the shape,
 * never the code: a value import would pull MUI back into `/battle`'s static graph and defeat the
 * `next/dynamic` call that loads THIS dialog (see `<BattlePage>`'s call site).
 *
 * Button semantics (FD3): **Battle Only** is the recommended action — the dialog opened from a
 * battle's own "Export Battle" — so it is `contained` and last in DOM order. **Entire Workspace**
 * is a `text` button in the middle; it is not destructive, so it carries no `color="error"`.
 */
export default function ExportBattleDialog({
  open,
  needsSave,
  neverSaved,
  onCancel,
  onChooseBattle,
  onChooseWorkspace,
  onExited,
}: ExportBattleDialogProps) {
  const describedBy = needsSave ? `${BODY_ID} ${SAVE_NOTE_ID}` : BODY_ID;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      onTransitionExited={onExited}
      // `<BattlePage>` manages focus for every close path — see its restore effect (FD8). MUI's
      // default restore-to-trigger reads `document.activeElement` at OPEN time, and WebKit does
      // not focus a `<button>` on click, so on that engine alone it would restore to `<body>`.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={describedBy}
    >
      <DialogTitle id={TITLE_ID}>Export Battle</DialogTitle>
      <DialogContent>
        {/* FR-7.13's prompt, quoted. */}
        <DialogContentText id={BODY_ID}>
          Export this Battle only, or export entire Workspace?
        </DialogContentText>
        {/* AC7 (the #77 AC): made visible in copy, not silent and not blocking. */}
        {needsSave && (
          <DialogContentText id={SAVE_NOTE_ID} sx={{ marginTop: '10px' }}>
            {neverSaved
              ? 'This battle has not been saved yet. '
              : 'This battle has unsaved changes. '}
            Save &amp; Export Battle saves it first; Entire Workspace exports only what is already
            saved.
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        {/* Safe first, `autoFocus` + first in DOM order: an immediate Enter must hit the action
            that changes nothing. Escape maps here too (see `onClose`). */}
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
        <Button type="button" onClick={onChooseWorkspace} sx={BUTTON_SX}>
          Entire Workspace
        </Button>
        <Button type="button" onClick={onChooseBattle} variant="contained" sx={BUTTON_SX}>
          {needsSave ? 'Save & Export Battle' : 'Battle Only'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
