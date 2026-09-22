'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Organism } from '@gol/domain';
import type {
  OrganismEditorLifecycleProps,
  OrganismEditorOrigin,
} from '@/components/organisms/editor/OrganismEditorModal';
import { useInertBackground } from '@/lib/useInertBackground';

/**
 * The Organism Editor modal's parent-side lifecycle (Story 4.3): the three-phase open / exiting /
 * closed shape, the background-inert window, and the focus restoration across the exit
 * transition — `useLeaveGuard`'s contract, minus the dirty flag and the save, which are
 * Story 4.23's and 4.16's respectively.
 *
 * ⚠️ This hook lives in `lib/organisms/`, NOT beside `<OrganismEditorModal>`. That asymmetry is a
 * bundle constraint, not an oversight. `<OrganismLibrary>` reaches the modal through `next/dynamic`
 * because the MUI `Dialog` stack measured **+18.1 KB gzip** when statically imported (Story 1.13,
 * re-confirmed 2.14) against 11.5 KB of headroom on `/organisms`. A hook exported from
 * `OrganismEditorModal.tsx` would have to be imported STATICALLY to be called during render, which
 * pulls that module — and every MUI component it imports — straight back into the route's main
 * chunk and silently defeats the dynamic import.
 *
 * ⚠️ For the same reason the `OrganismEditorModalProps` import above is `import type`, and must
 * stay that way. Type-only imports are erased before bundling; changing it to a value import would
 * reintroduce exactly the cost the previous paragraph describes, and only the bundle gate would
 * notice — as a number, not a test failure.
 *
 * ⚠️ Call this from the component that RENDERS the modal, never from inside the modal itself.
 * `useInertBackground` and the focus effect below must run as the modal's PARENT effects so MUI's
 * focus-trap move (a child effect) has already happened — the same placement rule
 * `useDeleteBattleDialog` and `useLeaveGuard` record at their own call sites.
 */
export interface UseOrganismEditorModalResult {
  /** Wire to the create button. Story 4.17 adds the edit entry beside it. */
  requestCreate(): void;
  /**
   * "The editor is on screen in some form" — open OR still fading out. Gates the caller's
   * conditional mount so the lazy chunk is never requested until the first open (the
   * `useLeaveGuard.confirming` contract).
   */
  mounted: boolean;
  /** Spread onto `<OrganismEditorModal {...modalProps} library={…} />` — the data half is the
   * caller's. */
  modalProps: OrganismEditorLifecycleProps;
}

export interface UseOrganismEditorModalOptions {
  /**
   * Fired once the exit transition has finished AFTER a successful save (Story 4.16, FD4) — never
   * before: `useInertBackground.ts:66-68` sweeps body children appended while the dialog is still
   * open, so a status published at save time would be inerted, and a Library reload mid-fade would
   * re-render the still-mounted modal with a `library` that now contains the just-saved organism,
   * flagging its own colour in the Story 4.9 reuse warning for the fade's duration.
   */
  onSaved?(organism: Organism): void;
}

