'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS } from '@gol/domain';
import {
  recoverWorkspace,
  type AppRepositories,
  type OrganismRepository,
  type SettingsRepository,
} from '@gol/persistence';
import { CLEAR_ALL_FAILURE_MESSAGE } from '@/lib/clearAll/clearAllMessages';
import { classifyStorageFailure, type StorageFailureKind } from '@/lib/storage/storageFailure';
import {
  CORRUPT_SETTINGS_MESSAGE,
  CORRUPT_WORKSPACE_MESSAGE,
  NEWER_VERSION_MESSAGE,
  RESTORE_SETTINGS_FAILURE_MESSAGE,
  STORAGE_FULL_MESSAGE,
  UNAVAILABLE_MESSAGE,
} from '@/lib/storage/storageFailureMessages';
import { useInertBackground } from '@/lib/useInertBackground';

// Story 5.10's dialog, REUSED (FD3) — its FR-8.5 sentence is exactly true of this reset too. Lazy
// (AR-35): the notice itself ships on four routes, the dialog only on a Reset Workspace click.
const ClearAllDataDialog = dynamic(() => import('@/components/settings/ClearAllDataDialog'), {
  ssr: false,
});

export interface StorageFailureNoticeProps {
  kind: StorageFailureKind;
  // `Pick`s, never the aggregate (FD9, the Story 5.2 FD7 house rule).
  /** Needed only to offer Reset Workspace; omit it and the action is not rendered. */
  workspace?: Pick<AppRepositories, 'discardUnreadableStamp' | 'clearAll'>;
  organisms?: Pick<OrganismRepository, 'exists' | 'save'>;
  /** Needed only to offer Restore Default Settings. */
  settings?: Pick<SettingsRepository, 'save'>;
  /** Injected for tests; defaults to `() => window.location.reload()`. */
  reload?: () => void;
}

const MESSAGES: Readonly<Record<StorageFailureKind, string>> = {
  'newer-version': NEWER_VERSION_MESSAGE,
  'corrupt-workspace': CORRUPT_WORKSPACE_MESSAGE,
  'corrupt-settings': CORRUPT_SETTINGS_MESSAGE,
  'storage-full': STORAGE_FULL_MESSAGE,
  unavailable: UNAVAILABLE_MESSAGE,
};

function reloadPage(): void {
  window.location.reload();
}

const Root = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '16px',
  maxWidth: '640px',
});

const Explanation = styled('p')({
  margin: 0,
  fontSize: '14px',
  lineHeight: 1.5,
  color: 'var(--gol-text-secondary)',
});

// `--gol-danger` is a gated text pair on the page backgrounds (themeTokens.test.ts, AR-46) — the
// same one `<DataManagement>`'s shared alert uses.
const FailureText = styled('p')({
  margin: 0,
  fontSize: '14px',
  color: 'var(--gol-danger)',
});

