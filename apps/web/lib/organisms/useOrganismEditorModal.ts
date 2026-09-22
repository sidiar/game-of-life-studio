'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Organism } from '@gol/domain';
import type {
  OrganismEditorLifecycleProps,
  OrganismEditorOrigin,
} from '@/components/organisms/editor/OrganismEditorModal';
import type { OrganismInUseDialogProps } from '@/components/organisms/OrganismInUseDialog';
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
 * stay that way — and so is the `OrganismInUseDialogProps` import beside it (Story 4.17: the
 * dialog is the Library's second `dynamic()` boundary). Type-only imports are erased before
 * bundling; changing either to a value import would reintroduce exactly the cost the previous
 * paragraph describes, and only the bundle gate would notice — as a number, not a test failure.
 *
 * The FR-1.3 in-use gate (Story 4.17) lives HERE, not in a sibling hook. Two hooks each calling
 * `useInertBackground` would hold two restore maps that unwind in call order: the gate's cleanup
 * (its map recorded "prior: not inert") would set the background back to non-inert while the
 * editor — whose map recorded "prior: inert" — is still open. One hook, ONE
 * `useInertBackground(mounted || gate !== null)`. The handoff is SEQUENTIAL, not stacked: Edit
 * Anyway closes the gate, and only its `onExited` mounts the editor — so `mounted` keeps its single
 * meaning ("the EDITOR is on screen"), the editor chunk is fetched only when the user proceeds
 * (a Cancel never requests it), and one modal is on screen at a time. The four `setState`s that
 * make the handoff run in ONE handler, so the inert union never dips to `false` between the two.
 *
 * ⚠️ Call this from the component that RENDERS the modal, never from inside the modal itself.
 * `useInertBackground` and the focus effect below must run as the modal's PARENT effects so MUI's
 * focus-trap move (a child effect) has already happened — the same placement rule
 * `useDeleteBattleDialog` and `useLeaveGuard` record at their own call sites.
 */
export interface UseOrganismEditorModalResult {
  /** Wire to the create button. */
  requestCreate(): void;
  /**
   * Wire to a card's Edit button (Story 4.17). `usedInBattles` is the caller's `buildUsageIndex`
   * count for the organism — `0` opens the editor directly; `≥ 1` opens the FR-1.3 warning first,
   * and the editor only if the user proceeds. The caller must take the count from a settled battle
   * list: a `0` read while that list is still loading opens a placed organism unwarned.
   */
  requestEdit(organism: Organism, usedInBattles: number): void;
  /**
   * "The editor is on screen in some form" — open OR still fading out. Gates the caller's
   * conditional mount so the lazy chunk is never requested until the first open (the
   * `useLeaveGuard.confirming` contract).
   */
  mounted: boolean;
  /** Spread onto `<OrganismEditorModal {...modalProps} library={…} />` — the data half is the
   * caller's. Carries `organism` (`null` for a create) for the whole mount, through the exit fade. */
  modalProps: OrganismEditorLifecycleProps;
  /** "The in-use warning is on screen in some form" — the gate for ITS conditional mount, so its
   * lazy chunk is never requested until a used organism's Edit is clicked. */
  gateMounted: boolean;
  /** Spread onto `<OrganismInUseDialog {...gateProps} />`. */
  gateProps: OrganismInUseDialogProps;
}

export interface UseOrganismEditorModalOptions {
  /**
   * Fired once the exit transition has finished, after the editor is CLOSED, carrying the LAST
   * successfully saved record in the session — never before, and never once per save (Story 4.16,
   * FD4; amended 2026-09-22, Task 11: the editor stays open through every save, so this is now a
   * close-time hand-off, not a save-time one). `useInertBackground.ts:66-68` sweeps body children
   * appended while the dialog is still open, so a reload published under a still-mounted dialog
   * would be inerted.
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

  // Story 4.17: the organism the EDITOR is open on (`null` for a create). Set by `requestEdit`,
  // cleared in `handleExited` — after the fade, never at close — because the modal reads it at
  // mount and stays mounted through the ~195 ms exit (the `<DeleteBattleDialog>` `confirming`
  // lesson: a record emptied at close would re-seed nothing under a still-visible dialog).
  const [editing, setEditing] = useState<Organism | null>(null);

  // Story 4.17: the in-use gate, in the same two-cell shape as the editor — `gate` is the mounted
  // window (the organism and its count, held through the exit fade), `gateOpen` drives the fade.
  const [gate, setGate] = useState<{ organism: Organism; usedInBattles: number } | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  // Edit Anyway stashes the organism here; the gate's `onExited` consumes it and opens the editor.
  // A Cancel leaves it `null`, so the same exit handler unmounts the gate and nothing follows.
  // Story 4.18's Clone & Edit stashes the CLONE instead — the handoff does not change shape.
  const proceedRef = useRef<Organism | null>(null);

  /**
   * Where focus is owed once the exit transition has finished: the create button, or the edited
   * organism's own Edit button (Story 4.17), or nothing.
   *
   * ⚠️ A DOM lookup at restore time, never a captured element — WebKit does not focus a `<button>`
   * on click, so `document.activeElement` at open time is `<body>` there and MUI's own restore
   * faithfully puts focus back on it ("the tab order restarts at the top of the document"). The
   * idiom `<DeleteBattleDialog>` and `useLeaveGuard` both already use. The edit target is looked
   * up by id through `CSS.escape` (ids are arbitrary non-empty strings — `'conways-classic'`, the
   * mock ids — not uuids), falling back to the create button when the card is gone.
   */
  const restoreFocusRef = useRef<{ kind: 'create' } | { kind: 'edit'; organismId: string } | null>(
    null,
  );

  // Story 4.16, FD4, Task 11: holds the LATEST saved record across every save-while-open and
  // across the exit transition — overwritten by every `handleSaved` call (the last record wins),
  // consumed and cleared by `handleExited`. `null` means "closed without saving".
  const pendingSavedRef = useRef<Organism | null>(null);

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
  // `useDeleteBattleDialog`'s call. ONE call over the union of both windows (the head comment's
  // reason): the gate and the editor never share a restore map, and `handleGateExited` flips the
  // union from gate to editor in a single commit so it never dips to `false` in between.
  const anyMounted = mounted || gate !== null;
  useInertBackground(anyMounted);

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
    if (anyMounted) return;
    const intent = restoreFocusRef.current;
    if (intent === null) return;
    restoreFocusRef.current = null;

    // Do not steal focus the user has already placed somewhere real during the transition.
    // "Loose" includes "still inside the closing dialog" — on WebKit this effect runs while that
    // dialog is still mounted, so a body-only check would skip the restore there.
    const active = document.activeElement;
    const focusIsLoose =
      active === null || active === document.body || active.closest('[role="dialog"]') !== null;
    if (!focusIsLoose) return;

    // Looked up now, not held as a captured element: a rename re-sorts the grid, but React keys
    // the cards by id so the node survives; if the card is gone anyway, the create button is the
    // fallback (the `useDeleteBattleDialog` trigger/fallback idiom).
    const trigger =
      intent.kind === 'edit'
        ? document.querySelector<HTMLElement>(
            `[data-edit-organism-id="${CSS.escape(intent.organismId)}"]`,
          )
        : null;
    (trigger ?? document.querySelector<HTMLElement>('[data-create-organism]'))?.focus();
  }, [anyMounted]);

  const requestCreate = useCallback(() => {
    restoreFocusRef.current = { kind: 'create' };
    setMounted(true);
    setDialogOpen(true);
  }, []);

  // Story 4.17, AC1: the FR-1.3 gate. `usedInBattles === 0` opens the editor directly on the
  // record; otherwise the warning opens FIRST and the editor follows only through
  // `handleGateEditAnyway` → `handleGateExited`.
  const requestEdit = useCallback((organism: Organism, usedInBattles: number) => {
    restoreFocusRef.current = { kind: 'edit', organismId: organism.id };
    if (usedInBattles === 0) {
      setEditing(organism);
      setMounted(true);
      setDialogOpen(true);
      return;
    }
    setGate({ organism, usedInBattles });
    setGateOpen(true);
  }, []);

  const handleGateCancel = useCallback(() => setGateOpen(false), []);

  const handleGateEditAnyway = useCallback(() => {
    proceedRef.current = gate?.organism ?? null;
    setGateOpen(false);
  }, [gate]);

  // The handoff. All four `setState`s in ONE handler — React batches them into one commit, so
  // `anyMounted` goes gate → editor without a `false` in between (the inert window never
  // releases, the focus effect never fires). After a Cancel `next` is `null`: the gate unmounts,
  // `anyMounted` drops, and the focus effect restores to the card's Edit button.
  const handleGateExited = useCallback(() => {
    const next = proceedRef.current;
    proceedRef.current = null;
    setGate(null);
    if (next !== null) {
      setEditing(next);
      setMounted(true);
      setDialogOpen(true);
    }
  }, []);

  // Close ✕, Back and Escape all land here. This callback is NOT itself guarded against an
  // in-flight write — the Task 12/13 lock lives in the modal (Escape routes through its
  // `handleRequestClose`; Back and ✕ are `disabled={isSaving}`), so it holds for the three user close
  // paths and for nothing else that may one day reach `modalProps.onClose` directly (review
  // 2026-09-22). Nothing else moves — no repository call, no state beyond the modal's own
  // lifecycle; the unsaved-changes guard (Story 4.23) inserts itself in front of this callback
  // later, and inherits the lock only through those three controls.
  const handleClose = useCallback(() => setDialogOpen(false), []);

  // Story 4.16, FD4. Amended 2026-09-22 (Task 11, AC3): the editor stays open through a save, so
  // this is no longer a close channel — it only STASHES the latest record (overwriting; the last
  // save in the session wins) for `handleExited` to hand on once the user actually closes and the
  // fade has finished. With Task 12's close-lock and the modal's own "no Save during the exit
  // fade" guard in place, no USER action can leave a write resolving after the dialog has exited,
  // so the earlier "report at once if already unmounted" branch is dead code and has been removed
  // along with its test. The one remaining path — the whole Library unmounting mid-write (a route
  // change) — lands the write and reports nothing; `deferred-work.md` records it.
  const handleSaved = useCallback((organism: Organism) => {
    pendingSavedRef.current = organism;
  }, []);

  // Only once the fade has finished is it safe to unmount the modal, release `inert` and schedule
  // the focus restore. Clearing `mounted` does all three — and, when the close followed a save
  // (`pendingSavedRef` set), hands the record on to the caller's `onSaved` AFTER `mounted` clears:
  // the Library must not reload or announce the outcome under a still-mounted, still-`inert`
  // dialog (the `useInertBackground` sweep), and the Story 4.9 reuse warning would otherwise flag
  // the just-saved organism's own colour for the fade's duration.
  const handleExited = useCallback(() => {
    setMounted(false);
    setEditing(null);
    const saved = pendingSavedRef.current;
    pendingSavedRef.current = null;
    if (saved !== null) onSavedRef.current?.(saved);
  }, []);

  const modalProps = useMemo<OrganismEditorLifecycleProps>(
    () => ({
      open: dialogOpen,
      origin,
      organism: editing,
      onClose: handleClose,
      onExited: handleExited,
      onSaved: handleSaved,
    }),
    [dialogOpen, origin, editing, handleClose, handleExited, handleSaved],
  );

  const gateProps = useMemo<OrganismInUseDialogProps>(
    () => ({
      open: gateOpen,
      usedInBattles: gate?.usedInBattles ?? 0,
      onCancel: handleGateCancel,
      onEditAnyway: handleGateEditAnyway,
      onExited: handleGateExited,
    }),
    [gateOpen, gate, handleGateCancel, handleGateEditAnyway, handleGateExited],
  );

  return {
    requestCreate,
    requestEdit,
    mounted,
    modalProps,
    gateMounted: gate !== null,
    gateProps,
  };
}
