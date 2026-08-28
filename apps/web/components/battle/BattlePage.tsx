'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { DEFAULT_SETTINGS, type Battle, type Organism, type Settings } from '@gol/domain';
import type { AppRepositories } from '@gol/persistence';
import { battleDisplayName } from '@/lib/battleDisplayName';
import { projectBattleForSave } from '@/lib/battleRecord';
import { saveFailureMessage } from '@/lib/saveFailureMessage';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { createNewBattleDraft, type NewBattleDraft } from '@/lib/newBattleDraft';
import { buildRefToFillGroup, MAX_ROSTER_SIZE } from '@/lib/canvas/refToFillGroup';
import { toRenderableGrid, type RenderableGrid } from '@/lib/canvas/renderableGrid';
import { readGridColors } from '@/lib/canvas/themeColors';
import { resolveDisplayOrganisms } from '@/lib/displayOrganisms';
import { buildRosterIds } from '@/lib/rosterUnion';
import { DEFAULT_TOOL } from '@/lib/tool';
import { useUndoableGrid } from '@/lib/useUndoableGrid';
import { BackLink, Notice, NoticeText, NoticeTitle } from '@/components/layout/Notice';
import BattleHeader from './BattleHeader';
import BattleEditorView from './BattleEditorView';

const Body = styled('div')({
  padding: '30px',
  color: 'var(--gol-text-secondary)',
});

// The composition root's own flex column (mockup's `.app-container`). The header is this column's
// first row; Story 2.9's sidebar+main row is the second, and it is declared inside
// `<BattleEditorView>` rather than here — the chassis belongs to the Lab view, not to the route.
//
// `<BattleHeader>` is NOT `position: fixed` here (BattleHeader.tsx forced decision), so
// `<BattleEditorView>`'s `flex: 1` needs an actual flex-column ancestor to fill the remaining
// height against, rather than the mockup's `margin-top` offset trick.
const Root = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  // review (2026-08-28), Story 2.12 AC6: a DEFINITE height, not `min-height` alone. This is the
  // top of the chain every percentage height below it resolves against — `<PetriDishBox>`'s
  // `maxHeight: '100%'` (the actual dish-overflow fix) computes to `none` unless this box, and
  // every flex item between it and the dish, has a definite height. That is why the story's first
  // commit shipped a cap that measurably never bound: at 1400x420 the dish still ran 278px past
  // the fold with `max-height: 100%` set.
  //
  // This is the MOCKUP's own value, not a new design call: `.app-container` is `height: 100vh`
  // under a `body { overflow: hidden }` (clinical-lab-theme/petri-dish-lab-mode.html:23,:27-30).
  // `min-height` was the deviation. It is also the model the rest of this layout was already built
  // for: `<EditorSidebar>` carries its own `overflow-y: auto`, which Story 2.9's comment notes
  // "never engages — the whole page scrolls instead" without a bound like this one.
  //
  // Scoped to the editor branch by construction — the loading and not-found branches return their
  // own markup above and never reach this element, so neither can be clipped by it.
  height: '100vh',
  minHeight: '100vh',
});

/**
 * The Suspense fallback for the `/battle` route AND the hook's own in-flight state, so both spell
 * "loading" identically. `useSearchParams()` in a prerendered page throws
 * `missing-suspense-with-csr-bailout` unless it sits under a boundary, and a boundary whose
 * fallback differs from the resolved loading state makes the page flicker between two spellings of
 * the same condition.
 */
export function BattleLoading() {
  return (
    <Body role="status" aria-live="polite">
      Loading battle…
    </Body>
  );
}

export interface BattlePageProps {
  // The DI seam (AR-2/AR-27), typed to the interface. This component never imports a concrete
  // repository and never calls createRepositories() itself — the page boundary does that once.
  repositories: AppRepositories;
  // 'new' is Story 2.2's create path. It is NOT an id: see the short-circuit below.
  battleId: string | 'new';
}

// Story 2.9 (AC6): the battle and the organism library are two SEPARATE resources now, so this
// combined shape is gone. A `{ battle, organisms }` pair is exactly what forced the `Promise.all`
// that collapsed a corrupt organism record into "this battle is broken".
//
// A stable empty array for the pre-settled roster: `rosterIds` feeds the `palette` memo, which is
// one of `EditDish`'s three construction dependencies, and a fresh `[]` per render would tear the
// retained renderer down on every render (Story 2.5 trap 7).
const NO_ROSTER: readonly string[] = [];

// Converts a loaded Battle to the SAME shape createNewBattleDraft seeds, so the render below reads
// one shape instead of branching on battleId === 'new' forever (Task 3, Story 2.2).
//
// ⚠️ These two arrays are handed out BY REFERENCE — they are the loaded `Battle` record's own,
// still held inside `battleResource.data`. `NewBattleDraft` used to declare them mutable, so any
// story that wrote `draft.gridState[r][c]` or pushed onto `draft.organismIds` would destroy the
// pristine loaded state in place, leaving nothing to revert to — and it would behave CORRECTLY on
// /battle/new (fresh arrays from createNewBattleDraft) and INCORRECTLY on /battle?id=…, the
// hardest possible shape for a bug to take. Story 2.5 closes that (deferred-work.md) by making
// `NewBattleDraft`'s arrays `readonly` at the TYPE level, so the compiler rejects the write
// instead of a convention having to catch it. Copying here was the alternative and was rejected:
// it costs a 6,000-element clone per load to defend against something the type system can rule
// out for free.
function toDraft(battle: Battle): NewBattleDraft {
  return {
    name: battle.name,
    gridSize: battle.gridSize,
    gridState: battle.gridState,
    organismIds: battle.organismIds,
  };
}

