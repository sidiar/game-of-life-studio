'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { styled } from '@mui/material/styles';
import {
  buildRuleReferenceIndex,
  buildUsageIndex,
  CONWAYS_CLASSIC_ID,
  organismDeleteVerdict,
  resolveOrganismUsage,
  type Organism,
  type OrganismUsageEntry,
} from '@gol/domain';
import type { BattleRepository, OrganismRepository } from '@gol/persistence';
import { toDisplayOrganism } from '@/lib/displayOrganisms';
import { cloneOrganismRecord } from '@/lib/organisms/organismClone';
import { normalizeOrganismSearch, organismNameMatches } from '@/lib/organisms/organismNameMatches';
import { referencingOrganismNames, usageBattleNames } from '@/lib/organisms/usageLabels';
import { saveFailureMessage } from '@/lib/saveFailureMessage';
import { sortLibrary } from '@/lib/organisms/sortLibrary';
import { useInertBackground } from '@/lib/useInertBackground';
import { useOrganismEditorModal } from '@/lib/organisms/useOrganismEditorModal';
import { useAsyncResource } from '@/lib/useAsyncResource';
import type { WorkspaceSeedStatus } from '@/lib/gallery/useWorkspaceSeed';
import OrganismCard from './OrganismCard';

/**
 * Story 4.3: the Organism Editor is loaded ON DEMAND, exactly as `<BattlePage>` loads
 * `<UnsavedChangesDialog>` and `<BattleEditorView>` loads `<ResizeClipWarningDialog>`. The MUI
 * `Dialog` stack measured **+18.1 KB gzip** when statically imported (Story 1.13, re-confirmed by
 * 2.14); `/organisms` has 11.5 KB of headroom under its 305 KB budget. AR-35 names the editor as
 * *the* example of its "dynamic import for heavy components" rule (RFC-003).
 *
 * `ssr: false` because a closed dialog can never be part of the first paint (`open` is false until
 * a user gesture), so there is nothing for the prerender to render: the flag keeps the module out
 * of the route's SERVER bundle, not out of its HTML — a closed `Dialog` emits no markup either way
 * (the e2e's prerender proof pins that). No `loading` fallback (FD7): the two
 * shipped lazy dialogs render nothing while the chunk resolves, and a spinner for a few
 * milliseconds is chrome nobody asked for.
 */
const OrganismEditorModal = dynamic(() => import('./editor/OrganismEditorModal'), { ssr: false });

// Story 4.17: the FR-1.3 in-use warning, a second `dynamic()` boundary beside the editor's, for
// the same reasons — the MUI Dialog stack stays out of the first load, and a closed dialog is never
// in the first paint. Not rendered from inside the editor chunk: the gate opens BEFORE the editor
// exists (a Cancel never fetches the editor chunk at all). Modules shared with the editor chunk
// (the Dialog stack) are hoisted into a common async chunk at bundle time.
const OrganismInUseDialog = dynamic(() => import('./OrganismInUseDialog'), { ssr: false });

// Story 4.21: the hard-block dialog, a third `dynamic()` boundary beside the two above, for the
// identical reason — the MUI Dialog stack (and, transitively, `deleteBlockCopy.ts`'s strings)
// stay out of `/organisms`'s first load. It never opens the editor and is never driven by
// `useOrganismEditorModal` (FD8): local state here, plus `useInertBackground`, is the
// `useDeleteBattleDialog` shape at smaller size.
const OrganismDeleteBlockedDialog = dynamic(() => import('./OrganismDeleteBlockedDialog'), {
  ssr: false,
});

export interface OrganismLibraryProps {
  organisms: OrganismRepository;
  /**
   * Story 4.17 (RFC-005 `:168-172`): the Library reads the battle list for the AR-15 usage index —
   * "Used in N Battles" before an edit opens. Interface-typed, injected from the page boundary's one
   * `createRepositories()` (AR-2/AR-27); never reaches the modal (Story 4.20's footer will need it
   * there, and an unread prop is a lie about what a component reads).
   */
  battles: BattleRepository;
  seedStatus: WorkspaceSeedStatus;
}

const HEADING_ID = 'organism-library-heading';

// Mockup: .section-header/.section-title/.section-subtitle
// (organism-library.html:88-102) — same shape as BattleGallery's own section header. Duplicated
// rather than shared (FD9): lifting these into components/layout/SectionHeader.tsx is only worth
// doing together with switching BattleGallery to import them too, which is Story 3.17's surface
// (run-from-Gallery) in the parallel Epic 3 lane — do the lift in the first story after 3.17 that
// touches both.
const SectionHeader = styled('div')({
  marginBottom: '35px',
});

