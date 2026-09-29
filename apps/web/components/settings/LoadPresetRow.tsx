'use client';

import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { styled } from '@mui/material/styles';
import { isPristineWorkspace } from '@gol/domain';
import {
  validateImportFile,
  type BattleRepository,
  type ImportSummary,
  type OrganismRepository,
  type WorkspaceMetaRepository,
  type WorkspaceSerializer,
} from '@gol/persistence';
import { importFailureMessage } from '@/lib/import/importFailureMessage';
import { exportWorkspaceToFile } from '@/lib/export/exportWorkspaceToFile';
import { useInertBackground } from '@/lib/useInertBackground';
import { useAsyncResource } from '@/lib/useAsyncResource';
import {
  fetchPresetManifest,
  fetchPresetText,
  withPresetTimeout,
} from '@/lib/workspaces/presetFetch';
import type { PresetWorkspaceEntry } from '@/lib/workspaces/presetManifest';
import {
  PRESET_CONFIRM_LABEL,
  PRESET_EXPORT_FAILED_TEXT,
  PRESET_FETCH_FAILURE_MESSAGE,
  PRESET_LIST_FAILURE_MESSAGE,
  PRESET_WARNING_BODY,
  presetLoadSuccessMessage,
  presetWarningTitle,
} from '@/lib/workspaces/presetMessages';
import {
  Row,
  RowDescription,
  RowInfo,
  RowLabel,
  SecondaryButton,
  type RowOutcome,
} from './SettingsCard';

// AR-35: the same `next/dynamic` call as `<ImportWorkspaceRow>` — the dialog chunk is requested on
// the first non-pristine load only.
const ImportWarningDialog = dynamic(() => import('./ImportWarningDialog'), { ssr: false });

/**
 * A module-level, stable-identity `fetch` (Story 7.5 FD5): `useAsyncResource` needs stable deps,
 * and `vi.stubGlobal('fetch', …)` still reaches this because `globalThis.fetch` is read per call.
 */
const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export interface LoadPresetRowProps {
  // Same ports as `<ImportWorkspaceRow>` (AR-2/27); no `fetch` prop (FD5).
  serializer: Pick<WorkspaceSerializer, 'exportWorkspace' | 'importWorkspace'>;
  battles: Pick<BattleRepository, 'list'>;
  organisms: Pick<OrganismRepository, 'list'>;
  workspaceMeta: Pick<WorkspaceMetaRepository, 'load'>;
  /** Called on success only, so `<DataManagement>` can re-read the description and the page stats. */
  onImported(): void;
  /** The shared outcome slot (5.10 D2): `null` at a flow's start, the outcome once it settles. */
  onMessage(message: RowOutcome | null): void;
}

