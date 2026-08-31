'use client';

import { useEffect } from 'react';

// Story 1.13 Task 3/5. Measured at d49ce59: @mui/material@9.3.1's Modal/ModalManager.js marks
// every OTHER document.body child aria-hidden="true" while a Dialog is open, and ships no `inert`
// path anywhere in the package (`grep -rn inert node_modules/@mui/material/Modal
// node_modules/@mui/material/Unstable_TrapFocus` returns nothing). The Gallery's tiles, delete
// buttons and organism dots are all real focusable elements inside that now-aria-hidden subtree —
// a background that CLAIMS to be hidden from assistive tech while still being reachable by Tab.
//
// Measured (Task 5, BattleGallery.test.tsx's "has no axe violations with the delete dialog open"):
// axe-core's `aria-hidden-focus` rule does not land in `violations` under jsdom — it lands in
// `incomplete`, with exactly one matching node, because jsdom has no real layout for the rule's
// visibility computation to resolve against (the same class of limitation Story 1.9/1.12 documented
// for colour-contrast). The structural fact behind that ambiguous finding is not in doubt — the
// subtree genuinely holds focusable elements under an aria-hidden ancestor — so this hook makes the
// aria-hidden claim true rather than waiting for a real-browser run to turn "incomplete" into a
// reported violation.
//
// `inert` (not a second aria-hidden, not a manual tabIndex sweep) is the honest fix: it makes the
// background genuinely non-interactive for pointer, keyboard AND assistive tech in one native
// attribute, matching what aria-hidden already claims. Supported across the whole NFR-2.1 matrix
// (Chrome 102+, Firefox 112+, Safari 15.5+) and passed through by React 19 as a boolean prop.
export function useInertBackground(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;

    // Prior value captured per element, not restored to a blanket `false`: ModalManager keeps
    // siblings that were ALREADY aria-hidden before the dialog opened in its hidden set
    // (ModalManager.getHiddenSiblings), so one of them could legitimately have been inert on its
    // own account. Restoring `false` unconditionally would permanently un-inert it after the first
    // dialog cycle.
    const restore = new Map<HTMLElement, boolean>();

    // Runs from a PLAIN useEffect, not useLayoutEffect — deliberately. MUI's own focus-trap move
    // (onto the dialog's autoFocus target) must already have happened before this runs; inerting a
    // subtree that still holds the focused element would drop focus to <body> instead of landing
    // it on Cancel.
    const sweep = () => {
      for (const element of document.body.children) {
        if (!(element instanceof HTMLElement)) continue;
        if (element.getAttribute('aria-hidden') !== 'true') continue;
        // Idempotent: an element already swept keeps the value captured the FIRST time, so a
        // repeated sweep can never record `true` as its "prior" state and strand it inert.
        if (restore.has(element)) continue;
        restore.set(element, element.inert);
        element.inert = true;
      }
    };

    sweep();

    // deferred-work.md (code review of 2-14), CLOSED by Story 2.16. The sweep above used to be the
    // WHOLE hook — a one-shot read taken in the same commit that decided a dialog should open. For
    // a statically imported dialog that is fine: MUI mounts the Modal and marks the siblings
    // aria-hidden in the same commit, so the snapshot sees them. For a `next/dynamic` dialog it is
    // not: on the first activation in a page session the lazy chunk has not resolved, that commit
    // renders no Modal at all, the sweep finds nothing aria-hidden, and `[active]` never changes
    // again — so the background is never inerted for that whole session's first confirmation.
    // `<ResizeClipWarningDialog>` (Story 2.14) introduced the race and this story's
    // `<UnsavedChangesDialog>` is the second lazy consumer, which is what makes it worth fixing in
    // the shared hook rather than at either call site.
    //
    // The observer also closes the bound the original comment named: a body child appended WHILE a
    // dialog is open (a nested modal, a toast layer) is now swept too, rather than being missed by
    // both MUI's already-run ariaHiddenSiblings pass and this hook.
    //
    // `subtree: true` is needed for the ATTRIBUTE half — MUI sets `aria-hidden` on body's own
    // children, and an attribute observer registered on `document.body` alone would only report
    // changes to body's attributes. The cost is a callback per DOM mutation while a dialog is
    // open, and the sweep it runs is a filter over `document.body.children` (three elements on
    // every page in this app) with an early `continue` for everything already handled.
    const observer = new MutationObserver(sweep);
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      attributeFilter: ['aria-hidden'],
      subtree: true,
    });

    return () => {
      observer.disconnect();
      for (const [element, wasInert] of restore) element.inert = wasInert;
    };
  }, [active]);
}
