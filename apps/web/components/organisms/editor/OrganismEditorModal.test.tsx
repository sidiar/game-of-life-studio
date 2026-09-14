import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import OrganismEditorModal, { backLabelFor } from './OrganismEditorModal';

/**
 * Story 4.3's shell contract — the accessible names the rest of Epic 4 (and the e2e) will look the
 * modal up by, and the three close channels routing to ONE callback. The parent-side lifecycle
 * (inert window, focus restore) is `useOrganismEditorModal.test.tsx`'s; the real-browser facts
 * (Tab cycling, contrast, WebKit focus) are `e2e/organisms.spec.ts`'s.
 *
 * ⚠️ MUI `Dialog` portals to `document.body`, so every query goes through `screen`, never the
 * render `container` — a `container.querySelector('[role="dialog"]')` finds nothing and a test
 * written that way passes on `not.toBeInTheDocument()` for the wrong reason.
 */
describe('OrganismEditorModal', () => {
  it('renders a dialog whose accessible name is the level-2 "Organism Editor" heading', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Organism Editor');
    expect(screen.getByRole('heading', { level: 2, name: 'Organism Editor' })).toBeInTheDocument();
  });

  // The prop is the seam Story 4.24/4.25 plug into — both branches are exercised even though only
  // 'library' is reachable from UI today, so that a later regression on 'battle' reddens here and
  // not on the day the battle origin is wired.
  it.each([
    ['library', 'Back to Library'],
    ['battle', 'Back to Battle'],
  ] as const)('labels the back control for origin=%s as "%s"', (origin, label) => {
    render(<OrganismEditorModal open origin={origin} onClose={vi.fn()} />);

    // Exact accessible name: the `←` glyph is aria-hidden and must not leak into it.
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    expect(backLabelFor(origin)).toBe(label);
  });

  it('renders Save as a genuinely disabled button and a Close button', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('routes Back to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrganismEditorModal open origin="library" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Back to Library' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes Close to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrganismEditorModal open origin="library" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes Escape to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrganismEditorModal open origin="library" onClose={onClose} />);

    // MUI's key handler listens on the focused element inside the dialog; the focus trap has
    // already put focus on the dialog container, which is enough.
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // FD4: disabled, not a no-op handler — so there is nothing to spy on. What CAN be asserted is
  // that activating it neither closes the dialog nor errors. `fireEvent`, not `user.click`:
  // user-event REFUSES to click a `pointer-events: none` element (MUI's disabled Button is one),
  // which already proves a real pointer cannot reach it — the raw dispatch below covers the one
  // path that bypasses pointer-events, a synthetic click at the node.
  it('does nothing when Save is activated', () => {
    const onClose = vi.fn();
    render(<OrganismEditorModal open origin="library" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('open={false} renders no dialog at all (MUI unmounts by default)', () => {
    render(<OrganismEditorModal open={false} origin="library" onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no axe violations with the dialog open', async () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    // `document.body`, not the render container: the dialog is portalled, and the scan must see
    // the aria-hidden siblings MUI leaves behind alongside it.
    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });
});
