import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLeaveGuard, type UseLeaveGuardResult } from './useLeaveGuard';

/**
 * The hook extracted from `<BattlePage>` (2026-09-01). `BattlePage.test.tsx`'s Story 2.16 suite
 * already pins the OUTWARD behaviour through the real page and stays the acceptance evidence; this
 * file pins the hook's own contract — the parts a page-level test either cannot observe or can
 * only observe by proxy:
 *
 * - the three-phase lifecycle's MIDDLE phase (`open` false, `confirming` still true), which is the
 *   ~195ms exit-transition window the whole two-cell design exists for. Through `<BattlePage>` the
 *   phase is visible only as "the dialog is still in the DOM", which is also true of a bug that
 *   never closes it.
 * - that the background stays `inert` across that window rather than being released at close time.
 * - that a save which RESOLVES FALSE does not navigate (forced decision 2's trap), asserted against
 *   the callback directly instead of through the save path's own failure surface.
 *
 * Mutation checks (2026-09-01), each reddening the named tests and nothing else:
 *   - `handleCancel` also clearing `confirming` (the two cells collapsed into one) -> the lifecycle
 *     test and the inert-across-the-transition test.
 *   - `await save()` treated as success -> "does NOT navigate when the save resolves false".
 *   - the focus effect's `[role="dialog"]` arm deleted -> "focus is still inside the closing
 *     dialog" (and only with `keepDialogMounted` — see that prop).
 *
 * ⚠️ What this file deliberately does NOT claim: the ORDERING guarantee in the hook's focus effect
 * (inert released before `focus()` runs) is unobservable here. jsdom implements no `inert` — it is
 * a plain expando — so `focus()` succeeds on an element that a real browser would refuse. That
 * claim is held by the e2e's WebKit run, which is where it was originally found.
 */

/** jsdom has no `inert` reflection, so `undefined` and `false` are the same fact ("not inerted").
 * The predicate `useInertBackground.test.tsx` establishes for the same reason. */
function isInert(element: HTMLElement): boolean {
  return element.inert === true;
}

/** A body-level sibling in the shape MUI's ModalManager leaves behind while a Dialog is open —
 * what `useInertBackground` (called from inside the guard) actually acts on. */
function appendBackground(): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('aria-hidden', 'true');
  document.body.appendChild(element);
  return element;
}

// The live result, captured per commit. Read through `guard()` rather than driven by clicking the
// probe's buttons, because several assertions below turn on WHERE FOCUS IS and a click moves it —
// firing `onExited` from a button would put focus on that button and suppress the very restore the
// test is checking for.
//
// ⚠️ Written from an EFFECT, never during render: `react-hooks/globals` rejects the latter as a
// render side effect, and it is right to — every read below happens after an `act()` that has
// already flushed effects, so the effect is both legal and current.
let latest: UseLeaveGuardResult | null = null;

function guard(): UseLeaveGuardResult {
  if (latest === null) throw new Error('<Probe> has not rendered');
  return latest;
}

interface ProbeProps {
  isDirty: boolean;
  saving?: boolean;
  save?: () => Promise<boolean>;
  onLeave?: () => void;
  /**
   * Keeps the `role="dialog"` subtree mounted regardless of `confirming`, modelling the ordering
   * the focus effect's in-dialog branch exists for: on WebKit that effect runs while the closing
   * dialog is STILL MOUNTED, so `document.activeElement` is its Cancel button rather than `<body>`.
   *
   * ⚠️ Under the default (faithful) mount the branch is unreachable in jsdom — React unmounts the
   * subtree in the same commit that clears `confirming`, so focus has already fallen to `<body>` by
   * the time the effect runs, and the `<body>` arm alone satisfies every assertion. Deleting the
   * branch reddens nothing without this flag. It is a MODEL of the WebKit ordering, not proof of
   * it; the proof is the e2e's WebKit run.
   */
  keepDialogMounted?: boolean;
}

/**
 * Stands in for `<BattlePage>` + `<UnsavedChangesDialog>`: the Back trigger carries the
 * `[data-back-to-battles]` hook the focus restore looks up (`<SidebarFooter>` owns it in the app),
 * and the `role="dialog"` wrapper is what makes the effect's "focus is still inside the closing
 * dialog" branch reachable.
 *
 * Mounted on `confirming`, NOT on `open` — the caller's real conditional mount, and the reason the
 * hook exposes `confirming` at all.
 */
