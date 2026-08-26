'use client';

import { useMemo } from 'react';
import BattlePage from '@/components/battle/BattlePage';
import { createRepositories } from '@/lib/repositoryFactory';

// Architecture Decision K's second page. `new` stays a real path segment because a STATIC segment
// prerenders fine under `output: 'export'` — only a dynamic `[id]` does not — which keeps Story
// 2.2's acceptance criterion true verbatim. No search params here, so no <Suspense> boundary is
// needed either.
//
// Seeding the empty grid at the FR-8.10 default preset is Story 2.2's job; this story only routes
// here. <BattlePage> short-circuits `battleId === 'new'` so the string never reaches
// battles.load(), where a miss would be indistinguishable from a deleted battle.
export default function NewBattleRoute() {
  // Once per component instance, at the page boundary (AR-2/AR-27) — same contract as
  // app/(gallery)/page.tsx and app/(battle)/battle/page.tsx.
  const repositories = useMemo(() => createRepositories(), []);

  return <BattlePage repositories={repositories} battleId="new" />;
}
