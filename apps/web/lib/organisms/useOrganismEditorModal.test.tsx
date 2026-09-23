import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Organism } from '@gol/domain';
import { CONWAYS_CLASSIC, createFakeRepositories, createMockOrganisms } from '@gol/test-utils';
import OrganismEditorModal from '@/components/organisms/editor/OrganismEditorModal';
import OrganismInUseDialog from '@/components/organisms/OrganismInUseDialog';
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

// Story 4.17: a small library for the edit entry. The usage counts are the PROBE's, not derived —
// this file pins the hook's gate on the number it is handed, `OrganismLibrary.test.tsx` pins that
// the number comes from `buildUsageIndex`.
const LIBRARY: readonly Organism[] = [CONWAYS_CLASSIC, ...createMockOrganisms()];
const USED_IN: Readonly<Record<string, number>> = {
  [CONWAYS_CLASSIC.id]: 0,
  [LIBRARY[1].id]: 2,
};

/**
 * Stands in for `<OrganismLibrary>`: the create trigger carries the `[data-create-organism]` hook
 * the focus restore looks up, an Edit button per organism carries `data-edit-organism-id`
 * (Story 4.17), an "elsewhere" control models focus the user placed somewhere real, and the REAL
 * modal and the REAL in-use dialog are mounted on `mounted` / `gateMounted` — the caller's two
 * conditional mounts, and the reason the hook exposes both flags at all.
 */
function Probe({
  onSaved,
  cloneResult,
  cards = LIBRARY,
}: {
  onSaved?: (organism: Organism) => void;
  /** Story 4.18: the injected `onCloneAndEdit` option, controlled per-test — the `Probe` gains a
   * `cloneResult` the test controls, per the story's Task 4 test rig. */
  cloneResult?: (source: Organism) => Promise<Organism | null>;
  cards?: readonly Organism[];
} = {}) {
  const result = useOrganismEditorModal('library', { onSaved, onCloneAndEdit: cloneResult });
  useEffect(() => {
    latest = result;
  });
  // A FRESH fake per Probe instance — a shared repository across renders would leak a saved
  // record from one test's assertions into another's. The lazy-initialiser form runs once per
  // mount (`useRef(...).current` reads a ref during render, which `react-hooks/refs` now flags).
  const [organisms] = useState(() => createFakeRepositories({ organisms: [...LIBRARY] }).organisms);

  return (
    <>
      <button type="button" data-create-organism="" onClick={result.requestCreate}>
        + Create New Organism
      </button>
      {cards.map((organism) => (
        <button
          key={organism.id}
          type="button"
          data-edit-organism-id={organism.id}
          onClick={() => result.requestEdit(organism, USED_IN[organism.id] ?? 0)}
        >
          Edit {organism.name}
        </button>
      ))}
      <button type="button" data-testid="elsewhere">
        Elsewhere
      </button>
      {result.gateMounted && <OrganismInUseDialog {...result.gateProps} />}
      {result.mounted && (
        <OrganismEditorModal {...result.modalProps} library={LIBRARY} organisms={organisms} />
      )}
    </>
  );
}

const createButton = () => screen.getByRole('button', { name: '+ Create New Organism' });
const editButton = (organism: Organism) =>
  screen.getByRole('button', { name: `Edit ${organism.name}` });
