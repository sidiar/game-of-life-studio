/**
 * Resolves --gol-* theme tokens to concrete colour strings a canvas fillStyle can consume
 * (Story 1.11 Task 1).
 */
import type { GridRendererColors } from './gridRenderer';

// ⚠️ ctx.fillStyle = 'var(--gol-bg-primary)' is a SILENT no-op: Canvas2D parses a CSS <color>,
// not a var() reference, and an unparseable assignment leaves the previous fillStyle in place.
// Every cell would paint in whatever colour was last set. The caller must substitute — which is
// exactly why GridRenderer takes injected colour strings (Story 1.8 forced decision 1) instead
// of reading the theme itself.
//
// ❌ Do not call this per tile. getComputedStyle forces a style recalculation; at NFR-7.2's 50
// tiles that is 50 forced recalcs on one commit. Call it once in BattleGallery, memoised, and
// pass the result down.
export function readGridColors(root: HTMLElement): GridRendererColors | null {
  const style = getComputedStyle(root);
  // The computed value of a custom property is substituted, so --gol-grid-line comes back as
  // "rgb(51 51 51 / 0.3)" — a string Canvas2D accepts — not the literal
  // "rgb(var(--gol-border-channel) / 0.3)". It arrives with leading/trailing whitespace; trim it.
  const background = style.getPropertyValue('--gol-bg-primary').trim();
  const gridLine = style.getPropertyValue('--gol-grid-line').trim();

  // null, never a hard-coded fallback: a literal here would be an AR-46 violation *and* would
  // silently paint the wrong theme. The caller renders no thumbnail rather than a wrong one.
  // Reachable in jsdom (themes.css is never loaded there) and in any future root that loses the
  // token layer (Next's GlobalError, an unrecognised theme name — see themes.css's header).
  if (background === '' || gridLine === '') return null;

  return { background, gridLine };
}
