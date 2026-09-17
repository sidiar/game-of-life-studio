import type { BattleMode } from '@/components/battle/BattleHeader';

/**
 * Decision K.5: `/battle` is a STATIC route, so an entity id (and now an entry hint) rides as a
 * query parameter rather than a dynamic segment. This module is the ONE place the tile's hrefs and
 * the route's parse agree on the param's name and value — `lib/battle/tool.ts`'s own
 * `DEFAULT_TOOL` / `CONWAYS_CLASSIC_ID` note is the drift two independent literals invite: a
 * renamed param would compile and 404 the feature silently.
 *
 * The hint is read ONCE, by `<BattlePage>`'s `useState` initialiser — RFC-005 Decision 3 keeps a
 * mode flip as STATE, never a route, so nothing here ever writes the URL back (Story 3.17, FR-7.6).
 *
 * ⚠️ No value import from any component and no `next/*` import (Trap 11): this module rides in
 * BOTH `/`'s and `/battle`'s first-load payload, and `/battle` has only 1.3 KB of headroom.
 */
export const BATTLE_MODE_PARAM = 'mode';
export const RUN_MODE_VALUE = 'run';

/**
 * The tile's own builder. Without an explicit mode this returns byte-for-byte what the title link
 * built before this story (`` `/battle?id=${encodeURIComponent(id)}` ``) — pinned by
 * `BattleTile.test.tsx`'s href test, which must not change.
 */
export function battleHref(id: string, options?: { mode?: 'run' }): string {
  const base = `/battle?id=${encodeURIComponent(id)}`;
  return options?.mode === 'run' ? `${base}&${BATTLE_MODE_PARAM}=${RUN_MODE_VALUE}` : base;
}

/**
 * The route's own parser — the function IS the boundary (a Zod parse would be ceremony for a
 * two-valued literal). Only the exact string `'run'` opens in Run; every other value, including a
 * hand-typed `?mode=play` or a stale casing, degrades to `'lab'` silently — an unrecognised entry
 * hint is not an error state this page announces (AC4).
 */
export function initialModeFromParam(value: string | null): BattleMode {
  return value === RUN_MODE_VALUE ? 'run' : 'lab';
}
