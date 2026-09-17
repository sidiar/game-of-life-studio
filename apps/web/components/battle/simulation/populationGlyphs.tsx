'use client';

import { styled } from '@mui/material/styles';

/**
 * The two glyphs every population reading shares — the colour swatch and the extinction skull —
 * as ONE definition for `<PopulationStats>` (the sidebar rows, Story 3.14) and `<PopulationPills>`
 * (the fullscreen HUD, Story 3.18). Lifted out of `PopulationStats.tsx` by 3.18 (AC8) so that the
 * hollow-when-extinct swatch and the named `☠` `img` are one pattern rather than two copies that
 * drift; `PopulationStats.test.tsx` passing unchanged is the lift's proof.
 *
 * Colour never lives here: the identity shade arrives at the call site as an inline `style`
 * (`background` / `borderColor`) — a resolved runtime VALUE, the `<ColorChip>` precedent — so
 * AR-46's raw-colour lint has nothing to catch, and extinct rows go hollow by passing
 * `transparent` for the background (3.14 FD2: the extinction is carried by the hollow swatch, the
 * skull and a full-contrast text step, never by `opacity`).
 */

// `aria-hidden` at the call site (decorative — the name/count already state what the colour
// would). The hex arrives via inline `style` (background/borderColor); extinct rows go hollow.
export const Swatch = styled('span')({
  width: '10px',
  height: '10px',
  flexShrink: 0,
  border: '1px solid',
});

// Mockup: `.pop-extinct-indicator` (petri-dish-play-mode.html:398-401), minus its `margin-left`:
// spacing is the HOST's (the sidebar row adds the mockup's 5px through `styled(Skull)`; the HUD
// pill spaces by its own `gap`) — a shared glyph that ships one host's margin doubles up in the
// other. Rendered with `role="img" aria-label="extinct"` at the call site — the third extinction
// channel, and the one assistive technology hears.
export const Skull = styled('span')({
  fontSize: '14px',
});
