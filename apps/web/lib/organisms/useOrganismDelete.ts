'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildRuleReferenceIndex,
  buildUsageIndex,
  organismDeleteVerdict,
  type BattleSummary,
  type Organism,
  type RuleReferenceIndex,
  type UsageIndex,
} from '@gol/domain';
import type { BattleRepository, OrganismRepository } from '@gol/persistence';
import type { OrganismDeleteBlockedDialogProps } from '@/components/organisms/OrganismDeleteBlockedDialog';
import type { OrganismDeleteConfirmDialogProps } from '@/components/organisms/OrganismDeleteConfirmDialog';
import { toDisplayOrganism } from '@/lib/displayOrganisms';
import {
  ORGANISM_DELETE_FAILED,
  ORGANISM_DELETE_GONE,
  ORGANISM_DELETED,
} from '@/lib/organisms/saveOutcome';
import { referencingOrganismNames, usageBattleNames } from '@/lib/organisms/usageLabels';
import { useInertBackground } from '@/lib/useInertBackground';

/**
 * Story 4.22: the Library's organism-delete controller — Story 4.21's inline block window, grown
 * into confirm + re-verify + write + outcome, and extracted past 4.21 FD8's "roughly 30 lines"
 * trigger. It owns ONE window (the confirmation or the block dialog, never both), the in-flight
 * latch, the focus restore across the exit, the background-inert window and the queued outcome.
 * The caller keeps the repositories (injected here, AR-2/AR-27), the settled data the cards render
 * from, and what "reload" and "close the editor" mean.
 *
 * ⚠️ Lives in `lib/organisms/`, NOT beside either dialog — the `useOrganismEditorModal` head
 * comment's reason: both dialogs are `next/dynamic` boundaries of `<OrganismLibrary>`, and a hook
 * exported from either file would have to be imported statically, pulling the MUI `Dialog` stack
 * back into `/organisms`'s first load. Both props imports above are `import type` and must stay so.
 *
 * ⚠️ Call from the component that RENDERS the dialogs, so `useInertBackground` and the focus effect
 * run as the dialogs' PARENT effects (after MUI's focus-trap move) — the `useDeleteBattleDialog`
 * placement rule.
 *
 * The verdict is `organismDeleteVerdict`, called — never re-derived (Story 4.21 FD3) — twice per
 * delete: synchronously at click time from the Library's SETTLED data (the verdict the card
 * showed), and again at Confirm from a FRESH read of both lists, immediately before the write (FD4:
 * a battle saved in another tab since the Library loaded is invisible to the settled snapshot, and
 * deleting on it would create the dangling reference FR-1.4 guarantees is unreachable).
 */

export type OrganismDeleteOrigin = 'card' | 'editor';

/** The one window cell — which dialog is mounted, about which organism, opened from where. Held
 * through the exit fade (the `<DeleteBattleDialog>` `confirming` precedent). */
interface DeleteWindow {
  organismId: string;
  organismName: string;
  origin: OrganismDeleteOrigin;
  kind: 'confirm' | 'blocked';
  battleNames: readonly string[];
  referencingNames: readonly string[];
}

/** Where focus is owed once the window has exited (FD8). */
type RestoreIntent =
  | { kind: 'card'; organismId: string }
  | { kind: 'editor' }
  | { kind: 'editor-save' }
  | { kind: 'create' }
  | null;

/** What a Confirm settled on, consumed by the exit handler — never published from the writer
 * (the project-context live-region trap: the background is still inert until the exit). */
interface ConfirmOutcome {
  origin: OrganismDeleteOrigin;
  deleted: boolean;
  failed: boolean;
  /** The fresh read found the record already gone (deleted in another tab). */
  gone: boolean;
  /** A fresh read completed, so the cards may be stale: reload on exit. */
  reload: boolean;
  /** FD5: the fresh verdict was `blocked` — hand off to the block dialog with the FRESH names,
   * the organism's own included. */
  handoff: {
    organismName: string;
    battleNames: readonly string[];
    referencingNames: readonly string[];
  } | null;
}

