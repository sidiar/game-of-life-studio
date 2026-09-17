'use client';

import { useCallback, useState } from 'react';
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
import { createNewOrganismDraft, type OrganismDraft } from '@/lib/organisms/organismDraft';
import { usersByColorToken } from '@/lib/organisms/colorReuse';

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
   * EVERY render for the reuse warning (Story 4.9); 4.11 the organism-type dropdown, 4.17 excludes
   * the organism under edit. The seed is taken from whatever the caller had loaded at open time
   * (FD9).
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

/**
 * The Organism Editor's full-screen shell (Story 4.3): the `Dialog`, its header and a body that is
 * `<OrganismEditorLayout>`'s three columns (Story 4.4). Holds the editor's draft (`OrganismDraft`,
 * RFC-005 Decision 1 — ephemeral UI state, local to the modal; Story 4.5's `name`, Story 4.6's
 * `dominance`, Story 4.7's `agingEnabled`/`colorToken` and Story 4.8's `colorToken` seed from
 * `library`) and its seed — no repository call; the lifecycle (inert window, focus restore)
 * stays `useOrganismEditorModal`'s, and a fresh draft per open is the `mounted` gate's doing
 * (`<OrganismLibrary>` unmounts this modal after every exit, so there is no reset effect and no
 * `key` trick). The `useState` initialiser closes over the `library` prop — legitimate because it
 * runs once per mount and the `mounted` gate guarantees a mount per open. The editor's own dirty
 * scope (AR-33 — independent of the battle's) arrives with Story 4.23, will live in this shell,
 * and will diff this draft against its seed.
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
  // Per render, unmemoised: `library` is the caller's unmemoised `sorted` (a `useMemo` keyed on it
  // would never hit), and the scan is 0.02–0.04 ms at 1,000 organisms (Story 3.7's `library-filter`
  // bench). Story 4.17 passes the library MINUS the organism under edit.
  const usersByToken = usersByColorToken(library);
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
      <Shell>
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
            {/* Inert until Story 4.16 wires persistence; genuinely `disabled`, not a no-op,
                because a control that looks live and does nothing is the worse lie (NFR-4.1). axe
                exempts disabled controls from `color-contrast`, and MUI's own Button transition is
                harmless here because this button never changes state — the name's validity
                (Story 4.5) does NOT toggle it; the story that enables it must re-read
                `EditorStatusBar.tsx`'s UNDO/SAVE transition notes before adding any state flip. */}
            <Button type="button" variant="contained" disabled sx={BUTTON_SX}>
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
        <EditorBody>
          <OrganismEditorLayout
            basicInfo={
              <>
                <OrganismNameField value={draft.name} onChange={setName} />
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
          />
        </EditorBody>
      </Shell>
    </Dialog>
  );
}
