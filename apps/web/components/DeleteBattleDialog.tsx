'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

// Per-component imports only (AR-35) — `import { Dialog } from '@mui/material'` pulls the whole
// barrel, and this story is already spending bundle budget on the Dialog stack (Task 9); a barrel
// import would make the measured delta unexplainable.

const TITLE_ID = 'delete-battle-dialog-title';
const BODY_ID = 'delete-battle-dialog-body';

// The clinical mockup's dialog width. Set here rather than in the theme's MuiDialog.paper
// styleOverride, which would apply to every future dialog and outrank MUI's own maxWidth prop.
const PAPER_MAX_WIDTH = '440px';

// Pulled out of the theme's MuiButton root override for the same reason: on `root` they apply to
// every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export interface DeleteBattleDialogProps {
  open: boolean;
  /**
   * Must stay populated for the whole close transition, not cleared the moment `open` goes false:
   * MUI keeps children mounted until the fade-out finishes (~195ms), so an emptied name renders a
   * visible `“” will be permanently deleted.` on the way out. `<BattleGallery>` holds its
   * `confirming` state until this dialog's `onExited` for exactly that reason.
   */
  battleName: string;
  pending: boolean;
  onCancel(): void;
  onConfirm(): void;
  /**
   * Fired once the close transition has fully finished. The parent owns focus restoration
   * (forced decision 4) and must not move focus before this point — see the handler in
   * `<BattleGallery>` for the ordering this exists to guarantee.
   */
  onExited?(): void;
}

/**
 * FR-7.7's confirmation prompt. Makes no repository call and holds no async state — the parent
 * (`<BattleGallery>`) owns both, and is the only thing that knows which battle is being confirmed.
 *
 * `open={false}` unmounts the dialog entirely (MUI's default, no `keepMounted`), so it never lands
 * in the prerendered HTML and every jsdom/e2e assertion that scopes to `document.body` (the
 * dialog is portalled OUT of `render()`'s own `container`) sees nothing when closed.
 */
export default function DeleteBattleDialog({
  open,
  battleName,
  pending,
  onCancel,
  onConfirm,
  onExited,
}: DeleteBattleDialogProps) {
  return (
    <Dialog
      open={open}
      // Fires for both Escape and backdrop click. Dismissal is the non-destructive action either
      // way, so there is no reason to branch on MUI's `reason` argument — but it must not fire
      // while a delete is in flight: the buttons are disabled by `pending`, and without this guard
      // Escape/backdrop would close the dialog as if cancelled while battles.delete() runs on to
      // completion, destroying the battle after the user made the documented cancel gesture
      // (code review 2026-08-14).
      //
      // This callback is the ONLY place that guard can live: `disableEscapeKeyDown` was removed
      // from Modal in MUI v9 (useModal.js:115-125 now always routes Escape through onClose with
      // reason 'escapeKeyDown'), so there is no prop-level equivalent to pair it with.
      onClose={() => {
        if (pending) return;
        onCancel();
      }}
      onTransitionExited={onExited}
      // <BattleGallery> manages focus for every close path (forced decision 4 — after a successful
      // delete the tile's Delete button is gone from the DOM, so focus goes to the Gallery heading;
      // after a cancel it goes back to the button that opened this). MUI's default
      // restore-to-trigger fires from the exit transition's completion and would silently overwrite
      // that move — confirmed by e2e: without this prop focus lands back on a button that may
      // already be gone rather than on the heading.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <DialogTitle id={TITLE_ID}>Delete Battle?</DialogTitle>
      <DialogContent>
        {/* overflowWrap: BattleSchema allows a 100-character name with no spaces, which the
            default `normal` will not break — it would overflow the 440px paper horizontally. */}
        <DialogContentText id={BODY_ID} sx={{ overflowWrap: 'anywhere' }}>
          “{battleName}” will be permanently deleted. This cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* autoFocus + first in DOM order: MUI's focus trap focuses the first focusable descendant
            unless something carries autoFocus, and for a destructive confirm the safe action must
            be what an immediate Enter press hits. */}
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
          Delete Battle
        </Button>
      </DialogActions>
    </Dialog>
  );
}
