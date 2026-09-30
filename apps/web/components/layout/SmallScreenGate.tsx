'use client';

import { useId, type ReactNode } from 'react';
import { styled } from '@mui/material/styles';
import {
  MIN_USABLE_HEIGHT_PX,
  MIN_USABLE_WIDTH_PX,
  ROTATE_HINT_QUERY,
  SMALL_SCREEN_QUERY,
  useSmallScreenDismissal,
  useSmallScreenGated,
} from '@/lib/layout/smallScreen';
import { NoticeButton, NoticeText, NoticeTitle } from './Notice';

// `display: contents` so wrapping a subtree adds no box: the battle chassis measures its own box
// for the auto-fit canvas (Story 2.4) and the editor's Shell is `height: 100%` of the dialog paper,
// and both would be silently re-parented by a real wrapper. `inert` is a DOM-tree attribute, so it
// still reaches every descendant.
const Content = styled('div')({ display: 'contents' });

// Hidden unless the viewport is below NFR-3.1's floor — decided in CSS, not from
// `useSmallScreenGated`, because the static HTML is served before any script runs and a phone must
// not paint the broken layout first. `position: fixed` covers the page on the battle route and the
// full-screen dialog paper in the editor alike (the Dialog's Fade animates opacity only, so the
// paper never becomes a containing block for it). Below MUI's modal layer (1300): an editor opened
// over a gated battle carries its own gate.
const Panel = styled('section')({
  display: 'none',
  position: 'fixed',
  inset: 0,
  zIndex: 1250,
  overflowY: 'auto',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
  gap: '16px',
  padding: '30px 24px',
  background: 'var(--gol-bg-primary)',
  [`@media ${SMALL_SCREEN_QUERY}`]: { display: 'flex' },
});

const RotateHint = styled(NoticeText)({
  display: 'none',
  [`@media ${ROTATE_HINT_QUERY}`]: { display: 'block' },
});

const Actions = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
});

export interface SmallScreenGateProps {
  /** The way back to a screen that works at any size — a link or a button, styled as a Notice way out. */
  exit: ReactNode;
  children: ReactNode;
}

/**
 * Covers a surface that is unusable below NFR-3.1's floor (`MIN_USABLE_WIDTH_PX` ×
 * `MIN_USABLE_HEIGHT_PX`) with an explanation, a way back, and "Continue anyway" — the viewer's
 * call, remembered for the tab (`useSmallScreenDismissal`). The content stays MOUNTED behind the
 * panel, never unmounted: a desktop window narrowed mid-edit must get its battle or draft back
 * intact when it widens again.
 */
export default function SmallScreenGate({ exit, children }: SmallScreenGateProps) {
  const titleId = useId();
  const gated = useSmallScreenGated();
  const [dismissed, dismiss] = useSmallScreenDismissal();

  return (
    <>
      <Content inert={gated}>{children}</Content>
      {!dismissed && (
        <Panel aria-labelledby={titleId} data-small-screen-gate="">
          {/* h2, not the Notice's h1: on the battle route `<BattleHeader>` owns the document's sole
            h1, and it is still in the DOM behind this panel. */}
          <NoticeTitle as="h2" id={titleId}>
            This screen needs more room
          </NoticeTitle>
          <NoticeText>
            Editing and running battles, and designing organisms, need a screen at least{' '}
            {MIN_USABLE_WIDTH_PX} × {MIN_USABLE_HEIGHT_PX} pixels. Game of Life Studio is built for
            desktops and tablets.
          </NoticeText>
          <RotateHint>Turning your device sideways will give it enough room.</RotateHint>
          <Actions>
            {exit}
            <NoticeButton type="button" onClick={dismiss}>
              Continue anyway
            </NoticeButton>
          </Actions>
        </Panel>
      )}
    </>
  );
}
