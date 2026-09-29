'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AppRepositories } from '@gol/persistence';
import type { RowOutcome } from '@/components/settings/SettingsCard';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';
import { useInertBackground } from '@/lib/useInertBackground';
import type { PresetLinkPlan } from '@/lib/workspaces/presetLinkFlow';
import {
  PRESET_CONFIRM_LABEL,
  PRESET_EXPORT_FAILED_TEXT,
  PRESET_LINK_FETCH_FAILURE_MESSAGE,
  PRESET_LINK_WARNING_BODY,
  presetLinkUnknownMessage,
  presetLoadSuccessMessage,
  presetWarningTitle,
} from '@/lib/workspaces/presetMessages';

// AR-35: the same `next/dynamic` call as `<LoadPresetRow>` — the dialog chunk is requested on the
// first non-pristine arrival only.
const ImportWarningDialog = dynamic(() => import('@/components/settings/ImportWarningDialog'), {
  ssr: false,
});

/**
 * A module-level, stable-identity `fetch` (copied from `<LoadPresetRow>`, Story 7.5 FD5):
 * `vi.stubGlobal('fetch', …)` still reaches this because `globalThis.fetch` is read per call.
 */
const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export interface PresetLinkArrivalProps {
  presetId: string;
  seedStatus: WorkspaceSeedStatus;
  /** The seed deferred the first-visit preset for this link (FD5). */
  firstVisit: boolean;
  /** The page boundary's repositories (AR-2/27); the lazy flow builds the serializer (FD3). */
  repos: AppRepositories;
  /** true while the gallery must not read the store (fetch, pristine import, post-confirm import). */
  onBusyChange(busy: boolean): void;
  /** Exactly once. `keepLink` is true only for download-failed (FD6). */
  onSettled(result: { notice: RowOutcome | null; keepLink: boolean }): void;
}

/**
 * Focus restore for every close path (`disableRestoreFocus` turns MUI's own off). There is no
 * trigger button to return to, so focus goes to the gallery heading, only when it is "loose": `null`,
 * `<body>`, or still inside the warning dialog.
 */
function focusGalleryHeadingIfLoose(): void {
  const active = document.activeElement;
  const focusIsLoose =
    active === null ||
    active === document.body ||
    active.closest('[aria-labelledby="import-warning-dialog-title"]') !== null;
  if (!focusIsLoose) return;
  document.getElementById('battle-gallery-heading')?.focus();
}

type ReadyPlan = Extract<PresetLinkPlan, { kind: 'ready' }>;

/**
 * The preset link's arrival flow (Story 7.6, FR-9.4): `/?preset=<id>` fetches the preset and loads
 * it through the FR-8.4 pipeline (M8), behind the destructive warning unless the workspace is
 * pristine. Renders only the warning dialog; the outcome notice is the PAGE's (FD6), because this
 * component unmounts when the page strips `?preset=` from the URL.
 *
 * The decision logic lives in `presetLinkFlow.ts`, reached by dynamic `import()` only (FD3) — it
 * drags the serializer and the manifest schema, and only a link visit needs them (AR-3). This file
 * imports type-only from it. The dialog half copies `<LoadPresetRow>` on purpose (third copy of the
 * flow; a shared hook was weighed and rejected — no trigger button, no row slot, a page-level hold).
 */
