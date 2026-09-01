'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UnsavedChangesDialogProps } from '@/components/battle/UnsavedChangesDialog';
import { useInertBackground } from '@/lib/useInertBackground';

/**
 * FR-7.9's in-app half, extracted from `<BattlePage>` (2026-09-01): the three-phase dialog
 * lifecycle, the background-inert window, and the focus restoration across the exit transition.
 * The caller keeps only what is genuinely its own — the dirty flag, the save, and what "leave"
 * actually means.
 *
 * ⚠️ This hook lives in `lib/`, NOT beside `<UnsavedChangesDialog>` the way `useDeleteBattleDialog`
 * lives beside `<DeleteBattleDialog>`. That asymmetry is a bundle constraint, not an oversight.
 * `<BattlePage>` reaches the dialog through `next/dynamic` because the MUI `Dialog` stack measured
 * **+18.1 KB gzip** against ~5.7 KB of headroom on `/battle` (see that call site). A hook exported
 * from `UnsavedChangesDialog.tsx` would have to be imported STATICALLY to be called during render,
 * which pulls that module — and every MUI component it imports — straight back into the route's
 * main chunk and silently defeats the dynamic import. The Gallery has no such problem because it
 * imports `<DeleteBattleDialog>` statically already.
 *
 * ⚠️ For the same reason the `UnsavedChangesDialogProps` import above is `import type`, and must
 * stay that way. Type-only imports are erased before bundling; changing it to a value import would
 * reintroduce exactly the cost the previous paragraph describes, with no test able to catch it.
 *
 * ⚠️ Call this from the component that RENDERS the dialog, never from inside the dialog itself.
 * `useInertBackground` and the focus effect below must run as the dialog's PARENT effects so MUI's
 * focus-trap move (a child effect) has already happened — the same placement rule
 * `useDeleteBattleDialog` records at its own call site.
 */
export interface UseLeaveGuardOptions {
  /** FR-7.9's arming condition. Clean → `onLeave()` immediately; dirty → confirm first. */
  isDirty: boolean;
  /**
   * A save started from this dialog is in flight. Threaded to the dialog's `pending`, which
   * disables all three actions and guards `onClose` so Escape/backdrop cannot dismiss mid-write.
   */
  saving: boolean;
  /**
   * Attempt the save. **Resolving is not success** — the boolean is, and the trap Story 2.16 exists
   * around is treating the two as the same thing (forced decision 2). Only `true` navigates.
   *
   * ⚠️ Must be TOTAL: this hook does not catch. `<BattlePage>`'s `saveBattle` reports its own
   * failure into AC5's `role="alert"` surface and resolves either way, which is what makes the
   * boolean the only channel. A rejecting `save` passed here would escape as an unhandled rejection
   * and strand the dialog open with every button `disabled` by `pending`.
   *
   * ⚠️ Keep it referentially stable (a `useCallback`), or `dialogProps` churns on every commit —
   * see `useLeaveGuard.test.tsx`'s identity test for why that precondition is the caller's.
   */
  save(): Promise<boolean>;
  /**
   * Perform the navigation. Called on the clean path, on Discard, and after a SUCCESSFUL
   * save-and-leave — never otherwise. Kept as a callback rather than a router the hook owns, so
   * the hook holds no routing knowledge and can be driven by a plain spy in a test.
   *
   * ⚠️ Referentially stable, for the same reason `save` is.
   */
  onLeave(): void;
}

export interface UseLeaveGuardResult {
  /** Wire to the Back affordance (`<BattleEditorView>`'s `onBack`). */
  requestLeave(): void;
  /**
   * "A confirmation is on screen in some form" — open OR still fading out. Gates the caller's
   * conditional mount, which is what keeps the lazy dialog chunk from being requested at all on
   * the overwhelmingly common path (every Back from a clean battle, which is most of them).
   */
  confirming: boolean;
  /** Spread onto `<UnsavedChangesDialog {...dialogProps} />`. */
  dialogProps: UnsavedChangesDialogProps;
}

