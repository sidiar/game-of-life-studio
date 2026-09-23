'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import {
  buildRuleReferenceIndex,
  buildUsageIndex,
  referencingOrganismIds,
  resolveOrganismUsage,
  type BattleSummary,
  type Organism,
} from '@gol/domain';
import type { OrganismRepository } from '@gol/persistence';
// Static imports, not a second `dynamic()`: this file is already inside the lazy chunk
// `<OrganismLibrary>` draws, so the layout, the field and the draft factory ride along with it and
// a nested lazy boundary would split a chunk for nothing. ❌ None of these may be imported from
// `OrganismLibrary.tsx` or `useOrganismEditorModal.ts` — that would pull them into `/organisms`'s
// first load (the bundle gate is the measurement).
import OrganismEditorLayout from './OrganismEditorLayout';
import OrganismNameField from './OrganismNameField';
import ColorPickerField from './ColorPickerField';
import DominanceField from './DominanceField';
import AgingToggleField from './AgingToggleField';
import AddRuleButton from './AddRuleButton';
import RulesEditor from './RulesEditor';
import PreviewPanel from './PreviewPanel';
import UsageIndicator from './UsageIndicator';
import {
  createNewOrganismDraft,
  organismDraftFrom,
  validateOrganismDraft,
  type DraftErrorTarget,
  type OrganismDraft,
} from '@/lib/organisms/organismDraft';
import { usersByColorToken } from '@/lib/organisms/colorReuse';
import { appendRule, createNewRuleDraft, type RuleDraft } from '@/lib/organisms/ruleDraft';
import { readGridColors } from '@/lib/canvas/themeColors';
import { projectOrganismForSave } from '@/lib/organisms/organismRecord';
import { saveFailureMessage } from '@/lib/saveFailureMessage';
import { saveOutcomeMessage } from '@/lib/organisms/saveOutcome';
import { referencingOrganismNames, usageBattleNames } from '@/lib/organisms/usageLabels';

// Per-component imports only (AR-35) — `import { Dialog } from '@mui/material'` pulls the whole
// barrel. On this route that is not merely a convention: `<OrganismLibrary>` reaches this file
// through `next/dynamic` rather than a static import, precisely so the MUI `Dialog` stack stays
// out of `/organisms`'s first load. See that call site for the measurement.

const TITLE_ID = 'organism-editor-title';

// Pulled out of the theme's MuiButton root override for the same reason the three shipped dialogs
// record: on `root` they apply to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

// Story 4.16, FD8: `deferred-work.md:795-801` named this story as the first MUI `Button` whose
// `disabled` flips on an axe-scanned route. MUI `Button` ships a 250ms `background-color`/`color`
// transition, and an axe scan landing mid-fade measures a contrast no settled state has
// (`EditorStatusBar.tsx` UNDO/SAVE record the identical trap). The disabled window is the
// projection (one `crypto.subtle.digest` per rule) plus the write — a few milliseconds against
// localStorage, a round-trip against an API repository — and a failed write re-enables the button
// with the dialog still open and the e2e scanning right after; the override costs nothing and
// removes the whole class of failure.
const SAVE_SX = { ...BUTTON_SX, transition: 'none' } as const;

export type OrganismEditorOrigin = 'library' | 'battle';

/** The lifecycle half — what `useOrganismEditorModal` assembles and nothing more. */
export interface OrganismEditorLifecycleProps {
  open: boolean;
  /** Drives the contextual back label (UX-DR5). 'battle' is Story 4.24's entry point. */
  origin: OrganismEditorOrigin;
  /**
   * `null` is a create; a record is an edit session on THAT organism (Story 4.17). Held by
   * `useOrganismEditorModal` for the whole mount — through the exit fade, the `<DeleteBattleDialog>`
   * `confirming` lesson: the `mounted` gate keeps this modal alive ~195 ms after close, and a
   * record emptied at close would re-seed nothing. Read at mount for the seed and the
   * `saveStamp`, and on every render for `others` (the library minus self) — which is only
   * coherent because the hook never changes it while this modal is mounted (`requestEdit` is a
   * no-op during that window). The whole mode switch: no title change, no `mode` prop.
   */
  organism: Organism | null;
  /** Close ✕, the back label and Escape all route here. Story 4.23 guards it. */
  onClose(): void;
  /**
   * Fired once the exit transition has finished — the parent hook's cue to release `inert` and
   * restore focus (the `<UnsavedChangesDialog>` contract).
   */
  onExited?(): void;
  /**
   * The write succeeded (Story 4.16). Amended 2026-09-22 (Task 11, AC3): the parent hook now only
   * STASHES the record — it does NOT close the dialog. The editor stays open so a later Save in
   * the same session updates the SAME organism (`saveStamp`, below). Only when the user actually
   * closes (Back / Escape / ✕) does the hook hand the LAST saved record on to the caller's own
   * `onSaved`, once the exit transition has finished (FD4) — a close without any save in the
   * session hands nothing on.
   */
  onSaved(organism: Organism): void;
}