export interface UseOrganismDeleteOptions {
  organisms: OrganismRepository;
  battles: BattleRepository;
  /** The Library's settled roster and battle list — the SAME data the cards' verdicts come from,
   * unfiltered by search (Story 4.21 FD7), for the click-time verdict and the block names. */
  library: readonly Organism[];
  summaries: readonly BattleSummary[];
  usage: UsageIndex;
  ruleIndex: RuleReferenceIndex;
  /** Stale-while-revalidate reload of the Library's resource. */
  reload(): void;
  /**
   * Whether a request from `origin` may open a window now. The Library's rule: a CARD request only
   * while neither the editor nor the in-use gate is mounted (a programmatic caller could otherwise
   * open a dialog under them); an EDITOR request only while the editor is — the one case where a
   * Library-owned dialog stacks over it (FD9).
   */
  canOpen(origin: OrganismDeleteOrigin): boolean;
  /** Fired in the commit that releases the window — the Library publishes its queued card-Clone
   * failure here (Story 4.21's `handleDeleteExited` rule, kept). */
  onWindowReleased?(): void;
  /**
   * An editor-origin delete succeeded and the confirmation has EXITED: close the editor now. Fired
   * only from the confirmation's exit handler, never together with the confirmation's own close
   * (FD9 — the two inert windows must unwind stacked-first).
   */
  onEditorDeleted?(): void;
}

export interface UseOrganismDeleteResult {
  /** A card's or the editor's Delete click. Synchronous; a no-op for a `protected` verdict. */
  requestDelete(organism: Organism, origin: OrganismDeleteOrigin): void;
  /** Render-time "a delete window is on screen in some form". */
  windowActive: boolean;
  /** The window AUTHORITY, for async callers and same-tick guards (Story 4.21 review: on the
   * first Delete of a session the lazy chunk has not resolved and nothing is inert yet). */
  isWindowActive(): boolean;
  /** Non-null iff the confirmation is mounted. Exactly one of these two is non-null per window. */
  confirmProps: OrganismDeleteConfirmDialogProps | null;
  blockedProps: OrganismDeleteBlockedDialogProps | null;
  /** The published `Organism deleted` status, for the Library's always-mounted region. */
  toast: string | null;
  /** A card-origin refusal, for the Library's `role="alert"` line. */
  deleteError: string | null;
  /** An editor-origin refusal (FD12), or the record found already gone at Confirm (review decision
   * (b)), rendered INSIDE the editor — the Library's own alert would sit under the still-open,
   * inert editor and never be heard. */
  editorDeleteError: string | null;
  /** Compose into the editor's `onExited`, AFTER the hook's own: publishes the toast held for an
   * editor-origin delete (FD7) and clears the editor-origin alert with the editor it lived in. */
  onEditorExited(): void;
}