// Mockup: `.preset-select` beside `.btn-secondary`. Copies `OrganismRoster.tsx`'s `AddSelect`
// shape (never imports it: that file belongs to another area): a native `<select>` (AR-35),
// `--gol-border-control` for the SC 1.4.11 boundary, the UA arrow, no `transition: all`.
const PresetSelect = styled('select')({
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 12px',
  fontSize: '13px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  minWidth: 0,
  maxWidth: '220px',
  transition: 'border-color 0.2s',
  '&:hover': {
    borderColor: 'var(--gol-text-secondary)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

const Controls = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexShrink: 0,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
});

// Mockup: `.preset-row-description`. `--gol-text-tertiary` passes the gated 4.5:1 pair on
// `--gol-bg-secondary` (`themeTokens.test.ts`), so the mockup's tertiary is kept. Plain text, not a
// live region.
const PresetEcho = styled('p')({
  fontSize: '12px',
  color: 'var(--gol-text-tertiary)',
  margin: '8px 0 0',
  lineHeight: 1.5,
  maxWidth: '520px',
});

/**
 * Focus restore for every close path, mirroring `<ImportWorkspaceRow>`'s `focusImportButtonIfLoose`
 * (`disableRestoreFocus` turns MUI's own off — WebKit does not focus a `<button>` on click).
 * "Loose" is `null`, `<body>`, or still inside the warning dialog.
 */
function focusLoadButtonIfLoose(): void {
  const active = document.activeElement;
  const focusIsLoose =
    active === null ||
    active === document.body ||
    active.closest('[aria-labelledby="import-warning-dialog-title"]') !== null;
  if (!focusIsLoose) return;
  document.querySelector<HTMLElement>('[data-load-preset]')?.focus();
}

/** Default first (suffixed in the option text), then manifest order. */
function orderEntries(
  entries: readonly PresetWorkspaceEntry[],
  defaultId: string,
): PresetWorkspaceEntry[] {
  const def = entries.filter((e) => e.id === defaultId);
  return [...def, ...entries.filter((e) => e.id !== defaultId)];
}

/**
 * The Load Preset row (Story 7.5, FR-9.3) — `<DataManagement>`'s fifth row. A whole-workspace
 * replace through the FR-8.4 pipeline (`serializer.importWorkspace`, M8): fetch → validate →
 * pristine check → warn (unless pristine) → import once the dialog has fully exited (FD4),
 * mirroring `<ImportWorkspaceRow>` step for step. The concurrent-action guard is `pendingRef`, per
 * row, spanning the whole flow including the dialog window (FD7); the button never self-disables.
 */
export default function LoadPresetRow({
  serializer,
  battles,
  organisms,
  workspaceMeta,
  onImported,
  onMessage,
}: LoadPresetRowProps) {
  const manifest = useAsyncResource(
    () => withPresetTimeout((signal) => fetchPresetManifest(browserFetch, signal)),
    [],
  );

  const labelId = useId();
  const echoId = useId();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogName, setDialogName] = useState('');
  const [exportState, setExportState] = useState<'idle' | 'exported' | 'failed'>('idle');
  const [focusTick, setFocusTick] = useState(0);

  const pendingRef = useRef(false);
  const exportInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const choiceRef = useRef<'load' | 'cancel' | null>(null);
  const pendingTextRef = useRef('');
  const pendingNameRef = useRef('');
  const focusOwedRef = useRef(false);

  useEffect(() => {
    // Re-armed on every setup (StrictMode: setup → cleanup → setup).
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useInertBackground(dialogMounted);

  // Same ordering contract as Import's: runs after `useInertBackground`'s cleanup, and is held back
  // by `pendingRef` on the confirm path until the outcome is published (the `focusTick` bump).
  useEffect(() => {
    if (dialogMounted || pendingRef.current || !focusOwedRef.current) return;
    focusOwedRef.current = false;
    focusLoadButtonIfLoose();
  }, [dialogMounted, focusTick]);

  const entries =
    manifest.status === 'ready' && manifest.data !== undefined
      ? orderEntries(manifest.data.workspaces, manifest.data.defaultPresetId)
      : [];
  const defaultId = manifest.data?.defaultPresetId;
  const selected = entries.find((e) => e.id === selectedId) ?? entries[0];

  async function runLoad(text: string, name: string): Promise<void> {
    try {
      const summary: ImportSummary = await serializer.importWorkspace(text);
      if (mountedRef.current) {
        onMessage({ role: 'status', text: presetLoadSuccessMessage(name, summary) });
        onImported();
      }
    } catch (error) {
      if (mountedRef.current) {
        onMessage({ role: 'alert', text: importFailureMessage(error) });
      }
    }
  }

  // Known limitation (Story 7.5 review, owner ruling D1 (a)): `pendingRef` guards this row only.
  // The up-to-5 s fetch below is unguarded against Import and Clear All, so a sibling flow started
  // in that window can overlap or be overwritten. See deferred-work.md (story 7.5 entries).
  async function handleLoadClick() {
    if (pendingRef.current || selected === undefined) return;
    const entry = selected;
    pendingRef.current = true;
    onMessage(null); // a new flow clears whatever any row last left in the shared slot (D2)

    let text: string;
    try {
      text = await withPresetTimeout((signal) => fetchPresetText(browserFetch, entry, signal));
    } catch {
      pendingRef.current = false;
      if (mountedRef.current) onMessage({ role: 'alert', text: PRESET_FETCH_FAILURE_MESSAGE });
      return;
    }

    try {
      validateImportFile(text);
    } catch (error) {
      // Reachable only through deploy skew (e.g. `newer-version`): the lockstep gate validates
      // every shipped preset.
      pendingRef.current = false;
      if (mountedRef.current) onMessage({ role: 'alert', text: importFailureMessage(error) });
      return;
    }

    let pristine: boolean;
    try {
      const [battleSummaries, organismList, meta] = await Promise.all([
        battles.list(),
        organisms.list(),
        workspaceMeta.load(),
      ]);
      pristine = isPristineWorkspace(battleSummaries.length, organismList, meta.description);
    } catch {
      // A rejected read counts as NOT pristine: an extra warning, never a skipped one.
      pristine = false;
    }

    // If the row unmounted meanwhile, the load must not run unseen.
    if (!mountedRef.current) {
      pendingRef.current = false;
      return;
    }

    if (pristine) {
      await runLoad(text, entry.name);
      pendingRef.current = false;
      return;
    }

    pendingTextRef.current = text;
    pendingNameRef.current = entry.name;
    choiceRef.current = null;
    setDialogName(entry.name);
    setExportState('idle');
    focusOwedRef.current = true;
    setDialogMounted(true);
    setDialogOpen(true);
    // `pendingRef` stays true across the whole dialog window.
  }

  function handleDialogCancel() {
    if (choiceRef.current !== null) return; // the first choice wins
    choiceRef.current = 'cancel';
    setDialogOpen(false);
  }

  function handleConfirm() {
    if (choiceRef.current !== null) return;
    // A no-op while Export First is in flight (5.9 Review Decision 1) — never `disabled`.
    if (exportInFlightRef.current) return;
    choiceRef.current = 'load';
    setDialogOpen(false);
  }

  async function handleExportFirst() {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExportState('idle'); // re-insert the live region so a repeat outcome is announced again
    try {
      await exportWorkspaceToFile(serializer);
      if (mountedRef.current) setExportState('exported');
    } catch {
      if (mountedRef.current) setExportState('failed');
    } finally {
      exportInFlightRef.current = false;
    }
  }

  /** The ONLY place the non-pristine load runs: after the exit transition (project-context's
   * live-region rule — no outcome may be published into a still-inert page). */
  async function handleDialogExited() {
    setDialogMounted(false);
    const choice = choiceRef.current;
    choiceRef.current = null;

    if (choice !== 'load') {
      pendingRef.current = false;
      if (mountedRef.current) setFocusTick((tick) => tick + 1);
      return;
    }

    const text = pendingTextRef.current;
    const name = pendingNameRef.current;
    pendingTextRef.current = '';
    pendingNameRef.current = '';
    await runLoad(text, name);
    pendingRef.current = false;
    if (mountedRef.current) setFocusTick((tick) => tick + 1);
  }

  return (
    <>
      <Row>
        <RowInfo>
          <RowLabel id={labelId}>Load Preset Workspace</RowLabel>
          <RowDescription>
            Start over from a curated, ready-to-run workspace bundled with the app. Replaces your
            entire workspace — you are warned first whenever your current workspace holds data, and
            offered to export it.
          </RowDescription>
          {manifest.status === 'ready' && selected !== undefined && (
            <PresetEcho id={echoId}>{selected.description}</PresetEcho>
          )}
          {manifest.status === 'loading' && (
            <RowDescription sx={{ marginTop: '8px' }}>Loading presets…</RowDescription>
          )}
          {manifest.status === 'error' && (
            <RowDescription sx={{ marginTop: '8px' }}>{PRESET_LIST_FAILURE_MESSAGE}</RowDescription>
          )}
        </RowInfo>
        {manifest.status === 'ready' && selected !== undefined && (
          <Controls>
            <PresetSelect
              aria-labelledby={labelId}
              aria-describedby={echoId}
              value={selected.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id === defaultId ? `${entry.name} (default)` : entry.name}
                </option>
              ))}
            </PresetSelect>
            <SecondaryButton
              type="button"
              aria-label="Load preset workspace"
              onClick={() => {
                void handleLoadClick();
              }}
              data-load-preset=""
            >
              Load
            </SecondaryButton>
          </Controls>
        )}
      </Row>
      {dialogMounted && (
        <ImportWarningDialog
          open={dialogOpen}
          title={presetWarningTitle(dialogName)}
          body={PRESET_WARNING_BODY}
          confirmLabel={PRESET_CONFIRM_LABEL}
          exportFailedText={PRESET_EXPORT_FAILED_TEXT}
          exportState={exportState}
          onCancel={handleDialogCancel}
          onExportFirst={() => {
            void handleExportFirst();
          }}
          onImportAnyway={handleConfirm}
          onExited={() => {
            void handleDialogExited();
          }}
        />
      )}
    </>
  );
}
