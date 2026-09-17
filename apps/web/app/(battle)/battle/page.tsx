'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import BattlePage, { BattleLoading } from '@/components/battle/BattlePage';
import { BATTLE_MODE_PARAM, initialModeFromParam } from '@/lib/battle/battleRoute';
import { createRepositories } from '@/lib/repositoryFactory';

// Architecture Decision K: the battle route is a STATIC `/battle` page that reads the id from
// `?id=<uuid>`. `app/battle/[id]/page.tsx` cannot be built at all under `output: 'export'` —
// Next throws for a dynamic segment with no generateStaticParams(), and battle ids are uuids
// minted in the user's browser, so there is nothing to enumerate at build time in this or any
// future story. Decision K.5 makes that a standing rule: every route must be statically
// prerenderable, and entity ids ride as query parameters, never as dynamic segments.
//
// Story 3.17 (FR-7.6) rides the SAME rule for a second, optional param: `?mode=run` is the
// Gallery's Run entry hint, read beside `id` and handed down as `initialMode` — an ENTRY value
// `<BattlePage>` seeds its mode state from once (RFC-005 Decision 3), never a synchronised route.
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
  // Both values come from the SAME `params` read, in the SAME render (deferred-work.md's two-phase
  // useSearchParams entry now covers `mode` too — no special handling, see battleRoute.ts).
  // A missing or empty ?id= yields '' — <BattlePage> renders that as not-found, not as a crash.
  // `?mode=run` is the Gallery's Run entry hint; anything else (absent, `lab`, a hand-typed `play`)
  // is Lab, silently — an unrecognised hint is not an error state this page announces (AC4).
  const params = useSearchParams();
  const battleId = params.get('id') ?? '';
  const initialMode = initialModeFromParam(params.get(BATTLE_MODE_PARAM));

  return <BattlePage repositories={repositories} battleId={battleId} initialMode={initialMode} />;
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
