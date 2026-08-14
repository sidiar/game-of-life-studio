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

    // Runs from a PLAIN useEffect, not useLayoutEffect — deliberately. MUI's own focus-trap move
    // (onto the dialog's autoFocus target) must already have happened before this runs; inerting a
    // subtree that still holds the focused element would drop focus to <body> instead of landing
    // it on Cancel.
    const hidden = Array.from(document.body.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && el.getAttribute('aria-hidden') === 'true',
    );
    for (const el of hidden) el.inert = true;

    return () => {
      for (const el of hidden) el.inert = false;
    };
  }, [active]);
}
