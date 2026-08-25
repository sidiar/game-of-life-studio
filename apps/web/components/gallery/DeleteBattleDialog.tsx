'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import type { BattleRepository } from '@gol/persistence';
import { useInertBackground } from '@/lib/useInertBackground';

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
   * visible `“” will be permanently deleted.` on the way out. `useDeleteBattleDialog` holds its
   * `confirming` state until this dialog's `onExited` for exactly that reason.
   */
  battleName: string;
  pending: boolean;
  onCancel(): void;
  onConfirm(): void;
  /**
   * Fired once the close transition has fully finished. The caller owns focus restoration
   * (forced decision 4) and must not move focus before this point — see the effect in
   * `useDeleteBattleDialog` for the ordering this exists to guarantee.
   */
  onExited?(): void;
}

/**
 * FR-7.7's confirmation prompt. Makes no repository call and holds no async state — the whole of
 * both lives in `useDeleteBattleDialog` (below), which is what knows which battle is being
 * confirmed. This component stays a pure function of its props so it can be asserted on directly.
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
      // useDeleteBattleDialog manages focus for every close path (forced decision 4 — after a
      // successful delete the tile's Delete button is gone from the DOM, so focus goes to the
      // caller's fallback target; after a cancel it goes back to the button that opened this).
      // MUI's default
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

// Which battle the confirmation dialog is showing. Non-null from the moment delete is requested
// until the dialog's close transition has fully finished — NOT the same window as the dialog's
// `open` prop, which goes false at the start of that transition. See the two state declarations in
// the hook for why the phases are tracked separately.
interface ConfirmState {
  id: string;
  name: string;
}

export interface UseDeleteBattleDialogOptions {
  /**
   * AC3: battles only. The hook never receives an OrganismRepository, so it structurally cannot
   * touch the shared library — a workspace-level collection a battle deletion must leave alone.
   */
  battles: BattleRepository;
  /**
   * Where focus lands on the close paths whose trigger no longer exists — after a successful
   * delete the tile's Delete button unmounted with its tile, and without an explicit target the
   * browser drops focus to `<body>`, restarting the tab order at the top of the document (the same
   * failure the Story 1.10 review found with TooltipTrigger's blur()). Must be a programmatically
   * focusable element, i.e. carry `tabIndex={-1}` if it is not natively focusable.
   */
  restoreFocusRef: RefObject<HTMLElement | null>;
  /** Fired after `battles.delete()` RESOLVES, so the caller can re-list. Never before. */
  onDeleted(): void;
  /**
   * Fired when `battles.delete()` rejects (forced decision 3 — a CorruptDataError from an
   * unparseable gol:battles). The dialog has already been closed by the time this runs; the caller
   * owns whatever error surface it wants to show.
   */
  onDeleteFailed(): void;
}

export interface UseDeleteBattleDialogResult {
  /** Pass to a tile's delete affordance. `name` is what the dialog body quotes verbatim. */
  requestDelete(id: string, name: string): void;
  /** Spread onto `<DeleteBattleDialog {...dialogProps} />`. */
  dialogProps: DeleteBattleDialogProps;
}

/**
 * Every piece of state, ref and effect the delete confirmation needs: the three-phase open/exiting/
 * closed lifecycle, the in-flight latch, focus restoration across the exit transition, and the
 * background-inert window. The caller keeps only what is genuinely its own — the repository, the
 * fallback focus target, and what to do once a delete has succeeded or failed.
 *
 * Called from the component that RENDERS `<DeleteBattleDialog>`, never from inside the dialog
 * itself. That placement is load-bearing, not stylistic: `useInertBackground` and the focus effect
 * below must run as PARENT effects so MUI's focus-trap move (a child effect) has already happened.
 * See both call sites' comments.
 */
