'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { styled } from '@mui/material/styles';
import { resetWorkspace, type AppRepositories, type OrganismRepository } from '@gol/persistence';
import {
  CLEAR_ALL_FAILURE_MESSAGE,
  CLEAR_ALL_SUCCESS_MESSAGE,
} from '@/lib/clearAll/clearAllMessages';
import { useInertBackground } from '@/lib/useInertBackground';
import { Row, RowDescription, RowInfo, RowLabel, type RowOutcome } from './SettingsCard';

// AR-35: rarely shown, so its chunk is requested only on the first Clear Data click — the
// `<ImportWorkspaceRow>` / `<ImportWarningDialog>` precedent (Task 3.4's other lazy dialog).
const ClearAllDataDialog = dynamic(() => import('./ClearAllDataDialog'), { ssr: false });

export interface ClearAllDataRowProps {
  // `Pick`s, never the aggregate (FD2, the Story 5.2 FD7 house rule). This row calls exactly
  // `clearAll`, `organisms.exists` and `organisms.save` (through `resetWorkspace`) and never
  // receives `settings` — Decision F holds by construction in the UI, not only in persistence.
  workspace: Pick<AppRepositories, 'clearAll'>;
  organisms: Pick<OrganismRepository, 'exists' | 'save'>;
  /** AC5: `<SettingsPage>` wires this to `statsResource.reload()`. Runs after success AND failure
   * (FD3) — a failed reset can still have changed the store, and the counts must show the truth. */
  onCleared(): void;
  /** Review Finding D2 (owner ruling a): reports this row's outcome to `<DataManagement>`'s single
   * shared message slot, rather than rendering a status/alert of its own. Called with `null` at
   * the start of a flow (clearing whatever ANY row last left in the slot) and with the outcome
   * once the reset settles. */
  onMessage(message: RowOutcome | null): void;
}

