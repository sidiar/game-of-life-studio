'use client';

import type { ReactNode } from 'react';
import { styled } from '@mui/material/styles';

/**
 * The editor body's three columns (Story 4.4, UX-DR5): Basic Information / Survival Rules /
 * Preview & Test, in that DOM order at every width. Mockup:
 * `clinical-lab-theme/organism-editor.html:66-77` (`.left-sidebar`), `:113-119` (`.rules-column`),
 * `:122-129` (`.preview-column`), `:137-149` (`.section-title` / `.section-description`), and the
 * three `<h3>`s at `:909, 993, 1196` whose copy the region names are.
 *
 * Forced decisions, recorded in the story file:
 * - FD1: the Rules column is `flex: 1; max-width: 800px` per the mockup — the AC's "~500–600px" is
 *   what it measures at the 1400px boundary, not a cap.
 * - FD2: every column is its own scroll container; "stay put" means no SHARED scroll, because the
 *   Basic Information column's coming content (~700px) does not fit a 720px viewport.
 * - FD3: below 1024px Basic Information and Rules stack inside ONE scroll region (`MainGroup`, a
 *   real wrapper, never `display: contents`) — two nested regions would leave the rules no height.
 * - FD4: tiers are CSS media queries inside `styled()`, never `useMediaQuery` or conditional
 *   rendering — the DOM is identical at every width (SC 1.3.2) and no layout knowledge reaches
 *   React state (RFC-005 Decision 1's three state categories have no slot for a viewport tier).
 * - FD5: plain elements in `styled()` + `--gol-*` tokens, no MUI `Grid`/`Stack`/`Box` — RFC-003
 *   Decision 3 puts static chrome in `styled()`, and MUI's own breakpoints match none of UX-DR5's.
 *
 * 1024px is NFR-3.1's supported floor, so the fold tier is a degradation path, not a layout.
 * The preview slot is where the isolated simulation subtree (M3) mounts in Story 4.14/4.15.
 */

/** Viewport widths (CSS px) below which the editor body changes tier (UX-DR5). */
export const EDITOR_BREAKPOINTS = { compress: 1400, fold: 1024 } as const;

// `-0.02` (the Bootstrap convention), not `-1`: fractional CSS-px viewports exist under browser
// zoom, and a `1399px` cutoff would leave the (1399, 1400) band on the FULL tier — the wider
// layout below the documented breakpoint. Level-4 range syntax (`width < 1400px`) needs Safari
// 16.4+, and NFR-2.1's floor is 15.5.
const COMPRESS = `@media (max-width: ${EDITOR_BREAKPOINTS.compress - 0.02}px)`;
const FOLD = `@media (max-width: ${EDITOR_BREAKPOINTS.fold - 0.02}px)`;

// Module constants, not `useId()`: one editor exists at a time (it is a modal), the same reasoning
// as the shell's `TITLE_ID`.
const BASIC_ID = 'organism-editor-basic-info';
const RULES_ID = 'organism-editor-rules';
const PREVIEW_ID = 'organism-editor-preview';

export interface OrganismEditorLayoutProps {
  /** Column 1 content — Story 4.5 (name), 4.6, 4.7, 4.8/4.9 mount here. */
  basicInfo?: ReactNode;
  /** Column 2 content — Story 4.10 (rule cards / empty state) mounts here. */
  rules?: ReactNode;
  /** Column 3 content — Story 4.14/4.15 (preview grid + isolated simulation, M3). */
  preview?: ReactNode;
}

// The row. `minWidth: 0` / `minHeight: 0` are load-bearing because a flex item's `min-*` defaults
// to `auto`, its CONTENT size (`BattleEditorView.tsx`'s `MainContent` records both halves):
// without `minWidth: 0` the row refuses to shrink below its content's width and pushes a sibling
// off-screen; without `minHeight: 0` it grows to its content's height instead of being bounded by
// `<EditorBody>`, and no column's own `overflow-y: auto` ever engages.
const Root = styled('div')({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
});

// Basic Information + Rules. A row at ≥ 1024 — visually identical to the two being `Root`'s direct
// children — and under FOLD a column that is the single scroll region for the stacked pair (FD3).
// The same `min-*: 0` pair for the same reason as on `Root`: this is one more flex level the
// definite-height chain has to pass through before it reaches a column's scroll container.
const MainGroup = styled('div')({
  display: 'flex',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  [FOLD]: {
    flexDirection: 'column',
    overflowY: 'auto',
  },
});

