'use client';

import { useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import {
  ruleDeleteSentence,
  RULE_DELETE_ACTION,
  RULE_DELETE_TITLE,
} from '@/lib/organisms/ruleDeleteCopy';

// Per-component imports only (AR-35) — imported STATICALLY from `<RulesEditor>`, which is already
// inside the editor's own lazy chunk (`EditorUnsavedChangesDialog.tsx`'s header records why a
// nested `dynamic()` here would split a chunk for nothing).

const TITLE_ID = 'rule-delete-confirm-dialog-title';
const BODY_ID = 'rule-delete-confirm-dialog-body';

// The clinical mockup's dialog width, matching every other dialog in this app.
const PAPER_MAX_WIDTH = '440px';

// Pulled out of the theme's MuiButton root override, for the reason the shipped dialogs record: on
// `root` it applies to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

// The `<EditorUnsavedChangesDialog>` idiom, copied rather than imported (both are ~3 lines, and
// that file's own header explains why this app does not import across dialog components): a HELD
// Enter on Cancel/Delete Rule auto-repeats past the keydown that opened this dialog. Scoped to
// these buttons' own `onKeyDown`, never a `document` listener (the 2026-09-26 regression that
// idiom's header records).
function ignoreRepeatEnter(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (event.key === 'Enter' && event.repeat) event.preventDefault();
}

export interface RuleDeleteConfirmDialogProps {
  open: boolean;
  /**
   * Already resolved (`ruleDeleteLabel`) and held by the caller until `onExited` — MUI keeps the
   * children mounted through the exit fade, and an emptied label would render a visible `“”` on
   * the way out (the `<OrganismDeleteConfirmDialog>` `organismName` lesson).
   */
  ruleLabel: string;
  /** Cancel, Escape (ignoring a held repeat) and the backdrop (once entered, FD4). Writes nothing. */
  onCancel(): void;
  /** Delete Rule (once entered, FD4). */
  onConfirm(): void;
  /** Fired once the close transition has fully finished — the caller's cue to act on the outcome
   * (in `onExited`, never in the click's own commit, FD3) and restore focus (never before: the
   * project-context live-region trap). */
  onExited?(): void;
}

/**
 * Story 4.26's confirmation before a survival rule is removed (FR-2.5, UX-DR10). Composed exactly
 * like `<OrganismDeleteConfirmDialog>` / `<DeleteBattleDialog>` — 440px paper, `disableRestoreFocus`,
 * `onTransitionExited`, `aria-labelledby` + `aria-describedby`, `BUTTON_SX`, Cancel first and
 * `autoFocus`ed — so the app keeps one dialog idiom.
 *
 * A pure function of its props: no repository, no `@gol/domain` import, no draft mutation. Which
 * rule is being confirmed, the removal itself, and every close path's focus move are all
 * `<RulesEditor>`'s.
 *
 * FD4 — the enter guard: the paper is centred over the rules column (the middle column), so the
 * second click of a double-click on a card's ✕ can land on the backdrop (an instant dismiss) or on
 * Delete Rule itself once the dialog has opened under the pointer. `entered` is set from the
 * `Fade`'s own `onEntered` (reached through `slotProps.transition`, which — verified against
 * `node_modules/@mui/material/Dialog/Dialog.js`'s `useSlot('transition', …)` — is not overwritten
 * by Modal's own transition wiring) and reset whenever `open` becomes true. Until it is set, a
 * backdrop dismiss and the Delete Rule click are both inert: no `disabled` flash (a visible cue an
 * axe scan can catch mid-fade) and no `pointer-events` trick that would let the click fall through
 * to the inert editor beneath. Escape and Cancel stay live throughout — both are non-destructive.
 * `data-entered` on the paper is the hook every test (and the e2e) waits on before touching either
 * destructive control.
 */
export default function RuleDeleteConfirmDialog({
  open,
  ruleLabel,
  onCancel,
  onConfirm,
  onExited,
}: RuleDeleteConfirmDialogProps) {
  const [entered, setEntered] = useState(false);
  // The render-time "adjust state when a prop changes" pattern (`project-context.md`;
  // `<OrganismEditorModal>`'s `prevDeleteError` is the house precedent) — NOT a `useEffect`, which
  // would call `setState` after a commit this render already painted stale. Resets on every fresh
  // open: this component is only ever mounted for the life of one confirmation window
  // (`<RulesEditor>` renders it iff `confirming !== null`), but the guard is written defensively
  // against `open` cycling on an already-mounted instance too.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setEntered(false);
  }

  // A separate variable, not an inline object literal: MUI's `slotProps.paper` type has no
  // `data-*` field, and TypeScript's excess-property check only fires against a FRESH literal —
  // widening through this `const` first is what lets the guard's own test hook through without a
  // cast that could hide a real typo.
  const paperSlotProps = {
    sx: { maxWidth: PAPER_MAX_WIDTH },
    'data-entered': entered ? '' : undefined,
  };

  return (
    <Dialog
      open={open}
      onClose={(event, reason) => {
        // FD5 — a held Escape's auto-repeat must not cycle this dialog.
        if (reason === 'escapeKeyDown' && 'repeat' in event && event.repeat === true) return;
        // FD4 — the backdrop is a no-op until the enter transition has actually finished.
        if (reason === 'backdropClick' && !entered) return;
        onCancel();
      }}
      onTransitionExited={onExited}
      // `<RulesEditor>` manages focus for every close path (AC2/AC3): a DOM lookup once the exit
      // transition has finished, because WebKit never focuses a `<button>` on click in the first
      // place.
      disableRestoreFocus
      slotProps={{
        paper: paperSlotProps,
        transition: { onEntered: () => setEntered(true) },
      }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <DialogTitle id={TITLE_ID}>{RULE_DELETE_TITLE}</DialogTitle>
      <DialogContent>
        {/* `overflowWrap`: a 100-char, space-free Summary must not widen the 440px paper. */}
        <DialogContentText id={BODY_ID} sx={{ overflowWrap: 'anywhere' }}>
          {ruleDeleteSentence(ruleLabel)}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* `autoFocus` + first in DOM order: for a destructive confirm the safe action is what an
            immediate Enter hits. Live even before `entered` — Cancel is safe. */}
        <Button
          type="button"
          onClick={onCancel}
          onKeyDown={ignoreRepeatEnter}
          autoFocus
          color="inherit"
          variant="outlined"
          sx={BUTTON_SX}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => {
            // FD4 — the enter guard: no visible `disabled` state, just an ignored click.
            if (!entered) return;
            onConfirm();
          }}
          onKeyDown={ignoreRepeatEnter}
          color="error"
          variant="contained"
          sx={BUTTON_SX}
        >
          {RULE_DELETE_ACTION}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