export function useDeleteBattleDialog({
  battles,
  restoreFocusRef,
  onDeleted,
  onDeleteFailed,
}: UseDeleteBattleDialogOptions): UseDeleteBattleDialogResult {
  // Two states, not one, because the dialog has three phases and not two: open, EXITING, closed.
  // `dialogOpen` drives the fade; `confirming` outlives it and is cleared only once the transition
  // has finished (handleExited). MUI keeps the dialog's children mounted for that whole ~195ms, so
  // clearing the name at close time rendered a visible `“” will be permanently deleted.` on the way
  // out (code review 2026-08-14). `confirming !== null` is therefore exactly the window "a
  // confirmation is on screen in some form", which is what the background needs to stay inert for.
  const [confirming, setConfirming] = useState<ConfirmState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // pending gates the dialog's own buttons while battles.delete() is in flight (Task 3).
  const [pending, setPending] = useState(false);

  // Called here rather than inside <DeleteBattleDialog> so it spans the exit transition too: MUI
  // clears the background's aria-hidden from ModalManager.remove(), which closeAfterTransition
  // defers to the transition's end (Modal/useModal.js:177-181). Releasing inert at close time
  // would leave a window in which the background is aria-hidden AND tabbable again — the exact
  // state the hook exists to prevent, reachable by pressing Tab during the fade-out. Running from
  // the PARENT of the dialog is also what keeps the ordering right: child effects (MUI's focus trap
  // moving focus onto Cancel) run first, so this never inerts a subtree that still holds focus.
  useInertBackground(confirming !== null);

  // Where focus goes once the close transition has finished; null means "no move pending".
  // 'trigger' is resolved by DOM lookup at restore time rather than captured as an element at
  // click time, because WebKit does not focus a <button> on click — reading document.activeElement
  // in the click handler yields <body> there, and the restore silently no-ops on that engine alone
  // (code review 2026-08-14). `disableRestoreFocus` turns MUI's own restore off for EVERY path,
  // not just the post-delete one, which is why cancel needs an explicit target at all.
  const focusAfterExitRef = useRef<
    { kind: 'trigger'; battleId: string } | { kind: 'fallback' } | null
  >(null);

  // A synchronous latch, unlike `pending` (state, and therefore only observable after a commit):
  // two activations dispatched before that commit — a double-click, or Enter and click together —
  // would both pass a `pending`-based guard and both call battles.delete(). The second, against an
  // id the first already removed, resolves into the catch and reports a FAILED delete to the caller
  // after a successful one.
  const deleteInFlightRef = useRef(false);

  // The focus move for every dialog close path, run as an EFFECT keyed on the confirmation
  // clearing rather than from a timer inside the exit callback. Ordering is the whole point and it
  // has to be guaranteed, not raced (code review 2026-08-14): by the time this runs, MUI has
  // cleared the background's aria-hidden (ModalManager.remove(), synchronous right after
  // onTransitionExited) and useInertBackground's cleanup has released `inert` — React runs all
  // cleanups for a commit before any setups, and that hook is called above this one. Focusing any
  // earlier targets a node that is still inert, where focus() is a spec-mandated no-op: a
  // setTimeout(0) here passed on Chromium and Firefox and failed on WebKit, which is exactly the
  // kind of ordering that must not be left to the event loop.
  useEffect(() => {
    if (confirming !== null) return;

    const intent = focusAfterExitRef.current;
    if (intent === null) return;
    focusAfterExitRef.current = null;

    // Do not steal focus the user has already placed somewhere real during the ~195ms transition.
    // "Loose" is <body>, nothing, or still inside the dialog that is closing — that last case is
    // not hypothetical: on WebKit this effect runs while the closing dialog is still mounted, so
    // activeElement is its Cancel button, and a body-only check would skip the restore there.
    const active = document.activeElement;
    const focusIsLoose =
      active === null || active === document.body || active.closest('[role="dialog"]') !== null;
    if (!focusIsLoose) return;

    // Looked up now, not held as a captured element: on the delete path the trigger went with its
    // tile, and querySelector simply returns null — which falls through to the caller's fallback
    // target, the same outcome forced decision 4 specifies.
    const trigger =
      intent.kind === 'trigger'
        ? document.querySelector<HTMLElement>(`[data-delete-battle-id="${intent.battleId}"]`)
        : null;

    (trigger ?? restoreFocusRef.current)?.focus();
  }, [confirming, restoreFocusRef]);

  const requestDelete = useCallback((id: string, name: string) => {
    setConfirming({ id, name });
    setDialogOpen(true);
  }, []);

  // Only once the exit transition has finished is it safe to drop the name the dialog was still
  // rendering and to release the background from inert. Clearing `confirming` does both, and is
  // what schedules the focus effect above.
  const handleExited = useCallback(() => {
    setConfirming(null);
  }, []);

  const handleCancel = useCallback(() => {
    // The tile's Delete button is still mounted on this path, so it is the correct restore target
    // — anything else moves the keyboard user somewhere they did not ask to go.
    if (confirming !== null)
      focusAfterExitRef.current = { kind: 'trigger', battleId: confirming.id };
    setDialogOpen(false);
  }, [confirming]);

  const handleConfirm = useCallback(async () => {
    if (confirming === null || deleteInFlightRef.current) return;
    deleteInFlightRef.current = true;
    setPending(true);
    try {
      await battles.delete(confirming.id);
      // The tile that owned the trigger button is about to unmount, so the caller's fallback is the
      // restore target; handleExited performs the move once the transition has finished.
      focusAfterExitRef.current = { kind: 'fallback' };
      setDialogOpen(false);
      onDeleted();
    } catch {
      // Forced decision 3: a rejecting delete closes the dialog and hands the failure to the
      // caller. No retry control, no new copy — see Task 1's "out of scope" note.
      focusAfterExitRef.current = { kind: 'fallback' };
      setDialogOpen(false);
      onDeleteFailed();
    } finally {
      deleteInFlightRef.current = false;
      setPending(false);
    }
  }, [battles, confirming, onDeleted, onDeleteFailed]);

  const dialogProps = useMemo<DeleteBattleDialogProps>(
    () => ({
      open: dialogOpen,
      battleName: confirming?.name ?? '',
      pending,
      onCancel: handleCancel,
      onConfirm: handleConfirm,
      onExited: handleExited,
    }),
    [dialogOpen, confirming, pending, handleCancel, handleConfirm, handleExited],
  );

  return { requestDelete, dialogProps };
}