export interface OrganismEditorModalProps extends OrganismEditorLifecycleProps {
  /**
   * The loaded library — an entity list, never a repository (AR-2/AR-27: this modal still calls
   * nothing that persists through it). Read ONCE, at mount, for the M6 default-colour seed
   * (Story 4.8) and on EVERY render for the reuse warning (Story 4.9) and the organism-type
   * dropdown (Story 4.11), both of which see it MINUS the organism under edit (`others`, below —
   * Story 4.17). The caller passes the whole loaded list, unchanged, for both modes. The seed is
   * taken from whatever the caller had loaded at open time (FD9).
   */
  library: readonly Organism[];
  /**
   * The loaded battle summaries, for FR-1.7's "Used in [N] Battle(s)" footer (Story 4.20, AC6) —
   * DATA, exactly as `library` is data.
   *
   * ❌ Not a `BattleRepository`, not `createRepositories()`, not a `battles.list()` from inside this
   * modal (AR-2/AR-27): `organisms` below stays the editor's only injected repository and its only
   * side effect. `<OrganismLibrary>` already holds these summaries — it builds the same usage index
   * from them for the Story 4.17 edit warning — so passing the settled array is what makes the two
   * surfaces' counts one derivation rather than two agreeing by coincidence (FD8). This closes
   * `deferred-work.md`'s "Story 4.20 … will need `battles` on the modal too": it needs the battle
   * LIST, which is not the same claim.
   *
   * `Pick<…>` because that is all the footer reads — the ids the index is keyed on, `organismIds`
   * for the placed set (Decision H.1) and `name` for the panel. A full `BattleSummary[]` still
   * assigns, and a test can pass literals.
   *
   * The values are the OPEN-TIME snapshot, like `library`: `<OrganismLibrary>`'s hook reloads only
   * after this modal closes (Story 4.16, Task 11), nothing here can change a battle, and a
   * just-saved new organism is in no battle — so there is nothing to refresh and no reload to add
   * (FD7).
   */
  battleSummaries: readonly Pick<BattleSummary, 'id' | 'name' | 'organismIds'>[];
  /**
   * The modal's only side effect (Story 4.16, AR-2/AR-27): interface-typed, injected from
   * `<OrganismLibrary>`, which received it from the page boundary's one `createRepositories()`.
   * Never a concrete repository, never `createRepositories()` called from here.
   */
  organisms: OrganismRepository;
}

/**
 * The contextual back label, a pure function of where the editor was opened from (UX-DR5).
 * Exported so the test pins both values without having to reach the `'battle'` origin through UI
 * — nothing renders it until Story 4.24 mounts this modal over `<BattlePage>` (M5).
 */
export function backLabelFor(origin: OrganismEditorOrigin): string {
  return origin === 'battle' ? 'Back to Battle' : 'Back to Library';
}

// Mockup: `.editor-overlay` (`clinical-lab-theme/organism-editor.html:32-38`). The paper is already
// 100% of the viewport under `fullScreen`, so `height: 100%` — the mockup's `100vh` is a page
// overlay's measure, not a dialog paper's.
const Shell = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--gol-bg-primary)',
});

// Mockup: `.editor-header` (`:40-48`), as a three-slot grid rather than the mockup's flex row so
// the title stays centred regardless of how wide the back control and the action pair are.
const EditorHeader = styled('header')({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: '20px',
  background: 'var(--gol-bg-primary)',
  borderBottom: '1px solid var(--gol-border)',
  padding: '20px 30px',
  flexShrink: 0,
});

// `<SidebarFooter>`'s `BackButton` minus `width: 100%` — this one sits in a grid slot, not a
// column footer — with the same two settled substitutions: `--gol-border-control` for the button's
// only boundary (SC 1.4.11 — the decorative `--gol-border` measures 1.57:1), and NO `transition`
// (the mockup's `transition: all 0.2s` is what an axe scan landing mid-fade measures at a ratio no
// settled state has — Story 2.13, Story 2.14 and Story 2.15 each lost one here).
const BackButton = styled('button')({
  justifySelf: 'start',
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '10px 20px',
  fontSize: '11px',
  fontWeight: 600,
  // The DOM text is sentence case and CSS uppercases it, so the accessible name stays
  // "Back to Library" while the mockup's "BACK TO LIBRARY" is what renders.
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  '&:hover:not(:disabled)': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-text-secondary)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  // Task 12 locks this button while a write is in flight; the pre-validated disabled trio every
  // Back control on the battle route wears (`<SidebarFooter>`), so the lock is visible rather
  // than a live-looking button that ignores the click (review 2026-09-22).
  '&:disabled': {
    background: 'var(--gol-action-disabled-bg)',
    borderColor: 'var(--gol-border)',
    color: 'var(--gol-action-disabled)',
    cursor: 'not-allowed',
  },
});

// `<BattleHeader>`'s `Title`, as an `<h2>`: the page's `<h1>` is aria-hidden behind the modal but
// is still the document's, and the Gallery's delete dialog already proves an `<h2>` over an
// aria-hidden `<h1>` passes axe's heading-order rule on every Playwright project.
const Title = styled('h2')({
  justifySelf: 'center',
  textAlign: 'center',
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
  letterSpacing: 'var(--gol-letter-spacing-title)',
  color: 'var(--gol-text-primary)',
  textTransform: 'uppercase',
});

const Actions = styled('div')({
  justifySelf: 'end',
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
});

// A flex row whose only item is the layout's root (Story 4.4). `minHeight: 0` is what lets the
// columns' own scroll regions shrink inside the flex column.
const EditorBody = styled('div')({
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
  minHeight: 0,
});

// Mockup: `.editor-footer` (`organism-editor.html:818-828`), minus its `display: flex` /
// `justify-content: space-between` — those exist there to push the mockup's Save button to the far
// end, and Save stays in the header (FD1). `<UsageIndicator>` owns the row inside.
//
// ⚠️ FD2: the mockup's comment scopes this footer to "main content area, not under sidebar" because
// the mockup has a left SIDEBAR with its own footer holding Back. This editor has no sidebar footer
// (Back is in the header, Story 4.3), so scoping the footer to the middle columns would put it
// under a column boundary that means nothing here. Full width, `flexShrink: 0`, the same `Shell`
// flex chain `EditorHeader` sits at the top of.
const EditorFooter = styled('footer')({
  background: 'var(--gol-bg-secondary)',
  borderTop: '1px solid var(--gol-border)',
  padding: '15px 30px',
  flexShrink: 0,
});