const SectionTitle = styled('h1')({
  fontSize: '32px',
  fontWeight: 600,
  margin: '0 0 8px',
  letterSpacing: 'var(--gol-letter-spacing-title)',
  color: 'var(--gol-text-primary)',
});

const SectionSubtitle = styled('p')({
  fontSize: '14px',
  color: 'var(--gol-text-secondary)',
  margin: 0,
});

const StatusText = styled('p')({
  color: 'var(--gol-text-secondary)',
  // The zero-match message quotes the raw query back; a pasted no-space string must wrap rather
  // than push the page into horizontal scroll (Story 4.2 review).
  overflowWrap: 'anywhere',
});

// Mockup: .toolbar (organism-library.html:105-113). The FULL band rules ship on day one — unlike
// BattleGallery's toolbar band, which shipped `marginBottom`-only (`deferred-work.md`'s "toolbar
// band ships without the mockup's layout rules" entry), this toolbar has two children
// (search + count badge) from the start and needs the real flex layout.
const Toolbar = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '20px',
  flexWrap: 'wrap',
  marginBottom: '35px',
});

const ToolbarLeft = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '15px',
  flex: 1,
});

// Mockup: .create-button (organism-library.html:122-139). The one filled control on this page.
// `--gol-accent-hover` is the mockup's literal `#00e5ff` as the token it already is
// (`<EditorStatusBar>`'s SAVE records the same substitution). The mockup's `transform:
// translateY(-1px)` hover lift is kept — a transform is not a colour — but its `transition: all`
// is NOT (the `<SidebarFooter>`/`<EditorStatusBar>` mid-fade axe trap: a scan landing mid-fade
// measures a control at a contrast ratio no settled state has).
const CreateButton = styled('button')({
  background: 'var(--gol-accent)',
  color: 'var(--gol-bg-primary)',
  border: 'none',
  padding: '14px 28px',
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'inherit',
  // The DOM text is sentence case and CSS uppercases it, so the accessible name stays
  // "+ Create New Organism" while the mockup's "+ CREATE NEW ORGANISM" is what renders.
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  '&:hover': {
    background: 'var(--gol-accent-hover)',
    transform: 'translateY(-1px)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// Mockup: .search-container (:139-142).
const SearchField = styled('div')({
  position: 'relative',
  flex: 1,
  maxWidth: '400px',
});

// Mockup: .search-input (:144-167), with the house substitutions `BattleNameField.tsx:14-19`
// records: `--gol-border-control` (SC 1.4.11 — the mockup's `--border` measures only 1.57:1, below
// the 3:1 a control boundary needs), a real `:focus-visible` ring rather than the mockup's
// border-only focus swap, enumerated `border-color` transition + `prefers-reduced-motion` escape
// (never `transition: all`), and `--gol-text-secondary` placeholder text at 0.8 opacity rather
// than the mockup's `--text-tertiary` literal.
const SearchInput = styled('input')({
  width: '100%',
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 40px 12px 16px',
  fontSize: '14px',
  fontFamily: 'inherit',
  transition: 'border-color 0.2s',
  '&::placeholder': {
    color: 'var(--gol-text-secondary)',
    opacity: 0.8,
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
    borderColor: 'var(--gol-accent)',
    background: 'var(--gol-bg-hover)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

// Mockup: .search-icon (:169-176). `pointer-events: none` so the glyph never intercepts a click
// aimed at the input beneath it.
const SearchIcon = styled('span')({
  position: 'absolute',
  right: '14px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--gol-text-tertiary)',
  fontSize: '16px',
  pointerEvents: 'none',
});

// Mockup: .organism-count (:179-189). The one live region on the page (FD4) — SC 4.1.3 wants
// filter results announced, and the roster's zero-match message is deliberately NOT live
// (`deferred-work.md:327` records what that cost); announcing the zero-match text as well would
// double-announce the same result.
const CountBadge = styled('span')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  padding: '10px 14px',
  whiteSpace: 'nowrap',
});

// Mockup: .organism-grid (:191-197).
const CardGrid = styled('ul')({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '24px',
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

/** `4 Organisms` / `1 Organism` with no query, `2 of 4 Organisms` / `0 of 1 Organism` filtering. */
function organismCountLabel(shown: number, total: number, filtering: boolean): string {
  const suffix = `Organism${total === 1 ? '' : 's'}`;
  return filtering ? `${shown} of ${total} ${suffix}` : `${total} ${suffix}`;
}

/**
 * The page-boundary body for `/organisms`. `organisms` is injected, interface-typed (AR-2/AR-27)
 * — this component never imports a concrete repository or calls createRepositories().
 *
 * Since Story 4.3 it also renders the editor's entry point: the "+ Create New Organism" control
 * and the lazily loaded `<OrganismEditorModal>` it opens. Since Story 4.16 the modal receives
 * `organisms` — this SAME injected prop, typed to the interface — and, once the editor is
 * CLOSED, reports the last saved record back through `onSaved`: a `resource.reload()` (FD6) and
 * nothing else. Amended 2026-09-22 (Task 11): the outcome sentence itself moved INTO the editor
 * (`OrganismEditorModal`'s own `SaveOutcomeLine`) now that Save no longer closes it — this
 * component has no live region of its own to publish into any more.
 *
 * Since Story 4.17 every card carries an Edit action (FR-1.3): the Library derives the AR-15 usage
 * index from `battles.list()` and hands each click to the hook's `requestEdit` with the organism's
 * count — `0` opens the editor directly on the record, `≥ 1` opens the "Used in N Battles"
 * warning first. The editor receives the same `library` list for both modes and excludes the
 * organism under edit itself.
 *
 * Since Story 4.18 every card also carries a Clone action (FR-1.6): this component owns the ONE
 * `cloneOrganism` writer (FD3) both the card's Clone and the gate's Clone & Edit call — mint,
 * project (`cloneOrganismRecord`), `organisms.save()`, `reload()` — and the ONE `[data-clone-error]`
 * alert a refused write reports into.
 */
export default function OrganismLibrary({ organisms, battles, seedStatus }: OrganismLibraryProps) {
  // Deps: `organisms`/`battles` are useMemo-stable from the page boundary; `seedStatus` is a
  // string — all satisfy useAsyncResource's stable/fixed-length precondition. Re-running the
  // reads on the seedStatus flip is deliberate (Story 4.1): while seeding, the first read hits a
  // pre-seed store, so the dep re-runs it once the seed settles — one cheap extra localStorage
  // read (NFR-1.4) rather than threading a "skip" flag through the hook.
  //
  // ONE resource over BOTH lists (Story 4.17, FD2), not RFC-005 `:307-313`'s separate
  // `useOrganismUsage` sketch: `'ready'` must mean both lists are in hand, or an Edit clicked
  // while the battle list is still pending reads a usage of `0` and opens a placed organism with
  // no warning — silently. And no `.catch(() => [])` on `battles.list()` (the `<BattleGallery>`
  // idiom for the OTHER list): a swallowed rejection is the same silent `0`. `battles.list()`
  // rejects only on whole-key corruption of `gol:battles` (a bad RECORD is skipped by the
  // repository), the condition that already blanks the Gallery today, and Story 5.11 owns
  // load-time corruption UX — so it lands in the existing `'error'` state here.
  const resource = useAsyncResource(
    () => Promise.all([organisms.list(), battles.list()]),
    [organisms, battles, seedStatus],
  );
  const [loadedOrganisms, summaries] = resource.data ?? [[], []];
  // Once settled, `summaries` is referentially stable between loads (`resource.data` is one object
  // per settle), so this memo hits on every search keystroke and misses only on a (re)load. While
  // loading or in error the `[[], []]` fallback is a fresh tuple per render and the memo recomputes
  // an empty map each time — no cards render in those states, so nothing reads it.
  const usage = useMemo(() => buildUsageIndex(summaries), [summaries]);
  // Story 4.21: the Decision E.5 axis, memoized on the settled roster the same way `usage` is
  // memoized on `summaries` — both inputs come from the ONE resource above, so both memos hit and
  // miss together (open, save, close).
  const ruleIndex = useMemo(() => buildRuleReferenceIndex(loadedOrganisms), [loadedOrganisms]);

  // Ephemeral UI state only (RFC-005 Decision 1) — never persisted, never in a ref: this is not
  // hot simulation state.
  const [searchText, setSearchText] = useState('');

  // Story 4.16, FD6: `reload()` — stale-while-revalidate, so the grid and count badge stay
  // mounted through the refetch (no `'loading'` flash). Destructured because `reload`'s identity
  // is stable while `resource` itself is a fresh object every render — depending on the latter
  // re-created this callback on every render and re-ran the hook's `onSavedRef` effect with it
  // (review 2026-09-22).
  const { reload } = resource;
  // Amended 2026-09-22 (Task 11): the editor no longer closes on save, so this fires once, when
  // the user actually leaves the editor, with the LAST record saved in the session — a plain
  // reload, nothing else (the record itself is unused: TS allows a callback with fewer formal
  // parameters than the `onSaved?(organism: Organism)` option type). The outcome sentence itself
  // is the modal's own `SaveOutcomeLine` now.
  const onSaved = useCallback(() => {
    reload();
  }, [reload]);

  // Story 4.18: the clone id, not a boolean (FD5) — only the clicked card's Clone button disables;
  // disabling every card's for a sub-millisecond localStorage write would be a visible flicker
  // across the whole grid. `cloningRef` is the re-entrancy AUTHORITY (set synchronously, before any
  // await, and shared with the gate's Clone & Edit path so the two entry points cannot interleave);
  // `cloning` is only the affordance the disabled attribute reads.
  const cloningRef = useRef<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  // Story 4.18, owner decision 2026-09-23 (review decision 1, option 2). The writer QUEUES its
  // failure into a ref and a CALL SITE publishes it, once that call site's window is gone.
  // Publishing from the writer's `catch` — the shape before this decision — inserts the
  // `role="alert"` node into a subtree `useInertBackground` has already marked `inert` (and MUI
  // holds its own `aria-hidden` until the transition ends). A live region inserted into a hidden
  // subtree is dropped by assistive tech, and it stays hidden for the gate's whole ~195 ms fade —
  // many screen-reader observation cycles — so by the time the background is live the node is no
  // longer new and nothing announces it. Clone & Edit's failure was therefore never spoken.
  // The same defer-until-exited rule the hook already applies to `onSaved`
  // (`useOrganismEditorModal`'s `handleExited`, for this stated reason); the clone path simply had
  // not been given it.
  // A ref and not a state cell: nothing renders from the queue, only from `cloneError`, and the
  // publish happens in event callbacks where a render-time closure would be stale anyway.
  const queuedCloneErrorRef = useRef<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);

  // Rejected shapes, both of which lint or behaviour rules out:
  //   - an effect keyed on the mount flags — `react-hooks/set-state-in-effect` forbids it, rightly:
  //     it is a cascading render, and the transition is an EVENT (the exit finishing), not a
  //     synchronisation with an external system.
  //   - the derivation `editorMounted || gateMounted ? null : queued` — lint-clean and shorter, but
  //     it makes the alert vanish whenever ANY dialog opens and be re-INSERTED, hence re-announced,
  //     every time one closes. A stale clone failure would then nag once per dialog for the rest of
  //     the session (`deferred-work.md` already records that this alert clears only on the next
  //     attempt). Publishing once, from the call site, keeps the node's lifetime unchanged.
  const publishQueuedCloneError = useCallback(() => {
    const message = queuedCloneErrorRef.current;
    if (message === null) return;
    queuedCloneErrorRef.current = null;
    setCloneError(message);
  }, []);

  // Story 4.18, review 2026-09-22. Disabling a button that HOLDS focus blurs it: every browser
  // drops focus to `<body>` and none of them puts it back when the attribute clears. Measured in
  // Chromium against the built export — Enter on a card's Clone left `document.activeElement` as
  // `BODY`, so a keyboard user's next Tab restarted from the top of the document. The story's own
  // `deferred-work.md` entry asserts focus "stays on the Clone button"; this ref is what makes
  // that sentence true. Holds the id only when the button was focused when the write started (a
  // pointer click on WebKit does not focus it — then there is nothing to restore and we leave the
  // user's focus alone).
  const refocusCloneRef = useRef<string | null>(null);

  // Runs on the commit that clears `cloning` — i.e. the one that re-enables the button — so the
  // `.focus()` lands on an element that is no longer `disabled`. An effect, not a call inside the
  // writer's `finally`: there the button is still disabled and `.focus()` is a silent no-op.
  useEffect(() => {
    if (cloning !== null) return;
    const id = refocusCloneRef.current;
    if (id === null) return;
    refocusCloneRef.current = null;
    // `CSS.escape` for the same reason `useOrganismEditorModal`'s restore does: ids are arbitrary
    // non-empty strings, not uuids ('conways-classic' is the seeded one).
    document.querySelector<HTMLElement>(`[data-clone-organism-id="${CSS.escape(id)}"]`)?.focus();
  }, [cloning]);

  // Story 4.18, FD3: ONE writer for both entry points — the card's Clone and the gate's Clone &
  // Edit differ only in what happens AFTER the write. Mints both ids at the call site (as
  // `saveOrganism` mints the editor's — the repository mints none), projects through the pure,
  // synchronous `cloneOrganismRecord` (FD1), writes, and reloads HERE rather than from the editor's
  // `onSaved` (FD9): a Clone & Edit closed WITHOUT a save never fires `onSaved`, so the clone's card
  // would be missing until the next page load, and reloading here also means the editor's `library`
  // already holds the clone by the time it mounts. A rejection is REPORTED (this component owns the
  // alert) and returned as `null` — never rethrown into the hook, which owns no error surface.
  // "Reported" means QUEUED as of 2026-09-23: the message is published by the effect below the hook
  // call, not from the `catch`, so it is never inserted into an inert background. The `null` return
  // is unchanged, and so is the option contract it satisfies.
  const cloneOrganism = useCallback(
    async (source: Organism): Promise<Organism | null> => {
      if (cloningRef.current !== null) return null;
      cloningRef.current = source.id;
      // Captured BEFORE the `disabled` commit blurs it (review 2026-09-22; see `refocusCloneRef`).
      const active = document.activeElement;
      refocusCloneRef.current =
        active instanceof HTMLElement && active.dataset.cloneOrganismId === source.id
          ? source.id
          : null;
      setCloning(source.id);
      queuedCloneErrorRef.current = null;
      setCloneError(null);
      try {
        const clone = cloneOrganismRecord(source, crypto.randomUUID(), () => crypto.randomUUID());
        await organisms.save(clone);
        reload();
        return clone;
      } catch (error) {
        // Queued, never published here: the CALL SITE owns the timing, because only it knows which
        // window (if any) has to exit first. The writer cannot decide — `editorMounted`/
        // `gateMounted` come from the hook this very callback is an option to, so reading one here
        // would be the render-time-closure trap `gatePendingRef` documents.
        queuedCloneErrorRef.current = saveFailureMessage(error, 'organism');
        return null;
      } finally {
        cloningRef.current = null;
        setCloning(null);
      }
    },
    [organisms, reload],
  );

  // Called HERE, from the component that renders the modal, because the hook's effects have to be
  // the modal's PARENT effects to order correctly against MUI's focus trap. The hook's own header
  // records why it lives in `lib/organisms/` rather than beside the modal — the dynamic import
  // above is load-bearing and a static import of that module would defeat it.
  const {
    requestCreate,
    requestEdit,
    mounted: editorMounted,
    modalProps,
    gateMounted,
    gateProps,
  } = useOrganismEditorModal('library', { onSaved, onCloneAndEdit: cloneOrganism });

  // The gate's call site. `handleGateExited` FIRST — it is what unmounts the gate and releases
  // `inert` — then the publish, in the same event handler so React batches both into one commit:
  // the alert node is created in the very commit that makes this subtree live again, never before
  // it. (One commit, not two: assistive tech reads the accessibility tree after the task, so an
  // insert-and-reveal in a single flush is observed as a new live region in a visible tree. What
  // broke announcement was the node existing across the whole fade, through many such cycles.)
  // `onExited` is optional on the dialog's props, so this composes defensively — the hook does
  // supply it, and a build in which it stopped doing so must still publish the failure.
  const onGateExited = useCallback(() => {
    gateProps.onExited?.();
    publishQueuedCloneError();
  }, [gateProps, publishQueuedCloneError]);

  // Story 4.21, FD8: the hard-block dialog's own lifecycle, local to this component rather than
  // threaded through `useOrganismEditorModal` — that hook owns the editor/gate handoff, and the
  // delete block never opens the editor, so it has no use for a third window. The
  // `useDeleteBattleDialog` shape at smaller size: `blocked` is the data, held through the ~195ms
  // exit fade (the `confirming` / `battleName` precedent — the dialog must not flash empty on the
  // way out), `deleteDialogOpen` drives the fade alone.
  const [blocked, setBlocked] = useState<{
    organismId: string;
    organismName: string;
    battleNames: readonly string[];
    referencingNames: readonly string[];
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Called here, the modal's PARENT, for the same ordering reason `useDeleteBattleDialog` and
  // `useOrganismEditorModal` record at their own call sites: MUI's focus-trap move (a child
  // effect) must already have happened before a subtree is marked inert. A SEPARATE call from the
  // hook's own `useInertBackground(anyMounted)` — never folded into one union — because the two
  // windows never overlap: `requestDeleteOrganism` below bails while the editor or gate is
  // mounted, and `guardedCreate`/`onRequestEdit` bail while this window is (see
  // `deleteWindowRef`).
  //
  // ORDER IS LOAD-BEARING: this call sits ABOVE the focus-restore effect below, so on the commit
  // that clears `blocked` its cleanup (lifting `inert`) runs before that effect's `.focus()` — a
  // `.focus()` into a still-inert subtree is a silent no-op in a real browser.
  useInertBackground(blocked !== null);

  // Code review 2026-09-24: the delete window's AUTHORITY, set synchronously on the click and
  // cleared in `handleDeleteExited`. Not derivable from `blocked`'s render-time value in an async
  // callback (the clone `.then` below), and not from the inert background either: on the FIRST
  // Delete of a session the lazy dialog chunk is still loading, so no Modal has marked anything
  // `aria-hidden`, nothing is inert yet, and Create or another card's Edit is still clickable —
  // opening the editor under a block dialog about to land on top of it. The guards below close
  // that window.
  const deleteWindowRef = useRef(false);

  // Where focus is owed once the delete dialog's exit transition has finished — the DOM lookup
  // idiom every other close path in this file uses (FD9), never a captured element (WebKit does
  // not focus a `<button>` on click).
  const deleteRestoreIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (blocked !== null) return;
    const id = deleteRestoreIdRef.current;
    if (id === null) return;
    deleteRestoreIdRef.current = null;
    document.querySelector<HTMLElement>(`[data-delete-organism-id="${CSS.escape(id)}"]`)?.focus();
  }, [blocked]);

  // A card's Delete click (Story 4.21, FD7). `battles`/`referencing` are the SAME `blocked`
  // verdict's lists the card map below reads to decide whether to render the button at all —
  // never re-derived here (FD3) — and the names are resolved from `summaries`/`loadedOrganisms`,
  // the same settled data the verdict came from, never the search-filtered `visible` (FD7).
  //
  // Guarded against the editor or gate being mounted (review precedent: `requestCreate`/
  // `requestEdit`'s own `anyMounted` guard) — reachable only by a programmatic caller, since the
  // editor/gate's own inert background already makes every card's Delete button unreachable by a
  // real click while either is open.
  const requestDeleteOrganism = useCallback(
    (
      organism: Organism,
      battles: readonly OrganismUsageEntry[],
      referencing: readonly string[],
    ) => {
      if (editorMounted || gateMounted || deleteWindowRef.current) return;
      deleteWindowRef.current = true;
      deleteRestoreIdRef.current = organism.id;
      setBlocked({
        organismId: organism.id,
        organismName: toDisplayOrganism(organism).name,
        battleNames: usageBattleNames(battles, summaries),
        referencingNames: referencingOrganismNames(referencing, loadedOrganisms),
      });
      setDeleteDialogOpen(true);
    },
    [editorMounted, gateMounted, summaries, loadedOrganisms],
  );

  // Escape, backdrop and OK all route here (the dialog's ONE action, AC5) — nothing else moves,
  // nothing is written. `blocked` itself is cleared only once the exit transition has finished, so
  // the dialog's content stays populated through the fade.
  const handleDeleteClose = useCallback(() => setDeleteDialogOpen(false), []);
  // `setBlocked(null)` FIRST — it releases `inert` — then the queued card-Clone failure (a Clone
  // clicked on another card just before this Delete), in the same handler so both land in ONE
  // commit: the `onGateExited` rule, "publish once your window is gone", applied to this window.
  const handleDeleteExited = useCallback(() => {
    deleteWindowRef.current = false;
    setBlocked(null);
    publishQueuedCloneError();
  }, [publishQueuedCloneError]);

  // Create's call site: bails while the delete window is open (see `deleteWindowRef`).
  const guardedCreate = useCallback(() => {
    if (deleteWindowRef.current) return;
    requestCreate();
  }, [requestCreate]);

  // Story 4.17, AC1: the count is the number of DISTINCT saved battles whose placed set holds the
  // id (Decision H: "used" = placed) — read from the SAME settled list the page holds.
  //
  // ⚠️ Through `resolveOrganismUsage`, not `usage.get(id)?.length` (Story 4.20, AC5 / FD8). The two
  // return the same number today, for exactly as long as no caller passes an `openBattle` — so the
  // move is free NOW and is what keeps this warning, the editor footer and (Story 4.21) the delete
  // block on ONE derivation with ONE argument for Story 4.24 to add. Left on the raw map read, this
  // surface would start disagreeing with the others the moment 4.24 lands, which is precisely the
  // failure the AC's "counts are consistent across all surfaces" exists to prevent.
  //
  // Bails while the delete window is open (Story 4.21 code review; see `deleteWindowRef`).
  const onRequestEdit = useCallback(
    (organism: Organism) => {
      if (deleteWindowRef.current) return;
      requestEdit(organism, resolveOrganismUsage(usage, organism.id).length);
    },
    [requestEdit, usage],
  );

  // Folded at render, exactly as BattleGallery folds seedStatus against its own load state
  // (Story 4.1) — never written into the resource itself, which would risk a cascading setState.
  const status: 'loading' | 'error' | 'ready' =
    seedStatus === 'error' || resource.status === 'error'
      ? 'error'
      : seedStatus === 'seeding' || resource.status === 'loading'
        ? 'loading'
        : 'ready';

  // AC3's grid order is a pure, unit-tested function (`sortLibrary`) — never `Object.values`
  // insertion order (FD2). AC4's filter matches on the DISPLAYED name, via the same
  // `organismNameMatches` predicate `<OrganismRoster>` uses (resolving `deferred-work.md:335`),
  // so `Unnamed organism` is searchable as what the user actually sees.
  //
  // ⚠️ UNMEMOISED, ON PURPOSE — the identical per-render-scan measurement `<OrganismRoster>`'s
  // `<OrganismSearchAdd>` already closed for this exact shape of predicate over an uncapped
  // library (`deferred-work.md:337`, ~0.02-0.04 ms for 1,000 organisms): far past any realistic
  // workspace, and roughly one keystroke's worth of budget for a scan that runs once per render.
  const sorted = sortLibrary(loadedOrganisms);
  const query = normalizeOrganismSearch(searchText);
  const visible =
    query === ''
      ? sorted
      : sorted.filter((organism) => organismNameMatches(toDisplayOrganism(organism).name, query));

  return (
    <section aria-labelledby={HEADING_ID}>
      <SectionHeader>
        <SectionTitle id={HEADING_ID}>Organism Library</SectionTitle>
        <SectionSubtitle>Create and manage your life forms</SectionSubtitle>
      </SectionHeader>
      {/* OUTSIDE the aria-busy wrapper below (deferred-work.md:187's mistake, not repeated here):
          the create button and the search input must never be withheld from the accessibility
          tree while the list loads, and the input must never unmount under the user's focus
          (deferred-work.md:327's trap, FD4). The count badge is deliberately NOT rendered until
          `ready` — there is no count to announce before the list exists, and an empty live region
          would misreport the page's state. */}
      <Toolbar>
        <ToolbarLeft>
          {/* First in the group, as the mockup has it (:405-406) — so DOM order matches the
              visual order and the button is the toolbar's first Tab stop. Rendered in EVERY
              status: creating an organism does not depend on the list having loaded.
              `data-create-organism` is the focus-restore anchor `useOrganismEditorModal` looks up
              by DOM query once the modal's exit transition ends (never a captured element — WebKit
              does not focus a <button> on click). */}
          <CreateButton type="button" onClick={guardedCreate} data-create-organism="">
            + Create New Organism
          </CreateButton>
          <SearchField role="search">
            <SearchInput
              type="text"
              placeholder="Search organisms..."
              aria-label="Search organisms"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <SearchIcon aria-hidden="true">⌕</SearchIcon>
          </SearchField>
        </ToolbarLeft>
        {status === 'ready' && (
          <CountBadge role="status">
            {organismCountLabel(visible.length, sorted.length, query !== '')}
          </CountBadge>
        )}
      </Toolbar>
      {/* Story 4.18, AC10/FD10: OUTSIDE the aria-busy wrapper, the same reason the toolbar is — a
          refused clone must not be withheld while a reload is in flight. `role="alert"`, never a
          second `role="status"`: the count badge above is the page's only status node, and
          `e2e/organisms.spec.ts`'s `countBadge = page.getByRole('status')` is unscoped, so a second
          one would turn every 4.16/4.17 badge assertion into a strict-mode failure. Success gets no
          sentence of its own — the new card and the badge's own count change are already the
          announcement.
          Owner decision 2026-09-23: FD10's success clause is accepted as written for Clone & Edit
          too, even though the same inert background suppresses the badge's count change there. That
          path is not silent — the editor opens with focus inside it and the name field holding
          `<name> (Copy)`, and a dialog taking focus is a context change assistive tech announces.
          Inventing success copy with no spec behind it is what FD10 refuses. `cloneError` is the
          PUBLISHED cell, not the queued one — see `queuedCloneError`. */}
      {cloneError !== null && (
        <StatusText role="alert" data-clone-error>
          {cloneError}
        </StatusText>
      )}
      <div aria-busy={status === 'loading'}>
        {status === 'loading' && <StatusText>Loading organisms…</StatusText>}
        {status === 'error' && (
          <StatusText role="alert">Something went wrong loading your organisms.</StatusText>
        )}
        {status === 'ready' &&
          (visible.length === 0 && query !== '' ? (
            // The search input stays in the toolbar above, so it survives this branch with focus
            // intact (deferred-work.md:327's exact failure, not repeated here).
            <StatusText>No organisms match “{searchText}”.</StatusText>
          ) : (
            // `visible.length === 0 && query === ''` cannot happen — the library is never empty
            // (M9, Conway's Classic is always present) — so no branch exists for it.
            <CardGrid role="list" aria-label="Organisms">
              {visible.map((organism) => {
                // Story 4.21: two map reads per card, the same class as the unmemoised filter scan
                // above (FD6's Dev Notes) — no per-card memo. `protected`/`allowed` render no
                // Delete at all in this story (FD2); only `blocked` does.
                const verdict = organismDeleteVerdict(organism.id, usage, ruleIndex);
                return (
                  <li key={organism.id}>
                    <OrganismCard
                      organism={organism}
                      system={organism.id === CONWAYS_CLASSIC_ID}
                      onRequestEdit={() => onRequestEdit(organism)}
                      cloning={cloning === organism.id}
                      // The card's call site: no window has to exit first, so the queued failure is
                      // published as soon as the write settles. Same rule as the gate's `onExited`
                      // below — "publish once your window is gone" — and this entry point has none,
                      // UNLESS a Delete on another card opened the block dialog while the write
                      // was pending: then `handleDeleteExited` publishes it (Story 4.21 review).
                      onRequestClone={() => {
                        void cloneOrganism(organism).then(() => {
                          if (!deleteWindowRef.current) publishQueuedCloneError();
                        });
                      }}
                      onRequestDelete={
                        verdict.kind === 'blocked'
                          ? () =>
                              requestDeleteOrganism(
                                organism,
                                verdict.battles,
                                verdict.referencingOrganismIds,
                              )
                          : undefined
                      }
                    />
                  </li>
                );
              })}
            </CardGrid>
          ))}
      </div>
      {/* Gated on `mounted`, not `open`, so the chunk is fetched on the first open only and the
          fade-out completes before unmount (the `useLeaveGuard` contract). The Dialog portals to
          `document.body` regardless of where this sits in the tree. */}
      {/* `sorted` is the same list the cards render, so the editor's default colour is derived
          from exactly what the user sees (Story 4.8); unmemoised because the modal reads it once
          (Story 4.9 reads it per render and that is still one prop). `organisms` is the SAME prop
          this component received (Story 4.16, AR-2/AR-27) — the modal's only side effect. */}
      {/* `battleSummaries` is the SAME settled array `usage` above is built from (Story 4.20, AC6),
          so the footer's count and this component's edit warning read one source — data, never the
          `battles` repository, which stays at this boundary (AR-2/AR-27). */}
      {editorMounted && (
        <OrganismEditorModal
          {...modalProps}
          library={sorted}
          battleSummaries={summaries}
          organisms={organisms}
        />
      )}
      {/* Story 4.17: the in-use gate, mounted on ITS window (the hook's `gateMounted`), for the
          same fetch-on-first-open / fade-before-unmount reasons as the editor above. */}
      {gateMounted && <OrganismInUseDialog {...gateProps} onExited={onGateExited} />}
      {/* Story 4.21: the hard-block dialog, mounted on `blocked !== null` — the same
          fetch-on-first-open / fade-before-unmount shape, on its own window. */}
      {blocked !== null && (
        <OrganismDeleteBlockedDialog
          open={deleteDialogOpen}
          organismName={blocked.organismName}
          battleNames={blocked.battleNames}
          referencingNames={blocked.referencingNames}
          onClose={handleDeleteClose}
          onExited={handleDeleteExited}
        />
      )}
    </section>
  );
}
