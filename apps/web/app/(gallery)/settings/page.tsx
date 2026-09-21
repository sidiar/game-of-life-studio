'use client';

import { useMemo } from 'react';
import SettingsPage from '@/components/settings/SettingsPage';
import { createRepositories } from '@/lib/repositoryFactory';
import { useWorkspaceSeed } from '@/lib/gallery/useWorkspaceSeed';

// The page boundary for the third static route (Decision K.5 — a static path, no dynamic
// segment, nothing to enumerate at build time). Mirrors app/(gallery)/organisms/page.tsx line for
// line in shape: createRepositories() runs ONCE here (useMemo, AR-27), and the result is passed
// DOWN as props typed to the interface (AR-2), never imported by the child.
//
// FD1 (Story 5.1): this file lives under `(gallery)` — the branch that wears AppShell — rather than at
// `app/settings/page.tsx` as RFC-005:197 sketches. A page outside the group renders with no nav,
// no wordmark and no <main> (app/not-found.tsx's header documents that exact regression), and
// App Router file-based routing is canonical over an illustrative RFC sketch.
//
// FD2 (Story 5.1): the workspace seed runs at THIS boundary too, not only at `/` and `/organisms`. A bookmark
// to `/settings` in a fresh browser is a legitimate first visit; without the seed the Organisms
// tile would read 0, contradicting M9 on the very page whose job is to report the workspace
// truthfully. The hook is idempotent and Decision K unmounts routes hard, so at most one boundary
// is mounted at a time.
export default function SettingsRoute() {
  const repositories = useMemo(() => createRepositories(), []);
  const { status } = useWorkspaceSeed(repositories);

  // No <main> here — AppShell owns the single <main> landmark for the (gallery) branch. No
  // useDocumentTitle either (FD5, Story 5.1): Battles and Organisms claim no document.title, and Settings
  // follows them.
  return (
    <SettingsPage
      settings={repositories.settings}
      battles={repositories.battles}
      organisms={repositories.organisms}
      seedStatus={status}
    />
  );
}