export default function BattlePage({ repositories, battleId }: BattlePageProps) {
  // AR-28: modes are local state, not routes. Epic 2 populates only 'lab' — the setter and the
  // 'run' branch arrive in Epic 3, and until then the route renders no toggle and no fullscreen
  // affordance at all (NFR-4.1: a rendered-but-inert control is worse than an absent one).
  const [mode] = useState<'lab'>('lab');

  // ⚠️ 'new' must never reach battles.load(). It is not a uuid, so the repository would treat it
  // as a plain miss and return null — indistinguishable from a stale/deleted id, which would make
  // /battle/new render "this battle is gone" for a page whose whole purpose is that it does not
  // exist yet. Story 2.2 short-circuits and seeds a fresh draft for the branch instead (below).
  const battleResource = useAsyncResource<Battle | null>(
    () => (battleId === 'new' ? Promise.resolve(null) : repositories.battles.load(battleId)),
    [repositories, battleId],
  );

  // Story 2.9 AC6 (deferred-work.md, owned by this story): the organism library is its OWN
  // resource. It used to ride inside the battle's `Promise.all`, which rejects on the FIRST
  // rejection — so one corrupt ORGANISM record rendered the battle's "Something Went Wrong" body
  // even when the battle itself loaded perfectly, telling the user the wrong thing about the wrong
  // record. That was accepted while nothing rendered the roster; `<OrganismRoster>` makes a
  // partially-usable page worth rendering, so the two failures are now structurally independent —
  // the same shape `settingsResource` below has demonstrated since Story 2.5.
  //
  // ❌ NOT given settings' `.catch(() => fallback)` treatment: a missing organism library is not
  // silently substitutable the way a missing settings record is. Its 'error' status is the fact
  // AC7's degraded roster is built on, so it must survive to the render.
  //
  // ⚠️ Deps stay a FIXED-LENGTH array of referentially stable elements — read `useAsyncResource`'s
  // header before touching any call site here; growing one spins the page forever.
  const organismsResource = useAsyncResource<readonly Organism[]>(
    () => repositories.organisms.list(),
    [repositories],
  );

  // Task 7 (deferred-work.md:183): LIFTED OUT of the battle/organisms Promise.all entirely,
  // rather than riding inside it with its own `.catch`. Before this story that `.catch` prevented
  // settings.load() from rejecting INTO the shared Promise.all, but did nothing about the reverse
  // problem — organisms.list() rejecting discarded a settings value that had already resolved
  // perfectly, because Promise.all fails the whole combinator on the first rejection regardless of
  // which OTHER promise already settled. A user whose default grid size is 50x30 would silently
  // get 100x60 on /battle/new the moment an unrelated organism record was corrupt. A fully
  // separate resource makes the two failures structurally independent: this one's own `.catch`
  // means its status is always eventually 'ready', never 'error', so it cannot be blanked by
  // anything battleResource does.
  const settingsResource = useAsyncResource<Settings>(
    () => repositories.settings.load().catch(() => DEFAULT_SETTINGS),
    [repositories],
  );
  const settings = settingsResource.data ?? DEFAULT_SETTINGS;

  // Task 6 / deferred-work.md:179 (AC7): the seeded draft used to be rebuilt in the RENDER BODY —
  // 61 array allocations per render at 100x60, with a fresh identity every time, which would make
  // the canvas's `[grid]` effect repaint on every unrelated render. Held here instead, in a hook
  // declared before every early `return` below (the hooks-order trap: `<BattlePage>` returns early
  // four times, and a hook below any of them is a conditional hook — React's error, not a subtle
  // one, but the *fix* people reach for, moving the return, is what would break the branch order
  // the Story 2.1 review fixed). `newDraft` is intentionally unconditional and independent of
  // `battleResource` — it depends only on `settings`, which is what keeps it correct even when
  // organisms.list() has failed (see settingsResource above).
  const newDraft = useMemo<NewBattleDraft | null>(
    () => (battleId === 'new' ? createNewBattleDraft(settings.defaultGridSize) : null),
    [battleId, settings],
  );
  const loadedBattle = battleResource.data ?? null;
  const loadedDraft = useMemo<NewBattleDraft | null>(
    () => (loadedBattle === null ? null : toDraft(loadedBattle)),
    [loadedBattle],
  );
  // The unified shape (Story 2.2's NewBattleDraft) both branches resolve to. For battleId ===
  // 'new', `newDraft` is always non-null (the memo above always seeds one in that branch); this
  // is null only for a real battle id with no usable battle in hand yet (a genuine load failure,
  // or a real not-found) — which is exactly the distinction the render below needs.
  const draft = battleId === 'new' ? newDraft : loadedDraft;

  // Story 2.11 Task 3 (AC2, AC3): `battleName`, seeded from `draft.name` by the SAME in-render
  // "adjusting state when a prop changes" pattern `useUndoableGrid` uses for its own seed (Dev
  // Notes → *Seeding the name*). `draft` settles AFTER the first render and every hook here
  // precedes four early returns, so a plain `useState(draft?.name ?? '')` would capture that first
  // render's `''`/`undefined` FOREVER — `/battle/new` would look correct (its name genuinely is
  // `''`) while every `/battle?id=…` opened with a permanently blank field.
  //
  // Compared by VALUE (`draft?.name ?? null`), never by `draft`'s own identity: `newDraft` and
  // `loadedDraft` are memos whose identities churn for reasons unrelated to the name (a settings
  // resolution landing after the battle, for instance), and keying on identity would blow away a
  // name the user is mid-typing every time either memo rebuilds.
  //
  // One state cell holding BOTH the value and the seed it was built from — not a bare
  // `useState(draft?.name ?? '')` plus a ref for the seed — because `react-hooks/refs` rejects
  // reading or writing a ref during render (a lint ERROR inside a `use*` function), and because a
  // second container is exactly the shape that lets the value and the seed be observed a tick out
  // of step (the same reasoning `useUndoableGrid`'s own `seed` field documents).
  const seedName = draft?.name ?? null;
  const [nameState, setNameState] = useState<{ value: string; seed: string | null }>(() => ({
    value: seedName ?? '',
    seed: seedName,
  }));
  if (nameState.seed !== seedName) {
    // Deliberate: React re-runs the body immediately with the new state, so the second pass is a
    // no-op and this cannot loop — the identical pattern `useUndoableGrid`'s own seed-adjust uses,
    // with the identical reason (an effect would render one frame of the WRONG battle's name
    // first).
    setNameState({ value: seedName ?? '', seed: seedName });
  }
  const battleName = nameState.value;

  // Story 2.11 (AC3, AC5): starts false; a name edit or a grid commit sets it, and exactly one
  // thing clears it — a save that RESOLVED (Story 2.13, `handleSave` below). Also observed via
  // `data-dirty` on `Root`, which is how both the unit tests and the e2e watch a save land
  // (the unsaved-changes guard that will read it in earnest is Story 2.16).
  const [isDirty, setIsDirty] = useState(false);

  // AC3: one handler sets BOTH the value and the flag, so React batches them into one commit — the
  // seed (`nameState.seed`) is carried through unchanged, which is what keeps a same-render
  // in-render adjust (above) from mistaking this edit for a new battle loading.
  const handleNameChange = useCallback((name: string) => {
    setNameState((previous) => ({ value: name, seed: previous.seed }));
    setIsDirty(true);
  }, []);

  // Task 6 / AC6 (deferred-work.md:167): the tab title. `desiredTitleRef` is what the SECOND
  // effect below writes on every relevant change; the FIRST effect owns the observer that keeps
  // that value stuck, for a reason discovered empirically rather than documented anywhere: Next
  // 16's App Router metadata (the `MetadataBoundary` / `OutletBoundary` machinery behind
  // `export const metadata` in `app/layout.tsx`) commits the root layout's STATIC `<title>` into
  // the real DOM once, ASYNCHRONOUSLY, during initial hydration — observed (via a `MutationObserver`
  // probe against the built static export served from `out/`, never against `next dev`) landing
  // strictly AFTER this component's own first title write, on every load, on both `/battle` and
  // `/battle/new`. A plain `document.title = …` effect (what Dev Notes originally prescribed) loses
  // that one race and leaves the tab reading "Game of Life Studio" at rest until the user's first
  // keystroke forces a second write — AC6 requires the correct title from the moment the page
  // settles, not from the moment it is edited. The observer is the fix: it re-asserts
  // `desiredTitleRef.current` synchronously whenever anything else changes `document.title`,
  // which defeats this one late race without depending on ITS exact timing (a `requestAnimationFrame`
  // or `setTimeout` delay would be a guess at a framework internal that owes no stability contract).
  //
  // Two effects, not one, is still deliberate: the FIRST owns both the observer's WHOLE lifecycle
  // (attached once, for the life of the mount) and the pre-existing title's capture-and-restore —
  // deterministic UNMOUNT ordering matters here (disconnect before restore, in the SAME cleanup),
  // which is the reason this is not two independent `[]`-deps effects. If cleanup order were
  // reversed the observer would still be attached when the restore write lands and would fight its
  // own unmount. A client navigation back to the Gallery must not keep reading the last battle's
  // name (Next may not rewrite a `<title>` it believes is unchanged between two `'use client'`
  // routes sharing one static `metadata.title` — see Dev Notes → *The tab title*). The SECOND
  // effect tracks the live display value on every relevant change; it owns no cleanup of its own.
  // `useEffect` never runs during the static export's prerender, so — unlike the `colors` memo
  // above — neither needs a `typeof document` guard.
  const desiredTitleRef = useRef<string | null>(null);
  useEffect(() => {
    const previousTitle = document.title;
    // ⚠️ The re-assertions are BOUNDED, and that bound is the whole safety story. A
    // `MutationObserver` callback that writes back what it just observed re-queues itself as a
    // MICROTASK, so two agents that each insist on their own title never reach a fixed point and
    // the microtask queue never drains — the event loop starves and the tab freezes hard (no
    // paint, no timers, no input, no CDP; verified against the built export in review, where the
    // page never recovered). The whitespace read-back below closes the one instance of this the
    // dev pass found; the counter closes the CLASS, for every other title writer this component
    // cannot know about (a second `<BattlePage>` in a test, a browser extension, an analytics
    // snippet, a later story that prefixes a dirty marker). The race being defended against needs
    // exactly ONE correction, so a budget this generous cannot be reached by legitimate use:
    // re-writing the SAME title never spends it, because the equality check short-circuits first.
    // Losing the tab title is a cosmetic failure; hanging the page is not, so this fights a fixed
    // number of rounds and then loses loudly rather than wedging the tab.
    const MAX_TITLE_CORRECTIONS = 10;
    let corrections = 0;
    const observer = new MutationObserver(() => {
      if (desiredTitleRef.current === null || document.title === desiredTitleRef.current) return;
      if (corrections >= MAX_TITLE_CORRECTIONS) {
        observer.disconnect();
        return;
      }
      corrections += 1;
      document.title = desiredTitleRef.current;
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = previousTitle;
    };
  }, []);
  useEffect(() => {
    // `draft === null` covers BOTH the still-loading first commits (every hook here runs before
    // the four early returns, so this effect fires while the resources are settling) and the
    // not-found / error branch. Neither may claim a battle name it does not have (AC6). Nulling
    // `desiredTitleRef` stops the observer reasserting anything, so the tab keeps reading whatever
    // the FIRST effect captured (the Gallery's, on a navigation into a bad link) rather than
    // inventing one. ⚠️ It only stops re-asserting; it does not UNDO a title already written, so a
    // battle → bad-id transition on a MOUNTED instance would strand the old name in the tab —
    // deferred-work.md's `battleId`-swap entry, unreachable until something navigates that way.
    if (draft === null) {
      desiredTitleRef.current = null;
      return;
    }
    document.title = `${battleDisplayName(battleName)} · Game of Life Studio`;
    // Read back what the browser actually stored, rather than the template string just assigned.
    // The HTML spec's `document.title` getter STRIPS AND COLLAPSES ASCII whitespace — a battleName
    // ending in a space (an entirely normal mid-typing state, e.g. "New ") produces
    // "New  · Game of Life Studio" (two spaces) going IN, which the browser reports back as "New ·
    // Game of Life Studio" (one) coming OUT. Storing the un-normalised string here would make the
    // observer's `document.title !== desiredTitleRef.current` comparison PERMANENTLY TRUE —
    // browser mutation, observer reassigns, browser normalises again, observer fires again — a
    // same-tick MutationObserver retrigger loop with no macrotask in between, which starves the
    // event loop and makes every further keystroke (and, from OUTSIDE the page, every further
    // Playwright/CDP command) hang indefinitely. Found by an e2e that typed a literal space.
    desiredTitleRef.current = document.title;
  }, [draft, battleName]);

  // Task 6: `colors` resolved ONCE here (getComputedStyle forces a style recalculation) and
  // passed down, never resolved inside the canvas — the same memoised pattern
  // BattleGallery.tsx:183-185 already establishes. `document` is unavailable during the static
  // export's prerender; guarded rather than gated behind an effect for the same reason the
  // Gallery's version is — `colors` is never read by JSX rendered before a canvas actually mounts.
  const colors = useMemo(
    () => (typeof document === 'undefined' ? null : readGridColors(document.documentElement)),
    [],
  );

  const organisms = organismsResource.data;
  // AC7 (deferred-work.md, owned by this story): the library genuinely failed. Distinct from
  // `organisms === undefined`, which is also true while it is still in flight — collapsing the two
  // is what let `/battle/new` render a fully successful page over a resource in the `error` state,
  // with no alert, no retry and no log.
  const libraryUnavailable = organismsResource.status === 'error';

  // Story 2.5 Task 5: the grid and the palette no longer share one memo. Until this story they
  // came from a single `toThumbnailSource(draft, organisms)` call, which was right while both
  // were derived from the same draft — but the grid is now HELD STATE the user edits, and the
  // palette is derived from the roster UNION below rather than from `draft.organismIds`. They no
  // longer share a lifetime or an input, so joining them would only mean one of the two has a
  // reason to churn that the other does not. ❌ Do not widen `toThumbnailSource` further to keep
  // them together.
  const seedGrid = useMemo<RenderableGrid | null>(
    () => (draft === null ? null : toRenderableGrid(draft.gridState)),
    [draft],
  );

  // Decision H.2's session roster: organisms added to the Lab roster this session but not yet
  // painted. Starts EMPTY; the add-from-library dropdown (Story 2.10, below) is its first writer,
  // and 2.13 (save + the H.1 prune) is the other. ❌ Never persisted: H.1 prunes at save, which is
  // 2.13's.
  //
  // Story 2.9 forced decision 4: the `DEFAULT_TOOL.organismId` seed is NO LONGER in here. It was
  // seeded unconditionally so the first click resolved to a ref — invisible plumbing while nothing
  // rendered the roster, but a visible, wrong ROW the moment `<OrganismRoster>` ships: opening
  // "Three-Way Skirmish" would list a fourth organism, Conway's Classic, that the user never added
  // and that Decision H says is not part of that battle. It now applies only where it is actually
  // needed — see the union below.
  const [sessionRoster, setSessionRoster] = useState<readonly string[]>(() => NO_ROSTER);

  // Story 2.10 (AC3, trap 4): the ONLY writer. Append-only, and a no-op — returning the SAME array
  // — when the id is already present, rather than a new array that would happen to be equal.
  // `sessionRoster` feeds the `rosterIds` memo below, which feeds `palette`, which is one of
  // `EditDish`'s three construction dependencies (PetriDishCanvas.tsx): a fresh identity on every
  // render would tear down the retained renderer on every render, not just on a real add.
  //
  // `useCallback` because this is handed to `<BattleEditorView>` as a prop that itself feeds a
  // `useCallback` there (the add-and-select wrapper, forced decision 1) — a fresh identity here
  // would churn that wrapper's identity too, on a path that already rebuilds the palette on change.
  const onAddToRoster = useCallback((organismId: string) => {
    setSessionRoster((previous) =>
      previous.includes(organismId) ? previous : [...previous, organismId],
    );
  }, []);

  // ⚠️ Withheld entirely until the ORGANISM resource has settled (Story 2.9 trap 6). This gate used
  // to key on the BATTLE resource, which was the same thing while one `Promise.all` settled both;
  // splitting them moved its meaning. `buildRefToFillGroup` warns once per roster id with no
  // matching organism (Decision I.4), so a battle that resolves BEFORE the library would otherwise
  // print that diagnostic for every one of its organisms, on every load and on the static export's
  // prerender, about a library that simply had not arrived yet. The e2e's clean-console assertions
  // catch this and the unit tests do not.
  //
  // A settled-but-FAILED library is different: it genuinely is broken, the ids go in, and the
  // degrade-and-warn is the correct, informative behaviour. Nothing renders the canvas before both
  // resources settle (the loading guard below), so the editor never sees the withheld union.
  const rosterSettled = organismsResource.status !== 'loading';

  // `draft.organismIds` first — their ORDER is the dense encoding's own (RFC-006 Decision 2: cell
  // value = roster index + 1), so a session entry may only ever be APPENDED, and the cap keeps the
  // union from reaching a 256th entry `buildRefToFillGroup` would throw on. Both invariants live
  // in `buildRosterIds` with tests of their own (AC8, AC9) rather than inline here, because their
  // failure mode is a silently repainted grid rather than an error.
  //
  // ⚠️ A NEW array, never a push onto `draft.organismIds` — see toDraft above.
  const rosterIds = useMemo<readonly string[]>(() => {
    if (!rosterSettled) return NO_ROSTER;
    const placed = draft?.organismIds ?? NO_ROSTER;

    // Forced decision 4, option (b): seed the default tool's organism ONLY when the battle PLACES
    // nothing. That is the one case where the seed still earns its keep — a battle with nothing
    // placed (`/battle/new`, or a saved battle H.1 pruned to nothing) has no first row for
    // `<BattleEditorView>` to select, so without this the dish would be unpaintable until Story
    // 2.10 ships the add dropdown: a user-visible regression this story must not introduce.
    // A battle that places anything keeps a roster of exactly its own placed set (Decision H.1).
    //
    // ⚠️ The coupling this preserves: the seeded id must be whatever `DEFAULT_TOOL` resolves
    // against, so it is read off that constant rather than `CONWAYS_CLASSIC_ID` directly (lib/
    // tool.ts's own trap — two independent constants would drift and leave `refForTool` returning
    // null at every press).
    //
    // ⚠️ Story 2.10 code review (2026-08-27) — trap 1, the append-only invariant. This condition
    // used to be `union.length > 0`, i.e. the seed applied only while the union (placed + SESSION)
    // was empty. Story 2.10 gave `sessionRoster` its first writer, which made that condition
    // FALSIFIABLE BY AN ADD: on `/battle/new` the user painted with the seeded Conway's Classic
    // (ref 1), then added an organism from the dropdown — the union became `['added']`, the seed
    // branch stopped applying, and index 0 silently changed hands. Every cell painted as Conway
    // repainted as the added organism, Conway's row vanished from the roster while its cells
    // stayed on the grid, and Conway reappeared in the add dropdown. No throw, no warning, a fully
    // green suite: exactly the failure mode trap 1 (RFC-006 Decision 2, `cell = roster index + 1`)
    // describes. The seed now sits in the union's BASE, where session entries append AFTER it and
    // can never displace it — the same position `draft.organismIds` occupies for a saved battle.
    //
    // Story 2.9 review, decision 1 (Sidiar's option (a)) is unchanged by this: the seed is still
    // conditional on that organism actually being in the library that just loaded.
    //
    // `libraryUnavailable` covers a FAILED `organisms.list()`. A SUCCESSFUL EMPTY one is a
    // different, reachable state — a fresh browser profile, cleared storage, or a bookmarked
    // `/battle/new` opened before the Gallery has ever run the workspace seed (`useWorkspaceSeed`
    // is mounted by the Gallery page, not by this route). Seeding unconditionally there put an id
    // in the roster with no record behind it, so `resolveDisplayOrganisms` fell back and the
    // sidebar rendered a normal, pre-selected, clickable row reading "Unknown organism" — a page
    // reporting no problem while offering a tool that cannot place anything, which is precisely
    // what AC7's degraded notice exists to avoid saying by accident.
    //
    // The trade-off Sidiar accepted: in that narrow window the roster is honestly EMPTY and the
    // dish is honestly unpaintable — `resolveSelectedTool` falls through to the eraser (spec §3.3:
    // "first roster row; eraser when the roster is empty"), and Story 2.10's add dropdown is what
    // makes it paintable again. Better an empty list than a fictional organism.
    //
    // ⚠️ `organisms`, not `roster`: this memo FEEDS `roster`, so reading the resolved list here
    // would be a cycle. `rosterSettled` above already guarantees the resource is not in flight, so
    // `organisms ?? []` is an EMPTY LIBRARY here, never an unarrived one.
    const defaultInLibrary = (organisms ?? []).some(
      (organism) => organism.id === DEFAULT_TOOL.organismId,
    );
    const base = placed.length === 0 && defaultInLibrary ? [DEFAULT_TOOL.organismId] : placed;
    return buildRosterIds(base, sessionRoster);
  }, [draft, sessionRoster, rosterSettled, organisms]);

  // The roster resolved for DISPLAY — names and identity-shade colours — through the same
  // `displayColor` LUT the dish's own cells go through, which is what keeps a sidebar chip from
  // ever disagreeing with the cells it describes. Resolved once here rather than per consumer
  // (Story 2.9 forced decision 3: one resolver, never two).
  //
  // ⚠️ This is for RENDERING only. `rosterIds` above stays the identity array `refForTool` indexes
  // — `resolveDisplayOrganisms` de-duplicates, so the two can differ in length (trap 2).
  const roster = useMemo(
    () => resolveDisplayOrganisms(rosterIds, organisms ?? []),
    [rosterIds, organisms],
  );

  // Story 2.10 (AC1, forced decision 4): the addable library — spec §3.4's "full shared library
  // minus roster" — chosen to live HERE rather than in `<BattleEditorView>` beside
  // `duplicateColorIds`. `<BattlePage>` already owns `organisms` and already resolves `roster`
  // through `resolveDisplayOrganisms` immediately above; computing `library` the same way, in the
  // same place, keeps the raw `Organism[]` from ever needing to reach `<BattleEditorView>` at all
  // (one more prop this story does NOT have to add) and keeps "resolve against the library once"
  // a single rule rather than one kept in two components.
  //
  // A `Set` over `rosterIds`, not `.includes` per organism: the workspace library is uncapped
  // (Decision G.3/M6), so this is an O(library) scan per change rather than O(library * roster).
  //
  // ⚠️ Subtracts `rosterIds` (the session-inclusive union), never `draft.organismIds` (trap 8) —
  // subtracting only the battle's placed set would keep offering an organism the user just added.
  const library = useMemo(() => {
    const rosterSet = new Set(rosterIds);
    const addableIds = (organisms ?? [])
      .filter((organism) => !rosterSet.has(organism.id))
      .map((organism) => organism.id);
    return resolveDisplayOrganisms(addableIds, organisms ?? []);
  }, [organisms, rosterIds]);

  // Story 2.10 code review (2026-08-27), AC8 / trap 7. `library` is a DIFFERENCE — it is empty both
  // when the roster has consumed the workspace AND when the workspace itself holds nothing, which
  // are different facts that need different copy. The subtraction throws that apart, so the
  // un-subtracted fact travels alongside it. Reachable exactly where Story 2.9's decision 1 said it
  // was: a fresh profile, cleared storage, or a bookmarked `/battle/new` opened before the Gallery
  // has ever run the workspace seed. ❌ Not `libraryUnavailable` — the list LOADED, it is just empty.
  const workspaceEmpty = (organisms ?? []).length === 0;

  // Story 2.10 (AC5, trap 2): measured on the IDENTITY array's length, never `roster.length` —
  // `resolveDisplayOrganisms` de-duplicates, so the display list can be shorter than the number of
  // refs the encoding has actually spent. `MAX_ROSTER_SIZE` is imported, never re-declared, so this
  // cannot drift from the cap `buildRefToFillGroup` throws above.
  const atCap = rosterIds.length >= MAX_ROSTER_SIZE;

  // Built over `rosterIds`, NOT `draft.organismIds` (trap 3). On /battle/new the draft's roster is
  // empty, so a LUT built from it would have `size === 1` while placement writes ref 1 —
  // `colourStateAt` folds every ref >= size to EMPTY with only a warn-once, so the click would
  // appear to do nothing at all: no error, no throw, a fully green test suite, AC1 quietly unmet.
  //
  // Memoised on `rosterIds` + `organisms` because `palette` is one of `EditDish`'s three
  // construction dependencies (PetriDishCanvas.tsx) — a churning identity there throws away the
  // retained renderer, the grid-line overlay, and the dirty baseline AC2 depends on, on every
  // render.
  const palette = useMemo(() => {
    const organismsById = new Map((organisms ?? []).map((o) => [o.id, o] as const));
    return buildRefToFillGroup(rosterIds, organismsById);
  }, [rosterIds, organisms]);

  // Story 2.8: THE grid state, and the only one (AC1). `useState` + a `lastSeedRef` re-seed used
  // to live here inline; both moved inside the hook, which now owns the async-seed adoption AND
  // the 30-entry undo ring in one state cell (RFC-005 Decision 6, AR-30). ❌ No second grid state
  // beside it — that is what the hook replaced, not what it joined.
  //
  // The value changes once per COMMITTED gesture (a click, one stroke from Story 2.6, an undo)
  // and never per pointer move: the hot, in-progress state stays in the canvas's refs
  // (project-context, RFC-005 Decision 6).
  //
  // ⚠️ `seedGrid` is null on the FIRST render — every hook here precedes four early returns, and
  // the battle resource has not settled yet. The hook adopts the seed when it arrives and resets
  // the ring when it CHANGES (a different battle), which is what keeps a `useState(seedGrid)`
  // from capturing that null forever and leaving a permanently blank editor.
  const [{ value: grid, commit: commitGrid }, { undo, canUndo }] = useUndoableGrid(seedGrid);

  // Forced decision 4 (Story 2.8): `size` is DERIVED from the grid, not carried separately as
  // `draft.gridSize`. From this story dimensions are a property of every undo snapshot, so two
  // sources for one fact would be two things that can disagree — and when 2.14 makes a resize
  // commit a differently-shaped grid, that disagreement is `assertGridMatchesSize` throwing
  // `GridRendererDimensionMismatchError` out of the canvas's grid effect (unmounting the editor),
  // with `handlePointerDown`'s own dimension guard silently making the dish unpaintable first.
  //
  // Memoised on the two PRIMITIVES, never an inline literal: `size` is one of `EditDish`'s three
  // construction dependencies, so a churning identity there throws away the retained renderer, the
  // grid-line overlay and the dirty baseline on every render (Story 2.5 trap 7).
  const gridCols = grid?.width ?? 0;
  const gridRows = grid?.height ?? 0;
  const size = useMemo(() => ({ cols: gridCols, rows: gridRows }), [gridCols, gridRows]);

  // Story 2.11 (AC4): the ONE undoable-commit seam, WRAPPED rather than replaced. A click (2.5), a
  // drag stroke (2.6), an erase (2.7) — and, when they land, Clear (2.15) and a confirmed resize
  // (2.14) — all arrive here, so wrapping this one function covers every present and future commit
  // source. `commitGrid` is stable by construction (`useUndoableGrid` returns a `useCallback` with
  // `[]` deps) and `setIsDirty` is a setter, so THIS wrapper is stable too — load-bearing, because
  // `EditDish`'s resize effect holds whatever `onCommitGrid` resolves to in a closure it
  // deliberately does not re-register (PetriDishCanvas.tsx; Story 2.5 trap 7). A wrapper rebuilt
  // per render would silently break that, and the symptom is a mid-stroke resize committing
  // through a stale closure, not a test failure. ⚠️ The guarantee is STRUCTURAL — this
  // `useCallback`'s dep list and nothing else. `BattlePage.test.tsx` exercises the outward
  // consequence (the seam still commits across an unrelated re-render), which is a proxy, not a
  // direct assertion on the prop's identity; that assertion is still owed (deferred-work.md).
  //
  // ❌ `undo` (below) is NOT wrapped, and this is deliberate: `canUndo` is `state.past.length > 0`
  // and the ring is empty until a commit lands, so an undo can never be the FIRST mutation of a
  // session — whatever made it possible already set `isDirty`. Wrapping `undo` would be code that
  // cannot change an outcome, and an undo that CLEARED `isDirty` would be wrong anyway (undoing to
  // the seed is not the same as being saved) — see Dev Notes → *Undo and the dirty flag*.
  const handleCommitGrid = useCallback(
    (next: RenderableGrid) => {
      commitGrid(next);
      setIsDirty(true);
    },
    [commitGrid],
  );

  // Story 2.13 (AC2): the identity a save stamps, remembered across saves.
  //
  // `/battle/new` carries no id — `NewBattleDraft` deliberately has none (newBattleDraft.ts: minting
  // one before a save "would be a lie the moment the user leaves /battle/new without saving"), so
  // the FIRST save mints it here. Remembering it is what makes the SECOND save an update rather
  // than a second battle in the Gallery.
  //
  // `createdAt` rides in the same cell because the two are stamped together and must stay together:
  // `BattleSummarySchema` deliberately omits `createdAt` (battleSchema.ts), so it is not on the
  // summary the Gallery holds — the only sources are the loaded record and this stamp. Overwriting
  // it with `new Date()` on every save is invisible in the UI (FR-7.3 renders `updatedAt` only) and
  // silently wrong in every future export.
  //
  // ⚠️ Not reset when `battleId` changes on an already-mounted page — the same family as
  // `sessionRoster`/`chosenTool`/`battleName` (deferred-work.md), unreachable for the same reason
  // (nothing navigates battle-to-battle without a full load) and to be fixed with them, together.
  const [saveStamp, setSaveStamp] = useState<{ id: string; createdAt: Date } | null>(null);

  // AC4: a real `disabled` on SAVE for the duration of a write. `battles.save()` is a
  // whole-collection read-modify-write over one `gol:battles` key, so two interleaved saves can
  // lose one outright.
  const [isSaving, setIsSaving] = useState(false);
  // AC5 / NFR-7.2: a refused save's message, rendered as a `role="alert"` line above the status bar
  // (forced decision 4b). `null` is "no failure to report" — never `''`.
  const [saveError, setSaveError] = useState<string | null>(null);
  // The re-entrancy guard, in a REF as well as in state: `setIsSaving(true)` does not take effect
  // until the next render, so two activations dispatched in the same tick (a double-click, or a
  // click racing the Enter key) would both read `isSaving === false` and both write. The disabled
  // attribute is the user-facing half; this is the one that cannot be raced.
  const savingRef = useRef(false);

  // AC2, AC3, AC4, AC5 — the whole save. Declared before the four early returns below like every
  // other hook here.
  //
  // ⚠️ This handler READS the editor and writes nothing back to it (trap 1). No refetch (re-running
  // battles.load() would rebuild `draft` -> `seedGrid`, and `useUndoableGrid` resets its ring when
  // the seed changes — thirty levels of undo destroyed to learn something the app already knows);
  // no re-seed of `rosterIds` (the saved roster is PRUNED and the live one is not, so adopting the
  // pruned order mid-session would shift every live ref and repaint the dish); no `sessionRoster`
  // clear (Decision H.2 entries are excluded from the RECORD, not from the SESSION — a user who
  // added an organism, saved, then went to paint with it would find it gone from the sidebar and
  // back in the add dropdown). After this resolves, exactly two things have changed: `isDirty` is
  // false and, on a first save, `saveStamp` is set.
  const handleSave = useCallback(async () => {
    if (savingRef.current || grid === null) return;
    savingRef.current = true;
    setIsSaving(true);
    // Cleared at the START of the attempt, not only on success: an identical message re-rendered
    // in place would not re-announce through `role="alert"`, so a second failure would be silent.
    // Unmounting the line first makes every attempt's outcome audible.
    setSaveError(null);

    const now = new Date();
    // The loaded record is the fallback SOURCE for both fields, never a thing to write back to.
    const existing =
      saveStamp ??
      (loadedBattle === null ? null : { id: loadedBattle.id, createdAt: loadedBattle.createdAt });
    // Forced decision 2, option (a): bare `crypto.randomUUID()`, no fallback. It requires a SECURE
    // CONTEXT — `localhost`, `https` and Playwright all are, so dev, CI and any real deployment are
    // fine; a static export opened over plain `http://` on a LAN IP is not, and there `crypto
    // .randomUUID` is `undefined`. The honest failure (a TypeError surfacing through AC5's generic
    // message below) beats a hand-rolled generator nothing tests, whose output `BattleSchema.id`'s
    // `z.uuid()` would reject on the NEXT load — i.e. a save that appears to succeed and produces
    // an unopenable battle.
    const id = existing?.id ?? crypto.randomUUID();
    const createdAt = existing?.createdAt ?? now;

    try {
      // ⚠️ `battleName` raw, including `''` — `battleDisplayName`'s "Untitled Battle" is a DISPLAY
      // fallback and is never stored (createNewBattleDraft records why).
      const record = projectBattleForSave(grid, rosterIds, {
        id,
        name: battleName,
        createdAt,
        updatedAt: now,
      });
      await repositories.battles.save(record);
      setSaveStamp({ id, createdAt });
      // AC4: only after the promise RESOLVES. Clearing optimistically before the await would report
      // success for a write that then throws — and RFC-006 Decision 7 says a failed write "also
      // fails the dirty-flag clear, so the user keeps their unsaved indicator" in as many words.
      setIsDirty(false);
    } catch (error) {
      // ❌ Never swallowed: an unreported save failure is the worst outcome in this story. `isDirty`
      // is deliberately left TRUE.
      setSaveError(saveFailureMessage(error));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [grid, rosterIds, battleName, repositories, saveStamp, loadedBattle]);

  // ALL THREE resources must settle before anything renders. Without this, a battle that resolves
  // before settings would briefly seed /battle/new at the DEFAULT_SETTINGS fallback grid size
  // before correcting itself the moment settings arrives, which is the exact flash Task 7 exists
  // to prevent, just moved one tick later instead of removed — and (Story 2.9) a battle that
  // resolves before the organism library would flash an empty sidebar before its roster appears.
  //
  // ⚠️ 'loading', never 'error' (AC6). A FAILED organism library must fall through to the render
  // below: the battle loaded, the grid is editable, and the roster section says what went wrong
  // (AC7). Gating on anything but 'loading' here would restore the very blanking this story exists
  // to remove.
  if (
    battleResource.status === 'loading' ||
    organismsResource.status === 'loading' ||
    settingsResource.status === 'loading'
  ) {
    return <BattleLoading />;
  }

  if (draft === null) {
    // Unreachable for battleId === 'new' — that branch's memo always seeds a draft — so this is
    // only ever a real battle id with no usable battle: either the load genuinely failed (status
    // 'error') or it succeeded and found nothing (a stale/deleted id, or a hand-typed one). "Gone"
    // and "broken" are different facts and offer the user different next moves, so the copy must
    // differ.
    if (battleResource.status === 'error') {
      return (
        <Notice>
          <NoticeTitle>Something Went Wrong</NoticeTitle>
          <NoticeText>This battle could not be loaded. Its stored data may be damaged.</NoticeText>
          <BackLink href="/">Back to Gallery</BackLink>
        </Notice>
      );
    }
    return (
      <Notice>
        <NoticeTitle>Battle Not Found</NoticeTitle>
        <NoticeText>
          No battle matches this link. It may have been deleted, or the link may be incomplete.
        </NoticeText>
        <BackLink href="/">Back to Gallery</BackLink>
      </Notice>
    );
  }

  // Task 6 (deferred-work.md:189): Task 3 unified the draft TYPE but not the RENDER — this used to
  // be two byte-identical `return`s, each building its own local `draft`. Both arms already
  // resolve to the same `NewBattleDraft` shape, so one render now serves both: the create route
  // (`draft` is `newDraft`, always non-null), and a loaded battle (`draft` is `loadedDraft`, which
  // the guard above has already excluded being null for).
  //
  // `grid` is non-null here too: it is null only when `draft` is, and that branch already
  // returned above.
  return (
    // mode is read here so the state cell is not merely declared, and so Epic 3's Run mode has a
    // switch to flip on the chassis the Lab sidebar and status bar now hang off.
    //
    // Story 2.11 forced decision 3: `data-dirty`, mirroring `data-mode` above — `isDirty` has no
    // UI consumer yet in this story (SAVE is 2.13; the unsaved-changes guard is 2.16), so this is
    // what keeps the state cell from being merely declared, and gives both unit and e2e a real
    // assertion. Rendered in BOTH states (never conditionally): an absent attribute and a `false`
    // one are indistinguishable to a test that got the selector wrong.
    <Root data-mode={mode} data-dirty={isDirty}>
      {/* AC2: the header tracks the LIVE edited value, not the stored `draft.name` — typing in the
          sidebar updates the header on the same paint, with no save, no blur and no debounce. */}
      <BattleHeader battleTitle={battleDisplayName(battleName)} />
      {/* `grid` is non-null whenever draft is (the seed memo above) — the check exists for
          TypeScript, not because the two can disagree at runtime. */}
      {grid !== null && (
        <BattleEditorView
          grid={grid}
          size={size}
          palette={palette}
          showGridLines={settings.gridLines}
          colors={colors}
          rosterIds={rosterIds}
          roster={roster}
          libraryUnavailable={libraryUnavailable}
          library={library}
          workspaceEmpty={workspaceEmpty}
          onAddToRoster={onAddToRoster}
          atCap={atCap}
          battleName={battleName}
          onNameChange={handleNameChange}
          /* AC4: the WRAPPED seam — see handleCommitGrid's own comment above for why it, and not
             `commitGrid` directly, is what has to reach the canvas from here on. */
          onCommitGrid={handleCommitGrid}
          onUndo={undo}
          canUndo={canUndo}
          /* Story 2.13 (AC1, AC4, AC5): inputs to the view, not derivations — spec §3.3 lists both
             as props, and `<BattlePage>` owns the dirty flag (AR-27/28) and the save itself. */
          isDirty={isDirty}
          onSave={handleSave}
          isSaving={isSaving}
          saveError={saveError}
        />
      )}
    </Root>
  );
}
