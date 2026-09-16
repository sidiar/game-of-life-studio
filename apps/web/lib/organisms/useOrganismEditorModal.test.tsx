import { afterEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrganismEditorModal from '@/components/organisms/editor/OrganismEditorModal';
import {
  useOrganismEditorModal,
  type UseOrganismEditorModalResult,
} from './useOrganismEditorModal';

/**
 * The parent-side lifecycle of the Organism Editor modal (Story 4.3), in the shape
 * `useLeaveGuard.test.tsx` established. `OrganismLibrary.test.tsx` pins the OUTWARD behaviour
 * through the real Library and the real `next/dynamic` boundary; this file pins the hook's own
 * contract — the parts a component-level test either cannot observe or can only observe by proxy:
 *
 * - the three-phase lifecycle's MIDDLE phase (`open` false, `mounted` still true), which is the
 *   ~195ms exit-transition window the two-cell design exists for.
 * - that the background stays `inert` across that window rather than being released at close time.
 * - the focus restore's "loose" predicate, including the in-dialog arm that only WebKit's ordering
 *   makes reachable in a real browser.
 *
 * ⚠️ The modal is imported STATICALLY here. The test may; the hook may not (FD5) — a value import
 * of the modal module from the hook would pull the Dialog stack into `/organisms`'s first load,
 * and only the bundle gate would notice.
 *
 * ⚠️ What this file deliberately does NOT claim: the ORDERING guarantee in the hook's focus effect
 * (inert released before `focus()` runs) is unobservable here. jsdom implements no `inert` — it is
 * a plain expando — so `focus()` succeeds on an element a real browser would refuse. That claim is
 * held by the e2e's WebKit run.
 */

/** jsdom has no `inert` reflection, so `undefined` and `false` are the same fact ("not inerted").
 * The predicate `useInertBackground.test.tsx` establishes for the same reason. */
function isInert(element: HTMLElement): boolean {
  return element.inert === true;
}

/** A body-level sibling in the shape MUI's ModalManager leaves behind while a Dialog is open —
 * what `useInertBackground` (called from inside the hook) actually acts on. */
function appendBackground(): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('aria-hidden', 'true');
  document.body.appendChild(element);
  return element;
}

// The live result, captured per commit from an EFFECT (never during render — `react-hooks/globals`
// rejects the latter, rightly). Read through `hook()` rather than by clicking the modal's own
// buttons, because several assertions below turn on WHERE FOCUS IS and a click moves it.
let latest: UseOrganismEditorModalResult | null = null;

function hook(): UseOrganismEditorModalResult {
  if (latest === null) throw new Error('<Probe> has not rendered');
  return latest;
}

/**
 * Stands in for `<OrganismLibrary>`: the create trigger carries the `[data-create-organism]` hook
 * the focus restore looks up, an "elsewhere" control models focus the user placed somewhere real,
 * and the REAL modal is mounted on `mounted` — the caller's conditional mount, and the reason the
 * hook exposes `mounted` at all.
 */
function Probe() {
  const result = useOrganismEditorModal('library');
  useEffect(() => {
    latest = result;
  });

  return (
    <>
      <button type="button" data-create-organism="" onClick={result.requestCreate}>
        + Create New Organism
      </button>
      <button type="button" data-testid="elsewhere">
        Elsewhere
      </button>
      {/* The hook's test is about lifecycle; an empty library is a legal, honest input here
          (Story 4.8) — this file does not exercise the colour seed. */}
      {result.mounted && <OrganismEditorModal {...result.modalProps} library={[]} />}
    </>
  );
}

const createButton = () => screen.getByRole('button', { name: '+ Create New Organism' });

afterEach(() => {
  latest = null;
  document.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
});

describe('useOrganismEditorModal', () => {
  it('requestCreate mounts and opens the modal', async () => {
    const user = userEvent.setup();
    render(<Probe />);
    expect(hook().mounted).toBe(false);
    expect(hook().modalProps.open).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(createButton());

    expect(hook().mounted).toBe(true);
    expect(hook().modalProps.open).toBe(true);
    expect(hook().modalProps.origin).toBe('library');
    expect(screen.getByRole('dialog', { name: 'Organism Editor' })).toBeInTheDocument();
  });

  /**
   * The two-cell design's whole reason for existing. A single `open` cell would make these two
   * assertions the same assertion, and the ~195ms window between them is where the background
   * would go `aria-hidden` AND tabbable at once.
   */
  describe('the three-phase lifecycle', () => {
    it('holds `mounted` true after onClose, until onExited', async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(createButton());

      act(() => hook().modalProps.onClose());

      // Phase 2: fading out. Closed to the user, still mounted.
      expect(hook().modalProps.open).toBe(false);
      expect(hook().mounted).toBe(true);

      await act(async () => {
        hook().modalProps.onExited?.();
      });

      // Phase 3: gone.
      expect(hook().mounted).toBe(false);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('keeps the background inert across the exit transition, releasing it only once exited', async () => {
      const user = userEvent.setup();
      const background = appendBackground();
      render(<Probe />);
      await user.click(createButton());
      expect(isInert(background)).toBe(true);

      act(() => hook().modalProps.onClose());

      // ⚠️ The regression this pins: releasing on `open` rather than on `mounted` leaves the
      // background aria-hidden and tabbable together for the length of the fade.
      expect(isInert(background)).toBe(true);

      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(isInert(background)).toBe(false);
    });

    it('re-arms: a second open after a completed cycle opens and restores again', async () => {
      const user = userEvent.setup();
      render(<Probe />);

      for (const pass of [1, 2]) {
        await user.click(createButton());
        expect(hook().mounted, `pass ${pass}`).toBe(true);

        screen.getByRole('button', { name: 'Close' }).focus();
        act(() => hook().modalProps.onClose());
        await act(async () => {
          hook().modalProps.onExited?.();
        });

        expect(hook().mounted, `pass ${pass}`).toBe(false);
        expect(document.activeElement, `pass ${pass}`).toBe(createButton());
      }
    });
  });

  describe('focus restoration', () => {
    it('returns focus to the create button when focus is still inside the closing dialog', async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(createButton());

      // Where MUI's focus trap leaves it. On WebKit this is still true when the effect runs, which
      // is why the hook treats "inside a [role=dialog]" as loose rather than checking only <body>.
      screen.getByRole('button', { name: 'Close' }).focus();
      expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(document.activeElement).toBe(createButton());
    });

    it('restores from a bare <body> too', async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(createButton());

      (document.activeElement as HTMLElement | null)?.blur();
      expect(document.activeElement).toBe(document.body);
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(document.activeElement).toBe(createButton());
    });

    it('does NOT steal focus the user placed somewhere real during the transition', async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(createButton());

      act(() => hook().modalProps.onClose());
      const elsewhere = screen.getByTestId('elsewhere');
      elsewhere.focus();
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(document.activeElement).toBe(elsewhere);
    });
  });

  // The bundle is spread onto a `next/dynamic` dialog; a fresh identity per render would re-render
  // it on every unrelated commit of the Library that owns the hook (every search keystroke).
  it('hands back a stable `modalProps` identity across unrelated re-renders', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Probe />);
    await user.click(createButton());
    const first = hook().modalProps;

    rerender(<Probe />);

    expect(hook().modalProps).toBe(first);
  });
});
