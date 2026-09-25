'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import {
  DELETE_CONFIRM_ACTION,
  DELETE_CONFIRM_TITLE,
  deleteConfirmSentence,
} from '@/lib/organisms/deleteBlockCopy';

// Per-component imports only (AR-35) — `<OrganismLibrary>` reaches this file through
// `next/dynamic`, so the MUI `Dialog` stack and the copy above stay out of `/organisms`'s first
// load (`OrganismDeleteBlockedDialog.tsx` records the identical reason).

const TITLE_ID = 'organism-delete-confirm-dialog-title';
const BODY_ID = 'organism-delete-confirm-dialog-body';

// The clinical mockup's dialog width, matching every other dialog in this app.
const PAPER_MAX_WIDTH = '440px';

// Pulled out of the theme's MuiButton root override, for the reason the shipped dialogs record: on
// `root` it applies to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export interface OrganismDeleteConfirmDialogProps {
  open: boolean;
  /**
   * Already display-resolved (`toDisplayOrganism`), and held by the caller until `onExited` — MUI
   * keeps the children mounted through the ~195 ms exit fade, and an emptied name would render a
   * visible `“”` on the way out (the `<DeleteBattleDialog>` `battleName` lesson).
   */
  organismName: string;
  /** The write is in flight: both buttons disable and Escape/backdrop become no-ops. */
  pending: boolean;
  /** Cancel, Escape and the backdrop. Writes nothing. */
  onCancel(): void;
  onConfirm(): void;
  /** Fired once the close transition has fully finished — the caller's cue to publish, reload
   * and restore focus (never before: the project-context live-region trap). */
  onExited?(): void;
}

/**
 * Story 4.22's confirmation (FR-1.4, UX-DR15): the PRD's standard question before an `allowed`
 * organism is deleted. Composed exactly like `<DeleteBattleDialog>` — 440px paper,
 * `disableRestoreFocus`, `onTransitionExited`, `aria-labelledby` + `aria-describedby`, `BUTTON_SX`,
 * Cancel first and `autoFocus`ed — so the app keeps one dialog idiom.
 *
 * A pure function of its props: no repository, no `@gol/domain` import, no verdict. The re-verify,
 * the write and the focus moves are all `useOrganismDelete`'s (`lib/organisms/`), which is what
 * knows which organism is being confirmed and from where.
 */
export default function OrganismDeleteConfirmDialog({
  open,
  organismName,
  pending,
  onCancel,
  onConfirm,
  onExited,
}: OrganismDeleteConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      // Escape and backdrop both land here. Guarded on `pending` for `<DeleteBattleDialog>`'s
      // reason: MUI v9 has no `disableEscapeKeyDown`, and a dismissal mid-write would read as a
      // cancel while `organisms.delete` runs on to completion.
      onClose={() => {
        if (pending) return;
        onCancel();
      }}
      onTransitionExited={onExited}
      // `useOrganismDelete` owns focus for every close path (FD8): a DOM lookup once the exit has
      // finished, because after a successful delete the trigger is gone, and WebKit never focused
      // it on click in the first place.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <DialogTitle id={TITLE_ID}>{DELETE_CONFIRM_TITLE}</DialogTitle>
      <DialogContent>
        {/* `overflowWrap`: an organism name may be a long, space-free string, which must not push
            the 440px paper wider. */}
        <DialogContentText id={BODY_ID} sx={{ overflowWrap: 'anywhere' }}>
          {deleteConfirmSentence(organismName)}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* `autoFocus` + first in DOM order: for a destructive confirm the safe action is what an
            immediate Enter hits. */}
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
        <Button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          color="error"
          variant="contained"
          sx={BUTTON_SX}
        >
          {DELETE_CONFIRM_ACTION}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
