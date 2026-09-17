'use client';

import { styled } from '@mui/material/styles';

/**
 * Text for assistive technology only: in the accessibility tree, out of the visible layout.
 * The standard clip-path recipe — a 1px box, `overflow: hidden`, `clipPath: inset(50%)` — rather
 * than `display: none` or `visibility: hidden`, both of which ALSO remove the node from the
 * accessibility tree, which is the opposite of the point.
 *
 * An app-wide primitive at `components/` root (Story 3.18 FD5 (a)), not a `battle/editor/` or
 * `battle/simulation/` module: `<GridSettingsSection>` (Lab) and `<PopulationPills>` (Run) both
 * render it, and neither folder may import from the other (`simulation/README.md`) — a primitive
 * both need belongs above both, the way `<PetriDishCanvas>` does. The alternative, a second copy of
 * the six lines in the Run folder, is exactly the drift that README warns about. It was born as a
 * private `styled('span')` in `GridSettingsSection.tsx` (Story 2.14) and promoted here unchanged.
 */
const VisuallyHidden = styled('span')({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
});

export default VisuallyHidden;
