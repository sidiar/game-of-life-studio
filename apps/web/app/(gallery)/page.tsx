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

  // Story 7.6 (FR-9.4, FD1): `/?preset=<id>` addresses a preset. `null` means no link.
  const presetId = useSearchParams().get(PRESET_LINK_PARAM);
  const { status, error, firstVisitPresetDeferred } = useWorkspaceSeed(repositories, {
    deferFirstVisitPreset: presetId !== null,
  });
  const [arrivalBusy, setArrivalBusy] = useState(presetId !== null);
  const [notice, setNotice] = useState<RowOutcome | null>(null);

  // The arrival holds the gallery (FD2): `BattleGallery` reads nothing until 'ready', and its load
  // effect re-runs on the 'seeding' -> 'ready' edge while keeping the previous summaries on screen
  // (its `loadReducer` 'start' case). That edge is exactly the post-import refresh — no remount, no
  // new prop, and the focused <h1> survives.
  const galleryStatus = status === 'ready' && arrivalBusy ? 'seeding' : status;

  const handleSettled = useCallback((result: { notice: RowOutcome | null; keepLink: boolean }) => {
    setNotice(result.notice);
    setArrivalBusy(false);
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
          presetId={presetId}
          seedStatus={status}
          firstVisit={firstVisitPresetDeferred}
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
