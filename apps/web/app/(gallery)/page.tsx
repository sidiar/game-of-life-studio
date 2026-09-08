'use client';

import { useMemo } from 'react';
import BattleGallery from '@/components/gallery/BattleGallery';
import { createRepositories } from '@/lib/repositoryFactory';
import { useWorkspaceSeed } from '@/lib/gallery/useWorkspaceSeed';

// The page boundary (RFC-005 conflict 3): app/page.tsx IS the Gallery page under the App
// Router, so a second `<BattleGalleryPage>` wrapper would add a layer with no state of its own.
// It owns repository construction and the seed lifecycle, and passes repositories DOWN as props
// typed to the interfaces (AR-2/27) — never AppRepositories, never createRepositories() inside a
// child, never a concrete LocalStorage* import.
export default function HomePage() {
  // createRepositories() runs ONCE per component instance (AR-27) — never at module scope, never
  // inside a child. useMemo with an empty dep array is what makes this "once", not "every render":
  // constructing repositories touches no storage, only the repository METHODS do, so calling it
  // here is safe for a statically exported route.
  const repositories = useMemo(() => createRepositories(), []);
  const { status } = useWorkspaceSeed(repositories);

  // No <main> here — AppShell (Story 1.9) owns the single <main> landmark; this page renders only
  // its own content into it. BattleGallery owns the document's only <h1> ("Battle Gallery").
  return (
    <BattleGallery
      battles={repositories.battles}
      organisms={repositories.organisms}
      settings={repositories.settings}
      seedStatus={status}
    />
  );
}