// Story 4.16, AC5, FD7: the in-modal failure line. `BattleEditorView.tsx:376-400`'s
// `<SaveErrorLine>` shape (`role="alert"`, conditionally mounted) with `SaveNotice`'s old
// `padding: '10px 30px'` and `borderBottom` (it sits under the header, not above a status bar).
const SaveErrorLine = styled('p')({
  margin: 0,
  padding: '10px 30px',
  fontSize: '12px',
  lineHeight: 1.5,
  color: 'var(--gol-danger)',
  background: 'var(--gol-bg-secondary)',
  borderBottom: '1px solid var(--gol-border)',
});

// Story 4.16, FD5 / Task 11 (2026-09-22): the "toast" is the house's in-flow status line, moved
// INTO the editor now that Save no longer closes it — verbatim from `<OrganismLibrary>`, which no
// longer has a publisher for it. Structurally the `ColorPickerField.tsx:380-390` idiom: an
// always-mounted `role="status"` region whose child mounts with the sentence. Not MUI `Snackbar`,
// no floating layer, no auto-dismiss.
const SaveOutcomeLine = styled('p')({
  margin: '0 0 25px',
  padding: '10px 14px',
  fontSize: '12px',
  lineHeight: 1.5,
  color: 'var(--gol-text-primary)',
  background: 'var(--gol-bg-secondary)',
  borderLeft: '2px solid var(--gol-accent)',
  overflowWrap: 'anywhere',
});

/** The control that FIXES the error, for `focus()` — not merely the nearest element. Ids through
 * `CSS.escape` (Story 4.17 seeds them from records). A `pair` error lands on Min: the message
 * names both, the first is where the user starts. */
export function errorTargetSelector(target: DraftErrorTarget): string {
  switch (target.kind) {
    case 'name':
      return '[data-organism-name]';
    case 'rule':
      return `[data-rule-id="${CSS.escape(target.ruleId)}"] [data-add-condition]`;
    case 'condition': {
      const field = target.field === 'pair' ? 'min' : target.field;
      return `[data-rule-id="${CSS.escape(target.ruleId)}"] [data-condition-id="${CSS.escape(target.conditionId)}"] [data-condition-${field}]`;
    }
  }
}

/**
 * The Organism Editor's full-screen shell (Story 4.3): the `Dialog`, its header and a body that is
 * `<OrganismEditorLayout>`'s three columns (Story 4.4). Holds the editor's draft (`OrganismDraft`,
 * RFC-005 Decision 1 — ephemeral UI state, local to the modal; Story 4.5's `name`, Story 4.6's
 * `dominance`, Story 4.7's `agingEnabled`/`colorToken`, Story 4.8's `colorToken` seed from
 * `library` and Story 4.10's `survivalRules`, Story 4.12's order) and its seed — no repository
 * call. Story 4.14's preview panel reads `colorToken`/`agingEnabled` and holds its own grid (M3);
 * Story 4.15's run reads `survivalRules` and compiles them for the next Play — eagerly, on every
 * at-rest change; never mid-run (FD2). The lifecycle (inert
 * window, focus restore) stays `useOrganismEditorModal`'s, and a fresh
 * draft per open is the `mounted` gate's doing (`<OrganismLibrary>` unmounts this modal after
 * every exit, so there is no reset effect and no `key` trick). The `useState` initialiser closes
 * over the `library` prop — legitimate because it runs once per mount and the `mounted` gate
 * guarantees a mount per open. The editor's own dirty scope (AR-33 — independent of the battle's)
 * arrives with Story 4.23, will live in this shell, and will diff this draft against its seed.
 *
 * Header layout follows the epics AC / UX-DR5 (`organism-editor-design.md:101-126`): Back on the
 * left, centred title, Save + Close on the right. ⚠️ The 2026-06-01 mockup revision
 * (`ORGANISM-EDITOR-UPDATES.md:9-20`, `organism-editor.html:895-903,1222-1234`) moved the name into
 * the header, Back into the sidebar footer and Save into an editor footer; the AC is the story's
 * authority and the divergence is recorded in `deferred-work.md` for the next UX touch rather than
 * resolved here — moving Save now would rewrite a shipped header, three e2e tests and the `SAVE_SX`
 * mid-fade fix for a change no AC asks for.
 *
 * Story 4.20 builds the footer that comment once said was still to come: a full-width `<footer>`
 * after the body holding `<UsageIndicator>` and nothing else — FR-1.7's "Used in [N] Battle(s)" /
 * "Targeted by [M] organism rule(s)", each a read-only disclosure of the names behind its count
 * (UX-DR6: persistent, in both create and edit sessions). Save did NOT move into it and the name did
 * NOT move into the header, so the divergence above stands as recorded, for the next UX touch.
 *
 * The `'battle'` origin (M5 — the editor opens as a modal over the mounted battle, never a route)
 * changes only the back label; Story 4.24 is its first caller. Reached from the Library via the
 * "+ Create New Organism" control (FR-1.2).
 *
 * Story 4.13's gate (`validateOrganismDraft`, `saveAttempted`, focus-to-first-invalid): Save runs
 * `validateOrganismDraft(draft)`; an invalid draft flips `saveAttempted` (sticky across value
 * edits, deletes and reorders; cleared only by a structural add — a new rule or a new condition
 * row — in the synchronous commit that follows the add, FD3) and focuses the first error's control.
 * A valid draft now WRITES (Story 4.16): `projectOrganismForSave` → `organisms.save()` → the
 * in-flow `SaveOutcomeLine` status on success or the `SaveErrorLine` alert on a rejection — the
 * editor STAYS OPEN either way (AC3, amended 2026-09-22, Task 11: the owner's "match the Battle
 * Editor" call). A later Save in the same session reuses the first success's id (`saveStamp`), so
 * it updates the same organism; the parent hook only hands the record on to the Library, and
 * Back/Escape/✕ are locked while a write is in flight (Task 12), when the editor is eventually
 * closed.
 *
 * An edit session (Story 4.17) is the same shell with `organism` set: the seed is
 * `organismDraftFrom(organism)` instead of the create factory, `saveStamp` carries `organism.id`
 * from mount so the FIRST Save already upserts the opened record, and the two library views — the
 * colour-reuse warning and the organism-type dropdown — see `others`, the library minus the
 * organism under edit (an organism must never warn about its own colour, and RFC-004 §2.1.1's
 * `organismType` names a specific OTHER organism). Everything else — the gate, the write, the
 * close-lock, the outcome lines, the preview — is byte-identical. (Story 4.13) (UX-DR14)
 * (UX-DR17) (Story 4.14) (Story 4.15) (Story 4.16) (Story 4.17)
 */
