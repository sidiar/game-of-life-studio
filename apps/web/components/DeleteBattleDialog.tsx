'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { useInertBackground } from '@/lib/useInertBackground';

// Per-component imports only (AR-35) — `import { Dialog } from '@mui/material'` pulls the whole
// barrel, and this story is already spending bundle budget on the Dialog stack (Task 9); a barrel
// import would make the measured delta unexplainable.

const TITLE_ID = 'delete-battle-dialog-title';
const BODY_ID = 'delete-battle-dialog-body';

export interface DeleteBattleDialogProps {
  open: boolean;
  battleName: string;
  pending: boolean;
  onCancel(): void;
  onConfirm(): void;
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
}: DeleteBattleDialogProps) {
  // Task 5 measurement: axe's aria-hidden-focus rule lands in `incomplete` under jsdom (no real
  // layout to resolve visibility against), not `violations` — but the structural fact behind it is
  // real, so the fix ships rather than waiting for a real-browser run to confirm it. See the hook's
  // own comment for the full measurement.
  useInertBackground(open);

  return (
    <Dialog
      open={open}
      // Fires for both Escape and backdrop click. Dismissal is the non-destructive action either
      // way, so there is no reason to branch on MUI's `reason` argument here.
      onClose={onCancel}
      // <BattleGallery> manages its own post-delete focus target (forced decision 4 — the tile's
      // Delete button that opened this dialog is gone from the DOM after a successful delete, so
      // focus moves to the Gallery heading instead). MUI's default restore-to-trigger behaviour
      // fires from the exit TRANSITION's completion (~195ms after close, well after any
      // synchronous focus() call made at close time) and would silently overwrite that move —
      // confirmed by e2e: without this prop, focus lands back on a button that may already be
      // gone rather than on the heading.
      disableRestoreFocus
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <DialogTitle id={TITLE_ID}>Delete Battle?</DialogTitle>
      <DialogContent>
        <DialogContentText id={BODY_ID}>
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
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          color="error"
          variant="contained"
        >
          Delete Battle
        </Button>
      </DialogActions>
    </Dialog>
  );
}
