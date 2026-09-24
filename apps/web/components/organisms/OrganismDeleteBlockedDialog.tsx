'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { styled } from '@mui/material/styles';
import {
  BATTLE_BLOCK_REMEDY,
  battleBlockSentence,
  deleteBlockTitle,
  RULE_BLOCK_REMEDY,
  ruleBlockSentence,
} from '@/lib/organisms/deleteBlockCopy';

// Per-component imports only (AR-35) — `<OrganismLibrary>` reaches this file through
// `next/dynamic`, precisely so the MUI `Dialog` stack stays out of `/organisms`'s first load
// (`OrganismInUseDialog.tsx` records the identical reason and measurement).

const TITLE_ID = 'organism-delete-blocked-dialog-title';
const BODY_ID = 'organism-delete-blocked-dialog-body';

// The clinical mockup's dialog width, matching every other dialog in this app.
const PAPER_MAX_WIDTH = '440px';

// Pulled out of the theme's MuiButton root override, for the reason the shipped dialogs record: on
// `root` it applies to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

// `overflowWrap: 'anywhere'` — the `CardName` precedent (`OrganismCard.tsx`): both `Organism.name`
// and `Battle.name` allow a long, space-free string, and a list item must not force the 440px
// paper wider than every other dialog's.
const NameList = styled('ul')({
  margin: '4px 0 12px',
  paddingLeft: '20px',
  overflowWrap: 'anywhere',
});

export interface OrganismDeleteBlockedDialogProps {
  open: boolean;
  /** Already display-resolved (`toDisplayOrganism`) — this component performs no resolution of
   * its own, no repository access, no `@gol/domain` import. */
  organismName: string;
  /** The battles placing the organism, display-resolved (`usageBattleNames`). Empty renders no
   * battle section (AC4: a section renders only when its list is non-empty). */
  battleNames: readonly string[];
  /** The organisms whose rules target it, display-resolved (`referencingOrganismNames`). Empty
   * renders no rule section. */
  referencingNames: readonly string[];
  /** Escape, backdrop and OK all route here. Non-destructive (AC5): nothing this dialog does ever
   * calls `organisms.delete`. */
  onClose(): void;
  /** Fired once the close transition has fully finished — the caller's cue to clear the blocked
   * state and restore focus to the card's Delete button (FD9). */
  onExited?(): void;
}

/**
 * Story 4.21's hard-block dialog (FR-1.4, M7, Decision E.5, UX-DR15): tells the whole truth once —
 * battles first, then rules, whichever apply (FD4) — behind exactly one, non-destructive action.
 *
 * Composed like `<OrganismInUseDialog>` / `<DeleteBattleDialog>` (FD7 in the story's Dev Notes):
 * 440px paper, `disableRestoreFocus`, `onTransitionExited`, `aria-labelledby` + `aria-describedby`,
 * `BUTTON_SX` — the app keeps ONE dialog idiom. A pure function of its props: no repository, no
 * `@gol/domain` import, no derivation — `<OrganismLibrary>` computes the verdict and resolves
 * every name (from the SAME settled data the verdict came from, FD7) before this ever mounts.
 *
 * No live region of its own (FD10): the dialog IS the announcement, since MUI's focus trap taking
 * focus on open is already a context change assistive tech reports. `aria-describedby` names the
 * WHOLE content wrapper, so both sections — when both render — are read as one description, and
 * the content stays mounted through the ~195ms exit fade (the `<DeleteBattleDialog>` `battleName`
 * precedent: names are held by the caller until `onExited`, never cleared at close).
 */
export default function OrganismDeleteBlockedDialog({
  open,
  organismName,
  battleNames,
  referencingNames,
  onClose,
  onExited,
}: OrganismDeleteBlockedDialogProps) {
  return (
    <Dialog
      open={open}
      // Fires for both Escape and backdrop click; OK is the dialog's only other action and does
      // the identical nothing, so there is no reason to branch on MUI's `reason` argument, and no
      // write is ever in flight to guard against (unlike `<DeleteBattleDialog>`'s `pending` gate).
      onClose={onClose}
      onTransitionExited={onExited}
      // `<OrganismLibrary>` manages focus for the close path (FD9) — a DOM lookup by
      // `data-delete-organism-id` once the exit transition has finished. MUI's default
      // restore-to-trigger reads `document.activeElement` at OPEN time, and WebKit does not focus
      // a `<button>` on click, so left on it would faithfully restore focus to `<body>` there.
      disableRestoreFocus
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH } } }}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      {/* Consequence first, the convention every shipped dialog in this app follows. */}
      <DialogTitle id={TITLE_ID} sx={{ overflowWrap: 'anywhere' }}>
        {deleteBlockTitle(organismName)}
      </DialogTitle>
      <DialogContent id={BODY_ID}>
        {battleNames.length > 0 && (
          <div>
            <DialogContentText>{battleBlockSentence(battleNames.length)}</DialogContentText>
            <NameList>
              {battleNames.map((name, index) => (
                // The index is part of the key on purpose: two battles may legitimately resolve to
                // the same display name (`Untitled Battle`, `Current Battle (unsaved)`), and a
                // name-only key would collide into a React warning (`UsageIndicator.tsx`'s
                // identical precedent).
                <li key={`${name}-${index}`}>{name}</li>
              ))}
            </NameList>
            <DialogContentText>{BATTLE_BLOCK_REMEDY}</DialogContentText>
          </div>
        )}
        {referencingNames.length > 0 && (
          <div>
            <DialogContentText>{ruleBlockSentence(referencingNames.length)}</DialogContentText>
            <NameList>
              {referencingNames.map((name, index) => (
                <li key={`${name}-${index}`}>{name}</li>
              ))}
            </NameList>
            <DialogContentText>{RULE_BLOCK_REMEDY}</DialogContentText>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        {/* The dialog's ONE action (AC5) — no confirm, no "delete anyway", no link. `autoFocus`:
            MUI's focus trap focuses the first focusable descendant unless something carries it. */}
        <Button type="button" onClick={onClose} autoFocus variant="contained" sx={BUTTON_SX}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
