import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MAX_ORGANISM_NAME_LENGTH, NEW_ORGANISM_DOMINANCE } from '@gol/domain';
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

  // Story 4.4: the body is `<OrganismEditorLayout>`. Its own contract is that component's test;
  // what the shell owes is that the three regions are INSIDE the dialog, in order. The axe test
  // below now scans the columns for free.
  it('renders the three editor columns inside the dialog, in order', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    const regions = within(screen.getByRole('dialog')).getAllByRole('region');
    expect(regions).toHaveLength(3);
    expect(regions[0]).toHaveAccessibleName('Basic Information');
    expect(regions[1]).toHaveAccessibleName('Survival Rules');
    expect(regions[2]).toHaveAccessibleName('Preview & Test');
  });

  // Story 4.5 / 4.6: the name field and the dominance control land in the Basic Information
  // column THROUGH the layout's `basicInfo` slot fragment — addressed by name, so neither can
  // land in another column. Each field's own contract is its own test file's.
  it('mounts the name field and the dominance control in Basic Information and nowhere else (Story 4.5, Story 4.6)', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    const basic = within(dialog).getByRole('region', { name: 'Basic Information' });
    expect(within(basic).getByRole('textbox', { name: 'Organism Name' })).toBeInTheDocument();
    expect(within(basic).getByRole('slider', { name: 'Dominance' })).toBeInTheDocument();
    expect(within(basic).getByRole('textbox', { name: 'Dominance value' })).toBeInTheDocument();
    // "Nowhere else" means the whole dialog — header and footer included — not just the other two
    // regions: exactly two textboxes and one slider exist, and both are the ones above.
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(2);
    expect(within(dialog).getAllByRole('slider')).toHaveLength(1);
  });

  // The draft lives in the MODAL (FD3): typing round-trips through its own state, not a prop.
  it('holds the draft: typing into the name field round-trips through the modal (Story 4.5)', async () => {
    const user = userEvent.setup();
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    const input = screen.getByRole('textbox', { name: 'Organism Name' });
    await user.type(input, 'Glider');

    expect(input).toHaveValue('Glider');
    expect(screen.getByText(`6 / ${MAX_ORGANISM_NAME_LENGTH}`)).toBeInTheDocument();
  });

  // FD2: a fresh editor does not open red.
  it('opens with the name field free of any error (Story 4.5)', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Organism Name' })).not.toBeInvalid();
  });

  // Story 4.6 AC3: a fresh editor opens with both dominance controls at the domain default.
  it('opens the dominance control at NEW_ORGANISM_DOMINANCE on both the slider and the textbox (Story 4.6)', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue(
      String(NEW_ORGANISM_DOMINANCE),
    );
    expect(screen.getByRole('textbox', { name: 'Dominance value' })).toHaveValue(
      String(NEW_ORGANISM_DOMINANCE),
    );
  });

  // A slider change round-trips through the modal's own state — the same draft the name field
  // proves above, now for the sibling field.
  it('holds the draft: a dominance slider change round-trips through the modal (Story 4.6)', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('slider', { name: 'Dominance' }), {
      target: { value: '42' },
    });

    expect(screen.getByRole('textbox', { name: 'Dominance value' })).toHaveValue('42');
    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue('42');
  });

  // And the other direction: typing into the dominance textbox moves the slider live.
  it('holds the draft: typing into the dominance textbox moves the slider (Story 4.6)', async () => {
    const user = userEvent.setup();
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    const input = screen.getByRole('textbox', { name: 'Dominance value' });
    await user.click(input);
    await user.clear(input);
    await user.type(input, '17');

    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue('17');
  });

  // Story 4.6 AC6: the tab order inside Basic Information is name -> slider -> numeric input. The
  // field's own test uses a stand-in button for the name field; this is the real column.
  it('tabs from the name field to the dominance slider, then to its textbox (Story 4.6)', async () => {
    const user = userEvent.setup();
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} />);

    screen.getByRole('textbox', { name: 'Organism Name' }).focus();
    await user.tab();
    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Dominance value' })).toHaveFocus();
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
