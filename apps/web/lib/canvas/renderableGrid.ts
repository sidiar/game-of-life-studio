/**
 * `RenderableGrid` is now an ALIAS of `@gol/simulation`'s `Grid` (Story 3.3, FD1 option (a)).
 *
 * Story 1.8 declared this interface here with RFC-004 §3.4's exact field names —
 * `width`/`height`/`occupant`/`age` — so that the real typed-array `Grid` would satisfy it
 * structurally the moment it existed. It exists now, and `@gol/simulation` owns it, so the twin is
 * retired in favour of a re-export: the ~25 files that import `RenderableGrid` from this path keep
 * compiling untouched, and there is exactly one definition of the shape again.
 *
 * ⚠️ THE DIRECTION IS UNCHANGED, and is the reason this alias points down rather than the type
 * moving up: `apps/web` depends on `@gol/*` and never the reverse (AR-2/27). A `packages/*` module
 * may not name an `apps/web` type, which is why Story 1.8 could not put it below the boundary and
 * why `@gol/domain`'s `battleProjection.ts` still works over the dense at-rest shape instead.
 *
 * `toRenderableGrid` is likewise a re-export of the owning conversion, `gridFromDense`. Keeping the
 * app-side NAME is deliberate: the call sites read as "adapt a persisted battle for the canvas",
 * which is what they are doing, while the implementation lives with the type it constructs.
 * Cross-RFC Reconciliation #3's dense->typed clause is discharged there (see architecture.md).
 */
export type { Grid as RenderableGrid } from '@gol/simulation';
export { gridFromDense as toRenderableGrid } from '@gol/simulation';
