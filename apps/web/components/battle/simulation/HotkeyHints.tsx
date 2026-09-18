'use client';

import { Fragment } from 'react';
import { styled } from '@mui/material/styles';
import VisuallyHidden from '@/components/VisuallyHidden';

/**
 * Story 3.19 (FD6): the shared `<kbd>` + separator recipe, one implementation for both hint
 * lines — the chassis bar's `Shortcuts: Space Play/Pause • → Next • Esc Stop` and the fullscreen
 * stage's `Press F to exit fullscreen • Esc Stop & exit • Space Play/Pause • → Next` (the `Esc`
 * entry is FD4 (c)'s, the owner's 2026-09-18 addition to the mockup's three). Named beside
 * `<TransportControls>` / `<CycleDigits>` / `<PopulationPills>` in `simulation/README.md` — the
 * `<CycleDigits>` shape: unstyled beyond `kbd { font-family: inherit; font-weight: 600 }`, each
 * host wraps it in its own styled block for size and colour.
 *
 * Presentational and total — no hook, no state, no `sim` (this route's `<SidebarFooter>` shape).
 */

export interface HotkeyHintsProps {
  /**
   * Forwarded to the root `<span>` — the `styled(HotkeyHints)` seam both hosts use
   * (`SimulationControlBar.tsx` / `FullscreenStage.tsx`) to size and colour their own copy; MUI's
   * `styled()` HOC passes a generated class name through this prop and expects the wrapped
   * component to apply it to its own root node.
   */
  readonly className?: string;
  /** Leading text before the first entry, e.g. `Shortcuts: ` or `Press `. */
  readonly lead?: string;
  readonly entries: readonly {
    /** DOM text is sentence case (`Space`, `Esc`, `F`); the host's CSS uppercases it (trap 15). */
    readonly key: string;
    readonly label: string;
    /**
     * True for the `→` entry: the glyph is `aria-hidden` and a `<VisuallyHidden>Right arrow</VisuallyHidden>`
     * sibling carries the spoken name — `<kbd>` has the `generic` role, and an author-assigned
     * `aria-label` on a generic is prohibited (trap 14), so the name has to live in real text.
     */
    readonly arrow?: boolean;
  }[];
}

// The only styling this file owns (the `<CycleDigits>` shape) — hosts size and colour the rest.
const Hint = styled('span')({
  '& kbd': {
    fontFamily: 'inherit',
    fontWeight: 600,
  },
});

export default function HotkeyHints({ className, lead, entries }: HotkeyHintsProps) {
  return (
    <Hint className={className}>
      {lead}
      {entries.map((entry, index) => (
        <Fragment key={`${entry.label}-${index}`}>
          {/* A bullet read aloud between every pair is noise — the separator carries no name. The
              spaces stay OUTSIDE the hidden span: inline runs concatenate without a word break in
              the accessibility tree, so with them inside, `Play/Pause` would run straight into the
              arrow's `Right arrow`. */}
          {index > 0 && (
            <>
              {' '}
              <span aria-hidden="true">•</span>{' '}
            </>
          )}
          <kbd>
            {entry.arrow === true ? (
              <>
                <span aria-hidden="true">{entry.key}</span>
                <VisuallyHidden>Right arrow</VisuallyHidden>
              </>
            ) : (
              entry.key
            )}
          </kbd>{' '}
          {entry.label}
        </Fragment>
      ))}
    </Hint>
  );
}
