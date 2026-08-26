'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import BattlePage, { BattleLoading } from '@/components/battle/BattlePage';
import { createRepositories } from '@/lib/repositoryFactory';

// Architecture Decision K: the battle route is a STATIC `/battle` page that reads the id from
// `?id=<uuid>`. `app/battle/[id]/page.tsx` cannot be built at all under `output: 'export'` —
// Next throws for a dynamic segment with no generateStaticParams(), and battle ids are uuids
// minted in the user's browser, so there is nothing to enumerate at build time in this or any
// future story. Decision K.5 makes that a standing rule: every route must be statically
// prerenderable, and entity ids ride as query parameters, never as dynamic segments.
//
// ⚠️ useSearchParams() must sit under a <Suspense> boundary or the export build fails with
// `missing-suspense-with-csr-bailout` — a failure `next dev` never shows. The reader is therefore
// a child component, not this one. Reaching for window.location.search in an effect would dodge
// the boundary and hand the router's own state to a manual parse; don't.
function BattleQueryRoute() {
  // createRepositories() runs ONCE per component instance, at the page boundary (AR-2/AR-27) —
  // never at module scope, never inside <BattlePage>, never through a Context. Constructing
  // repositories touches no storage, so this is safe on a statically exported route.
  const repositories = useMemo(() => createRepositories(), []);
  // A missing or empty ?id= yields '' — <BattlePage> renders that as not-found, not as a crash.
  const battleId = useSearchParams().get('id') ?? '';

  return <BattlePage repositories={repositories} battleId={battleId} />;
}

export default function BattleRoute() {
  // The fallback is the SAME loading state <BattlePage> shows while its own load is in flight, so
  // the boundary resolving is invisible rather than a flicker between two spellings of "loading".
  return (
    <Suspense fallback={<BattleLoading />}>
      <BattleQueryRoute />
    </Suspense>
  );
}
