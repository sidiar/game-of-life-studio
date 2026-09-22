'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

// Per-component imports only (AR-35) — `import { Dialog } from '@mui/material'` pulls the whole
// barrel. On this route that is not merely a convention: `<OrganismLibrary>` reaches this file
// through `next/dynamic` rather than a static import, precisely so the MUI `Dialog` stack stays
// out of `/organisms`'s first load (the editor modal's call site records the measurement).

const TITLE_ID = 'organism-in-use-dialog-title';
const BODY_ID = 'organism-in-use-dialog-body';

// The clinical mockup's dialog width, matching `<UnsavedChangesDialog>`, `<DeleteBattleDialog>`
// and `<ResizeClipWarningDialog>`. Set here rather than in the theme's MuiDialog.paper
// styleOverride, which would apply to every future dialog and outrank MUI's own maxWidth prop.
const PAPER_MAX_WIDTH = '440px';

// Pulled out of the theme's MuiButton root override for the same reason the shipped dialogs
// record: on `root` they apply to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

/** `N Battle` / `N Battles` — real pluralisation, never the spec's "Battle(s)" shorthand (the
 * count badge's `Organism`/`Organisms` precedent). Exported for the tests and for the two copy
 * sites below, so the title and the sentence cannot disagree. */
function battleCount(n: number): string {
  return `${n} ${n === 1 ? 'Battle' : 'Battles'}`;
}

/** The AC's own name for the warning — "Used in [N] Battle(s)" — as the dialog's title. */
export function battleCountLabel(usedInBattles: number): string {
  return `Used in ${battleCount(usedInBattles)}`;
}

/** FR-1.3's sentence, verbatim from the PRD (`prd.md:125`), with the count interpolated. */
export function organismInUseMessage(usedInBattles: number): string {
  return `This organism is used in ${battleCount(usedInBattles)}. Editing it will affect all Battles that use it. Clone this organism first to create a Battle-specific variant?`;
}

export interface OrganismInUseDialogProps {
  open: boolean;
  /** The number of DISTINCT saved battles placing the organism (Decision H: "used" = placed),
   * from `buildUsageIndex` — never assumed `0` while the battle list is still loading. */
  usedInBattles: number;
  /** Escape and backdrop both route here. Changes nothing at all; focus goes back to the card. */
  onCancel(): void;
  /** Clone the organism, then proceed to the editor on the CLONE, once this dialog has fully
   * exited (Story 4.18, AC9). The write itself is not this dialog's concern — it fires the
   * callback and waits for `pending` to clear. */
  onCloneAndEdit(): void;
  /** Proceed to the editor on the SAME organism, once this dialog has fully exited. */
  onEditAnyway(): void;
  /**
   * A Clone & Edit write started from this dialog is in flight (Story 4.18, FD6). Disables all
   * three actions AND guards `onClose`, so Escape/backdrop cannot dismiss the dialog mid-write —
   * the same window `<UnsavedChangesDialog>`'s `pending` closes. `disableEscapeKeyDown` was
   * removed from Modal in MUI v9, so `onClose` is the only place that guard can live.
   */
  pending: boolean;
  /** Fired once the close transition has fully finished — the hook's cue to open the editor
   * (after Edit Anyway or Clone & Edit) or to unmount this dialog and restore focus (after
   * Cancel). */
  onExited?(): void;
}

/**
 * FR-1.3's "Used in [N] Battle(s)" warning (Story 4.17, AC2; M7 — the count is informational
 * here, the delete BLOCK is Story 4.21's; UX-DR6): shown BEFORE the editor opens on an organism
 * that at least one saved battle places, so an edit that will change every one of those battles
 * (FR-7.15) is deliberate.
 *
 * Three actions now: Cancel / Clone & Edit / Edit Anyway, the `<UnsavedChangesDialog>` shape —
 * safe-first `autoFocus`, middle, recommended-last `contained`. Clone & Edit routes through
 * `useOrganismEditorModal`'s injected writer and the hook's `proceedRef` handoff (Story 4.18):
 * this dialog fires `onCloneAndEdit()` and waits for `pending` to clear, and owns no
 * "[Name] (Copy)", colour or repository logic of its own — that stays in `<OrganismLibrary>`
 * (FD3). `pending` is the clone's write window and is why `onClose` is guarded: without it,
 * Escape during the write closes the gate before the clone id is stashed, and the write lands
 * with no editor and no explanation.
 *
 * The battle-origin variant (FR-3.12 / Story 4.24) is **Edit Anyway / Cancel only** — no Clone &
 * Edit from the Battle Editor (M5, PRD `:127`) — so 4.24 will need an `origin` prop or a
 * `cloneable` flag to withhold the middle button; this comment is where that decision lands.
 * `organismInUseMessage` is unchanged: its clone sentence is now true.
 *
 * Composed exactly like `<UnsavedChangesDialog>` — the paper width, Cancel-first with
 * `autoFocus`, `disableRestoreFocus`, `onTransitionExited` — so the app keeps ONE dialog idiom.
 * Holds no state and makes no repository call: the usage count and the organism belong to
 * `useOrganismEditorModal`, which mounts this dialog and, on Edit Anyway, opens the editor only
 * after `onExited` (one modal on screen at a time).
 */
export default function OrganismInUseDialog({
  open,
  usedInBattles,
  onCancel,
  onCloneAndEdit,
  onEditAnyway,
  pending,
  onExited,
}: OrganismInUseDialogProps) {
  return (
    <Dialog
      open={open}
      // Fires for both Escape and backdrop click; Cancel is the non-destructive action either way,
      // so there is no reason to branch on MUI's `reason` argument — but it must not fire while a
      // clone write is in flight. `disableEscapeKeyDown` was removed from Modal in MUI v9, so this
      // callback is the ONLY place that guard can live (`<DeleteBattleDialog>` records the
      // finding).
      onClose={() => {
        if (pending) return;
        onCancel();
      }}
      onTransitionExited={onExited}
      // `useOrganismEditorModal` manages focus for every close path. MUI's default
      // restore-to-trigger reads `document.activeElement` at OPEN time, and WebKit does not focus
      // a `<button>` on click, so on that engine alone it faithfully restores focus to `<body>`.
      // Left on, it would also fire from the exit transition and silently overwrite the explicit
      // move — or, after Edit Anyway, fight the editor's own focus trap.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      {/* CONSEQUENCE FIRST, the convention the shipped dialogs follow: the heading names what is
          at stake, not what the buttons do. */}
      <DialogTitle id={TITLE_ID}>{battleCountLabel(usedInBattles)}</DialogTitle>
      <DialogContent>
        <DialogContentText id={BODY_ID}>{organismInUseMessage(usedInBattles)}</DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* Safe first, recommended last. `autoFocus` + first in DOM order: MUI's focus trap
            focuses the first focusable descendant unless something carries autoFocus, and an
            immediate Enter must hit the action that changes nothing. Escape maps here too. */}
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
        {/* Middle slot, plain — the `<UnsavedChangesDialog>` shape's middle button, text variant,
            default colour. The accessible name has a real `&`, written `&amp;` in JSX. */}
        <Button type="button" onClick={onCloneAndEdit} disabled={pending} sx={BUTTON_SX}>
          Clone &amp; Edit
        </Button>
        <Button
          type="button"
          onClick={onEditAnyway}
          disabled={pending}
          variant="contained"
          sx={BUTTON_SX}
        >
          Edit Anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
