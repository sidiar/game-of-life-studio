# `components/battle/simulation/` — Run mode

Every component Epic 3 adds for **Run (Play) mode** belongs here. The folder exists before
its first file (2026-09-08) so that Story 3.11 onward writes into it, rather than landing
flat beside the Lab components and being moved afterwards.

The authority on what these components _are_ is
`docs/planning-artifacts/component-tree-battle-page.md` §3.11–3.14. This file only says where
they go, and must not restate their design — two descriptions of one component is how they
drift.

## What goes here

The Run subtree of the spec's §2 tree: `<BattleSimulationView>`, `<SimulationSidebar>` and its
sections (`<PopulationStats>`, `<CycleCounter>`, `<SpeedControl>`), `<SimulationMain>`,
`<SimulationControlBar>`, `<FullscreenStage>` and its two parts, plus `useSimulationHotkeys`.

`useSimulation` is a hook, so it goes to `lib/battle/` with the rest of the editor-and-runtime
hooks — not here. `<BattleSimulationView>` is "the only component that touches the hook" (§3.11).

## What does NOT go here

**Anything both modes render.** `<BattlePage>`, `<BattleHeader>`, `<UnsavedChangesDialog>` and
`<SidebarSection>` stay at `battle/` root. `<BattlePage>` in particular stays mounted across
Lab↔Run (RFC-005 Decision 3) — it is the shared parent, not a Lab component.

**Anything from `battle/` root reached for out of convenience.** The spec gives Run its own
transport bar and its own sidebar sections deliberately; importing `<EditorStatusBar>` or
`<EditorToolsSection>` from here is a design change, not a shortcut. If one genuinely should be
shared, say so and move it to `battle/` root in that story — do not import across the boundary
and leave the folders lying about who owns what.

## Three files that are deliberately unsorted

The Lab side is NOT being extracted into a sibling `editor/` folder yet, because three files
cannot be placed correctly until Epic 3 exists:

- **`SidebarFooter`** — one importer today (`BattleEditorView`), but it is shared by design: the
  spec's tree puts it in BOTH sidebars, and its FR traceability row reads "SidebarFooter Back
  (both modes) | 2, 3" in as many words. Observed imports would file it under `editor/` and Epic
  3 would move it straight back.
- **`SidebarSection`** — same shape. One importer today; the Run sidebar has four sections of
  its own.
- **`GridSettingsSection`** — genuinely undecided. §3.6 scopes it to the Edit-mode preset resize,
  while the Run tree calls for `<GridSizeControl variant="play">`. One component with a variant,
  or two? **Story 3.16** (`play-mode-ephemeral-resize`) decides, and nothing before it can.

When Story 3.16 lands, extract `components/battle/editor/` from what remains — against observed
imports, the way `lib/battle/` and `lib/gallery/` were split (2026-09-08). `tsc` catches every
missed specifier, so that move is verifiable rather than careful.

⚠️ One class it does not catch: `next/dynamic(() => import('./X'))`. `<UnsavedChangesDialog>` and
`<ResizeClipWarningDialog>` are both reached that way, and a rewrite that greps only for
`from '…'` will miss them.
