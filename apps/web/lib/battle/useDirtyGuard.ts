'use client';

import { useEffect } from 'react';

/**
 * FR-7.9's second half: the browser's own "leave site?" prompt, registered **only** while there is
 * unsaved work. RFC-005 Decision 7's snippet, verbatim in shape.
 *
 * ⚠️ This is ONE of two independent channels, not a general navigation guard.
 * `beforeunload` fires on a real document unload (tab close, refresh, typing a new URL) and
 * **never** on a client-side route change — so the in-app Back path needs its own confirmation
 * (`<UnsavedChangesDialog>`, run from `<BattlePage>`), and that dialog can never see a tab close.
 * The two cannot substitute for each other, and RFC-005's routing reconciliation note says in as
 * many words that no router-level navigation blocker is wanted for the FR-7.9 guard (the App
 * Router exposes none anyway).
 *
 * ⚠️ The `!isDirty` early return is BEFORE the listener is attached, so a clean page has no
 * `beforeunload` listener at all — not one that returns early. That is the falsifiable form of the
 * AC's "inactive when clean": a listener that merely declines to act is indistinguishable, from
 * outside, from one that acts on the wrong condition, and a registered no-op listener still costs
 * the page its back/forward-cache eligibility in Chrome and Firefox.
 *
 * ❌ No `typeof window` guard: `useEffect` never runs during the static export's prerender — the
 * same reason `<BattlePage>`'s two title effects give in place. (`useInertBackground` guards
 * `document` for its own reasons; that guard is not a convention to copy here.)
 */
export function useDirtyGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Both forms, deliberately. `preventDefault()` is the modern spec-mandated signal; the
      // legacy `returnValue = ''` is still what some engines actually read, and RFC-005 Decision
      // 7's own snippet carries both. Neither returns a string — a custom message has been ignored
      // by every browser for a decade, and returning one only adds a value nothing consumes.
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
}