export function useOrganismEditorModal(
  origin: OrganismEditorOrigin,
  options?: UseOrganismEditorModalOptions,
): UseOrganismEditorModalResult {
  /**
   * Two cells, not one, because the modal has three phases and not two: open, EXITING, closed.
   * `dialogOpen` drives the fade; `mounted` outlives it and is cleared only once the exit
   * transition has finished, so `mounted` is exactly the window "the editor is on screen in some
   * form" — which is the window the background has to stay `inert` for.
   *
   * ⚠️ Releasing `inert` at close time would leave a ~195ms window in which the background is
   * `aria-hidden` AND tabbable at once (MUI defers its own `aria-hidden` removal to the
   * transition's end), which is the exact state `useInertBackground` exists to prevent.
   */
  const [mounted, setMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * Whether focus is owed back to the create button once the exit transition has finished.
   *
   * ⚠️ A DOM lookup at restore time, never a captured element — WebKit does not focus a `<button>`
   * on click, so `document.activeElement` at open time is `<body>` there and MUI's own restore
   * faithfully puts focus back on it ("the tab order restarts at the top of the document"). The
   * idiom `<DeleteBattleDialog>` and `useLeaveGuard` both already use.
   */
  const restoreFocusRef = useRef(false);

  // Story 4.16, FD4: holds the just-saved record across the exit transition — set by
  // `handleSaved`, consumed and cleared by `handleExited`. `null` means "closed without saving".
  const pendingSavedRef = useRef<Organism | null>(null);

  // `mounted`, readable from the stable callbacks below without a dep (review 2026-09-22): a
  // write that resolves AFTER an Escape-close's exit has finished reaches `handleSaved` with no
  // `handleExited` left to fire — the record was stashed and then replayed on the NEXT, unrelated
  // close. Kept in step by the two places `mounted` changes, `requestCreate` and `handleExited`.
  const mountedRef = useRef(false);

  // A latest-value ref, assigned in an effect below, so a caller whose `onSaved` option changes
  // identity between open and exit still gets the LATEST one called — and so `modalProps`' own
  // identity (memoised below) is unaffected by a changing `onSaved` option.
  const onSavedRef = useRef(options?.onSaved);
  useEffect(() => {
    onSavedRef.current = options?.onSaved;
  }, [options?.onSaved]);

  // Called from the PARENT of the modal so it spans the exit transition, and so MUI's own
  // focus-trap move (a child effect) has already happened — inerting a subtree that still holds
  // the focused element would drop focus to `<body>`. Both reasons are recorded in full on
  // `useDeleteBattleDialog`'s call.
  useInertBackground(mounted);

  /**
   * The focus move, run as an EFFECT keyed on `mounted` clearing rather than from the exit callback
   * directly. By the time this runs, MUI has cleared the background's `aria-hidden` and
   * `useInertBackground`'s cleanup has released `inert` — React runs every cleanup for a commit
   * before any setup, and that hook is called ABOVE this one. Focusing any earlier targets a node
   * that is still inert, where `focus()` is a spec-mandated no-op.
   *
   * ⚠️ The `useInertBackground` call above and this effect must stay in THIS order, in this hook:
   * the cleanup-before-setup guarantee only holds between hooks of the same component, and
   * splitting them across the caller would put an arbitrary number of unrelated effects between
   * them.
   */
  useEffect(() => {
    if (mounted) return;
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;

    // Do not steal focus the user has already placed somewhere real during the transition.
    // "Loose" includes "still inside the closing dialog" — on WebKit this effect runs while that
    // dialog is still mounted, so a body-only check would skip the restore there.
    const active = document.activeElement;
    const focusIsLoose =
      active === null || active === document.body || active.closest('[role="dialog"]') !== null;
    if (!focusIsLoose) return;

    document.querySelector<HTMLElement>('[data-create-organism]')?.focus();
  }, [mounted]);

  const requestCreate = useCallback(() => {
    restoreFocusRef.current = true;
    mountedRef.current = true;
    setMounted(true);
    setDialogOpen(true);
  }, []);

  // Close ✕, Back and Escape all land here. Nothing else moves — no repository call, no state
  // beyond the modal's own lifecycle; the unsaved-changes guard (Story 4.23) inserts itself in
  // front of this callback later.
  const handleClose = useCallback(() => setDialogOpen(false), []);

  // Story 4.16, FD4: the SAME close channel as `handleClose` above — a save is the opposite of a
  // discard, so it must NOT be guarded (Story 4.23's guard has one door to stand in front of, and
  // this is not it). Stashes `organism` for `handleExited` to hand on once the fade has finished,
  // then starts the identical fade `handleClose` starts. `restoreFocusRef` is already armed from
  // `requestCreate`, so a save-close restores focus exactly like a plain Close.
  const handleSaved = useCallback((organism: Organism) => {
    // Already exited (the user closed during the in-flight write and the fade outlasted it):
    // there is no `handleExited` ahead to hand the record on, and FD4's ordering guarantee — the
    // caller's `onSaved` runs only once `mounted` has cleared — is already met. Report now.
    if (!mountedRef.current) {
      onSavedRef.current?.(organism);
      return;
    }
    pendingSavedRef.current = organism;
    setDialogOpen(false);
  }, []);

  // Only once the fade has finished is it safe to unmount the modal, release `inert` and schedule
  // the focus restore. Clearing `mounted` does all three — and, when the close followed a save
  // (`pendingSavedRef` set), hands the record on to the caller's `onSaved` AFTER `mounted` clears:
  // the Library must not reload or announce the outcome under a still-mounted, still-`inert`
  // dialog (the `useInertBackground` sweep), and the Story 4.9 reuse warning would otherwise flag
  // the just-saved organism's own colour for the fade's duration.
  const handleExited = useCallback(() => {
    mountedRef.current = false;
    setMounted(false);
    const saved = pendingSavedRef.current;
    pendingSavedRef.current = null;
    if (saved !== null) onSavedRef.current?.(saved);
  }, []);

  const modalProps = useMemo<OrganismEditorLifecycleProps>(
    () => ({
      open: dialogOpen,
      origin,
      onClose: handleClose,
      onExited: handleExited,
      onSaved: handleSaved,
    }),
    [dialogOpen, origin, handleClose, handleExited, handleSaved],
  );

  return { requestCreate, mounted, modalProps };
}