export function useOrganismDelete({
  organisms,
  battles,
  library,
  summaries,
  usage,
  ruleIndex,
  reload,
  canOpen,
  onWindowReleased,
  onEditorDeleted,
}: UseOrganismDeleteOptions): UseOrganismDeleteResult {
  // Two cells, not one — the three-phase open / EXITING / closed shape: `deleteWindow` outlives the fade
  // so the dialog never flashes empty on the way out, `dialogOpen` drives the fade alone.
  const [deleteWindow, setDeleteWindow] = useState<DeleteWindow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // The affordance. `latchRef` is the authority: two activations dispatched before `pending`
  // commits (a double-click, Enter plus click) would both pass a state-based guard.
  const [pending, setPending] = useState(false);
  const latchRef = useRef(false);
  // Story 4.21's `deleteWindowRef`, moved here: set synchronously on the click, cleared only when
  // the window is released.
  const windowRef = useRef(false);
  const restoreRef = useRef<RestoreIntent>(null);
  const outcomeRef = useRef<ConfirmOutcome | null>(null);
  // FD7: an editor-origin success's toast waits for the EDITOR's exit, not the confirmation's.
  const heldToastRef = useRef<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editorDeleteError, setEditorDeleteError] = useState<string | null>(null);

  // A SEPARATE call from `useOrganismEditorModal`'s own `useInertBackground(anyMounted)`. For the
  // card origin the two windows never overlap (`canOpen`). For the editor origin they NEST — this
  // window opens over the mounted editor — which is safe only because this one always closes
  // first: its restore map recorded the page root as "prior: inert" (the editor's doing) and the
  // editor's portal as "prior: not inert", so this cleanup hands the editor back live while the
  // page root stays inert under it, and the editor's own cleanup, a later commit, releases the
  // page root last. The exit handler below closes the editor only AFTER this window has exited
  // (FD9); closing both in one handler would unwind the maps in the wrong order.
  //
  // ORDER IS LOAD-BEARING: this call sits ABOVE the focus-restore effect below, so on the commit
  // that clears `deleteWindow` its cleanup (lifting `inert`) runs before that effect's `.focus()` — a
  // `.focus()` into a still-inert subtree is a silent no-op in a real browser.
  useInertBackground(deleteWindow !== null);

  useEffect(() => {
    if (deleteWindow !== null) return;
    const intent = restoreRef.current;
    if (intent === null) return;
    restoreRef.current = null;

    // Do not steal focus the user already placed somewhere real (the `useDeleteBattleDialog`
    // `focusIsLoose` rule). "Loose" also covers anywhere inside a MUI modal root
    // (`role="presentation"`): for the editor origin, MUI's editor focus trap may have parked focus
    // on its own container the moment the stacked dialog stopped being the top modal, and nothing
    // else in the editor could have taken focus while it was inert.
    const active = document.activeElement;
    const focusIsLoose =
      active === null ||
      active === document.body ||
      active.closest('[role="dialog"], [role="presentation"]') !== null;
    if (!focusIsLoose) return;

    // DOM lookups by `CSS.escape`d id, never a captured element (FD8 — WebKit does not focus a
    // clicked `<button>`, and after a delete the trigger is gone anyway).
    const target =
      intent.kind === 'card'
        ? document.querySelector<HTMLElement>(
            `[data-delete-organism-id="${CSS.escape(intent.organismId)}"]`,
          )
        : intent.kind === 'editor'
          ? document.querySelector<HTMLElement>('[data-editor-delete-organism]')
          : intent.kind === 'editor-save'
            ? document.querySelector<HTMLElement>('[data-editor-save]')
            : null;
    (target ?? document.querySelector<HTMLElement>('[data-create-organism]'))?.focus();
  }, [deleteWindow]);

  const requestDelete = useCallback(
    (organism: Organism, origin: OrganismDeleteOrigin) => {
      if (windowRef.current || !canOpen(origin)) return;
      // The click-time verdict, from the settled data the card rendered from (Story 4.21 FD7).
      const verdict = organismDeleteVerdict(organism.id, usage, ruleIndex);
      // Defence in depth: a protected Delete is `disabled` on both surfaces (FD6).
      if (verdict.kind === 'protected') return;
      windowRef.current = true;
      restoreRef.current =
        origin === 'card' ? { kind: 'card', organismId: organism.id } : { kind: 'editor' };
      // Cleared at the START of every request, so a repeat outcome re-mounts its node and
      // re-announces (the editor's `saveOrganism` idiom). The held toast too: an editor close
      // that `onEditorDeleted` did not produce (a caller that passes none) must not publish a
      // stale "Organism deleted" on some later, unrelated editor exit.
      heldToastRef.current = null;
      setToast(null);
      setDeleteError(null);
      setEditorDeleteError(null);
      setDeleteWindow({
        organismId: organism.id,
        organismName: toDisplayOrganism(organism).name,
        origin,
        kind: verdict.kind === 'blocked' ? 'blocked' : 'confirm',
        battleNames: verdict.kind === 'blocked' ? usageBattleNames(verdict.battles, summaries) : [],
        referencingNames:
          verdict.kind === 'blocked'
            ? referencingOrganismNames(verdict.referencingOrganismIds, library)
            : [],
      });
      setDialogOpen(true);
    },
    [canOpen, usage, ruleIndex, summaries, library],
  );

  // Cancel, Escape and the backdrop (the dialog guards the last two on `pending`); the latch
  // guard covers a programmatic caller and the exit fade, when `pending` is still held.
  const handleCancel = useCallback(() => {
    if (latchRef.current) return;
    setDialogOpen(false);
  }, []);

  // AC3 / AC6 / AC7. A synchronous callback that `void`s an inner async run (React 19: never hand
  // an `async` function to a `(): void` prop).
  const handleConfirm = useCallback(() => {
    // `!dialogOpen`: the buttons stay enabled through a Cancel's ~195 ms exit fade (`pending` is
    // false), so a Confirm landing in that window would write after the cancel, and the fade's
    // own exit handler — running before the write settles — would release the window and leave
    // the outcome queued for the NEXT window to publish as its own.
    if (deleteWindow === null || deleteWindow.kind !== 'confirm' || !dialogOpen || latchRef.current)
      return;
    latchRef.current = true;
    setPending(true);
    const { organismId, origin } = deleteWindow;
    void (async () => {
      const outcome: ConfirmOutcome = {
        origin,
        deleted: false,
        failed: false,
        gone: false,
        reload: false,
        handoff: null,
      };
      try {
        // FD4: BOTH lists, one `Promise.all` (`'ready'` means both, Story 4.17 FD2), and no
        // `.catch(() => [])` on either — a swallowed rejection reads as "unused" and deletes.
        const [freshOrganisms, freshSummaries] = await Promise.all([
          organisms.list(),
          battles.list(),
        ]);
        outcome.reload = true;
        const freshRecord = freshOrganisms.find((organism) => organism.id === organismId);
        if (freshRecord === undefined) {
          // Deleted elsewhere (another tab): nothing to write, and no toast — this action deleted
          // nothing. The card is gone after the reload, so focus falls back to Create. The editor
          // origin keeps the editor open (review decision (b)) and is told why in-editor at the
          // exit, so its next Save is a deliberate re-create. Its Delete is disabled while that
          // alert shows (second review decision (a)) and a disabled button cannot take focus, so
          // focus goes to the editor's Save instead.
          outcome.gone = true;
          restoreRef.current = origin === 'card' ? { kind: 'create' } : { kind: 'editor-save' };
        } else {
          const verdict = organismDeleteVerdict(
            organismId,
            buildUsageIndex(freshSummaries),
            buildRuleReferenceIndex(freshOrganisms),
          );
          if (verdict.kind === 'allowed') {
            await organisms.delete(organismId);
            outcome.deleted = true;
            // FD8: the card's Delete is gone. For the editor origin the editor hook's own restore
            // (its `[data-edit-organism-id]` lookup, falling back to Create) runs when the editor
            // exits — a second move here would fight it.
            restoreRef.current = origin === 'card' ? { kind: 'create' } : null;
          } else if (verdict.kind === 'blocked') {
            outcome.handoff = {
              // The fresh record's name too — renamed in another tab, the block would otherwise
              // explain itself under the click-time name.
              organismName: toDisplayOrganism(freshRecord).name,
              battleNames: usageBattleNames(verdict.battles, freshSummaries),
              referencingNames: referencingOrganismNames(
                verdict.referencingOrganismIds,
                freshOrganisms,
              ),
            };
          }
          // `protected` (unreachable — ids do not change) deletes nothing and falls through.
        }
      } catch {
        outcome.failed = true;
      }
      outcomeRef.current = outcome;
      // The latch and `pending` are NOT released here but in the exit handler: `setDialogOpen`
      // only STARTS the ~195 ms fade, and a dialog re-enabled for it would take a second Confirm
      // or a Cancel that overwrites the outcome (the Story 4.18 gate review's finding).
      setDialogOpen(false);
    })();
  }, [deleteWindow, dialogOpen, organisms, battles]);

  // The one exit handler for both dialogs, so every state change of a release lands in ONE
  // commit: the window's release (lifting `inert`) and whatever it publishes.
  const handleExited = useCallback(() => {
    const outcome = outcomeRef.current;
    outcomeRef.current = null;
    latchRef.current = false;
    setPending(false);

    if (outcome?.handoff) {
      // FD5: swap the variant and reopen in the same handler, so `deleteWindow` never goes `null` —
      // inert never releases and the focus effect never fires in between (the
      // `handleGateExited` handoff). The restore intent is the original origin's, unchanged.
      const { organismName, battleNames, referencingNames } = outcome.handoff;
      setDeleteWindow((current) =>
        current === null
          ? null
          : { ...current, kind: 'blocked', organismName, battleNames, referencingNames },
      );
      setDialogOpen(true);
      reload();
      return;
    }

    windowRef.current = false;
    setDeleteWindow(null);
    if (outcome?.deleted) {
      if (outcome.origin === 'card') {
        setToast(ORGANISM_DELETED);
      } else {
        heldToastRef.current = ORGANISM_DELETED;
        // FD9: the confirmation has exited; only now may the editor close.
        onEditorDeleted?.();
      }
    }
    if (outcome?.failed) {
      if (outcome.origin === 'card') setDeleteError(ORGANISM_DELETE_FAILED);
      else setEditorDeleteError(ORGANISM_DELETE_FAILED);
    }
    // Review decision (b): the card origin says nothing (its card is gone after the reload); the
    // editor origin, still open on a record that no longer exists, says so in-editor.
    if (outcome?.gone && outcome.origin === 'editor') setEditorDeleteError(ORGANISM_DELETE_GONE);
    // Before the editor exits, for the editor origin: the card is gone by the time the editor
    // hook's focus restore looks it up, which is what makes its Create fallback land (FD8).
    if (outcome?.reload) reload();
    onWindowReleased?.();
  }, [reload, onEditorDeleted, onWindowReleased]);

  const onEditorExited = useCallback(() => {
    setEditorDeleteError(null);
    const message = heldToastRef.current;
    if (message === null) return;
    heldToastRef.current = null;
    setToast(message);
  }, []);

  const isWindowActive = useCallback(() => windowRef.current, []);

  const confirmProps = useMemo<OrganismDeleteConfirmDialogProps | null>(
    () =>
      deleteWindow?.kind === 'confirm'
        ? {
            open: dialogOpen,
            organismName: deleteWindow.organismName,
            pending,
            onCancel: handleCancel,
            onConfirm: handleConfirm,
            onExited: handleExited,
          }
        : null,
    [deleteWindow, dialogOpen, pending, handleCancel, handleConfirm, handleExited],
  );

  const blockedProps = useMemo<OrganismDeleteBlockedDialogProps | null>(
    () =>
      deleteWindow?.kind === 'blocked'
        ? {
            open: dialogOpen,
            organismName: deleteWindow.organismName,
            battleNames: deleteWindow.battleNames,
            referencingNames: deleteWindow.referencingNames,
            onClose: handleCancel,
            onExited: handleExited,
          }
        : null,
    [deleteWindow, dialogOpen, handleCancel, handleExited],
  );

  return {
    requestDelete,
    windowActive: deleteWindow !== null,
    isWindowActive,
    confirmProps,
    blockedProps,
    toast,
    deleteError,
    editorDeleteError,
    onEditorExited,
  };
}
