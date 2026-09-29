'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BattleGallery from '@/components/gallery/BattleGallery';
import PresetLinkArrival from '@/components/gallery/PresetLinkArrival';
import PresetLinkNotice from '@/components/gallery/PresetLinkNotice';
import type { RowOutcome } from '@/components/settings/SettingsCard';
import { createRepositories } from '@/lib/repositoryFactory';
import { useWorkspaceSeed } from '@/lib/gallery/useWorkspaceSeed';
import { PRESET_LINK_PARAM, stripPresetLinkParam } from '@/lib/workspaces/presetLink';

// The page boundary (RFC-005 conflict 3): app/page.tsx IS the Gallery page under the App
// Router, so a second `<BattleGalleryPage>` wrapper would add a layer with no state of its own.
// It owns repository construction and the seed lifecycle, and passes repositories DOWN as props
// typed to the interfaces (AR-2/27) — never AppRepositories, never createRepositories() inside a
// child, never a concrete LocalStorage* import.
function GalleryRoute() {
  // createRepositories() runs ONCE per component instance (AR-27) — never at module scope, never
  // inside a child. useMemo with an empty dep array is what makes this "once", not "every render":
  // constructing repositories touches no storage, only the repository METHODS do, so calling it
  // here is safe for a statically exported route.
  const repositories = useMemo(() => createRepositories(), []);

  // Story 7.6 (FR-9.4, FD1): `/?preset=<id>` addresses a preset. `null` means no link — and so does
  // an empty `?preset=` (Review 2026-09-29): it names nothing, so it must not defer the seed, hold
  // the gallery, or quote “” back in an alert.
  const presetId = useSearchParams().get(PRESET_LINK_PARAM) || null;
  const { status, error, firstVisitPresetDeferred } = useWorkspaceSeed(repositories, {
    deferFirstVisitPreset: presetId !== null,
  });
  const [arrivalBusy, setArrivalBusy] = useState(presetId !== null);
  const [notice, setNotice] = useState<RowOutcome | null>(null);
  // The seed defers ONCE, for the link the page mounted with (FD5), and its flag never resets. So
  // the first settle consumes it: a later arrival on this same mounted page (a client-side
  // navigation to another `?preset=`) is never a first visit, and must never load the default preset
  // over what the user has built since (Review 2026-09-29).
  const [deferralConsumed, setDeferralConsumed] = useState(false);
  // A link that appears (or changes) on the mounted page re-arms the hold, which `useState`'s
  // initialiser only sets at mount. Adjusting state during render, React's documented pattern for
  // "reset state when a prop changes"; the arrival itself is keyed on the id below.
  const [heldForPresetId, setHeldForPresetId] = useState(presetId);
  if (presetId !== heldForPresetId) {
    setHeldForPresetId(presetId);
    if (presetId !== null) setArrivalBusy(true);
  }

  // The arrival holds the gallery (FD2): `BattleGallery` reads nothing until 'ready', and its load
  // effect re-runs on the 'seeding' -> 'ready' edge while keeping the previous summaries on screen
  // (its `loadReducer` 'start' case). That edge is exactly the post-import refresh — no remount, no
  // new prop, and the focused <h1> survives.
  const galleryStatus = status === 'ready' && arrivalBusy ? 'seeding' : status;

  const handleSettled = useCallback((result: { notice: RowOutcome | null; keepLink: boolean }) => {
    setNotice(result.notice);
    setArrivalBusy(false);
    setDeferralConsumed(true);
    // Stripping unmounts <PresetLinkArrival> (no more param), which is why the notice lives here.
    if (!result.keepLink) stripPresetLinkParam();
  }, []);

  // No <main> here — AppShell (Story 1.9) owns the single <main> landmark; this page renders only
  // its own content into it. BattleGallery owns the document's only <h1> ("Battle Gallery").
  return (
    <>
      {notice !== null && <PresetLinkNotice notice={notice} onDismiss={() => setNotice(null)} />}
      <BattleGallery
        battles={repositories.battles}
        organisms={repositories.organisms}
        settings={repositories.settings}
        seedStatus={galleryStatus}
        seedError={error}
        workspace={repositories}
        workspaceMeta={repositories.workspaceMeta}
      />
      {presetId !== null && (
        <PresetLinkArrival
          key={presetId}
          presetId={presetId}
          seedStatus={status}
          firstVisit={firstVisitPresetDeferred && !deferralConsumed}
          repos={repositories}
          onBusyChange={setArrivalBusy}
          onSettled={handleSettled}
        />
      )}
    </>
  );
}

export default function HomePage() {
  // ⚠️ useSearchParams() must sit under a <Suspense> boundary or the export build fails with
  // `missing-suspense-with-csr-bailout` — a failure `next dev` never shows (see the battle route).
  // The fallback is null: the whole page is client-seeded (its prerender was only ever the seeding
  // state), and AppShell's wordmark and nav stay prerendered by the layout.
  return (
    <Suspense fallback={null}>
      <GalleryRoute />
    </Suspense>
  );
}
