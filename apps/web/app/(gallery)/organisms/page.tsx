'use client';

import { useMemo } from 'react';
import OrganismLibrary from '@/components/organisms/OrganismLibrary';
import { createRepositories } from '@/lib/repositoryFactory';
import { useWorkspaceSeed } from '@/lib/gallery/useWorkspaceSeed';

// The page boundary for the second static route (Decision K.5 — a static path, no dynamic
// segment, nothing to enumerate at build time). Mirrors app/(gallery)/page.tsx line for line in
// shape: createRepositories() runs ONCE here (useMemo, AR-27), and the result is passed DOWN as
// props typed to the interface (AR-2), never imported by the child.
//
// FD2 (Story 4.1): the workspace seed runs at THIS boundary too, not only at `/`. M9 says the
// Library is never empty, and a bookmark to `/organisms` in a fresh browser is a legitimate first
// visit — without the seed that visit would show zero organisms, a spec violation `/`'s own tests
// cannot see. The hook is idempotent (seedDefaultWorkspace gates on isFreshWorkspace()) and
// Decision K unmounts routes hard, so at most one boundary is mounted at a time.
export default function OrganismsPage() {
  const repositories = useMemo(() => createRepositories(), []);
  const { status } = useWorkspaceSeed(repositories);

  // No <main> here — AppShell owns the single <main> landmark for the (gallery) branch; this page
  // renders only its own content into it. No useDocumentTitle either (FD4): the Library claims no
  // document.title, same convention as HomePage.
  return <OrganismLibrary organisms={repositories.organisms} seedStatus={status} />;
}
