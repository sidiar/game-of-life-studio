'use client';

import { useEffect, useRef } from 'react';

/**
 * Story 3.19 (spec §4, FR-4.1/4.3/4.4, AC5): Run-mode-only key handling, mounted ONCE from
 * `<BattleSimulationView>` — the three transport verbs the bar/HUD buttons already call (the view
 * composes `onStop` so that `Escape` also exits the fullscreen stage, FD4 (c); the buttons' own
 * Stop does not), plus the fullscreen toggle composed from `<BattlePage>`'s two callbacks (FD5).
 * `canStep` is a boolean, not the `status` string, so the hook interprets nothing and needs no
 * `SimulationStatus` import (FD2 (a)) — the same reason `sim.step()`'s throw while playing (trap 1)
 * can never reach the hook: `canStep` gates the call, the hook never `try`s.
 *
 * The hint lines (`<HotkeyHints>`) land in the same story as this hook because NFR-4.1 forbids a
 * hint with nothing behind it — which is also why 3.12 and 3.18 each left their half for 3.19.
 * FD3 (a)'s consequence, recorded here because it is the reviewer's first question: `SPACE
 * Play/Pause` is true whenever focus is LOOSE (`<body>`) or on a non-activating element — after a
 * pointer click on the dish, after a Gallery Run entry (`?mode=run`, focus starts on `<body>`) —
 * and NOT while a button holds focus: there Space activates the button, once (rule (vi) below), so
 * right after Cancel on the unsaved-changes dialog (focus restored to Back) Space re-opens the
 * dialog, and right after `F` (focus on Exit / the Fullscreen button) Space toggles the stage.
 */
export interface SimulationHotkeyBindings {
  readonly onPlayPause: () => void;
  readonly onStep: () => void;
  readonly onStop: () => void;
  readonly onToggleFullscreen: () => void;
  readonly canStep: boolean;
}

// AC3 (iv): editable and key-consuming controls. `input` alone covers both `<LadderSlider>`s
// (native `<input type="range">`, trap 5) and text fields; `[role="slider"]` covers an ARIA
// slider that may arrive later. `[contenteditable]:not([contenteditable="false"])` — any value
// but the explicit "false" string counts as editable, per the AC's own wording.
const EDITABLE_OR_KEY_CONSUMING_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(', ');

// AC3 (vi) / FD3 (a): controls that natively activate on Space. Space on any of these is left to
// the browser entirely — the hook does nothing — so a focused Play/Stop/Back button never fires
// twice (trap 4).
const SPACE_ACTIVATOR_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
].join(', ');

// AC3 (v) / FD10 (a): a dialog anywhere on the page, or the event coming from inside one. A DOM
// query rather than a prop — it holds for ANY future modal (Story 4.24/4.25's
// `<OrganismEditorModal>`) without touching this hook (`lane-gates.yaml`'s 4.24 row). MUI keeps
// the `role="dialog"` Paper mounted through its exit transition, so the query still matches a
// beat after Cancel (trap 6).
const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"]';

/** FD3 (a): true when Space on this target would natively activate it. Exported for its own unit tests. */
export function isSpaceActivator(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SPACE_ACTIVATOR_SELECTOR) !== null;
}

/**
 * AC3's six suspension rules, in the check order the spec lists them. A pure function of the
 * event (and, for (v)'s first half, the document) — exported so each rule gets its own unit test
 * without going through `renderHook`.
 */
export function shouldIgnoreHotkey(event: KeyboardEvent): boolean {
  // (i) An IME or an inner handler already claimed the key.
  if (event.defaultPrevented || event.isComposing) return true;

  // (ii) `shiftKey` is deliberately NOT here (trap 11) — `Shift+F` yields `key: 'F'`, which the
  // case-insensitive match below still accepts.
  if (event.ctrlKey || event.metaKey || event.altKey) return true;

  // (iii) A held key fires once (FD7).
  if (event.repeat) return true;

  const target = event.target;

  // (iv) The target is, or is inside, an editable or key-consuming control.
  if (target instanceof Element && target.closest(EDITABLE_OR_KEY_CONSUMING_SELECTOR) !== null) {
    return true;
  }

  // (v) A dialog is present anywhere on the page, or the event came from inside one.
  if (document.querySelector(DIALOG_SELECTOR) !== null) return true;
  if (target instanceof Element && target.closest(DIALOG_SELECTOR) !== null) return true;

  // (vi) Space only: the target natively activates on Space — defer to the browser.
  if (event.key === ' ' && isSpaceActivator(target)) return true;

  return false;
}

/** The four keys, matched the way the listener's dispatch chain matches them (trap 7 / trap 11). */
function isHotkey(key: string): boolean {
  return key === ' ' || key === 'ArrowRight' || key === 'Escape' || key.toLowerCase() === 'f';
}

/**
 * A single `window` `keydown` listener, attached on mount and removed on unmount — NEVER
 * re-subscribed when `bindings` changes (the view re-renders at up to 10 Hz while playing; AR-29,
 * AC1). `window`, not the canvas or a container: the canvas is not focusable and focus is usually
 * loose in Run mode (a click on the dish blurs, `<body>` holds it), so the listener has to sit
 * above every possible focus target to be reachable at all.
 *
 * Trap 2 / trap 3: `bindingsRef` is the LATEST bindings, refreshed in a deps-less effect declared
 * BEFORE the listener effect (the `PetriDishCanvas.tsx:826-843` idiom) so the refresh commits
 * before the listener could fire from the same commit. The listener effect itself has `[]` deps —
 * a `[bindings]` dependency would tear the listener down and re-add it up to 10 times a second,
 * the exact churn AR-29 forbids. Reading `ref.current` happens inside the event callback, which is
 * not render, so this is not `react-hooks/refs` territory; nothing here is written during render.
 */
export function useSimulationHotkeys(bindings: SimulationHotkeyBindings): void {
  const bindingsRef = useRef(bindings);
  useEffect(() => {
    bindingsRef.current = bindings;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // The key set first, the suspension rules second: rule (v) is a `document.querySelector`,
      // and without this filter it would run for every key typed anywhere in Run mode (Tab, a
      // modifier, a letter) only to be discarded by the dispatch below. `typeof` rather than a
      // truthiness check — a `keydown` dispatched as a plain `Event` carries no `key` at all, and
      // `.toLowerCase()` on `undefined` would throw inside a window listener.
      if (typeof event.key !== 'string' || !isHotkey(event.key)) return;
      if (shouldIgnoreHotkey(event)) return;

      const { onPlayPause, onStep, onStop, onToggleFullscreen, canStep } = bindingsRef.current;

      // Trap 10: every HANDLED key prevents its native effect uniformly (Space would scroll,
      // ArrowRight would scroll horizontally) — including a gated ArrowRight (`canStep: false`),
      // so "handled" and "prevents default" never disagree for a reviewer reading the tests.
      // Exhaustive over `isHotkey`'s four members — an unrecognised key returned above, before
      // `preventDefault` could touch it, so there is no fall-through case to write here.
      if (event.key === ' ') {
        event.preventDefault();
        onPlayPause();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        // FR-4.3 "paused only" / trap 1: `sim.step()` throws while playing, and this hook never
        // `try`s — `canStep` is the same boolean the Next-cycle button's `disabled` reads.
        if (canStep) onStep();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onStop();
      } else {
        // Trap 11: `isHotkey` matched what the user TYPED (`key.toLowerCase() === 'f'`), not where
        // the key physically is (`code === 'KeyF'` would also fire on a non-Latin layout).
        event.preventDefault();
        onToggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