export default function OrganismEditorModal({
  open,
  origin,
  organism,
  onClose,
  onExited,
  onSaved,
  library,
  battleSummaries,
  organisms,
}: OrganismEditorModalProps) {
  // The lazy-initialiser form, so the factory runs once per mount, not once per render — reading
  // `library` exactly once, at mount, for the M6 default-colour seed (FD9). One typed object that
  // grows a field per story (FD3), never one `useState` per field.
  //
  // The seed is held, not recomputed: it is what Story 4.23 diffs the draft against (the factory's
  // own contract — "the draft is diffed against its seed"), and it is what makes the FR-2.3 rule
  // "the default never warns" a token comparison rather than a flag (Story 4.9, FD2). An edit
  // session (Story 4.17) seeds from the record instead. That branch is IMPURE (it mints condition
  // ids through `crypto.randomUUID()`), which is fine for a lazy initialiser and would not be for
  // an updater: React keeps exactly ONE result of the initialiser, and `draft` below is initialised
  // from `seed`'s VALUE, so the two cannot disagree about which ids the rows carry.
  const [seed] = useState<OrganismDraft>(() =>
    organism === null
      ? createNewOrganismDraft(library.map((entry) => entry.colorToken))
      : organismDraftFrom(organism, () => crypto.randomUUID()),
  );
  const [draft, setDraft] = useState<OrganismDraft>(seed);
  // Story 4.13 — the Save gate's own ephemeral UI state (RFC-005 Decision 1 / AR-33): the draft
  // object itself is NOT widened with validation state. `shellRef` scopes the focus effect's
  // lookup to this modal's own DOM (the dialog portals to `document.body`, and the house forbids
  // `document.querySelector` from components — `<RulesEditor>`'s rule).
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{
    seq: number;
    target: DraftErrorTarget;
  } | null>(null);
  // Story 4.16, AC5 / FD7: the write's own ephemeral UI state (RFC-005 Decision 1 / AR-33) — none
  // of it lives on the draft. `null` is "nothing to report", never `''`.
  const [saveError, setSaveError] = useState<string | null>(null);
  // AC2: Save is `disabled` for the duration of the write. Task 11 (2026-09-22) supersedes the
  // earlier review's "hold after a success until unmount": the dialog no longer closes on save,
  // so there is no exit-fade window for a released button to be double-clicked through — Save is
  // released on BOTH outcomes, in `finally`. `savingRef` is still the re-entrancy guard a second
  // click races against — `organisms.save()` is a whole-collection read-modify-write over one key
  // (Story 2.13 AC4's reason) — and, as of Task 12, the guard the close channel checks too.
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  // Story 4.16, AC3 (Task 11): the id a later Save in THIS session reuses, so a second write
  // upserts the same organism instead of minting a sibling — `organisms.save()` upserts by id.
  // For a create: set once, on the first success (`saveOrganism` guards the set on `null`); read
  // back — never overwritten with a fresh uuid — for the rest of the mount. An edit session
  // (Story 4.17) is stamped FROM MOUNT with the opened record's id, so its first Save is already an
  // upsert of that organism and the `null` guard is simply never true for it. The record's
  // `schemaVersion` is not carried over: `projectOrganismForSave` restamps `ORGANISM_SCHEMA_VERSION`
  // (Decision I.4 — the version is a stamp of the shape the record was WRITTEN in, and the
  // projection's final `OrganismSchema.parse` proves that shape is the current one).
  const [saveStamp, setSaveStamp] = useState<{ id: string } | null>(
    organism === null ? null : { id: organism.id },
  );
  // The success half of the in-flow outcome pair; `saveError` is the failure half. `null` is
  // "nothing to report" — the same idiom as `saveError`. Never both set at once (Task 11).
  const [saveOutcome, setSaveOutcome] = useState<string | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  // Bumped once per settled attempt (success or failure) so an effect can move focus back to Save
  // AFTER the DOM has committed `disabled={false}` — a synchronous `focus()` call, before that
  // commit, targets a still-disabled button and is a spec-mandated no-op (the same ordering
  // problem the `focusRequest` effect below solves for the refusal branch). Keyed on a counter,
  // not on `isSaving` itself, so the initial mount (already `isSaving === false`) never steals
  // focus from wherever the page put it.
  const [saveSettledSeq, setSaveSettledSeq] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  // The library MINUS the organism under edit (Story 4.17) — what BOTH library views read: the
  // colour-reuse warning (an organism must never warn about its own colour — `seedValue` is the
  // record's token, and a re-pick of it stays silent by the same comparison) and the organism-type
  // dropdown (RFC-004 §2.1.1: `organismType` names a specific OTHER organism; the create flow has
  // never listed self). Derived HERE, not by the caller, because this is the component that knows
  // `organism`, so the Library keeps passing one list with one meaning. Per render, unmemoised:
  // `library` is the caller's unmemoised `sorted` (a `useMemo` keyed on it would never hit), and
  // the scan is 0.02–0.04 ms at 1,000 organisms (Story 3.7's `library-filter` bench).
  const others = organism === null ? library : library.filter((entry) => entry.id !== organism.id);
  const usersByToken = usersByColorToken(others);
  // Story 4.20 — FR-1.7's footer, derived HERE and handed to `<UsageIndicator>` as resolved names
  // and one number (FD11: the derivations are the modal's, the presentation is the component's).
  //
  // The subject is the organism the footer is ABOUT: the record in an edit session, or — after the
  // first successful Save of a create — the id that write stamped, so the footer starts answering
  // for the organism that now exists. `null` until then, and a `null` subject is `0`/`0` with no
  // special case (AC8, FD7).
  const subjectId = organism?.id ?? saveStamp?.id ?? null;
  // Memoised at the CALL SITE, never inside `@gol/domain` — that package memoizes nothing,
  // deliberately (RFC-005 Decision 8: a cache there would be module-level state under a
  // `"sideEffects": false` contract). `battleSummaries` is the caller's settled array and is
  // referentially stable between loads, so this memo really does hit; the rule index is keyed on
  // `library`, which is the caller's unmemoised `sorted`, so it re-runs per render — the same scan
  // `others` above already accepts on the same measurement (Story 3.7's `library-filter` bench).
  const usageIndex = useMemo(() => buildUsageIndex(battleSummaries), [battleSummaries]);
  const ruleIndex = useMemo(() => buildRuleReferenceIndex(library), [library]);
  // ⚠️ `resolveOrganismUsage(...).length`, never `usageIndex.get(id)?.length` (AC5, FD8). The two
  // return the same number for exactly as long as no caller passes an `openBattle`; Story 4.24 will
  // pass one, and whichever surface was left on the raw map read starts disagreeing with the others
  // at that moment. No `openBattle` argument here: nothing that mounts this editor has a live grid
  // until 4.24 opens it over `<BattlePage>`, and a prop every caller passes as `undefined` is the
  // unread prop this repo already refused once (FD9).
  const usageEntries = subjectId === null ? [] : resolveOrganismUsage(usageIndex, subjectId);
  // ⚠️ M counts RULES (the index's value array is per rule) while the panel below lists ORGANISMS
  // (`referencingOrganismIds` de-duplicates). One organism targeting this one from two rules is
  // M = 2 with ONE name — the two numbers `ruleReferenceIndex.ts`'s head comment separates (FD13).
  const ruleCount = subjectId === null ? 0 : (ruleIndex.get(subjectId)?.length ?? 0);
  // ⚠️ `library`, not `others`: `others` exists to keep an organism from warning about its own
  // colour and from targeting itself in the dropdown, and passing it here would DROP a legitimate
  // name whenever the referencing organism is the one being resolved. Self-references are already
  // excluded inside `buildRuleReferenceIndex` (Decision E.5), so nothing is filtered twice (FD14).
  const referencingNames =
    subjectId === null
      ? []
      : referencingOrganismNames(referencingOrganismIds(ruleIndex, subjectId), library);
  // Story 4.14: resolved ONCE here (`getComputedStyle` forces a style recalculation) and passed
  // down to `<PreviewPanel>` — the `<BattlePage>` form (`BattlePage.tsx:420-427`). `document` is
  // guarded for the prerender even though this file is `ssr: false` (the house form, costs
  // nothing); `documentElement`, not `shellRef.current`, because the dialog portals to
  // `document.body` while the `--gol-*` tokens sit on bare `:root`.
  const colors = useMemo(
    () => (typeof document === 'undefined' ? null : readGridColors(document.documentElement)),
    [],
  );
  // A functional update, so `setDominance` below cannot clobber a name change that landed in the
  // same batch.
  const setName = useCallback((name: string) => setDraft((d) => ({ ...d, name })), []);
  const setColorToken = useCallback(
    (colorToken: string) => setDraft((d) => ({ ...d, colorToken })),
    [],
  );
  const setDominance = useCallback(
    (dominance: number) => setDraft((d) => ({ ...d, dominance })),
    [],
  );
  const setAgingEnabled = useCallback(
    (agingEnabled: boolean) => setDraft((d) => ({ ...d, agingEnabled })),
    [],
  );
  // One updater-style setter for the whole list (Story 4.10, FD8): `<RulesEditor>` passes the
  // pure list helpers (`ruleDraft.ts`), and applying them inside the functional `setDraft` is what
  // keeps two rule mutations in one batch from clobbering each other — the same reason
  // `setDominance` above is functional. An update that hands back the SAME array (the helpers do,
  // for an unknown id) hands back the same draft too: a fresh draft object for a no-op would be the
  // spurious re-render the helpers' same-reference contract exists to avoid.
  const setSurvivalRules = useCallback(
    (update: (rules: readonly RuleDraft[]) => readonly RuleDraft[]) =>
      setDraft((d) => {
        const survivalRules = update(d.survivalRules);
        return survivalRules === d.survivalRules ? d : { ...d, survivalRules };
      }),
    [],
  );
  // The id is minted HERE, outside the updater — React may run an updater twice in development,
  // and an impure one would mint two ids and keep one at random.
  const addRule = useCallback(() => {
    const id = crypto.randomUUID();
    setSurvivalRules((rules) => appendRule(rules, createNewRuleDraft(id)));
  }, [setSurvivalRules]);

  // A STRUCTURAL add — a new rule (`addRule` above) or a new condition row (`<ConditionsEditor>`'s
  // `addCondition`, reached through `setSurvivalRules`) — un-sticks `saveAttempted`, so a control
  // that did not exist at the last refused Save never shows red before the user has typed into it
  // (AC6's "never red on add", extended past the first Save; Story 4.13 FD3). A value edit, a
  // delete, or a reorder leaves it sticky: un-sticking on every edit would re-hide a still-present
  // error, and the trade accepted here is the narrow one — an add hides sibling errors until the
  // next Save. Tracked as one number — every rule plus every rule's conditions — a proxy that is
  // exact for today's single-purpose helpers (only the two adds grow it; a batched delete-plus-add
  // would need an id diff instead). Compared in an effect, not inside `setSurvivalRules`'s
  // updater, because that updater must stay pure. A LAYOUT effect, deliberately: the clear
  // schedules a second, synchronous commit that removes the alert line and the `data-invalid` cue
  // before the browser paints (`<ColorPickerField>`'s collapse idiom); the add's own focus effect
  // runs in between, and the Summary it focuses keeps focus across the clearing commit. From a
  // passive effect the same update is lowered to Default priority and lands a task later —
  // measured in review: the new card mounts with its `role="alert"`, is focused flagged, and
  // clears only on the next macrotask.
  // `handleSave` always sets `saveAttempted` back to `true` on a refusal, so the very next Save
  // re-flags everything, added control included.
  const structuralSize = draft.survivalRules.reduce(
    (sum, rule) => sum + 1 + rule.conditions.length,
    0,
  );
  const prevStructuralSizeRef = useRef(structuralSize);
  useLayoutEffect(() => {
    if (structuralSize > prevStructuralSizeRef.current) setSaveAttempted(false);
    prevStructuralSizeRef.current = structuralSize;
  }, [structuralSize]);

  // Per render, unmemoised: cheap (a name check and a scan of the rows), and the fields recompute
  // the same per-field validators anyway on every keystroke — a `useMemo` keyed on `draft` would
  // hit exactly as often as the draft changes.
  const errors = validateOrganismDraft(draft);

  // Story 4.16, AC1/AC2/AC3/AC5, FD3/FD4/FD7, Task 11: the whole save, hoisted into a function
  // that reports its OUTCOME (the `BattlePage.tsx:750-848` shape, trimmed to this modal's needs)
  // — `handleSave` below stays the fire-and-forget entry point the Save `<Button>` has always
  // called.
  const saveOrganism = useCallback(async (): Promise<void> => {
    // `!open` (review 2026-09-22): the dialog stays mounted and interactive through the ~195 ms
    // exit fade after a CLEAN close (Back/Escape/✕ with nothing in flight), and a Save landing in
    // that window would start a write the close-lock (Task 12) cannot see — one that could resolve
    // after `onExited`, when the hook has nothing ahead to hand the record on to. Refusing here
    // is what makes "no write resolves after the exit" true by construction, not by timing.
    if (savingRef.current || !open) return;
    const first = errors[0];
    // Cleared at the START of every attempt, success or refusal — an identical message
    // re-rendered in place would not re-announce through `role="alert"`/`role="status"` (the
    // Story 2.13 idiom). Never both lines mounted at once.
    setSaveError(null);
    setSaveOutcome(null);
    if (first !== undefined) {
      setSaveAttempted(true);
      setFocusRequest((r) => ({ seq: (r?.seq ?? 0) + 1, target: first.target }));
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    let record: Organism | null = null;
    try {
      // Minted INSIDE `try` (Story 2.16 review lesson): a throw above it would skip the release
      // below and wedge `isSaving`/`savingRef` forever. Reused from `saveStamp` on every attempt
      // AFTER the first successful one in this session (Task 11) — `organisms.save()` upserts by
      // id, so a later Save updates the organism this editor already created instead of minting a
      // sibling.
      const id = saveStamp?.id ?? crypto.randomUUID();
      record = await projectOrganismForSave(draft, id);
      await organisms.save(record);
      // The stamp and the outcome are set BEFORE `finally` releases `savingRef` (review
      // 2026-09-22): the release must never precede the stamp, or a closure still holding
      // `saveStamp === null` would be re-entrant for one tick — React batches all of these into
      // the one commit today, but the ordering should hold by construction, not by batching.
      // The stamp is set on the FIRST success only; every later pass already carries it.
      if (saveStamp === null) setSaveStamp({ id: record.id });
      setSaveOutcome(saveOutcomeMessage(record));
    } catch (error) {
      setSaveError(saveFailureMessage(error, 'organism'));
      record = null;
    } finally {
      // Released on BOTH outcomes (Task 11 supersedes the earlier review's "hold after success"):
      // the dialog no longer unmounts on a successful write, so there is no exit-fade window for a
      // released button to be double-clicked through — a second click after success is a
      // deliberate upsert of the same id, refused only by `savingRef` while THIS write is pending.
      savingRef.current = false;
      setIsSaving(false);
      setSaveSettledSeq((n) => n + 1);
    }
    // OUTSIDE the `try`/`catch`: once `organisms.save()` has resolved the record IS in storage,
    // and a throw from `onSaved`'s own handling must not be reported as "this organism could not
    // be saved". No USER close path can run while a write is in flight (Task 12) and no Save can
    // start during an exit fade (the `!open` guard above), so a write never resolves after the
    // dialog has exited; a route-level unmount of the whole Library mid-write is the one residual
    // (the write still lands; nothing reports it — `deferred-work.md`).
    if (record !== null) {
      onSaved(record);
    }
  }, [errors, draft, organisms, onSaved, saveStamp, open]);

  const handleSave = useCallback(() => {
    void saveOrganism();
  }, [saveOrganism]);

  // Story 4.16, AC3, Task 12 (owner's review decision, 2026-09-22, option (b)): Escape and the
  // backdrop (unreachable under `fullScreen`, kept for documentation) both route through the
  // dialog's `onClose`; the ✕ button calls it directly. One guarded handler, rather than checking
  // `savingRef.current` twice. Back and — since Task 13 (second review's decision, option (b)) —
  // the ✕ are ALSO `disabled={isSaving}`, so the two visible controls show the lock (Back wears
  // `<SidebarFooter>`'s disabled trio, the ✕ MUI's disabled colour); for a click on either the
  // `disabled` attribute is what stops it, and this guard is what remains for Escape and the
  // backdrop, which `disabled` cannot reach. The lock lives HERE, not in the hook: `onClose` itself
  // stays unguarded, so a caller who reaches it by another route (Story 4.23's guard will sit in
  // front of it) inherits this lock only through these controls and Escape.
  const handleRequestClose = useCallback(() => {
    if (savingRef.current) return;
    onClose();
  }, [onClose]);

  // Story 4.16, AC3: focus returns to Save once the write settles, success or failure — while
  // `isSaving` the button is `disabled`, which drops focus to `<body>` (the HTML focus-fixup
  // rule), and the editor is still the user's place. Only when focus is LOOSE (review
  // 2026-09-22, the `<BattlePage>` fullscreen-exit rule): a user who moved into a field during
  // the write — a round-trip against an API repository, not the few ms localStorage takes — keeps
  // the caret. "Loose" here is anything outside the editor's own shell: `<body>`, `null`, or the
  // dialog container MUI's focus trap parks focus on after the fixup blur.
  useEffect(() => {
    if (saveSettledSeq === 0) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body && shellRef.current?.contains(active)) return;
    saveButtonRef.current?.focus();
  }, [saveSettledSeq]);

  // Keyed on `focusRequest`, not `draft`: a keystroke elsewhere must not steal focus, and a
  // repeated first error (the same control invalid across two Saves) still needs a fresh request
  // (`seq`) to re-run this effect. Why an effect and not the click handler: the alert line and the
  // `aria-describedby` that names it mount on the render `saveAttempted` produces, and a `focus()`
  // inside the click handler would run before that render, landing on a control with no
  // description yet. Why no `scrollIntoView`: `focus()` scrolls the nearest scrollable ancestor —
  // the independently-scrolling Rules column (Story 4.4) — on every engine; a second scroll call
  // would fight it.
  useEffect(() => {
    if (focusRequest === null) return;
    shellRef.current?.querySelector<HTMLElement>(errorTargetSelector(focusRequest.target))?.focus();
  }, [focusRequest]);

  return (
    <Dialog
      fullScreen
      open={open}
      // Fires for Escape — and for a backdrop click, which a fullScreen dialog cannot receive
      // (the paper covers the backdrop). Routed through `handleRequestClose` (Task 12), which is a
      // no-op while a write is in flight — `disableEscapeKeyDown` was removed from Modal in MUI v9
      // (`<DeleteBattleDialog>` records the finding), so this guard is the only lock available.
      // Still the one channel Story 4.23's unsaved-changes guard will insert itself in front of.
      onClose={handleRequestClose}
      onTransitionExited={onExited}
      // The parent hook manages focus for every close path. MUI's default restore-to-trigger
      // reads `document.activeElement` at OPEN time, and WebKit does not focus a `<button>` on
      // click, so on that engine alone it faithfully restores focus to `<body>`: "the tab order
      // restarts at the top of the document". Left on, it would also fire from the exit transition
      // and silently overwrite the explicit move.
      disableRestoreFocus
      // The theme borders and rounds EVERY dialog paper (`theme.ts` MuiDialog.paper /
      // MuiPaper.root) — right for a 440px confirmation, wrong for a full-viewport surface, which
      // would otherwise paint a 1px `--gol-border` edge and `--gol-radius` corners against the
      // window. Overridden here at the call site, never in the theme, per that file's own rule.
      slotProps={{ paper: { sx: { border: 'none', borderRadius: 0 } } }}
      aria-labelledby={TITLE_ID}
    >
      <Shell ref={shellRef}>
        <EditorHeader>
          <BackButton
            type="button"
            onClick={onClose}
            disabled={isSaving}
            // Task 12: locked while a write is in flight, the `BattlePage.tsx:1010`
            // `backDisabled={isSaving}` idiom, wearing `<SidebarFooter>`'s disabled trio. This
            // styled button carries no `transition` of its own (only the `:hover`/`:focus-visible`
            // pseudo-classes do), so — unlike Save's MUI `Button` — there is no mid-fade axe trap
            // to override here.
          >
            {/* Decorative glyph; the accessible name must be exactly the label — "left arrow back
                to library" is noise. The house `←`, not the AC's `◄` ASCII stand-in (FD3). */}
            <span aria-hidden="true">←</span> {backLabelFor(origin)}
          </BackButton>
          {/* A module constant, not `useId()`: one editor can exist at a time (it is a modal), so
              a second instance's id collision is not a reachable state. */}
          <Title id={TITLE_ID}>Organism Editor</Title>
          <Actions>
            {/* Story 4.13's gate, Story 4.16's write, Task 11's stay-open amendment: `handleSave`
                runs `validateOrganismDraft` on click. An invalid draft is refused (errors shown,
                focus moved, nothing closed, nothing written); a valid draft writes through
                `organisms.save()` — success publishes the in-flow `SaveOutcomeLine` status and
                keeps the editor open (a later Save upserts the same organism); a rejection
                surfaces as the `SaveErrorLine` alert below. Either way the dialog stays open and
                focus returns to this button once the write settles. `disabled` from the click
                until the write settles, success or failure (AC2, AC3, FD8) — never at rest. */}
            <Button
              type="button"
              variant="contained"
              onClick={handleSave}
              disabled={isSaving}
              sx={SAVE_SX}
              ref={saveButtonRef}
            >
              Save
            </Button>
            {/* Story 4.16, Task 13 (second review decision, owner's option (b), 2026-09-22):
                locked like Back while a write is in flight — the review found the ✕ exactly as
                visible as Back, so a guard-only no-op (Task 12) left a live-looking button that
                silently ignores the click. `disabled={isSaving}` here, plus the FD8
                `transition: 'none'` SAVE_SX already carries: MUI's IconButton root still
                transitions `background-color` on `duration.shortest`, and `color` swaps to the
                `action.disabled` token the instant `disabled` flips, so an axe scan landing
                mid-fade would measure an unsettled state. MUI's own disabled `color` IS the house
                disabled styling here: `theme.ts` pins `action.disabled` to `--gol-action-disabled`
                (`themes.css`: the text-primary channel at 0.3 alpha — visibly dimmer than the
                `--gol-text-primary` the `sx` below sets, which MUI's two-class `&.Mui-disabled`
                rule out-specifies; no test measures the token, and SC 1.4.3 exempts disabled
                controls). Unlike `BackButton`, this control has no border or background of its
                own for that trio to touch. `handleRequestClose`'s guard stays for Escape and the
                backdrop, which `disabled` cannot reach. */}
            <IconButton
              type="button"
              aria-label="Close"
              onClick={handleRequestClose}
              disabled={isSaving}
              sx={{ color: 'var(--gol-text-primary)', transition: 'none' }}
            >
              <span aria-hidden="true">✕</span>
            </IconButton>
          </Actions>
        </EditorHeader>
        {/* Story 4.16, AC3, FD5, Task 11: the in-flow outcome region — always mounted, between the
            header and the body, beside `SaveErrorLine`. The child mounts with the sentence (the
            `ColorPickerField.tsx:380-390` idiom); cleared at the START of every attempt so a
            repeat success re-announces. Never both this and the alert line at once. */}
        <div role="status" data-save-status>
          {saveOutcome !== null && (
            <SaveOutcomeLine data-save-outcome>{saveOutcome}</SaveOutcomeLine>
          )}
        </div>
        {/* Story 4.16, AC5, FD7: a refused write, reported inside the editor beside the untouched
            draft. `role="alert"` (assertive, not `status`): a failed save IS an error, unlike the
            honest-but-not-yet-persisted notice this block replaces. Conditionally mounted and
            cleared at the START of every attempt (`saveOrganism`'s `setSaveError(null)`), so a
            repeat failure re-announces. */}
        {saveError !== null && (
          <SaveErrorLine role="alert" data-save-error>
            {saveError}
          </SaveErrorLine>
        )}
        <EditorBody>
          <OrganismEditorLayout
            basicInfo={
              <>
                <OrganismNameField
                  value={draft.name}
                  onChange={setName}
                  showAllErrors={saveAttempted}
                />
                <ColorPickerField
                  value={draft.colorToken}
                  onChange={setColorToken}
                  usersByToken={usersByToken}
                  seedValue={seed.colorToken}
                />
                <DominanceField value={draft.dominance} onChange={setDominance} />
                <AgingToggleField
                  value={draft.agingEnabled}
                  onChange={setAgingEnabled}
                  colorToken={draft.colorToken}
                />
              </>
            }
            rulesAction={
              <AddRuleButton type="button" onClick={addRule} data-add-rule="header">
                + Add Rule
              </AddRuleButton>
            }
            rules={
              <RulesEditor
                rules={draft.survivalRules}
                organisms={others}
                onRulesChange={setSurvivalRules}
                onAddRule={addRule}
                showAllErrors={saveAttempted}
              />
            }
            preview={
              <PreviewPanel
                colorToken={draft.colorToken}
                agingEnabled={draft.agingEnabled}
                colors={colors}
                survivalRules={draft.survivalRules}
              />
            }
          />
        </EditorBody>
        {/* Story 4.20, AC1: the editor's first footer, on every open, in both create and edit
            sessions (UX-DR6 — "persistent"). It holds the usage indicator and nothing else: Save
            stays in the header and the name stays out of it (FD1). The names are resolved through
            the display helpers (`usageBattleNames` / `referencingOrganismNames`), never raw — an
            `''` name parses for both schemas and would render as an empty `<li>` (FD10). */}
        <EditorFooter>
          <UsageIndicator
            battleNames={usageBattleNames(usageEntries, battleSummaries)}
            ruleCount={ruleCount}
            referencingNames={referencingNames}
          />
        </EditorFooter>
      </Shell>
    </Dialog>
  );
}