export function useLeaveGuard({
  isDirty,
  saving,
  save,
  onLeave,
}: UseLeaveGuardOptions): UseLeaveGuardResult {
  /**
   * Story 2.16 (AC3): the leave confirmation, in the three-phase shape `useDeleteBattleDialog`
   * records — open, EXITING, closed. `dialogOpen` drives the fade; `confirming` outlives it and is
   * cleared only once the exit transition has finished, so `confirming` is exactly the window "a
   * confirmation is on screen in some form" — which is the window the background has to stay
   * `inert` for.
   *
   * ⚠️ Two cells, not one. Releasing `inert` at close time would leave a ~195ms window in which
   * the background is `aria-hidden` AND tabbable at once (MUI defers its own `aria-hidden` removal
   * to the transition's end), which is the exact state `useInertBackground` exists to prevent.
   */
  const [confirming, setConfirming] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * Whether focus is owed back to the Back button once the dialog's exit transition has finished
   * (AC6), for every close path that STAYS on the page. The paths that navigate need nothing: the
   * mount is about to die.
   *
   * ⚠️ A DOM lookup at restore time, never a captured element — WebKit does not focus a `<button>`
   * on click, so `document.activeElement` at open time is `<body>` there and MUI's own restore
   * faithfully puts focus back on it ("the tab order restarts at the top of the document"). The
   * idiom `<DeleteBattleDialog>` and `<BattleEditorView>` both already use.
   */
  const restoreBackFocusRef = useRef(false);

  // Called from the PARENT of the dialog so it spans the exit transition, and so MUI's own
  // focus-trap move (a child effect) has already happened — inerting a subtree that still holds
  // the focused element would drop focus to `<body>` instead of landing it on Cancel. Both reasons
  // are recorded in full on `useDeleteBattleDialog`'s call.
  useInertBackground(confirming);

  /**
   * The focus move, run as an EFFECT keyed on the confirmation clearing rather than from the exit
   * callback directly. Ordering is the point and it has to be guaranteed rather than raced: by the
   * time this runs, MUI has cleared the background's `aria-hidden` and `useInertBackground`'s
   * cleanup has released `inert` — React runs every cleanup for a commit before any setup, and
   * that hook is called ABOVE this one. Focusing any earlier targets a node that is still inert,
   * where `focus()` is a spec-mandated no-op.
   *
   * ⚠️ The `useInertBackground` call above and this effect must stay in THIS order, in this hook.
   * Splitting them across the caller would put an arbitrary number of unrelated effects between
   * them and make the cleanup-before-setup guarantee depend on the caller's hook order.
   */
  useEffect(() => {
    if (confirming) return;
    if (!restoreBackFocusRef.current) return;
    restoreBackFocusRef.current = false;

    // Do not steal focus the user has already placed somewhere real during the transition.
    // "Loose" includes "still inside the closing dialog" — on WebKit this effect runs while that
    // dialog is still mounted, so a body-only check would skip the restore there.
    const active = document.activeElement;
    const focusIsLoose =
      active === null || active === document.body || active.closest('[role="dialog"]') !== null;
    if (!focusIsLoose) return;

    document.querySelector<HTMLElement>('[data-back-to-battles]')?.focus();
  }, [confirming]);

  /**
   * AC2/AC3 (FR-7.9/FR-7.10). Clean → navigate, full stop. Dirty → open the confirmation and
   * navigate NOTHING. That is the whole of the in-app guard.
   *
   * ❌ It does not save, does not clear `isDirty`, does not reset the editor and never reaches
   * `onCommitGrid` — a Back is not a commit (Dev Notes → *What Back does NOT do*).
   */
  const requestLeave = useCallback(() => {
    if (!isDirty) {
      onLeave();
      return;
    }
    restoreBackFocusRef.current = true;
    setConfirming(true);
    setDialogOpen(true);
  }, [isDirty, onLeave]);

  // AC3: Cancel — and Escape, and a backdrop click, which MUI routes through the same callback —
  // change NOTHING. No commit, no undo entry, no save, and `isDirty` is still true; the only thing
  // that moves is the dialog, and focus, which comes back to the Back button once the fade ends.
  const handleCancel = useCallback(() => setDialogOpen(false), []);

  // Only once the fade has finished is it safe to unmount the dialog, release `inert` and schedule
  // the focus restore. Clearing `confirming` does all three.
  const handleExited = useCallback(() => setConfirming(false), []);

  // AC3: leave, losing the changes. ❌ No write, and no state tidying — `isDirty` stays true and
  // the component holding it is about to unmount, which are different things; setting the flag
  // false on the way out would be a lie with a one-frame lifetime.
  const handleDiscard = useCallback(() => {
    onLeave();
  }, [onLeave]);

  /**
   * AC3, and the trap this story exists around: navigate **only if the save actually succeeded**
   * (forced decision 2). A resolved promise is not success — see `save` in the options above.
   *
   * Forced decision 5, option (a): a FAILED save closes the dialog and stays on the page, where
   * Story 2.13's existing `role="alert"` line above the status bar reports it (NFR-7.2) — zero new
   * copy, zero new surface, and the user is exactly where they need to be to retry. `isDirty` is
   * still true, so the guard is still armed.
   */
  const handleSaveAndLeave = useCallback(async () => {
    if (await save()) {
      onLeave();
      return;
    }
    setDialogOpen(false);
  }, [save, onLeave]);

  const dialogProps = useMemo<UnsavedChangesDialogProps>(
    () => ({
      open: dialogOpen,
      pending: saving,
      onCancel: handleCancel,
      onDiscard: handleDiscard,
      onSaveAndLeave: handleSaveAndLeave,
      onExited: handleExited,
    }),
    [dialogOpen, saving, handleCancel, handleDiscard, handleSaveAndLeave, handleExited],
  );

  return { requestLeave, confirming, dialogProps };
}