function Probe({
  isDirty,
  saving = false,
  save = () => Promise.resolve(true),
  onLeave = () => {},
  keepDialogMounted = false,
}: ProbeProps) {
  const result = useLeaveGuard({ isDirty, saving, save, onLeave });
  useEffect(() => {
    latest = result;
  });

  return (
    <>
      <button type="button" data-back-to-battles="" onClick={result.requestLeave}>
        Back to Battles
      </button>
      <button type="button" data-testid="elsewhere">
        Elsewhere
      </button>
      {(result.confirming || keepDialogMounted) && (
        <div role="dialog" aria-label="Unsaved Changes">
          <button type="button" data-testid="cancel">
            Cancel
          </button>
        </div>
      )}
    </>
  );
}

const backButton = () => screen.getByRole('button', { name: 'Back to Battles' });

afterEach(() => {
  latest = null;
  document.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
});

describe('useLeaveGuard', () => {
  describe('the clean path (AC2)', () => {
    it('leaves immediately, opening nothing and saving nothing', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      const save = vi.fn(() => Promise.resolve(true));
      render(<Probe isDirty={false} save={save} onLeave={onLeave} />);

      await user.click(backButton());

      expect(onLeave).toHaveBeenCalledTimes(1);
      expect(save).not.toHaveBeenCalled();
      expect(guard().confirming).toBe(false);
      expect(guard().dialogProps.open).toBe(false);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('schedules no focus restore, so a later unrelated commit cannot steal focus', async () => {
      const user = userEvent.setup();
      render(<Probe isDirty={false} />);
      await user.click(backButton());

      screen.getByTestId('elsewhere').focus();
      // The effect is keyed on `confirming` going false — it never went true here, but a restore
      // ref left armed by the clean path would fire on any later run of it.
      await act(async () => {
        guard().dialogProps.onExited?.();
      });

      expect(document.activeElement).toBe(screen.getByTestId('elsewhere'));
    });
  });

  describe('the dirty path (AC3)', () => {
    it('opens the confirmation and navigates nothing', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      const save = vi.fn(() => Promise.resolve(true));
      render(<Probe isDirty save={save} onLeave={onLeave} />);

      await user.click(backButton());

      expect(onLeave).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(guard().confirming).toBe(true);
      expect(guard().dialogProps.open).toBe(true);
      expect(screen.getByRole('dialog')).toBeVisible();
    });

    it('threads `saving` through to the dialog’s `pending`', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Probe isDirty saving={false} />);
      await user.click(backButton());
      expect(guard().dialogProps.pending).toBe(false);

      rerender(<Probe isDirty saving />);

      expect(guard().dialogProps.pending).toBe(true);
    });
  });

  /**
   * The two-cell design's whole reason for existing. A single `open` cell would make these two
   * assertions the same assertion, and the ~195ms window between them is where the background
   * would go `aria-hidden` AND tabbable at once.
   */
  describe('the three-phase lifecycle', () => {
    it('holds `confirming` true after Cancel closes the dialog, until the exit transition ends', async () => {
      const user = userEvent.setup();
      render(<Probe isDirty />);
      await user.click(backButton());

      act(() => guard().dialogProps.onCancel());

      // Phase 2: fading out. Closed to the user, still mounted and still inert.
      expect(guard().dialogProps.open).toBe(false);
      expect(guard().confirming).toBe(true);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await act(async () => {
        guard().dialogProps.onExited?.();
      });

      // Phase 3: gone.
      expect(guard().confirming).toBe(false);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('keeps the background inert across the exit transition, releasing it only once exited', async () => {
      const user = userEvent.setup();
      const background = appendBackground();
      render(<Probe isDirty />);
      await user.click(backButton());
      expect(isInert(background)).toBe(true);

      act(() => guard().dialogProps.onCancel());

      // ⚠️ The regression this pins: releasing on `open` rather than on `confirming` leaves the
      // background aria-hidden and tabbable together for the length of the fade.
      expect(isInert(background)).toBe(true);

      await act(async () => {
        guard().dialogProps.onExited?.();
      });

      expect(isInert(background)).toBe(false);
    });

    it('re-arms: a second Back after a completed cycle opens and restores again', async () => {
      const user = userEvent.setup();
      render(<Probe isDirty />);

      for (const pass of [1, 2]) {
        await user.click(backButton());
        expect(guard().confirming, `pass ${pass}`).toBe(true);

        screen.getByTestId('cancel').focus();
        act(() => guard().dialogProps.onCancel());
        await act(async () => {
          guard().dialogProps.onExited?.();
        });

        expect(guard().confirming, `pass ${pass}`).toBe(false);
        expect(document.activeElement, `pass ${pass}`).toBe(backButton());
      }
    });
  });

  describe('Save & Leave (forced decision 2)', () => {
    it('navigates when the save reports success', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      const save = vi.fn(() => Promise.resolve(true));
      render(<Probe isDirty save={save} onLeave={onLeave} />);
      await user.click(backButton());

      await act(async () => {
        guard().dialogProps.onSaveAndLeave();
      });

      expect(save).toHaveBeenCalledTimes(1);
      expect(onLeave).toHaveBeenCalledTimes(1);
      // ❌ Not closed on this path, deliberately: the mount is about to die with the navigation,
      // and closing it first would render one frame of the un-inerted page behind it.
      expect(guard().dialogProps.open).toBe(true);
    });

    /**
     * The trap the story exists around: a save that RESOLVES is not a save that SUCCEEDED. If this
     * ever goes green on `onLeave` being called, the app navigates away from unsaved work and the
     * user's only notice is a `role="alert"` line on a page they are no longer looking at.
     */
    it('does NOT navigate when the save resolves false — it closes and stays', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      const save = vi.fn(() => Promise.resolve(false));
      render(<Probe isDirty save={save} onLeave={onLeave} />);
      await user.click(backButton());

      await act(async () => {
        guard().dialogProps.onSaveAndLeave();
      });

      expect(save).toHaveBeenCalledTimes(1);
      expect(onLeave).not.toHaveBeenCalled();
      expect(guard().dialogProps.open).toBe(false);
      // Still phase 2 — the failed save closes the dialog through the same fade as a Cancel.
      expect(guard().confirming).toBe(true);
    });
  });

  /**
   * ❌ Discard does not close anything. `isDirty` stays true and the dialog stays open, because
   * what ends the confirmation on this path is the mount dying with the navigation — tidying state
   * on the way out would be a lie with a one-frame lifetime.
   */
  it('Discard navigates without writing and without closing', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    const save = vi.fn(() => Promise.resolve(true));
    render(<Probe isDirty save={save} onLeave={onLeave} />);
    await user.click(backButton());

    act(() => guard().dialogProps.onDiscard());

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(guard().dialogProps.open).toBe(true);
    expect(guard().confirming).toBe(true);
  });

  describe('focus restoration (AC6)', () => {
    it('returns focus to the Back trigger when focus is still inside the closing dialog', async () => {
      const user = userEvent.setup();
      render(<Probe isDirty keepDialogMounted />);
      await user.click(backButton());

      // Where MUI's focus trap leaves it. On WebKit this is still true when the effect runs, which
      // is why the hook treats "inside a [role=dialog]" as loose rather than checking only <body>.
      // `keepDialogMounted` is what makes that ordering reachable here — see its own comment.
      screen.getByTestId('cancel').focus();
      act(() => guard().dialogProps.onCancel());
      await act(async () => {
        guard().dialogProps.onExited?.();
      });

      expect(document.activeElement).toBe(backButton());
    });

    it('restores from a bare <body> too', async () => {
      const user = userEvent.setup();
      render(<Probe isDirty />);
      await user.click(backButton());

      (document.activeElement as HTMLElement | null)?.blur();
      expect(document.activeElement).toBe(document.body);
      act(() => guard().dialogProps.onCancel());
      await act(async () => {
        guard().dialogProps.onExited?.();
      });

      expect(document.activeElement).toBe(backButton());
    });

    it('does NOT steal focus the user placed somewhere real during the transition', async () => {
      const user = userEvent.setup();
      render(<Probe isDirty />);
      await user.click(backButton());

      act(() => guard().dialogProps.onCancel());
      const elsewhere = screen.getByTestId('elsewhere');
      elsewhere.focus();
      await act(async () => {
        guard().dialogProps.onExited?.();
      });

      expect(document.activeElement).toBe(elsewhere);
    });
  });

  /**
   * ⚠️ Stability is CONDITIONAL on the caller, and that is the point of asserting it here. The
   * `dialogProps` memo depends on `save` and `onLeave`, so it is stable only while the caller keeps
   * those stable — `<BattlePage>` does, via `saveBattle`'s `useCallback` and `leaveToGallery`'s.
   * An inline `onLeave={() => router.push('/')}` at the call site would churn this bundle on every
   * commit with nothing failing, which is exactly why the precondition is written down.
   *
   * Proof that the assertion has teeth: passing the probe's per-render default callbacks instead of
   * these hoisted ones fails this test and no other.
   */
  it('hands back a stable `dialogProps` identity while the caller’s callbacks are stable', async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => Promise.resolve(true));
    const onLeave = vi.fn();
    const { rerender } = render(<Probe isDirty save={save} onLeave={onLeave} />);
    await user.click(backButton());
    const first = guard().dialogProps;

    rerender(<Probe isDirty save={save} onLeave={onLeave} />);

    // The bundle is spread onto a `next/dynamic` dialog; a fresh identity per render would
    // re-render it on every unrelated commit of the page that owns the guard.
    expect(guard().dialogProps).toBe(first);
  });
});
