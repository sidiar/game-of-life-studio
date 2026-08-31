'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

// Per-component imports only (AR-35) — `import { Dialog } from '@mui/material'` pulls the whole
// barrel. On this route that is not merely a convention: `/battle` is the tightest bundle budget
// in the repo, which is also why `<BattlePage>` reaches this file through `next/dynamic` rather
// than a static import. See that call site for the measurement.

const TITLE_ID = 'unsaved-changes-dialog-title';
const BODY_ID = 'unsaved-changes-dialog-body';

// The clinical mockup's dialog width, matching `<DeleteBattleDialog>` and
// `<ResizeClipWarningDialog>`. Set here rather than in the theme's MuiDialog.paper styleOverride,
// which would apply to every future dialog and outrank MUI's own maxWidth prop.
const PAPER_MAX_WIDTH = '440px';

// Pulled out of the theme's MuiButton root override for the same reason the other two dialogs
// record: on `root` they apply to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export interface UnsavedChangesDialogProps {
  open: boolean;
  /**
   * A save started from this dialog is in flight. Disables all three actions AND guards `onClose`,
   * so Escape/backdrop cannot dismiss the dialog mid-write — the exact bug the Story 1.13 review
   * found on the delete path, where a dismissal read as a cancel while the write ran to
   * completion.
   */
  pending: boolean;
  /** Escape and backdrop both route here (FR-7.9's Cancel). Changes nothing at all. */
  onCancel(): void;
  /** Leave without writing. `isDirty` stays true; the mount that holds it is about to die. */
  onDiscard(): void;
  /** Save through the EXISTING Story 2.13 path, then leave — but only if the save succeeded. */
  onSaveAndLeave(): void;
  /** Fired once the close transition has fully finished, so the caller can release `inert` and
   * restore focus in the right order (see `<BattlePage>`'s focus effect). */
  onExited?(): void;
}

/**
 * FR-7.9's in-app half: "Display confirmation prompt when navigating back to Battle Gallery: *You
 * have unsaved changes. Save before leaving?*" — spec §3.15.
 *
 * ⚠️ This dialog covers ONE of the two channels FR-7.9 names. `beforeunload` (`useDirtyGuard`)
 * covers the other, and they cannot substitute for each other: `beforeunload` does not fire on a
 * client-side route change, and no dialog can intercept a tab close.
 *
 * Composed exactly like `<ResizeClipWarningDialog>` and `<DeleteBattleDialog>` — the guarded
 * `onClose`, the paper width, Cancel-first with `autoFocus`, `disableRestoreFocus`,
 * `onTransitionExited` — so this route keeps ONE dialog idiom rather than three. Holds no state
 * and makes no repository call: the save, the navigation and the dirty flag all belong to
 * `<BattlePage>`.
 */
export default function UnsavedChangesDialog({
  open,
  pending,
  onCancel,
  onDiscard,
  onSaveAndLeave,
  onExited,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog
      open={open}
      // Fires for both Escape and backdrop click; Cancel is the non-destructive action either way,
      // so there is no reason to branch on MUI's `reason` argument — but it must not fire while a
      // save is in flight. `disableEscapeKeyDown` was removed from Modal in MUI v9, so this
      // callback is the ONLY place that guard can live (`<DeleteBattleDialog>` records the
      // finding).
      onClose={() => {
        if (pending) return;
        onCancel();
      }}
      onTransitionExited={onExited}
      // `<BattlePage>` manages focus for every close path that stays on the page — see its
      // restore effect. MUI's default restore-to-trigger reads `document.activeElement` at OPEN
      // time, and WebKit does not focus a `<button>` on click, so on that engine alone it
      // faithfully restores focus to `<body>`: "the tab order restarts at the top of the
      // document". Left on, it would also fire from the exit transition and silently overwrite
      // the explicit move.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      {/* CONSEQUENCE FIRST, the convention both shipped dialogs follow: the heading names what is
          at stake, not what the buttons do. */}
      <DialogTitle id={TITLE_ID}>Unsaved Changes</DialogTitle>
      <DialogContent>
        {/* FR-7.9's prompt, quoted. */}
        <DialogContentText id={BODY_ID}>
          You have unsaved changes. Save before leaving?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* Forced decision 4, option (a) — safe first, destructive middle, recommended last.
            `autoFocus` + first in DOM order: MUI's focus trap focuses the first focusable
            descendant unless something carries autoFocus, and an immediate Enter must hit the
            action that changes nothing. Escape maps here too (see `onClose`). */}
        <Button
          type="button"
          onClick={onCancel}
          disabled={pending}
          autoFocus
          color="inherit"
          variant="outlined"
          sx={BUTTON_SX}
        >
          Cancel
        </Button>
        <Button type="button" onClick={onDiscard} disabled={pending} color="error" sx={BUTTON_SX}>
          Discard Changes
        </Button>
        <Button
          type="button"
          onClick={onSaveAndLeave}
          disabled={pending}
          variant="contained"
          sx={BUTTON_SX}
        >
          Save &amp; Leave
        </Button>
      </DialogActions>
    </Dialog>
  );
}
