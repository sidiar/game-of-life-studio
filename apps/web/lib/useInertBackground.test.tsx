import { afterEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useInertBackground } from './useInertBackground';

/**
 * deferred-work.md (code review of 2-14): "**Pick this up in Story 2.16** (`<UnsavedChangesDialog>`)
 * … worth making once against a regression test that actually pins the DOM state (not just an axe
 * pass, which this entry's own measurement shows is not sensitive enough)."
 *
 * This is that test file. It asserts `inert` on real body children — the hook's only observable
 * output — because the axe run the entry measured passed with zero violations even with the hook
 * doing nothing at all, which is precisely why an axe pass could not close this.
 */

function Probe({ active }: { active: boolean }) {
  useInertBackground(active);
  return <div data-testid="probe" />;
}

/**
 * ⚠️ jsdom implements no `inert` — there is no reflected property and no attribute, so
 * `element.inert` is a plain expando that reads `undefined` until the hook writes it. That is why
 * every assertion below goes through this predicate rather than comparing to `false`: `undefined`
 * and `false` are the same fact here ("not inerted"), and `toBe(false)` would fail against an
 * element the hook has correctly never touched. The real behaviour of the attribute is a browser
 * concern the e2e's axe runs cover; what this file pins is which elements the hook WRITES.
 */
function isInert(element: HTMLElement): boolean {
  return element.inert === true;
}

/** A body-level sibling, the shape MUI's ModalManager marks while a Dialog is open. */
function appendBackground(ariaHidden: boolean): HTMLElement {
  const element = document.createElement('div');
  if (ariaHidden) element.setAttribute('aria-hidden', 'true');
  document.body.appendChild(element);
  return element;
}

/** MutationObserver callbacks are delivered as a MICROTASK, so a mutation made inside `act` is
 * observed by the time `act` returns. */
async function flushObservers(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useInertBackground', () => {
  it('inerts the aria-hidden body children that already exist when it activates', () => {
    const hidden = appendBackground(true);
    const visible = appendBackground(false);

    render(<Probe active />);

    expect(isInert(hidden)).toBe(true);
    // ❌ Never a blanket sweep: an element MUI did not mark is not the dialog's background.
    expect(isInert(visible)).toBe(false);
  });

  it('does nothing while inactive', () => {
    const hidden = appendBackground(true);

    render(<Probe active={false} />);

    expect(isInert(hidden)).toBe(false);
  });

  it('releases inert on deactivation, and on unmount', async () => {
    const hidden = appendBackground(true);
    const { rerender, unmount } = render(<Probe active />);
    expect(isInert(hidden)).toBe(true);

    rerender(<Probe active={false} />);
    expect(isInert(hidden)).toBe(false);

    rerender(<Probe active />);
    expect(isInert(hidden)).toBe(true);
    unmount();
    expect(isInert(hidden)).toBe(false);
  });

  it('restores an element that was ALREADY inert on its own account, rather than un-inerting it', () => {
    const hidden = appendBackground(true);
    hidden.inert = true;

    const { unmount } = render(<Probe active />);
    unmount();

    // Restoring a blanket `false` here would permanently un-inert a sibling that had nothing to do
    // with this dialog, after the first dialog cycle.
    expect(isInert(hidden)).toBe(true);
  });

  /**
   * ⚠️ deferred-work.md's entry, as a regression test. The hook activates in the SAME commit that
   * decides a `next/dynamic` dialog should open — and on the first activation of a page session
   * that dialog's chunk has not resolved, so MUI has not mounted its Modal and has marked nothing
   * `aria-hidden` yet. The old one-shot snapshot found nothing, and `[active]` never changed
   * again, so the background stayed tabbable for the whole confirmation.
   *
   * Mutation check: deleting the `MutationObserver` (leaving the initial `sweep()`) reddens this
   * test and the two below it — the three that describe something arriving after activation — and
   * nothing else.
   */
  it('inerts a background that becomes aria-hidden AFTER it activates (the lazy-dialog race)', async () => {
    render(<Probe active />);

    // MUI's ModalManager, arriving one chunk-load later.
    const late = appendBackground(false);
    late.setAttribute('aria-hidden', 'true');
    await flushObservers();

    expect(isInert(late)).toBe(true);
  });

  it('inerts a body child APPENDED while it is active (a second portal)', async () => {
    render(<Probe active />);

    const portal = appendBackground(true);
    await flushObservers();

    expect(isInert(portal)).toBe(true);
  });

  it('releases everything it inerted, including what it picked up late', async () => {
    const early = appendBackground(true);
    const { unmount } = render(<Probe active />);
    const late = appendBackground(true);
    await flushObservers();
    expect(isInert(late)).toBe(true);

    unmount();

    expect(isInert(early)).toBe(false);
    expect(isInert(late)).toBe(false);
  });

  /**
   * Story 4.22 review (2026-09-25): two instances at once — a dialog stacked over the editor. MUI
   * marks the editor's own portal aria-hidden when the nested modal mounts, and BOTH observers see
   * it, the editor's first (registered first). With a map per instance the stacked one recorded
   * `inert: true` as the portal's prior state and its cleanup handed the editor back dead
   * (measured in Chromium; the e2e "Cancel on the stacked confirmation" pins the browser).
   */
  it('a stacked instance releases what the under-modal instance also holds, once MUI un-hides it', async () => {
    const root = appendBackground(true);
    const under = render(<Probe active />);
    expect(isInert(root)).toBe(true);

    // The under-modal's own portal, hidden by the nested modal's mount; the second instance opens
    // over it (a `dynamic()` chunk: it activates before its Modal marks anything).
    const editorPortal = appendBackground(false);
    const stacked = render(<Probe active />);
    editorPortal.setAttribute('aria-hidden', 'true');
    await flushObservers();
    expect(isInert(editorPortal)).toBe(true);

    // The nested modal closes: MUI lifts its aria-hidden from the portal, then the stacked
    // instance cleans up. The editor must be live again; the page root stays inert under it.
    editorPortal.removeAttribute('aria-hidden');
    stacked.unmount();
    expect(isInert(editorPortal)).toBe(false);
    expect(isInert(root)).toBe(true);

    under.unmount();
    expect(isInert(root)).toBe(false);
  });

  it('does not strand an element inert when a sweep runs twice over it', async () => {
    const hidden = appendBackground(true);
    const { unmount } = render(<Probe active />);

    // A second sweep — anything at all mutating body while the dialog is open. Without the
    // `restore.has(element)` guard this would record `true` as the element's PRIOR state and the
    // cleanup would leave it inert forever.
    appendBackground(false);
    await flushObservers();
    unmount();

    expect(isInert(hidden)).toBe(false);
  });
});