// `<DataManagement>`'s ExportButton idiom, tokens only (AR-46) — text on `--gol-on-accent`, the
// gated pair for accent fills. No `transition: all` (the mid-fade axe trap) and never `disabled`
// (a self-disabling button drops focus to <body>).
const ActionButton = styled('button')({
  background: 'var(--gol-accent)',
  color: 'var(--gol-on-accent)',
  border: 'none',
  padding: '12px 24px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
  '&:hover': {
    background: 'var(--gol-accent-hover)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// `<ClearAllDataRow>`'s ClearButton danger idiom: `--gol-on-danger` on `--gol-danger`, the gated pair.
const DangerButton = styled(ActionButton)({
  background: 'var(--gol-danger)',
  color: 'var(--gol-on-danger)',
  '&:hover': {
    background: 'var(--gol-danger-hover)',
  },
});

/**
 * The load-time storage-failure notice (Story 5.11, NFR-7.3): what happened, in plain language,
 * and the recovery that fits it (FD2). It replaces every route's generic "Something went wrong"
 * line. Rendering it writes NOTHING (M9: no self-heal on a plain load); each recovery runs only on
 * an explicit click.
 *
 *   - `'newer-version'` → Reload, and nothing else, whatever ports it is given (Story 5.7 owner
 *     ruling — the data is a newer build's, intact).
 *   - `'corrupt-workspace'` → Reset Workspace: Story 5.10's confirmation dialog, then
 *     `recoverWorkspace()` (the unusable stamp, then the 5.10 path). Settings are unreachable.
 *   - `'corrupt-settings'` → Restore Default Settings: rewrites `gol:settings` only (FD5).
 *   - `'storage-full'` / `'unavailable'` → Reload: the data may be intact, so no reset.
 *
 * A successful recovery reloads the page (FD7): the seed and every read re-run from scratch, and
 * the healthy page IS the confirmation — so there is no success live region to lose.
 *
 * The reset flow is `<ClearAllDataRow>`'s act-on-exit shape: the choice is recorded, and the reset
 * runs only once the dialog's exit transition has finished — so its failure alert is never inserted
 * into a subtree `useInertBackground` still holds inert (the project-context live-region rule).
 */
export default function StorageFailureNotice({
  kind,
  workspace,
  organisms,
  settings,
  reload = reloadPage,
}: StorageFailureNoticeProps) {
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Bumped when a post-exit focus restore is owed, so the effect below re-fires.
  const [focusTick, setFocusTick] = useState(0);

  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const choiceRef = useRef<'reset' | 'cancel' | null>(null);
  const focusOwedRef = useRef(false);
  const resetButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Re-armed on every setup — StrictMode runs setup → cleanup → setup.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Declared ABOVE the focus-restore effect: React runs every cleanup of a commit before any setup,
  // so `inert` is released before the restore below tries to focus into the page.
  useInertBackground(dialogMounted);

  useEffect(() => {
    if (dialogMounted || pendingRef.current || !focusOwedRef.current) return;
    focusOwedRef.current = false;
    // Only when focus is loose (<body>, nothing, or still inside the gone dialog) — never steal it
    // from wherever the user has since moved it. `disableRestoreFocus` on the dialog makes this
    // component the one owner of the restore.
    const active = document.activeElement;
    const loose =
      active === null ||
      active === document.body ||
      active.closest('[aria-labelledby="clear-all-data-dialog-title"]') !== null;
    if (loose) resetButtonRef.current?.focus();
  }, [dialogMounted, focusTick]);

  // A kind whose recovery needs a port the caller did not give falls back to Reload, so the notice
  // always offers a way out. `'newer-version'` can never reach either branch.
  const canReset =
    kind === 'corrupt-workspace' && workspace !== undefined && organisms !== undefined;
  const canRestore = kind === 'corrupt-settings' && settings !== undefined;

  function handleResetClick() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setFailure(null);
    choiceRef.current = null;
    focusOwedRef.current = true;
    setDialogMounted(true);
    setDialogOpen(true);
  }

  function handleDialogCancel() {
    if (choiceRef.current !== null) return; // the first choice wins
    choiceRef.current = 'cancel';
    setDialogOpen(false);
  }

  function handleDialogConfirm() {
    if (choiceRef.current !== null) return;
    choiceRef.current = 'reset';
    setDialogOpen(false);
  }

  /** The ONLY place the reset runs — once the dialog's exit transition has fully finished. */
  async function handleDialogExited() {
    setDialogMounted(false);
    const choice = choiceRef.current;
    choiceRef.current = null;

    if (choice !== 'reset' || !workspace || !organisms) {
      pendingRef.current = false;
      if (mountedRef.current) setFocusTick((tick) => tick + 1);
      return;
    }
    // The notice may have unmounted while the dialog was exiting — nobody is left to see the
    // outcome, so the reset does not run unseen (Story 5.9 review lesson).
    if (!mountedRef.current) {
      pendingRef.current = false;
      return;
    }

    try {
      await recoverWorkspace(workspace, organisms);
    } catch (error) {
      // Never "unchanged": a failure can land mid-reset, after the clear (Story 5.10 FD3). The one
      // exception is a stamp that turned NEWER since the notice classified it (another tab, a
      // newer build): `recoverWorkspace` refuses it before any write, and no retry in this build
      // can succeed, so "try again" would be the wrong instruction — it gets the newer copy.
      pendingRef.current = false;
      if (mountedRef.current) {
        setFailure(
          classifyStorageFailure(error) === 'newer-version'
            ? NEWER_VERSION_MESSAGE
            : CLEAR_ALL_FAILURE_MESSAGE,
        );
        setFocusTick((tick) => tick + 1);
      }
      return;
    }
    // Outside the try: the store IS recovered by now, so a reload that throws must not report the
    // recovery as failed. `pendingRef` stays set — the page is reloading, and a second reset must
    // not start. Gated on mount like every other post-await effect here: the user may have
    // navigated away while the recovery ran, and the route they are on now is not ours to reload.
    if (mountedRef.current) reload();
  }

  // No dialog: this overwrites only a record that already cannot be read, and touches no battle or
  // organism (FD5). Still an explicit click — never an implicit write of defaults on load.
  async function handleRestoreClick() {
    if (pendingRef.current || !settings) return;
    pendingRef.current = true;
    setFailure(null);
    try {
      await settings.save(DEFAULT_SETTINGS);
    } catch {
      pendingRef.current = false;
      if (mountedRef.current) setFailure(RESTORE_SETTINGS_FAILURE_MESSAGE);
      return;
    }
    // Same shape as the reset above: the record is restored by now, so the reload sits outside the
    // try and runs only while this notice is still the page the user is on.
    if (mountedRef.current) reload();
  }

  return (
    <Root>
      <Explanation role="alert">{MESSAGES[kind]}</Explanation>
      {canReset ? (
        <DangerButton type="button" ref={resetButtonRef} onClick={handleResetClick}>
          Reset Workspace
        </DangerButton>
      ) : canRestore ? (
        <ActionButton type="button" onClick={() => void handleRestoreClick()}>
          Restore Default Settings
        </ActionButton>
      ) : (
        <ActionButton type="button" onClick={() => reload()}>
          Reload
        </ActionButton>
      )}
      {failure !== null && <FailureText role="alert">{failure}</FailureText>}
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
    </Root>
  );
}
