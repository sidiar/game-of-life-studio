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
sections (`<PopulationStats>`, `<CycleCounter>`, `<SpeedControl>`, `<GridSizeControl>`),
`<SimulationMain>`, `<SimulationControlBar>`, `<FullscreenStage>` and its two parts. `<LadderSlider>`
(Story 3.16 FD1 (a)) is the shared detented-slider primitive `<SpeedControl>` and `<GridSizeControl>`
are both built on — promoted here rather than copied because both callers are Run-mode, so no
`editor/` boundary crosses. Story 3.18 added three more shared Run-mode pieces on the same
reasoning: `<TransportControls>` (the Play/Pause, Next cycle, Stop & reset cluster, rendered by
both `<SimulationControlBar>` and the fullscreen HUD), `<CycleDigits>` (the zero-padded glyph run,
rendered by both `<CycleCounter>` and the HUD) and `<PopulationPills>` (the HUD's compact
population reading — a SIBLING of `<PopulationStats>`, not a variant of it; the two share
`populationGlyphs.tsx`'s swatch and skull, and data, not markup). Story 3.19 added `<HotkeyHints>`
(FD6) — the shared `<kbd>` + arrow recipe both hint lines render, `<SimulationControlBar>`'s and
`<FullscreenStage>`'s, each styling its own copy for size and colour. Story 4.15's preview panel is
the next consumer of `<TransportControls>`, `<CycleDigits>` and `<PopulationPills>` (a third, third
and second caller respectively) — never `<HotkeyHints>`: the preview mounts no hotkey hook (FD8 (a)).
`<SimulationSidebar>` and `<SimulationMain>` are private layout children inside
`BattleSimulationView.tsx` (spec §3.3's rule for their Lab counterparts), not exported components;
so are `<FullscreenTopOverlay>` and `<FullscreenHUD>` inside `FullscreenStage.tsx`.

`<VisuallyHidden>` lives at `components/` root, not here: both `editor/` (`<GridSettingsSection>`)
and `simulation/` (`<PopulationPills>`) render it, and neither folder may import from the other —
a primitive both need belongs above both, the way `<PetriDishCanvas>` does (Story 3.18 FD5 (a)).

`useSimulation` is a hook, so it goes to `lib/battle/` with the rest of the editor-and-runtime
hooks — not here. `<BattleSimulationView>` is "the only component that touches the hook" (§3.11).
`useSimulationHotkeys` (Story 3.19, FD1 (a)) lives there too, beside it — a hook among components
would be the asymmetry this file argues against one paragraph up. `<BattleSimulationView>` is also
its only caller.

## What does NOT go here

**Anything both modes render** — that is `battle/` root's job, not this folder's.
`<BattlePage>` in particular stays mounted across Lab↔Run (RFC-005 Decision 3): it is the shared
parent, not a Lab component and not a Run one.

**Anything from `editor/` reached for out of convenience.** The spec gives Run its own
transport bar and its own sidebar sections deliberately; importing `<EditorStatusBar>` or
`<EditorToolsSection>` from here is a design change, not a shortcut. If one genuinely should be
shared, say so and move it up to `battle/` root in that story — do not import across the
boundary and leave the folders lying about who owns what.

## The sibling folder

`components/battle/editor/` holds the Lab counterparts — `<BattleEditorView>` and the six
components only it renders. The two folders are siblings by design, and `battle/` root means one
thing: **shared across modes**. Five files live there — `<BattlePage>`, `<BattleHeader>`,
`<UnsavedChangesDialog>`, `<SidebarSection>`, `<SidebarFooter>` — and a component arriving at
root is a claim that both modes render it.

`<SidebarFooter>` is the clearest case: its FR traceability row reads "SidebarFooter Back (both
modes) | 2, 3" in as many words, and since Story 3.11 `<BattleSimulationView>` is its second
caller.

`<GridSizeControl>` (§3.12, FR-4.9) lives HERE, shipped by Story 3.16 as specced, and is NOT
`<GridSettingsSection>` under a variant. They share the preset MODEL (`lib/battle/gridPresets.ts`,
tied to the editor's two-preset subset by a compile-time assertion, not an import), not a component
— §3.12's last line says so, and the props differ: `<GridSettingsSection>` takes the edit subset
plus stats and commits undoably, while `<GridSizeControl>` is a detented slider over all four
presets with a `disabled` flag, handed `useSimulation.resizeLive`. Reaching for the edit-mode
component here would have been a design change, not reuse.

## When moving files across the boundary

`tsc` catches every missed specifier, which is what makes a move here verifiable rather than
careful. Two classes it does NOT catch, both live in this subtree:

- **`vi.mock('./path')`** — a bare string, unchecked. `BattlePage.commitSeam.test.tsx` mocks
  `<BattleEditorView>` this way. A missed rewrite stops the mock applying silently.
- **`next/dynamic(() => import('./X'))`** — `<UnsavedChangesDialog>` and
  `<ResizeClipWarningDialog>` are both reached this way.