const editorDialog = () => screen.queryByRole('dialog', { name: 'Organism Editor' });
const gateDialog = () => screen.queryByRole('dialog', { name: /^Used in \d+ Battles?$/ });

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

  // Story 4.16, FD4. Amended 2026-09-22 (Task 11, AC3): a save no longer closes the dialog — it
  // only stashes the record. The caller's `onSaved` fires once, with the LAST stashed record,
  // when the user actually closes the editor (Back/Escape/✕) and the exit transition finishes.
  // Task 12's close-lock (proven in `OrganismEditorModal.test.tsx`, not here — the guard lives in
  // the modal) means a write can never resolve after the dialog has exited, so the earlier
  // "record arriving after an Escape-close has fully exited" scenario and its stale-record replay
  // guard are dead; both were removed along with the `mountedRef` branch that produced them.
  describe('a save (modalProps.onSaved)', () => {
    const record: Organism = {
      schemaVersion: 1,
      id: 'saved-1',
      name: 'Glider',
      colorToken: 'sky-blue',
      dominance: 5,
      agingEnabled: false,
      survivalRules: [],
    };
    const record2: Organism = { ...record, name: 'Glider Mk II' };

    it('does NOT close the dialog', async () => {
      const onSaved = vi.fn();
      const user = userEvent.setup();
      render(<Probe onSaved={onSaved} />);
      await user.click(createButton());

      act(() => hook().modalProps.onSaved(record));

      expect(hook().modalProps.open).toBe(true);
      expect(hook().mounted).toBe(true);
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("Back after a save closes the dialog and, once exited, calls the caller's onSaved once with the record", async () => {
      const onSaved = vi.fn();
      const user = userEvent.setup();
      render(<Probe onSaved={onSaved} />);
      await user.click(createButton());

      act(() => hook().modalProps.onSaved(record));
      act(() => hook().modalProps.onClose());
      expect(onSaved).not.toHaveBeenCalled();
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(hook().mounted).toBe(false);
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledWith(record);
    });

    it('two saves then Back fires once, with the SECOND (last) record', async () => {
      const onSaved = vi.fn();
      const user = userEvent.setup();
      render(<Probe onSaved={onSaved} />);
      await user.click(createButton());

      act(() => hook().modalProps.onSaved(record));
      act(() => hook().modalProps.onSaved(record2));
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledWith(record2);
    });

    it('a close without any save in the session never calls onSaved', async () => {
      const onSaved = vi.fn();
      const user = userEvent.setup();
      render(<Probe onSaved={onSaved} />);
      await user.click(createButton());

      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(onSaved).not.toHaveBeenCalled();
    });

    it('restores focus to the create button after Back following a save, exactly like a plain Close', async () => {
      const onSaved = vi.fn();
      const user = userEvent.setup();
      render(<Probe onSaved={onSaved} />);
      await user.click(createButton());

      act(() => hook().modalProps.onSaved(record));
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(document.activeElement).toBe(createButton());
    });

    it('a caller whose onSaved changes identity between the save and Back gets the LATEST one called', async () => {
      const first = vi.fn();
      const second = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(<Probe onSaved={first} />);
      await user.click(createButton());

      act(() => hook().modalProps.onSaved(record));
      act(() => hook().modalProps.onClose());
      // The option identity changes AFTER Back, before the exit transition finishes.
      rerender(<Probe onSaved={second} />);
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledWith(record);
    });

    // Appends to the existing stability test above: a changing `onSaved` option must not bust the
    // memoised `modalProps` identity either.
    it('modalProps identity is unchanged by a changing onSaved option', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Probe onSaved={vi.fn()} />);
      await user.click(createButton());
      const first = hook().modalProps;

      rerender(<Probe onSaved={vi.fn()} />);

      expect(hook().modalProps).toBe(first);
    });
  });

  // Story 4.17: the edit entry and the FR-1.3 gate. The gate → editor handoff is SEQUENTIAL (the
  // editor mounts only from the gate's `onExited`), the inert window is ONE union across both,
  // and focus restores to the edited card's own Edit button by DOM lookup.
  describe('edit organism from library (Story 4.17)', () => {
    const unused = LIBRARY[0];
    const used = LIBRARY[1];

    it('(a) requestEdit with usedInBattles 0 mounts and opens the editor on the organism, with no gate', async () => {
      const user = userEvent.setup();
      render(<Probe />);

      await user.click(editButton(unused));

      expect(hook().mounted).toBe(true);
      expect(hook().modalProps.open).toBe(true);
      expect(hook().modalProps.organism).toBe(unused);
      expect(hook().gateMounted).toBe(false);
      expect(gateDialog()).toBeNull();
      expect(editorDialog()).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Organism Name' })).toHaveValue(unused.name);
    });

    it('(b) requestEdit with usedInBattles 2 mounts and opens the gate with that count, and NOT the editor', async () => {
      const user = userEvent.setup();
      render(<Probe />);

      await user.click(editButton(used));

      expect(hook().gateMounted).toBe(true);
      expect(hook().gateProps.open).toBe(true);
      expect(hook().gateProps.usedInBattles).toBe(2);
      expect(hook().mounted).toBe(false);
      expect(editorDialog()).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Used in 2 Battles' })).toBeInTheDocument();
    });

    it("(c) Cancel closes the gate; after its exit the gate is unmounted, focus is on THAT organism's Edit button, and the editor never mounted", async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });
      await waitFor(() =>
        expect(within(gate).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
      );

      await user.click(within(gate).getByRole('button', { name: 'Cancel' }));

      expect(hook().gateProps.open).toBe(false);
      expect(hook().gateMounted).toBe(true);
      await act(async () => {
        hook().gateProps.onExited?.();
      });

      expect(hook().gateMounted).toBe(false);
      expect(hook().mounted).toBe(false);
      expect(editorDialog()).toBeNull();
      expect(document.activeElement).toBe(editButton(used));
    });

    it('(d) Edit Anyway closes the gate while still mounted, editor NOT yet mounted; after the gate exits, the editor opens on the organism', async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });

      await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));

      expect(hook().gateProps.open).toBe(false);
      expect(hook().gateMounted).toBe(true);
      expect(hook().mounted).toBe(false);
      expect(editorDialog()).toBeNull();

      await act(async () => {
        hook().gateProps.onExited?.();
      });

      expect(hook().gateMounted).toBe(false);
      expect(hook().mounted).toBe(true);
      expect(hook().modalProps.open).toBe(true);
      expect(hook().modalProps.organism).toBe(used);
      expect(editorDialog()).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Organism Name' })).toHaveValue(used.name);
    });

    it('(e) the background stays inert across the gate → editor handoff', async () => {
      const user = userEvent.setup();
      const background = appendBackground();
      render(<Probe />);
      await user.click(editButton(used));
      expect(isInert(background)).toBe(true);

      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });
      await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
      // Gate closed, fading: still inert.
      expect(isInert(background)).toBe(true);

      await act(async () => {
        hook().gateProps.onExited?.();
      });
      // Editor mounted: still inert — the union never dipped.
      expect(isInert(background)).toBe(true);
      expect(hook().mounted).toBe(true);

      act(() => hook().modalProps.onClose());
      expect(isInert(background)).toBe(true);
      await act(async () => {
        hook().modalProps.onExited?.();
      });
      expect(isInert(background)).toBe(false);
    });

    it("(f) after (d), Back on the editor restores focus to the organism's Edit button once exited", async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });
      await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
      await act(async () => {
        hook().gateProps.onExited?.();
      });
      expect(editorDialog()).toBeInTheDocument();

      screen.getByRole('button', { name: 'Close' }).focus();
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(hook().mounted).toBe(false);
      expect(document.activeElement).toBe(editButton(used));
    });

    it('(g) when that Edit button is gone at restore time, focus falls back to the create button', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Probe />);
      await user.click(editButton(unused));
      expect(editorDialog()).toBeInTheDocument();

      // The card leaves the grid while the editor is open (the organism was deleted elsewhere).
      rerender(<Probe cards={LIBRARY.filter((o) => o.id !== unused.id)} />);
      expect(screen.queryByRole('button', { name: `Edit ${unused.name}` })).toBeNull();

      screen.getByRole('button', { name: 'Close' }).focus();
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(document.activeElement).toBe(createButton());
    });

    it('(h) modalProps.organism is null after requestCreate, and is cleared only after the editor has exited', async () => {
      const user = userEvent.setup();
      render(<Probe />);

      await user.click(createButton());
      expect(hook().modalProps.organism).toBeNull();
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      await user.click(editButton(unused));
      expect(hook().modalProps.organism).toBe(unused);
      act(() => hook().modalProps.onClose());
      // Fading: closed to the user, the record still rides `modalProps` for the mounted modal.
      expect(hook().modalProps.open).toBe(false);
      expect(hook().modalProps.organism).toBe(unused);
      await act(async () => {
        hook().modalProps.onExited?.();
      });
      expect(hook().modalProps.organism).toBeNull();
    });

    it('(i) modalProps and gateProps identities are stable across an unrelated re-render', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Probe />);
      await user.click(editButton(used));
      const modalBefore = hook().modalProps;
      const gateBefore = hook().gateProps;

      rerender(<Probe />);

      expect(hook().modalProps).toBe(modalBefore);
      expect(hook().gateProps).toBe(gateBefore);
    });

    // Review 2026-09-22: the gate stays clickable through its exit fade and its `onClose` is
    // unguarded, so a Cancel landing AFTER Edit Anyway must be honoured — the stashed organism
    // must not open the editor the user just declined.
    it('(j) Cancel during the fade after Edit Anyway wins: the gate unmounts and the editor never opens', async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });

      await user.click(within(gate).getByRole('button', { name: 'Edit Anyway' }));
      expect(hook().gateProps.open).toBe(false);
      expect(hook().gateMounted).toBe(true);
      // Still in the DOM, fading — the Cancel button is reachable.
      await user.click(within(gate).getByRole('button', { name: 'Cancel' }));

      await act(async () => {
        hook().gateProps.onExited?.();
      });

      expect(hook().gateMounted).toBe(false);
      expect(hook().mounted).toBe(false);
      expect(editorDialog()).toBeNull();
      expect(document.activeElement).toBe(editButton(used));
    });

    // Review 2026-09-22: the modal reads `organism` once at mount, so a second request while a
    // window is still mounted (open or fading) must be ignored rather than re-open the fading
    // instance under a different record. Reachable only programmatically — the inert background
    // blocks the click for a user — which is exactly why the state machine guards it itself.
    it('(k) requestEdit and requestCreate are no-ops while the editor or the gate is still mounted', async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(editButton(unused));
      expect(hook().modalProps.organism).toBe(unused);

      // Editor open: an edit request for ANOTHER organism and a create request both bounce.
      act(() => hook().requestEdit(used, 0));
      expect(hook().modalProps.organism).toBe(unused);
      expect(hook().gateMounted).toBe(false);
      act(() => hook().requestCreate());
      expect(hook().modalProps.organism).toBe(unused);
      expect(hook().modalProps.open).toBe(true);

      // Editor closed but still fading: the same.
      act(() => hook().modalProps.onClose());
      expect(hook().modalProps.open).toBe(false);
      act(() => hook().requestEdit(used, 2));
      expect(hook().gateMounted).toBe(false);
      expect(hook().modalProps.open).toBe(false);
      expect(hook().modalProps.organism).toBe(unused);

      // Fully exited: the request goes through (positive control), and the gate window guards too.
      await act(async () => {
        hook().modalProps.onExited?.();
      });
      act(() => hook().requestEdit(used, 2));
      expect(hook().gateMounted).toBe(true);
      act(() => hook().requestEdit(unused, 0));
      expect(hook().mounted).toBe(false);
      expect(hook().modalProps.organism).toBeNull();
      expect(hook().gateProps.usedInBattles).toBe(2);
    });
  });

  // Story 4.18, AC9/AC11: Clone & Edit routes through the SAME proceedRef handoff Edit Anyway
  // uses — the editor opens on whatever `handleGateCloneAndEdit` stashed, never on the source.
  describe('Clone & Edit from the gate (Story 4.18)', () => {
    const used = LIBRARY[1];
    const clone: Organism = { ...used, id: 'clone-of-used', name: `${used.name} (Copy)` };

    it('(a) calls the writer ONCE with the SOURCE; gateProps.pending is true while unsettled, the gate stays open and the editor is not mounted; once resolved and exited, the editor opens on the CLONE', async () => {
      const user = userEvent.setup();
      let resolveClone!: (value: Organism | null) => void;
      const cloneResult = vi.fn(
        () =>
          new Promise<Organism | null>((resolve) => {
            resolveClone = resolve;
          }),
      );
      render(<Probe cloneResult={cloneResult} />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });

      await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));

      expect(cloneResult).toHaveBeenCalledTimes(1);
      expect(cloneResult).toHaveBeenCalledWith(used);
      await waitFor(() => expect(hook().gateProps.pending).toBe(true));
      expect(hook().gateProps.open).toBe(true);
      expect(hook().mounted).toBe(false);
      expect(editorDialog()).toBeNull();

      await act(async () => {
        resolveClone(clone);
      });
      // Review 2026-09-22: `pending` no longer clears when the writer resolves — it spans the exit
      // fade and is released in `handleGateExited`, so "closing, but not yet exited" is a `pending`
      // state now. (e2) below is the regression that made it one.
      expect(hook().gateProps.open).toBe(false);
      expect(hook().gateProps.pending).toBe(true);
      expect(hook().mounted).toBe(false);

      await act(async () => {
        hook().gateProps.onExited?.();
      });
      expect(hook().gateProps.pending).toBe(false);

      expect(hook().mounted).toBe(true);
      expect(hook().modalProps.open).toBe(true);
      expect(hook().modalProps.organism).toBe(clone);
      expect(hook().modalProps.organism).not.toBe(used);
      expect(editorDialog()).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Organism Name' })).toHaveValue(clone.name);
    });

    it('(b) a null result closes the gate without ever mounting the editor, and restores focus to the SOURCE Edit button', async () => {
      const user = userEvent.setup();
      const cloneResult = vi.fn(async () => null);
      render(<Probe cloneResult={cloneResult} />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });

      await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));

      expect(cloneResult).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(hook().gateProps.open).toBe(false));
      expect(hook().gateMounted).toBe(true);
      expect(hook().mounted).toBe(false);

      await act(async () => {
        hook().gateProps.onExited?.();
      });

      expect(hook().gateMounted).toBe(false);
      expect(hook().mounted).toBe(false);
      expect(editorDialog()).toBeNull();
      expect(document.activeElement).toBe(editButton(used));
    });

    it('(c) after (a), Back on the editor restores focus to the CLONE Edit button once its card exists; with that node absent, to the create button', async () => {
      const user = userEvent.setup();
      const cloneResult = vi.fn(async () => clone);
      const { rerender } = render(<Probe cloneResult={cloneResult} />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });
      await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));
      await waitFor(() => expect(hook().gateProps.open).toBe(false));
      await act(async () => {
        hook().gateProps.onExited?.();
      });
      expect(editorDialog()).toBeInTheDocument();

      // The clone's card is now in the grid (the writer reloads, FD9) — modelled the same way
      // test (g) above models a card leaving the grid.
      rerender(<Probe cloneResult={cloneResult} cards={[...LIBRARY, clone]} />);

      screen.getByRole('button', { name: 'Close' }).focus();
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: `Edit ${clone.name}` }),
      );
    });

    it('(c) with the clone card absent at restore time, focus falls back to the create button', async () => {
      const user = userEvent.setup();
      const cloneResult = vi.fn(async () => clone);
      render(<Probe cloneResult={cloneResult} />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });
      await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));
      await waitFor(() => expect(hook().gateProps.open).toBe(false));
      await act(async () => {
        hook().gateProps.onExited?.();
      });
      expect(editorDialog()).toBeInTheDocument();

      screen.getByRole('button', { name: 'Close' }).focus();
      act(() => hook().modalProps.onClose());
      await act(async () => {
        hook().modalProps.onExited?.();
      });

      expect(document.activeElement).toBe(createButton());
    });

    it('(d) the background stays inert throughout the Clone & Edit handoff — before, during pending, across the handoff and until the editor closes', async () => {
      const user = userEvent.setup();
      const background = appendBackground();
      let resolveClone!: (value: Organism | null) => void;
      const cloneResult = vi.fn(
        () =>
          new Promise<Organism | null>((resolve) => {
            resolveClone = resolve;
          }),
      );
      render(<Probe cloneResult={cloneResult} />);
      await user.click(editButton(used));
      expect(isInert(background)).toBe(true);

      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });
      await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));
      await waitFor(() => expect(hook().gateProps.pending).toBe(true));
      expect(isInert(background)).toBe(true);

      await act(async () => {
        resolveClone(clone);
      });
      await waitFor(() => expect(hook().gateProps.open).toBe(false));
      expect(isInert(background)).toBe(true);

      await act(async () => {
        hook().gateProps.onExited?.();
      });
      expect(isInert(background)).toBe(true);
      expect(hook().mounted).toBe(true);

      act(() => hook().modalProps.onClose());
      expect(isInert(background)).toBe(true);
      await act(async () => {
        hook().modalProps.onExited?.();
      });
      expect(isInert(background)).toBe(false);
    });

    it('(e) a second Clone & Edit click while pending calls the writer only once', async () => {
      const user = userEvent.setup();
      let resolveClone!: (value: Organism | null) => void;
      const cloneResult = vi.fn(
        () =>
          new Promise<Organism | null>((resolve) => {
            resolveClone = resolve;
          }),
      );
      render(<Probe cloneResult={cloneResult} />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });

      // BOTH calls in ONE tick, with no re-render between them (review 2026-09-22). The original
      // shape awaited `pending === true` first, which is a re-render — so the guard under test was
      // read from a FRESH closure and the stale-closure path it exists to cover was never
      // exercised. `gatePending` used to be React state read from the render closure: two calls
      // landing in one tick both saw `false` and both called the writer. The ref latch is what
      // makes this assertion real.
      act(() => {
        hook().gateProps.onCloneAndEdit();
        hook().gateProps.onCloneAndEdit();
      });

      expect(cloneResult).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(hook().gateProps.pending).toBe(true));

      // The gate's own `disabled={pending}` is the user-facing affordance; the hook's guard is
      // the authority, exercised directly (the re-entrancy shape every latch test in this repo
      // uses).
      act(() => hook().gateProps.onCloneAndEdit());

      expect(cloneResult).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveClone(clone);
      });
    });

    it('(e2) the write window spans the EXIT FADE: a second Clone & Edit after the writer resolves, but before the gate has exited, writes nothing more', async () => {
      const user = userEvent.setup();
      const cloneResult = vi.fn(() => Promise.resolve<Organism | null>(clone));
      render(<Probe cloneResult={cloneResult} />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });

      await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));
      // The writer has resolved and the gate is closing — but `onExited` has NOT fired, so the
      // dialog is still mounted and still clickable through its ~195 ms fade.
      await waitFor(() => expect(hook().gateProps.open).toBe(false));
      expect(hook().gateMounted).toBe(true);

      // Review 2026-09-22: `pending` used to clear when the writer resolved, which re-enabled all
      // three buttons for that whole window. A second Clone & Edit then passed the guard (`gate`
      // is cleared only in `handleGateExited`) and wrote a SECOND, orphaned clone.
      expect(hook().gateProps.pending).toBe(true);
      act(() => hook().gateProps.onCloneAndEdit());
      expect(cloneResult).toHaveBeenCalledTimes(1);

      // ...and a Cancel in that same window must not discard the clone that is already written.
      act(() => hook().gateProps.onCancel());
      await act(async () => {
        hook().gateProps.onExited?.();
      });
      expect(hook().mounted).toBe(true);
      expect(hook().modalProps.organism).toEqual(clone);
      // The guard is released once the gate is actually gone.
      expect(hook().gateProps.pending).toBe(false);
    });

    it('(g) onCloneAndEdit is held in a latest-value ref: gateProps identity does not track it, and the LATEST option is the one called', async () => {
      const user = userEvent.setup();
      const first = vi.fn(() => Promise.resolve<Organism | null>(clone));
      const second = vi.fn(() => Promise.resolve<Organism | null>(clone));
      const { rerender } = render(<Probe cloneResult={first} />);
      await user.click(editButton(used));

      const before = hook().gateProps;
      rerender(<Probe cloneResult={second} />);
      // Identity is unchanged by a changed option — the reason the ref exists (the `onSaved`
      // test above makes the same claim for the save callback).
      expect(hook().gateProps).toBe(before);

      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });
      await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));

      await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
      expect(first).not.toHaveBeenCalled();
    });

    it('(f) no onCloneAndEdit option supplied: Clone & Edit resolves to null and behaves like (b), without throwing', async () => {
      const user = userEvent.setup();
      render(<Probe />);
      await user.click(editButton(used));
      const gate = screen.getByRole('dialog', { name: 'Used in 2 Battles' });

      await user.click(within(gate).getByRole('button', { name: 'Clone & Edit' }));

      await waitFor(() => expect(hook().gateProps.open).toBe(false));
      expect(hook().mounted).toBe(false);

      await act(async () => {
        hook().gateProps.onExited?.();
      });

      expect(hook().gateMounted).toBe(false);
      expect(hook().mounted).toBe(false);
      expect(editorDialog()).toBeNull();
      expect(document.activeElement).toBe(editButton(used));
    });
  });
});
