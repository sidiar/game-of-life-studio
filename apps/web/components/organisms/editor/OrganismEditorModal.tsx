'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import type { Organism } from '@gol/domain';
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
import {
  createNewOrganismDraft,
  validateOrganismDraft,
  type DraftErrorTarget,
  type OrganismDraft,
} from '@/lib/organisms/organismDraft';
import { usersByColorToken } from '@/lib/organisms/colorReuse';
import { appendRule, createNewRuleDraft, type RuleDraft } from '@/lib/organisms/ruleDraft';
import { readGridColors } from '@/lib/canvas/themeColors';

// Per-component imports only (AR-35) — `import { Dialog } from '@mui/material'` pulls the whole
// barrel. On this route that is not merely a convention: `<OrganismLibrary>` reaches this file
// through `next/dynamic` rather than a static import, precisely so the MUI `Dialog` stack stays
// out of `/organisms`'s first load. See that call site for the measurement.

const TITLE_ID = 'organism-editor-title';

// Pulled out of the theme's MuiButton root override for the same reason the three shipped dialogs
// record: on `root` they apply to every size, collapsing size="small"/"large" into medium.
const BUTTON_SX = { fontSize: '13px', padding: '12px 24px' } as const;

export type OrganismEditorOrigin = 'library' | 'battle';

/** The lifecycle half — what `useOrganismEditorModal` assembles and nothing more. */
export interface OrganismEditorLifecycleProps {
  open: boolean;
  /** Drives the contextual back label (UX-DR5). 'battle' is Story 4.24's entry point. */
  origin: OrganismEditorOrigin;
  /** Close ✕, the back label and Escape all route here. Story 4.23 guards it. */
  onClose(): void;
  /**
   * Fired once the exit transition has finished — the parent hook's cue to release `inert` and
   * restore focus (the `<UnsavedChangesDialog>` contract).
   */
  onExited?(): void;
}

