'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { CLEAR_ALL_WARNING_TEXT } from '@/lib/clearAll/clearAllMessages';

// Per-component imports only (AR-35), copying `<ImportWarningDialog>`'s idiom (copy the SHAPE,
// never import it) — a value import would pull MUI back into whatever route statically imports
// this file, defeating the `next/dynamic` call at `<ClearAllDataRow>`'s call site.

const TITLE_ID = 'clear-all-data-dialog-title';
const BODY_ID = 'clear-all-data-dialog-body';

// Matches every other dialog in this codebase — one dialog idiom, one width across the app.
const PAPER_MAX_WIDTH = '440px';
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export interface ClearAllDataDialogProps {
  open: boolean;
  /** Escape and a backdrop click both route here (MUI's `onClose`). Changes nothing. */
  onCancel(): void;
  /** Records the choice to proceed. The reset itself runs from `onExited` (AC6). */
  onConfirm(): void;
  /** Fired once the close transition has fully finished (AC6's act-on-exit contract). */
  onExited?(): void;
}

/**
 * FR-8.5's mandatory warning (Story 5.10, AC2) — shown for EVERY workspace, pristine or not
 * (contrast Story 5.9's AC4 pristine skip). Presentational and stateless, matching
 * `<ImportWarningDialog>`'s FD2 shape: a button only records a choice, and this component never
 * runs `resetWorkspace` itself.
 *
 * Button semantics (AC2/AC8): **Cancel** is first, `autoFocus`, and the ONLY thing Escape/backdrop
 * map to. **Clear All Data** is `variant="contained" color="error"` — the one destructive control,
 * last in DOM order. No button self-disables (FD5 / the Story 5.5 FD8 focus-trap rule).
 */
export default function ClearAllDataDialog({
  open,
  onCancel,
  onConfirm,
  onExited,
}: ClearAllDataDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      onTransitionExited={onExited}
      // `<ClearAllDataRow>` restores focus to the Clear Data button on every close path — see its
      // effect. WebKit does not focus a clicked `<button>`, so MUI's default restore-to-trigger
      // (reading `document.activeElement` at OPEN time) would land on `<body>` there.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <DialogTitle id={TITLE_ID}>Clear All Data?</DialogTitle>
      <DialogContent>
        <DialogContentText id={BODY_ID}>{CLEAR_ALL_WARNING_TEXT}</DialogContentText>
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
        <Button type="button" onClick={onConfirm} variant="contained" color="error" sx={BUTTON_SX}>
          Clear All Data
        </Button>
      </DialogActions>
    </Dialog>
  );
}
