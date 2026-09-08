'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

// Per-component imports only (AR-35) — `import { Dialog } from '@mui/material'` pulls the whole
// barrel. On this route that is not merely a convention: `/battle` is the tightest bundle budget
// in the repo, which is also why `<BattleEditorView>` reaches this file through `next/dynamic`
// rather than a static import. See that call site for the measurement.

const TITLE_ID = 'resize-clip-warning-dialog-title';
const BODY_ID = 'resize-clip-warning-dialog-body';

// The clinical mockup's dialog width, matching `<DeleteBattleDialog>`. Set here rather than in the
// theme's MuiDialog.paper styleOverride, which would apply to every future dialog and outrank
// MUI's own maxWidth prop.
const PAPER_MAX_WIDTH = '440px';

// Pulled out of the theme's MuiButton root override for the same reason `<DeleteBattleDialog>`
// records: on `root` they apply to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export interface ResizeClipWarningDialogProps {
  open: boolean;
  /** The size the user asked for. Kept populated for the WHOLE close transition (~195ms), not
   * cleared when `open` goes false: MUI keeps children mounted until the fade finishes, so an
   * emptied value renders a visibly wrong sentence on the way out (`<DeleteBattleDialog>`'s
   * `battleName` carries the same warning, from the same code review). */
  targetSize: { cols: number; rows: number };
  /** How many LIVING cells fall outside `targetSize` — never a cell count. Quantified because the
   * predicate already walked that region to answer the yes/no question (forced decision 3a). */
  clippedLivingCells: number;
  onCancel(): void;
  onConfirm(): void;
  /** Fired once the close transition has fully finished, so the caller can drop the copy above. */
  onExited?(): void;
}

/**
 * FR-3.11's warning: "the system warns before discarding cells". Shown ONLY for a shrink that
 * would clip living cells — a grow never warns (Decision A.3, the epic AC in as many words), and a
 * shrink over an empty region applies silently, because warning about discarding nothing trains
 * the user to dismiss the dialog unread.
 *
 * Composition follows `<DeleteBattleDialog>` deliberately and exactly — the `onClose` guard-free
 * dismissal, the paper width, the Cancel-first button order — so this route has ONE dialog idiom
 * rather than two. The two genuine differences are recorded on the props below and on
 * `disableRestoreFocus`'s ABSENCE.
 *
 * Holds no state and makes no repository call: the pending resize, the commit and the undo entry
 * all belong to `<BattleEditorView>`/`<BattlePage>` (spec §3.3, RFC-005 Decision 6).
 */
export default function ResizeClipWarningDialog({
  open,
  targetSize,
  clippedLivingCells,
  onCancel,
  onConfirm,
  onExited,
}: ResizeClipWarningDialogProps) {
  return (
    <Dialog
      open={open}
      // Fires for both Escape and backdrop click; dismissal is the non-destructive action either
      // way, so there is no reason to branch on MUI's `reason` argument. Unlike
      // `<DeleteBattleDialog>` there is no in-flight state to guard against: the resize is a
      // synchronous local commit, so there is no window in which a dismissal could race a write
      // that then completes anyway.
      onClose={onCancel}
      onTransitionExited={onExited}
      // `<BattleEditorView>` manages focus for every close path — see its `restoreFocusPresetRef`
      // effect. MUI's default restore-to-trigger reads `document.activeElement` at OPEN time, and
      // WebKit does not focus a non-text form control on click, so on that engine alone it
      // faithfully restores focus to `<body>` (the same finding `<DeleteBattleDialog>` records for
      // its trigger button). Left on, it would also fire from the exit transition and silently
      // overwrite the explicit move.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      {/* CONSEQUENCE FIRST: the title names what is lost, not what the button does. A reader who
          stops after the heading has already been told the destructive part. */}
      <DialogTitle id={TITLE_ID}>Cells Will Be Discarded</DialogTitle>
      <DialogContent>
        <DialogContentText id={BODY_ID}>
          {/* The count is exact, not "some cells": the predicate walked the discarded region to
              decide whether to open this dialog at all, so quoting the number costs nothing and
              is the difference between a warning the user can weigh and one they can only
              accept. `×` is inside a sentence an assistive technology reads aloud, so it is
              spelled out — the same call `<GridSettingsSection>` makes for its fact rows. */}
          Resizing to {targetSize.cols} by {targetSize.rows} discards{' '}
          {clippedLivingCells === 1 ? '1 living cell' : `${clippedLivingCells} living cells`} that
          fall outside the smaller grid. You can undo this.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* autoFocus + first in DOM order: MUI's focus trap focuses the first focusable descendant
            unless something carries autoFocus, and for a destructive confirm the safe action must
            be what an immediate Enter press hits. The convention `<DeleteBattleDialog>` records. */}
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
        <Button type="button" onClick={onConfirm} color="error" variant="contained" sx={BUTTON_SX}>
          Resize Grid
        </Button>
      </DialogActions>
    </Dialog>
  );
}