export interface OrganismEditorModalProps extends OrganismEditorLifecycleProps {
  /**
   * The loaded library — an entity list, never a repository (AR-2/AR-27: this modal still calls
   * nothing that persists). Read ONCE, at mount, for the M6 default-colour seed (Story 4.8) and on
   * EVERY render for the reuse warning (Story 4.9) and the organism-type dropdown (Story 4.11);
   * Story 4.17 excludes the organism under edit. The seed is taken from whatever the caller had
   * loaded at open time (FD9).
   */
  library: readonly Organism[];
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
  '&:hover': {
    background: 'var(--gol-bg-hover)',
    borderColor: 'var(--gol-text-secondary)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
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

// Story 4.13, AC8: the `<SaveErrorLine>` placement idiom (`BattleEditorView.tsx:376-400`) minus
// the danger colour — this is not an error, it is the honest transitional "nothing persisted yet"
// notice. Deleted, along with its one caller, by Story 4.16 (FD1).
const SaveNotice = styled('p')({
  margin: 0,
  padding: '10px 30px',
  fontSize: '12px',
  lineHeight: 1.5,
  color: 'var(--gol-text-secondary)',
  background: 'var(--gol-bg-primary)',
  borderBottom: '1px solid var(--gol-border)',
});

/** Story 4.16 deletes this string along with `SaveNotice`, `noticeRequested` and the modal tests
 * that pin it. */
export const SAVE_UNAVAILABLE_NOTICE =
  'Valid organism — saving to the library is not available yet.';

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
 * resolved here. No footer is built: it is Story 4.20's surface (FR-1.7's usage indicator).
 *
 * The `'battle'` origin (M5 — the editor opens as a modal over the mounted battle, never a route)
 * changes only the back label; Story 4.24 is its first caller. Reached from the Library via the
 * "+ Create New Organism" control (FR-1.2).
 *
 * Story 4.13's gate (`validateOrganismDraft`, `saveAttempted`, focus-to-first-invalid): Save now
 * runs `validateOrganismDraft(draft)`; an invalid draft flips `saveAttempted` (sticky across value
 * edits, deletes and reorders; cleared only by a structural add — a new rule or a new condition
 * row — in the synchronous commit that follows the add, FD3) and focuses the first error's control;
 * a valid draft shows the transitional `SaveNotice` (AC8, FD1) — Story 4.16 replaces that branch
 * with the repository write, the close and the toast. (Story 4.13) (UX-DR14) (UX-DR17)
 * (Story 4.14) (Story 4.15)
 */
export default function OrganismEditorModal({
  open,
  origin,
  onClose,
  onExited,
  library,
}: OrganismEditorModalProps) {
  // The lazy-initialiser form, so the factory runs once per mount, not once per render — reading
  // `library` exactly once, at mount, for the M6 default-colour seed (FD9). One typed object that
  // grows a field per story (FD3), never one `useState` per field.
  //
  // The seed is held, not recomputed: it is what Story 4.23 diffs the draft against (the factory's
  // own contract — "the draft is diffed against its seed"), and it is what makes the FR-2.3 rule
  // "the default never warns" a token comparison rather than a flag (Story 4.9, FD2). Story 4.17
  // replaces this ONE initialiser with the record.
  const [seed] = useState<OrganismDraft>(() =>
    createNewOrganismDraft(library.map((organism) => organism.colorToken)),
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
  const [noticeRequested, setNoticeRequested] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  // Per render, unmemoised: `library` is the caller's unmemoised `sorted` (a `useMemo` keyed on it
  // would never hit), and the scan is 0.02–0.04 ms at 1,000 organisms (Story 3.7's `library-filter`
  // bench). Story 4.17 passes the library MINUS the organism under edit.
  const usersByToken = usersByColorToken(library);
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
  const noticeVisible = noticeRequested && errors.length === 0;

  const handleSave = useCallback(() => {
    const first = errors[0];
    if (first === undefined) {
      setNoticeRequested(true); // FD1 — honest, transitional; Story 4.16 replaces this branch
      return; // with the write, the close and the toast
    }
    setNoticeRequested(false);
    setSaveAttempted(true);
    setFocusRequest((r) => ({ seq: (r?.seq ?? 0) + 1, target: first.target }));
  }, [errors]);

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
      // (the paper covers the backdrop). It is the SINGLE close channel, the same one the two
      // header buttons call directly, and the one Story 4.23's unsaved-changes guard will insert
      // itself in front of. `disableEscapeKeyDown` was removed from Modal in MUI v9
      // (`<DeleteBattleDialog>` records the finding) — there is no prop-level alternative.
      onClose={onClose}
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
          <BackButton type="button" onClick={onClose}>
            {/* Decorative glyph; the accessible name must be exactly the label — "left arrow back
                to library" is noise. The house `←`, not the AC's `◄` ASCII stand-in (FD3). */}
            <span aria-hidden="true">←</span> {backLabelFor(origin)}
          </BackButton>
          {/* A module constant, not `useId()`: one editor can exist at a time (it is a modal), so
              a second instance's id collision is not a reachable state. */}
          <Title id={TITLE_ID}>Organism Editor</Title>
          <Actions>
            {/* Story 4.13: Save is now the gate — `handleSave` above runs `validateOrganismDraft`
                on click. An invalid draft is refused (errors shown, focus moved, nothing closed);
                a valid draft shows the transitional `SaveNotice` below (FD1) — nothing here
                persists yet (Story 4.16 lands the repository write, the close and the toast in
                this branch, replacing the notice). The button never flips `disabled` at runtime
                any more, so the 4.3 deferred cross-fade note (`:793-799`) does not bite here: that
                edge was between BUILDS (disabled vs. not), never between states of a live
                control. */}
            <Button type="button" variant="contained" onClick={handleSave} sx={BUTTON_SX}>
              Save
            </Button>
            <IconButton
              type="button"
              aria-label="Close"
              onClick={onClose}
              sx={{ color: 'var(--gol-text-primary)' }}
            >
              <span aria-hidden="true">✕</span>
            </IconButton>
          </Actions>
        </EditorHeader>
        {/* Story 4.13, AC8: honest and transitional — announces on appearance (conditionally
            mounted, `role="status"`, never `alert`: not an error, must not interrupt). Derived
            from `errors.length`, not a flag frozen at Save time — a stale "valid" over a draft
            the user has since broken would be the lie this line exists to avoid. Story 4.16
            deletes this block along with `noticeRequested` and `SAVE_UNAVAILABLE_NOTICE`. */}
        {noticeVisible && (
          <SaveNotice role="status" data-save-notice>
            {SAVE_UNAVAILABLE_NOTICE}
          </SaveNotice>
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
                organisms={library}
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
      </Shell>
    </Dialog>
  );
}