export default function PresetLinkArrival({
  presetId,
  seedStatus,
  firstVisit,
  repos,
  onBusyChange,
  onSettled,
}: PresetLinkArrivalProps) {
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogName, setDialogName] = useState('');
  const [exportState, setExportState] = useState<'idle' | 'exported' | 'failed'>('idle');
  const [focusTick, setFocusTick] = useState(0);

  // Survives StrictMode's setup -> cleanup -> setup, so the flow starts once.
  const startedRef = useRef(false);
  const exportInFlightRef = useRef(false);
  // Re-armed on every setup (StrictMode), like `useWorkspaceSeed` and `<LoadPresetRow>`.
  const mountedRef = useRef(true);
  const choiceRef = useRef<'load' | 'cancel' | null>(null);
  const planRef = useRef<ReadyPlan | null>(null);
  const focusOwedRef = useRef(false);
  // Settling strips the URL and unmounts this component, so focus must move BEFORE it (5.6): a
  // settle that follows a dialog is parked here until the focus effect below has run.
  const pendingSettleRef = useRef<{ notice: RowOutcome | null; keepLink: boolean } | null>(null);
  // Latest callbacks, so the once-started async flow never calls a stale closure.
  const onBusyChangeRef = useRef(onBusyChange);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
    onSettledRef.current = onSettled;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useInertBackground(dialogMounted);

  // Runs after `useInertBackground`'s cleanup, so focus lands on a page that is already live.
  useEffect(() => {
    if (dialogMounted || !focusOwedRef.current) return;
    focusOwedRef.current = false;
    focusGalleryHeadingIfLoose();
    const settle = pendingSettleRef.current;
    pendingSettleRef.current = null;
    if (settle !== null) onSettledRef.current(settle);
  }, [dialogMounted, focusTick]);

  function settleAfterDialog(result: { notice: RowOutcome | null; keepLink: boolean }): void {
    if (!mountedRef.current) return;
    pendingSettleRef.current = result;
    focusOwedRef.current = true;
    setFocusTick((tick) => tick + 1);
  }

  function settle(result: { notice: RowOutcome | null; keepLink: boolean }): void {
    if (!mountedRef.current) return;
    onSettledRef.current(result);
  }

  useEffect(() => {
    if (seedStatus !== 'ready' || startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      let plan: PresetLinkPlan;
      try {
        const { preparePresetLink } = await import('@/lib/workspaces/presetLinkFlow');
        plan = await preparePresetLink({ presetId, fetch: browserFetch, repos, firstVisit });
      } catch {
        // A chunk-load failure is a download failure: the gallery hold must never be left on.
        plan = { kind: 'download-failed' };
      }
      // Unmounted meanwhile: the load must not run unseen, and nothing settles.
      if (!mountedRef.current) return;

      switch (plan.kind) {
        case 'unknown':
          settle({
            notice: {
              role: 'alert',
              text: presetLinkUnknownMessage(presetId, !plan.defaultLoaded),
            },
            keepLink: false,
          });
          return;
        case 'download-failed':
          settle({
            notice: { role: 'alert', text: PRESET_LINK_FETCH_FAILURE_MESSAGE },
            keepLink: true,
          });
          return;
        case 'invalid-file':
          settle({ notice: { role: 'alert', text: plan.message }, keepLink: false });
          return;
        case 'ready': {
          if (plan.pristine) {
            const result = await plan.load();
            settle({
              notice: result.ok ? null : { role: 'alert', text: result.message },
              keepLink: false,
            });
            return;
          }
          planRef.current = plan;
          choiceRef.current = null;
          setDialogName(plan.entry.name);
          setExportState('idle');
          // Release the hold so the gallery renders the user's own workspace behind the dialog.
          onBusyChangeRef.current(false);
          setDialogMounted(true);
          setDialogOpen(true);
        }
      }
    })();
    // Started once by design (`startedRef`); the inputs are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedStatus]);

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
    const plan = planRef.current;
    if (plan === null || exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExportState('idle'); // re-insert the live region so a repeat outcome is announced again
    try {
      await plan.exportCurrent();
      if (mountedRef.current) setExportState('exported');
    } catch {
      if (mountedRef.current) setExportState('failed');
    } finally {
      exportInFlightRef.current = false;
    }
  }

  /** The ONLY place the confirmed load runs: after the exit transition (project-context's
   * live-region rule — no outcome may be published into a still-inert page). */
  async function handleDialogExited() {
    setDialogMounted(false);
    const choice = choiceRef.current;
    choiceRef.current = null;
    const plan = planRef.current;
    planRef.current = null;

    if (choice !== 'load' || plan === null) {
      settleAfterDialog({ notice: null, keepLink: false });
      return;
    }

    onBusyChangeRef.current(true);
    const result = await plan.load();
    settleAfterDialog({
      notice: result.ok
        ? { role: 'status', text: presetLoadSuccessMessage(plan.entry.name, result.summary) }
        : { role: 'alert', text: result.message },
      keepLink: false,
    });
  }

  if (!dialogMounted) return null;
  return (
    <ImportWarningDialog
      open={dialogOpen}
      title={presetWarningTitle(dialogName)}
      body={PRESET_LINK_WARNING_BODY}
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
  );
}