// Mockup: `.btn` + `.btn-warning` (`settings.html:181-198,212-219`), tokens only (AR-46).
// `--gol-on-danger`, NOT the mockup's white text (`themes.css:59-64` records the AA departure).
// No `transition: all` (the mid-fade axe trap every hover-button component in this codebase
// avoids) and no `disabled` (FD5: this button never self-disables).
const ClearButton = styled('button')({
  background: 'var(--gol-danger)',
  color: 'var(--gol-on-danger)',
  border: 'none',
  padding: '12px 24px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background-color 0.2s',
  '&:hover': {
    background: 'var(--gol-danger-hover)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

/**
 * FD8-style DOM-lookup restore, mirroring `<ImportWorkspaceRow>`'s `focusImportButtonIfLoose` for
 * the identical reason: `disableRestoreFocus` on `<ClearAllDataDialog>` turns off MUI's own
 * restore (WebKit does not focus a `<button>` on click), so this component owns it instead.
 * "Loose" is `null`, `<body>`, or still inside the dialog itself.
 */
function focusClearButtonIfLoose(): void {
  const active = document.activeElement;
  const focusIsLoose =
    active === null ||
    active === document.body ||
    active.closest('[aria-labelledby="clear-all-data-dialog-title"]') !== null;
  if (!focusIsLoose) return;
  document.querySelector<HTMLElement>('[data-clear-all-data]')?.focus();
}

/**
 * The Clear All Data row (Story 5.10, AC1) — `<DataManagement>`'s third row. FD5's act-on-exit
 * shape (the 5.9 template, minus the pick/validate/pristine steps this flow has no equivalent
 * of): click → dialog → record the choice → run the reset, and publish its outcome, only once the
 * dialog's exit transition has fully finished (AC6).
 *
 * Re-entrancy: `pendingRef` spans the WHOLE flow, click through outcome — including the entire
 * time `<ClearAllDataDialog>` is open, since the dialog itself makes the button unreachable
 * (`useInertBackground`) for exactly that window. A `mountedRef`, StrictMode-re-armed, guards
 * every post-await `setState` and the `onCleared()` call — and, per FD3/the Story 5.9 review
 * lesson, gates running the reset at all: if the row unmounted while the dialog was exiting,
 * nobody is left to read its outcome.
 */
export default function ClearAllDataRow({
  workspace,
  organisms,
  onCleared,
  onMessage,
}: ClearAllDataRowProps) {
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Bumped whenever a post-exit focus restore is owed, so the effect below re-fires even though
  // `dialogMounted` itself did not change again (mirrors `<ImportWorkspaceRow>`'s `focusTick`).
  const [focusTick, setFocusTick] = useState(0);

  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const choiceRef = useRef<'clear' | 'cancel' | null>(null);
  const focusOwedRef = useRef(false);

  useEffect(() => {
    // Re-armed on every setup (StrictMode runs setup → cleanup → setup) — the same reset every
    // other row in this file carries, for the same reason.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Marks the background `inert` for exactly as long as the dialog is mounted (open or exiting) —
  // the project-context live-region rule this dialog's own in-content status/alert depends on.
  useInertBackground(dialogMounted);

  // Post-commit focus restore, run for every close path (Cancel/Escape/backdrop, or Clear All
  // Data once its reset has settled). Must run AFTER `useInertBackground`'s cleanup has released
  // `inert` — React runs every cleanup for a commit before any setup, and that hook is declared
  // above this effect. `pendingRef` holds it back on the confirm path: the `dialogMounted=false`
  // commit lands while `runReset` is still awaiting, and AC6 orders the restore AFTER the
  // outcome — the `focusTick` bump once the reset settles re-fires this.
  useEffect(() => {
    if (dialogMounted || pendingRef.current || !focusOwedRef.current) return;
    focusOwedRef.current = false;
    focusClearButtonIfLoose();
  }, [dialogMounted, focusTick]);

  function handleClearButtonClick() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    onMessage(null); // a new attempt clears whatever any row last left in the shared slot (D2)
    choiceRef.current = null;
    focusOwedRef.current = true;
    setDialogMounted(true);
    setDialogOpen(true);
    // `pendingRef` stays true — the flow is still in progress, spanning the whole dialog window.
  }

  function handleDialogCancel() {
    if (choiceRef.current !== null) return; // the first choice wins (mirrors ImportWorkspaceRow)
    choiceRef.current = 'cancel';
    setDialogOpen(false);
  }

  function handleDialogConfirm() {
    if (choiceRef.current !== null) return;
    choiceRef.current = 'clear';
    setDialogOpen(false);
  }

  /**
   * AC6: the ONLY place the reset actually runs, and only once the dialog's exit transition has
   * fully finished — before this fires, the dialog's own subtree is still the one non-inert part
   * of the page, so publishing an outcome earlier would insert a live region into a subtree
   * `useInertBackground` still holds `inert` (project-context's rule).
   */
  async function handleDialogExited() {
    setDialogMounted(false);
    const choice = choiceRef.current;
    choiceRef.current = null;

    if (choice !== 'clear') {
      pendingRef.current = false;
      if (mountedRef.current) setFocusTick((tick) => tick + 1);
      return;
    }

    // The row may have unmounted while the dialog was exiting (the user left `/settings`) —
    // nobody is left to read the outcome, so the reset does not run unseen (Story 5.9 review
    // lesson).
    if (!mountedRef.current) {
      pendingRef.current = false;
      return;
    }

    try {
      await resetWorkspace(workspace, organisms);
      if (mountedRef.current) onMessage({ role: 'status', text: CLEAR_ALL_SUCCESS_MESSAGE });
    } catch {
      if (mountedRef.current) onMessage({ role: 'alert', text: CLEAR_ALL_FAILURE_MESSAGE });
    } finally {
      // FD3: runs after success AND after failure — the store may have changed either way, and
      // the counts must show the truth.
      if (mountedRef.current) onCleared();
      pendingRef.current = false;
      if (mountedRef.current) setFocusTick((tick) => tick + 1);
    }
  }

  return (
    <>
      <Row>
        <RowInfo>
          <RowLabel>Clear All Data</RowLabel>
          <RowDescription>
            Delete all battles, organisms and the workspace description from local storage (cannot
            be undone)
          </RowDescription>
        </RowInfo>
        <ClearButton
          type="button"
          // Review Finding D1 (owner ruling a): the visible "Clear Data" text is the accessible
          // name's PREFIX (WCAG 2.5.3 Label in Name), and the name stays distinct from the
          // dialog's "Clear All Data" confirm button — "Clear all data" alone collided with it
          // case-insensitively whenever both were mounted at once (the exact ambiguity the review
          // flagged).
          aria-label="Clear data (all battles and organisms)"
          onClick={handleClearButtonClick}
          data-clear-all-data=""
        >
          Clear Data
        </ClearButton>
      </Row>
      {dialogMounted && (
        <ClearAllDataDialog
          open={dialogOpen}
          onCancel={handleDialogCancel}
          onConfirm={handleDialogConfirm}
          onExited={() => {
            void handleDialogExited();
          }}
        />
      )}
    </>
  );
}
