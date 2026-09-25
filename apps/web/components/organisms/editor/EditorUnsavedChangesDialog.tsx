'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

// Per-component imports only (AR-35). This file needs no `dynamic()` boundary of its own: it is
// imported STATICALLY from `<OrganismEditorModal>`, which is already inside `<OrganismLibrary>`'s
// lazy chunk (that file's own header comment) — a nested lazy boundary here would split a chunk for
// nothing. ❌ Never import this from `OrganismLibrary.tsx` or `useOrganismEditorModal.ts`: both are
// in `/organisms`'s first-load chunk, and a value import from either would pull the MUI `Dialog`
// stack back into it.

const TITLE_ID = 'editor-unsaved-changes-dialog-title';
const BODY_ID = 'editor-unsaved-changes-dialog-body';

// The clinical mockup's dialog width, matching every other dialog in this app.
const PAPER_MAX_WIDTH = '440px';

// Pulled out of the theme's MuiButton root override for the reason the shipped dialogs record: on
// `root` it applies to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export interface EditorUnsavedChangesDialogProps {
  open: boolean;
  /**
   * Keep Editing, Escape (ignoring a held repeat, FD10) and a backdrop click all land here.
   * Nothing else changes: the draft, `saveAttempted` and the outcome lines are untouched.
   */
  onKeepEditing(): void;
  /** Discard. The confirmation closes; only once its exit transition has finished does the caller
   * close the editor with no write (FD6). */
  onDiscard(): void;
  /** Save. The confirmation closes and, after its exit, the editor's own Save runs with close on
   * success (FD3). */
  onSave(): void;
  /** Fired once the close transition has fully finished — the caller's cue to act on the chosen
   * outcome (FD6) and restore focus (FD7), never before (the live-region rule in
   * `project-context.md`). */
  onExited?(): void;
}

/**
 * Story 4.23's confirmation (UX-DR16, verbatim): "You have unsaved changes. Discard changes?",
 * with three actions in DOM order Keep Editing (autoFocus) → Discard → Save (FD4 — safe first,
 * destructive middle, recommended last, so an immediate Enter or Escape changes nothing). Composed
 * exactly like `<UnsavedChangesDialog>` / `<OrganismDeleteConfirmDialog>` — 440px paper,
 * `disableRestoreFocus`, `onTransitionExited`, `aria-labelledby` + `aria-describedby` — so the app
 * keeps ONE dialog idiom.
 *
 * Holds no state and calls no repository: which outcome fired, when the editor itself closes or
 * saves, and every focus move belong to `<OrganismEditorModal>`'s request-close handler (FD6/FD7).
 */
export default function EditorUnsavedChangesDialog({
  open,
  onKeepEditing,
  onDiscard,
  onSave,
  onExited,
}: EditorUnsavedChangesDialogProps) {
  return (
    <Dialog
      open={open}
      // FD10: a keydown carrying `repeat` is a HOLD that began before this dialog opened (the
      // editor's own request-close handler already ignores the repeat that would otherwise have
      // opened it a second time). MUI's `useModal` does not check `event.repeat` itself, so this
      // guard is what keeps a held Escape from cycling this dialog closed and then, through the
      // very next repeated keydown, dismissing the editor underneath it too. `'repeat' in event` is
      // the narrowing `{}` (MUI's own `onClose` event type) allows without a cast.
      onClose={(event, reason) => {
        if (reason === 'escapeKeyDown' && 'repeat' in event && event.repeat === true) return;
        onKeepEditing();
      }}
      onTransitionExited={onExited}
      // `<OrganismEditorModal>`'s request-close handler manages focus for every close path (FD7): a
      // DOM lookup once the exit transition has finished, from an effect keyed on `confirming`
      // clearing — the same reason every other house dialog sets this.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <DialogTitle id={TITLE_ID}>Unsaved Changes</DialogTitle>
      <DialogContent>
        {/* UX-DR16's copy, verbatim. */}
        <DialogContentText id={BODY_ID}>
          You have unsaved changes. Discard changes?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* FD4 — `autoFocus` + first in DOM order: an immediate Enter or Escape hits the action
            that changes nothing. Escape maps here too (see `onClose`). */}
        <Button
          type="button"
          onClick={onKeepEditing}
          autoFocus
          color="inherit"
          variant="outlined"
          sx={BUTTON_SX}
        >
          Keep Editing
        </Button>
        <Button type="button" onClick={onDiscard} color="error" sx={BUTTON_SX}>
          Discard
        </Button>
        <Button type="button" onClick={onSave} variant="contained" sx={BUTTON_SX}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