// Mockup: `.left-sidebar` (`:66-77`). The mockup's `padding-bottom: 0` and `.sidebar-content`
// inner scroller exist for a sticky `.sidebar-footer` this editor does not have (Story 4.3 put
// Back in the header), so the column itself is the scroll container and the padding is uniform.
const BasicInfoColumn = styled('section')({
  width: '320px',
  flexShrink: 0,
  background: 'var(--gol-bg-secondary)',
  borderRight: '1px solid var(--gol-border)',
  padding: '25px',
  overflowY: 'auto',
  minHeight: 0,
  [COMPRESS]: {
    width: '280px',
  },
  // Stacked over Rules: the pair's separator moves from the right edge to the bottom, and the
  // wrapper scrolls instead of the column. `flex: 0 0 auto` (the same as Rules below), NOT
  // `flexShrink: 1`: `MainGroup` is a flex COLUMN here, so shrink acts on HEIGHT, and with
  // `minHeight: 0` inherited from the row tier a shrinkable column collapses toward 0px and its
  // now-visible overflow paints over Rules before the wrapper ever scrolls (review, 2026-09-14).
  [FOLD]: {
    width: 'auto',
    flex: '0 0 auto',
    overflow: 'visible',
    borderRight: 'none',
    borderBottom: '1px solid var(--gol-border)',
  },
});

// Mockup: `.rules-column` (`:113-119`). Background is `--gol-bg-primary` by inheritance from the
// shell. At exactly 1400px this measures 1400 − 320 − 400 = 680px outer (the AC's "~500–600px"
// inside its padding); above that the 800px cap and `margin: 0 auto` keep rule cards from
// stretching across a wide monitor (FD1).
const RulesColumn = styled('section')({
  flex: 1,
  minWidth: 0,
  maxWidth: '800px',
  margin: '0 auto',
  padding: '30px',
  overflowY: 'auto',
  minHeight: 0,
  [FOLD]: {
    maxWidth: 'none',
    margin: 0,
    overflow: 'visible',
    flex: '0 0 auto',
  },
});

// Mockup: `.preview-column` (`:122-129`). No FOLD rule — 350px stays; the design doc's "Preview
// grid smaller (250px)" is the canvas, Story 4.14's.
const PreviewColumn = styled('section')({
  width: '400px',
  flexShrink: 0,
  background: 'var(--gol-bg-secondary)',
  borderLeft: '1px solid var(--gol-border)',
  padding: '30px',
  overflowY: 'auto',
  minHeight: 0,
  [COMPRESS]: {
    width: '350px',
  },
});

// Mockup: `.section-title` (`:137-142`), as the `<h3>` it is there — under the dialog's `<h2>`, so
// the heading order stays `<h2>` → `<h3>` × 3. Sentence case, no `textTransform`: this is not a
// `<SidebarSection>` title and must not borrow its 13px-uppercase treatment.
const ColumnTitle = styled('h3')({
  fontSize: '16px',
  fontWeight: 600,
  color: 'var(--gol-text-primary)',
  letterSpacing: 'var(--gol-letter-spacing-title)',
  margin: '0 0 6px 0',
});

// Mockup: `.section-description` (`:145-149`). `--gol-text-secondary` on `--gol-bg-secondary` is a
// validated pair (`clinical-lab-contrast-validation.md`); on `--gol-bg-primary` it is the pair the
// Library's count badge already passes axe with.
const ColumnDescription = styled('p')({
  fontSize: '12px',
  color: 'var(--gol-text-secondary)',
  margin: '0 0 20px 0',
  lineHeight: 1.6,
});

/**
 * Three named optional slots, no `children` (FD6): the destination is explicit at the call site,
 * so Story 4.5 cannot land in the wrong column. An omitted slot renders nothing after the heading
 * pair — no placeholder, no "coming soon" (NFR-4.1). The component holds no state; the tier is CSS.
 */
export default function OrganismEditorLayout({
  basicInfo,
  rules,
  preview,
}: OrganismEditorLayoutProps) {
  return (
    <Root>
      <MainGroup>
        <BasicInfoColumn aria-labelledby={BASIC_ID}>
          <ColumnTitle id={BASIC_ID}>Basic Information</ColumnTitle>
          <ColumnDescription>Define organism properties and appearance</ColumnDescription>
          {basicInfo}
        </BasicInfoColumn>
        <RulesColumn aria-labelledby={RULES_ID}>
          <ColumnTitle id={RULES_ID}>Survival Rules</ColumnTitle>
          <ColumnDescription>Define when cells are born, survive, or die</ColumnDescription>
          {rules}
        </RulesColumn>
      </MainGroup>
      <PreviewColumn aria-labelledby={PREVIEW_ID}>
        <ColumnTitle id={PREVIEW_ID}>Preview &amp; Test</ColumnTitle>
        <ColumnDescription>Test organism behavior in isolation</ColumnDescription>
        {preview}
      </PreviewColumn>
    </Root>
  );
}
