'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * The smallest viewport the battle route and the Organism Editor are usable at (NFR-3.1). Measured
 * 2026-09-30 across phone, tablet and laptop viewports: below 700px wide the Lab dish collapses and
 * the columns overlap; below 480px tall every landscape phone (375–430px) leaves the Lab with
 * 2–3px cells nobody can paint with a finger and clips the Run sidebar. Every tablet clears both,
 * iPad mini portrait (744px) included. Size, never orientation or device class: a landscape screen
 * that clears both bounds is let through.
 */
export const MIN_USABLE_WIDTH_PX = 700;
export const MIN_USABLE_HEIGHT_PX = 480;

// `.98` rather than `MIN - 1`: a zoomed or fractional-DPR viewport can measure 699.5px, which a
// `max-width: 699px` query would let through and a `min-width: 700px` one would not match either.
export const SMALL_SCREEN_QUERY = `(max-width: ${MIN_USABLE_WIDTH_PX - 0.02}px), (max-height: ${MIN_USABLE_HEIGHT_PX - 0.02}px)`;

// A screen that would clear both bounds if the device were turned. Only a device whose long side
// reaches the width bound AND whose short side reaches the height bound qualifies — no phone does
// (their short side is under 480px), so the hint never promises a rotation that cannot help.
export const ROTATE_HINT_QUERY = `(orientation: portrait) and (min-width: ${MIN_USABLE_HEIGHT_PX}px) and (min-height: ${MIN_USABLE_WIDTH_PX}px)`;

// jsdom ships no `matchMedia`, and every component test that mounts a gated surface would
// otherwise throw on render; no viewport to measure reads as "not small", the server's answer.
function smallScreenQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(SMALL_SCREEN_QUERY) : null;
}

function subscribeSmallScreen(onChange: () => void): () => void {
  const query = smallScreenQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/**
 * Whether the viewport is below the usable size. `false` on the server and during hydration: the
 * static export has no viewport to read, so anything that must be right on the FIRST paint (the
 * gate panel's visibility) is a CSS media query on `SMALL_SCREEN_QUERY`, and this hook only drives
 * what CSS cannot set — `inert` on the content behind the panel.
 */
export function useIsSmallScreen(): boolean {
  return useSyncExternalStore(
    subscribeSmallScreen,
    () => smallScreenQuery()?.matches ?? false,
    () => false,
  );
}

// sessionStorage, not the `gol:*` localStorage keys: a per-tab convenience, deliberately outside
// STORAGE_KEYS so it is neither exported, metered (AR-14) nor cleared with the workspace.
const DISMISS_KEY = 'gol-small-screen-continue';

// The in-memory copy is what makes "Continue anyway" work where sessionStorage throws (Safari
// private mode, blocked site data): the tab still remembers it until reload.
let dismissedInMemory = false;
const dismissListeners = new Set<() => void>();

function readDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function subscribeDismissed(onChange: () => void): () => void {
  dismissListeners.add(onChange);
  return () => dismissListeners.delete(onChange);
}

/**
 * The viewer's "Continue anyway", shared by every gate in the tab — dismissing it on the battle
 * route also lets the Organism Editor through, so one choice is asked once per session.
 */
export function useSmallScreenDismissal(): [dismissed: boolean, dismiss: () => void] {
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => false);
  const dismiss = useCallback(() => {
    dismissedInMemory = true;
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // The in-memory copy above already carries it for this page's lifetime.
    }
    for (const listener of dismissListeners) listener();
  }, []);
  return [dismissed, dismiss];
}

/**
 * Whether a gate is covering its surface right now: below the floor and not dismissed. For a host
 * that must adapt around the panel — the Organism Editor's focus trap — not for the panel itself.
 */
export function useSmallScreenGated(): boolean {
  const small = useIsSmallScreen();
  const [dismissed] = useSmallScreenDismissal();
  return small && !dismissed;
}

/** Test-only: module state outlives a test, so each test starts un-dismissed. */
export function resetSmallScreenDismissalForTests(): void {
  dismissedInMemory = false;
}
