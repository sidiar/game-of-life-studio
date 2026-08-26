'use client';

import Link from 'next/link';
import { styled } from '@mui/material/styles';

// The one shared visual affordance both Story 2.2 CTAs wear — the Gallery toolbar's persistent
// "+ Create New Battle" (BattleGallery.tsx) and the empty state's first-run "Create Your First
// Battle" (GalleryEmptyState.tsx). Same control, different label and mount point (Task 5); styling
// it once here is what keeps the two from drifting the moment either is themed.
//
// Mockup: .create-button (clinical-lab-theme/battle-gallery.html:127-144); the biotech empty-state
// block reuses the identical class (biotech-terminal-theme/battle-gallery.html:965), which is what
// licenses sharing one control across both mount points rather than styling it twice.
//
// A `styled(Link)` over next/link, not a <button> + onClick handler (forced decision 1): this repo
// has no `useRouter` anywhere, both CTAs are pure navigation to a static route, and a link is
// middle-clickable, right-clickable, and prefetched by the App Router for free — the same pattern
// `BackLink` (components/layout/Notice.tsx) and `TitleLink` (BattleTile.tsx) already use.
//
// Colours are `var(--gol-*)` tokens only (AR-46 no-raw-hex) — `--gol-accent`/`--gol-on-accent` for
// the resting state, `--gol-accent-hover` for the mockup's `#00e5ff` hover (app/themes.css:34).
// Static chrome goes through styled(), not sx (RFC-003 Decision 3).
const CreateBattleLink = styled(Link)({
  display: 'inline-block',
  background: 'var(--gol-accent)',
  color: 'var(--gol-on-accent)',
  border: 'none',
  padding: '14px 28px',
  fontSize: '14px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  textDecoration: 'none',
  cursor: 'pointer',
  // Enumerated rather than the mockup's `all 0.2s`, matching BattleTile's rule and the reason
  // recorded there: with `all`, any property added to this block later starts animating by
  // accident — including a layout-affecting one.
  transition: 'background-color 0.2s, transform 0.2s',
  whiteSpace: 'nowrap',
  '&:hover': {
    background: 'var(--gol-accent-hover)',
    transform: 'translateY(-1px)',
  },
  // Hover-and-focus-visible parity, established by the Story 1.9 review for every new interactive
  // chrome element; BackLink is the shipped example this mirrors.
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  // The hover lift is motion, and this control now appears twice on an empty Gallery. Every other
  // piece of gallery chrome carries this guard (BattleTile's Tile, TileActions and ActionButton);
  // without it a user who asked for no motion still gets the translate.
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': { transform: 'none' },
  },
});

export default CreateBattleLink;
